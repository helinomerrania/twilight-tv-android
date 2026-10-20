# How the app is built

Twilight TV is one Android app with three web pages inside it. The app (Java) runs the TV box: it starts Firefox's engine, serves the pages from its own small web server, keeps the settings, fetches what comes from the internet, and looks after the box. The pages (HTML, CSS and JavaScript) are what people see: the TV page on the TV, the phone page on the staff's phones, and the menu on customers' phones.

This file says where everything is and how the parts fit together. For installing and using the app, see [README.md](README.md).

## The picture

```
 TV box ─────────────────────────────────────────────────────────────────────────────
  MainActivity ── Android's events ──> TvApp (makes every part once and wires them)

  Firefox's engine (page/PageEngine) shows the TV page from http://localhost:8080/tv/
      the page checks in every second (POST /tv/sync): what it's doing; back come
      new settings, song names, weather, prices, pictures and the phone's commands

  Web server, port 8080 (phone/ControlServer)
      /tv/...     the TV page and its files .............. the box itself only
      /, /api/... the phone page, with the PIN ........... staff phones on the café Wi-Fi
      /menu/...   the menu ................................ also here, for "See it as customers do"

  Web server, port 8090 (a second ControlServer, menu only)
      /menu/...   the menu, nothing else ................. customers' phones (the menu code on the TV)

  From the internet: settings.json (GitHub), new versions (GitHub releases), song names (YouTube),
  weather (MET Norway or WeatherAPI.com), prices (tirezh.com), prayer times (amozhgary.tv),
  the list of the menu's 3D models (GitHub, for the phone page)
 ────────────────────────────────────────────────────────────────────────────────────

 Customers' phones, from the internet, only when someone opens an item in 3D: the 3D viewer
 (model-viewer, from jsDelivr or unpkg) and the model (the models folder, from GitHub over https)
```

Each server takes the first free port from 8080 (the menu's from 8090), so normally 8080 and 8090.

## Where things are

```
settings.json                           settings for every TV (the app reads it every 30 minutes)
models/                                 the menu's 3D models (.glb), fetched by customers' phones from GitHub
.github/workflows/build.yml             tests and builds every push (but one of only models); from main, publishes a release when the app changed
.github/workflows/jules.yml             hands a task to Jules (an issue labelled ask-jules)
app/build.gradle                        the app's version and what it is built from
app/src/main/AndroidManifest.xml        what Android starts by name
app/src/main/java/com/twilightcafe/tvplayer/   the app, a folder for each job (below)
app/src/main/assets/                    the pages and what they show (below)
app/src/test/java/com/twilightcafe/tvplayer/   the app's tests, in the same folders as the app
tests/pages/                            the pages' tests, in a browser
```

## The app's parts

Each folder has one job. The classes say what they do in a comment at their top.

| Folder | Its job | What's in it |
|---|---|---|
| (top) | What Android starts by name | `MainActivity` (the app's screen: passes Android's events and the remote's keys to TvApp), `BootReceiver` (opens the app at power-on and after an update), `InstallResult` (Android's question during an update), `Restart` (a fresh start of the whole app, from a process of its own) |
| `app/` | Making the parts and wiring them | `TvApp` (makes every part once; the one class that knows them all), `Core` (what every part shares: the screen, the main thread, a background worker, the settings, whether the app is on screen), `AppAssets` (the files built into the app) |
| `page/` | The TV page in Firefox's engine | `PageEngine` (the engine: starting it, trying again, a new view when it crashed), `PageLink` (the page's check-in every second), `PlayerController` (opening the page in its mode, watching it play, restarting it when it froze), `TvPage` (puts the link to the app into the page) |
| `phone/` | The phone page, the menu server and the café network | `ControlServer` (the web servers: their addresses, threads and limits), `PinGuard` (who may try the PIN), `Http` (reading requests, writing replies), `PhoneApi` (hands each request to the part that does it), `PhoneCommands`, `PhoneStatus`, `PhoneSettings`, `PhonePin`, `TvNetwork` (this TV's address and name, the addresses phones use), `TvFinder` (the other TVs) |
| `settings/` | The settings, from their three places | `AppSettings` (the page's built-in values, then settings.json, then this TV's own from the phone; the last good settings.json is kept; the PIN and the weather key are never taken from it) |
| `feeds/` | What comes from the internet for the TV | `Feeds` (keeps them fresh, on a worker of their own), `TitleBook` (song names), `WeatherFeed`, `PriceFeed`, `PrayerFeed` |
| `store/` | What the café keeps on the box | `MenuStore` (the menu), `PictureStore` (the café's pictures), `LookStore` (the café screen's own pictures), `Jpeg` |
| `update/` | New versions | `Updater` (finds a newer release, downloads and checks it, installs it when staff press Install update) |
| `schedule/` | What happens by the clock | `Schedule` (the rules: times in the settings, once a day at a minute, every so often), `Maintenance` (the jobs, every 30 seconds: settings.json, updates, a frozen page, the feeds, the night's fresh start, the volume at opening time) |
| `box/` | The TV box itself | `TvVolume`, `Leveller` (sound levelling), `WifiKeeper`, `BoxInfo` and `BoxReport` (what the box is), `VideoSetup` (choices for smooth video), `Diary` and `BoxWatch` (what happened to the box: restarts, crashes, sleep, for the phone page) |
| `screen/` | The TV's screen | `ScreenMode` (lines and refresh rate), `TestMode` (test mode's details on screen) |
| `lock/` | Keeping the box in Twilight TV | `AppLock` (the rules), `BoxLock` (doing it), `Permissions` (the two questions at the start) |
| `remote/` | The remote control | `RemoteKeys`, `QualitySetup` and `PointerView` (picking the picture quality with a pointer) |
| `util/` | Small helpers for any part | `Net` (web requests, the box's address), `Disk` (files, written safely), `Times` (times as text) |

### How they fit together

- **MainActivity only passes things on.** It makes `TvApp` and hands it Android's events: start, stop, the remote's keys.
- **TvApp is the only place that makes parts.** Each part gets what it needs when it's made, and nothing else, so you can see a part's connections at a glance and test it on its own. A few parts that bring many others together get `TvApp` itself: `PhoneApi`, `PhoneCommands`, `PhoneStatus`, `PhoneSettings`, `Maintenance` and `TestMode`.
- **The ground floor never reaches up.** `util/` uses nothing else in the app; `settings/`, `store/` and `update/` use only `util/`; `feeds/` and `box/` use only `settings/` and `util/`. The features above (`page/`, `phone/`, `schedule/`, `screen/`, `lock/`, `remote/`) use the ground floor and each other. `ArchitectureTest` checks this on every build.
- **The rules are plain Java, beside the Android code that uses them,** so they are tested on a computer: `AppLock` beside `BoxLock`, `VideoSetup` beside `BoxInfo`, `Schedule` beside `Maintenance`, `TvPage` beside `PageEngine`, `PinGuard` and `Http` beside `ControlServer`, and the stores and the feeds' readers.
- **Threads.** Anything that touches the screen runs on the main thread (`core.main`). Slow jobs (settings.json, updates) run on `core.work`; the feeds have a worker of their own; the web servers have their own threads, and the box's own requests have theirs, so a café full of phones never holds up the TV.

### The audit's six parts

The audit suggested taking six jobs out of the old 2,000-line MainActivity. Each is now a part of its own:

| The audit's part | Here |
|---|---|
| PlayerController | `page/`: `PlayerController`, with `PageEngine` and `PageLink` |
| SettingsRepository | `settings/AppSettings`, and `phone/PhoneSettings` for the phone's Settings screen |
| NetworkControlServer | `phone/`: `ControlServer`, `PinGuard`, `Http`, and `PhoneApi` with its parts |
| UpdateManager | `update/Updater` |
| ScheduleManager | `schedule/`: `Schedule` and `Maintenance` |
| FeedRepository | `feeds/`: `Feeds` and the four feeds |

MainActivity is now about 90 lines.

## The pages

| Folder | Page | Address | For |
|---|---|---|---|
| `assets/tv/` | `index.html`, `tv.css`, `fonts.css` (the typefaces, built in), `settings.js` (the page's built-in settings, `var SETTINGS`), `qrcode.js`, `tv.js`; and `bridge.js`, the link to the app, which the app puts in at the top of the page | `http://localhost:8080/tv/index.html` | The TV, from the box itself only |
| `assets/phone/` | `index.html`, `phone.css`, `phone.js` | `http://<the TV>:8080/` | Staff; everything under `/api` needs the PIN |
| `assets/menu/` | `index.html`, `menu.css`, `menu.js` | `http://<the TV>:8090/menu/` | Customers, from the menu code on the TV |
| `assets/home-screen/` | The phone page's icon and its manifest | `/icon-192.png` and the like | The phone page on a phone's home screen |
| `assets/looks/` | The café screen's built-in pictures, each with a small copy | `/tv/looks/<name>.jpg` | The TV page |
| `assets/fonts/` | The typefaces: Vazirmatn, the café's name (only its letters), Aref Ruqaa's Arabic and Latin letters for the menu | `/menu/fonts/<name>.woff2` | The menu, the phone page |

Of the pages' own files, each server hands out only those on its lists in `ControlServer` (`TV_FILES`, `PHONE_FILES`, `MENU_FILES`, and `ASSETS` for the icons). Browsers fetch the pages and their files fresh each time, so a new version of the app shows its new pages at once.

**Adding a file to a page:** put it in the page's folder, add it to that page's list in `ControlServer`, and refer to it from the page. `PageFilesTest` checks that every file on the lists is in the app, that each page asks only for files its server hands out, and that nothing unused sits in the folders.

**Inside the scripts.** `tv.js` (about 2,600 lines) and `phone.js` (about 2,400) are each one script, in sections with a heading comment:

- `tv.js`: memory, shuffle, reading the playlist, player events, the watchdog (picture, ads, fades, stalls), picture, sound, zoom, opening hours and the volume schedule, songs from the phone, song names, the call to prayer, special days, between songs (the café screen, messages, pictures, the menu), the frame around the video, the weather, the link to the app, keys, test mode, and the start.
- `phone.js`: the Now tab (what's playing, the status and the diary, drawn from one report every 2 seconds), choosing a song, the tabs and the Settings tab's pages (the phone's Back button closes a page, and the menu editor), the settings (every one in `FIELDS`, page by page; those no longer on the phone in `RETIRED`), the café's pictures, the café screen's pictures, the menu (and changing one thing on it), the menu in and out (a spreadsheet or a backup), saving (the Save bar shows only while a change isn't saved).

## Tests

There are two sets, and GitHub runs both on every push: first the app's, then the pages'. If a check fails, the build stops and nothing is published, so nothing untested reaches the TVs.

### The app's tests

`./gradlew testDebugUnitTest` runs the tests in `app/src/test`, on a computer: about 120 tests, some of which make many checks in one go (each a sentence saying what it checks, printed "ok" or "FAIL"; `Checks` is their helper), over 400 checks in all.

| Test | What it checks |
|---|---|
| `ArchitectureTest` | The folders keep to the rules above |
| `phone/PageFilesTest` | The pages' files are all there, and each page asks only for what its server hands out |
| `phone/ControlServerRequestsTest` | The two web servers answering real requests: the PIN and its lockouts, every address, the pictures and the menu, the TV page for the box only, slow or crowding phones, the customers' server |
| `phone/ControlServerTest`, `HttpTest`, `PinGuardTest` | Which requests come from the box itself, how long a phone may take to send, reading requests and writing replies, the PIN lockouts |
| `phone/PhoneSettingsTest` | What a phone's save keeps, and each TV keeping its own name when settings are saved on every TV |
| `store/MenuStoreTest`, `PictureStoreTest`, `LookStoreTest` | The menu (saving, two phones at once, what customers see, pictures, the TV's slides), the café's pictures, the café screen's pictures |
| `feeds/FeedsTest`, `PrayerFeedTest`, `PriceFeedTest`, `TitleBookTest` | Song names, the weather, the call to prayer's times from the town's page, the prices from tirezh.com: reading them, keeping them, and what happens offline |
| `schedule/ScheduleTest` | Reading times, once a day, every so often, the box's own time zone |
| `settings/AppSettingsTest` | settings.json and this TV's own settings together; the PIN and the weather key never from settings.json |
| `lock/AppLockTest` | What the lock sends away and what it lets through, in every case |
| `box/VideoSetupTest` | Choices for smooth video: the formats offered to YouTube, graphics Firefox's engine can't use, the screen mode |
| `box/DiaryTest` | The diary: what happened since the app last ran (the box started again by itself or was turned on, the app stopped or was updated), saved at once before the app restarts itself or crashes |
| `update/UpdaterTest` | Build numbers from the release names; downloads cut short or too big are refused |
| `util/NetTest`, `DiskTest` | Web requests and finding the box's address; files written whole, and read back as written |

### The pages' tests

`tests/pages` tries the three pages the way people use them: about 600 checks.

```
cd tests/pages
npm ci
node run.js                 # all of them, in about 3 to 5 minutes
node run.js phone-menu      # or only some
```

They need Node, Java, Chrome or Chromium (`CHROME_PATH` says where, if it isn't in the usual places), and Python 3 with `openpyxl` and `Pillow`. LibreOffice is used when it's installed. `SHOTS=<folder>` keeps screenshots of the pages.

| Suite | What it tries |
|---|---|
| `tv` | The TV page in jsdom, with a stand-in YouTube player and clock: starting, fades, volume and zoom, schedules and opening hours, the call to prayer, special days, the frame around the video, the café screen and menu slides, the link to the app, test mode |
| `tv-files` | The TV page's files from the app's real server, in Chrome: each arrives with its type, and none of them reaches the café network |
| `phone`, `phone-settings`, `phone-screens` | The phone page at phone size, against a stand-in TV: the PIN, the tabs, the controls, choosing songs, the Settings tab's pages and the Save bar, Status and diary, the Screen tab, pictures |
| `phone-menu`, `menu-io`, `menu-pictures` | The Menu tab against the app's real server and menu store: making a menu, Excel and CSV in and out, backups, descriptions, pictures |
| `pin-guessing` | What a phone sees while someone is guessing the PIN |
| `customer-menu` | The customers' menu on a phone: the room in the colours of the song on the TV (held against the TV's own formula), one language at a time, categories, the lists' three layouts, an item up close (Back and pulling it down), 3D and AR (model-viewer stood in for; and the real one's fetching, blocked) |

The suites that need the app's server use `tests/pages/server/PageTestServer.java`: the app's real web servers and menu store, compiled from `app/src/main/java`, with a stand-in for the rest of the app.

## Making a change

1. Find the part by its job in the table above; new code goes in the folder of its job. Only what the manifest names goes in the top folder.
2. A new part is made in `TvApp`, and gets what it needs there.
3. Run `./gradlew testDebugUnitTest`, and for a change to a page, `node run.js` in `tests/pages`.
4. Push to any branch other than `main` for a test build. A change to the app pushed to `main` is published as a new version for every TV, installed when staff press **Install update** on the phone page; a change to only the tests, the documents or the build's own steps isn't published. Running the build by hand (Actions → Build the TV app → Run workflow) always publishes.

Small, well-described jobs can go to Jules, Google's coding agent: an issue with the label **ask-jules** (its title and text are the task), or **Ask Jules → Run workflow** on the Actions tab. Jules opens a pull request; GitHub's build tests it like any other change, and it's checked before it's merged. The workflow uses the repository secret `JULES_API_KEY`, and only the café's own GitHub accounts can start it.

Once a week, on Saturday morning, the same workflow asks Jules for one small improvement of its own choosing (a bug shown by a test, a missing test, clearer code, a wrong comment), unless a pull request is still waiting. GitHub lets the owner know when Jules opens a pull request; it's checked against the rules here before it's merged, and anything that isn't right gets a comment and stays open.
