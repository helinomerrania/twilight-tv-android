package com.twilightcafe.tvplayer.box;

import com.twilightcafe.tvplayer.util.Disk;
import com.twilightcafe.tvplayer.util.Times;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * What happened to this TV box and the app, for the phone page (newest first): the box starting again by itself
 * (and why, when Android says), the box turned on, the app crashing or stopping without warning, its own fresh
 * starts and the engine's, an update, the box going to sleep and waking up. Once a minute the app also notes that
 * it's running and how the box is (its free memory, its chip's temperature), so after a restart it's known how
 * long the box was off and how it was doing just before. Kept in a file: the last 50. Plain Java (and org.json),
 * so it can be tested on a computer.
 */
public final class Diary {

    static final int MAX = 50;
    static final long ALIVE_EVERY = 60000L;              // "still running" saved once a minute
    static final long PLAN_KEEP = 10 * 60000L;           // a restart the app asked for explains a start this soon after
    static final long JUST_ON = 10 * 60000L;             // the box on for less than this when the app started: it had just started

    private final File file;
    private final ExecutorService saver = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "diary");
        t.setDaemon(true);
        return t;
    });
    private JSONArray events = new JSONArray();          // [[time, what], ...], oldest first
    private long aliveAt, aliveSaved, startedAt, plannedAt;
    private String aliveNote = "", planned = "";
    private int build;                                   // the app's build (as people see it) when it last ran
    private long saved, written;                         // each save numbered: an older one never overwrites a newer
    private boolean noted;                               // this run's start is noted (until then, the last run's times stay)

    public Diary(File file) {
        this.file = file;
        load();
    }

    /** Something that happened, at t */
    public synchronized void add(long t, String what) {
        put(t, what);
        saveLater();
    }

    /** The app is about to start again by itself (why, for the phone): saved at once, as the app ends next */
    public synchronized void planned(long t, String why) {
        put(t, why);
        planned = why;
        plannedAt = t;
        saveNow();
    }

    /** The app crashed (from the crash handler, just before Android ends it): saved at once */
    public synchronized void crashed(long t, Throwable e) {
        put(t, "Twilight TV crashed: " + crashText(e) + ".");
        saveNow();
    }

    /** Every 30 seconds or so: the app is still running, and how the box is now ("" if it doesn't say) */
    public synchronized void alive(long t, String box) {
        if (!noted) return;                              // the last run's "still running" stays until this start is noted
        aliveAt = t;
        aliveNote = box == null ? "" : box;
        if (t - aliveSaved >= ALIVE_EVERY || t < aliveSaved) {
            aliveSaved = t;
            saveLater();
        }
    }

    /** When the app last started (0: never): Android's reasons for an end after this are about the last run */
    public synchronized long lastStart() {
        return startedAt;
    }

    /** When the app was last known to be running (0: never) */
    public synchronized long lastAlive() {
        return aliveAt;
    }

    /**
     * The app has started: what happened since it last ran goes in the diary (nothing when it restarted itself
     * on purpose a moment ago: that's in already). bootAt: when the box started; boxOnFor: how long the box had
     * been on when the app started; bootReason, exitReason: what Android says ("" when it doesn't); build: the
     * app's build now; again: the app's screen made again while the app itself kept running.
     */
    public synchronized void started(long now, long bootAt, long boxOnFor, String bootReason, String exitReason, int build, boolean again) {
        String note = startNote(now, bootAt, boxOnFor, aliveAt, aliveNote, planned, plannedAt, this.build, build, bootReason, exitReason, again);
        if (note != null) put(now, note);
        this.build = build;
        noted = true;
        startedAt = now;
        aliveAt = now;
        aliveSaved = now;
        planned = "";
        plannedAt = 0;
        saveLater();
    }

    /** The newest events first: [{t, what}] */
    public synchronized JSONArray recent(int n) {
        JSONArray out = new JSONArray();
        for (int i = events.length() - 1; i >= 0 && out.length() < n; i--) {
            JSONArray e = events.optJSONArray(i);
            if (e == null) continue;
            try {
                out.put(new JSONObject().put("t", e.optLong(0)).put("what", e.optString(1)));
            } catch (JSONException x) {
                // left out
            }
        }
        return out;
    }

    /** The newest event, as "19 Oct 21:14: what", or "" */
    public synchronized String last() {
        JSONArray e = events.optJSONArray(events.length() - 1);
        return e == null ? "" : Times.stamp(e.optLong(0)) + ": " + e.optString(1);
    }

    /** What happened between the app's last run and this start, in words (null: nothing to add) */
    static String startNote(long now, long bootAt, long boxOnFor, long aliveAt, String aliveNote, String planned, long plannedAt,
                            int lastBuild, int build, String bootReason, String exitReason, boolean again) {
        String reason = bootReason == null ? "" : bootReason.trim(), exit = exitReason == null ? "" : exitReason.trim();
        String before = aliveNote == null || aliveNote.isEmpty() ? "" : " Just before, the box had " + aliveNote + ".";
        if (again) return "Twilight TV's screen was opened again (the app itself kept running).";
        if (aliveAt <= 0) return "Twilight TV started. From now on, what happens to this TV box is noted here.";
        if (boxOnFor < JUST_ON) {                        // the box itself started, and the app with it
            String says = reason.isEmpty() ? "" : " Android says: " + reason + ".";
            if (bootAt < aliveAt) {                      // the box's clock wasn't right yet when it started
                return "The TV box started again. Twilight TV was last running at " + Times.stamp(aliveAt) + "." + says + before;
            }
            long off = bootAt - aliveAt;
            if (off < 10 * 60000L) {
                return "The TV box started again by itself, or its power went off for a moment: Twilight TV was running at "
                        + Times.stamp(aliveAt) + ", and the box started again " + span(off) + " later." + says + before;
            }
            return "The TV box was turned on. It had been off since " + Times.stamp(aliveAt) + "." + says;
        }
        if (lastBuild > 0 && build > 0 && build != lastBuild) return "Twilight TV was updated: build " + build + " (it was build " + lastBuild + ").";
        if (planned != null && !planned.isEmpty() && now >= plannedAt && now - plannedAt < PLAN_KEEP) return null;
        return "Twilight TV stopped without warning and was opened again" + (exit.isEmpty() ? "" : ": " + exit)
                + ". It was running at " + Times.stamp(aliveAt) + "." + before;
    }

    /** "40 seconds", "3 minutes" */
    static String span(long ms) {
        long s = Math.max(0, ms / 1000);
        if (s < 90) return s + (s == 1 ? " second" : " seconds");
        long m = Math.round(s / 60.0);
        return m + (m == 1 ? " minute" : " minutes");
    }

    /** Android's boot reason (sys.boot.reason and the like) in words where it's a known one, with Android's own word */
    static String bootWords(String raw) {
        String w = raw == null ? "" : raw.trim(), r = w.toLowerCase(Locale.US);
        if (r.isEmpty()) return "";
        String said;
        if (r.contains("watchdog")) said = "Android stopped responding and restarted itself";
        else if (r.contains("panic")) said = "Android itself crashed";
        else if (r.contains("thermal")) said = "it got too hot";
        else if (r.contains("brownout") || r.contains("undervoltage") || r.contains("battery")) said = "its power supply dropped";
        else if (r.startsWith("cold") || r.startsWith("hard") || r.contains("power_on") || r.contains("poweron")) said = "it was switched on";
        else if (r.contains("userrequested") || r.contains("shell")) said = "a restart was asked for";
        else return "\"" + w + "\"";
        return said + " (\"" + w + "\")";
    }

    /** Android's reason (11 and newer) why the app's last run ended, in words; "" for none worth saying */
    static String exitWords(int reason) {
        switch (reason) {
            case 2: return "Android stopped it";                                   // REASON_SIGNALED
            case 3: return "Android closed it to free memory";                     // REASON_LOW_MEMORY
            case 4: return "it crashed";                                           // REASON_CRASH
            case 5: return "it crashed, in Firefox's engine or in Android's own code";   // REASON_CRASH_NATIVE
            case 6: return "it stopped responding, and Android closed it";         // REASON_ANR
            case 7: return "it couldn't start";                                    // REASON_INITIALIZATION_FAILURE
            case 9: return "Android closed it for using too much of the box";      // REASON_EXCESSIVE_RESOURCE_USAGE
            case 10:
            case 11: return "someone stopped it (Force stop)";                     // REASON_USER_REQUESTED, REASON_USER_STOPPED
            case 12: return "a part of Android it needs stopped";                  // REASON_DEPENDENCY_DIED
            default: return "";
        }
    }

    /** "NullPointerException in PageLink.checkIn" (the first place in the app's own code) */
    static String crashText(Throwable e) {
        String where = "";
        for (Throwable t = e; t != null && where.isEmpty(); t = t.getCause() == t ? null : t.getCause()) {
            for (StackTraceElement s : t.getStackTrace()) {
                if (!s.getClassName().startsWith("com.twilightcafe.")) continue;
                String c = s.getClassName();
                where = c.substring(c.lastIndexOf('.') + 1).replaceAll("\\$.*", "") + "." + s.getMethodName();
                break;
            }
        }
        String msg = e.getMessage() == null ? "" : e.getMessage().replaceAll("\\s+", " ").trim();
        if (msg.length() > 120) msg = msg.substring(0, 117) + "...";
        return e.getClass().getSimpleName() + (msg.isEmpty() ? "" : " (" + msg + ")") + (where.isEmpty() ? "" : " in " + where);
    }

    private void put(long t, String what) {
        events.put(new JSONArray().put(t).put(what));
        while (events.length() > MAX) events.remove(0);
    }

    private void load() {
        if (file == null || !file.exists()) return;
        try {
            JSONObject o = new JSONObject(Disk.readText(file));
            JSONArray e = o.optJSONArray("events");
            if (e != null) events = e;
            while (events.length() > MAX) events.remove(0);
            aliveAt = o.optLong("aliveAt", 0);
            aliveNote = o.optString("aliveNote", "");
            startedAt = o.optLong("startedAt", 0);
            planned = o.optString("planned", "");
            plannedAt = o.optLong("plannedAt", 0);
            build = o.optInt("build", 0);
        } catch (IOException | JSONException e) {
            // a new diary
        }
    }

    private String json() throws JSONException {
        return new JSONObject().put("events", new JSONArray(events.toString())).put("aliveAt", aliveAt).put("aliveNote", aliveNote)
                .put("startedAt", startedAt).put("planned", planned).put("plannedAt", plannedAt).put("build", build).toString();
    }

    // In the background: written whole, then put in place (Disk)
    private void saveLater() {
        final String text;
        try {
            text = json();
        } catch (JSONException e) {
            return;
        }
        final long n = ++saved;
        try {
            saver.execute(() -> write(text, n));
        } catch (RuntimeException e) {
            write(text, n);
        }
    }

    // At once, on this thread: the app is about to end
    private void saveNow() {
        try {
            write(json(), ++saved);
        } catch (JSONException e) {
            // kept in memory
        }
    }

    private void write(String text, long n) {
        if (file == null) return;
        synchronized (file) {                            // one write at a time, and never an older one over a newer
            if (n <= written) return;
            try {
                Disk.write(file, text);
                written = n;
            } catch (IOException e) {
                // kept in memory; saved next time
            }
        }
    }
}
