package com.twilightcafe.tvplayer.lock;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;

import com.twilightcafe.tvplayer.app.Core;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The apps the lock lets on screen besides Twilight TV (the rules are in AppLock): the other app (otherApp, My TV
 * Plus), found by its name among the box's apps, and Twilight Movies (AppLock.MOVIES), by its package; looked for
 * now and then, with the box's home screen. And opening them.
 */
final class AllowedApps {

    private final Core core;
    private final Activity activity;
    private String[] other;                              // {name, package}, or null if it isn't on the box
    private boolean movies;                              // Twilight Movies is on the box
    private long lookedAt = 0;                           // when they were looked for
    private volatile Set<String> homeApps = new HashSet<>();   // the box's home screen

    AllowedApps(Core core) {
        this.core = core;
        this.activity = core.activity;
    }

    /** Looked for again next time (the settings changed: otherApp may have) */
    synchronized void forget() {
        lookedAt = 0;
    }

    /** The other app allowed, {name, package}, or null if it isn't on the box */
    synchronized String[] other() {
        lookNow();
        return other;
    }

    /** Twilight Movies is on the box */
    synchronized boolean movies() {
        lookNow();
        return movies;
    }

    /** The box's home screen, as last looked for */
    Set<String> homeApps() {
        return homeApps;
    }

    private void lookNow() {
        long now = System.currentTimeMillis();
        if (now - lookedAt <= 60000L) return;
        lookedAt = now;
        other = AppLock.find(boxApps(), core.settings.text("otherApp", "My TV Plus"));
        movies = start(AppLock.MOVIES) != null;
        homeApps = homeAppsNow();
    }

    /** How the box's home screen opens the app (its TV start first), or null if it isn't on the box */
    private Intent start(String pkg) {
        try {
            PackageManager pm = activity.getPackageManager();
            Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
            return i != null ? i : pm.getLaunchIntentForPackage(pkg);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * The app on screen (main thread). under: with Twilight TV under it, so that leaving it is the way back to the
     * music, not to what was on screen before (YouTube). False if it can't be opened.
     */
    boolean open(String pkg, boolean under) {
        Intent i = start(pkg);
        if (i == null) return false;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (!under) {
                activity.startActivity(i);
            } else {
                Intent back = new Intent(activity, activity.getClass())
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                activity.startActivities(new Intent[] { back, i });
            }
            return true;
        } catch (RuntimeException e) {
            return false;                                // not allowed on this box
        }
    }

    private Set<String> homeAppsNow() {
        Set<String> out = new HashSet<>();
        try {
            for (ResolveInfo r : activity.getPackageManager().queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)) {
                if (!r.activityInfo.packageName.equals(activity.getPackageName())) out.add(r.activityInfo.packageName);
            }
        } catch (RuntimeException e) {
            // AppLock.homeScreen knows the usual ones by name
        }
        return out;
    }

    // The box's apps but this one: {name, package}
    private List<String[]> boxApps() {
        List<String[]> out = new ArrayList<>();
        HashSet<String> seen = new HashSet<>();
        PackageManager pm = activity.getPackageManager();
        for (String kind : new String[] { Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER }) {
            try {
                for (ResolveInfo r : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(kind), 0)) {
                    String p = r.activityInfo.packageName;
                    if (p.equals(activity.getPackageName()) || !seen.add(p)) continue;
                    out.add(new String[] { String.valueOf(r.loadLabel(pm)), p });
                }
            } catch (RuntimeException e) {
                // that kind of app list isn't there on this box
            }
        }
        return out;
    }
}
