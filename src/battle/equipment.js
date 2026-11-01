// Chapter 1 equipment and items (from scr_weaponinfo / scr_armorinfo / scr_iteminfo) and the
// player's chosen loadout, remembered in the browser. The EQUIPMENT screen edits it and
// init_battle_globals applies it to every fight and practice run.

// id -> [name, at, df, mag, who can use it (char ids: 1 Kris, 2 Susie, 3 Ralsei), ability]
export const WEAPONS = {
  1: ['Wood Blade', 0, 0, 0, [1], ''],
  2: ['Mane Ax', 0, 0, 0, [2], ''],
  3: ['Red Scarf', 0, 0, 0, [3], ''],
  4: ['EverybodyWeapon', 12, 6, 8, [1, 2, 3], ''],
  5: ['Spookysword', 2, 0, 0, [1], 'Spookiness UP'],
  6: ['Brave Ax', 2, 0, 0, [2], 'Guts Up'],
  7: ['Devilsknife', 5, 0, 4, [2], 'Buster TP DOWN'],
  8: ['Trefoil', 4, 0, 0, [1], 'Money Earned UP'],
  9: ['Ragger', 2, 0, 0, [3], ''],
  10: ['DaintyScarf', 0, 0, 2, [3], 'Fluffiness UP'],
};
// Unlocked with the code TOO HARD (the Codes box on the page). Anyone can use it, but only one
// party member can hold it at a time.
export const CODE_WEAPON = 99;
WEAPONS[CODE_WEAPON] = ['TooHardSword', 40, 10, 20, [1, 2, 3], 'Too hard! One holder at a time'];
export const ARMORS = {
  0: ['(none)', 0, 0, 0, [1, 2, 3], ''],
  1: ['Amber Card', 0, 1, 0, [1, 2, 3], ''],
  2: ['Dice Brace', 0, 2, 0, [1, 2, 3], ''],
  3: ['Pink Ribbon', 0, 1, 0, [1, 3], 'TP Range'],
  4: ['White Ribbon', 0, 2, 0, [1, 3], 'Cuteness'],
  5: ['IronShackle', 1, 2, 0, [1, 2, 3], ''],
  6: ['MouseToken', 0, 0, 2, [1, 2, 3], ''],
  7: ['Jevilstail', 2, 2, 2, [1, 2, 3], ''],
};
// Items usable in battle: id -> [name, effect]
export const ITEMS = {
  0: ['(empty)', ''],
  1: ['Dark Candy', 'Heals 40 HP'],
  2: ['ReviveMint', 'Heals a downed ally'],
  5: ['BrokenCake', 'Heals 20 HP'],
  6: ['Top Cake', 'Heals team 160 HP'],
  7: ['Spincake', 'Heals team 80 HP'],
  8: ['Darkburger', 'Heals 70 HP'],
  9: ['LancerCookie', 'Heals 50 HP'],
  10: ['GigaSalad', 'Heals 4 HP'],
  11: ['ClubsSandwich', 'Heals team 30 HP'],
  12: ['HeartsDonut', 'Healing varies'],
  13: ['ChocDiamond', 'Healing varies'],
  14: ['Favwich', 'Heals ALL HP'],
  15: ['RouxlsRoux', 'Heals 50 HP'],
};
export const ITEM_SLOTS = 12;
export const CHAR_NAMES = { 1: 'KRIS', 2: 'SUSIE', 3: 'RALSEI' };
// Base stats at Card Castle: [hp, at, df, mag]
export const BASE_STATS = { 1: [90, 10, 2, 0], 2: [110, 14, 2, 1], 3: [70, 8, 2, 7] };

// What the party has on the "??????" floor: Spookysword / Brave Ax / Ragger, Amber Card,
// Dice Brace, IronShackle, White Ribbon; and a handful of Chapter 1 consumables.
export const DEFAULT_LOADOUT = {
  gear: { 1: [5, 5, 1], 2: [6, 1, 2], 3: [9, 4, 1] },
  items: [6, 2, 2, 11, 12, 13, 8, 1, 0, 0, 0, 0],
};

const KEY = 'jevil-sim-loadout';
const clone = l => ({ gear: { 1: [...l.gear[1]], 2: [...l.gear[2]], 3: [...l.gear[3]] }, items: [...l.items] });
let loadout = null;

const usable = (table, id, c) => table[id] && table[id][4].includes(c);

const CODES_KEY = 'jevil-sim-codes';
let codes = null;
function unlockedCodes() {
  if (!codes) {
    try { codes = JSON.parse(localStorage.getItem(CODES_KEY) || '[]'); } catch (e) { codes = []; }
    if (!Array.isArray(codes)) codes = [];
  }
  return codes;
}
export const weaponUnlocked = id => id !== CODE_WEAPON || unlockedCodes().includes('TOOHARD');

// A code typed in the page's Codes box: { ok, msg } for the message under it.
export function redeemCode(text) {
  const code = String(text || '').toUpperCase().replace(/\s+/g, '');
  if (code !== 'TOOHARD') return { ok: false, msg: 'That code does nothing.' };
  if (!unlockedCodes().includes(code)) {
    codes.push(code);
    try { localStorage.setItem(CODES_KEY, JSON.stringify(codes)); } catch (e) { /* not saved */ }
  }
  return { ok: true, msg: 'TooHardSword unlocked! Equip it in EQUIPMENT on the title screen (one character at a time).' };
}

export function getLoadout() {
  if (!loadout) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* storage unavailable */ }
    loadout = clone(DEFAULT_LOADOUT);
    if (saved?.gear) {
      for (const c of [1, 2, 3]) {
        const [w, a1, a2] = saved.gear[c] || [];
        if (usable(WEAPONS, w, c) && weaponUnlocked(w)) loadout.gear[c][0] = w;
        if (usable(ARMORS, a1, c)) loadout.gear[c][1] = a1;
        if (usable(ARMORS, a2, c)) loadout.gear[c][2] = a2;
      }
    }
    let holder = false;
    for (const c of [1, 2, 3]) {
      if (loadout.gear[c][0] !== CODE_WEAPON) continue;
      if (holder) loadout.gear[c][0] = DEFAULT_LOADOUT.gear[c][0];
      holder = true;
    }
    if (Array.isArray(saved?.items)) {
      loadout.items = Array.from({ length: ITEM_SLOTS }, (_, i) => (ITEMS[saved.items[i]] ? saved.items[i] : 0));
    }
  }
  return loadout;
}

export function saveLoadout() {
  try { localStorage.setItem(KEY, JSON.stringify(loadout)); } catch (e) { /* not saved */ }
}

export function resetLoadout() {
  loadout = clone(DEFAULT_LOADOUT);
  saveLoadout();
}

// Options for a slot: the weapons or armors that character can use, or the items.
export const weaponChoices = c => Object.keys(WEAPONS).map(Number).filter(id => usable(WEAPONS, id, c) && weaponUnlocked(id)
  && !(id === CODE_WEAPON && [1, 2, 3].some(o => o !== c && getLoadout().gear[o][0] === id)));
export const armorChoices = c => Object.keys(ARMORS).map(Number).filter(id => usable(ARMORS, id, c));
export const itemChoices = () => Object.keys(ITEMS).map(Number);

// Total stats of a character with the current loadout: [hp, at, df, mag]
export function charStats(c) {
  const [hp, at, df, mag] = BASE_STATS[c];
  const [w, a1, a2] = getLoadout().gear[c];
  const parts = [WEAPONS[w], ARMORS[a1], ARMORS[a2]];
  return [hp, at + parts.reduce((s, p) => s + p[1], 0), df + parts.reduce((s, p) => s + p[2], 0), mag + parts.reduce((s, p) => s + p[3], 0)];
}
