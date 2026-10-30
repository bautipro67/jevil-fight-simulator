// Cosmetic hats for the SOUL, chosen in OPTIONS. Each hat is a small pixel map; '.' is clear.
import { G } from './runtime/gm.js';

const PALETTE = {
  K: '#000000', W: '#ffffff', w: '#a8a8a8', g: '#505050', R: '#ff2020', Y: '#ffff00',
  G: '#ffc90e', P: '#8a63d2', D: '#3b2f6e', M: '#ff4dc4', C: '#2ec4ff', B: '#9a6334',
  b: '#5e3a1c', N: '#3550b5', L: '#b5e61d',
};

export const HATS = [
  { name: 'NONE' },
  { name: 'JESTER', art: [
    'Y............Y',
    'DD..........PP',
    '.DD........PP.',
    '..DDD....PPP..',
    '...DDDDPPPP...',
    '..DDDDDPPPPP..',
    '.YYYYYYYYYYYY.',
  ] },
  { name: 'TOP HAT', art: [
    '..gggggggg..',
    '..gwgggggg..',
    '..gwgggggg..',
    '..gggggggg..',
    '..RRRRRRRR..',
    'gggggggggggg',
  ] },
  { name: 'CROWN', art: [
    'G....G....G',
    'GG..GGG..GG',
    'GGGGGGGGGGG',
    'GRGGGCGGGRG',
    'GGGGGGGGGGG',
  ] },
  { name: 'PARTY', art: [
    '....Y....',
    '....M....',
    '...MCM...',
    '...CMC...',
    '..MCMCM..',
    '..CMCMC..',
    '.MCMCMCM.',
    'YYYYYYYYY',
  ] },
  { name: 'COWBOY', art: [
    '.....BBBBBB.....',
    '....BBBBBBBB....',
    '....BBbBBbBB....',
    '....bbbbbbbb....',
    'BB..BBBBBBBB..BB',
    '.BBBBBBBBBBBBBB.',
  ] },
  { name: 'BEANIE', art: [
    '.....WW.....',
    '....WWWW....',
    '...NNNNNN...',
    '..NNNNNNNN..',
    '.NNNNNNNNNN.',
    '.WNWNWNWNWN.',
  ] },
  { name: 'PROPELLER', art: [
    'RRRR.Y.CCCC',
    '.....Y.....',
    '...RRYCC...',
    '..RRRYCCC..',
    '.RRRRYCCCC.',
    'LLLLLLLLLLL',
  ] },
];

const cache = {};
function hatCanvas(hat) {
  if (!hat.art) return null;
  if (!cache[hat.name]) {
    const c = document.createElement('canvas');
    c.width = hat.art[0].length;
    c.height = hat.art.length;
    const x = c.getContext('2d');
    hat.art.forEach((row, y) => [...row].forEach((ch, i) => {
      if (PALETTE[ch]) {
        x.fillStyle = PALETTE[ch];
        x.fillRect(i, y, 1, 1);
      }
    }));
    cache[hat.name] = c;
  }
  return cache[hat.name];
}

export const currentHat = () => HATS.find(h => h.name === G.settings?.hat) || HATS[0];

// Draws the hat sitting on a SOUL whose top centre is (cx, top), at the given scale.
export function drawHat(cx, top, scale = 1, hat = currentHat(), alpha = 1) {
  const img = hatCanvas(hat);
  if (!img || alpha <= 0) return;
  const ctx = G.ctx;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(img, Math.round(cx - (img.width * scale) / 2), Math.round(top - (img.height - 3) * scale),
    img.width * scale, img.height * scale);
  ctx.restore();
}

// For the 20x20 dodging SOUL sprites (origin at the top-left corner).
export function drawSoulHat(inst) {
  drawHat(inst.x + 10, inst.y, 1, currentHat(), inst.image_alpha ?? 1);
}
