// obj_heroparent and the three party members: poses, attack hit (Alarm_1), spell/item cast (Alarm_4).
import {
  global, Instance, defineObject, S, instance_create, instance_exists, withObj, random, round, ceil,
  merge_color, draw_sprite_ext, d3d_set_fog, sprite_get_number,
} from '../runtime/gm.js';
import { snd_play, snd_stop, snd_pitch } from '../runtime/audio.js';
import { withInst } from './common.js';

const g = global;

export class HeroParent extends Instance {
  create() {
    this.depth = 100;
    this.sprite_index = 'spr_krisb_idle';
    this.char = 0;
    this.myself = 0;
    this.points = 0;
    this.becomeflash = 0;
    this.state = 0;
    this.flash = 0;
    this.siner = 0;
    this.fsiner = 0;
    this.attacktimer = 0;
    this.attacked = 0;
    this.combatdarken = 1;
    this.darkentimer = 0;
    this.darkify = 0;
    this.image_xscale = 2;
    this.image_yscale = 2;
    this.myheight = 37;
    this.mywidth = 34;
    this.index = 0;
    this.specdraw = 0;
    this.is_auto_susie = 0;
    this.normalsprite = 'spr_krisr_dark';
    this.idlesprite = 'spr_krisb_idle';
    this.actreadysprite = 'spr_krisb_actready';
    this.actsprite = 'spr_krisb_act';
    this.hurtsprite = 'spr_krisb_hurt';
    this.defendsprite = 'spr_krisb_attackready';
    this.attackreadysprite = 'spr_krisb_attackready';
    this.attacksprite = 'spr_krisb_attack';
    this.itemsprite = 'spr_krisb_item';
    this.itemreadysprite = 'spr_krisb_itemready';
    this.spellreadysprite = 'spr_ralseib_spellready';
    this.spellsprite = 'spr_ralseib_spell';
    this.defeatsprite = 'spr_krisb_defeat';
    this.victorysprite = 'spr_krisb_victory';
    this.victoryanim = 0;
    this.actframes = 7;
    this.victoryframes = 9;
    this.defendframes = 1;
    this.itemframes = 3;
    this.attackframes = 3;
    this.attackspeed = 0.5;
    this.actreturnframes = 10;
    this.spellframes = 10;
    this.hurt = 0;
    this.hurttimer = 0;
    this.hurtindex = 0;
    this.acttimer = 0;
    this.defendtimer = 0;
    this.itemed = 0;
    this.tu = 0;
    this.thissprite = this.idlesprite;
    this.setup();
  }

  setup() {}

  draw() {
    const me = this.myself;
    if (g.hp[g.char[me]] > 0) {
      if (g.myfight == 3 && g.faceaction[me] == 6) this.state = 6;
      if (this.state == 0 && this.hurt == 0) {
        this.acttimer = 0;
        this.thissprite = this.idlesprite;
        if (g.faceaction[me] == 1) this.thissprite = this.attackreadysprite;
        if (g.faceaction[me] == 3) this.thissprite = this.itemreadysprite;
        if (g.faceaction[me] == 2) this.thissprite = this.spellreadysprite;
        if (g.faceaction[me] == 6) this.thissprite = this.actreadysprite;
        if (g.charcond[me] == 5) {
          this.thissprite = this.defeatsprite;
          g.faceaction[me] = 9;
        }
        if (g.faceaction[me] == 4) {
          this.thissprite = this.defendsprite;
          this.index = this.defendtimer;
          if (this.defendtimer < this.defendframes) this.defendtimer += 0.5;
        } else {
          this.defendtimer = 0;
          this.index = this.siner / 5;
        }
        this.siner += 1;
      }
      if (this.state == 1 && this.hurt == 0) {
        this.siner += 1;
        if (this.attacked == 0) {
          snd_stop('snd_laz_c');
          if (this.object_index == 'obj_herokris') snd_play('snd_laz_c');
          if (this.object_index == 'obj_heroralsei') snd_pitch(snd_play('snd_laz_c'), 1.15);
          if (this.object_index == 'obj_herosusie') snd_pitch(snd_play('snd_laz_c'), 0.9);
          if (this.points == 150) {
            snd_stop('snd_criticalswing');
            snd_play('snd_criticalswing');
            for (let k = 0; k < 3; k++) {
              const anim = instance_create(this.x + this.mywidth + random(50), this.y + 30 + random(30), 'obj_afterimage');
              anim.sprite_index = 'spr_lightfairy';
              anim.image_speed = 0.25;
              anim.depth = -20;
              anim.image_xscale = 2;
              anim.image_yscale = 2;
              anim.hspeed = 2 + random(4);
              anim.friction = -0.25;
            }
          }
          this.attacked = 1;
          this.alarm[1] = 10;
        }
        this.image_index = this.attacktimer < this.attackframes ? this.attacktimer : this.attackframes;
        this.thissprite = this.attacksprite;
        this.index = this.image_index;
        this.attacktimer += this.attackspeed;
      }
      if (this.state == 2 && this.hurt == 0) {
        this.siner += 1;
        if (this.itemed == 0) {
          this.itemed = 1;
          this.alarm[4] = 15;
        }
        this.image_index = this.attacktimer < this.spellframes ? this.attacktimer : this.spellframes;
        if (S.scr_monsterpop() == 0) this.attacktimer = 0;
        this.thissprite = this.spellsprite;
        this.index = this.image_index;
        this.attacktimer += 0.5;
      }
      if (this.state == 4 && this.hurt == 0) {
        this.siner += 1;
        if (this.itemed == 0) {
          this.itemed = 1;
          this.alarm[4] = 15;
        }
        this.image_index = this.attacktimer < this.itemframes ? this.attacktimer : this.itemframes;
        if (S.scr_monsterpop() == 0) this.attacktimer = 0;
        this.index = this.image_index;
        this.thissprite = this.itemsprite;
        this.attacktimer += 0.5;
      }
      if (this.state == 6) {
        if (g.myfight == 3) {
          if (this.acttimer < this.actframes) this.acttimer += 0.5;
        } else this.acttimer += 0.5;
        this.thissprite = this.actsprite;
        this.index = this.acttimer;
        if (this.acttimer >= this.actreturnframes) {
          this.acttimer = 0;
          this.state = 0;
          g.faceaction[me] = 0;
        }
      }
      if (this.state == 7) {
        this.hurt = 0;
        this.hurttimer = 0;
        if (this.victoryanim < this.victoryframes) {
          this.thissprite = this.victorysprite;
          this.index = this.victoryanim;
          this.victoryanim += 0.334;
        } else {
          this.thissprite = this.normalsprite;
          this.index = 0;
        }
      }
      if (this.hurt == 1) {
        this.hurtindex = this.hurttimer / 2;
        if (this.hurtindex > 2) this.hurtindex = 2;
        if (g.charcond[me] == 5) {
          g.faceaction[me] = 5;
          g.charmove[me] = 1;
          g.charcond[me] = 0;
        }
        if (g.faceaction[me] == 0) g.faceaction[me] = 5;
        if (g.faceaction[me] != 4) {
          this.specdraw = 1;
          draw_sprite_ext(this.hurtsprite, this.hurtindex, this.x - 20 + this.hurtindex * 10, this.y, 2, 2, 0, this.image_blend, this.image_alpha);
        } else {
          this.specdraw = 1;
          this.thissprite = this.defendsprite;
          this.index = this.defendtimer;
          draw_sprite_ext(this.defendsprite, this.defendtimer, this.x - 20 + this.hurtindex * 10, this.y, 2, 2, 0, this.image_blend, this.image_alpha);
        }
        if (this.hurttimer > 15) {
          this.hurttimer = 0;
          this.hurt = 0;
          if (g.faceaction[me] == 5) g.faceaction[me] = 0;
        }
        this.hurttimer += 1;
      }
    } else {
      g.charcond[me] = 0;
      this.hurttimer = 0;
      this.hurt = 0;
      this.thissprite = this.defeatsprite;
      this.index = 0;
      this.siner += 1;
    }
    if (this.specdraw == 0) {
      this.sprite_index = this.thissprite;
      this.image_index = this.index;
      draw_sprite_ext(this.thissprite, this.index, this.x, this.y, 2, 2, 0, this.image_blend, this.image_alpha);
      if (this.flash == 1) {
        this.fsiner += 1;
        d3d_set_fog(true, 0xffffff, 0, 1);
        draw_sprite_ext(this.thissprite, this.index, this.x, this.y, 2, 2, 0, this.image_blend, -Math.cos(this.fsiner / 5) * 0.4 + 0.6);
        d3d_set_fog(false, 0, 0, 0);
      }
    }
    this.specdraw = 0;
    if (this.becomeflash == 0) this.flash = 0;
    if (g.targeted[me] == 1) {
      if (g.mnfight == 1) draw_sprite_ext('spr_chartarget', this.siner / 10, this.x, this.y, 2, 2, 0, 0xffffff, 1);
    } else if (this.combatdarken == 1 && instance_exists('obj_darkener')) {
      if (this.darkify == 1) {
        if (this.darkentimer < 15) this.darkentimer += 1;
        this.image_blend = merge_color(0xffffff, 0, this.darkentimer / 30);
      }
    }
    if (this.darkify == 0) {
      if (this.darkentimer > 0) this.darkentimer -= 3;
      this.image_blend = merge_color(0xffffff, 0, this.darkentimer / 30);
    }
    this.becomeflash = 0;
  }

  // The FIGHT hit lands 10 frames after the bolts resolve.
  alarm1() {
    const me = this.myself;
    g.faceaction[me] = 0;
    S.scr_retarget(this, me);
    if (this.cancelattack != 0) return;
    const t = g.chartarget[me];
    const dm = instance_create(g.monsterx[t], g.monstery[t] - g.hittarget[t] * 20 + 20, 'obj_dmgwriter');
    dm.type = this.char - 1;
    dm.delay = 8;
    let damage = round(g.battleat[me] * this.points / 20 - g.monsterdf[t] * 3);
    if (g.monstertype[t] == 19) damage = ceil(damage * 0.3);
    if (damage < 0) damage = 0;
    this.damage = damage;
    if (damage == 0) {
      dm.delay = 2;
      withInst(g.monsterinstance[t], m => {
        if (m.hurttimer <= 15 && m.candodge == 1) {
          m.dodgetimer = 0;
          m.state = 4;
        }
      });
    }
    dm.damage = damage;
    g.hittarget[t] += 1;
    g.monsterhp[t] -= damage;
    if (damage > 0) {
      if (g.monstertype[0] != 20) S.scr_tensionheal(round(this.points / 10));
      if (g.monstertype[0] == 20) S.scr_tensionheal(round(this.points / 15));
      const attack = instance_create(g.monsterx[t] + random(6), g.monstery[t] + random(6), 'obj_basicattack');
      if (this.object_index == 'obj_herosusie') {
        attack.sprite_index = 'spr_attack_mash2';
        attack.image_speed = 0.5;
        attack.maxindex = 4;
        snd_play('snd_impact');
        instance_create(0, 0, 'obj_shake');
      }
      if (this.object_index == 'obj_heroralsei') {
        attack.sprite_index = 'spr_attack_slap1';
        attack.maxindex = 4;
        attack.image_speed = 0.5;
      }
      if (this.points == 150) {
        attack.image_xscale = 2.5;
        attack.image_yscale = 2.5;
      }
      withInst(g.monsterinstance[t], m => {
        m.shakex = 9;
        m.state = 3;
        m.hurttimer = 30;
      });
      if (instance_exists(g.monsterinstance[t])) g.monsterinstance[t].hurtamt = damage;
    }
    if (g.monsterhp[t] <= 0) withInst(g.monsterinstance[t], m => S.scr_monsterdefeat(m));
  }

  // The spell/item takes effect 15 frames after the cast pose starts.
  alarm4() {
    g.faceaction[this.myself] = 0;
    if (S.scr_monsterpop() > 0) S.scr_spell(this, g.charspecial[this.myself], this.myself);
    this.state = 0;
    this.attacktimer = 0;
  }
}
defineObject('obj_heroparent', HeroParent);

class HeroKris extends HeroParent {
  setup() {
    this.normalsprite = 'spr_krisr_dark';
    this.idlesprite = 'spr_krisb_idle';
    this.defendsprite = 'spr_krisb_defend';
    this.hurtsprite = 'spr_krisb_hurt';
    this.attackreadysprite = 'spr_krisb_attackready';
    this.attacksprite = 'spr_krisb_attack';
    this.itemsprite = 'spr_krisb_item';
    this.actreadysprite = 'spr_krisb_actready';
    this.actsprite = 'spr_krisb_act';
    this.itemreadysprite = 'spr_krisb_itemready';
    this.spellreadysprite = 'spr_krisb_actready';
    this.spellsprite = 'spr_krisb_act';
    this.defeatsprite = 'spr_krisb_defeat';
    this.victorysprite = 'spr_krisb_victory';
    this.actframes = 7;
    this.actreturnframes = 10;
    this.attackframes = 6;
    this.itemframes = 6;
    this.defendframes = 5;
    this.spellframes = 10;
    this.attackspeed = 0.5;
    this.victoryframes = sprite_get_number(this.victorysprite);
    this.mywidth = 68;
    this.myheight = 74;
  }
}
defineObject('obj_herokris', HeroKris);

class HeroSusie extends HeroParent {
  setup() {
    this.attackframes = 5;
    this.itemframes = 5;
    this.defendframes = 5;
    this.actframes = 7;
    this.actreturnframes = 10;
    this.spellframes = 8;
    this.attackspeed = 0.5;
    this.normalsprite = 'spr_susier_dark';
    this.idlesprite = 'spr_susieb_idle';
    this.defendsprite = 'spr_susieb_defend';
    this.hurtsprite = 'spr_susieb_hurt';
    this.actreadysprite = 'spr_susieb_actready';
    this.actsprite = 'spr_susieb_act';
    this.attackreadysprite = 'spr_susieb_attackready';
    this.attacksprite = 'spr_susieb_attack';
    if (g.charweapon[2] == 0) {
      this.idlesprite = 'spr_susieb_idle_unarmed';
      this.attackreadysprite = 'spr_susieb_attackready_unarmed';
      this.attacksprite = 'spr_susieb_attack_unarmed';
    }
    this.itemsprite = 'spr_susieb_item';
    this.itemreadysprite = 'spr_susieb_itemready';
    this.spellreadysprite = 'spr_susieb_spellready';
    this.spellsprite = 'spr_susieb_spell';
    this.defeatsprite = 'spr_susieb_defeat';
    this.victorysprite = 'spr_susieb_victory';
    this.victoryframes = sprite_get_number(this.victorysprite);
    this.mywidth = 70;
    this.myheight = 82;
  }
}
defineObject('obj_herosusie', HeroSusie);

class HeroRalsei extends HeroParent {
  setup() {
    this.attackframes = 5;
    this.itemframes = 7;
    this.defendframes = 6;
    this.actframes = 7;
    this.actreturnframes = 10;
    this.attackspeed = 0.5;
    this.normalsprite = 'spr_ralseir';
    this.idlesprite = 'spr_ralseib_idle';
    this.defendsprite = 'spr_ralseib_defend';
    this.hurtsprite = 'spr_ralsei_shock';
    this.attackreadysprite = 'spr_ralseib_attackready';
    this.attacksprite = 'spr_ralseib_attack';
    this.itemsprite = 'spr_ralseib_item';
    this.itemreadysprite = 'spr_ralseib_itemready';
    this.spellreadysprite = 'spr_ralseib_spellready';
    this.spellsprite = 'spr_ralseib_spell';
    this.defeatsprite = 'spr_ralseib_defeat';
    this.victorysprite = 'spr_ralseib_victory';
    this.actreadysprite = 'spr_ralseib_actready';
    this.actsprite = 'spr_ralseib_act';
    this.victoryframes = sprite_get_number(this.victorysprite);
    this.mywidth = 52;
    this.myheight = 86;
  }
}
defineObject('obj_heroralsei', HeroRalsei);

void withObj;
