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
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class FeedsTest extends Checks {
    static void waitIdle(TitleBook b) throws InterruptedException { for (int i = 0; i < 300 && b.busy(); i++) Thread.sleep(10); Thread.sleep(30); }

    @Test
    public void songNamesAndTheWeather() throws Exception {
        File dir = Files.createTempDirectory("feeds").toFile();

        System.out.println("\nSong names (YouTube oEmbed)");
        final List<String> asked = Collections.synchronizedList(new ArrayList<>());
        final Map<String, Integer> answer = new ConcurrentHashMap<>();
        final boolean[] offline = { false };
        TitleBook.Fetcher yt = url -> {
            asked.add(url);
            if (offline[0]) throw new IOException("no internet");
            String id = url.substring(url.length() - 11);
            int code = answer.getOrDefault(id, 200);
            if (code == 200) return new Net.Reply(200, "{\"title\":\"Song " + id + " - هەڵبەست\",\"author_name\":\"Singer " + id.charAt(0) + "\",\"type\":\"video\"}", 0, null);
            return new Net.Reply(code, null, 0, null);
        };
        File tf = new File(dir, "titles.json");
        TitleBook book = new TitleBook(tf, yt);
        book.pauseMillis = 0;
        String A = "aaaaaaaaaaa", B = "bbbbbbbbbbb", C = "ccccccccccc", D = "ddd-ddd_ddd";
        answer.put(C, 401);
        book.want(Arrays.asList(A, B, C, "not-an-id", A));
        waitIdle(book);
        check("asks YouTube's oEmbed for each new song, the video's address encoded", asked.size() == 3 &&
            asked.get(0).equals("https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D" + A), asked);
        JSONObject fp = book.forPage(Arrays.asList(A, B, C));
        check("titles and channels for the page, in UTF-8; a song YouTube won't name is left out", fp.length() == 2 &&
            fp.getJSONArray(A).getString(0).equals("Song " + A + " - هەڵبەست") && fp.getJSONArray(A).getString(1).equals("Singer a") && !fp.has(C), fp);
        int v = book.version();
        book.want(Arrays.asList(A, B, C));
        waitIdle(book);
        check("known songs and refused ones aren't asked about again", asked.size() == 3 && book.version() == v, asked.size());
        JSONArray list = book.list(Arrays.asList(C, A));
        check("the phone's list: in the playlist's order, unknown names empty", list.length() == 2 && list.getJSONObject(0).getString("id").equals(C) &&
            list.getJSONObject(0).getString("title").equals("") && list.getJSONObject(1).getString("channel").equals("Singer a"), list);
        TitleBook again = new TitleBook(tf, yt);
        check("kept in a file: known after a restart, without asking", again.forPage(Arrays.asList(A, B)).length() == 2 && asked.size() == 3, asked.size());
        check("a description for the phone page", again.describe(Arrays.asList(A, B, C)).equals("names known for 2 of 3 songs"), again.describe(Arrays.asList(A, B, C)));
        offline[0] = true;
        book.want(Arrays.asList(D));
        waitIdle(book);
        check("no internet: stops, says so, and keeps the song for later", !book.busy() && book.status.contains("couldn't reach YouTube") && book.forPage(Arrays.asList(D)).length() == 0, book.status);
        offline[0] = false;
        answer.put(D, 429);
        book.start();
        waitIdle(book);
        check("YouTube says 'too many': waits (15 minutes)", book.status.contains("slow down") && book.forPage(Arrays.asList(D)).length() == 0, book.status);
        int n = asked.size();
        book.start();
        waitIdle(book);
        check("...and doesn't ask again meanwhile", asked.size() == n, asked.size());
        {   // YouTube's own trouble (500s): the same wait, instead of asking again every few seconds
            final List<String> asked5 = Collections.synchronizedList(new ArrayList<>());
            TitleBook b5 = new TitleBook(new File(dir, "titles5.json"), url -> { asked5.add(url); return new Net.Reply(503, null, 0, null); });
            b5.pauseMillis = 0;
            b5.want(Arrays.asList("eeeeeeeeeee", "fffffffffff"));
            waitIdle(b5);
            int n5 = asked5.size();
            b5.start();
            waitIdle(b5);
            check("YouTube has trouble (503): stops after one try and waits 15 minutes before asking again", n5 == 1 && asked5.size() == 1
                && b5.status.contains("YouTube has trouble") && b5.forPage(Arrays.asList("eeeeeeeeeee")).length() == 0, asked5.size() + " " + b5.status);
        }
        check("YouTube video IDs recognised, anything else not", TitleBook.isId("dQw4w9WgXcQ") && TitleBook.isId("a-b_c-d_e-f") && !TitleBook.isId("dQw4w9WgXc") &&
            !TitleBook.isId("dQw4w9WgXcQQ") && !TitleBook.isId("dQw4w9WgX/Q") && !TitleBook.isId(null), "");
        check("IDs from the page: duplicates and junk left out", TitleBook.ids(new JSONArray("[\"" + A + "\",\"" + A + "\",\"x\",5,\"" + B + "\"]")).equals(Arrays.asList(A, B)), "");

        System.out.println("\nWeather (MET Norway)");
        String met = "{\"type\":\"Feature\",\"properties\":{\"meta\":{\"updated_at\":\"2026-10-11T19:19:00Z\"},\"timeseries\":["
            + "{\"time\":\"2026-10-11T20:00:00Z\",\"data\":{\"instant\":{\"details\":{\"air_temperature\":20.34,\"wind_speed\":0.7}},"
            + "\"next_12_hours\":{\"summary\":{\"symbol_code\":\"partlycloudy_day\"},\"details\":{}},\"next_1_hours\":{\"summary\":{\"symbol_code\":\"partlycloudy_night\"},\"details\":{\"precipitation_amount\":0.0}},"
            + "\"next_6_hours\":{\"summary\":{\"symbol_code\":\"partlycloudy_night\"},\"details\":{\"precipitation_amount\":0.0}}}},"
            + "{\"time\":\"2026-10-11T21:00:00Z\",\"data\":{\"instant\":{\"details\":{\"air_temperature\":-1.25}},\"next_1_hours\":{\"summary\":{\"symbol_code\":\"lightrain\"},\"details\":{}}}},"
            + "{\"time\":\"2026-10-14T18:00:00Z\",\"data\":{\"instant\":{\"details\":{\"air_temperature\":23.0}},\"next_6_hours\":{\"summary\":{\"symbol_code\":\"cloudy\"}}}}]}}";
        JSONArray h = WeatherFeed.parse(met);
        check("MET's answer -> hours: time, °C (one decimal), symbol; the 6-hour part left out", h.length() == 2 &&
            h.getJSONArray(0).getLong(0) == 1791748800000L && h.getJSONArray(0).getDouble(1) == 20.3 && h.getJSONArray(0).getString(2).equals("partlycloudy_night") &&
            h.getJSONArray(1).getDouble(1) == -1.2 && h.getJSONArray(1).getString(2).equals("lightrain"), h);
        final List<String[]> metAsked = Collections.synchronizedList(new ArrayList<>());
        final int[] code = { 200 };
        final long[] exp = { System.currentTimeMillis() + 40 * 60000L };
        WeatherFeed.Fetcher mf = (url, since) -> {
            metAsked.add(new String[] { url, String.valueOf(since) });
            if (code[0] == -1) throw new IOException("offline");
            return new Net.Reply(code[0], code[0] == 200 ? met : null, exp[0], "Sun, 11 Oct 2026 19:19:00 GMT");
        };
        File wf = new File(dir, "weather.json");
        WeatherFeed w = new WeatherFeed(wf, mf);
        long now = System.currentTimeMillis();
        check("nothing yet: due at once; nothing for the page", w.due(now, 36.25491234, 44.8838, "") && w.forPage() == null, "");
        w.refresh(36.25491234, 44.88384);
        check("asks MET with at most 4 decimals, the first time without If-Modified-Since",
            metAsked.size() == 1 && metAsked.get(0)[0].equals("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=36.2549&lon=44.8838") && metAsked.get(0)[1].equals("null"), metAsked.get(0)[0]);
        JSONObject wp = w.forPage();
        check("the page gets the hours and when they came", wp != null && wp.getJSONArray("hours").length() == 2 && Math.abs(wp.getLong("at") - now) < 5000, wp);
        check("not due again before MET's Expires time (40 min) or 30 minutes", !w.due(now + 20 * 60000L, 36.2549, 44.8838, "") && !w.due(now + 35 * 60000L, 36.2549, 44.8838, "") &&
            w.due(now + 46 * 60000L, 36.2549, 44.8838, ""), "");
        exp[0] = 0;
        int wv = w.version();
        code[0] = 304;
        w.refresh(36.2549, 44.8838);
        check("next time: If-Modified-Since with MET's exact Last-Modified; 304 keeps the forecast", metAsked.get(1)[1].equals("Sun, 11 Oct 2026 19:19:00 GMT") &&
            w.forPage().getJSONArray("hours").length() == 2 && w.version() == wv, metAsked.get(1)[1]);
        check("...then at least 30 minutes until the next question", !w.due(System.currentTimeMillis() + 25 * 60000L, 36.2549, 44.8838, ""), "");
        check("another place: due straight away (after a minute)", w.due(System.currentTimeMillis() + 61000, 35.5, 45.4, ""), "");
        code[0] = 429;
        w.refresh(35.5, 45.4);
        check("MET says 'too many': waits an hour", w.status.contains("slow down") && !w.due(System.currentTimeMillis() + 50 * 60000L, 35.5, 45.4, ""), w.status);
        code[0] = -1;
        WeatherFeed w2 = new WeatherFeed(wf, mf);
        check("the forecast is kept in a file: there after a restart", w2.forPage() != null && w2.forPage().getJSONArray("hours").length() == 2, w2.forPage());
        w2.refresh(36.2549, 44.8838);
        check("no internet: the forecast stays, and it says why", w2.forPage() != null && w2.status.contains("couldn't reach"), w2.status);
        code[0] = 200;
        String bad = "{\"properties\":{\"timeseries\":[]}}";
        WeatherFeed w3 = new WeatherFeed(null, (url, since) -> new Net.Reply(200, bad, 0, null));
        w3.refresh(36.2549, 44.8838);
        check("an empty answer changes nothing", w3.forPage() == null && w3.status.contains("no hours"), w3.status);

        System.out.println("\nWeather (WeatherAPI.com, with a key)");
        long hour = System.currentTimeMillis() / 3600000L * 3600L;    // this hour, in seconds
        StringBuilder hs = new StringBuilder();
        for (int i = -2; i < 30; i++) {
            if (hs.length() > 0) hs.append(',');
            hs.append("{\"time_epoch\":").append(hour + i * 3600L).append(",\"temp_c\":").append(15 + i * 0.25).append(",\"is_day\":").append(i % 24 < 12 ? 1 : 0)
              .append(",\"condition\":{\"text\":\"x\",\"code\":").append(i == 1 ? 1243 : i == 2 ? 1276 : 1003).append("}}");
        }
        String api = "{\"location\":{\"name\":\"Ranya\"},\"current\":{\"last_updated_epoch\":" + (hour + 600) + ",\"temp_c\":16.4,\"is_day\":1,"
            + "\"condition\":{\"text\":\"Light rain shower\",\"code\":1240}},\"forecast\":{\"forecastday\":[{\"hour\":[" + hs + "]}]}}";
        JSONObject ap = WeatherFeed.parseWeatherApi(api, System.currentTimeMillis());
        check("WeatherAPI.com's answer -> hours from this one on (time, °C, MET's symbol) and its measured now",
            ap != null && ap.getJSONArray("hours").length() == 30 && ap.getJSONArray("hours").getJSONArray(0).getLong(0) == hour * 1000L &&
            ap.getJSONArray("hours").getJSONArray(1).getString(2).equals("rainshowers_day") && ap.getJSONArray("hours").getJSONArray(2).getString(2).equals("rainandthunder") &&
            ap.getJSONArray("now").getDouble(1) == 16.4 && ap.getJSONArray("now").getString(2).equals("lightrainshowers_day"), ap);
        check("...its codes in MET's words: clear night, fog, sleet showers, heavy snow, overcast",
            WeatherFeed.symbol(1000, false).equals("clearsky_night") && WeatherFeed.symbol(1135, true).equals("fog") && WeatherFeed.symbol(1252, true).equals("sleetshowers_day") &&
            WeatherFeed.symbol(1225, true).equals("heavysnow") && WeatherFeed.symbol(1009, true).equals("cloudy"), "");
        final List<String> apiAsked = Collections.synchronizedList(new ArrayList<>());
        final int[] acode = { 200 };
        WeatherFeed.Fetcher af = (url, since) -> {
            apiAsked.add(url);
            if (url.startsWith("https://api.met.no/")) return new Net.Reply(200, met, 0, null);
            return new Net.Reply(acode[0], acode[0] == 200 ? api : null, 0, null);
        };
        WeatherFeed wa = new WeatherFeed(new File(dir, "weather2.json"), af);
        long t0 = System.currentTimeMillis();
        check("a key: due at once", wa.due(t0, 36.2549, 44.8838, "abc 123"), "");
        wa.refresh(36.2549, 44.8838, "abc 123");
        check("asks WeatherAPI.com with the key and the place", apiAsked.size() == 1 &&
            apiAsked.get(0).equals("https://api.weatherapi.com/v1/forecast.json?key=abc+123&q=36.2549,44.8838&days=3&aqi=no&alerts=no"), apiAsked);
        JSONObject wap = wa.forPage();
        check("the page gets WeatherAPI.com's hours, its now, and where they're from", wap != null && wap.getString("source").equals("weatherapi") &&
            wap.getJSONArray("now").getDouble(1) == 16.4 && wa.status.startsWith("from WeatherAPI.com"), wap);
        check("then again every 15 minutes", !wa.due(t0 + 14 * 60000L, 36.2549, 44.8838, "abc 123") && wa.due(t0 + 16 * 60000L, 36.2549, 44.8838, "abc 123"), "");
        check("the key taken away: MET Norway again, at once", wa.due(t0 + 2 * 60000L, 36.2549, 44.8838, ""), "");
        acode[0] = 401;
        WeatherFeed wb = new WeatherFeed(null, af);
        wb.refresh(36.2549, 44.8838, "wrong");
        JSONObject wbp = wb.forPage();
        check("a key WeatherAPI.com doesn't take: says so, and MET Norway's weather meanwhile", wbp != null && wbp.getString("source").equals("met") &&
            wb.status.contains("didn't take the key") && wb.status.contains("from MET Norway"), wb.status);
        check("...and asks WeatherAPI.com again only after an hour", !wb.due(System.currentTimeMillis() + 50 * 60000L, 36.2549, 44.8838, "wrong") &&
            wb.due(System.currentTimeMillis() + 61 * 60000L, 36.2549, 44.8838, "wrong"), "");
        WeatherFeed wc = new WeatherFeed(new File(dir, "weather2.json"), af);
        check("kept in a file: WeatherAPI.com's weather there after a restart", wc.forPage() != null && wc.forPage().getString("source").equals("weatherapi") &&
            wc.forPage().getJSONArray("now").length() == 3, wc.forPage());

        allPassed();
    }
}
