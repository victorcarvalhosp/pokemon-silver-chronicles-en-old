// Port of 009_Scenes/001_Transitions.rb: the coded screen transitions
// Graphics.transition plays for some names (judge_special_transition), drawn
// over the screenshot in $game_temp.background_bitmap. Every coded transition
// is ported: the other coded ones (BreakingGlass, Rotating/ShrinkingPieces,
// Splash, RandomStripe, ZoomIn, Scroll*, Mosaic), the HGSS wild and trainer
// intros, the VS/Rocket intros and FadeToBlack / FadeFromBlack. Other names
// fall back to an image transition / fade, as in Ruby.
//
// Bitmaps: RPG::Cache.transition raises in Ruby when a file is missing (so
// the `dispose if !@bitmap` checks never fire); here the files are fetched
// before the transition is built (bitmaps()) and a missing one just ends the
// transition at once. Ruby disposes the cached bitmaps when a transition ends;
// the port's cache keeps them, and only bitmaps a transition made itself
// (clones, text) are disposed.

import { rand, random } from "../../core/random";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics, type SpecialTransition } from "../../rgss/Graphics";
import { Color, Rect } from "../../rgss/types";
import { Cache } from "../../sprites/cache";
import { pbDrawTextPositions } from "../../ui/drawText";
import { pbSetSystemFont } from "../../ui/messageConfig";
import { rgssOpacity } from "../../ui/scenes/frames";
import { BitmapSprite } from "../../ui/SpriteWrapper";
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
  static bitmaps(): string[] { return []; }
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

  newSprite(x: number, y: number, bitmap: Bitmap | null, ox = 0, oy = 0): Sprite {
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

  /**
   * For the transitions that cut up the overworld screenshot: Ruby has no
   * check (no screenshot raises NoMethodError); the port ends the transition.
   */
  protected needsOverworld(): void {
    if (!this.overworldBitmap) this.isDisposed = true;
  }

  protected initializeBitmaps(): void {}
  protected initializeSprites(): void {}
  protected setUpTimings(): void {}
  protected disposeAll(): void {}
  protected updateAnim(): void {}
}

/** Ruby's Integer#/ (floors, also for negative numbers). */
const idiv = (a: number, b: number) => Math.floor(a / b);

/** Array#shuffle! (rb_ary_shuffle_bang's loop, with the port's RNG). */
function shuffle<T>(a: T[]): void {
  let i = a.length;
  while (i > 0) {
    const j = rand(i);
    i -= 1;
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
}

//===============================================================================
//
//===============================================================================
class BreakingGlass extends TransitionBase {
  static NUM_SPRITES_X = 8;
  static NUM_SPRITES_Y = 6;
  declare private startY: number[];

  protected override initializeBitmaps(): void {
    this.needsOverworld();
  }

  protected override initializeSprites(): void {
    this.overworldSprite.visible = false;
    const ow = this.overworldBitmap!;
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny } = BreakingGlass;
    // Overworld sprites
    const spriteWidth = idiv(ow.width, nx);
    const spriteHeight = idiv(ow.height, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        this.sprites[idx] = this.newSprite(i * spriteWidth, j * spriteHeight, ow);
        this.sprites[idx]!.srcRect.set(i * spriteWidth, j * spriteHeight, spriteWidth, spriteHeight);
      }
    }
  }

  protected override setUpTimings(): void {
    this.startY = [];
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny } = BreakingGlass;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        this.startY[idx] = this.sprites[idx]!.y;
        this.timings[idx] = 0.5 + random();
      }
    }
  }

  protected override updateAnim(): void {
    const proportion = this.timer / this.duration;
    this.sprites.forEach((sprite, i) => {
      sprite!.y = this.startY[i]! + Graphics.height * this.timings[i]! * proportion * proportion;
      sprite!.opacity = rgssOpacity(255 * (1 - proportion));
    });
  }
}

//===============================================================================
//
//===============================================================================
class ShrinkingPieces extends TransitionBase {
  static NUM_SPRITES_X = 8;
  static NUM_SPRITES_Y = 6;

  protected override initializeBitmaps(): void {
    this.needsOverworld();
  }

  protected override initializeSprites(): void {
    this.overworldSprite.visible = false;
    const ow = this.overworldBitmap!;
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny } = ShrinkingPieces;
    // Overworld sprites
    const spriteWidth = idiv(ow.width, nx);
    const spriteHeight = idiv(ow.height, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        this.sprites[idx] = this.newSprite((i + 0.5) * spriteWidth, (j + 0.5) * spriteHeight,
          ow, idiv(spriteWidth, 2), idiv(spriteHeight, 2));
        this.sprites[idx]!.srcRect.set(i * spriteWidth, j * spriteHeight, spriteWidth, spriteHeight);
      }
    }
  }

  protected override updateAnim(): void {
    const proportion = this.timer / this.duration;
    const nx = ShrinkingPieces.NUM_SPRITES_X;
    this.sprites.forEach((sprite, i) => {
      sprite!.zoomX = 1 - proportion;
      sprite!.zoomY = sprite!.zoomX;
      if (this.parameters[0]) { // Rotation
        const direction = 1 - 2 * ((idiv(i, nx) + (i % nx)) % 2);
        sprite!.angle = direction * 360 * 2 * proportion;
      }
    });
  }
}

//===============================================================================
//
//===============================================================================
class SplashTransition extends TransitionBase {
  static NUM_SPRITES_X = 16;
  static NUM_SPRITES_Y = 12;
  static SPEED = 40;
  declare private blackSprite: BitmapSprite | null;
  declare private startPositions: [number, number][];
  declare private moveVectors: [number, number][];

  protected override initializeBitmaps(): void {
    this.needsOverworld();
  }

  protected override initializeSprites(): void {
    this.overworldSprite.visible = false;
    // Black background
    this.blackSprite = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.blackSprite.bitmap!.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0));
    // Overworld sprites
    const ow = this.overworldBitmap!;
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny } = SplashTransition;
    const spriteWidth = idiv(ow.width, nx);
    const spriteHeight = idiv(ow.height, ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        this.sprites[idx] = this.newSprite((i + 0.5) * spriteWidth, (j + 0.5) * spriteHeight,
          ow, idiv(spriteWidth, 2), idiv(spriteHeight, 2));
        this.sprites[idx]!.srcRect.set(i * spriteWidth, j * spriteHeight, spriteWidth, spriteHeight);
      }
    }
  }

  protected override setUpTimings(): void {
    this.startPositions = [];
    this.moveVectors = [];
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny, SPEED } = SplashTransition;
    const vague = ((this.parameters[0] as number) || 9.6) * SPEED;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        const spr = this.sprites[idx]!;
        this.startPositions[idx] = [spr.x, spr.y];
        const dx = spr.x - Graphics.width / 2;
        const dy = spr.y - Graphics.height / 2;
        let moveX: number, moveY: number;
        if (dx === 0 && dy === 0) {
          moveX = dx === 0 ? randSign() * vague : dx * SPEED * 1.5;
          moveY = dy === 0 ? randSign() * vague : dy * SPEED * 1.5;
        } else {
          const radius = Math.sqrt(dx ** 2 + dy ** 2);
          moveX = (dx * vague) / radius;
          moveY = (dy * vague) / radius;
        }
        moveX += (random() - 0.5) * vague;
        moveY += (random() - 0.5) * vague;
        this.moveVectors[idx] = [moveX, moveY];
      }
    }
  }

  protected override disposeAll(): void {
    // (Ruby never disposes @black_sprite; its viewport goes with the transition.)
    this.blackSprite?.dispose();
  }

  protected override updateAnim(): void {
    const proportion = this.timer / this.duration;
    this.sprites.forEach((sprite, i) => {
      sprite!.x = this.startPositions[i]![0] + this.moveVectors[i]![0] * proportion;
      sprite!.y = this.startPositions[i]![1] + this.moveVectors[i]![1] * proportion;
      sprite!.opacity = rgssOpacity(384 * (1 - proportion));
    });
  }
}

function randSign(): number {
  return rand(2) === 0 ? 1 : -1;
}

//===============================================================================
//
//===============================================================================
class RandomStripeTransition extends TransitionBase {
  static STRIPE_WIDTH = 2;

  protected override initializeBitmaps(): void {
    this.needsOverworld();
  }

  protected override initializeSprites(): void {
    this.overworldSprite.visible = false;
    const ow = this.overworldBitmap!;
    const W = RandomStripeTransition.STRIPE_WIDTH;
    // Overworld sprites
    let spriteWidth: number, spriteHeight: number, numStripesX: number, numStripesY: number;
    if (this.parameters[0] === 0) { // Vertical stripes
      spriteWidth = W;
      spriteHeight = ow.height;
      numStripesX = idiv(ow.width, W);
      numStripesY = 1;
    } else { // Horizontal stripes
      spriteWidth = ow.width;
      spriteHeight = W;
      numStripesX = 1;
      numStripesY = idiv(ow.height, W);
    }
    for (let j = 0; j < numStripesY; j++) {
      for (let i = 0; i < numStripesX; i++) {
        const idx = j * numStripesX + i;
        this.sprites[idx] = this.newSprite(i * spriteWidth, j * spriteHeight, ow);
        this.sprites[idx]!.srcRect.set(i * spriteWidth, j * spriteHeight, spriteWidth, spriteHeight);
      }
    }
  }

  protected override setUpTimings(): void {
    const n = this.sprites.length;
    for (let i = 0; i < n; i++) this.timings[i] = (this.duration * i) / n;
    shuffle(this.timings);
  }

  protected override updateAnim(): void {
    this.sprites.forEach((sprite, i) => {
      if (this.timings[i]! < 0 || this.timer < this.timings[i]!) return;
      sprite!.visible = false;
      this.timings[i] = -1;
    });
  }
}

//===============================================================================
//
//===============================================================================
class ZoomInTransition extends TransitionBase {
  protected override initializeBitmaps(): void {
    this.needsOverworld();
  }

  protected override initializeSprites(): void {
    this.overworldSprite.x = Graphics.width / 2;
    this.overworldSprite.y = Graphics.height / 2;
    this.overworldSprite.ox = idiv(this.overworldBitmap!.width, 2);
    this.overworldSprite.oy = idiv(this.overworldBitmap!.height, 2);
  }

  protected override updateAnim(): void {
    const proportion = this.timer / this.duration;
    this.overworldSprite.zoomX = 1 + 7 * proportion;
    this.overworldSprite.zoomY = this.overworldSprite.zoomX;
    this.overworldSprite.opacity = rgssOpacity(255 * (1 - proportion));
  }
}

//===============================================================================
//
//===============================================================================
class ScrollScreen extends TransitionBase {
  protected override updateAnim(): void {
    const proportion = this.timer / this.duration;
    const dir = this.parameters[0] as number;
    if (dir % 3 !== 2) {
      this.overworldSprite.x = [1, -1, 0][dir % 3]! * Graphics.width * proportion;
    }
    if (idiv(dir - 1, 3) !== 1) {
      this.overworldSprite.y = [1, 0, -1][idiv(dir - 1, 3)]! * Graphics.height * proportion;
    }
  }
}

//===============================================================================
//
//===============================================================================
class MosaicTransition extends TransitionBase {
  static MAX_PIXELLATION_FACTOR = 16;
  declare private bufferOriginal: Bitmap | null;
  declare private bufferTemp: Bitmap | null;
  declare private startBlackFade: number;

  protected override initializeBitmaps(): void {
    this.needsOverworld();
    if (this.disposed()) return;
    this.bufferOriginal = this.overworldBitmap!.clone(); // Copy of original, never changes
    this.bufferTemp = this.overworldBitmap!.clone(); // "Clipboard" holding shrunken overworld
  }

  protected override setUpTimings(): void {
    this.startBlackFade = this.duration * 0.8;
  }

  protected override disposeAll(): void {
    this.bufferOriginal?.dispose();
    this.bufferTemp?.dispose();
  }

  protected override updateAnim(): void {
    const ow = this.overworldBitmap!;
    const proportion = this.timer / this.duration;
    const invProportion = 1 / (1 + proportion * (MosaicTransition.MAX_PIXELLATION_FACTOR - 1));
    // (Rect.new truncates its float arguments.)
    const newSizeRect = new Rect(0, 0, Math.trunc(ow.width * invProportion), Math.trunc(ow.height * invProportion));
    // Take all of buffer_original, shrink it and put it into buffer_temp
    this.bufferTemp!.stretchBlt(newSizeRect, this.bufferOriginal!, new Rect(0, 0, ow.width, ow.height));
    // Take shrunken area from buffer_temp and stretch it into buffer
    ow.stretchBlt(new Rect(0, 0, ow.width, ow.height), this.bufferTemp!, newSizeRect);
    if (this.timer >= this.startBlackFade) {
      this.overworldSprite.opacity = rgssOpacity(255 * (1 - (this.timer - this.startBlackFade) / (this.duration - this.startBlackFade)));
    }
  }
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
  static override bitmaps(): string[] { return ["black_square"]; }
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
  static override bitmaps(): string[] { return ["black_square"]; }
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
  static override bitmaps(): string[] { return ["water_1", "water_2", "black_half"]; }
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

/** Centres a sprite's origin on its bitmap (ox = width / 2, oy = height / 2). */
function centreOn(b: Bitmap): [number, number] {
  return [idiv(b.width, 2), idiv(b.height, 2)];
}

//===============================================================================
// HGSS trainer outdoor day
//===============================================================================
class TwoBallPass extends TransitionBase {
  protected static override DURATION = 1.0;
  static override bitmaps(): string[] { return ["black_half", "ball_small"]; }
  declare private blackBitmap: Bitmap | null;
  declare private ballBitmap: Bitmap | null;
  declare private ballSprites: Sprite[] | null;
  declare private ballStartX: number[];
  declare private ballRollEnd: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_half");
    this.ballBitmap = transitionBitmap("ball_small");
    if (!this.blackBitmap || !this.ballBitmap || !this.overworldBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const ow = this.overworldBitmap!;
    const ball = this.ballBitmap!;
    const black = this.blackBitmap!;
    this.overworldSprite.x = Graphics.width / 2;
    this.overworldSprite.y = Graphics.height / 2;
    [this.overworldSprite.ox, this.overworldSprite.oy] = centreOn(ow);
    // Balls that roll across the screen
    this.ballSprites = [];
    for (let i = 0; i < 2; i++) {
      const x = (1 - i) * Graphics.width + idiv((1 - i * 2) * ball.width, 2);
      const y = idiv(Graphics.height + (i * 2 - 1) * ball.width, 2);
      this.ballSprites[i] = this.newSprite(x, y, ball, ...centreOn(ball));
      this.ballSprites[i]!.z = 2;
    }
    // Black foreground sprites
    for (let i = 0; i < 2; i++) {
      this.sprites[i] = this.newSprite((1 - i * 2) * Graphics.width, idiv(i * Graphics.height, 2), black);
      this.sprites[i]!.z = 1;
    }
    this.sprites[2] = this.newSprite(0, Graphics.height / 2, black, 0, idiv(black.height, 2));
    this.sprites[2].z = 1;
    this.sprites[2].zoomY = 0.0;
  }

  protected override setUpTimings(): void {
    this.ballStartX = [this.ballSprites![0]!.x, this.ballSprites![1]!.x];
    this.ballRollEnd = this.duration * 0.4;
  }

  protected override disposeAll(): void {
    this.ballSprites?.forEach((s) => s?.dispose());
    this.ballSprites = [];
  }

  protected override updateAnim(): void {
    const balls = this.ballSprites!;
    if (this.timer <= this.ballRollEnd) {
      // Roll ball sprites across screen
      const proportion = this.timer / this.ballRollEnd;
      const totalDistance = Graphics.width + this.ballBitmap!.width;
      balls.forEach((sprite, i) => {
        sprite.x = this.ballStartX[i]! + (2 * i - 1) * (totalDistance * proportion);
        sprite.angle = (2 * i - 1) * 360 * proportion * 2;
      });
    } else {
      const proportion = (this.timer - this.ballRollEnd) / (this.duration - this.ballRollEnd);
      // Hide ball sprites
      if (balls[0]!.visible) balls.forEach((s) => { s.visible = false; });
      // Zoom in overworld sprite
      this.overworldSprite.zoomX = 1.0 + proportion * proportion; // Ends at 2x zoom
      this.overworldSprite.zoomY = this.overworldSprite.zoomX;
      // Slide first two black bars across
      this.sprites[0]!.x = Graphics.width * (1 - proportion * proportion);
      this.sprites[1]!.x = Graphics.width * (proportion * proportion - 1);
      // Expand third black bar
      this.sprites[2]!.zoomY = 2.0 * proportion * proportion; // Ends at 2x zoom
    }
  }
}

//===============================================================================
// HGSS trainer outdoor night
//===============================================================================
class SpinBallSplit extends TransitionBase {
  protected static override DURATION = 1.0;
  static override bitmaps(): string[] { return ["black_half", "ball_large"]; }
  declare private blackBitmap: Bitmap | null;
  declare private ballBitmap: Bitmap | null;
  declare private overworldSprites: Sprite[] | null;
  declare private blackSprites: Sprite[] | null;
  declare private ballSprites: Sprite[] | null;
  declare private ballSpinEnd: number;
  declare private slideStart: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_half");
    this.ballBitmap = transitionBitmap("ball_large");
    if (!this.blackBitmap || !this.ballBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const ball = this.ballBitmap!;
    const black = this.blackBitmap!;
    this.overworldSprite.visible = false;
    this.overworldSprites = [];
    this.blackSprites = [];
    this.ballSprites = [];
    for (let i = 0; i < 2; i++) {
      // Overworld sprites (they split apart)
      this.overworldSprites[i] = this.newSprite(Graphics.width / 2, Graphics.height / 2, this.overworldBitmap,
        Graphics.width / 2, idiv((1 - i) * Graphics.height, 2));
      this.overworldSprites[i]!.srcRect.set(0, idiv(i * Graphics.height, 2), Graphics.width, Graphics.height / 2);
      // Black sprites
      this.blackSprites[i] = this.newSprite((1 - i) * Graphics.width, idiv(i * Graphics.height, 2), black,
        i * black.width, 0);
      this.blackSprites[i]!.z = 1;
      // Ball sprites
      this.ballSprites[i] = this.newSprite(Graphics.width / 2, Graphics.height / 2, ball,
        idiv(ball.width, 2), idiv((1 - i) * ball.height, 2));
      this.ballSprites[i]!.z = 2;
      this.ballSprites[i]!.zoomX = 0.0;
      this.ballSprites[i]!.zoomY = 0.0;
    }
  }

  protected override setUpTimings(): void {
    this.ballSpinEnd = this.duration * 0.4;
    this.slideStart = this.duration * 0.5;
  }

  protected override disposeAll(): void {
    for (const list of [this.overworldSprites, this.blackSprites, this.ballSprites]) list?.forEach((s) => s?.dispose());
    this.overworldSprites = [];
    this.blackSprites = [];
    this.ballSprites = [];
  }

  protected override updateAnim(): void {
    const balls = this.ballSprites!;
    const ball = this.ballBitmap!;
    if (this.timer < this.ballSpinEnd) {
      // Ball spin
      const proportion = this.timer / this.ballSpinEnd;
      balls[0]!.zoomX = proportion;
      balls[0]!.zoomY = proportion;
      balls[0]!.angle = 360 * (1 - proportion);
    } else if (this.timer < this.slideStart) {
      // Fix zoom/angle of ball sprites
      if (balls[0]!.srcRect.height === ball.height) {
        balls.forEach((sprite, i) => {
          sprite.zoomX = 1.0;
          sprite.zoomY = 1.0;
          sprite.angle = 0;
          sprite.srcRect.set(0, idiv(i * ball.height, 2), ball.width, idiv(ball.height, 2));
        });
      }
    } else {
      // Split overworld/ball apart, move blackness in following them
      const proportion = (this.timer - this.slideStart) / (this.duration - this.slideStart);
      this.overworldSprites!.forEach((sprite, i) => {
        sprite.x = (0.5 + (i * 2 - 1) * proportion * proportion) * Graphics.width;
        sprite.zoomX = 1.0 + proportion * proportion; // Ends at 2x zoom
        sprite.zoomY = sprite.zoomX;
        this.blackSprites![i]!.x = sprite.x + ((1 - i * 2) * Graphics.width) / 2;
        balls[i]!.x = sprite.x;
      });
    }
  }
}

//===============================================================================
// HGSS trainer indoor day
//===============================================================================
class ThreeBallDown extends TransitionBase {
  protected static override DURATION = 2.0;
  static override bitmaps(): string[] { return ["black_square", "ball_small"]; }
  static NUM_SPRITES_X = 8;
  static NUM_SPRITES_Y = 6;
  static TOTAL_SPRITES = 8 * 6;
  static BALL_START_Y_OFFSETS = [400, 0, 100];
  declare private blackBitmap: Bitmap | null;
  declare private ballBitmap: Bitmap | null;
  declare private zoomXTarget: number;
  declare private zoomYTarget: number;
  declare private ballSprites: Sprite[] | null;
  declare private blackAppearStart: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_square");
    this.ballBitmap = transitionBitmap("ball_small");
    if (!this.blackBitmap || !this.ballBitmap || !this.overworldBitmap) {
      this.isDisposed = true;
      return;
    }
    this.zoomXTarget = Graphics.width / (this.blackBitmap.width * ThreeBallDown.NUM_SPRITES_X);
    this.zoomYTarget = Graphics.height / (this.blackBitmap.height * ThreeBallDown.NUM_SPRITES_Y);
  }

  protected override initializeSprites(): void {
    const black = this.blackBitmap!;
    const ball = this.ballBitmap!;
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny, BALL_START_Y_OFFSETS } = ThreeBallDown;
    this.overworldSprite.x = Graphics.width / 2;
    this.overworldSprite.y = Graphics.height / 2;
    [this.overworldSprite.ox, this.overworldSprite.oy] = centreOn(this.overworldBitmap!);
    // Black squares
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        // NOTE (Ruby parity): the squares are placed for the zoom but not
        // zoomed (009_Scenes/001_Transitions.rb:866-867); black_square fills
        // its cell exactly here, so it doesn't show.
        this.sprites[idx] = this.newSprite(i * black.width * this.zoomXTarget, j * black.height * this.zoomYTarget, black);
        this.sprites[idx]!.visible = false;
      }
    }
    // Falling balls
    this.ballSprites = [];
    for (let i = 0; i < 3; i++) {
      this.ballSprites[i] = this.newSprite(Graphics.width / 2 + (i - 1) * 160, -ball.height - BALL_START_Y_OFFSETS[i]!,
        ball, ...centreOn(ball));
      this.ballSprites[i]!.z = 2;
    }
  }

  protected override setUpTimings(): void {
    const { NUM_SPRITES_X: nx, NUM_SPRITES_Y: ny, TOTAL_SPRITES: total } = ThreeBallDown;
    this.blackAppearStart = this.duration * 0.2;
    const appearOrder = [0, 4, 1, 6, 7, 2, 5, 3];
    const period = this.duration - this.blackAppearStart;
    for (let j = 0; j < ny; j++) {
      const rowOffset = ny - j - 1;
      for (let i = 0; i < nx; i++) {
        const idx = j * nx + i;
        this.timings[idx] = (period * (rowOffset * nx + appearOrder[i]!)) / total;
        this.timings[idx] += this.blackAppearStart;
      }
    }
  }

  protected override disposeAll(): void {
    this.ballSprites?.forEach((s) => s?.dispose());
    this.ballSprites = [];
  }

  protected override updateAnim(): void {
    const balls = this.ballSprites!;
    const ball = this.ballBitmap!;
    const offsets = ThreeBallDown.BALL_START_Y_OFFSETS;
    if (this.timer < this.blackAppearStart) {
      // Balls drop down screen while spinning
      const proportion = this.timer / this.blackAppearStart;
      balls.forEach((sprite, i) => {
        sprite.y = -ball.height - offsets[i]!;
        sprite.y += (Graphics.height + Math.max(...offsets) + ball.height * 2) * proportion;
        sprite.angle = 1.5 * 360 * proportion * [1, -1][i === 2 ? 0 : 1]!;
      });
    } else {
      if (balls[0]!.visible) balls.forEach((s) => { s.visible = false; });
      // Black squares appear
      this.timings.forEach((timing, i) => {
        if (timing < 0 || this.timer < timing) return;
        this.sprites[i]!.visible = true;
        this.timings[i] = -1;
      });
      // Zoom in overworld sprite
      const proportion = (this.timer - this.blackAppearStart) / (this.duration - this.blackAppearStart);
      this.overworldSprite.zoomX = 1.0 + proportion * proportion; // Ends at 2x zoom
      this.overworldSprite.zoomY = this.overworldSprite.zoomX;
    }
  }
}

//===============================================================================
// HGSS trainer indoor night
// HGSS trainer cave
//===============================================================================
class BallDown extends TransitionBase {
  protected static override DURATION = 0.9;
  static override bitmaps(): string[] { return ["black_half", "black_curve", "ball_small"]; }
  declare private blackBitmap: Bitmap | null;
  declare private curveBitmap: Bitmap | null;
  declare private ballBitmap: Bitmap | null;
  declare private ballSprite: Sprite | null;
  declare private ballAppearEnd: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_half");
    this.curveBitmap = transitionBitmap("black_curve");
    this.ballBitmap = transitionBitmap("ball_small");
    if (!this.blackBitmap || !this.curveBitmap || !this.ballBitmap || !this.overworldBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const black = this.blackBitmap!;
    const curve = this.curveBitmap!;
    const ball = this.ballBitmap!;
    this.overworldSprite.x = Graphics.width / 2;
    this.overworldSprite.y = Graphics.height / 2;
    [this.overworldSprite.ox, this.overworldSprite.oy] = centreOn(this.overworldBitmap!);
    // Black sprites
    this.sprites[0] = this.newSprite(0, -curve.height, black, 0, black.height);
    this.sprites[0].z = 1;
    this.sprites[0].zoomY = 2.0;
    this.sprites[1] = this.newSprite(0, -curve.height, curve);
    this.sprites[1].z = 1;
    // Ball sprite
    this.ballSprite = this.newSprite(Graphics.width / 2, idiv(-ball.height, 2), ball, ...centreOn(ball));
    this.ballSprite.z = 2;
    this.ballSprite.zoomX = 0.0;
    this.ballSprite.zoomY = 0.0;
  }

  protected override setUpTimings(): void {
    this.ballAppearEnd = this.duration * 0.7;
  }

  protected override disposeAll(): void {
    this.ballSprite?.dispose();
  }

  protected override updateAnim(): void {
    const ball = this.ballBitmap!;
    const curve = this.curveBitmap!;
    if (this.timer <= this.ballAppearEnd) {
      // Make ball drop down and zoom in
      const proportion = this.timer / this.ballAppearEnd;
      this.ballSprite!.y = idiv(-ball.height, 2) + (Graphics.height + ball.height * 3) * proportion * proportion;
      this.ballSprite!.angle = -1.5 * 360 * proportion;
      this.ballSprite!.zoomX = 3 * proportion * proportion;
      this.ballSprite!.zoomY = this.ballSprite!.zoomX;
    } else {
      this.ballSprite!.visible = false;
      // Black curve and blackness descends
      const proportion = (this.timer - this.ballAppearEnd) / (this.duration - this.ballAppearEnd);
      for (const sprite of this.sprites) sprite!.y = -curve.height + (Graphics.height + curve.height) * proportion;
      // Zoom in overworld sprite
      this.overworldSprite.zoomX = 1.0 + proportion * proportion; // Ends at 2x zoom
      this.overworldSprite.zoomY = this.overworldSprite.zoomX;
    }
  }
}

//===============================================================================
// HGSS trainer water day
//===============================================================================
class WavyThreeBallUp extends TransitionBase {
  protected static override DURATION = 1.1;
  static override bitmaps(): string[] { return ["black_half", "ball_small"]; }
  static BALL_OFFSETS = [1.5, 3.25, 2.5];
  static MAX_WAVE_AMPLITUDE = 24;
  static WAVE_SPACING = Math.PI / 24; // Density of overworld waves (48 strips per wave)
  static WAVE_SPEED = Math.PI * 4; // Speed of overworld waves going up the screen
  declare private blackBitmap: Bitmap | null;
  declare private ballBitmap: Bitmap | null;
  declare private ballSprites: Sprite[] | null;
  declare private blackTrailSprites: Sprite[] | null;
  declare private ballRisingStart: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_half");
    this.ballBitmap = transitionBitmap("ball_small");
    if (!this.blackBitmap || !this.ballBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const ball = this.ballBitmap!;
    const offsets = WavyThreeBallUp.BALL_OFFSETS;
    this.overworldSprite.visible = false;
    // Overworld strips (they go all wavy)
    const rect = new Rect(0, 0, Graphics.width, 4);
    for (let i = 0; i < idiv(Graphics.height, 4); i++) {
      this.sprites[i] = this.newSprite(0, i * 4, this.overworldBitmap);
      this.sprites[i]!.z = 2;
      rect.y = i * 4;
      this.sprites[i]!.srcRect.set(rect); // (src_rect= copies the rect)
    }
    // Ball sprites
    this.ballSprites = [];
    for (let i = 0; i < 3; i++) {
      this.ballSprites[i] = this.newSprite(idiv((2 * i + 1) * Graphics.width, 6), offsets[i]! * Graphics.height,
        ball, ...centreOn(ball));
      this.ballSprites[i]!.z = 4;
    }
    // Black columns that follow the ball sprites
    this.blackTrailSprites = [];
    for (let i = 0; i < 3; i++) {
      this.blackTrailSprites[i] = this.newSprite(idiv((i - 1) * Graphics.width * 2, 3), offsets[i]! * Graphics.height, this.blackBitmap);
      this.blackTrailSprites[i]!.z = 3;
      this.blackTrailSprites[i]!.zoomY = 2.0;
    }
  }

  protected override setUpTimings(): void {
    this.ballRisingStart = this.duration * 0.4;
  }

  protected override disposeAll(): void {
    this.ballSprites?.forEach((s) => s?.dispose());
    this.ballSprites = [];
    this.blackTrailSprites?.forEach((s) => s?.dispose());
    this.blackTrailSprites = [];
  }

  protected override updateAnim(): void {
    const W = WavyThreeBallUp;
    // Make overworld wave strips oscillate
    const amplitude = W.MAX_WAVE_AMPLITUDE * Math.min(this.timer / 0.1, 1); // Build up to max in 0.1 seconds
    this.sprites.forEach((sprite, i) => {
      sprite!.x = (1 - (i % 2) * 2) * amplitude * Math.sin(this.timer * W.WAVE_SPEED + i * W.WAVE_SPACING);
    });
    // Move balls and trailing blackness up
    if (this.timer >= this.ballRisingStart) {
      const proportion = (this.timer - this.ballRisingStart) / (this.duration - this.ballRisingStart);
      this.ballSprites!.forEach((sprite, i) => {
        sprite.y = W.BALL_OFFSETS[i]! * Graphics.height - Graphics.height * 3.5 * proportion;
        sprite.angle = [-1, -1, 1][i]! * 360 * 2 * proportion;
        const trail = this.blackTrailSprites![i]!;
        trail.y = sprite.y;
        if (trail.y < 0) trail.y = 0;
      });
    }
  }
}

//===============================================================================
// HGSS trainer water night
//===============================================================================
class WavySpinBall extends TransitionBase {
  protected static override DURATION = 1.0;
  static override bitmaps(): string[] { return ["black_half", "ball_large"]; }
  static MAX_WAVE_AMPLITUDE = 24;
  static WAVE_SPACING = Math.PI / 24; // Density of overworld waves (48 strips per wave)
  static WAVE_SPEED = Math.PI * 4; // Speed of overworld waves going up the screen
  declare private blackBitmap: Bitmap | null;
  declare private ballBitmap: Bitmap | null;
  declare private ballSprite: Sprite | null;
  declare private blackSprite: Sprite | null;
  declare private ballAppearEnd: number;
  declare private blackAppearStart: number;

  protected override initializeBitmaps(): void {
    this.blackBitmap = transitionBitmap("black_half");
    this.ballBitmap = transitionBitmap("ball_large");
    if (!this.blackBitmap || !this.ballBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    this.overworldSprite.visible = false;
    // Overworld strips (they go all wavy)
    const rect = new Rect(0, 0, Graphics.width, 4);
    for (let i = 0; i < idiv(Graphics.height, 4); i++) {
      this.sprites[i] = this.newSprite(0, i * 4, this.overworldBitmap);
      this.sprites[i]!.z = 2;
      rect.y = i * 4;
      this.sprites[i]!.srcRect.set(rect);
    }
    // Ball sprite
    this.ballSprite = this.newSprite(Graphics.width / 2, Graphics.height / 2, this.ballBitmap, ...centreOn(this.ballBitmap!));
    this.ballSprite.z = 3;
    this.ballSprite.opacity = 0;
    // Black sprite
    this.blackSprite = this.newSprite(Graphics.width / 2, Graphics.height / 2, this.blackBitmap, ...centreOn(this.blackBitmap!));
    this.blackSprite.z = 4;
    this.blackSprite.zoomX = 0.0;
    this.blackSprite.zoomY = 0.0;
  }

  protected override setUpTimings(): void {
    this.ballAppearEnd = this.duration * 0.4;
    this.blackAppearStart = this.duration * 0.5;
  }

  protected override disposeAll(): void {
    this.ballSprite?.dispose();
    this.blackSprite?.dispose();
  }

  protected override updateAnim(): void {
    const W = WavySpinBall;
    // Make overworld wave strips oscillate
    const amplitude = W.MAX_WAVE_AMPLITUDE * Math.min(this.timer / 0.1, 1); // Build up to max in 0.1 seconds
    this.sprites.forEach((sprite, i) => {
      sprite!.x = (1 - (i % 2) * 2) * amplitude * Math.sin(this.timer * W.WAVE_SPEED + i * W.WAVE_SPACING);
    });
    if (this.timer <= this.ballAppearEnd) {
      // Fade in ball while spinning
      const proportion = this.timer / this.ballAppearEnd;
      this.ballSprite!.opacity = rgssOpacity(255 * proportion);
      this.ballSprite!.angle = -360 * proportion;
    } else if (this.timer <= this.blackAppearStart) {
      // Fix opacity/angle of ball sprite
      this.ballSprite!.opacity = 255;
      this.ballSprite!.angle = 0;
    } else {
      // Spread blackness from centre
      const proportion = (this.timer - this.blackAppearStart) / (this.duration - this.blackAppearStart);
      this.blackSprite!.zoomX = proportion;
      this.blackSprite!.zoomY = proportion * 2;
    }
  }
}

//===============================================================================
// HGSS double trainers
//===============================================================================
class FourBallBurst extends TransitionBase {
  protected static override DURATION = 0.9;
  static override bitmaps(): string[] { return ["black_wedge_1", "black_wedge_2", "black_wedge_3", "black_wedge_4", "ball_small"]; }
  declare private blackBitmaps: (Bitmap | null)[];
  declare private ballBitmap: Bitmap | null;
  declare private ballSprites: Sprite[] | null;
  declare private ballAppearEnd: number;

  protected override initializeBitmaps(): void {
    this.blackBitmaps = [1, 2, 3, 4].map((n) => transitionBitmap(`black_wedge_${n}`));
    this.ballBitmap = transitionBitmap("ball_small");
    if (this.blackBitmaps.some((b) => !b) || !this.ballBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const ball = this.ballBitmap!;
    // Ball sprites
    this.ballSprites = [];
    for (let i = 0; i < 4; i++) {
      this.ballSprites[i] = this.newSprite(Graphics.width / 2, Graphics.height / 2, ball, ...centreOn(ball));
      this.ballSprites[i]!.z = [2, 1, 3, 0][i]!;
    }
    // Black wedges
    this.blackBitmaps.forEach((b, i) => { this.sprites[i] = newWedge(this, b!, i); });
  }

  protected override setUpTimings(): void {
    this.ballAppearEnd = this.duration * 0.4;
  }

  protected override disposeAll(): void {
    this.ballSprites?.forEach((s) => s?.dispose());
    this.ballSprites = [];
  }

  protected override updateAnim(): void {
    const ball = this.ballBitmap!;
    if (this.timer <= this.ballAppearEnd) {
      // Balls fly out from centre of screen
      const proportion = this.timer / this.ballAppearEnd;
      const ballTravelX = idiv(Graphics.width + ball.width * 2, 2);
      const ballTravelY = idiv(Graphics.height + ball.height * 2, 2);
      this.ballSprites!.forEach((sprite, i) => {
        if (i % 2 === 1) sprite.x = Graphics.width / 2 + [0, 1, 0, -1][i]! * ballTravelX * proportion;
        if (i % 2 === 0) sprite.y = Graphics.height / 2 + [1, 0, -1, 0][i]! * ballTravelY * proportion;
      });
    } else {
      // Black wedges expand to fill screen
      const proportion = (this.timer - this.ballAppearEnd) / (this.duration - this.ballAppearEnd);
      expandWedges(this.sprites, proportion);
    }
  }
}

/** A black wedge sprite of FourBallBurst/RocketGrunt (zoomed to nothing, hidden). */
function newWedge(t: TransitionBase, b: Bitmap, i: number): Sprite {
  const even = i % 2 === 0;
  const s = t.newSprite(i === 1 ? 0 : Graphics.width / 2, i === 2 ? 0 : Graphics.height / 2, b,
    even ? idiv(b.width, 2) : 0, even ? 0 : idiv(b.height, 2));
  if (even) s.zoomX = 0.0;
  else s.zoomY = 0.0;
  s.visible = false;
  return s;
}

function expandWedges(sprites: (Sprite | null)[], proportion: number): void {
  sprites.forEach((sprite, i) => {
    sprite!.visible = true;
    if (i % 2 === 0) sprite!.zoomX = proportion;
    if (i % 2 === 1) sprite!.zoomY = proportion;
  });
}

/** $game_temp.transition_animation_data[i] */
const animData = (i: number): string => String(G.gameTemp.transitionAnimationData?.[i] ?? "");

/** BitmapSprite with one line of text, as the VS transitions draw the foe's name. */
function nameSprite(width: number, height: number, viewport: Viewport, text: string, x: number, y: number): BitmapSprite {
  const s = new BitmapSprite(width, height, viewport);
  pbSetSystemFont(s.bitmap!);
  pbDrawTextPositions(s.bitmap!, [[text, x, y, 0, new Color(248, 248, 248), new Color(72, 80, 80)]]);
  return s;
}

/** The three VS logo sprites (main + the two that zoom in), shared by VSTrainer and VSEliteFour. */
interface VSLogos { main: Sprite; vs1: Sprite; vs2: Sprite }

function updateVSLogos(timer: number, t: VSLogoTimings, l: VSLogos): void {
  if (timer >= t.vsAppearFinal) {
    l.vs1.visible = false;
  } else if (timer >= t.vsAppearStart2) {
    // Temp VS sprites enlarge and shrink again
    if (l.vs2.visible) {
      l.vs2.zoomX = 1.6 - (0.8 * (timer - t.vsAppearStart2)) / t.vsShrinkTime;
      l.vs2.zoomY = l.vs2.zoomX;
      if (l.vs2.zoomX <= 1.2) {
        l.vs2.visible = false;
        l.main.visible = true;
      }
    }
    l.vs1.zoomX = 2.0 - (0.8 * (timer - t.vsAppearStart2)) / t.vsShrinkTime;
    l.vs1.zoomY = l.vs1.zoomX;
  } else if (timer >= t.vsAppearStart) {
    // Temp VS sprites appear and start shrinking
    l.vs2.visible = true;
    l.vs2.zoomX = 2.0 - (0.8 * (timer - t.vsAppearStart)) / t.vsShrinkTime;
    l.vs2.zoomY = l.vs2.zoomX;
    if (l.vs1.visible || l.vs2.zoomX <= 1.6) { // Halfway between 2.0 and 1.2
      l.vs1.visible = true;
      l.vs1.zoomX = 2.0 - (0.8 * (timer - t.vsAppearStart - t.vsShrinkTime / 2)) / t.vsShrinkTime;
      l.vs1.zoomY = l.vs1.zoomX;
    }
  }
}

/** The timings updateVSLogos reads. */
interface VSLogoTimings { vsAppearStart: number; vsAppearStart2: number; vsShrinkTime: number; vsAppearFinal: number }

/** VS logo sprites: the main one (hgss_vs1) and the two hgss_vs2 ones that zoom in. */
function newVSLogos(t: TransitionBase, x: number, y: number, vs1: Bitmap, vs2: Bitmap, z: number): VSLogos {
  const main = t.newSprite(x, y, vs1, ...centreOn(vs1));
  main.z = z;
  main.visible = false;
  const l1 = t.newSprite(x, y, vs2, ...centreOn(vs2));
  l1.z = z + 1;
  l1.zoomX = 2.0;
  l1.zoomY = l1.zoomX;
  l1.visible = false;
  const l2 = t.newSprite(x, y, vs2, ...centreOn(vs2));
  l2.z = z + 2;
  l2.zoomX = 2.0;
  l2.zoomY = l2.zoomX;
  l2.visible = false;
  return { main, vs1: l1, vs2: l2 };
}

//===============================================================================
// HGSS VS Trainer animation
// Uses $game_temp.transition_animation_data, and expects it to be an array
// like so: [:TRAINERTYPE, "display name"]
// Bar graphics are named hgss_vsBar_TRAINERTYPE.png.
// Trainer sprites are named hgss_vs_TRAINERTYPE.png.
//===============================================================================
class VSTrainer extends TransitionBase {
  protected static override DURATION = 4.0;
  static override bitmaps(): string[] {
    return [`hgss_vsBar_${animData(0)}`, "hgss_vs1", "hgss_vs2", `hgss_vs_${animData(0)}`, "black_half"];
  }
  static BAR_Y = 80;
  static BAR_SCROLL_SPEED = 1800;
  static BAR_MASK = [8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 6, 7];
  static FOE_SPRITE_X_LIMIT = 384; // Slides to here before jumping to final position
  static FOE_SPRITE_X = 428; // Final position of foe sprite
  declare private barBitmap: Bitmap | null;
  declare private vs1Bitmap: Bitmap | null;
  declare private vs2Bitmap: Bitmap | null;
  declare private foeBitmap: Bitmap | null;
  declare private blackBitmap: Bitmap | null;
  declare private flashViewport: Viewport | null;
  declare private rearBlackSprite: Sprite | null;
  declare private barMaskSprite: Sprite | null;
  declare private vsX: number;
  declare private vsY: number;
  declare private vs: VSLogos | null;
  declare private foeSprite: Sprite | null;
  declare private textSprite: BitmapSprite | null;
  declare private blackSprite: Sprite | null;
  declare private barX: number;
  declare barAppearEnd: number;
  declare vsAppearStart: number;
  declare vsAppearStart2: number;
  declare vsShrinkTime: number;
  declare vsAppearFinal: number;
  declare private foeAppearStart: number;
  declare private foeAppearEnd: number;
  declare private flashStart: number;
  declare private flashDuration: number;
  declare private fadeToWhiteStart: number;
  declare private fadeToWhiteEnd: number;
  declare private fadeToBlackStart: number;

  protected override initializeBitmaps(): void {
    this.barBitmap = transitionBitmap(`hgss_vsBar_${animData(0)}`);
    this.vs1Bitmap = transitionBitmap("hgss_vs1");
    this.vs2Bitmap = transitionBitmap("hgss_vs2");
    this.foeBitmap = transitionBitmap(`hgss_vs_${animData(0)}`);
    this.blackBitmap = transitionBitmap("black_half");
    if (!this.barBitmap || !this.vs1Bitmap || !this.vs2Bitmap || !this.foeBitmap || !this.blackBitmap || !this.overworldBitmap) {
      this.isDisposed = true;
    }
  }

  protected override initializeSprites(): void {
    const V = VSTrainer;
    const bar = this.barBitmap!;
    const foe = this.foeBitmap!;
    this.flashViewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.flashViewport.z = 99999;
    this.flashViewport.color = new Color(255, 255, 255, 0);
    // Background black
    this.rearBlackSprite = this.newSprite(0, 0, this.blackBitmap);
    this.rearBlackSprite.z = 1;
    this.rearBlackSprite.zoomY = 2.0;
    this.rearBlackSprite.opacity = 224;
    this.rearBlackSprite.visible = false;
    // Bar sprites (need 2 of them to make them loop around)
    const numBars = Math.ceil(Graphics.width / bar.width) + 1;
    for (let i = 0; i < numBars; i++) {
      const spr = this.newSprite(bar.width * i, V.BAR_Y, bar);
      spr.z = 2;
      this.sprites.push(spr);
    }
    // Overworld sprite
    this.barMaskSprite = this.newSprite(0, 0, this.overworldBitmap!.clone());
    this.barMaskSprite.z = 3;
    // VS logo
    this.vsX = 144;
    this.vsY = this.sprites[0]!.y + idiv(this.sprites[0]!.height, 2);
    this.vs = newVSLogos(this, this.vsX, this.vsY,
      this.vs1Bitmap!, this.vs2Bitmap!, 4);
    // Foe sprite
    this.foeSprite = this.newSprite(Graphics.width + foe.width, this.sprites[0]!.y + this.sprites[0]!.height - 12,
      foe, idiv(foe.width, 2), foe.height);
    this.foeSprite.z = 7;
    this.foeSprite.color = new Color(0, 0, 0);
    // Sprite with foe's name written in it
    this.textSprite = nameSprite(Graphics.width, bar.height, this.viewport, animData(1), 244, 86);
    this.textSprite.y = V.BAR_Y;
    this.textSprite.z = 8;
    this.textSprite.visible = false;
    // Foreground black
    this.blackSprite = this.newSprite(0, 0, this.blackBitmap);
    this.blackSprite.z = 10;
    this.blackSprite.zoomY = 2.0;
    this.blackSprite.visible = false;
  }

  protected override setUpTimings(): void {
    this.barX = 0;
    this.barAppearEnd = 0.2; // Starts appearing at 0.0
    this.vsAppearStart = 0.7;
    this.vsAppearStart2 = 0.9;
    this.vsShrinkTime = this.vsAppearStart2 - this.vsAppearStart;
    this.vsAppearFinal = this.vsAppearStart2 + this.vsShrinkTime;
    this.foeAppearStart = 1.25;
    this.foeAppearEnd = 1.4;
    this.flashStart = 1.9;
    this.flashDuration = 0.25;
    this.fadeToWhiteStart = 3.0;
    this.fadeToWhiteEnd = 3.5;
    this.fadeToBlackStart = 3.8;
  }

  protected override disposeAll(): void {
    this.rearBlackSprite?.dispose();
    this.barMaskSprite?.bitmap?.dispose(); // (the overworld clone; Ruby never disposes it)
    this.barMaskSprite?.dispose();
    this.vs?.main.dispose();
    this.vs?.vs1.dispose();
    this.vs?.vs2.dispose();
    this.foeSprite?.dispose();
    this.textSprite?.dispose();
    this.blackSprite?.dispose();
    this.flashViewport?.dispose();
  }

  protected override updateAnim(): void {
    const V = VSTrainer;
    const bar = this.barBitmap!;
    const flash = this.flashViewport!.color;
    // Bar scrolling
    this.barX -= Graphics.deltaS * V.BAR_SCROLL_SPEED;
    if (this.barX <= -bar.width) this.barX += bar.width;
    this.sprites.forEach((spr, i) => { spr!.x = this.barX + i * bar.width; });
    // Vibrate VS sprite
    const vsPhase = Math.trunc(this.timer * 30) % 3;
    this.vs!.main.x = this.vsX + [0, 4, 0][vsPhase]!;
    this.vs!.main.y = this.vsY + [0, 0, -4][vsPhase]!;
    if (this.timer >= this.fadeToBlackStart) {
      // Fade to black
      this.blackSprite!.visible = true;
      const proportion = (this.timer - this.fadeToBlackStart) / (this.duration - this.fadeToBlackStart);
      flash.alpha = 255 * (1 - proportion);
    } else if (this.timer >= this.fadeToWhiteStart) {
      // Slowly fade to white
      const proportion = (this.timer - this.fadeToWhiteStart) / (this.fadeToWhiteEnd - this.fadeToWhiteStart);
      flash.alpha = 255 * proportion;
    } else if (this.timer >= this.flashStart + this.flashDuration) {
      flash.alpha = 0;
    } else if (this.timer >= this.flashStart) {
      // Flash the screen white
      const proportion = (this.timer - this.flashStart) / this.flashDuration;
      if (proportion >= 0.5) {
        flash.alpha = 320 * 2 * (1 - proportion);
        this.rearBlackSprite!.visible = true;
        this.foeSprite!.color.alpha = 0;
        this.textSprite!.visible = true;
      } else {
        flash.alpha = 320 * 2 * proportion;
      }
    } else if (this.timer >= this.foeAppearEnd) {
      this.foeSprite!.x = V.FOE_SPRITE_X;
    } else if (this.timer >= this.foeAppearStart) {
      // Foe sprite appears
      const proportion = (this.timer - this.foeAppearStart) / (this.foeAppearEnd - this.foeAppearStart);
      const startX = Graphics.width + idiv(this.foeBitmap!.width, 2);
      this.foeSprite!.x = startX + (V.FOE_SPRITE_X_LIMIT - startX) * proportion;
    } else if (this.timer >= this.vsAppearStart) {
      updateVSLogos(this.timer, this, this.vs!);
    } else if (this.timer >= this.barAppearEnd) {
      this.barMaskSprite!.visible = false;
    } else {
      const mask = this.barMaskSprite!;
      const startX = Graphics.width * (1 - this.timer / this.barAppearEnd);
      const color = new Color(0, 0, 0, 0); // Transparent
      for (let i = 0; i < idiv(this.sprites[0]!.height, 2); i++) {
        const x = startX - V.BAR_MASK[i % V.BAR_MASK.length]! * 4;
        // (Bitmap#fill_rect truncates its float arguments.)
        mask.bitmap!.fillRect(Math.trunc(x), V.BAR_Y + i * 2, Math.trunc(mask.width - x), 2, color);
      }
    }
  }
}

//===============================================================================
// HGSS VS Elite Four/Champion animation
// Uses $game_temp.transition_animation_data, and expects it to be an array
// like so: [:TRAINERTYPE, "display name", "player sprite name minus 'vsE4_'"]
// Bar graphics are named vsE4Bar_TRAINERTYPE.png.
// Trainer sprites are named vsE4_TRAINERTYPE.png.
//===============================================================================
class VSEliteFour extends TransitionBase {
  protected static override DURATION = 3.5;
  static override bitmaps(): string[] {
    return [`vsE4Bar_${animData(0)}`, "hgss_vs1", "hgss_vs2", `vsE4_${animData(2)}`, `vsE4_${animData(0)}`, "black_half"];
  }
  static BAR_X_INDENT = 48;
  static BAR_Y_INDENT = 64; // = height of trainer sprite / 2
  static BAR_OVERSHOOT = 20;
  static TRAINER_X_OFFSET = 160;
  static TRAINER_Y_OFFSET = 8;
  static BAR_HEIGHT = 192; // = Graphics.height / 2
  static FOE_SPRITE_X_LIMIT = 384; // Slides to here before jumping to final position
  static FOE_SPRITE_X = 428; // Final position of foe sprite
  declare private barBitmap: Bitmap | null;
  declare private vs1Bitmap: Bitmap | null;
  declare private vs2Bitmap: Bitmap | null;
  declare private playerBitmap: Bitmap | null;
  declare private foeBitmap: Bitmap | null;
  declare private blackBitmap: Bitmap | null;
  declare private numBarFrames: number;
  declare private flashViewport: Viewport | null;
  declare private rearBlackSprite: Sprite | null;
  declare private playerBarX: number;
  declare private playerBarStartX: number;
  declare private playerBarY: number;
  declare private playerBarSprite: Sprite | null;
  declare private foeBarX: number;
  declare private foeBarStartX: number;
  declare private foeBarY: number;
  declare private foeBarSprite: Sprite | null;
  declare private playerSprite: Sprite | null;
  declare private foeSprite: Sprite | null;
  declare private textSprite: BitmapSprite | null;
  declare private vs: VSLogos | null;
  declare private blackSprite: Sprite | null;
  declare private flash1Start: number;
  declare private flash1Duration: number;
  declare private barAppearStart: number;
  declare private barAppearEnd: number;
  declare vsAppearStart: number;
  declare vsAppearStart2: number;
  declare vsShrinkTime: number;
  declare vsAppearFinal: number;
  declare private flashStart: number;
  declare private flashDuration: number;
  declare private fadeToWhiteStart: number;
  declare private fadeToWhiteEnd: number;
  declare private fadeToBlackStart: number;

  protected override initializeBitmaps(): void {
    this.barBitmap = transitionBitmap(`vsE4Bar_${animData(0)}`);
    this.vs1Bitmap = transitionBitmap("hgss_vs1");
    this.vs2Bitmap = transitionBitmap("hgss_vs2");
    this.playerBitmap = transitionBitmap(`vsE4_${animData(2)}`);
    this.foeBitmap = transitionBitmap(`vsE4_${animData(0)}`);
    this.blackBitmap = transitionBitmap("black_half");
    // NOTE (Ruby parity): the player's sprite isn't checked here
    // (009_Scenes/001_Transitions.rb:1448); a missing one raises when its
    // width is read. The port ends the transition instead.
    if (!this.barBitmap || !this.vs1Bitmap || !this.vs2Bitmap || !this.foeBitmap || !this.blackBitmap || !this.playerBitmap) {
      this.isDisposed = true;
      return;
    }
    this.numBarFrames = idiv(this.barBitmap.height, VSEliteFour.BAR_HEIGHT);
  }

  protected override initializeSprites(): void {
    const V = VSEliteFour;
    const bar = this.barBitmap!;
    const halfBar = idiv(bar.width, 2);
    const playerBmp = this.playerBitmap!;
    const foe = this.foeBitmap!;
    this.flashViewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.flashViewport.z = 99999;
    this.flashViewport.color = new Color(255, 255, 255, 0);
    // Background black
    this.rearBlackSprite = this.newSprite(0, 0, this.blackBitmap);
    this.rearBlackSprite.z = 1;
    this.rearBlackSprite.zoomY = 2.0;
    this.rearBlackSprite.opacity = 192;
    this.rearBlackSprite.visible = false;
    // Player's bar sprite
    this.playerBarX = -V.BAR_X_INDENT;
    this.playerBarStartX = this.playerBarX - halfBar;
    this.playerBarY = V.BAR_Y_INDENT;
    this.playerBarSprite = this.newSprite(this.playerBarStartX, this.playerBarY, bar);
    this.playerBarSprite.z = 2;
    this.playerBarSprite.srcRect.width = halfBar;
    this.playerBarSprite.srcRect.height = V.BAR_HEIGHT;
    // Foe's bar sprite
    this.foeBarX = Graphics.width + V.BAR_X_INDENT - halfBar;
    this.foeBarStartX = this.foeBarX + halfBar;
    this.foeBarY = Graphics.height - V.BAR_HEIGHT - V.BAR_Y_INDENT;
    this.foeBarSprite = this.newSprite(this.foeBarStartX, this.foeBarY, bar);
    this.foeBarSprite.z = 2;
    this.foeBarSprite.srcRect.x = halfBar;
    this.foeBarSprite.srcRect.width = halfBar;
    this.foeBarSprite.srcRect.height = V.BAR_HEIGHT;
    // Player sprite
    this.playerSprite = this.newSprite(this.playerBarSprite.x + V.TRAINER_X_OFFSET,
      this.playerBarSprite.y + V.BAR_HEIGHT - V.TRAINER_Y_OFFSET, playerBmp, idiv(playerBmp.width, 2), playerBmp.height);
    this.playerSprite.z = 7;
    this.playerSprite.color = new Color(0, 0, 0);
    // Foe sprite
    this.foeSprite = this.newSprite(this.foeBarSprite.x + halfBar - V.TRAINER_X_OFFSET,
      this.foeBarSprite.y + foe.height - V.TRAINER_Y_OFFSET, foe, idiv(foe.width, 2), foe.height);
    this.foeSprite.z = 7;
    this.foeSprite.color = new Color(0, 0, 0);
    // Sprite with foe's name written in it
    this.textSprite = nameSprite(halfBar, V.BAR_HEIGHT, this.viewport, animData(1), 160, 86);
    this.textSprite.x = this.foeBarStartX;
    this.textSprite.y = this.foeBarY;
    this.textSprite.z = 8;
    // VS logo
    this.vs = newVSLogos(this, Graphics.width / 2, Graphics.height / 2,
      this.vs1Bitmap!, this.vs2Bitmap!, 14);
    // Foreground black
    this.blackSprite = this.newSprite(0, 0, this.blackBitmap);
    this.blackSprite.z = 20;
    this.blackSprite.zoomY = 2.0;
    this.blackSprite.visible = false;
  }

  protected override setUpTimings(): void {
    this.flash1Start = 0.0;
    this.flash1Duration = 0.25;
    this.barAppearStart = 0.5;
    this.barAppearEnd = 0.7;
    this.vsAppearStart = 0.6;
    this.vsAppearStart2 = 0.8;
    this.vsShrinkTime = this.vsAppearStart2 - this.vsAppearStart;
    this.vsAppearFinal = this.vsAppearStart2 + this.vsShrinkTime;
    this.flashStart = 1.7;
    this.flashDuration = 0.35;
    this.fadeToWhiteStart = 2.7;
    this.fadeToWhiteEnd = 3.0;
    this.fadeToBlackStart = 3.3;
  }

  protected override disposeAll(): void {
    this.rearBlackSprite?.dispose();
    this.playerBarSprite?.dispose();
    this.foeBarSprite?.dispose();
    this.playerSprite?.dispose();
    this.foeSprite?.dispose();
    this.textSprite?.dispose();
    this.vs?.main.dispose();
    this.vs?.vs1.dispose();
    this.vs?.vs2.dispose();
    this.blackSprite?.dispose();
    this.flashViewport?.dispose();
  }

  protected override updateAnim(): void {
    const V = VSEliteFour;
    const halfBar = idiv(this.barBitmap!.width, 2);
    const flash = this.flashViewport!.color;
    const pBar = this.playerBarSprite!;
    const fBar = this.foeBarSprite!;
    const pSpr = this.playerSprite!;
    const fSpr = this.foeSprite!;
    // Bars/trainer sprites slide in
    if (this.timer > this.barAppearEnd) {
      pBar.x = this.playerBarX;
      pSpr.x = pBar.x + V.TRAINER_X_OFFSET;
      fBar.x = this.foeBarX;
      fSpr.x = fBar.x + halfBar - V.TRAINER_X_OFFSET;
      this.textSprite!.x = fBar.x;
    } else if (this.timer > this.barAppearStart) {
      // Bars/trainer sprites slide in
      const proportion = (this.timer - this.barAppearStart) / (this.barAppearEnd - this.barAppearStart);
      const sqrtProportion = Math.sqrt(proportion);
      pBar.x = this.playerBarStartX + (this.playerBarX + V.BAR_OVERSHOOT - this.playerBarStartX) * sqrtProportion;
      pSpr.x = pBar.x + V.TRAINER_X_OFFSET;
      fBar.x = this.foeBarStartX + (this.foeBarX - V.BAR_OVERSHOOT - this.foeBarStartX) * sqrtProportion;
      fSpr.x = fBar.x + halfBar - V.TRAINER_X_OFFSET;
      this.textSprite!.x = fBar.x;
    }
    // Animate bars
    if (this.timer >= this.flashStart + 0.33 * this.flashDuration) {
      const barPhase = Math.trunc(this.timer * 30) % this.numBarFrames;
      pBar.srcRect.y = barPhase * V.BAR_HEIGHT;
      fBar.srcRect.y = barPhase * V.BAR_HEIGHT;
    }
    // Vibrate VS sprite
    const vsPhase = Math.trunc(this.timer * 30) % 3;
    this.vs!.main.x = Graphics.width / 2 + [0, 4, 0][vsPhase]!;
    this.vs!.main.y = Graphics.height / 2 + [0, 0, -4][vsPhase]!;
    // VS sprites appearing
    updateVSLogos(this.timer, this, this.vs!);
    // Flash white (two flashes)
    if (this.timer >= this.flashStart + this.flashDuration) {
      flash.alpha = 0;
    } else if (this.timer >= this.flashStart) {
      // Flash the screen white (coming from white lasts twice as long as going to white)
      const proportion = (this.timer - this.flashStart) / this.flashDuration;
      if (proportion >= 0.33) { // Coming from white
        flash.alpha = (320 * 3 * (1 - proportion)) / 2;
        pSpr.color.alpha = 0;
        fSpr.color.alpha = 0;
      } else { // Going to white
        flash.alpha = 320 * 3 * proportion;
      }
    } else if (this.timer >= this.flash1Start + this.flash1Duration) {
      flash.alpha = 0;
    } else if (this.timer >= this.flash1Start) {
      // Flash the screen white
      const proportion = (this.timer - this.flash1Start) / this.flash1Duration;
      if (proportion >= 0.5) { // Coming from white
        flash.alpha = 320 * 2 * (1 - proportion);
        this.rearBlackSprite!.visible = true;
      } else { // Going to white
        flash.alpha = 320 * 2 * proportion;
      }
    }
    // Fade to white at end
    if (this.timer >= this.fadeToBlackStart) {
      // Fade to black
      this.blackSprite!.visible = true;
      const proportion = (this.timer - this.fadeToBlackStart) / (this.duration - this.fadeToBlackStart);
      flash.alpha = 255 * (1 - proportion);
    } else if (this.timer >= this.fadeToWhiteStart) {
      this.textSprite!.visible = false;
      // Slowly fade to white
      const proportion = (this.timer - this.fadeToWhiteStart) / (this.fadeToWhiteEnd - this.fadeToWhiteStart);
      flash.alpha = 255 * proportion;
      // Move bars and trainer sprites off-screen
      const dist = V.BAR_Y_INDENT + V.BAR_HEIGHT;
      pBar.x = this.playerBarX - dist * proportion;
      pBar.y = this.playerBarY - dist * proportion;
      pSpr.x = pBar.x + V.TRAINER_X_OFFSET;
      pSpr.y = pBar.y + V.BAR_HEIGHT - V.TRAINER_Y_OFFSET;
      fBar.x = this.foeBarX + dist * proportion;
      fBar.y = this.foeBarY + dist * proportion;
      fSpr.x = fBar.x + halfBar - V.TRAINER_X_OFFSET;
      fSpr.y = fBar.y + this.foeBitmap!.height - V.TRAINER_Y_OFFSET;
    }
  }
}

//===============================================================================
// HGSS Rocket Grunt trainer(s)
//===============================================================================
class RocketGrunt extends TransitionBase {
  protected static override DURATION = 1.6;
  static override bitmaps(): string[] { return ["black_wedge_1", "black_wedge_2", "black_wedge_3", "black_wedge_4", "rocket_logo"]; }
  static ROCKET_X = [1.5, -0.5, -0.5, 0.75, 1.5, -0.5]; // * Graphics.width
  static ROCKET_Y = [-0.5, 1.0, -0.5, 1.5, 0.5, 0.75]; // * Graphics.height
  static ROCKET_ANGLE = [1, 0.5, -1.5, -1, -1.5, 0.5]; // * 360 * sprite.zoom_x
  declare private blackBitmaps: (Bitmap | null)[];
  declare private rocketBitmap: Bitmap | null;
  declare private rocketSprites: Sprite[] | null;
  declare private rocketAppearEnd: number;
  declare private rocketAppearDelay: number;
  declare private rocketAppearTime: number;

  protected override initializeBitmaps(): void {
    this.blackBitmaps = [1, 2, 3, 4].map((n) => transitionBitmap(`black_wedge_${n}`));
    this.rocketBitmap = transitionBitmap("rocket_logo");
    if (this.blackBitmaps.some((b) => !b) || !this.rocketBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const R = RocketGrunt;
    const rocket = this.rocketBitmap!;
    // Rocket sprites
    this.rocketSprites = R.ROCKET_X.map((rx, i) =>
      this.newSprite(rx * Graphics.width, R.ROCKET_Y[i]! * Graphics.height, rocket, ...centreOn(rocket)));
    // Black wedges
    this.blackBitmaps.forEach((b, i) => { this.sprites[i] = newWedge(this, b!, i); });
  }

  protected override setUpTimings(): void {
    this.rocketAppearEnd = this.duration * 0.75;
    this.rocketAppearDelay = 1.0 / (RocketGrunt.ROCKET_X.length + 1);
    this.rocketAppearTime = this.rocketAppearDelay * 2; // 2 logos on screen at once
  }

  protected override disposeAll(): void {
    this.rocketSprites?.forEach((s) => s?.dispose());
    this.rocketSprites = [];
  }

  protected override updateAnim(): void {
    const R = RocketGrunt;
    if (this.timer <= this.rocketAppearEnd) {
      // Rocket logos fly in from edges of screen
      const proportion = this.timer / this.rocketAppearEnd;
      this.rocketSprites!.forEach((sprite, i) => {
        if (!sprite.visible) return;
        const startTime = i * this.rocketAppearDelay;
        if (proportion < startTime) return;
        const singleProportion = (proportion - startTime) / this.rocketAppearTime;
        const sqrtSingleProportion = Math.sqrt(singleProportion);
        sprite.x = (R.ROCKET_X[i]! + (0.5 - R.ROCKET_X[i]!) * sqrtSingleProportion) * Graphics.width;
        sprite.y = (R.ROCKET_Y[i]! + (0.5 - R.ROCKET_Y[i]!) * sqrtSingleProportion) * Graphics.height;
        sprite.zoomX = 2.5 * (1 - singleProportion);
        sprite.zoomY = sprite.zoomX;
        sprite.angle = sprite.zoomX * R.ROCKET_ANGLE[i]! * 360;
        if (sprite.zoomX <= 0) sprite.visible = false;
      });
    } else {
      this.rocketSprites![this.rocketSprites!.length - 1]!.visible = false;
      // Black wedges expand to fill screen
      const proportion = (this.timer - this.rocketAppearEnd) / (this.duration - this.rocketAppearEnd);
      expandWedges(this.sprites, proportion);
    }
  }
}

//===============================================================================
// HGSS VS Team Rocket Admin animation
// Uses $game_temp.transition_animation_data, and expects it to be an array
// like so: [:TRAINERTYPE, "display name"]
// Bar graphics are named hgss_vsBar_TRAINERTYPE.png.
// Trainer sprites are named hgss_vs_TRAINERTYPE.png.
//===============================================================================
class VSRocketAdmin extends TransitionBase {
  protected static override DURATION = 3.1;
  static override bitmaps(): string[] {
    return ["rocket_strobes", "rocket_bg_1", "rocket_bg_2", `rocket_${animData(0)}`, "black_half"];
  }
  static STROBE_SCROLL_SPEED = 1440;
  static FOE_SPRITE_Y = 318;
  declare private strobesBitmap: Bitmap | null;
  declare private bg1Bitmap: Bitmap | null;
  declare private bg2Bitmap: Bitmap | null;
  declare private foeBitmap: Bitmap | null;
  declare private blackBitmap: Bitmap | null;
  declare private flashViewport: Viewport | null;
  declare private bg1Sprite: Sprite | null;
  declare private bg2Sprite: Sprite | null;
  declare private foeSprite: Sprite | null;
  declare private textSprite: BitmapSprite | null;
  declare private blackSprite: Sprite | null;
  declare private strobesX: number;
  declare private strobeAppearEnd: number;
  declare private bg1AppearStart: number;
  declare private bg1AppearEnd: number;
  declare private bg2AppearStart: number;
  declare private bg2AppearEnd: number;
  declare private flashEnd: number;
  declare private foeDisappearStart: number;
  declare private foeDisappearEnd: number;
  declare private fadeToWhiteEnd: number;
  declare private fadeToBlackStart: number;

  protected override initializeBitmaps(): void {
    this.strobesBitmap = transitionBitmap("rocket_strobes");
    this.bg1Bitmap = transitionBitmap("rocket_bg_1");
    this.bg2Bitmap = transitionBitmap("rocket_bg_2");
    this.foeBitmap = transitionBitmap(`rocket_${animData(0)}`);
    this.blackBitmap = transitionBitmap("black_half");
    if (!this.strobesBitmap || !this.bg1Bitmap || !this.bg2Bitmap || !this.foeBitmap || !this.blackBitmap) this.isDisposed = true;
  }

  protected override initializeSprites(): void {
    const V = VSRocketAdmin;
    const strobes = this.strobesBitmap!;
    const foe = this.foeBitmap!;
    this.flashViewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.flashViewport.z = 99999;
    this.flashViewport.color = new Color(255, 255, 255, 0);
    // Strobe sprites (need 2 of them to make them loop around)
    const numStrobes = Math.ceil(Graphics.width / strobes.width) + 1;
    for (let i = 0; i < numStrobes; i++) {
      const spr = this.newSprite(strobes.width * i, 0, strobes);
      spr.z = 1;
      spr.opacity = 0;
      this.sprites.push(spr);
    }
    // First bg sprite
    this.bg1Sprite = this.newSprite(0, Graphics.height / 2, this.bg1Bitmap);
    this.bg1Sprite.z = 3;
    this.bg1Sprite.srcRect.height = 0;
    // Second bg sprite
    this.bg2Sprite = this.newSprite(0, 0, this.bg2Bitmap);
    this.bg2Sprite.z = 5;
    this.bg2Sprite.opacity = 0;
    // Foe sprite
    this.foeSprite = this.newSprite(Graphics.width + foe.width, V.FOE_SPRITE_Y, foe, idiv(foe.width, 2), foe.height);
    this.foeSprite.z = 7;
    // Sprite with foe's name written in it
    this.textSprite = nameSprite(Graphics.width, Graphics.height - V.FOE_SPRITE_Y, this.viewport, animData(1), 272, 8);
    this.textSprite.y = V.FOE_SPRITE_Y;
    this.textSprite.z = 8;
    this.textSprite.visible = false;
    // Foreground black
    this.blackSprite = this.newSprite(0, 0, this.blackBitmap);
    this.blackSprite.z = 10;
    this.blackSprite.zoomY = 2.0;
    this.blackSprite.visible = false;
  }

  protected override setUpTimings(): void {
    this.strobesX = 0;
    this.strobeAppearEnd = 0.15; // Starts appearing at 0.0
    // White flash between these two times
    this.bg1AppearStart = 0.5;
    this.bg1AppearEnd = 0.65;
    this.bg2AppearStart = 1.0; // Also when foe sprite/name start appearing
    this.bg2AppearEnd = 1.1; // Also when foe sprite/name end appearing
    this.flashEnd = 1.35; // Starts at @bg_2_appear_end
    this.foeDisappearStart = 2.1;
    this.foeDisappearEnd = 2.3; // Also when screen starts turning white
    this.fadeToWhiteEnd = 2.5;
    this.fadeToBlackStart = 2.9;
  }

  protected override disposeAll(): void {
    this.bg1Sprite?.dispose();
    this.bg2Sprite?.dispose();
    this.foeSprite?.dispose();
    this.textSprite?.dispose();
    this.blackSprite?.dispose();
    this.flashViewport?.dispose();
  }

  protected override updateAnim(): void {
    const V = VSRocketAdmin;
    const strobes = this.strobesBitmap!;
    const flash = this.flashViewport!.color;
    const foe = this.foeSprite!;
    const text = this.textSprite!;
    const bg1 = this.bg1Sprite!;
    // Strobes scrolling
    if (this.sprites[0]!.visible) {
      this.strobesX -= Graphics.deltaS * V.STROBE_SCROLL_SPEED;
      if (this.strobesX <= -strobes.width) this.strobesX += strobes.width;
      this.sprites.forEach((spr, i) => { spr!.x = this.strobesX + i * strobes.width; });
    }
    if (this.timer >= this.fadeToBlackStart) {
      // Fade to black
      const proportion = (this.timer - this.fadeToBlackStart) / (this.duration - this.fadeToBlackStart);
      flash.alpha = 255 * (1 - proportion);
    } else if (this.timer >= this.fadeToWhiteEnd) {
      flash.alpha = 255; // Ensure screen is white
      this.blackSprite!.visible = true; // Make black overlay visible
    } else if (this.timer >= this.foeDisappearEnd) {
      foe.visible = false; // Ensure foe sprite has vanished
      text.visible = false; // Ensure name sprite has vanished
      // Slowly fade to white
      const proportion = (this.timer - this.foeDisappearEnd) / (this.fadeToWhiteEnd - this.foeDisappearEnd);
      flash.alpha = 255 * proportion;
    } else if (this.timer >= this.foeDisappearStart) {
      // Slide foe sprite/name off-screen
      const proportion = (this.timer - this.foeDisappearStart) / (this.foeDisappearEnd - this.foeDisappearStart);
      const startX = Graphics.width / 2;
      foe.x = startX - (this.foeBitmap!.width + startX) * proportion * proportion;
      text.x = foe.x - Graphics.width / 2;
    } else if (this.timer >= this.flashEnd) {
      flash.alpha = 0; // Ensure flash has ended
    } else if (this.timer >= this.bg2AppearEnd) {
      this.bg2Sprite!.opacity = 255; // Ensure BG 2 sprite is fully opaque
      foe.x = Graphics.width / 2; // Ensure foe sprite is in the right place
      text.x = 0; // Ensure name sprite is in the right place
      // Flash screen
      const proportion = (this.timer - this.bg2AppearEnd) / (this.flashEnd - this.bg2AppearEnd);
      flash.alpha = 320 * (1 - proportion);
    } else if (this.timer >= this.bg2AppearStart) {
      // BG 2 sprite appears
      const proportion = (this.timer - this.bg2AppearStart) / (this.bg2AppearEnd - this.bg2AppearStart);
      this.bg2Sprite!.opacity = rgssOpacity(255 * proportion);
      // Foe sprite/name appear
      const startX = Graphics.width + idiv(this.foeBitmap!.width, 2);
      foe.x = startX + (Graphics.width / 2 - startX) * Math.sqrt(proportion);
      text.x = foe.x - Graphics.width / 2;
      text.visible = true;
    } else if (this.timer >= this.bg1AppearEnd) {
      bg1.oy = Graphics.height / 2;
      bg1.srcRect.y = 0;
      bg1.srcRect.height = this.bg1Bitmap!.height;
      for (const sprite of this.sprites) sprite!.visible = false; // Hide strobes
    } else if (this.timer >= this.bg1AppearStart) {
      flash.alpha = 0; // Ensure flash has ended
      // BG 1 sprite appears
      const proportion = (this.timer - this.bg1AppearStart) / (this.bg1AppearEnd - this.bg1AppearStart);
      const halfHeight = Math.trunc((proportion * this.bg1Bitmap!.height) / 2);
      bg1.srcRect.height = halfHeight * 2;
      bg1.srcRect.y = idiv(this.bg1Bitmap!.height, 2) - halfHeight;
      bg1.oy = halfHeight;
    } else if (this.timer >= this.strobeAppearEnd) {
      for (const sprite of this.sprites) sprite!.opacity = 255; // Ensure strobes are fully opaque
      // Flash the screen white
      const proportion = (this.timer - this.strobeAppearEnd) / (this.bg1AppearStart - this.strobeAppearEnd);
      if (proportion >= 0.5) flash.alpha = 320 * 2 * (1 - proportion);
      else flash.alpha = 320 * proportion;
    } else {
      // Strobes fade in
      for (const sprite of this.sprites) sprite!.opacity = rgssOpacity(255 * (this.timer / this.strobeAppearEnd));
    }
  }
}

//===============================================================================
// Graphics.judge_special_transition: name -> coded transition
//===============================================================================
type TransitionClass = (new (duration: number, ...args: unknown[]) => TransitionBase) & { bitmaps(): string[] };
export const SPECIAL: Record<string, [TransitionClass, ...unknown[]]> = {
  // Other coded transitions
  breakingglass: [BreakingGlass],
  rotatingpieces: [ShrinkingPieces, true],
  shrinkingpieces: [ShrinkingPieces, false],
  splash: [SplashTransition, 9.6],
  random_stripe_v: [RandomStripeTransition, 0],
  random_stripe_h: [RandomStripeTransition, 1],
  zoomin: [ZoomInTransition],
  scrolldown: [ScrollScreen, 2],
  scrollleft: [ScrollScreen, 4],
  scrollright: [ScrollScreen, 6],
  scrollup: [ScrollScreen, 8],
  scrolldownleft: [ScrollScreen, 1],
  scrolldownright: [ScrollScreen, 3],
  scrollupleft: [ScrollScreen, 7],
  scrollupright: [ScrollScreen, 9],
  mosaic: [MosaicTransition],
  // HGSS transitions
  snakesquares: [SnakeSquares],
  diagonalbubbletl: [DiagonalBubble, 0],
  diagonalbubbletr: [DiagonalBubble, 1],
  diagonalbubblebl: [DiagonalBubble, 2],
  diagonalbubblebr: [DiagonalBubble, 3],
  risingsplash: [RisingSplash],
  twoballpass: [TwoBallPass],
  spinballsplit: [SpinBallSplit],
  threeballdown: [ThreeBallDown],
  balldown: [BallDown],
  wavythreeballup: [WavyThreeBallUp],
  wavyspinball: [WavySpinBall],
  fourballburst: [FourBallBurst],
  vstrainer: [VSTrainer],
  vselitefour: [VSEliteFour],
  rocketgrunt: [RocketGrunt],
  vsrocketadmin: [VSRocketAdmin],
  // Graphic transitions
  fadetoblack: [FadeToBlack],
  fadefromblack: [FadeFromBlack],
};

Graphics.specialTransition = async (name, seconds) => {
  const entry = SPECIAL[name];
  if (!entry) return null;
  const [cls, ...args] = entry;
  await Promise.all(cls.bitmaps().map((b) => Cache.ensure(`Graphics/Transitions/${b}`)));
  return new cls(seconds, ...args);
};
