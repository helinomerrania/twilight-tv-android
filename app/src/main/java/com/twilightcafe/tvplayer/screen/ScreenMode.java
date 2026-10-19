package com.twilightcafe.tvplayer.screen;

import android.app.Activity;
import android.graphics.Point;
import android.view.Display;
import android.view.WindowManager;

import com.twilightcafe.tvplayer.box.BoxInfo;
import com.twilightcafe.tvplayer.box.VideoSetup;
import com.twilightcafe.tvplayer.settings.AppSettings;

/**
 * The screen mode from the settings: at most 1080 lines (screenSize) when the box draws more, and 50 or 60 Hz
 * (screenRate). The box's own mode is read first, before the app asks for any. And what the screen is now,
 * for the phone page and test mode.
 */
public final class ScreenMode {

    private final Activity activity;
    private final AppSettings settings;
    private int[] systemMode;                            // the screen mode the box chose itself {w, h, hz x 100}
    private int systemDrawnH;                            // and the lines the app was drawn with in it

    public ScreenMode(Activity activity, AppSettings settings) {
        this.activity = activity;
        this.settings = settings;
    }

    public void apply() {
        try {
            Display d = activity.getWindowManager().getDefaultDisplay();
            WindowManager.LayoutParams lp = activity.getWindow().getAttributes();
            if (systemMode == null) {
                if (lp.preferredDisplayModeId != 0) return;
                int[] m = BoxInfo.mode(d.getMode());
                Point p = new Point();
                d.getRealSize(p);
                systemMode = new int[] { m[1], m[2], m[3] };
                systemDrawnH = Math.min(p.x, p.y);
            }
            int id = VideoSetup.pickMode(BoxInfo.modes(d), systemMode, systemDrawnH,
                    settings.text("screenSize", "1080"), settings.text("screenRate", "box"));
            if (lp.preferredDisplayModeId != id) {
                lp.preferredDisplayModeId = id;
                activity.getWindow().setAttributes(lp);
            }
        } catch (RuntimeException e) {
            // this box can't change its screen mode
        }
    }

    /** "drawn at 1920x1080, sent to the TV as 1920x1080, 60 Hz (it also has 50 Hz)" */
    public String facts() {
        try {
            Display d = activity.getWindowManager().getDefaultDisplay();
            int[] m = BoxInfo.mode(d.getMode());
            Point p = new Point();
            d.getRealSize(p);
            String s = "drawn at " + p.x + "x" + p.y + ", sent to the TV as " + VideoSetup.mode(m[1], m[2], m[3]);
            String other = VideoSetup.otherRates(BoxInfo.modes(d), m[1], m[2], m[3]);
            if (!other.isEmpty()) s += " (it also has " + other + ")";
            int[] own = systemMode;
            if (own != null && (own[1] != m[2] || Math.abs(own[2] - m[3]) >= 5)) s += "; the box's own mode is " + VideoSetup.mode(own[0], own[1], own[2]);
            return s;
        } catch (RuntimeException e) {
            return "";
        }
    }
}
