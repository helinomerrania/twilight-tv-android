// The phone page's Menu tab and the customers' menu page, in Chromium at phone size, against the app's
// real server and menu store (PageTestServer), from an empty menu to one with items, pictures and languages
const { FIXTURES, launch, shot, testServer } = require('./lib/common');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-'));
const PHOTO = FIXTURES + '/sample-photo.jpg';

let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function jpegSize(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xC2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return null;
}
function get(port, p) {
  return new Promise((ok, no) => http.get({ host: '127.0.0.1', port, path: p }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => ok([r.statusCode, b])); }).on('error', no));
}
function post(port, p, body) {
  return new Promise((ok, no) => {
    const q = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: { 'Content-Type': 'application/json' } }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => ok([r.statusCode, b]));
    });
    q.on('error', no); q.end(body);
  });
}

(async () => {
  const java = testServer(DATA);
  const [port, menuPort] = await new Promise(ok => java.stdout.on('data', d => { const m = /port (\d+) menu (\d+)/.exec(String(d)); if (m) ok([Number(m[1]), Number(m[2])]); }));
  const base = 'http://127.0.0.1:' + port;
  const b = await launch();
  const page = await b.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto(base + '/', { waitUntil: 'networkidle0' });
  await page.type('#pinInput', '4821');
  await page.click('#pin button[type=submit]');
  await sleep(500);
  const text = sel => page.$eval(sel, e => e.textContent);
  const cats = () => page.$$eval('#menuList .mcat > .mhead .t b', l => l.map(e => e.childNodes[0].textContent));
  const items = n => page.$$eval('#menuList .mcat', (l, n) => [...l[n].querySelectorAll('.mitem')].map(i => [i.querySelector('.t b').childNodes[0].textContent,
    i.querySelector('.price').textContent, !!i.querySelector('.tag'), !!i.querySelector('img')]), n);

  console.log('\nThe Menu tab');
  await page.click('#tabMenu');
  await sleep(500);
  check('the Menu tab, between Screen and Settings', (await page.$$eval('.tabs button', l => l.map(b => b.textContent.trim()))).join() === 'Now,Songs,Screen,Menu,Settings'
    && await page.$eval('#tabMenu', b => b.getAttribute('aria-selected')) === 'true' && await page.$eval('#savebar', e => e.hidden));
  check('to start with: the café\'s categories, nothing in them; no menu code yet', (await cats()).join() === 'Hookah Flavors,Drink,Ice Cream,Nuts,Others'
    && (await text('#menuInfo')).includes('Nothing on the menu yet') && (await text('#menuInfo')).includes('The menu code appears on the TV with the first one'),
    [await cats(), await text('#menuInfo')]);
  const drinkSubs = await page.$$eval('#menuList .mcat', l => [...l[1].querySelectorAll('.msub .mhead .t b')].map(e => e.textContent));
  check('Drink: Energy, Fresh, Hot, Milkshake, Soft Drinks', drinkSubs.join() === 'Energy,Fresh,Hot,Milkshake,Soft Drinks', drinkSubs);

  console.log('\nAdding an item');
  await page.evaluate(() => [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.madd')].find(b => b.textContent === '+ Add an item').click());
  await sleep(200);
  check('the editor: "New item", in Hookah Flavors', !(await page.$eval('#editor', e => e.hidden)) && (await text('#edTitle')) === 'New item'
    && (await text('#editor form')).includes('In Hookah Flavors'));
  check('...the Kurdish name ready to type, right to left; Arabic too; English left to right',
    await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-name') === 'ku') &&
    (await page.$$eval('#editor [data-name]', l => l.map(i => i.getAttribute('data-name') + ':' + i.dir))).join() === 'ku:rtl,ar:rtl,en:ltr');
  await page.click('#edSave');
  await sleep(150);
  check('no name: not saved, says why', (await text('#edErr')) === 'Give it a name, in at least one language.' && !(await page.$eval('#editor', e => e.hidden)));
  await page.type('#editor [data-name=ku]', 'سێوی دووانە');
  await page.type('#editor [data-name=en]', 'Double Apple');
  await page.type('#edPrice', '١٠٬٠٠٠');
  check('a price typed in Kurdish digits: "Customers see 10,000 IQD"', (await text("#editor .field:nth-of-type(2) .hint")) === "Customers see 10,000 IQD.",
    await text('#editor .field:nth-of-type(2) .hint'));
  const file = await page.$('#editor input[type=file]');
  await file.uploadFile(PHOTO);
  await page.waitForFunction(() => /Picture ready/.test(document.getElementById('edPicMsg').textContent), { timeout: 15000 });
  check('a picture from the phone: sent to the TV at once, shown in the editor', await page.$eval('#edPic', i => !i.hidden && i.naturalWidth > 0));
  const files = fs.readdirSync(DATA + '/pics');
  const full = files.find(f => /^[a-z0-9]+\.jpg$/.test(f)), small = files.find(f => /\.small\.jpg$/.test(f));
  const fs1 = jpegSize(fs.readFileSync(DATA + '/pics/' + full)), fs2 = jpegSize(fs.readFileSync(DATA + '/pics/' + small)), orig = jpegSize(fs.readFileSync(PHOTO));
  check('...made smaller on the phone first: at most 1200 pixels, and a copy of at most 360 for the lists, same shape',
    Math.max(...fs1) <= 1200 && Math.max(...fs2) <= 360 && Math.abs(fs1[0] / fs1[1] - orig[0] / orig[1]) < 0.02, [fs1, fs2, orig]);
  await page.click('#edSave');
  await sleep(500);
  check('added: the editor closes, a note says so', await page.$eval('#editor', e => e.hidden) && (await text('#say')) === 'Added: سێوی دووانە', await text('#say'));
  check('...in the list with its picture and price', JSON.stringify(await items(0)) === JSON.stringify([['سێوی دووانە', '10,000', false, true]]), await items(0));
  check('...and on the menu for customers, so the code is on the TV', (await text('#menuInfo')).includes('1 item on the menu for customers')
    && (await text('#menuInfo')).includes('The menu code is on the TV'), await text('#menuInfo'));
  const custUrl = await page.$eval('#menuInfo a', a => a.getAttribute('href'));
  check('..."See it as customers do" opens it where customers do: its own port, not the phone page\'s', custUrl === 'http://127.0.0.1:' + menuPort + '/menu/' && menuPort !== port, custUrl);
  const saved = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]);
  const apple = saved.categories[0].items[0];
  check('kept on the TV: names, price 10000, the picture', apple.name.ku === 'سێوی دووانە' && apple.name.en === 'Double Apple' && !apple.name.ar && apple.price === 10000
    && apple.picture === full.slice(0, -4), apple);

  for (const [ku, en, price] of [['نەعنا', 'Mint', '10000'], ['ترێ', 'Grape', '10,000']]) {
    await page.evaluate(() => [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.madd')].find(b => b.textContent === '+ Add an item').click());
    await sleep(150);
    await page.type('#editor [data-name=ku]', ku);
    await page.type('#editor [data-name=en]', en);
    await page.type('#edPrice', price);
    await page.click('#edSave');
    await sleep(450);
  }
  check('two more: in the order added', (await items(0)).map(i => i[0]).join() === 'سێوی دووانە,نەعنا,ترێ', await items(0));

  console.log('\nChanging an item');
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.mitem')[2].click());
  await sleep(200);
  check('tapping it opens it, as it is', (await text('#edTitle')) === 'Change item' && await page.$eval('#editor [data-name=ku]', i => i.value) === 'ترێ'
    && await page.$eval('#edPrice', i => i.value) === '10,000' && await page.$eval('#edShown', c => c.checked));
  await page.$eval('#edPrice', i => { i.value = ''; });
  await page.type('#edPrice', '12000');
  await page.click('#edShown');
  await page.select('#edPlace', '0');
  await page.click('#edSave');
  await sleep(450);
  check('a new price, hidden, moved to the top', JSON.stringify((await items(0))[0]) === JSON.stringify(['ترێ', '12,000', true, false]), await items(0));
  const cu = JSON.parse((await get(port, '/menu/data'))[1]);
  check('...customers don\'t see it; the other two in their order', cu.categories.length === 1 && cu.categories[0].items.map(i => i.name.en).join() === 'Double Apple,Mint', cu);

  console.log('\nOn the TV between songs');
  const openApple = () => page.evaluate(() => [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.mitem')].find(b => /سێوی دووانە/.test(b.textContent)).click());
  const appleTag = () => page.evaluate(() => { const t = [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.mitem')].find(b => /سێوی دووانە/.test(b.textContent)).querySelector('.tag'); return t ? t.textContent : ''; });
  await openApple(); await sleep(200);
  check('an item\'s editor: "On the TV between songs", on to start with', await page.$eval('#edTv', c => c.checked) && (await text('#editor form')).includes('On the TV between songs'));
  await page.click('#edTv');
  await page.click('#edSave');
  await sleep(450);
  const offTv = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]).categories[0].items.find(i => i.name.ku === 'سێوی دووانە');
  check('...switched off: kept off the TV ("tv": false on the box), "not on the TV" beside it in the list', offTv.tv === false && (await appleTag()) === 'not on the TV', [offTv.tv, await appleTag()]);
  await openApple(); await sleep(200);
  check('...opened again: off, as saved', !(await page.$eval('#edTv', c => c.checked)));
  await page.click('#edTv');
  await page.click('#edSave');
  await sleep(450);
  const onTv = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]).categories[0].items.find(i => i.name.ku === 'سێوی دووانە');
  check('...on again: nothing about it kept (on is the usual), no mark', onTv.tv === undefined && (await appleTag()) === '', [onTv.tv, await appleTag()]);

  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.mitem')[1].click());
  await sleep(200);
  const ins = await page.$$eval('#edIn option', l => l.map(o => o.textContent));
  check('"In": every category and subcategory', ins.join('|') === 'Hookah Flavors|Drink|Drink › Energy|Drink › Fresh|Drink › Hot|Drink › Milkshake|Drink › Soft Drinks|Ice Cream|Nuts|Others', ins);
  const energy = await page.$$eval('#edIn option', l => l.find(o => o.textContent === 'Drink › Energy').value);
  await page.select('#edIn', energy);
  await page.click('#edSave');
  await sleep(450);
  const energyItems = await page.$$eval('#menuList .mcat', l => [...l[1].querySelectorAll('.msub')[0].querySelectorAll('.mitem .t b')].map(e => e.textContent));
  check('moved to Drink › Energy', energyItems.join() === 'سێوی دووانە' && (await items(0)).map(i => i[0]).join() === 'ترێ,نەعنا', [energyItems, await items(0)]);

  console.log('\nA 3D model for an item');
  const openMint = () => page.evaluate(() => [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.mitem')].find(b => /نەعنا/.test(b.textContent)).click());
  await openMint();
  await page.waitForFunction(() => /finger/.test((document.getElementById('edModelMsg') || {}).textContent || ''), { timeout: 8000 }).catch(() => {});
  const choices = await page.$$eval('#edModel option', l => l.map(o => o.value + '=' + o.textContent));
  check('the editor lists the .glb files in the models folder on GitHub (through the TV), with their sizes; None to start with',
    choices.join('|') === '=None|coffee-cup.glb=coffee-cup.glb (0.9 MB)|kunafa.glb=kunafa.glb (4.0 MB)' && await page.$eval('#edModel', s => s.value) === ''
    && /see it on their table \(AR\)/.test(await text('#edModelMsg')), [choices, await text('#edModelMsg')]);
  await page.select('#edModel', 'kunafa.glb');
  await page.click('#edSave');
  await sleep(450);
  const mint = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]).categories[0].items.find(i => i.name.ku === 'نەعنا');
  const mintTag = await page.evaluate(() => { const m = [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.mitem')].find(b => /نەعنا/.test(b.textContent));
    return [...m.querySelectorAll('.tag')].map(t => t.textContent).join(); });
  check('...chosen and saved: kept on the TV with the item, "3D" beside it in the list', mint.model === 'kunafa.glb' && mintTag === '3D', [mint.model, mintTag]);
  const forCustomers = JSON.parse((await get(menuPort, '/menu/data'))[1]);
  check('...customers get it, and where the models are (GitHub, https)', forCustomers.models === 'https://raw.githubusercontent.com/test/twilight/main/models/'
    && forCustomers.categories[0].items.find(i => i.name.ku === 'نەعنا').model === 'kunafa.glb', forCustomers.models);
  await openMint();
  await sleep(300);
  check('...opened again: chosen, as saved', await page.$eval('#edModel', s => s.value) === 'kunafa.glb');
  await page.keyboard.press('Escape');
  await sleep(100);
  const sneak = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]);
  sneak.categories[0].items.find(i => i.name.ku === 'نەعنا').model = '../settings.json';
  const sneaked = await post(port, '/api/menu?pin=4821', JSON.stringify({ base: sneak.v, menu: { categories: sneak.categories } }));
  const mint2 = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]).categories[0].items.find(i => i.name.ku === 'نەعنا');
  check('a model that isn\'t a .glb file\'s name (a path, say) isn\'t kept', sneaked[0] === 200 && mint2.model === undefined, mint2);
  const back = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]);
  back.categories[0].items.find(i => i.name.ku === 'نەعنا').model = 'kunafa.glb';
  await post(port, '/api/menu?pin=4821', JSON.stringify({ base: back.v, menu: { categories: back.categories } }));
  await page.evaluate(() => document.getElementById('tabMenu').click());
  await sleep(400);

  console.log('\nCategories and subcategories');
  await page.evaluate(() => [...document.querySelectorAll('#menuList .mcat')[2].querySelectorAll('.madd')].find(b => b.textContent === '+ Add a subcategory').click());
  await sleep(150);
  check('a new subcategory, in Ice Cream', (await text('#edTitle')) === 'New subcategory' && (await text('#editor form')).includes('In Ice Cream'));
  await page.type('#editor [data-name=en]', 'Cones');
  await page.click('#edSave');
  await sleep(450);
  const iceSubs = await page.$$eval('#menuList .mcat', l => [...l[2].querySelectorAll('.msub .mhead .t b')].map(e => e.textContent));
  check('...added', iceSubs.join() === 'Cones', iceSubs);
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[0].querySelector('.mhead').click());
  await sleep(150);
  check('a category opens with its own fields (no price, no "On the TV")', (await text('#edTitle')) === 'Change category' && !(await page.$('#edPrice')) && !(await page.$('#edIn')) && !(await page.$('#edTv')));
  await page.type('#editor [data-name=ku]', 'نێرگلە');
  await page.click('#editor details summary');
  await page.type('#editor [data-note=en]', 'Every flavour has its own pipe.');
  await page.click('#edSave');
  await sleep(450);
  check('a Kurdish name for it: shown first, the English under it', (await cats())[0] === 'نێرگلە'
    && (await page.$eval('#menuList .mcat .mhead .t span', e => e.textContent)).startsWith('Hookah Flavors'), await cats());
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[2].querySelector('.msub .mhead').click());
  await sleep(150);
  await page.evaluate(() => [...document.querySelectorAll('#editor button')].find(b => /^Delete/.test(b.textContent)).click());
  await sleep(450);
  check('deleting asks first, then it\'s gone', dialogs[dialogs.length - 1] === 'Delete “Cones” and its 0 items from the menu?'
    && (await page.$$eval('#menuList .mcat', l => l[2].querySelectorAll('.msub').length)) === 0, dialogs);
  await page.click('#addCat');
  await sleep(150);
  await page.type('#editor [data-name=en]', 'Shisha Specials');
  await page.select('#edPlace', '0');
  await page.click('#edSave');
  await sleep(450);
  check('a new category, at the top', (await cats())[0] === 'Shisha Specials' && (await cats()).length === 6, await cats());

  console.log('\nTwo phones at once');
  const now = JSON.parse((await get(port, '/api/menu?pin=4821'))[1]);
  now.categories[now.categories.length - 1].items.push({ name: { en: 'Water' }, price: 500 });
  const other = await post(port, '/api/menu?pin=4821', JSON.stringify({ base: now.v, menu: { categories: now.categories } }));
  check('(another phone adds Water to Others)', other[0] === 200, other);
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[0].querySelector('.mhead').click());
  await sleep(150);
  await page.type('#editor [data-name=ku]', 'تایبەت');
  await page.click('#edSave');
  await sleep(500);
  check('a change on the older copy isn\'t saved over theirs: says so, and shows the menu as it is now', (await text('#say')).includes('changed on another phone')
    && await page.$eval('#editor', e => e.hidden) && (await items(5)).map(i => i[0]).join() === 'Water' && (await cats())[0] === 'Shisha Specials', [await text('#say'), await items(5)]);
  await shot(page, 'menu-tab.png', { fullPage: true });
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('fits a 360-pixel phone', wide === 0, wide);
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[1].querySelectorAll('.mitem')[0].click());
  await sleep(200);
  await shot(page, 'menu-editor.png');
  await page.keyboard.press('Escape');
  await sleep(100);
  check('Escape closes the editor, nothing changed', await page.$eval('#editor', e => e.hidden));
  const depth = await page.evaluate(() => history.length);
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[1].querySelectorAll('.mitem')[0].click());
  await sleep(200);
  await page.evaluate(() => history.back());
  await sleep(300);
  check('the phone\'s Back button closes the editor, and the phone page stays', await page.$eval('#editor', e => e.hidden) &&
    await page.$eval('#menuView', e => !e.hidden) && await page.evaluate(() => !history.state || !history.state.editor), await page.evaluate(() => history.state));
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[1].querySelectorAll('.mitem')[0].click());
  await sleep(200);
  await page.evaluate(() => [...document.querySelectorAll('#editor button')].find(b => b.textContent === 'Cancel').click());
  await sleep(300);
  check('...and Cancel leaves nothing behind for Back to close', await page.$eval('#editor', e => e.hidden) &&
    await page.evaluate(() => !history.state || !history.state.editor) && await page.evaluate(() => history.length) <= depth + 1,
    [await page.evaluate(() => history.length), depth]);

  console.log('\nThe customers\' menu, from it');
  const c = await b.newPage();
  c.on('pageerror', e => errors.push('menu: ' + e));
  await c.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cbase = 'http://127.0.0.1:' + menuPort;
  await c.goto(cbase + '/', { waitUntil: 'networkidle0' });
  await c.evaluate(() => document.fonts.ready);
  check('the menu\'s address with /menu/ taken off: the menu again, never the phone page; Kurdish, right to left, the café\'s name',
    c.url() === cbase + '/menu/' && await c.$eval('html', h => h.lang + h.dir) === 'ckbrtl' && !(await c.$('#pinInput'))
    && await c.$eval('#name', e => e.textContent) === 'کافتریا و ڕێستورانتی توایڵایت' && await c.$eval('#word', e => e.textContent) === 'مینیو', c.url());
  const probe = await get(menuPort, '/api/status?pin=4821');
  check('...and nothing of the phone page there, even with the PIN', probe[0] === 404, probe);
  const secs = await c.$$eval('main section', l => l.map(s => s.querySelector('h2').textContent));
  check('only what customers may see: hidden Grape left out, empty categories left out', secs.join() === 'نێرگلە,Drink,Others', secs);
  const rows = await c.$$eval('main .row', l => l.map(r => [r.querySelector('.nm').textContent, (r.querySelector('.pr') || { textContent: '' }).textContent]));
  check('prices in Kurdish digits with د.ع', JSON.stringify(rows) === JSON.stringify([['نەعنا', '١٠٬٠٠٠د.ع'], ['سێوی دووانە', '١٠٬٠٠٠د.ع'], ['Water', '٥٠٠د.ع']]), rows);
  check('the picture from the phone, loaded from the TV', await c.$eval('main .row img', i => i.complete && i.naturalWidth > 0));
  check('the note under the category', await c.$eval('main section .note', e => e.textContent) === 'Every flavour has its own pipe.');
  check('Kurdish and English to choose from (no Arabic names yet)', (await c.$$eval('#langs button', l => l.map(b => b.textContent))).join() === 'کوردی,English');
  const mint3d = await c.evaluate(() => { const li = [...document.querySelectorAll('main .items li')].find(l => /نەعنا/.test(l.textContent));
    const t = li.querySelector('button.thumb'); return [li.className, t && t.className, t && t.textContent, t && t.getAttribute('aria-label')]; });
  check('the item with a 3D model: a gold cube beside it (it has no picture) that opens it in 3D', JSON.stringify(mint3d) === JSON.stringify(['has3d', 'thumb bare', '3D', 'نەعنا, 3D']), mint3d);
  await sleep(300);
  check('the room in the colour of the song on the TV (its /menu/now)', await c.$eval('html', h => h.getAttribute('data-tint') + '|' + h.classList.contains('room-b')) === '28 0.9|true',
    await c.$eval('html', h => h.getAttribute('data-tint')));
  await shot(c, 'customer-ku.png', { fullPage: true });
  await c.evaluate(() => [...document.querySelectorAll('#langs button')].find(b => b.textContent === 'English').click());
  await sleep(200);
  const rowsEn = await c.$$eval('main .row', l => l.map(r => [r.querySelector('.nm').textContent, (r.querySelector('.pr') || { textContent: '' }).textContent]));
  check('English: left to right, 123 digits and IQD; Kurdish where there\'s no English name', await c.$eval('html', h => h.dir) === 'ltr'
    && JSON.stringify(rowsEn) === JSON.stringify([['Mint', '10,000IQD'], ['Double Apple', '10,000IQD'], ['Water', '500IQD']])
    && (await c.$$eval('main section h2', l => l.map(h => h.textContent))).join() === 'Hookah Flavors,Drink,Others', rowsEn);
  await c.reload({ waitUntil: 'networkidle0' });
  check('...remembered on that phone', await c.$eval('html', h => h.dir) === 'ltr');
  await c.click('main .row.pic');
  await sleep(400);
  check('tapping an item with a picture: it big, with its name and price', !(await c.$eval('#sheet', e => e.hidden)) && await c.$eval('#sheet img', i => i.naturalWidth > 300)
    && await c.$eval('#sheet h2', e => e.textContent) === 'Double Apple');
  await shot(c, 'customer-sheet.png');
  await c.keyboard.press('Escape');
  check('...Escape (or a tap outside) closes it', await c.$eval('#sheet', e => e.hidden));
  const cwide = await c.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('the menu fits the phone', cwide === 0, cwide);
  check('no script errors', errors.length === 0, errors);
  await b.close();
  java.stdin.end();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
