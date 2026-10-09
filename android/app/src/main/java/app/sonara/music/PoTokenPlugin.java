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
import org.json.JSONObject;

/**
 * Mints YouTube PO tokens. BotGuard only attests pages on the youtube.com origin, so the minter
 * (assets/pot.js, built from src/core/pot-page.ts) runs in an invisible WebView on a real
 * youtube.com page (robots.txt: tiny, no scripts of its own), like the desktop app does. A
 * document from loadDataWithBaseURL looks same-origin to JS but is not attested: GenerateIT then
 * returns no integrity token. Tokens go to the web layer through a JS interface.
 */
@CapacitorPlugin(name = "PoToken")
public class PoTokenPlugin extends Plugin {

    private static final String DESKTOP_UA =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

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
            // With the WebView's mobile UA, www.youtube.com redirects to m.youtube.com, whose
            // challenge GenerateIT answers without an integrity token. A desktop UA keeps www.
            s.setUserAgentString(DESKTOP_UA);
            web.addJavascriptInterface(new Bridge(), "SonaraPot");
            web.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    if (ready || url == null || !url.startsWith("https://www.youtube.com/")) return;
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
            web.loadUrl("https://www.youtube.com/robots.txt");
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

    /** fetch() inside the youtube.com page, injected next to the minter. */
    private static final String FETCH_JS =
        "window.__sonaraFetch=function(k,u,o,bin,ms){"
        + "var c=new AbortController();var t=setTimeout(function(){c.abort()},ms||20000);"
        + "o.signal=c.signal;o.credentials='omit';o.cache='no-store';if(o.mode==null)delete o.mode;"
        + "fetch(u,o).then(function(r){var h={};r.headers.forEach(function(v,n){h[n]=v});"
        + "return (bin?r.arrayBuffer().then(function(b){var a=new Uint8Array(b),s='',i;"
        + "for(i=0;i<a.length;i+=32768)s+=String.fromCharCode.apply(null,a.subarray(i,i+32768));return btoa(s)}):r.text())"
        + ".then(function(body){clearTimeout(t);SonaraPot.fetched(k,r.status,JSON.stringify(h),body)})})"
        + ".catch(function(e){clearTimeout(t);SonaraPot.err(k,String(e&&e.message||e))})};";

    /**
     * A request made by Chromium from the youtube.com page instead of HttpURLConnection. With the
     * DPI bypass on this is what gets YouTube through: Chromium's ClientHello is large (post-quantum
     * key share, two TCP segments), and DPI that reassembles a small one sees through every split.
     */
    @PluginMethod
    public void fetch(PluginCall call) {
        final String url = call.getString("url", "");
        if (!url.startsWith("https://")) {
            call.reject("bad url");
            return;
        }
        JSObject init = new JSObject();
        init.put("method", call.getString("method", "GET"));
        JSObject headers = call.getObject("headers", new JSObject());
        init.put("headers", headers);
        String mode = call.getString("mode");
        if (mode != null) init.put("mode", mode);
        String body = call.getString("body");
        if (body != null) init.put("body", body);
        final boolean binary = Boolean.TRUE.equals(call.getBoolean("binary", false));
        final int timeout = call.getInt("timeout", 20000);
        final int key = seq.incrementAndGet();
        synchronized (calls) {
            calls.put(key, call);
        }
        final String js = "window.__sonaraFetch(" + key + "," + JSONObject.quote(url) + "," + init + "," + binary + "," + timeout + ")";
        main.post(() -> ensureWebView(() -> web.evaluateJavascript(FETCH_JS + js, null)));
        main.postDelayed(() -> {
            PluginCall c;
            synchronized (calls) {
                c = calls.remove(key);
            }
            if (c != null) c.reject("fetch timed out");
        }, timeout + 5000L);
    }

    private class Bridge {
        @JavascriptInterface
        public void fetched(int key, int status, String headers, String body) {
            PluginCall c;
            synchronized (calls) {
                c = calls.remove(key);
            }
            if (c == null) return;
            JSObject r = new JSObject();
            r.put("status", status);
            try {
                r.put("headers", new JSObject(headers));
            } catch (Exception e) {
                r.put("headers", new JSObject());
            }
            r.put("data", body);
            c.resolve(r);
        }

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
