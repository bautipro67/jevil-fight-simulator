// Generic effect objects and helpers: markers, afterimages, flashes, camera shake, monster parent.
import {
  global, G, Instance, defineObject, defineScript, S, instance_create, instance_destroy, instance_exists,
  draw_sprite_ext, d3d_set_fog,
} from '../runtime/gm.js?v=20261101031117';
import { splitCaller } from './common.js?v=20261101031117';

class Marker extends Instance {}
defineObject('obj_marker', Marker);

class Afterimage extends Instance {
  step() {
    this.image_alpha -= 0.04;
    if (this.image_alpha < 0) instance_destroy(this);
  }
}
defineObject('obj_afterimage', Afterimage);

class AfterimageGrow extends Instance {
  create() { this.xrate = 0.2; this.yrate = 0.2; this.fade = 0.1; }
  step() {
    this.image_alpha -= this.fade;
    this.image_xscale += this.xrate;
    this.image_yscale += this.yrate;
    if (this.image_alpha < 0) instance_destroy(this);
  }
}
defineObject('obj_afterimage_grow', AfterimageGrow);

// scr_afterimage(): copies the caller's look into a fading obj_afterimage.
defineScript('scr_afterimage', (src) => {
  const a = instance_create(src.x, src.y, 'obj_afterimage');
  a.sprite_index = src.sprite_index;
  a.image_index = src.image_index;
  a.image_blend = src.image_blend;
  a.image_speed = 0;
  a.depth = src.depth;
  a.image_xscale = src.image_xscale;
  a.image_yscale = src.image_yscale;
  a.image_angle = src.image_angle;
  return a;
});

defineScript('scr_dark_marker', (...a) => {
  const [, [x, y, spr]] = splitCaller(a);
  const m = instance_create(x, y, 'obj_marker');
  m.sprite_index = spr;
  m.image_speed = 0;
  m.image_xscale = 2;
  m.image_yscale = 2;
  return m;
});

defineScript('scr_marker', (...a) => {
  const [, [x, y, spr]] = splitCaller(a);
  const m = instance_create(x, y, 'obj_marker');
  m.sprite_index = spr;
  m.image_speed = 0;
  return m;
});

// obj_oflash: a white silhouette pulse over its target.
class OFlash extends Instance {
  create() {
    this.flashspeed = 1;
    this.siner = 0;
    this.target = null;
    this.image_speed = 0;
    this.flashcolor = 0xffffff;
  }
  draw() {
    if (instance_exists(this.target)) {
      this.image_index = this.target.image_index;
      this.sprite_index = this.target.sprite_index;
    }
    this.siner += this.flashspeed;
    d3d_set_fog(true, this.flashcolor, 0, 1);
    draw_sprite_ext(this.sprite_index, this.image_index, this.x, this.y, this.image_xscale, this.image_yscale, 0, this.image_blend, Math.sin(this.siner / 3));
    d3d_set_fog(false, 0, 0, 0);
    if (this.siner > 4 && Math.sin(this.siner / 3) < 0) instance_destroy(this);
  }
}
defineObject('obj_oflash', OFlash);

defineScript('scr_oflash', (src) => {
  const o = instance_create(src.x, src.y, 'obj_oflash');
  o.image_xscale = src.image_xscale;
  o.image_speed = 0;
  o.image_index = src.image_index;
  o.image_yscale = src.image_yscale;
  o.sprite_index = src.sprite_index;
  o.depth = src.depth - 1;
  o.target = src;
  return o;
});

// obj_shake: shakes the view (G.camX/G.camY) by 4 px, alternating sign, decaying by 1 per frame.
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
    this.camerax = G.camX;
    this.cameray = G.camY;
  }
  step() {
    if (this.active == 0) {
      this.camerax = G.camX;
      this.cameray = G.camY;
      if (!global.flag || global.flag[12] == 0) {
        G.camX = this.camerax + this.shakex;
        G.camY = this.cameray + this.shakey;
      }
      this.shakesign = -this.shakesign;
      this.active = 1;
      this.alarm[0] = this.shakespeed;
    }
  }
  alarm0() {
    if (!global.flag || global.flag[12] == 0) {
      G.camX = this.camerax + this.shakex * this.shakesign;
      G.camY = this.cameray + this.shakey * this.shakesign;
    }
    if (this.permashake == 0) {
      if (this.shakex > 0) this.shakex -= 1;
      if (this.shakey > 0) this.shakey -= 1;
    }
    this.shakesign = -this.shakesign;
    this.alarm[0] = this.shakespeed;
    if (this.shakex == 0 && this.shakey == 0) instance_destroy(this);
  }
  onDestroy() {
    G.camX = this.camerax;
    G.camY = this.cameray;
  }
}
defineObject('obj_shake', Shake);

// obj_monsterparent: every enemy inherits this. Other_20 (event_user(10)) = defeat/spare finished.
export class MonsterParent extends Instance {
  create() {
    this.depth = 90;
  }
  user10() {
    S.scr_spareanim(this);
    S.scr_monsterdefeat(this);
    instance_destroy(this);
  }
}
defineObject('obj_monsterparent', MonsterParent);
