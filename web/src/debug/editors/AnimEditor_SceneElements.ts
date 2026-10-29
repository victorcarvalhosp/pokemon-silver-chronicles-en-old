// Port of Data/Scripts/020_Debug/002_Animation editor/001_AnimEditor_SceneElements.rb:
// the battle animation editor's pop-up menu (Window_Menu, pbTrackPopupMenu),
// clipboard, sprite hit testing, the animation sheet strip
// (AnimationWindow), the cel frames (SpriteFrame), the canvas the cels are
// edited on (AnimationCanvas) and two small windows.
//
// Graphics: the browser can't load a bitmap synchronously, so everything the
// editor shows is fetched first (preloadAnimEditorGraphics, loadAnimation and
// the graphic pickers await it). The bitmaps AnimatedBitmap#deanimate hands
// out are the shared cached ones (ui/rpgCache.ts); Ruby disposes its copies,
// here they are left alone.

import {
  AnimFrame, FOCUSTARGET_X, FOCUSTARGET_Y, FOCUSUSER_X, FOCUSUSER_Y, PBAnimation, PBAnimationPlayerX, pbCreateCel,
  pbResetCel, pbSpriteSetAnimFrame, preloadAnimationGraphics, type AnimationScene, type Cel,
} from "../../battle/scene/animationPlayer";
import type { SceneBattler } from "../../battle/scene/types";
import { getMousePos } from "../../plugins/easyMouse/Mouse";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { _INTL } from "../../ui/messageConfig";
import { pbResolveBitmap, preloadBitmap, preloadBitmaps } from "../../ui/rpgCache";
import { KeyboardInput } from "../../ui/textEntry/keyboard";
import { SpriteWindow_Base } from "../../ui/windows/SpriteWindow";
import { Window_CommandPokemon, Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { rectContains } from "./AnimEditor_ControlsButtons";
import { deepClone, rAdd, rMod, rSub } from "./AnimEditor_Data";

/** Input.update as the editor's loops call it: the RGSS buttons, the mouse and the raw keys (triggerex?). */
export function editorInputUpdate(): void {
  Input.update();
  KeyboardInput.update();
}

/** The graphics the editor's scene elements use (Graphics/Pictures). */
export const ANIM_EDITOR_GRAPHICS = [
  "Graphics/Pictures/arrows", "Graphics/Pictures/animFrameIcon", "Graphics/Pictures/testback",
  "Graphics/Pictures/testfront", "Graphics/Pictures/testscreen",
];

export function preloadAnimEditorGraphics(): Promise<void> {
  return preloadBitmaps(ANIM_EDITOR_GRAPHICS);
}

/**
 * AnimatedBitmap.new("Graphics/Animations/" + name, hue).deanimate, fetching
 * the file first; null where Ruby's load raises (no such file).
 */
export async function loadAnimationBitmap(name: string, hue = 0): Promise<Bitmap | null> {
  const path = "Graphics/Animations/" + name;
  await preloadBitmap(path);
  if (!pbResolveBitmap(path)) return null;
  return new AnimatedBitmap(path, hue).deanimate();
}

//===============================================================================
// Controls
//===============================================================================
export class Window_Menu extends Window_CommandPokemon {
  constructor(commands: string[], x: number, y: number) {
    // (Ruby measures before super and passes w to it; the size is set below anyway.)
    super(commands, null);
    const tempbitmap = new Bitmap(32, 32);
    let w = 0;
    for (const i of commands) {
      const width = tempbitmap.textSize(i).width;
      if (w < width) w = width;
    }
    w += 16 + this.borderX;
    let h = Math.min(commands.length * 32, 480);
    h += this.borderY;
    const right = Math.min(x + w, 640);
    const bottom = Math.min(y + h, 480);
    const left = right - w;
    const top = bottom - h;
    this.x = left;
    this.y = top;
    this.width = w;
    this.height = h;
    tempbitmap.dispose();
  }

  hittest(): number {
    const mousepos = getMousePos();
    if (!mousepos) return -1;
    const toprow = this.topRow;
    for (let i = toprow; i < toprow + this.itemCount(); i++) {
      const rc = new Rect(0, 32 * (i - toprow), this.contents!.width, 32);
      rc.x += this.x + this.leftEdge;
      rc.y += this.y + this.topEdge;
      if (rectContains(rc, mousepos[0], mousepos[1])) return i;
    }
    return -1;
  }
}

//===============================================================================
// Clipboard
//===============================================================================
/** Clipboard: Ruby keeps a Marshal dump; here a deep copy (the same on the way out). */
export const Clipboard = {
  _data: null as unknown,
  _typekey: "",

  get data(): unknown {
    if (this._data == null) return null;
    return deepClone(this._data);
  },

  get typekey(): string {
    return this._typekey;
  },

  setData(data: unknown, key: string): void {
    this._data = deepClone(data);
    this._typekey = key;
  },
};

//===============================================================================
// Collision testing
//===============================================================================
export function pbSpriteHitTest(sprite: Sprite | null, x: number, y: number, usealpha = true, wholecanvas = false): boolean {
  if (!sprite || sprite.isDisposed()) return false;
  if (!sprite.bitmap) return false;
  if (!sprite.visible) return false;
  if (sprite.bitmap.isDisposed()) return false;
  let width = sprite.srcRect.width;
  let height = sprite.srcRect.height;
  let xwidth: number;
  let xheight: number;
  if (wholecanvas) {
    xwidth = 0;
    xheight = 0;
  } else {
    xwidth = width - 64;
    xheight = height - 64;
    if (width > 64 && !usealpha) width = 64;
    if (height > 64 && !usealpha) height = 64;
  }
  if (width > sprite.bitmap.width) width = sprite.bitmap.width;
  if (height > sprite.bitmap.height) height = sprite.bitmap.height;
  let spritex: number;
  let spritey: number;
  if (usealpha) {
    spritex = sprite.x - (sprite.ox * sprite.zoomX);
    spritey = sprite.y - (sprite.oy * sprite.zoomY);
    width *= sprite.zoomX;
    height *= sprite.zoomY;
  } else {
    spritex = sprite.x - sprite.ox;
    spritey = sprite.y - sprite.oy;
    spritex += Math.floor(xwidth / 2);
    spritey += Math.floor(xheight / 2);
  }
  if (!(x >= spritex && x <= spritex + width && y >= spritey && y <= spritey + height)) {
    return false;
  }
  if (usealpha) {
    // TODO: This should account for sprite.angle as well
    let bitmapX = sprite.srcRect.x;
    let bitmapY = sprite.srcRect.y;
    bitmapX += sprite.ox;
    bitmapY += sprite.oy;
    if (sprite.zoomX > 0) bitmapX += (x - sprite.x) / sprite.zoomX;
    if (sprite.zoomY > 0) bitmapY += (y - sprite.y) / sprite.zoomY;
    bitmapX = Math.round(bitmapX);
    bitmapY = Math.round(bitmapY);
    if (sprite.mirror) {
      const xmirror = bitmapX - sprite.srcRect.x;
      bitmapX = sprite.srcRect.x + 192 - xmirror;
    }
    const color = sprite.bitmap.getPixel(bitmapX, bitmapY);
    if (color.alpha === 0) return false;
  }
  return true;
}

export async function pbTrackPopupMenu(commands: string[]): Promise<number> {
  const mousepos = getMousePos();
  if (!mousepos) return -1;
  const menuwindow = new Window_Menu(commands, mousepos[0], mousepos[1]);
  menuwindow.z = 99999;
  for (;;) {
    await Graphics.update();
    editorInputUpdate();
    menuwindow.update();
    let hit = menuwindow.hittest();
    if (hit >= 0) menuwindow.index = hit;
    if (Input.trigger(Input.MOUSELEFT) || Input.trigger(Input.MOUSERIGHT)) { // Left or right button
      menuwindow.dispose();
      return hit;
    }
    if (Input.trigger(Input.USE)) {
      hit = menuwindow.index;
      menuwindow.dispose();
      return hit;
    }
    if (Input.trigger(Input.BACK)) { // Escape
      break;
    }
  }
  menuwindow.dispose();
  return -1;
}

//===============================================================================
// Sprite sheet scrolling bar
//===============================================================================
export class AnimationWindow extends Sprite {
  static readonly NUMFRAMES = 5;

  protected _animbitmap: Bitmap | null = null;
  private arrows: AnimatedBitmap;
  private _start = 0;
  private _selected = 0;
  private contents: Bitmap;
  private _changed = false;

  constructor(x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    super(viewport);
    this.arrows = new AnimatedBitmap("Graphics/Pictures/arrows");
    this.x = x;
    this.y = y;
    this.contents = new Bitmap(width, height);
    this.setBitmap(this.contents);
    this.refresh();
  }

  get animbitmap(): Bitmap | null { return this._animbitmap; }
  set animbitmap(val: Bitmap | null) {
    this._animbitmap = val;
    this._start = 0;
    this.refresh();
  }

  get start(): number { return this._start; }

  get selected(): number { return this._selected; }
  set selected(val: number) {
    this._selected = val;
    this.refresh();
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.contents.dispose();
    this.arrows.dispose();
    this._start = 0;
    this._selected = 0;
    this._changed = false;
    super.dispose();
  }

  drawrect(bm: Bitmap, x: number, y: number, width: number, height: number, color: Color): void {
    bm.fillRect(x, y, width, 1, color);
    bm.fillRect(x, y + height - 1, width, 1, color);
    bm.fillRect(x, y, 1, height, color);
    bm.fillRect(x + width - 1, y, 1, height, color);
  }

  drawborder(bm: Bitmap, x: number, y: number, width: number, height: number, color: Color): void {
    bm.fillRect(x, y, width, 2, color);
    bm.fillRect(x, y + height - 2, width, 2, color);
    bm.fillRect(x, y, 2, height, color);
    bm.fillRect(x + width - 2, y, 2, height, color);
  }

  refresh(): void {
    const NUMFRAMES = AnimationWindow.NUMFRAMES;
    const arrowwidth = Math.floor(this.arrows.bitmap.width / 2);
    this.contents.clear();
    this.contents.fillRect(0, 0, this.contents.width, this.contents.height, new Color(180, 180, 180));
    this.contents.blt(0, 0, this.arrows.bitmap, new Rect(0, 0, arrowwidth, 96));
    this.contents.blt(arrowwidth + (NUMFRAMES * 96), 0, this.arrows.bitmap,
      new Rect(arrowwidth, 0, arrowwidth, 96));
    const animbitmap = this.animbitmap;
    const havebitmap = !!(animbitmap && !animbitmap.isDisposed());
    if (havebitmap) {
      const rect = new Rect(0, 0, 0, 0);
      const rectdst = new Rect(0, 0, 0, 0);
      let x = arrowwidth;
      for (let i = 0; i < NUMFRAMES; i++) {
        const j = i + this._start;
        rect.set((j % 5) * 192, Math.floor(j / 5) * 192, 192, 192);
        rectdst.set(x, 0, 96, 96);
        this.contents.stretchBlt(rectdst, animbitmap!, rect);
        x += 96;
      }
    }
    for (let i = 0; i < NUMFRAMES; i++) {
      this.drawrect(this.contents, arrowwidth + (i * 96), 0, 96, 96, new Color(100, 100, 100));
      if (this._start + i === this._selected && havebitmap) {
        this.drawborder(this.contents, arrowwidth + (i * 96), 0, 96, 96, new Color(255, 0, 0));
      }
    }
  }

  /** changed? */
  isChanged(): boolean {
    return this._changed;
  }

  override update(): void {
    const NUMFRAMES = AnimationWindow.NUMFRAMES;
    const mousepos = getMousePos();
    this._changed = false;
    if (!Input.repeat(Input.MOUSELEFT)) return;
    if (!mousepos) return;
    if (!this.animbitmap) return;
    const arrowwidth = Math.floor(this.arrows.bitmap.width / 2);
    const maxindex = Math.floor(this.animbitmap.height / 192) * 5;
    const left = new Rect(0, 0, arrowwidth, 96);
    const right = new Rect(arrowwidth + (NUMFRAMES * 96), 0, arrowwidth, 96);
    left.x += this.x;
    left.y += this.y;
    right.x += this.x;
    right.y += this.y;
    const swatchrects: Rect[] = [];
    const repeattime = Math.floor(Input.time(Input.MOUSELEFT) / 1000);
    for (let i = 0; i < NUMFRAMES; i++) {
      swatchrects.push(new Rect(arrowwidth + (i * 96) + this.x, this.y, 96, 96));
    }
    for (let i = 0; i < NUMFRAMES; i++) {
      if (!rectContains(swatchrects[i]!, mousepos[0], mousepos[1])) continue;
      this._selected = this._start + i;
      this._changed = true;
      this.refresh();
      return;
    }
    // Left arrow
    if (rectContains(left, mousepos[0], mousepos[1])) {
      if (repeattime > 750) {
        this._start -= 3;
      } else {
        this._start -= 1;
      }
      if (this._start < 0) this._start = 0;
      this.refresh();
    }
    // Right arrow
    if (rectContains(right, mousepos[0], mousepos[1])) {
      if (repeattime > 750) {
        this._start += 3;
      } else {
        this._start += 1;
      }
      if (this._start >= maxindex) this._start = maxindex;
      this.refresh();
    }
  }
}

export class CanvasAnimationWindow extends AnimationWindow {
  private canvas!: AnimationCanvas;

  override get animbitmap(): Bitmap | null {
    // (@canvas is set before super in Ruby; refresh runs during super here.)
    return this.canvas ? this.canvas.animbitmap : null;
  }
  override set animbitmap(val: Bitmap | null) { super.animbitmap = val; }

  constructor(canvas: AnimationCanvas, x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    super(x, y, width, height, viewport);
    this.canvas = canvas;
    this.refresh();
  }
}

//===============================================================================
// Cel sprite
//===============================================================================
export class InvalidatableSprite extends Sprite {
  private _invalid = false;

  /** Marks that the control must be redrawn to reflect current logic. */
  invalidate(): void {
    this._invalid = true;
  }

  /** Determines whether the control is invalid */
  invalid(): boolean {
    return this._invalid;
  }

  /** Marks that the control is valid.  Normally called only by repaint. */
  validate(): void {
    this._invalid = false;
  }

  /** Redraws the sprite only if it is invalid, and then revalidates the sprite */
  repaint(): void {
    if (this.invalid()) {
      this.refresh();
      this.validate();
    }
  }

  /**
   * Redraws the sprite.  This method should not check whether
   * the sprite is invalid, to allow it to be explicitly called.
   */
  refresh(): void {}
}

export class SpriteFrame extends InvalidatableSprite {
  /** 10 frame number icons in each row */
  static readonly NUM_ROWS = Math.ceil(PBAnimation.MAX_SPRITES / 10);

  readonly id: number;
  private _locked = false;
  private _selected = false;
  private _sprite: Sprite | null;
  private previous: boolean;
  private selcolor = new Color(0, 0, 0);
  private unselcolor = new Color(220, 220, 220);
  private prevcolor = new Color(64, 128, 192);
  private contents: Bitmap;
  private iconbitmap: AnimatedBitmap;

  constructor(id: number, sprite: Sprite | null, viewport: Viewport | null, previous = false) {
    super(viewport);
    this.id = id;
    this._sprite = sprite;
    this.previous = previous;
    this.contents = new Bitmap(64, 64);
    this.z = this.previous ? 49 : 50;
    this.iconbitmap = new AnimatedBitmap("Graphics/Pictures/animFrameIcon");
    this.setBitmap(this.contents);
    this.invalidate();
  }

  get locked(): boolean { return this._locked; }
  set locked(value: boolean) {
    this._locked = value;
    this.invalidate();
  }

  get selected(): boolean { return this._selected; }
  set selected(value: boolean) {
    this._selected = value;
    this.invalidate();
  }

  get sprite(): Sprite | null { return this._sprite; }
  set sprite(value: Sprite | null) {
    this._sprite = value;
    this.invalidate();
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    this.contents.dispose();
    super.dispose();
  }

  override refresh(): void {
    const NUM_ROWS = SpriteFrame.NUM_ROWS;
    this.contents.clear();
    this.z = this.previous ? 49 : this._selected ? 51 : 50;
    // Draw frame
    const color = this.previous ? this.prevcolor : this._selected ? this.selcolor : this.unselcolor;
    this.contents.fillRect(0, 0, 64, 1, color);
    this.contents.fillRect(0, 63, 64, 1, color);
    this.contents.fillRect(0, 0, 1, 64, color);
    this.contents.fillRect(63, 0, 1, 64, color);
    // Determine frame number graphic to use from @iconbitmap
    const yoffset = this.previous ? (NUM_ROWS + 1) * 16 : 0; // 1 is for padlock icon
    let bmrect = new Rect((this.id % 10) * 16, yoffset + (Math.floor(this.id / 10) * 16), 16, 16);
    this.contents.blt(0, 0, this.iconbitmap.bitmap, bmrect);
    // Draw padlock if frame is locked
    if (this._locked && !this.previous) {
      bmrect = new Rect(0, NUM_ROWS * 16, 16, 16);
      this.contents.blt(16, 0, this.iconbitmap.bitmap, bmrect);
    }
  }
}

//===============================================================================
// Canvas
//===============================================================================
/** MiniBattler / MiniBattle (005_AnimEditor_Functions.rb): the battlers PBAnimationPlayerX plays for. */
export class MiniBattler {
  index: number;
  pokemon: null = null;
  constructor(index: number) { this.index = index; }
}

export class MiniBattle {
  battlers: MiniBattler[] = [];
  constructor() {
    for (let i = 0; i < 4; i++) this.battlers[i] = new MiniBattler(i);
  }
}

/** pbCellProperties (005_AnimEditor_Functions.rb), which the canvas opens with P; set by that file. */
export const AnimCanvasHooks: { pbCellProperties: ((canvas: AnimationCanvas) => Promise<void>) | null } = {
  pbCellProperties: null,
};

export class AnimationCanvas extends Sprite {
  static readonly BORDERSIZE = 64;

  readonly sprites: Record<string, Sprite> = {};
  private _currentframe = 0; // Currently active frame
  private _currentcel = -1;
  private _animation!: PBAnimation; // Currently selected animation
  private _animbitmap: Bitmap | null = null; // Currently selected animation bitmap
  /** @pattern, the currently selected pattern (Sprite#pattern is mkxp-z's, so it's renamed here). */
  selectedPattern = 0;
  private celsprites: Sprite[] = [];
  private framesprites: SpriteFrame[] = [];
  private lastframesprites: SpriteFrame[] = [];
  private dirty: boolean[] = [];
  private selecting = false;
  private selectOffsetX: number | unknown = 0;
  private selectOffsetY: number | unknown = 0;
  private playing = false;
  private player: PBAnimationPlayerX | null = null;
  private battle = new MiniBattle();
  private user: Bitmap;
  private target: Bitmap;
  private testscreen: AnimatedBitmap;

  /** The editor graphics must be preloaded (preloadAnimEditorGraphics); call loadAnimation next. */
  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.user = new AnimatedBitmap("Graphics/Pictures/testback").deanimate();
    this.target = new AnimatedBitmap("Graphics/Pictures/testfront").deanimate();
    this.testscreen = new AnimatedBitmap("Graphics/Pictures/testscreen");
    this.setBitmap(this.testscreen.bitmap);
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      this.lastframesprites[i] = new SpriteFrame(i, this.celsprites[i] ?? null, viewport, true);
      this.lastframesprites[i]!.selected = false;
      this.lastframesprites[i]!.visible = false;
    }
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      this.celsprites[i] = new Sprite(viewport);
      this.celsprites[i]!.visible = false;
      this.celsprites[i]!.srcRect = new Rect(0, 0, 0, 0);
      this.celsprites[i]!.bitmap = null;
      this.framesprites[i] = new SpriteFrame(i, this.celsprites[i]!, viewport);
      this.framesprites[i]!.selected = false;
      this.framesprites[i]!.visible = false;
      this.dirty[i] = true;
    }
  }

  /** AnimationCanvas.new(animation, viewport) */
  static async create(animation: PBAnimation, viewport: Viewport | null = null): Promise<AnimationCanvas> {
    await preloadAnimEditorGraphics();
    const canvas = new AnimationCanvas(viewport);
    await canvas.loadAnimation(animation);
    return canvas;
  }

  get currentframe(): number { return this._currentframe; }
  set currentframe(value: number) {
    this._currentframe = value;
    this.invalidate();
  }

  get currentcel(): number { return this._currentcel; }
  get animation(): PBAnimation { return this._animation; }

  async loadAnimation(anim: PBAnimation): Promise<void> {
    this._animation = anim;
    // (@animbitmap&.dispose: the cached bitmap isn't disposed)
    if (this._animation.graphic === "") {
      this._animbitmap = null;
    } else {
      try {
        this._animbitmap = await loadAnimationBitmap(this._animation.graphic, this._animation.hue);
      } catch {
        this._animbitmap = null;
      }
    }
    this._currentcel = -1;
    this.currentframe = 0;
    this.selecting = false;
    this.selectedPattern = 0;
    this.invalidate();
  }

  get animbitmap(): Bitmap | null { return this._animbitmap; }
  set animbitmap(value: Bitmap | null) {
    this._animbitmap = value;
    for (let i = 2; i < PBAnimation.MAX_SPRITES; i++) {
      if (this.celsprites[i]) this.celsprites[i]!.setBitmap(this._animbitmap);
    }
    this.invalidate();
  }

  override dispose(): void {
    if (this.isDisposed()) return;
    // (@user, @target, @animbitmap and self.bitmap are cached bitmaps: not disposed)
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) this.celsprites[i]?.dispose();
    // (Ruby leaves the frame sprites to the viewport's disposal)
    for (const s of [...this.framesprites, ...this.lastframesprites]) s.dispose();
    super.dispose();
  }

  async play(oppmove = false): Promise<void> {
    if (this.playing) return;
    const BORDERSIZE = AnimationCanvas.BORDERSIZE;
    await preloadAnimationGraphics(this._animation);
    this.sprites["pokemon_0"] = new Sprite(this.viewport);
    this.sprites["pokemon_0"].setBitmap(this.user);
    this.sprites["pokemon_0"].z = 21;
    this.sprites["pokemon_1"] = new Sprite(this.viewport);
    this.sprites["pokemon_1"].setBitmap(this.target);
    this.sprites["pokemon_1"].z = 16;
    pbSpriteSetAnimFrame(this.sprites["pokemon_0"],
      pbCreateCel(FOCUSUSER_X, FOCUSUSER_Y, -1, 2),
      this.sprites["pokemon_0"], this.sprites["pokemon_1"]);
    pbSpriteSetAnimFrame(this.sprites["pokemon_1"],
      pbCreateCel(FOCUSTARGET_X, FOCUSTARGET_Y, -2, 1),
      this.sprites["pokemon_0"], this.sprites["pokemon_1"]);
    const usersprite = this.sprites[`pokemon_${oppmove ? 1 : 0}`];
    const targetsprite = this.sprites[`pokemon_${oppmove ? 0 : 1}`];
    const olduserx = usersprite ? usersprite.x : 0;
    const oldusery = usersprite ? usersprite.y : 0;
    const oldtargetx = targetsprite ? targetsprite.x : 0;
    const oldtargety = targetsprite ? targetsprite.y : 0;
    this.player = new PBAnimationPlayerX(this._animation,
      this.battle.battlers[oppmove ? 1 : 0] as unknown as SceneBattler,
      this.battle.battlers[oppmove ? 0 : 1] as unknown as SceneBattler,
      this as unknown as AnimationScene, oppmove, true);
    this.player.setLineTransform(
      FOCUSUSER_X, FOCUSUSER_Y,
      FOCUSTARGET_X, FOCUSTARGET_Y,
      olduserx, oldusery,
      oldtargetx, oldtargety,
    );
    this.player.start();
    this.playing = true;
    this.sprites["pokemon_0"].x += BORDERSIZE;
    this.sprites["pokemon_0"].y += BORDERSIZE;
    this.sprites["pokemon_1"].x += BORDERSIZE;
    this.sprites["pokemon_1"].y += BORDERSIZE;
    const oldstate: [boolean, boolean, boolean][] = [];
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      oldstate.push([this.celsprites[i]!.visible, this.framesprites[i]!.visible, this.lastframesprites[i]!.visible]);
      this.celsprites[i]!.visible = false;
      this.framesprites[i]!.visible = false;
      this.lastframesprites[i]!.visible = false;
    }
    for (;;) {
      await Graphics.update();
      await this.update();
      if (!this.playing) break;
    }
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      this.celsprites[i]!.visible = oldstate[i]![0];
      this.framesprites[i]!.visible = oldstate[i]![1];
      this.lastframesprites[i]!.visible = oldstate[i]![2];
    }
    this.sprites["pokemon_0"].dispose();
    this.sprites["pokemon_1"].dispose();
    this.player.dispose();
    this.player = null;
  }

  invalidate(): void {
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) this.invalidateCel(i);
  }

  invalidateCel(i: number): void {
    this.dirty[i] = true;
  }

  getCurrentFrame(): (Cel | null)[] | null {
    if (this._currentframe >= this._animation.length) return null;
    return this._animation.array[this._currentframe]!;
  }

  setFrame(i: number): void {
    if (this.celsprites[i]) {
      this.framesprites[i]!.ox = 32;
      this.framesprites[i]!.oy = 32;
      this.framesprites[i]!.selected = (i === this._currentcel);
      this.framesprites[i]!.locked = this.isLocked(i);
      this.framesprites[i]!.x = this.celsprites[i]!.x;
      this.framesprites[i]!.y = this.celsprites[i]!.y;
      this.framesprites[i]!.visible = this.celsprites[i]!.visible;
      this.framesprites[i]!.repaint();
    }
  }

  setPreviousFrame(i: number): void {
    if (this._currentframe > 0) {
      const cel = this._animation.array[this._currentframe - 1]![i];
      if (cel == null) {
        this.lastframesprites[i]!.visible = false;
      } else {
        this.lastframesprites[i]!.ox = 32;
        this.lastframesprites[i]!.oy = 32;
        this.lastframesprites[i]!.selected = false;
        this.lastframesprites[i]!.locked = false;
        this.lastframesprites[i]!.x = Math.trunc(Number(cel[AnimFrame.X]) + 64);
        this.lastframesprites[i]!.y = Math.trunc(Number(cel[AnimFrame.Y]) + 64);
        this.lastframesprites[i]!.visible = true;
        this.lastframesprites[i]!.repaint();
      }
    } else {
      this.lastframesprites[i]!.visible = false;
    }
  }

  offsetFrame(frame: number, ox: number, oy: number): void {
    if (frame >= 0 && frame < this._animation.length) {
      for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
        const cel = this._animation.array[frame]![i];
        if (!this.isLocked(i) && cel) {
          cel[AnimFrame.X] = rAdd(cel[AnimFrame.X], ox) as number;
          cel[AnimFrame.Y] = rAdd(cel[AnimFrame.Y], oy) as number;
        }
        if (frame === this._currentframe) this.dirty[i] = true;
      }
    }
  }

  /** Clears all items in the frame except locked items */
  clearFrame(frame: number): void {
    if (frame >= 0 && frame < this._animation.length) {
      for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
        if (this.isDeletable(i)) {
          this._animation.array[frame]![i] = null;
        } else {
          pbResetCel(this._animation.array[frame]![i]);
        }
        if (frame === this._currentframe) this.dirty[i] = true;
      }
    }
  }

  insertFrame(frame: number): void {
    if (frame >= this._animation.length) return;
    // NOTE (Ruby parity): Array#clone is shallow, so the new frame shares its
    // cels with the one it copies: editing a cel changes it in both frames
    // (001_AnimEditor_SceneElements.rb:663).
    this._animation.insert(frame, [...this._animation.array[frame]!]);
    this.invalidate();
  }

  copyFrame(src: number, dst: number): void {
    if (dst >= this._animation.length) return;
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      let clonedframe = this._animation.array[src]![i] ?? null;
      if (clonedframe) clonedframe = [...clonedframe];
      this._animation.array[dst]![i] = clonedframe;
    }
    if (dst === this._currentframe) this.invalidate();
  }

  pasteFrame(frame: number): void {
    if (frame < 0 || frame >= this._animation.length) return;
    if (Clipboard.typekey !== "PBAnimFrame") return;
    this._animation.array[frame] = Clipboard.data as (Cel | null)[];
    if (frame === this._currentframe) this.invalidate();
  }

  deleteFrame(frame: number): void {
    if (frame < 0 || frame >= this._animation.length || this._animation.length <= 1) return;
    if (frame === this._animation.length - 1) this.currentframe -= 1;
    this._animation.deleteAt(frame);
    this._currentcel = -1;
    this.invalidate();
  }

  /** This frame becomes a copy of the previous frame */
  pasteLast(): void {
    if (this._currentframe > 0) this.copyFrame(this._currentframe - 1, this._currentframe);
  }

  currentCel(): Cel | null {
    if (this._currentcel < 0) return null;
    if (this._currentframe >= this._animation.length) return null;
    return this._animation.array[this._currentframe]![this._currentcel] ?? null;
  }

  pasteCel(x: number, y: number): void {
    if (this._currentframe >= this._animation.length) return;
    if (Clipboard.typekey !== "PBAnimCel") return;
    const frame = this._animation.array[this._currentframe]!;
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      if (frame[i]) continue;
      frame[i] = Clipboard.data as Cel;
      const cel = frame[i]!;
      cel[AnimFrame.X] = x;
      cel[AnimFrame.Y] = y;
      cel[AnimFrame.LOCKED] = 0;
      if (cel[AnimFrame.PATTERN] === -1) this.celsprites[i]!.setBitmap(this.user);
      if (cel[AnimFrame.PATTERN] === -2) this.celsprites[i]!.setBitmap(this.target);
      this._currentcel = i;
      break;
    }
    this.invalidate();
  }

  deleteCel(cel: number): void {
    if (cel < 0) return;
    if (this._currentframe < 0 || this._currentframe >= this._animation.length) return;
    if (!this.isDeletable(cel)) return;
    this._animation.array[this._currentframe]![cel] = null;
    this.dirty[cel] = true;
  }

  swapCels(cel1: number, cel2: number): void {
    if (cel1 < 0 || cel2 < 0) return;
    if (this._currentframe < 0 || this._currentframe >= this._animation.length) return;
    const frame = this._animation.array[this._currentframe]!;
    const t = frame[cel1] ?? null;
    frame[cel1] = frame[cel2] ?? null;
    frame[cel2] = t;
    this._currentcel = cel2;
    this.dirty[cel1] = true;
    this.dirty[cel2] = true;
  }

  /** locked?(celindex) */
  isLocked(celindex: number): boolean {
    const frame = this._animation.array[this.currentframe];
    if (!frame) return false;
    const cel = frame[celindex];
    return cel ? (cel[AnimFrame.LOCKED] !== 0) : false;
  }

  /** deletable?(celindex) */
  isDeletable(celindex: number): boolean {
    const frame = this._animation.array[this.currentframe];
    if (!frame) return true;
    const cel = frame[celindex];
    if (!cel) return true;
    if (cel[AnimFrame.LOCKED] !== 0) return false;
    if ((cel[AnimFrame.PATTERN] as number) < 0) {
      let count = 0;
      const pattern = cel[AnimFrame.PATTERN];
      for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
        const othercel = frame[i];
        if (othercel && othercel[AnimFrame.PATTERN] === pattern) count += 1;
      }
      if (count <= 1) return false;
    }
    return true;
  }

  setBitmap_(i: number, frame: number): void {
    if (this.celsprites[i]) {
      const cel = this._animation.array[frame]![i];
      this.celsprites[i]!.setBitmap(this._animbitmap);
      if (cel) {
        if (cel[AnimFrame.PATTERN] === -1) this.celsprites[i]!.setBitmap(this.user);
        if (cel[AnimFrame.PATTERN] === -2) this.celsprites[i]!.setBitmap(this.target);
      }
    }
  }

  setSpriteBitmap(sprite: Sprite | null, cel: Cel | null): void {
    if (sprite && !sprite.isDisposed()) {
      sprite.setBitmap(this._animbitmap);
      if (cel) {
        if (cel[AnimFrame.PATTERN] === -1) sprite.setBitmap(this.user);
        if (cel[AnimFrame.PATTERN] === -2) sprite.setBitmap(this.target);
      }
    }
  }

  addSprite(x: number, y: number): boolean {
    if (this._currentframe >= this._animation.length) return false;
    const frame = this._animation.array[this._currentframe]!;
    for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
      if (frame[i]) continue;
      frame[i] = pbCreateCel(x, y, this.selectedPattern, this._animation.position);
      this.dirty[i] = true;
      this._currentcel = i;
      return true;
    }
    return false;
  }

  async updateInput(): Promise<void> {
    const BORDERSIZE = AnimationCanvas.BORDERSIZE;
    let cel = this.currentCel();
    const mousepos = getMousePos();
    if (Input.trigger(Input.MOUSELEFT) && mousepos &&
        pbSpriteHitTest(this, mousepos[0], mousepos[1], false, true)) {
      let selectedcel = -1;
      const usealpha = Input.press(Input.ALT);
      for (let j = 0; j < PBAnimation.MAX_SPRITES; j++) {
        if (pbSpriteHitTest(this.celsprites[j]!, mousepos[0], mousepos[1], usealpha, false)) {
          selectedcel = j;
        }
      }
      if (selectedcel < 0) {
        if (this._animbitmap && this.addSprite(mousepos[0] - BORDERSIZE, mousepos[1] - BORDERSIZE)) {
          if (!this.isLocked(this._currentcel)) this.selecting = true;
          this.selectOffsetX = 0;
          this.selectOffsetY = 0;
          cel = this.currentCel();
          this.invalidate();
        }
      } else {
        this._currentcel = selectedcel;
        if (!this.isLocked(this._currentcel)) this.selecting = true;
        cel = this.currentCel();
        this.selectOffsetX = rAdd(rSub(cel![AnimFrame.X], mousepos[0]), BORDERSIZE);
        this.selectOffsetY = rAdd(rSub(cel![AnimFrame.Y], mousepos[1]), BORDERSIZE);
        this.invalidate();
      }
    }
    const currentFrame = this.getCurrentFrame();
    if (currentFrame && !this.selecting &&
        (KeyboardInput.triggerex("TAB") || KeyboardInput.repeatex("TAB"))) {
      for (let k = 0; k < currentFrame.length; k++) {
        this._currentcel += 1;
        if (this._currentcel >= currentFrame.length) this._currentcel = 0;
        if (currentFrame[this._currentcel]) break;
      }
      this.invalidate();
      return;
    }
    if (cel && this.selecting && mousepos) {
      cel[AnimFrame.X] = rAdd(mousepos[0] - BORDERSIZE, this.selectOffsetX) as number;
      cel[AnimFrame.Y] = rAdd(mousepos[1] - BORDERSIZE, this.selectOffsetY) as number;
      this.dirty[this._currentcel] = true;
    }
    if (!Input.press(Input.MOUSELEFT) && this.selecting) {
      this.selecting = false;
    }
    if (cel) {
      if ((KeyboardInput.triggerex("DELETE") || KeyboardInput.repeatex("DELETE")) && this.isDeletable(this._currentcel)) {
        this._animation.array[this._currentframe]![this._currentcel] = null;
        this.dirty[this._currentcel] = true;
        return;
      }
      if (KeyboardInput.triggerex("P") || KeyboardInput.repeatex("P")) { // Properties
        await AnimCanvasHooks.pbCellProperties?.(this);
        this.dirty[this._currentcel] = true;
        return;
      }
      if (KeyboardInput.triggerex("L") || KeyboardInput.repeatex("L")) { // Lock
        cel[AnimFrame.LOCKED] = (cel[AnimFrame.LOCKED] === 0) ? 1 : 0;
        this.dirty[this._currentcel] = true;
      }
      if (KeyboardInput.triggerex("R") || KeyboardInput.repeatex("R")) { // Rotate right
        cel[AnimFrame.ANGLE] = rAdd(cel[AnimFrame.ANGLE], 10) as number;
        cel[AnimFrame.ANGLE] = rMod(cel[AnimFrame.ANGLE], 360) as number;
        this.dirty[this._currentcel] = true;
      }
      if (KeyboardInput.triggerex("E") || KeyboardInput.repeatex("E")) { // Rotate left
        cel[AnimFrame.ANGLE] = rSub(cel[AnimFrame.ANGLE], 10) as number;
        cel[AnimFrame.ANGLE] = rMod(cel[AnimFrame.ANGLE], 360) as number;
        this.dirty[this._currentcel] = true;
      }
      if (KeyboardInput.triggerex("KP_PLUS") || KeyboardInput.repeatex("KP_PLUS")) { // Zoom in
        cel[AnimFrame.ZOOMX] = rAdd(cel[AnimFrame.ZOOMX], 10) as number;
        if (cel[AnimFrame.ZOOMX]! > 1000) cel[AnimFrame.ZOOMX] = 1000;
        cel[AnimFrame.ZOOMY] = rAdd(cel[AnimFrame.ZOOMY], 10) as number;
        if (cel[AnimFrame.ZOOMY]! > 1000) cel[AnimFrame.ZOOMY] = 1000;
        this.dirty[this._currentcel] = true;
      }
      if (KeyboardInput.triggerex("KP_MINUS") || KeyboardInput.repeatex("KP_MINUS")) { // Zoom out
        cel[AnimFrame.ZOOMX] = rSub(cel[AnimFrame.ZOOMX], 10) as number;
        if (cel[AnimFrame.ZOOMX]! < 10) cel[AnimFrame.ZOOMX] = 10;
        cel[AnimFrame.ZOOMY] = rSub(cel[AnimFrame.ZOOMY], 10) as number;
        if (cel[AnimFrame.ZOOMY]! < 10) cel[AnimFrame.ZOOMY] = 10;
        this.dirty[this._currentcel] = true;
      }
      if (!this.isLocked(this._currentcel)) {
        if (Input.trigger(Input.UP) || Input.repeat(Input.UP)) {
          const increment = Input.press(Input.ALT) ? 1 : 8;
          cel[AnimFrame.Y] = rSub(cel[AnimFrame.Y], increment) as number;
          this.dirty[this._currentcel] = true;
        }
        if (Input.trigger(Input.DOWN) || Input.repeat(Input.DOWN)) {
          const increment = Input.press(Input.ALT) ? 1 : 8;
          cel[AnimFrame.Y] = rAdd(cel[AnimFrame.Y], increment) as number;
          this.dirty[this._currentcel] = true;
        }
        if (Input.trigger(Input.LEFT) || Input.repeat(Input.LEFT)) {
          const increment = Input.press(Input.ALT) ? 1 : 8;
          cel[AnimFrame.X] = rSub(cel[AnimFrame.X], increment) as number;
          this.dirty[this._currentcel] = true;
        }
        if (Input.trigger(Input.RIGHT) || Input.repeat(Input.RIGHT)) {
          const increment = Input.press(Input.ALT) ? 1 : 8;
          cel[AnimFrame.X] = rAdd(cel[AnimFrame.X], increment) as number;
          this.dirty[this._currentcel] = true;
        }
      }
    }
  }

  /** Sprite#x= keeps an Integer: cel positions can be Floats. */
  private placeCel(sprite: Sprite): void {
    sprite.x = Math.trunc(Number(sprite.x)) + AnimationCanvas.BORDERSIZE;
    sprite.y = Math.trunc(Number(sprite.y)) + AnimationCanvas.BORDERSIZE;
  }

  override async update(): Promise<void> {
    super.update();
    if (this.playing) {
      if (this.player!.animDone()) {
        this.playing = false;
        this.invalidate();
      } else {
        this.player!.update();
      }
      return;
    }
    await this.updateInput();
    //    @testscreen.update
    //    self.bitmap=@testscreen.bitmap
    if (this._currentframe < this._animation.length) {
      for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
        if (!this.dirty[i]) continue;
        if (this.celsprites[i]) {
          this.setBitmap_(i, this._currentframe);
          pbSpriteSetAnimFrame(this.celsprites[i]!, this._animation.array[this._currentframe]![i] ?? null,
            this.celsprites[0], this.celsprites[1], true);
          this.placeCel(this.celsprites[i]!);
        }
        this.setPreviousFrame(i);
        this.setFrame(i);
        this.dirty[i] = false;
      }
    } else {
      for (let i = 0; i < PBAnimation.MAX_SPRITES; i++) {
        pbSpriteSetAnimFrame(this.celsprites[i]!, null, this.celsprites[0], this.celsprites[1], true);
        this.placeCel(this.celsprites[i]!);
        this.setPreviousFrame(i);
        this.setFrame(i);
        this.dirty[i] = false;
      }
    }
  }
}

//===============================================================================
// Window classes
//===============================================================================
export class BitmapDisplayWindow extends SpriteWindow_Base {
  private _bitmapname = "";
  private _hue = 0;

  constructor(x: number, y: number, width: number, height: number) {
    super(x, y, width, height);
    this.contents = new Bitmap(width - 32, height - 32);
  }

  get bitmapname(): string { return this._bitmapname; }
  set bitmapname(value: string) {
    if (this._bitmapname !== value) {
      this._bitmapname = value;
      this.refresh();
    }
  }

  get hue(): number { return this._hue; }
  set hue(value: number) {
    if (this._hue !== value) {
      this._hue = value;
      this.refresh();
    }
  }

  /** The graphic (Graphics/Animations/<bitmapname>) must have been fetched (preloadBitmap). */
  override refresh(): void {
    const contents = this.contents;
    if (!contents) return; // (SpriteWindow_Base calls refresh before contents exists)
    contents.clear();
    const bmap = new AnimatedBitmap("Graphics/Animations/" + this._bitmapname, this._hue).deanimate();
    if (!bmap) return;
    let ww = bmap.width;
    let wh = bmap.height;
    const sx = contents.width / ww;
    const sy = contents.height / wh;
    if (sx > sy) {
      ww = sy * ww;
      wh = contents.height;
    } else {
      wh = sx * wh;
      ww = contents.width;
    }
    const dest = new Rect((contents.width - ww) / 2, (contents.height - wh) / 2, ww, wh);
    const src = new Rect(0, 0, bmap.width, bmap.height);
    contents.stretchBlt(dest, bmap, src);
    // (bmap.dispose: the cached bitmap isn't disposed)
  }
}

export class AnimationNameWindow {
  private canvas: AnimationCanvas;
  private oldname: string | null = null;
  private window: Window_UnformattedTextPokemon;

  constructor(canvas: AnimationCanvas, x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    this.canvas = canvas;
    this.window = Window_UnformattedTextPokemon.newWithSize(
      _INTL("Name: {1}", this.canvas.animation.name), x, y, width, height, viewport,
    );
  }

  set viewport(value: Viewport | null) { this.window.viewport = value; }

  update(): void {
    const newtext = _INTL("Name: {1}", this.canvas.animation.name);
    if (this.oldname !== newtext) {
      this.window.text = newtext;
      this.oldname = newtext;
    }
    this.window.update();
  }

  refresh(): void { this.window.refresh(); }
  dispose(): void { this.window.dispose(); }
  disposed(): boolean { return this.window.isDisposed(); }
}
