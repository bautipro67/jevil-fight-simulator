// Game over: obj_gameover_init (the SOUL breaks over the frozen battle), then the Chapter 1
// DEVICE_FAILURE screen ("WILL YOU TRY AGAIN?") with AUDIO_DEFEAT playing.
import {
  G, global, Instance, defineObject, defineScript, S, instance_create, instance_destroy, instance_exists,
  withObj, random, button1_p, left_p, right_p, button2_h, draw_self, draw_sprite_ext, draw_set_color,
  draw_set_alpha, draw_set_font, draw_rectangle, draw_text, string_width, L,
} from '../runtime/gm.js?v=20261030222208';
import { snd_play, snd_free_all, snd_init, mus_loop, mus_volume, mus_stop } from '../runtime/audio.js?v=20261030222208';
import { startBattle } from '../battle/setup.js?v=20261030222208';
import { gotoRoom } from './common.js?v=20261030222208';

// The battle as it looked when the party fell (sprite_create_from_surface).
class Screenshot extends Instance {
  create() { this.depth = 100; this.img = null; }
  draw() {
    if (this.img) G.ctx.drawImage(this.img, G.camX, G.camY);
  }
}
defineObject('obj_sim_screenshot', Screenshot);

class GameoverInit extends Instance {
  create() {
    this.depth = -40000;
    this.sprite_index = 'spr_heart';
    this.image_speed = 0;
    this.visible = false;
    this.bg = instance_create(0, 0, 'obj_sim_screenshot');
    this.timer = 0;
    this.Z_COUNT = 0;
    this.sh = [];
  }
  step() {
    this.timer += 1;
    if (this.timer == 1) snd_free_all();
    if (this.timer == 30) {
      instance_destroy(this.bg);
      this.visible = true;
      this.x = global.heartx;
      this.y = global.hearty;
    }
    if (this.timer == 50) {
      snd_play('snd_break1');
      this.sprite_index = 'spr_heartbreak';
      this.x -= 2;
    }
    if (this.timer == 90) {
      snd_play('snd_break2');
      this.visible = false;
      const pos = [[-2, 0], [0, 3], [2, 6], [8, 0], [10, 3], [12, 6]];
      for (const [dx, dy] of pos) {
        const s = instance_create(this.x + dx, this.y + dy, 'obj_marker');
        s.direction = random(360);
        s.speed = 7;
        s.gravity_direction = 270;
        s.gravity = 0.2;
        s.sprite_index = 'spr_heartshards';
        s.image_speed = 0.2;
        this.sh.push(s);
      }
      if (global.tempflag[3] >= 1) this.timer += 15;
    }
    // Quick retry: one press skips the rest of the heart break (the game needs four).
    if (this.timer >= 50 && this.timer < 150 && button1_p()) this.timer = 150;
    if (this.timer >= 150) S.startFailure();
  }
  draw() { draw_self(this); }
}
defineObject('obj_gameover_init', GameoverInit);

defineScript('startGameover', (p) => {
  gotoRoom({ heartx: p.x, hearty: p.y });
  const go = instance_create(0, 0, 'obj_gameover_init');
  go.bg.img = p.shot;
});

// ---------------------------------------------------------------- DEVICE_FAILURE (320x240 room)

class DeviceChoice extends Instance {
  create() {
    this.NAME = [L('DEVICE_CHOICE_slash_Create_0_gml_22_0'), L('DEVICE_CHOICE_slash_Create_0_gml_23_0')];
    this.NAMEX = [110, 190];
    this.NAMEY = [180, 180];
    this.CURX = 0; // YES preselected so one press retries (the game starts with neither)
    this.IDEALX = 150;
    this.IDEALY = 180;
    this.HEARTX = 150;
    this.HEARTY = 180;
    this.ONEBUFFER = 0;
    this.FINISH = 0;
    this.fadebuffer = 10;
    global.choice = -1;
  }
  step() {
    if (this.fadebuffer > 0) this.ONEBUFFER = 1;
    if (this.fadebuffer < 0 && this.FINISH == 0) {
      if (right_p()) this.CURX = 1;
      if (left_p()) this.CURX = 0;
    }
    if (this.CURX >= 0) {
      draw_set_font('fnt_main');
      this.IDEALX = this.NAMEX[this.CURX] + (string_width(this.NAME[this.CURX]) / 2 - 10);
      this.IDEALY = this.NAMEY[this.CURX];
    } else {
      this.IDEALX = 150;
      this.IDEALY = 180;
    }
    if (Math.abs(this.HEARTX - this.IDEALX) <= 2) this.HEARTX = this.IDEALX;
    if (Math.abs(this.HEARTY - this.IDEALY) <= 2) this.HEARTY = this.IDEALY;
    this.HEARTX += (this.IDEALX - this.HEARTX) * 0.3;
    this.HEARTY += (this.IDEALY - this.HEARTY) * 0.3;
    if (this.FINISH == 0 && button1_p() && this.CURX >= 0 && this.ONEBUFFER < 0) {
      global.choice = this.CURX;
      this.FINISH = 1;
      this.ONEBUFFER = 99;
    }
    this.ONEBUFFER -= 1;
    if (this.FINISH == 0) this.fadebuffer -= 1;
    if (this.FINISH == 1) {
      global.flag[20] = 1;
      if (this.fadebuffer < 0) this.fadebuffer = 0;
      this.fadebuffer += 1;
      if (this.fadebuffer >= 10) instance_destroy(this);
    }
  }
  draw() {
    draw_set_font('fnt_main');
    const xfade = Math.min(1, (10 - this.fadebuffer) / 10);
    draw_sprite_ext('IMAGE_SOUL_BLUR', 0, this.HEARTX, this.HEARTY, 1, 1, 0, 0xffffff, 0.6 * xfade);
    draw_set_alpha(xfade);
    for (let i = 0; i <= 1; i++) {
      draw_set_color(this.CURX == i ? 0xffff00 : 0xffffff);
      draw_text(this.NAMEX[i], this.NAMEY[i], this.NAME[i]);
    }
    draw_set_alpha(1);
  }
}
defineObject('DEVICE_CHOICE', DeviceChoice);

const F = n => L('DEVICE_FAILURE_slash_Step_0_gml_' + n + '_0');

class DeviceFailure extends Instance {
  create() {
    this.depth = 10;
    this.EVENT = 0;
    this.FADEFACTOR = 0;
    this.WHITEFADE = 0;
    this.FADEUP = 0;
    this.DARK_WAIT = 0;
    global.flag[20] = 0;
    global.flag[6] = 1;
    global.typer = 667;
    this.music = null;
  }
  alarm4() { this.EVENT += 1; }
  writer(x, y, msg) {
    global.typer = 667;
    global.fc = 0;
    global.msg[0] = msg;
    return instance_create(x, y, 'obj_writer');
  }
  step() {
    // Always the game's shorter repeat-death sequence: straight to "WILL YOU TRY AGAIN?".
    const quick = true;
    if (this.EVENT == 1) {
      snd_free_all();
      this.music = snd_init('AUDIO_DEFEAT.ogg');
      mus_loop(this.music);
      this.EVENT = 2;
      this.writer(70, 80, F(10));
      if (quick) withObj('obj_writer', w => instance_destroy(w));
    }
    if (this.EVENT == 0) this.EVENT = 1;
    if (this.EVENT == 2 && !instance_exists('obj_writer')) {
      this.EVENT = 3;
      this.alarm[4] = quick ? 15 : 30;
      this.writer(40, 80, quick ? F(32) : F(28));
    }
    if (this.EVENT == 4) {
      instance_create(100, 120, 'DEVICE_CHOICE');
      this.EVENT = 5;
    }
    if (this.EVENT == 5) {
      if (global.choice == 0) { withObj('obj_writer', w => instance_destroy(w)); this.EVENT = 6; }
      if (global.choice == 1) { withObj('obj_writer', w => instance_destroy(w)); this.EVENT = 26; }
    }
    if (this.EVENT == 6) {
      mus_volume(this.music, 0, 30);
      global.flag[6] = 1;
      this.writer(50, 80, F(68));
      this.EVENT = 7;
      this.alarm[4] = 30;
      if (quick) { withObj('obj_writer', w => instance_destroy(w)); this.alarm[4] = 1; }
    }
    if (this.EVENT == 8) {
      this.WHITEFADE = 1;
      this.FADEUP = quick ? 0.03 : 0.01;
      this.EVENT = 9;
      this.alarm[4] = quick ? 45 : 120;
      global.tempflag[3] += 1;
    }
    if (this.EVENT == 10) {
      this.EVENT = 11;
      mus_stop(this.music);
      startBattle({ intro: G.settings?.intro !== false });
      return;
    }
    if (this.EVENT == 26) {
      mus_volume(this.music, 0, 60);
      this.writer(60, 80, F(103));
      this.EVENT = 27;
    }
    if (this.EVENT == 27 && !instance_exists('obj_writer')) {
      this.EVENT = 28;
      this.DARK_WAIT = 0;
    }
    if (this.EVENT == 28) {
      this.DARK_WAIT += 1;
      if (this.DARK_WAIT >= 90) {
        this.EVENT = 29;
        mus_stop(this.music);
        S.startTitle();
        return;
      }
    }
    if (this.EVENT >= 0 && this.EVENT <= 4 && button2_h()) {
      withObj('obj_writer', w => {
        if (w.pos < w.length - 3) w.pos += 2;
        if (w.specfade <= 0.9) w.specfade -= 0.1;
        if (w.rate <= 1) w.rate = 1;
      });
    }
  }
  draw() {
    draw_set_alpha(this.FADEFACTOR);
    draw_set_color(this.WHITEFADE == 0 ? 0 : 0xffffff);
    draw_rectangle(-10, -10, 999, 999, false);
    draw_set_alpha(1);
    if (this.FADEUP > 0 && this.FADEFACTOR < 1) this.FADEFACTOR += this.FADEUP;
  }
}
defineObject('DEVICE_FAILURE', DeviceFailure);

defineScript('startFailure', () => {
  gotoRoom();
  G.viewScale = 2;
  global.tempflag = global.tempflag || new Array(100).fill(0);
  instance_create(0, 0, 'DEVICE_FAILURE');
});
