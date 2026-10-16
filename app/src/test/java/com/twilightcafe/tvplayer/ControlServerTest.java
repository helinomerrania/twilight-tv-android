package com.twilightcafe.tvplayer;

import org.junit.Test;
import static org.junit.Assert.*;

public class ControlServerTest {

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
}
