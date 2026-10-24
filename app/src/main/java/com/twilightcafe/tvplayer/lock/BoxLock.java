package com.twilightcafe.tvplayer.lock;

import android.app.Activity;
import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.twilightcafe.tvplayer.app.Core;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Keeps the box in Twilight TV (lockApps; the rules are in AppLock): while Twilight TV is off the screen,
 * whatever else comes up is sent away after 10 seconds, except the one other app allowed (otherApp, My TV Plus)
 * in its turn, Android's own questions, the box's settings the app opened itself, and while the box is unlocked.
 * Leaving the other app brings Twilight TV back at once.
 */
public final class BoxLock {

    private final Core core;
    private final Activity activity;
    private String[] otherApp;                           // {name, package}, or null if it isn't on the box
    private long otherAppAt = 0;                         // when it was looked for
    private volatile boolean otherOpened = false;        // opened from here: its turn, until the home screen shows
    private volatile long turnSince = 0;                 // when it was opened
    private volatile Set<String> homeApps = new HashSet<>();   // the box's home screen
    private volatile long unlockedUntil = 0, settingsUntil = 0;
    private String lastFront = null;                     // the app on screen, from Android's usage events
    private long frontSince = 0;                         // usage events read from here on
    private volatile long allRightAt = 0;                // the last moment what was on screen was allowed
    private volatile boolean turnEnded = false;          // the other app's turn just ended: back at once

    public BoxLock(Core core) {
        this.core = core;
        this.activity = core.activity;
    }

    public boolean on() {
        return core.settings.flag("lockApps", true);
    }

    /** Twilight TV came on screen: the other app's turn is over */
    public void onStart() {
        otherOpened = false;
        turnEnded = false;
        core.main.removeCallbacks(check);
    }

    /** Twilight TV left the screen: with the lock on, anything but the other app is sent away after 10 seconds */
    public void onStop() {
        lastFront = null;
        frontSince = System.currentTimeMillis() - 2000;
        allRightAt = System.currentTimeMillis();         // Twilight TV was on screen until now
        turnEnded = false;
        core.main.removeCallbacks(check);
        core.main.postDelayed(check, 1500);
    }

    /** The settings changed: otherApp may have too */
    public synchronized void settingsChanged() {
        otherAppAt = 0;
    }

    // While Twilight TV is off the screen with the lock on, every 1.5 seconds: what's on screen? Anything but
    // the other app (and, in its turn, what it opens), or Android's own questions, is sent away once it has
    // been there 10 seconds: Twilight TV comes back (see AppLock).
    private final Runnable check = new Runnable() {
        @Override
        public void run() {
            if (core.onScreen() || !on()) return;
            long now = System.currentTimeMillis();
            if (!awake()) {                              // the box asleep (the TV off): nothing to send away
                allRightAt = now;
                core.main.postDelayed(this, 1500);
                return;
            }
            if (unlockedUntil != 0 && now >= unlockedUntil) {   // locked again: whatever was opened meanwhile goes too
                unlockedUntil = 0;
                otherOpened = false;
            }
            String[] other = otherApp();
            String otherPkg = other == null ? null : other[1], front = frontApp(now, otherPkg);
            if (!AppLock.bringBack(front, activity.getPackageName(), otherPkg, otherOpened, AppLock.homeScreen(front, homeApps), now, unlockedUntil, settingsUntil)) {
                allRightAt = now;
            } else if (AppLock.timeToComeBack(allRightAt, now, turnEnded)) {
                turnEnded = false;
                comeBack();
            }
            core.main.postDelayed(this, 1500);
        }
    };

    // Home pressed, wherever: the other app's turn is over. Pressed in it, that's the way back to the music:
    // Twilight TV comes back at once (unless the box is unlocked). Pressed in Twilight TV, it has left the
    // screen, and comes back after 10 seconds (the checks above). Android tells every app, so this works
    // without "Usage access" too.
    private final BroadcastReceiver homeKey = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!AppLock.homeKey(intent.getStringExtra("reason"))) return;
            boolean itsTurn = otherOpened;
            otherOpened = false;
            if (!itsTurn || !on() || System.currentTimeMillis() < unlockedUntil) return;   // unlocked: Home is just Home
            core.main.removeCallbacks(homeBack);
            core.main.postDelayed(homeBack, 700);        // once the home screen is up
        }
    };

    private final Runnable homeBack = new Runnable() {
        @Override
        public void run() {
            if (!core.onScreen()) comeBack();
        }
    };

    public void listenForHome() {
        try {
            IntentFilter filter = new IntentFilter("android.intent.action.CLOSE_SYSTEM_DIALOGS");
            if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(homeKey, filter, Context.RECEIVER_EXPORTED);   // it comes from Android
            else activity.registerReceiver(homeKey, filter);
        } catch (RuntimeException e) {
            // this box doesn't say: the checks above still bring Twilight TV back
        }
    }

    public void destroy() {
        try {
            activity.unregisterReceiver(homeKey);
        } catch (RuntimeException e) {
            // it wasn't listening
        }
    }

    private boolean awake() {
        try {
            PowerManager power = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
            return power == null || power.isInteractive();
        } catch (RuntimeException e) {
            return true;
        }
    }

    /** Twilight TV back on screen (Android 10 and newer allow it with "Display over other apps") */
    public void comeBack() {
        try {
            activity.startActivity(new Intent(activity, activity.getClass()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
        } catch (RuntimeException e) {
            // not allowed on this box
        }
    }

    // The app on screen, from Android's usage events ("Usage access"); null when Android won't say
    @SuppressWarnings("deprecation")
    private String frontApp(long now, String otherPkg) {
        if (!usageAccess()) return null;
        try {
            UsageStatsManager usage = (UsageStatsManager) activity.getSystemService(Context.USAGE_STATS_SERVICE);
            UsageEvents events = usage.queryEvents(frontSince, now + 1000);
            UsageEvents.Event e = new UsageEvents.Event();
            while (events.hasNextEvent()) {
                events.getNextEvent(e);
                if (e.getEventType() != UsageEvents.Event.MOVE_TO_FOREGROUND) continue;
                lastFront = e.getPackageName();
                // the home screen since the other app was opened (Home, or the other app closed): its turn is
                // over, and Twilight TV comes back at once
                if (otherOpened && e.getTimeStamp() > turnSince && AppLock.turnOver(lastFront, otherPkg, homeApps)) {
                    otherOpened = false;
                    turnEnded = true;
                }
            }
            frontSince = now - 1000;
        } catch (RuntimeException e) {
            return null;
        }
        return lastFront;
    }

    /** Android tells the app what's on screen ("Usage access") */
    public boolean usageAccess() {
        try {
            AppOpsManager ops = (AppOpsManager) activity.getSystemService(Context.APP_OPS_SERVICE);
            int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), activity.getPackageName());
            if (mode == AppOpsManager.MODE_DEFAULT) {
                return activity.checkCallingOrSelfPermission("android.permission.PACKAGE_USAGE_STATS") == PackageManager.PERMISSION_GRANTED;
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (RuntimeException e) {
            return false;
        }
    }

    // The other app allowed (otherApp, by its name or package), looked for among the box's apps now and then,
    // with the box's home screen
    private synchronized String[] otherApp() {
        long now = System.currentTimeMillis();
        if (now - otherAppAt > 60000L) {
            otherAppAt = now;
            otherApp = AppLock.find(boxApps(), core.settings.text("otherApp", "My TV Plus"));
            homeApps = homeAppsNow();
        }
        return otherApp;
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

    /** The other app, from the remote (Back held for 2 seconds) or the phone (main thread). Home brings Twilight TV back. */
    public boolean openOtherApp(boolean fromRemote) {
        String[] app = otherApp();
        if (app == null) {
            if (fromRemote) core.say("\"" + core.settings.text("otherApp", "My TV Plus") + "\" isn't on this box.");
            return false;
        }
        PackageManager pm = activity.getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(app[1]);
        if (i == null) i = pm.getLaunchIntentForPackage(app[1]);
        if (i == null) return false;
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        turnSince = System.currentTimeMillis();
        otherOpened = true;
        try {
            activity.startActivity(i);
        } catch (RuntimeException e) {
            otherOpened = false;
            return false;
        }
        if (fromRemote) core.say(app[0] + ": press Home to come back to Twilight TV.");
        return true;
    }

    /** The box free for 15 minutes (its settings, another app), then locked again by itself */
    public void unlock(boolean fromRemote) {
        unlockedUntil = System.currentTimeMillis() + AppLock.UNLOCK;
        if (fromRemote) core.say("Unlocked for 15 minutes: other apps and the box's settings can be opened.");
    }

    /** Locked again now (from the phone) */
    public void lock() {
        unlockedUntil = 0;
    }

    /** The app is opening one of the box's own settings (or Android's install question): left alone for a while */
    public void allowSettings() {
        settingsUntil = System.currentTimeMillis() + AppLock.SETTINGS;
    }

    /** For the phone page: on, unlocked until, the other app, and what Android lets the app do */
    public JSONObject status() throws JSONException {
        JSONObject lock = new JSONObject();
        String[] other = otherApp();
        long now = System.currentTimeMillis();
        lock.put("on", on());
        lock.put("unlockedUntil", unlockedUntil > now ? unlockedUntil : 0);
        lock.put("other", other == null ? JSONObject.NULL : other[0]);
        lock.put("otherWanted", core.settings.text("otherApp", "My TV Plus"));
        lock.put("otherOpen", !core.onScreen() && otherOpened);
        lock.put("sees", usageAccess());                           // "Usage access"
        lock.put("canReturn", Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(activity));   // "Display over other apps"
        return lock;
    }
}
