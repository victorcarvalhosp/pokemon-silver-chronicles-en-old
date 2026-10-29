// Port of Plugins/ZUD Mechanics/[008] Overrides/Override_Items.rb: ZUD's
// replacements for some of 009_Battle_ItemEffects.rb's held item handlers
// (Battle_ItemEffects.ts). ZUD loads after the Generation 9 Pack, so its Red
// Card replaces the Gen 9 Pack's version too: import this file after both.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { type DamageMultipliers, ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";

//===============================================================================
// Berry Juice
//===============================================================================
// Healing isn't reduced while Dynamaxed.
//-------------------------------------------------------------------------------
ItemEffects.HPHeal.add("BERRYJUICE",
  async (item: Id, battler: Battler, battle: Battle, forced: boolean) => {
    if (!battler.canHeal()) return false;
    if (!forced && battler.hp > Math.floor(battler.totalhp / 2)) return false;
    const itemName = Item.get(item).name;
    if (forced) PBDebug.log(`[Item triggered] Forced consuming of ${itemName}`);
    if (!forced) await battle.pbCommonAnimation("UseItem", battler);
    battler.ignoreDynamax = true;
    await battler.pbRecoverHP(20);
    if (forced) {
      await battle.pbDisplay(_INTL("{1}'s HP was restored.", battler.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} restored its health using its {2}!", battler.pbThis(), itemName));
    }
    return true;
  },
);

//===============================================================================
// Oran Berry
//===============================================================================
// Healing isn't reduced while Dynamaxed.
//-------------------------------------------------------------------------------
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
    battler.ignoreDynamax = true;
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

//===============================================================================
// Shell Bell
//===============================================================================
// Healing isn't reduced while Dynamaxed.
//-------------------------------------------------------------------------------
ItemEffects.AfterMoveUseFromUser.add("SHELLBELL",
  async (_item: Id, user: Battler, targets: Battler[], _move: Move, _numHits: number, battle: Battle) => {
    if (!user.canHeal()) return;
    let totalDamage = 0;
    for (const b of targets) totalDamage += b.damageState.totalHPLost;
    if (totalDamage <= 0) return;
    user.ignoreDynamax = true;
    await user.pbRecoverHP(Math.floor(totalDamage / 8));
    await battle.pbDisplay(_INTL("{1} restored a little HP using its {2}!",
      user.pbThis(), user.itemName()));
  },
);

//===============================================================================
// Choice Items
//===============================================================================
// Stat bonuses are not applied to Z-Moves or while Dynamaxed.
//-------------------------------------------------------------------------------
ItemEffects.DamageCalcFromUser.add("CHOICEBAND",
  (_item: Id, _user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.physicalMove() && !move.powerMove()) mults.base_damage_multiplier! *= 1.5;
  },
);

ItemEffects.DamageCalcFromUser.add("CHOICESPECS",
  (_item: Id, _user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.specialMove() && !move.powerMove()) mults.base_damage_multiplier! *= 1.5;
  },
);

ItemEffects.SpeedCalc.add("CHOICESCARF",
  (_item: Id, battler: Battler, mult: number) => {
    if (!battler.dynamax()) return mult * 1.5;
  },
);

//===============================================================================
// Red Card
//===============================================================================
// Item triggers, but its effects fail to activate vs Dynamax targets.
//-------------------------------------------------------------------------------
ItemEffects.AfterMoveUseFromTarget.add("REDCARD",
  async (_item: Id, battler: Battler, user: Battler, _move: Move, switchedBattlers: number[], battle: Battle) => {
    if (switchedBattlers.length > 0 || user.fainted()) return;
    const newPkmn = await battle.pbGetReplacementPokemonIndex(user.index, true);
    if (newPkmn < 0) return;
    await battle.pbCommonAnimation("UseItem", battler);
    await battle.pbDisplay(_INTL("{1} held up its {2} against {3}!",
      battler.pbThis(), battler.itemName(), user.pbThis(true)));
    await battler.pbConsumeItem();
    if (user.dynamax()) {
      await battle.pbDisplay(_INTL("But it failed!"));
      return;
    }
    // defined?(PBEffects::Commander): always true here (Generation 9 Pack)
    if (user.effects[PBEffects.Commander]) return;
    if (user.hasActiveAbility(["SUCTIONCUPS", "GUARDDOG"]) && !battle.moldBreaker) {
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
    battle.pbClearChoice(user.index);
    switchedBattlers.push(user.index);
    battle.moldBreaker = false;
    await battle.pbOnBattlerEnteringBattle(user.index);
  },
);
