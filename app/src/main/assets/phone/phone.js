(function () {
  "use strict";
  var KEY = "twilight-tv-pin", pin = "", timer = null, busy = false, view = "control", page = "", last = null, drawnLists = {};
  try { pin = localStorage.getItem(KEY) || ""; } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  var PRAYER_NAMES = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

  function mmss(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2); }
  function clock(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  // "Today, 21:14", "Yesterday, 05:00", "17 Oct, 05:00"
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayClock(ms) {
    var d = new Date(ms), now = new Date(), y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    var day = d.toDateString() === now.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.getDate() + " " + MONTHS[d.getMonth()];
    return day + ", " + clock(ms);
  }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  // A short confirmation at the bottom of the screen
  var sayTimer = null;
  function say(text) {
    $("say").textContent = text;
    $("say").hidden = false;
    clearTimeout(sayTimer);
    sayTimer = setTimeout(function () { $("say").hidden = true; }, Math.min(8000, 2500 + String(text).length * 40));
  }

  function askPin(msg) {
    clearTimeout(timer);
    $("pin").hidden = false;
    $("pinErr").textContent = msg || "";
    $("pinInput").value = "";
    setTimeout(function () { $("pinInput").focus(); }, 50);
  }

  $("pinForm").addEventListener("submit", function (e) {
    e.preventDefault();
    pin = $("pinInput").value.replace(/\D/g, "");
    try { localStorage.setItem(KEY, pin); } catch (err) {}
    $("pin").hidden = true;
    poll();
    if (view === "screen" || view === "settings") loadSettings();
    if (view === "menu") loadMenu();
    if (view === "songs") loadSongs();
  });

  // A request to the TV. waitMs: how long to wait for its answer before giving up (a box that hangs, Wi-Fi that drops
  // everything), else as long as it takes
  function api(path, method, body, waitMs) {
    var sep = path.indexOf("?") < 0 ? "?" : "&";
    var opts = { method: method || "GET", cache: "no-store" }, stop = null, wait = null;
    if (body != null) { opts.body = JSON.stringify(body); opts.headers = { "Content-Type": "application/json" }; }
    if (waitMs && window.AbortController) {
      stop = new AbortController();
      opts.signal = stop.signal;
      wait = setTimeout(function () { stop.abort(); }, waitMs);
    }
    var done = function () { clearTimeout(wait); };
    return fetch(path + sep + "pin=" + encodeURIComponent(pin), opts)
      .then(function (r) {
        if (r.status === 401) { try { localStorage.removeItem(KEY); } catch (e) {} askPin(pin ? "That PIN didn't work. Try again." : ""); throw new Error("pin"); }
        if (r.status === 429) {   // this phone's wrong PINs, or someone guessing: the TV says which
          return r.json().catch(function () { return {}; }).then(function (m) {
            askPin(m.message || "Too many wrong PINs. Wait 10 minutes, then try again.");
            throw new Error("locked");
          });
        }
        return r.json();
      })
      .then(function (v) { done(); return v; }, function (e) { done(); throw e; });
  }

  /* ---------- Control ---------- */

  // What the TV is doing, every 2 seconds. No answer in 8 seconds counts as out of reach.
  function poll() {
    clearTimeout(timer);
    if (!pin) return askPin("");
    api("/api/status", null, null, 8000).then(function (s) {
      $("offline").hidden = true;
      last = s;
      schedule();
      render(s);                     // (a mistake in drawing it isn't the TV out of reach: it shows as a script error)
    }, function (e) {
      if (e.message === "pin" || e.message === "locked") return;
      $("offline").hidden = false;
      schedule();
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (document.visibilityState !== "hidden") timer = setTimeout(poll, 2000);
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") poll(); });

  // A song's name for the lists (songs from a link may not have one yet)
  function songName(x) { return x && x.title ? x.title : "YouTube video " + (x ? x.id : ""); }

  // What the music is doing, in a word or two, for the label over the song
  function stateWord(s, p) {
    if (!s.onScreen) return ["Not on screen", "off"];
    if (!p) return ["Starting", ""];
    var st = p.state;
    if (st === "closed") return ["Closed", "off"];
    if (st === "prayer") return ["Call to prayer", ""];
    if (p.holdUntil || st === "paused") return ["Paused", ""];
    if (st === "playing") return [p.quietUntil ? "Playing quietly" : "Playing", "live"];
    if (st === "ended" || st === "loading" || st === "starting" || st === "ready") return ["Loading", ""];
    return [st.charAt(0).toUpperCase() + st.slice(1), ""];
  }

  // The song's own picture from YouTube: beside its name, and glowing behind it. None (no internet): just the name.
  var thumbFor = null;
  function drawThumb(id) {
    id = /^[\w-]{11}$/.test(id || "") ? id : "";
    if (id === thumbFor) return;
    thumbFor = id;
    ["nowThumb", "nowGlow"].forEach(function (k) {
      var img = $(k);
      img.hidden = true;
      img.onload = function () { if (thumbFor === id) img.hidden = false; };
      img.onerror = function () { img.hidden = true; };
      if (id) img.src = "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg";
      else img.removeAttribute("src");
    });
  }

  // Rows of [what, value] as a list of facts; rows with no value are left out. Says how many it shows.
  function factList(id, rows) {
    rows = rows.filter(function (r) { return r[1] != null && String(r[1]) !== ""; });
    list(id, rows, function (r) {
      var d = el("div");
      d.appendChild(el("dt", {}, r[0]));
      d.appendChild(el("dd", { dir: "auto" }, upper(r[1])));
      return d;
    });
    return rows.length;
  }

  // A value on its own starts with a capital ("from MET Norway" -> "From MET Norway"), except a file's name (settings.json)
  function upper(v) {
    v = String(v);
    return /^[a-z]/.test(v) && !/^\S+\.[a-z]/.test(v) ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  }

  // In the diary, what went wrong: the box or the app starting again by itself, a crash, the page stuck
  var TROUBLE = /by itself|without warning|crashed|to free memory|stopped answering/i;

  // The Status page: what each part of the TV says, in groups
  var FACT_GROUPS = [["music", "Music"], ["day", "Today"], ["net", "From the internet"], ["box", "This TV box"]];
  function drawFacts(groups) {
    var box = $("facts");
    if (!box.firstChild) {
      FACT_GROUPS.forEach(function (g) {
        var wrap = el("div", { id: "factsBox-" + g[0] });
        wrap.appendChild(el("h2", { class: "group" }, g[1]));
        wrap.appendChild(el("section", { class: "card" })).appendChild(el("dl", { class: "facts", id: "facts-" + g[0] }));
        box.appendChild(wrap);
      });
    }
    FACT_GROUPS.forEach(function (g) { $("factsBox-" + g[0]).hidden = !factList("facts-" + g[0], groups[g[0]] || []); });
  }

  var diaryAll = false;
  $("diaryMore").addEventListener("click", function () { diaryAll = !diaryAll; if (last) render(last); });

  function render(s) {
    var p = s.page || null;
    $("notOn").hidden = !!s.onScreen;
    drawLock(s);
    if (p && p.name) $("cafe").textContent = p.name;
    document.title = "Twilight TV (" + (s.tv || "TV") + ")";

    // With one TV box, the parts about other TVs stay hidden
    others = (s.others || []).map(function (o) { return o.name; });
    var nav = $("tvs"); nav.innerHTML = "";
    nav.hidden = !others.length;
    if (others.length) {
      nav.appendChild(el("span", {}, s.tv || "This TV"));
      (s.others || []).forEach(function (o) { nav.appendChild(el("a", { href: o.url }, o.name)); });
    }
    $("identify").hidden = !others.length;
    updateAllBox();

    // Now playing
    var song = p && p.song;
    $("song").textContent = song ? (song.title || "Song " + song.id) : (s.onScreen ? "Starting…" : "–");
    drawThumb(song && s.onScreen ? song.id : "");
    var pos = song ? song.position : 0, dur = song ? song.duration : 0;
    $("progress").style.width = dur > 0 ? Math.min(100, pos / dur * 100) + "%" : "0";
    $("pos").textContent = mmss(pos);
    $("dur").textContent = mmss(dur);
    var word = stateWord(s, p);
    $("statePill").textContent = word[0];
    $("statePill").className = "pill" + (word[1] ? " " + word[1] : "");
    $("heroNote").textContent = p && p.quality && s.onScreen ? p.quality : "";

    // In a sentence: only what's out of the ordinary
    var st = p ? p.state : "", text = "", off = false, resumeIt = false, closed = false, more = [];
    if (!p) text = "";
    else if (st === "closed") { closed = off = true; text = "Music off: outside opening hours (" + p.openHours + ")."; }
    else if (st === "prayer") { resumeIt = off = true; text = "Paused for the call to prayer (" + (PRAYER_NAMES[p.prayerName] || "prayer") + "). The music comes back at " + clock(p.prayerUntil) + "."; }
    else if (p.holdUntil) { resumeIt = off = true; text = "Paused from a phone. It starts again by itself at " + clock(p.holdUntil) + "."; }
    else if (st === "playing" && p.scheduleVolume < 100) text = "Volume schedule: " + p.scheduleVolume + "% of the normal volume now.";
    if (p && p.closingIn && !off) more.push("Fading out: closing in " + p.closingIn + " min.");
    if (p && p.quietUntil && !off) more.push("Quiet until " + clock(p.quietUntil) + ".");
    $("state").textContent = [text].concat(more).filter(Boolean).join(" ");
    $("state").className = "state" + (off ? " off" : "");

    var nx = p && !off ? p.upNext : null;
    $("upNext").hidden = !nx;
    if (nx) {
      $("upNext").innerHTML = "";
      $("upNext").appendChild(document.createTextNode(nx.asked ? "Next, as asked: " : "Up next: "));
      $("upNext").appendChild(el("b", { dir: "auto" }, songName(nx)));
    }

    $("pauseText").textContent = closed ? "Play anyway" : resumeIt ? "Resume music" : "Pause music";
    $("pauseIcon").setAttribute("d", closed || resumeIt ? "M7 4.5v15l12-7.5z" : "M7 5h3.5v14H7zm6.5 0H17v14h-3.5z");
    $("pause").dataset.cmd = closed || resumeIt ? "resume" : "pause";
    $("next").disabled = closed || st === "prayer";

    var quietOn = !!(p && p.quietUntil);
    $("quiet").className = "wide quiet" + (quietOn ? " on" : "");
    $("quiet").dataset.cmd = quietOn ? "quiet:0" : "quiet:60";
    $("quietText").textContent = quietOn ? "Back to normal volume (quiet until " + clock(p.quietUntil) + ")" : "Quiet for a minute";
    $("quiet").disabled = !p || off;

    $("vol").textContent = p ? p.volume + "%" : "–";
    $("zoom").textContent = p ? p.zoom + "%" : "–";
    var fixed = s.tvVolumeFixed || s.tvVolumeMax == null;
    $("tvRow").hidden = !!fixed;
    if (!fixed) $("tvvol").textContent = s.tvVolume + "/" + s.tvVolumeMax;
    $("tvvolNote").textContent = s.tvVolumeSet > 0 ? "The box's own, until the next song" : "The box's own volume";

    // Today, at a glance: the next call to prayer, the opening hours, this round of the playlist
    var today = [];
    if (p) {
      var coming = (p.prayers || []).filter(function (x) { return x.at > Date.now(); })[0];
      if (p.prayerPause > 0 && (p.prayers || []).length) {
        today.push(["Call to prayer", coming ? (PRAYER_NAMES[coming.name] || coming.name) + " at " + clock(coming.at) : "No more today"]);
      }
      today.push(["Opening hours", p.openHours || "Always on"]);
      if (p.round && p.round.total) today.push(["This round", p.round.done + " of " + p.round.total + " songs"]);
    }
    $("todayBox").hidden = !factList("today", today);

    $("qualityNow").textContent = s.qualitySetup ? "Quality setup is on the TV" : p && p.quality ? p.quality : "Not reported by YouTube yet";
    $("qualityIdle").hidden = !!s.qualitySetup;
    $("qualityOn").hidden = !s.qualitySetup;

    $("update").hidden = !s.updateReady;
    if (s.updateReady) $("updateTitle").textContent = "Version 1." + s.updateReady + " is ready";
    $("notice").hidden = !s.notice;
    $("notice").textContent = s.notice || "";

    // Songs asked for on the phone, and the last songs played
    list("askedList", (p && p.asked) || [], function (x) {
      return songRow(x, [["×", "unnext:" + x.id, "x", "Take off the list"]]);
    });
    $("askedCard").hidden = !(p && p.asked && p.asked.length);
    list("historyList", (p && p.history) || [], function (x) {
      return songRow(x, [["Again", "playnext:" + x.id, "", "Play it again next"]], clock(x.t));
    });
    $("historyCard").hidden = !(p && p.history && p.history.length);

    var probs = (p && p.problems) || [];
    $("problems").hidden = !probs.length;
    $("problemsTitle").textContent = probs.length === 1 ? "1 song won't play" : probs.length + " songs won't play";
    list("problemList", probs.slice(0, 30), function (x) {
      var li = el("li");
      li.appendChild(el("b", { dir: "auto" }, x.title || x.id));
      li.appendChild(el("span", {}, x.what + (x.count > 1 ? ", " + x.count + " times" : "") + ". "));
      li.appendChild(el("a", { href: "https://www.youtube.com/watch?v=" + encodeURIComponent(x.id), target: "_blank", rel: "noopener" }, "Open on YouTube"));
      return li;
    });

    // What happened to the TV box: restarts and the like, newest first (the app keeps the diary)
    var diary = (s.diary || []).filter(function (x) { return x && x.what; });
    list("diaryList", diaryAll ? diary : diary.slice(0, 5), function (x) {
      var li = el("li", TROUBLE.test(x.what) ? { class: "trouble" } : {});
      li.appendChild(el("span", {}, dayClock(x.t)));
      li.appendChild(el("div", {}, x.what));
      return li;
    });
    $("diaryCard").hidden = !diary.length;
    $("diaryMore").hidden = diary.length <= 5;
    $("diaryMore").textContent = diaryAll ? "Show fewer" : "Show all " + diary.length;
    var trouble = diary.filter(function (x) { return TROUBLE.test(x.what) && Date.now() - x.t < 7 * 864e5; })[0];
    $("statusSummary").textContent = "Version " + (s.build || "?") + (trouble ? ". Last problem: " + dayClock(trouble.t) : "");
    $("statusSummary").className = trouble ? "warn" : "";

    var bx = s.box || {};
    drawFacts({
      music: [
        ["Playlist", p ? p.songs + " songs, " + p.round.done + " of " + p.round.total + " played this round" : ""],
        ["Song names", s.names],
        ["Ads skipped", p ? p.adsSkipped : ""],
        ["Sound", p && p.soundFixes ? "YouTube's player changed the volume by itself " + (p.soundFixes === 1 ? "once" : p.soundFixes + " times") +
          ", last at " + clock(p.soundFixAt) + ". The TV set it back at once each time." : ""],
        ["Sound levelling", s.levelling]
      ],
      day: [
        ["Opening hours", p ? p.openHours || "Always on" : ""],
        ["Call to prayer", p && p.prayers && p.prayers.length ? p.prayers.map(function (x) { return PRAYER_NAMES[x.name] + " " + clock(x.at); }).join(", ") +
          (p.prayersFrom ? ", " + p.prayersFrom + "'s times" : ", worked out on the TV") + ". The music pauses " + p.prayerPause + " min, in opening hours." : ""],
        ["Hijri date", p ? (p.hijriFrom ? p.hijriFrom + "'s, from the same page" : "worked out on the TV (Umm al-Qura calendar)") : ""]
      ],
      net: [
        ["Settings", s.settings],
        ["Weather", s.weather],
        ["Gold and currency prices", s.prices],
        ["Prayer times", s.prayerTimes],
        ["Updates", s.updateStatus]
      ],
      box: [
        ["TV box", bx.box],
        ["Graphics", bx.graphics ? bx.graphics + (bx.softDraw ? ". Too old for Firefox's engine: it draws everything on the processor, so videos play at 720p" : "") : ""],
        ["The chip decodes", bx.decoders],
        ["Screen", s.screen],
        ["Video from YouTube", s.videoFormat ? s.videoFormat + (s.videoFormatNext ? " (" + s.videoFormatNext + " once the app restarts)" : "") : ""],
        ["Web engine", s.engine],
        ["App version", s.build || "?"]
      ]
    });

    refreshPrayerTimes();
  }

  // A list drawn again only when what's in it changed (so a button isn't replaced under a finger)
  function list(id, items, row) {
    var key = JSON.stringify(items);
    if (drawnLists[id] === key) return;
    drawnLists[id] = key;
    var ul = $(id);
    ul.innerHTML = "";
    items.forEach(function (x) { ul.appendChild(row(x)); });
  }

  // One song: its name (and channel, or time) with buttons: [text, command, style, label for screen readers]
  function songRow(x, buttons, sub) {
    var li = el("li"), t = el("div", { class: "t" });
    t.appendChild(el("b", { dir: "auto" }, songName(x)));
    if (sub || x.channel) t.appendChild(el("span", { dir: "auto" }, sub || x.channel));
    li.appendChild(t);
    buttons.forEach(function (b) {
      var btn = el("button", { type: "button", class: "mini" + (b[2] ? " " + b[2] : ""), "data-cmd": b[1], "data-name": songName(x), "aria-label": b[3] || b[0] }, b[0]);
      li.appendChild(btn);
    });
    if (buttons.length === 1) li.style.gridTemplateColumns = "1fr auto";
    return li;
  }

  // The box kept in Twilight TV: the other app's button, the way back, and the state in Tools
  function drawLock(s) {
    var k = s.lock || {}, other = k.other || "", unlocked = k.unlockedUntil > 0;
    $("otherApp").hidden = !other || !s.onScreen;
    $("otherApp").textContent = "Open " + (other || "the other app");
    $("backHome").hidden = !!s.onScreen;
    $("notOnText").textContent = k.otherOpen ? other + " is on the TV. Press Home on the remote, or the button below, to bring the music back." :
      unlocked ? "The box is unlocked until " + clock(k.unlockedUntil) + ". Twilight TV isn't on screen." :
      k.on && k.canReturn ? "Twilight TV isn't on screen. It comes back by itself within 10 seconds." :
      "The Twilight TV app isn't on screen on this TV. Open it with the TV remote, or press the button below.";
    var m = $("lockMsg");
    if (!m) return;
    $("unlockBox").hidden = !k.on || unlocked;
    $("lockBox").hidden = !k.on || !unlocked;
    m.textContent = !k.on ? "The box isn't kept in Twilight TV (Settings, This TV box)." :
      (unlocked ? "Unlocked until " + clock(k.unlockedUntil) + ". " : "Locked: only Twilight TV and " + (other || "no other app") + ". ") +
      (other ? "" : "“" + (k.otherWanted || "") + "” isn't on the box. ") +
      (k.canReturn ? "" : "Switch on “Display over other apps” for Twilight TV on the box, or it can't come back by itself. ") +
      (k.sees ? "" : "With “Usage access” for Twilight TV switched on at the box, it also comes back when " + (other || "the other app") + " is closed with Back.");
  }

  function cmd(what, button) {
    if (!what || busy) return;
    busy = true;
    if (button) button.disabled = true;
    api("/api/cmd?do=" + encodeURIComponent(what), "POST").then(function (r) {
      var name = button && button.getAttribute("data-name");
      if (!r.ok) { if (/^play/.test(what)) say("The TV couldn't take that song right now."); return; }
      if (/^playnext:/.test(what)) say("Comes next: " + (name || "your song"));
      else if (/^playnow:/.test(what)) say("Playing now: " + (name || "your song"));
      else if (/^look:/.test(what)) say("Look at the TV: 20 seconds of that day's picture.");
      else if (what === "unfreeze") say("Done: the song goes on from the same moment, with the picture moving.");
      else if (what === "otherapp") say("Look at the TV: " + ((last && last.lock && last.lock.other) || "the other app") + ". Press Home on the remote to come back.");
      else if (what === "backhome") say("Twilight TV is coming back on the TV.");
    }).catch(function () {}).then(function () {
      busy = false;
      if (button) button.disabled = false;
      setTimeout(poll, /^(next|playnow)/.test(what) ? 1200 : 300);
    });
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-cmd]") : null;
    if (b) cmd(b.dataset.cmd, b);
  });

  /* ---------- Choosing a song ---------- */

  var songs = null, songsAt = 0, songsBusy = false;

  function loadSongs() {
    if (songsBusy || (songs && Date.now() - songsAt < 5 * 60e3)) return;
    songsBusy = true;
    api("/api/songs").then(function (r) {
      songs = r.songs || [];
      songsAt = Date.now();
      $("songsInfo").textContent = songs.length ? songs.length + " songs: " + (r.names || "") + "." : "The TV is still reading the playlist.";
      showResults();
    }).catch(function () {
      $("songsInfo").textContent = "Couldn't get the song list. Check the Wi-Fi and try again.";
    }).then(function () { songsBusy = false; });
  }

  function plain(s) {
    s = String(s || "").toLowerCase();
    return s.normalize ? s.normalize("NFKD").replace(/[̀-ͯ]/g, "") : s;
  }

  function showResults() {
    var q = plain($("search").value.trim()), ul = $("results");
    ul.innerHTML = "";
    if (!q || !songs) return;
    var words = q.split(/\s+/);
    var hits = songs.filter(function (s) {
      var t = plain(s.title + " " + s.channel + " " + s.id);
      return words.every(function (w) { return t.indexOf(w) >= 0; });
    });
    hits.slice(0, 40).forEach(function (s) {
      ul.appendChild(songRow(s, [["Next", "playnext:" + s.id, "", "Play next"], ["Now", "playnow:" + s.id, "go", "Play now"]]));
    });
    if (!hits.length) ul.appendChild(el("li", { class: "empty" }, "No song matches. Songs whose names aren't known yet can be found by their link below."));
    else if (hits.length > 40) ul.appendChild(el("li", { class: "empty" }, (hits.length - 40) + " more: type a little more of the name."));
  }

  $("search").addEventListener("focus", loadSongs);
  $("search").addEventListener("input", function () { loadSongs(); showResults(); });

  // A YouTube link (watch?v=, youtu.be/, shorts/, live/, embed/) or a bare video ID -> the ID
  function videoId(s) {
    s = String(s || "").trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/|\/v\/)([\w-]{11})(?![\w-])/.exec(s);
    return m ? m[1] : null;
  }

  function playLink(kind, button) {
    var id = videoId($("link").value);
    $("linkErr").hidden = !!id;
    if (!id) { $("linkErr").textContent = "That isn't a YouTube video link. Copy it from YouTube's Share button."; return; }
    button.setAttribute("data-name", "the song from the link");
    cmd(kind + ":" + id, button);
    $("link").value = "";
  }
  $("linkNext").addEventListener("click", function () { playLink("playnext", $("linkNext")); });
  $("linkNow").addEventListener("click", function () { playLink("playnow", $("linkNow")); });
  $("link").addEventListener("input", function () { $("linkErr").hidden = true; });

  /* ---------- Tabs, and the pages of the Settings tab ---------- */

  var TABS = ["control", "songs", "screen", "menu", "settings"];
  var PAGES = { music: "Music", hours: "Hours and volume", prayer: "Call to prayer", picture: "Picture", services: "Weather and prices",
                box: "This TV box", status: "Status and diary", tools: "Tools" };
  function tabOf(t) { return $("tab" + t.charAt(0).toUpperCase() + t.slice(1)); }

  function show(which) {
    if (view === "settings" && which !== "settings") closePage();
    view = which;
    TABS.forEach(function (t) {
      $(t + "View").hidden = t !== which;
      tabOf(t).setAttribute("aria-selected", String(t === which));
    });
    window.scrollTo(0, 0);
    if ((which === "screen" || which === "settings") && !data) loadSettings();
    if (which === "screen") { loadPictures(); loadLooks(); }
    if (which === "menu") loadMenu();
    if (which === "songs") loadSongs();
    updateSavebar();
  }
  TABS.forEach(function (t) {
    tabOf(t).addEventListener("click", function () {
      if (t === "settings" && view === "settings" && page) closePage();     // Settings again, on a page: back to the list
      else show(t);
    });
  });

  // A page of settings, in place of the list. The arrow at its top, or the phone's own Back, goes back to the list.
  // restored: coming back to this phone page from another (the history has its place already)
  function openPage(name, restored) {
    if (!PAGES[name]) return;
    var was = page;
    page = name;
    $("setIndex").hidden = true;
    $("setPage").hidden = false;
    $("setTitle").textContent = PAGES[name];
    document.querySelectorAll("#form > .page").forEach(function (s) { s.hidden = s.getAttribute("data-page") !== name; });
    window.scrollTo(0, 0);
    try { $("setTitle").focus({ preventScroll: true }); } catch (e) {}   // (the button that opened it is gone)
    if (restored) return;
    try {
      if (was) history.replaceState({ page: name }, "");
      else history.pushState({ page: name }, "");
    } catch (e) {}
  }

  function hidePage() {
    var left = page;
    page = "";
    $("setIndex").hidden = false;
    $("setPage").hidden = true;
    var row = document.querySelector('.navrow[data-page="' + left + '"]');
    if (row && view === "settings") try { row.focus({ preventScroll: true }); } catch (e) {}
  }

  function closePage() {
    if (!page) return;
    hidePage();
    window.scrollTo(0, 0);
    try { if (history.state && history.state.page) history.back(); } catch (e) {}
  }

  document.querySelectorAll(".navrow").forEach(function (b) {
    b.addEventListener("click", function () { openPage(b.getAttribute("data-page")); });
  });
  $("setBack").addEventListener("click", closePage);

  // The phone's Back button: closes the menu editor, or the settings page, before it leaves this page
  window.addEventListener("popstate", function () {
    var st = history.state || {};
    if (ed && !st.editor) closeEditor(true);
    if (page && !st.page) { hidePage(); window.scrollTo(0, 0); }
  });

  /* ---------- Settings (and the Screen tab, which is settings too) ---------- */

  // Built-in values, used when the TV hasn't reported its own yet
  var FALLBACK = {
    playlist: "", playlistSchedule: {}, apiKey: "", differentSinger: true, fadeIn: 2, fadeOut: 3,
    openHours: "", closingFade: 10, volume: 100, volumeSchedule: {}, quietLevel: 15, levelSound: true, tvVolume: 0,
    prayerPause: 5, prayerCity: "Ranya", prayerAdjust: {},
    quality: "auto", videoFormat: "h264", autoZoom: true, blockAds: true, noSubtitles: true, titleSeconds: 4, brandEnding: 10, screenSize: "1080", screenRate: "box",
    weatherKey: "", place: "Ranya", lat: 36.2549, lon: 44.8838, pricesUrl: "",
    tvName: "", controlPin: "", lockApps: true, otherApp: "My TV Plus", restartAt: "05:00", updates: true,
    messages: [], menuSlides: true, infoPanel: true, clock24: false, videoColors: true, numerals: "auto",
    priceItems: ["us", "eu", "gb", "tr", "ir", "gold21", "gold18"], wifiName: "", wifiPassword: "", specialDays: true, hijriAdjust: 0, brandName: "", labels: {}
  };

  // Settings no longer on the phone: they keep their built-in values, and settings.json can still set them for every TV.
  // A value this TV kept for one of them goes with its next save.
  var RETIRED = ["refreshHours", "engineNumbers", "cutEnding", "kurdishNewYear", "menuUrl", "noRepeat"];

  // Every setting on the phone, page by page ("screen" is the Screen tab), in groups: { group, page } starts a card
  // under that heading ("" for a card with none)
  var FIELDS = [
    // The Screen tab
    { group: "Between songs", page: "screen" },
    { key: "messages", label: "Messages on the café screen", type: "list", page: "screen", add: "Add a message",
      hint: "One at a time between two songs, taking turns with your pictures. Short ones read best." },
    { key: "menuSlides", label: "Items from the menu between songs", type: "toggle", page: "screen",
      hint: "Each with its picture, name, description and price, after each of your messages and pictures. The weather picks which: no hot drinks on a hot day (28° and up), no ice cream or fresh juice on a cold one (15° and below). An item with “On the TV” off on the Menu tab never comes." },
    { pictures: true, page: "screen" },
    { group: "Beside the video", page: "screen" },
    { key: "infoPanel", label: "Info panel beside the video", type: "toggle", page: "screen",
      hint: "A frame around the video: the time, the weather, prices, what's playing and the QR codes. In Kurdish the whole screen is mirrored. Off = the video full screen." },
    { key: "clock24", label: "24-hour clock", type: "toggle", page: "screen" },
    { key: "videoColors", label: "Frame in each song's colour", type: "toggle", page: "screen",
      hint: "A soft glow around the video, and the room and the progress line, in the song's main colour, taken from YouTube's pictures of it. It changes with a slow fade at each new song. Off = the same dark frame always." },
    { key: "numerals", label: "Numbers on the TV", type: "select", page: "screen",
      options: [["auto", "In the language's own digits"], ["kurdish", "Always Kurdish digits: ١٢٣"], ["latin", "Always 123"]],
      hint: "With Kurdish words, “own digits” are ١٢٣. Song names, the Wi-Fi password and your messages always stay as typed." },
    { group: "Gold and currency prices", page: "screen" },
    { key: "priceItems", label: "Prices along the bottom, in this order", type: "prices", page: "screen",
      hint: "Up to seven, in one row, centred. From Tirezh Index (tirezh.com); the TV box gets them every 5 minutes by itself. None = no prices." },
    { group: "Wi-Fi for customers", page: "screen" },
    { key: "wifiName", label: "Wi-Fi name", type: "text", page: "screen", hint: "Exactly as phones see it. A QR code that joins it appears beside the video, with the name and password." },
    { key: "wifiPassword", label: "Wi-Fi password", type: "text", page: "screen", hint: "Empty for a network with no password." },
    { cafeScreen: true, page: "screen" },
    { group: "Special days", page: "screen" },
    { key: "specialDays", label: "Special days' looks", type: "toggle", page: "screen",
      hint: "Newroz, Eid al-Fitr, Eid al-Adha, Barat Night and New Year get their own picture on the café screen, and a greeting under the date." },
    { looks: true, page: "screen" },
    { key: "hijriAdjust", label: "Move the Hijri date, Eid and Barat Night by", type: "number", min: -2, max: 2, step: 1, unit: " days", signed: true, page: "screen",
      hint: "The Hijri date comes from amozhgary.tv by itself (from the Umm al-Qura calendar when it can't be reached). Only if it's still a day early or late compared with Kurdistan's announcement." },
    { group: "Words on the TV", page: "screen" },
    { key: "brandName", label: "Café name under the video when no music plays", type: "text", rtl: true, page: "screen",
      hint: "The café screen itself is your pictures, with the name in them." },
    { key: "labels", label: "Every word the TV shows", type: "labels", page: "screen",
      hint: "Type this TV's own word for any of these, for example in Kurdish. Empty = the word in grey: settings.json's, or the English one." },

    // Music
    { group: "Playlist", page: "music" },
    { key: "playlist", label: "YouTube playlist", type: "text", page: "music",
      hint: "The playlist link, or just its ID. It must be Public or Unlisted. A new playlist starts with the next song." },
    { key: "playlistSchedule", label: "Playlists by time of day", type: "plsched", page: "music",
      hint: "From each time on, this playlist instead of the one above. Before the first time, the last one still holds." },
    { key: "apiKey", label: "YouTube Data API key", type: "text", page: "music", when: bigPlaylist,
      hint: "YouTube's player reads only the first 200 songs of a playlist; with a key from Google, the TV reads them all. Better here than in settings.json, which anyone can read." },
    { group: "From song to song", page: "music" },
    { key: "differentSinger", label: "Never two songs by the same singer in a row", type: "toggle", page: "music",
      hint: "The singer is read from the song's name (\"Singer - Song\") or its YouTube channel." },
    { key: "fadeIn", label: "Fade in", type: "number", min: 0, max: 10, step: 0.5, unit: "s", page: "music" },
    { key: "fadeOut", label: "Fade out", type: "number", min: 0, max: 10, step: 0.5, unit: "s", page: "music" },

    // Hours and volume
    { group: "", page: "hours" },
    { key: "openHours", label: "Opening hours", type: "text", placeholder: "10:00-02:00", check: "hours", page: "hours",
      hint: "Music only during these hours, the café screen otherwise. Empty means always on. Two periods: 10:00-14:00, 17:00-01:00" },
    { key: "closingFade", label: "Fade out before closing time", type: "number", min: 0, max: 30, step: 1, unit: " min", page: "hours",
      hint: "The music slowly fades over these last minutes of the opening hours. 0 = off." },
    { group: "Volume", page: "hours" },
    { key: "volume", label: "Normal volume", type: "range", min: 0, max: 100, step: 5, unit: "%", page: "hours" },
    { key: "volumeSchedule", label: "Volume by time of day", type: "schedule", page: "hours",
      hint: "From each time on, this percent of the normal volume. Before the first time, the last one still holds." },
    { key: "quietLevel", label: "Volume of “Quiet for a minute”", type: "range", min: 0, max: 50, step: 5, unit: "%", page: "hours" },
    { key: "levelSound", label: "Even out loud and quiet songs", type: "toggle", page: "hours" },
    { key: "tvVolume", label: "Box volume", type: "range", min: 0, max: 100, step: 5, unit: "%", page: "hours",
      hint: "The box's own volume, set again at every new song (whatever the remote did), at opening time and every night. 0 = leave it as it is." },

    // Call to prayer
    { group: "", page: "prayer" },
    { key: "prayerPause", label: "Pause the music for the call to prayer", type: "number", min: 0, max: 15, step: 1, unit: " min", page: "prayer",
      hint: "At each of the five prayers, during opening hours only. 0 = never." },
    { key: "prayerCity", label: "Prayer times from amozhgary.tv for", type: "text", placeholder: "Ranya", page: "prayer",
      hint: "The town as in its address on amozhgary.tv (Ranya for amozhgary.tv/bang/Ranya). The TV box takes the times from there every day. Empty = the TV works them out itself (Muslim World League)." },
    { key: "prayerAdjust", label: "Move a prayer time", type: "adjust", page: "prayer",
      hint: "To match your mosque: minutes later (+) or earlier (−). The times shown are today's." },

    // Picture
    { group: "Video", page: "picture" },
    { key: "quality", label: "Highest picture quality", type: "select", page: "picture",
      options: [["auto", "Automatic"], [2160, "4K"], [1440, "1440p"], [1080, "1080p"], [720, "720p"]],
      hint: "Automatic is 1080p, or 720p on a box with old graphics. Above 1080p needs the video format H.264 or VP9, a strong box and fast internet. Lower it if videos stop to load." },
    { key: "videoFormat", label: "Video format from YouTube", type: "select", page: "picture",
      options: [["h264", "H.264: the smoothest, up to 1080p"], ["vp9", "H.264 or VP9: up to 4K"], ["any", "Any, AV1 too (Firefox decides)"]],
      hint: "TV boxes' chips play H.264 and VP9 themselves. AV1 most boxes play on their processor, and it stutters. Changing this restarts the app on the TV." },
    { key: "autoZoom", label: "Zoom away black bars automatically", type: "toggle", page: "picture" },
    { group: "YouTube's ads and extras", page: "picture" },
    { key: "blockAds", label: "Cover and skip YouTube ads", type: "toggle", page: "picture" },
    { key: "noSubtitles", label: "Keep subtitles off", type: "toggle", page: "picture" },
    { key: "titleSeconds", label: "Café screen at the start of each song", type: "number", min: 0, max: 15, step: 1, unit: "s", page: "picture",
      hint: "Covers YouTube's title. The sound already plays." },
    { key: "brandEnding", label: "Café screen over the end of each song", type: "number", min: 0, max: 30, step: 1, unit: "s", page: "picture",
      hint: "Covers YouTube's end cards. 0 = off." },
    { group: "The TV screen", page: "picture" },
    { key: "screenSize", label: "Screen resolution", type: "select", page: "picture",
      options: [["1080", "Up to 1080p (recommended)"], ["720", "Up to 720p (for weak boxes)"], ["box", "The box's own setting"]],
      hint: "A box that draws at 4K works four times as hard for a picture you can't tell apart. The TV fills its screen either way." },
    { key: "screenRate", label: "Screen refresh rate", type: "select", page: "picture", options: [["box", "The box's own setting"], ["50", "50 Hz"], ["60", "60 Hz"]],
      hint: "Videos made at 25 frames a second (TV, and many music videos here) move evenly at 50 Hz, and 30 or 60 at 60 Hz. The wrong one makes movement jerk slightly." },

    // Weather and prices
    { group: "Weather", page: "services" },
    { key: "weatherKey", label: "WeatherAPI.com key", type: "text", placeholder: "none: MET Norway", page: "services",
      hint: "From a free account at weatherapi.com (no card). With a key the weather comes from WeatherAPI.com, whose “now” is measured; without one, from MET Norway. Keep it here, not in settings.json (that file is public)." },
    { key: "place", label: "Place, for the weather", type: "text", page: "services",
      hint: "Its name on the TV. The weather and the worked-out prayer times are for the latitude and longitude below." },
    { key: "lat", label: "Latitude", type: "decimal", page: "services" },
    { key: "lon", label: "Longitude", type: "decimal", page: "services" },
    { group: "Gold and currency prices", page: "services" },
    { key: "pricesUrl", label: "Where the prices come from", type: "text", placeholder: "https://tirezh.com/api/economy", page: "services",
      hint: "The tirezh worker at another address: its workers.dev address from Cloudflare, or a new domain (the TV adds /api/economy to a bare address). Empty = tirezh.com. Which prices the TV shows is on the Screen tab." },

    // This TV box
    { group: "", page: "box" },
    { key: "tvName", label: "Name of this TV", type: "text", only: true, withOthers: true, page: "box", hint: "Shown on the phone page, e.g. Garden. Empty means its number." },
    { key: "controlPin", label: "PIN for this page", type: "pin", check: "pin", page: "box", hint: "4 to 8 digits. Empty means this TV's own PIN (shown in test mode)." },
    { group: "Keeping the box in Twilight TV", page: "box" },
    { key: "lockApps", label: "Keep the box in Twilight TV", type: "toggle", page: "box",
      hint: "Whatever else is opened on the box is sent away after 10 seconds, except the app below. On the remote, hold Back for 2 seconds to open it, and press Home to come back at once. For the box's own settings, unlock it (Settings, Tools) or hold Back for 10 seconds." },
    { key: "otherApp", label: "The one other app allowed", type: "text", placeholder: "My TV Plus", page: "box",
      hint: "Its name as on the box (capitals and spaces don't matter), or its package." },
    { group: "Restart and updates", page: "box" },
    { key: "restartAt", label: "Fresh start every night at", type: "time", page: "box" },
    { key: "updates", label: "Download new versions by themselves", type: "toggle", page: "box" }
  ];

  // The YouTube key only matters for a playlist of 200 songs or more (YouTube's player reads 200 at most), or once there is one
  function bigPlaylist() { return !!String(value("apiKey") || "").trim() || !!(last && last.page && last.page.songs >= 200); }

  // The TV's words, if the TV hasn't reported them yet
  var WORDS = {
    locale: "en-GB", weekdays: "", months: "", hijriMonths: "", kurdishMonths: "", nowPlaying: "Now playing", upNext: "Up next", menu: "Menu", menuHint: "Scan for the menu",
    wifi: "Wi-Fi", wifiPassword: "Password", prices: "Gold and currency prices", bitcoin: "Bitcoin", pound: "Pound sterling",
    goldOunce: "Gold", silverOunce: "Silver", perOunce: "per ounce", am: "AM", pm: "PM",
    weatherCredit: "MET Norway", prayerNote: "The music resumes after the call to prayer", prayerBand: "Paused for the call to prayer",
    newroz: "Happy Newroz", eidFitr: "Eid Mubarak", eidAdha: "Eid Mubarak", barat: "Blessed Barat Night", newYear: "Happy New Year",
    clear: "Clear", fair: "Fair", partlycloudy: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", lightrain: "Light rain", rain: "Rain", heavyrain: "Heavy rain",
    sleet: "Sleet", snow: "Snow", thunder: "Thunderstorm"
  };
  var WORD_NOTES = {
    locale: "Language for dates, e.g. ckb (Kurdish). If the TV doesn't know it, the names below are used.",
    weekdays: "Weekday names, Sunday first, separated by commas",
    months: "Month names, January first, separated by commas",
    hijriMonths: "Hijri month names, Muharram first, separated by commas",
    kurdishMonths: "Kurdish calendar months, Xakelêwe (from Newroz) first, separated by commas. Empty = no Kurdish date",
    am: "Before noon (12-hour clock)", pm: "After noon (12-hour clock)", newYear: "New Year (the year is added after it)",
    goldOunce: "World gold price (per ounce)", silverOunce: "World silver price (per ounce)",
    pound: "The pound's name in the prices (empty in Kurdish: tirezh.com's name)",
    weatherCredit: "Under the weather from MET Norway: their condition for the free data is a credit where it's shown"
  };

  var data = null, local = {}, saved = {}, base = {}, others = [];

  // The same value, whatever order an object's keys are in
  function canon(v) {
    if (v instanceof Array) return v.map(canon);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).sort().forEach(function (k) { o[k] = canon(v[k]); });
      return o;
    }
    return v;
  }
  function same(a, b) { return JSON.stringify(canon(a)) === JSON.stringify(canon(b)); }
  function copy(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function value(key) { return key in local ? local[key] : base[key]; }
  function sourceOf(key) {
    if (key in local) return "this TV";
    if (data && data.file && key in data.file) return "settings.json";
    return "built-in";
  }
  function fieldOf(key) { return FIELDS.filter(function (f) { return f.key === key; })[0] || null; }
  function forms() { return [].slice.call(document.querySelectorAll("[data-form]")); }

  function updateAllBox() {
    $("allBox").hidden = !others.length;
    $("allText").textContent = "Also on the other TVs (" + others.join(", ") + ")";
  }

  function loadSettings() {
    if (!pin) return askPin("");
    if (!data) {
      forms().forEach(function (f) {
        f.innerHTML = "";
        f.appendChild(el("p", { class: "intro" }, "Loading the settings…"));
      });
    }
    api("/api/settings").then(function (d) {
      data = d;
      var defaults = d.defaults || {};
      base = {};
      FIELDS.forEach(function (f) {
        if (!f.key) return;
        var v = f.key in defaults ? defaults[f.key] : FALLBACK[f.key];
        if (d.file && f.key in d.file) v = d.file[f.key];
        base[f.key] = copy(v);
      });
      local = copy(d.local || {});
      RETIRED.forEach(function (k) { delete local[k]; });
      saved = copy(local);
      others = d.others || [];
      updateAllBox();
      buildForm();
    }).catch(function (e) {
      if (e.message === "pin" || e.message === "locked" || data) return;
      forms().forEach(function (f) {
        f.innerHTML = "";
        f.appendChild(el("p", { class: "intro" }, "Couldn't load the settings. Check the Wi-Fi and try again."));
      });
    });
  }

  // A change on the phone: kept as this TV's own unless it equals the shared value
  function setValue(key, v) {
    if (same(v, base[key])) delete local[key];
    else local[key] = v;
    var f = document.querySelector('.field[data-key="' + key + '"]');
    if (f) refreshSource(f, key);
    $("saveMsg").textContent = "";
    updateSavebar();
  }

  function refreshSource(f, key) {
    var src = f.querySelector(".src"), reset = f.querySelector(".reset");
    src.textContent = sourceOf(key);
    src.className = "src" + (key in local ? " mine" : "");
    reset.hidden = !(key in local);
  }

  // The settings changed on the phone and not saved yet
  function unsaved() {
    var keys = {}, out = [];
    Object.keys(local).concat(Object.keys(saved)).forEach(function (k) { keys[k] = true; });
    Object.keys(keys).forEach(function (k) { if (!same(local[k], saved[k])) out.push(k); });
    return out;
  }

  // The Save bar, while there are unsaved changes (on the Screen and Settings tabs); a dot on their tabs and pages
  function updateSavebar() {
    var keys = data ? unsaved() : [], where = {};
    keys.forEach(function (k) { var f = fieldOf(k); if (f) where[f.page] = true; });
    var on = keys.length > 0 && (view === "screen" || view === "settings");
    $("savebar").hidden = !on;
    document.body.classList.toggle("saving", on);
    $("changes").textContent = keys.length === 1 ? "1 unsaved change" : keys.length + " unsaved changes";
    tabOf("screen").classList.toggle("unsaved", !!where.screen);
    tabOf("settings").classList.toggle("unsaved", Object.keys(where).some(function (p) { return p !== "screen"; }));
    document.querySelectorAll(".navrow").forEach(function (b) { b.classList.toggle("unsaved", !!where[b.getAttribute("data-page")]); });
  }

  function buildForm() {
    var cards = {}, y = window.scrollY;
    forms().forEach(function (f) { f.innerHTML = ""; });
    FIELDS.forEach(function (f) {
      var form = document.querySelector('[data-form="' + f.page + '"]');
      if (!form) return;
      if (f.group != null) {
        if (f.group) form.appendChild(el("h2", { class: "group" }, f.group));
        cards[f.page] = form.appendChild(el("section", { class: "card" }));
        return;
      }
      if (f.pictures || f.cafeScreen) {          // pictures: saved at once, not with the button
        form.appendChild(el("h2", { class: "group" }, f.pictures ? "Pictures between songs" : "Café screen pictures"));
        form.appendChild(f.pictures ? picturesCard() : cafeScreenCard());
        cards[f.page] = null;
        return;
      }
      if (f.looks) { cards[f.page].appendChild(looksField()); return; }
      if (f.withOthers && !others.length) return;   // only with more than one TV box
      if (f.when && !f.when()) return;
      cards[f.page].appendChild(buildField(f));
    });
    drawPictures();
    drawLooks();
    refreshPrayerTimes();
    updateSavebar();
    window.scrollTo(0, y);
  }

  function buildField(f) {
    var box = el("div", { class: "field", "data-key": f.key });
    var head = el("div", { class: "fhead" });
    var id = "f-" + f.key;
    head.appendChild(el("label", { for: id }, f.label));
    head.appendChild(el("span", { class: "src" }));
    box.appendChild(head);
    box.appendChild(control(f, id));
    box.appendChild(el("p", { class: "err", hidden: "" }));
    var reset = el("button", { type: "button", class: "reset" }, f.only ? "Clear" : "Use the shared value");
    reset.addEventListener("click", function () {
      delete local[f.key];
      box.parentNode.replaceChild(buildField(f), box);
      refreshPrayerTimes();
      updateSavebar();
    });
    box.appendChild(reset);
    if (f.hint) box.appendChild(el("p", { class: "hint" }, f.hint));
    refreshSource(box, f.key);
    return box;
  }

  function control(f, id) {
    var v = value(f.key), wrap;
    if (f.type === "text" || f.type === "pin") {
      var t = el("input", { id: id, type: f.type === "pin" ? "tel" : "text", autocomplete: "off", spellcheck: "false" });
      if (f.placeholder) t.placeholder = f.placeholder;
      if (f.type === "pin") { t.inputMode = "numeric"; t.maxLength = 8; t.placeholder = "own PIN"; }
      t.dir = "auto";
      t.value = v == null ? "" : String(v);
      t.addEventListener("input", function () { setValue(f.key, f.type === "pin" ? t.value.replace(/\D/g, "") : t.value); });
      return t;
    }
    if (f.type === "decimal") {
      var dc = el("input", { id: id, type: "text", inputmode: "decimal", autocomplete: "off" });
      dc.value = v == null ? "" : String(v);
      dc.addEventListener("input", function () {
        var n = Number(dc.value.replace(",", "."));
        setValue(f.key, dc.value.trim() !== "" && !isNaN(n) ? n : dc.value);
      });
      return dc;
    }
    if (f.type === "textarea") {
      var ta = el("textarea", { id: id, rows: 6, dir: "auto", spellcheck: "false" });
      if (f.placeholder) ta.placeholder = f.placeholder;
      ta.value = v == null ? "" : String(v);
      ta.addEventListener("input", function () { setValue(f.key, ta.value); });
      return ta;
    }
    if (f.type === "range") {
      wrap = el("div", { class: "rangebox" });
      var r = el("input", { id: id, type: "range", min: f.min, max: f.max, step: f.step });
      var out = el("output", { for: id });
      r.value = Number(v) || 0;
      out.textContent = r.value + (f.unit || "");
      r.addEventListener("input", function () { out.textContent = r.value + (f.unit || ""); setValue(f.key, Number(r.value)); });
      wrap.appendChild(r); wrap.appendChild(out);
      return wrap;
    }
    if (f.type === "number") return stepper(f, id, Number(v) || 0, function (n) { setValue(f.key, n); });
    if (f.type === "toggle") {
      wrap = el("div", { class: "switch" });
      var c = el("input", { id: id, type: "checkbox", role: "switch" });
      var word = el("span", {}, v ? "On" : "Off");
      c.checked = !!v;
      c.addEventListener("change", function () { word.textContent = c.checked ? "On" : "Off"; setValue(f.key, c.checked); });
      wrap.appendChild(word); wrap.appendChild(c);
      return wrap;
    }
    if (f.type === "select") {
      var s = el("select", { id: id });
      f.options.forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); s.appendChild(op); });
      s.value = String(v);
      s.addEventListener("change", function () {       // the option's own value: a number, or a word like "auto"
        var o = f.options.filter(function (x) { return String(x[0]) === s.value; })[0];
        setValue(f.key, o ? o[0] : s.value);
      });
      return s;
    }
    if (f.type === "time") {
      wrap = el("div", { class: "timeoff" });
      var tm = el("input", { id: id, type: "time" });
      var never = el("label", { class: "switch" });
      var nc = el("input", { type: "checkbox", role: "switch" });
      never.appendChild(el("span", {}, "Never"));
      never.appendChild(nc);
      tm.value = v || "05:00";
      nc.checked = !v;
      tm.disabled = !v;
      tm.addEventListener("input", function () { setValue(f.key, tm.value); });
      nc.addEventListener("change", function () { tm.disabled = nc.checked; setValue(f.key, nc.checked ? "" : tm.value || "05:00"); });
      wrap.appendChild(tm); wrap.appendChild(never);
      return wrap;
    }
    if (f.type === "schedule") return scheduleControl(f, id, v, false);
    if (f.type === "plsched") return scheduleControl(f, id, v, true);
    if (f.type === "list") return listControl(f, id, v);
    if (f.type === "adjust") return adjustControl(f, id, v);
    if (f.type === "labels") return wordsControl(f, id);
    if (f.type === "prices") return pricesControl(f, id, v);
    return el("span", {}, String(v));
  }

  // What tirezh.com has, in the words of the phone page (the TV shows tirezh.com's Kurdish names)
  var PRICE_ITEMS = [["", "None"], ["us", "US dollar (IQD)"], ["gold21", "Gold 21 karat (IQD per mithqal)"], ["gold18", "Gold 18 karat (IQD per mithqal)"],
    ["gold22", "Gold 22 karat (IQD per mithqal)"], ["gold24", "Gold 24 karat (IQD per mithqal)"], ["ounce", "Gold, world price ($ per ounce)"],
    ["silver", "Silver, world price ($ per ounce)"], ["eu", "Euro"], ["gb", "Pound sterling"], ["tr", "Turkish lira"], ["ir", "Iranian toman"],
    ["sa", "Saudi riyal"], ["ae", "UAE dirham"], ["jo", "Jordanian dinar"], ["ca", "Canadian dollar"], ["ch", "Swiss franc"],
    ["se", "Swedish krona"], ["no", "Norwegian krone"], ["dk", "Danish krone"], ["au", "Australian dollar"], ["btc", "Bitcoin ($)"]];

  // Up to seven prices, first to last as they stand on the TV
  function pricesControl(f, id, v) {
    var wrap = el("div", { class: "picks", id: id }), have = (v instanceof Array ? v : []).slice(0, 7), sels = [];
    for (var i = 0; i < 7; i++) {
      var row = el("label", { class: "pick" }), s = el("select", { "aria-label": "Price " + (i + 1) });
      row.appendChild(el("span", { class: "nth" }, String(i + 1)));
      PRICE_ITEMS.forEach(function (o) { s.appendChild(el("option", { value: o[0] }, o[1])); });
      if (have[i] && !PRICE_ITEMS.some(function (o) { return o[0] === have[i]; })) s.appendChild(el("option", { value: have[i] }, have[i]));
      s.value = have[i] || "";
      s.addEventListener("change", function () {
        var out = [];
        sels.forEach(function (x) { if (x.value && out.indexOf(x.value) < 0) out.push(x.value); });
        setValue(f.key, out);
      });
      row.appendChild(s);
      wrap.appendChild(row);
      sels.push(s);
    }
    return wrap;
  }

  function stepper(f, id, start, onChange) {
    var wrap = el("div", { class: "stepper", id: id });
    var minus = el("button", { type: "button", class: "step", "aria-label": "Less" }, "−");
    var plus = el("button", { type: "button", class: "step", "aria-label": "More" }, "+");
    var out = el("output", {});
    var n = start;
    function show() { out.textContent = (f.signed && n > 0 ? "+" : "") + String(n).replace("-", "−") + (f.unit || ""); }
    function move(d) {
      n = Math.round((n + d * f.step) / f.step) * f.step;
      n = Math.max(f.min, Math.min(f.max, Number(n.toFixed(2))));
      show();
      onChange(n);
    }
    minus.addEventListener("click", function () { move(-1); });
    plus.addEventListener("click", function () { move(1); });
    show();
    wrap.appendChild(minus); wrap.appendChild(out); wrap.appendChild(plus);
    return wrap;
  }

  // Times of day, each with a volume (percent) or a playlist (link)
  function scheduleControl(f, id, v, playlists) {
    var wrap = el("div", { class: "sched", id: id });
    var rows = [];
    var obj = v && typeof v === "object" ? v : {};
    Object.keys(obj).sort().forEach(function (t) { rows.push({ t: t, p: playlists ? String(obj[t] || "") : Number(obj[t]) || 0 }); });
    function emit() {
      var o = {};
      rows.forEach(function (r) { if (/^\d{1,2}:\d{2}$/.test(r.t) && (!playlists || r.p.trim())) o[r.t] = playlists ? r.p.trim() : r.p; });
      setValue(f.key, o);
    }
    function draw() {
      wrap.innerHTML = "";
      rows.forEach(function (r, i) {
        var line = el("div", { class: "line" });
        var tm = el("input", { type: "time", "aria-label": "From" });
        tm.value = r.t.length === 4 ? "0" + r.t : r.t;
        tm.addEventListener("input", function () { r.t = tm.value; emit(); });
        line.appendChild(tm);
        if (playlists) {
          var link = el("input", { type: "text", placeholder: "Playlist link", "aria-label": "Playlist link", autocomplete: "off", spellcheck: "false" });
          link.value = r.p;
          link.addEventListener("input", function () { r.p = link.value; emit(); });
          line.appendChild(link);
        } else {
          line.appendChild(stepper({ step: 5, min: 0, max: 100, unit: "%" }, "", r.p, function (n) { r.p = n; emit(); }));
        }
        var x = el("button", { type: "button", class: "x", "aria-label": "Remove" }, "×");
        x.addEventListener("click", function () { rows.splice(i, 1); draw(); emit(); });
        line.appendChild(x);
        wrap.appendChild(line);
      });
      var add = el("button", { type: "button", class: "add" }, rows.length ? "Add another time" : "Add a time");
      add.addEventListener("click", function () {
        rows.push({ t: rows.length ? "18:00" : "10:00", p: playlists ? "" : rows.length ? 100 : 60 });
        draw();
        emit();
      });
      wrap.appendChild(add);
    }
    draw();
    return wrap;
  }

  // Lines of text, e.g. the messages between songs
  function listControl(f, id, v) {
    var wrap = el("div", { class: "sched", id: id }), rows = (v instanceof Array ? v : []).map(String);
    function emit() { setValue(f.key, rows.map(function (r) { return r.trim(); }).filter(Boolean)); }
    function draw() {
      wrap.innerHTML = "";
      rows.forEach(function (r, i) {
        var line = el("div", { class: "line" });
        var t = el("input", { type: "text", dir: "auto", maxlength: 160, "aria-label": "Message " + (i + 1) });
        t.value = r;
        t.addEventListener("input", function () { rows[i] = t.value; emit(); });
        line.appendChild(t);
        var x = el("button", { type: "button", class: "x", "aria-label": "Remove" }, "×");
        x.addEventListener("click", function () { rows.splice(i, 1); draw(); emit(); });
        line.appendChild(x);
        wrap.appendChild(line);
      });
      var add = el("button", { type: "button", class: "add" }, f.add || "Add");
      add.addEventListener("click", function () {
        rows.push("");
        draw();
        var inputs = wrap.querySelectorAll("input");
        if (inputs.length) inputs[inputs.length - 1].focus();
      });
      wrap.appendChild(add);
    }
    draw();
    return wrap;
  }

  // The five prayers, each moved by some minutes, with today's time beside it
  var loadedAdjust = {};
  function adjustControl(f, id, v) {
    var wrap = el("div", { class: "adjust", id: id }), cur = v && typeof v === "object" ? copy(v) : {};
    loadedAdjust = copy(cur);
    Object.keys(PRAYER_NAMES).forEach(function (k) {
      var row = el("div", { class: "arow" });
      row.appendChild(el("span", {}, PRAYER_NAMES[k]));
      row.appendChild(el("span", { class: "ptime", "data-prayer": k }, "–"));
      row.appendChild(stepper({ step: 1, min: -30, max: 30, unit: " min", signed: true }, "", Number(cur[k]) || 0, function (n) {
        if (n) cur[k] = n; else delete cur[k];
        setValue(f.key, copy(cur));
        refreshPrayerTimes();
      }));
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Today's prayer times from the TV, moved by any change not saved yet
  function refreshPrayerTimes() {
    var cells = document.querySelectorAll(".ptime");
    if (!cells.length) return;
    var p = last && last.page, times = {}, now = value("prayerAdjust") || {};
    ((p && p.prayers) || []).forEach(function (x) { times[x.name] = x.at; });
    for (var i = 0; i < cells.length; i++) {
      var k = cells[i].getAttribute("data-prayer"), at = times[k];
      cells[i].textContent = at ? clock(at + ((Number(now[k]) || 0) - (Number(loadedAdjust[k]) || 0)) * 60e3) : "–";
    }
  }

  // The words on the TV. In grey, the shared word (settings.json) or the English one; typed, this TV's own.
  // Only this TV's own are saved, word by word, so new words in settings.json still reach it.
  function wordsControl(f, id) {
    var words = (data && data.defaults && data.defaults.labelWords) || WORDS;
    var shared = base[f.key] && typeof base[f.key] === "object" ? base[f.key] : {}, mine = {};
    var own = local[f.key] && typeof local[f.key] === "object" ? local[f.key] : {};
    Object.keys(own).forEach(function (k) { if (String(own[k]) !== String(shared[k] == null ? "" : shared[k])) mine[k] = own[k]; });
    var box = el("details", { class: "words", id: id });
    box.appendChild(el("summary", {}, "Show the " + Object.keys(words).length + " words"));
    Object.keys(words).forEach(function (k) {
      var row = el("label", { class: "lrow" });
      row.appendChild(el("span", {}, WORD_NOTES[k] || words[k]));
      var input = el("input", { type: "text", dir: "auto", autocomplete: "off", spellcheck: "false" });
      input.placeholder = shared[k] != null && String(shared[k]).trim() ? String(shared[k]) : words[k] || "";
      input.value = mine[k] == null ? "" : String(mine[k]);
      input.addEventListener("input", function () {
        if (input.value.trim() && input.value !== String(shared[k] == null ? "" : shared[k])) mine[k] = input.value; else delete mine[k];
        setValue(f.key, Object.keys(mine).length ? copy(mine) : copy(base[f.key]));
      });
      row.appendChild(input);
      box.appendChild(row);
    });
    if (Object.keys(mine).length) box.open = true;
    return box;
  }

  // Buttons that show a special day's look on the TV for 20 seconds
  function looksField() {
    var box = el("div", { class: "field" });
    box.appendChild(el("div", { class: "fhead" })).appendChild(el("label", {}, "See a special day's look on the TV"));
    var row = el("div", { class: "looks" });
    [["newroz", "Newroz"], ["eidFitr", "Eid al-Fitr"], ["eidAdha", "Eid al-Adha"], ["barat", "Barat Night"], ["newYear", "New Year"]].forEach(function (d) {
      row.appendChild(el("button", { type: "button", class: "mini", "data-cmd": "look:" + d[0] }, d[1]));
    });
    box.appendChild(row);
    box.appendChild(el("p", { class: "hint" }, "For 20 seconds, over the video. The music carries on."));
    return box;
  }

  /* ---------- The café's pictures ---------- */

  var pics = null, picsBusy = false, picNote = "";

  function picturesCard() {
    var card = el("section", { class: "card", id: "picCard" });
    card.appendChild(el("p", { class: "label" }, "Shown between songs, taking turns with the messages. Each is fitted to the TV whole, nothing cut off."));
    var up = el("label", { class: "wide upload", id: "picUpload" });
    var input = el("input", { type: "file", accept: "image/*", multiple: "" });
    up.appendChild(input);
    up.appendChild(el("span", {}, "Add pictures"));
    input.addEventListener("change", function () { upload([].slice.call(input.files || [])); input.value = ""; });
    card.appendChild(up);
    card.appendChild(el("p", { class: "hint", id: "picMsg", role: "status" }));
    card.appendChild(el("div", { class: "pics", id: "picGrid" }));
    return card;
  }

  function loadPictures() {
    if (!pin) return;
    api("/api/pictures").then(function (r) { pics = r; drawPictures(); }).catch(function () {});
  }

  function drawPictures() {
    var grid = $("picGrid");
    if (!grid || !pics) return;
    grid.innerHTML = "";
    (pics.pictures || []).forEach(function (p, i) {
      var fig = el("figure");
      fig.appendChild(el("img", { src: "/api/picture?id=" + encodeURIComponent(p.id) + "&size=small&pin=" + encodeURIComponent(pin), alt: "Picture " + (i + 1), loading: "lazy" }));
      var del = el("button", { type: "button", class: "del", "aria-label": "Delete picture " + (i + 1) }, "×");
      del.addEventListener("click", function () {
        if (!window.confirm("Delete this picture from the TV?")) return;
        picNote = "";
        api("/api/pictures?delete=" + encodeURIComponent(p.id), "POST").then(loadPictures).catch(function () {});
      });
      fig.appendChild(del);
      grid.appendChild(fig);
    });
    var n = (pics.pictures || []).length, max = pics.max || 30;
    if (!picsBusy) $("picMsg").textContent = (picNote ? picNote + " " : "") + (n ? n + " of " + max + " pictures." : "No pictures yet.");
    $("picUpload").hidden = n >= max;
  }

  // Each photo becomes a 1920x1080 picture for the TV: the photo whole, on a blurred, darkened copy of itself
  function prepare(file) {
    return loadImage(file).then(function (img) {
      var W = 1920, H = 1080, iw = img.width, ih = img.height;
      if (!iw || !ih) throw new Error("empty");
      var c = el("canvas"), g, tiny = el("canvas"), tg, cover, fit;
      c.width = W; c.height = H;
      g = c.getContext("2d");
      tiny.width = 32; tiny.height = 18;
      tg = tiny.getContext("2d");
      cover = Math.max(32 / iw, 18 / ih);
      tg.drawImage(img, (32 - iw * cover) / 2, (18 - ih * cover) / 2, iw * cover, ih * cover);
      g.imageSmoothingEnabled = true;
      g.drawImage(tiny, 0, 0, W, H);
      g.fillStyle = "rgba(11, 16, 48, .45)";
      g.fillRect(0, 0, W, H);
      fit = Math.min(W / iw, H / ih);
      g.drawImage(img, (W - iw * fit) / 2, (H - ih * fit) / 2, iw * fit, ih * fit);
      var small = el("canvas");
      small.width = 384; small.height = 216;
      small.getContext("2d").drawImage(c, 0, 0, 384, 216);
      return { full: c.toDataURL("image/jpeg", 0.86), small: small.toDataURL("image/jpeg", 0.8) };
    });
  }

  function loadImage(file) {
    var viaImg = function () {
      return new Promise(function (ok, no) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () { ok(img); };
        img.onerror = function () { no(new Error("not a picture")); };
        img.src = url;
      });
    };
    if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: "from-image" }).catch(viaImg);
    return viaImg();
  }

  function upload(files) {
    if (!files.length || picsBusy) return;
    picsBusy = true;
    var done = 0, failed = [];
    (function nextOne(i) {
      if (i >= files.length) {
        picsBusy = false;
        picNote = ((done ? done + (done === 1 ? " picture" : " pictures") + " added. " : "") + failed.join(" ")).trim();
        return loadPictures();
      }
      $("picMsg").textContent = "Adding " + (i + 1) + " of " + files.length + "…";
      prepare(files[i]).then(function (p) {
        return api("/api/pictures", "POST", p);
      }).then(function (r) {
        if (r && r.ok) done++;
        else failed.push((files[i].name || "A picture") + ": " + ((r && r.message) || "not added") + ".");
      }).catch(function (e) {
        if (e.message === "pin" || e.message === "locked") { picsBusy = false; return; }
        failed.push((files[i].name || "A picture") + " couldn't be read as a picture.");
      }).then(function () { if (picsBusy) nextOne(i + 1); });
    })(0);
  }

  /* ---------- The café screen's pictures ---------- */

  var LOOK_NAMES = [["cafe", "Every day"], ["plain", "Under messages and the call to prayer"], ["newroz", "Newroz"],
                    ["eid", "Eid (both Eids)"], ["barat", "Barat Night"], ["newyear", "New Year"]];
  var looks = null, looksBusy = false;

  function cafeScreenCard() {
    var card = el("section", { class: "card", id: "lookCard" });
    card.appendChild(el("p", { class: "label" }, "What the TV shows when no video is on. Make them 16:9, like 1920×1080; the TV crops other " +
      "shapes to fit. Put your words in the pictures, except the one under messages: the TV writes those low in its middle. " +
      "A change goes to every TV at once."));
    card.appendChild(el("p", { class: "hint", id: "lookMsg", role: "status" }));
    var grid = el("div", { class: "lookgrid", id: "lookGrid" });
    LOOK_NAMES.forEach(function (n) {
      var fig = el("figure", { "data-look": n[0] }), shot = el("div", { class: "shot" });
      shot.appendChild(el("img", { alt: n[1] }));
      shot.appendChild(el("span", { class: "src" }));
      fig.appendChild(shot);
      fig.appendChild(el("figcaption", {}, n[1]));
      var acts = el("div", { class: "acts" }), up = el("label", { class: "mini upload" });
      var input = el("input", { type: "file", accept: "image/*", "aria-label": "Change the picture: " + n[1] });
      up.appendChild(input);
      up.appendChild(el("span", {}, "Change"));
      input.addEventListener("change", function () { var f = input.files && input.files[0]; input.value = ""; if (f) putLook(n, f); });
      var back = el("button", { type: "button", class: "mini builtin" }, "Built-in");
      back.addEventListener("click", function () {
        if (looksBusy || !window.confirm("Use the built-in picture for “" + n[1] + "” again, on every TV?")) return;
        sendLook(n, api("/api/looks?name=" + n[0] + "&reset=1&all=1", "POST"), "Back to the built-in picture");
      });
      acts.appendChild(up);
      acts.appendChild(back);
      fig.appendChild(acts);
      grid.appendChild(fig);
    });
    card.appendChild(grid);
    return card;
  }

  function loadLooks() {
    if (!pin) return;
    api("/api/looks").then(function (r) { looks = r; drawLooks(); }).catch(function () {});
  }

  function drawLooks() {
    if (!$("lookGrid") || !looks) return;
    var at = {};
    (looks.looks || []).forEach(function (l) { at[l.name] = Number(l.at) || 0; });
    LOOK_NAMES.forEach(function (n) {
      var fig = document.querySelector('#lookGrid figure[data-look="' + n[0] + '"]'), mine = at[n[0]] > 0;
      fig.querySelector("img").src = "/api/look?name=" + n[0] + "&size=small&v=" + (at[n[0]] || 0) + "&pin=" + encodeURIComponent(pin);
      var tag = fig.querySelector(".src");
      tag.textContent = mine ? "yours" : "built-in";
      tag.className = "src" + (mine ? " mine" : "");
      fig.querySelector(".builtin").hidden = !mine;
    });
  }

  // The picture as the TV shows it: 1920x1080, cropped to fill (as the TV does), and a small copy for this page
  function prepareLook(file) {
    return loadImage(file).then(function (img) {
      var W = 1920, H = 1080, iw = img.width, ih = img.height;
      if (!iw || !ih) throw new Error("empty");
      var c = el("canvas"), g, cover = Math.max(W / iw, H / ih);
      c.width = W; c.height = H;
      g = c.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, (W - iw * cover) / 2, (H - ih * cover) / 2, iw * cover, ih * cover);
      var small = el("canvas");
      small.width = 384; small.height = 216;
      var sg = small.getContext("2d");
      sg.imageSmoothingQuality = "high";
      sg.drawImage(c, 0, 0, 384, 216);
      return { full: c.toDataURL("image/jpeg", 0.9), small: small.toDataURL("image/jpeg", 0.8) };
    });
  }

  function putLook(n, file) {
    if (looksBusy) return;
    prepareLook(file).then(function (p) {
      return sendLook(n, api("/api/looks?name=" + n[0] + "&all=1", "POST", p), "New picture saved");
    }, function () {
      $("lookMsg").textContent = (file.name || "That file") + " couldn't be read as a picture.";
    });
  }

  // Says where it was saved: this TV and the others (or why one wasn't)
  function sendLook(n, request, done) {
    looksBusy = true;
    $("lookMsg").textContent = "“" + n[1] + "”: saving on every TV…";
    return request.then(function (r) {
      if (!r || !r.ok) { $("lookMsg").textContent = "“" + n[1] + "”: " + ((r && r.message) || "not saved") + "."; return; }
      var saved = [r.tv || "this TV"], notes = [];
      (r.others || []).forEach(function (o) { if (o.result === "saved") saved.push(o.name); else notes.push(o.name + " " + o.result + "."); });
      $("lookMsg").textContent = "“" + n[1] + "”: " + done + " on " + saved.join(", ") + "." + (notes.length ? " " + notes.join(" ") : "");
    }).catch(function (e) {
      if (e.message !== "pin" && e.message !== "locked") $("lookMsg").textContent = "“" + n[1] + "”: the TV couldn't be reached. Try again.";
    }).then(function () {
      looksBusy = false;
      loadLooks();
    });
  }

  /* ---------- The menu for customers ---------- */

  var menu = null, menuBusy = false, ed = null;
  var MENU_LANGS = [["ku", "Kurdish", "rtl"], ["ar", "Arabic", "rtl"], ["en", "English", "ltr"]];
  var KINDS = { category: "category", sub: "subcategory", item: "item" };

  function loadMenu() {
    if (!pin) return askPin("");
    api("/api/menu").then(function (m) {
      if (!m || !m.categories) throw new Error("menu");
      menu = m;
      drawMenu();
    }).catch(function (e) {
      if (e.message === "pin" || e.message === "locked") return;
      if (!menu) { $("menuInfo").innerHTML = ""; $("menuInfo").appendChild(el("p", { class: "label" }, "Couldn't load the menu. Check the Wi-Fi and try again.")); }
    });
  }

  // A name in Kurdish if it has one, else English, else Arabic; and the others, for under it
  function mainName(n) { var x = n.name || {}; return x.ku || x.en || x.ar || "(no name)"; }
  function otherNames(n) {
    var x = n.name || {}, main = mainName(n);
    return MENU_LANGS.map(function (l) { return x[l[0]]; }).filter(function (v) { return v && v !== main; }).join(" / ");
  }
  function dinars(v) { return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function menuPic(id, small) { return "/menu/pics/" + encodeURIComponent(id) + (small ? ".small.jpg" : ".jpg"); }

  function countItems(n) {
    var k = (n.items || []).length;
    (n.subs || []).forEach(function (s) { k += (s.items || []).length; });
    return k;
  }

  function drawMenu() {
    if (!menu) return;
    var info = $("menuInfo"), cats = menu.categories || [], all = 0;
    cats.forEach(function (c) { all += countItems(c); });
    info.innerHTML = "";
    info.appendChild(el("p", { class: "title" }, menu.shown ? menu.shown + (menu.shown === 1 ? " item" : " items") + " on the menu for customers" :
      all ? "Nothing customers can see yet" : "Nothing on the menu yet"));
    var p = el("p", { class: "label", style: "margin-top:6px" });
    if (menu.link) {
      p.textContent = "The TV shows the code for another menu, from menuUrl in settings.json. Take menuUrl out of settings.json to show this menu instead.";
    } else if (menu.address) {
      p.appendChild(document.createTextNode("The menu code is on the TV. Phones on the café Wi-Fi open it. "));
      p.appendChild(el("a", { href: menu.address || "/menu/", target: "_blank", rel: "noopener" }, "See it as customers do"));
    } else {
      p.textContent = all ? "Everything on it is hidden. The menu code appears on the TV once customers can see an item." :
        "Add items below. The menu code appears on the TV with the first one.";
    }
    info.appendChild(p);

    var box = $("menuList");
    box.innerHTML = "";
    cats.forEach(function (c) {
      var card = el("section", { class: "card mcat" });
      card.appendChild(head(c, "category", countItems(c) + (countItems(c) === 1 ? " item" : " items")));
      card.appendChild(itemList(c.items || []));
      card.appendChild(addLink("Add an item", function () { openEditor("item", null, "c:" + c.id); }));
      (c.subs || []).forEach(function (s) {
        var sub = el("div", { class: "msub" });
        sub.appendChild(head(s, "sub", (s.items || []).length + ((s.items || []).length === 1 ? " item" : " items")));
        sub.appendChild(itemList(s.items || []));
        sub.appendChild(addLink("Add an item to " + mainName(s), function () { openEditor("item", null, "s:" + s.id); }));
        card.appendChild(sub);
      });
      card.appendChild(addLink("Add a subcategory", function () { openEditor("sub", null, "c:" + c.id); }));
      box.appendChild(card);
    });
    $("addCat").hidden = false;
  }

  // A category's or subcategory's heading: tap it to change it
  function head(n, kind, count) {
    var b = el("button", { type: "button", class: "mhead" + (n.hidden ? " off" : ""), "aria-label": "Change " + KINDS[kind] + " " + mainName(n) });
    if (n.picture) b.appendChild(el("img", { src: menuPic(n.picture, true), alt: "", loading: "lazy" }));
    var t = el("span", { class: "t" }), name = el("b", { dir: "auto" }, mainName(n));
    if (n.hidden) name.appendChild(el("span", { class: "tag" }, "hidden"));
    t.appendChild(name);
    var sub = [otherNames(n), count].filter(Boolean).join(". ");
    t.appendChild(el("span", { dir: "auto" }, sub));
    b.appendChild(t);
    b.appendChild(el("span", { class: "edit", "aria-hidden": "true" }, "Change"));
    b.addEventListener("click", function () { openEditor(kind, n.id); });
    return b;
  }

  function itemList(items) {
    var box = el("div", { class: "mitems" });
    items.forEach(function (it) {
      var b = el("button", { type: "button", class: "mitem" + (it.picture ? "" : " nopic") + (it.hidden ? " off" : "") });
      if (it.picture) b.appendChild(el("img", { src: menuPic(it.picture, true), alt: "", loading: "lazy" }));
      var t = el("span", { class: "t" }), name = el("b", { dir: "auto" }, mainName(it));
      if (it.hidden) name.appendChild(el("span", { class: "tag" }, "hidden"));
      else if (it.tv === false) name.appendChild(el("span", { class: "tag" }, "not on the TV"));
      if (it.model) name.appendChild(el("span", { class: "tag" }, "3D"));
      t.appendChild(name);
      var o = otherNames(it);
      if (o) t.appendChild(el("span", { dir: "auto" }, o));
      b.appendChild(t);
      b.appendChild(el("span", { class: "price" }, it.price != null ? dinars(it.price) : ""));
      b.addEventListener("click", function () { openEditor("item", it.id); });
      box.appendChild(b);
    });
    return box;
  }

  function addLink(text, fn) {
    var b = el("button", { type: "button", class: "madd" }, "+ " + text);
    b.addEventListener("click", fn);
    return b;
  }
  $("addCat").addEventListener("click", function () { openEditor("category", null, "top"); });

  // Where something is on the menu: the list it's in, its place there, and what that list belongs to
  function locate(cats, id) {
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (c.id === id) return { list: cats, at: i, home: "top", node: c };
      var items = c.items || [], subs = c.subs || [];
      for (var j = 0; j < items.length; j++) if (items[j].id === id) return { list: items, at: j, home: "c:" + c.id, node: items[j] };
      for (var k = 0; k < subs.length; k++) {
        if (subs[k].id === id) return { list: subs, at: k, home: "c:" + c.id, node: subs[k] };
        var si = subs[k].items || [];
        for (var m = 0; m < si.length; m++) if (si[m].id === id) return { list: si, at: m, home: "s:" + subs[k].id, node: si[m] };
      }
    }
    return null;
  }

  // The list a category, subcategory or item goes in: "top", "c:<category>" or "s:<subcategory>"
  function listAt(cats, kind, home) {
    if (kind === "category") return cats;
    var id = home.slice(2);
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (home.charAt(0) === "c" && c.id === id) {
        if (kind === "sub") return c.subs || (c.subs = []);
        return c.items || (c.items = []);
      }
      var subs = c.subs || [];
      for (var k = 0; k < subs.length; k++) if (home.charAt(0) === "s" && subs[k].id === id) return subs[k].items || (subs[k].items = []);
    }
    return null;
  }

  // Where an item or subcategory can go, for the editor's "In" list
  function homes(kind) {
    var out = [];
    (menu.categories || []).forEach(function (c) {
      out.push(["c:" + c.id, mainName(c)]);
      if (kind === "item") (c.subs || []).forEach(function (s) { out.push(["s:" + s.id, mainName(c) + " › " + mainName(s)]); });
    });
    return out;
  }

  function newMenuId() { return "n" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }

  // Kurdish or Arabic digits typed in the price: 0-9; separators dropped
  function typedPrice(s) {
    s = String(s || "").replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); })
                       .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x6F0); });
    s = s.split(/[.٫]/)[0].replace(/\D/g, "");
    return s ? Number(s) : null;
  }

  /* ---------- changing one thing on the menu ---------- */

  function openEditor(kind, id, home) {
    if (!menu) return;
    var loc = id ? locate(menu.categories, id) : null;
    if (id && !loc) return;
    var n = loc ? loc.node : {};
    ed = { kind: kind, id: id, isNew: !id, home: loc ? loc.home : home, uploading: false,
           draft: { name: copy(n.name || {}), note: copy(n.note || {}), price: n.price, picture: n.picture || null, model: n.model || null,
                    hidden: !!n.hidden, tv: n.tv !== false } };
    var listNow = listAt(menu.categories, kind, ed.home) || [];
    ed.place = loc ? loc.at : listNow.length;
    ed.startHome = ed.home;
    drawEditor();
    try { history.pushState({ editor: true }, ""); } catch (e) {}
  }

  function drawEditor() {
    var box = $("editor"), d = ed.draft, kind = ed.kind;
    box.innerHTML = "";
    var f = el("form", { autocomplete: "off", novalidate: "" });
    f.appendChild(el("h2", { id: "edTitle" }, (ed.isNew ? "New " : "Change ") + KINDS[kind]));
    if (ed.isNew && kind !== "category") {
      var where = (homes(kind).filter(function (h) { return h[0] === ed.home; })[0] || [])[1];
      if (where) f.appendChild(el("p", { class: "label" }, "In " + where));
    }

    var names = el("div", { class: "field" }), ng = el("div", { class: "names" });
    names.appendChild(el("p", { class: "fhead" }, "Name (one language is enough)"));
    MENU_LANGS.forEach(function (l) {
      var lab = el("label", {}, l[1]), inp = el("input", { type: "text", dir: l[2], lang: l[0] === "ku" ? "ckb" : l[0], maxlength: "80", "data-name": l[0] });
      inp.value = d.name[l[0]] || "";
      inp.addEventListener("input", function () { d.name[l[0]] = inp.value; $("edErr").hidden = true; });
      lab.appendChild(inp);
      ng.appendChild(lab);
    });
    names.appendChild(ng);
    f.appendChild(names);

    if (kind === "item") {
      var pf = el("div", { class: "field" });
      pf.appendChild(el("label", { class: "fhead", for: "edPrice" }, "Price in dinars"));
      var pi = el("input", { type: "text", id: "edPrice", inputmode: "numeric", placeholder: "e.g. 5000", dir: "ltr" });
      pi.value = d.price != null ? dinars(d.price) : "";
      var shown = el("p", { class: "hint" });
      var showPrice = function () {
        var v = typedPrice(pi.value);
        shown.textContent = v == null ? "Empty: no price is shown." : v > 999999999 ? "That's too big." : "Customers see " + dinars(v) + " IQD.";
      };
      pi.addEventListener("input", function () { d.price = typedPrice(pi.value); showPrice(); $("edErr").hidden = true; });
      showPrice();
      pf.appendChild(pi);
      pf.appendChild(shown);
      f.appendChild(pf);
    }

    var pic = el("div", { class: "field" }), row = el("div", { class: "epic" });
    pic.appendChild(el("p", { class: "fhead" }, "Picture"));
    var img = el("img", { alt: "", id: "edPic" });
    if (d.picture) img.src = d.preview || menuPic(d.picture, true);
    img.hidden = !d.picture;
    row.appendChild(img);
    var up = el("label", { class: "mini upload" }), input = el("input", { type: "file", accept: "image/*", "aria-label": "Choose a picture" });
    up.appendChild(input);
    up.appendChild(el("span", { id: "edPicText" }, d.picture ? "Change" : "Choose a picture"));
    input.addEventListener("change", function () { var file = input.files && input.files[0]; input.value = ""; if (file) putMenuPicture(file); });
    row.appendChild(up);
    var rm = el("button", { type: "button", class: "mini x", "aria-label": "Remove the picture", id: "edPicOff" }, "×");
    rm.hidden = !d.picture;
    rm.addEventListener("click", function () { d.picture = null; d.preview = null; drawEditor(); });
    row.appendChild(rm);
    pic.appendChild(row);
    pic.appendChild(el("p", { class: "hint", id: "edPicMsg", role: "status" }, kind === "item" ?
      "Square is best, like 1200×1200: shown small beside it (cut to a square from the middle), and big when a customer taps it." :
      kind === "sub" ?
      "Wide is best, 2:1 like 1200×600: a strip across the menu with its name and description on it, along the bottom, cut to that shape." :
      "Wide is best, 16:9 like 1200×675: across the menu, rounded, with its name and description on it along the bottom, cut to that shape."));
    f.appendChild(pic);

    if (kind === "item") f.appendChild(modelField(d));

    var notes = el("details", { class: "field words" }), sum = el("summary", {}, "Description (optional)"), nb = el("div", { class: "names" });
    notes.appendChild(sum);
    if (MENU_LANGS.some(function (l) { return d.note[l[0]]; })) notes.open = true;
    MENU_LANGS.forEach(function (l) {
      var lab = el("label", {}, l[1]), ta = el("textarea", { dir: l[2], maxlength: "400", rows: "2", "data-note": l[0] });
      ta.value = d.note[l[0]] || "";
      ta.addEventListener("input", function () { d.note[l[0]] = ta.value; });
      lab.appendChild(ta);
      nb.appendChild(lab);
    });
    if (kind === "item") nb.appendChild(el("p", { class: "hint" }, "Customers see it when they tap the item."));
    notes.appendChild(nb);
    f.appendChild(notes);

    var vis = el("div", { class: "field" }), sw = el("label", { class: "switch" }), cb = el("input", { type: "checkbox", role: "switch", id: "edShown" });
    sw.appendChild(el("span", { style: "color:var(--cream);font-size:1rem;font-weight:600" }, "On the menu for customers"));
    cb.checked = !d.hidden;
    cb.addEventListener("change", function () { d.hidden = !cb.checked; });
    sw.appendChild(cb);
    vis.appendChild(sw);
    vis.appendChild(el("p", { class: "hint" }, kind === "item" ? "Off: hidden from customers (sold out, say), and kept here for later." :
      "Off: hidden from customers with everything in it, and kept here for later."));
    f.appendChild(vis);

    if (kind === "item") {                       // its slide on the TV between songs
      var onTv = el("div", { class: "field" }), tsw = el("label", { class: "switch" }), tcb = el("input", { type: "checkbox", role: "switch", id: "edTv" });
      tsw.appendChild(el("span", { style: "color:var(--cream);font-size:1rem;font-weight:600" }, "On the TV between songs"));
      tcb.checked = d.tv !== false;
      tcb.addEventListener("change", function () { d.tv = tcb.checked; });
      tsw.appendChild(tcb);
      onTv.appendChild(tsw);
      onTv.appendChild(el("p", { class: "hint" }, "Its picture, name, description and price, in turn with the café screen's messages and pictures (it needs a picture). Off for what isn't worth showing, like water."));
      f.appendChild(onTv);
    }

    var place = el("div", { class: "field" }), pg = el("div", { class: kind === "category" ? "" : "two3" });
    place.appendChild(el("p", { class: "fhead" }, "Place on the menu"));
    if (kind !== "category") {
      var inSel = el("select", { "aria-label": "In", id: "edIn" });
      homes(kind).forEach(function (h) { inSel.appendChild(el("option", { value: h[0] }, h[1])); });
      inSel.value = ed.home;
      inSel.addEventListener("change", function () {
        ed.home = inSel.value;
        ed.place = (listAt(menu.categories, kind, ed.home) || []).length - (ed.home === ed.startHome && !ed.isNew ? 1 : 0);
        drawPlaces();
      });
      pg.appendChild(inSel);
    }
    var posSel = el("select", { "aria-label": "Place in the list", id: "edPlace" });
    posSel.addEventListener("change", function () { ed.place = Number(posSel.value); });
    pg.appendChild(posSel);
    place.appendChild(pg);
    f.appendChild(place);

    if (!ed.isNew) {
      var del = el("button", { type: "button", class: "wide danger", style: "margin:14px 0 4px" }, "Delete this " + KINDS[kind]);
      del.addEventListener("click", deleteNode);
      f.appendChild(del);
    }
    f.appendChild(el("p", { class: "err", id: "edErr", role: "alert", hidden: "" }));
    var acts = el("div", { class: "eacts" });
    var cancel = el("button", { type: "button", class: "wide" }, "Cancel");
    cancel.addEventListener("click", closeEditor);
    acts.appendChild(cancel);
    acts.appendChild(el("button", { type: "submit", class: "primary", id: "edSave" }, ed.isNew ? "Add" : "Save"));
    f.appendChild(acts);
    f.addEventListener("submit", function (e) { e.preventDefault(); saveNode(); });
    box.appendChild(f);
    box.hidden = false;
    document.body.style.overflow = "hidden";
    drawPlaces();
    var first = f.querySelector("input[data-name=ku]");
    if (ed.isNew && first) setTimeout(function () { first.focus(); }, 60);
  }

  // An item's 3D model: one of the .glb files in the project's models folder on GitHub (the TV lists them).
  // Customers turn it with a finger, and see it on their table (AR) where their phone can.
  function modelField(d) {
    var box = el("div", { class: "field" }), sel = el("select", { id: "edModel" }), msg = el("p", { class: "hint", id: "edModelMsg", role: "status" });
    box.appendChild(el("label", { class: "fhead", for: "edModel" }, "3D model"));
    var fill = function (names) {
      sel.innerHTML = "";
      sel.appendChild(el("option", { value: "" }, "None"));
      names.forEach(function (m) { sel.appendChild(el("option", { value: m[0] }, m[1])); });
      if (d.model && !names.some(function (m) { return m[0] === d.model; })) sel.appendChild(el("option", { value: d.model }, d.model));
      sel.value = d.model || "";
    };
    fill([]);
    sel.addEventListener("change", function () { d.model = sel.value || null; });
    box.appendChild(sel);
    msg.textContent = "Looking in the models folder on GitHub…";
    box.appendChild(msg);
    api("/api/menu/models").then(function (r) {
      if (!r || !(r.models instanceof Array)) throw new Error("none");
      fill(r.models.map(function (m) { return [m.name, m.name + (m.size ? " (" + mb(m.size) + ")" : "")]; }));
      msg.textContent = r.models.length ? "Customers turn it with a finger, and see it on their table (AR) where their phone can. " +
        "Small files open fastest: under 5 MB is best." :
        "No models yet. Put .glb files in the models folder of the project on GitHub, and choose one here.";
    }).catch(function (e) {
      if (e.message === "pin" || e.message === "locked") return;
      msg.textContent = "GitHub can't be reached from the TV now, so the models can't be listed. Try again later.";
    });
    return box;
  }

  function mb(bytes) { return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + " MB"; }

  // The places in the chosen list: 1 (the top) to the last
  function drawPlaces() {
    var sel = $("edPlace");
    if (!sel) return;
    var list = listAt(menu.categories, ed.kind, ed.home) || [], n = list.length + (ed.isNew || ed.home !== ed.startHome ? 1 : 0);
    sel.innerHTML = "";
    for (var i = 0; i < n; i++) sel.appendChild(el("option", { value: String(i) }, i === 0 ? "1, at the top" : i === n - 1 ? n + ", last" : String(i + 1)));
    ed.place = Math.max(0, Math.min(ed.place, n - 1));
    sel.value = String(ed.place);
  }

  // fromHistory: the phone's Back button closed it (else the editor's own place in the history goes too)
  function closeEditor(fromHistory) {
    ed = null;
    $("editor").hidden = true;
    $("editor").innerHTML = "";
    document.body.style.overflow = "";
    try { if (fromHistory !== true && history.state && history.state.editor) history.back(); } catch (e) {}
  }
  $("editor").addEventListener("click", function (e) { if (e.target === $("editor") && !menuBusy) closeEditor(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && ed && !menuBusy) closeEditor(); });

  function edError(msg) {
    var e = $("edErr");
    if (!e) return say(msg);
    e.textContent = msg;
    e.hidden = false;
  }

  // The menu with one change made, sent to the TV; back comes the menu as the TV keeps it. What went wrong is
  // said in the editor, or by report.
  function commit(change, report) {
    report = report || edError;
    var cats = copy(menu.categories);
    change(cats);
    menuBusy = true;
    if ($("edSave")) $("edSave").disabled = true;
    return api("/api/menu", "POST", { base: menu.v, menu: { categories: cats } }).then(function (r) {
      if (r && r.menu) { menu = r.menu; drawMenu(); }
      if (r && r.ok) return true;
      if (r && r.conflict) { closeEditor(); say(r.message || "The menu was changed on another phone. Here it is now."); return false; }
      report((r && r.message) || "Not saved. Try again.");
      return false;
    }).catch(function (e) {
      if (e.message !== "pin" && e.message !== "locked") report("The TV couldn't be reached. Check the Wi-Fi and try again.");
      return false;
    }).then(function (ok) {
      menuBusy = false;
      if ($("edSave")) $("edSave").disabled = false;
      return ok;
    });
  }

  function words(o) {
    var out = {};
    MENU_LANGS.forEach(function (l) { var v = String(o[l[0]] || "").trim(); if (v) out[l[0]] = v; });
    return out;
  }

  function saveNode() {
    if (!ed || menuBusy) return;
    if (ed.uploading) return edError("Wait for the picture to finish.");
    var d = ed.draft, name = words(d.name), kind = ed.kind;
    if (!Object.keys(name).length) return edError("Give it a name, in at least one language.");
    if (kind === "item" && d.price != null && d.price > 999999999) return edError("That price is too big.");
    var e = ed, label = name.ku || name.en || name.ar;
    commit(function (cats) {
      var node;
      if (e.isNew) {
        node = { id: newMenuId() };
        if (kind === "category") { node.items = []; node.subs = []; }
        if (kind === "sub") node.items = [];
      } else {
        var loc = locate(cats, e.id);
        node = loc.list.splice(loc.at, 1)[0];
      }
      node.name = name;
      var note = words(d.note);
      if (Object.keys(note).length) node.note = note; else delete node.note;
      if (d.picture) node.picture = d.picture; else delete node.picture;
      if (d.hidden) node.hidden = true; else delete node.hidden;
      if (kind === "item") {
        if (d.price != null) node.price = d.price; else delete node.price;
        if (d.tv === false) node.tv = false; else delete node.tv;
        if (d.model) node.model = d.model; else delete node.model;
      }
      var list = listAt(cats, kind, e.home);
      list.splice(Math.max(0, Math.min(e.place, list.length)), 0, node);
    }).then(function (ok) {
      if (!ok) return;
      closeEditor();
      say((e.isNew ? "Added: " : "Saved: ") + label);
    });
  }

  function deleteNode() {
    if (!ed || menuBusy) return;
    var e = ed, loc = locate(menu.categories, e.id);
    if (!loc) return closeEditor();
    var n = loc.node, items = countItems(n), subs = (n.subs || []).length;
    var what = "Delete “" + mainName(n) + "”" + (e.kind === "category" ? (subs ? ", its " + subs + (subs === 1 ? " subcategory" : " subcategories") : "") +
      " and its " + items + (items === 1 ? " item" : " items") : e.kind === "sub" ? " and its " + items + (items === 1 ? " item" : " items") : "") + " from the menu?";
    if (!window.confirm(what)) return;
    commit(function (cats) {
      var l = locate(cats, e.id);
      if (l) l.list.splice(l.at, 1);
    }).then(function (ok) {
      if (!ok) return;
      closeEditor();
      say("Deleted: " + mainName(n));
    });
  }

  // A photo for the menu: up to 1200 pixels for when it's shown big, and a small copy for the lists
  function prepareMenuPicture(file) {
    return loadImage(file).then(function (img) {
      var iw = img.width, ih = img.height;
      if (!iw || !ih) throw new Error("empty");
      var draw = function (max, q) {
        var k = Math.min(1, max / Math.max(iw, ih)), c = el("canvas"), g;
        c.width = Math.max(1, Math.round(iw * k));
        c.height = Math.max(1, Math.round(ih * k));
        g = c.getContext("2d");
        g.fillStyle = "#171a45";                    // a transparent picture (PNG): on the menu's own blue, not black
        g.fillRect(0, 0, c.width, c.height);
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = "high";
        g.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", q);
      };
      return { full: draw(1200, 0.84), small: draw(360, 0.8) };
    });
  }

  function putMenuPicture(file) {
    if (!ed) return;
    var e = ed;
    e.uploading = true;
    $("edPicMsg").textContent = "Sending the picture to the TV…";
    $("edSave").disabled = true;
    prepareMenuPicture(file).then(function (p) {
      return api("/api/menu/picture", "POST", p).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.message) || "Not saved.");
        e.draft.picture = r.id;
        e.draft.preview = p.small;
      });
    }).then(function () {
      e.uploading = false;
      if (ed === e) { drawEditor(); $("edPicMsg").textContent = "Picture ready. Press " + (e.isNew ? "Add" : "Save") + " to put it on the menu."; }
    }, function (err) {
      e.uploading = false;
      if (ed !== e) return;
      $("edSave").disabled = false;
      $("edPicMsg").textContent = err.message === "pin" || err.message === "locked" ? "" :
        err.message === "empty" || err.message === "not a picture" ? (file.name || "That file") + " couldn't be read as a picture." : err.message;
    });
  }

  /* ---------- the menu in and out: a spreadsheet, or a backup with the pictures ---------- */

  var SHEET_COLUMNS = ["Type", "Kurdish", "Arabic", "English", "Price", "Kurdish description", "Arabic description", "English description", "On menu", "On TV", "Picture",
    "3D model", "ID"];

  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  function ioSay(msg) { $("ioMsg").textContent = msg; }

  function download(blob, name) {
    var a = el("a", { href: URL.createObjectURL(blob), download: name });
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 5000);
  }

  // One row for each category, then its items, then each subcategory with its items: the order of the menu
  function menuRows(cats) {
    var rows = [SHEET_COLUMNS.slice()];
    var row = function (type, n) {
      var nm = n.name || {}, nt = n.note || {};
      return [type, nm.ku || "", nm.ar || "", nm.en || "", type === "item" && n.price != null ? Number(n.price) : "", nt.ku || "", nt.ar || "", nt.en || "",
              n.hidden ? "no" : "yes", type === "item" ? (n.tv === false ? "no" : "yes") : "", n.picture || "", type === "item" ? n.model || "" : "", n.id || ""];
    };
    cats.forEach(function (c) {
      rows.push(row("category", c));
      (c.items || []).forEach(function (it) { rows.push(row("item", it)); });
      (c.subs || []).forEach(function (s) {
        rows.push(row("subcategory", s));
        (s.items || []).forEach(function (it) { rows.push(row("item", it)); });
      });
    });
    return rows;
  }

  // CSV, with the mark that tells Excel it's UTF-8 (or Kurdish comes out as nonsense)
  function toCsv(rows) {
    return "\uFEFF" + rows.map(function (r) {
      return r.map(function (v) {
        v = String(v);
        return /[",;\r\n\t]|^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\r\n") + "\r\n";
  }

  // An Excel file (.xlsx): a few XML files in a zip, stored as they are. The first row in bold, kept in sight.
  function toXlsx(rows) {
    var esc = function (s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    };
    var colName = function (i) { var s = ""; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
    var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    var widths = [14, 26, 26, 26, 11, 30, 30, 30, 10, 18, 18, 18];
    var sheet = head + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">' +
      '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' +
      widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols><sheetData>";
    rows.forEach(function (r, ri) {
      sheet += '<row r="' + (ri + 1) + '">';
      r.forEach(function (v, ci) {
        var ref = colName(ci) + (ri + 1), style = ri === 0 ? ' s="1"' : "";
        if (typeof v === "number") sheet += '<c r="' + ref + '"' + style + "><v>" + v + "</v></c>";
        else if (v !== "") sheet += '<c r="' + ref + '"' + style + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>";
      });
      sheet += "</row>";
    });
    sheet += "</sheetData></worksheet>";
    var rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", pkg = "http://schemas.openxmlformats.org/package/2006/relationships";
    var type = "application/vnd.openxmlformats-officedocument.spreadsheetml";
    return zip([
      ["[Content_Types].xml", head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="' + type + '.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + type + '.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="' + type + '.styles+xml"/></Types>'],
      ["_rels/.rels", head + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + rel + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ["xl/workbook.xml", head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + rel + '">' +
        '<sheets><sheet name="Menu" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ["xl/_rels/workbook.xml.rels", head + '<Relationships xmlns="' + pkg + '"><Relationship Id="rId1" Type="' + rel + '/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="' + rel + '/styles" Target="styles.xml"/></Relationships>'],
      ["xl/styles.xml", head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
      ["xl/worksheets/sheet1.xml", sheet]
    ], type + ".sheet");
  }

  var CRC = null;
  function crc32(b) {
    if (!CRC) {
      CRC = [];
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
    }
    var x = 0xFFFFFFFF;
    for (var i = 0; i < b.length; i++) x = CRC[(x ^ b[i]) & 0xFF] ^ (x >>> 8);
    return (x ^ 0xFFFFFFFF) >>> 0;
  }

  // A zip of [name, text] files, stored (not compressed), names in UTF-8
  function zip(files, mime) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var local = new Uint8Array(30 + name.length), v = new DataView(local.buffer);
      v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 0, true);
      v.setUint16(10, 0, true); v.setUint16(12, 0x21, true); v.setUint32(14, crc, true); v.setUint32(18, data.length, true);
      v.setUint32(22, data.length, true); v.setUint16(26, name.length, true); v.setUint16(28, 0, true);
      local.set(name, 30);
      var c = new Uint8Array(46 + name.length), w = new DataView(c.buffer);
      w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, 0, true);
      w.setUint16(12, 0, true); w.setUint16(14, 0x21, true); w.setUint32(16, crc, true); w.setUint32(20, data.length, true); w.setUint32(24, data.length, true);
      w.setUint16(28, name.length, true); w.setUint32(42, offset, true);
      c.set(name, 46);
      parts.push(local, data);
      central.push(c);
      offset += local.length + data.length;
    });
    var size = 0;
    central.forEach(function (c) { size += c.length; });
    var end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, size, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: mime });
  }

  // The files in a zip (an .xlsx), unpacked by the browser itself
  function unzip(buf) {
    var u = new Uint8Array(buf), v = new DataView(buf), i = u.length - 22, dec = new TextDecoder(), jobs = [], out = {};
    while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) return Promise.reject(new Error("That file isn't an Excel file (.xlsx)."));
    var count = v.getUint16(i + 10, true), at = v.getUint32(i + 16, true);
    for (var n = 0; n < count; n++) {
      if (v.getUint32(at, true) !== 0x02014b50) return Promise.reject(new Error("That Excel file is damaged."));
      var method = v.getUint16(at + 10, true), size = v.getUint32(at + 20, true), nlen = v.getUint16(at + 28, true);
      var more = v.getUint16(at + 30, true) + v.getUint16(at + 32, true), local = v.getUint32(at + 42, true);
      var name = dec.decode(u.subarray(at + 46, at + 46 + nlen));
      var start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
      if (/\.xml$|\.rels$/.test(name)) jobs.push(inflate(method, u.subarray(start, start + size)).then(function (nm) { return function (d) { out[nm] = d; }; }(name)));
      at += 46 + nlen + more;
    }
    return Promise.all(jobs).then(function () { return out; });
  }

  function inflate(method, data) {
    if (method === 0) return Promise.resolve(data);
    if (method !== 8 || !window.DecompressionStream || !window.Response) {
      return Promise.reject(new Error("This phone's browser can't open Excel files. Save the sheet as CSV (UTF-8) and import that."));
    }
    var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  // The first sheet of an Excel file, as rows of text
  function readXlsx(buf) {
    return unzip(buf).then(function (files) {
      var dec = new TextDecoder();
      var xml = function (n) { return files[n] ? new DOMParser().parseFromString(dec.decode(files[n]), "application/xml") : null; };
      var wb = xml("xl/workbook.xml"), rels = xml("xl/_rels/workbook.xml.rels"), target = "worksheets/sheet1.xml";
      if (wb && rels) {
        var first = wb.getElementsByTagName("sheet")[0], rid = first ? first.getAttribute("r:id") : null;
        [].forEach.call(rels.getElementsByTagName("Relationship"), function (r) { if (r.getAttribute("Id") === rid) target = r.getAttribute("Target"); });
      }
      var sheet = xml("xl/" + target.replace(/^\/?(xl\/)?/, ""));
      if (!sheet) throw new Error("That Excel file has no sheet in it.");
      var shared = [], ss = xml("xl/sharedStrings.xml");
      if (ss) [].forEach.call(ss.getElementsByTagName("si"), function (si) {
        shared.push([].map.call(si.getElementsByTagName("t"), function (t) { return t.textContent; }).join(""));
      });
      var rows = [];
      [].forEach.call(sheet.getElementsByTagName("row"), function (row) {
        var out = [];
        [].forEach.call(row.getElementsByTagName("c"), function (c) {
          var letters = (c.getAttribute("r") || "").replace(/\d+/g, ""), ci = 0;
          for (var k = 0; k < letters.length; k++) ci = ci * 26 + letters.charCodeAt(k) - 64;
          ci = ci ? ci - 1 : out.length;
          var t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0];
          out[ci] = t === "s" ? shared[Number(v && v.textContent)] || "" :
            t === "inlineStr" ? [].map.call(c.getElementsByTagName("t"), function (x) { return x.textContent; }).join("") : v ? v.textContent : "";
        });
        for (var z = 0; z < out.length; z++) if (out[z] == null) out[z] = "";
        rows.push(out);
      });
      return rows;
    });
  }

  // A CSV file as rows: commas, semicolons or tabs (whichever the first row has most of), quotes as Excel writes them
  function readCsv(text) {
    text = text.replace(/^\uFEFF/, "");
    var first = text.split(/\r?\n/)[0] || "", delim = ",";
    [";", "\t"].forEach(function (d) { if (first.split(d).length > first.split(delim).length) delim = d; });
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') { if (text.charAt(i + 1) === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(f); f = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text.charAt(i + 1) === "\n") i++;
        row.push(f); rows.push(row); row = []; f = "";
      } else f += ch;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }

  // A column's name -> what's in it, however it's put: "Kurdish", "Kurdish name", "English description",
  // "Description (Kurdish)", "ID", "Price in dinars"... Others (say "Item" or "Made of") are left alone.
  function columnOf(cell) {
    var c = String(cell == null ? "" : cell).replace(/[*_`"]/g, "").trim().toLowerCase().replace(/\s+/g, " ");   // **ID** as Gemini may write it
    if (!c) return null;
    var lang = /kurd|sorani|کورد/.test(c) ? "ku" : /arab|عرب/.test(c) ? "ar" : /engl|ئینگلیز|انجليز|إنجليز/.test(c) ? "en" : null;
    if (/descr|note|وەسف|وصف/.test(c)) return "n" + (lang || "en");
    if (/^(item |row )?id\b/.test(c)) return "id";
    if (/^(type|kind)$/.test(c)) return "type";
    if (/price|نرخ|سعر/.test(c)) return "price";
    if (/^(on (the )?menu|shown|visible)$/.test(c)) return "shown";
    if (/^(on (the )?tv|tv)$/.test(c)) return "tv";
    if (/^(picture|photo|image)$/.test(c)) return "picture";
    if (/^(3d( model)?|model|3d file)$/.test(c)) return "model";
    if (lang) return lang;
    return c === "name" ? "en" : null;
  }

  // A spreadsheet's rows: the whole menu (with a Type column), or changes to what's on it (an ID column and no
  // Type: descriptions written somewhere else, say)
  function readRows(rows) {
    var h = 0;
    while (h < rows.length && !rows[h].join("").trim()) h++;
    if (h >= rows.length) throw new Error("That file is empty.");
    var at = {};
    rows[h].forEach(function (cell, i) { var k = columnOf(cell); if (k && at[k] == null) at[k] = i; });
    if (at.type == null && at.id != null) return rowsToChanges(rows, h, at);
    return rowsToMenu(rows, h, at);
  }

  // Rows of changes: each row's ID says what it changes (spaces, quotes and capitals in it don't matter);
  // an empty cell changes nothing
  function rowsToChanges(rows, h, at) {
    var changes = [];
    for (var r = h + 1; r < rows.length; r++) {
      var row = rows[r], n = r + 1;
      if (!row.join("").trim()) continue;
      var get = function (k) { return at[k] == null || row[at[k]] == null ? "" : String(row[at[k]]).trim(); };
      var ch = { id: get("id").replace(/[^A-Za-z0-9]/g, "").toLowerCase(), row: n, name: {}, note: {} };
      if (!ch.id) continue;
      ["ku", "ar", "en"].forEach(function (l) { if (get(l)) ch.name[l] = get(l); if (get("n" + l)) ch.note[l] = get("n" + l); });
      if (get("price")) {
        ch.price = typedPrice(get("price"));
        if (ch.price == null) throw new Error("Row " + n + ": “" + get("price") + "” isn't a price.");
      }
      if (get("shown")) ch.hidden = /^(no|false|0|hidden|off|x)$/i.test(get("shown"));
      if (get("tv")) ch.tv = !/^(no|false|0|off|x)$/i.test(get("tv"));
      changes.push(ch);
    }
    if (!changes.length) throw new Error("That file has an ID column, but no rows with an ID in it.");
    return { changes: changes };
  }

  // Rows (the first: the columns' names, in any order) -> the menu. Each row says what it is; a subcategory
  // belongs to the category above it, an item to the subcategory or category above it.
  function rowsToMenu(rows, h, at) {
    if (at.type == null || (at.ku == null && at.ar == null && at.en == null)) {
      throw new Error("The first row needs the columns' names: " + SHEET_COLUMNS.join(", ") + ". Save the menu as Excel first, and change that file.");
    }
    var cats = [], cat = null, sub = null, counts = { c: 0, s: 0, i: 0, p: 0 };
    for (var r = h + 1; r < rows.length; r++) {
      var row = rows[r], n = r + 1;
      if (!row.join("").trim()) continue;
      var get = function (k) { return at[k] == null || row[at[k]] == null ? "" : String(row[at[k]]).trim(); };
      var type = get("type").toLowerCase(), name = {}, note = {};
      ["ku", "ar", "en"].forEach(function (l) { if (get(l)) name[l] = get(l); if (get("n" + l)) note[l] = get("n" + l); });
      if (!Object.keys(name).length) throw new Error("Row " + n + " has no name, in any language.");
      var node = { name: name };
      if (Object.keys(note).length) node.note = note;
      if (/^(no|false|0|hidden|off|x)$/i.test(get("shown"))) node.hidden = true;
      if (get("picture")) { node.picture = get("picture"); counts.p++; }
      if (get("id")) node.id = get("id");
      if (/^c/.test(type)) {
        node.items = []; node.subs = [];
        cats.push(node); cat = node; sub = null; counts.c++;
      } else if (/^s/.test(type)) {
        if (!cat) throw new Error("Row " + n + ": a subcategory with no category above it.");
        node.items = [];
        cat.subs.push(node); sub = node; counts.s++;
      } else if (/^i/.test(type) || !type) {
        if (!cat) throw new Error("Row " + n + ": an item with no category above it.");
        var p = get("price");
        if (p) {
          var v = typedPrice(p);
          if (v == null) throw new Error("Row " + n + ": “" + p + "” isn't a price.");
          node.price = v;
        }
        if (/^(no|false|0|off|x)$/i.test(get("tv"))) node.tv = false;
        if (get("model")) node.model = get("model");
        (sub || cat).items.push(node); counts.i++;
      } else {
        throw new Error("Row " + n + ": its Type should be category, subcategory or item.");
      }
    }
    if (!cats.length) throw new Error("That file has no categories.");
    return { categories: cats, counts: counts };
  }

  function described(c) {
    return c.c + (c.c === 1 ? " category, " : " categories, ") + c.s + (c.s === 1 ? " subcategory and " : " subcategories and ") +
      c.i + (c.i === 1 ? " item" : " items");
  }

  function saveSheet(kind) {
    if (!menu) return;
    var rows = menuRows(menu.categories || []);
    if (kind === "csv") download(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), "twilight-menu-" + today() + ".csv");
    else download(toXlsx(rows), "twilight-menu-" + today() + ".xlsx");
    ioSay("Saved on this phone: " + (kind === "csv" ? "twilight-menu-" + today() + ".csv" : "twilight-menu-" + today() + ".xlsx") +
      ". Change it in Excel or Google Sheets, then import it here.");
  }

  // A picture from the TV as text (base64), for the backup
  function pictureText(url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error("picture");
      return r.blob();
    }).then(function (b) {
      return new Promise(function (ok, no) { var f = new FileReader(); f.onload = function () { ok(f.result); }; f.onerror = no; f.readAsDataURL(b); });
    });
  }

  function saveBackup() {
    if (!menu || menuBusy) return;
    var cats = copy(menu.categories || []), ids = [], pics = {};
    var note = function (n) { if (n.picture && ids.indexOf(n.picture) < 0) ids.push(n.picture); };
    cats.forEach(function (c) { note(c); (c.items || []).forEach(note); (c.subs || []).forEach(function (s) { note(s); (s.items || []).forEach(note); }); });
    menuBusy = true;
    var i = 0;
    (function next() {
      if (i >= ids.length) {
        var file = JSON.stringify({ twilightMenu: 1, saved: new Date().toISOString(), menu: { categories: cats }, pictures: pics });
        download(new Blob([file], { type: "application/json" }), "twilight-menu-backup-" + today() + ".json");
        menuBusy = false;
        return ioSay("Saved on this phone: twilight-menu-backup-" + today() + ".json, the whole menu with its " + ids.length +
          (ids.length === 1 ? " picture." : " pictures.") + " Keep it somewhere safe.");
      }
      ioSay("Collecting the pictures: " + (i + 1) + " of " + ids.length + "…");
      var id = ids[i];
      Promise.all([pictureText(menuPic(id, false)), pictureText(menuPic(id, true))]).then(function (two) {
        pics[id] = { full: two[0], small: two[1] };
      }, function () {}).then(function () { i++; next(); });
    })();
  }

  function readBackup(text) {
    var j;
    try { j = JSON.parse(text); } catch (e) { throw new Error("That file isn't a menu backup."); }
    if (!j || j.twilightMenu !== 1 || !j.menu || !(j.menu.categories instanceof Array)) throw new Error("That file isn't a Twilight menu backup.");
    var counts = { c: 0, s: 0, i: 0, p: Object.keys(j.pictures || {}).length };
    j.menu.categories.forEach(function (c) {
      counts.c++;
      counts.i += (c.items || []).length;
      (c.subs || []).forEach(function (s) { counts.s++; counts.i += (s.items || []).length; });
    });
    return { categories: j.menu.categories, pictures: j.pictures || {}, counts: counts, backup: true };
  }

  // A spreadsheet or a backup in place of the menu, after a yes
  function importFile(file) {
    if (!menu || menuBusy) return;
    var name = String(file.name || "").toLowerCase();
    ioSay("Reading " + (file.name || "the file") + "…");
    importFrom(/\.json$/.test(name) ? file.text().then(readBackup) :
      /\.xlsx$/.test(name) ? file.arrayBuffer().then(readXlsx).then(readRows) :
      /\.(csv|txt|tsv)$/.test(name) ? file.text().then(readCsv).then(readRows) :
      Promise.reject(new Error("Choose an Excel file (.xlsx), a CSV file or a menu backup (.json).")), file.name || "this file");
  }

  // What was read (a whole menu, changes by ID, or a backup) onto the menu, after a yes; where says where from
  function importFrom(job, where, done) {
    return job.then(function (m) {
      if (m.changes) return applyChanges(m, where);
      var what = described(m.counts) + (m.backup ? ", with " + m.counts.p + (m.counts.p === 1 ? " picture" : " pictures") : "");
      if (!window.confirm("Put the menu from " + where + " on the TV, in place of the one there now?\n\n" + what + ".")) {
        return ioSay("Nothing changed.");
      }
      return (m.backup ? restorePictures(m) : Promise.resolve(m)).then(function (ready) {
        return commit(function (cats) {
          cats.splice.apply(cats, [0, cats.length].concat(ready.categories));
        }, ioSay).then(function (ok) {
          if (ok) ioSay("Done: the menu from " + where + " is on the TV. " + what.charAt(0).toUpperCase() + what.slice(1) + ".");
          return ok;
        });
      });
    }).then(function (ok) {
      if (ok && done) done();
    }).catch(function (e) {
      menuBusy = false;
      if (e.message !== "pin" && e.message !== "locked") ioSay(e.message || "That couldn't be read.");
    });
  }

  // A table pasted as text: Gemini's (| ID | ... |, with a line of dashes under the names), cells copied from a
  // spreadsheet (tabs between them), or CSV. Bold (**...**) around a whole cell is dropped.
  function readPasted(text) {
    var lines = String(text || "").replace(/\r/g, "").split("\n");
    if (!lines.some(function (l) { return /^\s*\|.*\|\s*$/.test(l); })) return readCsv(text);
    var rows = [];
    lines.forEach(function (l) {
      if (!/^\s*\|.*\|\s*$/.test(l)) return;
      var cells = l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) {
        return c.trim().replace(/^(\*\*|__)(.*)\1$/, "$2").trim();
      });
      if (cells.every(function (c) { return /^:?-{2,}:?$/.test(c); })) return;
      rows.push(cells);
    });
    return rows;
  }

  $("ioPaste").addEventListener("click", function () { $("pasteBox").hidden = false; $("ioPaste").hidden = true; $("pasteText").focus(); });
  $("pasteCancel").addEventListener("click", function () { $("pasteBox").hidden = true; $("ioPaste").hidden = false; $("pasteText").value = ""; });
  $("pasteUse").addEventListener("click", function () {
    if (!menu || menuBusy) return;
    var text = $("pasteText").value;
    if (!text.trim()) return ioSay("Paste a table in the box first.");
    importFrom(Promise.resolve(text).then(readPasted).then(readRows), "the pasted table", function () {
      $("pasteText").value = "";
      $("pasteBox").hidden = true;
      $("ioPaste").hidden = false;
    });
  });

  // Changes from a file to what's on the menu, by ID, after a yes: names, descriptions, prices, shown or hidden, on the TV or not.
  // Everything else stays; IDs that aren't on the menu are skipped and said.
  function applyChanges(m, where) {
    var found = [], missing = [], fields = [];
    m.changes.forEach(function (ch) { if (locate(menu.categories, ch.id)) found.push(ch); else missing.push(ch.row); });
    if (!found.length) return ioSay("None of the IDs in " + where + " is on the menu. Nothing changed.");
    var any = function (f) { return found.some(f); };
    if (any(function (c) { return Object.keys(c.note).length; })) fields.push("descriptions");
    if (any(function (c) { return Object.keys(c.name).length; })) fields.push("names");
    if (any(function (c) { return c.price != null; })) fields.push("prices");
    if (any(function (c) { return c.hidden != null; })) fields.push("what's on the menu");
    if (any(function (c) { return c.tv != null; })) fields.push("what's on the TV");
    if (!fields.length) return ioSay("That file has IDs but nothing to change for them. Nothing changed.");
    var what = fields.slice(0, -1).join(", ") + (fields.length > 1 ? " and " : "") + fields[fields.length - 1] + " of " + found.length +
      (found.length === 1 ? " thing" : " things") + " on the menu";
    var skipped = missing.length ? (missing.length === 1 ? "row " + missing[0] : "rows " + missing.join(", ")) + ": the ID isn't on the menu" : "";
    if (!window.confirm("Change the " + what + ", from " + where + "? Everything else stays as it is." +
        (skipped ? "\n\nSkipped, " + skipped + "." : ""))) {
      return ioSay("Nothing changed.");
    }
    return commit(function (cats) {
      found.forEach(function (ch) {
        var loc = locate(cats, ch.id);
        if (!loc) return;
        var n = loc.node, k;
        if (Object.keys(ch.name).length) { n.name = n.name || {}; for (k in ch.name) n.name[k] = ch.name[k]; }
        if (Object.keys(ch.note).length) { n.note = n.note || {}; for (k in ch.note) n.note[k] = ch.note[k]; }
        if (ch.price != null && !n.items) n.price = ch.price;        // items only: categories have items of their own
        if (ch.hidden === true) n.hidden = true;
        else if (ch.hidden === false) delete n.hidden;
        if (ch.tv === false && !n.items) n.tv = false;               // items only, like prices
        else if (ch.tv === true) delete n.tv;
      });
    }, ioSay).then(function (ok) {
      if (ok) ioSay("Done: the " + what + (skipped ? ". Skipped, " + skipped : "") + ".");
      return ok;
    });
  }

  // A backup's pictures, sent to the TV one by one; the menu then points at them by their new names
  function restorePictures(m) {
    var ids = Object.keys(m.pictures), done = {}, i = 0;
    menuBusy = true;
    return new Promise(function (ok) {
      (function next() {
        if (i >= ids.length) return ok();
        ioSay("Putting the pictures on the TV: " + (i + 1) + " of " + ids.length + "…");
        var p = m.pictures[ids[i]] || {};
        api("/api/menu/picture", "POST", { full: p.full || "", small: p.small || "" }).then(function (r) {
          if (r && r.ok) done[ids[i]] = r.id;
        }, function () {}).then(function () { i++; next(); });
      })();
    }).then(function () {
      menuBusy = false;
      var swap = function (n) { if (n.picture) { if (done[n.picture]) n.picture = done[n.picture]; else delete n.picture; } };
      m.categories.forEach(function (c) { swap(c); (c.items || []).forEach(swap); (c.subs || []).forEach(function (s) { swap(s); (s.items || []).forEach(swap); }); });
      return m;
    });
  }

  $("ioXlsx").addEventListener("click", function () { saveSheet("xlsx"); });
  $("ioCsv").addEventListener("click", function () { saveSheet("csv"); });
  $("ioBackup").addEventListener("click", saveBackup);
  $("ioFile").addEventListener("change", function () { var f = $("ioFile").files && $("ioFile").files[0]; $("ioFile").value = ""; if (f) importFile(f); });

  /* ---------- Saving ---------- */

  // What would be wrong on the TV, each marked at its setting: [{ key, msg }]
  function problems() {
    var bad = [];
    document.querySelectorAll(".field .err").forEach(function (e) { e.hidden = true; });
    function flag(key, msg) {
      var e = document.querySelector('.field[data-key="' + key + '"] .err');
      if (e) { e.textContent = msg; e.hidden = false; }
      bad.push({ key: key, msg: msg });
    }
    var hours = String(value("openHours") || "").trim();
    if (hours && !/^\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2}(\s*,\s*\d{1,2}[:.]\d{2}\s*-\s*\d{1,2}[:.]\d{2})*$/.test(hours)) {
      flag("openHours", "Write it like 10:00-02:00, or leave it empty.");
    }
    var p = String(value("controlPin") || "");
    if (p && !/^\d{4,8}$/.test(p)) flag("controlPin", "Use 4 to 8 digits, or leave it empty.");
    if (!String(value("playlist") || "").trim()) flag("playlist", "The TV needs a playlist.");
    if (typeof value("lat") !== "number" || Math.abs(value("lat")) > 90) flag("lat", "A number between -90 and 90, like 36.2549.");
    if (typeof value("lon") !== "number" || Math.abs(value("lon")) > 180) flag("lon", "A number between -180 and 180, like 44.8838.");
    return bad;
  }

  // A setting where it is: on the Screen tab, or on its page of the Settings tab, in the middle of the screen
  function goTo(key) {
    var f = fieldOf(key);
    if (!f) return;
    if (f.page === "screen") show("screen");
    else {
      if (view !== "settings") show("settings");
      openPage(f.page);
    }
    var box = document.querySelector('.field[data-key="' + key + '"]');
    if (box) box.scrollIntoView({ block: "center" });
  }

  $("discard").addEventListener("click", function () {
    var n = unsaved().length;
    if (!n || !window.confirm(n === 1 ? "Discard the change you haven't saved?" : "Discard the " + n + " changes you haven't saved?")) return;
    local = copy(saved);
    $("saveMsg").textContent = "";
    buildForm();
  });

  $("saveAll").addEventListener("change", function () {
    $("save").textContent = $("saveAll").checked ? "Save on every TV" : "Save on this TV";
  });

  $("save").addEventListener("click", function () {
    if (!data) return;
    var bad = problems();
    if (bad.length) {
      $("saveMsg").textContent = bad.length === 1 ? "Fix the marked setting first." : "Fix the " + bad.length + " marked settings first.";
      $("saveMsg").className = "bad";
      goTo(bad[0].key);
      return;
    }
    var all = !$("allBox").hidden && $("saveAll").checked, sent = copy(local);
    $("save").disabled = true;
    $("saveMsg").className = "";
    $("saveMsg").textContent = all ? "Saving on every TV…" : "Saving…";
    api("/api/settings?all=" + (all ? 1 : 0), "POST", { local: sent }).then(function (r) {
      if (r.pin && r.pin !== pin) {                 // this TV's PIN just changed: keep using it
        pin = r.pin;
        try { localStorage.setItem(KEY, pin); } catch (e) {}
      }
      var msg = "Saved on " + (r.tv || "this TV") + "." + (r.restarting ? " The app restarts on it to use the change." : "");
      (r.others || []).forEach(function (o) { msg += " " + o.name + ": " + o.result + "."; });
      saved = sent;
      $("saveMsg").textContent = "";
      $("saveAll").checked = false;
      $("save").textContent = "Save on this TV";
      updateSavebar();
      say(msg);
      loadSettings();
      setTimeout(poll, 400);
    }).catch(function (e) {
      if (e.message !== "pin" && e.message !== "locked") { $("saveMsg").textContent = "Couldn't save. Check the Wi-Fi and try again."; $("saveMsg").className = "bad"; }
      else $("saveMsg").textContent = "";
    }).then(function () { $("save").disabled = false; });
  });

  // Leaving the page (another TV, or closing it) with unsaved changes: the browser asks first
  window.addEventListener("beforeunload", function (e) {
    if (!data || !unsaved().length) return;
    e.preventDefault();
    e.returnValue = "";
  });

  document.querySelectorAll("[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () {
      var what = b.getAttribute("data-tool");
      if (what === "forget" && !window.confirm("This clears the shuffle history, the zooms and the list of songs that won't play on this TV. Settings stay. Continue?")) return;
      b.disabled = true;
      api("/api/cmd?do=" + what, "POST").then(function (r) {
        $("toolMsg").textContent = !r.ok ? "The TV couldn't do that right now." :
          what === "testmode" ? "Done: look at the TV." :
          what === "restart" ? "The app is restarting on the TV." :
          what === "checkupdate" ? "Looking for a new version. If there is one, Install update appears at the top within a minute." :
          what === "unlock" ? "Unlocked for 15 minutes: other apps and the box's settings can be opened. Then it locks again by itself." :
          what === "lock" ? "Locked again: only Twilight TV and the other app." :
          "This TV's memory is cleared. The music starts again.";
      }).catch(function () {}).then(function () { b.disabled = false; if (what === "unlock" || what === "lock") poll(); });
    });
  });

  // Back on this phone page from another TV's: the settings page that was open opens again
  try {
    var left = history.state || {};
    if (PAGES[left.page]) { show("settings"); openPage(left.page, true); }
    else if (left.editor) history.replaceState(null, "");
  } catch (e) {}

  poll();
})();
