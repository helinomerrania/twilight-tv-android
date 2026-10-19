#!/usr/bin/env node
// Runs the page tests:  node run.js [suites...]      (for example: node run.js tv phone-menu)
//
// Every check prints a line, "ok" or "FAIL". A failed check, a suite that stops early or one with no checks fails
// the run. Needs Java (javac), Chrome or Chromium (CHROME_PATH says where, if it isn't in the usual places), and
// Python 3 with openpyxl and Pillow; LibreOffice is used when it's installed. SHOTS=<folder> keeps screenshots.
// The TV page's tests run a few at a time (TV_WORKERS), beside the browser suites, which run one after another.
'use strict';
const { spawn, spawnSync } = require('child_process');
const os = require('os'), path = require('path');
const { compileServer } = require('./lib/common');

const BROWSER_SUITES = ['tv-files', 'phone', 'phone-settings', 'phone-screens', 'phone-menu', 'menu-io', 'menu-pictures', 'pin-guessing',
  'customer-menu'];
const SUITE_TIME = 10 * 60e3, TV_TEST_TIME = 5 * 60e3;   // longer than that: stuck
const TV_SLOW = ['tPrayer', 'tMenuSlides', 'tQuietAndClosing', 'tHours'];   // the longest TV-page tests, started first

// Why a test file stopped early, from its output: the error it printed (else its last line), for the notes on GitHub
function cause(out) {
  const lines = out.split('\n').map(l => l.trim()).filter(l => l && !/^(ok|skip) |^Picked up JAVA_TOOL_OPTIONS/.test(l));
  return (lines.find(l => /^\w*Error\b/.test(l)) || lines.pop() || '').slice(0, 200);
}

// One test file in a process of its own: its output, and the checks it counted
function run(file, args, time) {
  return new Promise(done => {
    const started = Date.now();
    const child = spawn(process.execPath, [file, ...args], { cwd: __dirname, env: process.env });
    let out = '', stuck = false;
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const timer = setTimeout(() => { stuck = true; child.kill('SIGKILL'); }, time);
    child.on('close', code => {
      clearTimeout(timer);
      const m = /(\d+) passed, (\d+) failed\s*$/.exec(out.trimEnd());
      const passed = m ? Number(m[1]) : 0, failed = m ? Number(m[2]) : 0, skipped = (out.match(/^  skip /gm) || []).length;
      const why = stuck ? 'stopped after ' + time / 60e3 + ' minutes' : !m ? 'stopped before the end' + (cause(out) ? ': ' + cause(out) : '')
        : passed + failed === 0 ? 'no checks ran'
        : failed ? '' : code !== 0 ? 'ended with code ' + code : '';
      done({ out, passed, failed, skipped, ok: !why && !failed, why, seconds: (Date.now() - started) / 1000 });
    });
  });
}

function print(title, r) {
  console.log('\n=== ' + title + ' (' + r.seconds.toFixed(0) + ' s)' + '\n' + r.out.trimEnd() + (r.why ? '\n  FAIL ' + r.why : ''));
}

(async () => {
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter(w => w !== 'tv' && !BROWSER_SUITES.includes(w));
  if (unknown.length) {
    console.log('No such suite: ' + unknown.join(', ') + '. The suites: tv, ' + BROWSER_SUITES.join(', '));
    process.exit(2);
  }
  const started = Date.now();
  const browser = BROWSER_SUITES.filter(s => !wanted.length || wanted.includes(s));
  const tv = !wanted.length || wanted.includes('tv');
  if (browser.length) process.env.PAGE_SERVER_CP = compileServer();           // the app's own server, compiled once
  const tvTests = tv ? spawnSync(process.execPath, ['tv.test.js', '--list'], { cwd: __dirname, encoding: 'utf8' }).stdout.split('\n').filter(Boolean) : [];

  const results = {}, tvResults = {};
  const browserLane = async () => {
    for (const s of browser) {
      const r = await run(s + '.test.js', [], SUITE_TIME);
      results[s] = r;
      print(s, r);
    }
  };
  const queue = tvTests.filter(t => TV_SLOW.includes(t)).concat(tvTests.filter(t => !TV_SLOW.includes(t)));
  const tvLane = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const r = await run('tv.test.js', [t], TV_TEST_TIME);
      tvResults[t] = r;
      print('tv: ' + t, r);
    }
  };
  const workers = Number(process.env.TV_WORKERS) || Math.max(2, os.cpus().length);
  const lanes = [browserLane()];
  for (let i = 0; i < Math.max(1, workers - (browser.length ? 1 : 0)) && i < tvTests.length; i++) lanes.push(tvLane());
  await Promise.all(lanes);

  if (tv) {
    const rs = Object.values(tvResults);
    const bad = tvTests.filter(t => !tvResults[t] || !tvResults[t].ok);
    results.tv = { passed: rs.reduce((n, r) => n + r.passed, 0), failed: rs.reduce((n, r) => n + r.failed, 0), skipped: rs.reduce((n, r) => n + r.skipped, 0),
      ok: bad.length === 0 && tvTests.length > 0,
      why: tvTests.length === 0 ? 'no tests found' : bad.length ? 'in ' + bad.join(', ') : '' };
  }
  const order = (tv ? ['tv'] : []).concat(browser);
  const total = order.reduce((n, s) => n + results[s].passed, 0), skipped = order.reduce((n, s) => n + results[s].skipped, 0);
  const failed = order.filter(s => !results[s].ok);
  console.log('\nThe page tests');
  for (const s of order) {
    const r = results[s];
    console.log('  ' + (r.ok ? 'ok  ' : 'FAIL') + ' ' + s.padEnd(16) + String(r.passed).padStart(4) + ' passed' + (r.failed ? ', ' + r.failed + ' failed' : '')
      + (r.skipped ? ', ' + r.skipped + ' skipped' : '') + (r.why ? '  (' + r.why + ')' : ''));
  }
  const time = Math.round((Date.now() - started) / 1000);
  console.log(failed.length ? '\n' + failed.length + ' of ' + order.length + ' suites failed.'
    : '\nAll ' + total + ' checks passed' + (skipped ? ' (' + skipped + ' skipped: what this computer lacks, marked "skip" above)' : '') + ', in '
      + Math.floor(time / 60) + ' min ' + time % 60 + ' s.');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.log('  FAIL the page tests could not run: ' + (e && e.stack || e)); process.exit(1); });
