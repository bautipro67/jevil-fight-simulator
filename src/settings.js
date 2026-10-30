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
  const defaults = { simplify: false, intro: true, easy: false, volume: 1 };
  G.settings = { ...defaults, ...(read(SETTINGS_KEY) || {}) };
  setControls(read(CONTROLS_KEY));
}

export function saveSettings() {
  write(SETTINGS_KEY, G.settings);
}

export function saveControls() {
  write(CONTROLS_KEY, controls);
}

export function applyVolume() {
  setMasterVolume(G.settings.volume);
}
