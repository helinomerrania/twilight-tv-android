package com.twilightcafe.tvplayer;

import org.junit.Test;
import static org.junit.Assert.*;

public class AppLockTest {

    private static final String ME = "com.twilightcafe.tvplayer";
    private static final String OTHER = "com.example.otherapp";
    private static final long NOW = 1000L;
    private static final long PAST = 500L;

    @Test
    public void testBringBack_unlocked() {
        // now < unlockedUntil
        assertFalse(AppLock.bringBack("com.some.app", ME, OTHER, false, false, NOW, NOW + 1000, PAST));

        // now < settingsUntil
        assertFalse(AppLock.bringBack("com.some.app", ME, OTHER, false, false, NOW, PAST, NOW + 1000));
    }

    @Test
    public void testBringBack_frontIsNull() {
        // front == null, turn == false -> !turn == true
        assertTrue(AppLock.bringBack(null, ME, OTHER, false, false, NOW, PAST, PAST));

        // front == null, turn == true -> !turn == false
        assertFalse(AppLock.bringBack(null, ME, OTHER, true, false, NOW, PAST, PAST));
    }

    @Test
    public void testBringBack_frontIsMeOrOther() {
        // front == ME -> false
        assertFalse(AppLock.bringBack(ME, ME, OTHER, false, false, NOW, PAST, PAST));

        // front == OTHER -> false
        assertFalse(AppLock.bringBack(OTHER, ME, OTHER, false, false, NOW, PAST, PAST));
    }

    @Test
    public void testBringBack_frontIsAndroidOwn() {
        // androidOwn("com.android.systemui") is true -> false
        assertFalse(AppLock.bringBack("com.android.systemui", ME, OTHER, false, false, NOW, PAST, PAST));
        // androidOwn("com.google.android.packageinstaller") is true -> false
        assertFalse(AppLock.bringBack("com.google.android.packageinstaller", ME, OTHER, false, false, NOW, PAST, PAST));
    }

    @Test
    public void testBringBack_notTurn() {
        // turn == false -> true
        assertTrue(AppLock.bringBack("com.random.app", ME, OTHER, false, false, NOW, PAST, PAST));
    }

    @Test
    public void testBringBack_home() {
        // home == true -> true
        assertTrue(AppLock.bringBack("com.random.app", ME, OTHER, true, true, NOW, PAST, PAST));
    }

    @Test
    public void testBringBack_boxOwn() {
        // boxOwn("com.android.settings") -> true
        assertTrue(AppLock.bringBack("com.android.settings", ME, OTHER, true, false, NOW, PAST, PAST));
        // boxOwn("com.android.vending") -> true
        assertTrue(AppLock.bringBack("com.android.vending", ME, OTHER, true, false, NOW, PAST, PAST));
    }

    @Test
    public void testBringBack_turnAndNotHomeAndNotBoxOwn() {
        // turn == true, home == false, not boxOwn -> false
        assertFalse(AppLock.bringBack("com.some.random.app", ME, OTHER, true, false, NOW, PAST, PAST));
    }
}
