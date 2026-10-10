package com.twilightcafe.tvplayer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Shows the café TV page full screen, nothing else.
 *
 * The page (assets/index.html) is built into the app and served at
 * https://com.twilightcafe.tvplayer/ - the app's own ID - which is how YouTube asks
 * apps to identify themselves when they embed its player. YouTube's player itself is
 * left exactly as YouTube sends it.
 */
public class MainActivity extends Activity {

    static final String HOST = "com.twilightcafe.tvplayer";
    static final String PAGE = "https://" + HOST + "/index.html";
    static final int NIGHT_BLUE = 0xFF0B1030;            // the café screen's colour, so start-up never flashes white

    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView web;
    private boolean visible = false;    // the app is on screen
    private boolean testMode = false;   // hold OK for 3 seconds to switch it on or off

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // no screensaver, no sleep
        if (Build.VERSION.SDK_INT >= 28) {                                     // phones: use the area around a camera notch too
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT_BLUE);
        setContentView(root);
        makeWebView();
        askToStartWithTv();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void makeWebView() {
        try {
            web = new WebView(this);
        } catch (RuntimeException e) {
            // Android's web engine is missing or being updated: try again in 10 seconds
            web = null;
            handler.postDelayed(() -> {
                makeWebView();
                if (visible) open();
            }, 10000);
            return;
        }
        web.setBackgroundColor(NIGHT_BLUE);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                   // the page remembers the shuffle, volumes and zooms
        s.setMediaPlaybackRequiresUserGesture(false);   // music starts with sound, no tap needed
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);   // YouTube's player as in a normal browser
        web.setWebViewClient(new PageClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public Bitmap getDefaultVideoPoster() {
                // Android's grey "play" picture for a video that hasn't started yet: invisible instead
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.requestFocus();                             // remote keys go to the page (volume, zoom)
    }

    private void open() {
        if (web == null) return;
        web.onResume();
        web.loadUrl(testMode ? PAGE + "?debug=1" : PAGE);
    }

    @Override
    protected void onStart() {
        super.onStart();
        visible = true;
        open();
        hideSystemBars();
    }

    @Override
    protected void onStop() {
        super.onStop();
        visible = false;
        // Left the app (Home, another app, the TV going to sleep): stop the music.
        // The page starts again when the app comes back.
        if (web != null) {
            web.loadUrl("about:blank");
            web.onPause();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int key = event.getKeyCode();
        // Back does nothing, so the music can't be stopped by accident. Home leaves the app.
        if (key == KeyEvent.KEYCODE_BACK) return true;
        // Hold OK for 3 seconds: test mode (song, picture quality, zoom, volume on screen) on or off
        if ((key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)
                && event.getAction() == KeyEvent.ACTION_UP && event.getEventTime() - event.getDownTime() >= 3000) {
            testMode = !testMode;
            open();
            return true;
        }
        return super.dispatchKeyEvent(event);
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

    /* ---------- starting by itself when the TV turns on ---------- */

    // Android 9 and older start the app at power-on with no questions. Android 10 and
    // newer need "Display over other apps" for it, which only the person at the TV can
    // switch on, so the app offers to open that setting.
    private void askToStartWithTv() {
        if (Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this)) return;
        final SharedPreferences prefs = getSharedPreferences("player", MODE_PRIVATE);
        if (prefs.getBoolean("dontAskStart", false)) return;
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Start with the TV?")
                .setMessage("To open Twilight TV by itself whenever the TV turns on, Android needs one permission: "
                        + "\"Display over other apps\". On the next screen, choose Twilight TV and switch it on.")
                .setPositiveButton("Open settings", (dialog, which) -> openOverlaySettings(prefs))
                .setNegativeButton("Not now", null)
                .setNeutralButton("Don't ask again", (dialog, which) -> prefs.edit().putBoolean("dontAskStart", true).apply())
                .show();
    }

    private void openOverlaySettings(SharedPreferences prefs) {
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
            return;
        } catch (ActivityNotFoundException e) {
            // no page for one app: try the list of all apps
        }
        try {
            startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION));
            return;
        } catch (ActivityNotFoundException e) {
            // this TV doesn't have the setting at all
        }
        prefs.edit().putBoolean("dontAskStart", true).apply();
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Not available on this TV")
                .setMessage("This TV doesn't let apps open by themselves at start-up. After the TV turns on, "
                        + "open Twilight TV from the apps row.")
                .setPositiveButton("OK", null)
                .show();
    }

    /* ---------- the page, served from inside the app ---------- */

    private class PageClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equals(url.getHost())) return null;          // YouTube and the rest: from the internet as usual
            String path = url.getPath();
            if (path == null || path.length() <= 1) path = "/index.html";
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            try {
                InputStream in = getAssets().open(path.substring(1));
                return new WebResourceResponse(mimeType(path), "utf-8", 200, "OK", headers, in);
            } catch (IOException e) {
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                        new ByteArrayInputStream(new byte[0]));
            }
        }

        // The TV never leaves the page (YouTube's player inside it loads normally)
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return request.isForMainFrame() && !HOST.equals(request.getUrl().getHost());
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {   // Android 6 and older
            return !HOST.equals(Uri.parse(url).getHost());
        }

        // The web engine crashed or Android closed it to free memory: start the page again
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (view != web) return true;
            root.removeView(view);
            view.destroy();
            web = null;
            handler.post(() -> {
                makeWebView();
                if (visible) open();
            });
            return true;
        }
    }

    static String mimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }
}
