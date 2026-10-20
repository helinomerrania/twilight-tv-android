(function () {
  "use strict";
  // [key, its own name, lang, direction]
  var LANGS = [["ku", "کوردی", "ckb", "rtl"], ["ar", "العربية", "ar", "rtl"], ["en", "English", "en", "ltr"]];
  var KEY = "twilight-menu-lang";
  var data = null, lang = "ku", spyOff = 0, lastFocus = null;
  var $ = function (id) { return document.getElementById(id); };
  var CUBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" ' +
    'stroke-linecap="round" d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4zM4 7.4l8 4.6 8-4.6M12 12v9.2"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // A name or note in the chosen language, else Kurdish, English, Arabic
  function pick(o) {
    if (!o) return "";
    return o[lang] || o.ku || o.en || o.ar || "";
  }

  // The café's numbers: "auto" = ١٢٣ with Kurdish and Arabic, 123 with English
  function easternDigits() {
    var n = String(data && data.numerals || "auto").toLowerCase();
    if (n === "kurdish" || n === "arabic") return true;
    if (n === "latin") return false;
    return lang !== "en";
  }

  function money(v) {
    var s = String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (easternDigits()) s = s.replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".charAt(Number(d)); }).replace(/,/g, "٬");
    return s;
  }

  function price(v) {
    var p = el("span", "pr");
    var n = el("bdi", null, money(v));
    p.appendChild(n);
    p.appendChild(el("span", "u", lang === "en" ? "IQD" : "د.ع"));
    return p;
  }

  function picture(id, small) { return "pics/" + encodeURIComponent(id) + (small ? ".small.jpg" : ".jpg"); }

  function img(src, size) {
    var i = el("img");
    i.src = src;
    i.alt = "";
    if (size) {
      i.width = size;
      i.height = size;
    }
    i.loading = "lazy";
    i.decoding = "async";
    return i;
  }

  // Every category, subcategory and item
  function each(fn) {
    (data.categories || []).forEach(function (c) {
      fn(c);
      (c.items || []).forEach(fn);
      (c.subs || []).forEach(function (s) { fn(s); (s.items || []).forEach(fn); });
    });
  }

  // The languages the menu is written in (a switch when there's more than one)
  function langsIn() {
    var has = {};
    each(function (n) { for (var k in n.name || {}) if (n.name[k]) has[k] = true; });
    return LANGS.filter(function (l) { return has[l[0]]; });
  }

  /* ---------- the room's light: the TV's colours ---------- */

  // The room as the TV paints its frame (frameColours in tv.js), from the colour of the song playing on it,
  // t = [hue, strength]; with no song, the TV's night blue with a little gold light
  function roomColours(t) {
    if (!t) return { top: [0x16, 0x1b, 0x49], end: [0x09, 0x0c, 0x27], glow: [232, 182, 104], alpha: 0.1 };
    var h = t[0], st = Math.max(0, Math.min(1, Number(t[1]) || 0)), sat = 0.25 + 0.4 * st;
    return { top: hslRgb(h, sat * 0.45, 0.115), end: hslRgb(h, sat * 0.4, 0.065),
             glow: hslRgb(h, Math.min(0.8, sat + 0.1), 0.5), alpha: 0.14 + 0.12 * st };
  }

  function hslRgb(h, s, l) {
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { var k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
  }

  function rgb(c, alpha) {
    var v = c.map(Math.round).join(", ");
    return alpha == null ? "rgb(" + v + ")" : "rgba(" + v + ", " + Number(alpha.toFixed(3)) + ")";
  }

  // The song's light from the top of the screen, over the room
  function roomPaint(c) {
    return "radial-gradient(120% 52% at 50% 0%, " + rgb(c.glow, c.alpha) + ", " + rgb(c.glow, c.alpha * 0.45) + " 45%, " + rgb(c.glow, 0) + " 100%), " +
      "radial-gradient(135% 90% at 50% 0%, " + rgb(c.top) + ", " + rgb(c.end) + " 74%)";
  }

  // The phone's own bar in the room's colour at the top
  function barColour(c) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", rgb(c.top.map(function (v, i) { return v + (c.glow[i] - v) * c.alpha * 0.6; })));
  }

  // The room in a song's colours, or with none: painted on the layer out of sight, which then fades in over the
  // other (or the other fades out from over it), as the TV does. The first layer is painted in the stylesheet.
  var roomKey = "null", roomLayer = "a";
  function light(t) {
    var key = JSON.stringify(t);
    if (key === roomKey) return;
    roomKey = key;
    roomLayer = roomLayer === "a" ? "b" : "a";
    var c = roomColours(t), root = document.documentElement;
    document.querySelector(".room ." + roomLayer).style.backgroundImage = roomPaint(c);
    root.classList.toggle("room-b", roomLayer === "b");
    root.setAttribute("data-tint", t ? t.join(" ") : "");
    root.style.setProperty("--room-top", rgb(c.top));             // for the glass of an item opened big
    root.style.setProperty("--room-end", rgb(c.end));
    barColour(c);
  }
  barColour(roomColours(null));

  function tintOf(t) {
    return t instanceof Array && typeof t[0] === "number" && typeof t[1] === "number" && isFinite(t[0]) && isFinite(t[1]) ? [t[0], t[1]] : null;
  }

  // What's playing on the TV now (its colour), every 8 seconds while the menu is on the phone's screen
  var nowWait = null, asking = false;
  function poll() {
    clearTimeout(nowWait);
    if (document.hidden || asking) return;
    asking = true;
    var ctl = window.AbortController ? new AbortController() : null, cut = setTimeout(function () { if (ctl) ctl.abort(); }, 6000);
    fetch("now", { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (d) {
      if (d && typeof d === "object") light(tintOf(d.tint));
    }).catch(function () {}).then(function () {
      clearTimeout(cut);
      asking = false;
      if (!document.hidden) nowWait = setTimeout(poll, 8000);
    });
  }
  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(nowWait); else poll(); });

  /* ---------- the menu ---------- */

  function load() {
    $("again").hidden = true;
    var slow = setTimeout(function () { $("ring").hidden = false; }, 400);
    fetch("data", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    }).then(function (d) {
      clearTimeout(slow);
      data = d || {};
      var have = langsIn(), saved = "";
      try { saved = localStorage.getItem(KEY) || ""; } catch (e) {}
      var codes = have.map(function (l) { return l[0]; });
      lang = codes.indexOf(saved) >= 0 ? saved : codes.indexOf("ku") >= 0 || !codes.length ? "ku" : codes[0];
      render();
    }).catch(function () {
      clearTimeout(slow);
      $("ring").hidden = true;
      $("again").hidden = false;
    });
  }
  $("again").addEventListener("click", load);

  function setLang(code) {
    lang = code;
    try { localStorage.setItem(KEY, code); } catch (e) {}
    var y = window.scrollY;
    render();
    window.scrollTo(0, y);
  }

  function render() {
    var l = LANGS.filter(function (x) { return x[0] === lang; })[0] || LANGS[0];
    document.documentElement.lang = l[2];
    document.documentElement.dir = l[3];
    var name = data.name || "Twilight", word = lang === "en" ? "Menu" : data.word || "";
    $("name").textContent = name;
    $("wordText").textContent = word;
    $("word").hidden = !word;
    $("fname").textContent = name;
    document.title = name;

    var have = langsIn(), box = $("langs");
    box.innerHTML = "";
    box.hidden = have.length < 2;
    have.forEach(function (x) {
      var b = el("button", null, x[1]);
      b.type = "button";
      b.lang = x[2];
      b.setAttribute("aria-pressed", String(x[0] === lang));
      b.addEventListener("click", function () { if (x[0] !== lang) setLang(x[0]); });
      box.appendChild(b);
    });

    var main = $("menu"), chips = $("chips");
    main.innerHTML = "";
    chips.innerHTML = "";
    var cats = data.categories || [];
    $("bar").hidden = cats.length < 2;
    $("foot").hidden = !cats.length;
    cats.forEach(function (c) {
      var sec = el("section");
      sec.id = "c-" + c.id;
      head(sec, "h2", c);
      if ((c.items || []).length) sec.appendChild(list(c.items, [c]));
      (c.subs || []).forEach(function (s) {
        head(sec, "h3", s, c.name);
        sec.appendChild(list(s.items || [], [c, s]));
      });
      main.appendChild(sec);

      var chip = el("button", null, pick(c.name));
      chip.type = "button";
      chip.dir = "auto";
      chip.setAttribute("data-to", sec.id);
      chip.addEventListener("click", function () { jump(sec, chip); });
      chips.appendChild(chip);
    });
    watchSections();
  }

  // A category's name, in gold
  function title(node) {
    var h = el("h2", null, pick(node.name));
    h.dir = "auto";
    return h;
  }

  // A subcategory's name after its category's (from): each in its own direction, the › between them in the
  // page's, so it points the way the page reads
  function subHeading(name, from) {
    var h = el("h3"), up = pick(from);
    if (up) {
      var f = el("span", "from", up), sep = el("span", "sep", "›");
      f.dir = "auto";
      sep.setAttribute("aria-hidden", "true");
      h.appendChild(f);
      h.appendChild(sep);
    }
    var own = el("span", "own", pick(name));
    own.dir = "auto";
    h.appendChild(own);
    return h;
  }

  // A category's (h2) or subcategory's (h3, with its category's name: from) name and description: on its picture,
  // or a heading of its own and the description under it when it has none
  function head(parent, tag, node, from) {
    var h = tag === "h3" ? subHeading(node.name, from) : title(node);
    if (node.picture) {
      var box = el("div", tag === "h2" ? "cover" : "cover sub"), pic = img(picture(node.picture, false)), cap = el("div", "cap");
      box.appendChild(pic);
      cap.appendChild(h);
      note(cap, node.note);
      box.appendChild(cap);
      parent.appendChild(box);
    } else {
      parent.appendChild(h);
      note(parent, node.note);
    }
  }

  function note(parent, o) {
    var t = pick(o);
    if (!t) return;
    var p = el("p", "note", t);
    p.dir = "auto";
    parent.appendChild(p);
  }

  // An item with a 3D model, from the project's models folder on GitHub (where the menu says it is)
  function has3d(it) { return !!(it.model && data && data.models); }

  // How a list shows, by what's in it: the pictures big when nearly every item has one; the names alone, with
  // the price once, when that's all there is and they cost the same (a hookah's flavours); else a line each
  function layout(items) {
    var pics = items.filter(function (it) { return it.picture; }).length;
    if (pics >= 2 && pics >= items.length * 0.6) return "tiles";
    var same = items.length >= 3 && items.every(function (it) { return !it.picture && !has3d(it) && !pick(it.note) && it.price === items[0].price; });
    return same ? "tags" : "rows";
  }

  // An item opens when tapped if there's more to see: its picture, its description, or it in 3D
  function opens(it) { return !!(it.picture || pick(it.note) || has3d(it)); }

  function list(items, path) {
    var how = layout(items);
    return how === "tiles" ? tiles(items, path) : how === "tags" ? tags(items) : rows(items, path);
  }

  // A line each: the picture small beside it (if any), the name, a dotted leader to the price, the start of the
  // description under them
  function rows(items, path) {
    var ul = el("ul", "items");
    items.forEach(function (it) {
      var more = opens(it);
      var li = el("li"), row = el(more ? "button" : "div", "row" + (it.picture ? " pic" : ""));
      if (more) {
        row.type = "button";
        row.addEventListener("click", function () { open(it, row, path); });
      }
      if (has3d(it)) {
        li.className = "has3d";
        li.appendChild(thumb3d(it));
      } else if (it.picture) {
        row.appendChild(img(picture(it.picture, true), 64));
      }
      var txt = el("span", "txt"), top = el("span", "top"), nm = el("span", "nm", pick(it.name));
      nm.dir = "auto";
      top.appendChild(nm);
      if (it.price != null) {
        top.appendChild(el("span", "dots"));
        top.appendChild(price(it.price));
      }
      txt.appendChild(top);
      var d = pick(it.note);
      if (d) {
        var ds = el("span", "ds", d);
        ds.dir = "auto";
        txt.appendChild(ds);
      }
      row.appendChild(txt);
      li.appendChild(row);
      ul.appendChild(li);
    });
    return ul;
  }

  /* ---------- 3D, and on the table (AR) ---------- */

  // Whether this phone can put a model on the table, as model-viewer itself decides: Android's Scene Viewer (not
  // in Firefox), or AR Quick Look on an iPhone or iPad. Elsewhere it's 3D on the screen only.
  var AR_HERE = (function () {
    var ua = navigator.userAgent || "";
    if (/android/i.test(ua)) return !/firefox|oculusbrowser/i.test(ua);
    if (/iPhone|iPad|iPod/.test(ua) && /CriOS\/|EdgiOS\/|FxiOS\/|GSA\/|DuckDuckGo\//.test(ua)) return true;
    try {
      var a = document.createElement("a");
      return !!(a.relList && a.relList.supports && a.relList.supports("ar"));
    } catch (e) { return false; }
  })();
  function word3d() { return AR_HERE ? "AR" : "3D"; }

  // The small chip on an item's picture: a cube, and AR (or 3D)
  function chip() {
    var c = el("span", "chip");
    c.innerHTML = CUBE;
    c.appendChild(el("span", null, word3d()));
    c.setAttribute("aria-hidden", "true");
    return c;
  }

  // The gold button: a cube, and words
  function goButton(words) {
    var b = el("button", "go3d");
    b.type = "button";
    b.innerHTML = CUBE;
    b.appendChild(el("span", null, words));
    return b;
  }

  // In a line: the item's picture small (or a gold cube when it has none), opening it in 3D
  function thumb3d(it) {
    var b = el("button", "thumb");
    b.type = "button";
    b.setAttribute("aria-label", pick(it.name) + ", " + word3d());
    if (it.picture) b.appendChild(img(picture(it.picture, true), 64));
    else {
      b.className += " bare";
      b.insertAdjacentHTML("beforeend", CUBE);
      b.lastChild.setAttribute("class", "cube");
    }
    b.appendChild(chip());
    b.addEventListener("click", function () { open3d(it, b); });
    return b;
  }

  // model-viewer (Google's, Apache 2.0), fetched only when someone opens an item in 3D: from jsDelivr, or unpkg
  // when that fails. The browser checks it's exactly the file it should be (integrity).
  var VIEWER = ["https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer-umd.min.js",
                "https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer-umd.min.js"];
  var VIEWER_SRI = "sha384-ARSuDHSQ5fZ1NNy5gpJdKkZxWqBGo3wUNMrQhzFGak5E+q6dfuTSoxRcEaQh5P3o";
  var viewerReady = null;
  function viewer() {
    if (!window.customElements) return Promise.reject(new Error("no custom elements"));
    if (window.customElements.get("model-viewer")) return Promise.resolve();
    if (viewerReady) return viewerReady;
    viewerReady = new Promise(function (ok, no) {
      var i = 0;
      (function next() {
        if (i >= VIEWER.length) {
          viewerReady = null;
          no(new Error("model-viewer"));
          return;
        }
        var s = document.createElement("script");
        s.src = VIEWER[i++];
        s.integrity = VIEWER_SRI;
        s.crossOrigin = "anonymous";
        s.referrerPolicy = "no-referrer";
        s.onload = function () { if (window.customElements.get("model-viewer")) ok(); else next(); };
        s.onerror = function () { if (s.parentNode) s.parentNode.removeChild(s); next(); };
        document.head.appendChild(s);
      })();
    });
    return viewerReady;
  }

  // One item in 3D, over the whole screen in the room's light: turned with a finger, and on the table with the
  // gold AR button where the phone can (model-viewer shows it only then). It closes with ×, Escape or Back.
  var v3 = null, v3From = null;
  function open3d(it, from) {
    if (!has3d(it)) return;
    v3From = from;
    $("v3Name").textContent = pick(it.name);
    $("view3d").hidden = false;
    document.documentElement.classList.add("v3");
    document.body.style.overflow = "hidden";
    try { if (!(history.state && history.state.v3)) history.pushState({ v3: true }, ""); } catch (e) {}
    $("v3Close").focus();
    show3d(it);
  }

  function show3d(it) {
    var job = { it: it };
    v3 = job;
    $("v3Stage").innerHTML = "";
    $("v3Fail").hidden = true;
    $("v3Wait").hidden = false;
    $("v3Bar").hidden = true;
    $("v3Fill").style.transform = "";
    viewer().then(function () {
      if (v3 !== job) return;
      var mv = document.createElement("model-viewer");
      var set = function (k, v) { mv.setAttribute(k, v == null ? "" : v); };
      set("src", data.models + encodeURIComponent(it.model));
      set("alt", pick(it.name));
      set("camera-controls");
      set("auto-rotate");
      set("rotation-per-second", "16deg");
      set("interaction-prompt", "auto");
      set("shadow-intensity", "1");
      set("shadow-softness", "0.9");
      set("ar");
      set("ar-modes", "webxr scene-viewer quick-look");
      var line = el("span");                         // the gold line along the top, in place of model-viewer's own
      line.setAttribute("slot", "progress-bar");
      mv.appendChild(line);
      var go = goButton("AR");
      go.setAttribute("slot", "ar-button");
      mv.appendChild(go);
      mv.addEventListener("progress", function (e) {
        if (v3 !== job) return;
        var p = Math.max(0, Math.min(1, Number(e.detail && e.detail.totalProgress) || 0));
        $("v3Bar").hidden = p >= 1;
        $("v3Fill").style.transform = "scaleX(" + p.toFixed(3) + ")";
      });
      mv.addEventListener("load", function () {
        if (v3 !== job) return;
        $("v3Wait").hidden = true;
        $("v3Bar").hidden = true;
      });
      mv.addEventListener("error", function () { if (v3 === job) failed3d(); });
      $("v3Stage").appendChild(mv);
    }, function () { if (v3 === job) failed3d(); });
  }

  // It couldn't be had (no internet, or no such model): a cloud crossed out, and try again
  function failed3d() {
    $("v3Stage").innerHTML = "";
    $("v3Wait").hidden = true;
    $("v3Bar").hidden = true;
    $("v3Fail").hidden = false;
  }
  $("v3Again").addEventListener("click", function () { if (v3) show3d(v3.it); });

  // fromHistory: the phone's Back button closed it (else its place in the history goes too)
  function shut3d(fromHistory) {
    if ($("view3d").hidden) return;
    v3 = null;
    $("view3d").hidden = true;
    $("v3Stage").innerHTML = "";                     // the model goes, and the memory it took
    document.documentElement.classList.remove("v3");
    if ($("sheet").hidden) document.body.style.overflow = "";
    try { if (fromHistory !== true && history.state && history.state.v3) history.back(); } catch (e) {}
    if (v3From) v3From.focus();
  }
  $("v3Close").addEventListener("click", shut3d);

  // The pictures big: a tile each, its name and price under the picture (no picture: its first letter, or a cube
  // for one in 3D), and the chip on it for 3D
  function tiles(items, path) {
    var ul = el("ul", "tiles");
    items.forEach(function (it) {
      var li = el("li"), more = opens(it), t = el(more ? "button" : "div", "tile"), ph = el("span", "ph");
      if (more) {
        t.type = "button";
        t.addEventListener("click", function () { open(it, t, path); });
      }
      if (it.picture) {
        ph.appendChild(img(picture(it.picture, true)));
      } else if (has3d(it)) {
        ph.insertAdjacentHTML("beforeend", CUBE);
        ph.lastChild.setAttribute("class", "cube");
      } else {
        var first = Array.from ? Array.from(pick(it.name).trim())[0] : pick(it.name).trim().charAt(0);
        var ini = el("span", "ini", first || "");
        ini.setAttribute("aria-hidden", "true");
        ph.appendChild(ini);
      }
      t.appendChild(ph);
      var tt = el("span", "tt"), nm = el("span", "nm", pick(it.name));
      nm.dir = "auto";
      tt.appendChild(nm);
      if (it.price != null) tt.appendChild(price(it.price));
      t.appendChild(tt);
      li.appendChild(t);
      if (has3d(it)) {
        var s = el("button", "see3d");
        s.type = "button";
        s.setAttribute("aria-label", pick(it.name) + ", " + word3d());
        s.appendChild(chip());
        s.addEventListener("click", function () { open3d(it, s); });
        li.appendChild(s);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  // The names together, in two columns, under their one price: a dotted line to it, as on every line
  function tags(items) {
    var box = el("div", "flavors");
    if (items[0].price != null) {
      var once = el("div", "each");
      once.appendChild(el("span", "dots"));
      once.appendChild(price(items[0].price));
      box.appendChild(once);
    }
    var ul = el("ul", "tags");
    items.forEach(function (it) {
      var li = el("li", null, pick(it.name));
      li.dir = "auto";
      ul.appendChild(li);
    });
    box.appendChild(ul);
    return box;
  }

  /* ---------- the categories along the top ---------- */

  var lineSec = null, atEnd = false, watchers = [], resizeWait = null;
  var smooth = function () { return !window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function jump(sec, chipButton) {
    spyOff = Date.now() + 900;                       // while the page glides there, the chips stay as tapped
    mark(chipButton);
    sec.scrollIntoView({ behavior: smooth() ? "smooth" : "auto", block: "start" });
    setTimeout(lit, 950);
  }

  // A chip lit, and brought to the middle of the bar. Only the bar moves: asking the browser to bring the
  // chip into view would also nudge the page, as the bar sits in the space kept clear at its top.
  function mark(chipButton) {
    var all = $("chips").children;
    for (var i = 0; i < all.length; i++) all[i].setAttribute("aria-current", String(all[i] === chipButton));
    if (!chipButton) return;
    var bar = $("chips"), c = chipButton.getBoundingClientRect(), b = bar.getBoundingClientRect();
    var by = Math.round(c.left + c.width / 2 - (b.left + b.width / 2));
    if (Math.abs(by) > 1) {
      try { bar.scrollBy({ left: by, behavior: smooth() ? "smooth" : "auto" }); } catch (e) { bar.scrollLeft += by; }
    }
  }

  // Which category is on screen: the one crossing a line just under the bar, or at the very end of the page
  // the last one (a short one never gets that far up). The browser says when that changes, off to one side:
  // nothing is measured while the page scrolls.
  function watchSections() {
    watchers.forEach(function (w) { w.disconnect(); });
    watchers = [];
    lineSec = null;
    atEnd = false;
    if ($("bar").hidden || !window.IntersectionObserver) return;
    var line = $("bar").offsetHeight + 24, below = Math.max(0, window.innerHeight - line - 1);
    var onLine = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) lineSec = e.target;
        else if (lineSec === e.target) lineSec = null;
      });
      lit();
    }, { rootMargin: -line + "px 0px " + -below + "px 0px" });
    document.querySelectorAll("main section").forEach(function (sec) { onLine.observe(sec); });
    var end = new IntersectionObserver(function (entries) { atEnd = entries[entries.length - 1].isIntersecting; lit(); });
    end.observe($("end"));
    watchers = [onLine, end];
  }
  window.addEventListener("resize", function () {     // a phone's address bar coming and going changes the height
    clearTimeout(resizeWait);
    resizeWait = setTimeout(watchSections, 200);
  });

  function lit() {
    if (Date.now() < spyOff || $("bar").hidden) return;
    var secs = document.querySelectorAll("main section");
    if (!secs.length) return;
    var on = atEnd && window.scrollY > 0 ? secs[secs.length - 1] : lineSec || secs[0];
    var c = document.querySelector('#chips [data-to="' + on.id + '"]');
    if (c && c.getAttribute("aria-current") !== "true") mark(c);
  }

  /* ---------- one item, bigger ---------- */

  // Glass from the bottom: its picture, where it is on the menu, its name, its description, its price and, for
  // one in 3D, the gold button. It closes with ×, a tap outside it, Escape, the
  // phone's Back button, or pulled down.
  function open(it, from, path) {
    lastFocus = from;
    var sheet = $("sheet"), card = el("div", "card");
    card.tabIndex = -1;                              // focused when it opens, for screen readers (× is next)
    sheet.innerHTML = "";
    card.appendChild(el("span", "grab"));
    var x = el("button", "close");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    x.addEventListener("click", shut);
    card.appendChild(x);
    if (it.picture) {
      var pic = el("img");
      pic.src = picture(it.picture, false);
      pic.alt = pick(it.name);
      card.appendChild(pic);
    } else {
      card.classList.add("bare");
    }
    var body = el("div", "body");
    var where = (path || []).map(function (n) { return pick(n.name); }).filter(Boolean);
    if (where.length) {
      var p = el("p", "path");
      where.forEach(function (w, i) {
        if (i) {
          var sep = el("span", "sep", " › ");
          sep.setAttribute("aria-hidden", "true");
          p.appendChild(sep);
        }
        var s = el("span", null, w);
        s.dir = "auto";
        p.appendChild(s);
      });
      body.appendChild(p);
    }
    var h = el("h2", null, pick(it.name));
    h.dir = "auto";
    h.id = "sheetName";
    body.appendChild(h);
    note(body, it.note);
    if (it.price != null || has3d(it)) {
      var act = el("div", "act");
      act.appendChild(it.price != null ? price(it.price) : el("span"));
      if (has3d(it)) {
        var go = goButton(word3d());
        go.addEventListener("click", function () { open3d(it, go); });
        act.appendChild(go);
      }
      body.appendChild(act);
    }
    card.appendChild(body);
    sheet.appendChild(card);
    sheet.setAttribute("aria-labelledby", "sheetName");
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    pullToClose(card);
    try { if (!(history.state && history.state.item)) history.pushState({ item: true }, ""); } catch (e) {}
    card.focus();
  }

  // fromHistory: the phone's Back button closed it (else its place in the history goes too)
  function shut(fromHistory) {
    if ($("sheet").hidden) return;
    $("sheet").hidden = true;
    $("sheet").innerHTML = "";
    document.body.style.overflow = "";
    try { if (fromHistory !== true && history.state && history.state.item) history.back(); } catch (e) {}
    if (lastFocus) lastFocus.focus();
  }
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) shut(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("view3d").hidden) shut3d();
    else if (!$("sheet").hidden) shut();
  });
  // Back: from 3D to the item (if it was opened from there), from the item to the menu
  window.addEventListener("popstate", function () {
    var st = history.state || {};
    if (!st.v3) shut3d(true);
    if (!st.v3 && !st.item) shut(true);
  });
  try { if (history.state && (history.state.item || history.state.v3)) history.replaceState(null, ""); } catch (e) {}   // (back here from elsewhere)

  // Pulled down from its top, the sheet follows the finger; far enough, and it goes
  function pullToClose(card) {
    var y0 = null, dy = 0;
    card.addEventListener("touchstart", function (e) {
      y0 = card.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      dy = 0;
    }, { passive: true });
    card.addEventListener("touchmove", function (e) {
      if (y0 == null) return;
      dy = Math.max(0, e.touches[0].clientY - y0);
      card.style.transform = dy ? "translateY(" + dy + "px)" : "";
    }, { passive: true });
    card.addEventListener("touchend", function () {
      if (y0 == null) return;
      y0 = null;
      if (dy > 110) {
        card.classList.add("going");
        card.style.transform = "translateY(100%)";
        setTimeout(shut, 200);
      } else {
        card.classList.add("going");
        card.style.transform = "";
        setTimeout(function () { card.classList.remove("going"); }, 230);
      }
    });
  }

  load();
  poll();
})();
