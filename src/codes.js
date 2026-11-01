// The Codes box under the game (index.html #codeform): unlocks extras such as the TooHardSword.
import { redeemCode } from './battle/equipment.js?v=20261101031117';

const form = document.getElementById('codeform');
if (form) {
  const input = form.querySelector('input');
  const msg = document.getElementById('codemsg');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const r = redeemCode(input.value);
    msg.textContent = r.msg;
    msg.className = r.ok ? 'ok' : 'bad';
    if (r.ok) input.value = '';
  });
}
