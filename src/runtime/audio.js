// WebAudio playback with the Deltarune snd_* / mus_* wrapper semantics.
import { assets, audioReady } from './assets.js?v=20261030222208';

let ctx = null;
let master = null;
const buffers = {};
const playing = new Map(); // sound name -> Set of voices

export function audioInit() {
  if (ctx) return ctx.resume();
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.connect(ctx.destination);
  return ctx.resume();
}

// 'suspended' until the first key press, click or tap ('none' before audioInit).
export const audioState = () => (ctx ? ctx.state : 'none');

export function setMasterVolume(v) {
  if (master) master.gain.value = v;
}

// Music keys ('mus:<file>') wait for their download; sound effects are only played once loaded.
function dataFor(key) {
  if (key.startsWith('mus:')) return audioReady.music[key.slice(4)] ?? Promise.reject(new Error('unknown music ' + key));
  return Promise.resolve(assets.soundData[key]);
}

function decode(key) {
  if (!buffers[key]) buffers[key] = dataFor(key).then(d => ctx.decodeAudioData(d.slice(0)));
  return buffers[key];
}

// Decodes everything as it arrives so the first play of each sound is not late.
export async function audioPreload() {
  await audioReady.sounds;
  await Promise.all([
    ...Object.keys(assets.soundData).map(k => decode(k)),
    ...Object.keys(audioReady.music).map(m => decode('mus:' + m)),
  ]);
}

class Voice {
  constructor(key, loop, volume, pitch) {
    this.key = key;
    this.gain = ctx.createGain();
    this.gain.gain.value = volume;
    this.gain.connect(master);
    this.src = null;
    this.stopped = false;
    this.pitch = pitch;
    decode(key).then(buf => {
      if (this.stopped) return;
      this.src = ctx.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = loop;
      this.src.playbackRate.value = this.pitch;
      this.src.connect(this.gain);
      this.src.onended = () => this.cleanup();
      this.src.start();
    }).catch(e => console.warn(e));
    if (!playing.has(key)) playing.set(key, new Set());
    playing.get(key).add(this);
  }
  stop() {
    this.stopped = true;
    if (this.src) try { this.src.stop(); } catch (e) { /* already stopped */ }
    this.cleanup();
  }
  cleanup() {
    playing.get(this.key)?.delete(this);
  }
  setVolume(v, frames = 0) {
    const g = this.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    if (frames > 0) {
      g.setValueAtTime(g.value, ctx.currentTime);
      g.linearRampToValueAtTime(v, ctx.currentTime + frames / 30);
    } else g.value = v;
  }
  setPitch(p) {
    this.pitch = p;
    if (this.src) this.src.playbackRate.value = p;
  }
}

function soundVolume(name) {
  return assets.sounds[name]?.volume ?? 1;
}

// snd_play(sound): fire-and-forget sound effect; returns a voice handle.
export function snd_play(name) {
  if (!ctx || !name) return null;
  if (!assets.soundData[name]) {
    if (!assets.sounds[name]) console.warn('missing sound', name);
    return null; // not downloaded yet
  }
  return new Voice(name, false, soundVolume(name), 1);
}

export function snd_loop(name) {
  if (!ctx || !assets.soundData[name]) return null;
  return new Voice(name, true, soundVolume(name), 1);
}

export function snd_stop(nameOrVoice) {
  if (!nameOrVoice) return;
  if (nameOrVoice instanceof Voice) return nameOrVoice.stop();
  for (const v of [...(playing.get(nameOrVoice) || [])]) v.stop();
}

export function snd_is_playing(name) {
  return (playing.get(name)?.size || 0) > 0;
}

export function snd_volume(nameOrVoice, vol, frames = 0) {
  const voices = nameOrVoice instanceof Voice ? [nameOrVoice] : [...(playing.get(nameOrVoice) || [])];
  for (const v of voices) v.setVolume(vol, frames);
}

export function snd_pitch(nameOrVoice, pitch) {
  const voices = nameOrVoice instanceof Voice ? [nameOrVoice] : [...(playing.get(nameOrVoice) || [])];
  for (const v of voices) v.setPitch(pitch);
}

export function snd_free_all() {
  for (const set of playing.values()) for (const v of [...set]) v.stop();
}

// Music: snd_init(file) returns a stream handle that mus_* functions take.
export function snd_init(file) {
  return { file, voice: null };
}

export function mus_loop(stream) {
  return mus_loop_ext(stream, 1, 1);
}

export function mus_loop_ext(stream, vol, pitch) {
  if (!ctx || !stream) return null;
  mus_stop(stream);
  stream.voice = new Voice('mus:' + stream.file, true, vol, pitch);
  return stream.voice;
}

export function mus_play(stream) {
  if (!ctx || !stream) return null;
  mus_stop(stream);
  stream.voice = new Voice('mus:' + stream.file, false, 1, 1);
  return stream.voice;
}

export function mus_volume(stream, vol, frames = 0) {
  stream?.voice?.setVolume(vol, frames);
}

export function mus_pitch(stream, pitch) {
  stream?.voice?.setPitch(pitch);
}

export function mus_stop(stream) {
  if (stream?.voice) {
    stream.voice.stop();
    stream.voice = null;
  }
}
