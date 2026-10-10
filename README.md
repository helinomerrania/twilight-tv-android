# Twilight TV app

Your café TV page as an Android app for the TVs. It plays full screen, starts the music with sound by itself, keeps the screen awake, and can open by itself when the TV turns on. YouTube's player inside it is left exactly as YouTube sends it.

## 1. Let GitHub build the app (free, about 10 minutes)

1. Go to **github.com** and sign in, or create a free account.
2. Click **+** (top right), then **New repository**. Name it `twilight-tv`, choose **Public**, and click **Create repository**. Public lets the TVs download the app straight from a link; see "Good to know" if you'd rather keep it private.
3. On the next page, click **uploading an existing file**. Unzip `twilight-tv-app.zip`, open the `twilight-tv-app` folder, select everything inside it and drag it onto the page. Click **Commit changes**.
4. Check that the file list now shows a folder named **.github**. If it's missing (Macs hide folders whose names start with a dot), click **Add file**, then **Create new file**. Type `.github/workflows/build.yml` as the name, paste in the text from the end of this guide, and click **Commit changes**.
5. Open the **Actions** tab. "Build the TV app" starts by itself and takes about 5 minutes. A green tick means it worked. A red cross means it didn't: open the run, copy the red error text and send it to Claude.
6. Go back to the main page of the repository. Under **Releases** on the right, open the newest "Twilight TV, build …" and you'll find **twilight-tv.apk**.

## 2. Install it on each TV

The easiest way is the **Downloader** app:

1. On the TV, open Google Play and install **Downloader** (by AFTVnews).
2. Open Downloader and type this address:
   `https://github.com/helinomerrania/twilight-tv-android/releases/latest/download/twilight-tv.apk`
3. When the TV asks, allow Downloader to install apps. Then choose **Install**, then **Open**.
   - On Google TV there may be no such question. Turn on Developer options first (Settings > System > About, then click "Android TV OS build" 7 times), then allow Downloader under Settings > Apps > Security & restrictions > Unknown sources. Menu names vary between TVs.

You can also copy `twilight-tv.apk` to a USB stick and open it with the TV's file manager.

**First start (Android 10 and newer):** the app asks once whether to **start with the TV**. Choose **Open settings**, pick **Twilight TV** and switch it on. If the TV says the setting isn't available, open the app from the apps row after the TV turns on. Some TV boxes have their own "start-up app" setting you can use instead.

## Using it

| Remote | What it does |
| --- | --- |
| Up / down | This song louder or quieter (this TV remembers it) |
| Left / right | Zoom this song in or out, for black bars (remembered too) |
| Hold OK for 3 seconds | Test mode on or off: song, picture quality, zoom and sound on screen |
| Back | Nothing, so nobody stops the music by accident |
| Home | Leaves the app. The music stops, and starts again when you open the app |

## Changing the settings (playlist, volume, fades, café name…)

On GitHub, open `app/src/main/assets/index.html` and click the pencil (Edit). Change the SETTINGS block at the top and click **Commit changes**. GitHub builds a new APK in about 5 minutes. Install it on each TV with the same Downloader link: it installs over the old app, and each TV keeps what it remembers.

## Good to know

- The project includes the app's signing key (`app/twilight-tv.keystore`). That's what lets every new build update the app in place. In a public repository anyone could copy it, but it does nothing to your TVs unless someone installs their own app on them. If you'd rather keep it private, choose **Private** in step 2 and move the APK to the TVs on a USB stick (the Downloader link only works for public repositories).
- If a TV switches itself off after a few hours, turn off its own "Auto power off" or sleep timer. The app keeps the screen awake, but some TVs turn off after hours without a remote press.
- The app needs internet for YouTube. If the internet drops, it shows the café screen and tries again by itself.
- The page is served inside the app at `https://com.twilightcafe.tvplayer/`, the app's own ID. That's how YouTube asks apps to identify themselves when they embed its player.

## The text for step 4 (`.github/workflows/build.yml`)

```yaml
name: Build the TV app

# Runs every time something in the project changes (or by hand from the Actions tab),
# and publishes twilight-tv.apk as the latest release.
on:
  push:
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-24.04   # a fixed build machine, so GitHub updates don't change the build
    steps:
      - name: Get the project
        uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Build the APK
        run: |
          chmod +x gradlew
          ./gradlew --no-daemon assembleRelease
          cp app/build/outputs/apk/release/app-release.apk twilight-tv.apk

      - name: Keep the APK with this build
        uses: actions/upload-artifact@v4
        with:
          name: twilight-tv
          path: twilight-tv.apk

      - name: Publish it as the latest release
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release create "build-${{ github.run_number }}-${{ github.run_attempt }}" twilight-tv.apk \
            --target "${{ github.sha }}" \
            --title "Twilight TV, build ${{ github.run_number }}" \
            --notes "Install twilight-tv.apk on the TVs. It installs over the previous build." \
            --latest
```
