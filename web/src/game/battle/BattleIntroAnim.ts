// Port of 012_Overworld/002_Battle triggering/002_Overworld_BattleIntroAnim.rb:
// pbSceneStandby, pbBattleAnimation (battle music, the flashes and the named
// transition into the battle, and the fade back to the map afterwards) and
// SpecialBattleIntroAnimations.
//
// Also the special trainer intros the Ruby file registers (lines 188-441):
// vs_trainer_animation, vs_elite_four_animation, vs_admin_animation (the
// VSTrainer/VSEliteFour/VSRocketAdmin transitions in transitions.ts),
// alternate_vs_trainer_animation (Luka S.J.'s, drawn here) and
// rocket_grunt_animation. Their conditions check for the graphics with
// assetExists (pbResolveBitmap).

import { assetExists } from "../../core/assets";
import type { AudioRef } from "../../data/events";
import type { Id } from "../../data/gameData/gameData";
import { EncounterType } from "../../data/gameData/encounterType";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Tone } from "../../rgss/types";
import { Cache } from "../../sprites/cache";
import { pbDrawTextPositions } from "../../ui/drawText";
import { pbPopFade, pbPushFade } from "../../ui/fades";
import { pbSetSystemFont } from "../../ui/messageConfig";
import { AnimatedPlane } from "../../ui/planes";
import { rgssOpacity } from "../../ui/scenes/frames";
import type { SceneMap } from "../../scenes/SceneMap";
import { PBDayNight } from "../dayNight";
import { pokemonEncounters } from "../encounters/PokemonEncounters";
import { pbBGMPlay, pbSEPlay } from "../GameSystem";
import { G, pbUpdateSceneMap } from "../globals";
import { mapMetadata } from "../metadata";
import type { Player } from "../trainer/Player";
import { pbGetWildBattleBGM } from "./battleAudio";
import "./transitions";

type IntroCondition = (battleType: number, foe: unknown[], location: number) => boolean;
type IntroAnimation = (viewport: Viewport, battleType: number, foe: unknown[], location: number) => Promise<void>;

/**
 * SpecialBattleIntroAnimations: battle intros used instead of the default ones
 * when their condition holds (highest priority first). By the end of the
 * animation, the screen should be black.
 */
export const SpecialBattleIntroAnimations = {
  anims: [] as [string, number, IntroCondition, IntroAnimation][],
  register(name: string, priority: number, condition: IntroCondition, anim: IntroAnimation): void {
    this.anims.push([name, priority, condition, anim]);
  },
  remove(name: string): void {
    this.anims = this.anims.filter((a) => a[0] !== name);
  },
  each(): [string, number, IntroCondition, IntroAnimation][] {
    return [...this.anims].sort((a, b) => b[1] - a[1]);
  },
  has(name: string): boolean {
    return this.anims.some((a) => a[0] === name);
  },
  get(name: string) {
    return this.anims.find((a) => a[0] === name) ?? null;
  },
};

const scene = () => G.scene as unknown as SceneMap | null;
const isSceneMap = () => !!scene() && typeof (scene() as SceneMap).disposeSpritesets === "function";

/** pbSceneStandby { ... }: disposes the map's sprites while the battle runs. */
export async function pbSceneStandby(block: () => Promise<void>): Promise<void> {
  if (isSceneMap()) scene()!.disposeSpritesets();
  // (RPG::Cache.clear and Graphics.frame_reset have nothing to do here.)
  await block();
  if (isSceneMap()) await scene()!.createSpritesets();
}

/** viewport.color = Color.new(c, c, c, a) */
function setColor(viewport: Viewport, c: number, alpha: number): void {
  viewport.color = new Color(c, c, c, Math.max(0, Math.min(255, alpha)));
}

/**
 * pbBattleAnimation(bgm, battletype, foe) { battle }: battletype is 0 wild,
 * 1 trainer, 2 double wild, 3 double trainer.
 */
export async function pbBattleAnimation(bgm: AudioRef | null, battletype = 0, foe: unknown[] | null = null, block?: () => Promise<void>): Promise<void> {
  const t = G.gameTemp;
  t.inBattle = true;
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  // Set up audio
  const sys = G.gameSystem;
  const playingBGS = sys.getPlayingBGS();
  let playingBGM = sys.getPlayingBGM();
  sys.bgmPause();
  sys.bgsPause();
  if (t.memorizedBgm) {
    playingBGM = t.memorizedBgm;
    sys.bgmPosition = t.memorizedBgmPosition ?? 0;
  }
  // Play battle music
  bgm ??= pbGetWildBattleBGM([]);
  pbBGMPlay(bgm);
  // Determine location of battle
  let location = 0; // 0=outside, 1=inside, 2=cave, 3=water
  if (G.pokemonGlobal.surfing || G.pokemonGlobal.diving) location = 3;
  else if (t.encounterType && EncounterType.get(t.encounterType).type === "fishing") location = 3;
  else if (pokemonEncounters().hasCaveEncounters()) location = 2;
  else if (!mapMetadata(G.gameMap!.mapId)?.outdoorMap) location = 1;
  // Check for custom battle intro animations
  let handled = false;
  for (const [, , condition, animation] of SpecialBattleIntroAnimations.each()) {
    if (!condition(battletype, foe ?? [], location)) continue;
    await animation(viewport, battletype, foe ?? [], location);
    handled = true;
    break;
  }
  // Default battle intro animation
  if (!handled) {
    // Determine which animation is played
    let anim = "";
    if (PBDayNight.isDay()) {
      switch (battletype) {
        case 0: case 2: anim = ["SnakeSquares", "DiagonalBubbleTL", "DiagonalBubbleBR", "RisingSplash"][location]!; break; // Wild, double wild
        case 1: anim = ["TwoBallPass", "ThreeBallDown", "BallDown", "WavyThreeBallUp"][location]!; break; // Trainer
        case 3: anim = "FourBallBurst"; break; // Double trainer
      }
    } else {
      switch (battletype) {
        case 0: case 2: anim = ["SnakeSquares", "DiagonalBubbleBR", "DiagonalBubbleBR", "RisingSplash"][location]!; break;
        case 1: anim = ["SpinBallSplit", "BallDown", "BallDown", "WavySpinBall"][location]!; break;
        case 3: anim = "FourBallBurst"; break;
      }
    }
    await pbBattleAnimationCore(anim, viewport, location);
  }
  pbPushFade();
  // Yield to the battle scene
  if (block) await block();
  // After the battle
  pbPopFade();
  sys.bgmResume(playingBGM);
  sys.bgsResume(playingBGS);
  t.memorizedBgm = null;
  t.memorizedBgmPosition = 0;
  const g = G.pokemonGlobal;
  g.nextBattleBGM = null;
  g.nextBattleVictoryBGM = null;
  g.nextBattleCaptureME = null;
  g.nextBattleBack = null;
  pokemonEncounters().resetStepCount();
  // Fade back to the overworld in 0.4 seconds
  setColor(viewport, 0, 255);
  let timer = 0.0;
  for (;;) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
    timer += Graphics.deltaS;
    setColor(viewport, 0, 255 * (1 - timer / 0.4));
    if (viewport.color.alpha <= 0) break;
  }
  viewport.dispose();
  t.inBattle = false;
}

/** pbBattleAnimationCore: the flashes, then the named transition (ends on a black screen). */
export async function pbBattleAnimationCore(anim: string, viewport: Viewport, location: number, numFlashes = 2): Promise<void> {
  // Initial screen flashing
  if (numFlashes > 0) {
    const c = location === 2 || PBDayNight.isNight() ? 0 : 255; // Dark=black, light=white
    setColor(viewport, c, 255); // Fade to black/white a few times
    const halfFlashTime = 0.2; // seconds
    for (let n = 0; n < numFlashes; n++) { // 2 flashes
      let timer = 0.0;
      for (;;) {
        if (timer < halfFlashTime) setColor(viewport, c, (255 * timer) / halfFlashTime);
        else setColor(viewport, c, 255 * (2 - timer / halfFlashTime));
        timer += Graphics.deltaS;
        await Graphics.update();
        await pbUpdateSceneMap();
        if (timer >= halfFlashTime * 2) break;
      }
    }
    setColor(viewport, c, 0);
  }
  // Take screenshot of game, for use in some animations
  G.gameTemp.backgroundBitmap?.dispose();
  G.gameTemp.backgroundBitmap = Graphics.snapToBitmap();
  // Play main animation
  Graphics.freeze();
  setColor(viewport, 0, 255); // Ensure screen is black
  await Graphics.transition(25 / 20, "Graphics/Transitions/" + anim);
  // Slight pause after animation before starting up the battle scene
  // (pbWait(Graphics.frame_rate / 10): 0.1 seconds.)
  const end = Graphics.frameCount + Math.round(0.1 / Graphics.deltaS);
  while (Graphics.frameCount < end) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

/** An NPCTrainer as the intro conditions see it. */
type FoeTrainer = { trainerType: Id; name: string };
const foes = (foe: unknown[]) => foe as FoeTrainer[];
/** pbResolveBitmap("Graphics/Transitions/" + name) */
const transitionExists = (name: string) => assetExists(`Graphics/Transitions/${name}`);
const isEven = (n: number) => n % 2 === 0;

//===============================================================================
// Play the HGSS "VSTrainer" battle transition animation for any single trainer
// battle where the following graphics exist in the Graphics/Transitions/
// folder for the opponent:
//   * "hgss_vs_TRAINERTYPE.png" and "hgss_vsBar_TRAINERTYPE.png"
// This animation makes use of $game_temp.transition_animation_data, and expects
// it to be an array like so: [:TRAINERTYPE, "display name"]
//===============================================================================
// (The v20.1 Hotfixes plugin replaces this condition and the next two with
// identical ones.)
SpecialBattleIntroAnimations.register("vs_trainer_animation", 60, // Priority 60
  (battleType, foe) => { // Condition
    if (isEven(battleType) || foe.length !== 1) return false; // Trainer battle against 1 trainer
    const trType = foes(foe)[0]!.trainerType;
    return transitionExists(`hgss_vs_${trType}`) && transitionExists(`hgss_vsBar_${trType}`);
  },
  async (viewport, _battleType, foe, location) => { // Animation
    G.gameTemp.transitionAnimationData = [foes(foe)[0]!.trainerType, foes(foe)[0]!.name];
    await pbBattleAnimationCore("VSTrainer", viewport, location, 1);
    G.gameTemp.transitionAnimationData = null;
  },
);

//===============================================================================
// Play the "VSEliteFour" battle transition animation for any single trainer
// battle where the following graphics exist in the Graphics/Transitions/
// folder for the opponent:
//   * "vsE4_TRAINERTYPE.png" and "vsE4Bar_TRAINERTYPE.png"
// This animation makes use of $game_temp.transition_animation_data, and expects
// it to be an array like so:
//   [:TRAINERTYPE, "display name", "player sprite name minus 'vsE4_'"]
//===============================================================================
SpecialBattleIntroAnimations.register("vs_elite_four_animation", 60, // Priority 60
  (battleType, foe) => { // Condition
    if (isEven(battleType) || foe.length !== 1) return false; // Trainer battle against 1 trainer
    const trType = foes(foe)[0]!.trainerType;
    return transitionExists(`vsE4_${trType}`) && transitionExists(`vsE4Bar_${trType}`);
  },
  async (viewport, _battleType, foe, location) => { // Animation
    const player = G.player as unknown as Player;
    let trSpriteName = String(player.trainerType);
    if (transitionExists(`vsE4_${trSpriteName}_${player.outfit}`)) trSpriteName += `_${player.outfit}`;
    G.gameTemp.transitionAnimationData = [foes(foe)[0]!.trainerType, foes(foe)[0]!.name, trSpriteName];
    await pbBattleAnimationCore("VSEliteFour", viewport, location, 0);
    G.gameTemp.transitionAnimationData = null;
  },
);

//===============================================================================
// Play the "VSRocketAdmin" battle transition animation for any trainer battle
// where the following graphic exists in the Graphics/Transitions/ folder for any
// of the opponents:
//   * "rocket_TRAINERTYPE.png"
// This animation makes use of $game_temp.transition_animation_data, and expects
// it to be an array like so: [:TRAINERTYPE, "display name"]
//===============================================================================
SpecialBattleIntroAnimations.register("vs_admin_animation", 60, // Priority 60
  (battleType, foe) => { // Condition
    if (battleType !== 1 && battleType !== 3) return false; // Trainer battles only
    return foes(foe).some((f) => transitionExists(`rocket_${f.trainerType}`));
  },
  async (viewport, _battleType, foe, location) => { // Animation
    for (const f of foes(foe)) {
      const trType = f.trainerType;
      if (!transitionExists(`rocket_${trType}`)) continue;
      G.gameTemp.transitionAnimationData = [trType, f.name];
      break;
    }
    await pbBattleAnimationCore("VSRocketAdmin", viewport, location, 0);
    G.gameTemp.transitionAnimationData = null;
  },
);

/**
 * pbWait(1) inside the loops below, as a frame counter: the n-th call returns
 * once n original (40 fps) frames have passed since the counter was made.
 */
function originalFrameWaiter(): () => Promise<void> {
  let frames = 0;
  let elapsed = 0;
  return async () => {
    frames += 1;
    while (elapsed < frames / FRAME_RATE - 1e-9) {
      await Graphics.update();
      Input.update();
      await pbUpdateSceneMap();
      elapsed += Graphics.deltaS;
    }
  };
}

/** Graphics.frame_rate in Essentials (the original 40 fps). */
const FRAME_RATE = 40;

/** sprite.opacity += delta, as mkxp-z stores it. */
const addOpacity = (s: Sprite, delta: number) => { s.opacity = rgssOpacity(s.opacity + delta); };

//===============================================================================
// Play the original Vs. Trainer battle transition animation for any single
// trainer battle where the following graphics exist in the Graphics/Transitions/
// folder for the opponent:
//   * "vsTrainer_TRAINERTYPE.png" and "vsBar_TRAINERTYPE.png"
//===============================================================================
// VS. animation, by Luka S.J., tweaked by Maruno. Its loops count original
// frames (Graphics.frame_rate = 40); integer maths as in Ruby.
//
// NOTE (Ruby parity): the player's bar/trainer graphics aren't checked
// (002_Overworld_BattleIntroAnim.rb:289-296); RPG::Cache.transition raises
// for a missing one. This game has none for its player trainer types
// (PkMnTRAINER_*), but no trainer it battles has vsTrainer_/vsBar_ graphics
// either, so the animation never plays. The port draws nothing for a missing
// graphic instead of raising.
SpecialBattleIntroAnimations.register("alternate_vs_trainer_animation", 50, // Priority 50
  (battleType, foe) => { // Condition
    if (isEven(battleType) || foe.length !== 1) return false; // Trainer battle against 1 trainer
    const trType = foes(foe)[0]!.trainerType;
    return transitionExists(`vsTrainer_${trType}`) && transitionExists(`vsBar_${trType}`);
  },
  async (viewport, _battleType, foe) => { // Animation
    const player = G.player as unknown as Player;
    // Determine filenames of graphics to be used
    const trType = foes(foe)[0]!.trainerType;
    const trainerBarGraphic = `vsBar_${trType}`;
    const trainerGraphic = `vsTrainer_${trType}`;
    const playerTrType = String(player.trainerType);
    const outfit = player.outfit;
    let playerBarGraphic = `vsBar_${playerTrType}_${outfit}`;
    if (!transitionExists(playerBarGraphic)) playerBarGraphic = `vsBar_${playerTrType}`;
    let playerGraphic = `vsTrainer_${playerTrType}_${outfit}`;
    if (!transitionExists(playerGraphic)) playerGraphic = `vsTrainer_${playerTrType}`;
    // RPG::Cache.transition (fetched first here)
    const names = [trainerBarGraphic, trainerGraphic, playerBarGraphic, playerGraphic, "vsFlash", "vs"];
    await Promise.all(names.map((n) => Cache.ensure(`Graphics/Transitions/${n}`)));
    const cached = (name: string) => Cache.get(`Graphics/Transitions/${name}`) ?? null;
    const newSprite = (vp: Viewport, name: string | null): Sprite => {
      const s = new Sprite(vp);
      s.setBitmap(name ? cached(name) : null);
      return s;
    };
    const wait = originalFrameWaiter();
    // Set up viewports
    const viewplayer = new Viewport(0, Graphics.height / 3, Graphics.width / 2, 128);
    viewplayer.z = viewport.z;
    const viewopp = new Viewport(Graphics.width / 2, Graphics.height / 3, Graphics.width / 2, 128);
    viewopp.z = viewport.z;
    const viewvs = new Viewport(0, 0, Graphics.width, Graphics.height);
    viewvs.z = viewport.z;
    // Set up sprites
    const fade = newSprite(viewport, "vsFlash");
    fade.tone = new Tone(-255, -255, -255);
    fade.opacity = 100;
    const overlay = newSprite(viewport, null);
    overlay.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    pbSetSystemFont(overlay.bitmap!);
    const xoffset = Math.floor(Graphics.width / 2 / 10) * 10;
    let bar1: Sprite | AnimatedPlane = newSprite(viewplayer, playerBarGraphic);
    bar1.x = -xoffset;
    let bar2: Sprite | AnimatedPlane = newSprite(viewopp, trainerBarGraphic);
    bar2.x = xoffset;
    const vs = newSprite(viewvs, "vs");
    vs.ox = Math.floor((vs.bitmap?.width ?? 0) / 2);
    vs.oy = Math.floor((vs.bitmap?.height ?? 0) / 2);
    vs.x = Graphics.width / 2;
    vs.y = Graphics.height / 1.5;
    vs.visible = false;
    const flash = newSprite(viewvs, "vsFlash");
    flash.opacity = 0;
    // Animate bars sliding in from either side
    const slideInTime = Math.floor(FRAME_RATE * 0.25);
    for (let i = 0; i < slideInTime; i++) {
      bar1.x = Math.floor((xoffset * (i + 1 - slideInTime)) / slideInTime);
      bar2.x = Math.floor((xoffset * (slideInTime - i - 1)) / slideInTime);
      await wait();
    }
    bar1.dispose();
    bar2.dispose();
    // Make whole screen flash white
    pbSEPlay("Vs flash");
    pbSEPlay("Vs sword");
    flash.opacity = 255;
    // Replace bar sprites with AnimatedPlanes, set up trainer sprites
    const plane1 = new AnimatedPlane(viewplayer);
    plane1.bitmap = cached(playerBarGraphic);
    const plane2 = new AnimatedPlane(viewopp);
    plane2.bitmap = cached(trainerBarGraphic);
    bar1 = plane1;
    bar2 = plane2;
    const playerSprite = newSprite(viewplayer, playerGraphic);
    playerSprite.x = -xoffset;
    const trainer = newSprite(viewopp, trainerGraphic);
    trainer.x = xoffset;
    trainer.tone = new Tone(-255, -255, -255);
    // Dim the flash and make the trainer sprites appear, while animating bars
    const fadeStep = Math.floor((52 * 20) / FRAME_RATE);
    const scrollStep = Math.floor((32 * 20) / FRAME_RATE);
    let animTime = Math.floor(FRAME_RATE * 1.2);
    for (let i = 0; i < animTime; i++) {
      if (flash.opacity > 0) addOpacity(flash, -fadeStep);
      plane1.ox -= scrollStep;
      plane2.ox += scrollStep;
      if (i >= Math.floor(animTime / 2) && i < slideInTime + Math.floor(animTime / 2)) {
        playerSprite.x = Math.floor((xoffset * (i + 1 - slideInTime - Math.floor(animTime / 2))) / slideInTime);
        trainer.x = Math.floor((xoffset * (slideInTime - i - 1 + Math.floor(animTime / 2))) / slideInTime);
      }
      await wait();
    }
    playerSprite.x = 0;
    trainer.x = 0;
    // Make whole screen flash white again
    flash.opacity = 255;
    pbSEPlay("Vs sword");
    // Make the Vs logo and trainer names appear, and reset trainer's tone
    vs.visible = true;
    trainer.tone = new Tone(0, 0, 0);
    const trainername = foes(foe)[0]!.name;
    pbDrawTextPositions(overlay.bitmap!, [
      [player.name, Graphics.width / 4, Graphics.height / 1.5 + 16, 2, new Color(248, 248, 248), new Color(72, 72, 72)],
      [trainername, Graphics.width / 4 + Graphics.width / 2, Graphics.height / 1.5 + 16, 2, new Color(248, 248, 248), new Color(72, 72, 72)],
    ]);
    // Fade out flash, shudder Vs logo and expand it, and then fade to black
    animTime = Math.floor(FRAME_RATE * 2.75);
    const shudderTime = Math.floor(FRAME_RATE * 1.75);
    const zoomTime = Math.floor(FRAME_RATE * 2.5);
    const shudderDelta = Math.max(Math.floor((4 * 20) / FRAME_RATE), 1);
    for (let i = 0; i < animTime; i++) {
      if (i < shudderTime) { // Fade out the white flash
        if (flash.opacity > 0) addOpacity(flash, -fadeStep);
      } else if (i === shudderTime) { // Make the flash black
        flash.tone = new Tone(-255, -255, -255);
      } else if (i >= zoomTime) { // Fade to black
        if (flash.opacity < 255) addOpacity(flash, fadeStep);
      }
      plane1.ox -= scrollStep;
      plane2.ox += scrollStep;
      if (i < shudderTime) {
        const j = i % Math.floor((2 * FRAME_RATE) / 20);
        if (j >= (0.5 * FRAME_RATE) / 20 && j < (1.5 * FRAME_RATE) / 20) {
          vs.x += shudderDelta;
          vs.y -= shudderDelta;
        } else {
          vs.x -= shudderDelta;
          vs.y += shudderDelta;
        }
      } else if (i < zoomTime) {
        vs.zoomX += (0.4 * 20) / FRAME_RATE;
        vs.zoomY += (0.4 * 20) / FRAME_RATE;
      }
      await wait();
    }
    // End of animation
    playerSprite.dispose();
    trainer.dispose();
    flash.dispose();
    vs.dispose();
    bar1.dispose();
    bar2.dispose();
    overlay.bitmap?.dispose();
    overlay.dispose();
    fade.dispose();
    viewvs.dispose();
    viewopp.dispose();
    viewplayer.dispose();
    viewport.color = new Color(0, 0, 0, 255); // Ensure screen is black
  },
);

//===============================================================================
// Play the "RocketGrunt" battle transition animation for any trainer battle
// involving a Team Rocket Grunt. Is lower priority than the Vs. animation above.
//===============================================================================
SpecialBattleIntroAnimations.register("rocket_grunt_animation", 40, // Priority 40
  (battleType, foe) => { // Condition
    if (battleType !== 1 && battleType !== 3) return false; // Only if a trainer battle
    const trainerTypes = ["TEAMROCKET_M", "TEAMROCKET_F", "ROCKET_Male", "ROCKET_Female"];
    return foes(foe).some((f) => trainerTypes.includes(f.trainerType));
  },
  async (viewport, _battleType, _foe, location) => { // Animation
    await pbBattleAnimationCore("RocketGrunt", viewport, location);
  },
);
