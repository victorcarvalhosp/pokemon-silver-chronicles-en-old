// The item functions the Bag and "obtain item" events need:
// - pbItemBall / pbReceiveItem / pbBuyPrize (012_Overworld/001_Overworld.rb)
// - pbLearnMove (013_Items/001_Item_Utilities.rb), used by form changes
// Item use (002/003_Item_*Effects.rb) is a separate port.
//
// Messages go through the message system (ui/messages pbMessage); tests and
// headless code can swap it with setMessageHook.

import type { Id } from "../../data/gameData/gameData";
import { _INTL } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import { PokemonMove } from "../pokemon/PokemonMove";
import { PokemonBag } from "./PokemonBag";

type MessageFn = (text: string, commands?: string[] | null, cmdIfCancel?: number) => Promise<number>;
type ConfirmFn = (text: string) => Promise<boolean>;

let messageFn: MessageFn = (text, commands = null, cmdIfCancel = 0) => pbMessage(text, commands, cmdIfCancel);
let confirmFn: ConfirmFn = (text) => pbConfirmMessage(text);

/** Replaces pbMessage/pbConfirmMessage for the data model (tests, headless runs). */
export function setMessageHook(message: MessageFn, confirm?: ConfirmFn): void {
  messageFn = message;
  if (confirm) confirmFn = confirm;
}

/** pbMessage as the data model calls it. */
export function pbMessageHook(text: string, commands: string[] | null = null, cmdIfCancel = 0): Promise<number> {
  return messageFn(text, commands, cmdIfCancel);
}

export function pbConfirmMessageHook(text: string): Promise<boolean> {
  return confirmFn(text);
}

const bag = () => (G as unknown as { bag: PokemonBag }).bag;

/** String#starts_with_vowel? */
export function startsWithVowel(s: string): boolean {
  return ["a", "e", "i", "o", "u"].includes((s[0] ?? "").toLowerCase());
}

/** Integer#to_word */
export function toWord(n: number): string {
  const ret = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
    "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  if (Number.isInteger(n) && n >= 0 && n <= ret.length) return ret[n] ?? "";
  return String(n);
}

//===============================================================================
// Picking up an item found on the ground
//===============================================================================
export async function pbItemBall(item: Id | Item, quantity = 1): Promise<boolean> {
  const itemData = Item.get(item);
  if (!itemData || quantity < 1) return false;
  const itemname = quantity > 1 ? itemData.namePlural : itemData.name;
  const pocket = itemData.pocket;
  const move = itemData.move;
  if (bag().add(itemData, quantity)) { // If item can be picked up
    const meName = itemData.isKeyItem() ? "Key item get" : "Item get";
    if (itemData.id === "LEFTOVERS") {
      await pbMessageHook(_INTL("\\me[{1}]You found some \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
    } else if (itemData.id === "DNASPLICERS") {
      await pbMessageHook(_INTL("\\me[{1}]You found \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
    } else if (itemData.isMachine()) { // TM or HM
      await pbMessageHook(_INTL("\\me[{1}]You found \\c[1]{2} {3}\\c[0]!\\wtnp[30]", meName, itemname, MoveData.get(move!).name));
    } else if (quantity > 1) {
      await pbMessageHook(_INTL("\\me[{1}]You found {2} \\c[1]{3}\\c[0]!\\wtnp[30]", meName, quantity, itemname));
    } else if (startsWithVowel(itemname)) {
      await pbMessageHook(_INTL("\\me[{1}]You found an \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
    } else {
      await pbMessageHook(_INTL("\\me[{1}]You found a \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
    }
    await pbMessageHook(_INTL("You put the {1} in\\nyour Bag's <icon=bagPocket{2}>\\c[1]{3}\\c[0] pocket.",
      itemname, pocket, PokemonBag.pocketNames()[pocket - 1]));
    return true;
  }
  // Can't add the item
  if (itemData.id === "LEFTOVERS") {
    await pbMessageHook(_INTL("You found some \\c[1]{1}\\c[0]!\\wtnp[30]", itemname));
  } else if (itemData.isMachine()) { // TM or HM
    await pbMessageHook(_INTL("You found \\c[1]{1} {2}\\c[0]!\\wtnp[30]", itemname, MoveData.get(move!).name));
  } else if (quantity > 1) {
    await pbMessageHook(_INTL("You found {1} \\c[1]{2}\\c[0]!\\wtnp[30]", quantity, itemname));
  } else if (startsWithVowel(itemname)) {
    await pbMessageHook(_INTL("You found an \\c[1]{1}\\c[0]!\\wtnp[30]", itemname));
  } else {
    await pbMessageHook(_INTL("You found a \\c[1]{1}\\c[0]!\\wtnp[30]", itemname));
  }
  await pbMessageHook(_INTL("But your Bag is full..."));
  return false;
}

//===============================================================================
// Being given an item
//===============================================================================
export async function pbReceiveItem(item: Id | Item, quantity = 1): Promise<boolean> {
  const itemData = Item.get(item);
  if (!itemData || quantity < 1) return false;
  const itemname = quantity > 1 ? itemData.namePlural : itemData.name;
  const pocket = itemData.pocket;
  const move = itemData.move;
  const meName = itemData.isKeyItem() ? "Key item get" : "Item get";
  if (itemData.id === "LEFTOVERS") {
    await pbMessageHook(_INTL("\\me[{1}]You obtained some \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
  } else if (itemData.id === "DNASPLICERS") {
    await pbMessageHook(_INTL("\\me[{1}]You obtained \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
  } else if (itemData.isMachine()) { // TM or HM
    await pbMessageHook(_INTL("\\me[{1}]You obtained \\c[1]{2} {3}\\c[0]!\\wtnp[30]", meName, itemname, MoveData.get(move!).name));
  } else if (quantity > 1) {
    await pbMessageHook(_INTL("\\me[{1}]You obtained {2} \\c[1]{3}\\c[0]!\\wtnp[30]", meName, quantity, itemname));
  } else if (startsWithVowel(itemname)) {
    await pbMessageHook(_INTL("\\me[{1}]You obtained an \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
  } else {
    await pbMessageHook(_INTL("\\me[{1}]You obtained a \\c[1]{2}\\c[0]!\\wtnp[30]", meName, itemname));
  }
  if (bag().add(itemData, quantity)) { // If item can be added
    await pbMessageHook(_INTL("You put the {1} in\\nyour Bag's <icon=bagPocket{2}>\\c[1]{3}\\c[0] pocket.",
      itemname, pocket, PokemonBag.pocketNames()[pocket - 1]));
    return true;
  }
  return false; // Can't add the item
}

//===============================================================================
// Buying a prize item from the Game Corner
//===============================================================================
export async function pbBuyPrize(item: Id | Item, quantity = 1): Promise<boolean> {
  const itemData = Item.get(item);
  if (!itemData || quantity < 1) return false;
  const itemName = quantity > 1 ? itemData.namePlural : itemData.name;
  const pocket = itemData.pocket;
  if (!bag().add(itemData, quantity)) return false;
  await pbMessageHook(_INTL("\\CNYou put the {1} in\\nyour Bag's <icon=bagPocket{2}>\\c[1]{3}\\c[0] pocket.",
    itemName, pocket, PokemonBag.pocketNames()[pocket - 1]));
  return true;
}

//===============================================================================
// Teach and forget a move
//===============================================================================

/** pbForgetMove(pkmn, move_to_learn): the summary screen's forget-a-move picker; set by the UI port. */
let forgetMoveHook: ((pkmn: Pokemon, moveToLearn: Id) => Promise<number>) | null = null;
export function setForgetMoveHook(fn: (pkmn: Pokemon, moveToLearn: Id) => Promise<number>): void {
  forgetMoveHook = fn;
}

export async function pbForgetMove(pkmn: Pokemon, moveToLearn: Id): Promise<number> {
  if (!forgetMoveHook) throw new Error("pbForgetMove needs the summary screen, which isn't ported yet");
  return forgetMoveHook(pkmn, moveToLearn);
}

/** pbLearnMove(pkmn, move, ignore_if_known = false, by_machine = false) */
export async function pbLearnMove(pkmn: Pokemon | null, move: Id, ignoreIfKnown = false, byMachine = false): Promise<boolean> {
  if (!pkmn) return false;
  move = MoveData.get(move).id;
  if (pkmn.egg()) {
    await pbMessageHook(_INTL("Eggs can't be taught any moves."));
    return false;
  } else if (pkmn.shadowPokemon()) {
    await pbMessageHook(_INTL("Shadow Pokémon can't be taught any moves."));
    return false;
  }
  const pkmnName = pkmn.name;
  const moveName = MoveData.get(move).name;
  if (pkmn.hasMove(move)) {
    if (!ignoreIfKnown) await pbMessageHook(_INTL("{1} already knows {2}.", pkmnName, moveName));
    return false;
  } else if (pkmn.numMoves() < 4) {
    pkmn.learnMove(move);
    await pbMessageHook(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]", pkmnName, moveName));
    return true;
  }
  await pbMessageHook(_INTL("{1} wants to learn {2}, but it already knows {3} moves.\x01",
    pkmnName, moveName, toWord(pkmn.numMoves())));
  if (await pbConfirmMessageHook(_INTL("Should {1} forget a move to learn {2}?", pkmnName, moveName))) {
    for (;;) {
      const moveIndex = await pbForgetMove(pkmn, move);
      if (moveIndex >= 0) {
        const oldMoveName = pkmn.moves[moveIndex]!.name;
        pkmn.moves[moveIndex] = new PokemonMove(move); // Replaces current/total PP
        // Settings::TAUGHT_MACHINES_KEEP_OLD_PP is false (generation 8)
        await pbMessageHook(_INTL("1, 2, and...\\wt[16] ...\\wt[16] ...\\wt[16] Ta-da!\\se[Battle ball drop]\x01"));
        await pbMessageHook(_INTL("{1} forgot how to use {2}.\\nAnd...\x01", pkmnName, oldMoveName));
        await pbMessageHook(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]", pkmnName, moveName));
        if (byMachine) pkmn.changeHappiness("machine");
        return true;
      } else if (await pbConfirmMessageHook(_INTL("Give up on learning {1}?", moveName))) {
        await pbMessageHook(_INTL("{1} did not learn {2}.", pkmnName, moveName));
        return false;
      }
    }
  } else {
    await pbMessageHook(_INTL("{1} did not learn {2}.", pkmnName, moveName));
  }
  return false;
}
