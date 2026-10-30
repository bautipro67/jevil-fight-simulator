// On-screen controls for phones and tablets: an 8-way pad plus Z (confirm) and X (cancel).
import { virtualKey } from './runtime/gm.js';

const RIGHT = 39, UP = 38, LEFT = 37, DOWN = 40;

const diff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

export function setupTouch(force = false) {
  const el = document.getElementById('touch');
  if (!el || !(force || matchMedia('(pointer: coarse)').matches)) return false;
  el.hidden = false;

  const pad = el.querySelector('.dpad');
  let held = new Set();
  function setHeld(next) {
    for (const k of held) if (!next.has(k)) virtualKey(k, false);
    for (const k of next) if (!held.has(k)) virtualKey(k, true);
    held = next;
    for (const a of pad.querySelectorAll('[data-dir]')) a.classList.toggle('on', held.has(Number(a.dataset.dir)));
  }
  function fromPointer(e) {
    const r = pad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const next = new Set();
    if (Math.hypot(dx, dy) > 0.25) {
      const a = Math.atan2(-dy, dx) * 180 / Math.PI;
      // Each direction covers 67.5 degrees either side, so diagonals hold two keys.
      if (Math.abs(diff(a, 0)) < 67.5) next.add(RIGHT);
      if (Math.abs(diff(a, 90)) < 67.5) next.add(UP);
      if (Math.abs(diff(a, 180)) < 67.5) next.add(LEFT);
      if (Math.abs(diff(a, 270)) < 67.5) next.add(DOWN);
    }
    setHeld(next);
  }
  pad.addEventListener('pointerdown', e => {
    pad.setPointerCapture(e.pointerId);
    fromPointer(e);
    e.preventDefault();
  });
  pad.addEventListener('pointermove', e => {
    if (pad.hasPointerCapture(e.pointerId)) fromPointer(e);
  });
  for (const type of ['pointerup', 'pointercancel']) pad.addEventListener(type, () => setHeld(new Set()));

  for (const b of el.querySelectorAll('[data-key]')) {
    const k = Number(b.dataset.key);
    b.addEventListener('pointerdown', e => {
      b.setPointerCapture(e.pointerId);
      virtualKey(k, true);
      b.classList.add('on');
      e.preventDefault();
    });
    for (const type of ['pointerup', 'pointercancel']) {
      b.addEventListener(type, () => {
        virtualKey(k, false);
        b.classList.remove('on');
      });
    }
  }
  el.addEventListener('contextmenu', e => e.preventDefault());
  return true;
}
