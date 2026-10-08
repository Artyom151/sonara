//! Local media proxy for YouTube audio (desktop).
//!
//! googlevideo URLs cannot be handed to the webview: WebKitGTK's GStreamer source never starts
//! on them, and moving megabytes through the Tauri HTTP plugin (JSON over IPC) freezes the page.
//! The player instead plays `http://127.0.0.1:<port>/<token>?u=<googlevideo url>`; this thread
//! forwards the request (with Range) and streams the body straight back.
//! Only googlevideo hosts are proxied and a random per-launch token is required.

use std::io::Read;
use std::sync::OnceLock;
use std::thread;

// MWEB client identity (the stream URLs are issued to it, see core/youtube.ts).
const UA: &str = "Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)";

static INFO: OnceLock<(u16, String)> = OnceLock::new();

fn random_token() -> String {
    let mut buf = [0u8; 16];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let _ = f.read_exact(&mut buf);
    } else {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        buf.copy_from_slice(&t.to_le_bytes());
    }
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            b'+' => out.push(b' '),
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn allowed(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else { return false };
    let host = rest.split(['/', '?']).next().unwrap_or("");
    host.ends_with(".googlevideo.com")
}

/// googlevideo answers bounded ranges only (open-ended ones are refused); this reader fetches the
/// requested span in 1 MB pieces, on demand.
struct Chunked {
    url: String,
    pos: u64,
    end: u64, // inclusive
    buf: Vec<u8>,
    off: usize,
}

const PIECE: u64 = 1 << 20;

impl Chunked {
    fn fetch(&mut self) -> std::io::Result<()> {
        let to = (self.pos + PIECE - 1).min(self.end);
        let range = format!("bytes={}-{}", self.pos, to);
        let mut last = None;
        for _ in 0..3 {
            match ureq::get(&self.url).set("User-Agent", UA).set("Range", &range).call() {
                Ok(r) => {
                    let mut data = Vec::with_capacity((to - self.pos + 1) as usize);
                    r.into_reader().read_to_end(&mut data)?;
                    if data.is_empty() {
                        return Err(std::io::Error::other("empty piece"));
                    }
                    self.pos += data.len() as u64;
                    self.buf = data;
                    self.off = 0;
                    return Ok(());
                }
                Err(e) => last = Some(e.to_string()),
            }
        }
        Err(std::io::Error::other(last.unwrap_or_default()))
    }
}

impl Read for Chunked {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if self.off >= self.buf.len() {
            if self.pos > self.end {
                return Ok(0);
            }
            self.fetch()?;
        }
        let n = out.len().min(self.buf.len() - self.off);
        out[..n].copy_from_slice(&self.buf[self.off..self.off + n]);
        self.off += n;
        Ok(n)
    }
}

/// Total size: `clen` in the URL, otherwise asked from a 1-byte piece.
fn total_len(url: &str) -> Option<u64> {
    if let Some(v) = url.split(['?', '&']).find_map(|kv| kv.strip_prefix("clen=")) {
        if let Ok(n) = v.parse() {
            return Some(n);
        }
    }
    let r = ureq::get(url).set("User-Agent", UA).set("Range", "bytes=0-0").call().ok()?;
    r.header("Content-Range")?.rsplit('/').next()?.parse().ok()
}

fn mime_of(url: &str) -> String {
    url.split(['?', '&'])
        .find_map(|kv| kv.strip_prefix("mime="))
        .map(decode)
        .unwrap_or_else(|| "audio/mp4".into())
}

fn handle(req: tiny_http::Request, token: &str) {
    let path = req.url().to_string();
    let target = path
        .strip_prefix(&format!("/{token}?u="))
        .map(decode)
        .filter(|u| allowed(u));
    let Some(target) = target else {
        let _ = req.respond(tiny_http::Response::empty(403));
        return;
    };
    let Some(total) = total_len(&target) else {
        let _ = req.respond(tiny_http::Response::empty(502));
        return;
    };
    // "bytes=a-b" / "bytes=a-" / none
    let range = req
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .and_then(|h| h.value.as_str().strip_prefix("bytes=").map(str::to_string));
    let (start, end, partial) = match range.as_deref().and_then(|r| r.split_once('-')) {
        Some((a, b)) => {
            let start = a.trim().parse::<u64>().unwrap_or(0);
            let end = b.trim().parse::<u64>().map(|e| e.min(total - 1)).unwrap_or(total - 1);
            (start, end, true)
        }
        None => (0, total - 1, false),
    };
    if start >= total || start > end {
        let h = tiny_http::Header::from_bytes("Content-Range", format!("bytes */{total}")).unwrap();
        let _ = req.respond(tiny_http::Response::empty(416).with_header(h));
        return;
    }
    let mut headers = vec![
        tiny_http::Header::from_bytes("Accept-Ranges", "bytes").unwrap(),
        tiny_http::Header::from_bytes("Content-Type", mime_of(&target)).unwrap(),
        tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
    ];
    if partial {
        headers.push(tiny_http::Header::from_bytes("Content-Range", format!("bytes {start}-{end}/{total}")).unwrap());
    }
    let body = Chunked { url: target, pos: start, end, buf: Vec::new(), off: 0 };
    let len = (end - start + 1) as usize;
    let _ = req.respond(tiny_http::Response::new((if partial { 206 } else { 200 }).into(), headers, body, Some(len), None));
}

/// Start the proxy once; returns (port, token).
pub fn start() -> (u16, String) {
    INFO.get_or_init(|| {
        let server = match tiny_http::Server::http("127.0.0.1:0") {
            Ok(s) => s,
            Err(e) => {
                log::warn!("media proxy: {e}");
                return (0, String::new());
            }
        };
        let port = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(0);
        let token = random_token();
        let t = token.clone();
        thread::spawn(move || {
            for req in server.incoming_requests() {
                let t = t.clone();
                // One thread per request: the webview keeps several range requests open.
                thread::spawn(move || handle(req, &t));
            }
        });
        (port, token)
    })
    .clone()
}

/// Base URL for the webview: `http://127.0.0.1:<port>/<token>?u=`.
#[tauri::command]
pub fn media_proxy_base() -> Option<String> {
    let (port, token) = start();
    (port != 0).then(|| format!("http://127.0.0.1:{port}/{token}?u="))
}
