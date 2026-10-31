// Victory screens (by fighting or by sparing): JEVIL's closing words from obj_jokerbattleevent in
// the dark-world text box, the reward line, then "try again" / title.
import {
  G, global, Instance, defineObject, defineScript, S, instance_create, instance_exists, draw_sprite_ext,
  draw_set_color, draw_set_font, draw_set_alpha, draw_rectangle, L,
} from '../runtime/gm.js?v=20261031024711';
import { snd_play } from '../runtime/audio.js?v=20261031024711';
import { startBattle } from '../battle/setup.js?v=20261031024711';
import { gotoRoom, scr_darkbox, fadeOut, centerText } from './common.js?v=20261031024711';

const E = n => L('obj_jokerbattleevent_slash_Step_0_gml_' + n + '_0');
const LINES = {
  fight: { jevil: [294, 295, 296, 297, 298, 299, 300, 301, 302, 303], reward: 344, title: 'JEVIL WAS DEFEATED!', sprite: 'spr_joker_teleport' },
  spare: { jevil: [307, 308, 309, 310, 311, 312, 313, 314, 315, 316], reward: 357, title: 'JEVIL WAS PACIFIED!', sprite: 'spr_joker_tired' },
};

class Ending extends Instance {
  create() {
    this.depth = 2;
    this.kind = 'fight';
    this.con = 0;
    this.t = 0;
    this.writer = null;
    this.cur_jewel = 0;
    this.boxalpha = 0;
    this.titlealpha = 0;
  }
  say(lines, typer) {
    global.fc = 0;
    global.typer = typer;
    global.msg = new Array(100).fill('%%');
    lines.forEach((s, i) => { global.msg[i] = s; });
    this.writer = instance_create(58, 340, 'obj_writer');
    this.writer.dialoguer = 1;
  }
  step() {
    const d = LINES[this.kind];
    this.t += 1;
    if (this.con == 0 && this.t >= 30) {
      this.con = 1;
      this.say(d.jevil.map(E), 35);
    }
    if (this.con == 1 && !instance_exists(this.writer)) {
      this.con = 2;
      snd_play('snd_item');
      this.say([E(d.reward)], 6);
    }
    if (this.con == 2 && !instance_exists(this.writer)) {
      this.con = 3;
      this.t = 0;
      const menu = instance_create(236, 360, 'obj_sim_heartmenu');
      menu.setup(['TRY AGAIN', 'TITLE'], (i) => {
        fadeOut(20, () => (i == 0 ? startBattle({ intro: G.settings?.intro !== false }) : S.startTitle()));
      }, 'fnt_mainbig', 32);
    }
  }
  draw() {
    const d = LINES[this.kind];
    const jx = 320, jy = 190 + Math.sin(this.t / 15) * 4;
    const a = this.con >= 3 ? 1 : Math.min(1, this.t / 30);
    draw_sprite_ext(d.sprite, 0, jx, jy, 2, 2, 0, 0xffffff, a);
    if (this.con >= 1 && this.con <= 2) {
      this.boxalpha = 1;
      draw_set_color(0);
      draw_rectangle(38, 326, 602, 464, false);
      scr_darkbox(this, 24, 312, 616, 478);
    }
    if (this.con >= 3) {
      this.titlealpha = Math.min(1, this.titlealpha + 0.05);
      draw_set_alpha(this.titlealpha);
      draw_set_font('fnt_mainbig');
      draw_set_color(this.kind == 'spare' ? 0xffff00 : 0xffffff);
      centerText(320, 290, d.title);
      draw_set_alpha(1);
    }
  }
}
defineObject('obj_sim_ending', Ending);

defineScript('startEnding', (kind) => {
  gotoRoom();
  const e = instance_create(0, 0, 'obj_sim_ending');
  e.kind = kind === 'spare' ? 'spare' : 'fight';
});
