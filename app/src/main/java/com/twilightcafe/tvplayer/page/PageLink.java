package com.twilightcafe.tvplayer.page;

import com.twilightcafe.tvplayer.app.AppAssets;
import com.twilightcafe.tvplayer.app.Core;
import com.twilightcafe.tvplayer.box.BoxReport;
import com.twilightcafe.tvplayer.box.TvVolume;
import com.twilightcafe.tvplayer.feeds.Feeds;
import com.twilightcafe.tvplayer.feeds.TitleBook;
import com.twilightcafe.tvplayer.phone.TvNetwork;
import com.twilightcafe.tvplayer.settings.AppSettings;
import com.twilightcafe.tvplayer.store.LookStore;
import com.twilightcafe.tvplayer.store.MenuStore;
import com.twilightcafe.tvplayer.store.PictureStore;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.math.BigInteger;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * The link with the TV page. Firefox's engine has no way for the app to hand the page an object, so the app's
 * small web server serves the page at http://localhost to this box only, with assets/bridge.js put in at the
 * top, and a key only this page knows. The page checks in every second: what it's doing and that it's alive;
 * the app answers with new settings, new extras (song names, the weather, prices, prayer times, the café's
 * pictures, its menu) and the phone's commands.
 */
public final class PageLink {

    private final Core core;
    private final AppAssets assets;
    private final AppSettings settings;
    private final Feeds feeds;
    private final PictureStore pictures;
    private final LookStore looks;
    private final MenuStore menus;
    private final TvNetwork network;
    private final BoxReport box;
    private final TvVolume volume;
    private final PageEngine engine;

    // Only the page this app opened knows the key
    private final String key = new BigInteger(80, new SecureRandom()).toString(36);
    private volatile String pageStatus;                  // what the page last said it's doing
    private volatile String pageSong = "";               // the song it's playing (a new one: the box's volume back to tvVolume)
    private volatile long pageStatusAt;
    private volatile long lastAlive = 0;                 // the page's last "I'm alive"
    private final List<Object[]> commands = new ArrayList<>();   // {time, command} for the page's next check-in
    private volatile List<String> songs = Collections.emptyList();   // the page's songs (its playlist first)
    private volatile int songsVersion = 0;

    public PageLink(Core core, AppAssets assets, Feeds feeds, PictureStore pictures, LookStore looks, MenuStore menus,
                    TvNetwork network, BoxReport box, TvVolume volume, PageEngine engine) {
        this.core = core;
        this.assets = assets;
        this.settings = core.settings;
        this.feeds = feeds;
        this.pictures = pictures;
        this.looks = looks;
        this.menus = menus;
        this.network = network;
        this.box = box;
        this.volume = volume;
        this.engine = engine;
    }

    /** The page's address on the app's own server, with its key; setup: quality setup, debug: test mode's details */
    String address(int port, boolean setup, boolean debug) {
        return "http://localhost:" + port + "/tv/index.html?k=" + key + (setup ? "&setup=quality" : debug ? "&debug=1" : "");
    }

    /** The page was just opened: it has two minutes to say it's alive */
    void opened(long now) {
        lastAlive = now;
    }

    long lastAlive() {
        return lastAlive;
    }

    /** The page as Firefox's engine gets it: with assets/bridge.js put in at the top, and what it needs to start */
    public byte[] tvPage() {
        try {
            JSONObject boot = new JSONObject();
            boot.put("k", key);
            boot.put("v", settings.version());
            boot.put("s", settings.forPage());              // settings never include the PIN
            boot.put("xv", extrasVersion());
            boot.put("x", extras());                        // song names, weather, pictures
            return TvPage.withBridge(assets.tvPage(), assets.bridge(), boot.toString());
        } catch (JSONException e) {
            return null;
        }
    }

    /**
     * The page's check-in, every second: what it's doing and that it's alive. The answer has new settings
     * (when they changed), new extras, and the phone's commands. Null when the key is wrong.
     */
    public String checkIn(String key, String body) {
        if (key == null || !key.equals(this.key)) return null;
        try {
            JSONObject in = new JSONObject(body == null || body.isEmpty() ? "{}" : body);
            long now = System.currentTimeMillis();
            if (in.optBoolean("alive")) lastAlive = now;
            JSONObject st = in.optJSONObject("status");
            if (st != null) {
                pageStatus = st.toString();
                pageStatusAt = now;
                JSONObject song = st.optJSONObject("song");
                String id = song == null ? "" : song.optString("id", "");
                if (!id.isEmpty() && !id.equals(pageSong)) {
                    pageSong = id;                          // every new song starts at the box volume from the settings,
                    core.main.post(volume::apply);          // whatever the remote did to the last one
                }
            }
            JSONObject info = in.optJSONObject("info");
            if (info != null && info.optJSONObject("defaults") != null) settings.savePageDefaults(info.getJSONObject("defaults").toString());
            JSONArray ids = in.optJSONArray("ids");
            if (ids != null) {                              // the page's songs changed (a new playlist, a song from a link)
                songs = Collections.unmodifiableList(TitleBook.ids(ids));
                songsVersion++;
                feeds.titles.want(songs);
            }
            JSONObject out = new JSONObject();
            int v = settings.version();
            out.put("v", v);
            if (in.optInt("v", -1) != v) out.put("s", settings.forPage());
            int xv = extrasVersion();
            if (in.optInt("xv", -1) != xv) {
                out.put("xv", xv);
                out.put("x", extras());
            }
            JSONArray cmds = new JSONArray();
            synchronized (commands) {
                for (Object[] c : commands) {
                    if (now - (Long) c[0] < 15000L) cmds.put(c[1]);     // older ones were meant for an earlier moment
                }
                commands.clear();
            }
            out.put("cmds", cmds);
            return out.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    // Song names, weather and pictures change now and then; the page gets them again when they do
    private int extrasVersion() {
        return feeds.version() + pictures.version() + looks.version() + menus.version() + songsVersion + box.version() + network.version();
    }

    private String extras() {
        try {
            JSONObject x = new JSONObject();
            feeds.putForPage(x, songs);
            JSONArray pics = new JSONArray();
            for (String id : pictures.ids()) pics.put(id);
            x.put("pictures", pics);
            JSONObject own = new JSONObject();                 // the café screen's pictures the café put in, and when
            for (Map.Entry<String, Long> e : looks.stamps().entrySet()) own.put(e.getKey(), e.getValue());
            x.put("looks", own);
            x.put("menu", network.menuAddress());           // the café's own menu, for the menu code (when there's no menuUrl)
            x.put("menuItems", new JSONArray(menus.forTv()));   // its items for the slides between songs
            if (box.json() != null) x.put("box", new JSONObject().put("softDraw", box.softDraw()));   // automatic quality: 720p then
            return x.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    /** A command for the page's next check-in (within a second); false when no page is showing */
    public boolean toPage(String command) {
        if (!core.onScreen() || !engine.hasView()) return false;
        synchronized (commands) {
            commands.add(new Object[] { System.currentTimeMillis(), command });
        }
        return true;
    }

    /** What the page last said it's doing (nothing if it hasn't checked in for 10 seconds) */
    public String pageNow() {
        return core.onScreen() && System.currentTimeMillis() - pageStatusAt < 10000L ? pageStatus : null;
    }

    /** The page's songs, its playlist first */
    public List<String> songs() {
        return songs;
    }
}
