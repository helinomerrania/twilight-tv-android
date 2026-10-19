package com.twilightcafe.tvplayer.phone;

import android.content.Context;
import android.content.SharedPreferences;

import com.twilightcafe.tvplayer.settings.AppSettings;

import java.security.SecureRandom;
import java.util.Locale;

/**
 * The PIN for the phone page: the one set on the phone (4 to 8 digits; never from settings.json, which is
 * public), otherwise this TV's own random one, kept in its memory.
 */
public final class PhonePin {

    private final Context context;
    private final AppSettings settings;
    private volatile String pin;

    public PhonePin(Context context, AppSettings settings) {
        this.context = context;
        this.settings = settings;
        this.pin = choose();
    }

    public String get() {
        return pin;
    }

    /** The settings changed: the PIN may have too */
    public void refresh() {
        pin = choose();
    }

    private String choose() {
        String set = settings.text("controlPin", "");
        if (set.matches("\\d{4,8}")) return set;
        SharedPreferences p = context.getSharedPreferences("phone", Context.MODE_PRIVATE);
        String own = p.getString("pin", "");
        if (!own.matches("\\d{4}")) {
            own = String.format(Locale.US, "%04d", new SecureRandom().nextInt(10000));
            p.edit().putString("pin", own).apply();
        }
        return own;
    }
}
