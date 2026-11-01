// obj_dbulletcontroller: the bullet generator obj_joker's Other_15 creates. Only the types
// Jevil uses are ported: the `joker == 1` block (45-77) and type 25 (jattack 999).
//   jattack 0..15 -> type 70, 65, 49, 75, 62, 50, 73, 68, 61, 48, 72, 76, 71, 46, 74, 77
//   jattack 99 -> 47, jattack 999 -> 25
import {
  global, defineObject, instance_create, instance_destroy, instancesOf, random, choose,
  lengthdir_x, lengthdir_y, snd_play, snd_loop, snd_stop, snd_volume, S,
} from '../rt.js?v=20261101031117';
import { BulletGenParent, scr_bullet_inherit } from '../bullets.js?v=20261101031117';
import { first, setAll, boardRef, heartRef, view_x, view_y, scr_dark_marker, scr_84_get_sound, ge, le } from '../common.js?v=20261101031117';

export class DBulletController extends BulletGenParent {
  constructor() {
    super();
    this.sprite_index = 'spr_grazemask';
    this.visible = false;
    this.depth = 15;
  }
  create() {
    this.btimer = 99;
    this.timermax = 12;
    this.difficulty = 1;
    this.type = 1;
    this.joker = 0;
    this.side = 1;
    this.damage = 100;
    this.grazepoints = 1;
    this.timepoints = 1;
    this.inv = 60;
    this.grazed = 0;
    this.grazetimer = 0;
    this.target = 0;
    this.made = 0;
    this.special = 0;
    this.miny = 150;
    this.maxy = 280;
    const g = first('obj_growtangle');
    if (g) {
      this.miny = g.y - g.sprite_height / 2;
      this.maxy = g.y + g.sprite_height / 2;
    }
    this.ratio = 1;
    const pop = S.scr_monsterpop();
    if (pop === 2) this.ratio = 1.6;
    if (pop === 3) this.ratio = 2.3;
    this.sidespade = [];
  }

  // Suit bombs fall from the sky at either side of the board.
  dropBomb(fixedType) {
    const xx = choose(0, 1);
    let basex = view_x() + 320;
    const g = first('obj_growtangle');
    if (g) basex = g.x;
    let idealx = basex;
    if (xx === 0) idealx = basex - 180 - random(100);
    if (xx === 1) idealx = basex + 180 + random(100);
    const bomb = instance_create(idealx, -20, 'obj_suitbomb');
    scr_bullet_inherit(this, bomb);
    if (fixedType === undefined) {
      if (bomb.type === 2) bomb.type = choose(0, 1, 2, 3);
    } else bomb.type = fixedType;
    this.btimer = 0;
  }

  spadeRing(set) {
    const bs = boardRef();
    const ring = instance_create(bs.x, bs.y, 'obj_spadering');
    set(ring);
    scr_bullet_inherit(this, ring);
    this.btimer = 0;
  }

  teleport(isFan) {
    const bs = boardRef();
    const jokerx = choose(bs.x - 100 - random(100), bs.x + 100 + random(100));
    const jokery = choose(bs.y - random(100), bs.y + random(100));
    const j = instance_create(jokerx, jokery, 'obj_joker_teleport');
    if (isFan) j.type = 1;
    scr_bullet_inherit(this, j);
    j.active = 0;
    this.btimer = 0;
  }

  step() {
    this.btimer += 1;
    const type = this.type;

    if (type === 21 || type === 23 || type === 25) {
      if (type === 21) this.bmax = 9;
      if (type === 23) this.bmax = 7;
      if (type === 25) this.bmax = 4;
      for (const b of instancesOf('obj_regularbullet')) b.image_alpha += 0.2;
      if (this.btimer >= this.bmax) {
        const radius = this.side === 0 ? 80 : 560;
        const g = boardRef();
        const s = instance_create(view_x() + radius, g.y - g.sprite_height / 2 + random(g.sprite_height), 'obj_regularbullet');
        this.sidespade[this.side] = s;
        if (this.side === 0) s.direction = 0;
        if (this.side === 1) s.direction = 180;
        s.image_alpha = 0;
        s.damage = this.damage;
        s.target = this.target;
        s.sprite_index = 'spr_spadebullet';
        s.speed = 5;
        s.friction = -0.1;
        s.image_angle = s.direction;
        this.side = this.side === 1 ? 0 : 1;
        this.btimer = 0;
      }
    }

    if (this.joker !== 1) return;
    const bs = boardRef();

    if (type === 45 && this.btimer >= 18) this.dropBomb();
    if (type === 46 && this.btimer >= 12) this.dropBomb();
    if (type === 47 && this.btimer >= 12) this.dropBomb(1);
    if (type === 48 && this.btimer >= 12) this.dropBomb(0);
    if (type === 49 && this.btimer >= 20) this.dropBomb(2);
    if (type === 50 && this.btimer >= 12) this.dropBomb(3);

    if (type === 55 && this.btimer >= 40 && this.made === 0) {
      this.btimer = 0;
      this.made = 1;
      const s = instance_create(bs.x - 200, bs.y, 'obj_bigscythe');
      scr_bullet_inherit(this, s);
      s.image_angle = 270 + random(120);
    }
    if (type === 56 && this.btimer >= 29 && this.made === 0) {
      this.btimer = 0;
      const xchoose = choose(-250);
      const s = instance_create(bs.x + xchoose, bs.y, 'obj_bigscythe');
      scr_bullet_inherit(this, s);
      s.image_angle = random(90);
      s.type = 3;
      s.friction = -0.25;
      if (xchoose > 0) s.hspeed = -1;
      if (xchoose < 0) s.hspeed = 1;
    }
    if (type === 57 && this.btimer >= 40 && this.made === 0) {
      this.btimer = 0;
      this.made = 1;
      const s = instance_create(bs.x - 140, bs.y, 'obj_bigscythe');
      scr_bullet_inherit(this, s);
      s.anglespeed = -12;
      s.image_angle = 270 + random(120);
    }
    if (type === 58 && this.btimer >= 40 && this.made === 0) {
      this.btimer = 0;
      this.made = 1;
      const s = instance_create(bs.x - 150, bs.y, 'obj_bigscythe');
      s.anglespeed = -17;
      s.image_angle = 270 + random(120);
    }

    if (type === 60 && this.btimer >= 40 && this.made === 0) {
      this.btimer = 0;
      this.made = 1;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          const h = instance_create(bs.x + 150, bs.y - 80 + i * 80, 'obj_carouselbullet');
          h.siner = j * 18;
          h.vsin = j * 9;
          scr_bullet_inherit(this, h);
        }
      }
    }
    // Carousel II: horses and ducks bobbing in opposite phase, rarely a duck with a face.
    if (type === 61 && this.btimer >= 40 && this.made === 0) {
      this.btimer = 0;
      this.made = 1;
      this.horse = 0;
      const vseed = random(300);
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          let h = instance_create(bs.x + 150, bs.y - 80 + i * 80, 'obj_carouselbullet');
          h.siner = j * 42;
          h.vsin = 0 + vseed;
          h.image_index = 0;
          h.altmode = 2;
          h.sinspeed = 1.1;
          scr_bullet_inherit(this, h);
          h = instance_create(bs.x + 150, bs.y - 80 + i * 80, 'obj_carouselbullet');
          h.siner = j * 42 + 21;
          h.vsin = 0 + vseed;
          h.image_index = 1;
          h.altmode = 1;
          h.sinspeed = 1.1;
          scr_bullet_inherit(this, h);
          const chance = Math.floor(random(50));
          if (chance === 1) h.image_index = 2;
        }
        this.horse = this.horse === 0 ? 1 : 0;
      }
    }
    if (type === 62 && this.btimer >= 40 && this.made === 0) {
      this.btimer = 0;
      this.made = 1;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 7; j++) {
          const h = instance_create(bs.x + 150, bs.y - 80 + i * 80, 'obj_carouselbullet');
          h.siner = j * 18;
          h.vsin = j * 9;
          h.sinspeed = 1.15;
          h.altmode = 3;
          scr_bullet_inherit(this, h);
        }
      }
    }

    if (type === 65 && this.btimer >= 60) this.spadeRing(r => { r.maxspade = 10; r.grav = 0.4; });
    if (type === 66 && this.btimer >= 30) this.spadeRing(r => { r.maxspade = 6; r.grav = 3; r.size = 1.5; });
    if (type === 67 && this.btimer >= 20) this.spadeRing(r => { r.grav = 0.2; r.maxspade = 4; r.special = 1; });
    if (type === 68) {
      for (const h of instancesOf('obj_heart')) h.wspeed = 5;
      if (this.btimer >= 54) this.spadeRing(r => { r.side = choose(0, 1); r.grav = 0.45; r.maxspade = 10; });
    }

    if (type === 70 && this.btimer >= 20 && global.turntimer >= 30) this.teleport(true);
    if (type === 71 && this.btimer >= 9 && global.turntimer >= 20) this.teleport(false);

    // Clubs fly in from a diagonal, alternating above and below the SOUL.
    if (type === 72 && this.btimer >= 18) {
      this.btimer = 0;
      let dir = 0;
      if (this.side === 1) dir = choose(225, 315);
      if (this.side === -1) dir = choose(45, 135);
      const radius = 360;
      const xx = lengthdir_x(radius, dir), yy = lengthdir_y(radius, dir);
      const h = heartRef();
      const d = instance_create(h.x + 8 + xx, h.y + 8 + yy, 'obj_clubsbullet_dark');
      d.direction = dir + 180;
      d.speed = 20;
      d.friction = 1;
      d.type = 2;
      d.damage = this.damage;
      d.target = this.target;
      d.image_angle = d.direction;
      this.side = this.side === 1 ? -1 : 1;
    }
    if (type === 73 && this.btimer >= 4) {
      this.btimer = 0;
      const radius = 140 + random(40);
      this.yy = radius * this.side;
      let xx = -100 + random(200);
      const num = choose(0, 1, 2, 3);
      if (num === 3) xx = -10 + random(20);
      const solid = first('obj_battlesolid');
      if (solid) {
        const db = instance_create(heartRef().x + 8 + xx, solid.y + 100, 'obj_dbullet_vert');
        db.type = 1;
        db.damage = this.damage;
        db.target = this.target;
        db.timepoints = 2;
      }
    }
    if (type === 74 && this.btimer >= 9) {
      this.btimer = 0;
      const radius = 140 + random(40);
      const yy = radius * this.side;
      let xx = -100 + random(200);
      const num = choose(0, 1, 2, 3);
      if (num === 3) xx = -10 + random(20);
      const h = heartRef();
      const d = instance_create(h.x + 8 + xx, h.y + 8 + yy, 'obj_dbullet_vert');
      d.grazepoints = 12;
      d.timepoints = 2;
      d.damage = this.damage;
      d.target = this.target;
    }
    if ((type === 75 || type === 76) && this.btimer >= 0 && this.special === 0) {
      snd_play('snd_spearappear');
      this.scythe = instance_create(0, 0, 'obj_centerscythe');
      setAll('obj_centerscythe', 'damage', this.damage);
      setAll('obj_centerscythe', 'grazepoints', this.grazepoints);
      setAll('obj_centerscythe', 'timepoints', this.timepoints);
      setAll('obj_centerscythe', 'inv', this.inv);
      setAll('obj_centerscythe', 'target', this.target);
      setAll('obj_centerscythe', 'grazed', 0);
      setAll('obj_centerscythe', 'grazetimer', 0);
      this.special = 1;
    }
    if (type === 77) this.finalChaos();
  }

  // jattack 15: the board vanishes, Devilsknives rain down, then the fixed finale.
  finalChaos() {
    const vx = view_x(), vy = view_y();
    global.sp = 10;
    for (const h of instancesOf('obj_heart')) h.wspeed = 10;
    if (this.special === 0) {
      snd_play('snd_joker_byebye');
      this.prevmake = 0;
      this.special = 1;
      this.rank = 16;
      this.realtimer = 0;
      this.chase = 0;
      this.made = 0;
      this.amount = 0;
      this.jokertimer = 0;
      const df = scr_dark_marker(vx + 320, vy - 10, 'spr_tallpx');
      df.depth = 2;
      df.image_alpha = 0;
      df.image_blend = 0;
      df.image_xscale = 200;
      df.image_yscale = 2;
      this.darkfader = df;
    }
    const rt = this.realtimer;
    if (rt >= 0 && rt < 10) {
      if (this.darkfader.alive) this.darkfader.image_alpha += 0.1;
      for (const s of instancesOf('obj_battlesolid')) s.image_alpha -= 0.1;
      for (const h of instancesOf('obj_heart')) {
        h.y += 16;
        h.boundaryup = 160;
      }
    }
    if (rt === 10) for (const s of instancesOf('obj_battlesolid')) instance_destroy(s);
    if (rt === 20) instance_create(vx + 40, -60, 'obj_laserscythe');
    if (rt === 40) instance_create(vx + 570, -60, 'obj_laserscythe');
    if (rt >= 60 && this.amount < 30 && this.btimer >= this.rank) {
      if (this.rank > 7) this.rank -= 1;
      let which = Math.floor(random(5));
      if (which === this.prevmake) which = Math.floor(random(5));
      if (this.chase === 3) {
        which = Math.floor((heartRef().x + 8) / 90);
        this.chase = 0;
      }
      instance_create(vx + 40 + 90 * which, -60, 'obj_laserscythe');
      if (which === 1) instance_create(vx + 40 + 450, -60, 'obj_laserscythe');
      if (which === 0) instance_create(vx + 40 + 540, -60, 'obj_laserscythe');
      this.prevmake = which;
      this.btimer = 0;
      this.chase += 1;
      this.amount += 1;
    }
    // Grazing a falling scythe adds 0.2 to `made`, which ends the random part sooner.
    if (ge(this.amount, 29 - this.made) && this.special === 1) {
      this.jokertimer = 0;
      const j = instance_create(vx + 320, vy + 100, 'obj_joker_teleport');
      j.type = 66;
      j.depth = -30;
      this.special = 2;
      this.which2 = 0;
    }
    if (this.special === 2) {
      this.jokertimer += 1;
      const jt = this.jokertimer;
      if (jt === 10) snd_play(scr_84_get_sound('snd_joker_neochaos'));
      const drop = (...xs) => { for (const x of xs) instance_create(vx + x, -60, 'obj_laserscythe'); };
      if (jt === 40 || jt === 98) drop(40, 580);
      if (jt === 46 || jt === 86) drop(130, 490);
      if (jt === 52 || jt === 80) drop(220, 400);
      if (jt === 66 || jt === 98) drop(310);
      if (jt === 130) {
        const ls = instance_create(vx + 320, -320, 'obj_laserscythe');
        this.p = 0;
        this.vol = 0;
        this.vol2 = 1;
        this.rumnoise = snd_loop('snd_rumble');
        ls.vspeed = 1;
        ls.gravity = 0.02;
        ls.image_xscale = 16;
        ls.image_yscale = 16;
        ls.scale = 16;
        ls.rotspeed = 0;
        ls.remrot = 160;
        ls.image_angle = 160;
        this.lastscythe = ls;
        const fw = instance_create(vx + 320, vy - 40, 'obj_marker');
        fw.sprite_index = 'spr_tallpx';
        fw.image_xscale = 400;
        fw.image_yscale = 2;
        fw.depth = -100;
        fw.image_alpha = -0.3;
        this.fadewhite = fw;
      }
      if (jt >= 131) {
        const ls = this.lastscythe;
        if (ls && ls.alive) ls.x = ls.xstart + random(8);
        if (this.fadewhite.alive) this.fadewhite.image_alpha += 0.01;
        this.vol += 0.01;
        if (ge(this.fadewhite.image_alpha, 1)) {
          if (this.darkfader) instance_destroy(this.darkfader);
          if (ls) instance_destroy(ls);
        }
        if (ge(this.fadewhite.image_alpha, 1.3)) this.special = 3;
      }
    }
    if (this.special === 3) {
      for (const h of instancesOf('obj_heart')) {
        h.x = vx + 320;
        h.y = vy + 120;
      }
      this.vol -= 0.1;
      if (this.rumnoise) snd_volume(this.rumnoise, Math.max(0, this.vol));
      if (this.fadewhite.alive) this.fadewhite.image_alpha -= 0.1;
      if (le(this.fadewhite.image_alpha, 0)) {
        snd_stop(this.rumnoise);
        global.turntimer = 11;
        this.special = 4;
      }
    }
    this.realtimer += 1;
  }

  // (Not in the GML: if the phase is cut short the looping rumble would never stop.)
  onDestroy() {
    if (this.rumnoise) snd_stop(this.rumnoise);
  }
}
defineObject('obj_dbulletcontroller', DBulletController);

