package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.BuildConfig;
import com.twilightcafe.tvplayer.app.TvApp;
import com.twilightcafe.tvplayer.store.LookStore;
import com.twilightcafe.tvplayer.store.MenuStore;
import com.twilightcafe.tvplayer.store.PictureStore;
import com.twilightcafe.tvplayer.util.Net;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * What the app's web server asks the app (ControlServer.Tv), for the phone page, the customers' menu and the
 * TV page: each request handed to the part that does it. The server runs these on its own threads.
 */
public final class PhoneApi implements ControlServer.Tv {

    private final TvApp app;
    private volatile String models;                     // the models folder on GitHub, as read last (kept a minute)
    private volatile long modelsAt;

    public PhoneApi(TvApp app) {
        this.app = app;
    }

    // The project on GitHub (this build's, else the café's own), and where its 3D models are, for anyone to fetch
    private static String repo() {
        return BuildConfig.REPO == null || BuildConfig.REPO.isEmpty() ? "helinomerrania/twilight-tv-android" : BuildConfig.REPO;
    }

    private static String modelBase() {
        return "https://raw.githubusercontent.com/" + repo() + "/main/models/";
    }

    @Override
    public String pin() {
        return app.pin.get();
    }

    @Override
    public byte[] page() {
        return app.assets.phonePage();
    }

    @Override
    public String status() {
        return app.status.json();
    }

    @Override
    public boolean command(String what) {
        return app.commands.run(what);
    }

    @Override
    public String settings() {
        return app.phoneSettings.json();
    }

    @Override
    public String saveSettings(String body, boolean all) {
        return app.phoneSettings.save(body, all);
    }

    @Override
    public byte[] tvPage() {
        return app.link.tvPage();
    }

    @Override
    public String tvSync(String key, String body) {
        return app.link.checkIn(key, body);
    }

    @Override
    public String songs() {
        try {
            List<String> ids = app.link.songs();
            return new JSONObject().put("songs", app.feeds.titles.list(ids)).put("names", app.feeds.titles.describe(ids)).toString();
        } catch (JSONException e) {
            return null;
        }
    }

    /* ---------- the café's pictures, between songs ---------- */

    @Override
    public String pictures() {
        return "{\"pictures\":" + app.pictures.listJson() + ",\"max\":" + PictureStore.MAX + "}";
    }

    @Override
    public String addPicture(String body) {
        try {
            JSONObject o = new JSONObject(body);
            String id = app.pictures.add(o.optString("full", ""), o.optString("small", ""));
            return new JSONObject().put("ok", true).put("id", id).toString();
        } catch (IllegalArgumentException e) {
            return "{\"ok\":false,\"message\":" + JSONObject.quote(e.getMessage()) + "}";
        } catch (JSONException e) {
            return "{\"ok\":false,\"message\":\"That picture didn't arrive whole. Try again.\"}";
        }
    }

    @Override
    public boolean deletePicture(String id) {
        return app.pictures.remove(id);
    }

    @Override
    public byte[] picture(String id, boolean small) {
        return app.pictures.read(id, small);
    }

    @Override
    public byte[] asset(String name) {
        byte[] b = app.assets.read(name);
        return b.length == 0 ? null : b;
    }

    /* ---------- the café screen's pictures ---------- */

    @Override
    public byte[] look(String name) {
        return lookPicture(name, false);
    }

    @Override
    public String looks() {
        try {
            JSONArray list = new JSONArray();
            for (String n : LookStore.NAMES) list.put(new JSONObject().put("name", n).put("at", app.looks.at(n)));
            return new JSONObject().put("looks", list).toString();
        } catch (JSONException e) {
            return null;
        }
    }

    @Override
    public String setLook(String name, String body, boolean all) {
        try {
            JSONObject o = new JSONObject(body);
            long at = app.looks.set(name, o.optString("full", ""), o.optString("small", ""));
            return new JSONObject().put("ok", true).put("at", at).put("tv", app.network.name())
                    .put("others", all ? lookOnOthers("name=" + name, body) : new JSONArray()).toString();
        } catch (IllegalArgumentException e) {
            return "{\"ok\":false,\"message\":" + JSONObject.quote(e.getMessage()) + "}";
        } catch (JSONException e) {
            return "{\"ok\":false,\"message\":\"That picture didn't arrive whole. Try again.\"}";
        }
    }

    @Override
    public String resetLook(String name, boolean all) {
        if (!LookStore.valid(name)) return "{\"ok\":false,\"message\":\"There's no such picture on the café screen.\"}";
        app.looks.reset(name);
        try {
            return new JSONObject().put("ok", true).put("at", 0).put("tv", app.network.name())
                    .put("others", all ? lookOnOthers("name=" + name + "&reset=1", "") : new JSONArray()).toString();
        } catch (JSONException e) {
            return "{\"ok\":true}";
        }
    }

    @Override
    public byte[] lookForPhone(String name, boolean small) {
        return lookPicture(name, small);
    }

    // One of the café screen's pictures: the café's own, else the one built into the app (and its small copy)
    private byte[] lookPicture(String name, boolean small) {
        if (!LookStore.valid(name)) return null;
        byte[] b = app.looks.read(name, small);
        if (b != null) return b;
        if (small) {
            b = app.assets.read("looks/" + name + ".small.jpg");
            if (b.length > 0) return b;
        }
        b = app.assets.read("looks/" + name + ".jpg");
        return b.length == 0 ? null : b;
    }

    // The same café screen picture on the other TVs, through their own phone pages
    private JSONArray lookOnOthers(String query, String payload) throws JSONException {
        return app.network.sendToOthers("api/looks?all=0&" + query, app.pin.get(), payload);
    }

    /* ---------- the café's menu ---------- */

    @Override
    public byte[] menuPage() {
        byte[] b = app.assets.menuPage();
        return b.length == 0 ? null : b;
    }

    @Override
    public String menuForCustomers() {
        String menu = app.menus.forCustomers(app.core.settings.text("brandName", ""), app.core.settings.label("menu", ""),
                app.core.settings.text("numerals", "auto"));
        if (menu == null) return null;                  // not ready
        try {                                            // where the items' 3D models are (on GitHub: https, for AR)
            return new JSONObject(menu).put("models", modelBase()).toString();
        } catch (JSONException e) {
            return menu;
        }
    }

    @Override
    public String menuNow() {
        String page = app.link.pageNow();
        try {
            JSONArray tint = page == null ? null : new JSONObject(page).optJSONArray("tint");
            return tint == null ? "{}" : new JSONObject().put("tint", tint).toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    @Override
    public String menuModels() {
        long now = System.currentTimeMillis();
        String kept = models;
        if (kept != null && now - modelsAt < 60000L) return kept;
        try {
            String listing = Net.get("https://api.github.com/repos/" + repo() + "/contents/models?ref=main", 10000);
            kept = new JSONObject(MenuStore.modelsFrom(listing)).put("base", modelBase()).toString();
            models = kept;
            modelsAt = now;
            return kept;
        } catch (Exception e) {
            return null;                                 // GitHub out of reach (or busy): the phone says so
        }
    }

    @Override
    public byte[] menuPicture(String id, boolean small) {
        return app.menus.picture(id, small);
    }

    @Override
    public String menu() {
        return withAddress(app.menus.full());
    }

    @Override
    public String saveMenu(String body) {
        String r = app.menus.save(body);
        try {
            JSONObject o = new JSONObject(r);
            if (o.optJSONObject("menu") != null) o.put("menu", new JSONObject(withAddress(o.getJSONObject("menu").toString())));
            return o.toString();
        } catch (JSONException e) {
            return r;
        }
    }

    @Override
    public String addMenuPicture(String body) {
        try {
            JSONObject o = new JSONObject(body);
            String id = app.menus.addPicture(o.optString("full", ""), o.optString("small", ""));
            return new JSONObject().put("ok", true).put("id", id).toString();
        } catch (IllegalArgumentException e) {
            return "{\"ok\":false,\"message\":" + JSONObject.quote(e.getMessage()) + "}";
        } catch (JSONException e) {
            return "{\"ok\":false,\"message\":\"That picture didn't arrive whole. Try again.\"}";
        }
    }

    // The menu for the phone, with where customers find it (and the link that the TV shows instead, if any)
    private String withAddress(String menu) {
        try {
            return new JSONObject(menu).put("address", app.network.menuAddress()).put("link", app.core.settings.text("menuUrl", ""))
                    .put("shown", app.menus.shownItems()).toString();
        } catch (JSONException e) {
            return menu;
        }
    }
}
