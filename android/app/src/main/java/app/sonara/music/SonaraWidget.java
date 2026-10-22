package app.sonara.music;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Base of the home screen widgets (4x1 bar, 2x2 cover, 4x2 large). They share one state, pushed by
 * MediaPlaybackService through push(). Every layout has the same view ids; the ones a size does not
 * show are GONE, so one render() fills all of them. The buttons go back to the service, which hands
 * them to the web player; while the app is not running they just open it. Each instance has its own
 * cover shape, chosen in WidgetConfigActivity, at every size.
 */
public abstract class SonaraWidget extends AppWidgetProvider {

    private static String lastTitle = "";
    private static String lastArtist = "";
    private static Bitmap lastArt = null;
    private static boolean lastPlaying = false;
    private static String lastLyric = "";

    /** The layout of this size. */
    protected abstract int layout();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, render(context, id, layout()));
    }

    @Override
    public void onDeleted(Context context, int[] ids) {
        for (int id : ids) WidgetShapes.forget(context, id);
    }

    /** Redraw every instance of every size with the given state. */
    static void push(Context context, String title, String artist, Bitmap art, boolean playing) {
        lastTitle = title != null ? title : "";
        lastArtist = artist != null ? artist : "";
        lastArt = art;
        lastPlaying = playing;
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        draw(context, mgr, PlayerWidgetProvider.class, R.layout.widget_player);
        draw(context, mgr, CoverWidgetProvider.class, R.layout.widget_cover);
        draw(context, mgr, LargeWidgetProvider.class, R.layout.widget_large);
    }

    /** The current lyric line, drawn in place of the artist ("" shows the artist again). */
    static void setLyric(String text) {
        lastLyric = text == null ? "" : text;
    }

    /** Redraw one instance, right after its shape was picked. */
    static void refresh(Context context, int widgetId) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        AppWidgetProviderInfo info = mgr.getAppWidgetInfo(widgetId);
        if (info == null) return;
        String provider = info.provider.getClassName();
        int layout = provider.equals(CoverWidgetProvider.class.getName()) ? R.layout.widget_cover
            : provider.equals(LargeWidgetProvider.class.getName()) ? R.layout.widget_large
            : R.layout.widget_player;
        mgr.updateAppWidget(widgetId, render(context, widgetId, layout));
    }

    private static void draw(Context context, AppWidgetManager mgr, Class<?> provider, int layout) {
        for (int id : mgr.getAppWidgetIds(new ComponentName(context, provider))) {
            mgr.updateAppWidget(id, render(context, id, layout));
        }
    }

    private static RemoteViews render(Context context, int widgetId, int layout) {
        RemoteViews v = new RemoteViews(context.getPackageName(), layout);
        v.setTextViewText(R.id.widget_title, lastTitle.isEmpty() ? "Sonara" : lastTitle);
        v.setTextViewText(R.id.widget_artist, lastLyric.isEmpty() ? lastArtist : lastLyric);
        Bitmap art = WidgetShapes.mask(lastArt, WidgetShapes.load(context, widgetId));
        if (art != null) v.setImageViewBitmap(R.id.widget_art, art);
        else v.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher);
        v.setImageViewBitmap(R.id.widget_play, WidgetShapes.playButton(lastPlaying));
        v.setContentDescription(R.id.widget_play, lastPlaying ? "Pause" : "Play");

        PendingIntent open = openApp(context);
        v.setOnClickPendingIntent(R.id.widget_root, open);
        v.setOnClickPendingIntent(R.id.widget_art, open);

        boolean running = MediaPlaybackService.get() != null;
        v.setOnClickPendingIntent(R.id.widget_prev, running ? action(context, "prev", 11) : open);
        v.setOnClickPendingIntent(R.id.widget_play, running ? action(context, lastPlaying ? "pause" : "play", 12) : open);
        v.setOnClickPendingIntent(R.id.widget_next, running ? action(context, "next", 13) : open);
        // Hide the controls this size does not have (the cover size shows only the play button).
        boolean full = layout != R.layout.widget_cover;
        v.setViewVisibility(R.id.widget_prev, full ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_next, full ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_title, full ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.widget_artist, full ? View.VISIBLE : View.GONE);
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
