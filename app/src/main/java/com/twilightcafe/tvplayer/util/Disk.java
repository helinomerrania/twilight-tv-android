package com.twilightcafe.tvplayer.util;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Whole files on the box, as text or bytes. A file is written beside the old one first and only then takes
 * its place, so a power cut never leaves half a file. Plain Java, so it can be tested on a computer.
 */
public final class Disk {

    private Disk() {
    }
    public static String readText(File f) throws IOException {
        InputStream in = new FileInputStream(f);
        try {
            java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return new String(b.toByteArray(), "UTF-8");
        } finally {
            in.close();
        }
    }

    public static void write(File f, String text) throws IOException {
        write(f, text.getBytes("UTF-8"));
    }

    public static void write(File f, byte[] data) throws IOException {
        File tmp = new File(f.getPath() + ".tmp");
        OutputStream out = new FileOutputStream(tmp);
        try {
            out.write(data);
        } finally {
            out.close();
        }
        if (!tmp.renameTo(f)) {
            f.delete();
            if (!tmp.renameTo(f)) throw new IOException("couldn't save " + f.getName());
        }
    }
}
