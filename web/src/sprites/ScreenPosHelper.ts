// Port of 005_Sprites/013_ScreenPosHelper.rb: where a character is on screen,
// for the sprites drawn over characters (lights, particles, dynamic shadows,
// berry plants).

import { TILE_HEIGHT, TILE_WIDTH, type GameCharacter } from "../game/GameCharacter";
import { Cache } from "./cache";

const heightcache = new Map<string, number>();

export const ScreenPosHelper = {
  pbScreenZoomX(_ch: GameCharacter): number {
    return TILE_WIDTH / 32.0;
  },

  pbScreenZoomY(_ch: GameCharacter): number {
    return TILE_HEIGHT / 32.0;
  },

  pbScreenX(ch: GameCharacter): number {
    return ch.screenX();
  },

  pbScreenY(ch: GameCharacter): number {
    return ch.screenY();
  },

  /** The character sheet's height (Ruby loads it; here it's read from the preloaded cache). */
  bmHeight(bm: string): number {
    let h = heightcache.get(bm);
    if (h === undefined) {
      const bmap = Cache.character(bm, 0);
      if (bmap === undefined) return 0; // not loaded yet: don't cache a wrong height
      h = bmap?.height ?? 0;
      heightcache.set(bm, h);
    }
    return h;
  },

  pbScreenZ(ch: GameCharacter, height: number | null = null): number {
    if (height == null) {
      height = 0;
      if (ch.tileId > 0) {
        height = 32;
      } else if (ch.characterName !== "") {
        height = Math.floor(ScreenPosHelper.bmHeight(ch.characterName) / 4);
      }
    }
    return ch.screenZ(height);
  },
};
