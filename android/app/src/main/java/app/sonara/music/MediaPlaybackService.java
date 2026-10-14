package app.sonara.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Bundle;
import android.os.Looper;
import android.net.Uri;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;
import androidx.media.MediaBrowserServiceCompat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
 *
 * It is also the media browser service Android Auto (and other controllers) connect to: the web
 * player publishes its queue, favourites and recent tracks (setLibrary), they are shown as a
 * browsable tree, and "play this" / voice search come back to the web player as actions.
 */
public class MediaPlaybackService extends MediaBrowserServiceCompat {

    public interface ActionListener {
        void onAction(String action, long positionMs, String arg);
    }

    /** One playable entry of the browse tree. */
    static final class Item {
        final String id;
        final String title;
        final String artist;
        final String art;

        Item(String id, String title, String artist, String art) {
            this.id = id;
            this.title = title;
            this.artist = artist;
            this.art = art;
        }
    }

    static final String ROOT = "root";
    static final String LIST_QUEUE = "queue";
    static final String LIST_LIKED = "liked";
    static final String LIST_RECENT = "recent";
    private static final Map<String, List<Item>> library = new HashMap<>();
    private static final Map<String, String> listTitles = new HashMap<>();

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

    /**
     * The service is exported (Android Auto binds to it), so the transport intents carry a
     * per-install secret: another app cannot start it with a forged "next".
     */
    static String token(Context c) {
        android.content.SharedPreferences p = c.getSharedPreferences("sonara_media", Context.MODE_PRIVATE);
        String t = p.getString("token", null);
        if (t == null) {
            t = java.util.UUID.randomUUID().toString();
            p.edit().putString("token", t).apply();
        }
        return t;
    }

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
            // Android Auto: a tapped entry of the browse tree ("liked/<key>") ...
            @Override public void onPlayFromMediaId(String mediaId, Bundle extras) { emit("playId", -1, mediaId); }
            // ... and "Hey Google, play <something> on Sonara".
            @Override public void onPlayFromSearch(String query, Bundle extras) { emit("search", -1, query == null ? "" : query); }
            @Override public void onSkipToQueueItem(long id) {
                List<Item> q = library.get(LIST_QUEUE);
                if (q != null && id >= 0 && id < q.size()) emit("playId", -1, LIST_QUEUE + "/" + q.get(0 + (int) id).id);
            }
        });
        setSessionToken(session.getSessionToken());
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        session.setActive(true);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION.equals(intent.getAction()) && token(this).equals(intent.getStringExtra("t"))) {
            emit(intent.getStringExtra("action"), -1);
        }
        startInForeground();
        return START_NOT_STICKY;
    }

    private void emit(String action, long pos) {
        emit(action, pos, null);
    }

    private void emit(String action, long pos, String arg) {
        if (listener != null && action != null) {
            listener.onAction(action, pos, arg);
        } else if (action != null) {
            // The web player is not running (the widget or a car woke the service): open the app.
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (open != null) {
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                open.putExtra("action", action);
                try {
                    startActivity(open);
                } catch (Exception ignored) {
                    // Background activity starts can be blocked: the notification still opens the app.
                }
            }
        }
    }

    // ───────── Browse tree (Android Auto) ─────────

    /** Replace one list of the tree and tell connected browsers. */
    void setList(String list, String title, List<Item> items) {
        library.put(list, items);
        listTitles.put(list, title);
        notifyChildrenChanged(ROOT);
        notifyChildrenChanged(list);
        if (LIST_QUEUE.equals(list)) {
            List<MediaSessionCompat.QueueItem> q = new ArrayList<>();
            for (int i = 0; i < items.size() && i < 100; i++) {
                Item it = items.get(i);
                q.add(new MediaSessionCompat.QueueItem(describe(LIST_QUEUE, it), i));
            }
            session.setQueue(q);
            session.setQueueTitle(title);
        }
    }

    private MediaDescriptionCompat describe(String list, Item it) {
        MediaDescriptionCompat.Builder d = new MediaDescriptionCompat.Builder()
            .setMediaId(list + "/" + it.id)
            .setTitle(it.title)
            .setSubtitle(it.artist);
        if (it.art != null && !it.art.isEmpty()) d.setIconUri(Uri.parse(it.art));
        return d.build();
    }

    @Override
    public BrowserRoot onGetRoot(String clientPackageName, int clientUid, Bundle rootHints) {
        return new BrowserRoot(ROOT, null);
    }

    @Override
    public void onLoadChildren(String parentId, Result<List<MediaBrowserCompat.MediaItem>> result) {
        List<MediaBrowserCompat.MediaItem> out = new ArrayList<>();
        if (ROOT.equals(parentId)) {
            for (String list : new String[] { LIST_QUEUE, LIST_LIKED, LIST_RECENT }) {
                List<Item> items = library.get(list);
                if (items == null || items.isEmpty()) continue;
                String title = listTitles.get(list);
                MediaDescriptionCompat d = new MediaDescriptionCompat.Builder().setMediaId(list).setTitle(title != null ? title : list).build();
                out.add(new MediaBrowserCompat.MediaItem(d, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE));
            }
        } else {
            List<Item> items = library.get(parentId);
            if (items != null) {
                for (Item it : items) out.add(new MediaBrowserCompat.MediaItem(describe(parentId, it), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE));
            }
        }
        result.sendResult(out);
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
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID | PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH
                | PlaybackStateCompat.ACTION_SKIP_TO_QUEUE_ITEM | PlaybackStateCompat.ACTION_STOP)
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, positionMs, playing ? 1f : 0f)
            .build());

        PlayerWidgetProvider.push(this, title, artist, artwork, playing);

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
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(ACTION).putExtra("action", action).putExtra("t", token(this));
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
        PlayerWidgetProvider.push(this, title, artist, artwork, false);
        session.setActive(false);
        session.release();
        io.shutdownNow();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        // The media browser interface for Android Auto; anything else binds to nothing.
        return super.onBind(intent);
    }
}
