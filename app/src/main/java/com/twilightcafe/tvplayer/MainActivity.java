package com.twilightcafe.tvplayer;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Point;
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
import android.view.Display;
import android.view.Gravity;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.math.BigInteger;
import java.net.URLEncoder;
import java.nio.charset.Charset;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Shows the café TV page full screen, and around it:
 *  - settings.json from GitHub (no reinstall needed for changes),
 *  - the phone control page on the café Wi-Fi (with a PIN),
 *  - the box's own volume at opening time, sound levelling, updates from GitHub,
 *  - Wi-Fi kept at full power, a restart if the page ever freezes, a fresh start every night,
 *  - for the info panel beside the video: song names (YouTube), the weather (MET Norway),
 *    gold and currency prices (tirezh.com) and the café's own pictures (uploaded from the phone page).
 *
 * The page runs in Firefox's engine (GeckoView), which comes inside the app: the TV boxes'
 * own engine (Android System WebView) is from 2018, too old for YouTube's controls, and they
 * won't take a newer one. Firefox's engine has no way for the app to hand the page an
 * object, so the app's small web server serves the page (assets/index.html) at
 * http://localhost to this box only, with assets/bridge.js put in at the top. The page
 * checks in every second: what it's doing and that it's alive; the app answers with
 * settings and the phone's commands. YouTube's player itself is left exactly as YouTube
 * sends it.
 */
public class MainActivity extends Activity {

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static GeckoRuntime runtime;                 // Firefox's engine: one for the whole app
    private static String formatStarted;                 // the video format it started with (videoFormat)
    private static String engineStarted;                 // and its whole start-up settings file
    static final int NIGHT_BLUE = 0xFF0B1030;            // the café screen's colour, so start-up never flashes white

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService work = Executors.newSingleThreadExecutor();
    private final ExecutorService feeds = Executors.newSingleThreadExecutor();   // the weather (never waits behind an update download)
    private FrameLayout root;
    private GeckoView web;                               // shows the page
    private GeckoSession session;                        // the page itself, in Firefox's engine
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
    private byte[] tvPageHtml;                           // assets/index.html
    private String bridgeJs;                             // assets/bridge.js
    // The link with the page: only the page this app opened knows the key
    private final String pageKey = new BigInteger(80, new SecureRandom()).toString(36);
    private volatile String pageStatus;                  // what the page last said it's doing
    private volatile String pageSong = "";              // the song it's playing (a new one: the box's volume back to tvVolume)
    private volatile long pageStatusAt;
    private final List<Object[]> pageCommands = new ArrayList<>();   // {time, command} for the page's next check-in
    private TitleBook titles;                            // song names, from YouTube
    private WeatherFeed weather;                         // from MET Norway
    private PriceFeed prices;                            // gold and currency prices, from tirezh.com
    private PrayerFeed prayerTimes;                      // the call to prayer's times, from amozhgary.tv
    private PictureStore pictures;                       // the café's own, from the phone page
    private volatile List<String> pageSongs = Collections.emptyList();   // the page's songs (its playlist first)
    private volatile int songsVersion = 0;

    private volatile long lastAlive = 0;                 // the page's last "I'm alive"
    private long pageOpenedAt = 0, lastReload = 0, startedAt = 0, lastSettingsCheck = 0, lastUpdateCheck = 0;
    private int reloadsInRow = 0, tvVolumeSetting = 0;
    private long qualitySetupUntil = 0;                  // YouTube's own controls on screen until then
    private String engineName = "";                      // Android's web engine, which draws the page and YouTube's player
    private int engineMajor = 0;                         // its Chrome version
    private String restartDoneDay = "", openingDoneDay = "";
    private volatile JSONObject box;                     // what the TV box is (BoxInfo), once read
    private volatile int boxVersion = 0;
    private volatile boolean softDraw = false;           // Firefox's engine can't use the box's graphics
    private int[] systemMode;                            // the screen mode the box chose itself {w, h, hz x 100}
    private int systemDrawnH;                            // and the lines the app was drawn with in it

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
        makeFeeds();
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
        readEngine();
        readBox();
        handler.postDelayed(new Runnable() {             // once the screen has settled in the box's own mode
            @Override
            public void run() {
                applyScreenMode();
            }
        }, 4000);
        server = new ControlServer(phone);
        server.start();
        refreshNetwork(false);
        askToStartWithTv();
        handler.postDelayed(maintenance, 3000);
    }

    // Song names, the weather and the café's pictures, for the info panel and between songs
    private void makeFeeds() {
        // Who is asking, with a link: MET Norway asks every app for this
        String repo = BuildConfig.REPO == null || BuildConfig.REPO.isEmpty() ? "helinomerrania/twilight-tv-android" : BuildConfig.REPO;
        final String agent = "TwilightTV/" + BuildConfig.VERSION_NAME + " (+https://github.com/" + repo + ")";
        titles = new TitleBook(new File(getFilesDir(), "titles.json"), new TitleBook.Fetcher() {
            @Override
            public Net.Reply get(String url) throws IOException {
                return Net.fetch(url, 15000, agent, null);
            }
        });
        weather = new WeatherFeed(new File(getFilesDir(), "weather.json"), new WeatherFeed.Fetcher() {
            @Override
            public Net.Reply get(String url, String ifModifiedSince) throws IOException {
                return Net.fetch(url, 20000, agent, ifModifiedSince);
            }
        });
        prices = new PriceFeed(new File(getFilesDir(), "prices.json"), new PriceFeed.Fetcher() {
            @Override
            public Net.Reply get(String url) throws IOException {
                return Net.fetch(url, 20000, agent, null);
            }
        });
        prayerTimes = new PrayerFeed(new File(getFilesDir(), "prayers.json"), new PrayerFeed.Fetcher() {
            @Override
            public Net.Reply get(String url) throws IOException {
                return Net.fetch(url, 20000, agent, null, "text/html");
            }
        });
        pictures = new PictureStore(new File(getFilesDir(), "pictures"));
    }

    // The town on amozhgary.tv ("" = the TV works it all out): its prayer times, when the music pauses for
    // them, and its Hijri dates, for the info panel
    private String prayerCity() {
        boolean wanted = settings.number("prayerPause", 5) > 0 || settings.flag("infoPanel", true);
        return wanted ? settings.text("prayerCity", "Ranya").trim() : "";
    }

    // Where the prices come from: pricesUrl (the tirezh worker at another address), else tirezh.com
    private String pricesUrl() {
        return PriceFeed.address(settings.text("pricesUrl", ""));
    }

    // Prices only when the panel shows some (the built-in choice: the dollar and gold)
    private boolean wantsPrices() {
        JSONArray items = settings.list("priceItems");
        return settings.flag("infoPanel", true) && (items == null || items.length() > 0);
    }

    // Where the weather is for: lat/lon from the settings, else the page's built-in place (Ranya)
    private double[] place() {
        double lat = settings.decimal("lat", Double.NaN), lon = settings.decimal("lon", Double.NaN);
        if (Double.isNaN(lat) || Double.isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            try {
                JSONObject d = new JSONObject(settings.pageDefaults());
                lat = d.optDouble("lat", 36.2549);
                lon = d.optDouble("lon", 44.8838);
            } catch (JSONException e) {
                lat = 36.2549;
                lon = 44.8838;
            }
        }
        return new double[] { lat, lon };
    }

    @SuppressWarnings("deprecation")
    private static WifiManager.WifiLock makeWifiLock(WifiManager wifi) {
        WifiManager.WifiLock lock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "twilight-tv");
        lock.setReferenceCounted(false);
        return lock;
    }

    // Firefox's engine starts once for the whole app, and stays. Its start-up settings file says
    // which video formats it offers YouTube (videoFormat); it's read only now, at the start.
    private GeckoRuntime runtime() {
        if (runtime == null) {
            GeckoRuntimeSettings.Builder rs = new GeckoRuntimeSettings.Builder()
                    .javaScriptEnabled(true)
                    .consoleOutput(false)
                    .doubleTapZoomingEnabled(false)
                    .inputAutoZoomEnabled(false)
                    .automaticFontSizeAdjustment(false);    // the page sizes its own text for the TV
            String format = VideoSetup.format(settings.text("videoFormat", "h264")), yaml = engineYaml();
            File config = new File(getFilesDir(), "engine-config.yaml");
            try {
                TitleBook.writeFile(config, yaml);
                rs.configFilePath(config.getAbsolutePath());
                formatStarted = format;
                engineStarted = yaml;
            } catch (IOException e) {
                formatStarted = "any";                      // couldn't write it: the engine's own choice
                engineStarted = VideoSetup.engineConfig("any", false);
            }
            runtime = GeckoRuntime.create(getApplicationContext(), rs.build());
        }
        return runtime;
    }

    // The engine's start-up settings: the video format, and its frame counter on the screen for testing
    private String engineYaml() {
        return VideoSetup.engineConfig(settings.text("videoFormat", "h264"), settings.flag("engineNumbers", false));
    }

    // The video format setting changed since the engine started
    private boolean formatChanged() {
        return formatStarted != null && !formatStarted.equals(VideoSetup.format(settings.text("videoFormat", "h264")));
    }

    // Any of the engine's start-up settings changed since it started: that takes a fresh start of the app
    private boolean engineChanged() {
        return engineStarted != null && !engineStarted.equals(engineYaml());
    }

    // The whole app again from scratch, so Firefox's engine starts again too (only while on screen:
    // Android doesn't let an app open itself from the background)
    private void restartApp() {
        if (!visible) {
            restartWebView();
            return;
        }
        try {
            Restart.now(this);
        } catch (RuntimeException e) {
            restartWebView();                                // couldn't: at least a fresh page
        }
    }

    /* ---------- the TV box: what it is, and the screen mode ---------- */

    // What the box is (for the phone page, test mode and the page's picture quality): read once, in
    // the background, as the graphics check takes a moment
    private void readBox() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                JSONObject b = new JSONObject();
                try {
                    b.put("box", BoxInfo.box());
                    String[] g = BoxInfo.graphics();
                    boolean soft = g != null && VideoSetup.softDraw(g[0], g[1]);
                    b.put("graphics", g == null ? "" : g[0] + (VideoSetup.gl(g[1]).isEmpty() ? "" : ", " + VideoSetup.gl(g[1])));
                    b.put("softDraw", soft);
                    b.put("decoders", BoxInfo.decoders());
                    softDraw = soft;
                } catch (JSONException | RuntimeException e) {
                    // what was read so far
                }
                box = b;
                boxVersion++;
            }
        }, "box-info").start();
    }

    // The screen mode from the settings: at most 1080 lines (screenSize) when the box draws more,
    // and 50 or 60 Hz (screenRate). The box's own mode is read first, before the app asks for any.
    private void applyScreenMode() {
        try {
            Display d = getWindowManager().getDefaultDisplay();
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            if (systemMode == null) {
                if (lp.preferredDisplayModeId != 0) return;
                int[] m = BoxInfo.mode(d.getMode());
                Point p = new Point();
                d.getRealSize(p);
                systemMode = new int[] { m[1], m[2], m[3] };
                systemDrawnH = Math.min(p.x, p.y);
            }
            int id = VideoSetup.pickMode(BoxInfo.modes(d), systemMode, systemDrawnH,
                    settings.text("screenSize", "1080"), settings.text("screenRate", "box"));
            if (lp.preferredDisplayModeId != id) {
                lp.preferredDisplayModeId = id;
                getWindow().setAttributes(lp);
            }
        } catch (RuntimeException e) {
            // this box can't change its screen mode
        }
    }

    // "drawn at 1920x1080, sent to the TV as 1920x1080, 60 Hz (it also has 50 Hz)"
    private String screenFacts() {
        try {
            Display d = getWindowManager().getDefaultDisplay();
            int[] m = BoxInfo.mode(d.getMode());
            Point p = new Point();
            d.getRealSize(p);
            String s = "drawn at " + p.x + "x" + p.y + ", sent to the TV as " + VideoSetup.mode(m[1], m[2], m[3]);
            String other = VideoSetup.otherRates(BoxInfo.modes(d), m[1], m[2], m[3]);
            if (!other.isEmpty()) s += " (it also has " + other + ")";
            int[] own = systemMode;
            if (own != null && (own[1] != m[2] || Math.abs(own[2] - m[3]) >= 5)) s += "; the box's own mode is " + VideoSetup.mode(own[0], own[1], own[2]);
            return s;
        } catch (RuntimeException e) {
            return "";
        }
    }

    private void makeWebView() {
        try {
            web = new GeckoView(this);
            session = newSession();
        } catch (RuntimeException e) {
            // the engine couldn't start: try again in 10 seconds
            web = null;
            session = null;
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
        web.coverUntilFirstPaint(NIGHT_BLUE);           // no white flash before the café screen
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        web.setSession(session);
        root.addView(web, 0, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.requestFocus();                             // remote keys go to the page (volume, zoom)
    }

    private GeckoSession newSession() {
        GeckoSession s = new GeckoSession(new GeckoSessionSettings.Builder()
                .usePrivateMode(false)                  // the page remembers the shuffle, volumes and zooms
                .useTrackingProtection(false)           // YouTube's player as in a normal browser
                .suspendMediaWhenInactive(false)
                .userAgentMode(GeckoSessionSettings.USER_AGENT_MODE_MOBILE)
                .viewportMode(GeckoSessionSettings.VIEWPORT_MODE_MOBILE)
                .build());
        s.setPermissionDelegate(new GeckoSession.PermissionDelegate() {
            @Override
            public GeckoResult<Integer> onContentPermissionRequest(GeckoSession session, GeckoSession.PermissionDelegate.ContentPermission perm) {
                // The music starts with sound by itself, no tap needed. Nothing else is allowed.
                boolean autoplay = perm.permission == PERMISSION_AUTOPLAY_AUDIBLE || perm.permission == PERMISSION_AUTOPLAY_INAUDIBLE;
                return GeckoResult.fromValue(autoplay ? GeckoSession.PermissionDelegate.ContentPermission.VALUE_ALLOW
                        : GeckoSession.PermissionDelegate.ContentPermission.VALUE_DENY);
            }
        });
        s.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            // The TV never leaves the page (YouTube's player inside it loads normally)
            @Override
            public GeckoResult<AllowOrDeny> onLoadRequest(GeckoSession session, GeckoSession.NavigationDelegate.LoadRequest request) {
                return ownPage(request.uri) ? GeckoResult.allow() : GeckoResult.deny();
            }

            @Override
            public GeckoResult<GeckoSession> onNewSession(GeckoSession session, String uri) {
                return null;                            // and opens no new windows
            }
        });
        s.setContentDelegate(new GeckoSession.ContentDelegate() {
            // The engine crashed or Android closed it to free memory: start the page again
            @Override
            public void onCrash(GeckoSession session) {
                engineGone(session);
            }

            @Override
            public void onKill(GeckoSession session) {
                engineGone(session);
            }
        });
        s.open(runtime());
        return s;
    }

    private boolean ownPage(String uri) {
        return uri != null && (uri.equals("about:blank") || (server != null && uri.startsWith("http://localhost:" + server.port() + "/tv/")));
    }

    private void engineGone(final GeckoSession gone) {
        handler.post(new Runnable() {
            @Override
            public void run() {
                if (gone == session) restartWebView();
            }
        });
    }

    private void open() {
        syncOverlays();
        if (web == null || session == null) return;
        pageOpenedAt = lastAlive = System.currentTimeMillis();
        int port = server == null ? 0 : server.port();
        if (port == 0) return;                          // no web server: the watchdog tries again
        session.setActive(true);
        boolean setup = inQualitySetup();
        useComputerPlayer(setup);
        // Quality setup leaves test mode's details out: they would cover YouTube's controls
        session.loadUri("http://localhost:" + port + "/tv/index.html?k=" + pageKey
                + (setup ? "&setup=quality" : testMode ? "&debug=1" : ""));
    }

    // Quality setup asks YouTube for the version of its player it gives computers, as a browser's
    // "Desktop site" option does. Its controls appear when the pointer moves over the video, and
    // stay while it's paused; the gear is at the bottom right.
    private void useComputerPlayer(boolean on) {
        session.getSettings().setUserAgentMode(on ? GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
                : GeckoSessionSettings.USER_AGENT_MODE_MOBILE);
    }

    // Firefox's engine comes with the app, so it's as new as the app
    private void readEngine() {
        String ua = "";
        try {
            ua = GeckoSession.getDefaultUserAgent();
        } catch (RuntimeException e) {
            // not known
        }
        Matcher m = Pattern.compile("rv:(\\d+)(\\.\\d+)?").matcher(ua == null ? "" : ua);
        String version = "";
        if (m.find()) {
            engineMajor = Integer.parseInt(m.group(1));
            version = m.group(1) + (m.group(2) == null ? "" : m.group(2));
        }
        engineName = "Firefox's engine (GeckoView" + (version.isEmpty() ? "" : " " + version) + ", built into this app)";
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
        pointer.pressed();                                               // the arrow flashes, so OK is seen to work
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

        private final Runnable unpress = new Runnable() {
            @Override
            public void run() {
                fill.setColor(0xFFFFFFFF);
                invalidate();
            }
        };

        // A click: gold for a moment
        void pressed() {
            fill.setColor(0xFFFFCF8A);
            invalidate();
            removeCallbacks(unpress);
            postDelayed(unpress, 250);
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
        closeEngineView();
        makeWebView();
        if (visible) open();
    }

    private void closeEngineView() {
        if (web != null) {
            web.releaseSession();
            root.removeView(web);
            web = null;
        }
        if (session != null) {
            session.close();
            session = null;
        }
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
        if (session != null) {
            session.loadUri("about:blank");
            session.setActive(false);
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        work.shutdownNow();
        feeds.shutdownNow();
        if (server != null) server.stop();
        if (finder != null) finder.stop();
        leveller.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        closeEngineView();
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
            // The weather (only while on screen, as MET asks; WeatherAPI.com with a key), and song names after an internet cut
            if (visible && settings.flag("infoPanel", true)) {
                final double[] ll = place();
                final String key = settings.text("weatherKey", "").trim();
                if (weather.due(now, ll[0], ll[1], key)) {
                    feeds.execute(new Runnable() {
                        @Override
                        public void run() {
                            weather.refresh(ll[0], ll[1], key);
                        }
                    });
                }
            }
            final String city = prayerCity();
            if (visible && !city.isEmpty() && prayerTimes.due(now, city)) {
                feeds.execute(new Runnable() {
                    @Override
                    public void run() {
                        prayerTimes.refresh(city);
                    }
                });
            }
            final String priceUrl = pricesUrl();
            if (visible && wantsPrices() && prices.due(now, priceUrl)) {
                feeds.execute(new Runnable() {
                    @Override
                    public void run() {
                        prices.refresh(priceUrl);
                    }
                });
            }
            titles.start();
            String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
            String time = new SimpleDateFormat("HH:mm", Locale.US).format(new Date(now));
            String restartAt = clock(settings.text("restartAt", "05:00"));
            if (visible && time.equals(restartAt) && !today.equals(restartDoneDay)) {
                restartDoneDay = today;                                   // a fresh start every night:
                if (engineChanged()) restartApp();                        // the whole app, for the engine's new settings
                else restartWebView();
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
        applyScreenMode();
        // the page sees the new settings by itself and uses them at once; a new video format waits
        // for the app's next start (from the phone at once, from settings.json at night)
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

    // The box's own media volume, from tvVolume (percent) in the settings: at every new song, at
    // opening time and every night
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
                    .append(settings.number("tvVolume", 0) > 0 ? "  (back to " + settings.number("tvVolume", 0) + "% at every new song)" : "");
        }
        b.append("\nUpdates: ").append(settings.flag("updates", true) ? updater.status : "off in settings.json");
        b.append("\nWi-Fi kept at full power: ").append(wifiLock != null && wifiLock.isHeld() ? "yes" : "no (cable, or no Wi-Fi)");
        b.append("\nWeather: ").append(weather.status);
        b.append("\nPrices: ").append(wantsPrices() ? prices.status : "none chosen");
        b.append("\nPrayer times: ").append(prayerCity().isEmpty() ? "worked out by the page" : prayerTimes.status);
        b.append("\nSong names: ").append(titles.describe(pageSongs));
        b.append("\nWeb engine: ").append(engineName.isEmpty() ? "not known" : engineName);
        b.append("\nVideo from YouTube: ").append(VideoSetup.describe(formatStarted))
                .append(formatChanged() ? "  (" + VideoSetup.describe(settings.text("videoFormat", "h264")) + " from the app's next start)" : "");
        JSONObject bx = box;
        if (bx != null) {
            b.append("\nBox: ").append(bx.optString("box"));
            b.append("\nGraphics: ").append(bx.optString("graphics").isEmpty() ? "not known" : bx.optString("graphics"))
                    .append(bx.optBoolean("softDraw") ? "  (too old for Firefox's engine: it draws on the processor)" : "");
            b.append("\nThe chip decodes: ").append(bx.optString("decoders").isEmpty() ? "not known" : bx.optString("decoders"));
        }
        b.append("\nScreen: ").append(screenFacts());
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

        @Override
        public byte[] tvPage() {
            return tvPageWithBridge();
        }

        @Override
        public String tvSync(String key, String body) {
            return pageCheckIn(key, body);
        }

        @Override
        public String songs() {
            try {
                List<String> ids = pageSongs;
                return new JSONObject().put("songs", titles.list(ids)).put("names", titles.describe(ids)).toString();
            } catch (JSONException e) {
                return null;
            }
        }

        @Override
        public String pictures() {
            return "{\"pictures\":" + pictures.listJson() + ",\"max\":" + PictureStore.MAX + "}";
        }

        @Override
        public String addPicture(String body) {
            try {
                JSONObject o = new JSONObject(body);
                String id = pictures.add(o.optString("full", ""), o.optString("small", ""));
                return new JSONObject().put("ok", true).put("id", id).toString();
            } catch (IllegalArgumentException e) {
                return "{\"ok\":false,\"message\":" + JSONObject.quote(e.getMessage()) + "}";
            } catch (JSONException e) {
                return "{\"ok\":false,\"message\":\"That picture didn't arrive whole. Try again.\"}";
            }
        }

        @Override
        public boolean deletePicture(String id) {
            return pictures.remove(id);
        }

        @Override
        public byte[] picture(String id, boolean small) {
            return pictures.read(id, small);
        }

        @Override
        public byte[] asset(String name) {
            byte[] b = readAsset(name);
            return b.length == 0 ? null : b;
        }

        @Override
        public byte[] look(String name) {
            if (!name.matches("[a-z]{1,20}")) return null;
            byte[] b = readAsset("looks/" + name + ".jpg");
            return b.length == 0 ? null : b;
        }
    };

    /* ---------- the link with the page (Firefox's engine has no other way) ---------- */

    // The page as the box's engine gets it: with assets/bridge.js put in at the top
    private byte[] tvPageWithBridge() {
        if (tvPageHtml == null) tvPageHtml = readAsset("index.html");
        if (bridgeJs == null) bridgeJs = new String(readAsset("bridge.js"), UTF8);
        try {
            JSONObject boot = new JSONObject();
            boot.put("k", pageKey);
            boot.put("v", settings.version());
            boot.put("s", settings.forPage());              // settings never include the PIN
            boot.put("xv", extrasVersion());
            boot.put("x", extras());                        // song names, weather, pictures
            return TvPage.withBridge(tvPageHtml, bridgeJs, boot.toString());
        } catch (JSONException e) {
            return null;
        }
    }

    // The page's check-in, every second: what it's doing and that it's alive. The answer
    // has new settings (when they changed) and the phone's commands.
    private String pageCheckIn(String key, String body) {
        if (key == null || !key.equals(pageKey)) return null;
        try {
            JSONObject in = new JSONObject(body == null || body.isEmpty() ? "{}" : body);
            long now = System.currentTimeMillis();
            if (in.optBoolean("alive")) lastAlive = now;
            JSONObject st = in.optJSONObject("status");
            if (st != null) {
                pageStatus = st.toString();
                pageStatusAt = now;
                JSONObject song = st.optJSONObject("song");
                String id = song == null ? "" : song.optString("id", "");
                if (!id.isEmpty() && !id.equals(pageSong)) {
                    pageSong = id;                          // every new song starts at the box volume from the settings,
                    handler.post(new Runnable() {           // whatever the remote did to the last one
                        @Override
                        public void run() {
                            applyTvVolume();
                        }
                    });
                }
            }
            JSONObject info = in.optJSONObject("info");
            if (info != null && info.optJSONObject("defaults") != null) settings.savePageDefaults(info.getJSONObject("defaults").toString());
            JSONArray ids = in.optJSONArray("ids");
            if (ids != null) {                              // the page's songs changed (a new playlist, a song from a link)
                pageSongs = Collections.unmodifiableList(TitleBook.ids(ids));
                songsVersion++;
                titles.want(pageSongs);
            }
            JSONObject out = new JSONObject();
            int v = settings.version();
            out.put("v", v);
            if (in.optInt("v", -1) != v) out.put("s", settings.forPage());
            int xv = extrasVersion();
            if (in.optInt("xv", -1) != xv) {
                out.put("xv", xv);
                out.put("x", extras());
            }
            JSONArray cmds = new JSONArray();
            synchronized (pageCommands) {
                for (Object[] c : pageCommands) {
                    if (now - (Long) c[0] < 15000L) cmds.put(c[1]);     // older ones were meant for an earlier moment
                }
                pageCommands.clear();
            }
            out.put("cmds", cmds);
            return out.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    // Song names, weather and pictures change now and then; the page gets them again when they do
    private int extrasVersion() {
        return titles.version() + weather.version() + prices.version() + prayerTimes.version() + pictures.version() + songsVersion + boxVersion;
    }

    private String extras() {
        try {
            JSONObject x = new JSONObject();
            x.put("titles", titles.forPage(pageSongs));
            JSONObject w = weather.forPage();
            if (w != null) x.put("weather", w);
            JSONObject p = prices.forPage();
            if (p != null) x.put("prices", p);
            JSONObject pt = prayerCity().isEmpty() ? null : prayerTimes.forPage();
            if (pt != null) x.put("prayers", pt);
            JSONArray pics = new JSONArray();
            for (String id : pictures.ids()) pics.put(id);
            x.put("pictures", pics);
            if (box != null) x.put("box", new JSONObject().put("softDraw", softDraw));   // automatic quality: 720p then
            return x.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }

    // For the page's next check-in (within a second)
    private boolean toPage(String command) {
        if (!visible || web == null) return false;
        synchronized (pageCommands) {
            pageCommands.add(new Object[] { System.currentTimeMillis(), command });
        }
        return true;
    }

    // What the page last said it's doing (nothing if it hasn't checked in for 10 seconds)
    private String pageNow() {
        return visible && System.currentTimeMillis() - pageStatusAt < 10000L ? pageStatus : null;
    }

    // For the phone's Settings screen: built-in values, settings.json, and this TV's own
    private String settingsJson() {
        try {
            // the page's built-in values arrive with its first check-in
            JSONObject defaults = new JSONObject(settings.pageDefaults());
            defaults.put("tvName", "");
            defaults.put("tvVolume", 0);
            defaults.put("controlPin", "");
            defaults.put("levelSound", true);
            defaults.put("restartAt", "05:00");
            defaults.put("updates", true);
            defaults.put("weatherKey", "");
            defaults.put("videoFormat", "h264");
            defaults.put("screenSize", "1080");
            defaults.put("screenRate", "box");
            defaults.put("engineNumbers", false);
            defaults.put("pricesUrl", "");
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
            if (engineChanged()) {                         // the engine's start-up settings: the app starts again (after this answer)
                result.put("restarting", true);
                handler.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        if (engineChanged()) restartApp();
                    }
                }, 2000);
            }
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
            o.put("engine", engineName);
            o.put("engineMajor", engineMajor);
            o.put("videoFormat", VideoSetup.describe(formatStarted));
            o.put("videoFormatNext", formatChanged() ? VideoSetup.describe(settings.text("videoFormat", "h264")) : "");
            JSONObject bx = box;
            if (bx != null) o.put("box", bx);
            o.put("screen", screenFacts());
            o.put("onScreen", visible);
            o.put("qualitySetup", inQualitySetup());
            String page = pageNow();
            o.put("page", page == null ? JSONObject.NULL : new JSONObject(page));
            if (audio != null) {
                o.put("tvVolumeFixed", audio.isVolumeFixed());
                o.put("tvVolume", audio.getStreamVolume(AudioManager.STREAM_MUSIC));
                o.put("tvVolumeMax", audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
                o.put("tvVolumeSet", settings.number("tvVolume", 0));
            }
            o.put("levelling", leveller.status);
            o.put("settings", settings.status);
            o.put("weather", settings.flag("infoPanel", true) ? weather.status : "");
            o.put("prices", wantsPrices() ? prices.status : "");
            o.put("prayerTimes", prayerCity().isEmpty() ? "" : prayerTimes.status);
            o.put("names", titles.describe(pageSongs));
            o.put("updateReady", Updater.shown(updater.readyBuild));
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
            case "unfreeze":
                return toPage(what);
            case "identify":
                return toPage("identify:" + tvName);
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
                        restartApp();
                    }
                });
                return true;
            case "forget":
                return toPage("forget");
            case "checkupdate":
                work.execute(new Runnable() {
                    @Override
                    public void run() {
                        updater.check();
                    }
                });
                return true;
            default:
                return pageCommand(what);
        }
    }

    // Commands with a value, for the page: a song to play next or now, a quiet minute, a special day's look
    private boolean pageCommand(String what) {
        int colon = what.indexOf(':');
        if (colon < 0) return false;
        String name = what.substring(0, colon), value = what.substring(colon + 1);
        switch (name) {
            case "playnext":
            case "playnow":
                if (!TitleBook.isId(value)) return false;
                titles.want(Collections.singletonList(value));   // a song from a link: its name too
                return toPage(what);
            case "unnext":
                return TitleBook.isId(value) && toPage(what);
            case "quiet":
                if (!value.matches("\\d{1,4}") || Integer.parseInt(value) > 3600) return false;
                return toPage(what);
            case "look":
                return value.matches("[A-Za-z]{1,20}") && toPage(what);
            default:
                return false;
        }
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
}
