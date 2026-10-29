// Port of 005_Sprites/003_Sprite_Character.rb (incl. BushBitmap), with the
// aliases 009_Sprite_DynamicShadows.rb adds (setShadows / clearShadows) and
// Following Pokemon EX's set_reflection.

import { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { Rect } from "../rgss/types";
import { TILE_HEIGHT, TILE_WIDTH, type GameCharacter } from "../game/GameCharacter";
import { GameEvent } from "../game/GameEvent";
import type { GameMap } from "../game/GameMap";
import { Cache } from "./cache";
import { SpriteAnimations } from "./SpriteAnimation";
import { Data } from "../data/store";
import { G } from "../game/globals";
import { pbDayNightTint } from "../game/dayNight";
import { SpriteSurfBase } from "../game/field/SpriteSurfBase";
import { SpriteReflection } from "./SpriteReflection";
import { SpriteShadow, XPML_read, type ShadowParams } from "./SpriteDynamicShadows";

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
  /** Sprite_SurfBase, for the player only. */
  private surfbase: SpriteSurfBase | null = null;
  private reflection: SpriteReflection | null = null;
  /** 009_Sprite_DynamicShadows.rb: @ombrelist */
  private ombrelist: SpriteShadow[] = [];

  constructor(readonly viewport: Viewport, readonly character: GameCharacter, private tileBitmap: TileTextureSource) {
    this.sprite = new Sprite(viewport);
    this.animations = new SpriteAnimations(this);
    const name = (character as { name?: unknown }).name;
    if (!character || character === (G.gamePlayer as unknown) || (typeof name === "string" && /reflection/i.test(name))) {
      this.reflection = new SpriteReflection(this, character, viewport);
    }
    if (character === (G.gamePlayer as unknown)) this.surfbase = new SpriteSurfBase(this.sprite, character, viewport);
    this.update();
  }

  /** Following Pokemon EX (Event Sprite.rb): set_reflection */
  setReflection(viewport: Viewport, event: GameCharacter | null): void {
    this.reflection ??= new SpriteReflection(this, event, viewport);
  }

  /** 009_Sprite_DynamicShadows.rb: setShadows(map, shadows) */
  setShadows(map: GameMap, shadows: ShadowParams[]): void {
    if (this.character instanceof GameEvent && shadows.length > 0) {
      const params = XPML_read(map, "Shadow", this.character, 4);
      if (params) {
        for (const _shadow of shadows) {
          // NOTE (Ruby parity): passes every shadow source instead of this one,
          // so the shadow's source is an Array and its update raises
          // (009_Sprite_DynamicShadows.rb:139). No event here has "begin Shadow".
          this.ombrelist.push(new SpriteShadow(this.viewport, this.character, shadows, this.tileBitmap));
        }
      }
    }
    if (this.character === (G.gamePlayer as unknown) && shadows.length > 0) {
      for (const shadow of shadows) this.ombrelist.push(new SpriteShadow(this.viewport, this.character, shadow, this.tileBitmap));
    }
    this.update();
  }

  clearShadows(): void {
    for (const s of this.ombrelist) s?.dispose();
    this.ombrelist = [];
  }

  dispose(): void {
    // (Ruby leaves @ombrelist to the garbage collector, which disposes the
    // shadow sprites at some later point; here they'd stay on screen.)
    this.clearShadows();
    this.reflection?.dispose();
    this.reflection = null;
    this.surfbase?.dispose();
    this.surfbase = null;
    this.animations.dispose();
    this.sprite.dispose();
  }

  update(): void {
    this.updateCharacter();
    for (const ombre of this.ombrelist) ombre.update();
  }

  private updateCharacter(): void {
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
    if (this.reflection) this.reflection.visible = this.sprite.visible;
    if (this.tileId === 0) {
      const sx = c.pattern * this.cw;
      const sy = ((c.direction - 2) / 2) * this.ch;
      this.sprite.srcRect.set(sx, sy, this.cw, this.ch);
      this.sprite.oy = (this.spriteOffset ? this.ch - 16 : this.ch) - c.bobHeight;
    }
    if (this.sprite.visible) {
      if (c instanceof GameEvent && /regulartone/i.test(c.name)) this.sprite.tone.set(0, 0, 0, 0);
      else pbDayNightTint(this.sprite);
    }
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
    this.reflection?.update();
    this.surfbase?.update();
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
