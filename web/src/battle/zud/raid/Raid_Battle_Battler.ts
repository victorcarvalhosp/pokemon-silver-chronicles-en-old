// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Battle_Battler.rb: the
// Battle::Battler additions for Max Raid battles. Ruby adds them as methods of
// every battler; they're functions of the battler here, called from where ZUD
// calls them in the core (pbInitRaidBoss from Battler_Initialize.ts,
// raid_SuccessCheck/raid_ShieldBreak from Battler_UseMoveSuccessChecks.ts,
// raid_UseBaseMoves from Battler_UseMove.ts, raid_KOCounter from
// Battler_ChangeSelf.ts), so the core needs no prototype set up by this folder.

import { G } from "../../../game/globals";
import type { BattleChoice } from "../../battle/Battle";
import type { Battler } from "../../battler/Battler";
import type { Move } from "../../move/Move";
import { pbSEPlay } from "../../audio";
import { PBDebug } from "../../other/PBDebug";
import { PBEffects } from "../../other/PBEffects";
import { _INTL } from "../../../data/gameData/gameData";
import { inMaxLair, pbDynamaxAdventure } from "./maxLairHooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DxHash = Record<string, any>;
const dxRules = () => (G.gameTemp.dxRules ?? {}) as DxHash;

//-----------------------------------------------------------------------------
// Initializes a Max Raid battler.
//-----------------------------------------------------------------------------
/** pbInitRaidBoss */
export function pbInitRaidBoss(battler: Battler): void {
  if (battler.battle.raidBattle && battler.opposes()) {
    const rules = dxRules();
    const e = battler.effects;
    e[PBEffects.MaxRaidBoss] = true;
    e[PBEffects.Dynamax] = rules.turns;
    e[PBEffects.RaidShield] = 0;
    e[PBEffects.MaxShieldHP] = rules.shield;
    e[PBEffects.KnockOutCount] = rules.kocount;
    e[PBEffects.ShieldCounter] = battler.level > 35 ? 2 : 1;
    if (inMaxLair()) {
      e[PBEffects.ShieldCounter] = 1;
      e[PBEffects.MaxShieldHP] = 5;
      e[PBEffects.KnockOutCount] = pbDynamaxAdventure().knockouts;
    }
  }
}

//-----------------------------------------------------------------------------
// Handles success checks for moves used in Max Raid battles.
//-----------------------------------------------------------------------------
/** raid_SuccessCheck(move, user, target) */
export async function raidSuccessCheck(battler: Battler, move: Move, user: Battler, target: Battler): Promise<boolean> {
  let ret = true;
  if (battler.battle.raidBattle) {
    //-------------------------------------------------------------------------
    // Max Raid Pokemon are immune to specified moves.
    //-------------------------------------------------------------------------
    if (target.effects[PBEffects.MaxRaidBoss]) {
      const functions = [
        "UserConsumeTargetBerry",  // Bug Bite/Pluck
        "DestroyTargetBerryOrGem", // Incinerate
        "RemoveTargetItem",        // Knock Off
        "FixedDamageHalfTargetHP", // Super Fang
      ];
      if (functions.includes(move.function) ||
          (user.pbHasType("GHOST") && move.function === "CurseTargetOrLowerUserSpd1RaiseUserAtkDef1")) { // Curse
        await battler.battle.pbDisplay(_INTL("But it failed!"));
        ret = false;
      }
    }
    //-------------------------------------------------------------------------
    // Specified moves fail when used by Max Raid Pokemon.
    //-------------------------------------------------------------------------
    if (user.effects[PBEffects.MaxRaidBoss]) {
      const functions = [
        "UserFaintsFixedDamageUserHP",    // Final Gambit
        "UserFaintsLowerTargetAtkSpAtk2", // Memento
        "AttackerFaintsIfUserFaints",     // Destiny Bond
        "SwitchOutTargetStatusMove",      // Roar/Whirlwind
        "UserMakeSubstitute",             // Substitute
      ];
      if (functions.includes(move.function) ||
          (user.pbHasType("GHOST") && move.function === "CurseTargetOrLowerUserSpd1RaiseUserAtkDef1")) { // Curse
        await battler.battle.pbDisplay(_INTL("But it failed!"));
        ret = false;
      }
    }
    //-------------------------------------------------------------------------
    // Max Raid Shields block status moves.
    //-------------------------------------------------------------------------
    if (target.effects[PBEffects.RaidShield] > 0 && move.statusMove()) {
      await battler.battle.pbDisplay(_INTL("But it failed!"));
      ret = false;
    }
  }
  return ret;
}

//-----------------------------------------------------------------------------
// Allows a Raid Pokemon to use its base moves in the same turn after Max Moves.
//-----------------------------------------------------------------------------
/** raid_UseBaseMoves(choice) */
export async function raidUseBaseMoves(battler: Battler, choice: BattleChoice): Promise<void> {
  if (!battler.effects[PBEffects.MaxRaidBoss]) return;
  if (battler.effects[PBEffects.ShieldCounter] > 0) return;
  if (choice[0] !== "UseMove") return;
  if ((choice[2] as Move).statusMove()) return;
  if (battler.baseMoves.length === 0) return;
  battler.displayBaseMoves();
  const battle = battler.battle;
  const strikes = battle.pbSideSize(0) - 1;
  for (let i = 0; i < strikes; i++) {
    if (battle.pbAllFainted()) break;
    if (battle.decision > 0) break;
    if (i + 1 >= battle.pbAbleCount()) break;
    await battle.battleAI.pbChooseMoves(battler.index);
    choice = battle.choices[battler.index]!;
    PBDebug.log(`[Move usage] ${battler.pbThis()} started using ${(choice[2] as Move).name}`);
    await PBDebug.logonerr(() => battler.pbUseMove(choice, choice[2] === battle.struggle));
    battle.pbJudge();
  }
}

//-----------------------------------------------------------------------------
// Deals damage to a Raid Pokemon's shields through Max Guard (only in 1v1 raids).
//-----------------------------------------------------------------------------
/** raid_ShieldBreak(move, target) */
export async function raidShieldBreak(battler: Battler, move: Move, target: Battler): Promise<void> {
  const battle = battler.battle;
  if (battle.pbSideSize(0) === 1 &&
      move.maxMove() && move.damagingMove() &&
      target.effects[PBEffects.MaxRaidBoss] &&
      target.effects[PBEffects.RaidShield] > 0) {
    await battle.pbDisplay(_INTL("{1}'s mysterious barrier took the hit!", target.pbThis()));
    await battle.scene.pbDamageAnimation(target);
    target.effects[PBEffects.RaidShield] -= 1;
    battle.scene.pbRefresh();
    if (target.effects[PBEffects.RaidShield] <= 0) {
      target.effects[PBEffects.RaidShield] = 0;
      await battle.scene.pbRaidShield?.(target);
      await battle.pbDisplay(_INTL("The mysterious barrier disappeared!"));
      const oldhp = target.hp;
      target.hp -= Math.floor(target.totalhp / 8);
      if (target.hp <= 1) target.hp = 1;
      await battle.scene.pbHPChanged(target, oldhp);
      if (target.hp > 1) {
        for (const stat of ["DEFENSE", "SPECIAL_DEFENSE"]) {
          if (await target.pbCanLowerStatStage(stat, target, null, true)) {
            await target.pbLowerStatStage(stat, 2, target, true, false, 0, true);
          }
        }
      }
    }
  }
}

//-----------------------------------------------------------------------------
// Handles outcomes in Max Raid battles when party Pokemon are KO'd.
//-----------------------------------------------------------------------------
/** raid_KOCounter(target) */
export async function raidKOCounter(battler: Battler, target: Battler | null): Promise<void> {
  const battle = battler.battle;
  // NOTE (Ruby parity): the nil check comes after target.effects is read (Raid_Battle_Battler.rb:137-138).
  if (target!.effects[PBEffects.MaxRaidBoss]) {
    if (!target || target.fainted()) return;
    if (inMaxLair()) pbDynamaxAdventure().knockouts -= 1;
    target.effects[PBEffects.KnockOutCount] -= 1;
    dxRules().perfect_bonus = false;
    battle.scene.pbRefresh();
    //-------------------------------------------------------------------------
    // Messages upon KO'ing a Pokemon.
    //-------------------------------------------------------------------------
    let koboost = false;
    if (target.effects[PBEffects.KnockOutCount] >= 2) {
      await battle.pbDisplay(_INTL("The storm raging around {1} is growing stronger!", target.pbThis(true)));
      koboost = true;
    } else if (target.effects[PBEffects.KnockOutCount] === 1) {
      await battle.pbDisplay(_INTL("The storm around {1} is growing too strong to withstand!", target.pbThis(true)));
      koboost = true;
    } else {
      await battle.pbDisplay(_INTL("The storm around {1} grew out of control!", target.pbThis(true)));
      let moreToFaint = false;
      for (const b of battle.battlers) {
        if (!b || !b.opposes(target) || b.hp > 0 || b.faintedProperly) continue;
        moreToFaint = true;
      }
      if (!moreToFaint) {
        await battle.pbDisplay(_INTL("You were blown out of the den!"));
        pbSEPlay("Battle flee");
        battle.decision = 3;
        return;
      }
    }
    //-------------------------------------------------------------------------
    // Hard Mode Bonuses (KO Boost).
    //-------------------------------------------------------------------------
    if (koboost && (battle as { hardMode?: boolean }).hardMode) {
      let showAnim = true;
      for (const stat of ["ATTACK", "SPECIAL_ATTACK"]) {
        if (await target.pbCanRaiseStatStage(stat, target)) {
          await target.pbRaiseStatStage(stat, 1, target, showAnim);
          showAnim = false;
        }
      }
    }
  }
}
