package com.twilightcafe.tvplayer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Collections;
import java.util.List;

/** Small internet and network helpers. */
final class Net {
    private Net() {
    }

    /** The text at an https address, or null if it isn't there (404). Throws when the internet fails. */
    static String get(String url, int timeoutMs) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "TwilightTV-app");     // GitHub asks every visitor for a name
        c.setRequestProperty("Accept", "application/vnd.github+json, application/json, text/plain");
        try {
            int code = c.getResponseCode();
            if (code == 404) return null;
            if (code != 200) throw new IOException("HTTP " + code);
            return read(c.getInputStream());
        } finally {
            c.disconnect();
        }
    }

    /** One answer from a web server: its code, its text (only for 200), and the headers that say when to ask again. */
    static final class Reply {
        final int code;
        final String body;
        final long expires;              // from the Expires header, 0 if none
        final String lastModified;       // the Last-Modified header, exactly as sent (null if none)

        Reply(int code, String body, long expires, String lastModified) {
            this.code = code;
            this.body = body;
            this.expires = expires;
            this.lastModified = lastModified;
        }
    }

    /** Asks with our own name (some services want to know who asks) and, if given, "only if changed since". */
    static Reply fetch(String url, int timeoutMs, String userAgent, String ifModifiedSince) throws IOException {
        return fetch(url, timeoutMs, userAgent, ifModifiedSince, "application/json");
    }

    /** The same, for a web page (accept = "text/html") or anything else. */
    static Reply fetch(String url, int timeoutMs, String userAgent, String ifModifiedSince, String accept) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs);
        c.setReadTimeout(timeoutMs);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", userAgent);
        c.setRequestProperty("Accept", accept);
        if (ifModifiedSince != null && !ifModifiedSince.isEmpty()) c.setRequestProperty("If-Modified-Since", ifModifiedSince);
        try {
            int code = c.getResponseCode();
            String body = code == 200 ? read(c.getInputStream()) : null;
            return new Reply(code, body, c.getExpiration(), c.getHeaderField("Last-Modified"));
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) {
                b.write(buf, 0, n);
                if (b.size() > (2 << 20)) throw new IOException("too big");
            }
            return new String(b.toByteArray(), "UTF-8");
        } finally {
            in.close();
        }
    }

    /** This TV's address on the café network (Wi-Fi or cable), e.g. 192.168.1.23, or "" */
    static String localIp() {
        try {
            return findLocalIp(Collections.list(NetworkInterface.getNetworkInterfaces()));
        } catch (Exception e) {
            // no network yet
        }
        return "";
    }

    /** The first café-network address among these network cards, or "" (on its own, so it can be tested) */
    static String findLocalIp(List<NetworkInterface> interfaces) {
        try {
            for (NetworkInterface ni : interfaces) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception e) {
            // a card that went away while being read
        }
        return "";
    }
}
