package com.twilightcafe.tvplayer.store;

import com.twilightcafe.tvplayer.Checks;

import org.junit.Test;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;

public class LookStoreTest extends Checks {

    static String b64(byte[] b) { return Base64.getEncoder().encodeToString(b); }
    static byte[] jpeg(int n, int fill) {
        byte[] b = new byte[n];
        Arrays.fill(b, (byte) fill);
        b[0] = (byte) 0xFF; b[1] = (byte) 0xD8; b[2] = (byte) 0xFF;
        return b;
    }

    @Test
    public void theCafeScreensPictures() throws Exception {
        File dir = Files.createTempDirectory("looks").toFile();
        System.out.println("The café screen's pictures the café puts in from the phone");
        LookStore s = new LookStore(dir);
        check("the six, in the phone page's order", String.join(",", LookStore.NAMES).equals("cafe,plain,newroz,eid,barat,newyear"), Arrays.toString(LookStore.NAMES));
        check("at first all built in: nothing to read, no stamps", s.read("cafe", false) == null && s.at("cafe") == 0 && s.stamps().isEmpty(), s.stamps());
        int v0 = s.version();
        byte[] big = jpeg(5000, 7), small = jpeg(300, 9);
        long t0 = System.currentTimeMillis();
        long at = s.set("newroz", "data:image/jpeg;base64," + b64(big), b64(small));
        check("one put in: kept, with when", at >= t0 && s.at("newroz") == at && Arrays.equals(s.read("newroz", false), big) && Arrays.equals(s.read("newroz", true), small)
            && s.stamps().equals(Collections.singletonMap("newroz", at)), s.stamps());
        check("...and the page is told (the version moves on)", s.version() > v0, s.version());
        long again = s.set("newroz", b64(jpeg(4000, 3)), "");
        check("another for the same: replaces it, a later stamp; no small copy -> the big one stands in", again > at && s.read("newroz", false).length == 4000
            && s.read("newroz", true).length == 4000, again + " " + at);
        LookStore back = new LookStore(dir);
        check("kept on the box: known again after a restart", back.at("newroz") == again && back.read("newroz", false).length == 4000 && back.at("cafe") == 0, back.stamps());
        String why = "";
        try { s.set("christmas", b64(big), ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("an unknown name refused", why.contains("no such picture") && !new File(dir, "christmas.jpg").exists(), why);
        why = "";
        try { s.set("cafe", b64("hello, not a picture".getBytes("UTF-8")), ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("not a JPEG refused, nothing kept", why.contains("isn't a JPEG") && s.at("cafe") == 0, why);
        why = "";
        try { s.set("cafe", b64(jpeg(PictureStore.MAX_BYTES + 1, 1)), ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("too big refused", why.contains("too big") && s.at("cafe") == 0, why);
        why = "";
        try { s.set("cafe", "%%%", ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("garbage refused", why.contains("isn't a JPEG"), why);
        s.set("cafe", b64(big), "not base64 at all %%");
        check("a broken small copy is just left out", s.read("cafe", true).length == big.length, s.read("cafe", true).length);
        int v1 = s.version();
        check("back to the built-in one: gone from the box, the page told", s.reset("newroz") && s.read("newroz", false) == null && s.at("newroz") == 0
            && !new File(dir, "newroz.jpg").exists() && s.version() > v1, s.stamps());
        check("...again: nothing to do", !s.reset("newroz") && !s.reset("christmas") && !s.reset(null));
        check("reading odd names: nothing", s.read("../index", false) == null && s.read(null, true) == null && s.read("CAFE", false) == null);
        LookStore third = new LookStore(dir);
        check("after a restart: only the café's own one left", third.stamps().keySet().equals(Collections.singleton("cafe")), third.stamps());
        allPassed();
    }
}
