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
        MediaPlaybackService.setListener((action, pos, arg) -> {
            JSObject data = new JSObject();
            data.put("action", action);
            if (pos >= 0) data.put("position", pos / 1000.0);
            if (arg != null) data.put("arg", arg);
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

    /**
     * The lists Android Auto browses: { queue, liked, recent: [{ id, title, artist, artwork }],
     * titles: { queue, liked, recent } }. The service is started on demand (a car may browse first).
     */
    @PluginMethod
    public void setLibrary(PluginCall call) {
        MediaPlaybackService svc = MediaPlaybackService.get();
        if (svc == null) {
            Intent i = new Intent(getContext(), MediaPlaybackService.class);
            try {
                ContextCompat.startForegroundService(getContext(), i);
            } catch (Exception e) {
                call.resolve();
                return;
            }
            final PluginCall deferred = call;
            getBridge().getActivity().getWindow().getDecorView().postDelayed(() -> {
                MediaPlaybackService s = MediaPlaybackService.get();
                if (s != null) applyLibrary(s, deferred);
                deferred.resolve();
            }, 400);
            return;
        }
        applyLibrary(svc, call);
        call.resolve();
    }

    private void applyLibrary(MediaPlaybackService svc, PluginCall call) {
        JSObject titles = call.getObject("titles", new JSObject());
        for (String list : new String[] { "queue", "liked", "recent" }) {
            org.json.JSONArray arr = call.getArray(list);
            if (arr == null) continue;
            java.util.List<MediaPlaybackService.Item> items = new java.util.ArrayList<>();
            for (int i = 0; i < arr.length() && i < 200; i++) {
                try {
                    org.json.JSONObject o = arr.getJSONObject(i);
                    items.add(new MediaPlaybackService.Item(o.optString("id"), o.optString("title"), o.optString("artist"), o.optString("artwork", null)));
                } catch (org.json.JSONException ignored) {
                    // skip a malformed entry
                }
            }
            svc.setList(list, titles.optString(list, list), items);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        MediaPlaybackService svc = MediaPlaybackService.get();
        if (svc != null) svc.shutdown();
        call.resolve();
    }
}
