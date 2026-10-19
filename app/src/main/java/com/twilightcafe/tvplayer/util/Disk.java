package com.twilightcafe.tvplayer.util;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.SyncFailedException;

/**
 * Whole files on the box, as text or bytes. A file is written beside the old one first, made sure of on the
 * storage itself, and only then takes the old one's place, so a power cut never leaves half a file (or an
 * empty one). Plain Java, so it can be tested on a computer.
 */
public final class Disk {

    private Disk() {
    }

    /** A whole file, as bytes */
    public static byte[] readBytes(File f) throws IOException {
        InputStream in = new FileInputStream(f);
        try {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toByteArray();
        } finally {
            in.close();
        }
    }

    /** A whole file, as text (UTF-8) */
    public static String readText(File f) throws IOException {
        return new String(readBytes(f), "UTF-8");
    }

    public static void write(File f, String text) throws IOException {
        write(f, text.getBytes("UTF-8"));
    }

    public static void write(File f, byte[] data) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        FileOutputStream out = new FileOutputStream(tmp);
        try {
            out.write(data);
            // On the storage itself before it takes the old one's place: Android keeps writes in memory for a
            // while, and after a power cut the new name could otherwise point to an empty file (the menu typed
            // in on the phone, gone)
            try {
                out.getFD().sync();
            } catch (SyncFailedException e) {
                // storage that can't promise it: saved all the same, as before
            }
        } finally {
            out.close();
        }
        if (!tmp.renameTo(f)) {
            f.delete();
            if (!tmp.renameTo(f)) throw new IOException("couldn't save " + f.getName());
        }
    }
}
