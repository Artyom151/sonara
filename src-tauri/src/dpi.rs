//! Built-in DPI bypass ("Обход блокировок"), in the spirit of zapret / ByeDPI, for the app's own
//! traffic only: no driver, no root, no system VPN.
//!
//! A local HTTP CONNECT proxy on 127.0.0.1. For each tunnel it looks at the first bytes the client
//! sends (the TLS ClientHello) and, per service, sends them in a way that keyword-matching DPI
//! fails to reassemble, while the server still receives the exact same handshake:
//!  - `tlsrec=POS`  split the TLS record into two records at POS (the handshake bytes are unchanged,
//!                  only the record framing, so the TLS transcript stays valid);
//!  - `split=POS`   send the bytes in two TCP segments, cut at POS;
//!  - `disorder`    send the first segment with TTL 1 (it dies at the first router; the kernel
//!                  retransmits it later with the normal TTL, so the server gets it out of order);
//!  - `delay=MS`    pause between segments.
//! POS is a byte offset (`3`) or relative to the SNI host name (`sni`, `sni+2`, `sni-1`).
//! Content-changing tricks (SNI case, fake packets with a wrong checksum) are deliberately left out:
//! they would break the handshake or need raw sockets.
//! Users (src/platform/dpi.ts) pick a preset or write their own strategy per service.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream, ToSocketAddrs};
use std::sync::{OnceLock, RwLock};
use std::thread;
use std::time::Duration;

#[derive(Clone, Debug, Default, PartialEq)]
pub enum Pos {
    #[default]
    None,
    Abs(usize),
    /// Offset from the first byte of the SNI host name.
    Sni(isize),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Strategy {
    pub tlsrec: Pos,
    pub split: Pos,
    pub disorder: bool,
    pub delay_ms: u64,
}

impl Strategy {
    /// "tlsrec=sni+1,split=sni+3,disorder,delay=5"
    pub fn parse(s: &str) -> Result<Self, String> {
        let mut out = Strategy::default();
        for part in s.split([',', ' ']).map(str::trim).filter(|p| !p.is_empty()) {
            let (k, v) = part.split_once('=').unwrap_or((part, ""));
            match k {
                "tlsrec" => out.tlsrec = parse_pos(v)?,
                "split" => out.split = parse_pos(v)?,
                "disorder" => {
                    out.disorder = true;
                    if !v.is_empty() {
                        out.split = parse_pos(v)?;
                    }
                }
                "delay" => out.delay_ms = v.parse().map_err(|_| format!("bad delay: {v}"))?,
                _ => return Err(format!("unknown option: {k}")),
            }
        }
        if out.disorder && out.split == Pos::None {
            out.split = Pos::Sni(1);
        }
        Ok(out)
    }
}

fn parse_pos(v: &str) -> Result<Pos, String> {
    if let Some(rest) = v.strip_prefix("sni") {
        if rest.is_empty() {
            return Ok(Pos::Sni(0));
        }
        return rest.parse::<isize>().map(Pos::Sni).map_err(|_| format!("bad position: {v}"));
    }
    v.parse::<usize>().map(Pos::Abs).map_err(|_| format!("bad position: {v}"))
}

/// Offset of the SNI host name inside a TLS ClientHello record, if any.
pub fn sni_offset(buf: &[u8]) -> Option<(usize, usize)> {
    // record: type(1)=0x16 version(2) len(2); handshake: type(1)=1 len(3)
    if buf.len() < 9 || buf[0] != 0x16 || buf[5] != 0x01 {
        return None;
    }
    let mut p = 9 + 2 + 32; // client version + random
    let sid = *buf.get(p)? as usize;
    p += 1 + sid;
    let cs = u16::from_be_bytes([*buf.get(p)?, *buf.get(p + 1)?]) as usize;
    p += 2 + cs;
    let comp = *buf.get(p)? as usize;
    p += 1 + comp;
    let ext_len = u16::from_be_bytes([*buf.get(p)?, *buf.get(p + 1)?]) as usize;
    p += 2;
    let end = (p + ext_len).min(buf.len());
    while p + 4 <= end {
        let ty = u16::from_be_bytes([buf[p], buf[p + 1]]);
        let len = u16::from_be_bytes([buf[p + 2], buf[p + 3]]) as usize;
        if ty == 0 {
            // server_name: list len(2) type(1) name len(2) name
            let q = p + 4;
            let name_len = u16::from_be_bytes([*buf.get(q + 3)?, *buf.get(q + 4)?]) as usize;
            let start = q + 5;
            return (start + name_len <= buf.len()).then_some((start, name_len));
        }
        p += 4 + len;
    }
    None
}

fn resolve(pos: &Pos, sni: Option<(usize, usize)>, len: usize) -> Option<usize> {
    let at = match pos {
        Pos::None => return None,
        Pos::Abs(n) => *n as isize,
        Pos::Sni(d) => sni.map(|(s, _)| s as isize + d)?,
    };
    (at > 0 && (at as usize) < len).then_some(at as usize)
}

/// The bytes to send and where to cut them into TCP segments.
pub fn plan(first: &[u8], st: &Strategy) -> (Vec<u8>, Option<usize>) {
    let sni = sni_offset(first);
    let mut data = first.to_vec();
    let mut shift_after = usize::MAX; // positions >= this moved by 5 (the second record header)
    if let Some(at) = resolve(&st.tlsrec, sni, first.len()) {
        let rec_len = u16::from_be_bytes([first[3], first[4]]) as usize;
        // Only when the whole record is in this chunk and the cut falls inside its payload.
        if at > 5 && 5 + rec_len <= first.len() && at < 5 + rec_len {
            let payload = &first[5..5 + rec_len];
            let cut = at - 5;
            let mut out = Vec::with_capacity(first.len() + 5);
            out.extend_from_slice(&[0x16, first[1], first[2]]);
            out.extend_from_slice(&(cut as u16).to_be_bytes());
            out.extend_from_slice(&payload[..cut]);
            out.extend_from_slice(&[0x16, first[1], first[2]]);
            out.extend_from_slice(&((rec_len - cut) as u16).to_be_bytes());
            out.extend_from_slice(&payload[cut..]);
            out.extend_from_slice(&first[5 + rec_len..]);
            data = out;
            shift_after = at;
        }
    }
    let split = resolve(&st.split, sni, first.len()).map(|p| if p >= shift_after { p + 5 } else { p });
    let split = split.filter(|&p| p < data.len());
    (data, split)
}

#[derive(Clone, Debug)]
pub struct Rule {
    /// Host suffixes ("googlevideo.com" matches "rr1---sn-x.googlevideo.com").
    pub hosts: Vec<String>,
    pub strategy: Strategy,
}

struct State {
    enabled: bool,
    rules: Vec<Rule>,
}

static STATE: OnceLock<RwLock<State>> = OnceLock::new();
static PORT: OnceLock<u16> = OnceLock::new();

fn state() -> &'static RwLock<State> {
    STATE.get_or_init(|| RwLock::new(State { enabled: false, rules: Vec::new() }))
}

fn strategy_for(host: &str) -> Option<Strategy> {
    let s = state().read().ok()?;
    if !s.enabled {
        return None;
    }
    let host = host.to_ascii_lowercase();
    s.rules
        .iter()
        .find(|r| r.hosts.iter().any(|h| host == *h || host.ends_with(&format!(".{h}"))))
        .map(|r| r.strategy.clone())
}

/// Port of the running proxy, when the bypass is on.
pub fn active_port() -> Option<u16> {
    let on = state().read().map(|s| s.enabled).unwrap_or(false);
    if on {
        PORT.get().copied()
    } else {
        None
    }
}

fn pipe(mut from: TcpStream, mut to: TcpStream) {
    let mut buf = [0u8; 32 * 1024];
    loop {
        match from.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if to.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        }
    }
    let _ = to.shutdown(Shutdown::Write);
}

fn send_desync(up: &mut TcpStream, first: &[u8], st: &Strategy) -> std::io::Result<()> {
    let (data, split) = plan(first, st);
    let _ = up.set_nodelay(true);
    let Some(at) = split else {
        return up.write_all(&data);
    };
    let ttl = up.ttl().unwrap_or(64);
    if st.disorder {
        let _ = up.set_ttl(1);
    }
    up.write_all(&data[..at])?;
    up.flush()?;
    if st.disorder {
        // Let the short-lived segment leave before the TTL is restored for the rest.
        thread::sleep(Duration::from_millis(st.delay_ms.max(3)));
        let _ = up.set_ttl(ttl);
    } else if st.delay_ms > 0 {
        thread::sleep(Duration::from_millis(st.delay_ms));
    }
    up.write_all(&data[at..])
}

fn handle(mut client: TcpStream) -> std::io::Result<()> {
    // Read the request head (CONNECT host:port HTTP/1.1 ... \r\n\r\n).
    let mut head = Vec::with_capacity(1024);
    let mut byte = [0u8; 1];
    while !head.ends_with(b"\r\n\r\n") {
        if client.read(&mut byte)? == 0 || head.len() > 16 * 1024 {
            return Ok(());
        }
        head.push(byte[0]);
    }
    let line = String::from_utf8_lossy(&head);
    let mut it = line.split_whitespace();
    let (method, target) = (it.next().unwrap_or(""), it.next().unwrap_or(""));
    if method != "CONNECT" {
        client.write_all(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")?;
        return Ok(());
    }
    let host = target.rsplit_once(':').map(|(h, _)| h).unwrap_or(target).trim_matches(['[', ']']).to_string();
    let addr = target.to_socket_addrs()?.next().ok_or_else(|| std::io::Error::other("no address"))?;
    let mut up = match TcpStream::connect_timeout(&addr, Duration::from_secs(10)) {
        Ok(s) => s,
        Err(e) => {
            client.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")?;
            return Err(e);
        }
    };
    client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")?;

    // First client bytes: the TLS ClientHello (one record; read until it is complete).
    let mut first = vec![0u8; 16 * 1024];
    let mut n = client.read(&mut first)?;
    if n >= 5 && first[0] == 0x16 {
        let want = 5 + u16::from_be_bytes([first[3], first[4]]) as usize;
        let _ = client.set_read_timeout(Some(Duration::from_millis(300)));
        while n < want.min(first.len()) {
            match client.read(&mut first[n..]) {
                Ok(0) | Err(_) => break,
                Ok(k) => n += k,
            }
        }
        let _ = client.set_read_timeout(None);
    }
    first.truncate(n);
    match strategy_for(&host) {
        Some(st) => send_desync(&mut up, &first, &st)?,
        None => up.write_all(&first)?,
    }

    let (c2, u2) = (client.try_clone()?, up.try_clone()?);
    let t = thread::spawn(move || pipe(c2, up));
    pipe(u2, client);
    let _ = t.join();
    Ok(())
}

fn start() -> u16 {
    *PORT.get_or_init(|| {
        let listener = match TcpListener::bind("127.0.0.1:0") {
            Ok(l) => l,
            Err(e) => {
                log::warn!("dpi proxy: {e}");
                return 0;
            }
        };
        let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
        thread::spawn(move || {
            for conn in listener.incoming().flatten() {
                thread::spawn(move || {
                    if let Err(e) = handle(conn) {
                        log::debug!("dpi tunnel: {e}");
                    }
                });
            }
        });
        port
    })
}

#[derive(serde::Deserialize)]
pub struct RuleIn {
    hosts: Vec<String>,
    strategy: String,
}

/// Turn the bypass on/off and set the per-service strategies. Returns the proxy URL when on.
#[tauri::command]
pub fn dpi_configure(enabled: bool, rules: Vec<RuleIn>) -> Result<Option<String>, String> {
    let mut parsed = Vec::new();
    for r in rules {
        let strategy = Strategy::parse(&r.strategy).map_err(|e| format!("{}: {e}", r.hosts.first().cloned().unwrap_or_default()))?;
        parsed.push(Rule { hosts: r.hosts.into_iter().map(|h| h.to_ascii_lowercase()).collect(), strategy });
    }
    let port = if enabled { start() } else { 0 };
    if let Ok(mut s) = state().write() {
        s.enabled = enabled && port != 0;
        s.rules = parsed;
    }
    Ok(active_port().map(|p| format!("http://127.0.0.1:{p}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Minimal ClientHello for "www.youtube.com".
    fn hello(host: &str) -> Vec<u8> {
        let name = host.as_bytes();
        let mut sni = vec![0x00, 0x00];
        let list_len = (3 + name.len()) as u16;
        sni.extend_from_slice(&(list_len + 2).to_be_bytes());
        sni.extend_from_slice(&list_len.to_be_bytes());
        sni.push(0);
        sni.extend_from_slice(&(name.len() as u16).to_be_bytes());
        sni.extend_from_slice(name);
        let mut body = vec![0x03, 0x03];
        body.extend_from_slice(&[7u8; 32]);
        body.push(0); // session id
        body.extend_from_slice(&[0x00, 0x02, 0x13, 0x01]); // cipher suites
        body.extend_from_slice(&[0x01, 0x00]); // compression
        body.extend_from_slice(&(sni.len() as u16).to_be_bytes());
        body.extend_from_slice(&sni);
        let mut hs = vec![0x01, 0, (body.len() >> 8) as u8, body.len() as u8];
        hs.extend_from_slice(&body);
        let mut rec = vec![0x16, 0x03, 0x01];
        rec.extend_from_slice(&(hs.len() as u16).to_be_bytes());
        rec.extend_from_slice(&hs);
        rec
    }

    #[test]
    fn finds_sni() {
        let h = hello("www.youtube.com");
        let (at, len) = sni_offset(&h).unwrap();
        assert_eq!(&h[at..at + len], b"www.youtube.com");
    }

    #[test]
    fn parses_strategies() {
        let s = Strategy::parse("tlsrec=sni+1, split=sni+3, delay=5").unwrap();
        assert_eq!(s.tlsrec, Pos::Sni(1));
        assert_eq!(s.split, Pos::Sni(3));
        assert_eq!(s.delay_ms, 5);
        assert_eq!(Strategy::parse("disorder").unwrap().split, Pos::Sni(1));
        assert!(Strategy::parse("fake").is_err());
    }

    #[test]
    fn record_split_keeps_the_handshake_bytes() {
        let h = hello("rr1---sn-abc.googlevideo.com");
        let st = Strategy::parse("tlsrec=sni+4,split=sni+8").unwrap();
        let (data, split) = plan(&h, &st);
        assert_eq!(data.len(), h.len() + 5);
        // Joining the two records' payloads gives the original handshake message.
        let l1 = u16::from_be_bytes([data[3], data[4]]) as usize;
        let r2 = 5 + l1;
        let l2 = u16::from_be_bytes([data[r2 + 3], data[r2 + 4]]) as usize;
        let mut joined = data[5..5 + l1].to_vec();
        joined.extend_from_slice(&data[r2 + 5..r2 + 5 + l2]);
        assert_eq!(joined, h[5..]);
        // The host name no longer appears in one piece in either record or TCP segment.
        let (sni_at, _) = sni_offset(&h).unwrap();
        assert_eq!(split, Some(sni_at + 8 + 5));
        let needle = b"googlevideo";
        let at = split.unwrap();
        assert!(!data[..at].windows(needle.len()).any(|w| w == needle) || !data[at..].windows(needle.len()).any(|w| w == needle));
    }

    #[test]
    fn proxies_a_tunnel_end_to_end() {
        // Upstream echo server.
        let up = TcpListener::bind("127.0.0.1:0").unwrap();
        let up_addr = up.local_addr().unwrap();
        thread::spawn(move || {
            let (mut s, _) = up.accept().unwrap();
            let mut buf = vec![0u8; 4096];
            let mut got = Vec::new();
            s.set_read_timeout(Some(Duration::from_millis(500))).unwrap();
            while let Ok(n) = s.read(&mut buf) {
                if n == 0 {
                    break;
                }
                got.extend_from_slice(&buf[..n]);
            }
            s.write_all(&got).unwrap();
        });
        dpi_configure(true, vec![RuleIn { hosts: vec!["127.0.0.1".into()], strategy: "tlsrec=sni+2,split=sni+5,delay=2".into() }]).unwrap();
        let port = active_port().unwrap();
        let mut c = TcpStream::connect(("127.0.0.1", port)).unwrap();
        write!(c, "CONNECT {up_addr} HTTP/1.1\r\nHost: {up_addr}\r\n\r\n").unwrap();
        let mut resp = [0u8; 39];
        c.read_exact(&mut resp).unwrap();
        assert!(resp.starts_with(b"HTTP/1.1 200"));
        let h = hello("www.youtube.com");
        c.write_all(&h).unwrap();
        c.shutdown(Shutdown::Write).unwrap();
        let mut back = Vec::new();
        c.read_to_end(&mut back).unwrap();
        // Upstream received the record-split hello: same handshake, one extra record header.
        assert_eq!(back.len(), h.len() + 5);
        dpi_configure(false, vec![]).unwrap();
    }
}

#[cfg(test)]
mod live {
    /// Keeps a proxy running for manual checks: `SONARA_DPI="tlsrec=sni+1" cargo test --lib dpi::live -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn hold_proxy() {
        let st = std::env::var("SONARA_DPI").unwrap_or_else(|_| "tlsrec=sni+1".into());
        let url = super::dpi_configure(true, vec![super::RuleIn { hosts: vec!["com".into(), "net".into(), "ru".into()], strategy: st }]).unwrap().unwrap();
        println!("PROXY {url}");
        std::thread::sleep(std::time::Duration::from_secs(120));
    }
}
