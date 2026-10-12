package com.twilightcafe.tvplayer;

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
final class PictureStore {

    static final int MAX = 30;
    static final int MAX_BYTES = 6 << 20;          // one picture
    static final int MAX_SMALL = 512 << 10;        // its small copy

    private final File dir;
    private final List<String[]> list = new ArrayList<>();   // {id, added (ms)} in the order they show
    private final SecureRandom random = new SecureRandom();
    private volatile int version = 1;

    PictureStore(File dir) {
        this.dir = dir;
        dir.mkdirs();
        load();
    }

    int version() {
        return version;
    }

    static boolean validId(String id) {
        return id != null && id.matches("[a-z0-9]{6,24}");
    }

    /** Keeps a new picture (base64 JPEGs, a "data:" prefix is fine). Returns its id; says why not otherwise. */
    synchronized String add(String full, String small) {
        if (list.size() >= MAX) throw new IllegalArgumentException("There are already " + MAX + " pictures. Delete one first.");
        byte[] big = decode(full), little = small == null || small.isEmpty() ? null : decode(small);
        if (big == null || !isJpeg(big)) throw new IllegalArgumentException("That isn't a JPEG picture.");
        if (big.length > MAX_BYTES) throw new IllegalArgumentException("That picture is too big.");
        if (little != null && (!isJpeg(little) || little.length > MAX_SMALL)) little = null;
        String id = Long.toString(System.currentTimeMillis(), 36) + Integer.toString(1296 + random.nextInt(45360), 36);
        try {
            TitleBook.writeFile(new File(dir, id + ".jpg"), big);
            if (little != null) TitleBook.writeFile(new File(dir, id + ".small.jpg"), little);
        } catch (IOException e) {
            new File(dir, id + ".jpg").delete();
            throw new IllegalArgumentException("The TV box couldn't save it (is its storage full?).");
        }
        list.add(new String[] { id, String.valueOf(System.currentTimeMillis()) });
        version++;
        saveIndex();
        return id;
    }

    synchronized boolean remove(String id) {
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

    synchronized List<String> ids() {
        List<String> out = new ArrayList<>();
        for (String[] p : list) out.add(p[0]);
        return out;
    }

    /** [{"id":..., "at":...}] for the phone page */
    synchronized String listJson() {
        StringBuilder b = new StringBuilder("[");
        for (String[] p : list) {
            if (b.length() > 1) b.append(',');
            b.append("{\"id\":\"").append(p[0]).append("\",\"at\":").append(p[1]).append('}');
        }
        return b.append(']').toString();
    }

    /** The picture (or its small copy; the big one if there is no small one), or null. */
    byte[] read(String id, boolean small) {
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

    static boolean isJpeg(byte[] b) {
        return b != null && b.length > 3 && (b[0] & 0xFF) == 0xFF && (b[1] & 0xFF) == 0xD8 && (b[2] & 0xFF) == 0xFF;
    }

    /** Base64 (standard or URL-safe, with or without padding or a "data:...;base64," prefix) -> bytes, or null. */
    static byte[] decode(String s) {
        if (s == null) return null;
        int comma = s.indexOf(',');
        if (s.startsWith("data:") && comma > 0) s = s.substring(comma + 1);
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(s.length() * 3 / 4 + 3);
        int acc = 0, bits = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int v;
            if (c >= 'A' && c <= 'Z') v = c - 'A';
            else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
            else if (c >= '0' && c <= '9') v = c - '0' + 52;
            else if (c == '+' || c == '-') v = 62;
            else if (c == '/' || c == '_') v = 63;
            else if (c == '=') break;
            else if (c == ' ' || c == '\n' || c == '\r' || c == '\t') continue;
            else return null;
            acc = (acc << 6) | v;
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.write((acc >> bits) & 0xFF);
            }
        }
        return out.toByteArray();
    }

    private void load() {
        File index = new File(dir, "index.txt");
        if (!index.exists()) return;
        try {
            for (String line : TitleBook.readFile(index).split("\n")) {
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
            TitleBook.writeFile(new File(dir, "index.txt"), b.toString());
        } catch (IOException e) {
            // kept in memory
        }
    }
}
