package com.twilightcafe.tvplayer;

import org.junit.Test;

import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Vector;

import static org.junit.Assert.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

public class NetTest {

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