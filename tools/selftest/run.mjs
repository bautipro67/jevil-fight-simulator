#!/usr/bin/env node
// Self test: plays the simulator by itself in a headless Chrome or Edge and reports what broke.
// It serves this folder on a local port (or opens the live site with --url), loads
// tools/selftest/runner.js into the page and plays every scenario in tools/selftest/sim.js plus the
// shared ones (the fight, the scenes, practice, menus, gamepad, pause, codes, equipment, items,
// hats, every attack in the sandbox). Then it checks the page on desktop, phone and tablet screens
// (layout, touch controls). Any file the page asks for and cannot get counts as a failure.
// Nothing to install: Node 22 or newer and any Chromium browser.
//
// Usage: node tools/selftest/run.mjs [options]
//   --quick          skip the sandbox runs of each attack and the screen checks
//   --only <text>    run only the scenarios whose name contains <text> (several: 'a|b';
//                    'screen' for the screen checks)
//   --list           list the scenarios and exit
//   --url <address>  test a published copy (for example the GitHub Pages site) instead of this folder
//   --shots <dir>    save the last frame of each scenario (and each screen check) as a PNG in <dir>
//   --browser <exe>  the browser to use (default: CHROME_PATH, then Chrome, then Edge)
//   --headed         show the browser window
// Exit code 0 when everything passed, 1 otherwise.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---------------------------------------------------------------- options
const argv = process.argv.slice(2);
const opt = name => argv.includes('--' + name);
const val = name => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : undefined; };
const options = { quick: opt('quick'), only: val('only') ?? null, list: opt('list'), shots: !!val('shots') };
const shotsDir = val('shots');
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
if (typeof WebSocket !== 'function') {
  console.error('This needs Node 22 or newer (for its built-in WebSocket).');
  process.exit(2);
}

// ---------------------------------------------------------------- a static server for this folder
// Paths are matched with their exact case, as on GitHub Pages (Windows itself would ignore case).
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
let server = null, pageUrl = val('url');
if (pageUrl) {
  if (!pageUrl.endsWith('/')) pageUrl += '/';
} else {
  server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    let file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* 404 below */ }
    let real;
    try { real = fs.realpathSync.native(file); } catch { res.writeHead(404).end(); return; }
    if (real !== file && real.toLowerCase() === file.toLowerCase()) { res.writeHead(404, { 'X-Reason': 'case' }).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  pageUrl = `http://127.0.0.1:${server.address().port}/`;
}

// ---------------------------------------------------------------- the browser
function findBrowser() {
  const given = val('browser') ?? process.env.CHROME_PATH;
  if (given) return given;
  const pf = process.env.PROGRAMFILES ?? 'C:\\Program Files', pf86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates = {
    win32: [`${pf}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${local}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`],
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  }[process.platform] ?? ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/usr/bin/microsoft-edge'];
  return candidates.find(f => fs.existsSync(f));
}
const exe = findBrowser();
if (!exe) {
  console.error('No Chrome or Edge found. Pass one with --browser <path> or set CHROME_PATH.');
  server?.close();
  process.exit(2);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-selftest-'));
const browser = spawn(exe, [
  opt('headed') ? '--new-window' : '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  '--window-size=1280,960', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  const timer = setTimeout(() => reject(new Error('the browser did not start')), 30000);
  browser.stderr.on('data', d => {
    buf += d;
    const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) { clearTimeout(timer); resolve(m[1]); }
  });
  browser.on('exit', code => { clearTimeout(timer); reject(new Error('the browser exited (' + code + ')')); });
});

// ---------------------------------------------------------------- a small DevTools protocol client
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('could not connect to the browser')); });
let nextId = 1;
const pending = new Map(), listeners = [];
ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
  } else if (msg.method) for (const l of listeners) l(msg);
};
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
});
const once = (method, sessionId) => new Promise(r => {
  const l = m => { if (m.method === method && m.sessionId === sessionId) { listeners.splice(listeners.indexOf(l), 1); r(m.params); } };
  listeners.push(l);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A page in its own tab, with the files it could not get and its uncaught errors.
async function openPage({ width = 1280, height = 960, dpr = 1, mobile = false, touch = false } = {}) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const page = { sessionId, targetId, missing: new Set(), errors: [], urls: new Map() };
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    const p = m.params;
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = p.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (text.startsWith('[selftest]')) console.log(text.slice(11));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails;
      page.errors.push((d.exception?.description ?? d.text ?? 'exception').split('\n').slice(0, 3).join(' | '));
    }
    if (m.method === 'Network.requestWillBeSent') page.urls.set(p.requestId, p.request.url);
    if (m.method === 'Network.responseReceived' && p.response.status >= 400 && !/favicon\.ico$/.test(p.response.url)) {
      page.missing.add(`${p.response.status} ${p.response.url.replace(/\?.*$/, '')}${p.response.headers?.['X-Reason'] === 'case' ? ' (wrong upper/lower case)' : ''}`);
    }
    if (m.method === 'Network.loadingFailed' && !p.canceled && !/favicon\.ico$/.test(page.urls.get(p.requestId) ?? '')) {
      page.missing.add(`${p.errorText} ${(page.urls.get(p.requestId) ?? '?').replace(/\?.*$/, '')}`);
    }
  });
  const s = (method, params) => send(method, params, sessionId);
  await s('Runtime.enable');
  await s('Page.enable');
  await s('Network.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile });
  if (touch) {
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await s('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] }).catch(() => {});
  }
  // The page pauses the fight when it loses focus; keep it focused while several tests run at once.
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  const loaded = once('Page.loadEventFired', sessionId);
  await s('Page.navigate', { url: pageUrl });
  await loaded;
  page.eval = async (expression, awaitPromise = true) => {
    const { result, exceptionDetails } = await s('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  page.send = s;
  page.close = () => send('Target.closeTarget', { targetId }).catch(() => {});
  return page;
}

// ---------------------------------------------------------------- screen checks
// Waits for the title, then measures the page: no sideways scrolling, the game wholly on screen and
// big enough to play, and on touch screens the controls shown, on screen, and working (a tap on the
// pad moves the title cursor, a tap on Z opens the menu under it).
const SCREENS = [
  { name: 'desktop 1920x1080', width: 1920, height: 1080 },
  { name: 'desktop 1366x768', width: 1366, height: 768 },
  { name: 'desktop 1024x768', width: 1024, height: 768 },
  { name: 'small window 800x600', width: 800, height: 600 },
  { name: 'phone, upright (390x844)', width: 390, height: 844, dpr: 3, mobile: true, touch: true },
  { name: 'phone, sideways (844x390)', width: 844, height: 390, dpr: 3, mobile: true, touch: true },
  { name: 'tablet (820x1180)', width: 820, height: 1180, dpr: 2, mobile: true, touch: true },
];
const MEASURE = `(async () => {
  const base = location.href.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const v = (await fetch(base + 'version.json', { cache: 'no-store' }).then(r => r.json())).v;
  const gm = await import(base + 'src/runtime/gm.js?v=' + v);
  for (let k = 0; k < 600 && !gm.G.instances.some(i => i.alive && /title/.test(i.constructor.objName)); k++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 1200));
  const c = document.querySelector('canvas').getBoundingClientRect();
  const t = document.getElementById('touch');
  const box = el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  const menu = () => gm.instancesOf('obj_sim_heartmenu').filter(m => m.alive && m.items && !m.done).pop();
  window.__menu = menu;
  return { iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth,
    canvas: { left: c.left, top: c.top, right: c.right, bottom: c.bottom, w: c.width, h: c.height },
    title: gm.G.instances.some(i => i.alive && /title/.test(i.constructor.objName)),
    touch: t && !t.hidden ? { pad: box(t.querySelector('.dpad')), z: box(t.querySelector('[data-action="confirm"]')),
      x: box(t.querySelector('[data-action="cancel"]')) } : null,
    cur: menu()?.cur ?? null };
})()`;
async function checkScreen(sc) {
  const problems = [];
  const page = await openPage(sc);
  try {
    const m = await page.eval(MEASURE);
    if (!m.title) problems.push('the title screen never appeared');
    if (m.sw > m.iw + 1) problems.push(`the page scrolls sideways (${m.sw}px wide in a ${m.iw}px window)`);
    if (m.canvas.left < -1 || m.canvas.right > m.iw + 1) problems.push(`the game sticks out sideways (${Math.round(m.canvas.left)} to ${Math.round(m.canvas.right)})`);
    if (m.canvas.w < 300) problems.push(`the game is only ${Math.round(m.canvas.w)}px wide`);
    if (!sc.touch && m.canvas.bottom > m.ih + 1) problems.push(`the game does not fit the window's height (${Math.round(m.canvas.bottom)} > ${m.ih})`);
    if (sc.touch) {
      if (!m.touch) problems.push('the touch controls are hidden');
      else {
        for (const [n, b] of Object.entries(m.touch)) {
          if (b.w < 30 || b.h < 30) problems.push(`the touch ${n} is too small (${Math.round(b.w)}x${Math.round(b.h)})`);
          if (b.left < 0 || b.right > m.iw || b.top < 0 || b.bottom > m.ih) problems.push(`the touch ${n} is off screen`);
        }
        const tap = async (x, y, ms = 150) => {
          await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await sleep(ms);
          await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await sleep(250);
        };
        if (!problems.length) {
          const pad = m.touch.pad;
          await tap(pad.x, pad.y + pad.h * 0.38);
          const cur = await page.eval('window.__menu()?.cur ?? null');
          if (cur === m.cur) problems.push('a tap on the pad did not move the title cursor');
          await tap(m.touch.z.x, m.touch.z.y);
          const after = await page.eval('(() => { const mm = window.__menu(); return mm ? mm.items.map(it => String(typeof it === "function" ? it() : it)) : []; })()');
          if (!after.some(l => /^(START|NORMAL ROUTE|VOLUME)/.test(l))) problems.push(`a tap on Z did not open the menu under the cursor (now: ${after.join(', ') || 'no menu'})`);
          await tap(m.touch.x.x, m.touch.x.y);
        }
      }
    }
    if (shotsDir) {
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(shotsDir, 'screen_' + sc.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') + '.png'), Buffer.from(data, 'base64'));
    }
    const size = `game ${Math.round(m.canvas.w)}x${Math.round(m.canvas.h)}`;
    return { name: 'screen: ' + sc.name, ok: !problems.length && !page.missing.size && !page.errors.length, problems, size,
      missing: [...page.missing], errors: page.errors };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------- run
// The screen checks run with everything else, or alone with --only screen (or a screen's name).
const onlyWords = options.only ? options.only.toLowerCase().split('|') : null;
const screensToCheck = options.quick ? [] : SCREENS.filter(sc => !onlyWords
  || onlyWords.some(w => ('screen: ' + sc.name).toLowerCase().includes(w)));
let exitCode = 1;
try {
  const main = await openPage();
  const expr = `import(${JSON.stringify(new URL('tools/selftest/runner.js', pageUrl).href)} + '?t=${Date.now()}').then(m => m.run(${JSON.stringify(options)}))`;
  const report = await main.eval(expr);
  if (report.fatal) throw new Error(report.fatal);
  if (options.list) {
    for (const n of report.names) console.log('  ' + n);
    for (const sc of screensToCheck) console.log('  screen: ' + sc.name);
    exitCode = 0;
  } else {
    const screens = [];
    for (const sc of screensToCheck) {
      console.log(`screen: ${sc.name} ...`);
      screens.push(await checkScreen(sc));
    }
    let failed = 0;
    console.log('');
    for (const r of report.results) {
      if (!r.ok) failed += 1;
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.frames} frames, ${(r.ms / 1000).toFixed(1)} s, ${r.msPerFrame} ms/frame, ${r.sounds} sounds)`);
      if (r.problem) console.log('      ' + r.problem);
      for (const e of r.errors) console.log('      error: ' + e);
      for (const w of r.badWarnings) console.log('      warning: ' + w);
      if (shotsDir && r.shot) {
        const file = path.join(shotsDir, r.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 60) + '.png');
        fs.writeFileSync(file, Buffer.from(r.shot.split(',')[1], 'base64'));
      }
    }
    for (const s of screens) {
      if (!s.ok) failed += 1;
      console.log(`${s.ok ? 'PASS' : 'FAIL'}  ${s.name}  (${s.size})`);
      for (const p of s.problems) console.log('      ' + p);
      for (const f of s.missing) console.log('      missing file: ' + f);
      for (const e of s.errors) console.log('      error: ' + e);
    }
    const missing = [...main.missing];
    for (const f of missing) console.log('missing file: ' + f);
    const loadErrors = main.errors.filter(e => !report.results.some(r => r.errors.some(x => x.includes(e.slice(0, 40)))));
    for (const e of loadErrors) console.log('page error: ' + e);
    const slow = [...report.results].sort((a, b) => b.msPerFrame - a.msPerFrame).slice(0, 3);
    const worst = report.results.reduce((a, b) => (b.worstFrame > (a?.worstFrame ?? -1) ? b : a), null);
    console.log(`\nSlowest (time to compute one frame; the game has 33 ms): ${slow.map(r => `${r.name.split(':')[0]} ${r.msPerFrame} ms`).join(', ')}` +
      (worst ? `; worst single frame ${worst.worstFrame} ms in "${worst.name.split(':')[0]}"` : ''));
    console.log(`Sound: the audio was ${report.audio}; ${report.results.reduce((n, r) => n + r.sounds, 0)} sounds played.`);
    console.log(`${report.title} ${report.version} (${server ? 'this folder' : pageUrl}): ` +
      `${report.results.length + screens.length - failed} passed, ${failed} failed` +
      (missing.length ? `, ${missing.length} missing files` : '') +
      (report.otherWarnings.length ? `; other warnings: ${report.otherWarnings.join(' / ')}` : ''));
    exitCode = failed || loadErrors.length || missing.length ? 1 : 0;
  }
} catch (e) {
  console.error('Self test stopped: ' + e.message);
} finally {
  try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 3000))]); } catch { /* already closed */ }
  browser.kill();
  server?.close();
  setTimeout(() => {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the OS cleans its temp folder */ }
    process.exit(exitCode);
  }, 500);
}
