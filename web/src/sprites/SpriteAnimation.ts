// Port of 001_Technical/006_RPG_Sprite.rb: SpriteAnimation (an RPG::Animation
// played on top of a sprite, once or looped), RPG::Sprite's list of running
// animations (SpriteAnimations, used by Sprite_Character) and RPG::Sprite
// itself (RPGSprite: whiten/appear/escape/collapse/damage/blink effects).
// Nothing in this game calls the RPG::Sprite effects or loop_animation.

import type { AudioRef } from "../data/events";
import { Graphics } from "../rgss/Graphics";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { Color } from "../rgss/types";
import { FRAME_RATE, TILE_HEIGHT } from "../game/GameCharacter";
import { pbSEPlay } from "../game/GameSystem";
import { Cache } from "./cache";

export interface AnimationData {
  id: number;
  name: string;
  animationName: string;
  animationHue: number;
  /** 0 top, 1 middle, 2 bottom, 3 screen */
  position: number;
  frameMax: number;
  /** frames[f][cell] = [pattern, x, y, zoom, angle, mirror, opacity, blend] */
  frames: number[][][];
  timings: { frame: number; se: AudioRef; flashScope: number; flashColor: number[]; flashDuration: number; condition: number }[];
}

/** Flash durations are counted in frames of the original 40 fps game. */
const FLASH_FRAME = 1 / 40;

/** The sprite an animation plays on (Sprite_Character's RPG::Sprite). */
export interface AnimationHost {
  readonly sprite: Sprite;
  readonly viewport: Viewport | null;
}

export class SpriteAnimation {
  private animation: AnimationData | null = null;
  private hit = true;
  private height = 3;
  private duration = 0;
  private frameSkip = 3;
  private sprites: Sprite[] | null = null;
  private loopAnim: AnimationData | null = null;
  private loopIndex = 0;
  private loopFrameSkip = 3;
  private loopSprites: Sprite[] | null = null;

  constructor(private host: AnimationHost) {}

  play(animation: AnimationData, hit: boolean, height = 3): void {
    this.disposeAnimation();
    this.animation = animation;
    this.hit = hit;
    this.height = height;
    this.duration = animation.frameMax;
    const m = /\[\s*(\d+?)\s*\]\s*$/.exec(animation.name);
    const fr = m ? Number(m[1]) : 20;
    this.frameSkip = Math.max(1, Math.round(FRAME_RATE / fr));
    const path = `Graphics/Animations/${animation.animationName}`;
    const bitmap = Cache.get(path, animation.animationHue);
    this.sprites = [];
    for (let i = 0; i < 16; i++) {
      const s = new Sprite(this.host.viewport);
      s.bitmap = bitmap ?? null;
      s.visible = false;
      this.sprites.push(s);
    }
    if (bitmap === undefined) {
      void Cache.ensure(path, animation.animationHue).then((b) => {
        for (const s of this.sprites ?? []) s.bitmap = b;
      });
    }
    this.updateAnimation();
  }

  /**
   * loop_animation (:63). NOTE (Ruby parity): it reads the frame rate from
   * `@_animation.name` (the one-shot animation) instead of the looped one
   * (006_RPG_Sprite.rb:70); RPG::Sprite#loop_animation makes a new
   * SpriteAnimation with no one-shot animation, so in Ruby it always fails with
   * NoMethodError. See docs/original-game-bugs.md.
   */
  loopAnimation(animation: AnimationData | null): void {
    if (animation === this.loopAnim) return;
    this.disposeLoopAnimation();
    this.loopAnim = animation;
    if (!animation) return;
    this.loopIndex = 0;
    if (!this.animation) throw new TypeError("undefined method `name' for nil:NilClass");
    const m = /\[\s*(\d+?)\s*\]\s*$/.exec(this.animation.name);
    const fr = m ? Number(m[1]) : 20;
    this.loopFrameSkip = Math.max(1, Math.round(FRAME_RATE / fr));
    const path = `Graphics/Animations/${animation.animationName}`;
    const bitmap = Cache.get(path, animation.animationHue);
    this.loopSprites = [];
    for (let i = 0; i < 16; i++) {
      const s = new Sprite(this.host.viewport);
      s.bitmap = bitmap ?? null;
      s.visible = false;
      this.loopSprites.push(s);
    }
    if (bitmap === undefined) {
      void Cache.ensure(path, animation.animationHue).then((b) => {
        for (const s of this.loopSprites ?? []) s.bitmap = b;
      });
    }
    this.updateLoopAnimation();
  }

  disposeAnimation(): void {
    for (const s of this.sprites ?? []) s.dispose();
    this.sprites = null;
    this.animation = null;
  }

  disposeLoopAnimation(): void {
    for (const s of this.loopSprites ?? []) s.dispose();
    this.loopSprites = null;
    this.loopAnim = null;
  }

  dispose(): void {
    this.disposeAnimation();
    this.disposeLoopAnimation();
  }

  active(): boolean {
    return this.sprites != null || this.loopSprites != null;
  }

  effect(): boolean {
    return this.duration > 0;
  }

  update(): void {
    if (this.animation) {
      let quick = true;
      if (Graphics.frameCount % this.frameSkip === 0) {
        this.duration -= 1;
        quick = false;
      }
      this.updateAnimation(quick);
    }
    if (this.loopAnim) {
      const quick = Graphics.frameCount % this.loopFrameSkip !== 0;
      this.updateLoopAnimation(quick);
      if (!quick) this.loopIndex = (this.loopIndex + 1) % this.loopAnim.frameMax;
    }
  }

  /** update_loop_animation */
  updateLoopAnimation(quick = false): void {
    const anim = this.loopAnim!;
    this.setSprites(this.loopSprites!, anim.frames[this.loopIndex] ?? [], anim.position, quick);
    if (quick) return;
    for (const t of anim.timings) if (t.frame === this.loopIndex) this.processTiming(t, true);
  }

  /** update_animation */
  updateAnimation(quick = false): void {
    const anim = this.animation!;
    if (this.duration <= 0) {
      this.disposeAnimation();
      return;
    }
    const frameIndex = anim.frameMax - this.duration;
    this.setSprites(this.sprites!, anim.frames[frameIndex] ?? [], anim.position, quick);
    if (quick) return;
    for (const t of anim.timings) if (t.frame === frameIndex) this.processTiming(t, this.hit);
  }

  private setSprites(sprites: Sprite[], cells: number[][], position: number, quick: boolean): void {
    const host = this.host.sprite;
    let sx = 320, sy = 240;
    if (position === 3) {
      if (this.host.viewport) {
        sx = this.host.viewport.rect.width / 2;
        sy = this.host.viewport.rect.height - 160;
      }
    } else {
      sx = host.x - host.ox + host.srcRect.width / 2;
      sy = host.y - host.oy;
      if (position === 1) sy += host.srcRect.height / 2;
      if (position === 2) sy += host.srcRect.height;
    }
    for (let i = 0; i < 16; i++) {
      const s = sprites[i]!;
      const cell = cells[i];
      const pattern = cell?.[0];
      if (!cell || pattern == null || pattern === -1) {
        s.visible = false;
        continue;
      }
      s.x = sx + cell[1]!;
      s.y = sy + cell[2]!;
      if (quick) continue;
      s.visible = true;
      s.srcRect.set((pattern % 5) * 192, Math.floor(pattern / 5) * 192, 192, 192);
      switch (this.height) {
        case 0: s.z = 1; break;
        case 1: s.z = s.y + (TILE_HEIGHT * 3) / 2 + 1; break;
        case 2: s.z = s.y + TILE_HEIGHT * 3 + 1; break;
        default: s.z = 2000;
      }
      s.ox = 96;
      s.oy = 96;
      s.zoomX = s.zoomY = cell[3]! / 100;
      s.angle = cell[4]!;
      s.mirror = cell[5] === 1;
      s.tone = host.tone;
      s.opacity = (cell[6]! * host.opacity) / 255;
      s.blendType = cell[7]!;
    }
  }

  private processTiming(t: AnimationData["timings"][number], hit: boolean): void {
    if (!(t.condition === 0 || (t.condition === 1 && hit) || (t.condition === 2 && !hit))) return;
    if (t.se.name !== "") pbSEPlay(t.se);
    const seconds = t.flashDuration * 2 * FLASH_FRAME;
    switch (t.flashScope) {
      case 1: this.host.sprite.flash(Color.fromArray(t.flashColor), seconds); break;
      case 2: this.host.viewport?.flash(Color.fromArray(t.flashColor), seconds); break;
      case 3: this.host.sprite.flash(null, seconds); break;
    }
  }
}

/** RPG::Sprite's animation lists (@animations, @loopAnimations): any number of animations at once. */
export class SpriteAnimations {
  private list: SpriteAnimation[] = [];
  private loops: SpriteAnimation[] = [];

  constructor(private host: AnimationHost) {}

  animation(anim: AnimationData, hit: boolean, height = 3): void {
    const a = new SpriteAnimation(this.host);
    a.play(anim, hit, height);
    this.list.push(a);
  }

  /** loop_animation */
  loopAnimation(anim: AnimationData): void {
    const a = new SpriteAnimation(this.host);
    a.loopAnimation(anim);
    this.loops.push(a);
  }

  effect(): boolean {
    return this.list.some((a) => a.effect());
  }

  update(): void {
    for (const a of this.list) a.update();
    for (const a of this.loops) a.update();
    this.list = this.list.filter((a) => a.active());
    this.loops = this.loops.filter((a) => a.active());
  }

  /** dispose_animation */
  disposeAnimation(): void {
    for (const a of this.list) a.disposeAnimation();
    this.list = [];
  }

  /** dispose_loop_animation */
  disposeLoopAnimation(): void {
    for (const a of this.loops) a.disposeLoopAnimation();
    this.loops = [];
  }

  dispose(): void {
    this.disposeAnimation();
    this.disposeLoopAnimation();
  }
}

/** Sprite#opacity= clamps to 0..255 in RGSS. */
const clampOpacity = (v: number) => Math.min(255, Math.max(0, v));

/** One frame of the original game (the effects below count 40 fps frames). */
const ORIGINAL_FPS = 40;

/**
 * RPG::Sprite (006_RPG_Sprite.rb:233): a sprite with the RMXP battle effects
 * and animations. The effect counters advance one step per original frame
 * (1/40 s), whatever the update rate. Ruby's x=/y= also move the animation
 * cells; here they follow on the next update, which places them again.
 */
export class RPGSprite extends Sprite implements AnimationHost {
  private whitenDuration = 0;
  private appearDuration = 0;
  private escapeDuration = 0;
  private collapseDuration = 0;
  private damageDuration = 0;
  private blink = false;
  private blinkCount = 0;
  private damageSprite: Sprite | null = null;
  private frameTime = 0;
  private anims = new SpriteAnimations(this);

  get sprite(): Sprite { return this; }

  override dispose(): void {
    this.disposeDamage();
    this.anims.dispose();
    super.dispose();
  }

  whiten(): void {
    this.blendType = 0;
    this.color.set(255, 255, 255, 128);
    this.opacity = 255;
    this.whitenDuration = 16;
    this.appearDuration = 0;
    this.escapeDuration = 0;
    this.collapseDuration = 0;
  }

  appear(): void {
    this.blendType = 0;
    this.color.set(0, 0, 0, 0);
    this.opacity = 0;
    this.appearDuration = 16;
    this.whitenDuration = 0;
    this.escapeDuration = 0;
    this.collapseDuration = 0;
  }

  escape(): void {
    this.blendType = 0;
    this.color.set(0, 0, 0, 0);
    this.opacity = 255;
    this.escapeDuration = 32;
    this.whitenDuration = 0;
    this.appearDuration = 0;
    this.collapseDuration = 0;
  }

  collapse(): void {
    this.blendType = 1;
    this.color.set(255, 64, 64, 255);
    this.opacity = 255;
    this.collapseDuration = 48;
    this.whitenDuration = 0;
    this.appearDuration = 0;
    this.escapeDuration = 0;
  }

  damage(value: number | string, critical: boolean): void {
    this.disposeDamage();
    const damageString = typeof value === "number" ? String(Math.abs(value)) : String(value);
    const bitmap = new Bitmap(160, 48);
    bitmap.font.name = "Arial Black";
    bitmap.font.size = 32;
    bitmap.font.color.set(0, 0, 0);
    bitmap.drawText(-1, 12 - 1, 160, 36, damageString, 1);
    bitmap.drawText(+1, 12 - 1, 160, 36, damageString, 1);
    bitmap.drawText(-1, 12 + 1, 160, 36, damageString, 1);
    bitmap.drawText(+1, 12 + 1, 160, 36, damageString, 1);
    if (typeof value === "number" && value < 0) {
      bitmap.font.color.set(176, 255, 144);
    } else {
      bitmap.font.color.set(255, 255, 255);
    }
    bitmap.drawText(0, 12, 160, 36, damageString, 1);
    if (critical) {
      bitmap.font.size = 20;
      bitmap.font.color.set(0, 0, 0);
      bitmap.drawText(-1, -1, 160, 20, "CRITICAL", 1);
      bitmap.drawText(+1, -1, 160, 20, "CRITICAL", 1);
      bitmap.drawText(-1, +1, 160, 20, "CRITICAL", 1);
      bitmap.drawText(+1, +1, 160, 20, "CRITICAL", 1);
      bitmap.font.color.set(255, 255, 255);
      bitmap.drawText(0, 0, 160, 20, "CRITICAL", 1);
    }
    const ds = new Sprite(this.viewport);
    ds.setBitmap(bitmap);
    ds.ox = 80;
    ds.oy = 20;
    ds.x = this.x;
    ds.y = this.y - Math.trunc(this.oy / 2);
    ds.z = 3000;
    this.damageSprite = ds;
    this.damageDuration = 40;
  }

  animation(animation: AnimationData, hit: boolean, height = 3): void { this.anims.animation(animation, hit, height); }
  loopAnimation(animation: AnimationData): void { this.anims.loopAnimation(animation); }

  disposeDamage(): void {
    if (!this.damageSprite) return;
    this.damageSprite.bitmap?.dispose();
    this.damageSprite.dispose();
    this.damageSprite = null;
    this.damageDuration = 0;
  }

  disposeAnimation(): void { this.anims.disposeAnimation(); }
  disposeLoopAnimation(): void { this.anims.disposeLoopAnimation(); }

  blinkOn(): void {
    if (this.blink) return;
    this.blink = true;
    this.blinkCount = 0;
  }

  blinkOff(): void {
    if (!this.blink) return;
    this.blink = false;
    this.color.set(0, 0, 0, 0);
  }

  isBlink(): boolean { return this.blink; }

  effect(): boolean {
    if (this.whitenDuration > 0) return true;
    if (this.appearDuration > 0) return true;
    if (this.escapeDuration > 0) return true;
    if (this.collapseDuration > 0) return true;
    if (this.damageDuration > 0) return true;
    return this.anims.effect();
  }

  override update(dt = Graphics.deltaS): void {
    super.update(dt);
    this.frameTime += dt;
    while (this.frameTime >= 1 / ORIGINAL_FPS - 1e-9) {
      this.frameTime -= 1 / ORIGINAL_FPS;
      this.updateEffectsOneFrame();
    }
    this.anims.update();
  }

  /** The per-frame part of RPG::Sprite#update (:436-486). */
  private updateEffectsOneFrame(): void {
    if (this.whitenDuration > 0) {
      this.whitenDuration -= 1;
      this.color.alpha = 128 - ((16 - this.whitenDuration) * 10);
    }
    if (this.appearDuration > 0) {
      this.appearDuration -= 1;
      this.opacity = clampOpacity((16 - this.appearDuration) * 16);
    }
    if (this.escapeDuration > 0) {
      this.escapeDuration -= 1;
      this.opacity = clampOpacity(256 - ((32 - this.escapeDuration) * 10));
    }
    if (this.collapseDuration > 0) {
      this.collapseDuration -= 1;
      this.opacity = clampOpacity(256 - ((48 - this.collapseDuration) * 6));
    }
    if (this.damageDuration > 0) {
      this.damageDuration -= 1;
      const d = this.damageDuration;
      const ds = this.damageSprite!;
      if (d >= 38 && d <= 39) ds.y -= 4;
      else if (d >= 36 && d <= 37) ds.y -= 2;
      else if (d >= 34 && d <= 35) ds.y += 2;
      else if (d >= 28 && d <= 33) ds.y += 4;
      ds.opacity = clampOpacity(256 - ((12 - d) * 32));
      if (d === 0) this.disposeDamage();
    }
    if (this.blink) {
      this.blinkCount = (this.blinkCount + 1) % 32;
      const alpha = this.blinkCount < 16 ? (16 - this.blinkCount) * 6 : (this.blinkCount - 16) * 6;
      this.color.set(255, 255, 255, alpha);
    }
  }
}
