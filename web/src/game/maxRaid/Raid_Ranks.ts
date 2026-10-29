// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Ranks.rb: the raid rank
// data (compiled into data/pbs/raid-ranks.json by tools/pbs/compilePlugins.ts,
// Ruby's raid_ranks.dat; pbLoadRaidRanks/pbClearData are the data store's)
// and the utilities that read it: which species appear in which ranks, ranks
// from badges and levels, and the species lists raids pick from.
//
// raid_GenerateBanlist runs at compile time (compilePlugins.ts's raidBanlist);
// the version here is the same code, for the Debug menu and tests.

import { rand as randInt } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { pbGetRaidRank as raidRankData } from "../../data/gameData/miscPBSData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { PBDayNight } from "../dayNight";
import { pokemonEncounters } from "../encounters/PokemonEncounters";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import { pbGetSeason } from "../pokemon/formHandlers";
import type { Player } from "../trainer/Player";
import { sample } from "./random";

const player = () => G.player as unknown as Player;

/** The arguments raid_GenerateSpeciesList takes as `params`: [type, habitat, generation], a species, or nil. */
export type RaidSpeciesParams = (Id | number | null | undefined)[] | Id | null | undefined;

//-------------------------------------------------------------------------------
// Utilities for quickly obtaining information related to raid ranks.
//-------------------------------------------------------------------------------
/** pbGetRaidRank: { 1 => rank 1 species, ..., 6 => ..., :total, :banned }. */
export function pbGetRaidRank(): { [rank: number]: Id[]; total: Id[]; banned: Id[] } {
  const ranks = raidRankData();
  return {
    1: ranks.ranks[0]!, 2: ranks.ranks[1]!, 3: ranks.ranks[2]!,
    4: ranks.ranks[3]!, 5: ranks.ranks[4]!, 6: ranks.ranks[5]!,
    total: ranks.total, banned: ranks.banned,
  };
}

/** raid_SpeciesFromRank(rank = nil): the species of a rank, or of every rank. */
export function raidSpeciesFromRank(rank: number | null = null): Id[] {
  return rank ? (pbGetRaidRank()[rank] ?? []) : pbGetRaidRank().total;
}

/** raid_RanksAppearedIn(species) */
export function raidRanksAppearedIn(species: Id): number[] {
  const ranks: number[] = [];
  const data = raidRankData().ranks;
  for (let i = 0; i < 6; i++) if (data[i]!.includes(species)) ranks.push(i + 1);
  return ranks;
}

/** raid_RankFromBadgeCount: a random rank the player's badges allow. */
export function raidRankFromBadgeCount(): number {
  const badges = player().badgeCount();
  const ranks: number[] = [];
  if (badges < 6) ranks.push(1);
  if (badges < 8 && badges > 0) ranks.push(2);
  if (badges >= 3) ranks.push(3);
  if (badges >= 6) ranks.push(4);
  if (badges >= 8) ranks.push(5);
  return sample(ranks)!;
}

/** raid_LevelFromRank(rank) */
export function raidLevelFromRank(rank: number): number | null {
  switch (rank) {
    case 1: return 15 + rand6();
    case 2: return 30 + rand6();
    case 3: return 40 + rand6();
    case 4: return 50 + rand6();
    case 5: return 60 + rand6();
    case 6: return 70;
  }
  return null;
}
const rand6 = () => randInt(6);

/** raid_RankFromLevel(level): nil for levels between the rank ranges. */
export function raidRankFromLevel(level: number): number | null {
  if (level >= 1 && level <= 20) return 1;
  if (level >= 30 && level <= 35) return 2;
  if (level >= 40 && level <= 45) return 3;
  if (level >= 50 && level <= 55) return 4;
  if (level >= 60 && level <= 65) return 5;
  if (level >= 70) return 6;
  return null;
}

//-------------------------------------------------------------------------------
// Generates the raid banlist containing all ineligible species.
//-------------------------------------------------------------------------------
export function raidGenerateBanlist(): Id[] {
  //-----------------------------------------------------------------------------
  // Hard-coded banned species list. These species never appear as raid Pokemon
  // due to either being too gimmicky, being very exclusive forms that shouldn't
  // normally appear (despite other forms of that same species being eligible), or
  // base forms of Legendary species that are too weak to appear in Legendary tier.
  //-----------------------------------------------------------------------------
  const raidBanlist: Id[] = ["SMEARGLE", "SHEDINJA", "PHIONE", "FLOETTE_5", "ZYGARDE_2", "ZYGARDE_3",
    "TYPENULL", "COSMOG", "COSMOEM", "POIPOLE", "MELTAN", "KUBFU"];
  //-----------------------------------------------------------------------------
  // Allowable multi-form species. These species have forms that should be allowed
  // to appear in raids. However, many of these species have forms that may only
  // appear under certain conditions, which is handled elsewhere.
  //-----------------------------------------------------------------------------
  const allowedForms: Id[] = ["TAUROS", "UNOWN", "DEOXYS", "BURMY", "WORMADAM", "SHELLOS", "GASTRODON", "ROTOM",
    "SHAYMIN", "DEERLING", "SAWSBUCK", "BASCULIN", "TORNADUS", "THUNDURUS", "LANDORUS", "VIVILLON",
    "FURFROU", "FLABEBE", "FLOETTE", "FLORGES", "MEOWSTIC", "PUMPKABOO", "GOURGEIST", "ZYGARDE", "HOOPA",
    "ORICORIO", "ROCKRUFF", "LYCANROC", "SINISTEA", "POLTEAGEIST", "TOXTRICITY", "INDEEDEE", "URSHIFU",
    "BASCULEGION", "ENAMORUS", "OINKOLOGNE", "PALAFIN", "DUDUNSPARCE", "MAUSHOLD", "TATSUGIRI", "SQUAWKABILLY"];
  //-----------------------------------------------------------------------------
  // All other forms not listed above are added to the raid banlist. Exceptions
  // are made for regional forms, as well as other specific cases, such as with
  // Minior meteor forms.
  //-----------------------------------------------------------------------------
  for (const sp of Species.each()) {
    if (sp.noDynamax) {
      raidBanlist.push(sp.id);
    } else {
      // Species with allowable forms are not included in the banlist.
      if (sp.form === 0) continue;
      if (sp.regionalVariant()) continue;
      if (allowedForms.includes(sp.species)) continue;
      if (sp.species === "MINIOR" && sp.form < 7) continue;
      raidBanlist.push(sp.id);
    }
  }
  return raidBanlist;
}

/** pbGetCurrentRegion(default = -1) (019_Utilities/001_Utilities.rb) */
function pbGetCurrentRegion(defaultRegion = -1): number {
  if (!G.gameMap) return defaultRegion;
  const pos = mapMetadata((G.gameMap as unknown as GameMap).mapId)?.townMapPosition;
  return pos ? (pos[0] as number) : defaultRegion;
}

//-------------------------------------------------------------------------------
// Gets the specific species or array of species to utilize in a raid event.
//-------------------------------------------------------------------------------
export function raidGenerateSpeciesList(params: RaidSpeciesParams, rank: number | null, env: Id | null = null,
  databaseFilter = false): Id[] {
  let typeFilter = false, habitatFilter = false, genFilter = false;
  let speciesFilter = false, pokemonFilter = false;
  if (Array.isArray(params)) {
    //---------------------------------------------------------------------------
    // Filters by inputted array [GameData::Type, GameData::Habitat, generation]
    //---------------------------------------------------------------------------
    if (params[0]) typeFilter = true;
    if (params[1]) habitatFilter = true;
    if (params[2]) genFilter = true;
  } else if (typeof params === "string") {
    //---------------------------------------------------------------------------
    // Filters by inputted GameData::Species id.
    //---------------------------------------------------------------------------
    params = raidGetEligibleSpecies(params);
    if (!rank) rank = sample(raidRanksAppearedIn(params));
    if (Species.get(params).form === 0) speciesFilter = true;
    else pokemonFilter = true;
  } else {
    //---------------------------------------------------------------------------
    // Otherwise, filters by random species found on the current map.
    //---------------------------------------------------------------------------
    speciesFilter = true;
    const enc = pokemonEncounters();
    const enctype = enc.encounterType();
    if (enctype && enc.encounterPossibleHere()) {
      const encounter = enc.chooseWildPokemon(enctype);
      // NOTE (Ruby parity): `encounter[0]` raises NoMethodError when the table
      // is empty (Raid_Ranks.rb:207); here it leaves params as it was.
      if (encounter) params = encounter[0];
    }
    params = raidGetEligibleSpecies(params as Id | null | undefined);
  }
  //-----------------------------------------------------------------------------
  // Builds an array of eligible species based on applied filters.
  //-----------------------------------------------------------------------------
  const raidSpecies: Id[] = [];
  if (pokemonFilter) {
    raidSpecies.push(params as Id);
  } else {
    const environ = ["BURMY", "WORMADAM"];
    const seasonal = ["DEERLING", "SAWSBUCK"];
    const timeday = ["SHAYMIN", "ROCKRUFF", "LYCANROC"];
    const dataform = ["PIKACHU", "UNOWN", "SHELLOS", "GASTRODON", "FLABEBE", "FLOETTE", "FLORGES", "FURFROU", "PUMPKABOO",
      "GOURGEIST", "ROCKRUFF", "MINIOR", "SINISTEA", "POLTEAGEIST", "PALAFIN", "DUDUNSPARCE", "MAUSHOLD", "TATSUGIRI",
      "SQUAWKABILLY"];
    const enviform = env === "Cave" || env === "Rock" || env === "Sand" ? 1 : env === "None" ? 2 : 0;
    const timeform = PBDayNight.isNight() ? 1 : PBDayNight.isEvening() ? 2 : 0;
    const banlist = pbGetRaidRank().banned;
    const arr = Array.isArray(params) ? params : null;
    for (const i of raidSpeciesFromRank(rank)) {
      if (banlist.includes(i) || !Species.exists(i)) continue;
      const sp = Species.get(i);
      //-------------------------------------------------------------------------
      // General filters.
      //-------------------------------------------------------------------------
      if (sp.generation > Settings.GENERATION_LIMIT) continue;
      if (typeFilter && !sp.types.includes(arr![0] as Id)) continue;
      if (habitatFilter && sp.habitat !== arr![1]) continue;
      if (genFilter && sp.generation !== arr![2]) continue;
      if (seasonal.includes(sp.species) && sp.form !== pbGetSeason()) continue;
      if (sp.species === "VIVILLON" && sp.form !== player().secretID() % 18) continue;
      //-------------------------------------------------------------------------
      // Filters out species that shouldn't naturally appear unless specified.
      //-------------------------------------------------------------------------
      if (databaseFilter) {
        if (dataform.includes(sp.species) && sp.form > 0) continue;
      } else {
        if (speciesFilter && sp.species !== params) continue;
        if (sp.regionalVariant() && !sp.encounterRegional(pbGetCurrentRegion())) continue;
        if (environ.includes(sp.species) && sp.form !== enviform) continue;
        if (timeday.includes(sp.species) && sp.form !== timeform) continue;
        if (arr && sp.species === "UNOWN") continue;
        if (arr && sp.species === "ETERNATUS") continue;
        if (sp.species === "FURFROU" && sp.form > 0) continue;
        if (sp.id === "ZYGARDE_1") continue;
      }
      raidSpecies.push(i);
    }
  }
  return raidSpecies;
}

//-------------------------------------------------------------------------------
// Selects a random species out of the generated species list above.
// Returns Ditto if no species was found for some reason.
//-------------------------------------------------------------------------------
export function raidGenerateSpecies(params: RaidSpeciesParams, rank: number | null, env: Id | null = null,
  databaseFilter = false): Id {
  const species = raidGenerateSpeciesList(params, rank, env, databaseFilter);
  return species.length > 0 ? sample(species)! : "DITTO";
}

//-------------------------------------------------------------------------------
// Returns a list only of raid species that the player has already seen.
//-------------------------------------------------------------------------------
export function raidGetSeenSpecies(params: RaidSpeciesParams, rank: number | null, env: Id | null = null,
  databaseFilter = false): Id[] {
  return raidGenerateSpeciesList(params, rank, env, databaseFilter).filter((sp) => player().seen(sp));
}

//-------------------------------------------------------------------------------
// Checks if the inputted species appears on the raid banlist. If so, selects the
// base form of that species instead. If the base form also appears on the banlist,
// then Ditto is selected instead as a last resort.
//-------------------------------------------------------------------------------
export function raidGetEligibleSpecies(pokemon: Id | null | undefined): Id {
  if (pokemon == null || !Species.exists(pokemon)) pokemon = "DITTO";
  const data = Species.get(pokemon);
  const banlist = pbGetRaidRank().banned;
  if (banlist.includes(data.id)) pokemon = data.species;
  if (banlist.includes(data.species)) pokemon = "DITTO";
  return pokemon;
}

