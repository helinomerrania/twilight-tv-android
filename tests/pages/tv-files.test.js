// The TV page split into its files, loaded in a browser from the app's real server (PageTestServer): every file
// arrives, with the right type, in the right order, and the page starts as before.
const { launch, testServer } = require('./lib/common');
const fs = require('fs'), path = require('path'), os = require('os');
let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tvsplit-'));
  const java = testServer(dir);
  const port = await new Promise(ok => java.stdout.on('data', d => { const m = /port (\d+) menu (\d+)/.exec(String(d)); if (m) ok(Number(m[1])); }));
  const b = await launch();
  const page = await b.newPage();
  // Only the app's own server answers: this checks the app's files, and YouTube's player (reachable from GitHub's
  // computers, slow or not) mustn't decide the result
  await page.setRequestInterception(true);
  page.on('request', r => { const u = new URL(r.url()); if (u.hostname === '127.0.0.1' || u.protocol === 'data:' || u.protocol === 'blob:') r.continue(); else r.abort(); });
  const files = {}, errors = [];
  page.on('response', r => { const u = new URL(r.url()); if (u.port == String(port)) files[u.pathname] = [r.status(), r.headers()['content-type'], r.headers()['cache-control']]; });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('http://127.0.0.1:' + port + '/tv/index.html?k=testkey', { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1500));
  const want = { '/tv/fonts.css': 'text/css', '/tv/tv.css': 'text/css', '/tv/qrcode.js': 'text/javascript', '/tv/settings.js': 'text/javascript', '/tv/tv.js': 'text/javascript' };
  const got = Object.keys(want).map(f => [f, files[f]]);
  check('the page and its five files, from the app\'s own server, each with its type, never kept', files['/tv/index.html'] && files['/tv/index.html'][0] === 200 &&
    got.every(([f, r]) => r && r[0] === 200 && r[1].startsWith(want[f]) && r[2] === 'no-store'), got);
  const s = await page.evaluate(() => ({
    settings: typeof SETTINGS === 'object' && typeof SETTINGS.playlist === 'string',
    qr: typeof qrcode === 'function',
    bridge: typeof window.TwilightApp === 'object' && window.TWILIGHT_BOOT && window.TWILIGHT_BOOT.k === 'testkey',
    page: typeof window.TwilightTV === 'object' && typeof window.TwilightTV.status === 'function',
    styled: getComputedStyle(document.getElementById('brand')).position === 'absolute' && getComputedStyle(document.getElementById('brand')).zIndex === '2',
    fonts: [...document.fonts].map(f => f.family.replace(/"/g, '')).filter((v, i, a) => a.indexOf(v) === i).sort().join(',')
  }));
  check('the built-in settings, the QR library and the bridge are there before the page\'s own script', s.settings && s.qr && s.bridge, s);
  check('...which started: the page is up (window.TwilightTV)', s.page, s);
  check('its styles apply (the café screen over the video)', s.styled, s);
  check('its letters: Vazirmatn and the café\'s name font, built in', s.fonts === 'TwilightName,Vazirmatn', s.fonts);
  const own = errors.filter(e => !/youtube|YT\b|iframe_api/i.test(e));
  check('no script errors of its own (YouTube itself isn\'t reached here)', own.length === 0, own);
  const lan = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal);
  if (lan) {
    const fromLan = await new Promise(ok => require('http').get({ host: lan.address, port, path: '/tv/tv.js' }, r => ok(r.statusCode)).on('error', e => ok(String(e))));
    check('the TV page\'s files only for the box itself: from the network, 404', fromLan === 404, fromLan);
  } else console.log('  skip the TV page\'s files from the network (this computer has no network address)');
  await b.close(); java.stdin.end(); java.kill();
  console.log(passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
