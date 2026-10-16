package com.twilightcafe.tvplayer;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AppLockTest {

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
}
