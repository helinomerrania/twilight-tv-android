/* ============================ SETTINGS ============================ */
// Test mode: add ?debug=1 to the end of the page address to see what is playing,
// the picture quality YouTube picked, the volume, ads skipped and any problems.
var SETTINGS = {
  // Your YouTube playlist link (or just its ID). The playlist must be Public or Unlisted.
  // Adding ?list=ANOTHER_PLAYLIST_ID to the end of the page address overrides this.
  playlist: "https://www.youtube.com/playlist?list=PL_6oD4DKbNOvlb8kOY9APBXjC_EtR6eYK",

  // Highest picture quality to ask YouTube for: "auto", 2160 = 4K, 1440, 1080 = Full HD or 720.
  // "auto" is 1080, or 720 on a TV box whose graphics Firefox's engine can't use (it then draws
  // everything on the box's processor). Above 1080 needs the app's video format VP9: YouTube has
  // H.264 up to 1080 only. 4K needs roughly 20 Mbps of internet per TV, and a strong box.
  quality: "auto",

  // Your café's name, under the video while no music plays (paused, closed, the call to prayer).
  // The café screen is the café's own pictures (looks/), with its name in them.
  brandName: "کافتریا و ڕێستورانتی توایڵایت",

  // Seconds the café screen stays up at the start of each song (and after any pause)
  // while YouTube's title is on its own screen. The song's sound already plays.
  // The picture isn't cropped for this. If you still catch the title, raise this to 5.
  titleSeconds: 4,

  // Seconds at the end of each song when the café screen covers the picture, so
  // YouTube's end cards never show. The song itself plays to the end. 0 = off.
  brandEnding: 10,

  // Fade in and fade out between songs, in seconds (0 = no fade).
  fadeIn: 2,
  fadeOut: 3,

  // Volume the page plays at (0-100). On each TV, the remote's up/down arrows
  // turn the song that is playing up or down, until it ends.
  volume: 100,

  // Fixed volumes for particular songs on every TV, by video ID (test mode shows
  // the ID of the song playing). Example: { "dQw4w9WgXcQ": 60, "kJQP7kiw5Fk": 70 }
  songVolume: {},

  // Fill the screen when a video has black bars at the top and bottom (wide
  // "cinema" videos). YouTube publishes three still frames of every video; the
  // page checks them for black bands and zooms in just enough to cover them, up
  // to 135%. A zoomed video loses a little on the left and right. false = off.
  autoZoom: true,

  // Zoom for particular songs on every TV, in percent, by video ID; this beats the
  // automatic zoom. On each TV, the remote's left/right arrows zoom the song that
  // is playing in or out, and that TV remembers it. Example: { "dQw4w9WgXcQ": 135 }
  songZoom: {},

  // Never show or play ads: the café screen stays up, silent, until the song
  // itself starts; an ad in the middle is covered and muted; and a song that
  // YouTube puts an ad in front of is skipped (it comes back in a later round).
  blockAds: true,

  // Keep YouTube's subtitles/captions off. (Lyrics that are part of the video
  // picture itself, like in karaoke videos, can't be removed.)
  noSubtitles: true,

  // Seconds to cut off the end of every video, to avoid the clickable end cards
  // some videos show in their last seconds. 0 = play every song to the end.
  cutEnding: 0,

  // Every song plays once before anything repeats. When a new shuffled round
  // starts, songs that just played are kept out of the next this-many spots.
  noRepeat: 20,

  // Optional, only for very big playlists: without a key, YouTube's player may
  // only hand over the first ~200 videos. A free YouTube Data API key reads them all.
  apiKey: "",

  // Opening hours, e.g. "10:00-02:00" (or "10:00-14:00, 17:00-01:00"). Outside them
  // the music stops and the café screen stays up; it starts again at opening time.
  // "" = always on.
  openHours: "",

  // Quieter or louder at times of day, in percent of normal, from each time on.
  // Example: { "10:00": 60, "18:00": 100 } = 60% from 10 in the morning, full
  // volume from 6 in the evening. {} = always normal.
  volumeSchedule: {},

  // Reloads itself between two songs after this many hours. Keeps the TV
  // fresh and picks up songs you add to the playlist.
  refreshHours: 12,

  // Playlists by time of day: from each time on, this playlist instead of the one at the
  // top. Example: { "10:00": "https://www.youtube.com/playlist?list=PL...", "18:00": "PL..." }
  // Before the first time, the last one still holds. {} = always the playlist at the top.
  playlistSchedule: {},

  // Never two songs by the same singer in a row. The singer is read from the song's
  // title ("Singer - Song") or, failing that, its YouTube channel.
  differentSinger: true,

  // The phone page's "Quiet for a minute" button: the music at this percent meanwhile.
  quietLevel: 15,

  // Minutes before closing time (openHours) in which the music slowly fades out. 0 = off.
  closingFade: 10,

  // Pause the music for the call to prayer, this many minutes, during opening hours only.
  // 0 = off. In the Android app the times come from amozhgary.tv for the town in prayerCity
  // (its name as in amozhgary.tv/bang/Ranya), once a day; otherwise, or "" there, they're worked
  // out for the place below (Muslim World League: Fajr 18°, Isha 17°, Asr Shafi'i). To match
  // your mosque, move a prayer by minutes: { "fajr": 0, "dhuhr": 2, "asr": 1, "maghrib": 3, "isha": 0 }.
  prayerPause: 5,
  prayerCity: "Ranya",
  prayerAdjust: {},

  // The place, for the weather and the prayer times.
  place: "Ranya",
  lat: 36.2549,
  lon: 44.8838,

  // The info panel, a frame around the video: the time, the weather, gold and currency prices,
  // what's playing and what's next, and QR codes for the Wi-Fi and the menu. false = the video
  // full screen. In a right-to-left language (Kurdish) the whole screen is mirrored.
  infoPanel: true,

  // The clock: false = 12-hour (9:30 PM), true = 24-hour (21:30).
  clock24: false,

  // The frame around the video takes each song's colour, from YouTube's still pictures of it: a soft
  // glow around the video, the room and the cards tinted with it, the progress line in it. It changes
  // with a slow fade at each new song. false = the same dark frame always.
  videoColors: true,

  // Gold and currency prices from Tirezh Index, along the bottom in this order, centred:
  // seven at most. Currencies by their code: us (US dollar), eu, gb, tr, ir, sa, ae,
  // jo, ca, ch, se, no, dk, au. Gold by karat: gold24, gold22, gold21, gold18. World prices per ounce:
  // ounce (gold), silver; btc = bitcoin. [] = no prices.
  priceItems: ["us", "eu", "gb", "tr", "ir", "gold21", "gold18"],

  // The numbers on the TV: "auto" = in the language's own digits (١٢٣ with Kurdish words), "kurdish" =
  // always ١٢٣, "latin" = always 123. Song names, the Wi-Fi password and messages stay as written.
  numerals: "auto",

  // Short messages for the café screen between songs, e.g. ["Fresh mint tea is back"].
  messages: [],

  // Between songs, items from the café's menu (the phone page's Menu tab) take turns with the café's own
  // picture, messages and pictures: each with its picture, name, description and price. The weather picks
  // which: no hot drinks on a hot day, no ice cream or fresh juice on a cold one. false = never.
  menuSlides: true,

  // The Wi-Fi's name and password: a QR code that connects phones, and the same as text.
  wifiName: "",
  wifiPassword: "",

  // A link to the menu, for a QR code. "" = the café's own menu from the phone page's Menu tab, once
  // customers would see something in it (the TV box serves it on the café Wi-Fi); else no menu code.
  menuUrl: "",

  // Special days: Newroz, Eid al-Fitr, Eid al-Adha, Barat Night and New Year get their own
  // look on the café screen, and a greeting. Eid and Barat Night follow the Hijri date:
  // amozhgary.tv's for the town (prayerCity), else the Umm al-Qura calendar's. If they still
  // come a day early or late here, move them (and the Hijri date) with hijriAdjust (days).
  specialDays: true,
  hijriAdjust: 0,

  // The Kurdish date, under the Hijri one (when the Kurdish months are among the words on the TV):
  // "21march" = Newroz, 1 Xakelêwe, on 21 March every year, as the Kurdistan Region keeps it; "equinox" = on
  // the day of the spring equinox, as in Iran's calendar (20 March in some years: 2028, 2029, 2032...).
  // Both give the same dates until 19 March 2028.
  kurdishNewYear: "21march",

  // The words on the TV, e.g. in Kurdish: { "nowPlaying": "...", "locale": "ckb" }. Every
  // word left out stays as in LABELS further down.
  labels: {}
};
/* ================================================================== */
