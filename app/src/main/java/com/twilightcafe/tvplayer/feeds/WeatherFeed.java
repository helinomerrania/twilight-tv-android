package com.twilightcafe.tvplayer.feeds;

import com.twilightcafe.tvplayer.util.Disk;
import com.twilightcafe.tvplayer.util.Net;
import com.twilightcafe.tvplayer.util.Times;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The weather for the TV's info panel, from MET Norway (the Norwegian Meteorological
 * Institute's free forecast service; its data is CC BY 4.0, and the panel credits it), or,
 * with a key from a free WeatherAPI.com account, from WeatherAPI.com, whose "now" comes from
 * real measurements (and the panel credits it). MET's rules: say who is asking (a User-Agent
 * with a link), don't ask again before the time they give (Expires), send "If-Modified-Since",
 * and use at most 4 decimals for the place. The app keeps the next 48 hours, so the panel
 * stays right through an internet cut, and it only asks while the app is on screen.
 * Plain Java (and org.json), so it can be tested on a computer.
 */
public final class WeatherFeed {

    /** Fetches one address (the app uses the internet; tests use a stand-in). */
    public interface Fetcher {
        Net.Reply get(String url, String ifModifiedSince) throws IOException;
    }

    static final int HOURS = 48;
    private static final long MIN_GAP = 30 * 60000L;       // at most every 30 minutes, whatever Expires says
    private static final long API_GAP = 15 * 60000L;       // WeatherAPI.com: every 15 minutes (its "now" moves)
    private static final long RETRY = 15 * 60000L;         // after a failure

    private final File file;
    private final Fetcher fetcher;
    private final long jitter = new SecureRandom().nextInt(5 * 60000);   // spread out, as MET asks
    private JSONArray hours = new JSONArray();            // [[time ms, °C, MET symbol], ...] one per hour
    private JSONArray now;                                // WeatherAPI.com's measurement: [time ms, °C, symbol], or null
    private long fetchedAt, expires, triedAt, waitUntil;
    private String lastModified, place = "", source = "met";
    private boolean busy;
    private volatile int version = 1;
    public volatile String status = "not asked yet";

    public WeatherFeed(File file, Fetcher fetcher) {
        this.file = file;
        this.fetcher = fetcher;
        load();
    }

    public int version() {
        return version;
    }

    // MET wants at most 4 decimals
    static String where(double lat, double lon) {
        return String.format(Locale.US, "%.4f,%.4f", lat, lon);
    }

    /**
     * Time to ask again? MET Norway (key ""): never more often than every 30 minutes, or before its Expires
     * time. WeatherAPI.com (with its key): every 15 minutes.
     */
    public synchronized boolean due(long now, double lat, double lon, String key) {
        if (busy || now < waitUntil) return false;
        String src = key == null || key.trim().isEmpty() ? "met" : "weatherapi";
        if (!where(lat, lon).equals(place) || !src.equals(source)) return now - triedAt > 60000L;   // a new place or source: at once
        if (src.equals("weatherapi")) return now >= fetchedAt + API_GAP;
        return now >= Math.max(expires, fetchedAt + MIN_GAP) + jitter;
    }

    /** Asks WeatherAPI.com with this key, or MET Norway without one (background thread). */
    public void refresh(double lat, double lon, String key) {
        if (key == null || key.trim().isEmpty()) {
            refresh(lat, lon);
            return;
        }
        String at = where(lat, lon);
        synchronized (this) {
            if (busy) return;
            busy = true;
            triedAt = System.currentTimeMillis();
            waitUntil = triedAt + RETRY / 3;                  // if this fails: again in 5 minutes
        }
        boolean useMet = false;
        try {
            Net.Reply r = fetcher.get("https://api.weatherapi.com/v1/forecast.json?key=" + URLEncoder.encode(key.trim(), "UTF-8")
                    + "&q=" + at + "&days=3&aqi=no&alerts=no", null);
            long now = System.currentTimeMillis();
            if (r.code == 400 || r.code == 401 || r.code == 403) {
                status = "WeatherAPI.com didn't take the key (" + r.code + "): check it on the phone, Settings, Weather. MET Norway meanwhile";
                useMet = true;
                return;
            }
            if (r.code != 200 || r.body == null) {
                status = "couldn't get the weather from WeatherAPI.com (" + r.code + ")";
                return;
            }
            JSONObject o = parseWeatherApi(r.body, now);
            if (o == null) {
                status = "WeatherAPI.com's answer had no hours in it";
                return;
            }
            synchronized (this) {
                hours = o.getJSONArray("hours");
                this.now = o.optJSONArray("now");
                fetchedAt = now;
                place = at;
                source = "weatherapi";
                waitUntil = 0;
                version++;
                save();
            }
            status = "from WeatherAPI.com, " + Times.stamp(now);
        } catch (Exception e) {
            status = "couldn't reach WeatherAPI.com (" + e.getClass().getSimpleName() + ")";
        } finally {
            synchronized (this) {
                busy = false;
            }
            if (useMet) {
                String why = status;
                synchronized (this) {
                    waitUntil = 0;
                }
                refresh(lat, lon);
                status = why + " (" + status + ")";
                synchronized (this) {
                    source = "met-nokey";                     // not WeatherAPI.com: asked again in a while, not at once
                    waitUntil = System.currentTimeMillis() + 60 * 60000L;
                }
            }
        }
    }

    /**
     * WeatherAPI.com's answer -> {hours: [[time ms, °C, MET symbol], ...] from this hour on, at
     * most 48; now: [time measured (ms), °C, MET symbol]}, or null.
     */
    static JSONObject parseWeatherApi(String body, long now) throws JSONException {
        JSONObject root = new JSONObject(body);
        JSONArray days = root.optJSONObject("forecast") == null ? null : root.getJSONObject("forecast").optJSONArray("forecastday");
        JSONArray out = new JSONArray();
        long thisHour = now - now % 3600000L;
        for (int i = 0; days != null && i < days.length(); i++) {
            JSONArray hs = days.getJSONObject(i).optJSONArray("hour");
            for (int j = 0; hs != null && j < hs.length() && out.length() < HOURS; j++) {
                JSONObject h = hs.getJSONObject(j);
                long t = h.optLong("time_epoch", 0) * 1000L;
                if (t < thisHour || !h.has("temp_c")) continue;
                JSONObject c = h.optJSONObject("condition");
                out.put(new JSONArray().put(t).put(Math.round(h.optDouble("temp_c", 0) * 10) / 10.0)
                        .put(symbol(c == null ? 0 : c.optInt("code", 0), h.optInt("is_day", 1) == 1)));
            }
        }
        if (out.length() == 0) return null;
        JSONObject o = new JSONObject().put("hours", out);
        JSONObject cur = root.optJSONObject("current");
        if (cur != null && cur.has("temp_c")) {
            JSONObject c = cur.optJSONObject("condition");
            o.put("now", new JSONArray().put(cur.optLong("last_updated_epoch", now / 1000) * 1000L)
                    .put(Math.round(cur.optDouble("temp_c", 0) * 10) / 10.0).put(symbol(c == null ? 0 : c.optInt("code", 0), cur.optInt("is_day", 1) == 1)));
        }
        return o;
    }

    /** WeatherAPI.com's condition code -> the MET Norway symbol the panel knows (its words and pictures). */
    static String symbol(int code, boolean day) {
        String dn = day ? "_day" : "_night";
        switch (code) {
            case 1000: return "clearsky" + dn;
            case 1003: return "partlycloudy" + dn;
            case 1030: case 1135: case 1147: return "fog";
            case 1087: return "lightrainshowersandthunder" + dn;
            case 1273: return "lightrainandthunder";
            case 1276: return "rainandthunder";
            case 1279: return "lightsnowandthunder";
            case 1282: return "snowandthunder";
            case 1063: case 1240: return "lightrainshowers" + dn;
            case 1243: return "rainshowers" + dn;
            case 1246: return "heavyrainshowers" + dn;
            case 1072: case 1150: case 1153: case 1168: case 1180: case 1183: case 1198: return "lightrain";
            case 1186: case 1189: return "rain";
            case 1171: case 1192: case 1195: case 1201: return "heavyrain";
            case 1069: case 1249: return "lightsleetshowers" + dn;
            case 1252: case 1261: case 1264: return "sleetshowers" + dn;
            case 1204: case 1207: case 1237: return "sleet";
            case 1066: case 1255: return "lightsnowshowers" + dn;
            case 1258: return "snowshowers" + dn;
            case 1114: case 1210: case 1213: case 1216: case 1219: return "lightsnow";
            case 1117: case 1222: case 1225: return "heavysnow";
            default: return "cloudy";                          // 1006 cloudy, 1009 overcast, and anything new
        }
    }

    /** Asks MET for the forecast (background thread). */
    public void refresh(double lat, double lon) {
        String at = where(lat, lon);
        String since;
        synchronized (this) {
            if (busy) return;
            busy = true;
            triedAt = System.currentTimeMillis();
            waitUntil = triedAt + RETRY;                      // if this fails
            since = at.equals(place) && "met".equals(source) ? lastModified : null;
        }
        try {
            String[] ll = at.split(",");
            Net.Reply r = fetcher.get("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + ll[0] + "&lon=" + ll[1], since);
            long now = System.currentTimeMillis();
            if (r.code == 304 && "met".equals(source)) {      // nothing new since the last time
                synchronized (this) {
                    expires = r.expires;
                    fetchedAt = now;
                    waitUntil = 0;
                    save();
                }
                status = "from MET Norway, checked " + Times.stamp(now);
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
                this.now = null;
                fetchedAt = now;
                expires = r.expires;
                lastModified = r.lastModified;
                place = at;
                source = "met";
                waitUntil = 0;
                version++;
                save();
            }
            // 203: MET will retire this version of their service; it still works for now
            status = "from MET Norway, " + Times.stamp(now) + (r.code == 203 ? " (MET says this version of their service is old)" : "");
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

    /** For the page: {at: when fetched, source, hours: [...], now?}, or null before the first forecast. */
    public synchronized JSONObject forPage() {
        if (hours.length() == 0) return null;
        try {
            JSONObject o = new JSONObject().put("at", fetchedAt).put("source", source.startsWith("met") ? "met" : source).put("hours", hours);
            if (now != null) o.put("now", now);
            return o;
        } catch (JSONException e) {
            return null;
        }
    }

    private void load() {
        if (file == null || !file.exists()) return;
        try {
            JSONObject o = new JSONObject(Disk.readText(file));
            JSONArray h = o.optJSONArray("hours");
            if (h != null) hours = h;
            fetchedAt = o.optLong("at", 0);
            expires = o.optLong("expires", 0);
            lastModified = o.has("lastModified") ? o.optString("lastModified", null) : null;
            place = o.optString("place", "");
            source = o.optString("source", "met");
            now = o.optJSONArray("now");
            if (fetchedAt > 0) status = (source.equals("weatherapi") ? "from WeatherAPI.com, " : "from MET Norway, ") + Times.stamp(fetchedAt);
        } catch (IOException | JSONException e) {
            // start again
        }
    }

    private void save() {
        if (file == null) return;
        try {
            JSONObject o = new JSONObject().put("hours", hours).put("at", fetchedAt).put("expires", expires).put("place", place).put("source", source);
            if (lastModified != null) o.put("lastModified", lastModified);
            if (now != null) o.put("now", now);
            Disk.write(file, o.toString());
        } catch (IOException | JSONException e) {
            // kept in memory
        }
    }
}
