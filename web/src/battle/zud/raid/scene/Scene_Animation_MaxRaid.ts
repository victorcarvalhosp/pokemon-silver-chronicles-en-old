// Port of Plugins/ZUD Mechanics/[005] Battle_Scene/Scene_Animation_MaxRaid.rb:
// Battle::Scene::Animation::RaidShield (a raid boss's shield appearing or
// breaking on its databox) and ::WaveAttack (the boss shaking and releasing a
// wave of Dynamax energy), and the Battle::Scene methods that play them
// (pbRaidShield, pbWaveAttack; installed on BattleScene by ./index.ts).
//
// NOTE: the shaking loops add half-frame steps (t = 0.5) and read back
// totalDuration, which PictureEx truncates to whole 1/20 s; at 60 Hz the
// shakes don't advance the delay as they do at 40 fps (as in the Ultra Burst
// and Z-Move cinematics' ports).

import type { Viewport } from "../../../../rgss/display";
import { Color } from "../../../../rgss/types";
import { PictureOrigin } from "../../../../ui/scenes/PictureEx";
import type { Battler } from "../../../battler/Battler";
import { PBEffects } from "../../../other/PBEffects";
import { Animation, DX_ANIM_PATH, type SceneSprites } from "../../../scene/animationBase";
import type { BattleScene } from "../../../scene/BattleScene";

export const RAID_SHIELD_GRAPHICS = ["Graphics/Plugins/ZUD/Battle/raid_bar", "Graphics/Plugins/ZUD/Battle/raid_shield"];
export const WAVE_ATTACK_GRAPHICS = [DX_ANIM_PATH + "pulse"];

//===============================================================================
// Raid Shield animation.
//===============================================================================
export class RaidShield extends Animation {
  private index: number;
  private box: unknown = null;
  private shieldTotalhp = 0;
  private shieldHp = 0;
  private shieldBarName = "";
  private shieldHpName = "";

  constructor(sprites: SceneSprites, viewport: Viewport | null, battler: Battler) {
    super(sprites, viewport);
    this.index = battler.index;
    if (battler.effects[PBEffects.MaxRaidBoss]) {
      this.box = sprites[`dataBox_${this.index}`];
      this.shieldTotalhp = battler.effects[PBEffects.MaxShieldHP];
      this.shieldHp = battler.effects[PBEffects.RaidShield];
      this.shieldBarName = "Graphics/Plugins/ZUD/Battle/raid_bar";
      this.shieldHpName = "Graphics/Plugins/ZUD/Battle/raid_shield";
    }
    this.createProcesses();
  }

  override createProcesses(): void {
    if (!this.box) return;
    if (![0, this.shieldTotalhp].includes(this.shieldHp)) return;
    let delay = 0;
    const xpos = 137 - (2 + Math.floor((this.shieldTotalhp * 26) / 2));
    const ypos = 46;
    const bar = this.addNewSprite(xpos, ypos, this.shieldBarName);
    bar.setSrcSize(delay, 2 + this.shieldTotalhp * 26, 12);
    bar.setZ(delay, 999);
    if (this.shieldHp === this.shieldTotalhp) {
      //---------------------------------------------------------------------------
      // Animation for creating shield.
      //---------------------------------------------------------------------------
      const pictureHP = [];
      for (let i = 1; i <= this.shieldTotalhp; i++) {
        const hp = this.addNewSprite(xpos, ypos, this.shieldHpName);
        hp.setSrcSize(delay, 2 + i * 26, 12);
        hp.setVisible(delay, false);
        hp.setOpacity(delay, 0);
        hp.setZ(delay, 999);
        pictureHP.push(hp);
      }
      for (const p of pictureHP) {
        delay += 2;
        p.setSE(delay, "Vs sword");
        p.setVisible(delay, true);
        p.moveOpacity(delay, 4, 255);
      }
    } else {
      //---------------------------------------------------------------------------
      // Animation for breaking shield.
      //---------------------------------------------------------------------------
      const t = 0.5;
      for (let i = 0; i < 16; i++) {
        bar.moveXY(delay, t, xpos + 2, ypos);
        bar.moveXY(delay + t, t, xpos - 2, ypos);
        delay = bar.totalDuration();
      }
      bar.moveColor(1, delay, new Color(255, 255, 255, 150));
      bar.setXY(delay, xpos, ypos);
      bar.setSE(delay + 1, "Anim/Crash");
      bar.moveOpacity(delay, 4, 0);
    }
  }
}

//===============================================================================
// Wave Attack animation.
//===============================================================================
export class WaveAttack extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxBattler: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const sprite = this.sprites[`pokemon_${this.idxBattler}`];
    if (!sprite) return;
    let delay = 0;
    const xpos = sprite.x as number;
    const ypos = sprite.y as number;
    const zpos = sprite.z as number;
    const color = sprite.color as Color;
    const battler = this.addSprite(sprite, PictureOrigin.BOTTOM);
    const wave = this.addNewSprite(xpos, ypos - 60, DX_ANIM_PATH + "pulse", PictureOrigin.CENTER);
    wave.setColor(delay, color);
    wave.setZoom(delay, 0);
    wave.setZ(delay, zpos);
    const t = 0.5;
    for (let i = 0; i < 8; i++) {
      battler.moveXY(delay, t, xpos + 4, ypos);
      battler.moveXY(delay + t, t, xpos - 4, ypos);
      if (i === 0) battler.setSE(delay + t, "Anim/fog2");
      delay = battler.totalDuration();
    }
    wave.moveZoom(delay, 5, 800);
    battler.moveColor(1, delay, new Color(255, 255, 255, 248));
    battler.setXY(delay, xpos, ypos);
    battler.moveColor(delay, 4, color);
  }
}

//===============================================================================
// The Battle::Scene methods that play them.
//===============================================================================
export const raidSceneMethods = {
  async pbRaidShield(this: BattleScene, battler: Battler): Promise<void> {
    const shieldAnim = new RaidShield(this.sprites, this.viewport, battler);
    for (;;) {
      shieldAnim.update();
      await this.pbUpdate();
      if (shieldAnim.animDone()) break;
    }
    shieldAnim.dispose();
  },

  async pbWaveAttack(this: BattleScene, idxBattler: number): Promise<void> {
    const waveAnim = new WaveAttack(this.sprites, this.viewport, idxBattler);
    for (;;) {
      waveAnim.update();
      await this.pbUpdate();
      if (waveAnim.animDone()) break;
    }
    waveAnim.dispose();
  },
};
