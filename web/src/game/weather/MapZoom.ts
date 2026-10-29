// Port of Plugins/Map Zoom/Map Zoom.rb (Golisopod User, Marin, Luka SJ,
// TechSkylander1518): pbZoomMap(goal, speed, "in"/"out") covers the screen
// with a snapshot of itself, retaken every frame and zoomed around the
// centre; pbDisposeZoomMap removes it. The Photographer uses it.
//
// The plugin's other parts: its pbShowCommands is the one in ui/messages.ts
// (it records $game_temp.cmd_window), and its pbCreateMessageWindow /
// pbDisposeMessageWindow and Scene_Map#call_menu are replaced by plugins that
// load later (Carmaniac's Speech Bubble, DP Pause Menu), so
// $game_temp.message_window and pause_menu_scene stay nil and only the
// command window is hidden from the snapshot. Sprite#center_origins and
// Sprite#zoom= are inlined.

import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { FrameCounter } from "../../ui/frameTime";
import { EventHandlers } from "../eventHandlers";
import { G } from "../globals";
import { defineScript } from "../scriptApi";

export class ZoomMap {
  goal: number;
  speed: number;
  zoom: string;
  private viewport: Viewport;
  private sprites: { map: Sprite } | null;
  /** The zoom steps once per original (40 fps) frame. */
  private clock = new FrameCounter();

  constructor(goal: number, speed: number, zoom = "in") {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.goal = goal;
    this.speed = speed;
    this.zoom = zoom.toLowerCase();
    const map = new Sprite(this.viewport);
    this.sprites = { map };
    map.setBitmap(Graphics.snapToBitmap());
    this.centerOrigins(map);
    map.x = Graphics.width / 2;
    map.y = Graphics.height / 2;
  }

  /** Marin's Sprite#center_origins */
  private centerOrigins(sprite: Sprite): void {
    if (!sprite.bitmap) return;
    sprite.ox = Math.floor(sprite.bitmap.width / 2);
    sprite.oy = Math.floor(sprite.bitmap.height / 2);
  }

  /** Luka's Sprite#zoom */
  get mapZoom(): number {
    return this.sprites?.map.zoomX ?? 1;
  }

  update(): void {
    if (this.sprites) {
      const map = this.sprites.map;
      // NOTE (Ruby parity): the snapshot is everything on screen but this
      // sprite, e.g. the Photographer's camera frame too (Map Zoom.rb:24-37).
      map.bitmap!.clear();
      const messagewindow = G.gameTemp.messageWindow;
      const cmdwindow = G.gameTemp.cmdWindow;
      const pausemenu = G.gameTemp.pauseMenuScene;
      if (messagewindow) messagewindow.visible = false;
      if (cmdwindow) cmdwindow.visible = false;
      pausemenu?.pbHideMenu();
      const old: Bitmap | null = map.bitmap;
      map.setBitmap(Graphics.snapToBitmap());
      // (Ruby drops the old snapshot for the garbage collector.)
      old?.dispose();
      this.centerOrigins(map);
      map.x = Graphics.width / 2;
      map.y = Graphics.height / 2;
      if (messagewindow) messagewindow.visible = true;
      if (cmdwindow) cmdwindow.visible = true;
      pausemenu?.pbShowMenu();
      for (let n = this.clock.tick(); n > 0; n--) {
        switch (this.zoom) {
          case "in":
            if (map.zoomX < this.goal) {
              const altspeed = this.goal - map.zoomX;
              map.zoomX = map.zoomY = map.zoomX + Math.min(this.speed, altspeed);
            }
            break;
          case "out":
            if (map.zoomX > this.goal) {
              const altspeed = map.zoomX - this.goal;
              map.zoomX = map.zoomY = map.zoomX - Math.min(this.speed, altspeed);
            }
            break;
        }
      }
    } else {
      this.dispose();
    }
  }

  dispose(): void {
    if (this.sprites) {
      // pbDisposeSpriteHash: the sprites (Ruby leaves the snapshot to the GC).
      this.sprites.map.bitmap?.dispose();
      this.sprites.map.dispose();
    }
    this.viewport.dispose();
  }
}

export async function pbZoomMap(goal: number, speed: number, zoom = "in"): Promise<void> {
  const current = G.gameTemp.backgroundZoom as ZoomMap | null;
  if (!current) {
    G.gameTemp.backgroundZoom = new ZoomMap(goal, speed, zoom);
    await Graphics.update(); // (ZoomMap#initialize ends with Graphics.update)
  } else {
    current.goal = goal;
    current.speed = speed;
    current.zoom = zoom;
  }
}

export async function pbDisposeZoomMap(): Promise<void> {
  if (G.gameTemp.backgroundZoom) {
    G.gameTemp.backgroundZoom.dispose();
    G.gameTemp.backgroundZoom = null;
  }
  await Graphics.update();
}

EventHandlers.add("on_frame_update", "map_zoom", async () => {
  if (!G.player) return;
  const zoom = G.gameTemp.backgroundZoom;
  if (zoom instanceof ZoomMap) {
    zoom.update();
    if (zoom.goal === 1 && zoom.mapZoom === 1) await pbDisposeZoomMap();
  }
});

defineScript("pbZoomMap", (_c, goal, speed, zoom) => pbZoomMap(Number(goal), Number(speed), zoom == null ? "in" : String(zoom)));
defineScript("pbDisposeZoomMap", () => pbDisposeZoomMap());
