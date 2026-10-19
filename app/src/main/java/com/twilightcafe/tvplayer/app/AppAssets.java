package com.twilightcafe.tvplayer.app;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;

/**
 * The files built into the app (app/src/main/assets): the TV page, the phone page and the customers' menu,
 * their styles and scripts, the café screen's own pictures and the menu's letters. The pages are read once.
 */
public final class AppAssets {

    private static final Charset UTF8 = Charset.forName("UTF-8");

    private final Context context;
    private byte[] phonePage, menuPage, tvPage;
    private String bridge;

    public AppAssets(Context context) {
        this.context = context;
    }

    /** A file's bytes, or none (an empty array) when the app has no such file */
    public byte[] read(String name) {
        try {
            InputStream in = context.getAssets().open(name);
            try {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toByteArray();
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return new byte[0];
        }
    }

    /** The phone control page */
    public byte[] phonePage() {
        if (phonePage == null) phonePage = read("control.html");
        return phonePage;
    }

    /** The customers' menu page */
    public byte[] menuPage() {
        if (menuPage == null) menuPage = read("menu.html");
        return menuPage;
    }

    /** The TV page, without the link to the app (the bridge) */
    public byte[] tvPage() {
        if (tvPage == null) tvPage = read("index.html");
        return tvPage;
    }

    /** The link to the app, put in at the top of the TV page (Firefox's engine has no other way) */
    public String bridge() {
        if (bridge == null) bridge = new String(read("bridge.js"), UTF8);
        return bridge;
    }
}
