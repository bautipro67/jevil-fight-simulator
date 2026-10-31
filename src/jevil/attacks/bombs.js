// Suit bombs (jattack 2, 5, 9, 13, 99): obj_suitbomb and obj_heartbomb_blast.
import {
  defineObject, instance_create, instance_destroy, instancesOf, choose, random, point_direction,
  lengthdir_x, lengthdir_y, draw_self, draw_set_color, draw_set_alpha, draw_circle,
} from '../rt.js?v=20261031024711';
import { BulletParent, scr_bullet_inherit } from '../bullets.js?v=20261031024711';
import { heartRef, move_towards_point } from '../common.js?v=20261031024711';

export class SuitBomb extends BulletParent {
  constructor() {
    super();
    this.sprite_index = 'spr_suitsbomb';
  }
  create() {
    this.visible = false;
    this.type = choose(0, 1, 2, 3);
    this.y = -80;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.con = 0;
    this.timer = 0;
    this.image_speed = 0;
    this.vspeed = 10;
    this.maxtimer = 20 + random(16);
    this.explodedraw = 0;
  }
  step() {
    if (this.con === 0) {
      if (this.type === 0) this.sprite_index = 'spr_bomb_spade';
      if (this.type === 1) this.sprite_index = 'spr_bomb_diamond';
      if (this.type === 2) this.sprite_index = 'spr_bomb_heart';
      if (this.type === 3) this.sprite_index = 'spr_bomb_club';
      this.visible = true;
      this.con = 1;
    }
    if (this.con === 1) {
      this.timer += 1;
      if (this.timer >= 10) {
        // (obj_joker only plays the beep when beepnoise == 4, so this never sounds)
        for (const j of instancesOf('obj_joker')) j.beepnoise = 1;
        this.image_speed = this.timer / this.maxtimer;
      }
      if (this.timer >= this.maxtimer) {
        this.con = 2;
        this.timer = 0;
        this.speed = 0;
      }
    }
    if (this.con === 2) {
      for (const j of instancesOf('obj_joker')) j.burstnoise = 1;
      const h = heartRef();
      if (this.type === 0) {
        const dir = random(360);
        const maxe = 12;
        for (let i = 0; i < 12; i++) {
          const b = instance_create(this.x, this.y, 'obj_regularbullet');
          scr_bullet_inherit(this, b);
          b.active = 1;
          b.direction = dir + i * (360 / maxe);
          b.speed = 8;
          b.image_angle = b.direction;
          b.sprite_index = 'spr_spadebullet';
        }
        this.con = 3;
      }
      if (this.type === 1) {
        for (let i = 0; i < 3; i++) {
          const b = instance_create(this.x, this.y, 'obj_regularbullet');
          b.damage = 100;
          scr_bullet_inherit(this, b);
          move_towards_point(b, h.x + 8, h.y + 8, 11);
          b.speed = b.speed - i;
          b.image_angle = b.direction;
          b.sprite_index = 'spr_diamondbullet';
        }
        this.con = 3;
      }
      if (this.type === 2) {
        const b = instance_create(this.x, this.y, 'obj_heartbomb_blast');
        scr_bullet_inherit(this, b);
        this.con = 3;
      }
      if (this.type === 3) {
        const dir = point_direction(this.x, this.y, h.x + 8, h.y + 8);
        for (let i = 0; i < 3; i++) {
          const b = instance_create(this.x, this.y, 'obj_regularbullet');
          b.sprite_index = 'spr_clubsbullet';
          b.damage = 100;
          scr_bullet_inherit(this, b);
          b.active = 1;
          b.direction = dir - 20 + i * 20;
          b.image_angle = b.direction;
          b.speed = 8;
        }
        this.con = 3;
      }
    }
    if (this.explodedraw >= 40) instance_destroy(this);
  }
  draw() {
    if (this.con < 2) draw_self(this);
    if (this.con >= 2) {
      this.explodedraw += 1;
      draw_set_color(0xffffff);
      draw_set_alpha(1.5 - this.explodedraw / 10);
      draw_circle(this.x, this.y, this.sprite_width / 2 + this.explodedraw * 2, false);
      draw_set_alpha(1);
    }
  }
}
defineObject('obj_suitbomb', SuitBomb);

// Four hearts in a rotating square that drifts toward where the SOUL was.
export class HeartbombBlast extends BulletParent {
  constructor() {
    super();
    this.sprite_index = 'spr_bomb_heart';
  }
  create() {
    this.made = 0;
    this.active = 0;
    this.pausetimer = 0;
    this.con = 0;
    this.siner = 0;
    this.maxlength = 0;
    this.visible = false;
    this.son = [];
  }
  step() {
    if (this.made === 0) {
      for (let i = 0; i < 4; i++) {
        this.son[i] = instance_create(this.x, this.y, 'obj_regularbullet');
        this.son[i].sprite_index = 'spr_heartbullet';
        scr_bullet_inherit(this, this.son[i]);
      }
      this.made = 1;
    }
    this.pausetimer += 1;
    if (this.pausetimer >= 10 && this.con === 0) {
      const h = heartRef();
      move_towards_point(this, h.x + 8, h.y + 8, 7);
      this.con = 1;
    }
    this.siner += 1;
    if (this.maxlength < 40) this.maxlength += 4;
    for (let i = 0; i < 4; i++) {
      const s = this.son[i];
      if (s && s.alive) {
        s.x = this.x + lengthdir_x(this.maxlength, this.siner * 3 + i * 90);
        s.y = this.y + lengthdir_y(this.maxlength, this.siner * 3 + i * 90);
      }
    }
  }
}
defineObject('obj_heartbomb_blast', HeartbombBlast);
