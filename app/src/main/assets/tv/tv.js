(function () {
  "use strict";

  // Inside the Android app, settings.json from GitHub and the settings made on the
  // phone page override SETTINGS above. The built-in values are kept as defaults.
  var DEFAULTS = JSON.parse(JSON.stringify(SETTINGS));
  var APP = null, appSettingsVersion = 0, pendingRestart = false, settingsCheckAt = 0;
  try { APP = window.TwilightApp || null; } catch (e) {}

  function applySettings(extra) {
    var k;
    for (k in SETTINGS) if (Object.prototype.hasOwnProperty.call(SETTINGS, k)) delete SETTINGS[k];
    for (k in DEFAULTS) SETTINGS[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
    for (k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k) && k.charAt(0) !== "_") SETTINGS[k] = extra[k];
    }
  }

  function appSettings() {
    try { return JSON.parse(APP.settings() || "{}") || {}; } catch (e) { return {}; }
  }

  if (APP) {
    applySettings(appSettings());
    try { appSettingsVersion = Number(APP.settingsVersion()) || 0; } catch (e) {}
  }

  var S = SETTINGS;
  // The playlist: ?list= in the page's address (for testing), else the one for this time of day
  var URL_LIST = new URLSearchParams(location.search).get("list");
  var LIST = playlistId(URL_LIST || scheduledList());
  var KEY = "tv-player:" + LIST;
  var DAY = 24 * 3600e3;
  var ENDED = 0, PLAYING = 1, PAUSED = 2, BUFFERING = 3, CUED = 5;   // YouTube player states

  var player = null, ready = false;
  var allIds = [];          // every video in the playlist
  var queue = [];           // shuffled order for the rest of this round
  var current = null;       // the song on screen now
  var started = false;      // the song's own picture has started moving
  var guarded = false;      // loading or an ad: picture off (and, with blockAds, sound off)
  var fadingOut = false;    // the song is fading out at its end
  var muted = false;        // the TV's browser refuses sound until someone taps
  var autoplayDead = false; // the browser blocks even silent video until someone taps
  var level = 0, levelTimer = null;     // sound fade level, 0 = silent, 1 = full
  var showAt = Infinity, needHold = false, pictureMode = "", fadeStartedAt = 0;
  var picEnding = false, picFadeSecs = 0;   // café screen over the song's last seconds
  var lastState = -1, leftPlayingAt = 0, lastSentMute = null, lastSentVol = -1, resyncAt = 0;
  var soundSetAt = 0, soundFixes = 0, soundFixAt = 0, soundCheckOff = false;   // the player's sound kept as set (checkSound)
  var adSince = 0, adSkips = 0, adsSkipped = 0, adPauseUntil = 0, soundTriedAt = 0, volTimer = null;
  var reloading = false, noteShown = false;
  var loadedAt = Date.now(), lastSwitch = 0, lastMove = Date.now(), lastTime = -1, lastKick = 0;
  var strikes = 0, oddErrors = 0, skipTimer = null, lastW = -1, lastH = -1;
  var DEBUG = /[?&]debug=1(&|$)/.test(location.search);
  // Quality setup (started from the phone page): YouTube's own controls on screen, so
  // staff can pick the highest quality in YouTube's menu. YouTube remembers it on this TV.
  var SETUP = /[?&]setup=quality(&|$)/.test(location.search), setupPaused = false;
  var source = "", quality = "", skipped = [], renderW = 0, renderH = 0;   // for test mode
  var BAR_CHECK = 1;        // version of the black-bar check; a new one looks at every song again
  var quiet = "";           // "" = music on, "closed" = outside opening hours, "paused" = paused from the phone
  var quietSince = 0, holdUntil = 0, openAnywayUntil = 0, scheduleAt = 0, aliveAt = 0;
  var quietUntil = 0, duck = 1;              // "Quiet for a minute" from the phone: the music lower until then
  var tempVol = null;                        // {id, v}: this song louder or quieter from the remote, until it ends
  var prayerUntil = 0, prayerName = "", prayerSkip = "";   // the call to prayer's pause ("resume" skips this one)
  var lookDay = "", lookUntil = 0;           // a special day's look, shown from the phone for a moment
  var state = load();

  // From the app: song names (YouTube), the weather (MET Norway), the café's pictures
  var X = {}, extrasVersion = -1, pictureList = [], singerCache = {}, busyChannelList = null;
  var softDraw = false;                          // the app says Firefox's engine draws on the box's processor
  // The info panel and the café screen's messages and pictures
  var frameBox = null, frameKey = "", frameLayer = "a";   // the video card, and the colours on it (syncColours)
  // Where the slides between songs had got to (the café's own and the menu's turns): a restart carries on from there
  var SLIDES = "tv-slides", slidesWere = savedSlides();
  var panelOn = false, panelDirty = true, drawn = {}, slideIdx = slidesWere.s, slideAt = 0, slideShown = "name:", slideTimer = null;
  var prepared = null, menuTurn = slidesWere.m, pictureAt = 0;   // the next slide, made before its turn; the menu's turn; when the picture last changed

  // The words on the TV. Each can be replaced in the labels setting (e.g. with Kurdish ones).
  // "locale" sets how dates are written (e.g. "ckb" for Kurdish); a right-to-left one mirrors the screen.
  var LABELS = {
    locale: "en-GB",
    // Optional, for a language the TV's engine may not know: names separated by commas, Sunday first
    weekdays: "", months: "", hijriMonths: "",
    // The Kurdish calendar's months, Xakelêwe (from Newroz) first; none = no Kurdish date
    kurdishMonths: "",
    nowPlaying: "Now playing", upNext: "Up next",
    menu: "Menu", menuHint: "Scan for the menu",
    wifi: "Wi-Fi", wifiPassword: "Password",
    prices: "Gold and currency prices",
    goldOunce: "Gold", silverOunce: "Silver", perOunce: "per ounce", bitcoin: "Bitcoin", pound: "Pound sterling",
    am: "AM", pm: "PM",
    // MET Norway's data is free on the condition that it's credited where it's shown (WeatherAPI.com's isn't)
    weatherCredit: "MET Norway",
    prayerNote: "The music resumes after the call to prayer",
    prayerBand: "Paused for the call to prayer",
    newroz: "Happy Newroz", eidFitr: "Eid Mubarak", eidAdha: "Eid Mubarak", barat: "Blessed Barat Night", newYear: "Happy New Year",
    clear: "Clear", fair: "Fair", partlycloudy: "Partly cloudy", cloudy: "Cloudy", fog: "Fog", lightrain: "Light rain",
    rain: "Rain", heavyrain: "Heavy rain", sleet: "Sleet", snow: "Snow", thunder: "Thunderstorm"
  };
  var DAYS = { newroz: 1, eidFitr: 1, eidAdha: 1, barat: 1, newYear: 1 };
  var PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"], prayerDay = "", prayerToday = [], prayerFrom = "", hijriMemo = {}, kurdishMemo = {};
  // Words around a song's name that aren't its name: "(Official Video)", "[4K]", "(Lyrics)"...
  var NOISE = /\s*[(\[{\u3010][^)\]}\u3011]*\b(official|video|audio|lyrics?|clip|klip|music|hd|hq|4k|8k|1080p|live|remaster(ed)?|visuali[sz]er|exclusive|new|full|karaoke)\b[^)\]}\u3011]*[)\]}\u3011]/gi;
  // Units: the dollar's price is in dinars; the toman, lira, riyal, dirham and Jordanian dinar are so many
  // for 100 dollars (PER_100: a small "100$" label beside their names); the other currencies, so many
  // dollars. And the currencies' English names.
  var UNITS = { ku: { us: "د.ع", ir: "تمەن", tr: "لیرە", sa: "ڕیاڵ", ae: "درهەم", jo: "دینار" },
                en: { us: "IQD", ir: "toman", tr: "lira", sa: "riyal", ae: "dirham", jo: "dinar" } };
  var PER_100 = { ir: 1, tr: 1, sa: 1, ae: 1, jo: 1 };
  var NAME_LABELS = { gb: "pound" };             // currencies whose name is one of the words on the TV
  // The café screen's pictures (looks/): the café's, the special days' (both Eids share one), and the
  // plain one, with no words on it, for the TV's own words. Built into the app; the café can put its
  // own in from the phone (the app serves those in their place)
  var LOOKS = { cafe: "cafe", plain: "plain", newroz: "newroz", eidFitr: "eid", eidAdha: "eid", barat: "barat", newYear: "newyear" };
  var HIJRI_EN = ["Muharram", "Safar", "Rabiʻ I", "Rabiʻ II", "Jumada I", "Jumada II", "Rajab", "Shaʻban", "Ramadan", "Shawwal",
                  "Dhuʻl-Qiʻdah", "Dhuʻl-Hijjah"];
  var CURRENCIES = { us: "US dollar", eu: "Euro", gb: "Pound sterling", ir: "Iranian toman", tr: "Turkish lira", sa: "Saudi riyal",
                     ae: "UAE dirham", jo: "Jordanian dinar", ca: "Canadian dollar", ch: "Swiss franc", se: "Swedish krona",
                     no: "Norwegian krone", dk: "Danish krone", au: "Australian dollar" };
  var TRENDS = { "1": ["up", "M6.5 0L13 10H0Z"], "-1": ["down", "M0 0H13L6.5 10Z"] };

  // Meteocons by Bas Milius (MIT license), made still: nothing moves, for the TV box's graphics chip
  var ICONS = {"clear-day":"<defs><linearGradient id=\"§a\" x1=\"26.75\" x2=\"37.25\" y1=\"22.91\" y2=\"41.09\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><circle cx=\"32\" cy=\"32\" r=\"10.5\" fill=\"url(#§a)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"3\" d=\"M32 15.71V9.5m0 45v-6.21m11.52-27.81l4.39-4.39M16.09 47.91l4.39-4.39m0-23l-4.39-4.39m31.82 31.78l-4.39-4.39M15.71 32H9.5m45 0h-6.21\"/>","clear-night":"<defs><linearGradient id=\"§a\" x1=\"21.92\" x2=\"38.52\" y1=\"18.75\" y2=\"47.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient></defs><path fill=\"url(#§a)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M46.66 36.2a16.66 16.66 0 01-16.78-16.55 16.29 16.29 0 01.55-4.15A16.56 16.56 0 1048.5 36.1c-.61.06-1.22.1-1.84.1z\"/>","partly-cloudy-day":"<defs><linearGradient id=\"§a\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§a)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/>","partly-cloudy-night":"<defs><linearGradient id=\"§a\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient></defs><path fill=\"url(#§a)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/>","cloudy":"<defs><linearGradient id=\"§a\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient></defs><path fill=\"url(#§a)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\" transform=\"translate(0 0)\"/>","fog":"<defs><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"27.5\" x2=\"36.5\" y1=\"50.21\" y2=\"65.79\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#d4d7dd\"/><stop offset=\".45\" stop-color=\"#d4d7dd\"/><stop offset=\"1\" stop-color=\"#bec1c6\"/></linearGradient><linearGradient id=\"§c\" y1=\"44.21\" y2=\"59.79\" href=\"#§a\"/></defs><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"3\" d=\"M17 58h30\" transform=\"translate(0 0)\"/><path fill=\"none\" stroke=\"url(#§c)\" stroke-linecap=\"round\" stroke-width=\"3\" d=\"M17 52h30\" transform=\"translate(0 0)\"/>","drizzle":"<defs><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"23.31\" x2=\"24.69\" y1=\"44.3\" y2=\"46.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§c\" x1=\"30.31\" x2=\"31.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"37.31\" x2=\"38.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§a\"/></defs><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§c)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.08 45.01l-.16.98\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.08 45.01l-.16.98\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"#4286ee\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.08 45.01l-.16.98\" transform=\"translate(-1.5 7.5)\"/>","rain":"<defs><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"22.53\" x2=\"25.47\" y1=\"42.95\" y2=\"48.05\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§c\" x1=\"29.53\" x2=\"32.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"36.53\" x2=\"39.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/></defs><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.39 43.03l-.78 4.94\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§c)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.39 43.03l-.78 4.94\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.39 43.03l-.78 4.94\" transform=\"translate(-1.5 7.5)\"/>","sleet":"<defs><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§d\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§b\" x1=\"23.31\" x2=\"24.69\" y1=\"44.3\" y2=\"46.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§g\" x1=\"30.31\" x2=\"31.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§b\"/><linearGradient id=\"§h\" x1=\"37.31\" x2=\"38.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§b\"/></defs><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(-0.33 6)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§a)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§e)\"/><path fill=\"none\" stroke=\"url(#§f)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><path fill=\"none\" stroke=\"url(#§b)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.08 45.01l-.16.98\" transform=\"translate(-1.5 7.5)\"/><path fill=\"none\" stroke=\"url(#§g)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.08 45.01l-.16.98\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.08 45.01l-.16.98\" transform=\"translate(-1.8 9)\"/>","snow":"<defs><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"30.12\" x2=\"31.88\" y1=\"43.48\" y2=\"46.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§c\" x1=\"29.67\" x2=\"32.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/></defs><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(0.33 6)\"><circle cx=\"31\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§a)\"/><path fill=\"none\" stroke=\"url(#§c)\" stroke-linecap=\"round\" d=\"M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§d)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.5 7.5)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§f)\"/><path fill=\"none\" stroke=\"url(#§g)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g>","partly-cloudy-day-drizzle":"<defs><linearGradient id=\"§b\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"23.31\" x2=\"24.69\" y1=\"44.3\" y2=\"46.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§d\" x1=\"30.31\" x2=\"31.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"37.31\" x2=\"38.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§a\"/></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§b)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.08 45.01l-.16.98\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.08 45.01l-.16.98\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.08 45.01l-.16.98\" transform=\"translate(-1.5 7.5)\"/>","partly-cloudy-night-drizzle":"<defs><linearGradient id=\"§b\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"23.31\" x2=\"24.69\" y1=\"44.3\" y2=\"46.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§d\" x1=\"30.31\" x2=\"31.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"37.31\" x2=\"38.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§a\"/></defs><path fill=\"url(#§b)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.08 45.01l-.16.98\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.08 45.01l-.16.98\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.08 45.01l-.16.98\" transform=\"translate(-1.5 7.5)\"/>","partly-cloudy-day-rain":"<defs><linearGradient id=\"§b\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"22.53\" x2=\"25.47\" y1=\"42.95\" y2=\"48.05\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§d\" x1=\"29.53\" x2=\"32.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"36.53\" x2=\"39.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§b)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.39 43.03l-.78 4.94\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.39 43.03l-.78 4.94\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.39 43.03l-.78 4.94\" transform=\"translate(-1.5 7.5)\"/>","partly-cloudy-night-rain":"<defs><linearGradient id=\"§b\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"22.53\" x2=\"25.47\" y1=\"42.95\" y2=\"48.05\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§d\" x1=\"29.53\" x2=\"32.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"36.53\" x2=\"39.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/></defs><path fill=\"url(#§b)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.39 43.03l-.78 4.94\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.39 43.03l-.78 4.94\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.39 43.03l-.78 4.94\" transform=\"translate(-1.5 7.5)\"/>","partly-cloudy-day-sleet":"<defs><linearGradient id=\"§c\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§d\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§e\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§b\" x1=\"23.31\" x2=\"24.69\" y1=\"44.3\" y2=\"46.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§h\" x1=\"30.31\" x2=\"31.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§b\"/><linearGradient id=\"§i\" x1=\"37.31\" x2=\"38.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§b\"/></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§c)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§d)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(-0.33 6)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§a)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§f)\"/><path fill=\"none\" stroke=\"url(#§g)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><path fill=\"none\" stroke=\"url(#§b)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.08 45.01l-.16.98\" transform=\"translate(-1.5 7.5)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.08 45.01l-.16.98\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§i)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.08 45.01l-.16.98\" transform=\"translate(-1.8 9)\"/>","partly-cloudy-night-sleet":"<defs><linearGradient id=\"§a\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§d\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§b\" x1=\"23.31\" x2=\"24.69\" y1=\"44.3\" y2=\"46.7\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§h\" x1=\"30.31\" x2=\"31.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§b\"/><linearGradient id=\"§i\" x1=\"37.31\" x2=\"38.69\" y1=\"44.3\" y2=\"46.7\" href=\"#§b\"/></defs><path fill=\"url(#§a)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(-0.33 6)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§d)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§f)\"/><path fill=\"none\" stroke=\"url(#§g)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><path fill=\"none\" stroke=\"url(#§b)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.08 45.01l-.16.98\" transform=\"translate(-1.5 7.5)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.08 45.01l-.16.98\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§i)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.08 45.01l-.16.98\" transform=\"translate(-1.8 9)\"/>","partly-cloudy-day-snow":"<defs><linearGradient id=\"§b\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"30.12\" x2=\"31.88\" y1=\"43.48\" y2=\"46.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§d\" x1=\"29.67\" x2=\"32.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§h\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§b)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(0.33 6)\"><circle cx=\"31\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§a)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" d=\"M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§e)\"/><path fill=\"none\" stroke=\"url(#§f)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.5 7.5)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§g)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g>","partly-cloudy-night-snow":"<defs><linearGradient id=\"§a\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§c\" x1=\"30.12\" x2=\"31.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"29.67\" x2=\"32.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§h\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/></defs><path fill=\"url(#§a)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(0.33 6)\"><circle cx=\"31\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§c)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" d=\"M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§e)\"/><path fill=\"none\" stroke=\"url(#§f)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.5 7.5)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§g)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g>","thunderstorms-rain":"<defs><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"22.53\" x2=\"25.47\" y1=\"42.95\" y2=\"48.05\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§c\" x1=\"29.53\" x2=\"32.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"36.53\" x2=\"39.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"26.74\" x2=\"35.76\" y1=\"37.88\" y2=\"53.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f7b23b\"/><stop offset=\".45\" stop-color=\"#f7b23b\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.39 43.03l-.78 4.94\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§c)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.39 43.03l-.78 4.94\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.39 43.03l-.78 4.94\" transform=\"translate(-1.5 7.5)\"/><path fill=\"url(#§e)\" stroke=\"#f6a823\" stroke-width=\".5\" d=\"M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z\"/>","thunderstorms-day-rain":"<defs><linearGradient id=\"§b\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"22.53\" x2=\"25.47\" y1=\"42.95\" y2=\"48.05\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§d\" x1=\"29.53\" x2=\"32.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"36.53\" x2=\"39.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"26.74\" x2=\"35.76\" y1=\"37.88\" y2=\"53.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f7b23b\"/><stop offset=\".45\" stop-color=\"#f7b23b\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§b)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.39 43.03l-.78 4.94\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.39 43.03l-.78 4.94\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.39 43.03l-.78 4.94\" transform=\"translate(-1.5 7.5)\"/><path fill=\"url(#§f)\" stroke=\"#f6a823\" stroke-width=\".5\" d=\"M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z\"/>","thunderstorms-night-rain":"<defs><linearGradient id=\"§b\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"22.53\" x2=\"25.47\" y1=\"42.95\" y2=\"48.05\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#4286ee\"/><stop offset=\".45\" stop-color=\"#4286ee\"/><stop offset=\"1\" stop-color=\"#0950bc\"/></linearGradient><linearGradient id=\"§d\" x1=\"29.53\" x2=\"32.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"36.53\" x2=\"39.47\" y1=\"42.95\" y2=\"48.05\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"26.74\" x2=\"35.76\" y1=\"37.88\" y2=\"53.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f7b23b\"/><stop offset=\".45\" stop-color=\"#f7b23b\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><g><path fill=\"url(#§b)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/></g><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><path fill=\"none\" stroke=\"url(#§a)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M24.39 43.03l-.78 4.94\" transform=\"translate(-1.2 6)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M31.39 43.03l-.78 4.94\" transform=\"translate(-1.8 9)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M38.39 43.03l-.78 4.94\" transform=\"translate(-1.5 7.5)\"/><path fill=\"url(#§f)\" stroke=\"#f6a823\" stroke-width=\".5\" d=\"M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z\"/>","thunderstorms-snow":"<defs><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"30.12\" x2=\"31.88\" y1=\"43.48\" y2=\"46.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§c\" x1=\"29.67\" x2=\"32.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§h\" x1=\"26.74\" x2=\"35.76\" y1=\"37.88\" y2=\"53.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f7b23b\"/><stop offset=\".45\" stop-color=\"#f7b23b\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(0.33 6)\"><circle cx=\"31\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§a)\"/><path fill=\"none\" stroke=\"url(#§c)\" stroke-linecap=\"round\" d=\"M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§d)\"/><path fill=\"none\" stroke=\"url(#§e)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.5 7.5)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§f)\"/><path fill=\"none\" stroke=\"url(#§g)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><path fill=\"url(#§h)\" stroke=\"#f6a823\" stroke-width=\".5\" d=\"M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z\"/>","thunderstorms-day-snow":"<defs><linearGradient id=\"§b\" x1=\"16.5\" x2=\"21.5\" y1=\"19.67\" y2=\"28.33\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#fbbf24\"/><stop offset=\".45\" stop-color=\"#fbbf24\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient><linearGradient id=\"§c\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§a\" x1=\"30.12\" x2=\"31.88\" y1=\"43.48\" y2=\"46.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§d\" x1=\"29.67\" x2=\"32.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§h\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§i\" x1=\"26.74\" x2=\"35.76\" y1=\"37.88\" y2=\"53.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f7b23b\"/><stop offset=\".45\" stop-color=\"#f7b23b\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><circle cx=\"19\" cy=\"24\" r=\"5\" fill=\"url(#§b)\" stroke=\"#f8af18\" stroke-width=\".5\"/><path fill=\"none\" stroke=\"#fbbf24\" stroke-linecap=\"round\" stroke-width=\"2\" d=\"M19 15.67V12.5m0 23v-3.17m5.89-14.22l2.24-2.24M10.87 32.13l2.24-2.24m0-11.78l-2.24-2.24m16.26 16.26l-2.24-2.24M7.5 24h3.17m19.83 0h-3.17\"/><path fill=\"url(#§c)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(0.33 6)\"><circle cx=\"31\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§a)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" d=\"M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§e)\"/><path fill=\"none\" stroke=\"url(#§f)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.5 7.5)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§g)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><path fill=\"url(#§i)\" stroke=\"#f6a823\" stroke-width=\".5\" d=\"M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z\"/>","thunderstorms-night-snow":"<defs><linearGradient id=\"§a\" x1=\"13.58\" x2=\"24.15\" y1=\"15.57\" y2=\"33.87\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#86c3db\"/><stop offset=\".45\" stop-color=\"#86c3db\"/><stop offset=\"1\" stop-color=\"#5eafcf\"/></linearGradient><linearGradient id=\"§b\" x1=\"22.56\" x2=\"39.2\" y1=\"21.96\" y2=\"50.8\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f3f7fe\"/><stop offset=\".45\" stop-color=\"#f3f7fe\"/><stop offset=\"1\" stop-color=\"#deeafb\"/></linearGradient><linearGradient id=\"§c\" x1=\"30.12\" x2=\"31.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§d\" x1=\"29.67\" x2=\"32.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§e\" x1=\"23.12\" x2=\"24.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§f\" x1=\"22.67\" x2=\"25.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§g\" x1=\"37.12\" x2=\"38.88\" y1=\"43.48\" y2=\"46.52\" href=\"#§a\"/><linearGradient id=\"§h\" x1=\"36.67\" x2=\"39.33\" y1=\"42.69\" y2=\"47.31\" href=\"#§a\"/><linearGradient id=\"§i\" x1=\"26.74\" x2=\"35.76\" y1=\"37.88\" y2=\"53.52\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\" stop-color=\"#f7b23b\"/><stop offset=\".45\" stop-color=\"#f7b23b\"/><stop offset=\"1\" stop-color=\"#f59e0b\"/></linearGradient></defs><g><path fill=\"url(#§a)\" stroke=\"#72b9d5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\".5\" d=\"M29.33 26.68a10.61 10.61 0 01-10.68-10.54A10.5 10.5 0 0119 13.5a10.54 10.54 0 1011.5 13.11 11.48 11.48 0 01-1.17.07z\"/></g><path fill=\"url(#§b)\" stroke=\"#e6effc\" stroke-width=\".5\" d=\"M46.5 31.5h-.32a10.49 10.49 0 00-19.11-8 7 7 0 00-10.57 6 7.21 7.21 0 00.1 1.14A7.5 7.5 0 0018 45.5a4.19 4.19 0 00.5 0v0h28a7 7 0 000-14z\"/><g transform=\"translate(0.33 6)\"><circle cx=\"31\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§c)\"/><path fill=\"none\" stroke=\"url(#§d)\" stroke-linecap=\"round\" d=\"M33.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M31 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.67 9)\"><circle cx=\"24\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§e)\"/><path fill=\"none\" stroke=\"url(#§f)\" stroke-linecap=\"round\" d=\"M26.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M24 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><g transform=\"translate(-0.5 7.5)\"><circle cx=\"38\" cy=\"45\" r=\"1.25\" fill=\"none\" stroke=\"url(#§g)\"/><path fill=\"none\" stroke=\"url(#§h)\" stroke-linecap=\"round\" d=\"M40.17 46.25l-1.09-.63m-2.16-1.24l-1.09-.63M38 42.5v1.25m0 3.75v-1.25m-1.08-.63l-1.09.63m4.34-2.5l-1.09.63\"/></g><path fill=\"url(#§i)\" stroke=\"#f6a823\" stroke-width=\".5\" d=\"M30 36l-4 12h4l-2 10 10-14h-6l4-8h-6z\"/>"};

  if (SETUP) {
    document.getElementById("shield").style.display = "none";   // clicks go to YouTube's controls
    var setupNote = document.getElementById("setupNote");
    setupNote.innerHTML = "<b>Quality setup.</b> Choose the highest quality once in YouTube's own menu. YouTube remembers it on this TV.<br>" +
      "1. The remote's arrow buttons move the pointer. <b>OK</b> clicks.<br>" +
      "2. Move the pointer over the video: YouTube's controls appear at the bottom. If they don't, click the video once.<br>" +
      "3. Click the gear \u2699 at the bottom right (or top right), then <b>Quality</b>, then the highest number (2160p on a 4K TV).<br>" +
      "4. Press <b>Back</b> on the remote when you're done." +
      "<div id=\"setupStatus\"></div>";
    setupNote.style.display = "block";
  }

  startPanel();

  if (!LIST || /PASTE_/.test(LIST)) {
    note("Add your YouTube playlist link in SETTINGS at the top of this file,<br>" +
         "or add ?list=YOUR_PLAYLIST_ID to the end of the page address.");
    return;
  }

  /* ---------- memory (survives reloads, separate for each TV) ---------- */

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    s = s || {};
    return {
      played: s.played instanceof Array ? s.played : [],   // played in this round
      recent: s.recent instanceof Array ? s.recent : [],   // last songs played, newest last
      bad: s.bad && typeof s.bad === "object" ? s.bad : {}, // videos that refuse to play
      zoom: s.zoom && typeof s.zoom === "object" ? s.zoom : {}, // song zooms set with the remote
      auto: s.barCheck === BAR_CHECK && s.auto && typeof s.auto === "object" ? s.auto : {}, // zooms found automatically
      tint: s.tint && typeof s.tint === "object" ? s.tint : {},  // each song's colour: [hue, strength], or 0 for none
      barCheck: BAR_CHECK,
      problems: s.problems && typeof s.problems === "object" ? s.problems : {}, // songs that keep failing
      upNext: s.upNext instanceof Array ? s.upNext.filter(isId).slice(0, 20) : [], // asked for on the phone, in order
      ids: s.ids instanceof Array ? s.ids : []             // last known playlist
    };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  // The slides' turns between songs, whatever the playlist: kept, so a restart (the nightly one, the page's reload,
  // the box turned off and on) carries on rather than showing the menu's first items again
  function savedSlides() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SLIDES)); } catch (e) {}
    var turn = function (v) { v = Math.floor(Number(v)); return v >= 0 && v < 1e9 ? v : 0; };
    return { s: turn(s && s.s), m: turn(s && s.m) };
  }

  function keepSlides() {
    try { localStorage.setItem(SLIDES, JSON.stringify({ s: slideIdx, m: menuTurn })); } catch (e) {}
  }

  /* ---------- shuffle with no recent repeats ---------- */

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function toMap(a) {
    var m = {};
    for (var i = 0; i < a.length; i++) m[a[i]] = true;
    return m;
  }

  function buildQueue() {
    var now = Date.now();
    for (var id in state.bad) if (now - state.bad[id] > DAY) delete state.bad[id];

    var usable = allIds.filter(function (v) { return !state.bad[v]; });
    if (!usable.length) return false;

    var played = toMap(state.played);
    var rest = usable.filter(function (v) { return !played[v]; });
    if (!rest.length) {               // everything has played: start a new round
      state.played = [];
      rest = usable.slice();
    }
    queue = shuffle(rest);
    spreadSingers(queue);
    keepRecentAway(queue, usable.length);
    save();
    return true;
  }

  // The song next() plays: one asked for on the phone first; otherwise the next in the shuffled
  // order that isn't by the singer playing now (when the song names tell). build: start a
  // new round if this one is over.
  function chooseNext(build) {
    if (state.upNext.length) return { id: state.upNext[0], asked: true };
    if (!queue.length && !(build && buildQueue())) return null;
    if (S.differentSinger !== false && current) {
      for (var i = 0; i < queue.length && i < 60; i++) {
        if (queue[i] !== current && !sameSinger(current, queue[i])) return { id: queue[i], index: i };
      }
    }
    return { id: queue[0], index: 0 };
  }

  // In the new order, songs by the same singer don't stand next to each other (when the names
  // tell): a song next to one by its singer swaps with the first later one that fits there;
  // if none does, it moves back to the first place between two songs by other singers.
  function spreadSingers(q) {
    if (S.differentSinger === false) return;
    var before = function (i) { return i > 0 ? q[i - 1] : current; };
    for (var i = 0; i < q.length; i++) {
      if (!before(i) || !sameSinger(before(i), q[i])) continue;
      var j = i + 1;
      while (j < q.length && sameSinger(before(i), q[j])) j++;
      if (j < q.length) { var t = q[i]; q[i] = q[j]; q[j] = t; continue; }
      for (var k = 1; k < i; k++) {
        if (!sameSinger(q[k - 1], q[i]) && !sameSinger(q[i], q[k])) { q.splice(k, 0, q.splice(i, 1)[0]); break; }
      }
    }
  }

  // Songs that just played can't sit at the front of the new order
  function keepRecentAway(q, total) {
    var gap = Math.min(Number(S.noRepeat) || 0, Math.floor(total / 3));
    if (total >= 2) gap = Math.max(gap, 1);
    if (gap < 1) return;
    var recent = toMap(state.recent.slice(-gap));
    var free = [], i, j, t;
    for (j = gap; j < q.length; j++) if (!recent[q[j]]) free.push(j);
    for (i = 0; i < gap && i < q.length; i++) {
      if (!recent[q[i]] || !free.length) continue;
      j = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      t = q[i]; q[i] = q[j]; q[j] = t;
    }
  }

  function next() {
    if (reloading || quiet) return;
    clearTimeout(skipTimer);
    if (S.refreshHours > 0 && Date.now() - loadedAt > S.refreshHours * 3600e3) return refresh();
    if (pendingRestart) {                        // a new playlist: start fresh between two songs
      pendingRestart = false;
      return refresh();
    }
    var pick = chooseNext(true);
    if (!pick) {                                 // nothing playable right now
      state.bad = {};
      save();
      return reloadSoon(10 * 60e3);
    }
    current = pick.id;
    tempVol = null;                              // a new song: the volume from the settings again
    if (pick.asked) {                            // asked for on the phone: out of this round's order
      state.upNext.shift();
      var at = queue.indexOf(current);
      if (at >= 0) queue.splice(at, 1);
    } else {
      queue.splice(pick.index, 1);
    }
    if (allIds.indexOf(current) >= 0 && state.played.indexOf(current) < 0) state.played.push(current);
    state.recent.push(current);
    if (state.recent.length > 300) state.recent = state.recent.slice(-300);
    save();

    lastSwitch = lastMove = Date.now();
    lastTime = -1;
    started = false;
    fadingOut = false;
    picEnding = false;
    needHold = false;
    showAt = Infinity;
    adSince = 0;
    if (muted && Date.now() - soundTriedAt > 10 * 60e3) {
      soundTriedAt = Date.now();                 // every 10 minutes, try sound again
      setMuted(false);
    }
    setLevel(0);                                 // silent until the song itself starts...
    guard(true);                                 // ...with the café screen up
    layout();                                    // this song's zoom, while it's hidden
    player.loadVideoById(current);
    syncSound(true);
    findBars(current);                           // black bars? (each song is checked once per TV)
    if (queue.length) findBars(queue[0]);        // ...and the next one, so it's ready in time
    if (SETUP) {                                 // quality setup: YouTube's player as it is, with sound
      guard(false);
      setLevel(1);
      setPicture("show");
    }
  }

  /* ---------- reading the playlist ---------- */

  function playlistId(s) {
    s = String(s || "").trim();
    var m = s.match(/[?&]list=([\w-]+)/);
    return m ? m[1] : s;
  }

  // A YouTube video ID: 11 letters, digits, - or _
  function isId(v) {
    return typeof v === "string" && /^[\w-]{11}$/.test(v);
  }

  // The playlist for this time of day: from playlistSchedule (each from its time on), else the playlist setting
  function scheduledList() {
    var sch = S.playlistSchedule, list = [], k;
    if (sch && typeof sch === "object" && !(sch instanceof Array)) {
      for (k in sch) {
        if (Object.prototype.hasOwnProperty.call(sch, k) && minutesOf(k) != null && String(sch[k] || "").trim()) list.push([minutesOf(k), String(sch[k]).trim()]);
      }
    }
    if (!list.length) return S.playlist;
    list.sort(function (a, b) { return a[0] - b[0]; });
    var now = nowMinutes(), v = list[list.length - 1][1];   // before the day's first time, the last one still holds
    for (var i = 0; i < list.length; i++) if (list[i][0] <= now) v = list[i][1];
    return v;
  }

  function unique(a) {
    var seen = {}, out = [];
    for (var i = 0; i < a.length; i++) {
      if (a[i] && !seen[a[i]]) { seen[a[i]] = true; out.push(a[i]); }
    }
    return out;
  }

  function getIds() {
    return S.apiKey ? idsFromApi().catch(idsFromPlayer) : idsFromPlayer();
  }

  // Let YouTube's own player open the playlist, then read the video list from it
  function idsFromPlayer() {
    return new Promise(function (resolve, reject) {
      player.cuePlaylist({ listType: "playlist", list: LIST });
      var tries = 0;
      var t = setInterval(function () {
        var ids = player.getPlaylist && player.getPlaylist();
        if (ids && ids.length) { clearInterval(t); source = "read by the YouTube player"; resolve(ids.slice()); }
        else if (++tries > 80) { clearInterval(t); reject(new Error("playlist did not load")); }
      }, 250);
    });
  }

  // Read the whole playlist (any size) with a YouTube Data API key
  function idsFromApi() {
    var ids = [];
    function page(token) {
      var url = "https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50" +
        "&playlistId=" + encodeURIComponent(LIST) + "&key=" + encodeURIComponent(S.apiKey) +
        (token ? "&pageToken=" + encodeURIComponent(token) : "");
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error("YouTube API " + r.status);
        return r.json();
      }).then(function (j) {
        (j.items || []).forEach(function (it) {
          if (it.contentDetails && it.contentDetails.videoId) ids.push(it.contentDetails.videoId);
        });
        if (j.nextPageToken) return page(j.nextPageToken);
        source = "read with the API key";
        return ids;
      });
    }
    return page("");
  }

  /* ---------- player events ---------- */

  function onReady() {
    ready = true;
    layout();
    getIds().then(function (ids) {
      allIds = unique(ids);
      state.ids = allIds;
      save();
    }).catch(function () {
      allIds = state.ids;                        // fall back to the last list we saw
      source = "last saved list (YouTube didn't answer)";
    }).then(function () {
      if (!allIds.length) {
        if (!noteShown) note("Couldn't open the playlist. Check that it is Public or Unlisted.");
        return reloadSoon(60e3);
      }
      next();
    });
  }

  function onStateChange(e) {
    if (!current || quiet || SETUP) return;      // still opening the playlist, music off on purpose, or quality setup
    var st = e.data;
    if (st !== PLAYING && lastState === PLAYING) leftPlayingAt = Date.now();
    lastState = st;
    if (st === PLAYING) {
      if (!autoplayDead) hideNote();
      if (!adBlocking() && !started) songStarted(player.getVideoData ? player.getVideoData() : {});
    }
    else if (st === ENDED) { if (Date.now() - lastSwitch > 2000) return next(); }
    else if (st === PAUSED || st === CUED) { if (st === PAUSED) needHold = true; kick(); }
    syncPicture();                               // paused: café screen at once
  }

  function onError(e) {
    var code = e.data;
    if (code === 153) note("YouTube error 153: open this page from a web address (https://...), not as a file.");
    if (!current || quiet) return;
    setLevel(0);
    guard(true);                                 // never show YouTube's error screen
    skipped.push(current + " (error " + code + ")");
    if (skipped.length > 6) skipped.shift();
    problem(current, "YouTube error " + code + (code === 150 || code === 101 ? " (the owner doesn't allow it on other sites)" :
                                                code === 100 ? " (removed or private)" : ""));
    if (code === 100 || code === 101 || code === 150) {
      state.bad[current] = Date.now();           // removed, private or not embeddable: skip it for a day
      save();
    } else if (++oddErrors >= 5) {
      return reloadSoon(30e3);
    }
    clearTimeout(skipTimer);
    skipTimer = setTimeout(next, 1500);
  }

  function onAutoplayBlocked() {
    if (muted || level <= 0.001 || (guarded && adBlocking())) {   // even silent play is blocked
      autoplayDead = true;
      note("This screen's browser blocks video until someone taps it.<br>" +
           "Tap the screen once, or turn on \"Simulate touch after load\" in OptiSigns.");
      return;
    }
    setMuted(true);                              // sound refused without a tap: play muted for now
    soundTriedAt = Date.now();
    syncSound(true);
    player.playVideo();
  }

  function onApiChange() {                       // YouTube loaded a module, e.g. captions
    noCaptions();
  }

  function kick() {                              // anything paused it: play again
    var now = Date.now();
    if (now - lastKick < 1000) return;
    lastKick = now;
    player.playVideo();
  }

  function adBlocking() {
    return S.blockAds && Date.now() >= adPauseUntil;
  }

  /* ---------- the song really started ---------- */

  function songStarted(vd) {
    started = true;
    adSkips = 0;
    needHold = false;
    addHistory(current);
    if (state.problems[current]) { delete state.problems[current]; save(); }   // it plays fine now
    var paid = (vd && vd.paidContentOverlayDurationMs) || 0;   // "Includes paid promotion" label
    var hold = Math.max(Number(S.titleSeconds) || 0, paid ? paid / 1000 + 0.5 : 0);
    showAt = Date.now() + hold * 1000;
    guard(false);
    fadeLevel(1, S.fadeIn);
    noCaptions();
    askQuality();
  }

  // Subtitles off: YouTube's captions module is switched off and unloaded
  function noCaptions() {
    if (!S.noSubtitles || !player) return;
    try { if (player.setOption) player.setOption("captions", "track", {}); } catch (e) {}
    try { if (player.unloadModule) { player.unloadModule("captions"); player.unloadModule("cc"); } } catch (e) {}
  }

  // YouTube's documented API ignores quality requests, so the main lever is the
  // player size in layout(). This also asks for the top stream directly, in case
  // the embedded player still honours it.
  var HEIGHTS = { highres: 4320, hd2880: 2880, hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720,
                  large: 480, medium: 360, small: 240, tiny: 144 };

  // The highest quality to ask for: the setting, or automatically 1080 (720 when the box's
  // processor draws everything: each video frame is copied to it, so fewer pixels play smoothly)
  function qualityCap() {
    var q = Number(S.quality);
    if (q >= 144) return q;
    return softDraw ? 720 : 1080;
  }

  function askQuality() {
    try {
      var levels = (player.getAvailableQualityLevels && player.getAvailableQualityLevels()) || [];
      var cap = qualityCap(), best = null;
      for (var i = 0; i < levels.length && !best; i++) {
        if (HEIGHTS[levels[i]] && HEIGHTS[levels[i]] <= cap) best = levels[i];
      }
      if (!best) return;
      if (player.setPlaybackQualityRange) player.setPlaybackQualityRange(best, best);
      if (player.setPlaybackQuality) player.setPlaybackQuality(best);
    } catch (e) {}
  }

  /* ---------- watchdog: picture, ads, fades, stalls (4 times a second) ---------- */

  setInterval(function () {
    if (window.innerWidth !== lastW || window.innerHeight !== lastH) layout();
    var now = Date.now();
    if (APP && now - aliveAt > 5000) {           // tell the app the page is alive (it restarts a frozen page)
      aliveAt = now;
      try { APP.alive(); } catch (e) {}
    }
    if (APP && now - settingsCheckAt > 2000) { settingsCheckAt = now; checkAppSettings(); }
    if (SETUP) {                                 // quality setup: no covering, fading or ad handling
      if (!ready || !current) return;
      var sst = player.getPlayerState(), sq = "";
      try { sq = player.getPlaybackQuality() || ""; } catch (e) {}
      // What YouTube is doing, so staff can see the choice worked (and what to tell for help)
      document.getElementById("setupStatus").textContent = "Now: " +
        (/Android/.test(navigator.userAgent) ? "app" : "computer") + " version of YouTube's player, video " + (NAMES[sst] || "starting") +
        ", picture " + (QUALITY[sq] || QUALITY[quality] || "not reported yet") + ". Web engine: " + engine() + ".";
      if (!setupPaused && sst === PLAYING && (player.getCurrentTime() || 0) > 1.5) {
        setupPaused = true;                      // paused once, so YouTube keeps its controls (and gear) on screen
        player.pauseVideo();
      }
      if (sst === ENDED && now - lastSwitch > 2000) next();
      return;
    }
    if (!ready || !current || reloading) return;
    if (now - scheduleAt > 10000) { scheduleAt = now; checkHours(); }
    if (quiet) {                                 // music off on purpose: café screen, silent, nothing to watch
      if (quiet === "paused" && now > holdUntil) resume();
      else if (quiet === "prayer" && now >= prayerUntil) checkHours();
      return;
    }
    var low = now < quietUntil ? quietShare() : 1;   // "Quiet for a minute": down in about 2 seconds, and back
    if (duck !== low) {
      duck = low > duck ? Math.min(low, duck + 0.1) : Math.max(low, duck - 0.1);
      syncSound();
    }
    var st = player.getPlayerState();
    var t = player.getCurrentTime() || 0;
    var d = player.getDuration() || 0;
    var vd = (player.getVideoData && player.getVideoData()) || {};
    var forward = lastTime >= 0 && t > lastTime;  // the song's own clock moved on
    if (t !== lastTime) { lastTime = t; lastMove = now; }
    if (st !== PLAYING && lastState === PLAYING) leftPlayingAt = now;
    if (st === PAUSED) needHold = true;
    lastState = st;
    var blocking = adBlocking();
    var otherVideo = blocking && !!vd.video_id && vd.video_id !== current && now - lastSwitch > 1500;  // ads are videos too

    if (st === PLAYING && forward && !otherVideo) {
      strikes = 0;
      oddErrors = 0;
      adSince = 0;
      if (!started) { if (t > 0.3) songStarted(vd); }
      else if (guarded) {                        // back to the song after a mid-song ad
        guard(false);
        showAt = Math.max(showAt, now + (Number(S.titleSeconds) || 0) * 1000);
        fadeLevel(1, 1);
      } else if (needHold) {                     // back from a pause: YouTube shows the title again
        needHold = false;
        showAt = Math.max(showAt, now + (Number(S.titleSeconds) || 0) * 1000);
      }
    } else if (blocking && !fadingOut && !picEnding) {
      var frozen = st === PLAYING && now - lastMove > 2500;           // "playing", but the song's clock stands still
      var late = !started && st !== BUFFERING && !autoplayDead && now - lastSwitch > 6000;
      if (otherVideo || frozen || late) {
        if (!adSince) adSince = now;
        if (!guarded) { setLevel(0); guard(true); }   // covered and silent at once
        if (late || now - adSince > 6000) return skipAd();
      }
    }

    if (started && d > 5) {
      var fo = Math.min(Number(S.fadeOut) || 0, d / 4);
      var be = Math.min(Number(S.brandEnding) || 0, d / 4);
      var tail = Math.min(Number(S.cutEnding) || 0, d / 4) + 0.6;    // stop before YouTube's end screen
      var left = d - t, settled = now - lastSwitch > 3000;
      if (!picEnding && st === PLAYING && left < tail + Math.max(fo, be) && settled) {
        picEnding = true;                        // café screen over the last seconds: no end cards
        picFadeSecs = be > fo ? 2 : Math.max(fo, 0.3);
        nextSlide();                             // with the next message or picture
      }
      if (!fadingOut && st === PLAYING && left < tail + fo && settled) startFadeOut(fo);
      if (fadingOut && (left < tail || now - fadeStartedAt > (fo + 3) * 1000)) return next();
    }
    if (st === PAUSED || st === CUED) kick();
    else if (st === ENDED && now - lastSwitch > 2000) return next();

    if (now - resyncAt > 2000) { resyncAt = now; syncSound(true); }
    else checkSound(now);
    syncPicture();

    if (now - lastMove > 90e3) {                 // stuck for 90 seconds
      lastMove = now;
      if (!started) problem(current, "never started (stuck loading)");
      if (++strikes >= 3) return reloadSoon(0);
      next();
    }
  }, 250);

  function skipAd() {
    adsSkipped++;
    skipped.push(current + " (ad)");
    if (skipped.length > 6) skipped.shift();
    if (++adSkips >= 6) {                        // 6 in a row: let music play for 30 minutes, then block again
      adSkips = 0;
      adPauseUntil = Date.now() + 30 * 60e3;
    }
    next();
  }

  function startFadeOut(secs) {
    fadingOut = true;
    fadeStartedAt = Date.now();
    if (!picEnding) { picEnding = true; picFadeSecs = Math.max(secs, 0.3); nextSlide(); }
    fadeLevel(0, secs);
    syncPicture();
  }

  /* ---------- picture ---------- */

  // The video shows only while the song plays cleanly. The rest of the time
  // (loading, paused, stalled, ads, YouTube's title, the last seconds) the café
  // screen underneath is what's on the TV.
  function syncPicture() {
    var now = Date.now(), mode = "off";
    if (now < lookUntil) mode = "off";           // a special day's look, shown from the phone
    else if (picEnding || fadingOut) mode = "fadeout";
    else if (started && !guarded && now >= showAt &&
             (lastState === PLAYING || (lastState === BUFFERING && now - leftPlayingAt < 700))) mode = "show";
    setPicture(mode);
  }

  // The café screen over the video: it fades away to show the video, then is hidden; it fades back over the
  // video's last seconds; else it covers it at once. The video itself never fades (see #brand in the CSS).
  function setPicture(mode) {
    if (mode === pictureMode) return;
    pictureMode = mode;
    pictureAt = Date.now();
    var el = document.getElementById("player"), brand = document.getElementById("brand");
    var fin = Math.min(Math.max(Number(S.fadeIn) || 0, 0.3), 2);
    if (mode === "show") {
      brand.style.transition = "opacity " + fin + "s ease-in-out, visibility 0s linear " + fin + "s";
      brand.classList.add("away");
    } else if (mode === "fadeout") {
      brand.style.transition = "opacity " + picFadeSecs + "s ease-in-out, visibility 0s";
      brand.classList.remove("away");
    } else {
      brand.style.transition = "none";
      brand.classList.remove("away");
    }
    if (el) {
      el.style.transition = "transform .4s ease";              // a zoom (black bars) still glides
      el.className = mode;
    }
    document.body.classList.toggle("video-on", mode === "show");   // the café screen away, the video on its own
  }

  function guard(on) {
    guarded = on;
    syncSound();
    syncPicture();
  }

  // The info panel needs a wide screen (TVs are 16:9); never during quality setup
  function panelWanted() {
    return S.infoPanel !== false && !SETUP && window.innerWidth >= window.innerHeight * 1.5;
  }

  // The frame's colours: the song's (videoColors), else the usual dark ones. The room is a radial
  // gradient from the top, the song's light a glow around the video card; both worked out here, so the
  // card's corners can be painted in exactly what's behind them. t: [hue, strength] or null.
  function frameColours(t) {
    if (!t) return { top: [0x1b, 0x1f, 0x27], end: [0x0f, 0x12, 0x17], glow: null, accent: null };
    var h = t[0], st = Math.max(0, Math.min(1, Number(t[1]) || 0)), sat = 0.25 + 0.4 * st;
    return { top: hslRgb(h, sat * 0.45, 0.115), end: hslRgb(h, sat * 0.4, 0.065),
             glow: hslRgb(h, Math.min(0.8, sat + 0.1), 0.5), alpha: 0.14 + 0.12 * st, accent: hslRgb(h, 0.7, 0.7) };
  }

  function hslRgb(h, s, l) {
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { var k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
  }

  function rgb(c, alpha) {
    var v = c.map(Math.round).join(", ");
    return alpha == null ? "rgb(" + v + ")" : "rgba(" + v + ", " + alpha + ")";
  }

  // What's behind the video card at a point: the room, and the song's light over it
  function roomAt(c, box, px, py) {
    var W = window.innerWidth, H = window.innerHeight;
    var t = Math.min(1, Math.sqrt(Math.pow((px - W / 2) / (1.1 * W), 2) + Math.pow(py / (0.8 * H), 2)) / 0.72);
    var col = c.top.map(function (v, i) { return v + (c.end[i] - v) * t; });
    if (!c.glow) return col;
    var g = Math.sqrt(Math.pow((px - box[0] - box[2] / 2) / box[2], 2) + Math.pow((py - box[1] - box[3] / 2) / box[3], 2));
    var a = g <= 0.5 ? c.alpha : g >= 1 ? 0 : c.alpha * (1 - (g - 0.5) / 0.5);
    return col.map(function (v, i) { return v * (1 - a) + c.glow[i] * a; });
  }

  // One of the two layers (a or b): the room and the song's light, and the video card's rounded corners,
  // painted over the video: a quarter ring of the card's edge and, outside it, the colour of what's behind
  // the card there, darkened by the card's shadow (a little at the top, more at the bottom). See #stageBack
  // in the CSS for why. box: the card [x, y, width, height, u].
  function paintFrame(which, c, box) {
    var x = box[0], y = box[1], w = box[2], h = box[3], u = box[4], r = 18 * u, edge = Math.max(u, 1);
    var bg = "radial-gradient(110% 80% at 50% 0%, " + rgb(c.top) + ", " + rgb(c.end) + " 72%)";
    if (c.glow) bg = "radial-gradient(" + w + "px " + h + "px at " + (x + w / 2) + "px " + (y + h / 2) + "px, " + rgb(c.glow, c.alpha) + " 0%, " +
      rgb(c.glow, c.alpha) + " 50%, " + rgb(c.glow, 0) + " 100%), " + bg;
    document.querySelector("#ambient ." + which).style.backgroundImage = bg;
    // each corner: where its middle is, where its circle's centre is (in the corner piece), the shadow there
    var spots = { tl: [x + r / 2, y + r / 2, "100% 100%", 0.08], tr: [x + w - r / 2, y + r / 2, "0 100%", 0.08],
                  bl: [x + r / 2, y + h - r / 2, "100% 0", 0.23], br: [x + w - r / 2, y + h - r / 2, "0 0", 0.23] };
    Object.keys(spots).forEach(function (k) {
      var p = spots[k], back = roomAt(c, box, p[0], p[1]).map(function (v) { return v * (1 - p[3]); });
      var ring = back.map(function (v) { return v + (255 - v) * 0.11; });   // the edge: rgba(255, 255, 255, .11)
      var el = document.querySelector("#stage .corner." + k + " .c" + which);
      if (el) el.style.background = "radial-gradient(circle at " + p[2] + ", transparent " + (r - 0.5) + "px, " + rgb(ring) + " " + (r + 0.5) + "px, " +
        rgb(ring) + " " + Math.max(r + 0.5, r + edge - 0.5) + "px, " + rgb(back) + " " + (r + edge + 0.5) + "px)";
    });
  }

  // The song's colours, when they change (a new song, or the card moved): painted on the layer out of
  // sight, which then fades in over the other (or the other fades out from over it). The first time,
  // straight away.
  function syncColours() {
    if (!panelOn || !frameBox) return;
    var t = S.videoColors !== false && current && quiet !== "closed" ? state.tint[current] : null;
    if (!(t instanceof Array)) t = null;
    var key = JSON.stringify([t, frameBox, window.innerWidth, window.innerHeight]);
    if (key === frameKey) return;
    var c = frameColours(t), first = !frameKey;
    frameKey = key;
    if (!first) frameLayer = frameLayer === "a" ? "b" : "a";
    paintFrame(frameLayer, c, frameBox);
    document.documentElement.classList.toggle("amb-b", frameLayer === "b");
    if (c.accent) document.documentElement.style.setProperty("--accent", rgb(c.accent));
    else document.documentElement.style.removeProperty("--accent");
  }

  // The stage (video and café screen): the whole screen, or with the info panel a card of 1280x720
  // (on a 1920x1080 screen) in the top corner: top left, or top right for a right-to-left language.
  // The frame's other cards are placed around it in CSS. --u is one pixel of a 1920x1080 screen; a
  // screen of another shape gets the same picture, centered (--ox, --oy).
  //
  // YouTube picks the stream from the player's size, so the player is drawn at
  // the chosen quality (1080 lines by default) and scaled to fit the stage exactly,
  // then zoomed for this song if it has black bars (remote left/right).
  function layout() {
    var el = document.getElementById("player"), stage = document.getElementById("stage"), root = document.documentElement.style;
    lastW = window.innerWidth;
    lastH = window.innerHeight;
    if (!lastW || !lastH) return;
    var on = panelWanted(), sw = lastW, sh = lastH, u = Math.min(lastW / 1920, lastH / 1080);
    var ox = (lastW - 1920 * u) / 2, oy = (lastH - 1080 * u) / 2, x = 0, y = 0;
    if (on) {
      sw = Math.round(1280 * u);
      sh = Math.round(720 * u);
      x = Math.round(ox + (document.documentElement.dir === "rtl" ? 600 : 40) * u);
      y = Math.round(oy + 40 * u);
    }
    stage.style.left = x + "px";
    stage.style.top = y + "px";
    stage.style.width = sw + "px";
    stage.style.height = sh + "px";
    var back = document.getElementById("stageBack");
    back.style.left = x + "px";
    back.style.top = y + "px";
    back.style.width = sw + "px";
    back.style.height = sh + "px";
    frameBox = on ? [x, y, sw, sh, u] : null;
    root.setProperty("--u", u + "px");
    root.setProperty("--ox", ox + "px");
    root.setProperty("--oy", oy + "px");
    if (on !== panelOn) { panelOn = on; panelDirty = true; }
    document.body.classList.toggle("with-panel", on);
    syncColours();
    if (!el) return;
    var dpr = window.devicePixelRatio || 1;
    var fitH = Math.min(sh, sw * 9 / 16);                          // biggest 16:9 area on the stage
    var h = qualityCap() / dpr;                                   // player size in CSS pixels
    // Quality setup: nearly screen size and no zoom, so YouTube's controls are full size, and all of
    // them stay inside the part of the picture every TV shows (some TVs cut off the edges)
    if (SETUP) h = fitH * 0.9;
    var w = h * 16 / 9;
    var s = SETUP ? 1 : fitH / h * songZoom() / 100;
    renderW = Math.round(w * dpr);
    renderH = Math.round(h * dpr);
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.transform = "translate(" + (sw - w * s) / 2 + "px, " + (sh - h * s) / 2 + "px) scale(" + s + ")";
  }

  /* ---------- sound ---------- */

  // The volume from the settings (a song's own one in songVolume, else the normal one), or what the
  // remote or the phone set for the song playing now: that lasts until the song ends
  function songVolume() {
    var v = S.volume;
    if (current && S.songVolume && S.songVolume[current] != null) v = S.songVolume[current];
    if (current && tempVol && tempVol.id === current) v = tempVol.v;
    v = Number(v);
    return isNaN(v) ? 100 : Math.max(0, Math.min(100, v));
  }

  // Applies mute / volume: silent while loading or covering an ad, faded
  // with the fade level (on a natural-sounding curve), at the song's volume. Coming back on, the volume is set
  // first: unmuted first, the player would play for a moment at whatever volume it had before.
  function syncSound(force) {
    if (!player || !ready) return;
    var silent = muted || level <= 0.001 || duck <= 0.001 || (guarded && adBlocking());
    var vol = silent ? 0 : Math.max(1, Math.round(songVolume() * scheduleVolume() / 100 * closingShare() * duck *
                                                  Math.pow(10, (level - 1) * 1.5)));
    var now = Date.now();
    if (!silent && (force || vol !== lastSentVol || lastSentMute !== false)) {
      if (vol !== lastSentVol) soundSetAt = now;
      player.setVolume(vol);
      lastSentVol = vol;
    }
    if (force || silent !== lastSentMute) {
      if (silent !== lastSentMute) soundSetAt = now;
      if (silent) player.mute(); else player.unMute();
      lastSentMute = silent;
    }
  }

  // YouTube's player changing its volume, or its sound on or off, by itself: put back at once (4 times a second),
  // rather than at the next resync up to 2 seconds later, that long too loud. Counted, for the phone page. Only
  // while the song itself plays (the café screen down), and not just after the page changed the sound itself (the
  // player says its new volume a moment later).
  function checkSound(now) {
    if (soundCheckOff || !player || !ready || guarded || lastSentMute == null || now - soundSetAt < 600) return;
    if (typeof player.getVolume !== "function" || typeof player.isMuted !== "function") return;
    var m = !!player.isMuted(), v = Number(player.getVolume());
    if (m === lastSentMute && (m || isNaN(v) || Math.abs(v - lastSentVol) <= 1)) return;
    if (soundFixAt && now - soundFixAt < 1500) { soundCheckOff = true; return; }   // still not right just after: it doesn't say truly
    soundFixes++;
    soundFixAt = soundSetAt = now;
    syncSound(true);
  }

  function setLevel(v) {
    clearInterval(levelTimer);
    level = v;
    syncSound();
  }

  function fadeLevel(to, seconds) {
    clearInterval(levelTimer);
    var from = level, steps = Math.round((Number(seconds) || 0) * 10), i = 0;
    if (steps < 2) { level = to; syncSound(); return; }
    levelTimer = setInterval(function () {
      level = from + (to - from) * (++i / steps);
      syncSound();
      if (i >= steps) clearInterval(levelTimer);
    }, 100);
  }

  function setMuted(m) {
    muted = m;
    document.getElementById("muted").style.display = m ? "block" : "none";
  }

  // Remote up/down arrows (or + / - on a keyboard, or the phone): this song louder or quieter,
  // until it ends. The next song is back at the volume from the settings.
  function changeSongVolume(delta) {
    if (!current) return;
    var v = Math.max(10, Math.min(100, Math.round((songVolume() + delta) / 10) * 10));
    tempVol = { id: current, v: v };
    syncSound();
    toast(nums("♪ " + v + "%"));
  }

  /* ---------- zoom (black bars) ---------- */

  // Steps for the remote's left/right arrows. 105 fills the screen for 1.85:1
  // videos, 113 for 2:1, 124 for 2.2:1 and 135 for 2.39:1 "cinema" videos (and for
  // old 4:3 uploads with a 16:9 picture inside, which have bars on all four sides).
  var ZOOMS = [100, 105, 113, 124, 135];
  var FRAMES = "https://i.ytimg.com/vi/";   // YouTube's still frames of each video
  var barsBusy = {}, barsFails = 0, barsOffUntil = 0;

  // This song's zoom: set with the remote on this TV, else in SETTINGS, else found
  // automatically, else none
  function songZoom() {
    var z = 100;
    if (current) {
      if (S.autoZoom !== false && state.auto[current] != null) z = state.auto[current];
      if (S.songZoom && S.songZoom[current] != null) z = S.songZoom[current];
      if (state.zoom[current] != null) z = state.zoom[current];
    }
    z = Number(z);
    return isNaN(z) ? 100 : Math.max(100, Math.min(200, z));
  }

  // Remote left/right arrows: zoom this song in or out, remembered on this TV.
  // The automatic and SETTINGS zooms are steps too, so you can always go back to them.
  function changeSongZoom(dir) {
    if (!current) return;
    var z = songZoom(), to = z, steps = ZOOMS.slice();
    [S.autoZoom !== false && state.auto[current], S.songZoom && S.songZoom[current]].forEach(function (v) {
      v = Number(v);
      if (v >= 100 && v <= 200 && steps.indexOf(v) < 0) steps.push(v);
    });
    steps.sort(function (a, b) { return a - b; });
    for (var i = 0; i < steps.length; i++) {
      if (dir > 0 && steps[i] > z) { to = steps[i]; break; }
      if (dir < 0 && steps[i] < z) to = steps[i];
    }
    state.zoom[current] = to;
    save();
    layout();
    toast(nums("Zoom " + to + "%"));
  }

  // Looks for black bars in a song, once per TV. YouTube publishes three still
  // frames of every video (from about a quarter, half and three quarters of the
  // way in). Black bands of the same height at the top and bottom of them are
  // the video's bars; the song is then zoomed just enough to cover them. Anything
  // unclear (dark frames, black backgrounds, text in the bars) stays at 100%.
  // The same frames give the song's colour, for the frame around the video.
  function findBars(id) {
    if (!id || barsBusy[id] || Date.now() < barsOffUntil) return;
    var zoom = S.autoZoom !== false && state.auto[id] == null, tint = S.videoColors !== false && state.tint[id] == null;
    if (!zoom && !tint) return;
    barsBusy[id] = true;
    var frames = [], colours = [], read = 0, left = 3;
    for (var n = 1; n <= 3; n++) loadFrame(id, n, function (ok, f, c) {
      if (ok) read++;
      if (f) frames.push(f);
      if (c) colours.push(c);
      if (--left) return;
      delete barsBusy[id];
      if (!read && ++barsFails >= 3) {           // YouTube's frames can't be read right now:
        barsFails = 0;                           // try again in an hour
        barsOffUntil = Date.now() + 3600e3;
      }
      if (read < 2) return;                      // not now; again the next time this song comes up
      barsFails = 0;
      if (zoom) state.auto[id] = zoomFor(frames);
      if (tint) state.tint[id] = tintFor(colours);
      save();
      if (id === current) layout();              // zooms smoothly if the song is already on
    });
  }

  // One still frame: the medium one (320x180), else the bigger 4:3 one, else the
  // small one. done(read, bars, colours): read = the picture could be read at all.
  function loadFrame(id, n, done) {
    var kinds = [["mq", 320], ["hq", 480], ["", 120]], k = 0;
    (function attempt() {
      if (k >= kinds.length) return done(false, null);
      var kind = kinds[k++], img = new Image(), over = false;
      var timer = setTimeout(function () { finish(false); }, 15e3);
      function finish(loaded) {
        if (over) return;
        over = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        if (!loaded || img.naturalWidth !== kind[1]) return attempt();   // not there (YouTube's grey stand-in is 120 wide)
        var bars = null, colours = null;
        try {
          var w = img.naturalWidth, h = img.naturalHeight, c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          var g = c.getContext("2d");
          g.drawImage(img, 0, 0);
          var px = g.getImageData(0, 0, w, h).data;
          bars = barsIn(px, w, h);
          colours = coloursIn(px, w, h);
        } catch (e) { return done(false, null, null); }   // the browser won't let the page read it
        done(true, bars, colours);
      }
      img.crossOrigin = "anonymous";
      img.onload = function () { finish(true); };
      img.onerror = function () { finish(false); };
      img.src = FRAMES + encodeURIComponent(id) + "/" + kind[0] + n + ".jpg";
    })();
  }

  // Black rows at the top and bottom of one frame, as a share of the video's
  // height. YouTube's 4:3 stills show a 16:9 video as a band across the middle.
  function barsIn(px, w, h) {
    var frameH = h, off = 0;
    if (Math.abs(w / h - 4 / 3) < 0.05) { frameH = w * 9 / 16; off = (h - frameH) / 2; }
    else if (Math.abs(w / h - 16 / 9) > 0.05) return null;
    var lit = [], bright = 0, y, i, end, n;
    for (y = 0; y < h; y++) {
      for (n = 0, i = y * w * 4, end = i + w * 4; i < end; i += 4) {
        if (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114 > 40) n++;   // not black
      }
      lit.push(n / w);
      if (n / w > 0.2) bright++;
    }
    if (bright < h * 0.15) return null;          // a dark frame tells nothing
    var top = 0, bottom = 0;
    while (top < h && lit[top] <= 0.03) top++;   // a tiny logo in a bar is allowed
    while (bottom < h && lit[h - 1 - bottom] <= 0.03) bottom++;
    return {
      top: (top - off) / frameH,
      bottom: (bottom - off) / frameH,
      // how much picture starts right after each bar (real bars end in a sharp edge)
      edgeTop: Math.max(lit[top] || 0, lit[top + 1] || 0),
      edgeBottom: Math.max(lit[h - 1 - bottom] || 0, lit[h - 2 - bottom] || 0)
    };
  }

  // A frame's colours: how much of each hue (24 steps of 15°) its colourful pixels have, by how
  // colourful they are; greys, near-blacks and near-whites don't count
  function coloursIn(px, w, h) {
    var bins = [], n = 0, step = Math.max(1, Math.round(w / 64)), x, y, b;
    for (b = 0; b < 24; b++) bins.push(0);
    for (y = 0; y < h; y += step) {
      for (x = 0; x < w; x += step) {
        var i = (y * w + x) * 4, r = px[i] / 255, g = px[i + 1] / 255, bl = px[i + 2] / 255;
        var max = Math.max(r, g, bl), min = Math.min(r, g, bl), c = max - min, l = (max + min) / 2;
        n++;
        if (c < 0.12 || l < 0.1 || l > 0.92) continue;
        var hue = max === r ? ((g - bl) / c + 6) % 6 : max === g ? (bl - r) / c + 2 : (r - g) / c + 4;
        bins[Math.floor(hue * 4) % 24] += c;
      }
    }
    return { bins: bins, n: n };
  }

  // A song's colour from its frames: [hue in degrees, strength 0-1], the hue most of its colourful
  // pixels share; 0 when it has no clear colour (black and white, dark, or every colour at once)
  function tintFor(list) {
    var bins = [], n = 0, total = 0, b, best = 0, bestW = -1, x = 0, y = 0;
    for (b = 0; b < 24; b++) bins.push(0);
    list.forEach(function (f) {
      n += f.n;
      f.bins.forEach(function (v, i) { bins[i] += v; total += v; });
    });
    if (!n || total / n < 0.03) return 0;                 // hardly any colour
    for (b = 0; b < 24; b++) {
      var w3 = bins[(b + 23) % 24] + bins[b] + bins[(b + 1) % 24];
      if (w3 > bestW) { bestW = w3; best = b; }
    }
    if (bestW / total < 0.3) return 0;                    // no colour stands out
    [-1, 0, 1].forEach(function (d) {                      // the hue: the mean around the peak
      var k = (best + d + 24) % 24, a = (k + 0.5) * 15 * Math.PI / 180;
      x += bins[k] * Math.cos(a);
      y += bins[k] * Math.sin(a);
    });
    return [Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360), Math.round(Math.min(1, total / n / 0.2) * 100) / 100];
  }

  // The zoom for a song from its frames' bars, in percent (100 = leave it)
  function zoomFor(frames) {
    if (frames.length < 2) return 100;           // not enough clear frames to be sure
    var top = 1, bottom = 1, tol = 0.012;
    frames.forEach(function (f) { top = Math.min(top, f.top); bottom = Math.min(bottom, f.bottom); });
    var atTop = frames.filter(function (f) { return f.top <= top + tol; });
    var atBottom = frames.filter(function (f) { return f.bottom <= bottom + tol; });
    var edge = function (list, key) { return Math.max.apply(null, list.map(function (f) { return f[key]; })); };
    var bar = Math.max(top, bottom);             // cover both bars fully
    if (Math.min(top, bottom) < 0.015) return 100;   // no bars
    if (atTop.length < 2 || atBottom.length < 2 ||      // bars stay put in every frame...
        Math.abs(top - bottom) > 0.025 ||        // ...are the same at the top and bottom...
        bar > 0.2 ||                             // ...and no bigger than a wide film's
        edge(atTop, "edgeTop") < 0.3 || edge(atBottom, "edgeBottom") < 0.3) return 100;
    return Math.min(135, Math.ceil(101 / (1 - 2 * bar)));   // 1% extra hides a soft edge
  }

  // For test mode: where this song's zoom comes from
  function zoomNote() {
    if (!current) return "";
    if (state.zoom[current] != null) return "set with the remote";
    if (S.songZoom && S.songZoom[current] != null) return "from SETTINGS";
    if (S.autoZoom === false) return "automatic zoom off";
    if (state.auto[current] != null) return state.auto[current] > 100 ? "bars found automatically" : "no bars found";
    if (barsBusy[current]) return "looking for bars";
    if (Date.now() < barsOffUntil) return "can't read YouTube's still frames right now";
    return "not checked yet";
  }

  // A small message in the corner for a moment (volume and zoom changes)
  function toast(text, ms) {
    var box = document.getElementById("vol");
    box.textContent = text;
    box.style.display = "block";
    clearTimeout(volTimer);
    volTimer = setTimeout(function () { box.style.display = "none"; }, ms || 2500);
  }

  /* ---------- opening hours, volume schedule, music off on purpose ---------- */

  function minutesOf(s) {
    var m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(s));
    return m && +m[1] < 25 && +m[2] < 60 ? (+m[1] % 24) * 60 + +m[2] : null;
  }

  function nowMinutes() {
    var d = new Date(Date.now());
    return d.getHours() * 60 + d.getMinutes();
  }

  // Opening hours like "10:00-02:00" or "10:00-14:00, 17:00-01:00". Empty = always open.
  function isOpen() {
    var spec = String(S.openHours || "").trim();
    if (!spec) return true;
    var now = nowMinutes(), parts = spec.split(","), valid = false;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].split("-"), a = minutesOf(p[0]), b = minutesOf(p[1]);
      if (p.length !== 2 || a == null || b == null) continue;
      valid = true;
      if (a === b) return true;                  // "00:00-00:00": open all day
      if (a < b ? now >= a && now < b : now >= a || now < b) return true;
    }
    return !valid;                               // nothing readable: always open
  }

  // Percent of normal volume right now, from volumeSchedule like { "10:00": 60, "18:00": 100 }
  function scheduleVolume() {
    var sch = S.volumeSchedule, list = [], k;
    if (sch instanceof Array) {
      for (k = 0; k < sch.length; k++) if (sch[k]) list.push([minutesOf(sch[k].from), Number(sch[k].volume)]);
    } else if (sch && typeof sch === "object") {
      for (k in sch) if (Object.prototype.hasOwnProperty.call(sch, k)) list.push([minutesOf(k), Number(sch[k])]);
    }
    list = list.filter(function (e) { return e[0] != null && !isNaN(e[1]); })
               .sort(function (a, b) { return a[0] - b[0]; });
    if (!list.length) return 100;
    var now = nowMinutes(), v = list[list.length - 1][1];   // before the day's first time, the last one still holds
    for (var i = 0; i < list.length; i++) if (list[i][0] <= now) v = list[i][1];
    return Math.max(0, Math.min(100, v));
  }

  // Every 10 seconds: opening hours, the call to prayer, and the playlist for this time of day
  function checkHours() {
    var now = Date.now(), open = isOpen() || now < openAnywayUntil;
    if (!URL_LIST && playlistId(scheduledList()) !== LIST) pendingRestart = true;   // switches between two songs
    if (!open) {
      if (quiet !== "closed") goQuiet("closed");
      return;
    }
    var pr = prayerNow(now);
    if (pr && quiet !== "paused" && pr.key !== prayerSkip) {
      prayerUntil = pr.until;
      prayerName = pr.name;
      if (quiet !== "prayer") goQuiet("prayer");
      return;
    }
    if (quiet === "closed" || quiet === "prayer") resume();
  }

  // Minutes until the end of the opening period we're in (null: no opening hours set)
  function minutesToClose() {
    var spec = String(S.openHours || "").trim();
    if (!spec) return null;
    var d = new Date(Date.now()), now = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, best = null;
    spec.split(",").forEach(function (part) {
      var p = part.split("-"), a = minutesOf(p[0]), b = minutesOf(p[1]);
      if (p.length !== 2 || a == null || b == null || a === b) return;
      if (!(a < b ? now >= a && now < b : now >= a || now < b)) return;
      var left = (b - now + 1440) % 1440;
      if (best == null || left < best) best = left;
    });
    return best;
  }

  // The volume's share in the last minutes before closing: it eases down to almost nothing
  // (1 = not closing; not after "Play anyway" past closing time)
  function closingShare() {
    var mins = Number(S.closingFade) || 0;
    if (mins <= 0 || Date.now() < openAnywayUntil) return 1;
    var left = minutesToClose();
    if (left == null || left >= mins) return 1;
    return Math.pow(10, (Math.max(0, left / mins) - 1) * 1.5);
  }

  // "Quiet for a minute": the music at quietLevel percent
  function quietShare() {
    var q = Number(S.quietLevel);
    return isNaN(q) ? 0.15 : Math.max(0, Math.min(100, q)) / 100;
  }

  // Music off on purpose (closing time, or paused from the phone): the song fades
  // out, the café screen stays up and the video is paused
  function goQuiet(why) {
    if (!quiet) quietSince = Date.now();
    quiet = why;
    nextSlide();                                 // (for the call to prayer: the café's name, and why)
    clearTimeout(skipTimer);
    picEnding = true;
    picFadeSecs = 1.5;
    setPicture("fadeout");
    fadeLevel(0, 1.5);
    skipTimer = setTimeout(function () {
      if (quiet && player) { try { player.pauseVideo(); } catch (e) {} }
    }, 1600);
  }

  // Music back on: the same song if it was a short pause (or the call to prayer), otherwise the next one
  function resume() {
    if (!quiet) return;
    var shortPause = (quiet === "paused" || quiet === "prayer") && Date.now() - quietSince < 10 * 60e3 && started;
    quiet = "";
    holdUntil = 0;
    clearTimeout(skipTimer);
    lastMove = Date.now();
    strikes = 0;
    if (!shortPause) return next();
    picEnding = false;
    fadingOut = false;
    needHold = true;                             // YouTube shows the title again after a pause
    showAt = Math.max(showAt, Date.now() + (Number(S.titleSeconds) || 0) * 1000);
    player.playVideo();
    fadeLevel(1, S.fadeIn);
  }

  // A song that won't play: kept on a list (test mode and the phone page) until it plays fine
  function problem(id, what) {
    if (!id) return;
    var vd = (player && player.getVideoData && player.getVideoData()) || {};
    var p = state.problems[id] || { n: 0 };
    p.n++;
    p.what = what;
    p.t = Date.now();
    if (vd.video_id === id && vd.title) p.title = vd.title;
    state.problems[id] = p;
    var ids = Object.keys(state.problems);
    if (ids.length > 60) {                       // keep the 60 most recent
      ids.sort(function (a, b) { return state.problems[a].t - state.problems[b].t; });
      for (var i = 0; i < ids.length - 60; i++) delete state.problems[ids[i]];
    }
    save();
  }

  // New settings (settings.json, or saved on the phone page) take effect at once.
  // A different playlist or API key starts fresh with the next song.
  function checkAppSettings() {
    var v = appSettingsVersion;
    try { v = Number(APP.settingsVersion()) || 0; } catch (e) {}
    if (v === appSettingsVersion) return;
    appSettingsVersion = v;
    var oldList = S.playlist, oldKey = S.apiKey;
    applySettings(appSettings());
    if (S.playlist !== oldList || S.apiKey !== oldKey) pendingRestart = true;
    if (!URL_LIST && playlistId(scheduledList()) !== LIST) pendingRestart = true;
    panelDirty = true;                           // QR codes, words, numerals: drawn again
    prayerDay = "";
    singerCache = {};
    busyChannelList = null;
    layout();
    syncSound(true);
    noCaptions();
    scheduleAt = 0;                              // opening hours checked on the next tick
  }

  /* ---------- songs asked for on the phone, and the last songs played ---------- */

  // playnext: after the song playing now (after any others asked for); playnow: straight away;
  // unnext: off the list again. A song from a link (not in the playlist) plays the same way.
  function songCommand(what) {
    var c = what.indexOf(":"), kind = what.slice(0, c), id = what.slice(c + 1);
    var list = state.upNext.filter(function (v) { return v !== id; });
    if (kind === "playnext" && list.length >= 20) return false;
    if (kind === "playnext") list.push(id);
    if (kind === "playnow") list.unshift(id);
    state.upNext = list;
    save();
    panelDirty = true;
    if (kind !== "playnow" || !ready || !current) return true;   // not playing yet: it's simply first
    if (quiet) {                                 // music off: on again, with this song
      if (quiet === "closed") openAnywayUntil = Date.now() + 3 * 3600e3;
      if (quiet === "prayer") { var pr = prayerNow(Date.now()); prayerSkip = pr ? pr.key : ""; }
      quiet = "";
      holdUntil = 0;
      lastMove = Date.now();
      strikes = 0;
      next();
      return true;
    }
    startFadeOut(0.8);
    clearTimeout(skipTimer);
    skipTimer = setTimeout(next, 900);
    return true;
  }

  // The last 20 songs that really played on this TV (any playlist), for the phone page
  function history() {
    try {
      var h = JSON.parse(localStorage.getItem("tv-history"));
      return h instanceof Array ? h.filter(function (e) { return e && isId(e.id); }) : [];
    } catch (e) { return []; }
  }

  function addHistory(id) {
    if (!id) return;
    var h = history();
    h.push({ id: id, title: titleText(id), t: Date.now() });
    try { localStorage.setItem("tv-history", JSON.stringify(h.slice(-20))); } catch (e) {}
  }

  /* ---------- song names and singers ---------- */

  // A song's [title, channel]: from the app (YouTube's oEmbed), else from the player for the song on now
  function titleOf(id) {
    var t = X.titles && X.titles[id];
    if (t instanceof Array && t[0]) return [String(t[0]), String(t[1] || "")];
    if (id && id === current && player && ready && player.getVideoData) {
      var vd = player.getVideoData() || {};
      if (vd.video_id === id && vd.title) return [String(vd.title), String(vd.author || "")];
    }
    return null;
  }

  function titleText(id) {
    var t = titleOf(id);
    return t ? t[0] : "";
  }

  // "Singer - Song (Official Video) [4K] | other words" -> "Singer - Song"
  function cleanTitle(t) {
    t = String(t || "").replace(NOISE, "").split(/\s+[|｜]\s+/)[0];
    return t.replace(/#\S+/g, "").replace(/\s+[-–—]\s*$/, "").replace(/\s{2,}/g, " ").trim();
  }

  function cleanChannel(c) {
    return String(c || "").replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").replace(/\s+(official|music|channel)$/i, "").trim();
  }

  // { song, singer } from a song's name: "Singer - Song", else the channel is the singer
  function songParts(id) {
    var t = titleOf(id);
    if (!t) return null;
    var title = cleanTitle(t[0]) || t[0], channel = cleanChannel(t[1]);
    var m = title.split(/\s+[-–—]\s+/);
    if (m.length >= 2 && m[0].length <= 60) return { song: m.slice(1).join(" - "), singer: m[0], fromTitle: true };
    return { song: title, singer: channel, fromTitle: false };
  }

  function nameKey(s) {
    return String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  // Channels with songs by many singers (a TV channel, a record label) don't tell the singer
  function busyChannels() {
    if (busyChannelList) return busyChannelList;
    var count = {}, n = 0, k;
    for (var id in X.titles || {}) {
      k = X.titles[id] instanceof Array ? nameKey(cleanChannel(X.titles[id][1])) : "";
      if (k) { count[k] = (count[k] || 0) + 1; n++; }
    }
    busyChannelList = {};
    for (k in count) if (n >= 8 && count[k] > n * 0.4) busyChannelList[k] = true;
    return busyChannelList;
  }

  function singersOf(id) {
    if (singerCache[id]) return singerCache[id];
    var p = songParts(id), out = [];
    if (p && p.fromTitle) {
      p.singer.split(/\s*(?:,|&|\+|\s(?:x|X|feat\.?|ft\.?|with|and)\s|\sو\s)\s*/).forEach(function (n) {
        n = nameKey(n);
        if (n) out.push(n);
      });
    } else if (p && p.singer && !busyChannels()[nameKey(p.singer)]) {
      out.push(nameKey(p.singer));
    }
    if (p) singerCache[id] = out;               // no name yet: asked again once it arrives
    return out;
  }

  // "dashni" and "dashni morad" are the same singer (a name of 5 letters or more that starts the other)
  function sameName(a, b) {
    if (a === b) return true;
    var short = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
    return short.length >= 5 && long.indexOf(short + " ") === 0;
  }

  function sameSinger(a, b) {
    var x = singersOf(a), y = singersOf(b);
    for (var i = 0; i < x.length; i++) for (var j = 0; j < y.length; j++) if (sameName(x[i], y[j])) return true;
    return false;
  }

  function upNextInfo() {
    var n = current ? chooseNext(false) : null;
    return n ? { id: n.id, title: titleText(n.id), asked: !!n.asked } : null;
  }

  /* ---------- from the app: song names, the weather, the café's pictures ---------- */

  function checkExtras() {
    if (!APP || typeof APP.extras !== "function") return;
    var v = -1;
    try { v = Number(APP.extrasVersion()); } catch (e) {}
    if (v === extrasVersion) return;
    extrasVersion = v;
    try { X = JSON.parse(APP.extras() || "{}") || {}; } catch (e) { X = {}; }
    pictureList = X.pictures instanceof Array ? X.pictures.filter(function (id) { return /^[a-z0-9]{6,24}$/.test(id); }) : [];
    singerCache = {};
    busyChannelList = null;
    panelDirty = true;
    var soft = !!(X.box && X.box.softDraw);
    if (soft !== softDraw) { softDraw = soft; layout(); }   // the automatic quality depends on it
  }

  /* ---------- the call to prayer ---------- */

  // Prayer times, worked out the PrayTimes.org way: Muslim World League (Fajr 18°, Isha 17°),
  // Asr Shafi'i, Maghrib at sunset. Hours of the day (local time, tz = hours from UTC).
  function prayerTimes(y, m, d, lat, lon, tz) {
    var rad = Math.PI / 180;
    var sin = function (x) { return Math.sin(x * rad); }, cos = function (x) { return Math.cos(x * rad); };
    var tan = function (x) { return Math.tan(x * rad); }, asin = function (x) { return Math.asin(x) / rad; };
    var acos = function (x) { return Math.acos(x) / rad; }, atan2 = function (a, b) { return Math.atan2(a, b) / rad; };
    var acot = function (x) { return Math.atan(1 / x) / rad; };
    var fix = function (a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; };
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    var jDate = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 - lon / (15 * 24);
    function sun(jd) {
      var D = jd - 2451545.0, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
      var L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D;
      return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(atan2(cos(e) * sin(L), cos(L)) / 15, 24) };
    }
    function midDay(t) { return fix(12 - sun(jDate + t).eqt, 24); }
    function angleTime(angle, t, before) {
      var decl = sun(jDate + t).decl, noon = midDay(t);
      var T = acos((-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat))) / 15;
      return noon + (before ? -T : T);
    }
    var r = {
      fajr: angleTime(18, 5 / 24, true), dhuhr: midDay(12 / 24),
      asr: angleTime(-acot(1 + tan(Math.abs(lat - sun(jDate + 13 / 24).decl))), 13 / 24),
      maghrib: angleTime(0.833, 18 / 24), isha: angleTime(17, 18 / 24)
    };
    for (var k in r) r[k] = fix(r[k] + tz - lon / 15, 24);
    return r;
  }

  // Today's five prayers, [{name, at (ms)}]: amozhgary.tv's times for the town (from the app), else worked
  // out here; each moved by its prayerAdjust minutes
  function todaysPrayers(now) {
    var d = new Date(now), lat = Number(S.lat), lon = Number(S.lon), adj = S.prayerAdjust || {}, site = siteTimes(d);
    var key = d.toDateString() + JSON.stringify(adj) + lat + "," + lon + (site ? site.join(",") : "");
    if (key === prayerDay) return prayerToday;
    prayerDay = key;
    prayerToday = [];
    prayerFrom = site ? "amozhgary.tv" : "";
    var t = {};
    if (site) PRAYERS.forEach(function (n, i) { t[n] = site[[0, 2, 3, 4, 5][i]] / 60; });
    else {
      if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 60) return prayerToday;   // (far north or south the sums don't hold)
      var tz = -new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTimezoneOffset() / 60;
      t = prayerTimes(d.getFullYear(), d.getMonth() + 1, d.getDate(), lat, lon, tz);
    }
    PRAYERS.forEach(function (n) {
      if (isNaN(t[n])) return;
      var mins = Math.floor(t[n] * 60 + 0.5) + (Number(adj[n]) || 0);
      prayerToday.push({ name: n, at: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins).getTime() });
    });
    return prayerToday;
  }

  // The day's times from amozhgary.tv's month (the app gets it): [fajr, sunrise, dhuhr, asr, maghrib,
  // isha] in minutes after midnight, or null when the app has none for this month
  function siteTimes(d) {
    var P = X.prayers, row = null;
    if (P && P.year === d.getFullYear() && P.month === d.getMonth() + 1 && P.days instanceof Array) row = P.days[d.getDate() - 1];
    return row instanceof Array && row.length === 6 && row.every(function (v) { return typeof v === "number" && v >= 0 && v < 1440; }) ? row : null;
  }

  // The prayer whose pause is now, if any: {name, until, key}
  function prayerNow(now) {
    var mins = Number(S.prayerPause) || 0, list = mins > 0 ? todaysPrayers(now) : [];
    for (var i = 0; i < list.length; i++) {
      if (now >= list[i].at && now < list[i].at + mins * 60e3) return { name: list[i].name, until: list[i].at + mins * 60e3, key: list[i].name + list[i].at };
    }
    return null;
  }

  /* ---------- special days ---------- */

  // The Hijri date, {d, m, y, site}, moved by hijriAdjust days: amozhgary.tv's for the town (the app reads
  // its month's table every day, with the prayer times), else worked out by the Umm al-Qura calendar
  function hijri(now) {
    var t = new Date(now + (Number(S.hijriAdjust) || 0) * DAY), k = t.toDateString() + ":" + extrasVersion;
    if (hijriMemo.k === k) return hijriMemo.v;
    var v = siteHijri(t);
    if (!v) try {
      var o = {};
      new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(t)
        .forEach(function (p) { o[p.type] = p.value; });
      v = { d: Number(o.day), m: Number(o.month), y: Number(o.year || o.relatedYear), site: false };
      if (!v.d || !v.m) v = null;
    } catch (e) {}
    hijriMemo = { k: k, v: v };
    return v;
  }

  // amozhgary.tv's Hijri date for a day of the month it sent, or null
  function siteHijri(d) {
    var P = X.prayers, h = null;
    if (P && P.year === d.getFullYear() && P.month === d.getMonth() + 1 && P.hijri instanceof Array) h = P.hijri[d.getDate() - 1];
    if (!(h instanceof Array) || h.length !== 3) return null;
    var v = { d: Number(h[0]), m: Number(h[1]), y: Number(h[2]), site: true };
    return v.d >= 1 && v.d <= 30 && v.m >= 1 && v.m <= 12 && v.y > 1400 && v.y < 1600 ? v : null;
  }

  // Today's special day, if any: newroz, eidFitr, eidAdha, barat (Barat Night), newYear
  function activeDay() {
    var now = Date.now();
    if (now < lookUntil && DAYS[lookDay]) return lookDay;
    if (S.specialDays === false) return "";
    var d = new Date(now), m = d.getMonth() + 1, day = d.getDate(), h = hijri(now);
    if (h && h.m === 10 && h.d <= 3) return "eidFitr";
    if (h && h.m === 12 && h.d >= 10 && h.d <= 13) return "eidAdha";
    if (m === 3 && (day === 20 || day === 21)) return "newroz";
    if (h && h.m === 8 && (h.d === 14 || h.d === 15)) return "barat";
    if ((m === 12 && day === 31 && d.getHours() >= 18) || (m === 1 && day === 1)) return "newYear";
    return "";
  }

  function greeting(day) {
    if (day !== "newYear") return day ? L(day) : "";
    var d = new Date(Date.now());                  // on 31 December (and when shown from the phone): the coming year
    return L("newYear") + " " + nums(d.getMonth() === 0 ? d.getFullYear() : d.getFullYear() + 1);
  }

  function applyDay() {
    var day = activeDay(), brand = document.getElementById("brand"), want = day ? "day-" + day : "";
    if ((brand.getAttribute("data-look") || "") === want) return;
    for (var k in DAYS) brand.classList.remove("day-" + k);
    if (want) brand.classList.add(want);
    brand.setAttribute("data-look", want);
    panelDirty = true;
  }

  // The café screen's picture: the special day's (or the one shown from the phone), the plain one under
  // the call to prayer's line, else the café's own. The greeting is in the day's picture.
  function syncLook() {
    var prayer = quiet === "prayer" && !(Date.now() < lookUntil), day = activeDay();
    var want = lookSrc(prayer ? "plain" : LOOKS[day] ? day : "cafe"), img = $("look");
    if (img.getAttribute("src") !== want) img.setAttribute("src", want);
    setText("brandNote", prayer ? L("prayerNote") : "");
  }

  // A picture the café put in from the phone carries when it did (?v=), so a new one shows at once
  function lookSrc(name) {
    var file = LOOKS[name], own = X.looks && typeof X.looks === "object" ? Number(X.looks[file]) : 0;
    return "looks/" + file + ".jpg" + (own > 0 ? "?v=" + own : "");
  }

  /* ---------- between songs: the café's picture, messages and pictures, and its menu ---------- */

  // The café's picture first, then messages and pictures taking turns; after each of them an item from the
  // menu, when there's one to show
  function slideList() {
    var msgs = (S.messages instanceof Array ? S.messages : []).map(function (m) { return String(m == null ? "" : m).trim(); })
                 .filter(Boolean).slice(0, 30);
    var pics = pictureList.slice(0, 30), own = [{ kind: "name" }];
    for (var i = 0; i < msgs.length || i < pics.length; i++) {
      if (i < msgs.length) own.push({ kind: "msg", text: msgs[i] });
      if (i < pics.length) own.push({ kind: "pic", id: pics[i] });
    }
    if (!menuItems().length) return own;
    var list = [];
    own.forEach(function (x) { list.push(x, { kind: "menu" }); });
    return list;
  }

  // The café screen comes up between two songs (or for a long while): the next one in turn.
  // During the call to prayer and a special day's look from the phone: the café's picture.
  function nextSlide() {
    var list = slideList();
    slideIdx = quiet === "prayer" || Date.now() < lookUntil ? 0 : (slideIdx + 1) % list.length;
    var item = list[slideIdx] || list[0];
    if (item.kind === "menu") item = menuItem(true) || { kind: "name" };
    showSlide(item);
    slideAt = Date.now();
    keepSlides();
  }

  // What comes after the one on now (for the menu: the item whose turn it will be), to be made before its turn
  function upcoming() {
    if (quiet === "prayer" || Date.now() < lookUntil) return null;
    var list = slideList(), item = list[(slideIdx + 1) % list.length];
    if (item && item.kind === "menu") item = menuItem(false);
    return item && item.kind !== "name" ? item : null;
  }

  function slideKey(item) {
    return item.kind + ":" + (item.kind === "msg" ? item.text : item.kind === "menu" ? item.it.id + "/" + menuLang() : item.id || "");
  }

  // The next slide made now, in the slides' box but unseen: its pictures are decoded before its turn rather
  // than in the middle of a fade. Called while nothing changes on the screen.
  function prepareNext() {
    var item = upcoming();
    if (!item) return;
    var key = slideKey(item);
    if (prepared && prepared.key === key && prepared.xv === extrasVersion) return;
    dropPrepared();
    prepared = makePage(item);
    $("slide").appendChild(prepared.el);
  }

  function dropPrepared() {
    if (prepared && prepared.el.parentNode && !prepared.el.classList.contains("shown")) prepared.el.parentNode.removeChild(prepared.el);
    prepared = null;
  }

  function showSlide(item) {
    var box = $("slide"), brand = $("brand"), key = slideKey(item);
    if (key === slideShown) return;
    slideShown = key;
    clearTimeout(slideTimer);
    var unseen = pictureMode === "show";          // the video is on, the café screen away: changed at once
    if (item.kind === "name") {                   // the café's own picture: the slides go
      brand.classList.remove("slide-on");
      if (unseen) { still(box, function () { box.className = ""; }); keepPage(null); }
      else { box.className = ""; slideTimer = setTimeout(function () { keepPage(null); }, 700); }
      return;
    }
    var ready = prepared && prepared.key === key && prepared.xv === extrasVersion, page = ready ? prepared : makePage(item);
    if (ready) prepared = null; else dropPrepared();
    if (!page.el.parentNode) box.appendChild(page.el);
    page.ready.then(function () {
      if (slideShown !== key) return;             // another one's turn came meanwhile
      var quick = ready ? unseen : pictureMode === "show";
      brand.classList.add("slide-on");
      if (quick || box.className !== "on") {      // the only one: at once (on the café screen, the box fades in)
        keepPage(page.el);
        still(page.el, function () { page.el.classList.add("shown"); });
        if (quick) still(box, function () { box.className = "on"; }); else box.className = "on";
      } else {                                    // over the one before, which then goes
        void page.el.offsetWidth;
        page.el.classList.add("shown");
        slideTimer = setTimeout(function () { keepPage(page.el); }, 900);
      }
    });
  }

  // A change without its fade
  function still(el, change) {
    el.style.transition = "none";
    change();
    void el.offsetWidth;
    el.style.transition = "";
  }

  // Only this page left in the slides' box (and the next one, made before its turn)
  function keepPage(keep) {
    var box = $("slide");
    Array.prototype.slice.call(box.children).forEach(function (c) {
      if (c !== keep && !(prepared && c === prepared.el)) box.removeChild(c);
    });
  }

  // A slide's page: a picture from the phone, a message on the plain picture, or an item from the menu.
  // ready: once its pictures are decoded.
  function makePage(item) {
    var el = document.createElement("div"), waits = [];
    el.className = "page";
    if (item.kind === "pic") {
      waits.push(decoded(addImg(el, "/tv/pictures/" + item.id + ".jpg")));
    } else if (item.kind === "msg") {
      waits.push(decoded(addImg(el, lookSrc("plain"))));
      var p = document.createElement("p"), n = item.text.length;
      p.className = "msg";
      p.dir = "auto";
      p.textContent = item.text;
      p.style.setProperty("--msg", (n <= 24 ? 8 : n <= 60 ? 6.4 : n <= 120 ? 5 : 4) + "cqmin");
      el.appendChild(p);
    } else if (item.kind === "menu") {
      menuPage(el, item.it, waits);
    }
    return { key: slideKey(item), xv: extrasVersion, el: el, ready: Promise.all(waits) };
  }

  function addImg(parent, src, cls) {
    var img = document.createElement("img");
    img.alt = "";
    if (cls) img.className = cls;
    img.src = src;
    parent.appendChild(img);
    return img;
  }

  // A picture decoded and ready to show (given up on after 3 seconds); at once where that can't be done ahead
  function decoded(img) {
    return new Promise(function (ok) {
      if (typeof img.decode !== "function") return ok();
      var done = false, fin = function () { if (!done) { done = true; ok(); } };
      img.decode().then(fin, fin);
      setTimeout(fin, 3000);
    });
  }

  /* ---------- the menu between songs ---------- */

  // Items from the café's menu (the phone page's Menu tab, from the app) take their turns one from each
  // category or subcategory at a time, and the weather has its say: on a hot day (28° and up) no hot
  // drinks, and ice cream, milkshakes and fresh juice first; on a cold one (15° and below) none of those,
  // and hot drinks first. Which are which: the café's own categories from the start (by their ids, so
  // whatever they're called now).
  var FOR_HOT = { seedicecream: 1, seedmilkshake: 1, seedfresh: 1 }, FOR_COLD = { seedhot: 1 };
  var HOT_FROM = 28, COLD_TO = 15;

  function menuItems() {
    if (S.menuSlides === false || !(X.menuItems instanceof Array)) return [];
    var all = X.menuItems.filter(function (it) {
      return it && typeof it === "object" && typeof it.id === "string" && /^[a-z0-9]{4,24}$/.test(String(it.picture || "")) && !!menuWord(it.name);
    });
    var w = weatherNow(Date.now()), t = w ? w[1] : null, hot = t != null && t >= HOT_FROM, cold = t != null && t <= COLD_TO;
    var of = function (it, set) { return !!(set[it.sub] || set[it.cat]); };
    var fit = all.filter(function (it) { return !(hot && of(it, FOR_COLD)) && !(cold && of(it, FOR_HOT)); });
    if (!fit.length) fit = all;
    var groups = [], at = {};
    fit.forEach(function (it) {
      var k = String(it.sub || it.cat || "");
      if (!Object.prototype.hasOwnProperty.call(at, k)) { at[k] = groups.length; groups.push([]); }
      groups[at[k]].push(it);
    });
    var lead = hot ? FOR_HOT : cold ? FOR_COLD : null;
    if (lead) groups = groups.filter(function (g) { return of(g[0], lead); }).concat(groups.filter(function (g) { return !of(g[0], lead); }));
    var out = [], i = 0;
    for (; groups.some(function (g) { return i < g.length; }); i++) groups.forEach(function (g) { if (i < g.length) out.push(g[i]); });
    return out;
  }

  // The item whose turn it is (take: and the turn passes on)
  function menuItem(take) {
    var list = menuItems();
    if (!list.length) return null;
    var it = list[menuTurn % list.length];
    if (take) menuTurn++;
    return { kind: "menu", it: it };
  }

  // The menu's words on the TV in the TV's language: Kurdish, Arabic, else English (else whichever there is)
  function menuLang() {
    var l = String(L("locale") || "").toLowerCase();
    return /^(ckb|ku)/.test(l) ? "ku" : /^ar/.test(l) ? "ar" : "en";
  }

  function menuWord(o) {
    if (!o || typeof o !== "object") return "";
    var w = o[menuLang()] || o.ku || o.en || o.ar;
    return typeof w === "string" ? w.trim() : "";
  }

  // An item's slide: its picture big, on a blurred and darkened copy of it, with its category (and
  // subcategory), name, description and price
  function menuPage(el, it, waits) {
    el.className += " menu";
    var src = "/menu/pics/" + it.picture, haze = document.createElement("canvas"), small = document.createElement("img");
    haze.className = "haze";
    haze.width = 48;
    haze.height = 27;
    el.appendChild(haze);
    small.src = src + ".small.jpg";
    waits.push(decoded(small).then(function () { drawHaze(haze, small); }));
    waits.push(decoded(addImg(el, src + ".jpg", "ph")));
    var words = document.createElement("div"), from = document.createElement("p");
    words.className = "words";
    from.className = "from";
    addSpan(from, menuWord(it.catName));
    if (menuWord(it.subName)) {
      addSpan(from, "›", "sep").setAttribute("aria-hidden", "true");   // in the page's direction: ‹ right to left
      addSpan(from, menuWord(it.subName));
    }
    if (from.textContent) words.appendChild(from);
    var name = menuWord(it.name), h = document.createElement("h2");
    h.dir = "auto";
    h.textContent = name;
    if (name.length > 24) h.className = "longer";
    else if (name.length > 13) h.className = "long";
    words.appendChild(h);
    var note = menuWord(it.note);
    if (note) {
      var p = document.createElement("p");
      p.className = "note" + (note.length > 160 ? " longer" : note.length > 90 ? " long" : "");
      p.dir = "auto";
      p.textContent = note;
      words.appendChild(p);
    }
    if (typeof it.price === "number" && it.price >= 0) {
      var pr = document.createElement("p"), b = document.createElement("b"), u = document.createElement("small");
      pr.className = "pr";
      b.textContent = money(it.price);
      u.textContent = rtl() ? UNITS.ku.us : UNITS.en.us;
      pr.appendChild(b);
      pr.appendChild(u);
      words.appendChild(pr);
    }
    el.appendChild(words);
  }

  function addSpan(parent, text, cls) {
    var s = document.createElement("span");
    if (cls) s.className = cls;
    else s.dir = "auto";
    s.textContent = text;
    parent.appendChild(s);
    return s;
  }

  // The blurred copy behind an item's picture: its small copy drawn once onto a canvas the size of a stamp,
  // which the screen stretches smoothly over the whole card, darkened
  function drawHaze(canvas, img) {
    if (!img.naturalWidth || !img.naturalHeight) return;
    var g = null;
    try { g = canvas.getContext("2d"); } catch (e) {}
    if (!g) return;
    var w = canvas.width, h = canvas.height, s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    g.fillStyle = "#0d0b14";
    g.fillRect(0, 0, w, h);
    try { g.filter = "blur(1.2px)"; } catch (e) {}
    g.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    try { g.filter = "none"; } catch (e) {}
    g.fillStyle = "rgba(8, 8, 24, .55)";
    g.fillRect(0, 0, w, h);
  }

  /* ---------- the frame around the video (the info panel) ---------- */

  function L(k) {
    var o = S.labels && typeof S.labels === "object" ? S.labels[k] : null;
    return o != null && String(o).trim() !== "" ? String(o) : LABELS[k] || "";
  }

  function $(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var e = $(id);
    if (e && e.textContent !== text) e.textContent = text;
  }

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function svgOf(viewBox, inner, cls) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    e.setAttribute("viewBox", viewBox);
    if (cls) e.setAttribute("class", cls);
    e.innerHTML = inner;
    return e;
  }

  // Right-to-left words (Kurdish, Arabic...): the whole screen is mirrored, the video on the right
  function rtl() {
    return /^(ckb|ar|fa|he|ur|ku-arab|sdh|lrc)\b/i.test(L("locale"));
  }

  // Kurdish digits (١٢٣) or Latin ones (123): the numerals setting; "auto" = the language's own
  function kurdishDigits() {
    var n = String(S.numerals || "auto").toLowerCase();
    if (n === "kurdish" || n === "arabic") return true;
    if (n === "latin") return false;
    return /^(ckb|ar|ku-arab|sdh)\b/i.test(L("locale"));
  }

  // The numbers the TV writes itself, in those digits: 1,250.5 -> ١٬٢٥٠٫٥ and 80% -> ٨٠٪.
  // Song names, the Wi-Fi password and the café's messages never go through this: they stay as written.
  function nums(s) {
    s = String(s == null ? "" : s);
    if (!kurdishDigits()) return s;
    return s.replace(/\d+(?:[.,]\d+)*/g, function (m) {
      return m.replace(/\d/g, function (d) { return "٠١٢٣٤٥٦٧٨٩".charAt(Number(d)); })
              .replace(/,/g, "٬");                      // decimals keep a plain dot: Vazirmatn's ٫ looks like a slash
    }).replace(/%/g, "٪");
  }

  // Starts at once (before YouTube): the clock works even with no internet
  function startPanel() {
    slideAt = Date.now();                        // the café's name first
    layout();
    checkExtras();
    panelTick();
    setInterval(panelTick, 1000);
    // Once the typeface has arrived, the prices are measured again (whether they fit in the row)
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawn.market = ""; }); } catch (e) {}
  }

  function panelTick() {
    var now = Date.now(), root = document.documentElement, dir = rtl() ? "rtl" : "ltr";
    if (APP) checkExtras();
    applyDay();
    if (root.dir !== dir) {                      // a right-to-left language: the whole screen mirrored
      root.dir = dir;
      root.lang = dir === "rtl" ? L("locale") : "en";
      $("panel").dir = dir;
      $("band").dir = dir;
      $("market").dir = dir;
      panelDirty = true;
      layout();                                  // the video card to the other side
    }
    syncLook();
    syncColours();
    // A long while on the café screen (closed, paused, slow internet): the next message or picture
    if (!SETUP && pictureMode !== "show" && now - slideAt > 20000 && (slideList().length > 1 || slideIdx)) nextSlide();
    // else the next slide made before its turn, while nothing is changing on the screen
    else if (!SETUP && now - slideAt > 3000 && now - pictureAt > 6000) prepareNext();
    if (!panelOn) return;
    var d = new Date(now), look = [L("locale"), kurdishDigits(), !!S.clock24, L("am"), L("pm")].join("|");
    draw("clock", d.getHours() + ":" + d.getMinutes() + look, drawClock, d);
    draw("date", d.toDateString() + JSON.stringify(hijri(now)) + look + greeting(activeDay()) + L("weekdays") + L("months") + L("hijriMonths") + L("kurdishMonths"), drawDate, d);
    draw("weather", extrasVersion + ":" + d.getHours() + look + S.place + L("weatherCredit"), drawWeather, now);
    draw("music", musicKey(), drawMusic);
    drawProgress();
    draw("codes", JSON.stringify([menuLink(), S.wifiName, S.wifiPassword, L("menu"), L("menuHint"), L("wifi"), L("wifiPassword")]), drawCodes);
    draw("market", JSON.stringify([extrasVersion, S.priceItems, look, L("prices"), L("goldOunce"), L("silverOunce"), L("bitcoin"), own("pound"),
                                   L("perOunce"), L("months"), d.toDateString(), Math.floor(now / 600e3)]), drawMarket);
    panelDirty = false;
  }

  // Each part of the frame is drawn again only when what it shows changed
  function draw(part, key, fn, arg) {
    if (!panelDirty && drawn[part] === key) return;
    drawn[part] = key;
    fn(arg);
  }

  // A time of day as on the clock: "9:05 PM" or "21:05"
  function clockText(ms) {
    var d = new Date(ms), h = d.getHours(), m = ("0" + d.getMinutes()).slice(-2);
    return S.clock24 ? nums(("0" + h).slice(-2) + ":" + m) : nums((h % 12 || 12) + ":" + m) + " " + (h < 12 ? L("am") : L("pm"));
  }

  // When something happened: "9:30 AM" today, else "11 October 9:30 AM"
  function whenText(ms) {
    var d = new Date(ms), months = names("months", 12);
    if (d.toDateString() === new Date(Date.now()).toDateString()) return clockText(ms);
    return (months ? nums(d.getDate()) + " " + months[d.getMonth()] : nums(dateFormat(L("locale"), { day: "numeric", month: "long" }).format(d))) + " " + clockText(ms);
  }

  function drawClock(d) {
    var h = d.getHours(), m = ("0" + d.getMinutes()).slice(-2);
    setText("time", nums((S.clock24 ? ("0" + h).slice(-2) : String(h % 12 || 12)) + ":" + m));
    setText("ampm", S.clock24 ? "" : h < 12 ? L("am") : L("pm"));
  }

  // Dates in the locale's language if the TV's engine knows it, else in British English;
  // the engine writes Latin digits, then they become the TV's own
  function dateFormat(loc, opts) {
    opts = Object.assign({ numberingSystem: "latn" }, opts);
    try { if (Intl.DateTimeFormat.supportedLocalesOf([loc]).length) return new Intl.DateTimeFormat(loc, opts); } catch (e) {}
    return new Intl.DateTimeFormat("en-GB", opts);
  }

  // A label that is a list of names ("weekdays", "months", "hijriMonths"), if it has them all
  function names(k, n) {
    var a = L(k) ? L(k).split(/\s*[,،]\s*/) : [];
    return a.length === n ? a : null;
  }

  // The day of the week and the date, the Hijri date and the Kurdish date (when the Kurdish months are
  // among the words on the TV), and a special day's greeting. In Kurdish, as written in Kurdistan:
  //   دووشەممە، ١٢ی تشرینی یەکەم، ٢٠٢٦  /  ١ی جەمادیەلئەوەڵ، ١٤٤٨  /  ٢٠ی ڕەزبەر، ٢٧٢٦
  // Otherwise "Monday 12 October 2026" and so on.
  function drawDate(d) {
    var days = names("weekdays", 7), months = names("months", 12), hm = names("hijriMonths", 12), km = names("kurdishMonths", 12);
    var h = hijri(d.getTime()), k = kurdishDate(d), ku = /^(ckb|ku)\b/i.test(L("locale")), hj = "";
    var dmy = function (day, month, year) { return ku ? nums(day) + "ی " + month + "، " + nums(year) : nums(day) + " " + month + " " + nums(year); };
    var wd = days ? days[d.getDay()] : dateFormat(L("locale"), { weekday: "long" }).format(d);
    setText("date", wd + (ku ? "، " : " ") +
      (months ? dmy(d.getDate(), months[d.getMonth()], d.getFullYear())
              : nums(dateFormat(L("locale"), { day: "numeric", month: "long", year: "numeric" }).format(d))));
    if (h && hm) hj = dmy(h.d, hm[h.m - 1], h.y);
    else if (h && h.site) hj = nums(h.d + " " + HIJRI_EN[h.m - 1] + " " + h.y + " AH");   // as the engine writes them
    else {
      try {
        var opts = { calendar: "islamic-umalqura", day: "numeric", month: "long", year: "numeric" }, f = dateFormat(L("locale"), opts);
        if (f.resolvedOptions().calendar !== "islamic-umalqura") f = dateFormat("en-GB", opts);
        hj = nums(f.format(new Date(d.getTime() + (Number(S.hijriAdjust) || 0) * DAY)));
      } catch (e) {}
    }
    setText("hijri", hj);
    setText("kurdish", k && km ? dmy(k.d, km[k.m - 1], k.y) : "");
    setText("greeting", greeting(activeDay()));
  }

  // The Kurdish date, {d, m, y}: the solar year's months (six of 31 days, five of 30, then Reşeme), its
  // years 700 on from Newroz (Newroz 2026 began 2726). Newroz, 1 Xakelêwe, on 21 March every year
  // (kurdishNewYear "21march"), or on the day of the spring equinox ("equinox": Iran's calendar, the
  // engine's "persian" one; the same as the true equinox every year to 2150 but 2091, a matter of seconds)
  function kurdishDate(d) {
    var rule = S.kurdishNewYear === "equinox" ? "equinox" : "21march", k = d.toDateString() + ":" + rule;
    if (kurdishMemo.k === k) return kurdishMemo.v;
    var v = (rule === "equinox" && persianDate(d)) || march21Date(d);
    kurdishMemo = { k: k, v: v };
    return v;
  }

  // From 1 Xakelêwe on 21 March: so many days on, in months of 31 days, then 30; Reşeme ends on 20 March
  // (29 days, or 30 when February had 29)
  function march21Date(d) {
    var y = d.getFullYear(), day = Math.round(Date.UTC(y, d.getMonth(), d.getDate()) / DAY);
    if (day < Math.round(Date.UTC(y, 2, 21) / DAY)) y--;
    var n = day - Math.round(Date.UTC(y, 2, 21) / DAY), m = n < 186 ? Math.floor(n / 31) : Math.min(11, 6 + Math.floor((n - 186) / 30));
    return { d: n < 186 ? n - m * 31 + 1 : n - 186 - (m - 6) * 30 + 1, m: m + 1, y: y + 700 };
  }

  // The day in Iran's calendar (Solar Hijri), its years 1321 on: null if the engine hasn't that calendar
  function persianDate(d) {
    try {
      var o = {};
      new Intl.DateTimeFormat("en-u-ca-persian", { day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d)
        .forEach(function (p) { o[p.type] = p.value; });
      var v = { d: Number(o.day), m: Number(o.month), y: Number(String(o.year || o.relatedYear).replace(/\D/g, "")) + 1321 };
      return v.d && v.m && v.m <= 12 && v.y > 2600 ? v : null;
    } catch (e) {
      return null;
    }
  }

  // 18.4 -> "18°", -3 -> "−3°"
  function deg(t) {
    t = Math.round(t);
    return nums((t < 0 ? "−" + -t : String(t)) + "°");
  }

  // The weather now, [time, °C, symbol], from what the app passes on (WeatherAPI.com's measurement, else the
  // hour we're in from the forecast); null when there's none, or it's old
  function weatherNow(now) {
    var W = X.weather || {}, hours = W.hours instanceof Array ? W.hours : [], cur = null;
    hours.forEach(function (h) {
      if (h instanceof Array && h.length >= 3 && typeof h[1] === "number" && h[0] <= now) cur = h;
    });
    if (!cur && hours.length && hours[0] instanceof Array && hours[0][0] - now < 3600e3) cur = hours[0];
    if (W.now instanceof Array && typeof W.now[1] === "number" && Math.abs(now - W.now[0]) < 2 * 3600e3) cur = W.now;
    if (cur && now - cur[0] > 2 * 3600e3) cur = null;   // an old forecast: nothing rather than wrong
    return cur;
  }

  // The weather in one line: picture, temperature, words, the place; MET Norway's credited under it, in small
  function drawWeather(now) {
    var W = X.weather || {}, cur = weatherNow(now);
    $("weather").hidden = !cur;
    setText("credit", cur && W.source !== "weatherapi" ? L("weatherCredit") : "");   // MET Norway's condition: credited where shown
    if (!cur) return;
    $("wicon").innerHTML = weatherIcon(cur[2], "wn");
    setText("temp", deg(cur[1]));
    setText("wwords", L(weatherKind(cur[2])) || "");
    setText("wplace", S.place || "");
  }

  function musicKey() {
    var n = current ? chooseNext(false) : null, a = current ? songParts(current) : null, b = n ? songParts(n.id) : null;
    return JSON.stringify([quiet, current, a, n && n.id, b, prayerUntil, L("nowPlaying"), L("upNext"), L("prayerBand"), S.clock24, kurdishDigits(), L("am"), L("pm")]);
  }

  // A song's picture from YouTube (the one YouTube shows for it everywhere), for the cards; none
  // while it loads or when it can't (no internet)
  function thumb(id, img) {
    var src = isId(id) ? "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" : "";
    if (img.getAttribute("src") === src) return;
    img.style.visibility = "hidden";
    img.onload = function () { img.style.visibility = ""; };
    img.onerror = function () { img.style.visibility = "hidden"; };
    if (src) img.setAttribute("src", src); else img.removeAttribute("src");
  }

  // What's playing and what's next (or why the music stopped)
  function drawMusic() {
    var box = $("music"), nextBox = $("nextBox");
    box.className = quiet === "prayer" ? "still" : "";
    if (quiet === "prayer") {
      box.hidden = false;
      nextBox.hidden = true;
      $("nowThumb").hidden = true;
      $("progress").hidden = true;
      setText("nowLbl", clockText(prayerUntil));
      setText("nowSong", L("prayerBand"));
      setText("nowSinger", "");
      return;
    }
    var now = !quiet && current ? songParts(current) : null;
    box.hidden = !now;
    $("band").classList.toggle("empty", !now);         // no music: the café's name instead
    $("band").setAttribute("data-name", S.brandName || "");
    var n = now ? chooseNext(false) : null, nx = n ? songParts(n.id) : null;
    nextBox.hidden = !nx;
    if (!now) return;
    $("nowThumb").hidden = false;
    thumb(current, $("nowThumb"));
    setText("nowLbl", L("nowPlaying"));
    setText("nowSong", now.song);
    setText("nowSinger", now.singer);
    $("progress").hidden = false;
    if (nx) {
      thumb(n.id, $("nextThumb"));
      setText("nextLbl", L("upNext"));
      setText("nextTitle", nx.song + (nx.singer ? " — " + nx.singer : ""));
    }
    drawProgress();
  }

  // How far into the song: a line that fills, and "1:42 / 3:55"
  function drawProgress() {
    if (!panelOn || !ready || !current || quiet || guarded || !player || typeof player.getDuration !== "function") return;
    var d = Number(player.getDuration()) || 0, t = Math.min(Number(player.getCurrentTime()) || 0, d);
    $("barFill").style.transform = "scaleX(" + (d > 0 ? Math.max(0, Math.min(1, t / d)) : 0).toFixed(4) + ")";
    setText("ptime", d > 0 ? nums(mmss(t) + " / " + mmss(d)) : "");
  }

  // "زێڕی ٢١" -> "زێڕی 21" (tirezh.com's names have Kurdish digits; nums() makes them the TV's digits)
  function latinDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x660); });
  }

  // 165250 -> "165,250", 112.25 -> "112.25", in the TV's digits
  function money(v) {
    v = Math.abs(Number(v)) || 0;
    return nums(v >= 1000 ? String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : String(Math.round(v * 100) / 100));
  }

  function row(list, key) {
    for (var i = 0; list instanceof Array && i < list.length; i++) if (list[i] instanceof Array && list[i][0] === key) return list[i];
    return null;
  }

  // A word on the TV only if it has been set (in settings.json or on the phone), else ""
  function own(k) {
    var o = S.labels && typeof S.labels === "object" ? S.labels[k] : null;
    return o != null && String(o).trim() !== "" ? String(o) : "";
  }

  // The prices in priceItems that tirezh.com has, seven at most: [{name, per, value, unit, trend}], none if
  // the app couldn't reach tirezh.com for 3 hours (old prices are worse than none)
  function priceTiles() {
    var P = X.prices, out = [], ku = rtl(), units = ku ? UNITS.ku : UNITS.en;
    if (!P || typeof P !== "object" || !(Date.now() - (Number(P.fetched) || 0) < 3 * 3600e3)) return out;
    (S.priceItems instanceof Array ? S.priceItems : []).slice(0, 7).forEach(function (k) {
      k = String(k).toLowerCase();
      var r, t = null, gold = /^gold(24|22|21|18)$/.exec(k);
      if (gold) {
        r = row(P.gold, Number(gold[1]));
        if (r) t = { name: ku && r[2] ? nums(latinDigits(r[2])) : "Gold " + r[0] + "K", value: r[1], unit: units.us, trend: r[4] };
      } else if (k === "ounce" || k === "silver" || k === "btc") {
        r = P[k];
        if (r instanceof Array) t = { name: L(k === "btc" ? "bitcoin" : k === "ounce" ? "goldOunce" : "silverOunce"), value: r[0],
                                      unit: k === "btc" ? "$" : "$ " + L("perOunce"), trend: r[1] };
      } else if (/^[a-z]{2,3}$/.test(k)) {
        r = row(P.currencies, k);
        var word = NAME_LABELS[k];                 // its word on the TV, else tirezh.com's Kurdish name (or the English one)
        if (r) t = { name: ku ? (word && own(word)) || r[1] || k.toUpperCase() : (word ? L(word) : CURRENCIES[k]) || k.toUpperCase(),
                     per: PER_100[k] ? (ku ? "100$" : "$100") : "", value: r[3], unit: units[k] || "$", trend: r[4] };
      }
      if (t && Number(t.value) > 0) out.push(t);
    });
    return out;
  }

  // Gold and currency prices from Tirezh Index: seven at most, in one row, centred, never moving: name
  // (with its "100$" label when it is priced for 100 dollars), price (green going up, red going down) with
  // its unit and an arrow; when they were set above them. Prices too long for the row are drawn a little
  // smaller instead (--fit).
  function drawMarket() {
    var tiles = priceTiles(), list = $("tiles");
    $("market").hidden = !tiles.length;
    list.innerHTML = "";
    list.style.removeProperty("--fit");
    if (!tiles.length) return;
    setText("marketLbl", L("prices"));
    setText("marketAt", Number(X.prices.at) > 0 ? whenText(Number(X.prices.at)) : "");
    tiles.forEach(function (t) {
      var li = make("li"), tr = TRENDS[String(t.trend)], cls = tr ? tr[0] : "";
      li.appendChild(make("span", "tn", t.name));
      if (t.per) li.appendChild(make("bdi", "per n", nums(t.per)));
      li.appendChild(make("bdi", "tv n" + (cls ? " " + cls : ""), money(t.value)));
      li.appendChild(make("bdi", "tu", nums(t.unit)));
      if (tr) li.appendChild(svgOf("0 0 13 10", '<path fill="currentColor" d="' + tr[1] + '"/>', cls));
      list.appendChild(li);
    });
    var room = $("ticker").clientWidth, w = list.scrollWidth;
    if (room > 0 && w > room) list.style.setProperty("--fit", String(Math.floor(room / w * 1000) / 1000));
  }

  // A Wi-Fi QR code (phones join the network when they scan it); \ ; , : " are escaped
  function wifiText(name, password) {
    var esc = function (v) { return String(v).replace(/([\\;,:"])/g, "\\$1"); };
    return "WIFI:T:" + (password ? "WPA" : "nopass") + ";S:" + esc(name) + ";" + (password ? "P:" + esc(password) + ";" : "") + ";";
  }

  // A QR code as a picture: dark squares on the card's light background, 2 squares of margin
  function qrSvg(text) {
    try {
      var q = qrcode(0, "M");
      q.addData(text, "Byte");
      q.make();
      var n = q.getModuleCount(), size = n + 4, d = "";
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (!q.isDark(r, c)) continue;
          var run = 1;
          while (c + run < n && q.isDark(r, c + run)) run++;
          d += "M" + (c + 2) + " " + (r + 2) + "h" + run + "v1h-" + run + "z";
          c += run - 1;
        }
      }
      return '<svg viewBox="0 0 ' + size + " " + size + '" shape-rendering="crispEdges"><path fill="#0b0f2d" d="' + d + '"/></svg>';
    } catch (e) {
      return "";
    }
  }

  // The menu's link: menuUrl, else the café's own menu on the TV box (from the app, once it has something in it)
  function menuLink() {
    var own = String(S.menuUrl || "").trim();
    return own || (typeof X.menu === "string" && /^https?:\/\//.test(X.menu) ? X.menu : "");
  }

  // The menu's and the Wi-Fi's QR codes; the Wi-Fi's name and password exactly as typed (they get typed in)
  function drawCodes() {
    var menu = menuLink(), wifi = String(S.wifiName || "").trim(), pw = String(S.wifiPassword || "");
    $("menuCode").hidden = !menu;
    if (menu) {
      $("menuCode").querySelector(".qr").innerHTML = qrSvg(menu);
      setText("menuLbl", L("menu"));
      setText("menuHint", L("menuHint"));
    }
    $("wifiCode").hidden = !wifi;
    if (wifi) {
      $("wifiCode").querySelector(".qr").innerHTML = qrSvg(wifiText(wifi, pw));
      setText("wifiLbl", L("wifi"));
      setText("wifiName", wifi);
      setText("wifiPwLbl", pw ? L("wifiPassword") : "");
      setText("wifiPw", pw);
    }
  }

  /* ---------- weather words and pictures ---------- */

  // MET Norway's symbol ("lightrainshowers_day") -> one of the panel's words
  function weatherKind(sym) {
    var b = String(sym || "").replace(/_(day|night|polartwilight)$/, "");
    if (/thunder/.test(b)) return "thunder";
    if (/sleet/.test(b)) return "sleet";
    if (/snow/.test(b)) return "snow";
    if (/^heavyrain/.test(b)) return "heavyrain";
    if (/^lightrain/.test(b)) return "lightrain";
    if (/rain/.test(b)) return "rain";
    if (b === "clearsky") return "clear";
    return /^(fair|partlycloudy|cloudy|fog)$/.test(b) ? b : "";
  }

  // MET Norway's symbol -> the icon: showers are a cloud with the sun (or the moon) behind it
  function iconName(sym) {
    var b = String(sym || "").replace(/_(day|night|polartwilight)$/, ""), dn = /_night$/.test(sym) ? "night" : "day";
    var showers = /showers/.test(b) ? "partly-cloudy-" + dn + "-" : "";
    if (/thunder/.test(b)) return "thunderstorms-" + (showers ? dn + "-" : "") + (/snow|sleet/.test(b) ? "snow" : "rain");
    if (/sleet/.test(b)) return showers + "sleet";
    if (/snow/.test(b)) return showers + "snow";
    if (/^lightrain/.test(b)) return showers + "drizzle";
    if (/rain/.test(b)) return showers + "rain";
    if (b === "clearsky") return "clear-" + dn;
    if (b === "fair" || b === "partlycloudy") return "partly-cloudy-" + dn;
    return b === "fog" ? "fog" : "cloudy";
  }

  // The icon's insides for an <svg viewBox="0 0 64 64">; each copy on the screen needs its own id
  function weatherIcon(sym, id) {
    return (ICONS[iconName(sym)] || ICONS.cloudy).replace(/§/g, id || "w");
  }

  /* ---------- for the Android app: status and commands (phone control) ---------- */

  window.TwilightTV = {
    status: function () {
      var vd = (player && player.getVideoData && player.getVideoData()) || {};
      var good = allIds.filter(function (v) { return !state.bad[v]; }).length;
      var done = state.played.filter(function (v) { return !state.bad[v]; }).length;
      var problems = Object.keys(state.problems).map(function (id) {
        var p = state.problems[id];
        return { id: id, title: p.title || "", what: p.what || "", count: p.n || 1, last: p.t || 0 };
      }).sort(function (a, b) { return b.last - a.last; });
      return {
        name: S.brandName || "",
        playlist: LIST,
        songs: allIds.length,
        round: { done: done, total: good },
        song: current ? { id: current, title: vd.video_id === current ? vd.title || "" : "",
                          position: ready ? player.getCurrentTime() || 0 : 0,
                          duration: ready ? player.getDuration() || 0 : 0 } : null,
        state: !ready ? "starting" : quiet || (NAMES[player.getPlayerState()] || "?"),
        picture: pictureMode || "off",
        volume: current ? songVolume() : S.volume,
        scheduleVolume: scheduleVolume(),
        zoom: current ? songZoom() : 100,
        zoomNote: zoomNote(),
        muted: muted,
        quality: QUALITY[quality] || quality || "",
        openHours: String(S.openHours || ""),
        open: isOpen(),
        holdUntil: quiet === "paused" ? holdUntil : 0,
        adsSkipped: adsSkipped,
        soundFixes: soundFixes,
        soundFixAt: soundFixAt,
        problems: problems,
        upNext: upNextInfo(),
        asked: state.upNext.map(function (id) { return { id: id, title: titleText(id) }; }),
        history: history().slice().reverse(),
        quietUntil: quietUntil > Date.now() ? quietUntil : 0,
        quietLevel: Math.round(quietShare() * 100),
        prayers: Number(S.prayerPause) > 0 ? todaysPrayers(Date.now()).map(function (p) { return { name: p.name, at: p.at }; }) : [],
        prayersFrom: Number(S.prayerPause) > 0 ? prayerFrom : "",
        hijriFrom: (hijri(Date.now()) || {}).site ? "amozhgary.tv" : "",
        prayerPause: Number(S.prayerPause) || 0,
        prayerUntil: quiet === "prayer" ? prayerUntil : 0,
        prayerName: quiet === "prayer" ? prayerName : "",
        closingIn: closingShare() < 1 ? Math.ceil(minutesToClose()) : 0,
        day: activeDay(),
        panel: panelOn,
        // the song's colour, as the frame takes it ([hue, strength]): the menu on customers' phones glows with it too
        tint: S.videoColors !== false && current && quiet !== "closed" && state.tint[current] instanceof Array ? state.tint[current] : null
      };
    },
    // The songs the app should find names for: the playlist, then any asked for from a link
    songIds: function () {
      var more = state.upNext.concat(current ? [current] : []).filter(function (v) { return allIds.indexOf(v) < 0; });
      return unique(allIds.concat(more));
    },
    // The page's built-in settings (for the phone page's Settings screen) and the ones in use
    settingsInfo: function () {
      return { defaults: Object.assign({ labelWords: LABELS }, DEFAULTS), current: S };   // (labelWords: the TV's words, for the phone)
    },
    // next, pause, resume, unfreeze, vol+, vol-, zoom+, zoom-, identify:<name>, reload, forget,
    // playnext:<video id>, playnow:<id>, unnext:<id>, quiet:<seconds> (0 = back to normal), look:<special day>
    command: function (what) {
      what = String(what || "");
      if (/^(playnext|playnow|unnext):[\w-]{11}$/.test(what)) return songCommand(what);
      if (/^quiet:\d{1,4}$/.test(what)) {
        var secs = Math.min(Number(what.slice(6)), 1800), now = Date.now();
        quietUntil = secs ? Math.min(Math.max(now, quietUntil) + secs * 1000, now + 30 * 60e3) : 0;   // pressed again: longer
        return true;
      }
      if (/^look:\w{1,20}$/.test(what)) {
        if (!DAYS[what.slice(5)]) return false;
        lookDay = what.slice(5);
        lookUntil = Date.now() + 20e3;           // the café screen with that day's look, for 20 seconds
        slideIdx = 0;
        showSlide({ kind: "name" });
        applyDay();
        syncLook();
        syncPicture();
        return true;
      }
      if (what === "forget") {                   // this TV's memory: shuffle history, song volumes, zooms, problem list
        try { localStorage.removeItem(KEY); } catch (e) {}
        state = load();
        reloading = false;
        refresh();
        return true;
      }
      if (what === "reload") { reloading = false; refresh(); return true; }
      if (!ready || !current) return false;
      if (what === "next") {
        if (quiet === "paused") { quietSince = 0; resume(); return true; }
        if (quiet) return false;
        startFadeOut(0.8);
        clearTimeout(skipTimer);
        skipTimer = setTimeout(next, 900);
      }
      else if (what === "pause") { if (quiet !== "closed") { goQuiet("paused"); holdUntil = Date.now() + 3 * 3600e3; } }
      else if (what === "resume") {
        if (quiet === "closed") { openAnywayUntil = Date.now() + 3 * 3600e3; resume(); }
        else if (quiet === "prayer") { var pr = prayerNow(Date.now()); prayerSkip = pr ? pr.key : ""; resume(); }   // this time without the pause
        else resume();
      }
      else if (what === "unfreeze") {            // the picture stuck while the sound plays: the same moment again, freshly decoded
        if (quiet) return false;
        try { player.seekTo(Math.max(0, (player.getCurrentTime() || 0) - 0.2), true); } catch (e) { return false; }
      }
      else if (what === "vol+" || what === "vol-") changeSongVolume(what === "vol+" ? 10 : -10);
      else if (what === "zoom+" || what === "zoom-") changeSongZoom(what === "zoom+" ? 1 : -1);
      else if (what.indexOf("identify:") === 0) toast(what.slice(9), 6000);
      else return false;
      return true;
    }
  };

  /* ---------- full screen, taps and keys, staying awake ---------- */

  // Browsers only allow full screen after a tap or key press, unless the device
  // (OptiSigns, kiosk mode) already shows the page full screen.
  function goFullscreen() {
    var d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) return;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      var p = req.call(el, { navigationUI: "hide" });
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function keepAwake() {
    try {
      if (navigator.wakeLock && !document.hidden) navigator.wakeLock.request("screen").catch(function () {});
    } catch (e) {}
  }

  // Any tap, click or remote button press: full screen, and sound on if it was blocked
  function onUserAction() {
    goFullscreen();
    if (!ready || !current || SETUP) return;     // in quality setup, YouTube's own controls decide
    if (autoplayDead) { autoplayDead = false; hideNote(); }
    if (muted) { setMuted(false); syncSound(true); }
    player.playVideo();
  }
  ["pointerdown", "pointerup", "touchend", "mousedown", "click", "keydown"].forEach(function (ev) {
    document.addEventListener(ev, onUserAction, { capture: true, passive: true });
  });
  document.addEventListener("keydown", function (e) {
    if (SETUP) return;                           // quality setup: the remote moves around YouTube's menu
    var up = e.key === "ArrowUp" || e.key === "+" || e.key === "=";
    var down = e.key === "ArrowDown" || e.key === "-";
    if (up || down) changeSongVolume(up ? 10 : -10);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") changeSongZoom(e.key === "ArrowRight" ? 1 : -1);
  }, true);
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    keepAwake();
    if (ready && current) kick();
  });

  /* ---------- helpers ---------- */

  // Setup problems only: a short message on the screen
  function note(html) {
    var n = document.getElementById("note");
    n.innerHTML = html;
    n.style.display = "block";
    noteShown = true;
  }

  function hideNote() {
    if (!noteShown) return;
    document.getElementById("note").style.display = "none";
    noteShown = false;
  }

  // Planned reload between two songs. If the page's address doesn't answer,
  // keep playing and try again in 15 minutes.
  function refresh() {
    reloading = true;
    fetch(location.href, { cache: "no-store" })
      .then(function (r) { if (r.ok) location.reload(); else throw new Error(); })
      .catch(function () {
        reloading = false;
        loadedAt = Date.now() - S.refreshHours * 3600e3 + 15 * 60e3;
        next();
      });
  }

  // Recovery reload. Waits until the page's address answers, so an internet
  // drop never leaves the TV stuck on a "no connection" screen.
  function reloadSoon(ms) {
    if (reloading) return;
    reloading = true;
    setTimeout(function attempt() {
      if (!/^https?:$/.test(location.protocol)) return location.reload();
      fetch(location.href, { cache: "no-store" })
        .then(function (r) { if (r.ok) location.reload(); else throw new Error(); })
        .catch(function () { setTimeout(attempt, 30e3); });
    }, ms || 0);
  }

  /* ---------- test mode (?debug=1) ---------- */

  // The web engine's version: Android System WebView (an old one plays YouTube but doesn't
  // draw its controls), or Firefox's, in the test version of the app
  function engine() {
    var m = /(Chrome|Firefox)\/(\d+)/.exec(navigator.userAgent);
    return m ? m[1] + " " + m[2] + (m[1] === "Chrome" && +m[2] < 110 ? " (old)" : "") : "unknown";
  }
  var NAMES = { "-1": "starting", "0": "ended", "1": "playing", "2": "paused", "3": "loading", "5": "ready" };
  var QUALITY = { tiny: "144p", small: "240p", medium: "360p", large: "480p", hd720: "720p", hd1080: "1080p",
                  hd1440: "1440p", hd2160: "2160p (4K)", hd2880: "2880p", highres: "above 1080p (1440p / 4K)" };

  function mmss(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
  }

  function debugInfo() {
    var fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    var lines = ["Playlist " + LIST];
    if (!ready) lines.push("Waiting for YouTube...");
    else if (!current) lines.push("Reading the playlist...");
    else {
      var good = allIds.filter(function (v) { return !state.bad[v]; }).length;
      var done = state.played.filter(function (v) { return !state.bad[v]; }).length;
      var vd = (player.getVideoData && player.getVideoData()) || {};
      lines.push(allIds.length + " videos, " + source);
      lines.push("This round: song " + done + " of " + good);
      lines.push("Now: " + (vd.title || "") + "  [" + current + "]");
      lines.push((NAMES[player.getPlayerState()] || "?") + "  " + mmss(player.getCurrentTime()) + " / " +
                 mmss(player.getDuration()) + "   picture " + (pictureMode || "off"));
      lines.push("Zoom " + songZoom() + "% (" + zoomNote() + "; remote left/right to change)");
      lines.push("Sound " + (muted ? "OFF (tap the screen or press OK)" : lastSentMute ? "held (loading / ad / fade)" : "on at " + lastSentVol + "%") +
                 ", this song's volume " + songVolume() + "% (remote up/down to change)" +
                 (soundFixes ? "   YouTube's player changed it by itself " + soundFixes + "x, put back at once" : ""));
      lines.push("Opening hours " + (S.openHours ? S.openHours + (isOpen() ? " (open now)" : " (closed now)") : "not set") +
                 ", volume schedule " + scheduleVolume() + "% of normal now" +
                 (quiet === "closed" ? "   MUSIC OFF: outside opening hours" : quiet === "paused" ? "   MUSIC OFF: paused from the phone" :
                  quiet === "prayer" ? "   MUSIC OFF: call to prayer until " + clockText(prayerUntil) : ""));
      var nx = upNextInfo(), pr = Number(S.prayerPause) > 0 ? todaysPrayers(Date.now()) : [];
      lines.push("Up next: " + (nx ? (nx.title || nx.id) + (nx.asked ? " (asked for on the phone)" : "") : "-") +
                 (state.upNext.length > 1 ? ", then " + (state.upNext.length - 1) + " more asked for" : "") +
                 "   song names known: " + Object.keys(X.titles || {}).length + (Date.now() < quietUntil ? "   QUIET until " + clockText(quietUntil) : ""));
      lines.push("Call to prayer: " + (pr.length ? pr.map(function (p) { return p.name + " " + clockText(p.at); }).join(", ") +
                 " (" + S.prayerPause + " min)" : "no pause") + (activeDay() ? "   special day: " + activeDay() : ""));
      var pids = Object.keys(state.problems);
      if (pids.length) lines.push("Songs that won't play: " + pids.length + " (listed on the phone page): " + pids.slice(0, 4).join(", "));
      lines.push("Quality: " + (QUALITY[quality] || quality || "not reported yet") +
                 "   (player drawn at " + renderW + "x" + renderH + ")");
      lines.push("Ad blocking " + (!S.blockAds ? "off" : adBlocking() ? "on" : "paused for a while (6 skips in a row)") +
                 ": " + adsSkipped + " ads skipped   subtitles " + (S.noSubtitles ? "off" : "allowed") +
                 "   fade in " + (Number(S.fadeIn) || 0) + "s / out " + (Number(S.fadeOut) || 0) + "s, title hidden " +
                 (Number(S.titleSeconds) || 0) + "s");
    }
    lines.push("Screen " + window.innerWidth + "x" + window.innerHeight + ", full screen " + (fs ? "yes" : "no") + ", web engine " + engine() +
               ", info panel " + (panelOn ? "on" : "off") + (X.weather ? ", weather from the app" : ""));
    if (skipped.length) lines.push("Skipped: " + skipped.join(", "));
    var box = document.getElementById("debug");
    box.textContent = lines.join("\n");
    box.style.display = "block";
  }
  if (DEBUG) setInterval(debugInfo, 1000);

  /* ---------- start ---------- */

  window.onYouTubeIframeAPIReady = function () {
    var vars = { autoplay: 0, controls: SETUP ? 1 : 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1 };
    if (S.noSubtitles) vars.cc_load_policy = 0;
    if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
    player = new YT.Player("player", {
      width: 3840,
      height: 2160,
      playerVars: vars,
      events: {
        onReady: onReady,
        onStateChange: onStateChange,
        onError: onError,
        onAutoplayBlocked: onAutoplayBlocked,
        onApiChange: onApiChange,
        onPlaybackQualityChange: function (e) { quality = e.data; }
      }
    });
    layout();
  };

  var tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  tag.onerror = function () { reloadSoon(30e3); };
  document.head.appendChild(tag);
  setTimeout(function () { if (!ready) reloadSoon(0); }, 60e3);
  goFullscreen();      // only works where the device allows it without a tap
  keepAwake();
})();
