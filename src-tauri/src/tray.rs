//! System tray: now playing, previous / play-pause / next, show and quit; optional "close to tray".
//!
//! The web player drives it: `tray_update` sends the track and the labels, menu clicks come back
//! as the `tray-action` event (prev | play | next). Linux needs libayatana-appindicator (or
//! libappindicator): without it the tray crate panics, which would abort the app, so the library
//! is looked up first and the tray is simply skipped when it is missing.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

pub struct Tray {
    icon: TrayIcon,
    title: MenuItem<Wry>,
    prev: MenuItem<Wry>,
    play: MenuItem<Wry>,
    next: MenuItem<Wry>,
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "linux")]
fn tray_library_available() -> bool {
    ["libayatana-appindicator3.so.1", "libappindicator3.so.1", "libayatana-appindicator3.so", "libappindicator3.so"]
        .iter()
        .any(|name| unsafe { libloading::Library::new(name).is_ok() })
}

#[cfg(not(target_os = "linux"))]
fn tray_library_available() -> bool {
    true
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false) {
            let _ = w.hide();
        } else {
            show_main(app);
        }
    }
}

/// Create the tray icon. Returns false when the platform cannot show one.
pub fn init(app: &AppHandle) -> bool {
    if !tray_library_available() {
        log::warn!("tray: no appindicator library, the tray is off");
        return false;
    }
    match build(app) {
        Ok(tray) => {
            app.manage(tray);
            true
        }
        Err(e) => {
            log::warn!("tray: {e}");
            false
        }
    }
}

fn build(app: &AppHandle) -> tauri::Result<Tray> {
    let title = MenuItem::with_id(app, "title", "Sonara", false, None::<&str>)?;
    let prev = MenuItem::with_id(app, "prev", "Previous", true, None::<&str>)?;
    let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Sonara", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&title, &sep1, &prev, &play, &next, &sep2, &show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Sonara")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "show" => show_main(app),
            id @ ("prev" | "play" | "next") => {
                let _ = app.emit("tray-action", id);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let icon = builder.build(app)?;
    Ok(Tray { icon, title, prev, play, next, show, quit })
}

#[derive(serde::Deserialize)]
pub struct TrayLabels {
    prev: String,
    play: String,
    pause: String,
    next: String,
    show: String,
    quit: String,
}

/// Now playing + localized labels from the web player.
#[tauri::command]
pub fn tray_update(app: AppHandle, title: String, artist: String, playing: bool, labels: TrayLabels) {
    let Some(tray) = app.try_state::<Tray>() else { return };
    let line = if title.is_empty() { "Sonara".to_string() } else if artist.is_empty() { title.clone() } else { format!("{artist} — {title}") };
    let _ = tray.title.set_text(&line);
    let _ = tray.prev.set_text(&labels.prev);
    let _ = tray.play.set_text(if playing { &labels.pause } else { &labels.play });
    let _ = tray.next.set_text(&labels.next);
    let _ = tray.show.set_text(&labels.show);
    let _ = tray.quit.set_text(&labels.quit);
    let _ = tray.icon.set_tooltip(Some(&line));
}

/// Closing the window hides it to the tray (only while a tray exists).
#[tauri::command]
pub fn tray_close_to_tray(app: AppHandle, on: bool) {
    CLOSE_TO_TRAY.store(on && app.try_state::<Tray>().is_some(), Ordering::Relaxed);
}

pub fn close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

/// Whether a tray icon exists on this system (for the settings screen).
#[tauri::command]
pub fn tray_available(app: AppHandle) -> bool {
    app.try_state::<Tray>().is_some()
}
