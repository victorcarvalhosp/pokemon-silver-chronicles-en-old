// Port of Data/Scripts/011_Battle/003_Move/006_MoveEffects_BattlerStats.rb
// (every class, in the Ruby file's order), with:
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:228):
//   StartUserSideDoubleSpeed#pbEffectGeneral is redefined (Wind Rider/Wind
//   Power proc on Tailwind).
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:507):
//   MaxUserAttackLoseHalfOfTotalHP#pbEffectGeneral is redefined (records the
//   Attack raise for Mirror Herb/Opportunist with addSideStatUps).
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:561):
//   LowerTargetEvasion1RemoveSideEffects#pbEffectAgainstTarget (abilities react
//   to the terrain ending).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:60): UserTargetAverageHP
//   #pbEffectAgainstTarget is redefined (uses the non-Dynamax HP).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:167):
//   LowerTargetEvasion1RemoveSideEffects#pbFailsAgainstTarget? and
//   #pbEffectAgainstTarget (G-Max Steelsurge hazard).
// Alias chains (load order Hotfixes → Gen 9 → Mega → Deluxe → ZUD):
//   LowerTargetEvasion1RemoveSideEffects#pbFailsAgainstTarget? = ZUD( core )
//   LowerTargetEvasion1RemoveSideEffects#pbEffectAgainstTarget = ZUD( Gen 9( core ) )
//   StartUserSideDoubleSpeed#pbEffectGeneral = Gen 9 (redefined, no alias)
//   MaxUserAttackLoseHalfOfTotalHP#pbEffectGeneral = Gen 9 (redefined, no alias)
//   UserTargetAverageHP#pbEffectAgainstTarget = ZUD (redefined, no alias)
//
// New helper: LowerPoisonedTargetAtkSpAtkSpd1#pbCheckForMirrorArmor is async.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Move, registerMoveClass } from "./Move";
import {
  MultiStatUpMove, StatDownMove, StatUpMove, TargetMultiStatDownMove, TargetStatDownMove,
} from "./Move_BaseEffects";

//===============================================================================
// Increases the user's Attack by 1 stage.
//===============================================================================
export class RaiseUserAttack1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1];
  }
}
registerMoveClass("RaiseUserAttack1", RaiseUserAttack1);

//===============================================================================
// Increases the user's Attack by 2 stages. (Swords Dance)
//===============================================================================
export class RaiseUserAttack2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 2];
  }
}
registerMoveClass("RaiseUserAttack2", RaiseUserAttack2);

//===============================================================================
// If this move KO's the target, increases the user's Attack by 2 stages.
// (Fell Stinger (Gen 6-))
//===============================================================================
export class RaiseUserAttack2IfTargetFaints extends Move {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (!target.damageState.fainted) return;
    if (!(await user.pbCanRaiseStatStage("ATTACK", user, this))) return;
    await user.pbRaiseStatStage("ATTACK", 2, user);
  }
}
registerMoveClass("RaiseUserAttack2IfTargetFaints", RaiseUserAttack2IfTargetFaints);

//===============================================================================
// Increases the user's Attack by 3 stages.
//===============================================================================
export class RaiseUserAttack3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 3];
  }
}
registerMoveClass("RaiseUserAttack3", RaiseUserAttack3);

//===============================================================================
// If this move KO's the target, increases the user's Attack by 3 stages.
// (Fell Stinger (Gen 7+))
//===============================================================================
export class RaiseUserAttack3IfTargetFaints extends Move {
  override async pbEffectAfterAllHits(user: Battler, target: Battler): Promise<void> {
    if (!target.damageState.fainted) return;
    if (!(await user.pbCanRaiseStatStage("ATTACK", user, this))) return;
    await user.pbRaiseStatStage("ATTACK", 3, user);
  }
}
registerMoveClass("RaiseUserAttack3IfTargetFaints", RaiseUserAttack3IfTargetFaints);

//===============================================================================
// Reduces the user's HP by half of max, and sets its Attack to maximum.
// (Belly Drum)
//===============================================================================
export class MaxUserAttackLoseHalfOfTotalHP extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    const hpLoss = Math.max(Math.floor(user.totalhp / 2), 1);
    if (user.hp <= hpLoss) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (!(await user.pbCanRaiseStatStage("ATTACK", user, this, true))) return true;
    return false;
  }

  /** Generation 9 Pack (redefined): Mirror Herb/Opportunist can copy the boost. */
  override async pbEffectGeneral(user: Battler): Promise<void> {
    const hpLoss = Math.max(Math.floor(user.totalhp / 2), 1);
    await user.pbReduceHP(hpLoss, false, false);
    if (user.hasActiveAbility("CONTRARY")) {
      user.stages.ATTACK = -6;
      user.statsLoweredThisRound = true;
      user.statsDropped = true;
      await this.battle.pbCommonAnimation("StatDown", user);
      await this.battle.pbDisplay(_INTL("{1} cut its own HP and minimized its Attack!", user.pbThis()));
    } else {
      user.stages.ATTACK = 6;
      user.addSideStatUps("ATTACK", 6);
      user.statsRaisedThisRound = true;
      await this.battle.pbCommonAnimation("StatUp", user);
      await this.battle.pbDisplay(_INTL("{1} cut its own HP and maximized its Attack!", user.pbThis()));
    }
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("MaxUserAttackLoseHalfOfTotalHP", MaxUserAttackLoseHalfOfTotalHP);

//===============================================================================
// Increases the user's Defense by 1 stage. (Harden, Steel Wing, Withdraw)
//===============================================================================
export class RaiseUserDefense1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 1];
  }
}
registerMoveClass("RaiseUserDefense1", RaiseUserDefense1);

//===============================================================================
// Increases the user's Defense by 1 stage. User curls up. (Defense Curl)
//===============================================================================
export class RaiseUserDefense1CurlUpUser extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 1];
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.DefenseCurl] = true;
    await super.pbEffectGeneral(user);
  }
}
registerMoveClass("RaiseUserDefense1CurlUpUser", RaiseUserDefense1CurlUpUser);

//===============================================================================
// Increases the user's Defense by 2 stages. (Acid Armor, Barrier, Iron Defense)
//===============================================================================
export class RaiseUserDefense2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 2];
  }
}
registerMoveClass("RaiseUserDefense2", RaiseUserDefense2);

//===============================================================================
// Increases the user's Defense by 3 stages. (Cotton Guard)
//===============================================================================
export class RaiseUserDefense3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 3];
  }
}
registerMoveClass("RaiseUserDefense3", RaiseUserDefense3);

//===============================================================================
// Increases the user's Special Attack by 1 stage. (Charge Beam, Fiery Dance)
//===============================================================================
export class RaiseUserSpAtk1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_ATTACK", 1];
  }
}
registerMoveClass("RaiseUserSpAtk1", RaiseUserSpAtk1);

//===============================================================================
// Increases the user's Special Attack by 2 stages. (Nasty Plot)
//===============================================================================
export class RaiseUserSpAtk2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_ATTACK", 2];
  }
}
registerMoveClass("RaiseUserSpAtk2", RaiseUserSpAtk2);

//===============================================================================
// Increases the user's Special Attack by 3 stages. (Tail Glow)
//===============================================================================
export class RaiseUserSpAtk3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_ATTACK", 3];
  }
}
registerMoveClass("RaiseUserSpAtk3", RaiseUserSpAtk3);

//===============================================================================
// Increases the user's Special Defense by 1 stage.
//===============================================================================
export class RaiseUserSpDef1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("RaiseUserSpDef1", RaiseUserSpDef1);

//===============================================================================
// Increases the user's Special Defense by 1 stage.
// Charges up user's next attack if it is Electric-type. (Charge)
//===============================================================================
export class RaiseUserSpDef1PowerUpElectricMove extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_DEFENSE", 1];
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Charge] = 2;
    await this.battle.pbDisplay(_INTL("{1} began charging power!", user.pbThis()));
    await super.pbEffectGeneral(user);
  }
}
registerMoveClass("RaiseUserSpDef1PowerUpElectricMove", RaiseUserSpDef1PowerUpElectricMove);

//===============================================================================
// Increases the user's Special Defense by 2 stages. (Amnesia)
//===============================================================================
export class RaiseUserSpDef2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_DEFENSE", 2];
  }
}
registerMoveClass("RaiseUserSpDef2", RaiseUserSpDef2);

//===============================================================================
// Increases the user's Special Defense by 3 stages.
//===============================================================================
export class RaiseUserSpDef3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_DEFENSE", 3];
  }
}
registerMoveClass("RaiseUserSpDef3", RaiseUserSpDef3);

//===============================================================================
// Increases the user's Speed by 1 stage. (Flame Charge)
//===============================================================================
export class RaiseUserSpeed1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPEED", 1];
  }
}
registerMoveClass("RaiseUserSpeed1", RaiseUserSpeed1);

//===============================================================================
// Increases the user's Speed by 2 stages. (Agility, Rock Polish)
//===============================================================================
export class RaiseUserSpeed2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPEED", 2];
  }
}
registerMoveClass("RaiseUserSpeed2", RaiseUserSpeed2);

//===============================================================================
// Increases the user's Speed by 2 stages. Lowers user's weight by 100kg.
// (Autotomize)
//===============================================================================
export class RaiseUserSpeed2LowerUserWeight extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPEED", 2];
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.pbWeight() + user.effects[PBEffects.WeightChange] > 1) {
      user.effects[PBEffects.WeightChange] -= 1000;
      await this.battle.pbDisplay(_INTL("{1} became nimble!", user.pbThis()));
    }
    await super.pbEffectGeneral(user);
  }
}
registerMoveClass("RaiseUserSpeed2LowerUserWeight", RaiseUserSpeed2LowerUserWeight);

//===============================================================================
// Increases the user's Speed by 3 stages.
//===============================================================================
export class RaiseUserSpeed3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPEED", 3];
  }
}
registerMoveClass("RaiseUserSpeed3", RaiseUserSpeed3);

//===============================================================================
// Increases the user's accuracy by 1 stage.
//===============================================================================
export class RaiseUserAccuracy1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ACCURACY", 1];
  }
}
registerMoveClass("RaiseUserAccuracy1", RaiseUserAccuracy1);

//===============================================================================
// Increases the user's accuracy by 2 stages.
//===============================================================================
export class RaiseUserAccuracy2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ACCURACY", 2];
  }
}
registerMoveClass("RaiseUserAccuracy2", RaiseUserAccuracy2);

//===============================================================================
// Increases the user's accuracy by 3 stages.
//===============================================================================
export class RaiseUserAccuracy3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ACCURACY", 3];
  }
}
registerMoveClass("RaiseUserAccuracy3", RaiseUserAccuracy3);

//===============================================================================
// Increases the user's evasion by 1 stage. (Double Team)
//===============================================================================
export class RaiseUserEvasion1 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["EVASION", 1];
  }
}
registerMoveClass("RaiseUserEvasion1", RaiseUserEvasion1);

//===============================================================================
// Increases the user's evasion by 2 stages.
//===============================================================================
export class RaiseUserEvasion2 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["EVASION", 2];
  }
}
registerMoveClass("RaiseUserEvasion2", RaiseUserEvasion2);

//===============================================================================
// Increases the user's evasion by 2 stages. Minimizes the user. (Minimize)
//===============================================================================
export class RaiseUserEvasion2MinimizeUser extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["EVASION", 2];
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Minimize] = true;
    await super.pbEffectGeneral(user);
  }
}
registerMoveClass("RaiseUserEvasion2MinimizeUser", RaiseUserEvasion2MinimizeUser);

//===============================================================================
// Increases the user's evasion by 3 stages.
//===============================================================================
export class RaiseUserEvasion3 extends StatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["EVASION", 3];
  }
}
registerMoveClass("RaiseUserEvasion3", RaiseUserEvasion3);

//===============================================================================
// Increases the user's critical hit rate. (Focus Energy)
//===============================================================================
export class RaiseUserCriticalHitRate2 extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.FocusEnergy] >= 2) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.FocusEnergy] = 2;
    await this.battle.pbDisplay(_INTL("{1} is getting pumped!", user.pbThis()));
  }
}
registerMoveClass("RaiseUserCriticalHitRate2", RaiseUserCriticalHitRate2);

//===============================================================================
// Increases the user's Attack and Defense by 1 stage each. (Bulk Up)
//===============================================================================
export class RaiseUserAtkDef1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "DEFENSE", 1];
  }
}
registerMoveClass("RaiseUserAtkDef1", RaiseUserAtkDef1);

//===============================================================================
// Increases the user's Attack, Defense and accuracy by 1 stage each. (Coil)
//===============================================================================
export class RaiseUserAtkDefAcc1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "DEFENSE", 1, "ACCURACY", 1];
  }
}
registerMoveClass("RaiseUserAtkDefAcc1", RaiseUserAtkDefAcc1);

//===============================================================================
// Increases the user's Attack and Special Attack by 1 stage each. (Work Up)
//===============================================================================
export class RaiseUserAtkSpAtk1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "SPECIAL_ATTACK", 1];
  }
}
registerMoveClass("RaiseUserAtkSpAtk1", RaiseUserAtkSpAtk1);

//===============================================================================
// Increases the user's Attack and Sp. Attack by 1 stage each.
// In sunny weather, increases are 2 stages each instead. (Growth)
//===============================================================================
export class RaiseUserAtkSpAtk1Or2InSun extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "SPECIAL_ATTACK", 1];
  }

  override async pbOnStartUse(user: Battler, _targets: Battler[]): Promise<void> {
    let increment = 1;
    if (["Sun", "HarshSun"].includes(user.effectiveWeather())) increment = 2;
    this.statUp[1] = this.statUp[3] = increment;
  }
}
registerMoveClass("RaiseUserAtkSpAtk1Or2InSun", RaiseUserAtkSpAtk1Or2InSun);

//===============================================================================
// Decreases the user's Defense and Special Defense by 1 stage each.
// Increases the user's Attack, Speed and Special Attack by 2 stages each.
// (Shell Smash)
//===============================================================================
export class LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2 extends Move {
  statUp: (Id | number)[];
  statDown: (Id | number)[];

  override canSnatch(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 2, "SPECIAL_ATTACK", 2, "SPEED", 2];
    this.statDown = ["DEFENSE", 1, "SPECIAL_DEFENSE", 1];
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (let i = 0; i < Math.floor(this.statUp.length / 2); i++) {
      if (await user.pbCanRaiseStatStage(this.statUp[i * 2] as Id, user, this)) {
        failed = false;
        break;
      }
    }
    for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
      if (await user.pbCanLowerStatStage(this.statDown[i * 2] as Id, user, this)) {
        failed = false;
        break;
      }
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("{1}'s stats can't be changed further!", user.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    let showAnim = true;
    for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
      if (!(await user.pbCanLowerStatStage(this.statDown[i * 2] as Id, user, this))) continue;
      if (await user.pbLowerStatStage(this.statDown[i * 2] as Id, this.statDown[(i * 2) + 1] as number, user, showAnim)) {
        showAnim = false;
      }
    }
    showAnim = true;
    for (let i = 0; i < Math.floor(this.statUp.length / 2); i++) {
      if (!(await user.pbCanRaiseStatStage(this.statUp[i * 2] as Id, user, this))) continue;
      if (await user.pbRaiseStatStage(this.statUp[i * 2] as Id, this.statUp[(i * 2) + 1] as number, user, showAnim)) {
        showAnim = false;
      }
    }
  }
}
registerMoveClass("LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2", LowerUserDefSpDef1RaiseUserAtkSpAtkSpd2);

//===============================================================================
// Increases the user's Attack and Speed by 1 stage each. (Dragon Dance)
//===============================================================================
export class RaiseUserAtkSpd1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "SPEED", 1];
  }
}
registerMoveClass("RaiseUserAtkSpd1", RaiseUserAtkSpd1);

//===============================================================================
// Increases the user's Speed by 2 stages, and its Attack by 1 stage. (Shift Gear)
//===============================================================================
export class RaiseUserAtk1Spd2 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPEED", 2, "ATTACK", 1];
  }
}
registerMoveClass("RaiseUserAtk1Spd2", RaiseUserAtk1Spd2);

//===============================================================================
// Increases the user's Attack and accuracy by 1 stage each. (Hone Claws)
//===============================================================================
export class RaiseUserAtkAcc1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "ACCURACY", 1];
  }
}
registerMoveClass("RaiseUserAtkAcc1", RaiseUserAtkAcc1);

//===============================================================================
// Increases the user's Defense and Special Defense by 1 stage each.
// (Cosmic Power, Defend Order)
//===============================================================================
export class RaiseUserDefSpDef1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["DEFENSE", 1, "SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("RaiseUserDefSpDef1", RaiseUserDefSpDef1);

//===============================================================================
// Increases the user's Sp. Attack and Sp. Defense by 1 stage each. (Calm Mind)
//===============================================================================
export class RaiseUserSpAtkSpDef1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_ATTACK", 1, "SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("RaiseUserSpAtkSpDef1", RaiseUserSpAtkSpDef1);

//===============================================================================
// Increases the user's Sp. Attack, Sp. Defense and Speed by 1 stage each.
// (Quiver Dance)
//===============================================================================
export class RaiseUserSpAtkSpDefSpd1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["SPECIAL_ATTACK", 1, "SPECIAL_DEFENSE", 1, "SPEED", 1];
  }
}
registerMoveClass("RaiseUserSpAtkSpDefSpd1", RaiseUserSpAtkSpDefSpd1);

//===============================================================================
// Increases the user's Attack, Defense, Speed, Special Attack and Special Defense
// by 1 stage each. (Ancient Power, Ominous Wind, Silver Wind)
//===============================================================================
export class RaiseUserMainStats1 extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = ["ATTACK", 1, "DEFENSE", 1, "SPECIAL_ATTACK", 1, "SPECIAL_DEFENSE", 1, "SPEED", 1];
  }
}
registerMoveClass("RaiseUserMainStats1", RaiseUserMainStats1);

//===============================================================================
// Increases the user's Attack, Defense, Special Attack, Special Defense and
// Speed by 1 stage each, and reduces the user's HP by a third of its total HP.
// Fails if it can't do either effect. (Clangorous Soul)
//===============================================================================
export class RaiseUserMainStats1LoseThirdOfTotalHP extends MultiStatUpMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statUp = [
      "ATTACK", 1,
      "DEFENSE", 1,
      "SPECIAL_ATTACK", 1,
      "SPECIAL_DEFENSE", 1,
      "SPEED", 1,
    ];
  }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.hp <= Math.max(Math.floor(user.totalhp / 3), 1)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return super.pbMoveFailed(user, targets);
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await super.pbEffectGeneral(user);
    await user.pbReduceHP(Math.max(Math.floor(user.totalhp / 3), 1), false);
    await user.pbItemHPHealCheck();
  }
}
registerMoveClass("RaiseUserMainStats1LoseThirdOfTotalHP", RaiseUserMainStats1LoseThirdOfTotalHP);

//===============================================================================
// Increases the user's Attack, Defense, Speed, Special Attack and Special
// Defense by 1 stage each. The user cannot switch out or flee. Fails if the user
// is already affected by the second effect of this move, but can be used if the
// user is prevented from switching out or fleeing by another effect (in which
// case, the second effect of this move is not applied to the user). The user may
// still switch out if holding Shed Shell or Eject Button, or if affected by a
// Red Card. (No Retreat)
//===============================================================================
export class RaiseUserMainStats1TrapUserInBattle extends RaiseUserMainStats1 {
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.NoRetreat]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return super.pbMoveFailed(user, targets);
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await super.pbEffectGeneral(user);
    if (!user.trappedInBattle()) {
      user.effects[PBEffects.NoRetreat] = true;
      await this.battle.pbDisplay(_INTL("{1} can no longer escape because it used {2}!", user.pbThis(), this.name));
    }
  }
}
registerMoveClass("RaiseUserMainStats1TrapUserInBattle", RaiseUserMainStats1TrapUserInBattle);

//===============================================================================
// User rages until the start of a round in which they don't use this move. (Rage)
// (Handled in Battler's pbProcessMoveAgainstTarget): Ups rager's Attack by 1
// stage each time it loses HP due to a move.
//===============================================================================
export class StartRaiseUserAtk1WhenDamaged extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Rage] = true;
  }
}
registerMoveClass("StartRaiseUserAtk1WhenDamaged", StartRaiseUserAtk1WhenDamaged);

//===============================================================================
// Decreases the user's Attack by 1 stage.
//===============================================================================
export class LowerUserAttack1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1];
  }
}
registerMoveClass("LowerUserAttack1", LowerUserAttack1);

//===============================================================================
// Decreases the user's Attack by 2 stages.
//===============================================================================
export class LowerUserAttack2 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 2];
  }
}
registerMoveClass("LowerUserAttack2", LowerUserAttack2);

//===============================================================================
// Decreases the user's Defense by 1 stage. (Clanging Scales)
//===============================================================================
export class LowerUserDefense1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 1];
  }
}
registerMoveClass("LowerUserDefense1", LowerUserDefense1);

//===============================================================================
// Decreases the user's Defense by 2 stages.
//===============================================================================
export class LowerUserDefense2 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 2];
  }
}
registerMoveClass("LowerUserDefense2", LowerUserDefense2);

//===============================================================================
// Decreases the user's Special Attack by 1 stage.
//===============================================================================
export class LowerUserSpAtk1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_ATTACK", 1];
  }
}
registerMoveClass("LowerUserSpAtk1", LowerUserSpAtk1);

//===============================================================================
// Decreases the user's Special Attack by 2 stages.
//===============================================================================
export class LowerUserSpAtk2 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_ATTACK", 2];
  }
}
registerMoveClass("LowerUserSpAtk2", LowerUserSpAtk2);

//===============================================================================
// Decreases the user's Special Defense by 1 stage.
//===============================================================================
export class LowerUserSpDef1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("LowerUserSpDef1", LowerUserSpDef1);

//===============================================================================
// Decreases the user's Special Defense by 2 stages.
//===============================================================================
export class LowerUserSpDef2 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_DEFENSE", 2];
  }
}
registerMoveClass("LowerUserSpDef2", LowerUserSpDef2);

//===============================================================================
// Decreases the user's Speed by 1 stage. (Hammer Arm, Ice Hammer)
//===============================================================================
export class LowerUserSpeed1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 1];
  }
}
registerMoveClass("LowerUserSpeed1", LowerUserSpeed1);

//===============================================================================
// Decreases the user's Speed by 2 stages.
//===============================================================================
export class LowerUserSpeed2 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 2];
  }
}
registerMoveClass("LowerUserSpeed2", LowerUserSpeed2);

//===============================================================================
// Decreases the user's Attack and Defense by 1 stage each. (Superpower)
//===============================================================================
export class LowerUserAtkDef1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1, "DEFENSE", 1];
  }
}
registerMoveClass("LowerUserAtkDef1", LowerUserAtkDef1);

//===============================================================================
// Decreases the user's Defense and Special Defense by 1 stage each.
// (Close Combat, Dragon Ascent)
//===============================================================================
export class LowerUserDefSpDef1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 1, "SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("LowerUserDefSpDef1", LowerUserDefSpDef1);

//===============================================================================
// Decreases the user's Defense, Special Defense and Speed by 1 stage each.
// (V-create)
//===============================================================================
export class LowerUserDefSpDefSpd1 extends StatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 1, "DEFENSE", 1, "SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("LowerUserDefSpDefSpd1", LowerUserDefSpDefSpd1);

//===============================================================================
// Increases the user's and allies' Attack by 1 stage. (Howl (Gen 8+))
//===============================================================================
export class RaiseTargetAttack1 extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    if (this.damagingMove()) return false;
    let failed = true;
    for (const b of targets) {
      if (!(await b.pbCanRaiseStatStage("ATTACK", user, this))) continue;
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanRaiseStatStage("ATTACK", user, this, showMessage));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbRaiseStatStage("ATTACK", 1, user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (!(await target.pbCanRaiseStatStage("ATTACK", user, this))) return;
    await target.pbRaiseStatStage("ATTACK", 1, user);
  }
}
registerMoveClass("RaiseTargetAttack1", RaiseTargetAttack1);

//===============================================================================
// Increases the target's Attack by 2 stages. Confuses the target. (Swagger)
//===============================================================================
export class RaiseTargetAttack2ConfuseTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (const b of targets) {
      if (!(await b.pbCanRaiseStatStage("ATTACK", user, this)) &&
          !b.pbCanConfuse(user, false, this)) continue;
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (await target.pbCanRaiseStatStage("ATTACK", user, this)) {
      await target.pbRaiseStatStage("ATTACK", 2, user);
    }
    if (target.pbCanConfuse(user, false, this)) await target.pbConfuse();
  }
}
registerMoveClass("RaiseTargetAttack2ConfuseTarget", RaiseTargetAttack2ConfuseTarget);

//===============================================================================
// Increases the target's Special Attack by 1 stage. Confuses the target. (Flatter)
//===============================================================================
export class RaiseTargetSpAtk1ConfuseTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (const b of targets) {
      if (!(await b.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) &&
          !b.pbCanConfuse(user, false, this)) continue;
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (await target.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) {
      await target.pbRaiseStatStage("SPECIAL_ATTACK", 1, user);
    }
    if (target.pbCanConfuse(user, false, this)) await target.pbConfuse();
  }
}
registerMoveClass("RaiseTargetSpAtk1ConfuseTarget", RaiseTargetSpAtk1ConfuseTarget);

//===============================================================================
// Increases target's Special Defense by 1 stage. (Aromatic Mist)
//===============================================================================
export class RaiseTargetSpDef1 extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!(await target.pbCanRaiseStatStage("SPECIAL_DEFENSE", user, this, showMessage))) return true;
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await target.pbRaiseStatStage("SPECIAL_DEFENSE", 1, user);
  }
}
registerMoveClass("RaiseTargetSpDef1", RaiseTargetSpDef1);

//===============================================================================
// Increases one random stat of the target by 2 stages (except HP). (Acupressure)
//===============================================================================
export class RaiseTargetRandomStat2 extends Move {
  statArray: Id[] = [];

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    this.statArray = [];
    for (const s of Stat.eachBattle()) {
      if (await target.pbCanRaiseStatStage(s.id, user, this)) this.statArray.push(s.id);
    }
    if (this.statArray.length === 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s stats won't go any higher!", target.pbThis()));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    const stat = this.statArray[this.battle.pbRandom(this.statArray.length)]!;
    await target.pbRaiseStatStage(stat, 2, user);
  }
}
registerMoveClass("RaiseTargetRandomStat2", RaiseTargetRandomStat2);

//===============================================================================
// Increases the target's Attack and Special Attack by 2 stages each. (Decorate)
//===============================================================================
export class RaiseTargetAtkSpAtk2 extends Move {
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    let failed = true;
    for (const b of targets) {
      if (!(await b.pbCanRaiseStatStage("ATTACK", user, this)) &&
          !(await b.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this))) continue;
      failed = false;
      break;
    }
    if (failed) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (await target.pbCanRaiseStatStage("ATTACK", user, this)) {
      await target.pbRaiseStatStage("ATTACK", 2, user);
    }
    if (await target.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) {
      await target.pbRaiseStatStage("SPECIAL_ATTACK", 2, user);
    }
  }
}
registerMoveClass("RaiseTargetAtkSpAtk2", RaiseTargetAtkSpAtk2);

//===============================================================================
// Decreases the target's Attack by 1 stage.
//===============================================================================
export class LowerTargetAttack1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1];
  }
}
registerMoveClass("LowerTargetAttack1", LowerTargetAttack1);

//===============================================================================
// Decreases the target's Attack by 1 stage. Bypasses target's Substitute. (Play Nice)
//===============================================================================
export class LowerTargetAttack1BypassSubstitute extends TargetStatDownMove {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1];
  }
}
registerMoveClass("LowerTargetAttack1BypassSubstitute", LowerTargetAttack1BypassSubstitute);

//===============================================================================
// Decreases the target's Attack by 2 stages. (Charm, Feather Dance)
//===============================================================================
export class LowerTargetAttack2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 2];
  }
}
registerMoveClass("LowerTargetAttack2", LowerTargetAttack2);

//===============================================================================
// Decreases the target's Attack by 3 stages.
//===============================================================================
export class LowerTargetAttack3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 3];
  }
}
registerMoveClass("LowerTargetAttack3", LowerTargetAttack3);

//===============================================================================
// Decreases the target's Defense by 1 stage.
//===============================================================================
export class LowerTargetDefense1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 1];
  }
}
registerMoveClass("LowerTargetDefense1", LowerTargetDefense1);

//===============================================================================
// Decreases the target's Defense by 1 stage. Power is mutliplied by 1.5 if
// Gravity is in effect. (Grav Apple)
//===============================================================================
export class LowerTargetDefense1PowersUpInGravity extends LowerTargetDefense1 {
  override pbBaseDamage(baseDmg: number, _user: Battler, _target: Battler): number {
    // Ruby Integer arithmetic: baseDmg * 3 / 2 floors.
    if (this.battle.field.effects[PBEffects.Gravity] > 0) baseDmg = Math.floor(baseDmg * 3 / 2);
    return baseDmg;
  }
}
registerMoveClass("LowerTargetDefense1PowersUpInGravity", LowerTargetDefense1PowersUpInGravity);

//===============================================================================
// Decreases the target's Defense by 2 stages. (Screech)
//===============================================================================
export class LowerTargetDefense2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 2];
  }
}
registerMoveClass("LowerTargetDefense2", LowerTargetDefense2);

//===============================================================================
// Decreases the target's Defense by 3 stages.
//===============================================================================
export class LowerTargetDefense3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["DEFENSE", 3];
  }
}
registerMoveClass("LowerTargetDefense3", LowerTargetDefense3);

//===============================================================================
// Decreases the target's Special Attack by 1 stage.
//===============================================================================
export class LowerTargetSpAtk1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_ATTACK", 1];
  }
}
registerMoveClass("LowerTargetSpAtk1", LowerTargetSpAtk1);

//===============================================================================
// Decreases the target's Special Attack by 2 stages. (Eerie Impulse)
//===============================================================================
export class LowerTargetSpAtk2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_ATTACK", 2];
  }
}
registerMoveClass("LowerTargetSpAtk2", LowerTargetSpAtk2);

//===============================================================================
// Decreases the target's Special Attack by 2 stages. Only works on the opposite
// gender. (Captivate)
//===============================================================================
export class LowerTargetSpAtk2IfCanAttract extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_ATTACK", 2];
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (await super.pbFailsAgainstTarget(user, target, showMessage)) return true;
    if (this.damagingMove()) return false;
    if (user.gender() === 2 || target.gender() === 2 || user.gender() === target.gender()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
      return true;
    }
    if (target.hasActiveAbility("OBLIVIOUS") && !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1}'s {2} prevents romance!", target.pbThis(), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    return false;
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (user.gender() === 2 || target.gender() === 2 || user.gender() === target.gender()) return;
    if (target.hasActiveAbility("OBLIVIOUS") && !this.battle.moldBreaker) return;
    await super.pbAdditionalEffect(user, target);
  }
}
registerMoveClass("LowerTargetSpAtk2IfCanAttract", LowerTargetSpAtk2IfCanAttract);

//===============================================================================
// Decreases the target's Special Attack by 3 stages.
//===============================================================================
export class LowerTargetSpAtk3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_ATTACK", 3];
  }
}
registerMoveClass("LowerTargetSpAtk3", LowerTargetSpAtk3);

//===============================================================================
// Decreases the target's Special Defense by 1 stage.
//===============================================================================
export class LowerTargetSpDef1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_DEFENSE", 1];
  }
}
registerMoveClass("LowerTargetSpDef1", LowerTargetSpDef1);

//===============================================================================
// Decreases the target's Special Defense by 2 stages.
//===============================================================================
export class LowerTargetSpDef2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_DEFENSE", 2];
  }
}
registerMoveClass("LowerTargetSpDef2", LowerTargetSpDef2);

//===============================================================================
// Decreases the target's Special Defense by 3 stages.
//===============================================================================
export class LowerTargetSpDef3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPECIAL_DEFENSE", 3];
  }
}
registerMoveClass("LowerTargetSpDef3", LowerTargetSpDef3);

//===============================================================================
// Decreases the target's Speed by 1 stage.
//===============================================================================
export class LowerTargetSpeed1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 1];
  }
}
registerMoveClass("LowerTargetSpeed1", LowerTargetSpeed1);

//===============================================================================
// Decreases the target's Speed by 1 stage. Power is halved in Grassy Terrain.
// (Bulldoze)
//===============================================================================
export class LowerTargetSpeed1WeakerInGrassyTerrain extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 1];
  }

  override pbBaseDamage(baseDmg: number, _user: Battler, _target: Battler): number {
    if (this.battle.field.terrain === "Grassy") baseDmg = rubyRound(baseDmg / 2.0);
    return baseDmg;
  }
}
registerMoveClass("LowerTargetSpeed1WeakerInGrassyTerrain", LowerTargetSpeed1WeakerInGrassyTerrain);

//===============================================================================
// Decreases the target's Speed by 1 stage. Doubles the effectiveness of damaging
// Fire moves used against the target (this effect does not stack). Fails if
// neither of these effects can be applied. (Tar Shot)
//===============================================================================
export class LowerTargetSpeed1MakeTargetWeakerToFire extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 1];
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.TarShot]) return super.pbFailsAgainstTarget(user, target, showMessage);
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await super.pbEffectAgainstTarget(user, target);
    if (!target.effects[PBEffects.TarShot]) {
      target.effects[PBEffects.TarShot] = true;
      await this.battle.pbDisplay(_INTL("{1} became weaker to fire!", target.pbThis()));
    }
  }
}
registerMoveClass("LowerTargetSpeed1MakeTargetWeakerToFire", LowerTargetSpeed1MakeTargetWeakerToFire);

//===============================================================================
// Decreases the target's Speed by 2 stages. (Cotton Spore, Scary Face, String Shot)
//===============================================================================
export class LowerTargetSpeed2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 2];
  }
}
registerMoveClass("LowerTargetSpeed2", LowerTargetSpeed2);

//===============================================================================
// Decreases the target's Speed by 3 stages.
//===============================================================================
export class LowerTargetSpeed3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["SPEED", 3];
  }
}
registerMoveClass("LowerTargetSpeed3", LowerTargetSpeed3);

//===============================================================================
// Decreases the target's accuracy by 1 stage.
//===============================================================================
export class LowerTargetAccuracy1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ACCURACY", 1];
  }
}
registerMoveClass("LowerTargetAccuracy1", LowerTargetAccuracy1);

//===============================================================================
// Decreases the target's accuracy by 2 stages.
//===============================================================================
export class LowerTargetAccuracy2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ACCURACY", 2];
  }
}
registerMoveClass("LowerTargetAccuracy2", LowerTargetAccuracy2);

//===============================================================================
// Decreases the target's accuracy by 3 stages.
//===============================================================================
export class LowerTargetAccuracy3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ACCURACY", 3];
  }
}
registerMoveClass("LowerTargetAccuracy3", LowerTargetAccuracy3);

//===============================================================================
// Decreases the target's evasion by 1 stage. (Sweet Scent (Gen 5-))
//===============================================================================
export class LowerTargetEvasion1 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["EVASION", 1];
  }
}
registerMoveClass("LowerTargetEvasion1", LowerTargetEvasion1);

//===============================================================================
// Decreases the target's evasion by 1 stage. Ends all barriers and entry
// hazards for the target's side OR on both sides. (Defog)
//===============================================================================
export class LowerTargetEvasion1RemoveSideEffects extends TargetStatDownMove {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["EVASION", 1];
  }

  /** ZUD( core ). */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // ZUD Mechanics: G-Max Steelsurge
    // NOTE (Ruby parity): ZUD only checks the target's opposing side for
    //       Steelsurge here, not the target's own side.
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && target.pbOpposingSide().effects[PBEffects.Steelsurge]) {
      return false;
    }
    // Essentials
    const targetSide = target.pbOwnSide();
    const targetOpposingSide = target.pbOpposingSide();
    if (targetSide.effects[PBEffects.AuroraVeil] > 0 ||
        targetSide.effects[PBEffects.LightScreen] > 0 ||
        targetSide.effects[PBEffects.Reflect] > 0 ||
        targetSide.effects[PBEffects.Mist] > 0 ||
        targetSide.effects[PBEffects.Safeguard] > 0) return false;
    if (targetSide.effects[PBEffects.StealthRock] ||
        targetSide.effects[PBEffects.Spikes] > 0 ||
        targetSide.effects[PBEffects.ToxicSpikes] > 0 ||
        targetSide.effects[PBEffects.StickyWeb]) return false;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
        (targetOpposingSide.effects[PBEffects.StealthRock] ||
        targetOpposingSide.effects[PBEffects.Spikes] > 0 ||
        targetOpposingSide.effects[PBEffects.ToxicSpikes] > 0 ||
        targetOpposingSide.effects[PBEffects.StickyWeb])) return false;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8 && this.battle.field.terrain !== "None") return false;
    return super.pbFailsAgainstTarget(user, target, showMessage);
  }

  /** ZUD( Gen 9( core ) ). */
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    // Generation 9 Pack
    const oldTerrain = this.battle.field.terrain;
    await this.pbEffectAgainstTargetCore(user, target);
    if (oldTerrain !== "None") {
      for (const b of this.battle.allBattlers()) await b.pbAbilityOnTerrainChange();
    }
    // ZUD Mechanics: G-Max Steelsurge
    if (target.pbOwnSide().effects[PBEffects.Steelsurge] ||
        (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && target.pbOpposingSide().effects[PBEffects.Steelsurge])) {
      target.pbOwnSide().effects[PBEffects.Steelsurge] = false;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) target.pbOpposingSide().effects[PBEffects.Steelsurge] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away the pointed steel!", user.pbThis()));
    }
  }

  /** Core Essentials' pbEffectAgainstTarget. */
  private async pbEffectAgainstTargetCore(user: Battler, target: Battler): Promise<void> {
    if (await target.pbCanLowerStatStage(this.statDown[0] as Id, user, this)) {
      await target.pbLowerStatStage(this.statDown[0] as Id, this.statDown[1] as number, user);
    }
    if (target.pbOwnSide().effects[PBEffects.AuroraVeil] > 0) {
      target.pbOwnSide().effects[PBEffects.AuroraVeil] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Aurora Veil wore off!", target.pbTeam()));
    }
    if (target.pbOwnSide().effects[PBEffects.LightScreen] > 0) {
      target.pbOwnSide().effects[PBEffects.LightScreen] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Light Screen wore off!", target.pbTeam()));
    }
    if (target.pbOwnSide().effects[PBEffects.Reflect] > 0) {
      target.pbOwnSide().effects[PBEffects.Reflect] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Reflect wore off!", target.pbTeam()));
    }
    if (target.pbOwnSide().effects[PBEffects.Mist] > 0) {
      target.pbOwnSide().effects[PBEffects.Mist] = 0;
      await this.battle.pbDisplay(_INTL("{1}'s Mist faded!", target.pbTeam()));
    }
    if (target.pbOwnSide().effects[PBEffects.Safeguard] > 0) {
      target.pbOwnSide().effects[PBEffects.Safeguard] = 0;
      await this.battle.pbDisplay(_INTL("{1} is no longer protected by Safeguard!!", target.pbTeam()));
    }
    if (target.pbOwnSide().effects[PBEffects.StealthRock] ||
        (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
        target.pbOpposingSide().effects[PBEffects.StealthRock])) {
      target.pbOwnSide().effects[PBEffects.StealthRock] = false;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) target.pbOpposingSide().effects[PBEffects.StealthRock] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away stealth rocks!", user.pbThis()));
    }
    if (target.pbOwnSide().effects[PBEffects.Spikes] > 0 ||
        (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
        target.pbOpposingSide().effects[PBEffects.Spikes] > 0)) {
      target.pbOwnSide().effects[PBEffects.Spikes] = 0;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) target.pbOpposingSide().effects[PBEffects.Spikes] = 0;
      await this.battle.pbDisplay(_INTL("{1} blew away spikes!", user.pbThis()));
    }
    if (target.pbOwnSide().effects[PBEffects.ToxicSpikes] > 0 ||
        (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
        target.pbOpposingSide().effects[PBEffects.ToxicSpikes] > 0)) {
      target.pbOwnSide().effects[PBEffects.ToxicSpikes] = 0;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) target.pbOpposingSide().effects[PBEffects.ToxicSpikes] = 0;
      await this.battle.pbDisplay(_INTL("{1} blew away poison spikes!", user.pbThis()));
    }
    if (target.pbOwnSide().effects[PBEffects.StickyWeb] ||
        (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
        target.pbOpposingSide().effects[PBEffects.StickyWeb])) {
      target.pbOwnSide().effects[PBEffects.StickyWeb] = false;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) target.pbOpposingSide().effects[PBEffects.StickyWeb] = false;
      await this.battle.pbDisplay(_INTL("{1} blew away sticky webs!", user.pbThis()));
    }
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8 && this.battle.field.terrain !== "None") {
      switch (this.battle.field.terrain) {
        case "Electric":
          await this.battle.pbDisplay(_INTL("The electricity disappeared from the battlefield."));
          break;
        case "Grassy":
          await this.battle.pbDisplay(_INTL("The grass disappeared from the battlefield."));
          break;
        case "Misty":
          await this.battle.pbDisplay(_INTL("The mist disappeared from the battlefield."));
          break;
        case "Psychic":
          await this.battle.pbDisplay(_INTL("The weirdness disappeared from the battlefield."));
          break;
      }
      this.battle.field.terrain = "None";
    }
  }
}
registerMoveClass("LowerTargetEvasion1RemoveSideEffects", LowerTargetEvasion1RemoveSideEffects);

//===============================================================================
// Decreases the target's evasion by 2 stages. (Sweet Scent (Gen 6+))
//===============================================================================
export class LowerTargetEvasion2 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["EVASION", 2];
  }
}
registerMoveClass("LowerTargetEvasion2", LowerTargetEvasion2);

//===============================================================================
// Decreases the target's evasion by 3 stages.
//===============================================================================
export class LowerTargetEvasion3 extends TargetStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["EVASION", 3];
  }
}
registerMoveClass("LowerTargetEvasion3", LowerTargetEvasion3);

//===============================================================================
// Decreases the target's Attack and Defense by 1 stage each. (Tickle)
//===============================================================================
export class LowerTargetAtkDef1 extends TargetMultiStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1, "DEFENSE", 1];
  }
}
registerMoveClass("LowerTargetAtkDef1", LowerTargetAtkDef1);

//===============================================================================
// Decreases the target's Attack and Special Attack by 1 stage each. (Noble Roar)
//===============================================================================
export class LowerTargetAtkSpAtk1 extends TargetMultiStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1, "SPECIAL_ATTACK", 1];
  }
}
registerMoveClass("LowerTargetAtkSpAtk1", LowerTargetAtkSpAtk1);

//===============================================================================
// Decreases the Attack, Special Attack and Speed of all poisoned targets by 1
// stage each. (Venom Drench)
//===============================================================================
export class LowerPoisonedTargetAtkSpAtkSpd1 extends Move {
  statDown: (Id | number)[];
  validTargets: number[] = [];

  override canMagicCoat(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1, "SPECIAL_ATTACK", 1, "SPEED", 1];
  }

  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    this.validTargets = [];
    for (const b of targets) {
      if (!b || b.fainted()) continue;
      if (!b.poisoned()) continue;
      if (!(await b.pbCanLowerStatStage("ATTACK", user, this)) &&
          !(await b.pbCanLowerStatStage("SPECIAL_ATTACK", user, this)) &&
          !(await b.pbCanLowerStatStage("SPEED", user, this))) continue;
      this.validTargets.push(b.index);
    }
    if (this.validTargets.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  async pbCheckForMirrorArmor(user: Battler, target: Battler): Promise<boolean> {
    if (target.hasActiveAbility("MIRRORARMOR") && user.index !== target.index) {
      let failed = true;
      for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
        if (target.statStageAtMin(this.statDown[i * 2] as Id)) continue;
        if (!(await user.pbCanLowerStatStage(this.statDown[i * 2] as Id, target, this, false, false, true))) continue;
        failed = false;
        break;
      }
      if (failed) {
        await this.battle.pbShowAbilitySplash(target);
        if (!Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1}'s {2} activated!", target.pbThis(), target.abilityName()));
        }
        await user.pbCanLowerStatStage(this.statDown[0] as Id, target, this, true, false, true); // Show fail message
        await this.battle.pbHideAbilitySplash(target);
        return false;
      }
    }
    return true;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (!this.validTargets.includes(target.index)) return;
    if (!(await this.pbCheckForMirrorArmor(user, target))) return;
    let showAnim = true;
    let showMirrorArmorSplash = true;
    for (let i = 0; i < Math.floor(this.statDown.length / 2); i++) {
      if (!(await target.pbCanLowerStatStage(this.statDown[i * 2] as Id, user, this))) continue;
      if (await target.pbLowerStatStage(this.statDown[i * 2] as Id, this.statDown[(i * 2) + 1] as number, user,
        showAnim, false, showMirrorArmorSplash ? 1 : 3)) {
        showAnim = false;
      }
      showMirrorArmorSplash = false;
    }
    await this.battle.pbHideAbilitySplash(target); // To hide target's Mirror Armor splash
  }
}
registerMoveClass("LowerPoisonedTargetAtkSpAtkSpd1", LowerPoisonedTargetAtkSpAtkSpd1);

//===============================================================================
// Raises the Attack and Defense of all user's allies by 1 stage each. Bypasses
// protections, including Crafty Shield. Fails if there is no ally. (Coaching)
//===============================================================================
export class RaiseUserAndAlliesAtkDef1 extends Move {
  validTargets: Battler[] = [];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.validTargets = [];
    for (const b of this.battle.allSameSideBattlers(user)) {
      if (b.index === user.index) continue;
      if (!(await b.pbCanRaiseStatStage("ATTACK", user, this)) &&
          !(await b.pbCanRaiseStatStage("DEFENSE", user, this))) continue;
      this.validTargets.push(b);
    }
    if (this.validTargets.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.validTargets.some((b) => b.index === target.index)) return false;
    if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s stats can't be raised further!", target.pbThis()));
    return true;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    let showAnim = true;
    if (await target.pbCanRaiseStatStage("ATTACK", user, this)) {
      if (await target.pbRaiseStatStage("ATTACK", 1, user, showAnim)) showAnim = false;
    }
    if (await target.pbCanRaiseStatStage("DEFENSE", user, this)) {
      await target.pbRaiseStatStage("DEFENSE", 1, user, showAnim);
    }
  }
}
registerMoveClass("RaiseUserAndAlliesAtkDef1", RaiseUserAndAlliesAtkDef1);

//===============================================================================
// Increases the user's and its ally's Attack and Special Attack by 1 stage each,
// if they have Plus or Minus. (Gear Up)
//===============================================================================
// NOTE: In Gen 5, this move should have a target of UserSide, while in Gen 6+ it
//       should have a target of UserAndAllies. This is because, in Gen 5, this
//       move shouldn't call def pbSuccessCheckAgainstTarget for each Pokémon
//       currently in battle that will be affected by this move (i.e. allies
//       aren't protected by their substitute/ability/etc., but they are in Gen
//       6+). We achieve this by not targeting any battlers in Gen 5, since
//       pbSuccessCheckAgainstTarget is only called for targeted battlers.
export class RaisePlusMinusUserAndAlliesAtkSpAtk1 extends Move {
  validTargets: Battler[] = [];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.validTargets = [];
    for (const b of this.battle.allSameSideBattlers(user)) {
      if (!b.hasActiveAbility(["MINUS", "PLUS"])) continue;
      if (!(await b.pbCanRaiseStatStage("ATTACK", user, this)) &&
          !(await b.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this))) continue;
      this.validTargets.push(b);
    }
    if (this.validTargets.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.validTargets.some((b) => b.index === target.index)) return false;
    if (!target.hasActiveAbility(["MINUS", "PLUS"])) return true;
    if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s stats can't be raised further!", target.pbThis()));
    return true;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    let showAnim = true;
    if (await target.pbCanRaiseStatStage("ATTACK", user, this)) {
      if (await target.pbRaiseStatStage("ATTACK", 1, user, showAnim)) showAnim = false;
    }
    if (await target.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) {
      await target.pbRaiseStatStage("SPECIAL_ATTACK", 1, user, showAnim);
    }
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (this.pbTarget(user).id !== "UserSide") return;
    for (const b of this.validTargets) await this.pbEffectAgainstTarget(user, b);
  }
}
registerMoveClass("RaisePlusMinusUserAndAlliesAtkSpAtk1", RaisePlusMinusUserAndAlliesAtkSpAtk1);

//===============================================================================
// Increases the user's and its ally's Defense and Special Defense by 1 stage
// each, if they have Plus or Minus. (Magnetic Flux)
//===============================================================================
// NOTE: In Gen 5, this move should have a target of UserSide, while in Gen 6+ it
//       should have a target of UserAndAllies. This is because, in Gen 5, this
//       move shouldn't call def pbSuccessCheckAgainstTarget for each Pokémon
//       currently in battle that will be affected by this move (i.e. allies
//       aren't protected by their substitute/ability/etc., but they are in Gen
//       6+). We achieve this by not targeting any battlers in Gen 5, since
//       pbSuccessCheckAgainstTarget is only called for targeted battlers.
export class RaisePlusMinusUserAndAlliesDefSpDef1 extends Move {
  validTargets: Battler[] = [];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.validTargets = [];
    for (const b of this.battle.allSameSideBattlers(user)) {
      if (!b.hasActiveAbility(["MINUS", "PLUS"])) continue;
      if (!(await b.pbCanRaiseStatStage("DEFENSE", user, this)) &&
          !(await b.pbCanRaiseStatStage("SPECIAL_DEFENSE", user, this))) continue;
      this.validTargets.push(b);
    }
    if (this.validTargets.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.validTargets.some((b) => b.index === target.index)) return false;
    if (!target.hasActiveAbility(["MINUS", "PLUS"])) return true;
    if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s stats can't be raised further!", target.pbThis()));
    return true;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    let showAnim = true;
    if (await target.pbCanRaiseStatStage("DEFENSE", user, this)) {
      if (await target.pbRaiseStatStage("DEFENSE", 1, user, showAnim)) showAnim = false;
    }
    if (await target.pbCanRaiseStatStage("SPECIAL_DEFENSE", user, this)) {
      await target.pbRaiseStatStage("SPECIAL_DEFENSE", 1, user, showAnim);
    }
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (this.pbTarget(user).id !== "UserSide") return;
    for (const b of this.validTargets) await this.pbEffectAgainstTarget(user, b);
  }
}
registerMoveClass("RaisePlusMinusUserAndAlliesDefSpDef1", RaisePlusMinusUserAndAlliesDefSpDef1);

//===============================================================================
// Increases the Attack and Special Attack of all Grass-type Pokémon in battle by
// 1 stage each. Doesn't affect airborne Pokémon. (Rototiller)
//===============================================================================
export class RaiseGroundedGrassBattlersAtkSpAtk1 extends Move {
  validTargets: number[] = [];

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.validTargets = [];
    for (const b of this.battle.allBattlers()) {
      if (!b.pbHasType("GRASS")) continue;
      if (b.airborne() || b.semiInvulnerable()) continue;
      if (!(await b.pbCanRaiseStatStage("ATTACK", user, this)) &&
          !(await b.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this))) continue;
      this.validTargets.push(b.index);
    }
    if (this.validTargets.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.validTargets.includes(target.index)) return false;
    if (!target.pbHasType("GRASS")) return true;
    if (target.airborne() || target.semiInvulnerable()) return true;
    if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s stats can't be raised further!", target.pbThis()));
    return true;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    let showAnim = true;
    if (await target.pbCanRaiseStatStage("ATTACK", user, this)) {
      if (await target.pbRaiseStatStage("ATTACK", 1, user, showAnim)) showAnim = false;
    }
    if (await target.pbCanRaiseStatStage("SPECIAL_ATTACK", user, this)) {
      await target.pbRaiseStatStage("SPECIAL_ATTACK", 1, user, showAnim);
    }
  }
}
registerMoveClass("RaiseGroundedGrassBattlersAtkSpAtk1", RaiseGroundedGrassBattlersAtkSpAtk1);

//===============================================================================
// Increases the Defense of all Grass-type Pokémon on the field by 1 stage each.
// (Flower Shield)
//===============================================================================
export class RaiseGrassBattlersDef1 extends Move {
  validTargets: number[] = [];

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    this.validTargets = [];
    for (const b of this.battle.allBattlers()) {
      if (!b.pbHasType("GRASS")) continue;
      if (b.semiInvulnerable()) continue;
      if (!(await b.pbCanRaiseStatStage("DEFENSE", user, this))) continue;
      this.validTargets.push(b.index);
    }
    if (this.validTargets.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.validTargets.includes(target.index)) return false;
    if (!target.pbHasType("GRASS") || target.semiInvulnerable()) return true;
    return !(await target.pbCanRaiseStatStage("DEFENSE", user, this, showMessage));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await target.pbRaiseStatStage("DEFENSE", 1, user);
  }
}
registerMoveClass("RaiseGrassBattlersDef1", RaiseGrassBattlersDef1);

//===============================================================================
// User and target swap their Attack and Special Attack stat stages. (Power Swap)
//===============================================================================
export class UserTargetSwapAtkSpAtkStages extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (const s of ["ATTACK", "SPECIAL_ATTACK"]) {
      if (user.stages[s]! > target.stages[s]!) {
        user.statsLoweredThisRound = true;
        user.statsDropped = true;
        target.statsRaisedThisRound = true;
      } else if (user.stages[s]! < target.stages[s]!) {
        user.statsRaisedThisRound = true;
        target.statsLoweredThisRound = true;
        target.statsDropped = true;
      }
      [user.stages[s], target.stages[s]] = [target.stages[s]!, user.stages[s]!];
    }
    await this.battle.pbDisplay(_INTL("{1} switched all changes to its Attack and Sp. Atk with the target!", user.pbThis()));
  }
}
registerMoveClass("UserTargetSwapAtkSpAtkStages", UserTargetSwapAtkSpAtkStages);

//===============================================================================
// User and target swap their Defense and Special Defense stat stages. (Guard Swap)
//===============================================================================
export class UserTargetSwapDefSpDefStages extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (const s of ["DEFENSE", "SPECIAL_DEFENSE"]) {
      if (user.stages[s]! > target.stages[s]!) {
        user.statsLoweredThisRound = true;
        user.statsDropped = true;
        target.statsRaisedThisRound = true;
      } else if (user.stages[s]! < target.stages[s]!) {
        user.statsRaisedThisRound = true;
        target.statsLoweredThisRound = true;
        target.statsDropped = true;
      }
      [user.stages[s], target.stages[s]] = [target.stages[s]!, user.stages[s]!];
    }
    await this.battle.pbDisplay(_INTL("{1} switched all changes to its Defense and Sp. Def with the target!", user.pbThis()));
  }
}
registerMoveClass("UserTargetSwapDefSpDefStages", UserTargetSwapDefSpDefStages);

//===============================================================================
// User and target swap all their stat stages. (Heart Swap)
//===============================================================================
export class UserTargetSwapStatStages extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (const s of Stat.eachBattle()) {
      if (user.stages[s.id]! > target.stages[s.id]!) {
        user.statsLoweredThisRound = true;
        user.statsDropped = true;
        target.statsRaisedThisRound = true;
      } else if (user.stages[s.id]! < target.stages[s.id]!) {
        user.statsRaisedThisRound = true;
        target.statsLoweredThisRound = true;
        target.statsDropped = true;
      }
      [user.stages[s.id], target.stages[s.id]] = [target.stages[s.id]!, user.stages[s.id]!];
    }
    await this.battle.pbDisplay(_INTL("{1} switched stat changes with the target!", user.pbThis()));
  }
}
registerMoveClass("UserTargetSwapStatStages", UserTargetSwapStatStages);

//===============================================================================
// User copies the target's stat stages. (Psych Up)
//===============================================================================
export class UserCopyTargetStatStages extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    for (const s of Stat.eachBattle()) {
      if (user.stages[s.id]! > target.stages[s.id]!) {
        user.statsLoweredThisRound = true;
        user.statsDropped = true;
      } else if (user.stages[s.id]! < target.stages[s.id]!) {
        user.statsRaisedThisRound = true;
      }
      user.stages[s.id] = target.stages[s.id]!;
    }
    if (Settings.NEW_CRITICAL_HIT_RATE_MECHANICS) {
      user.effects[PBEffects.FocusEnergy] = target.effects[PBEffects.FocusEnergy];
      user.effects[PBEffects.LaserFocus] = target.effects[PBEffects.LaserFocus];
    }
    await this.battle.pbDisplay(_INTL("{1} copied {2}'s stat changes!", user.pbThis(), target.pbThis(true)));
  }
}
registerMoveClass("UserCopyTargetStatStages", UserCopyTargetStatStages);

//===============================================================================
// User gains stat stages equal to each of the target's positive stat stages,
// and target's positive stat stages become 0, before damage calculation.
// (Spectral Thief)
//===============================================================================
export class UserStealTargetPositiveStatStages extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbCalcDamage(user: Battler, target: Battler, numTargets = 1): Promise<void> {
    if (target.hasRaisedStatStages()) {
      await this.pbShowAnimation(this.id, user, target, 1); // Stat stage-draining animation
      await this.battle.pbDisplay(_INTL("{1} stole the target's boosted stats!", user.pbThis()));
      let showAnim = true;
      for (const s of Stat.eachBattle()) {
        if (target.stages[s.id]! <= 0) continue;
        if (await user.pbCanRaiseStatStage(s.id, user, this)) {
          if (await user.pbRaiseStatStage(s.id, target.stages[s.id]!, user, showAnim)) showAnim = false;
        }
        target.statsLoweredThisRound = true;
        target.statsDropped = true;
        target.stages[s.id] = 0;
      }
    }
    await super.pbCalcDamage(user, target, numTargets);
  }
}
registerMoveClass("UserStealTargetPositiveStatStages", UserStealTargetPositiveStatStages);

//===============================================================================
// Reverses all stat changes of the target. (Topsy-Turvy)
//===============================================================================
export class InvertTargetStatStages extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.hasAlteredStatStages()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    for (const s of Stat.eachBattle()) {
      if (target.stages[s.id]! > 0) {
        target.statsLoweredThisRound = true;
        target.statsDropped = true;
      } else if (target.stages[s.id]! < 0) {
        target.statsRaisedThisRound = true;
      }
      target.stages[s.id] = target.stages[s.id]! * -1;
    }
    await this.battle.pbDisplay(_INTL("{1}'s stats were reversed!", target.pbThis()));
  }
}
registerMoveClass("InvertTargetStatStages", InvertTargetStatStages);

//===============================================================================
// Resets all target's stat stages to 0. (Clear Smog)
//===============================================================================
export class ResetTargetStatStages extends Move {
  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (target.damageState.calcDamage > 0 && !target.damageState.substitute &&
        target.hasAlteredStatStages()) {
      target.pbResetStatStages();
      await this.battle.pbDisplay(_INTL("{1}'s stat changes were removed!", target.pbThis()));
    }
  }
}
registerMoveClass("ResetTargetStatStages", ResetTargetStatStages);

//===============================================================================
// Resets all stat stages for all battlers to 0. (Haze)
//===============================================================================
export class ResetAllBattlersStatStages extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.allBattlers().some((b) => b.hasAlteredStatStages())) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    for (const b of this.battle.allBattlers()) b.pbResetStatStages();
    await this.battle.pbDisplay(_INTL("All stat changes were eliminated!"));
  }
}
registerMoveClass("ResetAllBattlersStatStages", ResetAllBattlersStatStages);

//===============================================================================
// For 5 rounds, user's and ally's stat stages cannot be lowered by foes. (Mist)
//===============================================================================
export class StartUserSideImmunityToStatStageLowering extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.Mist] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.Mist] = 5;
    await this.battle.pbDisplay(_INTL("{1} became shrouded in mist!", user.pbTeam()));
  }
}
registerMoveClass("StartUserSideImmunityToStatStageLowering", StartUserSideImmunityToStatStageLowering);

//===============================================================================
// Swaps the user's Attack and Defense stats. (Power Trick)
//===============================================================================
export class UserSwapBaseAtkDef extends Move {
  override canSnatch(): boolean { return true; }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    [user.attack, user.defense] = [user.defense, user.attack];
    user.effects[PBEffects.PowerTrick] = !user.effects[PBEffects.PowerTrick];
    await this.battle.pbDisplay(_INTL("{1} switched its Attack and Defense!", user.pbThis()));
  }
}
registerMoveClass("UserSwapBaseAtkDef", UserSwapBaseAtkDef);

//===============================================================================
// User and target swap their Speed stats (not their stat stages). (Speed Swap)
//===============================================================================
export class UserTargetSwapBaseSpeed extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    [user.speed, target.speed] = [target.speed, user.speed];
    await this.battle.pbDisplay(_INTL("{1} switched Speed with its target!", user.pbThis()));
  }
}
registerMoveClass("UserTargetSwapBaseSpeed", UserTargetSwapBaseSpeed);

//===============================================================================
// Averages the user's and target's Attack.
// Averages the user's and target's Special Attack. (Power Split)
//===============================================================================
export class UserTargetAverageBaseAtkSpAtk extends Move {
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    const newatk = Math.floor((user.attack + target.attack) / 2);
    const newspatk = Math.floor((user.spatk + target.spatk) / 2);
    user.attack = target.attack = newatk;
    user.spatk = target.spatk = newspatk;
    await this.battle.pbDisplay(_INTL("{1} shared its power with the target!", user.pbThis()));
  }
}
registerMoveClass("UserTargetAverageBaseAtkSpAtk", UserTargetAverageBaseAtkSpAtk);

//===============================================================================
// Averages the user's and target's Defense.
// Averages the user's and target's Special Defense. (Guard Split)
//===============================================================================
export class UserTargetAverageBaseDefSpDef extends Move {
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    const newdef = Math.floor((user.defense + target.defense) / 2);
    const newspdef = Math.floor((user.spdef + target.spdef) / 2);
    user.defense = target.defense = newdef;
    user.spdef = target.spdef = newspdef;
    await this.battle.pbDisplay(_INTL("{1} shared its guard with the target!", user.pbThis()));
  }
}
registerMoveClass("UserTargetAverageBaseDefSpDef", UserTargetAverageBaseDefSpDef);

//===============================================================================
// Averages the user's and target's current HP. (Pain Split)
//===============================================================================
export class UserTargetAverageHP extends Move {
  /** ZUD Mechanics (redefined): changes to HP are based on the non-Dynamax HP. */
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    const userRealHp = user.realHp() as number;
    const targetRealHp = target.realHp() as number;
    const newHP = Math.floor((userRealHp + targetRealHp) / 2);
    if (user.realHp()! > newHP) {
      user.ignoreDynamax = true;
      await user.pbReduceHP(user.realHp()! - newHP, false, false);
    } else if (user.realHp()! < newHP) {
      user.ignoreDynamax = true;
      await user.pbRecoverHP(newHP - user.realHp()!, false);
    }
    if (target.realHp()! > newHP) {
      target.ignoreDynamax = true;
      await target.pbReduceHP(target.realHp()! - newHP, false, false);
    } else if (target.realHp()! < newHP) {
      target.ignoreDynamax = true;
      await target.pbRecoverHP(newHP - target.realHp()!, false);
    }
    await this.battle.pbDisplay(_INTL("The battlers shared their pain!"));
    await user.pbItemHPHealCheck();
    await target.pbItemHPHealCheck();
  }
}
registerMoveClass("UserTargetAverageHP", UserTargetAverageHP);

//===============================================================================
// For 4 rounds, doubles the Speed of all battlers on the user's side. (Tailwind)
//===============================================================================
export class StartUserSideDoubleSpeed extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.Tailwind] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** Generation 9 Pack (redefined): Wind Rider and Wind Power procs. */
  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.Tailwind] = 4;
    await this.battle.pbDisplay(_INTL("The Tailwind blew from behind {1}!", user.pbTeam(true)));
    // NOTE (Ruby parity): the Gen 9 Pack calls allSameSideBattlers with no
    //       argument (idxBattler defaults to 0), so this always checks the
    //       player's side, whichever side used Tailwind.
    for (const b of this.battle.allSameSideBattlers()) {
      if (!b || b.fainted()) continue;
      if (b.hasActiveAbility("WINDRIDER") && (await b.pbCanRaiseStatStage("ATTACK", b, this))) {
        await b.pbRaiseStatStageByAbility("ATTACK", 1, b);
      } else if (b.hasActiveAbility("WINDPOWER") && b.effects[PBEffects.Charge] === 0) {
        await this.battle.pbShowAbilitySplash(b);
        b.effects[PBEffects.Charge] = 2;
        await this.battle.pbDisplay(_INTL("Being hit by Tailwind charged {1} with power!", b.pbThis(true)));
        await this.battle.pbHideAbilitySplash(b);
      }
    }
  }
}
registerMoveClass("StartUserSideDoubleSpeed", StartUserSideDoubleSpeed);

//===============================================================================
// For 5 rounds, swaps all battlers' base Defense with base Special Defense.
// (Wonder Room)
//===============================================================================
export class StartSwapAllBattlersBaseDefensiveStats extends Move {
  override async pbEffectGeneral(_user: Battler): Promise<void> {
    if (this.battle.field.effects[PBEffects.WonderRoom] > 0) {
      this.battle.field.effects[PBEffects.WonderRoom] = 0;
      await this.battle.pbDisplay(_INTL("Wonder Room wore off, and the Defense and Sp. Def stats returned to normal!"));
    } else {
      this.battle.field.effects[PBEffects.WonderRoom] = 5;
      await this.battle.pbDisplay(_INTL("It created a bizarre area in which the Defense and Sp. Def stats are swapped!"));
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.battle.field.effects[PBEffects.WonderRoom] > 0) return; // No animation
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("StartSwapAllBattlersBaseDefensiveStats", StartSwapAllBattlersBaseDefensiveStats);
