// Port of 001_Technical/006_RPG_Sprite.rb: SpriteAnimation (an RPG::Animation
// played on top of a sprite) and RPG::Sprite's list of running animations.

import type { AudioRef } from "../data/events";
import { Graphics } from "../rgss/Graphics";
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

  disposeAnimation(): void {
    for (const s of this.sprites ?? []) s.dispose();
    this.sprites = null;
    this.animation = null;
  }

  active(): boolean {
    return this.sprites != null;
  }

  effect(): boolean {
    return this.duration > 0;
  }

  update(): void {
    if (!this.animation) return;
    let quick = true;
    if (Graphics.frameCount % this.frameSkip === 0) {
      this.duration -= 1;
      quick = false;
    }
    this.updateAnimation(quick);
  }

  private updateAnimation(quick = false): void {
    const anim = this.animation!;
    if (this.duration <= 0) {
      this.disposeAnimation();
      return;
    }
    const frameIndex = anim.frameMax - this.duration;
    this.setSprites(anim.frames[frameIndex] ?? [], anim.position, quick);
    if (quick) return;
    for (const t of anim.timings) if (t.frame === frameIndex) this.processTiming(t);
  }

  private setSprites(cells: number[][], position: number, quick: boolean): void {
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
      const s = this.sprites![i]!;
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

  private processTiming(t: AnimationData["timings"][number]): void {
    if (!(t.condition === 0 || (t.condition === 1 && this.hit) || (t.condition === 2 && !this.hit))) return;
    if (t.se.name !== "") pbSEPlay(t.se);
    const seconds = t.flashDuration * 2 * FLASH_FRAME;
    switch (t.flashScope) {
      case 1: this.host.sprite.flash(Color.fromArray(t.flashColor), seconds); break;
      case 2: this.host.viewport?.flash(Color.fromArray(t.flashColor), seconds); break;
      case 3: this.host.sprite.flash(null, seconds); break;
    }
  }
}

/** RPG::Sprite's animation list: plays any number of animations at once. */
export class SpriteAnimations {
  private list: SpriteAnimation[] = [];

  constructor(private host: AnimationHost) {}

  animation(anim: AnimationData, hit: boolean, height = 3): void {
    const a = new SpriteAnimation(this.host);
    a.play(anim, hit, height);
    this.list.push(a);
  }

  effect(): boolean {
    return this.list.some((a) => a.effect());
  }

  update(): void {
    for (const a of this.list) a.update();
    this.list = this.list.filter((a) => a.active());
  }

  dispose(): void {
    for (const a of this.list) a.disposeAnimation();
    this.list = [];
  }
}
