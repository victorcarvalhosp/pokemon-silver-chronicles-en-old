// Port of 005_Sprites/009_Sprite_DynamicShadows.rb: Sprite_Shadow (Rataime's
// shadows, adapted by Peter O.) and XPML_read. An event whose page starts with
// the comment "begin Shadow Source" (optionally followed by comment lines
// "anglemin N", "anglemax N", "distancemax N", "opacity N") casts a black,
// rotated copy of the player's sprite away from itself while the player is in
// range. The Sprite_Character / Spriteset_Map aliases are in SpriteCharacter.ts
// (setShadows / clearShadows) and spritesets.ts.
//
// Events would cast shadows too with a "begin Shadow" comment, but no event of
// this game has one (and the Ruby crashes for them, see setShadows).

import { Data } from "../data/store";
import type { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { Color } from "../rgss/types";
import type { GameCharacter } from "../game/GameCharacter";
import { GameEvent } from "../game/GameEvent";
import type { GameMap } from "../game/GameMap";
import { rawCommandList } from "../ui/messages";
import { Cache } from "./cache";
import { ScreenPosHelper } from "./ScreenPosHelper";
import { SpriteAnimations } from "./SpriteAnimation";

/**
 * XPML Definition, by Rataime, using ideas from Near Fantastica.
 *
 * Returns null if the markup wasn't present at all, [] if there weren't any
 * parameters, else the parameters with "int" converted to numbers. E.g. for
 *   begin first / begin second / param1 1 / param2 two / begin third / anything 3
 * XPML_read("first") -> [], ("second") -> [1, "two"], ("third") -> [3],
 * ("forth") -> null.
 */
export function XPML_read(_map: GameMap, markup: string, event: GameCharacter | null, maxParamNumber = 0): (number | string)[] | null {
  let parameterList: (number | string)[] | null = null;
  const evList = event instanceof GameEvent ? event.list : null;
  if (!event || evList == null) return null;
  const list = rawCommandList(evList);
  for (let i = 0; i < list.length; i++) {
    if (!(list[i]!.code === 108 && String(list[i]!.parameters[0]).toLowerCase() === "begin " + markup.toLowerCase())) continue;
    if (parameterList == null) parameterList = [];
    for (let j = i + 1; j < list.length; j++) {
      if (list[j]!.code !== 108) return parameterList;
      const parts = String(list[j]!.parameters[0]).split(/\s+/).filter((p) => p !== "");
      if (parts.length === 1 || parts[0]!.toLowerCase() === "begin") return parameterList;
      // NOTE (Ruby parity): an empty comment line has no parts; parts[0] is nil
      // and `nil.downcase` raises (009_Sprite_DynamicShadows.rb:236).
      if (parts.length === 0) throw new TypeError("undefined method `downcase' for nil:NilClass");
      const n = rubyToI(parts[1]!);
      if (n !== 0 || parts[1] === "0") {
        parameterList.push(n);
      } else {
        parameterList.push(parts[1]!);
      }
      if (maxParamNumber !== 0 && j === i + maxParamNumber) return parameterList;
    }
  }
  return parameterList;
}

/** String#to_i */
function rubyToI(s: string): number {
  const m = /^\s*([-+]?\d+)/.exec(s.replace(/_(?=\d)/g, ""));
  return m ? Number(m[1]) : 0;
}

/** A shadow source: [event, anglemin?, anglemax?, distancemax?, opacity?] */
export type ShadowParams = unknown[];

/** Sprite_Shadow (Sprite_Ombre) < RPG::Sprite */
export class SpriteShadow {
  readonly sprite: Sprite;
  private animations: SpriteAnimations;
  private source: unknown;
  private anglemin: number;
  private anglemax: number;
  private selfOpacity: number;
  private distancemax: number;
  private tileId: number | null = null;
  private characterName: string | null = null;
  private characterHue: number | null = null;
  private chbitmap: Bitmap | null = null;
  private cw = 0;
  private ch = 0;
  private angleTrigo = 0;

  constructor(readonly viewport: Viewport | null, public character: GameCharacter, params: ShadowParams = [],
              private tileBitmap: (tileId: number) => Bitmap | null = () => null) {
    this.sprite = new Sprite(viewport);
    this.animations = new SpriteAnimations(this);
    this.source = params[0];
    this.anglemin = params.length > 1 ? (params[1] as number) : 0;
    this.anglemax = params.length > 2 ? (params[2] as number) : 0;
    this.selfOpacity = params.length > 4 ? (params[4] as number) : 100;
    this.distancemax = params.length > 3 ? (params[3] as number) : 350;
    this.update();
  }

  dispose(): void {
    // (@chbitmap is a shared cached bitmap here.)
    this.animations.dispose();
    this.sprite.dispose();
  }

  isDisposed(): boolean { return this.sprite.isDisposed(); }

  update(): void {
    const s = this.sprite;
    if (!this.inRange(this.character, this.source, this.distancemax)) {
      s.opacity = 0;
      return;
    }
    s.update(); // super (RPG::Sprite#update)
    this.animations.update();
    const c = this.character;
    if (this.tileId !== c.tileId || this.characterName !== c.characterName || this.characterHue !== c.characterHue) {
      this.tileId = c.tileId;
      this.characterName = c.characterName;
      this.characterHue = c.characterHue;
      if (this.tileId >= 384) {
        this.chbitmap = this.tileBitmap(this.tileId);
        s.srcRect.set(0, 0, 32, 32);
        this.ch = 32;
        this.cw = 32;
        s.ox = 16;
        s.oy = 32;
      } else {
        const name = c.characterName;
        const hue = c.characterHue;
        // RPG::Cache gives an empty 32x32 bitmap for an empty file name.
        const cached = name === "" ? null : Cache.character(name, hue);
        if (name === "") {
          this.chbitmap = null;
          this.cw = this.ch = 8;
          s.ox = 4;
          s.oy = 8;
        } else if (cached === undefined) {
          // Ruby loads it here; retry once the graphic is in.
          void Cache.ensureCharacter(name, hue).then(() => { if (this.characterName === name) this.characterName = null; });
        }
        if (name !== "") {
          this.chbitmap = cached ?? null;
          this.cw = this.chbitmap ? Math.floor(this.chbitmap.width / 4) : 0;
          this.ch = this.chbitmap ? Math.floor(this.chbitmap.height / 4) : 0;
          s.ox = Math.floor(this.cw / 2);
          s.oy = this.ch;
        }
      }
    }
    s.bitmap = this.chbitmap;
    s.visible = !c.transparent;
    if (this.tileId === 0) {
      const sx = c.pattern * this.cw;
      let sy = ((c.direction - 2) / 2) * this.ch;
      if (s.angle > 90 || s.angle < -90) {
        switch (c.direction) {
          case 2: sy = this.ch * 3; break;
          case 4: sy = this.ch * 2; break;
          case 6: sy = this.ch; break;
          case 8: sy = 0; break;
        }
      }
      s.srcRect.set(sx, sy, this.cw, this.ch);
    }
    s.x = ScreenPosHelper.pbScreenX(c);
    s.y = ScreenPosHelper.pbScreenY(c) - 5;
    s.z = ScreenPosHelper.pbScreenZ(c, this.ch) - 1;
    s.zoomX = ScreenPosHelper.pbScreenZoomX(c);
    s.zoomY = ScreenPosHelper.pbScreenZoomY(c);
    s.blendType = c.blendType;
    s.bushDepth = c.bushDepth;
    if (c.animationId !== 0) {
      const animation = Data.animations.get(c.animationId);
      if (animation) this.animations.animation(animation, true);
      c.animationId = 0;
    }
    const source = this.source as GameCharacter;
    const deltax = ScreenPosHelper.pbScreenX(source) - s.x;
    const deltay = ScreenPosHelper.pbScreenY(source) - s.y;
    s.color = new Color(0, 0, 0);
    const distance = deltax ** 2 + deltay ** 2;
    s.opacity = Math.max(0, Math.min(255, Math.floor((this.selfOpacity * 13_000) / (Math.floor((distance * 370) / this.distancemax) + 6000))));
    s.angle = 57.3 * Math.atan2(deltax, deltay);
    this.angleTrigo = s.angle + 90;
    if (this.angleTrigo < 0) this.angleTrigo += 360;
    if (this.anglemin !== 0 || this.anglemax !== 0) {
      if ((this.angleTrigo < this.anglemin || this.angleTrigo > this.anglemax) && this.anglemin < this.anglemax) {
        s.opacity = 0;
        return;
      }
      if (this.angleTrigo < this.anglemin && this.angleTrigo > this.anglemax && this.anglemin > this.anglemax) {
        s.opacity = 0;
        return;
      }
    }
  }

  /** in_range? (From Near's Anti Lag Script, edited) */
  inRange(element: GameCharacter, object: unknown, range: number): boolean {
    if (!(object && typeof (object as GameCharacter).screenX === "function")) {
      // NOTE (Ruby parity): see SpriteCharacter#setShadows; Ruby raises here.
      throw new TypeError(`undefined method \`screen_x' for ${Array.isArray(object) ? "Array" : String(object)}`);
    }
    const elemScreenX = ScreenPosHelper.pbScreenX(element);
    const elemScreenY = ScreenPosHelper.pbScreenY(element);
    const objScreenX = ScreenPosHelper.pbScreenX(object as GameCharacter);
    const objScreenY = ScreenPosHelper.pbScreenY(object as GameCharacter);
    const x = (elemScreenX - objScreenX) * (elemScreenX - objScreenX);
    const y = (elemScreenY - objScreenY) * (elemScreenY - objScreenY);
    const r = x + y;
    return r <= range * range;
  }
}

/** Spriteset_Map's @shadows: [event, params...] for each "begin Shadow Source" event of the map. */
export function shadowSourcesOf(map: GameMap): ShadowParams[] {
  const shadows: ShadowParams[] = [];
  let warn = false;
  for (const k of [...map.events.keys()].sort((a, b) => a - b)) {
    const ev = map.events.get(k)!;
    const list = ev.list ? rawCommandList(ev.list) : null;
    if (list && ev.list!.length > 0 && list[0]!.code === 108 &&
        (list[0]!.parameters[0] === "s" || list[0]!.parameters[0] === "o")) {
      // (Ruby compares the whole parameters array to ["s"] / ["o"].)
      warn = true;
    }
    const params = XPML_read(map, "Shadow Source", ev, 4);
    if (params) shadows.push([ev, ...params]);
  }
  if (warn) console.warn("Warning : At least one event on this map uses the obsolete way to add shadows");
  return shadows;
}
