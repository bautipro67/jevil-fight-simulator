// Shared bits for the non-battle screens: room changes, the dark-world text box, a heart menu.
import {
  G, global, Instance, defineObject, room_reset, instance_create, draw_sprite_ext, draw_sprite_stretched_ext,
  draw_set_color, draw_set_font, draw_text, draw_sprite, string_width, up_p, down_p, left_p, right_p, button1_p, button2_p, round,
} from '../runtime/gm.js';
import { snd_free_all, snd_play } from '../runtime/audio.js';

// room_goto: drop every instance and keep only the globals a screen needs.
export function gotoRoom(keep = {}) {
  const tempflag = global.tempflag;
  snd_free_all();
  room_reset();
  G.viewScale = 1;
  G.camX = G.camY = 0;
  global.flag = new Array(10000).fill(0);
  global.tempflag = tempflag || new Array(100).fill(0);
  global.msg = new Array(100).fill(' ');
  global.darkzone = 1;
  global.fighting = 0;
  global.fc = 0;
  global.fe = 0;
  global.lang = 'en';
  if (G.settings?.simplify) global.flag[8] = 1;
  Object.assign(global, keep);
}

// scr_darkbox(x1, y1, x2, y2): the dark-world dialogue frame; `inst.cur_jewel` animates the corners.
export function scr_darkbox(inst, x1, y1, x2, y2) {
  inst.cur_jewel = (inst.cur_jewel || 0) + 1;
  const w = Math.max(0, x2 - x1 - 63), h = Math.max(0, y2 - y1 - 63);
  if (w > 0) {
    draw_sprite_stretched_ext('spr_textbox_top', 0, x1 + 32, y1, w, 32, 0xffffff, 1);
    draw_sprite_ext('spr_textbox_top', 0, x1 + 32, y2 + 1, w, -2, 0, 0xffffff, 1);
  }
  if (h > 0) {
    draw_sprite_ext('spr_textbox_left', 0, x2 + 1, y1 + 32, -2, h, 0, 0xffffff, 1);
    draw_sprite_ext('spr_textbox_left', 0, x1, y1 + 32, 2, h, 0, 0xffffff, 1);
  }
  const f = global.flag?.[8] == 0 ? inst.cur_jewel / 10 : 0;
  draw_sprite_ext('spr_textbox_topleft', f, x1, y1, 2, 2, 0, 0xffffff, 1);
  draw_sprite_ext('spr_textbox_topleft', f, x2 + 1, y1, -2, 2, 0, 0xffffff, 1);
  draw_sprite_ext('spr_textbox_topleft', f, x1, y2 + 1, 2, -2, 0, 0xffffff, 1);
  draw_sprite_ext('spr_textbox_topleft', f, x2 + 1, y2 + 1, -2, -2, 0, 0xffffff, 1);
}

// A vertical list with the red SOUL as cursor, in the battle menu style.
export class HeartMenu extends Instance {
  setup(items, onPick, font = 'fnt_mainbig', spacing = 30) {
    this.items = items;
    this.onPick = onPick;
    this.font = font;
    this.spacing = spacing;
    this.cur = 0;
    this.buffer = 2;
    this.alpha = 0;
    this.done = false;
    this.onBack = null; // X / Shift handler, for submenus
    this.onAdjust = null; // (index, -1 | 1) for left / right, e.g. a volume slider
    return this;
  }
  step() {
    if (!this.items) return;
    this.alpha = Math.min(1, this.alpha + 0.1);
    this.buffer -= 1;
    if (this.done || this.buffer >= 0) return;
    const n = this.items.length;
    if (down_p()) { this.cur = (this.cur + 1) % n; snd_play('snd_menumove'); }
    if (up_p()) { this.cur = (this.cur + n - 1) % n; snd_play('snd_menumove'); }
    if (this.onAdjust && (left_p() || right_p())) this.onAdjust(this.cur, right_p() ? 1 : -1);
    if (button1_p()) {
      snd_play('snd_select');
      this.done = true;
      this.onPick(this.cur, this);
    } else if (button2_p() && this.onBack) {
      snd_play('snd_menumove');
      this.done = true;
      this.onBack(this);
    }
  }
  draw() {
    if (!this.items) return;
    draw_set_font(this.font);
    this.items.forEach((it, i) => {
      const label = typeof it === 'function' ? it() : it;
      draw_set_color(i == this.cur ? 0xffff00 : 0xffffff);
      draw_text(this.x + 30, this.y + i * this.spacing, label);
    });
    draw_sprite_ext('spr_heart', 0, this.x, this.y + 10 + this.cur * this.spacing, 1, 1, 0, 0xffffff, this.alpha);
  }
}
defineObject('obj_sim_heartmenu', HeartMenu);

// Full-screen fade to black (or white), then a callback.
class Fade extends Instance {
  create() { this.depth = -99999; this.t = 0; this.len = 20; this.color = 0; this.cb = null; }
  step() {
    this.t += 1;
    if (this.t == this.len + 1 && this.cb) this.cb();
  }
  draw() {
    draw_set_color(this.color);
    G.ctx.save();
    G.ctx.globalAlpha = Math.min(1, this.t / this.len);
    G.ctx.fillStyle = this.color ? '#fff' : '#000';
    G.ctx.fillRect(G.camX - 10, G.camY - 10, 700, 520);
    G.ctx.restore();
  }
}
defineObject('obj_sim_fade', Fade);

export function fadeOut(len, cb, color = 0) {
  const f = instance_create(0, 0, 'obj_sim_fade');
  f.len = len;
  f.cb = cb;
  f.color = color;
  return f;
}

export function centerText(x, y, s) {
  draw_text(round(x - string_width(s) / 2), y, s);
}

void draw_sprite;
