# Twilight TV app

Your café TV page as an Android app for the TV boxes. It plays full screen, starts the music with sound by itself, keeps the screen awake, and opens by itself when the box turns on. On top of that:

- **The video in a frame of cards:** what's playing and what's next (with their pictures), the time and date (with the Hijri and Kurdish dates), Ranya's weather, QR codes for the Wi-Fi and the menu, and gold and currency prices from tirezh.com. In Kurdish the whole screen is right to left, with Kurdish digits (١٢٣).
- **Phone control:** staff use a page on their phone (café Wi-Fi) for next song, pause, volume and zoom, to choose a song or play any YouTube link, and for "Quiet for a minute". It can go on the phone's home screen.
- **The café's own messages and pictures** on the café screen between songs, uploaded from the phone.
- **The café's menu:** customers scan the menu code on the TV and the menu opens on their phone: categories, items, prices and pictures, in Kurdish, Arabic or English. Staff change it on the phone page's Menu tab.
- **The call to prayer:** the music pauses for 5 minutes at each prayer, during opening hours, at amozhgary.tv's times for Ranya.
- **Special days:** Newroz, Eid al-Fitr, Eid al-Adha, Barat Night and New Year each get their own picture on the café screen and a greeting.
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
| Hold Back for 2 seconds | My TV Plus (the one other app allowed, see below) |
| Hold Back for 10 seconds | Unlocks the box for 15 minutes, for its own settings or another app |
| Home | Twilight TV comes back in a few seconds (from My TV Plus too). With the box unlocked, or the lock off, it leaves the app: the music stops, and starts again when you open the app |

During quality setup (below), the arrows move a pointer, OK clicks, and Back finishes the setup.

## Keeping the box in Twilight TV

Whatever else is opened on the box (its home screen, its settings, another app) is sent away in a few seconds, and Twilight TV comes back. The one exception is **My TV Plus**: hold Back on the remote for 2 seconds (or press **Open My TV Plus** on the phone) to open it. What it opens itself, such as a player of its own, is fine too, but not the box's settings or app store. Press Home to come back to the music. The music stops while My TV Plus is open, and starts again after.

It needs two of Android's permissions for Twilight TV, which only someone at the TV can switch on:
- **Display over other apps**, the same one that starts the app with the TV (asked at the first start). Without it, the app can't come back by itself.
- **Usage access** (asked once, after that). It tells the app which app is on screen, so Twilight TV also comes back when My TV Plus is closed with Back instead of Home, and nothing can be opened from the box's home screen on the way. If the box has no such setting, it can be switched on from a computer: `adb shell appops set com.twilightcafe.tvplayer GET_USAGE_STATS allow`.

The phone's Settings tab shows the lock's state under **Tools**, with **Unlock the box for 15 minutes** for the box's own settings (or hold Back for 10 seconds). It locks again by itself. **Keep the box in Twilight TV** and **The one other app allowed** (its name as on the box) are under **This TV box**; `lockApps` and `otherApp` in `settings.json` do the same for every box.

## Phone control

1. On the TV, hold OK for 3 seconds. At the bottom right you'll see something like `Phone control: http://192.168.1.23:8080   PIN 4821`.
2. On a phone connected to the **café Wi-Fi**, open that address and enter the PIN. The phone remembers it.

To put it on the phone's home screen with the café's icon: in the phone's browser menu, choose **Add to Home screen** (on an iPhone: Share, then **Add to Home Screen**).

The **Control** tab has:
- **Pause music** and **Next song**, and what's coming next.
- **Quiet for a minute:** the music goes down to 15% for a minute (press again for longer), then back by itself. **Back to normal volume** ends it early.
- **Picture stuck? Get it moving again:** when the picture freezes but the sound plays on, this plays the same song on from the same moment (a fifth of a second back), with the picture decoded afresh.
- **Song volume:** this song only; the next song is back to the volume in Settings.
- **Zoom:** for black bars.
- **TV volume:** the box's own volume. With **Box volume** set in Settings, every new song goes back to it, whatever the remote did.
- **Choose a song:** search the playlist by name or singer, then **Next** (after the song playing now) or **Now**. Or paste any YouTube link (from YouTube's Share button) and press **Play next** or **Play now**. Songs asked for are listed under **Waiting to play**, where × takes one off again.
- **Last songs:** the last 20 songs, with the time each played. **Again** plays one next.
- **Songs that won't play:** each one links to YouTube.
- **Install update:** appears when a new version is waiting.
- With more than one TV box: **Show this TV's name on its screen**, and each TV's name at the top opens that TV's page.

A pause starts again by itself after 3 hours. Outside opening hours, the button says **Play anyway**, which plays for 3 hours. During the call to prayer it says **Resume music**, which brings the music back for that prayer.

The **Screen** tab has what the TV shows around the video and between songs: which prices, the messages, the pictures, the menu's items between songs, the Wi-Fi for its QR code (and a link to another menu, if you have one), the info panel, numbers and special days, and the words on the TV. The **Menu** tab has the café's menu for customers (below). **Settings** has everything else.

## The café's menu

Customers scan the menu code on the TV (beside the Wi-Fi code) and the menu opens on their phone: the café's name over a twilight sky, the categories along the top, each category opening with its picture across the whole phone (its name and description on it), its subcategories as shorter strips with the category's name before their own (Beverages › Energy Drinks), and each item with its price and picture. It's in Kurdish, with Arabic and English to choose from when you've written names in them (so phones' browsers are told not to offer to translate it). Prices are in dinars, in Kurdish digits (١٢٣) unless **Numbers on the TV** says otherwise. Tapping an item shows its description, and its picture big.

The menu comes from the TV box itself, on the café Wi-Fi, so phones need to be on the Wi-Fi to open it (the Wi-Fi code beside it joins them). It has an address of its own (port 8090, like `http://192.168.1.23:8090/menu/`) with nothing else on it: a customer who takes `/menu/` off the address gets the menu again, never the phone page. The code on the TV always has the box's address of the moment, so it keeps working when the router gives the box a new one. A code printed for the tables would need the box to keep one address: reserve it for the box in the router.

To change it, open the phone page's **Menu** tab. At first it has the café's categories (Hookah Flavors; Drink, with Energy, Fresh, Hot, Milkshake and Soft Drinks; Ice Cream; Nuts; Others), with nothing in them. Tap anything to change it:
- **+ Add an item**, **+ Add a subcategory** and **Add a category** add one.
- Each has a name in Kurdish, Arabic and English: one is enough. Customers see the name in their language, else the Kurdish one. Each can also have a description and a picture from the phone: a category's description is shown under its name (on its picture, when it has one), an item's when a customer taps it. Items have a price in dinars; Kurdish digits are fine.
- **On the menu for customers** switched off hides it (sold out, say) and keeps it for later. A hidden category hides everything in it.
- **On the TV between songs** (items): on unless you switch it off, its slide comes on the café screen between songs in turn (see Between songs).
- **Place on the menu** moves it up or down, or an item to another category or subcategory.
- **Delete** removes it.

**Pictures:** square for items, 1200×1200 is best: the list shows them small, cut to a square from the middle, and big when a customer taps one. Wide for categories, 16:9, 1200×675 is best: across the whole width of the phone. Wider for subcategories, 2:1, 1200×600 is best: a shorter strip. Both have the name and description on them, along the bottom over a dark fade, and are cut to their shape (a long description makes them taller). Any photo works; the phone makes it smaller (1200 pixels at most) before sending it. A picture with a see-through background (a PNG) gets the menu's dark blue behind it.

**Import and export,** at the bottom of the Menu tab:
- **Save as Excel** (or **Save as CSV**) gives the whole menu as a spreadsheet: a row for each category, subcategory and item, in the menu's order, with the columns Type, Kurdish, Arabic, English, Price, the three descriptions, On menu (yes or no), On TV (yes or no, for items: see Between songs), Picture and ID. Change names and prices there, or add rows (a new row needs no ID; an item belongs to the category or subcategory above it), then **Import a file** with it.
- Keep the Picture and ID columns as they are, so pictures stay with their items. Keep it as an Excel file (.xlsx); a CSV from Excel must be saved as **CSV UTF-8**, or the Kurdish letters are lost.
- **Paste a table** takes a table pasted as text: Gemini's answer as it is (with its | lines), or cells copied from a spreadsheet. It works as an imported file does.
- **Save a backup with the pictures** gives one file with everything. Importing it puts the whole menu, pictures too, on this TV or another one.
- An imported file takes the place of the menu on the TV, after you say yes to what's in it. A file with an **ID** column and no Type column changes only what its other columns hold (descriptions written somewhere else, say, or prices), for the IDs in it; everything else stays, and IDs that aren't on the menu are skipped and said.

Each change is saved on the TV at once. If two phones change the menu at the same moment, the second is told and sees the menu as it is now. The menu code appears on the TV once customers can see something on the menu. **Link to another menu** (Screen tab, `menuUrl`) is only for a menu somewhere else: while it's set, the TV shows its code instead.

The menu and its pictures are kept on the TV box; they aren't in `settings.json`.

## The info panel

The video is a card in the top corner (1280x720 on a 1920x1080 screen), with cards around it, as on a TV channel. Under the video: the song playing with its picture, how far into it and how long it is, and the one coming next with its picture. Beside it: the time, the date, the Hijri date and the Kurdish date, the weather now in one line, and two cards with QR codes, one that joins the Wi-Fi (the name and password are written under it too) and one for the menu. Along the bottom: gold and currency prices.

In Kurdish (the words in `settings.json`) the whole screen is mirrored: the video on the right, everything read from the right, and every number the TV writes in Kurdish digits (١٢٣). Song names, the Wi-Fi password and your messages stay exactly as typed.

- **Prices:** from Tirezh Index (tirezh.com), which the app asks every 5 minutes by itself, with tirezh.com's own Kurdish names (the pound's and bitcoin's are words in `settings.json`): the dollar, the euro, the pound, the Turkish lira, the Iranian toman, gold 21 and 18 to begin with (green going up, red going down), with the time tirezh.com set them. Choose up to seven on the phone (Screen tab): 14 currencies, gold by karat (per mithqal), world gold or silver per ounce, bitcoin. They stand still in one row, centred. The dollar is in dinars; the toman, lira, riyal, dirham and Jordanian dinar are so many tomans, liras and so on (تمەن، لیرە، ڕیاڵ، درهەم، دینار) for 100 dollars, with a small grey **100$** label after their name; the other currencies, so many dollars. If the app can't reach tirezh.com for 3 hours, the prices go away rather than show old ones. **Where the prices come from** (Screen tab, or `pricesUrl` in `settings.json` for every TV) takes another address for the same price list: the tirezh worker's workers.dev address, or a new domain (the TV adds `/api/economy` to a bare address).
- **Dates:** in Kurdish as written in Kurdistan: دووشەممە، ١٢ی تشرینی یەکەم، ٢٠٢٦, then the Hijri date (amozhgary.tv's, see Special days), then the Kurdish calendar's (its year starts at Newroz: 2026 is 2726). The Kurdish months are a word in `settings.json` (`kurdishMonths`); without them there's no Kurdish date. **Kurdish date: the year begins on** (Screen tab) is 21 March every year unless you choose the day of the spring equinox, as in Iran's calendar (see Special days).
- **Weather:** from WeatherAPI.com when its key is on the phone (Settings, Weather; a free account at weatherapi.com, no card), checked every 15 minutes, with the temperature measured now. Without a key, from MET Norway (the Norwegian Meteorological Institute), about every 30 minutes; its data is free under the [CC BY 4.0 license](https://creativecommons.org/licenses/by/4.0/), on the condition that MET Norway is credited where it's shown, so "MET Norway" stands under the weather in small. WeatherAPI.com asks for no credit, so with its key there's none. The app keeps the next 48 hours, so a short internet cut changes nothing. The weather pictures are Meteocons by Bas Milius (MIT license). The key goes on the phone: a key in `settings.json`, which is public, is left out.
- **Song names** come from YouTube (once per song, then kept). "(Official Video)", "[4K]" and the like are left out on the TV.
- **The words on the TV** are in English until you type your own (for example in Kurdish) under **Words on the TV** on the Screen tab. A right-to-left language mirrors the whole screen.
- **Numbers on the TV** (Screen tab): in the language's own digits (Kurdish ١٢٣ with Kurdish words), always Kurdish digits, or always 123.
- **Frame in each song's colour** (Screen tab, on unless you turn it off): the frame takes each song's main colour from YouTube's still pictures of it (the same ones the TV reads to find black bars): a soft glow around the video, the room and the cards tinted with it, and the progress line in it. It changes with a slow fade at each new song, while the café screen is up. A song with no clear colour (black and white, or every colour at once) gets the usual dark frame.
- **Info panel off** (Screen tab) shows the video full screen as before.
- **The typeface** is Vazirmatn (by the Vazirmatn Project Authors, SIL Open Font License), built into the page.

## Between songs: messages, pictures and the menu

The café screen is the café's own pictures: one for every day, one each for Newroz, Eid (both Eids), Barat Night and New Year, and a plain one, the room with no words on it, where the TV writes your messages and the call-to-prayer line. To change one, open **Café screen pictures** on the phone's Screen tab and press **Change** under it, then choose a picture on the phone: 16:9, like 1920x1080 (other shapes are cropped to fit), with your words in it. It goes to every TV at once; **Built-in** puts the app's own back. The built-in ones are in `app/src/main/assets/looks`.

Whenever the café screen comes up between two songs, it shows the café's picture (or the day's), or one of your messages, or one of your pictures, in turn, with an item from the menu after each of them. On a long pause it moves to the next one every 20 seconds. Each one is made before its turn, its pictures already decoded, and the café screen fades over the video rather than the video fading, so the changes stay smooth (see If the video stutters).

- **Messages:** Screen tab, **Add a message**, then Save.
- **Pictures:** Screen tab, **Add pictures**, and choose photos on the phone. Each is fitted to the TV whole (nothing cut off), on a blurred copy of itself. Up to 30; × deletes one. They're kept on the TV box itself.
- **The menu:** items from the Menu tab, each with its picture big on a blurred copy of it, its category, name, description and price, in the TV's language (the Kurdish ones on a Kurdish TV, in Kurdish digits). One from each category or subcategory in turn, and the weather picks: on a hot day (28° and up) no hot drinks, with ice cream, milkshakes and fresh juice first; on a cold one (15° and below) no ice cream, milkshakes or fresh juice, with hot drinks first. Which are which goes by the café's own categories from the start (Hot, Ice Cream, Milkshake, Fresh), whatever they're called now; a category added later counts for any weather. An item needs a picture to come. **On the TV between songs** (in an item's editor on the Menu tab) off keeps one away, like water; **Items from the menu between songs** (Screen tab) off turns them all off. Never during the call to prayer.

## The call to prayer

At each of the five prayers, during opening hours only, the music fades out for 5 minutes and the café screen says why; then the same song carries on. The times come from amozhgary.tv's page for Ranya (amozhgary.tv/bang/Ranya, the month's table), which the app reads once a day and keeps; set another town under **Settings, Call to prayer**. If the page can't be read, the TV works the times out itself (Muslim World League: Fajr 18°, Isha 17°, Asr Shafi'i).

- **Today's times** are at the bottom of the Control tab, and beside each prayer under **Settings, Call to prayer**.
- **If they differ from your mosque,** move a prayer by minutes there (for example Asr +2) and Save.
- **Resume music** on the phone during a pause brings the music back for that prayer.
- **0 minutes** switches the pause off.

## Special days

Newroz (20 and 21 March), Eid al-Fitr (1 to 3 Shawwal), Eid al-Adha (10 to 13 Dhu al-Hijjah), Barat Night (14 and 15 Sha'ban) and New Year's Eve (from 18:00) to New Year's Day each get their own picture on the café screen (with its greeting in it), and the greeting under the date in the panel.

The Hijri date, and with it Eid and Barat Night, comes from amozhgary.tv's month for the town (the same page as the prayer times, read every day), so it follows their calendar by itself. When the app can't reach it, the TV works the date out with the Umm al-Qura calendar. If it's still a day early or late compared with Kurdistan's announcement, set **Move the Hijri date, Eid and Barat Night by** on the Screen tab. The Kurdish date needs nothing of the sort: it's a solar calendar, worked out by rule like the ordinary date, so it can't drift. Its year begins on 21 March, Newroz, every year; or, with **Kurdish date: the year begins on** set to the equinox, on the day of the spring equinox, as in Iran's calendar (the engine's, which matches the real equinox every year to 2150). The two give the same dates until 19 March 2028. In years when the equinox comes on 20 March (2028, 2029, 2032, 2033…), they are a day apart all year. The buttons under **See a special day's look on the TV** show each one for 20 seconds, over the video.

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
- **Firefox engine's frame counter on the TV** (Settings, Advanced) shows the engine's own numbers in the top corner of the TV; the app restarts to show or hide them. **FPS** is pictures drawn per second (as many as the video's own, 25 to 60, when all is well). **Rendered picture tiles** should be 0 most of the time: more means parts of the page are drawn again for every frame. **Compositor surface overlays** 1 means the video goes to the screen as a layer of its own; **blits** 1 means it's drawn into the page, which costs far more.

If the picture freezes while the sound plays on: Firefox's engine stops decoding a video it thinks no one sees (under the café screen, at every song's start and end) and after a few seconds' pause, and starting again could leave the picture stuck. The app tells the engine never to stop. If it still happens, **Picture stuck? Get it moving again** on the phone's Control tab gets it going without changing the song.

The info panel is drawn so the video can stay its own layer: the video card's rounded corners are painted over the video, not cut out of it, and nothing beside it moves all the time.

Between songs the café screen fades over the video, and the video itself never fades: a fading video has to be drawn a second time for each of its frames, into a layer of its own at the size YouTube draws it, and a TV box's graphics fall behind, so the fades stuttered. Once faded away, the café screen is hidden altogether, and the next message, picture or menu item is made, its pictures decoded, while the song plays, never during a fade.

## Settings on the phone

On the phone page, open the **Settings** tab. Every setting is there, grouped:
- **Music:** playlist, playlists by time of day, volume, volume by time of day, opening hours, fading out before closing, never the same singer twice in a row, repeats, the "Quiet for a minute" volume.
- **Call to prayer:** how long the music pauses, and moving each prayer by minutes.
- **Between songs:** fades, café screen at the start and end, cut endings.
- **Picture and YouTube:** video format, quality, automatic zoom, ads, subtitles, the café name under the video when no music plays.
- **This TV box:** its own volume, sound levelling, screen resolution and refresh rate, nightly restart, updates, keeping the box in Twilight TV and the one other app allowed, the PIN (and its name, with more than one box).
- **Advanced:** the place for the weather and prayer times, reload interval, YouTube API key.

Change what you like and press **Save on this TV**. Tick **Also on the other TVs** first to save the same settings on every TV the phone page lists (each TV keeps its own name). Changes are used straight away; a new playlist starts with the next song.

Each setting shows where its value comes from:
- **built-in:** the app's own value.
- **settings.json:** the shared file on GitHub (see below).
- **this TV:** saved from the phone. **Use the shared value** removes it again.

The **Tools** at the bottom show or hide test mode on the TV, restart the app, look for a new version, and clear the TV's memory (shuffle history, song volumes, zooms, the list of songs that won't play).

Each TV has its own PIN, or the one you choose in Settings (**PIN for this page**: 6 to 8 digits are far harder to guess than 4). Ten wrong PINs lock that phone out for 10 minutes. And since a new address on the Wi-Fi is easy to get, once 20 wrong PINs have come in an hour from all phones together, only phones that already had the right PIN can come in until the guessing stops; the phone page says so at the top. So customers on the Wi-Fi can't guess their way in.

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
| `levelSound` | Even out loud and quiet songs | `true` |
| `restartAt` | Time of the nightly fresh start; `""` = never | `"05:00"` |
| `updates` | Download new versions by themselves | `true` |
| `videoFormat` | What YouTube sends: `"h264"` (smoothest, up to 1080p), `"vp9"` (up to 4K) or `"any"` (AV1 too). A change here takes effect at the nightly fresh start | `"h264"` |
| `screenSize` | `"1080"` or `"720"`: at most that many lines when the box draws more; `"box"` = the box's own | `"1080"` |
| `screenRate` | `"50"` or `"60"` Hz; `"box"` = the box's own | `"box"` |
| `lockApps` | Keep the box in Twilight TV: anything else opened is sent away, except `otherApp` | `true` |
| `otherApp` | The one other app allowed, by its name on the box or its package | `"My TV Plus"` |
| `pricesUrl` | Where the prices come from: the tirezh worker at another address (`/api/economy` is added to a bare address); `""` = tirezh.com | `"https://tirezh.example.workers.dev"` |

Every setting of the page itself can go in the same file too: `fadeIn`, `fadeOut`, `titleSeconds`, `brandEnding`, `brandName`, `quality`, `autoZoom`, `songVolume`, `songZoom`, `blockAds`, `noSubtitles`, `cutEnding`, `noRepeat`, `refreshHours`, and the newer ones: `playlistSchedule`, `differentSinger`, `quietLevel`, `closingFade`, `prayerPause`, `prayerAdjust`, `place`, `lat`, `lon`, `infoPanel`, `clock24`, `videoColors`, `numerals`, `priceItems` (for example `["us", "eu", "gold21", "gold18"]`), `prayerCity`, `messages`, `menuSlides`, `wifiName`, `wifiPassword`, `menuUrl`, `specialDays`, `hijriAdjust`, `kurdishNewYear` (`"21march"` or `"equinox"`), `labels`. Their explanations are in `app/src/main/assets/tv/settings.js`.

Keep the quotes and commas as they are. If the file ever has a mistake in it, the TVs keep using the last good settings, and test mode says so.

## Updates

When the app changes on the `main` branch, GitHub tests it, builds a new version (about 10 minutes) and publishes it under **Releases**. A change to only the tests or the documents isn't published, so the TVs never download the same app again. Every TV checks for new versions every 6 hours and downloads them (about 85 MB, so give it a few minutes). Nothing pops up on the TV by itself. When the phone page shows **Install update**:

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
- `settings.json` is public too, so the app never takes a PIN or the weather key from it: those are set on the phone. Put the Wi-Fi password on the phone's Screen tab rather than in `settings.json`, so it stays off GitHub.
- If a TV switches itself off after a few hours, turn off its own "Auto power off" or sleep timer. Some TVs turn off after hours without a remote press.
- The app needs internet for YouTube. If the internet drops, it shows the café screen and tries again by itself.
- The app's small web server hands the TV page to Firefox's engine at `http://localhost`, to the box itself only. Phones on the café Wi-Fi get the phone page (with the PIN, port 8080) and the menu (without one, port 8090: a server with nothing else on it, so it can only be read). The box's own requests have threads of their own, so a café full of phones reading the menu never holds up the TV. The page checks in with the app every second, which is how settings and the phone's commands reach it.
- Firefox's engine keeps its own memory, so the shuffle, song volumes and zooms started fresh when each TV moved to it.
- After using ADB or Developer options on a box, turn **USB debugging** and any network debugging off again: otherwise anyone on the café Wi-Fi could control the box.
- Changes on any other branch than `main` are only built as a test. They're never published to the TVs.
- How the code and the pages are organized, and where a change goes: [ARCHITECTURE.md](ARCHITECTURE.md).
