// Port of Plugins/Triple Triad Booster Packs/TripleTriad_Booster_Packs.rb
// (FL's Triple Triad Booster Pack, as this game set it up): the BOOSTERPACK_*
// items give 5 cards from their pack's list. Cards are drawn ahead of time
// into $PokemonGlobal.booster_stock (MIN_PACK_STOCK per pack, saved), so
// resetting doesn't change what a pack gives.
//
// The item handlers are registered in game/items/pluginItems.ts and call
// PluginItemHooks.boosterPackGive (set in ./scripts.ts). Ruby's Bridge layer
// (multi-version support) is kept for v20 only.

import type { Id } from "../data/gameData/gameData";
import { Item } from "../data/gameData/item";
import { Species } from "../data/gameData/species";
import { rand } from "../core/random";
import { PokemonGlobalExtras } from "../game/battle/globalExtras";
import { _INTL } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { player, pokemonGlobal } from "./common";
import { pbGiveTriadCard, TriadCard } from "./TripleTriad";

export const LIST: (Id[] | null)[] = [
  // The below line is the booster of index 0 or full random
  null,
  // The below lines are the booster of index 1: Genesis Pack
  [
    "CATERPIE", "METAPOD", "WEEDLE", "KAKUNA", "PIDGEY", "RATTATA", "SPEAROW", "NIDORANfE",
    "NIDORANmA", "CLEFAIRY", "JIGGLYPUFF", "MAGNEMITE", "VOLTORB", "GOLDEEN", "MAGIKARP", "SENTRET",
    "LEDYBA", "SPINARAK", "CHINCHOU", "PICHU", "CLEFFA", "IGGLYBUFF", "TOGEPI", "MAREEP",
    "MARILL", "HOPPIP", "ELEKID",
  ],
  // The below lines are the booster of index 2: Colosseum Pack
  [
    "BULBASAUR", "CHARMANDER", "SQUIRTLE", "CATERPIE", "METAPOD", "WEEDLE", "KAKUNA", "PIDGEY",
    "RATTATA", "SPEAROW", "EKANS", "PIKACHU", "SANDSHREW", "NIDORANfE", "NIDORANmA", "CLEFAIRY",
    "VULPIX", "JIGGLYPUFF", "ZUBAT", "ODDISH", "PARAS", "VENONAT", "DIGLETT", "MEOWTH",
    "PSYDUCK", "MANKEY", "GROWLITHE", "POLIWAG", "ABRA", "MACHOP", "BELLSPROUT", "TENTACOOL",
    "GEODUDE", "PONYTA", "SLOWPOKE", "FARFETCHD", "DODUO", "SEEL", "GRIMER", "SHELLDER",
    "GASTLY", "ONIX", "DROWZEE", "KRABBY", "EXEGGCUTE", "CUBONE", "KOFFING", "RHYHORN",
    "HORSEA", "STARYU", "MAGIKARP", "DITTO", "EEVEE", "CHIKORITA", "CYNDAQUIL", "TOTODILE",
    "SENTRET", "LEDYBA", "SPINARAK", "CHINCHOU", "PICHU", "CLEFFA", "IGGLYBUFF", "TOGEPI",
    "NATU", "MAREEP", "MARILL", "HOPPIP", "AIPOM", "WOOPER", "UNOWN", "PINECO",
    "SNUBBULL", "TEDDIURSA", "SWINUB", "TYROGUE", "SMOOCHUM", "MAGBY",
  ],
  // The below lines are the booster of index 3: Discovery Pack
  [
    "BULBASAUR", "IVYSAUR", "SQUIRTLE", "WARTORTLE", "CATERPIE", "METAPOD", "BUTTERFREE", "PIDGEY",
    "PIDGEOTTO", "RATTATA", "RATICATE", "EKANS", "PIKACHU", "SANDSHREW", "NIDORANmA", "NIDORINO",
    "ZUBAT", "ODDISH", "GLOOM", "VENONAT", "VENOMOTH", "DIGLETT", "MEOWTH", "PSYDUCK",
    "MANKEY", "GROWLITHE", "ABRA", "KADABRA", "BELLSPROUT", "WEEPINBELL", "TENTACOOL", "GEODUDE",
    "GRAVELER", "PONYTA", "SLOWPOKE", "FARFETCHD", "DODUO", "SEEL", "GRIMER", "SHELLDER",
    "GASTLY", "HAUNTER", "KRABBY", "EXEGGCUTE", "CUBONE", "RHYHORN", "HORSEA", "STARYU",
    "SCYTHER", "ELECTABUZZ", "PINSIR", "MAGIKARP", "DITTO", "EEVEE", "CYNDAQUIL", "QUILAVA",
    "SENTRET", "FURRET", "LEDYBA", "LEDIAN", "CHINCHOU", "NATU", "MAREEP", "FLAAFFY",
    "MARILL", "AIPOM", "WOOPER", "QUAGSIRE", "MURKROW", "MISDREAVUS", "UNOWN", "PINECO",
    "SNUBBULL", "SHUCKLE", "HERACROSS", "TEDDIURSA", "SLUGMA", "SWINUB", "REMORAID", "SKARMORY",
    "PHANPY", "SMEARGLE", "TYROGUE", "MILTANK", "LARVITAR",
  ],
  // The below lines are the booster of index 4: Destiny Pack
  [
    "CHARMANDER", "CHARMELEON", "WEEDLE", "KAKUNA", "BEEDRILL", "RATTATA", "RATICATE", "SPEAROW",
    "FEAROW", "PIKACHU", "SANDSHREW", "NIDORANfE", "NIDORINA", "ZUBAT", "PARAS", "PARASECT",
    "DIGLETT", "MEOWTH", "PSYDUCK", "MANKEY", "GROWLITHE", "POLIWAG", "POLIWHIRL", "MACHOP",
    "MACHOKE", "TENTACOOL", "GEODUDE", "GRAVELER", "PONYTA", "SLOWPOKE", "FARFETCHD", "DODUO",
    "SEEL", "GRIMER", "SHELLDER", "ONIX", "DROWZEE", "KRABBY", "VOLTORB", "EXEGGCUTE",
    "CUBONE", "LICKITUNG", "KOFFING", "TANGELA", "HORSEA", "GOLDEEN", "STARYU", "MRMIME",
    "JYNX", "MAGMAR", "TAUROS", "MAGIKARP", "DITTO", "EEVEE", "DRATINI", "CHIKORITA",
    "BAYLEEF", "TOTODILE", "CROCONAW", "HOOTHOOT", "NOCTOWL", "SPINARAK", "ARIADOS", "CHINCHOU",
    "NATU", "MAREEP", "FLAAFFY", "MARILL", "HOPPIP", "SKIPLOOM", "SUNKERN", "WOBBUFFET",
    "PINECO", "SNUBBULL", "QWILFISH", "SNEASEL", "TEDDIURSA", "SWINUB", "CORSOLA", "DELIBIRD",
    "HOUNDOUR", "SMEARGLE", "TYROGUE",
  ],
  // The below lines are the booster of index 5: Evolution Pack
  [
    "BULBASAUR", "IVYSAUR", "CHARMANDER", "CHARMELEON", "CHARIZARD", "SQUIRTLE", "WARTORTLE", "CATERPIE",
    "METAPOD", "BUTTERFREE", "PIDGEY", "PIDGEOTTO", "RATTATA", "RATICATE", "SPEAROW", "FEAROW",
    "EKANS", "ARBOK", "PIKACHU", "SANDSHREW", "SANDSLASH", "NIDORANfE", "NIDORINA", "NIDOQUEEN",
    "CLEFAIRY", "CLEFABLE", "JIGGLYPUFF", "WIGGLYTUFF", "ODDISH", "GLOOM", "VILEPLUME", "VENONAT",
    "VENOMOTH", "MEOWTH", "PERSIAN", "MANKEY", "PRIMEAPE", "POLIWAG", "POLIWHIRL", "POLIWRATH",
    "MACHOP", "MACHOKE", "MACHAMP", "TENTACOOL", "TENTACRUEL", "PONYTA", "RAPIDASH", "MAGNEMITE",
    "MAGNETON", "SEEL", "DEWGONG", "SHELLDER", "CLOYSTER", "ONIX", "DROWZEE", "HYPNO",
    "VOLTORB", "ELECTRODE", "CUBONE", "MAROWAK", "HITMONCHAN", "LICKITUNG", "KOFFING", "WEEZING",
    "CHANSEY", "TANGELA", "HORSEA", "SEADRA", "STARYU", "STARMIE", "SCYTHER", "ELECTABUZZ",
    "PINSIR", "MAGIKARP", "GYARADOS", "DITTO", "EEVEE", "VAPOREON", "FLAREON", "OMANYTE",
    "AERODACTYL", "CHIKORITA", "BAYLEEF", "MEGANIUM", "TOTODILE", "CROCONAW", "FERALIGATR", "SENTRET",
    "FURRET", "HOOTHOOT", "NOCTOWL", "LEDYBA", "LEDIAN", "SPINARAK", "ARIADOS", "CHINCHOU",
    "LANTURN", "TOGETIC", "MAREEP", "FLAAFFY", "AMPHAROS", "MARILL", "AZUMARILL", "HOPPIP",
    "SKIPLOOM", "JUMPLUFF", "AIPOM", "YANMA", "WOOPER", "QUAGSIRE", "ESPEON", "MURKROW",
    "MISDREAVUS", "UNOWN", "WOBBUFFET", "PINECO", "FORRETRESS", "GLIGAR", "QWILFISH", "SHUCKLE",
    "HERACROSS", "SNEASEL", "TEDDIURSA", "URSARING", "SWINUB", "PILOSWINE", "CORSOLA", "REMORAID",
    "DELIBIRD", "SKARMORY", "HOUNDOUR", "HOUNDOOM", "PHANPY", "STANTLER", "SMEARGLE", "TYROGUE",
    "MILTANK", "LARVITAR", "PUPITAR",
  ],
  // The below lines are the booster of index 6: Mystery Pack
  [
    "BULBASAUR", "IVYSAUR", "VENUSAUR", "CHARMANDER", "CHARMELEON", "SQUIRTLE", "WARTORTLE", "BLASTOISE",
    "WEEDLE", "KAKUNA", "BEEDRILL", "PIDGEY", "PIDGEOTTO", "PIDGEOT", "RATTATA", "RATICATE",
    "SPEAROW", "FEAROW", "EKANS", "ARBOK", "PIKACHU", "RAICHU", "NIDORANmA", "NIDORINO",
    "NIDOKING", "VULPIX", "NINETALES", "ZUBAT", "GOLBAT", "PARAS", "PARASECT", "DIGLETT",
    "DUGTRIO", "PSYDUCK", "GOLDUCK", "GROWLITHE", "ARCANINE", "ABRA", "KADABRA", "ALAKAZAM",
    "BELLSPROUT", "WEEPINBELL", "VICTREEBEL", "GEODUDE", "GRAVELER", "GOLEM", "SLOWPOKE", "SLOWBRO",
    "FARFETCHD", "DODUO", "DODRIO", "GRIMER", "MUK", "GASTLY", "HAUNTER", "ONIX",
    "DROWZEE", "KRABBY", "KINGLER", "EXEGGCUTE", "EXEGGUTOR", "HITMONLEE", "LICKITUNG", "RHYHORN",
    "RHYDON", "TANGELA", "KANGASKHAN", "GOLDEEN", "SEAKING", "MRMIME", "JYNX", "MAGMAR",
    "TAUROS", "MAGIKARP", "LAPRAS", "DITTO", "EEVEE", "JOLTEON", "PORYGON", "KABUTO",
    "DRATINI", "DRAGONAIR", "CYNDAQUIL", "QUILAVA", "TYPHLOSION", "SENTRET", "FURRET", "HOOTHOOT",
    "NOCTOWL", "LEDYBA", "LEDIAN", "SPINARAK", "ARIADOS", "CHINCHOU", "LANTURN", "NATU",
    "XATU", "BELLOSSOM", "SUDOWOODO", "POLITOED", "AIPOM", "SUNKERN", "SUNFLORA", "WOOPER",
    "QUAGSIRE", "UMBREON", "MURKROW", "MISDREAVUS", "UNOWN", "WOBBUFFET", "GIRAFARIG", "DUNSPARCE",
    "SNUBBULL", "GRANBULL", "QWILFISH", "SHUCKLE", "HERACROSS", "SNEASEL", "TEDDIURSA", "SLUGMA",
    "MAGCARGO", "CORSOLA", "REMORAID", "OCTILLERY", "DELIBIRD", "MANTINE", "PHANPY", "DONPHAN",
    "SMEARGLE", "TYROGUE", "HITMONTOP", "MILTANK",
  ],
  // The below lines are the booster of index 7: Revelations Pack
  [
    "BULBASAUR", "IVYSAUR", "CHARMANDER", "CHARMELEON", "SQUIRTLE", "WARTORTLE", "CATERPIE", "METAPOD",
    "BUTTERFREE", "WEEDLE", "KAKUNA", "BEEDRILL", "PIDGEY", "PIDGEOTTO", "PIDGEOT", "RATTATA",
    "RATICATE", "SPEAROW", "FEAROW", "EKANS", "ARBOK", "PIKACHU", "RAICHU", "SANDSHREW",
    "SANDSLASH", "NIDORANfE", "NIDORINA", "NIDOQUEEN", "NIDORANmA", "NIDORINO", "NIDOKING", "CLEFAIRY",
    "CLEFABLE", "VULPIX", "NINETALES", "JIGGLYPUFF", "WIGGLYTUFF", "ZUBAT", "GOLBAT", "ODDISH",
    "GLOOM", "VILEPLUME", "PARAS", "PARASECT", "VENONAT", "VENOMOTH", "DIGLETT", "DUGTRIO",
    "MEOWTH", "PERSIAN", "PSYDUCK", "GOLDUCK", "MANKEY", "PRIMEAPE", "GROWLITHE", "ARCANINE",
    "POLIWAG", "POLIWHIRL", "POLIWRATH", "ABRA", "KADABRA", "ALAKAZAM", "MACHOP", "MACHOKE",
    "MACHAMP", "BELLSPROUT", "WEEPINBELL", "VICTREEBEL", "TENTACOOL", "TENTACRUEL", "GEODUDE", "GRAVELER",
    "GOLEM", "PONYTA", "RAPIDASH", "SLOWPOKE", "SLOWBRO", "MAGNEMITE", "MAGNETON", "FARFETCHD",
    "DODUO", "DODRIO", "SEEL", "DEWGONG", "GRIMER", "MUK", "SHELLDER", "CLOYSTER",
    "GASTLY", "HAUNTER", "GENGAR", "ONIX", "DROWZEE", "HYPNO", "KRABBY", "KINGLER",
    "VOLTORB", "ELECTRODE", "EXEGGCUTE", "EXEGGUTOR", "CUBONE", "MAROWAK", "HITMONLEE", "HITMONCHAN",
    "LICKITUNG", "KOFFING", "WEEZING", "RHYHORN", "RHYDON", "CHANSEY", "TANGELA", "KANGASKHAN",
    "HORSEA", "SEADRA", "GOLDEEN", "SEAKING", "STARYU", "STARMIE", "MRMIME", "SCYTHER",
    "JYNX", "ELECTABUZZ", "MAGMAR", "PINSIR", "TAUROS", "MAGIKARP", "GYARADOS", "LAPRAS",
    "DITTO", "EEVEE", "VAPOREON", "JOLTEON", "FLAREON", "PORYGON", "OMANYTE", "OMASTAR",
    "KABUTO", "KABUTOPS", "AERODACTYL", "SNORLAX", "ARTICUNO", "ZAPDOS", "MOLTRES", "DRATINI",
    "DRAGONAIR", "DRAGONITE", "CHIKORITA", "BAYLEEF", "CYNDAQUIL", "QUILAVA", "TOTODILE", "CROCONAW",
    "SENTRET", "FURRET", "HOOTHOOT", "NOCTOWL", "LEDYBA", "LEDIAN", "SPINARAK", "ARIADOS",
    "CROBAT", "CHINCHOU", "LANTURN", "PICHU", "CLEFFA", "IGGLYBUFF", "TOGEPI", "TOGETIC",
    "NATU", "XATU", "MAREEP", "FLAAFFY", "AMPHAROS", "BELLOSSOM", "MARILL", "AZUMARILL",
    "SUDOWOODO", "POLITOED", "HOPPIP", "SKIPLOOM", "JUMPLUFF", "AIPOM", "SUNKERN", "SUNFLORA",
    "YANMA", "WOOPER", "QUAGSIRE", "ESPEON", "UMBREON", "MURKROW", "SLOWKING", "MISDREAVUS",
    "UNOWN", "WOBBUFFET", "GIRAFARIG", "PINECO", "FORRETRESS", "DUNSPARCE", "GLIGAR", "STEELIX",
    "SNUBBULL", "GRANBULL", "QWILFISH", "SCIZOR", "SHUCKLE", "HERACROSS", "SNEASEL", "TEDDIURSA",
    "URSARING", "SLUGMA", "MAGCARGO", "SWINUB", "PILOSWINE", "CORSOLA", "REMORAID", "OCTILLERY",
    "DELIBIRD", "MANTINE", "SKARMORY", "HOUNDOUR", "HOUNDOOM", "KINGDRA", "PHANPY", "DONPHAN",
    "PORYGON2", "STANTLER", "SMEARGLE", "TYROGUE", "HITMONTOP", "MILTANK", "BLISSEY", "RAIKOU",
    "ENTEI", "SUICUNE", "LARVITAR", "PUPITAR", "TYRANITAR",
  ],
  // The below lines are the booster of index 8: Laboratory Pack
  [
    "BULBASAUR", "IVYSAUR", "VENUSAUR", "CHARMANDER", "CHARMELEON", "CHARIZARD", "SQUIRTLE", "WARTORTLE",
    "BLASTOISE", "CATERPIE", "METAPOD", "BUTTERFREE", "WEEDLE", "KAKUNA", "BEEDRILL", "PIDGEY",
    "PIDGEOTTO", "PIDGEOT", "RATTATA", "RATICATE", "SPEAROW", "FEAROW", "EKANS", "ARBOK",
    "PIKACHU", "RAICHU", "SANDSHREW", "SANDSLASH", "NIDORANfE", "NIDORINA", "NIDOQUEEN", "NIDORANmA",
    "NIDORINO", "NIDOKING", "CLEFAIRY", "CLEFABLE", "VULPIX", "NINETALES", "JIGGLYPUFF", "WIGGLYTUFF",
    "ZUBAT", "GOLBAT", "ODDISH", "GLOOM", "VILEPLUME", "PARAS", "PARASECT", "VENONAT",
    "VENOMOTH", "DIGLETT", "DUGTRIO", "MEOWTH", "PERSIAN", "PSYDUCK", "GOLDUCK", "MANKEY",
    "PRIMEAPE", "GROWLITHE", "ARCANINE", "POLIWAG", "POLIWHIRL", "POLIWRATH", "ABRA", "KADABRA",
    "ALAKAZAM", "MACHOP", "MACHOKE", "MACHAMP", "BELLSPROUT", "WEEPINBELL", "VICTREEBEL", "TENTACOOL",
    "TENTACRUEL", "GEODUDE", "GRAVELER", "GOLEM", "PONYTA", "RAPIDASH", "SLOWPOKE", "SLOWBRO",
    "MAGNEMITE", "MAGNETON", "FARFETCHD", "DODUO", "DODRIO", "SEEL", "DEWGONG", "GRIMER",
    "MUK", "SHELLDER", "CLOYSTER", "GASTLY", "HAUNTER", "GENGAR", "ONIX", "DROWZEE",
    "HYPNO", "KRABBY", "KINGLER", "VOLTORB", "ELECTRODE", "EXEGGCUTE", "EXEGGUTOR", "CUBONE",
    "MAROWAK", "HITMONLEE", "HITMONCHAN", "LICKITUNG", "KOFFING", "WEEZING", "RHYHORN", "RHYDON",
    "CHANSEY", "TANGELA", "KANGASKHAN", "HORSEA", "SEADRA", "GOLDEEN", "SEAKING", "STARYU",
    "STARMIE", "MRMIME", "SCYTHER", "JYNX", "ELECTABUZZ", "MAGMAR", "PINSIR", "TAUROS",
    "MAGIKARP", "GYARADOS", "LAPRAS", "DITTO", "EEVEE", "VAPOREON", "JOLTEON", "FLAREON",
    "PORYGON", "OMANYTE", "OMASTAR", "KABUTO", "KABUTOPS", "AERODACTYL", "SNORLAX", "ARTICUNO",
    "ZAPDOS", "MOLTRES", "DRATINI", "DRAGONAIR", "DRAGONITE", "MEWTWO", "MEW", "CHIKORITA",
    "BAYLEEF", "MEGANIUM", "CYNDAQUIL", "QUILAVA", "TYPHLOSION", "TOTODILE", "CROCONAW", "FERALIGATR",
    "SENTRET", "FURRET", "HOOTHOOT", "NOCTOWL", "LEDYBA", "LEDIAN", "SPINARAK", "ARIADOS",
    "CROBAT", "CHINCHOU", "LANTURN", "PICHU", "CLEFFA", "IGGLYBUFF", "TOGEPI", "TOGETIC",
    "NATU", "XATU", "MAREEP", "FLAAFFY", "AMPHAROS", "BELLOSSOM", "MARILL", "AZUMARILL",
    "SUDOWOODO", "POLITOED", "HOPPIP", "SKIPLOOM", "JUMPLUFF", "AIPOM", "SUNKERN", "SUNFLORA",
    "YANMA", "WOOPER", "QUAGSIRE", "ESPEON", "UMBREON", "MURKROW", "SLOWKING", "MISDREAVUS",
    "UNOWN", "WOBBUFFET", "GIRAFARIG", "PINECO", "FORRETRESS", "DUNSPARCE", "GLIGAR", "STEELIX",
    "SNUBBULL", "GRANBULL", "QWILFISH", "SCIZOR", "SHUCKLE", "HERACROSS", "SNEASEL", "TEDDIURSA",
    "URSARING", "SLUGMA", "MAGCARGO", "SWINUB", "PILOSWINE", "CORSOLA", "REMORAID", "OCTILLERY",
    "DELIBIRD", "MANTINE", "SKARMORY", "HOUNDOUR", "HOUNDOOM", "KINGDRA", "PHANPY", "DONPHAN",
    "PORYGON2", "STANTLER", "SMEARGLE", "TYROGUE", "HITMONTOP", "SMOOCHUM", "ELEKID", "MAGBY",
    "MILTANK", "BLISSEY", "RAIKOU", "ENTEI", "SUICUNE", "LARVITAR", "PUPITAR", "TYRANITAR",
    "LUGIA", "HOOH", "CELEBI",
  ],
];

export const MIN_PACK_STOCK = 30;

export const BoosterPack = {
  LIST,
  MIN_PACK_STOCK,

  initializeAllPacks(): void {
    for (let i = 0; i < LIST.length; i++) fillBoosterStock(i);
  },

  validateList(): void {
    for (const packList of LIST) {
      if (!packList || packList.length === 0) continue;
      const invalid = BoosterPack.getInvalidSpeciesSym(packList);
      if (invalid) throw new RangeError(`${invalid} isn't a valid species!`);
    }
  },

  getInvalidSpeciesSym(array: Id[]): Id | undefined {
    return array.find((s) => !Bridge.speciesSymIsValid(s));
  },

  randomCard(boosterList: Id[] | null | undefined): Id {
    if (!boosterList || boosterList.length === 0) return Bridge.randomSpecies();
    return boosterList[rand(boosterList.length)]!;
  },

  randomCardByIndex(index: number): Id {
    return BoosterPack.randomCard(LIST[index]);
  },

  async give(item: Id, numberOfCards: number, boosterIndex = 0): Promise<number> {
    BoosterPack.validateList();
    await Bridge.message(_INTL(
      "{1} opened the {2}.", Bridge.player().name, Bridge.itemName(item),
    ));
    for (let n = 0; n < numberOfCards; n++) {
      let cardSpecies: Id;
      if (MIN_PACK_STOCK > 0) {
        cardSpecies = firstBoosterAtStock(boosterIndex);
      } else {
        cardSpecies = BoosterPack.randomCardByIndex(boosterIndex);
      }
      Bridge.giveTriadCard(cardSpecies, 1);
      await Bridge.message(_INTL(
        "{1} draws {2} card!",
        Bridge.player().name,
        Bridge.speciesName(cardSpecies),
      ));
    }
    return Bridge.endItemAsConsumedCode();
  },

  printSpeciesArray(type: Id): void {
    Bridge.printValue(BoosterPack.createSpeciesArray(type));
  },

  createSpeciesArray(type: Id): Id[] {
    return Bridge.createSpeciesArray(type);
  },
};

// Essentials multiversion layer (v20 branches only)
export const Bridge = {
  message: (string: string) => pbMessage(string),
  endItemAsConsumedCode: () => 1,
  giveTriadCard: (sym: Id, quantity: number) => pbGiveTriadCard(sym, quantity),
  player,
  speciesName(species: Id): string {
    return new TriadCard(species).name;
    // return GameData::Species.get(species).name
  },
  speciesSymIsValid(_speciesSym: Id): boolean {
    return true;
    // return GameData::Species.try_get(species_sym) != nil
  },
  randomSpecies(): Id {
    const randomSpeciesArray = Bridge.createRandomSpeciesArrayV19Plus();
    return randomSpeciesArray[rand(randomSpeciesArray.length)]!;
  },
  createRandomSpeciesArrayV19Plus(): Id[] {
    return Species.eachSpecies().map((species) => species.id);
  },
  printValue(value: unknown): void {
    // Input.clipboard = value.to_s; print(value.inspect)
    void navigator.clipboard?.writeText(String(value)).catch(() => {});
    console.log(JSON.stringify(value));
  },
  createSpeciesArray(type: Id): Id[] {
    return Species.eachSpecies().filter((species) => species.types.includes(type)).map((species) => species.id);
  },
  itemName: (item: Id) => Item.get(item).name,
};

//===============================================================================
// PokemonGlobalMetadata#booster_stock (MIN_PACK_STOCK > 0)
//===============================================================================
type Stock = (Id[] | null)[];

function stock(): Stock | null {
  return (pokemonGlobal().boosterStock as Stock | undefined) ?? null;
}

export function fillBoosterStock(boosterIndex: number): void {
  if (!stock()) pokemonGlobal().boosterStock = [];
  const s = stock()!;
  if (s.length <= boosterIndex || !s[boosterIndex]) {
    while (s.length < boosterIndex) s.push(null); // Ruby fills the gap with nil
    s[boosterIndex] = [];
  }
  while (s[boosterIndex]!.length < MIN_PACK_STOCK) {
    s[boosterIndex]!.push(
      BoosterPack.randomCardByIndex(boosterIndex),
    );
  }
}

// Gives the first available booster at stock.
// Call fill_booster_stock before and after since the variable on first time
// isn't initialized
export function firstBoosterAtStock(boosterIndex: number): Id {
  fillBoosterStock(boosterIndex);
  const ret = stock()![boosterIndex]!.shift()!;
  fillBoosterStock(boosterIndex);
  return ret;
}

PokemonGlobalExtras.register("boosterStock");
