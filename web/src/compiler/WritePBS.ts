// Port of Data/Scripts/021_Compiler/003_Compiler_WritePBS.rb: Compiler.write_*,
// which rewrite the PBS files from the loaded GameData (the Debug menu's
// "Create PBS file(s)"). Plugin writers folded in, in plugin load order:
// - Generation 8 Pack Scripts (Sprite Scaling/Custom Sprite Scales.rb:66):
//   write_pokemon_metrics also writes FrontSpriteScale/BackSpriteScale.
// - Essentials Deluxe ([000] Essentials Patches/Compiler.rb:67-180):
//   write_all also writes the plugin PBS files; write_items writes
//   PortionName(Plural)/HeldDescription; write_trainers writes the plugin
//   trainer Pokémon properties.
// - ZUD Mechanics ([000] General/Compiler.rb): write_habitats, write_raid_ranks,
//   write_lair_maps, write_dynamax_metrics, write_power_moves.
// - Improved Field Skills ([001] Field Skills.rb:349): write_field_skills.
//
// Each Ruby writer is a generator of WriteSteps (see Compiler.ts):
// `Compiler.writeX()` runs it (console output, Graphics.update, the file
// writes through DevFiles), `PBSText.x()` returns the text it would write.
// Where Ruby reads a compiled Data/*.dat file that the runtime doesn't keep
// (map_connections, trainer_lists, adventure_maps), Compiler.loadData reads
// the compiled JSON (data/pbs/*.json) instead.

import type { AdventureMaps, FacilityPokemon, FacilityTrainer, MapConnection, TrainerList } from "../data/pbs/types";
import { GameData, Settings } from "../data/gameData";
import { _INTL, type Id } from "../data/gameData/gameData";
import { pbLoadPhoneData, pbLoadRegionalDexes, pbLoadTownMapData } from "../data/gameData/miscPBSData";
import type { Species } from "../data/gameData/species";
import { Data, mapDims } from "../data/store";
import { Console, echo, echoln } from "../debug/DebugConsole";
import { pbGetRaidRank, raidRanksAppearedIn } from "../game/maxRaid/Raid_Ranks";
import {
  PbsFile, type Schema, UPDATE, type WriteStep, type WriteSteps, csvQuote, csvQuoteAlways, getConstantName,
  getConstantNameOrValue, hashKey, nilOrEmpty, pbWriteCsvRecord, processPbsFileMessageEnd, rubyEquals, rubyJoin,
  rubyToS, runWriteSteps, uniqCompact, writePbsFileMessageStart, writeStepsFiles,
} from "./Compiler";

/** PluginManager.installed?: the plugins these writers ask about that this game has (Plugins/). */
const INSTALLED_PLUGINS = new Set(["Generation 8 Pack Scripts", "Essentials Deluxe", "ZUD Mechanics", "Improved Field Skills"]);
const installed = (plugin: string) => INSTALLED_PLUGINS.has(plugin);

/** Compiler::PLUGIN_FILES (Essentials Deluxe, += "ZUD", += "Improved Field Skills"). */
export const PLUGIN_FILES = ["Essentials Deluxe", "ZUD", "Improved Field Skills"];

// The SCHEMA parts the writers read (the GameData classes keep their compiled
// values only; the schemas themselves live in the PBS compiler).
/** GameData::Move::SCHEMA["Category"][2] (005_Move.rb:24) */
const MOVE_CATEGORIES = ["Physical", "Special", "Status"];
/** GameData::Item::SCHEMA["FieldUse"][2] / ["BattleUse"][2] (006_Item.rb:26) */
const ITEM_FIELD_USES = new Map([["OnPokemon", 1], ["Direct", 2], ["TM", 3], ["HM", 4], ["TR", 5]]);
const ITEM_BATTLE_USES = new Map([["OnPokemon", 1], ["OnMove", 2], ["OnBattler", 3], ["OnFoe", 4], ["Direct", 5]]);
/** GameData::TrainerType::SCHEMA["Gender"][2] (014_TrainerType.rb:18) */
const TRAINER_TYPE_GENDERS = new Map([
  ["Male", 0], ["male", 0], ["M", 0], ["m", 0], ["0", 0],
  ["Female", 1], ["female", 1], ["F", 1], ["f", 1], ["1", 1],
  ["Unknown", 2], ["unknown", 2], ["Other", 2], ["other", 2],
  ["Mixed", 2], ["mixed", 2], ["X", 2], ["x", 2], ["2", 2],
]);
/** GameData::Metadata::SCHEMA (016_Metadata.rb) */
const METADATA_SCHEMA: Record<string, Schema> = {
  StartMoney: [1, "u"],
  StartItemStorage: [2, "*e", "Item"],
  Home: [3, "vuuu"],
  StorageCreator: [4, "s"],
  WildBattleBGM: [5, "s"],
  TrainerBattleBGM: [6, "s"],
  WildVictoryBGM: [7, "s"],
  TrainerVictoryBGM: [8, "s"],
  WildCaptureME: [9, "s"],
  SurfBGM: [10, "s"],
  BicycleBGM: [11, "s"],
};
/** GameData::PlayerMetadata::SCHEMA (017_PlayerMetadata.rb) */
const PLAYER_METADATA_SCHEMA: Record<string, Schema> = {
  TrainerType: [1, "e", "TrainerType"],
  WalkCharset: [2, "s"],
  RunCharset: [3, "s"],
  CycleCharset: [4, "s"],
  SurfCharset: [5, "s"],
  DiveCharset: [6, "s"],
  FishCharset: [7, "s"],
  SurfFishCharset: [8, "s"],
  Home: [9, "vuuu"],
};
/** GameData::MapMetadata::SCHEMA (018_MapMetadata.rb) */
const MAP_METADATA_SCHEMA: Record<string, Schema> = {
  Name: [1, "s"],
  Outdoor: [2, "b"],
  ShowArea: [3, "b"],
  Bicycle: [4, "b"],
  BicycleAlways: [5, "b"],
  HealingSpot: [6, "vuu"],
  Weather: [7, "eu", "Weather"],
  MapPosition: [8, "uuu"],
  DiveMap: [9, "v"],
  DarkMap: [10, "b"],
  SafariMap: [11, "b"],
  SnapEdges: [12, "b"],
  Dungeon: [13, "b"],
  BattleBack: [14, "s"],
  WildBattleBGM: [15, "s"],
  TrainerBattleBGM: [16, "s"],
  WildVictoryBGM: [17, "s"],
  TrainerVictoryBGM: [18, "s"],
  WildCaptureME: [19, "s"],
  MapSize: [20, "us"],
  Environment: [21, "e", "Environment"],
  Flags: [22, "*s"],
};
/** The keys of ZUD's GameData::PowerMove::SCHEMA, in order (Data_PowerMove.rb:27). */
const POWER_MOVE_SCHEMA_KEYS = [
  "ZMove", "MaxMove", "Type", "Item", "Move", "Species", "Flag", "Ultra", "Name", "Height", "Pokedex",
  "AtkBoost1", "AtkBoost2", "AtkBoost3", "DefBoost1", "DefBoost2", "DefBoost3",
  "SpAtkBoost1", "SpAtkBoost2", "SpAtkBoost3", "SpDefBoost1", "SpDefBoost2", "SpDefBoost3",
  "SpeedBoost1", "SpeedBoost2", "SpeedBoost3", "AccBoost1", "AccBoost2", "AccBoost3",
  "EvaBoost1", "EvaBoost2", "EvaBoost3", "OmniBoost1", "OmniBoost2", "OmniBoost3",
  "HealUser", "HealSwitch", "CritBoost", "ResetStats", "FocusOnUser",
];

/** Schema keys ordered by their index (schema.keys.sort { |a, b| schema[a][0] <=> schema[b][0] }). */
function sortedKeys(schema: Record<string, Schema>): string[] {
  return Object.keys(schema).sort((a, b) => (schema[a]![0] as number) - (schema[b]![0] as number));
}

/** echo "." */
const DOT: WriteStep = () => echo(".");

/** pbLoadMapInfos */
function pbLoadMapInfos() {
  return Data.mapInfos;
}

/** load_data("Data/<name>.dat"): the compiled PBS JSON in data/pbs/. */
async function defaultLoadData(file: string): Promise<unknown> {
  const res = await fetch(`/data/pbs/${file}`);
  if (!res.ok) throw new Error(`Missing data/pbs/${file}; run pnpm pbs`);
  return res.json();
}

//===============================================================================
//
//===============================================================================
export function addPBSHeaderToFile(file: PbsFile): void {
  file.write("﻿"); // 0xEF 0xBB 0xBF in UTF-8
  file.write("# " + _INTL("See the documentation on the wiki to learn how to edit this file.") + "\r\n");
}

//=============================================================================
// Save Town Map data to PBS file
//=============================================================================
export function* writeTownMapSteps(path = "PBS/town_map.txt", mapdata = pbLoadTownMapData()): WriteSteps {
  if (!mapdata) return;
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (let i = 0; i < mapdata.length; i++) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    const map = mapdata[i];
    if (!map) continue;
    f.write("#-------------------------------\r\n");
    f.write(`[${i}]\r\n`);
    const rname = map.name; // pbGetMessage(MessageTypes::RegionNames, i)
    f.write(`Name = ${rname && rname !== "" ? rname : _INTL("Unnamed")}\r\n`);
    f.write(`Filename = ${csvQuote(map.filename)}\r\n`);
    for (const loc of map.points) {
      f.write("Point = ");
      pbWriteCsvRecord([loc.x, loc.y, loc.name, loc.poi, loc.flyMapId, loc.flyX, loc.flyY, loc.switchId], f, [null, "uussUUUU"]);
      f.write("\r\n");
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save map connections to PBS file
//=============================================================================
type ConnectionRecord = [number, string | number, number, number, string | number, number];

export function normalizeConnection(conn: ConnectionRecord): ConnectionRecord {
  const ret = [...conn] as ConnectionRecord;
  if (((conn[1] as number) < 0) !== ((conn[4] as number) < 0)) { // Exactly one is negative
    ret[4] = -(conn[1] as number);
    ret[1] = -(conn[4] as number);
  }
  if ((conn[2] < 0) !== (conn[5] < 0)) { // Exactly one is negative
    ret[5] = -conn[2];
    ret[2] = -conn[5];
  }
  return ret;
}

export function getConnectionText(map1: number, x1: number, y1: number, map2: number, x2: number, y2: number): string {
  const dims1 = mapDims(map1); // MapFactoryHelper.getMapDims
  const dims2 = mapDims(map2);
  if (x1 === 0 && x2 === dims2[0]) {
    return `${map1},West,${y1},${map2},East,${y2}`;
  } else if (y1 === 0 && y2 === dims2[1]) {
    return `${map1},North,${x1},${map2},South,${x2}`;
  } else if (x1 === dims1[0] && x2 === 0) {
    return `${map1},East,${y1},${map2},West,${y2}`;
  } else if (y1 === dims1[1] && y2 === 0) {
    return `${map1},South,${x1},${map2},North,${x2}`;
  }
  return `${map1},${x1},${y1},${map2},${x2},${y2}`;
}

export function* writeConnectionsSteps(path: string, conndata: MapConnection[] | null): WriteSteps {
  if (!conndata) return;
  yield writePbsFileMessageStart(path);
  const mapinfos = pbLoadMapInfos();
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  f.write("#-------------------------------\r\n");
  for (const c of conndata) {
    const conn: ConnectionRecord = [c.map1, c.edge1, c.position1, c.map2, c.edge2, c.position2];
    // (pbLoadMapInfos always returns a hash, so `if mapinfos` is always true)
    // Skip if map no longer exists
    if (!mapinfos.get(conn[0]) || !mapinfos.get(conn[3])) continue;
    f.write(`# ${mapinfos.get(conn[0])?.name ?? "???"} (${conn[0]}) - ${mapinfos.get(conn[3])?.name ?? "???"} (${conn[3]})\r\n`);
    if (typeof conn[1] === "string" || typeof conn[4] === "string") {
      f.write(`${conn[0]},${conn[1]},${conn[2]},${conn[3]},${conn[4]},${conn[5]}`);
    } else {
      const ret = normalizeConnection(conn);
      f.write(getConnectionText(ret[0], ret[1] as number, ret[2], ret[3], ret[4] as number, ret[5]));
    }
    f.write("\r\n");
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save phone messages to PBS file
//=============================================================================
export function* writePhoneSteps(path = "PBS/phone.txt"): WriteSteps {
  const data = pbLoadPhoneData(); // load_data("Data/phone.dat") rescue nil
  if (!data) return;
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  f.write("#-------------------------------\r\n");
  f.write("[<Generics>]\r\n");
  f.write(data.generics.join("\r\n") + "\r\n");
  f.write("#-------------------------------\r\n");
  f.write("[<BattleRequests>]\r\n");
  f.write(data.battleRequests.join("\r\n") + "\r\n");
  f.write("#-------------------------------\r\n");
  f.write("[<GreetingsMorning>]\r\n");
  f.write(data.greetingsMorning.join("\r\n") + "\r\n");
  f.write("#-------------------------------\r\n");
  f.write("[<GreetingsEvening>]\r\n");
  f.write(data.greetingsEvening.join("\r\n") + "\r\n");
  f.write("#-------------------------------\r\n");
  f.write("[<Greetings>]\r\n");
  f.write(data.greetings.join("\r\n") + "\r\n");
  f.write("#-------------------------------\r\n");
  f.write("[<Bodies1>]\r\n");
  f.write(data.bodies1.join("\r\n") + "\r\n");
  f.write("#-------------------------------\r\n");
  f.write("[<Bodies2>]\r\n");
  f.write(data.bodies2.join("\r\n") + "\r\n");
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save type data to PBS file
//=============================================================================
export function* writeTypesSteps(path = "PBS/types.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  // Write each type in turn
  for (const type of GameData.Type.each()) {
    f.write("#-------------------------------\r\n");
    f.write(`[${type.id}]\r\n`);
    f.write(`Name = ${type.realName}\r\n`);
    f.write(`IconPosition = ${type.iconPosition}\r\n`);
    if (type.special()) f.write("IsSpecialType = true\r\n");
    if (type.pseudoType) f.write("IsPseudoType = true\r\n");
    if (type.flags.length > 0) f.write(`Flags = ${type.flags.join(",")}\r\n`);
    if (type.weaknesses.length > 0) f.write(`Weaknesses = ${type.weaknesses.join(",")}\r\n`);
    if (type.resistances.length > 0) f.write(`Resistances = ${type.resistances.join(",")}\r\n`);
    if (type.immunities.length > 0) f.write(`Immunities = ${type.immunities.join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save ability data to PBS file
//=============================================================================
export function* writeAbilitiesSteps(path = "PBS/abilities.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  // Write each ability in turn
  for (const ability of GameData.Ability.each()) {
    f.write("#-------------------------------\r\n");
    f.write(`[${ability.id}]\r\n`);
    f.write(`Name = ${ability.realName}\r\n`);
    f.write(`Description = ${ability.realDescription}\r\n`);
    if (ability.flags.length > 0) f.write(`Flags = ${ability.flags.join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save move data to PBS file
//=============================================================================
export function* writeMovesSteps(path = "PBS/moves.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  // Write each move in turn
  for (const move of GameData.Move.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write("#-------------------------------\r\n");
    f.write(`[${move.id}]\r\n`);
    f.write(`Name = ${move.realName}\r\n`);
    f.write(`Type = ${move.type}\r\n`);
    const category = rubyToS(MOVE_CATEGORIES[move.category]);
    f.write(`Category = ${category}\r\n`);
    if (move.baseDamage > 0) f.write(`Power = ${move.baseDamage}\r\n`);
    f.write(`Accuracy = ${move.accuracy}\r\n`);
    f.write(`TotalPP = ${move.totalPp}\r\n`);
    f.write(`Target = ${move.target}\r\n`);
    if (move.priority !== 0) f.write(`Priority = ${move.priority}\r\n`);
    f.write(`FunctionCode = ${move.functionCode}\r\n`);
    if (move.flags.length > 0) f.write(`Flags = ${move.flags.join(",")}\r\n`);
    if (move.effectChance > 0) f.write(`EffectChance = ${move.effectChance}\r\n`);
    f.write(`Description = ${move.realDescription}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save item data to PBS file
//=============================================================================
/** Essentials Deluxe's write_items (Compiler.rb:89): + PortionName(Plural) and HeldDescription. */
export function* writeItemsSteps(path = "PBS/items.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const item of GameData.Item.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    // Essentials Deluxe only declares these (attr_accessor); nothing sets them in v20.1.
    const portion = item as { realPortionName?: string | null; realPortionNamePlural?: string | null };
    f.write("#-------------------------------\r\n");
    f.write(`[${item.id}]\r\n`);
    f.write(`Name = ${item.realName}\r\n`);
    f.write(`NamePlural = ${item.realNamePlural}\r\n`);
    if (portion.realPortionName) f.write(`PortionName = ${portion.realPortionName}\r\n`);
    if (portion.realPortionNamePlural) f.write(`PortionNamePlural = ${portion.realPortionNamePlural}\r\n`);
    f.write(`Pocket = ${item.pocket}\r\n`);
    f.write(`Price = ${item.price}\r\n`);
    if (item.sellPrice !== Math.floor(item.price / 2)) f.write(`SellPrice = ${item.sellPrice}\r\n`);
    const fieldUse = hashKey(ITEM_FIELD_USES, item.fieldUse);
    if (fieldUse) f.write(`FieldUse = ${fieldUse}\r\n`);
    const battleUse = hashKey(ITEM_BATTLE_USES, item.battleUse);
    if (battleUse) f.write(`BattleUse = ${battleUse}\r\n`);
    if (!item.isImportant() && !item.consumable) f.write("Consumable = false\r\n");
    if (item.flags.length > 0) f.write(`Flags = ${item.flags.join(",")}\r\n`);
    if (item.move) f.write(`Move = ${item.move}\r\n`);
    f.write(`Description = ${item.realDescription}\r\n`);
    if (item.realHeldDescription) f.write(`HeldDescription = ${item.realHeldDescription}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save berry plant data to PBS file
//=============================================================================
export function* writeBerryPlantsSteps(path = "PBS/berry_plants.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  for (const bp of GameData.BerryPlant.each()) {
    f.write("#-------------------------------\r\n");
    f.write(`[${bp.id}]\r\n`);
    f.write(`HoursPerStage = ${bp.hoursPerStage}\r\n`);
    f.write(`DryingPerHour = ${bp.dryingPerHour}\r\n`);
    f.write(`Yield = ${bp.yield.join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save Pokémon data to PBS file
//=============================================================================
/** stats_array / evs_array: base stats in PBS order, and [stat, EV] pairs for EVs > 0. */
function statsAndEvs(species: Species): [number[], unknown[]] {
  const statsArray: number[] = [];
  const evsArray: unknown[] = [];
  for (const s of GameData.Stat.eachMain()) {
    if (s.pbsOrder < 0) continue;
    statsArray[s.pbsOrder] = species.baseStats[s.id]!;
    if (species.evs[s.id]! > 0) evsArray.push(s.id, species.evs[s.id]);
  }
  return [statsArray, evsArray];
}

/** The "Evolutions = " line's value. */
function evolutionsText(species: Species): string {
  let ret = "";
  let needComma = false;
  for (const evo of species.evolutions) {
    if (evo.prevolution) continue; // Skip prevolution entries
    if (needComma) ret += ",";
    needComma = true;
    const evoTypeData = GameData.Evolution.get(evo.method);
    const paramType = evoTypeData.parameter;
    ret += `${evo.species},${evoTypeData.id},`;
    if (paramType != null) {
      // Ruby writes getConstantName(param_type, evo[2]) when param_type is a
      // Symbol that isn't a GameData class; every symbol parameter type in
      // v20.1 (:Item, :Move, :Species, :Type) is one, and Integer/String are
      // classes, so it always writes evo[2].to_s.
      ret += rubyToS(evo.parameter);
    }
  }
  return ret;
}

const levelUpMoves = (species: Species) => rubyJoin(species.moves.map((m) => [m.level, m.move]), ",");

export function* writePokemonSteps(path = "PBS/pokemon.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const species of GameData.Species.eachSpecies()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write("#-------------------------------\r\n");
    f.write(`[${species.id}]\r\n`);
    f.write(`Name = ${species.realName}\r\n`);
    f.write(`Types = ${uniqCompact(species.types).join(",")}\r\n`);
    const [statsArray, evsArray] = statsAndEvs(species);
    f.write(`BaseStats = ${rubyJoin(statsArray, ",")}\r\n`);
    f.write(`GenderRatio = ${species.genderRatio}\r\n`);
    f.write(`GrowthRate = ${species.growthRate}\r\n`);
    f.write(`BaseExp = ${species.baseExp}\r\n`);
    f.write(`EVs = ${rubyJoin(evsArray, ",")}\r\n`);
    f.write(`CatchRate = ${species.catchRate}\r\n`);
    f.write(`Happiness = ${species.happiness}\r\n`);
    if (species.abilities.length > 0) {
      f.write(`Abilities = ${species.abilities.join(",")}\r\n`);
    }
    if (species.hiddenAbilities.length > 0) {
      f.write(`HiddenAbilities = ${species.hiddenAbilities.join(",")}\r\n`);
    }
    if (species.moves.length > 0) {
      f.write(`Moves = ${levelUpMoves(species)}\r\n`);
    }
    if (species.tutorMoves.length > 0) {
      f.write(`TutorMoves = ${species.tutorMoves.join(",")}\r\n`);
    }
    if (species.eggMoves.length > 0) {
      f.write(`EggMoves = ${species.eggMoves.join(",")}\r\n`);
    }
    if (species.eggGroups.length > 0) {
      f.write(`EggGroups = ${species.eggGroups.join(",")}\r\n`);
    }
    f.write(`HatchSteps = ${species.hatchSteps}\r\n`);
    if (species.incense) f.write(`Incense = ${species.incense}\r\n`);
    if (species.offspring.length > 0) {
      f.write(`Offspring = ${species.offspring.join(",")}\r\n`);
    }
    f.write(`Height = ${(species.height / 10).toFixed(1)}\r\n`);
    f.write(`Weight = ${(species.weight / 10).toFixed(1)}\r\n`);
    f.write(`Color = ${species.color}\r\n`);
    f.write(`Shape = ${species.shape}\r\n`);
    if (species.habitat !== "None") f.write(`Habitat = ${species.habitat}\r\n`);
    f.write(`Category = ${species.realCategory}\r\n`);
    f.write(`Pokedex = ${species.realPokedexEntry}\r\n`);
    if (species.realFormName && species.realFormName.length > 0) f.write(`FormName = ${species.realFormName}\r\n`);
    if (species.generation !== 0) f.write(`Generation = ${species.generation}\r\n`);
    if (species.flags.length > 0) f.write(`Flags = ${species.flags.join(",")}\r\n`);
    if (species.wildItemCommon.length > 0) f.write(`WildItemCommon = ${species.wildItemCommon.join(",")}\r\n`);
    if (species.wildItemUncommon.length > 0) f.write(`WildItemUncommon = ${species.wildItemUncommon.join(",")}\r\n`);
    if (species.wildItemRare.length > 0) f.write(`WildItemRare = ${species.wildItemRare.join(",")}\r\n`);
    if (species.evolutions.some((evo) => !evo.prevolution)) {
      f.write(`Evolutions = ${evolutionsText(species)}\r\n`);
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save Pokémon forms data to PBS file
//=============================================================================
export function* writePokemonFormsSteps(path = "PBS/pokemon_forms.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const species of GameData.Species.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    if (species.form === 0) continue;
    const baseSpecies = GameData.Species.get(species.species);
    const ne = (a: unknown, b: unknown) => !rubyEquals(a, b);
    f.write("#-------------------------------\r\n");
    f.write(`[${species.species},${species.form}]\r\n`);
    if (species.realFormName && species.realFormName.length > 0) f.write(`FormName = ${species.realFormName}\r\n`);
    if (species.pokedexForm !== species.form) f.write(`PokedexForm = ${species.pokedexForm}\r\n`);
    if (species.megaStone) f.write(`MegaStone = ${species.megaStone}\r\n`);
    if (species.megaMove) f.write(`MegaMove = ${species.megaMove}\r\n`);
    if (species.unmegaForm !== 0) f.write(`UnmegaForm = ${species.unmegaForm}\r\n`);
    if (species.megaMessage !== 0) f.write(`MegaMessage = ${species.megaMessage}\r\n`);
    if (ne(uniqCompact(species.types), uniqCompact(baseSpecies.types))) {
      f.write(`Types = ${uniqCompact(species.types).join(",")}\r\n`);
    }
    const [statsArray, evsArray] = statsAndEvs(species);
    if (ne(species.baseStats, baseSpecies.baseStats)) f.write(`BaseStats = ${rubyJoin(statsArray, ",")}\r\n`);
    if (species.baseExp !== baseSpecies.baseExp) f.write(`BaseExp = ${species.baseExp}\r\n`);
    if (ne(species.evs, baseSpecies.evs)) f.write(`EVs = ${rubyJoin(evsArray, ",")}\r\n`);
    if (species.catchRate !== baseSpecies.catchRate) f.write(`CatchRate = ${species.catchRate}\r\n`);
    if (species.happiness !== baseSpecies.happiness) f.write(`Happiness = ${species.happiness}\r\n`);
    if (species.abilities.length > 0 && ne(species.abilities, baseSpecies.abilities)) {
      f.write(`Abilities = ${species.abilities.join(",")}\r\n`);
    }
    if (species.hiddenAbilities.length > 0 && ne(species.hiddenAbilities, baseSpecies.hiddenAbilities)) {
      f.write(`HiddenAbilities = ${species.hiddenAbilities.join(",")}\r\n`);
    }
    if (species.moves.length > 0 && ne(species.moves, baseSpecies.moves)) {
      f.write(`Moves = ${levelUpMoves(species)}\r\n`);
    }
    if (species.tutorMoves.length > 0 && ne(species.tutorMoves, baseSpecies.tutorMoves)) {
      f.write(`TutorMoves = ${species.tutorMoves.join(",")}\r\n`);
    }
    if (species.eggMoves.length > 0 && ne(species.eggMoves, baseSpecies.eggMoves)) {
      f.write(`EggMoves = ${species.eggMoves.join(",")}\r\n`);
    }
    if (species.eggGroups.length > 0 && ne(species.eggGroups, baseSpecies.eggGroups)) {
      f.write(`EggGroups = ${species.eggGroups.join(",")}\r\n`);
    }
    if (species.hatchSteps !== baseSpecies.hatchSteps) f.write(`HatchSteps = ${species.hatchSteps}\r\n`);
    if (species.offspring.length > 0 && ne(species.offspring, baseSpecies.offspring)) {
      f.write(`Offspring = ${species.offspring.join(",")}\r\n`);
    }
    if (species.height !== baseSpecies.height) f.write(`Height = ${(species.height / 10).toFixed(1)}\r\n`);
    if (species.weight !== baseSpecies.weight) f.write(`Weight = ${(species.weight / 10).toFixed(1)}\r\n`);
    if (species.color !== baseSpecies.color) f.write(`Color = ${species.color}\r\n`);
    if (species.shape !== baseSpecies.shape) f.write(`Shape = ${species.shape}\r\n`);
    if (species.habitat !== "None" && species.habitat !== baseSpecies.habitat) {
      f.write(`Habitat = ${species.habitat}\r\n`);
    }
    if (species.realCategory !== baseSpecies.realCategory) f.write(`Category = ${species.realCategory}\r\n`);
    if (species.realPokedexEntry !== baseSpecies.realPokedexEntry) f.write(`Pokedex = ${species.realPokedexEntry}\r\n`);
    if (species.generation !== baseSpecies.generation) f.write(`Generation = ${species.generation}\r\n`);
    if (species.flags.length > 0 && ne(species.flags, baseSpecies.flags)) f.write(`Flags = ${species.flags.join(",")}\r\n`);
    if (ne(species.wildItemCommon, baseSpecies.wildItemCommon) ||
        ne(species.wildItemUncommon, baseSpecies.wildItemUncommon) ||
        ne(species.wildItemRare, baseSpecies.wildItemRare)) {
      if (species.wildItemCommon.length > 0) f.write(`WildItemCommon = ${species.wildItemCommon.join(",")}\r\n`);
      if (species.wildItemUncommon.length > 0) f.write(`WildItemUncommon = ${species.wildItemUncommon.join(",")}\r\n`);
      if (species.wildItemRare.length > 0) f.write(`WildItemRare = ${species.wildItemRare.join(",")}\r\n`);
    }
    if (ne(species.evolutions, baseSpecies.evolutions) && species.evolutions.some((evo) => !evo.prevolution)) {
      f.write(`Evolutions = ${evolutionsText(species)}\r\n`);
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Write species metrics
//=============================================================================
/** The Generation 8 Pack's write_pokemon_metrics (Custom Sprite Scales.rb:66): + FrontSpriteScale/BackSpriteScale. */
export function* writePokemonMetricsSteps(path = "PBS/pokemon_metrics.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  // Get in species order then in form order
  const sortArray: [number, Id, Id, number][] = [];
  const dexNumbers = new Map<Id, number>();
  let i = 0;
  for (const metrics of GameData.SpeciesMetrics.each()) {
    if (!dexNumbers.has(metrics.species)) dexNumbers.set(metrics.species, i);
    sortArray.push([dexNumbers.get(metrics.species)!, metrics.id, metrics.species, metrics.form]);
    i += 1;
  }
  sortArray.sort((a, b) => (a[0] === b[0] ? a[3] - b[3] : a[0] - b[0]));
  // Write file
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const val of sortArray) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    const species = GameData.SpeciesMetrics.get(val[1]);
    if (species.form > 0) {
      const baseSpecies = GameData.SpeciesMetrics.get(val[2]);
      if (rubyEquals(species.backSprite, baseSpecies.backSprite) &&
          rubyEquals(species.frontSprite, baseSpecies.frontSprite) &&
          species.frontSpriteAltitude === baseSpecies.frontSpriteAltitude &&
          species.shadowX === baseSpecies.shadowX &&
          species.shadowSize === baseSpecies.shadowSize) continue;
    } else if (rubyEquals(species.backSprite, [0, 0]) && rubyEquals(species.frontSprite, [0, 0]) &&
               species.frontSpriteAltitude === 0 &&
               species.shadowX === 0 && species.shadowSize === 2) {
      continue;
    }
    f.write("#-------------------------------\r\n");
    if (species.form > 0) {
      f.write(`[${species.species},${species.form}]\r\n`);
    } else {
      f.write(`[${species.species}]\r\n`);
    }
    f.write(`BackSprite = ${species.backSprite.join(",")}\r\n`);
    f.write(`FrontSprite = ${species.frontSprite.join(",")}\r\n`);
    if (species.frontSpriteAltitude !== 0) f.write(`FrontSpriteAltitude = ${species.frontSpriteAltitude}\r\n`);
    f.write(`ShadowX = ${species.shadowX}\r\n`);
    f.write(`ShadowSize = ${species.shadowSize}\r\n`);
    if (species.frontSpriteScale !== Settings.FRONT_BATTLER_SPRITE_SCALE) f.write(`FrontSpriteScale = ${species.frontSpriteScale}\r\n`);
    if (species.backSpriteScale !== Settings.BACK_BATTLER_SPRITE_SCALE) f.write(`BackSpriteScale = ${species.backSpriteScale}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save Shadow Pokémon data to PBS file
//=============================================================================
export function* writeShadowPokemonSteps(path = "PBS/shadow_pokemon.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const shadow of GameData.ShadowPokemon.each()) {
    if (idx % 150 === 0) yield DOT;
    idx += 1;
    f.write("#-------------------------------\r\n");
    f.write(`[${shadow.id}]\r\n`);
    f.write(`GaugeSize = ${shadow.gaugeSize}\r\n`);
    if (shadow.moves.length > 0) f.write(`Moves = ${shadow.moves.join(",")}\r\n`);
    if (shadow.flags.length > 0) f.write(`Flags = ${shadow.flags.join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save Regional Dexes to PBS file
//=============================================================================
export function* writeRegionalDexesSteps(path = "PBS/regional_dexes.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const dexLists = pbLoadRegionalDexes();
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  // Write each Dex list in turn
  dexLists.forEach((list, index) => {
    f.write("#-------------------------------\r\n");
    f.write(`[${index}]`);
    let comma = false;
    let currentFamily: Id[] | null = null;
    // (compile_regional_dexes raises on a missing dex number, so there are no nil lists)
    for (const species of list!) {
      if (!species) continue;
      if (currentFamily?.includes(species)) {
        if (comma) f.write(",");
      } else {
        currentFamily = GameData.Species.get(species).getFamilySpecies();
        comma = false;
        f.write("\r\n");
      }
      f.write(species);
      comma = true;
    }
    f.write("\r\n");
  });
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save ability data to PBS file
//=============================================================================
export function* writeRibbonsSteps(path = "PBS/ribbons.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  // Write each ability in turn
  for (const ribbon of GameData.Ribbon.each()) {
    f.write("#-------------------------------\r\n");
    f.write(`[${ribbon.id}]\r\n`);
    f.write(`Name = ${ribbon.realName}\r\n`);
    f.write(`IconPosition = ${ribbon.iconPosition}\r\n`);
    f.write(`Description = ${ribbon.realDescription}\r\n`);
    if (ribbon.flags.length > 0) f.write(`Flags = ${ribbon.flags.join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save wild encounter data to PBS file
//=============================================================================
const pad3 = (n: number) => (n < 0 ? `-${String(-n).padStart(2, "0")}` : String(n).padStart(3, "0"));

export function* writeEncountersSteps(path = "PBS/encounters.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const mapInfos = pbLoadMapInfos();
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const encounterData of GameData.Encounter.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write("#-------------------------------\r\n");
    const info = mapInfos.get(encounterData.map);
    const mapName = info ? ` # ${info.name}` : "";
    if (encounterData.version > 0) {
      f.write(`[${pad3(encounterData.map)},${encounterData.version}]${mapName}\r\n`);
    } else {
      f.write(`[${pad3(encounterData.map)}]${mapName}\r\n`);
    }
    for (const [type, slots] of Object.entries(encounterData.types)) {
      if (!slots || slots.length === 0) continue;
      const stepChance = encounterData.stepChances[type];
      if (stepChance && stepChance > 0) {
        f.write(`${type},${stepChance}\r\n`);
      } else {
        f.write(`${type}\r\n`);
      }
      for (const slot of slots) {
        if (slot.minLevel === slot.maxLevel) {
          f.write(`    ${slot.chance},${slot.species},${slot.minLevel}\r\n`);
        } else {
          f.write(`    ${slot.chance},${slot.species},${slot.minLevel},${slot.maxLevel}\r\n`);
        }
      }
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save trainer type data to PBS file
//=============================================================================
export function* writeTrainerTypesSteps(path = "PBS/trainer_types.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  for (const t of GameData.TrainerType.each()) {
    f.write("#-------------------------------\r\n");
    f.write(`[${t.id}]\r\n`);
    f.write(`Name = ${t.realName}\r\n`);
    const gender = hashKey(TRAINER_TYPE_GENDERS, t.gender);
    f.write(`Gender = ${rubyToS(gender)}\r\n`);
    f.write(`BaseMoney = ${t.baseMoney}\r\n`);
    if (t.skillLevel !== t.baseMoney) f.write(`SkillLevel = ${t.skillLevel}\r\n`);
    if (t.flags.length > 0) f.write(`Flags = ${t.flags.join(",")}\r\n`);
    if (!nilOrEmpty(t.introBGM)) f.write(`IntroBGM = ${t.introBGM}\r\n`);
    if (!nilOrEmpty(t.battleBGM)) f.write(`BattleBGM = ${t.battleBGM}\r\n`);
    if (!nilOrEmpty(t.victoryBGM)) f.write(`VictoryBGM = ${t.victoryBGM}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save individual trainer data to PBS file
//=============================================================================
/** Essentials Deluxe's write_trainers (Compiler.rb:121): + the plugin Pokémon properties. */
export function* writeTrainersSteps(path = "PBS/trainers.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const trainer of GameData.Trainer.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write("#-------------------------------\r\n");
    if (trainer.version > 0) {
      f.write(`[${trainer.trainerType},${trainer.realName},${trainer.version}]\r\n`);
    } else {
      f.write(`[${trainer.trainerType},${trainer.realName}]\r\n`);
    }
    if (trainer.items.length > 0) f.write(`Items = ${trainer.items.join(",")}\r\n`);
    if (trainer.realLoseText && trainer.realLoseText.length > 0) {
      f.write(`LoseText = ${trainer.realLoseText}\r\n`);
    }
    // Ruby truthiness: only nil and false are false (a form/gender/ability index of 0 is written).
    for (const pkmn of trainer.pokemon) {
      f.write(`Pokemon = ${pkmn.species},${pkmn.level}\r\n`);
      if (pkmn.name && pkmn.name.length > 0) f.write(`    Name = ${pkmn.name}\r\n`);
      if (pkmn.form != null && pkmn.form > 0) f.write(`    Form = ${pkmn.form}\r\n`);
      if (pkmn.gender != null) f.write(`    Gender = ${pkmn.gender === 1 ? "female" : "male"}\r\n`);
      if (pkmn.shininess && !pkmn.superShininess) f.write("    Shiny = yes\r\n");
      if (pkmn.superShininess) f.write("    SuperShiny = yes\r\n");
      if (pkmn.shadowness) f.write("    Shadow = yes\r\n");
      if (pkmn.moves && pkmn.moves.length > 0) f.write(`    Moves = ${pkmn.moves.join(",")}\r\n`);
      if (pkmn.ability != null) f.write(`    Ability = ${pkmn.ability}\r\n`);
      if (pkmn.abilityIndex != null) f.write(`    AbilityIndex = ${pkmn.abilityIndex}\r\n`);
      if (pkmn.item != null) f.write(`    Item = ${pkmn.item}\r\n`);
      if (pkmn.nature != null) f.write(`    Nature = ${pkmn.nature}\r\n`);
      const ivsArray: number[] = [];
      const evsArray: number[] = [];
      for (const s of GameData.Stat.eachMain()) {
        if (s.pbsOrder < 0) continue;
        if (pkmn.iv) ivsArray[s.pbsOrder] = pkmn.iv[s.id]!;
        if (pkmn.ev) evsArray[s.pbsOrder] = pkmn.ev[s.id]!;
      }
      if (pkmn.iv) f.write(`    IV = ${rubyJoin(ivsArray, ",")}\r\n`);
      if (pkmn.ev) f.write(`    EV = ${rubyJoin(evsArray, ",")}\r\n`);
      if (pkmn.happiness != null) f.write(`    Happiness = ${pkmn.happiness}\r\n`);
      if (pkmn.pokeBall != null) f.write(`    Ball = ${pkmn.pokeBall}\r\n`);
      if (pkmn.size != null) f.write(`    Size = ${pkmn.size}\r\n`);
      if (pkmn.trainerAce) f.write("    Ace = yes\r\n");
      if (installed("Improved Mementos") && pkmn.memento != null) f.write(`    Memento = ${pkmn.memento}\r\n`);
      if (installed("Focus Meter System") && pkmn.focus != null) f.write(`    Focus = ${pkmn.focus}\r\n`);
      if (installed("Pokémon Birthsigns") && pkmn.birthsign != null) f.write(`    Birthsign = ${pkmn.birthsign}\r\n`);
      if (installed("ZUD Mechanics")) {
        if (pkmn.dynamaxLvl != null) f.write(`    DynamaxLvl = ${pkmn.dynamaxLvl}\r\n`);
        if (pkmn.gmaxfactor) f.write("    Gigantamax = yes\r\n");
        if (pkmn.nodynamax) f.write("    NoDynamax = yes\r\n");
      }
      if (installed("PLA Battle Styles") && pkmn.mastery) f.write("    Mastery = yes\r\n");
      if (installed("Terastal Phenomenon") && pkmn.teratype != null) f.write(`    TeraType = ${pkmn.teratype}\r\n`);
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save trainer list data to PBS file
//=============================================================================
export function* writeTrainerListsSteps(path: string, trainerlists: TrainerList[] | null): WriteSteps {
  if (!trainerlists) return;
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  for (const tr of trainerlists) {
    yield DOT;
    f.write("#-------------------------------\r\n");
    f.write((tr.isDefault ? "[DefaultTrainerList]" : "[TrainerList]") + "\r\n");
    f.write("Trainers = " + tr.trainersFile + "\r\n");
    f.write("Pokemon = " + tr.pokemonFile + "\r\n");
    if (!tr.isDefault) f.write("Challenges = " + tr.challenges.join(",") + "\r\n");
    yield* writeBattleTowerTrainersSteps(tr.trainers, "PBS/" + tr.trainersFile);
    yield* writeBattleTowerPokemonSteps(tr.pokemon, "PBS/" + tr.pokemonFile);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save Battle Tower trainer data to PBS file
//=============================================================================
const BT_TRAINERS_REQUIRED_TYPES: Record<string, Schema> = {
  Type: [0, "e", null], // Specifies a trainer
  Name: [1, "s"],
  BeginSpeech: [2, "s"],
  EndSpeechWin: [3, "s"],
  EndSpeechLose: [4, "s"],
  PokemonNos: [5, "*u"],
};

/** A Battle Tower trainer as Ruby's record: [type, name, begin speech, win speech, lose speech, Pokémon numbers]. */
function facilityTrainerRecord(t: FacilityTrainer): unknown[] {
  return [t.trainerType, t.name, t.beginSpeech, t.endSpeechWin, t.endSpeechLose, t.pokemonNos];
}

export function* writeBattleTowerTrainersSteps(bttrainers: (FacilityTrainer | null)[] | null, filename: string | null): WriteSteps {
  if (!bttrainers || !filename) return;
  const f = new PbsFile(filename);
  addPBSHeaderToFile(f);
  for (let i = 0; i < bttrainers.length; i++) {
    const trainer = bttrainers[i];
    if (!trainer) continue;
    f.write("#-------------------------------\r\n");
    f.write(`[${pad3(i)}]\r\n`);
    for (const key of Object.keys(BT_TRAINERS_REQUIRED_TYPES)) {
      const schema = BT_TRAINERS_REQUIRED_TYPES[key]!;
      const record = facilityTrainerRecord(trainer)[schema[0] as number];
      if (record == null) continue;
      f.write(`${key} = `);
      switch (key) {
        case "Type":
          f.write(rubyToS(record));
          break;
        case "PokemonNos":
          f.write(rubyJoin(record as unknown[], ",")); // pbWriteCsvRecord somehow won't work here
          break;
        default:
          pbWriteCsvRecord(record, f, schema);
      }
      f.write("\r\n");
    }
  }
  yield f;
  yield UPDATE;
}

//=============================================================================
// Save Battle Tower Pokémon data to PBS file
//=============================================================================
export function* writeBattleTowerPokemonSteps(btpokemon: FacilityPokemon[] | null, filename: string | null): WriteSteps {
  if (!btpokemon || !filename) return;
  const species = new Map<Id, string>();
  const moves = new Map<Id, string>();
  const items = new Map<Id, string>();
  const natures = new Map<Id, string>();
  const evs: Record<string, string> = {
    HP: "HP",
    ATTACK: "ATK",
    DEFENSE: "DEF",
    SPECIAL_ATTACK: "SA",
    SPECIAL_DEFENSE: "SD",
    SPEED: "SPD",
  };
  const cached = (cache: Map<Id, string>, key: Id, value: () => string) => {
    if (!cache.has(key)) cache.set(key, value());
    return cache.get(key)!;
  };
  const f = new PbsFile(filename);
  addPBSHeaderToFile(f);
  f.write("#-------------------------------\r\n");
  for (let i = 0; i < btpokemon.length; i++) {
    if (i % 500 === 0) yield UPDATE;
    const pkmn = btpokemon[i]!;
    const c1 = cached(species, pkmn.species!, () => GameData.Species.get(pkmn.species!).species);
    let c2: string | null = null;
    if (pkmn.item && GameData.Item.exists(pkmn.item)) {
      c2 = cached(items, pkmn.item, () => GameData.Item.get(pkmn.item!).id);
    }
    const c3 = cached(natures, pkmn.nature!, () => GameData.Nature.get(pkmn.nature!).id);
    let evlist = "";
    pkmn.ev.forEach((stat, j) => {
      if (j > 0) evlist += ",";
      if (evs[stat] === undefined) throw new TypeError("no implicit conversion of nil into String"); // evlist += nil
      evlist += evs[stat];
    });
    let c4 = "", c5 = "", c6 = "", c7 = "";
    [pkmn.move1, pkmn.move2, pkmn.move3, pkmn.move4].forEach((move, j) => {
      if (!move) return;
      const text = cached(moves, move, () => GameData.Move.get(move).id);
      switch (j) {
        case 0: c4 = text; break;
        case 1: c5 = text; break;
        case 2: c6 = text; break;
        case 3: c7 = text; break;
      }
    });
    f.write(`${c1};${rubyToS(c2)};${c3};${evlist};${c4},${c5},${c6},${c7}\r\n`);
  }
  yield f;
  yield UPDATE;
}

//=============================================================================
// Save metadata data to PBS file
//=============================================================================
export function* writeMetadataSteps(path = "PBS/metadata.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  addPBSHeaderToFile(f);
  // Write metadata
  f.write("#-------------------------------\r\n");
  f.write("[0]\r\n");
  const metadata = GameData.Metadata.get();
  let schema = METADATA_SCHEMA;
  let keys = sortedKeys(schema);
  for (const key of keys) {
    const record = metadata.propertyFromString(key);
    if (record == null || (Array.isArray(record) && record.length === 0)) continue;
    f.write(`${key} = `);
    pbWriteCsvRecord(record, f, schema[key]!);
    f.write("\r\n");
  }
  // Write player metadata
  schema = PLAYER_METADATA_SCHEMA;
  keys = sortedKeys(schema);
  for (const playerData of GameData.PlayerMetadata.each()) {
    f.write("#-------------------------------\r\n");
    f.write(`[${playerData.id}]\r\n`);
    for (const key of keys) {
      const record = playerData.propertyFromString(key);
      if (record == null || (Array.isArray(record) && record.length === 0)) continue;
      f.write(`${key} = `);
      pbWriteCsvRecord(record, f, schema[key]!);
      f.write("\r\n");
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// Save map metadata data to PBS file
//=============================================================================
export function* writeMapMetadataSteps(path = "PBS/map_metadata.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const mapInfos = pbLoadMapInfos();
  const schema = MAP_METADATA_SCHEMA;
  const keys = sortedKeys(schema);
  const f = new PbsFile(path);
  let idx = 0;
  addPBSHeaderToFile(f);
  for (const mapData of GameData.MapMetadata.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write("#-------------------------------\r\n");
    const mapName = mapInfos.get(mapData.id)?.name ?? null;
    if (mapName != null) {
      f.write(`[${pad3(mapData.id)}]   # ${mapName}\r\n`);
      if (nilOrEmpty(mapData.realName)) f.write(`Name = ${mapName}\r\n`);
    } else {
      f.write(`[${pad3(mapData.id)}]\r\n`);
    }
    for (const key of keys) {
      const record = mapData.propertyFromString(key);
      if (record == null || (Array.isArray(record) && record.length === 0)) continue;
      f.write(`${key} = `);
      pbWriteCsvRecord(record, f, schema[key]!);
      f.write("\r\n");
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//===============================================================================
// Improved Field Skills ([001] Field Skills.rb:349)
//===============================================================================
/** Writes the field_skills.txt PBS file. */
export function* writeFieldSkillsSteps(path = "PBS/Plugins/Improved Field Skills/field_skills.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  for (const s of GameData.Species.each()) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    const skills: Id[] = [];
    const moves = s.getFamilyMoves();
    for (const skill of Settings.HM_SKILLS) if (moves.includes(skill)) skills.push(skill);
    for (const skill of Settings.MISC_SKILLS) if (moves.includes(skill)) skills.push(skill);
    for (const skill of Settings.HEAL_SKILLS) if (moves.includes(skill)) skills.push(skill);
    for (const skill of Settings.CUSTOM_SKILLS) if (moves.includes(skill)) skills.push(skill);
    if (skills.length > 0) {
      f.write("#-------------------------------\r\n");
      f.write(`[${s.id}]\r\n`);
      f.write(`Skills = ${skills.join(",")}\r\n`);
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//===============================================================================
// ZUD Mechanics ([000] General/Compiler.rb)
//===============================================================================
/** write_habitats (Compiler.rb:9; nothing calls it). */
export function* writeHabitatsSteps(path = "PBS/Plugins/ZUD/pokemon.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  for (const s of GameData.Species.each()) {
    const baseform = GameData.Species.get(s.species);
    if (s.form > 0 && s.habitat === baseform.habitat) continue;
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write("#-------------------------------\r\n");
    f.write(`[${s.id}]\r\n`);
    if (s.habitat !== "None") f.write(`Habitat = ${s.habitat}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

/** Writes the raid_ranks.txt file (Compiler.rb:80). */
export function* writeRaidRanksSteps(path = "PBS/Plugins/ZUD/raid_ranks.txt"): WriteSteps {
  const data = pbGetRaidRank().total;
  if (!data) return;
  yield () => Console.echoLi("'ZUD Mechanics'");
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  f.write("# This installation is part of the ZUD Plugin for Pokemon Essentials v20.1\r\n");
  f.write("#-------------------------------\r\n");
  for (const species of data) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    f.write(`${species} = ${raidRanksAppearedIn(species).join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

/** Writes the adventure_maps.txt file (Compiler.rb:158). */
export function* writeLairMapsSteps(path: string, mapdata: AdventureMaps | null): WriteSteps {
  if (!mapdata) return;
  yield () => Console.echoLi("'ZUD Mechanics'");
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  let idx = 0;
  f.write("# This installation is part of the ZUD Plugin for Pokemon Essentials v20.1\r\n");
  for (let i = 0; i < mapdata.length; i++) {
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    const map = mapdata[i];
    if (!map) continue;
    f.write("#-------------------------------\r\n");
    f.write(`[${i}]\r\n`);
    for (const [key, value] of Object.entries(map)) {
      if (Array.isArray(value)) {
        f.write(`${key} = ${rubyJoin(value, ",")}\r\n`);
      } else {
        f.write(`${key} = ${rubyToS(value)}\r\n`);
      }
    }
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

/** Writes dynamax_metrics.txt from SpeciesMetrics data (Compiler.rb:260). */
export function* writeDynamaxMetricsSteps(path = "PBS/Plugins/ZUD/dynamax_metrics.txt"): WriteSteps {
  if (installed("Generation 8 Pack Scripts")) path = "PBS/Plugins/ZUD/dynamax_metrics_ebdx.txt";
  yield () => Console.echoLi("'ZUD Mechanics'");
  yield writePbsFileMessageStart(path);
  let idx = 0;
  const f = new PbsFile(path);
  f.write("# This installation is part of the ZUD Plugin for Pokemon Essentials v20.1\r\n");
  for (const species of GameData.Species.each()) {
    if (species.noDynamax) continue;
    if (idx % 50 === 0) yield DOT;
    idx += 1;
    if (idx % 250 === 0) yield UPDATE;
    const speciesMetrics = GameData.SpeciesMetrics.get(species.id);
    f.write("#-------------------------------\r\n");
    f.write(`[${species.id}]\r\n`);
    f.write(`DmaxBackSprite  = ${speciesMetrics.dmaxBackSprite.join(",")}\r\n`);
    f.write(`DmaxFrontSprite = ${speciesMetrics.dmaxFrontSprite.join(",")}\r\n`);
    if (speciesMetrics.dmaxAltitude !== 0) f.write(`DmaxAltitude    = ${speciesMetrics.dmaxAltitude}\r\n`);
    f.write(`DmaxShadowX     = ${speciesMetrics.dmaxShadowX}\r\n`);
    f.write(`DmaxShadowSize  = ${speciesMetrics.dmaxShadowSize}\r\n`);
    if (!species.hasGmax()) continue;
    f.write(`GmaxBackSprite  = ${speciesMetrics.gmaxBackSprite.join(",")}\r\n`);
    f.write(`GmaxFrontSprite = ${speciesMetrics.gmaxFrontSprite.join(",")}\r\n`);
    if (speciesMetrics.gmaxAltitude !== 0) f.write(`GmaxAltitude    = ${speciesMetrics.gmaxAltitude}\r\n`);
    f.write(`GmaxShadowX     = ${speciesMetrics.gmaxShadowX}\r\n`);
    f.write(`GmaxShadowSize  = ${speciesMetrics.gmaxShadowSize}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

/** Writes the power_moves.txt file from GameData::PowerMove and Species data (Compiler.rb:404). */
export function* writePowerMovesSteps(path = "PBS/Plugins/ZUD/power_moves.txt"): WriteSteps {
  yield writePbsFileMessageStart(path);
  const f = new PbsFile(path);
  const s = rubyToS;
  f.write("# This installation is part of the ZUD Plugin for Pokemon Essentials v20.1\r\n");
  f.write("#########################################################################\r\n");
  f.write("# SECTION 1 : GENERIC POWER MOVES\r\n");
  f.write("# Power Moves linked to a particular Type.\r\n");
  f.write("#########################################################################\r\n");
  for (const pm of GameData.PowerMove.each()) {
    if (!pm.generic()) continue;
    f.write(`[${pm.id}]\r\n`);
    f.write(`MaxMove = ${s(pm.maxmove)}\r\n`);
    f.write(`ZMove   = ${s(pm.zmove)}\r\n`);
    f.write(`Item    = ${s(pm.item)}\r\n`);
    f.write("#-------------------------------\r\n");
  }
  f.write("#########################################################################\r\n");
  f.write("# SECTION 2 : EXCLUSIVE Z-MOVES\r\n");
  f.write("# Power Moves exclusive to a particular Item/Move/Species combo.\r\n");
  f.write("#########################################################################\r\n");
  for (const pm of GameData.PowerMove.each()) {
    if (!pm.isZMove() || !pm.exclusive()) continue;
    // NOTE (Ruby parity, ZUD Compiler.rb:426, :454): compile_power_moves (:377) already
    // replaced a flagged entry's species with the forms the flag matches (and
    // for "AllFormsAbove_n"/"AllFormsBelow_n" dropped the base species, leaving
    // [nil] if no form matched), so species.first isn't the species the file
    // named: PIKASHUNIUMZ's "Species = PIKACHU" comes back as "Species = ",
    // which compile_power_moves then rejects.
    const speciesIds = pm.flag ? [pm.species[0]] : pm.species;
    f.write("[ZMOVE]\r\n");
    f.write(`ZMove   = ${s(pm.zmove)}\r\n`);
    f.write(`Item    = ${s(pm.item)}\r\n`);
    f.write(`Move    = ${s(pm.move)}\r\n`);
    f.write(`Species = ${rubyJoin(speciesIds, ",")}\r\n`);
    if (pm.flag) f.write(`Flag    = ${pm.flag}\r\n`);
    f.write("#-------------------------------\r\n");
  }
  f.write("#########################################################################\r\n");
  f.write("# SECTION 3 : ULTRA BURST\r\n");
  f.write("# Exclusive form changes for a particular Item/Species combo.\r\n");
  f.write("#########################################################################\r\n");
  for (const pm of GameData.PowerMove.each()) {
    if (!pm.isUltra()) continue;
    f.write("[ULTRA]\r\n");
    f.write(`Species = ${rubyJoin(pm.species, ",")}\r\n`);
    f.write(`Item    = ${s(pm.item)}\r\n`);
    f.write(`Ultra   = ${s(pm.ultra)}\r\n`);
    f.write("#-------------------------------\r\n");
  }
  f.write("#########################################################################\r\n");
  f.write("# SECTION 4 : EXCLUSIVE G-MAX FORMS\r\n");
  f.write("# Power Moves exclusive to a particular Type/Species combo.\r\n");
  f.write("#########################################################################\r\n");
  for (const pm of GameData.PowerMove.each()) {
    if (!pm.gmax()) continue;
    const species = GameData.Species.get(pm.species[0]!);
    const speciesIds = pm.flag ? [pm.species[0]] : pm.species; // NOTE (Ruby parity): as in section 2
    f.write("[GMAX]\r\n");
    if (pm.maxmove) f.write(`MaxMove = ${pm.maxmove}\r\n`);
    if (pm.type) f.write(`Type    = ${pm.type}\r\n`);
    f.write(`Species = ${rubyJoin(speciesIds, ",")}\r\n`);
    if (pm.flag) f.write(`Flag    = ${pm.flag}\r\n`);
    f.write(`Name    = ${s(species.gmaxFormName)}\r\n`);
    f.write(`Height  = ${(species.gmaxHeight! / 10).toFixed(1)}\r\n`);
    f.write(`Pokedex = ${s(species.gmaxDexEntry)}\r\n`);
    f.write("#-------------------------------\r\n");
  }
  f.write("#########################################################################\r\n");
  f.write("# SECTION 5 : STATUS Z-MOVES\r\n");
  f.write("# Additional effects granted to Z-Powered status moves.\r\n");
  f.write("#########################################################################\r\n");
  f.write("[ZSTATUS]\r\n");
  const data = GameData.PowerMove.get("ZSTATUS");
  for (const key of POWER_MOVE_SCHEMA_KEYS) {
    let movelist: Id[] | null | undefined = null;
    switch (key) {
      case "AtkBoost1": movelist = data.statusAtk?.["1"]; break;
      case "AtkBoost2": movelist = data.statusAtk?.["2"]; break;
      case "AtkBoost3": movelist = data.statusAtk?.["3"]; break;
      case "DefBoost1": movelist = data.statusDef?.["1"]; break;
      case "DefBoost2": movelist = data.statusDef?.["2"]; break;
      case "DefBoost3": movelist = data.statusDef?.["3"]; break;
      case "SpAtkBoost1": movelist = data.statusSpatk?.["1"]; break;
      case "SpAtkBoost2": movelist = data.statusSpatk?.["2"]; break;
      case "SpAtkBoost3": movelist = data.statusSpatk?.["3"]; break;
      case "SpDefBoost1": movelist = data.statusSpdef?.["1"]; break;
      case "SpDefBoost2": movelist = data.statusSpdef?.["2"]; break;
      case "SpDefBoost3": movelist = data.statusSpdef?.["3"]; break;
      case "SpeedBoost1": movelist = data.statusSpeed?.["1"]; break;
      case "SpeedBoost2": movelist = data.statusSpeed?.["2"]; break;
      case "SpeedBoost3": movelist = data.statusSpeed?.["3"]; break;
      case "AccBoost1": movelist = data.statusAcc?.["1"]; break;
      case "AccBoost2": movelist = data.statusAcc?.["2"]; break;
      case "AccBoost3": movelist = data.statusAcc?.["3"]; break;
      case "EvaBoost1": movelist = data.statusEva?.["1"]; break;
      case "EvaBoost2": movelist = data.statusEva?.["2"]; break;
      case "EvaBoost3": movelist = data.statusEva?.["3"]; break;
      case "OmniBoost1": movelist = data.statusOmni?.["1"]; break;
      case "OmniBoost2": movelist = data.statusOmni?.["2"]; break;
      case "OmniBoost3": movelist = data.statusOmni?.["3"]; break;
      case "CritBoost": movelist = data.statusCrit; break;
      case "ResetStats": movelist = data.statusReset; break;
      case "HealUser": movelist = data.statusHeal?.["1"]; break;
      case "HealSwitch": movelist = data.statusHeal?.["2"]; break;
      case "FocusOnUser": movelist = data.statusFocus; break;
    }
    if (!movelist || movelist.length === 0) continue;
    f.write(`${key} = ${movelist.join(",")}\r\n`);
  }
  yield f;
  yield* processPbsFileMessageEnd();
}

//=============================================================================
// The writers
//=============================================================================
const run = runWriteSteps;

export const Compiler = {
  /** load_data("Data/<name>.dat") for the data the runtime doesn't keep loaded; replaceable (tests). */
  loadData: defaultLoadData as (file: string) => Promise<unknown>,

  addPBSHeaderToFile,
  csvQuote,
  csvQuoteAlways,
  pbWriteCsvRecord,
  getConstantName,
  getConstantNameOrValue,
  writePbsFileMessageStart,
  processPbsFileMessageEnd,
  normalizeConnection,
  getConnectionText,

  writeTownMap: (path?: string) => run(writeTownMapSteps(path)),

  async writeConnections(path = "PBS/map_connections.txt"): Promise<void> {
    const conndata = (await Compiler.loadData("map-connections.json")) as MapConnection[] | null;
    await run(writeConnectionsSteps(path, conndata));
  },

  writePhone: (path?: string) => run(writePhoneSteps(path)),
  writeTypes: (path?: string) => run(writeTypesSteps(path)),
  writeAbilities: (path?: string) => run(writeAbilitiesSteps(path)),
  writeMoves: (path?: string) => run(writeMovesSteps(path)),
  writeItems: (path?: string) => run(writeItemsSteps(path)),
  writeBerryPlants: (path?: string) => run(writeBerryPlantsSteps(path)),
  writePokemon: (path?: string) => run(writePokemonSteps(path)),
  writePokemonForms: (path?: string) => run(writePokemonFormsSteps(path)),
  writePokemonMetrics: (path?: string) => run(writePokemonMetricsSteps(path)),
  writeShadowPokemon: (path?: string) => run(writeShadowPokemonSteps(path)),
  writeRegionalDexes: (path?: string) => run(writeRegionalDexesSteps(path)),
  writeRibbons: (path?: string) => run(writeRibbonsSteps(path)),
  writeEncounters: (path?: string) => run(writeEncountersSteps(path)),
  writeTrainerTypes: (path?: string) => run(writeTrainerTypesSteps(path)),
  writeTrainers: (path?: string) => run(writeTrainersSteps(path)),

  async writeTrainerLists(path = "PBS/battle_facility_lists.txt"): Promise<void> {
    const trainerlists = (await Compiler.loadData("trainer-lists.json").catch(() => null)) as TrainerList[] | null; // rescue nil
    await run(writeTrainerListsSteps(path, trainerlists));
  },

  writeBattleTowerTrainers: (bttrainers: (FacilityTrainer | null)[] | null, filename: string | null) =>
    run(writeBattleTowerTrainersSteps(bttrainers, filename)),
  writeBattleTowerPokemon: (btpokemon: FacilityPokemon[] | null, filename: string | null) =>
    run(writeBattleTowerPokemonSteps(btpokemon, filename)),
  writeMetadata: (path?: string) => run(writeMetadataSteps(path)),
  writeMapMetadata: (path?: string) => run(writeMapMetadataSteps(path)),

  // Plugins
  writeFieldSkills: (path?: string) => run(writeFieldSkillsSteps(path)),
  writeHabitats: (path?: string) => run(writeHabitatsSteps(path)),
  writeRaidRanks: (path?: string) => run(writeRaidRanksSteps(path)),

  async writeLairMaps(path = "PBS/Plugins/ZUD/adventure_maps.txt"): Promise<void> {
    const mapdata = (await Compiler.loadData("adventure-maps.json")) as AdventureMaps | null; // pbLoadLairMapData
    await run(writeLairMapsSteps(path, mapdata));
  },

  writeDynamaxMetrics: (path?: string) => run(writeDynamaxMetricsSteps(path)),
  writePowerMoves: (path?: string) => run(writePowerMovesSteps(path)),

  /** Save all data to PBS files (with Essentials Deluxe's plugin files, Compiler.rb:68). */
  async writeAll(): Promise<void> {
    Console.echoH1(_INTL("Writing all PBS files"));
    await Compiler.writeTownMap();
    await Compiler.writeConnections();
    await Compiler.writePhone();
    await Compiler.writeTypes();
    await Compiler.writeAbilities();
    await Compiler.writeMoves();
    await Compiler.writeItems();
    await Compiler.writeBerryPlants();
    await Compiler.writePokemon();
    await Compiler.writePokemonForms();
    await Compiler.writePokemonMetrics();
    await Compiler.writeShadowPokemon();
    await Compiler.writeRegionalDexes();
    await Compiler.writeRibbons();
    await Compiler.writeEncounters();
    await Compiler.writeTrainerTypes();
    await Compiler.writeTrainers();
    await Compiler.writeTrainerLists();
    await Compiler.writeMetadata();
    await Compiler.writeMapMetadata();
    echoln("");
    Console.echoH2("Successfully rewrote all PBS files", { text: "green" });
    // Essentials Deluxe
    if (PLUGIN_FILES.length > 0) {
      Console.echoH1(_INTL("Writing all PBS/Plugin files"));
      if (installed("Improved Field Skills")) {
        await Compiler.writeFieldSkills();
      }
      if (installed("ZUD Mechanics")) {
        await Compiler.writeDynamaxMetrics();
        await Compiler.writePowerMoves();
        await Compiler.writeRaidRanks();
        await Compiler.writeLairMaps();
      }
      if (installed("Pokémon Birthsigns")) {
        // Not ported: write_birthsigns (the Pokémon Birthsigns plugin isn't installed)
      }
      echoln("");
      Console.echoH2("Successfully compiled all additional PBS/Plugin files", { text: "green" });
    }
  },
};

//=============================================================================
// The text the writers write, without writing it (tests, previews)
//=============================================================================
/** The one file a writer writes, or null if it writes nothing. */
function single(steps: WriteSteps): string | null {
  const files = writeStepsFiles(steps);
  return files.size > 0 ? [...files.values()][0]! : null;
}

export const PBSText = {
  townMap: (path?: string) => single(writeTownMapSteps(path)),
  connections: (conndata: MapConnection[] | null, path = "PBS/map_connections.txt") => single(writeConnectionsSteps(path, conndata)),
  phone: (path?: string) => single(writePhoneSteps(path)),
  types: (path?: string) => single(writeTypesSteps(path)),
  abilities: (path?: string) => single(writeAbilitiesSteps(path)),
  moves: (path?: string) => single(writeMovesSteps(path)),
  items: (path?: string) => single(writeItemsSteps(path)),
  berryPlants: (path?: string) => single(writeBerryPlantsSteps(path)),
  pokemon: (path?: string) => single(writePokemonSteps(path)),
  pokemonForms: (path?: string) => single(writePokemonFormsSteps(path)),
  pokemonMetrics: (path?: string) => single(writePokemonMetricsSteps(path)),
  shadowPokemon: (path?: string) => single(writeShadowPokemonSteps(path)),
  regionalDexes: (path?: string) => single(writeRegionalDexesSteps(path)),
  ribbons: (path?: string) => single(writeRibbonsSteps(path)),
  encounters: (path?: string) => single(writeEncountersSteps(path)),
  trainerTypes: (path?: string) => single(writeTrainerTypesSteps(path)),
  trainers: (path?: string) => single(writeTrainersSteps(path)),
  /** Every file write_trainer_lists writes (the list file, and each list's trainer and Pokémon files). */
  trainerLists: (trainerlists: TrainerList[] | null, path = "PBS/battle_facility_lists.txt") =>
    writeStepsFiles(writeTrainerListsSteps(path, trainerlists)),
  metadata: (path?: string) => single(writeMetadataSteps(path)),
  mapMetadata: (path?: string) => single(writeMapMetadataSteps(path)),
  fieldSkills: (path?: string) => single(writeFieldSkillsSteps(path)),
  habitats: (path?: string) => single(writeHabitatsSteps(path)),
  raidRanks: (path?: string) => single(writeRaidRanksSteps(path)),
  lairMaps: (mapdata: AdventureMaps | null, path = "PBS/Plugins/ZUD/adventure_maps.txt") => single(writeLairMapsSteps(path, mapdata)),
  /** Written to dynamax_metrics_ebdx.txt, as the Generation 8 Pack is installed. */
  dynamaxMetrics: (path?: string) => single(writeDynamaxMetricsSteps(path)),
  powerMoves: (path?: string) => single(writePowerMovesSteps(path)),
};
