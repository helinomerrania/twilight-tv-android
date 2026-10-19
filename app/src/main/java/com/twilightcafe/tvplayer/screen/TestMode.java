package com.twilightcafe.tvplayer.screen;

import android.content.Context;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.twilightcafe.tvplayer.BuildConfig;
import com.twilightcafe.tvplayer.app.TvApp;
import com.twilightcafe.tvplayer.box.VideoSetup;
import com.twilightcafe.tvplayer.page.PageEngine;

import org.json.JSONObject;

/**
 * Test mode (hold OK for 3 seconds, or from the phone): the page shows its own details at the top, and the
 * app its own at the bottom right, every 2 seconds: the phone page's address and PIN, the other TVs, and
 * how every part is doing.
 */
public final class TestMode {

    private final TvApp app;
    private final TextView overlay;
    private volatile boolean on = false;

    public TestMode(TvApp app, Context c, FrameLayout root) {
        this.app = app;
        overlay = new TextView(c);
        overlay.setTextColor(0xFFFFF1E0);
        overlay.setBackgroundColor(0xE60A0E2C);
        overlay.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        overlay.setLineSpacing(0, 1.15f);
        int pad = (int) (12 * c.getResources().getDisplayMetrics().density);
        overlay.setPadding(pad, pad, pad, pad);
        overlay.setVisibility(View.GONE);
        FrameLayout.LayoutParams olp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END);
        root.addView(overlay, olp);
    }

    public boolean on() {
        return on;
    }

    /** On or off (then the page opens again, with or without its own details) */
    public void toggle() {
        on = !on;
        app.core.main.removeCallbacks(tick);             // off and on again within 2 seconds: still one round of updates
        if (on) app.core.main.post(tick);
    }

    /** The details show in test mode, but not during quality setup: they would cover YouTube's controls */
    public void syncView(boolean qualitySetup) {
        overlay.setVisibility(on && !qualitySetup ? View.VISIBLE : View.GONE);
    }

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!on) return;
            overlay.setText(report());
            app.core.main.postDelayed(this, 2000);
        }
    };

    private String report() {
        StringBuilder b = new StringBuilder();
        int port = app.server.port();
        String ip = app.network.ip();
        b.append(port > 0 && !ip.isEmpty() ? "Phone control: http://" + ip + ":" + port + "   PIN " + app.pin.get()
                : "Phone control: not ready (no network yet)");
        StringBuilder others = new StringBuilder();
        for (String[] t : app.network.others()) {
            others.append(others.length() > 0 ? ", " : "").append(t[0]);
        }
        b.append("\nThis is ").append(app.network.name()).append(".  Other TVs: ").append(others.length() > 0 ? others : "none found yet");
        b.append("\nSettings: ").append(app.core.settings.status);
        b.append("\nSound levelling: ").append(app.leveller.status);
        String volume = app.volume.describe();
        if (volume != null) b.append("\nTV volume: ").append(volume);
        b.append("\nUpdates: ").append(app.core.settings.flag("updates", true) ? app.updater.status : "off in settings.json");
        b.append("\nWi-Fi kept at full power: ").append(app.wifi.held() ? "yes" : "no (cable, or no Wi-Fi)");
        b.append("\nWeather: ").append(app.feeds.weather.status);
        b.append("\nPrices: ").append(app.feeds.wantsPrices() ? app.feeds.prices.status : "none chosen");
        b.append("\nPrayer times: ").append(app.feeds.prayerCity().isEmpty() ? "worked out by the page" : app.feeds.prayers.status);
        b.append("\nSong names: ").append(app.feeds.titles.describe(app.link.songs()));
        b.append("\nWeb engine: ").append(app.engine.name().isEmpty() ? "not known" : app.engine.name());
        b.append("\nVideo from YouTube: ").append(VideoSetup.describe(PageEngine.formatStarted()))
                .append(app.engine.formatChanged() ? "  (" + VideoSetup.describe(app.core.settings.text("videoFormat", "h264")) + " from the app's next start)" : "");
        JSONObject bx = app.box.json();
        if (bx != null) {
            b.append("\nBox: ").append(bx.optString("box"));
            b.append("\nGraphics: ").append(bx.optString("graphics").isEmpty() ? "not known" : bx.optString("graphics"))
                    .append(bx.optBoolean("softDraw") ? "  (too old for Firefox's engine: it draws on the processor)" : "");
            b.append("\nThe chip decodes: ").append(bx.optString("decoders").isEmpty() ? "not known" : bx.optString("decoders"));
        }
        b.append("\nScreen: ").append(app.screen.facts());
        String noted = app.core.diary.last();
        if (!noted.isEmpty()) b.append("\nLast in the diary: ").append(noted);
        b.append("\nApp build ").append(BuildConfig.VERSION_NAME);
        return b.toString();
    }
}
