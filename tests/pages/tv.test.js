// The TV page (app/src/main/assets/tv) in jsdom, with a stand-in YouTube player and a stand-in clock.
// node tv.test.js [names of tests]      --list: the tests' names
process.env.TZ = 'Asia/Baghdad';           // the café's time zone (prayer times, opening hours)
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { ASSETS, assemble } = require('./lib/common');

const BASE_HTML = assemble(path.join(ASSETS, 'tv', 'index.html'));     // the page with its styles and scripts in it
let passes = 0, failures = 0;
function check(name, cond, extra) {
  if (cond) { passes++; console.log('  ok   ' + name); }
  else { failures++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); }
  return !!fn();
}
const makeIds = (n, p = 'vid') => Array.from({ length: n }, (_, i) => p + String(i).padStart(4, '0'));

// Change values in the SETTINGS block
function htmlWith(changes, base = BASE_HTML) {
  let h = base;
  for (const [k, v] of Object.entries(changes)) {
    const re = new RegExp('(\\n\\s*' + k + ': )[^,\\n]+');
    if (!re.test(h)) throw new Error('setting not found: ' + k);
    h = h.replace(re, '$1' + JSON.stringify(v));
  }
  return h;
}
const FAST = htmlWith({ titleSeconds: 0, fadeIn: 0, fadeOut: 0 });   // for tests where fades don't matter
const fast = changes => htmlWith(changes, FAST);

function makePage(opts = {}) {
  const page = {
    clock: { now: opts.now ?? 1_700_000_000_000 },
    fetchLog: [], errors: [], fake: null, dur: 1e9, fsCalls: 0, wakeCalls: 0,
    playlistIds: opts.ids === undefined ? makeIds(10) : opts.ids,
    playlistDelay: opts.playlistDelay ?? 300,
    fetchImpl: opts.fetchImpl || (() => Promise.reject(new Error('offline'))),
  };
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => page.errors.push(String((e && e.message) || e)));
  const dom = new JSDOM(opts.html || BASE_HTML, {
    url: opts.url || 'https://tv.example.com/index.html?list=PLtest',
    runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.Date.now = () => page.clock.now;
      if (opts.seed != null) {                  // the same "random" shuffle every time
        let x = opts.seed >>> 0 || 1;
        window.Math.random = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
      }
      if (opts.storage) for (const [k, v] of Object.entries(opts.storage)) window.localStorage.setItem(k, v);
      if (opts.size) {
        Object.defineProperty(window, 'innerWidth', { value: opts.size[0], configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: opts.size[1], configurable: true });
      }
      if (opts.dpr) Object.defineProperty(window, 'devicePixelRatio', { value: opts.dpr, configurable: true });
      window.fetch = (u, o) => { page.fetchLog.push(String(u)); return page.fetchImpl(String(u), o); };
      page.frameLog = [];
      if (opts.app) { page.app = Object.assign({ alive: 0, version: 1, json: '{}', x: '{}', xv: 1 }, opts.app);
        window.TwilightApp = { settings: () => page.app.json, settingsVersion: () => page.app.version, alive: () => { page.app.alive++; },
                               extras: () => page.app.x, extrasVersion: () => page.app.xv }; }
      if (opts.frames) {         // YouTube's still frames: opts.frames(url) -> { w, h, px } or null (can't load)
        window.Image = class {
          constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; }
          set src(u) {
            this._src = u; page.frameLog.push(u);
            setTimeout(() => {
              const f = opts.frames(u);
              if (!f) { if (this.onerror) this.onerror(); return; }
              this.naturalWidth = f.w; this.naturalHeight = f.h; this._px = f.px;
              if (this.onload) this.onload();
            }, 20);
          }
          get src() { return this._src; }
        };
        window.HTMLCanvasElement.prototype.getContext = function () {
          const c = this;
          return { drawImage(img) { c._px = img._px; }, getImageData() { return { data: c._px }; } };
        };
      }
      window.Element.prototype.requestFullscreen = function () { page.fsCalls++; return Promise.reject(new Error('needs a tap')); };
      Object.defineProperty(window.navigator, 'wakeLock', { configurable: true, value: { request: () => { page.wakeCalls++; return Promise.resolve({}); } } });
      class FakePlayer {
        constructor(id, o) {
          const doc = window.document, div = doc.getElementById(id), iframe = doc.createElement('iframe');
          iframe.id = id; div.replaceWith(iframe);
          this.o = o; this.ev = o.events; this.calls = [];
          this.state = -1; this.vid = null; this.muted = false; this.vol = 50; this.ad = false;
          this.playlist = null; this.t0 = null; this.dur = 1e9; this.frozen = null;
          page.fake = this;
          setTimeout(() => this.ev.onReady({ target: this }), 5);
        }
        cuePlaylist(x) {
          this.calls.push(['cuePlaylist', x.list, x.listType]); this.state = 5;
          setTimeout(() => { if (page.playlistIds) this.playlist = page.playlistIds.slice(0, 200); }, page.playlistDelay);
        }
        getPlaylist() { return this.playlist; }
        loadVideoById(id) { this.calls.push(['load', id]); this.vid = id; this.state = 1; this.t0 = page.clock.now; this.frozen = null; this.ad = false; this.dur = page.dur; }
        playVideo() { this.calls.push(['play']); if (this.state === 2) { this.state = 1; this.t0 = page.clock.now - (this.pausedAt || 0) * 1000; } }
        pauseVideo() { this.calls.push(['pause']); this.pausedAt = this.getCurrentTime(); this.state = 2; }
        seekTo(s, ahead) { this.calls.push(['seek', s, ahead]); if (this.state === 1) this.t0 = page.clock.now - s * 1000; }
        mute() { this.calls.push(['mute']); this.muted = true; }
        unMute() { this.calls.push(['unMute']); this.muted = false; }
        setVolume(v) { this.calls.push(['vol', v]); this.vol = v; }
        getPlayerState() { return this.state; }
        getCurrentTime() {
          if (this.frozen != null) return this.frozen;
          return this.state === 1 && this.t0 != null ? (page.clock.now - this.t0) / 1000 : 0;
        }
        getDuration() { return this.dur; }
        getVideoData() {
          const t = page.vtitles && page.vtitles[this.vid];
          return { video_id: this.ad ? 'ADVIDEO0001' : this.vid, title: t ? t[0] : 'Song ' + this.vid, author: t ? t[1] : '' };
        }
        isMuted() { return this.muted; }
        getAvailableQualityLevels() { return page.levels || []; }
        setPlaybackQualityRange(a, b) { this.calls.push(['qrange', a, b]); }
        setPlaybackQuality(q) { this.calls.push(['quality', q]); }
        setOption(m, k, v) { this.calls.push(['setOption', m, k, JSON.stringify(v)]); }
        unloadModule(m) { this.calls.push(['unloadModule', m]); }
      }
      window.YT = { Player: FakePlayer };
    }
  });
  Object.assign(page, {
    dom, window: dom.window,
    loads: () => (page.fake ? page.fake.calls.filter(c => c[0] === 'load').map(c => c[1]) : []),
    calls: name => (page.fake ? page.fake.calls.filter(c => c[0] === name) : []),
    fire: (name, data) => page.fake.ev[name]({ target: page.fake, data }),
    end: () => { page.clock.now += 3000; page.fire('onStateChange', 0); },   // a song finishes
    cls: () => dom.window.document.getElementById('player').className,
    key: k => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k })),
    storage: () => { const s = {}, ls = dom.window.localStorage; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); s[k] = ls.getItem(k); } return s; },
    state: () => { const s = page.storage(); const k = Object.keys(s).find(k => k.startsWith('tv-player:')); return k ? JSON.parse(s[k]) : null; },
    start: async (ms = 8000) => {
      if (typeof dom.window.onYouTubeIframeAPIReady === 'function') dom.window.onYouTubeIframeAPIReady();
      return waitFor(() => page.loads().length > 0, ms);
    },
    close: () => dom.window.close(),
  });
  return page;
}

// Let the song's own clock move so the page sees it really playing (then wait out the title hold)
async function reveal(p, hold = 0) {
  await sleep(300);
  p.clock.now += 1000;
  await sleep(300);
  if (hold) { p.clock.now += hold * 1000 + 100; await sleep(300); }
}

/* ------------------------------------------------------------------ */

async function tPlaceholder() {
  console.log('\nSetup message when no playlist is set');
  const p = makePage({ html: htmlWith({ playlist: 'PASTE_YOUR_PLAYLIST_LINK_HERE' }), url: 'https://tv.example.com/index.html' });
  await sleep(50);
  const note = p.window.document.getElementById('note');
  check('shows "add your playlist" message', note.style.display === 'block' && /Add your YouTube playlist link/.test(note.innerHTML));
  check('does not load YouTube at all', !p.window.document.querySelector('script[src*="iframe_api"]'));
  p.close();
}

async function tStart() {
  console.log('\nStart of a song (default settings: café screen for the 4 s title wait, fade in 2 s)');
  const html = htmlWith({ playlist: 'https://www.youtube.com/playlist?list=PLabc_DEF-123&si=xyz' });
  const ids = makeIds(30);
  const p = makePage({ html, url: 'https://tv.example.com/', ids: ids.concat(ids.slice(0, 5)) });
  check('first video starts on its own', await p.start());
  check('playlist ID read from a pasted link', p.calls('cuePlaylist')[0][1] === 'PLabc_DEF-123');
  const v = p.fake.o.playerVars;
  check('no controls, keyboard, fullscreen button; subtitles policy off; origin set',
    v.controls === 0 && v.disablekb === 1 && v.fs === 0 && v.autoplay === 0 && v.cc_load_policy === 0 && v.origin === 'https://tv.example.com', v);
  check('loading: café screen, silent (no spinner, thumbnail or title)', p.cls() === 'off' && p.fake.muted && !p.window.document.body.classList.contains('video-on'));
  await reveal(p);
  await sleep(400);
  check('song starts: sound fades in while the café screen stays up (YouTube title on screen)', !p.fake.muted && p.fake.vol < 40 && p.cls() === 'off', [p.fake.vol, p.cls()]);
  p.clock.now += 4100; await sleep(300);
  check('after 4 s: video fades in over the café screen, whole and uncropped', p.cls() === 'show' && !p.window.document.getElementById('player').style.getPropertyValue('clip-path'));
  await sleep(1800);
  check('sound reaches full volume after the 2 s fade', p.fake.vol === 100, p.fake.vol);
  check('duplicate videos in the playlist counted once', p.state().ids.length === 30);
  p.close();

  const q = makePage({ url: 'https://tv.example.com/?list=PLfromUrl' });
  await q.start();
  check('?list= in the page address overrides the playlist in SETTINGS', q.calls('cuePlaylist')[0][1] === 'PLfromUrl');
  q.close();
}

async function tHide() {
  console.log('\nKeeping YouTube\'s own screens off the TV (no crop, no zoom)');
  const p = makePage({ ids: makeIds(10) });
  await p.start(); await reveal(p, 4);
  check('song playing: picture on', p.cls() === 'show');

  p.fake.state = 2; p.fire('onStateChange', 2);
  check('paused: café screen at once (no "paused" screen, title or recommendations)', p.cls() === 'off');
  check('...and play is pressed again by itself', p.calls('play').length >= 1);
  p.fake.state = 1; p.fire('onStateChange', 1);
  await sleep(300); p.clock.now += 1000; await sleep(300);
  check('resumed: café screen stays while YouTube shows the title again', p.cls() === 'off');
  p.clock.now += 4100; await sleep(300);
  check('...video back after 4 s', p.cls() === 'show');

  const t = p.fake.getCurrentTime();
  p.fake.state = 3; p.fake.frozen = t; p.fire('onStateChange', 3);
  check('a short stall (< 0.7 s) does not blink the picture', p.cls() === 'show');
  await sleep(300); p.clock.now += 1000; await sleep(300);
  check('a longer stall: café screen instead of YouTube\'s loading spinner', p.cls() === 'off');
  p.fake.state = 1; p.fake.frozen = null; p.fire('onStateChange', 1);
  await sleep(300); p.clock.now += 500; await sleep(300);
  check('...picture back as soon as it plays (no title after a stall)', p.cls() === 'show');

  p.dur = 200; p.end(); await reveal(p, 4);
  await sleep(2000);                        // let the 2 s fade-in finish (real songs last minutes)
  const n = p.loads().length;
  p.clock.now += (200 - 11 - p.fake.getCurrentTime()) * 1000; await sleep(300);
  check('11 s before the end: video still on', p.cls() === 'show');
  p.clock.now += 600; await sleep(300);
  check('10 s before the end: café screen fades in over the video (end cards never show)', p.cls() === 'fadeout' &&
    /opacity 2s/.test(p.window.document.getElementById('brand').style.transition) && !p.window.document.getElementById('brand').classList.contains('away'));
  check('...the video itself doesn\'t fade (no fading of a video, which TV boxes can\'t draw smoothly)',
    !/opacity/.test(p.window.document.getElementById('player').style.transition) && p.window.document.getElementById('player').style.opacity === '');
  check('...while the song keeps playing at full volume', !p.fake.muted && p.fake.vol === 100);
  p.clock.now += 6800; await sleep(300);
  await sleep(1200);
  check('3.6 s before the end: sound fades out', p.fake.vol < 100 && !p.fake.muted, p.fake.vol);
  p.clock.now += 3000; await sleep(300);
  check('...then the next song, before YouTube\'s end screen and recommendations can show', p.loads().length === n + 1 && p.cls() === 'off');
  p.close();
}

async function tFades() {
  console.log('\nFades');
  const p = makePage({ html: htmlWith({ fadeIn: 2, fadeOut: 3, titleSeconds: 0 }), ids: makeIds(5) });
  await p.start(); await reveal(p);
  const samples = [];
  for (let i = 0; i < 5; i++) { samples.push(p.fake.vol); await sleep(500); }
  const rising = samples.every((v, i) => i === 0 || v >= samples[i - 1]) && samples[0] < 40 && samples[4] === 100;
  check('fade in: sound rises smoothly to full (' + samples.join(' > ') + ')', rising, samples);
  const br = p.window.document.getElementById('brand');
  check('fade in: the café screen fades away over 2 s, then is hidden (the video goes to the screen on its own)',
    br.classList.contains('away') && /opacity 2s/.test(br.style.transition) && /visibility 0s linear 2s/.test(br.style.transition), br.style.transition);
  check('...the video itself never fades', !/opacity/.test(p.window.document.getElementById('player').style.transition) && p.window.document.getElementById('player').style.opacity === '');
  p.close();

  const q = makePage({ html: htmlWith({ fadeOut: 0, titleSeconds: 0, fadeIn: 0 }), ids: makeIds(5) });
  q.dur = 200; await q.start(); await reveal(q);
  const n = q.loads().length;
  q.clock.now += (200 - 0.5 - q.fake.getCurrentTime()) * 1000; await sleep(300);
  check('fades set to 0: straight cut 0.5 s before the end', q.loads().length === n + 1);
  q.close();
}

async function tVolume() {
  console.log('\nVolume (remote up/down): this song only, then back to the settings');
  const p = makePage({ html: fast({ volume: 80 }), ids: makeIds(3), seed: 3 });
  await p.start(); await reveal(p);
  check('plays at the volume from the settings (80)', p.fake.vol === 80);
  p.key('ArrowDown');
  check('down arrow: this song 70%', p.fake.vol === 70);
  p.key('ArrowDown');
  const box = p.window.document.getElementById('vol');
  check('again: 60%, shown on screen for a moment', p.fake.vol === 60 && box.style.display === 'block' && /60%/.test(box.textContent));
  await sleep(2700);
  check('...indicator disappears by itself', box.style.display === 'none');
  p.key('ArrowUp');
  check('up arrow: 70%', p.fake.vol === 70);
  check('...and nothing about it is kept on this TV', !('vol' in p.state()));
  p.end(); await reveal(p);
  check('the next song starts at the volume from the settings again (80), whatever the remote did', p.fake.vol === 80 && p.loads().length === 2, [p.fake.vol, p.loads()]);
  p.close();

  const r = makePage({ html: fast({ songVolume: { vid0000: 50 } }), ids: makeIds(1) });
  await r.start(); await reveal(r);
  check('songVolume in SETTINGS: that song at 50% on every TV', r.fake.vol === 50);
  r.key('ArrowUp');
  check('...the remote moves it from there (60%)', r.fake.vol === 60);
  r.end(); await reveal(r);
  check('...and it is back at 50% when it plays again (a playlist of one: the same song again)', r.fake.vol === 50 && r.loads().length === 2, [r.fake.vol, r.loads()]);
  r.close();
  const s = makePage({ html: fast({ volume: 70 }), ids: makeIds(3) });
  await s.start(); await reveal(s);
  check('volume setting: everything at 70%', s.fake.vol === 70);
  s.close();
}

// A still frame w x h: `bar` black rows at the top and bottom, picture in between
function still(w, h, bar, seed = 1) {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const i = (y * w + x) * 4, v = y < bar || y >= h - bar ? 3 : 70 + (s % 150);
    px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255;
  }
  return { w, h, px };
}
// A still in one colour (a little lighter and darker here and there, every third pixel grey)
function tinted(w, h, rgb, seed = 1) {
  const px = new Uint8ClampedArray(w * h * 4);
  let s = seed;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const i = (y * w + x) * 4, k = 0.6 + (s % 40) / 100, grey = s % 3 === 0;
    px[i] = grey ? 90 : rgb[0] * k; px[i + 1] = grey ? 90 : rgb[1] * k; px[i + 2] = grey ? 90 : rgb[2] * k; px[i + 3] = 255;
  }
  return { w, h, px };
}
const colourStills = cols => u => {
  const m = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\/mq(\d)\.jpg$/.exec(u);
  return m && cols[m[1]] ? tinted(320, 180, cols[m[1]], +m[2]) : null;
};
// Medium stills (320x180) by video: black rows at top and bottom (23 = 2.39:1 film, 10 = 2:1)
const stillsFor = bars => u => {
  const m = /^https:\/\/i\.ytimg\.com\/vi\/([^/]+)\/mq(\d)\.jpg$/.exec(u);
  return m && m[1] in bars ? still(320, 180, bars[m[1]], +m[2]) : null;
};
const scale = p => { const W = p.window.innerWidth, H = p.window.innerHeight, g = geom(p); return g.s * g.h / Math.min(H, W * 9 / 16); };
const centred = p => { const g = geom(p), W = p.window.innerWidth, H = p.window.innerHeight;
  return Math.abs(g.x - (W - g.w * g.s) / 2) < 0.5 && Math.abs(g.y - (H - g.h * g.s) / 2) < 0.5; };
const near = (a, b) => Math.abs(a - b) < 0.001;

async function tZoom() {
  console.log('\nZoom per song with the remote (left/right)');
  const p = makePage({ html: FAST, ids: makeIds(1) });
  await p.start(); await reveal(p);
  check('starts whole and uncropped (100%)', near(scale(p), 1), scale(p));
  p.key('ArrowRight');
  const box = p.window.document.getElementById('vol');
  check('right arrow: zooms in one step (105%), centred, shown on screen', near(scale(p), 1.05) && centred(p) && /Zoom 105%/.test(box.textContent) && box.style.display === 'block', [scale(p), box.textContent]);
  check('...zooms smoothly while the video is on', /transform \.4s/.test(p.window.document.getElementById('player').style.transition));
  p.key('ArrowRight'); p.key('ArrowRight'); p.key('ArrowRight');
  check('steps 113, 124, 135%', near(scale(p), 1.35) && p.state().zoom.vid0000 === 135, scale(p));
  p.key('ArrowRight');
  check('135% is the most', near(scale(p), 1.35));
  p.key('ArrowLeft');
  check('left arrow: back one step (124%)', near(scale(p), 1.24) && p.state().zoom.vid0000 === 124);
  p.end();
  check('next song starts at 100%... (here the same song again, a 1-song playlist)', true);
  await reveal(p);
  check('remembered next time that song plays (this TV)', near(scale(p), 1.24), scale(p));
  const store = p.storage(); p.close();
  const q = makePage({ html: FAST, ids: makeIds(1), storage: store });
  await q.start(); await reveal(q);
  check('...even after the page reloads', near(scale(q), 1.24));
  for (let i = 0; i < 6; i++) q.key('ArrowLeft');
  check('left arrow all the way: back to 100%, never smaller', near(scale(q), 1) && q.state().zoom.vid0000 === 100);
  check('volume keys still work alongside', (q.key('ArrowDown'), q.fake.vol === 90));
  q.close();

  const r = makePage({ html: fast({ songZoom: { vid0000: 135 } }), ids: makeIds(1) });
  await r.start(); await reveal(r);
  check('songZoom in SETTINGS: that song at 135% on every TV', near(scale(r), 1.35) && centred(r));
  r.close();
}

async function tAutoZoom() {
  console.log('\nAutomatic zoom from YouTube\'s still frames');
  const bars = { vid0000: 23, vid0001: 0, vid0002: 10 };      // 2.39:1 film, no bars, 2:1
  const want = { vid0000: 1.35, vid0001: 1, vid0002: 1.14 };
  const p = makePage({ html: FAST, ids: makeIds(3), frames: stillsFor(bars) });
  await p.start();
  const first = p.loads()[0];
  check('checks the song\'s three medium stills on YouTube\'s image server',
    ['mq1', 'mq2', 'mq3'].every(k => p.frameLog.includes(`https://i.ytimg.com/vi/${first}/${k}.jpg`)), p.frameLog);
  check('...and the next song\'s, ahead of time', p.frameLog.filter(u => !u.includes('/' + first + '/')).length === 3);
  await reveal(p);
  const seen = [];
  let ready = true;
  for (let k = 0; k < 3; k++) {
    const id = p.loads().at(-1);
    if (k) ready = ready && near(scale(p), want[id]);          // already zoomed when it loads, while hidden
    if (k) await reveal(p);
    seen.push(id + ' ' + scale(p).toFixed(2));
    check(`${id} (${bars[id] ? 'black bars ' + bars[id] + ' of 180 rows' : 'no bars'}): ${Math.round(want[id] * 100)}%, centred`, near(scale(p), want[id]) && centred(p), scale(p));
    if (k < 2) p.end();
  }
  check('next songs are zoomed before they appear (checked ahead of time)', ready, seen);
  check('each song checked once (results kept on this TV)', p.frameLog.length === 9 && p.state().auto.vid0000 === 135 && p.state().auto.vid0001 === 100, p.state().auto);
  p.end(); p.end(); p.end(); await reveal(p);
  check('...no new checks in the next round', p.frameLog.length === 9);
  while (p.loads().at(-1) !== 'vid0000') { p.end(); await reveal(p); }
  p.key('ArrowLeft');
  check('remote overrides it: left arrow on a 135% song gives 124%', near(scale(p), 1.24) && p.state().zoom.vid0000 === 124);
  p.key('ArrowRight');
  check('...and right arrow goes back to the automatic 135%', near(scale(p), 1.35));
  p.close();

  const q = makePage({ html: fast({ songZoom: { vid0000: 113 } }), ids: ['vid0000'], frames: stillsFor(bars) });
  await q.start(); await reveal(q);
  check('songZoom in SETTINGS beats the automatic zoom', near(scale(q), 1.13), scale(q));
  q.close();

  const r = makePage({ html: fast({ autoZoom: false, videoColors: false }), ids: ['vid0000'], frames: stillsFor(bars) });
  await r.start(); await reveal(r);
  check('autoZoom: false (and videoColors: false): no checks, no zoom', r.frameLog.length === 0 && near(scale(r), 1));
  r.close();
  const r2 = makePage({ html: fast({ autoZoom: false }), ids: ['vid0000'], frames: stillsFor(bars) });
  await r2.start(); await reveal(r2);
  check('autoZoom: false with the song colours on: the stills are read for the colours, still no zoom', r2.frameLog.length === 3 && near(scale(r2), 1) &&
    r2.state().tint.vid0000 === 0 && r2.state().auto.vid0000 === undefined, [r2.frameLog.length, r2.state().tint]);
  r2.close();

  const s = makePage({ html: FAST, ids: makeIds(6), frames: () => null });
  await s.start(); await reveal(s);
  for (let i = 0; i < 4; i++) { s.end(); await reveal(s); }
  const n = s.frameLog.length;
  check('YouTube\'s frames can\'t be read: songs play normally at 100%', s.loads().length === 5 && near(scale(s), 1) && s.cls() === 'show');
  check('...and it stops asking after a few songs, for an hour (' + n + ' tries in all)', n >= 27 && n <= 36 && (s.end(), s.frameLog.length === n), n);
  s.clock.now += 3600e3 + 1000; s.end(); await sleep(400);
  check('...then tries again', s.frameLog.length > n);
  check('no page errors', s.errors.length === 0, s.errors);
  s.close();

  const d = makePage({ url: 'https://tv.example.com/?debug=1', ids: ['vid0000'], frames: stillsFor(bars) });
  await d.start(); await reveal(d, 4); await sleep(1100);
  const text = d.window.document.getElementById('debug').textContent;
  check('test mode shows the zoom and where it comes from', /Zoom 135% \(bars found automatically; remote left\/right to change\)/.test(text), text);
  d.close();
}


async function tAppLink() {
  console.log('\nInside the Android app: settings from GitHub, heartbeat, status');
  const app = { json: JSON.stringify({ volume: 70, titleSeconds: 0, fadeIn: 0, fadeOut: 0, _about: 'x', brandName: 'Twilight' }) };
  const p = makePage({ ids: makeIds(5), app, fetchImpl: () => Promise.resolve({ ok: true }) });
  await p.start(); await reveal(p);
  check('settings.json from the app override the page\'s SETTINGS (volume 70)', p.fake.vol === 70, p.fake.vol);
  check('...including the café name', p.window.TwilightTV.status().name === 'Twilight');
  const a0 = p.app.alive;
  for (let i = 0; i < 3; i++) { p.clock.now += 5100; await sleep(300); }
  check('tells the app it is alive every few seconds', p.app.alive - a0 >= 3, p.app.alive - a0);
  const st = p.window.TwilightTV.status();
  check('status for the phone page: song, volume, zoom, state, round', st.song && st.song.id === p.loads()[0] && st.volume === 70 &&
    st.zoom === 100 && st.state === 'playing' && st.round.total === 5 && st.songs === 5 && st.open === true, st);
  const n = p.loads().length;
  const info = p.window.TwilightTV.settingsInfo();
  check('reports the built-in defaults and the settings in use (for the phone\'s Settings screen)',
    info.defaults.volume === 100 && info.current.volume === 70 && info.defaults.brandName === 'کافتریا و ڕێستورانتی توایڵایت', info);
  p.app.json = JSON.stringify({ volume: 50, titleSeconds: 0, fadeIn: 0, fadeOut: 0, brandName: 'Twilight Café' });
  p.app.version = 2;                         // saved on the phone page (or settings.json changed)
  p.clock.now += 2100; await sleep(400);
  check('new settings take effect at once: volume 50, new café name, same song', p.fake.vol === 50 &&
    p.window.TwilightTV.status().name === 'Twilight Café' && p.loads().length === n, [p.fake.vol, p.loads().length]);
  p.app.json = JSON.stringify({ titleSeconds: 0, fadeIn: 0, fadeOut: 0 });
  p.app.version = 3;                         // a setting reset: back to the built-in value
  p.clock.now += 2100; await sleep(400);
  check('a setting removed goes back to the built-in value (volume 100, café name)', p.fake.vol === 100 &&
    p.window.TwilightTV.status().name === 'کافتریا و ڕێستورانتی توایڵایت', p.fake.vol);
  p.app.json = JSON.stringify({ playlist: 'PLanotherList', titleSeconds: 0, fadeIn: 0, fadeOut: 0 });
  p.app.version = 4;                         // a different playlist
  p.clock.now += 2100; await sleep(400);
  check('a new playlist doesn\'t cut the song that is playing', p.loads().length === n && !p.fetchLog.length, p.fetchLog);
  p.end(); await sleep(300);
  check('...it starts fresh between two songs', p.loads().length === n && p.fetchLog.some(u => u.startsWith('https://tv.example.com/')), p.fetchLog);
  p.close();

  const q = makePage({ html: FAST, ids: makeIds(3), app: { json: '{}' }, fetchImpl: () => Promise.resolve({ ok: true }) });
  await q.start(); await reveal(q);
  q.key('ArrowRight');
  check('(this TV remembers a song zoom)', Object.keys(q.state().zoom).length === 1);
  q.window.TwilightTV.command('forget'); await sleep(300);
  check('"forget": this TV\'s memory is cleared and the page starts fresh', !Object.keys(q.storage()).some(k => k.startsWith('tv-player:') && JSON.parse(q.storage()[k]).zoom && Object.keys(JSON.parse(q.storage()[k]).zoom).length) &&
    q.fetchLog.some(u => u.startsWith('https://tv.example.com/')), q.storage());
  q.close();
}

async function tCommands() {
  console.log('\nPhone control: next, pause, resume, volume, zoom, unfreeze, identify');
  const p = makePage({ html: FAST, ids: makeIds(6) });
  await p.start(); await reveal(p);
  const tv = p.window.TwilightTV, first = p.loads()[0];
  check('"next": fades out and plays another song', tv.command('next') && (await sleep(1200), p.loads().length === 2 && p.loads()[1] !== first));
  await reveal(p);
  const song = p.loads().at(-1), loads = p.loads().length;
  check('"pause": music fades out, café screen', tv.command('pause') && p.cls() === 'fadeout');
  await sleep(1800);
  check('...the video is paused, not just hidden', p.calls('pause').length === 1 && p.fake.state === 2);
  const plays = p.calls('play').length;
  p.clock.now += 120e3; await sleep(1500);
  check('...and stays paused (the watchdog doesn\'t restart it, no song change)', p.calls('play').length === plays && p.loads().length === loads && tv.status().state === 'paused');
  tv.command('resume'); await sleep(300);
  check('"resume" after a short pause: the same song carries on', p.loads().length === loads && p.calls('play').length > plays && tv.status().state !== 'paused');
  p.clock.now += 1000; await sleep(600);
  check('...picture back, sound back', p.cls() === 'show' && !p.fake.muted && p.fake.vol === 100, [p.cls(), p.fake.vol]);
  tv.command('pause'); await sleep(1800);
  p.clock.now += 3 * 3600e3 + 1000; await sleep(400);
  check('a pause ends by itself after 3 hours (next song)', p.loads().length === loads + 1 && tv.status().state !== 'paused');
  await reveal(p);
  tv.command('vol-');
  check('"vol-": this song 90%', p.fake.vol === 90 && tv.status().volume === 90);
  tv.command('zoom+');
  check('"zoom+": this song 105%', tv.status().zoom === 105);
  p.clock.now += 42e3; await sleep(300);
  const at = p.fake.getCurrentTime(), song2 = p.loads().length;
  check('"unfreeze" (picture stuck, sound playing): the same song from the same moment, a fifth of a second back, nothing else touched',
    tv.command('unfreeze') && p.calls('seek').length === 1 && Math.abs(p.calls('seek')[0][1] - (at - 0.2)) < 0.01 && p.calls('seek')[0][2] === true &&
    p.loads().length === song2 && p.cls() === 'show' && !p.fake.muted, [at, p.calls('seek'), p.cls()]);
  tv.command('pause'); await sleep(1800);
  check('...not while the music is paused (nothing to unstick)', tv.command('unfreeze') === false && p.calls('seek').length === 1, p.calls('seek'));
  tv.command('resume'); await sleep(300); p.clock.now += 1000; await sleep(600);
  tv.command('identify:TV 23');
  const box = p.window.document.getElementById('vol');
  check('"identify": the TV shows its name for a few seconds', box.textContent === 'TV 23' && box.style.display === 'block');
  check('unknown command refused', tv.command('format-c') === false);
  p.close();
}

async function tHours() {
  console.log('\nOpening hours');
  const at = (h, m = 0) => new Date(2026, 9, 10, h, m).getTime();
  const p = makePage({ html: fast({ openHours: '10:00-02:00' }), ids: makeIds(5), now: at(9, 0) });
  await p.start(); await sleep(600);
  check('09:00, before opening: music off, café screen, video paused', p.window.TwilightTV.status().state === 'closed' &&
    p.cls() !== 'show' && (await sleep(1800), p.calls('pause').length >= 1));
  const plays = p.calls('play').length, loads = p.loads().length;
  p.clock.now += 30 * 60e3; await sleep(600);
  check('...stays off (no restarts, no song changes)', p.calls('play').length === plays && p.loads().length === loads);
  p.clock.now = at(10, 0) + 5000; await sleep(11000);
  check('10:00: music starts with a new song', p.loads().length === loads + 1 && p.window.TwilightTV.status().state !== 'closed');
  await reveal(p);
  check('...and plays', p.cls() === 'show' && !p.fake.muted);
  p.clock.now = at(23, 30); await sleep(11000);
  check('23:30: still open (closes after midnight)', p.window.TwilightTV.status().open === true);
  p.clock.now = at(26, 0) + 1000; await sleep(11000);   // 02:00 next day
  check('02:00: closed again', p.window.TwilightTV.status().state === 'closed');
  p.window.TwilightTV.command('resume'); await sleep(300);
  check('staff can play anyway from the phone (for 3 hours)', p.window.TwilightTV.status().state !== 'closed' && p.loads().length === loads + 2);
  p.close();
  const q = makePage({ html: fast({ openHours: 'whenever' }), ids: makeIds(3), now: at(4, 0) });
  await q.start(); await reveal(q);
  check('unreadable opening hours: always on', q.cls() === 'show');
  q.close();
}

async function tSchedule() {
  console.log('\nVolume schedule');
  const at = (h, m = 0) => new Date(2026, 9, 10, h, m).getTime();
  const p = makePage({ html: fast({ volumeSchedule: { '10:00': 60, '18:00': 100 } }), ids: makeIds(3), now: at(11, 0) });
  await p.start(); await reveal(p); await sleep(2200);
  check('11:00: 60% of normal', p.fake.vol === 60, p.fake.vol);
  p.key('ArrowDown'); await sleep(100);
  check('...a song turned down to 90% plays at 54% (90% of 60%)', p.fake.vol === 54, p.fake.vol);
  p.clock.now = at(18, 0) + 1000; await sleep(2300);
  check('18:00: full volume again (that song at its 90%)', p.fake.vol === 90, p.fake.vol);
  p.clock.now = at(33, 0); await sleep(2300);   // 09:00 next day: before the first time, the evening value holds
  check('09:00 next morning: still the evening value until 10:00', p.fake.vol === 90, p.fake.vol);
  p.close();
}

async function tProblems() {
  console.log('\nSongs that won\'t play (list for the phone page)');
  const p = makePage({ html: FAST, ids: makeIds(1) });
  await p.start();
  const id = p.loads()[0];
  p.fire('onError', 5); await sleep(1700);
  let pr = p.window.TwilightTV.status().problems;
  check('a song that fails goes on the list, with the reason', pr.length === 1 && pr[0].id === id && /error 5/.test(pr[0].what) && pr[0].count === 1, pr);
  await reveal(p);
  pr = p.window.TwilightTV.status().problems;
  check('...and comes off it once it plays fine', pr.length === 0, pr);
  p.fire('onError', 150); await sleep(300);
  pr = p.window.TwilightTV.status().problems;
  check('blocked on other sites: explained in plain words', pr.length === 1 && /doesn't allow it on other sites/.test(pr[0].what), pr);
  check('...kept after a reload', JSON.parse(Object.values(p.storage())[0]).problems[id].n === 1);
  p.close();
}


async function tQualitySetup() {
  console.log('\nQuality setup (YouTube\'s own controls, to pick the highest quality by hand)');
  const p = makePage({ url: 'https://tv.example.com/index.html?list=PLtest&setup=quality', ids: makeIds(3) });
  await p.start(); await sleep(400);
  const doc = p.window.document;
  check('YouTube\'s own controls are on', p.fake.o.playerVars.controls === 1, p.fake.o.playerVars);
  check('nothing covers the player, so clicks reach YouTube\'s gear', doc.getElementById('shield').style.display === 'none');
  check('the video shows straight away, with sound', p.cls() === 'show' && !p.fake.muted && p.fake.vol === 100, [p.cls(), p.fake.vol]);
  check('short instructions at the top (pointer, OK, gear, Quality, Back)', doc.getElementById('setupNote').style.display === 'block' &&
    /arrow buttons/.test(doc.getElementById('setupNote').textContent) && /gear/.test(doc.getElementById('setupNote').textContent) && /Back/.test(doc.getElementById('setupNote').textContent));
  const pl = doc.getElementById('player');
  const W = p.window.innerWidth, H = p.window.innerHeight, pw = parseFloat(pl.style.width), ph = parseFloat(pl.style.height);
  const m = /translate\(([\d.]+)px, ([\d.]+)px\) scale\(1\)$/.exec(pl.style.transform);
  check('the player nearly screen size, centred, not zoomed: YouTube\'s controls full size, clear of the TV\'s edges',
    Math.abs(pw - 0.9 * Math.min(W, H * 16 / 9)) < 0.5 && m && Math.abs(+m[1] - (W - pw) / 2) < 0.5 && Math.abs(+m[2] - (H - ph) / 2) < 0.5,
    [pl.style.width, pl.style.height, pl.style.transform]);
  check('the instructions say to click the video for YouTube\'s controls', /click the video once/.test(doc.getElementById('setupNote').textContent));
  p.clock.now += 2000; await sleep(400);
  check('after a moment the video pauses, so YouTube keeps its controls on screen', p.calls('pause').length === 1 && p.fake.state === 2);
  p.fire('onPlaybackQualityChange', 'hd1080'); await sleep(600);
  const st = doc.getElementById('setupStatus').textContent;
  check('a status line: which YouTube player, paused or playing, and the picture quality', /computer version of YouTube's player, video paused, picture 1080p/.test(st), st);
  p.fake.playVideo(); p.clock.now += 3000; await sleep(400);
  check('...only once: if someone plays it again, it keeps playing', p.calls('pause').length === 1);
  p.key('ArrowDown'); p.key('ArrowRight');
  check('the remote\'s arrows don\'t change volume or zoom during setup', p.fake.vol === 100 && !p.state().vol && !Object.keys(p.state().zoom).length);
  const plays = p.calls('play').length;
  p.fake.state = 2; p.fire('onStateChange', 2); await sleep(300);
  check('nothing is covered or restarted while someone uses YouTube\'s menu', p.cls() === 'show' && p.calls('play').length === plays);
  const n = p.loads().length;
  p.fake.state = 0; p.clock.now += 3000; await sleep(400);
  check('at the end of a song, the next one plays', p.loads().length === n + 1 && p.cls() === 'show');
  p.close();
  const q = makePage({ ids: makeIds(3) });
  await q.start();
  check('normal mode: no controls, covered, no instructions', q.fake.o.playerVars.controls === 0 &&
    q.window.document.getElementById('shield').style.display !== 'none' && q.window.document.getElementById('setupNote').style.display !== 'block');
  check('normal mode: the player drawn at the automatic quality (1080 lines) and scaled to fit', q.window.document.getElementById('player').style.width === '1920px',
    q.window.document.getElementById('player').style.width);
  q.close();
}

async function tShuffle() {
  console.log('\nShuffle, rounds and no recent repeats (50 songs, 1000 plays)');
  const p = makePage({ ids: makeIds(50) });
  await p.start();
  for (let i = 0; i < 999; i++) p.end();
  const seq = p.loads();
  let roundsOk = true, newOrders = 0;
  for (let r = 0; r < 20; r++) {
    const round = seq.slice(r * 50, r * 50 + 50);
    if (new Set(round).size !== 50) roundsOk = false;
    if (r > 0 && round.join() !== seq.slice((r - 1) * 50, r * 50).join()) newOrders++;
  }
  check('1000 songs; each round plays all 50 once, in a new order', seq.length === 1000 && roundsOk && newOrders === 19);
  const last = {}; let minGap = Infinity;
  seq.forEach((id, i) => { if (id in last) minGap = Math.min(minGap, i - last[id] - 1); last[id] = i; });
  check('a song never returns within 16 songs; closest was ' + minGap, minGap >= 16);
  p.close();
}

async function tSmall() {
  console.log('\nSmall playlists');
  for (const n of [1, 2, 3]) {
    const p = makePage({ ids: makeIds(n) });
    await p.start();
    for (let i = 0; i < 59; i++) p.end();
    const seq = p.loads();
    let twice = 0; for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) twice++;
    if (n === 1) check('1 song: just keeps playing it', seq.length === 60 && twice === 59);
    else check(n + ' songs: never the same song twice in a row', twice === 0, twice);
    p.close();
  }
}

async function tReload() {
  console.log('\nPage reloads');
  const ids = makeIds(50);
  const a = makePage({ ids });
  await a.start();
  for (let i = 0; i < 29; i++) a.end();
  const seqA = a.loads(), store = a.storage(); a.close();
  const b = makePage({ ids, storage: store, now: a.clock.now + 60e3 });
  await b.start();
  for (let i = 0; i < 39; i++) b.end();
  const seqB = b.loads();
  check('after a mid-round reload only the 20 unplayed songs come next', new Set(seqB.slice(0, 20)).size === 20 && seqB.slice(0, 20).every(id => !seqA.includes(id)));
  check('new round does not open with the songs that just played', seqB.slice(20, 36).every(id => !seqB.slice(4, 20).includes(id)));
  b.close();
}

async function tBadVideos() {
  console.log('\nVideos that refuse to play');
  const p = makePage({ html: fast({ refreshHours: 0 }), ids: makeIds(10) });
  await p.start(); await reveal(p);
  const bad = p.loads()[0];
  p.fire('onError', 150);
  check('error screen never shown (black at once)', p.cls() === 'off');
  check('skipped after 1.5 s and remembered', await waitFor(() => p.loads().length === 2, 3000) && !!p.state().bad[bad]);
  for (let i = 0; i < 40; i++) p.end();
  check('not tried again the same day', !p.loads().slice(1).includes(bad));
  p.clock.now += 25 * 3600e3;
  for (let i = 0; i < 20; i++) p.end();
  check('gets another chance after a day', p.loads().slice(-20).includes(bad));
  p.close();
}

async function tOddErrors() {
  console.log('\nRepeated player errors');
  const p = makePage({ ids: makeIds(10) });
  await p.start();
  for (let i = 0; i < 4; i++) { p.fire('onError', 5); await waitFor(() => p.loads().length === i + 2, 3000); }
  p.fire('onError', 5);
  await sleep(2000);
  check('4 errors skip a song each; the 5th waits for a reload', p.loads().length === 5, p.loads().length);
  p.close();
  const q = makePage({ ids: makeIds(10), playlistDelay: 1200 });
  q.window.onYouTubeIframeAPIReady();
  await waitFor(() => q.calls('cuePlaylist').length === 1, 2000);
  q.fire('onError', 153);
  const note = q.window.document.getElementById('note');
  check('error 153 shows a hint to open it from a web address', note.style.display === 'block' && /153/.test(note.innerHTML));
  q.close();
}

async function tUnstoppable() {
  console.log('\nCan\'t be stopped');
  const p = makePage({ html: FAST, ids: makeIds(10) });
  await p.start(); await reveal(p);
  const n0 = p.calls('play').length;
  p.fire('onStateChange', 2);
  p.fire('onStateChange', 2);
  check('a pause is undone immediately (at most once a second)', p.calls('play').length === n0 + 1);
  const k = p.loads().length;
  p.clock.now += 3000; p.fire('onStateChange', 0); p.fire('onStateChange', 0);
  check('a doubled "ended" event skips only one song', p.loads().length === k + 1);
  p.dur = 1e9; p.end();
  for (let s = 1; s <= 2; s++) {
    const m = p.loads().length;
    p.fake.state = 3; p.fake.frozen = 0;
    await sleep(300); p.clock.now += 91e3;
    check('stuck loading for 90 s -> next song (#' + s + ')', await waitFor(() => p.loads().length === m + 1, 2000));
  }
  const m = p.loads().length;
  p.fake.state = 3; p.fake.frozen = 0;
  await sleep(300); p.clock.now += 91e3; await sleep(600);
  check('3rd stuck video in a row -> reloads the page instead', p.loads().length === m && p.fetchLog.includes(p.window.location.href));
  p.close();
}

async function tSound() {
  console.log('\nSound blocked by the TV\'s browser');
  const p = makePage({ html: FAST, ids: makeIds(10) });
  await p.start(); await reveal(p);
  const icon = () => p.window.document.getElementById('muted').style.display;
  p.fire('onAutoplayBlocked');
  check('sound refused: keeps playing muted, small muted-speaker icon', p.fake.muted && icon() === 'block');
  p.end(); await reveal(p);
  check('next song within 10 min: stays muted', p.fake.muted && icon() === 'block');
  p.clock.now += 10 * 60e3;
  p.end(); await reveal(p);
  check('after 10 min: tries sound again by itself', !p.fake.muted && icon() !== 'block');
  p.fire('onAutoplayBlocked');
  p.key('Enter');
  check('one tap / OK press: sound on and icon gone', !p.fake.muted && p.fake.vol === 100 && icon() !== 'block');
  p.close();

  const q = makePage({ ids: makeIds(10) });
  await q.start();
  q.fire('onAutoplayBlocked');
  const note = q.window.document.getElementById('note');
  q.fake.state = -1; q.fake.frozen = 0;
  await sleep(300); q.clock.now += 20e3; await sleep(400);
  check('browser blocks even silent video: says "tap once", doesn\'t race through songs', /Tap the screen once/.test(note.innerHTML) && q.loads().length === 1);
  q.close();
}

async function tAds() {
  console.log('\nAds');
  const p = makePage({ html: FAST, ids: makeIds(20) });
  await p.start(); await reveal(p);
  p.end();
  const n = p.loads().length;
  p.fake.ad = true; p.fake.frozen = 0;
  let seen = false;
  await sleep(300);
  for (let i = 0; i < 7; i++) { p.clock.now += 1000; await sleep(260); if (p.cls() === 'show' || !p.fake.muted) seen = true; }
  check('ad before a song: never shown or heard, song skipped', !seen && p.loads().length === n + 1);
  await reveal(p);
  const mid = p.loads().length;
  p.fake.ad = true; p.fake.frozen = p.fake.getCurrentTime();
  await sleep(300); p.clock.now += 3000; await sleep(300);
  check('ad in the middle: blacked out and muted', p.cls() === 'off' && p.fake.muted);
  p.fake.ad = false; p.fake.frozen = null;
  await sleep(300); p.clock.now += 1000; await sleep(300);
  check('...song comes back when the ad ends', p.cls() === 'show' && !p.fake.muted && p.loads().length === mid);
  p.end();
  const slow = p.loads().length;
  p.fake.state = 3; p.fake.frozen = 0;
  await sleep(300); p.clock.now += 20e3; await sleep(400);
  check('slow loading (20 s) is waited for, not skipped', p.loads().length === slow);
  p.close();

  const q = makePage({ html: FAST, ids: makeIds(20) });
  await q.start();
  for (let i = 0; i < 6; i++) { q.fake.ad = true; q.fake.frozen = 0; await sleep(300); q.clock.now += 6500; await sleep(400); }
  const k = q.loads().length;
  q.fake.ad = true; q.fake.frozen = 0;
  await sleep(300); q.clock.now += 8000; await sleep(400);
  check('6 ad-skips in a row: blocking pauses so music keeps playing (never stuck black)', k === 7 && q.loads().length === 7, [k, q.loads().length]);
  q.close();
}

async function tSubtitles() {
  console.log('\nSubtitles');
  const p = makePage({ html: FAST, ids: makeIds(5) });
  await p.start(); await reveal(p);
  check('turned off when a song starts', p.calls('setOption').some(c => c[1] === 'captions' && c[3] === '{}') && p.calls('unloadModule').some(c => c[1] === 'captions'));
  const before = p.calls('unloadModule').length;
  p.fire('onApiChange');
  check('...and whenever YouTube loads its captions again', p.calls('unloadModule').length > before);
  p.close();
}

async function tCutEnding() {
  console.log('\nCutting the end (for end cards)');
  const p = makePage({ html: fast({ cutEnding: 15 }), ids: makeIds(5) });
  await p.start();
  p.dur = 200; p.end(); await reveal(p);
  const n = p.loads().length;
  p.clock.now += 183e3; await sleep(400);
  check('16 s left: still playing', p.loads().length === n);
  p.clock.now += 1600; await sleep(400);
  check('15 s before the end: next song', p.loads().length === n + 1);
  p.close();
}

async function tRefresh() {
  console.log('\nPlanned refresh every 12 h');
  const p = makePage({ ids: makeIds(10) });
  await p.start();
  p.clock.now += 12 * 3600e3 + 1000;
  const n = p.loads().length;
  p.fire('onStateChange', 0);
  check('checks the page address first, keeps playing if it doesn\'t answer', p.fetchLog[0] === p.window.location.href && await waitFor(() => p.loads().length === n + 1, 500));
  p.clock.now += 15 * 60e3 + 3000;
  p.fetchImpl = () => Promise.resolve({ ok: true });
  p.fire('onStateChange', 0);
  await sleep(50);
  check('reloads when it answers', p.errors.some(e => /not implemented/i.test(e)));
  p.close();
}

async function tApiKey() {
  console.log('\nOptional API key for big playlists');
  const html = htmlWith({ apiKey: 'KEY123' });
  const all = makeIds(240), pages = {};
  for (let i = 0; i < 240; i += 50) pages[i ? 'T' + i : ''] = [all.slice(i, i + 50), i + 50 < 240 ? 'T' + (i + 50) : undefined];
  const p = makePage({ html, ids: null, fetchImpl: u => {
    const [items, next] = pages[new URL(u).searchParams.get('pageToken') || ''];
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: items.map(v => ({ contentDetails: { videoId: v } })), nextPageToken: next }) });
  } });
  await p.start();
  for (let i = 0; i < 239; i++) p.end();
  check('reads all 240 videos (more than 200) and plays them all', p.fetchLog.length === 5 && new Set(p.loads()).size === 240);
  p.close();
}

function geom(p) {
  const el = p.window.document.getElementById('player');
  const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(el.style.transform);
  return { w: parseFloat(el.style.width), h: parseFloat(el.style.height), x: +m[1], y: +m[2], s: +m[3], clip: el.style.getPropertyValue('clip-path') };
}

async function tLook() {
  console.log('\nPicture: drawn at the quality\'s size, fitted exactly to the stage (no crop, no zoom)');
  // [screen, dpr, info panel, quality setting, the app says the box draws on its processor, lines wanted]
  const cases = [[[1920, 1080], 1, true, null, false, 1080], [[1280, 720], 1, true, null, false, 1080], [[3840, 2160], 1, true, null, false, 1080],
                 [[960, 540], 2, true, null, false, 1080], [[1080, 1920], 1, true, null, false, 1080], [[1920, 1080], 1, false, null, false, 1080],
                 [[1920, 1080], 1, true, 2160, false, 2160], [[1920, 1080], 1, false, 1440, false, 1440], [[1920, 1080], 1, true, 720, false, 720],
                 [[1920, 1080], 1, true, null, true, 720], [[1920, 1080], 1, true, 'auto', true, 720], [[1920, 1080], 1, true, 1080, true, 1080],
                 [[3840, 2160], 2, false, 'auto', false, 1080]];
  for (const [[W, H], dpr, panel, quality, soft, lines] of cases) {
    const changes = { infoPanel: panel };
    if (quality !== null) changes.quality = quality;
    const p = makePage({ html: htmlWith(changes), ids: makeIds(3), size: [W, H], dpr,
                         app: soft ? { json: '{}', x: JSON.stringify({ box: { softDraw: true } }), xv: 2 } : undefined });
    await p.start();
    if (soft) await waitFor(() => Math.abs(geom(p).h * dpr - lines) < 0.5, 3000);
    const g = geom(p), st = p.window.document.getElementById('stage');
    const wide = panel && W >= H * 1.5;
    const u = Math.min(W / 1920, H / 1080), sw = wide ? Math.round(1280 * u) : W, sh = wide ? Math.round(720 * u) : H;
    const shownW = g.w * g.s, shownH = g.h * g.s;
    const ok = Math.abs(g.h * dpr - lines) < 0.5 && !g.clip && Math.abs(shownW - sw) < 0.5 && shownH <= sh + 0.5 &&
      Math.abs(g.x) < 0.5 && Math.abs(g.y - (sh - shownH) / 2) < 0.5 && st.style.width === sw + 'px' && st.style.height === sh + 'px';
    check(`${W}x${H}@${dpr}x ${wide ? 'with the info panel' : 'full screen'}, quality ${quality === null ? 'built-in' : quality}${soft ? ', box draws on its processor' : ''}: ` +
          `player ${Math.round(g.h * dpr)}p, whole picture shown at ${Math.round(shownW)}x${Math.round(shownH)}`, ok, [g, st.style.width, st.style.height]);
    p.close();
  }
}

async function tCorners() {
  console.log('\nThe video card: square, its rounded corners painted over the video (so it can be its own layer)');
  for (const [dir, labels] of [['ltr', {}], ['rtl', { locale: 'ckb' }]]) {
    const p = makePage({ html: htmlWith({ infoPanel: true, labels }), ids: makeIds(3), size: [1920, 1080] });
    await p.start();
    await waitFor(() => p.window.document.documentElement.dir === dir, 3000);
    const d = p.window.document, st = d.getElementById('stage'), back = d.getElementById('stageBack');
    const corners = ['tl', 'tr', 'bl', 'br'].map(k => d.querySelector('#stage .corner.' + k + ' .ca'));
    const css = [...d.querySelectorAll('style')].map(e => e.textContent).join('\n');
    check(`${dir}: the card's back (shadow, rounded edge) exactly behind the video, at ${st.style.left}`,
      back.style.left === st.style.left && back.style.top === st.style.top && back.style.width === st.style.width && back.style.height === st.style.height &&
      st.style.left === (dir === 'rtl' ? '600px' : '40px'), [back.style.cssText, st.style.cssText]);
    check(`${dir}: four corners painted, each a ring and the colour behind the card`,
      corners.every(c => c && /radial-gradient\(circle at [^,]+, transparent 17\.5px, rgb\(\d+, \d+, \d+\) 18\.5px/.test(c.style.background)),
      corners.map(c => c && c.style.background));
    check(`${dir}: nothing cuts the video to a rounded shape (no border-radius on the stage)`,
      !/#stage\s*\{[^}]*border-radius/.test(css) && !/body\.with-panel #stage\s*\{[^}]*border-radius/.test(css));
    p.close();
  }
}

async function tQualityAsk() {
  console.log('\nAsking YouTube for the top stream');
  const p = makePage({ html: FAST, ids: makeIds(5) });
  p.levels = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'auto'];
  await p.start(); await reveal(p);
  check('built-in (automatic): asks for 1080p, though YouTube lists 4K', p.calls('qrange')[0] && p.calls('qrange')[0][1] === 'hd1080', p.calls('qrange')[0]);
  p.close();
  const q = makePage({ html: htmlWith({ quality: 2160 }, FAST), ids: makeIds(5) });
  q.levels = ['hd2160', 'hd1440', 'hd1080', 'auto'];
  await q.start(); await reveal(q);
  check('quality 2160: requests 4K when YouTube lists it', q.calls('qrange')[0] && q.calls('qrange')[0][1] === 'hd2160', q.calls('qrange')[0]);
  q.close();
  const r = makePage({ html: FAST, ids: makeIds(5), app: { json: '{}', x: JSON.stringify({ box: { softDraw: true } }), xv: 2 } });
  r.levels = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'auto'];
  await r.start(); await reveal(r);
  const asks = r.calls('qrange').map(c => c[1]);
  check('a box that draws on its processor: 720p', asks.length > 0 && asks[asks.length - 1] === 'hd720', asks);
  r.close();
  const t = makePage({ html: htmlWith({ quality: 1440 }, FAST), ids: makeIds(5) });
  t.levels = ['hd1080', 'hd720', 'auto'];
  await t.start(); await reveal(t);
  check('quality 1440 when YouTube only has 1080p (H.264): 1080p', t.calls('qrange')[0] && t.calls('qrange')[0][1] === 'hd1080', t.calls('qrange')[0]);
  t.close();
}

async function tFullscreen() {
  console.log('\nFull screen and staying awake');
  const p = makePage({ ids: makeIds(5) });
  await p.start();
  const n = p.fsCalls;
  p.window.document.getElementById('shield').dispatchEvent(new p.window.MouseEvent('click', { bubbles: true }));
  check('asks for full screen at start and on a tap; asks the screen to stay awake', n >= 1 && p.fsCalls > n && p.wakeCalls >= 1);
  p.close();
}

async function tRealPlaylist() {
  const REAL = 'PL_6oD4DKbNOvlb8kOY9APBXjC_EtR6eYK';
  console.log('\nYour playlist: ' + REAL + ' (138 videos)');
  const ids = makeIds(138, 'yt');
  const p = makePage({ url: 'https://hosted-website.optisigns.com/62c703f3cf5c1b001536c8eb/', ids });
  await p.start();
  check('the link saved in the file opens your playlist', p.calls('cuePlaylist')[0][1] === REAL);
  for (let i = 0; i < 138 * 10 - 1; i++) p.end();
  const seq = p.loads();
  let ok = seq.length === 1380;
  for (let r = 0; r < 10; r++) if (new Set(seq.slice(r * 138, r * 138 + 138)).size !== 138) ok = false;
  const last = {}; let minGap = Infinity;
  seq.forEach((id, i) => { if (id in last) minGap = Math.min(minGap, i - last[id] - 1); last[id] = i; });
  check('10 rounds of all 138 songs; closest repeat had ' + minGap + ' songs between', ok && minGap >= 20);
  p.close();
}

async function tDebug() {
  console.log('\nTest mode (?debug=1)');
  const p = makePage({ url: 'https://tv.example.com/?debug=1', ids: makeIds(138, 'yt') });
  await p.start(); await reveal(p, 4);
  p.fire('onPlaybackQualityChange', 'hd2160');
  await sleep(3300);
  const text = p.window.document.getElementById('debug').textContent;
  console.log(text.split('\n').map(l => '         | ' + l).join('\n'));
  check('shows song, picture, sound, volume, quality, ads, subtitles, fades', /138 videos/.test(text) && /picture show/.test(text) &&
    /Sound on at 100%/.test(text) && /this song's volume 100%/.test(text) && /2160p/.test(text) && /Ad blocking on/.test(text) && /fade in 2s \/ out 3s/.test(text), text);
  p.close();
}

async function tSlowYouTube() {
  console.log('\nYouTube never hands over the playlist (waits ~20 s)');
  const ids = makeIds(12);
  const a = makePage({ ids });
  await a.start();
  const store = a.storage(); a.close();
  const b = makePage({ ids: null, storage: store });
  const okB = await b.start(26000);
  check('uses the last playlist it saw and keeps playing', okB && ids.includes(b.loads()[0]));
  b.close();
}

async function tBrand() {
  console.log('\nCafé screen');
  const p = makePage({ html: FAST, ids: makeIds(5) });
  const look = p.window.document.getElementById('look');
  check('the café\'s own picture (looks/cafe.jpg), nothing written over it', look.getAttribute('src') === 'looks/cafe.jpg' &&
    p.window.document.getElementById('brandNote').textContent === '' && !p.window.document.getElementById('brandName'), look.getAttribute('src'));
  check('the café name\'s font is still built into the page (for under the video when no music plays)',
    /@font-face\s*\{\s*font-family:\s*"TwilightName";\s*src:\s*url\(data:font\/woff2;base64,/.test(BASE_HTML));
  check('nothing on the café screen moves (no animations left)', !/@keyframes\s+(breathe|flicker|burst)/.test(BASE_HTML) && !/<svg[^>]*preserveAspectRatio="xMidYMid slice"/.test(BASE_HTML));
  check('café screen lies over the video (above it, fading away to show it)', /#brand \{[^}]*z-index: 2;/.test(BASE_HTML) && /#player \{[^}]*z-index: 1;/.test(BASE_HTML)
    && /#brand\.away \{ opacity: 0; visibility: hidden; \}/.test(BASE_HTML) && !/#player \{[^}]*opacity/.test(BASE_HTML));
  await p.start();
  check('starting up: café screen showing', !p.window.document.body.classList.contains('video-on'));
  await reveal(p);
  check('video playing: café screen away', p.window.document.body.classList.contains('video-on') && p.window.document.getElementById('brand').classList.contains('away'));
  p.fire('onError', 150);
  check('video refuses to play: café screen instead of YouTube\'s error', !p.window.document.body.classList.contains('video-on'));
  p.close();
  const q = makePage({ html: htmlWith({ playlist: 'PASTE_YOUR_PLAYLIST_LINK_HERE', brandName: 'Twilight' }), url: 'https://tv.example.com/' });
  await sleep(50);
  check('the café\'s picture even before a playlist is set', q.window.document.getElementById('look').getAttribute('src') === 'looks/cafe.jpg');
  q.close();
}

// The test version with Firefox's engine: the app serves the page with bridge.js put in, and
// the page checks in with the app every second over HTTP (a stand-in for the app here).
async function tBridge() {
  console.log('\nThe link to the app in the Firefox-engine version (bridge.js, over HTTP)');
  const http = require('http');
  const bridge = fs.readFileSync(path.join(ASSETS, 'tv', 'bridge.js'), 'utf8');
  const app = { version: 1, settings: JSON.stringify({ brandName: 'Bridge Café', volume: 70 }), syncs: [], cmds: [], wrongKey: 0,
                xv: 5, x: JSON.stringify({ titles: { tvsong_0000: ['Hama Jaza - Shaw', 'Hama Jaza'] }, pictures: [] }) };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      if (req.method !== 'POST' || u.pathname !== '/tv/sync') { res.writeHead(404); res.end(); return; }
      if (u.searchParams.get('k') !== 'key123') { app.wrongKey++; res.writeHead(403); res.end(); return; }
      const inb = JSON.parse(body || '{}');
      app.syncs.push(inb);
      const out = { v: app.version, cmds: app.cmds.splice(0) };
      if (inb.v !== app.version) out.s = app.settings;
      if (inb.xv !== app.xv) { out.xv = app.xv; out.x = app.x; app.xSent = (app.xSent || 0) + 1; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const boot = { k: 'key123', v: app.version, s: app.settings, xv: app.xv, x: app.x };
  const html = FAST.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<script>\nwindow.TWILIGHT_BOOT = ' +
    JSON.stringify(boot).replace(/</g, '\\u003c') + ';\n' + bridge.replace(/<\/script/g, '<\\/script') + '\n</script>\n');
  const p = makePage({ html, url: `http://localhost:${port}/tv/index.html?k=key123`, ids: makeIds(5, 'tvsong_') });
  const doc = p.window.document;
  check('the settings the app put in the page are used from the start (café name)', p.window.TwilightTV.status().name === 'Bridge Café');
  check('...and the extras (song names, weather, pictures)', p.window.TwilightApp.extrasVersion() === 5 && JSON.parse(p.window.TwilightApp.extras()).titles.tvsong_0000[0] === 'Hama Jaza - Shaw');
  await p.start();
  check('the page plays as usual', p.loads().length === 1);
  await waitFor(() => app.syncs.some(x => x.status && x.status.song), 4000);
  const first = app.syncs.find(x => x.status && x.status.song);
  check('it checks in with the app: what it is doing (song, playlist)', first && first.status.songs === 5 && first.status.song.id === p.loads()[0], first && first.status);
  check('...the built-in values for the phone\'s Settings screen, once', app.syncs.filter(x => x.info).length === 1 && app.syncs.find(x => x.info).info.defaults.brandName !== undefined);
  check('...about once a second', await waitFor(() => app.syncs.length >= 3, 4000), app.syncs.length);
  p.clock.now += 6000; await sleep(1500);
  check('...and says it\'s alive (for the frozen-page watchdog)', app.syncs.some(x => x.alive === true));
  app.version = 2; app.settings = JSON.stringify({ brandName: 'Twilight Changed', volume: 70 });
  await waitFor(() => app.syncs.length && app.syncs[app.syncs.length - 1].v === 2, 4000);
  p.clock.now += 3000; await sleep(800);
  check('settings changed on the phone reach the page and are used straight away', p.window.TwilightTV.status().name === 'Twilight Changed', p.window.TwilightTV.status().name);
  const n = p.loads().length;
  app.cmds.push('next');
  await waitFor(() => p.loads().length > n, 4000);
  check('a command from the phone (next song) reaches the page and is done', p.loads().length === n + 1);
  app.cmds.push('pause');
  await sleep(2000);
  check('...pause too', p.window.TwilightTV.status().state !== undefined && p.window.TwilightTV.status().holdUntil > 0, p.window.TwilightTV.status().state);
  const withIds = app.syncs.filter(x => x.ids);
  check('the page tells the app its songs (for their names) once, not every second', withIds.length === 1 && withIds[0].ids.length === 5 && withIds[0].ids[0] === 'tvsong_0000',
    withIds.map(x => x.ids.length));
  p.window.TwilightTV.command('playnext:dQw4w9WgXcQ');
  await waitFor(() => app.syncs.filter(x => x.ids).length === 2, 4000);
  check('...and again when a song from a link joins them', app.syncs.filter(x => x.ids)[1].ids.includes('dQw4w9WgXcQ'));
  app.xv = 6; app.x = JSON.stringify({ titles: {}, pictures: ['pic0000001'] });
  await waitFor(() => p.window.TwilightApp.extrasVersion() === 6, 4000);
  check('new extras from the app (a picture added on the phone) reach the page', JSON.parse(p.window.TwilightApp.extras()).pictures[0] === 'pic0000001');
  const sent = app.xSent, n0 = app.syncs.length;
  await waitFor(() => app.syncs.length >= n0 + 2, 4000);
  check('...sent only when they changed', app.xSent === sent && app.syncs.slice(n0).every(x => x.xv === 6), [app.xSent, sent]);
  check('the right key every time', app.wrongKey === 0, app.wrongKey);
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();
  server.close();
}


/* ===================== the info panel and the new music features ===================== */

const jsQR = require('jsqr');
const at = (y, mo, d, h = 12, mi = 0, se = 0) => new Date(y, mo - 1, d, h, mi, se).getTime();
const txt = (p, id) => p.window.document.getElementById(id).textContent;
const shown = (p, id) => { const e = p.window.document.getElementById(id); return !!e && !e.hidden && !e.closest('[hidden]'); };
const css = (p, name) => p.window.document.documentElement.style.getPropertyValue(name);

// Reads a QR code drawn by the page (its SVG path) the way a phone camera would
function readQr(svgHtml) {
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(svgHtml), d = /d="([^"]*)"/.exec(svgHtml);
  if (!vb || !d) return null;
  const n = +vb[1], S = 8, W = n * S + 16 * S, data = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let i = 0; i < W * W; i++) { data[i * 4] = 255; data[i * 4 + 1] = 241; data[i * 4 + 2] = 224; }   // the cream card, and room around it
  const re = /M(\d+) (\d+)h(\d+)v1h-\d+z/g; let m;
  while ((m = re.exec(d[1]))) {
    const x0 = +m[1], y = +m[2], run = +m[3];
    for (let x = x0; x < x0 + run; x++) for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
      const px = ((y * S + yy + 8 * S) * W + (x * S + xx + 8 * S)) * 4;
      data[px] = 11; data[px + 1] = 16; data[px + 2] = 48;
    }
  }
  const r = jsQR(data, W, W);
  return r ? r.data : null;
}

const RANYA_TITLES = {
  aaaaaaaaaa1: ['Hama Jaza - Shaw (Official Video) [4K]', 'Hama Jaza'],
  aaaaaaaaaa2: ['Zakaria Abdulla - Gyan | زەکەریا عەبدوڵڵا', 'Zakaria Official'],
  aaaaaaaaaa3: ['Nasr Razi ft. Hama Jaza - Bahar (Lyrics)', 'Kurdmax Music'],
  aaaaaaaaaa4: ['Dilan', 'Rebaz Music'],
};

const WIFI_QR = 'WIFI:T:WPA;S:Twilight Café;P:pa\\;ss\\:\\"x\\"\\\\2026;;';
async function tPanel() {
  console.log('\nThe frame around the video (1920x1080): the video card, what\'s playing, clock, date, weather, QR codes, tirezh.com prices');
  const now = at(2026, 10, 11, 21, 47, 10);
  const ids = Object.keys(RANYA_TITLES);
  const weather = { at: now - 600e3, source: 'met', hours: [] };
  for (let h = -1; h < 30; h++) {
    const t = at(2026, 10, 11, 21) + h * 3600e3;
    weather.hours.push([t, h === 0 ? 18.4 : h === 6 ? -2.4 : 16, h === 0 ? 'partlycloudy_night' : 'clearsky_day']);
  }
  const prices = { at: at(2026, 10, 11, 20, 37), fetched: now - 120e3,
    currencies: [['us', 'دۆلار', 164250, 165250, 1], ['eu', 'یۆرۆ', 111.6, 112.25, -1], ['ir', 'تمەنی ئێرانی', 26000000, 23600000, 1]],
    gold: [[24, 1035629, 'زێڕی ٢٤', 0, 1], [21, 906175, 'زێڕی ٢١', 884175, -1], [18, 776722, 'زێڕی ١٨', 754102, 0]],
    ounce: [4184.6, -1], silver: [60.86, 1] };
  const settings = {
    titleSeconds: 0, fadeIn: 0, fadeOut: 0,
    menuUrl: 'https://twilight.example/menu?table=4&lang=ckb', wifiName: 'Twilight Café', wifiPassword: 'pa;ss:"x"\\2026', messages: []
  };
  const app = { json: JSON.stringify(settings), x: JSON.stringify({ titles: RANYA_TITLES, weather, pictures: [], prices }), xv: 3 };
  const p = makePage({ ids, size: [1920, 1080], now, app, seed: 7 });
  const doc = p.window.document, stage = doc.getElementById('stage');
  await sleep(60);
  check('the panel is on: the video is a 1280x720 card at the top left (40, 40)',
    doc.body.classList.contains('with-panel') && stage.style.width === '1280px' && stage.style.height === '720px' && stage.style.left === '40px' &&
    stage.style.top === '40px' && css(p, '--u') === '1px', [stage.style.left, stage.style.top, stage.style.width, stage.style.height]);
  check('English: left to right', doc.documentElement.dir === 'ltr', doc.documentElement.dir);
  check('the clock, 12-hour: 9:47 PM, before YouTube has even started', txt(p, 'time') === '9:47' && txt(p, 'ampm') === 'PM', txt(p, 'time') + ' ' + txt(p, 'ampm'));
  check('the day and date, and the Hijri date (30 Rabiʻ II 1448, as on Aladhan)', txt(p, 'date') === 'Sunday 11 October 2026' &&
    /30 Rabiʻ II 1448/.test(txt(p, 'hijri')), [txt(p, 'date'), txt(p, 'hijri')]);
  check('the weather in one line: picture, 18°, partly cloudy, Ranya', shown(p, 'weather') && txt(p, 'temp') === '18°' && txt(p, 'wwords') === 'Partly cloudy' &&
    txt(p, 'wplace') === 'Ranya' && /<path/.test(doc.getElementById('wicon').innerHTML), [txt(p, 'temp'), txt(p, 'wwords'), txt(p, 'wplace')]);
  check('...credited to MET Norway, in small (their condition for the free data)', txt(p, 'credit') === 'MET Norway', txt(p, 'credit'));
  const tiles = () => [...doc.querySelectorAll('#tiles li')].map(li => [li.querySelector('.tn').textContent, li.querySelector('.tv').textContent,
    li.querySelector('.tu').textContent, li.querySelector('.tv').className.replace(/^tv n ?/, ''), (li.querySelector('svg') || { getAttribute: () => '' }).getAttribute('class')]);
  check('prices from tirezh.com along the bottom: the built-in seven that tirezh has (no pound or lira in this answer); green up, red down; the toman in tomans',
    shown(p, 'market') && JSON.stringify(tiles()) === JSON.stringify([['US dollar', '165,250', 'IQD', 'up', 'up'], ['Euro', '112.25', '$', 'down', 'down'],
      ['Iranian toman', '23,600,000', 'toman', 'up', 'up'], ['Gold 21K', '906,175', 'IQD', 'down', 'down'], ['Gold 18K', '776,722', 'IQD', '', '']]), tiles());
  const per = () => [...doc.querySelectorAll('#tiles li')].map(li => { const b = li.querySelector('.per'); return b ? [li.children[0].textContent, b.textContent,
    li.children[1] === b, b.tagName, /\bn\b/.test(b.className)] : null; }).filter(Boolean);
  check('...the toman, priced for 100 dollars, with a small "$100" label right after its name (only it: the dollar, euro and gold have none)',
    JSON.stringify(per()) === JSON.stringify([['Iranian toman', '$100', true, 'BDI', true]]), per());
  check('...with when tirezh.com set them (and no source name)', txt(p, 'marketLbl') === 'Gold and currency prices' && !doc.getElementById('marketSrc') &&
    txt(p, 'marketAt') === '8:37 PM' && txt(p, 'marketHead') === 'Gold and currency prices8:37 PM', [txt(p, 'marketLbl'), txt(p, 'marketAt')]);
  const menuSvg = doc.querySelector('#menuCode .qr').innerHTML, wifiSvg = doc.querySelector('#wifiCode .qr').innerHTML;
  check('a QR code for the menu that a phone reads as the menu\'s link', shown(p, 'menuCode') && readQr(menuSvg) === settings.menuUrl, readQr(menuSvg));
  check('a Wi-Fi QR code that joins the network (special characters escaped, Kurdish/accented names kept)',
    shown(p, 'wifiCode') && readQr(wifiSvg) === WIFI_QR, readQr(wifiSvg));
  check('...with the network\'s name and password as text too', txt(p, 'wifiName') === 'Twilight Café' && txt(p, 'wifiPwLbl') === 'Password' && txt(p, 'wifiPw') === settings.wifiPassword, txt(p, 'wifiPw'));
  await p.start(); await reveal(p); await sleep(1100);
  const cur = p.loads()[0], parts = { aaaaaaaaaa1: ['Shaw', 'Hama Jaza'], aaaaaaaaaa2: ['Gyan', 'Zakaria Abdulla'], aaaaaaaaaa3: ['Bahar', 'Nasr Razi ft. Hama Jaza'], aaaaaaaaaa4: ['Dilan', 'Rebaz'] };
  check('now playing: the song and the singer, without "(Official Video) [4K]"-type words, and its picture', shown(p, 'music') && txt(p, 'nowLbl') === 'Now playing' &&
    txt(p, 'nowSong') === parts[cur][0] && txt(p, 'nowSinger') === parts[cur][1] && doc.getElementById('nowThumb').getAttribute('src') === 'https://i.ytimg.com/vi/' + cur + '/mqdefault.jpg',
    [cur, txt(p, 'nowSong'), txt(p, 'nowSinger'), doc.getElementById('nowThumb').getAttribute('src')]);
  p.fake.dur = 245; p.clock.now += 60e3; await sleep(1200);
  const fill = doc.getElementById('barFill').style.transform;
  check('...how far into it: a line that fills, and 1:02 / 4:05', /^scaleX\(0\.2\d+\)$/.test(fill) && /^1:0\d \/ 4:05$/.test(txt(p, 'ptime')), [fill, txt(p, 'ptime')]);
  const nx = p.window.TwilightTV.status().upNext;
  check('up next: the song that really comes next, with its picture', nx && txt(p, 'nextTitle') === parts[nx.id][0] + ' — ' + parts[nx.id][1] &&
    doc.getElementById('nextThumb').getAttribute('src') === 'https://i.ytimg.com/vi/' + nx.id + '/mqdefault.jpg', [nx, txt(p, 'nextTitle')]);
  p.end(); await sleep(1300);
  check('...and it does come next', p.loads()[1] === nx.id, [p.loads(), nx.id]);
  p.clock.now = at(2026, 10, 11, 21, 49, 1); await sleep(1300);
  check('the clock moves on', txt(p, 'time') === '9:49', txt(p, 'time'));
  p.app.json = JSON.stringify(Object.assign({}, settings, { clock24: true, labels: { nowPlaying: 'ئێستا', locale: 'ckb', bitcoin: 'بیتکۆین', pound: 'پاوەن' },
    priceItems: ['ir', 'eu', 'gold24', 'xx', 'ounce', 'gb', 'btc', 'us'], menuUrl: '', wifiName: '' }));
  p.app.x = JSON.stringify({ titles: RANYA_TITLES, weather, pictures: [], prices: Object.assign({}, prices, {
    currencies: prices.currencies.concat([['gb', 'پاوەند', 130.85, 131.9, 1]]), btc: [83836.01, 1] }) });
  p.app.xv = 6;
  p.app.version = 2; p.clock.now += 2100; await sleep(1500);
  check('the words can be changed (e.g. to Kurdish); a right-to-left language mirrors the whole screen: the video card at the top right (600, 40)',
    txt(p, 'nowLbl') === 'ئێستا' && doc.documentElement.dir === 'rtl' && doc.documentElement.lang === 'ckb' && stage.style.left === '600px' &&
    doc.getElementById('panel').dir === 'rtl' && doc.getElementById('band').dir === 'rtl', [txt(p, 'nowLbl'), doc.documentElement.dir, stage.style.left]);
  check('...and with Kurdish, every number in Kurdish digits: a 24-hour clock 21:49 -> ٢١:٤٩', txt(p, 'time') === '٢١:٤٩' && txt(p, 'ampm') === '', txt(p, 'time'));
  check('...and prices with tirezh.com\'s Kurdish names and units (the toman in تمەن, dollars ١١٢.٢٥ with a plain dot, gold 24 in dinars, world gold $ per ounce; ' +
    'the pound and bitcoin by their words on the TV; an unknown item left out; seven at most, so the dollar, eighth, isn\'t there)',
    JSON.stringify(tiles()) === JSON.stringify([['تمەنی ئێرانی', '٢٣٬٦٠٠٬٠٠٠', 'تمەن', 'up', 'up'], ['یۆرۆ', '١١٢.٢٥', '$', 'down', 'down'],
      ['زێڕی ٢٤', '١٬٠٣٥٬٦٢٩', 'د.ع', 'up', 'up'], ['Gold', '٤٬١٨٥', '$ per ounce', 'down', 'down'], ['پاوەن', '١٣١.٩', '$', 'up', 'up'],
      ['بیتکۆین', '٨٣٬٨٣٦', '$', 'up', 'up']]), tiles());
  check('...the toman\'s label in Kurdish digits, ١٠٠$, one left-to-right piece right after its name', JSON.stringify(per()) ===
    JSON.stringify([['تمەنی ئێرانی', '١٠٠$', true, 'BDI', true]]), per());
  check('...but the Wi-Fi password, song names and messages are never changed', txt(p, 'nowSong') === parts[p.loads()[1]][0]);
  p.app.json = JSON.stringify(Object.assign({}, settings, { clock24: false, place: 'ڕانیە', priceItems: [], menuUrl: '', wifiName: '', labels: { locale: 'ckb', am: 'پ.ن', pm: 'د.ن',
    weekdays: 'یەکشەممە,دووشەممە,سێشەممە,چوارشەممە,پێنجشەممە,هەینی,شەممە',
    months: 'کانوونی دووەم,شوبات,ئازار,نیسان,ئایار,حوزەیران,تەممووز,ئاب,ئەیلوول,تشرینی یەکەم,تشرینی دووەم,کانوونی یەکەم',
    hijriMonths: 'موحەڕەم,سەفەر,ڕەبیعولئەوەڵ,ڕەبیعولسانی,جەمادیەلئەوەڵ,جەمادیەلئاخیر,ڕەجەب,شەعبان,ڕەمەزان,شەوال,زولقەعدە,زولحیججە' } }));
  p.app.version = 3; p.clock.now += 2100; await sleep(1500);
  check('Kurdish dates as written in Kurdistan (whatever the TV\'s engine knows): یەکشەممە، ١١ی تشرینی یەکەم، ٢٠٢٦ and ٣٠ی ڕەبیعولسانی، ١٤٤٨; ٩:٤٩ د.ن',
    txt(p, 'date') === 'یەکشەممە، ١١ی تشرینی یەکەم، ٢٠٢٦' && txt(p, 'hijri') === '٣٠ی ڕەبیعولسانی، ١٤٤٨' && txt(p, 'time') === '٩:٤٩' && txt(p, 'ampm') === 'د.ن',
    [txt(p, 'date'), txt(p, 'hijri'), txt(p, 'time'), txt(p, 'ampm')]);
  check('...no Kurdish calendar date without the Kurdish months among the words', txt(p, 'kurdish') === '', txt(p, 'kurdish'));
  const ku3 = JSON.parse(p.app.json);
  ku3.labels.kurdishMonths = 'خاکەلێوە,گوڵان,جۆزەردان,پووشپەڕ,گەلاوێژ,خەرمانان,ڕەزبەر,گەڵاڕێزان,سەرماوەز,بەفرانبار,ڕێبەندان,ڕەشەمە';
  p.app.json = JSON.stringify(ku3); p.app.version = 31; p.clock.now += 2100; await sleep(1500);
  check('...with them: the Kurdish date under the Hijri one, ١٩ی ڕەزبەر، ٢٧٢٦ (Newroz 2026 began 2726)', txt(p, 'kurdish') === '١٩ی ڕەزبەر، ٢٧٢٦', txt(p, 'kurdish'));
  check('...the temperature one left-to-right piece ("١٨°" beside Kurdish words)', txt(p, 'temp') === '١٨°' && doc.getElementById('temp').className === 'n' && txt(p, 'wplace') === 'ڕانیە');
  check('no prices and no QR codes when they\'re empty', !shown(p, 'market') && !shown(p, 'menuCode') && !shown(p, 'wifiCode'));
  p.app.json = JSON.stringify(Object.assign({}, settings, { numerals: 'latin', priceItems: ['us', 'gold21'], labels: { locale: 'ckb', pm: 'د.ن' } }));
  p.app.version = 4; p.clock.now += 2100; await sleep(1500);
  check('numerals "latin": Kurdish words with 123 digits (gold names too)', txt(p, 'time') === '9:49' && txt(p, 'ampm') === 'د.ن' && tiles()[0][1] === '165,250' &&
    tiles()[1][0] === 'زێڕی 21' && doc.documentElement.dir === 'rtl', [txt(p, 'time'), tiles()]);
  p.app.json = JSON.stringify(Object.assign({}, settings, { numerals: 'kurdish', priceItems: ['gold21'] }));
  p.app.version = 5; p.clock.now += 2100; await sleep(1500);
  check('numerals "kurdish": English words with ١٢٣ digits, still left to right (the video back on the left)', txt(p, 'time') === '٩:٤٩' && txt(p, 'ampm') === 'PM' &&
    tiles()[0][0] === 'Gold 21K' && tiles()[0][1] === '٩٠٦٬١٧٥' && doc.documentElement.dir === 'ltr' && stage.style.left === '40px', [txt(p, 'time'), tiles(), stage.style.left]);
  const wapi = { at: p.clock.now - 60e3, source: 'weatherapi', now: [p.clock.now - 10 * 60e3, 21.4, 'rainshowers_night'], hours: weather.hours };
  p.app.x = JSON.stringify({ titles: RANYA_TITLES, weather: wapi, pictures: [], prices }); p.app.xv = 4; await sleep(1300);
  check('WeatherAPI.com (with a key in the app): its measured "now" (21°, rain), and no credit (it asks for none)', txt(p, 'temp') === '٢١°' && txt(p, 'wwords') === 'Rain' &&
    txt(p, 'credit') === '', [txt(p, 'temp'), txt(p, 'wwords'), txt(p, 'credit')]);
  p.app.x = JSON.stringify({ titles: RANYA_TITLES, weather: { at: now - 6 * 3600e3, hours: [[now - 5 * 3600e3, 12, 'rain']] }, pictures: [],
                             prices: Object.assign({}, prices, { fetched: p.clock.now - 3 * 3600e3 - 1000 }) });
  p.app.xv = 5; await sleep(1300);
  check('a forecast hours old (no internet for a long time): no weather rather than a wrong one', !shown(p, 'weather') && txt(p, 'credit') === '');
  check('...and prices the app couldn\'t refresh for 3 hours: none rather than old ones', !shown(p, 'market'));
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();

  const q = makePage({ html: htmlWith({ infoPanel: false }), ids: makeIds(3), size: [1920, 1080] });
  await sleep(50);
  check('infoPanel false: the video full screen, no panel', !q.window.document.body.classList.contains('with-panel') && q.window.document.getElementById('stage').style.width === '1920px');
  q.close();
  const r = makePage({ ids: makeIds(3), size: [1920, 1080], url: 'https://tv.example.com/index.html?list=PLtest&setup=quality' });
  await sleep(50);
  check('quality setup: no panel, YouTube\'s player as big as before', !r.window.document.body.classList.contains('with-panel'));
  r.close();
  const s = makePage({ ids: makeIds(3), size: [1920, 1200] });
  await sleep(50);
  check('a 16:10 screen: the same picture, centered (the video card at 40, 100)', s.window.document.getElementById('stage').style.top === '100px' &&
    s.window.document.getElementById('stage').style.left === '40px' && css(s, '--oy') === '60px', [s.window.document.getElementById('stage').style.top, css(s, '--oy')]);
  s.close();
}

async function tSongChoice() {
  console.log('\nChoosing songs from the phone: next, now, from a YouTube link; the last 20 songs');
  const ids = makeIds(8, 'tvsong_');           // real YouTube IDs have 11 characters
  const p = makePage({ html: FAST, ids, seed: 3 });
  await p.start(); await reveal(p);
  const tv = p.window.TwilightTV, first = p.loads()[0];
  const pick = ids.find(v => v !== first && v !== tv.status().upNext.id);
  check('"play next" with a song from the playlist', tv.command('playnext:' + pick) && tv.status().asked.length === 1 && tv.status().upNext.id === pick && tv.status().upNext.asked);
  p.end(); await sleep(300);
  check('...it plays after the song playing now', p.loads()[1] === pick, p.loads());
  for (let i = 0; i < 6; i++) { p.end(); await sleep(50); }
  check('...and not again in the same round (it counts as played)', p.loads().slice(0, 8).filter(v => v === pick).length === 1 && new Set(p.loads().slice(0, 8)).size === 8, p.loads());
  await reveal(p);
  const n = p.loads().length;
  check('"play now" with a song from a link (not in the playlist): fades out, plays it', tv.command('playnow:dQw4w9WgXcQ') && (await sleep(1200), p.loads()[n] === 'dQw4w9WgXcQ'), p.loads().slice(-2));
  await reveal(p);
  check('...and it\'s on the last-songs list, with its name', tv.status().history[0].id === 'dQw4w9WgXcQ' && tv.status().history[0].title === 'Song dQw4w9WgXcQ', tv.status().history[0]);
  check('...but it doesn\'t count in the playlist\'s round', !p.state().played.includes('dQw4w9WgXcQ') && tv.status().round.total === 8);
  check('...and the app is told about it, to find its name', tv.songIds().includes('dQw4w9WgXcQ') && tv.songIds().length === 9, tv.songIds().length);
  tv.command('playnext:dQw4w9WgXcR'); tv.command('playnext:dQw4w9WgXcS'); tv.command('playnext:dQw4w9WgXcR');
  check('asking for the same song twice keeps it once, at the end', JSON.stringify(tv.status().asked.map(a => a.id)) === JSON.stringify(['dQw4w9WgXcS', 'dQw4w9WgXcR']));
  check('"unnext" takes it off the list again', tv.command('unnext:dQw4w9WgXcS') && tv.status().asked.length === 1);
  check('a song asked for survives a reload (kept on this TV)', JSON.stringify(p.state().upNext) === JSON.stringify(['dQw4w9WgXcR']));
  check('wrong IDs refused', tv.command('playnext:short') === false && tv.command('playnow:../../etc') === false);
  for (let i = 0; i < 19; i++) tv.command('playnext:x' + String(i).padStart(10, '0'));
  check('at most 20 songs waiting', tv.command('playnext:zzzzzzzzzzz') === false && tv.status().asked.length === 20);
  for (let i = 0; i < 25; i++) { p.end(); await sleep(30); await reveal(p); }
  const h = tv.status().history;
  check('the last 20 songs, newest first, with the time they played', h.length === 20 && h[0].t >= h[19].t && h[0].id === p.loads().at(-1), [h.length, h[0], p.loads().at(-1)]);
  check('...kept through a reload (this TV\'s memory)', JSON.parse(p.storage()['tv-history']).length === 20);
  tv.command('pause'); await sleep(1800);
  const m = p.loads().length;
  check('"play now" while paused: the music comes back with that song', tv.command('playnow:aaaaaaaaaaa') && p.loads()[m] === 'aaaaaaaaaaa' && tv.status().state !== 'paused', p.loads().slice(-2));
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();
}

async function tSinger() {
  console.log('\nNever two songs by the same singer in a row');
  const titles = { s0000000001: ['Hama Jaza - Shaw', 'Hama Jaza'], s0000000002: ['Hama Jaza - Gul', 'Kurdmax'], s0000000003: ['Hama Jaza ft. Dashni - Yar', 'Kurdmax'],
                   s0000000004: ['Dashni Morad - Xem', 'Kurdmax'], s0000000005: ['Nasr Razi - Bahar', 'Kurdmax'], s0000000006: ['Dilan', 'Rebaz Music'],
                   s0000000007: ['Zakaria - Gyan', 'Zakaria'], s0000000008: ['Ahmad Xalil - Xoshawisti', 'Kurdmax'], s0000000009: ['Hasan Zirak - Jwani', 'Kurdmax'],
                   s0000000010: ['Ciwan Haco - Evîn', 'Ciwan'], s0000000011: ['Aram Tigran - Stran', 'Kurdmax'], s0000000012: ['Shvan Perwer - Kine Em', 'Kurdmax'] };
  const ids = Object.keys(titles);
  const singer = id => ({ s0000000001: 'hama', s0000000002: 'hama', s0000000003: 'hama+dashni', s0000000004: 'dashni' })[id] || id;
  const same = (a, b) => { const x = singer(a).split('+'), y = singer(b).split('+'); return x.some(v => y.includes(v)); };
  async function run(rule) {
    const p = makePage({ html: fast({ differentSinger: rule }), ids, seed: 11, app: { json: '{}', x: JSON.stringify({ titles }), xv: 2 } });
    await p.start();
    for (let i = 0; i < 359; i++) p.end();
    const seq = p.loads(); p.close();
    let pairs = 0; for (let i = 1; i < seq.length; i++) if (same(seq[i - 1], seq[i])) pairs++;
    let roundsOk = true; for (let r = 0; r < 30; r++) if (new Set(seq.slice(r * 12, r * 12 + 12)).size !== 12) roundsOk = false;
    return { pairs, roundsOk, n: seq.length };
  }
  const on = await run(true), off = await run(false);
  console.log('         | same singer twice in a row in 360 songs: ' + on.pairs + ' with the rule, ' + off.pairs + ' without');
  check('with the rule: (almost) never the same singer twice in a row, "ft." singers included', on.pairs <= off.pairs / 5 && on.pairs <= 4, on);
  check('...and every song still plays once each round', on.roundsOk && on.n === 360, on);
  check('a channel with songs by many singers (here "Kurdmax") isn\'t taken for a singer', off.pairs > on.pairs);
}

async function tPrayer() {
  console.log('\nThe call to prayer: 5 minutes of quiet, in opening hours only (Ranya, 11 Oct 2026)');
  const p = makePage({ html: FAST, ids: makeIds(5), now: at(2026, 10, 11, 11, 45) });
  await p.start(); await reveal(p);
  const tv = p.window.TwilightTV;
  const times = tv.status().prayers.map(x => x.name + ' ' + new Date(x.at).toTimeString().slice(0, 5)).join(', ');
  check('today\'s times, as on Aladhan (Muslim World League) within a minute: ' + times,
    times === 'fajr 04:38, dhuhr 11:47, asr 15:01, maghrib 17:30, isha 18:51', times);
  const song = p.loads()[0], n = p.loads().length;
  p.clock.now = at(2026, 10, 11, 11, 47, 5); await sleep(10700);
  check('11:47 Dhuhr: the music stops, the café screen comes up', tv.status().state === 'prayer' && tv.status().prayerName === 'dhuhr' && p.cls() !== 'show' &&
    (await sleep(1800), p.fake.state === 2), tv.status().state);
  check('...saying why, on the café screen\'s plain picture', txt(p, 'brandNote') === 'The music resumes after the call to prayer' &&
    p.window.document.getElementById('look').getAttribute('src') === 'looks/plain.jpg', [txt(p, 'brandNote'), p.window.document.getElementById('look').getAttribute('src')]);
  check('...until 11:52', new Date(tv.status().prayerUntil).toTimeString().slice(0, 5) === '11:52');
  p.clock.now = at(2026, 10, 11, 11, 52, 1); await sleep(600);
  check('11:52: the same song carries on (no new song)', tv.status().state !== 'prayer' && p.loads().length === n && p.loads().at(-1) === song && p.fake.state === 1);
  await sleep(700);
  check('...the café\'s own picture back, the line gone', txt(p, 'brandNote') === '' && p.window.document.getElementById('look').getAttribute('src') === 'looks/cafe.jpg');
  p.clock.now = at(2026, 10, 11, 15, 1, 10); await sleep(10700);
  check('15:01 Asr: quiet again', tv.status().state === 'prayer');
  tv.command('resume'); await sleep(300);
  check('"Resume music" on the phone: the music comes back...', tv.status().state !== 'prayer');
  p.clock.now += 60e3; await sleep(10700);
  check('...and this pause is over for good', tv.status().state !== 'prayer');
  p.close();

  const q = makePage({ html: fast({ openHours: '12:00-02:00' }), ids: makeIds(5), now: at(2026, 10, 11, 11, 47, 30) });
  await q.start(); await sleep(11000);
  check('outside opening hours (Dhuhr 11:47, open from 12:00): just closed, no prayer pause', q.window.TwilightTV.status().state === 'closed');
  q.clock.now = at(2026, 10, 11, 17, 30, 20); await sleep(11000);
  check('Maghrib 17:30 in opening hours: the pause', q.window.TwilightTV.status().state === 'prayer');
  q.close();

  const r = makePage({ html: fast({ prayerAdjust: { dhuhr: 3 } }), ids: makeIds(5), now: at(2026, 10, 11, 11, 48) });
  await r.start(); await reveal(r); await sleep(10700);
  check('prayerAdjust { dhuhr: 3 }: not at 11:48...', r.window.TwilightTV.status().state !== 'prayer');
  r.clock.now = at(2026, 10, 11, 11, 50, 5); await sleep(10700);
  check('...but at 11:50, to match the mosque', r.window.TwilightTV.status().state === 'prayer');
  r.window.TwilightTV.command('pause'); await sleep(300);
  check('"Pause music" during the pause: paused for good (no surprise restart at 11:55)', (r.clock.now = at(2026, 10, 11, 11, 56), await sleep(10800), r.window.TwilightTV.status().state === 'paused'));
  r.close();

  const s = makePage({ html: fast({ prayerPause: 0 }), ids: makeIds(5), now: at(2026, 10, 11, 11, 47, 5) });
  await s.start(); await reveal(s); await sleep(10700);
  check('prayerPause 0: never paused', s.window.TwilightTV.status().state !== 'prayer' && s.window.TwilightTV.status().prayers.length === 0);
  s.close();
  // amozhgary.tv's month for Ranya, from the app: 11 October 04:44, sunrise 06:04, 11:54, 15:03, 17:39, 18:53
  const days = Array.from({ length: 31 }, (_, i) => [284 + i, 364 + i, 714, 903 - i, 1059 - i, 1133 - i]);
  days[10] = [284, 364, 714, 903, 1059, 1133];
  const x = { titles: {}, weather: null, pictures: [], prayers: { city: 'Ranya', year: 2026, month: 10, days, fetched: at(2026, 10, 11, 0, 40) } };
  const t = makePage({ html: fast({ prayerAdjust: { isha: 2 } }), ids: makeIds(5), now: at(2026, 10, 11, 11, 50), app: { json: '{}', x: JSON.stringify(x), xv: 2 } });
  await t.start(); await reveal(t);
  const site = t.window.TwilightTV.status().prayers.map(x => x.name + ' ' + new Date(x.at).toTimeString().slice(0, 5)).join(', ');
  check('with amozhgary.tv\'s times from the app: those (and prayerAdjust on top): ' + site,
    site === 'fajr 04:44, dhuhr 11:54, asr 15:03, maghrib 17:39, isha 18:55' && t.window.TwilightTV.status().prayersFrom === 'amozhgary.tv', site);
  check('...so no pause at 11:50 (the calculated Dhuhr was 11:47)', t.window.TwilightTV.status().state !== 'prayer');
  t.clock.now = at(2026, 10, 11, 11, 54, 5); await sleep(10700);
  check('...but at 11:54, amozhgary.tv\'s Dhuhr', t.window.TwilightTV.status().state === 'prayer');
  t.close();
  const x2 = Object.assign({}, x, { prayers: Object.assign({}, x.prayers, { month: 9 }) });
  const u = makePage({ html: FAST, ids: makeIds(5), now: at(2026, 10, 11, 11, 50), app: { json: '{}', x: JSON.stringify(x2), xv: 2 } });
  await sleep(300);
  check('another month\'s table (the app hasn\'t got this one yet): worked out here', u.window.TwilightTV.status().prayersFrom === '' &&
    u.window.TwilightTV.status().prayers[1].at === at(2026, 10, 11, 11, 47), u.window.TwilightTV.status().prayers);
  u.close();
}

// amozhgary.tv's Hijri dates for October 2026, as the app sends them: a day later than Umm al-Qura's here, to tell them apart
async function tHijriFromSite() {
  console.log('\nThe Hijri date from amozhgary.tv (the app reads its month every day), else the Umm al-Qura calendar');
  const hijri = Array.from({ length: 31 }, (_, i) => i < 9 ? [21 + i, 4, 1448] : [i - 8, 5, 1448]);   // 1 Oct 21 Rabiʻ II ... 10 Oct 1 Jumada I
  const prayers = { city: 'Ranya', year: 2026, month: 10, days: Array.from({ length: 31 }, () => [284, 364, 714, 903, 1059, 1133]), hijri, fetched: at(2026, 10, 11, 0, 40) };
  const ku = { locale: 'ckb', hijriMonths: 'موحەڕەم,سەفەر,ڕەبیعولئەوەڵ,ڕەبیعولسانی,جەمادیەلئەوەڵ,جەمادیەلئاخیر,ڕەجەب,شەعبان,ڕەمەزان,شەوال,زولقەعدە,زولحیججە' };
  const page = (labels, adjust, P) => makePage({ html: fast({ infoPanel: true, labels, hijriAdjust: adjust }), ids: makeIds(3), size: [1920, 1080], now: at(2026, 10, 11, 20, 0),
    app: { json: '{}', x: JSON.stringify({ titles: {}, weather: null, pictures: [], prayers: P }), xv: 2 } });
  const txt = (p, id) => p.window.document.getElementById(id).textContent;
  let p = page(ku, 0, prayers); await p.start(); await sleep(1300);
  check('11 October: amozhgary.tv\'s 2 Jumada I (Umm al-Qura says 30 Rabiʻ II), in Kurdish', txt(p, 'hijri') === '٢ی جەمادیەلئەوەڵ، ١٤٤٨' &&
    p.window.TwilightTV.status().hijriFrom === 'amozhgary.tv', [txt(p, 'hijri'), p.window.TwilightTV.status().hijriFrom]);
  p.close();
  p = page(ku, -1, prayers); await p.start(); await sleep(1300);
  check('...moved a day back with hijriAdjust -1: 1 Jumada I', txt(p, 'hijri') === '١ی جەمادیەلئەوەڵ، ١٤٤٨', txt(p, 'hijri'));
  p.close();
  p = page({}, 0, prayers); await p.start(); await sleep(1300);
  check('...in English as the engine writes them: 2 Jumada I 1448 AH', txt(p, 'hijri') === '2 Jumada I 1448 AH', txt(p, 'hijri'));
  p.close();
  p = page(ku, 0, Object.assign({}, prayers, { month: 9 })); await p.start(); await sleep(1300);
  check('another month\'s table: the Umm al-Qura calendar\'s 30 Rabiʻ II', txt(p, 'hijri') === '٣٠ی ڕەبیعولسانی، ١٤٤٨' &&
    p.window.TwilightTV.status().hijriFrom === '', [txt(p, 'hijri'), p.window.TwilightTV.status().hijriFrom]);
  p.close();
  p = page(ku, 0, Object.assign({}, prayers, { hijri: undefined })); await p.start(); await sleep(1300);
  check('no Hijri dates from the site (an older app, or a page without them): worked out here', txt(p, 'hijri') === '٣٠ی ڕەبیعولسانی، ١٤٤٨', txt(p, 'hijri'));
  p.close();
  const eid = Array.from({ length: 31 }, (_, i) => [i + 1, 10, 1448]);   // a made-up month: 11 October is 11 Shawwal... and 2 is Eid
  p = makePage({ html: fast({ infoPanel: true, labels: ku }), ids: makeIds(3), size: [1920, 1080], now: at(2026, 10, 2, 20, 0),
    app: { json: '{}', x: JSON.stringify({ titles: {}, weather: null, pictures: [], prayers: Object.assign({}, prayers, { hijri: eid }) }), xv: 2 } });
  await p.start(); await sleep(1300);
  check('Eid follows the site\'s calendar too (2 Shawwal there: Eid al-Fitr\'s look and greeting)',
    p.window.document.getElementById('brand').classList.contains('day-eidFitr'), p.window.document.getElementById('brand').className);
  p.close();
}

async function tKurdishCalendar() {
  console.log('\nThe Kurdish date: Newroz on 21 March every year, or on the equinox\'s day (Iran\'s calendar)');
  const ku = { locale: 'ckb', kurdishMonths: 'خاکەلێوە,گوڵان,جۆزەردان,پووشپەڕ,گەلاوێژ,خەرمانان,ڕەزبەر,گەڵاڕێزان,سەرماوەز,بەفرانبار,ڕێبەندان,ڕەشەمە' };
  const txt = (p, id) => p.window.document.getElementById(id).textContent;
  const day = async (now, rule) => {
    const p = makePage({ html: fast(Object.assign({ infoPanel: true, labels: ku }, rule ? { kurdishNewYear: rule } : {})), ids: makeIds(3), size: [1920, 1080], now,
      app: { json: '{}', x: JSON.stringify({ titles: {}, weather: null, pictures: [] }), xv: 2 } });
    await p.start(); await sleep(1300);
    const t = txt(p, 'kurdish'); p.close(); return t;
  };
  let a = await day(at(2026, 10, 13, 20, 0)), b = await day(at(2026, 10, 13, 20, 0), 'equinox');
  check('13 October 2026: ٢١ی ڕەزبەر، ٢٧٢٦ either way (the two agree until 19 March 2028)', a === '٢١ی ڕەزبەر، ٢٧٢٦' && b === a, [a, b]);
  a = await day(at(2028, 3, 20, 20, 0)); b = await day(at(2028, 3, 20, 20, 0), 'equinox');
  check('20 March 2028, built in: still ٣٠ی ڕەشەمە، ٢٧٢٧ (2028 has a 29 February); with "equinox", Iran\'s ١ی خاکەلێوە، ٢٧٢٨',
    a === '٣٠ی ڕەشەمە، ٢٧٢٧' && b === '١ی خاکەلێوە، ٢٧٢٨', [a, b]);
  a = await day(at(2028, 3, 21, 9, 0)); b = await day(at(2028, 10, 13, 9, 0)); const c = await day(at(2028, 10, 13, 9, 0), 'equinox');
  check('...21 March 2028 is ١ی خاکەلێوە، ٢٧٢٨; 13 October 2028 ٢١ی ڕەزبەر (Iran\'s calendar: ٢٢ی ڕەزبەر, a day on)',
    a === '١ی خاکەلێوە، ٢٧٢٨' && b === '٢١ی ڕەزبەر، ٢٧٢٨' && c === '٢٢ی ڕەزبەر، ٢٧٢٨', [a, b, c]);
  a = await day(at(2027, 3, 20, 9, 0)); b = await day(at(2029, 1, 20, 9, 0));
  check('20 March 2027 is ٢٩ی ڕەشەمە، ٢٧٢٦ (no 29 February); 20 January 2029 ٣٠ی بەفرانبار، ٢٧٢٨', a === '٢٩ی ڕەشەمە، ٢٧٢٦' && b === '٣٠ی بەفرانبار، ٢٧٢٨', [a, b]);
}

async function tOwnLooks() {
  console.log('\nThe café\'s own café-screen pictures, put in from the phone');
  const app = { json: JSON.stringify({ titleSeconds: 0, fadeIn: 0, fadeOut: 0, messages: ['Fresh mint tea is back'] }),
                x: JSON.stringify({ looks: { cafe: 1760000000001 } }), xv: 2 };
  const p = makePage({ ids: makeIds(3), app, size: [1920, 1080], now: at(2026, 11, 3, 20, 0) });
  await p.start(); await sleep(1300);
  const look = () => p.window.document.getElementById('look').getAttribute('src');
  check('the café\'s own picture, with when it was put in (so the TV fetches the new one)', look() === 'looks/cafe.jpg?v=1760000000001', look());
  p.app.x = JSON.stringify({ looks: { cafe: 1760000000999, plain: 1760000000500, newroz: 1760000000777 } }); p.app.xv = 3;
  p.clock.now += 1100; await sleep(1300);
  check('a newer one: shown within a second, no reload', look() === 'looks/cafe.jpg?v=1760000000999', look());
  p.app.x = JSON.stringify({ looks: { plain: 1760000000500, newroz: 1760000000777 } }); p.app.xv = 4;
  p.clock.now += 1100; await sleep(1300);
  check('back to the built-in one: the plain address again', look() === 'looks/cafe.jpg', look());
  p.close();
  const q = makePage({ ids: makeIds(3), app: Object.assign({}, app, { x: JSON.stringify({ looks: { newroz: 1760000000777, plain: 1760000000500 } }) }),
                       size: [1920, 1080], now: at(2027, 3, 21, 20, 0) });
  q.dur = 60;
  await q.start(); await reveal(q);
  const qlook = q.window.document.getElementById('look').getAttribute('src');
  q.clock.now += 60e3; await sleep(1100);
  const bg = q.window.document.querySelector('#slide img');
  check('Newroz: the café\'s own Newroz picture; a message on its own plain picture', qlook === 'looks/newroz.jpg?v=1760000000777' &&
    bg && bg.getAttribute('src') === 'looks/plain.jpg?v=1760000000500', [qlook, bg && bg.getAttribute('src')]);
  check('no script errors', p.errors.length === 0 && q.errors.length === 0, p.errors.concat(q.errors));
  q.close();
}

async function tMenuCode() {
  console.log('\nThe menu code: the café\'s own menu on the TV box, unless the settings have a link');
  const settings = { titleSeconds: 0, fadeIn: 0, fadeOut: 0, menuUrl: '', wifiName: '', messages: [] };
  const app = { json: JSON.stringify(settings), x: JSON.stringify({ menu: '' }), xv: 2 };
  const p = makePage({ ids: makeIds(3), size: [1920, 1080], now: at(2026, 10, 13, 20, 0), app });
  const doc = p.window.document, code = () => readQr(doc.querySelector('#menuCode .qr').innerHTML);
  await p.start(); await sleep(1300);
  check('no link, and nothing on the box\'s menu for customers yet: no menu code', !shown(p, 'menuCode'));
  p.app.x = JSON.stringify({ menu: 'http://192.168.1.23:8080/menu' }); p.app.xv = 3;
  p.clock.now += 1100; await sleep(1300);
  check('something on it: its code appears within a second, and a phone reads it as the box\'s menu address',
    shown(p, 'menuCode') && code() === 'http://192.168.1.23:8080/menu' && txt(p, 'menuLbl') === 'Menu', code());
  p.app.x = JSON.stringify({ menu: 'http://192.168.1.40:8081/menu' }); p.app.xv = 4;
  p.clock.now += 1100; await sleep(1300);
  check('the box got a new address on the Wi-Fi: the code follows it', code() === 'http://192.168.1.40:8081/menu', code());
  p.app.json = JSON.stringify(Object.assign({}, settings, { menuUrl: 'https://twilight.example/menu' })); p.app.version = 2;
  p.clock.now += 2100; await sleep(1500);
  check('a link to a menu in the settings comes first', code() === 'https://twilight.example/menu', code());
  p.app.json = JSON.stringify(settings); p.app.version = 3; p.app.x = JSON.stringify({ menu: 'javascript:alert(1)' }); p.app.xv = 5;
  p.clock.now += 2100; await sleep(1500);
  check('anything but a web address from the app: no code', !shown(p, 'menuCode'));
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();
}

async function tVideoColours() {
  console.log('\nThe frame in each song\'s colour, from YouTube\'s stills');
  const cols = { vid0000: [40, 120, 220], vid0001: [220, 60, 40], vid0002: [128, 128, 128] };   // blue, red, grey
  const hueOf = c => { const [r, g, b] = c.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    return d === 0 ? -1 : Math.round((mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60); };
  const want = { vid0000: hueOf(cols.vid0000), vid0001: hueOf(cols.vid0001) };
  const p = makePage({ html: FAST, ids: ['vid0000', 'vid0001', 'vid0002'], frames: colourStills(cols), size: [1920, 1080] });
  await p.start(); await reveal(p); await sleep(1200);
  const d = p.window.document, root = d.documentElement;
  const layer = () => root.classList.contains('amb-b') ? 'b' : 'a';
  const glowHue = () => { const m = /^radial-gradient\(1280px 720px at [\d.]+px [\d.]+px, rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(d.querySelector('#ambient .' + layer()).style.backgroundImage);
    return m ? hueOf([+m[1], +m[2], +m[3]]) : null; };
  const near5 = (a, b) => a != null && b != null && Math.min(Math.abs(a - b), 360 - Math.abs(a - b)) <= 8;
  const first = p.loads()[0], tint = p.state().tint;
  const okTint = id => id === 'vid0002' ? tint[id] === 0 : tint[id] instanceof Array && near5(tint[id][0], want[id]);
  check('each song\'s colour read from the same stills as the black bars (this song\'s and the next one\'s, kept on this TV): blue ' + want.vid0000 +
    '°, red ' + want.vid0001 + '°, grey none', Object.keys(tint).length === 2 && Object.keys(tint).every(okTint) && p.frameLog.length === 6, [tint, p.frameLog.length]);
  const s1 = cols[first] && first !== 'vid0002';
  check('the song playing (' + first + '): the room and a glow around the video in its colour, faded in over the plain frame; the progress line in it',
    s1 ? near5(glowHue(), want[first]) && layer() === 'b' && near5(hueOf(p.window.getComputedStyle(root).getPropertyValue('--accent').match(/\d+/g).map(Number)), want[first])
       : glowHue() === null, [first, layer(), glowHue(), root.style.getPropertyValue('--accent')]);
  check('...the video card\'s corners painted for that layer too', ['tl', 'tr', 'bl', 'br'].every(k =>
    /radial-gradient\(circle at [^,]+, transparent 17\.5px, rgb\(\d+, \d+, \d+\) 18\.5px/.test(d.querySelector('#stage .corner.' + k + ' .c' + layer()).style.background)));
  const before = layer();
  let seen = { [first]: glowHue() };
  for (let k = 0; k < 2; k++) {
    p.end(); await reveal(p); await sleep(1200);
    seen[p.loads().at(-1)] = glowHue();
  }
  check('each new song: its own colour on the other layer, which fades in (or the old one out)', near5(seen.vid0000, want.vid0000) && near5(seen.vid0001, want.vid0001) &&
    seen.vid0002 === null && p.state().tint.vid0002 === 0 && p.frameLog.length === 9, [seen, before, layer(), p.frameLog.length]);
  check('a song with no clear colour: the plain dark frame, the progress line white again', p.loads().at(-1) !== 'vid0002' ||
    (glowHue() === null && root.style.getPropertyValue('--accent') === ''), [p.loads().at(-1), glowHue(), root.style.getPropertyValue('--accent')]);
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();
  const q = makePage({ html: fast({ videoColors: false }), ids: ['vid0000'], frames: colourStills(cols), size: [1920, 1080] });
  await q.start(); await reveal(q); await sleep(1200);
  const qd = q.window.document;
  check('videoColors false: the plain dark frame always', !/rgba\(/.test(qd.querySelector('#ambient .a').style.backgroundImage + qd.querySelector('#ambient .b').style.backgroundImage) &&
    qd.documentElement.style.getPropertyValue('--accent') === '', qd.querySelector('#ambient .a').style.backgroundImage);
  q.close();
}

async function tQuietAndClosing() {
  console.log('\n"Quiet for a minute", and the music fading out before closing time');
  const p = makePage({ html: FAST, ids: makeIds(5), now: at(2026, 10, 11, 20, 0) });
  await p.start(); await reveal(p); await sleep(2300);
  const tv = p.window.TwilightTV;
  check('(full volume)', p.fake.vol === 100, p.fake.vol);
  tv.command('quiet:60'); await sleep(2600);
  check('quiet:60 — down to 15% in about two seconds, the song carries on', p.fake.vol === 15 && p.loads().length === 1 && tv.status().quietUntil > 0, p.fake.vol);
  tv.command('quiet:60');
  check('pressed again: two minutes', tv.status().quietUntil - p.clock.now === 120e3, tv.status().quietUntil - p.clock.now);
  p.clock.now += 121e3; await sleep(2600);
  check('...then back to normal by itself', p.fake.vol === 100 && tv.status().quietUntil === 0, p.fake.vol);
  tv.command('quiet:60'); await sleep(2600); tv.command('quiet:0'); await sleep(2600);
  check('quiet:0 — back to normal at once', p.fake.vol === 100, p.fake.vol);
  p.close();

  const q = makePage({ html: fast({ quietLevel: 0 }), ids: makeIds(5) });
  await q.start(); await reveal(q);
  q.window.TwilightTV.command('quiet:30'); await sleep(2600);
  check('quietLevel 0: silent meanwhile', q.fake.muted === true, q.fake.muted);
  q.close();

  const c = makePage({ html: fast({ openHours: '10:00-23:00' }), ids: makeIds(5), now: at(2026, 10, 11, 22, 40) });
  await c.start(); await reveal(c); await sleep(2300);
  const vols = [];
  for (const [h, m] of [[22, 49], [22, 55], [22, 59]]) { c.clock.now = at(2026, 10, 11, h, m); await sleep(2300); vols.push(c.fake.vol); }
  console.log('         | volume at 22:49, 22:55, 22:59 (closing 23:00): ' + vols.join(', '));
  check('closingFade 10: full until 22:50, then easing down (about 18% at 22:55, 4% at 22:59)', vols[0] === 100 && vols[1] === 18 && vols[2] === 4, vols);
  c.clock.now = at(2026, 10, 11, 23, 0, 5); await sleep(11000);
  check('...and at 23:00 closed', c.window.TwilightTV.status().state === 'closed');
  c.window.TwilightTV.command('resume'); await reveal(c); await sleep(2300);
  check('"Play anyway" after closing: at full volume, no fading', c.fake.vol === 100, c.fake.vol);
  c.close();
}

async function tPlaylistSchedule() {
  console.log('\nPlaylists by time of day');
  const sch = { '10:00': 'https://www.youtube.com/playlist?list=PLmorning', '18:00': 'PLevening' };
  const p = makePage({ html: fast({ playlistSchedule: sch }), url: 'https://tv.example.com/index.html', ids: makeIds(5), now: at(2026, 10, 11, 11, 0), fetchImpl: () => Promise.resolve({ ok: true }) });
  await p.start(); await reveal(p);
  check('11:00: the morning playlist', p.calls('cuePlaylist')[0][1] === 'PLmorning' && p.window.TwilightTV.status().playlist === 'PLmorning');
  p.clock.now = at(2026, 10, 11, 18, 0, 5); await sleep(10800);
  check('18:00: the song playing isn\'t cut', !p.fetchLog.some(u => u.startsWith('https://tv.example.com/')));
  p.end(); await sleep(300);
  check('...the evening playlist starts between two songs', p.fetchLog.some(u => u.startsWith('https://tv.example.com/')), p.fetchLog);
  p.close();
  const q = makePage({ html: fast({ playlistSchedule: sch }), url: 'https://tv.example.com/index.html', ids: makeIds(5), now: at(2026, 10, 11, 9, 0) });
  await q.start();
  check('09:00 (before the first time): still the evening playlist from the night before', q.calls('cuePlaylist')[0][1] === 'PLevening');
  q.close();
  const r = makePage({ html: fast({ playlistSchedule: {} }), url: 'https://tv.example.com/index.html', ids: makeIds(5) });
  await r.start();
  check('no schedule: the playlist setting', r.calls('cuePlaylist')[0][1] === 'PL_6oD4DKbNOvlb8kOY9APBXjC_EtR6eYK');
  r.close();
}

async function tSlides() {
  console.log('\nBetween songs: the café\'s picture, messages and pictures in turn');
  const app = { json: JSON.stringify({ titleSeconds: 0, fadeIn: 0, fadeOut: 0, brandEnding: 10, messages: ['Fresh mint tea is back', 'هەموو ئێوارەیەک مۆسیقای زیندوو'] }),
                x: JSON.stringify({ pictures: ['pic0000001', 'bad/../x'] }), xv: 2 };
  const p = makePage({ ids: makeIds(6), app, size: [1920, 1080] });
  p.dur = 60;
  await p.start(); await reveal(p);
  const doc = p.window.document, slide = doc.getElementById('slide'), brand = doc.getElementById('brand');
  const gap = async () => { p.clock.now += 60e3; await sleep(1100); };   // the song's last seconds: the café screen comes up
  check('first: the café\'s picture', slide.className === '' && !brand.classList.contains('slide-on') && doc.getElementById('look').getAttribute('src') === 'looks/cafe.jpg');
  await gap();
  check('at the end of a song: the first message, on the plain picture (no words of its own)', slide.className === 'on' && slide.querySelector('.msg').textContent === 'Fresh mint tea is back' &&
    brand.classList.contains('slide-on') && slide.querySelector('img') && slide.querySelector('img').getAttribute('src') === 'looks/plain.jpg', slide.innerHTML);
  p.end(); await reveal(p); await gap();
  const img = slide.querySelector('img');
  check('the next time: the first picture, from the app', slide.className === 'on' && img && img.getAttribute('src') === '/tv/pictures/pic0000001.jpg', slide.innerHTML);
  p.end(); await reveal(p); await gap();
  check('then the second message (Kurdish, right to left)', slide.querySelector('.msg').textContent === 'هەموو ئێوارەیەک مۆسیقای زیندوو' && slide.querySelector('.msg').dir === 'auto');
  p.end(); await reveal(p); await gap();
  check('then the café\'s picture again (a picture with a bad ID is left out)', slide.className === '' && !brand.classList.contains('slide-on'));
  p.window.TwilightTV.command('pause'); await sleep(300);
  const before = slide.innerHTML;
  p.clock.now += 21e3; await sleep(1200);
  check('a long while on the café screen (paused): the next one after 20 seconds', slide.innerHTML !== before && slide.className === 'on', slide.innerHTML);
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();
}

async function tMenuSlides() {
  console.log('\nBetween songs: items from the café\'s menu, chosen by the weather');
  const N = (ku, en) => ({ ku, en });
  const CATS = { seedhookah: N('نێرگەلە', 'Hookah'), seeddrink: N('خواردنەوە', 'Drinks'), seedicecream: N('ئایسکرێم', 'Ice Cream') };
  const SUBS = { seedhot: N('گەرم', 'Hot drinks'), seedfresh: N('فرێش', 'Fresh juice') };
  const item = (id, name, cat, sub, price, note) => Object.assign({ id, name, picture: 'p' + id, cat, catName: CATS[cat] },
    sub ? { sub, subName: SUBS[sub] } : {}, price != null ? { price } : {}, note ? { note } : {});
  const ITEMS = [item('hk01', N('توایڵایت', 'Twilight'), 'seedhookah', null, 5000, N('تێکەڵەی نهێنیی خۆمان', 'Our house secret blend')),
    item('hk02', N('دوو سێو', 'Double Apple'), 'seedhookah', null, 5000), item('ht01', N('چا', 'Tea'), 'seeddrink', 'seedhot', 500),
    item('ht02', N('کاپوچینۆ', 'Cappuccino'), 'seeddrink', 'seedhot', 1500), item('fr01', N('پرتەقاڵ', 'Orange'), 'seeddrink', 'seedfresh', 2500),
    item('ic01', N('ڤانێلا', 'Vanilla'), 'seedicecream', null, 1500), { id: 'nopic', name: N('ئاو', 'Water'), cat: 'seeddrink' }];
  const NOW = 1_700_000_000_000;
  const extras = (t, more) => JSON.stringify(Object.assign({ menuItems: ITEMS }, t == null ? {} : { weather: { at: NOW, hours: [[NOW - 600e3, t, 'clearsky_day']] } }, more || {}));
  const open = (t, settings, more) => makePage({ ids: makeIds(6), size: [1920, 1080], now: NOW,
    app: { json: JSON.stringify(Object.assign({ titleSeconds: 0, fadeIn: 0, fadeOut: 0, brandEnding: 10 }, settings || {})), x: extras(t, more), xv: 2 } });
  const shown = p => [...p.window.document.querySelectorAll('#slide.on .page.shown')].pop();   // the newest (the one before goes after its fade)
  const nameOf = p => { const s = shown(p); return s && s.classList.contains('menu') ? s.querySelector('h2').textContent : s ? 'other' : 'café'; };
  // a long pause: the café screen moves on every 20 seconds; the menu's turns, every other one
  const turns = async (p, n) => { const out = []; for (let i = 0; i < n; i++) { p.clock.now += 21e3; await sleep(1150); out.push(nameOf(p)); } return out; };
  // paused from the phone: the café screen moves on at once (as ever), then every 20 seconds
  const paused = async (p, n) => { p.window.TwilightTV.command('pause'); await sleep(300); return [nameOf(p)].concat(await turns(p, n - 1)); };
  const KU = { labels: { locale: 'ckb' } };

  // A mild day (20°), the TV in Kurdish
  const p = open(20, KU);
  p.dur = 60;
  await p.start(); await reveal(p);
  const doc = p.window.document, slide = doc.getElementById('slide');
  check('first: the café\'s picture', nameOf(p) === 'café');
  p.clock.now += 8e3; await sleep(1200);
  const made = slide.querySelector('.page:not(.shown)');
  check('while the song plays, the next slide is made before its turn (its pictures decoded then, not in a fade)',
    made && made.classList.contains('menu') && made.querySelector('h2').textContent === 'توایڵایت', slide.innerHTML.slice(0, 300));
  p.clock.now += (60 - 9 - p.fake.getCurrentTime()) * 1000; await sleep(1100);   // 9 s before the end
  const s1 = shown(p);
  check('at the end of the song: an item from the menu, the very slide made before', s1 === made && s1.classList.contains('menu'), nameOf(p));
  check('...its picture big and its small copy for the blurred one behind it, from the box',
    s1.querySelector('img.ph').getAttribute('src') === '/menu/pics/phk01.jpg' && !!s1.querySelector('canvas.haze'), s1.innerHTML.slice(0, 300));
  check('...in Kurdish: category, name, description and price in Kurdish digits with د.ع',
    s1.querySelector('.from').textContent === 'نێرگەلە' && s1.querySelector('h2').textContent === 'توایڵایت'
    && s1.querySelector('.note').textContent === 'تێکەڵەی نهێنیی خۆمان' && s1.querySelector('.pr b').textContent === '٥٬٠٠٠' && s1.querySelector('.pr small').textContent === 'د.ع',
    s1.querySelector('.words').textContent);
  check('...the café screen fading in over the video\'s last seconds, the video untouched', !doc.getElementById('brand').classList.contains('away')
    && /opacity 2s/.test(doc.getElementById('brand').style.transition) && doc.getElementById('player').style.opacity === '');
  const mild = await paused(p, 8);
  check('in turn with the café\'s picture; one from each category or subcategory at a time (20°: all of them)',
    JSON.stringify(mild) === JSON.stringify(['café', 'چا', 'café', 'پرتەقاڵ', 'café', 'ڤانێلا', 'café', 'دوو سێو']), mild);
  p.clock.now += 21e3; await sleep(1150); p.clock.now += 21e3; await sleep(1150);
  const tea2 = shown(p);
  check('a subcategory\'s item: "category › subcategory" (the › turned the page\'s way, right to left)', nameOf(p) === 'کاپوچینۆ'
    && [...tea2.querySelectorAll('.from span')].map(e => e.textContent).join('|') === 'خواردنەوە|›|گەرم' && tea2.querySelector('.from .sep').getAttribute('aria-hidden') === 'true'
    && tea2.querySelector('.pr b').textContent === '١٬٥٠٠', tea2.querySelector('.from').textContent);
  check('an item without a picture never comes (Water)', !mild.includes('ئاو'));
  check('no script errors', p.errors.length === 0, p.errors);
  p.close();

  // A hot day (31°): no hot drinks; ice cream and fresh juice first
  const h = open(31, KU);
  await h.start(); await reveal(h);
  const hot = (await paused(h, 8)).filter(x => x !== 'café');
  check('31°: no hot drinks, cold things first', JSON.stringify(hot) === JSON.stringify(['پرتەقاڵ', 'ڤانێلا', 'توایڵایت', 'دوو سێو']), hot);
  h.close();

  // A cold day (12°): no ice cream or fresh juice; hot drinks first
  const c = open(12, KU);
  await c.start(); await reveal(c);
  const cold = (await paused(c, 8)).filter(x => x !== 'café');
  check('12°: no ice cream or fresh juice, hot drinks first', JSON.stringify(cold) === JSON.stringify(['چا', 'توایڵایت', 'کاپوچینۆ', 'دوو سێو']), cold);
  c.close();

  // No weather, the TV in English
  const e = open(null, {});
  await e.start(); await reveal(e);
  await paused(e, 1);
  const en = shown(e);
  check('no weather: every item; the TV in English: English words, 123 and IQD', nameOf(e) === 'Twilight' && en.querySelector('.pr b').textContent === '5,000'
    && en.querySelector('.pr small').textContent === 'IQD' && en.querySelector('.from').textContent === 'Hookah', en && en.querySelector('.words').textContent);
  e.close();

  // With the café's messages: the menu after each of the café's own
  const m = open(20, Object.assign({ messages: ['Fresh mint tea is back'] }, KU));
  await m.start(); await reveal(m);
  const withMsg = await paused(m, 4);
  check('with a message: the café\'s picture, an item, the message, an item...', JSON.stringify(withMsg) === JSON.stringify(['توایڵایت', 'other', 'چا', 'café']), withMsg);
  m.close();

  // Off from the phone (menuSlides false)
  const o = open(20, Object.assign({ menuSlides: false }, KU));
  await o.start(); await reveal(o);
  const off = await paused(o, 3);
  check('"Menu items between songs" off: none (only the café\'s picture)', off.every(x => x === 'café'), off);
  o.close();
}

async function tSpecialDays() {
  console.log('\nSpecial days: Newroz, Eid al-Fitr, Eid al-Adha, Barat Night, New Year');
  const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric' });
  const findHijri = (m, d, from) => { for (let t = from; t < from + 400 * 864e5; t += 864e5) { const o = {}; fmt.formatToParts(new Date(t)).forEach(x => { o[x.type] = x.value; }); if (+o.month === m && +o.day === d) return t; } return null; };
  const base = at(2026, 10, 12);
  const cases = [['Newroz', at(2027, 3, 21), 'newroz', 'Happy Newroz', 'newroz'], ['Eid al-Fitr', findHijri(10, 2, base), 'eidFitr', 'Eid Mubarak', 'eid'],
                 ['Eid al-Adha', findHijri(12, 10, base), 'eidAdha', 'Eid Mubarak', 'eid'], ['Barat Night', findHijri(8, 14, base), 'barat', 'Blessed Barat Night', 'barat'],
                 ['New Year\'s Eve, 19:00', at(2026, 12, 31, 19), 'newYear', 'Happy New Year 2027', 'newyear'], ['an ordinary day', at(2026, 11, 3), '', '', 'cafe']];
  for (const [name, t, day, words, pic] of cases) {
    const p = makePage({ html: FAST, ids: makeIds(3), now: t, size: [1920, 1080] });
    await sleep(80);
    const b = p.window.document.getElementById('brand'), src = p.window.document.getElementById('look').getAttribute('src');
    const ok = src === 'looks/' + pic + '.jpg' && txt(p, 'brandNote') === '' &&
      (day ? b.classList.contains('day-' + day) && txt(p, 'greeting') === words : !/day-/.test(b.className) && txt(p, 'greeting') === '');
    check(name + ' (' + new Date(t).toDateString() + '): ' + (day ? 'its picture, ' + pic + '.jpg, and "' + words + '" in the panel' : 'the café\'s own picture'), ok,
      [b.className, src, txt(p, 'brandNote'), txt(p, 'greeting')]);
    p.close();
  }
  const eid = findHijri(10, 1, base);
  const a = makePage({ html: htmlWith({ hijriAdjust: -1 }), ids: makeIds(3), now: eid });
  await sleep(80);
  check('hijriAdjust -1: Eid a day later here (as when the moon is seen a day late)', !a.window.document.getElementById('brand').classList.contains('day-eidFitr'));
  a.close();
  const o = makePage({ html: htmlWith({ specialDays: false }), ids: makeIds(3), now: at(2027, 3, 21) });
  await sleep(80);
  check('specialDays false: never', !/day-/.test(o.window.document.getElementById('brand').className));
  o.close();
  const l = makePage({ html: FAST, ids: makeIds(3), now: at(2026, 11, 3) });
  await l.start(); await reveal(l);
  check('look:barat from the phone: its picture on the café screen for 20 seconds, the music carries on',
    l.window.TwilightTV.command('look:barat') && l.window.document.getElementById('brand').classList.contains('day-barat') &&
    l.window.document.getElementById('look').getAttribute('src') === 'looks/barat.jpg' && l.cls() !== 'show' && !l.fake.muted);
  l.clock.now += 21e3; await sleep(1500);
  check('...then the video again, the café\'s own picture back behind it', l.cls() === 'show' && !/day-/.test(l.window.document.getElementById('brand').className) &&
    l.window.document.getElementById('look').getAttribute('src') === 'looks/cafe.jpg');
  check('look: with an unknown day refused', l.window.TwilightTV.command('look:christmas') === false);
  l.close();
}

(async () => {
  const args = process.argv.slice(2);
  const tests = [tBrand, tPlaceholder, tStart, tHide, tFades, tVolume, tZoom, tAutoZoom, tAppLink, tCommands, tHours, tSchedule, tProblems, tQualitySetup, tShuffle, tSmall, tReload, tBadVideos, tOddErrors, tUnstoppable,
                 tSound, tAds, tSubtitles, tCutEnding, tRefresh, tApiKey, tLook, tCorners, tHijriFromSite, tQualityAsk, tFullscreen, tRealPlaylist, tDebug, tSlowYouTube, tBridge,
                 tPanel, tKurdishCalendar, tOwnLooks, tMenuCode, tVideoColours, tSongChoice, tSinger, tPrayer, tQuietAndClosing, tPlaylistSchedule, tSlides, tMenuSlides, tSpecialDays];
  if (args.includes('--list')) { console.log(tests.map(t => t.name).join('\n')); return; }
  const only = args.filter(a => !a.startsWith('--'));
  for (const t of tests) {
    if (only.length && !only.includes(t.name)) continue;
    try { await t(); } catch (e) { failures++; console.log('  FAIL ' + t.name + ' threw: ' + (e && e.stack || e)); }
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
