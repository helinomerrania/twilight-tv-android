package com.twilightcafe.tvplayer.update;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.twilightcafe.tvplayer.InstallResult;
import com.twilightcafe.tvplayer.util.Net;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Updates from GitHub. Every few hours the app looks at the repository's latest
 * release; a newer build is downloaded and waits. It's only installed when someone
 * presses "Install update" on the phone page: Android then asks on the TV, and
 * staff press Install with the remote. Nothing ever pops up on its own.
 *
 * Releases are tagged with the app's version number ("build-100016-1"). Since the app
 * brought its own engine, those start at 100000; people see the build number (16).
 */
public final class Updater {

    static final int ENGINE_BUILDS = 100000;

    private static final String APK = "twilight-tv.apk";
    static final long MAX_APK = 300L << 20;  // the app is about 90 MB: anything near this isn't it

    private final Context ctx;
    private final SharedPreferences prefs;
    private final String repo;
    private final int myBuild;
    private volatile boolean busy;
    public volatile int readyBuild;                 // a newer build waiting to be installed (0 = none)
    public volatile String status = "not checked yet";

    public Updater(Context c, String repo, int myBuild) {
        this.ctx = c.getApplicationContext();
        this.prefs = c.getSharedPreferences("update", Context.MODE_PRIVATE);
        this.repo = repo == null ? "" : repo;
        this.myBuild = myBuild;
        int waiting = prefs.getInt("build", 0);
        if (waiting > myBuild && sessionAlive(prefs.getInt("session", -1))) {
            readyBuild = waiting;
            status = "build " + shown(waiting) + " is ready to install";
        }
    }

    // The number people see: 100016 is build 16
    public static int shown(int build) {
        return build > ENGINE_BUILDS ? build - ENGINE_BUILDS : build;
    }

    /** Looks for a newer build and downloads it (background thread). */
    public void check() {
        if (repo.isEmpty() || busy) return;
        busy = true;
        try {
            String body = Net.get("https://api.github.com/repos/" + repo + "/releases/latest", 20000);
            if (body == null) {
                status = "no builds on GitHub yet";
                return;
            }
            JSONObject release = new JSONObject(body);
            int build = buildNumber(release.optString("tag_name"));
            if (build <= myBuild) {
                status = "up to date (build " + shown(myBuild) + ")";
                return;
            }
            if (build == readyBuild && sessionAlive(prefs.getInt("session", -1))) {
                status = "build " + shown(build) + " is ready to install";
                return;
            }
            String url = null;
            long size = -1;
            JSONArray assets = release.optJSONArray("assets");
            for (int i = 0; assets != null && i < assets.length(); i++) {
                JSONObject a = assets.optJSONObject(i);
                if (a != null && APK.equals(a.optString("name"))) {
                    url = a.optString("browser_download_url");
                    size = a.optLong("size", -1);
                }
            }
            if (url == null || url.isEmpty()) {
                status = "build " + shown(build) + " has no app file";
                return;
            }
            if (size > MAX_APK) {
                status = "build " + shown(build) + "'s app file is " + (size >> 20) + " MB, far bigger than the app, so it wasn't downloaded";
                return;
            }
            status = "downloading build " + shown(build);
            int session;
            try {
                session = download(url, size);
            } catch (IOException e) {
                status = "build " + shown(build) + " didn't download whole (" + e.getMessage() + "); it's tried again at the next check";
                return;
            }
            prefs.edit().putInt("session", session).putInt("build", build).apply();
            readyBuild = build;
            status = "build " + shown(build) + " is ready to install";
        } catch (Exception e) {
            status = "couldn't check for updates (" + e.getClass().getSimpleName() + ")";
        } finally {
            busy = false;
        }
    }

    /** "build-100016-1" -> 100016 */
    static int buildNumber(String tag) {
        try {
            String[] p = tag.split("-");
            return p.length >= 2 && p[0].equals("build") ? Integer.parseInt(p[1]) : 0;
        } catch (RuntimeException e) {
            return 0;
        }
    }

    // Straight into Android's installer, so no storage permission is needed; size: GitHub's size of the file (-1 if unknown)
    private int download(String url, long size) throws IOException {
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        for (PackageInstaller.SessionInfo old : pi.getMySessions()) {
            try {
                pi.abandonSession(old.getSessionId());
            } catch (RuntimeException e) {
                // gone
            }
        }
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        int id = pi.createSession(params);
        PackageInstaller.Session session = pi.openSession(id);
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(60000);
        c.setRequestProperty("User-Agent", "TwilightTV-app");
        boolean ok = false;
        try {
            if (c.getResponseCode() != 200) throw new IOException("HTTP " + c.getResponseCode());
            InputStream in = c.getInputStream();
            OutputStream out = session.openWrite(APK, 0, size > 0 ? size : -1);
            try {
                copy(in, out, size, MAX_APK);
                session.fsync(out);
            } finally {
                out.close();
                in.close();
            }
            ok = true;
        } finally {
            if (!ok) session.abandon();
            session.close();
            c.disconnect();
        }
        return id;
    }

    /**
     * The download into the installer, counted: more than GitHub said (or than any app of ours could be), or
     * less (the connection closed early), and it's thrown away instead of being offered to Android, which would
     * only show "There was a problem parsing the package" on the TV. Returns the bytes copied.
     */
    static long copy(InputStream in, OutputStream out, long expected, long max) throws IOException {
        byte[] buf = new byte[65536];
        long got = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            got += n;
            if (got > max) throw new IOException("bigger than the app could be");
            if (expected > 0 && got > expected) throw new IOException("bigger than GitHub said");
            out.write(buf, 0, n);
        }
        if (expected > 0 && got != expected) throw new IOException((got >> 20) + " of " + (expected >> 20) + " MB");
        return got;
    }

    private boolean sessionAlive(int id) {
        if (id < 0) return false;
        try {
            return ctx.getPackageManager().getPackageInstaller().getSessionInfo(id) != null;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Asks Android to install the waiting build (it shows its question on the TV). Returns a message for the phone. */
    public String install(Activity a) {
        int id = prefs.getInt("session", -1);
        if (readyBuild == 0 || !sessionAlive(id)) {
            readyBuild = 0;
            return "No update is waiting.";
        }
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            try {
                a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
                return "First time only: on the TV, allow Twilight TV to install apps, press Back, then press Install update again.";
            } catch (ActivityNotFoundException e) {
                return "This box doesn't let apps update themselves. Install the new build with Downloader instead.";
            }
        }
        try {
            PackageInstaller.Session session = a.getPackageManager().getPackageInstaller().openSession(id);
            Intent done = new Intent(a, InstallResult.class);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            session.commit(PendingIntent.getBroadcast(a, id, done, flags).getIntentSender());
            session.close();
            prefs.edit().remove("session").remove("build").apply();
            readyBuild = 0;
            status = "installing";
            return "Look at the TV: press Install with the remote. The app restarts by itself.";
        } catch (IOException | RuntimeException e) {
            return "Couldn't start the install (" + e.getClass().getSimpleName() + ").";
        }
    }
}
