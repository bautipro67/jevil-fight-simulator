// EQUIPMENT screen: pick each party member's weapon and two armors (only what they can use in
// Chapter 1) and the items brought into the fight. Saved with the loadout (src/battle/equipment.js).
import {
  Instance, defineObject, instance_create, instance_destroy, up_p, down_p, left_p, right_p,
  button1_p, button2_p, draw_set_font, draw_set_color, draw_set_halign, draw_text, draw_sprite_ext,
  fa_left, fa_center,
} from '../runtime/gm.js?v=20261031024711';
import { snd_play } from '../runtime/audio.js?v=20261031024711';
import {
  WEAPONS, ARMORS, ITEMS, ITEM_SLOTS, CHAR_NAMES, getLoadout, saveLoadout, resetLoadout,
  weaponChoices, armorChoices, itemChoices, charStats,
} from '../battle/equipment.js?v=20261031024711';

const HEADS = { 1: 'spr_headkris', 2: 'spr_headsusie', 3: 'spr_headralsei' };
const cycle = (list, cur, dir) => list[(list.indexOf(cur) + dir + list.length) % list.length];

class EquipmentMenu extends Instance {
  create() {
    this.depth = -20;
    this.page = 'party';
    this.cur = 0;
    this.char = 1;
    this.cooldown = 3;
    this.onClose = null;
    this.msg = '';
  }
  rows() {
    if (this.page === 'items') return ITEM_SLOTS + 1;
    return 7; // character, weapon, armor, armor, items, reset, back
  }
  // Changes the value under the cursor by dir (+1 / -1). Returns false if the row has no value.
  change(dir) {
    const lo = getLoadout();
    if (this.page === 'items') {
      if (this.cur >= ITEM_SLOTS) return false;
      lo.items[this.cur] = cycle(itemChoices(), lo.items[this.cur], dir);
    } else if (this.cur === 0) {
      this.char = ((this.char - 1 + dir + 3) % 3) + 1;
    } else if (this.cur === 1) {
      lo.gear[this.char][0] = cycle(weaponChoices(this.char), lo.gear[this.char][0], dir);
    } else if (this.cur === 2 || this.cur === 3) {
      const slot = this.cur - 1;
      lo.gear[this.char][slot] = cycle(armorChoices(this.char), lo.gear[this.char][slot], dir);
    } else return false;
    saveLoadout();
    this.msg = '';
    snd_play('snd_select');
    return true;
  }
  step() {
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return;
    }
    const n = this.rows();
    if (down_p()) { this.cur = (this.cur + 1) % n; snd_play('snd_menumove'); }
    if (up_p()) { this.cur = (this.cur + n - 1) % n; snd_play('snd_menumove'); }
    if (left_p()) this.change(-1);
    if (right_p()) this.change(1);
    if (button1_p()) {
      if (this.change(1)) return;
      snd_play('snd_select');
      if (this.page === 'items') return this.back();
      if (this.cur === 4) { this.page = 'items'; this.cur = 0; this.cooldown = 2; return; }
      if (this.cur === 5) { resetLoadout(); this.msg = 'DEFAULT EQUIPMENT RESTORED'; return; }
      if (this.cur === 6) return this.close();
    } else if (button2_p()) this.back();
  }
  back() {
    snd_play('snd_menumove');
    if (this.page === 'items') {
      this.page = 'party';
      this.cur = 4;
      this.cooldown = 2;
      return;
    }
    this.close();
  }
  close() {
    instance_destroy(this);
    if (this.onClose) this.onClose();
  }
  draw() {
    if (this.page === 'items') return this.drawItems();
    const lo = getLoadout();
    // The three party members with their totals.
    draw_set_halign(fa_center);
    [1, 2, 3].forEach((c, i) => {
      const cx = 140 + i * 180;
      const sel = c === this.char;
      draw_sprite_ext(HEADS[c], 0, cx - 34, 70, 2, 2, 0, sel ? 0xffffff : 0x808080, 1);
      draw_set_font('fnt_mainbig');
      draw_set_color(sel ? 0xffff00 : 0x808080);
      draw_text(cx, 122, CHAR_NAMES[c]);
      const [hp, at, df, mag] = charStats(c);
      draw_set_font('fnt_main');
      draw_set_color(sel ? 0xffffff : 0x808080);
      draw_text(cx, 152, `HP ${hp}  AT ${at}  DF ${df}  MAG ${mag}`);
    });
    const [w, a1, a2] = lo.gear[this.char];
    const filled = lo.items.filter(id => id).length;
    const labels = [
      `CHARACTER: < ${CHAR_NAMES[this.char]} >`,
      `WEAPON: < ${WEAPONS[w][0]} >`,
      `ARMOR: < ${ARMORS[a1][0]} >`,
      `ARMOR: < ${ARMORS[a2][0]} >`,
      `ITEMS (${filled}/${ITEM_SLOTS})`,
      'RESET TO DEFAULT',
      'BACK',
    ];
    this.drawList(labels, 110, 190, 34);
    // What the highlighted gear does.
    let info = this.msg;
    if (!info && this.cur === 1) info = describe(WEAPONS[w]);
    if (!info && (this.cur === 2 || this.cur === 3)) info = describe(ARMORS[this.cur === 2 ? a1 : a2]);
    if (!info && this.cur === 0) info = 'LEFT / RIGHT: CHANGE CHARACTER';
    draw_set_font('fnt_main');
    draw_set_halign(fa_center);
    draw_set_color(0x808080);
    draw_text(320, 432, info || 'LEFT / RIGHT OR CONFIRM: CHANGE    CANCEL: BACK');
    draw_set_halign(fa_left);
  }
  drawItems() {
    const lo = getLoadout();
    const labels = lo.items.map(id => `< ${ITEMS[id][0]} >`);
    draw_set_font('fnt_mainbig');
    for (let i = 0; i < ITEM_SLOTS; i++) {
      const x = i < 6 ? 60 : 340, y = 90 + (i % 6) * 40;
      draw_set_color(i === this.cur ? 0xffff00 : lo.items[i] ? 0xffffff : 0x808080);
      draw_text(x + 30, y, labels[i]);
      if (i === this.cur) draw_sprite_ext('spr_heart', 0, x + 4, y + 10, 1, 1, 0, 0xffffff, 1);
    }
    draw_set_color(this.cur === ITEM_SLOTS ? 0xffff00 : 0xffffff);
    draw_text(90, 340, 'BACK');
    if (this.cur === ITEM_SLOTS) draw_sprite_ext('spr_heart', 0, 64, 350, 1, 1, 0, 0xffffff, 1);
    draw_set_font('fnt_main');
    draw_set_halign(fa_center);
    draw_set_color(0x808080);
    const id = lo.items[this.cur];
    draw_text(320, 400, this.cur < ITEM_SLOTS && id ? ITEMS[id][1].toUpperCase() : '');
    draw_text(320, 432, 'LEFT / RIGHT OR CONFIRM: CHANGE ITEM    CANCEL: BACK');
    draw_set_halign(fa_left);
  }
  drawList(labels, x, y, gap) {
    draw_set_font('fnt_mainbig');
    draw_set_halign(fa_left);
    labels.forEach((label, i) => {
      draw_set_color(i === this.cur ? 0xffff00 : 0xffffff);
      draw_text(x, y + i * gap, label);
    });
    draw_sprite_ext('spr_heart', 0, x - 28, y + 10 + this.cur * gap, 1, 1, 0, 0xffffff, 1);
  }
}
defineObject('obj_sim_equipment', EquipmentMenu);

function describe(entry) {
  const [, at, df, mag, , ability] = entry;
  const parts = [];
  if (at) parts.push(`AT +${at}`);
  if (df) parts.push(`DF +${df}`);
  if (mag) parts.push(`MAG +${mag}`);
  if (ability) parts.push(ability.toUpperCase());
  return parts.join('   ') || 'NO BONUS';
}

export function openEquipment(onClose) {
  const m = instance_create(0, 0, 'obj_sim_equipment');
  m.onClose = onClose;
  return m;
}
