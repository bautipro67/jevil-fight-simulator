// Jevil popping up around the board (jattack 0, 12; the Final Chaos cameo is type 66):
// obj_joker_teleport. type 0 throws one diamond, type 1 a fan of five spades.
import { defineObject, instance_create, instance_destroy, snd_play, snd_stop } from '../rt.js?v=20261030223631';
import { BulletParent, scr_bullet_inherit } from '../bullets.js?v=20261030223631';
import { heartRef, move_towards_point, view_x, VIEW_W, lt, gt } from '../common.js?v=20261030223631';

export class JokerTeleport extends BulletParent {
  constructor() {
    super();
    this.sprite_index = 'spr_joker_teleport';
    this.depth = 5;
  }
  create() {
    this.fire = 0;
    this.special = 0;
    this.con = 0;
    this.image_xscale = 0;
    this.image_speed = 0;
    this.timer = 0;
    this.image_yscale = 2;
    this.type = 0;
    this.damage = 100;
    this.grazed = 0;
    this.grazepoints = 4;
    this.timepoints = 2;
    this.inv = 60;
    this.grazetimer = 0;
    this.target = 0;
    this.sndcon = 0;
    if (this.x < view_x() + VIEW_W / 2) this.sprite_index = 'spr_joker_teleport_r';
  }
  step() {
    if (this.con === 0) {
      if (this.sndcon === 0) {
        snd_stop('snd_swing');
        snd_play('snd_swing');
        this.sndcon = 1;
      }
      this.image_index = 0;
      if (lt(this.image_xscale, 2)) this.image_xscale += 0.4;
      else {
        this.image_xscale = 2;
        this.con = 1;
        this.timer = 0;
      }
    }
    if (this.con === 1) {
      this.timer += 1;
      if (this.timer >= 8) {
        if (this.sndcon === 1 && this.type < 3) {
          snd_play('snd_joker_oh');
          this.sndcon = 2;
        }
        this.image_index = 1;
        this.con = 2;
        this.timer = 0;
        const h = heartRef();
        if (this.type === 0) {
          const b = instance_create(this.x, this.y, 'obj_collidebullet');
          b.sprite_index = 'spr_diamondbullet';
          b.active = 1;
          scr_bullet_inherit(this, b);
          move_towards_point(b, h.x + 10, h.y + 10, 8);
          b.image_angle = b.direction;
          b.image_xscale = 0.7;
          b.image_yscale = 0.7;
        }
        if (this.type === 1) {
          for (let i = 0; i < 5; i++) {
            const b = instance_create(this.x, this.y, 'obj_collidebullet');
            b.sprite_index = 'spr_spadebullet';
            b.active = 1;
            b.offset = 18 * i;
            scr_bullet_inherit(this, b);
            move_towards_point(b, h.x + 10, h.y + 10, 4.5);
            b.direction = b.direction - 36 + b.offset;
            b.image_angle = b.direction;
            b.image_xscale = 0.4;
            b.image_yscale = 0.4;
          }
        }
      }
    }
    if (this.con === 2) {
      this.timer += 1;
      if (this.timer >= 10) {
        this.con = 4;
        this.timer = 0;
      }
    }
    if (this.con === 4) {
      if (this.sndcon === 2) {
        snd_stop('snd_swing');
        snd_play('snd_swing');
        this.sndcon = 3;
      }
      if (gt(this.image_xscale, 0)) {
        this.image_xscale -= 0.4;
        this.image_yscale += 0.2;
      } else {
        this.image_xscale = 0;
        this.con = 0;
        instance_destroy(this);
      }
    }
  }
}
defineObject('obj_joker_teleport', JokerTeleport);
