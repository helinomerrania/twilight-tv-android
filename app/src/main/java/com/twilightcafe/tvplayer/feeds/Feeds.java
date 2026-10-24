package com.twilightcafe.tvplayer.feeds;

import android.content.Context;

import com.twilightcafe.tvplayer.BuildConfig;
import com.twilightcafe.tvplayer.settings.AppSettings;
import com.twilightcafe.tvplayer.util.Net;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * What comes from the internet for the info panel and between songs: song names (YouTube), the weather
 * (MET Norway, or WeatherAPI.com with a key), gold and currency prices (Tirezh) and the call to prayer's
 * times (amozhgary.tv). When each is asked for, on a worker of their own (so the weather never waits behind
 * an update download), and what the TV page gets from them.
 */
public final class Feeds {

    public final TitleBook titles;                       // song names, from YouTube
    public final WeatherFeed weather;                    // from MET Norway, or WeatherAPI.com
    public final PriceFeed prices;                       // gold and currency prices, from Tirezh
    public final PrayerFeed prayers;                     // the call to prayer's times, from amozhgary.tv

    private final AppSettings settings;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    public Feeds(Context c, AppSettings settings) {
        this.settings = settings;
        // Who is asking, with a link: MET Norway asks every app for this
        String repo = BuildConfig.REPO == null || BuildConfig.REPO.isEmpty() ? "helinomerrania/twilight-tv-android" : BuildConfig.REPO;
        final String agent = "TwilightTV/" + BuildConfig.VERSION_NAME + " (+https://github.com/" + repo + ")";
        File dir = c.getFilesDir();
        titles = new TitleBook(new File(dir, "titles.json"), url -> Net.fetch(url, 15000, agent, null));
        weather = new WeatherFeed(new File(dir, "weather.json"), (url, ifModifiedSince) -> Net.fetch(url, 20000, agent, ifModifiedSince));
        prices = new PriceFeed(new File(dir, "prices.json"), url -> Net.fetch(url, 20000, agent, null));
        prayers = new PrayerFeed(new File(dir, "prayers.json"), url -> Net.fetch(url, 20000, agent, null, "text/html"));
    }

    /**
     * Every 30 seconds: the weather (only while on screen, as MET asks; WeatherAPI.com with a key), the prayer
     * times and the prices when they're due, and song names after an internet cut
     */
    public void refresh(long now, boolean onScreen) {
        if (onScreen && settings.flag("infoPanel", true)) {
            final double[] ll = place();
            final String key = settings.text("weatherKey", "").trim();
            if (weather.due(now, ll[0], ll[1], key)) {
                worker.execute(() -> weather.refresh(ll[0], ll[1], key));
            }
        }
        final String city = prayerCity();
        if (onScreen && !city.isEmpty() && prayers.due(now, city)) {
            worker.execute(() -> prayers.refresh(city));
        }
        final String priceUrl = pricesUrl();
        if (onScreen && wantsPrices() && prices.due(now, priceUrl)) {
            worker.execute(() -> prices.refresh(priceUrl));
        }
        titles.start();
    }

    /** The town on amozhgary.tv ("" = the TV page works it all out): its prayer times, when the music pauses for them, and its Hijri dates */
    public String prayerCity() {
        boolean wanted = settings.number("prayerPause", 5) > 0 || settings.flag("infoPanel", true);
        return wanted ? settings.text("prayerCity", "Ranya").trim() : "";
    }

    /** Where the prices come from: pricesUrl (the tirezh worker at another address), else its own (PriceFeed.URL) */
    public String pricesUrl() {
        return PriceFeed.address(settings.text("pricesUrl", ""));
    }

    /** Prices only when the panel shows some (the built-in choice: the dollar and gold) */
    public boolean wantsPrices() {
        JSONArray items = settings.list("priceItems");
        return settings.flag("infoPanel", true) && (items == null || items.length() > 0);
    }

    /** Where the weather is for: lat/lon from the settings, else the page's built-in place (Ranya) */
    public double[] place() {
        double lat = settings.decimal("lat", Double.NaN), lon = settings.decimal("lon", Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            try {
                JSONObject d = new JSONObject(settings.pageDefaults());
                lat = d.optDouble("lat", 36.2549);
                lon = d.optDouble("lon", 44.8838);
            } catch (JSONException e) {
                lat = 36.2549;
                lon = 44.8838;
            }
        }
        return new double[] { lat, lon };
    }

    /** Goes up whenever any of them has something new for the page */
    public int version() {
        return titles.version() + weather.version() + prices.version() + prayers.version();
    }

    /** Their part of what the page gets from the app: the songs' names, the weather, the prices, the prayer times */
    public void putForPage(JSONObject x, List<String> songs) throws JSONException {
        x.put("titles", titles.forPage(songs));
        JSONObject w = weather.forPage();
        if (w != null) x.put("weather", w);
        JSONObject p = prices.forPage();
        if (p != null) x.put("prices", p);
        JSONObject pt = prayerCity().isEmpty() ? null : prayers.forPage();
        if (pt != null) x.put("prayers", pt);
    }

    public void destroy() {
        worker.shutdownNow();
    }
}
