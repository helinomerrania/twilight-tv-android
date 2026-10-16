package com.twilightcafe.tvplayer;

import org.json.JSONArray;
import org.junit.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class TitleBookTest {

    @Test
    public void testIds_nullArray() {
        List<String> result = TitleBook.ids(null);
        assertTrue(result.isEmpty());
    }

    @Test
    public void testIds_emptyArray() {
        List<String> result = TitleBook.ids(new JSONArray());
        assertTrue(result.isEmpty());
    }

    @Test
    public void testIds_validIds() {
        JSONArray array = new JSONArray();
        array.put("dQw4w9WgXcQ");
        array.put("jNQXAC9IVRw");

        List<String> result = TitleBook.ids(array);
        assertEquals(Arrays.asList("dQw4w9WgXcQ", "jNQXAC9IVRw"), result);
    }

    @Test
    public void testIds_duplicateValidIds() {
        JSONArray array = new JSONArray();
        array.put("dQw4w9WgXcQ");
        array.put("jNQXAC9IVRw");
        array.put("dQw4w9WgXcQ"); // duplicate

        List<String> result = TitleBook.ids(array);
        assertEquals(Arrays.asList("dQw4w9WgXcQ", "jNQXAC9IVRw"), result);
    }

    @Test
    public void testIds_invalidIds() {
        JSONArray array = new JSONArray();
        array.put("short"); // too short
        array.put("thisiswaytoolong"); // too long
        array.put("invalid@char"); // invalid characters
        array.put("dQw4w9WgXcQ"); // valid

        List<String> result = TitleBook.ids(array);
        assertEquals(Arrays.asList("dQw4w9WgXcQ"), result);
    }

    @Test
    public void testIds_nonStringElements() {
        JSONArray array = new JSONArray();
        array.put(12345); // number
        array.put(true); // boolean
        array.put("dQw4w9WgXcQ"); // valid string

        List<String> result = TitleBook.ids(array);
        assertEquals(Arrays.asList("dQw4w9WgXcQ"), result);
    }
}
