// The item functions the Bag and "obtain item" events need:
// - pbItemBall / pbReceiveItem / pbBuyPrize (012_Overworld/001_Overworld.rb)
// - pbLearnMove (013_Items/001_Item_Utilities.rb), used by form changes
// - the item effect helpers of 013_Items/001_Item_Utilities.rb (pbHPItem,
//   pbBattleHPItem, pbRestorePP, pbRaiseEffortValues, pbChangeLevel, ...) that
//   the item handlers (Item_Effects.ts, battle/items/) use. pbChangeLevel is
//   the v20.1 Hotfixes version; no other plugin redefines these.
// The UI parts of 001_Item_Utilities.rb (pbUseItem, pbGiveItemToPokemon, ...)
// are in ui/bag/itemUtilities.ts.
//
// Messages go through the message system (ui/messages pbMessage); tests and
// headless code can swap it with setMessageHook, and the two screens the
// level/Exp. helpers open with setTopRightWindowHook (pbTopRightWindow) and
// setItemEvolutionSceneHook (PokemonEvolutionScene, ui/evolution).

import { DEBUG } from "../../core/debug";
import type { Id } from "../../data/gameData/gameData";
import { _INTL } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Stat } from "../../data/gameData/stat";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import type { TerrainTag } from "../../data/gameData/terrainTag";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import type { Battler } from "../../battle/battler/Battler";
import { PBEffects } from "../../battle/other/PBEffects";
import type { Pokemon } from "../pokemon/Pokemon";
import { PokemonMove } from "../pokemon/PokemonMove";
import { PokemonBag } from "./PokemonBag";

/** The block pbMessage runs every frame (&block: e.g. { scene.pbUpdate }). */
type MessageBlock = (() => void | Promise<void>) | null | undefined;
type MessageFn = (text: string, commands?: string[] | null, cmdIfCancel?: number, block?: MessageBlock) => Promise<number>;
type ConfirmFn = (text: string, block?: MessageBlock) => Promise<boolean>;

let messageFn: MessageFn = (text, commands = null, cmdIfCancel = 0, block) => pbMessage(text, commands, cmdIfCancel, null, 0, block);
let confirmFn: ConfirmFn = (text, block) => pbConfirmMessage(text, block);

/** Replaces pbMessage/pbConfirmMessage for the data model (tests, headless runs). */
export function setMessageHook(message: MessageFn, confirm?: ConfirmFn): void {
  messageFn = message;
  if (confirm) confirmFn = confirm;
}

/** pbMessage as the data model calls it. */
export function pbMessageHook(text: string, commands: string[] | null = null, cmdIfCancel = 0, block?: MessageBlock): Promise<number> {
  return messageFn(text, commands, cmdIfCancel, block);
}

export function pbConfirmMessageHook(text: string, block?: MessageBlock): Promise<boolean> {
  return confirmFn(text, block);
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

/** pbLearnMove(pkmn, move, ignore_if_known = false, by_machine = false, &block): `block` runs every frame of its messages. */
export async function pbLearnMove(pkmn: Pokemon | null, move: Id, ignoreIfKnown = false, byMachine = false, block?: MessageBlock): Promise<boolean> {
  if (!pkmn) return false;
  move = MoveData.get(move).id;
  if (pkmn.egg() && !DEBUG) {
    await pbMessageHook(_INTL("Eggs can't be taught any moves."), null, 0, block);
    return false;
  } else if (pkmn.shadowPokemon()) {
    await pbMessageHook(_INTL("Shadow Pokémon can't be taught any moves."), null, 0, block);
    return false;
  }
  const pkmnName = pkmn.name;
  const moveName = MoveData.get(move).name;
  if (pkmn.hasMove(move)) {
    if (!ignoreIfKnown) await pbMessageHook(_INTL("{1} already knows {2}.", pkmnName, moveName), null, 0, block);
    return false;
  } else if (pkmn.numMoves() < 4) {
    pkmn.learnMove(move);
    await pbMessageHook(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]", pkmnName, moveName), null, 0, block);
    return true;
  }
  await pbMessageHook(_INTL("{1} wants to learn {2}, but it already knows {3} moves.\x01",
    pkmnName, moveName, toWord(pkmn.numMoves())), null, 0, block);
  if (await pbConfirmMessageHook(_INTL("Should {1} forget a move to learn {2}?", pkmnName, moveName), block)) {
    for (;;) {
      const moveIndex = await pbForgetMove(pkmn, move);
      if (moveIndex >= 0) {
        const oldMoveName = pkmn.moves[moveIndex]!.name;
        pkmn.moves[moveIndex] = new PokemonMove(move); // Replaces current/total PP
        // Settings::TAUGHT_MACHINES_KEEP_OLD_PP is false (generation 8)
        await pbMessageHook(_INTL("1, 2, and...\\wt[16] ...\\wt[16] ...\\wt[16] Ta-da!\\se[Battle ball drop]\x01"), null, 0, block);
        await pbMessageHook(_INTL("{1} forgot how to use {2}.\\nAnd...\x01", pkmnName, oldMoveName), null, 0, block);
        await pbMessageHook(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]", pkmnName, moveName), null, 0, block);
        if (byMachine) pkmn.changeHappiness("machine");
        return true;
      } else if (await pbConfirmMessageHook(_INTL("Give up on learning {1}?", moveName), block)) {
        await pbMessageHook(_INTL("{1} did not learn {2}.", pkmnName, moveName), null, 0, block);
        return false;
      }
    }
  } else {
    await pbMessageHook(_INTL("{1} did not learn {2}.", pkmnName, moveName), null, 0, block);
  }
  return false;
}

//===============================================================================
// Restore HP
//===============================================================================
/** The scene an item effect talks to: the party screen, the Summary or the battle scene. */
export interface ItemEffectScene {
  pbDisplay(text: string): Promise<void>;
  pbConfirm?(text: string): Promise<boolean>;
  pbRefresh?(): void;
  pbHardRefresh?(): void;
  pbUpdate?(): void;
}

/** pbItemRestoreHP(pkmn, restoreHP) */
export function pbItemRestoreHP(pkmn: Pokemon, restoreHP: number): number {
  let newHP = pkmn.hp + restoreHP;
  if (newHP > pkmn.totalhp) newHP = pkmn.totalhp;
  const hpGain = newHP - pkmn.hp;
  pkmn.hp = newHP;
  return hpGain;
}

/** pbHPItem(pkmn, restoreHP, scene) */
export async function pbHPItem(pkmn: Pokemon, restoreHP: number, scene: ItemEffectScene): Promise<boolean> {
  if (!pkmn.able() || pkmn.hp === pkmn.totalhp) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  const hpGain = pbItemRestoreHP(pkmn, restoreHP);
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1}'s HP was restored by {2} points.", pkmn.name, hpGain));
  return true;
}

/** pbBattleHPItem(pkmn, battler, restoreHP, scene) */
export async function pbBattleHPItem(pkmn: Pokemon, battler: Battler | null, restoreHP: number,
  scene: ItemEffectScene): Promise<boolean> {
  if (battler) {
    if ((await battler.pbRecoverHP(restoreHP)) > 0) {
      await scene.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    }
  } else if (pbItemRestoreHP(pkmn, restoreHP) > 0) {
    await scene.pbDisplay(_INTL("{1}'s HP was restored.", pkmn.name));
  }
  return true;
}

//===============================================================================
// Restore PP
//===============================================================================
/** pbRestorePP(pkmn, idxMove, pp): the PP restored. */
export function pbRestorePP(pkmn: Pokemon, idxMove: number, pp: number): number {
  const m = pkmn.moves[idxMove];
  if (!m || !m.id) return 0;
  if (m.totalPp <= 0) return 0;
  const oldpp = m.pp;
  let newpp = m.pp + pp;
  if (newpp > m.totalPp) newpp = m.totalPp;
  m.pp = newpp;
  return newpp - oldpp;
}

/** pbBattleRestorePP(pkmn, battler, idxMove, pp) */
export function pbBattleRestorePP(pkmn: Pokemon, battler: Battler | null, idxMove: number, pp: number): void {
  if (pbRestorePP(pkmn, idxMove, pp) === 0) return;
  if (battler && !battler.effects[PBEffects.Transform] &&
      battler.moves[idxMove] && battler.moves[idxMove]!.id === pkmn.moves[idxMove]!.id) {
    battler.pbSetPP(battler.moves[idxMove]!, pkmn.moves[idxMove]!.pp);
  }
}

//===============================================================================
// Battle items
//===============================================================================
/** pbBattleItemCanCureStatus?(status, pkmn, scene, showMessages) */
export async function pbBattleItemCanCureStatus(status: Id, pkmn: Pokemon, scene: ItemEffectScene,
  showMessages: boolean): Promise<boolean> {
  if (!pkmn.able() || pkmn.status !== status) {
    if (showMessages) await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  return true;
}

/** pbBattleItemCanRaiseStat?(stat, battler, scene, showMessages) */
export async function pbBattleItemCanRaiseStat(stat: Id, battler: Battler | null, scene: ItemEffectScene,
  showMessages: boolean): Promise<boolean> {
  if (!battler || !(await battler.pbCanRaiseStatStage(stat, battler))) {
    if (showMessages) await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  return true;
}

//===============================================================================
// Shared by the item effects (Item_Effects.ts) and the helpers below
//===============================================================================
/** Ruby's Comparable#clamp: raises when min > max. */
function rubyClamp(v: number, lo: number, hi: number): number {
  if (lo > hi) throw new RangeError("min argument must be smaller than max argument");
  return Math.min(Math.max(v, lo), hi);
}

/** Pokemon::EV_LIMIT / Pokemon::EV_STAT_LIMIT (Pokemon is only a type import here). */
const EV_LIMIT = 510;
const EV_STAT_LIMIT = 252;

/**
 * scene.is_a?(PokemonPartyScreen). The party screen is UI, which this
 * module can't import (it loads in node and in the battle code), so it's
 * recognised by methods only PokemonPartyScreen has.
 */
export function isPartyScreen(scene: unknown): boolean {
  const s = scene as { pbRefreshAnnotations?: unknown; pbChooseMove?: unknown } | null | undefined;
  return !!s && typeof s.pbRefreshAnnotations === "function" && typeof s.pbChooseMove === "function";
}

/**
 * Runs the evolution scene: Ruby's
 *   pbFadeOutInWithMusic {
 *     evo = PokemonEvolutionScene.new
 *     evo.pbStartScreen(pkmn, new_species)
 *     evo.pbEvolution(cancancel)
 *     evo.pbEndScreen
 *     <after>
 *   }
 * This is the one path to PokemonEvolutionScene (ui/evolution/Evolution.ts,
 * loaded on demand): items, events (Pokemon#trigger_event_evolution), battle
 * ends (fadeWithMusic false) and trades all come here; tests replace it with
 * setItemEvolutionSceneHook. `after` is what the caller runs inside the fade
 * (refreshing the party screen).
 */
export type ItemEvolutionSceneFn = (pkmn: Pokemon, newSpecies: Id, canCancel: boolean,
  after: () => void | Promise<void>, fadeWithMusic?: boolean) => Promise<void>;
let itemEvolutionScene: ItemEvolutionSceneFn | null = null;

export function setItemEvolutionSceneHook(fn: ItemEvolutionSceneFn | null): void {
  itemEvolutionScene = fn;
}

export async function pbItemEvolutionScene(pkmn: Pokemon, newSpecies: Id, canCancel = true,
  after: () => void | Promise<void> = () => {}, fadeWithMusic = true): Promise<void> {
  if (itemEvolutionScene) return itemEvolutionScene(pkmn, newSpecies, canCancel, after, fadeWithMusic);
  // Loaded on demand: this module also runs in node and in the battle code.
  const { pbEvolutionScene } = await import("../../ui/evolution/Evolution");
  await pbEvolutionScene(pkmn, newSpecies, canCancel, after, fadeWithMusic);
}

//===============================================================================
// Change a Pokémon's level
//===============================================================================
/**
 * pbChangeLevel(pkmn, new_level, scene), as the v20.1 Hotfixes plugin
 * redefines it (Misc bug fixes.rb:102, "Fixed Rare Candy not reviving a
 * fainted Shedinja"): levelling up a Pokémon with base HP 1 sets its HP to 1.
 */
export async function pbChangeLevel(pkmn: Pokemon, newLevel: number, scene: ItemEffectScene): Promise<void> {
  newLevel = rubyClamp(newLevel, 1, GrowthRate.maxLevel());
  if (pkmn.level === newLevel) {
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1}'s level remained unchanged.", pkmn.name));
    } else {
      await pbMessageHook(_INTL("{1}'s level remained unchanged.", pkmn.name));
    }
    return;
  }
  const oldLevel = pkmn.level;
  const oldTotalHp = pkmn.totalhp;
  const oldAttack = pkmn.attack;
  const oldDefense = pkmn.defense;
  const oldSpecialAttack = pkmn.spatk;
  const oldSpecialDefense = pkmn.spdef;
  const oldSpeed = pkmn.speed;
  pkmn.level = newLevel;
  pkmn.calcStats();
  if (newLevel > oldLevel && pkmn.speciesData().baseStats.HP === 1) pkmn.hp = 1;
  scene.pbRefresh?.();
  if (oldLevel > newLevel) {
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1} dropped to Lv. {2}!", pkmn.name, pkmn.level));
    } else {
      await pbMessageHook(_INTL("{1} dropped to Lv. {2}!", pkmn.name, pkmn.level));
    }
    const totalHpDiff = pkmn.totalhp - oldTotalHp;
    const attackDiff = pkmn.attack - oldAttack;
    const defenseDiff = pkmn.defense - oldDefense;
    const specialAttackDiff = pkmn.spatk - oldSpecialAttack;
    const specialDefenseDiff = pkmn.spdef - oldSpecialDefense;
    const speedDiff = pkmn.speed - oldSpeed;
    await pbTopRightWindow(_INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
      totalHpDiff, attackDiff, defenseDiff, specialAttackDiff, specialDefenseDiff, speedDiff), scene);
    await pbTopRightWindow(_INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
      pkmn.totalhp, pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed), scene);
  } else {
    pkmn.changeHappiness("vitamin");
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1} grew to Lv. {2}!", pkmn.name, pkmn.level));
    } else {
      await pbMessageHook(_INTL("{1} grew to Lv. {2}!", pkmn.name, pkmn.level));
    }
    const totalHpDiff = pkmn.totalhp - oldTotalHp;
    const attackDiff = pkmn.attack - oldAttack;
    const defenseDiff = pkmn.defense - oldDefense;
    const specialAttackDiff = pkmn.spatk - oldSpecialAttack;
    const specialDefenseDiff = pkmn.spdef - oldSpecialDefense;
    const speedDiff = pkmn.speed - oldSpeed;
    await pbTopRightWindow(_INTL("Max. HP<r>+{1}\r\nAttack<r>+{2}\r\nDefense<r>+{3}\r\nSp. Atk<r>+{4}\r\nSp. Def<r>+{5}\r\nSpeed<r>+{6}",
      totalHpDiff, attackDiff, defenseDiff, specialAttackDiff, specialDefenseDiff, speedDiff), scene);
    await pbTopRightWindow(_INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
      pkmn.totalhp, pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed), scene);
    // Learn new moves upon level up
    const movelist = pkmn.getMoveList();
    for (const i of movelist) {
      if (i.level <= oldLevel || i.level > pkmn.level) continue;
      await pbLearnMove(pkmn, i.move, true, false, () => scene?.pbUpdate?.());
    }
    // Check for evolution
    const newSpecies = pkmn.checkEvolutionOnLevelUp();
    if (newSpecies) {
      await pbItemEvolutionScene(pkmn, newSpecies, true, () => {
        if (isPartyScreen(scene)) scene.pbRefresh?.();
      });
    }
  }
}

/** pbTopRightWindow(text, scene): the stat window shown after a level change; a hook replaces it in tests. */
let topRightWindowHook: ((text: string, scene: ItemEffectScene | null) => Promise<void>) | null = null;
export function setTopRightWindowHook(fn: ((text: string, scene: ItemEffectScene | null) => Promise<void>) | null): void {
  topRightWindowHook = fn;
}

export async function pbTopRightWindow(text: string, scene: ItemEffectScene | null = null): Promise<void> {
  if (topRightWindowHook) return topRightWindowHook(text, scene);
  // Loaded on demand: this module also runs in node and in the battle code.
  const { Window_AdvancedTextPokemon } = await import("../../ui/windows/SpriteWindowText");
  const { Graphics } = await import("../../rgss/Graphics");
  const { Input } = await import("../../rgss/Input");
  const { pbPlayDecisionSE } = await import("../GameSystem");
  const window = new Window_AdvancedTextPokemon(text);
  window.width = 198;
  window.x = Graphics.width - window.width;
  window.y = 0;
  window.z = 99999;
  pbPlayDecisionSE();
  for (;;) {
    await Graphics.update();
    Input.update();
    window.update();
    scene?.pbUpdate?.();
    if (Input.trigger(Input.USE)) break;
  }
  window.dispose();
}

/** pbChangeExp(pkmn, new_exp, scene) */
export async function pbChangeExp(pkmn: Pokemon, newExp: number, scene: ItemEffectScene): Promise<void> {
  newExp = rubyClamp(newExp, 0, pkmn.growthRate().maximumExp());
  if (pkmn.exp === newExp) {
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1}'s Exp. Points remained unchanged.", pkmn.name));
    } else {
      await pbMessageHook(_INTL("{1}'s Exp. Points remained unchanged.", pkmn.name));
    }
    return;
  }
  const oldLevel = pkmn.level;
  const oldTotalHp = pkmn.totalhp;
  const oldAttack = pkmn.attack;
  const oldDefense = pkmn.defense;
  const oldSpecialAttack = pkmn.spatk;
  const oldSpecialDefense = pkmn.spdef;
  const oldSpeed = pkmn.speed;
  if (pkmn.exp > newExp) { // Loses Exp
    const difference = pkmn.exp - newExp;
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1} lost {2} Exp. Points!", pkmn.name, difference));
    } else {
      await pbMessageHook(_INTL("{1} lost {2} Exp. Points!", pkmn.name, difference));
    }
    pkmn.exp = newExp;
    pkmn.calcStats();
    scene.pbRefresh?.();
    if (pkmn.level === oldLevel) return;
    // Level changed
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1} dropped to Lv. {2}!", pkmn.name, pkmn.level));
    } else {
      await pbMessageHook(_INTL("{1} dropped to Lv. {2}!", pkmn.name, pkmn.level));
    }
    const totalHpDiff = pkmn.totalhp - oldTotalHp;
    const attackDiff = pkmn.attack - oldAttack;
    const defenseDiff = pkmn.defense - oldDefense;
    const specialAttackDiff = pkmn.spatk - oldSpecialAttack;
    const specialDefenseDiff = pkmn.spdef - oldSpecialDefense;
    const speedDiff = pkmn.speed - oldSpeed;
    await pbTopRightWindow(_INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
      totalHpDiff, attackDiff, defenseDiff, specialAttackDiff, specialDefenseDiff, speedDiff), scene);
    await pbTopRightWindow(_INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
      pkmn.totalhp, pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed), scene);
  } else { // Gains Exp
    const difference = newExp - pkmn.exp;
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1} gained {2} Exp. Points!", pkmn.name, difference));
    } else {
      await pbMessageHook(_INTL("{1} gained {2} Exp. Points!", pkmn.name, difference));
    }
    pkmn.exp = newExp;
    pkmn.changeHappiness("vitamin");
    pkmn.calcStats();
    scene.pbRefresh?.();
    if (pkmn.level === oldLevel) return;
    // Level changed
    if (isPartyScreen(scene)) {
      await scene.pbDisplay(_INTL("{1} grew to Lv. {2}!", pkmn.name, pkmn.level));
    } else {
      await pbMessageHook(_INTL("{1} grew to Lv. {2}!", pkmn.name, pkmn.level));
    }
    const totalHpDiff = pkmn.totalhp - oldTotalHp;
    const attackDiff = pkmn.attack - oldAttack;
    const defenseDiff = pkmn.defense - oldDefense;
    const specialAttackDiff = pkmn.spatk - oldSpecialAttack;
    const specialDefenseDiff = pkmn.spdef - oldSpecialDefense;
    const speedDiff = pkmn.speed - oldSpeed;
    await pbTopRightWindow(_INTL("Max. HP<r>+{1}\r\nAttack<r>+{2}\r\nDefense<r>+{3}\r\nSp. Atk<r>+{4}\r\nSp. Def<r>+{5}\r\nSpeed<r>+{6}",
      totalHpDiff, attackDiff, defenseDiff, specialAttackDiff, specialDefenseDiff, speedDiff), scene);
    await pbTopRightWindow(_INTL("Max. HP<r>{1}\r\nAttack<r>{2}\r\nDefense<r>{3}\r\nSp. Atk<r>{4}\r\nSp. Def<r>{5}\r\nSpeed<r>{6}",
      pkmn.totalhp, pkmn.attack, pkmn.defense, pkmn.spatk, pkmn.spdef, pkmn.speed), scene);
    // Learn new moves upon level up
    const movelist = pkmn.getMoveList();
    for (const i of movelist) {
      if (i.level <= oldLevel || i.level > pkmn.level) continue;
      await pbLearnMove(pkmn, i.move, true, false, () => scene?.pbUpdate?.());
    }
    // Check for evolution
    const newSpecies = pkmn.checkEvolutionOnLevelUp();
    if (newSpecies) {
      await pbItemEvolutionScene(pkmn, newSpecies, true, () => {
        if (isPartyScreen(scene)) scene.pbRefresh?.();
      });
    }
  }
}

/** pbGainExpFromExpCandy(pkmn, base_amt, qty, scene) */
export async function pbGainExpFromExpCandy(pkmn: Pokemon, baseAmt: number, qty: number, scene: ItemEffectScene): Promise<boolean> {
  if (pkmn.level >= GrowthRate.maxLevel() || pkmn.shadowPokemon()) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  if (isPartyScreen(scene)) (scene as unknown as { scene: { pbSetHelpText(text: string): void } }).scene.pbSetHelpText("");
  if (qty > 1) {
    for (let i = 0; i < qty - 1; i++) pkmn.changeHappiness("vitamin");
  }
  await pbChangeExp(pkmn, pkmn.exp + (baseAmt * qty), scene);
  scene.pbHardRefresh?.();
  return true;
}

//===============================================================================
// Change EVs
//===============================================================================
/** pbJustRaiseEffortValues(pkmn, stat, evGain): the EVs gained. */
export function pbJustRaiseEffortValues(pkmn: Pokemon, stat: Id, evGain: number): number {
  stat = Stat.get(stat).id;
  let evTotal = 0;
  for (const s of Stat.eachMain()) evTotal += pkmn.ev[s.id]!;
  evGain = rubyClamp(evGain, 0, EV_STAT_LIMIT - pkmn.ev[stat]!);
  evGain = rubyClamp(evGain, 0, EV_LIMIT - evTotal);
  if (evGain > 0) {
    pkmn.ev[stat]! += evGain;
    pkmn.calcStats();
  }
  return evGain;
}

/** pbRaiseEffortValues(pkmn, stat, evGain = 10, no_ev_cap = false): the EVs gained. */
export function pbRaiseEffortValues(pkmn: Pokemon, stat: Id, evGain = 10, noEvCap = false): number {
  stat = Stat.get(stat).id;
  if (!noEvCap && pkmn.ev[stat]! >= 100) return 0;
  let evTotal = 0;
  for (const s of Stat.eachMain()) evTotal += pkmn.ev[s.id]!;
  evGain = rubyClamp(evGain, 0, EV_STAT_LIMIT - pkmn.ev[stat]!);
  if (!noEvCap) evGain = rubyClamp(evGain, 0, 100 - pkmn.ev[stat]!);
  evGain = rubyClamp(evGain, 0, EV_LIMIT - evTotal);
  if (evGain > 0) {
    pkmn.ev[stat]! += evGain;
    pkmn.calcStats();
  }
  return evGain;
}

/** pbMaxUsesOfEVRaisingItem(stat, amt_per_use, pkmn, no_ev_cap = false) */
export function pbMaxUsesOfEVRaisingItem(stat: Id, amtPerUse: number, pkmn: Pokemon, noEvCap = false): number {
  const maxPerStat = noEvCap ? EV_STAT_LIMIT : 100;
  let amtCanGain = maxPerStat - pkmn.ev[stat]!;
  let evTotal = 0;
  for (const s of Stat.eachMain()) evTotal += pkmn.ev[s.id]!;
  amtCanGain = Math.min(amtCanGain, EV_LIMIT - evTotal);
  return Math.max(Math.ceil(amtCanGain / amtPerUse), 1);
}

/** pbUseEVRaisingItem(stat, amt_per_use, qty, pkmn, happiness_type, scene, no_ev_cap = false) */
export async function pbUseEVRaisingItem(stat: Id, amtPerUse: number, qty: number, pkmn: Pokemon, happinessType: string,
  scene: ItemEffectScene, noEvCap = false): Promise<boolean> {
  let ret = true;
  for (let i = 0; i < qty; i++) {
    if (pbRaiseEffortValues(pkmn, stat, amtPerUse, noEvCap) > 0) {
      pkmn.changeHappiness(happinessType);
    } else {
      if (i === 0) ret = false;
      break;
    }
  }
  if (!ret) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1}'s {2} increased.", pkmn.name, Stat.get(stat).name));
  return true;
}

/** pbMaxUsesOfEVLoweringBerry(stat, pkmn) */
export function pbMaxUsesOfEVLoweringBerry(stat: Id, pkmn: Pokemon): number {
  const ret = Math.ceil(pkmn.ev[stat]! / 10);
  let happiness = pkmn.happiness;
  let uses = 0;
  if (happiness < 255) {
    let bonusPerUse = 0;
    if (pkmn.obtainMap === G.gameMap?.mapId) bonusPerUse += 1;
    if (pkmn.pokeBall === "LUXURYBALL") bonusPerUse += 1;
    const hasSootheBell = pkmn.hasItem("SOOTHEBELL");
    for (;;) {
      uses += 1;
      let gain = [10, 5, 2][Math.floor(happiness / 100)]!;
      gain += bonusPerUse;
      if (hasSootheBell) gain = Math.floor(gain * 1.5);
      happiness += gain;
      if (happiness >= 255) break;
    }
  }
  return Math.max(ret, uses);
}

/** pbRaiseHappinessAndLowerEV(pkmn, scene, stat, qty, messages) */
export async function pbRaiseHappinessAndLowerEV(pkmn: Pokemon, scene: ItemEffectScene, stat: Id, qty: number,
  messages: string[]): Promise<boolean> {
  const h = pkmn.happiness < 255;
  const e = pkmn.ev[stat]! > 0;
  if (!h && !e) {
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  if (h) {
    for (let i = 0; i < qty; i++) pkmn.changeHappiness("evberry");
  }
  if (e) {
    pkmn.ev[stat]! -= 10 * qty;
    if (pkmn.ev[stat]! < 0) pkmn.ev[stat] = 0;
    pkmn.calcStats();
  }
  scene.pbRefresh?.();
  await scene.pbDisplay(messages[2 - (h ? 0 : 2) - (e ? 0 : 1)]!);
  return true;
}

//===============================================================================
// Change nature
//===============================================================================
/** pbNatureChangingMint(new_nature, item, pkmn, scene) */
export async function pbNatureChangingMint(newNature: Id, item: Id, pkmn: Pokemon, scene: ItemEffectScene): Promise<boolean> {
  if (pkmn.natureForStats?.id === newNature) { // GameData::Nature == Symbol compares IDs
    await scene.pbDisplay(_INTL("It won't have any effect."));
    return false;
  }
  if (!(await scene.pbConfirm!(_INTL("It might affect {1}'s stats. Are you sure you want to use it?", pkmn.name)))) {
    return false;
  }
  pkmn.natureForStats = newNature;
  pkmn.calcStats();
  scene.pbRefresh?.();
  await scene.pbDisplay(_INTL("{1}'s stats may have changed due to the effects of the {2}!",
    pkmn.name, Item.get(item).name));
  return true;
}

//===============================================================================
// Decide whether the player is able to ride/dismount their Bicycle
//===============================================================================
/** What the item effects need from $game_player. */
export interface FieldItemPlayer {
  x: number;
  y: number;
  direction: number;
  pbTerrainTag(countBridge?: boolean): TerrainTag;
  pbFacingTerrainTag(dir?: number): TerrainTag;
  terrainTag(): TerrainTag;
  canMapTransferWithFollower(): boolean;
  canRideVehicleWithFollower(): boolean;
  turnRight90(): void;
  turnDown(): void;
  turnLeft(): void;
  turnRight(): void;
  turnUp(): void;
}

/** pbBikeCheck */
export async function pbBikeCheck(): Promise<boolean> {
  const g = G.pokemonGlobal;
  const gamePlayer = G.gamePlayer as unknown as FieldItemPlayer;
  if (g.surfing || g.diving ||
      (!g.bicycle && gamePlayer.pbTerrainTag().mustWalk)) {
    await pbMessageHook(_INTL("Can't use that here."));
    return false;
  }
  if (!gamePlayer.canRideVehicleWithFollower()) {
    await pbMessageHook(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  const mapMetadataData = G.gameMap ? mapMetadata(G.gameMap.mapId) : undefined; // $game_map.metadata
  if (g.bicycle) {
    if (mapMetadataData?.alwaysBicycle) {
      await pbMessageHook(_INTL("You can't dismount your Bike here."));
      return false;
    }
    return true;
  }
  if (!mapMetadataData || (!mapMetadataData.canBicycle && !mapMetadataData.outdoorMap)) {
    await pbMessageHook(_INTL("Can't use that here."));
    return false;
  }
  return true;
}

//===============================================================================
// Find the closest hidden item (for Itemfinder)
//===============================================================================
/** A map event as pbClosestHiddenItem reads it. */
export interface HiddenItemEvent {
  id: number;
  name: string;
  x: number;
  y: number;
}

/** pbClosestHiddenItem */
export function pbClosestHiddenItem(): HiddenItemEvent | null {
  const result: HiddenItemEvent[] = [];
  const gamePlayer = G.gamePlayer!;
  const playerX = gamePlayer.x;
  const playerY = gamePlayer.y;
  const gameMap = G.gameMap!;
  for (const event of gameMap.events.values() as unknown as Iterable<HiddenItemEvent>) {
    if (!/hiddenitem/i.test(event.name)) continue;
    if (Math.abs(playerX - event.x) >= 8) continue;
    if (Math.abs(playerY - event.y) >= 6) continue;
    if (G.gameSelfSwitches.get(gameMap.mapId, event.id, "A")) continue;
    result.push(event);
  }
  if (result.length === 0) return null;
  let ret: HiddenItemEvent | null = null;
  let retmin = 0;
  for (const event of result) {
    const dist = Math.abs(playerX - event.x) + Math.abs(playerY - event.y);
    if (ret && retmin <= dist) continue;
    ret = event;
    retmin = dist;
  }
  return ret;
}
