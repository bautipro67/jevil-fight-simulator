// Helpers shared by the Jevil / bullet-phase ports, plus generic effect objects
// (obj_afterimage, obj_afterimage_grow, obj_marker, obj_shake, obj_darkener) that are
// registered here only if the battle modules did not register them first.
import {
  G, global, Instance, defineObject, objectExists, instancesOf, instance_find, instance_create,
  instance_destroy, point_direction, getSprite, draw_self, draw_set_alpha, draw_set_color,
  draw_rectangle,
} from '../runtime/gm.js';

export const VIEW_W = 640;
export const VIEW_H = 480;
export const room_width = 640;
export const room_height = 480;
// __view_get(0, 0) / __view_get(1, 0)
export const view_x = () => G.camX;
export const view_y = () => G.camY;

// GML `obj_x.var` reads the first instance; null when none exists.
export const first = name => instance_find(name, 0);
// GML `obj_x.var = v` writes every instance.
export function setAll(name, key, val) {
  for (const i of instancesOf(name)) i[key] = val;
}

// Stand-ins for reads of instances that may be gone (GameMaker would error instead).
export function heartRef() {
  return first('obj_heart') || { x: G.camX + 310, y: G.camY + 160, alive: false };
}
export function boardRef() {
  return first('obj_battlesolid') || { x: G.camX + 320, y: G.camY + 170, sprite_width: 150, sprite_height: 150, alive: false };
}

export function move_towards_point(inst, x, y, sp) {
  inst.direction = point_direction(inst.x, inst.y, x, y);
  inst.speed = sp;
}

export const scr_84_get_sound = name => name;

// GameMaker compares reals with an epsilon (math_set_epsilon, default 0.00001), which matters
// for accumulated fractions (0.1 added ten times is not >= 1 in JS but is in GML).
const EPS = 0.00001;
export const lt = (a, b) => a - b < -EPS;
export const gt = (a, b) => a - b > EPS;
export const le = (a, b) => a - b <= EPS;
export const ge = (a, b) => a - b >= -EPS;
export const eq = (a, b) => Math.abs(a - b) <= EPS;

// Marks a class as a child of a GML parent object without touching the registry
// (instancesOf/withObj/isA walk the constructor chain by objName).
export function tagParent(name, Base = Instance) {
  const C = class extends Base {};
  Object.defineProperty(C, 'objName', { value: name, writable: true, configurable: true });
  return C;
}

// Registers a generic object unless another module already did.
export function defineShared(name, cls) {
  if (!objectExists(name)) defineObject(name, cls);
}

// scr_afterimage (caller scope)
export function scr_afterimage(self) {
  const a = instance_create(self.x, self.y, 'obj_afterimage');
  a.sprite_index = self.sprite_index;
  a.image_index = self.image_index;
  a.image_blend = self.image_blend;
  a.image_speed = 0;
  a.depth = self.depth;
  a.image_xscale = self.image_xscale;
  a.image_yscale = self.image_yscale;
  a.image_angle = self.image_angle;
  return a;
}

// scr_dark_marker(x, y, sprite)
export function scr_dark_marker(x, y, spr) {
  const m = instance_create(x, y, 'obj_marker');
  m.sprite_index = spr;
  m.image_speed = 0;
  m.image_xscale = 2;
  m.image_yscale = 2;
  return m;
}

// d3d_set_fog(true, colour, ...) + draw_sprite_ext: the sprite as a solid-colour silhouette.
const fogCache = new Map();
export function draw_sprite_fog(name, sub, x, y, xs, ys, rot, color, alpha) {
  const spr = getSprite(name);
  if (!spr || !spr.img || alpha <= 0) return;
  const key = name + '|' + color;
  let c = fogCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = spr.img.width;
    c.height = spr.img.height;
    const x2 = c.getContext('2d');
    x2.drawImage(spr.img, 0, 0);
    x2.globalCompositeOperation = 'source-in';
    x2.fillStyle = '#' + (color & 0xffffff).toString(16).padStart(6, '0');
    x2.fillRect(0, 0, c.width, c.height);
    fogCache.set(key, c);
  }
  const n = Math.max(1, spr.n);
  let f = Math.floor(sub) % n;
  if (f < 0) f += n;
  const ctx = G.ctx;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.translate(x, y);
  if (rot) ctx.rotate(-rot * Math.PI / 180);
  ctx.scale(xs, ys);
  ctx.drawImage(c, f * spr.w, 0, spr.w, spr.h, -spr.ox, -spr.oy, spr.w, spr.h);
  ctx.restore();
}

// ---------------------------------------------------------------- generic effect objects

class Afterimage extends Instance {
  step() {
    this.image_alpha -= 0.04;
    if (this.image_alpha < 0) instance_destroy(this);
  }
}
defineShared('obj_afterimage', Afterimage);

class AfterimageGrow extends Instance {
  create() {
    this.xrate = 0.2;
    this.yrate = 0.2;
    this.fade = 0.1;
  }
  step() {
    this.image_alpha -= this.fade;
    this.image_xscale += this.xrate;
    this.image_yscale += this.yrate;
    if (this.image_alpha < 0) instance_destroy(this);
  }
}
defineShared('obj_afterimage_grow', AfterimageGrow);

class Marker extends Instance {}
defineShared('obj_marker', Marker);

// global.flag[12] = screen shake disabled
const shakeOff = () => !!(global.flag && global.flag[12] === 1);

class Shake extends Instance {
  create() {
    this.camera = 0;
    this.shakespeed = 1;
    this.shakesign = 1;
    this.shakex = 4;
    this.shakey = 4;
    this.siner = 0;
    this.active = 0;
    this.permashake = 0;
  }
  step() {
    if (this.active === 0) {
      this.camerax = G.camX;
      this.cameray = G.camY;
      if (!shakeOff()) {
        G.camX = this.camerax + this.shakex;
        G.camY = this.cameray + this.shakey;
      }
      this.shakesign = -this.shakesign;
      this.active = 1;
      this.alarm[0] = this.shakespeed;
    }
  }
  alarm0() {
    if (!shakeOff()) {
      G.camX = this.camerax + this.shakex * this.shakesign;
      G.camY = this.cameray + this.shakey * this.shakesign;
    }
    if (this.permashake === 0) {
      if (this.shakex > 0) this.shakex -= 1;
      if (this.shakey > 0) this.shakey -= 1;
    }
    this.shakesign = -this.shakesign;
    this.alarm[0] = this.shakespeed;
    if (this.shakex === 0 && this.shakey === 0) instance_destroy(this);
  }
  onDestroy() {
    if (this.camerax !== undefined) {
      G.camX = this.camerax;
      G.camY = this.cameray;
    }
  }
}
defineShared('obj_shake', Shake);

// obj_darkener (battle flow; Jevil creates it at talk time). Depth 200.
class Darkener extends Instance {
  constructor() {
    super();
    this.depth = 200;
  }
  create() {
    if (instancesOf('obj_darkener').length > 1) instance_destroy(this);
    this.darken = 1;
    this.darkamt = 0;
  }
  onDestroy() {
    for (const w of instancesOf('obj_whiteedge')) w.image_alpha = 0;
  }
  draw() {
    if (this.darken === 1) {
      for (const h of instancesOf('obj_heroparent')) h.darkify = 1;
      if (this.darkamt < 15) this.darkamt += 1;
      for (const w of instancesOf('obj_whiteedge')) w.image_alpha = this.darkamt / 15;
    }
    if (this.darken === 0) {
      for (const g of instancesOf('obj_growtangle')) g.growcon = 3;
      for (const h of instancesOf('obj_heroparent')) h.darkify = 0;
      if (this.darkamt > 0) this.darkamt -= 1;
      for (const w of instancesOf('obj_whiteedge')) w.image_alpha = this.darkamt / 15;
      if (this.darkamt <= 0) instance_destroy(this);
    }
    draw_set_alpha(this.darkamt / 20);
    draw_set_color(0);
    draw_rectangle(G.camX - 40, G.camY - 40, G.camX + 680, G.camY + 520, false);
    draw_set_alpha(1);
  }
}
defineShared('obj_darkener', Darkener);

export { draw_self };
