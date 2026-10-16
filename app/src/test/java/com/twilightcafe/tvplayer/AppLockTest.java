package com.twilightcafe.tvplayer;

import org.junit.Test;
import static org.junit.Assert.*;

public class AppLockTest {

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
