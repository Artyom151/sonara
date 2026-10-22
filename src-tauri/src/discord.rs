//! Discord Rich Presence: "Listening to <track>" with artwork, artist and a progress bar.
//!
//! All IPC happens on one background thread fed by a channel, so the UI never waits on
//! Discord. The client connects lazily and quietly reconnects (at most every 15 s) when
//! Discord is closed or restarted.

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Button, StatusDisplayType, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde::Deserialize;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    /// Discord application id (Developer Portal → Applications → Application ID).
    pub app_id: String,
    pub title: String,
    pub artist: String,
    /// https URL of the artwork (Discord proxies external images).
    pub artwork: Option<String>,
    /// Link to the track (shown as a button).
    pub url: Option<String>,
    pub playing: bool,
    /// Unix ms when the track started and will end (for the progress bar), playing only.
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    /// Shown when paused.
    pub paused_label: Option<String>,
}

enum Msg {
    Set(Presence),
    Clear,
}

pub struct Discord {
    tx: Mutex<Sender<Msg>>,
}

impl Discord {
    pub fn start() -> Self {
        let (tx, rx) = channel();
        thread::Builder::new()
            .name("discord-rpc".into())
            .spawn(move || worker(rx))
            .expect("spawn discord thread");
        Self { tx: Mutex::new(tx) }
    }

    fn send(&self, m: Msg) {
        if let Ok(tx) = self.tx.lock() {
            let _ = tx.send(m);
        }
    }
}

struct Conn {
    app_id: String,
    client: Option<DiscordIpcClient>,
    last_attempt: Option<Instant>,
}

impl Conn {
    fn client(&mut self, app_id: &str) -> Option<&mut DiscordIpcClient> {
        if self.app_id != app_id {
            self.close();
            self.app_id = app_id.to_string();
        }
        if self.client.is_none() {
            if let Some(t) = self.last_attempt {
                if t.elapsed() < Duration::from_secs(15) {
                    return None;
                }
            }
            self.last_attempt = Some(Instant::now());
            let mut c = DiscordIpcClient::new(app_id);
            match c.connect() {
                Ok(()) => self.client = Some(c),
                // Usually Discord is not running (or its IPC socket is not there): say so once per attempt.
                Err(e) => log::warn!("discord: not connected, will retry: {e}"),
            }
        }
        self.client.as_mut()
    }

    fn close(&mut self) {
        if let Some(mut c) = self.client.take() {
            let _ = c.clear_activity();
            let _ = c.close();
        }
    }
}

fn worker(rx: Receiver<Msg>) {
    let mut conn = Conn { app_id: String::new(), client: None, last_attempt: None };
    while let Ok(mut msg) = rx.recv() {
        // Coalesce bursts (seek, skip spam): only the newest state matters.
        while let Ok(next) = rx.try_recv() {
            msg = next;
        }
        match msg {
            Msg::Clear => {
                if let Some(c) = conn.client.as_mut() {
                    if c.clear_activity().is_err() {
                        conn.client = None;
                    }
                }
            }
            Msg::Set(p) => {
                if p.app_id.trim().is_empty() {
                    continue;
                }
                let app_id = p.app_id.trim().to_string();
                let Some(client) = conn.client(&app_id) else { continue };
                if client.set_activity(build(&p)).is_err() {
                    // Discord went away: drop the connection, retry on a later update.
                    conn.client = None;
                }
            }
        }
    }
    conn.close();
}

fn build(p: &Presence) -> Activity<'_> {
    let mut assets = Assets::new().large_text(if p.artist.is_empty() { "Sonara" } else { &p.artist });
    assets = match &p.artwork {
        Some(url) if url.starts_with("https://") => assets.large_image(url.as_str()),
        _ => assets.large_image("sonara"),
    };
    // Small badge: the Sonara logo uploaded as art asset "sonara" in the Developer Portal.
    assets = assets.small_image("sonara").small_text("Sonara");

    let mut a = Activity::new()
        .activity_type(ActivityType::Listening)
        .status_display_type(StatusDisplayType::Details)
        .name("Sonara")
        .details(&p.title)
        .state(if p.playing { p.artist.as_str() } else { p.paused_label.as_deref().unwrap_or("Paused") })
        .assets(assets);
    if p.playing {
        if let (Some(s), Some(e)) = (p.start_ms, p.end_ms) {
            a = a.timestamps(Timestamps::new().start(s).end(e));
        }
    }
    if let Some(url) = p.url.as_deref().filter(|u| u.starts_with("https://")) {
        a = a.buttons(vec![Button::new("Open track", url)]);
    }
    a
}

#[tauri::command]
pub fn discord_set(state: tauri::State<'_, Discord>, presence: Presence) {
    state.send(Msg::Set(presence));
}

#[tauri::command]
pub fn discord_clear(state: tauri::State<'_, Discord>) {
    state.send(Msg::Clear);
}
