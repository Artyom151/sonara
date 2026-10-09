package app.sonara.music;

import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.system.StructTimeval;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.FileDescriptor;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Built-in DPI bypass ("Обход блокировок") for Android: a port of src-tauri/src/dpi.rs.
 *
 * A local HTTP CONNECT / SOCKS5 proxy on 127.0.0.1 that sends the first bytes of each tunnel (the
 * TLS ClientHello) so that keyword-matching DPI cannot read the host name, while the server still
 * receives the exact same handshake. Same strategy syntax as desktop:
 * {@code tlsrec=POS, split=POS, disorder, delay=MS}; POS is a byte offset or sni, sni+2, sni-1.
 * {@code disorder} sends the first segment with TTL 1 (dropped at the first router, retransmitted
 * by the kernel later), so the server gets it out of order. BypassPlugin routes the app's
 * HttpURLConnection (CapacitorHttp) and WebView traffic here.
 */
public final class DpiProxy {

    private static final String TAG = "SonaraDpi";

    /** Position: NONE, absolute offset, or relative to the first byte of the SNI host name. */
    static final class Pos {
        static final Pos NONE = new Pos(0, 0);
        final int kind; // 0 none, 1 abs, 2 sni
        final int value;

        Pos(int kind, int value) {
            this.kind = kind;
            this.value = value;
        }

        @Override
        public boolean equals(Object o) {
            return o instanceof Pos && ((Pos) o).kind == kind && ((Pos) o).value == value;
        }

        @Override
        public int hashCode() {
            return kind * 31 + value;
        }
    }

    static final class Strategy {
        Pos tlsrec = Pos.NONE;
        Pos split = Pos.NONE;
        boolean disorder;
        /** Send one extra byte with TCP URG after the first segment: the server drops it, DPI does not. */
        boolean oob;
        long delayMs;

        /** "tlsrec=sni+1,split=sni+3,disorder,delay=5" */
        static Strategy parse(String s) {
            Strategy out = new Strategy();
            for (String raw : s.split("[, ]")) {
                String part = raw.trim();
                if (part.isEmpty()) continue;
                int eq = part.indexOf('=');
                String k = eq < 0 ? part : part.substring(0, eq);
                String v = eq < 0 ? "" : part.substring(eq + 1);
                switch (k) {
                    case "tlsrec":
                        out.tlsrec = parsePos(v);
                        break;
                    case "split":
                        out.split = parsePos(v);
                        break;
                    case "oob":
                        out.oob = true;
                        if (!v.isEmpty()) out.split = parsePos(v);
                        break;
                    case "disorder":
                        out.disorder = true;
                        if (!v.isEmpty()) out.split = parsePos(v);
                        break;
                    case "delay":
                        try {
                            out.delayMs = Long.parseLong(v);
                        } catch (NumberFormatException e) {
                            throw new IllegalArgumentException("bad delay: " + v);
                        }
                        break;
                    default:
                        throw new IllegalArgumentException("unknown option: " + k);
                }
            }
            if ((out.disorder || out.oob) && out.split.equals(Pos.NONE)) out.split = new Pos(2, 1);
            return out;
        }
    }

    static Pos parsePos(String v) {
        try {
            if (v.startsWith("sni")) {
                String rest = v.substring(3);
                if (rest.isEmpty()) return new Pos(2, 0);
                return new Pos(2, Integer.parseInt(rest.startsWith("+") ? rest.substring(1) : rest));
            }
            int n = Integer.parseInt(v);
            if (n < 0) throw new NumberFormatException();
            return new Pos(1, n);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("bad position: " + v);
        }
    }

    private static int u16(byte[] b, int at) {
        return ((b[at] & 0xff) << 8) | (b[at + 1] & 0xff);
    }

    /** {start, length} of the SNI host name inside a TLS ClientHello record, or null. */
    static int[] sniOffset(byte[] buf, int len) {
        // record: type(1)=0x16 version(2) len(2); handshake: type(1)=1 len(3)
        if (len < 9 || buf[0] != 0x16 || buf[5] != 0x01) return null;
        try {
            int p = 9 + 2 + 32; // client version + random
            if (p >= len) return null;
            p += 1 + (buf[p] & 0xff);
            if (p + 2 > len) return null;
            p += 2 + u16(buf, p);
            if (p >= len) return null;
            p += 1 + (buf[p] & 0xff);
            if (p + 2 > len) return null;
            int end = Math.min(p + 2 + u16(buf, p), len);
            p += 2;
            while (p + 4 <= end) {
                int ty = u16(buf, p);
                int l = u16(buf, p + 2);
                if (ty == 0) {
                    // server_name: list len(2) type(1) name len(2) name
                    int q = p + 4;
                    if (q + 5 > len) return null;
                    int nameLen = u16(buf, q + 3);
                    int start = q + 5;
                    return start + nameLen <= len ? new int[] {start, nameLen} : null;
                }
                p += 4 + l;
            }
        } catch (ArrayIndexOutOfBoundsException ignored) {
            // truncated hello
        }
        return null;
    }

    private static int resolve(Pos pos, int[] sni, int len) {
        int at;
        if (pos.kind == 1) at = pos.value;
        else if (pos.kind == 2 && sni != null) at = sni[0] + pos.value;
        else return -1;
        return at > 0 && at < len ? at : -1;
    }

    /** The bytes to send and where to cut them into TCP segments (-1: no cut). */
    static final class Plan {
        final byte[] data;
        final int split;

        Plan(byte[] data, int split) {
            this.data = data;
            this.split = split;
        }
    }

    static Plan plan(byte[] first, Strategy st) {
        int len = first.length;
        int[] sni = sniOffset(first, len);
        byte[] data = first;
        int shiftAfter = Integer.MAX_VALUE; // positions >= this moved by 5 (the second record header)
        int at = resolve(st.tlsrec, sni, len);
        if (at > 0) {
            int recLen = u16(first, 3);
            // Only when the whole record is in this chunk and the cut falls inside its payload.
            if (at > 5 && 5 + recLen <= len && at < 5 + recLen) {
                int cut = at - 5;
                ByteArrayOutputStream out = new ByteArrayOutputStream(len + 5);
                out.write(0x16);
                out.write(first[1]);
                out.write(first[2]);
                out.write(cut >> 8);
                out.write(cut);
                out.write(first, 5, cut);
                out.write(0x16);
                out.write(first[1]);
                out.write(first[2]);
                out.write((recLen - cut) >> 8);
                out.write(recLen - cut);
                out.write(first, at, recLen - cut);
                out.write(first, 5 + recLen, len - 5 - recLen);
                data = out.toByteArray();
                shiftAfter = at;
            }
        }
        int split = resolve(st.split, sni, len);
        if (split >= shiftAfter) split += 5;
        if (split >= data.length) split = -1;
        return new Plan(data, split);
    }

    static final class Rule {
        final String[] hosts;
        final Strategy strategy;

        Rule(String[] hosts, Strategy strategy) {
            this.hosts = hosts;
            this.strategy = strategy;
        }
    }

    private static volatile boolean enabled;
    private static volatile List<Rule> rules = new ArrayList<>();
    private static int port;
    private static final ExecutorService pool = Executors.newCachedThreadPool();

    static Strategy strategyFor(String host) {
        if (!enabled) return null;
        String h = host.toLowerCase(Locale.ROOT);
        for (Rule r : rules) {
            for (String s : r.hosts) {
                if (h.equals(s) || h.endsWith("." + s)) return r.strategy;
            }
        }
        return null;
    }

    /** Whether a host is covered by one of the active rules. */
    static boolean matches(String host) {
        return host != null && strategyFor(host) != null;
    }

    /** Port of the running proxy when the bypass is on, else 0. */
    static synchronized int activePort() {
        return enabled ? port : 0;
    }

    /** Turn the bypass on/off and set the rules. Returns the port when on, else 0. */
    static synchronized int configure(boolean on, List<Rule> newRules) {
        rules = newRules;
        if (on && port == 0) port = start();
        enabled = on && port != 0;
        return activePort();
    }

    private static int start() {
        try {
            ServerSocket server = new ServerSocket();
            server.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0));
            Thread t = new Thread(() -> {
                while (true) {
                    try {
                        Socket c = server.accept();
                        pool.execute(() -> {
                            try {
                                handle(c);
                            } catch (IOException e) {
                                Log.d(TAG, "tunnel: " + e.getMessage());
                            } finally {
                                closeQuietly(c);
                            }
                        });
                    } catch (IOException e) {
                        Log.w(TAG, "accept: " + e.getMessage());
                    }
                }
            }, "sonara-dpi");
            t.setDaemon(true);
            t.start();
            return server.getLocalPort();
        } catch (IOException e) {
            Log.w(TAG, "proxy: " + e.getMessage());
            return 0;
        }
    }

    private static void closeQuietly(Socket s) {
        try {
            s.close();
        } catch (IOException ignored) {
        }
    }

    private static void readFully(InputStream in, byte[] b) throws IOException {
        int n = 0;
        while (n < b.length) {
            int k = in.read(b, n, b.length - n);
            if (k < 0) throw new IOException("eof");
            n += k;
        }
    }

    /** Upstream connection on a socket we own, so IP_TTL can be set on its descriptor directly. */
    static final class Upstream implements java.io.Closeable {
        final Socket socket; // JVM fallback (unit tests), else null
        final FileDescriptor fd;
        final InputStream in;
        final OutputStream out;
        final boolean v6;
        String ip = "?";

        Upstream(Socket s) throws IOException {
            socket = s;
            fd = null;
            in = s.getInputStream();
            out = s.getOutputStream();
            v6 = s.getInetAddress() instanceof Inet6Address;
        }

        Upstream(FileDescriptor fd, boolean v6) {
            socket = null;
            this.fd = fd;
            in = new FileInputStream(fd);
            out = new FileOutputStream(fd);
            this.v6 = v6;
        }

        void noDelay() {
            try {
                if (socket != null) socket.setTcpNoDelay(true);
                else Os.setsockoptInt(fd, OsConstants.IPPROTO_TCP, OsConstants.TCP_NODELAY, 1);
            } catch (Exception ignored) {
            }
        }

        /** One urgent byte (MSG_OOB): not part of the stream the server reads. */
        void urgent() throws IOException {
            try {
                if (socket != null) socket.sendUrgentData('a');
                else Os.sendto(fd, new byte[] {'a'}, 0, 1, OsConstants.MSG_OOB, null, 0);
            } catch (ErrnoException | java.net.SocketException e) {
                throw new IOException("oob: " + e.getMessage());
            }
        }

        void ttl(int ttl) {
            if (fd == null) return;
            try {
                if (v6) Os.setsockoptInt(fd, OsConstants.IPPROTO_IPV6, OsConstants.IPV6_UNICAST_HOPS, ttl);
                else Os.setsockoptInt(fd, OsConstants.IPPROTO_IP, 2 /* IP_TTL */, ttl);
            } catch (Exception e) {
                Log.d(TAG, "ttl: " + e.getMessage());
            }
        }

        void shutdownOutput() {
            try {
                if (socket != null) socket.shutdownOutput();
                else Os.shutdown(fd, OsConstants.SHUT_WR);
            } catch (Exception ignored) {
            }
        }

        @Override
        public void close() {
            try {
                if (socket != null) socket.close();
                else Os.close(fd);
            } catch (Exception ignored) {
            }
        }
    }

    private static final int CONNECT_TIMEOUT_MS = 7_000;

    /**
     * The first reachable address, IPv4 first: a broken IPv6 route on mobile networks would
     * otherwise stall every tunnel (the WebView alone falls back with happy eyeballs).
     */
    private static Upstream connect(String host, int p) throws IOException {
        InetAddress[] all = resolve(host);
        List<InetAddress> order = new ArrayList<>();
        for (InetAddress a : all) if (!(a instanceof Inet6Address)) order.add(a);
        for (InetAddress a : all) if (a instanceof Inet6Address) order.add(a);
        IOException last = new IOException("no address: " + host);
        for (InetAddress a : order) {
            try {
                return open(a, p);
            } catch (IOException e) {
                last = e;
            }
        }
        throw last;
    }

    /** DNS-over-HTTPS servers, by IP so they need no DNS themselves. */
    private static final String[] DOH = {
        "https://1.1.1.1/dns-query?type=A&name=",
        "https://8.8.8.8/resolve?type=A&name=",
        "https://9.9.9.9:5053/dns-query?type=A&name=",
    };
    private static final java.util.regex.Pattern A_RECORD =
        java.util.regex.Pattern.compile("\"type\"\\s*:\\s*1\\s*,[^}]*?\"data\"\\s*:\\s*\"(\\d{1,3}(?:\\.\\d{1,3}){3})\"");
    private static final java.util.Map<String, Object[]> dnsCache = new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * Providers also block by DNS (www.youtube.com: "No address associated with hostname"), and
     * then no desync helps. Hosts under a bypass rule resolve over DoH first, the rest fall back
     * to it when the system resolver fails.
     */
    static InetAddress[] resolve(String host) throws IOException {
        if (isIpLiteral(host)) return InetAddress.getAllByName(host);
        boolean bypass = strategyFor(host) != null;
        if (bypass) {
            InetAddress[] a = doh(host);
            if (a != null) return a;
        }
        try {
            InetAddress[] a = InetAddress.getAllByName(host);
            if (a.length > 0 && !a[0].isAnyLocalAddress() && !a[0].isLoopbackAddress()) return a;
        } catch (IOException e) {
            if (bypass) throw e;
        }
        InetAddress[] a = bypass ? null : doh(host);
        if (a == null) throw new java.net.UnknownHostException(host);
        return a;
    }

    private static boolean isIpLiteral(String host) {
        return host.indexOf(':') >= 0 || host.matches("\\d{1,3}(\\.\\d{1,3}){3}");
    }

    static InetAddress[] doh(String host) {
        Object[] hit = dnsCache.get(host);
        if (hit != null && (long) hit[1] > System.currentTimeMillis()) return (InetAddress[]) hit[0];
        for (String server : DOH) {
            try {
                java.net.HttpURLConnection c = (java.net.HttpURLConnection)
                    new java.net.URL(server + java.net.URLEncoder.encode(host, "UTF-8")).openConnection(java.net.Proxy.NO_PROXY);
                c.setConnectTimeout(4000);
                c.setReadTimeout(4000);
                c.setRequestProperty("Accept", "application/dns-json");
                if (c.getResponseCode() != 200) continue;
                String body;
                try (InputStream in = c.getInputStream()) {
                    ByteArrayOutputStream b = new ByteArrayOutputStream();
                    byte[] buf = new byte[4096];
                    int n;
                    while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                    body = b.toString("UTF-8");
                }
                List<InetAddress> out = new ArrayList<>();
                java.util.regex.Matcher m = A_RECORD.matcher(body);
                while (m.find()) out.add(InetAddress.getByName(m.group(1)));
                if (out.isEmpty()) continue;
                InetAddress[] arr = out.toArray(new InetAddress[0]);
                dnsCache.put(host, new Object[] {arr, System.currentTimeMillis() + 5 * 60_000});
                return arr;
            } catch (Exception e) {
                Log.d(TAG, "doh " + server + ": " + e.getMessage());
            }
        }
        return null;
    }

    private static Upstream open(InetAddress a, int p) throws IOException {
        boolean v6 = a instanceof Inet6Address;
        FileDescriptor fd = null;
        try {
            fd = Os.socket(v6 ? OsConstants.AF_INET6 : OsConstants.AF_INET, OsConstants.SOCK_STREAM, 0);
        } catch (Throwable ignored) {
            // not on Android (unit tests)
        }
        if (fd == null || !fd.valid()) {
            Socket s = new Socket();
            s.connect(new InetSocketAddress(a, p), CONNECT_TIMEOUT_MS);
            Upstream u = new Upstream(s);
            u.ip = a.getHostAddress();
            return u;
        }
        try {
            // connect() honours SO_SNDTIMEO on Linux: a timeout without a non-blocking dance.
            Os.setsockoptTimeval(fd, OsConstants.SOL_SOCKET, OsConstants.SO_SNDTIMEO, StructTimeval.fromMillis(CONNECT_TIMEOUT_MS));
            Os.connect(fd, a, p);
            Os.setsockoptTimeval(fd, OsConstants.SOL_SOCKET, OsConstants.SO_SNDTIMEO, StructTimeval.fromMillis(0));
            Upstream u = new Upstream(fd, v6);
            u.ip = a.getHostAddress();
            return u;
        } catch (ErrnoException | java.net.SocketException e) {
            try {
                Os.close(fd);
            } catch (ErrnoException ignored) {
            }
            throw new IOException(a.getHostAddress() + ": " + e.getMessage());
        }
    }

    private static void handle(Socket client) throws IOException {
        InputStream in = client.getInputStream();
        OutputStream out = client.getOutputStream();
        int b0 = in.read();
        if (b0 < 0) return;
        if (b0 == 5) {
            // SOCKS5 greeting + CONNECT (no auth).
            byte[] nm = new byte[1];
            readFully(in, nm);
            readFully(in, new byte[nm[0] & 0xff]);
            out.write(new byte[] {5, 0});
            byte[] req = new byte[4];
            readFully(in, req);
            if (req[1] != 1) {
                out.write(new byte[] {5, 7, 0, 1, 0, 0, 0, 0, 0, 0});
                return;
            }
            String host;
            if (req[3] == 1) {
                byte[] ip = new byte[4];
                readFully(in, ip);
                host = InetAddress.getByAddress(ip).getHostAddress();
            } else if (req[3] == 3) {
                byte[] l = new byte[1];
                readFully(in, l);
                byte[] name = new byte[l[0] & 0xff];
                readFully(in, name);
                host = new String(name, StandardCharsets.US_ASCII);
            } else if (req[3] == 4) {
                byte[] ip = new byte[16];
                readFully(in, ip);
                host = InetAddress.getByAddress(ip).getHostAddress();
            } else {
                return;
            }
            byte[] pb = new byte[2];
            readFully(in, pb);
            Upstream up;
            try {
                up = connect(host, u16(pb, 0));
            } catch (IOException e) {
                out.write(new byte[] {5, 5, 0, 1, 0, 0, 0, 0, 0, 0});
                throw e;
            }
            out.write(new byte[] {5, 0, 0, 1, 0, 0, 0, 0, 0, 0});
            tunnel(client, up, host);
            return;
        }
        // Request head (CONNECT host:port HTTP/1.1 ... \r\n\r\n).
        ByteArrayOutputStream head = new ByteArrayOutputStream(1024);
        head.write(b0);
        while (!endsWithCrlf2(head)) {
            int b = in.read();
            if (b < 0 || head.size() > 16 * 1024) return;
            head.write(b);
        }
        String text = new String(head.toByteArray(), StandardCharsets.ISO_8859_1);
        String[] first = text.split("\r\n", 2)[0].split(" ");
        String method = first[0];
        String target = first.length > 1 ? first[1] : "";
        if (!method.equals("CONNECT")) {
            forwardHttp(client, text, method, target);
            return;
        }
        int colon = target.lastIndexOf(':');
        String host = (colon < 0 ? target : target.substring(0, colon)).replace("[", "").replace("]", "");
        int p = colon < 0 ? 443 : Integer.parseInt(target.substring(colon + 1));
        Upstream up;
        try {
            up = connect(host, p);
        } catch (IOException e) {
            out.write("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            throw e;
        }
        out.write("HTTP/1.1 200 Connection Established\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
        tunnel(client, up, host);
    }

    private static boolean endsWithCrlf2(ByteArrayOutputStream b) {
        byte[] a = b.toByteArray();
        int n = a.length;
        return n >= 4 && a[n - 4] == '\r' && a[n - 3] == '\n' && a[n - 2] == '\r' && a[n - 1] == '\n';
    }

    /** Desync the first client bytes for {@code host}, then relay both ways. */
    private static void tunnel(Socket client, Upstream up, String host) throws IOException {
        try {
            InputStream in = client.getInputStream();
            byte[] buf = new byte[16 * 1024];
            int n = in.read(buf);
            if (n < 0) return;
            if (n >= 5 && buf[0] == 0x16) {
                int want = Math.min(5 + u16(buf, 3), buf.length);
                client.setSoTimeout(300);
                try {
                    while (n < want) {
                        int k = in.read(buf, n, buf.length - n);
                        if (k < 0) break;
                        n += k;
                    }
                } catch (IOException ignored) {
                    // timeout: send what we have
                }
                client.setSoTimeout(0);
            }
            byte[] first = Arrays.copyOf(buf, n);
            Strategy st = strategyFor(host);
            if (st != null) sendDesync(up, first, st);
            else up.out.write(first);
            if (st != null) {
                int[] sni = sniOffset(first, first.length);
                Plan pl = plan(first, st);
                Log.i(TAG, host + " desync ip=" + up.ip + " hello=" + first.length + " rec=" + (first.length >= 5 ? u16(first, 3) + 5 : -1)
                    + " sni=" + (sni != null ? sni[0] : -1) + " out=" + pl.data.length + " split=" + pl.split);
            } else {
                Log.i(TAG, host + " direct");
            }
            relay(client, up);
        } finally {
            up.close();
        }
    }

    private static void sendDesync(Upstream up, byte[] first, Strategy st) throws IOException {
        Plan p = plan(first, st);
        up.noDelay();
        if (p.split < 0) {
            up.out.write(p.data);
            return;
        }
        if (st.disorder) up.ttl(1);
        up.out.write(p.data, 0, p.split);
        if (st.oob) up.urgent();
        up.out.flush();
        if (st.disorder) {
            // Let the short-lived segment leave before the TTL is restored for the rest.
            sleep(Math.max(st.delayMs, 3));
            up.ttl(64);
        } else if (st.delayMs > 0) {
            sleep(st.delayMs);
        }
        up.out.write(p.data, p.split, p.data.length - p.split);
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void relay(Socket client, Upstream up) throws IOException {
        InputStream cin = client.getInputStream();
        OutputStream cout = client.getOutputStream();
        Thread t = new Thread(() -> {
            pipe(cin, up.out);
            up.shutdownOutput();
        });
        t.start();
        pipe(up.in, cout);
        try {
            client.shutdownOutput();
        } catch (IOException ignored) {
        }
        try {
            t.join();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pipe(InputStream in, OutputStream out) {
        byte[] buf = new byte[32 * 1024];
        try {
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } catch (IOException ignored) {
            // closed
        }
    }

    /** One plain-HTTP request (absolute-form): rewrite to origin-form, close after the response. */
    private static void forwardHttp(Socket client, String head, String method, String target) throws IOException {
        if (!target.startsWith("http://")) {
            client.getOutputStream().write("HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
            return;
        }
        String rest = target.substring(7);
        int slash = rest.indexOf('/');
        String authority = slash < 0 ? rest : rest.substring(0, slash);
        String path = slash < 0 ? "/" : rest.substring(slash);
        int colon = authority.lastIndexOf(':');
        String host = colon < 0 ? authority : authority.substring(0, colon);
        int p = colon < 0 ? 80 : Integer.parseInt(authority.substring(colon + 1));
        Upstream up = connect(host, p);
        try {
            String[] lines = head.split("\r\n");
            String[] reqLine = lines[0].split(" ");
            StringBuilder sb = new StringBuilder();
            sb.append(method).append(' ').append(path).append(' ').append(reqLine[reqLine.length - 1]).append("\r\n");
            for (int i = 1; i < lines.length; i++) {
                String l = lines[i];
                if (l.isEmpty()) continue;
                String k = l.split(":", 2)[0].toLowerCase(Locale.ROOT);
                if (k.equals("proxy-connection") || k.equals("connection") || k.equals("keep-alive")) continue;
                sb.append(l).append("\r\n");
            }
            // One request per connection: the next one may go to another host.
            sb.append("Connection: close\r\n\r\n");
            up.out.write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
            relay(client, up);
        } finally {
            up.close();
        }
    }

    private DpiProxy() {}
}
