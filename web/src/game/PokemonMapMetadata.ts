// Port of PokemonMapMetadata (012_Overworld/002_Overworld_Metadata.rb): state
// that lasts while the player stays on a map (erased/moved events, Strength).

import type { GameMap } from "./GameMap";
import { G } from "./globals";

export class PokemonMapMetadata {
  erasedEvents: Record<string, boolean> = {};
  /** "map,event" -> [x, y, direction, through] */
  movedEvents: Record<string, [number, number, number, boolean]> = {};
  strengthUsed = false;
  blackFluteUsed = false;
  whiteFluteUsed = false;

  clear(): void {
    this.erasedEvents = {};
    this.movedEvents = {};
    this.strengthUsed = false;
    this.blackFluteUsed = false;
    this.whiteFluteUsed = false;
  }

  addErasedEvent(eventID: number): void {
    this.erasedEvents[`${G.gameMap!.mapId},${eventID}`] = true;
  }

  addMovedEvent(eventID: number): void {
    const map = G.gameMap as unknown as GameMap;
    const event = map.events.get(eventID);
    if (event) this.movedEvents[`${map.mapId},${eventID}`] = [event.x, event.y, event.direction, event.through];
  }

  updateMap(): void {
    const map = G.gameMap as unknown as GameMap;
    for (const [key, erased] of Object.entries(this.erasedEvents)) {
      const [mapId, eventId] = key.split(",").map(Number) as [number, number];
      if (mapId === map.mapId && erased) map.events.get(eventId)?.erase();
    }
    for (const [key, moved] of Object.entries(this.movedEvents)) {
      const [mapId, eventId] = key.split(",").map(Number) as [number, number];
      const event = map.events.get(eventId);
      if (mapId === map.mapId && moved && event) {
        event.moveto(moved[0], moved[1]);
        switch (moved[2]) {
          case 2: event.turnDown(); break;
          case 4: event.turnLeft(); break;
          case 6: event.turnRight(); break;
          case 8: event.turnUp(); break;
        }
      }
      // Ruby applies `through` even for other maps' entries; with no event it raises, so guard.
      if (event && moved?.[3]) event.through = moved[3];
    }
  }
}
