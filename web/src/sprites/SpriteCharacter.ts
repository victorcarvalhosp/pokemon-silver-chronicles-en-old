// Port of 005_Sprites/003_Sprite_Character.rb (incl. BushBitmap).

import { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { Rect } from "../rgss/types";
import { TILE_HEIGHT, TILE_WIDTH, type GameCharacter } from "../game/GameCharacter";
import { GameEvent } from "../game/GameEvent";
import type { GameMap } from "../game/GameMap";
import { Cache } from "./cache";
import { SpriteAnimations } from "./SpriteAnimation";
import { Data } from "../data/store";

/** BushBitmap: the character sheet with its bottom `depth` pixels faded. */
const bushCache = new WeakMap<Bitmap, Map<string, Bitmap>>();
function bushBitmap(bitmap: Bitmap, isTile: boolean, depth: number): Bitmap {
  let byDepth = bushCache.get(bitmap);
  if (!byDepth) bushCache.set(bitmap, (byDepth = new Map()));
  const k = `${isTile}:${depth}`;
  let ret = byDepth.get(k);
  if (ret) return ret;
  ret = new Bitmap(bitmap.width, bitmap.height);
  const rows = isTile ? 1 : 4;
  const charheight = ret.height / rows;
  const cy = charheight - depth - 2;
  for (let i = 0; i < rows; i++) {
    const y = i * charheight;
    if (cy >= 0) {
      ret.blt(0, y, bitmap, new Rect(0, y, ret.width, cy));
      ret.blt(0, y + cy, bitmap, new Rect(0, y + cy, ret.width, 2), 170);
    }
    if (cy + 2 >= 0) ret.blt(0, y + cy + 2, bitmap, new Rect(0, y + cy + 2, ret.width, 2), 85);
  }
  byDepth.set(k, ret);
  return ret;
}

/** pbGetTileBitmap: one tile from the tileset as its own bitmap. */
type TileTextureSource = (tileId: number) => Bitmap | null;

export class SpriteCharacter {
  readonly sprite: Sprite;
  private tileId = -1;
  private characterName: string | null = null;
  private characterHue = 0;
  private oldBushDepth = 0;
  private charbitmap: Bitmap | null = null;
  private spriteOffset = false;
  private cw = 0;
  private ch = 0;
  private animations: SpriteAnimations;

  constructor(readonly viewport: Viewport, readonly character: GameCharacter, private tileBitmap: TileTextureSource) {
    this.sprite = new Sprite(viewport);
    this.animations = new SpriteAnimations(this);
    this.update();
  }

  dispose(): void {
    this.animations.dispose();
    this.sprite.dispose();
  }

  update(): void {
    const c = this.character;
    if (c instanceof GameEvent && !c.shouldUpdate()) return;
    this.sprite.update();
    this.animations.update();
    if (this.tileId !== c.tileId || this.characterName !== c.characterName || this.characterHue !== c.characterHue || this.oldBushDepth !== c.bushDepth) {
      this.tileId = c.tileId;
      this.characterName = c.characterName;
      this.characterHue = c.characterHue;
      this.oldBushDepth = c.bushDepth;
      this.charbitmap = null;
      if (this.tileId >= 384) {
        this.charbitmap = this.tileBitmap(this.tileId);
        this.spriteOffset = false;
        this.cw = TILE_WIDTH * c.width;
        this.ch = TILE_HEIGHT * c.height;
        this.sprite.srcRect.set(0, 0, this.cw, this.ch);
        this.sprite.ox = this.cw / 2;
        this.sprite.oy = this.ch;
      } else if (this.characterName !== "") {
        const name = this.characterName;
        const hue = this.characterHue;
        const cached = Cache.character(name, hue);
        if (cached === undefined) {
          // Not loaded yet: load, then redo this setup on a later frame.
          void Cache.ensureCharacter(name, hue).then(() => {
            if (this.characterName === name) this.characterName = null;
          });
        }
        this.charbitmap = cached ?? null;
        this.spriteOffset = /offset/i.test(name);
        this.cw = this.charbitmap ? this.charbitmap.width / 4 : 0;
        this.ch = this.charbitmap ? this.charbitmap.height / 4 : 0;
        this.sprite.ox = this.cw / 2;
      } else {
        this.sprite.setBitmap(null);
        this.cw = this.ch = 0;
      }
      c.spriteSize = [this.cw, this.ch];
    }
    if (!this.charbitmap) {
      this.sprite.bitmap = null;
      return;
    }
    const bush = c.bushDepth;
    this.sprite.bitmap = bush === 0 ? this.charbitmap : bushBitmap(this.charbitmap, this.tileId >= 384, bush);
    this.sprite.visible = !c.transparent;
    if (this.tileId === 0) {
      const sx = c.pattern * this.cw;
      const sy = ((c.direction - 2) / 2) * this.ch;
      this.sprite.srcRect.set(sx, sy, this.cw, this.ch);
      this.sprite.oy = (this.spriteOffset ? this.ch - 16 : this.ch) - c.bobHeight;
    }
    // TODO(day/night): pbDayNightTint(self) unless the event is named "regulartone".
    this.sprite.x = c.screenX();
    this.sprite.y = c.screenY();
    this.sprite.z = c.screenZ(this.ch);
    this.sprite.opacity = c.opacity;
    this.sprite.blendType = c.blendType;
    if (c.animationId !== 0) {
      const animation = Data.animations.get(c.animationId);
      if (animation) this.animations.animation(animation, true);
      c.animationId = 0;
    }
  }
}

/** Builds pbGetTileBitmap-style bitmaps from a map's tileset for tile-graphic events. */
export function tileBitmapSource(getMap: () => GameMap, tilesetImage: (map: GameMap) => Bitmap | null | undefined): TileTextureSource {
  const cache = new Map<string, Bitmap>();
  return (tileId) => {
    const map = getMap();
    const k = `${map.tilesetName}:${tileId}`;
    const hit = cache.get(k);
    if (hit) return hit;
    const src = tilesetImage(map);
    if (!src) return null;
    const i = tileId - 384;
    const bmp = new Bitmap(32, 32);
    bmp.blt(0, 0, src, new Rect((i % 8) * 32, Math.floor(i / 8) * 32, 32, 32));
    cache.set(k, bmp);
    return bmp;
  };
}
