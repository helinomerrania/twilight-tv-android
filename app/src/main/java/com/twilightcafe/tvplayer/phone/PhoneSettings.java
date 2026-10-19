package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.app.TvApp;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Iterator;

/**
 * The phone page's Settings screen (and its Screen tab, which is settings too): what it shows (the built-in
 * values, settings.json's, and this TV's own), and saving this TV's own, on the other TVs too if asked.
 */
public final class PhoneSettings {

    private final TvApp app;

    public PhoneSettings(TvApp app) {
        this.app = app;
    }

    /** For the Settings screen: built-in values, settings.json, and this TV's own (GET /api/settings) */
    public String json() {
        try {
            // the page's built-in values arrive with its first check-in; the app's own are here
            JSONObject defaults = new JSONObject(app.core.settings.pageDefaults());
            defaults.put("tvName", "");
            defaults.put("tvVolume", 0);
            defaults.put("controlPin", "");
            defaults.put("levelSound", true);
            defaults.put("restartAt", "05:00");
            defaults.put("updates", true);
            defaults.put("weatherKey", "");
            defaults.put("videoFormat", "h264");
            defaults.put("screenSize", "1080");
            defaults.put("screenRate", "box");
            defaults.put("engineNumbers", false);
            defaults.put("pricesUrl", "");
            defaults.put("lockApps", true);
            defaults.put("otherApp", "My TV Plus");
            JSONObject o = new JSONObject();
            o.put("tv", app.network.name());
            o.put("autoName", TvNetwork.autoName(app.network.ip()));
            o.put("defaults", defaults);
            o.put("file", app.core.settings.fromFile());
            o.put("local", app.core.settings.local());
            JSONArray others = new JSONArray();
            for (String[] t : app.network.others()) others.put(t[0]);
            o.put("others", others);
            return o.toString();
        } catch (Exception e) {
            return "{\"error\":" + JSONObject.quote(e.toString()) + "}";
        }
    }

    /**
     * This TV's own settings from the phone (POST /api/settings, {"local": {...}}); with all, the same on the
     * other TVs too (each keeps its own name). Null when the body is wrong.
     */
    public String save(String body, boolean all) {
        JSONObject clean = new JSONObject();
        try {
            JSONObject mine = new JSONObject(body).optJSONObject("local");
            if (mine == null) return null;
            for (Iterator<String> it = mine.keys(); it.hasNext(); ) {
                String k = it.next();
                if (k.matches("[A-Za-z][A-Za-z0-9]{0,40}")) clean.put(k, mine.get(k));
            }
        } catch (Exception e) {
            return null;
        }
        String oldPin = app.pin.get();
        app.core.settings.setLocal(clean);
        app.core.runOnMain(app::settingsChanged);
        try {
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("pin", app.pin.get());              // it may have just changed
            result.put("tv", app.network.name());
            JSONArray done = new JSONArray();
            if (all) {
                JSONObject forOthers = new JSONObject(clean.toString());
                forOthers.remove("tvName");                // each TV keeps its own name
                String payload = new JSONObject().put("local", forOthers).toString();
                done = app.network.sendToOthers("api/settings?all=0", oldPin, payload);
            }
            result.put("others", done);
            if (app.engine.engineChanged()) {              // the engine's start-up settings: the app starts again (after this answer)
                result.put("restarting", true);
                app.core.main.postDelayed(() -> {
                    if (app.engine.engineChanged()) app.player.restartApp("Restarted to use the new video settings.");
                }, 2000);
            }
            return result.toString();
        } catch (Exception e) {
            return "{\"ok\":true}";
        }
    }
}
