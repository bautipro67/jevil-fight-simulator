// Three-club attack (jattack 10): obj_clubsbullet_dark flies in fast, stops, and fires three
// 3-way club bursts aimed at the SOUL.
import { defineObject, instance_create, instance_destroy } from '../rt.js?v=20261031024711';
import { BulletParent, scr_bullet_inherit } from '../bullets.js?v=20261031024711';
import { heartRef, move_towards_point } from '../common.js?v=20261031024711';

export class ClubsBulletDark extends BulletParent {
  constructor() {
    super();
    this.sprite_index = 'spr_clubsbullet_dark';
    this.depth = -10;
  }
  create() {
    this.difficulty = 1;
    this.times = 0;
    this.activetimer = 0;
    this.grazed = 0;
    this.grazepoints = 1;
    this.timepoints = 1;
    this.target = 0;
    this.dont = 1;
    this.inv = 120;
    this.damage = 124;
    this.active = 0;
    this.dtimer = 0;
    this.type = 0;
    this.initangle = 0;
  }
  fire(sprite, dir, speed, inherit) {
    const b = instance_create(this.x, this.y, 'obj_regularbullet');
    if (b.alive) {
      b.sprite_index = sprite;
      b.direction = dir;
      b.speed = speed;
      b.image_angle = this.direction;
      if (inherit) scr_bullet_inherit(this, b);
      else {
        b.damage = this.damage;
        b.target = this.target;
        b.grazepoints = 2;
        b.timepoints = 1;
      }
    }
  }
  afterimageAndDie() {
    const a = instance_create(this.x, this.y, 'obj_afterimage');
    a.sprite_index = this.sprite_index;
    a.image_angle = this.image_angle;
    instance_destroy(this);
  }
  step() {
    this.dtimer += 1;
    const t = this.dtimer;
    if (this.type === 0) {
      if (t === 15 || t === 19 || t === 23) {
        const h = heartRef();
        move_towards_point(this, h.x + 8, h.y + 8, 0.1);
        const d = this.direction;
        this.fire('spr_clubsball_b', d, 4, false);
        this.fire('spr_clubsball_c', d - 17, 4, false);
        this.fire('spr_clubsball_a', d + 17, 4, false);
      }
      if (t === 25) this.afterimageAndDie();
    }
    if (this.type === 2) {
      if (t === 20 || t === 22 || t === 24) {
        const h = heartRef();
        move_towards_point(this, h.x + 8, h.y + 8, 0.1);
        const d = this.direction, ia = this.initangle;
        // (speed 2 is overridden by 5 for type 2)
        this.fire('spr_clubsball_b', d - 2 + ia, 5, true);
        this.fire('spr_clubsball_c', d - 19 - 2 + ia, 5, true);
        this.fire('spr_clubsball_a', d + 19 - 2 + ia, 5, true);
        this.initangle += 2;
      }
      if (t === 26) this.afterimageAndDie();
    }
  }
}
defineObject('obj_clubsbullet_dark', ClubsBulletDark);
