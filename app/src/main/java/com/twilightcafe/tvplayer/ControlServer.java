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
 *                                   testmode, restart, forget, checkupdate
 *   GET  /api/settings?pin=1234     the settings: built-in, from settings.json, and this TV's own
 *   POST /api/settings?pin=1234     this TV's own settings (JSON body); &all=1 also on the other TVs
 *
 * Everything under /api needs the TV's PIN. Ten wrong PINs from one phone lock it
 * out for 10 minutes, so customers on the café Wi-Fi can't guess their way in.
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
    }

    static final int MAX_BODY = 64 * 1024;

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Charset LATIN1 = Charset.forName("ISO-8859-1");

    private final Tv tv;
    private final Map<String, Integer> fails = new HashMap<>();
    private final Map<String, Long> lockedUntil = new HashMap<>();
    private ServerSocket socket;
    private ExecutorService pool;
    private volatile boolean running;
    private volatile int port;
    long lockMillis = 10 * 60 * 1000L;
    int maxFails = 10;

    ControlServer(Tv tv) {
        this.tv = tv;
    }

    int port() {
        return port;
    }

    /** Starts on the first free port from 8080 to 8090. Returns the port, or 0 if none was free. */
    synchronized int start() {
        if (running) return port;
        for (int p = 8080; p <= 8090 && socket == null; p++) {
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
        pool = Executors.newFixedThreadPool(4);
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
    }

    private void acceptLoop() {
        while (running) {
            try {
                final Socket c = socket.accept();
                c.setSoTimeout(8000);
                try {
                    pool.execute(new Runnable() {
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
            if (length < 0 || length > MAX_BODY) {
                send(out, 413, "text/plain; charset=utf-8", "Too big".getBytes(UTF8));
                return;
            }
            byte[] body = new byte[length];
            int got = 0;
            while (got < length) {
                int n = in.read(body, got, length - got);
                if (n < 0) break;
                got += n;
            }
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
            respond(out, method, path, parseQuery(query), c.getInetAddress().getHostAddress(), new String(body, 0, got, UTF8));
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

    void respond(OutputStream out, String method, String path, Map<String, String> params, String ip, String body) throws IOException {
        if (path.equals("/") || path.equals("/index.html")) {
            send(out, 200, "text/html; charset=utf-8", tv.page());
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
        } else {
            json(out, 404, "{\"error\":\"not found\"}");
        }
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

    private static void json(OutputStream out, int code, String body) throws IOException {
        send(out, code, "application/json; charset=utf-8", body.getBytes(UTF8));
    }

    private static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        if (body == null) body = new byte[0];
        String head = "HTTP/1.1 " + code + " " + reason(code) + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "X-Content-Type-Options: nosniff\r\n"
                + "Referrer-Policy: no-referrer\r\n"
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
            case 404: return "Not Found";
            case 405: return "Method Not Allowed";
            case 413: return "Payload Too Large";
            case 429: return "Too Many Requests";
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
