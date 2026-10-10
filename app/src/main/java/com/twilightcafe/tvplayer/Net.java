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
            InputStream in = c.getInputStream();
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
        } finally {
            c.disconnect();
        }
    }

    /** This TV's address on the café network (Wi-Fi or cable), e.g. 192.168.1.23, or "" */
    static String localIp() {
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception e) {
            // no network yet
        }
        return "";
    }
}
