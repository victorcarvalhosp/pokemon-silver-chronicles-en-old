// Ports of 005_Sprites/007_Spriteset_Map.rb, 006_Spriteset_Global.rb and
// 001_Sprite_Picture.rb.

import { Plane, Sprite, Viewport } from "../rgss/display";
import { Bitmap } from "../rgss/Bitmap";
import type { GameMap } from "../game/GameMap";
import type { GamePicture } from "../game/GameScreen";
import { G } from "../game/globals";
import { X_SUBPIXELS, Y_SUBPIXELS, type GameCharacter } from "../game/GameCharacter";
import type { TilemapRenderer } from "../map/TilemapRenderer";
import { FollowerSprites } from "../game/following/FollowerSprites";
import { AnimationSprite } from "./AnimationSprite";
import { Cache } from "./cache";
import { SpriteCharacter } from "./SpriteCharacter";

let viewports: { v0: Viewport; v1: Viewport; v2: Viewport; v3: Viewport } | null = null;

/** Spriteset_Map's class-level viewports (+ Spriteset_Global's @@viewport2). */
export function mapViewports() {
  if (!viewports) {
    const v0 = new Viewport(0, 0, 512, 384); // panorama
    v0.z = -100;
    const v1 = new Viewport(0, 0, 512, 384); // map, events, player, fog
    v1.z = 0;
    const v2 = new Viewport(0, 0, 512, 384); // pictures
    v2.z = 200;
    const v3 = new Viewport(0, 0, 512, 384); // flashing
    v3.z = 500;
    viewports = { v0, v1, v2, v3 };
  }
  return viewports;
}

/** AnimatedPlane: a Plane whose bitmap is loaded by name. */
class NamedPlane extends Plane {
  private name = "";
  setGraphic(folder: string, name: string, hue: number): void {
    this.name = name;
    this.bitmap = null;
    if (!name) return;
    const path = `Graphics/${folder}/${name}`;
    void Cache.ensure(path, hue).then((b) => {
      if (this.name === name) this.bitmap = b;
    });
  }
}

export class SpritesetMap {
  private panorama: NamedPlane;
  private fog: NamedPlane;
  private characterSprites: SpriteCharacter[] = [];
  private panoramaName: string | null = null;
  private panoramaHue = 0;
  private fogName: string | null = null;
  private fogHue = 0;
  /** 008_Sprite_AnimationSprite.rb: @usersprites */
  private usersprites: (AnimationSprite | null)[] = [];

  constructor(readonly map: GameMap, renderer: TilemapRenderer) {
    const { v0, v1 } = mapViewports();
    this.panorama = new NamedPlane(v0);
    this.fog = new NamedPlane(v1);
    this.fog.z = 3000;
    const tileBitmaps = new Map<number, Bitmap | null>();
    const tileBitmap = (tileId: number) => {
      if (!tileBitmaps.has(tileId)) tileBitmaps.set(tileId, renderer.tileBitmap(map.tileset, tileId));
      return tileBitmaps.get(tileId)!;
    };
    for (const id of [...map.events.keys()].sort((a, b) => a - b)) {
      this.characterSprites.push(new SpriteCharacter(v1, map.events.get(id)!, tileBitmap));
    }
    this.update();
  }

  dispose(): void {
    this.panorama.dispose();
    this.fog.dispose();
    for (const s of this.characterSprites) s.dispose();
    this.characterSprites = [];
    for (const s of this.usersprites) s?.dispose();
    this.usersprites = [];
  }

  /**
   * Visible Overworld Wild Encounters (attr_reader :character_sprites): a
   * sprite for an event added after the map loaded / removed before it unloads.
   */
  addCharacter(character: GameCharacter): void {
    this.characterSprites.push(new SpriteCharacter(mapViewports().v1, character, () => null));
  }
  removeCharacter(character: GameCharacter): void {
    const i = this.characterSprites.findIndex((s) => s.character === character);
    if (i < 0) return;
    this.characterSprites[i]!.dispose();
    this.characterSprites.splice(i, 1);
  }

  /** addUserAnimation(animID, x, y, tinting, height): plays an animation on a map tile. */
  addUserAnimation(animId: number, x: number, y: number, tinting = false, height = 3): AnimationSprite {
    const sprite = new AnimationSprite(animId, this.map, x, y, mapViewports().v1, tinting, height);
    this.addUserSprite(sprite);
    return sprite;
  }

  addUserSprite(newSprite: AnimationSprite): void {
    for (let i = 0; i < this.usersprites.length; i++) {
      const sprite = this.usersprites[i];
      if (sprite && !sprite.isDisposed()) continue;
      this.usersprites[i] = newSprite;
      return;
    }
    this.usersprites.push(newSprite);
  }

  update(): void {
    const map = this.map;
    const { v1, v3 } = mapViewports();
    if (this.panoramaName !== map.panoramaName || this.panoramaHue !== map.panoramaHue) {
      this.panoramaName = map.panoramaName;
      this.panoramaHue = map.panoramaHue;
      this.panorama.setGraphic("Panoramas", map.panoramaName, map.panoramaHue);
    }
    if (this.fogName !== map.fogName || this.fogHue !== map.fogHue) {
      this.fogName = map.fogName;
      this.fogHue = map.fogHue;
      this.fog.setGraphic("Fogs", map.fogName, map.fogHue);
    }
    const tmox = Math.round(map.displayX / X_SUBPIXELS);
    const tmoy = Math.round(map.displayY / Y_SUBPIXELS);
    v1.rect.set(0, 0, 512, 384);
    v1.ox = G.gameScreen.shake;
    v1.oy = 0;
    this.panorama.ox = tmox / 2;
    this.panorama.oy = tmoy / 2;
    this.fog.ox = tmox + map.fogOx;
    this.fog.oy = tmoy + map.fogOy;
    this.fog.zoomX = this.fog.zoomY = map.fogZoom / 100;
    this.fog.opacity = map.fogOpacity;
    this.fog.blendType = map.fogBlendType;
    this.fog.tone = map.fogTone;
    for (const s of this.characterSprites) s.update();
    // TODO(weather): RPG::Weather.
    v1.tone = G.gameScreen.tone;
    v3.color = G.gameScreen.flashColor;
    v1.update();
    v3.update();
    for (const s of this.usersprites) if (s && !s.isDisposed()) s.update();
  }
}

class SpritePicture {
  private sprite: Sprite | null = null;
  private pictureName = "";

  constructor(private viewport: Viewport, private picture: GamePicture) {
    this.update();
  }

  dispose(): void {
    this.sprite?.dispose();
  }

  update(): void {
    this.sprite?.update();
    const p = this.picture;
    if (this.pictureName !== p.name) {
      this.pictureName = p.name;
      if (p.name !== "") {
        this.sprite ??= new Sprite(this.viewport);
        const sprite = this.sprite;
        const name = p.name;
        sprite.setBitmap(Cache.picture(name) ?? null);
        if (Cache.picture(name) === undefined) {
          void Cache.ensurePicture(name).then((b) => {
            if (this.pictureName === name) sprite.setBitmap(b);
          });
        }
      }
    }
    if (this.pictureName === "") {
      this.sprite?.dispose();
      this.sprite = null;
      return;
    }
    const s = this.sprite!;
    s.visible = true;
    if (p.origin === 0) {
      s.ox = 0;
      s.oy = 0;
    } else {
      s.ox = (s.bitmap?.width ?? 0) / 2;
      s.oy = (s.bitmap?.height ?? 0) / 2;
    }
    s.x = p.x;
    s.y = p.y;
    s.z = p.number;
    s.zoomX = p.zoomX / 100;
    s.zoomY = p.zoomY / 100;
    s.opacity = p.opacity;
    s.blendType = p.blendType;
    s.angle = p.angle;
    s.tone = p.tone;
  }
}

export class SpritesetGlobal {
  readonly followerSprites: FollowerSprites;
  readonly playerSprite: SpriteCharacter;
  private pictureSprites: SpritePicture[] = [];

  constructor(player: GameCharacter) {
    const { v1, v2 } = mapViewports();
    this.followerSprites = new FollowerSprites(v1);
    this.playerSprite = new SpriteCharacter(v1, player, () => null);
    for (let i = 1; i <= 100; i++) this.pictureSprites.push(new SpritePicture(v2, G.gameScreen.pictures[i]!));
    this.update();
  }

  dispose(): void {
    this.followerSprites.dispose();
    this.playerSprite.dispose();
    for (const s of this.pictureSprites) s.dispose();
    this.pictureSprites = [];
  }

  update(): void {
    this.followerSprites.update();
    this.playerSprite.update();
    for (const s of this.pictureSprites) s.update();
  }
}
