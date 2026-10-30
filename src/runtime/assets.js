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

export const MUSIC_FILES = ['prejoker.ogg', 'joker.ogg', 'AUDIO_DEFEAT.ogg'];

// Graphics and text block startup; audio (see loadAudioInBackground) does not.
export async function loadAssets(onProgress = () => {}) {
  const [sprites, fonts, sounds, text] = await Promise.all([
    json('sprites.json'), json('fonts.json'), json('sounds.json'), json('text/en.json'),
  ]);
  assets.text = text;
  assets.sounds = sounds;
  const pageIds = [...new Set(Object.values(sprites).map(s => s.p))];
  const jobs = [
    ...pageIds.map(p => loadImage(BASE + 'atlas' + p + '.png').then(img => [p, img])),
    ...Object.entries(fonts).map(([name, f]) => loadImage(BASE + 'fonts/' + name + '.png').then(img => {
      f.name = name;
      f.type = 'atlas';
      f.img = img;
      assets.fonts[name] = f;
    })),
  ];
  let done = 0;
  jobs.forEach(j => j.then(() => onProgress(++done / jobs.length)));
  const pages = Object.fromEntries((await Promise.all(jobs)).filter(Array.isArray));
  // Each sprite gets its own frame strip so drawing and tinting work per sprite.
  for (const [name, s] of Object.entries(sprites)) {
    s.name = name;
    const c = document.createElement('canvas');
    c.width = s.w * Math.max(1, s.n);
    c.height = s.h;
    c.getContext('2d').drawImage(pages[s.p], s.x, s.y, c.width, c.height, 0, 0, c.width, c.height);
    s.img = c;
    assets.sprites[name] = s;
  }
}

// Sound effects (one bundle) and music files, fetched after the game has started.
export const audioReady = { sounds: Promise.resolve(), music: {} };
export function loadAudioInBackground() {
  audioReady.sounds = bytes('sounds.bin').then(buf => {
    for (const [name, s] of Object.entries(assets.sounds)) assets.soundData[name] = buf.slice(s.o, s.o + s.l);
  });
  for (const m of MUSIC_FILES) {
    audioReady.music[m] = bytes('music/' + m).then(b => { assets.music[m] = b; return b; });
  }
  audioReady.sounds.catch(e => console.warn(e));
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
