# Twilight TV app

Your café TV page as an Android app for the TV boxes. It plays full screen, starts the music with sound by itself, keeps the screen awake, and opens by itself when the box turns on. On top of that:

- **The video in a frame of cards:** what's playing and what's next (with their pictures), the time and date (with the Hijri date), Ranya's weather, QR codes for the Wi-Fi and the menu, and gold and currency prices from tirezh.com. In Kurdish the whole screen is right to left, with Kurdish digits (١٢٣).
- **Phone control:** staff use a page on their phone (café Wi-Fi) for next song, pause, volume and zoom, to choose a song or play any YouTube link, and for "Quiet for a minute". It can go on the phone's home screen.
- **The café's own messages and pictures** on the café screen between songs, uploaded from the phone.
- **The call to prayer:** the music pauses for 5 minutes at each prayer, during opening hours, at amozhgary.tv's times for Ranya.
- **Special days:** Newroz, Eid al-Fitr, Eid al-Adha, Barat Night and New Year each get their own café screen and a greeting.
- **Settings on the phone:** every setting, on one TV or all of them at once, used straight away.
- **One settings file:** `settings.json` in this repository reaches every TV, with no reinstalling.
- **Schedules:** opening hours, a playlist and a volume for each time of day, a fade-out before closing, and the box's own volume reset at opening time. Never two songs by the same singer in a row.
- **Updates:** new versions download by themselves; staff install them from the phone page.
- **Runs by itself:** sound levelling, Wi-Fi at full power, a restart if the page freezes, and a fresh start every night.

It brings its own web engine (Firefox's), so it works the same on old boxes (Android 8.0 or newer). YouTube's player inside it is left exactly as YouTube sends it.

## Install it on each TV

1. On the TV box, open Google Play and install **Downloader** (by AFTVnews).
2. Open Downloader and type this address:
   `https://github.com/helinomerrania/twilight-tv-android/releases/latest/download/twilight-tv.apk`
3. When the box asks, allow Downloader to install apps. Then choose **Install**, then **Open**.

You can also copy `twilight-tv.apk` to a USB stick and open it with the box's file manager.

**First start:**
- On Android 9 and older, the app opens by itself whenever the box turns on, with nothing to set up.
- On Android 10 and newer, it asks once whether to **start with the TV**. Choose **Open settings**, pick **Twilight TV** and switch it on.

**Firefox's engine comes inside the app,** so the box's own web engine doesn't matter. (On these boxes it's from 2018, too old for YouTube's controls, and they won't take a newer one.) That makes the app about 85 MB. The phone page lists the engine with the facts at the bottom.

## The remote

| Remote | What it does |
| --- | --- |
| Up / down | This song louder or quieter, until it ends (the next song is back to the volume in Settings) |
| Left / right | Zoom this song in or out, for black bars (remembered too) |
| Hold OK for 3 seconds | Test mode on or off. The page's details appear at the top; the phone address, the PIN and the app's details at the bottom right |
| Back | Nothing, so nobody stops the music by accident |
| Home | Leaves the app. The music stops, and starts again when you open the app |

During quality setup (below), the arrows move a pointer, OK clicks, and Back finishes the setup.

## Phone control

1. On the TV, hold OK for 3 seconds. At the bottom right you'll see something like `Phone control: http://192.168.1.23:8080   PIN 4821`.
2. On a phone connected to the **café Wi-Fi**, open that address and enter the PIN. The phone remembers it.

To put it on the phone's home screen with the café's icon: in the phone's browser menu, choose **Add to Home screen** (on an iPhone: Share, then **Add to Home Screen**).

The **Control** tab has:
- **Pause music** and **Next song**, and what's coming next.
- **Quiet for a minute:** the music goes down to 15% for a minute (press again for longer), then back by itself. **Back to normal volume** ends it early.
- **Song volume:** this song only; the next song is back to the volume in Settings.
- **Zoom:** for black bars.
- **TV volume:** the box's own volume. With **Box volume** set in Settings, every new song goes back to it, whatever the remote did.
- **Choose a song:** search the playlist by name or singer, then **Next** (after the song playing now) or **Now**. Or paste any YouTube link (from YouTube's Share button) and press **Play next** or **Play now**. Songs asked for are listed under **Waiting to play**, where × takes one off again.
- **Last songs:** the last 20 songs, with the time each played. **Again** plays one next.
- **Songs that won't play:** each one links to YouTube.
- **Install update:** appears when a new version is waiting.
- With more than one TV box: **Show this TV's name on its screen**, and each TV's name at the top opens that TV's page.

A pause starts again by itself after 3 hours. Outside opening hours, the button says **Play anyway**, which plays for 3 hours. During the call to prayer it says **Resume music**, which brings the music back for that prayer.

The **Screen** tab has what the TV shows around the video and between songs: which prices, the messages, the pictures, the Wi-Fi and the menu link for the QR codes, the info panel, numbers and special days, and the words on the TV. **Settings** has everything else.

## The info panel

The video is a card in the top corner (1280x720 on a 1920x1080 screen), with cards around it, as on a TV channel. Under the video: the song playing with its picture, how far into it and how long it is, and the one coming next with its picture. Beside it: the time, the date and the Hijri date, the weather now in one line, and two cards with QR codes, one that joins the Wi-Fi (the name and password are written under it too) and one for the menu. Along the bottom: gold and currency prices.

In Kurdish (the words in `settings.json`) the whole screen is mirrored: the video on the right, everything read from the right, and every number the TV writes in Kurdish digits (١٢٣). Song names, the Wi-Fi password and your messages stay exactly as typed.

- **Prices:** from Tirezh Index (tirezh.com), which the app asks every 5 minutes by itself, with tirezh.com's own Kurdish names: the dollar, the euro, the Turkish lira, the Iranian toman, gold 21 and 18 to begin with (green going up, red going down). Choose up to eight on the phone (Screen tab): 14 currencies, gold by karat (per mithqal), world gold or silver per ounce, bitcoin. More than fit in one row move slowly across. If the app can't reach tirezh.com for 3 hours, the prices go away rather than show old ones.
- **Weather:** from WeatherAPI.com when its key is on the phone (Settings, Weather; a free account at weatherapi.com, no card), checked every 15 minutes, with the temperature measured now. Without a key, from MET Norway (the Norwegian Meteorological Institute), about every 30 minutes; its data is free under the [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/). Either is credited under the weather. The app keeps the next 48 hours, so a short internet cut changes nothing. The weather pictures are Meteocons by Bas Milius (MIT license). Keep the key on the phone, not in `settings.json`, which is public.
- **Song names** come from YouTube (once per song, then kept). "(Official Video)", "[4K]" and the like are left out on the TV.
- **The words on the TV** are in English until you type your own (for example in Kurdish) under **Words on the TV** on the Screen tab. A right-to-left language mirrors the whole screen.
- **Numbers on the TV** (Screen tab): in the language's own digits (Kurdish ١٢٣ with Kurdish words), always Kurdish digits, or always 123.
- **Info panel off** (Screen tab) shows the video full screen as before.
- **The typeface** is Vazirmatn (by the Vazirmatn Project Authors, SIL Open Font License), built into the page.

## Between songs: messages and pictures

Whenever the café screen comes up between two songs, it shows the café's name, or one of your messages, or one of your pictures, in turn. On a long pause it moves to the next one every 20 seconds.

- **Messages:** Screen tab, **Add a message**, then Save.
- **Pictures:** Screen tab, **Add pictures**, and choose photos on the phone. Each is fitted to the TV whole (nothing cut off), on a blurred copy of itself. Up to 30; × deletes one. They're kept on the TV box itself.

## The call to prayer

At each of the five prayers, during opening hours only, the music fades out for 5 minutes and the café screen says why; then the same song carries on. The times come from amozhgary.tv's page for Ranya (amozhgary.tv/bang/Ranya, the month's table), which the app reads once a day and keeps; set another town under **Settings, Call to prayer**. If the page can't be read, the TV works the times out itself (Muslim World League: Fajr 18°, Isha 17°, Asr Shafi'i).

- **Today's times** are at the bottom of the Control tab, and beside each prayer under **Settings, Call to prayer**.
- **If they differ from your mosque,** move a prayer by minutes there (for example Asr +2) and Save.
- **Resume music** on the phone during a pause brings the music back for that prayer.
- **0 minutes** switches the pause off.

## Special days

Newroz (20 and 21 March), Eid al-Fitr (1 to 3 Shawwal), Eid al-Adha (10 to 13 Dhu al-Hijjah), Barat Night (14 and 15 Sha'ban) and New Year's Eve (from 18:00) to New Year's Day each get their own café screen (fires on the mountains, the crescent and lanterns, the full moon and candles on the shore, fireworks) and a greeting, on the café screen and in the panel.

Eid and Barat Night follow the Umm al-Qura calendar. If Kurdistan announces them a day earlier or later, set **Move Eid and Barat Night by** on the Screen tab. The buttons under **See a special day's look on the TV** show each one for 20 seconds, over the video.

## Highest picture quality

YouTube picks the quality itself. To make it use the highest, choose it once in YouTube's own menu on each TV. YouTube remembers the choice on that TV for weeks.

1. On the phone page, Control tab, press **Choose the highest quality on the TV**.
2. On the TV, a pointer appears. Move it with the remote's arrow buttons and press **OK** to click. A USB mouse plugged into the box works too.
3. Move it over the video, so YouTube shows its controls at the bottom. If they don't appear, click the video once.
4. Click the gear ⚙ at the bottom right (or top right). Choose **Quality**, then the highest number (1080p, unless the video format below is VP9).
5. Press **Back** on the TV remote, or **Done** on the phone. Setup also ends by itself after 10 minutes.

During setup the app asks YouTube for the version of its player it gives computers, as a browser's "Desktop site" option does: its controls appear when the pointer moves over the video. The quality choice is saved in the same place either way, so the music afterwards uses it. A line under the instructions on the TV shows which version is on, whether the video is paused, and the picture quality playing.

The Control tab shows the quality YouTube is actually playing.
- **If videos start pausing to load:** the internet can't keep up with that quality. Do the setup again and pick a lower number, or **Auto**.
- **If the quality drops back after some weeks:** YouTube has forgotten the choice. Do the setup again.

## If the video stutters

The app asks YouTube for video the box's chip decodes by itself, at 1080p at most. If a TV still stutters, the bottom of the phone page's Control tab says why:
- **Video from YouTube:** H.264 only, unless **Video format from YouTube** (Settings, Picture and YouTube) says otherwise. Left to itself, Firefox's engine also accepts AV1, and YouTube sends AV1 for most popular videos. Few TV boxes' chips decode AV1, so the box does it on its processor, which can't keep up. Changing the format restarts the app on that TV.
- **The box's chip decodes:** the formats and sizes the chip plays itself.
- **Graphics:** "too old for Firefox's engine" (the Mali-450 in many cheap boxes) means the engine draws everything on the box's processor. The app then asks YouTube for 720p. The real fix there is a box with newer graphics.
- **Screen:** "drawn at 3840x2160" means the box draws in 4K, four times the work. **Screen resolution** (Settings, This TV box) is up to 1080p unless you change it; the TV still fills its screen.
- **Refresh rate:** if movement jerks slightly in a steady rhythm, the video's frame rate doesn't suit the screen's. Videos made at 25 frames a second move evenly at 50 Hz, and 30 or 60 at 60 Hz: try **Screen refresh rate**.
- If you chose a quality in YouTube's own menu (above), YouTube keeps using it. On a weak box, do that setup again and choose 720p or **Auto**.

## Settings on the phone

On the phone page, open the **Settings** tab. Every setting is there, grouped:
- **Music:** playlist, playlists by time of day, volume, volume by time of day, opening hours, fading out before closing, never the same singer twice in a row, repeats, the "Quiet for a minute" volume.
- **Call to prayer:** how long the music pauses, and moving each prayer by minutes.
- **Between songs:** fades, café screen at the start and end, cut endings.
- **Picture and YouTube:** video format, quality, automatic zoom, ads, subtitles, café name.
- **This TV box:** its own volume, sound levelling, screen resolution and refresh rate, nightly restart, updates, the PIN (and its name, with more than one box).
- **Advanced:** the place for the weather and prayer times, reload interval, YouTube API key.

Change what you like and press **Save on this TV**. Tick **Also on the other TVs** first to save the same settings on every TV the phone page lists (each TV keeps its own name). Changes are used straight away; a new playlist starts with the next song.

Each setting shows where its value comes from:
- **built-in:** the app's own value.
- **settings.json:** the shared file on GitHub (see below).
- **this TV:** saved from the phone. **Use the shared value** removes it again.

The **Tools** at the bottom show or hide test mode on the TV, restart the app, look for a new version, and clear the TV's memory (shuffle history, song volumes, zooms, the list of songs that won't play).

Each TV has its own PIN unless you set one PIN for all of them with `controlPin` (see below). Ten wrong PINs lock that phone out for 10 minutes, so customers on the Wi-Fi can't guess their way in.

## Settings for every TV: `settings.json`

The shared starting point for every TV. Settings saved on a TV from the phone page win over this file on that TV.

Open `settings.json` in this repository, click the pencil (Edit), change a value and click **Commit changes**. Every TV reads it within 30 minutes and uses it straight away. No new build or reinstall is needed.

| Setting | What it does | Example |
| --- | --- | --- |
| `playlist` | The YouTube playlist link | `"https://www.youtube.com/playlist?list=..."` |
| `volume` | Normal volume of the page, 0-100 | `100` |
| `volumeSchedule` | Percent of normal from each time of day | `{ "10:00": 60, "18:00": 100 }` |
| `openHours` | Music only during these hours; café screen otherwise | `"10:00-02:00"` or `"10:00-14:00, 17:00-01:00"` |
| `tvVolume` | The box's own volume (percent), set again at every new song, at opening time and every night; 0 = leave it | `60` |
| `controlPin` | One PIN for every TV's phone page (4-8 digits); `""` = each TV has its own | `"2580"` |
| `levelSound` | Even out loud and quiet songs | `true` |
| `restartAt` | Time of the nightly fresh start; `""` = never | `"05:00"` |
| `updates` | Download new versions by themselves | `true` |
| `videoFormat` | What YouTube sends: `"h264"` (smoothest, up to 1080p), `"vp9"` (up to 4K) or `"any"` (AV1 too). A change here takes effect at the nightly fresh start | `"h264"` |
| `screenSize` | `"1080"` or `"720"`: at most that many lines when the box draws more; `"box"` = the box's own | `"1080"` |
| `screenRate` | `"50"` or `"60"` Hz; `"box"` = the box's own | `"box"` |

Every setting of the page itself can go in the same file too: `fadeIn`, `fadeOut`, `titleSeconds`, `brandEnding`, `brandName`, `quality`, `autoZoom`, `songVolume`, `songZoom`, `blockAds`, `noSubtitles`, `cutEnding`, `noRepeat`, `refreshHours`, and the newer ones: `playlistSchedule`, `differentSinger`, `quietLevel`, `closingFade`, `prayerPause`, `prayerAdjust`, `place`, `lat`, `lon`, `infoPanel`, `clock24`, `numerals`, `priceItems` (for example `["us", "eu", "gold21", "gold18"]`), `prayerCity`, `messages`, `wifiName`, `wifiPassword`, `menuUrl`, `specialDays`, `hijriAdjust`, `labels`. Their explanations are at the top of `app/src/main/assets/index.html`.

Keep the quotes and commas as they are. If the file ever has a mistake in it, the TVs keep using the last good settings, and test mode says so.

## Updates

When anything in this repository changes on the `main` branch, GitHub builds a new version (about 5 minutes) and publishes it under **Releases**. Every TV checks for new versions every 6 hours and downloads them (about 85 MB, so give it a few minutes). Nothing pops up on the TV by itself. When the phone page shows **Install update**:

1. Press it on the phone.
2. Look at the TV and press **Install** with the remote. The app restarts by itself.

The first time only, Android asks you to allow Twilight TV to install apps. Switch it on, press Back, then press **Install update** again.

## What runs by itself

- **Sound levelling.** Android's own sound compressor makes quiet and loud songs closer in volume. If the box doesn't allow it, test mode says so and nothing changes.
- **Wi-Fi at full power** while the app is on screen, so streaming doesn't stutter.
- **A frozen page is reloaded** after 2 minutes. If that happens three times in half an hour, the app starts a whole new web engine.
- **A fresh start every night** at `restartAt` (05:00 unless you change it): a new web engine, or the whole app when the video format changed.

## Good to know

- The repository includes the app's signing key (`app/twilight-tv.keystore`). That's what lets every new build update the app in place. In a public repository anyone could copy it, but it does nothing to your TVs unless someone installs their own app on them.
- `settings.json` is public too, including `controlPin` if you set one. The PIN only works from the café Wi-Fi. Put the Wi-Fi password on the phone's Screen tab rather than in `settings.json`, so it stays off GitHub.
- If a TV switches itself off after a few hours, turn off its own "Auto power off" or sleep timer. Some TVs turn off after hours without a remote press.
- The app needs internet for YouTube. If the internet drops, it shows the café screen and tries again by itself.
- The app's small web server hands the TV page to Firefox's engine at `http://localhost`, to the box itself only; phones on the café Wi-Fi only get the phone page. The page checks in with the app every second, which is how settings and the phone's commands reach it.
- Firefox's engine keeps its own memory, so the shuffle, song volumes and zooms started fresh when each TV moved to it.
- After using ADB or Developer options on a box, turn **USB debugging** and any network debugging off again: otherwise anyone on the café Wi-Fi could control the box.
- Changes on any other branch than `main` are only built as a test. They're never published to the TVs.
