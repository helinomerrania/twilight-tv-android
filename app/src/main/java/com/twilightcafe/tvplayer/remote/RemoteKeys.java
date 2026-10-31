package com.twilightcafe.tvplayer.remote;

import android.view.KeyEvent;

import com.twilightcafe.tvplayer.box.Diary;
import com.twilightcafe.tvplayer.lock.AppLock;
import com.twilightcafe.tvplayer.lock.BoxLock;
import com.twilightcafe.tvplayer.page.PageEngine;
import com.twilightcafe.tvplayer.page.PlayerController;
import com.twilightcafe.tvplayer.screen.TestMode;

import java.util.HashSet;
import java.util.Set;

/**
 * What the remote's keys do in the app (the rest go to the page: volume, zoom). Back does nothing, so the
 * music can't be stopped by accident; held for 2 seconds it opens the other app (My TV Plus), for 10 seconds
 * it unlocks the box for 15 minutes. Home leaves the app (with the lock on, only for a moment). OK held for
 * 3 seconds: test mode. During quality setup, the arrows move the pointer, OK clicks, and Back ends it.
 * (The remote's My TV Plus and YouTube buttons are the box's own: it opens My TV Plus, and YouTube, which the
 * lock swaps for Twilight Movies.) Any other key that comes here goes in the diary once, by its name, for
 * whoever gives it a job.
 */
public final class RemoteKeys {

    private final PlayerController player;
    private final PageEngine engine;
    private final QualitySetup quality;
    private final TestMode test;
    private final BoxLock lock;
    private final Diary diary;
    private final Set<Integer> noted = new HashSet<>();   // the keys put in the diary this run

    public RemoteKeys(PlayerController player, PageEngine engine, QualitySetup quality, TestMode test, BoxLock lock, Diary diary) {
        this.player = player;
        this.engine = engine;
        this.quality = quality;
        this.test = test;
        this.lock = lock;
        this.diary = diary;
    }

    /** True when the app used the key; false: Android (and the page) get it */
    public boolean handle(KeyEvent event) {
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() != KeyEvent.ACTION_UP) return true;
            if (quality.active()) {
                quality.end();
                player.open();
                return true;
            }
            int held = AppLock.backHeld(event.getEventTime() - event.getDownTime());
            if (held == 1) lock.openOtherApp(true);
            else if (held == 2) lock.unlock(true);
            return true;
        }
        // Quality setup: arrows move the pointer, OK clicks
        if (quality.active() && engine.hasView()) {
            boolean press = event.getAction() == KeyEvent.ACTION_DOWN;
            float step = quality.step(event.getRepeatCount());
            switch (key) {
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    if (press) quality.move(-step, 0);
                    return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    if (press) quality.move(step, 0);
                    return true;
                case KeyEvent.KEYCODE_DPAD_UP:
                    if (press) quality.move(0, -step);
                    return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    if (press) quality.move(0, step);
                    return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                case KeyEvent.KEYCODE_NUMPAD_ENTER:
                    if (event.getAction() == KeyEvent.ACTION_UP) quality.click();
                    return true;
                default:
                    break;
            }
        }
        // Hold OK for 3 seconds: test mode (the page's details, and the app's: phone address and PIN)
        if ((key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER)
                && event.getAction() == KeyEvent.ACTION_UP && event.getEventTime() - event.getDownTime() >= 3000) {
            test.toggle();
            player.open();
            return true;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0 && !everyday(key) && noted.add(key)) {
            diary.add(System.currentTimeMillis(), "The remote's key " + KeyEvent.keyCodeToString(key) + " (" + key
                    + ") came to Twilight TV, which has nothing for it.");
        }
        return false;
    }

    /** The keys every remote has, for the page or for Android: the arrows, OK, numbers, volume, the media keys */
    static boolean everyday(int key) {
        return (key >= KeyEvent.KEYCODE_0 && key <= KeyEvent.KEYCODE_9) || (key >= KeyEvent.KEYCODE_DPAD_UP && key <= KeyEvent.KEYCODE_DPAD_CENTER)
                || (key >= KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && key <= KeyEvent.KEYCODE_MEDIA_FAST_FORWARD)
                || key == KeyEvent.KEYCODE_MEDIA_PLAY || key == KeyEvent.KEYCODE_MEDIA_PAUSE
                || key == KeyEvent.KEYCODE_VOLUME_UP || key == KeyEvent.KEYCODE_VOLUME_DOWN || key == KeyEvent.KEYCODE_VOLUME_MUTE
                || key == KeyEvent.KEYCODE_ENTER || key == KeyEvent.KEYCODE_NUMPAD_ENTER || key == KeyEvent.KEYCODE_BACK
                || key == KeyEvent.KEYCODE_MENU || key == KeyEvent.KEYCODE_DEL || key == KeyEvent.KEYCODE_HOME
                || key == KeyEvent.KEYCODE_CHANNEL_UP || key == KeyEvent.KEYCODE_CHANNEL_DOWN;
    }
}
