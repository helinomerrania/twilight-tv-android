package com.twilightcafe.tvplayer.phone;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class PinGuardTest {

    @Test
    public void tenWrongPinsLockThatPhoneOnly() {
        PinGuard g = new PinGuard();
        for (int i = 0; i < 9; i++) g.wrongPin("192.168.1.50");
        assertFalse(g.isLocked("192.168.1.50"));
        g.wrongPin("192.168.1.50");
        assertTrue(g.isLocked("192.168.1.50"));
        assertFalse(g.isLocked("192.168.1.51"));
    }

    @Test
    public void theRightPinStartsTheCountAgain() {
        PinGuard g = new PinGuard();
        for (int i = 0; i < 9; i++) g.wrongPin("192.168.1.50");
        g.rightPin("192.168.1.50");
        g.wrongPin("192.168.1.50");
        assertFalse(g.isLocked("192.168.1.50"));
    }

    @Test
    public void theLockEnds() throws InterruptedException {
        PinGuard g = new PinGuard();
        g.lockMillis = 50;
        for (int i = 0; i < 10; i++) g.wrongPin("192.168.1.50");
        assertTrue(g.isLocked("192.168.1.50"));
        Thread.sleep(120);
        assertFalse(g.isLocked("192.168.1.50"));
    }

    @Test
    public void guessingFromAddressAfterAddressKeepsNewPhonesOut() {
        PinGuard g = new PinGuard();
        g.rightPin("192.168.1.10");                                       // a staff phone
        for (int i = 0; i < 19; i++) g.wrongPin("192.168.1." + (100 + i)); // one wrong PIN each: under each one's limit
        assertEquals(0, g.guessing());
        assertFalse(g.shutOut("192.168.1.200"));
        g.wrongPin("192.168.1.150");                                      // the 20th in the hour
        assertTrue(g.shutOut("192.168.1.200"));                           // a new phone: kept out
        assertFalse(g.shutOut("192.168.1.10"));                           // the staff phone never notices
        assertEquals(20, g.guessing());
    }
}
