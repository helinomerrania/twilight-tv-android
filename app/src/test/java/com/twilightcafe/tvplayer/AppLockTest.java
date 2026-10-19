package com.twilightcafe.tvplayer;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AppLockTest {

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
