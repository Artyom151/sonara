//! PO token host (desktop).
//!
//! YouTube only serves a whole audio stream when its URL carries a `pot` token minted by
//! BotGuard, and BotGuard only attests pages on the youtube.com origin. The app's own webview is
//! on tauri://localhost, so the minter (pot.js, built from src/core/pot-page.ts) runs in a hidden
//! window on https://www.youtube.com/robots.txt (a plain text file: nothing else loads there).
//! The window has no IPC; results come back through the URL fragment, which Rust polls.

use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const LABEL: &str = "pot";
const SCRIPT: &str = include_str!("../pot.js");

/// One mint at a time (the window has a single result slot).
static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External("https://www.youtube.com/robots.txt".parse().map_err(|e| format!("{e}"))?))
        .title("Sonara")
        .visible(false)
        .decorations(false)
        .skip_taskbar(true)
        .focused(false)
        .inner_size(320.0, 240.0)
        .initialization_script(SCRIPT)
        .build()
        .map_err(|e| e.to_string())
}

fn fragment(w: &WebviewWindow) -> String {
    w.url().ok().and_then(|u| u.fragment().map(str::to_string)).unwrap_or_default()
}

/// PO token for a video id.
#[tauri::command]
pub async fn pot_mint(app: AppHandle, video_id: String) -> Result<String, String> {
    if !video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') || video_id.is_empty() || video_id.len() > 32 {
        return Err("bad video id".into());
    }
    let _guard = LOCK.lock().await;
    let w = window(&app)?;
    // Wait for the page (and with it the injected script) to be there.
    let start = Instant::now();
    loop {
        if w.url().map(|u| u.host_str() == Some("www.youtube.com")).unwrap_or(false) {
            break;
        }
        if start.elapsed() > Duration::from_secs(20) {
            return Err("pot window did not load".into());
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
    let tag = format!("r{}", start.elapsed().as_nanos());
    w.eval(format!(
        "(function(){{var t='{tag}';var go=function(){{if(!window.__mintPot){{return setTimeout(go,100)}}window.__mintPot('{video_id}').then(function(v){{location.hash=t+':ok:'+v}},function(e){{location.hash=t+':err:'+(e&&e.message||e)}})}};go()}})()"
    ))
    .map_err(|e| e.to_string())?;
    let started = Instant::now();
    loop {
        let f = fragment(&w);
        if let Some(rest) = f.strip_prefix(&format!("{tag}:")) {
            return match rest.split_once(':') {
                Some(("ok", token)) => Ok(token.to_string()),
                Some((_, err)) => Err(err.to_string()),
                None => Err("bad pot reply".into()),
            };
        }
        if started.elapsed() > Duration::from_secs(45) {
            return Err("pot mint timed out".into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
