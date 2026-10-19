package com.twilightcafe.tvplayer.phone;

import com.twilightcafe.tvplayer.app.AppAssets;
import com.twilightcafe.tvplayer.page.TvPage;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The pages' own files (app/src/main/assets): every file the app's server hands out is in the app, each page and
 * its styles ask only for files their server hands out, and each page folder holds only what is used. A file
 * moved or renamed fails here, on a computer, rather than as a blank page on a TV.
 */
public class PageFilesTest {

    private static final File ASSETS = assetsFolder();

    private static File assetsFolder() {
        File f = new File("src/main/assets");                  // Gradle runs the tests in app/
        return f.isDirectory() ? f : new File("app/src/main/assets");
    }

    private static boolean inApp(String name) {
        File f = new File(ASSETS, name);
        return f.isFile() && f.length() > 0;
    }

    private static String read(String name) throws IOException {
        return new String(Files.readAllBytes(new File(ASSETS, name).toPath()), StandardCharsets.UTF_8);
    }

    private static final Pattern ASKS = Pattern.compile("(?:src|href)=\"([^\"]*)\"|url\\(\\s*[\"']?([^\"')]+)");

    // The addresses a page or style sheet asks for (src="", href="", url()), made whole against its own address;
    // other websites and data: addresses left out
    private static List<String> asksFor(String text, String ownAddress) {
        List<String> out = new ArrayList<>();
        Matcher m = ASKS.matcher(text);
        while (m.find()) {
            String ref = (m.group(1) != null ? m.group(1) : m.group(2)).trim();
            if (ref.isEmpty() || ref.startsWith("#") || ref.matches("(?i)(https?|data|javascript|mailto|tel):.*")) continue;
            out.add(URI.create("http://tv" + ownAddress).resolve(ref).getPath());
        }
        return out;
    }

    // A page and its style sheets, everything they ask for
    private static List<String> pageAsksFor(String page, String pageAddress, List<String> files) throws IOException {
        List<String> asked = asksFor(read(page), pageAddress);
        for (String f : files) {
            if (f.endsWith(".css")) asked.addAll(asksFor(read(f.substring(1)), f));
        }
        return asked;
    }

    // What each server hands out (ControlServer: tvRequest, respond and menuRequest)
    private static boolean tvServes(String path) {
        return ControlServer.TV_FILES.contains(path)
                || path.matches("/tv/looks/[a-z]{1,20}\\.jpg") && inApp(path.substring("/tv/".length()));
    }

    private static boolean menuServes(String path) {
        return ControlServer.MENU_FILES.contains(path)
                || path.matches("/menu/fonts/[a-z0-9-]{1,40}\\.woff2") && inApp(path.substring("/menu/".length()))
                || ControlServer.ASSETS.containsKey(path) && ControlServer.ASSETS.get(path).endsWith(".png");
    }

    private static boolean phoneServes(String path) {
        return ControlServer.PHONE_FILES.contains(path) || ControlServer.ASSETS.containsKey(path) || menuServes(path);
    }

    // Every file in a page's folder is the page itself or one of the files its server hands out
    private static void onlyWhatIsUsed(String folder, List<String> served, String... pages) {
        List<String> used = new ArrayList<>(Arrays.asList(pages));
        for (String f : served) used.add(f.substring(1));
        String[] names = new File(ASSETS, folder).list();
        assertTrue("assets/" + folder + "/ is missing", names != null && names.length > 0);
        for (String n : names) assertTrue("assets/" + folder + "/" + n + " is in the app, but nothing uses it", used.contains(folder + "/" + n));
    }

    @Test
    public void thePagesAreInTheApp() {
        for (String page : Arrays.asList(AppAssets.TV_PAGE, AppAssets.TV_BRIDGE, AppAssets.PHONE_PAGE, AppAssets.MENU_PAGE)) {
            assertTrue(page + " is missing from the assets", inApp(page));
        }
    }

    @Test
    public void everyFileTheServerHandsOutIsInTheApp() {
        List<String> files = new ArrayList<>(ControlServer.TV_FILES);
        files.addAll(ControlServer.PHONE_FILES);
        files.addAll(ControlServer.MENU_FILES);
        for (String f : files) assertTrue(f + " is missing from the assets", inApp(f.substring(1)));
        for (String f : ControlServer.ASSETS.values()) assertTrue(f + " is missing from the assets", inApp(f));
    }

    @Test
    public void theTvPageAsksOnlyForWhatTheBoxHandsIt() throws IOException {
        List<String> asked = pageAsksFor(AppAssets.TV_PAGE, "/tv/index.html", ControlServer.TV_FILES);
        for (String p : asked) assertTrue("the TV page asks for " + p + ", which nothing hands out", tvServes(p));
        for (String f : ControlServer.TV_FILES) assertTrue("the TV page doesn't use " + f, asked.contains(f));
    }

    @Test
    public void thePhonePageAsksOnlyForWhatItsServerHandsOut() throws Exception {      // Android's JSONException is checked
        List<String> asked = pageAsksFor(AppAssets.PHONE_PAGE, "/", ControlServer.PHONE_FILES);
        JSONArray icons = new JSONObject(read("home-screen/manifest.webmanifest")).getJSONArray("icons");
        for (int i = 0; i < icons.length(); i++) asked.add(URI.create("http://tv/").resolve(icons.getJSONObject(i).getString("src")).getPath());
        for (String p : asked) assertTrue("the phone page asks for " + p + ", which nothing hands out", phoneServes(p));
        for (String f : ControlServer.PHONE_FILES) assertTrue("the phone page doesn't use " + f, asked.contains(f));
    }

    @Test
    public void theMenuAsksOnlyForWhatTheCustomersServerHandsOut() throws IOException {
        List<String> asked = pageAsksFor(AppAssets.MENU_PAGE, "/menu/", ControlServer.MENU_FILES);
        for (String p : asked) assertTrue("the menu asks for " + p + ", which the customers' server doesn't hand out", menuServes(p));
        for (String f : ControlServer.MENU_FILES) assertTrue("the menu doesn't use " + f, asked.contains(f));
    }

    @Test
    public void eachPageFolderHoldsOnlyWhatIsUsed() {
        onlyWhatIsUsed("tv", ControlServer.TV_FILES, AppAssets.TV_PAGE, AppAssets.TV_BRIDGE);
        onlyWhatIsUsed("phone", ControlServer.PHONE_FILES, AppAssets.PHONE_PAGE);
        onlyWhatIsUsed("menu", ControlServer.MENU_FILES, AppAssets.MENU_PAGE);
        for (String n : new File(ASSETS, "home-screen").list()) {
            assertTrue("assets/home-screen/" + n + " is in the app, but nothing uses it", ControlServer.ASSETS.containsValue("home-screen/" + n));
        }
    }

    @Test
    public void theLinkToTheAppGoesInBeforeTheTvPagesScripts() throws IOException {
        String page = new String(TvPage.withBridge(read(AppAssets.TV_PAGE).getBytes(StandardCharsets.UTF_8), "/* bridge */", "{\"k\":\"x\"}"),
                StandardCharsets.UTF_8);
        int bridge = page.indexOf("window.TWILIGHT_BOOT");
        assertTrue("the link to the app isn't in the TV page", bridge > 0);
        assertFalse("the TV page has a script before the link to the app", page.substring(0, bridge).contains("<script src"));
        assertTrue("the link to the app comes before the page's styles", bridge < page.indexOf("<link rel=\"stylesheet\""));
    }
}
