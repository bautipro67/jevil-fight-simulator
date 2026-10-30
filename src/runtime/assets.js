// Loads the pre-extracted assets (see tools/extract_assets.py) into memory.

export const assets = { sprites: {}, fonts: {}, sounds: {}, soundData: {}, text: {}, music: {} };

const BASE = new URL('../../assets/', import.meta.url).href;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load ' + url));
    img.src = url;
  });
}

async function json(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error('failed to load ' + path);
  return r.json();
}

async function bytes(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error('failed to load ' + path);
  return r.arrayBuffer();
}

export const MUSIC_FILES = ['joker.ogg', 'AUDIO_DEFEAT.ogg', 'prejoker.ogg'];

export async function loadAssets(onProgress = () => {}) {
  const [sprites, fonts, sounds, text] = await Promise.all([
    json('sprites.json'), json('fonts.json'), json('sounds.json'), json('text/en.json'),
  ]);
  assets.text = text;
  const jobs = [];
  for (const [name, s] of Object.entries(sprites)) {
    s.name = name;
    assets.sprites[name] = s;
    jobs.push(() => loadImage(BASE + 'sprites/' + name + '.png').then(img => { s.img = img; }));
  }
  for (const [name, f] of Object.entries(fonts)) {
    f.name = name;
    f.type = 'atlas';
    assets.fonts[name] = f;
    jobs.push(() => loadImage(BASE + 'fonts/' + name + '.png').then(img => { f.img = img; }));
  }
  for (const [name, s] of Object.entries(sounds)) {
    assets.sounds[name] = s;
    jobs.push(() => bytes('sounds/' + s.file).then(b => { assets.soundData[name] = b; }));
  }
  for (const m of MUSIC_FILES) {
    jobs.push(() => bytes('music/' + m).then(b => { assets.music[m] = b; }));
  }
  let done = 0;
  const total = jobs.length;
  const queue = jobs.slice();
  async function worker() {
    while (queue.length) {
      await queue.shift()();
      onProgress(++done / total);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
}

// Collision mask (alpha > 0) for one frame of a sprite, computed on first use.
export function spriteMask(spr, frame) {
  if (!spr.masks) {
    const c = document.createElement('canvas');
    c.width = spr.img.width;
    c.height = spr.img.height;
    const cx = c.getContext('2d');
    cx.drawImage(spr.img, 0, 0);
    const data = cx.getImageData(0, 0, c.width, c.height).data;
    spr.masks = [];
    for (let f = 0; f < Math.max(1, spr.n); f++) {
      const m = new Uint8Array(spr.w * spr.h);
      for (let y = 0; y < spr.h; y++) {
        for (let x = 0; x < spr.w; x++) m[y * spr.w + x] = data[(y * c.width + f * spr.w + x) * 4 + 3] > 0 ? 1 : 0;
      }
      spr.masks.push(m);
    }
  }
  return spr.masks[frame] || spr.masks[0];
}
