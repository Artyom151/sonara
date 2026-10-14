package app.sonara.music;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

/**
 * Home screen widget: cover, title, artist and previous / play-pause / next.
 * MediaPlaybackService pushes every state change (push()); the buttons go back to that service,
 * which hands them to the web player. While the app is not running the buttons just open it.
 */
public class PlayerWidgetProvider extends AppWidgetProvider {

    private static String lastTitle = "";
    private static String lastArtist = "";
    private static Bitmap lastArt = null;
    private static boolean lastPlaying = false;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, build(context));
    }

    /** Redraw every instance of the widget with the given state. */
    static void push(Context context, String title, String artist, Bitmap art, boolean playing) {
        lastTitle = title != null ? title : "";
        lastArtist = artist != null ? artist : "";
        lastArt = art;
        lastPlaying = playing;
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, PlayerWidgetProvider.class));
        if (ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) mgr.updateAppWidget(id, views);
    }

    private static RemoteViews build(Context context) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_player);
        v.setTextViewText(R.id.widget_title, lastTitle.isEmpty() ? "Sonara" : lastTitle);
        v.setTextViewText(R.id.widget_artist, lastArtist);
        if (lastArt != null) v.setImageViewBitmap(R.id.widget_art, lastArt);
        else v.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher);
        v.setImageViewResource(R.id.widget_play, lastPlaying ? R.drawable.ic_media_pause : R.drawable.ic_media_play);
        v.setContentDescription(R.id.widget_play, lastPlaying ? "Pause" : "Play");

        PendingIntent open = openApp(context);
        v.setOnClickPendingIntent(R.id.widget_root, open);
        v.setOnClickPendingIntent(R.id.widget_art, open);

        boolean running = MediaPlaybackService.get() != null;
        v.setOnClickPendingIntent(R.id.widget_prev, running ? action(context, "prev", 11) : open);
        v.setOnClickPendingIntent(R.id.widget_play, running ? action(context, lastPlaying ? "pause" : "play", 12) : open);
        v.setOnClickPendingIntent(R.id.widget_next, running ? action(context, "next", 13) : open);
        return v;
    }

    private static PendingIntent openApp(Context context) {
        Intent i = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (i == null) i = new Intent();
        return PendingIntent.getActivity(context, 10, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent action(Context context, String action, int code) {
        Intent i = new Intent(context, MediaPlaybackService.class).setAction(MediaPlaybackService.ACTION).putExtra("action", action).putExtra("t", MediaPlaybackService.token(context));
        return PendingIntent.getService(context, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
