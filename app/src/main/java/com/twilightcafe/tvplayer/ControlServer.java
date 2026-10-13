package com.twilightcafe.tvplayer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/**
 * A tiny web server on the café network, for the phone control page.
 *
 *   GET  /                          the control page
 *   GET  /api/status?pin=1234       what the TV is doing (JSON)
 *   POST /api/cmd?pin=1234&do=next  next, pause, resume, vol+, vol-, zoom+, zoom-, tvvol+, tvvol-, identify, update,
 *                                   testmode, restart, forget, checkupdate, unfreeze, otherapp (My TV Plus),
 *                                   backhome (Twilight TV back on screen), unlock (the box free for 15 minutes), lock
 *   GET  /api/settings?pin=1234     the settings: built-in, from settings.json, and this TV's own
 *   POST /api/settings?pin=1234     this TV's own settings (JSON body); &all=1 also on the other TVs
 *   GET  /api/songs?pin=1234        the playlist's songs with their names, to choose one
 *   GET  /api/pictures?pin=1234     the café's pictures; POST adds one (JSON body), POST &delete=id deletes one
 *   GET  /api/picture?pin=1234&id=x one picture (&size=small: its small copy)
 *   GET  /api/looks?pin=1234        the café screen's pictures: which are the café's own; POST &name=cafe puts
 *                                   one in (JSON body), POST &name=cafe&reset=1 goes back to the built-in one;
 *                                   &all=1 also on the other TVs
 *   GET  /api/look?pin=1234&name=x  the café screen's picture in use (&size=small: its small copy)
 *   GET  /api/menu?pin=1234         the café's menu, hidden things too; POST saves it (JSON body: the whole
 *                                   menu and the version it was changed from)
 *   POST /api/menu/picture?pin=1234 a picture for the menu (JSON body); back comes its id
 *   GET  /manifest.webmanifest, /icon-192.png, /icon-512.png, /apple-touch-icon.png
 *                                   so the phone page can go on a phone's home screen with its icon
 *
 * For customers, with no PIN: the menu code on the TV leads to a second server, on a port of its own (8090),
 * that has nothing but these (and sends / on to /menu/), so the phone page's address is never shown to them.
 * The phone page's own server has them too, for its pictures and "See it as customers do".
 *   GET  /menu/                     the menu page (/menu goes there: the page's own addresses are relative to it)
 *   GET  /menu/data                 the menu, without what's hidden (JSON)
 *   GET  /menu/pics/<id>.jpg        its pictures (<id>.small.jpg: the small copies)
 *   GET  /menu/fonts/<name>.woff2   its letters (assets/fonts)
 *
 * And for the TV box itself only (the app shows the TV page from here, at http://localhost):
 *   GET  /tv/index.html?k=key       the TV page
 *   POST /tv/sync?k=key             the TV page's check-in every second (JSON both ways)
 *   GET  /tv/pictures/<id>.jpg      the café's pictures, for between songs
 *   GET  /tv/looks/<name>.jpg       the café screen's own pictures, built into the app (assets/looks)
 *
 * Everything under /api needs the TV's PIN. Ten wrong PINs from one phone lock it
 * out for 10 minutes, so customers on the café Wi-Fi can't guess their way in. The box's
 * own requests (the TV page) have threads of their own, so customers reading the menu
 * never hold up the TV.
 * Plain Java only (no Android classes), so it can be tested on a computer.
 */
final class ControlServer {

    interface Tv {
        String pin();
        byte[] page();
        String status();
        boolean command(String what);
        String settings();
        /** Saves this TV's own settings from the phone (JSON body); null when the body is wrong. */
        String saveSettings(String body, boolean all);

        /** The TV page, for the box's own engine to show (null: the app shows it another way). */
        default byte[] tvPage() {
            return null;
        }

        /** The TV page's check-in: what it did, and back what it should do. Null when the key is wrong. */
        default String tvSync(String key, String body) {
            return null;
        }

        /** The playlist's songs with their names (JSON), for choosing one on the phone. */
        default String songs() {
            return null;
        }

        /** The café's pictures (JSON list). */
        default String pictures() {
            return null;
        }

        /** Adds a picture (JSON body with base64 JPEGs). Returns JSON: {"ok":true,"id":...} or {"ok":false,"message":...}. */
        default String addPicture(String body) {
            return null;
        }

        default boolean deletePicture(String id) {
            return false;
        }

        /** One picture as a JPEG (small: its small copy), or null. */
        default byte[] picture(String id, boolean small) {
            return null;
        }

        /** The files for the phone's home-screen icon (manifest.webmanifest, icon-192.png, ...), or null. */
        default byte[] asset(String name) {
            return null;
        }

        /** One of the café screen's pictures for the TV page: the café's own, else the built-in one (assets/looks), or null. */
        default byte[] look(String name) {
            return null;
        }

        /** The café screen's pictures for the phone: which are the café's own (JSON). */
        default String looks() {
            return null;
        }

        /** Puts the café's own picture in for one of them (JSON body with base64 JPEGs); all: on the other TVs too. JSON. */
        default String setLook(String name, String body, boolean all) {
            return null;
        }

        /** Back to the built-in picture; all: on the other TVs too. JSON. */
        default String resetLook(String name, boolean all) {
            return null;
        }

        /** The picture in use for one of them, for the phone (small: its small copy), or null. */
        default byte[] lookForPhone(String name, boolean small) {
            return null;
        }

        /** The customers' menu page (assets/menu.html), or null. */
        default byte[] menuPage() {
            return null;
        }

        /** The menu for customers, without what's hidden (JSON), or null. */
        default String menuForCustomers() {
            return null;
        }

        /** One of the menu's pictures (small: its small copy), or null. */
        default byte[] menuPicture(String id, boolean small) {
            return null;
        }

        /** The whole menu for the phone, hidden things too (JSON), or null. */
        default String menu() {
            return null;
        }

        /**
         * Saves the menu from the phone (JSON body). JSON back: {"ok":true,...}; {"ok":false,"conflict":true,...}
         * when another phone changed it in between; {"ok":false,"message":...}.
         */
        default String saveMenu(String body) {
            return null;
        }

        /** Keeps a picture for the menu (JSON body with base64 JPEGs). JSON: {"ok":true,"id":...} or {"ok":false,"message":...}. */
        default String addMenuPicture(String body) {
            return null;
        }
    }

    static final int MAX_BODY = 64 * 1024;
    static final int MAX_PICTURE_BODY = 9 << 20;          // a picture from the phone, as text (base64)
    static final int MAX_MENU_BODY = 2 << 20;             // the whole menu from the phone

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Charset LATIN1 = Charset.forName("ISO-8859-1");

    private final Tv tv;
    private final boolean menuOnly;                       // the customers' server: the menu and nothing else
    private final Map<String, Integer> fails = new HashMap<>();
    private final Map<String, Long> lockedUntil = new HashMap<>();
    private ServerSocket socket;
    private ExecutorService pool, boxPool;
    private volatile boolean running;
    private volatile int port;
    long lockMillis = 10 * 60 * 1000L;
    int maxFails = 10;

    ControlServer(Tv tv) {
        this(tv, false);
    }

    ControlServer(Tv tv, boolean menuOnly) {
        this.tv = tv;
        this.menuOnly = menuOnly;
    }

    int port() {
        return port;
    }

    /** Starts on the first free port from 8080 to 8089. Returns the port, or 0 if none was free. */
    synchronized int start() {
        return start(8080, 8089);
    }

    /** Starts on the first free port from..to. Returns the port, or 0 if none was free. */
    synchronized int start(int from, int to) {
        if (running) return port;
        for (int p = from; p <= to && socket == null; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(p));
                socket = s;
                port = p;
            } catch (IOException e) {
                // taken: try the next one
            }
        }
        if (socket == null) return 0;
        running = true;
        pool = Executors.newFixedThreadPool(6);
        boxPool = Executors.newFixedThreadPool(2);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                acceptLoop();
            }
        }, "phone-control");
        t.setDaemon(true);
        t.start();
        return port;
    }

    synchronized void stop() {
        running = false;
        try {
            if (socket != null) socket.close();
        } catch (IOException e) {
            // closing anyway
        }
        socket = null;
        if (pool != null) pool.shutdownNow();
        if (boxPool != null) boxPool.shutdownNow();
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket c = socket.accept();
                c.setSoTimeout(8000);
                // the box's own (the TV page's check-in every second) apart from the phones'
                ExecutorService p = isLoopback(c.getInetAddress().getHostAddress()) ? boxPool : pool;
                try {
                    p.execute(new Runnable() {
                        @Override
                        public void run() {
                            handle(c);
                        }
                    });
                } catch (RejectedExecutionException e) {
                    c.close();
                }
            } catch (IOException e) {
                if (!running) return;
            }
        }
    }

    private void handle(Socket c) {
        try {
            InputStream in = c.getInputStream();
            OutputStream out = c.getOutputStream();
            String request = readLine(in);
            if (request == null || request.isEmpty()) return;
            String[] parts = request.split(" ");
            if (parts.length < 2) {
                send(out, 400, "text/plain; charset=utf-8", "Bad request".getBytes(UTF8));
                return;
            }
            String method = parts[0], target = parts[1], path = target, query = "";
            int q = target.indexOf('?');
            if (q >= 0) {
                path = target.substring(0, q);
                query = target.substring(q + 1);
            }
            Map<String, String> params = parseQuery(query);
            String ip = c.getInetAddress().getHostAddress();
            int length = 0;
            for (int i = 0; i < 100; i++) {                    // headers: only the body's length matters
                String h = readLine(in);
                if (h == null || h.isEmpty()) break;
                int colon = h.indexOf(':');
                if (colon > 0 && h.substring(0, colon).trim().equalsIgnoreCase("Content-Length")) {
                    try {
                        length = Integer.parseInt(h.substring(colon + 1).trim());
                    } catch (NumberFormatException e) {
                        length = -1;
                    }
                }
            }
            // Only a picture or the menu from a phone with the right PIN may be big
            boolean picture = method.equals("POST") && (path.equals("/api/pictures") || path.equals("/api/looks") || path.equals("/api/menu/picture"));
            boolean big = picture || (method.equals("POST") && path.equals("/api/menu"));
            int limit = big && pinOk(params, ip) ? (picture ? MAX_PICTURE_BODY : MAX_MENU_BODY) : MAX_BODY;
            if (length < 0 || length > limit) {
                if (big && limit == MAX_BODY) respond(out, method, path, params, ip, "");   // wrong PIN or locked: say so
                else send(out, 413, "text/plain; charset=utf-8", "Too big".getBytes(UTF8));
                return;
            }
            byte[] body = new byte[length];
            int got = 0;
            while (got < length) {
                int n = in.read(body, got, length - got);
                if (n < 0) break;
                got += n;
            }
            respond(out, method, path, params, ip, new String(body, 0, got, UTF8));
        } catch (IOException | RuntimeException e) {
            // the phone went away
        } finally {
            try {
                c.close();
            } catch (IOException e) {
                // closed
            }
        }
    }

    private boolean pinOk(Map<String, String> params, String ip) {
        String pin = tv.pin();
        return pin != null && !pin.isEmpty() && pin.equals(params.get("pin")) && !isLocked(ip);
    }

    void respond(OutputStream out, String method, String path, Map<String, String> params, String ip, String body) throws IOException {
        if (menuOnly) {                                        // customers: the menu, its icon, and that's all
            if (path.equals("/") || path.equals("/index.html")) {
                redirect(out, "/menu/");
            } else if (path.equals("/menu") || path.startsWith("/menu/")) {
                menuRequest(out, method, path);
            } else if (ASSETS.containsKey(path) && ASSETS.get(path).endsWith(".png")) {
                byte[] b = tv.asset(ASSETS.get(path));
                if (b == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
                else send(out, 200, "image/png", b, "no-referrer", "public, max-age=86400");
            } else {
                send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            }
            return;
        }
        if (path.startsWith("/tv/")) {
            tvRequest(out, method, path, params, ip, body);
            return;
        }
        if (path.equals("/") || path.equals("/index.html")) {
            send(out, 200, "text/html; charset=utf-8", tv.page());
            return;
        }
        String asset = ASSETS.get(path);
        if (asset != null) {                                   // the home-screen icon: no PIN, nothing private in it
            byte[] b = tv.asset(asset);
            if (b == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            else send(out, 200, asset.endsWith(".png") ? "image/png" : "application/manifest+json; charset=utf-8", b,
                    "no-referrer", "public, max-age=86400");
            return;
        }
        if (path.equals("/menu") || path.startsWith("/menu/")) {
            menuRequest(out, method, path);
            return;
        }
        if (!path.startsWith("/api/")) {
            send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            return;
        }
        if (isLocked(ip)) {
            json(out, 429, "{\"error\":\"locked\",\"message\":\"Too many wrong PINs. Try again in 10 minutes.\"}");
            return;
        }
        String pin = tv.pin();
        if (pin == null || pin.isEmpty() || !pin.equals(params.get("pin"))) {
            wrongPin(ip);
            json(out, 401, "{\"error\":\"pin\",\"message\":\"Wrong PIN.\"}");
            return;
        }
        rightPin(ip);
        if (path.equals("/api/status")) {
            String s = tv.status();
            json(out, 200, s == null ? "{}" : s);
        } else if (path.equals("/api/cmd")) {
            if (!method.equals("POST")) {
                json(out, 405, "{\"error\":\"use POST\"}");
                return;
            }
            String what = params.get("do");
            boolean ok = what != null && tv.command(what);
            json(out, ok ? 200 : 400, "{\"ok\":" + ok + "}");
        } else if (path.equals("/api/settings")) {
            if (method.equals("GET")) {
                String s = tv.settings();
                json(out, 200, s == null ? "{}" : s);
            } else if (method.equals("POST")) {
                String r = tv.saveSettings(body, "1".equals(params.get("all")));
                if (r == null) json(out, 400, "{\"error\":\"settings\",\"message\":\"Those settings couldn't be read.\"}");
                else json(out, 200, r);
            } else {
                json(out, 405, "{\"error\":\"use GET or POST\"}");
            }
        } else if (path.equals("/api/songs")) {
            String s = tv.songs();
            json(out, s == null ? 503 : 200, s == null ? "{\"error\":\"not ready\"}" : s);
        } else if (path.equals("/api/pictures")) {
            if (method.equals("GET")) {
                String s = tv.pictures();
                json(out, s == null ? 503 : 200, s == null ? "{\"error\":\"not ready\"}" : s);
            } else if (method.equals("POST")) {
                String gone = params.get("delete");
                if (gone != null) {
                    boolean ok = tv.deletePicture(gone);
                    json(out, ok ? 200 : 404, "{\"ok\":" + ok + "}");
                } else {
                    String r = tv.addPicture(body);
                    if (r == null) json(out, 503, "{\"ok\":false,\"message\":\"The TV can't take pictures right now.\"}");
                    else json(out, r.contains("\"ok\":true") ? 200 : 400, r);
                }
            } else {
                json(out, 405, "{\"error\":\"use GET or POST\"}");
            }
        } else if (path.equals("/api/picture")) {
            byte[] b = tv.picture(params.get("id"), "small".equals(params.get("size")));
            if (b == null) json(out, 404, "{\"error\":\"not found\"}");
            else send(out, 200, "image/jpeg", b, "no-referrer", "private, max-age=604800");   // a picture never changes
        } else if (path.equals("/api/looks")) {
            if (method.equals("GET")) {
                String s = tv.looks();
                json(out, s == null ? 503 : 200, s == null ? "{\"error\":\"not ready\"}" : s);
            } else if (method.equals("POST")) {
                String name = params.get("name");
                boolean all = "1".equals(params.get("all"));
                String r = "1".equals(params.get("reset")) ? tv.resetLook(name, all) : tv.setLook(name, body, all);
                if (r == null) json(out, 503, "{\"ok\":false,\"message\":\"The TV can't take pictures right now.\"}");
                else json(out, r.contains("\"ok\":true") ? 200 : 400, r);
            } else {
                json(out, 405, "{\"error\":\"use GET or POST\"}");
            }
        } else if (path.equals("/api/look")) {
            byte[] b = tv.lookForPhone(params.get("name"), "small".equals(params.get("size")));
            if (b == null) json(out, 404, "{\"error\":\"not found\"}");
            else send(out, 200, "image/jpeg", b, "no-referrer", "no-cache");                   // it may be changed
        } else if (path.equals("/api/menu")) {
            if (method.equals("GET")) {
                String m = tv.menu();
                json(out, m == null ? 503 : 200, m == null ? "{\"error\":\"not ready\"}" : m);
            } else if (method.equals("POST")) {
                String r = tv.saveMenu(body);
                if (r == null) json(out, 503, "{\"ok\":false,\"message\":\"The TV can't save the menu right now.\"}");
                else json(out, r.contains("\"ok\":true") ? 200 : r.contains("\"conflict\":true") ? 409 : 400, r);
            } else {
                json(out, 405, "{\"error\":\"use GET or POST\"}");
            }
        } else if (path.equals("/api/menu/picture")) {
            if (!method.equals("POST")) {
                json(out, 405, "{\"error\":\"use POST\"}");
                return;
            }
            String r = tv.addMenuPicture(body);
            if (r == null) json(out, 503, "{\"ok\":false,\"message\":\"The TV can't take pictures right now.\"}");
            else json(out, r.contains("\"ok\":true") ? 200 : 400, r);
        } else {
            json(out, 404, "{\"error\":\"not found\"}");
        }
    }

    // The menu for customers: open to anyone on the café Wi-Fi, nothing to change, nothing private in it
    private void menuRequest(OutputStream out, String method, String path) throws IOException {
        if (!method.equals("GET")) {
            send(out, 405, "text/plain; charset=utf-8", "Use GET".getBytes(UTF8));
            return;
        }
        if (path.equals("/menu")) {
            redirect(out, "/menu/");
        } else if (path.equals("/menu/")) {
            byte[] page = tv.menuPage();
            if (page == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            else send(out, 200, "text/html; charset=utf-8", page, "no-referrer", "no-cache");
        } else if (path.equals("/menu/data")) {
            String m = tv.menuForCustomers();
            if (m == null) json(out, 503, "{\"error\":\"not ready\"}");
            else send(out, 200, "application/json; charset=utf-8", m.getBytes(UTF8), "no-referrer", "no-cache");
        } else if (path.matches("/menu/pics/[a-z0-9]{4,24}(\\.small)?\\.jpg")) {
            String name = path.substring("/menu/pics/".length(), path.length() - 4);
            boolean small = name.endsWith(".small");
            byte[] b = tv.menuPicture(small ? name.substring(0, name.length() - 6) : name, small);
            if (b == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            // a picture never changes: a new one gets a new id
            else send(out, 200, "image/jpeg", b, "no-referrer", "public, max-age=31536000, immutable");
        } else if (path.matches("/menu/fonts/[a-z0-9-]{1,40}\\.woff2")) {
            byte[] b = tv.asset("fonts/" + path.substring("/menu/fonts/".length()));
            if (b == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            else send(out, 200, "font/woff2", b, "no-referrer", "public, max-age=2592000");
        } else {
            send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
        }
    }

    // The home-screen icon's files, by address
    private static final Map<String, String> ASSETS = new HashMap<>();

    static {
        ASSETS.put("/manifest.webmanifest", "manifest.webmanifest");
        ASSETS.put("/icon-192.png", "icon-192.png");
        ASSETS.put("/icon-512.png", "icon-512.png");
        ASSETS.put("/apple-touch-icon.png", "apple-touch-icon.png");
        ASSETS.put("/apple-touch-icon-precomposed.png", "apple-touch-icon.png");
        ASSETS.put("/favicon.ico", "icon-192.png");
    }

    // The TV page and its check-in: only for the box itself, never for the café network
    private void tvRequest(OutputStream out, String method, String path, Map<String, String> params, String ip, String body) throws IOException {
        if (!isLoopback(ip)) {
            send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            return;
        }
        if (path.equals("/tv/index.html") && method.equals("GET")) {
            byte[] page = tv.tvPage();
            if (page == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            // YouTube needs to see which page its player is on, so this one does send its address
            else send(out, 200, "text/html; charset=utf-8", page, "strict-origin-when-cross-origin");
        } else if (path.equals("/tv/sync") && method.equals("POST")) {
            String r = tv.tvSync(params.get("k"), body);
            if (r == null) json(out, 403, "{\"error\":\"key\"}");
            else json(out, 200, r);
        } else if (path.matches("/tv/looks/[a-z]{1,20}\\.jpg") && method.equals("GET")) {
            byte[] b = tv.look(path.substring("/tv/looks/".length(), path.length() - 4));
            if (b == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            // checked again each time the page loads: a new version of the app may bring new ones
            else send(out, 200, "image/jpeg", b, "no-referrer", "no-cache");
        } else if (path.startsWith("/tv/pictures/") && path.endsWith(".jpg") && method.equals("GET")) {
            String id = path.substring("/tv/pictures/".length(), path.length() - 4);
            byte[] b = tv.picture(id, false);
            if (b == null) send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
            else send(out, 200, "image/jpeg", b, "no-referrer", "private, max-age=604800");
        } else {
            send(out, 404, "text/plain; charset=utf-8", "Not found".getBytes(UTF8));
        }
    }

    static boolean isLoopback(String ip) {
        return ip != null && (ip.startsWith("127.") || ip.equals("::1") || ip.equals("0:0:0:0:0:0:0:1")
                || ip.startsWith("::ffff:127."));
    }

    private synchronized boolean isLocked(String ip) {
        Long until = lockedUntil.get(ip);
        if (until == null) return false;
        if (System.currentTimeMillis() < until) return true;
        lockedUntil.remove(ip);
        return false;
    }

    private synchronized void wrongPin(String ip) {
        Integer n = fails.get(ip);
        n = n == null ? 1 : n + 1;
        if (n >= maxFails) {
            fails.remove(ip);
            lockedUntil.put(ip, System.currentTimeMillis() + lockMillis);
        } else {
            fails.put(ip, n);
        }
    }

    private synchronized void rightPin(String ip) {
        fails.remove(ip);
    }

    private static void redirect(OutputStream out, String to) throws IOException {
        String head = "HTTP/1.1 301 Moved Permanently\r\nLocation: " + to + "\r\nContent-Length: 0\r\nCache-Control: no-cache\r\n"
                + "Referrer-Policy: no-referrer\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(LATIN1));
        out.flush();
    }

    private static void json(OutputStream out, int code, String body) throws IOException {
        send(out, code, "application/json; charset=utf-8", body.getBytes(UTF8));
    }

    private static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        send(out, code, type, body, "no-referrer");
    }

    private static void send(OutputStream out, int code, String type, byte[] body, String referrerPolicy) throws IOException {
        send(out, code, type, body, referrerPolicy, "no-store");
    }

    private static void send(OutputStream out, int code, String type, byte[] body, String referrerPolicy, String cache) throws IOException {
        if (body == null) body = new byte[0];
        String head = "HTTP/1.1 " + code + " " + reason(code) + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: " + cache + "\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Referrer-Policy: " + referrerPolicy + "\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(LATIN1));
        out.write(body);
        out.flush();
    }

    private static String reason(int code) {
        switch (code) {
            case 200: return "OK";
            case 400: return "Bad Request";
            case 401: return "Unauthorized";
            case 403: return "Forbidden";
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 409: return "Conflict";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
            case 503: return "Service Unavailable";
            default: return "Error";
        }
    }

    /** One line of the request (up to 8 KB), without the line break. */
    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int ch;
        while ((ch = in.read()) != -1) {
            if (ch == '\n') break;
            if (ch != '\r') b.write(ch);
            if (b.size() > 8192) throw new IOException("line too long");
        }
        if (ch == -1 && b.size() == 0) return null;
        return new String(b.toByteArray(), LATIN1);
    }

    static Map<String, String> parseQuery(String q) {
        Map<String, String> m = new HashMap<>();
        if (q == null || q.isEmpty()) return m;
        for (String pair : q.split("&")) {
            int eq = pair.indexOf('=');
            String k = eq < 0 ? pair : pair.substring(0, eq);
            String v = eq < 0 ? "" : pair.substring(eq + 1);
            try {
                m.put(URLDecoder.decode(k, "UTF-8"), URLDecoder.decode(v, "UTF-8"));
            } catch (UnsupportedEncodingException | IllegalArgumentException e) {
                // skip a broken pair
            }
        }
        return m;
    }
}
