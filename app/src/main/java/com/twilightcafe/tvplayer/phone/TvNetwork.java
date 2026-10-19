package com.twilightcafe.tvplayer.phone;

import android.content.Context;

import com.twilightcafe.tvplayer.settings.AppSettings;
import com.twilightcafe.tvplayer.store.MenuStore;
import com.twilightcafe.tvplayer.util.Net;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;

/**
 * This TV on the café network: its address (which can arrive late, after power-on, or change), its name
 * (tvName from the phone, else "TV 23" from the address), the other TVs (TvFinder), and the addresses phones use.
 */
public final class TvNetwork {

    private final Context context;
    private final AppSettings settings;
    private final MenuStore menus;
    private final ControlServer server, menuServer;
    private volatile String ip = "", name = "TV";
    private volatile int version = 0;                    // the address changed (the menu code shows it)
    private volatile TvFinder finder;

    public TvNetwork(Context context, AppSettings settings, MenuStore menus, ControlServer server, ControlServer menuServer) {
        this.context = context;
        this.settings = settings;
        this.menus = menus;
        this.server = server;
        this.menuServer = menuServer;
    }

    /** Looks again (force: the name may have changed too) */
    public void refresh(boolean force) {
        String now = Net.localIp();
        String own = settings.text("tvName", "");
        String name = own.isEmpty() ? autoName(now) : own;
        if (!force && now.equals(ip) && name.equals(this.name) && finder != null) return;
        if (!now.equals(ip)) version++;
        ip = now;
        this.name = name;
        if (finder != null) finder.stop();
        finder = new TvFinder(context, this.name);
        if (!ip.isEmpty()) finder.start(server.port());
    }

    /** "TV 23" from 192.168.1.23 */
    public static String autoName(String address) {
        return address.isEmpty() ? "TV" : "TV " + address.substring(address.lastIndexOf('.') + 1);
    }

    /** This TV's address on the café network, or "" */
    public String ip() {
        return ip;
    }

    public String name() {
        return name;
    }

    public int version() {
        return version;
    }

    /** The other TVs: {name, the address of their phone page} */
    public List<String[]> others() {
        TvFinder f = finder;
        return f == null ? new ArrayList<String[]>() : f.others();
    }

    /** The phone page's port (0 before the server starts) */
    public int phonePort() {
        return server.port();
    }

    /**
     * The menu's address for customers' phones, for the TV's menu code: "" until customers would see something
     * in it. Its own server and port, with nothing else on it: the phone page's address stays with the staff.
     */
    public String menuAddress() {
        int port = menuServer.port();
        return menus.shownItems() > 0 && !ip.isEmpty() && port > 0 ? "http://" + ip + ":" + port + "/menu/" : "";
    }

    /** The same on every other TV, through their own phone pages: [{name, result}] */
    public JSONArray sendToOthers(String what, String pin, String payload) throws JSONException {
        JSONArray done = new JSONArray();
        for (String[] t : others()) {
            done.put(new JSONObject().put("name", t[0]).put("result", send(t[1], what, pin, payload)));
        }
        return done;
    }

    // Saves the same on another TV (settings, a café screen picture), through its own phone page
    static String send(String base, String what, String pin, String payload) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + what + "&pin=" + URLEncoder.encode(pin, "UTF-8")).openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(4000);
            c.setReadTimeout(20000);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] b = payload.getBytes("UTF-8");
            c.setFixedLengthStreamingMode(b.length);
            OutputStream o = c.getOutputStream();
            o.write(b);
            o.close();
            int code = c.getResponseCode();
            if (code == 200) return "saved";
            if (code == 401) return "has a different PIN, so it wasn't changed";
            if (code == 429) return "is locked for a few minutes (too many wrong PINs)";
            return "couldn't save (" + code + ")";
        } catch (Exception e) {
            return "couldn't be reached";
        } finally {
            if (c != null) c.disconnect();
        }
    }

    public void stop() {
        if (finder != null) finder.stop();
    }
}
