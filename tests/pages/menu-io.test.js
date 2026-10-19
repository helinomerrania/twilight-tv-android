// The Menu tab's import and export, in Chromium against the app's real server and menu store (PageTestServer):
// the Excel file checked by openpyxl and LibreOffice, changed by openpyxl as if in Excel, and imported back;
// a CSV with semicolons; a backup with its pictures moved to a fresh TV box; files that aren't right
const { FIXTURES, launch, testServer, has } = require('./lib/common');
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const PHOTO = FIXTURES + '/sample-photo.jpg';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'menuio-'));

let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function req(port, method, p, body) {
  return new Promise((ok, no) => {
    const q = http.request({ host: '127.0.0.1', port, path: p, method, headers: { 'Content-Type': 'application/json' } }, r => {
      const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => ok([r.statusCode, Buffer.concat(ch)]));
    });
    q.on('error', no); q.end(body);
  });
}
const json = async (port, p) => JSON.parse((await req(port, 'GET', p))[1].toString('utf8'));
function harness(dir) {
  const java = testServer(dir);
  return new Promise(ok => java.stdout.on('data', d => { const m = /port (\d+) menu (\d+)/.exec(String(d)); if (m) ok({ java, port: Number(m[1]) }); }));
}
// An .xlsx with the words in each cell (as openpyxl writes it) rewritten as Excel writes it: the words in one shared list
const SHARE_STRINGS = `
import re, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); words = []
def share(m):
    words.append(m.group(3))
    return '<c ' + m.group(1) + 't="s"' + m.group(2) + '><v>' + str(len(words) - 1) + '</v></c>'
cell = re.compile(r'<c ([^>]*?)t="inlineStr"([^>]*)><is><t(?: [^>]*)?>(.*?)</t></is></c>', re.S)
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename.startswith('xl/worksheets/'):
            data = cell.sub(share, data.decode('utf-8')).encode('utf-8')
        elif item.filename == '[Content_Types].xml':
            data = data.replace(b'</Types>', b'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>')
        elif item.filename == 'xl/_rels/workbook.xml.rels':
            data = data.replace(b'</Relationships>', b'<Relationship Id="rIdShared" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>')
        zout.writestr(item.filename, data)
    zout.writestr('xl/sharedStrings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="%d" uniqueCount="%d">%s</sst>'
                  % (len(words), len(words), ''.join('<si><t xml:space="preserve">' + w + '</t></si>' for w in words)))
`;
function py(code, ...args) {
  const r = spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}
async function waitFile(dir, re, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const f = fs.readdirSync(dir).find(n => re.test(n) && !/\.crdownload$/.test(n));
    if (f) { await sleep(200); return path.join(dir, f); }
    await sleep(100);
  }
  return null;
}

(async () => {
  const A = await harness(path.join(TMP, 'box1'));
  // A menu to start from: Kurdish, Arabic and English names, notes, pictures, a hidden item, a subcategory
  const pic = JSON.parse((await req(A.port, 'POST', '/api/menu/picture?pin=4821', JSON.stringify({ full: fs.readFileSync(PHOTO).toString('base64'), small: '' })))[1]).id;
  const m0 = await json(A.port, '/api/menu?pin=4821');
  m0.categories[0].name = { ku: 'نێرگلە', ar: 'أراكيل', en: 'Hookah Flavors' };
  m0.categories[0].note = { en: 'Every flavour, its own pipe; ask us.' };
  m0.categories[0].items = [{ id: 'apple0001', name: { ku: 'سێوی دووانە', en: 'Double Apple' }, price: 10000, picture: pic },
                            { id: 'grape0001', name: { ku: 'ترێ', en: 'Grape' }, price: 10000, hidden: true }];
  m0.categories[1].subs[0].items = [{ id: 'bull00001', name: { en: 'Red Bull' }, price: 3000, note: { en: 'Cold, "can"' } }];
  const s0 = JSON.parse((await req(A.port, 'POST', '/api/menu?pin=4821', JSON.stringify({ base: m0.v, menu: { categories: m0.categories } })))[1]);
  check('(a menu to start from, saved on the TV)', s0.ok, s0);

  const b = await launch();
  const page = await b.newPage();
  const errors = [];
  let answer = true;
  const dialogs = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const DL = path.join(TMP, 'downloads');
  fs.mkdirSync(DL);
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
  await page.goto('http://127.0.0.1:' + A.port + '/', { waitUntil: 'networkidle0' });
  await page.type('#pinInput', '4821');
  await page.click('#pin button[type=submit]');
  await sleep(400);
  await page.click('#tabMenu');
  await sleep(500);
  const msg = () => page.$eval('#ioMsg', e => e.textContent);

  console.log('\nSaving the menu as Excel');
  await page.click('#ioXlsx');
  const xlsxFile = await waitFile(DL, /\.xlsx$/);
  check('an .xlsx file saved on the phone, dated', !!xlsxFile && /twilight-menu-\d{4}-\d\d-\d\d\.xlsx$/.test(xlsxFile), xlsxFile);
  const rows = JSON.parse(py(`
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb.worksheets[0]
print(json.dumps({"title": ws.title, "frozen": ws.freeze_panes, "bold": ws["A1"].font.b,
  "rows": [[("" if c is None else c) for c in r] for r in ws.iter_rows(values_only=True)]}, ensure_ascii=False))`, xlsxFile));
  check('Excel opens it (openpyxl): one sheet "Menu", the column names in bold, kept in sight', rows.title === 'Menu' && rows.frozen === 'A2' && rows.bold === true
    && rows.rows[0].join('|') === 'Type|Kurdish|Arabic|English|Price|Kurdish description|Arabic description|English description|On menu|On TV|Picture|ID', rows);
  const r = rows.rows;
  check('the menu row by row: the category, its items, then each subcategory with its items', r[1][0] === 'category' && r[1][1] === 'نێرگلە' && r[1][2] === 'أراكيل'
    && r[2][0] === 'item' && r[2][1] === 'سێوی دووانە' && r[2][4] === 10000 && r[2][9] === 'yes' && r[1][9] === '' && r[2][10] === pic && r[2][11] === 'apple0001'
    && r[3][1] === 'ترێ' && r[3][8] === 'no' && r[4][0] === 'category' && r[4][3] === 'Drink' && r[5][0] === 'subcategory' && r[5][3] === 'Energy'
    && r[6][3] === 'Red Bull' && r[6][7] === 'Cold, "can"', r.slice(0, 8));
  check('...prices as numbers (Excel can add them up)', typeof r[2][4] === 'number');
  const office = has('soffice');                      // LibreOffice, when it's installed
  if (office) {
    const lo = spawnSync('soffice', ['--headless', '--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76', '--outdir', TMP, xlsxFile], { encoding: 'utf8', timeout: 120000 });
    const loCsv = path.join(TMP, path.basename(xlsxFile).replace(/\.xlsx$/, '.csv'));
    check('LibreOffice opens it too, Kurdish and Arabic whole', lo.status === 0 && fs.existsSync(loCsv) && fs.readFileSync(loCsv, 'utf8').includes('سێوی دووانە')
      && fs.readFileSync(loCsv, 'utf8').includes('أراكيل'), lo.stderr);
  } else console.log('  skip LibreOffice opens it too (LibreOffice isn\'t installed here)');

  console.log('\nChanged in Excel and imported back');
  const edited = path.join(TMP, 'edited.xlsx');
  py(`
import openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb.worksheets[0]
ws["E3"] = 12000                       # Double Apple: a new price
ws["D3"] = "Two Apples"                # a new English name
ws["C3"] = "تفاحتين"                   # and an Arabic one
ws["I4"] = "yes"                       # Grape back on the menu
ws["J3"] = "no"                        # Double Apple kept off the TV's slides
ws.insert_rows(5)                      # a new item, no id, after Grape
for col, v in zip("ABCDE", ["item", "نەعنا", "", "Mint", "11,000"]): ws[col + "5"] = v
wb.save(sys.argv[2])`, xlsxFile, edited);
  // saved again as Excel saves: compressed, the words in a list of their own (shared strings). By LibreOffice when
  // it's installed; otherwise openpyxl's words (written in each cell) are moved into that list here.
  const loDir = path.join(TMP, 'lo');
  const resave = office ? spawnSync('soffice', ['--headless', '--convert-to', 'xlsx', '--outdir', loDir, edited], { encoding: 'utf8', timeout: 120000 })
    : (fs.mkdirSync(loDir, { recursive: true }), { status: 0, stderr: py(SHARE_STRINGS, edited, path.join(loDir, 'edited.xlsx')) });
  const editedLo = path.join(loDir, 'edited.xlsx');
  check('(saved again as Excel saves: compressed, with shared strings)', resave.status === 0 && py(`
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1]); print(sorted(set(i.compress_type for i in z.infolist())), "xl/sharedStrings.xml" in z.namelist())`, editedLo).trim() === '[8] True', resave.stderr);
  answer = false;
  await (await page.$('#ioFile')).uploadFile(editedLo);
  await page.waitForFunction(() => /Nothing changed/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  check('importing asks first, saying what\'s in the file; no: nothing changed', /in place of the one there now/.test(dialogs[dialogs.length - 1])
    && /5 categories, 5 subcategories and 4 items/.test(dialogs[dialogs.length - 1]) && (await json(A.port, '/api/menu?pin=4821')).v === s0.v, dialogs[dialogs.length - 1]);
  answer = true;
  await (await page.$('#ioFile')).uploadFile(editedLo);
  await page.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  const after = await json(A.port, '/api/menu?pin=4821');
  const hk = after.categories[0].items;
  check('yes: on the TV, the new price, names and the item back on the menu', hk[0].id === 'apple0001' && hk[0].price === 12000 && hk[0].name.en === 'Two Apples'
    && hk[0].name.ar === 'تفاحتين' && hk[0].name.ku === 'سێوی دووانە' && !hk[1].hidden, hk);
  check('...and "On TV" no: that item kept off the TV\'s slides between songs (the others on it)', hk[0].tv === false && hk[1].tv === undefined, [hk[0].tv, hk[1].tv]);
  check('...the picture still with its item (same ID)', hk[0].picture === pic, hk[0]);
  check('...the new row a new item in its place, its price "11,000" in dinars', hk[2] && hk[2].name.ku === 'نەعنا' && hk[2].name.en === 'Mint' && hk[2].price === 11000
    && /^[a-z0-9]{4,24}$/.test(hk[2].id), hk[2]);
  check('...the rest as it was (the category\'s note, the subcategory\'s item)', after.categories[0].note.en === 'Every flavour, its own pipe; ask us.'
    && after.categories[1].subs[0].items[0].name.en === 'Red Bull', after.categories[1]);
  check('...and the phone\'s list shows it', (await page.$$eval('#menuList .mcat', l => [...l[0].querySelectorAll('.mitem .t > b')].map(e => e.childNodes[0].textContent))).join() ===
    'سێوی دووانە,ترێ,نەعنا');

  console.log('\nCSV');
  for (const f of fs.readdirSync(DL)) fs.unlinkSync(path.join(DL, f));
  await page.click('#ioCsv');
  const csvFile = await waitFile(DL, /\.csv$/);
  const csv = fs.readFileSync(csvFile, 'utf8');
  check('a CSV file, marked as UTF-8 for Excel, the same rows', csv.charCodeAt(0) === 0xFEFF && csv.split('\r\n')[0] === '﻿Type,Kurdish,Arabic,English,Price,Kurdish description,Arabic description,English description,On menu,On TV,Picture,ID'
    && csv.includes('item,سێوی دووانە,تفاحتين,Two Apples,12000,,,,yes,no,' + pic + ',apple0001')   // On TV: no, as imported above && csv.includes('"Every flavour, its own pipe; ask us."')
    && csv.includes('"Cold, ""can"""'), csv.slice(0, 400));
  const semi = path.join(TMP, 'from-excel.csv');
  fs.writeFileSync(semi, '﻿Type;Kurdish;English;Price;On menu\r\ncategory;چا;Tea;;\r\nitem;چای سوور;"Black; strong";1000;yes\r\nitem;چای سەوز;Green tea;١٬٥٠٠;no\r\n\r\nsubcategory;;Herbal;;\r\nitem;;Chamomile;2000;\r\n');
  await (await page.$('#ioFile')).uploadFile(semi);
  await page.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  const tea = await json(A.port, '/api/menu?pin=4821');
  check('a CSV with semicolons, columns in another order and fewer of them, Kurdish digits, an empty row: read right', tea.categories.length === 1
    && tea.categories[0].name.ku === 'چا' && tea.categories[0].items.map(i => i.name.en + ':' + i.price + ':' + (i.hidden ? 'hidden' : 'shown')).join() === 'Black; strong:1000:shown,Green tea:1500:hidden'
    && tea.categories[0].subs[0].name.en === 'Herbal' && tea.categories[0].subs[0].items[0].price === 2000, tea.categories);

  console.log('\nFiles that aren\'t right');
  const bad = async (name, text) => {
    const f = path.join(TMP, name); fs.writeFileSync(f, text);
    await page.$eval('#ioMsg', e => { e.textContent = ''; });
    await (await page.$('#ioFile')).uploadFile(f);
    await page.waitForFunction(() => document.getElementById('ioMsg').textContent && !/^Reading/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
    return msg();
  };
  const v0 = (await json(A.port, '/api/menu?pin=4821')).v;
  check('no column names: says which it needs', (await bad('names.csv', 'apple,10000\r\n')).includes('The first row needs the columns\' names'), await msg());
  check('an item before any category: says which row', (await bad('order.csv', 'Type,English,Price\r\nitem,Apple,1000\r\n')) === 'Row 2: an item with no category above it.', await msg());
  check('a row with no name: says which row', (await bad('noname.csv', 'Type,English\r\ncategory,Tea\r\nitem,\r\nitem,\r\n')).startsWith('Row 3 has no name'), await msg());
  check('a price that isn\'t one', (await bad('price.csv', 'Type,English,Price\r\ncategory,Tea\r\nitem,Black,cheap\r\n')) === 'Row 3: “cheap” isn\'t a price.', await msg());
  check('a broken Excel file, or something else altogether', (await bad('broken.xlsx', 'not a zip')).includes("isn't an Excel file") && (await bad('photo.png', 'x')).startsWith('Choose an Excel file'), await msg());
  check('...and the menu on the TV untouched by all of them', (await json(A.port, '/api/menu?pin=4821')).v === v0);

  console.log('\nA backup with the pictures, onto another TV box');
  for (const f of fs.readdirSync(DL)) fs.unlinkSync(path.join(DL, f));
  await (await page.$('#ioFile')).uploadFile(edited);                       // the menu with the picture again
  await page.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  await page.click('#ioBackup');
  const bk = await waitFile(DL, /backup.*\.json$/);
  const backup = JSON.parse(fs.readFileSync(bk, 'utf8'));
  check('a backup file: the whole menu and its picture, as text', backup.twilightMenu === 1 && backup.menu.categories.length === 5 && Object.keys(backup.pictures).join() === pic
    && /^data:image\/jpeg;base64,\/9j\//.test(backup.pictures[pic].full) && /^data:image\/jpeg;base64,/.test(backup.pictures[pic].small)
    && (await msg()).includes('with its 1 picture'), [Object.keys(backup), await msg()]);
  const B = await harness(path.join(TMP, 'box2'));
  const page2 = await b.newPage();
  page2.on('pageerror', e => errors.push('box 2: ' + e));
  page2.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page2.goto('http://127.0.0.1:' + B.port + '/', { waitUntil: 'networkidle0' });
  await page2.type('#pinInput', '4821');
  await page2.click('#pin button[type=submit]');
  await sleep(400);
  await page2.click('#tabMenu');
  await sleep(500);
  await (await page2.$('#ioFile')).uploadFile(bk);
  await page2.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent), { timeout: 15000 });
  check('...asked first, with the picture counted', /with 1 picture/.test(dialogs[dialogs.length - 1]), dialogs[dialogs.length - 1]);
  const moved = await json(B.port, '/api/menu?pin=4821'), apple = moved.categories[0].items[0];
  check('on the other box: the same menu', JSON.stringify(moved.categories.map(c => [c.name, (c.items || []).map(i => [i.name, i.price, !!i.hidden])])) ===
    JSON.stringify(after.categories.map(c => [c.name, (c.items || []).map(i => [i.name, i.price, !!i.hidden])])), moved.categories[0]);
  const img = await req(B.port, 'GET', '/menu/pics/' + apple.picture + '.jpg');
  check('...the picture there too, the same JPEG', !!apple.picture && img[0] === 200 && Buffer.compare(img[1], fs.readFileSync(PHOTO)) === 0, apple);
  console.log('\nDescriptions written elsewhere (Gemini, say): a file of IDs and descriptions changes only those');
  await page.bringToFront();                         // back to the first phone (a tab in the background doesn't draw)
  const beforeD = await json(A.port, '/api/menu?pin=4821');
  const descCsv = path.join(TMP, 'descriptions.csv');
  fs.writeFileSync(descCsv, 'ID,Item,Kurdish description,Arabic description,English description\r\n' +
    'apple0001,Double Apple,"سێوی سوور و سەوز، بە بۆنی گوڵەبەڕۆژە",تفاح أحمر وأخضر,"Red and green apples, a whisper of anise"\r\n' +
    '`grape0001`,Grape,,,Sweet dark grapes\r\n' +
    'zzzz9999,Ghost,,,Not on this menu\r\n' +
    ' SEEDHOOKAH ,Hookah Flavors,,,"Every flavour, its own pipe."\r\n');
  await (await page.$('#ioFile')).uploadFile(descCsv);
  await page.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  check('asked first: what changes, for how many, and the row that matches nothing', dialogs[dialogs.length - 1] ===
    'Change the descriptions of 3 things on the menu, from descriptions.csv? Everything else stays as it is.\n\nSkipped, row 4: the ID isn\'t on the menu.', dialogs[dialogs.length - 1]);
  const afterD = await json(A.port, '/api/menu?pin=4821'), apD = afterD.categories[0].items[0], grD = afterD.categories[0].items[1];
  check('the descriptions in, in three languages where given (IDs found despite quotes, spaces and capitals)', apD.note.ku === 'سێوی سوور و سەوز، بە بۆنی گوڵەبەڕۆژە'
    && apD.note.ar === 'تفاح أحمر وأخضر' && apD.note.en === 'Red and green apples, a whisper of anise' && grD.note.en === 'Sweet dark grapes'
    && afterD.categories[0].note.en === 'Every flavour, its own pipe.', [apD.note, grD.note, afterD.categories[0].note]);
  check('...nothing else changed: names (the "Item" column is only for reading), prices, pictures, the rest of the menu',
    JSON.stringify(afterD.categories.map(c => [c.name, (c.items || []).map(i => [i.id, i.name, i.price, i.picture || '', !!i.hidden])])) ===
    JSON.stringify(beforeD.categories.map(c => [c.name, (c.items || []).map(i => [i.id, i.name, i.price, i.picture || '', !!i.hidden])])) && afterD.v === beforeD.v + 1);
  check('...and says what it did', (await msg()) === 'Done: the descriptions of 3 things on the menu. Skipped, row 4: the ID isn\'t on the menu.', await msg());
  const priceXlsx = path.join(TMP, 'prices.xlsx');
  py(`
import openpyxl, sys
wb = openpyxl.Workbook(); ws = wb.active
ws.append(["ID", "Price in dinars", "On menu"]); ws.append(["grape0001", 6000, "no"]); ws.append(["seedhookah", 999, ""])
wb.save(sys.argv[1])`, priceXlsx);
  await (await page.$('#ioFile')).uploadFile(priceXlsx);
  await page.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent) && /prices/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  const afterP = await json(A.port, '/api/menu?pin=4821');
  check('an Excel file of prices and on-menu: the item changed, a category given a price ignored, the descriptions kept', afterP.categories[0].items[1].price === 6000
    && afterP.categories[0].items[1].hidden === true && afterP.categories[0].price === undefined && afterP.categories[0].items[1].note.en === 'Sweet dark grapes',
    afterP.categories[0].items[1]);
  // A table copied from a spreadsheet (tabs), with bold column names and a row that matches nothing, pasted
  await page.click('#ioPaste');
  await page.$eval('#pasteText', t => { t.value = '**ID**\t**English description**\tItem\napple0001\tTwo apples, and anise\tDouble Apple\nnothing99\tx\tGhost\n'; });
  await page.click('#pasteUse');
  await page.waitForFunction(() => /^Done/.test(document.getElementById('ioMsg').textContent) && /row 3/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  check('cells copied from a spreadsheet and pasted: changed by ID, the row matching nothing skipped and said', (await json(A.port, '/api/menu?pin=4821')).categories[0].items[0].note.en === 'Two apples, and anise'
    && (await msg()) === 'Done: the descriptions of 1 thing on the menu. Skipped, row 3: the ID isn\'t on the menu.', await msg());
  await page.click('#ioPaste');
  await page.$eval('#pasteText', t => { t.value = 'just some words, not a table'; });
  await page.click('#pasteUse');
  await page.waitForFunction(() => /columns' names/.test(document.getElementById('ioMsg').textContent), { timeout: 8000 });
  check('words that aren\'t a table: says what it needs, the box stays open with them', !(await page.$eval('#pasteBox', e => e.hidden)) && await page.$eval('#pasteText', t => t.value) === 'just some words, not a table');
  await page.click('#pasteCancel');
  check('...Cancel closes it, emptied', await page.$eval('#pasteBox', e => e.hidden) && await page.$eval('#pasteText', t => t.value) === '');
  const v1 = (await json(A.port, '/api/menu?pin=4821')).v;
  check('IDs that match nothing at all: nothing changed, says so', (await bad('none.csv', 'ID,English description\r\nnope0001,x\r\n')).startsWith('None of the IDs in none.csv is on the menu')
    && (await json(A.port, '/api/menu?pin=4821')).v === v1, await msg());
  check('no script errors', errors.length === 0, errors);
  await b.close();
  A.java.stdin.end(); B.java.stdin.end();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
