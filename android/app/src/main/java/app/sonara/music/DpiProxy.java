package app.sonara.music;

import android.os.ParcelFileDescriptor;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;
import java.io.ByteArrayOutputStream;
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
            if (out.disorder && out.split.equals(Pos.NONE)) out.split = new Pos(2, 1);
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

    private static Socket connect(String host, int p) throws IOException {
        Socket up = new Socket();
        up.connect(new InetSocketAddress(host, p), 10_000);
        return up;
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
            Socket up;
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
        Socket up;
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
    private static void tunnel(Socket client, Socket up, String host) throws IOException {
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
            else up.getOutputStream().write(first);
            relay(client, up);
        } finally {
            closeQuietly(up);
        }
    }

    private static void sendDesync(Socket up, byte[] first, Strategy st) throws IOException {
        Plan p = plan(first, st);
        up.setTcpNoDelay(true);
        OutputStream out = up.getOutputStream();
        if (p.split < 0) {
            out.write(p.data);
            return;
        }
        boolean v6 = up.getInetAddress() instanceof Inet6Address;
        if (st.disorder) setTtl(up, v6, 1);
        out.write(p.data, 0, p.split);
        out.flush();
        if (st.disorder) {
            // Let the short-lived segment leave before the TTL is restored for the rest.
            sleep(Math.max(st.delayMs, 3));
            setTtl(up, v6, 64);
        } else if (st.delayMs > 0) {
            sleep(st.delayMs);
        }
        out.write(p.data, p.split, p.data.length - p.split);
    }

    /** IP_TTL / IPV6_UNICAST_HOPS on the socket (java.net.Socket has no setter for them). */
    private static void setTtl(Socket s, boolean v6, int ttl) {
        try (ParcelFileDescriptor pfd = ParcelFileDescriptor.fromSocket(s)) {
            if (v6) Os.setsockoptInt(pfd.getFileDescriptor(), OsConstants.IPPROTO_IPV6, OsConstants.IPV6_UNICAST_HOPS, ttl);
            else Os.setsockoptInt(pfd.getFileDescriptor(), OsConstants.IPPROTO_IP, 2 /* IP_TTL */, ttl);
        } catch (Exception e) {
            Log.d(TAG, "ttl: " + e.getMessage());
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void relay(Socket client, Socket up) {
        Thread t = new Thread(() -> pipe(client, up));
        t.start();
        pipe(up, client);
        try {
            t.join();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static void pipe(Socket from, Socket to) {
        byte[] buf = new byte[32 * 1024];
        try {
            InputStream in = from.getInputStream();
            OutputStream out = to.getOutputStream();
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        } catch (IOException ignored) {
            // closed
        }
        try {
            to.shutdownOutput();
        } catch (IOException ignored) {
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
        Socket up = connect(host, p);
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
            up.getOutputStream().write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
            relay(client, up);
        } finally {
            closeQuietly(up);
        }
    }

    private DpiProxy() {}
}
