package com.twilightcafe.tvplayer;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * settings.json from the GitHub repository. Every TV reads it when the app starts
 * and every 30 minutes, and keeps the last good copy, so it also works offline.
 */
final class AppSettings {

    // Used by the app itself; never handed to the page
    private static final String[] APP_ONLY = { "controlPin", "tvVolume", "levelSound", "restartAt", "updates" };

    private final SharedPreferences prefs;
    private volatile JSONObject json;
    private volatile int version;
    volatile String status;                        // for test mode and the phone page

    AppSettings(Context c) {
        prefs = c.getSharedPreferences("settings", Context.MODE_PRIVATE);
        version = prefs.getInt("version", 1);
        JSONObject saved = parse(prefs.getString("json", "{}"));
        json = saved != null ? saved : new JSONObject();
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
        boolean changed = !fresh.toString().equals(json.toString());
        if (changed) {
            json = fresh;
            version++;
        }
        prefs.edit().putString("json", fresh.toString()).putInt("version", version).putLong("time", now).apply();
        status = body == null ? "no settings.json in the repository, so the built-in settings are used"
                              : "settings.json from GitHub, " + when(now);
        return changed;
    }

    int version() {
        return version;
    }

    /** The settings for the page, without the app's own. */
    String forPage() {
        try {
            JSONObject copy = new JSONObject(json.toString());
            for (String k : APP_ONLY) copy.remove(k);
            return copy.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    String text(String key, String fallback) {
        JSONObject j = json;
        if (!j.has(key) || j.isNull(key)) return fallback;
        return j.optString(key, fallback).trim();
    }

    int number(String key, int fallback) {
        return json.optInt(key, fallback);
    }

    boolean flag(String key, boolean fallback) {
        return json.optBoolean(key, fallback);
    }
}
