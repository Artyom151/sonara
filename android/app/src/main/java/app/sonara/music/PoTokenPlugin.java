package app.sonara.music;

import android.annotation.SuppressLint;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Mints YouTube PO tokens. BotGuard only attests pages on the youtube.com origin, so the minter
 * (assets/pot.js, built from src/core/pot-page.ts) runs in an invisible WebView whose document is
 * loaded with the base URL https://www.youtube.com/ (loadDataWithBaseURL): same origin, no
 * network request for the page itself. Tokens go to the web layer through a JS interface.
 */
@CapacitorPlugin(name = "PoToken")
public class PoTokenPlugin extends Plugin {

    private WebView web;
    private boolean ready = false;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<Integer, PluginCall> calls = new HashMap<>();
    private final AtomicInteger seq = new AtomicInteger();
    private String script;

    private String loadScript() throws Exception {
        if (script != null) return script;
        try (InputStream in = getContext().getAssets().open("pot.js")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            script = out.toString("UTF-8");
        }
        return script;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void ensureWebView(Runnable onReady) {
        if (web != null && ready) {
            onReady.run();
            return;
        }
        if (web == null) {
            web = new WebView(getContext());
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            web.addJavascriptInterface(new Bridge(), "SonaraPot");
            web.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    try {
                        view.evaluateJavascript(loadScript(), v -> {
                            ready = true;
                            onReady.run();
                        });
                    } catch (Exception e) {
                        failAll(String.valueOf(e.getMessage()));
                    }
                }
            });
            web.loadDataWithBaseURL("https://www.youtube.com/", "<!doctype html><html><head><title>pot</title></head><body></body></html>", "text/html", "utf-8", null);
        } else {
            // Page still loading: retry shortly.
            main.postDelayed(() -> ensureWebView(onReady), 150);
        }
    }

    private void failAll(String message) {
        synchronized (calls) {
            for (PluginCall c : calls.values()) c.reject(message);
            calls.clear();
        }
    }

    @PluginMethod
    public void mint(PluginCall call) {
        final String id = call.getString("videoId", "");
        if (!id.matches("[A-Za-z0-9_-]{1,32}")) {
            call.reject("bad video id");
            return;
        }
        final int key = seq.incrementAndGet();
        synchronized (calls) {
            calls.put(key, call);
        }
        main.post(() -> ensureWebView(() ->
            web.evaluateJavascript(
                "window.__mintPot('" + id + "').then(function(t){SonaraPot.ok(" + key + ",t)},function(e){SonaraPot.err(" + key + ",String(e&&e.message||e))})", null)));
        // Do not leave the web layer waiting forever.
        main.postDelayed(() -> {
            PluginCall c;
            synchronized (calls) {
                c = calls.remove(key);
            }
            if (c != null) c.reject("pot mint timed out");
        }, 45_000);
    }

    private class Bridge {
        @JavascriptInterface
        public void ok(int key, String token) {
            PluginCall c;
            synchronized (calls) {
                c = calls.remove(key);
            }
            if (c != null) {
                JSObject r = new JSObject();
                r.put("token", token);
                c.resolve(r);
            }
        }

        @JavascriptInterface
        public void err(int key, String message) {
            PluginCall c;
            synchronized (calls) {
                c = calls.remove(key);
            }
            if (c != null) c.reject(message);
        }
    }
}
