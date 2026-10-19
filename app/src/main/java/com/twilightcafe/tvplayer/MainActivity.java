package com.twilightcafe.tvplayer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import com.twilightcafe.tvplayer.app.TvApp;
import com.twilightcafe.tvplayer.page.PageEngine;

/**
 * Shows the café TV page full screen, and around it:
 *  - settings.json from GitHub (no reinstall needed for changes),
 *  - the phone control page on the café Wi-Fi (with a PIN), and the menu for customers' phones,
 *  - the box's own volume at opening time, sound levelling, updates from GitHub,
 *  - Wi-Fi kept at full power, a restart if the page ever freezes, a fresh start every night,
 *  - for the info panel beside the video: song names (YouTube), the weather (MET Norway),
 *    gold and currency prices (tirezh.com) and the café's own pictures (uploaded from the phone page).
 *
 * This class is only Android's screen for the app: it makes the app's parts (TvApp) and passes on
 * Android's events to them (start, stop, the remote's keys). How the parts fit together: see TvApp.
 */
public class MainActivity extends Activity {

    private TvApp app;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // no screensaver, no sleep
        if (Build.VERSION.SDK_INT >= 28) {                                     // phones: use the area around a camera notch too
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(PageEngine.NIGHT_BLUE);
        setContentView(root);
        app = new TvApp(this, root);
        app.start();
    }

    @Override
    protected void onStart() {
        super.onStart();
        app.onStart();
        hideSystemBars();
    }

    @Override
    protected void onStop() {
        super.onStop();
        app.onStop();
    }

    @Override
    protected void onDestroy() {
        app.onDestroy();
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        return app.keys.handle(event) || super.dispatchKeyEvent(event);
    }

    @SuppressLint("MissingSuperCall")
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // phones' back gesture: also does nothing
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
}
