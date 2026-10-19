package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.app.TvApp;
import com.twilightcafe.tvplayer.feeds.TitleBook;

import java.util.Collections;

/**
 * The phone page's buttons (POST /api/cmd?do=...): for the page (next song, pause, volume, zoom, a song to
 * play...), for the box (its volume, the other app, the lock), and for the app (an update, quality setup,
 * test mode, a fresh start). They come on the server's threads; what touches the screen runs on the main thread.
 */
public final class PhoneCommands {

    private final TvApp app;
    private volatile String notice = "";                 // the answer to the last update asked for, for the phone page
    private volatile long noticeAt = 0;

    public PhoneCommands(TvApp app) {
        this.app = app;
    }

    /** What the phone page shows at the top: the answer to an update asked for, for 2 minutes */
    public String notice() {
        return System.currentTimeMillis() - noticeAt < 120000L ? notice : "";
    }

    /** False when the TV couldn't do it */
    public boolean run(final String what) {
        switch (what) {
            case "next":
            case "pause":
            case "resume":
            case "vol+":
            case "vol-":
            case "zoom+":
            case "zoom-":
            case "reload":
            case "unfreeze":
                return app.link.toPage(what);
            case "identify":
                return app.link.toPage("identify:" + app.network.name());
            case "tvvol+":
            case "tvvol-":
                if (!app.volume.adjustable()) return false;
                app.core.main.post(() -> app.volume.step(what.equals("tvvol+")));
                return true;
            case "otherapp":
                final boolean[] opened = { false };
                app.core.runOnMain(() -> opened[0] = app.lock.openOtherApp(false));
                return opened[0];
            case "backhome":
                app.core.main.post(app.lock::comeBack);
                return true;
            case "unlock":
                app.lock.unlock(false);
                return true;
            case "lock":
                app.lock.lock();
                return true;
            case "update":
                app.lock.allowSettings();                // Android's install question, and its settings
                final String[] message = { null };
                app.core.runOnMain(() -> message[0] = app.updater.install(app.core.activity));
                notice = message[0] == null ? "" : message[0];
                noticeAt = System.currentTimeMillis();
                return message[0] != null;
            case "qualitysetup":
            case "qualitydone":
                app.core.main.post(() -> {
                    if (what.equals("qualitysetup")) app.quality.start();
                    else app.quality.end();
                    app.player.open();
                });
                return true;
            case "testmode":
                app.core.main.post(() -> {
                    app.test.toggle();
                    app.player.open();
                });
                return true;
            case "restart":
                app.core.main.post(() -> app.player.restartApp("Restarted from the phone."));
                return true;
            case "forget":
                return app.link.toPage("forget");
            case "checkupdate":
                app.core.work.execute(app.updater::check);
                return true;
            default:
                return pageCommand(what);
        }
    }

    // Commands with a value, for the page: a song to play next or now, a quiet minute, a special day's look
    private boolean pageCommand(String what) {
        int colon = what.indexOf(':');
        if (colon < 0) return false;
        String name = what.substring(0, colon), value = what.substring(colon + 1);
        switch (name) {
            case "playnext":
            case "playnow":
                if (!TitleBook.isId(value)) return false;
                app.feeds.titles.want(Collections.singletonList(value));   // a song from a link: its name too
                return app.link.toPage(what);
            case "unnext":
                return TitleBook.isId(value) && app.link.toPage(what);
            case "quiet":
                if (!value.matches("\\d{1,4}") || Integer.parseInt(value) > 3600) return false;
                return app.link.toPage(what);
            case "look":
                return value.matches("[A-Za-z]{1,20}") && app.link.toPage(what);
            default:
                return false;
        }
    }
}
