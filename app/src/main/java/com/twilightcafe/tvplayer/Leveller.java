package com.twilightcafe.tvplayer;

import android.annotation.TargetApi;
import android.media.audiofx.DynamicsProcessing;
import android.os.Build;

/**
 * Evens out loud and quiet songs with Android's own sound compressor
 * (DynamicsProcessing, Android 9 and newer) on everything the box plays.
 * Loud passages are pulled down, quiet ones brought up, and a limiter stops
 * any peak from distorting. If the box doesn't allow it, nothing changes.
 */
final class Leveller {

    private Object effect;             // DynamicsProcessing; kept as Object so older Androids never load the class
    volatile String status = "off";

    void apply(boolean on) {
        if (!on) {
            release();
            status = "off (levelSound is false in settings.json)";
            return;
        }
        if (effect != null) return;
        if (Build.VERSION.SDK_INT < 28) {
            status = "not available (needs Android 9 or newer)";
            return;
        }
        try {
            effect = Api28.make();
            status = "on";
        } catch (Throwable e) {
            effect = null;
            status = "not allowed on this box (" + e.getClass().getSimpleName() + ")";
        }
    }

    void release() {
        if (effect == null) return;
        try {
            Api28.release(effect);
        } catch (Throwable e) {
            // gone already
        }
        effect = null;
    }

    @TargetApi(28)
    private static final class Api28 {
        static Object make() {
            DynamicsProcessing.Config config = new DynamicsProcessing.Config.Builder(
                    DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                    false, 0,      // no equaliser before
                    true, 1,       // one compressor band over all frequencies
                    false, 0,      // no equaliser after
                    true)          // limiter
                    .build();
            // From -26 dB up, loudness rises only a third as fast (3:1); +8 dB brings the
            // whole song back up, so quiet songs end up nearer the loud ones.
            config.setMbcBandAllChannelsTo(0, new DynamicsProcessing.MbcBand(
                    true, 20000f, 10f, 300f, 3f, -26f, 6f, -90f, 1f, 0f, 8f));
            // Nothing above -1 dB: no distortion from the extra gain
            config.setLimiterAllChannelsTo(new DynamicsProcessing.Limiter(
                    true, true, 0, 1f, 60f, 10f, -1f, 0f));
            DynamicsProcessing dp = new DynamicsProcessing(0, 0, config);   // session 0: the box's whole sound output
            dp.setEnabled(true);
            return dp;
        }

        static void release(Object o) {
            ((DynamicsProcessing) o).release();
        }
    }
}
