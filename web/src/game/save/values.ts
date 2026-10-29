// The save values from 002_Save data/004_Game_SaveValues.rb (+ the v20.1
// Hotfixes' :stats), in Essentials' registration order, which is also the
// load order: switches load before the map refreshes its event pages.

import { Graphics } from "../../rgss/Graphics";
import { GamePlayer } from "../GamePlayer";
import { GameScreen } from "../GameScreen";
import { GameSystem } from "../GameSystem";
import type { GameMap } from "../GameMap";
import { G, GameSelfSwitches, GameSwitches, GameVariables, PokemonGlobalMetadata, PokemonSystem } from "../globals";
import { Interpreter, type InterpreterState } from "../Interpreter";
import { PokemonMapFactory } from "../MapFactory";
import { Player } from "../Player";
import { PokemonMapMetadata } from "../PokemonMapMetadata";
import { PCItemStorage, type ItemSlot } from "../items/PokemonBag";
import { Mail } from "../pokemon/Mail";
import { SaveData } from "./SaveData";
import { decodeJson, encodeJson, restore, snapshot } from "./snapshot";

const ESSENTIALS_VERSION = "20.1";
const GAME_VERSION = "1.0.0";

type Serializable = { toJSON(): unknown };
type Revivable<T> = { fromJSON(json: unknown): T };

/** Class instances with their own toJSON/fromJSON (from the data model) or plain field copies. */
function saveObject(obj: unknown): unknown {
  if (obj && typeof (obj as Serializable).toJSON === "function") return (obj as Serializable).toJSON();
  return obj && typeof obj === "object" ? snapshot(obj) : obj;
}
function loadObject<T extends object>(cls: (new (...a: never[]) => T) & Partial<Revivable<T>>, json: unknown, make: () => T): T {
  if (typeof cls.fromJSON === "function") return cls.fromJSON(json);
  const obj = make();
  restore(obj, json);
  return obj;
}

SaveData.register({
  id: "frame_count",
  save: () => Graphics.frameCount,
  load: (v) => { Graphics.frameCount = Number(v) || 0; },
  newGame: () => { Graphics.frameCount = 0; },
});

SaveData.register({
  id: "game_system",
  loadInBootup: true,
  save: () => ({ ...snapshot(G.gameSystem, ["mapInterpreter"]), mapInterpreter: (G.gameSystem.mapInterpreter as unknown as Interpreter).saveState() }),
  load: (v) => {
    const system = new GameSystem();
    restore(system, v, ["mapInterpreter"]);
    const interp = new Interpreter(0, true);
    system.mapInterpreter = interp;
    G.gameSystem = system;
    // Resumed once the maps exist (Game.load), since the list may live on a map.
    pendingInterpreter = (v as { mapInterpreter?: InterpreterState | null }).mapInterpreter ?? null;
  },
  newGame: () => {
    G.gameSystem = new GameSystem();
    G.gameSystem.mapInterpreter = new Interpreter(0, true);
  },
});

SaveData.register({
  id: "pokemon_system",
  loadInBootup: true,
  save: () => snapshot(G.pokemonSystem),
  load: (v) => { G.pokemonSystem = new PokemonSystem(); restore(G.pokemonSystem, v); },
  newGame: () => { G.pokemonSystem = new PokemonSystem(); },
});

SaveData.register({
  id: "switches",
  save: () => G.gameSwitches.toJSON(),
  load: (v) => { G.gameSwitches = new GameSwitches(); G.gameSwitches.load(v as boolean[]); },
  newGame: () => { G.gameSwitches = new GameSwitches(); },
});

SaveData.register({
  id: "variables",
  save: () => encodeJson(G.gameVariables.toJSON()),
  load: (v) => { G.gameVariables = new GameVariables(); G.gameVariables.load(decodeJson(v) as unknown[]); },
  newGame: () => { G.gameVariables = new GameVariables(); },
});

SaveData.register({
  id: "self_switches",
  save: () => G.gameSelfSwitches.toJSON(),
  load: (v) => { G.gameSelfSwitches = new GameSelfSwitches(); G.gameSelfSwitches.load(v as [string, boolean][]); },
  newGame: () => { G.gameSelfSwitches = new GameSelfSwitches(); },
});

SaveData.register({
  id: "game_screen",
  save: () => ({ ...snapshot(G.gameScreen, ["pictures"]), pictures: G.gameScreen.pictures.map((p) => snapshot(p)) }),
  load: (v) => {
    const screen = new GameScreen();
    restore(screen, v, ["pictures"]);
    const pics = (v as { pictures?: unknown[] }).pictures ?? [];
    pics.forEach((p, i) => screen.pictures[i] && restore(screen.pictures[i]!, p));
    G.gameScreen = screen;
  },
  newGame: () => { G.gameScreen = new GameScreen(); },
});

/** Map fields events can change (Change Map Settings, fog commands, scrolling). */
const MAP_FIELDS = ["panoramaName", "panoramaHue", "fogName", "fogHue", "fogOpacity", "fogBlendType", "fogZoom", "fogSx", "fogSy", "fogOx", "fogOy", "fogTone", "battlebackName"] as const;

interface SavedMap {
  mapId: number;
  displayX: number;
  displayY: number;
  fields: unknown;
  events: Record<string, Record<string, unknown>>;
}

SaveData.register({
  id: "map_factory",
  save: () => {
    const f = G.mapFactory as unknown as PokemonMapFactory;
    const maps: SavedMap[] = f.maps.map((m) => ({
      mapId: m.mapId,
      displayX: m.displayX,
      displayY: m.displayY,
      fields: snapshot(Object.fromEntries(MAP_FIELDS.map((k) => [k, m[k]]))),
      events: Object.fromEntries([...m.events].map(([id, e]) => [id, e.saveState()])),
    }));
    return { current: G.gameMap!.mapId, maps };
  },
  load: (v) => { pendingMaps = v as { current: number; maps: SavedMap[] }; },
});

SaveData.register({
  id: "game_player",
  save: () => {
    const p = G.gamePlayer as unknown as GamePlayer;
    return { ...p.saveState(), charsetData: p.charsetData, encounterCount: p.encounterCount };
  },
  load: (v) => { pendingPlayer = v as Record<string, unknown>; },
  newGame: () => { G.gamePlayer = new GamePlayer() as never; },
});

SaveData.register({
  id: "global_metadata",
  save: () => snapshot(G.pokemonGlobal),
  load: (v) => {
    G.pokemonGlobal = new PokemonGlobalMetadata();
    restore(G.pokemonGlobal, v);
    // The PC's item storage and mailbox come back as plain objects.
    const g = G.pokemonGlobal;
    if (g.pcItemStorage) g.pcItemStorage = PCItemStorage.fromJSON(g.pcItemStorage as unknown as { items: ItemSlot[] });
    if (g.mailbox) g.mailbox = g.mailbox.map((m) => Mail.fromJSON(m as unknown as Parameters<typeof Mail.fromJSON>[0]));
  },
  newGame: () => { G.pokemonGlobal = new PokemonGlobalMetadata(); },
});

SaveData.register({
  id: "map_metadata",
  save: () => snapshot(pokemonMap()),
  load: (v) => { setPokemonMap(new PokemonMapMetadata()); restore(pokemonMap(), v); },
  newGame: () => { setPokemonMap(new PokemonMapMetadata()); },
});

// :player (replaced in place), :bag, :storage_system and :stats are registered
// by the data model's own module.
import "./modelValues";

SaveData.register({
  id: "essentials_version",
  loadInBootup: true,
  save: () => ESSENTIALS_VERSION,
  load: (v) => { saveEngineVersion = String(v); },
  newGame: () => { saveEngineVersion = ESSENTIALS_VERSION; },
});

SaveData.register({
  id: "game_version",
  loadInBootup: true,
  save: () => GAME_VERSION,
  load: (v) => { saveGameVersion = String(v); },
  newGame: () => { saveGameVersion = GAME_VERSION; },
});

// --- pieces restored by Game.load after the maps are prepared ------------------

let pendingInterpreter: InterpreterState | null = null;
let pendingMaps: { current: number; maps: SavedMap[] } | null = null;
let pendingPlayer: Record<string, unknown> | null = null;
export let saveEngineVersion = ESSENTIALS_VERSION;
export let saveGameVersion = GAME_VERSION;

export function pokemonMap(): PokemonMapMetadata {
  return (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap;
}
function setPokemonMap(m: PokemonMapMetadata): void {
  (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap = m;
}

/** The map the save was made on (for preloading before Game.load). */
export function savedMapId(hash: Record<string, unknown>): number {
  return (hash.map_factory as { current?: number } | undefined)?.current ?? 0;
}

/**
 * Game.load_map: rebuilds the maps from data and puts every event, the
 * player and the running event back where they were.
 */
export function restoreMapState(): void {
  const saved = pendingMaps;
  if (!saved) throw new Error("Save has no map data");
  G.gamePlayer = new GamePlayer() as never;
  const factory = new PokemonMapFactory(saved.current);
  for (const s of saved.maps) {
    const m: GameMap = s.mapId === saved.current ? factory.map : factory.getMap(s.mapId);
    restore(m, s.fields);
    m.displayX = s.displayX;
    m.displayY = s.displayY;
    for (const [id, state] of Object.entries(s.events)) m.events.get(Number(id))?.loadState(state);
  }
  const p = G.gamePlayer as unknown as GamePlayer;
  if (pendingPlayer) {
    p.loadState(pendingPlayer);
    p.charsetData = (pendingPlayer.charsetData as GamePlayer["charsetData"]) ?? null;
    p.encounterCount = Number(pendingPlayer.encounterCount ?? 0);
  }
  const current = factory.map;
  current.displayX = saved.maps.find((m) => m.mapId === saved.current)?.displayX ?? current.displayX;
  current.displayY = saved.maps.find((m) => m.mapId === saved.current)?.displayY ?? current.displayY;
  (G.gameSystem.mapInterpreter as unknown as Interpreter).loadState(pendingInterpreter);
  pendingMaps = null;
  pendingPlayer = null;
  pendingInterpreter = null;
}

/** The save's trainer as an object, without loading it (the load screen's @save_data[:player]). */
export function trainerFromSave(hash: Record<string, unknown>): Player {
  return loadObject(Player, hash.player, () => new Player("Unnamed", ""));
}
