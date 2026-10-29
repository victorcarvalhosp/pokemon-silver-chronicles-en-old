// Port of 012_Overworld/002_Battle triggering/002_Overworld_BattleIntroAnim.rb:
// pbSceneStandby, pbBattleAnimation (battle music, the flashes and the named
// transition into the battle, and the fade back to the map afterwards) and
// SpecialBattleIntroAnimations.
//
// The special trainer intros registered by the Ruby file (vs_trainer_animation,
// vs_elite_four_animation, vs_admin_animation, alternate_vs_trainer_animation,
// rocket_grunt_animation) aren't ported yet: trainer battles use the default
// intro until they are (TODO(trainer intros), Ruby lines 196-441).

import type { AudioRef } from "../../data/events";
import { EncounterType } from "../../data/gameData/encounterType";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbPopFade, pbPushFade } from "../../ui/fades";
import type { SceneMap } from "../../scenes/SceneMap";
import { PBDayNight } from "../dayNight";
import { pokemonEncounters } from "../encounters/PokemonEncounters";
import { pbBGMPlay } from "../GameSystem";
import { G, pbUpdateSceneMap } from "../globals";
import { mapMetadata } from "../metadata";
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
