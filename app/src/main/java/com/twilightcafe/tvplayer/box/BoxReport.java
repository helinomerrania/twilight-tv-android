package com.twilightcafe.tvplayer.box;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * What the TV box is, for the phone page, test mode and the page's picture quality: the box, its graphics
 * (and whether Firefox's engine has to draw on the processor), and the video its chip decodes. Read once,
 * in the background, as the graphics check takes a moment.
 */
public final class BoxReport {

    private volatile JSONObject box;                     // null until read
    private volatile int version = 0;
    private volatile boolean softDraw = false;           // Firefox's engine can't use the box's graphics

    public void read() {
        new Thread(() -> {
            JSONObject b = new JSONObject();
            try {
                b.put("box", BoxInfo.box());
                String[] g = BoxInfo.graphics();
                boolean soft = g != null && VideoSetup.softDraw(g[0], g[1]);
                b.put("graphics", g == null ? "" : g[0] + (VideoSetup.gl(g[1]).isEmpty() ? "" : ", " + VideoSetup.gl(g[1])));
                b.put("softDraw", soft);
                b.put("decoders", BoxInfo.decoders());
                softDraw = soft;
            } catch (JSONException | RuntimeException e) {
                // what was read so far
            }
            box = b;
            version++;
        }, "box-info").start();
    }

    /** {box, graphics, softDraw, decoders}, or null before it's read */
    public JSONObject json() {
        return box;
    }

    public int version() {
        return version;
    }

    public boolean softDraw() {
        return softDraw;
    }
}
