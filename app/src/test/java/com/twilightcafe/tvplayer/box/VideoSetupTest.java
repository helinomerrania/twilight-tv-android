package com.twilightcafe.tvplayer.box;

import com.twilightcafe.tvplayer.Checks;

import org.junit.Test;

public class VideoSetupTest extends Checks {

    // modes as {id, width, height, hz x 100}
    static final int[][] AMLOGIC_4K = {
        { 1, 3840, 2160, 6000 }, { 2, 3840, 2160, 5000 }, { 3, 3840, 2160, 3000 }, { 4, 3840, 2160, 2400 },
        { 5, 1920, 1080, 6000 }, { 6, 1920, 1080, 5000 }, { 7, 1920, 1080, 2400 }, { 8, 1280, 720, 6000 }, { 9, 1280, 720, 5000 },
        { 10, 4096, 2160, 6000 }, { 11, 1920, 1080, 5994 }
    };
    static final int[][] FHD_ONLY = { { 1, 1920, 1080, 6000 }, { 2, 1920, 1080, 5000 }, { 3, 1280, 720, 6000 } };

    @Test
    public void choicesForSmoothVideo() throws Exception {
        System.out.println("Video format -> the engine's start-up file");
        check("default is h264", VideoSetup.format(null).equals("h264") && VideoSetup.format("").equals("h264") && VideoSetup.format("H264").equals("h264"), VideoSetup.format(null));
        check("vp9 and any kept", VideoSetup.format(" VP9 ").equals("vp9") && VideoSetup.format("any").equals("any"), VideoSetup.format(" VP9 "));
        check("unknown value -> h264", VideoSetup.format("av1").equals("h264"), VideoSetup.format("av1"));
        String h = VideoSetup.engineConfig("h264"), v = VideoSetup.engineConfig("vp9"), any = VideoSetup.engineConfig("any");
        String keep = "  media.suspend-background-video.enabled: false\n  media.dormant-on-pause-timeout-ms: -1\n";
        check("h264: AV1 and WebM off (and the video's decoding never paused)", h.equals("prefs:\n" + keep + "  media.av1.enabled: false\n  media.webm.enabled: false\n"), h);
        check("vp9: only AV1 off", v.equals("prefs:\n" + keep + "  media.av1.enabled: false\n"), v);
        check("any: the engine's own formats, the decoding still never paused", any.equals("prefs:\n" + keep), any);
        check("garbage -> the h264 file", VideoSetup.engineConfig("x").equals(h), VideoSetup.engineConfig("x"));
        String hn = VideoSetup.engineConfig("h264", true), an = VideoSetup.engineConfig("any", true);
        check("frame counter: h264 prefs plus WebRender's profiler", hn.equals(h + "  gfx.webrender.debug.profiler: true\n  gfx.webrender.debug.profiler-ui: \"" + VideoSetup.NUMBERS + "\"\n"), hn);
        check("frame counter with any: the profiler", an.equals("prefs:\n" + keep + "  gfx.webrender.debug.profiler: true\n  gfx.webrender.debug.profiler-ui: \"" + VideoSetup.NUMBERS + "\"\n"), an);
        check("numbers off = the plain file", VideoSetup.engineConfig("vp9", false).equals(v) && VideoSetup.engineConfig("any", false).equals(any), "");
        check("the counter's list names WebRender's counters", VideoSetup.NUMBERS.contains("FPS") && VideoSetup.NUMBERS.contains("Compositor surface blits")
            && !VideoSetup.NUMBERS.contains("\""), VideoSetup.NUMBERS);
        check("descriptions", VideoSetup.describe("h264").contains("H.264 only") && VideoSetup.describe("vp9").contains("VP9")
            && VideoSetup.describe("any").contains("AV1"), VideoSetup.describe("vp9"));
        check("describe(null) is the default's", VideoSetup.describe(null).equals(VideoSetup.describe("h264")), VideoSetup.describe(null));

        System.out.println("Graphics Firefox's engine can't use");
        check("Mali-450 -> software", VideoSetup.softDraw("Mali-450 MP", "OpenGL ES 2.0"), "");
        check("Mali-400 -> software", VideoSetup.softDraw("Mali-400 MP", "OpenGL ES 2.0 v1.r6p1"), "");
        check("Mali-G31 GLES 3.2 -> hardware", !VideoSetup.softDraw("Mali-G31", "OpenGL ES 3.2 v1.r16p0-01rel0.4aee637"), "");
        check("Mali-G52 -> hardware", !VideoSetup.softDraw("Mali-G52", "OpenGL ES 3.2 v1.r26p0"), "");
        check("Mali-T820 (S912) GLES 3.1 -> hardware", !VideoSetup.softDraw("Mali-T820", "OpenGL ES 3.1 v1.r12p1"), "");
        check("any GLES 2 chip -> software", VideoSetup.softDraw("PowerVR SGX 544MP", "OpenGL ES 2.0 build 1.10@2359475"), "");
        check("PowerVR Rogue G6110 -> software", VideoSetup.softDraw("PowerVR Rogue G6110", "OpenGL ES 3.1 build 1.5@3830101"), "");
        check("Vivante GC7000UL -> software", VideoSetup.softDraw("Vivante GC7000UL", "OpenGL ES 3.0 V6.2.4"), "");
        check("unknown version -> not software", !VideoSetup.softDraw("Adreno (TM) 506", ""), "");
        check("nothing known -> not software", !VideoSetup.softDraw(null, null), "");
        check("gl() short version", VideoSetup.gl("OpenGL ES 3.2 v1.r16p0-01rel0").equals("OpenGL ES 3.2") && VideoSetup.gl("junk").isEmpty()
            && VideoSetup.gl(null).isEmpty(), VideoSetup.gl("OpenGL ES 3.2 v1.r16p0-01rel0"));

        System.out.println("Screen mode");
        int[] sys4k60 = { 3840, 2160, 6000 }, sys1080p60 = { 1920, 1080, 6000 }, sys1080p50 = { 1920, 1080, 5000 };
        check("box's own size and rate -> 0", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "box", "box") == 0, "");
        check("4K drawn at 4K, up to 1080 -> 1080p60", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "1080", "box") == 5,
            VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "1080", "box"));
        check("4K sent but drawn at 1080 -> left alone", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 1080, "1080", "box") == 0,
            VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 1080, "1080", "box"));
        check("4K drawn at 4K, up to 1080 at 50 Hz -> 1080p50", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "1080", "50") == 6,
            VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "1080", "50"));
        check("4K drawn at 4K, up to 720 -> 720p60", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "720", "box") == 8,
            VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "720", "box"));
        check("1080p60, rate 50 -> 1080p50", VideoSetup.pickMode(AMLOGIC_4K, sys1080p60, 1080, "1080", "50") == 6,
            VideoSetup.pickMode(AMLOGIC_4K, sys1080p60, 1080, "1080", "50"));
        check("1080p50, rate 60 -> exactly 60, not 59.94", VideoSetup.pickMode(AMLOGIC_4K, sys1080p50, 1080, "1080", "60") == 5,
            VideoSetup.pickMode(AMLOGIC_4K, sys1080p50, 1080, "1080", "60"));
        check("1080p60, rate 60 -> 0 (already)", VideoSetup.pickMode(AMLOGIC_4K, sys1080p60, 1080, "1080", "60") == 0,
            VideoSetup.pickMode(AMLOGIC_4K, sys1080p60, 1080, "1080", "60"));
        check("never bigger: 720p box stays 720p", VideoSetup.pickMode(AMLOGIC_4K, new int[] { 1280, 720, 6000 }, 720, "1080", "box") == 0,
            VideoSetup.pickMode(AMLOGIC_4K, new int[] { 1280, 720, 6000 }, 720, "1080", "box"));
        check("4K60 box, 1080 cap: picks 3840-wide family's 1080 (1920), not DCI", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "1080", "60") == 5, "");
        check("rate not offered -> closest (60), same as now -> 0",
            VideoSetup.pickMode(new int[][] { { 1, 1920, 1080, 6000 } }, sys1080p60, 1080, "1080", "50") == 0, "");
        check("FHD-only box, rate 50 -> its 50", VideoSetup.pickMode(FHD_ONLY, sys1080p60, 1080, "1080", "50") == 2, "");
        check("size cap with no such mode -> keeps the box's size", VideoSetup.pickMode(new int[][] { { 1, 3840, 2160, 6000 }, { 2, 3840, 2160, 5000 } },
            sys4k60, 2160, "1080", "50") == 2, VideoSetup.pickMode(new int[][] { { 1, 3840, 2160, 6000 }, { 2, 3840, 2160, 5000 } }, sys4k60, 2160, "1080", "50"));
        check("no modes -> 0", VideoSetup.pickMode(new int[0][], sys4k60, 2160, "1080", "50") == 0
            && VideoSetup.pickMode(null, sys4k60, 2160, "1080", "50") == 0 && VideoSetup.pickMode(AMLOGIC_4K, null, 0, "1080", "50") == 0, "");
        check("unknown size/rate words -> box's own", VideoSetup.pickMode(AMLOGIC_4K, sys4k60, 2160, "huge", "fast") == 0, "");
        check("59.94 system kept with rate box", VideoSetup.pickMode(AMLOGIC_4K, new int[] { 1920, 1080, 5994 }, 1080, "1080", "box") == 0, "");

        System.out.println("Words");
        check("mode()", VideoSetup.mode(1920, 1080, 6000).equals("1920x1080, 60 Hz") && VideoSetup.mode(1920, 1080, 5994).equals("1920x1080, 59.94 Hz")
            && VideoSetup.mode(3840, 2160, 2397).equals("3840x2160, 23.97 Hz") && VideoSetup.mode(1280, 720, 5050).equals("1280x720, 50.5 Hz"),
            VideoSetup.mode(1280, 720, 5050));
        String other = VideoSetup.otherRates(AMLOGIC_4K, 1920, 1080, 6000);
        check("other rates at 1080p: 59.94, 50 and 24 Hz", other.equals("59.94, 50 and 24 Hz"), other);
        check("other rates: two", VideoSetup.otherRates(FHD_ONLY, 1920, 1080, 6000).equals("50 Hz"), VideoSetup.otherRates(FHD_ONLY, 1920, 1080, 6000));
        check("other rates: none", VideoSetup.otherRates(FHD_ONLY, 1280, 720, 6000).isEmpty() && VideoSetup.otherRates(null, 1, 1, 1).isEmpty(), "");

        allPassed();
    }
}
