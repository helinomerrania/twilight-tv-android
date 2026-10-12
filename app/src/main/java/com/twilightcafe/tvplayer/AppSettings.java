package com.twilightcafe.tvplayer;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;

/**
 * The TV's settings, from three places (later ones win):
 *   1. the page's built-in values (assets/index.html),
 *   2. settings.json in the GitHub repository (every TV, read at start and every 30 minutes),
 *   3. this TV's own settings, saved from the phone page's Settings screen.
 * The last good copy of settings.json is kept, so it also works offline.
 */
final class AppSettings {

    // Used by the app itself; never handed to the page
    private static final String[] APP_ONLY = { "controlPin", "tvVolume", "levelSound", "restartAt", "updates", "tvName",
                                                "weatherKey", "videoFormat", "screenSize", "screenRate", "engineNumbers" };

    private final SharedPreferences prefs;
    private volatile JSONObject file;              // settings.json
    private volatile JSONObject local;             // this TV's own
    private volatile JSONObject effective;         // both together
    private volatile JSONObject builtIn;           // the page's own values, as it last reported them
    private volatile int version;
    volatile String status;                        // for test mode and the phone page

    AppSettings(Context c) {
        prefs = c.getSharedPreferences("settings", Context.MODE_PRIVATE);
        version = prefs.getInt("version", 1);
        file = orEmpty(parse(prefs.getString("json", "{}")));
        local = orEmpty(parse(prefs.getString("local", "{}")));
        effective = merge(file, local);
        builtIn = orEmpty(parse(prefs.getString("pageDefaults", "{}")));
        long t = prefs.getLong("time", 0);
        status = t > 0 ? "settings.json from GitHub, " + when(t) : "built-in settings (settings.json not read yet)";
    }

    private static JSONObject parse(String s) {
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONObject orEmpty(JSONObject j) {
        return j != null ? j : new JSONObject();
    }

    private static JSONObject copy(JSONObject j) {
        return orEmpty(parse(j.toString()));
    }

    private static JSONObject merge(JSONObject base, JSONObject over) {
        JSONObject out = copy(base);
        try {
            for (Iterator<String> it = over.keys(); it.hasNext(); ) {
                String k = it.next();
                out.put(k, over.get(k));
            }
        } catch (Exception e) {
            // keep what merged
        }
        return out;
    }

    private static String when(long t) {
        return new SimpleDateFormat("d MMM HH:mm", Locale.US).format(new Date(t));
    }

    /** Reads settings.json from GitHub (background thread). True when it changed. */
    boolean refresh(String repo) {
        if (repo == null || repo.isEmpty()) {
            status = "built-in settings (this build doesn't know its GitHub repository)";
            return false;
        }
        String body;
        try {
            body = Net.get("https://raw.githubusercontent.com/" + repo + "/main/settings.json?t=" + System.currentTimeMillis(), 15000);
        } catch (Exception e) {
            status = "couldn't reach GitHub, so the saved settings are used (" + e.getClass().getSimpleName() + ")";
            return false;
        }
        long now = System.currentTimeMillis();
        JSONObject fresh = body == null ? new JSONObject() : parse(body);   // no file: the built-in settings
        if (fresh == null) {
            status = "settings.json has a mistake in it, so the last good settings are used";
            return false;
        }
        boolean changed;
        synchronized (this) {
            changed = !fresh.toString().equals(file.toString());
            if (changed) {
                file = fresh;
                effective = merge(file, local);
                version++;
            }
            prefs.edit().putString("json", fresh.toString()).putInt("version", version).putLong("time", now).apply();
        }
        status = body == null ? "no settings.json in the repository, so the built-in settings are used"
                              : "settings.json from GitHub, " + when(now);
        return changed;
    }

    /** Replaces this TV's own settings (from the phone page). */
    synchronized void setLocal(JSONObject mine) {
        local = copy(mine);
        effective = merge(file, local);
        version++;
        prefs.edit().putString("local", local.toString()).putInt("version", version).apply();
    }

    int version() {
        return version;
    }

    JSONObject fromFile() {
        JSONObject out = copy(file);
        for (Iterator<String> it = file.keys(); it.hasNext(); ) {
            String k = it.next();
            if (k.startsWith("_")) out.remove(k);
        }
        return out;
    }

    JSONObject local() {
        return copy(local);
    }

    /** The settings for the page, without the app's own. */
    String forPage() {
        JSONObject out = copy(effective);
        for (String k : APP_ONLY) out.remove(k);
        return out.toString();
    }

    /** The page's built-in values, as last reported by the page (for the phone page). */
    String pageDefaults() {
        return prefs.getString("pageDefaults", "{}");
    }

    void savePageDefaults(String json) {
        JSONObject j = parse(json);
        if (j == null) return;
        builtIn = j;
        prefs.edit().putString("pageDefaults", json).apply();
    }

    // A setting from settings.json or this TV, else the page's built-in value
    private JSONObject holder(String key) {
        JSONObject j = effective;
        if (j.has(key) && !j.isNull(key)) return j;
        return builtIn;
    }

    String text(String key, String fallback) {
        JSONObject j = holder(key);
        if (!j.has(key) || j.isNull(key)) return fallback;
        return j.optString(key, fallback).trim();
    }

    int number(String key, int fallback) {
        return holder(key).optInt(key, fallback);
    }

    double decimal(String key, double fallback) {
        return holder(key).optDouble(key, fallback);
    }

    boolean flag(String key, boolean fallback) {
        return holder(key).optBoolean(key, fallback);
    }

    /** A setting that is a list (e.g. the prices to show), or null if there is none. */
    org.json.JSONArray list(String key) {
        return holder(key).optJSONArray(key);
    }
}
