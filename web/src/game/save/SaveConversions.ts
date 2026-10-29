// Port of Data/Scripts/002_Save data/003_SaveData_Conversion.rb (the
// conversion registry) and 005_Game_SaveConversions.rb (Essentials' v20
// conversions). They run on the save's JSON values before they're loaded,
// so they read and write plain objects (Ruby's instance variables, camelCased
// as the port stores them) instead of Ruby objects.
//
// The port writes essentials_version "20.1" in every save, so the v20
// conversions only run for a save without it (treated as "18.1", as in
// Ruby), i.e. one converted by hand from an old Ruby save.
// SaveData.ts's __format versioning handles the port's own JSON layout.

import { BerryPlant } from "../../data/gameData/berryPlant";

type Json = Record<string, unknown>;
type SaveData = Json;

/** PluginManager.compare_versions: digit by digit (hex digits), "." included. */
export function compareVersions(v1: string, v2: string): number {
  const norm = (v: string) => {
    let d = [...v];
    if (d[0] === ".") d.unshift("0"); // Turn ".123" into "0.123"
    while (d[d.length - 1] === ".") d = d.slice(0, -1); // Turn "123." into "123"
    return d;
  };
  const d1 = norm(v1), d2 = norm(v2);
  const hex = (c: string) => parseInt(c, 16) || 0; // String#to_i(16) ("." is 0)
  for (let i = 0; i < Math.max(d1.length, d2.length); i++) {
    const c1 = d1[i], c2 = d2[i];
    if (c1 != null) {
      if (c2 == null) return 1;
      if (hex(c1) > hex(c2)) return 1;
      if (hex(c1) < hex(c2)) return -1;
    } else if (c2 != null) {
      return -1;
    }
  }
  return 0;
}

/** SaveData::Conversion, configured like the Ruby DSL's block. */
export class Conversion {
  readonly id: string;
  title: string;
  triggerType: "essentials" | "game" | null = null;
  version: string | null = null;
  private valueProcs = new Map<string, (value: Json) => void>();
  private allProc: ((saveData: SaveData) => void) | null = null;

  constructor(id: string, block: (c: Conversion) => void) {
    this.id = id;
    this.title = `Running conversion ${id}`;
    block(this);
    if (this.triggerType == null || this.version == null) throw new Error(`Conversion ${id} is missing a condition`);
  }

  /** should_run?(version) */
  shouldRun(version: string): boolean {
    return compareVersions(version, this.version!) < 0;
  }

  run(saveData: SaveData): void {
    for (const [valueId, proc] of this.valueProcs) {
      if (!(valueId in saveData)) throw new Error(`Save data does not have value :${valueId}`);
      proc(saveData[valueId] as Json);
    }
    this.allProc?.(saveData);
  }

  runSingle(object: Json, key: string): void {
    this.valueProcs.get(key)?.(object);
  }

  // @!group Configuration
  displayTitle(newTitle: string): void { this.title = newTitle; }
  essentialsVersion(version: number | string): void {
    if (this.triggerType) throw new Error(`Multiple conditions in conversion ${this.id}`);
    this.version = String(version);
    this.triggerType = "essentials";
  }
  gameVersion(version: number | string): void {
    if (this.triggerType) throw new Error(`Multiple conditions in conversion ${this.id}`);
    this.version = String(version);
    this.triggerType = "game";
  }
  toValue(valueId: string, block: (value: Json) => void): void {
    if (this.valueProcs.has(valueId)) throw new Error(`Multiple to_value definitions in conversion ${this.id} for value ${valueId}`);
    this.valueProcs.set(valueId, block);
  }
  toAll(block: (saveData: SaveData) => void): void {
    if (this.allProc) throw new Error(`Multiple to_all definitions in conversion ${this.id}`);
    this.allProc = block;
  }
}

const conversions: Record<"essentials" | "game", Map<string, Conversion[]>> = { essentials: new Map(), game: new Map() };

export function registerConversion(id: string, block: (c: Conversion) => void): void {
  const conversion = new Conversion(id, block);
  const byVersion = conversions[conversion.triggerType!];
  if (!byVersion.has(conversion.version!)) byVersion.set(conversion.version!, []);
  byVersion.get(conversion.version!)!.push(conversion);
}

export function getConversions(saveData: SaveData): Conversion[] {
  const ret: Conversion[] = [];
  const versions = {
    essentials: (saveData.essentials_version as string | undefined) ?? "18.1",
    game: (saveData.game_version as string | undefined) ?? "0.0.0",
  };
  for (const triggerType of ["essentials", "game"] as const) {
    const sortedVersions = [...conversions[triggerType].keys()].sort(compareVersions);
    for (const version of sortedVersions) {
      for (const conversion of conversions[triggerType].get(version)!) {
        if (conversion.shouldRun(versions[triggerType])) ret.push(conversion);
      }
    }
  }
  return ret;
}

/**
 * SaveData.run_conversions(save_data): true if any ran (the caller backs the
 * save up first, as Ruby writes Game.rxdata.bak).
 */
export function runSaveConversions(saveData: SaveData, essentialsVersion: string, gameVersion: string): boolean {
  const toRun = getConversions(saveData);
  if (toRun.length === 0) return false;
  console.info(`Running ${toRun.length} save file conversions`);
  for (const conversion of toRun) {
    console.info(`${conversion.title}...`);
    conversion.run(saveData);
  }
  console.info("All save file conversions applied successfully");
  saveData.essentials_version = essentialsVersion;
  saveData.game_version = gameVersion;
  return true;
}

export function runSingleConversions(object: Json, key: string, saveData: SaveData): void {
  for (const conversion of getConversions(saveData)) conversion.runSingle(object, key);
}

//===============================================================================
// Conversions required to support backwards compatibility with old save files
// (within reason).
//===============================================================================
const isSymbol = (v: unknown) => typeof v === "string"; // Symbols are strings here

// Planted berries accidentally weren't converted in v19 to change their
// numerical IDs to symbolic IDs (for the berry planted and for mulch laid down).
registerConversion("v20_fix_planted_berry_numerical_ids", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Fixing berry plant IDs data");
  c.toValue("global_metadata", (global) => {
    const berries = ["CHERIBERRY", "CHESTOBERRY", "PECHABERRY", "RAWSTBERRY", "ASPEARBERRY", "LEPPABERRY", "ORANBERRY",
      "PERSIMBERRY", "LUMBERRY", "SITRUSBERRY", "FIGYBERRY", "WIKIBERRY", "MAGOBERRY", "AGUAVBERRY", "IAPAPABERRY",
      "RAZZBERRY", "BLUKBERRY", "NANABBERRY", "WEPEARBERRY", "PINAPBERRY", "POMEGBERRY", "KELPSYBERRY", "QUALOTBERRY",
      "HONDEWBERRY", "GREPABERRY", "TAMATOBERRY", "CORNNBERRY", "MAGOSTBERRY", "RABUTABERRY", "NOMELBERRY", "SPELONBERRY",
      "PAMTREBERRY", "WATMELBERRY", "DURINBERRY", "BELUEBERRY", "OCCABERRY", "PASSHOBERRY", "WACANBERRY", "RINDOBERRY",
      "YACHEBERRY", "CHOPLEBERRY", "KEBIABERRY", "SHUCABERRY", "COBABERRY", "PAYAPABERRY", "TANGABERRY", "CHARTIBERRY",
      "KASIBBERRY", "HABANBERRY", "COLBURBERRY", "BABIRIBERRY", "CHILANBERRY", "LIECHIBERRY", "GANLONBERRY", "SALACBERRY",
      "PETAYABERRY", "APICOTBERRY", "LANSATBERRY", "STARFBERRY", "ENIGMABERRY", "MICLEBERRY", "CUSTAPBERRY",
      "JABOCABERRY", "ROWAPBERRY"];
    const berryConversion = (n: number) => (n >= 389 && n <= 452 ? berries[n - 389] : undefined);
    const mulchConversion: Record<number, string> = { 59: "GROWTHMULCH", 60: "DAMPMULCH", 61: "STABLEMULCH", 62: "GOOEYMULCH" };
    for (const v of Object.values((global.eventvars as Json | undefined) ?? {})) {
      if (!Array.isArray(v)) continue;
      if (v.length < 6 || v.length > 8) continue; // Neither old nor new berry plant
      if (!isSymbol(v[1])) v[1] = berryConversion(v[1] as number) ?? "ORANBERRY"; // Planted berry item
      if (v[7] && !isSymbol(v[7])) v[7] = mulchConversion[v[7] as number] ?? null; // Mulch
    }
  });
});

registerConversion("v20_refactor_planted_berries_data", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Updating berry plant data format");
  c.toValue("global_metadata", (global) => {
    const eventvars = global.eventvars as Json | undefined;
    if (!eventvars) return;
    for (const [key, value] of Object.entries(eventvars)) {
      if (!Array.isArray(value)) continue;
      const data: Json = { __class: "BerryPlantData" };
      if (value.length === 6) { // Old berry plant data
        if (isSymbol(value[1])) {
          data.newMechanics = false;
          data.berryId = value[1];
          data.timeAlive = (value[0] as number) * BerryPlant.get(value[1] as string).hoursPerStage * 3600;
          data.timeLastUpdated = value[3];
          data.growthStage = value[0];
          data.replantCount = value[5];
          data.wateredThisStage = value[2];
          data.wateringCount = value[4];
        }
        eventvars[key] = data;
      } else if (value.length === 7 || value.length === 8) { // New berry plant data
        if (isSymbol(value[1])) {
          data.newMechanics = true;
          data.berryId = value[1];
          if (isSymbol(value[7])) data.mulchId = value[7];
          data.timeAlive = value[2];
          data.timeLastUpdated = value[3];
          data.growthStage = value[0];
          data.replantCount = value[5];
          data.moistureLevel = value[4];
          data.yieldPenalty = value[6];
        }
        eventvars[key] = data;
      }
    }
  });
});

registerConversion("v20_refactor_follower_data", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Updating follower data format");
  c.toValue("global_metadata", (global) => {
    const deps = global.dependentEvents as unknown[][] | undefined;
    if (deps && deps.length > 0) {
      global.followers = deps.map((f) => ({
        __class: "FollowerData", originalMapId: f[0], eventId: f[1], eventName: "reflection",
        currentMapId: f[2], x: f[3], y: f[4], direction: f[5], characterName: f[6], characterHue: f[7],
        name: f[8], commonEventId: f[9],
      }));
    }
    global.dependentEvents = null;
  });
});

/** 6 bits of an Integer of markings -> an Array of 0/1. */
function updateMarkings(pkmn: unknown): void {
  const p = pkmn as Json | null;
  if (!p || typeof p.markings !== "number") return;
  const m = p.markings;
  p.markings = [0, 1, 2, 3, 4, 5].map((i) => ((m & (1 << i)) === 0 ? 0 : 1));
}

registerConversion("v20_refactor_day_care_variables", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Refactoring Day Care variables");
  c.toValue("global_metadata", (global) => {
    global.dayCare ??= { __class: "DayCare", slots: [{ pokemon: null, initialLevel: 0 }, { pokemon: null, initialLevel: 0 }], eggGenerated: false, stepCounter: 0 };
    const old = global.daycare as unknown[][] | null | undefined;
    if (old == null) return;
    const dayCare = global.dayCare as { slots: Json[]; eggGenerated: boolean; stepCounter: unknown };
    for (const oldSlot of old) {
      // NOTE (Ruby parity): an empty old slot gets a level 50 Manaphy
      // (005_Game_SaveConversions.rb:176-179).
      if (!oldSlot[0]) {
        oldSlot[0] = { __class: "Pokemon", species: "MANAPHY", level: 50 };
        oldSlot[1] = 4;
      }
      for (const slot of dayCare.slots) {
        if (slot.pokemon) continue; // next if slot.filled?
        // NOTE (Ruby parity): `next` leaves the inner loop running, so every
        // empty slot gets the same old Pokémon (005_Game_SaveConversions.rb:181).
        slot.pokemon = oldSlot[0];
        slot.initialLevel = oldSlot[1];
        updateMarkings(slot.pokemon);
      }
    }
    const egg = global.daycareEgg;
    dayCare.eggGenerated = (typeof egg === "number" && egg > 0) || egg === true;
    dayCare.stepCounter = global.daycareEggSteps;
    global.daycare = null;
    global.daycareEgg = null;
    global.daycareEggSteps = null;
  });
});

registerConversion("v20_rename_bag_variables", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Renaming Bag variables");
  c.toValue("bag", (bag) => {
    if (bag.lastpocket != null) {
      bag.lastViewedPocket = bag.lastpocket;
      // NOTE (Ruby parity): clears @lastPocket, not @lastpocket (:221).
      bag.lastPocket = null;
    }
    if (bag.choices != null) {
      bag.lastPocketSelections = [...(bag.choices as unknown[])];
      bag.choices = null;
    }
    // @registeredItems -> @registered_items: the same field camelCased, nothing to rename.
    if (bag.registeredIndex != null) {
      bag.readyMenuSelection = bag.registeredIndex ?? [0, 0, 1];
      bag.registeredIndex = null;
    }
  });
});

registerConversion("v20_increment_player_character_id", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Incrementing player character ID");
  c.toValue("player", (player) => { player.characterID = Number(player.characterID ?? 0) + 1; });
});

registerConversion("v20_add_pokedex_records", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Adding more Pokédex records");
  c.toValue("player", (player) => {
    const dex = player.pokedex as Json | undefined;
    if (!dex) return;
    dex.caughtCounts ??= {};
    dex.defeatedCounts ??= {};
    dex.seenEggs ??= {};
    for (const sp of Object.values((dex.seenForms as Record<string, unknown[][]> | undefined) ?? {})) {
      if (!sp || Array.isArray(sp[0]?.[0])) continue; // Already converted to include shininess
      sp[0] = [sp[0], []];
      sp[1] = [sp[1], []];
    }
  });
});

registerConversion("v20_add_new_default_options", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Updating Options to include new settings");
  c.toValue("pokemon_system", (option) => {
    option.givenicknames ??= 0;
    option.sendtoboxes ??= 0;
  });
});

registerConversion("v20_fix_default_weather_type", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Fixing weather type 0 in effect");
  c.toValue("game_screen", (gameScreen) => {
    if (gameScreen.weatherType === 0) gameScreen.weatherType = "None";
  });
});

registerConversion("v20_add_stats", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Adding stats to save data");
  c.toAll((saveData) => {
    if (!("stats" in saveData)) {
      const playTime = Number(saveData.frame_count ?? 0) / 40; // Graphics.frame_rate
      saveData.stats = { __class: "GameStats", playTime, playSessions: 1, timeLastSaved: playTime };
    }
  });
});

registerConversion("v20_convert_pokemon_markings", (c) => {
  c.essentialsVersion(20);
  c.displayTitle("Updating format of Pokémon markings");
  c.toAll((saveData) => {
    const player = saveData.player as { party?: unknown[] } | undefined;
    for (const pkmn of player?.party ?? []) updateMarkings(pkmn);
    const storage = saveData.storage_system as { boxes?: { pokemon?: unknown[] }[] } | undefined;
    for (const box of storage?.boxes ?? []) for (const pkmn of box.pokemon ?? []) if (pkmn) updateMarkings(pkmn);
    const global = (saveData.global_metadata ?? {}) as Json;
    const partner = global.partner as unknown[] | null | undefined;
    if (partner) for (const pkmn of (partner[3] as unknown[]) ?? []) updateMarkings(pkmn);
    for (const pkmn of (global.roamPokemon as unknown[] | null | undefined) ?? []) updateMarkings(pkmn);
    for (const set of ((global.purifyChamber as { sets?: { list?: unknown[]; shadow?: unknown }[] } | undefined)?.sets) ?? []) {
      for (const pkmn of set.list ?? []) updateMarkings(pkmn);
      if (set.shadow) updateMarkings(set.shadow);
    }
    for (const team of (global.hallOfFame as unknown[][] | null | undefined) ?? []) {
      if (!team) continue;
      for (const pkmn of team) updateMarkings(pkmn);
    }
    const variables = ((saveData.variables as { data?: unknown[] } | unknown[] | undefined) ?? []);
    const list = Array.isArray(variables) ? variables : variables.data ?? [];
    for (let i = 0; i <= 5000; i++) {
      const value = list[i];
      if (Array.isArray(value)) for (const v of value) { if ((v as Json | null)?.__class === "Pokemon") updateMarkings(v); }
      else if ((value as Json | null)?.__class === "Pokemon") updateMarkings(value);
    }
  });
});
