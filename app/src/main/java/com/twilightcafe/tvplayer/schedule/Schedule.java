package com.twilightcafe.tvplayer.schedule;

import com.twilightcafe.tvplayer.util.Times;

import java.util.Locale;
import java.util.TimeZone;

/**
 * The app's clock rules, as plain Java so they can be tested on a computer: the times in the settings, read the
 * same way everywhere; jobs once a day, at a minute of the box's own time; and jobs every so often.
 * The music's own schedules (opening hours, a playlist and a volume for each time of day, the fade before
 * closing, the pause for the call to prayer) are the TV page's: assets/tv/tv.js.
 */
public final class Schedule {

    private Schedule() {
    }

    /** "9:30" -> "09:30", "24:00" -> "00:00"; anything unreadable -> null */
    public static String clock(String s) {
        if (s == null) return null;
        String[] p = s.trim().split("[:.]");
        try {
            int h = Integer.parseInt(p[0].trim()), m = Integer.parseInt(p[1].trim());
            if (h < 0 || h > 24 || m < 0 || m > 59) return null;
            if (h == 24 && m > 0) return null;
            return String.format(Locale.US, "%02d:%02d", h % 24, m);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** When the café opens, from openHours: "10:00-02:00" -> "10:00" (the first of several); none or unreadable -> null */
    public static String opening(String openHours) {
        if (openHours == null || openHours.isEmpty()) return null;
        String[] hours = openHours.split(",");
        if (hours.length == 0) return null;                    // "," alone
        String[] ends = hours[0].split("-");
        return ends.length == 0 ? null : clock(ends[0]);        // "-" alone
    }

    /** A job once a day, at a minute of the box's own time */
    public static final class Daily {

        private String doneDay = "";

        /** True the first time it's asked during that minute ("HH:mm"; null: never), and then not again that day */
        public boolean due(long now, String at) {
            return due(now, at, TimeZone.getDefault());
        }

        public boolean due(long now, String at, TimeZone zone) {
            if (at == null || !Times.minute(now, zone).equals(at)) return false;
            String today = Times.day(now, zone);
            if (today.equals(doneDay)) return false;
            doneDay = today;
            return true;
        }
    }

    /** A job every so often: the first time it's asked, then each time more than the interval has passed */
    public static final class Every {

        private final long interval;
        private long last = 0;

        public Every(long interval) {
            this.interval = interval;
        }

        public boolean due(long now) {
            if (now - last <= interval) return false;
            last = now;
            return true;
        }
    }
}
