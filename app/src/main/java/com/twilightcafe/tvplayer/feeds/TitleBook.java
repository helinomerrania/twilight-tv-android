package com.twilightcafe.tvplayer.feeds;

import com.twilightcafe.tvplayer.util.Disk;
import com.twilightcafe.tvplayer.util.Net;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Song names, for the phone's song list and the TV's "Up next". The TV page only knows
 * YouTube's video IDs; YouTube's oEmbed address answers with a video's title and channel.
 * Each song is asked about once, one every couple of seconds, and kept in a file: a
 * playlist of 150 songs is known within about five minutes, and then for good.
 * Plain Java (and org.json), so it can be tested on a computer.
 */
public final class TitleBook {

    /** Fetches one address (the app uses the internet; tests use a stand-in). */
    public interface Fetcher {
        Net.Reply get(String url) throws IOException;
    }

    static final int MAX = 3000;                          // songs remembered; the oldest are forgotten first
    private static final long RETRY = 6 * 3600000L;       // a song YouTube wouldn't name: ask again after 6 hours
    private static final long SLOW_DOWN = 15 * 60000L;    // YouTube said "too many": wait 15 minutes

    private final File file;
    private final Fetcher fetcher;
    private final LinkedHashMap<String, String[]> known = new LinkedHashMap<>();   // id -> {title, channel}
    private final HashMap<String, Long> failed = new HashMap<>();                  // id -> when YouTube said no
    private final LinkedHashSet<String> wanted = new LinkedHashSet<>();
    private boolean running = false;
    private long quietUntil = 0;
    private volatile int version = 1;
    long pauseMillis = 1500;                              // between two questions
    volatile String status = "";

    public TitleBook(File file, Fetcher fetcher) {
        this.file = file;
        this.fetcher = fetcher;
        load();
    }

    /** A YouTube video ID: 11 letters, digits, - or _ */
    public static boolean isId(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{11}");
    }

    public int version() {
        return version;
    }

    /** The page's songs: names are fetched for the ones not known yet. */
    public synchronized void want(Collection<String> ids) {
        long now = System.currentTimeMillis();
        for (String id : ids) {
            if (!isId(id) || known.containsKey(id)) continue;
            Long no = failed.get(id);
            if (no != null && now - no < RETRY) continue;
            wanted.add(id);
        }
        start();
    }

    /** Carries on after an internet cut or a "too many" (the app calls this now and then). */
    public synchronized void start() {
        if (running || wanted.isEmpty() || System.currentTimeMillis() < quietUntil) return;
        running = true;
        Thread t = new Thread(this::work, "song-names");
        t.setDaemon(true);
        t.start();
    }

    synchronized boolean busy() {
        return running;
    }

    private void work() {
        boolean changed = false;
        try {
            while (true) {
                String id;
                synchronized (this) {
                    Iterator<String> it = wanted.iterator();
                    if (!it.hasNext()) break;
                    id = it.next();
                    it.remove();
                }
                Net.Reply r;
                try {
                    r = fetcher.get("https://www.youtube.com/oembed?format=json&url="
                            + URLEncoder.encode("https://www.youtube.com/watch?v=" + id, "UTF-8"));
                } catch (IOException e) {
                    synchronized (this) {
                        wanted.add(id);                       // no internet: again later
                        status = "couldn't reach YouTube for song names (" + e.getClass().getSimpleName() + ")";
                    }
                    break;
                }
                synchronized (this) {
                    if (r.code == 200 && r.body != null) {
                        try {
                            JSONObject o = new JSONObject(r.body);
                            known.remove(id);
                            known.put(id, new String[] { o.optString("title", ""), o.optString("author_name", "") });
                            failed.remove(id);
                            while (known.size() > MAX) {
                                Iterator<String> old = known.keySet().iterator();
                                old.next();
                                old.remove();
                            }
                            version++;
                            changed = true;
                        } catch (JSONException e) {
                            failed.put(id, System.currentTimeMillis());
                        }
                    } else if (r.code == 429) {
                        wanted.add(id);
                        quietUntil = System.currentTimeMillis() + SLOW_DOWN;
                        status = "YouTube asked to slow down; song names carry on in 15 minutes";
                        break;
                    } else if (r.code >= 500) {
                        wanted.add(id);                       // YouTube's own trouble: again later
                        quietUntil = System.currentTimeMillis() + SLOW_DOWN;
                        status = "YouTube has trouble; song names carry on in 15 minutes";
                        break;
                    } else {
                        failed.put(id, System.currentTimeMillis());   // private, removed, or not shown on other sites
                    }
                }
                if (pauseMillis > 0) {
                    try {
                        Thread.sleep(pauseMillis);
                    } catch (InterruptedException e) {
                        break;
                    }
                }
            }
        } finally {
            synchronized (this) {
                running = false;
                if (changed) save();
            }
        }
    }

    /** {id: [title, channel]} for these songs (the ones known). */
    public synchronized JSONObject forPage(Collection<String> ids) {
        JSONObject o = new JSONObject();
        for (String id : ids) {
            String[] t = known.get(id);
            if (t == null) continue;
            try {
                o.put(id, new JSONArray().put(t[0]).put(t[1]));
            } catch (JSONException e) {
                // skip it
            }
        }
        return o;
    }

    /** For the phone's song list: [{id, title, channel}] in this order. */
    public synchronized JSONArray list(List<String> ids) {
        JSONArray a = new JSONArray();
        for (String id : ids) {
            String[] t = known.get(id);
            try {
                a.put(new JSONObject().put("id", id).put("title", t == null ? "" : t[0]).put("channel", t == null ? "" : t[1]));
            } catch (JSONException e) {
                // skip it
            }
        }
        return a;
    }

    synchronized String title(String id) {
        String[] t = known.get(id);
        return t == null ? null : t[0];
    }

    /** "names known for 120 of 138 songs" */
    public synchronized String describe(Collection<String> ids) {
        int n = 0;
        for (String id : ids) if (known.containsKey(id)) n++;
        String s = "names known for " + n + " of " + ids.size() + " songs";
        if (running) s += ", asking YouTube for the rest";
        else if (!status.isEmpty() && n < ids.size()) s += " (" + status + ")";
        return s;
    }

    private void load() {
        if (file == null || !file.exists()) return;
        try {
            JSONObject o = new JSONObject(Disk.readText(file));
            JSONObject t = o.optJSONObject("titles");
            if (t != null) {
                for (Iterator<String> it = t.keys(); it.hasNext(); ) {
                    String id = it.next();
                    JSONArray v = t.optJSONArray(id);
                    if (isId(id) && v != null) known.put(id, new String[] { v.optString(0, ""), v.optString(1, "") });
                }
            }
            JSONObject f = o.optJSONObject("failed");
            if (f != null) {
                for (Iterator<String> it = f.keys(); it.hasNext(); ) {
                    String id = it.next();
                    if (isId(id)) failed.put(id, f.optLong(id, 0));
                }
            }
        } catch (IOException | JSONException e) {
            // start again
        }
    }

    // Written whole, then put in place, so a power cut never leaves half a file
    private void save() {
        if (file == null) return;
        try {
            JSONObject t = new JSONObject();
            for (Map.Entry<String, String[]> e : known.entrySet()) t.put(e.getKey(), new JSONArray(e.getValue()));
            JSONObject f = new JSONObject();
            for (Map.Entry<String, Long> e : failed.entrySet()) f.put(e.getKey(), e.getValue().longValue());
            Disk.write(file, new JSONObject().put("titles", t).put("failed", f).toString());
        } catch (IOException | JSONException e) {
            // kept in memory; saved next time
        }
    }


    /** The IDs from a JSON array (anything else is left out). */
    public static List<String> ids(JSONArray a) {
        List<String> out = new ArrayList<>();
        for (int i = 0; a != null && i < a.length(); i++) {
            String id = a.optString(i, "");
            if (isId(id) && !out.contains(id)) out.add(id);
        }
        return out;
    }
}
