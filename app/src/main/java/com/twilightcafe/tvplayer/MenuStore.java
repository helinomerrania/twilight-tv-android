package com.twilightcafe.tvplayer;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;

/**
 * The café's menu for customers' phones: categories (Hookah Flavors, Drink, ...), each with items and
 * with subcategories (Drink: Energy, Fresh, ...) that have items of their own. Every name and note in
 * Kurdish, Arabic and English (any of them), an item's price in dinars, and a picture for any of them.
 *
 * Made on the phone page's Menu tab: the phone sends the whole menu back with each change, and this
 * checks it, keeps it and hands it out; to customers without what's hidden. Pictures come from the
 * phone ready (a picture and a small copy), before the menu that uses them. Plain Java (and org.json),
 * so it can be tested on a computer.
 */
final class MenuStore {

    static final String[] LANGS = { "ku", "ar", "en" };
    static final int MAX_CATEGORIES = 60, MAX_SUBS = 40, MAX_ITEMS = 300, MAX_ALL = 2000;
    static final int MAX_NAME = 80, MAX_NOTE = 400;
    static final long MAX_PRICE = 999999999L;
    static final int MAX_PICTURES = 2500;
    static final int MAX_BYTES = 3 << 20;              // one picture
    static final int MAX_SMALL = 512 << 10;            // its small copy
    static final long KEEP_UNUSED = 60 * 60000L;       // a picture not in the menu (yet): kept an hour, it may be being edited

    private final File dir, pics;
    private final SecureRandom random = new SecureRandom();
    private JSONObject menu;                           // {"v": version, "categories": [...]}
    private int version = 1;

    MenuStore(File dir) {
        this.dir = dir;
        this.pics = new File(dir, "pics");
        pics.mkdirs();
        load();
        sweep(System.currentTimeMillis());
    }

    synchronized int version() {
        return version;
    }

    static boolean validId(String id) {
        return id != null && id.matches("[a-z0-9]{4,24}");
    }

    /** The whole menu, hidden things too, for the phone: {"v": ..., "categories": [...]} */
    synchronized String full() {
        return menu.toString();
    }

    /**
     * Saves the menu from the phone: {"base": the version it changed, "menu": {"categories": [...]}}.
     * JSON back: {"ok": true, "v", "menu"}; {"ok": false, "conflict": true, "message", "v", "menu"} when
     * another phone changed it in between; {"ok": false, "message"} when something in it is wrong.
     */
    synchronized String save(String body) {
        try {
            JSONObject in;
            try {
                in = new JSONObject(body == null ? "" : body);
            } catch (JSONException e) {
                return fail("The menu didn't arrive whole. Try again.");
            }
            if (in.optInt("base", -1) != version) {
                return new JSONObject().put("ok", false).put("conflict", true)
                        .put("message", "The menu was changed on another phone just now. Here it is as it is now: make your change again.")
                        .put("v", version).put("menu", menu).toString();
            }
            JSONObject m = in.optJSONObject("menu");
            if (m == null) return fail("That isn't a menu.");
            JSONObject clean;
            try {
                clean = clean(m, false);
            } catch (IllegalArgumentException e) {
                return fail(e.getMessage());
            }
            clean.put("v", version + 1);
            try {
                TitleBook.writeFile(new File(dir, "menu.json"), clean.toString().getBytes("UTF-8"));
            } catch (IOException e) {
                return fail("The TV box couldn't save it (is its storage full?).");
            }
            menu = clean;
            version++;
            sweep(System.currentTimeMillis());
            return new JSONObject().put("ok", true).put("v", version).put("menu", menu).toString();
        } catch (JSONException e) {
            return "{\"ok\":false,\"message\":\"Something went wrong on the TV box. Try again.\"}";
        }
    }

    private static String fail(String message) throws JSONException {
        return new JSONObject().put("ok", false).put("message", message).toString();
    }

    /**
     * The menu for customers: only what isn't hidden, without empty categories and subcategories, with the
     * café's name, its word for "menu" and how it writes numbers.
     */
    synchronized String forCustomers(String cafe, String word, String numerals) {
        try {
            JSONArray out = new JSONArray(), cats = menu.optJSONArray("categories");
            for (int i = 0; cats != null && i < cats.length(); i++) {
                JSONObject c = cats.getJSONObject(i);
                if (c.optBoolean("hidden")) continue;
                JSONArray items = shown(c.optJSONArray("items")), subs = new JSONArray(), ss = c.optJSONArray("subs");
                for (int j = 0; ss != null && j < ss.length(); j++) {
                    JSONObject s = ss.getJSONObject(j);
                    if (s.optBoolean("hidden")) continue;
                    JSONArray si = shown(s.optJSONArray("items"));
                    if (si.length() > 0) subs.put(open(s).put("items", si));
                }
                if (items.length() > 0 || subs.length() > 0) out.put(open(c).put("items", items).put("subs", subs));
            }
            return new JSONObject().put("v", version).put("name", cafe == null ? "" : cafe).put("word", word == null ? "" : word)
                    .put("numerals", numerals == null ? "auto" : numerals).put("categories", out).toString();
        } catch (JSONException e) {
            return "{\"v\":0,\"categories\":[]}";
        }
    }

    /**
     * The items for the TV's slides between songs: what customers see (not hidden, nor in a hidden category
     * or subcategory), with a picture, and not kept off the TV; in the menu's order, each with its category's
     * (and subcategory's) id and name, so the TV can tell which go with the weather:
     * [{"id", "name", "note", "price", "picture", "cat", "catName", "sub", "subName"}, ...]
     */
    synchronized String forTv() {
        JSONArray out = new JSONArray();
        try {
            JSONArray cats = menu.optJSONArray("categories");
            for (int i = 0; cats != null && i < cats.length(); i++) {
                JSONObject c = cats.optJSONObject(i);
                if (c == null || c.optBoolean("hidden")) continue;
                tvItems(c.optJSONArray("items"), c, null, out);
                JSONArray ss = c.optJSONArray("subs");
                for (int j = 0; ss != null && j < ss.length(); j++) {
                    JSONObject s = ss.optJSONObject(j);
                    if (s != null && !s.optBoolean("hidden")) tvItems(s.optJSONArray("items"), c, s, out);
                }
            }
        } catch (JSONException e) {
            // what there is so far
        }
        return out.toString();
    }

    private static void tvItems(JSONArray items, JSONObject c, JSONObject s, JSONArray out) throws JSONException {
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null || it.optBoolean("hidden") || !it.optBoolean("tv", true) || !it.has("picture")) continue;
            JSONObject o = open(it).put("cat", c.optString("id")).put("catName", c.optJSONObject("name"));
            if (it.has("price")) o.put("price", it.optLong("price"));
            if (s != null) o.put("sub", s.optString("id")).put("subName", s.optJSONObject("name"));
            out.put(o);
        }
    }

    /** How many items customers see (no menu code on the TV without any) */
    synchronized int shownItems() {
        int n = 0;
        JSONArray cats = menu.optJSONArray("categories");
        for (int i = 0; cats != null && i < cats.length(); i++) {
            JSONObject c = cats.optJSONObject(i);
            if (c == null || c.optBoolean("hidden")) continue;
            n += shown(c.optJSONArray("items")).length();
            JSONArray ss = c.optJSONArray("subs");
            for (int j = 0; ss != null && j < ss.length(); j++) {
                JSONObject s = ss.optJSONObject(j);
                if (s != null && !s.optBoolean("hidden")) n += shown(s.optJSONArray("items")).length();
            }
        }
        return n;
    }

    private static JSONArray shown(JSONArray items) {
        JSONArray out = new JSONArray();
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null || it.optBoolean("hidden")) continue;
            try {
                JSONObject o = open(it);
                if (it.has("price")) o.put("price", it.optLong("price"));
                out.put(o);
            } catch (JSONException e) {
                // left out
            }
        }
        return out;
    }

    // What customers may see of a category, subcategory or item
    private static JSONObject open(JSONObject n) throws JSONException {
        JSONObject o = new JSONObject().put("id", n.optString("id")).put("name", n.optJSONObject("name"));
        if (n.optJSONObject("note") != null) o.put("note", n.optJSONObject("note"));
        if (n.has("picture")) o.put("picture", n.optString("picture"));
        return o;
    }

    /* ---------- checking the phone's menu ---------- */

    // Names trimmed and cut to length, prices in whole dinars, pictures that are on the box, ids that are
    // unique (a new one where not); says why not when something can't be fixed. Lenient (the menu kept on
    // the box): what's wrong is left out instead, and there are no limits.
    JSONObject clean(JSONObject in, boolean lenient) throws JSONException {
        JSONArray cats = in.optJSONArray("categories");
        if (cats == null) throw new IllegalArgumentException("That isn't a menu.");
        if (!lenient && cats.length() > MAX_CATEGORIES) throw new IllegalArgumentException("A menu can have up to " + MAX_CATEGORIES + " categories.");
        Set<String> ids = new HashSet<>();
        int[] all = { 0 };
        JSONArray out = new JSONArray();
        for (int i = 0; i < cats.length(); i++) {
            JSONObject c = cats.optJSONObject(i);
            if (c == null) continue;
            JSONObject cc = node(c, ids, "category", lenient);
            if (cc == null) continue;
            cc.put("items", items(c.optJSONArray("items"), ids, all, lenient));
            JSONArray subs = c.optJSONArray("subs"), so = new JSONArray();
            if (!lenient && subs != null && subs.length() > MAX_SUBS) {
                throw new IllegalArgumentException("A category can have up to " + MAX_SUBS + " subcategories.");
            }
            for (int j = 0; subs != null && j < subs.length(); j++) {
                JSONObject s = subs.optJSONObject(j);
                if (s == null) continue;
                JSONObject sc = node(s, ids, "subcategory", lenient);
                if (sc == null) continue;
                sc.put("items", items(s.optJSONArray("items"), ids, all, lenient));
                so.put(sc);
            }
            cc.put("subs", so);
            out.put(cc);
        }
        return new JSONObject().put("categories", out);
    }

    private JSONArray items(JSONArray in, Set<String> ids, int[] all, boolean lenient) throws JSONException {
        JSONArray out = new JSONArray();
        if (in == null) return out;
        if (!lenient && in.length() > MAX_ITEMS) throw new IllegalArgumentException("A category can have up to " + MAX_ITEMS + " items.");
        for (int i = 0; i < in.length(); i++) {
            JSONObject it = in.optJSONObject(i);
            if (it == null) continue;
            if (++all[0] > MAX_ALL && !lenient) throw new IllegalArgumentException("A menu can have up to " + MAX_ALL + " items.");
            JSONObject o = node(it, ids, "item", lenient);
            if (o == null) continue;
            long price = price(it.opt("price"));
            if (price > MAX_PRICE && !lenient) throw new IllegalArgumentException("“" + anyName(o) + "”: that price is too big.");
            if (price >= 0 && price <= MAX_PRICE) o.put("price", price);
            if (Boolean.FALSE.equals(it.opt("tv"))) o.put("tv", false);   // kept off the TV's slides between songs
            out.put(o);
        }
        return out;
    }

    private JSONObject node(JSONObject n, Set<String> ids, String what, boolean lenient) throws JSONException {
        JSONObject o = new JSONObject();
        JSONObject name = words(n.optJSONObject("name"), MAX_NAME, false);
        if (name.length() == 0) {
            if (lenient) return null;
            throw new IllegalArgumentException("Every " + what + " needs a name, in at least one language.");
        }
        String id = text(n, "id");
        while (!validId(id) || !ids.add(id)) id = newId();
        o.put("id", id);
        o.put("name", name);
        JSONObject note = words(n.optJSONObject("note"), MAX_NOTE, true);
        if (note.length() > 0) o.put("note", note);
        String pic = text(n, "picture");
        if (validId(pic) && new File(pics, pic + ".jpg").exists()) o.put("picture", pic);
        if (n.optBoolean("hidden", false)) o.put("hidden", true);
        return o;
    }

    // {"ku": ..., "ar": ..., "en": ...}: each trimmed, without control characters, cut to length; empty ones left out.
    // A name is one line; a note may have several.
    private static JSONObject words(JSONObject in, int max, boolean lines) throws JSONException {
        JSONObject out = new JSONObject();
        if (in == null) return out;
        for (String lang : LANGS) {
            String s = text(in, lang);
            s = lines ? s.replaceAll("[\\x00-\\x09\\x0B-\\x1F\\x7F]", "").replaceAll("\\n{3,}", "\n\n")
                      : s.replaceAll("[\\x00-\\x1F\\x7F]+", " ").replaceAll(" {2,}", " ");
            s = s.trim();
            if (s.length() > max) s = s.substring(0, max).trim();
            if (!s.isEmpty()) out.put(lang, s);
        }
        return out;
    }

    // A string from the phone's JSON (a JSON null, a number or anything else: "")
    private static String text(JSONObject o, String key) {
        Object v = o.opt(key);
        return v instanceof String ? (String) v : "";
    }

    /** A price as whole dinars: a number, or digits as text ("5,000", "٥٠٠٠"); -1 for none. */
    static long price(Object p) {
        if (p instanceof Number) {
            double d = ((Number) p).doubleValue();
            return Double.isNaN(d) || d < 0 ? -1 : d > 1e15 ? Long.MAX_VALUE : Math.round(d);
        }
        if (!(p instanceof String)) return -1;
        StringBuilder b = new StringBuilder();
        for (char ch : ((String) p).toCharArray()) {
            if (ch >= '0' && ch <= '9') b.append(ch);
            else if (ch >= '٠' && ch <= '٩') b.append((char) ('0' + (ch - '٠')));     // Arabic-Indic digits
            else if (ch >= '۰' && ch <= '۹') b.append((char) ('0' + (ch - '۰')));     // Persian digits
            else if (ch == '.' || ch == '٫') break;                                    // no fils
        }
        if (b.length() == 0) return -1;
        if (b.length() > 15) return Long.MAX_VALUE;
        return Long.parseLong(b.toString());
    }

    private static String anyName(JSONObject n) {
        JSONObject name = n.optJSONObject("name");
        for (String lang : LANGS) {
            if (name != null && !name.optString(lang, "").isEmpty()) return name.optString(lang, "");
        }
        return "An item";
    }

    private String newId() {
        return Long.toString(System.currentTimeMillis(), 36) + Integer.toString(1296 + random.nextInt(45360), 36);
    }

    /* ---------- pictures ---------- */

    /** Keeps a picture for the menu (base64 JPEGs, a "data:" prefix is fine). Returns its id; says why not otherwise. */
    synchronized String addPicture(String full, String small) {
        byte[] big = PictureStore.decode(full), little = small == null || small.isEmpty() ? null : PictureStore.decode(small);
        if (big == null || !PictureStore.isJpeg(big)) throw new IllegalArgumentException("That isn't a JPEG picture.");
        if (big.length > MAX_BYTES) throw new IllegalArgumentException("That picture is too big.");
        if (little != null && (!PictureStore.isJpeg(little) || little.length > MAX_SMALL)) little = null;
        sweep(System.currentTimeMillis());
        String[] names = pics.list();
        int count = 0;
        for (int i = 0; names != null && i < names.length; i++) if (names[i].endsWith(".jpg") && !names[i].endsWith(".small.jpg")) count++;
        if (count >= MAX_PICTURES) throw new IllegalArgumentException("The menu has " + MAX_PICTURES + " pictures already. Remove some first.");
        String id = newId();
        try {
            TitleBook.writeFile(new File(pics, id + ".jpg"), big);
            if (little != null) TitleBook.writeFile(new File(pics, id + ".small.jpg"), little);
        } catch (IOException e) {
            new File(pics, id + ".jpg").delete();
            new File(pics, id + ".small.jpg").delete();
            throw new IllegalArgumentException("The TV box couldn't save it (is its storage full?).");
        }
        return id;
    }

    /** A picture (or its small copy; the big one if there is no small one), or null. */
    byte[] picture(String id, boolean small) {
        if (!validId(id)) return null;
        File f = new File(pics, id + (small ? ".small.jpg" : ".jpg"));
        if (small && !f.exists()) f = new File(pics, id + ".jpg");
        if (!f.exists()) return null;
        try {
            InputStream in = new FileInputStream(f);
            try {
                java.io.ByteArrayOutputStream b = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toByteArray();
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return null;
        }
    }

    // Pictures the menu doesn't use any more (replaced, or their item deleted), once an hour old
    private void sweep(long now) {
        Set<String> used = new HashSet<>();
        JSONArray cats = menu.optJSONArray("categories");
        for (int i = 0; cats != null && i < cats.length(); i++) {
            JSONObject c = cats.optJSONObject(i);
            if (c == null) continue;
            usedIn(c, used);
            JSONArray ss = c.optJSONArray("subs");
            for (int j = 0; ss != null && j < ss.length(); j++) {
                JSONObject s = ss.optJSONObject(j);
                if (s != null) usedIn(s, used);
            }
        }
        File[] files = pics.listFiles();
        for (int i = 0; files != null && i < files.length; i++) {
            String n = files[i].getName();
            int dot = n.indexOf('.');
            String id = dot < 0 ? n : n.substring(0, dot);
            if (!used.contains(id) && now - files[i].lastModified() > KEEP_UNUSED) files[i].delete();
        }
    }

    private static void usedIn(JSONObject n, Set<String> used) {
        if (n.has("picture")) used.add(n.optString("picture"));
        JSONArray items = n.optJSONArray("items");
        for (int i = 0; items != null && i < items.length(); i++) {
            JSONObject it = items.optJSONObject(i);
            if (it != null && it.has("picture")) used.add(it.optString("picture"));
        }
    }

    /* ---------- on the box ---------- */

    private void load() {
        File f = new File(dir, "menu.json");
        try {
            if (f.exists()) {
                JSONObject m = new JSONObject(TitleBook.readFile(f));
                JSONObject c = clean(m, true);
                version = Math.max(1, m.optInt("v", 1));
                menu = c.put("v", version);
                return;
            }
        } catch (IOException | JSONException | IllegalArgumentException e) {
            // unreadable: start again from the café's categories (the old file stays, as menu.json.bad)
            f.renameTo(new File(dir, "menu.json.bad"));
        }
        try {
            menu = seed().put("v", version);
        } catch (JSONException e) {
            menu = new JSONObject();
        }
    }

    // The café's categories, to start with: no items yet, so customers see nothing until some are added
    private static JSONObject seed() throws JSONException {
        JSONArray cats = new JSONArray();
        cats.put(category("seedhookah", "Hookah Flavors"));
        JSONObject drink = category("seeddrink", "Drink");
        String[][] subs = { { "seedenergy", "Energy" }, { "seedfresh", "Fresh" }, { "seedhot", "Hot" },
                            { "seedmilkshake", "Milkshake" }, { "seedsoft", "Soft Drinks" } };
        for (String[] s : subs) {
            drink.getJSONArray("subs").put(new JSONObject().put("id", s[0]).put("name", new JSONObject().put("en", s[1])).put("items", new JSONArray()));
        }
        cats.put(drink);
        cats.put(category("seedicecream", "Ice Cream"));
        cats.put(category("seednuts", "Nuts"));
        cats.put(category("seedothers", "Others"));
        return new JSONObject().put("categories", cats);
    }

    private static JSONObject category(String id, String english) throws JSONException {
        return new JSONObject().put("id", id).put("name", new JSONObject().put("en", english))
                .put("items", new JSONArray()).put("subs", new JSONArray());
    }
}
