import { loadAssets } from './runtime/assets.js';
import { audioInit, audioPreload } from './runtime/audio.js';
import * as gm from './runtime/gm.js';
import { G } from './runtime/gm.js';
import { setupTouch } from './touch.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
G.ctx = ctx;
window.G = G; // console debugging
window.gm = gm;

const params = new URLSearchParams(location.search);
G.debug.enabled = params.has('debug') || params.has('sandbox');

if (setupTouch(params.has('touch'))) document.body.classList.add('touch');

function fit() {
  // On portrait touch screens the on-screen controls sit below the game.
  const reserve = document.body.classList.contains('touch') && innerHeight > innerWidth ? 200 : 0;
  const w = document.documentElement.clientWidth, h = innerHeight - reserve;
  const s = Math.max(1, Math.floor(Math.min(w / 640, h / 480)));
  const fs = Math.min(w / 640, h / 480);
  const scale = fs >= 1 ? s : fs;
  canvas.style.width = 640 * scale + 'px';
  canvas.style.height = 480 * scale + 'px';
}
addEventListener('resize', fit);
fit();

function drawLoading(p) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 640, 480);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(220.5, 230.5, 200, 20);
  ctx.fillStyle = '#fff';
  ctx.fillRect(223, 233, Math.round(195 * p), 15);
}

// Fixed 30 fps logic tick; every tick also draws, because GML Draw events change state.
let running = false;
function loop() {
  let last = performance.now();
  let acc = 0;
  const STEP = 1000 / 30;
  function frame(now) {
    acc += Math.min(now - last, 250);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 4) {
      if (!G.paused || G.stepOnce) {
        G.stepOnce = false;
        gm.tick();
      }
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    requestAnimationFrame(frame);
  }
  if (!running) {
    running = true;
    requestAnimationFrame(frame);
  }
}

function debugKeys() {
  addEventListener('keydown', e => {
    if (!G.debug.enabled) return;
    if (e.code === 'F2') G.debug.hitboxes = !G.debug.hitboxes;
    if (e.code === 'F3') G.paused = !G.paused;
    if (e.code === 'F4') G.stepOnce = true;
  });
}

async function start() {
  // Registers every ported object and script.
  for (const mod of ['./battle/index.js', './jevil/index.js']) {
    try { await import(mod); } catch (e) { console.warn('could not load', mod, e); }
  }
  const mode = params.has('sandbox') ? 'sandbox' : 'battle';
  if (mode === 'sandbox') {
    const sb = await import('./debug/sandbox.js');
    sb.startSandbox(params);
  } else {
    const title = await import('./screens/title.js');
    title.startTitle();
  }
}

async function boot() {
  gm.inputAttach();
  debugKeys();
  drawLoading(0);
  await loadAssets(drawLoading);
  // Audio stays suspended until the first key press or tap (browser autoplay rules);
  // sounds started before that begin playing once it resumes.
  audioInit();
  addEventListener('keydown', audioInit, { once: true });
  addEventListener('pointerdown', audioInit, { once: true });
  audioPreload();
  await start();
  loop();
}

boot().catch(err => {
  console.error(err);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#f44';
  ctx.font = '16px monospace';
  ctx.fillText('Error: ' + err.message, 20, 40);
});
