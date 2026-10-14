mod audio_devices;
mod discord;
mod dpi;
mod media_proxy;
mod pot;
mod tray;

use tauri::Manager;

/// Windows: ask WebView2 to trim memory while the window is minimised / hidden
/// (MemoryUsageTargetLevel::Low drops caches and unused resources), restore when shown.
#[cfg(windows)]
fn set_low_memory(window: &tauri::WebviewWindow, low: bool) {
  use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
  };
  use windows::core::Interface;
  let _ = window.with_webview(move |wv| unsafe {
    if let Ok(core) = wv.controller().CoreWebView2() {
      if let Ok(core19) = core.cast::<ICoreWebView2_19>() {
        let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
        let _ = core19.SetMemoryUsageTargetLevel(level);
      }
    }
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .manage(discord::Discord::start())
    .invoke_handler(tauri::generate_handler![tray::tray_update, tray::tray_close_to_tray, tray::tray_available, audio_devices::audio_devices_watch, discord::discord_set, discord::discord_clear, dpi::dpi_configure, dpi::dpi_probe, media_proxy::media_proxy_base, pot::pot_mint])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      #[cfg(windows)]
      if let Some(window) = app.get_webview_window("main") {
        let w = window.clone();
        window.on_window_event(move |event| {
          if matches!(event, tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_)) {
            let hidden = w.is_minimized().unwrap_or(false) || !w.is_visible().unwrap_or(true);
            set_low_memory(&w, hidden);
          }
        });
      }
      // System tray (skipped where the platform library is missing) and "close to tray".
      tray::init(app.handle());
      if let Some(window) = app.get_webview_window("main") {
        let w = window.clone();
        window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            if tray::close_to_tray() {
              api.prevent_close();
              let _ = w.hide();
            }
          }
        });
      }
      let _ = app; // silence unused warnings on non-Windows targets
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Sonara");
}
