// CONTROLS screen: rebind each action to a keyboard key and a gamepad button.
import {
  Instance, defineObject, instance_create, instance_destroy, controls, setControls, captureNextInput, cancelCapture,
  up_p, down_p, button1_p, button2_p, draw_set_font, draw_set_color, draw_set_alpha, draw_set_halign, draw_text,
  draw_sprite_ext, fa_left, fa_center,
} from '../runtime/gm.js?v=20261101031117';
import { snd_play } from '../runtime/audio.js?v=20261101031117';
import { saveControls } from '../settings.js?v=20261101031117';

const KEY_NAMES = {
  8: 'BACKSPACE', 9: 'TAB', 13: 'ENTER', 16: 'SHIFT', 17: 'CTRL', 18: 'ALT', 27: 'ESC', 32: 'SPACE',
  37: 'LEFT', 38: 'UP', 39: 'RIGHT', 40: 'DOWN', 186: ';', 187: '=', 188: ',', 189: '-', 190: '.',
  191: '/', 192: '`', 219: '[', 220: '\\', 221: ']', 222: "'",
};
export function keyName(k) {
  if (k == null) return '-';
  if (KEY_NAMES[k]) return KEY_NAMES[k];
  if ((k >= 48 && k <= 57) || (k >= 65 && k <= 90)) return String.fromCharCode(k);
  if (k >= 112 && k <= 123) return 'F' + (k - 111);
  if (k >= 96 && k <= 105) return 'NUM' + (k - 96);
  return '#' + k;
}

const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L3', 'R3',
  'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'];
export const padName = b => (b == null ? '-' : PAD_NAMES[b] ?? 'BTN' + b);

const ACTIONS = [
  ['confirm', 'CONFIRM'], ['cancel', 'CANCEL'], ['menu', 'MENU'],
  ['up', 'UP'], ['down', 'DOWN'], ['left', 'LEFT'], ['right', 'RIGHT'], ['pause', 'PAUSE'],
];

// The new input becomes the action's main binding; an action that used it gets the old one.
function bind(action, field, code) {
  const mine = controls[action][field];
  const old = mine[0];
  for (const [a] of ACTIONS) {
    if (a === action) continue;
    const list = controls[a][field];
    const i = list.indexOf(code);
    if (i < 0) continue;
    if (old != null && old !== code && !list.includes(old)) list[i] = old;
    else list.splice(i, 1);
  }
  const rest = mine.filter(c => c !== code && c !== old);
  controls[action][field] = [code, ...rest];
}

const list = (codes, name) => codes.slice(0, 2).map(name).join(' / ') || '-';

class ControlsMenu extends Instance {
  create() {
    this.depth = -20;
    this.cur = 0;
    this.waiting = false;
    this.cooldown = 3;
    this.onClose = null;
    this.msg = '';
    this.t = 0;
  }
  step() {
    this.t += 1;
    if (this.waiting) return;
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return;
    }
    const n = ACTIONS.length + 2;
    if (down_p()) { this.cur = (this.cur + 1) % n; snd_play('snd_menumove'); }
    if (up_p()) { this.cur = (this.cur + n - 1) % n; snd_play('snd_menumove'); }
    if (button1_p()) {
      snd_play('snd_select');
      if (this.cur < ACTIONS.length) this.listen(ACTIONS[this.cur][0]);
      else if (this.cur === ACTIONS.length) {
        setControls(null);
        saveControls();
        this.msg = 'DEFAULT CONTROLS RESTORED';
      } else this.close();
    } else if (button2_p()) this.close();
  }
  listen(action) {
    this.waiting = true;
    this.msg = '';
    captureNextInput(inp => {
      this.waiting = false;
      this.cooldown = 8;
      if (inp.type === 'cancel') return;
      bind(action, inp.type === 'key' ? 'keys' : 'pad', inp.code);
      saveControls();
      snd_play('snd_select');
    });
  }
  close() {
    cancelCapture();
    snd_play('snd_menumove');
    instance_destroy(this);
    if (this.onClose) this.onClose();
  }
  draw() {
    const top = 92, gap = 30;
    draw_set_halign(fa_left);
    draw_set_font('fnt_main');
    draw_set_color(0x808080);
    draw_text(330, top - 26, 'KEYBOARD');
    draw_text(480, top - 26, 'GAMEPAD');
    draw_set_font('fnt_mainbig');
    ACTIONS.forEach(([a, label], i) => {
      const y = top + i * gap;
      const sel = i === this.cur;
      draw_set_color(sel ? 0xffff00 : 0xffffff);
      draw_text(110, y, label);
      if (sel && this.waiting) {
        draw_set_alpha(0.5 + 0.5 * Math.sin(this.t / 5));
        draw_text(330, y, 'PRESS...');
        draw_set_alpha(1);
      } else {
        draw_text(330, y, list(controls[a].keys, keyName));
        draw_text(480, y, list(controls[a].pad, padName));
      }
    });
    const extra = ['RESET TO DEFAULT', 'BACK'];
    extra.forEach((label, j) => {
      const i = ACTIONS.length + j;
      draw_set_color(i === this.cur ? 0xffff00 : 0xffffff);
      draw_text(110, top + i * gap, label);
    });
    draw_sprite_ext('spr_heart', 0, 80, top + 10 + this.cur * gap, 1, 1, 0, 0xffffff, 1);
    draw_set_font('fnt_main');
    draw_set_halign(fa_center);
    draw_set_color(this.waiting ? 0xffff00 : 0x808080);
    const help = this.waiting ? 'PRESS A KEY OR A GAMEPAD BUTTON   (ESC: CANCEL)'
      : this.msg || 'CONFIRM: CHANGE    CANCEL: BACK    THE LEFT STICK ALWAYS MOVES';
    draw_text(320, 420, help);
    draw_set_halign(fa_left);
  }
}
defineObject('obj_sim_controls', ControlsMenu);

export function openControls(onClose) {
  const m = instance_create(0, 0, 'obj_sim_controls');
  m.onClose = onClose;
  return m;
}
