// Port of 005_Sprites/008_Sprite_AnimationSprite.rb: AnimationSprite, a
// sprite whose sole purpose is to display an animation. It can be displayed
// anywhere on the map and is disposed automatically when its animation is
// finished (grass rustling, dust, the Following Pokémon's come out/in).
// Spriteset_Map#addUserAnimation / addUserSprite are in spritesets.ts.

import { Data } from "../data/store";
import type { GameMap } from "../game/GameMap";
import { REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH, X_SUBPIXELS, Y_SUBPIXELS } from "../game/GameCharacter";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { pbDayNightTint } from "../game/dayNight";
import { SpriteAnimations, type AnimationData } from "./SpriteAnimation";

export class AnimationSprite {
  readonly sprite: Sprite;
  private animations: SpriteAnimations;
  private disposed = false;

  constructor(animId: number, private map: GameMap, private tileX: number, private tileY: number, readonly viewport: Viewport | null = null, tinting = false, height = 3) {
    this.sprite = new Sprite(viewport);
    this.sprite.setBitmap(new Bitmap(1, 1));
    this.animations = new SpriteAnimations(this);
    this.setCoords();
    if (tinting) pbDayNightTint(this.sprite);
    const animation = Data.animations.get(animId) as AnimationData | undefined;
    if (animation) this.animations.animation(animation, true, height);
  }

  setCoords(): void {
    this.sprite.x = Math.ceil((this.tileX * REAL_RES_X - this.map.displayX) / X_SUBPIXELS) + TILE_WIDTH / 2;
    this.sprite.y = Math.ceil((this.tileY * REAL_RES_Y - this.map.displayY) / Y_SUBPIXELS) + TILE_HEIGHT;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animations.dispose();
    this.sprite.bitmap?.dispose();
    this.sprite.dispose();
  }

  update(): void {
    if (this.disposed) return;
    this.setCoords();
    this.sprite.update();
    this.animations.update();
    if (!this.animations.effect()) this.dispose();
  }
}
