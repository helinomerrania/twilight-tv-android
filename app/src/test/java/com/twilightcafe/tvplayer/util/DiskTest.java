package com.twilightcafe.tvplayer.util;

import org.junit.Test;

import java.io.File;
import java.io.FileNotFoundException;
import java.nio.file.Files;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;

public class DiskTest {

    // A folder of its own for each test, gone after it
    private interface InFolder {
        void run(File dir) throws Exception;
    }

    private static void inFolder(InFolder test) throws Exception {
        File dir = Files.createTempDirectory("disk").toFile();
        try {
            test.run(dir);
        } finally {
            File[] left = dir.listFiles();
            for (int i = 0; left != null && i < left.length; i++) left[i].delete();
            dir.delete();
        }
    }

    @Test
    public void textComesBackAsItWasWritten() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "menu.json");
            String menu = "{\"name\":{\"ku\":\"چای\",\"en\":\"Tea\"},\"price\":1000}";
            Disk.write(f, menu);
            assertEquals(menu, Disk.readText(f));
        });
    }

    @Test
    public void bytesComeBackAsTheyWereWritten_evenMoreThanOneReadsWorth() throws Exception {
        inFolder(dir -> {
            byte[] picture = new byte[200000];                   // more than one 64 KB read
            for (int i = 0; i < picture.length; i++) picture[i] = (byte) (i * 31 + 7);
            File f = new File(dir, "abc123.jpg");
            Disk.write(f, picture);
            assertArrayEquals(picture, Disk.readBytes(f));
        });
    }

    @Test
    public void aNewVersionTakesTheOldOnesPlace_andNoHalfWrittenFileStays() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "prices.json");
            Disk.write(f, "the old prices");
            Disk.write(f, "the new prices");
            assertEquals("the new prices", Disk.readText(f));
            assertFalse(new File(dir, "prices.json.tmp").exists());
            assertEquals(1, dir.list().length);
        });
    }

    @Test
    public void anEmptyFileReadsAsNothing() throws Exception {
        inFolder(dir -> {
            File f = new File(dir, "index.txt");
            Disk.write(f, new byte[0]);
            assertEquals(0, Disk.readBytes(f).length);
            assertEquals("", Disk.readText(f));
        });
    }

    @Test
    public void aFileThatIsntThereIsAnError() throws Exception {
        inFolder(dir -> assertThrows(FileNotFoundException.class, () -> Disk.readBytes(new File(dir, "not-there.jpg"))));
    }
}
