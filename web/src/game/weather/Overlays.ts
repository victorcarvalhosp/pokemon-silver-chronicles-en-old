// Port of 012_Overworld/001_Overworld visuals/002_Overworld_Overlays.rb: the
// location signpost shown on entering a map (LocationWindow, and the
// :show_location_window handler from 012_Overworld/001_Overworld.rb) and the
// light effects of events named "Light", "Light(file)", "OutdoorLight" and
// "OutdoorLight(file)" (LightEffect*, :add_light_effects, which also gives
// every map its Particle_Engine). DarknessSprite is in
// game/field/DarknessSprite.ts.

import type { MapData } from "../../data/types";
import type { Viewport } from "../../rgss/display";
import { Sprite, Viewport as RgssViewport } from "../../rgss/display";
import { Bitmap } from "../../rgss/Bitmap";
import { Graphics } from "../../rgss/Graphics";
import { Rect } from "../../rgss/types";
import { FRAME_RATE, FrameCounter } from "../../ui/frameTime";
import { pbGetMapNameFromId } from "../../ui/planes";
import { preloadBitmaps, pbResolveBitmap, RPGCache } from "../../ui/rpgCache";
import { IconSprite } from "../../ui/SpriteWrapper";
import { Window_AdvancedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { ParticleEngine, preloadParticleGraphics } from "../../sprites/ParticleEngine";
import { ScreenPosHelper } from "../../sprites/ScreenPosHelper";
import { PBDayNight } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import { TILE_HEIGHT } from "../GameCharacter";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import { preloadWeatherGraphics } from "./Weather";

/** Settings::NO_SIGNPOSTS: pairs of map IDs between which no signpost shows. */
const NO_SIGNPOSTS: number[] = [];

//===============================================================================
// Location signpost
//===============================================================================
export class LocationWindow {
  private window: Window_AdvancedTextPokemon;
  private currentmap: number;
  private frames = 0;
  /** Ruby's update runs once per 40 fps frame. */
  private clock = new FrameCounter();

  constructor(name: string) {
    this.window = new Window_AdvancedTextPokemon(name);
    this.window.resizeToFit(name, Graphics.width);
    this.window.x = 0;
    this.window.y = -this.window.height;
    this.window.viewport = new RgssViewport(0, 0, Graphics.width, Graphics.height);
    this.window.viewport.z = 99999;
    this.currentmap = G.gameMap!.mapId;
  }

  isDisposed(): boolean {
    return this.window.isDisposed();
  }

  dispose(): void {
    // NOTE (Ruby parity): the window's viewport is never disposed
    // (002_Overworld_Overlays.rb:10); an empty viewport draws nothing.
    this.window.dispose();
  }

  update(): void {
    for (let n = this.clock.tick(); n > 0; n--) this.updateFrame();
  }

  private updateFrame(): void {
    if (this.window.isDisposed()) return;
    this.window.update();
    if (G.gameTemp.messageWindowShowing || this.currentmap !== G.gameMap!.mapId) {
      this.window.dispose();
      return;
    }
    if (this.frames > FRAME_RATE * 2) {
      this.window.y -= 4;
      if (this.window.y + this.window.height < 0) this.window.dispose();
    } else {
      if (this.window.y < 0) this.window.y += 4;
      this.frames += 1;
    }
  }
}

// Show location signpost.
EventHandlers.add("on_map_or_spriteset_change", "show_location_window", (scene, mapChanged) => {
  const s = scene as { spriteset?(): { addUserSprite(sprite: LocationWindow): void } | undefined } | null;
  if (!s || !s.spriteset?.()) return;
  if (!mapChanged || !mapMetadata(G.gameMap!.mapId)?.announceLocation) return;
  let nosignpost = false;
  const mapTrail = (G.pokemonGlobal as unknown as { mapTrail?: number[] }).mapTrail;
  if (mapTrail?.[1]) {
    for (let i = 0; i < Math.floor(NO_SIGNPOSTS.length / 2); i++) {
      if (NO_SIGNPOSTS[2 * i] === mapTrail[1] && NO_SIGNPOSTS[2 * i + 1] === G.gameMap!.mapId) nosignpost = true;
      if (NO_SIGNPOSTS[2 * i + 1] === mapTrail[1] && NO_SIGNPOSTS[2 * i] === G.gameMap!.mapId) nosignpost = true;
      if (nosignpost) break;
    }
    if ((G.gameMap as unknown as GameMap).name === pbGetMapNameFromId(mapTrail[1])) nosignpost = true;
  }
  if (!nosignpost) s.spriteset!()!.addUserSprite(new LocationWindow((G.gameMap as unknown as GameMap).name));
});

//===============================================================================
// Light effects
//===============================================================================
// Only tiles and characters get pbDayNightTint, so a light's glow keeps its
// colours at night.
export class LightEffect {
  protected light: Sprite;
  protected event: GameEvent | null;
  protected map: GameMap | null;
  protected disposed = false;

  constructor(event: GameEvent, viewport: Viewport | null = null, map: GameMap | null = null, filename: string | null = null, light?: Sprite) {
    if (light) {
      this.light = light;
    } else {
      const icon = new IconSprite(0, 0, viewport);
      if (filename && pbResolveBitmap("Graphics/Pictures/" + filename)) {
        icon.setBitmapFile("Graphics/Pictures/" + filename);
      } else {
        icon.setBitmapFile("Graphics/Pictures/LE");
      }
      this.light = icon;
    }
    this.light.z = 1000;
    this.event = event;
    this.map = map ?? (G.gameMap as unknown as GameMap);
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.light.dispose();
    this.map = null;
    this.event = null;
    this.disposed = true;
  }

  update(): void {
    this.light.update();
  }
}

export class LightEffect_Lamp extends LightEffect {
  constructor(event: GameEvent, viewport: Viewport | null = null, map: GameMap | null = null) {
    const lamp = RPGCache.loadBitmap("Graphics/Pictures/LE");
    const light = new Sprite(viewport);
    light.setBitmap(new Bitmap(128, 64));
    const srcRect = new Rect(0, 0, 64, 64);
    if (lamp) {
      light.bitmap!.blt(0, 0, lamp, srcRect);
      light.bitmap!.blt(20, 0, lamp, srcRect);
    }
    light.visible = true;
    super(event, viewport, map, null, light);
    this.light.z = 1000;
  }
}

export class LightEffect_Basic extends LightEffect {
  constructor(event: GameEvent, viewport: Viewport | null = null, map: GameMap | null = null, filename: string | null = null) {
    super(event, viewport, map, filename);
    this.light.ox = Math.floor((this.light.bitmap?.width ?? 0) / 2);
    this.light.oy = Math.floor((this.light.bitmap?.height ?? 0) / 2);
    this.light.opacity = 100;
  }

  override update(): void {
    if (!this.light || !this.event) return;
    super.update();
    this.light.x = ScreenPosHelper.pbScreenX(this.event);
    this.light.y = ScreenPosHelper.pbScreenY(this.event) - Math.floor((this.event.height * TILE_HEIGHT) / 2);
    this.light.zoomX = ScreenPosHelper.pbScreenZoomX(this.event);
    this.light.zoomY = this.light.zoomX;
    this.light.tone = G.gameScreen.tone;
  }
}

export class LightEffect_DayNight extends LightEffect {
  constructor(event: GameEvent, viewport: Viewport | null = null, map: GameMap | null = null, filename: string | null = null) {
    super(event, viewport, map, filename);
    this.light.ox = Math.floor((this.light.bitmap?.width ?? 0) / 2);
    this.light.oy = Math.floor((this.light.bitmap?.height ?? 0) / 2);
  }

  override update(): void {
    if (!this.light || !this.event) return;
    super.update();
    let shade = Math.floor(PBDayNight.getShade());
    if (shade >= 144) { // If light enough, call it fully day
      shade = 255;
    } else if (shade <= 64) { // If dark enough, call it fully night
      shade = 0;
    } else {
      shade = 255 - Math.floor((255 * (144 - shade)) / (144 - 64));
    }
    this.light.opacity = 255 - shade;
    if (this.light.opacity > 0) {
      this.light.x = ScreenPosHelper.pbScreenX(this.event);
      this.light.y = ScreenPosHelper.pbScreenY(this.event) - Math.floor((this.event.height * TILE_HEIGHT) / 2);
      this.light.zoomX = ScreenPosHelper.pbScreenZoomX(this.event);
      this.light.zoomY = ScreenPosHelper.pbScreenZoomY(this.event);
      const t = G.gameScreen.tone;
      this.light.tone.set(t.red, t.green, t.blue, t.gray);
    }
  }
}

EventHandlers.add("on_new_spriteset_map", "add_light_effects", (spriteset, viewport) => {
  const ss = spriteset as { map: GameMap; addUserSprite(s: { update(): void; dispose(): void; isDisposed(): boolean }): void };
  const vp = viewport as Viewport;
  const map = ss.map; // Map associated with the spriteset (not necessarily the current map)
  for (const ev of map.events.values()) {
    let m: RegExpExecArray | null;
    if ((m = /^outdoorlight\((\w+)\)$/i.exec(ev.name))) {
      ss.addUserSprite(new LightEffect_DayNight(ev, vp, map, m[1]!));
    } else if (/^outdoorlight$/i.test(ev.name)) {
      ss.addUserSprite(new LightEffect_DayNight(ev, vp, map));
    } else if ((m = /^light\((\w+)\)$/i.exec(ev.name))) {
      ss.addUserSprite(new LightEffect_Basic(ev, vp, map, m[1]!));
    } else if (/^light$/i.test(ev.name)) {
      ss.addUserSprite(new LightEffect_Basic(ev, vp, map));
    }
  }
  ss.addUserSprite(new ParticleEngine(vp, map));
});

/**
 * The graphics the overlays read synchronously in Ruby: weather and particle
 * graphics (once) and the map's light graphics. Awaited by prepareMap.
 */
export async function preloadOverworldVisuals(map: MapData): Promise<void> {
  const paths = ["Graphics/Pictures/LE"];
  for (const ev of map.events) {
    const m = /^(?:outdoor)?light\((\w+)\)$/i.exec(ev.name);
    if (m) paths.push("Graphics/Pictures/" + m[1]);
  }
  await Promise.all([preloadWeatherGraphics(), preloadParticleGraphics(), preloadBitmaps(paths)]);
}
