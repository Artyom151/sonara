package app.sonara.music;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/** Bridge between the web player and MediaPlaybackService (background playback + media notification). */
@CapacitorPlugin(
    name = "MediaControls",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class MediaControlsPlugin extends Plugin {

    @Override
    public void load() {
        MediaPlaybackService.setListener((action, pos) -> {
            JSObject data = new JSObject();
            data.put("action", action);
            if (pos >= 0) data.put("position", pos / 1000.0);
            notifyListeners("action", data);
        });
    }

    @PluginMethod
    public void update(PluginCall call) {
        // Android 13+: the playback notification needs the notification permission (asked once).
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") == PermissionState.PROMPT) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        apply(call);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void afterPermission(PluginCall call) {
        apply(call);
    }

    private void apply(PluginCall call) {
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String artwork = call.getString("artwork");
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        long position = (long) (call.getDouble("position", 0.0) * 1000);
        long duration = (long) (call.getDouble("duration", 0.0) * 1000);

        MediaPlaybackService svc = MediaPlaybackService.get();
        if (svc == null) {
            if (!playing) {
                call.resolve();
                return;
            }
            Intent i = new Intent(getContext(), MediaPlaybackService.class);
            ContextCompat.startForegroundService(getContext(), i);
            // The service starts asynchronously; apply the state once it exists.
            getBridge().getActivity().getWindow().getDecorView().postDelayed(() -> {
                MediaPlaybackService s = MediaPlaybackService.get();
                if (s != null) s.update(title, artist, artwork, playing, position, duration);
            }, 300);
        } else {
            svc.update(title, artist, artwork, playing, position, duration);
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        MediaPlaybackService svc = MediaPlaybackService.get();
        if (svc != null) svc.shutdown();
        call.resolve();
    }
}
