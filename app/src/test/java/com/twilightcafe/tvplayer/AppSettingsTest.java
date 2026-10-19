package com.twilightcafe.tvplayer;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class AppSettingsTest {

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
}
