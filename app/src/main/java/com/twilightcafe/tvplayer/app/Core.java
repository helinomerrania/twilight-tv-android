package com.twilightcafe.tvplayer.app;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

import com.twilightcafe.tvplayer.settings.AppSettings;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * What every part of the app shares: the screen it runs in (the activity), the main thread, a background
 * worker for the slow jobs (settings.json, updates), the settings, and whether Twilight TV is on screen.
 */
public final class Core {

    public final Activity activity;
    public final Handler main = new Handler(Looper.getMainLooper());
    public final ExecutorService work = Executors.newSingleThreadExecutor();
    public final long startedAt = System.currentTimeMillis();
    public final AppSettings settings;
    private volatile boolean onScreen = false;

    public Core(Activity activity) {
        this.activity = activity;
        this.settings = new AppSettings(activity);
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
