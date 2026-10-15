package app.sonara.music;

import android.net.Uri;
import androidx.mediarouter.app.MediaRouteChooserDialog;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaSeekOptions;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.SessionManager;
import com.google.android.gms.cast.framework.SessionManagerListener;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.images.WebImage;

/**
 * Chromecast for the web player (src/player/cast.ts). The system device picker chooses the
 * device; the web player then hands over one stream URL at a time and follows the receiver's state.
 * Without Google Play services everything reports "unavailable" and the button does nothing.
 */
@CapacitorPlugin(name = "Cast")
public class CastPlugin extends Plugin {

    private CastContext cast;
    private SessionManager sessions;
    private PluginCall picking;
    private RemoteMediaClient client;

    private final RemoteMediaClient.Callback mediaCallback = new RemoteMediaClient.Callback() {
        @Override
        public void onStatusUpdated() {
            emitStatus();
        }
    };

    private final RemoteMediaClient.ProgressListener progress = (position, duration) -> emitStatus();

    private final SessionManagerListener<CastSession> listener = new SessionManagerListener<CastSession>() {
        @Override public void onSessionStarted(CastSession s, String id) { started(s); }
        @Override public void onSessionResumed(CastSession s, boolean wasSuspended) { started(s); }
        @Override public void onSessionEnded(CastSession s, int error) { ended(); }
        @Override public void onSessionStartFailed(CastSession s, int error) { failed(); }
        @Override public void onSessionResumeFailed(CastSession s, int error) { failed(); }
        @Override public void onSessionStarting(CastSession s) {}
        @Override public void onSessionEnding(CastSession s) {}
        @Override public void onSessionResuming(CastSession s, String id) {}
        @Override public void onSessionSuspended(CastSession s, int reason) {}
    };

    /** Why the Cast SDK could not start (shown to the user as the notice detail). */
    private String reason = "";

    private boolean ensure() {
        if (sessions != null) return true;
        try {
            cast = CastContext.getSharedInstance(getContext());
            sessions = cast.getSessionManager();
            sessions.addSessionManagerListener(listener, CastSession.class);
            return true;
        } catch (Exception | LinkageError e) {
            int play = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
            reason = (play == ConnectionResult.SUCCESS ? "" : "play services " + play + "; ") + e.getClass().getSimpleName() + (e.getMessage() != null ? ": " + e.getMessage() : "");
            return false;
        }
    }

    private void started(CastSession s) {
        if (client != null) {
            client.unregisterCallback(mediaCallback);
            client.removeProgressListener(progress);
        }
        client = s.getRemoteMediaClient();
        if (client != null) {
            client.registerCallback(mediaCallback);
            client.addProgressListener(progress, 1000);
        }
        if (picking != null) {
            JSObject d = new JSObject();
            d.put("id", s.getCastDevice() != null ? s.getCastDevice().getDeviceId() : "cast");
            d.put("name", s.getCastDevice() != null ? s.getCastDevice().getFriendlyName() : "Chromecast");
            picking.resolve(d);
            picking = null;
        }
    }

    private void failed() {
        if (picking != null) {
            picking.reject("connect failed");
            picking = null;
        }
    }

    private void ended() {
        client = null;
        notifyListeners("closed", new JSObject());
    }

    private void emitStatus() {
        if (client == null) return;
        MediaStatus st = client.getMediaStatus();
        JSObject e = new JSObject();
        String state = "idle";
        if (st != null) {
            switch (st.getPlayerState()) {
                case MediaStatus.PLAYER_STATE_PLAYING: state = "playing"; break;
                case MediaStatus.PLAYER_STATE_PAUSED: state = "paused"; break;
                case MediaStatus.PLAYER_STATE_BUFFERING:
                case MediaStatus.PLAYER_STATE_LOADING: state = "buffering"; break;
                default: state = "idle";
            }
            if (st.getPlayerState() == MediaStatus.PLAYER_STATE_IDLE) {
                if (st.getIdleReason() == MediaStatus.IDLE_REASON_FINISHED) e.put("idleReason", "finished");
                else if (st.getIdleReason() == MediaStatus.IDLE_REASON_ERROR) e.put("idleReason", "error");
            }
            MediaInfo info = st.getMediaInfo();
            if (info != null && info.getStreamDuration() > 0) e.put("duration", info.getStreamDuration() / 1000.0);
        }
        e.put("state", state);
        e.put("position", client.getApproximateStreamPosition() / 1000.0);
        notifyListeners("status", e);
    }

    @PluginMethod
    public void pick(PluginCall call) {
        if (!ensure()) {
            call.reject("unavailable: " + reason);
            return;
        }
        getActivity().runOnUiThread(() -> {
            CastSession current = sessions.getCurrentCastSession();
            if (current != null && current.isConnected()) {
                JSObject d = new JSObject();
                d.put("id", current.getCastDevice().getDeviceId());
                d.put("name", current.getCastDevice().getFriendlyName());
                call.resolve(d);
                return;
            }
            picking = call;
            MediaRouteChooserDialog dialog = new MediaRouteChooserDialog(getActivity());
            dialog.setRouteSelector(cast.getMergedSelector());
            dialog.setOnDismissListener(x -> {
                // Dismissed without choosing: wait a moment, the session may still be starting.
                getActivity().getWindow().getDecorView().postDelayed(() -> {
                    if (picking != null) {
                        PluginCall c = picking;
                        picking = null;
                        c.resolve(new JSObject().put("id", null).put("name", null).put("cancelled", true));
                    }
                }, 5000);
            });
            dialog.show();
        });
    }

    @PluginMethod
    public void load(PluginCall call) {
        if (client == null) {
            call.reject("not connected");
            return;
        }
        MediaMetadata md = new MediaMetadata(MediaMetadata.MEDIA_TYPE_MUSIC_TRACK);
        md.putString(MediaMetadata.KEY_TITLE, call.getString("title", ""));
        md.putString(MediaMetadata.KEY_ARTIST, call.getString("artist", ""));
        String art = call.getString("artwork");
        if (art != null && !art.isEmpty()) md.addImage(new WebImage(Uri.parse(art)));
        MediaInfo.Builder info = new MediaInfo.Builder(call.getString("url", ""))
            .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
            .setContentType(call.getString("mime", "audio/mpeg"))
            .setMetadata(md);
        Double duration = call.getDouble("duration");
        if (duration != null && duration > 0) info.setStreamDuration((long) (duration * 1000));
        double position = call.getDouble("position", 0.0);
        MediaLoadRequestData req = new MediaLoadRequestData.Builder()
            .setMediaInfo(info.build())
            .setAutoplay(Boolean.TRUE.equals(call.getBoolean("autoplay", true)))
            .setCurrentTime((long) (position * 1000))
            .build();
        getActivity().runOnUiThread(() -> {
            client.load(req).setResultCallback(r -> {
                if (r.getStatus().isSuccess()) call.resolve();
                else call.reject("load failed: " + r.getStatus().getStatusMessage());
            });
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        if (client != null) {
            boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
            getActivity().runOnUiThread(() -> {
                if (on) client.play();
                else client.pause();
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        if (client != null) {
            long pos = (long) (call.getDouble("position", 0.0) * 1000);
            getActivity().runOnUiThread(() -> client.seek(new MediaSeekOptions.Builder().setPosition(pos).build()));
        }
        call.resolve();
    }

    @PluginMethod
    public void volume(PluginCall call) {
        CastSession s = sessions != null ? sessions.getCurrentCastSession() : null;
        if (s != null) {
            double v = call.getDouble("volume", 1.0);
            try {
                s.setVolume(v);
            } catch (Exception ignored) {
                // the device refused
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        if (sessions != null) getActivity().runOnUiThread(() -> sessions.endCurrentSession(true));
        call.resolve();
    }
}
