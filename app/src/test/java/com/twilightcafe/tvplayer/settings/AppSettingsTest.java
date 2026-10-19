package com.twilightcafe.tvplayer.settings;

import com.twilightcafe.tvplayer.Checks;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class AppSettingsTest extends Checks {

    // settings.json is public on GitHub: the PIN and the weather key are never taken from it

    @Test
    public void withoutSecrets_leavesOutThePinAndWeatherKey() throws Exception {
        JSONObject file = new JSONObject("{\"controlPin\": \"2580\", \"weatherKey\": \"abc123\", \"volume\": 80}");
        AppSettings.withoutSecrets(file);
        assertFalse(file.has("controlPin"));
        assertFalse(file.has("weatherKey"));
        assertEquals(80, file.getInt("volume"));
    }

    @Test
    public void withoutSecrets_null_staysNull() {
        assertNull(AppSettings.withoutSecrets(null));
    }

    @Test
    public void secretsIn_namesTheOnesWithAValue() throws Exception {
        assertEquals("controlPin and weatherKey", AppSettings.secretsIn(new JSONObject("{\"controlPin\": \"2580\", \"weatherKey\": \"k\"}")));
        assertEquals("weatherKey", AppSettings.secretsIn(new JSONObject("{\"controlPin\": \"\", \"weatherKey\": \"k\"}")));
        assertTrue(AppSettings.secretsIn(new JSONObject("{\"controlPin\": \" \", \"volume\": 1}")).isEmpty());
    }

    @Test
    public void merge_thePinSetOnThePhoneIsTheOneUsed() throws Exception {
        JSONObject file = AppSettings.withoutSecrets(new JSONObject("{\"controlPin\": \"2580\", \"volume\": 90}"));
        JSONObject both = AppSettings.merge(file, new JSONObject("{\"controlPin\": \"135790\"}"));
        assertEquals("135790", both.getString("controlPin"));
        assertEquals(90, both.getInt("volume"));
        assertFalse(AppSettings.merge(file, new JSONObject("{}")).has("controlPin"));
    }

    // settings.json and this TV's own settings together, word by word (the PIN and the key: above)

    @Test
    public void settingsAndWordsTogether() throws Exception {
        System.out.println("settings.json and this TV's own settings, together");
        JSONObject file = new JSONObject("{\"volume\": 90, \"priceItems\": [\"us\", \"eu\"], \"labels\": {\"locale\": \"ckb\", \"prices\": \"نرخی زێڕ و دراو\","
            + " \"weatherCredit\": \"MET Norway\", \"kurdishMonths\": \"خاکەلێوە,گوڵان\", \"pound\": \"پاوەن\"}}");
        JSONObject mine = new JSONObject("{\"volume\": 70, \"priceItems\": [\"gold21\"], \"labels\": {\"prices\": \"نرخەکان\", \"weatherCredit\": \"کەشوهەوا: MET Norway (CC BY 4.0)\","
            + " \"pricesSource\": \"تیرێژ ئیندێکس\"}}");
        JSONObject m = AppSettings.merge(file, mine);
        JSONObject w = m.getJSONObject("labels");
        check("plain settings: this TV's win (volume 70, its own prices list)", m.getInt("volume") == 70 && m.getJSONArray("priceItems").length() == 1, m);
        check("words: word by word, this TV's own one wins (prices)", w.getString("prices").equals("نرخەکان"), w);
        check("...and new shared words reach it (Kurdish months, the pound, locale)", w.getString("kurdishMonths").equals("خاکەلێوە,گوڵان")
            && w.getString("pound").equals("پاوەن") && w.getString("locale").equals("ckb"), w);
        check("...the long weather credit of before, kept from the phone, gives way to settings.json's", w.getString("weatherCredit").equals("MET Norway"), w);
        check("...an own word for a different credit stays", AppSettings.merge(file, new JSONObject("{\"labels\": {\"weatherCredit\": \"MET\"}}"))
            .getJSONObject("labels").getString("weatherCredit").equals("MET"), "");
        check("...words no longer used are harmless (kept)", w.getString("pricesSource").equals("تیرێژ ئیندێکس"), w);
        check("the shared settings themselves are left alone", file.getJSONObject("labels").getString("prices").equals("نرخی زێڕ و دراو") && file.getInt("volume") == 90, file);
        JSONObject noFileWords = AppSettings.merge(new JSONObject("{\"volume\": 1}"), mine);
        check("no shared words: this TV's words as they are", noFileWords.getJSONObject("labels").getString("prices").equals("نرخەکان")
            && noFileWords.getJSONObject("labels").has("weatherCredit"), noFileWords);
        JSONObject notObject = AppSettings.merge(file, new JSONObject("{\"labels\": \"x\"}"));
        check("words that aren't a list of words replace them (as before)", notObject.getString("labels").equals("x"), notObject);
        allPassed();
    }
}
