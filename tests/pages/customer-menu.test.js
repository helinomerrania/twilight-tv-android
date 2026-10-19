// The customers' menu page's odd cases, in Chromium at phone size: one language, the café's digits,
// the TV not answering, an empty menu, a name in one language only
const { ASSETS, FIXTURES, launch, shot } = require('./lib/common');
const http = require('http'), fs = require('fs');
let data = null, fail = 0, asks = 0;
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
  for (let i = 0; i < 9; i++) data.categories[1].items.push(item({ en: 'Tea ' + i }, 1000));
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
    const r = c.getBoundingClientRect(), cr = cap.getBoundingClientRect(), i = c.querySelector('img').getBoundingClientRect();
    return { first: c.className, name: h.textContent, h2s: s.querySelectorAll('h2').length, shape: Math.round(r.width / r.height * 100) / 100,
      atBottom: Math.abs(cr.bottom - r.bottom) < 1, nameFirst: cap.firstElementChild === h && h.nextElementSibling === n, fills: Math.abs(i.height - r.height) < 1,
      fade: getComputedStyle(cap).backgroundImage.startsWith('linear-gradient'), note: n && n.textContent, after: c.nextElementSibling.tagName,
      edge: Math.round(r.left) === 0 && Math.round(r.width) === document.documentElement.clientWidth && getComputedStyle(c).borderTopLeftRadius === '0px' };
  });
  check('a category with a picture: its name and description on it, along the bottom, over a dark fade; nothing above it', cover.first === 'cover' && cover.name === 'Hookah'
    && cover.h2s === 1 && cover.atBottom && cover.fade && cover.fills && Math.abs(cover.shape - 16 / 9) < 0.03, cover);
  check('...the picture the phone\'s whole width, square-cornered, as a chapter opens', cover.edge, cover);
  check('...the description under the name, on the picture too (nothing between the picture and the items)', cover.nameFirst && cover.note === 'Sweet smoke' && cover.after === 'UL', cover);
  const subs = await p.$$eval('#c-p1 h3', l => l.map(h => [h.querySelector('.own').textContent, (h.querySelector('.from') || {}).textContent, h.closest('.cover') ? h.closest('.cover').className : '',
    getComputedStyle(h, '::after').display, h.nextElementSibling && h.nextElementSibling.classList.contains('note') ? h.nextElementSibling.textContent : '']));
  check('a subcategory with a picture: its name and description on it too, after its category\'s name; one without: its name as before, with the line beside it',
    JSON.stringify(subs) === JSON.stringify([['Hot', 'Hookah', 'cover sub', 'none', 'Warm cups'], ['Cold', 'Hookah', '', 'block', '']]), subs);
  const strip = await p.$eval('#c-p1 .cover.sub', c => {
    const r = c.getBoundingClientRect(), main = document.querySelector('main .items .row').getBoundingClientRect(), h = c.querySelector('h3');
    const at = k => h.querySelector(k).getBoundingClientRect();
    return { shape: Math.round(r.width / r.height * 100) / 100, inset: Math.abs(r.left - main.left) < 1 && Math.abs(r.right - main.right) < 1, round: getComputedStyle(c).borderTopLeftRadius,
      order: at('.from').right <= at('.sep').left + 1 && at('.sep').right <= at('.own').left + 1, sep: h.querySelector('.sep').textContent, hidden: h.querySelector('.sep').getAttribute('aria-hidden') };
  });
  check('...its picture a shorter strip (2:1), rounded, inside the margins like the items', Math.abs(strip.shape - 2) < 0.03 && strip.inset && strip.round === '16px', strip);
  check('...English: "Hookah › Hot", left to right (the › not read out)', strip.order && strip.sep === '›' && strip.hidden === 'true', strip);
  check('a category without a picture: its name as before, then its description', await p.$eval('#c-p2', s => s.firstElementChild.tagName + '|' + s.firstElementChild.textContent
    + '|' + s.firstElementChild.nextElementSibling.textContent) === 'H2|Nuts|Crunchy');
  const list = await p.$$eval('#c-p1 > .items .row', l => l.map(r => [r.tagName, r.className, r.textContent]));
  check('the list: names and prices only, no descriptions', list.every(r => !/Red apples|Dark grapes/.test(r[2])) && await p.$$eval('main .items .note', l => l.length) === 0, list);
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
  check('Kurdish: the names on the pictures in Kurdish, right to left', JSON.stringify(await p.$$eval('.cap > h2, .cap > h3 .own', l => l.map(h => h.textContent + '|' + getComputedStyle(h).direction)))
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
    const r = c.getBoundingClientRect(), cap = c.querySelector('.cap'), cr = cap.getBoundingClientRect(), i = c.querySelector('img').getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), inside: cr.top >= r.top - 1 && cr.bottom <= r.bottom + 1, whole: cap.scrollHeight <= cap.clientHeight + 1,
      fills: Math.abs(i.height - r.height) < 1 && Math.abs(i.top - r.top) < 1, nextTop: Math.round(c.nextElementSibling.getBoundingClientRect().top - r.bottom) };
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
  check('a wide screen (a tablet): the menu\'s column with room around it, so the category\'s picture rounded there', wideScreen.w === 640 && wideScreen.r === '18px' && wideScreen.over === 0, wideScreen);
  await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  check('no script errors', errors.length === 0, errors);
  await b.close();
  server.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
