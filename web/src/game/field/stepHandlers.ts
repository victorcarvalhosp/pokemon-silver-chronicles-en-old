// The constant and per-step checks of 012_Overworld/001_Overworld.rb:1-160
// that no other module ports: the Pokérus countdown, the low battery warning,
// walking happiness, field poison (and pbCheckAllFainted), soot gathering
// and the grass rustle animation. (:cue_bgm_after_delay is in mapAudio.ts,
// :auto_move_player in overworld.ts, the encounter/step plumbing in
// GamePlayer.ts and encounters/visibleEncounters.ts.) Also pbPokerus? and
// pbFacingTileRegular.

import { _INTL } from "../../core/intl";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { terrainTag } from "../../data/gameData/terrainTag";
import { Color } from "../../rgss/types";
import { pbFadeOutIn } from "../../ui/fades";
import { pbMessage } from "../../ui/messages";
import { pbStartOver } from "../battle/startOver";
import { pbGetTimeNow } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import type { GameCharacter } from "../GameCharacter";
import type { GameMap } from "../GameMap";
import { pbBGMFade, pbBGSFade } from "../GameSystem";
import { G } from "../globals";
import { rand } from "../../core/random";
import type { PokemonMapFactory } from "../MapFactory";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";
import { defineScript } from "../scriptApi";

const player = () => G.player as unknown as Player | null;
const factory = () => G.mapFactory as unknown as PokemonMapFactory;
type Global = { pokerusTime?: Date | string | null; happinessSteps?: number; stepcount?: number };
const global = () => G.pokemonGlobal as unknown as Global;
const isMapScene = () => typeof (G.scene as { transferPlayer?: unknown } | null)?.transferPlayer === "function";

//===============================================================================
// Constant checks
//===============================================================================
// Pokérus check
// NOTE (Ruby parity): nothing ever sets $PokemonGlobal.pokerusTime (it starts
// nil, 002_Overworld_Metadata.rb:105), so this returns straight away and
// Pokérus never counts down to its cured stage (001_Overworld.rb:5-16).
EventHandlers.add("on_frame_update", "pokerus_counter", () => {
  const p = player();
  if (!p) return;
  const lastValue = global().pokerusTime;
  if (!lastValue) return;
  const last = new Date(lastValue);
  const now = pbGetTimeNow();
  if (last.getFullYear() !== now.getFullYear() || last.getMonth() !== now.getMonth() || last.getDate() !== now.getDate()) {
    for (const pkmn of p.pokemonParty()) pkmn.lowerPokerusCount();
    global().pokerusTime = now;
  }
});

/**
 * Returns whether the Poké Center should explain Pokérus to the player, if a
 * healed Pokémon has it.
 */
export function pbPokerus(): boolean {
  if (G.gameSwitches.get(Settings.SEEN_POKERUS_SWITCH)) return false;
  return (player()?.party ?? []).some((i) => i.pokerusStage() === 1);
}

// System.power_state: the Battery Status API, where the browser has it.
const powerState: { discharging: boolean; seconds: number | null; percent: number | null } = { discharging: false, seconds: null, percent: null };
type BatteryManager = EventTarget & { charging: boolean; dischargingTime: number; level: number };
const nav = (typeof navigator !== "undefined" ? navigator : null) as (Navigator & { getBattery?: () => Promise<BatteryManager> }) | null;
void nav?.getBattery?.().then((b) => {
  const read = () => {
    powerState.discharging = !b.charging;
    powerState.seconds = Number.isFinite(b.dischargingTime) ? b.dischargingTime : null;
    powerState.percent = Math.round(b.level * 100);
  };
  read();
  for (const e of ["chargingchange", "dischargingtimechange", "levelchange"]) b.addEventListener(e, read);
}).catch(() => {});

export function pbBatteryLow(): boolean {
  const pstate = powerState;
  // If it's not discharging, it doesn't matter if it's low
  if (!pstate.discharging) return false;
  // Check for less than 10m, priority over the percentage
  // Some laptops (Chromebooks, Macbooks) have very long lifetimes
  if (pstate.seconds != null && pstate.seconds <= 600) return true;
  // Check for <=15%
  if (pstate.percent != null && pstate.percent <= 15) return true;
  return false;
}

EventHandlers.add("on_frame_update", "low_battery_warning", async () => {
  const t = G.gameTemp as unknown as { warnedLowBattery?: boolean; inMenu: boolean; inBattle: boolean; messageWindowShowing: boolean };
  if (t.warnedLowBattery || !pbBatteryLow()) return;
  if (t.inMenu || t.inBattle || (G.gamePlayer as unknown as GameCharacter).moveRouteForcing ||
      t.messageWindowShowing || G.gameSystem.mapInterpreter.running()) return;
  if (pbGetTimeNow().getSeconds() !== 0) return;
  t.warnedLowBattery = true;
  await pbMessage(_INTL("The game has detected that the battery is low. You should save soon to avoid losing your progress."));
});

//===============================================================================
// Checks per step
//===============================================================================
// Party Pokémon gain happiness from walking
EventHandlers.add("on_player_step_taken", "gain_happiness", () => {
  const g = global();
  if (!g.happinessSteps) g.happinessSteps = 0;
  g.happinessSteps += 1;
  if (g.happinessSteps < 128) return;
  for (const pkmn of player()!.ableParty()) {
    if (rand(2) === 0) pkmn.changeHappiness("walking");
  }
  g.happinessSteps = 0;
});

/** pbFlash(color, frames) (001_Game_Screen.rb:153) */
function pbFlash(color: Color, frames: number): void {
  G.gameScreen?.startFlash(color, frames / 20);
}

// Poison party Pokémon
EventHandlers.add("on_player_step_taken_can_transfer", "poison_party", async (handled) => {
  // handled is an array: [nil]. If [true], a transfer has happened because of
  // this event, so don't do anything that might cause another one
  const h = handled as (boolean | null)[];
  if (h[0]) return;
  if (!Settings.POISON_IN_FIELD || (global().stepcount ?? 0) % 4 !== 0) return;
  let flashed = false;
  for (const pkmn of player()!.ableParty()) {
    if (pkmn.status !== "POISON" || pkmn.hasAbility("IMMUNITY")) continue;
    if (!flashed) {
      pbFlash(new Color(255, 0, 0, 128), 8);
      flashed = true;
    }
    if (pkmn.hp > 1 || Settings.POISON_FAINT_IN_FIELD) pkmn.hp -= 1;
    if (pkmn.hp === 1 && !Settings.POISON_FAINT_IN_FIELD) {
      pkmn.status = "NONE";
      await pbMessage(_INTL("{1} survived the poisoning.\\nThe poison faded away!\x01", pkmn.name));
      continue;
    } else if (pkmn.hp === 0) {
      pkmn.changeHappiness("faint");
      pkmn.status = "NONE";
      await pbMessage(_INTL("{1} fainted...", pkmn.name));
    }
    if (player()!.ablePokemonCount() === 0) {
      h[0] = true;
      await pbCheckAllFainted();
    }
  }
});

export async function pbCheckAllFainted(): Promise<void> {
  if (player()!.ablePokemonCount() === 0) {
    await pbMessage(_INTL("You have no more Pokémon that can fight!\x01"));
    await pbMessage(_INTL("You blacked out!"));
    pbBGMFade(1.0);
    pbBGSFade(1.0);
    await pbFadeOutIn(() => pbStartOver());
  }
}

// Gather soot from soot grass
EventHandlers.add("on_step_taken", "pick_up_soot", (event) => {
  const e = event as GameCharacter;
  const thistile = factory().getRealTilePos(e.map.mapId, e.x, e.y);
  if (!thistile) return;
  const map: GameMap = factory().getMap(thistile[0]);
  for (const i of [2, 1, 0]) {
    const tileId = map.tile(thistile[1], thistile[2], i);
    if (tileId == null) continue;
    if (terrainTag(map.terrainTags[tileId] ?? 0).id !== "SootGrass") continue;
    if (e === (G.gamePlayer as unknown as GameCharacter) && G.bag.has(Item.get("SOOTSACK").id)) {
      const p = player()!;
      const oldSoot = p.soot;
      p.soot += 1;
      if (p.soot > oldSoot) (G.stats as GameStats).sootCollected += p.soot - oldSoot;
    }
    map.eraseTile(thistile[1], thistile[2], i);
    break;
  }
});

// Show grass rustle animation
EventHandlers.add("on_step_taken", "grass_rustling", (event) => {
  if (!isMapScene()) return;
  const e = event as GameCharacter & { mapId?: number };
  // event.each_occupied_tile
  for (let x = e.x; x < e.x + e.width; x++) {
    for (let y = e.y - e.height + 1; y <= e.y; y++) {
      if (!factory().getTerrainTagFromCoords(e.map.mapId, x, y, true).showsGrassRustle) continue;
      const spriteset = (G.scene as unknown as { spriteset(id: number): { addUserAnimation(id: number, x: number, y: number, tinting: boolean, height: number): unknown } | undefined })
        .spriteset(e.mapId ?? e.map.mapId);
      spriteset?.addUserAnimation(Settings.GRASS_ANIMATION_ID, x, y, true, 1);
    }
  }
});

/** NOTE: Assumes the event is 1x1 tile in size. Only returns one tile. */
export function pbFacingTileRegular(direction: number | null = null, event: GameCharacter | null = null): [number, number, number] {
  event ??= G.gamePlayer as unknown as GameCharacter | null;
  if (!event) return [0, 0, 0];
  const x = event.x;
  const y = event.y;
  direction ??= event.direction;
  const xOffset = [0, -1, 0, 1, -1, 0, 1, -1, 0, 1][direction]!;
  const yOffset = [0, 1, 1, 1, 0, 0, 0, -1, -1, -1][direction]!;
  return [G.gameMap!.mapId, x + xOffset, y + yOffset];
}

defineScript("pbPokerus?", () => pbPokerus());
defineScript("pbPokerus", () => pbPokerus());
defineScript("pbCheckAllFainted", () => pbCheckAllFainted());
defineScript("pbBatteryLow?", () => pbBatteryLow());
