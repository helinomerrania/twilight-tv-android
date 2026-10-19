package com.twilightcafe.tvplayer.schedule;

import com.twilightcafe.tvplayer.BuildConfig;
import com.twilightcafe.tvplayer.app.Core;
import com.twilightcafe.tvplayer.app.TvApp;

/**
 * What the app does by the clock, every 30 seconds: looks at the network address, ends quality setup after its
 * 10 minutes, reads settings.json (every 30 minutes) and looks for updates (every 6 hours), restarts a frozen
 * page, keeps the feeds fresh, and once a day: a fresh start at night (restartAt) and the box's volume back to
 * normal at opening time. When each one is due is Schedule's to say.
 */
public final class Maintenance {

    private final TvApp app;
    private final Schedule.Every settingsCheck = new Schedule.Every(30 * 60000L);     // settings.json every 30 minutes
    private final Schedule.Every updateCheck = new Schedule.Every(6 * 3600000L);      // updates every 6 hours
    private final Schedule.Daily nightly = new Schedule.Daily();                      // the fresh start at restartAt
    private final Schedule.Daily opening = new Schedule.Daily();                      // the volume at opening time

    public Maintenance(TvApp app) {
        this.app = app;
    }

    public void start() {
        app.core.main.postDelayed(tick, 3000);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            Core core = app.core;
            app.watch.tick(now);                                          // the diary: how the box is, and what happened since the last run
            app.network.refresh(false);
            if (app.quality.expired(now)) {
                app.quality.end();
                app.player.open();
            }
            if (settingsCheck.due(now)) {
                core.work.execute(() -> {
                    if (core.settings.refresh(BuildConfig.REPO)) {
                        core.main.post(app::settingsChanged);
                    }
                });
            }
            if (core.settings.flag("updates", true) && now - core.startedAt > 60000L && updateCheck.due(now)) {
                core.work.execute(app.updater::check);
            }
            app.player.watch(now);                                        // a frozen page: reloaded, or a new engine view
            app.feeds.refresh(now, core.onScreen());                      // the weather, prayer times, prices, song names
            if (core.onScreen() && nightly.due(now, Schedule.clock(core.settings.text("restartAt", "05:00")))) {
                if (app.engine.engineChanged()) app.player.restartApp("A fresh start for the night, for the engine's new settings.");
                else app.player.restartEngine("A fresh start for the night.");   // the whole app for the engine's new settings, else a new engine view
                app.volume.apply();
            }
            if (opening.due(now, Schedule.opening(core.settings.text("openHours", "")))) {
                app.volume.apply();                                       // the box's volume back to normal at opening
            }
            core.main.postDelayed(this, 30000);
        }
    };
}
