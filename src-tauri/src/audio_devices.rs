//! Headphones connecting, for the island player (src/platform/audioDevices.ts).
//!
//! Linux: BlueZ on the system D-Bus. A device whose `org.bluez.Device1.Connected` turns true and
//! that is an audio device (icon `audio-*` or the A2DP sink UUID) is reported with its alias and,
//! when the headset reports it, `org.bluez.Battery1.Percentage` (PipeWire / WirePlumber publish the
//! level AirPods and most headsets send over HFP). Battery changes keep coming while it is shown.
//! Windows: the default output switching to another device (its name; no battery level, Windows
//! has no public API for a headset's battery). The front end filters out speakers.
//!
//! Events: `audio-device` {id, name, kind, battery?} and `audio-battery` {id, level}.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter};

static ON: AtomicBool = AtomicBool::new(false);
static STARTED: OnceLock<()> = OnceLock::new();

#[derive(Clone, serde::Serialize)]
struct DeviceEvent {
    id: String,
    name: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    battery: Option<u8>,
}

#[derive(Clone, serde::Serialize)]
struct BatteryEvent {
    id: String,
    level: u8,
}

fn emit_device(app: &AppHandle, e: DeviceEvent) {
    if ON.load(Ordering::Relaxed) {
        let _ = app.emit("audio-device", e);
    }
}

#[allow(dead_code)]
fn emit_battery(app: &AppHandle, id: String, level: u8) {
    if ON.load(Ordering::Relaxed) {
        let _ = app.emit("audio-battery", BatteryEvent { id, level });
    }
}

/// Turn the reports on or off (the island player setting). The watcher starts once and stays idle.
#[tauri::command]
pub fn audio_devices_watch(app: AppHandle, on: bool) {
    ON.store(on, Ordering::Relaxed);
    if on {
        STARTED.get_or_init(|| {
            std::thread::spawn(move || {
                if let Err(e) = platform::run(app) {
                    log::warn!("audio devices: {e}");
                }
            });
        });
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use std::collections::{HashMap, HashSet};
    use std::sync::{Arc, Mutex};
    use zbus::blocking::{Connection, MessageIterator};
    use zbus::zvariant::{OwnedObjectPath, OwnedValue};
    use zbus::MatchRule;

    type Props = HashMap<String, OwnedValue>;
    type Managed = HashMap<OwnedObjectPath, HashMap<String, Props>>;

    const DEVICE: &str = "org.bluez.Device1";
    const BATTERY: &str = "org.bluez.Battery1";
    const A2DP_SINK: &str = "0000110b-0000-1000-8000-00805f9b34fb";

    fn string(p: &Props, k: &str) -> Option<String> {
        p.get(k).and_then(|v| String::try_from(v.try_clone().ok()?).ok())
    }
    fn boolean(p: &Props, k: &str) -> Option<bool> {
        p.get(k).and_then(|v| bool::try_from(v).ok())
    }
    fn byte(p: &Props, k: &str) -> Option<u8> {
        p.get(k).and_then(|v| u8::try_from(v).ok())
    }

    fn is_audio(p: &Props) -> bool {
        if string(p, "Icon").is_some_and(|i| i.starts_with("audio-")) {
            return true;
        }
        p.get("UUIDs")
            .and_then(|v| Vec::<String>::try_from(v.try_clone().ok()?).ok())
            .is_some_and(|u| u.iter().any(|x| x.eq_ignore_ascii_case(A2DP_SINK)))
    }

    fn get_all(conn: &Connection, path: &str, iface: &str) -> Option<Props> {
        let reply = conn
            .call_method(Some("org.bluez"), path, Some("org.freedesktop.DBus.Properties"), "GetAll", &(iface,))
            .ok()?;
        reply.body().deserialize::<Props>().ok()
    }

    fn report(app: &AppHandle, conn: &Connection, path: &str, dev: &Props) {
        if !is_audio(dev) {
            return;
        }
        let name = string(dev, "Alias").or_else(|| string(dev, "Name")).unwrap_or_else(|| "Headphones".into());
        let battery = get_all(conn, path, BATTERY).and_then(|b| byte(&b, "Percentage"));
        emit_device(app, DeviceEvent { id: path.to_string(), name, kind: "bluetooth", battery });
    }

    pub fn run(app: AppHandle) -> zbus::Result<()> {
        let conn = Connection::system()?;
        // Already connected at start: not news, but remembered so a reconnect is.
        let managed: Managed = conn
            .call_method(Some("org.bluez"), "/", Some("org.freedesktop.DBus.ObjectManager"), "GetManagedObjects", &())?
            .body()
            .deserialize()?;
        let connected: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(managed
            .iter()
            .filter(|(_, ifs)| ifs.get(DEVICE).and_then(|d| boolean(d, "Connected")).unwrap_or(false))
            .map(|(p, _)| p.to_string())
            .collect()));

        // BlueZ often adds Battery1 a moment after the device connects (once the headset reports it).
        {
            let (app, conn) = (app.clone(), conn.clone());
            std::thread::spawn(move || {
                let added = || -> zbus::Result<()> {
                    let rule = MatchRule::builder()
                        .msg_type(zbus::message::Type::Signal)
                        .sender("org.bluez")?
                        .interface("org.freedesktop.DBus.ObjectManager")?
                        .member("InterfacesAdded")?
                        .build();
                    for msg in MessageIterator::for_match_rule(rule, &conn, Some(32))? {
                        let Ok(msg) = msg else { continue };
                        let Ok((path, ifs)) = msg.body().deserialize::<(OwnedObjectPath, HashMap<String, Props>)>() else { continue };
                        if let Some(level) = ifs.get(BATTERY).and_then(|b| byte(b, "Percentage")) {
                            emit_battery(&app, path.to_string(), level);
                        }
                    }
                    Ok(())
                };
                if let Err(e) = added() {
                    log::warn!("audio devices (battery): {e}");
                }
            });
        }

        let changed = MatchRule::builder()
            .msg_type(zbus::message::Type::Signal)
            .sender("org.bluez")?
            .interface("org.freedesktop.DBus.Properties")?
            .member("PropertiesChanged")?
            .build();
        let mut signals = MessageIterator::for_match_rule(changed, &conn, Some(64))?;
        while let Some(msg) = signals.next() {
            let Ok(msg) = msg else { continue };
            let header = msg.header();
            let Some(path) = header.path().map(|p| p.to_string()) else { continue };
            let Ok((iface, props, _)) = msg.body().deserialize::<(String, Props, Vec<String>)>() else { continue };
            if iface == DEVICE {
                match boolean(&props, "Connected") {
                    Some(true) if connected.lock().map(|mut c| c.insert(path.clone())).unwrap_or(false) => {
                        if let Some(dev) = get_all(&conn, &path, DEVICE) {
                            report(&app, &conn, &path, &dev);
                        }
                    }
                    Some(false) => {
                        if let Ok(mut c) = connected.lock() {
                            c.remove(&path);
                        }
                    }
                    _ => {}
                }
            } else if iface == BATTERY {
                if let Some(level) = byte(&props, "Percentage") {
                    emit_battery(&app, path, level);
                }
            }
        }
        Ok(())
    }
}

#[cfg(windows)]
mod platform {
    use super::*;
    use windows::Devices::Enumeration::DeviceInformation;
    use windows::Foundation::TypedEventHandler;
    use windows::Media::Devices::{DefaultAudioRenderDeviceChangedEventArgs, MediaDevice};

    pub fn run(app: AppHandle) -> windows::core::Result<()> {
        let handler = TypedEventHandler::<windows::core::IInspectable, DefaultAudioRenderDeviceChangedEventArgs>::new(move |_, args| {
            let id = args.ok()?.Id()?;
            if id.is_empty() {
                return Ok(());
            }
            let name = DeviceInformation::CreateFromIdAsync(&id)?.join()?.Name()?.to_string();
            emit_device(&app, DeviceEvent { id: id.to_string(), name, kind: "default-output", battery: None });
            Ok(())
        });
        MediaDevice::DefaultAudioRenderDeviceChanged(&handler)?;
        // The subscription lives as long as this thread.
        loop {
            std::thread::park();
        }
    }
}

#[cfg(not(any(target_os = "linux", windows)))]
mod platform {
    pub fn run(_app: tauri::AppHandle) -> Result<(), String> {
        Ok(())
    }
}
