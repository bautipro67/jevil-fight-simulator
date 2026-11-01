// On-screen controls for phones and tablets: an 8-way pad plus confirm (Z) and cancel (X).
// They press actions, not keys, so they keep working after the controls are rebound.
import { virtualAction } from './runtime/gm.js?v=20261101031117';

const diff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

export function setupTouch(force = false) {
  const el = document.getElementById('touch');
  if (!el || !(force || matchMedia('(pointer: coarse)').matches)) return false;
  el.hidden = false;

  const pad = el.querySelector('.dpad');
  let held = new Set();
  function setHeld(next) {
    for (const a of held) if (!next.has(a)) virtualAction(a, false);
    for (const a of next) if (!held.has(a)) virtualAction(a, true);
    held = next;
    for (const s of pad.querySelectorAll('[data-dir]')) s.classList.toggle('on', held.has(s.dataset.dir));
  }
  function fromPointer(e) {
    const r = pad.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const next = new Set();
    if (Math.hypot(dx, dy) > 0.25) {
      const a = Math.atan2(-dy, dx) * 180 / Math.PI;
      // Each direction covers 67.5 degrees either side, so diagonals hold two directions.
      if (Math.abs(diff(a, 0)) < 67.5) next.add('right');
      if (Math.abs(diff(a, 90)) < 67.5) next.add('up');
      if (Math.abs(diff(a, 180)) < 67.5) next.add('left');
      if (Math.abs(diff(a, 270)) < 67.5) next.add('down');
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

  for (const b of el.querySelectorAll('[data-action]')) {
    const action = b.dataset.action;
    b.addEventListener('pointerdown', e => {
      b.setPointerCapture(e.pointerId);
      virtualAction(action, true);
      b.classList.add('on');
      e.preventDefault();
    });
    for (const type of ['pointerup', 'pointercancel']) {
      b.addEventListener(type, () => {
        virtualAction(action, false);
        b.classList.remove('on');
      });
    }
  }
  el.addEventListener('contextmenu', e => e.preventDefault());
  return true;
}
