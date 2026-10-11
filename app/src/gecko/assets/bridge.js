/* The link between the TV page and the app, for the version with Firefox's engine.
   Android's own engine lets the app hand the page a "TwilightApp" object; Firefox's
   doesn't, so this stands in for it. The page checks in with the app every second:
   what it's doing, and that it's alive. The app answers with new settings and with
   commands from the phone page. */
(function () {
  var boot = window.TWILIGHT_BOOT || {};
  var key = boot.k || "", settings = boot.s || "{}", version = boot.v || 0;
  var alive = false, infoSent = false, busy = false;

  window.TwilightApp = {
    settings: function () { return settings; },
    settingsVersion: function () { return version; },
    alive: function () { alive = true; }
  };

  function sync() {
    if (busy) return;
    busy = true;
    var tv = window.TwilightTV, body = { v: version, alive: alive };
    alive = false;
    if (tv) {
      try { body.status = tv.status(); } catch (e) {}
      if (!infoSent) { try { body.info = tv.settingsInfo(); } catch (e) {} }
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
      if (typeof r.s === "string" && r.v !== version) { settings = r.s; version = r.v; }
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
