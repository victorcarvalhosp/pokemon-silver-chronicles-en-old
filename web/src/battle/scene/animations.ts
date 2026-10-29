// Port of Data/Scripts/011_Battle/004_Scene/008_Battle_Scene_Animations.rb
// (the hardcoded battle animations), plus the ones plugins add or replace:
//   28 Following Pokemon EX (Script Additions/Animations.rb): PokeballPlayerSendOut
//      lets the follower slide into battle instead of being thrown out.
//   29 Essentials Deluxe: RevertBattlerStart/End ([000] Battle_Scene.rb:590-614),
//      ToggleDataBoxes, ToggleBlackBars, SlideSpriteAppear/Disappear, BattlerFlee
//      ([002] Battle Deluxe/Battle_Scene.rb:1-180).

import type { Id } from "../../data/gameData/gameData";
import { Color, Tone } from "../../rgss/types";
import type { Viewport } from "../../rgss/display";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PictureEx, PictureOrigin } from "../../ui/scenes/PictureEx";
import { Animation, BallAnimation, type SceneSprites } from "./animationBase";
import { cryLength } from "./sceneFiles";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import type { SceneBattle, SceneBattler } from "./types";
import type { BattlerSprite } from "./objects";

const SCREEN_W = 512;

/** Things the animations need from Battle::Scene (set by BattleScene.ts). */
export const AnimationHooks: {
  battlerPosition: (index: number, sideSize?: number) => [number, number];
  trainerPosition: (side: number, index?: number, sideSize?: number) => [number, number];
  numBalls: number;
  /** FollowingPkmn.active? (Following Pokemon EX); set by the integrator. */
  followingPkmnActive: () => boolean;
  /** FollowingPkmn::SLIDE_INTO_BATTLE */
  followerSlidesIntoBattle: boolean;
  /** The scene, for SlideSpriteAppear/Disappear (guest speaker state). */
} = {
  battlerPosition: () => [0, 0],
  trainerPosition: () => [0, 0],
  numBalls: 6,
  followingPkmnActive: () => false,
  followerSlidesIntoBattle: true,
};

//===============================================================================
// Shows the battle scene fading in while elements slide around into place
//===============================================================================
export class Intro extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private battle: SceneBattle) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const appearTime = 20; // This is in 1/20 seconds
    // Background
    if (this.sprites.battle_bg2) {
      this.makeSlideSprite("battle_bg", 0.5, appearTime);
      this.makeSlideSprite("battle_bg2", 0.5, appearTime);
    }
    // Bases
    this.makeSlideSprite("base_0", 1, appearTime, PictureOrigin.BOTTOM);
    this.makeSlideSprite("base_1", -1, appearTime, PictureOrigin.CENTER);
    // Player sprite, partner trainer sprite
    (this.battle.player ?? []).forEach((_p, i) => {
      this.makeSlideSprite(`player_${i + 1}`, 1, appearTime, PictureOrigin.BOTTOM);
    });
    // Opposing trainer sprite(s) or wild Pokémon sprite(s)
    if (this.battle.trainerBattle()) {
      this.battle.opponent!.forEach((_p, i) => {
        this.makeSlideSprite(`trainer_${i + 1}`, -1, appearTime, PictureOrigin.BOTTOM);
      });
    } else { // Wild battle
      this.battle.pbParty(1).forEach((_pkmn, i) => {
        const idxBattler = 2 * i + 1;
        this.makeSlideSprite(`pokemon_${idxBattler}`, -1, appearTime, PictureOrigin.BOTTOM);
      });
    }
    // Shadows
    for (let i = 0; i < this.battle.battlers.length; i++) {
      this.makeSlideSprite(`shadow_${i}`, i % 2 === 0 ? 1 : -1, appearTime, PictureOrigin.CENTER);
    }
    // Fading blackness over whole screen
    const blackScreen = this.addNewSprite(0, 0, "Graphics/Battle animations/black_screen");
    blackScreen.setZ(0, 999);
    blackScreen.moveOpacity(0, 8, 0);
    // Fading blackness over command bar
    const blackBar = this.addNewSprite(this.sprites.cmdBar_bg.x, this.sprites.cmdBar_bg.y,
      "Graphics/Battle animations/black_bar");
    blackBar.setZ(0, 998);
    blackBar.moveOpacity(Math.floor((appearTime * 3) / 4), Math.floor(appearTime / 4), 0);
  }

  makeSlideSprite(spriteName: string, deltaMult: number, appearTime: number, origin: number | null = null): void {
    // If deltaMult is positive, the sprite starts off to the right and moves
    // left (for sprites on the player's side and the background).
    if (!this.sprites[spriteName]) return;
    const s = this.addSprite(this.sprites[spriteName], origin ?? PictureOrigin.TOP_LEFT);
    s.setDelta(0, Math.floor(SCREEN_W * deltaMult), 0);
    s.moveDelta(0, appearTime, Math.floor(-SCREEN_W * deltaMult), 0);
  }
}

//===============================================================================
// Shows wild Pokémon fading back to their normal color, and triggers their intro
// animations
//===============================================================================
export class Intro2 extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private sideSize: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    for (let i = 0; i < this.sideSize; i++) {
      const idxBattler = 2 * i + 1;
      if (!this.sprites[`pokemon_${idxBattler}`]) continue;
      const battler = this.addSprite(this.sprites[`pokemon_${idxBattler}`], PictureOrigin.BOTTOM);
      battler.moveTone(0, 4, new Tone(0, 0, 0, 0));
      battler.setCallback(10 * i, [this.sprites[`pokemon_${idxBattler}`], "pbPlayIntroAnimation"]);
    }
  }
}

//===============================================================================
// Makes a side's party bar and balls appear
//===============================================================================
export class LineupAppear extends Animation {
  static readonly BAR_DISPLAY_WIDTH = 248;

  constructor(sprites: SceneSprites, viewport: Viewport | null, private side: number, private party: (Pokemon | null)[],
    private partyStarts: number[], private fullAnim: boolean) { // fullAnim: true at start of battle, false when switching
    super(sprites, viewport);
    this.resetGraphics(sprites);
    this.createProcesses();
  }

  resetGraphics(sprites: SceneSprites): void {
    const bar = sprites[`partyBar_${this.side}`];
    let barX = 0, barY = 0, ballX = 0, ballY = 0;
    switch (this.side) {
      case 0: // Player's lineup
        barX = SCREEN_W - LineupAppear.BAR_DISPLAY_WIDTH;
        barY = 384 - 142;
        ballX = barX + 44;
        ballY = barY - 30;
        break;
      case 1: // Opposing lineup
        barX = LineupAppear.BAR_DISPLAY_WIDTH;
        barY = 114;
        ballX = barX - 44 - 30; // 30 is width of ball icon
        ballY = barY - 30;
        barX -= bar.bitmap.width;
        break;
    }
    const ballXdiff = 32 * (1 - 2 * this.side);
    bar.x = barX;
    bar.y = barY;
    bar.opacity = 255;
    bar.visible = false;
    for (let i = 0; i < AnimationHooks.numBalls; i++) {
      const ball = sprites[`partyBall_${this.side}_${i}`];
      ball.x = ballX;
      ball.y = ballY;
      ball.opacity = 255;
      ball.visible = false;
      ballX += ballXdiff;
    }
  }

  getPartyIndexFromBallIndex(idxBall: number): number {
    // Player's lineup (just show balls for player's party)
    if (this.side === 0) {
      if (this.partyStarts.length < 2) return idxBall;
      if (idxBall < this.partyStarts[1]!) return idxBall;
      return -1;
    }
    // Opposing lineup
    // NOTE: This doesn't work well for 4+ opposing trainers.
    const ballsPerTrainer = Math.floor(AnimationHooks.numBalls / this.partyStarts.length); // 6/3/2
    const startsIndex = Math.floor(idxBall / ballsPerTrainer);
    const teamIndex = idxBall % ballsPerTrainer;
    const ret = this.partyStarts[startsIndex]! + teamIndex;
    if (startsIndex < this.partyStarts.length - 1 && ret >= this.partyStarts[startsIndex + 1]!) {
      // There is a later trainer, don't spill over into its team
      return -1;
    }
    return ret;
  }

  override createProcesses(): void {
    const bar = this.addSprite(this.sprites[`partyBar_${this.side}`]);
    bar.setVisible(0, true);
    const dir = this.side === 0 ? 1 : -1;
    bar.setDelta(0, Math.floor((dir * SCREEN_W) / 2), 0);
    bar.moveDelta(0, 8, Math.floor((-dir * SCREEN_W) / 2), 0);
    const delay = bar.totalDuration();
    for (let i = 0; i < AnimationHooks.numBalls; i++) {
      this.createBall(i, this.fullAnim ? delay + i * 2 : 0, dir);
    }
  }

  createBall(idxBall: number, delay: number, dir: number): void {
    // Choose ball's graphic
    const idxParty = this.getPartyIndexFromBallIndex(idxBall);
    let graphicFilename = "Graphics/Pictures/Battle/icon_ball_empty";
    const pkmn = idxParty >= 0 && idxParty < this.party.length ? this.party[idxParty] : null;
    if (pkmn) {
      if (!pkmn.able()) {
        graphicFilename = "Graphics/Pictures/Battle/icon_ball_faint";
      } else if (pkmn.status !== "NONE") {
        graphicFilename = "Graphics/Pictures/Battle/icon_ball_status";
      } else {
        graphicFilename = "Graphics/Pictures/Battle/icon_ball";
      }
    }
    // Set up ball sprite
    const ball = this.addSprite(this.sprites[`partyBall_${this.side}_${idxBall}`]);
    ball.setVisible(delay, true);
    ball.setName(delay, graphicFilename);
    ball.setDelta(delay, Math.floor((dir * SCREEN_W) / 2), 0);
    ball.moveDelta(delay, 8, Math.floor((-dir * SCREEN_W) / 2), 0);
  }
}

//===============================================================================
// Makes a Pokémon's data box appear
//===============================================================================
export class DataBoxAppear extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxBox: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    if (!this.sprites[`dataBox_${this.idxBox}`]) return;
    const box = this.addSprite(this.sprites[`dataBox_${this.idxBox}`]);
    box.setVisible(0, true);
    const dir = this.idxBox % 2 === 0 ? 1 : -1;
    box.setDelta(0, Math.floor((dir * SCREEN_W) / 2), 0);
    box.moveDelta(0, 8, Math.floor((-dir * SCREEN_W) / 2), 0);
  }
}

//===============================================================================
// Makes a Pokémon's data box disappear
//===============================================================================
export class DataBoxDisappear extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxBox: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const s = this.sprites[`dataBox_${this.idxBox}`];
    if (!s || !s.visible) return;
    const box = this.addSprite(s);
    const dir = this.idxBox % 2 === 0 ? 1 : -1;
    box.moveDelta(0, 8, Math.floor((dir * SCREEN_W) / 2), 0);
    box.setVisible(8, false);
  }
}

//===============================================================================
// Makes a Pokémon's ability bar appear
//===============================================================================
export class AbilitySplashAppear extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private side: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    if (!this.sprites[`abilityBar_${this.side}`]) return;
    const bar = this.addSprite(this.sprites[`abilityBar_${this.side}`]);
    bar.setVisible(0, true);
    const dir = this.side === 0 ? 1 : -1;
    bar.moveDelta(0, 8, Math.floor((dir * SCREEN_W) / 2), 0);
  }
}

//===============================================================================
// Makes a Pokémon's ability bar disappear
//===============================================================================
export class AbilitySplashDisappear extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private side: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    if (!this.sprites[`abilityBar_${this.side}`]) return;
    const bar = this.addSprite(this.sprites[`abilityBar_${this.side}`]);
    const dir = this.side === 0 ? -1 : 1;
    bar.moveDelta(0, 8, Math.floor((dir * SCREEN_W) / 2), 0);
    bar.setVisible(8, false);
  }
}

//===============================================================================
// Make an enemy trainer slide on-screen from the right. Makes the previous
// trainer slide off to the right first if it is on-screen.
// Used at the end of battle.
//===============================================================================
export class TrainerAppear extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxTrainer: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    let delay = 0;
    // Make old trainer sprite move off-screen first if necessary
    if (this.idxTrainer > 0 && this.sprites[`trainer_${this.idxTrainer}`].visible) {
      const oldTrainer = this.addSprite(this.sprites[`trainer_${this.idxTrainer}`], PictureOrigin.BOTTOM);
      oldTrainer.moveDelta(delay, 8, Math.floor(SCREEN_W / 4), 0);
      oldTrainer.setVisible(delay + 8, false);
      delay = oldTrainer.totalDuration();
    }
    // Make new trainer sprite move on-screen
    if (this.sprites[`trainer_${this.idxTrainer + 1}`]) {
      let [trainerX, trainerY] = AnimationHooks.trainerPosition(1);
      trainerX += 64 + Math.floor(SCREEN_W / 4);
      const newTrainer = this.addSprite(this.sprites[`trainer_${this.idxTrainer + 1}`], PictureOrigin.BOTTOM);
      newTrainer.setVisible(delay, true);
      newTrainer.setXY(delay, trainerX, trainerY);
      newTrainer.moveDelta(delay, 8, -Math.floor(SCREEN_W / 4), 0);
    }
  }
}

//===============================================================================
// Shows the player (and partner) and the player party lineup sliding off screen.
// Shows the player's/partner's throwing animation (if they have one).
// Doesn't show the ball thrown or the Pokémon.
//===============================================================================
export class PlayerFade extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private fullAnim = false) { // True at start of battle, false when switching
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    // NOTE: The movement speeds of trainers/bar/balls are all different.
    // Move trainer sprite(s) off-screen
    const spriteNameBase = "player";
    let i = 1;
    while (this.sprites[`${spriteNameBase}_${i}`]) {
      const pl = this.sprites[`${spriteNameBase}_${i}`];
      i += 1;
      if (!pl.visible || pl.x < 0) continue;
      const trainer = this.addSprite(pl, PictureOrigin.BOTTOM);
      trainer.moveDelta(0, 16, -Math.floor(SCREEN_W / 2), 0);
      // Animate trainer sprite(s) if they have multiple frames
      if (pl.bitmap && !pl.bitmap.isDisposed() && pl.bitmap.width >= pl.bitmap.height * 2) {
        const size = pl.srcRect.width; // Width per frame
        trainer.setSrc(0, size, 0);
        trainer.setSrc(5, size * 2, 0);
        trainer.setSrc(7, size * 3, 0);
        trainer.setSrc(9, size * 4, 0);
      }
      trainer.setVisible(16, false);
    }
    // Move and fade party bar/balls
    const delay = 3;
    if (this.sprites.partyBar_0?.visible) {
      const partyBar = this.addSprite(this.sprites.partyBar_0);
      if (this.fullAnim) partyBar.moveDelta(delay, 16, -Math.floor(SCREEN_W / 4), 0);
      partyBar.moveOpacity(delay, 12, 0);
      partyBar.setVisible(delay + 12, false);
      partyBar.setOpacity(delay + 12, 255);
    }
    for (let j = 0; j < AnimationHooks.numBalls; j++) {
      const s = this.sprites[`partyBall_0_${j}`];
      if (!s || !s.visible) continue;
      const partyBall = this.addSprite(s);
      if (this.fullAnim) partyBall.moveDelta(delay + 2 * j, 16, -SCREEN_W, 0);
      partyBall.moveOpacity(delay, 12, 0);
      partyBall.setVisible(delay + 12, false);
      partyBall.setOpacity(delay + 12, 255);
    }
  }
}

//===============================================================================
// Shows the enemy trainer(s) and the enemy party lineup sliding off screen.
// Doesn't show the ball thrown or the Pokémon.
//===============================================================================
export class TrainerFade extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private fullAnim = false) { // True at start of battle, false when switching
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    // NOTE: The movement speeds of trainers/bar/balls are all different.
    // Move trainer sprite(s) off-screen
    const spriteNameBase = "trainer";
    let i = 1;
    while (this.sprites[`${spriteNameBase}_${i}`]) {
      const trSprite = this.sprites[`${spriteNameBase}_${i}`];
      i += 1;
      if (!trSprite.visible || trSprite.x > SCREEN_W) continue;
      const trainer = this.addSprite(trSprite, PictureOrigin.BOTTOM);
      trainer.moveDelta(0, 16, Math.floor(SCREEN_W / 2), 0);
      trainer.setVisible(16, false);
    }
    // Move and fade party bar/balls
    const delay = 3;
    if (this.sprites.partyBar_1?.visible) {
      const partyBar = this.addSprite(this.sprites.partyBar_1);
      if (this.fullAnim) partyBar.moveDelta(delay, 16, Math.floor(SCREEN_W / 4), 0);
      partyBar.moveOpacity(delay, 12, 0);
      partyBar.setVisible(delay + 12, false);
      partyBar.setOpacity(delay + 12, 255);
    }
    for (let j = 0; j < AnimationHooks.numBalls; j++) {
      const s = this.sprites[`partyBall_1_${j}`];
      if (!s || !s.visible) continue;
      const partyBall = this.addSprite(s);
      if (this.fullAnim) partyBall.moveDelta(delay + 2 * j, 16, SCREEN_W, 0);
      partyBall.moveOpacity(delay, 12, 0);
      partyBall.setVisible(delay + 12, false);
      partyBall.setOpacity(delay + 12, 255);
    }
  }
}

//===============================================================================
// Shows a Pokémon being sent out on the player's side (including by a partner).
// Includes the Poké Ball being thrown.
//===============================================================================
export class PokeballPlayerSendOut extends BallAnimation {
  private shadowVisible: boolean;

  /**
   * Following Pokemon EX's initialize: unlike Essentials', it doesn't hide the
   * battler and shadow sprites first, and the follower (battler 0, start of
   * battle) slides in instead of being thrown out.
   */
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxTrainer: number, private battler: SceneBattler,
    private startBattle: boolean, private idxOrder = 0) {
    super(sprites, viewport);
    this.trainer = battler.battle.pbGetOwnerFromBattlerIndex(battler.index);
    this.shadowVisible = sprites[`shadow_${battler.index}`].visible;
    if (AnimationHooks.followingPkmnActive() && startBattle &&
        battler.index === 0 && AnimationHooks.followerSlidesIntoBattle) {
      this.createFollowerProcesses();
    } else {
      this.createProcesses();
    }
  }

  private get showingTrainer(): boolean { return this.startBattle; }

  createFollowerProcesses(): void {
    let delay = 0;
    if (this.showingTrainer) delay = 5;
    const batSprite = this.sprites[`pokemon_${this.battler.index}`];
    const shaSprite = this.sprites[`shadow_${this.battler.index}`];
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    battler.setVisible(delay, true);
    battler.setZoomXY(delay, 100, 100);
    battler.setColor(delay, new Color(0, 0, 0, 0));
    battler.setDelta(0, -240, 0);
    battler.moveDelta(delay, 12, 240, 0);
    battler.setCallback(delay + 12, [batSprite, "pbPlayIntroAnimation"]);
    if (this.shadowVisible) {
      const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
      shadow.setVisible(delay, this.shadowVisible);
      shadow.setDelta(0, -Math.floor(SCREEN_W / 2), 0);
      // NOTE: As written in the plugin: setDelta(delay, x, y, cb), so this
      //       shifts the shadow by (12, 256) rather than moving it back.
      shadow.setDelta(delay, 12, Math.floor(SCREEN_W / 2));
    }
  }

  override createProcesses(): void {
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.battler.index}`];
    const shaSprite = this.sprites[`shadow_${this.battler.index}`];
    const traSprite = this.sprites[`player_${this.idxTrainer}`];
    // Calculate the Poké Ball graphic to use
    const pokeBall: Id | null = batSprite.pkmn ? batSprite.pkmn.pokeBall : null;
    // Calculate the color to turn the battler sprite
    const col = this.getBattlerColorFromPokeBall(pokeBall);
    col.alpha = 255;
    // Calculate start and end coordinates for battler sprite movement
    const ballPos = AnimationHooks.battlerPosition(this.battler.index, batSprite.sideSize);
    const battlerStartX = ballPos[0]; // Is also where the Ball needs to end
    const battlerStartY = ballPos[1]; // Is also where the Ball needs to end + 18
    const battlerEndX = batSprite.x;
    const battlerEndY = batSprite.y;
    // Calculate start and end coordinates for Poké Ball sprite movement
    let ballStartX = -6;
    let ballStartY = 202;
    const ballMidX = 0; // Unused in trajectory calculation
    const ballMidY = battlerStartY - 144;
    // Set up Poké Ball sprite
    const ball = this.addBallSprite(ballStartX, ballStartY, pokeBall);
    ball.setZ(0, 25);
    ball.setVisible(0, false);
    // Poké Ball tracking the player's hand animation (if trainer is visible)
    if (this.showingTrainer && traSprite && traSprite.x > 0) {
      ball.setZ(0, traSprite.z - 1);
      [ballStartX, ballStartY] = this.ballTracksHand(ball, traSprite);
    }
    let delay = ball.totalDuration(); // 0 or 7
    // Poké Ball trajectory animation
    this.createBallTrajectory(ball, delay, 12,
      ballStartX, ballStartY, ballMidX, ballMidY, battlerStartX, battlerStartY - 18);
    ball.setZ(9, batSprite.z - 1);
    delay = ball.totalDuration() + 4;
    delay += 10 * this.idxOrder; // Stagger appearances if multiple Pokémon are sent out at once
    this.ballOpenUp(ball, delay - 2, pokeBall);
    this.ballBurst(delay, ball, battlerStartX, battlerStartY - 18, pokeBall);
    ball.moveOpacity(delay + 2, 2, 0);
    // Set up battler sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    battler.setXY(0, battlerStartX, battlerStartY);
    battler.setZoom(0, 0);
    battler.setColor(0, col);
    // Battler animation
    this.battlerAppear(battler, delay, battlerEndX, battlerEndY, batSprite, col);
    if (this.shadowVisible) {
      // Set up shadow sprite
      const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
      shadow.setOpacity(0, 0);
      // Shadow animation
      shadow.setVisible(delay, this.shadowVisible);
      shadow.moveOpacity(delay + 5, 10, 255);
    }
  }
}

//===============================================================================
// Shows a Pokémon being sent out on the opposing side.
// Includes the Poké Ball being "thrown" (although here the Poké Ball just
// appears in the spot where it opens up rather than being thrown to there).
//===============================================================================
export class PokeballTrainerSendOut extends BallAnimation {
  private shadowVisible: boolean;

  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxTrainer: number, private battler: SceneBattler,
    private showingTrainer: boolean, private idxOrder: number) {
    super(sprites, viewport);
    sprites[`pokemon_${battler.index}`].visible = false;
    this.shadowVisible = sprites[`shadow_${battler.index}`].visible;
    sprites[`shadow_${battler.index}`].visible = false;
    this.createProcesses();
  }

  override createProcesses(): void {
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.battler.index}`];
    const shaSprite = this.sprites[`shadow_${this.battler.index}`];
    // Calculate the Poké Ball graphic to use
    const pokeBall: Id | null = batSprite.pkmn ? batSprite.pkmn.pokeBall : null;
    // Calculate the color to turn the battler sprite
    const col = this.getBattlerColorFromPokeBall(pokeBall);
    col.alpha = 255;
    // Calculate start and end coordinates for battler sprite movement
    const ballPos = AnimationHooks.battlerPosition(this.battler.index, batSprite.sideSize);
    const battlerStartX = ballPos[0];
    const battlerStartY = ballPos[1];
    const battlerEndX = batSprite.x;
    const battlerEndY = batSprite.y;
    // Set up Poké Ball sprite
    const ball = this.addBallSprite(0, 0, pokeBall);
    ball.setZ(0, batSprite.z - 1);
    // Poké Ball animation
    this.createTrainerBallTrajectory(ball, battlerStartX, battlerStartY);
    let delay = ball.totalDuration() + 6;
    if (this.showingTrainer) delay += 10; // Give time for trainer to slide off screen
    delay += 10 * this.idxOrder; // Stagger appearances if multiple Pokémon are sent out at once
    this.ballOpenUp(ball, delay - 2, pokeBall);
    this.ballBurst(delay, ball, battlerStartX, battlerStartY - 18, pokeBall);
    ball.moveOpacity(delay + 2, 2, 0);
    // Set up battler sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    battler.setXY(0, battlerStartX, battlerStartY);
    battler.setZoom(0, 0);
    battler.setColor(0, col);
    // Battler animation
    this.battlerAppear(battler, delay, battlerEndX, battlerEndY, batSprite, col);
    if (this.shadowVisible) {
      // Set up shadow sprite
      const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
      shadow.setOpacity(0, 0);
      // Shadow animation
      shadow.setVisible(delay, this.shadowVisible);
      shadow.moveOpacity(delay + 5, 10, 255);
    }
  }

  /** createBallTrajectory(ball, destX, destY) (this class's override, renamed: TS can't overload by arity). */
  createTrainerBallTrajectory(ball: PictureEx, destX: number, destY: number): void {
    // NOTE: In HGSS, there isn't a Poké Ball arc under any circumstance (neither
    //       when throwing out the first Pokémon nor when switching/replacing a
    //       fainted Pokémon). You may choose to change this.
    ball.setXY(0, destX, destY - 4);
  }
}

//===============================================================================
// Shows a Pokémon being recalled into its Poké Ball
//===============================================================================
export class BattlerRecall extends BallAnimation {
  private idxBattler: number;

  constructor(sprites: SceneSprites, viewport: Viewport | null, battler: SceneBattler) {
    super(sprites, viewport);
    this.idxBattler = battler.index;
    this.createProcesses();
  }

  override createProcesses(): void {
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.idxBattler}`];
    const shaSprite = this.sprites[`shadow_${this.idxBattler}`];
    // Calculate the Poké Ball graphic to use
    const pokeBall: Id | null = batSprite.pkmn ? batSprite.pkmn.pokeBall : null;
    // Calculate the color to turn the battler sprite
    const col = this.getBattlerColorFromPokeBall(pokeBall);
    col.alpha = 0;
    // Calculate end coordinates for battler sprite movement
    const ballPos = AnimationHooks.battlerPosition(this.idxBattler, batSprite.sideSize);
    const battlerEndX = ballPos[0];
    const battlerEndY = ballPos[1];
    // Set up battler sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    battler.setVisible(0, true);
    battler.setColor(0, col);
    // Set up Poké Ball sprite
    const ball = this.addBallSprite(battlerEndX, battlerEndY, pokeBall);
    ball.setZ(0, batSprite.z + 1);
    // Poké Ball animation
    this.ballOpenUp(ball, 0, pokeBall);
    const delay = ball.totalDuration();
    this.ballBurstRecall(delay, ball, battlerEndX, battlerEndY, pokeBall);
    ball.moveOpacity(10, 2, 0);
    // Battler animation
    this.battlerAbsorb(battler, delay, battlerEndX, battlerEndY, col);
    if (shaSprite.visible) {
      // Set up shadow sprite
      const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
      // Shadow animation
      shadow.moveOpacity(0, 10, 0);
      shadow.setVisible(delay, false);
    }
  }
}

//===============================================================================
// Shows a Pokémon flashing after taking damage
//===============================================================================
export class BattlerDamage extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxBattler: number, private effectiveness: number) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const batSprite = this.sprites[`pokemon_${this.idxBattler}`];
    const shaSprite = this.sprites[`shadow_${this.idxBattler}`];
    // Set up battler/shadow sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
    // Animation
    let delay = 0;
    switch (this.effectiveness) {
      case 0: battler.setSE(delay, "Battle damage normal"); break;
      case 1: battler.setSE(delay, "Battle damage weak"); break;
      case 2: battler.setSE(delay, "Battle damage super"); break;
    }
    for (let i = 0; i < 4; i++) { // 4 flashes, each lasting 0.2 (4/20) seconds
      battler.setVisible(delay, false);
      shadow.setVisible(delay, false);
      if (batSprite.visible) battler.setVisible(delay + 2, true);
      if (shaSprite.visible) shadow.setVisible(delay + 2, true);
      delay += 4;
    }
    // Restore original battler/shadow sprites visibilities
    battler.setVisible(delay, batSprite.visible);
    shadow.setVisible(delay, shaSprite.visible);
  }
}

//===============================================================================
// Shows a Pokémon fainting
//===============================================================================
export class BattlerFaint extends Animation {
  /** Needs preloadCryLength(pkmn, "_faint") and preloadCryLength(pkmn) done first. */
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxBattler: number, private battle: SceneBattle) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.idxBattler}`];
    const shaSprite = this.sprites[`shadow_${this.idxBattler}`];
    // Set up battler/shadow sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
    // Get approx duration depending on sprite's position/size. Min 20 frames.
    const battlerTop = batSprite.y - batSprite.height;
    let cropY = AnimationHooks.battlerPosition(this.idxBattler, this.battle.pbSideSize(this.idxBattler))[1];
    cropY += 8;
    let duration = Math.floor((cropY - battlerTop) / 8);
    if (duration < 10) duration = 10; // Min 0.5 seconds
    // Animation
    // Play cry
    let delay = 10;
    let cry = batSprite.pkmn ? SpeciesFiles.cryFilenameFromPokemon(batSprite.pkmn, "_faint") : null;
    if (cry) { // Play a specific faint cry
      battler.setSE(0, cry);
      delay = Math.ceil(cryLength(batSprite.pkmn, null, "_faint") * 20);
    } else {
      cry = batSprite.pkmn ? SpeciesFiles.cryFilenameFromPokemon(batSprite.pkmn) : null;
      if (cry) { // Play the regular cry at a lower pitch (75)
        battler.setSE(0, cry, null, 75);
        delay = Math.ceil(cryLength(batSprite.pkmn, 75) * 20);
      }
    }
    delay += 2;
    // Sprite drops down
    shadow.setVisible(delay, false);
    battler.setSE(delay, "Pkmn faint");
    battler.moveOpacity(delay, duration, 0);
    battler.moveDelta(delay, duration, 0, cropY - battlerTop);
    battler.setCropBottom(delay, cropY);
    battler.setVisible(delay + duration, false);
    battler.setOpacity(delay + duration, 255);
  }
}

//===============================================================================
// Shows the player's Poké Ball being thrown to capture a Pokémon
//===============================================================================
export class PokeballThrowCapture extends BallAnimation {
  private success: boolean;
  private numShakes: number;
  private shadowVisible: boolean;
  private ballSpriteIndex = -1;

  constructor(sprites: SceneSprites, viewport: Viewport | null, private pokeBall: Id, numShakes: number,
    private critCapture: boolean, private battler: SceneBattler, private showingTrainer: boolean) { // showingTrainer: only true if a Safari Zone battle
    super(sprites, viewport);
    this.success = numShakes >= 4;
    this.numShakes = critCapture && numShakes > 0 ? 1 : numShakes;
    this.shadowVisible = sprites[`shadow_${battler.index}`].visible;
    this.trainer = battler.battle.pbPlayer();
    this.createProcesses();
  }

  override createProcesses(): void {
    // Calculate start and end coordinates for battler sprite movement
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.battler.index}`];
    const shaSprite = this.sprites[`shadow_${this.battler.index}`];
    const traSprite = this.sprites.player_1;
    const ballPos = AnimationHooks.battlerPosition(this.battler.index, batSprite.sideSize);
    const battlerStartX = batSprite.x;
    const battlerStartY = batSprite.y;
    let ballStartX = -6;
    let ballStartY = 246;
    const ballMidX = 0; // Unused in arc calculation
    const ballMidY = 78;
    const ballEndX = ballPos[0];
    const ballEndY = 112;
    const ballGroundY = ballPos[1] - 4;
    // Set up Poké Ball sprite
    const ball = this.addBallSprite(ballStartX, ballStartY, this.pokeBall);
    ball.setZ(0, batSprite.z + 1);
    this.ballSpriteIndex = this.success ? this.tempSprites.length - 1 : -1;
    // Set up trainer sprite (only visible in Safari Zone battles)
    if (this.showingTrainer && traSprite && traSprite.bitmap.width >= traSprite.bitmap.height * 2) {
      const trainer = this.addSprite(traSprite, PictureOrigin.BOTTOM);
      // Trainer animation
      [ballStartX, ballStartY] = this.trainerThrowingFrames(ball, trainer, traSprite);
    }
    let delay = ball.totalDuration(); // 0 or 7
    // Poké Ball arc animation
    ball.setSE(delay, "Battle throw");
    this.createBallTrajectory(ball, delay, 16,
      ballStartX, ballStartY, ballMidX, ballMidY, ballEndX, ballEndY);
    ball.setZ(9, batSprite.z + 1);
    ball.setSE(delay + 16, "Battle ball hit");
    // Poké Ball opens up
    delay = ball.totalDuration() + 6;
    this.ballOpenUp(ball, delay, this.pokeBall, true, false);
    // Set up battler sprite
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    // Poké Ball absorbs battler
    delay = ball.totalDuration();
    this.ballBurstCapture(delay, ball, ballEndX, ballEndY, this.pokeBall);
    // NOTE: The Pokémon does not change color while being absorbed into a Poké
    //       Ball during a capture attempt. This may be an oversight in HGSS.
    //       It's hard to spot due to the ball burst animation being played on
    //       top of it.
    battler.setSE(delay, "Battle jump to ball");
    battler.moveXY(delay, 5, ballEndX, ballEndY);
    battler.moveZoom(delay, 5, 0);
    battler.setVisible(delay + 5, false);
    let shadow: PictureEx | null = null;
    if (this.shadowVisible) {
      // Set up shadow sprite
      shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
      // Shadow animation
      shadow.moveOpacity(delay, 5, 0);
      shadow.moveZoom(delay, 5, 0);
      shadow.setVisible(delay + 5, false);
    }
    // Poké Ball closes
    delay = ball.totalDuration();
    this.ballSetClosed(ball, delay, this.pokeBall);
    ball.moveTone(delay, 3, new Tone(96, 64, -160, 160));
    ball.moveTone(delay + 5, 3, new Tone(0, 0, 0, 0));
    // Poké Ball critical capture animation
    delay = ball.totalDuration() + 3;
    if (this.critCapture) {
      ball.setSE(delay, "Battle ball shake");
      ball.moveXY(delay, 1, ballEndX + 4, ballEndY);
      ball.moveXY(delay + 1, 2, ballEndX - 4, ballEndY);
      ball.moveXY(delay + 3, 2, ballEndX + 4, ballEndY);
      ball.setSE(delay + 4, "Battle ball shake");
      ball.moveXY(delay + 5, 2, ballEndX - 4, ballEndY);
      ball.moveXY(delay + 7, 1, ballEndX, ballEndY);
      delay = ball.totalDuration() + 3;
    }
    // Poké Ball drops to the ground
    for (let i = 0; i < 4; i++) {
      const tt = [4, 4, 3, 2][i]!; // Time taken to rise or fall for each bounce
      const d = [1, 2, 4, 8][i]!; // Fraction of the starting height each bounce rises to
      if (i === 0) delay -= tt;
      if (i > 0) {
        ball.setZoomXY(delay, 100 + 5 * (5 - i), 100 - 5 * (5 - i)); // Squish
        ball.moveZoom(delay, 2, 100); // Unsquish
        ball.moveXY(delay, tt, ballEndX, ballGroundY - Math.floor((ballGroundY - ballEndY) / d));
      }
      ball.moveXY(delay + tt, tt, ballEndX, ballGroundY);
      ball.setSE(delay + 2 * tt, "Battle ball drop", 100 - i * 7);
      delay = ball.totalDuration();
    }
    battler.setXY(ball.totalDuration(), ballEndX, ballGroundY);
    // Poké Ball shakes
    delay = ball.totalDuration() + 12;
    for (let i = 0; i < Math.min(this.numShakes, 3); i++) {
      ball.setSE(delay, "Battle ball shake");
      ball.moveXY(delay, 2, ballEndX - 2 * (4 - i), ballGroundY);
      ball.moveAngle(delay, 2, 5 * (4 - i)); // positive means counterclockwise
      ball.moveXY(delay + 2, 4, ballEndX + 2 * (4 - i), ballGroundY);
      ball.moveAngle(delay + 2, 4, -5 * (4 - i)); // negative means clockwise
      ball.moveXY(delay + 6, 2, ballEndX, ballGroundY);
      ball.moveAngle(delay + 6, 2, 0);
      delay = ball.totalDuration() + 8;
    }
    if (this.success) {
      // Pokémon was caught
      this.ballCaptureSuccess(ball, delay, ballEndX, ballGroundY);
    } else {
      // Poké Ball opens
      ball.setZ(delay, batSprite.z - 1);
      this.ballOpenUp(ball, delay, this.pokeBall, false);
      this.ballBurst(delay, ball, ballEndX, ballGroundY, this.pokeBall);
      ball.moveOpacity(delay + 2, 2, 0);
      // Battler emerges
      const col = this.getBattlerColorFromPokeBall(this.pokeBall);
      col.alpha = 255;
      battler.setColor(delay, col);
      this.battlerAppear(battler, delay, battlerStartX, battlerStartY, batSprite, col);
      if (this.shadowVisible && shadow) {
        shadow.setVisible(delay + 5, true);
        shadow.setZoom(delay + 5, 100);
        shadow.moveOpacity(delay + 5, 10, 255);
      }
    }
  }

  override dispose(): void {
    if (this.ballSpriteIndex >= 0) {
      // Capture was successful, the Poké Ball sprite should stay around after
      // this animation has finished.
      this.sprites.captureBall = this.tempSprites[this.ballSpriteIndex];
      this.tempSprites[this.ballSpriteIndex] = null;
    }
    super.dispose();
  }
}

//===============================================================================
// Shows the player throwing a Poké Ball and it being deflected
//===============================================================================
export class PokeballThrowDeflect extends BallAnimation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private pokeBall: Id, private battler: SceneBattler) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    // Calculate start and end coordinates for battler sprite movement
    const batSprite: BattlerSprite = this.sprites[`pokemon_${this.battler.index}`];
    const ballPos = AnimationHooks.battlerPosition(this.battler.index, batSprite.sideSize);
    const ballStartX = -6;
    const ballStartY = 246;
    const ballMidX = 190; // Unused in arc calculation
    const ballMidY = 78;
    const ballEndX = ballPos[0];
    const ballEndY = 112;
    // Set up Poké Ball sprite
    const ball = this.addBallSprite(ballStartX, ballStartY, this.pokeBall);
    ball.setZ(0, 90);
    // Poké Ball arc animation
    ball.setSE(0, "Battle throw");
    this.createBallTrajectory(ball, 0, 16,
      ballStartX, ballStartY, ballMidX, ballMidY, ballEndX, ballEndY);
    // Poké Ball knocked back
    const delay = ball.totalDuration();
    ball.setSE(delay, "Battle ball drop");
    ball.moveXY(delay, 8, -32, 384 - 96 + 32); // Back to player's corner
    this.createBallTumbling(ball, delay, 8);
  }
}

//===============================================================================
// Essentials Deluxe: animation for reverting battlers from various battle states.
//===============================================================================
export class RevertBattlerStart extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private index: number, private battle: SceneBattle) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    this.darkenBattlefield(this.battle, 0, this.index, "Anim/Psych Up");
  }
}

export class RevertBattlerEnd extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private battle: SceneBattle) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    this.revertBattlefield(this.battle, 4);
  }
}

//===============================================================================
// Essentials Deluxe (Battle Deluxe): animation used to toggle visibility of data boxes.
//===============================================================================
export class ToggleDataBoxes extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private battlers: (SceneBattler | null)[], private toggle: boolean) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const delay = 0;
    for (const b of this.battlers) {
      if (!b || (b.fainted() && !this.sprites[`pokemon_${b.index}`].visible)) continue;
      if (!this.sprites[`dataBox_${b.index}`]) continue;
      const box = this.addSprite(this.sprites[`dataBox_${b.index}`]);
      if (this.toggle === false) {
        box.moveOpacity(delay, 3, 0);
        box.setVisible(delay + 3, false);
      } else {
        box.setOpacity(delay, 0);
        box.moveOpacity(delay, 3, 255);
        box.setVisible(delay + 3, true);
      }
    }
  }
}

//===============================================================================
// Essentials Deluxe (Battle Deluxe): animation used to toggle black bars during trainer speech.
//===============================================================================
export class ToggleBlackBars extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private toggle: boolean) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const delay = 5;
    const topBar = this.addSprite(this.sprites.topBar, PictureOrigin.TOP_LEFT);
    topBar.setZ(0, 200);
    const bottomBar = this.addSprite(this.sprites.bottomBar, PictureOrigin.BOTTOM_RIGHT);
    bottomBar.setZ(0, 200);
    if (this.toggle) {
      const toMoveBottom = Math.max(this.sprites.bottomBar.bitmap.width, SCREEN_W);
      const toMoveTop = Math.max(this.sprites.topBar.bitmap.width, SCREEN_W);
      topBar.setOpacity(0, 255);
      bottomBar.setOpacity(0, 255);
      topBar.setXY(0, SCREEN_W, 0);
      bottomBar.setXY(0, 0, 384);
      topBar.moveXY(delay, 5, SCREEN_W - toMoveTop, 0);
      bottomBar.moveXY(delay, 5, toMoveBottom, 384);
    } else {
      topBar.moveOpacity(delay, 4, 0);
      bottomBar.moveOpacity(delay, 4, 0);
      topBar.setXY(delay + 5, SCREEN_W, 0);
      bottomBar.setXY(delay + 5, 0, 384);
    }
  }
}

/** What SlideSpriteAppear/Disappear need from the scene. */
export interface SlideSpriteScene {
  guestSpeaker: boolean;
  pbUpdateNameWindow(speaker: unknown, visible?: boolean, reset?: boolean): void;
  pbUpdateGuestSprite(id: unknown): void;
}

//===============================================================================
// Essentials Deluxe (Battle Deluxe): animation used to slide a speaker on screen.
//===============================================================================
export class SlideSpriteAppear extends Animation {
  private idxTrainer: number | null = null;
  private guestSpeaker = false;

  constructor(sprites: SceneSprites, viewport: Viewport | null, id: number | string | unknown[] | null, private battle: SceneBattle,
    private scene: SlideSpriteScene) {
    super(sprites, viewport);
    if (typeof id === "number") {
      this.idxTrainer = id + 1;
      const trainer = this.battle.opponent![id];
      this.scene.pbUpdateNameWindow(trainer, false);
    } else if (typeof id === "string" || Array.isArray(id)) { // Ruby: when Symbol, Array (nil shows no one)
      if (!this.scene.guestSpeaker) this.scene.pbUpdateGuestSprite(id);
      this.guestSpeaker = true;
    }
    this.createProcesses();
  }

  override createProcesses(): void {
    const delay = 0;
    let slideSprite: PictureEx | null = null;
    let spriteX = 0, spriteY = 0;
    if (this.idxTrainer && !this.sprites[`trainer_${this.idxTrainer}`].visible) {
      slideSprite = this.addSprite(this.sprites[`trainer_${this.idxTrainer}`], PictureOrigin.BOTTOM);
      slideSprite.setVisible(delay, true);
      [spriteX, spriteY] = AnimationHooks.trainerPosition(1);
      spriteX += 64 + Math.floor(SCREEN_W / 4);
    } else if (this.guestSpeaker && !this.scene.guestSpeaker) {
      const guest = this.sprites.midbattle_guest;
      slideSprite = this.addSprite(guest, PictureOrigin.BOTTOM);
      slideSprite.setVisible(delay, true);
      [spriteX, spriteY] = [guest.x, guest.y];
      spriteX += Math.floor(guest.width / 2) + Math.floor(SCREEN_W / 4);
      this.scene.guestSpeaker = true;
    }
    if (slideSprite) {
      if (this.battle.battlers[1] && this.battle.battlers[1].dynamax?.()) {
        spriteY += 12;
        slideSprite.setZ(delay, this.sprites.pokemon_1.z + 1);
      }
      slideSprite.setXY(delay, spriteX, spriteY);
      slideSprite.moveDelta(delay, 8, -Math.floor(SCREEN_W / 4), 0);
    }
  }
}

//===============================================================================
// Essentials Deluxe (Battle Deluxe): animation used to slide a speaker off screen.
//===============================================================================
export class SlideSpriteDisappear extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private battle: SceneBattle, private scene: SlideSpriteScene) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const delay = 0;
    let spritesToHide = 1;
    if (this.battle.opponent) spritesToHide += this.battle.opponent.length;
    for (let i = 0; i < spritesToHide; i++) {
      let slideSprite: PictureEx | null = null;
      if (this.sprites[`trainer_${i}`] && this.sprites[`trainer_${i}`].visible) {
        slideSprite = this.addSprite(this.sprites[`trainer_${i}`], PictureOrigin.BOTTOM);
      } else if (this.scene.guestSpeaker) {
        slideSprite = this.addSprite(this.sprites.midbattle_guest, PictureOrigin.BOTTOM);
        this.scene.guestSpeaker = false;
      }
      if (slideSprite) {
        slideSprite.moveDelta(delay, 8, Math.floor(SCREEN_W / 4), 0);
        slideSprite.setVisible(delay + 8, false);
        if (this.battle.battlers[1] && this.battle.battlers[1].dynamax?.()) {
          slideSprite.setZ(delay + 8, this.sprites.pokemon_1.z - 1);
        }
      }
    }
  }
}

//===============================================================================
// Essentials Deluxe (Battle Deluxe): animation used for a fleeing battler.
//===============================================================================
export class BattlerFlee extends Animation {
  constructor(sprites: SceneSprites, viewport: Viewport | null, private idxBattler: number, private battle: SceneBattle) {
    super(sprites, viewport);
    this.createProcesses();
  }

  override createProcesses(): void {
    const delay = 0;
    const batSprite = this.sprites[`pokemon_${this.idxBattler}`];
    const shaSprite = this.sprites[`shadow_${this.idxBattler}`];
    const battler = this.addSprite(batSprite, PictureOrigin.BOTTOM);
    const shadow = this.addSprite(shaSprite, PictureOrigin.CENTER);
    const direction = this.battle.battlers[this.idxBattler]!.opposes(0) ? batSprite.x : -batSprite.x;
    shadow.setVisible(delay, false);
    battler.setSE(delay, "Battle flee");
    battler.moveOpacity(delay, 8, 0);
    battler.moveDelta(delay, 28, direction, 0);
    battler.setVisible(delay + 28, false);
  }
}
