// Fresh-fight globals (scr_gamestart + the Card Castle party), encounter/monster setup,
// spell/item tables, and startBattle().
import {
  global, G, Instance, defineObject, defineScript, S, instance_create, room_reset, objectExists,
  font_add_sprite_ext, L,
} from '../runtime/gm.js?v=20261030222208';
import { snd_free_all, snd_init } from '../runtime/audio.js?v=20261030222208';
import { arr, arr2, view_x, view_y, splitCaller } from './common.js?v=20261030222208';

// Card Castle equipment: weapon in slot 0, armors in slots 1 and 2 (at, df, mag).
const WEAPONS = { 1: [0, 0, 0], 2: [0, 0, 0], 3: [0, 0, 0], 5: [2, 0, 0], 6: [2, 0, 0], 7: [5, 0, 4], 8: [4, 0, 0], 9: [2, 0, 0], 10: [0, 0, 2] };
const ARMORS = { 0: [0, 0, 0], 1: [0, 1, 0], 2: [0, 2, 0], 4: [0, 2, 0], 5: [1, 2, 0], 6: [0, 0, 2], 7: [2, 2, 2] };
// char id -> [weapon, armor1, armor2]: Spookysword / Brave Ax / Ragger, Amber Card, Dice Brace,
// IronShackle, White Ribbon.
const LOADOUT = { 1: [5, 5, 1], 2: [6, 1, 2], 3: [9, 4, 1] };
// Chapter 1 consumables: Top Cake, ReviveMint x2, ClubsSandwich, HeartsDonut, ChocDiamond,
// Darkburger, Dark Candy.
const INVENTORY = [6, 2, 2, 11, 12, 13, 8, 1];

function scr_gamestart() {
  global.chapter = 1;
  global.lang = 'en';
  global.darkzone = 0;
  global.plot = 0;
  global.time = 0;
  global.fighting = 0;
  global.char = [1, 0, 0];
  global.gold = 0;
  global.xp = 0;
  global.lv = 1;
  global.inv = 0;
  global.invc = 1;
  global.charselect = -1;
  global.encounterno = 1;
  global.specialbattle = 0;
  global.heromakex = arr(3, 100);
  global.heromakey = arr(3, 200);
  global.charauto = arr(4);
  global.charmove = arr(4);
  global.charcantarget = arr(4);
  global.chardead = arr(4);
  global.invincible = arr(4, 1);
  global.charaction = arr(4);
  global.faceaction = arr(4);
  global.charcond = arr(4);
  global.charauto[2] = 1;
  global.hp = arr(4, 200);
  global.maxhp = arr(4, 250);
  global.at = arr(4, 10);
  global.df = arr(4, 2);
  global.mag = arr(4, 0);
  global.guts = arr(4, 0);
  global.charweapon = arr(4, 1);
  global.chararmor1 = arr(4, 0);
  global.chararmor2 = arr(4, 0);
  global.itemat = arr2(4, 4);
  global.itemdf = arr2(4, 4);
  global.itemmag = arr2(4, 4);
  global.itembolts = arr2(4, 4);
  global.itemgrazeamt = arr2(4, 4);
  global.itemgrazesize = arr2(4, 4);
  global.itemboltspeed = arr2(4, 4);
  global.itemspecial = arr2(4, 4);
  global.spell = arr2(4, 12);
  global.boltspeed = 100;
  global.grazeamt = 100;
  global.grazesize = 100;
  global.charname = [' ', L('scr_gamestart_slash_scr_gamestart_gml_98_0'), L('scr_gamestart_slash_scr_gamestart_gml_99_0'), L('scr_gamestart_slash_scr_gamestart_gml_100_0')];
  global.charweapon[0] = 0;
  global.hp[0] = 0; global.maxhp[0] = 0;
  global.hp[1] = 90; global.maxhp[1] = 90; global.at[1] = 10;
  global.charweapon[2] = 2;
  global.hp[2] = 110; global.maxhp[2] = 110; global.at[2] = 14; global.mag[2] = 1;
  global.charweapon[3] = 3;
  global.hp[3] = 70; global.maxhp[3] = 70; global.at[3] = 8; global.mag[3] = 7;
  global.spell[1][0] = 7;
  global.spell[2][0] = 4;
  global.spell[3][0] = 3;
  global.spell[3][1] = 2;
  global.item = arr(13);
  global.keyitem = arr(13);
  global.tension = 0;
  global.maxtension = 250;
  global.grazetotal = 0;
  global.grazeturn = 0;
  global.monstermakex = arr(3, 500);
  global.monstermakey = arr(3, 240);
  global.monsterinstancetype = arr(3, null);
  global.monster = arr(3, 1);
  global.monstertype = arr(3, 1);
  global.bmenuno = 0;
  global.bmenucoord = arr2(20, 20);
  global.myfight = 0;
  global.mnfight = 0;
  global.fc = 0;
  global.fe = 0;
  global.typer = 5;
  global.msg = arr(100, ' ');
  global.battlemsg = [' '];
  global.writersnd = arr(10, null);
  global.currentsong = [null, null];
  global.batmusic = [null, null];
  global.choice = -1;
  global.seriousbattle = 0;
  global.interact = 0;
  global.flag = arr(10000);
  global.tempflag = arr(100);
  global.flag[15] = 1;
  global.flag[16] = 0.85;
  global.flag[17] = 0.6;
  global.turntimer = 0;
}

// Everything the Jevil fight needs on top of scr_gamestart, as on the "??????" floor.
defineScript('init_battle_globals', () => {
  scr_gamestart();
  global.char = [1, 2, 3];
  global.charauto = arr(4); // obj_prisonevent clears auto-Susie before this fight
  global.darkzone = 1;
  global.plot = 165;
  for (const c of [1, 2, 3]) {
    const [w, a1, a2] = LOADOUT[c];
    global.charweapon[c] = w;
    global.chararmor1[c] = a1;
    global.chararmor2[c] = a2;
    [WEAPONS[w], ARMORS[a1], ARMORS[a2]].forEach((s, slot) => {
      global.itemat[c][slot] = s[0];
      global.itemdf[c][slot] = s[1];
      global.itemmag[c][slot] = s[2];
    });
  }
  INVENTORY.forEach((it, i) => { global.item[i] = it; });
  S.scr_spellinfo_all();
  global.hpfont = font_add_sprite_ext('spr_numbersfontsmall', '0123456789-+', false, 2);
  global.damagefont = font_add_sprite_ext('spr_numbersfontbig', '0123456789', true, 0);
  global.heartx = 310;
  global.hearty = 160;
  // obj_jokerbattleevent con 23
  global.flag[9] = 1;
  global.batmusic[0] = snd_init('joker.ogg');
  global.encounterno = 25;
  global.specialbattle = 3;
});

// ---------------------------------------------------------------- spells

// scr_spellinfo(spell): writes cost, spelltarget, spellname(b), spelldesc(b), spellusable on `t`.
defineScript('scr_spellinfo', (t, id) => {
  t.cost = -1;
  t.spelltarget = 1;
  t.spellname = ' ';
  t.spellnameb = ' ';
  t.spelldescb = ' ';
  t.spelldesc = ' ';
  t.spellanim = 0;
  t.spellusable = 0;
  t.spelltext = ' ';
  const k = n => L('scr_spellinfo_slash_scr_spellinfo_gml_' + n + '_0');
  switch (id) {
    case 0: t.spellname = ' '; t.spellnameb = ' '; t.spelltarget = 0; t.cost = -1; t.spelldescb = k(18); break;
    case 1: t.spellname = k(21); t.spellnameb = k(22); t.spelldescb = k(23); t.spelldesc = k(24); t.spelltarget = 2; t.cost = 125; t.spellusable = 0; break;
    case 2: t.spellname = k(31); t.spellnameb = k(32); t.spelldescb = k(33); t.spelldesc = k(34); t.spelltarget = 1; t.cost = 80; t.usable = 0; t.spellusable = 1; break;
    case 3: t.spellname = k(42); t.spellnameb = k(43); t.spelldescb = k(44); t.spelldesc = k(45); t.spelltarget = 2; t.cost = 40; t.usable = 0; t.spellusable = 0; break;
    case 4:
      t.spellname = k(52); t.spellnameb = k(53); t.spelldescb = k(54); t.spelldesc = k(55); t.spelltarget = 2; t.cost = 125;
      if (global.charweapon[2] == 7) t.cost = 100;
      t.spellusable = 0;
      break;
    case 5: t.spellname = k(64); t.spellnameb = k(65); t.spelldescb = k(66); t.spelldesc = ' '; t.spelltarget = 2; t.cost = 0; t.spellusable = 0; break;
    case 6: t.spellname = k(75); t.spellnameb = k(76); t.spelldescb = k(77); t.spelldesc = ' '; t.spelltarget = 0; t.cost = 0; t.spellusable = 0; break;
    case 7: t.spellname = k(86); t.spellnameb = k(87); t.spelldescb = k(88); t.spelldesc = k(89); t.spelltarget = 0; t.cost = 0; t.spellusable = 0; break;
  }
});

defineScript('scr_spellinfo_all', () => {
  const t = {};
  for (const n of ['spellname', 'spellnameb', 'spelldescb', 'spelldesc', 'spellcost', 'spellusable', 'spelltarget'])
    global[n] = arr2(4, 12);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 12; i++) {
      S.scr_spellinfo(t, global.spell[j][i]);
      global.spellname[j][i] = t.spellname;
      global.spellnameb[j][i] = t.spellnameb;
      global.spelldescb[j][i] = t.spelldescb;
      global.spelldesc[j][i] = t.spelldesc;
      global.spellcost[j][i] = t.cost;
      global.spellusable[j][i] = t.spellusable;
      global.spelltarget[j][i] = t.spelltarget;
    }
  }
});

// ---------------------------------------------------------------- items

const ITEMS = {
  1: [14, 1, 25, 1], 2: [21, 1, 400, 1], 3: [28, 0, 200, 0], 4: [35, 2, 1, 0], 5: [42, 1, 5, 1],
  6: [49, 2, 150, 1], 7: [56, 2, 5, 1], 8: [63, 1, 70, 1], 9: [70, 1, 10, 1], 10: [77, 1, 10, 1],
  11: [84, 2, 70, 1], 12: [91, 1, 40, 1], 13: [98, 1, 40, 1], 14: [105, 1, 10, 1], 15: [112, 1, 50, 1],
};
// scr_iteminfo(item): writes itemnameb, itemdescb, itemtarget, value, usable on `t`.
defineScript('scr_iteminfo', (t, id) => {
  t.usable = 0;
  t.value = 0;
  t.itemtarget = 0;
  t.itemnameb = ' ';
  t.itemdescb = ' ';
  if (id == 0) { t.itemnameb = ' '; t.itemdescb = '---'; return; }
  const e = ITEMS[id];
  if (!e) return;
  t.itemnameb = L('scr_iteminfo_slash_scr_iteminfo_gml_' + e[0] + '_0');
  t.itemdescb = L('scr_iteminfo_slash_scr_iteminfo_gml_' + (e[0] + 1) + '_0');
  t.itemtarget = e[1];
  t.value = e[2];
  t.usable = e[3];
});

// ---------------------------------------------------------------- encounter and monster

defineScript('scr_encountersetup', (...a) => {
  const [, [enc]] = splitCaller(a);
  const xx = view_x(), yy = view_y();
  for (let i = 0; i < 3; i++) {
    global.heromakex[i] = xx + 80;
    global.heromakey[i] = yy + 50 + 80 * i;
    global.monsterinstancetype[i] = 'obj_lancerboss';
    global.monstertype[i] = 1;
    global.monstermakex[i] = xx + 540;
    global.monstermakey[i] = yy + 160 + 80 * i;
  }
  if (global.char[0] != 0 && global.char[1] == 0 && global.char[2] == 0) global.heromakey[0] = yy + 140;
  if (global.char[0] != 0 && global.char[1] != 0 && global.char[2] == 0) {
    global.heromakey[0] = yy + 100;
    global.heromakey[1] = yy + 180;
  }
  if (enc == 25) {
    global.heromakex[0] = xx + 80;
    global.heromakey[0] = yy + 100;
    global.heromakex[1] = xx + 90;
    global.heromakey[1] = yy + 150;
    global.heromakex[2] = xx + 100;
    global.heromakey[2] = yy + 210;
    global.monsterinstancetype[0] = 'obj_joker';
    global.monstertype[0] = 20;
    global.monstermakex[0] = xx + 500;
    global.monstermakey[0] = yy + 160;
    global.monstertype[1] = 0;
    global.monstertype[2] = 0;
    global.battlemsg[0] = L('scr_encountersetup_slash_scr_encountersetup_gml_384_0');
  }
});

// scr_monstersetup(): monster scope (uses myself). Only type 20 (JEVIL) exists here.
defineScript('scr_monstersetup', (inst) => {
  const m = inst.myself;
  const k = n => L('scr_monstersetup_slash_scr_monstersetup_gml_' + n + '_0');
  if (global.monstertype[m] == 20) {
    global.monstername[m] = k(562);
    global.monstermaxhp[m] = 3500;
    global.monsterhp[m] = 3500;
    global.monsterat[m] = 10;
    global.monsterdf[m] = 5;
    global.monsterexp[m] = 0;
    global.monstergold[m] = 0;
    global.sparepoint[m] = 0;
    global.mercymod[m] = 0;
    global.mercymax[m] = 999;
    global.canact[m][0] = 1;
    global.actname[m][0] = k(574);
    global.canact[m][1] = 1;
    global.actactor[m][1] = 1;
    global.actname[m][1] = k(579);
    global.actdesc[m][1] = k(580);
    global.actcost[m][1] = 50;
    global.canact[m][2] = 1;
    global.actactor[m][2] = 4;
    global.actname[m][2] = k(585);
    global.actdesc[m][2] = k(586);
    global.actcost[m][2] = 125;
  }
});

// ---------------------------------------------------------------- obj_time, start

class ObjTime extends Instance {
  create() { this.depth = -9999; this.visible = false; this.persistent = true; }
  beginStep() {
    if (G.pendingGameover) {
      const p = G.pendingGameover;
      G.pendingGameover = null;
      S.startGameover(p);
      return;
    }
    global.time = (global.time || 0) + 1;
  }
}
defineObject('obj_time', ObjTime);

// Overworld spots the party stands on when Jevil starts the fight (end of the intro walk).
const INTRO_START = [[145, 100], [155, 150], [165, 210]];

// Starts a fresh Jevil fight: opts.intro = false skips the encounter transition.
export function startBattle(opts = {}) {
  const tempflag = global.tempflag ? global.tempflag.slice() : null;
  snd_free_all();
  room_reset();
  G.viewScale = 1;
  G.camX = G.camY = 0;
  S.init_battle_globals();
  if (tempflag) global.tempflag = tempflag;
  instance_create(0, 0, 'obj_time');
  if (G.settings?.simplify) global.flag[8] = 1;
  // The room's background object, switched on as obj_jokerbattleevent does.
  if ('scr_joker_bg_on' in S) S.scr_joker_bg_on();
  else if (objectExists('obj_jokerbg_triangle_real')) {
    const bg = instance_create(0, 0, 'obj_jokerbg_triangle_real');
    bg.on = global.flag[8] == 1 ? 0 : 1;
  }
  global.introx = INTRO_START.map(p => p[0]);
  global.introy = INTRO_START.map(p => p[1]);
  if (opts.intro === false) {
    S.scr_encountersetup(global.encounterno);
    instance_create(0, 0, 'obj_battlecontroller');
  } else {
    instance_create(0, 0, 'obj_encounterbasic');
  }
  G.battleStarted = G.frame;
}
defineScript('startBattle', startBattle);
