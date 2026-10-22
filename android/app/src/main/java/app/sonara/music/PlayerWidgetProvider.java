package app.sonara.music;

/** The 4x1 bar: cover, title, artist and previous / play-pause / next. */
public class PlayerWidgetProvider extends SonaraWidget {

    @Override
    protected int layout() {
        return R.layout.widget_player;
    }
}
