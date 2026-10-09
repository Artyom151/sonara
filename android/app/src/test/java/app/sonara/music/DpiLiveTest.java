package app.sonara.music;

import java.util.Collections;
import org.junit.Ignore;
import org.junit.Test;

/** Manual: keeps a proxy up for curl. SONARA_DPI="..." gradle testDebugUnitTest --tests '*DpiLiveTest*' -Psonara.live */
public class DpiLiveTest {
    @Test
    public void holdProxy() throws Exception {
        if (System.getenv("SONARA_DPI_LIVE") == null) return;
        String st = System.getenv().getOrDefault("SONARA_DPI", "tlsrec=sni+1");
        int port = DpiProxy.configure(true, Collections.singletonList(new DpiProxy.Rule(new String[] {"com", "net", "ru"}, DpiProxy.Strategy.parse(st))));
        System.out.println("PROXY " + port);
        java.nio.file.Files.write(java.nio.file.Paths.get(System.getenv("SONARA_DPI_LIVE")), String.valueOf(port).getBytes());
        Thread.sleep(90_000);
    }

    @Test
    public void resolvesOverDoh() throws Exception {
        if (System.getenv("SONARA_DOH_LIVE") == null) return;
        java.net.InetAddress[] a = DpiProxy.doh("www.youtube.com");
        System.out.println("DOH " + java.util.Arrays.toString(a));
        org.junit.Assert.assertNotNull(a);
    }
}
