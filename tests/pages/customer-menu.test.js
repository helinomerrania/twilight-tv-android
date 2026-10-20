// The customers' menu page's odd cases, in Chromium at phone size: one language, the café's digits,
// the TV not answering, an empty menu, a name in one language only
const { ASSETS, FIXTURES, launch, shot } = require('./lib/common');
const http = require('http'), fs = require('fs');
let data = null, fail = 0, asks = 0, now = {}, nowAsks = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/menu/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(ASSETS + '/menu/index.html')); }
  // the page's own styles and script, as the app serves them (assets/menu)
  const own = /^\/menu\/(menu\.css|menu\.js)$/.exec(u.pathname);
  if (own) { res.writeHead(200, { 'Content-Type': own[1].endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' }); return res.end(fs.readFileSync(ASSETS + '/menu/' + own[1])); }
  if (u.pathname === '/menu/data') {
    asks++;
    if (fail > 0) { fail--; res.writeHead(503); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); return res.end(JSON.stringify(data));
  }
  if (u.pathname === '/menu/now') {               // the song on the TV now: its colour
    nowAsks++;
    if (now === 'broken') { res.writeHead(500); return res.end('oops'); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(now));
  }
  if (/^\/menu\/pics\/[a-z0-9]+(\.small)?\.jpg$/.test(u.pathname)) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(fs.readFileSync(FIXTURES + '/sample-photo.jpg')); }
  const m = /^\/menu\/fonts\/([a-z0-9-]+\.woff2)$/.exec(u.pathname);
  if (m) { res.writeHead(200, { 'Content-Type': 'font/woff2' }); return res.end(fs.readFileSync(ASSETS + '/fonts/' + m[1])); }
  res.writeHead(404); res.end();
});
let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const item = (name, price) => Object.assign({ id: 'i' + Math.random().toString(36).slice(2, 9), name }, price != null ? { price } : {});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/menu/';
  const b = await launch();
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const rows = () => p.$$eval('main .row', l => l.map(r => [r.querySelector('.nm').textContent, (r.querySelector('.pr') || { textContent: '' }).textContent]));

  console.log('\nThe customers\' menu: odd cases');
  data = { v: 1, name: 'کافتریا و ڕێستورانتی توایڵایت', word: 'مینیو', numerals: 'latin', categories: [
    { id: 'c1', name: { ku: 'نێرگلە' }, items: [item({ ku: 'سێو' }, 10000), item({ ku: 'نەعنا' }, 1250000), item({ ku: 'ترێ' })], subs: [] } ] };
  await p.goto(url, { waitUntil: 'networkidle0' });
  check('the café\'s digits "latin": Kurdish words, 123 digits', JSON.stringify(await rows()) === JSON.stringify([['سێو', '10,000د.ع'], ['نەعنا', '1,250,000د.ع'], ['ترێ', '']]), await rows());
  check('an item without a price: no price', (await rows())[2][1] === '');
  check('only Kurdish names: no language switch; one category: no bar of categories', await p.$eval('#langs', e => e.hidden) && await p.$eval('#bar', e => e.hidden));
  data.numerals = 'kurdish';
  data.categories[0].name.en = 'Hookah';
  data.categories.push({ id: 'c2', name: { en: 'Tea' }, items: [item({ en: 'Black tea' }, 1000)], subs: [] });
  await p.evaluate(() => { try { localStorage.setItem('twilight-menu-lang', 'en'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle0' });
  check('"kurdish" digits even in English; the language chosen before kept', await p.$eval('html', h => h.dir) === 'ltr' && (await rows())[3][1] === '١٬٠٠٠IQD', await rows());
  check('...a name only in Kurdish stays Kurdish, the right way round', await p.$eval('main .row .nm', e => e.textContent + '|' + e.dir) === 'سێو|auto');
  check('two categories: the bar of them', !(await p.$eval('#bar', e => e.hidden)) && (await p.$$eval('#chips button', l => l.map(c => c.textContent))).join() === 'Hookah,Tea');
  for (let i = 0; i < 12; i++) data.categories[0].items.push(item({ ku: 'تام ' + i, en: 'Flavour ' + i }, 10000));
  for (let i = 0; i < 9; i++) data.categories[1].items.push(item({ en: 'Tea ' + i }, 1000 + 250 * i));     // (prices apart: a line each)
  data.categories.push({ id: 'c3', name: { en: 'Juice' }, items: [item({ en: 'Orange' }, 4000)], subs: [] });
  await p.evaluate(() => { try { localStorage.setItem('twilight-menu-lang', 'ar'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle0' });
  check('a language the menu doesn\'t have (Arabic): Kurdish, as the café\'s own', await p.$eval('html', h => h.lang + h.dir) === 'ckbrtl');
  const lit = () => p.$$eval('#chips button', l => l.map(c => c.getAttribute('aria-current')).indexOf('true'));
  await p.click('#chips button:nth-child(2)');
  await sleep(1200);
  const top = await p.$eval('#c-c2', s => Math.round(s.getBoundingClientRect().top)), bar = await p.$eval('#bar', e => Math.round(e.getBoundingClientRect().bottom));
  check('a category tapped in the bar: the page goes to it, just under the bar; its chip lit', top >= bar - 1 && top <= bar + 12 && await lit() === 1, [top, bar, await lit()]);
  await p.click('#chips button:nth-child(3)');
  await sleep(1200);
  const end = await p.evaluate(() => Math.round(window.innerHeight + window.scrollY - document.documentElement.scrollHeight));
  const last = await p.$eval('#c-c3', s => s.getBoundingClientRect().bottom <= window.innerHeight);
  check('the last (short) one: as far as the page goes, all of it in sight, its chip lit', end >= -4 && last && await lit() === 2, [end, last, await lit()]);
  const inBar = () => p.evaluate(() => { const c = document.querySelector('#chips [aria-current="true"]').getBoundingClientRect(), b = document.getElementById('chips').getBoundingClientRect();
    return c.left >= b.left - 1 && c.right <= b.right + 1; });
  check('...the lit chip slid into sight in the bar (right to left)', await inBar());
  await p.evaluate(() => window.scrollBy(0, -40));
  await sleep(400);
  check('...a little back up: the one at the top of the screen lit (Tea)', await lit() === 1, await lit());
  await p.evaluate(() => window.scrollTo(0, 0));
  await sleep(700);
  check('...all the way up: the first lit again, in sight', await lit() === 0 && await inBar(), await lit());
  await p.evaluate(() => [...document.querySelectorAll('#langs button')].find(b => b.textContent === 'English').click());
  await sleep(300);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(900);
  check('English (left to right): at the end the last lit, in sight too', await lit() === 2 && await inBar(), await lit());
  await p.evaluate(() => [...document.querySelectorAll('#langs button')].find(b => b.textContent === 'کوردی').click());
  await sleep(200);
  data.categories.pop();
  data.categories[1].items.splice(1);

  fail = 1;
  await p.reload({ waitUntil: 'networkidle0' });
  await sleep(600);
  check('the TV doesn\'t answer: a button to try again, nothing else', !(await p.$eval('#again', e => e.hidden)) && (await p.$$('main section')).length === 0);
  await p.click('#again');
  await sleep(500);
  check('...tapped: the menu', (await p.$$('main section')).length === 2 && asks >= 2, (await p.$$('main section')).length);
  data = { v: 2, name: '', word: '', numerals: 'auto', categories: [] };
  await p.reload({ waitUntil: 'networkidle0' });
  check('phones\' browsers told not to offer "Translate this page?", in every language of the menu', await p.$eval('html', h => h.getAttribute('translate')) === 'no'
    && await p.$eval('meta[name=google]', m => m.content) === 'notranslate' && await p.$eval('body', b => b.classList.contains('notranslate')));
  check('an empty menu (all hidden): the name only, no bar, no errors', await p.$eval('#name', e => e.textContent) === 'Twilight' && await p.$eval('#bar', e => e.hidden)
    && (await p.$$('main section')).length === 0 && await p.$eval('#word', e => e.hidden));

  console.log('\nNames on the pictures, descriptions when an item is tapped');
  const withNote = (it, note, pic) => Object.assign(it, note ? { note } : {}, pic ? { picture: pic } : {});
  data = { v: 3, name: 'Twilight', word: '', numerals: 'auto', categories: [
    { id: 'p1', name: { ku: 'نێرگلە', en: 'Hookah' }, note: { ku: 'بۆنی خۆش', en: 'Sweet smoke' }, picture: 'catpic', items: [
      withNote(item({ ku: 'سێو', en: 'Apple' }, 5000), { ku: 'سێوی سوور', en: 'Red apples' }, 'applepic'),
      withNote(item({ ku: 'ترێ', en: 'Grape' }, 5000), { en: 'Dark grapes, a little sour' }),
      item({ ku: 'نەعنا', en: 'Mint' }, 5000)],
      subs: [{ id: 's1', name: { ku: 'گەرم', en: 'Hot' }, note: { en: 'Warm cups' }, picture: 'subpic', items: [item({ en: 'Tea' }, 500)] },
             { id: 's2', name: { en: 'Cold' }, items: [item({ en: 'Juice' }, 1500)] }] },
    { id: 'p2', name: { en: 'Nuts' }, note: { en: 'Crunchy' }, items: [item({ en: 'Almonds' }, 3000)], subs: [] }] };
  await p.evaluate(() => { try { localStorage.setItem('twilight-menu-lang', 'en'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => [...document.querySelectorAll('.cover img')].every(i => i.complete), { timeout: 5000 }).catch(() => {});
  const cover = await p.$eval('#c-p1', s => {
    const c = s.firstElementChild, cap = c.querySelector('.cap'), h = cap && cap.querySelector('h2'), n = cap && cap.querySelector('.note');
    const o = c.getBoundingClientRect(), cr = cap.getBoundingClientRect(), i = c.querySelector('img').getBoundingClientRect();
    const r = { left: o.left, right: o.right, width: c.clientWidth, top: o.top + c.clientTop, bottom: o.top + c.clientTop + c.clientHeight, height: c.clientHeight };   // inside its fine edge
    return { first: c.className, name: h.textContent, h2s: s.querySelectorAll('h2').length, shape: Math.round(r.width / r.height * 100) / 100,
      atBottom: Math.abs(cr.bottom - r.bottom) < 1, nameFirst: cap.firstElementChild.className === 'title' && cap.firstElementChild.firstElementChild === h
        && cap.firstElementChild.nextElementSibling === n, fills: Math.abs(i.height - r.height) < 1,
      fade: getComputedStyle(cap).backgroundImage.startsWith('linear-gradient'), note: n && n.textContent, after: c.nextElementSibling.tagName,
      inset: Math.abs(r.left - c.nextElementSibling.getBoundingClientRect().left) < 1 && Math.abs(r.right - c.nextElementSibling.getBoundingClientRect().right) < 1 && r.left >= 15,
      round: getComputedStyle(c).borderTopLeftRadius, edge: getComputedStyle(c).borderTopWidth };
  });
  check('a category with a picture: its name and description on it, along the bottom, over a dark fade; nothing above it', cover.first === 'cover' && cover.name === 'Hookah'
    && cover.h2s === 1 && cover.atBottom && cover.fade && cover.fills && Math.abs(cover.shape - 16 / 9) < 0.03, cover);
  check('...the picture inside the margins, as wide as the list under it, rounded, with a fine edge', cover.inset && cover.round === '26px' && cover.edge === '1px', cover);
  check('...the description under the name, on the picture too (nothing between the picture and the items)', cover.nameFirst && cover.note === 'Sweet smoke' && cover.after === 'UL', cover);
  const subs = await p.$$eval('#c-p1 h3', l => l.map(h => [h.querySelector('.own').textContent, (h.querySelector('.from') || {}).textContent, h.closest('.cover') ? h.closest('.cover').className : '',
    getComputedStyle(h, '::after').display, h.nextElementSibling && h.nextElementSibling.classList.contains('note') ? h.nextElementSibling.textContent : '']));
  check('a subcategory with a picture: its name and description on it too, after its category\'s name; one without: its name as before, with the line beside it',
    JSON.stringify(subs) === JSON.stringify([['Hot', 'Hookah', 'cover sub', 'none', 'Warm cups'], ['Cold', 'Hookah', '', 'block', '']]), subs);
  const strip = await p.$eval('#c-p1 .cover.sub', c => {
    const r = c.getBoundingClientRect(), main = document.querySelector('main .items').getBoundingClientRect(), h = c.querySelector('h3');
    const at = k => h.querySelector(k).getBoundingClientRect();
    return { shape: Math.round(r.width / r.height * 100) / 100, inset: Math.abs(r.left - main.left) < 1 && Math.abs(r.right - main.right) < 1, round: getComputedStyle(c).borderTopLeftRadius,
      order: at('.from').right <= at('.sep').left + 1 && at('.sep').right <= at('.own').left + 1, sep: h.querySelector('.sep').textContent, hidden: h.querySelector('.sep').getAttribute('aria-hidden') };
  });
  check('...its picture a shorter strip (2:1), rounded, inside the margins like the items', Math.abs(strip.shape - 2) < 0.03 && strip.inset && strip.round === '22px', strip);
  check('...English: "Hookah › Hot", left to right (the › not read out)', strip.order && strip.sep === '›' && strip.hidden === 'true', strip);
  check('a category without a picture: its name in gold, then its description', await p.$eval('#c-p2', s => s.firstElementChild.className + '|' + s.querySelector('h2').textContent
    + '|' + s.firstElementChild.nextElementSibling.textContent + '|' + getComputedStyle(s.querySelector('h2')).backgroundClip) === 'title|Nuts|Crunchy|text');
  const list = await p.$$eval('#c-p1 > .items .row', l => l.map(r => [r.tagName, r.className, r.textContent]));
  const ds = await p.$$eval('#c-p1 > .items .row', l => l.map(r => { const d = r.querySelector('.ds'); return d ? [d.textContent, getComputedStyle(d).webkitLineClamp] : null; }));
  check('the list: each name, a dotted line to its price, and the start of its description under them (two lines at most)',
    JSON.stringify(ds) === JSON.stringify([['Red apples', '2'], ['Dark grapes, a little sour', '2'], null, null, null]) &&
    await p.$$eval('#c-p1 > .items .row', l => l.every(r => !r.querySelector('.pr') || r.querySelector('.top').children[1].className === 'dots')), ds);
  check('...one with a picture or a description opens when tapped; one with neither doesn\'t (Mint, and the subcategories\' Tea and Juice)',
    JSON.stringify(list.map(r => r[0] + '.' + r[1])) === JSON.stringify(['BUTTON.row pic', 'BUTTON.row', 'DIV.row', 'DIV.row', 'DIV.row']), list.map(r => r[0] + '.' + r[1]));
  await p.click('#c-p1 > .items li:nth-child(2) .row');
  await sleep(400);
  const bare = await p.evaluate(() => {
    const card = document.querySelector('#sheet .card'), h = card.querySelector('h2'), x = card.querySelector('.close');
    return { open: !document.getElementById('sheet').hidden, img: !!card.querySelector('img'), bare: card.classList.contains('bare'), name: h.textContent,
      note: (card.querySelector('.note') || {}).textContent, price: (card.querySelector('.pr') || {}).textContent, clear: h.getBoundingClientRect().right <= x.getBoundingClientRect().left + 1 };
  });
  check('tapping one with a description and no picture: its name, description and price, the name clear of the ×', bare.open && !bare.img && bare.bare && bare.name === 'Grape'
    && bare.note === 'Dark grapes, a little sour' && bare.price === '5,000IQD' && bare.clear, bare);
  await shot(p, 'bare-sheet.png');
  await p.keyboard.press('Escape');
  await p.click('#c-p1 > .items li:nth-child(1) .row');
  await sleep(400);
  check('...one with a picture: the picture big, then its description', await p.$eval('#sheet', s => !!s.querySelector('img') && !s.querySelector('.card').classList.contains('bare')
    && s.querySelector('.note').textContent === 'Red apples'));
  await p.keyboard.press('Escape');
  await p.evaluate(() => [...document.querySelectorAll('#langs button')].find(b => b.textContent === 'کوردی').click());
  await sleep(300);
  check('Kurdish: the names on the pictures in Kurdish, right to left', JSON.stringify(await p.$$eval('.cap h2, .cap > h3 .own', l => l.map(h => h.textContent + '|' + getComputedStyle(h).direction)))
    === JSON.stringify(['نێرگلە|rtl', 'گەرم|rtl']));
  const ku = await p.$eval('#c-p1 .cover.sub h3', h => {
    const at = k => h.querySelector(k).getBoundingClientRect();
    return { from: h.querySelector('.from').textContent, order: at('.from').left >= at('.sep').right - 1 && at('.sep').left >= at('.own').right - 1, dir: getComputedStyle(h.querySelector('.sep')).direction };
  });
  check('...the category\'s name first, on the right, then the subcategory\'s to its left (the arrow in the page\'s direction)', ku.from === 'نێرگلە' && ku.order && ku.dir === 'rtl', ku);

  const shortNote = data.categories[0].note;
  data.categories[0].note = { ku: 'یەکێکی درێژ. '.repeat(30).trim(), en: 'A long one. '.repeat(33).trim() };   // the page is in Kurdish here
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => [...document.querySelectorAll('.cover img')].every(i => i.complete), { timeout: 5000 }).catch(() => {});
  const tall = await p.$eval('#c-p1 .cover', c => {
    const o = c.getBoundingClientRect(), cap = c.querySelector('.cap'), cr = cap.getBoundingClientRect(), i = c.querySelector('img').getBoundingClientRect();
    const r = { width: o.width, top: o.top + c.clientTop, bottom: o.top + c.clientTop + c.clientHeight, height: c.clientHeight };   // inside its fine edge
    return { h: Math.round(r.height), w: Math.round(r.width), inside: cr.top >= r.top - 1 && cr.bottom <= r.bottom + 1, whole: cap.scrollHeight <= cap.clientHeight + 1,
      fills: Math.abs(i.height - r.height) < 1 && Math.abs(i.top - r.top) < 1, nextTop: Math.round(c.nextElementSibling.getBoundingClientRect().top - o.bottom) };
  });
  await shot((await p.$('#c-p1 .cover')), 'long-note.png');
  check('a long description: the picture taller to hold it all, none of it cut, the picture still filling it', tall.h > tall.w * 9 / 16 + 20 && tall.inside && tall.whole && tall.fills && tall.nextTop >= 0, tall);
  data.categories[0].note = shortNote;
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('...and it all fits the phone', wide === 0, wide);
  await p.setViewport({ width: 820, height: 1000, deviceScaleFactor: 1 });
  await sleep(300);
  const wideScreen = await p.$eval('#c-p1 .cover', c => ({ w: Math.round(c.getBoundingClientRect().width), r: getComputedStyle(c).borderTopLeftRadius,
    over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  check('a wide screen (a tablet): the menu\'s column with room around it, the category\'s picture in it, rounded', wideScreen.w === 608 && wideScreen.r === '26px' && wideScreen.over === 0, wideScreen);
  await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  console.log('\nThe room, in the colours of the song on the TV');
  // The TV's own way of working out its frame's colours from a song's (tv.js), to hold the menu's against
  const tvJs = fs.readFileSync(ASSETS + '/tv/tv.js', 'utf8');
  const fn = name => { const i = tvJs.indexOf('function ' + name + '('); let depth = 0;
    for (let k = tvJs.indexOf('{', i); k < tvJs.length; k++) { if (tvJs[k] === '{') depth++; else if (tvJs[k] === '}' && --depth === 0) return tvJs.slice(i, k + 1); } };
  const frameColours = new Function(fn('hslRgb') + fn('frameColours') + '; return frameColours;')();
  const css = c => c.map(Math.round).join(', ');
  const room = pg => pg.evaluate(() => {
    const h = document.documentElement, on = h.classList.contains('room-b') ? 'b' : 'a';
    return { tint: h.getAttribute('data-tint'), on, paint: getComputedStyle(document.querySelector('.room .' + on)).backgroundImage,
      fade: getComputedStyle(document.querySelector('.room .b')).transitionDuration, theme: document.querySelector('meta[name=theme-color]').content,
      top: h.style.getPropertyValue('--room-top') };
  });
  data = { v: 4, name: 'کافتریا و ڕێستورانتی توایڵایت', word: '', numerals: 'auto', categories: [
    { id: 'k1', name: { ku: 'نێرگلە' }, items: [item({ ku: 'سێو' }, 10000)], subs: [] }] };
  now = {};
  const watch = await b.newPage();
  watch.on('pageerror', e => errors.push(String(e)));
  await watch.evaluateOnNewDocument(() => {            // how long the menu waits before asking again
    const later = window.setTimeout;
    window.waits = [];
    window.setTimeout = function (f, ms) { window.waits.push(ms); return later.apply(this, arguments); };
  });
  await watch.setViewport({ width: 360, height: 740, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  nowAsks = 0;
  await watch.goto(url, { waitUntil: 'networkidle0' });
  const quiet = await room(watch);
  check('no song on the TV: the TV\'s night blue, a little gold light from the top', nowAsks >= 1 && quiet.tint === null && quiet.on === 'a'
    && /rgba\(232, 182, 104, 0\.1\).*rgb\(22, 27, 73\).*rgb\(9, 12, 39\)/.test(quiet.paint), quiet);
  check('...asked again every 8 seconds while the menu is on screen', (await watch.evaluate(() => window.waits)).includes(8000), await watch.evaluate(() => window.waits));
  now = { tint: [210, 0.8] };
  await watch.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));    // (as when the phone's screen comes back on: asked at once)
  await sleep(300);
  const blue = await room(watch), c1 = frameColours([210, 0.8]);
  const glowIn = (paint, c) => { const m = new RegExp('rgba\\(' + css(c.glow).replace(/, /g, ', ') + ', ([\\d.]+)\\)').exec(paint); return !!m && Math.abs(Number(m[1]) - c.alpha) < 0.004; };
  check('a song: the room in its colours, worked out as the TV works out its frame\'s (the same light, the same dark)', blue.tint === '210 0.8' && blue.on === 'b'
    && blue.paint.includes('rgb(' + css(c1.top) + ')') && blue.paint.includes('rgb(' + css(c1.end) + ')') && glowIn(blue.paint, c1), [blue, c1]);
  check('...fading in over the old ones in 1.6 seconds, as on the TV; the phone\'s bar and the glass of an opened item in them too', blue.fade === '1.6s'
    && blue.top === 'rgb(' + css(c1.top) + ')' && blue.theme !== quiet.theme && /^rgb\(/.test(blue.theme), blue);
  now = { tint: [20, 0.3] };
  await watch.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(300);
  const next = await room(watch), c2 = frameColours([20, 0.3]);
  check('the next song: its colours on the other layer, fading in (or the other out)', next.tint === '20 0.3' && next.on === 'a' && next.paint.includes('rgb(' + css(c2.top) + ')'), next);
  now = 'broken';
  await watch.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(300);
  check('the TV answering nonsense: the colours stay as they were, no errors', (await room(watch)).tint === '20 0.3');
  now = { tint: ['red', null] };
  await watch.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(300);
  const none = await room(watch);
  check('...a colour that isn\'t one, or the song gone: back to the night blue', none.tint === '' && /rgb\(22, 27, 73\)/.test(none.paint), none);
  await watch.close();
  now = {};

  console.log('\nNames in two languages');
  data = { v: 5, name: 'Twilight', word: 'مینیو', numerals: 'latin', categories: [
    { id: 'b1', name: { ku: 'خواردنەوە', en: 'Drinks' }, items: [item({ ku: 'چای', en: 'Tea' }, 1000), item({ ku: 'پیپسی', en: 'پیپسی' }, 750), item({ en: 'Cola' }, 750),
      item({ ku: 'شیر', ar: 'حليب' }, 1500)], subs: [] }] };
  await p.evaluate(() => { try { localStorage.setItem('twilight-menu-lang', 'ku'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle0' });
  const alts = () => p.$$eval('main .row', l => l.map(r => { const a = r.querySelector('.alt'); return a ? a.textContent + '|' + a.lang : ''; }));
  check('Kurdish: each name with its English under it; the Arabic when there\'s no English; none when it\'s the same words, or there\'s no other',
    JSON.stringify(await alts()) === JSON.stringify(['Tea|en', '', '', 'حليب|ar']), await alts());
  const side = await p.$eval('main .row .alt', a => { const r = document.createRange(); r.selectNodeContents(a);
    return [getComputedStyle(a).textAlign, Math.abs(r.getBoundingClientRect().right - a.closest('.txt').querySelector('.nm').getBoundingClientRect().right) < 1]; });
  check('...the English on the right too, under the Kurdish name, though it reads left to right', side[0] === 'right' && side[1], side);
  check('...and the category\'s name: "Drinks" under it, in gold', await p.$eval('#c-b1 .title .alt', a => a.textContent + '|' + a.lang) === 'Drinks|en');
  check('...the word for the menu between two gold lines', await p.$eval('#word', w => w.textContent + '|' + getComputedStyle(w, '::before').height + '|' + getComputedStyle(w, '::after').height) === 'مینیو|1px|1px');
  await p.evaluate(() => [...document.querySelectorAll('#langs button')].find(b => b.textContent === 'English').click());
  await sleep(200);
  check('English: the Kurdish under the English (the Arabic when the name is only in Kurdish)', JSON.stringify(await alts()) === JSON.stringify(['چای|ckb', '', '', 'حليب|ar'])
    && await p.$eval('#word', w => w.textContent) === 'Menu', await alts());
  await p.evaluate(() => [...document.querySelectorAll('#langs button')].find(b => b.textContent === 'العربية').click());
  await sleep(200);
  check('Arabic: the English under it (the Kurdish when there\'s no English)', JSON.stringify(await alts()) === JSON.stringify(['Tea|en', '', '', 'شیر|ckb']), await alts());
  await p.click('#c-b1 .items li:nth-child(1) .row').catch(() => {});
  check('(a line with nothing more to see doesn\'t open)', await p.$eval('#sheet', e => e.hidden));
  await p.evaluate(() => { try { localStorage.setItem('twilight-menu-lang', 'en'); } catch (e) {} });

  console.log('\nEach list as fits what\'s in it');
  data = { v: 5, name: 'Twilight', word: '', numerals: 'latin', categories: [
    { id: 'm1', name: { ku: 'نێرگلە', en: 'Hookah' }, items: [item({ ku: 'سێو', en: 'Apple' }, 10000), item({ ku: 'نەعنا', en: 'Mint' }, 10000), item({ ku: 'ترێ', en: 'Grape' }, 10000),
        item({ ku: 'لیمۆ', en: 'Lemon' }, 10000)],
      subs: [{ id: 'm2', name: { ku: 'گەرم', en: 'Hot' }, items: [withNote(item({ ku: 'چای', en: 'Tea' }, 1000), null, 'teapic'), withNote(item({ ku: 'قاوە', en: 'Coffee' }, 2500), { en: 'Strong' }, 'coffeepic'),
        item({ ku: 'شیر', en: 'Milk' }, 1500)] }] },
    { id: 'm3', name: { en: 'Extras' }, items: [item({ en: 'Ice' }), item({ en: 'Lemon slice' }), item({ en: 'Straw' })], subs: [] },
    { id: 'm4', name: { en: 'Nuts' }, items: [item({ en: 'Almonds' }, 3000), item({ en: 'Pistachio' }, 3000), withNote(item({ en: 'Cashew' }, 3000), { en: 'Salted' })], subs: [] }] };
  await p.evaluate(() => { try { localStorage.setItem('twilight-menu-lang', 'en'); } catch (e) {} });
  await p.reload({ waitUntil: 'networkidle0' });
  const kinds = await p.$$eval('main section', l => l.map(s => [...s.children].filter(c => /^(items|tiles|flavors)$/.test(c.className)).map(c => c.className).join('+')));
  check('names alone at one price (flavours): the price once, the names together; with no price, the names alone; one with a description: a line each',
    JSON.stringify(kinds) === JSON.stringify(['flavors+tiles', 'flavors', 'items']), kinds);
  const flav = await p.$eval('#c-m1 .flavors', f => [f.querySelectorAll('.pr').length, f.querySelector('.pr').textContent, [...f.querySelectorAll('.tags li')].map(t => t.firstChild.textContent).join(),
    [...f.querySelectorAll('.tags li .alt')].map(t => t.textContent).join()]);
  check('...the flavours: "10,000IQD" once, then Apple, Mint, Grape, Lemon, each with its Kurdish name under it',
    JSON.stringify(flav) === JSON.stringify([1, '10,000IQD', 'Apple,Mint,Grape,Lemon', 'سێو,نەعنا,ترێ,لیمۆ']), flav);
  check('...the extras: no price at all', await p.$eval('#c-m3 .flavors', f => !f.querySelector('.pr') && f.querySelectorAll('.tags li').length === 3));
  const tl = await p.$$eval('#c-m1 .tiles .tile', l => l.map(t => [t.tagName, !!t.querySelector('img'), (t.querySelector('.ini') || {}).textContent || '', t.querySelector('.nm').textContent, (t.querySelector('.pr') || {}).textContent]));
  check('two of three with a picture: their pictures big, two to a row; the one without, its first letter; each opens if there\'s more to see',
    JSON.stringify(tl) === JSON.stringify([['BUTTON', true, '', 'Tea', '1,000IQD'], ['BUTTON', true, '', 'Coffee', '2,500IQD'], ['DIV', false, 'M', 'Milk', '1,500IQD']]) &&
    await p.$eval('#c-m1 .tiles', g => getComputedStyle(g).gridTemplateColumns.split(' ').length === 2), tl);
  await shot(p, 'customer-layouts.png', { fullPage: true });
  await p.click('#c-m1 .tiles .tile');
  await sleep(400);
  const sheet = await p.evaluate(() => ({ open: !document.getElementById('sheet').hidden, path: document.querySelector('#sheet .path').textContent, name: document.querySelector('#sheet h2').textContent,
    focus: document.activeElement === document.querySelector('#sheet .card'), state: history.state && history.state.item }));
  check('an item opened: where it is on the menu over its name ("Hookah › Hot"), the sheet itself focused', sheet.open && sheet.path === 'Hookah › Hot' && sheet.name === 'Tea' && sheet.focus && sheet.state, sheet);
  await p.evaluate(() => history.back());
  await sleep(400);
  check('...the phone\'s Back button closes it, and the menu stays', await p.$eval('#sheet', e => e.hidden) && p.url().includes('/menu/') && !(await p.evaluate(() => history.state && history.state.item)));
  await p.click('#c-m1 .tiles .tile:nth-child(1)').catch(() => {});
  await p.evaluate(() => document.querySelectorAll('#c-m1 .tiles .tile')[1].click());
  await sleep(400);
  const card = await p.$eval('#sheet .card', c => { const r = c.getBoundingClientRect(); return [r.left + r.width / 2, r.top + 30]; });
  await p.touchscreen.touchStart(card[0], card[1]);
  for (let y = 20; y <= 220; y += 40) { await p.touchscreen.touchMove(card[0], card[1] + y); await sleep(16); }
  await p.touchscreen.touchEnd();
  await sleep(500);
  check('...pulled down from its top, it goes', await p.$eval('#sheet', e => e.hidden) && !(await p.evaluate(() => history.state && history.state.item)));

  console.log('\n3D, and on the table (AR)');
  const BASE = 'https://raw.githubusercontent.com/test/twilight/main/models/';
  const with3d = (it, model, pic, note) => Object.assign(it, { model }, pic ? { picture: pic } : {}, note ? { note } : {});
  data = { v: 6, name: 'Twilight', word: '', numerals: 'latin', models: BASE, categories: [
    { id: 'd1', name: { en: 'Desserts', ku: 'شیرینی' }, items: [with3d(item({ en: 'Kunafa', ku: 'کونافە' }, 5000), 'kunafa.glb', 'kunafapic', { en: 'Warm, with pistachio' }),
      with3d(item({ en: 'Cake' }, 3500), 'cake slice.glb'), item({ en: 'Baklava' }, 4000)], subs: [] },
    { id: 'd2', name: { en: 'Plates' }, items: [with3d(item({ en: 'Kebab' }, 9000), 'kebab.glb', 'kebabpic'), withNote(item({ en: 'Dolma' }, 8000), null, 'dolmapic'),
      item({ en: 'Rice' }, 2000)], subs: [] }] };
  const q = await b.newPage();
  q.on('pageerror', e => errors.push('3d: ' + e));
  await q.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36');
  await q.evaluateOnNewDocument(() => {
    try { localStorage.setItem('twilight-menu-lang', 'en'); } catch (e) {}
    // model-viewer, stood in for: what the menu makes of it, and its events when the test says
    window.made = [];
    customElements.define('model-viewer', class extends HTMLElement {
      connectedCallback() { window.made.push(this); }
    });
  });
  await q.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await q.goto(url, { waitUntil: 'networkidle0' });
  const lines = await q.$$eval('#c-d1 .items li', l => l.map(li => { const t = li.querySelector('button.thumb'), r = li.querySelector('.row');
    return [li.className, t ? t.className + ':' + !!t.querySelector('img') + ':' + t.textContent : '', r.tagName]; }));
  check('an item with a 3D model: its picture beside it opens it in 3D, with "AR" on it (this phone can put it on the table)',
    JSON.stringify(lines[0]) === JSON.stringify(['has3d', 'thumb:true:AR', 'BUTTON']), lines);
  check('...one with no picture: a gold cube in its place; it opens (to its 3D) though there\'s nothing else to see',
    JSON.stringify(lines[1]) === JSON.stringify(['has3d', 'thumb bare:false:AR', 'BUTTON']) && JSON.stringify(lines[2]) === JSON.stringify(['', '', 'DIV']), lines);
  const tileChip = await q.$eval('#c-d2 .tiles li', li => { const c = li.querySelector('.see3d'), ph = li.querySelector('.ph').getBoundingClientRect(), r = c.getBoundingClientRect();
    return [c.textContent, c.getAttribute('aria-label'), r.top >= ph.top && r.right <= ph.right + 1 && r.right > ph.right - 30 && r.bottom < ph.top + 50]; });
  check('...in a list of pictures: the chip on the picture\'s top corner, a button of its own', JSON.stringify(tileChip) === JSON.stringify(['AR', 'Kebab, AR', true]), tileChip);
  check('nothing fetched for 3D until someone opens one', (await q.evaluate(() => window.made.length)) === 0
    && !(await q.evaluate(() => [...document.scripts].some(s => /model-viewer/.test(s.src)))));
  await q.click('#c-d1 .items li:nth-child(1) .thumb');
  await sleep(300);
  const v = await q.evaluate(() => { const mv = window.made[0], a = k => mv && mv.getAttribute(k);
    return { open: !document.getElementById('view3d').hidden, name: document.getElementById('v3Name').textContent, focus: document.activeElement.id,
      state: history.state && history.state.v3, menuHidden: getComputedStyle(document.querySelector('main')).visibility, inStage: mv && mv.parentNode.id,
      src: a('src'), ar: a('ar'), modes: a('ar-modes'), controls: a('camera-controls'), turn: a('auto-rotate'), alt: a('alt'),
      button: mv && [...mv.children].filter(c => c.slot === 'ar-button').map(c => c.textContent).join(), line: mv && mv.querySelectorAll('[slot=progress-bar]').length,
      wait: !document.getElementById('v3Wait').hidden };
  });
  check('tapped: the item in 3D over the whole menu, its name at the top, × ready (focused), Back to close it', v.open && v.name === 'Kunafa' && v.focus === 'v3Close' && v.state
    && v.menuHidden === 'hidden', v);
  check('...its model from the models folder on GitHub (https, as AR needs), turned with a finger, turning by itself', v.inStage === 'v3Stage' && v.src === BASE + 'kunafa.glb'
    && v.controls === '' && v.turn === '' && v.alt === 'Kunafa', v);
  check('...on the table with the gold AR button (model-viewer shows it where the phone can): Android\'s Scene Viewer, the iPhone\'s Quick Look, or WebXR',
    v.ar === '' && v.modes === 'webxr scene-viewer quick-look' && v.button === 'AR' && v.line === 1 && v.wait, v);
  await q.evaluate(() => window.made[0].dispatchEvent(new CustomEvent('progress', { detail: { totalProgress: 0.4 } })));
  const half = await q.evaluate(() => [!document.getElementById('v3Bar').hidden, document.getElementById('v3Fill').style.transform]);
  await q.evaluate(() => window.made[0].dispatchEvent(new CustomEvent('progress', { detail: { totalProgress: 1 } })));
  await q.evaluate(() => window.made[0].dispatchEvent(new CustomEvent('load')));
  const loaded = await q.evaluate(() => [document.getElementById('v3Bar').hidden, document.getElementById('v3Wait').hidden]);
  check('...a gold line as it comes (40%), gone when it\'s there', half[0] && half[1] === 'scaleX(0.4)' && loaded[0] && loaded[1], [half, loaded]);
  await shot(q, 'customer-3d.png');
  await q.evaluate(() => history.back());
  await sleep(300);
  const shut3 = await q.evaluate(() => [document.getElementById('view3d').hidden, !document.querySelector('model-viewer'), document.activeElement.classList.contains('thumb'),
    getComputedStyle(document.querySelector('main')).visibility, document.body.style.overflow]);
  check('Back: closed, the model gone (and the memory it took), back where it was opened', JSON.stringify(shut3) === JSON.stringify([true, true, true, 'visible', '']), shut3);
  await q.click('#c-d1 .items li:nth-child(1) .row');
  await sleep(400);
  const card3 = await q.evaluate(() => { const c = document.querySelector('#sheet .card'), g = c.querySelector('.go3d');
    return [c.querySelector('h2').textContent, c.querySelector('.body > .alt').textContent, c.querySelector('.act .pr').textContent, g && g.textContent]; });
  check('the item opened: its name and the same in Kurdish, its price, and the gold AR button', JSON.stringify(card3) === JSON.stringify(['Kunafa', 'کونافە', '5,000IQD', 'AR']), card3);
  await shot(q, 'customer-sheet-3d.png');
  await q.click('#sheet .go3d');
  await sleep(300);
  check('...the button: it in 3D', !(await q.$eval('#view3d', e => e.hidden)) && (await q.evaluate(() => window.made.length)) === 2);
  await q.evaluate(() => history.back());
  await sleep(300);
  check('...Back: the item again, as it was', await q.$eval('#view3d', e => e.hidden) && !(await q.$eval('#sheet', e => e.hidden)) && await q.evaluate(() => history.state && history.state.item)
    && await q.evaluate(() => document.activeElement.classList.contains('go3d')));
  await q.evaluate(() => history.back());
  await sleep(300);
  check('...Back again: the menu', await q.$eval('#sheet', e => e.hidden) && !(await q.evaluate(() => history.state && (history.state.item || history.state.v3))));
  await q.click('#c-d1 .items li:nth-child(2) .thumb');
  await sleep(300);
  check('the one with a space in its file\'s name: asked for as it should be', await q.evaluate(() => window.made[2].getAttribute('src')) === BASE + 'cake%20slice.glb');
  await q.evaluate(() => window.made[2].dispatchEvent(new CustomEvent('error', { detail: { type: 'loadfailure' } })));
  const failed = await q.evaluate(() => [!document.getElementById('v3Fail').hidden, document.getElementById('v3Wait').hidden, !document.querySelector('model-viewer')]);
  check('...it can\'t be had (no internet, or no such file): a cloud crossed out, and try again', JSON.stringify(failed) === JSON.stringify([true, true, true]), failed);
  await q.click('#v3Again');
  await sleep(200);
  check('...tried again: asked for again', (await q.evaluate(() => window.made.length)) === 4 && await q.$eval('#v3Fail', e => e.hidden));
  await q.keyboard.press('Escape');
  await sleep(200);
  check('Escape closes it', await q.$eval('#view3d', e => e.hidden) && !(await q.$('model-viewer')));
  data.models = undefined;
  await q.reload({ waitUntil: 'networkidle0' });
  check('a menu not saying where the models are: no 3D, the items as any other', (await q.$$('.thumb, .see3d')).length === 0
    && await q.$eval('#c-d1 .items li:nth-child(2) .row', r => r.tagName) === 'DIV');
  data.models = BASE;
  await q.close();

  // The real model-viewer, from the internet: here none can be had (blocked, as with no internet)
  const r3 = await b.newPage();
  r3.on('pageerror', e => errors.push('3d cdn: ' + e));
  await r3.evaluateOnNewDocument(() => {
    window.scriptsAdded = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.tagName === 'SCRIPT' && /model-viewer/.test(n.src)) window.scriptsAdded.push([n.src, n.integrity, n.crossOrigin]);
    }))).observe(document, { childList: true, subtree: true });
  });
  await r3.setRequestInterception(true);
  const asked = [];
  r3.on('request', rq => { if (/^https:/.test(rq.url())) { asked.push(rq.url()); return rq.abort(); } rq.continue(); });
  await r3.setViewport({ width: 360, height: 740, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await r3.goto(url, { waitUntil: 'networkidle0' });
  check('a computer (no AR): "3D" on the chip instead', await r3.$eval('#c-d1 .thumb', t => t.textContent) === '3D');
  await r3.click('#c-d1 .items li:nth-child(1) .thumb');
  await r3.waitForFunction(() => !document.getElementById('v3Fail').hidden, { timeout: 8000 }).catch(() => {});
  const tried = await r3.evaluate(() => window.scriptsAdded);
  const sri = 'sha384-ARSuDHSQ5fZ1NNy5gpJdKkZxWqBGo3wUNMrQhzFGak5E+q6dfuTSoxRcEaQh5P3o';
  check('model-viewer 4.3.1 fetched from jsDelivr, then unpkg when that fails, each checked against its fingerprint (integrity) before it runs',
    JSON.stringify(tried) === JSON.stringify([['https://cdn.jsdelivr.net/npm/@google/model-viewer@4.3.1/dist/model-viewer-umd.min.js', sri, 'anonymous'],
      ['https://unpkg.com/@google/model-viewer@4.3.1/dist/model-viewer-umd.min.js', sri, 'anonymous']]), [tried, asked]);
  check('...neither: the cloud crossed out, and try again', await r3.$eval('#v3Fail', e => !e.hidden) && await r3.$eval('#v3Wait', e => e.hidden));
  await r3.click('#v3Again');
  await sleep(500);
  check('...tried again: both again', (await r3.evaluate(() => window.scriptsAdded.length)) === 4, await r3.evaluate(() => window.scriptsAdded.length));
  await r3.close();

  check('no script errors', errors.length === 0, errors);
  await b.close();
  server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
