// The SOUL and its helpers: obj_heart, obj_grazebox, obj_moveheart, obj_returnheart,
// obj_heartburst, scr_moveheart.
import {
  G, global, Instance, defineObject, defineScript, instance_create, instance_destroy, instancesOf, place_meeting, point_distance, draw_self, draw_sprite_ext, event_user, S, snd_play, snd_stop,
  left_h, right_h, up_h, down_h, button2_h,
} from './rt.js?v=20261030223631';
import { first, view_x, view_y, move_towards_point } from './common.js?v=20261030223631';
import { drawSoulHat } from '../hats.js?v=20261030223631';

const SOLID = 'obj_battlesolid';

export class Heart extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_dodgeheart';
    this.mask_index = 'spr_dodgeheartmask';
    this.depth = 1;
  }
  create() {
    global.sp = 4;
    this.wspeed = global.sp;
    this.image_speed = 0;
    this.fly = 0;
    this.darken = 1;
    this.darkamt = 0;
    this.dmgnoise = 0;
    instance_create(this.x + 10, this.y + 10, 'obj_grazebox');
    this.boundaryup = 0;
    this.disableslow = 0;
    if (button2_h()) this.disableslow = 1;
  }
  step() {
    const meet = (x, y) => place_meeting(this, x, y, SOLID);
    this.wallcheck = 0;
    let press_l = 0, press_r = 0, press_d = 0, press_u = 0;
    let bkx = 0, bky = 0, bkxy = 0;
    if (left_h()) press_l = 1;
    if (right_h()) press_r = 1;
    if (up_h()) press_u = 1;
    if (down_h()) press_d = 1;
    let px = 0, py = 0;
    const wspeed = this.wspeed;
    if (press_r === 1) px = wspeed;
    if (press_l === 1) px = -wspeed;
    if (press_d === 1) py = wspeed;
    if (press_u === 1) py = -wspeed;
    if (button2_h()) {
      if (this.disableslow === 0) {
        px = Math.ceil(px * 0.5);
        py = Math.ceil(py * 0.5);
      }
    } else this.disableslow = 0;

    // Slide along walls: try nudging perpendicular to the blocked axis, then shorten the move.
    if (meet(this.x + px, this.y)) {
      for (let g = wspeed; g > 0; g--) {
        if (press_d === 0 && !meet(this.x + px, this.y - g)) { this.y -= g; py = 0; break; }
        if (press_u === 0 && !meet(this.x + px, this.y + g)) { this.y += g; py = 0; break; }
      }
      bkx = 0;
      if (px > 0) {
        for (let i = px; i >= 0; i--) if (!meet(this.x + i, this.y)) { px = i; bkx = 1; break; }
      }
      if (px < 0) {
        for (let i = px; i <= 0; i++) if (!meet(this.x + i, this.y)) { px = i; bkx = 1; break; }
      }
      if (bkx === 0) px = 0;
    }
    if (meet(this.x, this.y + py)) {
      for (let g = wspeed; g > 0; g--) {
        if (press_r === 0 && !meet(this.x - g, this.y + py)) { this.x -= g; px = 0; break; }
        if (press_l === 0 && !meet(this.x + g, this.y + py)) { this.x += g; px = 0; break; }
      }
      if (py > 0) {
        for (let i = py; i >= 0; i--) if (!meet(this.x, this.y + i)) { py = i; bky = 1; break; }
      }
      if (py < 0) {
        for (let i = py; i <= 0; i++) if (!meet(this.x, this.y + i)) { py = i; bky = 1; break; }
      }
      if (bky === 0) py = 0;
    }
    if (meet(this.x + px, this.y + py)) {
      bkxy = 0;
      let i = px, j = py;
      while (j !== 0 || i !== 0) {
        if (!meet(this.x + i, this.y + j)) { px = i; py = j; bkxy = 1; break; }
        if (Math.abs(j) >= 1) { if (j > 0) j -= 1; if (j < 0) j += 1; } else j = 0;
        if (Math.abs(i) >= 1) { if (i > 0) i -= 1; if (i < 0) i += 1; } else i = 0;
      }
      if (bkxy === 0) { px = 0; py = 0; }
    }
    const sw = this.sprite_width, sh = this.sprite_height;
    if (this.x + px >= view_x() + 640 - sw) px = view_x() + 640 - sw - this.x;
    if (this.x + px <= 0) px = -this.x;
    if (this.y + py <= 0) py = -this.y;
    if (this.y + py >= view_y() + 320 - sh + this.boundaryup) py = view_y() + 320 - sh - this.y + this.boundaryup;
    this.x += px;
    this.y += py;
    if (this.dmgnoise === 1) {
      this.dmgnoise = 0;
      snd_stop('snd_hurt1');
      snd_play('snd_hurt1');
    }
    global.inv -= 1;
    if (global.inv > 0) this.image_speed = 0.25;
    else {
      this.image_speed = 0;
      this.image_index = 0;
    }
    global.heartx = this.x + 2 - view_x();
    global.hearty = this.y + 2 - view_y();
  }
  collision_obj_collidebullet(other) {
    const prev = G.other;
    G.other = this;
    event_user(other, 5);
    G.other = prev;
  }
  draw() {
    draw_self(this);
    drawSoulHat(this);
  }
}
defineObject('obj_heart', Heart);

export class Grazebox extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_grazeappear';
    this.mask_index = 'spr_grazemask';
    this.depth = 2;
  }
  create() {
    const h = first('obj_heart');
    if (h) {
      this.x = h.x + 10;
      this.y = h.y + 10;
    }
    this.grazetimer = 0;
  }
  endStep() {
    const h = first('obj_heart');
    if (h) {
      this.x = h.x + 10;
      this.y = h.y + 10;
    } else instance_destroy(this);
  }
  draw() {
    if (this.grazetimer > 0) {
      draw_sprite_ext(this.sprite_index, 0, this.x, this.y, 1, 1, 0, 0xffffff, this.grazetimer / 6);
      draw_sprite_ext(this.sprite_index, 3, this.x, this.y, 1, 1, 0, 0xffffff, this.grazetimer / 6 - 0.2);
    }
    this.grazetimer -= 1;
  }
  collision_obj_collidebullet(b) {
    if (global.inv < 0) {
      if (b.grazed === 1) {
        S.scr_tensionheal(b.grazepoints / 20);
        if (global.turntimer >= 10) global.turntimer -= b.timepoints / 20;
        for (const gb of instancesOf('obj_grazebox')) {
          if (gb.grazetimer >= 0 && gb.grazetimer < 4) gb.grazetimer = 3;
          if (gb.grazetimer < 2) gb.grazetimer = 2;
        }
      }
      if (b.grazed === 0) {
        b.grazed = 1;
        S.scr_tensionheal(b.grazepoints);
        if (global.turntimer >= 10) global.turntimer -= b.timepoints;
        for (const c of instancesOf('obj_battlecontroller')) c.grazenoise = 1;
        for (const gb of instancesOf('obj_grazebox')) gb.grazetimer = 10;
      }
    }
  }
}
defineObject('obj_grazebox', Grazebox);

// Where the SOUL leaves from / returns to: Kris + (10, 40). Kris stands at (80, 100).
function krisPoint() {
  const k = first('obj_herokris');
  return k ? [k.x + 10, k.y + 40] : [view_x() + 90, view_y() + 140];
}

export class MoveHeart extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_dodgeheart';
  }
  create() {
    this.burst = 0;
    this.shift = 1;
    this.image_alpha = 0;
    this.flytime = 8;
    const hm = first('obj_heartmarker');
    if (hm) {
      this.distx = hm.x;
      this.disty = hm.y;
    } else {
      this.distx = view_x() + 310;
      this.disty = view_y() + 160;
    }
    this.dist = point_distance(this.x, this.y, this.distx, this.disty);
    move_towards_point(this, this.distx, this.disty, this.dist / this.flytime);
    this.alarm[0] = this.flytime;
    this.image_speed = 0;
    instance_create(this.x, this.y, 'obj_heartburst');
  }
  step() {
    this.image_alpha += 0.334;
  }
  alarm0() {
    this.x = this.distx;
    this.y = this.disty;
    instance_create(this.x, this.y, 'obj_heart');
    instance_destroy(this);
  }
  draw() {
    draw_self(this);
    drawSoulHat(this);
  }
}
defineObject('obj_moveheart', MoveHeart);

export class ReturnHeart extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_dodgeheart';
  }
  create() {
    this.burst = 0;
    this.shift = 1;
    this.image_alpha = 1;
    this.flytime = 8;
    [this.distx, this.disty] = krisPoint();
    this.dist = point_distance(this.x, this.y, this.distx, this.disty);
    move_towards_point(this, this.distx, this.disty, this.dist / this.flytime);
    this.alarm[0] = this.flytime;
    this.image_speed = 0;
  }
  alarm0() {
    this.x = this.distx;
    this.y = this.disty;
    instance_create(this.x, this.y, 'obj_heartburst');
    instance_destroy(this);
  }
}
defineObject('obj_returnheart', ReturnHeart);

export class HeartBurst extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_heartoutline';
  }
  create() {
    this.burst = 0;
  }
  draw() {
    this.burst += 1;
    const b = this.burst, x = this.xstart + 9, y = this.ystart + 9;
    draw_sprite_ext('spr_heartoutline2', 0, x, y, 0.25 + b, 0.25 + b / 2, 0, 0xffffff, 0.8 - b / 6);
    draw_sprite_ext('spr_heartoutline', 0, x, y, 0.25 + b / 1.5, 0.25 + b / 3, 0, 0xffffff, 1 - b / 6);
    draw_sprite_ext('spr_heartoutline', 0, x, y, 0.2 + b / 2.5, 0.2 + b / 5, 0, 0xffffff, 1.2 - b / 6);
    if (this.burst > 10) instance_destroy(this);
  }
}
defineObject('obj_heartburst', HeartBurst);

export function scr_moveheart() {
  const [x, y] = krisPoint();
  return instance_create(x, y, 'obj_moveheart');
}
defineScript('scr_moveheart', scr_moveheart);

