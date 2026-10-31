// JEVIL: obj_joker (the monster), obj_joker_body (everything you see of him),
// obj_hypnofx (Hypnosis rings) and obj_jokerbg_triangle_real (the spinning carousel room).
import {
  Instance, global, defineObject, defineScript, instance_create, instance_destroy, instance_exists, instancesOf,
  event_user, choose, random, lengthdir_x, lengthdir_y, merge_color, bgr, L, S,
  draw_sprite_ext, draw_sprite_part_ext, draw_set_color, draw_rectangle, draw_triangle,
  snd_play, snd_stop, snd_free_all,
} from './rt.js?v=20261031024711';
import { first, tagParent, view_x, view_y, scr_dark_marker, scr_84_get_sound, draw_sprite_fog, lt, gt } from './common.js?v=20261031024711';
import { scr_moveheart } from './soul.js?v=20261031024711';

const T = n => L('obj_joker_slash_Step_0_gml_' + n);
const MonsterParent = tagParent('obj_monsterparent');

export class Joker extends MonsterParent {
  constructor() {
    super();
    this.sprite_index = 'spr_joker_main';
    this.depth = 10;
  }
  create() {
    this.bikeflip = 0;
    this.becomeflash = 0;
    this.turnt = 0;
    this.turns = 0;
    this.talktimer = 0;
    this.talkmax = 90;
    this.state = 0;
    this.flash = 0;
    this.siner = 0;
    this.fsiner = 0;
    this.talked = 0;
    this.attacked = 0;
    this.hurt = 0;
    this.hurtamt = 0;
    this.hurttimer = 0;
    this.hurtshake = 0;
    this.mywriter = 343249823;
    this.acting = 0;
    this.actcon = 0;
    this.acttimer = 0;
    this.mercymod = -9999;
    this.maxmercy = 9999;
    this.warned = 0;
    this.compliment = 0;
    this.tired = 0;
    this.pirouette = 0;
    this.pirouettecounter = 0;
    this.pfactor = 1;
    this.hypnosis = 0;
    this.hypnosiscounter = 0;
    this.chaosdance = 0;
    this.reminvc = global.invc;
    this.remmaxhp = [];
    for (let i = 0; i < 4; i++) this.remmaxhp[i] = global.maxhp ? global.maxhp[i] : 0;
    this.attacks = 0;
    this.dodgetimer = 0;
    this.candodge = 0;
    this.con = 0;
    this.battlecancel = 0;
    this.nexttry = 0;
    this.mytarget = 3;
    this.image_speed = 0;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.idlesprite = 'spr_joker_main';
    this.hurtsprite = 'spr_joker_main';
    this.sparedsprite = 'spr_joker_main';
    this.body = instance_create(this.x, this.y, 'obj_joker_body');
    this.laughnoise = 0;
    this.beepnoise = 0;
    this.beepbuffer = 0;
    this.burstnoise = 0;
    this.jturn = 0;
    this.jattack = 0;
    if (!global.tempflag) global.tempflag = [];
    global.tempflag[4] = 1;
  }

  // Other_22: called by the battle controller right after creation (myself is set by then).
  user12() {
    global.monsterx[this.myself] = this.x + 20;
    global.monstery[this.myself] = this.y + 20;
    S.scr_monstersetup(this);
  }

  // Talk-time phase logic: HP thresholds and Hypnosis move him through the phases.
  choosePhase() {
    const m = this.myself, body = this.body;
    const mhpratio = global.monsterhp[m] / global.monstermaxhp[m];
    this.mhpratio = mhpratio;
    if (mhpratio <= 0.8 && this.jturn === 4) { this.jturn = 5; body.dancelv = 1; }
    if (mhpratio <= 0.6 && this.jturn === 9) this.jturn = 10;
    if (mhpratio <= 0.4 && this.jturn === 14) { this.jturn = 15; body.dancelv = 3; }
    if (mhpratio <= 0.15 && this.jturn < 17) { this.jturn = 17; body.dancelv = 2; }
    if (this.jturn >= 18) body.dancelv = 3;
    const hc = this.hypnosiscounter;
    if (hc >= 2 && this.jturn === 4 && this.turns >= 5 - hc) { this.jturn = 5; body.dancelv = 1; }
    if (hc >= 4 && this.jturn === 9 && this.turns >= 11 - hc) { this.jturn = 10; body.dancelv = 1; }
    if (hc >= 6 && this.jturn === 14 && this.turns >= 17 - hc) { this.jturn = 15; body.dancelv = 1; }
    if (this.jturn >= 19 && this.turns >= 29 - hc) {
      this.tired = 1;
      global.monsterstatus[m] = 1;
      body.dancelv = 2;
    }
  }

  // The line for this turn (global.msg[0]) and its voice clip.
  chooseLine() {
    const jt = this.jturn, body = this.body;
    const lines = { 0: 35, 1: 36, 2: 37, 3: 38, 5: 39, 6: 40, 7: 41, 8: 42, 10: 43, 11: 44, 12: 45, 13: 46, 15: 47, 16: 48, 17: 49, 18: 50 };
    if (lines[jt] !== undefined) global.msg[0] = T(lines[jt] + '_0');
    if (jt === 0) snd_play(scr_84_get_sound('snd_joker_chaos'));
    if (jt === 3 || jt === 13 || jt === 18) body.condition = 5;
    if (jt === 7) snd_play(scr_84_get_sound('snd_joker_anything'));
    if (jt === 17) body.dancelv = 2;
    if (jt === 4 || jt === 9 || jt === 14 || jt === 19) {
      const rr = choose(0, 1, 2, 3);
      if (rr === 0) {
        global.msg[0] = choose(T('56_0'), T('56_1'));
        snd_play(scr_84_get_sound('snd_joker_chaos'));
      }
      if (rr === 1) {
        global.msg[0] = T('57_0');
        snd_play(scr_84_get_sound('snd_joker_anything'));
      }
      if (rr === 2) global.msg[0] = choose(T('58_0'), T('58_1'));
      if (rr === 3) global.msg[0] = T('59_0');
    }
  }

  // jturn walks through the scripted attacks; the "4, 9, 14" turns repeat a random one of
  // the current phase until the HP / Hypnosis threshold moves him on.
  chooseAttack() {
    const m = this.myself;
    if (this.jturn >= 19) {
      if (global.monsterdf[m] > -10) global.monsterdf[m] -= 3;
      if (global.monsterat[m] < 11) global.monsterat[m] += 0.5;
      this.jattack = choose(0, 4, 7, 8, 10, 11, 12, 13, 13, 13);
    }
    if (this.jturn >= 15 && this.jturn <= 18) { this.jattack = this.jturn - 3; this.jturn += 1; }
    if (this.jturn === 14) this.jattack = choose(8, 9, 10, 11);
    if (this.jturn >= 10 && this.jturn <= 13) { this.jattack = this.jturn - 2; this.jturn += 1; }
    if (this.jturn === 9) this.jattack = choose(4, 5, 6, 7);
    if (this.jturn >= 5 && this.jturn <= 8) { this.jattack = this.jturn - 1; this.jturn += 1; }
    if (this.jturn === 4) this.jattack = choose(0, 1, 2, 3);
    if (this.jturn <= 3) { this.jattack = this.jturn; this.jturn += 1; }
    const ja = this.jattack;
    if (ja === 2 || ja === 5 || ja === 9 || ja === 13 || ja === 15) S.scr_targetall(this);
    else S.scr_randomtarget(this);
  }

  // Flavour text for the next menu, set as the attack starts.
  chooseBattleMsg() {
    const m = this.myself;
    const rr = choose(0, 1, 2, 3, 4);
    global.battlemsg[0] = T((158 + rr) + '_0');
    if (this.body.dancelv === 2) global.battlemsg[0] = T('163_0');
    if (this.jturn === 16) global.battlemsg[0] = T('164_0');
    if (this.jturn === 18) global.battlemsg[0] = T('165_0');
    if (this.jturn >= 19) global.battlemsg[0] = T('166_0');
    if (global.monsterstatus[m] === 1) global.battlemsg[0] = T('167_0');
  }

  step() {
    const m = this.myself;
    if (global.monster[m] === 1) {
      global.flag[51 + m] = 4;
      if (global.mnfight === 1 && this.talked === 0) {
        if (this.pirouette !== 2) global.invc = this.reminvc;
        this.choosePhase();
        if (!instance_exists('obj_darkener')) instance_create(0, 0, 'obj_darkener');
        global.typer = 50;
        this.chooseLine();
        S.scr_enemyblcon(this, this.x - 160, this.y - 20, 3);
        this.talked = 1;
        this.talktimer = 0;
        this.chooseAttack();
      }
      if (this.talked === 1 && global.mnfight === 1) {
        this.rtimer = 0;
        S.scr_blconskip(this, 15);
        if (global.mnfight === 2) {
          if (!instance_exists('obj_moveheart')) scr_moveheart();
          if (!instance_exists('obj_growtangle')) instance_create(view_x() + 320, view_y() + 170, 'obj_growtangle');
        }
      }
      if (global.mnfight === 2 && this.attacked === 0) {
        this.rtimer += 1;
        if (this.rtimer === 12) {
          global.turntimer = 240;
          event_user(this, 5);
          this.attacked = 1;
          global.typer = 6;
          global.fc = 0;
          this.chooseBattleMsg();
        } else global.turntimer = 120;
      }
      if (global.mnfight === 2 && global.turntimer <= 1) {
        // battlecancel is never set for Jevil (kept from the enemy template)
        if (this.battlecancel === 1) global.mercymod[m] = 999;
        if (this.battlecancel === 2) {
          for (const c of instancesOf('obj_battlecontroller')) c.noreturn = 1;
          this.con = 1;
          this.battlecancel = 3;
        }
      }
    }
    if (this.con === 1) {
      this.con = 2;
      this.alarm[4] = 10;
    }
    if (this.con === 3) {
      global.typer = 50;
      global.mercymod[m] = 999;
      global.msg[0] = T('201_0');
      S.scr_enemyblcon(this, this.x - 160, this.y, 3);
      this.con = 4;
    }
    if (this.con === 4 && !instance_exists('obj_writer')) {
      this.hspeed = 15;
      this.con = 5;
      this.alarm[4] = 15;
      for (const c of instancesOf('obj_battlecontroller')) c.alarm[2] = 17;
    }
    if (this.con === 6) {
      for (const c of instancesOf('obj_battlecontroller')) c.noreturn = 0;
      S.scr_monsterdefeat(this);
      instance_destroy(this);
      this.con = 7;
    }
    if (global.myfight === 3) this.actStep();
    if (global.myfight === 7) this.hspeed = 15;
    this.beepbuffer -= 1;
    if (this.beepnoise === 4 && this.beepbuffer < 0) {
      snd_stop('snd_bombfall');
      snd_play('snd_bombfall');
      this.beepnoise = 0;
      this.beepbuffer = 5;
    }
    if (this.burstnoise === 1) {
      snd_stop('snd_bomb');
      snd_play('snd_bomb');
      this.burstnoise = 0;
    }
  }

  // ACTs (global.myfight == 3): 1 Check, 2 Pirouette, 3 Hypnosis.
  actStep() {
    const m = this.myself;
    this.xx = view_x();
    this.yy = view_y();
    if (this.acting === 1 && this.actcon === 0) {
      this.actcon = 1;
      global.msg[0] = T('237_0');
      S.scr_battletext_default(this);
    }
    if (this.acting === 2 && this.actcon === 0) {
      this.actcon = 5;
      global.msg[0] = T('247_0');
      snd_play('snd_pirouette');
      const kris = first('obj_herokris') || { x: view_x() + 80, y: view_y() + 100, depth: 200 };
      for (const k of instancesOf('obj_herokris')) k.visible = false;
      this.dancekris = scr_dark_marker(kris.x, kris.y, 'spr_krisb_pirouette');
      this.dancekris.image_speed = 0.3334;
      this.dancekris.depth = kris.depth;
      const fx = instance_create(this.dancekris.x + 28, this.dancekris.y + 40, 'obj_afterimage_grow');
      fx.sprite_index = 'spr_pirouette_fx';
      fx.image_xscale = 2;
      fx.image_yscale = 2;
      S.scr_battletext_default(this);
    }
    if (this.actcon === 5 && !instance_exists('obj_writer')) {
      if (this.dancekris) instance_destroy(this.dancekris);
      for (const k of instancesOf('obj_herokris')) k.visible = true;
      this.pirouetteResult();
      S.scr_battletext_default(this);
      this.hypnosiscounter += 0.5;
      if (this.hypnosiscounter >= 9) {
        this.txtpart3 = T('387_0'); // (assigned but never shown, as in the original)
        global.monsterstatus[m] = 1;
      }
      this.pirouette = this.chaosdance;
      this.pirouettecounter += 1;
      this.actcon = 1;
    }
    if (this.acting === 3 && this.actcon === 0) {
      if (global.monsterat[m] > 10) global.monsterat[m] -= 0.5;
      this.hypnofx = instance_create(global.monsterx[m], global.monstery[m], 'obj_hypnofx');
      snd_play('snd_hypnosis');
      this.actcon = 1;
      const aaa = choose(0, 1, 2);
      this.txtpart1 = T((400 + aaa) + '_0');
      this.txtpart2 = T('403_0');
      this.txtpart3 = T('404_0');
      if (this.hypnosiscounter === 0) this.txtpart3 = T('405_0');
      if (this.hypnosiscounter >= 9) {
        this.txtpart3 = T('406_0');
        global.monsterstatus[m] = 1;
      }
      global.msg[0] = this.txtpart1 + this.txtpart2 + this.txtpart3 + T('407_0');
      this.pfactor = 0.7;
      this.hypnosis = 1;
      this.hypnosiscounter += 1;
      S.scr_battletext_default(this);
    }
    if (this.actcon === 1 && !instance_exists('obj_writer')) {
      this.actcon = 0;
      S.scr_attackphase();
    }
  }

  // Pirouette's effect cycles with chaosdance (advanced once per attack).
  pirouetteResult() {
    const m = this.myself;
    global.msg[0] = T('272_0');
    const cd = this.chaosdance;
    if (cd === 0) {
      global.msg[0] = T('276_0');
      snd_play(choose('snd_badexplosion', 'snd_carhonk', 'snd_toilet'));
    }
    if (cd === 1) {
      global.msg[0] = T('284_0');
      if (global.monsterdf[m] >= -16) global.monsterdf[m] -= 4;
      snd_play('snd_weirdeffect');
    }
    if (cd === 2) {
      global.msg[0] = T('290_0');
      snd_play('snd_awkward');
      global.invc = 0.4;
    }
    if (cd === 3) {
      global.msg[0] = T('296_0');
      this.pfactor = 0.7;
      snd_play('snd_shadowpendant');
    }
    if (cd === 4) {
      for (const mk of instancesOf('obj_marker')) if (mk.sprite_index === 'spr_uselessbird') instance_destroy(mk);
      const bird = scr_dark_marker(view_x() - 40, view_y() + 60, 'spr_uselessbird');
      bird.hspeed = 12;
      bird.image_speed = 0.334;
      snd_play('snd_birdtweet');
      global.msg[0] = T('310_0');
    }
    if (cd === 5) {
      global.msg[0] = T('314_0');
      this.star = choose(0, 1, 2);
      S.scr_healitemspell(this, Math.floor(random(31) + 25));
    }
    if (cd === 6) {
      global.msg[0] = T('320_0');
      this.hpJumble();
      snd_play('snd_weirdeffect');
    }
    if (cd === 7) {
      snd_play('snd_boost');
      global.msg[0] = T('373_0');
      this.pfactor = 1.25;
    }
    if (cd === 8) {
      snd_play('snd_applause');
      global.msg[0] = T('379_0');
      S.scr_healallitemspell(this, 36 + Math.floor(random(15)));
    }
  }

  // Kris keeps slot 1's numbers; Susie's and Ralsei's HP, max HP and HP colours rotate.
  hpJumble() {
    const swap1 = choose(2, 3);
    const swap2 = swap1 === 2 ? 3 : 2;
    const remhp = [], curmaxhp = [];
    for (let i = 0; i < 4; i++) {
      remhp[i] = global.hp[i];
      curmaxhp[i] = global.maxhp[i];
    }
    global.maxhp[1] = curmaxhp[swap1];
    global.maxhp[swap1] = curmaxhp[swap2];
    global.maxhp[swap2] = curmaxhp[1];
    global.hp[1] = remhp[swap1];
    global.hp[swap1] = remhp[swap2];
    global.hp[swap2] = remhp[1];
    const bc = first('obj_battlecontroller');
    if (bc && bc.hpcolor) {
      const rem = [bc.hpcolor[0], bc.hpcolor[1], bc.hpcolor[2]];
      bc.hpcolor[0] = rem[swap1 - 1];
      bc.hpcolor[swap1 - 1] = rem[swap2 - 1];
      bc.hpcolor[swap2 - 1] = rem[0];
    }
    for (let i = 1; i <= 3; i++) {
      if (global.hp[i] < 1) {
        global.hp[1] += Math.floor(global.hp[i] / 3);
        global.hp[2] += Math.floor(global.hp[i] / 3);
        global.hp[3] += Math.floor(global.hp[i] / 3);
        global.hp[i] = 1;
      }
    }
    for (let i = 1; i <= 3; i++) if (global.hp[i] < 1) global.hp[i] = 1;
    S.scr_revive(0);
    S.scr_revive(1);
    S.scr_revive(2);
  }

  // Other_15: launch this turn's attack.
  user5() {
    if (this.attacked !== 0) return;
    const m = this.myself, body = this.body;
    this.turns += 1;
    this.chaosdance += 1;
    if (this.chaosdance >= 9) this.chaosdance = 0;
    this.remat = global.monsterat[m];
    global.monsterat[m] = global.monsterat[m] * this.pfactor;
    const at = global.monsterat[m];
    const ja = this.jattack;
    const make = (type, target, damage, extra = {}) => {
      const dc = instance_create(this.x, this.y, 'obj_dbulletcontroller');
      dc.type = type;
      dc.target = target;
      dc.damage = damage;
      Object.assign(dc, extra);
      this.dc = dc;
      return dc;
    };
    const scytheShape = () => { if (body.condition < 4) body.condition = 5; };
    const vanish = () => { body.condition = 2; };
    if (ja === 0) { make(70, this.mytarget, at * 5, { grazepoints: 2 }); vanish(); }
    if (ja === 1) make(65, this.mytarget, at * 5, { grazepoints: 3 });
    if (ja === 2) { make(49, 3, at * 4, { grazepoints: 3 }); vanish(); }
    if (ja === 3) { scytheShape(); make(75, this.mytarget, at * 6, { grazepoints: 3 }); }
    if (ja === 4) {
      snd_play(scr_84_get_sound('snd_joker_anything'));
      make(62, this.mytarget, at * 5, { inv: 20, grazepoints: 2 });
    }
    if (ja === 5) { make(50, 3, at * 4, { grazepoints: 3 }); global.turntimer = 300; vanish(); }
    if (ja === 6) make(73, this.mytarget, at * 5);
    if (ja === 7) make(68, this.mytarget, at * 5, { grazepoints: 2 });
    if (ja === 8) {
      snd_play(scr_84_get_sound('snd_joker_anything'));
      make(61, this.mytarget, at * 5, { inv: 20, grazepoints: 3 });
      global.turntimer = 240;
    }
    if (ja === 9) { make(48, 3, at * 4, { grazepoints: 4 }); global.turntimer = 270; vanish(); }
    if (ja === 10) make(72, this.mytarget, at * 5);
    if (ja === 11) { scytheShape(); make(76, this.mytarget, at * 6, { grazepoints: 3 }); }
    if (ja === 12) { make(71, this.mytarget, at * 5, { grazepoints: 2 }); vanish(); }
    if (ja === 13) { make(46, 3, at * 4, { grazepoints: 4 }); global.turntimer = 330; vanish(); }
    if (ja === 14) make(74, this.mytarget, at * 4);
    if (ja === 15) { make(77, this.mytarget, at * 4); global.turntimer = 1500; scytheShape(); }
    if (ja === 99) { make(47, 3, at * 4); global.turntimer = 300; vanish(); }
    if (ja === 999) { make(25, this.mytarget, at * 4); global.turntimer = 300; }
    for (const dc of instancesOf('obj_dbulletcontroller')) dc.joker = 1;
    this.pfactor = 1;
    global.monsterat[m] = this.remat;
    this.attacked = 1;
  }

  alarm4() {
    this.con += 1;
  }

  // Other_20: defeated (HP 0) or spared / pacified.
  user10() {
    const m = this.myself, body = this.body;
    for (let i = 0; i < 4; i++) {
      global.maxhp[i] = this.remmaxhp[i];
      if (global.hp[i] >= global.maxhp[i]) global.hp[i] = global.maxhp[i];
    }
    global.invc = this.reminvc;
    for (const b of instancesOf('obj_joker_body')) {
      b.image_xscale = 2;
      b.image_yscale = 2;
      b.sprite_index = 'spr_joker_teleport';
      b.sparedsprite = b.sprite_index;
      b.image_index = 1;
      b.image_speed = 0;
    }
    if (global.monsterhp[m] > 0) {
      for (const b of instancesOf('obj_joker_body')) {
        b.x += 20;
        b.y += 18;
        S.scr_spareanim(b);
        b.x -= 20;
        b.y -= 18;
      }
    }
    for (const c of instancesOf('obj_battlecontroller')) c.skipvictory = 1;
    snd_free_all();
    body.dancelv = 4;
    body.condition = 0;
    for (const bg of instancesOf('obj_jokerbg_triangle_real')) bg.on = 0;
    S.scr_monsterdefeat(this);
    global.invc = this.reminvc;
    instance_destroy(this);
  }

  user11() {}

  // Hurt reaction (state 3, set by the FIGHT code) and the white target flash.
  draw() {
    const m = this.myself, body = this.body;
    if (this.state === 3) {
      if (this.hurttimer > 0) {
        this.hurttimer = 0;
        body.condition = 1;
        body.siner = 0;
        body.maxdist = body.maxdist + (20 + this.hurtamt / 5);
        if (body.maxdist < 30) body.maxdist = 30;
        const mhpratio = global.monsterhp[m] / global.monstermaxhp[m];
        this.mhpratio = mhpratio;
        body.floatsinerspeed = 1 + (1 - mhpratio);
        if (mhpratio <= 0.8 && body.dancelv === 0) body.dancelv = 1;
        if (mhpratio <= 0.4 && this.jturn < 17) body.dancelv = 3;
        if (mhpratio <= 0.2 && this.jturn === 17) body.dancelv = 2;
        if (mhpratio <= 0) {
          event_user(this, 10);
          global.flag[241] = 6;
        }
        const bg = first('obj_jokerbg_triangle_real');
        if (bg && mhpratio > 0) bg.rotspeed = 1 + (1.5 - mhpratio * 1.5);
        this.laughnoise = choose(0, 1, 2);
        if (this.laughnoise === 0) snd_play('snd_joker_laugh0');
        if (this.laughnoise === 1) snd_play('snd_joker_ha1');
        if (this.laughnoise === 2) snd_play('snd_joker_ha0');
      }
      this.hurttimer -= 1;
      if (this.hurttimer < 0) this.state = 0;
    }
    if (this.state === 0) {
      this.siner += 1;
      this.thissprite = this.idlesprite;
      if (this.flash === 1) {
        this.fsiner += 1;
        body.fsiner = this.fsiner;
        const a = -Math.cos(this.fsiner / 5) * 0.4 + 0.6;
        const bx = body.offx + body.flyx, by = body.offy + body.fly;
        if (body.dancelv === 0) draw_sprite_fog('spr_joker_main', 0, bx, by, 2, 2, 0, 0xffffff, a);
        if (body.dancelv === 1) draw_sprite_fog('spr_joker_dance', body.floatsiner / 3, bx, by, 2, 2, 0, 0xffffff, a);
        if (body.dancelv === 2) draw_sprite_fog('spr_joker_tired', 0, bx, by, 2, 2, 0, 0xffffff, a);
      }
    }
    if (this.becomeflash === 0) this.flash = 0;
    this.becomeflash = 0;
  }
}
defineObject('obj_joker', Joker);

export class JokerBody extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_joker_main';
    this.depth = 15;
  }
  create() {
    this.siner = 0;
    this.ji = 0;
    this.maxchain = 6;
    this.maxdist = 0;
    this.size = 2;
    this.floatsiner = 0;
    this.floatsinerspeed = 1;
    this.debug = 0;
    this.sndcon = 0;
    this.condition = 0;
    this.timer = 0;
    this.scythecon = 0;
    this.spintimer = 0;
    this.s_xscale = 2;
    this.s_yscale = 2;
    this.s_sprite = 'spr_joker_teleport';
    this.s_y = 0;
    this.s_vspeed = 0;
    this.s_alpha = 1;
    this.xsiner = 0;
    this.ysiner = 0;
    this.rotsiner = 0;
    this.image_speed = 0.334;
    this.dance_side = 0;
    this.fliptimer = 0;
    this.dancelv = 0;
    this.dancesiner = 0;
    this.dancemade = 0;
    this.fade = 0;
    this.shadowx = [];
    this.shadowy = [];
    this.sfactor = [];
    this.dalpha = [];
    for (let i = 0; i < 7; i++) {
      this.shadowx[i] = 0;
      this.shadowy[i] = 0;
      this.sfactor[i] = 1;
    }
    // Draw-time values the joker reads for its flash before the first body Draw.
    this.fly = 0;
    this.flyx = 0;
    this.offx = this.x + 20;
    this.offy = this.y + 18;
  }
  draw() {
    this.floatsiner += this.floatsinerspeed;
    this.fly = Math.sin(this.floatsiner / 8) * 3 * (this.floatsinerspeed * 2 - 1);
    this.flyx = 0;
    if (this.dancelv >= 1) this.flyx = Math.cos(this.floatsiner / 8) * 3 * (this.floatsinerspeed * 2 - 1);
    if (this.dancelv === 4) {
      this.flyx = 0;
      this.fly = 0;
    }
    this.offx = this.x + 20;
    this.offy = this.y + 18;
    const { offx, offy, fly } = this;
    // (each check re-reads condition, so a change made by one block is seen by the next)
    if (this.condition === 0) this.drawIdle();
    if (this.condition === 1) this.drawHurt();
    if (this.condition === 2) {
      // Vanishes (and the heroes fade out) before an attack that hides him.
      for (const h of instancesOf('obj_heroparent')) h.image_alpha -= 0.25;
      if (this.sndcon === 0) {
        snd_play('snd_spearappear');
        this.sndcon = 1;
      }
      draw_sprite_ext('spr_joker_main', 0, offx, offy + fly, this.size, 2, 0, 0xffffff, 1);
      this.size -= 0.5;
      if (this.size <= 0) {
        for (const h of instancesOf('obj_heroparent')) h.image_alpha = 0;
        this.sndcon = 0;
        this.size = 2;
        this.condition = 4;
      }
    }
    if (this.condition === 3) {
      for (const h of instancesOf('obj_heroparent')) h.image_alpha += 0.25;
      if (this.sndcon === 0) {
        snd_play('snd_spearappear');
        this.sndcon = 1;
      }
      draw_sprite_ext('spr_joker_main', 0, offx, offy + fly, this.size, 2, 0, 0xffffff, 1);
      this.size += 0.5;
      if (this.size >= 2) {
        for (const h of instancesOf('obj_heroparent')) h.image_alpha = 1;
        this.size = 2;
        this.condition = 0;
        this.sndcon = 0;
      }
    }
    if (this.condition === 4 && global.turntimer <= 10) {
      this.timer = 0;
      this.condition = 3;
      this.size = 0;
    }
    if (this.condition === 5) this.drawMetamorphosis();
    if (this.condition === 0 || this.condition === 1) {
      if (this.dancelv <= 2) {
        draw_set_color(0);
        const cx = this.x + this.sprite_width / 2;
        draw_rectangle(cx - 20 - this.fly + this.flyx, this.y + 80 - this.fly / 2, cx + 30 + this.fly + this.flyx, this.y + 85 + this.fly / 2, false);
      }
    }
  }
  drawIdle() {
    const { offx, offy, fly, flyx } = this;
    if (this.fade === 0) this.fade_a = 1;
    if (this.fade === 1) this.fade_a = Math.abs(Math.sin(this.floatsiner / 13));
    if (this.dancelv === 0) draw_sprite_ext('spr_joker_main', 0, offx + flyx, offy + fly, 2, 2, 0, 0xffffff, this.fade_a);
    if (this.dancelv === 1) draw_sprite_ext('spr_joker_dance', this.floatsiner / 3, offx + flyx, offy + fly, 2, 2, 0, 0xffffff, 1);
    if (this.dancelv === 2) draw_sprite_ext('spr_joker_tired', 0, offx + flyx, offy + fly, 2, 2, 0, 0xffffff, 1);
    if (this.dancelv === 3) {
      // Seven flickering dancing copies scattered around his spot.
      this.dancesiner += 1;
      for (let i = 0; i < 7; i++) {
        if (i >= 1) {
          this.shadowx[i] += Math.sin(i + this.floatsiner / 5) * 8 * this.sfactor[i];
          this.shadowy[i] += Math.cos(i + this.floatsiner / 5) * 4 * this.sfactor[i];
        }
        this.dalpha[i] = Math.sin(i + this.dancesiner / 9);
        if (this.dalpha[i] < 0 && i >= 1) {
          this.shadowx[i] = 60 - random(120);
          this.shadowy[i] = 60 - random(120);
          this.sfactor[i] = 1.5 - random(3);
        }
        draw_sprite_ext('spr_joker_dance', this.dancesiner / 2 + i / 4, this.x + this.shadowx[i], this.y + this.shadowy[i], 2, 2, 0, this.image_blend, this.dalpha[i]);
      }
    }
    if (this.dancelv === 4) draw_sprite_ext('spr_joker_teleport', 1, offx + flyx, offy + fly, 2, 2, 0, 0xffffff, 1);
  }
  // Hit: the head flies around on its spring chain.
  drawHurt() {
    const { offx, offy, fly } = this;
    if (this.maxdist >= 150) this.maxdist = 150;
    let sinadd = 0.8 + this.maxdist / 50;
    if (sinadd < 0.8) sinadd = 0.8;
    if (sinadd > 2) sinadd = 2;
    this.siner += sinadd;
    const md = this.maxdist;
    const sinx = Math.sin(this.siner / 4) * md;
    const siny = -Math.abs(Math.sin(this.siner / 4)) * (md * 0.7);
    this.ji = 0;
    if (sinx > md / 2 && md > 15) this.ji = 1;
    if (sinx < -md / 2 && md > 15) this.ji = 2;
    if (md < 4) this.ji = 3;
    for (let i = 0; i < this.maxchain - 1; i++) {
      draw_sprite_ext('spr_jokerchain', this.ji, offx + sinx * (i / this.maxchain) - 2, offy + 6 + (siny - 32) * (i / this.maxchain) + fly, 2, 2, 0, 0xffffff, 1);
    }
    draw_sprite_ext('spr_jokerbody', 0, offx - 42, offy + fly - 2, 2, 2, 0, 0xffffff, 1);
    draw_sprite_ext('spr_jokerhead', this.ji, offx + sinx - 2, offy + siny + fly - 14, 2, 2, 0, 0xffffff, 1);
    this.maxdist -= 1;
    if (this.maxdist <= 0) {
      this.maxdist = 0;
      this.condition = 0;
    }
  }
  // Turns into the Devilsknife and flies off (scythe attacks), back at turn end.
  drawMetamorphosis() {
    this.timer += 1;
    const t = this.timer;
    if (t === 1) {
      this.spintimer = 0;
      this.s_xscale = 2;
      this.s_yscale = 2;
      this.s_sprite = 'spr_joker_teleport';
      this.s_y = 0;
      this.s_vspeed = 0;
      this.s_alpha = 1;
      snd_play(scr_84_get_sound('snd_joker_metamorphosis'));
    }
    if (t >= 1 && t <= 3) {
      this.s_xscale *= 1.3;
      this.s_yscale *= 0.7;
    }
    if (t >= 5 && t <= 15) {
      this.s_xscale *= 0.7;
      this.s_yscale *= 1.3;
    }
    if (t >= 15 && t <= 30) {
      this.spintimer += 1;
      this.s_xscale = Math.sin(this.spintimer / 3) * 2;
      this.s_sprite = 'spr_joker_scythebody';
      this.s_yscale *= 0.7;
      if (this.s_xscale >= 2) this.s_xscale = 2;
      if (this.s_yscale <= 2) this.s_yscale = 2;
    }
    if (t >= 30 && t < 41) {
      this.spintimer += 1;
      this.s_xscale = Math.sin(this.spintimer / 3) * 2;
      this.s_vspeed -= 3;
      this.s_y += this.s_vspeed;
      this.s_alpha -= 0.1;
    }
    if (t >= 41 && instance_exists('obj_battlecontroller') && global.turntimer > 10) {
      this.timer = 0;
      this.condition = 4;
    }
    draw_sprite_ext(this.s_sprite, 0, this.offx, this.offy + this.s_y, this.s_xscale, this.s_yscale, 0, this.image_blend, this.s_alpha);
  }
}
defineObject('obj_joker_body', JokerBody);

export class HypnoFx extends Instance {
  constructor() {
    super();
    this.sprite_index = 'spr_hypnoring';
  }
  create() {
    this.type = 0;
    this.size = 0;
    this.ringmax = 4;
    this.timer = 0;
  }
  draw() {
    this.timer += 1;
    if (this.timer === 1) {
      this.initsiner = random(400);
      this.ringsize = [];
      this.ringradius = [];
      this.ringspeed = [];
      this.ringalpha = [];
      this.ringsiner = [];
      for (let i = 0; i < this.ringmax; i++) {
        this.ringsize[i] = 1 + 0.5 * i;
        this.ringradius[i] = 2 + i * 12;
        this.ringspeed[i] = 0.3;
        this.ringalpha[i] = 0;
        this.ringsiner[i] = this.initsiner;
      }
    }
    if (this.timer >= 2) {
      for (let i = 0; i < this.ringmax; i++) {
        this.ringsiner[i] += (i + 2) * this.ringalpha[i];
        if (this.timer < 12 && lt(this.ringalpha[i], 1)) this.ringalpha[i] += 0.2;
        if (this.timer >= 24) this.ringalpha[i] -= 0.1;
        draw_sprite_ext('spr_hypnoring', 0, this.x + Math.sin(this.ringsiner[i] / 12) * this.ringradius[i],
          this.y + Math.cos(this.ringsiner[i] / 12) * this.ringradius[i], this.ringsize[i], this.ringsize[i], 0, 0xffffff, this.ringalpha[i]);
      }
      if (this.timer >= 38) instance_destroy(this);
    }
  }
}
defineObject('obj_hypnofx', HypnoFx);

// The battle room's background: a scrolling carousel strip bent into a cylinder, under
// rotating dark-blue triangle fans. `on` fades it in and out.
export class JokerBg extends Instance {
  constructor() {
    super();
    this.sprite_index = null;
    this.depth = 600000;
  }
  create() {
    this.siner = 0;
    this.rot = 0;
    this.xscale = 0;
    this.yscale = 0;
    this.xcen = 320;
    this.ycen = 240;
    this.radius = 360;
    this.dkblue = merge_color(bgr(8388608), bgr(4210752), 0.1);
    this.dkblue2 = merge_color(bgr(8388608), bgr(4210752), 0.5);
    this.dkblue3 = merge_color(bgr(8388608), bgr(4210752), 0.5);
    this.dkblue3 = merge_color(this.dkblue3, 0, 0.2);
    this.bgx = 0;
    this.rotcounter = 0;
    this.rotfps = 1;
    this.rotspeed = 0;
    this.check = 0;
    this.on = 0;
    this.bgalpha = 0;
  }
  // Other_10: the i-th fan triangle (squashed vertically, flatter above the centre).
  user0() {
    const a1 = this.rot + 360 / this.trimax * this.i, a2 = this.rot + 360 / this.trimax * (this.i + 1);
    this.newx1 = lengthdir_x(this.radius, a1);
    this.newy1 = lengthdir_y(this.radius / 2, a1);
    this.newx2 = lengthdir_x(this.radius, a2);
    this.newy2 = lengthdir_y(this.radius / 2, a2);
    if (this.newy1 <= 0) this.newy1 *= 0.6;
    if (this.newy2 <= 0) this.newy2 *= 0.6;
    if (this.blackon === 0) {
      draw_set_color(this.dkblue);
      this.blackon = 1;
    } else {
      this.blackon = 0;
      draw_set_color(this.dkblue2);
    }
  }
  draw() {
    this.trimax = 8;
    this.blackon = 0;
    let curx = view_x();
    let curl = 0 + this.bgx;
    if (this.bgx >= 640) this.bgx -= 640;
    let curscale = 1;
    let curw = 5;
    if (this.on === 1 && lt(this.bgalpha, 1)) this.bgalpha += 0.02;
    if (this.on === 0 && gt(this.bgalpha, 0)) this.bgalpha -= 0.02;
    const strip = (h) => {
      draw_sprite_part_ext('spr_carouselbg', 0, curl, 0, curw, Math.min(h, 300), curx, -this.i + view_y(), curscale, 1, this.dkblue3, this.bgalpha);
    };
    for (this.i = 0; this.i < 16; this.i++) {
      strip(300);
      curscale = Math.floor(1 + 0.5 * this.i);
      curl += 5;
      if (curl >= 640) curl -= 640;
      curw = 5;
      curx += 5 * curscale - 5;
    }
    for (this.i = 16; this.i > 0; this.i--) {
      strip(380);
      let tempscale = 1 + 0.5 * this.i;
      if (tempscale < 1) tempscale = 1;
      curscale = Math.ceil(tempscale);
      curl += 5;
      if (curl >= 640) curl -= 640;
      curw = 5;
      curx += 5 * curscale - 5;
    }
    const { xcen, ycen } = this;
    for (this.i = 0; this.i < this.trimax; this.i++) {
      this.user0();
      draw_triangle(xcen, ycen, xcen + this.newx1, ycen + this.newy1, xcen + this.newx2, ycen + this.newy2, false);
    }
    for (this.i = 0; this.i < 8; this.i++) {
      this.user0();
      if ((this.newy1 > 0 || this.newy2 > 0) && this.newx2 > this.newx1 - 48)
        draw_triangle(xcen, ycen - 80, xcen + this.newx1 / 6, ycen + this.newy1 / 6, xcen + this.newx2 / 6, ycen + this.newy2 / 6, false);
    }
    for (this.i = 8; this.i >= 0; this.i--) {
      this.user0();
      if (this.newy1 > 0 || this.newy2 > 0)
        draw_triangle(xcen, ycen - 80, xcen + this.newx1 / 4, ycen + this.newy1 - 380, xcen + this.newx2 / 4, ycen + this.newy2 - 380, false);
    }
    for (this.i = 0; this.i < this.trimax; this.i++) {
      this.user0();
      draw_triangle(xcen, ycen - 320, xcen + this.newx1, ycen + this.newy1 - 320, xcen + this.newx2, ycen + this.newy2 - 320, false);
    }
    this.siner += 2;
    if (this.on === 1) this.rotcounter += 1;
    if (this.rotcounter >= this.rotfps && this.on === 1) {
      if (lt(this.rotspeed, 1)) this.rotspeed += 0.1;
      this.bgx += 1 * this.rotfps;
      this.rot += 2.5 * this.rotfps * this.rotspeed;
      this.rotcounter = 0;
    }
  }
}
defineObject('obj_jokerbg_triangle_real', JokerBg);

// Jevil-specific room setup the battle start can call: the background object
// (placed in room_cc_joker) switched on as obj_jokerbattleevent does once the battle exists.
defineScript('scr_joker_bg_on', () => {
  let bg = first('obj_jokerbg_triangle_real');
  if (!bg) bg = instance_create(0, 0, 'obj_jokerbg_triangle_real');
  bg.on = global.flag && global.flag[8] === 1 ? 0 : 1;
  return bg;
});
