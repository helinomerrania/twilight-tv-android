package com.twilightcafe.tvplayer.box;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Choices for smooth video on a TV box, in plain Java so they can be tested on a computer:
 *  - which video formats Firefox's engine offers YouTube (written to the engine's start-up file),
 *  - whether Firefox's engine can draw with the box's graphics,
 *  - the screen mode to ask the box for.
 *
 * Why: Firefox's engine tells YouTube it plays AV1, so YouTube sends AV1 for most popular videos.
 * Few TV-box chips decode AV1 themselves, so the box does it on its processor, and the video
 * stutters. H.264 every box's chip decodes itself; VP9 most do (the engine only offers VP9 on
 * Android where the chip has it).
 */
public final class VideoSetup {

    private VideoSetup() {
    }

    /** The video format setting: "h264" (the default), "vp9" or "any". */
    public static String format(String s) {
        String f = s == null ? "" : s.trim().toLowerCase(Locale.US);
        return f.equals("vp9") || f.equals("any") ? f : "h264";
    }

    /**
     * The engine's start-up settings for a video format, as GeckoView's YAML config file:
     *  - h264: no AV1 and no WebM, so YouTube sends H.264 in MP4, as to an older Safari. YouTube has
     *    H.264 up to 1080p; the sound comes as AAC instead of Opus.
     *  - vp9: no AV1.
     *  - any: the engine's own choice, AV1 too.
     * Whatever the format, the video's decoding is never paused (see below). With numbers on (engineNumbers),
     * WebRender's own counter over the picture: frames per second, how many of the page's tiles were drawn
     * again each frame, and whether the video went to the screen as a layer of its own ("overlays") or was
     * drawn into the page ("blits").
     */
    public static String engineConfig(String format, boolean numbers) {
        String f = format(format);
        StringBuilder y = new StringBuilder();
        // The video's decoding never paused: the engine pauses it for a video out of sight (as under the
        // café screen, 10 seconds or more at every song's end) or paused for 5 seconds, and starting it
        // again can leave the picture frozen while the sound plays on
        y.append("  media.suspend-background-video.enabled: false\n");
        y.append("  media.dormant-on-pause-timeout-ms: -1\n");
        if (!f.equals("any")) y.append("  media.av1.enabled: false\n");
        if (f.equals("h264")) y.append("  media.webm.enabled: false\n");
        if (numbers) {
            y.append("  gfx.webrender.debug.profiler: true\n");
            y.append("  gfx.webrender.debug.profiler-ui: \"").append(NUMBERS).append("\"\n");
        }
        return "prefs:\n" + y;
    }

    static final String NUMBERS = "FPS,Frame CPU total,Renderer,GPU,Rendered picture tiles,Draw calls,"
            + "Compositor surface overlays,Compositor surface blits";

    /** For the phone page and test mode. */
    public static String describe(String format) {
        String f = format(format);
        if (f.equals("vp9")) return "H.264 or VP9, no AV1";
        if (f.equals("any")) return "any format, AV1 too";
        return "H.264 only, up to 1080p";
    }

    /**
     * True when Firefox's engine won't draw with these graphics (it then draws everything on the
     * processor, and every video frame is copied there too): the engine needs OpenGL ES 3, and
     * turns down a few graphics chips by name (Mali-400/450 above all, in many cheap boxes).
     */
    public static boolean softDraw(String renderer, String glVersion) {
        String r = renderer == null ? "" : renderer.toLowerCase(Locale.US);
        if (r.contains("mali-4") || r.contains("powervr rogue g6110") || r.contains("vivante gc7000ul")) return true;
        Matcher m = Pattern.compile("OpenGL ES (\\d+)").matcher(glVersion == null ? "" : glVersion);
        return m.find() && Integer.parseInt(m.group(1)) < 3;
    }

    /**
     * The screen mode to ask the box for, or 0 for its own.
     *  modes:  the box's modes, each {id, width, height, refresh in hundredths of a hertz}
     *  system: the mode the box chose itself {width, height, refresh in hundredths}
     *  drawnH: the lines the app is drawn with in that mode (many boxes draw 1080 and send 4K)
     *  size:   "1080" or "720": at most that many lines, when the box draws more; else the box's
     *  rate:   "50" or "60" hertz, else the box's
     */
    public static int pickMode(int[][] modes, int[] system, int drawnH, String size, String rate) {
        if (modes == null || modes.length == 0 || system == null || system.length < 3) return 0;
        int cap = "720".equals(size) ? 720 : "1080".equals(size) ? 1080 : 0;
        int wantW = system[0], wantH = system[1];
        if (cap > 0 && drawnH > cap && has(modes, cap)) {
            wantH = cap;
            wantW = cap * 16 / 9;
        }
        int wantHz = "50".equals(rate) ? 5000 : "60".equals(rate) ? 6000 : system[2];
        int[] best = null;
        long bestScore = Long.MAX_VALUE;
        for (int[] m : modes) {
            if (m == null || m.length < 4 || m[2] != wantH) continue;
            long score = (long) Math.abs(m[3] - wantHz) * 100000L + Math.abs(m[1] - wantW);
            if (score < bestScore) {
                bestScore = score;
                best = m;
            }
        }
        if (best == null) return 0;
        boolean same = best[1] == system[0] && best[2] == system[1] && Math.abs(best[3] - system[2]) < 5;
        return same ? 0 : best[0];
    }

    private static boolean has(int[][] modes, int height) {
        for (int[] m : modes) if (m != null && m.length >= 4 && m[2] == height) return true;
        return false;
    }

    /** "1920x1080, 60 Hz" (59.94 stays as it is) */
    public static String mode(int w, int h, int hz100) {
        return w + "x" + h + ", " + hz(hz100) + " Hz";
    }

    private static String hz(int hz100) {
        return hz100 % 100 == 0 ? String.valueOf(hz100 / 100) : String.format(Locale.US, "%.2f", hz100 / 100.0).replaceAll("0$", "");
    }

    /** The box's other refresh rates at this size, fastest first: "50, 30 and 24 Hz" ("" if none) */
    public static String otherRates(int[][] modes, int w, int h, int hz100) {
        java.util.TreeSet<Integer> rates = new java.util.TreeSet<>(java.util.Collections.<Integer>reverseOrder());
        if (modes != null) {
            for (int[] m : modes) {
                if (m != null && m.length >= 4 && m[1] == w && m[2] == h && Math.abs(m[3] - hz100) >= 5) rates.add(m[3]);
            }
        }
        StringBuilder b = new StringBuilder();
        int i = 0;
        for (int r : rates) {
            if (i > 0) b.append(i == rates.size() - 1 ? " and " : ", ");
            b.append(hz(r));
            i++;
        }
        return b.length() == 0 ? "" : b + " Hz";
    }

    /** "OpenGL ES 3.2" from the driver's long version text ("" if it isn't there) */
    public static String gl(String version) {
        Matcher m = Pattern.compile("OpenGL ES (\\d+\\.\\d+)").matcher(version == null ? "" : version);
        return m.find() ? "OpenGL ES " + m.group(1) : "";
    }
}
