// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Battle_Overrides.rb: the
// core methods ZUD aliases for Max Raid battles.
// - Battler#belched? (Max Raid Pokémon can always Belch): in battler/Battler.ts.
// - Battler#pbProcessTurn (strike again with base moves, raid_UseBaseMoves):
//   battler/Battler_UseMove.ts calls Raid_Battle_Battler.ts's raidUseBaseMoves.
// - Battler#pbEffectsAfterMove (Malicious Wave, shields, Invigorating Wave):
//   raidEffectsAfterMove below, called at the end of
//   battler/Battler_UseMoveTriggerEffects.ts's pbEffectsAfterMove.
// - Move#pbCalcDamage (shield thresholds), #pbCalcDamageMultipliers (damage
//   through shields /24) and #pbAdditionalEffectChance (no added effects
//   through shields): in move/Move_UsageCalculations.ts.

import { DEBUG } from "../../../core/debug";
import { _INTL } from "../../../data/gameData/gameData";
import { Stat } from "../../../data/gameData/stat";
import { Input } from "../../../rgss/Input";
import type { Battler } from "../../battler/Battler";
import type { Move } from "../../move/Move";
import { PBEffects } from "../../other/PBEffects";

/** The rest of the aliased pbEffectsAfterMove (Raid_Battle_Overrides.rb:30-140). */
export async function raidEffectsAfterMove(_self: Battler, user: Battler, targets: Battler[], move: Move,
  _numHits: number): Promise<void> {
  const battle = user.battle;
  if (!(battle.raidBattle && move.damagingMove())) return;
  const hardMode = !!(battle as { hardMode?: boolean }).hardMode;
  //-------------------------------------------------------------------------
  // Hard Mode Bonuses (Malicious Wave)
  //-------------------------------------------------------------------------
  if (hardMode) {
    if (user.effects[PBEffects.MaxRaidBoss] &&
        user.effects[PBEffects.RaidShield] <= 0 &&
        user.effects[PBEffects.KnockOutCount] > 0 &&
        !user.effects[PBEffects.TwoTurnAttack]) {
      let showMsg = true;
      // eachOtherSideBattler(user): checks each battler as it gets to it.
      for (const b of battle.battlers) {
        if (!b || b.fainted() || !b.opposes(user.index)) continue;
        if (battle.pbAllFainted(b.index) || battle.decision === 3) break;
        let damage = 0;
        if (user.effects[PBEffects.ShieldCounter] >= 1) damage = Math.floor(b.realTotalhp()! / 16);
        if (user.effects[PBEffects.ShieldCounter] <= 0) damage = Math.floor(b.realTotalhp()! / 8);
        const oldhp = b.hp;
        if (b.hp > 0 && !b.fainted()) {
          if (showMsg) {
            await battle.pbDisplay(_INTL("A malicious wave of Dynamax energy rippled from {1}'s attack!", user.pbThis(true)));
            await battle.scene.pbWaveAttack?.(user.index);
          }
        }
        showMsg = false;
        await battle.scene.pbDamageAnimation(b);
        b.hp -= damage;
        if (b.hp < 0) b.hp = 0;
        await battle.scene.pbHPChanged(b, oldhp);
        if (b.fainted()) await b.pbFaint();
      }
    }
  }
  //-------------------------------------------------------------------------
  // Effects triggered after moves used on a Max Raid Pokemon.
  //-------------------------------------------------------------------------
  for (const b of targets) {
    if (!(b.effects[PBEffects.MaxRaidBoss] && b.effects[PBEffects.KnockOutCount] > 0)) continue;
    if (b.damageState.calcDamage === 0 || b.damageState.unaffected) continue;
    if (b.hp <= 0) {
      //-----------------------------------------------------------------------
      // Initiates Max Raid capture sequence if brought down to 0 HP.
      //-----------------------------------------------------------------------
      b.effects[PBEffects.RaidShield] = 0;
      battle.scene.pbRefresh();
      if (b.fainted()) await b.pbFaint();
      return;
    } else if (b.effects[PBEffects.RaidShield] > 0) {
      //-----------------------------------------------------------------------
      // Max Raid Pokemon loses shields.
      //-----------------------------------------------------------------------
      let shieldBreak = move.powerMove() ? 2 : 1;
      if (DEBUG && Input.press(Input.CTRL)) shieldBreak = b.effects[PBEffects.RaidShield]; // Instantly breaks shield.
      b.effects[PBEffects.RaidShield] -= shieldBreak;
      battle.scene.pbRefresh();
      if (b.effects[PBEffects.RaidShield] <= 0) {
        b.effects[PBEffects.RaidShield] = 0;
        await battle.scene.pbRaidShield?.(b);
        await battle.pbDisplay(_INTL("The mysterious barrier disappeared!"));
        const oldhp = b.hp;
        b.hp -= Math.floor(b.totalhp / 8);
        if (b.hp <= 1) b.hp = 1;
        await battle.scene.pbHPChanged(b, oldhp);
        if (b.hp > 1) {
          for (const stat of ["DEFENSE", "SPECIAL_DEFENSE"]) {
            if (await b.pbCanLowerStatStage(stat, b, null, true)) {
              await b.pbLowerStatStage(stat, 2, b, true, false, 0, true);
            }
          }
        }
      }
    } else if (b.effects[PBEffects.RaidShield] <= 0 && b.hp > 1) {
      //-----------------------------------------------------------------------
      // Max Raid Pokemon gains shields.
      //-----------------------------------------------------------------------
      const shields1 = b.hp <= Math.floor(b.totalhp / 2);                   // Activates at 1/2 HP
      const shields2 = b.hp <= b.totalhp - Math.floor(b.totalhp / 5);       // Activates at 4/5ths HP
      if ((b.effects[PBEffects.ShieldCounter] === 1 && shields1) ||
          (b.effects[PBEffects.ShieldCounter] === 2 && shields2)) {
        await battle.pbDisplay(_INTL("{1} is getting desperate!\nIts attacks are growing more aggressive!", b.pbThis()));
        b.effects[PBEffects.RaidShield] = b.effects[PBEffects.MaxShieldHP];
        b.effects[PBEffects.ShieldCounter] -= 1;
        await battle.pbAnimation("REFLECT", b, b);
        await battle.scene.pbRaidShield?.(b);
        battle.scene.pbRefresh();
        await battle.pbDisplay(_INTL("A mysterious barrier appeared in front of {1}!", b.pbThis(true)));
      }
    }
    //-----------------------------------------------------------------------
    // Hard Mode Bonuses (Invigorating Wave)
    //-----------------------------------------------------------------------
    if (hardMode && b.effects[PBEffects.ShieldCounter] === 0) {
      let statStages = 0;
      for (const s of Stat.eachMainBattle()) {
        if (await b.pbCanRaiseStatStage(s.id, b, null, true)) {
          b.pbRaiseStatStageBasic(s.id, 1, true);
          statStages += 1;
        }
      }
      if (statStages > 0) {
        if (b.stages["ACCURACY"]! < 0) b.stages["ACCURACY"] = 0;
        if (b.stages["EVASION"]! < 0) b.stages["EVASION"] = 0;
        await battle.pbDisplay(_INTL("{1} released an invigorating wave of Dynamax energy!", b.pbThis()));
        await battle.scene.pbWaveAttack?.(b.index);
        await battle.pbCommonAnimation("StatUp", b);
        await battle.pbDisplay(_INTL("{1} got powered up!", b.pbThis()));
      }
      b.effects[PBEffects.ShieldCounter] -= 1;
    }
  }
}
