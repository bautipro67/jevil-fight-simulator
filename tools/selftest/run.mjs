#!/usr/bin/env node
// Self test: plays the simulator by itself in a headless Chrome or Edge and reports what broke.
// It serves this folder on a local port, opens the page with no window, loads
// tools/selftest/runner.js into it and plays every scenario in tools/selftest/sim.js (the fight,
// the scenes, practice mode and each attack in the sandbox). Nothing to install: Node 22 or newer
// and any Chromium browser.
//
// Usage: node tools/selftest/run.mjs [options]
//   --quick          skip the sandbox runs of each attack
//   --only <text>    run only the scenarios whose name contains <text> (several: 'a|b')
//   --list           list the scenarios and exit
//   --shots <dir>    save the last frame of each scenario as a PNG in <dir>
//   --browser <exe>  the browser to use (default: CHROME_PATH, then Chrome, then Edge)
//   --headed         show the browser window
// Exit code 0 when every scenario passed, 1 otherwise.
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
if (typeof WebSocket !== 'function') {
  console.error('This needs Node 22 or newer (for its built-in WebSocket).');
  process.exit(2);
}

// ---------------------------------------------------------------- a static server for this folder
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.bin': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  let file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html'); } catch { /* 404 below */ }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

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
  server.close();
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

let exitCode = 1;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const pageErrors = [];
  listeners.push(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.consoleAPICalled') {
      const text = m.params.args.map(a => a.value ?? a.description ?? '').join(' ');
      if (text.startsWith('[selftest]')) console.log(text.slice(11));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      pageErrors.push((d.exception?.description ?? d.text ?? 'exception').split('\n').slice(0, 3).join(' | '));
    }
  });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  // The page pauses the fight when it loses focus; keep it focused while several tests run at once.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId);
  const loaded = once('Page.loadEventFired', sessionId);
  await send('Page.navigate', { url: pageUrl }, sessionId);
  await loaded;
  const expr = `import('/tools/selftest/runner.js?t=${Date.now()}').then(m => m.run(${JSON.stringify(options)}))`;
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
  if (exceptionDetails) throw new Error('the runner failed: ' + (exceptionDetails.exception?.description ?? exceptionDetails.text));
  const report = result.value;
  if (report.fatal) throw new Error(report.fatal);
  if (options.list) {
    for (const n of report.names) console.log('  ' + n);
    exitCode = 0;
  } else {
    if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
    let failed = 0;
    console.log('');
    for (const r of report.results) {
      if (!r.ok) failed += 1;
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.frames} frames, ${(r.ms / 1000).toFixed(1)} s)`);
      if (r.problem) console.log('      ' + r.problem);
      for (const e of r.errors) console.log('      error: ' + e);
      for (const w of r.badWarnings) console.log('      warning: ' + w);
      if (shotsDir && r.shot) {
        const file = path.join(shotsDir, r.name.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 60) + '.png');
        fs.writeFileSync(file, Buffer.from(r.shot.split(',')[1], 'base64'));
      }
    }
    const loadErrors = pageErrors.filter(e => !report.results.some(r => r.errors.some(x => x.includes(e.slice(0, 40)))));
    for (const e of loadErrors) console.log('page error: ' + e);
    console.log(`\n${report.title} ${report.version}: ${report.results.length - failed} passed, ${failed} failed` +
      (report.otherWarnings.length ? `; other warnings: ${report.otherWarnings.join(' / ')}` : ''));
    exitCode = failed || loadErrors.length ? 1 : 0;
  }
} catch (e) {
  console.error('Self test stopped: ' + e.message);
} finally {
  try { await Promise.race([send('Browser.close'), new Promise(r => setTimeout(r, 3000))]); } catch { /* already closed */ }
  browser.kill();
  server.close();
  setTimeout(() => {
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the OS cleans its temp folder */ }
    process.exit(exitCode);
  }, 500);
}
