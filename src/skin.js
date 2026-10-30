// Custom Jevil skin: the player picks an image from their own device and Jevil is drawn with
// it. The image is only kept in this browser (localStorage); it is never uploaded anywhere.
import { G, spriteSkins, getSprite } from './runtime/gm.js';
import { saveSettings } from './settings.js';

const KEY = 'jevil-sim-skin';
const MAX_SIZE = 256;
// Every sprite that shows Jevil himself. When he is hit his head pops out on a spring
// (spr_jokerhead over spr_jokerbody); with a skin the picture bounces and the body is hidden.
const JEVIL_SPRITES = ['spr_joker_main', 'spr_joker_dance', 'spr_joker_dance_reverse', 'spr_joker_teleport',
  'spr_joker_teleport_r', 'spr_joker_tired', 'spr_joker_scythebody', 'spr_jokerhead'];
const HIDDEN_SPRITES = ['spr_jokerbody'];

let image = null;
let skinId = 0;

export const hasSkinImage = () => !!image;
export const skinOn = () => G.settings?.skin === 'CUSTOM' && !!image;

// The picture fitted inside a sprite's box (centred, standing on the bottom edge), drawn at
// 4x so it keeps detail when the game scales Jevil up.
function fitted(spr) {
  const S = 4;
  const c = document.createElement('canvas');
  c.width = spr.w * S;
  c.height = spr.h * S;
  const x = c.getContext('2d');
  const k = Math.min(c.width / image.width, c.height / image.height);
  const w = Math.round(image.width * k), h = Math.round(image.height * k);
  x.drawImage(image, Math.round((c.width - w) / 2), c.height - h, w, h);
  return { img: c, w: spr.w, h: spr.h, sw: c.width, sh: c.height, ox: spr.ox, oy: spr.oy, n: 1, skinId };
}

export function applySkin() {
  spriteSkins.clear();
  if (!skinOn()) return;
  skinId += 1;
  for (const name of JEVIL_SPRITES) {
    const spr = getSprite(name);
    if (spr) spriteSkins.set(name, fitted(spr));
  }
  const blank = document.createElement('canvas');
  for (const name of HIDDEN_SPRITES) {
    const spr = getSprite(name);
    if (spr) spriteSkins.set(name, { img: blank, w: spr.w, h: spr.h, sw: 1, sh: 1, ox: spr.ox, oy: spr.oy, n: 1, skinId });
  }
}

function useImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Called after the assets are loaded.
export async function loadSkin() {
  let url = null;
  try { url = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  if (!url) return;
  try {
    image = await useImage(url);
    applySkin();
  } catch (e) {
    console.warn('saved skin could not be read', e);
  }
}

// Opens the device's file picker (needs a recent key press, click or tap).
export function chooseSkinImage(onDone = () => {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const original = await useImage(URL.createObjectURL(file)).catch(() => null);
    if (!original) return onDone(false);
    // Shrunk to at most 256 px so it fits in browser storage.
    const k = Math.min(1, MAX_SIZE / Math.max(original.width, original.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(original.width * k));
    c.height = Math.max(1, Math.round(original.height * k));
    c.getContext('2d').drawImage(original, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/png');
    try { localStorage.setItem(KEY, url); } catch (e) { /* kept for this visit only */ }
    image = await useImage(url);
    G.settings.skin = 'CUSTOM';
    saveSettings();
    applySkin();
    onDone(true);
  };
  input.click();
}

export function setSkinEnabled(on) {
  G.settings.skin = on ? 'CUSTOM' : 'DEFAULT';
  saveSettings();
  applySkin();
}
