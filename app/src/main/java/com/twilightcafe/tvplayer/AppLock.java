package com.twilightcafe.tvplayer;

import java.util.Collection;
import java.util.List;
import java.util.Locale;

/**
 * Keeps the TV box in Twilight TV (lockApps): whatever else comes on screen is sent away in a few
 * seconds, except the one other app allowed (otherApp, My TV Plus), Android's own questions that
 * come up over any app (an update's, a permission's), the box's settings the app opened itself,
 * and while the box is unlocked from the phone or the remote.
 *
 * The other app has its turn from when it's opened from Twilight TV until the box's home screen
 * shows (Home, or the other app closed): what it opens itself in that time (a player of its own,
 * say) is fine too, but not the box's settings or app store. Plain Java, so it can be tested on a
 * computer.
 */
final class AppLock {

    static final long UNLOCK = 15 * 60000L;   // unlocked from the phone, or by holding Back for 10 seconds
    static final long SETTINGS = 3 * 60000L;  // after the app opened one of the box's settings itself

    private AppLock() {
    }

    /**
     * Should Twilight TV come back on screen?
     *  front: the app on screen now, or null when Android won't say (no "Usage access")
     *  turn: it's the other app's turn (opened from Twilight TV, and the home screen hasn't shown since)
     *  home: the app on screen is the box's home screen
     */
    static boolean bringBack(String front, String me, String other, boolean turn, boolean home, long now, long unlockedUntil, long settingsUntil) {
        if (now < unlockedUntil || now < settingsUntil) return false;
        if (front == null) return !turn;                    // can't see: back, unless it's the other app's turn
        if (front.equals(me) || front.equals(other) || androidOwn(front)) return false;
        return !turn || home || boxOwn(front);              // in its turn, what the other app opens is fine
    }

    /** The box's own settings and app store: from there, anything else could be opened */
    static boolean boxOwn(String pkg) {
        return pkg.contains("settings") || pkg.equals("com.android.vending");
    }

    /** The box's home screen: one of its home apps, or anything called a launcher */
    static boolean homeScreen(String pkg, Collection<String> homeApps) {
        return pkg != null && ((homeApps != null && homeApps.contains(pkg)) || pkg.toLowerCase(Locale.ROOT).contains("launcher"));
    }

    /** The other app's turn is over: the home screen came up (and not because the other app is a home app itself) */
    static boolean turnOver(String pkg, String other, Collection<String> homeApps) {
        return pkg != null && !pkg.equals(other) && homeScreen(pkg, homeApps);
    }

    /**
     * Android closing its system dialogs because Home was pressed, wherever (it tells every app): the other
     * app's turn is over, and Twilight TV comes back, unless the box is unlocked
     */
    static boolean homeKey(String reason) {
        return "homekey".equals(reason);
    }

    /** Android's own screens that come up over any app: an update's question, a permission's, the system bar */
    static boolean androidOwn(String pkg) {
        return pkg.contains("packageinstaller") || pkg.contains("permissioncontroller") || pkg.equals("com.android.systemui") || pkg.equals("android");
    }

    /**
     * The other app among the box's apps ({name, package}): the package itself, else the one whose name
     * matches, ignoring capitals, spaces and signs ("My TV Plus" finds "MyTV Plus" and "MY TV+"), else
     * the first whose name has it in it. Null if none.
     */
    static String[] find(List<String[]> apps, String wanted) {
        String w = wanted == null ? "" : wanted.trim();
        if (w.isEmpty() || apps == null) return null;
        for (String[] a : apps) if (a[1].equals(w)) return a;
        String n = plain(w);
        if (n.isEmpty()) return null;
        for (String[] a : apps) if (plain(a[0]).equals(n)) return a;
        for (String[] a : apps) if (plain(a[0]).contains(n)) return a;
        return null;
    }

    static String plain(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT).replace("+", "plus").replaceAll("[^\\p{L}\\p{N}]", "");
    }

    /** What the remote's Back does when held: 0 nothing, 1 the other app (2 seconds), 2 unlock (10 seconds) */
    static int backHeld(long millis) {
        return millis >= 10000 ? 2 : millis >= 1500 ? 1 : 0;
    }
}
