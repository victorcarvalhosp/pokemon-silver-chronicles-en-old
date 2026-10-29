// Port of 005_Sprites/004_Sprite_Reflection.rb: the upside-down, wobbling copy
// of a character drawn in still water (tiles whose terrain tag
// shows_reflections are drawn at z -100, the reflection at -50, the rest of the
// map at 0 and above). Sprite_Character makes one for the player and for
// events named "reflection" (or "reflection(N)": fixed height N); Following
// Pokemon EX adds one to the follower sprites (set_reflection).

import { G } from "../game/globals";
import { TILE_HEIGHT, type GameCharacter } from "../game/GameCharacter";
import { ORIGINAL_STEP } from "../game/GameScreen";
import { Graphics } from "../rgss/Graphics";
import { Sprite, type Viewport } from "../rgss/display";
import { Color } from "../rgss/types";

/** TilemapRenderer::ZOOM_X / ZOOM_Y (DISPLAY_TILE_WIDTH / SOURCE_TILE_WIDTH) */
const ZOOM_X = 1;
const ZOOM_Y = 1;
/** Settings::TIME_SHADING */
const TIME_SHADING = true;

/** What the reflection copies: the character's sprite (Sprite_Character). */
export interface ReflectedSprite {
  readonly sprite: Sprite;
  readonly character: GameCharacter;
}

export class SpriteReflection {
  private sprite: Sprite | null = null;
  private height = 0;
  private fixedheight = false;
  private disposed = false;
  private _visible: boolean | undefined;

  constructor(private rsprite: ReflectedSprite, public event: GameCharacter | null, private viewport: Viewport | null = null) {
    const name = (event as { name?: unknown } | null)?.name;
    const m = event && event !== (G.gamePlayer as unknown) && typeof name === "string" ? /reflection\((\d+)\)/i.exec(name) : null;
    if (m) {
      this.height = Number(m[1]) || 0;
      this.fixedheight = true;
    }
    this.update();
  }

  dispose(): void {
    if (!this.disposed) {
      this.sprite?.dispose();
      this.sprite = null;
      this.disposed = true;
    }
  }

  isDisposed(): boolean { return this.disposed; }

  get visible(): boolean | undefined { return this._visible; }
  set visible(value: boolean) {
    this._visible = value;
    if (this.sprite && !this.sprite.isDisposed()) this.sprite.visible = value;
  }

  update(): void {
    if (this.disposed) return;
    const r = this.rsprite.sprite;
    const shouldShow = r.visible;
    if (!shouldShow) {
      // Just-in-time disposal of sprite
      if (this.sprite) {
        this.sprite.dispose();
        this.sprite = null;
      }
      return;
    }
    // Just-in-time creation of sprite
    this.sprite ??= new Sprite(this.viewport);
    const s = this.sprite;
    const character = this.rsprite.character;
    const x = r.x - r.ox * ZOOM_X;
    let y = r.y - r.oy * ZOOM_Y;
    if (/offset/i.test(character.characterName)) y -= TILE_HEIGHT * ZOOM_Y;
    if (!this.fixedheight) this.height = G.pokemonGlobal.bridge;
    y += (this.height * ZOOM_Y * TILE_HEIGHT) / 2;
    const width = r.srcRect.width;
    const height = r.srcRect.height;
    s.x = Math.trunc(x + Math.floor(width / 2) * ZOOM_X);
    s.y = Math.trunc(y + (height + Math.floor(height / 2)) * ZOOM_Y);
    s.ox = Math.floor(width / 2);
    s.oy = Math.floor(height / 2) - 2; // Hard-coded 2 pixel shift up
    s.oy -= character.bobHeight * 2;
    s.z = -50; // Still water is -100, map is 0 and above
    if (this.event === (G.gamePlayer as unknown)) s.z += 1;
    s.zoomX = r.zoomX;
    s.zoomY = r.zoomY;
    // Graphics.frame_count counted at the original 40 fps
    const frame = Math.floor((Math.floor(Graphics.frameCount * ORIGINAL_STEP) % 40) / 10);
    s.zoomX *= [1.0, 0.95, 1.0, 1.05][frame]!;
    s.angle = 180.0;
    s.mirror = true;
    s.bitmap = r.bitmap;
    s.tone = r.tone;
    if (this.height > 0) {
      s.color = new Color(48, 96, 160, 255); // Dark still water
      s.opacity = r.opacity;
      s.visible = !TIME_SHADING; // Can't time-tone a colored sprite
    } else {
      s.color = new Color(224, 224, 224, 96);
      s.opacity = Math.floor((r.opacity * 3) / 4);
      s.visible = true;
    }
    s.srcRect.set(r.srcRect);
  }
}
