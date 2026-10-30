// Spade spirals (jattack 1, 7): obj_spadering places a ring of spades outside the board,
// pulls them in, then launches them one by one back across the board.
import { defineObject, instance_create, instance_destroy, random, lengthdir_x, lengthdir_y, bgr } from '../rt.js?v=20261030222208';
import { BulletParent, scr_bullet_inherit } from '../bullets.js?v=20261030222208';
import { boardRef } from '../common.js?v=20261030222208';

export class SpadeRing extends BulletParent {
  constructor() {
    super();
    this.sprite_index = 'spr_diamondbullet';
    this.visible = false;
  }
  create() {
    this.ringno = 0;
    this.maxspade = 8;
    this.t = 0;
    this.con = 0;
    this.startspade = 0;
    this.spadet = 0;
    this.startang = random(360);
    this.grav = 0.2;
    this.size = 1;
    this.special = 0;
    this.side = 0;
    this.spade = [];
  }
  step() {
    const spades = () => this.spade.slice(0, this.maxspade).filter(s => s && s.alive);
    if (this.t === 0) {
      if (this.size > 1) this.startang = -random(180);
      const bs = boardRef();
      for (let i = 0; i < this.maxspade; i++) {
        let spadeang = 360 / this.maxspade * i + this.startang;
        if (this.side === 1) spadeang = -spadeang;
        const spadex = lengthdir_x(300, spadeang + 180);
        const spadey = lengthdir_y(300, spadeang + 180);
        const s = instance_create(spadex + bs.x, spadey + bs.y, 'obj_collidebullet');
        scr_bullet_inherit(this, s);
        s.sprite_index = 'spr_spadebullet';
        s.image_alpha = 0;
        s.active = 1;
        s.image_blend = bgr(12632256);
        s.direction = spadeang;
        s.image_angle = spadeang;
        s.speed = 26;
        s.image_xscale = this.size;
        s.image_yscale = this.size;
        this.spade[i] = s;
      }
    }
    if (this.t >= 1 && this.t < 15) {
      for (const s of spades()) {
        s.speed = s.speed * 0.87;
        s.image_alpha += 0.1;
      }
    }
    if (this.t === 15) {
      for (const s of spades()) {
        s.speed = 0;
        s.image_alpha += 0.1;
      }
    }
    if (this.t >= 15 && this.con === 0) {
      this.spadet += 1;
      if (this.special === 1) this.spadet += 6;
      if (this.spadet >= 4) {
        const s = this.spade[this.startspade];
        if (s && s.alive) {
          s.image_blend = 0xffffff;
          s.gravity_direction = s.direction;
          s.speed = -3.4;
        }
        if (s) s.gravity = this.grav;
        this.startspade += 1;
        if (this.startspade >= this.maxspade) {
          this.con = 1;
          instance_destroy(this);
        }
        this.spadet = 0;
      }
    }
    this.t += 1;
  }
}
defineObject('obj_spadering', SpadeRing);
