package app.sonara.music;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.lang.reflect.Method;

/**
 * Headphones connecting, for the island player (src/platform/audioDevices.ts): name, kind and
 * battery level. The audio route callback says when headphones become an output; the battery comes
 * from the Bluetooth stack (the level the headset reports over HFP, which is also what the system
 * Bluetooth settings show, AirPods included) and updates through its broadcast.
 * Battery needs BLUETOOTH_CONNECT on Android 12+; without it the island shows the name only.
 */
@CapacitorPlugin(name = "AudioDevices", permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) })
public class AudioDevicesPlugin extends Plugin {

    /** Hidden in the SDK but sent by every Bluetooth stack since Android 8.1. */
    private static final String ACTION_BATTERY_LEVEL_CHANGED = "android.bluetooth.device.action.BATTERY_LEVEL_CHANGED";
    private static final String EXTRA_BATTERY_LEVEL = "android.bluetooth.device.extra.BATTERY_LEVEL";

    private AudioManager audio;
    private AudioDeviceCallback callback;
    private BroadcastReceiver batteryReceiver;
    private final Handler main = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            requestPermissionForAlias("bluetooth", call, "permissionDone");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void permissionDone(PluginCall call) {
        begin(call); // without the permission it still works, with names only
    }

    @PluginMethod
    public void stop(PluginCall call) {
        end();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        end();
    }

    private boolean canUseBluetooth() {
        return Build.VERSION.SDK_INT < 31 || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    private void begin(PluginCall call) {
        end();
        Context ctx = getContext();
        audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
        callback = new AudioDeviceCallback() {
            /** Registering reports the devices already connected: those are not news. */
            private boolean initial = true;

            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                if (initial) {
                    initial = false;
                    return;
                }
                for (AudioDeviceInfo d : added) {
                    if (!d.isSink()) continue;
                    String kind = kindOf(d.getType());
                    if (kind == null) continue;
                    JSObject e = new JSObject();
                    String address = Build.VERSION.SDK_INT >= 28 ? d.getAddress() : "";
                    e.put("id", address != null && !address.isEmpty() ? address : kind + ":" + d.getId());
                    e.put("name", String.valueOf(d.getProductName()));
                    e.put("kind", kind);
                    int level = "bluetooth".equals(kind) ? batteryOf(address) : -1;
                    if (level >= 0) e.put("battery", level);
                    notifyListeners("connected", e);
                }
            }
        };
        audio.registerAudioDeviceCallback(callback, main);

        if (canUseBluetooth()) {
            batteryReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                    int level = intent.getIntExtra(EXTRA_BATTERY_LEVEL, -1);
                    if (device == null || level < 0) return;
                    JSObject e = new JSObject();
                    e.put("id", device.getAddress());
                    e.put("level", level);
                    notifyListeners("battery", e);
                }
            };
            ContextCompat.registerReceiver(ctx, batteryReceiver, new IntentFilter(ACTION_BATTERY_LEVEL_CHANGED), ContextCompat.RECEIVER_EXPORTED);
        }
        JSObject r = new JSObject();
        r.put("battery", canUseBluetooth());
        call.resolve(r);
    }

    private void end() {
        if (audio != null && callback != null) audio.unregisterAudioDeviceCallback(callback);
        callback = null;
        if (batteryReceiver != null) {
            try {
                getContext().unregisterReceiver(batteryReceiver);
            } catch (IllegalArgumentException ignored) {
                // not registered
            }
            batteryReceiver = null;
        }
    }

    /** Headphone-like outputs only (not the speaker, HDMI, the car…). */
    private static String kindOf(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case 26: // TYPE_BLE_HEADSET (API 31)
                return "bluetooth";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                return "wired";
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return "usb";
            default:
                return null;
        }
    }

    /** BluetoothDevice.getBatteryLevel() (public API since 33 on some builds, hidden before): -1 if unknown. */
    private int batteryOf(String address) {
        if (address == null || address.isEmpty() || !canUseBluetooth()) return -1;
        try {
            BluetoothManager bm = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            BluetoothAdapter adapter = bm != null ? bm.getAdapter() : null;
            if (adapter == null) return -1;
            BluetoothDevice device = adapter.getRemoteDevice(address);
            Method m = BluetoothDevice.class.getMethod("getBatteryLevel");
            Object v = m.invoke(device);
            return v instanceof Integer ? (Integer) v : -1;
        } catch (Exception | LinkageError e) {
            return -1;
        }
    }
}
