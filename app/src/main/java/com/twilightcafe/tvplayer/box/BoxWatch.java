package com.twilightcafe.tvplayer.box;

import android.annotation.TargetApi;
import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.SystemClock;

import java.util.List;

/**
 * Watches the TV box for the diary (Diary): once the app has started, what happened since it last ran (the box
 * started again, or only the app, and what Android says why); then once a minute, the box's free memory and its
 * chip's temperature; and the box going to sleep and waking up.
 */
public final class BoxWatch {

    private final Context context;
    private final Diary diary;
    private final int build;                             // the app's build, as people see it
    private final boolean again;                         // the app's screen made again while the app kept running
    private final long boxOnFor = SystemClock.elapsedRealtime();   // how long the box had been on when the app started
    private boolean noted = false;

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent intent) {
            String a = intent.getAction();
            if (Intent.ACTION_SCREEN_OFF.equals(a)) diary.add(System.currentTimeMillis(), "The TV box went to sleep (its screen off).");
            else if (Intent.ACTION_SCREEN_ON.equals(a)) diary.add(System.currentTimeMillis(), "The TV box woke up.");
        }
    };

    public BoxWatch(Context context, Diary diary, int build, boolean again) {
        this.context = context;
        this.diary = diary;
        this.build = build;
        this.again = again;
    }

    /** Listens for the box going to sleep and waking up */
    public void start() {
        try {
            IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_OFF);
            f.addAction(Intent.ACTION_SCREEN_ON);
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(screen, f, Context.RECEIVER_NOT_EXPORTED);   // Android's own
            else context.registerReceiver(screen, f);
        } catch (RuntimeException e) {
            // this box doesn't say
        }
    }

    /**
     * Every 30 seconds (main thread). First, once: what happened since the app last ran, as soon as the box's clock
     * is right (after a power cut, a box with no clock battery starts in the past until the internet sets it; at most
     * 5 minutes are waited). Then: the app is running, and how the box is.
     */
    public void tick(long now) {
        if (!noted) {
            boolean clockRight = now >= diary.lastAlive();
            if (!clockRight && SystemClock.elapsedRealtime() - boxOnFor < 5 * 60000L) return;
            noted = true;
            long bootAt = now - SystemClock.elapsedRealtime();
            diary.started(now, bootAt, boxOnFor, BoxInfo.bootReason(), exitReason(diary.lastStart()), build, again);
        }
        diary.alive(now, BoxInfo.health(context));
    }

    public void destroy() {
        try {
            context.unregisterReceiver(screen);
        } catch (RuntimeException e) {
            // it wasn't listening
        }
    }

    // Android 11 and newer say why the app's last run ended (memory, a crash...): "" when they don't, or it's older
    private String exitReason(long since) {
        if (Build.VERSION.SDK_INT < 30 || since <= 0) return "";
        try {
            return Api30.exitReason(context, since);
        } catch (RuntimeException e) {
            return "";
        }
    }

    @TargetApi(30)
    private static final class Api30 {
        static String exitReason(Context c, long since) {
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            List<ApplicationExitInfo> ends = am.getHistoricalProcessExitReasons(null, 0, 5);
            for (ApplicationExitInfo x : ends) {
                if (x.getTimestamp() < since) continue;           // from before the last run
                String p = x.getProcessName();
                if (p != null && p.endsWith(":restart")) continue;  // the helper that starts the app again, ending as it should
                return Diary.exitWords(x.getReason());
            }
            return "";
        }
    }
}
