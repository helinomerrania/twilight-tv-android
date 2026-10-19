// The phone page's Settings screen in Chromium (phone-sized), against a stand-in TV
const { launch, shot, servePhonePage } = require('./lib/common');
const http = require('http'), fs = require('fs');
let PIN = '4821';
const tv = {
  defaults: { playlist: 'https://www.youtube.com/playlist?list=PL_6oD4', quality: 'auto', videoFormat: 'h264', screenSize: '1080', screenRate: 'box', engineNumbers: false, brandName: 'کافتریا و ڕێستورانتی توایڵایت', titleSeconds: 4,
    brandEnding: 10, fadeIn: 2, fadeOut: 3, volume: 100, songVolume: {}, autoZoom: true, songZoom: {}, blockAds: true, noSubtitles: true,
    cutEnding: 0, noRepeat: 20, apiKey: '', openHours: '', volumeSchedule: {}, refreshHours: 12,
    tvName: '', tvVolume: 0, controlPin: '', levelSound: true, restartAt: '05:00', updates: true },
  file: { volume: 90, openHours: '10:00-02:00' },
  local: { fadeIn: 1 },
};
const posts = [], cmds = [];
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (servePhonePage(u.pathname, res)) return;
  if (u.searchParams.get('pin') !== PIN) return send(401, { error: 'pin' });
  if (u.pathname === '/api/status') return send(200, { tv: 'TV 23', build: '1.5', onScreen: true, tvVolume: 7, tvVolumeMax: 15, others: [{ name: 'TV 24', url: 'http://192.168.1.24:8080/' }],
    page: { name: 'کافتریا', songs: 3, round: { done: 1, total: 3 }, song: { id: 'a', title: 'Song', position: 1, duration: 100 }, state: 'playing', volume: 100, scheduleVolume: 100, zoom: 100, quality: '', openHours: '', adsSkipped: 0, problems: [] } });
  if (u.pathname === '/api/settings' && req.method === 'GET') return send(200, { tv: 'TV 23', autoName: 'TV 23', defaults: tv.defaults, file: tv.file, local: tv.local, others: ['TV 24'] });
  if (u.pathname === '/api/settings' && req.method === 'POST') {
    let body = ''; req.on('data', c => body += c); req.on('end', () => {
      const b = JSON.parse(body); posts.push({ all: u.searchParams.get('all'), local: b.local });
      tv.local = b.local;
      if (b.local.controlPin) PIN = b.local.controlPin;
      send(200, { ok: true, pin: PIN, tv: b.local.tvName || 'TV 23', others: u.searchParams.get('all') === '1' ? [{ name: 'TV 24', result: 'saved' }] : [],
                  restarting: !!(b.local.videoFormat && b.local.videoFormat !== 'h264') || !!b.local.engineNumbers });
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
  console.log('\nPhone page: Settings screen');
  await page.tap('#tabSettings'); await sleep(800);
  const field = k => '.field[data-key="' + k + '"]';
  check('Settings tab shows every setting, grouped', await page.evaluate(() => document.querySelectorAll('#form .field').length === 40 &&
    [...document.querySelectorAll('#settingsView .group')].map(g => g.textContent).join('|') === 'Music|Call to prayer|Between songs|Picture and YouTube|This TV box|Weather|Advanced|Tools'),
    await page.evaluate(() => [document.querySelectorAll('#form .field').length, [...document.querySelectorAll('#settingsView .group')].map(g => g.textContent).join('|')]));
  const src = k => page.$eval(field(k) + ' .src', e => e.textContent);
  check('each setting says where its value comes from (built-in / settings.json / this TV)',
    (await src('quality')) === 'built-in' && (await src('volume')) === 'settings.json' && (await src('fadeIn')) === 'this TV',
    [await src('quality'), await src('volume'), await src('fadeIn')]);
  check('values shown: volume 90 (settings.json), fade in 1 s (this TV), café name in Kurdish',
    await page.evaluate(() => document.querySelector('#f-volume').value === '90' && /^1s$/.test(document.querySelector('#f-fadeIn output').textContent) &&
      document.querySelector('#f-brandName').value === 'کافتریا و ڕێستورانتی توایڵایت'));
  await shot(page, 'phone-settings.png');
  check('quality: Automatic is the built-in choice, then 4K down to 720p', await page.evaluate(() => {
    const q = document.querySelector('#f-quality');
    return q.value === 'auto' && [...q.options].map(o => o.value).join(',') === 'auto,2160,1440,1080,720' && /Automatic/.test(q.options[q.selectedIndex].textContent); }),
    await page.evaluate(() => document.querySelector('#f-quality').value));
  check('video format: H.264 built in, VP9 and any as choices', await page.evaluate(() => {
    const v = document.querySelector('#f-videoFormat');
    return v.value === 'h264' && [...v.options].map(o => o.value).join(',') === 'h264,vp9,any'; }));
  check('screen resolution (up to 1080p) and refresh rate (the box\'s own) under This TV box', await page.evaluate(() =>
    document.querySelector('#f-screenSize').value === '1080' && document.querySelector('#f-screenRate').value === 'box' &&
    [...document.querySelectorAll('#form .field')].map(e => e.dataset.key).join(' ').includes('tvVolume levelSound screenSize screenRate restartAt')),
    await page.evaluate(() => [...document.querySelectorAll('#form .field')].map(e => e.dataset.key).join(' ')));
  // change things
  await page.$eval('#f-volume', e => { e.value = '70'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  check('moving a slider makes it this TV\'s own', (await src('volume')) === 'this TV');
  await page.tap(field('fadeIn') + ' .reset'); await sleep(200);
  check('"Use the shared value" puts it back (fade in: built-in 2 s)', (await src('fadeIn')) === 'built-in' &&
    await page.$eval('#f-fadeIn output', e => e.textContent === '2s'));
  await page.tap('#f-cutEnding .step:last-child'); await page.tap('#f-cutEnding .step:last-child');
  check('steppers: cut ending 2 s', await page.$eval('#f-cutEnding output', e => e.textContent === '2s'));
  await page.tap('#f-volumeSchedule .add'); await page.tap('#f-volumeSchedule .add');
  check('volume schedule: two times added (10:00 60%, 18:00 100%)', await page.evaluate(() => document.querySelectorAll('#f-volumeSchedule .line').length === 2));
  await page.tap('#f-blockAds'); 
  check('switch: ad blocking off', await page.$eval('#f-blockAds', e => !e.checked));
  await page.$eval('#f-openHours', e => { e.value = 'ten till late'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.tap('#save'); await sleep(400);
  check('a wrong opening hours text is caught before saving', posts.length === 0 &&
    await page.$eval(field('openHours') + ' .err', e => !e.hidden && /10:00-02:00/.test(e.textContent)));
  await page.$eval('#f-openHours', e => { e.value = '10:00-14:00, 17:00-01:00'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#f-tvName', e => { e.value = 'Garden'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.select('#f-quality', '720'); await sleep(100);
  await page.select('#f-screenRate', '50'); await sleep(100);
  await page.tap('#save'); await sleep(900);
  const p0 = posts[0] && posts[0].local;
  check('Save sends only this TV\'s own settings (quality as the number 720, refresh rate "50")', p0 && p0.volume === 70 && p0.cutEnding === 2 && p0.blockAds === false &&
    p0.openHours === '10:00-14:00, 17:00-01:00' && p0.tvName === 'Garden' && JSON.stringify(p0.volumeSchedule) === '{"10:00":60,"18:00":100}' &&
    !('fadeIn' in p0) && p0.quality === 720 && p0.screenRate === '50' && !('videoFormat' in p0) && posts[0].all === '0', p0);
  check('...and says where it was saved', await page.$eval('#saveMsg', e => e.textContent === 'Saved on Garden.'), await page.$eval('#saveMsg', e => e.textContent));
  await page.select('#f-quality', 'auto'); await sleep(100);
  check('quality back to Automatic: the word "auto", the built-in value again', await page.evaluate(() => document.querySelector('#f-quality').value === 'auto') &&
    (await src('quality')) === 'built-in', await src('quality'));
  await page.tap('#saveAll'); await page.tap('#save'); await sleep(900);
  check('"Also on the other TVs": sent with all=1, results per TV', posts[1] && posts[1].all === '1' && !('quality' in posts[1].local) &&
    await page.$eval('#saveMsg', e => /TV 24: saved\./.test(e.textContent)), posts[1]);
  await page.tap('#saveAll');
  await page.select('#f-videoFormat', 'vp9'); await sleep(100);
  await page.tap('#save'); await sleep(900);
  check('a new video format: sent, and the phone says the app restarts', posts[2] && posts[2].local.videoFormat === 'vp9' &&
    await page.$eval('#saveMsg', e => /The app restarts on it to use the change\./.test(e.textContent)), [posts[2], await page.$eval('#saveMsg', e => e.textContent)]);
  await page.$eval('#f-controlPin', e => { e.value = '12'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.tap('#save'); await sleep(400);
  check('a too-short PIN is caught', posts.length === 3 && await page.$eval(field('controlPin') + ' .err', e => !e.hidden));
  await page.$eval('#f-controlPin', e => { e.value = '2580'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.tap('#save'); await sleep(1200);
  check('a new PIN: the phone keeps working with it', posts.length === 4 && await page.evaluate(() => localStorage.getItem('twilight-tv-pin') === '2580') &&
    await page.$eval('#pin', e => e.hidden));
  await page.tap('[data-tool="testmode"]'); await sleep(400);
  await page.tap('[data-tool="forget"]'); await sleep(400);
  await page.tap('[data-tool="restart"]'); await sleep(400);
  check('tools: test mode, forget (after confirming), restart', cmds.join(',') === 'testmode,forget,restart', cmds);
  await page.tap('#tabControl'); await sleep(300);
  check('back to Control: the controls are there', await page.$eval('#controlView', e => !e.hidden) && await page.$eval('#settingsView', e => e.hidden));
  check('no script errors', errors.length === 0, errors);
  check('fits a phone screen', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.tap('#tabSettings'); await sleep(700);
  await shot(page, 'phone-settings-full.png', { fullPage: true });
  await b.close(); server.close();
  console.log('\n' + passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
