// What the page tests share: where the app's files are, the browser, the app's real web server, screenshots.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const ASSETS = path.join(ROOT, 'app', 'src', 'main', 'assets');
const FIXTURES = path.join(__dirname, '..', 'fixtures');
const SHOTS = process.env.SHOTS || '';                   // a folder for screenshots; none when it isn't set

const read = f => fs.readFileSync(f, 'utf8');
const indent = t => t.replace(/\n+$/, '').split('\n').map(l => (l ? '  ' + l : l)).join('\n');

// A page as one file, its styles and scripts put in, for jsdom (which doesn't fetch them by itself)
function assemble(index) {
  const folder = path.dirname(index);
  const file = ref => (ref.startsWith('/') ? path.join(ASSETS, ref) : path.join(folder, ref));
  return read(index)
    .replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, ref) => '<style>\n' + indent(read(file(ref))) + '\n</style>')
    .replace(/<script src="([^"]+)"><\/script>/g, (m, ref) => '<script>\n' + read(file(ref)).replace(/\n+$/, '') + '\n</script>');
}

// Chrome or Chromium: CHROME_PATH, else the usual places
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const tries = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH;      // Playwright's own Chromium
  if (pw && fs.existsSync(pw)) {
    for (const d of fs.readdirSync(pw).filter(n => /^chromium-\d+$/.test(n)).sort().reverse()) {
      tries.push(path.join(pw, d, 'chrome-linux', 'chrome'), path.join(pw, d, 'chrome-linux64', 'chrome'));
    }
  }
  const found = tries.find(p => fs.existsSync(p));
  if (!found) throw new Error('No Chrome or Chromium found: set CHROME_PATH');
  return found;
}

function launch(options = {}) {
  const puppeteer = require('puppeteer-core');
  return puppeteer.launch(Object.assign({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--no-proxy-server', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  }, options));
}

// A screenshot, kept only when SHOTS names a folder
async function shot(target, name, options = {}) {
  if (!SHOTS || !target) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await target.screenshot(Object.assign({ path: path.join(SHOTS, name) }, options));
}

// The phone page's own files, as the app's server hands them out
const PHONE_FILES = { '/': 'phone/index.html', '/index.html': 'phone/index.html', '/phone/phone.css': 'phone/phone.css', '/phone/phone.js': 'phone/phone.js' };

function servePhonePage(pathname, res) {
  const f = PHONE_FILES[pathname];
  if (!f) return false;
  const type = f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : 'text/html';
  res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(path.join(ASSETS, f)));
  return true;
}

// org.json for the app's classes on a computer: JSON_JAR, else the one Gradle fetched for the unit tests
function jsonJar() {
  if (process.env.JSON_JAR) return process.env.JSON_JAR;
  const base = path.join(os.homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1', 'org.json', 'json');
  if (fs.existsSync(base)) {
    for (const v of fs.readdirSync(base).sort().reverse()) {
      for (const h of fs.readdirSync(path.join(base, v))) {
        const jar = path.join(base, v, h, 'json-' + v + '.jar');
        if (fs.existsSync(jar)) return jar;
      }
    }
  }
  throw new Error('No org.json jar: run ./gradlew testDebugUnitTest once, or set JSON_JAR');
}

// The app's real web server and menu store, with a stand-in for the rest of the app (server/PageTestServer.java),
// compiled from the app's own code. Returns its Java classpath.
function compileServer() {
  const out = path.join(__dirname, '..', '.build', 'server');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const jar = jsonJar();
  const r = spawnSync('javac', ['-encoding', 'UTF-8', '-nowarn', '-d', out, '-cp', jar,
    '-sourcepath', path.join(ROOT, 'app', 'src', 'main', 'java'), path.join(__dirname, '..', 'server', 'PageTestServer.java')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('The test server did not compile:\n' + r.stdout + r.stderr);
  return out + path.delimiter + jar;
}

// Starts the test server (args: a folder for its menu, and more); it prints "port N menu M" and stops when stdin closes
function testServer(...args) {
  if (!process.env.PAGE_SERVER_CP) process.env.PAGE_SERVER_CP = compileServer();
  return spawn('java', ['-Dfile.encoding=UTF-8', '-cp', process.env.PAGE_SERVER_CP, 'com.twilightcafe.tvplayer.phone.PageTestServer', ASSETS, ...args],
    { stdio: ['pipe', 'pipe', 'inherit'] });
}

// Whether a program is installed (LibreOffice is optional)
function has(program) {
  return spawnSync('sh', ['-c', 'command -v ' + program], { encoding: 'utf8' }).status === 0;
}

module.exports = { ROOT, ASSETS, FIXTURES, SHOTS, assemble, launch, shot, servePhonePage, compileServer, testServer, has };
