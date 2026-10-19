package com.twilightcafe.tvplayer.app;

import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import com.twilightcafe.tvplayer.box.Diary;
import com.twilightcafe.tvplayer.settings.AppSettings;

import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * What every part of the app shares: the screen it runs in (the activity), the main thread, a background
 * worker for the slow jobs (settings.json, updates), the settings, the diary of what happened to the box (and
 * the crash handler that writes the app's last words in it), and whether Twilight TV is on screen.
 */
public final class Core {

    private static Diary shared;                         // one diary for the whole run of the app, whatever its screen does
    private static boolean screenBefore;                 // the app's screen was made before in this run (Android made it again)

    public final Activity activity;
    public final Handler main = new Handler(Looper.getMainLooper());
    public final ExecutorService work = Executors.newSingleThreadExecutor();
    public final long startedAt = System.currentTimeMillis();
    public final AppSettings settings;
    public final Diary diary;
    public final boolean screenAgain;                    // this screen is a new one for an app that kept running
    private volatile boolean onScreen = false;

    public Core(Activity activity) {
        this.activity = activity;
        this.settings = new AppSettings(activity);
        this.diary = diary(activity);
        this.screenAgain = screenBefore;
        screenBefore = true;
    }

    // The diary, made once; with it, the crash handler that writes the crash in it before Android ends the app
    private static synchronized Diary diary(Context c) {
        if (shared == null) {
            final Diary d = new Diary(new File(c.getFilesDir(), "diary.json"));
            final Thread.UncaughtExceptionHandler before = Thread.getDefaultUncaughtExceptionHandler();
            Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
                try {
                    d.crashed(System.currentTimeMillis(), e);
                } catch (Throwable x) {
                    // the crash goes on as it would have
                }
                if (before != null) before.uncaughtException(t, e);
            });
            shared = d;
        }
        return shared;
    }

    /** Twilight TV is on screen (between Android's start and stop of the app) */
    public boolean onScreen() {
        return onScreen;
    }

    void setOnScreen(boolean on) {
        onScreen = on;
    }

    /** Runs r on the main thread and waits for it (5 seconds at most): for the phone's requests, which come on other threads */
    public void runOnMain(final Runnable r) {
        final CountDownLatch done = new CountDownLatch(1);
        main.post(() -> {
            try {
                r.run();
            } finally {
                done.countDown();
            }
        });
        try {
            done.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    /** A short message on the TV */
    public void say(String text) {
        try {
            Toast.makeText(activity, text, Toast.LENGTH_LONG).show();
        } catch (RuntimeException e) {
            // no message, then
        }
    }

    void destroy() {
        main.removeCallbacksAndMessages(null);
        work.shutdownNow();
    }
}
