// A small GameMaker-like runtime so the fight's GML can be ported near-literally.
//
// Conventions for ported code:
// - Objects are JS classes registered with defineObject('obj_name', Class). Inheritance uses
//   JS `extends`; event_inherited() becomes super.<event>().
// - Event methods: create, beginStep, step, endStep, draw, drawEnd, onDestroy, animationEnd,
//   alarm0..alarm11, user0..user15, and collision_<objname>(other).
// - Assets are referenced by name: sprite_index = 'spr_joker_main', snd_play('snd_graze').
// - Colours are 0xRRGGBB numbers. GML literals are BGR: wrap them in bgr(0x...).
// - Angles are degrees, counter-clockwise; y points down (same as GameMaker).
// - `global` holds GML globals: global.tension, global.hp[...] etc.
import { assets, spriteMask } from './assets.js?v=20261031024711';

export const global = {};
export const ROOM_W = 640;
export const ROOM_H = 480;

export const G = {
  frame: 0,
  camX: 0,
  camY: 0,
  instances: [],
  ctx: null,
  debug: { hitboxes: false },
  other: null,
};

// ---------------------------------------------------------------- objects

const registry = new Map();
let nextId = 100000;
const warned = new Set();

export class Instance {
  constructor() {
    this.id = nextId++;
    this.alive = true;
    this.x = 0; this.y = 0;
    this.xstart = 0; this.ystart = 0;
    this.xprevious = 0; this.yprevious = 0;
    this.sprite_index = null;
    this.mask_index = null;
    this.image_index = 0;
    this.image_speed = 1;
    this.image_xscale = 1;
    this.image_yscale = 1;
    this.image_angle = 0;
    this.image_blend = 0xffffff;
    this.image_alpha = 1;
    this.depth = 0;
    this.visible = true;
    this.persistent = false;
    this.alarm = new Array(12).fill(-1);
    this._h = 0; this._v = 0; this._speed = 0; this._dir = 0;
    this.friction = 0;
    this.gravity = 0;
    this.gravity_direction = 270;
  }

  get object_index() { return this.constructor.objName; }

  // Motion variables keep GameMaker's speed/direction <-> hspeed/vspeed coupling.
  get speed() { return this._speed; }
  set speed(v) { this._speed = v; this._updHV(); }
  get direction() { return this._dir; }
  set direction(v) { this._dir = ((v % 360) + 360) % 360; this._updHV(); }
  get hspeed() { return this._h; }
  set hspeed(v) { this._h = v; this._updSD(); }
  get vspeed() { return this._v; }
  set vspeed(v) { this._v = v; this._updSD(); }
  _updHV() {
    const r = this._dir * Math.PI / 180;
    this._h = this._speed * Math.cos(r);
    this._v = -this._speed * Math.sin(r);
    if (Math.abs(this._h) < 1e-10) this._h = 0;
    if (Math.abs(this._v) < 1e-10) this._v = 0;
  }
  _updSD() {
    this._speed = Math.hypot(this._h, this._v);
    if (this._h !== 0 || this._v !== 0) this._dir = ((Math.atan2(-this._v, this._h) * 180 / Math.PI) % 360 + 360) % 360;
  }
  motion_set(dir, spd) { this._dir = ((dir % 360) + 360) % 360; this._speed = spd; this._updHV(); }
  motion_add(dir, spd) {
    const r = dir * Math.PI / 180;
    this._h += spd * Math.cos(r);
    this._v -= spd * Math.sin(r);
    this._updSD();
  }

  get sprite() { return this.sprite_index ? getSprite(this.sprite_index) : null; }
  get sprite_width() { const s = this.sprite; return s ? s.w * this.image_xscale : 0; }
  get sprite_height() { const s = this.sprite; return s ? s.h * this.image_yscale : 0; }
  get image_number() { const s = this.sprite; return s ? s.n : 0; }
  get bbox_left() { return instBBox(this)?.[0] ?? this.x; }
  get bbox_top() { return instBBox(this)?.[1] ?? this.y; }
  get bbox_right() { return instBBox(this)?.[2] ?? this.x; }
  get bbox_bottom() { return instBBox(this)?.[3] ?? this.y; }
}

export function defineObject(name, cls) {
  cls.objName = name;
  registry.set(name, cls);
  return cls;
}

export function objectExists(name) {
  return registry.has(name);
}

function classFor(name) {
  let cls = registry.get(name);
  if (!cls) {
    if (!warned.has(name)) { warned.add(name); console.warn('instance_create: object not ported yet:', name); }
    cls = defineObject(name, class extends Instance {});
  }
  return cls;
}

export function isA(inst, name) {
  if (!inst || !name) return false;
  if (name === 'all') return true;
  let c = inst.constructor;
  while (c && c !== Instance) {
    if (Object.prototype.hasOwnProperty.call(c, 'objName') && c.objName === name) return true;
    c = Object.getPrototypeOf(c);
  }
  return false;
}

export function instance_create(x, y, name) {
  const cls = classFor(name);
  const inst = new cls();
  inst.x = inst.xstart = inst.xprevious = x;
  inst.y = inst.ystart = inst.yprevious = y;
  G.instances.push(inst);
  const prevOther = G.other;
  if (inst.create) inst.create();
  G.other = prevOther;
  return inst;
}
export const instance_create_depth = (x, y, depth, name) => {
  const i = instance_create(x, y, name);
  i.depth = depth;
  return i;
};

export function instance_destroy(inst) {
  if (!inst || !inst.alive) return;
  inst.alive = false;
  if (inst.onDestroy) inst.onDestroy();
}

// Instances matching a name, an instance, or an array of either. Alive only, creation order.
export function instancesOf(target) {
  if (target == null) return [];
  if (target instanceof Instance) return target.alive ? [target] : [];
  if (Array.isArray(target)) return target.flatMap(instancesOf);
  return G.instances.filter(i => i.alive && isA(i, target));
}

// with (target) { ... }: fn receives each instance; G.other is the caller during the loop.
export function withObj(target, fn, caller = null) {
  const prev = G.other;
  G.other = caller;
  for (const inst of instancesOf(target)) if (inst.alive) fn(inst);
  G.other = prev;
}

export const instance_exists = t => instancesOf(t).length > 0;
export const instance_number = t => instancesOf(t).length;
export const instance_find = (t, n) => instancesOf(t)[n] ?? null;
export function instance_nearest(x, y, t) {
  let best = null, bd = Infinity;
  for (const i of instancesOf(t)) {
    const d = Math.hypot(i.x - x, i.y - y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function event_user(inst, n) {
  const fn = inst['user' + n];
  if (fn) fn.call(inst);
}

export function event_perform_alarm(inst, n) {
  const fn = inst['alarm' + n];
  if (fn) fn.call(inst);
}

// GML scripts, registered by name so modules can call each other without import cycles:
// defineScript('scr_damage', fn) and then S.scr_damage(...). Scripts that use the calling
// instance's variables take that instance as their first argument.
const scripts = new Map();
export function defineScript(name, fn) {
  scripts.set(name, fn);
  return fn;
}
export const S = new Proxy({}, {
  get(_, name) {
    const fn = scripts.get(name);
    if (fn) return fn;
    return (...args) => {
      if (!warned.has('script:' + String(name))) { warned.add('script:' + String(name)); console.warn('script not ported yet:', name); }
      return 0;
    };
  },
  has(_, name) { return scripts.has(name); },
});

// Destroys everything (no Destroy events) and clears globals: used for retry.
export function room_reset() {
  for (const i of G.instances) i.alive = false;
  G.instances = [];
  for (const k of Object.keys(global)) delete global[k];
  G.camX = G.camY = 0;
}

// ---------------------------------------------------------------- sprites and masks

export function getSprite(name) {
  const s = assets.sprites[name];
  if (!s && !warned.has(name)) { warned.add(name); console.warn('missing sprite', name); }
  return s || null;
}
export const sprite_get_width = n => getSprite(n)?.w ?? 0;
export const sprite_get_height = n => getSprite(n)?.h ?? 0;
export const sprite_get_number = n => getSprite(n)?.n ?? 0;
export const sprite_get_xoffset = n => getSprite(n)?.ox ?? 0;
export const sprite_get_yoffset = n => getSprite(n)?.oy ?? 0;

function frameOf(spr, sub) {
  const n = Math.max(1, spr.n);
  let f = Math.floor(sub) % n;
  if (f < 0) f += n;
  return f;
}

// Local (unrotated) mask rectangle relative to the origin: [l, t, r, b] with r/b exclusive.
function maskRect(spr) {
  const [l, t, r, b] = spr.bbox;
  return [l - spr.ox, t - spr.oy, r + 1 - spr.ox, b + 1 - spr.oy];
}

function maskSprite(inst) {
  const name = inst.mask_index ?? inst.sprite_index;
  return name ? getSprite(name) : null;
}

function transformPoint(inst, lx, ly) {
  const a = -inst.image_angle * Math.PI / 180;
  const sx = lx * inst.image_xscale, sy = ly * inst.image_yscale;
  return [inst.x + sx * Math.cos(a) - sy * Math.sin(a), inst.y + sx * Math.sin(a) + sy * Math.cos(a)];
}

// World-space AABB of the instance mask: [left, top, right, bottom] (inclusive, GM style).
export function instBBox(inst) {
  const spr = maskSprite(inst);
  if (!spr) return null;
  const [l, t, r, b] = maskRect(spr);
  if (inst.image_angle === 0) {
    const x1 = inst.x + l * inst.image_xscale, x2 = inst.x + r * inst.image_xscale;
    const y1 = inst.y + t * inst.image_yscale, y2 = inst.y + b * inst.image_yscale;
    return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2) - 1, Math.max(y1, y2) - 1];
  }
  const pts = [[l, t], [r, t], [l, b], [r, b]].map(([px, py]) => transformPoint(inst, px, py));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs) - 1, Math.max(...ys) - 1];
}

// Is world point (px, py) inside the instance's collision mask?
function pointInMask(inst, spr, px, py) {
  const a = inst.image_angle * Math.PI / 180;
  const dx = px - inst.x, dy = py - inst.y;
  let lx = dx * Math.cos(a) - dy * Math.sin(a);
  let ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (inst.image_xscale === 0 || inst.image_yscale === 0) return false;
  lx /= inst.image_xscale;
  ly /= inst.image_yscale;
  const ix = Math.floor(lx + spr.ox), iy = Math.floor(ly + spr.oy);
  const [l, t, r, b] = spr.bbox;
  if (ix < l || ix > r || iy < t || iy > b) return false;
  if (spr.sepMasks !== 1) return true;
  return spriteMask(spr, frameOf(spr, inst.image_index))[iy * spr.w + ix] === 1;
}

// sepMasks: 0 = axis-aligned rectangle (AABB of the transformed bbox), 1 = precise, 2 = rotated rectangle.
function needsPixelTest(inst, spr) {
  return spr.sepMasks === 1 || (spr.sepMasks === 2 && inst.image_angle % 360 !== 0);
}

export function instancesCollide(a, b) {
  if (a === b || !a.alive || !b.alive) return false;
  const sa = maskSprite(a), sb = maskSprite(b);
  if (!sa || !sb) return false;
  const A = instBBox(a), B = instBBox(b);
  const l = Math.max(A[0], B[0]), t = Math.max(A[1], B[1]);
  const r = Math.min(A[2], B[2]), btm = Math.min(A[3], B[3]);
  if (l > r || t > btm) return false;
  const pa = needsPixelTest(a, sa), pb = needsPixelTest(b, sb);
  if (!pa && !pb) return true;
  for (let y = Math.floor(t); y <= btm; y++) {
    for (let x = Math.floor(l); x <= r; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      if ((!pa || pointInMask(a, sa, cx, cy)) && (!pb || pointInMask(b, sb, cx, cy))) return true;
    }
  }
  return false;
}

export function place_meeting(inst, x, y, target) {
  return !!instance_place(inst, x, y, target);
}

export function instance_place(inst, x, y, target) {
  const ox = inst.x, oy = inst.y;
  inst.x = x; inst.y = y;
  let hit = null;
  for (const o of instancesOf(target)) {
    if (o !== inst && instancesCollide(inst, o)) { hit = o; break; }
  }
  inst.x = ox; inst.y = oy;
  return hit;
}

export function collision_point(px, py, target, prec, notme = null) {
  for (const o of instancesOf(target)) {
    if (o === notme) continue;
    const s = maskSprite(o);
    if (!s) continue;
    const bb = instBBox(o);
    if (px < bb[0] || px > bb[2] + 1 || py < bb[1] || py > bb[3] + 1) continue;
    if (!prec || !needsPixelTest(o, s) || pointInMask(o, s, px, py)) return o;
  }
  return null;
}

export function collision_rectangle(x1, y1, x2, y2, target, prec, notme = null) {
  const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
  for (const o of instancesOf(target)) {
    if (o === notme) continue;
    const s = maskSprite(o);
    if (!s) continue;
    const bb = instBBox(o);
    if (bb[0] > r || bb[2] < l || bb[1] > b || bb[3] < t) continue;
    if (!prec || !needsPixelTest(o, s)) return o;
    for (let y = Math.floor(Math.max(t, bb[1])); y <= Math.min(b, bb[3]); y++)
      for (let x = Math.floor(Math.max(l, bb[0])); x <= Math.min(r, bb[2]); x++)
        if (pointInMask(o, s, x + 0.5, y + 0.5)) return o;
  }
  return null;
}

export function collision_circle(cx, cy, rad, target, prec, notme = null) {
  for (const o of instancesOf(target)) {
    if (o === notme) continue;
    const s = maskSprite(o);
    if (!s) continue;
    const bb = instBBox(o);
    const nx = Math.max(bb[0], Math.min(cx, bb[2] + 1)), ny = Math.max(bb[1], Math.min(cy, bb[3] + 1));
    if (Math.hypot(nx - cx, ny - cy) > rad) continue;
    if (!prec || !needsPixelTest(o, s)) return o;
    for (let y = Math.floor(Math.max(cy - rad, bb[1])); y <= Math.min(cy + rad, bb[3]); y++)
      for (let x = Math.floor(Math.max(cx - rad, bb[0])); x <= Math.min(cx + rad, bb[2]); x++)
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rad && pointInMask(o, s, x + 0.5, y + 0.5)) return o;
  }
  return null;
}

export function collision_line(x1, y1, x2, y2, target, prec, notme = null) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  for (let i = 0; i <= steps; i++) {
    const o = collision_point(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps, target, prec, notme);
    if (o) return o;
  }
  return null;
}

// ---------------------------------------------------------------- maths and random

let seed = (Math.random() * 2 ** 32) >>> 0;
function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const random_set_seed = s => { seed = s >>> 0; };
export const randomize = () => { seed = (Math.random() * 2 ** 32) >>> 0; };
export const random = n => rnd() * n;
export const random_range = (a, b) => a + rnd() * (b - a);
export const irandom = n => Math.floor(rnd() * (Math.floor(n) + 1));
export const irandom_range = (a, b) => Math.floor(a) + irandom(Math.floor(b) - Math.floor(a));
export const choose = (...args) => args[Math.floor(rnd() * args.length)];

// GameMaker round() is round-half-to-even.
export function round(v) {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
export const floor = Math.floor;
export const ceil = Math.ceil;
export const abs = Math.abs;
export const sign = Math.sign;
export const sqrt = Math.sqrt;
export const sqr = v => v * v;
export const power = Math.pow;
export const min = Math.min;
export const max = Math.max;
export const frac = v => v - Math.trunc(v);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const degtorad = d => d * Math.PI / 180;
export const radtodeg = r => r * 180 / Math.PI;
export const dsin = d => Math.sin(d * Math.PI / 180);
export const dcos = d => Math.cos(d * Math.PI / 180);
export const lengthdir_x = (len, dir) => len * Math.cos(dir * Math.PI / 180);
export const lengthdir_y = (len, dir) => -len * Math.sin(dir * Math.PI / 180);
export const point_distance = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export function point_direction(x1, y1, x2, y2) {
  if (x1 === x2 && y1 === y2) return 0;
  return ((Math.atan2(-(y2 - y1), x2 - x1) * 180 / Math.PI) % 360 + 360) % 360;
}
export const angle_difference = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
export const point_in_rectangle = (px, py, x1, y1, x2, y2) => px >= x1 && px <= x2 && py >= y1 && py <= y2;
export const real = v => Number(v);
export const string = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v));
export const string_length = s => String(s).length;
export const string_char_at = (s, i) => String(s).charAt(i - 1);
export const string_copy = (s, i, n) => String(s).substr(i - 1, n);
export const string_upper = s => String(s).toUpperCase();
export const string_hash_to_newline = s => String(s).replace(/#/g, '\n');

// ---------------------------------------------------------------- input

export const vk = { left: 37, up: 38, right: 39, down: 40, enter: 13, shift: 16, control: 17, escape: 27, space: 32, f1: 112, f2: 113, f3: 114, f4: 115 };
const CODE_TO_VK = {
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, NumpadEnter: 13,
  ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17, Escape: 27, Space: 32,
};
const down = new Set(), pressedRaw = new Set(), releasedRaw = new Set();
let held = new Set(), pressed = new Set(), released = new Set();

function keyVk(e) {
  if (CODE_TO_VK[e.code] !== undefined) return CODE_TO_VK[e.code];
  if (/^Key[A-Z]$/.test(e.code)) return e.code.charCodeAt(3);
  if (/^Digit\d$/.test(e.code)) return e.code.charCodeAt(5);
  if (/^F\d+$/.test(e.code)) return 111 + Number(e.code.slice(1));
  return e.keyCode;
}

// Remappable controls. Each action has keyboard key codes and gamepad buttons (standard
// mapping: 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 8 Select, 9 Start, 12-15 D-pad).
export const DEFAULT_CONTROLS = {
  confirm: { keys: [90, 13], pad: [0] },
  cancel: { keys: [88, 16], pad: [1] },
  menu: { keys: [67, 17], pad: [3] },
  up: { keys: [38], pad: [12] },
  down: { keys: [40], pad: [13] },
  left: { keys: [37], pad: [14] },
  right: { keys: [39], pad: [15] },
  pause: { keys: [27, 80], pad: [9] },
};
const cloneControls = c => Object.fromEntries(Object.entries(c).map(([a, v]) => [a, { keys: [...v.keys], pad: [...v.pad] }]));
export const controls = cloneControls(DEFAULT_CONTROLS);
export function setControls(c) {
  const d = cloneControls(DEFAULT_CONTROLS);
  for (const a of Object.keys(d)) {
    const v = c?.[a];
    controls[a] = v && Array.isArray(v.keys) && Array.isArray(v.pad) ? { keys: [...v.keys], pad: [...v.pad] } : d[a];
  }
  // Bindings saved before PAUSE existed had Start on confirm; Start now pauses.
  if (c && !c.pause) controls.confirm.pad = controls.confirm.pad.filter(b => b !== 9);
}

// Gamepad buttons and the left stick show up in the key state as pseudo key codes.
const PAD = 1000, STICK = 1100; // PAD + button index; STICK + 0..3 = up, down, left, right
const STICK_DIRS = ['up', 'down', 'left', 'right'];
// On-screen controls press actions directly, so they keep working after any rebinding.
const ACTION_CODE = { confirm: 1200, cancel: 1201, menu: 1202, up: 1203, down: 1204, left: 1205, right: 1206, pause: 1207 };
export const virtualAction = (a, isDown) => virtualKey(ACTION_CODE[a], isDown);
const codesOf = a => {
  const c = controls[a];
  const out = [...c.keys, ...c.pad.map(b => PAD + b), ACTION_CODE[a]];
  const s = STICK_DIRS.indexOf(a);
  if (s >= 0) out.push(STICK + s);
  return out;
};

// Rebinding: the next key or gamepad button goes to the callback instead of the game.
let capture = null;
const swallowed = new Set();
export function captureNextInput(cb) { capture = cb; }
export function cancelCapture() { capture = null; }

export function inputAttach(target = window) {
  target.addEventListener('keydown', e => {
    const k = keyVk(e);
    if (capture) {
      const cb = capture;
      capture = null;
      swallowed.add(k);
      e.preventDefault();
      cb(k === 27 ? { type: 'cancel' } : { type: 'key', code: k });
      return;
    }
    if (swallowed.has(k)) return;
    if (!down.has(k)) pressedRaw.add(k);
    down.add(k);
    if ([37, 38, 39, 40, 32, 13].includes(k) || (k >= 112 && k <= 115)) e.preventDefault();
  });
  target.addEventListener('keyup', e => {
    const k = keyVk(e);
    if (swallowed.delete(k)) return;
    down.delete(k);
    releasedRaw.add(k);
  });
  target.addEventListener('blur', () => down.clear());
}

// On-screen (touch) controls feed the same key state as the keyboard.
export function virtualKey(k, isDown) {
  if (isDown) {
    if (!down.has(k)) pressedRaw.add(k);
    down.add(k);
  } else if (down.has(k)) {
    down.delete(k);
    releasedRaw.add(k);
  }
}

const STICK_DEADZONE = 0.5;
let padHeld = new Set();
function pollGamepads() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const now = new Set();
  for (const p of pads) {
    if (!p || !p.connected) continue;
    p.buttons.forEach((b, i) => { if (b?.pressed) now.add(PAD + i); });
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    if (ay < -STICK_DEADZONE) now.add(STICK);
    if (ay > STICK_DEADZONE) now.add(STICK + 1);
    if (ax < -STICK_DEADZONE) now.add(STICK + 2);
    if (ax > STICK_DEADZONE) now.add(STICK + 3);
  }
  for (const k of now) {
    if (padHeld.has(k)) continue;
    if (capture && k < STICK) {
      const cb = capture;
      capture = null;
      swallowed.add(k);
      cb({ type: 'pad', code: k - PAD });
    } else if (!swallowed.has(k)) virtualKey(k, true);
  }
  for (const k of padHeld) {
    if (now.has(k)) continue;
    if (!swallowed.delete(k)) virtualKey(k, false);
  }
  padHeld = now;
}

// Called once per frame before Begin Step (obj_time does the same in the game).
export function inputLatch() {
  pollGamepads();
  pressed = new Set(pressedRaw);
  released = new Set(releasedRaw);
  held = new Set([...down, ...pressedRaw]);
  pressedRaw.clear();
  releasedRaw.clear();
}

const key = k => (typeof k === 'string' ? k.toUpperCase().charCodeAt(0) : k);
export const keyboard_check = k => held.has(key(k));
export const keyboard_check_pressed = k => pressed.has(key(k));
export const keyboard_check_released = k => released.has(key(k));
const any = (set, a) => codesOf(a).some(k => set.has(k));
export const button1_p = () => any(pressed, 'confirm');
export const button2_p = () => any(pressed, 'cancel');
export const button3_p = () => any(pressed, 'menu');
export const button1_h = () => any(held, 'confirm');
export const button2_h = () => any(held, 'cancel');
export const button3_h = () => any(held, 'menu');
export const button1_r = () => any(released, 'confirm');
export const button2_r = () => any(released, 'cancel');
export const left_p = () => any(pressed, 'left');
export const right_p = () => any(pressed, 'right');
export const up_p = () => any(pressed, 'up');
export const down_p = () => any(pressed, 'down');
export const left_h = () => any(held, 'left');
export const right_h = () => any(held, 'right');
export const up_h = () => any(held, 'up');
export const down_h = () => any(held, 'down');
export const pause_p = () => any(pressed, 'pause');

// ---------------------------------------------------------------- drawing

export const c_white = 0xffffff, c_black = 0x000000, c_red = 0xff0000, c_lime = 0x00ff00, c_blue = 0x0000ff,
  c_yellow = 0xffff00, c_aqua = 0x00ffff, c_fuchsia = 0xff00ff, c_gray = 0x808080, c_grey = 0x808080,
  c_dkgray = 0x404040, c_ltgray = 0xc0c0c0, c_silver = 0xc0c0c0, c_maroon = 0x800000, c_navy = 0x000080,
  c_green = 0x008000, c_olive = 0x808000, c_purple = 0x800080, c_teal = 0x008080, c_orange = 0xffa040;
export const fa_left = 0, fa_center = 1, fa_right = 2, fa_top = 0, fa_middle = 1, fa_bottom = 2;
export const bm_normal = 'source-over', bm_add = 'lighter', bm_subtract = 'difference';

// GML colour literals are 0xBBGGRR.
export const bgr = c => ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
export const make_color_rgb = (r, g, b) => ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
export const color_get_red = c => (c >> 16) & 255;
export const color_get_green = c => (c >> 8) & 255;
export const color_get_blue = c => c & 255;
export function merge_color(c1, c2, amt) {
  const ch = s => {
    const a = (c1 >> s) & 255, b = (c2 >> s) & 255;
    return Math.trunc(a + (b - a) * amt) & 255;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
export function make_color_hsv(h, s, v) {
  h = (h / 255) * 360; s /= 255; v /= 255;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return make_color_rgb(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
}

const draw = { color: 0xffffff, alpha: 1, font: null, halign: 0, valign: 0, blend: 'source-over' };
const css = c => '#' + (c & 0xffffff).toString(16).padStart(6, '0');

export const draw_set_color = c => { draw.color = c; };
export const draw_set_colour = draw_set_color;
export const draw_get_color = () => draw.color;
export const draw_set_alpha = a => { draw.alpha = a; };
export const draw_get_alpha = () => draw.alpha;
export const draw_set_halign = a => { draw.halign = a; };
export const draw_set_valign = a => { draw.valign = a; };
export const draw_set_blend_mode = m => { draw.blend = m; };
export const gpu_set_blendmode = draw_set_blend_mode;

// Per-image caches (sprite strips are canvases, so they are keyed by object, not URL).
function cacheGet(cache, img, color) {
  return cache.get(img)?.get(color);
}
function cacheSet(cache, img, color, c) {
  if (!cache.has(img)) cache.set(img, new Map());
  cache.get(img).set(color, c);
}

const tintCache = new WeakMap();
function tinted(img, color) {
  if ((color & 0xffffff) === 0xffffff) return img;
  let c = cacheGet(tintCache, img, color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = css(color);
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(img, 0, 0);
    cacheSet(tintCache, img, color, c);
  }
  return c;
}

// d3d_set_fog(true, colour, 0, 1): sprites are drawn as solid silhouettes in that colour.
let fogColor = null;
const fogCache = new WeakMap();
export function d3d_set_fog(enable, color = 0xffffff) {
  fogColor = enable ? (color & 0xffffff) : null;
}
function fogged(img, color) {
  let c = cacheGet(fogCache, img, color);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = css(color);
    x.fillRect(0, 0, c.width, c.height);
    cacheSet(fogCache, img, color, c);
  }
  return c;
}
const sprSource = (img, col) => (fogColor !== null ? fogged(img, fogColor) : tinted(img, col));

function begin(alpha) {
  const ctx = G.ctx;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.globalCompositeOperation = draw.blend;
  return ctx;
}

export function draw_sprite_ext(name, sub, x, y, xs = 1, ys = 1, rot = 0, col = 0xffffff, alpha = 1) {
  const spr = getSprite(name);
  if (!spr || !spr.img || alpha <= 0) return;
  const f = frameOf(spr, sub);
  const ctx = begin(alpha);
  ctx.translate(x, y);
  if (rot) ctx.rotate(-rot * Math.PI / 180);
  if (xs !== 1 || ys !== 1) ctx.scale(xs, ys);
  ctx.drawImage(sprSource(spr.img, col), f * spr.w, 0, spr.w, spr.h, -spr.ox, -spr.oy, spr.w, spr.h);
  ctx.restore();
}

export function draw_sprite(name, sub, x, y) {
  draw_sprite_ext(name, sub, x, y, 1, 1, 0, 0xffffff, draw.alpha);
}

// Draws part of a frame (left/top/width/height inside the frame) with its top-left at x, y.
export function draw_sprite_part_ext(name, sub, left, top, w, h, x, y, xs = 1, ys = 1, col = 0xffffff, alpha = 1) {
  const spr = getSprite(name);
  if (!spr || !spr.img || w <= 0 || h <= 0) return;
  const f = frameOf(spr, sub);
  const ctx = begin(alpha);
  ctx.translate(x, y);
  ctx.scale(xs, ys);
  ctx.drawImage(sprSource(spr.img, col), f * spr.w + left, top, w, h, 0, 0, w, h);
  ctx.restore();
}
export const draw_sprite_part = (name, sub, left, top, w, h, x, y) =>
  draw_sprite_part_ext(name, sub, left, top, w, h, x, y, 1, 1, 0xffffff, draw.alpha);

export function draw_sprite_stretched_ext(name, sub, x, y, w, h, col = 0xffffff, alpha = 1) {
  const spr = getSprite(name);
  if (!spr || !spr.img) return;
  const f = frameOf(spr, sub);
  const ctx = begin(alpha);
  ctx.drawImage(sprSource(spr.img, col), f * spr.w, 0, spr.w, spr.h, x, y, w, h);
  ctx.restore();
}

export function draw_self(inst) {
  if (inst.sprite_index)
    draw_sprite_ext(inst.sprite_index, inst.image_index, inst.x, inst.y, inst.image_xscale, inst.image_yscale,
      inst.image_angle, inst.image_blend, inst.image_alpha);
}

// draw_rectangle fills the inclusive pixel box, like GameMaker.
export function draw_rectangle(x1, y1, x2, y2, outline = false) {
  const ctx = begin(draw.alpha);
  const l = Math.min(x1, x2), t = Math.min(y1, y2), w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1;
  if (outline) {
    ctx.strokeStyle = css(draw.color);
    ctx.lineWidth = 1;
    ctx.strokeRect(l + 0.5, t + 0.5, w - 1, h - 1);
  } else {
    ctx.fillStyle = css(draw.color);
    ctx.fillRect(l, t, w, h);
  }
  ctx.restore();
}
export function draw_rectangle_color(x1, y1, x2, y2, c1, c2, c3, c4, outline = false) {
  const prev = draw.color;
  draw.color = c1;
  draw_rectangle(x1, y1, x2, y2, outline);
  draw.color = prev;
}

export function draw_line_width(x1, y1, x2, y2, w) {
  const ctx = begin(draw.alpha);
  ctx.strokeStyle = css(draw.color);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}
export const draw_line = (x1, y1, x2, y2) => draw_line_width(x1 + 0.5, y1 + 0.5, x2 + 0.5, y2 + 0.5, 1);

export function draw_circle(x, y, r, outline = false) {
  const ctx = begin(draw.alpha);
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
  if (outline) { ctx.strokeStyle = css(draw.color); ctx.stroke(); } else { ctx.fillStyle = css(draw.color); ctx.fill(); }
  ctx.restore();
}

export function draw_triangle(x1, y1, x2, y2, x3, y3, outline = false) {
  const ctx = begin(draw.alpha);
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
  if (outline) { ctx.strokeStyle = css(draw.color); ctx.stroke(); } else { ctx.fillStyle = css(draw.color); ctx.fill(); }
  ctx.restore();
}

// Fills a polygon given as [[x, y], ...]: handy for primitives (draw_primitive_begin ports).
export function draw_polygon(points, outline = false) {
  const ctx = begin(draw.alpha);
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  if (outline) { ctx.strokeStyle = css(draw.color); ctx.stroke(); } else { ctx.fillStyle = css(draw.color); ctx.fill(); }
  ctx.restore();
}

// ---------------------------------------------------------------- fonts and text

// Sprite fonts (font_add_sprite_ext): glyphs are the frames of a sprite.
export function font_add_sprite_ext(sprName, chars, prop, sep) {
  const spr = getSprite(sprName);
  const glyphs = {};
  [...chars].forEach((ch, i) => {
    let l = 0, w = spr.w;
    if (prop) {
      const m = spriteMask(spr, i);
      let minx = spr.w, maxx = -1;
      for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) if (m[y * spr.w + x]) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); }
      if (maxx >= minx) { l = minx; w = maxx - minx + 1; }
    }
    glyphs[ch.charCodeAt(0)] = { frame: i, left: l, w, adv: w + sep };
  });
  return { type: 'sprite', name: sprName, spr, glyphs, lineHeight: spr.h };
}

function fontOf(f) {
  if (!f) return assets.fonts.fnt_main;
  if (typeof f === 'string') return assets.fonts[f] || assets.fonts['fnt_' + f] || assets.fonts.fnt_main;
  return f;
}
export const draw_set_font = f => { draw.font = fontOf(f); };
export const draw_get_font = () => draw.font;

function lineHeight(font) {
  if (font.type === 'sprite') return font.lineHeight;
  if (!font._lh) font._lh = Math.max(...Object.values(font.glyphs).map(g => g[3]));
  return font._lh;
}

function charAdvance(font, code) {
  if (font.type === 'sprite') return font.glyphs[code]?.adv ?? font.spr.w;
  const g = font.glyphs[code] || font.glyphs[32];
  return g ? g[4] : 0;
}

export function string_width(s) {
  const font = draw.font || fontOf(null);
  let best = 0;
  for (const line of String(s).split('\n')) {
    let w = 0;
    for (const ch of line) w += charAdvance(font, ch.charCodeAt(0));
    best = Math.max(best, w);
  }
  return best;
}
export function string_height(s) {
  const font = draw.font || fontOf(null);
  return String(s).split('\n').length * lineHeight(font);
}

// Vertical two-colour gradient over one glyph cell (draw_text_colour with c1 == c2 and c3 == c4).
const gradCache = new Map();
function gradientGlyph(font, code, top, bot) {
  const keyName = font.name + '|' + code + '|' + top + '|' + bot;
  let c = gradCache.get(keyName);
  if (c) return c;
  const g = font.glyphs[code];
  c = document.createElement('canvas');
  c.width = g[2]; c.height = g[3];
  const x = c.getContext('2d');
  x.drawImage(tinted(font.img, top), g[0], g[1], g[2], g[3], 0, 0, g[2], g[3]);
  const b = document.createElement('canvas');
  b.width = g[2]; b.height = g[3];
  const bx = b.getContext('2d');
  bx.drawImage(tinted(font.img, bot), g[0], g[1], g[2], g[3], 0, 0, g[2], g[3]);
  bx.globalCompositeOperation = 'destination-in';
  const grad = bx.createLinearGradient(0, 0, 0, g[3]);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  bx.fillStyle = grad;
  bx.fillRect(0, 0, g[2], g[3]);
  x.drawImage(b, 0, 0);
  gradCache.set(keyName, c);
  return c;
}

function drawGlyph(ctx, font, code, cx, cy, color) {
  if (Array.isArray(color)) {
    if (font.type !== 'sprite') {
      const g = font.glyphs[code];
      if (!g || g[2] === 0) return;
      ctx.drawImage(gradientGlyph(font, code, color[0], color[1]), cx + g[5], cy);
      return;
    }
    color = color[0];
  }
  if (font.type === 'sprite') {
    const g = font.glyphs[code];
    if (!g) return;
    const spr = font.spr;
    ctx.drawImage(tinted(spr.img, color), g.frame * spr.w + g.left, 0, g.w, spr.h, cx, cy, g.w, spr.h);
    return;
  }
  const g = font.glyphs[code];
  if (!g || g[2] === 0) return;
  ctx.drawImage(tinted(font.img, color), g[0], g[1], g[2], g[3], cx + g[5], cy, g[2], g[3]);
}

export function draw_text_transformed_color(x, y, s, xs, ys, ang, color, alpha) {
  const font = draw.font || fontOf(null);
  const lines = String(s).split('\n');
  const lh = lineHeight(font);
  const ctx = begin(alpha);
  ctx.translate(x, y);
  if (ang) ctx.rotate(-ang * Math.PI / 180);
  ctx.scale(xs, ys);
  let ty = draw.valign === 1 ? -(lines.length * lh) / 2 : draw.valign === 2 ? -lines.length * lh : 0;
  for (const line of lines) {
    let w = 0;
    for (const ch of line) w += charAdvance(font, ch.charCodeAt(0));
    let cx = draw.halign === 1 ? -Math.floor(w / 2) : draw.halign === 2 ? -w : 0;
    for (const ch of line) {
      const code = ch.charCodeAt(0);
      drawGlyph(ctx, font, code, cx, ty, color);
      cx += charAdvance(font, code);
    }
    ty += lh;
  }
  ctx.restore();
}
export const draw_text = (x, y, s) => draw_text_transformed_color(x, y, s, 1, 1, 0, draw.color, draw.alpha);
export const draw_text_transformed = (x, y, s, xs, ys, ang) => draw_text_transformed_color(x, y, s, xs, ys, ang, draw.color, draw.alpha);
// Corner colours c1..c4 (TL, TR, BR, BL): a vertical gradient when c1 == c2 and c3 == c4, else c1.
export const draw_text_color = (x, y, s, c1, c2, c3, c4, alpha) =>
  draw_text_transformed_color(x, y, s, 1, 1, 0, (c1 === c2 && c3 === c4 && c1 !== c3) ? [c1, c3] : c1, alpha);
export const draw_text_colour = draw_text_color;
export const string_replace_all = (s, sub, rep) => String(s).split(String(sub)).join(String(rep));
export const string_insert = (sub, s, pos) => String(s).slice(0, pos - 1) + String(sub) + String(s).slice(pos - 1);
export const string_delete = (s, pos, n) => String(s).slice(0, pos - 1) + String(s).slice(pos - 1 + n);

// English strings (scr_84_get_lang_string).
export function L(key) {
  const s = assets.text[key];
  if (s === undefined) {
    if (!warned.has(key)) { warned.add(key); console.warn('missing text key', key); }
    return key;
  }
  return s;
}

// ---------------------------------------------------------------- frame update

function eventPass(method) {
  for (const inst of G.instances.slice()) {
    if (inst.alive && inst[method]) {
      G.other = null;
      inst[method]();
    }
  }
}

const collisionMethodCache = new Map();
function collisionMethods(cls) {
  let list = collisionMethodCache.get(cls);
  if (!list) {
    list = [];
    const seen = new Set();
    for (let p = cls.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const k of Object.getOwnPropertyNames(p)) {
        if (k.startsWith('collision_') && !seen.has(k)) { seen.add(k); list.push([k, k.slice('collision_'.length)]); }
      }
    }
    collisionMethodCache.set(cls, list);
  }
  return list;
}

export function tick() {
  G.frame++;
  inputLatch();
  eventPass('beginStep');
  for (const inst of G.instances.slice()) {
    if (!inst.alive) continue;
    for (let i = 0; i < 12; i++) {
      if (inst.alarm[i] > 0) {
        inst.alarm[i] -= 1;
        if (inst.alarm[i] <= 0) {
          inst.alarm[i] = -1;
          const fn = inst['alarm' + i];
          if (fn && inst.alive) fn.call(inst);
        }
      }
    }
  }
  eventPass('step');
  for (const inst of G.instances.slice()) {
    if (!inst.alive) continue;
    if (inst.friction !== 0 && inst._speed !== 0) {
      const s = Math.sign(inst._speed) * Math.max(0, Math.abs(inst._speed) - inst.friction);
      inst.speed = s;
    }
    if (inst.gravity !== 0) inst.motion_add(inst.gravity_direction, inst.gravity);
    inst.xprevious = inst.x;
    inst.yprevious = inst.y;
    inst.x += inst._h;
    inst.y += inst._v;
  }
  for (const inst of G.instances.slice()) {
    if (!inst.alive) continue;
    for (const [method, target] of collisionMethods(inst.constructor)) {
      for (const o of instancesOf(target)) {
        if (!inst.alive) break;
        if (o !== inst && instancesCollide(inst, o)) {
          G.other = o;
          inst[method](o);
          G.other = null;
        }
      }
    }
  }
  eventPass('endStep');
  for (const inst of G.instances) {
    if (!inst.alive || !inst.sprite_index) continue;
    const spr = inst.sprite;
    if (!spr) continue;
    inst.image_index += inst.image_speed;
    const n = Math.max(1, spr.n);
    if (inst.image_index >= n) {
      inst.image_index -= n;
      if (inst.animationEnd) inst.animationEnd();
    } else if (inst.image_index < 0) {
      inst.image_index += n;
      if (inst.animationEnd) inst.animationEnd();
    }
  }
  render();
  G.instances = G.instances.filter(i => i.alive);
}

export function render() {
  const ctx = G.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  // G.viewScale: port/view ratio for 320x240 rooms (the game over screen); 1 by default.
  if (G.viewScale && G.viewScale !== 1) ctx.scale(G.viewScale, G.viewScale);
  ctx.translate(-G.camX, -G.camY);
  const list = G.instances.filter(i => i.alive && i.visible).sort((a, b) => b.depth - a.depth || a.id - b.id);
  for (const inst of list) {
    if (!inst.alive) continue;
    draw.blend = 'source-over';
    if (inst.draw) inst.draw();
    else draw_self(inst);
  }
  for (const inst of list) if (inst.alive && inst.drawEnd) inst.drawEnd();
  draw.blend = 'source-over';
  if (G.debug.hitboxes) {
    ctx.save();
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 1;
    for (const inst of G.instances) {
      if (!inst.alive) continue;
      const bb = instBBox(inst);
      if (bb) ctx.strokeRect(bb[0] + 0.5, bb[1] + 0.5, bb[2] - bb[0], bb[3] - bb[1]);
    }
    ctx.restore();
  }
}
