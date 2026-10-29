// Port of Data/Scripts/011_Battle/003_Move/011_MoveEffects_Items.rb, with:
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:291):
//   ThrowUserItemAtTarget#pbEffectAgainstTarget is redefined (Covert Cloak
//   blocks the flung item's added effect).
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { startsWithVowel } from "../../game/items/itemUtilities";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Move, registerMoveClass } from "./Move";
import { StatUpMove } from "./Move_BaseEffects";

/** Ruby's `item == id` for a GameData::Item (or nil) and an item ID (or nil): nil == nil is true. */
function sameItem(item: Item | null, id: Id | null): boolean {
  return (item ? item.id : null) === id;
}

//===============================================================================
// User steals the target's item, if the user has none itself. (Covet, Thief)
// Items stolen from wild Pokémon are kept after the battle.
//===============================================================================
export class UserTakesTargetItem extends Move {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (user.wild()) return; // Wild Pokémon can't thieve
    if (user.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    if (!target.item || user.item) return;
    if (target.unlosableItem(target.item)) return;
    if (user.unlosableItem(target.item)) return;
    if (target.hasActiveAbility("STICKYHOLD") && !this.battle.moldBreaker) return;
    const itemName = target.itemName();
    user.item = target.item;
    // Permanently steal the item from wild Pokémon
    if (target.wild() && !user.initialItem() && sameItem(target.item, target.initialItem())) {
      user.setInitialItem(target.item);
      target.pbRemoveItem();
    } else {
      target.pbRemoveItem(false);
    }
    await this.battle.pbDisplay(_INTL("{1} stole {2}'s {3}!", user.pbThis(), target.pbThis(true), itemName));
    await user.pbHeldItemTriggerCheck();
  }
}
registerMoveClass("UserTakesTargetItem", UserTakesTargetItem);

//===============================================================================
// User gives its item to the target. The item remains given after wild battles.
// (Bestow)
//===============================================================================
export class TargetTakesUserItem extends Move {
  override ignoresSubstitute(user: Battler | null): boolean {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) return true;
    return super.ignoresSubstitute(user);
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.item || user.unlosableItem(user.item)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.item || target.unlosableItem(user.item)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    const itemName = user.itemName();
    target.item = user.item;
    // Permanently steal the item from wild Pokémon
    if (user.wild() && !target.initialItem() && sameItem(user.item, user.initialItem())) {
      target.setInitialItem(user.item);
      user.pbRemoveItem();
    } else {
      user.pbRemoveItem(false);
    }
    await this.battle.pbDisplay(_INTL("{1} received {2} from {3}!", target.pbThis(), itemName, user.pbThis(true)));
    await target.pbHeldItemTriggerCheck();
  }
}
registerMoveClass("TargetTakesUserItem", TargetTakesUserItem);

//===============================================================================
// User and target swap items. They remain swapped after wild battles.
// (Switcheroo, Trick)
//===============================================================================
export class UserTargetSwapItems extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.wild()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!user.item && !target.item) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.unlosableItem(target.item) ||
        target.unlosableItem(user.item) ||
        user.unlosableItem(user.item) ||
        user.unlosableItem(target.item)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.hasActiveAbility("STICKYHOLD") && !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("But it failed to affect {1}!", target.pbThis(true)));
        } else {
          await this.battle.pbDisplay(_INTL("But it failed to affect {1} because of its {2}!",
            target.pbThis(true), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    const oldUserItem = user.item;
    const oldUserItemName = user.itemName();
    const oldTargetItem = target.item;
    const oldTargetItemName = target.itemName();
    user.item = oldTargetItem;
    if (!user.hasActiveAbility("GORILLATACTICS")) user.effects[PBEffects.ChoiceBand] = null;
    // Ruby stores `(!user.item && oldUserItem)`: false, nil or the old item.
    if (user.hasActiveAbility("UNBURDEN")) user.effects[PBEffects.Unburden] = user.item ? false : oldUserItem;
    target.item = oldUserItem;
    if (!target.hasActiveAbility("GORILLATACTICS")) target.effects[PBEffects.ChoiceBand] = null;
    if (target.hasActiveAbility("UNBURDEN")) target.effects[PBEffects.Unburden] = target.item ? false : oldTargetItem;
    // Permanently steal the item from wild Pokémon
    if (target.wild() && !user.initialItem() && sameItem(oldTargetItem, target.initialItem())) {
      user.setInitialItem(oldTargetItem);
    }
    await this.battle.pbDisplay(_INTL("{1} switched items with its opponent!", user.pbThis()));
    if (oldTargetItem) await this.battle.pbDisplay(_INTL("{1} obtained {2}.", user.pbThis(), oldTargetItemName));
    if (oldUserItem) await this.battle.pbDisplay(_INTL("{1} obtained {2}.", target.pbThis(), oldUserItemName));
    await user.pbHeldItemTriggerCheck();
    await target.pbHeldItemTriggerCheck();
  }
}
registerMoveClass("UserTargetSwapItems", UserTargetSwapItems);

//===============================================================================
// User recovers the last item it held and consumed. (Recycle)
//===============================================================================
export class RestoreUserConsumedItem extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.recycleItem()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const item = user.recycleItem();
    user.item = item;
    if (this.battle.wildBattle() && !user.initialItem()) user.setInitialItem(item);
    user.setRecycleItem(null);
    user.effects[PBEffects.PickupItem] = null;
    user.effects[PBEffects.PickupUse] = 0;
    const itemName = Item.get(item!).name;
    if (startsWithVowel(itemName)) {
      await this.battle.pbDisplay(_INTL("{1} found an {2}!", user.pbThis(), itemName));
    } else {
      await this.battle.pbDisplay(_INTL("{1} found a {2}!", user.pbThis(), itemName));
    }
    await user.pbHeldItemTriggerCheck();
  }
}
registerMoveClass("RestoreUserConsumedItem", RestoreUserConsumedItem);

//===============================================================================
// Target drops its item. It regains the item at the end of the battle. (Knock Off)
// If target has a losable item, damage is multiplied by 1.5.
//===============================================================================
export class RemoveTargetItem extends Move {
  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
        target.item && !target.unlosableItem(target.item)) {
      // NOTE: Damage is still boosted even if target has Sticky Hold or a
      //       substitute.
      baseDmg = rubyRound(baseDmg * 1.5);
    }
    return baseDmg;
  }

  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (user.wild()) return; // Wild Pokémon can't knock off
    if (user.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    if (!target.item || target.unlosableItem(target.item)) return;
    if (target.hasActiveAbility("STICKYHOLD") && !this.battle.moldBreaker) return;
    const itemName = target.itemName();
    target.pbRemoveItem(false);
    await this.battle.pbDisplay(_INTL("{1} dropped its {2}!", target.pbThis(), itemName));
  }
}
registerMoveClass("RemoveTargetItem", RemoveTargetItem);

//===============================================================================
// Target's berry/Gem is destroyed. (Incinerate)
//===============================================================================
export class DestroyTargetBerryOrGem extends Move {
  override async pbEffectWhenDealingDamage(_user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute || target.damageState.berryWeakened) return;
    if (!target.item || (!target.item.isBerry() &&
        !(Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && target.item.isGem()))) return;
    const itemName = target.itemName();
    target.pbRemoveItem();
    await this.battle.pbDisplay(_INTL("{1}'s {2} was incinerated!", target.pbThis(), itemName));
  }
}
registerMoveClass("DestroyTargetBerryOrGem", DestroyTargetBerryOrGem);

//===============================================================================
// Negates the effect and usability of the target's held item for the rest of the
// battle (even if it is switched out). Fails if the target doesn't have a held
// item, the item is unlosable, the target has Sticky Hold, or the target is
// behind a substitute. (Corrosive Gas)
//===============================================================================
export class CorrodeTargetItem extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.item || target.unlosableItem(target.item) ||
        target.effects[PBEffects.Substitute] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    if (target.hasActiveAbility("STICKYHOLD") && !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1} is unaffected because of its {2}!",
            target.pbThis(true), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    if (this.battle.corrosiveGas[target.index % 2]![target.pokemonIndex]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    this.battle.corrosiveGas[target.index % 2]![target.pokemonIndex] = true;
    await this.battle.pbDisplay(_INTL("{1} corroded {2}'s {3}!",
      user.pbThis(), target.pbThis(true), target.itemName()));
  }
}
registerMoveClass("CorrodeTargetItem", CorrodeTargetItem);

//===============================================================================
// For 5 rounds, the target cannot use its held item, its held item has no
// effect, and no items can be used on it. (Embargo)
//===============================================================================
export class StartTargetCannotUseItem extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Embargo] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Embargo] = 5;
    await this.battle.pbDisplay(_INTL("{1} can't use items anymore!", target.pbThis()));
  }
}
registerMoveClass("StartTargetCannotUseItem", StartTargetCannotUseItem);

//===============================================================================
// For 5 rounds, all held items cannot be used in any way and have no effect.
// Held items can still change hands, but can't be thrown. (Magic Room)
//===============================================================================
export class StartNegateHeldItems extends Move {
  override async pbEffectGeneral(_user: Battler): Promise<void> {
    if (this.battle.field.effects[PBEffects.MagicRoom] > 0) {
      this.battle.field.effects[PBEffects.MagicRoom] = 0;
      await this.battle.pbDisplay(_INTL("The area returned to normal!"));
    } else {
      this.battle.field.effects[PBEffects.MagicRoom] = 5;
      await this.battle.pbDisplay(_INTL("It created a bizarre area in which Pokémon's held items lose their effects!"));
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.battle.field.effects[PBEffects.MagicRoom] > 0) return; // No animation
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("StartNegateHeldItems", StartNegateHeldItems);

//===============================================================================
// The user consumes its held berry and gains its effect. Also, increases the
// user's Defense by 2 stages. The berry can be consumed even if Unnerve/Magic
// Room apply. Fails if the user is not holding a berry. This move cannot be
// chosen to be used if the user is not holding a berry. (Stuff Cheeks)
//===============================================================================
export class UserConsumeBerryRaiseDefense2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 2];
  }

  override pbCanChooseMove(user: Battler, _commandPhase: boolean, _showMessages: false = false): boolean {
    const item = user.item;
    return !(!item || !item.isBerry() || !user.itemActive());
  }

  override async pbCanChooseMoveAsync(user: Battler, commandPhase: boolean, showMessages: boolean): Promise<boolean> {
    const item = user.item;
    if (!item || !item.isBerry() || !user.itemActive()) {
      if (showMessages) {
        const msg = _INTL("{1} can't use that move because it doesn't have a Berry!", user.pbThis());
        if (commandPhase) {
          await this.battle.pbDisplayPaused(msg);
        } else {
          await this.battle.pbDisplay(msg);
        }
      }
      return false;
    }
    return true;
  }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    // NOTE: Unnerve does not stop a Pokémon using this move.
    const item = user.item;
    if (!item || !item.isBerry() || !user.itemActive()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return super.pbMoveFailed(user, targets);
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await super.pbEffectGeneral(user);
    await this.battle.pbDisplay(_INTL("{1} ate its {2}!", user.pbThis(), user.itemName()));
    const item = user.item;
    await user.pbConsumeItem(true, false); // Don't trigger Symbiosis yet
    await user.pbHeldItemTriggerCheck(item, false);
  }
}
registerMoveClass("UserConsumeBerryRaiseDefense2", UserConsumeBerryRaiseDefense2);

//===============================================================================
// All Pokémon (except semi-invulnerable ones) consume their held berries and
// gain their effects. Berries can be consumed even if Unnerve/Magic Room apply.
// Fails if no Pokémon have a held berry. If this move would trigger an ability
// that negates the move, e.g. Lightning Rod, the bearer of that ability will
// have their ability triggered regardless of whether they are holding a berry,
// and they will not consume their berry. (Teatime)
// TODO: This isn't quite right for the messages shown when a berry is consumed.
//===============================================================================
export class AllBattlersConsumeBerry extends Move {
  override async pbMoveFailed(_user: Battler, targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (const b of targets) {
      if (!b.item || !b.item.isBerry()) continue;
      if (b.semiInvulnerable()) continue;
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("But nothing happened!"));
      return true;
    }
    return false;
  }

  override async pbOnStartUse(_user: Battler, _targets: Battler[]): Promise<void> {
    await this.battle.pbDisplay(_INTL("It's teatime! Everyone dug in to their Berries!"));
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    if (!target.item || !target.item.isBerry() || target.semiInvulnerable()) return true;
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    await this.battle.pbCommonAnimation("EatBerry", target);
    const item = target.item;
    await target.pbConsumeItem(true, false); // Don't trigger Symbiosis yet
    await target.pbHeldItemTriggerCheck(item, false);
  }
}
registerMoveClass("AllBattlersConsumeBerry", AllBattlersConsumeBerry);

//===============================================================================
// User consumes target's berry and gains its effect. (Bug Bite, Pluck)
//===============================================================================
export class UserConsumeTargetBerry extends Move {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (user.fainted() || target.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    if (!target.item || !target.item.isBerry()) return;
    if (target.hasActiveAbility("STICKYHOLD") && !this.battle.moldBreaker) return;
    const item = target.item;
    const itemName = target.itemName();
    target.pbRemoveItem();
    await this.battle.pbDisplay(_INTL("{1} stole and ate its target's {2}!", user.pbThis(), itemName));
    await user.pbHeldItemTriggerCheck(item, false);
  }
}
registerMoveClass("UserConsumeTargetBerry", UserConsumeTargetBerry);

//===============================================================================
// User flings its item at the target. Power/effect depend on the item. (Fling)
//===============================================================================
export class ThrowUserItemAtTarget extends Move {
  /** Ruby: @willFail (nil until pbCheckFlingSuccess runs). */
  willFail: boolean | null = null;

  pbCheckFlingSuccess(user: Battler): void {
    this.willFail = false;
    if (!user.item || !user.itemActive() || user.unlosableItem(user.item)) this.willFail = true;
    if (this.willFail) return;
    if (user.item!.isBerry() && !user.canConsumeBerry()) this.willFail = true;
    if (this.willFail) return;
    this.willFail = !user.item!.flags.some((f) => /^Fling_/i.test(f));
  }

  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.willFail) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbDisplayUseMessage(user: Battler): Promise<void> {
    await super.pbDisplayUseMessage(user);
    this.pbCheckFlingSuccess(user);
    if (!this.willFail) {
      await this.battle.pbDisplay(_INTL("{1} flung its {2}!", user.pbThis(), user.itemName()));
    }
  }

  override pbNumHits(_user: Battler, _targets: Battler[]): number { return 1; }

  override pbBaseDamage(_baseDmg: number, user: Battler, _target: Battler): number {
    if (!user.item) return 0;
    for (const flag of user.item.flags) {
      const m = /^Fling_(\d+)$/i.exec(flag);
      if (m) return Math.max(parseInt(m[1]!, 10), 10);
    }
    return 10;
  }

  /** Generation 9 Pack (redefined): Covert Cloak blocks the flung item's effect. */
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.hasActiveItem("COVERTCLOAK")) return;
    if (target.hasActiveAbility("SHIELDDUST") && !this.battle.moldBreaker) return;
    switch (user.itemId) {
      case "POISONBARB":
        if (target.pbCanPoison(user, false, this)) await target.pbPoison(user);
        break;
      case "TOXICORB":
        if (target.pbCanPoison(user, false, this)) await target.pbPoison(user, null, true);
        break;
      case "FLAMEORB":
        if (target.pbCanBurn(user, false, this)) await target.pbBurn(user);
        break;
      case "LIGHTBALL":
        if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user);
        break;
      case "KINGSROCK":
      case "RAZORFANG":
        target.pbFlinch(user);
        break;
      default:
        await target.pbHeldItemTriggerCheck(user.item, true);
        break;
    }
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], _numHits: number,
    _switchedBattlers: number[]): Promise<void> {
    // NOTE: The item is consumed even if this move was Protected against or it
    //       missed. The item is not consumed if the target was switched out by
    //       an effect like a target's Red Card.
    // NOTE: There is no item consumption animation.
    if (user.item) await user.pbConsumeItem(true, true, false);
  }
}
registerMoveClass("ThrowUserItemAtTarget", ThrowUserItemAtTarget);
