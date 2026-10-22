package app.sonara.music;

/** The 2x2 cover: the shaped cover with a play / pause button. */
public class CoverWidgetProvider extends SonaraWidget {

    @Override
    protected int layout() {
        return R.layout.widget_cover;
    }
}
