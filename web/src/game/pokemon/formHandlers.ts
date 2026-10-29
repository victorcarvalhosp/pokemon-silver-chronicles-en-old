// Port of Data/Scripts/014_Pokemon/001_Pokemon-related/001_FormHandlers.rb
// (MultipleForms), with the plugin registrations this game loads, applied in
// plugin load order (v20.1 Hotfixes → Generation 9 Pack → Essentials Deluxe →
// ZUD Mechanics), so later ones replace earlier ones exactly as in Ruby.
//
// Not ported: "alterBitmap" (Spinda's spots; a sprite concern) and drawSpot.
// Essentials Deluxe's onSetForm versions check $game_temp.dx_pokemon? /
// dx_midbattle? (set while a Deluxe battle builds Pokémon); those read
// G.gameTemp.dxPokemon / dxMidbattle when a battle port sets them.

import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { EncounterType } from "../../data/gameData/encounterType";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Move as MoveData } from "../../data/gameData/move";
import { Species } from "../../data/gameData/species";
import type { TerrainTag } from "../../data/gameData/terrainTag";
import { PBDayNight, pbGetTimeNow } from "../dayNight";
import { G } from "../globals";
import { _INTL } from "../../data/gameData/gameData";
import { pbLearnMove, pbMessageHook } from "../items/itemUtilities";
import type { Player } from "../trainer/Player";
import type { Pokemon } from "./Pokemon";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FormProc = (pkmn: Pokemon, ...args: any[]) => any;
type FormHash = Record<string, FormProc>;

/** HandlerHash2 / SpeciesHandlerHash keyed by species symbol. */
const formSpecies = new Map<Id, FormHash>();
const addIfs: [(sym: Id) => boolean, FormHash][] = [];

function lookup(sym: Id): FormHash | null {
  const h = formSpecies.get(sym);
  if (h) return h;
  for (const [cond, handler] of addIfs) if (cond(sym)) return handler;
  return null;
}

export const MultipleForms = {
  copy(sym: Id, ...syms: Id[]): void {
    const handler = lookup(sym);
    if (!handler) return;
    for (const dest of syms) formSpecies.set(dest, handler);
  },

  register(sym: Id, hash: FormHash): void {
    formSpecies.set(sym, hash);
  },

  registerIf(cond: (sym: Id) => boolean, hash: FormHash): void {
    addIfs.push([cond, hash]);
  },

  /** hasFunction?(pkmn or species, func) */
  hasFunction(pkmn: Pokemon | Id, func: string): boolean {
    const spec = typeof pkmn === "string" ? pkmn : pkmn.species;
    const sp = lookup(spec);
    return !!(sp && sp[func]);
  },

  getFunction(pkmn: Pokemon | Id, func: string): FormProc | null {
    const spec = typeof pkmn === "string" ? pkmn : pkmn.species;
    const sp = lookup(spec);
    return sp?.[func] ?? null;
  },

  /** call(func, pkmn, *args): the handler's result, or null (Ruby nil) if there's none. */
  call(func: string, pkmn: Pokemon, ...args: unknown[]): unknown {
    const sp = lookup(pkmn.species);
    if (!sp || !sp[func]) return null;
    return sp[func]!(pkmn, ...args) ?? null;
  },
};

// --- Game state the handlers read ---------------------------------------------
const player = () => G.player as unknown as Player;
/** $game_map.metadata */
const mapMetadata = () => (G.gameMap ? MapMetadata.tryGet(G.gameMap.mapId) : null);
const inDxBattle = () => {
  const t = G.gameTemp as unknown as { dxPokemon?: unknown[]; dxMidbattle?: unknown[] };
  return (!!t.dxPokemon && t.dxPokemon.length > 0) || (!!t.dxMidbattle && t.dxMidbattle.length > 0);
};
const pbMessage = (text: string) => pbMessageHook(text);
const moveExists = (m: Id | null) => m != null && MoveData.exists(m);

/** pbGetSeason (012_Overworld/003_Overworld_Time.rb): 0 Spring .. 3 Winter, by month. */
export function pbGetSeason(): number {
  return pbGetTimeNow().getMonth() % 4;
}

/** pbGetEnvironment (012_Overworld/002_Battle triggering/001_Overworld_BattleStarting.rb). */
export function pbGetEnvironment(): Id {
  let ret: Id = "None";
  const mapEnv = mapMetadata()?.battleEnvironment;
  if (mapEnv) ret = mapEnv;
  const gp = G.gamePlayer as unknown as { terrainTag?(): TerrainTag; pbFacingTerrainTag?(): TerrainTag } | null;
  const encounterType = (G.gameTemp as unknown as { encounterType?: Id | null }).encounterType;
  let tag: TerrainTag | undefined;
  if (encounterType && EncounterType.get(encounterType).type === "fishing") tag = gp?.pbFacingTerrainTag?.();
  else tag = gp?.terrainTag?.();
  const tileEnvironment = tag?.battleEnvironment;
  if (ret === "Forest" && (tileEnvironment === "Grass" || tileEnvironment === "TallGrass")) ret = "ForestGrass";
  else if (tileEnvironment) ret = tileEnvironment;
  return ret;
}

const cloakForm = (env: Id) => {
  switch (env) {
    case "Rock": case "Sand": case "Cave": return 1; // Sandy Cloak
    case "None": return 2; // Trash Cloak
    default: return 0; // Plant Cloak
  }
};

/** Shared form-from-held-item table for Arceus/Silvally. */
function formFromItems(pkmn: Pokemon, typeArray: [number, Id[]][]): number {
  let ret = 0;
  for (const [f, items] of typeArray) {
    for (const item of items) {
      if (!pkmn.hasItem(item)) continue;
      ret = f;
      break;
    }
    if (ret > 0) break;
  }
  return ret;
}

//===============================================================================
// Essentials (001_FormHandlers.rb)
//===============================================================================

MultipleForms.register("UNOWN", {
  getFormOnCreation: () => rand(28),
});

// SPINDA's alterBitmap (pbSpindaSpots) isn't ported; it only changes the sprite.

MultipleForms.register("CASTFORM", {
  getFormOnLeavingBattle: () => 0,
});

MultipleForms.register("GROUDON", {
  getPrimalForm: (pkmn) => (pkmn.hasItem("REDORB") ? 1 : null),
});

MultipleForms.register("KYOGRE", {
  getPrimalForm: (pkmn) => (pkmn.hasItem("BLUEORB") ? 1 : null),
});

MultipleForms.register("BURMY", {
  getFormOnCreation: () => cloakForm(pbGetEnvironment()),
  getFormOnLeavingBattle: (_pkmn, battle: { environment: Id }, usedInBattle: boolean, endBattle: boolean) => {
    if (!endBattle || !usedInBattle) return null;
    return cloakForm(battle.environment);
  },
});

MultipleForms.register("WORMADAM", {
  getFormOnCreation: () => cloakForm(pbGetEnvironment()),
});

MultipleForms.register("CHERRIM", {
  getFormOnLeavingBattle: () => 0,
});

// ROTOM: replaced by Essentials Deluxe's version below.

MultipleForms.register("GIRATINA", {
  getForm: (pkmn) => {
    if (pkmn.hasItem("GRISEOUSORB")) return 1;
    if (G.gameMap && MapMetadata.tryGet(G.gameMap.mapId)?.hasFlag("DistortionWorld")) return 1;
    return 0;
  },
});

MultipleForms.register("SHAYMIN", {
  getForm: (pkmn) => {
    if (pkmn.fainted() || pkmn.status === "FROZEN" || PBDayNight.isNight()) return 0;
    return null;
  },
});

MultipleForms.register("ARCEUS", {
  getForm: (pkmn) => {
    if (!pkmn.hasAbility("MULTITYPE")) return null;
    return formFromItems(pkmn, [
      [1, ["FISTPLATE", "FIGHTINIUMZ"]],
      [2, ["SKYPLATE", "FLYINIUMZ"]],
      [3, ["TOXICPLATE", "POISONIUMZ"]],
      [4, ["EARTHPLATE", "GROUNDIUMZ"]],
      [5, ["STONEPLATE", "ROCKIUMZ"]],
      [6, ["INSECTPLATE", "BUGINIUMZ"]],
      [7, ["SPOOKYPLATE", "GHOSTIUMZ"]],
      [8, ["IRONPLATE", "STEELIUMZ"]],
      [10, ["FLAMEPLATE", "FIRIUMZ"]],
      [11, ["SPLASHPLATE", "WATERIUMZ"]],
      [12, ["MEADOWPLATE", "GRASSIUMZ"]],
      [13, ["ZAPPLATE", "ELECTRIUMZ"]],
      [14, ["MINDPLATE", "PSYCHIUMZ"]],
      [15, ["ICICLEPLATE", "ICIUMZ"]],
      [16, ["DRACOPLATE", "DRAGONIUMZ"]],
      [17, ["DREADPLATE", "DARKINIUMZ"]],
      [18, ["PIXIEPLATE", "FAIRIUMZ"]],
    ]);
  },
});

MultipleForms.register("DARMANITAN", {
  getFormOnLeavingBattle: (pkmn) => 2 * Math.floor(pkmn.form / 2),
});

MultipleForms.register("DEERLING", {
  getForm: () => pbGetSeason(),
});

MultipleForms.copy("DEERLING", "SAWSBUCK");

MultipleForms.register("KYUREM", {
  getFormOnEnteringBattle: (pkmn) => (pkmn.form === 1 || pkmn.form === 2 ? pkmn.form + 2 : null),
  getFormOnLeavingBattle: (pkmn) => (pkmn.form >= 3 ? pkmn.form - 2 : null), // Fused forms stop glowing
  onSetForm: (pkmn, form: number) => {
    switch (form) {
      case 0: // Normal
        // Ruby compacts inside the loop while iterating with indices; done the same way here.
        for (let i = 0; i < pkmn.moves.length; i++) {
          const move = pkmn.moves[i];
          if (move) {
            switch (move.id) {
              case "ICEBURN": case "FREEZESHOCK":
                if (moveExists("GLACIATE")) {
                  if (pkmn.hasMove("GLACIATE")) (pkmn.moves as unknown as (unknown | null)[])[i] = null;
                  else move.id = "GLACIATE";
                }
                break;
              case "FUSIONFLARE": case "FUSIONBOLT":
                if (moveExists("SCARYFACE")) {
                  if (pkmn.hasMove("SCARYFACE")) (pkmn.moves as unknown as (unknown | null)[])[i] = null;
                  else move.id = "SCARYFACE";
                }
                break;
            }
          }
          pkmn.moves = pkmn.moves.filter((m) => m != null);
        }
        break;
      case 1: // White
        for (const move of pkmn.moves) {
          if (move.id === "GLACIATE") {
            if (!moveExists("ICEBURN") || pkmn.hasMove("ICEBURN")) continue;
            move.id = "ICEBURN";
          } else if (move.id === "SCARYFACE") {
            if (!moveExists("FUSIONFLARE") || pkmn.hasMove("FUSIONFLARE")) continue;
            move.id = "FUSIONFLARE";
          }
        }
        break;
      case 2: // Black
        for (const move of pkmn.moves) {
          if (move.id === "GLACIATE") {
            if (!moveExists("FREEZESHOCK") || pkmn.hasMove("FREEZESHOCK")) continue;
            move.id = "FREEZESHOCK";
          } else if (move.id === "SCARYFACE") {
            if (!moveExists("FUSIONBOLT") || pkmn.hasMove("FUSIONBOLT")) continue;
            move.id = "FUSIONBOLT";
          }
        }
        break;
    }
  },
});

MultipleForms.register("KELDEO", {
  getForm: (pkmn) => (pkmn.hasMove("SECRETSWORD") ? 1 : 0), // Resolute Form / Ordinary Form
});

MultipleForms.register("MELOETTA", {
  getFormOnLeavingBattle: () => 0,
});

MultipleForms.register("GENESECT", {
  getForm: (pkmn) => {
    if (pkmn.hasItem("SHOCKDRIVE")) return 1;
    if (pkmn.hasItem("BURNDRIVE")) return 2;
    if (pkmn.hasItem("CHILLDRIVE")) return 3;
    if (pkmn.hasItem("DOUSEDRIVE")) return 4;
    return 0;
  },
});

MultipleForms.register("GRENINJA", {
  getFormOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) =>
    (pkmn.form === 2 && (pkmn.fainted() || endBattle) ? 1 : null),
});

MultipleForms.register("SCATTERBUG", {
  getFormOnCreation: () => player().secretID() % 18,
});

MultipleForms.copy("SCATTERBUG", "SPEWPA", "VIVILLON");

MultipleForms.register("FURFROU", {
  getForm: (pkmn) => {
    if (!pkmn.timeFormSet || Math.floor(pbGetTimeNow().getTime() / 1000) > pkmn.timeFormSet + (60 * 60 * 24 * 5)) return 0; // 5 days
    return null;
  },
  onSetForm: (pkmn, form: number) => {
    pkmn.timeFormSet = form > 0 ? Math.floor(pbGetTimeNow().getTime() / 1000) : null;
  },
});

MultipleForms.register("ESPURR", {
  getForm: (pkmn) => pkmn.gender,
});

MultipleForms.copy("ESPURR", "MEOWSTIC");

MultipleForms.register("AEGISLASH", {
  getFormOnLeavingBattle: () => 0,
});

MultipleForms.register("PUMPKABOO", {
  getFormOnCreation: () => {
    const r = rand(100);
    if (r < 5) return 3; // Super Size (5%)
    if (r < 20) return 2; // Large (15%)
    if (r < 65) return 1; // Average (45%)
    return 0; // Small (35%)
  },
});

MultipleForms.copy("PUMPKABOO", "GOURGEIST");

MultipleForms.register("XERNEAS", {
  getFormOnStartingBattle: () => 1,
  getFormOnLeavingBattle: (_pkmn, _battle, _usedInBattle, endBattle: boolean) => (endBattle ? 0 : null),
});

MultipleForms.register("ZYGARDE", {
  getFormOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) =>
    (pkmn.form >= 2 && (pkmn.fainted() || endBattle) ? pkmn.form - 2 : null),
});

MultipleForms.register("HOOPA", {
  getForm: (pkmn) => {
    if (!pkmn.timeFormSet || Math.floor(pbGetTimeNow().getTime() / 1000) > pkmn.timeFormSet + (60 * 60 * 24 * 3)) return 0; // 3 days
    return null;
  },
  onSetForm: (pkmn, form: number) => {
    pkmn.timeFormSet = form > 0 ? Math.floor(pbGetTimeNow().getTime() / 1000) : null;
  },
});

MultipleForms.register("ROCKRUFF", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null; // Own Tempo Rockruff cannot become another form
    if (PBDayNight.isNight()) return 1;
    return 0;
  },
});

MultipleForms.register("LYCANROC", {
  getFormOnCreation: () => {
    if (PBDayNight.isEvening()) return 2; // Dusk
    if (PBDayNight.isNight()) return 1; // Midnight
    return 0; // Midday
  },
});

MultipleForms.register("WISHIWASHI", {
  getFormOnLeavingBattle: () => 0,
});

MultipleForms.register("SILVALLY", {
  getForm: (pkmn) => {
    if (!pkmn.hasAbility("RKSSYSTEM")) return null;
    return formFromItems(pkmn, [
      [1, ["FIGHTINGMEMORY"]], [2, ["FLYINGMEMORY"]], [3, ["POISONMEMORY"]], [4, ["GROUNDMEMORY"]],
      [5, ["ROCKMEMORY"]], [6, ["BUGMEMORY"]], [7, ["GHOSTMEMORY"]], [8, ["STEELMEMORY"]],
      [10, ["FIREMEMORY"]], [11, ["WATERMEMORY"]], [12, ["GRASSMEMORY"]], [13, ["ELECTRICMEMORY"]],
      [14, ["PSYCHICMEMORY"]], [15, ["ICEMEMORY"]], [16, ["DRAGONMEMORY"]], [17, ["DARKMEMORY"]],
      [18, ["FAIRYMEMORY"]],
    ]);
  },
});

MultipleForms.register("MINIOR", {
  getFormOnCreation: () => 7 + rand(7), // Meteor forms are 0-6, Core forms are 7-13
  getFormOnEnteringBattle: (pkmn, wild: boolean) => (pkmn.form >= 7 && wild ? pkmn.form - 7 : null), // Wild Minior always appear in Meteor form
  getFormOnLeavingBattle: (pkmn) => (pkmn.form < 7 ? pkmn.form + 7 : null),
});

MultipleForms.register("MIMIKYU", {
  getFormOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) => (pkmn.fainted() || endBattle ? 0 : null),
});

// NECROZMA: replaced by Essentials Deluxe's version below.

MultipleForms.register("CRAMORANT", {
  getFormOnLeavingBattle: () => 0,
});

MultipleForms.register("TOXEL", {
  getFormOnCreation: (pkmn) => {
    if (["LONELY", "BOLD", "RELAXED", "TIMID", "SERIOUS", "MODEST", "MILD",
      "QUIET", "BASHFUL", "CALM", "GENTLE", "CAREFUL"].includes(pkmn.natureId ?? "")) return 1;
    return 0;
  },
});

MultipleForms.copy("TOXEL", "TOXTRICITY");

MultipleForms.register("SINISTEA", {
  getFormOnCreation: () => (rand(100) < 10 ? 1 : 0), // Antique / Phony
});

MultipleForms.copy("SINISTEA", "POLTEAGEIST");

MultipleForms.register("MILCERY", {
  getForm: (pkmn) => {
    const numFlavors = 9;
    const sweets = ["STRAWBERRYSWEET", "BERRYSWEET", "LOVESWEET", "STARSWEET",
      "CLOVERSWEET", "FLOWERSWEET", "RIBBONSWEET"];
    const i = sweets.indexOf(pkmn.itemId ?? "");
    if (i >= 0) return i + ((pkmn.personalID % numFlavors) * sweets.length);
    return 0;
  },
});

MultipleForms.register("ALCREMIE", {
  getFormOnCreation: () => {
    const numFlavors = 9;
    const numSweets = 7;
    return rand(numFlavors * numSweets);
  },
});

MultipleForms.register("EISCUE", {
  getFormOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) => (pkmn.fainted() || endBattle ? 0 : null),
});

MultipleForms.register("INDEEDEE", {
  getForm: (pkmn) => pkmn.gender,
});

MultipleForms.register("MORPEKO", {
  getFormOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) => (pkmn.fainted() || endBattle ? 0 : null),
});

MultipleForms.register("ZACIAN", {
  getFormOnStartingBattle: (pkmn) => (pkmn.hasItem("RUSTEDSWORD") ? 1 : 0),
  changePokemonOnStartingBattle: (pkmn) => {
    if (moveExists("BEHEMOTHBLADE") && pkmn.hasItem("RUSTEDSWORD")) {
      for (const move of pkmn.moves) if (move.id === "IRONHEAD") move.id = "BEHEMOTHBLADE";
    }
  },
  getFormOnLeavingBattle: (_pkmn, _battle, _usedInBattle, endBattle: boolean) => (endBattle ? 0 : null),
  changePokemonOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) => {
    if (endBattle) for (const move of pkmn.moves) if (move.id === "BEHEMOTHBLADE") move.id = "IRONHEAD";
  },
});

MultipleForms.register("ZAMAZENTA", {
  getFormOnStartingBattle: (pkmn) => (pkmn.hasItem("RUSTEDSHIELD") ? 1 : 0),
  changePokemonOnStartingBattle: (pkmn) => {
    if (moveExists("BEHEMOTHBASH") && pkmn.hasItem("RUSTEDSHIELD")) {
      for (const move of pkmn.moves) if (move.id === "IRONHEAD") move.id = "BEHEMOTHBASH";
    }
  },
  getFormOnLeavingBattle: (_pkmn, _battle, _usedInBattle, endBattle: boolean) => (endBattle ? 0 : null),
  changePokemonOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) => {
    if (endBattle) for (const move of pkmn.moves) if (move.id === "BEHEMOTHBASH") move.id = "IRONHEAD";
  },
});

MultipleForms.register("URSHIFU", {
  getFormOnCreation: () => rand(2),
});

// CALYREX: replaced by Essentials Deluxe's version below.

// Regional forms upon creating an egg
MultipleForms.register("RATTATA", {
  getFormOnEggCreation: (pkmn) => {
    if (G.gameMap) {
      const mapPos = mapMetadata()?.townMapPosition;
      if (mapPos && Species.getSpeciesForm(pkmn.species, mapPos[0])!.form === mapPos[0]) return mapPos[0];
    }
    return 0;
  },
});

MultipleForms.copy("RATTATA", "SANDSHREW", "VULPIX", "DIGLETT", "MEOWTH", "GEODUDE",
  "GRIMER", "PONYTA", "FARFETCHD", "CORSOLA", "ZIGZAGOON",
  "DARUMAKA", "YAMASK", "STUNFISK", "SLOWPOKE", "ARTICUNO", "ZAPDOS",
  "MOLTRES");

// Regional forms upon evolving
MultipleForms.register("PIKACHU", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null;
    if (G.gameMap) {
      const mapPos = mapMetadata()?.townMapPosition;
      if (mapPos && mapPos[0] === 2) return 1; // Orange Islands
    }
    return 0;
  },
});

MultipleForms.copy("PIKACHU", "EXEGGCUTE", "CUBONE");

MultipleForms.register("KOFFING", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null;
    if (G.gameMap) {
      const mapPos = mapMetadata()?.townMapPosition;
      if (mapPos && mapPos[0] === 2) return 1; // Orange Islands
    }
    return 0;
  },
});

MultipleForms.copy("KOFFING", "MIMEJR");

//===============================================================================
// v20.1 Hotfixes (Misc bug fixes.rb) — replaced again by the Generation 9 Pack's.
//===============================================================================

MultipleForms.register("GIRATINA", {
  getForm: (pkmn) => {
    if (pkmn.hasItem("GRISEOUSORB")) return 1;
    if (G.gameMap && mapMetadata()?.hasFlag("DistortionWorld")) return 1;
    return 0;
  },
});

//===============================================================================
// Generation 9 Pack Scripts ([000] General/[000] Pokemon.rb)
//===============================================================================

MultipleForms.copy("RATTATA", "SANDSHREW", "VULPIX", "DIGLETT", "MEOWTH", "GEODUDE", "GRIMER", // Alolan
  "PONYTA", "FARFETCHD", "CORSOLA", "ZIGZAGOON", "DARUMAKA", "YAMASK", "STUNFISK", // Galarian
  "SLOWPOKE", "ARTICUNO", "ZAPDOS", "MOLTRES", // Galarian (DLC)
  "PETILIL", "RUFFLET", "GOOMY", "BERGMITE", // Hisuian
  "WOOPER", "TAUROS", // Paldean
);

MultipleForms.register("QUILAVA", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null;
    if (G.gameMap) {
      // 89 and 90 are Burned Tower
      if (G.gameMap.mapId === 89 || G.gameMap.mapId === 90) return 1;
    }
    return 0;
  },
});

MultipleForms.copy("QUILAVA", "CUBONE");

// Makes Exeggcute evolve to Alolan Exeggutor in the Dragon's Den cave.
MultipleForms.register("EXEGGCUTE", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null;
    if (G.gameMap) {
      // 167 is the dragons den cave
      if (G.gameMap.mapId === 167) return 1;
    }
    return 0;
  },
});

// Evolves Koffing to Galarian Form on Rocket Hideout or big cities.
MultipleForms.register("KOFFING", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null;
    if (G.gameMap) {
      // 141, 142 and 143 are Rocket Hideout in Mahogany Town; 56 is Goldenrod City; 384 is Saffron City
      const id = G.gameMap.mapId;
      if (id === 141 || id === 142 || id === 143 || id === 56 || id === 384) return 1;
    }
    return 0;
  },
});

// Evolves Mime Jr. to Galarian Form on Ice Path.
MultipleForms.register("MIMEJR", {
  getForm: (pkmn) => {
    if (pkmn.formSimple >= 2) return null;
    if (G.gameMap) {
      // 20 and 153 are Ice Path
      if (G.gameMap.mapId === 20 || G.gameMap.mapId === 153) return 1;
    }
    return 0;
  },
});

MultipleForms.register("DUNSPARCE", {
  getFormOnCreation: (pkmn) => (pkmn.personalID % 100 === 0 ? 1 : 0),
});

MultipleForms.copy("DUNSPARCE", "DUDUNSPARCE");

MultipleForms.register("DIALGA", {
  getForm: (pkmn) => (pkmn.hasItem("ADAMANTCRYSTAL") ? 1 : 0),
});

MultipleForms.register("PALKIA", {
  getForm: (pkmn) => (pkmn.hasItem("LUSTROUSGLOBE") ? 1 : 0),
});

MultipleForms.register("GIRATINA", {
  getForm: (pkmn) => {
    if (pkmn.hasItem("GRISEOUSORB") || pkmn.hasItem("GRISEOUSCORE")) return 1;
    if (G.gameMap && MapMetadata.tryGet(G.gameMap.mapId)?.hasFlag("DistortionWorld")) return 1;
    return 0;
  },
});

MultipleForms.register("BASCULEGION", {
  getForm: (pkmn) => pkmn.gender,
  getFormOnCreation: (pkmn) => pkmn.gender,
});

MultipleForms.register("LECHONK", {
  getForm: (pkmn) => pkmn.gender,
});

MultipleForms.copy("LECHONK", "OINKOLOGNE");

MultipleForms.register("TANDEMAUS", {
  getFormOnCreation: (pkmn) => (pkmn.personalID % 100 === 0 ? 1 : 0),
});

MultipleForms.copy("TANDEMAUS", "MAUSHOLD");

MultipleForms.register("SQUAWKABILLY", {
  getFormOnCreation: () => rand(4),
});

MultipleForms.register("PALAFIN", {
  getFormOnLeavingBattle: (_pkmn, _battle, _usedInBattle, endBattle: boolean) => (endBattle ? 0 : null),
});

//===============================================================================
// Essentials Deluxe ([000] Essentials Patches/Pokemon.rb)
//===============================================================================

MultipleForms.register("ROTOM", {
  onSetForm: async (pkmn, form: number) => {
    const formMoves = [
      "OVERHEAT", // Heat (microwave oven)
      "HYDROPUMP", // Wash (washing machine)
      "BLIZZARD", // Frost (refrigerator)
      "AIRSLASH", // Fan (electric fan)
      "LEAFSTORM", // Mow (lawn mower)
    ];
    let oldMoveIndex = pkmn.moves.findIndex((move) => formMoves.includes(move.id));
    let newMoveId: Id | null = form > 0 ? formMoves[form - 1]! : null;
    if (!moveExists(newMoveId)) newMoveId = null;
    if (inDxBattle()) {
      if (form === 0 && oldMoveIndex === -1) return;
      if (!newMoveId) newMoveId = "SHADOWBALL";
      if (oldMoveIndex < 0) oldMoveIndex = pkmn.moves.length - 1;
      pkmn.moves[oldMoveIndex]!.id = newMoveId;
      return;
    }
    if (newMoveId === null && oldMoveIndex >= 0 && pkmn.numMoves() === 1) {
      newMoveId = "THUNDERSHOCK";
      if (!moveExists(newMoveId)) newMoveId = null;
      if (newMoveId === null) throw new Error("Rotom is trying to forget its last move, but there isn't another move to replace it with.");
    }
    if (newMoveId && pkmn.hasMove(newMoveId)) newMoveId = null;
    if (oldMoveIndex >= 0) {
      const oldMoveName = pkmn.moves[oldMoveIndex]!.name;
      if (newMoveId === null) {
        pkmn.forgetMoveAtIndex(oldMoveIndex);
        await pbMessage(_INTL("{1} forgot {2}...", pkmn.name, oldMoveName));
      } else {
        pkmn.moves[oldMoveIndex]!.id = newMoveId;
        const newMoveName = pkmn.moves[oldMoveIndex]!.name;
        await pbMessage(_INTL("{1} forgot {2}...\x01", pkmn.name, oldMoveName));
        await pbMessage(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]\x01", pkmn.name, newMoveName));
      }
    } else if (newMoveId !== null) {
      await pbLearnMove(pkmn, newMoveId, true);
    }
  },
});

MultipleForms.register("NECROZMA", {
  getFormOnLeavingBattle: (pkmn, _battle, _usedInBattle, endBattle: boolean) =>
    (pkmn.form >= 3 && (pkmn.fainted() || endBattle) ? pkmn.form - 2 : null),
  onSetForm: async (pkmn, form: number, oldForm: number) => {
    if (form > 2 || oldForm > 2) return; // Ultra form changes don't affect moveset
    const formMoves = [
      "SUNSTEELSTRIKE", // Dusk Mane (with Solgaleo) (form 1)
      "MOONGEISTBEAM", // Dawn Wings (with Lunala) (form 2)
    ];
    const inBattle = inDxBattle();
    if (form === 0) {
      for (const move of formMoves) {
        if (!pkmn.hasMove(move)) continue;
        pkmn.forgetMove(move);
        if (inBattle) pkmn.learnMove("PSYCHIC");
        if (!inBattle) await pbMessage(_INTL("{1} forgot {2}...", pkmn.name, MoveData.get(move).name));
      }
      if (pkmn.numMoves() === 0 && !inBattle) await pbLearnMove(pkmn, "CONFUSION");
    } else {
      const newMoveId = formMoves[form - 1]!;
      if (inBattle) {
        let oldMoveIndex = pkmn.moves.findIndex((move) => formMoves.includes(move.id));
        if (oldMoveIndex < 0) oldMoveIndex = pkmn.moves.length - 1;
        pkmn.moves[oldMoveIndex]!.id = newMoveId;
      } else {
        await pbLearnMove(pkmn, newMoveId, true);
      }
    }
  },
});

MultipleForms.register("CALYREX", {
  onSetForm: async (pkmn, form: number) => {
    const formMoves = [
      "GLACIALLANCE", // Ice Rider (with Glastrier) (form 1)
      "ASTRALBARRAGE", // Shadow Rider (with Spectrier) (form 2)
    ];
    const inBattle = inDxBattle();
    if (form === 0) {
      for (const move of formMoves) {
        if (!pkmn.hasMove(move)) continue;
        pkmn.forgetMove(move);
        if (inBattle) pkmn.learnMove("PSYCHIC");
        if (!inBattle) await pbMessage(_INTL("{1} forgot {2}...", pkmn.name, MoveData.get(move).name));
      }
      const spData = pkmn.speciesData();
      const kept = [];
      for (const move of pkmn.moves) {
        if (spData.moves.some((learnMove) => learnMove.move === move.id) ||
            spData.tutorMoves.includes(move.id) || spData.eggMoves.includes(move.id)) {
          kept.push(move);
          continue;
        }
        if (!inBattle) await pbMessage(_INTL("{1} forgot {2}...", pkmn.name, move.name));
      }
      pkmn.moves = kept;
      if (pkmn.numMoves() === 0) {
        if (inBattle) pkmn.learnMove("PSYCHIC");
        else await pbLearnMove(pkmn, "CONFUSION");
      }
    } else {
      const newMoveId = formMoves[form - 1]!;
      if (inBattle) {
        let oldMoveIndex = pkmn.moves.findIndex((move) => formMoves.includes(move.id));
        if (oldMoveIndex < 0) oldMoveIndex = pkmn.moves.length - 1;
        pkmn.moves[oldMoveIndex]!.id = newMoveId;
      } else {
        await pbLearnMove(pkmn, newMoveId, true);
      }
    }
  },
});

//===============================================================================
// ZUD Mechanics ([001] Data/Data_Pokemon.rb)
//===============================================================================

MultipleForms.register("ETERNATUS", {
  baseStats: (pkmn) => {
    if (!pkmn.gmax) return null;
    return {
      HP: 255,
      ATTACK: 115,
      DEFENSE: 250,
      SPEED: 130,
      SPECIAL_ATTACK: 125,
      SPECIAL_DEFENSE: 250,
    };
  },
});
