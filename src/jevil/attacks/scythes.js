// Devilsknife bullets: obj_centerscythe (jattack 3, 11), obj_laserscythe (jattack 15),
// obj_bigscythe (dbulletcontroller types 55-58, unused by Jevil).
import {
  global, defineObject, instance_create, instance_destroy, instance_number, instancesOf, random, choose,
  lengthdir_x, lengthdir_y, bgr, draw_sprite_ext, draw_self, draw_set_color, draw_rectangle,
  snd_play, snd_stop, S,
} from '../rt.js';
import { RegularBulletPermanent, scr_bullet_inherit } from '../bullets.js';
import { first, setAll, boardRef, room_height, ge, gt, lt, le } from '../common.js';

export class BigScythe extends RegularBulletPermanent {
  constructor() {
    super();
    this.sprite_index = 'jokerscythebig_mask';
    this.mask_index = 'jokerscythebig_mask';
    this.depth = 0;
  }
  create() {
    this.anglespeed = -8;
    this.siner = 0;
    this.difficulty = 1;
    this.times = 0;
    this.activetimer = 0;
    this.grazed = 0;
    this.grazepoints = 10;
    this.timepoints = 10;
    this.target = 0;
    this.inv = 120;
    this.damage = 124;
    this.active = 1;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.image_alpha = 0;
    this.type = 0;
    this.grazetimer = 0;
  }
  step() {
    const bs = boardRef();
    if (this.type === 0) {
      if (this.x >= bs.x + 100) this.hspeed = this.hspeed - 0.5;
      if (this.x <= bs.x - 100) this.hspeed = this.hspeed + 0.5;
    }
    if (this.type === 1) {
      if (this.y >= bs.y + 100) this.vspeed = this.vspeed - 0.5;
      if (this.y <= bs.y - 100) this.vspeed = this.vspeed + 0.5;
    }
    this.siner += 1;
    this.image_angle += this.anglespeed;
    if (lt(this.image_alpha, 1)) this.image_alpha += 0.1;
    this.grazetimer += 1;
    if (this.grazetimer >= 3) {
      this.grazetimer = 0;
      this.grazed = 0;
    }
  }
  draw() {
    draw_sprite_ext('spr_jokerscythe_big', 0, this.x, this.y, 2, 2, this.image_angle, 0xffffff,
      1 - this.image_alpha + 0.2 + Math.sin(this.siner / 10) / 2.5);
    draw_self(this);
    draw_set_color(bgr(255));
    draw_rectangle(this.x - 1, this.y - 1, this.x + 1, this.y + 1, false);
  }
}
defineObject('obj_bigscythe', BigScythe);

// Four Devilsknives orbiting the board centre; the first one created ("king") spawns the
// other three. Type 1 (jattack 11) adds the red scythe that sweeps across the board.
export class CenterScythe extends RegularBulletPermanent {
  constructor() {
    super();
    this.sprite_index = 'spr_joker_scythebody';
    this.mask_index = 'spr_joker_scythebody_mask';
    this.depth = 0;
  }
  create() {
    this.grazed = 0;
    this.grazepoints = 3;
    this.timepoints = 2;
    this.target = 0;
    this.inv = 120;
    this.damage = 124;
    this.grazetimer = 0;
    this.active = 0;
    this.image_alpha = 0;
    this.image_xscale = 1;
    this.image_yscale = 1;
    this.rotspeed = 0;
    this.insanity = 1;
    this.chasecon = 1;
    this.chasetimer = 0;
    this.centerx = 320;
    this.centery = 120;
    const bs = first('obj_battlesolid');
    if (bs) {
      this.centerx = bs.x;
      this.centery = bs.y;
    }
    this.radius = 150;
    this.sine = 0;
    this.sinespeed = 1.4;
    this.dir = random(70);
    this.dirspeed = 1.5 * choose(1, -1);
    this.un = 0;
    this.scythetimer = -5;
    this.scythesidex = 1;
    this.swingnoise = 0;
    this.noisebuffer = 0;
    this.type = 0;
    const dc = first('obj_dbulletcontroller');
    if (dc && dc.type === 76) this.type = 1;
    this.king = 0;
    if (this.type === 1) {
      this.image_xscale = 1;
      this.image_yscale = 1;
      this.insanity = 0;
      this.sinespeed = 1.3;
      this.scythesidex = choose(1, -1);
    }
    if (instance_number('obj_centerscythe') === 1) {
      this.king = 1;
      this.x = this.centerx - this.radius;
      this.y = this.centery;
      const s2 = instance_create(this.centerx + this.radius, this.centery, 'obj_centerscythe');
      s2.sine = 0; s2.dir = 180; s2.un = 1;
      const s3 = instance_create(this.centerx, this.centery - this.radius, 'obj_centerscythe');
      s3.sine = 0; s3.dir = 90; s3.un = 0;
      const s4 = instance_create(this.centerx, this.centery + this.radius, 'obj_centerscythe');
      s4.sine = 0; s4.dir = 270; s4.un = 1;
      setAll('obj_centerscythe', 'mydir', this.dir);
      setAll('obj_centerscythe', 'sinespeed', this.sinespeed);
      setAll('obj_centerscythe', 'dirspeed', this.dirspeed);
      setAll('obj_centerscythe', 'insanity', this.insanity);
      for (const s of instancesOf('obj_centerscythe')) {
        if (s.dir !== s.mydir) s.dir = s.dir + s.mydir;
        s.x = s.centerx - lengthdir_x(s.radius, s.dir);
        s.y = s.centery - lengthdir_y(s.radius, s.dir);
      }
    }
    this.wall_destroy = 0;
  }
  step() {
    if (this.chasecon === 1) {
      this.image_alpha += 0.04;
      if (ge(this.image_alpha, 1)) {
        this.image_alpha = 1;
        this.chasecon = 2;
        this.active = 1;
      }
    }
    if (this.chasecon === 2) {
      if (this.un === 0 && this.rotspeed <= 10) this.rotspeed += 1;
      if (this.un === 1 && this.rotspeed >= -10) this.rotspeed -= 1;
      this.sine += this.sinespeed;
      this.dir += this.dirspeed;
      if (this.insanity === 1) {
        if (this.dirspeed > 0 && lt(this.dirspeed, 3)) this.dirspeed += 0.01;
        if (this.dirspeed < 0 && gt(this.dirspeed, -3)) this.dirspeed -= 0.01;
      }
      this.length = Math.cos(this.sine / 18) * this.radius;
      this.x = this.centerx - lengthdir_x(this.length, this.dir);
      this.y = this.centery - lengthdir_y(this.length, this.dir);
      if (this.king === 1) {
        this.noisebuffer -= 1;
        if (le(Math.abs(this.length), 8) && this.noisebuffer < 0) {
          snd_play('snd_swing');
          this.noisebuffer = 10;
        }
      }
    }
    if (this.king === 1 && this.type === 1) {
      this.scythetimer += 1;
      const st = this.scythetimer;
      if (st === 60) {
        snd_play('snd_spearappear');
        const b = instance_create(this.centerx + this.radius * this.scythesidex, this.centery + 60 * this.scythesidex, 'obj_collidebullet');
        b.image_xscale = 2;
        b.image_yscale = 2;
        b.image_alpha = 0;
        b.sprite_index = 'spr_joker_scythebody';
        b.mask_index = 'spr_joker_scythebody_mask';
        b.image_blend = bgr(255);
        b.active = 1;
        scr_bullet_inherit(this, b);
        this.sbul = b;
      }
      const b = this.sbul;
      if (b) {
        if (st >= 60 && st < 70) {
          b.image_angle += 10 * this.scythesidex;
          b.image_alpha += 0.1;
        }
        if (st >= 85 && st < 90 && b.alive) b.hspeed = b.hspeed - 3 * this.scythesidex;
        if (st >= 100 && st < 105 && b.alive) b.image_alpha -= 0.2;
      }
      if (st >= 105) {
        if (b) instance_destroy(b);
        this.scythesidex = this.scythesidex === -1 ? 1 : -1;
        this.scythetimer = 59;
      }
    }
    this.image_angle += this.rotspeed;
    if (this.grazed === 1) {
      this.grazetimer += 1;
      if (this.grazetimer >= 30) {
        this.grazed = 0;
        this.grazetimer = 0;
      }
    }
  }
}
defineObject('obj_centerscythe', CenterScythe);

// Falling Devilsknife that bursts into a pillar of light near the bottom (Final Chaos).
export class LaserScythe extends RegularBulletPermanent {
  constructor() {
    super();
    this.sprite_index = 'spr_joker_scythebody';
    this.depth = -5;
  }
  create() {
    this.grazed = 0;
    this.grazepoints = 15;
    this.timepoints = 0;
    this.target = 0;
    this.inv = 120;
    this.damage = 124;
    this.active = 1;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.image_angle = random(360);
    this.rotspeed = 14;
    this.vspeed = 5;
    this.mask_index = 'spr_joker_scythebody_mask';
    this.gravity = 1;
    this.explode = 0;
    this.explodetimer = 0;
    this.remrot = this.image_angle;
    this.remy = this.y;
    this.remx = this.x;
    this.scale = 2;
  }
  step() {
    if (this.explode === 0) {
      this.remx = this.x;
      this.remy = this.y;
      this.image_angle += this.rotspeed;
      this.remrot = this.image_angle;
    }
    if (this.y >= room_height - 100 && this.explode === 0) {
      snd_stop('snd_scytheburst');
      snd_play('snd_scytheburst');
      this.remx = this.x;
      this.remy = this.y;
      this.explode = 1;
      this.explodetimer = 0;
      this.remrot = this.image_angle;
      this.image_angle = 0;
      this.speed = 0;
      this.gravity = 0;
      this.mask_index = 'spr_tallpx';
      this.sprite_index = 'spr_tallpx';
      this.grazed = 0;
      this.y = 0;
      this.depth += 1;
    }
    if (this.explode === 1) {
      this.active = 0;
      this.image_xscale += 8;
      if (this.image_xscale >= 16) this.active = 1;
      if (this.image_xscale >= 32) this.explode = 2;
    }
    if (this.explode === 2) {
      this.image_xscale -= 4;
      if (this.image_xscale <= 16) {
        this.image_alpha -= 0.25;
        this.active = 0;
      }
      if (this.image_xscale <= 0) instance_destroy(this);
    }
    if (this.grazed === 1) {
      for (const dc of instancesOf('obj_dbulletcontroller')) dc.made += 0.2;
      this.grazed = 2;
    }
  }
  draw() {
    if (this.explode < 2)
      draw_sprite_ext('spr_joker_scythebody', this.image_index, this.remx, this.remy, this.scale, this.scale, this.remrot, 0xffffff, 1);
    if (this.explode >= 1) draw_self(this);
  }
  // Hits cost 30% of everyone's HP (rounded up) while the party average is 10 or more.
  user5() {
    if (this.active === 1 && global.inv < 0) {
      instance_create(0, 0, 'obj_shake');
      snd_stop('snd_hurt1');
      snd_play('snd_hurt1');
      global.inv = global.invc * 40;
      const temphp = [];
      for (let i = 0; i < 3; i++) {
        temphp[i] = global.hp[global.char[i]];
        if (temphp[i] < 0) temphp[i] = 0;
      }
      if (Math.ceil(temphp[0] + temphp[1] + temphp[2]) / 3 >= 10) {
        for (let i = 0; i < 3; i++) {
          if (temphp[i] > 0) global.hp[global.char[i]] = Math.ceil(global.hp[global.char[i]] * 0.7);
        }
      } else S.scr_damage_all(this);
    }
  }
}
defineObject('obj_laserscythe', LaserScythe);

