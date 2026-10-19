package com.twilightcafe.tvplayer.schedule;

import org.junit.Test;

import java.time.Instant;
import java.util.TimeZone;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class ScheduleTest {

    private static final TimeZone UTC = TimeZone.getTimeZone("UTC");
    private static final TimeZone RANYA = TimeZone.getTimeZone("Asia/Baghdad");      // UTC+3 all year

    private static long at(String iso) {
        return Instant.parse(iso).toEpochMilli();
    }

    // clock: restartAt and the like, as people write them

    @Test
    public void clock_readsTimesTheWayPeopleWriteThem() {
        assertEquals("09:30", Schedule.clock("9:30"));
        assertEquals("09:30", Schedule.clock(" 9.30 "));
        assertEquals("05:00", Schedule.clock("05:00"));
        assertEquals("23:59", Schedule.clock("23:59"));
        assertEquals("00:00", Schedule.clock("24:00"));
    }

    @Test
    public void clock_unreadableTimesAreNone() {
        assertNull(Schedule.clock(null));
        assertNull(Schedule.clock(""));
        assertNull(Schedule.clock("5"));
        assertNull(Schedule.clock("25:00"));
        assertNull(Schedule.clock("10:60"));
        assertNull(Schedule.clock("-1:00"));
        assertNull(Schedule.clock("ten:30"));
    }

    // opening: when the café opens, from openHours

    @Test
    public void opening_isTheStartOfTheFirstHours() {
        assertEquals("10:00", Schedule.opening("10:00-02:00"));
        assertEquals("09:00", Schedule.opening("9:00-14:00,17:00-02:00"));
        assertNull(Schedule.opening(""));
        assertNull(Schedule.opening(null));
        assertNull(Schedule.opening("always"));
    }

    @Test
    public void opening_separatorsAloneAreNoneRatherThanACrash() {
        assertNull(Schedule.opening(","));
        assertNull(Schedule.opening("-"));
        assertNull(Schedule.opening("-,"));
        assertNull(Schedule.opening(",-"));
    }

    // Daily: the night's fresh start, the volume at opening time

    @Test
    public void daily_onceADayAtItsMinute() {
        Schedule.Daily d = new Schedule.Daily();
        assertFalse(d.due(at("2026-10-19T04:59:50Z"), "05:00", UTC));      // not yet
        assertTrue(d.due(at("2026-10-19T05:00:10Z"), "05:00", UTC));       // its minute
        assertFalse(d.due(at("2026-10-19T05:00:40Z"), "05:00", UTC));      // the next tick, the same minute: done
        assertFalse(d.due(at("2026-10-19T05:01:10Z"), "05:00", UTC));
        assertTrue(d.due(at("2026-10-20T05:00:05Z"), "05:00", UTC));       // the next day
    }

    @Test
    public void daily_goesByTheBoxsOwnTime() {
        assertTrue(new Schedule.Daily().due(at("2026-10-19T02:00:10Z"), "05:00", RANYA));     // 05:00 in Ranya
        assertFalse(new Schedule.Daily().due(at("2026-10-19T05:00:10Z"), "05:00", RANYA));    // 08:00 in Ranya
    }

    @Test
    public void daily_aMissedMinuteWaitsForTheNextDay() {
        Schedule.Daily d = new Schedule.Daily();
        assertFalse(d.due(at("2026-10-19T05:01:00Z"), "05:00", UTC));      // the minute passed unasked (off screen)
        assertTrue(d.due(at("2026-10-20T05:00:00Z"), "05:00", UTC));
    }

    @Test
    public void daily_noTimeIsNever() {
        assertFalse(new Schedule.Daily().due(at("2026-10-19T05:00:10Z"), null, UTC));
    }

    // Every: settings.json every 30 minutes, updates every 6 hours

    @Test
    public void every_atOnceThenAfterEachInterval() {
        Schedule.Every e = new Schedule.Every(30 * 60000L);
        long t = at("2026-10-19T10:00:00Z");
        assertTrue(e.due(t));                                    // the first time: at once
        assertFalse(e.due(t + 30000L));
        assertFalse(e.due(t + 30 * 60000L));                     // exactly the interval: not yet
        assertTrue(e.due(t + 30 * 60000L + 30000L));             // the tick after it
        assertFalse(e.due(t + 31 * 60000L));
    }
}
