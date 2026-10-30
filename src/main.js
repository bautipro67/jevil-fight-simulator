import { loadAssets, loadAudioInBackground } from './runtime/assets.js?v=20261030223631';
import { audioInit, audioPreload, audioState } from './runtime/audio.js?v=20261030223631';
import * as gm from './runtime/gm.js?v=20261030223631';
import { G } from './runtime/gm.js?v=20261030223631';
import { setupTouch } from './touch.js?v=20261030223631';
import { setupFullscreen } from './fullscreen.js?v=20261030223631';
import { loadSettings, applyVolume } from './settings.js?v=20261030223631';
import { isPaused, pauseStep, openPause, togglePause, pauseContext } from './pause.js?v=20261030223631';
import './screens/controls.js?v=20261030223631';

loadSettings();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
G.ctx = ctx;
window.G = G; // console debugging
window.gm = gm;

const params = new URLSearchParams(location.search);
G.debug.enabled = params.has('debug') || params.has('sandbox');

if (setupTouch(params.has('touch'))) document.body.classList.add('touch');
setupFullscreen();

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
const pauseBtn = document.getElementById('pausebtn');
if (pauseBtn) {
  pauseBtn.addEventListener('click', () => { pauseBtn.blur(); togglePause(); });
  pauseBtn.addEventListener('keydown', e => e.preventDefault());
}
// Switching tabs or apps pauses the fight.
document.addEventListener('visibilitychange', () => { if (document.hidden) openPause(); });

function loop() {
  let last = performance.now();
  let acc = 0;
  const STEP = 1000 / 30;
  function frame(now) {
    acc += Math.min(now - last, 250);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 4) {
      if (isPaused()) pauseStep();
      else if (!G.paused || G.stepOnce) {
        G.stepOnce = false;
        gm.tick();
        if (gm.pause_p()) openPause();
      }
      acc -= STEP;
      n++;
    }
    if (n === 4) acc = 0;
    if (pauseBtn) pauseBtn.hidden = !(isPaused() || pauseContext());
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
  await Promise.all([import('./battle/index.js?v=20261030223631'), import('./jevil/index.js?v=20261030223631')]);
  const mode = params.has('sandbox') ? 'sandbox' : 'battle';
  if (mode === 'sandbox') {
    const sb = await import('./debug/sandbox.js?v=20261030223631');
    sb.startSandbox(params);
  } else {
    const title = await import('./screens/title.js?v=20261030223631');
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
  applyVolume();
  addEventListener('keydown', audioInit, { once: true });
  addEventListener('pointerdown', audioInit, { once: true });
  loadAudioInBackground();
  audioPreload().catch(e => console.warn(e));
  // Gamepad buttons don't count as a gesture for audio, so tell gamepad players how to get sound.
  const hint = document.getElementById('soundhint');
  if (hint) {
    const t = setInterval(() => {
      const suspended = audioState() === 'suspended';
      hint.hidden = !suspended;
      if (!suspended) clearInterval(t);
    }, 500);
  }
  await start();
  loop();
}

// A file that fails to download (e.g. a brief server error) is retried with one automatic reload.
function retriedOnce() {
  try {
    if (sessionStorage.getItem('jevil-retry')) return true;
    sessionStorage.setItem('jevil-retry', '1');
  } catch (e) { return true; }
  return false;
}

boot().then(() => {
  try { sessionStorage.removeItem('jevil-retry'); } catch (e) { /* storage unavailable */ }
}).catch(err => {
  console.error(err);
  if (!retriedOnce()) {
    location.reload();
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#f44';
  ctx.font = '16px monospace';
  ctx.fillText('Could not load the game. Please reload the page.', 20, 40);
  ctx.fillText('Error: ' + err.message, 20, 64);
});
