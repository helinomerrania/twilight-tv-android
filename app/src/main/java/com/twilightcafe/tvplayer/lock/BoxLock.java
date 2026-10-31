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
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.twilightcafe.tvplayer.app.Core;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Keeps the box in Twilight TV (lockApps; the rules are in AppLock): while Twilight TV is off the screen,
 * whatever else comes up is sent away after 10 seconds, except the two apps allowed (AllowedApps: My TV Plus and
 * Twilight Movies) in their turn, Android's own questions, the box's settings the app opened itself, and while the
 * box is unlocked. Leaving an app allowed brings Twilight TV back at once. YouTube (the remote's YouTube button)
 * gets Twilight Movies in its place.
 */
public final class BoxLock {

    private final Core core;
    private final Activity activity;
    private final AllowedApps apps;
    private volatile boolean turn = false;               // an allowed app's turn: until the home screen shows
    private volatile String turnOf = null;               // whose (its package)
    private volatile long turnSince = 0;                 // since when
    private volatile long unlockedUntil = 0, settingsUntil = 0;
    private String lastFront = null;                     // the app on screen, from Android's usage events
    private long frontSince = 0;                         // usage events read from here on
    private volatile long allRightAt = 0;                // the last moment what was on screen was allowed
    private volatile boolean turnEnded = false;          // an allowed app's turn just ended: back at once
    private long moviesAt = 0;                           // when Twilight Movies last took YouTube's place

    public BoxLock(Core core) {
        this.core = core;
        this.activity = core.activity;
        this.apps = new AllowedApps(core);
    }

    public boolean on() {
        return core.settings.flag("lockApps", true);
    }

    /** Twilight TV came on screen: an allowed app's turn is over */
    public void onStart() {
        turn = false;
        turnEnded = false;
        core.main.removeCallbacks(check);
    }

    /**
     * Twilight TV left the screen: with the lock on, anything but the apps allowed is sent away after 10 seconds.
     * The first look is soon: YouTube (the remote's YouTube button) gets Twilight Movies in its place at once.
     */
    public void onStop() {
        lastFront = null;
        frontSince = System.currentTimeMillis() - 2000;
        allRightAt = System.currentTimeMillis();         // Twilight TV was on screen until now
        turnEnded = false;
        core.main.removeCallbacks(check);
        core.main.postDelayed(check, 500);
    }

    /** The settings changed: otherApp may have too */
    public void settingsChanged() {
        apps.forget();
    }

    // While Twilight TV is off the screen with the lock on, every 1.5 seconds: what's on screen? YouTube: Twilight
    // Movies instead. Anything but the apps allowed (and, in their turn, what they open), or Android's own questions,
    // is sent away once it has been there 10 seconds: Twilight TV comes back (see AppLock).
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
                turn = false;
            }
            String[] other = apps.other();
            String otherPkg = other == null ? null : other[1], front = frontApp(now, otherPkg);
            if (AppLock.moviesInstead(front, now, unlockedUntil, settingsUntil) && now - moviesAt > 3000 && apps.movies()) {
                moviesAt = now;
                allRightAt = now;
                openMovies();
            } else if (!AppLock.bringBack(front, activity.getPackageName(), otherPkg, turn, AppLock.homeScreen(front, apps.homeApps()), now, unlockedUntil, settingsUntil)) {
                allRightAt = now;
            } else if (AppLock.timeToComeBack(allRightAt, now, turnEnded)) {
                turnEnded = false;
                comeBack();
            }
            core.main.postDelayed(this, 1500);
        }
    };

    // Home pressed, wherever: an allowed app's turn is over. Pressed in it, that's the way back to the music:
    // Twilight TV comes back at once (unless the box is unlocked). Pressed in Twilight TV, it has left the
    // screen, and comes back after 10 seconds (the checks above). Android tells every app, so this works
    // without "Usage access" too.
    private final BroadcastReceiver homeKey = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!AppLock.homeKey(intent.getStringExtra("reason"))) return;
            boolean itsTurn = turn;
            turn = false;
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

    // The app on screen, from Android's usage events ("Usage access"); null when Android won't say. An allowed app
    // coming up (from here, or by its own button on the remote) has its turn from then.
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
                if (AppLock.allowed(lastFront, otherPkg)) {
                    if (!turn || !lastFront.equals(turnOf)) startTurn(lastFront, e.getTimeStamp());   // from one to the other too
                } else if (turn && e.getTimeStamp() > turnSince && AppLock.turnOver(lastFront, otherPkg, apps.homeApps())) {
                    // the home screen since the app allowed came up (Home, or the app closed): its turn is over, and
                    // Twilight TV comes back at once
                    turn = false;
                    turnEnded = true;
                }
            }
            frontSince = now - 1000;
        } catch (RuntimeException e) {
            return null;
        }
        return lastFront;
    }

    private void startTurn(String pkg, long since) {
        turnOf = pkg;
        turnSince = since;
        turn = true;
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

    /** The other app, from the remote (Back held for 2 seconds) or the phone (main thread). Home brings Twilight TV back. */
    public boolean openOtherApp(boolean fromRemote) {
        String[] app = apps.other();
        if (app == null) {
            if (fromRemote) core.say("\"" + core.settings.text("otherApp", "My TV Plus") + "\" isn't on this box.");
            return false;
        }
        startTurn(app[1], System.currentTimeMillis());
        if (!apps.open(app[1], false)) {
            turn = false;
            return false;
        }
        if (fromRemote) core.say(app[0] + ": press Home to come back to Twilight TV.");
        return true;
    }

    /**
     * Twilight Movies, in YouTube's place (main thread), with Twilight TV under it: leaving it brings the music back,
     * not YouTube
     */
    private void openMovies() {
        startTurn(AppLock.MOVIES, System.currentTimeMillis());
        if (!apps.open(AppLock.MOVIES, true)) turn = false;
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

    /** For the phone page: on, unlocked until, the other app, the app allowed that's open, and what Android lets the app do */
    public JSONObject status() throws JSONException {
        JSONObject lock = new JSONObject();
        String[] other = apps.other();
        long now = System.currentTimeMillis();
        boolean open = !core.onScreen() && turn;
        lock.put("on", on());
        lock.put("unlockedUntil", unlockedUntil > now ? unlockedUntil : 0);
        lock.put("other", other == null ? JSONObject.NULL : other[0]);
        lock.put("otherWanted", core.settings.text("otherApp", "My TV Plus"));
        lock.put("otherOpen", open);
        lock.put("open", !open ? JSONObject.NULL : AppLock.MOVIES.equals(turnOf) ? "Twilight Movies" : other != null ? other[0] : "The other app");
        lock.put("movies", apps.movies());
        lock.put("sees", usageAccess());                           // "Usage access"
        lock.put("canReturn", Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(activity));   // "Display over other apps"
        return lock;
    }
}
