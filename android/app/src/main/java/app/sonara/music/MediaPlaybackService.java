package app.sonara.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground media service: keeps the app alive while music plays in the background,
 * shows the playback notification (lock screen, shade) and routes media buttons
 * (notification, Bluetooth headsets, lock screen) back to the web player.
 */
public class MediaPlaybackService extends Service {

    public interface ActionListener {
        void onAction(String action, long positionMs);
    }

    static final String CHANNEL_ID = "sonara_playback";
    static final int NOTIFICATION_ID = 7001;
    static final String ACTION = "app.sonara.music.MEDIA_ACTION";

    private static MediaPlaybackService instance;
    private static ActionListener listener;

    private MediaSessionCompat session;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private String title = "";
    private String artist = "";
    private String artworkUrl = null;
    private Bitmap artwork = null;
    private boolean playing = false;
    private long positionMs = 0;
    private long durationMs = 0;

    static void setListener(ActionListener l) {
        listener = l;
    }

    static MediaPlaybackService get() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        session = new MediaSessionCompat(this, "Sonara");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play", -1); }
            @Override public void onPause() { emit("pause", -1); }
            @Override public void onSkipToNext() { emit("next", -1); }
            @Override public void onSkipToPrevious() { emit("prev", -1); }
            @Override public void onSeekTo(long pos) { emit("seek", pos); }
            @Override public void onStop() { emit("pause", -1); }
        });
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION.equals(intent.getAction())) {
            emit(intent.getStringExtra("action"), -1);
        }
        startInForeground();
        return START_NOT_STICKY;
    }

    private void emit(String action, long pos) {
        if (listener != null && action != null) listener.onAction(action, pos);
    }

    /** Called by the plugin with the current track and playback state. */
    void update(String title, String artist, String artworkUrl, boolean playing, long positionMs, long durationMs) {
        this.title = title != null ? title : "";
        this.artist = artist != null ? artist : "";
        this.playing = playing;
        this.positionMs = positionMs;
        this.durationMs = durationMs;
        if (artworkUrl != null && !artworkUrl.equals(this.artworkUrl)) {
            this.artworkUrl = artworkUrl;
            this.artwork = null;
            loadArtwork(artworkUrl);
        }
        publish();
    }

    private void loadArtwork(final String url) {
        io.execute(() -> {
            Bitmap bmp = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(in);
                }
            } catch (Exception ignored) {
                // Notification simply shows without artwork.
            }
            final Bitmap result = bmp;
            main.post(() -> {
                if (url.equals(artworkUrl)) {
                    artwork = result;
                    publish();
                }
            });
        });
    }

    private void publish() {
        MediaMetadataCompat.Builder meta = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs);
        if (artwork != null) meta.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork);
        session.setMetadata(meta.build());

        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_SEEK_TO)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, positionMs, playing ? 1f : 0f)
            .build());

        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTIFICATION_ID, buildNotification());
        // Paused: allow the user to swipe the notification away and the system to reclaim memory.
        if (!playing) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH);
        else startInForeground();
    }

    private void startInForeground() {
        Notification n = buildNotification();
        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
    }

    private PendingIntent actionIntent(String action, int requestCode) {
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(ACTION).putExtra("action", action);
        return PendingIntent.getService(this, requestCode, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification buildNotification() {
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setContentTitle(title.isEmpty() ? "Sonara" : title)
            .setContentText(artist)
            .setLargeIcon(artwork)
            .setContentIntent(session.getController().getSessionActivity())
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(playing)
            .addAction(R.drawable.ic_media_prev, "Previous", actionIntent("prev", 1))
            .addAction(playing ? R.drawable.ic_media_pause : R.drawable.ic_media_play, playing ? "Pause" : "Play", actionIntent(playing ? "pause" : "play", 2))
            .addAction(R.drawable.ic_media_next, "Next", actionIntent("next", 3))
            .setStyle(new MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Playback", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Now playing controls");
        ch.setShowBadge(false);
        ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(ch);
    }

    void shutdown() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        session.setActive(false);
        session.release();
        io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
