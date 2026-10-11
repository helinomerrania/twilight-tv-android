# Twilight TV app

Your café TV page as an Android app for the TV boxes. It plays full screen, starts the music with sound by itself, keeps the screen awake, and opens by itself when the box turns on. On top of that:

- **Phone control:** staff use a page on their phone (café Wi-Fi) for next song, pause, volume and zoom.
- **Settings on the phone:** every setting, on one TV or all of them at once, used straight away.
- **One settings file:** `settings.json` in this repository reaches every TV, with no reinstalling.
- **Schedules:** opening hours, a volume schedule, and the box's own volume reset at opening time.
- **Updates:** new versions download by themselves; staff install them from the phone page.
- **Runs by itself:** sound levelling, Wi-Fi at full power, a restart if the page freezes, and a fresh start every night.

It brings its own web engine (Firefox's), so it works the same on old boxes. YouTube's player inside it is left exactly as YouTube sends it.

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
| Up / down | This song louder or quieter (this TV remembers it) |
| Left / right | Zoom this song in or out, for black bars (remembered too) |
| Hold OK for 3 seconds | Test mode on or off. The page's details appear at the top; the phone address, the PIN and the app's details at the bottom right |
| Back | Nothing, so nobody stops the music by accident |
| Home | Leaves the app. The music stops, and starts again when you open the app |

During quality setup (below), the arrows move a pointer, OK clicks, and Back finishes the setup.

## Phone control

1. On the TV, hold OK for 3 seconds. At the bottom right you'll see something like `Phone control: http://192.168.1.23:8080   PIN 4821`.
2. On a phone connected to the **café Wi-Fi**, open that address and enter the PIN. The phone remembers it.

The page has:
- **Pause music** and **Next song**.
- **Song volume:** this song only, remembered on that TV.
- **Zoom:** for black bars.
- **TV volume:** the box's own volume.
- **Show this TV's name on its screen:** to tell the TVs apart.
- **Other TVs:** each TV's name at the top opens that TV's page.
- **Songs that won't play:** each one links to YouTube.
- **Install update:** appears when a new version is waiting.

A pause starts again by itself after 3 hours. Outside opening hours, the button says **Play anyway**, which plays for 3 hours.

## Highest picture quality

YouTube picks the quality itself. To make it use the highest, choose it once in YouTube's own menu on each TV. YouTube remembers the choice on that TV for weeks.

1. On the phone page, Control tab, press **Choose the highest quality on the TV**.
2. On the TV, a pointer appears. Move it with the remote's arrow buttons and press **OK** to click. A USB mouse plugged into the box works too.
3. Move it over the video, so YouTube shows its controls at the bottom. If they don't appear, click the video once.
4. Click the gear ⚙ at the bottom right (or top right). Choose **Quality**, then the highest number (2160p on a 4K TV).
5. Press **Back** on the TV remote, or **Done** on the phone. Setup also ends by itself after 10 minutes.

During setup the app asks YouTube for the version of its player it gives computers, as a browser's "Desktop site" option does: its controls appear when the pointer moves over the video. The quality choice is saved in the same place either way, so the music afterwards uses it. A line under the instructions on the TV shows which version is on, whether the video is paused, and the picture quality playing.

The Control tab shows the quality YouTube is actually playing.
- **If videos start pausing to load:** the internet can't keep up with that quality. Do the setup again and pick a lower number, or **Auto**.
- **If the quality drops back after some weeks:** YouTube has forgotten the choice. Do the setup again.

## Settings on the phone

On the phone page, open the **Settings** tab. Every setting is there, grouped:
- **Music:** playlist, volume, volume by time of day, opening hours, repeats.
- **Between songs:** fades, café screen at the start and end, cut endings.
- **Picture and YouTube:** quality, automatic zoom, ads, subtitles, café name.
- **This TV box:** its name, its own volume, sound levelling, nightly restart, updates, the PIN.
- **Advanced:** reload interval, YouTube API key.

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
| `tvVolume` | The box's own volume (percent), set at opening time and every night; 0 = leave it | `60` |
| `controlPin` | One PIN for every TV's phone page (4-8 digits); `""` = each TV has its own | `"2580"` |
| `levelSound` | Even out loud and quiet songs | `true` |
| `restartAt` | Time of the nightly fresh start; `""` = never | `"05:00"` |
| `updates` | Download new versions by themselves | `true` |

Every setting of the page itself can go in the same file too: `fadeIn`, `fadeOut`, `titleSeconds`, `brandEnding`, `brandName`, `quality`, `autoZoom`, `songVolume`, `songZoom`, `blockAds`, `noSubtitles`, `cutEnding`, `noRepeat`, `refreshHours`. Their explanations are at the top of `app/src/main/assets/index.html`.

Keep the quotes and commas as they are. If the file ever has a mistake in it, the TVs keep using the last good settings, and test mode says so.

## Updates

When anything in this repository changes on the `main` branch, GitHub builds a new version (about 5 minutes) and publishes it under **Releases**. Every TV checks for new versions every 6 hours and downloads them (about 85 MB, so give it a few minutes). Nothing pops up on the TV by itself. When the phone page shows **Install update**:

1. Press it on the phone.
2. Look at the TV and press **Install** with the remote. The app restarts by itself.

The first time only, Android asks you to allow Twilight TV to install apps. Switch it on, press Back, then press **Install update** again.

## What runs by itself

- **Sound levelling.** Android's own sound compressor makes quiet and loud songs closer in volume. If the box doesn't allow it, test mode says so and nothing changes.
- **Wi-Fi at full power** while the app is on screen, so 4K streaming doesn't stutter.
- **A frozen page is reloaded** after 2 minutes. If that happens three times in half an hour, the app starts a whole new web engine.
- **A fresh start every night** at `restartAt` (05:00 unless you change it).

## Good to know

- The repository includes the app's signing key (`app/twilight-tv.keystore`). That's what lets every new build update the app in place. In a public repository anyone could copy it, but it does nothing to your TVs unless someone installs their own app on them.
- `settings.json` is public too, including `controlPin` if you set one. The PIN only works from the café Wi-Fi.
- If a TV switches itself off after a few hours, turn off its own "Auto power off" or sleep timer. Some TVs turn off after hours without a remote press.
- The app needs internet for YouTube. If the internet drops, it shows the café screen and tries again by itself.
- The app's small web server hands the TV page to Firefox's engine at `http://localhost`, to the box itself only; phones on the café Wi-Fi only get the phone page. The page checks in with the app every second, which is how settings and the phone's commands reach it.
- Firefox's engine keeps its own memory, so the shuffle, song volumes and zooms started fresh when each TV moved to it.
- After using ADB or Developer options on a box, turn **USB debugging** and any network debugging off again: otherwise anyone on the café Wi-Fi could control the box.
- Changes on any other branch than `main` are only built as a test. They're never published to the TVs.
