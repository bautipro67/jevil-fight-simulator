// The in-page half of the self test (tools/selftest/run.mjs loads it). It stops the game's own
// loop and plays each scenario from tools/selftest/sim.js frame by frame, as fast as it can,
// pressing keys like a player: Z through the text, FIGHT on every turn, the left option in a
// choice box. The party's HP is topped up every frame so a fight always reaches its end.
// A scenario fails on an error, on a warning about something missing or not ported, or when it
// does not reach its end within its frames.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const say = text => console.log('[selftest] ' + text);
const KEY = { z: 90, x: 88, c: 67, left: 37, up: 38, right: 39, down: 40 };
// Warnings that mean something is missing (anything else is listed but does not fail).
const BAD_WARNING = /not ported|missing|undefined|NaN/i;

export async function run(options = {}) {
  const v = (await fetch('/version.json', { cache: 'no-store' }).then(r => r.json())).v;
  const q = '?v=' + v;
  const gm = await import('/src/runtime/gm.js' + q);
  const G = gm.G;
  // The page loads the fight's modules before the title; importing the others earlier would run
  // them too soon (the sandbox lists only the attacks already defined when it loads).
  const isTitle = () => G.instances.some(i => i.alive && /title/.test(i.constructor.objName));
  for (let k = 0; k < 600 && !isTitle(); k++) await sleep(100);
  if (!isTitle()) return { fatal: 'the title screen never appeared' };
  const setup = await import('/src/battle/setup.js' + q);
  const sandbox = await import('/src/debug/sandbox.js' + q);
  const sim = await import('./sim.js?t=' + Date.now());

  const errors = [], warnings = [];
  addEventListener('error', e => errors.push(`${e.message} (${(e.filename || '').split('/').pop().split('?')[0]}:${e.lineno})`));
  addEventListener('unhandledrejection', e => errors.push('unhandled rejection: ' + (e.reason?.stack || e.reason)));
  const ow = console.warn, oe = console.error;
  console.warn = (...a) => { warnings.push(a.map(String).join(' ')); ow(...a); };
  console.error = (...a) => { errors.push(a.map(x => x?.stack || String(x)).join(' ')); oe(...a); };
  G.paused = true;

  // ---- helpers the scenarios use
  const objs = () => G.instances.filter(i => i.alive).map(i => i.constructor.objName);
  const has = re => G.instances.some(i => i.alive && re.test(i.constructor.objName));
  const first = name => gm.instancesOf(name)[0];
  const tick = (n = 1, keys = []) => {
    for (let i = 0; i < n; i++) {
      for (const k of keys) gm.virtualKey(k, true);
      gm.tick();
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
  // (or what the scenario's menu(ctx) picks: 0 FIGHT, 1 ACT, ...), Z every few frames through text
  // and scenes.
  const autoplay = (frame, sc = {}) => {
    const g = gm.global;
    const ch = first('obj_choicer_neo');
    if (ch && ch.canchoose == 1 && ch.mychoice < 0) return press(KEY.left, 0);
    if (g.myfight === 0 && g.bmenucoord && [0, 1, 9, 11].includes(g.bmenuno)) {
      if (g.bmenuno === 0) g.bmenucoord[0][g.charturn ?? 0] = sc.menu ? sc.menu(ctx) : 0;
      return tick(1, frame % 4 === 0 ? [KEY.z] : []);
    }
    return tick(1, frame % 9 === 0 ? [KEY.z] : []);
  };
  const clear = () => {
    for (const i of G.instances) i.alive = false;
    G.instances = [];
  };
  // Practice mode: its end, and where it stood (or what destroyed its controller) when it did not end.
  const practice = { inst: null, index: 0, destroyedBy: null };
  const practiceDone = () => {
    const p = first('obj_practicecontroller');
    if (p && p !== practice.inst) {
      practice.inst = p;
      practice.destroyedBy = null;
      let alive = p.alive;
      Object.defineProperty(p, 'alive', {
        configurable: true,
        get: () => alive,
        set: v => {
          if (alive && !v) {
            practice.destroyedBy = String(new Error().stack).split('\n').slice(2, 6)
              .map(l => l.trim().replace(/\?v=\d+/g, '')).join(' < ');
          }
          alive = v;
        },
      });
    }
    if (p) practice.index = p.attackIndex;
    return !!p?.finished;
  };
  const practiceStatus = () => {
    const at = `attack ${practice.index + 1} of ${sandbox.PRACTICE_COUNT ?? '?'}`;
    if (first('obj_practicecontroller')) return `practice at ${at}`;
    return `the practice controller was destroyed at ${at}` + (practice.destroyedBy ? ` by ${practice.destroyedBy}` : '');
  };
  const ctx = { gm, G, global: gm.global, S: gm.S, setup, sandbox, objs, has, first, tick, press, hold, KEY, autoplay,
    practiceDone, practiceStatus };

  let scenarios = sim.scenarios(ctx);
  if (options.quick) scenarios = scenarios.filter(s => !s.sandbox);
  if (options.only) {
    const wanted = options.only.toLowerCase().split('|');
    scenarios = scenarios.filter(s => wanted.some(w => s.name.toLowerCase().includes(w)));
  }
  if (options.list) return { names: scenarios.map(s => s.name) };
  say(`${sim.title} ${v}: ${scenarios.length} scenarios (options ${JSON.stringify(options)})`);

  const results = [], otherWarnings = new Set();
  for (const sc of scenarios) {
    say(`${sc.name} ...`);
    errors.length = 0;
    warnings.length = 0;
    const saved = { ...G.settings };
    Object.assign(G.settings, sc.settings ?? {});
    const t0 = performance.now(), f0 = G.frame ?? 0;
    let frames = 0, reached = false, problem = null;
    try {
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
    } catch (e) {
      errors.push(String(e.stack || e).split('\n').slice(0, 4).join(' | '));
    } finally {
      Object.keys(G.settings).forEach(k => { if (!(k in saved)) delete G.settings[k]; });
      Object.assign(G.settings, saved);
    }
    if (sc.until && !reached) {
      let status = '';
      try { status = sc.status ? sc.status(ctx) + '; ' : ''; } catch { /* no status */ }
      problem = `did not reach the end (${sc.end ?? 'its end condition'}) in ${sc.frames} frames; ${status}on screen: ${[...new Set(objs())].slice(0, 12).join(', ')}`;
    }
    const badWarnings = [...new Set(warnings.filter(w => BAD_WARNING.test(w)))];
    for (const w of new Set(warnings)) if (!BAD_WARNING.test(w)) otherWarnings.add(w);
    const ok = !problem && errors.length === 0 && badWarnings.length === 0;
    let shot = null;
    if (options.shots) {
      try {
        if (reached) tick(30); // let the end screen fade in
        shot = document.querySelector('canvas').toDataURL('image/png');
      } catch { /* no picture */ }
    }
    results.push({ name: sc.name, ok, frames: (G.frame ?? f0) - f0 || frames, ms: Math.round(performance.now() - t0), problem,
      errors: [...new Set(errors)].slice(0, 6), badWarnings: badWarnings.slice(0, 6), shot });
    say(`${ok ? 'PASS' : 'FAIL'}  ${sc.name}`);
  }
  clear();
  return { title: sim.title, version: v, results, otherWarnings: [...otherWarnings].slice(0, 10) };
}
