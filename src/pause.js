// Pause menu for the fight and practice mode: the game and its sound freeze while it is open.
// It runs outside the instance system, over a snapshot of the last frame.
import {
  G, S, defineScript, instance_exists, instancesOf, inputLatch, up_p, down_p, left_p, right_p,
  button1_p, button2_p, pause_p, draw_set_font, draw_set_color, draw_set_alpha, draw_set_halign,
  draw_rectangle, draw_text, draw_sprite_ext, fa_center, fa_left,
} from './runtime/gm.js?v=20261031024711';
import { audioSuspend, audioResume } from './runtime/audio.js?v=20261031024711';
import { saveSettings, applyVolume } from './settings.js?v=20261031024711';
import { scr_darkbox } from './screens/common.js?v=20261031024711';

let menu = null;

// Where pausing makes sense: the real fight and practice (not the title, end screens or sandbox).
export function pauseContext() {
  if (instance_exists('obj_practicecontroller')) return 'practice';
  if (instance_exists('obj_sandboxcontroller')) return null;
  if (instance_exists('obj_battlecontroller')) return 'battle';
  return null;
}

export const isPaused = () => !!menu;

export function openPause() {
  const context = pauseContext();
  if (menu || !context) return;
  const snap = document.createElement('canvas');
  snap.width = G.ctx.canvas.width;
  snap.height = G.ctx.canvas.height;
  snap.getContext('2d').drawImage(G.ctx.canvas, 0, 0);
  menu = { context, snap, cur: 0, t: 0, box: { cur_jewel: 0 } };
  audioSuspend();
}

export function closePause() {
  menu = null;
  audioResume();
}

export const togglePause = () => (menu ? closePause() : openPause());

const items = () => [
  'CONTINUE',
  menu.context === 'practice' ? 'RESTART PRACTICE' : 'RESTART FIGHT',
  'VOLUME: < ' + Math.round(G.settings.volume * 100) + '% >',
  'QUIT TO TITLE',
];

function setVolume(v) {
  G.settings.volume = Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
  applyVolume();
  saveSettings();
}

// Leaves the current fight; practice swaps scr_gameover while it runs, so that goes back first.
function leave(then) {
  const pc = instancesOf('obj_practicecontroller')[0];
  if (pc?.realGameover) defineScript('scr_gameover', pc.realGameover);
  menu = null;
  audioResume();
  then();
}

async function restart(context) {
  if (context === 'practice') {
    const { startPractice } = await import('./debug/sandbox.js?v=20261031024711');
    startPractice(G.lastPractice || {});
  } else {
    const { startBattle } = await import('./battle/setup.js?v=20261031024711');
    startBattle({ intro: G.settings?.intro !== false });
  }
}

// One frame while paused (called by the main loop instead of the game tick).
export function pauseStep() {
  inputLatch();
  const m = menu;
  m.t += 1;
  const n = items().length;
  if (m.t > 2) {
    if (down_p()) m.cur = (m.cur + 1) % n;
    if (up_p()) m.cur = (m.cur + n - 1) % n;
    if (m.cur === 2 && (left_p() || right_p())) setVolume(G.settings.volume + (right_p() ? 0.1 : -0.1));
    if (pause_p() || button2_p()) return closePause();
    if (button1_p()) {
      if (m.cur === 0) return closePause();
      if (m.cur === 1) return leave(() => restart(m.context));
      if (m.cur === 2) setVolume(G.settings.volume >= 1 ? 0 : G.settings.volume + 0.1);
      if (m.cur === 3) return leave(() => S.startTitle());
    }
  }
  draw();
}

function draw() {
  const ctx = G.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(menu.snap, 0, 0);
  draw_set_alpha(0.6);
  draw_set_color(0);
  draw_rectangle(0, 0, 639, 479, false);
  draw_set_alpha(1);
  draw_rectangle(150, 120, 490, 360, false);
  scr_darkbox(menu.box, 150, 120, 490, 360);
  draw_set_font('fnt_mainbig');
  draw_set_halign(fa_center);
  draw_set_color(0xffffff);
  draw_text(320, 146, 'PAUSED');
  draw_set_halign(fa_left);
  items().forEach((label, i) => {
    draw_set_color(i === menu.cur ? 0xffff00 : 0xffffff);
    draw_text(210, 200 + i * 36, label);
  });
  draw_sprite_ext('spr_heart', 0, 182, 210 + menu.cur * 36, 1, 1, 0, 0xffffff, 1);
}
