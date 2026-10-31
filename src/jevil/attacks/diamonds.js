// Diamond releases (jattack 6, 14): obj_dbullet_vert; plus obj_dbullet_maker (unused by Jevil).
// Both run their logic in Draw, like the original.
import { defineObject, instance_create, instance_destroy, instance_exists, point_direction, draw_sprite_ext } from '../rt.js?v=20261031024711';
import { BulletParent, CollideBullet } from '../bullets.js?v=20261031024711';
import { heartRef, move_towards_point, view_y, lt } from '../common.js?v=20261031024711';

export class DBulletMaker extends BulletParent {
  constructor() {
    super();
    this.sprite_index = 'spr_diamondbullet_form';
    this.depth = -20;
  }
  create() {
    this.difficulty = 1;
    this.times = 0;
    this.activetimer = 0;
    this.grazed = 0;
    this.grazepoints = 5;
    this.timepoints = 5;
    this.target = 0;
    this.dont = 1;
    this.inv = 120;
    this.damage = 124;
    this.active = 0;
    this.image_alpha = 0;
    if (instance_exists('obj_heart')) {
      const h = heartRef();
      this.futuredir = point_direction(this.x, this.y, h.x + 8, h.y + 8);
    } else instance_destroy(this);
  }
  draw() {
    if (this.dont === 0) {
      const h = heartRef();
      if (this.active === 0) {
        this.futuredir = point_direction(this.x, this.y, h.x + 8, h.y + 8);
        draw_sprite_ext('spr_diamondbullet_form', 0, this.x, this.y, 3 - this.image_alpha * 2, 3 - this.image_alpha * 2, this.futuredir, 0xffffff, 1 - this.image_alpha);
        if (lt(this.image_alpha, 1)) this.image_alpha += 0.1;
        else {
          move_towards_point(this, h.x + 8, h.y + 8, 2);
          this.futuredir = this.direction;
          this.active = 1;
          this.speed = 0;
        }
      }
      draw_sprite_ext(this.sprite_index, 0, this.x, this.y, 2 - this.image_alpha, 2 - this.image_alpha, this.futuredir, 0xffffff, this.image_alpha);
      if (this.active === 1) {
        this.activetimer += 1;
        if (this.activetimer >= 5 && this.times < this.difficulty) {
          const b = instance_create(this.x, this.y, 'obj_regularbullet');
          if (b.alive) {
            b.damage = this.damage;
            b.target = this.target;
            b.sprite_index = 'spr_diamondbullet';
            b.direction = this.futuredir;
            b.speed = 6;
            b.image_angle = b.direction;
          }
          this.times += 1;
          this.activetimer = 0;
        }
        if (this.activetimer >= 5 && this.times >= this.difficulty) {
          this.image_alpha -= 0.2;
          if (this.image_alpha <= 0) instance_destroy(this);
        }
      }
    }
    this.dont = 0;
  }
}
defineObject('obj_dbullet_maker', DBulletMaker);

// Rising diamond. type 0 (jattack 14): heads for the SOUL's row, capped at speed 8.
// type 1 (jattack 6): sinks a little while fading in, then shoots up.
export class DBulletVert extends CollideBullet {
  constructor() {
    super();
    this.sprite_index = 'spr_diamondbullet_vert';
    this.depth = -1;
  }
  create() {
    if (this.y < view_y() + 20) this.y = view_y() + 20;
    if (this.y > view_y() + 460) this.y = view_y() + 460;
    this.difficulty = 1;
    this.times = 0;
    this.activetimer = 0;
    this.grazed = 0;
    this.grazepoints = 5;
    this.timepoints = 5;
    this.target = 0;
    this.dont = 1;
    this.inv = 120;
    this.damage = 124;
    this.active = 0;
    this.image_alpha = 0;
    if (!instance_exists('obj_heart')) instance_destroy(this);
    this.type = 0;
  }
  draw() {
    if (this.dont === 0) {
      if (this.active === 0) {
        draw_sprite_ext(this.sprite_index, 0, this.x, this.y, 3 - this.image_alpha * 2, 3 - this.image_alpha * 2, 0, 0xffffff, this.image_alpha);
        if (lt(this.image_alpha, 1)) {
          this.image_alpha += 0.1;
          if (this.type === 1) {
            this.vspeed = 3;
            this.gravity = -0.5;
          }
        } else {
          if (this.type === 0) {
            if (heartRef().y + 8 < this.y) {
              this.vspeed = 1;
              this.gravity = -0.2;
            } else {
              this.vspeed = -2;
              this.gravity = 1;
            }
          }
          this.active = 1;
        }
      }
      draw_sprite_ext(this.sprite_index, 0, this.x, this.y, 2 - this.image_alpha, 2 - this.image_alpha, 0, 0xffffff, this.image_alpha);
      if (this.type === 0 && this.speed > 8) this.speed = 8;
      if (this.y > view_y() + 500) instance_destroy(this);
      if (this.y < view_y() - 20) instance_destroy(this);
    }
    this.dont = 0;
  }
}
defineObject('obj_dbullet_vert', DBulletVert);
