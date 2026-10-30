// MAGIC / ITEM / SPARE resolution: obj_spellphase, scr_spelltext, scr_spell and the spell effects.
import {
  global, Instance, defineObject, defineScript, S, instance_create, instance_destroy, instance_exists,
  instance_find, withObj, event_user, random, ceil, merge_color, point_direction, point_distance,
  angle_difference, button1_p, draw_self, draw_sprite_ext, d3d_set_fog, L,
} from '../runtime/gm.js';
import { snd_play, snd_stop } from '../runtime/audio.js';
import { withInst, subst } from './common.js';

const g = global;
const T = n => L('scr_spelltext_slash_scr_spelltext_gml_' + n + '_0');

// ---------------------------------------------------------------- spell phase

class SpellPhase extends Instance {
  create() {
    this.spelltimer = 0;
    this.spellmax = 40;
    this.spelltotal = 0;
    this.char = 0;
    this.castyet = 0;
    this.re_castyet = 0;
    this.active = 0;
    this.spellwriter = null;
    this.using = [0, 0, 0];
    this.gotspell = [0, 0, 0];
    this.gotitem = [0, 0, 0];
    this.alarm[0] = 5;
  }
  alarm0() {
    for (let xyz = 0; xyz < 3; xyz++) {
      this.using[xyz] = 0;
      this.gotspell[xyz] = 0;
      this.gotitem[xyz] = 0;
      for (const [action, state, got] of [[2, 2, this.gotspell], [4, 4, this.gotitem]]) {
        if (g.charaction[xyz] == action) {
          this.spelltotal += 1;
          this.using[xyz] = 1;
          got[xyz] = 1;
          if (this.castyet == 0) {
            withInst(g.charinstance[xyz], h => { h.state = state; h.attacktimer = 0; });
            this.castyet = 1;
            this.char = xyz + 1;
            S.scr_spelltext(this, g.charspecial[xyz], xyz);
            this.spellwriter = S.scr_battletext_default(this);
          }
        }
      }
    }
    this.active = 1;
    g.spelldelay = 90;
  }
  step() {
    if (this.active != 1) return;
    this.spelltimer += 1;
    if (this.spelltimer >= g.spelldelay && !instance_exists(this.spellwriter)) {
      if (this.char >= 3 || this.spelltotal == 1) {
        S.scr_attackphase();
        withInst(this.spellwriter, w => instance_destroy(w));
        instance_destroy(this);
      } else if (S.scr_monsterpop() > 0) {
        const c = this.char;
        for (const [got, state] of [[this.gotitem, 4], [this.gotspell, 2]]) {
          if (got[c] == 1) {
            this.re_castyet = 1;
            withInst(g.charinstance[c], h => { h.state = state; });
            withInst(this.spellwriter, w => instance_destroy(w));
            S.scr_spelltext(this, g.charspecial[c], c);
            this.spellwriter = S.scr_battletext_default(this);
          }
        }
        g.spelldelay = 90;
        if (this.re_castyet == 0) g.spelldelay = 1;
        this.char += 1;
        for (let k = 0; k < 2; k++) {
          if (this.char < 3 && this.using[this.char] == 0) this.char += 1;
        }
        this.spelltimer = 0;
        this.re_castyet = 0;
      } else {
        S.scr_attackphase();
        withInst(this.spellwriter, w => instance_destroy(w));
        instance_destroy(this);
      }
    }
  }
}
defineObject('obj_spellphase', SpellPhase);

// ---------------------------------------------------------------- spell text

const ITEMTEXT = { 201: 78, 202: 82, 205: 179, 206: 183, 207: 187, 208: 191, 209: 194, 210: 197, 211: 200, 212: 203, 213: 206, 214: 209, 215: 212 };

// scr_spelltext(spell, caster): caller scope (spell, caster, star); writes global.msg.
defineScript('scr_spelltext', (inst, spell, caster) => {
  inst.spell = spell;
  inst.caster = caster;
  inst.star = g.chartarget[caster];
  const name = g.charname[g.char[caster]];
  switch (spell) {
    case 1: g.msg[0] = subst(T(14), name); break;
    case 2: g.msg[0] = subst(T(18), name); break;
    case 3:
      g.msg[0] = subst(T(23), name);
      S.scr_retarget_spell(inst);
      if (g.monster[inst.star] == 1 && g.monsterstatus[inst.star] != 1) {
        g.msg[0] = subst(T(33), name);
        if (g.mercymod[inst.star] >= 100) g.msg[0] = subst(T(36), name);
      }
      break;
    case 4: g.msg[0] = subst(T(43), name); break;
    case 5: g.msg[0] = subst(T(47), name); break;
    case 6: g.msg[0] = subst(T(51), name); break;
    case 100: {
      inst.cancelattack = 0;
      g.msg[0] = subst(T(58), name, g.monstername[inst.star]);
      S.scr_retarget_spell(inst);
      const mn = g.monstername[inst.star];
      if (g.mercymod[inst.star] >= 100) g.msg[0] = subst(T(62), name, mn);
      else {
        g.msg[0] = subst(T(66), name, mn);
        if (g.monsterstatus[inst.star] == 1) {
          g.msg[0] = subst(T(69), name, mn);
          g.msg[1] = T(70);
        }
      }
      if (inst.cancelattack == 1) g.msg[0] = subst(T(73), name);
      break;
    }
    case 203:
      g.msg[0] = subst(T(86), name);
      g.msg[1] = T(87);
      break;
    case 204:
      g.msg[0] = subst(T(122), name);
      g.msg[1] = T(123);
      break;
    default:
      if (ITEMTEXT[spell]) g.msg[0] = subst(T(ITEMTEXT[spell]), name);
      break;
  }
});

// ---------------------------------------------------------------- spell effects

// scr_dmgwriter_selfchar(): hero scope.
defineScript('scr_dmgwriter_selfchar', (h) => instance_create(h.x, h.y + h.myheight - 24 - h.tu * 20, 'obj_dmgwriter'));

function healFx(h, amount) {
  const ha = instance_create(h.x, h.y, 'obj_healanim');
  ha.target = h;
  const dmgwr = S.scr_dmgwriter_selfchar(h);
  dmgwr.delay = 8;
  dmgwr.type = 3;
  if (amount !== undefined) dmgwr.damage = amount;
  if (g.hp[g.char[h.myself]] >= g.maxhp[g.char[h.myself]]) dmgwr.specialmessage = 3;
  h.tu += 1;
  return dmgwr;
}

// scr_healitemspell(amount): caller scope (star).
defineScript('scr_healitemspell', (inst, amount) => {
  S.scr_heal(inst.star, amount);
  withInst(g.charinstance[inst.star], h => healFx(h, amount));
  g.spelldelay = 15;
});

defineScript('scr_healallitemspell', (inst, amount) => {
  S.scr_healall(amount);
  for (let i = 0; i < 3; i++) withInst(g.charinstance[i], h => healFx(h, amount));
  g.spelldelay = 20;
});

// scr_spell(spell, caster): hero scope (Alarm_4).
defineScript('scr_spell', (inst, spell, caster) => {
  inst.spell = spell;
  inst.caster = caster;
  inst.star = g.chartarget[caster];
  g.spelldelay = 10;
  const star = () => inst.star;
  switch (spell) {
    case 1:
      inst.cancelattack = 0;
      if (g.monster[star()] == 0) S.scr_retarget_spell(inst);
      if (inst.cancelattack == 0) {
        let damage = ceil(g.battleat[caster] * 10 - g.monsterdf[star()] * 3);
        if (g.automiss[star()] == 1) damage = 0;
        S.scr_damage_enemy(inst, star(), damage);
        const attack = instance_create(g.monsterx[star()] + random(6), g.monstery[star()] + random(6), 'obj_basicattack');
        attack.sprite_index = 'spr_attack_mash1';
        if (inst.dm) inst.dm.delay = 8;
      }
      g.spelldelay = 30;
      break;
    case 2: {
      const healnum = g.battlemag[caster] * 5;
      S.scr_heal(star(), healnum);
      withInst(g.charinstance[star()], h => {
        h.healnum = healnum;
        healFx(h, healnum);
      });
      g.spelldelay = 15;
      break;
    }
    case 3:
      if (g.monster[star()] == 0) S.scr_retarget_spell(inst);
      if (g.monster[star()] == 1) {
        if (g.monsterstatus[star()] == 1) {
          withInst(g.monsterinstance[star()], m => {
            if (g.monstertype[m.myself] != 19 && g.monstertype[m.myself] != 3) {
              g.flag[51 + m.myself] = 3;
              event_user(m, 10);
              S.scr_monsterdefeat(m);
            } else {
              m.pacifycon = 1;
              g.spelldelay = 999;
            }
          });
        } else {
          const p = instance_create(0, 0, 'obj_pacifyspell');
          p.target = g.monsterinstance[star()];
          p.fail = 1;
        }
      }
      g.spelldelay = 20;
      break;
    case 4:
    case 5: {
      inst.cancelattack = 0;
      g.spelldelay = 30;
      if (g.monster[star()] == 0) S.scr_retarget_spell(inst);
      if (inst.cancelattack == 0) {
        g.spelldelay = 70;
        let damage = spell == 4
          ? ceil(g.battlemag[caster] * 5 + g.battleat[caster] * 11 - g.monsterdf[star()] * 3)
          : ceil(g.battlemag[caster] * 6 + g.battleat[caster] * 13 - g.monsterdf[star()] * 6);
        if (g.automiss[star()] == 1) damage = 0;
        const sus = instance_find('obj_herosusie', 0);
        const attack = instance_create(sus ? sus.x : inst.x, sus ? sus.y : inst.y, 'obj_rudebuster_anim');
        attack.damage = damage;
        attack.star = star();
        attack.caster = caster;
        attack.target = g.monsterinstance[star()];
        if (spell == 5) attack.red = 1;
      }
      break;
    }
    case 6: {
      const healnum = g.battlemag[caster] * 4;
      for (let i = 0; i < 3; i++) {
        S.scr_heal(i, healnum);
        withInst(g.charinstance[i], h => {
          h.healnum = healnum;
          healFx(h, healnum);
        });
      }
      g.spelldelay = 15;
      break;
    }
    case 100:
      if (g.monster[star()] == 0) S.scr_retarget_spell(inst);
      if (g.monster[star()] == 1) {
        if (g.mercymod[star()] >= 100) {
          if (g.monstertype[star()] != 3) {
            withInst(g.monsterinstance[star()], m => {
              g.flag[51 + m.myself] = 2;
              event_user(m, 10);
              S.scr_monsterdefeat(m);
            });
          } else withInst(g.monsterinstance[star()], m => { m.sparecon = 1; });
        } else {
          S.scr_mercyadd(star(), g.sparepoint[star()]);
          const p = instance_create(0, 0, 'obj_pacifyspell');
          p.target = g.monsterinstance[star()];
          p.fail = 1;
          p.flashcolor = 0xffff00;
        }
      }
      g.spelldelay = 0;
      break;
    case 201: S.scr_healitemspell(inst, 40); break;
    case 202: {
      const c = g.char[star()];
      let reviveamt = ceil(g.maxhp[c] / 2);
      if (g.hp[c] <= 0) reviveamt = ceil(g.maxhp[c]) + Math.abs(g.hp[c]);
      S.scr_healitemspell(inst, reviveamt);
      break;
    }
    case 205: S.scr_healitemspell(inst, 20); break;
    case 206: S.scr_healallitemspell(inst, 160); break;
    case 207: S.scr_healallitemspell(inst, 80); break;
    case 208: S.scr_healitemspell(inst, 70); break;
    case 209: S.scr_healitemspell(inst, 50); break;
    case 210: S.scr_healitemspell(inst, 4); break;
    case 211: S.scr_healallitemspell(inst, 30); break;
    case 212: {
      const c = g.char[star()];
      S.scr_healitemspell(inst, c == 1 ? 10 : c == 2 ? 90 : 60);
      break;
    }
    case 213: {
      const c = g.char[star()];
      S.scr_healitemspell(inst, c == 1 ? 80 : 30);
      break;
    }
    case 214: S.scr_healitemspell(inst, 500); break;
    case 215: S.scr_healitemspell(inst, 60); break;
    default: break;
  }
});

defineScript('scr_mercyadd', (m, amt) => {
  g.mercymod[m] += amt;
  if (g.mercymod[m] < 0) g.mercymod[m] = 0;
});

// ---------------------------------------------------------------- Rude Buster

class RudeBusterAnim extends Instance {
  create() {
    this.sprite_index = 'spr_susie_rudebuster';
    this.t = 0;
    this.image_speed = 0;
    this.target = null;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.damage = 1;
    this.caster = 0;
    this.star = 0;
    const sus = instance_find('obj_herosusie', 0);
    if (sus) this.depth = sus.depth;
    withObj('obj_herosusie', h => { h.visible = false; });
    this.red = 0;
  }
  step() {
    this.image_index = this.t / 2;
    if (this.t >= 28) {
      withObj('obj_herosusie', h => { h.visible = true; });
      instance_destroy(this);
    }
    if (instance_exists(this.target) && this.t == 10) {
      snd_play('snd_rudebuster_swing');
      const blast = instance_create(this.x + 40, this.y + 30, 'obj_rudebuster_bolt');
      blast.caster = this.caster;
      blast.target = this.target;
      blast.damage = this.damage;
      blast.star = this.star;
      if (this.red == 1) blast.red = 1;
    }
    this.t += 1;
  }
}
defineObject('obj_rudebuster_anim', RudeBusterAnim);

class RudeBusterBolt extends Instance {
  create() {
    this.depth = -10;
    this.sprite_index = 'spr_rudebuster_beam';
    this.target = null;
    this.damage = 1;
    this.star = 0;
    this.caster = 0;
    this.image_alpha = 0;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.image_speed = 1;
    this.a = 0;
    this.cx = 0;
    this.cy = 0;
    this.t = 0;
    this.explode = 0;
    this.maxaft = 0;
    this.aft = [];
    this.burst = [];
    this.bolt_timer = 0;
    this.chosen_bolt = 0;
    this.final_bolt = 0;
    this.red = 0;
  }
  step() {
    if (this.image_alpha < 1) this.image_alpha += 0.25;
    else this.image_alpha = 1;
    if (this.t == 0) {
      const m = this.target ? this.target.myself : this.star;
      this.cx = g.monsterx[m];
      this.cy = g.monstery[m];
      this.direction = point_direction(this.x, this.y, this.cx, this.cy) - 20;
      this.speed = 24;
      this.friction = -1.5;
      this.image_angle = this.direction;
      if (this.red == 1) {
        this.sprite_index = 'spr_rudebuster_beam_red';
        this.image_xscale = 2.5;
        this.image_yscale = 2.5;
      }
    }
    if (this.t >= 1 && this.explode == 0) {
      this.bolt_timer += 1;
      if (button1_p() && this.bolt_timer >= 4 && this.chosen_bolt == 0) this.chosen_bolt = this.bolt_timer;
      const dir = point_direction(this.x, this.y, this.cx, this.cy);
      this.direction = this.direction + angle_difference(dir, this.direction) / 4;
      this.image_angle = this.direction;
      if (point_distance(this.x, this.y, this.cx, this.cy) <= 40) {
        this.final_bolt = this.chosen_bolt;
        this.visible = false;
        this.explode = 1;
        this.t = 1;
      }
    }
    if (this.explode == 1) {
      if (this.t == 1) {
        if (this.chosen_bolt > 0) {
          const d = this.final_bolt - this.chosen_bolt;
          const bonus = { 0: 30, 1: 28, 2: 22, 3: 20, 4: 13, 5: 11, 6: 10 }[d];
          if (bonus) this.damage += bonus;
          if (Math.abs(this.chosen_bolt - this.final_bolt) <= 2) snd_play('snd_scytheburst');
        }
        if (this.red == 1) this.damage += 90;
        g.hittarget[this.star] = 0;
        S.scr_damage_enemy(this, this.star, this.damage);
        if (g.monstertype[0] != 20) {
          withInst(this.target, tg => {
            const of = S.scr_oflash(tg);
            if (this.red == 1) of.flashcolor = 0xff0000;
          });
        }
        snd_play('snd_rudebuster_hit');
        for (let i = 0; i < 8; i++) {
          const b = S.scr_afterimage(this);
          b.image_speed = 0.5;
          b.x = this.cx;
          b.y = this.cy;
          b.image_angle = 45 + i * 90;
          b.direction = b.image_angle;
          b.speed = 25;
          b.depth = this.depth - 10;
          this.burst[i] = b;
        }
      }
      if (this.t >= 2) {
        for (let i = 0; i < 8; i++) {
          withInst(this.burst[i], b => {
            b.speed = b.speed * (i < 4 ? 0.75 : 0.8);
            b.image_xscale *= 0.8;
          });
        }
      }
      if (this.t >= 18) instance_destroy(this);
    }
    if (this.explode == 0) {
      const a = S.scr_afterimage(this);
      a.image_yscale = 1.8;
      a.image_angle = this.image_angle;
      a.image_index = 4;
      a.image_speed = 0.5;
      a.image_alpha = this.image_alpha - 0.2;
      this.aft[this.maxaft] = a;
      this.maxaft += 1;
    }
    for (let i = 0; i < this.maxaft; i++) {
      withInst(this.aft[i], a => {
        a.image_yscale -= 0.1;
        if (a.image_yscale <= 0.1) instance_destroy(a);
      });
      if (this.explode == 1) {
        withInst(this.aft[i], a => {
          a.image_alpha -= 0.07;
          a.image_yscale *= 0.9;
          if (a.image_yscale <= 0.1) instance_destroy(a);
        });
      }
    }
    this.a += 1;
    this.t += 1;
  }
  draw() { draw_self(this); }
}
defineObject('obj_rudebuster_bolt', RudeBusterBolt);

// ---------------------------------------------------------------- heal sparkles

class HealAnim extends Instance {
  create() {
    this.sprite_index = 'spr_sparestar_anim';
    this.visible = true;
    this.target = null;
    this.starcount = 0;
    this.star = [];
    this.t = 0;
    this.particlesprite = 'spr_sparestar_anim';
    this.particlecolor = 0x00ff00;
  }
  step() {
    this.t += 1;
    if (instance_exists(this.target)) {
      const tg = this.target;
      if (this.t == 1) {
        this.x = tg.x;
        this.y = tg.y;
        this.image_xscale = tg.image_xscale;
        this.image_yscale = tg.image_yscale;
        this.sprite_index = tg.sprite_index;
        this.sw = this.sprite_width;
        this.sh = this.sprite_height;
        if (['obj_herokris', 'obj_herosusie', 'obj_heroralsei'].includes(tg.object_index)) {
          this.sw = tg.mywidth;
          this.sh = tg.myheight;
        }
        S.scr_oflash(tg);
      }
      if (this.t >= 1 && this.t <= 5) {
        for (let i = 0; i < 2; i++) {
          const s = instance_create(this.x + random(this.sw), this.y + random(this.sh), 'obj_marker');
          s.image_angle = random(360);
          s.depth = -10;
          s.image_xscale = 2;
          s.image_yscale = 2;
          s.image_alpha = 2;
          s.image_speed = 0.25;
          s.hspeed = 2 - random(2);
          s.vspeed = -3 - random(2);
          s.friction = 0.2;
          s.sprite_index = this.particlesprite;
          s.image_blend = this.particlecolor;
          this.star[this.starcount++] = s;
        }
      }
      if (this.t >= 5 && this.t <= 30) {
        for (let i = 0; i < this.starcount; i++) {
          withInst(this.star[i], s => {
            s.image_angle -= 10;
            s.image_alpha -= 0.1;
            if (s.image_alpha <= 0) instance_destroy(s);
          });
        }
        if (this.t >= 30) instance_destroy(this);
      }
    } else {
      for (let i = 0; i < this.starcount; i++) withInst(this.star[i], s => instance_destroy(s));
      instance_destroy(this);
    }
  }
  draw() {}
}
defineObject('obj_healanim', HealAnim);

// ---------------------------------------------------------------- Pacify / failed SPARE flash

class PacifySpell extends Instance {
  create() {
    this.target = null;
    this.con = 1;
    this.siner = 0;
    this.alarm[4] = 50;
    this.fail = 0;
    this.flashcolor = 0x0000ff;
  }
  alarm4() { this.con += 1; }
  step() {
    if (!instance_exists(this.target)) { this.con = 99; instance_destroy(this); return; }
    const tg = this.target;
    if (this.con == 1) {
      if (this.fail == 0) {
        this.siner += 1;
        tg.image_blend = merge_color(tg.image_blend, this.flashcolor, 0.1);
        if (this.siner % 2 == 0) {
          const ai = instance_create(tg.x + random(tg.sprite_width), tg.y + tg.sprite_height - 20, 'obj_afterimage');
          ai.gravity = 0.5;
          ai.sprite_index = 'spr_savepoint';
          ai.image_speed = 0.2;
        }
        tg.x += this.siner / 4 + Math.sin(this.siner / 8) * 10;
        tg.y -= this.siner / 5;
      } else {
        this.siner = 0;
        this.con = 5;
      }
    }
    if (this.con == 2) {
      instance_destroy(tg);
      instance_destroy(this);
      return;
    }
    if (this.con == 5) { this.con = 6; this.alarm[4] = 8; }
    if (this.con == 6) tg.image_blend = merge_color(tg.image_blend, this.flashcolor, 0.12);
    if (this.con == 7) { this.con = 8; this.alarm[4] = 8; }
    if (this.con == 8) tg.image_blend = merge_color(tg.image_blend, 0xffffff, 0.16);
    if (this.con == 9) {
      tg.image_blend = 0xffffff;
      instance_destroy(this);
    }
  }
  draw() {}
}
defineObject('obj_pacifyspell', PacifySpell);

// ---------------------------------------------------------------- spare animation

// scr_spareanim(): caller scope (sparedsprite, scale).
defineScript('scr_spareanim', (src) => {
  const a = instance_create(src.x, src.y, 'obj_spareanim');
  a.sprite_index = src.sparedsprite ?? src.sprite_index;
  a.image_index = 0;
  a.image_xscale = src.image_xscale;
  a.image_yscale = src.image_yscale;
  return a;
});

class SpareAnim extends Instance {
  create() {
    this.t = 0;
    this.image_speed = 0;
    this.starcount = 0;
    this.star = [];
    this.afterimage = 0;
    this.tone = 0;
    this.neotone = 0;
    snd_stop('snd_spare');
    snd_play('snd_spare');
  }
  draw() {
    const t = this.t, spr = this.sprite_index;
    if (spr && t >= 6 && t <= 26) {
      this.afterimage += 1;
      d3d_set_fog(true, 0xffffff, 0, 1);
      draw_sprite_ext(spr, this.image_index, this.x + this.afterimage * 4, this.y, this.image_xscale, this.image_yscale, 0, this.image_blend, 0.7 - this.afterimage / 25);
      draw_sprite_ext(spr, this.image_index, this.x + this.afterimage * 8, this.y, this.image_xscale, this.image_yscale, 0, this.image_blend, 0.4 - this.afterimage / 30);
      d3d_set_fog(false, 0, 0, 0);
    }
    if (spr && t < 6) {
      if (t < 5) draw_sprite_ext(spr, this.image_index, this.x, this.y, this.image_xscale, this.image_yscale, 0, this.image_blend, 1 - this.neotone / 4);
      d3d_set_fog(true, 0xffffff, 0, 1);
      const maxwhite = Math.min(1, t / 5);
      draw_sprite_ext(spr, this.image_index, this.x, this.y, this.image_xscale, this.image_yscale, 0, this.image_blend, maxwhite - this.tone / 5);
      d3d_set_fog(false, 0, 0, 0);
    }
    if (t >= 1 && t <= 5) {
      for (let i = 0; i < 2; i++) {
        const s = instance_create(this.x + random(this.sprite_width), this.y + random(this.sprite_height), 'obj_marker');
        s.image_xscale = 2;
        s.image_yscale = 2;
        s.sprite_index = 'spr_sparestar_anim';
        s.image_alpha = 2;
        s.image_speed = 0.25;
        s.hspeed = -3;
        s.gravity = 0.5;
        s.gravity_direction = 0;
        this.star[this.starcount++] = s;
      }
    }
    if (t >= 5 && t <= 30) {
      for (let i = 0; i < this.starcount; i++) {
        withInst(this.star[i], s => {
          s.image_angle += 10;
          s.image_alpha -= 0.1;
          if (s.image_alpha <= 0) instance_destroy(s);
        });
      }
    }
    if (t >= 5 && t < 10) this.tone += 1;
    if (t >= 9) {
      this.neotone += 1;
      if (this.neotone >= 30) {
        for (let i = 0; i < this.starcount; i++) withInst(this.star[i], s => instance_destroy(s));
        instance_destroy(this);
      }
    }
    this.t += 1;
  }
}
defineObject('obj_spareanim', SpareAnim);
