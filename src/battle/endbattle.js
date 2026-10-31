// obj_endbattle: the party walks back to the overworld spots, then the simulator's result screen
// replaces the post-fight cutscene. obj_time also hands a pending game over to its screen.
import { global, G, Instance, defineObject, S, point_direction, point_distance } from '../runtime/gm.js?v=20261031024711';
import { mus_volume } from '../runtime/audio.js?v=20261031024711';

const g = global;

class EndBattle extends Instance {
  create() {
    this.alarm[0] = 15;
    this.con = 0;
    g.tension = 0;
    const spr = ['spr_krisr_dark', 'spr_susier_dark', 'spr_ralseir'];
    this.c = [];
    for (let i = 0; i < 3; i++) {
      const m = S.scr_dark_marker(g.heromakex[i], g.heromakey[i], spr[i]);
      const tx = g.introx?.[i] ?? m.x, ty = g.introy?.[i] ?? m.y;
      m.direction = point_direction(m.x, m.y, tx, ty);
      m.speed = point_distance(m.x, m.y, tx, ty) / 10;
      m.depth = 200 - i * 20;
      this.c.push(m);
    }
    this.alarm[0] = 10;
    if (g.flag[9] == 1) mus_volume(g.batmusic[0], 0, this.alarm[0]);
  }
  alarm0() {
    for (const m of this.c) m.speed = 0;
    this.alarm[1] = 25;
  }
  alarm1() {
    // flag[241]: 6 = JEVIL defeated by damage (set by obj_joker), else spared with Pacify.
    const killed = g.flag[241] == 6 || (g.flag[51] != 3 && g.monsterhp[0] <= 0);
    S.startEnding(killed ? 'fight' : 'spare');
  }
  draw() {}
}
defineObject('obj_endbattle', EndBattle);

void G;
