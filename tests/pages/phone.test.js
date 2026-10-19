// The phone control page in Chromium (phone-sized), talking to a stand-in TV
const { launch, shot, servePhonePage } = require('./lib/common');
const http = require('http'), fs = require('fs');
const cmds = [];
let state = { paused: false, closed: false, vol: 80, zoom: 100, tv: 7, update: 0, notice: '', setup: false };
const DAY = 864e5, TODAY = new Date(); TODAY.setHours(21, 14, 0, 0);
const DIARY = [{ t: TODAY.getTime(), what: 'The TV box started again by itself, or its power went off for a moment: Twilight TV was running at 19 Oct 21:13.' },
               { t: TODAY.getTime() - DAY + 5 * 36e5 - 21 * 36e5 - 14 * 6e4, what: 'A fresh start for the night.' },
               { t: new Date(2026, 9, 12, 14, 2).getTime(), what: 'Twilight TV crashed: IllegalStateException in PageLink.checkIn.' }];
function status() {
  return {
    diary: DIARY,
    tv: 'TV 23', build: '1.5', onScreen: true, qualitySetup: state.setup,
    engine: "Firefox's engine (GeckoView 143.0, built into this app)", engineMajor: 143, tvVolume: state.tv, tvVolumeMax: 15, tvVolumeFixed: false,
    levelling: 'on', settings: 'settings.json from GitHub, 10 Oct 19:20', updateReady: state.update, updateStatus: state.update ? 'build 6 is ready to install' : 'up to date (build 5)',
    notice: state.notice,
    others: [{ name: 'TV 24', url: 'http://192.168.1.24:8080/' }, { name: 'TV 31', url: 'http://192.168.1.31:8080/' }],
    page: { name: 'کافتریا و ڕێستورانتی توایڵایت', playlist: 'PL_6oD4', songs: 138, round: { done: 41, total: 136 },
      song: { id: 'abc123xyz00', title: 'Hama Jaza — Bo Kurdistan (Official Video)', position: 83, duration: 245 },
      state: state.closed ? 'closed' : state.paused ? 'paused' : 'playing', picture: 'show', volume: state.vol, scheduleVolume: 100,
      zoom: state.zoom, zoomNote: 'bars found automatically', muted: false, quality: '2160p (4K)', openHours: '10:00-02:00', open: !state.closed,
      holdUntil: state.paused ? Date.now() + 3 * 3600e3 : 0, adsSkipped: 3, soundFixes: 2, soundFixAt: TODAY.getTime(),
      problems: [{ id: 'dQw4w9WgXcQ', title: 'Old live concert 2009', what: "YouTube error 150 (the owner doesn't allow it on other sites)", count: 3, last: 1 },
                 { id: 'kJQP7kiw5Fk', title: '', what: 'never started (stuck loading)', count: 1, last: 0 }] }
  };
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (servePhonePage(u.pathname, res)) return;
  if (u.searchParams.get('pin') !== '4821') { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"pin"}'); }
  if (u.pathname === '/api/status') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(status())); }
  if (u.pathname === '/api/cmd' && req.method === 'POST') {
    const d = u.searchParams.get('do'); cmds.push(d);
    if (d === 'pause') state.paused = true; if (d === 'resume') { state.paused = false; state.closed = false; }
    if (d === 'vol-') state.vol -= 10; if (d === 'zoom+') state.zoom = 105; if (d === 'tvvol+') state.tv++;
    if (d === 'qualitysetup') state.setup = true; if (d === 'qualitydone') state.setup = false;
    if (d === 'update') { state.notice = 'Look at the TV: press Install with the remote. The app restarts by itself.'; state.update = 0; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}');
  }
  res.writeHead(404); res.end();
});
let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await launch();
  const page = await b.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  console.log('\nPhone control page (phone-sized Chromium)');
  await page.goto(url, { waitUntil: 'load' }); await sleep(400);
  check('first visit: asks for the TV\'s PIN', await page.$eval('#pin', e => !e.hidden));
  await shot(page, 'phone-pin.png');
  await page.type('#pinInput', '1111'); await page.click('#pinForm button'); await sleep(500);
  check('wrong PIN: asked again, with a message', await page.$eval('#pinErr', e => e.textContent.includes("didn't work")));
  await page.type('#pinInput', '4821'); await page.click('#pinForm button'); await sleep(700);
  check('right PIN: the controls appear', await page.$eval('#pin', e => e.hidden));
  check('shows the café name, this TV and the other TVs as links', await page.evaluate(() =>
    document.getElementById('cafe').textContent === 'کافتریا و ڕێستورانتی توایڵایت' &&
    [...document.querySelectorAll('#tvs a')].map(a => a.textContent + ' ' + a.href).join('|') === 'TV 24 http://192.168.1.24:8080/|TV 31 http://192.168.1.31:8080/' &&
    document.querySelector('#tvs span').textContent === 'TV 23'));
  check('now playing: title, time; picture quality YouTube reports', await page.evaluate(() => document.getElementById('song').textContent.startsWith('Hama Jaza') &&
    document.getElementById('pos').textContent === '1:23' && document.getElementById('dur').textContent === '4:05' &&
    document.getElementById('qualityNow').textContent === 'Now playing in 2160p (4K)'));
  check('the web engine is listed with the facts', await page.evaluate(() =>
    /Web engine: Firefox's engine \(GeckoView 143.0/.test(document.getElementById('facts').textContent)));
  await page.tap('[data-cmd="qualitysetup"]'); await sleep(800);
  check('"Choose the highest quality on the TV": starts the setup, shows the steps and Done', cmds.includes('qualitysetup') &&
    await page.evaluate(() => !document.getElementById('qualityOn').hidden && document.getElementById('qualityIdle').hidden &&
      /gear/.test(document.getElementById('qualityOn').textContent)));
  await shot(page, 'phone-quality.png');
  await page.tap('[data-cmd="qualitydone"]'); await sleep(800);
  check('Done: setup ends, back to normal', cmds.includes('qualitydone') && await page.evaluate(() => document.getElementById('qualityOn').hidden));
  check('song volume, zoom and TV volume shown', await page.evaluate(() => document.getElementById('vol').textContent === '80%' &&
    document.getElementById('zoom').textContent === '100%' && document.getElementById('tvvol').textContent === '7/15'));
  check('songs that won\'t play: listed with reason and a YouTube link', await page.evaluate(() => {
    const li = document.querySelectorAll('#problemList li');
    return li.length === 2 && /Old live concert/.test(li[0].textContent) && /3 times/.test(li[0].textContent) &&
      li[0].querySelector('a').href === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' && /kJQP7kiw5Fk/.test(li[1].textContent) &&
      document.getElementById('problemsTitle').textContent === '2 songs won\'t play'; }));
  check('what happened on this TV: newest first, each with its day and time', await page.evaluate(() => {
    const li = [...document.querySelectorAll('#diaryList li')].map(l => l.querySelector('span').textContent + ' | ' + l.querySelector('div').textContent);
    return !document.getElementById('diaryCard').hidden && li.length === 3 && li[0].startsWith('Today, 21:14 | The TV box started again by itself') &&
      li[1] === 'Yesterday, 05:00 | A fresh start for the night.' && li[2] === '12 Oct, 14:02 | Twilight TV crashed: IllegalStateException in PageLink.checkIn.'; }),
    await page.evaluate(() => [...document.querySelectorAll('#diaryList li')].map(l => l.textContent)));
  check('YouTube changing the volume by itself: how often, with the facts', await page.evaluate(() =>
    document.getElementById('facts').textContent.includes("Sound: YouTube's player changed the volume by itself 2 times, last at 21:14. The TV set it back at once each time.")));
  check('the PIN is remembered on this phone', await page.evaluate(() => localStorage.getItem('twilight-tv-pin') === '4821'));
  await shot(page, 'phone-main.png', { fullPage: true });
  await page.tap('#next'); await sleep(1700);
  check('Next song: sends "next"', cmds.includes('next'), cmds);
  await page.tap('#pause'); await sleep(800);
  check('Pause music: sends "pause", button becomes Resume, says when it restarts', cmds.includes('pause') &&
    await page.evaluate(() => document.getElementById('pauseText').textContent === 'Resume music' && /starts again by itself at/.test(document.getElementById('state').textContent)));
  await shot(page, 'phone-paused.png');
  await page.tap('#pause'); await sleep(800);
  check('Resume music: sends "resume"', cmds.filter(c => c === 'resume').length === 1, cmds);
  await page.tap('[data-cmd="vol-"]'); await sleep(700);
  check('song quieter: 70%', await page.$eval('#vol', e => e.textContent === '70%'));
  await page.tap('[data-cmd="tvvol+"]'); await sleep(700);
  check('TV louder: 8/15', await page.$eval('#tvvol', e => e.textContent === '8/15'));
  await page.tap('[data-cmd="identify"]'); await sleep(500);
  check('Show the name on the TV: sends "identify"', cmds.includes('identify'));
  state.update = 6; await sleep(2300);
  check('a waiting update shows an Install button', await page.$eval('#update', e => !e.hidden && /1\.6/.test(e.textContent)));
  await shot(page, 'phone-update.png');
  await page.tap('#update button'); await sleep(800);
  check('Install update: sends "update", then shows what to do on the TV', cmds.includes('update') &&
    await page.$eval('#notice', e => !e.hidden && /press Install with the remote/.test(e.textContent)));
  state.closed = true; await sleep(2300);
  check('closed hours: says so, offers "Play anyway", Next is off', await page.evaluate(() => /outside opening hours/.test(document.getElementById('state').textContent) &&
    document.getElementById('pauseText').textContent === 'Play anyway' && document.getElementById('next').disabled));
  const counts = cmds.length;
  check('each tap sends exactly one command', cmds.filter(c => c === 'next').length === 1 && cmds.filter(c => c === 'pause').length === 1, cmds);
  server.close(); await sleep(2500);
  check('TV unreachable: a clear message', await page.$eval('#offline', e => !e.hidden));
  check('no script errors', errors.length === 0, errors);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check('fits a phone screen (no sideways scrolling)', wide);
  await b.close();
  console.log('\n' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
