// Port of Plugins/Pokemon Amie/Pokemon Amie.rb (BhagyaJyoti, PizzaSun,
// rigbycwts, Gardenette; v1.7), the parts that aren't the scene: the food
// list, Pokemon#feedAmie/#changeAmieStats/#resetAffection, the :hungerCounter
// step handler, pbFirstNonEggPokemonOrFaintedPokemon, setAmiePokemon,
// PokeBattle_Battler's getters and the global pbDisplay. The scene
// (PokeAmie_Scene, PokeAmieScreen, pokemonAmieRefresh, Sprite#maskOLD) is in
// ./PokeAmieScene.ts.
//
// The Amie fields themselves (amie_affection/fullness/enjoyment with their
// clamping setters, MAXAMIEPOINTS, getAmieStatLevel, get*Level) are in
// game/pokemon/Pokemon.ts; the methods below reopen that class, as the plugin
// does (`class Pokemon`).
//
// Not ported, as they change nothing here:
// - Game_Mouse#x/#y (lines 277-285): Easy Mouse System has no Game_Mouse class
//   (its mouse is the Mouse module), so this defines an unused class;
// - pbChooseMove(pokemon, variableNumber, nameVarNumber) (lines 1173-1188):
//   the same as Essentials' own (016_UI/006_UI_Summary.rb:1375), registered in
//   game/scripts/partyBag.ts;
// - the global pbUpdate/pbRefresh/pbHardRefresh no-ops (lines 1191-1195),
//   meant for the item handlers' `scene.pbRefresh`; see amieItemScene below.

import { DEBUG } from "../../core/debug";
import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { EventHandlers } from "../../game/eventHandlers";
import { G } from "../../game/globals";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import type { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";

/** $player.party (empty without a player, e.g. on dev pages: Ruby would raise there). */
const party = (): Pokemon[] => (G.player as unknown as { party: Pokemon[] } | null)?.party ?? [];
const bag = () => G.bag as PokemonBag;

/** pbMessage, loaded when needed (the logic here is also run by node tests). */
async function pbMessage(text: string): Promise<void> {
  const { pbMessage: message } = await import("../../ui/messages");
  await message(text);
}

export const POKEMON_ZOOM: number = 3; // Zoom factor for Pokemon sprites
// All Things Pokemon can eat (Mostly Berries)
export const EATABLE_ITEMS: readonly Id[] = [
  "LAVACOOKIE", "OLDGATEAU", "CASTELIACONE", "RAGECANDYBAR", "SWEETHEART", "RARECANDY",
  "CHERIBERRY", "CHESTOBERRY", "PECHABERRY", "RAWSTBERRY", "ASPEARBERRY", "LEPPABERRY",
  "ORANBERRY", "PERSIMBERRY", "LUMBERRY", "SITRUSBERRY", "FIGYBERRY", "WIKIBERRY",
  "MAGOBERRY", "AGUAVBERRY", "IAPAPABERRY", "RAZZBERRY", "BLUKBERRY", "NANABBERRY",
  "WEPEARBERRY", "PINAPBERRY", "POMEGBERRY", "KELPSYBERRY", "QUALOTBERRY", "HONDEWBERRY",
  "GREPABERRY", "TAMATOBERRY", "CORNNBERRY", "MAGOSTBERRY", "RABUTABERRY", "NOMELBERRY",
  "SPELONBERRY", "PAMTREBERRY", "WATMELBERRY", "DURINBERRY", "BELUEBERRY", "OCCABERRY",
  "PASSHOBERRY", "WACANBERRY", "RINDOBERRY", "YACHEBERRY", "CHOPLEBERRY", "KEBIABERRY",
  "SHUCABERRY", "COBABERRY", "PAYAPABERRY", "TANGABERRY", "CHARTIBERRY", "KASIBBERRY",
  "HABANBERRY", "COLBURBERRY", "BABIRIBERRY", "CHILANBERRY", "LIECHIBERRY", "GANLONBERRY",
  "SALACBERRY", "PETAYABERRY", "APICOTBERRY", "LANSATBERRY", "STARFBERRY", "ENIGMABERRY",
  "MICLEBERRY", "CUSTAPBERRY", "JABOCABERRY", "ROWAPBERRY",
];

//===============================================================================
// The scene the item handlers get
//===============================================================================
/** Ruby's NoMethodError text for a method the scene doesn't have. */
function noMethod(name: string, isPrivate: boolean): () => never {
  return () => {
    throw new Error(`NoMethodError: ${isPrivate ? "private" : "undefined"} method \`${name}' called for #<PokeAmie_Scene>`);
  };
}

/**
 * The scene feedAmie hands to ItemHandlers.triggerUseOnPokemon: the
 * PokeAmie_Scene itself (`feedAmie(@food, @pokemon, self)`).
 *
 * Deliberate fix: the plugin defines pbDisplay/pbRefresh/pbHardRefresh/
 * pbUpdate as top-level methods (Pokemon Amie.rb:1158-1195, "to keep the
 * 002_Item_Effects script to work properly"), but top-level methods are
 * private, so in Ruby the handlers' `scene.pbDisplay(...)` raise NoMethodError
 * and feeding any food with a UseOnPokemon handler (the status-healing and HP
 * berries, Leppa, the EV-lowering berries, the sweets, Rare Candy) stops the
 * game. Here the scene has them, as the plugin meant; pbChooseMove returns -1
 * (no PP restored), the plugin's commented-out choice for PP items
 * (:1165-1170). The tests' Ruby harness gives PokeAmie_Scene the same methods.
 * Any other method a handler could call on the scene doesn't exist at all.
 */
export function amieItemScene(): object {
  return {
    pbDisplay: (text: unknown) => pbDisplay(text),
    pbRefresh: () => {},
    pbHardRefresh: () => {},
    pbUpdate: () => {},
    pbChooseMove: () => -1,
    pbConfirm: noMethod("pbConfirm", false),
    pbShowCommands: noMethod("pbShowCommands", false),
    pbChoosePokemon: noMethod("pbChoosePokemon", false),
    pbRefreshSingle: noMethod("pbRefreshSingle", false),
  };
}

//===============================================================================
// class Pokemon
//===============================================================================
declare module "../../game/pokemon/Pokemon" {
  interface Pokemon {
    /** feedAmie(food, pkmn, scene) */
    feedAmie(food: Id, pkmn: Pokemon, scene: object): Promise<void>;
    /** changeAmieStats(method); resolves after the "Unknown stat-changing method." message, if any. */
    changeAmieStats(method: string): Promise<void> | undefined;
    /** resetAffection */
    resetAffection(): void;
  }
}

const MAXAMIEPOINTS = Pokemon.MAXAMIEPOINTS;

/** `@x = [0, [x, MAXAMIEPOINTS].min].max` for the three stats (the setters clamp the same way). */
function addAmieStats(pkmn: Pokemon, affGain: number, fullGain: number, enjoyGain: number): void {
  pkmn.amieAffection = Math.max(0, Math.min(pkmn.amieAffection + affGain, MAXAMIEPOINTS));
  pkmn.amieFullness = Math.max(0, Math.min(pkmn.amieFullness + fullGain, MAXAMIEPOINTS));
  pkmn.amieEnjoyment = Math.max(0, Math.min(pkmn.amieEnjoyment + enjoyGain, MAXAMIEPOINTS));
}

Pokemon.prototype.feedAmie = async function (this: Pokemon, food: Id, pkmn: Pokemon, scene: object): Promise<void> {
  if (this.amieFullness >= MAXAMIEPOINTS) return;
  if (this.getFullnessLevel() === 5) return;
  if (!EATABLE_ITEMS.includes(food)) return;
  // pbCanUseOnPokemon?(food) (013_Items/001_Item_Utilities.rb)
  if (ItemHandlers.hasUseOnPokemon(food) || Item.get(food).isMachine()) {
    await ItemHandlers.triggerUseOnPokemon(food, 1, pkmn, scene);
  }
  let affGain: number;
  let fullGain: number;
  let enjoyGain: number;
  if (Item.get(food).isBerry()) {
    // NOTE (Ruby parity): Pokemon Amie.rb:198-207 loads Data/berry_plants.dat
    // into @berryPlantData (an instance variable of the Pokémon, so it ends up
    // in the save file) and looks the berry up by its GameData::Item. The
    // hash is keyed by item symbols, so nothing is ever found and every berry
    // uses [3, 15, 2, 5] (had it been found, ber[0] on a GameData::BerryPlant
    // would raise). The port uses the fallback directly and stores nothing.
    const ber = [3, 15, 2, 5];
    affGain = ber[0]! + rand(4);
    fullGain = 90;
    enjoyGain = 0;
  } else {
    affGain = 3 + rand(4); // rand(3..6)
    fullGain = 90;
    enjoyGain = 0;
  }
  bag().remove(Item.get(food).id);
  addAmieStats(this, affGain, fullGain, enjoyGain);
};

// Changes the happiness of this Pokémon depending on what happened to change it.
Pokemon.prototype.changeAmieStats = function (this: Pokemon, method: string): Promise<void> | undefined {
  let affGain = 0;
  let fullGain = 0;
  let enjoyGain = 0;
  let message: Promise<void> | undefined;
  switch (method) {
    case "walking": // Walk approx. 50 steps
      fullGain = -1;
      enjoyGain = -1;
      break;
    case "sendInBattle": // Send Pokemon in to a battle
      fullGain = -25;
      enjoyGain = -25;
      break;
    case "feedPlainBean": // Feed Pokémon a whole Plain Bean
      affGain = 3;
      fullGain = 100 + rand(2); // rand(100..101)
      break;
    case "feedPatternBean": // Feed Pokémon a whole Pattern Bean
      affGain = 5;
      fullGain = 100 + rand(2);
      break;
    case "feedRainbowBean": // Feed Pokémon a whole Rainbow Bean
      affGain = 125;
      fullGain = 100 + rand(2);
      break;
    case "feedMalasada": // Feed Pokemon a malasada (SunMoon) or a Shirogi bread (ColMerc)
      fullGain = 255;
      affGain = 5;
      break;
    case "feedMalasadaDisliked":
      fullGain = 255;
      affGain = 3;
      break;
    case "feedMalasadaLiked":
      fullGain = 255;
      affGain = 10;
      break;
    case "pet": // Pet Pokemon. No spots implemented due to engine limitations.
      affGain = 2 + rand(4); // rand(2..5)
      enjoyGain = 20 + rand(20); // rand(20..39)
      break;
    default:
      // Ruby shows the message before changing nothing; the stats below don't
      // depend on it, so the change is made now and the message awaited by the caller.
      message = pbMessage(_INTL("Unknown stat-changing method."));
  }
  addAmieStats(this, affGain, fullGain, enjoyGain);
  return message;
};

// Sets the Pokemon's Affection to 0.
// Usually used when traded.
Pokemon.prototype.resetAffection = function (this: Pokemon): void {
  this.amieAffection = 0;
};

//===============================================================================
// Party helpers
//===============================================================================
/** pbFirstNonEggPokemonOrFaintedPokemon: the first party member that is neither an egg nor fainted. */
export function pbFirstNonEggPokemonOrFaintedPokemon(): Pokemon | null {
  for (const p of party()) {
    if (p && !p.egg() && !p.fainted()) return p;
  }
  return null;
}

/** setAmiePokemon(pkmn): the party member at index `pkmn` (or the first able one). */
export function setAmiePokemon(pkmn: number | null | undefined): Pokemon | null {
  if (pkmn == null) {
    // if pkmn is not specified, get the first non-egg mon in the party
    return pbFirstNonEggPokemonOrFaintedPokemon();
  }
  // if pkmn is specified, make sure it's not an egg
  // if it's an egg, just get the first non-egg instead
  const p = party()[pkmn];
  if (!p) throw new Error("NoMethodError: undefined method `egg?' for nil:NilClass");
  if (!p.egg()) return p;
  return pbFirstNonEggPokemonOrFaintedPokemon();
}

//===============================================================================
// Lowers Fullness and Enjoyment by 1 every 50 steps
//===============================================================================
let HUNGERCOUNTER = 0;
/** HUNGERCOUNTER (a constant reassigned by the handler in Ruby; not saved). */
export const hungerCounter = {
  get value(): number { return HUNGERCOUNTER; },
  set value(v: number) { HUNGERCOUNTER = v; },
};

// NOTE (Ruby parity): :on_step_taken fires when any event finishes a step,
// not only the player (Pokemon Amie.rb:333), so NPCs walking around count too.
// Eggs in the party are changed as well.
EventHandlers.add("on_step_taken", "hungerCounter", () => {
  HUNGERCOUNTER += 1;
  if (HUNGERCOUNTER >= 50) {
    for (const pkmn of party()) {
      void pkmn.changeAmieStats("walking"); // a known method: nothing to wait for
    }
    HUNGERCOUNTER = 0;
  }
});

//===============================================================================
// class PokeBattle_Battler
//===============================================================================
/**
 * NOTE (Ruby parity): Pokemon Amie.rb:344-365 reopens PokeBattle_Battler,
 * Essentials v19's battler class. v20.1's is Battle::Battler, so this makes a
 * new class nothing uses: Amie stats have no effect in battle. Ported as that
 * unused class, for completeness.
 */
export class PokeBattle_Battler {
  constructor(public pokemon: Pokemon | null = null) {}

  // Getters - return each stat values in points
  get amieAffection(): number { return this.pokemon ? this.pokemon.amieAffection : 0; }
  get amieFullness(): number { return this.pokemon ? this.pokemon.amieFullness : 0; }
  get amieEnjoyment(): number { return this.pokemon ? this.pokemon.amieEnjoyment : 0; }
  getAffectionLevel(): number | null {
    return this.pokemon ? this.pokemon.getAmieStatLevel(this.pokemon.amieAffection) : 0;
  }
}

//===============================================================================
// pbDisplay
//===============================================================================
/** The global pbDisplay(text) the plugin defines (a message, except "It won't have any effect."). */
export async function pbDisplay(text: unknown): Promise<void> {
  const intlText = _INTL("{1}", text);
  if (DEBUG) console.info(intlText); // Console.echo_li
  // Opted for not showing "It won't have any effect." message, as it's annoying.
  if (intlText === _INTL("It won't have any effect.")) return;
  await pbMessage(intlText);
}
