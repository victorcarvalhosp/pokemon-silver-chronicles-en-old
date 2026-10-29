// GameData (Essentials' GameData module): every data class, plus
// GameData.load_all over the JSON compiled from PBS (web/data/pbs/*.json).
//
//   import { GameData } from "../data/gameData";
//   GameData.Species.get("PIKACHU").baseStats.HP
//
// Hardcoded data (GrowthRate, Stat, Nature, Evolution, ...) registers itself
// when this module is imported; the PBS data needs loadAll()/loadAllFrom().

import type {
  AbilityData, BerryPlantData, EncounterData, ItemData, MapMetadataData, MetadataData, MoveData, PhoneData,
  PlayerMetadataData, PowerMoveData, RaidRanks, RegionalDexes, RibbonData, ShadowPokemonData, SpeciesData,
  SpeciesMetricsData, TownMap, TrainerData, TrainerTypeData, TypeData,
} from "../pbs/types";
import { Ability } from "./ability";
import { BattleTerrain } from "./battleTerrain";
import { BattleWeather } from "./battleWeather";
import { BerryPlant } from "./berryPlant";
import { BodyColor } from "./bodyColor";
import { BodyShape } from "./bodyShape";
import { EggGroup } from "./eggGroup";
import { Encounter } from "./encounter";
import { EncounterType } from "./encounterType";
import { Environment } from "./environment";
import { Evolution } from "./evolution";
import { GenderRatio } from "./genderRatio";
import { GrowthRate } from "./growthRate";
import { Habitat } from "./habitat";
import { Item } from "./item";
import { MapMetadata } from "./mapMetadata";
import { Metadata } from "./metadata";
import { setMiscPBSData } from "./miscPBSData";
import { Move } from "./move";
import { Nature } from "./nature";
import { PlayerMetadata } from "./playerMetadata";
import { PowerMove } from "./powerMove";
import { Ribbon } from "./ribbon";
import { ShadowPokemon } from "./shadowPokemon";
import { Species } from "./species";
import { SpeciesMetrics } from "./speciesMetrics";
import { Stat } from "./stat";
import { Status } from "./status";
import { Target } from "./target";
import { Trainer } from "./trainer";
import { TrainerType } from "./trainerType";
import { Type } from "./type";
import { Weather } from "./weather";

export { Effectiveness } from "./type";
export type { Id } from "./gameData";
export { Settings } from "./settings";

export const GameData = {
  // Hardcoded
  GrowthRate, GenderRatio, EggGroup, BodyShape, BodyColor, Habitat, Evolution, Stat, Nature, Status, Weather,
  EncounterType, Environment, BattleWeather, BattleTerrain, Target,
  // PBS
  Type, Ability, Move, Item, BerryPlant, Species, SpeciesMetrics, ShadowPokemon, Ribbon, Encounter, TrainerType,
  Trainer, Metadata, PlayerMetadata, MapMetadata,
  // ZUD Mechanics
  PowerMove,

  /** The JSON files loadAll reads, relative to data/pbs/. */
  FILES: [
    "types.json", "abilities.json", "moves.json", "items.json", "berry-plants.json", "species.json",
    "species-metrics.json", "shadow-pokemon.json", "ribbons.json", "encounters.json", "trainer-types.json",
    "trainers.json", "metadata.json", "player-metadata.json", "map-metadata.json", "power-moves.json",
    "town-map.json", "phone.json", "regional-dexes.json", "raid-ranks.json",
  ],

  /** GameData.load_all from already-read JSON (read(file) returns the parsed file). */
  loadAllFrom(read: (file: string) => unknown): void {
    const list = <T>(file: string) => read(file) as T[];
    const fill = <T>(cls: { DATA: Map<unknown, unknown>; register(h: T): unknown }, file: string) => {
      cls.DATA.clear();
      for (const h of list<T>(file)) cls.register(h);
    };
    fill<TypeData>(Type, "types.json");
    fill<AbilityData>(Ability, "abilities.json");
    fill<MoveData>(Move, "moves.json");
    fill<ItemData>(Item, "items.json");
    fill<BerryPlantData>(BerryPlant, "berry-plants.json");
    fill<SpeciesData>(Species, "species.json");
    fill<SpeciesMetricsData>(SpeciesMetrics, "species-metrics.json");
    fill<ShadowPokemonData>(ShadowPokemon, "shadow-pokemon.json");
    fill<RibbonData>(Ribbon, "ribbons.json");
    fill<EncounterData>(Encounter, "encounters.json");
    fill<TrainerTypeData>(TrainerType, "trainer-types.json");
    fill<TrainerData>(Trainer, "trainers.json");
    Metadata.DATA.clear();
    const meta = read("metadata.json") as MetadataData | MetadataData[];
    for (const m of Array.isArray(meta) ? meta : [meta]) Metadata.register(m);
    fill<PlayerMetadataData>(PlayerMetadata, "player-metadata.json");
    fill<MapMetadataData>(MapMetadata, "map-metadata.json");
    fill<PowerMoveData>(PowerMove, "power-moves.json");
    setMiscPBSData({
      townMap: read("town-map.json") as TownMap,
      phone: read("phone.json") as PhoneData | null,
      regionalDexes: read("regional-dexes.json") as RegionalDexes,
      raidRanks: read("raid-ranks.json") as RaidRanks,
    });
  },

  /** GameData.load_all: fetches data/pbs/*.json (or uses fetchJson) and registers everything. */
  async loadAll(fetchJson: (file: string) => Promise<unknown> = defaultFetch): Promise<void> {
    const files = await Promise.all(GameData.FILES.map(async (f) => [f, await fetchJson(f)] as const));
    const byName = new Map<string, unknown>(files);
    GameData.loadAllFrom((f) => byName.get(f));
  },
};

async function defaultFetch(file: string): Promise<unknown> {
  const res = await fetch(`/data/pbs/${file}`);
  if (!res.ok) throw new Error(`Missing data/pbs/${file}; run pnpm pbs`);
  return res.json();
}

export {
  Ability, BattleTerrain, BattleWeather, BerryPlant, BodyColor, BodyShape, EggGroup, Encounter, EncounterType,
  Environment, Evolution, GenderRatio, GrowthRate, Habitat, Item, MapMetadata, Metadata, Move, Nature,
  PlayerMetadata, PowerMove, Ribbon, ShadowPokemon, Species, SpeciesMetrics, Stat, Status, Target, Trainer,
  TrainerType, Type, Weather,
};
