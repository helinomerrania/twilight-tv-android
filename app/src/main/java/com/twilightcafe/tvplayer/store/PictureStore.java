package com.twilightcafe.tvplayer.store;

import com.twilightcafe.tvplayer.util.Disk;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/**
 * The café's own pictures, uploaded from the phone page and shown on the TV between songs.
 * The phone already turns each photo into a 1920x1080 JPEG (and a small one for its own
 * list), so this only checks, keeps and hands them out. Plain Java, so it can be tested
 * on a computer.
 */
public final class PictureStore {

    public static final int MAX = 30;
    static final int MAX_BYTES = 6 << 20;          // one picture
    static final int MAX_SMALL = 512 << 10;        // its small copy

    private final File dir;
    private final List<String[]> list = new ArrayList<>();   // {id, added (ms)} in the order they show
    private final SecureRandom random = new SecureRandom();
    private volatile int version = 1;

    public PictureStore(File dir) {
        this.dir = dir;
        dir.mkdirs();
        load();
    }

    public int version() {
        return version;
    }

    static boolean validId(String id) {
        return id != null && id.matches("[a-z0-9]{6,24}");
    }

    /** Keeps a new picture (base64 JPEGs, a "data:" prefix is fine). Returns its id; says why not otherwise. */
    public synchronized String add(String full, String small) {
        if (list.size() >= MAX) throw new IllegalArgumentException("There are already " + MAX + " pictures. Delete one first.");
        byte[] big = Jpeg.decode(full), little = small == null || small.isEmpty() ? null : Jpeg.decode(small);
        if (big == null || !Jpeg.valid(big)) throw new IllegalArgumentException("That isn't a JPEG picture.");
        if (big.length > MAX_BYTES) throw new IllegalArgumentException("That picture is too big.");
        if (little != null && (!Jpeg.valid(little) || little.length > MAX_SMALL)) little = null;
        String id = Long.toString(System.currentTimeMillis(), 36) + Integer.toString(1296 + random.nextInt(45360), 36);
        try {
            Disk.write(new File(dir, id + ".jpg"), big);
            if (little != null) Disk.write(new File(dir, id + ".small.jpg"), little);
        } catch (IOException e) {
            new File(dir, id + ".jpg").delete();
            throw new IllegalArgumentException("The TV box couldn't save it (is its storage full?).");
        }
        list.add(new String[] { id, String.valueOf(System.currentTimeMillis()) });
        version++;
        saveIndex();
        return id;
    }

    public synchronized boolean remove(String id) {
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i)[0].equals(id)) {
                list.remove(i);
                new File(dir, id + ".jpg").delete();
                new File(dir, id + ".small.jpg").delete();
                version++;
                saveIndex();
                return true;
            }
        }
        return false;
    }

    public synchronized List<String> ids() {
        List<String> out = new ArrayList<>();
        for (String[] p : list) out.add(p[0]);
        return out;
    }

    /** [{"id":..., "at":...}] for the phone page */
    public synchronized String listJson() {
        StringBuilder b = new StringBuilder("[");
        for (String[] p : list) {
            if (b.length() > 1) b.append(',');
            b.append("{\"id\":\"").append(p[0]).append("\",\"at\":").append(p[1]).append('}');
        }
        return b.append(']').toString();
    }

    /** The picture (or its small copy; the big one if there is no small one), or null. */
    public byte[] read(String id, boolean small) {
        if (!validId(id)) return null;
        synchronized (this) {
            boolean there = false;
            for (String[] p : list) if (p[0].equals(id)) there = true;
            if (!there) return null;
        }
        File f = new File(dir, id + (small ? ".small.jpg" : ".jpg"));
        if (small && !f.exists()) f = new File(dir, id + ".jpg");
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
                if (p.length == 2 && validId(p[0]) && new File(dir, p[0] + ".jpg").exists()) list.add(p);
            }
        } catch (IOException e) {
            // no pictures
        }
    }

    private void saveIndex() {
        StringBuilder b = new StringBuilder();
        for (String[] p : list) b.append(p[0]).append(' ').append(p[1]).append('\n');
        try {
            Disk.write(new File(dir, "index.txt"), b.toString());
        } catch (IOException e) {
            // kept in memory
        }
    }
}
