// The scenes around the JEVIL fight, from obj_jokerbattleevent (room_cc_joker):
// - before: the party walks in, JEVIL greets the "visitors", his scythes fall between them, Susie
//   squares up, "LET THE GAMES BEGIN!!" and the battle starts where they stand. A retry plays the
//   quick version (global.tempflag[4], set when obj_joker is created).
// - after: JEVIL's closing words (beaten or tired out), his metamorphosis into the ShadowCrystal,
//   then the DEVILSKNIFE (beaten) or the JEVILSTAIL (pacified), and the fade out.
// Plus obj_dialoguer, the dark-world text box these scenes talk in.
import {
  G, global, Instance, defineObject, defineScript, S, instance_create, instance_destroy, instance_exists,
  instancesOf, draw_set_color, draw_set_alpha, draw_rectangle, L,
} from '../runtime/gm.js?v=20261114002509';
import { snd_play, snd_loop, snd_stop, snd_free_all, snd_init, mus_loop_ext, mus_stop } from '../runtime/audio.js?v=20261114002509';
import { startBattle } from '../battle/setup.js?v=20261114002509';
import { gotoRoom, scr_darkbox } from '../screens/common.js?v=20261114002509';
import { first } from './common.js?v=20261114002509';

const E = n => L('obj_jokerbattleevent_slash_Step_0_gml_' + n + '_0');
const subst = (s, v) => String(s).split('~1').join(String(v));
// scr_ralface / scr_susface / scr_noface: one-line messages that switch the speaker's face.
const ralface = (n, e) => { global.msg[n] = subst(L('scr_ralface_slash_scr_ralface_gml_1_0'), e); };
const susface = (n, e) => { global.msg[n] = subst(L('scr_susface_slash_scr_susface_gml_1_0'), e); };
const noface = n => { global.msg[n] = L('scr_noface_slash_scr_noface_gml_1_0'); };
const clearMsg = () => { global.msg = new Array(100).fill('%%'); };

const scr_depth = inst => { inst.depth = 100000 - (inst.y * 10 + inst.sprite_height * 10); };
const halt = inst => { inst.image_index = 0; inst.image_speed = 0; inst.speed = 0; };
const afterimage = inst => { const a = S.scr_afterimage(inst); a.image_alpha = 0.5; return a; };

// ---------------------------------------------------------------- obj_dialoguer

class Dialoguer extends Instance {
  create() {
    this.depth = -500;
    this.active = 0;
    this.side = 1; // nobody walks below the text box in this room
    this.writer = null;
    this.cur_jewel = 0;
    this.alarm[0] = 1;
  }
  alarm0() {
    this.active = 1;
    const xx = Math.round(38 + G.camX), yy = Math.round(40 + G.camY);
    const w = instance_create(xx + 20, this.side === 0 ? yy - 10 : yy + 300, 'obj_writer');
    w.depth = this.depth - 1;
    w.dialoguer = 1;
    w.facer = 1;
    const face = instance_create(w.x + 16, w.y + 10, 'obj_face');
    face.depth = this.depth - 2;
    if (global.fc !== 0 && w.originalcharline === 33) w.charline = 26;
    this.writer = w;
  }
  draw() {
    if (this.active !== 1) return;
    const x = G.camX, y = G.camY;
    draw_set_color(0);
    if (this.side === 0) {
      draw_rectangle(x + 38, y + 16, x + 602, y + 154, false);
      scr_darkbox(this, x + 24, y + 2, x + 616, y + 168);
    } else {
      draw_rectangle(x + 38, y + 326, x + 602, y + 464, false);
      scr_darkbox(this, x + 24, y + 312, x + 616, y + 478);
    }
    if (!this.writer || !this.writer.alive) instance_destroy(this);
  }
}
defineObject('obj_dialoguer', Dialoguer);
const d_ex = () => instance_exists('obj_dialoguer');
const talk = () => instance_create(0, 0, 'obj_dialoguer');

// ---------------------------------------------------------------- before the fight

class JokerBattleEvent extends Instance {
  create() {
    this.quick = global.tempflag[4] === 1 ? 1 : 0;
    Object.assign(this, { con: 1, image_xscale: 2, image_yscale: 2, image_speed: 0, bulcon: 0, sprite_index: 'spr_joker_main' });
  }
  alarm4() { this.con += 1; }
  step() {
    const g = global;
    if (this.con === 1) {
      S.scr_encountersetup(25);
      this.x = g.monstermakex[0];
      this.y = g.monstermakey[0] + 100;
      this.c = [0, 1, 2].map(i => {
        const m = S.scr_dark_marker(g.heromakex[i] - 100, g.heromakey[i], 'spr_krisr_dark');
        scr_depth(m);
        m.hspeed = 2;
        m.image_speed = 0.2;
        if (this.quick === 1) {
          m.x += 1;
          scr_depth(m);
          m.hspeed = 5;
          m.image_speed = 0.334;
        }
        return m;
      });
      [this.k, this.s, this.r] = this.c;
      this.s.sprite_index = 'spr_susier_dark';
      this.r.sprite_index = 'spr_ralseir';
      this.con = 2;
      this.alarm[4] = this.quick === 1 ? 33 : 83;
    }
    if (this.con === 2) g.interact = 1;
    if (this.con === 3) {
      for (const m of this.c) halt(m);
      this.con = 4;
      this.alarm[4] = 20;
      if (this.quick === 1) {
        this.con = 6;
        this.alarm[4] = -1;
      }
    }
    if (this.con === 5) {
      snd_play('snd_joker_laugh1');
      g.typer = 35;
      g.fc = 0;
      clearMsg();
      g.msg[0] = E(59);
      g.msg[1] = E(60);
      ralface(2, 0);
      g.msg[3] = E(62);
      noface(4);
      g.msg[5] = E(64);
      talk();
      this.con = 6;
    }
    if (this.con === 6 && !d_ex()) {
      this.image_speed = 0.5;
      snd_play('snd_joker_laugh0');
      this.con = 9;
      this.alarm[4] = 10;
    }
    if (this.con === 10) {
      snd_play('snd_rudebuster_swing');
      this.bulcon = 1;
      this.smax = 2;
      this.con = 11;
      this.alarm[4] = 10;
    }
    if (this.bulcon === 1) {
      // Two of his scythes drop between the party, spinning.
      this.sbul = [];
      for (let i = 0; i < this.smax; i++) {
        const b = S.scr_dark_marker(this.s.x + 70, -i * 100 - 40, 'spr_joker_scythebody');
        b.vspeed = 24;
        b.image_angle = Math.random() * 360;
        this.sbul.push(b);
      }
      this.bulcon = 2;
    }
    if (this.bulcon === 2) {
      let below = 0;
      for (const b of this.sbul) {
        b.image_angle += 24;
        afterimage(b);
        if (b.y >= G.camY + 580) below += 1;
      }
      if (below >= this.smax) this.bulcon = 3;
    }
    if (this.con === 12) {
      this.s.sprite_index = 'spr_susie_shock_r';
      this.r.sprite_index = 'spr_ralsei_shock_overworld';
      for (const m of this.c) {
        m.hspeed = -10;
        m.friction = 1;
      }
      this.con = 13;
      this.alarm[4] = 45;
      if (this.quick === 1) {
        this.con = 22;
        this.alarm[4] = 40;
        this.stopMusic();
      }
    }
    if (this.con === 14) {
      this.image_speed = 0;
      this.s.sprite_index = 'spr_susier_dark_unhappy';
      this.r.sprite_index = 'spr_ralseir';
      g.fe = 0;
      g.typer = 35;
      g.fc = 0;
      clearMsg();
      g.msg[0] = E(140);
      susface(1, 0);
      g.msg[2] = E(142);
      g.msg[3] = E(143);
      talk();
      this.con = 15.1;
    }
    if (this.con === 15.1 && !d_ex()) {
      this.s.sprite_index = 'spr_susieb_attack';
      this.r.sprite_index = 'spr_ralseib_attack';
      this.k.sprite_index = 'spr_krisb_attack';
      for (const m of this.c) {
        m.image_index = 0;
        m.image_speed = 0.25;
      }
      this.con = 16;
      this.alarm[4] = 60;
      snd_play('snd_laz_c');
    }
    if (this.con === 16) {
      if (this.s.image_index >= 5) this.s.image_speed = 0;
      if (this.k.image_index >= 6) this.k.image_speed = 0;
      if (this.r.image_index >= 5) this.r.image_speed = 0;
    }
    if (this.con === 17) {
      // Susie again (her face and voice carry over from the last box).
      g.fe = 3;
      clearMsg();
      g.msg[0] = E(175);
      talk();
      this.con = 18;
    }
    if (this.con === 18 && !d_ex()) {
      this.jlaugh = snd_loop('snd_joker_laugh0');
      this.image_speed = 0.25;
      this.con = 19;
      this.alarm[4] = 15;
    }
    if (this.con === 20) {
      g.typer = 35;
      g.fc = 0;
      clearMsg();
      g.msg[0] = E(192);
      g.msg[1] = E(193);
      this.con = 21;
      talk();
    }
    if (this.con === 21 && !d_ex()) {
      this.stopMusic();
      snd_stop(this.jlaugh);
      this.con = 22;
      this.alarm[4] = 1;
    }
    if (this.con === 23) {
      this.con = 25;
      const at = m => [m.x, m.y];
      startBattle({ intro: true, introStart: [at(this.k), at(this.s), at(this.r)], jevilFly: [this.x, this.y] });
    }
  }
  stopMusic() {
    snd_free_all();
    mus_stop(global.currentsong?.[1]);
  }
}
defineObject('obj_jokerbattleevent', JokerBattleEvent);

// con 23-25: as the battle begins, the JEVIL of the scene flies up out of view (bulcon 10); the
// background comes on once the battle controller exists.
class JevilFly extends Instance {
  create() {
    Object.assign(this, { sprite_index: 'spr_joker_main', image_xscale: 2, image_yscale: 2, image_speed: 0.5, bultimer: 0, bulcon: 10 });
  }
  step() {
    if (this.bulcon === 10) {
      this.bultimer += 1;
      afterimage(this);
      this.y -= 16;
      this.x += 5;
      this.bultimer += 1;
      if (this.bultimer >= 10) this.bulcon = 11;
    }
    if (instance_exists('obj_battlecontroller')) {
      this.visible = false;
      const bg = first('obj_jokerbg_triangle_real');
      if (bg) bg.on = global.flag[8] === 1 ? 0 : 1;
      instance_destroy(this);
    }
  }
}
defineObject('obj_sim_jevil_fly', JevilFly);

// BEGIN (and every retry): the scene, or the fight right away when SCENES is off.
export function startJevilFight() {
  if (G.settings?.scenes === false) return startBattle({ intro: G.settings?.intro !== false });
  gotoRoom();
  const tempflag = global.tempflag;
  S.init_battle_globals();
  global.tempflag = tempflag;
  global.fighting = 0;
  // The prison's music carries on into the room (obj_event_room: prejoker.ogg at 0.85).
  global.currentsong = [snd_init('prejoker.ogg'), null];
  global.currentsong[1] = mus_loop_ext(global.currentsong[0], 1, 0.85);
  instance_create(0, 0, 'obj_jokerbg_triangle_real').on = 0;
  instance_create(440, 160, 'obj_jokerbattleevent');
}
defineScript('startJevilFight', startJevilFight);

// ---------------------------------------------------------------- after the fight

class JokerBattleEventAfter extends Instance {
  create() {
    this.con = 30;
    this.kind = 'fight';
    this.fade = 0;
    this.depth = -1000;
  }
  alarm4() { this.con += 1; }
  step() {
    const g = global;
    if (this.con === 30) {
      // Susie's follower sprite turns unhappy; the prison's music, slowed down.
      for (const m of instancesOf('obj_marker')) if (m.sprite_index === 'spr_susier_dark') m.sprite_index = 'spr_susier_dark_unhappy';
      g.currentsong = [snd_init('prejoker.ogg'), null];
      g.currentsong[1] = mus_loop_ext(g.currentsong[0], 0.7, 0.75);
      for (const b of instancesOf('obj_joker_body')) Object.assign(b, { fade: 1, dancelv: 0, floatsinerspeed: 1, condition: 0 });
      g.typer = 35;
      g.fc = 0;
      clearMsg();
      const lines = this.kind === 'spare' ? [307, 308, 309, 310, 311, 312, 313, 314, 315, 316] : [294, 295, 296, 297, 298, 299, 300, 301, 302, 303];
      lines.forEach((n, i) => { g.msg[i] = E(n); });
      this.con = 31;
      talk();
    }
    if (this.con === 31 && !d_ex()) {
      for (const b of instancesOf('obj_joker_body')) { b.condition = 5; b.timer = 0; }
      this.con = 32;
      this.alarm[4] = 60;
    }
    if (this.con === 33) {
      this.con = 34;
      snd_play('snd_joker_laugh0');
      g.typer = 6;
      g.fc = 0;
      clearMsg();
      g.msg[0] = E(362);
      talk();
    }
    if (this.con === 34 && !d_ex()) {
      clearMsg();
      g.msg[0] = this.kind === 'spare' ? E(357) : E(344);
      this.con = 35;
      talk();
    }
    if (this.con === 35 && !d_ex()) {
      this.fade = 0.02;
      this.con = 36;
      this.alarm[4] = 60;
    }
    if (this.con === 37) {
      this.con = 38;
      S.startEnding(this.kind, { afterScene: true });
    }
  }
  // obj_fadeout (fadespeed 0.02).
  draw() {
    if (!this.fade) return;
    this.image_alpha = Math.min(1, (this.alphaNow ?? 0) + this.fade);
    this.alphaNow = this.image_alpha;
    draw_set_alpha(this.image_alpha);
    draw_set_color(0);
    draw_rectangle(G.camX - 10, G.camY - 10, G.camX + 650, G.camY + 490, false);
    draw_set_alpha(1);
  }
}
defineObject('obj_jokerbattleevent_after', JokerBattleEventAfter);

// Called instead of the end screen when the fight is won: the scene plays in the room as it is.
export function startJevilAfterScene(kind) {
  for (const o of instancesOf(['obj_battlecontroller', 'obj_endbattle'])) instance_destroy(o, false);
  mus_stop(global.batmusic?.[1]);
  mus_stop(global.batmusic?.[0]);
  instance_create(0, 0, 'obj_jokerbattleevent_after').kind = kind;
}
defineScript('startJevilAfterScene', startJevilAfterScene);
