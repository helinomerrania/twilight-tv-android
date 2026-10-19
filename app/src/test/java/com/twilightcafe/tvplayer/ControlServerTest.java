package com.twilightcafe.tvplayer;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ControlServerTest {

    // parseQuery: the phone's ?pin=...&do=...

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

    // isLoopback: the box itself (the TV page) rather than a phone

    @Test
    public void isLoopback_nullIp_returnsFalse() {
        assertFalse("Null IP should return false", ControlServer.isLoopback(null));
    }

    @Test
    public void isLoopback_ipv4Loopback_returnsTrue() {
        assertTrue("Standard IPv4 loopback should return true", ControlServer.isLoopback("127.0.0.1"));
        assertTrue("Alternative IPv4 loopback should return true", ControlServer.isLoopback("127.1.2.3"));
        assertTrue("IPv4 loopback boundary should return true", ControlServer.isLoopback("127.255.255.254"));
    }

    @Test
    public void isLoopback_ipv6Loopback_returnsTrue() {
        assertTrue("Standard IPv6 loopback should return true", ControlServer.isLoopback("::1"));
        assertTrue("Long form IPv6 loopback should return true", ControlServer.isLoopback("0:0:0:0:0:0:0:1"));
    }

    @Test
    public void isLoopback_ipv4MappedIpv6Loopback_returnsTrue() {
        assertTrue("IPv4-mapped IPv6 loopback should return true", ControlServer.isLoopback("::ffff:127.0.0.1"));
        assertTrue("Alternative IPv4-mapped IPv6 loopback should return true", ControlServer.isLoopback("::ffff:127.1.2.3"));
    }

    @Test
    public void isLoopback_nonLoopbackIpv4_returnsFalse() {
        assertFalse("Local network IP should return false", ControlServer.isLoopback("192.168.1.1"));
        assertFalse("Another local network IP should return false", ControlServer.isLoopback("10.0.0.1"));
        assertFalse("Public IP should return false", ControlServer.isLoopback("8.8.8.8"));
        assertFalse("IP starting with 12 but not 127 should return false", ControlServer.isLoopback("12.0.0.1"));
        assertFalse("Empty string should return false", ControlServer.isLoopback(""));
        assertFalse("Random string should return false", ControlServer.isLoopback("not_an_ip"));
    }

    @Test
    public void isLoopback_nonLoopbackIpv6_returnsFalse() {
        assertFalse("Standard IPv6 should return false", ControlServer.isLoopback("2001:db8::1"));
        assertFalse("Another IPv6 should return false", ControlServer.isLoopback("fe80::1ff:fe23:4567:890a"));
    }

    // bodyTime: how long a phone may take to send a body of this size

    @Test
    public void bodyTime_tenSecondsAndAboutOneMoreFor64Kb() {
        assertEquals(10000, ControlServer.bodyTime(0));
        assertEquals(11024, ControlServer.bodyTime(64 * 1024));
        long picture = ControlServer.bodyTime(ControlServer.MAX_PICTURE_BODY);   // the biggest picture: about two and a half minutes
        assertTrue(picture > 150000 && picture < 160000);
    }
}
