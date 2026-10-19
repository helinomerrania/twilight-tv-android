package com.twilightcafe.tvplayer.update;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class UpdaterTest {

    private static final byte[] APP = new byte[3 << 20];   // a 3 MB "app file"

    private static long copy(byte[] data, long expected, long max) throws IOException {
        return Updater.copy(new ByteArrayInputStream(data), new ByteArrayOutputStream(), expected, max);
    }

    // copy: the download into Android's installer, counted

    @Test
    public void copy_wholeFile_isAccepted() throws IOException {
        assertEquals(APP.length, copy(APP, APP.length, Updater.MAX_APK));
    }

    @Test
    public void copy_sizeUnknown_isAcceptedUpToTheCap() throws IOException {
        assertEquals(APP.length, copy(APP, -1, Updater.MAX_APK));
    }

    @Test
    public void copy_cutShort_isRefused() {
        IOException e = assertThrows(IOException.class, () -> copy(Arrays.copyOf(APP, 2 << 20), APP.length, Updater.MAX_APK));
        assertEquals("2 of 3 MB", e.getMessage());
    }

    @Test
    public void copy_biggerThanGitHubSaid_isRefused() {
        IOException e = assertThrows(IOException.class, () -> copy(APP, 1 << 20, Updater.MAX_APK));
        assertEquals("bigger than GitHub said", e.getMessage());
    }

    @Test
    public void copy_biggerThanTheAppCouldBe_isRefused() {
        IOException e = assertThrows(IOException.class, () -> copy(APP, -1, 2L << 20));
        assertEquals("bigger than the app could be", e.getMessage());
    }

    @Test
    public void copy_nothingArrived_isRefused() {
        assertThrows(IOException.class, () -> copy(new byte[0], APP.length, Updater.MAX_APK));
    }

    // buildNumber and shown: the release tags and the build number people see

    @Test
    public void buildNumber_fromReleaseTags() {
        assertEquals(100096, Updater.buildNumber("build-100096-1"));
        assertEquals(0, Updater.buildNumber("firefox"));
        assertEquals(0, Updater.buildNumber("build-x-1"));
        assertEquals(0, Updater.buildNumber(null));
    }

    @Test
    public void shown_isTheBuildPeopleSee() {
        assertEquals(96, Updater.shown(100096));
        assertEquals(15, Updater.shown(15));
    }
}
