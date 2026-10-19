package com.twilightcafe.tvplayer.page;

import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.twilightcafe.tvplayer.app.Core;
import com.twilightcafe.tvplayer.box.VideoSetup;
import com.twilightcafe.tvplayer.util.Disk;

import org.mozilla.geckoview.AllowOrDeny;
import org.mozilla.geckoview.GeckoResult;
import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoRuntimeSettings;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoSessionSettings;
import org.mozilla.geckoview.GeckoView;

import java.io.File;
import java.io.IOException;
import java.util.function.IntSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Firefox's engine (GeckoView), which comes inside the app: the TV boxes' own engine (Android System WebView)
 * is from 2018, too old for YouTube's controls, and they won't take a newer one. The engine starts once for
 * the whole app and stays; its view and page session are made again whenever they need to be: when the engine
 * crashed or Android closed it for memory, when the page froze, and every night.
 */
public final class PageEngine {

    public static final int NIGHT_BLUE = 0xFF0B1030;     // the café screen's colour, so start-up never flashes white

    private static GeckoRuntime runtime;                 // Firefox's engine: one for the whole app
    private static String formatStarted;                 // the video format it started with (videoFormat)
    private static String engineStarted;                 // and its whole start-up settings file

    private final Core core;
    private final FrameLayout root;
    private final IntSupplier port;                      // the app's web server, which hands the page to the engine
    private Runnable opener = () -> { };                 // opens the page again after the engine came back by itself
    private GeckoView web;                               // shows the page
    private GeckoSession session;                        // the page itself, in Firefox's engine
    private String name = "";                            // "Firefox's engine (GeckoView 157.0, built into this app)"
    private int major = 0;                               // its version

    public PageEngine(Core core, FrameLayout root, IntSupplier port) {
        this.core = core;
        this.root = root;
        this.port = port;
    }

    /** How the page is opened again when the engine comes back by itself (after a crash, or a failed start) */
    public void setOpener(Runnable opener) {
        this.opener = opener;
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
            String format = VideoSetup.format(core.settings.text("videoFormat", "h264")), yaml = engineYaml();
            File config = new File(core.activity.getFilesDir(), "engine-config.yaml");
            try {
                Disk.write(config, yaml);
                rs.configFilePath(config.getAbsolutePath());
                formatStarted = format;
                engineStarted = yaml;
            } catch (IOException e) {
                formatStarted = "any";                      // couldn't write it: the engine's own choice
                engineStarted = VideoSetup.engineConfig("any", false);
            }
            runtime = GeckoRuntime.create(core.activity.getApplicationContext(), rs.build());
        }
        return runtime;
    }

    // The engine's start-up settings: the video format, and its frame counter on the screen for testing
    private String engineYaml() {
        return VideoSetup.engineConfig(core.settings.text("videoFormat", "h264"), core.settings.flag("engineNumbers", false));
    }

    /** The video format the engine started with */
    public static String formatStarted() {
        return formatStarted;
    }

    /** The video format setting changed since the engine started */
    public boolean formatChanged() {
        return formatStarted != null && !formatStarted.equals(VideoSetup.format(core.settings.text("videoFormat", "h264")));
    }

    /** Any of the engine's start-up settings changed since it started: that takes a fresh start of the app */
    public boolean engineChanged() {
        return engineStarted != null && !engineStarted.equals(engineYaml());
    }

    /** The view and the page session; if the engine can't start, it tries again in 10 seconds */
    public void make() {
        try {
            web = new GeckoView(core.activity);
            session = newSession();
        } catch (RuntimeException e) {
            // the engine couldn't start: try again in 10 seconds
            web = null;
            session = null;
            core.main.postDelayed(() -> {
                make();
                if (core.onScreen()) opener.run();
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
                gone(session);
            }

            @Override
            public void onKill(GeckoSession session) {
                gone(session);
            }
        });
        s.open(runtime());
        return s;
    }

    private boolean ownPage(String uri) {
        int p = port.getAsInt();
        return uri != null && (uri.equals("about:blank") || (p > 0 && uri.startsWith("http://localhost:" + p + "/tv/")));
    }

    private void gone(final GeckoSession which) {
        core.main.post(() -> {
            if (session == which) restart();
        });
    }

    /** The view and session are there to load a page in */
    public boolean ready() {
        return web != null && session != null;
    }

    /** There's a view (the page can be on screen) */
    public boolean hasView() {
        return web != null;
    }

    /** The view, for the setup pointer's moves and clicks; null while there's none */
    public GeckoView view() {
        return web;
    }

    /**
     * Loads the page. computerPlayer: YouTube's player for computers, as a browser's "Desktop site" option
     * asks for (quality setup: its controls appear when the pointer moves over the video, and stay while
     * it's paused; the gear is at the bottom right)
     */
    public void load(String url, boolean computerPlayer) {
        session.setActive(true);
        session.getSettings().setUserAgentMode(computerPlayer ? GeckoSessionSettings.USER_AGENT_MODE_DESKTOP
                : GeckoSessionSettings.USER_AGENT_MODE_MOBILE);
        session.loadUri(url);
    }

    /** Left the app (Home, another app, the TV going to sleep): the music stops. The page starts again when the app comes back. */
    public void stopPage() {
        if (session != null) {
            session.loadUri("about:blank");
            session.setActive(false);
        }
    }

    /** A fresh view and session: every night, and when the page froze and reloading didn't help */
    public void restart() {
        close();
        make();
        if (core.onScreen()) opener.run();
    }

    public void close() {
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

    // Firefox's engine comes with the app, so it's as new as the app
    public void readVersion() {
        String ua = "";
        try {
            ua = GeckoSession.getDefaultUserAgent();
        } catch (RuntimeException e) {
            // not known
        }
        Matcher m = Pattern.compile("rv:(\\d+)(\\.\\d+)?").matcher(ua == null ? "" : ua);
        String version = "";
        if (m.find()) {
            major = Integer.parseInt(m.group(1));
            version = m.group(1) + (m.group(2) == null ? "" : m.group(2));
        }
        name = "Firefox's engine (GeckoView" + (version.isEmpty() ? "" : " " + version) + ", built into this app)";
    }

    /** "Firefox's engine (GeckoView 157.0, built into this app)", or "" before it's read */
    public String name() {
        return name;
    }

    public int major() {
        return major;
    }
}
