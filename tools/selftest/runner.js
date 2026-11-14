// The in-page half of the self test (tools/selftest/run.mjs loads it). It stops the game's own
// loop and plays each scenario from tools/selftest/sim.js frame by frame, as fast as it can,
// pressing keys like a player: Z through the text, FIGHT on every turn, the left option in a
// choice box. The party's HP is topped up every frame so a fight always reaches its end.
// A scenario fails on an error, on a warning about something missing or not ported, when it does
// not reach its end within its frames, or when a scripted one (run) returns a problem.
// This file is the same in every simulator; what each one plays is in its sim.js, plus the shared
// scenarios below (menus, gamepad, pause, codes, equipment, items, hats, every battle action).
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = text => console.log('[selftest] ' + text);
const KEY = { z: 90, x: 88, c: 67, left: 37, up: 38, right: 39, down: 40, esc: 27 };
// Warnings that mean something is missing or broken (anything else is listed but does not fail).
const BAD_WARNING = /not ported|missing|undefined|NaN|Error\b|failed/i;
const BASE = new URL('../../', import.meta.url).href; // the simulator's folder (also on a live site)
const url = path => new URL(path, BASE).href;

export async function run(options = {}) {
  const v = (await fetch(url('version.json'), { cache: 'no-store' }).then(r => r.json())).v;
  const q = '?v=' + v;
  const gm = await import(url('src/runtime/gm.js' + q));
  const G = gm.G;
  // The page loads the fight's modules before the title; importing the others earlier would run
  // them too soon (the sandbox lists only the attacks already defined when it loads).
  const isTitle = () => G.instances.some(i => i.alive && /title/.test(i.constructor.objName));
  for (let k = 0; k < 600 && !isTitle(); k++) await sleep(100);
  if (!isTitle()) return { fatal: 'the title screen never appeared' };
  const mod = path => import(url(path + q));
  const [setup, sandbox, equipment, hats, pause, audio] = await Promise.all(['src/battle/setup.js', 'src/debug/sandbox.js',
    'src/battle/equipment.js', 'src/hats.js', 'src/pause.js', 'src/runtime/audio.js'].map(mod));
  const sim = await import('./sim.js?t=' + Date.now());

  const errors = [], warnings = [];
  addEventListener('error', e => errors.push(`${e.message} (${(e.filename || '').split('/').pop().split('?')[0]}:${e.lineno})`));
  addEventListener('unhandledrejection', e => errors.push('unhandled rejection: ' + (e.reason?.stack || e.reason)));
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { warnings.push(a.map(x => x?.stack || String(x)).join(' ')); ow(...a); };
  console.error = (...a) => { errors.push(a.map(x => x?.stack || String(x)).join(' ')); oe(...a); };
  G.paused = true;
  // Sounds that really start playing (each buffer source started), counted per scenario.
  let soundsStarted = 0;
  const start0 = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { soundsStarted += 1; return start0.apply(this, a); };
  // A gamepad the scenarios can press (navigator.getGamepads is read every frame).
  const pad = { connected: true, id: 'self test pad', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
  const realPads = navigator.getGamepads?.bind(navigator);
  let padOn = false;
  navigator.getGamepads = () => (padOn ? [pad] : realPads ? realPads() : []);

  // ---- helpers the scenarios use
  const objs = () => G.instances.filter(i => i.alive).map(i => i.constructor.objName);
  const has = re => G.instances.some(i => i.alive && re.test(i.constructor.objName));
  const first = name => gm.instancesOf(name)[0];
  const timing = { total: 0, count: 0, worst: 0 };
  const tick = (n = 1, keys = []) => {
    for (let i = 0; i < n; i++) {
      for (const k of keys) gm.virtualKey(k, true);
      const t = performance.now();
      gm.tick();
      const dt = performance.now() - t;
      timing.total += dt;
      timing.count += 1;
      if (dt > timing.worst) timing.worst = dt;
      for (const k of keys) gm.virtualKey(k, false);
    }
  };
  const press = (key, after = 2) => {
    tick(1, [key]);
    tick(after);
  };
  const hold = (key, n) => {
    gm.virtualKey(key, true);
    tick(n);
    gm.virtualKey(key, false);
  };
  const godmode = () => {
    const g = gm.global;
    for (const c of [1, 2, 3, 4]) if (g.hp?.[c] !== undefined && g.maxhp?.[c] && g.hp[c] < g.maxhp[c]) g.hp[c] = g.maxhp[c];
    const p = first('obj_practicecontroller');
    if (p && p.pool !== undefined && p.pool < p.poolMax) p.pool = p.poolMax;
  };
  // What a player does on a frame: pick the left option of a choice box, FIGHT in the battle menu
  // (or what the scenario's menu(ctx) picks: 0 FIGHT, 1 ACT / MAGIC, 2 ITEM, 3 SPARE, 4 DEFEND),
  // Z every few frames through text and scenes. With menu(ctx) it also confirms in the submenus,
  // after moving down a varying number of times so different ACTs, spells and items get picked.
  let lastMenu = -1, menuFrames = 0;
  const autoplay = (frame, sc = {}) => {
    const g = gm.global;
    const ch = first('obj_choicer_neo');
    if (ch && ch.canchoose == 1 && ch.mychoice < 0) return press(KEY.left, 0);
    const inMenu = g.myfight === 0 && g.bmenucoord && (sc.menu ? g.bmenuno >= 0 : [0, 1, 9, 11].includes(g.bmenuno));
    if (inMenu) {
      if (g.bmenuno === 0) g.bmenucoord[0][g.charturn ?? 0] = sc.menu ? sc.menu(ctx) : 0;
      if (sc.menu && g.bmenuno !== lastMenu) {
        lastMenu = g.bmenuno;
        menuFrames = 0;
        if (g.bmenuno !== 0) for (let k = (frame / 37 | 0) % 3; k > 0; k--) press(KEY.down, 1);
      }
      // An option that cannot be taken (a spell without enough TP): back out, as a player would.
      if (sc.menu && g.bmenuno !== 0 && ++menuFrames > 40) {
        menuFrames = 0;
        return press(KEY.x, 1);
      }
      return tick(1, frame % 4 === 0 ? [KEY.z] : []);
    }
    lastMenu = -1;
    return tick(1, frame % 9 === 0 ? [KEY.z] : []);
  };
  const clear = () => {
    for (const i of G.instances) i.alive = false;
    G.instances = [];
  };

  // ---- scripted helpers (menus)
  const key = (k, after = 3) => press(k, after);
  const waitFor = (pred, max, what) => {
    for (let i = 0; i < max; i++) {
      if (pred()) return;
      tick(1);
    }
    throw new Error('timed out waiting for ' + what);
  };
  // The same, letting the page's own promises run (room pictures, sounds) every few frames.
  const waitForAsync = async (pred, max, what, each) => {
    for (let i = 0; i < max; i++) {
      if (pred()) return;
      if (each) each(i); else tick(1);
      if (i % 20 === 19) await sleep(0);
    }
    throw new Error('timed out waiting for ' + what);
  };
  const activeMenu = () => gm.instancesOf('obj_sim_heartmenu').filter(m => m.alive && m.items && !m.done).pop();
  const labels = m => m.items.map(it => String(typeof it === 'function' ? it() : it));
  const menuReady = what => {
    waitFor(() => activeMenu() && activeMenu().buffer < 0, 300, what);
    return activeMenu();
  };
  const goTo = (m, i) => {
    for (let k = 0; k <= m.items.length && m.cur !== i; k++) key(KEY.down, 1);
    if (m.cur !== i) throw new Error(`the menu cursor never reached "${labels(m)[i]}"`);
  };
  const pick = (m, label) => {
    const i = labels(m).findIndex(l => l.startsWith(label));
    if (i < 0) throw new Error(`no "${label}" in the menu (${labels(m).join(', ')})`);
    goTo(m, i);
    key(KEY.z, 3);
  };
  const toTitle = what => {
    clear();
    gm.S.startTitle();
    return menuReady(what ?? 'the title menu');
  };
  const party = () => equipment.PARTY ?? [1, 2, 3];
  const armorsFor = (c, slot) => (equipment.armorChoices ? equipment.armorChoices(c, slot) : []);
  const battle = () => {
    clear();
    setup.startBattle({ intro: false });
  };
  // Practice swaps scr_gameover while it runs and puts it back when it is left the normal ways;
  // the scenarios clear the room instead, so it is put back here.
  const realGameover = gm.S.scr_gameover;
  const restore = () => {
    if (gm.S.scr_gameover !== realGameover) gm.defineScript('scr_gameover', realGameover);
    G.pendingGameover = null;
    equipment.resetLoadout?.();
    gm.setControls?.(null);
    if (G.practice) Object.assign(G.practice, { start: 0, hp: 0 });
  };

  const ctx = { gm, G, global: gm.global, S: gm.S, setup, sandbox, equipment, objs, has, first, tick, press, hold, KEY,
    autoplay, waitFor, activeMenu, labels, menuReady, pick, toTitle, battle, pad };

  // ---- practice mode: its end, and where it stood (or what destroyed its controller)
  const practice = { inst: null, index: 0, destroyedBy: null };
  ctx.practiceDone = () => {
    const p = first('obj_practicecontroller');
    if (p && p !== practice.inst) {
      practice.inst = p;
      practice.destroyedBy = null;
      let alive = p.alive;
      Object.defineProperty(p, 'alive', {
        configurable: true,
        get: () => alive,
        set: val => {
          if (alive && !val) {
            practice.destroyedBy = String(new Error().stack).split('\n').slice(2, 6)
              .map(l => l.trim().replace(/\?v=\d+/g, '')).join(' < ');
          }
          alive = val;
        },
      });
    }
    if (p) practice.index = p.attackIndex;
    return !!p?.finished;
  };
  ctx.practiceStatus = () => {
    const at = `attack ${practice.index + 1} of ${sandbox.PRACTICE_COUNT ?? '?'}`;
    if (first('obj_practicecontroller')) return `practice at ${at}`;
    return `the practice controller was destroyed at ${at}` + (practice.destroyedBy ? ` by ${practice.destroyedBy}` : '');
  };

  // ---- the shared scenarios (each sim.js adds them with ...ctx.shared())
  ctx.shared = () => [
    { name: 'title menus: OPTIONS, CONTROLS (rebinding a button), EQUIPMENT, PRACTICE, then BEGIN', run: async () => {
      let m = toTitle();
      // OPTIONS: every option left, right and Z twice (back to where it was)
      pick(m, 'OPTIONS');
      m = menuReady('OPTIONS');
      const opts = labels(m);
      for (let i = 0; i < opts.length; i++) {
        if (/^(CONTROLS|BACK)/.test(opts[i])) continue;
        goTo(m, i);
        key(KEY.right);
        key(KEY.left);
        key(KEY.z);
        m = menuReady('OPTIONS after ' + opts[i]);
        key(KEY.z);
        m = menuReady('OPTIONS after ' + opts[i]);
      }
      // CONTROLS: every row, rebind CONFIRM to the pad's Y, then RESET DEFAULTS and back
      pick(m, 'CONTROLS');
      waitFor(() => first('obj_sim_controls')?.cooldown <= 0, 100, 'the CONTROLS screen');
      const cm = first('obj_sim_controls');
      for (let i = 0; i < 12; i++) key(KEY.down, 1);
      for (let i = 0; i < 12; i++) key(KEY.up, 1);
      for (let k = 0; k < 12 && cm.cur !== 0; k++) key(KEY.down, 1);
      key(KEY.z);
      if (!cm.waiting) return 'CONTROLS did not wait for a button after Z';
      padOn = true;
      pad.buttons[3].pressed = true;
      tick(2);
      pad.buttons[3].pressed = false;
      tick(10);
      padOn = false;
      if (cm.waiting) return 'CONTROLS did not take the gamepad button';
      if (!gm.controls.confirm.pad.includes(3)) return 'the gamepad button was not bound to CONFIRM';
      waitFor(() => cm.cooldown <= 0, 30, 'CONTROLS after the new binding');
      key(KEY.up, 1);
      key(KEY.up, 1);
      key(KEY.z);
      if (gm.controls.confirm.pad.includes(3)) return 'RESET DEFAULTS kept the new binding';
      key(KEY.x, 5);
      m = menuReady('OPTIONS after CONTROLS');
      pick(m, 'BACK');
      // EQUIPMENT: every value of every row for each party member, the items page, reset, back
      m = menuReady('the title menu after OPTIONS');
      pick(m, 'EQUIPMENT');
      waitFor(() => first('obj_sim_equipment')?.cooldown <= 0, 100, 'the EQUIPMENT screen');
      const eq = first('obj_sim_equipment');
      const row = r => {
        for (let k = 0; k < 40 && eq.cur !== r; k++) key(KEY.down, 1);
        if (eq.cur !== r) throw new Error('the EQUIPMENT cursor never reached row ' + r);
      };
      for (const c of party()) {
        row(0);
        for (let k = 0; k < 6 && eq.char !== c; k++) key(KEY.right, 1);
        for (const [r, n] of [[1, equipment.weaponChoices(c).length], [2, armorsFor(c, 1).length], [3, armorsFor(c, 2).length]]) {
          row(r);
          for (let k = 0; k <= n; k++) key(KEY.right, 1);
          key(KEY.left, 1);
        }
      }
      row(4);
      key(KEY.z);
      for (let s = 0; s < (equipment.ITEM_SLOTS ?? 12); s++) {
        for (let k = 0; k < 40 && eq.cur !== s; k++) key(KEY.down, 1);
        for (let k = 0; k < 3; k++) key(KEY.right, 1);
      }
      key(KEY.x);
      row(5);
      key(KEY.z);
      row(6);
      key(KEY.z);
      if (eq.alive) return 'EQUIPMENT did not close';
      // PRACTICE: change the first attack and the HP, back, then BEGIN
      m = menuReady('the title menu after EQUIPMENT');
      pick(m, 'PRACTICE');
      m = menuReady('the PRACTICE menu');
      pick(m, 'FROM ATTACK');
      m = menuReady('the PRACTICE menu');
      pick(m, 'HP');
      m = menuReady('the PRACTICE menu');
      pick(m, 'BACK');
      m = menuReady('the title menu after PRACTICE');
      pick(m, 'BEGIN');
      // (Spamton NEO: BEGIN asks for the route first)
      const sub = activeMenu();
      if (sub && labels(sub).some(l => /ROUTE/.test(l))) {
        tick(5);
        pick(menuReady('the route menu'), 'BACK');
        pick(menuReady('the title menu'), 'BEGIN');
        pick(menuReady('the route menu'), labels(activeMenu())[0]);
      }
      await waitForAsync(() => !isTitle(), 600, 'BEGIN to leave the title screen');
      tick(60);
      return null;
    } },
    { name: 'gamepad: D-pad, stick, A and B in the title menu, Start pauses', run: () => {
      let m = toTitle();
      padOn = true;
      const tap = (b, after = 4) => {
        pad.buttons[b].pressed = true;
        tick(1);
        pad.buttons[b].pressed = false;
        tick(after);
      };
      try {
        const c0 = m.cur;
        tap(13);
        if (m.cur !== (c0 + 1) % m.items.length) return 'D-pad down did not move the cursor';
        tap(12);
        pad.axes[1] = 1;
        tick(1);
        pad.axes[1] = 0;
        tick(4);
        if (m.cur !== (c0 + 1) % m.items.length) return 'the stick did not move the cursor';
        tap(12);
        const opt = labels(m).findIndex(l => l.startsWith('OPTIONS'));
        for (let k = 0; k < 10 && m.cur !== opt; k++) tap(13, 2);
        tap(0, 6);
        m = menuReady('OPTIONS from the gamepad');
        if (!labels(m).some(l => l.startsWith('VOLUME'))) return 'A did not open OPTIONS';
        tap(1, 6);
        m = menuReady('the title menu after B');
        if (!labels(m).some(l => l.startsWith('BEGIN'))) return 'B did not go back from OPTIONS';
        battle();
        tick(30);
        pad.buttons[9].pressed = true;
        tick(1);
        const paused = gm.pause_p();
        pad.buttons[9].pressed = false;
        tick(2);
        if (!paused) return 'Start did not press PAUSE';
      } finally {
        padOn = false;
      }
      return null;
    } },
    { name: 'pause menu: CONTINUE, VOLUME, RESTART FIGHT, QUIT TO TITLE and RESTART PRACTICE', run: async () => {
      // (the main loop runs pauseStep only while the menu is open)
      const pstep = () => { if (pause.isPaused()) pause.pauseStep(); };
      const step = (k, n = 1) => {
        for (let i = 0; i < n; i++) {
          if (k) gm.virtualKey(k, true);
          pstep();
          if (k) gm.virtualKey(k, false);
          pstep();
        }
      };
      const open = () => {
        pause.openPause();
        if (!pause.isPaused()) throw new Error('the pause menu did not open');
        step(null, 2);
      };
      battle();
      tick(60);
      open();
      step(KEY.down, 2);
      step(KEY.right);
      step(KEY.left);
      step(KEY.up, 2);
      step(KEY.z);
      if (pause.isPaused()) return 'CONTINUE did not close the pause menu';
      tick(10);
      open();
      clear();
      step(KEY.down);
      step(KEY.z);
      await sleep(100);
      waitFor(() => has(/^obj_battlecontroller$/), 300, 'RESTART FIGHT to start the fight again');
      open();
      step(KEY.down, 3);
      step(KEY.z);
      await sleep(50);
      tick(60);
      if (!isTitle()) return 'QUIT TO TITLE did not go to the title';
      clear();
      sandbox.startPractice({ start: 0, hp: 90 });
      tick(60);
      open();
      first('obj_practicecontroller').restartMark = true;
      step(KEY.down);
      step(KEY.z);
      await sleep(100);
      tick(30);
      const pc = first('obj_practicecontroller');
      if (!pc || pc.restartMark) return 'RESTART PRACTICE did not start practice again';
      return null;
    } },
    { name: 'game over: the SOUL breaks, then the first and the second choice, and four presses of Z', run: async () => {
      const gameoverObjs = /^(obj_gameover_init|DEVICE_FAILURE|DEVICE_CHOICE|obj_gameoverbg)$/;
      const fall = async what => {
        battle();
        tick(40);
        const g = gm.global;
        for (let i = 0; i < 3; i++) if (g.char?.[i]) g.hp[g.char[i]] = 0;
        gm.S.scr_gameover();
        await waitForAsync(() => has(/^obj_gameover_init$/), 60, what + ': the game over to start');
      };
      const after = async what => {
        await waitForAsync(() => !has(gameoverObjs) && G.instances.some(i => i.alive), 1500, what + ' to leave the game over',
          i => tick(1, i % 9 === 0 ? [KEY.z] : []));
        for (let i = 0; i < 90; i++) { autoplay(i); if (i % 20 === 19) await sleep(0); }
        if (has(gameoverObjs)) throw new Error(what + ' came back to the game over');
      };
      // No Z while the SOUL breaks (four presses retry at once); then Z through DEVICE_FAILURE's lines.
      const toChoice = async () => {
        await waitForAsync(() => has(/^DEVICE_FAILURE$/), 400, 'the game over screen');
        await waitForAsync(() => has(/^DEVICE_CHOICE$/), 1500, 'the game over choice', i => tick(1, i % 9 === 0 ? [KEY.z] : []));
        await waitForAsync(() => first('DEVICE_CHOICE')?.fadebuffer < 0, 90, 'the choice to take input');
      };
      // the first option (CONTINUE, YES or GO BACK; preselected)
      await fall('CONTINUE');
      await toChoice();
      key(KEY.z, 3);
      await after('CONTINUE');
      // GIVE UP
      await fall('GIVE UP');
      await toChoice();
      key(KEY.right, 3);
      key(KEY.z, 3);
      await waitForAsync(() => !has(gameoverObjs), 900, 'the second choice to leave the game over',
        i => tick(1, i % 9 === 0 ? [KEY.z] : []));
      // four presses of Z while the SOUL breaks
      await fall('Z four times');
      await waitForAsync(() => first('obj_gameover_init')?.timer >= 85, 120, 'the SOUL to break');
      for (let i = 0; i < 4; i++) key(KEY.z, 2);
      // (Chapters 1, 2 and 4 retry at once; the Knight's game over skips ahead to its lines instead)
      await waitForAsync(() => !has(gameoverObjs) || has(/^DEVICE_FAILURE$/), 300, 'four presses of Z to retry or skip ahead');
      for (let i = 0; i < 60; i++) autoplay(i);
      return null;
    } },
    { name: 'Codes box: a wrong code, then TOOHARD and a fight with the TooHardSword', run: () => {
      const form = document.getElementById('codeform');
      if (!form) return 'there is no Codes box on the page';
      const input = form.querySelector('input'), msg = document.getElementById('codemsg');
      input.value = 'nothing here';
      form.requestSubmit();
      if (msg.className !== 'bad') return 'a wrong code was not refused';
      input.value = 'too hard';
      form.requestSubmit();
      if (msg.className !== 'ok') return 'TOOHARD was not accepted';
      const c = party().find(ch => equipment.weaponChoices(ch).includes(equipment.CODE_WEAPON));
      if (c === undefined) return 'nobody can take the TooHardSword after TOOHARD';
      equipment.getLoadout().gear[c][0] = equipment.CODE_WEAPON;
      battle();
      for (let f = 0; f < 1500; f++) {
        godmode();
        autoplay(f);
      }
      return null;
    } },
    { name: 'every weapon and armor in a fight', run: () => {
      const bad = [];
      const tryGear = (label, apply) => {
        restore();
        apply(equipment.getLoadout());
        const before = errors.length;
        battle();
        for (let f = 0; f < 150; f++) {
          godmode();
          autoplay(f);
        }
        if (errors.length > before) bad.push(label);
      };
      for (const c of party()) {
        for (const w of equipment.weaponChoices(c)) tryGear(`weapon ${w} on ${c}`, lo => { lo.gear[c][0] = w; });
        for (const a of armorsFor(c, 1)) tryGear(`armor ${a} on ${c}`, lo => { lo.gear[c][1] = a; });
      }
      restore();
      return bad.length ? 'errors with ' + bad.join(', ') : null;
    } },
    { name: 'every item used in a fight', run: () => {
      const bad = [];
      for (const id of equipment.itemChoices()) {
        if (!id) continue;
        restore();
        equipment.getLoadout().items = Array.from({ length: equipment.ITEM_SLOTS ?? 12 }, () => id);
        const before = errors.length;
        battle();
        const sc = { menu: () => 2 };
        for (let f = 0; f < 400; f++) {
          godmode();
          autoplay(f, sc);
        }
        if (errors.length > before) bad.push('item ' + id);
      }
      restore();
      return bad.length ? 'errors with ' + bad.join(', ') : null;
    } },
    { name: 'every SOUL hat in an attack', run: () => {
      const saved = G.settings.hat;
      for (const h of hats.HATS) {
        G.settings.hat = h.name;
        clear();
        sandbox.startSandbox(new URLSearchParams('attack=0'));
        tick(60);
      }
      G.settings.hat = saved;
      return null;
    } },
    // The option changes every 50 frames, so an option that cannot be used (no items left, nothing
    // to spare) never holds the fight up.
    { name: 'a fight taking turns with FIGHT, ACT / MAGIC, ITEM, SPARE and DEFEND', start: () => battle(), frames: 9000,
      menu: () => Math.floor((G.frame ?? 0) / 50) % 5, sounds: 100 },
  ];

  let scenarios = sim.scenarios(ctx);
  if (options.quick) scenarios = scenarios.filter(s => !s.sandbox);
  if (options.only) {
    const wanted = options.only.toLowerCase().split('|');
    scenarios = scenarios.filter(s => wanted.some(w => s.name.toLowerCase().includes(w)));
  }
  if (options.list) return { names: scenarios.map(s => s.name) };
  try { await audio.audioInit(); } catch { /* reported below */ }
  say(`${sim.title} ${v}: ${scenarios.length} scenarios, audio ${audio.audioState()}`);

  const results = [], otherWarnings = new Set();
  for (const sc of scenarios) {
    say(`${sc.name} ...`);
    errors.length = 0;
    warnings.length = 0;
    soundsStarted = 0;
    Object.assign(timing, { total: 0, count: 0, worst: 0 });
    const saved = { ...G.settings };
    Object.assign(G.settings, sc.settings ?? {});
    const t0 = performance.now(), f0 = G.frame ?? 0;
    let frames = 0, reached = false, problem = null;
    try {
      if (sc.run) {
        problem = await sc.run(ctx);
        reached = true;
      } else {
        clear();
        await sc.start(ctx);
        while (!reached && frames < sc.frames) {
          const slice = performance.now();
          while (!reached && frames < sc.frames && performance.now() - slice < 200) {
            if (sc.god !== false) godmode();
            if (!(sc.input && sc.input(ctx, frames))) autoplay(frames, sc);
            frames += 1;
            if (sc.until && sc.until(ctx)) reached = true;
          }
          await sleep(0);
        }
      }
    } catch (e) {
      errors.push(String(e.stack || e).split('\n').slice(0, 4).join(' | '));
    } finally {
      Object.keys(G.settings).forEach(k => { if (!(k in saved)) delete G.settings[k]; });
      Object.assign(G.settings, saved);
      padOn = false;
      if (pause.isPaused()) pause.closePause();
      restore();
    }
    if (!sc.run && sc.until && !reached) {
      let status = '';
      try { status = sc.status ? sc.status(ctx) + '; ' : ''; } catch { /* no status */ }
      problem = `did not reach the end (${sc.end ?? 'its end condition'}) in ${sc.frames} frames; ${status}on screen: ${[...new Set(objs())].slice(0, 12).join(', ')}`;
    }
    // sounds: true (at least one) or a number: the fewest sounds a scenario this long should play.
    const needSounds = sc.sounds === true ? 1 : sc.sounds || 0;
    if (needSounds && soundsStarted < needSounds && audio.audioState() === 'running') {
      problem = (problem ? problem + '; ' : '') + `only ${soundsStarted} sounds played (a stuck fight?)`;
    }
    const badWarnings = [...new Set(warnings.filter(w => BAD_WARNING.test(w)))];
    for (const w of new Set(warnings)) if (!BAD_WARNING.test(w)) otherWarnings.add(w);
    const ok = !problem && errors.length === 0 && badWarnings.length === 0;
    let shot = null;
    if (options.shots) {
      try {
        if (reached && !sc.run) tick(30); // let the end screen fade in
        shot = document.querySelector('canvas').toDataURL('image/png');
      } catch { /* no picture */ }
    }
    results.push({ name: sc.name, ok, frames: (G.frame ?? f0) - f0 || frames, ms: Math.round(performance.now() - t0), problem,
      errors: [...new Set(errors)].slice(0, 6), badWarnings: badWarnings.slice(0, 6), shot, sounds: soundsStarted,
      msPerFrame: timing.count ? +(timing.total / timing.count).toFixed(2) : 0, worstFrame: +timing.worst.toFixed(1) });
    say(`${ok ? 'PASS' : 'FAIL'}  ${sc.name}`);
  }
  clear();
  navigator.getGamepads = realPads ?? navigator.getGamepads;
  AudioBufferSourceNode.prototype.start = start0;
  return { title: sim.title, version: v, audio: audio.audioState(), results, otherWarnings: [...otherWarnings].slice(0, 10) };
}
