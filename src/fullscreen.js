// Fullscreen toggle for the game area: the on-page button and the F key.

const stage = () => document.getElementById('stage');
const current = () => document.fullscreenElement || document.webkitFullscreenElement;

export function toggleFullscreen() {
  if (current()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    return;
  }
  const el = stage();
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  Promise.resolve(req.call(el, { navigationUI: 'hide' }))
    .then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {});
}

export function setupFullscreen() {
  const btn = document.getElementById('fullscreen');
  const supported = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!btn || !supported) return;
  btn.hidden = false;
  btn.addEventListener('click', () => {
    btn.blur();
    toggleFullscreen();
  });
  // Keep Z/Enter/Space from re-triggering the button after a click.
  btn.addEventListener('keydown', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey) toggleFullscreen();
  });
  const sync = () => {
    const on = !!current();
    btn.classList.toggle('on', on);
    btn.title = on ? 'Exit fullscreen (F)' : 'Fullscreen (F)';
    btn.setAttribute('aria-label', btn.title);
    dispatchEvent(new Event('resize'));
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
