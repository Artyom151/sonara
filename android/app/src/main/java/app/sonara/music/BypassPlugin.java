package app.sonara.music;

import android.util.Log;
import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Built-in DPI bypass on Android (src/platform/dpi.ts). Starts DpiProxy and routes the app's own
 * traffic through it while it is on:
 *  - HttpURLConnection (CapacitorHttp) via the default ProxySelector, only for the bypass hosts;
 *  - every WebView of the app (audio, artwork, the PO token page) via ProxyController.
 * No VPN, no root: other apps are not affected.
 */
@CapacitorPlugin(name = "Bypass")
public class BypassPlugin extends Plugin {

    private static final String TAG = "SonaraDpi";
    private static ProxySelector systemSelector;

    @PluginMethod
    public void configure(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        JSArray in = call.getArray("rules", new JSArray());
        List<DpiProxy.Rule> rules = new ArrayList<>();
        List<String> hosts = new ArrayList<>();
        try {
            for (int i = 0; i < in.length(); i++) {
                JSONObject r = in.getJSONObject(i);
                JSONArray hs = r.getJSONArray("hosts");
                String[] list = new String[hs.length()];
                for (int j = 0; j < hs.length(); j++) {
                    list[j] = hs.getString(j).toLowerCase(Locale.ROOT);
                    hosts.add(list[j]);
                }
                try {
                    rules.add(new DpiProxy.Rule(list, DpiProxy.Strategy.parse(r.getString("strategy"))));
                } catch (IllegalArgumentException e) {
                    call.reject((list.length > 0 ? list[0] : "") + ": " + e.getMessage());
                    return;
                }
            }
        } catch (Exception e) {
            call.reject("bad rules: " + e.getMessage());
            return;
        }
        int port = DpiProxy.configure(on, rules);
        applySelector(port);
        applyWebView(port, hosts, () -> {
            JSObject res = new JSObject();
            res.put("proxy", port != 0 ? "http://127.0.0.1:" + port : null);
            call.resolve(res);
        });
    }

    /**
     * Tries each strategy against real URLs of one service, through the proxy, with fresh
     * connections: the fastest one that loads every URL wins. The caller re-applies its own
     * rules afterwards (configure).
     */
    @PluginMethod
    public void probe(PluginCall call) {
        JSArray hs = call.getArray("hosts", new JSArray());
        JSArray ss = call.getArray("strategies", new JSArray());
        JSArray us = call.getArray("urls", new JSArray());
        new Thread(() -> {
            try {
                String[] hosts = new String[hs.length()];
                for (int i = 0; i < hosts.length; i++) hosts[i] = hs.getString(i).toLowerCase(Locale.ROOT);
                JSArray results = new JSArray();
                for (int i = 0; i < ss.length(); i++) {
                    String st = ss.getString(i);
                    int port = DpiProxy.configure(true, Collections.singletonList(new DpiProxy.Rule(hosts, DpiProxy.Strategy.parse(st))));
                    Proxy proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", port));
                    long t0 = System.currentTimeMillis();
                    long bytes = 0;
                    boolean ok = true;
                    for (int j = 0; j < us.length() && ok; j++) {
                        long b = fetch(us.getString(j), proxy);
                        ok = b >= 0;
                        bytes += Math.max(b, 0);
                    }
                    JSObject r = new JSObject();
                    r.put("strategy", st);
                    r.put("ok", ok);
                    r.put("ms", System.currentTimeMillis() - t0);
                    r.put("bytes", bytes);
                    Log.i(TAG, "probe " + st + ": " + (ok ? "ok" : "fail") + " " + (System.currentTimeMillis() - t0) + " ms");
                    results.put(r);
                }
                JSObject res = new JSObject();
                res.put("results", results);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("probe: " + e.getMessage());
            }
        }, "sonara-dpi-probe").start();
    }

    /** Bytes of the body, or -1 on any failure (8 s budget, a new connection each time). */
    private static long fetch(String url, Proxy proxy) {
        try {
            java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection(proxy);
            c.setConnectTimeout(6000);
            c.setReadTimeout(6000);
            c.setRequestProperty("Connection", "close");
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Mobile Safari/537.36");
            long deadline = System.currentTimeMillis() + 8000;
            int code = c.getResponseCode();
            if (code >= 400) return -1;
            long n = 0;
            try (java.io.InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16 * 1024];
                int k;
                // The start is enough: a throttled service still passed the handshake.
                while (n < 16 * 1024 && (k = in.read(buf)) > 0) {
                    n += k;
                    if (System.currentTimeMillis() > deadline) return -1;
                }
            } finally {
                c.disconnect();
            }
            return n;
        } catch (Exception e) {
            return -1;
        }
    }

    /** HttpURLConnection: the bypass hosts through the proxy, everything else as before. */
    private static synchronized void applySelector(int port) {
        if (systemSelector == null) systemSelector = ProxySelector.getDefault();
        if (port == 0) {
            ProxySelector.setDefault(systemSelector);
            return;
        }
        final Proxy proxy = new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", port));
        ProxySelector.setDefault(new ProxySelector() {
            @Override
            public List<Proxy> select(URI uri) {
                if (DpiProxy.matches(uri.getHost())) return Collections.singletonList(proxy);
                return systemSelector != null ? systemSelector.select(uri) : Collections.singletonList(Proxy.NO_PROXY);
            }

            @Override
            public void connectFailed(URI uri, SocketAddress sa, IOException e) {
                Log.d(TAG, "proxy connect failed: " + uri + " " + e.getMessage());
            }
        });
    }

    /** All WebViews: through the proxy (only the bypass hosts when reverse bypass is supported). */
    private void applyWebView(int port, List<String> hosts, Runnable done) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            Log.w(TAG, "WebView proxy override not supported: media goes direct");
            done.run();
            return;
        }
        ProxyController pc = ProxyController.getInstance();
        if (port == 0) {
            pc.clearProxyOverride(Runnable::run, done);
            return;
        }
        ProxyConfig.Builder b = new ProxyConfig.Builder().addProxyRule("127.0.0.1:" + port);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE_REVERSE_BYPASS)) {
            // Reverse: the listed hosts use the proxy, the rest (the app itself, lrclib, ...) goes direct.
            for (String h : hosts) {
                b.addBypassRule(h);
                b.addBypassRule("*." + h);
            }
            b.setReverseBypassEnabled(true);
        } else {
            // The proxy passes non-bypass hosts through untouched; keep loopback direct.
            b.bypassSimpleHostnames().addBypassRule("127.0.0.1").addBypassRule("localhost");
        }
        try {
            pc.setProxyOverride(b.build(), Runnable::run, done);
        } catch (Exception e) {
            Log.w(TAG, "WebView proxy: " + e.getMessage());
            done.run();
        }
    }
}
