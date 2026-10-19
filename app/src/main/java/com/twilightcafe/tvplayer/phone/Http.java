package com.twilightcafe.tvplayer.phone;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.Map;

/**
 * The little of HTTP the app's web server needs: a request's lines and its query, and the replies. Every reply
 * closes its connection, says exactly what it is (nosniff), and by default is never kept by the browser and
 * sends no address on (no-referrer). Plain Java, so it can be tested on a computer.
 */
final class Http {

    static final Charset UTF8 = Charset.forName("UTF-8");
    static final Charset LATIN1 = Charset.forName("ISO-8859-1");

    private Http() {
    }

    /** One line of the request (up to 8 KB), without the line break; all of it by the deadline. */
    static String readLine(InputStream in, long deadline) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int ch;
        while ((ch = in.read()) != -1) {
            if (ch == '\n') break;
            if (ch != '\r') b.write(ch);
            if (b.size() > 8192) throw new IOException("line too long");
            if (System.currentTimeMillis() > deadline) throw new IOException("too slow");
        }
        if (ch == -1 && b.size() == 0) return null;
        return new String(b.toByteArray(), LATIN1);
    }

    /** "pin=1234&do=next" as {pin: 1234, do: next}; a broken pair is left out */
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

    static void send(OutputStream out, int code, String type, byte[] body) throws IOException {
        send(out, code, type, body, "no-referrer");
    }

    static void send(OutputStream out, int code, String type, byte[] body, String referrerPolicy) throws IOException {
        send(out, code, type, body, referrerPolicy, "no-store");
    }

    static void send(OutputStream out, int code, String type, byte[] body, String referrerPolicy, String cache) throws IOException {
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

    /** Plain text, for the few replies people may see in a browser ("Not found", "Use GET") */
    static void text(OutputStream out, int code, String text) throws IOException {
        send(out, code, "text/plain; charset=utf-8", text.getBytes(UTF8));
    }

    static void notFound(OutputStream out) throws IOException {
        text(out, 404, "Not found");
    }

    static void json(OutputStream out, int code, String body) throws IOException {
        send(out, code, "application/json; charset=utf-8", body.getBytes(UTF8));
    }

    static void redirect(OutputStream out, String to) throws IOException {
        String head = "HTTP/1.1 301 Moved Permanently\r\nLocation: " + to + "\r\nContent-Length: 0\r\nCache-Control: no-cache\r\n"
                + "Referrer-Policy: no-referrer\r\nConnection: close\r\n\r\n";
        out.write(head.getBytes(LATIN1));
        out.flush();
    }

    // Every thread busy and the queue full (a crowd at once, or connections opened on purpose to block the
    // server): a short "busy" instead of waiting connections piling up until the app runs out of them
    static void busy(Socket c) {
        try {
            c.getOutputStream().write("HTTP/1.1 503 Service Unavailable\r\nRetry-After: 5\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                    .getBytes(LATIN1));
        } catch (IOException e) {
            // gone already
        }
        try {
            c.close();
        } catch (IOException e) {
            // closed
        }
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
}
