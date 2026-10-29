// Port of Data/Scripts/011_Battle/006_Other battle code/007_BattleAnimationPlayer.rb
// (AnimFrame, the point transforms, PBAnimTiming, PBAnimation(s),
// pbSpriteSetAnimFrame and PBAnimationPlayerX), and the loaders from
// 010_Data/002_PBS data/001_MiscPBSData.rb (pbLoadBattleAnimations,
// pbLoadMoveToAnim). The animations are web/data/pkmn-animations.json, made by
// tools/convert/convert.rb from Data/PkmnAnimations.rxdata and
// Data/move2anim.dat. The editor-only parts (pbConvertRPGAnimation,
// RPG::Animation#addAnimation, PBAnimTiming#to_s, PBAnimations#resize...) aren't
// ported.
//
// Timing: an animation frame lasts 1/20 s (@framesPerTick =
// Graphics.frame_rate / 20, i.e. 3 ticks at 60 Hz), as in the original.

import type { Id } from "../../data/gameData/gameData";
import { pbSEPlay } from "../../game/GameSystem";
import { FRAME_RATE } from "../../game/GameCharacter";
import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Color } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { AnimatedPlane, ColoredPlane } from "../../ui/planes";
import { preloadBitmaps } from "../../ui/rpgCache";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import { assignBitmap, type AnySprite } from "./SpriteProxy";
import type { SceneBattler } from "./types";

/** Battle::Scene focal points (do not change). */
export const FOCUSUSER_X = 128;
export const FOCUSUSER_Y = 224;
export const FOCUSTARGET_X = 384;
export const FOCUSTARGET_Y = 96;

//===============================================================================
//
//===============================================================================
export const AnimFrame = {
  X: 0,
  Y: 1,
  ZOOMX: 2,
  ANGLE: 3,
  MIRROR: 4,
  BLENDTYPE: 5,
  VISIBLE: 6,
  PATTERN: 7,
  OPACITY: 8,
  ZOOMY: 11,
  COLORRED: 12,
  COLORGREEN: 13,
  COLORBLUE: 14,
  COLORALPHA: 15,
  TONERED: 16,
  TONEGREEN: 17,
  TONEBLUE: 18,
  TONEGRAY: 19,
  LOCKED: 20,
  FLASHRED: 21,
  FLASHGREEN: 22,
  FLASHBLUE: 23,
  FLASHALPHA: 24,
  PRIORITY: 25,
  FOCUS: 26,
} as const;

/** A cel: the AnimFrame-indexed array (null slots are unused indices). */
export type Cel = (number | null)[];

//===============================================================================
//
//===============================================================================
export function yaxisIntersect(x1: number, y1: number, x2: number, y2: number, px: number, py: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const x = dx === 0 ? 0.0 : (px - x1) / dx;
  const y = dy === 0 ? 0.0 : (py - y1) / dy;
  return [x, y];
}

export function repositionY(x1: number, y1: number, x2: number, y2: number, tx: number, ty: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const x = x1 + tx * dx;
  const y = y1 + ty * dy;
  return [x, y];
}

export function transformPoint(x1: number, y1: number, x2: number, y2: number, // Source line
  x3: number, y3: number, x4: number, y4: number, // Destination line
  px: number, py: number): [number, number] { // Source point
  const ret = yaxisIntersect(x1, y1, x2, y2, px, py);
  return repositionY(x3, y3, x4, y4, ret[0], ret[1]);
}

export function getSpriteCenter(sprite: AnySprite | null | undefined): [number, number] {
  if (!sprite || sprite.isDisposed()) return [0, 0];
  if (!sprite.bitmap || sprite.bitmap.isDisposed()) return [sprite.x, sprite.y];
  const centerX = Math.floor(sprite.srcRect.width / 2);
  const centerY = Math.floor(sprite.srcRect.height / 2);
  const offsetX = (centerX - sprite.ox) * sprite.zoomX;
  const offsetY = (centerY - sprite.oy) * sprite.zoomY;
  return [sprite.x + offsetX, sprite.y + offsetY];
}

export function isReversed(src0: number, src1: number, dst0: number, dst1: number): boolean {
  if (src0 === src1) return false;
  if (src0 < src1) return dst0 > dst1;
  return dst0 < dst1;
}

//===============================================================================
//
//===============================================================================
/** PBAnimTiming as stored in pkmn-animations.json. */
export interface PBAnimTiming {
  frame: number;
  /** 0=play SE, 1=set bg, 2=bg mod, 3=set fg, 4=fg mod */
  timingType: number | null;
  name: string | null;
  volume: number;
  pitch: number;
  bgX: number | null;
  bgY: number | null;
  opacity: number | null;
  colorRed: number | null;
  colorGreen: number | null;
  colorBlue: number | null;
  colorAlpha: number | null;
  duration: number | null;
  flashScope: number;
  flashColor: number[];
  flashDuration: number;
}

interface PBAnimationData {
  id: number;
  name: string;
  graphic: string;
  hue: number;
  position: number;
  speed: number | null;
  scope: number;
  timing: PBAnimTiming[];
  frames: (Cel | null)[][];
}

const timingType = (t: PBAnimTiming) => t.timingType ?? 0;
const timingDuration = (t: PBAnimTiming) => t.duration ?? 5;

/** [bg x, bg y, opacity, color] remembered by "Move/recolour" timings. */
type OldBg = [number, number, number, Color] | [];

/** A battle animation (PBAnimation): frames of cels plus SE/background timings. */
export class PBAnimation {
  static readonly MAX_SPRITES = 60;
  readonly id: number;
  readonly name: string;
  readonly graphic: string;
  readonly hue: number;
  /** 1=target, 2=user, 3=user and target, 4=screen */
  readonly position: number;
  readonly timing: PBAnimTiming[];
  readonly array: (Cel | null)[][];

  constructor(data: PBAnimationData) {
    this.id = data.id;
    this.name = data.name;
    this.graphic = data.graphic;
    this.hue = data.hue;
    this.position = data.position;
    this.timing = data.timing;
    this.array = data.frames;
  }

  get speed(): number { return 20; }
  get length(): number { return this.array.length; }
  frame(i: number): (Cel | null)[] { return this.array[i] ?? []; }

  /** Every graphic this animation shows (for preloading). */
  graphics(): string[] {
    const ret = [`Graphics/Animations/${this.graphic}`];
    for (const t of this.timing) {
      if ((timingType(t) === 1 || timingType(t) === 3) && t.name) ret.push(`Graphics/Animations/${t.name}`);
    }
    return ret;
  }

  playTiming(frame: number, bgGraphic: AnimatedPlane, bgColor: ColoredPlane, foGraphic: AnimatedPlane, foColor: ColoredPlane,
    oldbg: OldBg = [], oldfo: OldBg = [], user: SceneBattler | null = null): void {
    for (const i of this.timing) {
      if (i.frame !== frame) continue;
      switch (timingType(i)) {
        case 0: // Play SE
          if (i.name && i.name !== "") {
            pbSEPlay("Anim/" + i.name, i.volume, i.pitch);
          } else if (user?.pokemon) {
            const name = SpeciesFiles.cryFilenameFromPokemon(user.pokemon);
            if (name) pbSEPlay(name, i.volume, i.pitch);
          }
          break;
        case 1: // Set background graphic (immediate)
          if (i.name && i.name !== "") {
            bgGraphic.setBitmap("Graphics/Animations/" + i.name);
            bgGraphic.ox = -(i.bgX ?? 0);
            bgGraphic.oy = -(i.bgY ?? 0);
            bgGraphic.color = new Color(i.colorRed ?? 0, i.colorGreen ?? 0, i.colorBlue ?? 0, i.colorAlpha ?? 0);
            bgGraphic.opacity = i.opacity ?? 0;
            bgColor.opacity = 0;
          } else {
            bgGraphic.setBitmap(null);
            bgGraphic.opacity = 0;
            bgColor.color = new Color(i.colorRed ?? 0, i.colorGreen ?? 0, i.colorBlue ?? 0, i.colorAlpha ?? 0);
            bgColor.opacity = i.opacity ?? 0;
          }
          break;
        case 2: // Move/recolour background graphic
          if (bgGraphic.bitmap == null) {
            oldbg[0] = 0;
            oldbg[1] = 0;
            oldbg[2] = bgColor.opacity ?? 0;
            oldbg[3] = bgColor.color.clone();
          } else {
            oldbg[0] = bgGraphic.ox ?? 0;
            oldbg[1] = bgGraphic.oy ?? 0;
            oldbg[2] = bgGraphic.opacity ?? 0;
            oldbg[3] = bgGraphic.color.clone();
          }
          break;
        case 3: // Set foreground graphic (immediate)
          if (i.name && i.name !== "") {
            foGraphic.setBitmap("Graphics/Animations/" + i.name);
            foGraphic.ox = -(i.bgX ?? 0);
            foGraphic.oy = -(i.bgY ?? 0);
            foGraphic.color = new Color(i.colorRed ?? 0, i.colorGreen ?? 0, i.colorBlue ?? 0, i.colorAlpha ?? 0);
            foGraphic.opacity = i.opacity ?? 0;
            foColor.opacity = 0;
          } else {
            foGraphic.setBitmap(null);
            foGraphic.opacity = 0;
            foColor.color = new Color(i.colorRed ?? 0, i.colorGreen ?? 0, i.colorBlue ?? 0, i.colorAlpha ?? 0);
            foColor.opacity = i.opacity ?? 0;
          }
          break;
        case 4: // Move/recolour foreground graphic
          if (foGraphic.bitmap == null) {
            oldfo[0] = 0;
            oldfo[1] = 0;
            oldfo[2] = foColor.opacity ?? 0;
            oldfo[3] = foColor.color.clone();
          } else {
            oldfo[0] = foGraphic.ox ?? 0;
            oldfo[1] = foGraphic.oy ?? 0;
            oldfo[2] = foGraphic.opacity ?? 0;
            oldfo[3] = foGraphic.color.clone();
          }
          break;
      }
    }
    for (const i of this.timing) {
      const type = timingType(i);
      if (type !== 2 && type !== 4) continue;
      const dur = timingDuration(i);
      if (!dur || dur <= 0) continue;
      if (frame < i.frame || frame > i.frame + dur) continue;
      const fraction = (frame - i.frame) / dur;
      const graphic = type === 2 ? bgGraphic : foGraphic;
      const colorPlane = type === 2 ? bgColor : foColor;
      const old = (type === 2 ? oldbg : oldfo) as [number, number, number, Color];
      const c = old[3] ?? new Color(0, 0, 0, 0);
      const cr = i.colorRed != null ? c.red + (i.colorRed - c.red) * fraction : c.red;
      const cg = i.colorGreen != null ? c.green + (i.colorGreen - c.green) * fraction : c.green;
      const cb = i.colorBlue != null ? c.blue + (i.colorBlue - c.blue) * fraction : c.blue;
      const ca = i.colorAlpha != null ? c.alpha + (i.colorAlpha - c.alpha) * fraction : c.alpha;
      if (graphic.bitmap == null) {
        if (i.opacity != null) colorPlane.opacity = old[2] + (i.opacity - old[2]) * fraction;
        colorPlane.color = new Color(cr, cg, cb, ca);
      } else {
        if (i.bgX != null) graphic.ox = old[0] - (i.bgX - old[0]) * fraction;
        if (i.bgY != null) graphic.oy = old[1] - (i.bgY - old[1]) * fraction;
        if (i.opacity != null) graphic.opacity = old[2] + (i.opacity - old[2]) * fraction;
        graphic.color = new Color(cr, cg, cb, ca);
      }
    }
  }
}

/** PBAnimations: the list of all animations (the game's PkmnAnimations.rxdata). */
export class PBAnimations {
  constructor(readonly array: (PBAnimation | null)[]) {}
  get length(): number { return this.array.length; }
  get(i: number): PBAnimation | null { return this.array[i] ?? null; }
  getFromName(name: string): PBAnimation | null {
    for (const i of this.array) if (i?.name === name) return i;
    return null;
  }
}

/** move2anim: [{move => index} ("Move:" animations), {move => index} ("OppMove:")]. */
export type MoveToAnim = [Record<Id, number>, Record<Id, number>];

let loading: Promise<void> | null = null;
let animations: PBAnimations | null = null;
let moveToAnim: MoveToAnim = [{}, {}];

/** Fetches pkmn-animations.json (once). The battle scene awaits this when it starts. */
export function preloadBattleAnimations(): Promise<void> {
  loading ??= fetch("/data/pkmn-animations.json")
    .then((r) => r.json() as Promise<{ move2anim: MoveToAnim; animations: (PBAnimationData | null)[] }>)
    .then((data) => {
      animations = new PBAnimations(data.animations.map((a) => (a ? new PBAnimation(a) : null)));
      moveToAnim = data.move2anim;
    })
    .catch((e) => {
      console.warn("Couldn't load pkmn-animations.json", e);
    });
  return loading;
}

/** pbLoadBattleAnimations (null until preloadBattleAnimations has finished). */
export function pbLoadBattleAnimations(): PBAnimations | null {
  if (!animations) void preloadBattleAnimations();
  return animations;
}

/** pbLoadMoveToAnim */
export function pbLoadMoveToAnim(): MoveToAnim {
  return moveToAnim;
}

//===============================================================================
//
//===============================================================================
export function pbSpriteSetAnimFrame(sprite: AnySprite | null, frame: Cel | null, user: AnySprite | null = null,
  target: AnySprite | null = null, inEditor = false): void {
  if (!sprite) return;
  if (!frame) {
    sprite.visible = false;
    sprite.srcRect.set(0, 0, 1, 1);
    return;
  }
  const f = (i: number) => frame[i] as number;
  sprite.blendType = f(AnimFrame.BLENDTYPE);
  sprite.angle = f(AnimFrame.ANGLE);
  sprite.mirror = f(AnimFrame.MIRROR) > 0;
  sprite.opacity = f(AnimFrame.OPACITY);
  sprite.visible = true;
  // NOTE: `!frame[VISIBLE] == 1` is always false in Ruby, so this is the only branch.
  void inEditor;
  sprite.visible = f(AnimFrame.VISIBLE) === 1;
  const pattern = f(AnimFrame.PATTERN);
  if (pattern >= 0) {
    const animwidth = 192;
    sprite.srcRect.set((pattern % 5) * animwidth, Math.floor(pattern / 5) * animwidth, animwidth, animwidth);
  } else {
    sprite.srcRect.set(0, 0, sprite.bitmap ? sprite.bitmap.width : 128, sprite.bitmap ? sprite.bitmap.height : 128);
  }
  sprite.zoomX = f(AnimFrame.ZOOMX) / 100.0;
  sprite.zoomY = f(AnimFrame.ZOOMY) / 100.0;
  sprite.color.set(f(AnimFrame.COLORRED), f(AnimFrame.COLORGREEN), f(AnimFrame.COLORBLUE), f(AnimFrame.COLORALPHA));
  sprite.tone.set(f(AnimFrame.TONERED), f(AnimFrame.TONEGREEN), f(AnimFrame.TONEBLUE), f(AnimFrame.TONEGRAY));
  sprite.ox = Math.floor(sprite.srcRect.width / 2);
  sprite.oy = Math.floor(sprite.srcRect.height / 2);
  sprite.x = f(AnimFrame.X);
  sprite.y = f(AnimFrame.Y);
  if (sprite !== user && sprite !== target) {
    switch (f(AnimFrame.PRIORITY)) {
      case 0: // Behind everything
        sprite.z = 10;
        break;
      case 1: // In front of everything
        sprite.z = 80;
        break;
      case 2: // Just behind focus
        switch (f(AnimFrame.FOCUS)) {
          case 1: sprite.z = target ? target.z - 1 : 20; break; // Focused on target
          case 2: sprite.z = user ? user.z - 1 : 20; break; // Focused on user
          default: sprite.z = 20; // Focused on user and target, or screen
        }
        break;
      case 3: // Just in front of focus
        switch (f(AnimFrame.FOCUS)) {
          case 1: sprite.z = target ? target.z + 1 : 80; break; // Focused on target
          case 2: sprite.z = user ? user.z + 1 : 80; break; // Focused on user
          default: sprite.z = 80; // Focused on user and target, or screen
        }
        break;
      default:
        sprite.z = 80;
    }
  }
}

//===============================================================================
// Animation player
//===============================================================================
/** What the player needs from the scene. */
export interface AnimationScene {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: Record<string, any>;
  viewport: Viewport;
}

export class PBAnimationPlayerX {
  static readonly MAX_SPRITES = 60;
  looping = false;
  private animation: PBAnimation;
  private user: SceneBattler | null; // Just used for playing user's cry
  private usersprite: AnySprite | null;
  private targetsprite: AnySprite | null;
  private userbitmap: Bitmap | null; // not to be disposed
  private targetbitmap: Bitmap | null; // not to be disposed
  private viewport: Viewport | null;
  private inEditor: boolean;
  private animbitmap: Bitmap | null = null; // Animation sheet graphic
  private frame = -1;
  private framesPerTick = Math.max(Math.floor(FRAME_RATE / 20), 1); // 20 ticks per second
  private srcLine: number[] | null = null;
  private dstLine: number[] | null = null;
  private userOrig: [number, number];
  private targetOrig: [number, number];
  private oldbg: OldBg = [];
  private oldfo: OldBg = [];
  private animsprites: (AnySprite | null)[] = [];
  private bgColor!: ColoredPlane;
  private bgGraphic!: AnimatedPlane;
  private foColor!: ColoredPlane;
  private foGraphic!: AnimatedPlane;

  /** The animation's graphics must be preloaded (animation.graphics()). */
  constructor(animation: PBAnimation, user: SceneBattler | null, target: SceneBattler | null, scene: AnimationScene | null = null,
    oppMove = false, inEditor = false) {
    this.animation = animation;
    this.user = oppMove ? target : user; // Just used for playing user's cry
    this.usersprite = user ? scene!.sprites[`pokemon_${user.index}`] : null;
    this.targetsprite = target ? scene!.sprites[`pokemon_${target.index}`] : null;
    this.userbitmap = this.usersprite?.bitmap ?? null;
    this.targetbitmap = this.targetsprite?.bitmap ?? null;
    this.viewport = scene?.viewport ?? null;
    this.inEditor = inEditor;
    this.userOrig = getSpriteCenter(this.usersprite);
    this.targetOrig = getSpriteCenter(this.targetsprite);
    this.initializeSprites();
  }

  initializeSprites(): void {
    // Create animation sprites (0=user's sprite, 1=target's sprite)
    this.animsprites = [];
    this.animsprites[0] = this.usersprite;
    this.animsprites[1] = this.targetsprite;
    for (let i = 2; i < PBAnimationPlayerX.MAX_SPRITES; i++) {
      const s = new Sprite(this.viewport);
      s.setBitmap(null);
      s.visible = false;
      this.animsprites[i] = s;
    }
    // Create background colour sprite
    this.bgColor = new ColoredPlane(new Color(0, 0, 0), this.viewport);
    this.bgColor.z = 5;
    this.bgColor.opacity = 0;
    // Create background graphic sprite
    this.bgGraphic = new AnimatedPlane(this.viewport);
    this.bgGraphic.setBitmap(null);
    this.bgGraphic.z = 5;
    this.bgGraphic.opacity = 0;
    // Create foreground colour sprite
    this.foColor = new ColoredPlane(new Color(0, 0, 0), this.viewport);
    this.foColor.z = 85;
    this.foColor.opacity = 0;
    // Create foreground graphic sprite
    this.foGraphic = new AnimatedPlane(this.viewport);
    this.foGraphic.setBitmap(null);
    this.foGraphic.z = 85;
    this.foGraphic.opacity = 0;
  }

  dispose(): void {
    // @animbitmap is the cached sheet (AnimatedBitmap#deanimate); the cache keeps it.
    this.animbitmap = null;
    for (let i = 2; i < PBAnimationPlayerX.MAX_SPRITES; i++) this.animsprites[i]?.dispose();
    this.bgGraphic.dispose();
    this.bgColor.dispose();
    this.foGraphic.dispose();
    this.foColor.dispose();
  }

  /**
   * Makes the original user and target sprites be uninvolved with the animation.
   * The animation shows just its particles.
   */
  discardUserAndTargetSprites(): void {
    this.animsprites[0] = null;
    this.animsprites[1] = null;
  }

  setTargetOrigin(x: number, y: number): void {
    this.targetOrig = [x, y];
  }

  start(): void {
    this.frame = 0;
  }

  animDone(): boolean {
    return this.frame < 0;
  }

  setLineTransform(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): void {
    this.srcLine = [x1, y1, x2, y2];
    this.dstLine = [x3, y3, x4, y4];
  }

  update(): void {
    if (this.frame < 0) return;
    let animFrame = Math.floor(this.frame / this.framesPerTick);
    // Loop or end the animation if the animation has reached the end
    if (animFrame >= this.animation.length) {
      this.frame = this.looping ? 0 : -1;
      if (this.frame < 0) {
        this.animbitmap = null;
        return;
      }
      animFrame = 0;
    }
    // Load the animation's spritesheet and assign it to all the sprites.
    if (!this.animbitmap || this.animbitmap.isDisposed()) {
      this.animbitmap = new AnimatedBitmap("Graphics/Animations/" + this.animation.graphic, this.animation.hue).deanimate();
      for (let i = 0; i < PBAnimationPlayerX.MAX_SPRITES; i++) {
        const s = this.animsprites[i];
        if (s) assignBitmap(s, this.animbitmap);
      }
    }
    // Update background and foreground graphics
    this.bgGraphic.update();
    this.bgColor.update();
    this.foGraphic.update();
    this.foColor.update();
    // Update all the sprites to depict the animation's next frame
    if (this.framesPerTick === 1 || this.frame % this.framesPerTick === 0) {
      const thisframe = this.animation.frame(animFrame);
      // Make all cel sprites invisible
      for (let i = 0; i < PBAnimationPlayerX.MAX_SPRITES; i++) {
        const s = this.animsprites[i];
        if (s) s.visible = false;
      }
      // Set each cel sprite acoordingly
      for (let i = 0; i < thisframe.length; i++) {
        const cel = thisframe[i];
        if (!cel) continue;
        const sprite = this.animsprites[i];
        if (!sprite) continue;
        // Set cel sprite's graphic
        switch (cel[AnimFrame.PATTERN]) {
          case -1: assignBitmap(sprite, this.userbitmap); break;
          case -2: assignBitmap(sprite, this.targetbitmap); break;
          default: assignBitmap(sprite, this.animbitmap);
        }
        // Apply settings to the cel sprite
        pbSpriteSetAnimFrame(sprite, cel, this.usersprite, this.targetsprite);
        const cx = cel[AnimFrame.X] as number;
        const cy = cel[AnimFrame.Y] as number;
        switch (cel[AnimFrame.FOCUS]) {
          case 1: // Focused on target
            sprite.x = Math.trunc(cx + this.targetOrig[0] - FOCUSTARGET_X); // Sprite#x= stores an int
            sprite.y = Math.trunc(cy + this.targetOrig[1] - FOCUSTARGET_Y);
            break;
          case 2: // Focused on user
            sprite.x = Math.trunc(cx + this.userOrig[0] - FOCUSUSER_X);
            sprite.y = Math.trunc(cy + this.userOrig[1] - FOCUSUSER_Y);
            break;
          case 3: { // Focused on user and target
            if (!this.srcLine || !this.dstLine) continue;
            const point = transformPoint(this.srcLine[0]!, this.srcLine[1]!, this.srcLine[2]!, this.srcLine[3]!,
              this.dstLine[0]!, this.dstLine[1]!, this.dstLine[2]!, this.dstLine[3]!,
              sprite.x, sprite.y);
            sprite.x = Math.trunc(point[0]);
            sprite.y = Math.trunc(point[1]);
            if (isReversed(this.srcLine[0]!, this.srcLine[2]!, this.dstLine[0]!, this.dstLine[2]!) &&
                (cel[AnimFrame.PATTERN] as number) >= 0) {
              // Reverse direction
              sprite.mirror = !sprite.mirror;
            }
            break;
          }
        }
        if (this.inEditor) sprite.x += 64;
        if (this.inEditor) sprite.y += 64;
      }
      // Play timings
      this.animation.playTiming(animFrame, this.bgGraphic, this.bgColor, this.foGraphic, this.foColor, this.oldbg, this.oldfo, this.user);
    }
    this.frame += 1;
  }
}

/** Fetches an animation's graphics before it plays. */
export async function preloadAnimationGraphics(animation: PBAnimation | null | undefined): Promise<void> {
  if (animation) await preloadBitmaps(animation.graphics());
}
