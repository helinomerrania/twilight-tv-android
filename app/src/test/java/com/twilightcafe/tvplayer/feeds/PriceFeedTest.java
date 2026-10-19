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
import java.util.List;

public class PriceFeedTest extends Checks {
    // The shape of tirezh.com/api/economy's answer on 12 Oct 2026 (a few of each)
    static final String ANSWER = "{\"success\":true,\"data\":{\"updatedAt\":\"2026-10-12T05:37:01.655Z\","
        + "\"currencies\":[{\"code\":\"US\",\"nameKu\":\"دۆلار\",\"buy\":164250,\"sell\":165250,\"status\":\"increase\"},"
        + "{\"code\":\"EU\",\"nameKu\":\"یۆرۆ\",\"buy\":111.6,\"sell\":112.25,\"status\":\"decrease\"},"
        + "{\"code\":\"TR\",\"nameKu\":\"لیرەی تورکی\",\"buy\":4970,\"sell\":4880,\"status\":\"neutral\"},"
        + "{\"code\":\"../x\",\"nameKu\":\"bad\",\"buy\":1,\"sell\":1,\"status\":\"increase\"}],"
        + "\"gold\":[{\"karat\":24,\"priceIQD\":1035629,\"priceUSD\":134.5,\"label\":\"زێڕی ٢٤\"},"
        + "{\"karat\":21,\"priceIQD\":906175,\"priceUSD\":117.7,\"label\":\"زێڕی ٢١\"}],"
        + "\"metals\":[{\"id\":\"gold\",\"nameKu\":\"زێڕ\",\"priceOunce\":4184.6,\"status\":\"decrease\"},{\"id\":\"silver\",\"priceOunce\":60.86,\"status\":\"increase\"},{\"id\":\"copper\",\"priceOunce\":6.78}],"
        + "\"cryptos\":[{\"id\":\"btc\",\"price\":83836.01,\"status\":\"increase\"},{\"id\":\"eth\",\"price\":2554.61}],"
        + "\"kurdistanPrices\":{\"mithqal21K\":906175,\"buy21K\":884175,\"buy22K\":922791,\"usdRate\":153000},\"source\":\"tirezh\"},"
        + "\"live\":true,\"cached\":false,\"source\":\"api\",\"age\":0}";

    @Test
    public void pricesFromTirezh() throws Exception {
        System.out.println("\nPrices from tirezh.com");
        JSONObject p = PriceFeed.parse(ANSWER);
        JSONArray us = p.getJSONArray("currencies").getJSONArray(0);
        check("currencies: code, Kurdish name, buy, sell, up/down", us.getString(0).equals("us") && us.getString(1).equals("دۆلار") &&
            us.getDouble(2) == 164250 && us.getDouble(3) == 165250 && us.getInt(4) == 1 &&
            p.getJSONArray("currencies").getJSONArray(1).getInt(4) == -1 && p.getJSONArray("currencies").getJSONArray(2).getInt(4) == 0, us);
        check("...anything that isn't a currency code is left out", p.getJSONArray("currencies").length() == 3, p.getJSONArray("currencies").length());
        JSONArray g21 = p.getJSONArray("gold").getJSONArray(1);
        check("gold by karat: price per mithqal in dinars, name, and the buy-back price", g21.getInt(0) == 21 && g21.getDouble(1) == 906175 &&
            g21.getString(2).equals("زێڕی ٢١") && g21.getDouble(3) == 884175 && p.getJSONArray("gold").getJSONArray(0).getDouble(3) == 0, g21);
        check("world gold and silver per ounce, bitcoin, with up/down", p.getJSONArray("ounce").getDouble(0) == 4184.6 && p.getJSONArray("ounce").getInt(1) == -1 &&
            p.getJSONArray("silver").getDouble(0) == 60.86 && p.getJSONArray("btc").getDouble(0) == 83836.01, p);
        check("when tirezh set the prices", p.getLong("at") == 1791783421655L, p.getLong("at"));
        check("an answer saying it failed: nothing", PriceFeed.parse("{\"success\":false,\"error\":\"x\"}") == null, "");
        check("an answer with no prices: nothing", PriceFeed.parse("{\"success\":true,\"data\":{\"currencies\":[],\"gold\":[]}}") == null, "");

        File dir = Files.createTempDirectory("prices").toFile();
        final List<String> asked = new ArrayList<>();
        final int[] code = { 200 };
        final boolean[] offline = { false };
        final String[] body = { ANSWER };
        PriceFeed.Fetcher f = url -> {
            asked.add(url);
            if (offline[0]) throw new IOException("no internet");
            return new Net.Reply(code[0], code[0] == 200 ? body[0] : "<html>challenge</html>", 0, null);
        };
        File file = new File(dir, "prices.json");
        PriceFeed feed = new PriceFeed(file, f);
        long now = System.currentTimeMillis();
        check("nothing yet: due at once, nothing for the page", feed.due(now, PriceFeed.URL) && feed.forPage() == null, "");
        feed.refresh(PriceFeed.URL);
        check("asks tirezh.com's own price service", asked.size() == 1 && asked.get(0).equals("https://tirezh.com/api/economy"), asked);
        JSONObject fp = feed.forPage();
        check("the page gets the prices and when the app got them", fp != null && fp.getJSONArray("gold").length() == 2 && Math.abs(fp.getLong("fetched") - now) < 5000, fp);
        check("then not again for 5 minutes", !feed.due(now + 4 * 60000L, PriceFeed.URL) && feed.due(now + 5 * 60000L + 1000, PriceFeed.URL), "");
        check("gold has no up/down at first (tirezh.com doesn't say)", fp.getJSONArray("gold").getJSONArray(1).getInt(4) == 0, fp.getJSONArray("gold"));
        body[0] = ANSWER.replace("\"priceIQD\":906175", "\"priceIQD\":911000").replace("\"priceIQD\":1035629", "\"priceIQD\":1030000");
        feed.refresh(PriceFeed.URL);
        JSONArray g2 = feed.forPage().getJSONArray("gold");
        check("...then gold up or down from the price before (21K up, 24K down)", g2.getJSONArray(1).getInt(4) == 1 && g2.getJSONArray(0).getInt(4) == -1, g2);
        feed.refresh(PriceFeed.URL);
        JSONArray g3 = feed.forPage().getJSONArray("gold");
        check("...and the same price again keeps its direction, as on a market board", g3.getJSONArray(1).getInt(4) == 1 && g3.getJSONArray(0).getInt(4) == -1, g3);
        body[0] = ANSWER;
        check("says where the prices are from", feed.status.startsWith("from tirezh.com"), feed.status);
        int v = feed.version();
        code[0] = 503;
        feed.refresh(PriceFeed.URL);
        check("tirezh.com has trouble: the last prices stay, and it says why", feed.forPage() != null && feed.version() == v && feed.status.contains("(503)"), feed.status);
        code[0] = 429;
        feed.refresh(PriceFeed.URL);
        check("tirezh.com says 'too many': waits 15 minutes", feed.status.contains("slow down") && !feed.due(System.currentTimeMillis() + 10 * 60000L, PriceFeed.URL), feed.status);
        offline[0] = true;
        PriceFeed again = new PriceFeed(file, f);
        check("kept in a file: there after a restart", again.forPage() != null && again.forPage().getJSONArray("currencies").length() == 3, again.forPage());
        again.refresh(PriceFeed.URL);
        check("no internet: the prices stay, and it says why", again.forPage() != null && again.status.contains("couldn't reach tirezh.com"), again.status);
        String other = "https://tirezh.example.workers.dev/api/economy";
        check("another address (pricesUrl): asked at once, even right after a try", again.due(System.currentTimeMillis(), other), "");
        asked.clear(); offline[0] = false; code[0] = 200; body[0] = ANSWER;
        again.refresh(other);
        check("...that address is asked, and the status names it", asked.size() == 1 && asked.get(0).equals(other) && again.status.startsWith("from tirezh.example.workers.dev"), asked + " " + again.status);
        check("...then every 5 minutes as before", !again.due(System.currentTimeMillis() + 60000L, other), "");
        check("the address from the setting: empty or not a web address -> tirezh.com",
            PriceFeed.address("").equals(PriceFeed.URL) && PriceFeed.address(null).equals(PriceFeed.URL) && PriceFeed.address("tirezh.dev/api/economy").equals(PriceFeed.URL)
            && PriceFeed.address("https://a b.dev/api/economy").equals(PriceFeed.URL), PriceFeed.address("tirezh.dev/api/economy"));
        check("...the worker's bare address gets /api/economy", PriceFeed.address(" https://tirezh.name.workers.dev ").equals("https://tirezh.name.workers.dev/api/economy")
            && PriceFeed.address("https://tirezh.name.workers.dev/").equals("https://tirezh.name.workers.dev/api/economy"), PriceFeed.address("https://tirezh.name.workers.dev/"));
        check("...a full address stays as typed", PriceFeed.address("https://prices.example.org/api/economy").equals("https://prices.example.org/api/economy")
            && PriceFeed.address("HTTP://x.dev/other?k=1").equals("HTTP://x.dev/other?k=1"), PriceFeed.address("HTTP://x.dev/other?k=1"));
        check("the site's name from an address", PriceFeed.host("https://a.b.c/api/economy?x=1").equals("a.b.c") && PriceFeed.host("http://x.dev:8080/p").equals("x.dev"), "");
        allPassed();
    }
}
