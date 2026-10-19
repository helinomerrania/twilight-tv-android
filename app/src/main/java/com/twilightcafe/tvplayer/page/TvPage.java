package com.twilightcafe.tvplayer.page;

import java.nio.charset.Charset;

/**
 * The TV page as the app's own web server hands it to Firefox's engine: the page from
 * the app (assets/index.html) with the link to the app (assets/bridge.js) put in at the
 * top, before the page's own script runs. Plain Java, so it can be tested on a computer.
 */
public final class TvPage {

    private static final Charset UTF8 = Charset.forName("UTF-8");

    private TvPage() {
    }

    /** The page with the link to the app in it. boot is a JSON object: {"k": key, "v": version, "s": settings}. */
    public static byte[] withBridge(byte[] page, String bridgeJs, String boot) {
        String html = new String(page, UTF8);
        // Inside a <script>, "</script>" (or any "<") in the settings would end it early
        String safeBoot = boot.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
        String script = "\n<script>\nwindow.TWILIGHT_BOOT = " + safeBoot + ";\n" + bridgeJs.replace("</script", "<\\/script") + "\n</script>\n";
        int at = indexOfIgnoreCase(html, "<meta charset=\"utf-8\">");
        if (at >= 0) {
            at += "<meta charset=\"utf-8\">".length();
        } else {
            at = indexOfIgnoreCase(html, "<head>");
            at = at >= 0 ? at + "<head>".length() : 0;
        }
        return (html.substring(0, at) + script + html.substring(at)).getBytes(UTF8);
    }

    private static int indexOfIgnoreCase(String s, String what) {
        for (int i = 0; i + what.length() <= s.length(); i++) {
            if (s.regionMatches(true, i, what, 0, what.length())) return i;
        }
        return -1;
    }
}
