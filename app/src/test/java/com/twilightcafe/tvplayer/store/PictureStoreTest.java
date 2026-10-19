package com.twilightcafe.tvplayer.store;

import com.twilightcafe.tvplayer.Checks;

import org.json.JSONArray;
import org.junit.Test;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.Set;

/** The café's pictures (PictureStore), and the base64 pictures come in as (Jpeg). Split out of FeedsTest. */
public class PictureStoreTest extends Checks {

    @Test
    public void theCafesPictures() throws Exception {
        File dir = Files.createTempDirectory("pictures").toFile();

        System.out.println("\nThe café's pictures");
        File pd = new File(dir, "pictures");
        PictureStore ps = new PictureStore(pd);
        byte[] jpg = new byte[5000]; jpg[0] = (byte) 0xFF; jpg[1] = (byte) 0xD8; jpg[2] = (byte) 0xFF; for (int i = 3; i < jpg.length; i++) jpg[i] = (byte) (i * 7);
        byte[] small = new byte[300]; small[0] = (byte) 0xFF; small[1] = (byte) 0xD8; small[2] = (byte) 0xFF;
        String b64 = Base64.getEncoder().encodeToString(jpg), s64 = Base64.getEncoder().encodeToString(small);
        String id = ps.add("data:image/jpeg;base64," + b64, s64);
        check("a picture from the phone is kept, with an ID", PictureStore.validId(id) && ps.ids().equals(Arrays.asList(id)), id);
        check("...the picture and its small copy come back exactly", Arrays.equals(ps.read(id, false), jpg) && Arrays.equals(ps.read(id, true), small), "");
        String id2 = ps.add(Base64.getUrlEncoder().withoutPadding().encodeToString(jpg), "");
        check("URL-safe base64 without padding works too; no small copy: the big one instead", Arrays.equals(ps.read(id2, true), jpg), "");
        String why = null;
        try { ps.add(Base64.getEncoder().encodeToString("<html>".getBytes()), ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("anything but a JPEG is refused, with the reason", "That isn't a JPEG picture.".equals(why), why);
        why = null;
        try { ps.add("!!!", ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("...and text that isn't base64 at all", "That isn't a JPEG picture.".equals(why), why);
        check("the list for the phone", ps.listJson().startsWith("[{\"id\":\"" + id + "\",\"at\":") && new JSONArray(ps.listJson()).length() == 2, ps.listJson());
        check("no way out of the pictures folder", ps.read("../index", false) == null && ps.read("index.txt", false) == null && ps.read("zzzzzzzz", false) == null, "");
        PictureStore ps2 = new PictureStore(pd);
        check("kept after a restart, in order", ps2.ids().equals(Arrays.asList(id, id2)), ps2.ids());
        int pv = ps2.version();
        check("deleting one (and its files)", ps2.remove(id) && !new File(pd, id + ".jpg").exists() && !new File(pd, id + ".small.jpg").exists() &&
            ps2.ids().equals(Arrays.asList(id2)) && ps2.version() > pv && !ps2.remove(id), ps2.ids());
        for (int i = 0; i < 29; i++) ps2.add(b64, "");
        why = null;
        try { ps2.add(b64, ""); } catch (IllegalArgumentException e) { why = e.getMessage(); }
        check("at most 30 pictures", ps2.ids().size() == 30 && why != null && why.contains("30"), why);
        Set<String> uniq = new HashSet<>(ps2.ids());
        check("every picture its own ID", uniq.size() == 30, uniq.size());
        check("base64 decoding: standard, URL-safe, line breaks", Arrays.equals(Jpeg.decode("aGVs\nbG8="), "hello".getBytes()) &&
            Arrays.equals(Jpeg.decode("aGVsbG8"), "hello".getBytes()) && Arrays.equals(Jpeg.decode("-_8"), new byte[] { (byte) 0xFB, (byte) 0xFF }), "");

        allPassed();
    }
}
