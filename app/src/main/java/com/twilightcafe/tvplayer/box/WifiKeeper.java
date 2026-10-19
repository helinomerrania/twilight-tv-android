package com.twilightcafe.tvplayer.box;

import android.content.Context;
import android.net.wifi.WifiManager;

/** Wi-Fi at full power while Twilight TV is on screen (with a cable, or no Wi-Fi, there's nothing to keep) */
public final class WifiKeeper {

    private final WifiManager.WifiLock lock;

    public WifiKeeper(Context c) {
        WifiManager wifi = (WifiManager) c.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        lock = wifi == null ? null : make(wifi);
    }

    @SuppressWarnings("deprecation")
    private static WifiManager.WifiLock make(WifiManager wifi) {
        WifiManager.WifiLock lock = wifi.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "twilight-tv");
        lock.setReferenceCounted(false);
        return lock;
    }

    public void hold() {
        if (lock != null) lock.acquire();
    }

    public void letGo() {
        if (lock != null && lock.isHeld()) lock.release();
    }

    public boolean held() {
        return lock != null && lock.isHeld();
    }
}
