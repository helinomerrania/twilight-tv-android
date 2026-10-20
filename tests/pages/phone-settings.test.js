// The phone page's Settings tab in Chromium (phone-sized), against a stand-in TV: its list of pages, each page,
// the Save bar (only while something isn't saved), and the tools
const { launch, shot, servePhonePage } = require('./lib/common');
const http = require('http');
let PIN = '4821';
const tv = {
  defaults: { playlist: 'https://www.youtube.com/playlist?list=PL_6oD4', quality: 'auto', videoFormat: 'h264', screenSize: '1080', screenRate: 'box', brandName: 'کافتریا و ڕێستورانتی توایڵایت', titleSeconds: 4,
    brandEnding: 10, fadeIn: 2, fadeOut: 3, volume: 100, songVolume: {}, autoZoom: true, songZoom: {}, blockAds: true, noSubtitles: true,
    cutEnding: 0, noRepeat: 20, apiKey: '', openHours: '', volumeSchedule: {}, refreshHours: 12,
    tvName: '', tvVolume: 0, controlPin: '', levelSound: true, restartAt: '05:00', updates: true },
  file: { volume: 90, openHours: '10:00-02:00' },
  local: { fadeIn: 1, cutEnding: 3, refreshHours: 6 },          // (two settings no longer on the phone, kept by this TV)
};
let songs = 3;
const posts = [], cmds = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (servePhonePage(u.pathname, res)) return;
  if (u.searchParams.get('pin') !== PIN) return send(401, { error: 'pin' });
  if (u.pathname === '/api/status') return send(200, { tv: 'TV 23', build: '1.5', onScreen: true, tvVolume: 7, tvVolumeMax: 15, others: [{ name: 'TV 24', url: 'http://192.168.1.24:8080/' }],
    page: { name: 'کافتریا', songs, round: { done: 1, total: 3 }, song: { id: 'a', title: 'Song', position: 1, duration: 100 }, state: 'playing', volume: 100, scheduleVolume: 100, zoom: 100, quality: '', openHours: '', adsSkipped: 0, problems: [] } });
  if (u.pathname === '/api/settings' && req.method === 'GET') return send(200, { tv: 'TV 23', autoName: 'TV 23', defaults: tv.defaults, file: tv.file, local: tv.local, others: ['TV 24'] });
  if (u.pathname === '/api/settings' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const b = JSON.parse(body); posts.push({ all: u.searchParams.get('all'), local: b.local });
      tv.local = b.local;
      if (b.local.controlPin) PIN = b.local.controlPin;
      send(200, { ok: true, pin: PIN, tv: b.local.tvName || 'TV 23', others: u.searchParams.get('all') === '1' ? [{ name: 'TV 24', result: 'saved' }] : [],
                  restarting: !!(b.local.videoFormat && b.local.videoFormat !== 'h264') });
    });
    return;
  }
  if (u.pathname === '/api/cmd' && req.method === 'POST') { cmds.push(u.searchParams.get('do')); return send(200, { ok: true }); }
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
  page.on('dialog', d => d.accept());
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('twilight-tv-pin', '4821'));
  await page.goto(url, { waitUntil: 'load' }); await sleep(600);
  const field = k => '.field[data-key="' + k + '"]';
  const src = k => page.$eval(field(k) + ' .src', e => e.textContent);
  const shown = sel => page.$eval(sel, e => !e.hidden && !e.closest('[hidden]'));
  const keys = name => page.$$eval('.page[data-page="' + name + '"] .field[data-key]', l => l.map(e => e.dataset.key).join(' '));
  const groups = name => page.$$eval('.page[data-page="' + name + '"] .group', l => l.map(e => e.textContent).join('|'));
  const openPage = async name => {
    if (!(await shown('#settingsView'))) { await page.tap('#tabSettings'); await sleep(300); }
    if (await shown('#setPage')) { await page.tap('#setBack'); await sleep(300); }
    await page.tap('.navrow[data-page="' + name + '"]'); await sleep(300);
  };
  const say = () => page.$eval('#say', e => e.textContent);

  console.log('\nPhone page: the Settings tab');
  await page.tap('#tabSettings'); await sleep(800);
  check('a list of pages: six of settings, then Status and diary, and Tools', (await page.$$eval('.navrow', l => l.map(b => b.dataset.page + ':' + b.querySelector('span:last-child').childNodes[0].textContent))).join() ===
    'music:Music,hours:Hours and volume,prayer:Call to prayer,picture:Picture,services:Weather and prices,box:This TV box,status:Status and diary,tools:Tools',
    await page.$$eval('.navrow', l => l.map(b => b.textContent)));
  check('no Save bar while nothing has changed', await page.$eval('#savebar', e => e.hidden));
  await shot(page, 'phone-settings.png');
  check('each page has its settings, in groups', (await keys('music')) === 'playlist playlistSchedule differentSinger fadeIn fadeOut' &&
    (await keys('hours')) === 'openHours closingFade volume volumeSchedule quietLevel levelSound tvVolume' &&
    (await keys('prayer')) === 'prayerPause prayerCity prayerAdjust' &&
    (await keys('picture')) === 'quality videoFormat autoZoom blockAds noSubtitles titleSeconds brandEnding screenSize screenRate' &&
    (await keys('services')) === 'weatherKey place lat lon pricesUrl' &&
    (await keys('box')) === 'tvName controlPin lockApps otherApp restartAt updates' &&
    (await groups('music')) === 'Playlist|From song to song' && (await groups('hours')) === 'Volume' &&
    (await groups('picture')) === "Video|YouTube's ads and extras|The TV screen" && (await groups('services')) === 'Weather|Gold and currency prices' &&
    (await groups('box')) === 'Keeping the box in Twilight TV|Restart and updates',
    await Promise.all(['music', 'hours', 'prayer', 'picture', 'services', 'box'].map(async p => p + ': ' + await keys(p) + ' / ' + await groups(p))));
  check('settings no longer on the phone are nowhere: reload, the YouTube key (a small playlist), the engine\'s counter, cutting song ends, the menu link, the Kurdish new year, songs before one comes back',
    await page.evaluate(() => ['refreshHours', 'apiKey', 'engineNumbers', 'cutEnding', 'menuUrl', 'kurdishNewYear', 'noRepeat'].every(k => !document.querySelector('.field[data-key="' + k + '"]'))));
  await openPage('picture');
  check('a page: its name at the top, a way back to the list', await page.evaluate(() => document.getElementById('setTitle').textContent === 'Picture' &&
    !document.getElementById('setPage').hidden && document.getElementById('setIndex').hidden && document.querySelector('#setBack').textContent.trim() === 'Settings'));
  check('each setting says where its value comes from (built-in / settings.json / this TV)',
    (await src('quality')) === 'built-in' && (await src('volume')) === 'settings.json' && (await src('fadeIn')) === 'this TV',
    [await src('quality'), await src('volume'), await src('fadeIn')]);
  check('values shown: volume 90 (settings.json), fade in 1 s (this TV)',
    await page.evaluate(() => document.querySelector('#f-volume').value === '90' && /^1s$/.test(document.querySelector('#f-fadeIn output').textContent)));
  check('quality: Automatic is the built-in choice, then 4K down to 720p', await page.evaluate(() => {
    const q = document.querySelector('#f-quality');
    return q.value === 'auto' && [...q.options].map(o => o.value).join(',') === 'auto,2160,1440,1080,720' && /Automatic/.test(q.options[q.selectedIndex].textContent); }),
    await page.evaluate(() => document.querySelector('#f-quality').value));
  check('video format: H.264 built in, VP9 and any as choices', await page.evaluate(() => {
    const v = document.querySelector('#f-videoFormat');
    return v.value === 'h264' && [...v.options].map(o => o.value).join(',') === 'h264,vp9,any'; }));
  check('screen resolution (up to 1080p) and refresh rate (the box\'s own), under The TV screen', await page.evaluate(() =>
    document.querySelector('#f-screenSize').value === '1080' && document.querySelector('#f-screenRate').value === 'box'));
  await shot(page, 'phone-settings-picture.png', { fullPage: true });

  // change things
  await openPage('hours');
  await page.$eval('#f-volume', e => { e.value = '70'; e.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(200);
  check('moving a slider makes it this TV\'s own', (await src('volume')) === 'this TV');
  check('...and the Save bar appears: 1 unsaved change, with "Also on the other TVs"', await shown('#savebar') &&
    (await page.$eval('#changes', e => e.textContent)) === '1 unsaved change' && await shown('#allBox'), await page.$eval('#changes', e => e.textContent));
  await shot(page, 'phone-settings-unsaved.png');
  await page.tap('#setBack'); await sleep(300);
  check('the list marks the page with the change, and so does the Settings tab', await page.evaluate(() =>
    [...document.querySelectorAll('.navrow.unsaved')].map(b => b.dataset.page).join() === 'hours' && document.getElementById('tabSettings').classList.contains('unsaved') &&
    !document.getElementById('tabScreen').classList.contains('unsaved')));
  await page.tap('#tabControl'); await sleep(300);
  check('on the Now tab, no Save bar; the change waits', await page.$eval('#savebar', e => e.hidden));
  await page.tap('#tabSettings'); await sleep(300);
  check('back on Settings: the Save bar again', await shown('#savebar'));
  await page.tap('#discard'); await sleep(300);
  check('Discard (after asking): back to the saved value, no Save bar', (await src('volume')) === 'settings.json' && await page.$eval('#savebar', e => e.hidden) &&
    await page.$eval('#f-volume', e => e.value === '90') && !(await page.$eval('#tabSettings', e => e.classList.contains('unsaved'))));
  await openPage('music');
  await page.tap(field('fadeIn') + ' .reset'); await sleep(200);
  check('"Use the shared value" puts it back (fade in: built-in 2 s)', (await src('fadeIn')) === 'built-in' &&
    await page.$eval('#f-fadeIn output', e => e.textContent === '2s'));
  await openPage('picture');
  await page.tap('#f-titleSeconds .step:last-child'); await page.tap('#f-titleSeconds .step:last-child');
  check('steppers: café screen at the start of each song, 6 s', await page.$eval('#f-titleSeconds output', e => e.textContent === '6s'));
  await page.tap('#f-blockAds');
  check('switch: ad blocking off', await page.$eval('#f-blockAds', e => !e.checked));
  await openPage('hours');
  await page.$eval('#f-volume', e => { e.value = '70'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval(field('volumeSchedule') + ' .add', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  await page.tap('#f-volumeSchedule .add'); await page.tap('#f-volumeSchedule .add');
  check('volume schedule: two times added (10:00 60%, 18:00 100%)', await page.evaluate(() => document.querySelectorAll('#f-volumeSchedule .line').length === 2));
  await page.$eval('#f-openHours', e => { e.value = 'ten till late'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await openPage('picture');
  await page.tap('#save'); await sleep(500);
  check('a wrong opening hours text is caught before saving: the phone goes to it, marked', posts.length === 0 &&
    await page.$eval(field('openHours') + ' .err', e => !e.hidden && /10:00-02:00/.test(e.textContent)) &&
    (await page.$eval('#setTitle', e => e.textContent)) === 'Hours and volume' && (await page.$eval('#saveMsg', e => e.textContent)) === 'Fix the marked setting first.',
    [posts.length, await page.$eval('#setTitle', e => e.textContent), await page.$eval('#saveMsg', e => e.textContent)]);
  await shot(page, 'phone-settings-fix.png');
  await page.$eval('#f-openHours', e => { e.value = '10:00-14:00, 17:00-01:00'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#f-tvName', e => { e.value = 'Garden'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.select('#f-quality', '720'); await sleep(100);
  await page.select('#f-screenRate', '50'); await sleep(100);
  check('the count of changes', (await page.$eval('#changes', e => e.textContent)) === '9 unsaved changes', await page.$eval('#changes', e => e.textContent));
  await page.tap('#save'); await sleep(900);
  const p0 = posts[0] && posts[0].local;
  check('Save sends only this TV\'s own settings (quality as the number 720, refresh rate "50")', p0 && p0.volume === 70 && p0.titleSeconds === 6 && p0.blockAds === false &&
    p0.openHours === '10:00-14:00, 17:00-01:00' && p0.tvName === 'Garden' && JSON.stringify(p0.volumeSchedule) === '{"10:00":60,"18:00":100}' &&
    !('fadeIn' in p0) && p0.quality === 720 && p0.screenRate === '50' && !('videoFormat' in p0) && posts[0].all === '0', p0);
  check('...and what this TV kept for settings no longer on the phone goes with it', p0 && !('cutEnding' in p0) && !('refreshHours' in p0), p0);
  check('...says where it was saved, and the Save bar goes', (await say()) === 'Saved on Garden.' && await page.$eval('#savebar', e => e.hidden) &&
    !(await page.$eval('#tabSettings', e => e.classList.contains('unsaved'))), await say());
  check('...the page stays where it was', (await page.$eval('#setTitle', e => e.textContent)) === 'Hours and volume' && await shown('#setPage'));
  await openPage('picture');
  await page.select('#f-quality', 'auto'); await sleep(100);
  check('quality back to Automatic: the word "auto", the built-in value again', await page.evaluate(() => document.querySelector('#f-quality').value === 'auto') &&
    (await src('quality')) === 'built-in', await src('quality'));
  await page.tap('#saveAll'); await sleep(100);
  check('"Also on the other TVs": the button says so', (await page.$eval('#save', e => e.textContent)) === 'Save on every TV');
  await page.tap('#save'); await sleep(900);
  check('"Also on the other TVs": sent with all=1, results per TV', posts[1] && posts[1].all === '1' && !('quality' in posts[1].local) &&
    /TV 24: saved\./.test(await say()), [posts[1], await say()]);
  await page.select('#f-videoFormat', 'vp9'); await sleep(100);
  check('the next change starts with "on this TV" again', (await page.$eval('#save', e => e.textContent)) === 'Save on this TV' && !(await page.$eval('#saveAll', e => e.checked)));
  await page.tap('#save'); await sleep(900);
  check('a new video format: sent, and the phone says the app restarts', posts[2] && posts[2].local.videoFormat === 'vp9' && posts[2].all === '0' &&
    /The app restarts on it to use the change\./.test(await say()), [posts[2], await say()]);
  await openPage('box');
  await page.$eval('#f-controlPin', e => { e.value = '12'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.tap('#save'); await sleep(400);
  check('a too-short PIN is caught', posts.length === 3 && await page.$eval(field('controlPin') + ' .err', e => !e.hidden));
  await page.$eval('#f-controlPin', e => { e.value = '2580'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.tap('#save'); await sleep(1200);
  check('a new PIN: the phone keeps working with it', posts.length === 4 && await page.evaluate(() => localStorage.getItem('twilight-tv-pin') === '2580') &&
    await page.$eval('#pin', e => e.hidden));

  console.log('\nPhone page: a big playlist, and the tools');
  songs = 200; await sleep(2300);
  await page.tap('#tabControl'); await sleep(200);
  await page.evaluate(() => { localStorage.setItem('twilight-tv-pin', '2580'); }); await page.reload({ waitUntil: 'load' }); await sleep(800);
  await openPage('music'); await sleep(400);
  check('a playlist of 200 songs (as many as YouTube\'s player reads): the YouTube key appears under it', (await keys('music')) === 'playlist playlistSchedule apiKey differentSinger fadeIn fadeOut',
    await keys('music'));
  await openPage('tools');
  await page.tap('[data-tool="testmode"]'); await sleep(400);
  await page.tap('[data-tool="forget"]'); await sleep(400);
  await page.tap('[data-tool="restart"]'); await sleep(400);
  check('tools: test mode, forget (after confirming), restart', cmds.join(',') === 'testmode,forget,restart', cmds);
  await page.tap('#tabControl'); await sleep(300);
  check('back to Now: the controls are there', await page.$eval('#controlView', e => !e.hidden) && await page.$eval('#settingsView', e => e.hidden));
  await page.tap('#tabSettings'); await sleep(300);
  check('Settings again: the list, not the page left open', await shown('#setIndex') && !(await shown('#setPage')));
  check('no script errors', errors.length === 0, errors);
  check('fits a phone screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await b.close(); server.close();
  console.log('\n' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
