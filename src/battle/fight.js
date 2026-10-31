// FIGHT: obj_attackpress (timing bars), bolts, hit sprites, damage numbers, scr_damage_enemy.
import {
  global, Instance, defineObject, defineScript, S, instance_create, instance_destroy, instance_exists,
  withObj, event_user, choose, random, round, merge_color, button1_p, button2_p, button3_p,
  draw_set_color, draw_set_alpha, draw_set_font, draw_set_halign, draw_get_color, draw_rectangle,
  draw_sprite, draw_sprite_ext, draw_text_transformed,
} from '../runtime/gm.js?v=20261031024711';
import { withInst, gmlString } from './common.js?v=20261031024711';

const g = global;

class AttackPress extends Instance {
  create() {
    this.depth = 1;
    this.sprite_index = 'spr_pressfront';
    this.image_speed = 0;
    this.active = 0;
    this.fastmode = 1;
    if (this.fastmode == 1) this.active = 1;
    this.goahead = 0;
    this.spelluse = 0;
    this.spelldelay = [10, 10, 10];
    this.maxdelay = 0;
    this.maxdelaytimer = 0;
    this.havechar = [0, 0, 0];
    this.charitem = [0, 0, 0];
    this.charspell = [0, 0, 0];
    for (let xyz = 0; xyz < 3; xyz++) {
      if (g.charaction[xyz] == 1) this.havechar[xyz] = 1;
      if (g.charaction[xyz] == 4 || g.charaction[xyz] == 2) {
        if (this.maxdelay == 0) this.maxdelay = 25;
        this.maxdelay += 15;
        if (xyz == 2 && this.spelluse == 1) this.spelldelay[2] = this.spelldelay[1] == 25 ? 45 : 25;
        if (xyz == 1 && this.spelluse == 1) this.spelldelay[1] = 25;
        this.spelluse = 1;
        if (g.charaction[xyz] == 4) this.charitem[xyz] = 1;
        else this.charspell[xyz] = 1;
      }
    }
    this.spelluse = 0;
    this.fade = 0;
    this.fadeamt = 0;
    this.fakefade = 0;
    this.bcolor = 0x000080;
    this.charcolor = [0x00ffff, 0xff00ff, 0x00ff00];
    this.target = 0;
    g.hittarget[0] = g.chartarget[0];
    g.hittarget[1] = g.chartarget[1];
    g.hittarget[2] = g.chartarget[2];
    this.boltcolor = [merge_color(0x00ffff, 0xffffff, 0.5), merge_color(0xff00ff, 0xffffff, 0.5), merge_color(0x00ff00, 0xffffff, 0.5)];
    this.imagetimer = 0;
    this.posttimer = 0;
    this.timermax = 50;
    const hc = this.havechar;
    if (hc[0] == 0 && hc[1] == 0 && hc[2] == 0) {
      this.timermax = 3;
      if (this.spelluse == 1 && this.fastmode == 1) this.timermax += this.maxdelay;
    }
    // boltorder is only used by the unused method 2; it still consumes the RNG.
    const bo = [choose(0, 1, 2), 0, 0];
    if (hc[1] == 0 && hc[2] == 0) bo[0] = 0;
    if (bo[0] == 2) bo[1] = choose(0, 1);
    if (bo[0] == 1) bo[1] = choose(0, 2);
    if (bo[0] == 0) bo[1] = choose(1, 2);
    if (hc[1] == 1 && hc[2] == 0) bo[0] = choose(0, 1);
    this.boltorder = bo;
    this.boltgap = 20;
    this.boltspeed = 8;
    this.boltx = 0;
    this.points = [0, 0, 0];
    this.pressbuffer = [0, 0, 0, 0];
    this.charbolt = [1, 1, 1];
    for (let i = 0; i < 3; i++) if (hc[i] == 0) this.charbolt[i] = 0;
    this.attacked = [0, 0, 0];
    this.bolttotal = this.charbolt[0] + this.charbolt[1] + this.charbolt[2];
    let boltxoff = 0;
    this.mymethod = 1;
    this.boltuse = [0, 0, 0];
    let lastbolt = -1;
    this.boltchar = [-1];
    this.boltalive = [];
    this.boltframe = [];
    this.boltred = [];
    let diff = 10;
    if (g.flag[13] == 0) diff += 2;
    for (let i = 0; i < this.bolttotal; i++) {
      this.boltalive[i] = 1;
      let c = choose(0, 1, 2);
      while (hc[c] == 0) c = choose(0, 1, 2);
      while (this.boltuse[c] >= this.charbolt[c]) {
        c = choose(0, 1, 2);
        while (hc[c] == 0) c = choose(0, 1, 2);
      }
      this.boltchar[i] = c;
      this.boltuse[c] += 1;
    }
    for (let i = 0; i < this.bolttotal; i++) {
      this.boltred[i] = 0;
      boltxoff += lastbolt;
      this.boltframe[i] = 30 + boltxoff;
      if (i < this.bolttotal - 1) {
        if (lastbolt != 0 && this.boltchar[i] != this.boltchar[i + 1]) {
          lastbolt = choose(0, diff, diff * 1.5);
          this.boltred[i] = 1;
        } else lastbolt = choose(diff, diff * 1.5);
      } else lastbolt = choose(diff, diff * 1.5);
    }
    this.haveauto = 0;
    this.autoed = 0;
    this.boltcount = [0, 0, 0];
  }

  draw() {
    const { x, y } = this;
    this.maxdelaytimer += 1;
    if (this.maxdelaytimer >= this.maxdelay) this.active = 1;
    if (this.active != 1) return;
    for (let i = 0; i < 3; i++) {
      draw_set_color(this.bcolor);
      if (i == 1 || i == 2) draw_rectangle(x, y + 38 * i, x + 300, y + 38 * i + 2, false);
      if (g.char[i] != 0 && g.charauto[g.char[i]] == 0 && this.havechar[i] == 1) {
        const j = g.char[i];
        const base = { 1: 0x0000ff, 2: 0x800080, 3: 0x008000 }[j];
        draw_set_color(base);
        if (this.pressbuffer[j] > 0) draw_set_color(merge_color(base, 0xffffff, this.pressbuffer[j] / 5));
        draw_rectangle(x + 78, y + 38 * i, x + 80 + 15 * this.boltspeed, y + 38 * i + 36, true);
        draw_rectangle(x + 79, y + 38 * i + 1, x + 80 + 15 * this.boltspeed - 1, y + 38 * i + 35, true);
        draw_sprite('spr_pressfront', j - 1, x, y + 38 * i);
        if (g.flag[13] == 0) draw_sprite('spr_pressfront_b', 0, x, y + 38 * i);
        if (g.flag[13] == 1) draw_sprite('spr_pressfront_b', i, x, y + 38 * i);
        draw_sprite('spr_pressspot', j - 1, x + 80, y + 38 * i);
      }
    }
    this.boltcount = [0, 0, 0];
    for (let i = 0; i < this.bolttotal; i++) {
      const offset = this.boltchar[i];
      const rel = this.boltframe[i] - this.boltx;
      const bx = x + 80 + this.boltframe[i] * this.boltspeed - this.boltx * this.boltspeed;
      if (rel < -5) this.boltalive[i] = 0;
      let boltalpha = 1;
      if (rel < 0) boltalpha = 1 + rel / 3;
      else if (this.imagetimer == 0 && this.boltalive[i] == 1) {
        const img = instance_create(bx, y + 38 * offset, 'obj_afterimage');
        img.sprite_index = 'spr_attackspot';
        img.image_alpha = 0.4;
      }
      if (this.boltalive[i] == 1) {
        draw_sprite_ext('spr_attackspot', 0, bx, y + 38 * offset, 1, 1, 0, 0xffffff, boltalpha);
        this.boltcount[this.boltchar[i]] += 1;
      }
    }
    for (let i = 0; i < 3; i++) {
      if (this.boltcount[i] == 0 && this.havechar[i] == 1 && this.attacked[i] == 0) {
        this.attacked[i] = 1;
        this.target = i;
        event_user(this, 1);
      }
    }
    if (S.scr_monsterpop() > 0) {
      if (g.flag[13] == 1) {
        if (button1_p() && this.havechar[0] == 1) S.scr_boltcheck(this, 0);
        if (button2_p() && this.havechar[1] == 1) S.scr_boltcheck(this, 1);
        if (button3_p() && this.havechar[2] == 1) S.scr_boltcheck(this, 2);
      } else if (button1_p()) S.scr_boltcheck_onebutton(this);
    } else {
      this.fakefade = 1;
      if (this.posttimer < this.timermax - 35) this.posttimer = this.timermax - 34;
    }
    this.imagetimer += 1;
    this.boltx += 1;
    this.pressbuffer[0] -= 1;
    this.pressbuffer[1] -= 1;
    this.pressbuffer[2] -= 1;
    if (this.imagetimer > 1) this.imagetimer = 0;
    this.goahead = 0;
    const hc = this.havechar, at = this.attacked;
    if ((at[0] == 1 || hc[0] == 0) && (at[1] == 1 || hc[1] == 0) && (at[2] == 1 || hc[2] == 0)) this.goahead = 1;
    if (S.scr_monsterpop() == 0) this.goahead = 1;
    if (this.goahead == 1) {
      this.posttimer += 1;
      if (this.posttimer > this.timermax) {
        this.fade = 1;
        withObj('obj_heroparent', h => {
          if (h.state == 1) h.state = 0;
          h.attacked = 0;
          h.itemed = 0;
        });
        if (S.scr_monsterpop() != 0) {
          g.mnfight = 1;
          g.myfight = -1;
        } else S.scr_wincombat();
      }
    }
    if (this.fade == 1 || this.fakefade == 1) {
      this.fadeamt += 0.08;
      draw_set_color(0);
      draw_set_alpha(this.fadeamt);
      draw_rectangle(x - 1, y - 1, x + 640, y + 300, false);
      draw_set_alpha(1);
      if (this.fade == 1 && this.fadeamt > 1) instance_destroy(this);
    }
  }

  // Other_11: a hero's bolts are all gone.
  user1() {
    if (S.scr_monsterpop() > 0) {
      for (let i = 0; i < 3; i++) {
        if (this.target == i && instance_exists(g.charinstance[i])) {
          const h = g.charinstance[i];
          h.points = this.points[i];
          h.state = 1;
          h.attacktimer = 0;
        }
      }
    }
  }
}
defineObject('obj_attackpress', AttackPress);

function scorePress(ap, idx, bc, topclose) {
  const p = Math.abs(topclose);
  const bb = instance_create(ap.x + 80 + ap.boltframe[idx] * ap.boltspeed - ap.boltx * ap.boltspeed, ap.y + 38 * bc, 'obj_burstbolt');
  if (p == 0) {
    ap.points[bc] += 150;
    bb.image_blend = 0xffff00;
    bb.mag = 0.2;
  }
  if (p == 1) ap.points[bc] += 120;
  if (p == 2) ap.points[bc] += 110;
  if (p >= 3) {
    ap.points[bc] += 100 - Math.abs(topclose) * 2;
    bb.image_blend = ap.boltcolor[bc];
  }
  if (p >= 15) bb.image_blend = ap.charcolor[bc];
  ap.boltalive[idx] = 0;
}

defineScript('scr_boltcheck_onebutton', (ap) => {
  let dualbolt = -1, dualboltid = -1;
  ap.pressbuffer[0] = ap.pressbuffer[1] = ap.pressbuffer[2] = 5;
  let qualifybolt = -1, topclose = 999;
  for (let i = 0; i < ap.bolttotal; i++) {
    if (ap.boltalive[i] == 1) {
      const close = ap.boltframe[i] - ap.boltx;
      if (close < 15 && close > -5) {
        if (close == topclose) { dualbolt = 1; dualboltid = i; }
        if (close < topclose) { topclose = close; qualifybolt = i; }
      }
    }
  }
  if (qualifybolt != -1) {
    scorePress(ap, qualifybolt, ap.boltchar[qualifybolt], topclose);
    if (dualbolt == 1) scorePress(ap, dualboltid, ap.boltchar[dualboltid], topclose);
  }
});

// Three-button mode (flag[13] == 1, never set in Chapter 1).
defineScript('scr_boltcheck', (ap, who) => {
  ap.pressbuffer[g.char[who]] = 5;
  let qualifybolt = -1, topclose = 99;
  for (let i = 0; i < ap.bolttotal; i++) {
    if (ap.boltchar[i] == who && ap.boltalive[i] == 1) {
      const close = ap.boltframe[i] - ap.boltx;
      if (close < 15 && close > -5 && close < topclose) { topclose = close; qualifybolt = i; }
    }
  }
  if (qualifybolt != -1) scorePress(ap, qualifybolt, who, topclose);
});

class BasicAttack extends Instance {
  create() {
    this.depth = -100;
    this.sprite_index = 'spr_attack_cut1';
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.damage = 100;
    this.image_speed = 0.334;
    withObj('obj_battlecontroller', c => { c.damagenoise = 1; });
    this.maxindex = 3;
    this.critical = 0;
  }
  step() {
    if (this.critical == 1) {
      this.image_xscale += 0.1;
      this.image_yscale += 0.1;
    }
    if (this.image_index >= this.maxindex) instance_destroy(this);
  }
}
defineObject('obj_basicattack', BasicAttack);

class BurstBolt extends Instance {
  create() {
    this.sprite_index = 'spr_attackspot';
    this.image_speed = 0;
    this.mag = 0.1;
  }
  step() {
    this.image_alpha -= 0.1;
    this.image_xscale += this.mag;
    this.image_yscale += this.mag;
    this.x += (1 - this.sprite_width) * this.mag / 2.7;
    this.y += (1 - this.sprite_height) * this.mag / 2.5;
    if (this.image_alpha < 0) instance_destroy(this);
  }
}
defineObject('obj_burstbolt', BurstBolt);

// scr_retarget(slot): hero scope; sets caller.cancelattack.
defineScript('scr_retarget', (inst, slot) => {
  let t = g.chartarget[slot];
  inst.cancelattack = 0;
  if (t == 0 && g.monster[0] == 0) t = 1;
  if (t == 1 && g.monster[1] == 0) t = 2;
  if (t == 2) {
    if (g.monster[2] == 0) t = 3;
    if (t == 3 && g.monster[0] == 1) t = 0;
    if (t == 3 && g.monster[1] == 1) t = 1;
    if (t == 3) inst.cancelattack = 1;
  }
  g.chartarget[slot] = t;
});

// scr_retarget_spell(): caller scope (star, cancelattack).
defineScript('scr_retarget_spell', (inst) => {
  inst.cancelattack = 0;
  if (inst.star == 0 && g.monster[0] == 0) inst.star = 1;
  if (inst.star == 1 && g.monster[1] == 0) inst.star = 2;
  if (inst.star == 2) {
    if (g.monster[2] == 0) inst.star = 3;
    if (inst.star == 3 && g.monster[0] == 1) inst.star = 0;
    if (inst.star == 3 && g.monster[1] == 1) inst.star = 1;
    if (inst.star == 3) inst.cancelattack = 1;
  }
});

// scr_damage_enemy(target, damage): caller scope (caster).
defineScript('scr_damage_enemy', (inst, target, damage) => {
  const dm = instance_create(g.monsterx[target], g.monstery[target] + 20 - g.hittarget[target] * 20, 'obj_dmgwriter');
  dm.type = g.char[inst.caster] - 1;
  dm.damage = damage;
  inst.dm = dm;
  g.monsterhp[target] -= damage;
  if (damage > 0) {
    withInst(g.monsterinstance[target], m => {
      m.shakex = 9;
      m.state = 3;
      m.hurttimer = 30;
    });
    if (instance_exists(g.monsterinstance[target])) g.monsterinstance[target].hurtamt = damage;
  }
  g.hittarget[target] += 1;
  if (damage == 0) {
    withInst(g.monsterinstance[target], m => {
      m.hurtamt = 0;
      if (m.hurttimer <= 15 && m.candodge == 1) {
        m.dodgetimer = 0;
        m.state = 4;
      }
    });
  }
  if (g.monsterhp[target] <= 0) withInst(g.monsterinstance[target], m => S.scr_monsterdefeat(m));
});

// ---------------------------------------------------------------- damage / heal numbers

class DmgWriter extends Instance {
  create() {
    this.spec = 0;
    this.delaytimer = 0;
    this.delay = 2;
    this.active = 0;
    this.damage = round(random(600));
    this.bounces = 0;
    this.type = -1;
    this.stretch = 0.2;
    this.stretchgo = 1;
    this.lightf = merge_color(0x800080, 0xffffff, 0.6);
    this.lightb = merge_color(0x00ffff, 0xffffff, 0.5);
    this.lightg = merge_color(0x00ff00, 0xffffff, 0.5);
    this.kill = 0;
    this.killtimer = 0;
    this.killactive = 0;
    withObj('obj_dmgwriter', d => { if (d.type != 3) d.killtimer = 0; });
    this.specialmessage = 0;
    this.vstart = 0;
  }
  draw() {
    if (this.delaytimer < this.delay) withObj('obj_dmgwriter', d => { d.killtimer = 0; });
    this.delaytimer += 1;
    if (this.delaytimer == this.delay) {
      this.vspeed = -5 - random(2);
      this.hspeed = 10;
      this.vstart = this.vspeed;
      this.flip = 90;
    }
    if (this.delaytimer < this.delay) return;
    draw_set_color(0xffffff);
    if (this.type == 0) draw_set_color(this.lightb);
    if (this.type == 1) draw_set_color(this.lightf);
    if (this.type == 2) draw_set_color(this.lightg);
    if (this.type == 3) draw_set_color(0x00ff00);
    if (this.type == 4) draw_set_color(0xff0000);
    let message = this.specialmessage;
    if (this.damage == 0) message = 1;
    if (this.type == 4) message = 2;
    draw_set_font(g.damagefont);
    if (this.hspeed > 0) this.hspeed -= 1;
    if (this.hspeed < 0) this.hspeed += 1;
    if (Math.abs(this.hspeed) < 1) this.hspeed = 0;
    const xs = 2 - this.stretch, ys = this.stretch + this.kill;
    if (message == 0) {
      draw_set_alpha(1 - this.kill);
      draw_set_halign(2);
      draw_text_transformed(this.x + 30, this.y, gmlString(this.damage), xs, ys, this.spec == 1 ? 90 : 0);
      draw_set_halign(0);
      draw_set_alpha(1);
    } else {
      if (message == 1) draw_sprite_ext('spr_battlemsg', 0, this.x + 30, this.y, xs, ys, 0, draw_get_color(), 1 - this.kill);
      if (message == 2) draw_sprite_ext('spr_battlemsg', 1, this.x + 30, this.y, xs, ys, 0, 0xff0000, 1 - this.kill);
      if (message == 3) draw_sprite_ext('spr_battlemsg', 2, this.x + 30, this.y, xs, ys, 0, 0x00ff00, 1 - this.kill);
      if (message == 4) draw_sprite_ext('spr_battlemsg', 3, this.x + 30, this.y, xs, ys, 0, 0x00ff00, 1 - this.kill);
    }
    if (this.bounces < 2) this.vspeed += 1;
    if (this.y > this.ystart && this.bounces < 2 && this.killactive == 0) {
      this.y = this.ystart;
      this.vspeed = this.vstart / 2;
      this.bounces += 1;
    }
    if (this.bounces >= 2 && this.killactive == 0) {
      this.vspeed = 0;
      this.y = this.ystart;
    }
    if (this.stretchgo == 1) this.stretch += 0.4;
    if (this.stretch >= 1.2) {
      this.stretch = 1;
      this.stretchgo = 0;
    }
    this.killtimer += 1;
    if (this.killtimer > 35) this.killactive = 1;
    if (this.killactive == 1) {
      this.kill += 0.08;
      this.y -= 4;
    }
    if (this.kill > 1) instance_destroy(this);
  }
}
defineObject('obj_dmgwriter', DmgWriter);
