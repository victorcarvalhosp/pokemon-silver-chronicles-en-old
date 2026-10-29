// Port of Data/Scripts/011_Battle/003_Move/013_MoveEffects_SwitchingActing.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:149): HigherPriorityInGrassyTerrain#pbPriority
//   (typo fix; same as this repo's core); :160 LowerPPOfTargetLastMoveBy3
//   (pbFailsAgainstTarget? returns super, i.e. no status-move failure check;
//   pbEffectAgainstTarget redefined, later replaced by ZUD).
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:155): SwitchOutTargetStatusMove
//   (pbFailsAgainstTarget? aliased: Commander and Guard Dog; pbSwitchOutTargetEffect
//   redefined: Guard Dog, Commander); :202 SwitchOutTargetDamagingMove#pbSwitchOutTargetEffect
//   (redefined: Guard Dog, Commander; later replaced by ZUD).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:104): LowerPPOfTargetLastMoveBy4#pbEffectAgainstTarget
//   (Dynamax base move PP); :126 LowerPPOfTargetLastMoveBy3#pbEffectAgainstTarget (Dynamax base
//   move PP); :385 DisableTargetUsingDifferentMove#pbFailsAgainstTarget? (aliased: last move was a
//   Z-Move); :450 FleeFromBattle#pbMoveFailed? (redefined: Max Raid battles); :466
//   SwitchOutUserStatusMove#pbMoveFailed? (aliased: Max Raid boss); :483 SwitchOutTargetDamagingMove
//   (pbEffectAgainstTarget aliased: Max Raid battles; pbSwitchOutTargetEffect redefined: Dynamax).
// Alias chains (load order Hotfixes → Gen 9 → ZUD):
//   SwitchOutTargetStatusMove#pbFailsAgainstTarget? = Gen 9( core )
//   SwitchOutTargetStatusMove#pbSwitchOutTargetEffect = Gen 9 (redefined)
//   SwitchOutTargetDamagingMove#pbEffectAgainstTarget = ZUD( core )
//   SwitchOutTargetDamagingMove#pbSwitchOutTargetEffect = ZUD (redefined, replaces Gen 9's)
//   SwitchOutUserStatusMove#pbMoveFailed? = ZUD( core ); FleeFromBattle#pbMoveFailed? = ZUD (redefined)
//   DisableTargetUsingDifferentMove#pbFailsAgainstTarget? = ZUD( core )
//   LowerPPOfTargetLastMoveBy3#pbEffectAgainstTarget = ZUD (redefined, replaces Hotfixes')
//   LowerPPOfTargetLastMoveBy4#pbEffectAgainstTarget = ZUD (redefined)
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Move, registerMoveClass } from "./Move";
import { TargetMultiStatDownMove } from "./Move_BaseEffects";

//===============================================================================
// User flees from battle. (Teleport (Gen 7-))
//===============================================================================
export class FleeFromBattle extends Move {
  /** ZUD Mechanics (redefined): move fails when used by any Pokemon in a Max Raid battle. */
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.pbCanRun(user.index) || this.battle.raidBattle) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    await this.battle.pbDisplay(_INTL("{1} fled from battle!", user.pbThis()));
    this.battle.decision = 3; // Escaped
  }
}
registerMoveClass("FleeFromBattle", FleeFromBattle);

//===============================================================================
// User switches out. If user is a wild Pokémon, ends the battle instead.
// (Teleport (Gen 8+))
//===============================================================================
export class SwitchOutUserStatusMove extends Move {
  override async pbMoveFailed(user: Battler, targets: Battler[]): Promise<boolean> {
    // ZUD Mechanics: move fails when used by a Max Raid Pokemon.
    if (user.effects[PBEffects.MaxRaidBoss]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return this.coreMoveFailed(user, targets);
  }

  /** The core pbMoveFailed? (ZUD's zud_pbMoveFailed?). */
  private async coreMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.wild()) {
      if (!this.battle.pbCanRun(user.index)) {
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
    } else if (!this.battle.pbCanChooseNonActive(user.index)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], _numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (user.wild()) return;
    await this.battle.pbDisplay(_INTL("{1} went back to {2}!", user.pbThis(),
      this.battle.pbGetOwnerName(user.index)));
    await this.battle.pbPursuit(user.index);
    if (user.fainted()) return;
    const newPkmn = await this.battle.pbGetReplacementPokemonIndex(user.index); // Owner chooses
    if (newPkmn < 0) return;
    await this.battle.pbRecallAndReplace(user.index, newPkmn);
    this.battle.pbClearChoice(user.index); // Replacement Pokémon does nothing this round
    this.battle.moldBreaker = false;
    await this.battle.pbOnBattlerEnteringBattle(user.index);
    switchedBattlers.push(user.index);
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (user.wild()) {
      await this.battle.pbDisplay(_INTL("{1} fled from battle!", user.pbThis()));
      this.battle.decision = 3; // Escaped
    }
  }
}
registerMoveClass("SwitchOutUserStatusMove", SwitchOutUserStatusMove);

//===============================================================================
// After inflicting damage, user switches out. Ignores trapping moves.
// (U-turn, Volt Switch)
//===============================================================================
export class SwitchOutUserDamagingMove extends Move {
  override async pbEndOfMoveUsageEffect(user: Battler, targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (user.fainted() || numHits === 0 || this.battle.pbAllFainted(user.idxOpposingSide())) return;
    let targetSwitched = true;
    for (const b of targets) {
      if (!switchedBattlers.includes(b.index)) targetSwitched = false;
    }
    if (targetSwitched) return;
    if (!this.battle.pbCanChooseNonActive(user.index)) return;
    await this.battle.pbDisplay(_INTL("{1} went back to {2}!", user.pbThis(),
      this.battle.pbGetOwnerName(user.index)));
    await this.battle.pbPursuit(user.index);
    if (user.fainted()) return;
    const newPkmn = await this.battle.pbGetReplacementPokemonIndex(user.index); // Owner chooses
    if (newPkmn < 0) return;
    await this.battle.pbRecallAndReplace(user.index, newPkmn);
    this.battle.pbClearChoice(user.index); // Replacement Pokémon does nothing this round
    this.battle.moldBreaker = false;
    await this.battle.pbOnBattlerEnteringBattle(user.index);
    switchedBattlers.push(user.index);
  }
}
registerMoveClass("SwitchOutUserDamagingMove", SwitchOutUserDamagingMove);

//===============================================================================
// Decreases the target's Attack and Special Attack by 1 stage each. Then, user
// switches out. Ignores trapping moves. (Parting Shot)
//===============================================================================
export class LowerTargetAtkSpAtk1SwitchOutUser extends TargetMultiStatDownMove {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.statDown = ["ATTACK", 1, "SPECIAL_ATTACK", 1];
  }

  override async pbEndOfMoveUsageEffect(user: Battler, targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    let switcher = user;
    for (const b of targets) {
      if (switchedBattlers.includes(b.index)) continue;
      if (b.effects[PBEffects.MagicCoat] || b.effects[PBEffects.MagicBounce]) switcher = b;
    }
    if (switcher.fainted() || numHits === 0) return;
    if (!this.battle.pbCanChooseNonActive(switcher.index)) return;
    await this.battle.pbDisplay(_INTL("{1} went back to {2}!", switcher.pbThis(),
      this.battle.pbGetOwnerName(switcher.index)));
    await this.battle.pbPursuit(switcher.index);
    if (switcher.fainted()) return;
    const newPkmn = await this.battle.pbGetReplacementPokemonIndex(switcher.index); // Owner chooses
    if (newPkmn < 0) return;
    await this.battle.pbRecallAndReplace(switcher.index, newPkmn);
    this.battle.pbClearChoice(switcher.index); // Replacement Pokémon does nothing this round
    if (switcher.index === user.index) this.battle.moldBreaker = false;
    await this.battle.pbOnBattlerEnteringBattle(switcher.index);
    switchedBattlers.push(switcher.index);
  }
}
registerMoveClass("LowerTargetAtkSpAtk1SwitchOutUser", LowerTargetAtkSpAtk1SwitchOutUser);

//===============================================================================
// User switches out. Various effects affecting the user are passed to the
// replacement. (Baton Pass)
//===============================================================================
export class SwitchOutUserPassOnEffects extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!this.battle.pbCanChooseNonActive(user.index)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (user.fainted() || numHits === 0) return;
    if (!this.battle.pbCanChooseNonActive(user.index)) return;
    await this.battle.pbPursuit(user.index);
    if (user.fainted()) return;
    const newPkmn = await this.battle.pbGetReplacementPokemonIndex(user.index); // Owner chooses
    if (newPkmn < 0) return;
    await this.battle.pbRecallAndReplace(user.index, newPkmn, false, true);
    this.battle.pbClearChoice(user.index); // Replacement Pokémon does nothing this round
    this.battle.moldBreaker = false;
    await this.battle.pbOnBattlerEnteringBattle(user.index);
    switchedBattlers.push(user.index);
  }
}
registerMoveClass("SwitchOutUserPassOnEffects", SwitchOutUserPassOnEffects);

//===============================================================================
// In wild battles, makes target flee. Fails if target is a higher level than the
// user.
// In trainer battles, target switches out.
// For status moves. (Roar, Whirlwind)
//===============================================================================
export class SwitchOutTargetStatusMove extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  /** Generation 9 Pack (aliased): adds Commander and Guard Dog immunity. */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.isCommander()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.hasActiveAbility("GUARDDOG") && !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} anchors itself!", target.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1} anchors itself with {2}!", target.pbThis(), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    return this.coreFailsAgainstTarget(user, target, showMessage);
  }

  /** The core pbFailsAgainstTarget? (Gen 9 Pack's paldea_pbFailsAgainstTarget?). */
  private async coreFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.hasActiveAbility("SUCTIONCUPS") && !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} anchors itself!", target.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1} anchors itself with {2}!", target.pbThis(), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    if (target.effects[PBEffects.Ingrain]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("{1} anchored itself with its roots!", target.pbThis()));
      return true;
    }
    if (!this.battle.canRun) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (this.battle.wildBattle() && target.level > user.level) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (this.battle.trainerBattle()) {
      let canSwitch = false;
      // (Ruby breaks out of eachInTeamFromBattlerIndex; the rest of the loop has
      // no side effects, so it just stops checking here.)
      this.battle.eachInTeamFromBattlerIndex(target.index, (_pkmn, i) => {
        if (canSwitch) return;
        if (!this.battle.pbCanSwitchLax(target.index, i)) return;
        canSwitch = true;
      });
      if (!canSwitch) {
        if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
        return true;
      }
    }
    return false;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    if (this.battle.wildBattle()) this.battle.decision = 3; // Escaped from battle
  }

  /** Generation 9 Pack (redefined): Guard Dog and Commander prevent the switch. */
  override async pbSwitchOutTargetEffect(user: Battler, targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (this.battle.wildBattle() || switchedBattlers.length > 0) return;
    if (user.fainted() || numHits === 0) return;
    for (const b of targets) {
      if (b.fainted() || b.damageState.unaffected) continue;
      if (b.effects[PBEffects.Ingrain]) continue;
      if (b.hasActiveAbility(["SUCTIONCUPS", "GUARDDOG"]) && !this.battle.moldBreaker) continue;
      if (b.isCommander()) continue;
      const newPkmn = await this.battle.pbGetReplacementPokemonIndex(b.index, true); // Random
      if (newPkmn < 0) continue;
      await this.battle.pbRecallAndReplace(b.index, newPkmn, true);
      await this.battle.pbDisplay(_INTL("{1} was dragged out!", b.pbThis()));
      this.battle.pbClearChoice(b.index); // Replacement Pokémon does nothing this round
      await this.battle.pbOnBattlerEnteringBattle(b.index);
      switchedBattlers.push(b.index);
      break;
    }
  }
}
registerMoveClass("SwitchOutTargetStatusMove", SwitchOutTargetStatusMove);

//===============================================================================
// In wild battles, makes target flee. Fails if target is a higher level than the
// user.
// In trainer battles, target switches out.
// For damaging moves. (Circle Throw, Dragon Tail)
//===============================================================================
export class SwitchOutTargetDamagingMove extends Move {
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    // ZUD Mechanics: forced switch fails to trigger if user is Raid Boss.
    if (this.battle.raidBattle) return;
    if (this.battle.wildBattle() && target.level <= user.level && this.battle.canRun &&
        (target.effects[PBEffects.Substitute] === 0 || this.ignoresSubstitute(user))) {
      this.battle.decision = 3;
    }
  }

  /**
   * ZUD Mechanics (redefined, replacing Generation 9 Pack's version): forced
   * switch fails to trigger if target is Dynamaxed; Guard Dog and Commander
   * (Generation 9 Pack) also prevent it.
   */
  override async pbSwitchOutTargetEffect(user: Battler, targets: Battler[], numHits: number,
    switchedBattlers: number[]): Promise<void> {
    if (this.battle.wildBattle() || switchedBattlers.length > 0) return;
    if (user.fainted() || numHits === 0) return;
    for (const b of targets) {
      if (b.fainted() || b.damageState.unaffected || b.damageState.substitute || b.dynamax()) continue;
      if (b.effects[PBEffects.Ingrain]) continue;
      if (b.hasActiveAbility(["SUCTIONCUPS", "GUARDDOG"]) && !this.battle.moldBreaker) continue;
      if (b.isCommander()) continue; // defined?(b.isCommander?) is true (Generation 9 Pack)
      const newPkmn = await this.battle.pbGetReplacementPokemonIndex(b.index, true); // Random
      if (newPkmn < 0) continue;
      await this.battle.pbRecallAndReplace(b.index, newPkmn, true);
      await this.battle.pbDisplay(_INTL("{1} was dragged out!", b.pbThis()));
      this.battle.pbClearChoice(b.index); // Replacement Pokémon does nothing this round
      await this.battle.pbOnBattlerEnteringBattle(b.index);
      switchedBattlers.push(b.index);
      break;
    }
  }
}
registerMoveClass("SwitchOutTargetDamagingMove", SwitchOutTargetDamagingMove);

//===============================================================================
// Trapping move. Traps for 5 or 6 rounds. Trapped Pokémon lose 1/16 of max HP
// at end of each round.
//===============================================================================
export class BindTarget extends Move {
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (target.fainted() || target.damageState.substitute) return;
    if (target.effects[PBEffects.Trapping] > 0) return;
    // Set trapping effect duration and info
    if (user.hasActiveItem("GRIPCLAW")) {
      target.effects[PBEffects.Trapping] = (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 5) ? 8 : 6;
    } else {
      target.effects[PBEffects.Trapping] = 5 + this.battle.pbRandom(2);
    }
    target.effects[PBEffects.TrappingMove] = this.id;
    target.effects[PBEffects.TrappingUser] = user.index;
    // Message
    let msg = _INTL("{1} was trapped in the vortex!", target.pbThis());
    switch (this.id) {
      case "BIND":
        msg = _INTL("{1} was squeezed by {2}!", target.pbThis(), user.pbThis(true));
        break;
      case "CLAMP":
        msg = _INTL("{1} clamped {2}!", user.pbThis(), target.pbThis(true));
        break;
      case "FIRESPIN":
        msg = _INTL("{1} was trapped in the fiery vortex!", target.pbThis());
        break;
      case "INFESTATION":
        msg = _INTL("{1} has been afflicted with an infestation by {2}!", target.pbThis(), user.pbThis(true));
        break;
      case "MAGMASTORM":
        msg = _INTL("{1} became trapped by Magma Storm!", target.pbThis());
        break;
      case "SANDTOMB":
        msg = _INTL("{1} became trapped by Sand Tomb!", target.pbThis());
        break;
      case "WHIRLPOOL":
        msg = _INTL("{1} became trapped in the vortex!", target.pbThis());
        break;
      case "WRAP":
        msg = _INTL("{1} was wrapped by {2}!", target.pbThis(), user.pbThis(true));
        break;
    }
    await this.battle.pbDisplay(msg);
  }
}
registerMoveClass("BindTarget", BindTarget);

//===============================================================================
// Trapping move. Traps for 5 or 6 rounds. Trapped Pokémon lose 1/16 of max HP
// at end of each round. (Whirlpool)
// Power is doubled if target is using Dive. Hits some semi-invulnerable targets.
//===============================================================================
export class BindTargetDoublePowerIfTargetUnderwater extends BindTarget {
  override hitsDivingTargets(): boolean { return true; }

  override pbModifyDamage(damageMult: number, _user: Battler, target: Battler): number {
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderwater")) damageMult *= 2;
    return damageMult;
  }
}
registerMoveClass("BindTargetDoublePowerIfTargetUnderwater", BindTargetDoublePowerIfTargetUnderwater);

//===============================================================================
// Target can no longer switch out or flee, as long as the user remains active.
// (Anchor Shot, Block, Mean Look, Spider Web, Spirit Shackle, Thousand Waves)
//===============================================================================
export class TrapTargetInBattle extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (target.effects[PBEffects.MeanLook] >= 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (Settings.MORE_TYPE_EFFECTS && target.pbHasType("GHOST")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    target.effects[PBEffects.MeanLook] = user.index;
    await this.battle.pbDisplay(_INTL("{1} can no longer escape!", target.pbThis()));
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.fainted() || target.damageState.substitute) return;
    if (target.effects[PBEffects.MeanLook] >= 0) return;
    if (Settings.MORE_TYPE_EFFECTS && target.pbHasType("GHOST")) return;
    target.effects[PBEffects.MeanLook] = user.index;
    await this.battle.pbDisplay(_INTL("{1} can no longer escape!", target.pbThis()));
  }
}
registerMoveClass("TrapTargetInBattle", TrapTargetInBattle);

//===============================================================================
// The target can no longer switch out or flee, while the user remains in battle.
// At the end of each round, the target's Defense and Special Defense are lowered
// by 1 stage each. (Octolock)
//===============================================================================
export class TrapTargetInBattleLowerTargetDefSpDef1EachTurn extends Move {
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (target.effects[PBEffects.Octolock] >= 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (Settings.MORE_TYPE_EFFECTS && target.pbHasType("GHOST")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Octolock] = user.index;
    await this.battle.pbDisplay(_INTL("{1} can no longer escape because of {2}!", target.pbThis(), this.name));
  }
}
registerMoveClass("TrapTargetInBattleLowerTargetDefSpDef1EachTurn", TrapTargetInBattleLowerTargetDefSpDef1EachTurn);

//===============================================================================
// Prevents the user and the target from switching out or fleeing. This effect
// isn't applied if either Pokémon is already prevented from switching out or
// fleeing. (Jaw Lock)
//===============================================================================
export class TrapUserAndTargetInBattle extends Move {
  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (user.fainted() || target.fainted() || target.damageState.substitute) return;
    if (Settings.MORE_TYPE_EFFECTS && target.pbHasType("GHOST")) return;
    if (user.trappedInBattle() || target.trappedInBattle()) return;
    target.effects[PBEffects.JawLock] = user.index;
    await this.battle.pbDisplay(_INTL("Neither Pokémon can run away!"));
  }
}
registerMoveClass("TrapUserAndTargetInBattle", TrapUserAndTargetInBattle);

//===============================================================================
// No Pokémon can switch out or flee until the end of the next round. (Fairy Lock)
//===============================================================================
export class TrapAllBattlersInBattleForOneTurn extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.effects[PBEffects.FairyLock] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    this.battle.field.effects[PBEffects.FairyLock] = 2;
    await this.battle.pbDisplay(_INTL("No one will be able to run away during the next turn!"));
  }
}
registerMoveClass("TrapAllBattlersInBattleForOneTurn", TrapAllBattlersInBattleForOneTurn);

//===============================================================================
// Interrupts a foe switching out or using U-turn/Volt Switch/Parting Shot. Power
// is doubled in that case. (Pursuit)
// (Handled in Battle's pbAttackPhase): Makes this attack happen before switching.
//===============================================================================
export class PursueSwitchingFoe extends Move {
  override pbAccuracyCheck(user: Battler, target: Battler): boolean {
    if (this.battle.switching) return true;
    return super.pbAccuracyCheck(user, target);
  }

  override pbBaseDamage(baseDmg: number, _user: Battler, _target: Battler): number {
    if (this.battle.switching) baseDmg *= 2;
    return baseDmg;
  }
}
registerMoveClass("PursueSwitchingFoe", PursueSwitchingFoe);

//===============================================================================
// Fails if user has not been hit by an opponent's physical move this round.
// (Shell Trap)
//===============================================================================
export class UsedAfterUserTakesPhysicalDamage extends Move {
  override async pbDisplayChargeMessage(user: Battler): Promise<void> {
    user.effects[PBEffects.ShellTrap] = true;
    await this.battle.pbCommonAnimation("ShellTrap", user);
    await this.battle.pbDisplay(_INTL("{1} set a shell trap!", user.pbThis()));
  }

  override async pbDisplayUseMessage(user: Battler): Promise<void> {
    if (user.tookPhysicalHit) await super.pbDisplayUseMessage(user);
  }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.effects[PBEffects.ShellTrap]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (!user.tookPhysicalHit) {
      await this.battle.pbDisplay(_INTL("{1}'s shell trap didn't work!", user.pbThis()));
      return true;
    }
    return false;
  }
}
registerMoveClass("UsedAfterUserTakesPhysicalDamage", UsedAfterUserTakesPhysicalDamage);

//===============================================================================
// Power is doubled if a user's ally has already used this move this round. (Round)
// If an ally is about to use the same move, make it go next, ignoring priority.
//===============================================================================
export class UsedAfterAllyRoundWithDoublePower extends Move {
  override pbBaseDamage(baseDmg: number, user: Battler, _target: Battler): number {
    if (user.pbOwnSide().effects[PBEffects.Round]) baseDmg *= 2;
    return baseDmg;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.Round] = true;
    for (const b of user.allAllies()) {
      if (this.battle.choices[b.index]![0] !== "UseMove" || b.movedThisRound()) continue;
      if ((this.battle.choices[b.index]![2] as Move).function !== this.function) continue;
      b.effects[PBEffects.MoveNext] = true;
      b.effects[PBEffects.Quash] = 0;
      break;
    }
  }
}
registerMoveClass("UsedAfterAllyRoundWithDoublePower", UsedAfterAllyRoundWithDoublePower);

//===============================================================================
// Target moves immediately after the user, ignoring priority/speed. (After You)
//===============================================================================
export class TargetActsNext extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // Target has already moved this round
    if (await this.pbMoveFailedTargetAlreadyMoved(target, showMessage)) return true;
    // Target was going to move next anyway (somehow)
    if (target.effects[PBEffects.MoveNext]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    // Target didn't choose to use a move this round
    const oppMove = this.battle.choices[target.index]![2] as Move | null | undefined;
    if (!oppMove) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.MoveNext] = true;
    target.effects[PBEffects.Quash] = 0;
    await this.battle.pbDisplay(_INTL("{1} took the kind offer!", target.pbThis()));
  }
}
registerMoveClass("TargetActsNext", TargetActsNext);

//===============================================================================
// Target moves last this round, ignoring priority/speed. (Quash)
//===============================================================================
export class TargetActsLast extends Move {
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (await this.pbMoveFailedTargetAlreadyMoved(target, showMessage)) return true;
    // Target isn't going to use a move
    const oppMove = this.battle.choices[target.index]![2] as Move | null | undefined;
    if (!oppMove) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    // Target is already maximally Quashed and will move last anyway
    let highestQuash = 0;
    for (const b of this.battle.allBattlers()) {
      if (b.effects[PBEffects.Quash] <= highestQuash) continue;
      highestQuash = b.effects[PBEffects.Quash];
    }
    if (highestQuash > 0 && target.effects[PBEffects.Quash] === highestQuash) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    // Target was already going to move last
    if (highestQuash === 0 && this.battle.pbPriority().at(-1)!.index === target.index) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    let highestQuash = 0;
    for (const b of this.battle.allBattlers()) {
      if (b.effects[PBEffects.Quash] <= highestQuash) continue;
      highestQuash = b.effects[PBEffects.Quash];
    }
    target.effects[PBEffects.Quash] = highestQuash + 1;
    target.effects[PBEffects.MoveNext] = false;
    await this.battle.pbDisplay(_INTL("{1}'s move was postponed!", target.pbThis()));
  }
}
registerMoveClass("TargetActsLast", TargetActsLast);

//===============================================================================
// The target uses its most recent move again. (Instruct)
//===============================================================================
export class TargetUsesItsLastUsedMoveAgain extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  moveBlacklist: string[] = [
    "MultiTurnAttackBideThenReturnDoubleDamage",       // Bide
    "ProtectUserFromDamagingMovesKingsShield",         // King's Shield
    "TargetUsesItsLastUsedMoveAgain",                  // Instruct (this move)
    // Struggle
    "Struggle",                                        // Struggle
    // Moves that affect the moveset
    "ReplaceMoveThisBattleWithTargetLastMoveUsed",     // Mimic
    "ReplaceMoveWithTargetLastMoveUsed",               // Sketch
    "TransformUserIntoTarget",                         // Transform
    // Moves that call other moves
    "UseLastMoveUsedByTarget",                         // Mirror Move
    "UseLastMoveUsed",                                 // Copycat
    "UseMoveTargetIsAboutToUse",                       // Me First
    "UseMoveDependingOnEnvironment",                   // Nature Power
    "UseRandomUserMoveIfAsleep",                       // Sleep Talk
    "UseRandomMoveFromUserParty",                      // Assist
    "UseRandomMove",                                   // Metronome
    // Moves that require a recharge turn
    "AttackAndSkipNextTurn",                           // Hyper Beam
    // Two-turn attacks
    "TwoTurnAttack",                                   // Razor Wind
    "TwoTurnAttackOneTurnInSun",                       // Solar Beam, Solar Blade
    "TwoTurnAttackParalyzeTarget",                     // Freeze Shock
    "TwoTurnAttackBurnTarget",                         // Ice Burn
    "TwoTurnAttackFlinchTarget",                       // Sky Attack
    "TwoTurnAttackChargeRaiseUserDefense1",            // Skull Bash
    "TwoTurnAttackInvulnerableInSky",                  // Fly
    "TwoTurnAttackInvulnerableUnderground",            // Dig
    "TwoTurnAttackInvulnerableUnderwater",             // Dive
    "TwoTurnAttackInvulnerableInSkyParalyzeTarget",    // Bounce
    "TwoTurnAttackInvulnerableRemoveProtections",      // Shadow Force, Phantom Force
    "TwoTurnAttackInvulnerableInSkyTargetCannotAct",   // Sky Drop
    "AllBattlersLoseHalfHPUserSkipsNextTurn",          // Shadow Half
    "TwoTurnAttackRaiseUserSpAtkSpDefSpd2",            // Geomancy
    // Moves that start focussing at the start of the round
    "FailsIfUserDamagedThisTurn",                      // Focus Punch
    "UsedAfterUserTakesPhysicalDamage",                // Shell Trap
    "BurnAttackerBeforeUserActs",                      // Beak Blast
  ];

  constructor(battle: Battle, move: PokemonMove | null) { super(battle, move); }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.lastRegularMoveUsed || !target.pbHasMove(target.lastRegularMoveUsed)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.usingMultiTurnAttack()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    const targetMove = this.battle.choices[target.index]![2] as Move | null | undefined;
    if (targetMove && (targetMove.function === "FailsIfUserDamagedThisTurn" ||   // Focus Punch
                       targetMove.function === "UsedAfterUserTakesPhysicalDamage" ||   // Shell Trap
                       targetMove.function === "BurnAttackerBeforeUserActs")) {   // Beak Blast
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (this.moveBlacklist.includes(MoveData.get(target.lastRegularMoveUsed).functionCode)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    let idxMove = -1;
    target.eachMoveWithIndex((m, i) => {
      if (m.id === target.lastRegularMoveUsed) idxMove = i;
    });
    // NOTE (Ruby parity): ZUD's pbHasMove? looks at the base moves while
    // Dynamaxed, so idxMove can stay -1; Ruby's moves[-1] is then the last move
    // (hence .at()).
    const move = target.moves.at(idxMove)!;
    if (move.pp === 0 && move.totalPp() > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Instruct] = true;
  }
}
registerMoveClass("TargetUsesItsLastUsedMoveAgain", TargetUsesItsLastUsedMoveAgain);

//===============================================================================
// For 5 rounds, for each priority bracket, slow Pokémon move before fast ones.
// (Trick Room)
//===============================================================================
export class StartSlowerBattlersActFirst extends Move {
  override async pbEffectGeneral(user: Battler): Promise<void> {
    if (this.battle.field.effects[PBEffects.TrickRoom] > 0) {
      this.battle.field.effects[PBEffects.TrickRoom] = 0;
      await this.battle.pbDisplay(_INTL("{1} reverted the dimensions!", user.pbThis()));
    } else {
      this.battle.field.effects[PBEffects.TrickRoom] = 5;
      await this.battle.pbDisplay(_INTL("{1} twisted the dimensions!", user.pbThis()));
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    if (this.battle.field.effects[PBEffects.TrickRoom] > 0) return; // No animation
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
  }
}
registerMoveClass("StartSlowerBattlersActFirst", StartSlowerBattlersActFirst);

//===============================================================================
// If Grassy Terrain applies, priority is increased by 1. (Grassy Glide)
//===============================================================================
export class HigherPriorityInGrassyTerrain extends Move {
  /** v20.1 Hotfixes: fixed typo (same as this repo's core). */
  override pbPriority(user: Battler): number {
    let ret = super.pbPriority(user);
    if (this.battle.field.terrain === "Grassy" && user.affectedByTerrain()) ret += 1;
    return ret;
  }
}
registerMoveClass("HigherPriorityInGrassyTerrain", HigherPriorityInGrassyTerrain);

//===============================================================================
// Target's last move used loses 3 PP. Damaging move. (Eerie Spell)
//===============================================================================
export class LowerPPOfTargetLastMoveBy3 extends Move {
  // v20.1 Hotfixes: pbFailsAgainstTarget? just returns super (the base method).

  /**
   * ZUD Mechanics (redefined): reduced PP of Max Moves is properly applied to
   * the base move as well.
   */
  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (target.fainted()) return;
    const lastMove = target.pbGetMoveWithID(target.lastRegularMoveUsed);
    if (!lastMove || lastMove.pp === 0 || lastMove.totalPp() <= 0) return;
    const reduction = Math.min(3, lastMove.pp);
    target.pbSetPP(lastMove, lastMove.pp - reduction);
    let moveName = lastMove.name;
    if (target.dynamax()) {
      // .at(): Ruby's base_moves[-1] when power_index is -1
      const baseMove = target.baseMoves.at(target.powerIndex) as Move;
      target.pbSetPP(baseMove, baseMove.pp - reduction);
      moveName = baseMove.name;
    }
    await this.battle.pbDisplay(_INTL("It reduced the PP of {1}'s {2} by {3}!",
      target.pbThis(true), moveName, reduction));
  }
}
registerMoveClass("LowerPPOfTargetLastMoveBy3", LowerPPOfTargetLastMoveBy3);

//===============================================================================
// Target's last move used loses 4 PP. Status move. (Spite)
//===============================================================================
export class LowerPPOfTargetLastMoveBy4 extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    const lastMove = target.pbGetMoveWithID(target.lastRegularMoveUsed);
    if (!lastMove || lastMove.pp === 0 || lastMove.totalPp() <= 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /**
   * ZUD Mechanics (redefined): reduced PP of Max Moves is properly applied to
   * the base move as well.
   */
  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    const lastMove = target.pbGetMoveWithID(target.lastRegularMoveUsed)!;
    const reduction = Math.min(4, lastMove.pp);
    target.pbSetPP(lastMove, lastMove.pp - reduction);
    let moveName = lastMove.name;
    if (target.dynamax()) {
      // .at(): Ruby's base_moves[-1] when power_index is -1
      const baseMove = target.baseMoves.at(target.powerIndex) as Move;
      target.pbSetPP(baseMove, baseMove.pp - reduction);
      moveName = baseMove.name;
    }
    await this.battle.pbDisplay(_INTL("It reduced the PP of {1}'s {2} by {3}!",
      target.pbThis(true), moveName, reduction));
  }
}
registerMoveClass("LowerPPOfTargetLastMoveBy4", LowerPPOfTargetLastMoveBy4);

//===============================================================================
// For 5 rounds, disables the last move the target used. (Disable)
//===============================================================================
export class DisableTargetLastMoveUsed extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Disable] > 0 || !target.lastRegularMoveUsed) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedAromaVeil(user, target, showMessage)) return true;
    let canDisable = false;
    for (const m of target.moves) {
      if (m.id !== target.lastRegularMoveUsed) continue;
      if (m.pp === 0 && m.totalPp() > 0) continue;
      canDisable = true;
      break;
    }
    if (!canDisable) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Disable] = 5;
    target.effects[PBEffects.DisableMove] = target.lastRegularMoveUsed;
    await this.battle.pbDisplay(_INTL("{1}'s {2} was disabled!", target.pbThis(),
      MoveData.get(target.lastRegularMoveUsed!).name));
    await target.pbItemStatusCureCheck();
  }
}
registerMoveClass("DisableTargetLastMoveUsed", DisableTargetLastMoveUsed);

//===============================================================================
// The target can no longer use the same move twice in a row. (Torment)
//===============================================================================
export class DisableTargetUsingSameMoveConsecutively extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Torment]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedAromaVeil(user, target, showMessage)) return true;
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Torment] = true;
    await this.battle.pbDisplay(_INTL("{1} was subjected to torment!", target.pbThis()));
    await target.pbItemStatusCureCheck();
  }
}
registerMoveClass("DisableTargetUsingSameMoveConsecutively", DisableTargetUsingSameMoveConsecutively);

//===============================================================================
// For 4 rounds, the target must use the same move each round. (Encore)
//===============================================================================
export class DisableTargetUsingDifferentMove extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  moveBlacklist: string[];

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.moveBlacklist = [
      "DisableTargetUsingDifferentMove",   // Encore
      // Struggle
      "Struggle",   // Struggle
      // Moves that affect the moveset
      "ReplaceMoveThisBattleWithTargetLastMoveUsed",   // Mimic
      "ReplaceMoveWithTargetLastMoveUsed",   // Sketch
      "TransformUserIntoTarget",   // Transform
      // Moves that call other moves (see also below)
      "UseLastMoveUsedByTarget",   // Mirror Move
    ];
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7) {
      this.moveBlacklist = this.moveBlacklist.concat([
        // Moves that call other moves
//        "UseLastMoveUsedByTarget",   // Mirror Move                 // See above
        "UseLastMoveUsed",   // Copycat
        "UseMoveTargetIsAboutToUse",   // Me First
        "UseMoveDependingOnEnvironment",   // Nature Power
        "UseRandomUserMoveIfAsleep",   // Sleep Talk
        "UseRandomMoveFromUserParty",   // Assist
        "UseRandomMove",   // Metronome
      ]);
    }
  }

  /**
   * ZUD Mechanics (aliased): move fails if the target's last used move was a
   * Z-Move. No effect on Max Moves because Dynamax Pokemon are already immune
   * to Encore.
   */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.lastMoveUsedIsZMove) {
      // NOTE (Ruby parity): ZUD shows this message even when show_message is false.
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return this.coreFailsAgainstTarget(user, target, showMessage);
  }

  /** The core pbFailsAgainstTarget? (ZUD's zud_pbFailsAgainstTarget?). */
  private async coreFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Encore] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (!target.lastRegularMoveUsed ||
        this.moveBlacklist.includes(MoveData.get(target.lastRegularMoveUsed).functionCode)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.effects[PBEffects.ShellTrap]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedAromaVeil(user, target, showMessage)) return true;
    let canEncore = false;
    for (const m of target.moves) {
      if (m.id !== target.lastRegularMoveUsed) continue;
      if (m.pp === 0 && m.totalPp() > 0) continue;
      canEncore = true;
      break;
    }
    if (!canEncore) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Encore] = 4;
    target.effects[PBEffects.EncoreMove] = target.lastRegularMoveUsed;
    await this.battle.pbDisplay(_INTL("{1} received an encore!", target.pbThis()));
    await target.pbItemStatusCureCheck();
  }
}
registerMoveClass("DisableTargetUsingDifferentMove", DisableTargetUsingDifferentMove);

//===============================================================================
// For 4 rounds, disables the target's non-damaging moves. (Taunt)
//===============================================================================
export class DisableTargetStatusMoves extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Taunt] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedAromaVeil(user, target, showMessage)) return true;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && target.hasActiveAbility("OBLIVIOUS") &&
        !this.battle.moldBreaker) {
      if (showMessage) {
        await this.battle.pbShowAbilitySplash(target);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("But it failed!"));
        } else {
          await this.battle.pbDisplay(_INTL("But it failed because of {1}'s {2}!",
            target.pbThis(true), target.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(target);
      }
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Taunt] = 4;
    await this.battle.pbDisplay(_INTL("{1} fell for the taunt!", target.pbThis()));
    await target.pbItemStatusCureCheck();
  }
}
registerMoveClass("DisableTargetStatusMoves", DisableTargetStatusMoves);

//===============================================================================
// For 5 rounds, disables the target's healing moves. (Heal Block)
//===============================================================================
export class DisableTargetHealingMoves extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.HealBlock] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (await this.pbMoveFailedAromaVeil(user, target, showMessage)) return true;
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.HealBlock] = 5;
    await this.battle.pbDisplay(_INTL("{1} was prevented from healing!", target.pbThis()));
    await target.pbItemStatusCureCheck();
  }
}
registerMoveClass("DisableTargetHealingMoves", DisableTargetHealingMoves);

//===============================================================================
// Target cannot use sound-based moves for 2 more rounds. (Throat Chop)
//===============================================================================
export class DisableTargetSoundMoves extends Move {
  override async pbAdditionalEffect(_user: Battler, target: Battler): Promise<void> {
    if (target.fainted() || target.damageState.substitute) return;
    if (target.effects[PBEffects.ThroatChop] === 0) {
      await this.battle.pbDisplay(_INTL("The effects of {1} prevent {2} from using certain moves!",
        this.name, target.pbThis(true)));
    }
    target.effects[PBEffects.ThroatChop] = 3;
  }
}
registerMoveClass("DisableTargetSoundMoves", DisableTargetSoundMoves);

//===============================================================================
// Disables all target's moves that the user also knows. (Imprison)
//===============================================================================
export class DisableTargetMovesKnownByUser extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Imprison]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.Imprison] = true;
    await this.battle.pbDisplay(_INTL("{1} sealed any moves its target shares with it!", user.pbThis()));
  }
}
registerMoveClass("DisableTargetMovesKnownByUser", DisableTargetMovesKnownByUser);
