// Player options and control bindings, remembered in this browser when storage is available.
import { G, controls, setControls } from './runtime/gm.js';
import { setMasterVolume } from './runtime/audio.js';

const SETTINGS_KEY = 'jevil-sim-settings';
const CONTROLS_KEY = 'jevil-sim-controls';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* not saved */ }
}

export function loadSettings() {
  const defaults = { simplify: false, intro: true, easy: false, volume: 1, hat: 'NONE' };
  G.settings = { ...defaults, ...(read(SETTINGS_KEY) || {}) };
  delete G.settings.skin;
  // The custom Jevil skin was removed: forget any image saved by it.
  try { localStorage.removeItem('jevil-sim-skin'); } catch (e) { /* storage unavailable */ }
  setControls(read(CONTROLS_KEY));
}

export function saveSettings() {
  write(SETTINGS_KEY, G.settings);
}

export function saveControls() {
  write(CONTROLS_KEY, controls);
}

// Best practice scores of full runs (from attack 1), by starting HP.
const BEST_KEY = 'jevil-sim-best';
export const getBest = hp => (read(BEST_KEY) || {})[hp] || 0;
export function saveBest(hp, score) {
  const all = read(BEST_KEY) || {};
  if (score <= (all[hp] || 0)) return false;
  all[hp] = score;
  write(BEST_KEY, all);
  return true;
}

export function applyVolume() {
  setMasterVolume(G.settings.volume);
}
