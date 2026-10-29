// The data model's save values from 002_Save data/004_Game_SaveValues.rb
// (:player, :bag, :storage_system) and the v20.1 Hotfixes' :stats
// (load_in_bootup + reset_on_new_game). Imported by values.ts after its own
// registrations: "player" replaces the placeholder in place (staying first),
// the rest append in Essentials' order.

import { TrainerType } from "../../data/gameData/trainerType";
import { G } from "../globals";
import { PokemonBag, type PokemonBagJSON } from "../items/PokemonBag";
import { PokemonStorage, type PokemonStorageJSON } from "../pokemon/PokemonStorage";
import { GameStats } from "../trainer/GameStats";
import { Player, type PlayerJSON } from "../trainer/Player";
import { SaveData } from "./SaveData";

SaveData.register({
  id: "player",
  save: () => (G.player as unknown as Player).toJSON(),
  load: (v) => { G.player = Player.fromJSON(v as PlayerJSON); },
  newGame: () => {
    const trainerType = TrainerType.keys()[0]!;
    G.player = new Player("Unnamed", trainerType);
  },
});

SaveData.register({
  id: "bag",
  save: () => G.bag.toJSON(),
  load: (v) => { G.bag = PokemonBag.fromJSON(v as PokemonBagJSON); },
  newGame: () => { G.bag = new PokemonBag(); },
});

SaveData.register({
  id: "storage_system",
  save: () => G.storage.toJSON(),
  load: (v) => { G.storage = PokemonStorage.fromJSON(v as PokemonStorageJSON); },
  newGame: () => { G.storage = new PokemonStorage(); },
});

SaveData.register({
  id: "stats",
  loadInBootup: true,
  resetOnNewGame: true,
  save: () => G.stats.toJSON(),
  load: (v) => { G.stats = GameStats.fromJSON(v as Record<string, unknown>); },
  newGame: () => { G.stats = new GameStats(); },
});
