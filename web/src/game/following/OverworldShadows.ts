// Port of Plugins/Overworld Shadows EX (Config.rb + the Game_Character /
// Game_Event / Game_Player half of script.rb). The shadow sprite itself is
// SpriteOWShadow.ts.
//
// The plugin applies to every Sprite_Character, so the player, every map event
// and the followers get a shadow unless the blacklists below rule it out.
//
// Ruby keeps @shows_shadow up to date by aliasing calculate_bush_depth,
// Game_Event#refresh, Game_Player#set_movement_type and transparent=. The
// first three are aliased here the same way; transparent is a plain field in
// the port, so SpriteOWShadow recalculates when it sees it change (and the
// follower factory, which assigns it every frame, recalculates itself).

import type { TerrainTag } from "../../data/gameData/terrainTag";
import { GameCharacter } from "../GameCharacter";
import { GameEvent } from "../GameEvent";
import { GamePlayer } from "../GamePlayer";
import type { GameMap } from "../GameMap";
import { G } from "../globals";

export const OWShadowSettings = {
  /** Make the event/character name blacklists case sensitive. */
  CASE_SENSITIVE_BLACKLISTS: false,
  /** Events whose name contains one of these (as a regex) have no shadow. */
  SHADOWLESS_EVENT_NAME: [
    "door", "nurse", "Healing balls", "Mart", "SmashRock", "StrengthBoulder",
    "CutTree", "HeadbuttTree", "BerryPlant", ".shadowless", ".noshadow", ".sl", "noShadow",
  ],
  /** Characters whose graphic filename contains one of these have no shadow. */
  SHADOWLESS_CHARACTER_NAME: ["nil"],
  /** Characters standing on these terrain tags have no shadow. */
  SHADOWLESS_TERRAIN_NAME: ["Grass", "DeepWater", "StillWater", "Water", "Waterfall", "WaterfallCrest", "Puddle"],
  /** Shadow graphic for events without a shdw(...) in their name. */
  DEFAULT_SHADOW_FILENAME: "defaultShadow",
  /** Shadow graphic for the player. */
  PLAYER_SHADOW_FILENAME: "defaultShadow",
};

/** Character fields the plugin adds attr_readers for (jump_count, jump_distance_left, jump_peak). */
export interface ShadowCaster {
  owShowsShadow?: boolean;
}

/** Game_Character#shows_shadow?(recalc) */
export function showsShadow(ch: GameCharacter, recalc = false): boolean {
  const c = ch as GameCharacter & ShadowCaster;
  if (!recalc) return c.owShowsShadow ?? false;
  if (!ch.characterName || ch.transparent) return false;
  const name = (ch as unknown as { name?: unknown }).name;
  const hasName = ch instanceof GameEvent && typeof name === "string"; // respond_to?(:name)
  if (OWShadowSettings.CASE_SENSITIVE_BLACKLISTS) {
    if (OWShadowSettings.SHADOWLESS_CHARACTER_NAME.some((e) => new RegExp(e).test(ch.characterName))) return false;
  } else {
    if (OWShadowSettings.SHADOWLESS_CHARACTER_NAME.some((e) => new RegExp(e, "i").test(ch.characterName))) return false;
  }
  // Both branches of the plugin match event names case-sensitively.
  if (hasName && OWShadowSettings.SHADOWLESS_EVENT_NAME.some((e) => new RegExp(e).test(name as string))) return false;
  // $game_map.terrain_tag(self.x, self.y): the *current* map, as in the plugin.
  const map = G.gameMap as unknown as GameMap | null;
  const terrain: TerrainTag | null = map ? map.terrainTag(ch.x, ch.y) : null;
  if (terrain && OWShadowSettings.SHADOWLESS_TERRAIN_NAME.some((e) => terrain.id === e)) return false;
  return true;
}

export function updateShowsShadow(ch: GameCharacter): void {
  (ch as GameCharacter & ShadowCaster).owShowsShadow = showsShadow(ch, true);
}

// --- aliases (script.rb) -------------------------------------------------------

type Proto = Record<string, (...args: unknown[]) => unknown>;

// Game_Character#calculate_bush_depth
const charProto = GameCharacter.prototype as unknown as Proto;
const calculateBushDepth = charProto.calculateBushDepth!;
charProto.calculateBushDepth = function (this: GameCharacter, ...args: unknown[]) {
  const ret = calculateBushDepth.apply(this, args);
  updateShowsShadow(this);
  return ret;
};

// Game_Event#refresh
const eventProto = GameEvent.prototype as unknown as Proto;
const eventRefresh = eventProto.refresh!;
eventProto.refresh = function (this: GameEvent, ...args: unknown[]) {
  const ret = eventRefresh.apply(this, args);
  updateShowsShadow(this);
  return ret;
};

// Game_Player#set_movement_type
const playerProto = GamePlayer.prototype as unknown as Proto;
const setMovementType = playerProto.setMovementType!;
playerProto.setMovementType = function (this: GamePlayer, ...args: unknown[]) {
  const ret = setMovementType.apply(this, args);
  updateShowsShadow(this);
  return ret;
};

