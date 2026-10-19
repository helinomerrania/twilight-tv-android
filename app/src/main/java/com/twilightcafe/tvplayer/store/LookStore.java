package com.twilightcafe.tvplayer.store;

import com.twilightcafe.tvplayer.util.Disk;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The café screen's pictures: the ones built into the app (assets/looks), or the café's own,
 * uploaded from the phone page in their place. The phone already makes each a 1920x1080 JPEG
 * (and a small copy for its own page), so this only checks, keeps and hands them out.
 * Plain Java, so it can be tested on a computer.
 */
public final class LookStore {

    /** The café's picture, the plain one (for the TV's own words) and the special days', in the phone page's order */
    public static final String[] NAMES = { "cafe", "plain", "newroz", "eid", "barat", "newyear" };

    private final File dir;
    private final Map<String, Long> own = new LinkedHashMap<>();   // name -> when it was put in (ms)
    private volatile int version = 1;

    public LookStore(File dir) {
        this.dir = dir;
        dir.mkdirs();
        load();
    }

    public int version() {
        return version;
    }

    public static boolean valid(String name) {
        return name != null && Arrays.asList(NAMES).contains(name);
    }

    /** Keeps the café's own picture for one of them (base64 JPEGs, a "data:" prefix is fine); says why not otherwise. Returns when. */
    public synchronized long set(String name, String full, String small) {
        if (!valid(name)) throw new IllegalArgumentException("There's no such picture on the café screen.");
        byte[] big = Jpeg.decode(full), little = small == null || small.isEmpty() ? null : Jpeg.decode(small);
        if (big == null || !Jpeg.valid(big)) throw new IllegalArgumentException("That isn't a JPEG picture.");
        if (big.length > PictureStore.MAX_BYTES) throw new IllegalArgumentException("That picture is too big.");
        if (little != null && (!Jpeg.valid(little) || little.length > PictureStore.MAX_SMALL)) little = null;
        try {
            Disk.write(new File(dir, name + ".jpg"), big);
        } catch (IOException e) {
            if (!new File(dir, name + ".jpg").exists() && own.remove(name) != null) {   // (the one before stays if it's still there)
                version++;
                saveIndex();
            }
            throw new IllegalArgumentException("The TV box couldn't save it (is its storage full?).");
        }
        try {
            if (little != null) Disk.write(new File(dir, name + ".small.jpg"), little);
            else new File(dir, name + ".small.jpg").delete();
        } catch (IOException e) {
            new File(dir, name + ".small.jpg").delete();      // the big one stands in for it
        }
        long at = Math.max(System.currentTimeMillis(), own.containsKey(name) ? own.get(name) + 1 : 0);
        own.put(name, at);
        version++;
        saveIndex();
        return at;
    }

    /** Back to the built-in picture. False if it was the built-in one already. */
    public synchronized boolean reset(String name) {
        if (!valid(name) || own.remove(name) == null) return false;
        new File(dir, name + ".jpg").delete();
        new File(dir, name + ".small.jpg").delete();
        version++;
        saveIndex();
        return true;
    }

    /** When the café's own picture was put in, or 0 for the built-in one. */
    public synchronized long at(String name) {
        Long t = own.get(name);
        return t == null ? 0 : t;
    }

    /** The café's own pictures: name -> when it was put in (the built-in ones aren't listed). */
    public synchronized Map<String, Long> stamps() {
        return new LinkedHashMap<>(own);
    }

    /** The café's own picture (or its small copy; the big one if there is no small one), or null for the built-in one. */
    public byte[] read(String name, boolean small) {
        synchronized (this) {
            if (!valid(name) || !own.containsKey(name)) return null;
        }
        File f = new File(dir, name + (small ? ".small.jpg" : ".jpg"));
        if (small && !f.exists()) f = new File(dir, name + ".jpg");
        try {
            InputStream in = new FileInputStream(f);
            try {
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toByteArray();
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return null;
        }
    }

    private void load() {
        File index = new File(dir, "index.txt");
        if (!index.exists()) return;
        try {
            for (String line : Disk.readText(index).split("\n")) {
                String[] p = line.trim().split(" ");
                if (p.length == 2 && valid(p[0]) && p[1].matches("\\d{1,15}") && new File(dir, p[0] + ".jpg").exists()) {
                    own.put(p[0], Long.parseLong(p[1]));
                }
            }
        } catch (IOException e) {
            // the built-in ones
        }
    }

    private void saveIndex() {
        StringBuilder b = new StringBuilder();
        for (Map.Entry<String, Long> e : own.entrySet()) b.append(e.getKey()).append(' ').append(e.getValue()).append('\n');
        try {
            Disk.write(new File(dir, "index.txt"), b.toString());
        } catch (IOException e) {
            // kept in memory
        }
    }
}
