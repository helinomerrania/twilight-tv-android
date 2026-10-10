package com.twilightcafe.tvplayer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.media.AudioManager;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Shows the café TV page full screen, and around it:
 *  - settings.json from GitHub (no reinstall needed for changes),
 *  - the phone control page on the café Wi-Fi (with a PIN),
 *  - the box's own volume at opening time, sound levelling, updates from GitHub,
 *  - Wi-Fi kept at full power, a restart if the page ever freezes, a fresh start every night.
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
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private FrameLayout root;
    private WebView web;
    private TextView overlay;                            // test mode: the app's own information
    private PointerView pointer;                         // quality setup: a pointer moved with the remote
    private float pointerX, pointerY;
    private boolean visible = false;                     // the app is on screen
    private boolean testMode = false;                    // hold OK for 3 seconds to switch it on or off

    private AppSettings settings;
    private Updater updater;
    private final Leveller leveller = new Leveller();
    private ControlServer server;
    private TvFinder finder;
    private AudioManager audio;
    private WifiManager.WifiLock wifiLock;
    private volatile String pin = "", ip = "", tvName = "TV";
    private volatile String notice = "";
    private volatile long noticeAt = 0;
    private byte[] controlPage;

    private volatile long lastAlive = 0;                 // the page's last "I'm alive"
    private long pageOpenedAt = 0, lastReload = 0, startedAt = 0, lastSettingsCheck = 0, lastUpdateCheck = 0;
    private int reloadsInRow = 0, tvVolumeSetting = 0;
    private long qualitySetupUntil = 0;                  // YouTube's own controls on screen until then
    private String restartDoneDay = "", openingDoneDay = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        startedAt = System.currentTimeMillis();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // no screensaver, no sleep
        if (Build.VERSION.SDK_INT >= 28) {                                     // phones: use the area around a camera notch too
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(NIGHT_BLUE);
        setContentView(root);

        settings = new AppSettings(this);
        updater = new Updater(this, BuildConfig.REPO, BuildConfig.VERSION_CODE);
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            wifiLock = makeWifiLock(wifi);
        }
        pin = choosePin();
        leveller.apply(settings.flag("levelSound", true));
        tvVolumeSetting = settings.number("tvVolume", 0);
        applyTvVolume();

        overlay = new TextView(this);
        overlay.setTextColor(0xFFFFF1E0);
        overlay.setBackgroundColor(0xE60A0E2C);
        overlay.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        overlay.setLineSpacing(0, 1.15f);
        int pad = (int) (12 * getResources().getDisplayMetrics().density);
        overlay.setPadding(pad, pad, pad, pad);
        overlay.setVisibility(View.GONE);
        FrameLayout.LayoutParams olp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END);
        root.addView(overlay, olp);

        float density = getResources().getDisplayMetrics().density;
        pointer = new PointerView(this, 30 * density);
        pointer.setVisibility(View.GONE);
        root.addView(pointer, new FrameLayout.LayoutParams((int) (36 * density), (int) (46 * density)));

        makeWebView();
        server = new ControlServer(phone);
        server.start();
        refreshNetwork(false);
        askToStartWithTv();
        handler.postDelayed(maintenance, 3000);
    }

    @SuppressWarnings("deprecation")
    private static WifiManager.WifiLock makeWifiLock(WifiManager wifi) {
        WifiManager.WifiLock lock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "twilight-tv");
        lock.setReferenceCounted(false);
        return lock;
    }

    @SuppressLint({ "SetJavaScriptEnabled", "AddJavascriptInterface" })
    private void makeWebView() {
        try {
            web = new WebView(this);
        } catch (RuntimeException e) {
            // Android's web engine is missing or being updated: try again in 10 seconds
            web = null;
            handler.postDelayed(new Runnable() {
                @Override
                public void run() {
                    makeWebView();
                    if (visible) open();
                }
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
        web.addJavascriptInterface(new Bridge(), "TwilightApp");
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
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.requestFocus();                             // remote keys go to the page (volume, zoom)
    }

    private void open() {
        syncOverlays();
        if (web == null) return;
        pageOpenedAt = lastAlive = System.currentTimeMillis();
        web.onResume();
        // Quality setup leaves test mode's details out: they would cover YouTube's controls
        web.loadUrl(inQualitySetup() ? PAGE + "?setup=quality" : testMode ? PAGE + "?debug=1" : PAGE);
    }

    // What the app draws over the page: the setup pointer, or test mode's details (never both)
    private void syncOverlays() {
        boolean setup = inQualitySetup();
        if (pointer != null) pointer.setVisibility(setup ? View.VISIBLE : View.GONE);
        if (overlay != null) overlay.setVisibility(testMode && !setup ? View.VISIBLE : View.GONE);
    }

    /* ---------- quality setup: YouTube's own controls, to pick the highest quality by hand ---------- */

    private boolean inQualitySetup() {
        return System.currentTimeMillis() < qualitySetupUntil;
    }

    private void startQualitySetup() {
        qualitySetupUntil = System.currentTimeMillis() + 10 * 60000L;   // ends by itself after 10 minutes
        pointerX = root.getWidth() / 2f;                                 // the pointer starts in the middle
        pointerY = root.getHeight() / 2f;
        placePointer();
        open();
    }

    private void placePointer() {
        pointer.setTranslationX(pointerX - pointer.tip);
        pointer.setTranslationY(pointerY - pointer.tip);
    }

    // The remote's arrows move the pointer. The page gets the same as a mouse moving over
    // it, so YouTube shows its controls.
    private void movePointer(float dx, float dy) {
        pointerX = Math.max(0, Math.min(root.getWidth() - 1, pointerX + dx));
        pointerY = Math.max(0, Math.min(root.getHeight() - 1, pointerY + dy));
        placePointer();
        if (web == null) return;
        long t = SystemClock.uptimeMillis();
        MotionEvent hover = pointerEvent(t, t, MotionEvent.ACTION_HOVER_MOVE, pointerX, pointerY, false);
        web.dispatchGenericMotionEvent(hover);
        hover.recycle();
    }

    // OK: the same as touching the screen where the pointer is
    private void clickAtPointer() {
        if (web == null) return;
        final float x = pointerX, y = pointerY;
        final long t = SystemClock.uptimeMillis();
        MotionEvent down = pointerEvent(t, t, MotionEvent.ACTION_DOWN, x, y, true);
        web.dispatchTouchEvent(down);
        down.recycle();
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (web == null) return;
                MotionEvent up = pointerEvent(t, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, true);
                web.dispatchTouchEvent(up);
                up.recycle();
            }
        }, 70);
    }

    // A mouse moving (touch false) or a finger on the screen (touch true), at x, y on the page
    private static MotionEvent pointerEvent(long downTime, long time, int action, float x, float y, boolean touch) {
        MotionEvent.PointerProperties props = new MotionEvent.PointerProperties();
        props.id = 0;
        props.toolType = touch ? MotionEvent.TOOL_TYPE_FINGER : MotionEvent.TOOL_TYPE_MOUSE;
        MotionEvent.PointerCoords coords = new MotionEvent.PointerCoords();
        coords.x = x;
        coords.y = y;
        coords.pressure = touch ? 1f : 0f;
        coords.size = touch ? 0.05f : 0f;
        return MotionEvent.obtain(downTime, time, action, 1, new MotionEvent.PointerProperties[] { props },
                new MotionEvent.PointerCoords[] { coords }, 0, 0, 1f, 1f, 0, 0,
                touch ? InputDevice.SOURCE_TOUCHSCREEN : InputDevice.SOURCE_MOUSE, 0);
    }

    /** The pointer shown during quality setup: a white arrow with a dark edge, its tip at (tip, tip). */
    private static final class PointerView extends View {
        private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path arrow = new Path();
        final float tip;

        PointerView(Context c, float size) {
            super(c);
            fill.setColor(0xFFFFFFFF);
            edge.setColor(0xFF0B1030);
            edge.setStyle(Paint.Style.STROKE);
            edge.setStrokeWidth(Math.max(2f, size / 12f));
            tip = edge.getStrokeWidth();
            arrow.moveTo(0, 0);
            arrow.lineTo(0, size);
            arrow.lineTo(size * 0.27f, size * 0.75f);
            arrow.lineTo(size * 0.46f, size * 1.15f);
            arrow.lineTo(size * 0.62f, size * 1.08f);
            arrow.lineTo(size * 0.44f, size * 0.69f);
            arrow.lineTo(size * 0.78f, size * 0.69f);
            arrow.close();
        }

        @Override
        protected void onDraw(Canvas c) {
            c.translate(tip, tip);
            c.drawPath(arrow, fill);
            c.drawPath(arrow, edge);
        }
    }

    private void endQualitySetup() {
        qualitySetupUntil = 0;
        open();
    }

    // A fresh web engine: every night, and when the page froze and reloading didn't help
    private void restartWebView() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        makeWebView();
        if (visible) open();
    }

    @Override
    protected void onStart() {
        super.onStart();
        visible = true;
        if (wifiLock != null) wifiLock.acquire();       // Wi-Fi at full power while playing
        open();
        hideSystemBars();
    }

    @Override
    protected void onStop() {
        super.onStop();
        visible = false;
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
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
        work.shutdownNow();
        if (server != null) server.stop();
        if (finder != null) finder.stop();
        leveller.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
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
        // During quality setup, Back ends the setup.
        if (key == KeyEvent.KEYCODE_BACK) {
            if (inQualitySetup() && event.getAction() == KeyEvent.ACTION_UP) endQualitySetup();
            return true;
        }
        // Quality setup: arrows move the pointer, OK clicks
        if (inQualitySetup() && web != null) {
            boolean press = event.getAction() == KeyEvent.ACTION_DOWN;
            // one press: a small step, to land on a menu line; held down: faster
            float step = Math.max(root.getWidth(), root.getHeight()) * (event.getRepeatCount() > 4 ? 0.035f : 0.012f);
            switch (key) {
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if (press) movePointer(-step, 0);
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if (press) movePointer(step, 0);
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    if (press) movePointer(0, -step);
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (press) movePointer(0, step);
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (event.getAction() == KeyEvent.ACTION_UP) clickAtPointer();
                    return true;
                default:
                    break;
            }
        }
        // Hold OK for 3 seconds: test mode (the page's details, and the app's: phone address and PIN)
        if ((key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)
                && event.getAction() == KeyEvent.ACTION_UP && event.getEventTime() - event.getDownTime() >= 3000) {
            toggleTestMode();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private void toggleTestMode() {
        testMode = !testMode;
        if (testMode) handler.post(overlayTick);
        open();
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

    /* ---------- every 30 seconds: settings, updates, frozen page, nightly restart ---------- */

    private final Runnable maintenance = new Runnable() {
        @Override
        public void run() {
            long now = System.currentTimeMillis();
            refreshNetwork(false);
            if (qualitySetupUntil > 0 && now >= qualitySetupUntil) endQualitySetup();
            if (now - lastSettingsCheck > 30 * 60000L) {                 // settings.json every 30 minutes
                lastSettingsCheck = now;
                work.execute(new Runnable() {
                    @Override
                    public void run() {
                        if (settings.refresh(BuildConfig.REPO)) {
                            handler.post(new Runnable() {
                                @Override
                                public void run() {
                                    settingsChanged();
                                }
                            });
                        }
                    }
                });
            }
            if (settings.flag("updates", true) && now - startedAt > 60000L && now - lastUpdateCheck > 6 * 3600000L) {
                lastUpdateCheck = now;                                    // updates every 6 hours
                work.execute(new Runnable() {
                    @Override
                    public void run() {
                        updater.check();
                    }
                });
            }
            // The page says "alive" every 5 seconds. Silent for 2 minutes: reload it;
            // three times within half an hour: a whole new web engine.
            if (visible && web != null && now - pageOpenedAt > 120000L && now - lastAlive > 120000L) {
                reloadsInRow = now - lastReload < 30 * 60000L ? reloadsInRow + 1 : 1;
                lastReload = now;
                if (reloadsInRow >= 3) {
                    reloadsInRow = 0;
                    restartWebView();
                } else {
                    open();
                }
            }
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
            String time = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(now));
            String restartAt = clock(settings.text("restartAt", "05:00"));
            if (visible && time.equals(restartAt) && !today.equals(restartDoneDay)) {
                restartDoneDay = today;                                   // a fresh start every night
                restartWebView();
                applyTvVolume();
            }
            String opening = openingTime();
            if (opening != null && time.equals(opening) && !today.equals(openingDoneDay)) {
                openingDoneDay = today;                                   // the box's volume back to normal at opening
                applyTvVolume();
            }
            handler.postDelayed(this, 30000);
        }
    };

    private void settingsChanged() {
        pin = choosePin();
        leveller.apply(settings.flag("levelSound", true));
        int v = settings.number("tvVolume", 0);
        if (v != tvVolumeSetting) {                  // only when that setting itself changed
            tvVolumeSetting = v;
            applyTvVolume();
        }
        refreshNetwork(true);                        // the TV's name may have changed
        // the page sees the new settings by itself and uses them at once
    }

    // "9:30" -> "09:30"; anything unreadable -> null
    private static String clock(String s) {
        if (s == null) return null;
        String[] p = s.trim().split("[:.]");
        try {
            int h = Integer.parseInt(p[0].trim()), m = Integer.parseInt(p[1].trim());
            if (h < 0 || h > 24 || m < 0 || m > 59) return null;
            return String.format(Locale.US, "%02d:%02d", h % 24, m);
        } catch (RuntimeException e) {
            return null;
        }
    }

    // The start of the opening hours ("10:00-02:00" -> "10:00")
    private String openingTime() {
        String hours = settings.text("openHours", "");
        if (hours.isEmpty()) return null;
        return clock(hours.split(",")[0].split("-")[0]);
    }

    // The box's own media volume, from tvVolume (percent) in settings.json
    private void applyTvVolume() {
        int v = settings.number("tvVolume", 0);
        if (v <= 0 || v > 100 || audio == null || audio.isVolumeFixed()) return;
        int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.max(1, Math.round(max * v / 100f)), 0);
    }

    // controlPin from settings.json (4 to 8 digits), otherwise this TV's own random PIN
    private String choosePin() {
        String fromFile = settings.text("controlPin", "");
        if (fromFile.matches("\\d{4,8}")) return fromFile;
        SharedPreferences p = getSharedPreferences("phone", MODE_PRIVATE);
        String own = p.getString("pin", "");
        if (!own.matches("\\d{4}")) {
            own = String.format(Locale.US, "%04d", new SecureRandom().nextInt(10000));
            p.edit().putString("pin", own).apply();
        }
        return own;
    }

    // The network address can arrive late (Wi-Fi after power-on) or change, and the
    // TV's name can be changed on the phone page
    private void refreshNetwork(boolean force) {
        String now = Net.localIp();
        String own = settings.text("tvName", "");
        String name = own.isEmpty() ? autoName(now) : own;
        if (!force && now.equals(ip) && name.equals(tvName) && finder != null) return;
        ip = now;
        tvName = name;
        if (finder != null) finder.stop();
        finder = new TvFinder(this, tvName);
        if (!ip.isEmpty() && server != null) finder.start(server.port());
    }

    // "TV 23" from 192.168.1.23
    private static String autoName(String address) {
        return address.isEmpty() ? "TV" : "TV " + address.substring(address.lastIndexOf('.') + 1);
    }

    /* ---------- test mode: the app's own details on screen ---------- */

    private final Runnable overlayTick = new Runnable() {
        @Override
        public void run() {
            if (!testMode) return;
            overlay.setText(appInfo());
            handler.postDelayed(this, 2000);
        }
    };

    private String appInfo() {
        StringBuilder b = new StringBuilder();
        int port = server == null ? 0 : server.port();
        b.append(port > 0 && !ip.isEmpty() ? "Phone control: http://" + ip + ":" + port + "   PIN " + pin
                : "Phone control: not ready (no network yet)");
        StringBuilder others = new StringBuilder();
        for (String[] t : finder == null ? new java.util.ArrayList<String[]>() : finder.others()) {
            others.append(others.length() > 0 ? ", " : "").append(t[0]);
        }
        b.append("\nThis is ").append(tvName).append(".  Other TVs: ").append(others.length() > 0 ? others : "none found yet");
        b.append("\nSettings: ").append(settings.status);
        b.append("\nSound levelling: ").append(leveller.status);
        if (audio != null) {
            b.append("\nTV volume: ");
            if (audio.isVolumeFixed()) b.append("set by the TV itself");
            else b.append(audio.getStreamVolume(AudioManager.STREAM_MUSIC)).append(" of ")
                    .append(audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))
                    .append(settings.number("tvVolume", 0) > 0 ? "  (set to " + settings.number("tvVolume", 0) + "% at opening time and every night)" : "");
        }
        b.append("\nUpdates: ").append(settings.flag("updates", true) ? updater.status : "off in settings.json");
        b.append("\nWi-Fi kept at full power: ").append(wifiLock != null && wifiLock.isHeld() ? "yes" : "no (cable, or no Wi-Fi)");
        b.append("\nApp build ").append(BuildConfig.VERSION_NAME);
        return b.toString();
    }

    /* ---------- the phone control page ---------- */

    private final ControlServer.Tv phone = new ControlServer.Tv() {
        @Override
        public String pin() {
            return pin;
        }

        @Override
        public byte[] page() {
            if (controlPage == null) controlPage = readAsset("control.html");
            return controlPage;
        }

        @Override
        public String status() {
            return statusJson();
        }

        @Override
        public boolean command(String what) {
            return runCommand(what);
        }

        @Override
        public String settings() {
            return settingsJson();
        }

        @Override
        public String saveSettings(String body, boolean all) {
            return saveFromPhone(body, all);
        }
    };

    // For the phone's Settings screen: built-in values, settings.json, and this TV's own
    private String settingsJson() {
        try {
            String d = callPage("window.TwilightTV && TwilightTV.settingsInfo ? TwilightTV.settingsInfo().defaults : null");
            if (d != null && !d.equals("null")) settings.savePageDefaults(d);
            JSONObject defaults = new JSONObject(settings.pageDefaults());
            defaults.put("tvName", "");
            defaults.put("tvVolume", 0);
            defaults.put("controlPin", "");
            defaults.put("levelSound", true);
            defaults.put("restartAt", "05:00");
            defaults.put("updates", true);
            JSONObject o = new JSONObject();
            o.put("tv", tvName);
            o.put("autoName", autoName(ip));
            o.put("defaults", defaults);
            o.put("file", settings.fromFile());
            o.put("local", settings.local());
            JSONArray others = new JSONArray();
            List<String[]> list = finder == null ? null : finder.others();
            if (list != null) {
                for (String[] t : list) others.put(t[0]);
            }
            o.put("others", others);
            return o.toString();
        } catch (Exception e) {
            return "{\"error\":" + JSONObject.quote(e.toString()) + "}";
        }
    }

    // This TV's own settings from the phone; with "all", the same on the other TVs too
    private String saveFromPhone(String body, boolean all) {
        JSONObject clean = new JSONObject();
        try {
            JSONObject mine = new JSONObject(body).optJSONObject("local");
            if (mine == null) return null;
            for (Iterator<String> it = mine.keys(); it.hasNext(); ) {
                String k = it.next();
                if (k.matches("[A-Za-z][A-Za-z0-9]{0,40}")) clean.put(k, mine.get(k));
            }
        } catch (Exception e) {
            return null;
        }
        String oldPin = pin;
        settings.setLocal(clean);
        runOnMain(new Runnable() {
            @Override
            public void run() {
                settingsChanged();
            }
        });
        try {
            JSONObject result = new JSONObject();
            result.put("ok", true);
            result.put("pin", pin);                        // it may have just changed
            result.put("tv", tvName);
            JSONArray done = new JSONArray();
            if (all && finder != null) {
                JSONObject forOthers = new JSONObject(clean.toString());
                forOthers.remove("tvName");                // each TV keeps its own name
                String payload = new JSONObject().put("local", forOthers).toString();
                for (String[] t : finder.others()) {
                    done.put(new JSONObject().put("name", t[0]).put("result", forward(t[1], oldPin, payload)));
                }
            }
            result.put("others", done);
            return result.toString();
        } catch (Exception e) {
            return "{\"ok\":true}";
        }
    }

    // Saves the same settings on another TV, through its own phone page
    private static String forward(String base, String pin, String payload) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(base + "api/settings?all=0&pin=" + URLEncoder.encode(pin, "UTF-8")).openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(4000);
            c.setReadTimeout(8000);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] b = payload.getBytes("UTF-8");
            c.setFixedLengthStreamingMode(b.length);
            OutputStream o = c.getOutputStream();
            o.write(b);
            o.close();
            int code = c.getResponseCode();
            if (code == 200) return "saved";
            if (code == 401) return "has a different PIN, so it wasn't changed";
            if (code == 429) return "is locked for a few minutes (too many wrong PINs)";
            return "couldn't save (" + code + ")";
        } catch (Exception e) {
            return "couldn't be reached";
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private String statusJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("tv", tvName);
            o.put("build", BuildConfig.VERSION_NAME);
            o.put("onScreen", visible);
            o.put("qualitySetup", inQualitySetup());
            String page = callPage("window.TwilightTV ? TwilightTV.status() : null");
            o.put("page", page == null || page.equals("null") ? JSONObject.NULL : new JSONObject(page));
            if (audio != null) {
                o.put("tvVolumeFixed", audio.isVolumeFixed());
                o.put("tvVolume", audio.getStreamVolume(AudioManager.STREAM_MUSIC));
                o.put("tvVolumeMax", audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
            }
            o.put("levelling", leveller.status);
            o.put("settings", settings.status);
            o.put("updateReady", updater.readyBuild);
            o.put("updateStatus", settings.flag("updates", true) ? updater.status : "off in settings.json");
            o.put("notice", System.currentTimeMillis() - noticeAt < 120000L ? notice : "");
            JSONArray others = new JSONArray();
            List<String[]> list = finder == null ? null : finder.others();
            if (list != null) {
                for (String[] t : list) others.put(new JSONObject().put("name", t[0]).put("url", t[1]));
            }
            o.put("others", others);
            return o.toString();
        } catch (Exception e) {
            return "{\"tv\":" + JSONObject.quote(tvName) + ",\"error\":" + JSONObject.quote(e.toString()) + "}";
        }
    }

    private boolean runCommand(final String what) {
        switch (what) {
            case "next":
            case "pause":
            case "resume":
            case "vol+":
            case "vol-":
            case "zoom+":
            case "zoom-":
            case "reload":
                return "true".equals(callPage("window.TwilightTV ? TwilightTV.command(" + JSONObject.quote(what) + ") : false"));
            case "identify":
                return "true".equals(callPage("window.TwilightTV ? TwilightTV.command(" + JSONObject.quote("identify:" + tvName) + ") : false"));
            case "tvvol+":
            case "tvvol-":
                if (audio == null || audio.isVolumeFixed()) return false;
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,
                                what.equals("tvvol+") ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI);
                    }
                });
                return true;
            case "update":
                final String[] message = { null };
                runOnMain(new Runnable() {
                    @Override
                    public void run() {
                        message[0] = updater.install(MainActivity.this);
                    }
                });
                notice = message[0] == null ? "" : message[0];
                noticeAt = System.currentTimeMillis();
                return message[0] != null;
            case "qualitysetup":
            case "qualitydone":
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        if (what.equals("qualitysetup")) startQualitySetup();
                        else endQualitySetup();
                    }
                });
                return true;
            case "testmode":
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        toggleTestMode();
                    }
                });
                return true;
            case "restart":
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        restartWebView();
                    }
                });
                return true;
            case "forget":
                return "true".equals(callPage("window.TwilightTV ? TwilightTV.command('forget') : false"));
            case "checkupdate":
                work.execute(new Runnable() {
                    @Override
                    public void run() {
                        updater.check();
                    }
                });
                return true;
            default:
                return false;
        }
    }

    // Runs JavaScript in the page and waits (up to 3 seconds) for its answer
    private String callPage(final String js) {
        final String[] out = { null };
        final CountDownLatch done = new CountDownLatch(1);
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (web == null || !visible) {
                    done.countDown();
                    return;
                }
                web.evaluateJavascript(js, new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        out[0] = value;
                        done.countDown();
                    }
                });
            }
        });
        try {
            done.await(3, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return out[0];
    }

    private void runOnMain(final Runnable r) {
        final CountDownLatch done = new CountDownLatch(1);
        handler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    r.run();
                } finally {
                    done.countDown();
                }
            }
        });
        try {
            done.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private byte[] readAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            try {
                ByteArrayOutputStream b = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
                return b.toByteArray();
            } finally {
                in.close();
            }
        } catch (IOException e) {
            return new byte[0];
        }
    }

    /** What the page can ask the app. Settings never include the PIN. */
    private final class Bridge {
        @JavascriptInterface
        public String settings() {
            return settings.forPage();
        }

        @JavascriptInterface
        public int settingsVersion() {
            return settings.version();
        }

        @JavascriptInterface
        public void alive() {
            lastAlive = System.currentTimeMillis();
        }
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
            handler.post(new Runnable() {
                @Override
                public void run() {
                    makeWebView();
                    if (visible) open();
                }
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
