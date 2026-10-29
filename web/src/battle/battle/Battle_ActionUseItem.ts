// Port of Data/Scripts/011_Battle/001_Battle/006_Battle_ActionUseItem.rb
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb:139): pbItemUsesAllActions? (UsesAllBattleActions flag).
// - Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:69-88): midbattle triggers in
//   pbUseItemOnPokemon, pbUseItemOnBattler, pbUseItemInBattle.
//
// ItemHandlers.triggerCanUseInBattle/triggerUseInBattle/triggerBattleUseOnBattler/
// triggerBattleUseOnPokemon (013_Items/001_Item_Utilities.rb:94-113) aren't in
// game/items/ItemHandlers.ts yet (only their hashes are), so they're ported
// below and exported for the rest of the battle code.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { G } from "../../game/globals";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import { startsWithVowel } from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { BattleSubScene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Battle, type BattleChoice } from "./Battle";

/** Ruby truthiness of a handler's result (only nil and false are falsy). */
const truthy = (x: unknown): boolean => x != null && x !== false;

//===============================================================================
// ItemHandlers battle triggers (013_Items/001_Item_Utilities.rb:94)
//===============================================================================
/** ItemHandlers.triggerCanUseInBattle: can use the item by default (no handler). */
export async function triggerCanUseInBattle(item: Id, pkmn: Pokemon | null, battler: Battler | null,
  move: number | null, firstAction: boolean, battle: Battle, scene: unknown, showMessages = true): Promise<boolean> {
  if (!ItemHandlers.CanUseInBattle.get(item)) return true; // Can use the item by default
  return truthy(await ItemHandlers.CanUseInBattle.trigger(item, pkmn, battler, move, firstAction, battle, scene, showMessages));
}

/** ItemHandlers.triggerUseInBattle */
export async function triggerUseInBattle(item: Id, battler: Battler | null, battle: Battle): Promise<void> {
  await ItemHandlers.UseInBattle.trigger(item, battler, battle);
}

/** ItemHandlers.triggerBattleUseOnBattler: returns whether item was used. */
export async function triggerBattleUseOnBattler(item: Id, battler: Battler, scene: unknown): Promise<boolean> {
  if (!ItemHandlers.BattleUseOnBattler.get(item)) return false;
  return truthy(await ItemHandlers.BattleUseOnBattler.trigger(item, battler, scene));
}

/** ItemHandlers.triggerBattleUseOnPokemon: returns whether item was used. */
export async function triggerBattleUseOnPokemon(item: Id, pkmn: Pokemon | null, battler: Battler | null,
  choices: BattleChoice, scene: unknown): Promise<boolean> {
  if (!ItemHandlers.BattleUseOnPokemon.get(item)) return false;
  return truthy(await ItemHandlers.BattleUseOnPokemon.trigger(item, pkmn, battler, choices, scene));
}

const methods = {
  //=============================================================================
  // Choosing to use an item
  //=============================================================================
  /** pbCanUseItemOnPokemon? — scene is the Bag/party screen (or the battle scene). */
  async pbCanUseItemOnPokemon(this: Battle, item: Id, pkmn: Pokemon | null, battler: Battler | null,
    scene: BattleSubScene | null, showMessages = true): Promise<boolean> {
    if (!pkmn || pkmn.egg()) {
      if (showMessages) await scene?.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    // Embargo
    if (battler && battler.effects[PBEffects.Embargo] > 0) {
      if (showMessages) {
        await scene?.pbDisplay(_INTL("Embargo's effect prevents the item's use on {1}!",
          battler.pbThis(true)));
      }
      return false;
    }
    // Hyper Mode and non-Scents
    if (pkmn.hyperMode && !Item.tryGet(item)?.isScent()) {
      if (showMessages) await scene?.pbDisplay(_INTL("It won't have any effect."));
      return false;
    }
    return true;
  },

  /**
   * pbItemUsesAllActions?
   * NOTE: Using a Poké Ball consumes all your actions for the round. The method
   *       below is one half of making this happen; the other half is in the
   *       ItemHandlers::CanUseInBattle for Poké Balls.
   */
  pbItemUsesAllActions(this: Battle, item: Id): boolean {
    // Essentials Deluxe: new item flag
    if (Item.get(item).hasFlag("UsesAllBattleActions")) return true;
    // --- Essentials ---
    if (Item.get(item).isPokeBall()) return true;
    return false;
  },

  pbRegisterItem(this: Battle, idxBattler: number, item: Id, idxTarget: number | null = null,
    idxMove: number | null = null): boolean {
    // Register for use of item on a Pokémon in the party
    const choice = this.choices[idxBattler]!;
    choice[0] = "UseItem";
    choice[1] = item; // ID of item to be used
    choice[2] = idxTarget; // Party index of Pokémon to use item on
    choice[3] = idxMove as number; // Index of move to recharge (Ethers)
    // Delete the item from the Bag. If it turns out it will have no effect, it
    // will be re-added to the Bag later.
    this.pbConsumeItemInBag(item, idxBattler);
    return true;
  },

  //=============================================================================
  // Using an item
  //=============================================================================
  pbConsumeItemInBag(this: Battle, item: Id | null, idxBattler: number): void {
    if (!item) return;
    if (!Item.get(item).consumedAfterUse()) return;
    if (this.pbOwnedByPlayer(idxBattler)) {
      if (!G.bag.remove(item)) {
        throw new Error(_INTL("Tried to consume item that wasn't in the Bag somehow."));
      }
    } else {
      const items = this.pbGetOwnerItems(idxBattler);
      const i = items.indexOf(item);
      // Ruby: items.delete_at(items.index(item)), which raises if the item isn't there
      if (i < 0) throw new TypeError("no implicit conversion from nil to integer");
      items.splice(i, 1);
    }
  },

  pbReturnUnusedItemToBag(this: Battle, item: Id | null, idxBattler: number): void {
    if (!item) return;
    if (!Item.get(item).consumedAfterUse()) return;
    if (this.pbOwnedByPlayer(idxBattler)) {
      if (G.bag?.canAdd(item)) {
        G.bag.add(item);
      } else {
        throw new Error(_INTL("Couldn't return unused item to Bag somehow."));
      }
    } else {
      const items = this.pbGetOwnerItems(idxBattler);
      items?.push(item);
    }
  },

  async pbUseItemMessage(this: Battle, item: Id, trainerName: string): Promise<void> {
    const itemName = Item.get(item).name;
    if (startsWithVowel(itemName)) {
      await this.pbDisplayBrief(_INTL("{1} used an {2}.", trainerName, itemName));
    } else {
      await this.pbDisplayBrief(_INTL("{1} used a {2}.", trainerName, itemName));
    }
  },

  /** Uses an item on a Pokémon in the trainer's party. */
  async pbUseItemOnPokemon(this: Battle, item: Id, idxParty: number, userBattler: Battler): Promise<void> {
    // Essentials Deluxe: mid-battle triggers for when items are used
    await this.scene.pbDeluxeTriggers?.(userBattler, null, ["item", "item" + item]);
    // --- Essentials ---
    const trainerName = this.pbGetOwnerName(userBattler.index);
    await this.pbUseItemMessage(item, trainerName);
    const pkmn = this.pbParty(userBattler.index)[idxParty] ?? null;
    const battler = this.pbFindBattler(idxParty, userBattler.index);
    const ch = this.choices[userBattler.index]!;
    if (await triggerCanUseInBattle(item, pkmn, battler, ch[3], true, this, this.scene, false)) {
      await triggerBattleUseOnPokemon(item, pkmn, battler, ch, this.scene);
      ch[1] = null; // Delete item from choice
      return;
    }
    await this.pbDisplay(_INTL("But it had no effect!"));
    // Return unused item to Bag
    this.pbReturnUnusedItemToBag(item, userBattler.index);
  },

  /** Uses an item on a Pokémon in battle that belongs to the trainer. */
  async pbUseItemOnBattler(this: Battle, item: Id, idxParty: number, userBattler: Battler): Promise<void> {
    // Essentials Deluxe: mid-battle triggers for when items are used
    await this.scene.pbDeluxeTriggers?.(userBattler, null, ["item", "item" + item]);
    // --- Essentials ---
    const trainerName = this.pbGetOwnerName(userBattler.index);
    await this.pbUseItemMessage(item, trainerName);
    const battler = this.pbFindBattler(idxParty, userBattler.index);
    const ch = this.choices[userBattler.index]!;
    if (battler) {
      if (await triggerCanUseInBattle(item, battler.pokemon, battler, ch[3], true, this, this.scene, false)) {
        await triggerBattleUseOnBattler(item, battler, this.scene);
        ch[1] = null; // Delete item from choice
        await battler.pbItemOnStatDropped();
        return;
      } else {
        await this.pbDisplay(_INTL("But it had no effect!"));
      }
    } else {
      await this.pbDisplay(_INTL("But it's not where this item can be used!"));
    }
    // Return unused item to Bag
    this.pbReturnUnusedItemToBag(item, userBattler.index);
  },

  /** Uses a Poké Ball in battle directly. */
  async pbUsePokeBallInBattle(this: Battle, item: Id, idxBattler: number, userBattler: Battler): Promise<void> {
    if (idxBattler < 0) idxBattler = userBattler.index;
    const battler = this.battlers[idxBattler] ?? null;
    await triggerUseInBattle(item, battler, this);
    this.choices[userBattler.index]![1] = null; // Delete item from choice
  },

  /** Uses an item in battle directly. */
  async pbUseItemInBattle(this: Battle, item: Id, idxBattler: number, userBattler: Battler): Promise<void> {
    // Essentials Deluxe: mid-battle triggers for when items are used
    await this.scene.pbDeluxeTriggers?.(userBattler, idxBattler, ["item", "item" + item]);
    // --- Essentials ---
    const trainerName = this.pbGetOwnerName(userBattler.index);
    await this.pbUseItemMessage(item, trainerName);
    const battler = idxBattler < 0 ? userBattler : this.battlers[idxBattler]!;
    const pkmn = battler.pokemon;
    const ch = this.choices[userBattler.index]!;
    if (await triggerCanUseInBattle(item, pkmn, battler, ch[3], true, this, this.scene, false)) {
      await triggerUseInBattle(item, battler, this);
      ch[1] = null; // Delete item from choice
      return;
    }
    await this.pbDisplay(_INTL("But it had no effect!"));
    // Return unused item to Bag
    this.pbReturnUnusedItemToBag(item, userBattler.index);
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
