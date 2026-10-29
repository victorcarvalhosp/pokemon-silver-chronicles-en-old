// Port of Plugins/Visible Overworld Wild Encounters (derFischae, v20.0.0.5):
//   001_visible overworld wild encounters script.rb
//   004_add_on_max_spawn.rb
//   005_add_on_additional_despawn_methods.rb
// with this game's settings. Wild Pokémon spawn near the player as events
// (Game_PokeEvent) that wander about; touching one starts the battle. They
// vanish after some steps, when far away, or after some seconds.
//
// Ruby builds each PokeEvent's command list out of script strings (pbStoreTemp-
// ForBattle, the encounter's temp data, pbCheckBattleAllowed,
// pbSingleOrDoubleWildBattle, ...); the port builds the same list as event
// command JSON, so the Interpreter runs it like any other event.
//
// Saving: Essentials marshals $map_factory with its events, so spawned
// Pokémon are in the save and come back on load (the plugin's "remove on
// load/save" add-on isn't installed). Here they're their own save value,
// re-spawned after Game.load rebuilds the maps.

import type { Command, Expr } from "../../data/events";
import { EncounterType } from "../../data/gameData/encounterType";
import type { Id } from "../../data/gameData/gameData";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { terrainTag } from "../../data/gameData/terrainTag";
import type { EventPage, MapEvent } from "../../data/types";
import type { SceneMap } from "../../scenes/SceneMap";
import { Cache } from "../../sprites/cache";
import { pbGetMapNameFromId } from "../../ui/planes";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import { rand } from "../../core/random";
import { pbGetTimeNow } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import { FRAME_RATE } from "../GameCharacter";
import { GameEvent } from "../GameEvent";
import { GameMap } from "../GameMap";
import { setOnStepTaken, type GamePlayer } from "../GamePlayer";
import { G } from "../globals";
import type { PokemonMapFactory } from "../MapFactory";
import { mapMetadata } from "../metadata";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import { SaveData } from "../save/SaveData";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";
import { setBattleRule, WildBattle } from "../battle/BattleStarting";
import {
  pbBattleOnStepTaken, pbGenerateWildPokemon, pbInBugContest, pbInSafari, pbPokeRadarOnShakingGrass,
  PokemonEncounters, pokemonEncounters,
} from "./PokemonEncounters";

//===============================================================================
//                             Settings
//===============================================================================
export const VisibleEncounterSettings = {
  //------------- SPAWN RATE AND SPAWN PROPABILITY ------------
  /** <= 0 only overworld encounters, >= 100 only instant battles (percent). */
  INSTANT_WILD_BATTLE_PROPABILITY: 0,
  //--------------- SPAWN POSITION ------------------
  /** The maximum range from the player a PokeEvent will be able to spawn. */
  SPAWN_RANGE: 4,
  /** Water encounters pop up if and only if the player is surfing. */
  RESTRICT_ENCOUNTERS_TO_PLAYER_MOVEMENT: true,
  /** Whether Pokémon on water won't spawn in the border. */
  NO_SPAWN_ON_BORDER: false,
  //---------------- GRAPHICS OF SPAWNED POKEMON -------------------
  /** [alt_form, female, shiny]: whether those have their own overworld sprites. */
  SPRITES: [true, true, true],
  /** Overworld encounters have a stop animation, like following Pokémon. */
  USE_STEP_ANIMATION: true,
  //------------------- MOVEMENT OF SPAWNED POKEMON -----------------------
  /** [move_speed, move_frequency, move_type]. */
  DEFAULT_MOVEMENT: [3, 3, 1],
  /** [method, value, move_speed, move_frequency, move_type]; nil keeps the value. */
  Enc_Movements: [
    ["shiny?", true, 3, 4, null], // shiny encounters will be faster
    ["species", "SLOWPOKE", 1, 1, null], // slowpoke is very slow
    ["nature", "NAUGHTY", null, 4, 3], // naughty ones run to the player, faster
  ] as [string, unknown, number | null, number | null, number | null][],
  //--------------- BATTLING SPAWNED POKEMON ------------------
  /** Whether you can battle a water Pokémon from the shore. */
  BATTLE_WATER_FROM_SHORE: false,
  //--------------- VANISHING OF SPAWNED POKEMON AFTER STEPS -------------------
  DEFAULT_STEPS_BEFORE_VANISH: 10,
  /** [method, value, extra steps]. */
  Add_Steps_Before_Vanish: [
    ["shiny?", true, 8], // shiny Pokémon stay 8 steps longer
    ["species", "PIDGEY", -2], // pidgeys will be gone faster (2 steps earlier)
  ] as [string, unknown, number][],
  // --- 004_add_on_max_spawn.rb ---
  /** Max number of spawned Pokémon at the same time (<= 0: no maximum). */
  DEFAULT_MAX_SPAWN: 6,
  /** [map id, limit] exceptions. */
  MAP_MAX_SPAWN: [[4, 5]] as [number, number][],
  // --- 005_add_on_additional_despawn_methods.rb ---
  REMOVE_DISTANCED: true,
  /** Max distance on screen (tiles) before vanishing; <= 0 means infinite. */
  DISTANCE_VANISH: 16,
  DISTANCE_VANISH_SHINY: 30,
  REMOVE_PROLONGED: true,
  /** Seconds randomly added to or taken from the time before vanishing. */
  SECONDS_VARIATION: 5,
  SECONDS_BEFORE_VANISH: 25,
  SECONDS_BEFORE_VANISH_SHINY: 50,
};
const S = VisibleEncounterSettings;

declare module "../globals" {
  interface PokemonGlobalMetadata {
    creatingSpawningPokemon?: boolean;
    battlingSpawnedPokemon?: boolean;
    /** Roaming Pokémon (005_Overworld_RoamingPokemon.rb, not ported): [index, species, level, BGM]. */
    roamEncounter?: unknown[] | null;
    roamedAlready?: boolean;
  }
  interface GameTemp {
    roamerIndexForEncounter?: number | null;
    VOWERoamEncounter?: unknown[] | null;
    VOWERoamerIndex?: number | null;
    VOWENextBattleBGM?: unknown;
    VOWEForceSingleBattle?: boolean | null;
    VOWEEncounterType?: Id | null;
  }
}

declare module "../GameMap" {
  interface GameMap {
    spawnPokeEvent(x: number, y: number, pokemon: Pokemon): GamePokeEvent;
    removeThisEventfromMap(id: number): void;
  }
}

declare module "./PokemonEncounters" {
  interface PokemonEncounters {
    encounterTypeOnTile(x: number, y: number): Id | null;
    encounterPossibleHereOnTile(x: number, y: number): boolean;
    encounterTriggeredOnTile(encType: Id, repelActive?: boolean, triggeredByStep?: boolean): boolean;
    haveDoubleWildBattleOnTile(x: number, y: number, mapId: number): boolean;
  }
}

const player = () => G.player as unknown as Player;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
const factory = () => G.mapFactory as unknown as PokemonMapFactory | null;
const sceneMap = () => {
  const s = G.scene as unknown as SceneMap | null;
  return s && typeof s.spriteset === "function" ? s : null;
};

//===============================================================================
// 0. PART: BUG FIX FOR ONCHANGEDIRECTION
// ChangeDirection will be considered as taking a step.
//===============================================================================
EventHandlers.remove("on_player_change_direction", "trigger_encounter");
EventHandlers.add("on_player_change_direction", "trigger_encounter", () => {
  if (G.gameTemp.inMenu) return;
  const repelActive = (G.pokemonGlobal.repel ?? 0) > 0;
  if (pbBattleOrSpawnOnStepTaken(repelActive)) {
    // STANDARD WILD BATTLE. Turning happens inside the player's movement code,
    // which can't wait for a battle: it runs at the player's await point.
    gamePlayer().queueBlocking(() => pbBattleOnStepTaken(repelActive));
  } else {
    pbSpawnOnStepTaken(repelActive); // OVERWORLD ENCOUNTERS
  }
});

//===============================================================================
// 1. PART: SPAWNING THE OVERWORLD ENCOUNTER
//===============================================================================

/**
 * pbOnStepTaken (replaces 012_Overworld/001_Overworld.rb's): wild encounters
 * on taking a step are either an instant battle or a spawned PokeEvent.
 */
export async function pbOnStepTaken(eventTriggered: boolean): Promise<void> {
  const p = gamePlayer();
  if (p.moveRouteForcing || G.gameSystem.mapInterpreter.running()) {
    EventHandlers.triggerSync("on_step_taken", p);
    return;
  }
  const g = G.pokemonGlobal;
  g.stepcount = ((g.stepcount ?? 0) + 1) & 0x7fffffff;
  const repelActive = (g.repel ?? 0) > 0;
  EventHandlers.triggerSync("on_player_step_taken");
  const handled: (boolean | null)[] = [null];
  EventHandlers.triggerSync("on_player_step_taken_can_transfer", handled);
  if (handled[0]) return;
  if (!eventTriggered && !G.gameTemp.inMenu) {
    if (pbBattleOrSpawnOnStepTaken(repelActive)) await pbBattleOnStepTaken(repelActive); // STANDARD WILD BATTLE
    else pbSpawnOnStepTaken(repelActive); // OVERWORLD ENCOUNTERS
  }
  G.gameTemp.encounterTriggered = false; // This info isn't needed here
}

setOnStepTaken(pbOnStepTaken);

/** pbBattleOrSpawnOnStepTaken: true with the probability of an instant encounter. */
export function pbBattleOrSpawnOnStepTaken(_repelActive: boolean): boolean {
  return rand(100) < S.INSTANT_WILD_BATTLE_PROPABILITY || pbPokeRadarOnShakingGrass();
}

/** pbSpawnOnStepTaken as the max spawn add-on wraps it: no more spawns past the map's limit. */
export function pbSpawnOnStepTaken(repelActive: boolean): boolean | void {
  let maxSpawn = S.DEFAULT_MAX_SPAWN;
  const currentRegion = pbGetCurrentRegion();
  const currentMapName = gameMap().name;
  if (S.MAP_MAX_SPAWN && S.MAP_MAX_SPAWN.length > 0) {
    for (const [mapId, limit] of S.MAP_MAX_SPAWN) {
      if (mapId !== gameMap().mapId) {
        const meta = MapMetadata.tryGet(mapId);
        if (!meta || !meta.townMapPosition || meta.townMapPosition[0] !== currentRegion) continue;
        if (pbGetMapNameFromId(mapId) !== currentMapName) continue;
      }
      maxSpawn = limit;
      break;
    }
  }
  if (maxSpawn > 0 && pbCountPokeEvent() >= maxSpawn) return false;
  spawnOnStepTaken(repelActive);
}

/** The plugin's own pbSpawnOnStepTaken, working almost like pbBattleOnStepTaken. */
function spawnOnStepTaken(repelActive: boolean): void {
  if (player().ablePokemonCount() === 0) return; // check if trainer has pokemon
  // First we choose a tile near the player
  const pos = pbChooseTileOnStepTaken();
  if (!pos) return;
  const enc = pokemonEncounters();
  const encounterType = enc.encounterTypeOnTile(pos[0], pos[1]);
  if (!encounterType) return;
  if (!enc.encounterTriggeredOnTile(encounterType, repelActive, true)) return;
  const t = G.gameTemp;
  t.encounterType = encounterType;
  const encounter = enc.chooseWildPokemon(encounterType);
  G.pokemonGlobal.creatingSpawningPokemon = true;
  EventHandlers.triggerSync("on_wild_species_chosen", encounter);
  if (enc.allowEncounter(encounter, repelActive)) {
    const pokemon = pbGenerateWildPokemon(encounter![0], encounter![1]);
    // trigger event on spawning of pokemon
    EventHandlers.triggerSync("on_wild_pokemon_created_for_spawning", pokemon);
    pbPlaceEncounter(pos[0], pos[1], pokemon);
    t.encounterType = null;
    t.encounterTriggered = true;
  }
  t.forceSingleBattle = false;
  EventHandlers.triggerSync("on_wild_pokemon_created_for_spawning_end");
  G.pokemonGlobal.creatingSpawningPokemon = false;
}

/** pbChooseTileOnStepTaken: a tile on a square ring around the player, if it's possible to spawn on. */
export function pbChooseTileOnStepTaken(): [number, number] | null {
  const x = gamePlayer().x;
  const y = gamePlayer().y;
  const range = S.SPAWN_RANGE;
  const i = rand(range);
  const r = rand((i + 1) * 8);
  let newX: number, newY: number;
  if (r <= (i + 1) * 2) {
    newX = x - i - 1 + r;
    newY = y - i - 1;
  } else if (r <= (i + 1) * 6 - 2) {
    newX = [x + i + 1, x - i - 1][r % 2]!;
    newY = y - i + Math.floor((r - 1 - (i + 1) * 2) / 2);
  } else {
    newX = x - i + r - (i + 1) * 6;
    newY = y + i + 1;
  }
  if (pbTileIsPossible(newX, newY)) return [newX, newY];
  return null;
}

/** pbTileIsPossible: whether a Pokémon can spawn on the tile. */
export function pbTileIsPossible(x: number, y: number): boolean {
  const map = gameMap();
  if (!map.valid(x, y)) return false; // check if the tile is on the map
  const tileTerrainTag = map.terrainTag(x, y);
  for (const event of map.events.values()) if (event.x === x && event.y === y) return false;
  // check if it's a valid grass, water or cave etc. tile
  if (tileTerrainTag.ice) return false;
  if (tileTerrainTag.ledge) return false;
  if (tileTerrainTag.waterfall) return false;
  if (tileTerrainTag.waterfallCrest) return false;
  if (tileTerrainTag.id === "Rock") return false;
  if (S.RESTRICT_ENCOUNTERS_TO_PLAYER_MOVEMENT) {
    if (!tileTerrainTag.canSurf && G.pokemonGlobal.surfing) return false;
    if (tileTerrainTag.canSurf && !G.pokemonGlobal.surfing) return false;
  }
  if (tileTerrainTag.canSurf) {
    for (const i of [2, 1, 0]) {
      const tileId = map.tile(x, y, i);
      if (tileId == null || tileId < 0) return false;
      if (tileId === 0) continue;
      const terrain = terrainTag(map.terrainTags[tileId] ?? 0);
      const passage = map.passages[tileId] ?? 0;
      const priority = map.priorities[tileId] ?? 0;
      if (terrain.canSurf) break;
      // Ignore if tile above water
      if (passage !== 0) return false;
      if (priority === 0 && !terrain.ignorePassability) return false;
    }
  } else if (!map.passableStrict(x, y, 0)) {
    return false;
  }
  if (!pokemonEncounters().encounterPossibleHereOnTile(x, y)) return false;
  return true;
}

/** pbPlaceEncounter: adds the Pokémon to the map on (x, y) as a PokeEvent. */
export function pbPlaceEncounter(x: number, y: number, pokemon: Pokemon): void {
  const f = factory();
  if (!f) gameMap().spawnPokeEvent(x, y, pokemon);
  else f.getMap(gameMap().mapId).spawnPokeEvent(x, y, pokemon);
  pbPlayCryOnOverworld(pokemon.species, pokemon.form); // Play the pokemon cry of encounter
}

/** can_surf_freely (011_TerrainTag.rb) */
const canSurfFreely = (t: ReturnType<typeof terrainTag>) => !!t.canSurf && !t.waterfall && !t.waterfallCrest;

PokemonEncounters.prototype.encounterTypeOnTile = function (this: PokemonEncounters, x: number, y: number): Id | null {
  const time = pbGetTimeNow();
  let ret: Id | null = null;
  if (canSurfFreely(gameMap().terrainTag(x, y))) {
    ret = this.findValidEncounterTypeForTime("Water", time);
  } else { // Land/Cave (can have both in the same map)
    if (this.hasLandEncounters() && gameMap().terrainTag(x, y).landWildEncounters) {
      if (pbInBugContest() && this.hasEncounterType("BugContest")) ret = "BugContest";
      // (This game's edit checks the player's tile for TallGrass here, not the spawn tile.)
      if (!ret && gameMap().terrainTag(gamePlayer().x, gamePlayer().y).idNumber === 10) {
        ret = this.findValidEncounterTypeForTime("TallGrass", time);
      } else if (!ret) {
        ret = this.findValidEncounterTypeForTime("Land", time);
      }
    }
    if (!ret && this.hasCaveEncounters()) ret = this.findValidEncounterTypeForTime("Cave", time);
  }
  return ret;
};

/** encounter_possible_here_on_tile?: encounter_possible_here? at any coordinates. */
PokemonEncounters.prototype.encounterPossibleHereOnTile = function (this: PokemonEncounters, x: number, y: number): boolean {
  const map = gameMap();
  const tileTerrainTag = map.terrainTag(x, y);
  if (canSurfFreely(tileTerrainTag)) {
    if (S.NO_SPAWN_ON_BORDER) {
      if (!canSurfFreely(map.terrainTag(x + 1, y))) return false;
      if (!canSurfFreely(map.terrainTag(x - 1, y))) return false;
      if (!canSurfFreely(map.terrainTag(x, y + 1))) return false;
      if (!canSurfFreely(map.terrainTag(x, y - 1))) return false;
    }
    return true;
  }
  if (tileTerrainTag.ice) return false;
  if (this.hasCaveEncounters()) return true; // i.e. this map is a cave
  if (this.hasLandEncounters() && tileTerrainTag.landWildEncounters) return true;
  return false;
};

/** encounter_triggered_on_tile?: add-ons may overwrite this. */
PokemonEncounters.prototype.encounterTriggeredOnTile = function (this: PokemonEncounters, encType: Id, repelActive = false): boolean {
  return pokemonEncounters().encounterTriggered(encType, repelActive, true);
};

/** have_double_wild_battle_on_tile?: have_double_wild_battle? for the PokeEvent's tile. */
PokemonEncounters.prototype.haveDoubleWildBattleOnTile = function (this: PokemonEncounters, x: number, y: number, mapId: number): boolean {
  if (G.gameTemp.forceSingleBattle) return false;
  if (pbInSafari()) return false;
  if (G.pokemonGlobal.partner) return true;
  if (player().ablePokemonCount() <= 1) return false;
  const f = factory();
  const tag = f ? f.getTerrainTag(mapId, x, y) : gameMap().terrainTag(x, y);
  return !!tag.doubleWildEncounters && rand(100) < 30;
};

//===============================================================================
// Game_PokeEvent: a Game_Event that holds the spawned Pokémon
//===============================================================================

/** What the event's commands put back when it starts (the temp data at spawn time). */
interface SpawnParams {
  roamEncounter: unknown[] | null;
  roamerIndex: number | null;
  nextBattleBGM: unknown;
  forceSingleBattle: boolean | null;
  encounterType: Id | null;
}

export class GamePokeEvent extends GameEvent {
  /** The original Pokémon. */
  pokemon!: Pokemon;
  /** Remaining steps of the overworld encounter before vanishing. */
  remainingSteps = S.DEFAULT_STEPS_BEFORE_VANISH;
  /** Frames the encounter has existed (counted in the original 40 fps; see update). */
  frameCount = 0;
  spawnParams!: SpawnParams;

  /** increase_steps: vanish once out of steps. */
  override increaseSteps(): void {
    if (this.remainingSteps <= 0) {
      this.removeThisEventfromMap();
    } else {
      this.remainingSteps -= 1;
      super.increaseSteps();
    }
  }

  /** update, with the additional despawn methods add-on (distance and time). */
  override async update(): Promise<void> {
    await super.update();
    if (G.gameTemp.inMenu) return;
    // REMOVE DISTANCED
    if (S.REMOVE_DISTANCED) {
      const sx = Math.abs(this.screenX() - gamePlayer().screenX());
      const sy = Math.abs(this.screenY() - gamePlayer().screenY());
      const distance = Math.max(sx, sy);
      if (this.pokemon.shiny && S.DISTANCE_VANISH_SHINY > 0 && distance >= S.DISTANCE_VANISH_SHINY * 32) {
        this.removeThisEventfromMap();
      } else if (S.DISTANCE_VANISH > 0 && distance >= S.DISTANCE_VANISH * 32) {
        this.removeThisEventfromMap();
      }
    }
    // REMOVE PROLONGED (Ruby counts frames against seconds * Graphics.frame_rate;
    // the extra time is rerolled every frame, as in Ruby)
    if (S.REMOVE_PROLONGED) {
      const varTime = S.SECONDS_VARIATION;
      const extraTime = rand(varTime * 2) + 1 - varTime;
      const time = this.pokemon.shiny ? S.SECONDS_BEFORE_VANISH_SHINY : S.SECONDS_BEFORE_VANISH;
      if (time > 0 && this.frameCount > (time + extraTime) * FRAMES_PER_SECOND) this.removeThisEventfromMap();
    }
    this.frameCount += 1;
  }

  /** removeThisEventfromMap: takes this PokeEvent (and its sprite) off whichever map has it. */
  removeThisEventfromMap(): void {
    const current = gameMap();
    if (current.events.get(this.id) === this) {
      removeSprite(current.mapId, this);
      current.events.delete(this.id);
      return;
    }
    const f = factory();
    if (!f) throw new Error("Actually, this should not be possible");
    for (const map of f.maps) {
      if (map.events.get(this.id) !== this) continue;
      removeSprite(map.mapId, this);
      map.events.delete(this.id);
      break;
    }
  }

  override saveState(): Record<string, unknown> {
    return { ...super.saveState(), remainingSteps: this.remainingSteps, frameCount: this.frameCount };
  }
}

/** Graphics.frame_rate: frameCount counts updates, which run at the logic rate. */
const FRAMES_PER_SECOND = FRAME_RATE;

function removeSprite(mapId: number, ev: GameEvent): void {
  sceneMap()?.spriteset(mapId)?.removeCharacter(ev);
}

function addSprite(map: GameMap, ev: GameEvent): void {
  sceneMap()?.spriteset(map.mapId)?.addCharacter(ev);
}

// Event command builders (Compiler::push_script / push_branch)
const call = (fn: string, ...args: Expr[]): Command => ({ cmd: "call", fn, args });
const assign = (target: string, value: Expr): Command => ({ cmd: "assign", target, op: "=", value, args: [] });
const callOn = (on: Expr, fn: string, ...args: Expr[]): Expr => ({ call: fn, on, args });

/** RPG::Event.new(x, y) with one page, as spawnPokeEvent fills it in. */
function pokeEventData(id: number, x: number, y: number, mapId: number, characterName: string, pokemon: Pokemon, params: SpawnParams): MapEvent {
  let [moveSpeed, moveFrequency, moveType] = S.DEFAULT_MOVEMENT as [number, number, number];
  for (const move of S.Enc_Movements) {
    if (pokemonMethod(pokemon, move[0]) === move[1]) {
      if (move[2]) moveSpeed = move[2];
      if (move[3]) moveFrequency = move[3];
      if (move[4]) moveType = move[4];
    }
  }
  // $map_factory.getMap(<map>).events[<id>]
  const self: Expr = { call: "[]", on: callOn(callOn({ call: "$map_factory" }, "getMap", mapId), "events"), args: [id] };
  const list: Command[] = [
    // - stores temp data when the PokeEvent is triggered
    call("pbStoreTempForBattle"),
    // - sets the roamer and encounter type data from when it spawned
    assign("$PokemonGlobal.roamEncounter", (params.roamEncounter as Expr) ?? null),
    assign("$game_temp.roamer_index_for_encounter", params.roamerIndex),
    assign("$PokemonGlobal.nextBattleBGM", (params.nextBattleBGM as Expr) ?? null),
    assign("$game_temp.force_single_battle", params.forceSingleBattle),
    assign("$game_temp.encounter_type", params.encounterType),
    // - a branch to check if the player can battle water Pokémon from the ground
    {
      cmd: "if", cond: { script: { call: "pbCheckBattleAllowed" } }, then: [
        assign("$PokemonGlobal.battlingSpawnedPokemon", true),
        call("pbSingleOrDoubleWildBattle", callOn(callOn(self, "map"), "map_id"), callOn(self, "x"), callOn(self, "y"), callOn(self, "pokemon")),
        assign("$PokemonGlobal.battlingSpawnedPokemon", false),
        call("pbResetTempAfterBattle"),
        // - removes this PokeEvent from the map
        { cmd: "call", fn: "removeThisEventfromMap", on: callOn({ call: "$map_factory" }, "getMap", mapId), args: [id] },
      ],
    },
    // - resets the temp data (if not allowed to battle a water Pokémon from the shore)
    call("pbResetTempAfterBattle"),
  ];
  const page: EventPage = {
    condition: { switch1: null, switch2: null, variable: null, selfSwitch: null },
    graphic: { tileId: 0, characterName, characterHue: 0, direction: 2, pattern: 0, opacity: 255, blendType: 0 },
    moveType,
    moveSpeed,
    moveFrequency,
    // move_route.list[0].code = 10 (move toward player), then the end command
    moveRoute: { repeat: true, skippable: false, list: [{ move: "towardPlayer" }] },
    walkAnime: true,
    stepAnime: S.USE_STEP_ANIMATION,
    directionFix: false,
    through: false,
    alwaysOnTop: false,
    trigger: 2,
    list,
  };
  return { id, name: "", x, y, pages: [page] };
}

/** pokemon.method(name).call for the settings tables (shiny?, species, nature, ...). */
function pokemonMethod(pokemon: Pokemon, name: string): unknown {
  switch (name) {
    case "shiny?": return pokemon.shiny;
    case "species": return pokemon.species;
    case "nature": return pokemon.nature?.id ?? null;
  }
  const v = (pokemon as unknown as Record<string, unknown>)[name.replace(/\?$/, "")];
  return typeof v === "function" ? (v as () => unknown).call(pokemon) : v;
}

/** Game_Map#spawnPokeEvent */
GameMap.prototype.spawnPokeEvent = function (this: GameMap, x: number, y: number, pokemon: Pokemon, restore?: { id: number; params: SpawnParams }): GamePokeEvent {
  const keyId = restore?.id ?? Math.max(-1, ...this.events.keys()) + 1;
  // Graphic of the event
  const form = pokemon.form;
  const gender = pokemon.gender;
  const shiny = pokemon.shiny;
  const graphicForm = S.SPRITES[0] && form != null ? form : 0;
  const graphicGender = S.SPRITES[1] && gender != null ? gender : 0;
  const graphicShiny = S.SPRITES[2] && shiny != null ? shiny : false;
  const fname = owSpriteFilenameWithWater(x, y, pokemon.species, graphicForm, graphicGender, graphicShiny).replace("Graphics/Characters/", "");
  void Cache.ensureCharacter(fname);
  const t = G.gameTemp;
  const g = G.pokemonGlobal;
  const params: SpawnParams = restore?.params ?? {
    roamEncounter: g.roamEncounter ?? null,
    roamerIndex: t.roamerIndexForEncounter ?? null,
    nextBattleBGM: g.nextBattleBGM ?? null,
    forceSingleBattle: t.forceSingleBattle ?? null,
    encounterType: t.encounterType ?? null,
  };
  // Creating and adding the Game_PokeEvent
  const gameEvent = new GamePokeEvent(this.mapId, pokeEventData(keyId, x, y, this.mapId, fname, pokemon, params), this);
  gameEvent.moveto(x, y);
  gameEvent.pokemon = pokemon;
  gameEvent.spawnParams = params;
  if (!restore) {
    for (const [stepMethod, stepValue, stepCount] of S.Add_Steps_Before_Vanish) {
      if (pokemonMethod(pokemon, stepMethod) === stepValue) gameEvent.remainingSteps += stepCount;
    }
  }
  this.events.set(keyId, gameEvent);
  // Updating the sprites
  addSprite(this, gameEvent);
  return gameEvent;
} as GameMap["spawnPokeEvent"];

/** Game_Map#removeThisEventfromMap(id): lets an overworld Pokémon disappear after battling. */
GameMap.prototype.removeThisEventfromMap = function (this: GameMap, id: number): void {
  const ev = this.events.get(id);
  if (!ev) return;
  removeSprite(this.mapId, ev);
  this.events.delete(id);
};

/** ow_sprite_filename_with_water: the overworld sprite (swimming/levitating ones on water). */
export function owSpriteFilenameWithWater(x: number, y: number, species: Id, form = 0, gender = 0, shiny = false, shadow = false): string {
  const waterTile = canSurfFreely(gameMap().terrainTag(x, y));
  const params = { species, form, gender, shiny, shadow, dmax: false, gmax: false, celestial: false };
  const check = (sub: string) => SpeciesFiles.checkGraphicFile("Graphics/Characters/", params, sub);
  let fname: string | null = null;
  if (waterTile && shiny) fname = check("Swimming Shiny");
  if (waterTile && shiny && !fname) fname = check("Levitates Shiny");
  if (waterTile && !fname) fname = check("Swimming");
  if (waterTile && !fname) fname = check("Levitates");
  if (!fname) fname = check("Followers");
  if (!fname) fname = "Graphics/Characters/Followers/000.png";
  return fname;
}

/** pbStoreTempForBattle: temp data to restore after battling an overworld Pokémon. */
export function pbStoreTempForBattle(): void {
  const t = G.gameTemp;
  t.VOWERoamEncounter = G.pokemonGlobal.roamEncounter ?? null;
  t.VOWERoamerIndex = t.roamerIndexForEncounter ?? null;
  t.VOWENextBattleBGM = G.pokemonGlobal.nextBattleBGM;
  t.VOWEForceSingleBattle = t.forceSingleBattle ?? null;
  t.VOWEEncounterType = t.encounterType ?? null;
}

/** pbResetTempAfterBattle: puts the temp data back to before. */
export function pbResetTempAfterBattle(): void {
  const t = G.gameTemp;
  G.pokemonGlobal.roamEncounter = t.VOWERoamEncounter ?? null;
  t.roamerIndexForEncounter = t.VOWERoamerIndex ?? null;
  G.pokemonGlobal.nextBattleBGM = t.VOWENextBattleBGM ?? null;
  t.forceSingleBattle = t.VOWEForceSingleBattle ?? null;
  t.encounterType = t.VOWEEncounterType ?? null;
}

/** pbCheckBattleAllowed: no battle with a water Pokémon from the ground (BATTLE_WATER_FROM_SHORE). */
export function pbCheckBattleAllowed(): boolean {
  const encType = EncounterType.tryGet(G.gameTemp.encounterType ?? null);
  // the pokemon encounter battle won't happen if it is in the water and the player is not surfing
  if (!G.pokemonGlobal.surfing && encType?.type === "water" && S.BATTLE_WATER_FROM_SHORE === false) return false;
  return true;
}

/** pbSingleOrDoubleWildBattle(map_id, x, y, pokemon) */
export async function pbSingleOrDoubleWildBattle(mapId: number, x: number, y: number, pokemon: Pokemon): Promise<void> {
  const t = G.gameTemp;
  const enc = pokemonEncounters();
  if (enc.haveDoubleWildBattleOnTile(x, y, mapId)) {
    const encounter2 = enc.chooseWildPokemon(t.encounterType!);
    EventHandlers.triggerSync("on_wild_species_chosen", encounter2);
    setBattleRule("double");
    await WildBattle.start([pokemon, encounter2!], true);
  } else {
    await WildBattle.start([pokemon], true);
  }
  t.encounterType = null;
  t.encounterTriggered = true;
}

/** pbPlayCryOnOverworld(pokemon or species, form, volume = 30, pitch = 100) */
export function pbPlayCryOnOverworld(pokemon: Pokemon | Id | null, form: number | null = 0, volume = 30, pitch = 100): void {
  if (!pokemon || pitch <= 0) return;
  form ??= 0;
  if (pokemon instanceof Pokemon) {
    if (!pokemon.egg()) SpeciesFiles.playCryFromPokemon(pokemon, volume, pitch);
  } else {
    SpeciesFiles.playCryFromSpecies(pokemon, form, volume, pitch);
  }
}

//===============================================================================
// Add-on: max spawn — counting spawned Pokémon
//===============================================================================
/** pbCountPokeEvent: spawned events on all loaded maps. */
export function pbCountPokeEvent(): number {
  let n = 0;
  const maps = factory()?.maps ?? [gameMap()];
  for (const map of maps) for (const ev of map.events.values()) if (ev instanceof GamePokeEvent) n += 1;
  return n;
}

/** pbCountPokeEventInMap: spawned events on the current map. */
export function pbCountPokeEventInMap(): number {
  let n = 0;
  for (const ev of gameMap().events.values()) if (ev instanceof GamePokeEvent) n += 1;
  return n;
}

/** pbGetCurrentRegion(default = -1) (019_Utilities/001_Utilities.rb) */
function pbGetCurrentRegion(defaultRegion = -1): number {
  if (!G.gameMap) return defaultRegion;
  const pos = mapMetadata(gameMap().mapId)?.townMapPosition;
  return pos ? pos[0]! : defaultRegion;
}

//===============================================================================
// 4. PART: ROAMING POKEMON
// (Roaming Pokémon aren't ported; this keeps the plugin's hooks for them.)
//===============================================================================

/** pbRoamingMethodAllowed: uses the encounter type of the chosen tile, not the player's. */
export function pbRoamingMethodAllowed(roamerMethod: number): boolean {
  const encType = G.gameTemp.encounterType;
  const type = encType ? EncounterType.get(encType).type : "none";
  switch (roamerMethod) {
    case 0: return ["land", "cave", "water"].includes(type); // Any step-triggered method (except Bug Contest)
    case 1: return ["land", "cave"].includes(type); // Walking (except Bug Contest)
    case 2: return type === "water"; // Surfing
    case 3: return type === "fishing"; // Fishing
    case 4: return type === "water" || type === "fishing"; // Water-based
  }
  return false;
}

// Sets roamed_already to true after one roamer spawned.
EventHandlers.add("on_wild_pokemon_created_for_spawning_end", "roamer_spawned", () => {
  const t = G.gameTemp;
  if (t.roamerIndexForEncounter != null && G.pokemonGlobal.roamEncounter != null) {
    G.pokemonGlobal.roamEncounter = null;
    G.pokemonGlobal.roamedAlready = true;
    t.roamerIndexForEncounter = null;
  }
});

//===============================================================================
// Event scripts
//===============================================================================
defineScript("pbStoreTempForBattle", () => pbStoreTempForBattle());
defineScript("pbResetTempAfterBattle", () => pbResetTempAfterBattle());
defineScript("pbCheckBattleAllowed", () => pbCheckBattleAllowed());
defineScript("pbSingleOrDoubleWildBattle", (_c, mapId, x, y, pokemon) => pbSingleOrDoubleWildBattle(Number(mapId), Number(x), Number(y), pokemon as Pokemon));
defineScript("pbCountPokeEvent", () => pbCountPokeEvent());
defineScript("pbCountPokeEventInMap", () => pbCountPokeEventInMap());
defineScript("pbPlayCryOnOverworld", (_c, p, form, volume, pitch) => pbPlayCryOnOverworld(p as Pokemon | Id, form as number, (volume as number) ?? 30, (pitch as number) ?? 100));

//===============================================================================
// Saving: the spawned Pokémon on the loaded maps
//===============================================================================
interface SavedPokeEvent {
  mapId: number;
  id: number;
  x: number;
  y: number;
  pokemon: PokemonJSON;
  params: SpawnParams;
  state: Record<string, unknown>;
}

let pendingPokeEvents: SavedPokeEvent[] | null = null;

SaveData.register({
  id: "visible_overworld_encounters",
  save: () => {
    const out: SavedPokeEvent[] = [];
    for (const map of factory()?.maps ?? []) {
      for (const ev of map.events.values()) {
        if (!(ev instanceof GamePokeEvent)) continue;
        out.push({ mapId: map.mapId, id: ev.id, x: ev.x, y: ev.y, pokemon: ev.pokemon.toJSON(), params: ev.spawnParams, state: ev.saveState() });
      }
    }
    return out;
  },
  load: (v) => { pendingPokeEvents = Array.isArray(v) ? (v as SavedPokeEvent[]) : null; },
  newGame: () => { pendingPokeEvents = null; },
});

/** Puts the saved PokeEvents back once Game.load has rebuilt the maps. */
export function restoreSpawnedPokeEvents(): void {
  const saved = pendingPokeEvents;
  pendingPokeEvents = null;
  const f = factory();
  if (!saved || !f) return;
  for (const s of saved) {
    if (!f.hasMap(s.mapId)) continue;
    const map = f.getMap(s.mapId);
    const ev = (map.spawnPokeEvent as unknown as (x: number, y: number, p: Pokemon, r: unknown) => GamePokeEvent)
      .call(map, s.x, s.y, Pokemon.fromJSON(s.pokemon), { id: s.id, params: s.params });
    ev.loadState(s.state);
    ev.remainingSteps = Number(s.state.remainingSteps ?? ev.remainingSteps);
    ev.frameCount = Number(s.state.frameCount ?? 0);
  }
}
