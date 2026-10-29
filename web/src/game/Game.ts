// Port of 003_Game processing/001_StartGame.rb's Game module: set_up_system,
// start_new, load and save. (Game.initialize is initializeGame in newGame.ts.)

import { Data } from "../data/store";
import { prepareMap } from "../scenes/SceneMap";
import { setMapFactoryRef } from "./GameCharacter";
import type { GameMap } from "./GameMap";
import type { GamePlayer } from "./GamePlayer";
import { pbUpdateVehicle } from "./GamePlayer";
import { G } from "./globals";
import { pbAutoplayOnSave } from "./mapAudio";
import { PokemonMapFactory } from "./MapFactory";
import { SaveData, type SaveHash } from "./save/SaveData";
import { pokemonMap, restoreMapState, savedMapId } from "./save/values";
import "./mapHandlers";

type Stats = { playSessions?: number; setTimeLastSaved?(): void };
const stats = () => (G as unknown as { stats?: Stats }).stats;
const temp = () => G.gameTemp as unknown as { begunNewGame?: boolean; commonEventId: number };

export const Game = {
  /** Game.set_up_system: loads the options and system state from the save, if any. */
  async setUpSystem(): Promise<SaveHash | null> {
    const save = (await SaveData.exists()) ? await SaveData.readFromFile() : null;
    if (!save) SaveData.initializeBootupValues();
    else SaveData.loadBootupValues(save);
    return save;
  },

  async startNew(): Promise<void> {
    const map = G.gameMap as unknown as GameMap | null;
    if (map?.events) for (const e of map.events.values()) e.clearStarting();
    temp().commonEventId = 0;
    temp().begunNewGame = true;
    SaveData.loadNewGameValues();
    const s = stats();
    if (s) s.playSessions = (s.playSessions ?? 0) + 1;
    setMapFactoryRef(() => G.mapFactory as never);
    await prepareMap(Data.system.startMapId);
    new PokemonMapFactory(Data.system.startMapId);
    const p = G.gamePlayer as unknown as GamePlayer;
    p.moveto(Data.system.startX, Data.system.startY);
    p.refresh();
    // TODO(M4): $PokemonEncounters = PokemonEncounters.new; .setup(map id).
    (G.gameMap as unknown as GameMap).autoplay();
    await (G.gameMap as unknown as GameMap).update();
  },

  async load(save: SaveHash): Promise<void> {
    SaveData.loadAllValues(save);
    const s = stats();
    if (s) s.playSessions = (s.playSessions ?? 0) + 1;
    setMapFactoryRef(() => G.mapFactory as never);
    await prepareMap(savedMapId(save));
    // Game.load_map: maps come back from data with the saved event state.
    restoreMapState();
    // TODO(M4): $PokemonEncounters.setup.
    pbUpdateVehicle();
    pbAutoplayOnSave();
    await (G.gameMap as unknown as GameMap).update();
    pokemonMap().updateMap();
  },

  async save(safe = false): Promise<boolean> {
    (G.pokemonGlobal as unknown as { safesave?: boolean }).safesave = safe;
    G.gameSystem.saveCount += 1;
    G.gameSystem.magicNumber = (Data.system as unknown as { magicNumber?: number }).magicNumber ?? 0;
    stats()?.setTimeLastSaved?.();
    try {
      await SaveData.saveToFile();
    } catch (e) {
      console.error(e);
      G.gameSystem.saveCount -= 1;
      return false;
    }
    return true;
  },
};
