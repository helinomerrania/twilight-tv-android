package com.twilightcafe.tvplayer.page;

import com.twilightcafe.tvplayer.Restart;
import com.twilightcafe.tvplayer.app.Core;
import com.twilightcafe.tvplayer.remote.QualitySetup;
import com.twilightcafe.tvplayer.screen.TestMode;

import java.util.function.IntSupplier;

/**
 * What's on the TV: the page, opened in its mode (plain, test mode with its details, or quality setup with
 * YouTube's computer player and a pointer), watched while it plays, and started fresh when it froze: a reload
 * first, a whole new engine view if that didn't help, or the whole app for the engine's new start-up settings.
 */
public final class PlayerController {

    private final Core core;
    private final PageEngine engine;
    private final PageLink link;
    private final QualitySetup quality;
    private final TestMode test;
    private final IntSupplier port;                      // the app's web server's port (0: none yet)
    private long openedAt = 0, lastReload = 0;
    private int reloadsInRow = 0;

    public PlayerController(Core core, PageEngine engine, PageLink link, QualitySetup quality, TestMode test, IntSupplier port) {
        this.core = core;
        this.engine = engine;
        this.link = link;
        this.quality = quality;
        this.test = test;
        this.port = port;
        engine.setOpener(this::open);
    }

    /** The page again, in the mode it's in now (main thread) */
    public void open() {
        // What the app draws over the page: the setup pointer, or test mode's details (never both)
        quality.syncView();
        test.syncView(quality.active());
        if (!engine.ready()) return;
        long now = System.currentTimeMillis();
        openedAt = now;
        link.opened(now);
        int p = port.getAsInt();
        if (p == 0) return;                              // no web server: the watchdog tries again
        boolean setup = quality.active();
        // Quality setup leaves test mode's details out: they would cover YouTube's controls
        engine.load(link.address(p, setup, test.on()), setup);
    }

    /** A fresh engine view and page: every night, and when the page froze and reloading didn't help */
    public void restartEngine() {
        engine.restart();
    }

    /**
     * The whole app again from scratch, so Firefox's engine starts again too, with its new start-up settings
     * (only while on screen: Android doesn't let an app open itself from the background)
     */
    public void restartApp() {
        if (!core.onScreen()) {
            restartEngine();
            return;
        }
        try {
            Restart.now(core.activity);
        } catch (RuntimeException e) {
            restartEngine();                             // couldn't: at least a fresh page
        }
    }

    /**
     * Every 30 seconds. The page says "alive" every 5 seconds. Silent for 2 minutes: reload it;
     * three times within half an hour: a whole new engine view.
     */
    public void watch(long now) {
        if (core.onScreen() && engine.hasView() && now - openedAt > 120000L && now - link.lastAlive() > 120000L) {
            reloadsInRow = now - lastReload < 30 * 60000L ? reloadsInRow + 1 : 1;
            lastReload = now;
            if (reloadsInRow >= 3) {
                reloadsInRow = 0;
                restartEngine();
            } else {
                open();
            }
        }
    }

    /** Left the app: the music stops (the page opens again when the app comes back) */
    public void stop() {
        engine.stopPage();
    }
}
