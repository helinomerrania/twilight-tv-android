package com.twilightcafe.tvplayer;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AppLockTest {

    private static final String ME = "com.twilightcafe.tvplayer";
    private static final String OTHER = "com.example.otherapp";
    private static final long NOW = 1000L;
    private static final long PAST = 500L;

    // bringBack: should Twilight TV come back on screen?

    @Test
    public void bringBack_unlocked() {
        // now < unlockedUntil
        assertFalse(AppLock.bringBack("com.some.app", ME, OTHER, false, false, NOW, NOW + 1000, PAST));

        // now < settingsUntil
        assertFalse(AppLock.bringBack("com.some.app", ME, OTHER, false, false, NOW, PAST, NOW + 1000));
    }

    @Test
    public void bringBack_frontIsNull() {
        // front == null, turn == false -> !turn == true
        assertTrue(AppLock.bringBack(null, ME, OTHER, false, false, NOW, PAST, PAST));

        // front == null, turn == true -> !turn == false
        assertFalse(AppLock.bringBack(null, ME, OTHER, true, false, NOW, PAST, PAST));
    }

    @Test
    public void bringBack_frontIsMeOrOther() {
        // front == ME -> false
        assertFalse(AppLock.bringBack(ME, ME, OTHER, false, false, NOW, PAST, PAST));

        // front == OTHER -> false
        assertFalse(AppLock.bringBack(OTHER, ME, OTHER, false, false, NOW, PAST, PAST));
    }

    @Test
    public void bringBack_frontIsAndroidOwn() {
        // androidOwn("com.android.systemui") is true -> false
        assertFalse(AppLock.bringBack("com.android.systemui", ME, OTHER, false, false, NOW, PAST, PAST));
        // androidOwn("com.google.android.packageinstaller") is true -> false
        assertFalse(AppLock.bringBack("com.google.android.packageinstaller", ME, OTHER, false, false, NOW, PAST, PAST));
    }

    @Test
    public void bringBack_notTurn() {
        // turn == false -> true
        assertTrue(AppLock.bringBack("com.random.app", ME, OTHER, false, false, NOW, PAST, PAST));
    }

    @Test
    public void bringBack_home() {
        // home == true -> true
        assertTrue(AppLock.bringBack("com.random.app", ME, OTHER, true, true, NOW, PAST, PAST));
    }

    @Test
    public void bringBack_boxOwn() {
        // boxOwn("com.android.settings") -> true
        assertTrue(AppLock.bringBack("com.android.settings", ME, OTHER, true, false, NOW, PAST, PAST));
        // boxOwn("com.android.vending") -> true
        assertTrue(AppLock.bringBack("com.android.vending", ME, OTHER, true, false, NOW, PAST, PAST));
    }

    @Test
    public void bringBack_turnAndNotHomeAndNotBoxOwn() {
        // turn == true, home == false, not boxOwn -> false
        assertFalse(AppLock.bringBack("com.some.random.app", ME, OTHER, true, false, NOW, PAST, PAST));
    }

    // boxOwn: the box's own settings and app store

    @Test
    public void boxOwn_returnsFalse_whenPackageIsNull() {
        assertFalse(AppLock.boxOwn(null));
    }

    @Test
    public void boxOwn_returnsTrue_whenPackageContainsSettings() {
        assertTrue(AppLock.boxOwn("com.android.settings"));
        assertTrue(AppLock.boxOwn("com.tvbox.settings.app"));
        assertTrue(AppLock.boxOwn("settings"));
    }

    @Test
    public void boxOwn_returnsTrue_whenPackageIsVending() {
        assertTrue(AppLock.boxOwn("com.android.vending"));
    }

    @Test
    public void boxOwn_returnsFalse_whenPackageDoesNotContainSettingsOrVending() {
        assertFalse(AppLock.boxOwn("com.android.systemui"));
        assertFalse(AppLock.boxOwn("com.example.app"));
        assertFalse(AppLock.boxOwn(""));
    }

    // homeKey: Android closing its dialogs because Home was pressed

    @Test
    public void homeKey_returnsTrueForHomeKey() {
        assertTrue(AppLock.homeKey("homekey"));
    }

    @Test
    public void homeKey_returnsFalseForNull() {
        assertFalse(AppLock.homeKey(null));
    }

    @Test
    public void homeKey_returnsFalseForEmptyString() {
        assertFalse(AppLock.homeKey(""));
    }

    @Test
    public void homeKey_returnsFalseForOtherStrings() {
        assertFalse(AppLock.homeKey("recentapps"));
        assertFalse(AppLock.homeKey("back"));
    }

    @Test
    public void homeKey_returnsFalseForDifferentCase() {
        assertFalse(AppLock.homeKey("HomeKey"));
        assertFalse(AppLock.homeKey("HOMEKEY"));
    }
}
