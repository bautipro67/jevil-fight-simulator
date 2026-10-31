// Bullet base objects: obj_bulletparent, obj_bulletgenparent, obj_collidebullet,
// obj_regularbullet, obj_regularbullet_permanent, and scr_bullet_inherit.
import {
  Instance, defineObject, defineScript, instance_destroy, instance_exists, S,
} from '../runtime/gm.js?v=20261031024711';
import { view_x, view_y } from './common.js?v=20261031024711';

export class BulletParent extends Instance {}
defineObject('obj_bulletparent', BulletParent);

export class BulletGenParent extends Instance {}
defineObject('obj_bulletgenparent', BulletGenParent);

// Anything the SOUL can touch. Other_15 (event_user(5)) is called by obj_heart's collision.
export class CollideBullet extends BulletParent {
  user5() {
    if (this.active === 1) {
      if (this.target !== 3) S.scr_damage(this);
      if (this.target === 3) S.scr_damage_all(this);
      instance_destroy(this);
    }
  }
}
defineObject('obj_collidebullet', CollideBullet);

export class RegularBullet extends CollideBullet {
  constructor() {
    super();
    this.depth = -10;
  }
  create() {
    this.grazed = 0;
    this.grazepoints = 5;
    this.timepoints = 5;
    this.target = 0;
    this.dont = 1;
    this.inv = 60;
    this.damage = 124;
    this.active = 1;
    this.spec = 0;
    this.image_alpha = 1;
    if (!instance_exists('obj_heart')) instance_destroy(this);
    this.wall_destroy = 1;
  }
  step() {
    if (this.wall_destroy === 1) {
      if (this.x < view_x() - 40) instance_destroy(this);
      if (this.x > view_x() + 680) instance_destroy(this);
      if (this.y < view_y() - 40) instance_destroy(this);
      if (this.y > view_y() + 520) instance_destroy(this);
    }
  }
}
defineObject('obj_regularbullet', RegularBullet);

// Damages without being destroyed.
export class RegularBulletPermanent extends RegularBullet {
  constructor() {
    super();
    this.depth = 0;
  }
  user5() {
    if (this.active === 1) {
      if (this.target !== 3) S.scr_damage(this);
      if (this.target === 3) S.scr_damage_all(this);
    }
  }
}
defineObject('obj_regularbullet_permanent', RegularBulletPermanent);

// scr_bullet_inherit(bullet): copies the caller's damage settings onto a new bullet.
export function scr_bullet_inherit(self, b) {
  if (b && b.alive) {
    b.damage = self.damage;
    b.grazepoints = self.grazepoints;
    b.timepoints = self.timepoints;
    b.inv = self.inv;
    b.target = self.target;
    b.grazed = 0;
    b.grazetimer = 0;
  }
}
defineScript('scr_bullet_inherit', scr_bullet_inherit);
