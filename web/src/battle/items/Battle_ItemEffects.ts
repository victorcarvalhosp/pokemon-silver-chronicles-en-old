// Port of the held item handlers (every Battle::ItemEffects::X.add/.copy call) in
//   Data/Scripts/011_Battle/006_Other battle code/009_Battle_ItemEffects.rb
// in Ruby's order and with its section comments. The registries and trigger
// functions are in ../other/ItemEffects.ts.
// The plugins' handlers (Generation 9 Pack's [004] Items, ZUD Mechanics'
// Override_Items.rb) are registered by later files of this folder, which
// replace some of these, as in Ruby.
//
// Handlers receive the item ID first. Handlers of the async triggers (see the
// header of ../other/ItemEffects.ts) are async and await every message,
// animation, HP and stat change; the others (SpeedCalc, damage/accuracy/critical
// calculation, Exp/EV gain, weather/terrain duration, ...) are synchronous.
// Ruby's `next` with no value returns undefined (the trigger then returns its
// default). The multiplier hashes use Ruby's symbol names as keys
// (mults.base_damage_multiplier, mods.accuracy_multiplier); their values are
// Floats in Ruby, so the multiplications here are float ops, while HP amounts
// (totalhp / 4, ...) are Integer divisions (Math.floor).
//
// Ruby bugs kept for parity:
// - Micle Berry (Ruby line 350) checks `!battler.effects[PBEffects::MicleBerry]`
//   where it means the opposite, so it never triggers unless the effect is
//   already set.
// - Jaboca/Rowap Berry (Ruby lines 1321-1328, 1391-1398) refer to `battler`,
//   which isn't defined in those procs, so they raise a NameError once their
//   checks pass (see rubyUndefinedLocal).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Effectiveness } from "../../data/gameData/type";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { Scene } from "../BattleSceneInterface";
import { type Move, MoveClasses } from "../move/Move";
import type { AccuracyModifiers } from "../other/AbilityEffects";
import { type DamageMultipliers, ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";

/**
 * Ruby's NameError, raised by a proc that reads a local variable that doesn't
 * exist (`undefined local variable or method 'name' for main:Object`).
 */
export class RubyNameError extends Error {
  constructor(name: string) {
    super(`undefined local variable or method \`${name}' for main:Object`);
    this.name = "NameError";
  }
}

/** Evaluating an undefined local variable in a Ruby proc: always raises NameError. */
function rubyUndefinedLocal(name: string): Battler {
  throw new RubyNameError(name);
}

//===============================================================================
// SpeedCalc handlers
//===============================================================================

ItemEffects.SpeedCalc.add("CHOICESCARF",
  (_item: Id, _battler: Battler, mult: number) => {
    return mult * 1.5;
  },
);

ItemEffects.SpeedCalc.add("MACHOBRACE",
  (_item: Id, _battler: Battler, mult: number) => {
    return mult / 2;
  },
);

ItemEffects.SpeedCalc.copy("MACHOBRACE", "POWERANKLET", "POWERBAND",
  "POWERBELT", "POWERBRACER",
  "POWERLENS", "POWERWEIGHT");

ItemEffects.SpeedCalc.add("QUICKPOWDER",
  (_item: Id, battler: Battler, mult: number) => {
    if (battler.isSpecies("DITTO") &&
        !battler.effects[PBEffects.Transform]) return mult * 2;
  },
);

ItemEffects.SpeedCalc.add("IRONBALL",
  (_item: Id, _battler: Battler, mult: number) => {
    return mult / 2;
  },
);

//===============================================================================
// WeightCalc handlers
//===============================================================================

ItemEffects.WeightCalc.add("FLOATSTONE",
  (_item: Id, _battler: Battler, w: number) => {
    return Math.max(Math.floor(w / 2), 1);
  },
);

//===============================================================================
// HPHeal handlers
//===============================================================================

ItemEffects.HPHeal.add("AGUAVBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbConfusionBerry(item, forced, 4,
      _INTL("For {1}, the {2} was too bitter!", battler.pbThis(true), Item.get(item).name),
    );
  },
);

ItemEffects.HPHeal.add("APICOTBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbStatIncreasingBerry(item, forced, "SPECIAL_DEFENSE");
  },
);

ItemEffects.HPHeal.add("BERRYJUICE",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!battler.canHeal()) return false;
    if (!forced && battler.hp > Math.floor(battler.totalhp / 2)) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] Forced consuming of ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("UseItem", battler);
    await battler.pbRecoverHP(20);
    if (forced) {
      await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} restored its health using its {2}!", battler.pbThis(), itemName));
    }
    return true;
  },
);

ItemEffects.HPHeal.add("FIGYBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbConfusionBerry(item, forced, 0,
      _INTL("For {1}, the {2} was too spicy!", battler.pbThis(true), Item.get(item).name),
    );
  },
);

ItemEffects.HPHeal.add("GANLONBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbStatIncreasingBerry(item, forced, "DEFENSE");
  },
);

ItemEffects.HPHeal.add("IAPAPABERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbConfusionBerry(item, forced, 1,
      _INTL("For {1}, the {2} was too sour!", battler.pbThis(true), Item.get(item).name),
    );
  },
);

ItemEffects.HPHeal.add("LANSATBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumePinchBerry()) return false;
    if (battler.effects[PBEffects.FocusEnergy] >= 2) return false;
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    battler.effects[PBEffects.FocusEnergy] = 2;
    const itemName = Item.get(item).name;
    if (forced) {
      await battle.pbDisplay(_INTL("{1} got pumped from the {2}!", battler.pbThis(), itemName));
    } else {
      await battle.pbDisplay(_INTL("{1} used its {2} to get pumped!", battler.pbThis(), itemName));
    }
    return true;
  },
);

ItemEffects.HPHeal.add("LIECHIBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbStatIncreasingBerry(item, forced, "ATTACK");
  },
);

ItemEffects.HPHeal.add("MAGOBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbConfusionBerry(item, forced, 2,
      _INTL("For {1}, the {2} was too sweet!", battler.pbThis(true), Item.get(item).name),
    );
  },
);

ItemEffects.HPHeal.add("MICLEBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumePinchBerry()) return false;
    // NOTE: Ruby bug kept for parity: this returns false unless the effect is
    //       already set, so Micle Berry never triggers.
    if (!battler.effects[PBEffects.MicleBerry]) return false;
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    battler.effects[PBEffects.MicleBerry] = true;
    const itemName = Item.get(item).name;
    if (forced) {
      PBDebug.log(`[Item triggered] Forced consuming of ${itemName}`);
      await battle.pbDisplay(_INTL("{1} boosted the accuracy of its next move!", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} boosted the accuracy of its next move using its {2}!",
        battler.pbThis(), itemName));
    }
    return true;
  },
);

ItemEffects.HPHeal.add("ORANBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!battler.canHeal()) return false;
    if (!forced && !battler.canConsumePinchBerry(false)) return false;
    let amt = 10;
    let ripening = false;
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    await battler.pbRecoverHP(amt);
    const itemName = Item.get(item).name;
    if (forced) {
      PBDebug.log(`[Item triggered] Forced consuming of ${itemName}`);
      await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} restored a little HP using its {2}!", battler.pbThis(), itemName));
    }
    return true;
  },
);

ItemEffects.HPHeal.add("PETAYABERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbStatIncreasingBerry(item, forced, "SPECIAL_ATTACK");
  },
);

ItemEffects.HPHeal.add("SALACBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbStatIncreasingBerry(item, forced, "SPEED");
  },
);

ItemEffects.HPHeal.add("SITRUSBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!battler.canHeal()) return false;
    if (!forced && !battler.canConsumePinchBerry(false)) return false;
    let amt = Math.floor(battler.totalhp / 4);
    let ripening = false;
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    await battler.pbRecoverHP(amt);
    const itemName = Item.get(item).name;
    if (forced) {
      PBDebug.log(`[Item triggered] Forced consuming of ${itemName}`);
      await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} restored its health using its {2}!", battler.pbThis(), itemName));
    }
    return true;
  },
);

ItemEffects.HPHeal.add("STARFBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    const stats: Id[] = [];
    for (const s of Stat.eachMainBattle()) {
      if (await battler.pbCanRaiseStatStage(s.id, battler)) stats.push(s.id);
    }
    if (stats.length === 0) return false;
    const stat = stats[battle.pbRandom(stats.length)]!;
    return battler.pbStatIncreasingBerry(item, forced, stat, 2);
  },
);

ItemEffects.HPHeal.add("WIKIBERRY",
  async (item: Id, battler: Battler, _battle: Battle, forced: boolean) => {
    return battler.pbConfusionBerry(item, forced, 3,
      _INTL("For {1}, the {2} was too dry!", battler.pbThis(true), Item.get(item).name),
    );
  },
);

//===============================================================================
// OnStatLoss handlers
//===============================================================================
ItemEffects.OnStatLoss.add("EJECTPACK",
  async (_item: Id, battler: Battler, moveUser: Battler | null, battle: Battle) => {
    if (battler.effects[PBEffects.SkyDrop] >= 0 ||
        battler.inTwoTurnAttack("TwoTurnAttackInvulnerableInSkyTargetCannotAct")) return false; // Sky Drop
    if (battle.pbAllFainted(battler.idxOpposingSide())) return false;
    if (battler.wild()) return false; // Wild Pokémon can't eject
    if (!battle.pbCanSwitch(battler.index)) return false; // Battler can't switch out
    if (!battle.pbCanChooseNonActive(battler.index)) return false; // No Pokémon can switch in
    await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1} is switched out by the {2}!", battler.pbThis(), battler.itemName()));
    await battler.pbConsumeItem(true, false);
    if (battle.endOfRound) { // Just switch out
      if (!battler.fainted()) await battle.scene.pbRecall(battler.index);
      await battler.pbAbilitiesOnSwitchOut(); // Inc. primordial weather check
      return true;
    }
    const newPkmn = await battle.pbGetReplacementPokemonIndex(battler.index); // Owner chooses
    if (newPkmn < 0) return false; // Shouldn't ever do this
    await battle.pbRecallAndReplace(battler.index, newPkmn);
    battle.pbClearChoice(battler.index); // Replacement Pokémon does nothing this round
    if (moveUser && battler.index === moveUser.index) battle.moldBreaker = false;
    await battle.pbOnBattlerEnteringBattle(battler.index);
    return true;
  },
);

//===============================================================================
// StatusCure handlers
//===============================================================================

ItemEffects.StatusCure.add("ASPEARBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status !== "FROZEN") return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(_INTL("{1}'s {2} defrosted it!", battler.pbThis(), itemName));
    return true;
  },
);

ItemEffects.StatusCure.add("CHERIBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status !== "PARALYSIS") return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(_INTL("{1}'s {2} cured its paralysis!", battler.pbThis(), itemName));
    return true;
  },
);

ItemEffects.StatusCure.add("CHESTOBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status !== "SLEEP") return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(_INTL("{1}'s {2} woke it up!", battler.pbThis(), itemName));
    return true;
  },
);

ItemEffects.StatusCure.add("LUMBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status === "NONE" &&
        battler.effects[PBEffects.Confusion] === 0) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    const oldStatus = battler.status;
    const oldConfusion = (battler.effects[PBEffects.Confusion] > 0);
    await battler.pbCureStatus(forced);
    battler.pbCureConfusion();
    if (forced) {
      if (oldConfusion) await battle.pbDisplay(_INTL("{1} snapped out of its confusion.", battler.pbThis()));
    } else {
      switch (oldStatus) {
        case "SLEEP":
          await battle.pbDisplay(_INTL("{1}'s {2} woke it up!", battler.pbThis(), itemName));
          break;
        case "POISON":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its poisoning!", battler.pbThis(), itemName));
          break;
        case "BURN":
          await battle.pbDisplay(_INTL("{1}'s {2} healed its burn!", battler.pbThis(), itemName));
          break;
        case "PARALYSIS":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its paralysis!", battler.pbThis(), itemName));
          break;
        case "FROZEN":
          await battle.pbDisplay(_INTL("{1}'s {2} defrosted it!", battler.pbThis(), itemName));
          break;
      }
      if (oldConfusion) {
        await battle.pbDisplay(_INTL("{1}'s {2} snapped it out of its confusion!", battler.pbThis(), itemName));
      }
    }
    return true;
  },
);

ItemEffects.StatusCure.add("MENTALHERB",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (battler.effects[PBEffects.Attract] === -1 &&
        battler.effects[PBEffects.Taunt] === 0 &&
        battler.effects[PBEffects.Encore] === 0 &&
        !battler.effects[PBEffects.Torment] &&
        battler.effects[PBEffects.Disable] === 0 &&
        battler.effects[PBEffects.HealBlock] === 0) return false;
    const itemName = Item.get(item).name;
    PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("UseItem", battler);
    if (battler.effects[PBEffects.Attract] >= 0) {
      if (forced) {
        await battle.pbDisplay(_INTL("{1} got over its infatuation.", battler.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1} cured its infatuation status using its {2}!",
          battler.pbThis(), itemName));
      }
      battler.pbCureAttract();
    }
    if (battler.effects[PBEffects.Taunt] > 0) await battle.pbDisplay(_INTL("{1}'s taunt wore off!", battler.pbThis()));
    battler.effects[PBEffects.Taunt] = 0;
    if (battler.effects[PBEffects.Encore] > 0) await battle.pbDisplay(_INTL("{1}'s encore ended!", battler.pbThis()));
    battler.effects[PBEffects.Encore] = 0;
    battler.effects[PBEffects.EncoreMove] = null;
    if (battler.effects[PBEffects.Torment]) await battle.pbDisplay(_INTL("{1}'s torment wore off!", battler.pbThis()));
    battler.effects[PBEffects.Torment] = false;
    if (battler.effects[PBEffects.Disable] > 0) await battle.pbDisplay(_INTL("{1} is no longer disabled!", battler.pbThis()));
    battler.effects[PBEffects.Disable] = 0;
    if (battler.effects[PBEffects.HealBlock] > 0) await battle.pbDisplay(_INTL("{1}'s Heal Block wore off!", battler.pbThis()));
    battler.effects[PBEffects.HealBlock] = 0;
    return true;
  },
);

ItemEffects.StatusCure.add("PECHABERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status !== "POISON") return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(_INTL("{1}'s {2} cured its poisoning!", battler.pbThis(), itemName));
    return true;
  },
);

ItemEffects.StatusCure.add("PERSIMBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.effects[PBEffects.Confusion] === 0) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    battler.pbCureConfusion();
    if (forced) {
      await battle.pbDisplay(_INTL("{1} snapped out of its confusion.", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1}'s {2} snapped it out of its confusion!", battler.pbThis(),
        itemName));
    }
    return true;
  },
);

ItemEffects.StatusCure.add("RAWSTBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (battler.status !== "BURN") return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    await battler.pbCureStatus(forced);
    if (!forced) await battle.pbDisplay(_INTL("{1}'s {2} healed its burn!", battler.pbThis(), itemName));
    return true;
  },
);

//===============================================================================
// PriorityBracketChange handlers
//===============================================================================

ItemEffects.PriorityBracketChange.add("CUSTAPBERRY",
  (_item: Id, battler: Battler, _battle: Battle) => {
    if (battler.canConsumePinchBerry()) return 1;
  },
);

ItemEffects.PriorityBracketChange.add("LAGGINGTAIL",
  (_item: Id, _battler: Battler, _battle: Battle) => {
    return -1;
  },
);

ItemEffects.PriorityBracketChange.copy("LAGGINGTAIL", "FULLINCENSE");

ItemEffects.PriorityBracketChange.add("QUICKCLAW",
  (_item: Id, _battler: Battler, battle: Battle) => {
    if (battle.pbRandom(100) < 20) return 1;
  },
);

//===============================================================================
// PriorityBracketUse handlers
//===============================================================================

ItemEffects.PriorityBracketUse.add("CUSTAPBERRY",
  async (_item: Id, battler: Battler, battle: Battle) => {
    await battle.pbCommonAnimation("EatBerry", battler);
    await battle.pbDisplay(_INTL("{1}'s {2} let it move first!", battler.pbThis(), battler.itemName()));
    await battler.pbConsumeItem();
  },
);

ItemEffects.PriorityBracketUse.add("QUICKCLAW",
  async (_item: Id, battler: Battler, battle: Battle) => {
    await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1}'s {2} let it move first!", battler.pbThis(), battler.itemName()));
  },
);

//===============================================================================
// OnMissingTarget handlers
//===============================================================================

ItemEffects.OnMissingTarget.add("BLUNDERPOLICY",
  async (item: Id, user: Battler, target: Battler, move: Move, hitNum: number, battle: Battle) => {
    if (hitNum > 0 || target.damageState.invulnerable) return;
    if (["OHKO", "OHKOIce", "OHKOHitsUndergroundTarget"].includes(move.function)) return;
    if (!await user.pbCanRaiseStatStage("SPEED", user)) return;
    await battle.pbCommonAnimation("UseItem", user);
    await user.pbRaiseStatStageByCause("SPEED", 2, user, user.itemName());
    await battle.pbDisplay(_INTL("The {1} was used up...", user.itemName()));
    await user.pbHeldItemTriggered(item);
  },
);

//===============================================================================
// AccuracyCalcFromUser handlers
//===============================================================================

ItemEffects.AccuracyCalcFromUser.add("WIDELENS",
  (_item: Id, mods: AccuracyModifiers, _user: Battler, _target: Battler, _move: Move, _type: Id) => {
    mods.accuracy_multiplier! *= 1.1;
  },
);

ItemEffects.AccuracyCalcFromUser.add("ZOOMLENS",
  (_item: Id, mods: AccuracyModifiers, _user: Battler, target: Battler, _move: Move, _type: Id) => {
    if ((target.battle.choices[target.index]![0] !== "UseMove" &&
         target.battle.choices[target.index]![0] !== "Shift") ||
        target.movedThisRound()) {
      mods.accuracy_multiplier! *= 1.2;
    }
  },
);

//===============================================================================
// AccuracyCalcFromTarget handlers
//===============================================================================

ItemEffects.AccuracyCalcFromTarget.add("BRIGHTPOWDER",
  (_item: Id, mods: AccuracyModifiers, _user: Battler, _target: Battler, _move: Move, _type: Id) => {
    mods.accuracy_multiplier! *= 0.9;
  },
);

ItemEffects.AccuracyCalcFromTarget.copy("BRIGHTPOWDER", "LAXINCENSE");

//===============================================================================
// DamageCalcFromUser handlers
//===============================================================================

type DamageCalcHandler = (item: Id, user: Battler, target: Battler, move: Move, mults: DamageMultipliers,
  baseDmg: number, type: Id) => void;
const DamageCalcFromUser = {
  add(item: Id, handler: DamageCalcHandler): void { ItemEffects.DamageCalcFromUser.add(item, handler); },
};
const DamageCalcFromTarget = {
  add(item: Id, handler: DamageCalcHandler): void { ItemEffects.DamageCalcFromTarget.add(item, handler); },
};

DamageCalcFromUser.add("ADAMANTORB",
  (_item, user, _target, _move, mults, _baseDmg, type) => {
    if (user.isSpecies("DIALGA") && ["DRAGON", "STEEL"].includes(type)) {
      mults.base_damage_multiplier! *= 1.2;
    }
  },
);

DamageCalcFromUser.add("BLACKBELT",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "FIGHTING") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("BLACKBELT", "FISTPLATE");

DamageCalcFromUser.add("BLACKGLASSES",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "DARK") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("BLACKGLASSES", "DREADPLATE");

DamageCalcFromUser.add("BUGGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("BUG", move, type, mults);
  },
);

DamageCalcFromUser.add("CHARCOAL",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "FIRE") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("CHARCOAL", "FLAMEPLATE");

DamageCalcFromUser.add("CHOICEBAND",
  (_item, _user, _target, move, mults, _baseDmg, _type) => {
    if (move.physicalMove()) mults.base_damage_multiplier! *= 1.5;
  },
);

DamageCalcFromUser.add("CHOICESPECS",
  (_item, _user, _target, move, mults, _baseDmg, _type) => {
    if (move.specialMove()) mults.base_damage_multiplier! *= 1.5;
  },
);

DamageCalcFromUser.add("DARKGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("DARK", move, type, mults);
  },
);

DamageCalcFromUser.add("DEEPSEATOOTH",
  (_item, user, _target, move, mults, _baseDmg, _type) => {
    if (user.isSpecies("CLAMPERL") && move.specialMove()) {
      mults.attack_multiplier! *= 2;
    }
  },
);

DamageCalcFromUser.add("DRAGONFANG",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "DRAGON") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("DRAGONFANG", "DRACOPLATE");

DamageCalcFromUser.add("DRAGONGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("DRAGON", move, type, mults);
  },
);

DamageCalcFromUser.add("ELECTRICGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("ELECTRIC", move, type, mults);
  },
);

DamageCalcFromUser.add("EXPERTBELT",
  (_item, _user, target, _move, mults, _baseDmg, _type) => {
    if (Effectiveness.superEffective(target.damageState.typeMod)) {
      mults.final_damage_multiplier! *= 1.2;
    }
  },
);

DamageCalcFromUser.add("FAIRYGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("FAIRY", move, type, mults);
  },
);

DamageCalcFromUser.add("FIGHTINGGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("FIGHTING", move, type, mults);
  },
);

DamageCalcFromUser.add("FIREGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("FIRE", move, type, mults);
  },
);

DamageCalcFromUser.add("FLYINGGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("FLYING", move, type, mults);
  },
);

DamageCalcFromUser.add("GHOSTGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("GHOST", move, type, mults);
  },
);

DamageCalcFromUser.add("GRASSGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("GRASS", move, type, mults);
  },
);

DamageCalcFromUser.add("GRISEOUSORB",
  (_item, user, _target, _move, mults, _baseDmg, type) => {
    if (user.isSpecies("GIRATINA") && ["DRAGON", "GHOST"].includes(type)) {
      mults.base_damage_multiplier! *= 1.2;
    }
  },
);

DamageCalcFromUser.add("GROUNDGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("GROUND", move, type, mults);
  },
);

DamageCalcFromUser.add("HARDSTONE",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "ROCK") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("HARDSTONE", "STONEPLATE", "ROCKINCENSE");

DamageCalcFromUser.add("ICEGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("ICE", move, type, mults);
  },
);

DamageCalcFromUser.add("LIFEORB",
  (_item, _user, _target, move, mults, _baseDmg, _type) => {
    const confusion = MoveClasses.get("Confusion");
    if (!(confusion && move instanceof confusion)) {
      mults.final_damage_multiplier! *= 1.3;
    }
  },
);

DamageCalcFromUser.add("LIGHTBALL",
  (_item, user, _target, _move, mults, _baseDmg, _type) => {
    if (user.isSpecies("PIKACHU")) {
      mults.attack_multiplier! *= 2;
    }
  },
);

DamageCalcFromUser.add("LUSTROUSORB",
  (_item, user, _target, _move, mults, _baseDmg, type) => {
    if (user.isSpecies("PALKIA") && ["DRAGON", "WATER"].includes(type)) {
      mults.base_damage_multiplier! *= 1.2;
    }
  },
);

DamageCalcFromUser.add("MAGNET",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "ELECTRIC") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("MAGNET", "ZAPPLATE");

DamageCalcFromUser.add("METALCOAT",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "STEEL") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("METALCOAT", "IRONPLATE");

DamageCalcFromUser.add("METRONOME",
  (_item, user, _target, _move, mults, _baseDmg, _type) => {
    const met = 1 + (0.2 * Math.min(user.effects[PBEffects.Metronome] as number, 5));
    mults.final_damage_multiplier! *= met;
  },
);

DamageCalcFromUser.add("MIRACLESEED",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "GRASS") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("MIRACLESEED", "MEADOWPLATE", "ROSEINCENSE");

DamageCalcFromUser.add("MUSCLEBAND",
  (_item, _user, _target, move, mults, _baseDmg, _type) => {
    if (move.physicalMove()) mults.base_damage_multiplier! *= 1.1;
  },
);

DamageCalcFromUser.add("MYSTICWATER",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "WATER") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("MYSTICWATER", "SPLASHPLATE", "SEAINCENSE", "WAVEINCENSE");

DamageCalcFromUser.add("NEVERMELTICE",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "ICE") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("NEVERMELTICE", "ICICLEPLATE");

DamageCalcFromUser.add("NORMALGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("NORMAL", move, type, mults);
  },
);

DamageCalcFromUser.add("PIXIEPLATE",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "FAIRY") mults.base_damage_multiplier! *= 1.2;
  },
);

DamageCalcFromUser.add("POISONBARB",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "POISON") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("POISONBARB", "TOXICPLATE");

DamageCalcFromUser.add("POISONGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("POISON", move, type, mults);
  },
);

DamageCalcFromUser.add("PSYCHICGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("PSYCHIC", move, type, mults);
  },
);

DamageCalcFromUser.add("ROCKGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("ROCK", move, type, mults);
  },
);

DamageCalcFromUser.add("SHARPBEAK",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "FLYING") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("SHARPBEAK", "SKYPLATE");

DamageCalcFromUser.add("SILKSCARF",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "NORMAL") mults.base_damage_multiplier! *= 1.2;
  },
);

DamageCalcFromUser.add("SILVERPOWDER",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "BUG") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("SILVERPOWDER", "INSECTPLATE");

DamageCalcFromUser.add("SOFTSAND",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "GROUND") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("SOFTSAND", "EARTHPLATE");

DamageCalcFromUser.add("SOULDEW",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    if (!user.isSpecies("LATIAS") && !user.isSpecies("LATIOS")) return;
    if (Settings.SOUL_DEW_POWERS_UP_TYPES) {
      if (["DRAGON", "PSYCHIC"].includes(type)) mults.final_damage_multiplier! *= 1.2;
    } else if (move.specialMove() && !user.battle.rules["souldewclause"]) {
      mults.attack_multiplier! *= 1.5;
    }
  },
);

DamageCalcFromUser.add("SPELLTAG",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "GHOST") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("SPELLTAG", "SPOOKYPLATE");

DamageCalcFromUser.add("STEELGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("STEEL", move, type, mults);
  },
);

DamageCalcFromUser.add("THICKCLUB",
  (_item, user, _target, move, mults, _baseDmg, _type) => {
    if ((user.isSpecies("CUBONE") || user.isSpecies("MAROWAK")) && move.physicalMove()) {
      mults.attack_multiplier! *= 2;
    }
  },
);

DamageCalcFromUser.add("TWISTEDSPOON",
  (_item, _user, _target, _move, mults, _baseDmg, type) => {
    if (type === "PSYCHIC") mults.base_damage_multiplier! *= 1.2;
  },
);

ItemEffects.DamageCalcFromUser.copy("TWISTEDSPOON", "MINDPLATE", "ODDINCENSE");

DamageCalcFromUser.add("WATERGEM",
  (_item, user, _target, move, mults, _baseDmg, type) => {
    user.pbMoveTypePoweringUpGem("WATER", move, type, mults);
  },
);

DamageCalcFromUser.add("WISEGLASSES",
  (_item, _user, _target, move, mults, _baseDmg, _type) => {
    if (move.specialMove()) mults.base_damage_multiplier! *= 1.1;
  },
);

//===============================================================================
// DamageCalcFromTarget handlers
// NOTE: Species-specific held items consider the original species, not the
//       transformed species, and still work while transformed. The exceptions
//       are Metal/Quick Powder, which don't work if the holder is transformed.
//===============================================================================

DamageCalcFromTarget.add("ASSAULTVEST",
  (_item, _user, _target, move, mults, _baseDmg, _type) => {
    if (move.specialMove()) mults.defense_multiplier! *= 1.5;
  },
);

DamageCalcFromTarget.add("BABIRIBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("STEEL", type, mults);
  },
);

DamageCalcFromTarget.add("CHARTIBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("ROCK", type, mults);
  },
);

DamageCalcFromTarget.add("CHILANBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("NORMAL", type, mults);
  },
);

DamageCalcFromTarget.add("CHOPLEBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("FIGHTING", type, mults);
  },
);

DamageCalcFromTarget.add("COBABERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("FLYING", type, mults);
  },
);

DamageCalcFromTarget.add("COLBURBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("DARK", type, mults);
  },
);

DamageCalcFromTarget.add("DEEPSEASCALE",
  (_item, _user, target, move, mults, _baseDmg, _type) => {
    if (target.isSpecies("CLAMPERL") && move.specialMove()) {
      mults.defense_multiplier! *= 2;
    }
  },
);

DamageCalcFromTarget.add("EVIOLITE",
  (_item, _user, target, _move, mults, _baseDmg, _type) => {
    // NOTE: Eviolite cares about whether the Pokémon itself can evolve, which
    //       means it also cares about the Pokémon's form. Some forms cannot
    //       evolve even if the species generally can, and such forms are not
    //       affected by Eviolite.
    if (target.pokemon!.speciesData().getEvolutions(true).length > 0) {
      mults.defense_multiplier! *= 1.5;
    }
  },
);

DamageCalcFromTarget.add("HABANBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("DRAGON", type, mults);
  },
);

DamageCalcFromTarget.add("KASIBBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("GHOST", type, mults);
  },
);

DamageCalcFromTarget.add("KEBIABERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("POISON", type, mults);
  },
);

DamageCalcFromTarget.add("METALPOWDER",
  (_item, _user, target, _move, mults, _baseDmg, _type) => {
    if (target.isSpecies("DITTO") && !target.effects[PBEffects.Transform]) {
      mults.defense_multiplier! *= 1.5;
    }
  },
);

DamageCalcFromTarget.add("OCCABERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("FIRE", type, mults);
  },
);

DamageCalcFromTarget.add("PASSHOBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("WATER", type, mults);
  },
);

DamageCalcFromTarget.add("PAYAPABERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("PSYCHIC", type, mults);
  },
);

DamageCalcFromTarget.add("RINDOBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("GRASS", type, mults);
  },
);

DamageCalcFromTarget.add("ROSELIBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("FAIRY", type, mults);
  },
);

DamageCalcFromTarget.add("SHUCABERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("GROUND", type, mults);
  },
);

DamageCalcFromTarget.add("SOULDEW",
  (_item, user, target, move, mults, _baseDmg, _type) => {
    if (Settings.SOUL_DEW_POWERS_UP_TYPES) return;
    if (!target.isSpecies("LATIAS") && !target.isSpecies("LATIOS")) return;
    if (move.specialMove() && !user.battle.rules["souldewclause"]) {
      mults.defense_multiplier! *= 1.5;
    }
  },
);

DamageCalcFromTarget.add("TANGABERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("BUG", type, mults);
  },
);

DamageCalcFromTarget.add("WACANBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("ELECTRIC", type, mults);
  },
);

DamageCalcFromTarget.add("YACHEBERRY",
  (_item, _user, target, _move, mults, _baseDmg, type) => {
    target.pbMoveTypeWeakeningBerry("ICE", type, mults);
  },
);

//===============================================================================
// CriticalCalcFromUser handlers
//===============================================================================

ItemEffects.CriticalCalcFromUser.add("LUCKYPUNCH",
  (_item: Id, user: Battler, _target: Battler, c: number) => {
    if (user.isSpecies("CHANSEY")) return c + 2;
  },
);

ItemEffects.CriticalCalcFromUser.add("RAZORCLAW",
  (_item: Id, _user: Battler, _target: Battler, c: number) => {
    return c + 1;
  },
);

ItemEffects.CriticalCalcFromUser.copy("RAZORCLAW", "SCOPELENS");

ItemEffects.CriticalCalcFromUser.add("LEEK",
  (_item: Id, user: Battler, _target: Battler, c: number) => {
    if (user.isSpecies("FARFETCHD") || user.isSpecies("SIRFETCHD")) return c + 2;
  },
);

ItemEffects.CriticalCalcFromUser.copy("LEEK", "STICK");

//===============================================================================
// CriticalCalcFromTarget handlers
//===============================================================================

// There aren't any!

//===============================================================================
// OnBeingHit handlers
//===============================================================================

ItemEffects.OnBeingHit.add("ABSORBBULB",
  async (item: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (move.calcType !== "WATER") return;
    if (!await target.pbCanRaiseStatStage("SPECIAL_ATTACK", target)) return;
    await battle.pbCommonAnimation("UseItem", target);
    await target.pbRaiseStatStageByCause("SPECIAL_ATTACK", 1, target, target.itemName());
    await target.pbHeldItemTriggered(item);
  },
);

ItemEffects.OnBeingHit.add("AIRBALLOON",
  async (_item: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
    await battle.pbDisplay(_INTL("{1}'s {2} popped!", target.pbThis(), target.itemName()));
    await target.pbConsumeItem(false, true);
    await target.pbSymbiosis();
  },
);

ItemEffects.OnBeingHit.add("CELLBATTERY",
  async (item: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (move.calcType !== "ELECTRIC") return;
    if (!await target.pbCanRaiseStatStage("ATTACK", target)) return;
    await battle.pbCommonAnimation("UseItem", target);
    await target.pbRaiseStatStageByCause("ATTACK", 1, target, target.itemName());
    await target.pbHeldItemTriggered(item);
  },
);

ItemEffects.OnBeingHit.add("ENIGMABERRY",
  async (item: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
    if (target.damageState.substitute ||
        target.damageState.disguise || target.damageState.iceFace) return;
    if (!Effectiveness.superEffective(target.damageState.typeMod)) return;
    if (await ItemEffects.triggerOnBeingHitPositiveBerry(item, target, battle, false)) {
      await target.pbHeldItemTriggered(item);
    }
  },
);

ItemEffects.OnBeingHit.add("JABOCABERRY",
  async (item: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (!target.canConsumeBerry()) return;
    if (!move.physicalMove()) return;
    if (!user.takesIndirectDamage()) return;
    let amt = Math.floor(user.totalhp / 8);
    let ripening = false;
    // NOTE: Ruby bug kept for parity: `battler` isn't defined in this proc
    //       (it means `target`), so this raises NameError.
    const battler = rubyUndefinedLocal("battler");
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler);
      amt *= 2;
      ripening = true;
    }
    await battle.pbCommonAnimation("EatBerry", target);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    await battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(amt, false);
    await battle.pbDisplay(_INTL("{1} consumed its {2} and hurt {3}!", target.pbThis(),
      target.itemName(), user.pbThis(true)));
    await target.pbHeldItemTriggered(item);
  },
);

// NOTE: Kee Berry supposedly shouldn't trigger if the user has Sheer Force, but
//       I'm ignoring this. Weakness Policy has the same kind of effect and
//       nowhere says it should be stopped by Sheer Force. I suspect this
//       stoppage is either a false report that no one ever corrected, or an
//       effect that later changed and wasn't noticed.
ItemEffects.OnBeingHit.add("KEEBERRY",
  async (item: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (!move.physicalMove()) return;
    if (await ItemEffects.triggerOnBeingHitPositiveBerry(item, target, battle, false)) {
      await target.pbHeldItemTriggered(item);
    }
  },
);

ItemEffects.OnBeingHit.add("LUMINOUSMOSS",
  async (item: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (move.calcType !== "WATER") return;
    if (!await target.pbCanRaiseStatStage("SPECIAL_DEFENSE", target)) return;
    await battle.pbCommonAnimation("UseItem", target);
    await target.pbRaiseStatStageByCause("SPECIAL_DEFENSE", 1, target, target.itemName());
    await target.pbHeldItemTriggered(item);
  },
);

// NOTE: Maranga Berry supposedly shouldn't trigger if the user has Sheer Force,
//       but I'm ignoring this. Weakness Policy has the same kind of effect and
//       nowhere says it should be stopped by Sheer Force. I suspect this
//       stoppage is either a false report that no one ever corrected, or an
//       effect that later changed and wasn't noticed.
ItemEffects.OnBeingHit.add("MARANGABERRY",
  async (item: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (!move.specialMove()) return;
    if (await ItemEffects.triggerOnBeingHitPositiveBerry(item, target, battle, false)) {
      await target.pbHeldItemTriggered(item);
    }
  },
);

ItemEffects.OnBeingHit.add("ROCKYHELMET",
  async (_item: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (!move.pbContactMove(user) || !user.affectedByContactEffect()) return;
    if (!user.takesIndirectDamage()) return;
    await battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(Math.floor(user.totalhp / 6), false);
    await battle.pbDisplay(_INTL("{1} was hurt by the {2}!", user.pbThis(), target.itemName()));
  },
);

ItemEffects.OnBeingHit.add("ROWAPBERRY",
  async (item: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (!target.canConsumeBerry()) return;
    if (!move.specialMove()) return;
    if (!user.takesIndirectDamage()) return;
    let amt = Math.floor(user.totalhp / 8);
    let ripening = false;
    // NOTE: Ruby bug kept for parity: `battler` isn't defined in this proc
    //       (it means `target`), so this raises NameError.
    const battler = rubyUndefinedLocal("battler");
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler);
      amt *= 2;
      ripening = true;
    }
    await battle.pbCommonAnimation("EatBerry", target);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    await battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(amt, false);
    await battle.pbDisplay(_INTL("{1} consumed its {2} and hurt {3}!", target.pbThis(),
      target.itemName(), user.pbThis(true)));
    await target.pbHeldItemTriggered(item);
  },
);

ItemEffects.OnBeingHit.add("SNOWBALL",
  async (item: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (move.calcType !== "ICE") return;
    if (!await target.pbCanRaiseStatStage("ATTACK", target)) return;
    await battle.pbCommonAnimation("UseItem", target);
    await target.pbRaiseStatStageByCause("ATTACK", 1, target, target.itemName());
    await target.pbHeldItemTriggered(item);
  },
);

ItemEffects.OnBeingHit.add("STICKYBARB",
  async (_item: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
    if (!move.pbContactMove(user) || !user.affectedByContactEffect()) return;
    if (user.fainted() || user.item) return;
    user.item = target.item;
    target.item = null;
    if (target.hasActiveAbility("UNBURDEN")) target.effects[PBEffects.Unburden] = true;
    if (battle.wildBattle() && !user.opposes() &&
        !user.initialItem() && user.itemId === target.initialItem()) {
      user.setInitialItem(user.item);
      target.setInitialItem(null);
    }
    await battle.pbDisplay(_INTL("{1}'s {2} was transferred to {3}!",
      target.pbThis(), user.itemName(), user.pbThis(true)));
  },
);

ItemEffects.OnBeingHit.add("WEAKNESSPOLICY",
  async (item: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
    if (target.damageState.disguise || target.damageState.iceFace) return;
    if (!Effectiveness.superEffective(target.damageState.typeMod)) return;
    if (!await target.pbCanRaiseStatStage("ATTACK", target) &&
        !await target.pbCanRaiseStatStage("SPECIAL_ATTACK", target)) return;
    await battle.pbCommonAnimation("UseItem", target);
    let showAnim = true;
    if (await target.pbCanRaiseStatStage("ATTACK", target)) {
      await target.pbRaiseStatStageByCause("ATTACK", 2, target, target.itemName(), showAnim);
      showAnim = false;
    }
    if (await target.pbCanRaiseStatStage("SPECIAL_ATTACK", target)) {
      await target.pbRaiseStatStageByCause("SPECIAL_ATTACK", 2, target, target.itemName(), showAnim);
    }
    await battle.pbDisplay(_INTL("The {1} was used up...", target.itemName()));
    await target.pbHeldItemTriggered(item);
  },
);

//===============================================================================
// OnBeingHitPositiveBerry handlers
// NOTE: This is for berries that have an effect when Pluck/Bug Bite/Fling
//       forces their use.
//===============================================================================

ItemEffects.OnBeingHitPositiveBerry.add("ENIGMABERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!battler.canHeal()) return false;
    if (!forced && !battler.canConsumeBerry()) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    let amt = Math.floor(battler.totalhp / 4);
    let ripening = false;
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    await battler.pbRecoverHP(amt);
    if (forced) {
      await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} restored its health using its {2}!", battler.pbThis(), itemName));
    }
    return true;
  },
);

ItemEffects.OnBeingHitPositiveBerry.add("KEEBERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (!await battler.pbCanRaiseStatStage("DEFENSE", battler)) return false;
    const itemName = Item.get(item).name;
    let amt = 1;
    let ripening = false;
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    if (!forced) return battler.pbRaiseStatStageByCause("DEFENSE", amt, battler, itemName);
    PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    return battler.pbRaiseStatStage("DEFENSE", amt, battler);
  },
);

ItemEffects.OnBeingHitPositiveBerry.add("MARANGABERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    if (!await battler.pbCanRaiseStatStage("SPECIAL_DEFENSE", battler)) return false;
    const itemName = Item.get(item).name;
    let amt = 1;
    let ripening = false;
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    if (!forced) return battler.pbRaiseStatStageByCause("SPECIAL_DEFENSE", amt, battler, itemName);
    PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    return battler.pbRaiseStatStage("SPECIAL_DEFENSE", amt, battler);
  },
);

//===============================================================================
// AfterMoveUseFromTarget handlers
//===============================================================================

ItemEffects.AfterMoveUseFromTarget.add("EJECTBUTTON",
  async (_item: Id, battler: Battler, user: Battler, _move: Move, switchedBattlers: number[], battle: Battle) => {
    if (switchedBattlers.length > 0) return;
    if (battle.pbAllFainted(battler.idxOpposingSide())) return;
    if (!battle.pbCanChooseNonActive(battler.index)) return;
    await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1} is switched out with the {2}!", battler.pbThis(), battler.itemName()));
    await battler.pbConsumeItem(true, false);
    const newPkmn = await battle.pbGetReplacementPokemonIndex(battler.index); // Owner chooses
    if (newPkmn < 0) return;
    await battle.pbRecallAndReplace(battler.index, newPkmn);
    battle.pbClearChoice(battler.index); // Replacement Pokémon does nothing this round
    switchedBattlers.push(battler.index);
    if (battler.index === user.index) battle.moldBreaker = false;
    await battle.pbOnBattlerEnteringBattle(battler.index);
  },
);

ItemEffects.AfterMoveUseFromTarget.add("REDCARD",
  async (_item: Id, battler: Battler, user: Battler, _move: Move, switchedBattlers: number[], battle: Battle) => {
    if (switchedBattlers.length > 0 || user.fainted()) return;
    const newPkmn = await battle.pbGetReplacementPokemonIndex(user.index, true); // Random
    if (newPkmn < 0) return;
    await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1} held up its {2} against {3}!",
      battler.pbThis(), battler.itemName(), user.pbThis(true)));
    await battler.pbConsumeItem();
    if (user.hasActiveAbility("SUCTIONCUPS") && !battle.moldBreaker) {
      await battle.pbShowAbilitySplash(user);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1} anchors itself!", user.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1} anchors itself with {2}!", user.pbThis(), user.abilityName()));
      }
      await battle.pbHideAbilitySplash(user);
      return;
    }
    if (user.effects[PBEffects.Ingrain]) {
      await battle.pbDisplay(_INTL("{1} anchored itself with its roots!", user.pbThis()));
      return;
    }
    await battle.pbRecallAndReplace(user.index, newPkmn, true);
    await battle.pbDisplay(_INTL("{1} was dragged out!", user.pbThis()));
    battle.pbClearChoice(user.index); // Replacement Pokémon does nothing this round
    switchedBattlers.push(user.index);
    battle.moldBreaker = false;
    await battle.pbOnBattlerEnteringBattle(user.index);
  },
);

//===============================================================================
// AfterMoveUseFromUser handlers
//===============================================================================

ItemEffects.AfterMoveUseFromUser.add("LIFEORB",
  async (_item: Id, user: Battler, targets: Battler[], move: Move, numHits: number, battle: Battle) => {
    if (!user.takesIndirectDamage()) return;
    if (!move.pbDamagingMove() || numHits === 0) return;
    let hitBattler = false;
    for (const b of targets) {
      if (!b.damageState.unaffected && !b.damageState.substitute) hitBattler = true;
      if (hitBattler) break;
    }
    if (!hitBattler) return;
    PBDebug.log(`[Item triggered] ${user.pbThis()}'s ${user.itemName()} (recoil)`);
    await user.pbReduceHP(Math.floor(user.totalhp / 10));
    await battle.pbDisplay(_INTL("{1} lost some of its HP!", user.pbThis()));
    await user.pbItemHPHealCheck();
    if (user.fainted()) await user.pbFaint();
  },
);

// NOTE: In the official games, Shell Bell does not prevent Emergency Exit/Wimp
//       Out triggering even if Shell Bell heals the holder back to 50% HP or
//       more. Essentials ignores this exception.
ItemEffects.AfterMoveUseFromUser.add("SHELLBELL",
  async (_item: Id, user: Battler, targets: Battler[], _move: Move, _numHits: number, battle: Battle) => {
    if (!user.canHeal()) return;
    let totalDamage = 0;
    for (const b of targets) totalDamage += b.damageState.totalHPLost;
    if (totalDamage <= 0) return;
    await user.pbRecoverHP(Math.floor(totalDamage / 8));
    await battle.pbDisplay(_INTL("{1} restored a little HP using its {2}!",
      user.pbThis(), user.itemName()));
  },
);

ItemEffects.AfterMoveUseFromUser.add("THROATSPRAY",
  async (_item: Id, user: Battler, _targets: Battler[], move: Move, numHits: number, battle: Battle) => {
    if (battle.pbAllFainted(user.idxOwnSide()) ||
        battle.pbAllFainted(user.idxOpposingSide())) return;
    if (!move.soundMove() || numHits === 0) return;
    if (!await user.pbCanRaiseStatStage("SPECIAL_ATTACK", user)) return;
    await battle.pbCommonAnimation("UseItem", user);
    await user.pbRaiseStatStage("SPECIAL_ATTACK", 1, user);
    await user.pbConsumeItem();
  },
);

//===============================================================================
// OnEndOfUsingMove handlers
//===============================================================================

ItemEffects.OnEndOfUsingMove.add("LEPPABERRY",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!forced && !battler.canConsumeBerry()) return false;
    const foundEmptyMoves: number[] = [];
    const foundPartialMoves: number[] = [];
    battler.pokemon!.moves.forEach((move, i) => {
      if (move.totalPp <= 0 || move.pp === move.totalPp) return;
      if (move.pp === 0) foundEmptyMoves.push(i); else foundPartialMoves.push(i);
    });
    if (foundEmptyMoves.length === 0 && (!forced || foundPartialMoves.length === 0)) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    let amt = 10;
    let ripening = false;
    if (battler.hasActiveAbility("RIPEN")) {
      await battle.pbShowAbilitySplash(battler, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await battle.pbCommonAnimation("EatBerry", battler);
    if (ripening) await battle.pbHideAbilitySplash(battler);
    let choice = foundEmptyMoves[0];
    if (forced && choice == null) choice = foundPartialMoves[0];
    const pkmnMove = battler.pokemon!.moves[choice!]!;
    pkmnMove.pp += amt;
    if (pkmnMove.pp > pkmnMove.totalPp) pkmnMove.pp = pkmnMove.totalPp;
    battler.moves[choice!]!.pp = pkmnMove.pp;
    const moveName = pkmnMove.name;
    if (forced) {
      await battle.pbDisplay(_INTL("{1} restored its {2}'s PP.", battler.pbThis(), moveName));
    } else {
      await battle.pbDisplay(_INTL("{1}'s {2} restored its {3}'s PP!", battler.pbThis(), itemName, moveName));
    }
    return true;
  },
);

//===============================================================================
// OnEndOfUsingMoveStatRestore handlers
//===============================================================================

ItemEffects.OnEndOfUsingMoveStatRestore.add("WHITEHERB",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    let reducedStats = false;
    for (const s of Stat.eachBattle()) {
      if (battler.stages[s.id]! >= 0) continue;
      battler.stages[s.id] = 0;
      battler.statsRaisedThisRound = true;
      reducedStats = true;
    }
    if (!reducedStats) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] ${battler.pbThis()}'s ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("UseItem", battler);
    if (forced) {
      await battle.pbDisplay(_INTL("{1}'s status returned to normal!", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} returned its status to normal using its {2}!",
        battler.pbThis(), itemName));
    }
    return true;
  },
);

//===============================================================================
// ExpGainModifier handlers
//===============================================================================

ItemEffects.ExpGainModifier.add("LUCKYEGG",
  (_item: Id, _battler: Battler | null, exp: number) => {
    return Math.floor(exp * 3 / 2);
  },
);

//===============================================================================
// EVGainModifier handlers
//===============================================================================

ItemEffects.EVGainModifier.add("MACHOBRACE",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    for (const stat of Object.keys(evYield)) evYield[stat]! *= 2;
  },
);

ItemEffects.EVGainModifier.add("POWERANKLET",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    evYield.SPEED! += (Settings.MORE_EVS_FROM_POWER_ITEMS) ? 8 : 4;
  },
);

ItemEffects.EVGainModifier.add("POWERBAND",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    evYield.SPECIAL_DEFENSE! += (Settings.MORE_EVS_FROM_POWER_ITEMS) ? 8 : 4;
  },
);

ItemEffects.EVGainModifier.add("POWERBELT",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    evYield.DEFENSE! += (Settings.MORE_EVS_FROM_POWER_ITEMS) ? 8 : 4;
  },
);

ItemEffects.EVGainModifier.add("POWERBRACER",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    evYield.ATTACK! += (Settings.MORE_EVS_FROM_POWER_ITEMS) ? 8 : 4;
  },
);

ItemEffects.EVGainModifier.add("POWERLENS",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    evYield.SPECIAL_ATTACK! += (Settings.MORE_EVS_FROM_POWER_ITEMS) ? 8 : 4;
  },
);

ItemEffects.EVGainModifier.add("POWERWEIGHT",
  (_item: Id, _battler: Battler | null, evYield: Record<Id, number>) => {
    evYield.HP! += (Settings.MORE_EVS_FROM_POWER_ITEMS) ? 8 : 4;
  },
);

//===============================================================================
// WeatherExtender handlers
//===============================================================================

ItemEffects.WeatherExtender.add("DAMPROCK",
  (_item: Id, weather: Id, _duration: number, _battler: Battler, _battle: Battle) => {
    if (weather === "Rain") return 8;
  },
);

ItemEffects.WeatherExtender.add("HEATROCK",
  (_item: Id, weather: Id, _duration: number, _battler: Battler, _battle: Battle) => {
    if (weather === "Sun") return 8;
  },
);

ItemEffects.WeatherExtender.add("ICYROCK",
  (_item: Id, weather: Id, _duration: number, _battler: Battler, _battle: Battle) => {
    if (weather === "Hail") return 8;
  },
);

ItemEffects.WeatherExtender.add("SMOOTHROCK",
  (_item: Id, weather: Id, _duration: number, _battler: Battler, _battle: Battle) => {
    if (weather === "Sandstorm") return 8;
  },
);

//===============================================================================
// TerrainExtender handlers
//===============================================================================

ItemEffects.TerrainExtender.add("TERRAINEXTENDER",
  (_item: Id, _terrain: Id, _duration: number, _battler: Battler, _battle: Battle) => {
    return 8;
  },
);

//===============================================================================
// TerrainStatBoost handlers
//===============================================================================

ItemEffects.TerrainStatBoost.add("ELECTRICSEED",
  async (item: Id, battler: Battler, battle: Battle) => {
    if (battle.field.terrain !== "Electric") return false;
    if (!await battler.pbCanRaiseStatStage("DEFENSE", battler)) return false;
    const itemName = Item.get(item).name;
    await battle.pbCommonAnimation("UseItem", battler);
    return battler.pbRaiseStatStageByCause("DEFENSE", 1, battler, itemName);
  },
);

ItemEffects.TerrainStatBoost.add("GRASSYSEED",
  async (item: Id, battler: Battler, battle: Battle) => {
    if (battle.field.terrain !== "Grassy") return false;
    if (!await battler.pbCanRaiseStatStage("DEFENSE", battler)) return false;
    const itemName = Item.get(item).name;
    await battle.pbCommonAnimation("UseItem", battler);
    return battler.pbRaiseStatStageByCause("DEFENSE", 1, battler, itemName);
  },
);

ItemEffects.TerrainStatBoost.add("MISTYSEED",
  async (item: Id, battler: Battler, battle: Battle) => {
    if (battle.field.terrain !== "Misty") return false;
    if (!await battler.pbCanRaiseStatStage("SPECIAL_DEFENSE", battler)) return false;
    const itemName = Item.get(item).name;
    await battle.pbCommonAnimation("UseItem", battler);
    return battler.pbRaiseStatStageByCause("SPECIAL_DEFENSE", 1, battler, itemName);
  },
);

ItemEffects.TerrainStatBoost.add("PSYCHICSEED",
  async (item: Id, battler: Battler, battle: Battle) => {
    if (battle.field.terrain !== "Psychic") return false;
    if (!await battler.pbCanRaiseStatStage("SPECIAL_DEFENSE", battler)) return false;
    const itemName = Item.get(item).name;
    await battle.pbCommonAnimation("UseItem", battler);
    return battler.pbRaiseStatStageByCause("SPECIAL_DEFENSE", 1, battler, itemName);
  },
);

//===============================================================================
// EndOfRoundHealing handlers
//===============================================================================

ItemEffects.EndOfRoundHealing.add("BLACKSLUDGE",
  async (_item: Id, battler: Battler, battle: Battle) => {
    if (battler.pbHasType("POISON")) {
      if (!battler.canHeal()) return;
      await battle.pbCommonAnimation("UseItem", battler);
      await battler.pbRecoverHP(Math.floor(battler.totalhp / 16));
      await battle.pbDisplay(_INTL("{1} restored a little HP using its {2}!",
        battler.pbThis(), battler.itemName()));
    } else if (battler.takesIndirectDamage()) {
      await battle.pbCommonAnimation("UseItem", battler);
      await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 8), true, async (_hpLost) => {
        await battle.pbDisplay(_INTL("{1} is hurt by its {2}!", battler.pbThis(), battler.itemName()));
      });
    }
  },
);

ItemEffects.EndOfRoundHealing.add("LEFTOVERS",
  async (_item: Id, battler: Battler, battle: Battle) => {
    if (!battler.canHeal()) return;
    await battle.pbCommonAnimation("UseItem", battler);
    await battler.pbRecoverHP(Math.floor(battler.totalhp / 16));
    await battle.pbDisplay(_INTL("{1} restored a little HP using its {2}!",
      battler.pbThis(), battler.itemName()));
  },
);

//===============================================================================
// EndOfRoundEffect handlers
//===============================================================================

ItemEffects.EndOfRoundEffect.add("FLAMEORB",
  async (_item: Id, battler: Battler, _battle: Battle) => {
    if (!battler.pbCanBurn(battler, false)) return;
    await battler.pbBurn(null, _INTL("{1} was burned by the {2}!", battler.pbThis(), battler.itemName()));
  },
);

ItemEffects.EndOfRoundEffect.add("STICKYBARB",
  async (_item: Id, battler: Battler, battle: Battle) => {
    if (!battler.takesIndirectDamage()) return;
    await battle.scene.pbDamageAnimation(battler);
    await battler.pbTakeEffectDamage(Math.floor(battler.totalhp / 8), false, async (_hpLost) => {
      await battle.pbDisplay(_INTL("{1} is hurt by its {2}!", battler.pbThis(), battler.itemName()));
    });
  },
);

ItemEffects.EndOfRoundEffect.add("TOXICORB",
  async (_item: Id, battler: Battler, _battle: Battle) => {
    if (!battler.pbCanPoison(battler, false)) return;
    await battler.pbPoison(null, _INTL("{1} was badly poisoned by the {2}!",
      battler.pbThis(), battler.itemName()), true);
  },
);

//===============================================================================
// CertainSwitching handlers
//===============================================================================

ItemEffects.CertainSwitching.add("SHEDSHELL",
  (_item: Id, _battler: Battler, _battle: Battle) => {
    return true;
  },
);

//===============================================================================
// TrappingByTarget handlers
//===============================================================================

// There aren't any!

//===============================================================================
// OnSwitchIn handlers
//===============================================================================

ItemEffects.OnSwitchIn.add("AIRBALLOON",
  async (_item: Id, battler: Battler, battle: Battle) => {
    await battle.pbDisplay(_INTL("{1} floats in the air with its {2}!",
      battler.pbThis(), battler.itemName()));
  },
);

ItemEffects.OnSwitchIn.add("ROOMSERVICE",
  async (_item: Id, battler: Battler, battle: Battle) => {
    if (battle.field.effects[PBEffects.TrickRoom] === 0) return;
    if (!await battler.pbCanLowerStatStage("SPEED")) return;
    await battle.pbCommonAnimation("UseItem", battler);
    await battler.pbLowerStatStage("SPEED", 1, null);
    await battler.pbConsumeItem();
  },
);

//===============================================================================
// OnIntimidated handlers
//===============================================================================

ItemEffects.OnIntimidated.add("ADRENALINEORB",
  async (item: Id, battler: Battler, battle: Battle) => {
    if (!await battler.pbCanRaiseStatStage("SPEED", battler)) return false;
    const itemName = Item.get(item).name;
    await battle.pbCommonAnimation("UseItem", battler);
    return battler.pbRaiseStatStageByCause("SPEED", 1, battler, itemName);
  },
);

//===============================================================================
// CertainEscapeFromBattle handlers
//===============================================================================

ItemEffects.CertainEscapeFromBattle.add("SMOKEBALL",
  (_item: Id, _battler: Battler) => {
    return true;
  },
);
