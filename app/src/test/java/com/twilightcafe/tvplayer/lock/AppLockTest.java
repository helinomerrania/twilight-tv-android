package com.twilightcafe.tvplayer.lock;

import com.twilightcafe.tvplayer.Checks;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class AppLockTest extends Checks {

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

    // The lock's rules in every case, one sentence each: the other app, Android's own questions, the home screen, Back held

    @Test
    public void theLockInEveryCase() throws Exception {
        String me = "com.twilightcafe.tvplayer", tv = "com.mytvplus.android";
        long now = 1_000_000L;
        System.out.println("Keeping the box in Twilight TV");
        check("another app on screen: Twilight TV comes back", AppLock.bringBack("com.google.android.youtube.tv", me, tv, false, false, now, 0, 0));
        check("the box's own home screen too", AppLock.bringBack("com.google.android.tvlauncher", me, tv, false, true, now, 0, 0));
        check("...and its settings", AppLock.bringBack("com.android.tv.settings", me, tv, false, false, now, 0, 0));
        check("My TV Plus: left alone (opened from here or not)", !AppLock.bringBack(tv, me, tv, true, false, now, 0, 0) && !AppLock.bringBack(tv, me, tv, false, false, now, 0, 0));
        check("Twilight TV itself: nothing to do", !AppLock.bringBack(me, me, tv, false, false, now, 0, 0));
        check("Android's own questions (an update, a permission, the system bar): left alone, even in My TV Plus's turn",
            !AppLock.bringBack("com.google.android.packageinstaller", me, tv, false, false, now, 0, 0) && !AppLock.bringBack("com.android.packageinstaller", me, tv, false, false, now, 0, 0)
            && !AppLock.bringBack("com.google.android.permissioncontroller", me, tv, false, false, now, 0, 0) && !AppLock.bringBack("com.android.systemui", me, tv, false, false, now, 0, 0)
            && !AppLock.bringBack("com.android.packageinstaller", me, tv, true, false, now, 0, 0));
        check("unlocked (from the phone, or Back held for 10 seconds): left alone until then", !AppLock.bringBack("com.android.tv.settings", me, tv, false, false, now, now + 1, 0)
            && AppLock.bringBack("com.android.tv.settings", me, tv, false, false, now, now, 0) && !AppLock.bringBack("com.google.android.tvlauncher", me, tv, false, true, now, now + 1, 0));
        check("a setting the app opened itself (Usage access, an update's): left alone for a while", !AppLock.bringBack("com.android.tv.settings", me, tv, false, false, now, 0, now + 1));
        check("Android won't say what's on screen: back, unless it's My TV Plus's turn",
            AppLock.bringBack(null, me, tv, false, false, now, 0, 0) && !AppLock.bringBack(null, me, tv, true, false, now, 0, 0));
        check("no other app on the box: everything else is sent away", AppLock.bringBack(tv, me, null, false, false, now, 0, 0));
        check("the timings", AppLock.UNLOCK == 15 * 60000L && AppLock.SETTINGS == 3 * 60000L && AppLock.BACK_AFTER == 10000L);
        check("something else on screen: Twilight TV waits 10 seconds from when all was last as allowed, then comes back",
            !AppLock.timeToComeBack(now, now + 1500, false) && !AppLock.timeToComeBack(now, now + 9999, false)
            && AppLock.timeToComeBack(now, now + 10000, false) && AppLock.timeToComeBack(now, now + 11500, false));
        check("...but at once when My TV Plus's turn has just ended (Home in it, or the home screen after it): the way back to the music",
            AppLock.timeToComeBack(now, now, true) && AppLock.timeToComeBack(now, now + 1500, true));

        System.out.println("My TV Plus's turn: from when it's opened from Twilight TV until the home screen shows");
        check("what it opens itself (a player of its own) is fine", !AppLock.bringBack("com.mxtech.videoplayer.ad", me, tv, true, false, now, 0, 0));
        check("...but not outside its turn (opened some other way)", AppLock.bringBack("com.mxtech.videoplayer.ad", me, tv, false, false, now, 0, 0));
        check("the home screen ends it: back", AppLock.bringBack("com.google.android.tvlauncher", me, tv, true, true, now, 0, 0));
        check("the box's settings and app store, even from inside it: back (anything could be opened from there)",
            AppLock.bringBack("com.android.tv.settings", me, tv, true, false, now, 0, 0) && AppLock.bringBack("com.android.settings", me, tv, true, false, now, 0, 0)
            && AppLock.bringBack("com.android.vending", me, tv, true, false, now, 0, 0) && AppLock.bringBack("com.droidlogic.tvsettings", me, tv, true, false, now, 0, 0));
        check("box's own: settings and the app store, not a player", AppLock.boxOwn("com.android.tv.settings") && AppLock.boxOwn("com.android.vending")
            && !AppLock.boxOwn("com.mxtech.videoplayer.ad") && !AppLock.boxOwn(tv));

        System.out.println("The box's home screen");
        Set<String> home = new HashSet<>(Collections.singletonList("com.droidlogic.mboxhome"));
        check("one of the box's home apps", AppLock.homeScreen("com.droidlogic.mboxhome", home));
        check("anything called a launcher (Google's, the box maker's), even if Android didn't list it",
            AppLock.homeScreen("com.google.android.tvlauncher", home) && AppLock.homeScreen("com.google.android.leanbackLauncher", null)
            && AppLock.homeScreen("com.droidlogic.mboxlauncher", Collections.<String>emptySet()));
        check("not the other app, a player or nothing", !AppLock.homeScreen(tv, home) && !AppLock.homeScreen("com.mxtech.videoplayer.ad", home) && !AppLock.homeScreen(null, home));

        check("the turn ends with the home screen, but not with My TV Plus itself (if it's a home app too) or a player",
            AppLock.turnOver("com.google.android.tvlauncher", tv, home) && AppLock.turnOver("com.droidlogic.mboxhome", tv, home)
            && !AppLock.turnOver(tv, tv, new HashSet<>(Collections.singletonList(tv))) && !AppLock.turnOver("com.mytvplus.launcher", "com.mytvplus.launcher", home)
            && !AppLock.turnOver("com.mxtech.videoplayer.ad", tv, home) && !AppLock.turnOver(null, tv, home));

        System.out.println("Home pressed, wherever");
        check("Home: Android says so (homekey)", AppLock.homeKey("homekey"));
        check("Android closing its dialogs for other reasons: not Home", !AppLock.homeKey("recentapps") && !AppLock.homeKey("assist")
            && !AppLock.homeKey(null) && !AppLock.homeKey("globalactions") && !AppLock.homeKey("HOMEKEY "));

        System.out.println("Finding the other app among the box's apps");
        List<String[]> apps = Arrays.asList(new String[] { "YouTube", "com.google.android.youtube.tv" }, new String[] { "MyTV Plus", tv },
            new String[] { "Settings", "com.android.tv.settings" }, new String[] { "TV Plus Player", "com.other.tvplus" });
        check("by its name, ignoring capitals and spaces: \"My TV Plus\" -> MyTV Plus", Arrays.equals(AppLock.find(apps, "My TV Plus"), new String[] { "MyTV Plus", tv }));
        check("\"mytv+\" -> MyTV Plus (+ is plus)", Arrays.equals(AppLock.find(apps, "mytv+"), new String[] { "MyTV Plus", tv }));
        check("by its package", Arrays.equals(AppLock.find(apps, "com.other.tvplus"), new String[] { "TV Plus Player", "com.other.tvplus" }));
        check("part of a name: the first that has it", Arrays.equals(AppLock.find(apps, "player"), new String[] { "TV Plus Player", "com.other.tvplus" }));
        check("not on the box, empty or signs only: none", AppLock.find(apps, "Netflix") == null && AppLock.find(apps, "") == null && AppLock.find(apps, " ") == null
            && AppLock.find(apps, null) == null && AppLock.find(apps, "--") == null && AppLock.find(null, "My TV Plus") == null);
        check("Kurdish names work too", Arrays.equals(AppLock.find(Collections.singletonList(new String[] { "تیڤی پلەس", "x.y" }), "تیڤی پلەس"), new String[] { "تیڤی پلەس", "x.y" }));

        System.out.println("The remote's Back, held");
        check("a short press: nothing (the music can't be stopped by accident)", AppLock.backHeld(0) == 0 && AppLock.backHeld(1400) == 0);
        check("2 seconds: My TV Plus", AppLock.backHeld(1500) == 1 && AppLock.backHeld(2000) == 1 && AppLock.backHeld(9900) == 1);
        check("10 seconds: unlocked for 15 minutes", AppLock.backHeld(10000) == 2 && AppLock.backHeld(30000) == 2);
        allPassed();
    }
}
