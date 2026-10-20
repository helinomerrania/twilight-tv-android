// A picture with a see-through background (a PNG cut out in a design app), put on the menu from the phone:
// its background the menu's own dark blue, not black; and the editor says which sizes are best
const { FIXTURES, launch, testServer } = require('./lib/common');
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'menupic-'));
let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const java = testServer(DATA);
  const port = await new Promise(ok => java.stdout.on('data', d => { const m = /port (\d+)/.exec(String(d)); if (m) ok(Number(m[1])); }));
  const b = await launch();
  const page = await b.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.goto('http://127.0.0.1:' + port + '/', { waitUntil: 'networkidle0' });
  await page.type('#pinInput', '4821');
  await page.click('#pin button[type=submit]');
  await sleep(400);
  await page.click('#tabMenu');
  await sleep(500);
  console.log('\nPicture sizes, and see-through pictures');
  await page.evaluate(() => document.querySelectorAll('#menuList .mcat')[0].querySelector('.mhead').click());
  await sleep(200);
  check('a category: "Wide is best, 16:9 like 1200×675", across the menu', (await page.$eval('#edPicMsg', e => e.textContent)).startsWith('Wide is best, 16:9 like 1200×675: across the menu'));
  await page.keyboard.press('Escape');
  await sleep(100);
  await page.evaluate(() => document.querySelector('#menuList .msub .mhead').click());
  await sleep(200);
  check('a subcategory: "Wide is best, 2:1 like 1200×600", a strip', (await page.$eval('#edPicMsg', e => e.textContent)).startsWith('Wide is best, 2:1 like 1200×600: a strip'),
    await page.$eval('#edPicMsg', e => e.textContent));
  await page.keyboard.press('Escape');
  await sleep(100);
  await page.evaluate(() => [...document.querySelectorAll('#menuList .mcat')[0].querySelectorAll('.madd')].find(x => x.textContent === '+ Add an item').click());
  await sleep(200);
  check('an item: "Square is best, like 1200×1200"', (await page.$eval('#edPicMsg', e => e.textContent)).startsWith('Square is best, like 1200×1200'));
  await page.type('#editor [data-name=en]', 'Red circle');
  await (await page.$('#editor input[type=file]')).uploadFile(FIXTURES + '/transparent.png');
  await page.waitForFunction(() => /Picture ready/.test(document.getElementById('edPicMsg').textContent), { timeout: 15000 });
  await page.click('#edSave');
  await sleep(500);
  const full = fs.readdirSync(DATA + '/pics').find(f => /^[a-z0-9]+\.jpg$/.test(f));
  const px = JSON.parse(spawnSync('python3', ['-c', `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); w, h = im.size
print(json.dumps([im.size, im.getpixel((5, 5)), im.getpixel((w // 2, h // 2))]))`, DATA + '/pics/' + full], { encoding: 'utf8' }).stdout);
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);
  check('a see-through PNG: its background the menu\'s blue (#171a45), the picture itself as it was', near(px[1], [23, 26, 69]) && near(px[2], [220, 40, 50]), px);
  check('...a square of 1200 stays 1200×1200', px[0][0] === 1200 && px[0][1] === 1200, px[0]);
  await b.close();
  java.stdin.end();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });
