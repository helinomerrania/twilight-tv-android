package com.twilightcafe.tvplayer.phone;

import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class PhoneSettingsTest {

    @Test
    public void fromAPhone_theSettingsAsSent_onlyWithProperNames() throws Exception {
        JSONObject sent = new JSONObject("{\"volume\":70,\"tvName\":\"Garden\",\"bad key\":1,\"_note\":2}");
        JSONObject own = PhoneSettings.ownSettings(sent, new JSONObject("{\"tvName\":\"Hall\"}"), false);
        assertEquals(70, own.getInt("volume"));
        assertEquals("Garden", own.getString("tvName"));
        assertFalse(own.has("bad key"));
        assertFalse(own.has("_note"));
    }

    @Test
    public void savedOnEveryTv_eachKeepsItsOwnName() throws Exception {
        JSONObject sent = new JSONObject("{\"volume\":70,\"messages\":[\"Mint tea\"]}");
        JSONObject own = PhoneSettings.ownSettings(sent, new JSONObject("{\"tvName\":\"Garden\",\"volume\":50}"), true);
        assertEquals("Garden", own.getString("tvName"));
        assertEquals(70, own.getInt("volume"));
        assertEquals("Mint tea", own.getJSONArray("messages").getString(0));
        JSONObject named = PhoneSettings.ownSettings(new JSONObject("{\"tvName\":\"Hall\"}"), new JSONObject("{}"), true);
        assertFalse("a TV with no name of its own takes none from another", named.has("tvName"));
    }
}
