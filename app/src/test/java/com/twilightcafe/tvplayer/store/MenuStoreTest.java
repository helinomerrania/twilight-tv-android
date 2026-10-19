package com.twilightcafe.tvplayer.store;

import com.twilightcafe.tvplayer.Checks;
import com.twilightcafe.tvplayer.util.Disk;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.File;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class MenuStoreTest extends Checks {

    static String b64(byte[] b) { return Base64.getEncoder().encodeToString(b); }
    static byte[] jpeg(int n, int fill) {
        byte[] b = new byte[n];
        Arrays.fill(b, (byte) fill);
        b[0] = (byte) 0xFF; b[1] = (byte) 0xD8; b[2] = (byte) 0xFF;
        return b;
    }
    static JSONObject name(String ku, String ar, String en) throws Exception {
        JSONObject n = new JSONObject();
        if (ku != null) n.put("ku", ku);
        if (ar != null) n.put("ar", ar);
        if (en != null) n.put("en", en);
        return n;
    }
    static JSONObject item(String id, JSONObject name, Object price) throws Exception {
        JSONObject o = new JSONObject().put("name", name);
        if (id != null) o.put("id", id);
        if (price != null) o.put("price", price);
        return o;
    }
    static String body(int base, JSONArray cats) throws Exception {
        return new JSONObject().put("base", base).put("menu", new JSONObject().put("categories", cats)).toString();
    }
    static JSONObject cats(MenuStore s) throws Exception { return new JSONObject(s.full()); }
    static String en(JSONObject n) { return n.optJSONObject("name").optString("en"); }

    @Test
    public void theMenu() throws Exception {
        File dir = Files.createTempDirectory("menu").toFile();
        System.out.println("The menu to start with: the café's categories, nothing in them yet");
        MenuStore s = new MenuStore(dir);
        JSONObject m = cats(s);
        JSONArray c = m.getJSONArray("categories");
        List<String> names = new ArrayList<>();
        for (int i = 0; i < c.length(); i++) names.add(en(c.getJSONObject(i)));
        check("Hookah Flavors, Drink, Ice Cream, Nuts, Others", names.equals(Arrays.asList("Hookah Flavors", "Drink", "Ice Cream", "Nuts", "Others")), names);
        JSONArray subs = c.getJSONObject(1).getJSONArray("subs");
        List<String> sn = new ArrayList<>();
        for (int i = 0; i < subs.length(); i++) sn.add(en(subs.getJSONObject(i)));
        check("Drink: Energy, Fresh, Hot, Milkshake, Soft Drinks", sn.equals(Arrays.asList("Energy", "Fresh", "Hot", "Milkshake", "Soft Drinks")), sn);
        check("version 1; customers see nothing yet, so no menu code on the TV", s.version() == 1 && m.getInt("v") == 1 && s.shownItems() == 0
            && new JSONObject(s.forCustomers("Twilight", "Menu", "auto")).getJSONArray("categories").length() == 0, s.forCustomers("", "", ""));

        System.out.println("Saving from the phone");
        JSONArray mine = new JSONArray(c.toString());
        JSONObject hookah = mine.getJSONObject(0), drink = mine.getJSONObject(1);
        hookah.getJSONObject("name").put("ku", "  نێرگلە  ").put("ar", "أراكيل");
        hookah.put("note", name("هەموو تامێک: ١٠٬٠٠٠", null, "Every flavour: 10,000"));
        hookah.getJSONArray("items").put(item("apple1", name("سێوی دووانە", null, "Double Apple"), 10000))
                                    .put(item(null, name(null, null, "Mint"), "10,000"))
                                    .put(item("gone", name(null, null, "Grape (out)"), 10000).put("hidden", true));
        JSONObject energy = drink.getJSONArray("subs").getJSONObject(0);
        energy.getJSONArray("items").put(item("bull", name("ڕێد بوڵ", null, "Red Bull"), "٣٬٠٠٠"));
        drink.getJSONArray("subs").getJSONObject(1).put("hidden", true).getJSONArray("items").put(item("orange", name(null, null, "Orange"), 4000));
        mine.getJSONObject(2).getJSONArray("items").put(item("vanilla", name(null, null, "Vanilla"), 4500.6));
        mine.getJSONObject(3).put("hidden", true).getJSONArray("items").put(item("pist", name(null, null, "Pistachio"), 6000));
        String r = s.save(body(1, mine));
        JSONObject res = new JSONObject(r);
        check("saved: version 2, the whole menu back", res.getBoolean("ok") && res.getInt("v") == 2 && s.version() == 2
            && res.getJSONObject("menu").getJSONArray("categories").length() == 5, r);
        JSONObject h = cats(s).getJSONArray("categories").getJSONObject(0);
        check("names trimmed, all three languages kept", h.getJSONObject("name").getString("ku").equals("نێرگلە")
            && h.getJSONObject("name").getString("ar").equals("أراكيل") && en(h).equals("Hookah Flavors"), h.getJSONObject("name"));
        JSONArray hi = h.getJSONArray("items");
        check("prices: a number, \"10,000\", Kurdish digits \"٣٬٠٠٠\", 4500.6 -> whole dinars",
            hi.getJSONObject(0).getLong("price") == 10000 && hi.getJSONObject(1).getLong("price") == 10000
            && cats(s).getJSONArray("categories").getJSONObject(1).getJSONArray("subs").getJSONObject(0).getJSONArray("items").getJSONObject(0).getLong("price") == 3000
            && cats(s).getJSONArray("categories").getJSONObject(2).getJSONArray("items").getJSONObject(0).getLong("price") == 4501, hi);
        check("a new item gets an id; the phone's ids are kept", MenuStore.validId(hi.getJSONObject(1).getString("id"))
            && hi.getJSONObject(0).getString("id").equals("apple1") && h.getString("id").equals("seedhookah"), hi);
        check("hidden kept for the phone", hi.getJSONObject(2).getBoolean("hidden"));

        System.out.println("What customers see");
        JSONObject cu = new JSONObject(s.forCustomers("کافتریا و ڕێستورانتی توایڵایت", "مینیو", "latin"));
        JSONArray cc = cu.getJSONArray("categories");
        List<String> shown = new ArrayList<>();
        for (int i = 0; i < cc.length(); i++) shown.add(en(cc.getJSONObject(i)));
        check("hidden categories and empty ones left out: Hookah Flavors, Drink, Ice Cream", shown.equals(Arrays.asList("Hookah Flavors", "Drink", "Ice Cream")), shown);
        check("...hidden items too (Grape), and a hidden subcategory (Fresh) and empty ones (Hot, ...)",
            cc.getJSONObject(0).getJSONArray("items").length() == 2 && cc.getJSONObject(1).getJSONArray("subs").length() == 1
            && en(cc.getJSONObject(1).getJSONArray("subs").getJSONObject(0)).equals("Energy"), cc);
        check("no hidden flags, prices and notes there; the café's name, its word and its numbers",
            !cu.toString().contains("hidden") && cc.getJSONObject(0).getJSONArray("items").getJSONObject(0).getLong("price") == 10000
            && cc.getJSONObject(0).getJSONObject("note").getString("en").equals("Every flavour: 10,000")
            && cu.getString("name").equals("کافتریا و ڕێستورانتی توایڵایت") && cu.getString("word").equals("مینیو") && cu.getString("numerals").equals("latin")
            && cu.getInt("v") == 2, cu);
        check("items customers see: 4 (Double Apple, Mint, Red Bull, Vanilla)", s.shownItems() == 4, s.shownItems());

        System.out.println("Two phones at once");
        String again = s.save(body(1, mine));
        JSONObject conflict = new JSONObject(again);
        check("a change made on an older copy: refused, with the menu as it is now", !conflict.getBoolean("ok") && conflict.getBoolean("conflict")
            && conflict.getInt("v") == 2 && conflict.getJSONObject("menu").getJSONArray("categories").length() == 5 && s.version() == 2, again);

        System.out.println("Things the phone shouldn't send");
        JSONArray bad = new JSONArray(cats(s).getJSONArray("categories").toString());
        bad.getJSONObject(4).getJSONArray("items").put(item("noname", name(" ", "", null), 1000));
        String why = new JSONObject(s.save(body(2, bad))).optString("message");
        check("an item without a name: refused, nothing changed", why.contains("needs a name") && s.version() == 2, why);
        bad = new JSONArray(cats(s).getJSONArray("categories").toString());
        bad.getJSONObject(4).getJSONArray("items").put(item("dear", name(null, null, "Gold leaf"), 1000000000L));
        why = new JSONObject(s.save(body(2, bad))).optString("message");
        check("a price over 999,999,999: refused", why.contains("Gold leaf") && why.contains("too big"), why);
        JSONArray many = new JSONArray();
        for (int i = 0; i < 61; i++) many.put(new JSONObject().put("name", name(null, null, "C" + i)));
        why = new JSONObject(s.save(body(2, many))).optString("message");
        check("61 categories: refused", why.contains("up to 60 categories"), why);
        check("not JSON, or not a menu: refused", new JSONObject(s.save("{oops")).optString("message").contains("didn't arrive whole")
            && new JSONObject(s.save("{\"base\":2}")).optString("message").contains("isn't a menu") && s.version() == 2);

        System.out.println("Tidying what's typed");
        JSONArray tidy = new JSONArray(cats(s).getJSONArray("categories").toString());
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i < 100; i++) longName.append('x');
        tidy.getJSONObject(4).getJSONArray("items")
            .put(item("dupe", name("چا\tی   سوور\n", null, longName.toString()), JSONObject.NULL).put("note", name(null, null, "Line one\n\n\n\nLine two\u0007")))
            .put(item("dupe", name(null, null, "Second with the same id"), null))
            .put(item("BAD ID!", name(null, null, "Odd id"), -5));
        res = new JSONObject(s.save(body(2, tidy)));
        JSONArray oi = res.getJSONObject("menu").getJSONArray("categories").getJSONObject(4).getJSONArray("items");
        check("saved", res.getBoolean("ok") && s.version() == 3, res);
        check("a name is one line, spaces squeezed; cut to 80 letters", oi.getJSONObject(0).getJSONObject("name").getString("ku").equals("چا ی سوور")
            && en(oi.getJSONObject(0)).length() == 80, oi.getJSONObject(0));
        check("a note keeps its lines (no more than one empty), control characters gone",
            oi.getJSONObject(0).getJSONObject("note").getString("en").equals("Line one\n\nLine two"), oi.getJSONObject(0).optJSONObject("note"));
        check("no price, a null one or a negative one: none", !oi.getJSONObject(0).has("price") && !oi.getJSONObject(1).has("price") && !oi.getJSONObject(2).has("price"), oi);
        Set<String> ids = new HashSet<>();
        for (int i = 0; i < oi.length(); i++) ids.add(oi.getJSONObject(i).getString("id"));
        check("ids unique and tidy: the second \"dupe\" and \"BAD ID!\" get new ones", ids.size() == 3 && ids.contains("dupe")
            && MenuStore.validId(oi.getJSONObject(1).getString("id")) && MenuStore.validId(oi.getJSONObject(2).getString("id")), ids);

        System.out.println("Pictures");
        byte[] big = jpeg(40000, 7), small = jpeg(3000, 9);
        String pid = s.addPicture("data:image/jpeg;base64," + b64(big), b64(small));
        check("one put in: an id, the picture and its small copy", MenuStore.validId(pid) && Arrays.equals(s.picture(pid, false), big)
            && Arrays.equals(s.picture(pid, true), small), pid);
        String pid2 = s.addPicture(b64(jpeg(20000, 3)), "");
        check("no small copy: the picture stands in for it", s.picture(pid2, true).length == 20000);
        String w = "";
        try { s.addPicture(b64("not a picture".getBytes("UTF-8")), ""); } catch (IllegalArgumentException e) { w = e.getMessage(); }
        check("not a JPEG: refused", w.contains("isn't a JPEG"), w);
        w = "";
        try { s.addPicture(b64(jpeg(MenuStore.MAX_BYTES + 1, 1)), ""); } catch (IllegalArgumentException e) { w = e.getMessage(); }
        check("too big: refused", w.contains("too big"), w);
        check("odd or unknown ids: nothing", s.picture("../menu", false) == null && s.picture("zzzz9999", false) == null && s.picture(null, true) == null);
        JSONArray withPics = new JSONArray(cats(s).getJSONArray("categories").toString());
        withPics.getJSONObject(0).put("picture", pid);
        withPics.getJSONObject(0).getJSONArray("items").getJSONObject(0).put("picture", pid2);
        withPics.getJSONObject(0).getJSONArray("items").getJSONObject(1).put("picture", "abcdef123");     // not on the box
        res = new JSONObject(s.save(body(3, withPics)));
        JSONObject hk = res.getJSONObject("menu").getJSONArray("categories").getJSONObject(0);
        check("a category's and an item's picture kept; one that isn't on the box left out", pid.equals(hk.optString("picture"))
            && pid2.equals(hk.getJSONArray("items").getJSONObject(0).optString("picture")) && !hk.getJSONArray("items").getJSONObject(1).has("picture"), hk);
        check("customers get the pictures too", new JSONObject(s.forCustomers("", "", "")).getJSONArray("categories").getJSONObject(0).optString("picture").equals(pid));

        System.out.println("For the TV's slides between songs");
        MenuStore tv = new MenuStore(Files.createTempDirectory("menutv").toFile());
        String pa = tv.addPicture(b64(jpeg(1000, 7)), ""), pb = tv.addPicture(b64(jpeg(1000, 8)), "");
        JSONArray tcats = new JSONArray()
            .put(new JSONObject().put("id", "seedhookah").put("name", name("نێرگەلە", null, "Hookah")).put("items", new JSONArray()
                .put(item("aaaa1", name("توایڵایت", null, "Twilight"), 5000).put("picture", pa).put("note", name("تێکەڵەی خۆمان", null, "Ours")))
                .put(item("bbbb2", name("دوو سێو", null, null), 5000).put("picture", pa).put("tv", false))
                .put(item("cccc3", name("سندی", null, null), 5000))
                .put(item("dddd4", name("شیر", null, null), 5000).put("picture", pa).put("hidden", true))))
            .put(new JSONObject().put("id", "seeddrink").put("name", name("خواردنەوە", null, "Drinks")).put("items", new JSONArray()).put("subs", new JSONArray()
                .put(new JSONObject().put("id", "seedhot").put("name", name("گەرم", null, "Hot")).put("items", new JSONArray()
                    .put(item("eeee5", name("چا", null, "Tea"), 500).put("picture", pb))))
                .put(new JSONObject().put("id", "seedfresh").put("name", name("فرێش", null, null)).put("hidden", true).put("items", new JSONArray()
                    .put(item("ffff6", name("پرتەقاڵ", null, null), 2500).put("picture", pb))))))
            .put(new JSONObject().put("id", "gone1").put("name", name("کۆن", null, null)).put("hidden", true).put("items", new JSONArray()
                .put(item("gggg7", name("کۆن", null, null), 1).put("picture", pb))));
        JSONObject tres = new JSONObject(tv.save(body(tv.version(), tcats)));
        JSONArray hookahItems = tres.getJSONObject("menu").getJSONArray("categories").getJSONObject(0).getJSONArray("items");
        check("an item kept off the TV stays so (\"tv\": false); the others carry nothing for it", tres.optBoolean("ok")
            && hookahItems.getJSONObject(1).has("tv") && !hookahItems.getJSONObject(1).optBoolean("tv", true) && !hookahItems.getJSONObject(0).has("tv"), hookahItems);
        JSONArray forTv = new JSONArray(tv.forTv());
        List<String> tvIds = new ArrayList<>();
        for (int i = 0; i < forTv.length(); i++) tvIds.add(forTv.getJSONObject(i).getString("id"));
        check("the TV gets only what customers see, with a picture, not kept off it: Twilight and Tea", tvIds.equals(Arrays.asList("aaaa1", "eeee5")), tvIds);
        JSONObject tw = forTv.getJSONObject(0), tea = forTv.getJSONObject(1);
        check("...each with its words, price, picture and its category's id and name", tw.getJSONObject("name").getString("ku").equals("توایڵایت")
            && tw.getJSONObject("note").getString("en").equals("Ours") && tw.getLong("price") == 5000 && tw.getString("picture").equals(pa)
            && tw.getString("cat").equals("seedhookah") && tw.getJSONObject("catName").getString("en").equals("Hookah") && !tw.has("sub"), tw);
        check("...and in a subcategory, its id and name too (what the weather goes by)", tea.getString("cat").equals("seeddrink")
            && tea.getString("sub").equals("seedhot") && tea.getJSONObject("subName").getString("ku").equals("گەرم") && tea.getLong("price") == 500, tea);
        check("customers' menu unchanged by it (nothing about the TV in it)", !tv.forCustomers("", "", "").contains("\"tv\""));

        System.out.println("Pictures no longer used");
        String loose = s.addPicture(b64(jpeg(1000, 5)), b64(jpeg(500, 5)));
        long old = System.currentTimeMillis() - 2 * 3600000L;
        new File(dir, "pics/" + pid + ".jpg").setLastModified(old);                // used, but old
        String stale = s.addPicture(b64(jpeg(1000, 6)), b64(jpeg(500, 6)));
        new File(dir, "pics/" + stale + ".jpg").setLastModified(old);
        new File(dir, "pics/" + stale + ".small.jpg").setLastModified(old);
        s.save(body(4, cats(s).getJSONArray("categories")));
        check("not in the menu and over an hour old: deleted, with its small copy", s.picture(stale, false) == null && !new File(dir, "pics/" + stale + ".small.jpg").exists());
        check("not in the menu but new (being edited): kept", s.picture(loose, false) != null);
        check("in the menu, however old: kept", s.picture(pid, false) != null);

        System.out.println("On the box");
        MenuStore back = new MenuStore(dir);
        check("after a restart: the same menu and version", back.version() == 5 && back.full().equals(s.full()) && back.shownItems() == s.shownItems(),
            back.version() + " " + s.version());
        JSONObject hand = new JSONObject(back.full());
        hand.getJSONArray("categories").getJSONObject(0).getJSONArray("items").put(item("blank", name("", null, null), 5));
        Disk.write(new File(dir, "menu.json"), hand.toString().getBytes("UTF-8"));
        MenuStore lenient = new MenuStore(dir);
        check("a file with something wrong in it (changed by hand): the rest kept", lenient.version() == 5
            && new JSONObject(lenient.full()).getJSONArray("categories").getJSONObject(0).getJSONArray("items").length() == 3, lenient.full());
        Disk.write(new File(dir, "menu.json"), "{ this isn't JSON".getBytes("UTF-8"));
        MenuStore fresh = new MenuStore(dir);
        check("an unreadable file: kept aside as menu.json.bad, the café's categories again", new File(dir, "menu.json.bad").exists()
            && new JSONObject(fresh.full()).getJSONArray("categories").length() == 5 && fresh.shownItems() == 0, fresh.full());

        System.out.println("Prices typed on a phone");
        check("\"5,000\" 5000; \"٥٬٠٠٠\" 5000; \"۷۵۰۰\" 7500; \"4500.75\" 4500", MenuStore.price("5,000") == 5000 && MenuStore.price("٥٬٠٠٠") == 5000
            && MenuStore.price("۷۵۰۰") == 7500 && MenuStore.price("4500.75") == 4500);
        check("nothing, words, null, negative: none", MenuStore.price("") == -1 && MenuStore.price("free") == -1 && MenuStore.price(null) == -1
            && MenuStore.price(-3) == -1 && MenuStore.price(JSONObject.NULL) == -1);

        allPassed();
    }
}
