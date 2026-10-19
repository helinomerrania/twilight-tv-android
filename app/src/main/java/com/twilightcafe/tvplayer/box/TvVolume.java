package com.twilightcafe.tvplayer.box;

import android.content.Context;
import android.media.AudioManager;

import com.twilightcafe.tvplayer.settings.AppSettings;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * The box's own media volume, from tvVolume (percent) in the settings: set again at every new song, at
 * opening time and every night, whatever the remote did meanwhile; and the phone's TV volume buttons.
 */
public final class TvVolume {

    private final AudioManager audio;
    private final AppSettings settings;
    private int setting;                                 // tvVolume when last used: only a change of the setting itself sets it again

    public TvVolume(Context c, AppSettings settings) {
        this.audio = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        this.settings = settings;
        this.setting = settings.number("tvVolume", 0);
    }

    /** The volume from the settings (0 = leave it) */
    public void apply() {
        int v = settings.number("tvVolume", 0);
        if (v <= 0 || v > 100 || audio == null || audio.isVolumeFixed()) return;
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.max(1, Math.round(max * v / 100f)), 0);
    }

    /** The settings changed: the volume again, but only when tvVolume itself changed */
    public void settingsChanged() {
        int v = settings.number("tvVolume", 0);
        if (v != setting) {
            setting = v;
            apply();
        }
    }

    /** The box lets the app change its volume */
    public boolean adjustable() {
        return audio != null && !audio.isVolumeFixed();
    }

    /** One step up or down, with Android's volume bar on the TV (main thread) */
    public void step(boolean up) {
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, up ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
    }

    /** For the phone page: the volume now, its maximum, and the setting */
    public void putStatus(JSONObject o) throws JSONException {
        if (audio == null) return;
        o.put("tvVolumeFixed", audio.isVolumeFixed());
        o.put("tvVolume", audio.getStreamVolume(AudioManager.STREAM_MUSIC));
        o.put("tvVolumeMax", audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        o.put("tvVolumeSet", settings.number("tvVolume", 0));
    }

    /** For test mode: "9 of 15  (back to 60% at every new song)", or null when Android doesn't say */
    public String describe() {
        if (audio == null) return null;
        if (audio.isVolumeFixed()) return "set by the TV itself";
        return audio.getStreamVolume(AudioManager.STREAM_MUSIC) + " of " + audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                + (settings.number("tvVolume", 0) > 0 ? "  (back to " + settings.number("tvVolume", 0) + "% at every new song)" : "");
    }
}
