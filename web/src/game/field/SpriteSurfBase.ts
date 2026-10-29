// Port of 005_Sprites/005_Sprite_SurfBase.rb: the Pokémon the player rides
// while surfing (base_surf) or diving (base_dive), drawn under the player's
// sprite. While jumping on or off the water it stays on the water tile
// ($game_temp.surf_base_coords). Sprite_Character creates one for the player
// (sprites/SpriteCharacter.ts).

import { Sprite, type Viewport } from "../../rgss/display";
import type { Bitmap } from "../../rgss/Bitmap";
import { Graphics } from "../../rgss/Graphics";
import { Cache } from "../../sprites/cache";
import { REAL_RES_X, REAL_RES_Y, TILE_HEIGHT, TILE_WIDTH, X_SUBPIXELS, Y_SUBPIXELS, type GameCharacter } from "../GameCharacter";
import { G } from "../globals";

/** TilemapRenderer::ZOOM_X / ZOOM_Y */
const ZOOM_X = 1;
const ZOOM_Y = 1;

export class SpriteSurfBase {
  private sprite: Sprite | null = null;
  private disposed = false;
  private visible_ = true;

  constructor(private rsprite: Sprite, public event: GameCharacter, private viewport: Viewport | null = null) {
    // AnimatedBitmap.new("Graphics/Characters/base_surf" / "base_dive") + RPG::Cache.retain
    void Cache.ensureCharacter("base_surf");
    void Cache.ensureCharacter("base_dive");
    this.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.sprite?.dispose();
    this.sprite = null;
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  get visible(): boolean { return this.visible_; }
  set visible(value: boolean) {
    this.visible_ = value;
    if (this.sprite && !this.sprite.isDisposed()) this.sprite.visible = value;
  }

  update(): void {
    if (this.disposed) return;
    const g = G.pokemonGlobal;
    if (!g.surfing && !g.diving) {
      // Just-in-time disposal of sprite
      if (this.sprite) {
        this.sprite.dispose();
        this.sprite = null;
      }
      return;
    }
    const bitmap: Bitmap | null | undefined = g.surfing ? Cache.character("base_surf") : Cache.character("base_dive");
    if (!bitmap) return; // still loading
    // Just-in-time creation of sprite
    this.sprite ??= new Sprite(this.viewport);
    const s = this.sprite;
    s.bitmap = bitmap;
    const cw = Math.floor(bitmap.width / 4);
    const ch = Math.floor(bitmap.height / 4);
    const ev = this.event;
    const sx = ev.patternSurf * cw;
    const sy = ((ev.direction - 2) / 2) * ch;
    s.srcRect.set(sx, sy, cw, ch);
    const coords = (G.gameTemp as unknown as { surfBaseCoords: [number, number] | null }).surfBaseCoords;
    if (coords) {
      let sprX = Math.round((coords[0] * REAL_RES_X - ev.map.displayX) / X_SUBPIXELS);
      sprX += TILE_WIDTH / 2;
      if (ZOOM_X !== 1) sprX = (sprX - Graphics.width / 2) * ZOOM_X + Graphics.width / 2;
      s.x = sprX;
      let sprY = Math.round((coords[1] * REAL_RES_Y - ev.map.displayY) / Y_SUBPIXELS);
      sprY += TILE_HEIGHT / 2 + 16;
      if (ZOOM_Y !== 1) sprY = (sprY - Graphics.height / 2) * ZOOM_Y + Graphics.height / 2;
      s.y = sprY;
    } else {
      s.x = this.rsprite.x;
      s.y = this.rsprite.y;
    }
    s.ox = cw / 2;
    s.oy = ch - 16; // Assume base needs offsetting
    s.oy -= ev.bobHeight;
    s.z = ev.screenZ(ch) - 1;
    s.zoomX = this.rsprite.zoomX;
    s.zoomY = this.rsprite.zoomY;
    s.tone = this.rsprite.tone;
    s.color = this.rsprite.color;
    s.opacity = this.rsprite.opacity;
  }
}
