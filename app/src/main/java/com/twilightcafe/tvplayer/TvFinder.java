package com.twilightcafe.tvplayer;

import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Finds the other café TVs on the network, so the phone page can list them.
 * Each TV announces itself as "TV 23" (the end of its network address).
 */
final class TvFinder {

    private static final String TYPE = "_twilighttv._tcp.";

    private final NsdManager nsd;
    private final String myName;
    private final Map<String, String> found = Collections.synchronizedMap(new TreeMap<String, String>());
    private final ArrayDeque<NsdServiceInfo> toResolve = new ArrayDeque<>();
    private boolean resolving;
    private volatile String registeredAs;
    private NsdManager.RegistrationListener registration;
    private NsdManager.DiscoveryListener discovery;

    TvFinder(Context c, String myName) {
        this.nsd = (NsdManager) c.getSystemService(Context.NSD_SERVICE);
        this.myName = myName;
    }

    void start(int port) {
        if (nsd == null || port <= 0) return;
        NsdServiceInfo me = new NsdServiceInfo();
        me.setServiceName(myName);
        me.setServiceType(TYPE);
        me.setPort(port);
        registration = new NsdManager.RegistrationListener() {
            @Override public void onServiceRegistered(NsdServiceInfo info) { registeredAs = info.getServiceName(); }
            @Override public void onRegistrationFailed(NsdServiceInfo info, int error) { }
            @Override public void onServiceUnregistered(NsdServiceInfo info) { }
            @Override public void onUnregistrationFailed(NsdServiceInfo info, int error) { }
        };
        discovery = new NsdManager.DiscoveryListener() {
            @Override public void onDiscoveryStarted(String type) { }
            @Override public void onDiscoveryStopped(String type) { }
            @Override public void onStartDiscoveryFailed(String type, int error) { }
            @Override public void onStopDiscoveryFailed(String type, int error) { }
            @Override public void onServiceFound(NsdServiceInfo info) {
                String name = info.getServiceName();
                if (name.equals(myName) || name.equals(registeredAs)) return;
                resolve(info);
            }
            @Override public void onServiceLost(NsdServiceInfo info) {
                found.remove(info.getServiceName());
            }
        };
        try {
            nsd.registerService(me, NsdManager.PROTOCOL_DNS_SD, registration);
        } catch (RuntimeException e) {
            registration = null;
        }
        try {
            nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, discovery);
        } catch (RuntimeException e) {
            discovery = null;
        }
    }

    void stop() {
        if (nsd == null) return;
        try {
            if (registration != null) nsd.unregisterService(registration);
        } catch (RuntimeException e) {
            // already gone
        }
        try {
            if (discovery != null) nsd.stopServiceDiscovery(discovery);
        } catch (RuntimeException e) {
            // already stopped
        }
        registration = null;
        discovery = null;
    }

    /** The other TVs: { name, address } pairs, sorted by name. */
    List<String[]> others() {
        List<String[]> list = new ArrayList<>();
        synchronized (found) {
            for (Map.Entry<String, String> e : found.entrySet()) list.add(new String[] { e.getKey(), e.getValue() });
        }
        return list;
    }

    // Android looks up one TV at a time
    private synchronized void resolve(NsdServiceInfo info) {
        toResolve.add(info);
        if (!resolving) resolveNext();
    }

    private synchronized void resolveNext() {
        NsdServiceInfo next = toResolve.poll();
        if (next == null) {
            resolving = false;
            return;
        }
        resolving = true;
        try {
            nsd.resolveService(next, new NsdManager.ResolveListener() {
                @Override public void onResolveFailed(NsdServiceInfo info, int error) {
                    resolveNext();
                }
                @Override public void onServiceResolved(NsdServiceInfo info) {
                    InetAddress host = info.getHost();
                    if (host instanceof Inet4Address) {
                        found.put(info.getServiceName(), "http://" + host.getHostAddress() + ":" + info.getPort() + "/");
                    }
                    resolveNext();
                }
            });
        } catch (RuntimeException e) {
            resolving = false;
        }
    }
}
