// Title screen: the carousel room, the DELTARUNE logo, JEVIL dancing, and a SOUL menu.
// URL params: ?battle starts the fight at once, ?nointro also skips the encounter transition,
// ?practice[&attack=N][&hp=N] starts practice mode.
import {
  G, global, Instance, defineObject, defineScript, S, instance_create, instance_destroy, objectExists,
  draw_sprite_ext, draw_set_color, draw_set_font, draw_set_alpha, draw_rectangle, draw_text,
} from '../runtime/gm.js';
import { snd_init, mus_loop_ext, mus_volume, mus_stop } from '../runtime/audio.js';
import { startBattle } from '../battle/setup.js';
import { startPractice, PRACTICE_HP } from '../debug/sandbox.js';
import { gotoRoom, fadeOut, centerText } from './common.js';
import './gameover.js';
import './ending.js';

G.settings = G.settings || { simplify: false, intro: true, easy: false };

class Title extends Instance {
  create() {
    this.depth = 0;
    this.t = 0;
    this.sprite_index = 'spr_joker_dance';
    this.image_speed = 0.25;
  }
  step() { this.t += 1; }
  draw() {
    const t = this.t;
    const a = Math.min(1, t / 30);
    draw_sprite_ext('IMAGE_LOGO', 0, 320 - 224, 34, 2, 2, 0, 0xffffff, a);
    draw_set_font('fnt_main');
    draw_set_color(0x808080);
    draw_set_alpha(a);
    centerText(320, 110, 'JEVIL  FIGHT  SIMULATOR');
    draw_set_alpha(1);
    const bob = Math.sin(t / 12) * 6;
    draw_sprite_ext('spr_joker_dance', this.image_index, 320, 215 + bob, 3, 3, 0, 0xffffff, a);
    draw_set_font('fnt_mainbig');
    draw_set_color(0xffff00);
    draw_set_alpha(a * (0.6 + Math.sin(t / 8) * 0.4));
    centerText(320, 284, 'CHAOS, CHAOS!');
    draw_set_alpha(1);
    draw_set_font('fnt_main');
    draw_set_color(0x808080);
    centerText(320, 440, 'Z / ENTER: CONFIRM    X / SHIFT: CANCEL    ARROWS: MOVE');
    centerText(320, 458, 'DELTARUNE (C) TOBY FOX.  UNOFFICIAL FAN SIMULATOR.');
  }
}
defineObject('obj_sim_title', Title);

export function startTitle() {
  const p = new URLSearchParams(location.search);
  if (p.has('practice')) {
    startPractice({ start: (Number(p.get('attack')) || 1) - 1, hp: Number(p.get('hp')) || 90 });
    return;
  }
  if (p.has('battle') || p.has('nointro')) {
    if (p.has('nointro')) G.settings.intro = false;
    startBattle({ intro: G.settings.intro });
    return;
  }
  gotoRoom();
  global.flag[8] = G.settings.simplify ? 1 : 0;
  if (objectExists('obj_jokerbg_triangle_real')) {
    const bg = instance_create(0, 0, 'obj_jokerbg_triangle_real');
    bg.on = G.settings.simplify ? 0 : 1;
    bg.rotspeed = 1;
  }
  instance_create(0, 0, 'obj_sim_title');
  const music = snd_init('prejoker.ogg');
  mus_loop_ext(music, 0.8, 1);
  mainMenu(music);
}

const MENU_X = 236, MENU_Y = 318;

function leave(music, then) {
  mus_volume(music, 0, 20);
  fadeOut(20, () => {
    mus_stop(music);
    then();
  });
}

function mainMenu(music, cur = 0) {
  const menu = instance_create(MENU_X, MENU_Y, 'obj_sim_heartmenu');
  menu.setup(['BEGIN', 'PRACTICE', 'OPTIONS'], (i, m) => {
    if (i == 0) return leave(music, () => startBattle({ intro: G.settings.intro }));
    instance_destroy(m);
    if (i == 1) practiceMenu(music);
    if (i == 2) optionsMenu(music);
  }, 'fnt_mainbig', 28);
  menu.cur = cur;
}

// Practice: dodge the fight's attacks in order; see startPractice in src/debug/sandbox.js.
G.practice = G.practice || { start: 0, hp: 0 };
function practiceMenu(music) {
  const P = G.practice;
  const menu = instance_create(MENU_X, MENU_Y, 'obj_sim_heartmenu');
  const back = m => { instance_destroy(m); mainMenu(music, 1); };
  menu.setup([
    'START',
    () => 'FROM ATTACK: ' + (P.start + 1) + ' / 16',
    () => 'HP: ' + PRACTICE_HP[P.hp] + (PRACTICE_HP[P.hp] == 1 ? ' (NO HIT)' : ''),
    'BACK',
  ], (i, m) => {
    if (i == 0) return leave(music, () => startPractice({ start: P.start, hp: PRACTICE_HP[P.hp] }));
    if (i == 3) return back(m);
    if (i == 1) P.start = (P.start + 1) % 16;
    if (i == 2) P.hp = (P.hp + 1) % PRACTICE_HP.length;
    m.done = false;
    m.buffer = 1;
  }, 'fnt_mainbig', 28);
  menu.onBack = back;
}

function optionsMenu(music) {
  const menu = instance_create(MENU_X, MENU_Y, 'obj_sim_heartmenu');
  const back = m => { instance_destroy(m); mainMenu(music, 2); };
  menu.setup([
    () => 'EASY MODE: ' + (G.settings.easy ? 'ON' : 'OFF'),
    () => 'INTRO: ' + (G.settings.intro ? 'ON' : 'OFF'),
    () => 'SIMPLIFY VFX: ' + (G.settings.simplify ? 'ON' : 'OFF'),
    'BACK',
  ], (i, m) => {
    if (i == 3) return back(m);
    if (i == 0) G.settings.easy = !G.settings.easy;
    if (i == 1) G.settings.intro = !G.settings.intro;
    if (i == 2) {
      G.settings.simplify = !G.settings.simplify;
      global.flag[8] = G.settings.simplify ? 1 : 0;
    }
    m.done = false;
    m.buffer = 1;
  }, 'fnt_mainbig', 28);
  menu.onBack = back;
}
defineScript('startTitle', startTitle);

void draw_rectangle;
