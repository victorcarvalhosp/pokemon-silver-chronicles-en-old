// Port of 009_Scenes/001_Transitions.rb: the coded screen transitions
// Graphics.transition plays for some names (judge_special_transition), drawn
// over the screenshot in $game_temp.background_bitmap.
//
// Ported: the wild battle intros (SnakeSquares, DiagonalBubble*, RisingSplash)
// and FadeToBlack / FadeFromBlack. The trainer intros (TwoBallPass,
// SpinBallSplit, ThreeBallDown, BallDown, WavyThreeBallUp, WavySpinBall,
// FourBallBurst, VSTrainer, VSEliteFour, RocketGrunt, VSRocketAdmin) and the
// others (BreakingGlass, ShrinkingPieces, Splash, RandomStripe, ZoomIn,
// ScrollScreen, Mosaic) aren't yet: their names fall back to an image
// transition / fade, as Ruby does for unknown names.

import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics, type SpecialTransition } from "../../rgss/Graphics";
import { Rect } from "../../rgss/types";
import { Cache } from "../../sprites/cache";
import { G } from "../globals";

declare module "../globals" {
  interface GameTemp {
    /** Graphics.snap_to_bitmap taken just before a battle transition. */
    backgroundBitmap?: Bitmap | null;
    transitionAnimationData?: unknown[] | null;
  }
}

/** RPG::Cache.transition(name) */
function transitionBitmap(name: string): Bitmap | null {
  return Cache.get(`Graphics/Transitions/${name}`) ?? null;
}

//===============================================================================
// A base class that all other screen transition animations inherit from.
//===============================================================================
// Subclass fields are `declare`d: the base constructor calls initialize_* (as
// Ruby's does), and initialized fields would be reset after it returns.
abstract class TransitionBase implements SpecialTransition {
  /** Fixed duration in seconds (DURATION), or null to use the given one. */
  protected static DURATION: number | null = null;
  /** Graphics/Transitions files the transition needs (loaded before it's built). */
  static BITMAPS: string[] = [];
  protected isDisposed = false;
  protected duration = 0;
  protected parameters: unknown[];
  protected timer = 0;
  protected overworldBitmap: Bitmap | null;
  protected viewport!: Viewport;
  protected sprites: (Sprite | null)[] = [];
  protected overworldSprite!: Sprite;
  protected timings: number[] = [];

  constructor(duration: number, ...args: unknown[]) {
    this.parameters = args;
    this.overworldBitmap = G.gameTemp.backgroundBitmap ?? null;
    if (duration <= 0) {
      this.isDisposed = true;
      return;
    }
    this.duration = (this.constructor as typeof TransitionBase).DURATION ?? duration;
    this.initializeBitmaps();
    if (this.disposed()) return;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.overworldSprite = this.newSprite(0, 0, this.overworldBitmap);
    this.overworldSprite.z = -1;
    this.initializeSprites();
    this.setUpTimings();
  }

  protected newSprite(x: number, y: number, bitmap: Bitmap | null, ox = 0, oy = 0): Sprite {
    const s = new Sprite(this.viewport);
    s.x = x;
    s.y = y;
    s.ox = ox;
    s.oy = oy;
    s.setBitmap(bitmap);
    return s;
  }

  dispose(): void {
    if (this.disposed()) return;
    this.disposeAll();
    for (const s of this.sprites) s?.dispose();
    this.sprites = [];
    this.overworldSprite?.dispose();
    this.overworldBitmap?.dispose();
    if (G.gameTemp.backgroundBitmap === this.overworldBitmap) G.gameTemp.backgroundBitmap = null;
    this.viewport?.dispose();
    this.isDisposed = true;
  }

  disposed(): boolean {
    return this.isDisposed;
  }

  update(): void {
    if (this.disposed()) return;
    this.timer += Graphics.deltaS;
    if (this.timer >= this.duration) {
      this.dispose();
      return;
    }
    this.updateAnim();
  }

  protected initializeBitmaps(): void {}
  protected initializeSprites(): void {}
  protected setUpTimings(): void {}
  protected disposeAll(): void {}
  protected updateAnim(): void {}
}

//===============================================================================
//
//===============================================================================
class FadeToBlack extends TransitionBase {
  protected override updateAnim(): void {
    this.overworldSprite.opacity = 255 * (1 - this.timer / this.duration);
  }
}

class FadeFromBlack extends TransitionBase {
  protected override updateAnim(): void {
    this.overworldSprite.opacity = (255 * this.timer) / this.duration;
  }
}

//===============================================================================
// HGSS wild outdoor
//===============================================================================
class SnakeSquares extends TransitionBase {
  protected static override DURATION = 1.25;
  static override BITMAPS = ["black_square"];
  static TIME_TO_ZOOM = 0.2; // In seconds
  static NUM_SPRITES_X = 8;
  static NUM_SPRITES_Y = 6; // Must be an even number
  static TOTAL_SPRITES = 8 * 6;
  declare private blackBitmap: Bitmap | null;
  declare private zoomXTarget: number;
  declare private zoomYTarget: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_square");
    if (!this.blackBitmap) {
      this.isDisposed = true;
      return;
    }
    this.zoomXTarget = Graphics.width / (this.blackBitmap.width * SnakeSquares.NUM_SPRITES_X);
    this.zoomYTarget = Graphics.height / (this.blackBitmap.height * SnakeSquares.NUM_SPRITES_Y);
  }

  protected override initializeSprites(): void {
    const b = this.blackBitmap!;
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny, TOTAL_SPRITES: total } = SnakeSquares;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        let spriteX: number;
        if (idx >= total / 2) spriteX = (j % 2 === 1 ? i : nx - i - 1) * b.width;
        else spriteX = (j % 2 === 0 ? i : nx - i - 1) * b.width;
        spriteX += b.width / 2;
        const s = this.newSprite(spriteX, j * b.height * this.zoomYTarget, b, b.width / 2);
        s.zoomY = this.zoomYTarget;
        s.visible = false;
        this.sprites[idx] = s;
      }
    }
  }

  protected override setUpTimings(): void {
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny, TOTAL_SPRITES: total, TIME_TO_ZOOM } = SnakeSquares;
    const timeBetweenZooms = ((this.duration - TIME_TO_ZOOM) * 2) / (total - 1);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const idxFromStart = idx >= total / 2 ? total - 1 - idx : idx;
        this.timings[idx] = timeBetweenZooms * idxFromStart;
      }
    }
  }

  protected override disposeAll(): void {
    // (Ruby disposes the cached bitmap here; the port's cache keeps it.)
  }

  protected override updateAnim(): void {
    this.sprites.forEach((sprite, i) => {
      if (!sprite || this.timings[i]! < 0 || this.timer < this.timings[i]!) return;
      sprite.visible = true;
      sprite.zoomX = (this.zoomXTarget * (this.timer - this.timings[i]!)) / SnakeSquares.TIME_TO_ZOOM;
      if (sprite.zoomX >= this.zoomXTarget) {
        sprite.zoomX = this.zoomXTarget;
        this.timings[i] = -1;
      }
    });
  }
}

//===============================================================================
// HGSS wild indoor day (origin=0)
// HGSS wild indoor night (origin=3)
// HGSS wild cave (origin=3)
//===============================================================================
class DiagonalBubble extends TransitionBase {
  protected static override DURATION = 1.25;
  static override BITMAPS = ["black_square"];
  static TIME_TO_ZOOM = 0.2; // In seconds
  static NUM_SPRITES_X = 8;
  static NUM_SPRITES_Y = 6;
  static TOTAL_SPRITES = 8 * 6;
  declare private bitmap: Bitmap | null;
  declare private zoomXTarget: number;
  declare private zoomYTarget: number;

  protected override initializeBitmaps(): void {
    this.bitmap = transitionBitmap("black_square");
    if (!this.bitmap) {
      this.isDisposed = true;
      return;
    }
    this.zoomXTarget = Graphics.width / (this.bitmap.width * DiagonalBubble.NUM_SPRITES_X);
    this.zoomYTarget = Graphics.height / (this.bitmap.height * DiagonalBubble.NUM_SPRITES_Y);
  }

  protected override initializeSprites(): void {
    const b = this.bitmap!;
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny } = DiagonalBubble;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const s = this.newSprite((i * b.width + b.width / 2) * this.zoomXTarget, (j * b.height + b.height / 2) * this.zoomYTarget,
          b, b.width / 2, b.height / 2);
        s.visible = false;
        this.sprites[idx] = s;
      }
    }
  }

  protected override setUpTimings(): void {
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny, TOTAL_SPRITES: total, TIME_TO_ZOOM } = DiagonalBubble;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let idxFromStart = j * nx + i; // Top left -> bottom right
        switch (this.parameters[0]) { // Origin
          case 1: idxFromStart = j * nx + nx - i - 1; break; // Top right -> bottom left
          case 2: idxFromStart = total - 1 - (j * nx + nx - i - 1); break; // Bottom left -> top right
          case 3: idxFromStart = total - 1 - idxFromStart; break; // Bottom right -> top left
        }
        const dist = i + (j * (nx - 1)) / (ny - 1);
        this.timings[idxFromStart] = (dist / ((nx - 1) * 2)) * (this.duration - TIME_TO_ZOOM);
      }
    }
  }

  protected override updateAnim(): void {
    this.sprites.forEach((sprite, i) => {
      if (!sprite || this.timings[i]! < 0 || this.timer < this.timings[i]!) return;
      sprite.visible = true;
      const size = (this.timer - this.timings[i]!) / DiagonalBubble.TIME_TO_ZOOM;
      sprite.zoomX = this.zoomXTarget * size;
      sprite.zoomY = this.zoomYTarget * size;
      if (size < 1.0) return;
      sprite.zoomX = this.zoomXTarget;
      sprite.zoomY = this.zoomYTarget;
      this.timings[i] = -1;
    });
  }
}

//===============================================================================
// HGSS wild water
//===============================================================================
class RisingSplash extends TransitionBase {
  protected static override DURATION = 1.25;
  static override BITMAPS = ["water_1", "water_2", "black_half"];
  static MAX_WAVE_AMPLITUDE = 6;
  static WAVE_SPACING = Math.PI / 10; // Density of overworld waves (20 strips per wave)
  static WAVE_SPEED = Math.PI * 10; // Speed of overworld waves going up the screen
  static MAX_BUBBLE_AMPLITUDE = -32;
  static BUBBLES_WAVE_SPEED = Math.PI * 2;
  declare private bubbleBitmap: Bitmap | null;
  declare private splashBitmap: Bitmap | null;
  declare private blackBitmap: Bitmap | null;
  declare private bubblesSprite: Sprite | null;
  declare private splashSprite: Sprite | null;
  declare private blackSprite: Sprite | null;
  declare private splashRisingStart: number;
  declare private blackRisingStart: number;

  protected override initializeBitmaps(): void {
    this.bubbleBitmap = transitionBitmap("water_1");
    this.splashBitmap = transitionBitmap("water_2");
    this.blackBitmap = transitionBitmap("black_half");
    if (!this.bubbleBitmap || !this.splashBitmap || !this.blackBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    this.overworldSprite.visible = false;
    // Overworld strips (they go all wavy)
    for (let i = 0; i < Graphics.height / 2; i++) {
      const s = this.newSprite(0, i * 2, this.overworldBitmap);
      s.z = 2;
      s.srcRect = new Rect(0, i * 2, Graphics.width, 2);
      this.sprites[i] = s;
    }
    // Bubbles
    this.bubblesSprite = this.newSprite(0, Graphics.height, this.bubbleBitmap);
    this.bubblesSprite.z = 3;
    // Water splash
    this.splashSprite = this.newSprite(0, Graphics.height, this.splashBitmap);
    this.splashSprite.z = 4;
    // Foreground black
    this.blackSprite = this.newSprite(0, Graphics.height, this.blackBitmap);
    this.blackSprite.z = 5;
    this.blackSprite.zoomY = 2.0;
  }

  protected override setUpTimings(): void {
    this.splashRisingStart = this.duration * 0.5;
    this.blackRisingStart = this.duration * 0.9;
  }

  protected override disposeAll(): void {
    this.bubblesSprite?.dispose();
    this.splashSprite?.dispose();
    this.blackSprite?.dispose();
  }

  protected override updateAnim(): void {
    const R = RisingSplash;
    // Make overworld wave strips oscillate
    const amplitude = R.MAX_WAVE_AMPLITUDE * Math.min(this.timer / 0.1, 1); // Build up to max in 0.1 seconds
    this.sprites.forEach((sprite, i) => {
      if (sprite) sprite.x = amplitude * Math.sin(this.timer * R.WAVE_SPEED + i * R.WAVE_SPACING);
    });
    // Move bubbles sprite up and oscillate side to side
    this.bubblesSprite!.x = (Graphics.width - this.bubbleBitmap!.width) / 2;
    this.bubblesSprite!.x += R.MAX_BUBBLE_AMPLITUDE * Math.sin(this.timer * R.BUBBLES_WAVE_SPEED);
    this.bubblesSprite!.y = Graphics.height * (1 - this.timer * 1.2);
    // Move splash sprite up
    if (this.timer >= this.splashRisingStart) {
      const proportion = (this.timer - this.splashRisingStart) / (this.duration - this.splashRisingStart);
      this.splashSprite!.y = Graphics.height * (1 - proportion * 2);
    }
    // Move black sprite up
    if (this.timer >= this.blackRisingStart) {
      const proportion = (this.timer - this.blackRisingStart) / (this.duration - this.blackRisingStart);
      this.blackSprite!.y = Graphics.height * (1 - proportion);
    }
  }
}

//===============================================================================
// Graphics.judge_special_transition: name -> coded transition
//===============================================================================
type TransitionClass = (new (duration: number, ...args: unknown[]) => TransitionBase) & { BITMAPS: string[] };
const SPECIAL: Record<string, [TransitionClass, ...unknown[]]> = {
  // HGSS transitions
  snakesquares: [SnakeSquares],
  diagonalbubbletl: [DiagonalBubble, 0],
  diagonalbubbletr: [DiagonalBubble, 1],
  diagonalbubblebl: [DiagonalBubble, 2],
  diagonalbubblebr: [DiagonalBubble, 3],
  risingsplash: [RisingSplash],
  // Graphic transitions
  fadetoblack: [FadeToBlack],
  fadefromblack: [FadeFromBlack],
};

Graphics.specialTransition = async (name, seconds) => {
  const entry = SPECIAL[name];
  if (!entry) return null;
  const [cls, ...args] = entry;
  await Promise.all(cls.BITMAPS.map((b) => Cache.ensure(`Graphics/Transitions/${b}`)));
  return new cls(seconds, ...args);
};
