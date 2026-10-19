// The phone page when someone has been guessing the PIN: a phone new to the TV is told why it can't come in;
// a phone that already had the PIN carries on. Against the app's real server (PageTestServer).
const { launch, testServer } = require('./lib/common');
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
let passes = 0, failures = 0;
const check = (n, c, x) => { if (c) { passes++; console.log('  ok   ' + n); } else { failures++; console.log('  FAIL ' + n + (x !== undefined ? '  -> ' + JSON.stringify(x) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function get(port, p, from) {
  return new Promise((ok, no) => {
    const q = http.request({ host: '127.0.0.1', port, path: p, method: 'GET', localAddress: from }, r => {
      const ch = []; r.on('data', c => ch.push(c)); r.on('end', () => ok([r.statusCode, Buffer.concat(ch).toString('utf8')]));
    });
    q.on('error', no); q.end();
  });
}
function harness() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guess-'));
  const java = testServer(dir);
  return new Promise(ok => java.stdout.on('data', d => { const m = /port (\d+) menu (\d+)/.exec(String(d)); if (m) ok({ java, port: Number(m[1]) }); }));
}
async function guessFromElsewhere(port) {    // 20 wrong PINs from three other addresses, each under its own limit of 10
  for (let i = 0; i < 9; i++) await get(port, '/api/status?pin=0000', '127.0.0.2');
  for (let i = 0; i < 9; i++) await get(port, '/api/status?pin=1111', '127.0.0.3');
  for (let i = 0; i < 2; i++) await get(port, '/api/status?pin=2222', '127.0.0.4');
}
async function enterPin(page, pin) {
  await page.waitForSelector('#pinInput', { visible: true });
  await page.type('#pinInput', pin);
  await page.keyboard.press('Enter');
}
(async () => {
  let b = await launch();                    // a browser of its own for each phone: nothing saved from before
  console.log('A phone new to the TV, while someone guesses');
  let A = await harness();
  await guessFromElsewhere(A.port);
  let page = await b.newPage();
  await page.goto('http://127.0.0.1:' + A.port + '/', { waitUntil: 'domcontentloaded' });
  await enterPin(page, '4821');
  await page.waitForFunction(() => !document.getElementById('pin').hidden && /guessing/.test(document.getElementById('pinErr').textContent), { timeout: 5000 }).catch(() => {});
  const msg = await page.$eval('#pinErr', e => e.textContent);
  check('the right PIN is refused for now, and the PIN box says why (not just "too many wrong PINs")', /guessing the PIN/.test(msg) && /10 minutes/.test(msg), msg);
  await page.close();
  A.java.stdin.end(); A.java.kill();

  console.log('A staff phone that already had the PIN');
  await b.close();
  A = await harness();
  b = await launch();
  page = await b.newPage();
  await page.goto('http://127.0.0.1:' + A.port + '/', { waitUntil: 'domcontentloaded' });
  await enterPin(page, '4821');
  await page.waitForFunction(() => document.getElementById('pin').hidden && /TV 23/.test(document.body.textContent), { timeout: 5000 }).catch(() => {});
  await guessFromElsewhere(A.port);
  const fresh = await get(A.port, '/api/status?pin=4821', '127.0.0.5');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const state = await page.evaluate(() => ({ pinShown: !document.getElementById('pin').hidden, offline: !document.getElementById('offline').hidden }));
  check('...carries on: no PIN box, not "offline", after the guessing started', !state.pinShown && !state.offline, state);
  check('...while a new address gets 429 with the reason', fresh[0] === 429 && /guessing/.test(fresh[1]), fresh);
  A.java.stdin.end(); A.java.kill();
  await b.close();
  console.log(passes + ' passed, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
