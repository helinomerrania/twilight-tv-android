// The phone page's new parts in Chromium (phone-sized), against a stand-in TV:
// choosing songs, a link, quiet, the last songs, the call to prayer, the Screen tab, pictures, one TV box
const { FIXTURES, launch, shot, servePhonePage } = require('./lib/common');
const http = require('http'), fs = require('fs');
const PIN = '4821', cmds = [], posts = [], uploads = [], deleted = [], lookPosts = [], lookGets = [];
const looks = [['cafe', 0], ['plain', 0], ['newroz', 1760000000000], ['eid', 0], ['barat', 0], ['newyear', 0]];
const now = Date.now();
const words = { locale: 'en-GB', weekdays: '', months: '', hijriMonths: '', nowPlaying: 'Now playing', upNext: 'Up next', menu: 'Menu', menuHint: 'Scan for the menu',
  wifi: 'Wi-Fi', wifiPassword: 'Password', prices: 'Gold and currency prices', goldOunce: 'Gold', silverOunce: 'Silver', perOunce: 'per ounce', bitcoin: 'Bitcoin', pound: 'Pound sterling', am: 'AM', pm: 'PM', weatherCredit: 'MET Norway', kurdishMonths: '',
  prayerNote: 'The music resumes after the call to prayer', prayerBand: 'Paused for the call to prayer', newroz: 'Happy Newroz', eidFitr: 'Eid Mubarak', eidAdha: 'Eid Mubarak',
  barat: 'Blessed Barat Night', newYear: 'Happy New Year', clear: 'Clear', fair: 'Fair', partlycloudy: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog', lightrain: 'Light rain',
  rain: 'Rain', heavyrain: 'Heavy rain', sleet: 'Sleet', snow: 'Snow', thunder: 'Thunderstorm' };
const tv = {
  defaults: { playlist: 'PL_6oD4', priceItems: ['us', 'eu', 'gb', 'tr', 'ir', 'gold21', 'gold18'], numerals: 'auto', prayerCity: 'Ranya', messages: [], wifiName: '', wifiPassword: '', menuUrl: '', infoPanel: true, clock24: false,
    specialDays: true, hijriAdjust: 0, labels: {}, prayerPause: 5, prayerAdjust: {}, lat: 36.2549, lon: 44.8838, place: 'Ranya', labelWords: words },
  file: {}, local: {},
};
let state = { prayer: false, quietUntil: 0, others: [] };
const pics = [{ id: 'mg0000aaa01', at: now - 3600e3 }];
const prayers = [['fajr', 4, 38], ['dhuhr', 11, 47], ['asr', 15, 1], ['maghrib', 17, 30], ['isha', 18, 51]].map(([n, h, m]) => {
  const d = new Date(); d.setHours(h, m, 0, 0); return { name: n, at: d.getTime() }; });
function status() {
  return { tv: 'TV 23', build: '1.19', onScreen: state.away ? false : true, tvVolume: 7, tvVolumeMax: 15, others: state.others, names: 'names known for 3 of 3 songs',
    lock: { on: true, unlockedUntil: state.unlockedUntil || 0, other: 'MyTV Plus', otherWanted: 'My TV Plus', otherOpen: !!state.away, sees: false, canReturn: true },
    weather: 'from MET Norway, 12 Oct 07:20', prices: 'from tirezh.com, 12 Oct 08:30', prayerTimes: 'from amozhgary.tv (Ranya), checked 12 Oct 00:40', tvVolumeSet: 60,
    videoFormat: 'H.264 only, up to 1080p', videoFormatNext: state.nextFormat || '',
    box: state.soft ? { box: 'X96mini (Amlogic S905X, S905W or S905L), Android 9', graphics: 'Mali-450 MP', softDraw: true, decoders: 'H.264 up to 2160p, VP9 up to 2160p; not AV1' }
                    : { box: 'X96Max_Plus (Amlogic S905X3), Android 9', graphics: 'Mali-G31, OpenGL ES 3.2', softDraw: false, decoders: 'H.264 up to 2160p, VP9 up to 2160p; not AV1' },
    screen: 'drawn at 1920x1080, sent to the TV as 3840x2160, 60 Hz (it also has 50, 30 and 24 Hz)',
    page: { name: 'کافتریا', songs: 3, round: { done: 1, total: 3 }, song: { id: 'aaaaaaaaaa1', title: 'Hama Jaza - Shaw', position: 30, duration: 200 },
      state: state.prayer ? 'prayer' : 'playing', prayerName: state.prayer ? 'asr' : '', prayerUntil: state.prayer ? now + 300e3 : 0, prayerPause: 5, prayers, prayersFrom: 'amozhgary.tv',
      volume: 100, scheduleVolume: 100, zoom: 100, quality: '', openHours: '', adsSkipped: 0, problems: [], quietUntil: state.quietUntil,
      upNext: { id: 'aaaaaaaaaa2', title: 'Zakaria - Gyan', asked: false },
      asked: [{ id: 'dQw4w9WgXcQ', title: '' }],
      history: [{ id: 'aaaaaaaaaa1', title: 'Hama Jaza - Shaw', t: now - 60e3 }, { id: 'aaaaaaaaaa3', title: 'Dilan', t: now - 300e3 }] } };
}
function jpegSize(b) {          // width and height from a JPEG's SOF marker
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const body = fn => { let b = ''; req.on('data', c => b += c); req.on('end', () => fn(b)); };
  if (servePhonePage(u.pathname, res)) return;
  if (['/manifest.webmanifest', '/icon-192.png', '/apple-touch-icon.png'].includes(u.pathname)) { res.writeHead(200); return res.end('x'); }
  if (u.searchParams.get('pin') !== PIN) return send(401, { error: 'pin' });
  if (u.pathname === '/api/status') return send(200, status());
  if (u.pathname === '/api/songs') return send(200, { names: 'names known for 3 of 4 songs', songs: [
    { id: 'aaaaaaaaaa1', title: 'Hama Jaza - Shaw (Official Video)', channel: 'Hama Jaza' }, { id: 'aaaaaaaaaa2', title: 'Zakaria Abdulla - Gyan', channel: 'Zakaria' },
    { id: 'aaaaaaaaaa3', title: 'Dilan', channel: 'Rebaz Music' }, { id: 'aaaaaaaaaa4', title: '', channel: '' }] });
  if (u.pathname === '/api/settings' && req.method === 'GET') return send(200, { tv: 'TV 23', autoName: 'TV 23', defaults: tv.defaults, file: tv.file, local: tv.local, others: state.others.map(o => o.name) });
  if (u.pathname === '/api/settings' && req.method === 'POST') return body(b => { const j = JSON.parse(b); posts.push(j.local); tv.local = j.local; send(200, { ok: true, pin: PIN, tv: 'TV 23', others: [] }); });
  if (u.pathname === '/api/cmd' && req.method === 'POST') {
    const d = u.searchParams.get('do'); cmds.push(d);
    if (d === 'quiet:60') state.quietUntil = Date.now() + 60e3; if (d === 'quiet:0') state.quietUntil = 0; if (d === 'resume') state.prayer = false;
    if (d === 'otherapp') state.away = true; if (d === 'backhome') state.away = false;
    if (d === 'unlock') state.unlockedUntil = Date.now() + 15 * 60e3; if (d === 'lock') state.unlockedUntil = 0;
    return send(200, { ok: true });
  }
  if (u.pathname === '/api/pictures' && req.method === 'GET') return send(200, { pictures: pics, max: 30 });
  if (u.pathname === '/api/pictures' && req.method === 'POST') {
    if (u.searchParams.get('delete')) { deleted.push(u.searchParams.get('delete')); pics.splice(0, pics.length, ...pics.filter(p => p.id !== u.searchParams.get('delete'))); return send(200, { ok: true }); }
    return body(b => {
      const j = JSON.parse(b), full = Buffer.from(j.full.split(',')[1], 'base64'), small = Buffer.from(j.small.split(',')[1], 'base64');
      uploads.push({ full: jpegSize(full), small: jpegSize(small), bytes: full.length, jpeg: full[0] === 0xFF && full[1] === 0xD8 });
      pics.push({ id: 'mg0000bbb0' + uploads.length, at: Date.now() });
      send(200, { ok: true, id: pics[pics.length - 1].id });
    });
  }
  if (u.pathname === '/api/picture') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(fs.readFileSync(FIXTURES + '/sample-photo.jpg')); }
  if (u.pathname === '/api/looks' && req.method === 'GET') return send(200, { looks: looks.map(l => ({ name: l[0], at: l[1] })) });
  if (u.pathname === '/api/looks' && req.method === 'POST') {
    const name = u.searchParams.get('name'), all = u.searchParams.get('all'), l = looks.find(x => x[0] === name);
    if (u.searchParams.get('reset') === '1') { lookPosts.push({ name, reset: true, all }); l[1] = 0; return send(200, { ok: true, at: 0, tv: 'TV 23', others: [] }); }
    return body(b => {
      const j = JSON.parse(b), full = Buffer.from(j.full.split(',')[1], 'base64'), small = Buffer.from(j.small.split(',')[1], 'base64');
      lookPosts.push({ name, all, full: jpegSize(full), small: jpegSize(small), jpeg: full[0] === 0xFF && full[1] === 0xD8 });
      l[1] = Date.now();
      send(200, { ok: true, at: l[1], tv: 'TV 23', others: [{ name: 'TV 24', result: 'saved' }, { name: 'TV 25', result: 'has a different PIN, so it wasn\'t changed' }] });
    });
  }
  if (u.pathname === '/api/look') { lookGets.push(u.searchParams.get('name') + ':' + u.searchParams.get('size')); res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(fs.readFileSync(FIXTURES + '/sample-photo.jpg')); }
  res.writeHead(404); res.end();
});
let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = (page, sel) => page.$eval(sel, e => e.textContent);
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await launch();
  const page = await b.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument(p => { try { localStorage.setItem('twilight-tv-pin', p); } catch (e) {} }, PIN);
  console.log('\nPhone page: the new controls');
  await page.goto(url, { waitUntil: 'load' }); await sleep(900);
  check('can go on a home screen: web manifest and icons linked', await page.evaluate(() =>
    !!document.querySelector('link[rel=manifest][href="/manifest.webmanifest"]') && !!document.querySelector('link[rel=apple-touch-icon][href="/apple-touch-icon.png"]')));
  check('one TV box: no list of TVs, no "show this TV\'s name"', await page.evaluate(() => document.getElementById('tvs').hidden && document.getElementById('identify').hidden));
  check('up next, under now playing', (await text(page, '#upNext')) === 'Up next: Zakaria - Gyan');
  check('the call to prayer times today, with the facts', (await text(page, '#facts')).includes('Call to prayer today: Fajr 04:38, Dhuhr 11:47, Asr 15:01, Maghrib 17:30, Isha 18:51, amozhgary.tv\'s times (the music pauses 5 min, in opening hours).'), await text(page, '#facts'));
  check('...and where the prayer times come from', (await text(page, '#facts')).includes('Prayer times: from amozhgary.tv (Ranya), checked 12 Oct 00:40.'));
  check('TV volume: says it goes back at the next song', (await text(page, '#tvvolNote')) === "The box's own, until the next song");
  check('...and where the gold and currency prices come from', (await text(page, '#facts')).includes('Gold and currency prices: from tirezh.com, 12 Oct 08:30.'), await text(page, '#facts'));
  {
    const f = await text(page, '#facts');
    check('the box in the facts: video format, model and chip, graphics, what the chip decodes, the screen',
      f.includes('Video from YouTube: H.264 only, up to 1080p.') && f.includes('TV box: X96Max_Plus (Amlogic S905X3), Android 9.') &&
      f.includes('Graphics: Mali-G31, OpenGL ES 3.2.') && f.includes("The box's chip decodes H.264 up to 2160p, VP9 up to 2160p; not AV1.") &&
      f.includes('Screen: drawn at 1920x1080, sent to the TV as 3840x2160, 60 Hz (it also has 50, 30 and 24 Hz).') && !f.includes('Too old'), f);
    state.soft = true; state.nextFormat = 'H.264 or VP9, no AV1';
    await sleep(2600);
    const g = await text(page, '#facts');
    check('...old graphics: says Firefox\'s engine draws on the processor, at 720p; a format waiting for the restart',
      g.includes("Graphics: Mali-450 MP. Too old for Firefox's engine: it draws everything on the processor, so videos play at 720p.") &&
      g.includes('Video from YouTube: H.264 only, up to 1080p (H.264 or VP9, no AV1 once the app restarts).'), g);
    state.soft = false; state.nextFormat = '';
  }
  await page.tap('#quiet'); await sleep(900);
  check('"Quiet for a minute": sends quiet:60, then offers "Back to normal volume"', cmds.at(-1) === 'quiet:60' && (await text(page, '#quietText')).startsWith('Back to normal volume (quiet until'), await text(page, '#quietText'));
  await page.tap('#quiet'); await sleep(900);
  check('...which sends quiet:0', cmds.at(-1) === 'quiet:0' && (await text(page, '#quietText')) === 'Quiet for a minute');
  await page.tap('#search'); await page.type('#search', 'hama'); await sleep(700);
  const rows = await page.$$eval('#results li', l => l.map(li => li.textContent));
  check('search the playlist by name or singer', rows.length === 1 && rows[0].startsWith('Hama Jaza - Shaw (Official Video)'), rows);
  check('...says how many songs and names it knows', (await text(page, '#songsInfo')) === '4 songs: names known for 3 of 4 songs.', await text(page, '#songsInfo'));
  await page.tap('#results li button[data-cmd="playnext:aaaaaaaaaa1"]'); await sleep(700);
  check('"Next" on a song: sends playnext with its ID, and says so', cmds.at(-1) === 'playnext:aaaaaaaaaa1' && (await text(page, '#say')) === 'Comes next: Hama Jaza - Shaw (Official Video)', await text(page, '#say'));
  await page.$eval('#search', e => { e.value = ''; }); await page.type('#search', 'aaaaaaaaaa4'); await sleep(500);
  await page.tap('#results li button[data-cmd="playnow:aaaaaaaaaa4"]'); await sleep(700);
  check('"Now" on a song with no name yet: playnow', cmds.at(-1) === 'playnow:aaaaaaaaaa4');
  await page.type('#link', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&t=10s'); await page.tap('#linkNext'); await sleep(700);
  check('a pasted YouTube link: "Play next" sends its video ID', cmds.at(-1) === 'playnext:dQw4w9WgXcQ' && (await page.$eval('#link', e => e.value)) === '');
  await page.type('#link', 'https://youtu.be/kJQP7kiw5Fk?si=abc'); await page.tap('#linkNow'); await sleep(700);
  check('a youtu.be link: "Play now"', cmds.at(-1) === 'playnow:kJQP7kiw5Fk');
  await page.type('#link', 'https://www.youtube.com/shorts/aBcDeFgHiJk'); await page.tap('#linkNext'); await sleep(700);
  check('a Shorts link too', cmds.at(-1) === 'playnext:aBcDeFgHiJk');
  const n = cmds.length;
  await page.type('#link', 'https://example.com/song'); await page.tap('#linkNow'); await sleep(500);
  check('not a YouTube link: explained, nothing sent', cmds.length === n && !(await page.$eval('#linkErr', e => e.hidden)));
  check('waiting to play: the songs asked for, with ×', (await text(page, '#askedList')).startsWith('YouTube video dQw4w9WgXcQ') && !(await page.$eval('#askedCard', e => e.hidden)));
  await page.tap('#askedList button'); await sleep(600);
  check('...× takes it off', cmds.at(-1) === 'unnext:dQw4w9WgXcQ');
  const hist = await page.$$eval('#historyList li', l => l.map(li => li.querySelector('b').textContent + ' @ ' + li.querySelector('span').textContent));
  check('the last songs, with the time each played', hist.length === 2 && hist[0].startsWith('Hama Jaza - Shaw @ ') && /^\d\d:\d\d$/.test(hist[0].split(' @ ')[1]), hist);
  await page.tap('#historyList li button'); await sleep(600);
  check('..."Again" plays one next', cmds.at(-1) === 'playnext:aaaaaaaaaa1');
  await shot(page, 'phone-new-control.png', { fullPage: true });
  state.prayer = true; await sleep(2600);
  check('call to prayer: says so and when the music is back; Resume, no Next', (await text(page, '#state')).startsWith('Paused for the call to prayer (Asr). The music comes back at') &&
    (await text(page, '#pauseText')) === 'Resume music' && await page.$eval('#next', e => e.disabled), await text(page, '#state'));
  await page.tap('#pause'); await sleep(900);
  check('...Resume music sends "resume"', cmds.at(-1) === 'resume');

  console.log('\nPhone page: the Screen tab');
  await page.tap('#tabScreen'); await sleep(1200);
  check('prices, messages, pictures, QR codes, the panel and special days, the words', await page.evaluate(() =>
    [...document.querySelectorAll('#screenView .group')].map(g => g.textContent).join('|') === 'Gold and currency prices|Café screen pictures|Between songs|Pictures between songs|QR codes|Info panel and special days' &&
    ['priceItems', 'messages', 'wifiName', 'wifiPassword', 'menuUrl', 'infoPanel', 'clock24', 'videoColors', 'numerals', 'specialDays', 'hijriAdjust', 'kurdishNewYear', 'labels'].every(k => document.querySelector('#screenForm .field[data-key="' + k + '"]'))),
    await page.evaluate(() => [...document.querySelectorAll('#screenView .group')].map(g => g.textContent).join('|')));
  const ms = await page.evaluate(() => { const f = document.querySelector('#screenForm .field[data-key="menuSlides"]'), m = document.querySelector('#screenForm .field[data-key="messages"]');
    return f ? [f.querySelector('input[type=checkbox]').checked, f.textContent.includes('Items from the menu between songs'), f.closest('section') === m.closest('section')] : null; });
  check('"Items from the menu between songs": on to start with, with the messages (Between songs)', ms && ms[0] && ms[1] && ms[2], ms);
  check('the save button is here too', await page.$eval('#savebar', e => !e.hidden));
  const kny = await page.$eval('#f-kurdishNewYear', s => [s.value, [...s.options].map(o => o.value).join(',')]);
  check('the Kurdish date\'s new year: 21 March (built in) or the equinox\'s day', kny[0] === '21march' && kny[1] === '21march,equinox', kny);
  const picks = await page.$$eval('#f-priceItems select', l => l.map(s => s.value));
  check('the prices: seven places, filled with the TV\'s own choice', JSON.stringify(picks) === '["us","eu","gb","tr","ir","gold21","gold18"]', picks);
  const addMsg = async t => {           // (scrolled to the middle first: at the bottom the save bar covers it)
    await page.$eval('.field[data-key="messages"] .add', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
    await page.tap('.field[data-key="messages"] .add'); await sleep(250); await page.keyboard.type(t);
  };
  await addMsg('Fresh mint tea is back');
  await addMsg('Happy hour 6-8');
  await page.select('#f-priceItems .pick:nth-child(2) select', 'ounce');
  await page.select('#f-priceItems .pick:nth-child(3) select', '');
  await page.select('#f-priceItems .pick:nth-child(7) select', 'gold24');
  await page.select('#f-numerals', 'kurdish');
  await page.select('#f-kurdishNewYear', 'equinox');
  check('the price address right under the prices, empty (tirezh.com)', await page.$eval('#f-pricesUrl', i => i.value === '' && i.placeholder === 'https://tirezh.com/api/economy' &&
    i.closest('.field').previousElementSibling.getAttribute('data-key') === 'priceItems'));
  await page.$eval('#f-pricesUrl', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  await page.type('#f-pricesUrl', 'https://tirezh.name.workers.dev');
  await page.type('#f-wifiName', 'Twilight Cafe'); await page.type('#f-wifiPassword', 'twilight2026'); await page.type('#f-menuUrl', 'https://twilight.example/menu');
  await page.tap('#f-labels summary'); await sleep(300);
  const ph = await page.$$eval('#f-labels input', l => l.map(i => i.placeholder));
  check('the words: the TV\'s English ones shown in grey', ph.includes('Now playing') && ph.includes('Eid Mubarak') && ph.length === Object.keys(words).length, ph.length);
  const inputs = await page.$$('#f-labels input');
  await inputs[Object.keys(words).indexOf('nowPlaying')].type('ئێستا');
  await page.tap('#save'); await sleep(900);
  const saved = posts.at(-1);
  check('Save: the prices in their order, Kurdish digits, messages, Wi-Fi, menu link, a Kurdish word',
    JSON.stringify(saved.priceItems) === '["us","ounce","tr","ir","gold21","gold24"]' && saved.numerals === 'kurdish' && JSON.stringify(saved.messages) === '["Fresh mint tea is back","Happy hour 6-8"]' &&
    saved.wifiName === 'Twilight Cafe' && saved.wifiPassword === 'twilight2026' && saved.menuUrl === 'https://twilight.example/menu' && saved.labels.nowPlaying === 'ئێستا' &&
    Object.keys(saved.labels).length === 1, saved);
  check('...the worker\'s address for the prices, and the Kurdish date from the equinox', saved.pricesUrl === 'https://tirezh.name.workers.dev' && saved.kurdishNewYear === 'equinox',
    [saved.pricesUrl, saved.kurdishNewYear]);
  await sleep(600);
  await page.select('#f-priceItems .pick:nth-child(3) select', 'us');
  await page.tap('#save'); await sleep(900);
  check('the same price chosen twice is shown once (the dollar put in place of the lira)', JSON.stringify(posts.at(-1).priceItems) === '["us","ounce","ir","gold21","gold24"]', posts.at(-1).priceItems);
  await page.tap('button[data-cmd="look:newroz"]'); await sleep(700);
  check('"Newroz" shows that look on the TV', cmds.at(-1) === 'look:newroz' && (await text(page, '#say')).startsWith('Look at the TV'));
  check('pictures: the ones on the TV, with ×', (await page.$$('#picGrid figure')).length === 1 && (await text(page, '#picMsg')) === '1 of 30 pictures.');
  const file = await page.$('#picUpload input');
  await file.uploadFile(FIXTURES + '/sample-photo.jpg'); await sleep(3000);
  check('a photo from the phone: sent as a 1920x1080 JPEG with a 384x216 copy', uploads.length === 1 && uploads[0].jpeg && JSON.stringify(uploads[0].full) === '[1920,1080]' &&
    JSON.stringify(uploads[0].small) === '[384,216]', uploads);
  check('...and it\'s in the list', (await page.$$('#picGrid figure')).length === 2 && (await text(page, '#picMsg')).startsWith('1 picture added.'), await text(page, '#picMsg'));
  await shot(page, 'phone-new-screen.png', { fullPage: true });
  await page.evaluate(() => document.querySelector('#screenForm .field[data-key="kurdishNewYear"]').scrollIntoView({ block: 'center' })); await sleep(400);
  await shot(page, 'phone-kurdish-field.png');
  await page.tap('#picGrid figure .del'); await sleep(900);
  check('× deletes one (after asking)', deleted[0] === 'mg0000aaa01' && (await page.$$('#picGrid figure')).length === 1);

  console.log('\nPhone page: the café screen\'s pictures');
  const tiles = () => page.$$eval('#lookGrid figure', l => l.map(f => [f.dataset.look, f.querySelector('figcaption').textContent, f.querySelector('.src').textContent,
    !f.querySelector('.builtin').hidden, /\/api\/look\?name=\w+&size=small/.test(f.querySelector('img').getAttribute('src'))]));
  let t = await tiles();
  check('six, each as the TV shows it now: yours or built in (only yours can go back to the built-in one)', JSON.stringify(t) === JSON.stringify([
    ['cafe', 'Every day', 'built-in', false, true], ['plain', 'Under messages and the call to prayer', 'built-in', false, true], ['newroz', 'Newroz', 'yours', true, true],
    ['eid', 'Eid (both Eids)', 'built-in', false, true], ['barat', 'Barat Night', 'built-in', false, true], ['newyear', 'New Year', 'built-in', false, true]]), t);
  check('...their small copies, from the TV', ['cafe:small', 'plain:small', 'newroz:small', 'eid:small', 'barat:small', 'newyear:small'].every(k => lookGets.includes(k)), lookGets);
  const lookFile = await page.$('#lookGrid figure[data-look="cafe"] input[type=file]');
  await lookFile.uploadFile(FIXTURES + '/sample-photo.jpg'); await sleep(3000);
  check('Change: a 1920x1080 JPEG (cropped to fill, as the TV does) and a 384x216 copy, for every TV', lookPosts.length === 1 && lookPosts[0].name === 'cafe' &&
    lookPosts[0].all === '1' && lookPosts[0].jpeg && JSON.stringify(lookPosts[0].full) === '[1920,1080]' && JSON.stringify(lookPosts[0].small) === '[384,216]', lookPosts);
  check('...says where it went, and why one TV didn\'t take it', (await text(page, '#lookMsg')) ===
    '“Every day”: New picture saved on TV 23, TV 24. TV 25 has a different PIN, so it wasn\'t changed.', await text(page, '#lookMsg'));
  t = await tiles();
  check('...and shows it as yours', t[0][2] === 'yours' && t[0][3] === true, t[0]);
  await page.evaluate(() => document.querySelector('#lookGrid').scrollIntoView({ block: 'center' })); await sleep(300);
  await shot(page, 'phone-looks.png');
  await page.tap('#lookGrid figure[data-look="newroz"] .builtin'); await sleep(900);
  check('Built-in (after asking): back to the built-in Newroz picture, on every TV', JSON.stringify(lookPosts[1]) === JSON.stringify({ name: 'newroz', reset: true, all: '1' }) &&
    (await tiles())[2][2] === 'built-in' && (await text(page, '#lookMsg')).startsWith('“Newroz”: Back to the built-in picture on TV 23'), [lookPosts[1], await text(page, '#lookMsg')]);

  console.log('\nPhone page: the box kept in Twilight TV');
  await page.tap('#tabControl'); await sleep(600);
  check('"Open MyTV Plus": the other app the box has, under the controls', await page.$eval('#otherApp', b => !b.hidden && b.textContent === 'Open MyTV Plus'));
  await page.$eval('#otherApp', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  await page.tap('#otherApp'); await sleep(2600);
  check('...opens it on the TV; the phone says how to come back', cmds.at(-1) === 'otherapp' &&
    (await text(page, '#say')) === 'Look at the TV: MyTV Plus. Press Home on the remote to come back.', [cmds.at(-1), await text(page, '#say')]);
  check('...then: MyTV Plus is on, with a button back to the music', await page.$eval('#notOn', e => !e.hidden) && await page.$eval('#backHome', b => !b.hidden) &&
    (await text(page, '#notOnText')).startsWith('MyTV Plus is on the TV.') && await page.$eval('#otherApp', b => b.hidden), await text(page, '#notOnText'));
  await page.tap('#backHome'); await sleep(2600);
  check('"Back to Twilight TV"', cmds.at(-1) === 'backhome' && await page.$eval('#notOn', e => e.hidden), cmds.at(-1));

  console.log('\nPhone page: new settings');
  await page.tap('#tabSettings'); await sleep(900);
  check('one TV box: no "Name of this TV", no "Also on the other TVs"', await page.evaluate(() => !document.querySelector('.field[data-key="tvName"]') && document.getElementById('allBox').hidden));
  const asr = () => page.$eval('.ptime[data-prayer="asr"]', e => e.textContent);
  check('call to prayer: today\'s times beside each prayer', (await asr()) === '15:01', await asr());
  await page.tap('.field[data-key="prayerAdjust"] .arow:nth-child(3) .step[aria-label="More"]');
  await page.tap('.field[data-key="prayerAdjust"] .arow:nth-child(3) .step[aria-label="More"]'); await sleep(300);
  check('moving Asr by +2 min shows 15:03 straight away', (await asr()) === '15:03' && (await page.$eval('.field[data-key="prayerAdjust"] .arow:nth-child(3) output', e => e.textContent)) === '+2 min');
  await page.tap('.field[data-key="playlistSchedule"] .add'); await sleep(200);
  await page.type('.field[data-key="playlistSchedule"] input[type=text]', 'https://www.youtube.com/playlist?list=PLevening');
  await page.$eval('#f-lat', e => { e.value = ''; e.dispatchEvent(new Event('input')); }); await page.type('#f-lat', '200');
  await page.tap('#save'); await sleep(500);
  check('a latitude that can\'t be: caught before saving', (await text(page, '#saveMsg')).startsWith('Fix the marked settings first') && !(await page.$eval('.field[data-key="lat"] .err', e => e.hidden)));
  await page.$eval('#f-lat', e => { e.value = ''; e.dispatchEvent(new Event('input')); }); await page.type('#f-lat', '36.2549');
  await page.tap('#save'); await sleep(900);
  check('Save: Asr +2, the morning playlist from 10:00', JSON.stringify(posts.at(-1).prayerAdjust) === '{"asr":2}' &&
    posts.at(-1).playlistSchedule['10:00'] === 'https://www.youtube.com/playlist?list=PLevening', posts.at(-1));
  await shot(page, 'phone-new-settings.png', { fullPage: true });
  check('This TV box: keep the box in Twilight TV (on), and the one other app allowed', await page.evaluate(() =>
    document.querySelector('.field[data-key="lockApps"] input').checked && document.getElementById('f-otherApp').placeholder === 'My TV Plus'));
  check('Tools: the lock\'s state, and Unlock for 15 minutes', !(await page.$eval('#unlockBox', b => b.hidden)) && await page.$eval('#lockBox', b => b.hidden) &&
    (await text(page, '#lockMsg')).startsWith('Locked: only Twilight TV and MyTV Plus.') && (await text(page, '#lockMsg')).includes('Usage access'), await text(page, '#lockMsg'));
  await page.$eval('#unlockBox', e => e.scrollIntoView({ block: 'center' })); await sleep(200);
  await page.tap('#unlockBox'); await sleep(1500);
  check('...unlocking: for 15 minutes, then the button to lock it again', cmds.at(-1) === 'unlock' && (await text(page, '#toolMsg')).startsWith('Unlocked for 15 minutes') &&
    await page.$eval('#unlockBox', b => b.hidden) && !(await page.$eval('#lockBox', b => b.hidden)) && (await text(page, '#lockMsg')).startsWith('Unlocked until'),
    [cmds.at(-1), await text(page, '#toolMsg'), await text(page, '#lockMsg')]);
  await page.tap('#lockBox'); await sleep(1500);
  check('...and locking it again', cmds.at(-1) === 'lock' && !(await page.$eval('#unlockBox', b => b.hidden)), cmds.at(-1));
  state.others = [{ name: 'TV 24', url: 'http://192.168.1.24:8080/' }]; await sleep(2600);
  await page.tap('#tabControl'); await sleep(300);
  check('with a second TV box: the TVs and "show this TV\'s name" appear', await page.evaluate(() => !document.getElementById('tvs').hidden && !document.getElementById('identify').hidden));
  check('fits a phone screen (no sideways scrolling)', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no script errors', errors.length === 0, errors);
  await b.close(); server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
