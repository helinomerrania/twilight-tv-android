(function () {
  "use strict";
  // [key, its own name, lang, direction]
  var LANGS = [["ku", "کوردی", "ckb", "rtl"], ["ar", "العربية", "ar", "rtl"], ["en", "English", "en", "ltr"]];
  var KEY = "twilight-menu-lang";
  var data = null, lang = "ku", spyOff = 0, lastFocus = null;
  var $ = function (id) { return document.getElementById(id); };

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
    $("word").textContent = word;
    $("word").hidden = !word;
    document.title = name + (word ? " · " + word : "");

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
    cats.forEach(function (c) {
      var sec = el("section");
      sec.id = "c-" + c.id;
      head(sec, "h2", c);
      if ((c.items || []).length) sec.appendChild(list(c.items));
      (c.subs || []).forEach(function (s) {
        head(sec, "h3", s, c.name);
        sec.appendChild(list(s.items || []));
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

  function heading(tag, name) {
    var h = el(tag, null, pick(name));
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
    var h = tag === "h3" ? subHeading(node.name, from) : heading(tag, node.name);
    if (node.picture) {
      var box = el("div", tag === "h2" ? "cover" : "cover sub"), img = el("img"), cap = el("div", "cap");
      img.src = picture(node.picture, false);
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      box.appendChild(img);
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

  // The items: each one's name and price, its picture small beside them. One with a picture or a description
  // opens when tapped, to show them.
  function list(items) {
    var ul = el("ul", "items");
    items.forEach(function (it) {
      var more = !!(it.picture || pick(it.note));
      var li = el("li"), row = el(more ? "button" : "div", "row" + (it.picture ? " pic" : ""));
      if (more) {
        row.type = "button";
        row.addEventListener("click", function () { open(it, row); });
      }
      if (it.picture) {
        var img = el("img");
        img.src = picture(it.picture, true);
        img.alt = "";
        img.width = 64;
        img.height = 64;
        img.loading = "lazy";
        img.decoding = "async";
        row.appendChild(img);
      }
      var txt = el("span", "txt"), top = el("span", "top"), nm = el("span", "nm", pick(it.name));
      nm.dir = "auto";
      top.appendChild(nm);
      if (it.price != null) top.appendChild(price(it.price));
      txt.appendChild(top);
      row.appendChild(txt);
      li.appendChild(row);
      ul.appendChild(li);
    });
    return ul;
  }

  /* ---------- the categories along the top ---------- */

  var lineSec = null, atEnd = false, watchers = [], resizeWait = null;
  var smooth = function () { return !window.matchMedia || !window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function jump(sec, chip) {
    spyOff = Date.now() + 900;                       // while the page glides there, the chips stay as tapped
    mark(chip);
    sec.scrollIntoView({ behavior: smooth() ? "smooth" : "auto", block: "start" });
    setTimeout(lit, 950);
  }

  // A chip lit, and brought to the middle of the bar. Only the bar moves: asking the browser to bring the
  // chip into view would also nudge the page, as the bar sits in the space kept clear at its top.
  function mark(chip) {
    var all = $("chips").children;
    for (var i = 0; i < all.length; i++) all[i].setAttribute("aria-current", String(all[i] === chip));
    if (!chip) return;
    var bar = $("chips"), c = chip.getBoundingClientRect(), b = bar.getBoundingClientRect();
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
    var chip = document.querySelector('#chips [data-to="' + on.id + '"]');
    if (chip && chip.getAttribute("aria-current") !== "true") mark(chip);
  }

  /* ---------- one item, bigger ---------- */

  function open(it, from) {
    lastFocus = from;
    var sheet = $("sheet"), card = el("div", "card");
    sheet.innerHTML = "";
    var x = el("button", "close");
    x.type = "button";
    x.setAttribute("aria-label", "Close");
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    x.addEventListener("click", shut);
    card.appendChild(x);
    if (it.picture) {
      var img = el("img");
      img.src = picture(it.picture, false);
      img.alt = pick(it.name);
      card.appendChild(img);
    } else {
      card.classList.add("bare");
    }
    var body = el("div", "body");
    var h = el("h2", null, pick(it.name));
    h.dir = "auto";
    h.id = "sheetName";
    body.appendChild(h);
    note(body, it.note);
    if (it.price != null) body.appendChild(price(it.price));
    card.appendChild(body);
    sheet.appendChild(card);
    sheet.setAttribute("aria-labelledby", "sheetName");
    sheet.hidden = false;
    document.body.style.overflow = "hidden";
    x.focus();
  }

  function shut() {
    $("sheet").hidden = true;
    $("sheet").innerHTML = "";
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  $("sheet").addEventListener("click", function (e) { if (e.target === $("sheet")) shut(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("sheet").hidden) shut(); });

  load();
})();
