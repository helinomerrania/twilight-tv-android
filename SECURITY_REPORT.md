# Twilight TV Security & Code Review Report

After conducting a comprehensive code review of the `Twilight TV` app, particularly focusing on `ControlServer.java` and internal data managers (`PictureStore`, `TitleBook`, `MenuStore`), I have identified several critical concurrency, resource exhaustion, and Denial of Service (DoS) issues. The bugs were successfully verified and patched.

## 1. Denial of Service (Slowloris Variant) in `ControlServer`
**Severity**: High
**Description**: The embedded HTTP server handles incoming client connections by reading the initial request headers one byte at a time in `readLine(InputStream)`. Although it sets an `8000ms` socket timeout and checks `if (b.size() > 8192)`, an attacker can send data extremely slowly over `8000ms` but reset the read timer by sending 1 byte, thus dragging out the connection duration indefinitely. More critically, the `body` is read using a simple `while (got < length)` loop, which has no specific time constraints. Given that the `ControlServer` thread pool uses `Executors.newFixedThreadPool(6)`, a malicious user on the café Wi-Fi can open 6 connections and keep them hanging indefinitely by sending bytes extremely slowly, starving out all other valid requests (including remote control commands from staff).
**Remediation**: Implemented a hard limit for `readLine` and the request body reading loop. Both will throw an `IOException("read too slow")` if the parsing takes longer than `10000ms`.

## 2. Resource Exhaustion / Thread Blocking in `TitleBook`
**Severity**: Medium
**Description**: In `TitleBook.java`, the background thread loops indefinitely (`while (true)`) calling the YouTube oEmbed API to fetch video titles. If the internet is down, it hits the `IOException` block and breaks the inner loop, which will cause it to sleep and possibly retry. However, if YouTube returns a `5xx` error (`r.code >= 500`), the `id` is placed back in `wanted` and the loop immediately repeats (only delayed by `pauseMillis = 1500`). Over time, if YouTube consistently returns `5xx` for a specific ID, the thread will loop endlessly, consuming CPU cycles and making unnecessary requests indefinitely. There was no exponential backoff or extended delay implemented for this scenario, unlike `r.code == 429`.
**Remediation**: Updated the `r.code >= 500` branch to apply the same `quietUntil = System.currentTimeMillis() + SLOW_DOWN` mechanism as the 429 logic.

## 3. ConcurrentModificationException in `PictureStore`
**Severity**: Medium
**Description**: The `list` object inside `PictureStore.java` is a standard `ArrayList`. `add()` and `remove()` methods modify this list inside `synchronized(this)` blocks. However, `ids()` iterates over `list` without proper synchronization if accessed elsewhere, which initially appeared unsafe. Upon further review, `ids()` itself is declared as `synchronized`, so iteration is fully protected from `add()` and `remove()`. No changes required, as `ids()` correctly obtains the monitor lock.

## Summary of Changes
- Patched the Slowloris vulnerability in `ControlServer.java` by enforcing an overall timeout (`10,000ms`) on parsing HTTP headers and reading HTTP request bodies.
- Fixed the infinite retry loop in `TitleBook.java` when YouTube APIs respond with HTTP 500 errors by introducing a 15-minute cool-down (`SLOW_DOWN`) before retrying.

All changes have been isolated and committed to the `Main_Revised_by_jules` branch.
