// The bullet board: obj_battlesolid (parent of every wall) and obj_growtangle.
import {
  Instance, defineObject, instance_create, instance_destroy, merge_color, draw_sprite_ext, draw_self,
} from './rt.js?v=20261031024711';
import { first } from './common.js?v=20261031024711';

export class BattleSolid extends Instance {}
defineObject('obj_battlesolid', BattleSolid);

export class Growtangle extends BattleSolid {
  constructor() {
    super();
    this.sprite_index = 'spr_battlebg_0';
    this.depth = 5;
  }
  create() {
    this.image_xscale = 0;
    this.image_yscale = 0;
    this.image_alpha = 0.3;
    this.timer = 0;
    this.maxtimer = 15;
    this.growcon = 1;
    this.image_speed = 0;
    // merge_color(c_green, c_lime, 0.5); both are the same in BGR and RGB.
    this.image_blend = merge_color(0x008000, 0x00ff00, 0.5);
    this.fullgrow = 0;
    this.keep = 0;
    this.megakeep = 0;
  }
  step() {
    let growth = 0;
    if (this.timer < this.maxtimer && this.growcon === 1) growth = 1;
    if (this.timer > 0 && this.growcon === 3) growth = 1;
    if (growth === 1) {
      if (this.growcon === 1) this.timer += 1;
      if (this.growcon === 3) this.timer -= 1;
      const t = this.timer / this.maxtimer;
      this.image_xscale = 2 * t;
      this.image_yscale = 2 * t;
      this.image_angle = 180 + 180 * t;
      this.image_alpha = 0.5 + t * 0.5;
      const d = instance_create(this.x, this.y, 'obj_afterimage');
      d.sprite_index = this.sprite_index;
      d.image_xscale = this.image_xscale;
      d.image_yscale = this.image_yscale;
      d.image_angle = this.image_angle;
      d.depth = this.depth - 1;
      d.image_blend = this.image_blend;
      d.image_alpha = 1 - this.image_alpha + 0.1;
      d.image_speed = 0;
      if (this.timer >= this.maxtimer && this.growcon === 1) {
        this.growcon = 2;
        this.image_angle = 0;
      }
      if (this.timer <= 0 && this.growcon === 3) instance_destroy(this);
    }
  }
  endStep() {
    if (this.keep === 1) {
      const h = first('obj_heart');
      if (h && (this.speed !== 0 || this.megakeep === 1)) {
        const lborder = this.x - this.sprite_width / 2;
        const rborder = this.x + this.sprite_width / 2;
        const uborder = this.y - this.sprite_height / 2;
        const dborder = this.y + this.sprite_height / 2;
        if (h.x < lborder + 5) h.x = lborder + 5;
        if (h.x > rborder - 22) h.x = rborder - 22;
        if (h.y < uborder + 5) h.y = uborder + 5;
        if (h.y > dborder - 22) h.y = dborder - 22;
      }
    }
  }
  draw() {
    draw_sprite_ext(this.sprite_index, 1, this.x, this.y, this.image_xscale, this.image_yscale, this.image_angle, this.image_blend, this.image_alpha);
    draw_self(this);
  }
}
defineObject('obj_growtangle', Growtangle);
