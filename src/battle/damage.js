// Party damage, down state, revive/heal, enemy targeting, game over trigger.
import {
  global, G, defineScript, S, instance_create, instance_exists, withObj, choose, round, ceil,
} from '../runtime/gm.js?v=20261030223631';
import { snd_play, snd_stop, snd_free_all } from '../runtime/audio.js?v=20261030223631';
import { withInst } from './common.js?v=20261030223631';

const g = global;

// scr_damage(): bullet scope. Reads caller.target (slot, or 3 = all) and caller.damage.
defineScript('scr_damage', (inst) => {
  const debug_inv = g.chemg_god_mode ?? 0;
  if (!(g.inv < 0 && debug_inv == 0)) return;
  S.scr_damage_cache();
  if (inst.target < 3) {
    if (g.hp[g.char[inst.target]] <= 0) {
      S.scr_randomtarget(inst);
      inst.target = inst.mytarget;
      withInst(g.charinstance[inst.target], h => {
        h.image_blend = 0xffffff;
        h.darkify = 0;
      });
    }
  }
  inst.chartarget = 3;
  inst.tdamage = inst.damage;
  if (inst.target < 3) {
    inst.tdamage = ceil(inst.tdamage - g.battledf[inst.target] * 3);
    inst.chartarget = g.char[inst.target];
    if (g.charaction[inst.target] == 10) inst.tdamage = ceil(2 * inst.tdamage / 3);
    if (inst.tdamage < 1) inst.tdamage = 1;
  }
  if (G.settings?.easy) inst.tdamage = Math.max(1, ceil(inst.tdamage / 2));
  if (!instance_exists('obj_shake')) instance_create(0, 0, 'obj_shake');
  withInst(g.charinstance[inst.target], h => {
    h.hurt = 1;
    h.hurttimer = 0;
  });
  inst.hpdiff = inst.tdamage;
  withObj('obj_dmgwriter', d => { if (d.delaytimer >= 1) d.killactive = 1; });
  let doomtype = -1;
  withObj('obj_heart', h => { h.dmgnoise = 1; });
  if (inst.target < 3) {
    const ct = inst.chartarget;
    if (g.hp[ct] <= 0) {
      doomtype = 4;
      g.hp[ct] -= round(inst.tdamage / 4);
      inst.hpdiff = round(inst.tdamage / 4);
    } else {
      g.hp[ct] -= inst.tdamage;
      if (g.hp[ct] <= 0) {
        inst.hpdiff = Math.abs(g.hp[ct] - g.maxhp[ct] / 2);
        doomtype = 4;
        g.hp[ct] = round(-g.maxhp[ct] / 2);
        S.scr_dead(inst.target);
      }
    }
    const h = g.charinstance[inst.target];
    const dw = instance_create(h.x, h.y + h.myheight - 24, 'obj_dmgwriter');
    dw.damage = inst.hpdiff;
    dw.type = doomtype;
    inst.dmgwriter = dw;
  }
  if (inst.target == 3) {
    for (let hpi = 0; hpi < 3; hpi++) {
      const ct = g.char[hpi];
      inst.chartarget = ct;
      if (g.hp[ct] >= 0) {
        if (g.charaction[hpi] == 10) g.hp[ct] -= ceil(inst.tdamage / 2);
        else g.hp[ct] -= inst.tdamage;
        if (g.hp[ct] <= 0) g.hp[ct] = round(-g.maxhp[0] / 2);
      }
    }
  }
  g.inv = g.invc * 40;
  S.scr_damage_check();
  let gameover = 1;
  for (let i = 0; i < 3; i++) if (g.char[i] != 0 && g.hp[g.char[i]] > 0) gameover = 0;
  if (gameover == 1) S.scr_gameover();
});

// scr_damage_all(): bullet scope; hits every standing hero once.
defineScript('scr_damage_all', (inst) => {
  if (g.inv < 0) {
    S.scr_damage_cache();
    const remdamage = inst.damage;
    const temptarget = inst.target;
    for (let ti = 0; ti < 3; ti++) {
      g.inv = -1;
      inst.damage = remdamage;
      inst.target = ti;
      if (g.hp[g.char[ti]] > 0 && g.char[ti] != 0) S.scr_damage(inst);
      if (!G.instances.length) return; // game over reset the room
    }
    g.inv = g.invc * 40;
    inst.target = temptarget;
    S.scr_damage_check();
  }
});

// Achievement bookkeeping in the original; kept for the cache only.
defineScript('scr_damage_cache', () => {
  g.damage_cache = [];
  for (let i = 0; i < 3; i++) g.damage_cache.push(g.hp[g.char[i]]);
});
defineScript('scr_damage_check', () => {
  const cache = g.damage_cache || [];
  for (let i = 0; i < cache.length; i++) if (g.hp[g.char[i]] < cache[i]) return true;
  return false;
});

defineScript('scr_dead', (slot) => {
  g.charmove[slot] = 0;
  g.charcantarget[slot] = 0;
  g.chardead[slot] = 1;
  g.charaction[slot] = 0;
  g.charspecial[slot] = 0;
});

defineScript('scr_revive', (slot) => {
  g.charmove[slot] = 1;
  g.charcantarget[slot] = 1;
  g.chardead[slot] = 0;
});

// scr_heal(slot, amount): returns the HP actually gained.
defineScript('scr_heal', (slot, amt) => {
  let abovemaxhp = 0, belowzero = 0;
  const t = g.char[slot];
  const curhp = g.hp[t];
  if (g.hp[t] <= 0) belowzero = 1;
  if (g.hp[t] > g.maxhp[t]) abovemaxhp = 1;
  if (abovemaxhp == 0) {
    g.hp[t] += amt;
    if (g.hp[t] > g.maxhp[t]) g.hp[t] = g.maxhp[t];
  }
  if (belowzero == 1 && g.hp[t] >= 0) {
    if (g.hp[t] < ceil(g.maxhp[t] / 6)) g.hp[t] = ceil(g.maxhp[t] / 6);
    S.scr_revive(slot);
  }
  snd_stop('snd_power');
  snd_play('snd_power');
  return g.hp[t] - curhp;
});

defineScript('scr_healall', (amt) => {
  for (let i = 0; i < 3; i++) if (g.char[i] != 0) S.scr_heal(i, amt);
});

// scr_randomtarget(): monster/bullet scope; sets caller.mytarget and marks global.targeted.
defineScript('scr_randomtarget', (inst) => {
  let abletotarget = 1;
  if (g.charcantarget[0] == 0 && g.charcantarget[1] == 0 && g.charcantarget[2] == 0) abletotarget = 0;
  inst.mytarget = choose(0, 1, 2);
  if (abletotarget == 1) {
    while (g.charcantarget[inst.mytarget] == 0) inst.mytarget = choose(0, 1, 2);
  } else inst.mytarget = 3;
  g.targeted[inst.mytarget] = 1;
});

defineScript('scr_targetall', (inst) => {
  for (let i = 0; i < 3; i++) if (g.charcantarget[i] == 1) g.targeted[i] = 1;
  inst.mytarget = 3;
  inst.target = 3;
});

// scr_gameover(): stop everything and go to the heart-break sequence.
// The room change happens at the start of the next frame (obj_time), like room_goto.
defineScript('scr_gameover', () => {
  if (G.pendingGameover) return;
  snd_free_all();
  snd_play('snd_hurt1');
  let shot = null;
  if (G.ctx) {
    shot = document.createElement('canvas');
    shot.width = G.ctx.canvas.width;
    shot.height = G.ctx.canvas.height;
    shot.getContext('2d').drawImage(G.ctx.canvas, 0, 0);
  }
  G.pendingGameover = { x: g.heartx ?? 310, y: g.hearty ?? 160, shot };
});
