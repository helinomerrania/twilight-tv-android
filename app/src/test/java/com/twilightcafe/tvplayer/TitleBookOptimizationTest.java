package com.twilightcafe.tvplayer;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

public class TitleBookOptimizationTest {

    @Test
    public void testOptimization() throws Exception {
        LinkedHashMap<String, String[]> known = new LinkedHashMap<>();
        for (int i = 0; i < 3000; i++) {
            known.put("id_" + i, new String[] { "Title " + i, "Channel " + i });
        }

        long t1 = System.currentTimeMillis();
        for (int j = 0; j < 100; j++) {
            JSONObject t = new JSONObject();
            for (Map.Entry<String, String[]> e : known.entrySet()) {
                t.put(e.getKey(), new JSONArray().put(e.getValue()[0]).put(e.getValue()[1]));
            }
            String s = new JSONObject().put("titles", t).toString();
        }
        long t2 = System.currentTimeMillis();
        System.out.println("Old method (full serialization) took: " + (t2 - t1) + "ms");

        long t3 = System.currentTimeMillis();
        for (int j = 0; j < 100; j++) {
            JSONObject t = new JSONObject();
            for (Map.Entry<String, String[]> e : known.entrySet()) {
                t.put(e.getKey(), new JSONArray(e.getValue()));
            }
            String s = new JSONObject().put("titles", t).toString();
        }
        long t4 = System.currentTimeMillis();
        System.out.println("New method 5 (JSONArray(Object)) took: " + (t4 - t3) + "ms");
    }
}
