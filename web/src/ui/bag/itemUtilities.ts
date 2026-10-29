// The UI parts of 013_Items/001_Item_Utilities.rb: using an item from the Bag
// or on a Pokémon, giving/taking held items, choosing an item, and
// pbForgetMove (the Summary's move-forget screen); plus pbMoveTutorChoose /
// pbMoveTutorAnnotations (019_Utilities/001_Utilities.rb) and the TM/HM/TR
// UseFromBag handler (002_Item_Effects.rb) that uses it. No plugin replaces
// any of these.
//
// The item effects themselves (ItemHandlers::UseOnPokemon etc.) aren't
// ported: ItemHandlers starts empty, so items with no handler behave as Ruby
// does for an item without one (no "Use" command; "Can't use that here.").

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { G } from "../../game/globals";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { pbLearnMove, startsWithVowel } from "../../game/items/itemUtilities";
import type { PokemonBag } from "../../game/items/PokemonBag";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { pbFadeOutIn } from "../fades";
import { _INTL } from "../messageConfig";
import { pbConfirmMessage, pbMessage } from "../messages";
import { PokemonBag_Scene, PokemonBagScreen } from "./bag";
import { pbMoveToMailbox, pbWriteMail } from "../party/mail";
import { PokemonParty_Scene, PokemonPartyScreen } from "../party/party";

const player = () => G.player as unknown as Player;
const bag = () => G.bag;

/** The scene a give/take/use flow talks to (party screen, Summary, storage...). */
export interface ItemUIScene {
  pbDisplay(text: string): Promise<void>;
  pbConfirm(text: string): Promise<boolean>;
  pbUpdate?(): void;
}

/** pbCanUseOnPokemon?(item) */
export function pbCanUseOnPokemon(item: Id | Item): boolean {
  const id = Item.get(item).id;
  return ItemHandlers.hasUseOnPokemon(id) || Item.get(item).isMachine();
}

/** pbItemRestoreHP(pkmn, restoreHP) */
export function pbItemRestoreHP(pkmn: Pokemon, restoreHP: number): number {
  let newHP = pkmn.hp + restoreHP;
  if (newHP > pkmn.totalhp) newHP = pkmn.totalhp;
  const hpGain = newHP - pkmn.hp;
  pkmn.hp = newHP;
  return hpGain;
}

//===============================================================================
// Teach and forget a move
//===============================================================================
/** pbForgetMove(pkmn, moveToLearn): the move-forget Summary screen; -1 if cancelled. */
export async function pbForgetMove(pkmn: Pokemon, moveToLearn: Id | null): Promise<number> {
  const { PokemonSummary_Scene, PokemonSummaryScreen } = await import("../summary/summary");
  let ret = -1;
  await pbFadeOutIn(async () => {
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene);
    ret = await screen.pbStartForgetScreen([pkmn], 0, moveToLearn);
  });
  return ret;
}

/** pbMoveTutorAnnotations(move, movelist) */
export function pbMoveTutorAnnotations(move: Id, movelist: Id[] | null = null): string[] {
  const ret: string[] = [];
  player().party.forEach((pkmn, i) => {
    if (pkmn.egg()) {
      ret[i] = _INTL("NOT ABLE");
    } else if (pkmn.hasMove(move)) {
      ret[i] = _INTL("LEARNED");
    } else {
      const species = pkmn.species;
      if (movelist?.some((j) => j === species)) {
        // Checked data from movelist given in parameter
        ret[i] = _INTL("ABLE");
      } else if (pkmn.compatibleWithMove(move)) {
        // Checked data from Pokémon's tutor moves in pokemon.txt
        ret[i] = _INTL("ABLE");
      } else {
        ret[i] = _INTL("NOT ABLE");
      }
    }
  });
  return ret;
}

/** pbMoveTutorChoose(move, movelist, bymachine, oneusemachine): whether a Pokémon learned it. */
export async function pbMoveTutorChoose(move: Id, movelist: Id[] | null = null, bymachine = false, oneusemachine = false): Promise<boolean> {
  let ret = false;
  move = MoveData.get(move).id;
  if (Array.isArray(movelist)) movelist = movelist.map((m) => MoveData.get(m).id);
  await pbFadeOutIn(async () => {
    const movename = MoveData.get(move).name;
    const annot = pbMoveTutorAnnotations(move, movelist);
    const scene = new PokemonParty_Scene();
    const screen = new PokemonPartyScreen(scene, player().party);
    await screen.pbStartScene(_INTL("Teach which Pokémon?"), false, annot);
    for (;;) {
      const chosen = await screen.pbChoosePokemon();
      if (chosen < 0) break;
      const pokemon = player().party[chosen]!;
      const upd = () => screen.pbUpdate();
      if (pokemon.egg()) {
        await pbMessage(_INTL("Eggs can't be taught any moves."), null, 0, null, 0, upd);
      } else if (pokemon.shadowPokemon()) {
        await pbMessage(_INTL("Shadow Pokémon can't be taught any moves."), null, 0, null, 0, upd);
      } else if (movelist && !movelist.some((j) => j === pokemon.species)) {
        await pbMessage(_INTL("{1} can't learn {2}.", pokemon.name, movename), null, 0, null, 0, upd);
      } else if (!pokemon.compatibleWithMove(move)) {
        await pbMessage(_INTL("{1} can't learn {2}.", pokemon.name, movename), null, 0, null, 0, upd);
      } else if (await pbLearnMove(pokemon, move, false, bymachine)) {
        if (bymachine) G.stats.movesTaughtByItem += 1;
        if (!bymachine) G.stats.movesTaughtByTutor += 1;
        if (oneusemachine) pokemon.addFirstMove(move);
        ret = true;
        break;
      }
    }
    await screen.pbEndScene();
  });
  return ret; // Returns whether the move was learned by a Pokemon
}

// ItemHandlers::UseFromBag for TMs, HMs and TRs (002_Item_Effects.rb)
ItemHandlers.UseFromBag.addIf((item) => !!Item.tryGet(item)?.isMachine(), async (item) => {
  if (player().pokemonCount() === 0) {
    await pbMessage(_INTL("There is no Pokémon."));
    return 0;
  }
  const itemData = Item.get(item);
  const move = itemData.move;
  if (!move) return 0;
  await pbMessage(_INTL("\\se[PC access]You booted up {1}.\x01", itemData.name));
  if (!(await pbConfirmMessage(_INTL("Do you want to teach {1} to a Pokémon?", MoveData.get(move).name)))) return 0;
  if (await pbMoveTutorChoose(move, null, true, itemData.isTR())) return 1;
  return 0;
});

//===============================================================================
// Use an item from the Bag and/or on a Pokémon
//===============================================================================
/** pbUseItem(bag, item, bagscene): 0 = item wasn't used; 1 = item used; 2 = close Bag to use in field */
export async function pbUseItem(bagObj: PokemonBag, item: Id, bagscene: { pbRefresh(): void } | null = null): Promise<number> {
  const itm = Item.get(item);
  const useType = itm.fieldUse;
  if (useType === 1) { // Item is usable on a Pokémon
    if (player().pokemonCount() === 0) {
      await pbMessage(_INTL("There is no Pokémon."));
      return 0;
    }
    let ret = false;
    let annot: string[] | null = null;
    if (itm.isEvolutionStone()) {
      annot = [];
      for (const pkmn of player().party) {
        const elig = pkmn.checkEvolutionOnUseItem(item);
        annot.push(elig ? _INTL("ABLE") : _INTL("NOT ABLE"));
      }
    }
    await pbFadeOutIn(async () => {
      const scene = new PokemonParty_Scene();
      const screen = new PokemonPartyScreen(scene, player().party);
      await screen.pbStartScene(_INTL("Use on which Pokémon?"), false, annot);
      for (;;) {
        scene.pbSetHelpText(_INTL("Use on which Pokémon?"));
        const chosen = await screen.pbChoosePokemon();
        if (chosen < 0) {
          ret = false;
          break;
        }
        const pkmn = player().party[chosen]!;
        if (!pbCheckUseOnPokemon(item, pkmn, screen)) continue;
        let qty = 1;
        let maxAtOnce = ItemHandlers.triggerUseOnPokemonMaximum(item, pkmn);
        maxAtOnce = Math.min(maxAtOnce, bag().quantity(item));
        if (maxAtOnce > 1) {
          qty = await screen.scene.pbChooseNumber(_INTL("How many {1} do you want to use?", Item.get(item).name), maxAtOnce);
          screen.scene.pbSetHelpText("");
        }
        if (qty <= 0) continue;
        ret = await ItemHandlers.triggerUseOnPokemon(item, qty, pkmn, screen);
        if (!(ret && itm.consumedAfterUse())) continue;
        bagObj.remove(item, qty);
        if (bagObj.has(item)) continue;
        await pbMessage(_INTL("You used your last {1}.", itm.name), null, 0, null, 0, () => screen.pbUpdate());
        break;
      }
      await screen.pbEndScene();
      bagscene?.pbRefresh();
    });
    return ret ? 1 : 0;
  } else if (useType === 2 || itm.isMachine()) { // Item is usable from Bag or teaches a move
    const intret = await ItemHandlers.triggerUseFromBag(item);
    if (intret >= 0) {
      if (intret === 1 && itm.consumedAfterUse()) bagObj.remove(item);
      return intret;
    }
    await pbMessage(_INTL("Can't use that here."));
    return 0;
  }
  await pbMessage(_INTL("Can't use that here."));
  return 0;
}

/** The party screen as pbUseItemOnPokemon's scene. */
interface UseOnPokemonScene extends ItemUIScene {
  scene?: { pbChooseNumber(helptext: string, maximum: number, initnum?: number): Promise<number>; pbSetHelpText(text: string): void };
  pbClearAnnotations?(): void;
  pbHardRefresh?(): void;
}

/**
 * pbUseItemOnPokemon(item, pkmn, scene): only called when in the party screen
 * and having chosen an item to be used on the selected Pokémon.
 */
export async function pbUseItemOnPokemon(item: Id, pkmn: Pokemon, scene: UseOnPokemonScene): Promise<boolean> {
  const itm = Item.get(item);
  const upd = () => scene.pbUpdate?.();
  // TM or HM
  if (itm.isMachine()) {
    const machine = itm.move;
    if (!machine) return false;
    const movename = MoveData.get(machine).name;
    if (pkmn.shadowPokemon()) {
      await pbMessage(_INTL("Shadow Pokémon can't be taught any moves."), null, 0, null, 0, upd);
    } else if (!pkmn.compatibleWithMove(machine)) {
      await pbMessage(_INTL("{1} can't learn {2}.", pkmn.name, movename), null, 0, null, 0, upd);
    } else {
      await pbMessage(_INTL("\\se[PC access]You booted up {1}.\x01", itm.name), null, 0, null, 0, upd);
      if (await pbConfirmMessage(_INTL("Do you want to teach {1} to {2}?", movename, pkmn.name), upd)) {
        if (await pbLearnMove(pkmn, machine, false, true)) {
          if (itm.consumedAfterUse()) bag().remove(item);
          return true;
        }
      }
    }
    return false;
  }
  // Other item
  let qty = 1;
  let maxAtOnce = ItemHandlers.triggerUseOnPokemonMaximum(item, pkmn);
  maxAtOnce = Math.min(maxAtOnce, bag().quantity(item));
  if (maxAtOnce > 1 && scene.scene) {
    qty = await scene.scene.pbChooseNumber(_INTL("How many {1} do you want to use?", itm.name), maxAtOnce);
    if (scene instanceof PokemonPartyScreen) scene.scene.pbSetHelpText("");
  }
  if (qty <= 0) return false;
  const ret = await ItemHandlers.triggerUseOnPokemon(item, qty, pkmn, scene);
  scene.pbClearAnnotations?.();
  scene.pbHardRefresh?.();
  if (ret && itm.consumedAfterUse()) {
    bag().remove(item, qty);
    if (!bag().has(item)) await pbMessage(_INTL("You used your last {1}.", itm.name), null, 0, null, 0, upd);
  }
  return ret;
}

/** pbUseKeyItemInField(item): true if the item was used. */
export async function pbUseKeyItemInField(item: Id): Promise<boolean> {
  const ret = await ItemHandlers.triggerUseInField(item);
  if (ret === -1) { // Item effect not found
    await pbMessage(_INTL("Can't use that here."));
  } else if (ret > 0 && Item.get(item).consumedAfterUse()) {
    bag().remove(item);
  }
  return ret > 0;
}

/** pbUseItemMessage(item) */
export async function pbUseItemMessage(item: Id): Promise<void> {
  const itemname = Item.get(item).name;
  if (startsWithVowel(itemname)) await pbMessage(_INTL("You used an {1}.", itemname));
  else await pbMessage(_INTL("You used a {1}.", itemname));
}

/** pbCheckUseOnPokemon(item, pkmn, screen) */
export function pbCheckUseOnPokemon(item: Id, pkmn: Pokemon | null | undefined, _screen: unknown): boolean {
  return !!pkmn && !pkmn.egg() && (!pkmn.hyperMode || !!Item.tryGet(item)?.isScent());
}

//===============================================================================
// Give an item to a Pokémon to hold, and take a held item from a Pokémon
//===============================================================================
/** pbGiveItemToPokemon(item, pkmn, scene, pkmnid) */
export async function pbGiveItemToPokemon(item: Id, pkmn: Pokemon, scene: ItemUIScene, pkmnid = 0): Promise<boolean> {
  const newitemname = Item.get(item).name;
  if (pkmn.egg()) {
    await scene.pbDisplay(_INTL("Eggs can't hold items."));
    return false;
  } else if (pkmn.mail) {
    await scene.pbDisplay(_INTL("{1}'s mail must be removed before giving it an item.", pkmn.name));
    if (!(await pbTakeItemFromPokemon(pkmn, scene))) return false;
  }
  if (pkmn.hasItem()) {
    const olditemname = pkmn.item!.name;
    if (pkmn.hasItem("LEFTOVERS")) {
      await scene.pbDisplay(_INTL("{1} is already holding some {2}.\x01", pkmn.name, olditemname));
    } else if (startsWithVowel(newitemname)) {
      await scene.pbDisplay(_INTL("{1} is already holding an {2}.\x01", pkmn.name, olditemname));
    } else {
      await scene.pbDisplay(_INTL("{1} is already holding a {2}.\x01", pkmn.name, olditemname));
    }
    if (await scene.pbConfirm(_INTL("Would you like to switch the two items?"))) {
      bag().remove(item);
      if (!bag().add(pkmn.itemId!)) {
        if (!bag().add(item)) throw new Error(_INTL("Couldn't re-store deleted item in Bag somehow"));
        await scene.pbDisplay(_INTL("The Bag is full. The Pokémon's item could not be removed."));
      } else if (Item.get(item).isMail()) {
        if (await pbWriteMail(item, pkmn, pkmnid, scene)) {
          pkmn.item = item;
          await scene.pbDisplay(_INTL("Took the {1} from {2} and gave it the {3}.", olditemname, pkmn.name, newitemname));
          return true;
        } else if (!bag().add(item)) {
          throw new Error(_INTL("Couldn't re-store deleted item in Bag somehow"));
        }
      } else {
        pkmn.item = item;
        await scene.pbDisplay(_INTL("Took the {1} from {2} and gave it the {3}.", olditemname, pkmn.name, newitemname));
        return true;
      }
    }
  } else if (!Item.get(item).isMail() || (await pbWriteMail(item, pkmn, pkmnid, scene))) {
    bag().remove(item);
    pkmn.item = item;
    await scene.pbDisplay(_INTL("{1} is now holding the {2}.", pkmn.name, newitemname));
    return true;
  }
  return false;
}

/** pbTakeItemFromPokemon(pkmn, scene) */
export async function pbTakeItemFromPokemon(pkmn: Pokemon, scene: ItemUIScene): Promise<boolean> {
  let ret = false;
  if (!pkmn.hasItem()) {
    await scene.pbDisplay(_INTL("{1} isn't holding anything.", pkmn.name));
  } else if (!bag().canAdd(pkmn.itemId!)) {
    await scene.pbDisplay(_INTL("The Bag is full. The Pokémon's item could not be removed."));
  } else if (pkmn.mail) {
    if (await scene.pbConfirm(_INTL("Save the removed mail in your PC?"))) {
      if (pbMoveToMailbox(pkmn)) {
        await scene.pbDisplay(_INTL("The mail was saved in your PC."));
        pkmn.item = null;
        ret = true;
      } else {
        await scene.pbDisplay(_INTL("Your PC's Mailbox is full."));
      }
    } else if (await scene.pbConfirm(_INTL("If the mail is removed, its message will be lost. OK?"))) {
      bag().add(pkmn.itemId!);
      await scene.pbDisplay(_INTL("Received the {1} from {2}.", pkmn.item!.name, pkmn.name));
      pkmn.item = null;
      pkmn.mail = null;
      ret = true;
    }
  } else {
    bag().add(pkmn.itemId!);
    await scene.pbDisplay(_INTL("Received the {1} from {2}.", pkmn.item!.name, pkmn.name));
    pkmn.item = null;
    ret = true;
  }
  return ret;
}

//===============================================================================
// Choose an item from the Bag
//===============================================================================
function setItemVariable(variable: number, value: Id | null): void {
  if (variable > 0) G.gameVariables.set(variable, value || "NONE");
}

async function chooseItemScreen(filter: ((item: Id) => boolean) | null): Promise<Id | null> {
  let ret: Id | null = null;
  await pbFadeOutIn(async () => {
    const scene = new PokemonBag_Scene();
    const screen = new PokemonBagScreen(scene, bag());
    ret = await screen.pbChooseItemScreen(filter);
  });
  return ret;
}

/** pbChooseItem(var = 0) */
export async function pbChooseItem(variable = 0): Promise<Id | null> {
  const ret = await chooseItemScreen(null);
  setItemVariable(variable, ret);
  return ret;
}

/** pbChooseApricorn(var = 0) */
export async function pbChooseApricorn(variable = 0): Promise<Id | null> {
  const ret = await chooseItemScreen((item) => Item.get(item).isApricorn());
  setItemVariable(variable, ret);
  return ret;
}

/** pbChooseFossil(var = 0) */
export async function pbChooseFossil(variable = 0): Promise<Id | null> {
  const ret = await chooseItemScreen((item) => Item.get(item).isFossil());
  setItemVariable(variable, ret);
  return ret;
}

/**
 * pbChooseItemFromList(message, variable, *items): a list of the given items
 * the player has; the chosen item's ID goes in the Game Variable.
 */
export async function pbChooseItemFromList(message: string, variable: number, ...args: Id[]): Promise<Id | null> {
  const commands: string[] = [];
  const itemid: (Id | null)[] = [];
  for (const item of args) {
    if (!Item.exists(item)) continue;
    const itm = Item.get(item);
    if (!bag().has(itm)) continue;
    commands.push(itm.name);
    itemid.push(itm.id);
  }
  if (commands.length === 0) {
    G.gameVariables.set(variable, "NONE");
    return null;
  }
  commands.push(_INTL("Cancel"));
  itemid.push(null);
  const ret = await pbMessage(message, commands, -1);
  if (ret < 0 || ret >= commands.length - 1) {
    G.gameVariables.set(variable, "NONE");
    return null;
  }
  G.gameVariables.set(variable, itemid[ret] || "NONE");
  return itemid[ret] ?? null;
}
