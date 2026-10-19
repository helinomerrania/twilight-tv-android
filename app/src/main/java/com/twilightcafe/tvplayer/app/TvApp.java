package com.twilightcafe.tvplayer.app;

import android.app.Activity;
import android.widget.FrameLayout;

import com.twilightcafe.tvplayer.BuildConfig;
import com.twilightcafe.tvplayer.box.BoxReport;
import com.twilightcafe.tvplayer.box.Leveller;
import com.twilightcafe.tvplayer.box.TvVolume;
import com.twilightcafe.tvplayer.box.WifiKeeper;
import com.twilightcafe.tvplayer.feeds.Feeds;
import com.twilightcafe.tvplayer.lock.BoxLock;
import com.twilightcafe.tvplayer.lock.Permissions;
import com.twilightcafe.tvplayer.page.PageEngine;
import com.twilightcafe.tvplayer.page.PageLink;
import com.twilightcafe.tvplayer.page.PlayerController;
import com.twilightcafe.tvplayer.phone.ControlServer;
import com.twilightcafe.tvplayer.phone.PhoneApi;
import com.twilightcafe.tvplayer.phone.PhoneCommands;
import com.twilightcafe.tvplayer.phone.PhonePin;
import com.twilightcafe.tvplayer.phone.PhoneSettings;
import com.twilightcafe.tvplayer.phone.PhoneStatus;
import com.twilightcafe.tvplayer.phone.TvNetwork;
import com.twilightcafe.tvplayer.remote.QualitySetup;
import com.twilightcafe.tvplayer.remote.RemoteKeys;
import com.twilightcafe.tvplayer.screen.ScreenMode;
import com.twilightcafe.tvplayer.screen.TestMode;
import com.twilightcafe.tvplayer.store.LookStore;
import com.twilightcafe.tvplayer.store.MenuStore;
import com.twilightcafe.tvplayer.store.PictureStore;
import com.twilightcafe.tvplayer.update.Updater;

import java.io.File;

/**
 * Twilight TV's parts, made once when the app starts and wired together (MainActivity only passes on
 * Android's events). Each part has one job; this is the one place that knows them all.
 *
 *   the TV page:      PageEngine (Firefox's engine), PageLink (the page's check-in), PlayerController
 *   the phone page:   ControlServer (and a second one, for the customers' menu), PhoneApi, PhoneCommands,
 *                     PhoneStatus, PhoneSettings, PhonePin, TvNetwork
 *   from the internet: Feeds (song names, weather, prices, prayer times), Updater
 *   kept on the box:  the settings (Core), PictureStore, LookStore, MenuStore
 *   the box itself:   TvVolume, Leveller, WifiKeeper, BoxReport, ScreenMode, BoxLock, Permissions
 *   on screen:        TestMode, QualitySetup; the remote: RemoteKeys
 *   by the clock:     Maintenance
 */
public final class TvApp {

    public final Core core;
    public final AppAssets assets;
    public final Updater updater;
    public final PictureStore pictures;                  // the café's own, from the phone page
    public final LookStore looks;                        // the café screen's pictures the café put in from the phone
    public final MenuStore menus;                        // the café's menu for customers' phones, made on the phone page
    public final Feeds feeds;
    public final TvVolume volume;
    public final WifiKeeper wifi;
    public final PhonePin pin;
    public final Leveller leveller = new Leveller();
    public final BoxReport box = new BoxReport();
    public final ScreenMode screen;
    public final BoxLock lock;
    public final Permissions permissions;
    public final TestMode test;
    public final PageEngine engine;
    public final QualitySetup quality;
    public final ControlServer server;                   // the phone page, on the café Wi-Fi (with the PIN)
    public final ControlServer menuServer;               // the menu for customers' phones, on a port of its own
    public final TvNetwork network;
    public final PageLink link;
    public final PlayerController player;
    public final PhoneCommands commands;
    public final PhoneStatus status;
    public final PhoneSettings phoneSettings;
    public final Maintenance maintenance;
    public final RemoteKeys keys;

    public TvApp(Activity activity, FrameLayout root) {
        core = new Core(activity);
        assets = new AppAssets(activity);
        updater = new Updater(activity, BuildConfig.REPO, BuildConfig.VERSION_CODE);
        feeds = new Feeds(activity, core.settings);
        pictures = new PictureStore(new File(activity.getFilesDir(), "pictures"));
        looks = new LookStore(new File(activity.getFilesDir(), "looks"));
        menus = new MenuStore(new File(activity.getFilesDir(), "menu"));
        volume = new TvVolume(activity, core.settings);
        wifi = new WifiKeeper(activity);
        pin = new PhonePin(activity, core.settings);
        leveller.apply(core.settings.flag("levelSound", true));
        volume.apply();
        screen = new ScreenMode(activity, core.settings);
        lock = new BoxLock(core);
        permissions = new Permissions(activity, core.settings, lock);

        test = new TestMode(this, activity, root);                 // views over the page: test mode's details...
        PhoneApi api = new PhoneApi(this);
        server = new ControlServer(api);
        menuServer = new ControlServer(api, true);
        engine = new PageEngine(core, root, server::port);
        quality = new QualitySetup(activity, core.main, root, engine);   // ...and the setup pointer (the page goes under both)
        network = new TvNetwork(activity, core.settings, menus, server, menuServer);
        link = new PageLink(core, assets, feeds, pictures, looks, menus, network, box, volume, engine);
        player = new PlayerController(core, engine, link, quality, test, server::port);
        commands = new PhoneCommands(this);
        status = new PhoneStatus(this);
        phoneSettings = new PhoneSettings(this);
        maintenance = new Maintenance(this);
        keys = new RemoteKeys(player, engine, quality, test, lock);
    }

    /** Once, after the parts are made: the engine, the box, the servers, the network, the questions, the clock */
    public void start() {
        engine.make();
        engine.readVersion();
        box.read();
        core.main.postDelayed(screen::apply, 4000);     // once the screen has settled in the box's own mode
        server.start();
        menuServer.start(8090, 8099);                    // customers' phones: the menu alone, on a port of its own
        network.refresh(false);
        permissions.askAtStart();
        lock.listenForHome();
        maintenance.start();
    }

    /** Twilight TV came on screen */
    public void onStart() {
        core.setOnScreen(true);
        lock.onStart();
        wifi.hold();                                     // Wi-Fi at full power while playing
        player.open();
    }

    /** Twilight TV left the screen (Home, another app, the TV going to sleep) */
    public void onStop() {
        core.setOnScreen(false);
        lock.onStop();                                   // locked: anything but the other app is sent away
        wifi.letGo();
        player.stop();                                   // the music stops; the page starts again when the app comes back
    }

    public void onDestroy() {
        core.destroy();
        lock.destroy();
        feeds.destroy();
        server.stop();
        menuServer.stop();
        network.stop();
        leveller.release();
        wifi.letGo();
        engine.close();
    }

    /**
     * The settings changed (settings.json, or the phone's Settings screen). The page sees the new settings by
     * itself and uses them at once; a new video format waits for the app's next start (from the phone at once,
     * from settings.json at night).
     */
    public void settingsChanged() {
        pin.refresh();
        lock.settingsChanged();                          // otherApp may have changed
        leveller.apply(core.settings.flag("levelSound", true));
        volume.settingsChanged();                        // only when that setting itself changed
        network.refresh(true);                           // the TV's name may have changed
        screen.apply();
    }
}
