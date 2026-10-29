// Port of 003_Game processing/001_StartGame.rb's Game.initialize (the rest is in Game.ts).

import { loadAssetIndex } from "../core/assets";
import { Data, loadGameData, setMapConnections } from "../data/store";
import { setMetadata } from "./metadata";
import "./scripts/overworld";
import "./scripts/messages";
import "./scripts/scenes";
import "./save/values";
import "./scripts/menus";
import "./scripts/pauseMenu";
import "./scripts/phone";
import "./scripts/pokemon";
import "./scripts/infoScreens";
import "./scripts/partyBag";
import "./scripts/moveRoute";
import "./scripts/fieldMoves";
import "./scripts/pc";
import "./battle/scripts";
import "./following";
import "./speedUp";
import { GameData } from "../data/gameData";
import { loadQuestData } from "./quests";
import { initMessageSystem } from "../ui/messageConfig";

async function pbs<T>(file: string): Promise<T> {
  const res = await fetch(`/data/pbs/${file}`);
  if (!res.ok) throw new Error(`Missing data/pbs/${file}; run pnpm pbs`);
  return (await res.json()) as T;
}

/** Game.initialize: loads the data every scene relies on. */
export async function initializeGame(): Promise<void> {
  await Promise.all([loadGameData(), loadAssetIndex()]);
  await Promise.all([initMessageSystem(), loadQuestData()]);
  await GameData.loadAll(); // GameData.load_all (PBS data: species, items, trainers...)
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

