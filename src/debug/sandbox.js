// Attack sandbox: ?sandbox&attack=N (N = jattack 0..15, 99, 999; optional &seed=, &music, &god).
// Sets up just enough of the battle for the bullet phase, launches the attack the way
// obj_joker does, and restarts it when the turn ends.
// Keys: [ ] previous/next attack, 0-9 jattack 0-9, Shift+0-5 jattack 10-15, R restart,
// I invincibility, M music, (F2 hitboxes, F3 pause, F4 frame step from main.js).
import {
  G, global, Instance, defineObject, defineScript, instance_create, instance_destroy, instance_exists,
  instancesOf, event_user, choose, keyboard_check, keyboard_check_pressed, random_set_seed, round, S,
  draw_set_font, draw_set_halign, draw_set_color, draw_set_alpha, draw_rectangle, draw_text, draw_sprite_ext,
  fa_left, merge_color,
} from '../runtime/gm.js';
import { snd_play, snd_init, mus_loop_ext, mus_stop, snd_stop } from '../runtime/audio.js';
import { tagParent } from '../jevil/common.js';
import { scr_moveheart } from '../jevil/soul.js';

export const ATTACKS = [
  [0, 70, 'Five-spade teleports'], [1, 65, 'Spade spirals'], [2, 49, 'Heart bombs'], [3, 75, 'Spinning scythes'],
  [4, 62, 'Carousel'], [5, 50, 'Club bombs'], [6, 73, 'Diamond release'], [7, 68, 'Spade spirals II'],
  [8, 61, 'Carousel II'], [9, 48, 'Spade bombs'], [10, 72, 'Three-club attack'], [11, 76, 'Spinning scythes II'],
  [12, 71, 'Diamond tossing'], [13, 46, 'Chaos bombs'], [14, 74, 'Diamond release II'], [15, 77, 'FINAL CHAOS'],
  [99, 47, 'Diamond bombs (unused)'], [999, 25, 'Side spades (unused)'],
];
const TARGET_ALL = [2, 5, 9, 13, 15];
const KEY_LBRACKET = 219, KEY_RBRACKET = 221, KEY_SHIFT = 16;

const arr = (n, v = 0) => new Array(n).fill(v);

// ---------------------------------------------------------------- globals

function setupGlobals() {
  if ('init_battle_globals' in S) {
    try { S.init_battle_globals(); } catch (e) { console.warn('init_battle_globals failed', e); }
  }
  const g = global;
  g.flag ??= arr(10000);
  g.tempflag ??= arr(100);
  g.char ??= [1, 2, 3];
  g.charname ??= [' ', 'Kris', 'Susie', 'Ralsei'];
  g.maxhp ??= [0, 90, 110, 70];
  g.hp ??= g.maxhp.slice();
  g.inv = -1;
  g.invc ??= 1;
  g.maxtension ??= 250;
  g.tension = 0;
  g.sp = 4;
  g.heartx ??= 310;
  g.hearty ??= 160;
  // obj_battlecontroller Create
  g.darkzone = 1;
  g.fighting = 1;
  g.fc = 0;
  g.fe = 0;
  g.typer = 4;
  g.battletyper = 4;
  g.myfight = 0;
  g.mnfight = 0;
  g.bmenuno = 0;
  g.attacking = 0;
  g.spelldelay = 10;
  g.turntimer = 0;
  g.msg ??= [];
  g.battlemsg ??= [];
  for (const k of ['charmove', 'charcantarget']) g[k] = [1, 1, 1];
  for (const k of ['chardead', 'charcond', 'automiss', 'charaction', 'charspecial', 'chartarget', 'faceaction', 'acting', 'targeted'])
    g[k] = arr(3);
  g.battleat = [];
  g.battledf = [];
  g.battlemag = [];
  for (let i = 0; i < 3; i++) {
    const c = g.char[i];
    const sum = (base, item, def) => (g[base] && g[item] ? g[base][c] + g[item][c][0] + g[item][c][1] + g[item][c][2] : def);
    g.battleat[i] = sum('at', 'itemat', 10);
    g.battledf[i] = sum('df', 'itemdf', 2);
    g.battlemag[i] = sum('mag', 'itemmag', 0);
  }
  g.charinstance = arr(3, null);
  // Monster slots; Jevil in slot 0 (scr_monstersetup type 20 overwrites the stats if ported).
  g.monster = [1, 0, 0];
  g.monstertype = [20, 0, 0];
  g.monsterinstancetype = ['obj_joker', 0, 0];
  g.monstername = ['JEVIL', ' ', ' '];
  g.monstermaxhp = [3500, 0, 0];
  g.monsterhp = [3500, 0, 0];
  g.monsterat = [10, 0, 0];
  g.monsterdf = [5, 0, 0];
  g.monsterx = arr(3);
  g.monstery = arr(3);
  g.monsterinstance = arr(3, null);
  g.monsterstatus = arr(3);
  g.monstercomment = [' ', ' ', ' '];
  g.mercymod = arr(3);
  g.mercymax = [999, 0, 0];
  g.sparepoint = arr(3);
  g.monstergold = arr(4);
  g.monsterexp = arr(4);
  g.hittarget = arr(3);
  const table = v => Array.from({ length: 3 }, () => arr(6, v));
  for (const k of ['canact', 'actcost', 'act', 'acttype', 'actspell']) g[k] = table(0);
  for (const k of ['actname', 'actdesc']) g[k] = table(' ');
  g.actactor = table(1);
}

// Scripts the battle modules may not have registered yet. Only missing ones are added.
function installFallbacks() {
  const fallback = (name, fn) => { if (!(name in S)) defineScript(name, fn); };
  fallback('scr_monsterpop', () => global.monster[0] + global.monster[1] + global.monster[2]);
  fallback('scr_tensionheal', n => {
    global.tension += n;
    if (global.tension > global.maxtension) global.tension = global.maxtension;
  });
  fallback('scr_dead', i => {
    global.charmove[i] = 0;
    global.charcantarget[i] = 0;
    global.chardead[i] = 1;
    global.charaction[i] = 0;
    global.charspecial[i] = 0;
  });
  fallback('scr_revive', i => {
    global.charmove[i] = 1;
    global.charcantarget[i] = 1;
    global.chardead[i] = 0;
  });
  fallback('scr_targetall', inst => {
    for (let i = 0; i < 3; i++) if (global.charcantarget[i] == 1) global.targeted[i] = 1;
    inst.mytarget = 3;
    inst.target = 3;
  });
  fallback('scr_randomtarget', inst => {
    const able = global.charcantarget.some(v => v == 1);
    if (able) {
      do inst.mytarget = choose(0, 1, 2); while (global.charcantarget[inst.mytarget] != 1);
    } else inst.mytarget = 3;
    global.targeted[inst.mytarget] = 1;
  });
  fallback('scr_monstersetup', () => {});
  fallback('scr_damage', inst => {
    if (!(global.inv < 0) || global.chemg_god_mode) return;
    if (inst.target < 3 && global.hp[global.char[inst.target]] <= 0) {
      S.scr_randomtarget(inst);
      inst.target = inst.mytarget;
    }
    inst.chartarget = 3;
    let tdamage = inst.damage;
    if (inst.target < 3) {
      tdamage = Math.ceil(tdamage - global.battledf[inst.target] * 3);
      inst.chartarget = global.char[inst.target];
      if (global.charaction[inst.target] == 10) tdamage = Math.ceil(2 * tdamage / 3);
      if (tdamage < 1) tdamage = 1;
    }
    if (!instance_exists('obj_shake')) instance_create(0, 0, 'obj_shake');
    const ci = global.charinstance[inst.target];
    if (ci) { ci.hurt = 1; ci.hurttimer = 0; }
    for (const h of instancesOf('obj_heart')) h.dmgnoise = 1;
    if (inst.target < 3) {
      const ct = inst.chartarget;
      if (global.hp[ct] <= 0) global.hp[ct] -= round(tdamage / 4);
      else {
        global.hp[ct] -= tdamage;
        if (global.hp[ct] <= 0) {
          global.hp[ct] = round(-global.maxhp[ct] / 2);
          S.scr_dead(inst.target);
        }
      }
    }
    if (inst.target == 3) {
      for (let i = 0; i < 3; i++) {
        const ct = global.char[i];
        if (global.hp[ct] >= 0) {
          global.hp[ct] -= global.charaction[i] == 10 ? Math.ceil(tdamage / 2) : tdamage;
          if (global.hp[ct] <= 0) global.hp[ct] = round(-global.maxhp[0] / 2);
        }
      }
    }
    global.inv = global.invc * 40;
    if (![0, 1, 2].some(i => global.char[i] != 0 && global.hp[global.char[i]] > 0)) S.scr_gameover();
  });
  fallback('scr_damage_all', inst => {
    if (!(global.inv < 0)) return;
    const remdamage = inst.damage, temptarget = inst.target;
    for (let ti = 0; ti < 3; ti++) {
      global.inv = -1;
      inst.damage = remdamage;
      inst.target = ti;
      if (global.hp[global.char[ti]] > 0 && global.char[ti] != 0) S.scr_damage(inst);
    }
    global.inv = global.invc * 40;
    inst.target = temptarget;
  });
}

// ---------------------------------------------------------------- party stand-ins

// The real hero objects need the battle controller; these only stand where they stand,
// so scr_moveheart / scr_damage / obj_darkener have something to point at.
const HeroParent = tagParent('obj_heroparent');
const HERO = {
  1: { tag: 'obj_herokris', idle: 'spr_krisb_idle', hurt: 'spr_krisb_hurt', down: 'spr_krisb_defeat', w: 68, h: 74 },
  2: { tag: 'obj_herosusie', idle: 'spr_susieb_idle', hurt: 'spr_susieb_hurt', down: 'spr_susieb_defeat', w: 70, h: 82 },
  3: { tag: 'obj_heroralsei', idle: 'spr_ralseib_idle', hurt: 'spr_ralseib_idle', down: 'spr_ralseib_defeat', w: 52, h: 86 },
};
const heroClasses = {};
for (const [c, h] of Object.entries(HERO)) {
  heroClasses[c] = defineObject('obj_sandbox_' + h.tag.slice(8), class extends tagParent(h.tag, HeroParent) {
    create() {
      this.char = Number(c);
      this.image_speed = 0.15;
      this.image_xscale = 2;
      this.image_yscale = 2;
      this.darkify = 0;
      this.darkentimer = 0;
      this.hurt = 0;
      this.hurttimer = 0;
      this.mywidth = h.w;
      this.myheight = h.h;
      this.tu = 0;
      this.state = 0;
    }
    step() {
      if (this.hurt) {
        this.hurttimer += 1;
        if (this.hurttimer > 15) this.hurt = 0;
      }
      if (this.darkify && this.darkentimer < 15) this.darkentimer += 1;
      if (!this.darkify && this.darkentimer > 0) this.darkentimer -= 3;
    }
    draw() {
      const down = global.hp[this.char] <= 0;
      const spr = down ? h.down : this.hurt ? h.hurt : h.idle;
      const blend = merge_color(0xffffff, 0, Math.max(0, this.darkentimer) / 30);
      draw_sprite_ext(spr, this.image_index, this.x, this.y, 2, 2, 0, blend, this.image_alpha);
    }
  });
}

// ---------------------------------------------------------------- controller stand-in

// Answers to obj_battlecontroller (grazenoise, instance_exists checks) and runs the parts of
// its Step the bullet phase needs: the turn timer and the end-of-phase cleanup.
class SandboxController extends tagParent('obj_battlecontroller') {
  constructor() {
    super();
    this.depth = -100000;
  }
  create() {
    this.grazenoise = 0;
    this.reset = 0;
    this.timeron = 1;
    this.noreturn = 0;
    this.skipvictory = 0;
    this.hpcolor = [0x00ffff, 0xff00ff, 0x00ff00];
    this.attackIndex = 0;
    this.phase = 'wait';
    this.wait = 10;
    this.hits = 0;
    this.prevInv = -1;
    this.god = false;
    this.runs = 0;
    this.music = null;
  }
  select(i) {
    this.attackIndex = (i + ATTACKS.length) % ATTACKS.length;
    this.restart();
  }
  // End the running turn early (the next one picks up the new attack).
  restart() {
    if (this.phase === 'bullets' && this.reset === 0) {
      for (const j of instancesOf('obj_joker')) j.attacked = 1;
      global.turntimer = 0;
    } else if (this.phase === 'wait') this.wait = 1;
  }
  begin() {
    const [jattack] = ATTACKS[this.attackIndex];
    global.targeted = arr(3);
    global.myfight = -1;
    // What obj_joker's talk phase leaves behind: darkener, chosen attack, targets.
    if (!instance_exists('obj_darkener')) instance_create(0, 0, 'obj_darkener');
    for (const j of instancesOf('obj_joker')) {
      j.jattack = jattack;
      if (TARGET_ALL.includes(jattack)) S.scr_targetall(j);
      else S.scr_randomtarget(j);
      j.talked = 1;
      j.attacked = 0;
      j.rtimer = 0;
    }
    // ...and the frame dialogue ends (scr_blconskip sets mnfight = 2).
    global.mnfight = 2;
    if (!instance_exists('obj_moveheart')) scr_moveheart();
    if (!instance_exists('obj_growtangle')) instance_create(G.camX + 320, G.camY + 170, 'obj_growtangle');
    global.turntimer = 120;
    this.phase = 'bullets';
    this.runs += 1;
  }
  step() {
    this.input();
    if (this.phase === 'wait' && --this.wait <= 0) this.begin();
    if (this.god) {
      global.chemg_god_mode = 1;
      for (let c = 1; c <= 3; c++) global.hp[c] = global.maxhp[c];
    } else global.chemg_god_mode = 0;
    if (global.inv > this.prevInv + 1) this.hits += 1;
    this.prevInv = global.inv;
    if (this.grazenoise === 1) {
      snd_play('snd_graze');
      this.grazenoise = 0;
    }
    if (global.mnfight == 2 && this.timeron === 1) {
      global.turntimer -= 1;
      if (global.turntimer <= 0 && this.reset === 0) {
        for (const b of instancesOf('obj_bulletparent')) instance_destroy(b);
        for (const b of instancesOf('obj_bulletgenparent')) instance_destroy(b);
        for (const d of instancesOf('obj_darkener')) d.darken = 0;
        for (const h of instancesOf('obj_heart')) {
          instance_create(h.x, h.y, 'obj_returnheart');
          instance_destroy(h);
        }
        this.reset = 1;
        if (this.noreturn === 0) this.alarm[2] = 15;
      }
    }
  }
  // scr_mnendturn, minus the menu: straight back into the next attack.
  alarm2() {
    this.reset = 0;
    global.mnfight = 0;
    global.myfight = 0;
    global.targeted = arr(3);
    for (const m of instancesOf('obj_monsterparent')) {
      m.attacked = 0;
      m.talked = 0;
      m.acting = 0;
    }
    // Final Chaos cut short leaves its black/white screen faders behind.
    snd_stop('snd_rumble');
    for (const m of instancesOf('obj_marker')) if (m.sprite_index === 'spr_tallpx') instance_destroy(m);
    this.phase = 'wait';
    this.wait = 20;
  }
  input() {
    const shift = keyboard_check(KEY_SHIFT);
    if (keyboard_check_pressed(KEY_LBRACKET)) this.select(this.attackIndex - 1);
    if (keyboard_check_pressed(KEY_RBRACKET)) this.select(this.attackIndex + 1);
    for (let d = 0; d <= 9; d++) {
      if (keyboard_check_pressed(String(d))) {
        const ja = shift ? 10 + d : d;
        const i = ATTACKS.findIndex(a => a[0] === ja);
        if (i >= 0) this.select(i);
      }
    }
    if (keyboard_check_pressed('R')) this.restart();
    if (keyboard_check_pressed('I')) this.god = !this.god;
    if (keyboard_check_pressed('M')) this.toggleMusic();
  }
  toggleMusic() {
    if (this.music) {
      mus_stop(this.music);
      this.music = null;
    } else {
      this.music = snd_init('joker.ogg');
      mus_loop_ext(this.music, 0.7, 1);
    }
  }
  drawEnd() {
    const [ja, type, name] = ATTACKS[this.attackIndex];
    const hp = c => `${global.charname?.[c] ?? c} ${global.hp[c]}/${global.maxhp[c]}`;
    const lines = [
      `jattack ${ja} (type ${type}): ${name}   [${this.attackIndex + 1}/${ATTACKS.length}, run ${this.runs}]`,
      `turntimer ${Math.ceil(global.turntimer)}  inv ${Math.round(global.inv)}  hits ${this.hits}${this.god ? '  INVINCIBLE' : ''}`,
      `${hp(1)}  ${hp(2)}  ${hp(3)}   TP ${Math.floor(global.tension / global.maxtension * 100)}%`,
      '[ ] / 0-9 / Shift+0-5: attack   R: restart   I: invincible   M: music',
    ];
    const x = G.camX + 4, y = G.camY + 330;
    draw_set_alpha(0.6);
    draw_set_color(0);
    draw_rectangle(x - 4, y - 2, x + 636, y + lines.length * 16 + 2, false);
    draw_set_alpha(1);
    draw_set_font('fnt_main');
    draw_set_halign(fa_left);
    draw_set_color(0xffffff);
    lines.forEach((s, i) => draw_text(x, y + i * 16, s));
  }
}
defineObject('obj_sandboxcontroller', SandboxController);

// ---------------------------------------------------------------- entry point

export function startSandbox(params) {
  if (params.has('seed')) random_set_seed(Number(params.get('seed')) || 0);
  setupGlobals();
  installFallbacks();
  // The sandbox never ends: a game over just refills the party.
  defineScript('scr_gameover', () => {
    for (let c = 1; c <= 3; c++) global.hp[c] = global.maxhp[c];
    for (let i = 0; i < 3; i++) S.scr_revive(i);
  });

  const bg = instance_create(0, 0, 'obj_jokerbg_triangle_real');
  bg.on = 1;
  // The real controller exists before the monster (it creates it), so it steps first.
  const ctl = instance_create(0, 0, 'obj_sandboxcontroller');
  const want = Number(params.get('attack') ?? 0);
  const idx = ATTACKS.findIndex(a => a[0] === want);
  ctl.attackIndex = idx >= 0 ? idx : 0;
  // scr_encountersetup(25) positions
  const heromake = [[80, 100], [90, 150], [100, 210]];
  for (let i = 0; i < 3; i++) {
    const c = global.char[i];
    if (!c || !HERO[c]) continue;
    const h = instance_create(heromake[i][0], heromake[i][1], 'obj_sandbox_' + HERO[c].tag.slice(8));
    h.myself = i;
    h.depth = 200 - i * 20;
    global.charinstance[i] = h;
  }
  const joker = instance_create(500, 160, 'obj_joker');
  joker.myself = 0;
  global.monsterinstance[0] = joker;
  try {
    event_user(joker, 12);
  } catch (e) {
    console.warn('obj_joker Other_22 / scr_monstersetup failed; using default JEVIL stats', e);
  }
  if (params.has('god')) ctl.god = true;
  if (params.has('music')) ctl.toggleMusic();
  window.sandbox = ctl;
}
