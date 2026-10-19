package com.twilightcafe.tvplayer.phone;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/**
 * Who may try the phone page's PIN. Ten wrong PINs from one phone lock it out for 10 minutes, so customers on
 * the café Wi-Fi can't guess their way in. And as a new address is easy to take: once 20 wrong PINs have come
 * in an hour from all phones together, only phones that gave the right PIN in the last day can try, until
 * 10 minutes after the last wrong one. Then one more guess, and it starts again: a few guesses an hour instead
 * of thousands. The staff's phones that already had the PIN never notice. Plain Java, so it can be tested on
 * a computer.
 */
final class PinGuard {

    long lockMillis = 10 * 60 * 1000L;
    int maxFails = 10;
    int maxWrongAll = 20;                                 // wrong PINs from all phones together...
    long guessWindow = 60 * 60 * 1000L;                   // ...in this long
    long trustMillis = 24 * 60 * 60 * 1000L;              // a phone that gave the right PIN is known for a day

    private final Map<String, Integer> fails = new HashMap<>();
    private final Map<String, Long> lockedUntil = new HashMap<>();
    private final Map<String, Long> trusted = new HashMap<>();    // phones that gave the right PIN: when they last did
    private final ArrayDeque<Long> wrongs = new ArrayDeque<>();   // when each wrong PIN came, from any phone
    private long guessingUntil;                                   // someone guessing: only known phones until then

    /** This phone gave ten wrong PINs in a row, less than 10 minutes ago */
    synchronized boolean isLocked(String ip) {
        Long until = lockedUntil.get(ip);
        if (until == null) return false;
        if (System.currentTimeMillis() < until) return true;
        lockedUntil.remove(ip);
        return false;
    }

    synchronized void wrongPin(String ip) {
        Integer n = fails.get(ip);
        n = n == null ? 1 : n + 1;
        if (n >= maxFails) {
            fails.remove(ip);
            lockedUntil.put(ip, System.currentTimeMillis() + lockMillis);
        } else {
            fails.put(ip, n);
        }
        long now = System.currentTimeMillis();
        wrongs.addLast(now);
        forgetOldWrongs(now);
        if (wrongs.size() >= maxWrongAll) guessingUntil = now + lockMillis;
    }

    synchronized void rightPin(String ip) {
        fails.remove(ip);
        long now = System.currentTimeMillis();
        trusted.put(ip, now);
        if (trusted.size() > 200) trusted.values().removeIf(t -> now - t >= trustMillis);
    }

    /** Someone is guessing from one address after another, and this phone isn't one that had the PIN */
    synchronized boolean shutOut(String ip) {
        long now = System.currentTimeMillis();
        if (now >= guessingUntil) return false;
        Long t = trusted.get(ip);
        return t == null || now - t >= trustMillis;
    }

    /** For the phone page: the wrong PINs in the last hour while new phones are being kept out (else 0) */
    synchronized int guessing() {
        long now = System.currentTimeMillis();
        if (now >= guessingUntil) return 0;
        forgetOldWrongs(now);
        return Math.max(1, wrongs.size());
    }

    private void forgetOldWrongs(long now) {
        while (!wrongs.isEmpty() && (wrongs.peekFirst() < now - guessWindow || wrongs.size() > 1000)) wrongs.removeFirst();
    }
}
