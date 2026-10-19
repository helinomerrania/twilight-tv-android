package com.twilightcafe.tvplayer;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Vector;
import java.util.concurrent.TimeUnit;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

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

    // findLocalIp: the TV's address on the café network, from stand-in network cards

    @Test
    public void testFindLocalIp_ReturnsValidSiteLocalIPv4() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(true);
        when(mockNi.isLoopback()).thenReturn(false);
        when(mockNi.isVirtual()).thenReturn(false);

        Inet4Address mockAddress = mock(Inet4Address.class);
        when(mockAddress.isLoopbackAddress()).thenReturn(false);
        when(mockAddress.isSiteLocalAddress()).thenReturn(true);
        when(mockAddress.getHostAddress()).thenReturn("192.168.1.100");

        Enumeration<InetAddress> addresses = new Vector<InetAddress>(Collections.singletonList(mockAddress)).elements();
        when(mockNi.getInetAddresses()).thenReturn(addresses);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("192.168.1.100", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_IgnoresInterfaceNotUp() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(false);
        when(mockNi.isLoopback()).thenReturn(false);
        when(mockNi.isVirtual()).thenReturn(false);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_IgnoresLoopbackInterface() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(true);
        when(mockNi.isLoopback()).thenReturn(true);
        when(mockNi.isVirtual()).thenReturn(false);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_IgnoresVirtualInterface() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(true);
        when(mockNi.isLoopback()).thenReturn(false);
        when(mockNi.isVirtual()).thenReturn(true);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_IgnoresIPv6Address() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(true);
        when(mockNi.isLoopback()).thenReturn(false);
        when(mockNi.isVirtual()).thenReturn(false);

        Inet6Address mockAddress = mock(Inet6Address.class);
        when(mockAddress.isLoopbackAddress()).thenReturn(false);
        when(mockAddress.isSiteLocalAddress()).thenReturn(true);
        when(mockAddress.getHostAddress()).thenReturn("fe80::1ff:fe23:4567:890a");

        Enumeration<InetAddress> addresses = new Vector<InetAddress>(Collections.singletonList(mockAddress)).elements();
        when(mockNi.getInetAddresses()).thenReturn(addresses);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_IgnoresLoopbackAddress() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(true);
        when(mockNi.isLoopback()).thenReturn(false);
        when(mockNi.isVirtual()).thenReturn(false);

        Inet4Address mockAddress = mock(Inet4Address.class);
        when(mockAddress.isLoopbackAddress()).thenReturn(true);
        when(mockAddress.isSiteLocalAddress()).thenReturn(false);
        when(mockAddress.getHostAddress()).thenReturn("127.0.0.1");

        Enumeration<InetAddress> addresses = new Vector<InetAddress>(Collections.singletonList(mockAddress)).elements();
        when(mockNi.getInetAddresses()).thenReturn(addresses);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_IgnoresNonSiteLocalAddress() throws Exception {
        NetworkInterface mockNi = mock(NetworkInterface.class);
        when(mockNi.isUp()).thenReturn(true);
        when(mockNi.isLoopback()).thenReturn(false);
        when(mockNi.isVirtual()).thenReturn(false);

        Inet4Address mockAddress = mock(Inet4Address.class);
        when(mockAddress.isLoopbackAddress()).thenReturn(false);
        when(mockAddress.isSiteLocalAddress()).thenReturn(false);
        when(mockAddress.getHostAddress()).thenReturn("8.8.8.8");

        Enumeration<InetAddress> addresses = new Vector<InetAddress>(Collections.singletonList(mockAddress)).elements();
        when(mockNi.getInetAddresses()).thenReturn(addresses);

        List<NetworkInterface> interfaces = Collections.singletonList(mockNi);

        assertEquals("", Net.findLocalIp(interfaces));
    }

    @Test
    public void testFindLocalIp_ThrowsExceptionReturnsEmptyString() {
        // Since we refactored it, we can test the exception handling by passing null which will cause an NPE
        assertEquals("", Net.findLocalIp(null));
    }
}
