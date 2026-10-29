// Port of Data/Scripts/020_Debug/002_Editor_DataTypes.rb: the property types
// the editors list with pbPropertyList (UIntProperty, LimitProperty,
// GameDataPoolProperty, EvolutionsProperty, ...), chooseMapPoint and
// pbPropertyList itself. No plugin overrides any of them (Essentials Deluxe's
// [000] Essentials Patches/Trainer Data.rb only rewrites TrainerPokemonProperty,
// which lives in 001_Editor screens).
//
// Ruby modules with `self.set` / `self.format` are exported objects, Ruby
// classes stay classes (StringListProperty, a class with only class methods,
// has static ones). Every property has `set(settingname, oldsetting)` (async:
// it opens UI and resolves to the new setting), `format(value)` (the text
// shown after "Name=" in the list) and, where Ruby has one, `defaultValue()`
// (what pbPropertyList's reset puts back; a method, as in Ruby). Where Ruby's
// format returns nil, format returns "" (what sprintf("%s") prints).
// GameData IDs (Ruby symbols) are strings; `inspect` shows the ones that look
// like symbols (:POTION) the way Ruby does.

import { GameData, Settings, type Id } from "../data/gameData";
import { pbLoadTownMapData } from "../data/gameData/miscPBSData";
import { Pokemon } from "../game/pokemon/Pokemon";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { _INTL } from "../ui/messageConfig";
import { ChooseNumberParams, pbConfirmMessage, pbMessage, pbMessageChooseNumber, pbShowCommands } from "../ui/messages";
import { pbMessageFreeText } from "../ui/party/mail";
import { Window_UnformattedTextPokemon } from "../ui/windows/SpriteWindowText";
import { GraphicsLister, MapLister, MusicFileLister, pbListScreen, pbListWindow, TrainerTypeLister } from "./EditorListers";
import {
  pbChooseAbilityList, pbChooseBallList, pbChooseFromGameDataList, pbChooseItemList, pbChooseList, pbChooseMoveList,
  pbChooseMoveListForSpecies, pbChooseSpeciesFormList, pbChooseSpeciesList, pbChooseTypeList, pbCommands2, pbCommands3,
} from "./EditorUtilities";

//===============================================================================
// Helpers
//===============================================================================
/** What pbPropertyList lists: anything with set/format (and maybe defaultValue). */
export interface EditorProperty {
  set(settingname: string | null, oldsetting: unknown): Promise<unknown>;
  format(value: unknown): string;
  defaultValue?(): unknown;
}

/** One row of pbPropertyList: [name, property, description]. */
export type PropertyListEntry = [name: string, property: EditorProperty, description: string];

/** A stat hash ({ HP: 31, ATTACK: 31, ... }) as the IV/EV/base stat properties edit it. */
export type StatHash = Record<string, number | null | undefined>;

/** Ruby truthiness: only nil and false are false (0 and "" are true). */
function rb(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** nil_or_empty?(string) */
function nilOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === "";
}

/** Strings that stand for a Ruby symbol (GameData IDs: :POTION, :PIKACHU_1, :HP). */
const SYMBOL_RE = /^[A-Z][A-Z0-9_]*$/;

/** Ruby's Object#inspect for the values the editors hold. */
export function inspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "string") return SYMBOL_RE.test(value) ? `:${value}` : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => inspect(v)).join(", ")}]`;
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      `${/^-?\d+$/.test(k) ? k : inspect(k)}=>${inspect(v)}`);
    return `{${parts.join(", ")}}`;
  }
  return String(value);
}

/**
 * Modules getConstantName can look a Symbol up in (Ruby's Object.const_get):
 * EvolutionsProperty shows such a parameter by its constant name. No
 * evolution method has one in this game.
 */
export const ConstantModules: Record<string, Record<string, unknown>> = {};

/** getConstantName(mod, value) (019_Utilities/001_Utilities.rb:112) */
export function getConstantName(mod: string | Record<string, unknown>, value: unknown): string {
  const name = typeof mod === "string" ? mod : "module";
  if (typeof mod === "string") {
    const found = ConstantModules[mod];
    if (!found) throw new Error(`uninitialized constant ${mod}`);
    mod = found;
  }
  for (const c of Object.keys(mod)) {
    if (mod[c] === value) return c;
  }
  throw new Error(_INTL("Value {1} not defined by a constant in {2}", value, name));
}

/** A GameData class as the properties use it (each / exists? / get). */
interface GameDataModule {
  each(): { id: Id; realName: string; idNumber?: number }[];
  exists(other: unknown): boolean;
  get(other: unknown): { id: Id; realName: string; name: string };
}

/** GameData.const_defined?(name) ? GameData.const_get(name) : nil */
function gameDataConst(name: string): GameDataModule | null {
  const mod = (GameData as unknown as Record<string, unknown>)[name];
  return typeof mod === "function" ? (mod as unknown as GameDataModule) : null;
}

//===============================================================================
// Data type properties
//===============================================================================
export const UndefinedProperty = {
  async set(_settingname: string | null, oldsetting: unknown): Promise<unknown> {
    await pbMessage(_INTL("This property can't be edited here at this time."));
    return oldsetting;
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

export const ReadOnlyProperty = {
  async set(_settingname: string | null, oldsetting: unknown): Promise<unknown> {
    await pbMessage(_INTL("This property cannot be edited."));
    return oldsetting;
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

export class UIntProperty {
  private maxdigits: number;

  constructor(maxdigits: number) {
    this.maxdigits = maxdigits;
  }

  async set(settingname: string | null, oldsetting: number | null): Promise<number> {
    const params = new ChooseNumberParams();
    params.setMaxDigits(this.maxdigits);
    params.setDefaultValue(oldsetting ?? 0);
    return pbMessageChooseNumber(_INTL("Set the value for {1}.", settingname ?? ""), params);
  }

  defaultValue(): number {
    return 0;
  }

  format(value: unknown): string {
    return inspect(value);
  }
}

export class LimitProperty {
  private maxvalue: number;

  constructor(maxvalue: number) {
    this.maxvalue = maxvalue;
  }

  async set(settingname: string | null, oldsetting: number | null): Promise<number> {
    if (!rb(oldsetting)) oldsetting = 1;
    const params = new ChooseNumberParams();
    params.setRange(0, this.maxvalue);
    params.setDefaultValue(oldsetting!);
    return pbMessageChooseNumber(_INTL(`Set the value for {1} (0-${this.maxvalue}).`, settingname ?? ""), params);
  }

  defaultValue(): number {
    return 0;
  }

  format(value: unknown): string {
    return inspect(value);
  }
}

export class LimitProperty2 {
  private maxvalue: number;

  constructor(maxvalue: number) {
    this.maxvalue = maxvalue;
  }

  async set(settingname: string | null, oldsetting: number | null): Promise<number | null> {
    if (!rb(oldsetting)) oldsetting = 0;
    const params = new ChooseNumberParams();
    params.setRange(0, this.maxvalue);
    params.setDefaultValue(oldsetting!);
    params.setCancelValue(-1);
    const ret = await pbMessageChooseNumber(_INTL(`Set the value for {1} (0-${this.maxvalue}).`, settingname ?? ""), params);
    return ret >= 0 ? ret : null;
  }

  defaultValue(): null {
    return null;
  }

  format(value: unknown): string {
    return rb(value) ? inspect(value) : "-";
  }
}

export class NonzeroLimitProperty {
  private maxvalue: number;

  constructor(maxvalue: number) {
    this.maxvalue = maxvalue;
  }

  async set(settingname: string | null, oldsetting: number | null): Promise<number> {
    if (!rb(oldsetting)) oldsetting = 1;
    const params = new ChooseNumberParams();
    params.setRange(1, this.maxvalue);
    params.setDefaultValue(oldsetting!);
    return pbMessageChooseNumber(_INTL("Set the value for {1}.", settingname ?? ""), params);
  }

  defaultValue(): number {
    return 1;
  }

  format(value: unknown): string {
    return inspect(value);
  }
}

export const BooleanProperty = {
  async set(settingname: string | null, _oldsetting: unknown): Promise<boolean> {
    return (await pbConfirmMessage(_INTL("Enable the setting {1}?", settingname ?? ""))) ? true : false;
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

export const BooleanProperty2 = {
  async set(_settingname: string | null, _oldsetting: unknown): Promise<boolean | null> {
    const ret = await pbShowCommands(null, [_INTL("True"), _INTL("False")], -1);
    return ret >= 0 ? ret === 0 : null;
  },

  defaultValue(): null {
    return null;
  },

  format(value: unknown): string {
    return rb(value) ? _INTL("True") : value !== null && value !== undefined ? _INTL("False") : "-";
  },
};

export const StringProperty = {
  async set(settingname: string | null, oldsetting: string | null): Promise<string> {
    return pbMessageFreeText(_INTL("Set the value for {1}.", settingname ?? ""),
      rb(oldsetting) ? oldsetting! : "", false, 250, Graphics.width);
  },

  format(value: string | null): string {
    return value ?? "";
  },
};

export class LimitStringProperty {
  private limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  format(value: string | null): string {
    return value ?? "";
  }

  async set(settingname: string | null, oldsetting: string | null): Promise<string> {
    return pbMessageFreeText(_INTL("Set the value for {1}.", settingname ?? ""),
      rb(oldsetting) ? oldsetting! : "", false, this.limit);
  }
}

export class EnumProperty {
  private values: string[];

  constructor(values: string[]) {
    this.values = values;
  }

  async set(settingname: string | null, oldsetting: number | null): Promise<number | null> {
    const commands: string[] = [];
    for (const value of this.values) commands.push(value);
    const cmd = await pbMessage(_INTL("Choose a value for {1}.", settingname ?? ""), commands, -1);
    if (cmd < 0) return oldsetting;
    return cmd;
  }

  defaultValue(): number {
    return 0;
  }

  format(value: number | null): string {
    return rb(value) ? (this.values[value!] ?? "") : inspect(value);
  }
}

/** A module of integer constants with maxValue (what EnumProperty2 lists). */
export type ConstantModule = Record<string, unknown> & { maxValue(): number };

// Unused
export class EnumProperty2 {
  private module: ConstantModule;

  constructor(value: ConstantModule) {
    this.module = value;
  }

  async set(settingname: string | null, oldsetting: number | null): Promise<number | null> {
    const commands: string[] = [];
    for (let i = 0; i <= this.module.maxValue(); i++) {
      commands.push(getConstantName(this.module, i));
    }
    const cmd = await pbMessage(_INTL("Choose a value for {1}.", settingname ?? ""), commands, -1, null, oldsetting ?? 0);
    if (cmd < 0) return oldsetting;
    return cmd;
  }

  defaultValue(): null {
    return null;
  }

  format(value: number | null): string {
    return rb(value) ? getConstantName(this.module, value) : "-";
  }
}

export class StringListProperty {
  static async set(_settingName: string | null, oldSetting: string[]): Promise<string[]> {
    const realCmds: [string, number][] = [];
    realCmds.push([_INTL("[ADD VALUE]"), -1]);
    // NOTE (Ruby parity): 002_Editor_DataTypes.rb:244 pushes old_setting[i]
    // inside a block that has no `i`, so a non-empty list raises NameError (the
    // editors crash when opening a Flags list that already has values).
    if (oldSetting.length > 0) {
      throw new Error("undefined local variable or method `i' for StringListProperty:Class");
    }
    // Edit list
    const cmdwin = pbListWindow([], 200);
    let oldsel: string | null = null;
    let ret = oldSetting;
    let cmd = 0;
    let commands: string[] = [];
    let doRefresh = true;
    for (;;) {
      if (doRefresh) {
        commands = [];
        realCmds.forEach((entry, i) => {
          commands.push(entry[0]);
          if (oldsel !== null && entry[0] === oldsel) cmd = i;
        });
      }
      doRefresh = false;
      oldsel = null;
      cmd = await pbCommands2(cmdwin, commands, -1, cmd, true);
      if (cmd >= 0) { // Chose a value
        const entry = realCmds[cmd]!;
        if (entry[1] === -1) { // Add new value
          const newValue = await pbMessageFreeText(_INTL("Enter the new value."), "", false, 250, Graphics.width);
          if (!nilOrEmpty(newValue)) {
            if (realCmds.some((e) => e[0] === newValue)) {
              oldsel = newValue; // Already have value; just move cursor to it
            } else {
              realCmds.push([newValue, 0]);
            }
            doRefresh = true;
          }
        } else { // Edit value
          switch (await pbMessage(_INTL("\\ts[]Do what with this value?"),
            [_INTL("Edit"), _INTL("Delete"), _INTL("Cancel")], 3)) {
            case 0: { // Edit
              const newValue = await pbMessageFreeText(_INTL("Enter the new value."), entry[0], false, 250, Graphics.width);
              if (!nilOrEmpty(newValue)) {
                if (realCmds.some((e) => e[0] === newValue)) { // Already have value; delete this one
                  realCmds.splice(cmd, 1);
                  cmd = Math.min(cmd, realCmds.length - 1);
                } else { // Change value
                  entry[0] = newValue;
                }
                oldsel = newValue;
                doRefresh = true;
              }
              break;
            }
            case 1: // Delete
              realCmds.splice(cmd, 1);
              cmd = Math.min(cmd, realCmds.length - 1);
              doRefresh = true;
              break;
          }
        }
      } else { // Cancel/quit
        const choice = await pbMessage(_INTL("Keep changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
        if (choice === 0) {
          ret = realCmds.filter((c) => c[1] !== -1).map((c) => c[0]);
          break;
        } else if (choice === 1) {
          break;
        }
      }
    }
    cmdwin.dispose();
    return ret;
  }

  static defaultValue(): string[] {
    return [];
  }

  static format(value: string[]): string {
    return value.join(",");
  }
}

export class GameDataProperty {
  private module: GameDataModule;

  /** value: the GameData class's name ("Nature", "Environment", ...). */
  constructor(value: string) {
    const mod = gameDataConst(value);
    if (!mod) throw new Error(_INTL("Couldn't find class {1} in module GameData.", value));
    this.module = mod;
  }

  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const commands: [number, string, Id][] = [];
    let i = 0;
    for (const data of this.module.each()) {
      if ("idNumber" in data) {
        commands.push([data.idNumber!, data.realName, data.id]);
      } else {
        commands.push([i, data.realName, data.id]);
      }
      i += 1;
    }
    return pbChooseList(commands, oldsetting, oldsetting, -1) as Promise<Id | null>;
  }

  defaultValue(): null {
    return null;
  }

  format(value: Id | null): string {
    return rb(value) && this.module.exists(value) ? this.module.get(value).realName : "-";
  }
}

export const BGMProperty = {
  async set(settingname: string | null, oldsetting: string | null): Promise<string | null> {
    const chosenmap = await pbListScreen(settingname ?? "", new MusicFileLister(true, oldsetting as string));
    return rb(chosenmap) && chosenmap !== "" ? chosenmap : oldsetting;
  },

  format(value: string | null): string {
    return value ?? "";
  },
};

export const MEProperty = {
  async set(settingname: string | null, oldsetting: string | null): Promise<string | null> {
    const chosenmap = await pbListScreen(settingname ?? "", new MusicFileLister(false, oldsetting as string));
    return rb(chosenmap) && chosenmap !== "" ? chosenmap : oldsetting;
  },

  format(value: string | null): string {
    return value ?? "";
  },
};

export const WindowskinProperty = {
  async set(settingname: string | null, oldsetting: string | null): Promise<string | null> {
    const chosenmap = await pbListScreen(settingname ?? "", new GraphicsLister("Graphics/Windowskins/", oldsetting as string));
    return rb(chosenmap) && chosenmap !== "" ? chosenmap : oldsetting;
  },

  format(value: string | null): string {
    return value ?? "";
  },
};

export const TrainerTypeProperty = {
  async set(settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const chosenmap = await pbListScreen(settingname ?? "", new TrainerTypeLister(0, false));
    return rb(chosenmap) ? (chosenmap as Id) : oldsetting;
  },

  format(value: Id | null): string {
    return rb(value) && GameData.TrainerType.exists(value) ? GameData.TrainerType.get(value!).realName : "-";
  },
};

export const SpeciesProperty = {
  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseSpeciesList(rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  },

  defaultValue(): null {
    return null;
  },

  format(value: Id | null): string {
    return rb(value) && GameData.Species.exists(value) ? GameData.Species.get(value!).realName : "-";
  },
};

export class SpeciesFormProperty {
  private _defaultValue: Id | null;

  constructor(defaultValue: Id | null) {
    this._defaultValue = defaultValue;
  }

  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseSpeciesFormList(rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  }

  defaultValue(): Id | null {
    return this._defaultValue;
  }

  format(value: Id | null): string {
    if (rb(value) && GameData.Species.exists(value)) {
      const speciesData = GameData.Species.get(value!);
      if (speciesData.form > 0) {
        return `${speciesData.realName}_${speciesData.form}`;
      } else {
        return speciesData.realName;
      }
    }
    return "-";
  }
}

export const TypeProperty = {
  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseTypeList(rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  },

  defaultValue(): null {
    return null;
  },

  format(value: Id | null): string {
    return rb(value) && GameData.Type.exists(value) ? GameData.Type.get(value!).realName : "-";
  },
};

export const MoveProperty = {
  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseMoveList(rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  },

  defaultValue(): null {
    return null;
  },

  format(value: Id | null): string {
    return rb(value) && GameData.Move.exists(value) ? GameData.Move.get(value!).realName : "-";
  },
};

export class MovePropertyForSpecies {
  /** The trainer Pokémon property list's data (species first), edited in place. */
  private pokemondata: unknown[];

  constructor(pokemondata: unknown[]) {
    this.pokemondata = pokemondata;
  }

  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseMoveListForSpecies(this.pokemondata[0] as Id, rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  }

  defaultValue(): null {
    return null;
  }

  format(value: Id | null): string {
    return rb(value) && GameData.Move.exists(value) ? GameData.Move.get(value!).realName : "-";
  }
}

export const GenderProperty = {
  async set(_settingname: string | null, _oldsetting: unknown): Promise<number | null> {
    const ret = await pbShowCommands(null, [_INTL("Male"), _INTL("Female")], -1);
    return ret >= 0 ? ret : null;
  },

  defaultValue(): null {
    return null;
  },

  format(value: number | null): string {
    if (!rb(value)) return _INTL("-");
    return value === 0 ? _INTL("Male") : value === 1 ? _INTL("Female") : "-";
  },
};

export const ItemProperty = {
  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseItemList(rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  },

  defaultValue(): null {
    return null;
  },

  format(value: Id | null): string {
    return rb(value) && GameData.Item.exists(value) ? GameData.Item.get(value!).realName : "-";
  },
};

/** IVsProperty#format / EVsProperty#format / BaseStatsProperty.format / EffortValuesProperty.format */
function formatStatHash(value: StatHash): string {
  const array: number[] = [];
  for (const s of GameData.Stat.eachMain()) {
    if (s.pbsOrder < 0) continue;
    array[s.pbsOrder] = value[s.id] ?? 0;
  }
  return array.join(",");
}

export class IVsProperty {
  private limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  async set(settingname: string | null, oldsetting: StatHash | null): Promise<StatHash> {
    if (!rb(oldsetting)) oldsetting = {};
    const properties: PropertyListEntry[] = [];
    const data: (number | null | undefined)[] = [];
    const statIds: Id[] = [];
    for (const s of GameData.Stat.eachMain()) {
      // NOTE (Ruby parity): 002_Editor_DataTypes.rb:558 checks/sets the hash by
      // pbs_order instead of the stat ID, so the caller's hash gains keys 0-5.
      if (!rb(oldsetting![s.pbsOrder])) oldsetting![s.pbsOrder] = 0;
      properties[s.pbsOrder] = [s.name, new LimitProperty2(this.limit),
        _INTL("Individual values for the Pokémon's {1} stat (0-{2}).", s.name, this.limit)];
      data[s.pbsOrder] = oldsetting![s.id];
      statIds[s.pbsOrder] = s.id;
    }
    await pbPropertyList(settingname ?? "", data, properties, false);
    const ret: StatHash = {};
    statIds.forEach((s, i) => { ret[s] = data[i] ?? 0; });
    return ret;
  }

  defaultValue(): null {
    return null;
  }

  format(value: StatHash | null): string {
    if (!rb(value)) return "-";
    return formatStatHash(value!);
  }
}

export class EVsProperty {
  private limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  async set(settingname: string | null, oldsetting: StatHash | null): Promise<StatHash> {
    if (!rb(oldsetting)) oldsetting = {};
    const properties: PropertyListEntry[] = [];
    const data: (number | null | undefined)[] = [];
    const statIds: Id[] = [];
    for (const s of GameData.Stat.eachMain()) {
      // NOTE (Ruby parity): 002_Editor_DataTypes.rb:598, as in IVsProperty.
      if (!rb(oldsetting![s.pbsOrder])) oldsetting![s.pbsOrder] = 0;
      properties[s.pbsOrder] = [s.name, new LimitProperty2(this.limit),
        _INTL("Effort values for the Pokémon's {1} stat (0-{2}).", s.name, this.limit)];
      data[s.pbsOrder] = oldsetting![s.id];
      statIds[s.pbsOrder] = s.id;
    }
    for (;;) {
      await pbPropertyList(settingname ?? "", data, properties, false);
      let evtotal = 0;
      for (const value of data) if (rb(value)) evtotal += value!;
      if (evtotal <= Pokemon.EV_LIMIT) break;
      await pbMessage(_INTL("Total EVs ({1}) are greater than allowed ({2}). Please reduce them.", evtotal, Pokemon.EV_LIMIT));
    }
    const ret: StatHash = {};
    statIds.forEach((s, i) => { ret[s] = data[i] ?? 0; });
    return ret;
  }

  defaultValue(): null {
    return null;
  }

  format(value: StatHash | null): string {
    if (!rb(value)) return "-";
    return formatStatHash(value!);
  }
}

export class BallProperty {
  private pokemondata: unknown[];

  constructor(pokemondata: unknown[]) {
    this.pokemondata = pokemondata;
  }

  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    return pbChooseBallList(oldsetting);
  }

  defaultValue(): null {
    return null;
  }

  format(value: Id | null): string {
    return rb(value) ? GameData.Item.get(value!).name : "-";
  }
}

export const CharacterProperty = {
  async set(settingname: string | null, oldsetting: string | null): Promise<string | null> {
    const chosenmap = await pbListScreen(settingname ?? "", new GraphicsLister("Graphics/Characters/", oldsetting as string));
    return rb(chosenmap) && chosenmap !== "" ? chosenmap : oldsetting;
  },

  format(value: string | null): string {
    return value ?? "";
  },
};

/** [width, valid squares] */
export type MapSize = [number, string];

export const MapSizeProperty = {
  async set(settingname: string | null, oldsetting: MapSize | null): Promise<MapSize> {
    if (!rb(oldsetting)) oldsetting = [0, ""];
    const properties: PropertyListEntry[] = [
      [_INTL("Width"), new NonzeroLimitProperty(30), _INTL("The width of this map in Region Map squares.")],
      [_INTL("Valid Squares"), StringProperty, _INTL("A series of 1s and 0s marking which squares are part of this map (1=part, 0=not part).")],
    ];
    await pbPropertyList(settingname ?? "", oldsetting!, properties, false);
    return oldsetting!;
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

/** What chooseMapPoint shows: MapSprite / RegionMapSprite (001_Editor screens/003_EditorScreens_MapConnections.rb). */
export interface MapPointSprite {
  z: number;
  /** The clicked point (in map/region squares), or null. */
  getXY(): [number, number] | null;
  dispose(): void;
}

/**
 * MapSprite and RegionMapSprite live in 003_EditorScreens_MapConnections.rb;
 * its port sets them here. Until then chooseMapPoint says so and returns nil.
 */
export const MapPointSprites: {
  MapSprite?: new (map: number, viewport: Viewport | null) => MapPointSprite;
  RegionMapSprite?: new (map: number, viewport: Viewport | null) => MapPointSprite;
} = {};

/** chooseMapPoint(map, rgnmap = false) */
export async function chooseMapPoint(map: number, rgnmap = false): Promise<[number, number] | null> {
  const spriteClass = rgnmap ? MapPointSprites.RegionMapSprite : MapPointSprites.MapSprite;
  if (!spriteClass) {
    await pbMessage(_INTL("{1} isn't ported to the browser yet.", rgnmap ? "RegionMapSprite" : "MapSprite"));
    return null;
  }
  // NOTE (Ruby parity): 002_Editor_DataTypes.rb:685 never disposes this viewport.
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const title = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Click a point on the map."), 0, Graphics.height - 64, Graphics.width, 64, viewport,
  );
  title.z = 2;
  const sprite = new spriteClass(map, viewport);
  sprite.z = 2;
  let ret: [number, number] | null = null;
  for (;;) {
    await Graphics.update();
    Input.update();
    const xy = sprite.getXY();
    if (xy) {
      ret = xy;
      break;
    }
    if (Input.trigger(Input.BACK)) {
      ret = null;
      break;
    }
  }
  sprite.dispose();
  title.dispose();
  return ret;
}

/** [map ID, x, y] */
export type MapCoords = [number, number, number];
/** [map ID, x, y, direction] */
export type MapCoordsFacing = [number, number, number, number];

export const MapCoordsProperty = {
  async set(settingname: string | null, oldsetting: MapCoords | null): Promise<MapCoords | null> {
    const chosenmap: number = await pbListScreen(settingname ?? "", new MapLister(rb(oldsetting) ? oldsetting![0] : 0));
    if (chosenmap >= 0) {
      const mappoint = await chooseMapPoint(chosenmap);
      return mappoint ? [chosenmap, mappoint[0], mappoint[1]] : oldsetting;
    } else {
      return oldsetting;
    }
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

export const MapCoordsFacingProperty = {
  async set(settingname: string | null, oldsetting: MapCoordsFacing | null): Promise<MapCoordsFacing | null> {
    const chosenmap: number = await pbListScreen(settingname ?? "", new MapLister(rb(oldsetting) ? oldsetting![0] : 0));
    if (chosenmap >= 0) {
      const mappoint = await chooseMapPoint(chosenmap);
      if (mappoint) {
        const facing = await pbMessage(_INTL("Choose the direction to face in."),
          [_INTL("Down"), _INTL("Left"), _INTL("Right"), _INTL("Up")], -1);
        return facing >= 0 ? [chosenmap, mappoint[0], mappoint[1], [2, 4, 6, 8][facing]!] : oldsetting;
      } else {
        return oldsetting;
      }
    } else {
      return oldsetting;
    }
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

export const RegionMapCoordsProperty = {
  async set(_settingname: string | null, oldsetting: MapCoords | null): Promise<MapCoords | null> {
    const regions = RegionMapCoordsProperty.getMapNameList();
    let selregion = -1;
    switch (regions.length) {
      case 0:
        await pbMessage(_INTL("No region maps are defined."));
        return oldsetting;
      case 1:
        selregion = regions[0]![0];
        break;
      default: {
        const cmds: string[] = [];
        for (const region of regions) cmds.push(region[1]);
        const selcmd = await pbMessage(_INTL("Choose a region map."), cmds, -1);
        if (selcmd >= 0) {
          selregion = regions[selcmd]![0];
        } else {
          return oldsetting;
        }
      }
    }
    const mappoint = await chooseMapPoint(selregion, true);
    return mappoint ? [selregion, mappoint[0], mappoint[1]] : oldsetting;
  },

  format(value: unknown): string {
    return inspect(value);
  },

  /** [[region number, region name], ...] */
  getMapNameList(): [number, string][] {
    const mapdata = pbLoadTownMapData();
    const ret: [number, string][] = [];
    for (let i = 0; i < mapdata.length; i++) {
      if (!mapdata[i]) continue;
      ret.push([i, mapdata[i]!.name ?? ""]); // pbGetMessage(MessageTypes::RegionNames, i)
    }
    return ret;
  },
};

/** [weather ID, probability] */
export type WeatherEffect = [Id, number];

export const WeatherEffectProperty = {
  async set(_settingname: string | null, oldsetting: WeatherEffect | null): Promise<WeatherEffect | null> {
    if (!rb(oldsetting)) oldsetting = ["None", 100];
    const options: string[] = [];
    const ids: Id[] = [];
    let defaultIndex = 0;
    for (const w of GameData.Weather.each()) {
      if (w.id === oldsetting![0]) defaultIndex = ids.length;
      options.push(w.realName);
      ids.push(w.id);
    }
    const cmd = await pbMessage(_INTL("Choose a weather effect."), options, -1, null, defaultIndex);
    if (cmd < 0 || ids[cmd] === "None") return null;
    const params = new ChooseNumberParams();
    params.setRange(0, 100);
    params.setDefaultValue(oldsetting![1]);
    const number = await pbMessageChooseNumber(_INTL("Set the probability of the weather."), params);
    return [ids[cmd]!, number];
  },

  format(value: WeatherEffect | null): string {
    return rb(value) ? GameData.Weather.get(value![0]).realName + `,${value![1]}` : "-";
  },
};

export const MapProperty = {
  async set(settingname: string | null, oldsetting: number | null): Promise<number | null> {
    const chosenmap: number = await pbListScreen(settingname ?? "", new MapLister(oldsetting ?? 0));
    return chosenmap > 0 ? chosenmap : oldsetting;
  },

  defaultValue(): number {
    return 0;
  },

  format(value: unknown): string {
    return inspect(value);
  },
};

export const ItemNameProperty = {
  async set(settingname: string | null, oldsetting: string | null): Promise<string> {
    return pbMessageFreeText(_INTL("Set the value for {1}.", settingname ?? ""),
      rb(oldsetting) ? oldsetting! : "", false, 30);
  },

  defaultValue(): string {
    return "???";
  },

  format(value: string | null): string {
    return value ?? "";
  },
};

export const PocketProperty = {
  async set(_settingname: string | null, oldsetting: number | null): Promise<number | null> {
    const commands = Settings.bagPocketNames().slice();
    const cmd = await pbMessage(_INTL("Choose a pocket for this item."), commands, -1);
    return cmd >= 0 ? cmd + 1 : oldsetting;
  },

  defaultValue(): number {
    return 1;
  },

  format(value: number | null): string {
    if (value === 0) return _INTL("No Pocket");
    return rb(value) ? (Settings.bagPocketNames()[value! - 1] ?? "") : inspect(value);
  },
};

export const BaseStatsProperty = {
  async set(settingname: string | null, oldsetting: StatHash | null): Promise<StatHash | null> {
    if (!rb(oldsetting)) return oldsetting;
    const properties: PropertyListEntry[] = [];
    const data: (number | null | undefined)[] = [];
    const statIds: Id[] = [];
    for (const s of GameData.Stat.eachMain()) {
      if (s.pbsOrder < 0) continue;
      properties[s.pbsOrder] = [_INTL("Base {1}", s.name), new NonzeroLimitProperty(255),
        _INTL("Base {1} stat of the Pokémon.", s.name)];
      data[s.pbsOrder] = oldsetting![s.id] ?? 10;
      statIds[s.pbsOrder] = s.id;
    }
    if (await pbPropertyList(settingname ?? "", data, properties, true)) {
      const ret: StatHash = {};
      statIds.forEach((s, i) => { ret[s] = data[i] ?? 10; });
      oldsetting = ret;
    }
    return oldsetting;
  },

  defaultValue(): StatHash {
    const ret: StatHash = {};
    for (const s of GameData.Stat.eachMain()) if (s.pbsOrder >= 0) ret[s.id] = 10;
    return ret;
  },

  format(value: StatHash): string {
    return formatStatHash(value);
  },
};

export const EffortValuesProperty = {
  async set(settingname: string | null, oldsetting: StatHash | null): Promise<StatHash | null> {
    if (!rb(oldsetting)) return oldsetting;
    const properties: PropertyListEntry[] = [];
    const data: (number | null | undefined)[] = [];
    const statIds: Id[] = [];
    for (const s of GameData.Stat.eachMain()) {
      if (s.pbsOrder < 0) continue;
      properties[s.pbsOrder] = [_INTL("{1} EVs", s.name), new LimitProperty(255),
        _INTL("Number of {1} Effort Value points gained from the Pokémon.", s.name)];
      data[s.pbsOrder] = oldsetting![s.id] ?? 0;
      statIds[s.pbsOrder] = s.id;
    }
    if (await pbPropertyList(settingname ?? "", data, properties, true)) {
      const ret: StatHash = {};
      statIds.forEach((s, i) => { ret[s] = data[i] ?? 0; });
      oldsetting = ret;
    }
    return oldsetting;
  },

  defaultValue(): StatHash {
    const ret: StatHash = {};
    for (const s of GameData.Stat.eachMain()) if (s.pbsOrder >= 0) ret[s.id] = 0;
    return ret;
  },

  format(value: StatHash): string {
    return formatStatHash(value);
  },
};

export const AbilityProperty = {
  async set(_settingname: string | null, oldsetting: Id | null): Promise<Id | null> {
    const ret = await pbChooseAbilityList(rb(oldsetting) ? oldsetting : null);
    return rb(ret) ? ret : oldsetting;
  },

  defaultValue(): null {
    return null;
  },

  format(value: Id | null): string {
    return rb(value) && GameData.Ability.exists(value) ? GameData.Ability.get(value!).realName : "-";
  },
};

/** Ruby's String#<=> (byte order for these names). */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export class GameDataPoolProperty {
  private gameData: string;
  private gameDataModule: GameDataModule;
  private allowMultiple: boolean;
  private autoSort: boolean;

  /** gameData: the GameData class's name ("Item", "Move", ...). */
  constructor(gameData: string, allowMultiple = true, autoSort = false) {
    const mod = gameDataConst(gameData);
    if (!mod) throw new Error(_INTL("Couldn't find class {1} in module GameData.", gameData));
    this.gameData = gameData;
    this.gameDataModule = mod;
    this.allowMultiple = allowMultiple;
    this.autoSort = autoSort; // Alphabetically
  }

  async set(_settingName: string | null, oldSetting: Id[]): Promise<Id[]> {
    let ret = oldSetting;
    if (!this.allowMultiple) { // uniq!
      const uniq = [...new Set(oldSetting)];
      oldSetting.splice(0, oldSetting.length, ...uniq);
    }
    if (this.autoSort) oldSetting.sort(cmpStr);
    // Get all values already in the pool
    const values: [Id | null, string][] = [];
    values.push([null, _INTL("[ADD VALUE]")]); // Value ID, name
    for (const value of oldSetting) {
      values.push([value, this.gameDataModule.get(value).realName]);
    }
    // Set things up
    const commandWindow = pbListWindow([], 200);
    let cmd: [number, number] = [0, 0]; // [input type, list index] (input type: 0=select, 1=swap up, 2=swap down)
    let commands: string[] = [];
    let needRefresh = true;
    // Edit value pool
    for (;;) {
      if (needRefresh) {
        if (this.autoSort) {
          values.sort((a, b) => (a[0] === null ? -1 : b[0] === null ? 1 : cmpStr(a[1], b[1])));
        }
        commands = values.map((entry) => entry[1]);
        needRefresh = false;
      }
      // Choose a value
      cmd = await pbCommands3(commandWindow, commands, -1, cmd[1], true);
      switch (cmd[0]) { // 0=selected/cancelled, 1=pressed Action+Up, 2=pressed Action+Down
        case 1: // Swap value up
          if (cmd[1] > 0 && cmd[1] < values.length - 1) {
            [values[cmd[1] + 1], values[cmd[1]]] = [values[cmd[1]]!, values[cmd[1] + 1]!];
            needRefresh = true;
          }
          break;
        case 2: // Swap value down
          if (cmd[1] > 1) {
            [values[cmd[1] - 1], values[cmd[1]]] = [values[cmd[1]]!, values[cmd[1] - 1]!];
            needRefresh = true;
          }
          break;
        case 0:
          if (cmd[1] >= 0) { // Chose an entry
            const entry = values[cmd[1]]!;
            if (entry[0] === null) { // Add new value
              const newValue: Id | null = await pbChooseFromGameDataList(this.gameData);
              if (rb(newValue)) {
                if (!this.allowMultiple && values.some((val) => val[0] === newValue)) {
                  cmd[1] = values.findIndex((val) => val[0] === newValue);
                  continue;
                }
                values.push([newValue, this.gameDataModule.get(newValue).realName]);
                needRefresh = true;
              }
            } else { // Edit existing value
              switch (await pbMessage(_INTL("\\ts[]Do what with this value?"),
                [_INTL("Change value"), _INTL("Delete"), _INTL("Cancel")], 3)) {
                case 0: { // Change value
                  const newValue: Id | null = await pbChooseFromGameDataList(this.gameData, entry[0]);
                  if (rb(newValue) && newValue !== entry[0]) {
                    if (!this.allowMultiple && values.some((val) => val[0] === newValue)) {
                      values.splice(cmd[1], 1);
                      cmd[1] = values.findIndex((val) => val[0] === newValue);
                      needRefresh = true;
                      continue;
                    }
                    entry[0] = newValue;
                    entry[1] = this.gameDataModule.get(newValue).realName;
                    if (this.autoSort) {
                      // NOTE (Ruby parity): 002_Editor_DataTypes.rb:1054 sorts without
                      // keeping "[ADD VALUE]" first; the refresh's sort moves it back,
                      // so the cursor can end up one entry above the changed value.
                      values.sort((a, b) => cmpStr(a[1], b[1]));
                      cmd[1] = values.findIndex((val) => val[0] === newValue);
                    }
                    needRefresh = true;
                  }
                  break;
                }
                case 1: // Delete
                  values.splice(cmd[1], 1);
                  cmd[1] = Math.min(cmd[1], values.length - 1);
                  needRefresh = true;
                  break;
              }
            }
          } else { // Cancel/quit
            const choice = await pbMessage(_INTL("Apply changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
            if (choice === 0) {
              values.shift(); // Remove the "add value" option
              ret = values.map((v) => v[0]).filter((v): v is Id => v !== null);
              commandWindow.dispose();
              return ret;
            } else if (choice === 1) {
              commandWindow.dispose();
              return ret;
            }
          }
          break;
      }
    }
  }

  defaultValue(): Id[] {
    return [];
  }

  format(value: Id[]): string {
    return value.map((val) => this.gameDataModule.get(val).realName).join(",");
  }
}

export class EggMovesProperty extends GameDataPoolProperty {
  constructor() {
    super("Move", false, true);
  }
}

/** [level, move ID] */
export type LevelUpMove = [number, Id];

export const LevelUpMovesProperty = {
  async set(_settingname: string | null, oldsetting: LevelUpMove[]): Promise<LevelUpMove[]> {
    // Get all moves in move pool
    const realcmds: [number, Id | null, number, string][] = [];
    realcmds.push([-1, null, -1, "-"]); // Level, move ID, index in this list, name
    for (let i = 0; i < oldsetting.length; i++) {
      realcmds.push([oldsetting[i]![0], oldsetting[i]![1], i, GameData.Move.get(oldsetting[i]![1]).realName]);
    }
    // Edit move pool
    const cmdwin = pbListWindow([], 200);
    let oldsel = -1;
    let ret = oldsetting;
    let cmd: [number, number] = [0, 0];
    let commands: string[] = [];
    let refreshlist = true;
    for (;;) {
      if (refreshlist) {
        realcmds.sort((a, b) => (a[0] === b[0] ? a[2] - b[2] : a[0] - b[0]));
        commands = [];
        realcmds.forEach((entry, i) => {
          if (entry[0] === -1) {
            commands.push(_INTL("[ADD MOVE]"));
          } else {
            commands.push(_INTL("{1}: {2}", entry[0], entry[3]));
          }
          if (oldsel >= 0 && entry[2] === oldsel) cmd[1] = i;
        });
      }
      refreshlist = false;
      oldsel = -1;
      cmd = await pbCommands3(cmdwin, commands, -1, cmd[1], true);
      switch (cmd[0]) {
        case 1: // Swap move up (if both moves have the same level)
          if (cmd[1] < realcmds.length - 1 && realcmds[cmd[1]]![0] === realcmds[cmd[1] + 1]![0]) {
            [realcmds[cmd[1] + 1]![2], realcmds[cmd[1]]![2]] = [realcmds[cmd[1]]![2], realcmds[cmd[1] + 1]![2]];
            refreshlist = true;
          }
          break;
        case 2: // Swap move down (if both moves have the same level)
          if (cmd[1] > 0 && realcmds[cmd[1]]![0] === realcmds[cmd[1] - 1]![0]) {
            [realcmds[cmd[1] - 1]![2], realcmds[cmd[1]]![2]] = [realcmds[cmd[1]]![2], realcmds[cmd[1] - 1]![2]];
            refreshlist = true;
          }
          break;
        case 0:
          if (cmd[1] >= 0) { // Chose an entry
            const entry = realcmds[cmd[1]]!;
            if (entry[0] === -1) { // Add new move
              const params = new ChooseNumberParams();
              params.setRange(0, GameData.GrowthRate.maxLevel());
              params.setDefaultValue(1);
              params.setCancelValue(-1);
              const newlevel = await pbMessageChooseNumber(_INTL("Choose a level."), params);
              if (newlevel >= 0) {
                const newmove: Id | null = await pbChooseMoveList();
                if (rb(newmove)) {
                  let havemove = -1;
                  for (const e of realcmds) {
                    if (e[0] === newlevel && e[1] === newmove) havemove = e[2];
                  }
                  if (havemove >= 0) {
                    oldsel = havemove;
                  } else {
                    let maxid = -1;
                    for (const e of realcmds) maxid = Math.max(maxid, e[2]);
                    realcmds.push([newlevel, newmove, maxid + 1, GameData.Move.get(newmove!).realName]);
                  }
                  refreshlist = true;
                }
              }
            } else { // Edit existing move
              switch (await pbMessage(_INTL("\\ts[]Do what with this move?"),
                [_INTL("Change level"), _INTL("Change move"), _INTL("Delete"), _INTL("Cancel")], 4)) {
                case 0: { // Change level
                  const params = new ChooseNumberParams();
                  params.setRange(0, GameData.GrowthRate.maxLevel());
                  params.setDefaultValue(entry[0]);
                  const newlevel = await pbMessageChooseNumber(_INTL("Choose a new level."), params);
                  if (newlevel >= 0 && newlevel !== entry[0]) {
                    let havemove = -1;
                    for (const e of realcmds) {
                      if (e[0] === newlevel && e[1] === entry[1]) havemove = e[2];
                    }
                    if (havemove >= 0) { // Move already known at new level; delete this move
                      realcmds.splice(cmd[1], 1);
                      oldsel = havemove;
                    } else { // Apply the new level
                      entry[0] = newlevel;
                      oldsel = entry[2];
                    }
                    refreshlist = true;
                  }
                  break;
                }
                case 1: { // Change move
                  const newmove: Id | null = await pbChooseMoveList(entry[1]);
                  if (rb(newmove) && newmove !== entry[1]) {
                    let havemove = -1;
                    for (const e of realcmds) {
                      if (e[0] === entry[0] && e[1] === newmove) havemove = e[2];
                    }
                    if (havemove >= 0) { // New move already known at level; delete this move
                      realcmds.splice(cmd[1], 1);
                      cmd[1] = Math.min(cmd[1], realcmds.length - 1);
                      oldsel = havemove;
                    } else { // Apply the new move
                      entry[1] = newmove;
                      entry[3] = GameData.Move.get(newmove!).realName;
                      oldsel = entry[2];
                    }
                    refreshlist = true;
                  }
                  break;
                }
                case 2: // Delete
                  realcmds.splice(cmd[1], 1);
                  cmd[1] = Math.min(cmd[1], realcmds.length - 1);
                  refreshlist = true;
                  break;
              }
            }
          } else { // Cancel/quit
            const choice = await pbMessage(_INTL("Save changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
            if (choice === 0) {
              realcmds.shift();
              // Remove name and index in this list
              ret = realcmds.map((e) => [e[0], e[1]] as LevelUpMove);
              cmdwin.dispose();
              return ret;
            } else if (choice === 1) {
              cmdwin.dispose();
              return ret;
            }
          }
          break;
      }
    }
  },

  defaultValue(): LevelUpMove[] {
    return [];
  },

  format(value: LevelUpMove[]): string {
    let ret = "";
    for (let i = 0; i < value.length; i++) {
      if (i > 0) ret += ",";
      ret += `${value[i]![0]},${GameData.Move.get(value[i]![1]).realName}`;
    }
    return ret;
  },
};

/** [species, evolution method, parameter] */
export type EvolutionEntry = [Id, Id, unknown];

/** Whether an evolution parameter type is a Symbol that isn't a GameData class (getConstantName shows it). */
function isConstantParameter(paramType: string): boolean {
  // Integer and String are Ruby classes, not Symbols.
  return paramType !== "Integer" && paramType !== "String" && !gameDataConst(paramType);
}

export class EvolutionsProperty {
  private methods: string[] = [];
  private evoIds: Id[] = [];

  constructor() {
    for (const e of GameData.Evolution.eachAlphabetically()) {
      this.methods.push(e.realName);
      this.evoIds.push(e.id);
    }
  }

  async editParameter(evoMethod: Id, value: unknown = null): Promise<unknown> {
    const paramType = GameData.Evolution.get(evoMethod).parameter as string | null;
    if (paramType === null) return null;
    let ret = value;
    switch (paramType) {
      case "Item":
        ret = await pbChooseItemList(value as Id | null);
        break;
      case "Move":
        ret = await pbChooseMoveList(value as Id | null);
        break;
      case "Species":
        ret = await pbChooseSpeciesList(value as Id | null);
        break;
      case "Type":
        ret = await pbChooseTypeList(value as Id | null);
        break;
      case "Ability":
        ret = await pbChooseAbilityList(value as Id | null);
        break;
      default: {
        // NOTE (Ruby parity): 002_Editor_DataTypes.rb:1282 is `when String`, but
        // param_type is the class String itself (String === String is false),
        // so String parameters (LocationFlag) get the number chooser below and
        // the free-text branch never runs:
        //   ret = pbMessageFreeText(_INTL("Enter a value."), ret || "", false, 250, Graphics.width)
        //   ret.strip!; ret = nil if ret.empty?
        const params = new ChooseNumberParams();
        params.setRange(0, 65_535);
        if (rb(value)) params.setDefaultValue(value as number);
        params.setCancelValue(-1);
        let num: number | null = await pbMessageChooseNumber(_INTL("Choose a parameter."), params);
        if (num < 0) num = null;
        ret = num;
      }
    }
    return ret;
  }

  async set(_settingname: string | null, oldsetting: EvolutionEntry[]): Promise<EvolutionEntry[]> {
    let ret = oldsetting;
    const cmdwin = pbListWindow([]);
    let commands: string[] = [];
    /** [species, method, parameter, index in this list]; the "add" entry is [-1, 0, 0, -1]. */
    const realcmds: [Id | -1, Id | 0, unknown, number][] = [];
    realcmds.push([-1, 0, 0, -1]);
    for (let i = 0; i < oldsetting.length; i++) {
      realcmds.push([oldsetting[i]![0], oldsetting[i]![1], oldsetting[i]![2], i]);
    }
    let refreshlist = true;
    let oldsel = -1;
    let cmd: [number, number] = [0, 0];
    for (;;) {
      if (refreshlist) {
        realcmds.sort((a, b) => a[3] - b[3]);
        commands = [];
        for (let i = 0; i < realcmds.length; i++) {
          if (realcmds[i]![3] < 0) {
            commands.push(_INTL("[ADD EVOLUTION]"));
          } else {
            let level = realcmds[i]![2];
            const evoMethodData = GameData.Evolution.get(realcmds[i]![1] as Id);
            const paramType = evoMethodData.parameter as string | null;
            if (paramType === null) {
              commands.push(_INTL("{1}: {2}",
                GameData.Species.get(realcmds[i]![0] as Id).name, evoMethodData.realName));
            } else {
              if (isConstantParameter(paramType)) {
                level = getConstantName(paramType, level);
              }
              if (!rb(level) || (typeof level === "string" && level === "")) level = "???";
              commands.push(_INTL("{1}: {2}, {3}",
                GameData.Species.get(realcmds[i]![0] as Id).name, evoMethodData.realName, String(level)));
            }
          }
          if (oldsel >= 0 && realcmds[i]![3] === oldsel) cmd[1] = i;
        }
      }
      refreshlist = false;
      oldsel = -1;
      cmd = await pbCommands3(cmdwin, commands, -1, cmd[1], true);
      switch (cmd[0]) {
        case 1: // Swap evolution up
          if (cmd[1] > 0 && cmd[1] < realcmds.length - 1) {
            [realcmds[cmd[1] + 1]![3], realcmds[cmd[1]]![3]] = [realcmds[cmd[1]]![3], realcmds[cmd[1] + 1]![3]];
            refreshlist = true;
          }
          break;
        case 2: // Swap evolution down
          if (cmd[1] > 1) {
            [realcmds[cmd[1] - 1]![3], realcmds[cmd[1]]![3]] = [realcmds[cmd[1]]![3], realcmds[cmd[1] - 1]![3]];
            refreshlist = true;
          }
          break;
        case 0:
          if (cmd[1] >= 0) {
            const entry = realcmds[cmd[1]]!;
            if (entry[3] === -1) { // Add new evolution path
              await pbMessage(_INTL("Choose an evolved form, method and parameter."));
              const newspecies: Id | null = await pbChooseSpeciesList();
              if (rb(newspecies)) {
                const newmethodindex = await pbMessage(_INTL("Choose an evolution method."), this.methods, -1);
                if (newmethodindex >= 0) {
                  const newmethod = this.evoIds[newmethodindex]!;
                  const newparam = await this.editParameter(newmethod);
                  if (rb(newparam) || GameData.Evolution.get(newmethod).parameter === null) {
                    let existingEvo = -1;
                    for (let i = 0; i < realcmds.length; i++) {
                      if (realcmds[i]![0] === newspecies &&
                          realcmds[i]![1] === newmethod &&
                          realcmds[i]![2] === newparam) existingEvo = realcmds[i]![3];
                    }
                    if (existingEvo >= 0) {
                      oldsel = existingEvo;
                    } else {
                      let maxid = -1;
                      for (const i of realcmds) maxid = Math.max(maxid, i[3]);
                      realcmds.push([newspecies!, newmethod, newparam, maxid + 1]);
                      oldsel = maxid + 1;
                    }
                    refreshlist = true;
                  }
                }
              }
            } else { // Edit evolution
              switch (await pbMessage(_INTL("\\ts[]Do what with this evolution?"),
                [_INTL("Change species"), _INTL("Change method"),
                  _INTL("Change parameter"), _INTL("Delete"), _INTL("Cancel")], 5)) {
                case 0: { // Change species
                  const newspecies: Id | null = await pbChooseSpeciesList(entry[0] as Id);
                  if (rb(newspecies)) {
                    let existingEvo = -1;
                    for (let i = 0; i < realcmds.length; i++) {
                      if (realcmds[i]![0] === newspecies &&
                          realcmds[i]![1] === entry[1] &&
                          realcmds[i]![2] === entry[2]) existingEvo = realcmds[i]![3];
                    }
                    if (existingEvo >= 0) {
                      realcmds.splice(cmd[1], 1);
                      oldsel = existingEvo;
                    } else {
                      entry[0] = newspecies!;
                      oldsel = entry[3];
                    }
                    refreshlist = true;
                  }
                  break;
                }
                case 1: { // Change method
                  let defaultIndex = 0;
                  this.evoIds.forEach((evo, i) => { if (evo === entry[1]) defaultIndex = i; });
                  const newmethodindex = await pbMessage(_INTL("Choose an evolution method."), this.methods, -1, null, defaultIndex);
                  if (newmethodindex >= 0) {
                    const newmethod = this.evoIds[newmethodindex]!;
                    let existingEvo = -1;
                    for (let i = 0; i < realcmds.length; i++) {
                      if (realcmds[i]![0] === entry[0] &&
                          realcmds[i]![1] === newmethod &&
                          realcmds[i]![2] === entry[2]) existingEvo = realcmds[i]![3];
                    }
                    if (existingEvo >= 0) {
                      realcmds.splice(cmd[1], 1);
                      oldsel = existingEvo;
                    } else if (newmethod !== entry[1]) {
                      entry[1] = newmethod;
                      entry[2] = 0;
                      oldsel = entry[3];
                    }
                    refreshlist = true;
                  }
                  break;
                }
                case 2: // Change parameter
                  if (GameData.Evolution.get(entry[1] as Id).parameter === null) {
                    await pbMessage(_INTL("This evolution method doesn't use a parameter."));
                  } else {
                    const newparam = await this.editParameter(entry[1] as Id, entry[2]);
                    if (rb(newparam)) {
                      let existingEvo = -1;
                      for (let i = 0; i < realcmds.length; i++) {
                        if (realcmds[i]![0] === entry[0] &&
                            realcmds[i]![1] === entry[1] &&
                            realcmds[i]![2] === newparam) existingEvo = realcmds[i]![3];
                      }
                      if (existingEvo >= 0) {
                        realcmds.splice(cmd[1], 1);
                        oldsel = existingEvo;
                      } else {
                        entry[2] = newparam;
                        oldsel = entry[3];
                      }
                      refreshlist = true;
                    }
                  }
                  break;
                case 3: // Delete
                  realcmds.splice(cmd[1], 1);
                  cmd[1] = Math.min(cmd[1], realcmds.length - 1);
                  refreshlist = true;
                  break;
              }
            }
          } else {
            const cmd2 = await pbMessage(_INTL("Save changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
            if (cmd2 === 0 || cmd2 === 1) {
              if (cmd2 === 0) {
                // Drop each entry's index in this list, and the "add" entry
                ret = realcmds.filter((e) => e[0] !== -1).map((e) => [e[0], e[1], e[2]] as EvolutionEntry);
              }
              cmdwin.dispose();
              return ret;
            }
          }
          break;
      }
    }
  }

  defaultValue(): EvolutionEntry[] {
    return [];
  }

  format(value: EvolutionEntry[]): string {
    let ret = "";
    for (let i = 0; i < value.length; i++) {
      if (i > 0) ret += ",";
      let param: unknown = value[i]![2];
      const evoMethodData = GameData.Evolution.get(value[i]![1]);
      const paramType = evoMethodData.parameter as string | null;
      if (paramType === null) {
        param = "";
      } else if (isConstantParameter(paramType)) {
        param = getConstantName(paramType, param);
      } else {
        param = param === null || param === undefined ? "" : String(param); // param.to_s
      }
      if (!rb(param)) param = "";
      ret += `${GameData.Species.get(value[i]![0]).name},${evoMethodData.realName},${String(param)}`;
    }
    return ret;
  }
}

/** [probability, species/form ID, minimum level, maximum level] */
export type EncounterSlot = [number, Id | null, number, number | null];

export const EncounterSlotProperty = {
  async set(settingName: string | null, data: EncounterSlot | null): Promise<EncounterSlot> {
    const maxLevel = GameData.GrowthRate.maxLevel();
    if (!rb(data)) {
      data = [20, null, 5, 5];
      for (const speciesData of GameData.Species.each()) {
        data[1] = speciesData.species;
        break;
      }
    }
    if (!rb(data![3])) data![3] = data![2];
    const properties: PropertyListEntry[] = [
      [_INTL("Probability"), new NonzeroLimitProperty(999), _INTL("Relative probability of choosing this slot.")],
      [_INTL("Species"), new SpeciesFormProperty(data![1]), _INTL("A Pokémon species/form.")],
      [_INTL("Minimum level"), new NonzeroLimitProperty(maxLevel), _INTL("Minimum level of this species (1-{1}).", maxLevel)],
      [_INTL("Maximum level"), new NonzeroLimitProperty(maxLevel), _INTL("Maximum level of this species (1-{1}).", maxLevel)],
    ];
    await pbPropertyList(settingName ?? "", data!, properties, false);
    if (data![2] > data![3]!) {
      [data![3], data![2]] = [data![2], data![3]!];
    }
    return data!;
  },

  defaultValue(): null {
    return null;
  },

  format(value: EncounterSlot | null): string {
    if (!rb(value)) return "-";
    const v = value!;
    const speciesData = GameData.Species.get(v[1]!);
    if (speciesData.form > 0) {
      if (v[2] === v[3]) {
        return `${v[0]}, ${speciesData.realName}_${speciesData.form} (Lv.${v[2]})`;
      }
      return `${v[0]}, ${speciesData.realName}_${speciesData.form} (Lv.${v[2]}-${v[3]})`;
    }
    if (v[2] === v[3]) {
      return `${v[0]}, ${speciesData.realName} (Lv.${v[2]})`;
    }
    return `${v[0]}, ${speciesData.realName} (Lv.${v[2]}-${v[3]})`;
  },
};

//===============================================================================
// Core property editor script
//===============================================================================
/** The "Name=value" lines pbPropertyList shows. */
export function propertyListCommands(data: unknown[], properties: PropertyListEntry[]): string[] {
  const commands: string[] = [];
  for (let i = 0; i < properties.length; i++) {
    const propobj = properties[i]![1];
    commands.push(`${properties[i]![0]}=${propobj.format(data[i])}`);
  }
  return commands;
}

/**
 * pbPropertyList(title, data, properties, saveprompt = false): edits `data`
 * in place (one value per property). With saveprompt, resolves to whether the
 * player chose to save; otherwise to null.
 */
export async function pbPropertyList(
  title: string, data: unknown[], properties: PropertyListEntry[], saveprompt = false,
): Promise<boolean | null> {
  // NOTE (Ruby parity): 002_Editor_DataTypes.rb:1551 never disposes this viewport.
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const list = pbListWindow([], Graphics.width / 2);
  list.viewport = viewport;
  list.z = 2;
  const titleWindow = Window_UnformattedTextPokemon.newWithSize(
    title, list.width, 0, Graphics.width / 2, 64, viewport,
  );
  titleWindow.z = 2;
  const desc = Window_UnformattedTextPokemon.newWithSize(
    "", list.width, titleWindow.height, Graphics.width / 2, Graphics.height - titleWindow.height, viewport,
  );
  desc.z = 2;
  let selectedmap = -1;
  let retval: boolean | null = null;
  list.commands = propertyListCommands(data, properties);
  list.index = 0;
  for (;;) {
    for (;;) {
      await Graphics.update();
      Input.update();
      list.update();
      desc.update();
      if (list.index !== selectedmap) {
        desc.text = properties[list.index]![2];
        selectedmap = list.index;
      }
      if (Input.trigger(Input.ACTION)) {
        const propobj = properties[selectedmap]![1];
        // (Ruby also checks propobj.is_a?(ReadOnlyProperty), which a module never is.)
        if (propobj !== ReadOnlyProperty &&
            await pbConfirmMessage(_INTL("Reset the setting {1}?", properties[selectedmap]![0]))) {
          if (typeof propobj.defaultValue === "function") {
            data[selectedmap] = propobj.defaultValue();
          } else {
            data[selectedmap] = null;
          }
        }
        list.commands = propertyListCommands(data, properties);
      } else if (Input.trigger(Input.BACK)) {
        selectedmap = -1;
        break;
      } else if (Input.trigger(Input.USE)) {
        const propobj = properties[selectedmap]![1];
        const oldsetting = data[selectedmap];
        const newsetting = await propobj.set(properties[selectedmap]![0], oldsetting);
        data[selectedmap] = newsetting;
        list.commands = propertyListCommands(data, properties);
        break;
      }
    }
    if (selectedmap === -1 && saveprompt) {
      const cmd = await pbMessage(_INTL("Save changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
      if (cmd === 2) {
        selectedmap = list.index;
      } else {
        retval = (cmd === 0);
      }
    }
    if (selectedmap === -1) break;
  }
  titleWindow.dispose();
  list.dispose();
  desc.dispose();
  Input.update();
  return retval;
}
