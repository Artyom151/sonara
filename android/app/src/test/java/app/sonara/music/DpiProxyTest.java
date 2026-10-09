package app.sonara.music;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;

/** Same cases as the desktop tests in src-tauri/src/dpi.rs. */
public class DpiProxyTest {

    /** Minimal ClientHello for {@code host}. */
    static byte[] hello(String host) {
        byte[] name = host.getBytes(StandardCharsets.US_ASCII);
        ByteArrayOutputStream sni = new ByteArrayOutputStream();
        int listLen = 3 + name.length;
        sni.write(0); sni.write(0);
        sni.write((listLen + 2) >> 8); sni.write(listLen + 2);
        sni.write(listLen >> 8); sni.write(listLen);
        sni.write(0);
        sni.write(name.length >> 8); sni.write(name.length);
        sni.write(name, 0, name.length);
        byte[] ext = sni.toByteArray();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(3); body.write(3);
        for (int i = 0; i < 32; i++) body.write(7);
        body.write(0); // session id
        body.write(0); body.write(2); body.write(0x13); body.write(1); // cipher suites
        body.write(1); body.write(0); // compression
        body.write(ext.length >> 8); body.write(ext.length);
        body.write(ext, 0, ext.length);
        byte[] b = body.toByteArray();
        ByteArrayOutputStream rec = new ByteArrayOutputStream();
        int hsLen = 4 + b.length;
        rec.write(0x16); rec.write(3); rec.write(1);
        rec.write(hsLen >> 8); rec.write(hsLen);
        rec.write(1); rec.write(0); rec.write(b.length >> 8); rec.write(b.length);
        rec.write(b, 0, b.length);
        return rec.toByteArray();
    }

    @Test
    public void findsSni() {
        byte[] h = hello("www.youtube.com");
        int[] s = DpiProxy.sniOffset(h, h.length);
        assertEquals("www.youtube.com", new String(h, s[0], s[1], StandardCharsets.US_ASCII));
    }

    @Test
    public void parsesStrategies() {
        DpiProxy.Strategy s = DpiProxy.Strategy.parse("tlsrec=sni+1, split=sni+3, delay=5");
        assertEquals(new DpiProxy.Pos(2, 1), s.tlsrec);
        assertEquals(new DpiProxy.Pos(2, 3), s.split);
        assertEquals(5, s.delayMs);
        assertEquals(new DpiProxy.Pos(2, 1), DpiProxy.Strategy.parse("disorder").split);
        assertEquals(new DpiProxy.Pos(2, -1), DpiProxy.Strategy.parse("split=sni-1").split);
        assertTrue(DpiProxy.Strategy.parse("oob").oob);
        assertEquals(new DpiProxy.Pos(1, 1), DpiProxy.Strategy.parse("oob=1").split);
        try {
            DpiProxy.Strategy.parse("fake");
            fail();
        } catch (IllegalArgumentException expected) {
        }
    }

    @Test
    public void recordSplitKeepsTheHandshakeBytes() {
        byte[] h = hello("rr1---sn-abc.googlevideo.com");
        DpiProxy.Plan p = DpiProxy.plan(h, DpiProxy.Strategy.parse("tlsrec=sni+4,split=sni+8"));
        byte[] d = p.data;
        assertEquals(h.length + 5, d.length);
        int l1 = ((d[3] & 0xff) << 8) | (d[4] & 0xff);
        int r2 = 5 + l1;
        int l2 = ((d[r2 + 3] & 0xff) << 8) | (d[r2 + 4] & 0xff);
        byte[] joined = new byte[l1 + l2];
        System.arraycopy(d, 5, joined, 0, l1);
        System.arraycopy(d, r2 + 5, joined, l1, l2);
        byte[] orig = new byte[h.length - 5];
        System.arraycopy(h, 5, orig, 0, orig.length);
        assertArrayEquals(orig, joined);
        int sniAt = DpiProxy.sniOffset(h, h.length)[0];
        assertEquals(sniAt + 8 + 5, p.split);
    }

    @Test
    public void noSplitWithoutStrategy() {
        byte[] h = hello("soundcloud.com");
        DpiProxy.Plan p = DpiProxy.plan(h, DpiProxy.Strategy.parse(""));
        assertArrayEquals(h, p.data);
        assertTrue(p.split < 0);
    }
}
