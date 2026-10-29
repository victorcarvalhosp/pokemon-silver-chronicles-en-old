// Port of 003_Game processing/001_StartGame.rb's Game module: set_up_system,
// start_new, load and save. (Game.initialize is initializeGame in newGame.ts.)

import { pbChooseLanguage, pbLoadMessages } from "../core/intl";
import { Settings } from "../data/gameData/settings";
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
import { PokemonEncounters, pokemonEncounters, setPokemonEncounters } from "./encounters/PokemonEncounters";
import { restoreSpawnedPokeEvents } from "./encounters/visibleEncounters";
import "./battle/scripts";
import { Graphics } from "../rgss/Graphics";

// 013_Game_Stats.rb: Graphics.update adds delta_s to $stats.play_time once a
// game has started (Ruby checks $PokemonEncounters, set by start_new/load).
Graphics.onUpdate.push(() => {
  const s = stats() as { playTime?: number } | undefined;
  if (s && G.mapFactory) s.playTime = (s.playTime ?? 0) + Graphics.deltaS;
});

type Stats = { playSessions?: number; setTimeLastSaved?(): void };
const stats = () => (G as unknown as { stats?: Stats }).stats;
const temp = () => G.gameTemp as unknown as { begunNewGame?: boolean; commonEventId: number };

export const Game = {
  /** Game.set_up_system: loads the options and system state from the save, if any. */
  async setUpSystem(): Promise<SaveHash | null> {
    const save = (await SaveData.exists()) ? await SaveData.readFromFile() : null;
    if (!save) SaveData.initializeBootupValues();
    else SaveData.loadBootupValues(save);
    // Set language (and choose language if there is no save file)
    if (Settings.LANGUAGES.length >= 2) {
      if (!save) G.pokemonSystem.language = await pbChooseLanguage(Settings.LANGUAGES);
      await pbLoadMessages("Data/" + Settings.LANGUAGES[G.pokemonSystem.language]![1]);
    }
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
    setPokemonEncounters(new PokemonEncounters());
    pokemonEncounters().setup(G.gameMap!.mapId);
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
    restoreSpawnedPokeEvents(); // Visible Overworld Wild Encounters' PokeEvents are part of the maps
    setPokemonEncounters(new PokemonEncounters());
    pokemonEncounters().setup(G.gameMap!.mapId);
    pbUpdateVehicle();
    // Following Pokemon EX's Game.load_map alias (Refresh.rb:177-181)
    const { FollowingPkmn } = await import("./following/FollowingPkmn");
    await FollowingPkmn.refresh(false);
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
