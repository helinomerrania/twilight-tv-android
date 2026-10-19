/* The link between the TV page and the app. Firefox's engine has no way for the app to
   hand the page an object, so this stands in for it. The page checks in with the app
   every second: what it's doing, that it's alive, and (when they change) its songs. The
   app answers with new settings, the phone page's commands and, when they change, the
   "extras": song names, the weather and the café's pictures. */
(function () {
  var boot = window.TWILIGHT_BOOT || {};
  var key = boot.k || "", settings = boot.s || "{}", version = boot.v || 0;
  var extras = typeof boot.x === "string" ? boot.x : "{}", extrasVersion = boot.xv || 0;
  var alive = false, infoSent = false, busy = false, idsSent = "";

  window.TwilightApp = {
    settings: function () { return settings; },
    settingsVersion: function () { return version; },
    extras: function () { return extras; },
    extrasVersion: function () { return extrasVersion; },
    alive: function () { alive = true; }
  };

  function sync() {
    if (busy) return;
    busy = true;
    var tv = window.TwilightTV, body = { v: version, xv: extrasVersion, alive: alive }, ids = "";
    alive = false;
    if (tv) {
      try { body.status = tv.status(); } catch (e) {}
      if (!infoSent) { try { body.info = tv.settingsInfo(); } catch (e) {} }
      try { ids = tv.songIds ? JSON.stringify(tv.songIds()) : ""; } catch (e) {}
      if (ids && ids !== "[]" && ids !== idsSent) body.ids = JSON.parse(ids);   // once the playlist is in, and when it changes
    }
    var x = new XMLHttpRequest();
    x.open("POST", "/tv/sync?k=" + encodeURIComponent(key), true);
    x.setRequestHeader("Content-Type", "application/json; charset=utf-8");
    x.timeout = 4000;
    x.onloadend = function () { busy = false; };
    x.onload = function () {
      if (x.status !== 200) return;
      var r;
      try { r = JSON.parse(x.responseText); } catch (e) { return; }
      if (body.info) infoSent = true;
      if (body.ids) idsSent = ids;
      if (typeof r.s === "string" && r.v !== version) { settings = r.s; version = r.v; }
      if (typeof r.x === "string" && r.xv !== extrasVersion) { extras = r.x; extrasVersion = r.xv; }
      var cmds = r.cmds || [];
      for (var i = 0; i < cmds.length; i++) {
        try { if (window.TwilightTV) window.TwilightTV.command(cmds[i]); } catch (e) {}
      }
    };
    try { x.send(JSON.stringify(body)); } catch (e) { busy = false; }
  }

  setTimeout(sync, 300);
  setInterval(sync, 1000);
})();
