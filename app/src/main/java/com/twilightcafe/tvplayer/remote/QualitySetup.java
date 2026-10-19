package com.twilightcafe.tvplayer.remote;

import android.content.Context;
import android.os.Handler;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import android.view.View;
import android.widget.FrameLayout;

import com.twilightcafe.tvplayer.page.PageEngine;

import org.mozilla.geckoview.GeckoView;

/**
 * Quality setup, to pick the highest picture quality by hand: YouTube's own controls on screen for 10 minutes,
 * with a pointer moved by the remote's arrows. The page gets the same as a mouse moving over it, so YouTube
 * shows its controls; OK is the same as touching the screen where the pointer is. (The page opens again in
 * this mode, with YouTube's player for computers: see PlayerController.)
 */
public final class QualitySetup {

    private final Handler main;
    private final FrameLayout root;
    private final PageEngine engine;
    private final PointerView pointer;
    private float pointerX, pointerY;
    private volatile long until = 0;                     // YouTube's own controls on screen until then

    public QualitySetup(Context c, Handler main, FrameLayout root, PageEngine engine) {
        this.main = main;
        this.root = root;
        this.engine = engine;
        float density = c.getResources().getDisplayMetrics().density;
        pointer = new PointerView(c, 30 * density);
        pointer.setVisibility(View.GONE);
        root.addView(pointer, new FrameLayout.LayoutParams((int) (36 * density), (int) (46 * density)));
    }

    public boolean active() {
        return System.currentTimeMillis() < until;
    }

    /** Its 10 minutes are over (and it hasn't been ended yet) */
    public boolean expired(long now) {
        return until > 0 && now >= until;
    }

    /** On for 10 minutes, the pointer in the middle (then the page opens again) */
    public void start() {
        until = System.currentTimeMillis() + 10 * 60000L;   // ends by itself after 10 minutes
        pointerX = root.getWidth() / 2f;
        pointerY = root.getHeight() / 2f;
        place();
    }

    /** Off (then the page opens again) */
    public void end() {
        until = 0;
    }

    /** The pointer shows only during the setup */
    public void syncView() {
        pointer.setVisibility(active() ? View.VISIBLE : View.GONE);
    }

    /** How far one press of an arrow moves the pointer: a small step, to land on a menu line; held down, faster */
    public float step(int repeatCount) {
        return Math.max(root.getWidth(), root.getHeight()) * (repeatCount > 4 ? 0.035f : 0.012f);
    }

    private void place() {
        pointer.setTranslationX(pointerX - pointer.tip);
        pointer.setTranslationY(pointerY - pointer.tip);
    }

    /** The remote's arrows move the pointer; the page gets the same as a mouse moving over it, so YouTube shows its controls */
    public void move(float dx, float dy) {
        pointerX = Math.max(0, Math.min(root.getWidth() - 1, pointerX + dx));
        pointerY = Math.max(0, Math.min(root.getHeight() - 1, pointerY + dy));
        place();
        GeckoView web = engine.view();
        if (web == null) return;
        long t = SystemClock.uptimeMillis();
        MotionEvent hover = pointerEvent(t, t, MotionEvent.ACTION_HOVER_MOVE, pointerX, pointerY, false);
        web.dispatchGenericMotionEvent(hover);
        hover.recycle();
    }

    /** OK: the same as touching the screen where the pointer is */
    public void click() {
        GeckoView web = engine.view();
        if (web == null) return;
        pointer.pressed();                                               // the arrow flashes, so OK is seen to work
        final float x = pointerX, y = pointerY;
        final long t = SystemClock.uptimeMillis();
        MotionEvent down = pointerEvent(t, t, MotionEvent.ACTION_DOWN, x, y, true);
        web.dispatchTouchEvent(down);
        down.recycle();
        main.postDelayed(() -> {
            GeckoView now = engine.view();
            if (now == null) return;
            MotionEvent up = pointerEvent(t, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, true);
            now.dispatchTouchEvent(up);
            up.recycle();
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
}
