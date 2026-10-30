// Screen borders like DELTARUNE's: a 16:9 frame with the 4:3 game in the middle (the game
// takes 1440x1080 of 1920x1080). The PC data files ship the border sprites without their
// images, so these are drawn here: SIMPLE (a thin line) and CARD CASTLE (drifting card suits).
// To use real border art instead, put a 1920x1080 PNG (transparent in the middle) in
// assets/borders/ and list its file name in assets/borders/borders.json, e.g.
// ["card_castle.png"] replaces the CARD CASTLE style.
import { G } from './runtime/gm.js';
import { assets } from './runtime/assets.js';

const W = 960, H = 540;          // border canvas, half of 1920x1080
const GX = 120, GW = 720;        // game area inside it
const canvas = document.getElementById('border');
const ctx = canvas?.getContext('2d');
if (ctx) ctx.imageSmoothingEnabled = false;

const BORDER_DIR = new URL('../assets/borders/', import.meta.url).href;
const custom = {};               // file name -> Image once loaded
fetch(BORDER_DIR + 'borders.json').then(r => (r.ok ? r.json() : [])).then(files => {
  for (const f of files) {
    const img = new Image();
    img.onload = () => { custom[f] = img; drawn = null; };
    img.src = BORDER_DIR + f;
  }
}).catch(() => {});
const customImage = style => custom[style.toLowerCase().replace(/ /g, '_') + '.png'] || null;

// Whether a border shows right now: it needs a wide enough window (not on portrait phones).
export function borderActive(availW, availH) {
  return !!canvas && G.settings?.border && G.settings.border !== 'OFF' && availW / availH >= 1.45;
}

// The bullet sprites point right; quarter turns stand them up like the suits on a card.
const SUITS = [
  ['spr_spadebullet', '#b9a8ff', -1], ['spr_heartbullet', '#ff4a6e', 0],
  ['spr_clubsbullet', '#b9a8ff', -1], ['spr_diamondbullet', '#ff4a6e', 1],
];
const silhouettes = {};
function silhouette(name, color, turn) {
  const key = name + color;
  if (!silhouettes[key]) {
    const spr = assets.sprites[name];
    if (!spr?.img) return null;
    const c = document.createElement('canvas');
    c.width = turn ? spr.h : spr.w;
    c.height = turn ? spr.w : spr.h;
    const x = c.getContext('2d');
    x.translate(c.width / 2, c.height / 2);
    x.rotate(turn * Math.PI / 2);
    x.drawImage(spr.img, 0, 0, spr.w, spr.h, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, spr.w, spr.h);
    silhouettes[key] = c;
  }
  return silhouettes[key];
}

function frameLine(color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(GX - width / 2 - 2, -10, GW + width + 4, H + 20);
}

function drawSimple() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  frameLine('#5a5a5a', 2);
}

function drawCardCastle(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16062a');
  g.addColorStop(1, '#05010c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Two columns of card suits on each side, drifting upward and gently pulsing.
  const step = 64;
  const span = Math.ceil(H / step + 1) * step;
  const scroll = (t * 0.35) % span;
  for (const [x0, flip] of [[0, 0], [GX + GW, 1]]) {
    for (let col = 0; col < 2; col++) {
      const cx = x0 + 32 + col * 56;
      for (let row = 0; row * step < span; row++) {
        const [name, color, turn] = SUITS[(row + col * 2 + flip) % 4];
        const img = silhouette(name, color, turn);
        if (!img) continue;
        const y = (((row * step + (col ? step / 2 : 0) - scroll) % span) + span) % span - step / 2;
        const size = 26; // every suit drawn at the same size
        const k = size / Math.max(img.width, img.height);
        ctx.globalAlpha = 0.3 + 0.2 * Math.sin(t / 40 + row + col * 2);
        ctx.drawImage(img, Math.round(cx - img.width * k / 2), Math.round(y), Math.round(img.width * k), Math.round(img.height * k));
      }
    }
  }
  ctx.globalAlpha = 1;
  // Card Castle floor: a red and black checkerboard at the bottom of each side.
  const cs = 12;
  for (const x0 of [0, GX + GW]) {
    for (let y = H - cs * 5; y < H; y += cs) {
      for (let x = x0; x < x0 + GX; x += cs) {
        const odd = ((x - x0) / cs + (y - (H - cs * 5)) / cs) % 2;
        ctx.fillStyle = odd ? '#7a0f24' : '#0b0207';
        ctx.fillRect(x, y, cs, cs);
      }
    }
  }
  const fade = ctx.createLinearGradient(0, H - cs * 5, 0, H - cs * 2);
  fade.addColorStop(0, 'rgba(10,2,20,1)');
  fade.addColorStop(1, 'rgba(10,2,20,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, H - cs * 5, GX, cs * 3);
  ctx.fillRect(GX + GW, H - cs * 5, GX, cs * 3);
  frameLine('#c9a640', 3);
  frameLine('#000', 1);
}

let drawn = null;
let t = 0;
// Called once per game frame; the animated style redraws at 15 fps.
export function drawBorder() {
  if (!ctx || canvas.hidden) return;
  const style = G.settings?.border || 'OFF';
  t += 1;
  const img = customImage(style);
  if (img) {
    if (drawn !== 'custom:' + style) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      drawn = 'custom:' + style;
    }
    return;
  }
  if (style === 'SIMPLE') {
    if (drawn !== style) drawSimple();
    drawn = style;
  } else if (style === 'CARD CASTLE') {
    if (t % 2 === 0 || drawn !== style) drawCardCastle(t);
    drawn = style;
  }
}
