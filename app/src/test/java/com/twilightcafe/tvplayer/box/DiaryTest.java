package com.twilightcafe.tvplayer.box;

import com.twilightcafe.tvplayer.util.Disk;
import com.twilightcafe.tvplayer.util.Times;

import org.json.JSONArray;
import org.junit.Test;

import java.io.File;
import java.nio.file.Files;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class DiaryTest {

    private static final long T = 1_760_000_000_000L;    // a moment in October 2025
    private static final long MIN = 60000L, HOUR = 60 * MIN;
    private static final String BEFORE = "310 MB free of 1,868 MB, the chip at 71 °C";

    // A folder of its own for each test, gone after it
    private interface InFolder {
        void run(File dir) throws Exception;
    }

    private static void inFolder(InFolder test) throws Exception {
        File dir = Files.createTempDirectory("diary").toFile();
        try {
            test.run(dir);
        } finally {
            File[] left = dir.listFiles();
            for (int i = 0; left != null && i < left.length; i++) left[i].delete();
            dir.delete();
        }
    }

    // The diary saves in the background: wait until the file says this (2 seconds at most)
    private static void savedWith(File f, String text) throws Exception {
        for (int i = 0; i < 200; i++) {
            if (f.exists() && Disk.readText(f).contains(text)) return;
            Thread.sleep(10);
        }
        throw new AssertionError("never saved: " + text);
    }

    private static String newest(Diary d) {
        JSONArray r = d.recent(1);
        return r.length() == 0 ? "" : r.optJSONObject(0).optString("what");
    }

    private static String note(long now, long bootAt, long boxOnFor, long aliveAt, String planned, long plannedAt, int lastBuild, String boot, String exit) {
        return Diary.startNote(now, bootAt, boxOnFor, aliveAt, BEFORE, planned, plannedAt, lastBuild, 119, boot, exit, false);
    }

    // What happened since the app last ran

    @Test
    public void theFirstStartSaysTheDiaryBegins() {
        String n = note(T, T - 40000, 40000, 0, "", 0, 0, "", "");
        assertTrue(n, n.startsWith("Twilight TV started."));
    }

    @Test
    public void theBoxStartingAgainSoonAfterTheAppRanIsARestartByItself_withAndroidsWordAndHowTheBoxWas() {
        String n = note(T, T - 50000, 30000, T - 50000 - 70000, "", 0, 119, Diary.bootWords("watchdog"), "");
        assertTrue(n, n.startsWith("The TV box started again by itself, or its power went off for a moment"));
        assertTrue(n, n.contains("Twilight TV was running at " + Times.stamp(T - 120000)));
        assertTrue(n, n.contains("the box started again 70 seconds later"));
        assertTrue(n, n.contains("Android says: Android stopped responding and restarted itself (\"watchdog\")."));
        assertTrue(n, n.endsWith("Just before, the box had " + BEFORE + "."));
    }

    @Test
    public void theBoxStartingLongAfterTheAppRanWasTurnedOn() {
        String n = note(T, T - 40000, 40000, T - 9 * HOUR, "", 0, 119, "", "");
        assertEquals("The TV box was turned on. It had been off since " + Times.stamp(T - 9 * HOUR) + ".", n);
    }

    @Test
    public void aBoxWhoseClockIsntRightYetStillSaysItStartedAgain() {
        String n = note(T - 300 * HOUR, T - 300 * HOUR - 40000, 40000, T, "", 0, 119, "", "");
        assertEquals("The TV box started again. Twilight TV was last running at " + Times.stamp(T) + ". Just before, the box had " + BEFORE + ".", n);
    }

    @Test
    public void theAppStartingAgainOnABoxThatStayedOnStoppedWithoutWarning_andAndroid11SaysWhy() {
        String n = note(T, T - 30 * HOUR, 30 * HOUR, T - 2 * MIN, "", 0, 119, "", Diary.exitWords(3));
        assertEquals("Twilight TV stopped without warning and was opened again: Android closed it to free memory. It was running at "
                + Times.stamp(T - 2 * MIN) + ". Just before, the box had " + BEFORE + ".", n);
    }

    @Test
    public void aRestartTheAppAskedForIsInTheDiaryAlready_butOnlyForTenMinutes() {
        assertNull(note(T, T - 30 * HOUR, 30 * HOUR, T - MIN, "Restarted from the phone.", T - 20000, 119, "", ""));
        String late = note(T, T - 30 * HOUR, 30 * HOUR, T - MIN, "Restarted from the phone.", T - 20 * MIN, 119, "", "");
        assertTrue(late, late.startsWith("Twilight TV stopped without warning"));
    }

    @Test
    public void aNewBuildIsAnUpdate() {
        assertEquals("Twilight TV was updated: build 119 (it was build 118).", note(T, T - 30 * HOUR, 30 * HOUR, T - MIN, "", 0, 118, "", ""));
    }

    @Test
    public void theScreenMadeAgainInARunningAppSaysSo() {
        String n = Diary.startNote(T, T - 30 * HOUR, 30 * HOUR, T - MIN, BEFORE, "", 0, 119, 119, "", "", true);
        assertEquals("Twilight TV's screen was opened again (the app itself kept running).", n);
    }

    // Kept on the box

    @Test
    public void eventsComeNewestFirst_theLast50_andStayAfterARestart() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "diary.json");
            Diary d = new Diary(f);
            for (int i = 0; i < 55; i++) d.add(T + i * MIN, "event " + i);
            JSONArray r = d.recent(100);
            assertEquals(50, r.length());
            assertEquals("event 54", r.optJSONObject(0).optString("what"));
            assertEquals(T + 54 * MIN, r.optJSONObject(0).optLong("t"));
            assertEquals("event 5", r.optJSONObject(49).optString("what"));
            assertEquals(Times.stamp(T + 54 * MIN) + ": event 54", d.last());
            savedWith(f, "event 54");
            assertEquals("event 54", newest(new Diary(f)));
        });
    }

    @Test
    public void aRestartTheAppAsksForIsSavedAtOnce_andExplainsTheNextStart() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "diary.json");
            Diary d = new Diary(f);
            d.started(T, T - 30 * HOUR, 30 * HOUR, "", "", 119, false);
            d.alive(T + MIN + 1000, BEFORE);
            d.planned(T + 2 * MIN, "Restarted from the phone.");
            Diary next = new Diary(f);                    // the app's next run, at once: no waiting for the background
            assertEquals(T, next.lastStart());
            next.started(T + 2 * MIN + 8000, T - 30 * HOUR, 30 * HOUR, "", "", 119, false);
            assertEquals("Restarted from the phone.", newest(next));
            next.started(T + 3 * HOUR, T - 30 * HOUR, 30 * HOUR, "", "", 119, false);   // and a start nobody asked for, later
            assertTrue(newest(next), newest(next).startsWith("Twilight TV stopped without warning"));
        });
    }

    @Test
    public void stillRunningCountsOnlyOnceTheStartIsNoted_andIsSavedOnceAMinute() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "diary.json");
            Diary d = new Diary(f);
            d.started(T, T - 30 * HOUR, 30 * HOUR, "", "", 119, false);
            d.alive(T + MIN + 1000, BEFORE);
            savedWith(f, "\"aliveAt\":" + (T + MIN + 1000));
            Diary next = new Diary(f);
            next.alive(T + 5 * MIN, "");                   // before its own start is noted: the last run's time stays
            assertEquals(T + MIN + 1000, next.lastAlive());
            d.alive(T + MIN + 20000, BEFORE);              // 19 seconds on: in memory, not yet in the file
            assertEquals(T + MIN + 20000, d.lastAlive());
            Thread.sleep(100);
            assertTrue(Disk.readText(f).contains("\"aliveAt\":" + (T + MIN + 1000)));
        });
    }

    @Test
    public void aCrashIsSavedAtOnce_withWhereInTheApp() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "diary.json");
            Diary d = new Diary(f);
            d.crashed(T, new IllegalStateException("the page's key  was\nmissing"));
            String n = newest(new Diary(f));
            assertTrue(n, n.startsWith("Twilight TV crashed: IllegalStateException (the page's key was missing) in DiaryTest."));
        });
    }

    // Words

    @Test
    public void androidsBootReasonsInWords() {
        assertTrue(Diary.bootWords("watchdog").startsWith("Android stopped responding"));
        assertTrue(Diary.bootWords("kernel_panic").startsWith("Android itself crashed"));
        assertTrue(Diary.bootWords("shutdown,thermal").startsWith("it got too hot"));
        assertTrue(Diary.bootWords("cold,powerkey").startsWith("it was switched on"));
        assertTrue(Diary.bootWords("reboot,userrequested").startsWith("a restart was asked for"));
        assertEquals("\"reboot\"", Diary.bootWords(" reboot "));
        assertEquals("", Diary.bootWords(null));
    }

    @Test
    public void androidsReasonsForTheAppsEnd() {
        assertEquals("Android closed it to free memory", Diary.exitWords(3));
        assertEquals("it crashed", Diary.exitWords(4));
        assertEquals("", Diary.exitWords(1));
    }

    @Test
    public void howLong() {
        assertEquals("1 second", Diary.span(1000));
        assertEquals("70 seconds", Diary.span(70000));
        assertEquals("3 minutes", Diary.span(3 * MIN));
    }
}
