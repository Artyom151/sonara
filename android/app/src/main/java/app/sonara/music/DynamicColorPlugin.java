package app.sonara.music;

import android.content.Context;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes the Android 12+ (API 31) Material You system palette, derived from
 * the user's wallpaper, to the web layer. The app builds its whole interface
 * palette from the returned seed (system_accent1_500).
 */
@CapacitorPlugin(name = "DynamicColor")
public class DynamicColorPlugin extends Plugin {

    private static String hex(int color) {
        return String.format("#%06X", 0xFFFFFF & color);
    }

    @PluginMethod
    public void getColors(PluginCall call) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("supported", false);
            call.resolve(result);
            return;
        }
        Context c = getContext();
        result.put("supported", true);
        result.put("seed", hex(c.getColor(android.R.color.system_accent1_500)));
        result.put("accent1", hex(c.getColor(android.R.color.system_accent1_200)));
        result.put("accent2", hex(c.getColor(android.R.color.system_accent2_200)));
        result.put("accent3", hex(c.getColor(android.R.color.system_accent3_200)));
        result.put("neutral1", hex(c.getColor(android.R.color.system_neutral1_900)));
        call.resolve(result);
    }
}
