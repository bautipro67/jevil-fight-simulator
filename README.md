# Jevil Fight Simulator

**▶ Play now: https://bautipro67.github.io/jevil-fight-simulator/**

Play the Jevil boss fight from **DELTARUNE Chapter 1** for free in your browser, on PC or mobile. No download needed.

![Jevil Fight Simulator](og.png)

- Fight with Kris, Susie and Ralsei: FIGHT, ACT (Check, Pirouette, Hypnosis), MAGIC, ITEM, SPARE and DEFEND.
- All 16 of Jevil's attacks plus the Final Chaos, with the SOUL, grazing and TP.
- **The scenes around the fight**: JEVIL greets his visitors and his scythes fall before the battle; after it, his last words, his change into the ShadowCrystal, and the DEVILSKNIFE (beaten) or the JEVILSTAIL (pacified). Turn them off with SCENES in OPTIONS.
- The battle logic is ported from the original game, so it plays like the real fight.
- **Practice mode** (Bad Time Simulator style): dodge the 16 attacks in order; lose your HP bar and the attack restarts, survive it and you move on. Pick the starting attack and 90 / 45 / 1 HP. Scores with ranks and a saved best for full runs. Direct link: [`?practice`](https://bautipro67.github.io/jevil-fight-simulator/?practice).
- **EQUIPMENT**: pick each character's weapon and two armors (any Chapter 1 gear they can use) and the items for the fight. Saved in the browser.
- **Codes**: type a secret code in the Codes box under the game to unlock extras.
- **OPTIONS**: volume, easy mode (half damage), scenes on/off, **SOUL hats** and **CONTROLS** to remap every button on keyboard and gamepad. Options are remembered in the browser.
- **Pause** with Esc / P (Start on a gamepad): continue, restart, volume, quit to title.
- **Sandbox mode** to repeat any attack freely: [`?sandbox&attack=0`](https://bautipro67.github.io/jevil-fight-simulator/?sandbox&attack=0) (`[` / `]` switch attacks, `I` invincibility).
- Touch controls on phones and tablets, fullscreen button.

Also by the same fan: [Spamton NEO](https://bautipro67.github.io/spamton-neo-fight-simulator/), [Roaring Knight](https://bautipro67.github.io/roaring-knight-fight-simulator/) and [Gerson](https://bautipro67.github.io/gerson-fight-simulator/) fight simulators. See [all the DELTARUNE fight simulators](https://bautipro67.github.io/).

## Controls

| Key | Action |
|---|---|
| Z / Enter | Confirm |
| X / Shift | Cancel |
| Arrow keys | Move |
| Esc / P | Pause (restart, volume, quit to title) |

**Gamepad** (Xbox, PlayStation, Switch): A / Cross confirms, B / Circle cancels, D-pad or left stick moves, Start pauses. Browsers only turn on sound after a click or key press, so click the page once.

## Run it locally

```
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Self test

```
node tools/selftest/run.mjs
```

Plays the whole simulator by itself in a headless Chrome or Edge and lists what passed and what broke (an error, a missing asset, a scene or fight that never reaches its end): the scenes, the whole fight with and without them, practice mode and every attack in the sandbox. Nothing to install, only Node 22 or newer and Chrome or Edge. `--quick` skips the sandbox runs, `--only <text>` runs the scenarios whose name has that text, `--list` lists them and `--shots <folder>` saves the last frame of each. The scenarios are in `tools/selftest/sim.js`.

## How it was made

- `tools/datawin.py` reads GameMaker `data.win` files (sprites, fonts, sounds).
- `tools/gmdis.py` decompiles the game's bytecode so the fight could be studied.
- `tools/extract_assets.py` extracts only the assets this fight uses into `assets/`.
- `tools/stamp_version.py` stamps a version on every file before publishing, so browsers never mix old and new files.
- `src/runtime/` is a small GameMaker-like engine in JavaScript; `src/battle/` and `src/jevil/` are the ported fight.

## Credits

DELTARUNE and all its characters, graphics, music and sounds are © Toby Fox. This is a free, non-commercial fan project, not affiliated with Toby Fox or 8-4. If you enjoy it, get the real game: https://deltarune.com

---

*Simulador de la pelea contra Jevil de DELTARUNE, jugable gratis en el navegador.*
