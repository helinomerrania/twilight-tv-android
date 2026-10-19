package com.twilightcafe.tvplayer.phone;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public class HttpTest {

    // parseQuery: the phone's ?pin=...&do=...

    @Test
    public void testParseQuery_happyPath() {
        String query = "key1=value1&key2=value2";
        Map<String, String> result = Http.parseQuery(query);
        assertEquals(2, result.size());
        assertEquals("value1", result.get("key1"));
        assertEquals("value2", result.get("key2"));
    }

    @Test
    public void testParseQuery_emptyAndNull() {
        Map<String, String> resultNull = Http.parseQuery(null);
        assertTrue(resultNull.isEmpty());

        Map<String, String> resultEmpty = Http.parseQuery("");
        assertTrue(resultEmpty.isEmpty());
    }

    @Test
    public void testParseQuery_missingValue() {
        String query = "key1&key2=value2";
        Map<String, String> result = Http.parseQuery(query);
        assertEquals(2, result.size());
        assertEquals("", result.get("key1"));
        assertEquals("value2", result.get("key2"));
    }

    @Test
    public void testParseQuery_urlEncoding() {
        String query = "key+1=value%201&key%3D2=value%262";
        Map<String, String> result = Http.parseQuery(query);
        assertEquals(2, result.size());
        assertEquals("value 1", result.get("key 1"));
        assertEquals("value&2", result.get("key=2"));
    }

    @Test
    public void testParseQuery_malformedEncodingSkipsPair() {
        // %G0 is an invalid escape sequence and will throw IllegalArgumentException in URLDecoder.decode
        // The first pair is valid, the second is broken, the third is valid.
        String query = "valid1=ok1&broken=%G0&valid2=ok2";
        Map<String, String> result = Http.parseQuery(query);

        assertEquals(2, result.size());
        assertEquals("ok1", result.get("valid1"));
        assertEquals("ok2", result.get("valid2"));
    }

    @Test
    public void testParseQuery_truncatedEscapeSequence() {
        // %2 is an incomplete escape sequence and will throw IllegalArgumentException
        String query = "key=%2";
        Map<String, String> result = Http.parseQuery(query);
        assertTrue(result.isEmpty());
    }

    // send: every reply closes its connection, says what it is, and by default is never kept

    @Test
    public void send_aReplyWithItsHeaders() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Http.notFound(out);
        String r = new String(out.toByteArray(), StandardCharsets.UTF_8);
        assertTrue(r, r.startsWith("HTTP/1.1 404 Not Found\r\n"));
        assertTrue(r, r.contains("Content-Type: text/plain; charset=utf-8\r\n"));
        assertTrue(r, r.contains("Content-Length: 9\r\n"));
        assertTrue(r, r.contains("Cache-Control: no-store\r\n"));
        assertTrue(r, r.contains("X-Content-Type-Options: nosniff\r\n"));
        assertTrue(r, r.contains("Referrer-Policy: no-referrer\r\n"));
        assertTrue(r, r.endsWith("Connection: close\r\n\r\nNot found"));
    }

    @Test
    public void send_theLengthIsInBytes() throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Http.json(out, 200, "{\"name\":\"کافێ\"}");
        String r = new String(out.toByteArray(), StandardCharsets.UTF_8);
        int body = "{\"name\":\"کافێ\"}".getBytes(StandardCharsets.UTF_8).length;
        assertTrue(r, r.contains("Content-Length: " + body + "\r\n"));
        assertTrue(r, r.contains("Content-Type: application/json; charset=utf-8\r\n"));
    }

    // readLine: the request line and the headers

    @Test
    public void readLine_linesWithoutTheirBreaks() throws IOException {
        InputStream in = new ByteArrayInputStream("GET / HTTP/1.1\r\nHost: tv\r\n\r\n".getBytes(StandardCharsets.ISO_8859_1));
        long later = System.currentTimeMillis() + 5000;
        assertEquals("GET / HTTP/1.1", Http.readLine(in, later));
        assertEquals("Host: tv", Http.readLine(in, later));
        assertEquals("", Http.readLine(in, later));
        assertNull(Http.readLine(in, later));                   // the end
    }

    @Test
    public void readLine_aHugeLineIsRefused() {
        byte[] huge = new byte[9000];
        Arrays.fill(huge, (byte) 'a');
        InputStream in = new ByteArrayInputStream(huge);
        assertThrows(IOException.class, () -> Http.readLine(in, System.currentTimeMillis() + 5000));
    }
}
