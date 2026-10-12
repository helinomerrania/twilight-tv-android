package com.twilightcafe.tvplayer;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.GregorianCalendar;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The call to prayer's times for the town, from amozhgary.tv's page for it (for Ranya:
 * https://amozhgary.tv/bang/Ranya), which has the whole month in a table: for each day, its Hijri
 * date ("20ی ربيع الثاني 1448") and the Fajr, sunrise, Dhuhr, Asr, Maghrib and Isha times, written
 * 12-hour without AM or PM. Asked once a day while the app is on screen; the month is kept in a
 * file, so an internet cut changes nothing. The TV shows the site's Hijri dates too, so they follow
 * the site's calendar by themselves. When it can't be read, the TV page works both out itself.
 * Plain Java (and org.json), so it can be tested on a computer.
 */
final class PrayerFeed {

    /** Fetches one address (the app uses the internet; tests use a stand-in). */
    interface Fetcher {
        Net.Reply get(String url) throws IOException;
    }

    static final String SITE = "https://amozhgary.tv/bang/";
    private static final long RETRY = 30 * 60000L;          // after a failure
    private static final Pattern TIME = Pattern.compile("(\\d{1,2}):(\\d{2})");
    private static final Pattern MONTH = Pattern.compile("\\((\\d{1,2})\\)\\s*-\\s*(\\d{4})");   // "تشرینی یەکەم (10) - 2026"
    // A row's Hijri date: "20ی ربيع الثاني 1448" (the day, ی, the month's Arabic or Kurdish name, the year)
    private static final Pattern HIJRI = Pattern.compile("(\\d{1,2})\\s*\u06cc\\s+([^\\d|]{2,30}?)\\s+(1[45]\\d\\d)(?!\\d)");

    private final File file;
    private final Fetcher fetcher;
    private JSONObject month;                                // {city, year, month, days: [[6 times in minutes], ...], hijri: [[d, m, y], ...]}
    private long fetchedAt, triedAt, waitUntil;
    private boolean busy;
    private volatile int version = 1;
    volatile String status = "not asked yet";

    PrayerFeed(File file, Fetcher fetcher) {
        this.file = file;
        this.fetcher = fetcher;
        load();
    }

    int version() {
        return version;
    }

    static String url(String city) {
        try {
            return SITE + URLEncoder.encode(city.trim(), "UTF-8").replace("+", "%20");
        } catch (IOException e) {
            return SITE + city.trim();
        }
    }

    /** Once a day (and at once for another town, or a month that isn't this one). */
    synchronized boolean due(long now, String city) {
        if (busy || now < waitUntil || now - triedAt < RETRY) return false;
        if (month == null || !month.optString("city").equalsIgnoreCase(city.trim())) return true;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        if (month.optInt("year") != c.get(Calendar.YEAR) || month.optInt("month") != c.get(Calendar.MONTH) + 1) return true;
        return !day(now).equals(day(fetchedAt));
    }

    private static String day(long t) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t));
    }

    /** Asks amozhgary.tv for the town's month (background thread). */
    void refresh(String city) {
        synchronized (this) {
            if (busy) return;
            busy = true;
            triedAt = System.currentTimeMillis();
        }
        try {
            Net.Reply r = fetcher.get(url(city));
            long now = System.currentTimeMillis();
            if (r.code == 429) {
                synchronized (this) {
                    waitUntil = now + 6 * 3600000L;
                }
                status = "amozhgary.tv asked to slow down; asking again in 6 hours";
                return;
            }
            if (r.code != 200 || r.body == null) {
                status = "amozhgary.tv didn't send the times (" + r.code + ")" + (month != null ? "; using the ones kept" : "");
                return;
            }
            JSONObject m = parse(r.body);
            if (m == null) {
                status = "amozhgary.tv's page couldn't be read" + (month != null ? "; using the ones kept" : "; the TV works the times out itself");
                return;
            }
            m.put("city", city.trim());
            synchronized (this) {
                month = m;
                fetchedAt = now;
                version++;
                save();
            }
            status = "from amozhgary.tv (" + city.trim() + "), checked " + new SimpleDateFormat("d MMM HH:mm", Locale.US).format(new Date(now));
        } catch (Exception e) {                              // no internet, or an answer that can't be read
            status = "couldn't reach amozhgary.tv (" + e.getClass().getSimpleName() + ")" + (month != null ? "; using the ones kept" : "");
        } finally {
            synchronized (this) {
                busy = false;
            }
        }
    }

    /**
     * The page -> {year, month, days: [[fajr, sunrise, dhuhr, asr, maghrib, isha] in minutes after
     * midnight, one per day of the month], hijri: [[day, month, year] of each day]}, or null if it
     * doesn't look right. The month's table is found as its rows: six times next to each other (the
     * "today" box has words between its times); each row's Hijri date is just before its times. The
     * Hijri dates are left out unless every day has one and they run on day by day.
     */
    static JSONObject parse(String html) throws JSONException {
        String text = latin(html.replaceAll("(?is)<(script|style|noscript|template)\\b.*?</\\1\\s*>", " ")
                .replaceAll("<[^>]*>", " ").replace("&nbsp;", " ").replace("&#160;", " "));
        Matcher mm = MONTH.matcher(text);
        if (!mm.find()) return null;
        int monthNo = Integer.parseInt(mm.group(1)), year = Integer.parseInt(mm.group(2));
        if (monthNo < 1 || monthNo > 12) return null;
        List<int[]> rows = new ArrayList<>(), hijri = new ArrayList<>();
        List<int[]> run = new ArrayList<>();
        Matcher t = TIME.matcher(text);
        int end = -1, runStart = 0, before = 0;                // before: where the text before this run of times starts
        while (t.find()) {
            boolean next = end >= 0 && text.substring(end, t.start()).replace('|', ' ').trim().isEmpty();
            if (!next) {
                if (take(run, rows)) hijri.add(hijriIn(text.substring(before, runStart)));
                if (end >= 0) before = end;
                run.clear();
                runStart = t.start();
            }
            run.add(new int[] { Integer.parseInt(t.group(1)), Integer.parseInt(t.group(2)) });
            end = t.end();
        }
        if (take(run, rows)) hijri.add(hijriIn(text.substring(before, runStart)));
        int days = new GregorianCalendar(year, monthNo - 1, 1).getActualMaximum(Calendar.DAY_OF_MONTH);
        if (rows.size() == 2 * days) {                      // the same table twice (one for phones, say)
            for (int i = 0; i < days; i++) if (!java.util.Arrays.equals(rows.get(i), rows.get(i + days))) return null;
            rows = rows.subList(0, days);
            hijri = hijri.subList(0, days);
        }
        if (rows.size() != days) return null;
        JSONArray out = new JSONArray();
        for (int[] r : rows) {
            JSONArray d = new JSONArray();
            for (int v : r) d.put(v);
            out.put(d);
        }
        JSONObject m = new JSONObject().put("year", year).put("month", monthNo).put("days", out);
        if (runsOn(hijri)) {
            JSONArray h = new JSONArray();
            for (int[] r : hijri) h.put(new JSONArray().put(r[0]).put(r[1]).put(r[2]));
            m.put("hijri", h);
        }
        return m;
    }

    // The last Hijri date in some text ("... هەینی 21ی ربيع الثاني 1448"): {day, month, year}, or null
    static int[] hijriIn(String text) {
        Matcher h = HIJRI.matcher(text);
        int[] found = null;
        while (h.find()) {
            int d = Integer.parseInt(h.group(1)), m = hijriMonth(h.group(2)), y = Integer.parseInt(h.group(3));
            if (d >= 1 && d <= 30 && m > 0) found = new int[] { d, m, y };
        }
        return found;
    }

    /** A Hijri month's number from its name, in Arabic or Kurdish ("ربيع الثاني", "جەمادیەلئەوەڵ"); 0 if unknown. */
    static int hijriMonth(String name) {
        String n = name.replaceAll("[\\u064B-\\u0652\\u0640\\s]", "")              // short vowels, stretching, spaces
                .replace('\u0649', '\u064A').replace('\u06CC', '\u064A')            // ى ی -> ي
                .replace('\u0623', '\u0627').replace('\u0625', '\u0627').replace('\u0622', '\u0627')   // أ إ آ -> ا
                .replace('\u0629', '\u0647').replace('\u06D5', '\u0647')            // ة ە -> ه
                .replace('\u06A9', '\u0643').replace('\u0695', '\u0631').replace('\u06B5', '\u0644')   // ک ڕ ڵ
                .replace("\u0626", "");                                         // ئ
        if (n.contains("محرم") || n.contains("موحهرهم")) return 1;
        if (n.contains("صفر") || n.contains("سهفهر")) return 2;
        boolean first = n.contains("اول") || n.contains("هوهل"), second = n.contains("ثاني") || n.contains("اخر") || n.contains("اخير")
                || n.contains("ساني");                                            // الأول / ئەوەڵ, الثاني / الآخر / ئاخیر / سانی
        if (n.contains("ربيع") || n.contains("رهبيع")) return first ? 3 : second ? 4 : 0;
        if (n.contains("جماد") || n.contains("جهماد")) return first ? 5 : second ? 6 : 0;
        if (n.contains("رجب") || n.contains("رهجهب")) return 7;
        if (n.contains("شعبان") || n.contains("شهعبان")) return 8;
        if (n.contains("رمضان") || n.contains("رهمهزان")) return 9;
        if (n.contains("شوال") || n.contains("شهوال")) return 10;
        if (n.contains("قعد") || n.contains("قهعد")) return 11;
        if (n.contains("حج") || n.contains("حيج")) return 12;                // ذو الحجة / زولحیججە
        return 0;
    }

    // Every day has a Hijri date, each the day after the one before (a new month after its 29th or 30th)
    private static boolean runsOn(List<int[]> h) {
        for (int i = 0; i < h.size(); i++) {
            int[] r = h.get(i);
            if (r == null || r[2] < 1400 || r[2] > 1600) return false;
            if (i == 0) continue;
            int[] p = h.get(i - 1);
            boolean sameMonth = r[0] == p[0] + 1 && r[1] == p[1] && r[2] == p[2];
            boolean newMonth = r[0] == 1 && p[0] >= 29 && (p[1] < 12 ? r[1] == p[1] + 1 && r[2] == p[2] : r[1] == 1 && r[2] == p[2] + 1);
            if (!sameMonth && !newMonth) return false;
        }
        return !h.isEmpty();
    }

    // Kurdish or Persian digits (٠١٢ / ۰۱۲) -> 012, in case the page ever writes them
    static String latin(String s) {
        StringBuilder b = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '\u0660' && c <= '\u0669') c = (char) ('0' + (c - '\u0660'));
            else if (c >= '\u06F0' && c <= '\u06F9') c = (char) ('0' + (c - '\u06F0'));
            b.append(c);
        }
        return b.toString();
    }

    // Six times in a row are one day: to minutes after midnight, afternoon ones moved past noon. True if it was one.
    private static boolean take(List<int[]> run, List<int[]> rows) {
        if (run.size() != 6) return false;
        int[] m = new int[6];
        for (int i = 0; i < 6; i++) {
            int h = run.get(i)[0], min = run.get(i)[1];
            if (h > 23 || min > 59) return false;
            if (i == 2 && h < 9) h += 12;                     // Dhuhr: 11:54, 12:05, or 01:05 for 13:05
            if (i >= 3 && h < 12) h += 12;                    // Asr, Maghrib, Isha: always afternoon or evening
            m[i] = h * 60 + min;
        }
        for (int i = 1; i < 6; i++) if (m[i] <= m[i - 1]) return false;
        if (m[0] < 150 || m[0] > 450 || m[2] < 630 || m[2] > 810 || m[4] < 960 || m[5] > 1410) return false;
        rows.add(m);
        return true;
    }

    /** For the page: {city, year, month, days, hijri, fetched}, or null before the first good answer. */
    synchronized JSONObject forPage() {
        if (month == null) return null;
        try {
            return new JSONObject(month.toString()).put("fetched", fetchedAt);
        } catch (JSONException e) {
            return null;
        }
    }

    private void load() {
        if (file == null || !file.exists()) return;
        try {
            JSONObject o = new JSONObject(TitleBook.readFile(file));
            month = o.optJSONObject("month");
            fetchedAt = o.optLong("fetched", 0);
            if (month != null) status = "from amozhgary.tv (" + month.optString("city") + "), kept from " + new SimpleDateFormat("d MMM HH:mm", Locale.US).format(new Date(fetchedAt));
        } catch (IOException | JSONException e) {
            // start again
        }
    }

    private void save() {
        if (file == null || month == null) return;
        try {
            TitleBook.writeFile(file, new JSONObject().put("month", month).put("fetched", fetchedAt).toString());
        } catch (IOException | JSONException e) {
            // kept in memory
        }
    }
}
