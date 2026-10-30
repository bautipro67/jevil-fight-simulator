// obj_battlecontroller: menus, panel, turn flow (scr_nexthero / scr_prevhero / scr_endturn /
// scr_attackphase / scr_mnendturn), victory; plus obj_encounterbasic and obj_tensionbar.
import {
  global, Instance, defineObject, defineScript, S, instance_create, instance_destroy, instance_exists,
  withObj, event_user, round, floor, ceil, merge_color, point_direction, point_distance,
  left_p, right_p, up_p, down_p, button1_p, button2_p, string_width, string_hash_to_newline,
  draw_set_color, draw_set_alpha, draw_set_font, draw_set_halign, draw_rectangle, draw_sprite,
  draw_sprite_ext, draw_text, draw_text_colour, draw_line_width, L, sprite_get_number,
} from '../runtime/gm.js';
import { snd_play, snd_volume, mus_loop_ext } from '../runtime/audio.js';
import { arr, arr2, view_x, view_y, withInst, exists, gmlString, subst } from './common.js';

const sin = Math.sin, cos = Math.cos;
const g = global;
const bmc = () => g.bmenucoord;

// ---------------------------------------------------------------- controller

class BattleController extends Instance {
  create() {
    this.depth = 5;
    this.xx = view_x();
    this.yy = view_y();
    if (g.flag[9] == 1) g.batmusic[1] = mus_loop_ext(g.batmusic[0], 0.7 * g.flag[16], 1);
    this.victory = 0;
    this.victoried = 0;
    this.skipvictory = 0;
    g.battleend = 0;
    this.battlewriter = null;
    this.myface = null;
    this.lastbattlewriter = null;
    this.lbuffer = 0;
    this.rbuffer = 0;
    this.onebuffer = 0;
    this.twobuffer = 0;
    g.darkzone = 1;
    g.fighting = 1;
    g.fe = 0;
    g.fc = 0;
    g.typer = 4;
    g.battletyper = 4;
    g.myfight = 0;
    g.mnfight = 0;
    g.bmenuno = 0;
    g.attacking = 0;
    g.acting = arr(4);
    g.tension = 0;
    g.spelldelay = 10;
    S.scr_spellinfo_all();
    g.tensionselect = 0;
    g.temptension = arr(4);
    this.tempitem = arr2(13, 4);
    for (let j = 0; j < 3; j++) {
      g.temptension[j] = g.tension;
      for (let i = 0; i < 13; i++) this.tempitem[i][j] = g.item[i];
    }
    this.tempitemnameb = arr2(12, 4, ' ');
    this.tempitemdescb = arr2(12, 4, ' ');
    this.tempitemvalue = arr2(12, 4);
    this.tempitemusable = arr2(12, 4);
    g.automiss = g.automiss || arr(4);
    g.charcond = g.charcond || arr(4);
    for (let i = 0; i < 3; i++) {
      g.charcond[i] = 0;
      g.automiss[i] = 0;
      if (g.char[i] != 0) {
        g.charmove[i] = 1;
        g.charcantarget[i] = 1;
        g.chardead[i] = 0;
      } else {
        g.charmove[i] = 0;
        g.charcantarget[i] = 0;
      }
    }
    this.itempage = 0;
    g.flag[50] = g.flag[51] = g.flag[52] = g.flag[53] = 0;
    for (const n of ['monster', 'monsterx', 'monstery', 'monsterat', 'monsterdf', 'monsterhp', 'monstermaxhp',
      'monstergold', 'monsterexp', 'sparepoint', 'hittarget', 'mercymod', 'mercymax', 'monsterstatus']) g[n] = arr(4);
    g.monstername = arr(3, ' ');
    g.monstercomment = arr(3, ' ');
    g.monsterinstance = arr(3, null);
    g.act = arr2(3, 6);
    g.canact = arr2(3, 6);
    g.actname = arr2(3, 6, ' ');
    g.acttype = arr2(3, 6);
    g.actspell = arr2(3, 6);
    g.actactor = arr2(3, 6, 1);
    g.actdesc = arr2(3, 6, ' ');
    g.actcost = arr2(3, 6);
    g.monstergold[3] = 0;
    g.monsterexp[3] = 0;
    for (let i = 0; i < 3; i++) {
      if (g.monstertype[i] > 0) {
        g.monster[i] = 1;
        const m = instance_create(g.monstermakex[i], g.monstermakey[i], g.monsterinstancetype[i]);
        g.monsterinstance[i] = m;
        m.myself = i;
        event_user(m, 12);
      }
    }
    g.charturn = 0;
    for (const n of ['charaction', 'charspecial', 'chartarget', 'rembmenuno', 'targeted']) g[n] = arr(4);
    g.faceaction = arr(4);
    g.battleat = arr(4);
    g.battledf = arr(4);
    g.battlemag = arr(4);
    for (let i = 0; i < 3; i++) {
      const c = g.char[i];
      g.battleat[i] = g.at[c] + g.itemat[c][0] + g.itemat[c][1] + g.itemat[c][2];
      g.battledf[i] = g.df[c] + g.itemdf[c][0] + g.itemdf[c][1] + g.itemdf[c][2];
      g.battlemag[i] = g.mag[c] + g.itemmag[c][0] + g.itemmag[c][1] + g.itemmag[c][2];
    }
    g.bmenucoord = arr2(20, 20);
    this.movenoise = 0;
    this.selnoise = 0;
    this.laznoise = 0;
    this.damagenoise = 0;
    this.grazenoise = 0;
    this.bcolor = merge_color(merge_color(0x800080, 0, 0.7), 0x404040, 0.5);
    this.tp = 0;
    this.tpy = 50;
    this.bp = 0;
    this.bpy = 152;
    this.intro = 1;
    this.chartotal = 0;
    this.charpos = [-1, -1, -1];
    this.havechar = [0, 0, 0];
    g.charinstance = [null, null, null];
    this.mmy = [0, 0, 0];
    const heroObj = { 1: 'obj_herokris', 2: 'obj_herosusie', 3: 'obj_heroralsei' };
    for (let i = 0; i < 3; i++) {
      if (g.char[i] != 0) this.chartotal += 1;
      const c = g.char[i];
      if (c >= 1 && c <= 3) {
        this.havechar[c - 1] = 1;
        this.charpos[c - 1] = i;
        const h = instance_create(g.heromakex[i], g.heromakey[i], heroObj[c]);
        g.charinstance[i] = h;
        h.myself = i;
        h.char = c;
        h.depth = 200 - i * 20;
      }
    }
    this.slmxx = 0;
    this.slmyy = 0;
    this.s_siner = 0;
    instance_create(0, 0, 'obj_tensionbar');
    this.reset = 0;
    this.timeron = 1;
    this.noreturn = 0;
    this.hpcolor = [0x00ffff, 0xff00ff, 0x00ff00];
    this.ht = [0, 0, 0];
  }

  ti(i, j) { return this.tempitem[i]?.[j] ?? 0; }

  step() {
    const c = bmc();
    if (this.victory == 1 && this.victoried == 0) this.victoryLatch();
    if (this.victoried == 1) {
      this.victortimer += 1;
      if (!instance_exists(this.lastbattlewriter) && this.victortimer >= 10) {
        this.intro = 2;
        if (this.bp <= 0) { S.scr_endcombat(this); return; }
      }
    }
    if (g.myfight == 0) {
      if (g.bmenuno == 0) this.menuMain(c);
      if (g.bmenuno == 2) this.menuMagic(c);
      if (g.bmenuno == 4) this.menuItem(c);
      if (g.bmenuno == 9) this.menuAct(c);
      if ([7, 1, 8, 3, 11, 12].includes(g.bmenuno)) this.menuTargets(c);
    }
    if (this.movenoise == 1) { snd_play('snd_menumove'); this.movenoise = 0; }
    if (this.grazenoise == 1) { snd_play('snd_graze'); this.grazenoise = 0; }
    if (this.selnoise == 1) { snd_play('snd_select'); this.selnoise = 0; }
    if (this.damagenoise == 1) { snd_play('snd_damage'); this.damagenoise = 0; }
    if (this.laznoise == 1) { snd_play('snd_laz_c'); this.laznoise = 0; }
    this.onebuffer -= 1;
    this.twobuffer -= 1;
    this.lbuffer -= 1;
    this.rbuffer -= 1;
    if (g.mnfight == 2 && this.timeron == 1) {
      g.turntimer -= 1;
      if (g.turntimer <= 0 && this.reset == 0) {
        withObj('obj_bulletparent', b => instance_destroy(b));
        withObj('obj_bulletgenparent', b => instance_destroy(b));
        withObj('obj_darkener', d => { d.darken = 0; });
        withObj('obj_heart', h => {
          instance_create(h.x, h.y, 'obj_returnheart');
          instance_destroy(h);
        });
        this.reset = 1;
        if (this.noreturn == 0) this.alarm[2] = 15;
      }
    }
  }

  alarm2() {
    this.reset = 0;
    S.scr_mnendturn(this);
  }

  victoryLatch() {
    g.faceaction[0] = g.faceaction[1] = g.faceaction[2] = 0;
    g.battleend = 1;
    g.mnfight = -1;
    g.myfight = 7;
    withInst(this.battlewriter, w => instance_destroy(w));
    withObj('obj_face', f => instance_destroy(f));
    withObj('obj_smallface', f => instance_destroy(f));
    for (let i = 0; i < 4; i++) {
      if (g.hp[i] < 1) g.hp[i] = round(g.maxhp[i] / 8);
    }
    this.lastbattlewriter = null;
    if (this.skipvictory == 0) {
      g.monstergold[3] += floor(g.tension / 10);
      if (g.charweapon[1] == 8) g.monstergold[3] += floor(g.monstergold[3] / 20);
      g.gold += g.monstergold[3];
      g.xp += g.monsterexp[3];
      g.fc = 0;
      g.fe = 0;
      g.battlemsg[0] = subst(L('obj_battlecontroller_slash_Step_0_gml_40_0'), gmlString(g.monsterexp[3]), gmlString(g.monstergold[3]));
      g.msg[0] = g.battlemsg[0];
      g.typer = g.battletyper;
      this.lastbattlewriter = S.scr_battletext(this);
      for (let i = 0; i < 3; i++) {
        withInst(g.charinstance[i], h => { h.state = 7; h.hurt = 0; h.hurttimer = 0; });
      }
    }
    this.victoried = 1;
    this.victortimer = 0;
    if (this.skipvictory == 1) this.victortimer = -20;
    withObj('obj_tensionbar', t => { t.alarm[5] = 15; t.hspeed = -10; t.friction = -0.4; });
  }

  menuMain(c) {
    const t = g.charturn;
    if (!instance_exists(this.battlewriter)) {
      g.msg[0] = g.battlemsg[0];
      g.typer = g.battletyper;
      S.scr_battletext(this);
    }
    if (left_p() == 1 && this.lbuffer < 0) {
      if (c[0][t] == 0) c[0][t] = 4;
      else c[0][t] -= 1;
      this.movenoise = 1;
      this.rbuffer = 1;
    }
    if (right_p() == 1 && this.rbuffer < 0) {
      if (c[0][t] == 4) c[0][t] = 0;
      else c[0][t] += 1;
      this.movenoise = 1;
      this.lbuffer = 1;
    }
    if (button1_p() == 1 && this.twobuffer < 0) {
      this.onebuffer = 1;
      this.selnoise = 1;
      if (c[0][t] == 0) g.bmenuno = 1;
      if (c[0][t] == 1 && g.char[t] != 1) { this.onebuffer = 1; g.bmenuno = 2; }
      if (c[0][t] == 1 && g.char[t] == 1) { this.onebuffer = 1; g.bmenuno = 11; }
      if (c[0][t] == 2 && this.ti(0, t) != 0) {
        this.onebuffer = 1;
        g.bmenuno = 4;
        S.scr_iteminfo_temp(this, t);
        for (let i = 0; i < 12; i++) {
          if (this.ti(c[4][t], t) == 0 && c[4][t] > 0) c[4][t] -= 1;
        }
      }
      if (c[0][t] == 3) { this.onebuffer = 1; g.bmenuno = 12; }
      if (c[0][t] == 4) {
        S.scr_tensionheal(40);
        g.faceaction[t] = 4;
        g.charaction[t] = 10;
        S.scr_nexthero(this);
      }
    }
    if (button2_p() == 1 && this.onebuffer < 0 && g.charturn > 0) {
      this.twobuffer = 1;
      this.movenoise = 1;
      S.scr_prevhero(this);
    }
    this.writerDepth(3);
  }

  writerDepth(d) {
    withInst(this.battlewriter, w => { w.depth = d; });
    withObj('obj_face_parent', f => { f.depth = d; });
    withObj('obj_smallface', f => { f.depth = d; });
  }
  writerSkip() {
    withInst(this.battlewriter, w => { w.skipme = 1; });
    this.writerDepth(10);
  }

  // MAGIC (bmenuno 2) and ITEM (bmenuno 4) share the grid navigation; `valid(k)` says slot k is filled.
  gridNav(c, menu, valid, leftValid) {
    const t = g.charturn;
    if (right_p()) {
      let cango = 1;
      const coord = c[menu][t];
      if (coord < 11) {
        if (!valid(c[menu][t] + 1)) {
          cango = 0;
          if (coord % 2 == 1 && coord > 0) c[menu][t] -= 1;
        }
      } else {
        c[menu][t] -= 1;
        cango = 0;
      }
      if (cango == 1) {
        if (coord % 2 == 0) c[menu][t] += 1;
        else c[menu][t] -= 1;
      }
    }
    if (left_p()) {
      const coord = c[menu][t];
      if (leftValid()) {
        if (coord % 2 == 0) c[menu][t] += 1;
        else c[menu][t] -= 1;
      }
    }
    if (down_p()) {
      const coord = c[menu][t];
      let cango = 1;
      if (coord >= 10) cango = 0;
      else {
        if (!valid(coord + 2)) cango = 0;
        if (coord == 5 && valid(6) && !valid(7)) cango = 2;
      }
      if (cango == 1) c[menu][t] += 2;
      if (cango == 2) c[menu][t] = 6;
    }
    if (up_p()) {
      const coord = c[menu][t];
      if (coord > 1) c[menu][t] -= 2;
    }
  }

  menuMagic(c) {
    const t = g.charturn;
    this.writerSkip();
    const thischar = g.char[t];
    this.gridNav(c, 2, k => (g.spell[thischar][k] ?? 0) != 0, () => g.spell[thischar][1] != 0);
    g.tensionselect = g.spellcost[thischar][c[2][t]];
    if (button1_p() && g.spell[thischar][c[2][t]] != 0 && this.onebuffer < 0) {
      if (g.spellcost[thischar][c[2][t]] <= g.tension) {
        this.onebuffer = 2;
        g.bmenuno = 0;
        this.selnoise = 1;
        S.scr_spellinfo(this, g.spell[thischar][c[2][t]]);
        if (this.spelltarget == 0) S.scr_spellconsumeb(this);
        if (this.spelltarget == 1) g.bmenuno = 8;
        if (this.spelltarget == 2) g.bmenuno = 3;
      }
    }
    if (button2_p() && this.onebuffer < 0) {
      g.tensionselect = 0;
      this.twobuffer = 1;
      g.bmenuno = 0;
      this.movenoise = 1;
    }
  }

  menuItem(c) {
    const t = g.charturn;
    this.writerSkip();
    if (this.ti(c[4][t], t) == 0) c[4][t] -= 1;
    this.gridNav(c, 4, k => this.ti(k, t) != 0, () => this.ti(1, t) != 0);
    if (this.ti(c[4][t], t) == 0) c[4][t] -= 1;
    if (button1_p() && this.ti(c[4][t], t) != 0 && this.onebuffer < 0) {
      this.onebuffer = 2;
      g.bmenuno = 0;
      this.selnoise = 1;
      S.scr_iteminfo(this, this.ti(c[4][t], t));
      if (this.itemtarget == 0 || this.itemtarget == 2) S.scr_itemconsumeb(this);
      if (this.itemtarget == 1) g.bmenuno = 7;
    }
    if (button2_p() && this.onebuffer < 0) {
      this.twobuffer = 1;
      g.bmenuno = 0;
      this.movenoise = 1;
    }
  }

  menuAct(c) {
    const t = g.charturn;
    const thisenemy = c[11][t];
    const canact = k => g.canact[thisenemy][k] ?? 0;
    if (right_p()) {
      let cango = 1;
      const coord = c[9][t];
      if (coord < 5) {
        if (canact(c[9][t] + 1) == 0) {
          cango = 0;
          if (coord % 2 == 1 && coord > 0) c[9][t] -= 1;
        }
      } else {
        c[9][t] -= 1;
        cango = 0;
      }
      if (cango == 1) {
        if (coord % 2 == 0) c[9][t] += 1;
        else c[9][t] -= 1;
      }
    }
    if (left_p()) {
      const coord = c[9][t];
      if (coord % 2 == 0) {
        if (canact(coord + 1) != 0) c[9][t] += 1;
      } else c[9][t] -= 1;
    }
    if (down_p()) {
      const coord = c[9][t];
      let cango = 1;
      if (coord >= 4) cango = 0;
      else if (canact(coord + 2) == 0) cango = 0;
      if (cango == 1) c[9][t] += 2;
    }
    if (up_p()) {
      const coord = c[9][t];
      if (coord > 1) c[9][t] -= 2;
    }
    g.tensionselect = g.actcost[thisenemy][c[9][t]];
    const actor = g.actactor[c[11][t]][c[9][t]];
    let canpress = 1;
    if (actor == 2 || actor == 4) { if (this.havechar[1] == 0 || g.hp[2] <= 0) canpress = 0; }
    if (actor == 3 || actor == 4) { if (this.havechar[2] == 0 || g.hp[3] <= 0) canpress = 0; }
    if (canpress == 1) {
      if (button1_p() && canact(c[9][t]) == 1 && g.tension >= g.tensionselect && this.onebuffer < 0) {
        this.onebuffer = 2;
        g.bmenuno = 0;
        this.selnoise = 1;
        g.tension -= g.actcost[thisenemy][c[9][t]];
        g.tensionselect = 0;
        if (exists(g.monsterinstance[thisenemy])) g.monsterinstance[thisenemy].acting = c[9][t] + 1;
        g.acting[0] = 1;
        if (actor == 2) g.acting[this.charpos[1]] = 1;
        if (actor == 3) g.acting[this.charpos[2]] = 1;
        if (actor == 4) { g.acting[2] = 1; g.acting[1] = 1; }
        for (let i = 0; i < 3; i++) {
          if (g.acting[i] == 1) {
            g.faceaction[i] = 6;
            g.charaction[i] = 9;
          }
        }
        S.scr_nexthero(this);
      }
    }
    if (button2_p() && this.onebuffer < 0) {
      g.tensionselect = 0;
      this.twobuffer = 1;
      g.bmenuno = 11;
      this.movenoise = 1;
    }
  }

  menuTargets(c) {
    const t = g.charturn;
    this.writerSkip();
    if (button2_p() && this.onebuffer < 0) {
      this.twobuffer = 1;
      if (g.bmenuno == 1 || g.bmenuno == 11 || g.bmenuno == 12) g.bmenuno = 0;
      if (g.bmenuno == 7) g.bmenuno = 4;
      if (g.bmenuno == 8 || g.bmenuno == 3) g.bmenuno = 2;
      this.movenoise = 1;
    }
    if (![7, 1, 8, 3, 11, 12].includes(g.bmenuno)) return;
    const ht = this.ht;
    if (g.bmenuno == 7 || g.bmenuno == 8) for (let i = 0; i < 3; i++) ht[i] = g.char[i] > 0 ? 1 : 0;
    if ([1, 3, 11, 12].includes(g.bmenuno)) for (let i = 0; i < 3; i++) ht[i] = g.monster[i];
    const m = g.bmenuno;
    if (c[m][t] == 2 && ht[2] == 0) c[m][t] = 0;
    if (c[m][t] == 0 && ht[0] == 0) c[m][t] = 1;
    if (c[m][t] == 1 && ht[1] == 0) c[m][t] = 0;
    if (c[m][t] == 0 && ht[0] == 0) c[m][t] = 2;
    const move = order => {
      for (const k of order) {
        if (ht[k] == 1) { this.movenoise = 1; c[m][t] = k; return; }
      }
    };
    if (down_p() == 1) {
      if (c[m][t] == 0) move([1, 2]);
      else if (c[m][t] == 1) move([2, 0]);
      else if (c[m][t] == 2) move([0, 1]);
    }
    if (up_p() == 1) {
      if (c[m][t] == 0) move([2, 1]);
      else if (c[m][t] == 1) move([0, 2]);
      else if (c[m][t] == 2) move([1, 0]);
    }
    if (button1_p() && this.onebuffer < 0) {
      this.onebuffer = 1;
      this.selnoise = 1;
      if (g.bmenuno == 1) {
        g.chartarget[t] = c[g.bmenuno][t];
        g.faceaction[t] = 1;
        g.charaction[t] = 1;
        S.scr_nexthero(this);
      }
      if (g.bmenuno == 7) {
        g.chartarget[t] = c[g.bmenuno][t];
        S.scr_itemconsumeb(this);
      }
      if (g.bmenuno == 8 || g.bmenuno == 3) {
        g.chartarget[t] = c[g.bmenuno][t];
        S.scr_spellconsumeb(this);
      }
      if (g.bmenuno == 11) {
        g.bmenuno = 9;
        let actcoord = c[9][t];
        const thisenemy = c[11][t];
        for (let i = 0; i < 6; i++) {
          if ((g.canact[thisenemy][actcoord] ?? 0) == 0 && actcoord > 0) {
            c[9][t] -= 1;
            actcoord -= 1;
          }
        }
        this.onebuffer = 1;
      }
      if (g.bmenuno == 12) {
        g.faceaction[t] = 10;
        g.chartarget[t] = c[g.bmenuno][t];
        g.charaction[t] = 2;
        g.charspecial[t] = 100;
        S.scr_nexthero(this);
      }
    }
  }

  // ---------------------------------------------------------------- Draw

  draw() {
    const xx = this.xx = view_x();
    const yy = this.yy = view_y();
    this.tpoff = this.tp - this.tpy + yy;
    this.bpoff = -this.bp + this.bpy + yy;
    const spell_offset = 500;
    if (this.intro == 1) {
      if (this.bp < this.bpy - 1) {
        if (this.bpy - this.bp < 40) this.bp += round((this.bpy - this.bp) / 2.5);
        else this.bp += 30;
      } else this.bp = this.bpy;
      if (this.bp == this.bpy) this.intro = 0;
    }
    if (this.intro == 2) {
      if (this.bp > 0) {
        if (round((this.bpy - this.bp) / 5) > 15) this.bp -= round((this.bpy - this.bp) / 2.5);
        else this.bp -= 30;
      } else this.bp = 0;
    }
    const bp = this.bp;
    draw_set_color(0);
    draw_rectangle(xx - 10, 481 + yy, xx + 700, 480 - bp + yy, false);
    draw_set_color(this.bcolor);
    draw_rectangle(xx - 10, 480 - bp - 2 + yy, xx + 700, 480 - bp + yy, false);
    draw_rectangle(xx - 10, 480 - bp + 34 + yy, xx + 700, 480 - bp + 36 + yy, false);
    S.scr_charbox(this);
    const c = bmc();
    const t = g.charturn;
    const flashInst = inst => withInst(inst, m => {
      if (!m.flash) m.fsiner = 0;
      m.flash = 1;
      m.becomeflash = 1;
    });
    if ([1, 3, 11, 12].includes(g.bmenuno) && g.myfight == 0) {
      draw_sprite('spr_heart', 0, xx + 55, yy + 385 + c[g.bmenuno][t] * 30);
      draw_set_font('fnt_mainbig');
      for (let i = 0; i < 3; i++) {
        flashInst(g.monsterinstance[c[g.bmenuno][t]]);
        if (g.monster[i] == 1) {
          draw_set_color(0xffffff);
          let mercydraw = 0, tireddraw = 0, c1 = 0xffffff, c2 = 0xffffff;
          const aqcolor = merge_color(0x00ffff, 0x0000ff, 0.3);
          if (g.monsterstatus[i] == 1) tireddraw = 1;
          if (g.mercymod[i] >= g.mercymax[i]) mercydraw = 1;
          const namewidth = string_width(string_hash_to_newline(g.monstername[i]));
          if (tireddraw == 1) {
            if (g.encounterno != 31) { draw_set_color(aqcolor); c1 = c2 = aqcolor; }
            draw_sprite('spr_tiredmark', 0, xx + 80 + namewidth + 40, yy + 385 + i * 30);
          }
          if (mercydraw == 1) {
            draw_set_color(0xffff00);
            c1 = 0xffff00;
            if (tireddraw == 0) c2 = 0xffff00;
            draw_sprite('spr_sparestar', 0, xx + 80 + namewidth + 20, yy + 385 + i * 30);
          }
          draw_text_colour(xx + 80, yy + 375 + i * 30, string_hash_to_newline(g.monstername[i]), c1, c2, c2, c1, 1);
          draw_set_color(0x808080);
          draw_text(xx + 80 + namewidth + 60, yy + 375 + i * 30, string_hash_to_newline(g.monstercomment[i]));
          draw_set_color(0x800000);
          draw_rectangle(xx + 510, yy + 380 + i * 30, xx + 590, yy + 380 + i * 30 + 15, false);
          draw_set_color(0x00ff00);
          draw_rectangle(xx + 510, yy + 380 + i * 30, xx + 510 + g.monsterhp[i] / g.monstermaxhp[i] * 80, yy + 380 + i * 30 + 15, false);
        }
      }
    }
    if (g.bmenuno == 2 && g.myfight == 0) {
      const thischar = g.char[t];
      let spellcoord = c[2][t], page = 0;
      if (spellcoord > 5) { page = 1; spellcoord -= 6; }
      let icx = 10, icy = 385;
      if (spellcoord == 1 || spellcoord == 3 || spellcoord == 5) icx = 230;
      if (spellcoord > 1 && spellcoord < 4) icy = 415;
      if (spellcoord > 3) icy = 445;
      draw_sprite('spr_heart', 0, xx + icx, yy + icy);
      draw_set_font('fnt_mainbig');
      for (let i = 0; i < 3; i++) {
        const l = page * 6 + i * 2;
        draw_set_color(0xffffff);
        if (g.tension < g.spellcost[thischar][l]) draw_set_color(0x808080);
        else if (g.spell[thischar][l] == 3) {
          let pacify_glow = 0;
          for (let k = 0; k < 3; k++) {
            if (g.monster[k] == 1 && g.monsterstatus[k] == 1 && g.encounterno != 31) pacify_glow = 1;
          }
          if (pacify_glow == 1) draw_set_color(merge_color(0x00ffff, 0x0000ff, 0.3));
        }
        draw_text(xx + 30, yy + 375 + i * 30, string_hash_to_newline(g.spellnameb[thischar][l]));
        draw_set_color(0xffffff);
        if (g.tension < g.spellcost[thischar][l + 1]) draw_set_color(0x808080);
        draw_text(xx + 260, yy + 375 + i * 30, string_hash_to_newline(g.spellnameb[thischar][l + 1]));
      }
      draw_set_color(0x808080);
      draw_text(xx + spell_offset, yy + 375, string_hash_to_newline(g.spelldescb[thischar][page * 6 + spellcoord]));
      const thiscost = round(g.spellcost[thischar][page * 6 + spellcoord] / g.maxtension * 100);
      draw_set_color(0xffa040);
      draw_text(xx + spell_offset, yy + 440, string_hash_to_newline(gmlString(thiscost) + L('obj_battlecontroller_slash_Draw_0_gml_171_0')));
    }
    if (g.bmenuno == 4 && g.myfight == 0) {
      let itemcoord = c[4][t], page = 0;
      if (itemcoord > 5) { page = 1; itemcoord -= 6; }
      let icx = 10, icy = 385;
      if (itemcoord == 1 || itemcoord == 3 || itemcoord == 5) icx = 230;
      if (itemcoord > 1 && itemcoord < 4) icy = 415;
      if (itemcoord > 3) icy = 445;
      draw_sprite('spr_heart', 0, xx + icx, yy + icy);
      draw_set_font('fnt_mainbig');
      for (let i = 0; i < 3; i++) {
        draw_set_color(0xffffff);
        draw_text(xx + 30, yy + 375 + i * 30, string_hash_to_newline(this.tempitemnameb[page * 6 + i * 2]?.[t] ?? ' '));
        draw_text(xx + 260, yy + 375 + i * 30, string_hash_to_newline(this.tempitemnameb[page * 6 + i * 2 + 1]?.[t] ?? ' '));
      }
      if (page == 0 && g.item[6] != 0) draw_sprite('spr_morearrow', 0, xx + 470, yy + 445 + sin(this.s_siner / 10) * 2);
      if (page == 1) draw_sprite_ext('spr_morearrow', 0, xx + 470, yy + 395 - sin(this.s_siner / 10) * 2, 1, -1, 0, 0xffffff, 1);
      draw_set_color(0x808080);
      draw_text(xx + spell_offset, yy + 375, string_hash_to_newline(this.tempitemdescb[page * 6 + itemcoord]?.[t] ?? ' '));
    }
    if (g.bmenuno == 9 && g.myfight == 0) {
      const actcoord = c[9][t];
      const enemy = c[11][t];
      let icx = 10, icy = 385;
      if (actcoord == 1 || actcoord == 3 || actcoord == 5) icx = 240;
      if (actcoord > 1 && actcoord < 4) icy = 415;
      if (actcoord > 3) icy = 445;
      draw_sprite('spr_heart', 0, xx + icx, yy + icy);
      draw_set_font('fnt_mainbig');
      for (let i = 0; i < 6; i++) {
        let cant = 0, charoffset = 0;
        const chartime = g.actactor[enemy][i];
        const xoffset = (i == 1 || i == 3 || i == 5) ? 230 : 0;
        const yoffset = (i == 2 || i == 3) ? 30 : (i == 4 || i == 5) ? 60 : 0;
        let susblend = 0xffffff;
        if (chartime == 2 || chartime == 4) {
          if (this.havechar[1] == 0 || g.hp[2] <= 0) { susblend = 0x808080; cant = 1; }
          charoffset = 36;
        }
        if (chartime == 3 || chartime == 4) {
          if (this.havechar[2] == 0 || g.hp[3] <= 0) cant = 1;
          charoffset = 36;
        }
        if (g.tension < g.actcost[enemy][i]) cant = 1;
        if (chartime == 4) charoffset = round(charoffset * 1.8);
        draw_set_color(cant == 1 ? 0x808080 : 0xffffff);
        // Ralsei's head uses susblend in the original too.
        if (chartime == 2) draw_sprite_ext('spr_headsusie', 0, xx + 30 + xoffset, yy + 375 + yoffset, 1, 1, 0, susblend, 1);
        if (chartime == 3) draw_sprite_ext('spr_headralsei', 0, xx + 30 + xoffset, yy + 375 + yoffset, 1, 1, 0, susblend, 1);
        if (chartime == 4) {
          draw_sprite_ext('spr_headsusie', 0, xx + 30 + xoffset, yy + 375 + yoffset, 1, 1, 0, susblend, 1);
          draw_sprite_ext('spr_headralsei', 0, xx + 60 + xoffset, yy + 375 + yoffset, 1, 1, 0, susblend, 1);
        }
        draw_text(xx + 30 + charoffset + xoffset, yy + 375 + yoffset, string_hash_to_newline(g.actname[enemy][i]));
      }
      draw_set_color(0x808080);
      draw_text(xx + 500, yy + 375, string_hash_to_newline(g.actdesc[enemy][actcoord]));
      if (g.tensionselect > 0) {
        const thiscost = round(g.actcost[enemy][actcoord] / g.maxtension * 100);
        draw_set_color(0xffa040);
        draw_text(xx + 500, yy + 440, string_hash_to_newline(gmlString(thiscost) + L('obj_battlecontroller_slash_Draw_0_gml_280_0')));
      }
      flashInst(g.monsterinstance[enemy]);
    }
    if ((g.bmenuno == 7 || g.bmenuno == 8) && g.myfight == 0) {
      draw_sprite('spr_heart', 0, xx + 55, yy + 385 + c[g.bmenuno][t] * 30);
      draw_set_font('fnt_mainbig');
      for (let i = 0; i < 3; i++) {
        if (g.char[i] != 0) {
          flashInst(g.charinstance[c[g.bmenuno][t]]);
          draw_set_color(0xffffff);
          draw_text(xx + 80, yy + 375 + i * 30, string_hash_to_newline(g.charname[g.char[i]]));
          draw_set_color(0x800000);
          draw_rectangle(xx + 400, yy + 380 + i * 30, xx + 500, yy + 380 + i * 30 + 15, false);
          draw_set_color(0x00ff00);
          draw_rectangle(xx + 400, yy + 380 + i * 30, xx + 400 + g.hp[g.char[i]] / g.maxhp[g.char[i]] * 100, yy + 380 + i * 30 + 15, false);
        }
      }
    }
    draw_set_alpha(1);
  }
}
defineObject('obj_battlecontroller', BattleController);

// ---------------------------------------------------------------- party boxes

const XCHUNK = { 3: [0, 212, 424], 2: [106, 326], 1: [212] };

defineScript('scr_charbox_x', (ctrl, slot) => XCHUNK[ctrl.chartotal]?.[slot] ?? 0);

defineScript('scr_charbox', (ctrl) => {
  const { xx, yy } = ctrl;
  const bp = ctrl.bp;
  const heads = ['spr_headkris', 'spr_headsusie', 'spr_headralsei'];
  const names = ['spr_bnamekris', 'spr_bnamesusie', 'spr_bnameralsei'];
  for (let c = 0; c < 3; c++) {
    if (ctrl.havechar[c] != 1) continue;
    ctrl.charcolor = ctrl.hpcolor[c];
    const gc = g.charturn;
    const xchunk = XCHUNK[ctrl.chartotal]?.[ctrl.charpos[c]] ?? 0;
    const mmy = ctrl.mmy;
    if (gc == ctrl.charpos[c]) {
      if (g.myfight == 0) S.scr_selectionmatrix(ctrl, xx + xchunk, 480 - bp + yy);
      if (mmy[c] > -32) mmy[c] -= 2;
      if (mmy[c] > -24) mmy[c] -= 4;
      if (mmy[c] > -16) mmy[c] -= 6;
      if (mmy[c] > -8) mmy[c] -= 8;
      if (mmy[c] < -32) mmy[c] = -64;
    } else if (mmy[c] < -14) mmy[c] += 15;
    else mmy[c] = 0;
    const btc = [0, 0, 0, 0, 0];
    if (gc == ctrl.charpos[c]) btc[g.bmenucoord[0][g.charturn]] = 1;
    if (g.fighting == 1) {
      let spare_glow = 0, pacify_glow = 0;
      for (let k = 0; k < 3; k++) if (g.monster[k] == 1 && g.mercymod[k] >= 100) spare_glow = 1;
      if (c == 2) {
        for (let k = 0; k < 3; k++) {
          if (g.monster[k] == 1 && g.monsterstatus[k] == 1 && g.tension >= 40) pacify_glow = 1;
          if (g.encounterno == 31) pacify_glow = 0;
        }
      }
      const by = 485 - bp + yy;
      draw_sprite('spr_btfight', btc[0], xx + xchunk + 15, by);
      draw_sprite(c == 0 ? 'spr_btact' : 'spr_bttech', btc[1], xx + xchunk + 50, by);
      draw_sprite('spr_btitem', btc[2], xx + xchunk + 85, by);
      draw_sprite('spr_btspare', btc[3], xx + xchunk + 120, by);
      draw_sprite('spr_btdefend', btc[4], xx + xchunk + 155, by);
      const a = 0.4 + sin(g.time / 6) * 0.4;
      if (spare_glow == 1 && gc == ctrl.charpos[c]) draw_sprite_ext('spr_btspare', 2, xx + xchunk + 120, by, 1, 1, 0, 0xffffff, a);
      if (pacify_glow == 1 && gc == ctrl.charpos[c]) draw_sprite_ext('spr_bttech', 2, xx + xchunk + 50, by, 1, 1, 0, 0xffffff, a);
    }
    draw_set_color(gc == ctrl.charpos[c] ? ctrl.charcolor : ctrl.bcolor);
    if (g.charselect == ctrl.charpos[c] || g.charselect == 3) draw_set_color(ctrl.charcolor);
    draw_rectangle(xx + xchunk, 480 - bp - 2 + yy + mmy[c], xx + xchunk + 212, 480 - bp + yy, false);
    draw_set_color(0);
    draw_rectangle(xx + xchunk + 2, 480 - bp + yy + mmy[c], xx + xchunk + 210, 480 - bp + yy + mmy[c] + 33, false);
    const b_offset = g.fighting == 1 ? 336 : 430;
    const hy = ctrl.bpoff + b_offset + mmy[c];
    draw_sprite(heads[c], g.faceaction[ctrl.charpos[c]], xx + 13 + xchunk, hy);
    draw_sprite(names[c], 0, xx + 51 + xchunk, hy + 3);
    draw_sprite('spr_hpname', 0, xx + 109 + xchunk, hy + 11);
    const hp = g.hp[c + 1], mhp = g.maxhp[c + 1];
    draw_set_color(0xffffff);
    draw_set_font(g.hpfont);
    if (hp / mhp <= 0.25) draw_set_color(0xffff00);
    if (hp <= 0) draw_set_color(0xff0000);
    draw_set_halign(2);
    draw_text(xx + 160 + xchunk, hy - 2, gmlString(hp));
    draw_sprite('spr_hpslash', 0, xx + 159 + xchunk, hy - 4);
    draw_text(xx + 205 + xchunk, hy - 2, gmlString(mhp));
    draw_set_halign(0);
    draw_set_color(0x800000);
    draw_rectangle(xx + 128 + xchunk, hy + 11, xx + 203 + xchunk, hy + 19, false);
    if (hp > 0 && mhp > 0) {
      draw_set_color(ctrl.charcolor);
      draw_rectangle(xx + 128 + xchunk, hy + 11, xx + xchunk + 128 + ceil(hp / mhp * 75), hy + 19, false);
    }
  }
});

defineScript('scr_selectionmatrix', (ctrl, x, y) => {
  ctrl.slmxx = x;
  ctrl.slmyy = y;
  ctrl.s_siner += 2;
  draw_set_color(ctrl.charcolor);
  draw_rectangle(x, y, x + 210, y + 3, false);
  for (let i = 0; i < 12; i++) {
    const myxx = ctrl.s_siner + i * 31.41592653589793;
    draw_set_alpha(Math.max(0, sin(myxx / 60)));
    draw_line_width(x, y, x, y + 33, 2);
    draw_line_width(x + 210, y, x + 210, y + 33, 2);
    if (cos(myxx / 60) < 0) {
      const d = 30 - sin(myxx / 60) * 30;
      draw_line_width(x + d, y, x + d, y + 33, 2);
      draw_line_width(x + 210 - d, y, x + 210 - d, y + 33, 2);
    }
  }
  draw_set_alpha(1);
});

// ---------------------------------------------------------------- hero cycling and turn flow

defineScript('scr_charcan', (slot) => {
  let charcan = 1;
  if (g.hp[g.char[slot]] <= 0) charcan = 0;
  if (g.acting[slot] == 1) charcan = 0;
  if (g.char[slot] == 0) charcan = 0;
  if (g.charmove[slot] == 0) charcan = 0;
  if (g.charauto[g.char[slot]] == 1) charcan = 0;
  return charcan;
});

defineScript('scr_nexthero', (ctrl) => {
  let moveswapped = 0;
  const prevturn = g.charturn;
  if (g.charturn == 0) {
    moveswapped = 1;
    if (g.charmove[1] == 1 && S.scr_charcan(1)) g.charturn = 1;
    else if (g.charmove[2] == 1 && S.scr_charcan(2)) g.charturn = 2;
    else S.scr_endturn(ctrl);
  }
  if (g.charturn == 1 && moveswapped == 0) {
    moveswapped = 1;
    if (S.scr_charcan(2) && g.acting[1] == 0) g.charturn = 2;
    else S.scr_endturn(ctrl);
  }
  if (g.charturn == 2 && moveswapped == 0) S.scr_endturn(ctrl);
  if (moveswapped == 1) g.bmenuno = 0;
  if (g.charturn > 0) {
    g.temptension[g.charturn] = g.tension;
    for (let i = 0; i < 12; i++) ctrl.tempitem[i][g.charturn] = ctrl.tempitem[i][prevturn];
  }
});

defineScript('scr_prevhero', (ctrl) => {
  let moveswapped = 0;
  if (g.charturn == 1) {
    if (g.charmove[0] == 1) { g.charturn = 0; moveswapped = 1; }
  }
  if (g.charturn == 2) {
    moveswapped = 1;
    if (g.charmove[1] == 1 && g.acting[1] == 0) g.charturn = 1;
    else if (g.charmove[0] == 1) g.charturn = 0;
  }
  if (moveswapped == 1) {
    g.bmenuno = 0;
    g.faceaction[g.charturn] = 0;
    g.chartarget[g.charturn] = 0;
    g.charaction[g.charturn] = 0;
    g.charspecial[g.charturn] = 0;
    ctrl.movenoise = 1;
  }
  if (g.charturn == 0) {
    withObj('obj_monsterparent', m => { m.acting = 0; });
    g.acting[0] = g.acting[1] = g.acting[2] = 0;
    g.faceaction[1] = 0;
    g.chartarget[1] = 0;
    g.charaction[1] = 0;
    g.charspecial[1] = 0;
    g.faceaction[2] = 0;
    g.tension = g.temptension[0];
    for (let i = 0; i < 12; i++) ctrl.tempitem[i][0] = g.item[i];
  } else {
    g.tension = g.temptension[g.charturn];
    for (let i = 0; i < 12; i++) ctrl.tempitem[i][g.charturn] = ctrl.tempitem[i][g.charturn - 1];
  }
});

defineScript('scr_endturn', (ctrl) => {
  for (let i = 0; i < 12; i++) g.item[i] = ctrl.tempitem[i][g.charturn];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) ctrl.tempitem[i][j] = g.item[i];
  withObj('obj_writer', w => instance_destroy(w));
  withObj('obj_face', f => instance_destroy(f));
  withObj('obj_smallface', f => instance_destroy(f));
  g.attacking = 0;
  for (let i = 0; i < 3; i++) {
    if (g.charauto[g.char[i]] == 1 && g.hp[g.char[i]] > 0) {
      if (g.monster[2] == 1) g.chartarget[i] = 2;
      if (g.monster[1] == 1) g.chartarget[i] = 1;
      if (g.monster[0] == 1) g.chartarget[i] = 0;
    }
    if (g.charaction[i] == 1) g.attacking = 1;
  }
  if (g.acting[0] == 0) S.scr_attackphase();
  else {
    g.charturn = 3;
    g.myfight = 3;
  }
});

defineScript('scr_attackphase', () => {
  withObj('obj_battlecontroller', ctrl => {
    if (S.scr_monsterpop() != 0) {
      let fightphase = 1;
      g.charturn = 3;
      for (let i = 0; i < 3; i++) if (g.charaction[i] == 4 || g.charaction[i] == 2) fightphase = 0;
      if (g.myfight == 4) fightphase = 1;
      if (fightphase == 1) {
        g.myfight = 1;
        instance_create(ctrl.xx + 2, ctrl.yy + 365, 'obj_attackpress');
      } else {
        g.myfight = 4;
        instance_create(0, 0, 'obj_spellphase');
      }
    } else S.scr_wincombat();
  });
});

defineScript('scr_battlecursor_memory_reset', () => {
  if (g.flag[14] == 0) g.bmenucoord = arr2(20, 20);
});

defineScript('scr_mnendturn', (ctrl) => {
  if (S.scr_monsterpop() == 0) { S.scr_wincombat(); return; }
  S.scr_battlecursor_memory_reset();
  g.mnfight = 0;
  g.myfight = 0;
  g.bmenuno = 0;
  g.charturn = 0;
  let skip = 0;
  for (let i = 0; i < 3; i++) {
    withInst(g.charinstance[i], h => { h.tu = 0; });
    const hptarget = g.char[i];
    if (g.char[i] != 0 && g.hp[hptarget] <= 0) {
      const healamt = ceil(g.maxhp[hptarget] / 8);
      const h = g.charinstance[i];
      const dmgwr = instance_create(h.x, h.y + h.myheight - 24, 'obj_dmgwriter');
      dmgwr.delay = 1;
      dmgwr.type = 3;
      dmgwr.damage = S.scr_heal(i, healamt);
      if (g.hp[hptarget] >= 1) dmgwr.specialmessage = 4;
    }
  }
  if (g.charmove[0] == 0 || g.charauto[g.char[0]] == 1) g.charturn = 1;
  if (g.charturn == 1 && (g.charmove[1] == 0 || g.charauto[g.char[1]] == 1)) g.charturn = 2;
  if (g.charturn == 2 && (g.charmove[2] == 0 || g.charauto[g.char[2]] == 1)) skip = 1;
  for (let i = 0; i < 3; i++) {
    g.acting[i] = 0;
    g.temptension[i] = g.tension;
    g.charspecial[i] = 0;
    g.targeted[i] = 0;
    g.charaction[i] = 0;
    g.faceaction[i] = 0;
  }
  withObj('obj_monsterparent', m => { m.attacked = 0; m.talked = 0; m.acting = 0; });
  if (skip == 1) {
    if (g.char[0] == 2 && g.charauto[2] == 1) { g.acting[0] = 1; g.myfight = 3; }
    S.scr_endturn(ctrl);
  }
  for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) ctrl.tempitem[i][j] = g.item[i];
});

defineScript('scr_monsterpop', () => g.monster[0] + g.monster[1] + g.monster[2]);

defineScript('scr_wincombat', () => {
  g.myfight = 7;
  g.mnfight = -1;
  withObj('obj_battlecontroller', ctrl => { ctrl.victory = 1; });
  for (let i = 0; i < 3; i++) {
    if (g.monster[i] == 1 && exists(g.monsterinstance[i])) S.scr_monsterdefeat(g.monsterinstance[i]);
  }
});

// scr_monsterdefeat(): monster scope.
defineScript('scr_monsterdefeat', (inst) => {
  const m = inst.myself;
  if (g.monster[m] != 1) return;
  g.monstergold[3] += g.monstergold[m];
  g.monsterexp[3] += g.monsterexp[m];
  g.monster[m] = 0;
  if (g.flag[51 + m] == 0) {
    g.flag[51 + m] = 2;
    if (g.monsterhp[m] <= 0) g.flag[51 + m] = 1;
  }
  if (g.flag[51 + m] == 1) g.flag[40] += 1;
  if (g.flag[51 + m] == 2) g.flag[41] += 1;
  if (g.flag[51 + m] == 3) g.flag[42] += 1;
  if (g.flag[51 + m] == 5) g.flag[43] += 1;
  if (S.scr_monsterpop() == 0) {
    let violenced = 0, spared = 0, pacified = 0;
    for (let d = 0; d < 3; d++) {
      if (g.flag[51 + d] == 1) violenced += 1;
      if (g.flag[51 + d] == 2) spared += 1;
      if (g.flag[51 + d] == 3) pacified += 1;
    }
    if (pacified > 0) g.flag[50] = 3;
    if (spared > 0) g.flag[50] = 2;
    if (violenced > 0) g.flag[50] = 1;
  }
  event_user(inst, 11);
});

defineScript('scr_endcombat', (ctrl) => {
  g.fighting = 0;
  if (g.specialbattle == 0 || g.specialbattle == 2 || g.specialbattle == 3) {
    instance_create(0, 0, 'obj_endbattle');
    withObj('obj_monsterparent', m => instance_destroy(m));
    withObj('obj_bulletparent', b => instance_destroy(b));
    withObj('obj_heroparent', h => instance_destroy(h));
    instance_destroy(ctrl);
  }
});

// ---------------------------------------------------------------- choice consumption

defineScript('scr_spellconsumeb', (ctrl) => {
  const t = g.charturn;
  g.tension -= ctrl.cost;
  g.faceaction[t] = 2;
  g.charaction[t] = 2;
  g.charspecial[t] = g.spell[g.char[t]][g.bmenucoord[2][t]];
  g.tensionselect = 0;
  S.scr_nexthero(ctrl);
});

defineScript('scr_itemconsumeb', (ctrl) => {
  const t = g.charturn;
  g.faceaction[t] = 3;
  g.charaction[t] = 4;
  g.charspecial[t] = ctrl.tempitem[g.bmenucoord[4][t]][t] + 200;
  if (ctrl.usable == 1) S.scr_itemshift_temp(ctrl, g.bmenucoord[4][t], t);
  S.scr_nexthero(ctrl);
});

defineScript('scr_itemshift_temp', (ctrl, pos, slot) => {
  ctrl.tempitem[12][slot] = 0;
  for (let i = pos; i < 12; i++) ctrl.tempitem[i][slot] = ctrl.tempitem[i + 1][slot];
});

defineScript('scr_iteminfo_temp', (ctrl, slot) => {
  const info = {};
  for (let i = 0; i < 12; i++) {
    S.scr_iteminfo(info, ctrl.tempitem[i][slot]);
    ctrl.tempitemnameb[i][slot] = info.itemnameb;
    ctrl.tempitemdescb[i][slot] = info.itemdescb;
    ctrl.tempitemvalue[i][slot] = info.value;
    ctrl.tempitemusable[i][slot] = info.usable;
  }
});

defineScript('scr_tensionheal', (n) => {
  g.tension += n;
  if (g.tension > g.maxtension) g.tension = g.maxtension;
});

// ---------------------------------------------------------------- encounter start

class EncounterBasic extends Instance {
  create() {
    g.interact = 2;
    S.scr_encountersetup(g.encounterno);
    this.count = 0;
    this.c = [];
    const sx = g.introx || [g.heromakex[0] + 65, g.heromakex[1] + 65, g.heromakex[2] + 65];
    const sy = g.introy || g.heromakey;
    this.c[0] = S.scr_dark_marker(sx[0], sy[0], 'spr_krisr_dark');
    this.count += 1;
    this.c[1] = S.scr_dark_marker(sx[1], sy[1], 'spr_susier_dark');
    this.c[1].sprite_index = 'spr_susier_wall';
    this.count += 1;
    this.c[2] = S.scr_dark_marker(sx[2], sy[2], 'spr_ralseir');
    for (let i = 0; i < this.count + 1; i++) {
      const m = this.c[i];
      m.direction = point_direction(m.x, m.y, g.heromakex[i], g.heromakey[i]);
      m.speed = point_distance(m.x, m.y, g.heromakex[i], g.heromakey[i]) / 10;
      m.depth = 200 - i * 20;
    }
    this.fightcon = 1;
    this.counttimer = 0;
  }
  step() {
    if (this.fightcon == 1) {
      this.counttimer += 1;
      if (this.counttimer < 10) {
        for (let i = 0; i < this.count + 1; i++) {
          const af = S.scr_afterimage(this.c[i]);
          af.image_alpha = 0.5;
        }
      }
      if (this.counttimer >= 10) {
        const wp = snd_play('snd_impact');
        snd_volume(wp, 0.7, 0);
        const wp2 = snd_play('snd_weaponpull_fast');
        snd_volume(wp2, 0.8, 0);
        for (let i = 0; i < this.count + 1; i++) {
          const m = this.c[i];
          m.speed = 0;
          m.image_index = 0;
          if (g.char[i] == 1) m.sprite_index = 'spr_krisb_attack';
          if (g.char[i] == 2) m.sprite_index = g.charweapon[g.char[i]] == 0 ? 'spr_susieb_attack_unarmed' : 'spr_susieb_attack';
          if (g.char[i] == 3) m.sprite_index = 'spr_ralseib_battleintro';
          m.image_speed = 0.5;
        }
        this.fightcon = 2;
        this.counttimer = 0;
      }
    }
    if (this.fightcon == 2) {
      this.counttimer += 1;
      if (this.counttimer >= 15) {
        this.counttimer = 0;
        this.fightcon = 3;
        for (let i = 0; i < this.count + 1; i++) instance_destroy(this.c[i]);
        instance_create(0, 0, 'obj_battlecontroller');
        instance_destroy(this);
      }
    }
  }
  draw() {}
}
defineObject('obj_encounterbasic', EncounterBasic);

// ---------------------------------------------------------------- TP bar

class TensionBar extends Instance {
  create() {
    this.depth = 1;
    this.sprite_index = 'spr_tensionbar';
    this.image_speed = 0;
    this.tsiner = 0;
    g.tensionselect = 0;
    this.apparent = g.tension;
    this.current = g.tension;
    this.changetimer = 15;
    this.y = view_y() + 40;
    this.x = view_x() - 40;
    this.hspeed = 13;
    this.friction = 1;
    this.flashsiner = 0;
  }
  alarm5() { instance_destroy(this); }
  draw() {
    const { x, y } = this;
    const sw = this.sprite_width, sh = this.sprite_height, maxt = g.maxtension;
    draw_sprite('spr_tplogo', 0, x - 30, y + 30);
    draw_sprite('spr_tensionbar', 1, x, y);
    draw_set_color(0xffffff);
    draw_set_font('fnt_mainbig');
    this.flashsiner += 1;
    const tamt = floor(this.apparent / maxt * 100);
    let maxed = 0;
    if (tamt < 100) {
      draw_text(x - 30, y + 70, gmlString(floor(this.apparent / maxt * 100)));
      draw_text(x - 25, y + 95, '%');
    }
    if (tamt >= 100) {
      maxed = 1;
      draw_set_color(0xffff00);
      draw_text(x - 28, y + 70, 'M');
      draw_text(x - 24, y + 90, 'A');
      draw_text(x - 20, y + 110, 'X');
    }
    if (Math.abs(this.apparent - g.tension) < 20) this.apparent = g.tension;
    if (this.apparent < g.tension) this.apparent += 20;
    if (this.apparent > g.tension) this.apparent -= 20;
    if (this.apparent != this.current) {
      this.changetimer += 1;
      if (this.changetimer > 15) {
        const d = () => this.apparent - this.current;
        if (d() > 0) this.current += 2;
        if (d() > 10) this.current += 2;
        if (d() > 25) this.current += 3;
        if (d() > 50) this.current += 4;
        if (d() > 100) this.current += 5;
        if (d() < 0) this.current -= 2;
        if (d() < -10) this.current -= 2;
        if (d() < -25) this.current -= 3;
        if (d() < -50) this.current -= 4;
        if (d() < -100) this.current -= 5;
        if (Math.abs(d()) < 3) this.current = this.apparent;
      }
    }
    const top = v => y + sh - v / maxt * sh;
    const fillc = maxed == 1 ? merge_color(0xffff00, 0xffa040, 0.5) : 0xffa040;
    if (this.current > 0) {
      if (this.apparent < this.current) {
        draw_set_color(0xff0000);
        draw_rectangle(x + 3, y + sh - 1, x + sw - 1, top(this.current), false);
        draw_set_color(0xffa040);
        draw_rectangle(x + 3, y + sh - 1, x + sw - 1, top(this.apparent), false);
      }
      if (this.apparent > this.current) {
        draw_set_color(0xffffff);
        draw_rectangle(x + 3, y + sh - 1, x + sw - 1, top(this.apparent), false);
        draw_set_color(fillc);
        draw_rectangle(x + 3, y + sh - 1, x + sw - 1, top(this.current), false);
      }
      if (this.apparent == this.current) {
        draw_set_color(fillc);
        draw_rectangle(x + 3, y + sh - 1, x + sw - 1, top(this.current), false);
      }
    }
    if (g.tensionselect > 0) {
      this.tsiner += 1;
      draw_set_color(0xffffff);
      draw_set_alpha(Math.abs(sin(this.tsiner / 8) * 0.5) + 0.2);
      const theight = top(this.current);
      let theight2 = theight + g.tensionselect / maxt * sh;
      if (theight2 > y + sh - 1) {
        theight2 = y + sh - 1;
        draw_set_color(0x404040);
        draw_set_alpha(0.7);
      }
      draw_rectangle(x + 3, theight2, x + sw - 1, theight, false);
      draw_set_alpha(1);
    }
    if (this.apparent > 20 && this.apparent < maxt) draw_sprite('spr_tensionmarker', 0, x + 3, top(this.current));
    draw_sprite('spr_tensionbar', 0, x, y);
  }
}
defineObject('obj_tensionbar', TensionBar);

void sprite_get_number; void draw_set_halign;
