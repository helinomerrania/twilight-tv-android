package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.page.TvPage;
import com.twilightcafe.tvplayer.store.MenuStore;

import org.json.JSONObject;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * For the page tests (tests/pages): the app's real web servers (the phone page's and the customers' menu's) and
 * its real menu store, with a stand-in for the rest of the app, so the pages can be tried in a browser on a
 * computer. Prints "port N menu M", and runs until its input closes.
 * args: the assets folder, a folder for the menu, and the menu's link (optional)
 */
public class PageTestServer {
    public static void main(String[] a) throws Exception {
        final File assets = new File(a[0]);
        final MenuStore menus = new MenuStore(new File(a[1]));
        final String link = a.length > 2 ? a[2] : "";
        final ControlServer[] self = new ControlServer[2];
        ControlServer.Tv tv = new ControlServer.Tv() {
            public String pin() { return "4821"; }
            public byte[] page() { return read("phone/index.html"); }
            public String status() {
                return "{\"tv\":\"TV 23\",\"build\":\"1.50\",\"onScreen\":true,\"others\":[],\"lock\":{\"on\":true,\"other\":\"MyTV Plus\",\"sees\":true,\"canReturn\":true},"
                     + "\"page\":{\"name\":\"کافتریا\",\"songs\":3,\"round\":{\"done\":1,\"total\":3},\"state\":\"playing\",\"volume\":100,\"zoom\":100,\"adsSkipped\":0,\"problems\":[]}}";
            }
            public boolean command(String w) { return true; }
            public String settings() { return "{\"tv\":\"TV 23\",\"defaults\":{},\"file\":{},\"local\":{},\"others\":[]}"; }
            public String saveSettings(String body, boolean all) { return "{\"ok\":true}"; }
            public byte[] asset(String name) { byte[] b = read(name); return b.length == 0 ? null : b; }
            public byte[] menuPage() { return read("menu/index.html"); }
            // the TV page, as the app hands it to Firefox's engine (with the bridge), for loading it in a browser
            public byte[] tvPage() {
                return TvPage.withBridge(read("tv/index.html"), new String(read("tv/bridge.js"), StandardCharsets.UTF_8),
                        "{\"k\":\"testkey\",\"v\":1,\"s\":{},\"xv\":0,\"x\":{}}");
            }
            public String tvSync(String key, String body) { return "testkey".equals(key) ? "{\"v\":1,\"cmds\":[]}" : null; }
            public String menuForCustomers() { return menus.forCustomers("کافتریا و ڕێستورانتی توایڵایت", "مینیو", "auto"); }
            public byte[] menuPicture(String id, boolean small) { return menus.picture(id, small); }
            public String menu() { return withAddress(menus.full()); }
            public String saveMenu(String body) {
                String r = menus.save(body);
                try {
                    JSONObject o = new JSONObject(r);
                    if (o.optJSONObject("menu") != null) o.put("menu", new JSONObject(withAddress(o.getJSONObject("menu").toString())));
                    return o.toString();
                } catch (Exception e) {
                    return r;
                }
            }
            public String addMenuPicture(String body) {
                try {
                    JSONObject o = new JSONObject(body);
                    return new JSONObject().put("ok", true).put("id", menus.addPicture(o.optString("full", ""), o.optString("small", ""))).toString();
                } catch (IllegalArgumentException e) {
                    return "{\"ok\":false,\"message\":" + JSONObject.quote(e.getMessage()) + "}";
                } catch (Exception e) {
                    return "{\"ok\":false,\"message\":\"That picture didn't arrive whole. Try again.\"}";
                }
            }
            String withAddress(String menu) {
                try {
                    return new JSONObject(menu).put("address", menus.shownItems() > 0 ? "http://127.0.0.1:" + self[1].port() + "/menu/" : "")
                            .put("link", link).put("shown", menus.shownItems()).toString();
                } catch (Exception e) {
                    return menu;
                }
            }
            byte[] read(String name) {
                try {
                    return Files.readAllBytes(new File(assets, name).toPath());
                } catch (Exception e) {
                    return new byte[0];
                }
            }
        };
        self[0] = new ControlServer(tv);
        self[1] = new ControlServer(tv, true);
        self[1].start(8090, 8099);
        System.out.println("port " + self[0].start() + " menu " + self[1].port());
        System.out.flush();
        while (System.in.read() >= 0) { }
        self[0].stop();
        self[1].stop();
    }
}
