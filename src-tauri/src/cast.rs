//! Chromecast: discovery (mDNS `_googlecast._tcp`) and the Cast v2 sender protocol with the default
//! media receiver. The web player owns the queue; this loads one URL at a time and reports the
//! receiver's state (`cast-status`) so the player can move on when a track finishes.
//!
//! Cast v2 is small: a TLS connection to port 8009, frames of `u32 big-endian length + CastMessage`
//! (a six-field protobuf) and JSON payloads on a few namespaces. Written here on rustls (ring)
//! instead of a Cast crate, which would pull aws-lc into every platform build.
//!
//! The device fetches the stream itself, so the URL must be reachable from the network (public
//! CDN links are; this machine's loopback media proxy is not).

use mdns_sd::{ServiceDaemon, ServiceEvent};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerifier, ServerCertVerified};
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, ClientConnection, DigitallySignedStruct, SignatureScheme, StreamOwned};
use serde_json::{json, Value};
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const NS_CONNECTION: &str = "urn:x-cast:com.google.cast.tp.connection";
const NS_HEARTBEAT: &str = "urn:x-cast:com.google.cast.tp.heartbeat";
const NS_RECEIVER: &str = "urn:x-cast:com.google.cast.receiver";
const NS_MEDIA: &str = "urn:x-cast:com.google.cast.media";
const DEFAULT_RECEIVER: &str = "CC1AD845";
const SENDER: &str = "sender-0";
const PLATFORM: &str = "receiver-0";

/* ───────── CastMessage (protobuf, six fields) ───────── */

fn put_varint(out: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
        out.push((v as u8 & 0x7f) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

fn put_str(out: &mut Vec<u8>, field: u32, s: &str) {
    put_varint(out, ((field << 3) | 2) as u64);
    put_varint(out, s.len() as u64);
    out.extend_from_slice(s.as_bytes());
}

/// protocol_version = 0 (CASTV2_1_0), payload_type = 0 (STRING).
pub fn encode(source: &str, destination: &str, namespace: &str, payload: &str) -> Vec<u8> {
    let mut m = Vec::with_capacity(payload.len() + 96);
    put_varint(&mut m, 1 << 3); // field 1, varint
    put_varint(&mut m, 0);
    put_str(&mut m, 2, source);
    put_str(&mut m, 3, destination);
    put_str(&mut m, 4, namespace);
    put_varint(&mut m, 5 << 3); // field 5, varint
    put_varint(&mut m, 0);
    put_str(&mut m, 6, payload);
    let mut framed = Vec::with_capacity(m.len() + 4);
    framed.extend_from_slice(&(m.len() as u32).to_be_bytes());
    framed.extend_from_slice(&m);
    framed
}

#[derive(Debug, PartialEq)]
pub struct Message {
    pub source: String,
    pub destination: String,
    pub namespace: String,
    pub payload: String,
}

fn read_varint(b: &[u8], i: &mut usize) -> Option<u64> {
    let mut v = 0u64;
    let mut shift = 0;
    while *i < b.len() {
        let byte = b[*i];
        *i += 1;
        v |= ((byte & 0x7f) as u64) << shift;
        if byte & 0x80 == 0 {
            return Some(v);
        }
        shift += 7;
        if shift > 63 {
            return None;
        }
    }
    None
}

pub fn decode(b: &[u8]) -> Option<Message> {
    let (mut source, mut destination, mut namespace, mut payload) = (String::new(), String::new(), String::new(), String::new());
    let mut i = 0;
    while i < b.len() {
        let tag = read_varint(b, &mut i)?;
        let (field, wire) = ((tag >> 3) as u32, (tag & 7) as u8);
        match wire {
            0 => {
                read_varint(b, &mut i)?;
            }
            2 => {
                let len = read_varint(b, &mut i)? as usize;
                let end = i.checked_add(len).filter(|&e| e <= b.len())?;
                let s = String::from_utf8_lossy(&b[i..end]).into_owned();
                i = end;
                match field {
                    2 => source = s,
                    3 => destination = s,
                    4 => namespace = s,
                    6 => payload = s,
                    _ => {}
                }
            }
            _ => return None,
        }
    }
    Some(Message { source, destination, namespace, payload })
}

/* ───────── TLS: a Chromecast presents a self-signed certificate ───────── */

#[derive(Debug)]
struct AnyCert;

impl ServerCertVerifier for AnyCert {
    fn verify_server_cert(&self, _: &CertificateDer<'_>, _: &[CertificateDer<'_>], _: &ServerName<'_>, _: &[u8], _: UnixTime) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }
    fn verify_tls12_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn verify_tls13_signature(&self, _: &[u8], _: &CertificateDer<'_>, _: &DigitallySignedStruct) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }
    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::ED25519,
        ]
    }
}

type Tls = StreamOwned<ClientConnection, TcpStream>;

fn connect_tls(host: &str, port: u16) -> Result<Tls, String> {
    let addr = (host, port).to_socket_addrs().map_err(|e| e.to_string())?.next().ok_or("no address")?;
    let tcp = TcpStream::connect_timeout(&addr, Duration::from_secs(6)).map_err(|e| e.to_string())?;
    let _ = tcp.set_nodelay(true);
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| e.to_string())?
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AnyCert))
        .with_no_client_auth();
    let name = ServerName::try_from(host.to_string()).or_else(|_| ServerName::try_from("chromecast.local".to_string())).map_err(|e| e.to_string())?;
    let conn = ClientConnection::new(Arc::new(config), name).map_err(|e| e.to_string())?;
    let mut tls = StreamOwned::new(conn, tcp);
    // Finish the handshake now so connect failures surface here.
    tls.get_ref().set_read_timeout(Some(Duration::from_secs(6))).ok();
    while tls.conn.is_handshaking() {
        tls.conn.complete_io(&mut tls.sock).map_err(|e| e.to_string())?;
    }
    tls.get_ref().set_read_timeout(Some(Duration::from_millis(150))).ok();
    Ok(tls)
}

/* ───────── Session ───────── */

#[derive(Clone, serde::Deserialize)]
pub struct LoadArgs {
    url: String,
    mime: String,
    title: String,
    artist: String,
    artwork: Option<String>,
    duration: Option<f64>,
    position: Option<f64>,
    autoplay: bool,
}

enum Cmd {
    Load(LoadArgs),
    Play(bool),
    Seek(f64),
    Volume(f64),
    Close,
}

struct Session {
    tx: Sender<Cmd>,
    alive: AtomicBool,
}

fn slot() -> &'static Mutex<Option<Arc<Session>>> {
    static S: OnceLock<Mutex<Option<Arc<Session>>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn send(cmd: Cmd) -> Result<(), String> {
    let s = slot().lock().map_err(|e| e.to_string())?.clone().ok_or("not connected")?;
    s.tx.send(cmd).map_err(|_| "connection closed".to_string())
}

struct Io {
    tls: Tls,
    buf: Vec<u8>,
    request: u64,
    /// The app's transport and session ids once the receiver app runs.
    app: Option<(String, String)>,
    media_session: Option<i64>,
    launching: bool,
    pending: Option<LoadArgs>,
}

impl Io {
    fn write(&mut self, dst: &str, ns: &str, payload: Value) -> Result<(), String> {
        let frame = encode(SENDER, dst, ns, &payload.to_string());
        self.tls.write_all(&frame).and_then(|_| self.tls.flush()).map_err(|e| e.to_string())
    }

    fn rid(&mut self) -> u64 {
        self.request += 1;
        self.request
    }

    /// Next complete frame, or None when the read timed out.
    fn read(&mut self) -> Result<Option<Message>, String> {
        loop {
            if self.buf.len() >= 4 {
                let len = u32::from_be_bytes([self.buf[0], self.buf[1], self.buf[2], self.buf[3]]) as usize;
                if len > 4 << 20 {
                    return Err("frame too large".into());
                }
                if self.buf.len() >= 4 + len {
                    let m = decode(&self.buf[4..4 + len]);
                    self.buf.drain(..4 + len);
                    if let Some(m) = m {
                        return Ok(Some(m));
                    }
                    continue;
                }
            }
            let mut chunk = [0u8; 8192];
            match self.tls.read(&mut chunk) {
                Ok(0) => return Err("closed".into()),
                Ok(n) => self.buf.extend_from_slice(&chunk[..n]),
                Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => return Ok(None),
                Err(e) => return Err(e.to_string()),
            }
        }
    }

    fn launch(&mut self) -> Result<(), String> {
        let id = self.rid();
        self.launching = true;
        self.write(PLATFORM, NS_RECEIVER, json!({ "type": "LAUNCH", "appId": DEFAULT_RECEIVER, "requestId": id }))
    }

    fn load(&mut self, a: &LoadArgs) -> Result<(), String> {
        let Some((transport, session)) = self.app.clone() else { return Ok(()) };
        let id = self.rid();
        let mut metadata = json!({ "metadataType": 3, "title": a.title, "artist": a.artist });
        if let Some(art) = &a.artwork {
            metadata["images"] = json!([{ "url": art }]);
        }
        let mut media = json!({ "contentId": a.url, "streamType": "BUFFERED", "contentType": a.mime, "metadata": metadata });
        if let Some(d) = a.duration {
            media["duration"] = json!(d);
        }
        self.media_session = None;
        self.write(
            &transport,
            NS_MEDIA,
            json!({ "type": "LOAD", "requestId": id, "sessionId": session, "media": media, "autoplay": a.autoplay, "currentTime": a.position.unwrap_or(0.0) }),
        )
    }

    fn media_cmd(&mut self, typ: &str, extra: Value) -> Result<(), String> {
        let (Some((transport, _)), Some(ms)) = (self.app.clone(), self.media_session) else { return Ok(()) };
        let id = self.rid();
        let mut p = json!({ "type": typ, "requestId": id, "mediaSessionId": ms });
        if let (Some(obj), Some(e)) = (p.as_object_mut(), extra.as_object()) {
            obj.extend(e.clone());
        }
        self.write(&transport, NS_MEDIA, p)
    }

    fn handle(&mut self, app: &AppHandle, m: Message) -> Result<(), String> {
        let v: Value = serde_json::from_str(&m.payload).unwrap_or(Value::Null);
        match (m.namespace.as_str(), v["type"].as_str().unwrap_or("")) {
            (NS_HEARTBEAT, "PING") => self.write(&m.source, NS_HEARTBEAT, json!({ "type": "PONG" }))?,
            (NS_CONNECTION, "CLOSE") => return Err("closed by the receiver".into()),
            (NS_RECEIVER, "RECEIVER_STATUS") => {
                let app_info = v["status"]["applications"].as_array().and_then(|a| a.iter().find(|x| x["appId"] == DEFAULT_RECEIVER).cloned());
                match app_info {
                    Some(a) if self.app.is_none() => {
                        let transport = a["transportId"].as_str().unwrap_or_default().to_string();
                        let session = a["sessionId"].as_str().unwrap_or_default().to_string();
                        self.write(&transport, NS_CONNECTION, json!({ "type": "CONNECT" }))?;
                        self.app = Some((transport, session));
                        self.launching = false;
                        if let Some(p) = self.pending.take() {
                            self.load(&p)?;
                        }
                    }
                    None if self.app.is_some() => {
                        // The app was closed on the TV / by another sender.
                        self.app = None;
                        self.media_session = None;
                        let _ = app.emit("cast-status", json!({ "state": "idle", "position": 0.0, "idleReason": "cancelled" }));
                    }
                    _ => {}
                }
            }
            (NS_MEDIA, "MEDIA_STATUS") => {
                if let Some(e) = v["status"].as_array().and_then(|a| a.first()) {
                    self.media_session = e["mediaSessionId"].as_i64().or(self.media_session);
                    let _ = app.emit(
                        "cast-status",
                        json!({
                            "state": e["playerState"].as_str().unwrap_or("IDLE").to_lowercase(),
                            "position": e["currentTime"].as_f64().unwrap_or(0.0),
                            "duration": e["media"]["duration"].as_f64(),
                            "idleReason": e["idleReason"].as_str().map(|s| s.to_lowercase()),
                        }),
                    );
                }
            }
            (NS_MEDIA, "LOAD_FAILED" | "INVALID_REQUEST" | "LOAD_CANCELLED") => {
                let reason = if m.payload.contains("LOAD_CANCELLED") { "interrupted" } else { "error" };
                let _ = app.emit("cast-status", json!({ "state": "idle", "position": 0.0, "idleReason": reason }));
            }
            _ => {}
        }
        Ok(())
    }
}

fn io_loop(app: AppHandle, session: Arc<Session>, mut io: Io, rx: Receiver<Cmd>) {
    let mut last_ping = Instant::now();
    let result: Result<(), String> = (|| {
        io.write(PLATFORM, NS_CONNECTION, json!({ "type": "CONNECT" }))?;
        let id = io.rid();
        io.write(PLATFORM, NS_RECEIVER, json!({ "type": "GET_STATUS", "requestId": id }))?;
        while session.alive.load(Ordering::Relaxed) {
            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    Cmd::Close => return Ok(()),
                    Cmd::Load(a) => {
                        if io.app.is_some() {
                            io.load(&a)?;
                        } else {
                            io.pending = Some(a);
                            if !io.launching {
                                io.launch()?;
                            }
                        }
                    }
                    Cmd::Play(on) => io.media_cmd(if on { "PLAY" } else { "PAUSE" }, json!({}))?,
                    Cmd::Seek(t) => io.media_cmd("SEEK", json!({ "currentTime": t }))?,
                    Cmd::Volume(v) => {
                        let id = io.rid();
                        io.write(PLATFORM, NS_RECEIVER, json!({ "type": "SET_VOLUME", "requestId": id, "volume": { "level": v } }))?;
                    }
                }
            }
            if last_ping.elapsed() > Duration::from_secs(5) {
                io.write(PLATFORM, NS_HEARTBEAT, json!({ "type": "PING" }))?;
                last_ping = Instant::now();
            }
            if let Some(m) = io.read()? {
                io.handle(&app, m)?;
            }
        }
        Ok(())
    })();
    if let Err(e) = result {
        log::debug!("cast: {e}");
    }
    // Leave the receiver app so the TV does not keep a stale player.
    if let Some((_, sid)) = io.app.clone() {
        let id = io.rid();
        let _ = io.write(PLATFORM, NS_RECEIVER, json!({ "type": "STOP", "requestId": id, "sessionId": sid }));
    }
    session.alive.store(false, Ordering::Relaxed);
    if let Ok(mut s) = slot().lock() {
        if s.as_ref().is_some_and(|x| Arc::ptr_eq(x, &session)) {
            *s = None;
        }
    }
    let _ = app.emit("cast-closed", ());
}

/* ───────── Commands ───────── */

#[derive(Clone, serde::Serialize)]
pub struct Found {
    id: String,
    name: String,
    host: String,
    port: u16,
    model: String,
}

/// Chromecasts on the local network (a few seconds of mDNS listening).
#[tauri::command]
pub async fn cast_discover() -> Result<Vec<Found>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let rx = daemon.browse("_googlecast._tcp.local.").map_err(|e| e.to_string())?;
        let mut out: Vec<Found> = Vec::new();
        let end = Instant::now() + Duration::from_millis(3500);
        while let Some(left) = end.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(left) {
                Ok(ServiceEvent::ServiceResolved(info)) => {
                    let host = info.get_addresses_v4().into_iter().next().map(|a| a.to_string()).or_else(|| info.get_addresses().iter().next().map(|a| a.to_string()));
                    let Some(host) = host else { continue };
                    let id = info.get_property_val_str("id").unwrap_or_default().to_string();
                    let name = info.get_property_val_str("fn").unwrap_or(info.get_fullname()).to_string();
                    let model = info.get_property_val_str("md").unwrap_or_default().to_string();
                    let id = if id.is_empty() { host.clone() } else { id };
                    if out.iter().any(|f| f.id == id) {
                        continue;
                    }
                    out.push(Found { id, name, host, port: info.get_port(), model });
                }
                Ok(_) => {}
                Err(_) => break,
            }
        }
        let _ = daemon.shutdown();
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn cast_connect(app: AppHandle, host: String, port: u16) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        cast_disconnect();
        let tls = connect_tls(&host, port)?;
        let (tx, rx) = channel();
        let session = Arc::new(Session { tx, alive: AtomicBool::new(true) });
        *slot().lock().map_err(|e| e.to_string())? = Some(Arc::clone(&session));
        let io = Io { tls, buf: Vec::new(), request: 0, app: None, media_session: None, launching: false, pending: None };
        std::thread::spawn(move || io_loop(app, session, io, rx));
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn cast_disconnect() {
    if let Ok(mut s) = slot().lock() {
        if let Some(old) = s.take() {
            let _ = old.tx.send(Cmd::Close);
        }
    }
}

#[tauri::command]
pub fn cast_load(args: LoadArgs) -> Result<(), String> {
    send(Cmd::Load(args))
}

#[tauri::command]
pub fn cast_play(on: bool) -> Result<(), String> {
    send(Cmd::Play(on))
}

#[tauri::command]
pub fn cast_seek(position: f64) -> Result<(), String> {
    send(Cmd::Seek(position))
}

#[tauri::command]
pub fn cast_volume(volume: f64) -> Result<(), String> {
    send(Cmd::Volume(volume.clamp(0.0, 1.0)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_round_trip() {
        let framed = encode("sender-0", "receiver-0", NS_RECEIVER, r#"{"type":"GET_STATUS","requestId":1}"#);
        let len = u32::from_be_bytes([framed[0], framed[1], framed[2], framed[3]]) as usize;
        assert_eq!(len, framed.len() - 4);
        let m = decode(&framed[4..]).unwrap();
        assert_eq!(m.source, "sender-0");
        assert_eq!(m.destination, "receiver-0");
        assert_eq!(m.namespace, NS_RECEIVER);
        assert!(m.payload.contains("GET_STATUS"));
    }

    #[test]
    fn long_payloads_use_multi_byte_lengths() {
        let big = "x".repeat(70_000);
        let framed = encode("a", "b", NS_MEDIA, &big);
        let m = decode(&framed[4..]).unwrap();
        assert_eq!(m.payload.len(), 70_000);
    }

    #[test]
    fn garbage_does_not_panic() {
        assert!(decode(&[0xff, 0xff, 0xff]).is_none());
        assert!(decode(&[0x12, 0x40, 0x41]).is_none()); // length points past the end
        let _ = decode(&[]);
    }

    /// The wire bytes of a known CastMessage (checked against the protobuf definition by hand):
    /// version=0, source "a", destination "b", namespace "n", STRING payload "p".
    #[test]
    fn known_bytes() {
        let framed = encode("a", "b", "n", "p");
        assert_eq!(&framed[4..], &[0x08, 0x00, 0x12, 1, b'a', 0x1a, 1, b'b', 0x22, 1, b'n', 0x28, 0x00, 0x32, 1, b'p']);
    }
}

#[cfg(test)]
mod live {
    /// `cargo test --lib cast::live -- --ignored --nocapture`: lists the Chromecasts on this network.
    #[test]
    #[ignore]
    fn discover() {
        use super::*;
        let daemon = ServiceDaemon::new().unwrap();
        let rx = daemon.browse("_googlecast._tcp.local.").unwrap();
        let end = Instant::now() + Duration::from_secs(5);
        let mut n = 0;
        while let Some(left) = end.checked_duration_since(Instant::now()) {
            if let Ok(ServiceEvent::ServiceResolved(i)) = rx.recv_timeout(left) {
                n += 1;
                println!("CAST {} {:?} {}", i.get_property_val_str("fn").unwrap_or("?"), i.get_addresses(), i.get_port());
            }
        }
        println!("found {n}");
    }
}
