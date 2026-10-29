// Port of Data/Scripts/011_Battle/004_Scene/007_Battle_Scene_BaseAnimation.rb:
// Battle::Scene::Animation (the base of all hardcoded battle animations) and
// the BallAnimationMixin (here a subclass, BallAnimation), plus Essentials
// Deluxe's Animation helpers ([000] Essentials Patches/Battle_Scene.rb:150-584:
// addPokeSprite, darkenBattlefield, revertBattlefield; the dx* cinematic
// helpers used by Mega Evolution/Dynamax/midbattle cinematics aren't ported).
//
// PictureEx counts 60 Hz ticks with delays/durations in 1/20 s (see
// PictureEx.ts), and update() runs once per tick, so these last as long in
// seconds as in the original.
//
// Graphics used here must be preloaded (rpgCache) before an animation is
// created: IconSprite#setBitmap reads them synchronously, as in Ruby.

import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Viewport } from "../../rgss/display";
import { Color, Tone } from "../../rgss/types";
import { IconSprite } from "../../ui/SpriteWrapper";
import { PictureEx, PictureOrigin, setPictureIconSprite, type PictureTarget } from "../../ui/scenes/PictureEx";
import { PokemonSprite } from "../../ui/sprites/pokemonSprite";
import type { AnySprite } from "./SpriteProxy";
import type { SceneBattle, SceneTrainer } from "./types";

const SCREEN_W = 512;

/** The scene's @sprites hash, as animations see it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SceneSprites = Record<string, any>;

//===============================================================================
// Base class for all hardcoded battle animations.
//===============================================================================
export class Animation {
  protected sprites: SceneSprites;
  protected viewport: Viewport | null;
  protected pictureEx: PictureEx[] = []; // For all the PictureEx
  protected pictureSprites: AnySprite[] = []; // For all the sprites
  protected tempSprites: (AnySprite | null)[] = []; // For sprites that exist only for this animation
  protected _animDone = false;

  /**
   * Ruby's initialize sets the subclass's variables and then calls super, which
   * runs createProcesses. TS subclass fields only exist after super(), so
   * subclasses call this.createProcesses() at the end of their constructors.
   */
  constructor(sprites: SceneSprites, viewport: Viewport | null) {
    this.sprites = sprites;
    this.viewport = viewport;
  }

  dispose(): void {
    for (const s of this.tempSprites) s?.dispose();
  }

  createProcesses(): void {}
  empty(): boolean { return this.pictureEx.length === 0; }
  animDone(): boolean { return this._animDone; }

  addSprite(s: AnySprite, origin: number = PictureOrigin.TOP_LEFT): PictureEx {
    const num = this.pictureEx.length;
    const picture = new PictureEx(s.z);
    picture.x = s.x;
    picture.y = s.y;
    picture.visible = s.visible;
    picture.color = s.color.clone();
    picture.tone = s.tone.clone();
    picture.setOrigin(0, origin);
    this.pictureEx[num] = picture;
    this.pictureSprites[num] = s;
    return picture;
  }

  addNewSprite(x: number, y: number, name: string, origin: number = PictureOrigin.TOP_LEFT): PictureEx {
    const num = this.pictureEx.length;
    const picture = new PictureEx(num);
    picture.setXY(0, x, y);
    picture.setName(0, name);
    picture.setOrigin(0, origin);
    this.pictureEx[num] = picture;
    const s = new IconSprite(x, y, this.viewport);
    s.setBitmapFile(name);
    this.pictureSprites[num] = s;
    this.tempSprites.push(s);
    return picture;
  }

  update(): void {
    if (this._animDone) return;
    for (const s of this.tempSprites) s?.update();
    let finished = true;
    this.pictureEx.forEach((p, i) => {
      if (!p.running()) return;
      finished = false;
      p.update();
      setPictureIconSprite(this.pictureSprites[i] as unknown as PictureTarget, p);
    });
    if (finished) this._animDone = true;
  }

  //-----------------------------------------------------------------------------
  // Essentials Deluxe additions
  //-----------------------------------------------------------------------------
  /** Used for animation compatibility with animated Pokemon sprites. */
  addPokeSprite(poke: Pokemon | unknown[], origin: number = PictureOrigin.TOP_LEFT): PictureEx {
    const s = new PokemonSprite(this.viewport);
    if (Array.isArray(poke)) s.setSpeciesBitmap(...poke);
    else s.setPokemonBitmap(poke as Pokemon);
    const num = this.pictureEx.length;
    const picture = new PictureEx(s.z);
    picture.x = s.x;
    picture.y = s.y;
    picture.visible = s.visible;
    picture.color = s.color.clone();
    picture.tone = s.tone.clone();
    picture.setOrigin(0, origin);
    this.pictureEx[num] = picture;
    this.pictureSprites[num] = s;
    this.tempSprites.push(s);
    return picture;
  }

  /** Used to darken all sprites in battle for cinematic animations. */
  darkenBattlefield(battle: SceneBattle, delay = 0, idxBattler = -1, sound: string | null = null): void {
    const tone = new Tone(-60, -60, -60, 150);
    const battleBG = this.addSprite(this.sprites.battle_bg);
    battleBG.moveTone(delay, 4, tone);
    for (const b of battle.battlers) {
      if (!b) continue;
      const battler = this.addSprite(this.sprites[`pokemon_${b.index}`], PictureOrigin.BOTTOM);
      const shadow = this.addSprite(this.sprites[`shadow_${b.index}`], PictureOrigin.CENTER);
      const box = this.addSprite(this.sprites[`dataBox_${b.index}`]);
      if (b.index === idxBattler) {
        if (sound) battler.setSE(delay, sound);
        battler.moveTone(delay, 4, new Tone(255, 255, 255, 255));
      } else {
        battler.moveTone(delay, 4, tone);
      }
      shadow.moveTone(delay, 4, tone);
      box.moveTone(delay, 4, tone);
    }
  }

  /** Reverts the changes made by darkenBattlefield. */
  revertBattlefield(battle: SceneBattle, delay: number): void {
    const tone = new Tone(0, 0, 0, 0);
    const battleBG = this.addSprite(this.sprites.battle_bg);
    battleBG.moveTone(delay, 6, tone);
    for (const b of battle.battlers) {
      if (!b) continue;
      const battler = this.addSprite(this.sprites[`pokemon_${b.index}`], PictureOrigin.BOTTOM);
      const shadow = this.addSprite(this.sprites[`shadow_${b.index}`], PictureOrigin.CENTER);
      const box = this.addSprite(this.sprites[`dataBox_${b.index}`]);
      battler.moveTone(delay, 6, tone);
      shadow.moveTone(delay, 6, tone);
      box.moveTone(delay, 6, tone);
    }
  }
}

//===============================================================================
// Mixin module for certain hardcoded battle animations that involve Poké Balls.
//===============================================================================
type T = Tone;
type BurstVariance = [T, T, string, T, T, string, T, T, string, T, T, string, T, T];
type CaptureVariance = [string, T, T, string, T, T, string, T, T, string, T, T, string, T, T, T, T];
const t = (r: number, g: number, b: number, gray = 0) => new Tone(r, g, b, gray);

export class BallAnimation extends Animation {
  protected ballSprite: IconSprite | null = null;
  protected trainer: SceneTrainer | null = null;

  /** Returns the color that the Pokémon turns when it goes into or out of its Poké Ball. */
  getBattlerColorFromPokeBall(pokeBall: Id | null): Color {
    switch (pokeBall) {
      case "GREATBALL": return new Color(132, 189, 247);
      case "SAFARIBALL": return new Color(189, 247, 165);
      case "ULTRABALL": return new Color(255, 255, 123);
      case "MASTERBALL": return new Color(189, 165, 231);
      case "NETBALL": return new Color(173, 255, 206);
      case "DIVEBALL": return new Color(99, 206, 247);
      case "NESTBALL": return new Color(247, 222, 82);
      case "REPEATBALL": return new Color(255, 198, 132);
      case "TIMERBALL": return new Color(239, 247, 247);
      case "LUXURYBALL": return new Color(255, 140, 82);
      case "PREMIERBALL": return new Color(255, 74, 82);
      case "DUSKBALL": return new Color(115, 115, 140);
      case "HEALBALL": return new Color(255, 198, 231);
      case "QUICKBALL": return new Color(140, 214, 255);
      case "CHERISHBALL": return new Color(247, 66, 41);
    }
    return new Color(255, 181, 247); // Poké Ball, Sport Ball, Apricorn Balls, others
  }

  addBallSprite(ballX: number, ballY: number, pokeBall: Id | null): PictureEx {
    const filePath = `Graphics/Battle animations/ball_${pokeBall ?? ""}`;
    const ball = this.addNewSprite(ballX, ballY, filePath, PictureOrigin.CENTER);
    this.ballSprite = this.pictureSprites[this.pictureSprites.length - 1] as IconSprite;
    const bmp = this.ballSprite.bitmap!;
    if (bmp.width >= bmp.height) {
      this.ballSprite.srcRect.width = Math.floor(bmp.height / 2);
      ball.setSrcSize(0, Math.floor(bmp.height / 2), bmp.height);
    }
    return ball;
  }

  ballTracksHand(ball: PictureEx, traSprite: AnySprite, safariThrow = false): [number, number] {
    const bmp = traSprite.bitmap!;
    // Back sprite isn't animated, no hand-tracking needed
    if (bmp.width < bmp.height * 2) {
      ball.setVisible(7, true);
      let ballStartX = traSprite.x;
      if (!safariThrow) ballStartX -= ball.totalDuration() * Math.floor(SCREEN_W / (2 * 16));
      const ballStartY = traSprite.y - Math.floor(bmp.height / 2);
      return [ballStartX, ballStartY];
    }
    // Back sprite is animated, make the Poké Ball track the trainer's hand
    let coordSets = [[traSprite.x - 44, traSprite.y - 32], [-10, -36], [118, -4]];
    switch (this.trainer?.trainerType) {
      case "POKEMONTRAINER_Leaf":
        coordSets = [[traSprite.x - 30, traSprite.y - 30], [-18, -36], [118, -6]];
        break;
      case "POKEMONTRAINER_Brendan":
        coordSets = [[traSprite.x - 46, traSprite.y - 40], [-4, -30], [118, -2]];
        break;
      case "POKEMONTRAINER_May":
        coordSets = [[traSprite.x - 44, traSprite.y - 38], [-8, -30], [122, 0]];
        break;
    }
    const step = Math.floor(SCREEN_W / (2 * 16));
    // Arm stretched out behind player
    ball.setVisible(0, true);
    ball.setXY(0, coordSets[0]![0]!, coordSets[0]![1]!);
    if (!safariThrow) ball.moveDelta(0, 5, -5 * step, 0);
    if (safariThrow) ball.setDelta(0, -12, 0);
    // Arm mid throw
    ball.setDelta(5, coordSets[1]![0]!, coordSets[1]![1]!);
    if (!safariThrow) ball.moveDelta(5, 2, -2 * step, 0);
    if (safariThrow) ball.setDelta(5, 34, 0);
    // Start of throw
    ball.setDelta(7, coordSets[2]![0]!, coordSets[2]![1]!);
    if (safariThrow) ball.setDelta(7, -14, 0);
    // Update Poké Ball trajectory's start position
    let ballStartX = 0;
    let ballStartY = 0;
    for (const c of coordSets) {
      ballStartX += c[0]!;
      ballStartY += c[1]!;
    }
    if (!safariThrow) ballStartX -= ball.totalDuration() * step;
    if (safariThrow) ballStartX += 8; // -12 + 34 - 14
    return [ballStartX, ballStartY];
  }

  trainerThrowingFrames(ball: PictureEx, trainer: PictureEx, traSprite: AnySprite): [number, number] {
    ball.setZ(0, traSprite.z - 1);
    // Change trainer's frames
    const size = traSprite.srcRect.width; // Width per frame
    trainer.setSrc(0, size, 0);
    trainer.setSrc(5, size * 2, 0);
    trainer.setSrc(7, size * 3, 0);
    trainer.setSrc(9, size * 4, 0);
    trainer.setSrc(18, 0, 0);
    // Alter trainer's positioning
    trainer.setDelta(0, -12, 0);
    trainer.setDelta(5, 34, 0);
    trainer.setDelta(7, -14, 0);
    trainer.setDelta(9, 28, 0);
    trainer.moveDelta(10, 3, -6, 6);
    trainer.setDelta(18, -4, 0);
    trainer.setDelta(19, -26, -6);
    // Make ball track the trainer's hand
    return this.ballTracksHand(ball, traSprite, true);
  }

  createBallTrajectory(ball: PictureEx, delay: number, duration: number, startX: number, startY: number, _midX: number, midY: number, endX: number, endY: number): void {
    // NOTE: This trajectory is the same regardless of whether the player's
    //       sprite is being shown on-screen (and sliding off while animating a
    //       throw). Instead, that throw animation and initialDelay are designed
    //       to make sure the Ball's trajectory starts at the same position.
    ball.setVisible(delay, true);
    const a = 2 * startY - 4 * midY + 2 * endY;
    const b = 4 * midY - 3 * startY - endY;
    const c = startY;
    for (let i = 1; i <= duration; i++) {
      const tt = i / duration; // t ranges from 0 to 1
      const x = startX + (endX - startX) * tt; // Linear in t
      const y = a * tt ** 2 + b * tt + c; // Quadratic in t
      ball.moveXY(delay + i - 1, 1, x, y);
    }
    this.createBallTumbling(ball, delay, duration);
  }

  createBallTumbling(ball: PictureEx, delay: number, duration: number): void {
    // Animate ball frames
    const numTumbles = 1;
    let numFrames = 1;
    const bmp = this.ballSprite?.bitmap;
    if (bmp && bmp.width >= bmp.height) {
      // 2* because each frame is twice as tall as it is wide
      numFrames = Math.floor((2 * bmp.width) / bmp.height);
    }
    if (numFrames > 1) {
      let curFrame = 0;
      for (let i = 1; i <= duration; i++) {
        const thisFrame = Math.floor((numFrames * numTumbles * i) / duration);
        if (thisFrame > curFrame) {
          curFrame = thisFrame;
          ball.setSrc(delay + i - 1, (curFrame % numFrames) * Math.floor(bmp!.height / 2), 0);
        }
      }
      ball.setSrc(delay + duration, 0, 0);
    }
    // Rotate ball
    ball.moveAngle(delay, duration, 360 * 3);
    ball.setAngle(delay + duration, 0);
  }

  ballSetOpen(ball: PictureEx, delay: number, pokeBall: Id | null): void {
    ball.setName(delay, `Graphics/Battle animations/ball_${pokeBall ?? ""}_open`);
    const bmp = this.ballSprite?.bitmap;
    if (bmp && bmp.width >= bmp.height) ball.setSrcSize(delay, Math.floor(bmp.height / 2), bmp.height);
  }

  ballSetClosed(ball: PictureEx, delay: number, pokeBall: Id | null): void {
    ball.setName(delay, `Graphics/Battle animations/ball_${pokeBall ?? ""}`);
    const bmp = this.ballSprite?.bitmap;
    if (bmp && bmp.width >= bmp.height) ball.setSrcSize(delay, Math.floor(bmp.height / 2), bmp.height);
  }

  ballOpenUp(ball: PictureEx, delay: number, pokeBall: Id | null, showSquish = true, playSE = true): void {
    if (showSquish) {
      ball.moveZoomXY(delay, 1, 120, 80); // Squish
      ball.moveZoom(delay + 5, 1, 100); // Unsquish
      delay += 6;
    }
    if (playSE) ball.setSE(delay, "Battle recall");
    this.ballSetOpen(ball, delay, pokeBall);
  }

  battlerAppear(battler: PictureEx, delay: number, battlerX: number, battlerY: number, batSprite: AnySprite, color: Color): void {
    battler.setVisible(delay, true);
    battler.setOpacity(delay, 255);
    battler.moveXY(delay, 5, battlerX, battlerY);
    battler.moveZoom(delay, 5, 100, [batSprite, "pbPlayIntroAnimation"]);
    // NOTE: As soon as the battler sprite finishes zooming, and just as it
    //       starts changing its tone to normal, it plays its intro animation.
    color.alpha = 0;
    battler.moveColor(delay + 5, 10, color);
  }

  battlerAbsorb(battler: PictureEx, delay: number, battlerX: number, battlerY: number, color: Color): void {
    color.alpha = 255;
    battler.moveColor(delay, 10, color); // Change color of battler to a solid shade
    delay = battler.totalDuration();
    battler.moveXY(delay, 5, battlerX, battlerY);
    battler.moveZoom(delay, 5, 0); // Shrink battler into Poké Ball
    battler.setVisible(delay + 5, false);
  }

  /**
   * NOTE: This array makes the Ball Burst animation differ between types of Poké
   *       Ball in certain simple ways. The HGSS animations occasionally have
   *       additional differences, which haven't been coded yet in Essentials as
   *       they're more complex and I couldn't be bothered.
   * [ray start tone, ray end tone,
   *  top particle filename, top particle start tone, top particle end tone,
   *  bottom particle filename, bottom particle start tone, bottom particle end tone,
   *  top glare filename, top glare start tone, top glare end tone,
   *  bottom glare filename, bottom glare start tone, bottom glare end tone]
   */
  static readonly BALL_BURST_VARIANCES: Record<string, () => BurstVariance> = {
    POKEBALL: () => [t(0, 0, 0), t(0, 0, -192), // White, yellow
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, -128, -248), // Yellow, dark orange
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, 0, -192)], // Light yellow, yellow
    GREATBALL: () => [t(0, 0, 0), t(-128, -64, 0), // White, blue
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(-128, 0, 0), t(-248, -64, 0), // Cyan, dark cyan
      "particle", t(0, 0, 0), t(-96, -48, 0), // White, light blue
      "particle", t(-96, -48, 0), t(-192, -96, 0)], // Blue, dark blue
    SAFARIBALL: () => [t(0, 0, -32), t(-128, 0, -128), // Pale yellow, green
      "particle", t(0, 0, -64), t(-160, 0, -160), // Beige, darker green
      "particle", t(0, 0, -64), t(-160, 0, -160), // Beige, darker green
      "particle", t(0, 0, 0), t(-80, 0, -80), // White, light green
      "particle", t(-32, 0, -96), t(-160, 0, -160)], // Pale green, darker green
    ULTRABALL: () => [t(0, 0, 0), t(0, 0, -192), // White, yellow
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -64), t(0, 0, -224), // Pale yellow, yellow
      "dazzle", t(0, 0, 0), t(0, 0, -128), // White, light yellow
      "particle", t(0, 0, -64), t(0, 0, -224)], // Pale yellow, yellow
    MASTERBALL: () => [t(0, 0, 0), t(-48, -200, -56), // White, magenta
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, 0), t(-48, -200, -56), // White, magenta
      "dazzle", t(0, 0, 0), t(0, 0, 0), // White, white
      "dazzle", t(-48, -200, -56), t(-48, -200, -56)], // Magenta, magenta
    NETBALL: () => [t(0, 0, 0), t(0, -64, 0), // White, lilac
      "particle", t(0, 0, 0), t(0, -64, 0), // White, lilac
      "particle", t(0, 0, 0), t(0, -64, 0), // White, lilac
      "particle", t(0, 0, 0), t(0, -64, 0), // White, lilac
      "web", t(-32, -64, -32), t(-64, -128, -64)], // Light purple, purple
    DIVEBALL: () => [t(0, 0, 0), t(-192, -128, -32), // White, dark blue
      "bubble", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(-184, -40, 0), t(-184, -40, 0), // Cyan, cyan
      "dazzle", t(-184, -40, 0), t(-184, -40, 0), // Cyan, cyan
      "particle", t(0, 0, 0), t(-184, -40, 0)], // White, cyan
    NESTBALL: () => [t(0, 0, 0), t(0, 0, -192), // White, yellow
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, -128, -248), // Light yellow, dark orange
      "dazzle", t(0, 0, 0), t(-96, 0, -96), // White, green
      "particle", t(-96, 0, -96), t(-192, 0, -192)], // Green, dark green
    REPEATBALL: () => [t(0, 0, 0), t(0, 0, -192), // White, yellow
      "ring3", t(-16, -16, -88), t(-32, -32, -176), // Yellow, yellow
      "particle", t(-144, -144, -144), t(-160, -160, -160), // Grey, grey
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, -128, -248), t(0, -128, -248)], // Dark orange, dark orange
    TIMERBALL: () => [t(0, 0, 0), t(0, 0, -192), // White, yellow
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, -128, -248), // Yellow, dark orange
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, 0, -192)], // Light yellow, yellow
    LUXURYBALL: () => [t(0, 0, 0), t(0, -128, -160), // White, orange
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, -128, -248), // Yellow, dark orange
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, -64, -144), t(0, -192, -248)], // Light orange, red
    PREMIERBALL: () => [t(0, -160, -148), t(0, 0, 0), // Red, white
      "particle", t(0, -192, -152), t(0, -192, -152), // Red, red
      "particle", t(0, 0, 0), t(0, -192, -152), // White, red
      "dazzle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, 0), t(0, 0, 0)], // White, white
    DUSKBALL: () => [t(-48, -200, -56), t(-160, -224, -160), // Magenta, dark purple
      "particle", t(-248, -248, -248), t(-248, -248, -248), // Black, black
      "particle", t(-24, -96, -32), t(-24, -96, -32), // Light magenta, light magenta
      "particle", t(-248, -248, -248), t(-248, -248, -248), // Black, black
      "whirl", t(-160, -224, -160), t(-160, -224, -160)], // Dark purple, dark purple
    HEALBALL: () => [t(-8, -48, -8), t(-16, -128, -112), // Pink, dark pink
      "diamond", t(0, 0, 0), t(0, 0, 0), // White, white
      "diamond", t(0, -96, -104), t(-160, -64, 0), // Pink/orange, cyan
      "dazzle", t(0, 0, 0), t(-32, -112, -80), // White, magenta
      "particle", t(-8, -48, -8), t(-64, -224, -160)], // Pink, dark magenta
    QUICKBALL: () => [t(-64, 0, 0), t(-192, -96, 0), // Light cyan, dark blue
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, -128, -248), // Yellow, dark orange
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(-96, 0, 0), t(-192, -96, 0)], // Cyan, dark blue
    CHERISHBALL: () => [t(0, 0, 0), t(0, 0, 0), // White, white (unused; see below)
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, 0), t(0, 0, -192), // White ,yellow
      "particle", t(0, 0, 0), t(0, 0, 0), // White, white
      "particle", t(0, 0, -96), t(0, 0, -192)], // Light yellow, yellow
  };

  /** The regular Poké Ball burst animation, for when a Pokémon appears from a Poké Ball. */
  ballBurst(delay: number, _ball: PictureEx, ballX: number, ballY: number, pokeBall: Id | null): void {
    const numParticles = 15;
    const numRays = 10;
    const glareFadeDuration = 8; // Lifetimes/durations are in 20ths of a second
    const particleLifetime = 15;
    const particleFadeDuration = 8;
    const rayLifetime = 13;
    const rayFadeDuration = 5;
    const rayMinRadius = 24; // How far out from the center a ray starts
    const cherishBallRayTones = [t(-104, -144, -8), // Indigo
      t(-64, -144, -24), // Purple
      t(-8, -144, -64), // Pink
      t(-8, -48, -152), // Orange
      t(-8, -32, -160)]; // Yellow
    // Get array of things that vary for each kind of Poké Ball
    const variances = (BallAnimation.BALL_BURST_VARIANCES[pokeBall ?? ""] ?? BallAnimation.BALL_BURST_VARIANCES.POKEBALL!)();
    const v = variances as unknown[];
    const vt = (i: number) => v[i] as Tone;
    const vs = (i: number) => v[i] as string;
    // Set up glare particles
    const glare1 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(11)}`, PictureOrigin.CENTER);
    const glare2 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(8)}`, PictureOrigin.CENTER);
    [glare1, glare2].forEach((particle, num) => {
      particle.setZ(0, 105 + num);
      particle.setZoom(0, 0);
      particle.setTone(0, vt(12 - 3 * num));
      particle.setVisible(0, false);
    });
    [glare1, glare2].forEach((particle, num) => {
      particle.moveTone(delay + glareFadeDuration + 3, Math.floor(glareFadeDuration / 2), vt(13 - 3 * num));
    });
    // Animate glare particles
    for (const p of [glare1, glare2]) p.setVisible(delay, true);
    if (pokeBall === "MASTERBALL") {
      glare1.moveAngle(delay, 19, -135);
      glare1.moveZoom(delay, glareFadeDuration, 250);
    } else if (pokeBall === "DUSKBALL") {
      glare1.moveAngle(delay, 19, -270);
    } else if (["whirl"].includes(vs(11))) {
      glare1.moveZoom(delay, glareFadeDuration, 200);
    } else {
      glare1.moveZoom(delay, glareFadeDuration, ["dazzle", "ring3", "web"].includes(vs(11)) ? 100 : 250);
    }
    glare1.moveOpacity(delay + glareFadeDuration + 3, glareFadeDuration, 0);
    if (pokeBall === "MASTERBALL") {
      glare2.moveAngle(delay, 19, -135);
      glare2.moveZoom(delay, glareFadeDuration, 200);
    } else {
      glare2.moveZoom(delay, glareFadeDuration, ["dazzle", "ring3", "web"].includes(vs(8)) ? 125 : 200);
    }
    glare2.moveOpacity(delay + glareFadeDuration + 3, glareFadeDuration - 2, 0);
    for (const p of [glare1, glare2]) p.setVisible(delay + 19, false);
    // Rays
    for (let i = 0; i < numRays; i++) {
      // Set up ray
      const angle = rand(360);
      const radian = ((angle + 90) * Math.PI) / 180;
      const startZoom = 50 + rand(50);
      const ray = this.addNewSprite(ballX + rayMinRadius * Math.cos(radian),
        ballY - rayMinRadius * Math.sin(radian),
        "Graphics/Battle animations/ballBurst_ray", PictureOrigin.BOTTOM);
      ray.setZ(0, 100);
      ray.setZoomXY(0, 200, startZoom);
      if (pokeBall !== "CHERISHBALL") ray.setTone(0, vt(0));
      ray.setOpacity(0, 0);
      ray.setVisible(0, false);
      ray.setAngle(0, angle);
      // Animate ray
      const start = delay + Math.floor(i / 2);
      ray.setVisible(start, true);
      ray.moveZoomXY(start, rayLifetime, 200, startZoom * 6);
      ray.moveOpacity(start, 2, 255); // Quickly fade in
      ray.moveOpacity(start + rayLifetime - rayFadeDuration, rayFadeDuration, 0); // Fade out
      if (pokeBall === "CHERISHBALL") {
        for (let frame = 0; frame < rayLifetime; frame++) {
          ray.setTone(start + frame, cherishBallRayTones[frame % cherishBallRayTones.length]!);
        }
      } else {
        ray.moveTone(start + rayLifetime - rayFadeDuration, rayFadeDuration, vt(1));
      }
      ray.setVisible(start + rayLifetime, false);
    }
    // Particles
    for (let i = 0; i < numParticles; i++) {
      // Set up particles
      const particle1 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(5)}`, PictureOrigin.CENTER);
      const particle2 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(2)}`, PictureOrigin.CENTER);
      [particle1, particle2].forEach((particle, num) => {
        particle.setZ(0, 110 + num);
        particle.setZoom(0, Math.floor((80 - num * 20) / (["ring2"].includes(vs(5 - 3 * num)) ? 2 : 1)));
        particle.setTone(0, vt(6 - 3 * num));
        particle.setVisible(0, false);
      });
      // Animate particles
      const start = delay + Math.floor(i / 4);
      const maxRadius = 256 + rand(128);
      const angle = rand(360);
      const radian = (angle * Math.PI) / 180;
      [particle1, particle2].forEach((particle, num) => {
        particle.setVisible(start, true);
        particle.moveDelta(start, particleLifetime, maxRadius * Math.cos(radian), maxRadius * Math.sin(radian));
        particle.moveZoom(start, particleLifetime, 10);
        particle.moveTone(start + particleLifetime - particleFadeDuration,
          Math.floor(particleFadeDuration / 2), vt(7 - 3 * num));
        particle.moveOpacity(start + particleLifetime - particleFadeDuration,
          particleFadeDuration,
          0); // Fade out at end
        particle.setVisible(start + particleLifetime, false);
      });
    }
  }

  /**
   * NOTE: This array makes the Ball Burst capture animation differ between types
   *       of Poké Ball in certain simple ways.
   * [top glare filename, top particle start tone, top particle end tone,
   *  middle glare filename, middle glare start tone, middle glare end tone,
   *  bottom glare filename, bottom glare start tone, bottom glare end tone,
   *  top particle filename, top particle start tone, top particle end tone,
   *  bottom particle filename, bottom particle start tone, bottom particle end tone,
   *  ring tone start, ring tone end]
   */
  static readonly BALL_BURST_CAPTURE_VARIANCES: Record<string, () => CaptureVariance> = {
    POKEBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle_s", t(0, 0, 0), t(0, 0, 0),
      "particle_s", t(0, 0, 0), t(0, 0, -192), t(0, 0, -96), t(0, 0, -96)],
    GREATBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle_s", t(0, 0, 0), t(0, 0, 0),
      "particle_s", t(0, 0, 0), t(-128, -64, 0), t(-128, -32, 0), t(-128, -32, 0)],
    SAFARIBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle_s", t(-48, 0, -48), t(-48, 0, -48),
      "particle_s", t(-48, 0, -48), t(-128, 0, -128), t(-48, 0, -48), t(-128, 0, -128)],
    ULTRABALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle", t(0, 0, 0), t(0, 0, 0),
      "dazzle", t(0, 0, 0), t(0, 0, -192), t(0, 0, -128), t(0, 0, -128)],
    MASTERBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(-64, -128, -64), t(-96, -160, -96), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, -80, 0), t(0, -128, -64), t(0, 0, 0), t(-48, -200, -80)],
    NETBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle_s", t(-128, -56, 0), t(-128, -56, 0),
      "particle_s", t(-128, -56, 0), t(-128, -56, 0), t(-160, -64, 0), t(-128, -56, 0)],
    DIVEBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "bubble", t(0, 0, 0), t(0, 0, 0),
      "particle", t(-128, -48, 0), t(-128, -48, 0), t(-64, 0, 0), t(-180, -32, -32)],
    NESTBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "ring3", t(-32, 0, -104), t(-104, -16, -128),
      "ring3", t(0, 0, 0), t(0, 0, -192), t(-48, 0, -48), t(-128, 0, -128)],
    REPEATBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "ring3", t(-16, -16, -88), t(-32, -32, -176),
      "particle", t(-144, -144, -144), t(-160, -160, -160), t(0, 0, -96), t(0, 0, -96)],
    TIMERBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle_s", t(0, 0, 0), t(0, 0, -96),
      "particle_s", t(0, -48, -160), t(0, 0, -96), t(0, -48, -128), t(0, -160, -248)],
    LUXURYBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, -192, -248), "particle_s", t(0, 0, 0), t(0, 0, 0),
      "particle_s", t(0, 0, 0), t(0, 0, -192), t(0, -48, -128), t(0, -192, -248)],
    PREMIERBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, 0), "particle", t(0, 0, 0), t(0, 0, 0),
      "ring4", t(-16, -40, -80), t(-16, -136, -176), t(0, 0, 0), t(0, 0, 0)],
    DUSKBALL: () => ["particle", t(-255, -255, -255), t(-255, -255, -255), "whirl", t(-112, -184, -128), t(-255, -255, -255),
      "whirl", t(-112, -184, -128), t(-112, -184, -128), "particle", t(-112, -184, -128), t(-255, -255, -255),
      "particle_s", t(-112, -184, -128), t(-255, -255, -255), t(0, 0, -96), t(0, 0, -96)],
    HEALBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, -32, 0), t(0, -32, 0), "diamond", t(0, 0, 0), t(0, 0, 0),
      "diamond", t(0, 0, 0), t(-160, -64, 0), t(0, 0, 0), t(0, -32, 0)],
    QUICKBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, -192), "particle_s", t(0, 0, 0), t(0, 0, -96),
      "particle_s", t(0, -48, -160), t(0, 0, -96), t(0, -48, -128), t(0, -160, -248)],
    CHERISHBALL: () => ["particle", t(0, 0, 0), t(0, 0, 0), "dazzle", t(0, 0, 0), t(0, 0, 0),
      "particle", t(0, 0, 0), t(0, 0, 0), "particle", t(0, 0, 0), t(0, 0, 0),
      "ring4", t(-16, -40, -80), t(-16, -136, -176), t(0, 0, 0), t(0, 0, 0)],
  };

  /** The Poké Ball burst animation used when absorbing a wild Pokémon during a capture attempt. */
  ballBurstCapture(delay: number, ball: PictureEx, ballX: number, ballY: number, pokeBall: Id | null): void {
    const particleDuration = 10;
    const ringDuration = 5;
    const numParticles = 9;
    const baseAngle = 270;
    const baseRadius = pokeBall === "MASTERBALL" ? 192 : 144; // How far out from the Poké Ball the particles go
    // Get array of things that vary for each kind of Poké Ball
    const v = (BallAnimation.BALL_BURST_CAPTURE_VARIANCES[pokeBall ?? ""] ?? BallAnimation.BALL_BURST_CAPTURE_VARIANCES.POKEBALL!)() as unknown[];
    const vt = (i: number) => v[i] as Tone;
    const vs = (i: number) => v[i] as string;
    // Set up glare particles
    const glare1 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(6)}`, PictureOrigin.CENTER);
    const glare2 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(3)}`, PictureOrigin.CENTER);
    const glare3 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(0)}`, PictureOrigin.CENTER);
    [glare1, glare2, glare3].forEach((particle, num) => {
      particle.setZ(0, 100 + num);
      particle.setZoom(0, 0);
      particle.setTone(0, vt(7 - 3 * num));
      particle.setVisible(0, false);
    });
    glare2.setOpacity(0, 160);
    if (pokeBall !== "DUSKBALL") glare3.setOpacity(0, 160);
    // Animate glare particles
    for (const p of [glare1, glare2, glare3]) p.setVisible(delay, true);
    switch (pokeBall) {
      case "MASTERBALL": glare1.moveZoom(delay, particleDuration, 1200); break;
      case "DUSKBALL": glare1.moveZoom(delay, particleDuration, 350); break;
      default: glare1.moveZoom(delay, particleDuration, 600);
    }
    glare1.moveOpacity(delay + particleDuration / 2, particleDuration / 2, 0);
    [glare1, glare2, glare3].forEach((particle, num) => {
      particle.moveTone(delay, particleDuration, vt(8 - 3 * num));
    });
    if (pokeBall === "DUSKBALL") {
      glare2.moveZoom(delay, particleDuration, 350);
      glare3.moveZoom(delay, particleDuration, 500);
      for (const particle of [glare2, glare3]) {
        particle.moveOpacity(delay + particleDuration / 2, particleDuration / 2, 0);
      }
    } else {
      glare2.moveZoom(delay, particleDuration, pokeBall === "MASTERBALL" ? 400 : 250);
      glare2.moveOpacity(delay + particleDuration / 2, Math.floor(particleDuration / 3), 0);
      glare3.moveZoom(delay, particleDuration, pokeBall === "MASTERBALL" ? 800 : 500);
      glare3.moveOpacity(delay + particleDuration / 2, Math.floor(particleDuration / 3), 0);
    }
    for (const p of [glare1, glare2, glare3]) p.setVisible(delay + particleDuration, false);
    // Burst particles
    for (let i = 0; i < numParticles; i++) {
      // Set up particle that keeps moving out
      const particle1 = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_particle", PictureOrigin.CENTER);
      particle1.setZ(0, 105);
      particle1.setZoom(0, 150);
      particle1.setOpacity(0, 160);
      particle1.setVisible(0, false);
      // Set up particles that curve back in
      const particle2 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(12)}`, PictureOrigin.CENTER);
      const particle3 = this.addNewSprite(ballX, ballY, `Graphics/Battle animations/ballBurst_${vs(9)}`, PictureOrigin.CENTER);
      [particle2, particle3].forEach((particle, num) => {
        particle.setZ(0, 110 + num);
        particle.setZoom(0, pokeBall === "NESTBALL" ? 50 : 0);
        particle.setTone(0, vt(13 - 3 * num));
        particle.setVisible(0, false);
        if (pokeBall === "PREMIERBALL") particle.setAngle(0, rand(360));
      });
      if (pokeBall === "DIVEBALL") particle3.setOpacity(0, 128);
      // Particle animations
      for (const p of [particle1, particle2, particle3]) p.setVisible(delay, true);
      if (pokeBall === "NESTBALL") particle2.setVisible(delay, false);
      const startAngle = baseAngle + Math.floor((i * 360) / numParticles);
      const p1XOffset = baseRadius * Math.cos((startAngle * Math.PI) / 180);
      const p1YOffset = baseRadius * Math.sin((startAngle * Math.PI) / 180);
      for (let j = 0; j < particleDuration; j++) {
        const index = j + 1;
        const angle = startAngle + Math.floor((index * Math.floor(360 / numParticles)) / particleDuration);
        const radian = (angle * Math.PI) / 180;
        let radius = baseRadius;
        let prop = index / (particleDuration / 2);
        if (index > particleDuration / 2) prop = 2 - prop;
        radius *= prop;
        particle1.moveXY(delay + j, 1,
          ballX + (p1XOffset * index * 2) / particleDuration,
          ballY - (p1YOffset * index * 2) / particleDuration);
        for (const particle of [particle2, particle3]) {
          particle.moveXY(delay + j, 1,
            ballX + radius * Math.cos(radian),
            ballY - radius * Math.sin(radian));
        }
      }
      particle1.moveZoom(delay, particleDuration, 0);
      particle1.moveOpacity(delay, particleDuration, 0);
      [particle2, particle3].forEach((particle, num) => {
        const name = vs(12 - 3 * num);
        // Zoom in
        if (num === 0 && pokeBall === "MASTERBALL") {
          particle.moveZoom(delay, particleDuration / 2, 225);
        } else if (num === 0 && pokeBall === "DIVEBALL") {
          particle.moveZoom(delay, particleDuration / 2, 125);
        } else if (["particle"].includes(name)) {
          particle.moveZoom(delay, particleDuration / 2, pokeBall === "PREMIERBALL" ? 50 : 80);
        } else if (["ring3"].includes(name)) {
          particle.moveZoom(delay, particleDuration / 2, 50);
        } else if (["dazzle", "ring4", "diamond"].includes(name)) {
          particle.moveZoom(delay, particleDuration / 2, 60);
        } else {
          particle.moveZoom(delay, particleDuration / 2, 100);
        }
        // Zoom out
        if (["particle", "dazzle", "ring3", "ring4", "diamond"].includes(name)) {
          particle.moveZoom(delay + Math.floor((particleDuration * 2) / 3), Math.floor(particleDuration / 3), 10);
        } else {
          particle.moveZoom(delay + Math.floor((particleDuration * 2) / 3), Math.floor(particleDuration / 3), 25);
        }
        // Rotate (for Premier Ball)
        if (pokeBall === "PREMIERBALL") particle.moveAngle(delay, particleDuration, -180);
        // Change tone, fade out
        particle.moveTone(delay + Math.floor(particleDuration / 3), Math.ceil(particleDuration / 3), vt(14 - 3 * num));
        particle.moveOpacity(delay + particleDuration - 3, 3, 128); // Fade out at end
      });
      for (const p of [particle1, particle2, particle3]) p.setVisible(delay + particleDuration, false);
    }
    // Web sprite (for Net Ball)
    if (pokeBall === "NETBALL") {
      const web = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_web", PictureOrigin.CENTER);
      web.setZ(0, 123);
      web.setZoom(0, 120);
      web.setOpacity(0, 0);
      web.setTone(0, t(-32, -32, -128));
      web.setVisible(0, false);
      const start = particleDuration / 2;
      web.setVisible(delay + start, true);
      web.moveOpacity(delay + start, 2, 160);
      const webDuration = particleDuration + ringDuration - particleDuration / 2;
      for (let i = 0; i < Math.floor(webDuration / 4); i++) {
        web.moveZoom(delay + start + i * 4, 2, 150);
        web.moveZoom(delay + start + i * 4 + 2, 2, 120);
      }
      const now = start + Math.floor(webDuration / 4) * 4;
      web.moveZoom(delay + now, particleDuration + ringDuration - now, 150);
      web.moveOpacity(delay + particleDuration, ringDuration, 0);
      web.setVisible(delay + particleDuration + ringDuration, false);
    }
    // Ring particle
    const ring = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_ring1", PictureOrigin.CENTER);
    ring.setZ(0, 110);
    ring.setZoom(0, 0);
    ring.setTone(0, vt(15));
    ring.setVisible(0, false);
    // Ring particle animation
    ring.setVisible(delay + particleDuration, true);
    ring.moveZoom(delay + particleDuration - 2, ringDuration + 2, 125); // Start slightly early
    ring.moveTone(delay + particleDuration, ringDuration, vt(16));
    ring.moveOpacity(delay + particleDuration, ringDuration, 0);
    ring.setVisible(delay + particleDuration + ringDuration, false);
    // Mark the end of the burst animation
    ball.setDelta(delay + particleDuration + ringDuration, 0, 0);
  }

  /** The animation shown over a thrown Poké Ball when it has successfully caught a Pokémon. */
  ballCaptureSuccess(ball: PictureEx, delay: number, ballX: number, ballY: number): void {
    ball.setSE(delay, "Battle catch click");
    ball.moveTone(delay, 4, t(-128, -128, -128)); // Ball goes darker
    delay = ball.totalDuration();
    const starDuration = 12; // In 20ths of a second
    const yOffsets = [[0, 74, 52], [0, 62, 28], [0, 74, 48]];
    for (let i = 0; i < 3; i++) { // Left, middle, right
      // Set up particle
      const star = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_star", PictureOrigin.CENTER);
      star.setZ(0, 110);
      star.setZoom(0, [50, 50, 33][i]!);
      const startAngle = [0, 345, 15][i]!;
      star.setAngle(0, startAngle);
      star.setOpacity(0, 0);
      star.setVisible(0, false);
      // Particle animation
      star.setVisible(delay, true);
      const yPos = yOffsets[i]!;
      for (let j = 0; j < starDuration; j++) {
        const index = j + 1;
        const x = Math.floor((72 * index) / starDuration);
        const proportion = index / starDuration;
        const a = 2 * yPos[2]! - 4 * yPos[1]!;
        const b = yPos[2]! - a;
        const y = (a * proportion + b) * proportion;
        star.moveXY(delay + j, 1, ballX + [-1, 0, 1][i]! * x, ballY - y);
      }
      if (i % 2 === 0) star.moveAngle(delay, starDuration, startAngle + [144, 0, 45][i]!);
      star.moveOpacity(delay, 4, 255); // Fade in
      star.moveTone(delay + 3, 3, t(0, 0, -96)); // Light yellow
      star.moveTone(delay + 6, 3, t(0, 0, 0)); // White
      star.moveOpacity(delay + 8, 4, 0); // Fade out
    }
  }

  /**
   * The Poké Ball burst animation used when recalling a Pokémon. In HGSS, this
   * is the same for all types of Poké Ball except for the color that the battler
   * turns - see getBattlerColorFromPokeBall.
   */
  ballBurstRecall(delay: number, _ball: PictureEx, ballX: number, ballY: number, _pokeBall: Id | null): void {
    const colorDuration = 10; // Change color of battler to a solid shade - see battlerAbsorb
    const shrinkDuration = 5; // Shrink battler into Poké Ball - see battlerAbsorb
    const burstDuration = colorDuration + shrinkDuration;
    // Burst particles
    const numParticles = 5;
    const baseAngle = 55;
    const baseRadius = 64; // How far out from the Poké Ball the particles go
    for (let i = 0; i < numParticles; i++) {
      // Set up particle
      const particle = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_particle", PictureOrigin.CENTER);
      particle.setZ(0, 110);
      particle.setZoom(0, 150);
      particle.setOpacity(0, 0);
      particle.setVisible(0, false);
      // Particle animation
      particle.setVisible(delay, true);
      particle.moveOpacity(delay, 2, 255); // Fade in quickly
      for (let j = 0; j < burstDuration; j++) {
        const angle = baseAngle + Math.floor((i * 360) / numParticles) + (135.0 * j) / burstDuration;
        const radian = (angle * Math.PI) / 180;
        let radius = baseRadius;
        if (j < Math.floor(burstDuration / 5)) {
          const prop = j / Math.floor(colorDuration / 3);
          radius *= 0.75 + prop / 4;
        } else if (j >= Math.floor(burstDuration / 2)) {
          const prop = (j - Math.floor(burstDuration / 2)) / Math.floor(burstDuration / 2);
          radius *= 1 - prop;
        }
        if (j === 0) {
          particle.setXY(delay + j, ballX + radius * Math.cos(radian), ballY - radius * Math.sin(radian));
        } else {
          particle.moveXY(delay + j, 1, ballX + radius * Math.cos(radian), ballY - radius * Math.sin(radian));
        }
      }
      particle.moveZoom(delay, burstDuration, 0);
      particle.moveTone(delay + colorDuration / 2, colorDuration / 2, t(0, 0, -192)); // Yellow
      particle.moveTone(delay + colorDuration, shrinkDuration, t(0, -128, -248)); // Dark orange
      particle.moveOpacity(delay + colorDuration, shrinkDuration, 0); // Fade out at end
      particle.setVisible(delay + burstDuration, false);
    }
    // Ring particles
    const ring1 = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_ring1", PictureOrigin.CENTER);
    ring1.setZ(0, 110);
    ring1.setZoom(0, 0);
    ring1.setVisible(0, false);
    const ring2 = this.addNewSprite(ballX, ballY, "Graphics/Battle animations/ballBurst_ring2", PictureOrigin.CENTER);
    ring2.setZ(0, 110);
    ring2.setVisible(0, false);
    // Ring particle animations
    ring1.setVisible(delay + burstDuration - 2, true);
    ring1.moveZoom(delay + burstDuration - 2, 4, 100);
    ring1.setVisible(delay + burstDuration + 2, false);
    ring2.setVisible(delay + burstDuration + 2, true);
    ring2.moveZoom(delay + burstDuration + 2, 4, 200);
    ring2.moveOpacity(delay + burstDuration + 2, 4, 0);
  }
}

/** Graphics the ball animations draw for a given Poké Ball (for preloading). */
export function ballGraphics(pokeBall: Id | null | undefined): string[] {
  return [`Graphics/Battle animations/ball_${pokeBall ?? ""}`, `Graphics/Battle animations/ball_${pokeBall ?? ""}_open`];
}

/** The ball burst particles and screen covers used by the scene's animations. */
export const BURST_GRAPHICS: string[] = [
  ...["bubble", "dazzle", "diamond", "particle", "particle_s", "ray", "ring1", "ring2", "ring3", "ring4", "star", "web", "whirl"]
    .map((n) => `Graphics/Battle animations/ballBurst_${n}`),
  "Graphics/Battle animations/black_screen", "Graphics/Battle animations/black_bar",
];
