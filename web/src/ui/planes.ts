// Ports of 007_Objects and windows/009_Planes.rb (ColoredPlane,
// AnimatedPlane), addBackgroundPlane / addBackgroundOrColoredPlane
// (002_MessageConfig.rb), TrainerWalkingCharSprite (015_Trainers and
// player/003_Trainer_Sprites.rb) and pbGetMapNameFromId (011_Messages.rb).
// Bitmaps must be preloaded (rpgCache.preloadBitmaps) before use.

import { Bitmap } from "../rgss/Bitmap";
import { Plane, Sprite, type Viewport } from "../rgss/display";
import type { Color } from "../rgss/types";
import { FRAME_RATE } from "../game/GameCharacter";
import { Data } from "../data/store";
import { G } from "../game/globals";
import { mapMetadata } from "../game/metadata";
import { AnimatedBitmap } from "./AnimatedBitmap";
import { pbResolveBitmap } from "./rpgCache";

export class ColoredPlane extends Plane {
  constructor(color: Color, viewport: Viewport | null = null) {
    super(viewport);
    this.bitmap = new Bitmap(32, 32);
    this.setPlaneColor(color);
  }
  setPlaneColor(value: Color): void {
    this.bitmap!.fillRect(0, 0, this.bitmap!.width, this.bitmap!.height, value);
  }
  override dispose(): void {
    this.bitmap?.dispose();
    super.dispose();
  }
  update(): void {}
}

export class AnimatedPlane extends Plane {
  private animated: AnimatedBitmap | null = null;
  setBitmap(file: string | null, hue = 0): void {
    this.clearBitmap();
    if (file == null) return;
    this.animated = new AnimatedBitmap(file, hue);
    this.bitmap = this.animated.bitmap;
  }
  update(): void {
    if (this.animated) {
      this.animated.update();
      this.bitmap = this.animated.bitmap;
    }
  }
  override dispose(): void {
    this.clearBitmap();
    super.dispose();
  }
  private clearBitmap(): void {
    this.animated?.dispose();
    this.animated = null;
    if (!this.isDisposed()) this.bitmap = null;
  }
}

type Sprites = Record<string, unknown>;

function clearWindowskins(sprites: Sprites): void {
  for (const spr of Object.values(sprites)) {
    const w = spr as { windowskin?: unknown; active?: unknown } | null;
    if (w && typeof w.active === "boolean" && "windowskin" in w) w.windowskin = null;
  }
}

export function addBackgroundPlane(sprites: Sprites, planename: string, background: string, viewport: Viewport | null = null): void {
  const plane = new AnimatedPlane(viewport);
  sprites[planename] = plane;
  const name = pbResolveBitmap(`Graphics/Pictures/${background}`);
  if (name == null) {
    plane.bitmap = null;
    plane.visible = false;
  } else {
    plane.setBitmap(name);
    clearWindowskins(sprites);
  }
}

export function addBackgroundOrColoredPlane(sprites: Sprites, planename: string, background: string, color: Color, viewport: Viewport | null = null): void {
  const name = pbResolveBitmap(`Graphics/Pictures/${background}`);
  if (name == null) {
    sprites[planename] = new ColoredPlane(color, viewport);
  } else {
    const plane = new AnimatedPlane(viewport);
    plane.setBitmap(name);
    sprites[planename] = plane;
    clearWindowskins(sprites);
  }
}

export class TrainerWalkingCharSprite extends Sprite {
  private animbitmap: AnimatedBitmap | null = null;
  private animframe = 0;
  private frame = 0;
  private frameskip = 0;

  constructor(charset: string, viewport: Viewport | null = null) {
    super(viewport);
    this.charset = charset;
    this.animspeed = 5;
  }

  set charset(value: string) {
    this.animbitmap?.dispose();
    this.animbitmap = null;
    const file = pbResolveBitmap(`Graphics/Characters/${value}`);
    if (file) {
      this.animbitmap = new AnimatedBitmap(file);
      this.bitmap = this.animbitmap.bitmap;
      this.srcRect.set(0, 0, this.bitmap.width / 4, this.bitmap.height / 4);
    } else {
      this.bitmap = null;
    }
  }

  /** Used for the box icon in the naming screen. */
  set altcharset(value: string) {
    this.animbitmap?.dispose();
    this.animbitmap = null;
    const file = pbResolveBitmap(value);
    if (file) {
      this.animbitmap = new AnimatedBitmap(file);
      this.bitmap = this.animbitmap.bitmap;
      this.srcRect.set(0, 0, this.bitmap.width / 4, this.bitmap.height);
    } else {
      this.bitmap = null;
    }
  }

  /** Frames per pattern at the original 40 fps, scaled to the frame rate. */
  set animspeed(value: number) {
    this.frameskip = (value * FRAME_RATE) / 40;
  }

  override dispose(): void {
    this.animbitmap?.dispose();
    super.dispose();
  }

  override update(): void {
    super.update();
    if (this.animbitmap) {
      this.animbitmap.update();
      this.bitmap = this.animbitmap.bitmap;
    }
    this.frame += 1;
    if (this.frame >= this.frameskip && this.animbitmap) {
      this.animframe = (this.animframe + 1) % 4;
      this.srcRect.x = (this.animframe * this.animbitmap.bitmap.width) / 4;
      this.frame -= this.frameskip;
    }
  }
}

/** pbGetMapNameFromId: the PBS map name (MessageTypes::MapNames), else the editor's, with \PN replaced. */
export function pbGetMapNameFromId(id: number): string {
  let name = (mapMetadata(id)?.name as string | undefined) ?? "";
  if (!name) name = Data.mapInfos.get(id)?.name ?? "";
  if (G.player) name = name.replace(/\\PN/g, G.player.name);
  return name;
}
