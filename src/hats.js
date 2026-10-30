// Cosmetic hats for the SOUL, chosen in OPTIONS. Each hat is a small pixel map drawn in the
// game's style (dark outline, a highlight and a shadow tone); '.' is clear. The SOUL is 20 px
// wide, so hats are 14 to 22 px. `lift` raises a hat above the SOUL (for the halo).
import { G } from './runtime/gm.js?v=20261030223631';

const PALETTE = {
  K: '#000000', W: '#ffffff', w: '#b8b8b8',
  h: '#26262e', g: '#5a5a66', R: '#e8202c', r: '#8c1018',
  Y: '#ffd800', y: '#b38f00', G: '#ffc90e', L: '#fff27a', o: '#c48a00',
  P: '#8a63d2', p: '#b9a2f0', D: '#3b2f6e', d: '#241c45',
  M: '#ff4dc4', C: '#39c8ff', E: '#3ccf4e', B: '#9a6334', T: '#c98d55', b: '#5e3a1c',
  N: '#3550b5', n: '#6a86e8',
};

export const HATS = [
  { name: 'NONE' },
  { name: 'JESTER', art: [
    'YY................YY',
    'Yy................yY',
    '.KDK............KPK.',
    '.KDDK..........KPpK.',
    '..KDDK........KPpK..',
    '..KDDDKK....KKPPpK..',
    '...KDDDDKKKKPPPPK...',
    '...KdDDDDDPPPPPpK...',
    '..KdDDDDDDPPPPPPpK..',
    '.KYYYYYYYYYYYYYYYYK.',
    '.KyYyYyYyYyYyYyYyYK.',
    '..KKKKKKKKKKKKKKKK..',
  ] },
  { name: 'TOP HAT', art: [
    '...KKKKKKKKKK...',
    '...KghhhhhhhK...',
    '...KghhhhhhhK...',
    '...KghhhhhhhK...',
    '...KghhhhhhhK...',
    '...KghhhhhhhK...',
    '...KRRRRRRRRK...',
    '...KrrrrrrrrK...',
    '.KKKghhhhhhhKKK.',
    'KghhhhhhhhhhhhhK',
    '.KKKKKKKKKKKKKK.',
  ] },
  { name: 'CROWN', art: [
    '.K.....KK.....K.',
    'KLK...KLLK...KLK',
    'KGGK.KGLLGK.KGGK',
    'KGGGKGGGGGGKGGGK',
    'KGGGGGGGGGGGGGGK',
    'KGRGGGGCCGGGGRGK',
    'KGGGGGGGGGGGGGGK',
    'KooooooooooooooK',
    '.KKKKKKKKKKKKKK.',
  ] },
  { name: 'PARTY', art: [
    '......YY......',
    '.....YWWY.....',
    '......KK......',
    '.....KMMK.....',
    '.....KCCK.....',
    '....KMMMMK....',
    '....KCCCCK....',
    '...KMMMMMMK...',
    '...KCCCCCCK...',
    '..KMMMMMMMMK..',
    '..KCCCCCCCCK..',
    '.KMMMMMMMMMMK.',
    'KYYYYYYYYYYYYK',
    '.KKKKKKKKKKKK.',
  ] },
  { name: 'COWBOY', art: [
    '......KKKKKKKKKK......',
    '.....KBTBBBBBBBBK.....',
    '.....KBTBBBbBBBBK.....',
    '....KBBTBBBbBBBBBK....',
    '....KBBBBBbbBBBBBK....',
    '....KbbbbbbbbbbbbK....',
    'KBK.KBBBBBBBBBBBBK.KBK',
    'KBBKKBBBBBBBBBBBBKKBBK',
    '.KBTTBBBBBBBBBBBBBBBK.',
    '..KKKKKKKKKKKKKKKKKK..',
  ] },
  { name: 'BEANIE', art: [
    '.......WW.......',
    '......WWwW......',
    '.......KK.......',
    '.....KKNNKK.....',
    '....KnNNNNNK....',
    '...KnNNNNNNNK...',
    '..KnNNNNNNNNNK..',
    '..KNNNNNNNNNNK..',
    '.KWNWNWNWNWNWNK.',
    '.KNWNWNWNWNWNWK.',
    '..KKKKKKKKKKKK..',
  ] },
  { name: 'PROPELLER', art: [
    '.KKKKK..KK..KKKKK.',
    'KRRRRRKKYYKKCCCCCK',
    '.KKKKK.KYYK.KKKKK.',
    '........KK........',
    '.....KKKKKKKK.....',
    '....KRRRRCCCCK....',
    '...KRRRRRCCCCCK...',
    '..KRRRRRRCCCCCCK..',
    '..KEEEEEEYYYYYYK..',
    '...KKKKKKKKKKKK...',
  ] },
  { name: 'WITCH', art: [
    '..........KK......',
    '.........KPPK.....',
    '........KPPK......',
    '.......KpPPK......',
    '......KpPPPK......',
    '......KpPPPPK.....',
    '.....KpPPPPPK.....',
    '.....KEEEEEEK.....',
    '....KpPPPPPPPK....',
    'KKKKKPPPPPPPPKKKKK',
    'KpPPPPPPPPPPPPPPDK',
    '.KKKKKKKKKKKKKKKK.',
  ] },
  { name: 'HALO', lift: 5, art: [
    '...KKKKKKKK...',
    '.KKLLLLLLLLKK.',
    'KLYKKKKKKKKYLK',
    '.KKYYYYYYYYKK.',
    '...KKKKKKKK...',
  ] },
];

const cache = {};
function hatCanvas(hat) {
  if (!hat.art) return null;
  if (!cache[hat.name]) {
    const c = document.createElement('canvas');
    c.width = Math.max(...hat.art.map(r => r.length));
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
  const sink = hat.lift ? -hat.lift : 3; // how far the hat comes down over the SOUL
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(img, Math.round(cx - (img.width * scale) / 2), Math.round(top - (img.height - sink) * scale),
    img.width * scale, img.height * scale);
  ctx.restore();
}

// For the 20x20 dodging SOUL sprites (origin at the top-left corner).
export function drawSoulHat(inst) {
  drawHat(inst.x + 10, inst.y, 1, currentHat(), inst.image_alpha ?? 1);
}
