// Port of Data/Scripts/020_Debug/001_Editor screens/001_EditorScreens.rb: the
// data editors of the Debug menu's "Editors..." (wild encounters, trainer
// types, individual trainers and their Pokémon, global/player/map metadata,
// items, Pokémon species, Regional Dexes) and the evolution family helpers.
// pbAnimationsOrganiser (the end of the file) is AnimationsOrganiser.ts.
// Folded in: Essentials Deluxe's TrainerPokemonProperty
// ([000] Essentials Patches/Trainer Data.rb:129), which adds the plugin
// properties of trainers' Pokémon.
//
// Saving: `GameData::X.save` + `Compiler.write_x` keep the edits in the loaded
// GameData and rewrite the PBS file through the dev server; `GameData::X.load`
// rereads the compiled JSON (see EditorData.ts). The data the property lists
// edit is in Ruby's shapes (an encounter slot is [chance, species, min, max],
// a level-up move [level, move], an evolution [species, method, parameter]);
// the GameData records hold objects, converted on the way in and out.

import { Compiler } from "../../compiler/WritePBS";
import { GameData, type Id } from "../../data/gameData";
import { pbLoadRegionalDexes, setMiscPBSData } from "../../data/gameData/miscPBSData";
import { Settings as GameSettings } from "../../data/gameData/settings";
import type {
  EncounterData, EncounterSlot, Evolution, ItemData, MapMetadataData, MetadataData, PlayerMetadataData, SpeciesData,
  TrainerData, TrainerPokemon, TrainerTypeData,
} from "../../data/pbs/types";
import { Data } from "../../data/store";
import { MetadataRecords } from "../../game/metadata";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { pbConvertTrainerData, pbGetFreeTrainerParty, pbNewTrainer } from "../../game/trainer/loadAndNew";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { _INTL } from "../../ui/messageConfig";
import {
  ChooseNumberParams, pbConfirmMessage, pbConfirmMessageSerious, pbMessage, pbMessageChooseNumber, pbShowCommands,
} from "../../ui/messages";
import { pbMessageFreeText } from "../../ui/party/mail";
import { Window_AdvancedTextPokemon, Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { pbDefaultMap } from "../DebugMenuExtraCode";
import {
  AbilityProperty, BallProperty, BaseStatsProperty, BGMProperty, BooleanProperty, BooleanProperty2, CharacterProperty,
  EffortValuesProperty, EggMovesProperty, EncounterSlotProperty, EnumProperty, EvolutionsProperty, EVsProperty,
  GameDataPoolProperty, GameDataProperty, GenderProperty, ItemNameProperty, ItemProperty, IVsProperty,
  LevelUpMovesProperty, LimitProperty, LimitProperty2, LimitStringProperty, MapCoordsFacingProperty,
  MapCoordsProperty, MapProperty, MapSizeProperty, MEProperty, MoveProperty, MovePropertyForSpecies,
  NonzeroLimitProperty, PocketProperty, pbPropertyList, ReadOnlyProperty, RegionMapCoordsProperty, SpeciesProperty,
  StringListProperty, StringProperty, TrainerTypeProperty, TypeProperty, WeatherEffectProperty, inspect,
  type EditorProperty, type EncounterSlot as SlotTuple, type EvolutionEntry, type LevelUpMove as MoveTuple,
  type PropertyListEntry,
} from "../EditorDataTypes";
import {
  ItemLister, MapLister, MetadataLister, pbListScreen, pbListScreenBlock, pbListWindow, SpeciesLister,
  TrainerBattleLister, TrainerTypeLister, type TrainerBattleId,
} from "../EditorListers";
import { pbChooseSpeciesList, pbCommands2, pbCommands3 } from "../EditorUtilities";
import { EditorScreens } from "../editorScreens";
import { gameDataLoad, gameDataSave, nilOrEmpty, pad3, rb, uniqCompact } from "./EditorData";

/** PluginManager.installed? for the plugins Essentials Deluxe's trainer editor asks about. */
const INSTALLED_PLUGINS = new Set(["Essentials Deluxe", "ZUD Mechanics"]);

/** Ruby's Symbol#<=> / String#<=> */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** pbLoadMapInfos[id] */
function mapInfo(id: number) {
  return Data.mapInfos.get(id) ?? null;
}

/** An encounter slot as the editors edit it, and back. */
export const slotToTuple = (s: EncounterSlot): SlotTuple => [s.chance, s.species, s.minLevel, s.maxLevel];
export const tupleToSlot = (t: SlotTuple): EncounterSlot => ({ chance: t[0], species: t[1]!, minLevel: t[2], maxLevel: t[3] ?? t[2] });

//===============================================================================
// Wild encounters editor
//===============================================================================
/** The key Ruby builds with sprintf("%s_%d", map, version).to_sym */
const encounterKey = (map: number, version: number) => `${map}_${version}`;

/** A new, empty encounter set (the hash pbEncountersEditor registers). */
function newEncounterHash(map: number, version: number): EncounterData {
  return { id: encounterKey(map, version), map, version, stepChances: {}, types: {} };
}

// Main editor method for editing wild encounters. Lists all defined encounter
// sets, and edits them.
export async function pbEncountersEditor(): Promise<void> {
  const commands: string[] = [];
  const maps: [number, number][] = [];
  const list = pbListWindow([]);
  const helpWindow = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Edit wild encounters"), Graphics.width / 2, 0, Graphics.width / 2, 96,
  );
  helpWindow.z = 99999;
  let ret = 0;
  let needRefresh = true;
  const sortMaps = () => maps.sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const indexOf = (map: number, version: number) => maps.findIndex((m) => m[0] === map && m[1] === version);
  for (;;) {
    if (needRefresh) {
      commands.length = 0;
      maps.length = 0;
      commands.push(_INTL("[Add new encounter set]"));
      for (const encData of GameData.Encounter.each()) {
        const name = mapInfo(encData.map)?.name ?? null;
        if (encData.version > 0 && name) {
          commands.push(`${pad3(encData.map)} (v.${encData.version}): ${name}`);
        } else if (encData.version > 0) {
          commands.push(`${pad3(encData.map)} (v.${encData.version})`);
        } else if (name) {
          commands.push(`${pad3(encData.map)}: ${name}`);
        } else {
          commands.push(pad3(encData.map));
        }
        maps.push([encData.map, encData.version]);
      }
      needRefresh = false;
    }
    ret = await pbCommands2(list, commands, -1, ret);
    if (ret === 0) { // Add new encounter set
      const newMapID: number = await pbListScreen(_INTL("Choose a map"), new MapLister(pbDefaultMap()));
      if (newMapID > 0) {
        const newVersion = await new LimitProperty2(999).set(_INTL("version number"), 0);
        if (newVersion !== null && newVersion >= 0) {
          if (GameData.Encounter.exists(newMapID, newVersion)) {
            await pbMessage(_INTL("A set of encounters for map {1} version {2} already exists.", newMapID, newVersion));
          } else {
            // Construct encounter hash
            GameData.Encounter.register(newEncounterHash(newMapID, newVersion));
            maps.push([newMapID, newVersion]);
            sortMaps();
            ret = indexOf(newMapID, newVersion) + 1;
            needRefresh = true;
          }
        }
      }
    } else if (ret > 0) { // Edit an encounter set
      const thisSet = maps[ret - 1]!;
      switch (await pbShowCommands(null, [_INTL("Edit"), _INTL("Copy"), _INTL("Delete"), _INTL("Cancel")], 4)) {
        case 0: // Edit
          await pbEncounterMapVersionEditor(GameData.Encounter.get(thisSet[0], thisSet[1])!);
          needRefresh = true;
          break;
        case 1: { // Copy
          const newMapID: number = await pbListScreen(_INTL("Copy to which map?"), new MapLister(thisSet[0]));
          if (newMapID > 0) {
            const newVersion = await new LimitProperty2(999).set(_INTL("version number"), 0);
            if (newVersion !== null && newVersion >= 0) {
              if (GameData.Encounter.exists(newMapID, newVersion)) {
                await pbMessage(_INTL("A set of encounters for map {1} version {2} already exists.", newMapID, newVersion));
              } else {
                // Construct encounter hash
                const encounterHash = newEncounterHash(newMapID, newVersion);
                const source = GameData.Encounter.get(thisSet[0], thisSet[1])!;
                for (const [type, value] of Object.entries(source.stepChances)) {
                  encounterHash.stepChances[type] = value;
                }
                for (const [type, slots] of Object.entries(source.types)) {
                  if (!type || !slots || slots.length === 0) continue;
                  encounterHash.types[type] = slots.map((slot) => ({ ...slot }));
                }
                GameData.Encounter.register(encounterHash);
                maps.push([newMapID, newVersion]);
                sortMaps();
                ret = indexOf(newMapID, newVersion) + 1;
                needRefresh = true;
              }
            }
          }
          break;
        }
        case 2: // Delete
          if (await pbConfirmMessage(_INTL("Delete the encounter set for map {1} version {2}?", thisSet[0], thisSet[1]))) {
            GameData.Encounter.DATA.delete(encounterKey(thisSet[0], thisSet[1]));
            ret -= 1;
            needRefresh = true;
          }
          break;
      }
    } else {
      break;
    }
  }
  if (await pbConfirmMessage(_INTL("Save changes?"))) {
    // GameData::Encounter.save; Compiler.write_encounters (rewrite PBS file encounters.txt)
    await gameDataSave("PBS/encounters.txt", () => Compiler.writeEncounters());
  } else {
    await gameDataLoad(GameData.Encounter);
  }
  list.dispose();
  helpWindow.dispose();
  Input.update();
}

type EncounterRecord = InstanceType<typeof GameData.Encounter>;

// Lists the map ID, version number and defined encounter types for the given
// encounter data (a GameData::Encounter instance), and edits them.
export async function pbEncounterMapVersionEditor(encData: EncounterRecord): Promise<void> {
  const commands: string[] = [];
  const encTypes: Id[] = [];
  const list = pbListWindow([]);
  const helpWindow = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Edit map's encounters"), Graphics.width / 2, 0, Graphics.width / 2, 96,
  );
  helpWindow.z = 99999;
  let ret = 0;
  let needRefresh = true;
  const types = encData.types as Record<Id, EncounterSlot[] | undefined>;
  const unusedTypes = () => {
    const newTypeCommands: string[] = [];
    const newTypes: Id[] = [];
    for (const enc of GameData.EncounterType.eachAlphabetically()) {
      if (types[enc.id]) continue;
      newTypeCommands.push(enc.realName);
      newTypes.push(enc.id);
    }
    return { newTypeCommands, newTypes };
  };
  // NOTE (Ruby parity): the cursor goes to the new type's row in the
  // *sorted* list of types, but the list shows them in the hash's order
  // (001_EditorScreens.rb:202, 231).
  const sortedIndex = (type: Id) => [...encTypes].sort(cmpStr).indexOf(type) + 2;
  for (;;) {
    if (needRefresh) {
      commands.length = 0;
      encTypes.length = 0;
      const mapName = mapInfo(encData.map)?.name ?? null;
      if (mapName) {
        commands.push(_INTL("Map ID={1} ({2})", encData.map, mapName));
      } else {
        commands.push(_INTL("Map ID={1}", encData.map));
      }
      commands.push(_INTL("Version={1}", encData.version));
      for (const [encType, slots] of Object.entries(types)) {
        if (!encType) continue;
        commands.push(_INTL("{1} (x{2})", encType, slots!.length));
        encTypes.push(encType);
      }
      commands.push(_INTL("[Add new encounter type]"));
      needRefresh = false;
    }
    ret = await pbCommands2(list, commands, -1, ret);
    if (ret === 0) { // Edit map ID
      const oldMapID = encData.map;
      const newMapID: number = await pbListScreen(_INTL("Choose a new map"), new MapLister(oldMapID));
      if (newMapID > 0 && newMapID !== oldMapID) {
        if (GameData.Encounter.exists(newMapID, encData.version)) {
          await pbMessage(_INTL("A set of encounters for map {1} version {2} already exists.", newMapID, encData.version));
        } else {
          GameData.Encounter.DATA.delete(encData.id);
          encData.map = newMapID;
          encData.id = encounterKey(encData.map, encData.version);
          GameData.Encounter.DATA.set(encData.id, encData);
          needRefresh = true;
        }
      }
    } else if (ret === 1) { // Edit version number
      const oldVersion = encData.version;
      const newVersion = await new LimitProperty2(999).set(_INTL("version number"), oldVersion);
      if (newVersion !== null && newVersion !== oldVersion) {
        if (GameData.Encounter.exists(encData.map, newVersion)) {
          await pbMessage(_INTL("A set of encounters for map {1} version {2} already exists.", encData.map, newVersion));
        } else {
          GameData.Encounter.DATA.delete(encData.id);
          encData.version = newVersion;
          encData.id = encounterKey(encData.map, encData.version);
          GameData.Encounter.DATA.set(encData.id, encData);
          needRefresh = true;
        }
      }
    } else if (ret === commands.length - 1) { // Add new encounter type
      const { newTypeCommands, newTypes } = unusedTypes();
      if (newTypeCommands.length > 0) {
        const chosenTypeCmd = await pbShowCommands(null, newTypeCommands, -1);
        if (chosenTypeCmd >= 0) {
          const newType = newTypes[chosenTypeCmd]!;
          encData.stepChances[newType] = GameData.EncounterType.get(newType).triggerChance;
          types[newType] = [];
          await pbEncounterTypeEditor(encData, newType);
          encTypes.push(newType);
          ret = sortedIndex(newType);
          needRefresh = true;
        }
      } else {
        await pbMessage(_INTL("There are no unused encounter types to add."));
      }
    } else if (ret > 0) { // Edit an encounter type (its step chance and slots)
      const thisType = encTypes[ret - 2]!;
      switch (await pbShowCommands(null, [_INTL("Edit"), _INTL("Copy"), _INTL("Delete"), _INTL("Cancel")], 4)) {
        case 0: // Edit
          await pbEncounterTypeEditor(encData, thisType);
          needRefresh = true;
          break;
        case 1: { // Copy
          const { newTypeCommands, newTypes } = unusedTypes();
          if (newTypeCommands.length > 0) {
            const chosenTypeCmd = await pbMessage(_INTL("Choose an encounter type to copy to."), newTypeCommands, -1);
            if (chosenTypeCmd >= 0) {
              const newType = newTypes[chosenTypeCmd]!;
              encData.stepChances[newType] = encData.stepChances[thisType]!;
              types[newType] = types[thisType]!.map((slot) => ({ ...slot }));
              encTypes.push(newType);
              ret = sortedIndex(newType);
              needRefresh = true;
            }
          } else {
            await pbMessage(_INTL("There are no unused encounter types to copy to."));
          }
          break;
        }
        case 2: // Delete
          if (await pbConfirmMessage(_INTL("Delete the encounter type {1}?", GameData.EncounterType.get(thisType).realName))) {
            delete encData.stepChances[thisType];
            delete types[thisType];
            needRefresh = true;
          }
          break;
      }
    } else {
      break;
    }
  }
  list.dispose();
  helpWindow.dispose();
  Input.update();
}

// Lists the step chance and encounter slots for the given encounter type in the
// given encounter data (a GameData::Encounter instance), and edits them.
export async function pbEncounterTypeEditor(encData: EncounterRecord, encType: Id): Promise<void> {
  const commands: string[] = [];
  const list = pbListWindow([]);
  const helpWindow = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Edit encounter slots"), Graphics.width / 2, 0, Graphics.width / 2, 96,
  );
  helpWindow.z = 99999;
  const types = encData.types as Record<Id, EncounterSlot[] | undefined>;
  let encTypeName = "";
  let ret = 0;
  let needRefresh = true;
  for (;;) {
    if (needRefresh) {
      encTypeName = GameData.EncounterType.get(encType).realName;
      commands.length = 0;
      commands.push(_INTL("Step chance={1}%", encData.stepChances[encType] || 0));
      commands.push(_INTL("Encounter type={1}", encTypeName));
      if (types[encType] && types[encType]!.length > 0) {
        for (const slot of types[encType]!) commands.push(EncounterSlotProperty.format(slotToTuple(slot)));
      }
      commands.push(_INTL("[Add new slot]"));
      needRefresh = false;
    }
    ret = await pbCommands2(list, commands, -1, ret);
    if (ret === 0) { // Edit step chance
      const oldStepChance = encData.stepChances[encType] || 0;
      const newStepChance = await new LimitProperty(255).set(_INTL("Step chance"), oldStepChance);
      if (newStepChance !== oldStepChance) {
        encData.stepChances[encType] = newStepChance;
        needRefresh = true;
      }
    } else if (ret === 1) { // Edit encounter type
      const newTypeCommands: string[] = [];
      const newTypes: Id[] = [];
      let chosenTypeCmd = 0;
      for (const enc of GameData.EncounterType.eachAlphabetically()) {
        if (types[enc.id] && enc.id !== encType) continue;
        newTypeCommands.push(enc.realName);
        newTypes.push(enc.id);
        if (enc.id === encType) chosenTypeCmd = newTypeCommands.length - 1;
      }
      chosenTypeCmd = await pbShowCommands(null, newTypeCommands, -1, chosenTypeCmd);
      if (chosenTypeCmd >= 0 && newTypes[chosenTypeCmd] !== encType) {
        const newType = newTypes[chosenTypeCmd]!;
        encData.stepChances[newType] = encData.stepChances[encType]!;
        delete encData.stepChances[encType];
        types[newType] = types[encType];
        delete types[encType];
        encType = newType;
        needRefresh = true;
      }
    } else if (ret === commands.length - 1) { // Add new encounter slot
      const newSlotData = await EncounterSlotProperty.set(encTypeName, null);
      if (newSlotData) {
        types[encType]!.push(tupleToSlot(newSlotData));
        needRefresh = true;
      }
    } else if (ret > 0) { // Edit a slot
      switch (await pbShowCommands(null, [_INTL("Edit"), _INTL("Copy"), _INTL("Delete"), _INTL("Cancel")], 4)) {
        case 0: { // Edit
          const oldSlotData = slotToTuple(types[encType]![ret - 2]!);
          const newSlotData = await EncounterSlotProperty.set(encTypeName, [...oldSlotData] as SlotTuple);
          if (newSlotData && newSlotData.some((v, i) => v !== oldSlotData[i])) {
            types[encType]![ret - 2] = tupleToSlot(newSlotData);
            needRefresh = true;
          }
          break;
        }
        case 1: // Copy
          types[encType]!.splice(ret - 1, 0, { ...types[encType]![ret - 2]! });
          ret += 1;
          needRefresh = true;
          break;
        case 2: // Delete
          if (await pbConfirmMessage(_INTL("Delete this encounter slot?"))) {
            types[encType]!.splice(ret - 2, 1);
            needRefresh = true;
          }
          break;
      }
    } else {
      break;
    }
  }
  list.dispose();
  helpWindow.dispose();
  Input.update();
}

//===============================================================================
// Trainer type editor
//===============================================================================
/** GameData::TrainerType::SCHEMA["Gender"][2]'s names, by value (the first key of each). */
const TRAINER_GENDERS = ["Male", "Female", "Unknown"];

/** The trainer type editor's property list (pbTrainerTypeEditor's trainer_type_properties). */
export function trainerTypeProperties(): PropertyListEntry[] {
  return [
    [_INTL("ID"), ReadOnlyProperty, _INTL("ID of this Trainer Type (used as a symbol like :XXX).")],
    [_INTL("Name"), StringProperty, _INTL("Name of this Trainer Type as displayed by the game.")],
    [_INTL("Gender"), new EnumProperty(TRAINER_GENDERS), _INTL("Gender of this Trainer Type.")],
    [_INTL("BaseMoney"), new LimitProperty(9999), _INTL("Player earns this much money times the highest level among the trainer's Pokémon.")],
    [_INTL("SkillLevel"), new LimitProperty(9999), _INTL("Skill level of this Trainer Type.")],
    [_INTL("Flags"), StringListProperty as unknown as EditorProperty, _INTL("Words/phrases that can be used to make trainers of this type behave differently to others.")],
    [_INTL("IntroBGM"), BGMProperty, _INTL("BGM played before battles against trainers of this type.")],
    [_INTL("BattleBGM"), BGMProperty, _INTL("BGM played in battles against trainers of this type.")],
    [_INTL("VictoryBGM"), BGMProperty, _INTL("BGM played when player wins battles against trainers of this type.")],
  ];
}

/** The data pbTrainerTypeEditor edits for a trainer type. */
export function trainerTypeEditorData(trType: Id): unknown[] {
  const tData = GameData.TrainerType.get(trType);
  return [
    tData.id, tData.realName, tData.gender, tData.baseMoney, tData.skillLevel, tData.flags,
    tData.introBGM, tData.battleBGM, tData.victoryBGM,
  ];
}

/** pbTrainerTypeEditor's save: registers the edited trainer type and rewrites the PBS files. */
export async function trainerTypeEditorSave(trType: Id, data: unknown[]): Promise<void> {
  // Construct trainer type hash
  const typeHash = {
    id: trType,
    name: data[1] as string,
    gender: data[2] as 0 | 1 | 2,
    baseMoney: data[3] as number,
    skillLevel: data[4] as number,
    flags: data[5] as string[],
    introBGM: data[6] as string | null,
    battleBGM: data[7] as string | null,
    victoryBGM: data[8] as string | null,
  } satisfies TrainerTypeData;
  // Add trainer type's data to records
  GameData.TrainerType.register(typeHash);
  // GameData::TrainerType.save
  await pbConvertTrainerData();
}

export async function pbTrainerTypeEditor(): Promise<void> {
  const properties = trainerTypeProperties();
  await pbListScreenBlock(_INTL("Trainer Types"), new TrainerTypeLister(0, true), async (button, trType) => {
    if (!rb(trType)) return;
    switch (button) {
      case Input.ACTION:
        if (typeof trType === "string" && await pbConfirmMessageSerious("Delete this trainer type?")) {
          GameData.TrainerType.DATA.delete(trType);
          await pbConvertTrainerData(); // GameData::TrainerType.save
          await pbMessage(_INTL("The Trainer type was deleted."));
        }
        break;
      case Input.USE:
        if (typeof trType === "string") {
          const data = trainerTypeEditorData(trType);
          if (await pbPropertyList(trType, data, properties, true)) await trainerTypeEditorSave(trType, data);
        } else { // Add a new trainer type
          await pbTrainerTypeEditorNew(null);
        }
        break;
    }
  });
}

/**
 * The ID pbItemEditorNew / pbTrainerTypeEditorNew generate from a name
 * (prefix "ITEM" / "T"), or null if 100 numbered variants are all taken.
 */
export function generateEditorID(name: string, prefix: string, count: number, exists: (id: string) => boolean): string | null {
  // Generate an ID based on the item name
  let id = name.replace(/é/g, "e");
  id = id.replace(/[^A-Za-z0-9_]/g, "");
  id = id.toUpperCase();
  if (id.length === 0) {
    id = `${prefix}_${pad3(count)}`;
  } else if (!/[A-Z]/.test(id[0]!)) {
    id = `${prefix}_` + id;
  }
  if (exists(id)) {
    for (let i = 1; i <= 100; i++) {
      const trialId = `${id}_${i}`;
      if (exists(trialId)) continue;
      id = trialId;
      break;
    }
  }
  return exists(id) ? null : id;
}

export async function pbTrainerTypeEditorNew(defaultName: string | null): Promise<Id | null> {
  // Choose a name
  let name = await pbMessageFreeText(_INTL("Please enter the trainer type's name."),
    defaultName ? defaultName.replace(/_+/g, " ") : "", false, 30);
  if (nilOrEmpty(name)) {
    if (!defaultName) return null;
    name = defaultName;
  }
  const id = generateEditorID(name, "T", GameData.TrainerType.count(), (i) => GameData.TrainerType.exists(i));
  if (id === null) {
    await pbMessage(_INTL("Failed to create the trainer type. Choose a different name."));
    return null;
  }
  // Choose a gender
  const gender = await pbMessage(_INTL("Is the Trainer male, female or unknown?"),
    [_INTL("Male"), _INTL("Female"), _INTL("Unknown")], 0);
  // Choose a base money value
  const params = new ChooseNumberParams();
  params.setRange(0, 255);
  params.setDefaultValue(30);
  const baseMoney = await pbMessageChooseNumber(_INTL("Set the money per level won for defeating the Trainer."), params);
  // Construct trainer type hash
  const trTypeHash = { id, name, gender: gender as 0 | 1 | 2, baseMoney };
  // Add trainer type's data to records
  GameData.TrainerType.register(trTypeHash);
  await pbConvertTrainerData(); // GameData::TrainerType.save
  await pbMessage(_INTL("The trainer type {1} was created (ID: {2}).", name, id));
  await pbMessage(_INTL("Put the Trainer's graphic ({1}.png) in Graphics/Trainers, or it will be blank.", id));
  return id;
}

//===============================================================================
// Individual trainer editor
//===============================================================================
export const TrainerBattleProperty = {
  NUM_ITEMS: 8,

  async set(settingname: string | null, oldsetting: unknown[] | null): Promise<unknown[] | null> {
    if (!oldsetting) return null;
    const properties: PropertyListEntry[] = [
      [_INTL("Trainer Type"), TrainerTypeProperty, _INTL("Name of the trainer type for this Trainer.")],
      [_INTL("Trainer Name"), StringProperty, _INTL("Name of the Trainer.")],
      [_INTL("Version"), new LimitProperty(9999), _INTL("Number used to distinguish Trainers with the same name and trainer type.")],
      [_INTL("Lose Text"), StringProperty, _INTL("Message shown in battle when the Trainer is defeated.")],
    ];
    for (let i = 0; i < GameSettings.MAX_PARTY_SIZE; i++) {
      properties.push([_INTL("Pokémon {1}", i + 1), TrainerPokemonProperty, _INTL("A Pokémon owned by the Trainer.")]);
    }
    for (let i = 0; i < TrainerBattleProperty.NUM_ITEMS; i++) {
      properties.push([_INTL("Item {1}", i + 1), ItemProperty, _INTL("An item used by the Trainer during battle.")]);
    }
    if (!(await pbPropertyList(settingname ?? "", oldsetting, properties, true))) return null;
    if (!rb(oldsetting[0])) oldsetting = null;
    return oldsetting;
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

/** The data pbTrainerBattleEditor edits for a trainer. */
export function trainerBattleEditorData(trainerId: TrainerBattleId): unknown[] {
  const trData = GameData.Trainer.get(trainerId[0], trainerId[1], trainerId[2]);
  const data: unknown[] = [trData.trainerType, trData.realName, trData.version, trData.realLoseText];
  for (let i = 0; i < GameSettings.MAX_PARTY_SIZE; i++) data.push(trData.pokemon[i] ?? null);
  for (let i = 0; i < TrainerBattleProperty.NUM_ITEMS; i++) data.push(trData.items[i] ?? null);
  return data;
}

/**
 * The checks and the save of pbTrainerBattleEditor's edit loop: the message
 * that stops the save, or null after registering the trainer.
 */
export function trainerBattleEditorApply(old: TrainerBattleId, data: unknown[]): string | null {
  const party: TrainerPokemon[] = [];
  const items: Id[] = [];
  for (let i = 0; i < GameSettings.MAX_PARTY_SIZE; i++) {
    const pkmn = data[4 + i] as TrainerPokemon | null;
    if (pkmn && pkmn.species) party.push(pkmn);
  }
  for (let i = 0; i < TrainerBattleProperty.NUM_ITEMS; i++) {
    const item = data[4 + GameSettings.MAX_PARTY_SIZE + i] as Id | null;
    if (item) items.push(item);
  }
  if (!rb(data[0])) return _INTL("Can't save. No trainer type was chosen.");
  if (!rb(data[1]) || (data[1] as string).length === 0) return _INTL("Can't save. No name was entered.");
  if (party.length === 0) return _INTL("Can't save. The Pokémon list is empty.");
  const trainerHash: TrainerData = {
    trainerType: data[0] as Id,
    name: data[1] as string,
    version: data[2] as number,
    loseText: data[3] as string,
    pokemon: party,
    items,
    id: [data[0] as Id, data[1] as string, data[2] as number],
  };
  // Add trainer type's data to records
  GameData.Trainer.register(trainerHash);
  if (data[0] !== old[0] || data[1] !== old[1] || data[2] !== old[2]) {
    GameData.Trainer.DATA.delete(JSON.stringify(old));
  }
  return null;
}

export async function pbTrainerBattleEditor(): Promise<void> {
  let modified = false;
  await pbListScreenBlock(_INTL("Trainer Battles"), new TrainerBattleLister(0, true), async (button, trainerId) => {
    if (!rb(trainerId)) return;
    switch (button) {
      case Input.ACTION:
        if (Array.isArray(trainerId) && await pbConfirmMessageSerious("Delete this trainer battle?")) {
          GameData.Trainer.DATA.delete(JSON.stringify(trainerId));
          modified = true;
          await pbMessage(_INTL("The Trainer battle was deleted."));
        }
        break;
      case Input.USE:
        if (Array.isArray(trainerId)) { // Edit existing trainer
          const trData = GameData.Trainer.get(trainerId[0], trainerId[1], trainerId[2]);
          const old: TrainerBattleId = [trData.trainerType, trData.realName, trData.version];
          let data: unknown[] | null = trainerBattleEditorData(trainerId);
          for (;;) {
            data = await TrainerBattleProperty.set(trData.realName, data);
            if (!data) break;
            const error = trainerBattleEditorApply(old, data);
            if (error) {
              await pbMessage(error);
            } else {
              modified = true;
              break;
            }
          }
        } else { // New trainer
          let trType: Id | null = null;
          const ret = await pbMessage(_INTL("First, define the new trainer's type."),
            [_INTL("Use existing type"), _INTL("Create new type"), _INTL("Cancel")], 3);
          switch (ret) {
            case 0:
              trType = (await pbListScreen(_INTL("TRAINER TYPE"), new TrainerTypeLister(0, false))) as Id | null;
              break;
            case 1:
              trType = await pbTrainerTypeEditorNew(null);
              break;
            default:
              return;
          }
          if (!rb(trType)) return;
          const trName = await pbMessageFreeText(_INTL("Now enter the trainer's name."), "", false, 30);
          if (nilOrEmpty(trName)) return;
          const trVersion = pbGetFreeTrainerParty(trType!, trName);
          if (trVersion < 0) {
            await pbMessage(_INTL("There is no room to create a trainer of that type and name."));
            return;
          }
          const t = await pbNewTrainer(trType!, trName, trVersion, false);
          if (t) {
            const trainerHash: TrainerData = {
              trainerType: trType!,
              name: trName,
              version: trVersion,
              pokemon: [],
              items: [],
              loseText: undefined as unknown as string, // (Ruby's hash has no :lose_text: "...")
              id: [trType!, trName, trVersion],
            };
            for (const pkmn of t[3]) trainerHash.pokemon.push({ species: pkmn[0], level: pkmn[1] });
            // Add trainer's data to records
            GameData.Trainer.register(trainerHash);
            await pbMessage(_INTL("The Trainer battle was added."));
            modified = true;
          }
        }
        break;
    }
  });
  if (modified && await pbConfirmMessage(_INTL("Save changes?"))) {
    await pbConvertTrainerData(); // GameData::Trainer.save
  } else {
    await gameDataLoad(GameData.Trainer);
  }
}

//===============================================================================
// Trainer Pokémon editor (Essentials Deluxe's version)
//===============================================================================
/** The keys of TrainerPokemonProperty's data after the moves, in order. */
const TRAINER_PKMN_KEYS: (keyof TrainerPokemon)[] = [
  "ability", "abilityIndex", "item", "nature", "iv", "ev", "happiness", "pokeBall",
  // Essentials Deluxe
  "size", "trainerAce", "memento", "focus", "birthsign", "dynamaxLvl", "gmaxfactor", "nodynamax", "mastery", "teratype",
];

/** The data array TrainerPokemonProperty edits for a trainer's Pokémon. */
export function trainerPokemonData(initsetting: Partial<TrainerPokemon> | null): unknown[] {
  if (!initsetting) initsetting = { species: undefined, level: 10 };
  const oldsetting: unknown[] = [
    initsetting.species ?? null, initsetting.level ?? null, initsetting.name ?? null, initsetting.form ?? null,
    initsetting.gender ?? null, initsetting.shininess ?? null, initsetting.superShininess ?? null,
    initsetting.shadowness ?? null,
  ];
  for (let i = 0; i < Pokemon.MAX_MOVES; i++) oldsetting.push(initsetting.moves ? (initsetting.moves[i] ?? null) : null);
  for (const key of TRAINER_PKMN_KEYS) oldsetting.push(initsetting[key] ?? null);
  return oldsetting;
}

/** The hash TrainerPokemonProperty returns for its edited data (null without a species). */
export function trainerPokemonFromData(oldsetting: unknown[]): TrainerPokemon | null {
  if (!rb(oldsetting[0])) return null;
  const ret: Record<string, unknown> = {
    species: oldsetting[0],
    level: oldsetting[1],
    name: oldsetting[2],
    form: oldsetting[3],
    gender: oldsetting[4],
    shininess: oldsetting[5],
    superShininess: oldsetting[6],
    shadowness: oldsetting[7],
  };
  TRAINER_PKMN_KEYS.forEach((key, i) => { ret[key] = oldsetting[8 + Pokemon.MAX_MOVES + i]; });
  const moves: unknown[] = [];
  // NOTE (Ruby parity): Essentials Deluxe reads the moves from index 7 (the
  // Shadow flag) instead of 8, so the last move is dropped and a Shadow
  // Pokémon gets `true` as its first move (Trainer Data.rb:233).
  for (let i = 0; i < Pokemon.MAX_MOVES; i++) moves.push(oldsetting[7 + i]);
  ret.moves = uniqCompact(moves);
  // (nil values are left out: the hash's nils are what writers skip)
  for (const k of Object.keys(ret)) if (ret[k] === null || ret[k] === undefined) delete ret[k];
  return ret as unknown as TrainerPokemon;
}

export const TrainerPokemonProperty = {
  async set(settingname: string | null, initsetting: TrainerPokemon | null): Promise<TrainerPokemon | null> {
    const oldsetting = trainerPokemonData(initsetting);
    const maxLevel = GameData.GrowthRate.maxLevel();
    const pkmnProperties: PropertyListEntry[] = [
      [_INTL("Species"), SpeciesProperty, _INTL("Species of the Pokémon.")],
      [_INTL("Level"), new NonzeroLimitProperty(maxLevel), _INTL("Level of the Pokémon (1-{1}).", maxLevel)],
      [_INTL("Name"), StringProperty, _INTL("Name of the Pokémon.")],
      [_INTL("Form"), new LimitProperty2(999), _INTL("Form of the Pokémon.")],
      [_INTL("Gender"), GenderProperty, _INTL("Gender of the Pokémon.")],
      [_INTL("Shiny"), BooleanProperty2, _INTL("If set to true, the Pokémon is a different-colored Pokémon.")],
      [_INTL("SuperShiny"), BooleanProperty2, _INTL("Whether the Pokémon is super shiny (shiny with a special shininess animation).")],
      [_INTL("Shadow"), BooleanProperty2, _INTL("If set to true, the Pokémon is a Shadow Pokémon.")],
    ];
    for (let i = 0; i < Pokemon.MAX_MOVES; i++) {
      pkmnProperties.push([_INTL("Move {1}", i + 1), new MovePropertyForSpecies(oldsetting),
        _INTL("A move known by the Pokémon. Leave all moves blank (use Z key to delete) for a wild moveset.")]);
    }
    pkmnProperties.push(
      [_INTL("Ability"), AbilityProperty, _INTL("Ability of the Pokémon. Overrides the ability index.")],
      [_INTL("Ability index"), new LimitProperty2(99), _INTL("Ability index. 0=first ability, 1=second ability, 2+=hidden ability.")],
      [_INTL("Held item"), ItemProperty, _INTL("Item held by the Pokémon.")],
      [_INTL("Nature"), new GameDataProperty("Nature"), _INTL("Nature of the Pokémon.")],
      [_INTL("IVs"), new IVsProperty(Pokemon.IV_STAT_LIMIT), _INTL("Individual values for each of the Pokémon's stats.")],
      [_INTL("EVs"), new EVsProperty(Pokemon.EV_STAT_LIMIT), _INTL("Effort values for each of the Pokémon's stats.")],
      [_INTL("Happiness"), new LimitProperty2(255), _INTL("Happiness of the Pokémon (0-255).")],
      [_INTL("Poké Ball"), new BallProperty(oldsetting), _INTL("The kind of Poké Ball the Pokémon is kept in.")],
      [_INTL("Size"), new LimitProperty2(255), _INTL("Size variance of the Pokémon (0-255).")],
      [_INTL("Ace"), BooleanProperty2, _INTL("Flags this Pokémon as this trainer's ace. Used by certain plugins below.")],
    );
    for (const plugin of ["Improved Mementos", "Focus Meter System", "Pokémon Birthsigns", "ZUD Mechanics",
      "PLA Battle Styles", "Terastal Phenomenon"]) {
      if (INSTALLED_PLUGINS.has(plugin)) {
        // Only ZUD Mechanics is installed; the others' properties (Memento,
        // Focus, Birthsign, Mastery, Tera Type) would push their GameData lists.
        if (plugin === "ZUD Mechanics") {
          pkmnProperties.push(
            [_INTL("Dynamax Lvl"), new LimitProperty2(10), _INTL("Dynamax level of the Pokémon (0-10).")],
            [_INTL("G-Max Factor"), BooleanProperty2, _INTL("If set to true, the Pokémon will have G-Max Factor.")],
            [_INTL("No Dynamax"), BooleanProperty2, _INTL("If set to true, the Pokémon will be unable to Dynamax. This allows for other mechanics such as Battle Styles or Terastallization.")],
          );
        }
      } else {
        const repeat = plugin === "ZUD Mechanics" ? 3 : 1;
        const placeholder: PropertyListEntry = [_INTL("Plugin Property"), ReadOnlyProperty,
          _INTL(`This property requires a certain plugin to be installed./n[${plugin}]`)];
        for (let i = 0; i < repeat; i++) pkmnProperties.push(placeholder);
      }
    }
    await pbPropertyList(settingname ?? "", oldsetting, pkmnProperties, false);
    return trainerPokemonFromData(oldsetting);
  },

  format(value: TrainerPokemon | null): string {
    if (!value || !value.species) return "-";
    return `${GameData.Species.get(value.species).name},${Math.trunc(value.level)}`;
  },
};

//===============================================================================
// Metadata editor
//===============================================================================
/** GameData::Metadata.editor_properties */
export function metadataEditorProperties(): PropertyListEntry[] {
  return [
    ["StartMoney", new LimitProperty(GameSettings.MAX_MONEY), _INTL("The amount of money that the player starts the game with.")],
    ["StartItemStorage", new GameDataPoolProperty("Item"), _INTL("Items that are already in the player's PC at the start of the game.")],
    ["Home", MapCoordsFacingProperty, _INTL("Map ID and X/Y coordinates of where the player goes after a loss if no Pokémon Center was visited.")],
    ["StorageCreator", StringProperty, _INTL("Name of the Pokémon Storage creator (the storage option is named \"XXX's PC\").")],
    ["WildBattleBGM", BGMProperty, _INTL("Default BGM for wild Pokémon battles.")],
    ["TrainerBattleBGM", BGMProperty, _INTL("Default BGM for Trainer battles.")],
    ["WildVictoryBGM", BGMProperty, _INTL("Default BGM played after winning a wild Pokémon battle.")],
    ["TrainerVictoryBGM", BGMProperty, _INTL("Default BGM played after winning a Trainer battle.")],
    ["WildCaptureME", MEProperty, _INTL("Default ME played after catching a Pokémon.")],
    ["SurfBGM", BGMProperty, _INTL("BGM played while surfing.")],
    ["BicycleBGM", BGMProperty, _INTL("BGM played while on a bicycle.")],
  ];
}

/** GameData::PlayerMetadata.editor_properties */
export function playerMetadataEditorProperties(): PropertyListEntry[] {
  return [
    ["TrainerType", TrainerTypeProperty, _INTL("Trainer type of this player.")],
    ["WalkCharset", CharacterProperty, _INTL("Charset used while the player is still or walking.")],
    ["RunCharset", CharacterProperty, _INTL("Charset used while the player is running. Uses WalkCharset if undefined.")],
    ["CycleCharset", CharacterProperty, _INTL("Charset used while the player is cycling. Uses RunCharset if undefined.")],
    ["SurfCharset", CharacterProperty, _INTL("Charset used while the player is surfing. Uses CycleCharset if undefined.")],
    ["DiveCharset", CharacterProperty, _INTL("Charset used while the player is diving. Uses SurfCharset if undefined.")],
    ["FishCharset", CharacterProperty, _INTL("Charset used while the player is fishing. Uses WalkCharset if undefined.")],
    ["SurfFishCharset", CharacterProperty, _INTL("Charset used while the player is fishing while surfing. Uses FishCharset if undefined.")],
    ["Home", MapCoordsFacingProperty, _INTL("Map ID and X/Y coordinates of where the player goes after a loss if no Pokémon Center was visited.")],
  ];
}

/** GameData::MapMetadata.editor_properties */
export function mapMetadataEditorProperties(): PropertyListEntry[] {
  return [
    ["Name", StringProperty, _INTL("The name of the map, as seen by the player. Can be different to the map's name as seen in RMXP.")],
    ["Outdoor", BooleanProperty, _INTL("If true, this map is an outdoor map and will be tinted according to time of day.")],
    ["ShowArea", BooleanProperty, _INTL("If true, the game will display the map's name upon entry.")],
    ["Bicycle", BooleanProperty, _INTL("If true, the bicycle can be used on this map.")],
    ["BicycleAlways", BooleanProperty, _INTL("If true, the bicycle will be mounted automatically on this map and cannot be dismounted.")],
    ["HealingSpot", MapCoordsProperty, _INTL("Map ID of this Pokémon Center's town, and X and Y coordinates of its entrance within that town.")],
    ["Weather", WeatherEffectProperty, _INTL("Weather conditions in effect for this map.")],
    ["MapPosition", RegionMapCoordsProperty, _INTL("Identifies the point on the regional map for this map.")],
    ["DiveMap", MapProperty, _INTL("Specifies the underwater layer of this map. Use only if this map has deep water.")],
    ["DarkMap", BooleanProperty, _INTL("If true, this map is dark and a circle of light appears around the player. Flash can be used to expand the circle.")],
    ["SafariMap", BooleanProperty, _INTL("If true, this map is part of the Safari Zone (both indoor and outdoor). Not to be used in the reception desk.")],
    ["SnapEdges", BooleanProperty, _INTL("If true, when the player goes near this map's edge, the game doesn't center the player as usual.")],
    ["Dungeon", BooleanProperty, _INTL("If true, this map has a randomly generated layout. See the wiki for more information.")],
    ["BattleBack", StringProperty, _INTL("PNG files named 'XXX_bg', 'XXX_base0', 'XXX_base1', 'XXX_message' in Battlebacks folder, where XXX is this property's value.")],
    ["WildBattleBGM", BGMProperty, _INTL("Default BGM for wild Pokémon battles on this map.")],
    ["TrainerBattleBGM", BGMProperty, _INTL("Default BGM for trainer battles on this map.")],
    ["WildVictoryBGM", BGMProperty, _INTL("Default BGM played after winning a wild Pokémon battle on this map.")],
    ["TrainerVictoryBGM", BGMProperty, _INTL("Default BGM played after winning a Trainer battle on this map.")],
    ["WildCaptureME", MEProperty, _INTL("Default ME played after catching a wild Pokémon on this map.")],
    ["MapSize", MapSizeProperty, _INTL("The width of the map in Town Map squares, and a string indicating which squares are part of this map.")],
    ["Environment", new GameDataProperty("Environment"), _INTL("The default battle environment for battles on this map.")],
    ["Flags", StringListProperty as unknown as EditorProperty, _INTL("Words/phrases that distinguish this map from others.")],
  ];
}

export async function pbMetadataScreen(): Promise<void> {
  let selPlayer = -1;
  for (;;) {
    selPlayer = await pbListScreen(_INTL("SET METADATA"), new MetadataLister(selPlayer, true));
    if (selPlayer === -1) break;
    switch (selPlayer) {
      case -2: // Add new player
        await pbEditPlayerMetadata(-1);
        break;
      case 0: // Edit global metadata
        await pbEditMetadata();
        break;
      default: // Edit player character
        if (selPlayer >= 1) await pbEditPlayerMetadata(selPlayer);
    }
  }
}

/** The data pbEditMetadata edits. */
export function metadataEditorData(): unknown[] {
  const metadata = GameData.Metadata.get();
  return metadataEditorProperties().map((property) => metadata.propertyFromString(property[0]));
}

/** pbEditMetadata's save. */
export async function metadataEditorSave(data: unknown[]): Promise<void> {
  // Construct metadata hash
  const metadataHash = {
    id: 0,
    startMoney: data[0] as number,
    startItemStorage: data[1] as Id[],
    home: data[2] as MetadataData["home"],
    storageCreator: data[3] as string | null,
    wildBattleBGM: data[4] as string | null,
    trainerBattleBGM: data[5] as string | null,
    wildVictoryBGM: data[6] as string | null,
    trainerVictoryBGM: data[7] as string | null,
    wildCaptureME: data[8] as string | null,
    surfBGM: data[9] as string | null,
    bicycleBGM: data[10] as string | null,
  } satisfies MetadataData;
  // Add metadata's data to records
  GameData.Metadata.register(metadataHash);
  MetadataRecords.setGlobal(metadataHash);
  // GameData::Metadata.save; Compiler.write_metadata
  await gameDataSave("PBS/metadata.txt", () => Compiler.writeMetadata());
}

export async function pbEditMetadata(): Promise<void> {
  const data = metadataEditorData();
  if (await pbPropertyList(_INTL("Global Metadata"), data, metadataEditorProperties(), true)) {
    await metadataEditorSave(data);
  }
}

/** pbEditPlayerMetadata's save. */
export async function playerMetadataEditorSave(playerId: number, data: unknown[]): Promise<void> {
  // Construct player metadata hash
  // NOTE (Ruby parity): the property list edits "Home" (data[8]) but the hash
  // leaves it out, so saving a player character drops its Home
  // (001_EditorScreens.rb:783-793).
  const metadataHash = {
    id: playerId,
    trainerType: data[0] as Id | null,
    walkCharset: data[1] as string | null,
    runCharset: data[2] as string | null,
    cycleCharset: data[3] as string | null,
    surfCharset: data[4] as string | null,
    diveCharset: data[5] as string | null,
    fishCharset: data[6] as string | null,
    surfFishCharset: data[7] as string | null,
  } satisfies Partial<PlayerMetadataData>;
  // Add player metadata's data to records
  GameData.PlayerMetadata.register(metadataHash);
  MetadataRecords.setPlayer(metadataHash as never);
  // GameData::PlayerMetadata.save; Compiler.write_metadata
  await gameDataSave("PBS/metadata.txt", () => Compiler.writeMetadata());
}

export async function pbEditPlayerMetadata(playerId = 1): Promise<void> {
  let metadata: InstanceType<typeof GameData.PlayerMetadata> | null = null;
  if (playerId < 1) {
    // Adding new player character; get lowest unused player character ID
    const ids = GameData.PlayerMetadata.keys();
    const max = Math.max(...ids);
    for (let i = 1; i <= max + 1; i++) {
      if (ids.includes(i)) continue;
      playerId = i;
      break;
    }
    metadata = new GameData.PlayerMetadata({ id: playerId });
  } else if (!GameData.PlayerMetadata.exists(playerId)) {
    await pbMessage(_INTL("Metadata for player character {1} was not found.", playerId));
    return;
  }
  if (metadata === null) metadata = GameData.PlayerMetadata.tryGet(playerId);
  const properties = playerMetadataEditorProperties();
  const data = properties.map((property) => metadata!.propertyFromString(property[0]));
  if (await pbPropertyList(_INTL("Player {1}", metadata!.id), data, properties, true)) {
    await playerMetadataEditorSave(playerId, data);
  }
}

//===============================================================================
// Map metadata editor
//===============================================================================
export async function pbMapMetadataScreen(mapId = 0): Promise<void> {
  for (;;) {
    mapId = await pbListScreen(_INTL("SET METADATA"), new MapLister(mapId));
    if (mapId < 0) break;
    if (mapId === 0) await pbEditMetadata();
    else await pbEditMapMetadata(mapId);
  }
}

/** The data pbEditMapMetadata edits for a map. */
export function mapMetadataEditorData(mapId: number): unknown[] {
  let metadata = GameData.MapMetadata.tryGet(mapId);
  if (!metadata) metadata = new GameData.MapMetadata({ id: mapId });
  return mapMetadataEditorProperties().map((property) => metadata!.propertyFromString(property[0]));
}

/** pbEditMapMetadata's save. */
export async function mapMetadataEditorSave(mapId: number, data: unknown[]): Promise<void> {
  // Construct map metadata hash
  const metadataHash = {
    id: mapId,
    name: data[0] as string | null,
    outdoorMap: data[1] as boolean | null,
    announceLocation: data[2] as boolean | null,
    canBicycle: data[3] as boolean | null,
    alwaysBicycle: data[4] as boolean | null,
    teleportDestination: data[5] as MapMetadataData["teleportDestination"],
    weather: data[6] as MapMetadataData["weather"],
    townMapPosition: data[7] as MapMetadataData["townMapPosition"],
    diveMapId: data[8] as number | null,
    darkMap: data[9] as boolean | null,
    safariMap: data[10] as boolean | null,
    snapEdges: data[11] as boolean | null,
    randomDungeon: data[12] as boolean | null,
    battleBackground: data[13] as string | null,
    wildBattleBGM: data[14] as string | null,
    trainerBattleBGM: data[15] as string | null,
    wildVictoryBGM: data[16] as string | null,
    trainerVictoryBGM: data[17] as string | null,
    wildCaptureME: data[18] as string | null,
    townMapSize: data[19] as MapMetadataData["townMapSize"],
    battleEnvironment: data[20] as Id | null,
    flags: data[21] as string[],
  } as MapMetadataData;
  // Add map metadata's data to records
  GameData.MapMetadata.register(metadataHash);
  MetadataRecords.setMap(metadataHash as never);
  // GameData::MapMetadata.save; Compiler.write_map_metadata
  await gameDataSave("PBS/map_metadata.txt", () => Compiler.writeMapMetadata());
}

export async function pbEditMapMetadata(mapId: number): Promise<void> {
  const mapName = mapInfo(mapId)!.name;
  const data = mapMetadataEditorData(mapId);
  if (await pbPropertyList(mapName, data, mapMetadataEditorProperties(), true)) {
    await mapMetadataEditorSave(mapId, data);
  }
}

//===============================================================================
// Item editor
//===============================================================================
/** GameData::Item::SCHEMA["FieldUse"][2] / ["BattleUse"][2] names by value, after "Can't use". */
const FIELD_USES = ["OnPokemon", "Direct", "TM", "HM", "TR"];
const BATTLE_USES = ["OnPokemon", "OnMove", "OnBattler", "OnFoe", "Direct"];

export function itemEditorProperties(): PropertyListEntry[] {
  const fieldUseArray = [_INTL("Can't use in field"), ...FIELD_USES];
  const battleUseArray = [_INTL("Can't use in battle"), ...BATTLE_USES];
  return [
    [_INTL("ID"), ReadOnlyProperty, _INTL("ID of this item (used as a symbol like :XXX).")],
    [_INTL("Name"), ItemNameProperty, _INTL("Name of this item as displayed by the game.")],
    [_INTL("NamePlural"), ItemNameProperty, _INTL("Plural name of this item as displayed by the game.")],
    [_INTL("Pocket"), PocketProperty, _INTL("Pocket in the Bag where this item is stored.")],
    [_INTL("Price"), new LimitProperty(999_999), _INTL("Purchase price of this item.")],
    [_INTL("SellPrice"), new LimitProperty(999_999), _INTL("Sell price of this item. If blank, is half the purchase price.")],
    [_INTL("Description"), StringProperty, _INTL("Description of this item")],
    [_INTL("FieldUse"), new EnumProperty(fieldUseArray), _INTL("How this item can be used outside of battle.")],
    [_INTL("BattleUse"), new EnumProperty(battleUseArray), _INTL("How this item can be used within a battle.")],
    [_INTL("Consumable"), BooleanProperty, _INTL("Whether this item is consumed after use.")],
    [_INTL("Flags"), StringListProperty as unknown as EditorProperty, _INTL("Words/phrases that can be used to group certain kinds of items.")],
    [_INTL("Move"), MoveProperty, _INTL("Move taught by this HM, TM or TR.")],
  ];
}

/** The data pbItemEditor edits for an item. */
export function itemEditorData(item: Id): unknown[] {
  const itm = GameData.Item.get(item);
  return [
    itm.id, itm.realName, itm.realNamePlural, itm.pocket, itm.price, itm.sellPrice, itm.realDescription,
    itm.fieldUse, itm.battleUse, itm.consumable, itm.flags, itm.move,
  ];
}

/** pbItemEditor's save. */
export async function itemEditorSave(item: Id, data: unknown[]): Promise<void> {
  // Construct item hash (Ruby's hash has no :held_description or portion names: they are lost)
  const itemHash = {
    id: item,
    name: data[1] as string,
    namePlural: data[2] as string,
    pocket: data[3] as number,
    price: data[4] as number,
    sellPrice: data[5] as number,
    description: data[6] as string,
    fieldUse: data[7] as number,
    battleUse: data[8] as number,
    consumable: data[9] as boolean,
    flags: data[10] as string[],
    move: data[11] as Id | null,
  } satisfies Partial<ItemData>;
  // Add item's data to records
  GameData.Item.register(itemHash);
  // GameData::Item.save; Compiler.write_items
  await gameDataSave("PBS/items.txt", () => Compiler.writeItems());
}

export async function pbItemEditor(): Promise<void> {
  const properties = itemEditorProperties();
  await pbListScreenBlock(_INTL("Items"), new ItemLister(0, true), async (button, item) => {
    if (!rb(item)) return;
    switch (button) {
      case Input.ACTION:
        if (typeof item === "string" && await pbConfirmMessageSerious("Delete this item?")) {
          GameData.Item.DATA.delete(item);
          await gameDataSave("PBS/items.txt", () => Compiler.writeItems());
          await pbMessage(_INTL("The item was deleted."));
        }
        break;
      case Input.USE:
        if (typeof item === "string") {
          const data = itemEditorData(item);
          if (await pbPropertyList(item, data, properties, true)) await itemEditorSave(item, data);
        } else { // Add a new item
          await pbItemEditorNew(null);
        }
        break;
    }
  });
}

export async function pbItemEditorNew(defaultName: string | null): Promise<void> {
  // Choose a name
  let name = await pbMessageFreeText(_INTL("Please enter the item's name."),
    defaultName ? defaultName.replace(/_+/g, " ") : "", false, 30);
  if (nilOrEmpty(name)) {
    if (!defaultName) return;
    name = defaultName;
  }
  const id = generateEditorID(name, "ITEM", GameData.Item.count(), (i) => GameData.Item.exists(i));
  if (id === null) {
    await pbMessage(_INTL("Failed to create the item. Choose a different name."));
    return;
  }
  // Choose a pocket
  const pocket = await PocketProperty.set("", 0);
  if (pocket === 0) return;
  // Choose a price
  const price = await new LimitProperty(999_999).set(_INTL("Purchase price"), -1);
  if (price === -1) return;
  // Choose a description
  const description = await StringProperty.set(_INTL("Description"), "");
  // Construct item hash
  const itemHash = { id, name, namePlural: name + "s", pocket: pocket!, price, description };
  // Add item's data to records
  GameData.Item.register(itemHash);
  await gameDataSave("PBS/items.txt", () => Compiler.writeItems());
  await pbMessage(_INTL("The item {1} was created (ID: {2}).", name, id));
  await pbMessage(_INTL("Put the item's graphic ({1}.png) in Graphics/Items, or it will be blank.", id));
}

//===============================================================================
// Pokémon species editor
//===============================================================================
export function speciesEditorProperties(): PropertyListEntry[] {
  return [
    [_INTL("ID"), ReadOnlyProperty, _INTL("The ID of the Pokémon.")],
    [_INTL("Name"), new LimitStringProperty(Pokemon.MAX_NAME_SIZE), _INTL("Name of the Pokémon.")],
    [_INTL("FormName"), StringProperty, _INTL("Name of this form of the Pokémon.")],
    [_INTL("Category"), StringProperty, _INTL("Kind of Pokémon species.")],
    [_INTL("Pokédex"), StringProperty, _INTL("Description of the Pokémon as displayed in the Pokédex.")],
    [_INTL("Type 1"), TypeProperty, _INTL("Pokémon's type. If same as Type 2, this Pokémon has a single type.")],
    [_INTL("Type 2"), TypeProperty, _INTL("Pokémon's type. If same as Type 1, this Pokémon has a single type.")],
    [_INTL("BaseStats"), BaseStatsProperty as EditorProperty, _INTL("Base stats of the Pokémon.")],
    [_INTL("EVs"), EffortValuesProperty as EditorProperty, _INTL("Effort Value points earned when this species is defeated.")],
    [_INTL("BaseExp"), new LimitProperty(9999), _INTL("Base experience earned when this species is defeated.")],
    [_INTL("GrowthRate"), new GameDataProperty("GrowthRate"), _INTL("Pokémon's growth rate.")],
    [_INTL("GenderRatio"), new GameDataProperty("GenderRatio"), _INTL("Proportion of males to females for this species.")],
    [_INTL("CatchRate"), new LimitProperty(255), _INTL("Catch rate of this species (0-255).")],
    [_INTL("Happiness"), new LimitProperty(255), _INTL("Base happiness of this species (0-255).")],
    [_INTL("Moves"), LevelUpMovesProperty as EditorProperty, _INTL("Moves which the Pokémon learns while levelling up.")],
    [_INTL("TutorMoves"), new EggMovesProperty() as EditorProperty, _INTL("Moves which the Pokémon can be taught by TM/HM/Move Tutor.")],
    [_INTL("EggMoves"), new EggMovesProperty() as EditorProperty, _INTL("Moves which the Pokémon can learn via breeding.")],
    [_INTL("Ability 1"), AbilityProperty, _INTL("One ability which the Pokémon can have.")],
    [_INTL("Ability 2"), AbilityProperty, _INTL("Another ability which the Pokémon can have.")],
    [_INTL("HiddenAbility 1"), AbilityProperty, _INTL("A secret ability which the Pokémon can have.")],
    [_INTL("HiddenAbility 2"), AbilityProperty, _INTL("A secret ability which the Pokémon can have.")],
    [_INTL("HiddenAbility 3"), AbilityProperty, _INTL("A secret ability which the Pokémon can have.")],
    [_INTL("HiddenAbility 4"), AbilityProperty, _INTL("A secret ability which the Pokémon can have.")],
    [_INTL("WildItemCommon"), new GameDataPoolProperty("Item") as EditorProperty, _INTL("Item(s) commonly held by wild Pokémon of this species.")],
    [_INTL("WildItemUncommon"), new GameDataPoolProperty("Item") as EditorProperty, _INTL("Item(s) uncommonly held by wild Pokémon of this species.")],
    [_INTL("WildItemRare"), new GameDataPoolProperty("Item") as EditorProperty, _INTL("Item(s) rarely held by wild Pokémon of this species.")],
    [_INTL("EggGroup 1"), new GameDataProperty("EggGroup"), _INTL("Compatibility group (egg group) for breeding purposes.")],
    [_INTL("EggGroup 2"), new GameDataProperty("EggGroup"), _INTL("Compatibility group (egg group) for breeding purposes.")],
    [_INTL("HatchSteps"), new LimitProperty(99_999), _INTL("Number of steps until an egg of this species hatches.")],
    [_INTL("Incense"), ItemProperty, _INTL("Item needed to be held by a parent to produce an egg of this species.")],
    [_INTL("Offspring"), new GameDataPoolProperty("Species") as EditorProperty, _INTL("All possible species that an egg can be when breeding for an egg of this species (if blank, the egg can only be this species).")],
    [_INTL("Evolutions"), new EvolutionsProperty() as EditorProperty, _INTL("Evolution paths of this species.")],
    [_INTL("Height"), new NonzeroLimitProperty(999), _INTL("Height of the Pokémon in 0.1 metres (e.g. 42 = 4.2m).")],
    [_INTL("Weight"), new NonzeroLimitProperty(9999), _INTL("Weight of the Pokémon in 0.1 kilograms (e.g. 42 = 4.2kg).")],
    [_INTL("Color"), new GameDataProperty("BodyColor"), _INTL("Pokémon's body color.")],
    [_INTL("Shape"), new GameDataProperty("BodyShape"), _INTL("Body shape of this species.")],
    [_INTL("Habitat"), new GameDataProperty("Habitat"), _INTL("The habitat of this species.")],
    [_INTL("Generation"), new LimitProperty(99_999), _INTL("The number of the generation the Pokémon debuted in.")],
    [_INTL("Flags"), StringListProperty as unknown as EditorProperty, _INTL("Words/phrases that distinguish this species from others.")],
  ];
}

/** The data pbPokemonEditor edits for a species. */
export function speciesEditorData(species: Id): unknown[] {
  const spec = GameData.Species.get(species);
  // Level-up moves by level, keeping their order within a level
  const moves = spec.moves.map((m, i) => [m.level, m.move, i] as [number, Id, number]);
  moves.sort((a, b) => (a[0] === b[0] ? a[2] - b[2] : a[0] - b[0]));
  const evolutions: EvolutionEntry[] = [];
  for (const e of spec.evolutions) if (!e.prevolution) evolutions.push([e.species, e.method, e.parameter]);
  return [
    spec.id, spec.realName, spec.realFormName, spec.realCategory, spec.realPokedexEntry,
    spec.types[0] ?? null, spec.types[1] ?? null,
    { ...spec.baseStats }, { ...spec.evs }, spec.baseExp, spec.growthRate, spec.genderRatio, spec.catchRate,
    spec.happiness, moves.map((m) => [m[0], m[1]] as MoveTuple), [...spec.tutorMoves], [...spec.eggMoves],
    spec.abilities[0] ?? null, spec.abilities[1] ?? null,
    spec.hiddenAbilities[0] ?? null, spec.hiddenAbilities[1] ?? null, spec.hiddenAbilities[2] ?? null, spec.hiddenAbilities[3] ?? null,
    [...spec.wildItemCommon], [...spec.wildItemUncommon], [...spec.wildItemRare],
    spec.eggGroups[0] ?? null, spec.eggGroups[1] ?? null, spec.hatchSteps, spec.incense, spec.offspring,
    evolutions, spec.height, spec.weight, spec.color, spec.shape, spec.habitat, spec.generation, [...spec.flags],
  ];
}

/** pbPokemonEditor's save: sanitises the data and registers the species. */
export async function speciesEditorSave(species: Id, data: unknown[]): Promise<void> {
  // Sanitise data
  const types = uniqCompact([data[5] as Id | null, data[6] as Id | null]); // Types
  const eggGroups = uniqCompact([data[26] as Id | null, data[27] as Id | null]); // Egg groups
  const abilities = uniqCompact([data[17] as Id | null, data[18] as Id | null]); // Abilities
  const hiddenAbilities = uniqCompact([data[19], data[20], data[21], data[22]] as (Id | null)[]); // Hidden abilities
  // NOTE (Ruby parity): the hash has no :species, :form or the Mega/ZUD/Field
  // Skills properties, so those go back to their defaults (001_EditorScreens.rb:1109).
  const speciesHash = {
    id: species,
    name: data[1] as string,
    formName: data[2] as string | null,
    category: data[3] as string,
    pokedexEntry: data[4] as string,
    types: types.length > 0 ? types : undefined, // 5, 6
    baseStats: data[7] as SpeciesData["baseStats"],
    evs: data[8] as SpeciesData["evs"],
    baseExp: data[9] as number,
    growthRate: data[10] as Id,
    genderRatio: data[11] as Id,
    catchRate: data[12] as number,
    happiness: data[13] as number,
    moves: (data[14] as MoveTuple[]).map((m) => ({ level: m[0], move: m[1] })),
    tutorMoves: data[15] as Id[],
    eggMoves: data[16] as Id[],
    abilities, // 17, 18
    hiddenAbilities, // 19, 20, 21, 22
    wildItemCommon: data[23] as Id[],
    wildItemUncommon: data[24] as Id[],
    wildItemRare: data[25] as Id[],
    eggGroups: eggGroups.length > 0 ? eggGroups : undefined, // 26, 27
    hatchSteps: data[28] as number,
    incense: data[29] as Id | null,
    offspring: data[30] as Id[],
    evolutions: (data[31] as EvolutionEntry[]).map((e): Evolution =>
      ({ species: e[0], method: e[1], parameter: e[2] as Evolution["parameter"], prevolution: false })),
    height: data[32] as number,
    weight: data[33] as number,
    color: data[34] as Id,
    shape: data[35] as Id,
    habitat: data[36] as Id,
    generation: data[37] as number,
    flags: data[38] as string[],
  } satisfies Partial<SpeciesData>;
  // Add species' data to records
  GameData.Species.register(speciesHash);
  // GameData::Species.save; Compiler.write_pokemon
  await gameDataSave("PBS/pokemon.txt", () => Compiler.writePokemon());
}

export async function pbPokemonEditor(): Promise<void> {
  const properties = speciesEditorProperties();
  await pbListScreenBlock(_INTL("Pokémon species"), new SpeciesLister(0, false), async (button, species) => {
    if (!rb(species)) return;
    switch (button) {
      case Input.ACTION:
        if (typeof species === "string" && await pbConfirmMessageSerious("Delete this species?")) {
          GameData.Species.DATA.delete(species);
          await gameDataSave("PBS/pokemon.txt", () => Compiler.writePokemon());
          await pbMessage(_INTL("The species was deleted."));
        }
        break;
      case Input.USE:
        if (typeof species === "string") {
          const data = speciesEditorData(species);
          // Edit the properties
          if (await pbPropertyList(species, data, properties, true)) {
            await speciesEditorSave(species, data);
            await pbMessage(_INTL("Data saved."));
          }
        } else {
          await pbMessage(_INTL("Can't add a new species."));
        }
        break;
    }
  });
}

//===============================================================================
// Regional Dexes editor
//===============================================================================
export async function pbRegionalDexEditor(dex: (Id | null)[]): Promise<Id[]> {
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const cmdWindow = pbListWindow([]);
  const info = Window_AdvancedTextPokemon.newWithSize(
    _INTL("Z+Up/Down: Rearrange entries\nZ+Right: Insert new entry\nZ+Left: Delete entry\nD: Clear entry"),
    Graphics.width / 2, 64, Graphics.width / 2, Graphics.height - 64, viewport,
  );
  info.z = 2;
  // dex.compact!
  for (let i = dex.length - 1; i >= 0; i--) if (dex[i] == null) dex.splice(i, 1);
  let ret = [...dex];
  let commands: string[] = [];
  let refreshList = true;
  let cmd: [number, number] = [0, 0]; // [action, index in list]
  let done = false;
  while (!done) {
    // Populate commands
    if (refreshList) {
      while (dex.length > 0 && !dex[dex.length - 1]) dex.pop();
      commands = [];
      dex.forEach((species, i) => {
        const text = species ? GameData.Species.get(species).realName : "----------";
        commands.push(`${pad3(i + 1)}: ${text}`);
      });
      commands.push(`${pad3(commands.length + 1)}: ----------`);
      cmd[1] = Math.min(cmd[1], commands.length - 1);
      refreshList = false;
    }
    // Choose to do something
    cmd = await pbCommands3(cmdWindow, commands, -1, cmd[1], true);
    switch (cmd[0]) {
      case 1: // Swap entry up
        if (cmd[1] < dex.length - 1) {
          [dex[cmd[1] + 1], dex[cmd[1]]] = [dex[cmd[1]]!, dex[cmd[1] + 1]!];
          refreshList = true;
        }
        break;
      case 2: // Swap entry down
        if (cmd[1] > 0) {
          [dex[cmd[1] - 1], dex[cmd[1]]] = [dex[cmd[1]]!, dex[cmd[1] - 1]!];
          refreshList = true;
        }
        break;
      case 3: // Delete spot
        if (cmd[1] < dex.length) {
          dex.splice(cmd[1], 1);
          refreshList = true;
        }
        break;
      case 4: // Insert spot
        if (cmd[1] < dex.length) {
          dex.splice(cmd[1], 0, null);
          refreshList = true;
        }
        break;
      case 5: // Clear spot
        if (dex[cmd[1]]) {
          dex[cmd[1]] = null;
          refreshList = true;
        }
        break;
      case 0:
        if (cmd[1] >= 0) { // Edit entry
          switch (await pbMessage(_INTL("\\ts[]Do what with this entry?"),
            [_INTL("Change species"), _INTL("Clear"), _INTL("Insert entry"), _INTL("Delete entry"), _INTL("Cancel")], 5)) {
            case 0: { // Change species
              const species = await pbChooseSpeciesList(dex[cmd[1]] ?? null);
              if (species) {
                dex[cmd[1]] = species;
                dex.forEach((s, i) => { if (i !== cmd[1] && s === species) dex[i] = null; });
                refreshList = true;
              }
              break;
            }
            case 1: // Clear spot
              if (dex[cmd[1]]) {
                dex[cmd[1]] = null;
                refreshList = true;
              }
              break;
            case 2: // Insert spot
              if (cmd[1] < dex.length) {
                dex.splice(cmd[1], 0, null);
                refreshList = true;
              }
              break;
            case 3: // Delete spot
              if (cmd[1] < dex.length) {
                dex.splice(cmd[1], 1);
                refreshList = true;
              }
              break;
          }
        } else { // Cancel
          const choice = await pbMessage(_INTL("Save changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
          if (choice === 0) { // Save all changes to Dex
            // NOTE (Ruby parity): `dex.slice!(-1) until dex[-1]` never ends on an
            // empty Dex, freezing the game (001_EditorScreens.rb:1254); the port
            // stops at an empty Dex instead of hanging the browser tab.
            while (dex.length > 0 && !dex[dex.length - 1]) dex.pop();
            ret = dex;
            done = true;
          } else if (choice === 1) { // Just quit
            done = true;
          }
        }
        break;
    }
  }
  info.dispose();
  cmdWindow.dispose();
  viewport.dispose();
  return ret.filter((s): s is Id => s != null); // ret.compact!
}

/** pbRegionalDexEditorMain's save: save_data("Data/regional_dexes.dat") + Compiler.write_regional_dexes. */
export async function regionalDexesSave(dexLists: Id[][]): Promise<boolean> {
  setMiscPBSData({ regionalDexes: dexLists }); // $game_temp.regional_dexes_data = nil
  return gameDataSave("PBS/regional_dexes.txt", () => Compiler.writeRegionalDexes());
}

export async function pbRegionalDexEditorMain(): Promise<void> {
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const cmdWindow = pbListWindow([]);
  cmdWindow.viewport = viewport;
  cmdWindow.z = 2;
  const title = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Regional Dexes Editor"), Graphics.width / 2, 0, Graphics.width / 2, 64, viewport,
  );
  title.z = 2;
  const info = Window_AdvancedTextPokemon.newWithSize(
    _INTL("Z+Up/Down: Rearrange Dexes"), Graphics.width / 2, 64, Graphics.width / 2, Graphics.height - 64, viewport,
  );
  info.z = 2;
  const dexLists: (Id | null)[][] = [];
  pbLoadRegionalDexes().forEach((d, index) => { dexLists[index] = [...(d ?? [])]; });
  let commands: string[] = [];
  let refreshList = true;
  let cmd: [number, number] = [0, 0]; // [action, index in list]
  let done = false;
  while (!done) {
    // Populate commands
    if (refreshList) {
      commands = [_INTL("[ADD DEX]")];
      dexLists.forEach((list, i) => commands.push(_INTL("Dex {1} (size {2})", i + 1, list.length)));
      refreshList = false;
    }
    // Choose to do something
    cmd = await pbCommands3(cmdWindow, commands, -1, cmd[1], true);
    switch (cmd[0]) {
      case 1: // Swap Dex up
        if (cmd[1] > 0 && cmd[1] < commands.length - 1) {
          [dexLists[cmd[1] - 1], dexLists[cmd[1]]] = [dexLists[cmd[1]]!, dexLists[cmd[1] - 1]!];
          refreshList = true;
        }
        break;
      case 2: // Swap Dex down
        if (cmd[1] > 1) {
          [dexLists[cmd[1] - 2], dexLists[cmd[1] - 1]] = [dexLists[cmd[1] - 1]!, dexLists[cmd[1] - 2]!];
          refreshList = true;
        }
        break;
      case 0: // Clicked on a command/Dex
        if (cmd[1] === 0) { // Add new Dex
          switch (await pbMessage(_INTL("Fill in this new Dex?"),
            [_INTL("Leave blank"), _INTL("National Dex"), _INTL("Nat. Dex grouped families"), _INTL("Cancel")], 4)) {
            case 0: // Leave blank
              dexLists.push([]);
              refreshList = true;
              break;
            case 1: { // Fill with National Dex
              const newDex: Id[] = [];
              for (const s of GameData.Species.eachSpecies()) newDex.push(s.species);
              dexLists.push(newDex);
              refreshList = true;
              break;
            }
            case 2: { // Fill with National Dex (grouped families)
              const newDex: Id[] = [];
              const seen: Id[] = [];
              for (const s of GameData.Species.eachSpecies()) {
                if (seen.includes(s.species)) continue;
                const family = s.getFamilySpecies();
                newDex.push(...family);
                seen.push(...family);
              }
              dexLists.push(newDex);
              refreshList = true;
              break;
            }
          }
        } else if (cmd[1] > 0) { // Edit a Dex
          switch (await pbMessage(_INTL("\\ts[]Do what with this Dex?"),
            [_INTL("Edit"), _INTL("Copy"), _INTL("Delete"), _INTL("Cancel")], 4)) {
            case 0: // Edit
              dexLists[cmd[1] - 1] = await pbRegionalDexEditor(dexLists[cmd[1] - 1]!);
              refreshList = true;
              break;
            case 1: // Copy
              dexLists[dexLists.length] = [...dexLists[cmd[1] - 1]!];
              cmd[1] = dexLists.length;
              refreshList = true;
              break;
            case 2: // Delete
              dexLists.splice(cmd[1] - 1, 1);
              cmd[1] = Math.min(cmd[1], dexLists.length);
              refreshList = true;
              break;
          }
        } else { // Cancel
          switch (await pbMessage(_INTL("Save changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3)) {
            case 0: // Save all changes to Dexes
              if (await regionalDexesSave(dexLists as Id[][])) await pbMessage(_INTL("Data saved."));
              done = true;
              break;
            case 1: // Just quit
              done = true;
              break;
          }
        }
        break;
    }
  }
  title.dispose();
  info.dispose();
  cmdWindow.dispose();
  viewport.dispose();
}

function pbAppendEvoToFamilyArray(species: Id, array: unknown[], seenarray: Record<Id, boolean>): void {
  if (seenarray[species]) return;
  array.push(species);
  seenarray[species] = true;
  const evos = GameData.Species.get(species).getEvolutions();
  if (evos.length > 0) {
    const subarray: unknown[] = [];
    for (const i of evos) pbAppendEvoToFamilyArray(i[0], subarray, seenarray);
    if (subarray.length > 0) array.push(subarray);
  }
}

export function pbGetEvoFamilies(): Id[][] {
  const seen: Record<Id, boolean> = {};
  const ret: Id[][] = [];
  for (const sp of GameData.Species.eachSpecies()) {
    const species = sp.getBabySpecies();
    if (seen[species]) continue;
    const subret: unknown[] = [];
    pbAppendEvoToFamilyArray(species, subret, seen);
    if (subret.length > 0) ret.push(subret.flat(Infinity) as Id[]);
  }
  return ret;
}

export function pbEvoFamiliesToStrings(): string[] {
  const ret: string[] = [];
  const families = pbGetEvoFamilies();
  for (let fam = 0; fam < families.length; fam++) {
    let string = "";
    for (let p = 0; p < families[fam]!.length; p++) {
      if (p >= 3) {
        string += ` + ${families[fam]!.length - 3} more`;
        break;
      }
      if (p > 0) string += "/";
      string += GameData.Species.get(families[fam]![p]!).name;
    }
    ret[fam] = string;
  }
  return ret;
}

EditorScreens.pbMetadataScreen = pbMetadataScreen;
EditorScreens.pbEditMetadata = pbEditMetadata;
EditorScreens.pbMapMetadataScreen = pbMapMetadataScreen;
EditorScreens.pbEditMapMetadata = pbEditMapMetadata;
EditorScreens.pbEncountersEditor = pbEncountersEditor;
EditorScreens.pbTrainerTypeEditor = pbTrainerTypeEditor;
EditorScreens.pbTrainerTypeEditorNew = async (name: string) => { await pbTrainerTypeEditorNew(name); };
EditorScreens.pbTrainerBattleEditor = pbTrainerBattleEditor;
EditorScreens.pbItemEditor = pbItemEditor;
EditorScreens.pbPokemonEditor = pbPokemonEditor;
EditorScreens.pbRegionalDexEditorMain = pbRegionalDexEditorMain;
