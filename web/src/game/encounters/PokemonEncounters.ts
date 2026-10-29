// Port of 012_Overworld/002_Battle triggering/003_Overworld_WildEncounters.rb
// ($PokemonEncounters, pbGenerateWildPokemon, pbEncounter) and
// pbBattleOnStepTaken from 012_Overworld/001_Overworld.rb, with this game's
// edits (TallGrass encounters on terrain tag 10). The Visible Overworld Wild
// Encounters plugin adds to this class in visibleEncounters.ts.
//
// Encounter tables are kept as Ruby's [chance, species, min level, max level]
// arrays, and sorted with Ruby's own sort (rubySort.ts): equal chances can come
// out in a different order than a stable sort, which changes which species a
// given roll picks.

import { DEBUG } from "../../core/debug";
import { Input } from "../../rgss/Input";
import { rand } from "../../core/random";
import { Encounter } from "../../data/gameData/encounter";
import { EncounterType } from "../../data/gameData/encounterType";
import type { Id } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Species } from "../../data/gameData/species";
import { Type } from "../../data/gameData/type";
import { Weather } from "../../data/gameData/weather";
import { PBDayNight, pbGetTimeNow } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import type { GameMap } from "../GameMap";
import type { GamePlayer } from "../GamePlayer";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import { Pokemon } from "../pokemon/Pokemon";
import { pbBalancedLevel } from "../pokemon/utilities";
import type { Player } from "../trainer/Player";
import { rubySortBy } from "./rubySort";
import { EncounterSettings } from "./settings";

/** [chance, species, minimum level, maximum level], as in GameData::Encounter#types. */
export type EncounterEntry = [chance: number, species: Id, minLevel: number, maxLevel: number];
/** [species, level], what choose_wild_pokemon returns. */
export type WildEncounter = [species: Id, level: number];

// Fields other files of the battle-triggering scripts add to Game_Temp and
// PokemonGlobalMetadata (Ruby reopens the classes; TypeScript merges them).
declare module "../globals" {
  interface GameTemp {
    encounterType?: Id | null;
    forceSingleBattle?: boolean | null;
    /** Poké Radar state (013_Items/005_Item_PokeRadar.rb, game/battle/pokeRadar.ts). */
    pokeRadarData?: unknown;
  }
  interface PokemonGlobalMetadata {
    repel?: number;
    stepcount?: number;
    /** [trainer type, name, id, party] of the partner trainer, or nil. */
    partner?: [Id, string, number, Pokemon[]] | null;
    encounterVersion?: number;
  }
}

const player = () => G.player as unknown as Player;
const gameMap = () => G.gameMap as unknown as GameMap;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const pokemonMap = () => (G as unknown as { pokemonMap?: { blackFluteUsed: boolean; whiteFluteUsed: boolean } }).pokemonMap;

/** $PokemonEncounters */
export function pokemonEncounters(): PokemonEncounters {
  const g = G as unknown as { pokemonEncounters?: PokemonEncounters };
  return (g.pokemonEncounters ??= new PokemonEncounters());
}
export function setPokemonEncounters(value: PokemonEncounters | null): void {
  (G as unknown as { pokemonEncounters?: PokemonEncounters | null }).pokemonEncounters = value;
}

// Checks from other script sections, set by their modules (game/battle/
// pokeRadar.ts, bugContest.ts, safari.ts); each default is what Ruby returns
// when the feature is unused.
export const specialBattleHooks = {
  pokeRadarOnShakingGrass: (): boolean => false,
  inBugContest: (): boolean => false,
  inSafari: (): boolean => false,
};
/** pbPokeRadarOnShakingGrass (013_Items/005_Item_PokeRadar.rb): pbPokeRadarGetShakingGrass >= 0. */
export function pbPokeRadarOnShakingGrass(): boolean {
  return specialBattleHooks.pokeRadarOnShakingGrass();
}
/** pbInBugContest? (018_Alternate battle modes/002_BugContest.rb) */
export function pbInBugContest(): boolean {
  return specialBattleHooks.inBugContest();
}
/** pbInSafari? (018_Alternate battle modes/001_SafariZone.rb) */
export function pbInSafari(): boolean {
  return specialBattleHooks.inSafari();
}

export class PokemonEncounters {
  stepCount = 0;
  stepChances: Record<Id, number> = {};
  encounterTables: Record<Id, EncounterEntry[]> = {};
  chanceAccumulator = 0;

  setup(mapID: number): void {
    this.stepCount = 0;
    this.stepChances = {};
    this.encounterTables = {};
    const encounterData = Encounter.get(mapID, G.pokemonGlobal.encounterVersion ?? 0);
    if (encounterData) {
      for (const [type, value] of Object.entries(encounterData.stepChances)) this.stepChances[type] = value;
      // Marshal.load(Marshal.dump(types)): a deep copy, since choose_wild_pokemon sorts in place.
      for (const [type, slots] of Object.entries(encounterData.types)) {
        this.encounterTables[type] = slots.map((s) => [s.chance, s.species, s.minLevel, s.maxLevel]);
      }
    }
  }

  resetStepCount(): void {
    this.stepCount = 0;
    this.chanceAccumulator = 0;
  }

  //=============================================================================

  /** has_encounter_type?: whether the current map defines encounters of this type. */
  hasEncounterType(encType: Id | null | undefined): boolean {
    if (!encType) return false;
    return (this.encounterTables[encType]?.length ?? 0) > 0;
  }

  /**
   * map_has_encounter_type?: whether the given map defines encounters of this
   * type. Only called by the Bug Catching Contest.
   */
  mapHasEncounterType(mapID: number, encType: Id | null | undefined): boolean {
    if (!encType) return false;
    const encounterData = Encounter.get(mapID, G.pokemonGlobal.encounterVersion ?? 0);
    if (!encounterData) return false;
    return (encounterData.types[encType]?.length ?? 0) > 0;
  }

  /** has_land_encounters?: land-like encounters (incl. the Bug Contest's) triggered by moving around. */
  hasLandEncounters(): boolean {
    for (const encType of EncounterType.each()) {
      if (encType.type !== "land" && encType.type !== "contest") continue;
      if (this.hasEncounterType(encType.id)) return true;
    }
    return false;
  }

  /** has_normal_land_encounters?: as above, ignoring the Bug Catching Contest one. */
  hasNormalLandEncounters(): boolean {
    for (const encType of EncounterType.each()) {
      if (encType.type === "land" && this.hasEncounterType(encType.id)) return true;
    }
    return false;
  }

  /** has_cave_encounters? */
  hasCaveEncounters(): boolean {
    for (const encType of EncounterType.each()) {
      if (encType.type === "cave" && this.hasEncounterType(encType.id)) return true;
    }
    return false;
  }

  /** has_water_encounters? (not fishing) */
  hasWaterEncounters(): boolean {
    for (const encType of EncounterType.each()) {
      if (encType.type === "water" && this.hasEncounterType(encType.id)) return true;
    }
    return false;
  }

  //=============================================================================

  /** encounter_possible_here?: whether taking a step where the player is can trigger a wild encounter. */
  encounterPossibleHere(): boolean {
    if (G.pokemonGlobal.surfing) return true;
    const terrainTag = gameMap().terrainTag(gamePlayer().x, gamePlayer().y);
    if (terrainTag.ice) return false;
    if (this.hasCaveEncounters()) return true; // i.e. this map is a cave
    if (this.hasLandEncounters() && terrainTag.landWildEncounters) return true;
    return false;
  }

  /**
   * encounter_triggered?: whether a wild encounter should happen, based on its
   * encounter chance. Called when taking a step and by Rock Smash.
   */
  encounterTriggered(encType: Id, repelActive = false, triggeredByStep = true): boolean {
    if (!encType || !EncounterType.exists(encType)) throw new Error(`Encounter type ${encType} does not exist`);
    if (G.gameSystem.encounterDisabled) return false;
    if (!G.player) return false;
    if (DEBUG && Input.press(Input.CTRL)) return false;
    // Check if enc_type has a defined step chance/encounter table
    if (!this.stepChances[encType]) return false;
    if (!this.hasEncounterType(encType)) return false;
    // Poké Radar encounters always happen, ignoring the minimum step period and
    // trigger probabilities
    if (pbPokeRadarOnShakingGrass()) return true;
    // Get base encounter chance and minimum steps grace period
    let encounterChance = this.stepChances[encType]!;
    let minStepsNeeded = Math.min(Math.max(8 - encounterChance / 10, 0), 8);
    // Apply modifiers to the encounter chance and the minimum steps amount
    if (triggeredByStep) {
      encounterChance += Math.floor(this.chanceAccumulator / 200); // Integer division in Ruby
      if (G.pokemonGlobal.bicycle) encounterChance *= 0.8;
    }
    if (!EncounterSettings.FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS) {
      const pm = pokemonMap();
      if (pm?.blackFluteUsed) encounterChance /= 2;
      if (pm?.blackFluteUsed) minStepsNeeded *= 2;
      if (pm?.whiteFluteUsed) encounterChance *= 1.5;
      if (pm?.whiteFluteUsed) minStepsNeeded /= 2;
    }
    const firstPkmn = player().firstPokemon();
    if (firstPkmn) {
      switch (firstPkmn.itemId) {
        case "CLEANSETAG":
        case "PUREINCENSE":
          encounterChance *= 2 / 3;
          minStepsNeeded *= 4 / 3;
          break;
        default: // Ignore ability effects if an item effect applies
          switch (firstPkmn.abilityId) {
            case "STENCH": case "WHITESMOKE": case "QUICKFEET":
              encounterChance /= 2;
              minStepsNeeded *= 2;
              break;
            case "INFILTRATOR":
              if (EncounterSettings.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS) {
                encounterChance /= 2;
                minStepsNeeded *= 2;
              }
              break;
            case "SNOWCLOAK":
              if (Weather.get(G.gameScreen.weatherType).category === "Hail") {
                encounterChance /= 2;
                minStepsNeeded *= 2;
              }
              break;
            case "SANDVEIL":
              if (Weather.get(G.gameScreen.weatherType).category === "Sandstorm") {
                encounterChance /= 2;
                minStepsNeeded *= 2;
              }
              break;
            case "SWARM":
              encounterChance *= 1.5;
              minStepsNeeded /= 2;
              break;
            case "ILLUMINATE": case "ARENATRAP": case "NOGUARD":
              encounterChance *= 2;
              minStepsNeeded /= 2;
              break;
          }
      }
    }
    // Wild encounters are much less likely to happen for the first few steps
    // after a previous wild encounter
    if (triggeredByStep && this.stepCount < minStepsNeeded) {
      this.stepCount += 1;
      if (rand(100) >= (encounterChance * 5) / (this.stepChances[encType]! + Math.floor(this.chanceAccumulator / 200))) return false;
    }
    // Decide whether the wild encounter should actually happen
    if (rand(100) < encounterChance) return true;
    // If encounter didn't happen, make the next step more likely to produce one
    if (triggeredByStep) {
      this.chanceAccumulator += this.stepChances[encType]!;
      if (repelActive) this.chanceAccumulator = 0;
    }
    return false;
  }

  /**
   * allow_encounter?: whether an encounter with the given Pokémon should be
   * allowed after taking into account Repels and ability effects.
   */
  allowEncounter(encData: WildEncounter | null, repelActive = false): boolean {
    if (!encData) return false;
    if (pbPokeRadarOnShakingGrass()) return true;
    // Repel
    if (repelActive) {
      const firstPkmn = EncounterSettings.REPEL_COUNTS_FAINTED_POKEMON ? player().firstPokemon() : player().firstAblePokemon();
      if (firstPkmn && encData[1] < firstPkmn.level) {
        this.chanceAccumulator = 0;
        return false;
      }
    }
    // Some abilities make wild encounters less likely if the wild Pokémon is
    // sufficiently weaker than the Pokémon with the ability
    const firstPkmn = player().firstPokemon();
    if (firstPkmn) {
      switch (firstPkmn.abilityId) {
        case "INTIMIDATE": case "KEENEYE":
          if (encData[1] <= firstPkmn.level - 5 && rand(100) < 50) return false;
          break;
      }
    }
    return true;
  }

  /** have_double_wild_battle?: whether a wild encounter should be turned into a double wild encounter. */
  haveDoubleWildBattle(): boolean {
    if (G.gameTemp.forceSingleBattle) return false;
    if (pbInSafari()) return false;
    if (G.pokemonGlobal.partner) return true;
    if (player().ablePokemonCount() <= 1) return false;
    if (gamePlayer().pbTerrainTag().doubleWildEncounters && rand(100) < 30) return true;
    return false;
  }

  /**
   * find_valid_encounter_type_for_time: the encounter type the given time
   * should produce, if the current map defines it.
   */
  findValidEncounterTypeForTime(baseType: string, time: Date): Id | null {
    let ret: Id | null = null;
    if (PBDayNight.isDay(time)) {
      let tryType: Id | null = null;
      if (PBDayNight.isMorning(time)) tryType = baseType + "Morning";
      else if (PBDayNight.isAfternoon(time)) tryType = baseType + "Afternoon";
      else if (PBDayNight.isEvening(time)) tryType = baseType + "Evening";
      if (tryType && this.hasEncounterType(tryType)) ret = tryType;
      if (!ret) {
        tryType = baseType + "Day";
        if (this.hasEncounterType(tryType)) ret = tryType;
      }
    } else {
      const tryType = baseType + "Night";
      if (this.hasEncounterType(tryType)) ret = tryType;
    }
    if (ret) return ret;
    return this.hasEncounterType(baseType) ? baseType : null;
  }

  /**
   * encounter_type: the encounter method the current encounter should be
   * generated from, depending on the player's current location. (This game's
   * version also logs "Called encounter_type function" with Console.echo_warn;
   * those debug lines are left out.)
   */
  encounterType(): Id | null {
    const time = pbGetTimeNow();
    let ret: Id | null = null;
    if (G.pokemonGlobal.surfing) {
      ret = this.findValidEncounterTypeForTime("Water", time);
    } else { // Land/Cave (can have both in the same map)
      const p = gamePlayer();
      if (this.hasLandEncounters() && gameMap().terrainTag(p.x, p.y).landWildEncounters) {
        if (pbInBugContest() && this.hasEncounterType("BugContest")) ret = "BugContest";
        if (!ret && gameMap().terrainTag(p.x, p.y).idNumber === 10) {
          ret = this.findValidEncounterTypeForTime("TallGrass", time);
        } else if (!ret) {
          ret = this.findValidEncounterTypeForTime("Land", time);
        }
      }
      if (!ret && this.hasCaveEncounters()) ret = this.findValidEncounterTypeForTime("Cave", time);
    }
    return ret;
  }

  //=============================================================================

  /**
   * choose_wild_pokemon: randomly chooses a species and level from the current
   * map's encounter list for the given type. A higher chance_rolls prefers
   * rarer encounter slots.
   */
  chooseWildPokemon(encType: Id, chanceRolls = 1): WildEncounter | null {
    if (!encType || !EncounterType.exists(encType)) throw new Error(`Encounter type ${encType} does not exist`);
    let encList = this.encounterTables[encType];
    if (!encList || encList.length === 0) return null;
    // Static/Magnet Pull prefer wild encounters of certain types, if possible.
    // If they activate, they remove all Pokémon from the encounter table that do
    // not have the type they favor. If none have that type, nothing is changed.
    const firstPkmn = player().firstPokemon();
    if (firstPkmn) {
      let favoredType: Id | null = null;
      const more = EncounterSettings.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS;
      switch (firstPkmn.abilityId) {
        case "FLASHFIRE": if (more && Type.exists("FIRE") && rand(100) < 50) favoredType = "FIRE"; break;
        case "HARVEST": if (more && Type.exists("GRASS") && rand(100) < 50) favoredType = "GRASS"; break;
        case "LIGHTNINGROD": if (more && Type.exists("ELECTRIC") && rand(100) < 50) favoredType = "ELECTRIC"; break;
        case "MAGNETPULL": if (Type.exists("STEEL") && rand(100) < 50) favoredType = "STEEL"; break;
        case "STATIC": if (Type.exists("ELECTRIC") && rand(100) < 50) favoredType = "ELECTRIC"; break;
        case "STORMDRAIN": if (more && Type.exists("WATER") && rand(100) < 50) favoredType = "WATER"; break;
      }
      if (favoredType) {
        const newEncList = encList.filter((enc) => Species.get(enc[1]).types.includes(favoredType!));
        if (newEncList.length > 0) encList = newEncList;
      }
    }
    rubySortBy(encList, (a, b) => b[0] - a[0]); // Highest probability first (sort! is in place)
    // Calculate the total probability value
    let chanceTotal = 0;
    for (const a of encList) chanceTotal += a[0];
    // Choose a random entry in the encounter table based on entry probabilities
    let rnd = 0;
    for (let i = 0; i < chanceRolls; i++) {
      const r = rand(chanceTotal);
      if (r > rnd) rnd = r; // Prefer rarer entries if rolling repeatedly
    }
    let encounter: EncounterEntry | null = null;
    for (const enc of encList) {
      rnd -= enc[0];
      if (rnd >= 0) continue;
      encounter = enc;
      break;
    }
    // Get the chosen species and level
    let level = encounter![2] + rand(encounter![3] - encounter![2] + 1); // rand(min..max)
    // Some abilities alter the level of the wild Pokémon
    if (firstPkmn) {
      switch (firstPkmn.abilityId) {
        case "HUSTLE": case "PRESSURE": case "VITALSPIRIT":
          if (rand(100) < 50) level = encounter![3]; // Highest possible level
          break;
      }
    }
    // Black Flute and White Flute alter the level of the wild Pokémon
    if (EncounterSettings.FLUTES_CHANGE_WILD_ENCOUNTER_LEVELS) {
      const pm = pokemonMap();
      if (pm?.blackFluteUsed) level = Math.min(level + 1 + rand(4), GrowthRate.maxLevel());
      else if (pm?.whiteFluteUsed) level = Math.max(level - (1 + rand(4)), 1);
    }
    return [encounter![1], level];
  }

  /**
   * choose_wild_pokemon_for_map: as above for any map, without modifiers. Used
   * by the Bug Catching Contest to choose what the other participants caught.
   */
  chooseWildPokemonForMap(mapID: number, encType: Id): WildEncounter | null {
    if (!encType || !EncounterType.exists(encType)) throw new Error(`Encounter type ${encType} does not exist`);
    const encounterData = Encounter.get(mapID, G.pokemonGlobal.encounterVersion ?? 0);
    if (!encounterData) return null;
    const encList = encounterData.types[encType];
    if (!encList || encList.length === 0) return null;
    let chanceTotal = 0;
    for (const a of encList) chanceTotal += a.chance;
    let rnd = rand(chanceTotal);
    let encounter: (typeof encList)[number] | null = null;
    for (const enc of encList) {
      rnd -= enc.chance;
      if (rnd >= 0) continue;
      encounter = enc;
      break;
    }
    const level = encounter!.minLevel + rand(encounter!.maxLevel - encounter!.minLevel + 1);
    return [encounter!.species, level];
  }
}

//===============================================================================
//
//===============================================================================

/** Array#sample */
function sample<T>(arr: T[]): T | null {
  return arr.length > 0 ? arr[rand(arr.length)]! : null;
}

const sameItems = (a: Id[], b: Id[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * pbGenerateWildPokemon: creates a Pokémon of the given species and level with
 * the wild modifiers (held item, shiny chance, Pokérus, gender/nature forcing
 * by the lead Pokémon's ability).
 */
export function pbGenerateWildPokemon(species: Id, level: number, isRoamer = false): Pokemon {
  const genwildpoke = new Pokemon(species, level);
  // Give the wild Pokémon a held item
  const items = genwildpoke.wildHoldItems();
  const firstPkmn = player().firstPokemon();
  let chances = [50, 5, 1];
  if (firstPkmn) {
    switch (firstPkmn.abilityId) {
      case "COMPOUNDEYES": chances = [60, 20, 5]; break;
      case "SUPERLUCK": if (EncounterSettings.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS) chances = [60, 20, 5]; break;
    }
  }
  const itemrnd = rand(100);
  if ((sameItems(items[0], items[1]) && sameItems(items[1], items[2])) || itemrnd < chances[0]!) {
    genwildpoke.item = sample(items[0]);
  } else if (itemrnd < chances[0]! + chances[1]!) {
    genwildpoke.item = sample(items[1]);
  } else if (itemrnd < chances[0]! + chances[1]! + chances[2]!) {
    genwildpoke.item = sample(items[2]);
  }
  // Improve chances of shiny Pokémon with Shiny Charm and battling more of the
  // same species
  let shinyRetries = 0;
  if (G.bag?.has("SHINYCHARM")) shinyRetries += 2;
  if (EncounterSettings.HIGHER_SHINY_CHANCES_WITH_NUMBER_BATTLED) {
    let values = [0, 0];
    const count = player().pokedex.battledCount(species);
    if (count < 50) values = [0, 0];
    else if (count < 100) values = [1, 15];
    else if (count < 200) values = [2, 20];
    else if (count < 300) values = [3, 25];
    else if (count < 500) values = [4, 30];
    else values = [5, 30];
    if (values[1]! > 0 && rand(1000) < values[1]!) shinyRetries += values[0]!;
  }
  for (let i = 0; i < shinyRetries; i++) {
    if (genwildpoke.shiny) break;
    genwildpoke.shiny = null; // Make it recalculate shininess
    genwildpoke.personalID = (rand(2 ** 16) | (rand(2 ** 16) << 16)) >>> 0;
  }
  // Give Pokérus
  if (rand(65_536) < EncounterSettings.POKERUS_CHANCE) genwildpoke.givePokerus();
  // Change wild Pokémon's gender/nature depending on the lead party Pokémon's
  // ability
  if (firstPkmn) {
    if (firstPkmn.hasAbility("CUTECHARM") && !genwildpoke.singleGendered()) {
      if (firstPkmn.male()) rand(3) < 2 ? genwildpoke.makeFemale() : genwildpoke.makeMale();
      else if (firstPkmn.female()) rand(3) < 2 ? genwildpoke.makeMale() : genwildpoke.makeFemale();
    } else if (firstPkmn.hasAbility("SYNCHRONIZE")) {
      if (!isRoamer && (EncounterSettings.MORE_ABILITIES_AFFECT_WILD_ENCOUNTERS || rand(100) < 50)) {
        genwildpoke.nature = firstPkmn.nature!.id;
      }
    }
  }
  // Trigger events that may alter the generated Pokémon further
  EventHandlers.triggerSync("on_wild_pokemon_created", genwildpoke);
  return genwildpoke;
}

/** Late-bound WildBattle.start (battle/BattleStarting.ts imports this module). */
type WildBattleStart = (args: unknown[], canOverride: boolean) => Promise<boolean>;
let wildBattleStart: WildBattleStart = async () => {
  throw new Error("WildBattle isn't loaded");
};
export function setWildBattleStart(fn: WildBattleStart): void {
  wildBattleStart = fn;
}

/**
 * pbEncounter: used by fishing rods and Headbutt/Rock Smash/Sweet Scent to
 * generate a wild Pokémon (or two for Sweet Scent) for a triggered encounter.
 */
export async function pbEncounter(encType: Id, onlySingle = true): Promise<boolean> {
  const t = G.gameTemp;
  const enc = pokemonEncounters();
  t.encounterType = encType;
  const encounter1 = enc.chooseWildPokemon(encType);
  EventHandlers.triggerSync("on_wild_species_chosen", encounter1);
  if (!encounter1) return false;
  if (!onlySingle && enc.haveDoubleWildBattle()) {
    const encounter2 = enc.chooseWildPokemon(encType);
    EventHandlers.triggerSync("on_wild_species_chosen", encounter2);
    if (!encounter2) return false;
    await wildBattleStart([encounter1, encounter2], true);
  } else {
    await wildBattleStart([encounter1], true);
  }
  t.encounterType = null;
  t.forceSingleBattle = false;
  return true;
}

/** pbBattleOnStepTaken (012_Overworld/001_Overworld.rb): a standard (instant) wild battle. */
export async function pbBattleOnStepTaken(repelActive: boolean): Promise<void> {
  const t = G.gameTemp;
  const enc = pokemonEncounters();
  if (player().ablePokemonCount() === 0) return;
  if (!enc.encounterPossibleHere()) return;
  const encounterType = enc.encounterType();
  if (!encounterType) return;
  if (!enc.encounterTriggered(encounterType, repelActive)) return;
  t.encounterType = encounterType;
  const encounter = enc.chooseWildPokemon(encounterType);
  EventHandlers.triggerSync("on_wild_species_chosen", encounter);
  if (enc.allowEncounter(encounter, repelActive)) {
    if (enc.haveDoubleWildBattle()) {
      const encounter2 = enc.chooseWildPokemon(encounterType);
      EventHandlers.triggerSync("on_wild_species_chosen", encounter2);
      await wildBattleStart([encounter, encounter2], true);
    } else {
      await wildBattleStart([encounter], true);
    }
    t.encounterType = null;
    t.encounterTriggered = true;
  }
  t.forceSingleBattle = false;
}

// --- 004_Overworld_EncounterModifiers.rb ----------------------------------------

// Make all wild Pokémon shiny while a certain Switch is ON (see Settings).
EventHandlers.add("on_wild_pokemon_created", "make_shiny_switch", (pkmn) => {
  if (G.gameSwitches.get(EncounterSettings.SHINY_WILD_POKEMON_SWITCH)) (pkmn as Pokemon).shiny = true;
});

// Used in the random dungeon map. Makes the levels of all wild Pokémon in that
// map depend on the levels of Pokémon in the player's party.
EventHandlers.add("on_wild_pokemon_created", "level_depends_on_party", (p) => {
  const pkmn = p as Pokemon;
  if (!levelScalingMap()) return;
  let newLevel = pbBalancedLevel(player().party) - 4 + rand(5); // For variety
  newLevel = Math.min(Math.max(newLevel, 1), GrowthRate.maxLevel());
  pkmn.level = newLevel;
  pkmn.calcStats();
  pkmn.resetMoves();
});

function levelScalingMap(): boolean {
  if (!G.gameMap) return false;
  return ((mapMetadata(gameMap().mapId)?.flags as string[] | undefined) ?? []).includes("ScaleWildEncounterLevels");
}
