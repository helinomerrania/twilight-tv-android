package com.twilightcafe.tvplayer;

import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
import android.os.Build;
import android.view.Display;

import java.io.File;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/**
 * What the TV box is, for the phone page and test mode: its chip, its graphics and which video
 * formats its chip decodes itself. A YouTube video that stutters is almost always one the box has
 * to decode on its processor, a box drawing at 4K, or graphics Firefox's engine can't use.
 * The pure decisions are in VideoSetup.
 */
final class BoxInfo {

    private BoxInfo() {
    }

    // Amlogic's names for its chips (ro.board.platform and the device tree) -> the chip
    private static final String[][] AMLOGIC = {
        { "gxbb", "S905" }, { "gxl", "S905X, S905W or S905L" }, { "gxm", "S912" }, { "g12a", "S905X2" }, { "g12b", "S922X" },
        { "sm1", "S905X3" }, { "sc2", "S905X4" }, { "s4", "S905Y4" }, { "t7", "A311D2" }, { "s5", "S928X" }
    };

    /** "X96Max_Plus (Amlogic S905X3), Android 9" */
    static String box() {
        String platform = property("ro.board.platform");
        String tree = read("/sys/firmware/devicetree/base/compatible").replace('\u0000', ' ').replace(',', ' ');
        String all = (platform + " " + tree + " " + Build.HARDWARE + " " + Build.BOARD).toLowerCase(Locale.US);
        String chip = "";
        for (String[] a : AMLOGIC) {
            if (all.matches("(?s).*\\b" + a[0] + "\\b.*")) {
                chip = "Amlogic " + a[1];
                break;
            }
        }
        if (chip.isEmpty()) chip = platform.isEmpty() ? Build.HARDWARE : platform;
        return Build.MODEL + " (" + chip + "), Android " + Build.VERSION.RELEASE;
    }

    /** The graphics chip's name and its OpenGL ES version string, or null if they can't be read. */
    static String[] graphics() {
        EGLDisplay d = null;
        EGLContext ctx = null;
        EGLSurface s = null;
        try {
            d = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
            int[] v = new int[2];
            if (d == null || !EGL14.eglInitialize(d, v, 0, v, 1)) return null;
            EGLConfig[] cfg = new EGLConfig[1];
            int[] n = new int[1];
            int[] want = { EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT, EGL14.EGL_SURFACE_TYPE, EGL14.EGL_PBUFFER_BIT, EGL14.EGL_NONE };
            if (!EGL14.eglChooseConfig(d, want, 0, cfg, 0, 1, n, 0) || n[0] < 1) return null;
            ctx = EGL14.eglCreateContext(d, cfg[0], EGL14.EGL_NO_CONTEXT, new int[] { EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE }, 0);
            s = EGL14.eglCreatePbufferSurface(d, cfg[0], new int[] { EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE }, 0);
            if (!EGL14.eglMakeCurrent(d, s, s, ctx)) return null;
            String renderer = GLES20.glGetString(GLES20.GL_RENDERER), version = GLES20.glGetString(GLES20.GL_VERSION);
            return renderer == null ? null : new String[] { renderer.trim(), version == null ? "" : version.trim() };
        } catch (RuntimeException e) {
            return null;
        } finally {
            // Only this check's own context and surface go: the display stays, Firefox's engine uses it too
            try {
                if (d != null) {
                    EGL14.eglMakeCurrent(d, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
                    if (s != null) EGL14.eglDestroySurface(d, s);
                    if (ctx != null) EGL14.eglDestroyContext(d, ctx);
                }
            } catch (RuntimeException e) {
                // nothing more to do
            }
        }
    }

    /** What the chip decodes itself: "H.264 up to 2160p, VP9 up to 2160p; not AV1" */
    static String decoders() {
        String[][] kinds = { { "video/avc", "H.264" }, { "video/x-vnd.on2.vp9", "VP9" }, { "video/av01", "AV1" } };
        Map<String, Integer> hw = new LinkedHashMap<>();
        try {
            for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
                if (info.isEncoder() || !hardware(info)) continue;
                for (String type : info.getSupportedTypes()) {
                    for (String[] k : kinds) {
                        if (!k[0].equalsIgnoreCase(type)) continue;
                        int h = 0;
                        try {
                            MediaCodecInfo.VideoCapabilities vc = info.getCapabilitiesForType(type).getVideoCapabilities();
                            h = vc.isSizeSupported(3840, 2160) ? 2160 : vc.isSizeSupported(2560, 1440) ? 1440
                                    : vc.isSizeSupported(1920, 1080) ? 1080 : 720;
                        } catch (RuntimeException e) {
                            // size not known
                        }
                        Integer was = hw.get(k[1]);
                        hw.put(k[1], Math.max(was == null ? 0 : was, h));
                    }
                }
            }
        } catch (RuntimeException e) {
            return "";
        }
        StringBuilder yes = new StringBuilder(), no = new StringBuilder();
        for (String[] k : kinds) {
            Integer h = hw.get(k[1]);
            StringBuilder to = h == null ? no : yes;
            if (to.length() > 0) to.append(h == null ? " or " : ", ");
            to.append(k[1]);
            if (h != null && h > 0) to.append(" up to ").append(h).append("p");
        }
        if (yes.length() == 0) return "none of H.264, VP9 or AV1";
        return yes + (no.length() > 0 ? "; not " + no : "");
    }

    // A decoder in the chip, not a program on the processor
    private static boolean hardware(MediaCodecInfo info) {
        if (Build.VERSION.SDK_INT >= 29) return info.isHardwareAccelerated();
        String n = info.getName().toLowerCase(Locale.US);
        return !(n.startsWith("omx.google.") || n.startsWith("c2.android.") || n.startsWith("c2.google.") || n.contains("ffmpeg")
                || n.endsWith(".sw") || n.contains(".sw."));
    }

    /** The box's screen modes: {id, width, height, refresh in hundredths of a hertz} */
    static int[][] modes(Display d) {
        try {
            Display.Mode[] all = d.getSupportedModes();
            int[][] out = new int[all.length][];
            for (int i = 0; i < all.length; i++) out[i] = mode(all[i]);
            return out;
        } catch (RuntimeException e) {
            return new int[0][];
        }
    }

    static int[] mode(Display.Mode m) {
        return new int[] { m.getModeId(), m.getPhysicalWidth(), m.getPhysicalHeight(), Math.round(m.getRefreshRate() * 100) };
    }

    // A system property (hidden from apps, so asked for by name); "" if it can't be read
    private static String property(String name) {
        try {
            Object v = Class.forName("android.os.SystemProperties").getMethod("get", String.class).invoke(null, name);
            return v == null ? "" : v.toString().trim();
        } catch (Exception e) {
            return "";
        }
    }

    private static String read(String path) {
        try {
            File f = new File(path);
            return f.exists() ? TitleBook.readFile(f) : "";
        } catch (Exception e) {
            return "";
        }
    }
}
