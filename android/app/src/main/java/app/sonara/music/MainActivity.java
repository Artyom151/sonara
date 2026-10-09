package app.sonara.music;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Android 12+ system splash (logo on black), then the in-app "sonara" motion splash.
        SplashScreen.installSplashScreen(this);
        registerPlugin(DynamicColorPlugin.class);
        registerPlugin(MediaControlsPlugin.class);
        registerPlugin(PoTokenPlugin.class);
        registerPlugin(BypassPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
