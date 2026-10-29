// Port of Data/Scripts/010_Data/001_Hardcoded data/007_Evolution.rb
// (+ the Generation 9 Pack's evolution methods, registered last as in the game).
//
// The procs read game state through the globals ($player → G.player, ...).

import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import type { PokemonBag } from "../../game/items/PokemonBag";
import { PBDayNight } from "../../game/dayNight";
import { G } from "../../game/globals";
import { type Id, SymbolData } from "./gameData";
import { MapMetadata } from "./mapMetadata";
import { Settings } from "./settings";
import { Weather } from "./weather";

/** What kind of value an evolution's parameter is: a Ruby class name or a GameData class name. */
export type EvolutionParameter = "Integer" | "String" | "Move" | "Type" | "Item" | "Species" | null;
type Param = number | string | null;

export class Evolution extends SymbolData {
  static DATA = new Map<Id, Evolution>();
  readonly id: Id;
  readonly realName: string;
  readonly parameter: EvolutionParameter;
  /** 0 means parameter is the minimum level. */
  readonly minimumLevel: number;
  readonly levelUpProc: ((pkmn: Pokemon, parameter: Param) => unknown) | null;
  readonly useItemProc: ((pkmn: Pokemon, parameter: Param, item: Id) => unknown) | null;
  readonly onTradeProc: ((pkmn: Pokemon, parameter: Param, otherPkmn: Pokemon) => unknown) | null;
  readonly afterBattleProc: ((pkmn: Pokemon, partyIndex: number, parameter: Param) => unknown) | null;
  readonly eventProc: ((pkmn: Pokemon, parameter: Param, value: unknown) => unknown) | null;
  readonly afterEvolutionProc: ((pkmn: Pokemon, newSpecies: Id, parameter: Param, evoSpecies: Id) => unknown) | null;

  constructor(hash: {
    id: Id; parameter?: EvolutionParameter; minimumLevel?: number;
    levelUpProc?: Evolution["levelUpProc"]; useItemProc?: Evolution["useItemProc"]; onTradeProc?: Evolution["onTradeProc"];
    afterBattleProc?: Evolution["afterBattleProc"]; eventProc?: Evolution["eventProc"]; afterEvolutionProc?: Evolution["afterEvolutionProc"];
  }) {
    super();
    this.id = hash.id;
    this.realName = hash.id;
    this.parameter = hash.parameter ?? null;
    this.minimumLevel = hash.minimumLevel ?? 0;
    this.levelUpProc = hash.levelUpProc ?? null;
    this.useItemProc = hash.useItemProc ?? null;
    this.onTradeProc = hash.onTradeProc ?? null;
    this.afterBattleProc = hash.afterBattleProc ?? null;
    this.eventProc = hash.eventProc ?? null;
    this.afterEvolutionProc = hash.afterEvolutionProc ?? null;
  }

  get name(): string { return this.realName; }

  callLevelUp(pkmn: Pokemon, parameter: Param): unknown {
    return this.levelUpProc ? this.levelUpProc(pkmn, parameter) : null;
  }
  callUseItem(pkmn: Pokemon, parameter: Param, item: Id): unknown {
    return this.useItemProc ? this.useItemProc(pkmn, parameter, item) : null;
  }
  callOnTrade(pkmn: Pokemon, parameter: Param, otherPkmn: Pokemon): unknown {
    return this.onTradeProc ? this.onTradeProc(pkmn, parameter, otherPkmn) : null;
  }
  callAfterBattle(pkmn: Pokemon, partyIndex: number, parameter: Param): unknown {
    return this.afterBattleProc ? this.afterBattleProc(pkmn, partyIndex, parameter) : null;
  }
  callEvent(pkmn: Pokemon, parameter: Param, value: unknown): unknown {
    return this.eventProc ? this.eventProc(pkmn, parameter, value) : null;
  }
  callAfterEvolution(pkmn: Pokemon, newSpecies: Id, parameter: Param, evoSpecies: Id): unknown {
    return this.afterEvolutionProc ? this.afterEvolutionProc(pkmn, newSpecies, parameter, evoSpecies) : null;
  }
}

// --- Access to game state used by the procs -----------------------------------
const player = () => G.player as unknown as Player;
const bag = () => (G as unknown as { bag: PokemonBag }).bag;
const gameTemp = () => G.gameTemp as unknown as Record<string, unknown>;
const weatherType = () => (G.gameScreen as unknown as { weatherType?: Id } | null)?.weatherType ?? "None";
/** $game_map.metadata */
const mapMetadata = () => (G.gameMap ? MapMetadata.tryGet(G.gameMap.mapId) : null);
const happinessNeeded = () => (Settings.APPLY_HAPPINESS_SOFT_CAP ? 160 : 220);
const lvl = (pkmn: Pokemon, parameter: Param) => pkmn.level >= (parameter as number);
/** The proc shared by every "item is consumed on evolution" method. */
const consumeHeldItem = (pkmn: Pokemon, newSpecies: Id, parameter: Param, evoSpecies: Id) => {
  if (evoSpecies !== newSpecies || !pkmn.hasItem(parameter as Id)) return false;
  pkmn.item = null; // Item is now consumed
  return true;
};

Evolution.register({
  id: "None",
});

Evolution.register({
  id: "Level",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter),
});

Evolution.register({
  id: "LevelMale",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && pkmn.male(),
});

Evolution.register({
  id: "LevelFemale",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && pkmn.female(),
});

Evolution.register({
  id: "LevelDay",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && PBDayNight.isDay(),
});

Evolution.register({
  id: "LevelNight",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && PBDayNight.isNight(),
});

Evolution.register({
  id: "LevelMorning",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && PBDayNight.isMorning(),
});

Evolution.register({
  id: "LevelAfternoon",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && PBDayNight.isAfternoon(),
});

Evolution.register({
  id: "LevelEvening",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && PBDayNight.isEvening(),
});

Evolution.register({
  id: "LevelNoWeather",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.gameScreen && weatherType() === "None",
});

Evolution.register({
  id: "LevelSun",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.gameScreen &&
    Weather.get(weatherType()).category === "Sun",
});

Evolution.register({
  id: "LevelRain",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.gameScreen &&
    ["Rain", "Fog"].includes(Weather.get(weatherType()).category),
});

Evolution.register({
  id: "LevelSnow",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.gameScreen &&
    Weather.get(weatherType()).category === "Hail",
});

Evolution.register({
  id: "LevelSandstorm",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.gameScreen &&
    Weather.get(weatherType()).category === "Sandstorm",
});

Evolution.register({
  id: "LevelCycling",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.pokemonGlobal && G.pokemonGlobal.bicycle,
});

Evolution.register({
  id: "LevelSurfing",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.pokemonGlobal && G.pokemonGlobal.surfing,
});

Evolution.register({
  id: "LevelDiving",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && !!G.pokemonGlobal && G.pokemonGlobal.diving,
});

Evolution.register({
  id: "LevelDarkness",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && mapMetadata()?.darkMap,
});

Evolution.register({
  id: "LevelDarkInParty",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && player().hasPokemonOfType("DARK"),
});

Evolution.register({
  id: "AttackGreater", // Hitmonlee
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && pkmn.attack > pkmn.defense,
});

Evolution.register({
  id: "AtkDefEqual", // Hitmontop
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && pkmn.attack === pkmn.defense,
});

Evolution.register({
  id: "DefenseGreater", // Hitmonchan
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && pkmn.attack < pkmn.defense,
});

Evolution.register({
  id: "Silcoon",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && (((pkmn.personalID >>> 16) & 0xFFFF) % 10) < 5,
});

Evolution.register({
  id: "Cascoon",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && (((pkmn.personalID >>> 16) & 0xFFFF) % 10) >= 5,
});

Evolution.register({
  id: "Ninjask",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter),
});

Evolution.register({
  id: "Shedinja",
  parameter: "Integer",
  afterEvolutionProc: (pkmn, newSpecies) => {
    if (player().partyFull()) return false;
    if (!bag().has("POKEBALL")) return false;
    pbDuplicatePokemonHook(pkmn, newSpecies);
    bag().remove("POKEBALL");
    return true;
  },
});

Evolution.register({
  id: "Happiness",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn) => pkmn.happiness >= happinessNeeded(),
});

Evolution.register({
  id: "HappinessMale",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn) => pkmn.happiness >= happinessNeeded() && pkmn.male(),
});

Evolution.register({
  id: "HappinessFemale",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn) => pkmn.happiness >= happinessNeeded() && pkmn.female(),
});

Evolution.register({
  id: "HappinessDay",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn) => pkmn.happiness >= happinessNeeded() && PBDayNight.isDay(),
});

Evolution.register({
  id: "HappinessNight",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn) => pkmn.happiness >= happinessNeeded() && PBDayNight.isNight(),
});

Evolution.register({
  id: "HappinessMove",
  parameter: "Move",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => {
    if (pkmn.happiness >= happinessNeeded()) return pkmn.moves.some((m) => m && m.id === parameter);
    return null;
  },
});

Evolution.register({
  id: "HappinessMoveType",
  parameter: "Type",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => {
    if (pkmn.happiness >= happinessNeeded()) return pkmn.moves.some((m) => m && m.type === parameter);
    return null;
  },
});

Evolution.register({
  id: "HappinessHoldItem",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter && pkmn.happiness >= happinessNeeded(),
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "MaxHappiness",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn) => pkmn.happiness === 255,
});

Evolution.register({
  id: "Beauty", // Feebas
  parameter: "Integer",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.beauty >= (parameter as number),
});

Evolution.register({
  id: "HoldItem",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter,
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "HoldItemMale",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter && pkmn.male(),
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "HoldItemFemale",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter && pkmn.female(),
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "DayHoldItem",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter && PBDayNight.isDay(),
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "NightHoldItem",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter && PBDayNight.isNight(),
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "HoldItemHappiness",
  parameter: "Item",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.itemId === parameter && pkmn.happiness >= happinessNeeded(),
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "HasMove",
  parameter: "Move",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.moves.some((m) => m && m.id === parameter),
});

Evolution.register({
  id: "HasMoveType",
  parameter: "Type",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (pkmn, parameter) => pkmn.moves.some((m) => m && m.type === parameter),
});

Evolution.register({
  id: "HasInParty",
  parameter: "Species",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (_pkmn, parameter) => player().hasSpecies(parameter as Id),
});

Evolution.register({
  id: "Location",
  parameter: "Integer",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (_pkmn, parameter) => G.gameMap!.mapId === parameter,
});

Evolution.register({
  id: "LocationFlag",
  parameter: "String",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (_pkmn, parameter) => mapMetadata()?.hasFlag(parameter as string),
});

Evolution.register({
  id: "Region",
  parameter: "Integer",
  minimumLevel: 1, // Needs any level up
  levelUpProc: (_pkmn, parameter) => {
    const mapMeta = mapMetadata();
    return mapMeta?.townMapPosition && mapMeta.townMapPosition[0] === parameter;
  },
});

Evolution.register({
  id: "Item",
  parameter: "Item",
  useItemProc: (_pkmn, parameter, item) => item === parameter,
});

Evolution.register({
  id: "ItemMale",
  parameter: "Item",
  useItemProc: (pkmn, parameter, item) => item === parameter && pkmn.male(),
});

Evolution.register({
  id: "ItemFemale",
  parameter: "Item",
  useItemProc: (pkmn, parameter, item) => item === parameter && pkmn.female(),
});

Evolution.register({
  id: "ItemDay",
  parameter: "Item",
  useItemProc: (_pkmn, parameter, item) => item === parameter && PBDayNight.isDay(),
});

Evolution.register({
  id: "ItemNight",
  parameter: "Item",
  useItemProc: (_pkmn, parameter, item) => item === parameter && PBDayNight.isNight(),
});

Evolution.register({
  id: "ItemHappiness",
  parameter: "Item",
  useItemProc: (pkmn, parameter, item) => item === parameter && pkmn.happiness >= happinessNeeded(),
});

Evolution.register({
  id: "Trade",
  onTradeProc: () => true,
});

Evolution.register({
  id: "TradeMale",
  onTradeProc: (pkmn) => pkmn.male(),
});

Evolution.register({
  id: "TradeFemale",
  onTradeProc: (pkmn) => pkmn.female(),
});

Evolution.register({
  id: "TradeDay",
  onTradeProc: () => PBDayNight.isDay(),
});

Evolution.register({
  id: "TradeNight",
  onTradeProc: () => PBDayNight.isNight(),
});

Evolution.register({
  id: "TradeItem",
  parameter: "Item",
  onTradeProc: (pkmn, parameter) => pkmn.itemId === parameter,
  afterEvolutionProc: consumeHeldItem,
});

Evolution.register({
  id: "TradeSpecies",
  parameter: "Species",
  onTradeProc: (pkmn, parameter, otherPkmn) => pkmn.species === parameter && !otherPkmn.hasItem("EVERSTONE"),
});

Evolution.register({
  id: "BattleDealCriticalHit",
  parameter: "Integer",
  afterBattleProc: (_pkmn, partyIndex, parameter) => {
    const dealt = gameTemp().partyCriticalHitsDealt as number[] | undefined;
    return !!dealt && dealt[partyIndex] != null && dealt[partyIndex]! >= (parameter as number);
  },
});

/** pbEvolutionEvent(number) */
export function pbEvolutionEvent(number: number): void {
  if (!G.player) return;
  for (const pkmn of player().ableParty()) pkmn.triggerEventEvolution(number);
}

Evolution.register({
  id: "Event",
  parameter: "Integer",
  eventProc: (_pkmn, parameter, value) => value === parameter,
});

Evolution.register({
  id: "EventAfterDamageTaken",
  parameter: "Integer",
  afterBattleProc: (pkmn, partyIndex) => {
    const taken = gameTemp().partyDirectDamageTaken as number[] | undefined;
    if (taken && taken[partyIndex] != null && taken[partyIndex]! >= 49) pkmn.readyToEvolve = true;
    return false;
  },
  eventProc: (pkmn, parameter, value) => value === parameter && pkmn.readyToEvolve,
});

// --- Generation 9 Pack Scripts/[000] General/[000] Pokemon.rb -----------------

Evolution.register({
  id: "CollectItems",
  parameter: "Item",
  minimumLevel: 1,
  levelUpProc: (_pkmn, parameter) => bag().quantity(parameter as Id) >= 999,
  afterEvolutionProc: (_pkmn, newSpecies, parameter, evoSpecies) => {
    if (evoSpecies !== newSpecies || bag().quantity(parameter as Id) < 999) return false;
    bag().remove(parameter as Id, 999);
    return true;
  },
});

Evolution.register({
  id: "LevelWithPartner",
  parameter: "Integer",
  levelUpProc: (pkmn, parameter) => lvl(pkmn, parameter) && (G.pokemonGlobal as unknown as { partner?: unknown }).partner,
});

Evolution.register({
  id: "LevelUseMoveCount",
  parameter: "Move",
  minimumLevel: 1,
  levelUpProc: (pkmn, parameter) => pkmn.evoMoveCount(parameter as Id) >= 20,
  afterEvolutionProc: (pkmn, newSpecies, parameter, evoSpecies) => {
    if (evoSpecies !== newSpecies || pkmn.evoMoveCount(parameter as Id) < 20) return false;
    pkmn.setEvoMoveCount(parameter as Id, 0);
    return true;
  },
});

Evolution.register({
  id: "LevelDefeatItsKindWithItem",
  parameter: "Item",
  minimumLevel: 1,
  levelUpProc: (pkmn, parameter) => pkmn.evoCrestCount(parameter as Id) >= 3,
  afterEvolutionProc: (pkmn, newSpecies, parameter, evoSpecies) => {
    if (evoSpecies !== newSpecies || pkmn.evoCrestCount(parameter as Id) < 3) return false;
    pkmn.setEvoCrestCount(parameter as Id, 0);
    return true;
  },
});

Evolution.register({
  id: "LevelRecoilDamage",
  parameter: "Integer",
  minimumLevel: 1,
  levelUpProc: (pkmn, parameter) => pkmn.evoRecoilCount >= (parameter as number),
  afterEvolutionProc: (pkmn, newSpecies, parameter, evoSpecies) => {
    if (evoSpecies !== newSpecies || pkmn.evoRecoilCount < (parameter as number)) return false;
    pkmn.evoRecoilCount = 0;
    return true;
  },
});

Evolution.register({
  id: "LevelWalk",
  parameter: "Integer",
  minimumLevel: 1,
  levelUpProc: (pkmn, parameter) => pkmn.evoStepCount >= (parameter as number),
  afterEvolutionProc: (pkmn, newSpecies, parameter, evoSpecies) => {
    if (evoSpecies !== newSpecies || pkmn.evoStepCount < (parameter as number)) return false;
    pkmn.evoStepCount = 0;
    return true;
  },
});

/**
 * PokemonEvolutionScene.pbDuplicatePokemon lives with the Pokémon utilities;
 * they set this at import so the data layer doesn't import game code.
 */
let pbDuplicatePokemonHook: (pkmn: Pokemon, newSpecies: Id) => void = () => {
  throw new Error("pbDuplicatePokemon isn't registered");
};
export function setDuplicatePokemonHook(fn: (pkmn: Pokemon, newSpecies: Id) => void): void {
  pbDuplicatePokemonHook = fn;
}
