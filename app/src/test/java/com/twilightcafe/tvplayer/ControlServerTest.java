package com.twilightcafe.tvplayer;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class ControlServerTest {

    @Test
    public void testParseQuery_happyPath() {
        String query = "key1=value1&key2=value2";
        Map<String, String> result = ControlServer.parseQuery(query);
        assertEquals(2, result.size());
        assertEquals("value1", result.get("key1"));
        assertEquals("value2", result.get("key2"));
    }

    @Test
    public void testParseQuery_emptyAndNull() {
        Map<String, String> resultNull = ControlServer.parseQuery(null);
        assertTrue(resultNull.isEmpty());

        Map<String, String> resultEmpty = ControlServer.parseQuery("");
        assertTrue(resultEmpty.isEmpty());
    }

    @Test
    public void testParseQuery_missingValue() {
        String query = "key1&key2=value2";
        Map<String, String> result = ControlServer.parseQuery(query);
        assertEquals(2, result.size());
        assertEquals("", result.get("key1"));
        assertEquals("value2", result.get("key2"));
    }

    @Test
    public void testParseQuery_urlEncoding() {
        String query = "key+1=value%201&key%3D2=value%262";
        Map<String, String> result = ControlServer.parseQuery(query);
        assertEquals(2, result.size());
        assertEquals("value 1", result.get("key 1"));
        assertEquals("value&2", result.get("key=2"));
    }

    @Test
    public void testParseQuery_malformedEncodingSkipsPair() {
        // %G0 is an invalid escape sequence and will throw IllegalArgumentException in URLDecoder.decode
        // The first pair is valid, the second is broken, the third is valid.
        String query = "valid1=ok1&broken=%G0&valid2=ok2";
        Map<String, String> result = ControlServer.parseQuery(query);

        assertEquals(2, result.size());
        assertEquals("ok1", result.get("valid1"));
        assertEquals("ok2", result.get("valid2"));
    }

    @Test
    public void testParseQuery_truncatedEscapeSequence() {
        // %2 is an incomplete escape sequence and will throw IllegalArgumentException
        String query = "key=%2";
        Map<String, String> result = ControlServer.parseQuery(query);
        assertTrue(result.isEmpty());
    }
}
