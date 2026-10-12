package com.twilightcafe.tvplayer;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;
import java.util.TimeZone;

/**
 * The weather for the TV's info panel, from MET Norway (the Norwegian Meteorological
 * Institute's free forecast service; its data is CC BY 4.0, and the panel credits it).
 * Their rules: say who is asking (a User-Agent with a link), don't ask again before the
 * time they give (Expires), send "If-Modified-Since", and use at most 4 decimals for the
 * place. The app keeps the next 48 hours, so the panel stays right through an internet
 * cut, and it only asks while the app is on screen.
 * Plain Java (and org.json), so it can be tested on a computer.
 */
final class WeatherFeed {

    /** Fetches one address (the app uses the internet; tests use a stand-in). */
    interface Fetcher {
        Net.Reply get(String url, String ifModifiedSince) throws IOException;
    }

    static final int HOURS = 48;
    private static final long MIN_GAP = 30 * 60000L;       // at most every 30 minutes, whatever Expires says
    private static final long RETRY = 15 * 60000L;         // after a failure

    private final File file;
    private final Fetcher fetcher;
    private final long jitter = new Random().nextInt(5 * 60000);   // spread out, as MET asks
    private JSONArray hours = new JSONArray();            // [[time ms, °C, MET symbol], ...] one per hour
    private long fetchedAt, expires, triedAt, waitUntil;
    private String lastModified, place = "";
    private boolean busy;
    private volatile int version = 1;
    volatile String status = "not asked yet";

    WeatherFeed(File file, Fetcher fetcher) {
        this.file = file;
        this.fetcher = fetcher;
        load();
    }

    int version() {
        return version;
    }

    // MET wants at most 4 decimals
    static String where(double lat, double lon) {
        return String.format(Locale.US, "%.4f,%.4f", lat, lon);
    }

    /** Time to ask again? (Never more often than every 30 minutes, or before MET's Expires time.) */
    synchronized boolean due(long now, double lat, double lon) {
        if (busy || now < waitUntil) return false;
        if (!where(lat, lon).equals(place)) return now - triedAt > 60000L;   // a new place: at once
        return now >= Math.max(expires, fetchedAt + MIN_GAP) + jitter;
    }

    /** Asks MET for the forecast (background thread). */
    void refresh(double lat, double lon) {
        String at = where(lat, lon);
        String since;
        synchronized (this) {
            if (busy) return;
            busy = true;
            triedAt = System.currentTimeMillis();
            waitUntil = triedAt + RETRY;                      // if this fails
            since = at.equals(place) ? lastModified : null;
        }
        try {
            String[] ll = at.split(",");
            Net.Reply r = fetcher.get("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + ll[0] + "&lon=" + ll[1], since);
            long now = System.currentTimeMillis();
            if (r.code == 304) {                              // nothing new since the last time
                synchronized (this) {
                    expires = r.expires;
                    fetchedAt = now;
                    waitUntil = 0;
                    save();
                }
                status = "from MET Norway, checked " + clock(now);
                return;
            }
            if (r.code == 429) {
                synchronized (this) {
                    waitUntil = now + 2 * MIN_GAP;
                }
                status = "MET Norway asked to slow down; asking again in an hour";
                return;
            }
            if ((r.code != 200 && r.code != 203) || r.body == null) {
                status = "couldn't get the weather (" + r.code + ")";
                return;
            }
            JSONArray h = parse(r.body);
            if (h.length() == 0) {
                status = "MET Norway's answer had no hours in it";
                return;
            }
            synchronized (this) {
                hours = h;
                fetchedAt = now;
                expires = r.expires;
                lastModified = r.lastModified;
                place = at;
                waitUntil = 0;
                version++;
                save();
            }
            // 203: MET will retire this version of their service; it still works for now
            status = "from MET Norway, " + clock(now) + (r.code == 203 ? " (MET says this version of their service is old)" : "");
        } catch (Exception e) {                               // no internet, or an answer that can't be read
            status = "couldn't reach the weather service (" + e.getClass().getSimpleName() + ")";
        } finally {
            synchronized (this) {
                busy = false;
            }
        }
    }

    /** MET's answer -> the hourly part: [[time ms, °C, symbol], ...], at most 48 hours. */
    static JSONArray parse(String body) throws JSONException {
        JSONArray series = new JSONObject(body).getJSONObject("properties").getJSONArray("timeseries");
        JSONArray out = new JSONArray();
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        for (int i = 0; i < series.length() && out.length() < HOURS; i++) {
            JSONObject e = series.optJSONObject(i);
            JSONObject data = e == null ? null : e.optJSONObject("data");
            if (data == null) continue;
            JSONObject next = data.optJSONObject("next_1_hours");
            if (next == null) break;                          // further on, MET gives 6-hour steps only
            JSONObject instant = data.optJSONObject("instant");
            JSONObject details = instant == null ? null : instant.optJSONObject("details");
            JSONObject summary = next.optJSONObject("summary");
            if (details == null || !details.has("air_temperature") || summary == null) continue;
            long t;
            try {
                t = iso.parse(e.optString("time", "")).getTime();
            } catch (ParseException ex) {
                continue;
            }
            double temp = Math.round(details.optDouble("air_temperature", 0) * 10) / 10.0;
            out.put(new JSONArray().put(t).put(temp).put(summary.optString("symbol_code", "")));
        }
        return out;
    }

    /** For the page: {at: when fetched, hours: [...]}, or null before the first forecast. */
    synchronized JSONObject forPage() {
        if (hours.length() == 0) return null;
        try {
            return new JSONObject().put("at", fetchedAt).put("hours", hours);
        } catch (JSONException e) {
            return null;
        }
    }

    private static String clock(long t) {
        return new SimpleDateFormat("d MMM HH:mm", Locale.US).format(new Date(t));
    }

    private void load() {
        if (file == null || !file.exists()) return;
        try {
            JSONObject o = new JSONObject(TitleBook.readFile(file));
            JSONArray h = o.optJSONArray("hours");
            if (h != null) hours = h;
            fetchedAt = o.optLong("at", 0);
            expires = o.optLong("expires", 0);
            lastModified = o.has("lastModified") ? o.optString("lastModified", null) : null;
            place = o.optString("place", "");
            if (fetchedAt > 0) status = "from MET Norway, " + clock(fetchedAt);
        } catch (IOException | JSONException e) {
            // start again
        }
    }

    private void save() {
        if (file == null) return;
        try {
            JSONObject o = new JSONObject().put("hours", hours).put("at", fetchedAt).put("expires", expires).put("place", place);
            if (lastModified != null) o.put("lastModified", lastModified);
            TitleBook.writeFile(file, o.toString());
        } catch (IOException | JSONException e) {
            // kept in memory
        }
    }
}
