package com.twilightcafe.tvplayer.app;

import com.twilightcafe.tvplayer.BuildConfig;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * What the app does by the clock, every 30 seconds: looks at the network address, ends quality setup after its
 * 10 minutes, reads settings.json (every 30 minutes) and looks for updates (every 6 hours), restarts a frozen
 * page, keeps the feeds fresh, and once a day: a fresh start at night (restartAt) and the box's volume back to
 * normal at opening time.
 */
public final class Maintenance {

    private final TvApp app;
    private long lastSettingsCheck = 0, lastUpdateCheck = 0;
    private String restartDoneDay = "", openingDoneDay = "";

    Maintenance(TvApp app) {
        this.app = app;
    }

    void start() {
        app.core.main.postDelayed(tick, 3000);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            Core core = app.core;
            app.network.refresh(false);
            if (app.quality.expired(now)) {
                app.quality.end();
                app.player.open();
            }
            if (now - lastSettingsCheck > 30 * 60000L) {                 // settings.json every 30 minutes
                lastSettingsCheck = now;
                core.work.execute(() -> {
                    if (core.settings.refresh(BuildConfig.REPO)) {
                        core.main.post(app::settingsChanged);
                    }
                });
            }
            if (core.settings.flag("updates", true) && now - core.startedAt > 60000L && now - lastUpdateCheck > 6 * 3600000L) {
                lastUpdateCheck = now;                                    // updates every 6 hours
                core.work.execute(app.updater::check);
            }
            app.player.watch(now);                                        // a frozen page: reloaded, or a new engine view
            app.feeds.refresh(now, core.onScreen());                      // the weather, prayer times, prices, song names
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
            String time = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(now));
            String restartAt = clock(core.settings.text("restartAt", "05:00"));
            if (core.onScreen() && time.equals(restartAt) && !today.equals(restartDoneDay)) {
                restartDoneDay = today;                                   // a fresh start every night:
                if (app.engine.engineChanged()) app.player.restartApp(); // the whole app, for the engine's new settings
                else app.player.restartEngine();
                app.volume.apply();
            }
            String opening = openingTime();
            if (opening != null && time.equals(opening) && !today.equals(openingDoneDay)) {
                openingDoneDay = today;                                   // the box's volume back to normal at opening
                app.volume.apply();
            }
            core.main.postDelayed(this, 30000);
        }
    };

    /** "9:30" -> "09:30"; anything unreadable -> null */
    static String clock(String s) {
        if (s == null) return null;
        String[] p = s.trim().split("[:.]");
        try {
            int h = Integer.parseInt(p[0].trim()), m = Integer.parseInt(p[1].trim());
            if (h < 0 || h > 24 || m < 0 || m > 59) return null;
            return String.format(Locale.US, "%02d:%02d", h % 24, m);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // The start of the opening hours ("10:00-02:00" -> "10:00")
    private String openingTime() {
        String hours = app.core.settings.text("openHours", "");
        if (hours.isEmpty()) return null;
        return clock(hours.split(",")[0].split("-")[0]);
    }
}
