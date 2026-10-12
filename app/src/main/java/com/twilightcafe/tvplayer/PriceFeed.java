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
import java.util.TimeZone;

/**
 * Gold and currency prices for the TV's info panel, from tirezh.com's own price service
 * (/api/economy, the café owner's site). Asked every 5 minutes while the app is on screen;
 * the last good answer is kept in a file, so the panel keeps its prices through an
 * internet cut. Only what the panel can show is kept: the currencies (buy, sell, up or
 * down), the Kurdistan gold prices by karat, and the world prices of gold, silver and bitcoin.
 * Plain Java (and org.json), so it can be tested on a computer.
 */
final class PriceFeed {

    /** Fetches one address (the app uses the internet; tests use a stand-in). */
    interface Fetcher {
        Net.Reply get(String url) throws IOException;
    }

    static final String URL = "https://tirezh.com/api/economy";
    private static final long GAP = 5 * 60000L;            // a new price every 5 minutes is plenty for a TV
    private static final long RETRY = 2 * 60000L;          // after a failure

    private final File file;
    private final Fetcher fetcher;
    private JSONObject prices;                            // the compact form below, or null
    private long fetchedAt, triedAt, waitUntil;
    private boolean busy;
    private volatile int version = 1;
    volatile String status = "not asked yet";

    PriceFeed(File file, Fetcher fetcher) {
        this.file = file;
        this.fetcher = fetcher;
        load();
    }

    int version() {
        return version;
    }

    synchronized boolean due(long now) {
        return !busy && now >= waitUntil && now - triedAt >= RETRY && now - fetchedAt >= GAP;
    }

    /** Asks tirezh.com for the prices (background thread). */
    void refresh() {
        synchronized (this) {
            if (busy) return;
            busy = true;
            triedAt = System.currentTimeMillis();
        }
        try {
            Net.Reply r = fetcher.get(URL);
            long now = System.currentTimeMillis();
            if (r.code == 429) {
                synchronized (this) {
                    waitUntil = now + 15 * 60000L;
                }
                status = "tirezh.com asked to slow down; asking again in 15 minutes";
                return;
            }
            if (r.code != 200 || r.body == null) {
                status = "tirezh.com didn't send prices (" + r.code + ")";
                return;
            }
            JSONObject p = parse(r.body);
            if (p == null) {
                status = "tirezh.com's answer had no prices in it";
                return;
            }
            synchronized (this) {
                goldTrends(p, prices);
                prices = p;
                fetchedAt = now;
                version++;
                save();
            }
            status = "from tirezh.com, " + clock(now);
        } catch (Exception e) {                           // no internet, or an answer that can't be read
            status = "couldn't reach tirezh.com (" + e.getClass().getSimpleName() + ")";
        } finally {
            synchronized (this) {
                busy = false;
            }
        }
    }

    /**
     * tirezh.com's answer -> {at: when the prices were set (ms),
     *   currencies: [[code, Kurdish name, buy, sell, trend], ...]  (trend: 1 up, -1 down, 0 same),
     *   gold: [[karat, price (IQD per mithqal), Kurdish name, buy-back price or 0, trend], ...],
     *   ounce: [world gold $ per ounce, trend], silver: [...], btc: [...]}, or null if there are none.
     */
    static JSONObject parse(String body) throws JSONException {
        JSONObject root = new JSONObject(body);
        JSONObject d = root.optJSONObject("data");
        if (!root.optBoolean("success", false) || d == null) return null;
        JSONObject out = new JSONObject();
        out.put("at", time(d.optString("updatedAt", "")));
        JSONArray currencies = new JSONArray();
        JSONArray cs = d.optJSONArray("currencies");
        for (int i = 0; cs != null && i < cs.length(); i++) {
            JSONObject c = cs.optJSONObject(i);
            if (c == null || !c.has("sell")) continue;
            String code = c.optString("code", "").toLowerCase(Locale.US);
            if (!code.matches("[a-z]{2,3}")) continue;
            currencies.put(new JSONArray().put(code).put(c.optString("nameKu", "")).put(c.optDouble("buy", 0))
                    .put(c.optDouble("sell", 0)).put(trend(c.optString("status", ""))));
        }
        JSONObject kp = d.optJSONObject("kurdistanPrices");
        JSONArray gold = new JSONArray();
        JSONArray gs = d.optJSONArray("gold");
        for (int i = 0; gs != null && i < gs.length(); i++) {
            JSONObject g = gs.optJSONObject(i);
            if (g == null || !g.has("priceIQD")) continue;
            int karat = g.optInt("karat", 0);
            double buy = kp == null ? 0 : kp.optDouble("buy" + karat + "K", 0);
            gold.put(new JSONArray().put(karat).put(g.optDouble("priceIQD", 0)).put(g.optString("label", "")).put(buy).put(0));
        }
        if (currencies.length() == 0 && gold.length() == 0) return null;
        out.put("currencies", currencies);
        out.put("gold", gold);
        JSONArray ms = d.optJSONArray("metals");
        for (int i = 0; ms != null && i < ms.length(); i++) {
            JSONObject m = ms.optJSONObject(i);
            if (m == null) continue;
            String id = m.optString("id", "");
            if (id.equals("gold")) out.put("ounce", new JSONArray().put(m.optDouble("priceOunce", 0)).put(trend(m.optString("status", ""))));
            if (id.equals("silver")) out.put("silver", new JSONArray().put(m.optDouble("priceOunce", 0)).put(trend(m.optString("status", ""))));
        }
        JSONArray cr = d.optJSONArray("cryptos");
        for (int i = 0; cr != null && i < cr.length(); i++) {
            JSONObject c = cr.optJSONObject(i);
            if (c != null && c.optString("id", "").equals("btc")) {
                out.put("btc", new JSONArray().put(c.optDouble("price", 0)).put(trend(c.optString("status", ""))));
            }
        }
        return out;
    }

    /**
     * tirezh.com says whether a currency went up or down, but not gold: that is worked out here, from
     * the price before. An unchanged price keeps the last direction (as on a market board).
     */
    static void goldTrends(JSONObject now, JSONObject before) throws JSONException {
        JSONArray g = now.optJSONArray("gold"), old = before == null ? null : before.optJSONArray("gold");
        for (int i = 0; g != null && i < g.length(); i++) {
            JSONArray r = g.getJSONArray(i);
            for (int j = 0; old != null && j < old.length(); j++) {
                JSONArray o = old.optJSONArray(j);
                if (o == null || o.optInt(0, -1) != r.optInt(0, -2)) continue;
                double was = o.optDouble(1, 0), is = r.optDouble(1, 0);
                r.put(4, is > was ? 1 : is < was ? -1 : o.optInt(4, 0));
            }
        }
    }

    private static int trend(String status) {
        return status.equals("increase") ? 1 : status.equals("decrease") ? -1 : 0;
    }

    // "2026-10-12T05:37:01.655Z" -> ms (0 if it can't be read)
    private static long time(String iso) {
        for (String f : new String[] { "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'" }) {
            SimpleDateFormat p = new SimpleDateFormat(f, Locale.US);
            p.setTimeZone(TimeZone.getTimeZone("UTC"));
            try {
                return p.parse(iso).getTime();
            } catch (ParseException e) {
                // the other way
            }
        }
        return 0;
    }

    /** For the page: the prices, and when the app got them; null before the first answer. */
    synchronized JSONObject forPage() {
        if (prices == null) return null;
        try {
            return new JSONObject(prices.toString()).put("fetched", fetchedAt);
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
            prices = o.optJSONObject("prices");
            fetchedAt = o.optLong("fetched", 0);
            if (prices != null && fetchedAt > 0) status = "from tirezh.com, " + clock(fetchedAt);
        } catch (IOException | JSONException e) {
            // start again
        }
    }

    private void save() {
        if (file == null || prices == null) return;
        try {
            TitleBook.writeFile(file, new JSONObject().put("prices", prices).put("fetched", fetchedAt).toString());
        } catch (IOException | JSONException e) {
            // kept in memory
        }
    }
}
