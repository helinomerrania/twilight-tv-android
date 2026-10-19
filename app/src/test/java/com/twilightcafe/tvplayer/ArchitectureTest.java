package com.twilightcafe.tvplayer;

import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/**
 * The app's folders keep to the rules in ARCHITECTURE.md: the ground floor never reaches up into the features
 * (util/ uses nothing of the app; settings/, store/ and update/ only util/; feeds/ and box/ only settings/ and
 * util/), and the top folder holds only what Android starts by name (the manifest's components).
 */
public class ArchitectureTest {

    private static final File MAIN = mainFolder();
    private static final File CODE = new File(MAIN, "java/com/twilightcafe/tvplayer");

    private static File mainFolder() {
        File f = new File("src/main");                         // Gradle runs the tests in app/
        return f.isDirectory() ? f : new File("app/src/main");
    }

    // The folders each ground-floor folder may use ("top": BuildConfig and the manifest's components)
    private static final Map<String, Set<String>> MAY_USE = new HashMap<>();

    static {
        MAY_USE.put("util", set());
        MAY_USE.put("settings", set("util"));
        MAY_USE.put("store", set("util"));
        MAY_USE.put("update", set("util", "top"));
        MAY_USE.put("feeds", set("settings", "util", "top"));
        MAY_USE.put("box", set("settings", "util"));
    }

    private static Set<String> set(String... s) {
        return new HashSet<>(Arrays.asList(s));
    }

    private static final Pattern USES = Pattern.compile("^import (?:static )?com\\.twilightcafe\\.tvplayer\\.(\\w+)[.;]", Pattern.MULTILINE);

    private static String read(File f) throws IOException {
        return new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8);
    }

    @Test
    public void theGroundFloorNeverReachesUp() throws IOException {
        for (Map.Entry<String, Set<String>> rule : MAY_USE.entrySet()) {
            File[] files = new File(CODE, rule.getKey()).listFiles((d, n) -> n.endsWith(".java"));
            assertTrue(rule.getKey() + "/ is missing", files != null && files.length > 0);
            for (File f : files) {
                Matcher m = USES.matcher(read(f));
                while (m.find()) {
                    String used = Character.isUpperCase(m.group(1).charAt(0)) ? "top" : m.group(1);
                    if (used.equals(rule.getKey())) continue;
                    assertTrue(rule.getKey() + "/" + f.getName() + " uses " + used + "/, which " + rule.getKey() + "/ may not",
                            rule.getValue().contains(used));
                }
            }
        }
    }

    @Test
    public void theTopFolderHoldsOnlyWhatAndroidStartsByName() throws IOException {
        List<String> components = new ArrayList<>();
        Matcher m = Pattern.compile("android:name=\"\\.(\\w+)\"").matcher(read(new File(MAIN, "AndroidManifest.xml")));
        while (m.find()) components.add(m.group(1));
        List<String> top = new ArrayList<>();
        for (String n : CODE.list()) {
            if (n.endsWith(".java")) top.add(n.substring(0, n.length() - 5));
        }
        components.sort(null);
        top.sort(null);
        assertEquals(components, top);
    }
}
