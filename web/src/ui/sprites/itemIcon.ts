// Port of 013_Items/007_Item_Sprites.rb: ItemIconSprite and HeldItemIconSprite.
// No plugin changes them; the held icon filename comes from
// GameData::Item.held_icon_filename as ZUD Mechanics and Essentials Deluxe
// patch it (see data/gameData/item.ts).
//
// ItemIconSprite cycles animated icons over Graphics.frame_rate update calls;
// at our 60 Hz that's FRAME_RATE = 60 (GameCharacter.ts).
//
// Graphics must be preloaded: preloadItemIcons() / preloadHeldItemIcons().

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { FRAME_RATE } from "../../game/GameCharacter";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Rect } from "../../rgss/types";
import { assetExists } from "../../core/assets";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { preloadBitmaps } from "../rpgCache";
import { PictureOrigin } from "../scenes/PictureEx";
import { resolveBitmap } from "./pokemonIcon";

const existsOnly = (path: string) => (assetExists(path) ? path : null);

/** GameData::Item.icon_filename(item) */
export function itemIconFilename(item: Id | Item | null | undefined): string {
  return Item.iconFilename(item, resolveBitmap);
}

/** GameData::Item.held_icon_filename(item) */
export function heldItemIconFilename(item: Id | Item | null | undefined): string | null {
  return Item.heldIconFilename(item, resolveBitmap);
}

/** Fetches the icons ItemIconSprite will show for these items (null = the "back" icon). */
export async function preloadItemIcons(items: Iterable<Id | null | undefined>): Promise<void> {
  const paths = new Set<string>(["Graphics/Items/back", "Graphics/Items/000"]);
  for (const item of items) paths.add(Item.iconFilename(item, existsOnly));
  await preloadBitmaps(paths);
}

/** Fetches the held-item icons HeldItemIconSprite will show for these items. */
export async function preloadHeldItemIcons(items: Iterable<Id | null | undefined>): Promise<void> {
  const paths = new Set<string>();
  for (const item of items) {
    if (!item) continue;
    const file = Item.heldIconFilename(item, existsOnly);
    if (file) paths.add(file);
  }
  await preloadBitmaps(paths);
}

/** RGSS skips the src_rect reset when the same bitmap is assigned again. */
function assignBitmap(sprite: Sprite, bitmap: Bitmap | null): void {
  if (sprite.bitmap !== bitmap) sprite.setBitmap(bitmap);
}

//===============================================================================
// Item icon
//===============================================================================
export class ItemIconSprite extends Sprite {
  static readonly ANIM_ICON_SIZE = 48;
  static readonly FRAMES_PER_CYCLE = FRAME_RATE;

  private _item: Id | null = null;
  private animbitmap: AnimatedBitmap | null = null;
  private animframe = 0;
  private numframes = 1;
  private frame = 0;
  private _blankzero = false;
  private forceitemchange = true;
  private offset: number | null = null;

  constructor(x: number, y: number, item: Id | null, viewport: Viewport | null = null) {
    super(viewport);
    this.x = x;
    this.y = y;
    this._blankzero = false;
    this.forceitemchange = true;
    this.item = item;
    this.forceitemchange = false;
  }

  override dispose(): void {
    this.animbitmap?.dispose();
    this.animbitmap = null;
    super.dispose();
  }

  override get width(): number {
    if (!this.bitmap || this.bitmap.isDisposed()) return 0;
    return this.numframes === 1 ? this.bitmap.width : ItemIconSprite.ANIM_ICON_SIZE;
  }

  override get height(): number {
    return this.bitmap && !this.bitmap.isDisposed() ? this.bitmap.height : 0;
  }

  get blankzero(): boolean { return this._blankzero; }
  set blankzero(val: boolean) {
    this._blankzero = val;
    this.forceitemchange = true;
    this.item = this._item;
    this.forceitemchange = false;
  }

  setOffset(offset: number = PictureOrigin.CENTER): void {
    this.offset = offset;
    this.changeOrigin();
  }

  changeOrigin(): void {
    if (this.offset == null) this.offset = PictureOrigin.CENTER;
    switch (this.offset) {
      case PictureOrigin.TOP_LEFT: case PictureOrigin.TOP: case PictureOrigin.TOP_RIGHT:
        this.oy = 0; break;
      case PictureOrigin.LEFT: case PictureOrigin.CENTER: case PictureOrigin.RIGHT:
        this.oy = Math.floor(this.height / 2); break;
      case PictureOrigin.BOTTOM_LEFT: case PictureOrigin.BOTTOM: case PictureOrigin.BOTTOM_RIGHT:
        this.oy = this.height; break;
    }
    switch (this.offset) {
      case PictureOrigin.TOP_LEFT: case PictureOrigin.LEFT: case PictureOrigin.BOTTOM_LEFT:
        this.ox = 0; break;
      case PictureOrigin.TOP: case PictureOrigin.CENTER: case PictureOrigin.BOTTOM:
        this.ox = Math.floor(this.width / 2); break;
      case PictureOrigin.TOP_RIGHT: case PictureOrigin.RIGHT: case PictureOrigin.BOTTOM_RIGHT:
        this.ox = this.width; break;
    }
  }

  get item(): Id | null { return this._item; }
  set item(value: Id | null) {
    if (this._item === value && !this.forceitemchange) return;
    this._item = value;
    this.animbitmap?.dispose();
    this.animbitmap = null;
    if (this._item || !this._blankzero) {
      this.animbitmap = new AnimatedBitmap(itemIconFilename(this._item));
      this.setBitmap(this.animbitmap.bitmap);
      const bmp = this.bitmap!;
      const size = ItemIconSprite.ANIM_ICON_SIZE;
      if (bmp.height === size) {
        this.numframes = Math.max(Math.floor(bmp.width / size), 1);
        this.srcRect = new Rect(0, 0, size, size);
      } else {
        this.numframes = 1;
        this.srcRect = new Rect(0, 0, bmp.width, bmp.height);
      }
      this.animframe = 0;
      this.frame = 0;
    } else {
      this.setBitmap(null);
    }
    this.changeOrigin();
  }

  override update(dt?: number): void {
    super.update(dt);
    if (this.animbitmap) {
      this.animbitmap.update();
      assignBitmap(this, this.animbitmap.bitmap);
      if (this.numframes > 1) {
        const frameskip = Math.floor(ItemIconSprite.FRAMES_PER_CYCLE / this.numframes);
        this.frame = (this.frame + 1) % ItemIconSprite.FRAMES_PER_CYCLE;
        if (this.frame >= frameskip) {
          this.animframe = (this.animframe + 1) % this.numframes;
          this.srcRect.x = this.animframe * ItemIconSprite.ANIM_ICON_SIZE;
          this.frame = 0;
        }
      }
    }
  }
}

//===============================================================================
// Item held icon (used in the party screen)
//===============================================================================
export class HeldItemIconSprite extends Sprite {
  private _pokemon: Pokemon;
  private _item: Id | null = null;
  private animbitmap: AnimatedBitmap | null = null;

  constructor(x: number, y: number, pokemon: Pokemon, viewport: Viewport | null = null) {
    super(viewport);
    this.x = x;
    this.y = y;
    this._pokemon = pokemon;
    this._item = null;
    this.item = pokemon.itemId;
  }

  override dispose(): void {
    this.animbitmap?.dispose();
    this.animbitmap = null;
    super.dispose();
  }

  get pokemon(): Pokemon { return this._pokemon; }
  set pokemon(value: Pokemon) {
    this._pokemon = value;
    this.item = value.itemId;
  }

  get item(): Id | null { return this._item; }
  set item(value: Id | null) {
    if (this._item === value) return;
    this._item = value;
    this.animbitmap?.dispose();
    this.animbitmap = null;
    if (this._item) {
      this.animbitmap = new AnimatedBitmap(heldItemIconFilename(this._item));
      this.setBitmap(this.animbitmap.bitmap);
    } else {
      this.setBitmap(null);
    }
  }

  override update(dt?: number): void {
    super.update(dt);
    this.item = this._pokemon.itemId;
    if (this.animbitmap) {
      this.animbitmap.update();
      assignBitmap(this, this.animbitmap.bitmap);
    }
  }
}
