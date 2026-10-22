package app.sonara.music;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.widget.ScrollView;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Shown when the widget is added: pick the shape of its cover from a grid of previews. */
public class WidgetConfigActivity extends Activity {

    private static final int BG = 0xFF0D0E12;
    private static final int CARD = 0xFF1C1C24;
    private static final int TEXT_2 = 0xB3FFFFFF;

    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setResult(RESULT_CANCELED);
        Bundle extras = getIntent().getExtras();
        if (extras != null) widgetId = extras.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        int current = WidgetShapes.load(this, widgetId);

        int pad = dp(20);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, dp(28), pad, pad);
        root.setBackgroundColor(BG);

        TextView title = text(20, Color.WHITE, true);
        title.setText("Cover shape");
        root.addView(title);

        TextView hint = text(13, TEXT_2, false);
        hint.setText("Applies to this widget. You can change it later by adding the widget again.");
        hint.setPadding(0, dp(4), 0, dp(18));
        root.addView(hint);

        // Three cards per row.
        LinearLayout row = null;
        for (int shape = 0; shape < WidgetShapes.COUNT; shape++) {
            if (shape % 3 == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                root.addView(row, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
            }
            row.addView(card(shape, shape == current), new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        }
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(BG);
        scroll.addView(root);
        setContentView(scroll);
    }

    /** One choice: the shape as a preview, its name below, a ring around the chosen one. */
    private View card(int shape, boolean chosen) {
        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.setPadding(dp(8), dp(14), dp(8), dp(12));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(22));
        bg.setColor(CARD);
        if (chosen) bg.setStroke(dp(2), WidgetShapes.ACCENT_COLOR);
        c.setBackground(bg);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(4), dp(4), dp(4), dp(4));
        c.setLayoutParams(lp);

        ImageView preview = new ImageView(this);
        preview.setImageBitmap(WidgetShapes.preview(shape, dp(56)));
        c.addView(preview, new LinearLayout.LayoutParams(dp(56), dp(56)));

        TextView name = text(12, chosen ? Color.WHITE : TEXT_2, chosen);
        name.setGravity(Gravity.CENTER);
        name.setText(WidgetShapes.NAMES[shape]);
        name.setPadding(0, dp(10), 0, 0);
        c.addView(name, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        c.setOnClickListener((View v) -> choose(shape));
        return c;
    }

    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private void choose(int shape) {
        WidgetShapes.store(this, widgetId, shape);
        SonaraWidget.refresh(this, widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
