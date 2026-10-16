package com.twilightcafe.tvplayer;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;

import java.io.IOException;
import okhttp3.mockwebserver.MockWebServer;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.RecordedRequest;

import java.util.concurrent.TimeUnit;

public class NetTest {

    private MockWebServer server;

    @Before
    public void setUp() throws IOException {
        server = new MockWebServer();
        server.start();
    }

    @After
    public void tearDown() throws IOException {
        server.shutdown();
    }

    @Test
    public void get_returnsBody_onHttp200() throws Exception {
        String expectedBody = "{\"success\": true}";
        server.enqueue(new MockResponse().setBody(expectedBody).setResponseCode(200));

        String url = server.url("/test").toString();
        String result = Net.get(url, 5000);

        assertEquals(expectedBody, result);

        RecordedRequest request = server.takeRequest();
        assertEquals("TwilightTV-app", request.getHeader("User-Agent"));
        assertEquals("application/vnd.github+json, application/json, text/plain", request.getHeader("Accept"));
    }

    @Test
    public void get_returnsNull_onHttp404() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(404));

        String url = server.url("/test").toString();
        String result = Net.get(url, 5000);

        assertNull(result);
    }

    @Test
    public void get_throwsIOException_onHttp500() throws Exception {
        server.enqueue(new MockResponse().setResponseCode(500));

        String url = server.url("/test").toString();

        IOException thrown = assertThrows(IOException.class, () -> {
            Net.get(url, 5000);
        });
        assertEquals("HTTP 500", thrown.getMessage());
    }

    @Test
    public void get_throwsIOException_onTimeout() throws Exception {
        // Delay response by 3 seconds, but client timeout is 1 second
        server.enqueue(new MockResponse()
                .setBody("too late")
                .setHeadersDelay(3, TimeUnit.SECONDS));

        String url = server.url("/test").toString();

        assertThrows(IOException.class, () -> {
            Net.get(url, 1000);
        });
    }
}