// What the self test plays in the Jevil simulator (see tools/selftest/runner.js for the helpers).
// Each scenario: name, settings (G.settings while it runs), start(ctx), until(ctx) (its end; none
// for the sandbox runs, which only have to run without errors), frames (the most it may take),
// and optionally status(ctx) (shown when it does not end), input(ctx, frame) (returns
// true when it played the frame itself) and menu(ctx) (the battle menu option to take instead of FIGHT).
export const title = 'Jevil Fight Simulator';

export function scenarios({ S, setup, sandbox, has, first, tick }) {
  const ending = () => has(/^obj_sim_ending$/);
  const list = [
    { name: 'story: the scene before the fight, the whole fight, the DEVILSKNIFE scene and the end', settings: { scenes: true, intro: true },
      start: () => S.startJevilFight(), until: ending, end: 'the result screen', frames: 60000 },
    { name: 'the whole fight with SCENES off', settings: { scenes: false, intro: true },
      start: () => S.startJevilFight(), until: ending, end: 'the result screen', frames: 50000 },
    { name: 'the scene after pacifying JEVIL (the JEVILSTAIL)', settings: { scenes: true },
      start: () => {
        setup.startBattle({ intro: false });
        tick(5);
        S.startJevilAfterScene('spare');
      },
      until: ending, end: 'the result screen', frames: 8000 },
    { name: 'practice mode, every attack in order', start: () => sandbox.startPractice({ start: 0, hp: 90 }),
      until: ctx => ctx.practiceDone(), status: ctx => ctx.practiceStatus(), end: 'the practice results', frames: 40000 },
  ];
  sandbox.ATTACKS.forEach((a, i) => list.push({
    name: `sandbox ${i}: ${a[2]}`, sandbox: true, frames: 1500,
    start: () => sandbox.startSandbox(new URLSearchParams('attack=' + i)),
  }));
  return list;
}
