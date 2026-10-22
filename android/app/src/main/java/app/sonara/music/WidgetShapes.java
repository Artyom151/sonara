package app.sonara.music;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;

import androidx.compose.material3.MaterialShapes;
import androidx.graphics.shapes.RoundedPolygon;
import androidx.graphics.shapes.Shapes_androidKt;

/**
 * The cover shapes of the home screen widgets: every preset of Material 3's MaterialShapes
 * (material3 1.5.0-alpha29). The cover is cut to the shape as a bitmap, because RemoteViews cannot
 * clip an ImageView to a path. The play / pause button is the 9-sided cookie with its glyph.
 */
final class WidgetShapes {

    /** The presets in the order of the picker; the 9-sided cookie comes first and is the default. */
    static final String[] NAMES = {
        "9-sided cookie", "Circle", "Square", "Slanted", "Arch", "Fan", "Arrow", "Semi circle", "Oval", "Pill",
        "Triangle", "Diamond", "Clam shell", "Pentagon", "Gem", "Sunny", "Very sunny", "4-sided cookie", "6-sided cookie",
        "7-sided cookie", "12-sided cookie", "Ghostish", "4-leaf clover", "8-leaf clover", "Burst", "Soft burst", "Boom",
        "Soft boom", "Flower", "Puffy", "Puffy diamond", "Pixel circle", "Pixel triangle", "Bun", "Heart",
    };
    static final int COOKIE = 0;
    static final int COUNT = NAMES.length;

    /** The cover bitmap: sharp at the widget sizes (the sources are 500 px and up). */
    private static final int SIZE = 320;
    /** Empty margin around the shape, so it never touches the edge of the widget. */
    private static final float MARGIN = 0.07f;
    private static final int BUTTON = 168;
    private static final int GLYPH = 0xFF101014;
    static final int ACCENT_COLOR = 0xFFC4B5FD;

    private WidgetShapes() {}

    /** The cover cropped to the shape. A null cover stays null: the widget shows its placeholder. */
    static Bitmap mask(Bitmap art, int shape) {
        if (art == null) return null;
        Bitmap out = Bitmap.createBitmap(SIZE, SIZE, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        fill.setColor(0xFFFFFFFF);
        c.drawPath(path(shape, SIZE), fill);
        // Centre-crop the cover into the square, keeping only what the shape covers.
        int side = Math.min(art.getWidth(), art.getHeight());
        Rect src = new Rect((art.getWidth() - side) / 2, (art.getHeight() - side) / 2, (art.getWidth() + side) / 2, (art.getHeight() + side) / 2);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        p.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        c.drawBitmap(art, src, new RectF(0, 0, SIZE, SIZE), p);
        return out;
    }

    /** A shape filled with the app's accent colour, for the picker. */
    static Bitmap preview(int shape, int size) {
        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(ACCENT_COLOR);
        new Canvas(out).drawPath(path(shape, size), paint);
        return out;
    }

    /** The play / pause button: an accent-coloured cookie with a dark glyph. */
    static Bitmap playButton(boolean playing) {
        Bitmap out = Bitmap.createBitmap(BUTTON, BUTTON, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(ACCENT_COLOR);
        c.drawPath(path(COOKIE, BUTTON), paint);
        paint.setColor(GLYPH);
        float cx = BUTTON / 2f;
        float u = BUTTON / 10f;
        if (playing) {
            c.drawRoundRect(new RectF(cx - 1.6f * u, cx - 2.2f * u, cx - 0.4f * u, cx + 2.2f * u), u * 0.3f, u * 0.3f, paint);
            c.drawRoundRect(new RectF(cx + 0.4f * u, cx - 2.2f * u, cx + 1.6f * u, cx + 2.2f * u), u * 0.3f, u * 0.3f, paint);
        } else {
            Path tri = new Path();
            tri.moveTo(cx - 1.5f * u, cx - 2.4f * u);
            tri.lineTo(cx + 2.4f * u, cx);
            tri.lineTo(cx - 1.5f * u, cx + 2.4f * u);
            tri.close();
            c.drawPath(tri, paint);
        }
        return out;
    }

    /** The shape chosen for one widget instance (the cookie until it is picked). */
    static int load(Context context, int widgetId) {
        return prefs(context).getInt("w" + widgetId, COOKIE);
    }

    static void store(Context context, int widgetId, int shape) {
        prefs(context).edit().putInt("w" + widgetId, shape).apply();
    }

    static void forget(Context context, int widgetId) {
        prefs(context).edit().remove("w" + widgetId).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("widget_shapes", Context.MODE_PRIVATE);
    }

    /** The outline of a shape, scaled to fit a square of the given size with the margin around it. */
    static Path path(int shape, int size) {
        float m = size * MARGIN;
        Path p = Shapes_androidKt.toPath(polygon(shape));
        RectF bounds = new RectF();
        p.computeBounds(bounds, true);
        // Uniform scale, so the shape keeps its proportions.
        Matrix t = new Matrix();
        t.setRectToRect(bounds, new RectF(m, m, size - m, size - m), Matrix.ScaleToFit.CENTER);
        p.transform(t);
        return p;
    }

    /** The Material 3 preset for an index of NAMES. */
    private static RoundedPolygon polygon(int shape) {
        switch (shape) {
            case 0: return MaterialShapes.Companion.getCookie9Sided();
            case 1: return MaterialShapes.Companion.getCircle();
            case 2: return MaterialShapes.Companion.getSquare();
            case 3: return MaterialShapes.Companion.getSlanted();
            case 4: return MaterialShapes.Companion.getArch();
            case 5: return MaterialShapes.Companion.getFan();
            case 6: return MaterialShapes.Companion.getArrow();
            case 7: return MaterialShapes.Companion.getSemiCircle();
            case 8: return MaterialShapes.Companion.getOval();
            case 9: return MaterialShapes.Companion.getPill();
            case 10: return MaterialShapes.Companion.getTriangle();
            case 11: return MaterialShapes.Companion.getDiamond();
            case 12: return MaterialShapes.Companion.getClamShell();
            case 13: return MaterialShapes.Companion.getPentagon();
            case 14: return MaterialShapes.Companion.getGem();
            case 15: return MaterialShapes.Companion.getSunny();
            case 16: return MaterialShapes.Companion.getVerySunny();
            case 17: return MaterialShapes.Companion.getCookie4Sided();
            case 18: return MaterialShapes.Companion.getCookie6Sided();
            case 19: return MaterialShapes.Companion.getCookie7Sided();
            case 20: return MaterialShapes.Companion.getCookie12Sided();
            case 21: return MaterialShapes.Companion.getGhostish();
            case 22: return MaterialShapes.Companion.getClover4Leaf();
            case 23: return MaterialShapes.Companion.getClover8Leaf();
            case 24: return MaterialShapes.Companion.getBurst();
            case 25: return MaterialShapes.Companion.getSoftBurst();
            case 26: return MaterialShapes.Companion.getBoom();
            case 27: return MaterialShapes.Companion.getSoftBoom();
            case 28: return MaterialShapes.Companion.getFlower();
            case 29: return MaterialShapes.Companion.getPuffy();
            case 30: return MaterialShapes.Companion.getPuffyDiamond();
            case 31: return MaterialShapes.Companion.getPixelCircle();
            case 32: return MaterialShapes.Companion.getPixelTriangle();
            case 33: return MaterialShapes.Companion.getBun();
            default: return MaterialShapes.Companion.getHeart();
        }
    }
}
