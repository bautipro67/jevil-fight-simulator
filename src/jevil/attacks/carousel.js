// Carousel horses (jattack 4, 8): obj_carouselbullet. They ride a virtual cylinder around the
// board; on the far side (moving right) they are dimmed, drawn behind and harmless.
import { defineObject, bgr } from '../rt.js?v=20261031024711';
import { RegularBulletPermanent } from '../bullets.js?v=20261031024711';
import { boardRef, ge } from '../common.js?v=20261031024711';

export class CarouselBullet extends RegularBulletPermanent {
  constructor() {
    super();
    this.sprite_index = 'spr_carousel';
    this.depth = 0;
  }
  create() {
    this.siner = 0;
    this.siner2 = 0;
    this.t = 0;
    this.hspeed = 6;
    this.sinspeed = 1;
    this.altmode = 0;
    this.altsin = 0;
    this.timer = 0;
    this.difficulty = 1;
    this.times = 0;
    this.activetimer = 0;
    this.grazed = 0;
    this.grazepoints = 10;
    this.timepoints = 10;
    this.target = 0;
    this.inv = 120;
    this.damage = 124;
    this.active = 0;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.image_alpha = 0;
    this.image_speed = 0;
    this.type = 0;
    this.con = 0;
    this.vsin = 0;
    this.wall_destroy = 0;
  }
  step() {
    if (this.t <= 25) this.image_alpha += 0.04;
    if (this.t === 25) this.active = 1;
    if (this.t === 0) {
      this.maxspeed = Math.abs(this.hspeed);
      this.hspeed = 0;
    }
    this.t += 1;
    this.siner += this.sinspeed;
    const sinfactor_0 = Math.sin((this.siner - 1) / 20);
    const sinfactor = Math.sin(this.siner / 20);
    const sinsign = sinfactor - sinfactor_0;
    this.x = boardRef().x - sinfactor * 150;
    this.image_xscale = sinsign * 50;
    if (this.image_xscale > 2) this.image_xscale = 2;
    if (this.image_xscale < -2) this.image_xscale = -2;
    if (sinsign > 0) {
      this.depth = 21;
      this.active = 0;
      this.image_blend = bgr(8421504);
    }
    if (sinsign < 0) {
      this.depth = 0;
      if (ge(this.image_alpha, 1)) this.active = 1;
      this.image_blend = 0xffffff;
    }
    this.vsin += 1;
    const am = this.altmode;
    if (am === 0 || am === 2 || am === 3) this.y += Math.sin(this.vsin / 10) * 3.5;
    if (am === 1) this.y -= Math.sin(this.vsin / 10) * 3.5;
    if (am === 99) {
      this.altsin += 1;
      this.y += Math.cos(this.altsin / 20) * 2;
    }
    if (am === 99) {
      this.altsin += 1;
      this.y += Math.cos(this.altsin / 10) * 2;
    }
  }
}
defineObject('obj_carouselbullet', CarouselBullet);
