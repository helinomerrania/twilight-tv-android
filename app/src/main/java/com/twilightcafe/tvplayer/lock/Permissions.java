package com.twilightcafe.tvplayer.lock;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.twilightcafe.tvplayer.settings.AppSettings;

/**
 * The two permissions only the person at the TV can give, asked for once at the start:
 * "Display over other apps" (Android 10 and newer start the app at power-on only with it), then
 * "Usage access" (so the lock can see which app is on screen).
 */
public final class Permissions {

    private final Activity activity;
    private final AppSettings settings;
    private final BoxLock lock;

    public Permissions(Activity activity, AppSettings settings, BoxLock lock) {
        this.activity = activity;
        this.settings = settings;
        this.lock = lock;
    }

    /** At the start: "start with the TV" first, if it's needed; "Usage access" once that's done */
    public void askAtStart() {
        if (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(activity)) askToStartWithTv();
        else askForUsageAccess();
    }

    // With the lock on: Android needs "Usage access" to tell the app which app is on screen, so it also
    // comes back when the other app is closed with Back (Home it hears anyway), and nothing can be opened
    // from the home screen on the way. Asked once, after "start with the TV".
    private void askForUsageAccess() {
        if (!lock.on() || lock.usageAccess() || (Build.VERSION.SDK_INT >= 29 && !Settings.canDrawOverlays(activity))) return;
        final SharedPreferences prefs = activity.getSharedPreferences("player", Context.MODE_PRIVATE);
        if (prefs.getBoolean("dontAskUsage", false)) return;
        String other = settings.text("otherApp", "My TV Plus");
        new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Keep the box in Twilight TV")
                .setMessage("Twilight TV brings itself back whenever someone leaves it, except for " + other + ". To see which app is "
                        + "on screen, Android needs one more permission: \"Usage access\". On the next screen, choose Twilight TV and "
                        + "switch it on.")
                .setPositiveButton("Open settings", (dialog, which) -> {
                    lock.allowSettings();
                    try {
                        activity.startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
                    } catch (ActivityNotFoundException e) {
                        prefs.edit().putBoolean("dontAskUsage", true).apply();
                    }
                })
                .setNegativeButton("Not now", null)
                .setNeutralButton("Don't ask again", (dialog, which) -> prefs.edit().putBoolean("dontAskUsage", true).apply())
                .show();
    }

    // Android 9 and older start the app at power-on with no questions. Android 10 and
    // newer need "Display over other apps" for it, which only the person at the TV can
    // switch on, so the app offers to open that setting.
    private void askToStartWithTv() {
        if (Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(activity)) return;
        final SharedPreferences prefs = activity.getSharedPreferences("player", Context.MODE_PRIVATE);
        if (prefs.getBoolean("dontAskStart", false)) return;
        new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Start with the TV?")
                .setMessage("To open Twilight TV by itself whenever the TV turns on, Android needs one permission: "
                        + "\"Display over other apps\". On the next screen, choose Twilight TV and switch it on.")
                .setPositiveButton("Open settings", (dialog, which) -> openOverlaySettings(prefs))
                .setNegativeButton("Not now", null)
                .setNeutralButton("Don't ask again", (dialog, which) -> prefs.edit().putBoolean("dontAskStart", true).apply())
                .show();
    }

    private void openOverlaySettings(SharedPreferences prefs) {
        lock.allowSettings();
        try {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + activity.getPackageName())));
            return;
        } catch (ActivityNotFoundException e) {
            // no page for one app: try the list of all apps
        }
        try {
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
            return;
        } catch (ActivityNotFoundException e) {
            // this TV doesn't have the setting at all
        }
        prefs.edit().putBoolean("dontAskStart", true).apply();
        new AlertDialog.Builder(activity, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Not available on this TV")
                .setMessage("This TV doesn't let apps open by themselves at start-up. After the TV turns on, "
                        + "open Twilight TV from the apps row.")
                .setPositiveButton("OK", null)
                .show();
    }
}
