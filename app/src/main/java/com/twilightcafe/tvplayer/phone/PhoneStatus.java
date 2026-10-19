package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.BuildConfig;
import com.twilightcafe.tvplayer.app.TvApp;
import com.twilightcafe.tvplayer.box.VideoSetup;
import com.twilightcafe.tvplayer.page.PageEngine;
import com.twilightcafe.tvplayer.update.Updater;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the phone page's Control tab shows, every few seconds (GET /api/status): what the page is doing, the
 * box, the screen, the lock, the volume, the feeds, updates, and a warning when someone is guessing the PIN.
 */
public final class PhoneStatus {

    private final TvApp app;

    public PhoneStatus(TvApp app) {
        this.app = app;
    }

    public String json() {
        try {
            JSONObject o = new JSONObject();
            o.put("tv", app.network.name());
            o.put("build", BuildConfig.VERSION_NAME);
            o.put("engine", app.engine.name());
            o.put("engineMajor", app.engine.major());
            o.put("videoFormat", VideoSetup.describe(PageEngine.formatStarted()));
            o.put("videoFormatNext", app.engine.formatChanged() ? VideoSetup.describe(app.core.settings.text("videoFormat", "h264")) : "");
            JSONObject bx = app.box.json();
            if (bx != null) o.put("box", bx);
            o.put("screen", app.screen.facts());
            o.put("onScreen", app.core.onScreen());
            o.put("lock", app.lock.status());
            o.put("qualitySetup", app.quality.active());
            String page = app.link.pageNow();
            o.put("page", page == null ? JSONObject.NULL : new JSONObject(page));
            app.volume.putStatus(o);
            o.put("levelling", app.leveller.status);
            o.put("settings", app.core.settings.status);
            o.put("weather", app.core.settings.flag("infoPanel", true) ? app.feeds.weather.status : "");
            o.put("prices", app.feeds.wantsPrices() ? app.feeds.prices.status : "");
            o.put("prayerTimes", app.feeds.prayerCity().isEmpty() ? "" : app.feeds.prayers.status);
            o.put("names", app.feeds.titles.describe(app.link.songs()));
            o.put("updateReady", Updater.shown(app.updater.readyBuild));
            o.put("updateStatus", app.core.settings.flag("updates", true) ? app.updater.status : "off in settings.json");
            String said = app.commands.notice();
            int guesses = app.server.guessing();
            if (guesses > 0) {                                 // someone on the Wi-Fi guessing the PIN: the staff should know
                String warn = "Someone on the Wi-Fi has been guessing the PIN (" + guesses + " wrong in the last hour). Phones that "
                        + "already had it still work; new ones wait until it stops. A PIN of 6 to 8 digits (Settings) makes guessing hopeless.";
                said = said.isEmpty() ? warn : said + " " + warn;
            }
            o.put("notice", said);
            JSONArray others = new JSONArray();
            for (String[] t : app.network.others()) others.put(new JSONObject().put("name", t[0]).put("url", t[1]));
            o.put("others", others);
            return o.toString();
        } catch (Exception e) {
            return "{\"tv\":" + JSONObject.quote(app.network.name()) + ",\"error\":" + JSONObject.quote(e.toString()) + "}";
        }
    }
}
