// Port of Plugins/Overworld Shadows EX/script.rb: Sprite_OWShadow and its
// Sprite_Character aliases (initialize/update/dispose), plus
// pbSetOverworldShadow.
//
// Sprite_Character#initialize creates the shadow after its own update; here
// the aliased update creates it on that first update instead (the original
// constructor's update call), which is the same moment.
//
// The jump zoom steps (0.1 / 0.05 per frame) are per frame of the original
// 40 fps game, so they're scaled to FRAME_RATE.

import { FRAME_RATE, type GameCharacter } from "../GameCharacter";
import { G } from "../globals";
import { Sprite, type Viewport } from "../../rgss/display";
import type { Bitmap } from "../../rgss/Bitmap";
import { Cache } from "../../sprites/cache";
import { SpriteCharacter } from "../../sprites/SpriteCharacter";
import { assetExists } from "../../core/assets";
import { OWShadowSettings, showsShadow, updateShowsShadow } from "./OverworldShadows";
import { sceneMap } from "./scene";

const STEP = 40 / FRAME_RATE;

/** Characters the plugin adds attr_readers for. */
interface JumpState {
  jumpCount: number;
  jumpDistanceLeft: number;
  jumpPeak: number;
}

/** The shadow sprite drawn under a Sprite_Character. */
export class SpriteOWShadow {
  private sprite: Sprite | null;
  private disposed = false;
  private path = "";
  private bitmap: Bitmap | null = null;
  private lastTransparent: boolean;

  constructor(private rsprite: SpriteCharacter, private event: GameCharacter, private viewport: Viewport | null = null) {
    this.sprite = new Sprite(viewport);
    let name = "";
    // Game_FollowingPkmn always gets the default shadow.
    if (!(event as { isFollowingPkmn?: boolean }).isFollowingPkmn) {
      if (event !== (G.gamePlayer as unknown)) {
        const m = /shdw\((.*?)\)/.exec((event as unknown as { name?: string }).name ?? "");
        if (m) name = m[1]!;
      } else {
        name = OWShadowSettings.PLAYER_SHADOW_FILENAME;
      }
    }
    if (!name) name = OWShadowSettings.DEFAULT_SHADOW_FILENAME;
    this.loadBitmap(`Graphics/Characters/Shadows/${name}`);
    this.lastTransparent = event.transparent;
    this.update();
  }

  private loadBitmap(path: string): void {
    this.path = path;
    this.bitmap = Cache.get(path) ?? null;
    if (Cache.get(path) === undefined) {
      void Cache.ensure(path).then((b) => {
        if (this.path === path) this.bitmap = b;
      });
    }
  }

  /** set_bitmap(name): overrides the shadow graphic. */
  setBitmap(name: string): void {
    const path = `Graphics/Characters/Shadows/${name}`;
    if (!assetExists(path)) {
      console.log("The Shadow File you are trying to set it absent from /Graphics/Characters/Shadows/");
      return;
    }
    this.loadBitmap(path);
    if (this.sprite && !this.sprite.isDisposed()) this.sprite.dispose();
    this.sprite = new Sprite(this.viewport);
    this.sprite.bitmap = this.bitmap;
    this.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.sprite?.dispose();
    this.sprite = null;
    this.disposed = true;
  }

  isDisposed(): boolean { return this.disposed; }

  get visible(): boolean { return this.sprite?.visible ?? false; }

  /** jump_sprite: shrinks and grows the shadow over a jump. */
  private jumpSprite(): void {
    const s = this.sprite;
    if (!s) return;
    const e = this.event as unknown as JumpState;
    if (e.jumpDistanceLeft >= 1 && e.jumpDistanceLeft < e.jumpPeak) {
      s.zoomX += 0.1 * STEP;
      s.zoomY += 0.1 * STEP;
    } else if (e.jumpDistanceLeft >= e.jumpPeak) {
      s.zoomX -= 0.05 * STEP;
      s.zoomY -= 0.05 * STEP;
    }
    s.zoomX = Math.min(1, Math.max(0, s.zoomX));
    s.zoomY = Math.min(1, Math.max(0, s.zoomY));
    if (e.jumpCount === 1) {
      s.zoomX = 1;
      s.zoomY = 1;
    }
    s.x = this.event.screenX();
    s.y = this.event.screenY();
    s.z = this.rsprite.sprite.z - 1;
  }

  update(): void {
    if (this.disposed || !sceneMap()) return;
    // transparent= alias: recalculate when it changes.
    if (this.event.transparent !== this.lastTransparent) {
      this.lastTransparent = this.event.transparent;
      updateShowsShadow(this.event);
    }
    if (this.event.jumping()) return this.jumpSprite();
    this.sprite ??= new Sprite(this.viewport);
    const s = this.sprite;
    const b = this.bitmap;
    const r = this.rsprite.sprite;
    s.setBitmap(b);
    s.x = r.x;
    s.y = r.y;
    s.ox = (b?.width ?? 0) / 2;
    s.oy = (b?.height ?? 0) - 2;
    s.z = this.event.screenZ(b?.height ?? 0) - 1;
    s.zoomX = r.zoomX;
    s.zoomY = r.zoomY;
    s.opacity = r.opacity;
    s.visible = r.visible && showsShadow(this.event);
  }
}

// --- Sprite_Character aliases ------------------------------------------------------

declare module "../../sprites/SpriteCharacter" {
  interface SpriteCharacter {
    /** Overworld Shadows EX: attr_accessor :ow_shadow */
    owShadow?: SpriteOWShadow | null;
  }
}

const proto = SpriteCharacter.prototype;
const update = proto.update;
proto.update = function (this: SpriteCharacter) {
  update.call(this);
  // initialize alias: the shadow is created right after the first update.
  if (this.owShadow === undefined) this.owShadow = new SpriteOWShadow(this, this.character, this.viewport);
  this.owShadow?.update();
};
const dispose = proto.dispose;
proto.dispose = function (this: SpriteCharacter) {
  dispose.call(this);
  this.owShadow?.dispose();
  this.owShadow = null;
};

/** pbSetOverworldShadow(name, event_id = nil, map_id = nil) */
export function pbSetOverworldShadow(name: string, eventId: number | null = null, mapId: number | null = null): void {
  const scene = G.scene as unknown as {
    spritesetGlobal?: { playerSprite: SpriteCharacter } | null;
    spriteset?(id: number): { characterSprites?: SpriteCharacter[] } | undefined;
  } | null;
  if (!scene?.spritesetGlobal || !name) return;
  if (eventId == null) {
    scene.spritesetGlobal.playerSprite.owShadow?.setBitmap(name);
  } else {
    const id = mapId ?? G.gameMap!.mapId;
    // $scene.spritesets[map_id].character_sprites[event_id - 1]
    scene.spriteset?.(id)?.characterSprites?.[eventId - 1]?.owShadow?.setBitmap(name);
  }
}
