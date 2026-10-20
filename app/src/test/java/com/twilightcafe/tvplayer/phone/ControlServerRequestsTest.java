package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.Checks;
import com.twilightcafe.tvplayer.page.TvPage;

import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class ControlServerRequestsTest extends Checks {
    static int port;
    // All of a stream (Java 8, which the app is built for, has no readAllBytes)
    static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) b.write(buf, 0, n);
        return b.toByteArray();
    }
    static String[] call(String method, String path) throws IOException { return call(method, path, null); }
    static String[] call(String method, String path, String body) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL("http://127.0.0.1:" + port + path).openConnection();
        c.setRequestMethod(method);
        if (body != null) { c.setDoOutput(true); byte[] b = body.getBytes("UTF-8"); c.setFixedLengthStreamingMode(b.length); c.getOutputStream().write(b); }
        c.setConnectTimeout(3000); c.setReadTimeout(5000);
        int code = c.getResponseCode();
        InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
        String text = in == null ? "" : new String(readAll(in), "UTF-8");
        return new String[] { String.valueOf(code), text, String.valueOf(c.getContentType()), String.valueOf(c.getHeaderField("Cache-Control")),
                String.valueOf(c.getHeaderField("Referrer-Policy")) };
    }
    // A request from a given address on this computer (127.0.0.x: any of them reach the server), as a phone would
    static String[] raw(String from, int port, String path) throws IOException {
        try (Socket c = new Socket(InetAddress.getByName("127.0.0.1"), port, InetAddress.getByName(from), 0)) {
            c.setSoTimeout(5000);
            c.getOutputStream().write(("GET " + path + " HTTP/1.1\r\nHost: x\r\n\r\n").getBytes("UTF-8"));
            String resp = new String(readAll(c.getInputStream()), "UTF-8");
            int b = resp.indexOf("\r\n\r\n");
            return new String[] { resp.length() >= 12 ? resp.substring(9, 12) : resp, b < 0 ? "" : resp.substring(b + 4) };
        }
    }
    static ControlServer.Tv plainTv() {
        return new ControlServer.Tv() {
            public String pin() { return "4821"; } public byte[] page() { return new byte[0]; } public String status() { return "{\"tv\":\"TV 23\"}"; }
            public boolean command(String w) { return true; } public String settings() { return "{}"; } public String saveSettings(String b, boolean a) { return "{}"; }
        };
    }
    @Test
    public void requestsFromPhonesAndTheBox() throws Exception {
        final List<String> cmds = Collections.synchronizedList(new ArrayList<>());
        final List<String> saved = Collections.synchronizedList(new ArrayList<>());
        ControlServer s = new ControlServer(new ControlServer.Tv() {
            public String pin() { return "4821"; }
            public byte[] page() { try { return "<!doctype html><title>Twilight</title>کافتریا".getBytes("UTF-8"); } catch (Exception e) { return null; } }
            public String status() { return "{\"tv\":\"TV 23\"}"; }
            public boolean command(String w) { cmds.add(w); return !w.equals("bad"); }
            public String settings() { return "{\"local\":{}}"; }
            public String saveSettings(String body, boolean all) { saved.add(body + (all ? " ALL" : "")); return body.startsWith("{") ? "{\"ok\":true}" : null; }
        });
        s.guard.lockMillis = 1500;
        port = s.start();
        System.out.println("\nPhone control server");
        check("starts on port 8080 (or the next free one)", port >= 8080 && port <= 8090, port);
        String[] r = call("GET", "/");
        check("control page served to any phone, as UTF-8 HTML, not cached", r[0].equals("200") && r[1].contains("کافتریا") && r[2].startsWith("text/html") && r[3].equals("no-store"), Arrays.toString(r));
        r = call("GET", "/api/status");
        check("status without the PIN: refused (401)", r[0].equals("401") && r[1].contains("Wrong PIN"), Arrays.toString(r));
        r = call("GET", "/api/status?pin=4821");
        check("status with the PIN: the TV's JSON", r[0].equals("200") && r[1].equals("{\"tv\":\"TV 23\"}") && r[2].startsWith("application/json"), Arrays.toString(r));
        r = call("POST", "/api/cmd?pin=4821&do=next");
        check("command with the PIN reaches the TV", r[0].equals("200") && r[1].equals("{\"ok\":true}") && cmds.equals(Arrays.asList("next")), Arrays.toString(r) + cmds);
        r = call("POST", "/api/cmd?pin=4821&do=vol%2B");
        check("URL-encoded command (vol+) decoded", cmds.get(cmds.size() - 1).equals("vol+"), cmds);
        r = call("GET", "/api/cmd?pin=4821&do=next");
        check("commands only by POST (a link can't trigger one)", r[0].equals("405") && cmds.size() == 2, Arrays.toString(r));
        r = call("POST", "/api/cmd?pin=4821&do=bad");
        check("command the TV refuses: 400", r[0].equals("400") && r[1].equals("{\"ok\":false}"), Arrays.toString(r));
        r = call("GET", "/api/settings?pin=4821");
        check("settings for the phone's Settings screen", r[0].equals("200") && r[1].equals("{\"local\":{}}"), Arrays.toString(r));
        String body = "{\"local\":{\"volume\":70,\"brandName\":\"کافتریا\"}}";
        r = call("POST", "/api/settings?pin=4821", body);
        check("settings saved from the phone reach the TV whole, in UTF-8", r[0].equals("200") && saved.get(0).equals(body), saved);
        r = call("POST", "/api/settings?pin=4821&all=1", body);
        check("...and 'also on the other TVs' is passed on", saved.get(1).equals(body + " ALL"), saved);
        r = call("POST", "/api/settings?pin=4821", "not json");
        check("settings that can't be read: 400, nothing saved", r[0].equals("400") && r[1].contains("couldn't be read"), Arrays.toString(r));
        r = call("POST", "/api/settings?pin=0000", body);
        check("settings without the right PIN: refused", r[0].equals("401") && saved.size() == 3, Arrays.toString(r));
        StringBuilder huge = new StringBuilder("{\"local\":{\"x\":\""); for (int i = 0; i < 70000; i++) huge.append('a'); huge.append("\"}}");
        try { r = call("POST", "/api/settings?pin=4821", huge.toString()); } catch (IOException e) { r = new String[] { "413", "", "", "" }; }
        check("a body over 64 KB is refused (413)", r[0].equals("413") && saved.size() == 3, r[0]);
        r = call("GET", "/etc/passwd");
        check("anything else: 404", r[0].equals("404"), r[0]);
        call("GET", "/api/status?pin=4821");          // a right PIN starts the count again
        for (int i = 0; i < 9; i++) call("GET", "/api/status?pin=0000");
        r = call("GET", "/api/status?pin=4821");
        check("9 wrong PINs then the right one: still allowed", r[0].equals("200"), r[0]);
        for (int i = 0; i < 10; i++) call("GET", "/api/status?pin=" + (1000 + i));
        r = call("GET", "/api/status?pin=4821");
        check("10 wrong PINs: locked out, even with the right PIN (429)", r[0].equals("429") && r[1].contains("10 minutes"), Arrays.toString(r));
        Thread.sleep(1700);
        r = call("GET", "/api/status?pin=4821");
        check("...lock ends after its time", r[0].equals("200"), r[0]);
        ExecutorService ex = Executors.newFixedThreadPool(12);
        List<Future<String>> fs = new ArrayList<>();
        for (int i = 0; i < 40; i++) fs.add(ex.submit(() -> call("GET", "/api/status?pin=4821")[0]));
        int ok = 0; for (Future<String> f : fs) if (f.get().equals("200")) ok++;
        check("40 requests at once from several phones: all answered", ok == 40, ok);
        ex.shutdown();
        try (Socket raw = new Socket("127.0.0.1", port)) {
            raw.getOutputStream().write("GARBAGE\r\n\r\n".getBytes()); raw.setSoTimeout(3000);
            String resp = new String(readAll(raw.getInputStream()));
            check("broken request: 400, server keeps running", resp.startsWith("HTTP/1.1 400"), resp);
        }
        try (Socket idle = new Socket("127.0.0.1", port)) {
            r = call("GET", "/api/status?pin=4821");
            check("a phone that connects and sends nothing doesn't block others", r[0].equals("200"), r[0]);
        }
        ControlServer second = new ControlServer(s.getClass().cast(s) == s ? new ControlServer.Tv() {
            public String pin() { return ""; } public byte[] page() { return new byte[0]; } public String status() { return "{}"; } public boolean command(String w) { return true; }
            public String settings() { return "{}"; } public String saveSettings(String b, boolean a) { return "{}"; }
        } : null);
        int p2 = second.start();
        check("a second server takes the next port", p2 == port + 1, p2);
        int savedPort = port; port = p2;
        r = call("GET", "/api/status?pin=");
        check("no PIN configured: nothing allowed", r[0].equals("401"), r[0]);
        second.stop(); port = savedPort;

        System.out.println("\nThe TV page for Firefox's engine (for the box itself only)");
        r = call("GET", "/tv/index.html?k=x");
        check("the normal version has no TV page here (404)", r[0].equals("404"), Arrays.toString(r));
        r = call("GET", "/");
        check("...and the phone page still says no-referrer", r[4].equals("no-referrer"), Arrays.toString(r));
        final List<String> syncs = Collections.synchronizedList(new ArrayList<>());
        ControlServer t = new ControlServer(new ControlServer.Tv() {
            public String pin() { return "4821"; } public byte[] page() { return new byte[0]; } public String status() { return "{}"; }
            public boolean command(String w) { return true; } public String settings() { return "{}"; } public String saveSettings(String b, boolean a) { return "{}"; }
            public byte[] tvPage() { try { return "<!doctype html><title>TV</title>کافتریا".getBytes("UTF-8"); } catch (Exception e) { return null; } }
            public String tvSync(String key, String b) { syncs.add(key + " " + b); return "k1".equals(key) ? "{\"v\":3}" : null; }
        });
        int p3 = t.start(); int keep = port; port = p3;
        r = call("GET", "/tv/index.html?k=k1");
        check("TV page served to the box itself, as UTF-8 HTML, not cached", r[0].equals("200") && r[1].contains("کافتریا") && r[2].startsWith("text/html") && r[3].equals("no-store"), Arrays.toString(r));
        check("...and it lets YouTube see which page its player is on (not no-referrer)", r[4].equals("strict-origin-when-cross-origin"), r[4]);
        r = call("POST", "/tv/sync?k=k1", "{\"alive\":true}");
        check("check-in with the right key: the app's answer, the page's words reach the app whole", r[0].equals("200") && r[1].equals("{\"v\":3}") && syncs.get(0).equals("k1 {\"alive\":true}"), Arrays.toString(r) + syncs);
        r = call("POST", "/tv/sync?k=nope", "{}");
        check("check-in with a wrong key: refused (403)", r[0].equals("403"), Arrays.toString(r));
        r = call("GET", "/tv/sync?k=k1");
        check("check-in only by POST", r[0].equals("404"), Arrays.toString(r));
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        t.respond(bo, "GET", "/tv/index.html", Http.parseQuery("k=k1"), "192.168.1.50", "");
        check("from the café network: no TV page (404)", bo.toString("UTF-8").startsWith("HTTP/1.1 404"), bo.toString("UTF-8"));
        bo = new ByteArrayOutputStream();
        t.respond(bo, "POST", "/tv/sync", Http.parseQuery("k=k1"), "192.168.1.50", "{}");
        check("from the café network: no check-in either", bo.toString("UTF-8").startsWith("HTTP/1.1 404") && syncs.size() == 2, syncs);
        check("the box's own addresses recognised (IPv4, IPv6, mapped), others not",
            ControlServer.isLoopback("127.0.0.1") && ControlServer.isLoopback("::1") && ControlServer.isLoopback("0:0:0:0:0:0:0:1")
            && ControlServer.isLoopback("::ffff:127.0.0.1") && !ControlServer.isLoopback("192.168.1.5") && !ControlServer.isLoopback("10.0.0.127")
            && !ControlServer.isLoopback(null), "");
        t.stop(); port = keep;

        System.out.println("\nThe TV page with the link to the app put in");
        byte[] html = "<!DOCTYPE html>\n<html><head>\n<meta charset=\"utf-8\">\n<title>T</title><script>page()</script></head><body>کافتریا</body></html>".getBytes("UTF-8");
        String withLink = new String(TvPage.withBridge(html, "bridge(); // </script> inside", "{\"k\":\"key\",\"s\":\"{\\\"brandName\\\":\\\"</script><b>\\\"}\"}"), "UTF-8");
        int meta = withLink.indexOf("<meta charset=\"utf-8\">"), boot = withLink.indexOf("window.TWILIGHT_BOOT"), own = withLink.indexOf("<script>page()");
        check("put in right after <meta charset>, before the page's own script, page kept whole", meta >= 0 && boot > meta && boot < own && withLink.contains("کافتریا</body>"), withLink);
        check("settings can't end the script early (< written as \\u003c)", withLink.contains("\\u003c/script>\\u003cb>") && !withLink.contains("</script><b>"), withLink);
        check("nor can the link's own text", withLink.contains("<\\/script> inside"), withLink);
        String noMeta = new String(TvPage.withBridge("<html><HEAD><title>x</title></HEAD></html>".getBytes("UTF-8"), "b()", "{}"), "UTF-8");
        check("no <meta charset>: right after <head>, whatever its case", noMeta.startsWith("<html><HEAD>\n<script>\nwindow.TWILIGHT_BOOT = {};\nb()\n</script>\n<title>"), noMeta);
        System.out.println("\nSongs, pictures and the home-screen icon");
        final List<String> added = Collections.synchronizedList(new ArrayList<>());
        final List<String> deleted = Collections.synchronizedList(new ArrayList<>());
        final byte[] jpeg = new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2, 3 };
        final List<String> looked = new ArrayList<>(), lookCalls = new ArrayList<>();
        ControlServer u = new ControlServer(new ControlServer.Tv() {
            public String pin() { return "4821"; } public byte[] page() { return new byte[0]; } public String status() { return "{}"; }
            public boolean command(String w) { return true; } public String settings() { return "{}"; } public String saveSettings(String b, boolean a) { return "{}"; }
            public String songs() { return "{\"songs\":[{\"id\":\"dQw4w9WgXcQ\",\"title\":\"گۆرانی\"}]}"; }
            public String pictures() { return "{\"pictures\":[{\"id\":\"abc123\",\"at\":1}],\"max\":30}"; }
            public String addPicture(String b) { added.add(b); return b.contains("bad") ? "{\"ok\":false,\"message\":\"That isn't a JPEG picture.\"}" : "{\"ok\":true,\"id\":\"new123\"}"; }
            public boolean deletePicture(String id) { deleted.add(id); return id.equals("abc123"); }
            public byte[] picture(String id, boolean small) { return "abc123".equals(id) ? (small ? new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 9 } : jpeg) : null; }
            public byte[] asset(String name) { try { return name.endsWith(".png") ? ("PNG:" + name).getBytes("UTF-8") : name.equals("home-screen/manifest.webmanifest") ? "{\"name\":\"Twilight TV\"}".getBytes("UTF-8") : name.matches("(tv|phone|menu)/[a-z]+\\.(css|js)") ? ("FILE:" + name).getBytes("UTF-8") : null; } catch (Exception e) { return null; } }
            public byte[] look(String name) { looked.add(name); return name.equals("newroz") ? jpeg : null; }
            public String looks() { return "{\"looks\":[{\"name\":\"cafe\",\"at\":0}]}"; }
            public String setLook(String name, String b, boolean all) { lookCalls.add("set " + name + " " + all + " " + b.length()); return "cafe".equals(name) ? "{\"ok\":true,\"at\":5}" : "{\"ok\":false,\"message\":\"There's no such picture on the café screen.\"}"; }
            public String resetLook(String name, boolean all) { lookCalls.add("reset " + name + " " + all); return "{\"ok\":true,\"at\":0}"; }
            public byte[] lookForPhone(String name, boolean small) { return "cafe".equals(name) ? (small ? new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1 } : jpeg) : null; }
        });
        int p4 = u.start(); int keep4 = port; port = p4;
        r = call("GET", "/api/songs?pin=4821");
        check("the song list for the phone, with the PIN, in UTF-8", r[0].equals("200") && r[1].contains("گۆرانی") && r[2].startsWith("application/json"), Arrays.toString(r));
        r = call("GET", "/api/songs");
        check("...not without it", r[0].equals("401"), r[0]);
        r = call("GET", "/api/pictures?pin=4821");
        check("the list of pictures", r[0].equals("200") && r[1].contains("abc123"), Arrays.toString(r));
        StringBuilder pic = new StringBuilder("{\"full\":\"data:image/jpeg;base64,");
        for (int i = 0; i < 1500000; i++) pic.append('A');
        pic.append("\",\"small\":\"x\"}");
        r = call("POST", "/api/pictures?pin=4821", pic.toString());
        check("a picture of 1.5 MB from the phone is taken (only pictures may be that big)", r[0].equals("200") && r[1].contains("new123") && added.size() == 1 && added.get(0).length() == pic.length(), r[0] + " " + r[1]);
        r = call("POST", "/api/pictures?pin=4821", "{\"full\":\"bad\"}");
        check("one the TV refuses: 400 with the reason", r[0].equals("400") && r[1].contains("isn't a JPEG"), Arrays.toString(r));
        try { r = call("POST", "/api/pictures?pin=1111", pic.toString()); } catch (IOException e) { r = new String[] { "io", e.toString() }; }
        check("a big upload with a wrong PIN: refused as a wrong PIN, nothing read or kept", (r[0].equals("401") || r[0].equals("io")) && added.size() == 2, Arrays.toString(r));
        call("GET", "/api/status?pin=4821");          // the right PIN again: the count starts over
        StringBuilder huge2 = new StringBuilder("{\"full\":\"");
        for (int i = 0; i < (9 << 20) + 10; i++) huge2.append('A');
        huge2.append("\"}");
        try { r = call("POST", "/api/pictures?pin=4821", huge2.toString()); } catch (IOException e) { r = new String[] { "413", "" }; }
        check("over 9 MB even with the PIN: refused (413)", r[0].equals("413") && added.size() == 2, r[0]);
        StringBuilder big = new StringBuilder("{\"local\":{\"x\":\""); for (int i = 0; i < 70000; i++) big.append('a'); big.append("\"}}");
        try { r = call("POST", "/api/settings?pin=4821", big.toString()); } catch (IOException e) { r = new String[] { "413", "" }; }
        check("...and other addresses still take at most 64 KB", r[0].equals("413"), r[0]);
        r = call("POST", "/api/pictures?pin=4821&delete=abc123");
        check("deleting a picture", r[0].equals("200") && deleted.equals(Arrays.asList("abc123")), Arrays.toString(r));
        r = call("POST", "/api/pictures?pin=4821&delete=nothere");
        check("...one that isn't there: 404", r[0].equals("404"), r[0]);
        r = call("GET", "/api/picture?pin=4821&id=abc123");
        check("a picture for the phone: a JPEG it may keep (it never changes)", r[0].equals("200") && r[2].equals("image/jpeg") && r[3].contains("max-age"), Arrays.toString(r));
        r = call("GET", "/api/picture?pin=4821&id=abc123&size=small");
        check("...its small copy", r[0].equals("200") && r[1].length() == 4, r[1].length());
        r = call("GET", "/api/picture?id=abc123");
        check("...not without the PIN", r[0].equals("401"), r[0]);
        r = call("GET", "/tv/pictures/abc123.jpg");
        check("the TV page gets the pictures from the box itself", r[0].equals("200") && r[2].equals("image/jpeg"), Arrays.toString(r));
        bo = new ByteArrayOutputStream();
        u.respond(bo, "GET", "/tv/pictures/abc123.jpg", Http.parseQuery(""), "192.168.1.50", "");
        check("...but not the café network that way", bo.toString("UTF-8").startsWith("HTTP/1.1 404"), bo.toString("UTF-8"));
        r = call("GET", "/tv/pictures/zzz.jpg");
        check("...an unknown picture: 404", r[0].equals("404"), r[0]);
        r = call("GET", "/tv/looks/newroz.jpg");
        check("the café screen's own pictures, for the TV page: a JPEG, looked at again on each load (a new app may bring new ones)",
            r[0].equals("200") && r[2].equals("image/jpeg") && r[3].contains("no-cache") && looked.equals(Arrays.asList("newroz")), Arrays.toString(r));
        bo = new ByteArrayOutputStream();
        u.respond(bo, "GET", "/tv/looks/newroz.jpg", Http.parseQuery(""), "192.168.1.50", "");
        check("...not for the café network", bo.toString("UTF-8").startsWith("HTTP/1.1 404") && looked.size() == 1, bo.toString("UTF-8"));
        r = call("GET", "/tv/looks/nothere.jpg");
        String r2 = call("GET", "/tv/looks/..%2Fbridge.jpg")[0], r3 = call("GET", "/tv/looks/Cafe.jpg")[0];
        check("...one the app hasn't: 404; odd names never asked for", r[0].equals("404") && r2.equals("404") && r3.equals("404") && looked.equals(Arrays.asList("newroz", "nothere")),
            r[0] + " " + r2 + " " + r3 + " " + looked);
        r = call("GET", "/api/looks?pin=4821");
        check("the café screen's pictures for the phone, with the PIN", r[0].equals("200") && r[1].contains("\"cafe\""), Arrays.toString(r));
        r = call("GET", "/api/looks");
        check("...not without it", r[0].equals("401"), r[0]);
        call("GET", "/api/status?pin=4821");          // the right PIN again: the count starts over
        r = call("POST", "/api/looks?pin=4821&name=cafe&all=1", pic.toString());
        check("putting in the café's own (1.5 MB, like a picture), for every TV", r[0].equals("200") && r[1].contains("\"ok\":true") &&
            lookCalls.equals(Arrays.asList("set cafe true " + pic.length())), r[0] + " " + lookCalls);
        r = call("POST", "/api/looks?pin=4821&name=christmas", "{\"full\":\"x\"}");
        check("...one the TV refuses: 400 with the reason", r[0].equals("400") && r[1].contains("no such picture"), Arrays.toString(r));
        try { r = call("POST", "/api/looks?pin=1111&name=cafe", pic.toString()); } catch (IOException e) { r = new String[] { "io", e.toString() }; }
        check("...a big one with a wrong PIN: refused, nothing kept", (r[0].equals("401") || r[0].equals("io")) && lookCalls.size() == 2, Arrays.toString(r));
        call("GET", "/api/status?pin=4821");
        r = call("POST", "/api/looks?pin=4821&name=cafe&reset=1");
        check("back to the built-in one, on this TV only", r[0].equals("200") && lookCalls.get(2).equals("reset cafe false"), lookCalls);
        r = call("GET", "/api/look?pin=4821&name=cafe&size=small");
        String[] full = call("GET", "/api/look?pin=4821&name=cafe");
        check("the picture in use for the phone's preview (asked again each time: it may change)", r[0].equals("200") && r[2].equals("image/jpeg") && r[1].length() == 4
            && r[3].contains("no-cache") && full[0].equals("200") && full[1].length() == jpeg.length, Arrays.toString(r));
        r = call("GET", "/api/look?pin=4821&name=nothere");
        String r4 = call("GET", "/api/look?name=cafe")[0];
        check("...404 for an unknown one, 401 without the PIN", r[0].equals("404") && r4.equals("401"), r[0] + " " + r4);
        call("GET", "/api/status?pin=4821");
        r = call("GET", "/manifest.webmanifest");
        check("home-screen icon: the manifest, no PIN needed", r[0].equals("200") && r[2].startsWith("application/manifest+json") && r[1].contains("Twilight TV"), Arrays.toString(r));
        r = call("GET", "/icon-192.png");
        boolean icons = r[0].equals("200") && r[2].equals("image/png") && r[1].equals("PNG:home-screen/icon-192.png");
        r = call("GET", "/apple-touch-icon.png");
        icons = icons && r[0].equals("200") && r[1].equals("PNG:home-screen/apple-touch-icon.png");
        r = call("GET", "/favicon.ico");
        check("...the icons (and the browser's favicon)", icons && r[0].equals("200") && r[1].equals("PNG:home-screen/icon-192.png"), Arrays.toString(r));
        // The pages' own styles and scripts (assets/phone, menu, tv)
        r = call("GET", "/phone/phone.js");
        String[] css = call("GET", "/phone/phone.css");
        check("the phone page's script and styles, no PIN needed, with their types, never kept", r[0].equals("200") && r[1].equals("FILE:phone/phone.js")
            && r[2].startsWith("text/javascript") && r[3].equals("no-store") && css[0].equals("200") && css[2].startsWith("text/css"), Arrays.toString(r) + Arrays.toString(css));
        String n1 = call("GET", "/phone/other.js")[0], n2 = call("GET", "/phone/../menu/menu.js")[0], n3 = call("GET", "/phone/phone.js.map")[0];
        check("...only those: anything else 404", n1.equals("404") && n2.equals("404") && n3.equals("404"), n1 + n2 + n3);
        r = call("GET", "/menu/menu.js");
        check("the menu page's script on the phone page's server too", r[0].equals("200") && r[1].equals("FILE:menu/menu.js") && r[2].startsWith("text/javascript"), Arrays.toString(r));
        r = call("GET", "/tv/tv.js");
        String[] tf = call("GET", "/tv/fonts.css");
        check("the TV page's script and styles, for the box itself", r[0].equals("200") && r[1].equals("FILE:tv/tv.js") && tf[0].equals("200") && tf[2].startsWith("text/css"),
            Arrays.toString(r) + Arrays.toString(tf));
        String lanAddress = null;
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces()))
            for (InetAddress ad : Collections.list(ni.getInetAddresses())) if (ad instanceof Inet4Address && !ad.isLoopbackAddress()) lanAddress = ad.getHostAddress();
        if (lanAddress != null) {
            HttpURLConnection lc = (HttpURLConnection) new URL("http://" + lanAddress + ":" + port + "/tv/tv.js").openConnection();
            check("...and only for it: from the café network, 404", lc.getResponseCode() == 404, lc.getResponseCode());
        }
        u.stop(); port = keep4;
        r = call("GET", "/manifest.webmanifest");
        check("a TV with no icon files: 404", r[0].equals("404"), r[0]);
        r = call("GET", "/api/songs?pin=4821");
        check("...and no song list yet: 503", r[0].equals("503"), r[0]);

        System.out.println("\nThe café's menu: for customers with no PIN, for the phone with it");
        final List<String> menuSaves = Collections.synchronizedList(new ArrayList<>()), menuPics = Collections.synchronizedList(new ArrayList<>());
        final List<String> picAsks = Collections.synchronizedList(new ArrayList<>()), fontAsks = Collections.synchronizedList(new ArrayList<>());
        ControlServer w = new ControlServer(new ControlServer.Tv() {
            public String pin() { return "4821"; } public byte[] page() { return new byte[0]; } public String status() { return "{}"; }
            public boolean command(String x) { return true; } public String settings() { return "{}"; } public String saveSettings(String b, boolean a) { return "{}"; }
            public byte[] menuPage() { try { return "<!doctype html><title>مینیو</title>".getBytes("UTF-8"); } catch (Exception e) { return null; } }
            public String menuForCustomers() { return "{\"v\":3,\"name\":\"کافتریا\",\"categories\":[]}"; }
            public byte[] menuPicture(String id, boolean small) { picAsks.add(id + (small ? " small" : "")); return "abcd1234".equals(id) ? (small ? new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 2 } : jpeg) : null; }
            public byte[] asset(String name) { fontAsks.add(name); try { return name.equals("fonts/vazirmatn-arabic.woff2") ? "wOF2".getBytes("UTF-8") : null; } catch (Exception e) { return null; } }
            public String menu() { return "{\"v\":3,\"categories\":[{\"id\":\"seedhookah\",\"hidden\":true}]}"; }
            public String saveMenu(String b) { menuSaves.add(b); return b.contains("old") ? "{\"ok\":false,\"conflict\":true,\"message\":\"changed on another phone\"}"
                : b.contains("noname") ? "{\"ok\":false,\"message\":\"Every item needs a name\"}" : "{\"ok\":true,\"v\":4}"; }
            public String addMenuPicture(String b) { menuPics.add(b); return "{\"ok\":true,\"id\":\"newpic1\"}"; }
            public String menuNow() { return "{\"tint\":[215,0.6]}"; }
            public String menuModels() { return "{\"models\":[{\"name\":\"kunafa.glb\",\"size\":42}],\"base\":\"https://raw.githubusercontent.com/x/y/main/models/\"}"; }
        });
        int p5 = w.start(); int keep5 = port; port = p5;
        r = call("GET", "/menu/");
        check("the menu page, to anyone on the Wi-Fi: no PIN, UTF-8 HTML, checked again on each visit", r[0].equals("200") && r[1].contains("مینیو")
            && r[2].startsWith("text/html") && r[3].equals("no-cache"), Arrays.toString(r));
        try (Socket raw = new Socket("127.0.0.1", port)) {
            raw.getOutputStream().write("GET /menu HTTP/1.1\r\nHost: x\r\n\r\n".getBytes()); raw.setSoTimeout(3000);
            String resp = new String(readAll(raw.getInputStream()));
            check("/menu (typed without the slash): sent on to /menu/, where the page's own addresses work", resp.startsWith("HTTP/1.1 301") && resp.contains("\r\nLocation: /menu/\r\n"), resp);
        }
        r = call("GET", "/menu/data");
        check("the menu itself, as JSON, no PIN, never kept stale", r[0].equals("200") && r[1].contains("کافتریا") && r[2].startsWith("application/json") && r[3].equals("no-cache"), Arrays.toString(r));
        r = call("POST", "/menu/data", "{}");
        check("...nothing can be sent to it (405)", r[0].equals("405"), r[0]);
        r = call("GET", "/menu/now");
        check("the song's colour on the TV now, for the menu's glow: no PIN, never kept", r[0].equals("200") && r[1].equals("{\"tint\":[215,0.6]}")
            && r[2].startsWith("application/json") && r[3].equals("no-store"), Arrays.toString(r));
        r = call("GET", "/api/menu/models");
        String[] models = call("GET", "/api/menu/models?pin=4821");
        check("the 3D models on GitHub, for the phone's menu editor: only with the PIN", r[0].equals("401") && models[0].equals("200")
            && models[1].contains("kunafa.glb") && models[1].contains("raw.githubusercontent.com"), r[0] + " " + Arrays.toString(models));
        r = call("GET", "/menu/pics/abcd1234.jpg");
        String[] sm = call("GET", "/menu/pics/abcd1234.small.jpg");
        check("its pictures: JPEGs a phone keeps for good (a new picture gets a new address); the small copies too",
            r[0].equals("200") && r[2].equals("image/jpeg") && r[3].contains("immutable") && sm[0].equals("200") && sm[1].length() == 4
            && picAsks.equals(Arrays.asList("abcd1234", "abcd1234 small")), Arrays.toString(r) + picAsks);
        String q1 = call("GET", "/menu/pics/nothere1.jpg")[0], q2 = call("GET", "/menu/pics/..%2Fmenu.jpg")[0], q3 = call("GET", "/menu/pics/ABCD1234.jpg")[0],
               q4 = call("GET", "/menu/pics/abcd1234.png")[0];
        check("...an unknown one 404; odd names never even asked for", q1.equals("404") && q2.equals("404") && q3.equals("404") && q4.equals("404")
            && picAsks.size() == 3, q1 + q2 + q3 + q4 + picAsks);
        r = call("GET", "/menu/fonts/vazirmatn-arabic.woff2");
        String f2 = call("GET", "/menu/fonts/nothere.woff2")[0], f3 = call("GET", "/menu/fonts/..%2F..%2Fcontrol.html")[0];
        check("its letters: a font kept for a month; unknown ones 404, odd ones never asked for", r[0].equals("200") && r[2].equals("font/woff2") && r[3].contains("max-age=2592000")
            && f2.equals("404") && f3.equals("404") && fontAsks.equals(Arrays.asList("fonts/vazirmatn-arabic.woff2", "fonts/nothere.woff2")), Arrays.toString(r) + fontAsks);
        check("anything else under /menu: 404", call("GET", "/menu/../api/menu")[0].equals("404") && call("GET", "/menufoo")[0].equals("404"), "");
        r = call("GET", "/api/menu");
        check("the whole menu (hidden things too) only with the PIN", r[0].equals("401"), r[0]);
        r = call("GET", "/api/menu?pin=4821");
        check("...with it: the menu", r[0].equals("200") && r[1].contains("\"hidden\":true"), Arrays.toString(r));
        StringBuilder bigMenu = new StringBuilder("{\"base\":3,\"menu\":{\"categories\":[{\"name\":{\"en\":\"");
        for (int i = 0; i < 300000; i++) bigMenu.append('x');
        bigMenu.append("\"}}]}}");
        r = call("POST", "/api/menu?pin=4821", bigMenu.toString());
        check("saving: a menu of 300 KB is taken whole (menus may be big)", r[0].equals("200") && r[1].contains("\"v\":4") && menuSaves.size() == 1
            && menuSaves.get(0).length() == bigMenu.length(), r[0] + " " + menuSaves.size());
        r = call("POST", "/api/menu?pin=4821", "{\"base\":1,\"old\":1}");
        check("...changed on another phone in between: 409 with the reason", r[0].equals("409") && r[1].contains("another phone"), Arrays.toString(r));
        r = call("POST", "/api/menu?pin=4821", "{\"noname\":1}");
        check("...something wrong in it: 400 with the reason", r[0].equals("400") && r[1].contains("needs a name"), Arrays.toString(r));
        try { r = call("POST", "/api/menu?pin=1111", bigMenu.toString()); } catch (IOException e) { r = new String[] { "io", e.toString() }; }
        check("...a big one with a wrong PIN: refused, nothing read", (r[0].equals("401") || r[0].equals("io")) && menuSaves.size() == 3, Arrays.toString(r));
        call("GET", "/api/status?pin=4821");
        StringBuilder tooBig = new StringBuilder("{\"base\":3,\"x\":\"");
        for (int i = 0; i < (2 << 20) + 10; i++) tooBig.append('x');
        tooBig.append("\"}");
        try { r = call("POST", "/api/menu?pin=4821", tooBig.toString()); } catch (IOException e) { r = new String[] { "413", "" }; }
        check("...over 2 MB even with the PIN: refused (413)", r[0].equals("413") && menuSaves.size() == 3, r[0]);
        r = call("POST", "/api/menu/picture?pin=4821", pic.toString());
        check("a picture for the menu (1.5 MB): its id back", r[0].equals("200") && r[1].contains("newpic1") && menuPics.size() == 1 && menuPics.get(0).length() == pic.length(), r[0] + " " + r[1]);
        check("...only by POST, and only with the PIN", call("GET", "/api/menu/picture?pin=4821")[0].equals("405")
            && call("POST", "/api/menu/picture?pin=0000", "{}")[0].equals("401") && menuPics.size() == 1, "");
        call("GET", "/api/status?pin=4821");
        // Phones holding every connection open (customers on a slow Wi-Fi): the TV page's own check-in still goes through
        String lan = null;
        for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            for (InetAddress ad : Collections.list(ni.getInetAddresses())) if (ad instanceof Inet4Address && !ad.isLoopbackAddress()) lan = ad.getHostAddress();
        }
        if (lan != null) {
            List<Socket> hogs = new ArrayList<>();
            for (int i = 0; i < 8; i++) hogs.add(new Socket(lan, p5));
            Thread.sleep(300);
            long t0 = System.currentTimeMillis();
            r = call("GET", "/menu/data");
            long took = System.currentTimeMillis() - t0;
            check("8 phones holding connections open: the box's own requests still answered at once (" + took + " ms)", r[0].equals("200") && took < 1000, took);
            for (Socket h : hogs) h.close();
        } else {
            System.out.println("  (no network address here to act as a phone: the check of the box's own threads is skipped)");
        }

        System.out.println("\nThe customers' own server: the menu and nothing else");
        ControlServer cust = new ControlServer(new ControlServer.Tv() {
            public String pin() { return "4821"; } public byte[] page() { try { return "ADMIN PAGE".getBytes("UTF-8"); } catch (Exception e) { return null; } }
            public String status() { return "{\"tv\":\"TV 23\"}"; } public boolean command(String x) { menuSaves.add("CMD " + x); return true; }
            public String settings() { return "{}"; } public String saveSettings(String b, boolean a) { menuSaves.add("SETTINGS"); return "{}"; }
            public byte[] tvPage() { try { return "TV PAGE".getBytes("UTF-8"); } catch (Exception e) { return null; } }
            public byte[] menuPage() { try { return "<!doctype html><title>مینیو</title>".getBytes("UTF-8"); } catch (Exception e) { return null; } }
            public String menuForCustomers() { return "{\"v\":3,\"categories\":[]}"; }
            public byte[] asset(String name) { try { return name.endsWith(".png") ? ("PNG:" + name).getBytes("UTF-8") : null; } catch (Exception e) { return null; } }
            public String menu() { return "{\"hidden\":true}"; }
            public String saveMenu(String b) { menuSaves.add("SAVED ON THE CUSTOMERS' SERVER"); return "{\"ok\":true}"; }
        }, true);
        int pc = cust.start(8090, 8099);
        check("on a port of its own, from 8090", pc >= 8090 && pc <= 8099, pc);
        int keepC = port; port = pc;
        try (Socket raw = new Socket("127.0.0.1", port)) {
            raw.getOutputStream().write("GET / HTTP/1.1\r\nHost: x\r\n\r\n".getBytes()); raw.setSoTimeout(3000);
            String resp = new String(readAll(raw.getInputStream()));
            check("its / (the menu's address without /menu/): on to the menu, never the phone page", resp.startsWith("HTTP/1.1 301") && resp.contains("\r\nLocation: /menu/\r\n") && !resp.contains("ADMIN"), resp);
        }
        r = call("GET", "/menu/");
        String[] cd = call("GET", "/menu/data"), cn = call("GET", "/menu/now");
        check("the menu page, the menu and the TV's colour, as on the phone page's server (no colour without a song: {})", r[0].equals("200") && r[1].contains("مینیو")
            && cd[0].equals("200") && cd[1].contains("\"v\":3") && cn[0].equals("200") && cn[1].equals("{}"), r[0] + cd[0] + Arrays.toString(cn));
        int before = menuSaves.size();
        String a1 = call("GET", "/api/status?pin=4821")[0], a2 = call("GET", "/api/menu?pin=4821")[0], a3 = call("POST", "/api/menu?pin=4821", "{}")[0],
               a4 = call("POST", "/api/cmd?pin=4821&do=next")[0], a5 = call("GET", "/api/settings?pin=4821")[0], a6 = call("GET", "/index.html")[0],
               a7 = call("GET", "/api/menu/models?pin=4821")[0];
        check("nothing of the phone page, even with the right PIN: no status, menu changes, commands, settings or models (404)", a1.equals("404") && a2.equals("404") && a3.equals("404")
            && a4.equals("404") && a5.equals("404") && a7.equals("404") && menuSaves.size() == before, a1 + a2 + a3 + a4 + a5 + a6 + a7 + menuSaves);
        check("...nor the TV page, from the box itself", call("GET", "/tv/index.html?k=x")[0].equals("404"), "");
        r = call("GET", "/icon-192.png");
        check("its icon, for the browser's tab", r[0].equals("200") && r[1].equals("PNG:home-screen/icon-192.png"), Arrays.toString(r));
        r = call("GET", "/phone/phone.js");
        check("...but nothing of the phone page's, not even its script (404)", r[0].equals("404"), r[0]);
        cust.stop(); port = keepC;

        System.out.println("\nPhones that send slowly");
        check("a body may take 10 seconds, and about a second more for every 64 KB (9 MB: two and a half minutes)",
            ControlServer.bodyTime(0) == 10000 && ControlServer.bodyTime(64 * 1024) == 11024
            && ControlServer.bodyTime(ControlServer.MAX_PICTURE_BODY) > 150000 && ControlServer.bodyTime(ControlServer.MAX_PICTURE_BODY) < 160000,
            ControlServer.bodyTime(ControlServer.MAX_PICTURE_BODY));
        {   // a 1 MB menu from a phone on a weak Wi-Fi: 8 KB every 90 ms, about 12 seconds in all
            StringBuilder slowMenu = new StringBuilder("{\"v\":3,\"x\":\"");
            while (slowMenu.length() < (1 << 20) - 3) slowMenu.append('m');
            slowMenu.append("\"}");
            byte[] bb = slowMenu.toString().getBytes("UTF-8");
            int savesBefore = menuSaves.size();
            long t0 = System.currentTimeMillis();
            String resp;
            try (Socket raw = new Socket("127.0.0.1", p5)) {
                OutputStream o = raw.getOutputStream();
                o.write(("POST /api/menu?pin=4821 HTTP/1.1\r\nHost: x\r\nContent-Length: " + bb.length + "\r\n\r\n").getBytes("UTF-8"));
                for (int i = 0; i < bb.length; i += 8192) { o.write(bb, i, Math.min(8192, bb.length - i)); o.flush(); Thread.sleep(90); }
                raw.setSoTimeout(5000);
                resp = new String(readAll(raw.getInputStream()), "UTF-8");
            } catch (IOException e) { resp = "dropped: " + e; }
            long took = System.currentTimeMillis() - t0;
            check("a 1 MB menu sent slowly (" + took / 1000 + " s, more than a flat 10 seconds) still gets through",
                took > 10500 && resp.startsWith("HTTP/1.1 200") && menuSaves.size() == savesBefore + 1 && menuSaves.get(menuSaves.size() - 1).length() == bb.length,
                resp.length() > 200 ? resp.substring(0, 200) : resp);
        }
        {   // headers a byte a second, never ending: without a limit, one thread would be held for hours
            long t0 = System.currentTimeMillis();
            boolean cut = false;
            try (Socket raw = new Socket("127.0.0.1", p5)) {
                raw.setSoTimeout(1000);
                OutputStream o = raw.getOutputStream();
                o.write("GET /api/status?pin=4821 HTTP/1.1\r\n".getBytes("UTF-8"));
                while (!cut && System.currentTimeMillis() - t0 < 25000) {
                    try { o.write('X'); o.flush(); } catch (IOException e) { cut = true; break; }
                    try { if (raw.getInputStream().read() == -1) cut = true; } catch (SocketTimeoutException e) { /* still open */ } catch (IOException e) { cut = true; }
                }
            }
            long took = System.currentTimeMillis() - t0;
            check("a phone sending its headers a byte a second: let go of after 15 seconds (" + took / 1000 + " s)", cut && took >= 14000 && took < 18000, took);
        }
        w.stop(); port = keep5;

        System.out.println("\nSomeone guessing the PIN from one address after another");
        ControlServer g = new ControlServer(plainTv());
        g.guard.lockMillis = 2500;
        int pg = g.start(8100, 8119);
        check("a staff phone with the right PIN (known from now on)", raw("127.0.0.10", pg, "/api/status?pin=4821")[0].equals("200"), "");
        int wrong = 0;
        for (int i = 0; i < 9; i++) if (raw("127.0.0.11", pg, "/api/status?pin=0000")[0].equals("401")) wrong++;
        for (int i = 0; i < 9; i++) if (raw("127.0.0.12", pg, "/api/status?pin=1111")[0].equals("401")) wrong++;
        check("18 wrong PINs from two addresses (9 each, under each one's own limit): only wrong", wrong == 18 && g.guessing() == 0, wrong + " " + g.guessing());
        raw("127.0.0.13", pg, "/api/status?pin=2222");
        raw("127.0.0.13", pg, "/api/status?pin=3333");
        String[] fresh = raw("127.0.0.14", pg, "/api/status?pin=4821");
        check("the 20th wrong PIN in the hour: a phone new to the TV is kept out, even with the right PIN, and told why",
            fresh[0].equals("429") && fresh[1].contains("guessing the PIN"), Arrays.toString(fresh));
        check("...the staff's phone that already had the PIN carries on as before", raw("127.0.0.10", pg, "/api/status?pin=4821")[0].equals("200"), "");
        check("...and the phone page can say what's going on (20 wrong PINs in the last hour)", g.guessing() == 20, g.guessing());
        String[] other = raw("127.0.0.17", pg, "/api/pictures?pin=4821");
        check("...a new phone can't get round it with another kind of request either", other[0].equals("429"), Arrays.toString(other));
        Thread.sleep(2700);
        check("10 minutes after the last wrong one (here 2.5 seconds), new phones come in again", raw("127.0.0.14", pg, "/api/status?pin=4821")[0].equals("200")
            && g.guessing() == 0, g.guessing());
        String again = raw("127.0.0.15", pg, "/api/status?pin=4444")[0];
        check("...but one more wrong PIN within the hour and it starts again: a guess every 10 minutes, not thousands",
            again.equals("401") && raw("127.0.0.16", pg, "/api/status?pin=4821")[0].equals("429") && raw("127.0.0.14", pg, "/api/status?pin=4821")[0].equals("200"), again);
        g.stop();

        System.out.println("\nToo many connections at once");
        ControlServer o = new ControlServer(plainTv());
        int po = o.start(8120, 8139);
        List<Socket> held = new ArrayList<>();
        for (int i = 0; i < 2 + 32; i++) held.add(new Socket("127.0.0.1", po));        // the box's own 2 threads, and its 32 waiting
        Thread.sleep(400);
        String busy;
        try (Socket extra = new Socket("127.0.0.1", po)) {
            extra.setSoTimeout(3000);
            busy = new String(readAll(extra.getInputStream()), "UTF-8");
        }
        check("the box's own line full (2 working, 32 waiting): one more is told 'busy' (503) at once, instead of piling up",
            busy.startsWith("HTTP/1.1 503") && busy.contains("Retry-After: 5"), busy);
        for (Socket h : held) h.close();
        held.clear();
        if (lan != null) {
            for (int i = 0; i < 6 + ControlServer.QUEUE; i++) held.add(new Socket(lan, po));   // the phones' 6 threads, and their 128 waiting
            Thread.sleep(600);
            try (Socket extra = new Socket(lan, po)) {
                extra.setSoTimeout(3000);
                busy = new String(readAll(extra.getInputStream()), "UTF-8");
            }
            check("the phones' line full (6 working, 128 waiting): 'busy' for the next one", busy.startsWith("HTTP/1.1 503"), busy);
            for (Socket h : held) h.close();
            held.clear();
        }
        Thread.sleep(500);
        int keepP = port; port = po;
        String back = call("GET", "/api/status?pin=4821")[0];
        port = keepP;
        check("...and when those connections go, phones are answered again at once", back.equals("200"), back);
        o.stop();

        s.stop();
        allPassed();
    }
}
