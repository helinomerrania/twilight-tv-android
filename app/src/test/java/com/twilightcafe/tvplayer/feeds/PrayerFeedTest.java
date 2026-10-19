package com.twilightcafe.tvplayer.feeds;

import com.twilightcafe.tvplayer.Checks;
import com.twilightcafe.tvplayer.util.Net;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;

public class PrayerFeedTest extends Checks {
    static String hm(int m) { return String.format("%02d:%02d", (m / 60) % 12 == 0 && m >= 720 ? 12 : (m / 60) > 12 ? m / 60 - 12 : m / 60, m % 60); }

    // A page like amozhgary.tv/bang/Ranya: the month's header, a "today" box with words between its
    // times, the month's table (12-hour times, no AM/PM), and a script with times in it
    static String page(int[][] days, boolean twice, boolean kurdishDigits) {
        StringBuilder b = new StringBuilder("<!DOCTYPE html><html dir=\"rtl\"><head><title>کاتەکانی بانگ - ڕانیە</title>"
            + "<script>self.__next_f.push([1,\"04:36 05:56 11:57 03:13 05:53 07:07\"])</script><style>.x{}</style></head><body>"
            + "<p>پەیوەندی: 0750 123 4567 — فریکوێنسی: 11636</p>"
            + "<h3>1 - تشرینی یەکەم (10) - 2026</h3><h3>بەیانی: 04:45</h3><h3>خۆرهەڵاتن: 06:05</h3><h3>نیوەڕۆ: 11:54</h3>"
            + "<h3>عەسر: 03:02</h3><h3>مەغریب: 05:38</h3><h3>عیشاء : 06:52</h3>");
        for (int copy = 0; copy < (twice ? 2 : 1); copy++) {
            b.append("<table><thead><tr><th>بەروار</th><th>بەیانی</th><th>خۆرهەڵاتن</th><th>نیوەڕۆ</th><th>عەسر</th><th>مەغریب</th><th>عیشاء</th><th></th></tr></thead><tbody>");
            for (int d = 0; d < days.length; d++) {
                b.append("<tr><td><span class=\"hidden md:inline\">هەینی</span><span class=\"md:hidden\">هەینی</span> ").append(hijriCell(d)).append("</td>");
                for (int v : days[d]) b.append("<td class=\"t\">").append(hm(v)).append("</td>");
                b.append("<td><a href=\"/suggestion\">پێشنیار / داواکاری</a> <a href=\"/bang/Ranya\">سەرجەم کاتەکان</a></td></tr>\n");
            }
            b.append("</tbody></table>");
        }
        String s = b.append("<footer>© 2026</footer></body></html>").toString();
        if (kurdishDigits) {
            StringBuilder k = new StringBuilder();
            for (char c : s.toCharArray()) k.append(c >= '0' && c <= '9' ? (char) ('٠' + (c - '0')) : c);
            s = k.toString();
        }
        return s;
    }

    // As amozhgary.tv writes them: 1 October 2026 is 20 Rabiʻ II 1448 (a month of 30 days), 12 October 1 Jumada I
    static String hijriCell(int d) {
        return d < 11 ? (20 + d) + "ی ربيع الثاني 1448" : (d - 10) + "ی جمادى الأول 1448";
    }

    static int[][] october() {
        int[] first = { 4 * 60 + 36, 5 * 60 + 56, 11 * 60 + 57, 15 * 60 + 13, 17 * 60 + 53, 19 * 60 + 7 };
        int[] last = { 5 * 60, 6 * 60 + 22, 11 * 60 + 51, 14 * 60 + 45, 17 * 60 + 16, 18 * 60 + 32 };
        int[][] days = new int[31][6];
        for (int d = 0; d < 31; d++) for (int i = 0; i < 6; i++) days[d][i] = first[i] + Math.round((last[i] - first[i]) * d / 30f);
        days[11] = new int[] { 4 * 60 + 45, 6 * 60 + 5, 11 * 60 + 54, 15 * 60 + 2, 17 * 60 + 38, 18 * 60 + 52 };   // 12 October, as on the site
        return days;
    }

    @Test
    public void prayerTimesFromTheTownsPage() throws Exception {
        System.out.println("\nPrayer times from amozhgary.tv");
        int[][] oct = october();
        JSONObject m = PrayerFeed.parse(page(oct, false, false));
        check("the month's table: October 2026, 31 days", m != null && m.getInt("year") == 2026 && m.getInt("month") == 10 && m.getJSONArray("days").length() == 31, m);
        JSONArray d12 = m.getJSONArray("days").getJSONArray(11);
        check("12 October: Fajr 04:45, sunrise 06:05, Dhuhr 11:54, Asr 15:02, Maghrib 17:38, Isha 18:52 (afternoon times past noon)",
            d12.toString().equals("[285,365,714,902,1058,1132]"), d12);
        check("...1 October from the first row (not the today box, not the script)", m.getJSONArray("days").getJSONArray(0).toString().equals("[276,356,717,913,1073,1147]"), m.getJSONArray("days").getJSONArray(0));
        JSONObject twice = PrayerFeed.parse(page(oct, true, false));
        check("the same table twice (a phone layout too): still 31 days", twice != null && twice.getJSONArray("days").toString().equals(m.getJSONArray("days").toString()), twice);
        check("Kurdish digits read too", PrayerFeed.parse(page(oct, false, true)) != null && PrayerFeed.parse(page(oct, false, true)).getJSONArray("days").getJSONArray(11).toString().equals("[285,365,714,902,1058,1132]"), "");
        check("a page with no table: nothing (the TV works the times out itself)", PrayerFeed.parse("<html><h3>1 - تشرینی یەکەم (10) - 2026</h3><p>404</p></html>") == null, "");
        check("a table one day short: nothing rather than the wrong day's times", PrayerFeed.parse(page(Arrays.copyOf(oct, 30), false, false)) == null, "");
        JSONArray hj = m.optJSONArray("hijri");
        check("each day's Hijri date too: 1 October 20 Rabiʻ II 1448, 11 October 30 Rabiʻ II, 12 October 1 Jumada I, 31 October 20 Jumada I",
            hj != null && hj.length() == 31 && hj.getJSONArray(0).toString().equals("[20,4,1448]") && hj.getJSONArray(10).toString().equals("[30,4,1448]")
            && hj.getJSONArray(11).toString().equals("[1,5,1448]") && hj.getJSONArray(30).toString().equals("[20,5,1448]"), hj);
        check("...from the table twice, and with Kurdish digits", twice.getJSONArray("hijri").toString().equals(hj.toString())
            && PrayerFeed.parse(page(oct, false, true)).getJSONArray("hijri").toString().equals(hj.toString()), "");
        String skipped = page(oct, false, false).replace("5ی جمادى الأول 1448", "6ی جمادى الأول 1448");
        check("Hijri dates that skip a day: left out (the TV works them out itself), the times still taken",
            PrayerFeed.parse(skipped) != null && !PrayerFeed.parse(skipped).has("hijri") && PrayerFeed.parse(skipped).getJSONArray("days").length() == 31, "");
        String none = page(oct, false, false).replaceAll("\\d+ی (ربيع الثاني|جمادى الأول) 1448", "");
        check("no Hijri dates on the page: the times alone", PrayerFeed.parse(none) != null && !PrayerFeed.parse(none).has("hijri"), "");
        String[][] names = { { "محرم", "1" }, { "صفر", "2" }, { "ربيع الأول", "3" }, { "ربيع الآخر", "4" }, { "ربيع الثاني", "4" }, { "جمادى الأولى", "5" },
            { "جمادى الأول", "5" }, { "جمادى الآخرة", "6" }, { "جمادى الثانية", "6" }, { "رجب", "7" }, { "شعبان", "8" }, { "رمضان", "9" }, { "شوال", "10" },
            { "ذو القعدة", "11" }, { "ذو الحجة", "12" }, { "ذي الحجة", "12" }, { "موحەڕەم", "1" }, { "سەفەر", "2" }, { "ڕەبیعولئەوەڵ", "3" }, { "ڕەبیعولسانی", "4" },
            { "جەمادیەلئەوەڵ", "5" }, { "جەمادیەلئاخیر", "6" }, { "ڕەجەب", "7" }, { "شەعبان", "8" }, { "ڕەمەزان", "9" }, { "شەوال", "10" },
            { "زولقەعدە", "11" }, { "زولحیججە", "12" }, { "تشرینی یەکەم", "0" }, { "ربيع", "0" } };
        StringBuilder wrong = new StringBuilder();
        for (String[] n : names) if (PrayerFeed.hijriMonth(n[0]) != Integer.parseInt(n[1])) wrong.append(n[0]).append("=").append(PrayerFeed.hijriMonth(n[0])).append(" ");
        check("Hijri month names in Arabic and Kurdish, as sites write them (and a Gregorian one isn't one)", wrong.length() == 0, wrong);
        int[][] bad = october();
        bad[5] = new int[] { 4 * 60 + 40, 6 * 60, 11 * 60 + 56, 11 * 60 + 50, 17 * 60 + 50, 19 * 60 + 5 };   // Asr before Dhuhr
        check("a row that can't be right (Asr before Dhuhr): nothing", PrayerFeed.parse(page(bad, false, false)) == null, "");

        File dir = Files.createTempDirectory("prayers").toFile();
        final List<String> asked = new ArrayList<>();
        final int[] code = { 200 };
        final boolean[] offline = { false };
        final String[] body = { page(oct, false, false) };
        PrayerFeed.Fetcher f = url -> {
            asked.add(url);
            if (offline[0]) throw new IOException("no internet");
            return new Net.Reply(code[0], code[0] == 200 ? body[0] : null, 0, null);
        };
        File file = new File(dir, "prayers.json");
        PrayerFeed feed = new PrayerFeed(file, f);
        long now = System.currentTimeMillis();
        check("nothing yet: due at once", feed.due(now, "Ranya") && feed.forPage() == null, "");
        feed.refresh("Ranya");
        check("asks the town's page", asked.size() == 1 && asked.get(0).equals("https://amozhgary.tv/bang/Ranya"), asked);
        JSONObject fp = feed.forPage();
        check("the page gets the month, its Hijri dates, the town and when", fp != null && fp.getString("city").equals("Ranya") && fp.getJSONArray("days").length() == 31
            && fp.getJSONArray("hijri").length() == 31 && Math.abs(fp.getLong("fetched") - now) < 5000, fp);
        check("says where they're from", feed.status.startsWith("from amozhgary.tv (Ranya)"), feed.status);
        Calendar c = Calendar.getInstance();
        boolean thisMonth = c.get(Calendar.YEAR) == 2026 && c.get(Calendar.MONTH) == 9;
        check("then not again the same day (when it's this month)", !thisMonth || !feed.due(now + 60000L * 35, "Ranya"), thisMonth);
        check("...but at once for another town", feed.due(now + 60000L * 35, "Qaladze"), "");
        check("...and the next day", feed.due(now + 24 * 3600000L + 60000L * 35, "Ranya"), "");
        code[0] = 503;
        feed.refresh("Ranya");
        check("the site has trouble: the month kept, and it says why", feed.forPage() != null && feed.status.contains("(503)") && feed.status.contains("kept"), feed.status);
        code[0] = 200; body[0] = "<html>changed</html>";
        feed.refresh("Ranya");
        check("a page that can't be read: the month kept", feed.forPage() != null && feed.status.contains("couldn't be read"), feed.status);
        offline[0] = true;
        PrayerFeed again = new PrayerFeed(file, f);
        check("kept in a file: there after a restart", again.forPage() != null && again.forPage().getJSONArray("days").length() == 31, again.forPage());
        again.refresh("Ranya");
        check("no internet: the month stays, and it says why", again.forPage() != null && again.status.contains("couldn't reach amozhgary.tv"), again.status);
        check("a town's name with a space goes into the address properly", PrayerFeed.url("Sulaymaniyah City").equals("https://amozhgary.tv/bang/Sulaymaniyah%20City"), PrayerFeed.url("Sulaymaniyah City"));
        allPassed();
    }
}
