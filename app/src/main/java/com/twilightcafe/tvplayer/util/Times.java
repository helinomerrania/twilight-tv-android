package com.twilightcafe.tvplayer.util;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Times as the app writes them: in the box's own time zone unless one is given, with 0-9 digits and English months */
public final class Times {

    private Times() {
    }

    /** "19 Oct 14:05": when something was fetched or saved, for test mode and the phone page */
    public static String stamp(long t) {
        return format("d MMM HH:mm", t, TimeZone.getDefault());
    }

    /** "2026-10-19" */
    public static String day(long t) {
        return day(t, TimeZone.getDefault());
    }

    public static String day(long t, TimeZone zone) {
        return format("yyyy-MM-dd", t, zone);
    }

    /** "14:05" */
    public static String minute(long t, TimeZone zone) {
        return format("HH:mm", t, zone);
    }

    // SimpleDateFormat isn't safe across threads, so each call makes its own
    private static String format(String pattern, long t, TimeZone zone) {
        SimpleDateFormat f = new SimpleDateFormat(pattern, Locale.US);
        f.setTimeZone(zone);
        return f.format(new Date(t));
    }
}
