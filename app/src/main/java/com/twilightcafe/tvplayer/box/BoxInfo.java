package com.twilightcafe.tvplayer.box;

import android.app.ActivityManager;
import android.content.Context;
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

import com.twilightcafe.tvplayer.util.Disk;

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
public final class BoxInfo {

    private BoxInfo() {
    }

    // Amlogic's names for its chips (ro.board.platform and the device tree) -> the chip
    private static final String[][] AMLOGIC = {
        { "gxbb", "S905" }, { "gxl", "S905X, S905W or S905L" }, { "gxm", "S912" }, { "g12a", "S905X2" }, { "g12b", "S922X" },
        { "sm1", "S905X3" }, { "sc2", "S905X4" }, { "s4", "S905Y4" }, { "t7", "A311D2" }, { "s5", "S928X" }
    };

    /** "X96Max_Plus (Amlogic S905X3), Android 9" */
    public static String box() {
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
    public static String[] graphics() {
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
    public static String decoders() {
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
    public static int[][] modes(Display d) {
        try {
            Display.Mode[] all = d.getSupportedModes();
            int[][] out = new int[all.length][];
            for (int i = 0; i < all.length; i++) out[i] = mode(all[i]);
            return out;
        } catch (RuntimeException e) {
            return new int[0][];
        }
    }

    public static int[] mode(Display.Mode m) {
        return new int[] { m.getModeId(), m.getPhysicalWidth(), m.getPhysicalHeight(), Math.round(m.getRefreshRate() * 100) };
    }

    /** What Android says about why the box last started ("" when it doesn't), in words where it's a known reason */
    public static String bootReason() {
        for (String p : new String[] { "sys.boot.reason", "persist.sys.boot.reason", "ro.boot.bootreason" }) {
            String r = property(p);
            if (!r.isEmpty()) return Diary.bootWords(r);
        }
        return "";
    }

    /** How the box is now, for the diary: "310 MB free of 1,868 MB, the chip at 64 °C" ("" if it doesn't say) */
    public static String health(Context c) {
        StringBuilder b = new StringBuilder();
        try {
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo m = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(m);
            if (m.totalMem > 0) {
                b.append(String.format(Locale.US, "%,d MB free of %,d MB", m.availMem >> 20, m.totalMem >> 20));
                if (m.lowMemory) b.append(" (Android said memory was low)");
            }
        } catch (RuntimeException e) {
            // not known
        }
        int t = temperature();
        if (t > 0) b.append(b.length() > 0 ? ", " : "").append("the chip at ").append(t).append(" °C");
        return b.toString();
    }

    // The chip's temperature in °C (the hottest of its first sensors), or 0 when the box doesn't say
    static int temperature() {
        int hottest = 0;
        for (int i = 0; i < 4; i++) {
            String s = read("/sys/class/thermal/thermal_zone" + i + "/temp").trim();
            try {
                long v = Long.parseLong(s);
                if (v > 1000) v /= 1000;                // millidegrees, as most boxes say it
                if (v > 0 && v < 150 && v > hottest) hottest = (int) v;
            } catch (NumberFormatException e) {
                // not this one
            }
        }
        return hottest;
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
            return f.exists() ? Disk.readText(f) : "";
        } catch (Exception e) {
            return "";
        }
    }
}
