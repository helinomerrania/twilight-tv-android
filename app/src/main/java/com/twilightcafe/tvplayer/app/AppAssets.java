package com.twilightcafe.tvplayer.app;

import android.content.Context;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;

/**
 * The files built into the app (app/src/main/assets), each page in a folder of its own with its styles and
 * scripts: tv/ (the TV page, and bridge.js, its link to the app), phone/ (the phone control page), menu/ (the
 * customers' menu), home-screen/ (the phone page's icon), looks/ (the café screen's own pictures) and fonts/
 * (the menu's letters). The pages themselves are read once.
 */
public final class AppAssets {

    private static final Charset UTF8 = Charset.forName("UTF-8");

    // The pages, by their place in the assets (the tests check each one is there)
    public static final String PHONE_PAGE = "phone/index.html";
    public static final String MENU_PAGE = "menu/index.html";
    public static final String TV_PAGE = "tv/index.html";
    public static final String TV_BRIDGE = "tv/bridge.js";

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
        if (phonePage == null) phonePage = read(PHONE_PAGE);
        return phonePage;
    }

    /** The customers' menu page */
    public byte[] menuPage() {
        if (menuPage == null) menuPage = read(MENU_PAGE);
        return menuPage;
    }

    /** The TV page, without the link to the app (the bridge) */
    public byte[] tvPage() {
        if (tvPage == null) tvPage = read(TV_PAGE);
        return tvPage;
    }

    /** The link to the app, put in at the top of the TV page (Firefox's engine has no other way) */
    public String bridge() {
        if (bridge == null) bridge = new String(read(TV_BRIDGE), UTF8);
        return bridge;
    }
}
