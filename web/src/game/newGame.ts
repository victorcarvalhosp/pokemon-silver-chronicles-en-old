// Port of 003_Game processing/001_StartGame.rb (Game.initialize / start_new).

import { loadAssetIndex } from "../core/assets";
import { Data, loadGameData, setMapConnections } from "../data/store";
import { Interpreter } from "./Interpreter";
import { GamePlayer } from "./GamePlayer";
import { GameScreen } from "./GameScreen";
import { GameSystem } from "./GameSystem";
import { setMapFactoryRef } from "./GameCharacter";
import { G, GameSelfSwitches, GameSwitches, GameTemp, GameVariables, PokemonGlobalMetadata } from "./globals";
import { PokemonMapFactory } from "./MapFactory";
import { setMetadata } from "./metadata";
import { Player } from "./Player";
import type { GameMap } from "./GameMap";
import "./scripts/overworld";
import "./scripts/messages";
import { initMessageSystem } from "../ui/messageConfig";

async function pbs<T>(file: string): Promise<T> {
  const res = await fetch(`/data/pbs/${file}`);
  if (!res.ok) throw new Error(`Missing data/pbs/${file}; run pnpm pbs`);
  return (await res.json()) as T;
}

/** Game.initialize: loads the data every scene relies on. */
export async function initializeGame(): Promise<void> {
  await Promise.all([loadGameData(), loadAssetIndex()]);
  await initMessageSystem();
  const [maps, players, meta, connections] = await Promise.all([
    pbs<unknown>("map-metadata.json"),
    pbs<unknown>("player-metadata.json"),
    pbs<unknown>("metadata.json"),
    pbs<{ map1: number; edge1: string; position1: number; map2: number; edge2: string; position2: number }[]>("map-connections.json"),
  ]);
  setMetadata({ maps, players, metadata: meta });
  setMapConnections(connections.map((c) => [c.map1, c.edge1, c.position1, c.map2, c.edge2, c.position2]));
  if (!Data.system.startMapId) throw new Error("No starting position was set in the map editor.");
}

/** SaveData.load_new_game_values: fresh global state. */
function loadNewGameValues(): void {
  G.gameTemp = new GameTemp();
  G.gameSystem = new GameSystem();
  G.gameSystem.mapInterpreter = new Interpreter(0, true);
  G.gameScreen = new GameScreen();
  G.gameSwitches = new GameSwitches();
  G.gameVariables = new GameVariables();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.player = new Player("Unnamed", "PkMnTRAINER_Male") as never;
  G.gamePlayer = new GamePlayer() as never;
  setMapFactoryRef(() => G.mapFactory as never);
}

/** Game.start_new, minus creating the scene (the caller runs it). */
export function startNewGame(): void {
  loadNewGameValues();
  const factory = new PokemonMapFactory(Data.system.startMapId);
  void factory;
  const p = G.gamePlayer as unknown as GamePlayer;
  p.moveto(Data.system.startX, Data.system.startY);
  p.refresh();
  // TODO(M4): $PokemonEncounters.setup.
  const map = G.gameMap as unknown as GameMap;
  map.autoplay();
  void map.update();
}
