// Port of Data/Scripts/011_Battle/003_Move/007_MoveEffects_BattlerOther.rb, with:
// - Generation 9 Pack ([002] Moves/[000] Move Functions.rb:13): GiveUserStatusToTarget
//   (pbEffectAgainstTarget passes on Drowsy/Frostbite); :38 CureUserPartyStatus
//   (pbAromatherapyHeal redefined: Drowsy/Frostbite messages); :356
//   SetUserAbilityToTargetAbility (pbMoveFailed?: fails if the user holds an
//   Ability Shield); :372 UserTargetSwapAbilities (pbMoveFailed? and
//   pbFailsAgainstTarget?: Ability Shield); :398 SetTargetAbilityToUserAbility,
//   :415 SetTargetAbilityToInsomnia, :432 SetTargetAbilityToSimple, :449
//   NegateTargetAbility (pbFailsAgainstTarget?: Ability Shield); :466
//   NegateTargetAbilityIfTargetActed (pbEffectAgainstTarget: Ability Shield);
//   :479 IgnoreTargetAbility (pbOnStartUse: Ability Shield turns Mold Breaker
//   off again).
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:379):
//   TransformUserIntoTarget (pbShowAnimation redefined: sets
//   PBEffects::TransformPokemon).
// - ZUD Mechanics ([008] Overrides/Override_Moves.rb:246): TransformUserIntoTarget
//   (pbFailsAgainstTarget?: a Dynamaxed user can't transform into a Pokémon
//   that can't Dynamax).
// Alias chains: GiveUserStatusToTarget#pbEffectAgainstTarget = Gen 9( core );
//   SetUserAbilityToTargetAbility#pbMoveFailed? = Gen 9( core );
//   UserTargetSwapAbilities#pbMoveFailed?/pbFailsAgainstTarget? = Gen 9( core );
//   SetTargetAbilityToUserAbility/Insomnia/Simple, NegateTargetAbility
//   #pbFailsAgainstTarget? = Gen 9( core );
//   NegateTargetAbilityIfTargetActed#pbEffectAgainstTarget = Gen 9( core );
//   TransformUserIntoTarget#pbFailsAgainstTarget? = ZUD( core ),
//   #pbShowAnimation = Deluxe (redefined, no alias);
//   CureUserPartyStatus#pbAromatherapyHeal = Gen 9 (redefined, no alias);
//   IgnoreTargetAbility#pbOnStartUse = Gen 9 (new).
//
// Sync/async of the overridden methods: see the table in Move_Usage.ts.
// CureUserPartyStatus#pbAromatherapyHeal (new here) shows messages: async.

import { Ability } from "../../data/gameData/ability";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Scene } from "../BattleSceneInterface";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";
import { Move, registerMoveClass } from "./Move";

/** Ruby's `a.ability == b.ability` (GameData#==; nil == nil is true). */
function sameAbility(a: Battler, b: Battler): boolean {
  const abilA = a.ability;
  const abilB = b.ability;
  if (!abilA) return abilB == null;
  return abilB != null && abilA.id === abilB.id;
}

/** Ruby's Array#== for type arrays. */
function sameTypes(a: Id[], b: Id[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

//===============================================================================
// Puts the target to sleep.
//===============================================================================
export class SleepTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanSleepAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbSleep();
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanSleep(user, false, this)) await target.pbSleep();
  }
}
registerMoveClass("SleepTarget", SleepTarget);

//===============================================================================
// Puts the target to sleep. Fails if user is not Darkrai. (Dark Void (Gen 7+))
//===============================================================================
export class SleepTargetIfUserDarkrai extends SleepTarget {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.isSpecies("DARKRAI") && user.effects[PBEffects.TransformSpecies] !== "DARKRAI") {
      await this.battle.pbDisplay(_INTL("But {1} can't use the move!", user.pbThis()));
      return true;
    }
    return false;
  }
}
registerMoveClass("SleepTargetIfUserDarkrai", SleepTargetIfUserDarkrai);

//===============================================================================
// Puts the target to sleep. Changes the user's form if the user is Meloetta.
// (Relic Song)
//===============================================================================
export class SleepTargetChangeUserMeloettaForm extends SleepTarget {
  override async pbEndOfMoveUsageEffect(user: Battler, _targets: Battler[], numHits: number,
    _switchedBattlers: number[]): Promise<void> {
    if (numHits === 0) return;
    if (user.fainted() || user.effects[PBEffects.Transform]) return;
    if (!user.isSpecies("MELOETTA")) return;
    if (user.hasActiveAbility("SHEERFORCE") && this.addlEffect > 0) return;
    const newForm = (user.form + 1) % 2;
    await user.pbChangeForm(newForm, _INTL("{1} transformed!", user.pbThis()));
  }
}
registerMoveClass("SleepTargetChangeUserMeloettaForm", SleepTargetChangeUserMeloettaForm);

//===============================================================================
// Makes the target drowsy; it falls asleep at the end of the next turn. (Yawn)
//===============================================================================
export class SleepTargetNextTurn extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Yawn] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    // NOTE (Ruby parity): Ruby passes showMessages = true here, not show_message.
    if (!(await target.pbCanSleepAsync(user, true, this))) return true;
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Yawn] = 2;
    await this.battle.pbDisplay(_INTL("{1} made {2} drowsy!", user.pbThis(), target.pbThis(true)));
  }
}
registerMoveClass("SleepTargetNextTurn", SleepTargetNextTurn);

//===============================================================================
// Poisons the target.
//===============================================================================
export class PoisonTarget extends Move {
  /** Ruby: @toxic (true for BadPoisonTarget). */
  toxic: boolean;

  override canMagicCoat(): boolean { return true; }

  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.toxic = false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanPoisonAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbPoison(user, null, this.toxic);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanPoison(user, false, this)) await target.pbPoison(user, null, this.toxic);
  }
}
registerMoveClass("PoisonTarget", PoisonTarget);

//===============================================================================
// Poisons the target and decreases its Speed by 1 stage. (Toxic Thread)
//===============================================================================
export class PoisonTargetLowerTargetSpeed1 extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.pbCanPoison(user, false, this) &&
        !(await target.pbCanLowerStatStage("SPEED", user, this))) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (target.pbCanPoison(user, false, this)) await target.pbPoison(user);
    if (await target.pbCanLowerStatStage("SPEED", user, this)) {
      await target.pbLowerStatStage("SPEED", 1, user);
    }
  }
}
registerMoveClass("PoisonTargetLowerTargetSpeed1", PoisonTargetLowerTargetSpeed1);

//===============================================================================
// Badly poisons the target. (Poison Fang, Toxic)
//===============================================================================
export class BadPoisonTarget extends PoisonTarget {
  constructor(battle: Battle, move: PokemonMove | null) {
    super(battle, move);
    this.toxic = true;
  }

  override pbOverrideSuccessCheckPerHit(user: Battler, _target: Battler): boolean {
    return (Settings.MORE_TYPE_EFFECTS && this.statusMove() && user.pbHasType("POISON"));
  }
}
registerMoveClass("BadPoisonTarget", BadPoisonTarget);

//===============================================================================
// Paralyzes the target.
//===============================================================================
export class ParalyzeTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanParalyzeAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbParalyze(user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user);
  }
}
registerMoveClass("ParalyzeTarget", ParalyzeTarget);

//===============================================================================
// Paralyzes the target. Doesn't affect target if move's type has no effect on
// it. (Thunder Wave)
//===============================================================================
export class ParalyzeTargetIfNotTypeImmune extends ParalyzeTarget {
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (Effectiveness.ineffective(target.damageState.typeMod)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      return true;
    }
    return super.pbFailsAgainstTarget(user, target, showMessage);
  }
}
registerMoveClass("ParalyzeTargetIfNotTypeImmune", ParalyzeTargetIfNotTypeImmune);

//===============================================================================
// Paralyzes the target. Accuracy perfect in rain, 50% in sunshine. Hits some
// semi-invulnerable targets. (Thunder)
//===============================================================================
export class ParalyzeTargetAlwaysHitsInRainHitsTargetInSky extends ParalyzeTarget {
  override hitsFlyingTargets(): boolean { return true; }

  override pbBaseAccuracy(user: Battler, target: Battler): number {
    switch (target.effectiveWeather()) {
      case "Sun":
      case "HarshSun":
        return 50;
      case "Rain":
      case "HeavyRain":
        return 0;
    }
    return super.pbBaseAccuracy(user, target);
  }
}
registerMoveClass("ParalyzeTargetAlwaysHitsInRainHitsTargetInSky", ParalyzeTargetAlwaysHitsInRainHitsTargetInSky);

//===============================================================================
// Paralyzes the target. May cause the target to flinch. (Thunder Fang)
//===============================================================================
export class ParalyzeFlinchTarget extends Move {
  override flinchingMove(): boolean { return true; }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    const chance = this.pbAdditionalEffectChance(user, target, 10);
    if (chance === 0) return;
    if (target.pbCanParalyze(user, false, this) && this.battle.pbRandom(100) < chance) {
      await target.pbParalyze(user);
    }
    if (this.battle.pbRandom(100) < chance) target.pbFlinch(user);
  }
}
registerMoveClass("ParalyzeFlinchTarget", ParalyzeFlinchTarget);

//===============================================================================
// Burns the target.
//===============================================================================
export class BurnTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanBurnAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbBurn(user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanBurn(user, false, this)) await target.pbBurn(user);
  }
}
registerMoveClass("BurnTarget", BurnTarget);

//===============================================================================
// Burns the target if any of its stats were increased this round.
// (Burning Jealousy)
//===============================================================================
export class BurnTargetIfTargetStatsRaisedThisTurn extends BurnTarget {
  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.statsRaisedThisRound) await super.pbAdditionalEffect(user, target);
  }
}
registerMoveClass("BurnTargetIfTargetStatsRaisedThisTurn", BurnTargetIfTargetStatsRaisedThisTurn);

//===============================================================================
// Burns the target. May cause the target to flinch. (Fire Fang)
//===============================================================================
export class BurnFlinchTarget extends Move {
  override flinchingMove(): boolean { return true; }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    const chance = this.pbAdditionalEffectChance(user, target, 10);
    if (chance === 0) return;
    if (target.pbCanBurn(user, false, this) && this.battle.pbRandom(100) < chance) {
      await target.pbBurn(user);
    }
    if (this.battle.pbRandom(100) < chance) target.pbFlinch(user);
  }
}
registerMoveClass("BurnFlinchTarget", BurnFlinchTarget);

//===============================================================================
// Freezes the target.
//===============================================================================
export class FreezeTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanFreezeAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbFreeze();
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanFreeze(user, false, this)) await target.pbFreeze();
  }
}
registerMoveClass("FreezeTarget", FreezeTarget);

//===============================================================================
// Freezes the target. Effectiveness against Water-type is 2x. (Freeze-Dry)
//===============================================================================
export class FreezeTargetSuperEffectiveAgainstWater extends FreezeTarget {
  override pbCalcTypeModSingle(moveType: Id, defType: Id, user: Battler, target: Battler): number {
    if (defType === "WATER") return Effectiveness.SUPER_EFFECTIVE_ONE;
    return super.pbCalcTypeModSingle(moveType, defType, user, target);
  }
}
registerMoveClass("FreezeTargetSuperEffectiveAgainstWater", FreezeTargetSuperEffectiveAgainstWater);

//===============================================================================
// Freezes the target. Accuracy perfect in hail. (Blizzard)
//===============================================================================
export class FreezeTargetAlwaysHitsInHail extends FreezeTarget {
  override pbBaseAccuracy(user: Battler, target: Battler): number {
    if (target.effectiveWeather() === "Hail") return 0;
    return super.pbBaseAccuracy(user, target);
  }
}
registerMoveClass("FreezeTargetAlwaysHitsInHail", FreezeTargetAlwaysHitsInHail);

//===============================================================================
// Freezes the target. May cause the target to flinch. (Ice Fang)
//===============================================================================
export class FreezeFlinchTarget extends Move {
  override flinchingMove(): boolean { return true; }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    const chance = this.pbAdditionalEffectChance(user, target, 10);
    if (chance === 0) return;
    if (target.pbCanFreeze(user, false, this) && this.battle.pbRandom(100) < chance) {
      await target.pbFreeze();
    }
    if (this.battle.pbRandom(100) < chance) target.pbFlinch(user);
  }
}
registerMoveClass("FreezeFlinchTarget", FreezeFlinchTarget);

//===============================================================================
// Burns, freezes or paralyzes the target. (Tri Attack)
//===============================================================================
export class ParalyzeBurnOrFreezeTarget extends Move {
  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    switch (this.battle.pbRandom(3)) {
      case 0: if (target.pbCanBurn(user, false, this)) await target.pbBurn(user); break;
      case 1: if (target.pbCanFreeze(user, false, this)) await target.pbFreeze(); break;
      case 2: if (target.pbCanParalyze(user, false, this)) await target.pbParalyze(user); break;
    }
  }
}
registerMoveClass("ParalyzeBurnOrFreezeTarget", ParalyzeBurnOrFreezeTarget);

//===============================================================================
// User passes its status problem to the target. (Psycho Shift)
//===============================================================================
export class GiveUserStatusToTarget extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.status === "NONE") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.pbCanInflictStatus(user.status, user, false, this)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** Generation 9 Pack: adds messages for Drowsy/Frostbite. */
  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    // Generation 9 Pack
    if (["DROWSY", "FROSTBITE"].includes(user.status)) {
      switch (user.status) {
        case "DROWSY":
          await target.pbSleep();
          await user.pbCureStatus(false);
          await this.battle.pbDisplay(_INTL("{1} became alert again.", user.pbThis()));
          break;
        case "FROSTBITE":
          await target.pbFreeze();
          await user.pbCureStatus(false);
          await this.battle.pbDisplay(_INTL("{1}'s frostbite was healed.", user.pbThis()));
          break;
      }
      return;
    }
    // Essentials
    let msg = "";
    switch (user.status) {
      case "SLEEP":
        await target.pbSleep();
        msg = _INTL("{1} woke up.", user.pbThis());
        break;
      case "POISON":
        await target.pbPoison(user, null, user.statusCount !== 0);
        msg = _INTL("{1} was cured of its poisoning.", user.pbThis());
        break;
      case "BURN":
        await target.pbBurn(user);
        msg = _INTL("{1}'s burn was healed.", user.pbThis());
        break;
      case "PARALYSIS":
        await target.pbParalyze(user);
        msg = _INTL("{1} was cured of paralysis.", user.pbThis());
        break;
      case "FROZEN":
        await target.pbFreeze();
        msg = _INTL("{1} was thawed out.", user.pbThis());
        break;
    }
    if (msg !== "") {
      await user.pbCureStatus(false);
      await this.battle.pbDisplay(msg);
    }
  }
}
registerMoveClass("GiveUserStatusToTarget", GiveUserStatusToTarget);

//===============================================================================
// Cures user of burn, poison and paralysis. (Refresh)
//===============================================================================
export class CureUserBurnPoisonParalysis extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!["BURN", "POISON", "PARALYSIS"].includes(user.status)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const oldStatus = user.status;
    await user.pbCureStatus(false);
    switch (oldStatus) {
      case "BURN":
        await this.battle.pbDisplay(_INTL("{1} healed its burn!", user.pbThis()));
        break;
      case "POISON":
        await this.battle.pbDisplay(_INTL("{1} cured its poisoning!", user.pbThis()));
        break;
      case "PARALYSIS":
        await this.battle.pbDisplay(_INTL("{1} cured its paralysis!", user.pbThis()));
        break;
    }
  }
}
registerMoveClass("CureUserBurnPoisonParalysis", CureUserBurnPoisonParalysis);

//===============================================================================
// Cures all party Pokémon of permanent status problems. (Aromatherapy, Heal Bell)
//===============================================================================
// NOTE: In Gen 5, this move should have a target of UserSide, while in Gen 6+ it
//       should have a target of UserAndAllies. This is because, in Gen 5, this
//       move shouldn't call def pbSuccessCheckAgainstTarget for each Pokémon
//       currently in battle that will be affected by this move (i.e. allies
//       aren't protected by their substitute/ability/etc., but they are in Gen
//       6+). We achieve this by not targeting any battlers in Gen 5, since
//       pbSuccessCheckAgainstTarget is only called for targeted battlers.
export class CureUserPartyStatus extends Move {
  override canSnatch(): boolean { return true; }
  override worksWithNoTargets(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    let hasEffect = this.battle.allSameSideBattlers(user).some((b) => b.status !== "NONE");
    if (!hasEffect) {
      hasEffect = this.battle.pbParty(user.index).some((pkmn) => pkmn?.able() && pkmn.status !== "NONE");
    }
    if (!hasEffect) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, _showMessage: boolean): Promise<boolean> {
    return target.status === "NONE";
  }

  /** Generation 9 Pack (redefined): adds messages for Drowsy/Frostbite. (Async: shows messages.) */
  async pbAromatherapyHeal(pkmn: Pokemon | null, battler: Battler | null = null): Promise<void> {
    const oldStatus = (battler) ? battler.status : pkmn!.status;
    const curedName = (battler) ? battler.pbThis() : pkmn!.name;
    if (battler) {
      await battler.pbCureStatus(false);
    } else {
      pkmn!.status = "NONE";
      pkmn!.statusCount = 0;
    }
    switch (oldStatus) {
      case "SLEEP":
        await this.battle.pbDisplay(_INTL("{1} was woken from sleep.", curedName));
        break;
      case "POISON":
        await this.battle.pbDisplay(_INTL("{1} was cured of its poisoning.", curedName));
        break;
      case "BURN":
        await this.battle.pbDisplay(_INTL("{1}'s burn was healed.", curedName));
        break;
      case "PARALYSIS":
        await this.battle.pbDisplay(_INTL("{1} was cured of paralysis.", curedName));
        break;
      case "FROZEN":
        await this.battle.pbDisplay(_INTL("{1} was thawed out.", curedName));
        break;
      case "DROWSY":
        await this.battle.pbDisplay(_INTL("{1} became alert again.", curedName));
        break;
      case "FROSTBITE":
        await this.battle.pbDisplay(_INTL("{1}'s frostbite was healed.", curedName));
        break;
    }
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    // Cure all Pokémon in battle on the user's side.
    await this.pbAromatherapyHeal(target.pokemon, target);
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    // Cure all Pokémon in battle on the user's side. For the benefit of the Gen
    // 5 version of this move, to make Pokémon out in battle get cured first.
    if (this.pbTarget(user).id === "UserSide") {
      for (const b of this.battle.allSameSideBattlers(user)) {
        if (b.status !== "NONE") await this.pbAromatherapyHeal(b.pokemon, b);
      }
    }
    // Cure all Pokémon in the user's and partner trainer's party.
    // NOTE: This intentionally affects the partner trainer's inactive Pokémon
    //       too.
    const party = this.battle.pbParty(user.index);
    for (let i = 0; i < party.length; i++) {
      const pkmn = party[i];
      if (!pkmn || !pkmn.able() || pkmn.status === "NONE") continue;
      if (this.battle.pbFindBattler(i, user)) continue; // Skip Pokémon in battle
      await this.pbAromatherapyHeal(pkmn);
    }
  }

  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
    switch (this.id) {
      case "AROMATHERAPY":
        await this.battle.pbDisplay(_INTL("A soothing aroma wafted through the area!"));
        break;
      case "HEALBELL":
        await this.battle.pbDisplay(_INTL("A bell chimed!"));
        break;
    }
  }
}
registerMoveClass("CureUserPartyStatus", CureUserPartyStatus);

//===============================================================================
// Cures the target's burn. (Sparkling Aria)
//===============================================================================
export class CureTargetBurn extends Move {
  override async pbAdditionalEffect(_user: Battler, target: Battler): Promise<void> {
    if (target.fainted() || target.damageState.substitute) return;
    if (target.status !== "BURN") return;
    await target.pbCureStatus();
  }
}
registerMoveClass("CureTargetBurn", CureTargetBurn);

//===============================================================================
// Safeguards the user's side from being inflicted with status problems.
// (Safeguard)
//===============================================================================
export class StartUserSideImmunityToInflictedStatus extends Move {
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.pbOwnSide().effects[PBEffects.Safeguard] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbOwnSide().effects[PBEffects.Safeguard] = 5;
    await this.battle.pbDisplay(_INTL("{1} became cloaked in a mystical veil!", user.pbTeam()));
  }
}
registerMoveClass("StartUserSideImmunityToInflictedStatus", StartUserSideImmunityToInflictedStatus);

//===============================================================================
// Causes the target to flinch.
//===============================================================================
export class FlinchTarget extends Move {
  override flinchingMove(): boolean { return true; }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    target.pbFlinch(user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    target.pbFlinch(user);
  }
}
registerMoveClass("FlinchTarget", FlinchTarget);

//===============================================================================
// Causes the target to flinch. Fails if the user is not asleep. (Snore)
//===============================================================================
export class FlinchTargetFailsIfUserNotAsleep extends FlinchTarget {
  override usableWhenAsleep(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.asleep()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("FlinchTargetFailsIfUserNotAsleep", FlinchTargetFailsIfUserNotAsleep);

//===============================================================================
// Causes the target to flinch. Fails if this isn't the user's first turn.
// (Fake Out)
//===============================================================================
export class FlinchTargetFailsIfNotUserFirstTurn extends FlinchTarget {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.turnCount > 1) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }
}
registerMoveClass("FlinchTargetFailsIfNotUserFirstTurn", FlinchTargetFailsIfNotUserFirstTurn);

//===============================================================================
// Power is doubled if the target is using Bounce, Fly or Sky Drop. Hits some
// semi-invulnerable targets. May make the target flinch. (Twister)
//===============================================================================
export class FlinchTargetDoublePowerIfTargetInSky extends FlinchTarget {
  override hitsFlyingTargets(): boolean { return true; }

  override pbBaseDamage(baseDmg: number, _user: Battler, target: Battler): number {
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
                               "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
                               "TwoTurnAttackInvulnerableInSkyTargetCannotAct") ||
        target.effects[PBEffects.SkyDrop] >= 0) {
      baseDmg *= 2;
    }
    return baseDmg;
  }
}
registerMoveClass("FlinchTargetDoublePowerIfTargetInSky", FlinchTargetDoublePowerIfTargetInSky);

//===============================================================================
// Confuses the target.
//===============================================================================
export class ConfuseTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    return !(await target.pbCanConfuseAsync(user, showMessage, this));
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbConfuse();
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (!target.pbCanConfuse(user, false, this)) return;
    await target.pbConfuse();
  }
}
registerMoveClass("ConfuseTarget", ConfuseTarget);

//===============================================================================
// Confuses the target. Accuracy perfect in rain, 50% in sunshine. Hits some
// semi-invulnerable targets. (Hurricane)
//===============================================================================
export class ConfuseTargetAlwaysHitsInRainHitsTargetInSky extends ConfuseTarget {
  override hitsFlyingTargets(): boolean { return true; }

  override pbBaseAccuracy(user: Battler, target: Battler): number {
    switch (target.effectiveWeather()) {
      case "Sun":
      case "HarshSun":
        return 50;
      case "Rain":
      case "HeavyRain":
        return 0;
    }
    return super.pbBaseAccuracy(user, target);
  }
}
registerMoveClass("ConfuseTargetAlwaysHitsInRainHitsTargetInSky", ConfuseTargetAlwaysHitsInRainHitsTargetInSky);

//===============================================================================
// Attracts the target. (Attract)
//===============================================================================
export class AttractTarget extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (this.damagingMove()) return false;
    if (!(await target.pbCanAttractAsync(user, showMessage))) return true;
    if (await this.pbMoveFailedAromaVeil(user, target, showMessage)) return true;
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (this.damagingMove()) return;
    await target.pbAttract(user);
  }

  override async pbAdditionalEffect(user: Battler, target: Battler): Promise<void> {
    if (target.damageState.substitute) return;
    if (target.pbCanAttract(user, false)) await target.pbAttract(user);
  }
}
registerMoveClass("AttractTarget", AttractTarget);

//===============================================================================
// Changes user's type depending on the environment. (Camouflage)
//===============================================================================
export class SetUserTypesBasedOnEnvironment extends Move {
  /** Ruby: @newType (set by pbMoveFailed?). */
  newType: Id | null = null;

  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.canChangeType()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    this.newType = "NORMAL";
    let checkedTerrain = false;
    switch (this.battle.field.terrain) {
      case "Electric":
        if (Type.exists("ELECTRIC")) {
          this.newType = "ELECTRIC";
          checkedTerrain = true;
        }
        break;
      case "Grassy":
        if (Type.exists("GRASS")) {
          this.newType = "GRASS";
          checkedTerrain = true;
        }
        break;
      case "Misty":
        if (Type.exists("FAIRY")) {
          this.newType = "FAIRY";
          checkedTerrain = true;
        }
        break;
      case "Psychic":
        if (Type.exists("PSYCHIC")) {
          this.newType = "PSYCHIC";
          checkedTerrain = true;
        }
        break;
    }
    if (!checkedTerrain) {
      switch (this.battle.environment) {
        case "Grass": case "TallGrass":
          this.newType = "GRASS";
          break;
        case "MovingWater": case "StillWater": case "Puddle": case "Underwater":
          this.newType = "WATER";
          break;
        case "Cave":
          this.newType = "ROCK";
          break;
        case "Rock": case "Sand":
          this.newType = "GROUND";
          break;
        case "Forest": case "ForestGrass":
          this.newType = "BUG";
          break;
        case "Snow": case "Ice":
          this.newType = "ICE";
          break;
        case "Volcano":
          this.newType = "FIRE";
          break;
        case "Graveyard":
          this.newType = "GHOST";
          break;
        case "Sky":
          this.newType = "FLYING";
          break;
        case "Space":
          this.newType = "DRAGON";
          break;
        case "UltraSpace":
          this.newType = "PSYCHIC";
          break;
      }
    }
    if (!Type.exists(this.newType)) this.newType = "NORMAL";
    if (!Type.exists(this.newType) || !user.pbHasOtherType(this.newType)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.pbChangeTypes(this.newType!);
    const typeName = Type.get(this.newType!).name;
    await this.battle.pbDisplay(_INTL("{1}'s type changed to {2}!", user.pbThis(), typeName));
  }
}
registerMoveClass("SetUserTypesBasedOnEnvironment", SetUserTypesBasedOnEnvironment);

//===============================================================================
// Changes user's type to a random one that resists/is immune to the last move
// used by the target. (Conversion 2)
//===============================================================================
export class SetUserTypesToResistLastAttack extends Move {
  /** Ruby: @newTypes (set by pbFailsAgainstTarget?). */
  newTypes: Id[] = [];

  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.canChangeType()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.lastMoveUsed || !target.lastMoveUsedType ||
        Type.get(target.lastMoveUsedType).pseudoType) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    this.newTypes = [];
    for (const t of Type.each()) {
      if (t.pseudoType || user.pbHasType(t.id) ||
          !Effectiveness.resistantType(target.lastMoveUsedType, t.id)) continue;
      this.newTypes.push(t.id);
    }
    if (this.newTypes.length === 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const newType = this.newTypes[this.battle.pbRandom(this.newTypes.length)]!;
    user.pbChangeTypes(newType);
    const typeName = Type.get(newType).name;
    await this.battle.pbDisplay(_INTL("{1}'s type changed to {2}!", user.pbThis(), typeName));
  }
}
registerMoveClass("SetUserTypesToResistLastAttack", SetUserTypesToResistLastAttack);

//===============================================================================
// User copies target's types. (Reflect Type)
//===============================================================================
export class SetUserTypesToTargetTypes extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.canChangeType()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    const newTypes = target.pbTypes(true);
    if (newTypes.length === 0) { // Target has no type to copy
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (sameTypes(user.pbTypes(), target.pbTypes()) &&
        user.effects[PBEffects.Type3] === target.effects[PBEffects.Type3]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    user.pbChangeTypes(target);
    await this.battle.pbDisplay(_INTL("{1}'s type changed to match {2}'s!",
                                      user.pbThis(), target.pbThis(true)));
  }
}
registerMoveClass("SetUserTypesToTargetTypes", SetUserTypesToTargetTypes);

//===============================================================================
// Changes user's type to that of a random user's move, except a type the user
// already has (even partially), OR changes to the user's first move's type.
// (Conversion)
//===============================================================================
export class SetUserTypesToUserMoveType extends Move {
  /** Ruby: @newTypes (set by pbMoveFailed?). */
  newTypes: Id[] = [];

  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.canChangeType()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    const userTypes = user.pbTypes(true);
    this.newTypes = [];
    // (Ruby: user.eachMoveWithIndex, with a break)
    for (let i = 0; i < user.moves.length; i++) {
      const m = user.moves[i]!;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && i > 0) break;
      if (Type.get(m.type!).pseudoType) continue;
      if (userTypes.includes(m.type!)) continue;
      if (!this.newTypes.includes(m.type!)) this.newTypes.push(m.type!);
    }
    if (this.newTypes.length === 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    const newType = this.newTypes[this.battle.pbRandom(this.newTypes.length)]!;
    user.pbChangeTypes(newType);
    const typeName = Type.get(newType).name;
    await this.battle.pbDisplay(_INTL("{1}'s type changed to {2}!", user.pbThis(), typeName));
  }
}
registerMoveClass("SetUserTypesToUserMoveType", SetUserTypesToUserMoveType);

//===============================================================================
// The target's types become Psychic. (Magic Powder)
//===============================================================================
export class SetTargetTypesToPsychic extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.canChangeType() || !Type.exists("PSYCHIC") ||
        !target.pbHasOtherType("PSYCHIC") || !target.affectedByPowder()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.pbChangeTypes("PSYCHIC");
    const typeName = Type.get("PSYCHIC").name;
    await this.battle.pbDisplay(_INTL("{1}'s type changed to {2}!", target.pbThis(), typeName));
  }
}
registerMoveClass("SetTargetTypesToPsychic", SetTargetTypesToPsychic);

//===============================================================================
// Target becomes Water type. (Soak)
//===============================================================================
export class SetTargetTypesToWater extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.canChangeType() || !Type.exists("WATER") ||
        !target.pbHasOtherType("WATER")) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.pbChangeTypes("WATER");
    const typeName = Type.get("WATER").name;
    await this.battle.pbDisplay(_INTL("{1}'s type changed to {2}!", target.pbThis(), typeName));
  }
}
registerMoveClass("SetTargetTypesToWater", SetTargetTypesToWater);

//===============================================================================
// Gives target the Ghost type. (Trick-or-Treat)
//===============================================================================
export class AddGhostTypeToTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!Type.exists("GHOST") || target.pbHasType("GHOST") || !target.canChangeType()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Type3] = "GHOST";
    const typeName = Type.get("GHOST").name;
    await this.battle.pbDisplay(_INTL("{1} transformed into the {2} type!", target.pbThis(), typeName));
  }
}
registerMoveClass("AddGhostTypeToTarget", AddGhostTypeToTarget);

//===============================================================================
// Gives target the Grass type. (Forest's Curse)
//===============================================================================
export class AddGrassTypeToTarget extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!Type.exists("GRASS") || target.pbHasType("GRASS") || !target.canChangeType()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Type3] = "GRASS";
    const typeName = Type.get("GRASS").name;
    await this.battle.pbDisplay(_INTL("{1} transformed into the {2} type!", target.pbThis(), typeName));
  }
}
registerMoveClass("AddGrassTypeToTarget", AddGrassTypeToTarget);

//===============================================================================
// User loses their Fire type. Fails if user is not Fire-type. (Burn Up)
//===============================================================================
export class UserLosesFireType extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.pbHasType("FIRE")) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAfterAllHits(user: Battler, _target: Battler): Promise<void> {
    if (!user.effects[PBEffects.BurnUp]) {
      user.effects[PBEffects.BurnUp] = true;
      await this.battle.pbDisplay(_INTL("{1} burned itself out!", user.pbThis()));
    }
  }
}
registerMoveClass("UserLosesFireType", UserLosesFireType);

//===============================================================================
// Target's ability becomes Simple. (Simple Beam)
//===============================================================================
export class SetTargetAbilityToSimple extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!Ability.exists("SIMPLE")) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** Generation 9 Pack: adds Ability Shield immunity. */
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // Essentials
    let ret = false;
    // NOTE (Ruby parity): Ruby's [:TRUANT, :SIMPLE].include?(target.ability)
    //       compares the Symbols with a GameData::Ability object (Symbol#== is
    //       identity), so it is always false: the target already having Truant
    //       or Simple doesn't make this fail.
    if (target.unstoppableAbility()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      ret = true;
    }
    // Generation 9 Pack
    // NOTE (Ruby parity): the Ability Shield message is shown even when
    //       show_message is false.
    if (!ret && target.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", target.pbThis()));
      return true;
    }
    return ret;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    await this.battle.pbShowAbilitySplash(target, true, false);
    const oldAbil = target.abilityId;
    target.ability = "SIMPLE";
    await this.battle.pbReplaceAbilitySplash(target);
    await this.battle.pbDisplay(_INTL("{1} acquired {2}!", target.pbThis(), target.abilityName()));
    await this.battle.pbHideAbilitySplash(target);
    await target.pbOnLosingAbility(oldAbil);
    await target.pbTriggerAbilityOnGainingIt();
  }
}
registerMoveClass("SetTargetAbilityToSimple", SetTargetAbilityToSimple);

//===============================================================================
// Target's ability becomes Insomnia. (Worry Seed)
//===============================================================================
export class SetTargetAbilityToInsomnia extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!Ability.exists("INSOMNIA")) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** Generation 9 Pack: adds Ability Shield immunity. */
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // Essentials
    let ret = false;
    if (target.unstoppableAbility() || ["TRUANT", "INSOMNIA"].includes(target.abilityId!)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      ret = true;
    }
    // Generation 9 Pack
    // NOTE (Ruby parity): the Ability Shield message is shown even when
    //       show_message is false.
    if (!ret && target.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", target.pbThis()));
      return true;
    }
    return ret;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    await this.battle.pbShowAbilitySplash(target, true, false);
    const oldAbil = target.abilityId;
    target.ability = "INSOMNIA";
    await this.battle.pbReplaceAbilitySplash(target);
    await this.battle.pbDisplay(_INTL("{1} acquired {2}!", target.pbThis(), target.abilityName()));
    await this.battle.pbHideAbilitySplash(target);
    await target.pbOnLosingAbility(oldAbil);
    await target.pbTriggerAbilityOnGainingIt();
  }
}
registerMoveClass("SetTargetAbilityToInsomnia", SetTargetAbilityToInsomnia);

//===============================================================================
// User copies target's ability. (Role Play)
//===============================================================================
export class SetUserAbilityToTargetAbility extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  /** Generation 9 Pack: fails if the user is holding an Ability Shield. */
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    // Generation 9 Pack
    if (user.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", user.pbThis()));
      return true;
    }
    // Essentials
    if (user.unstoppableAbility()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.ability || sameAbility(user, target)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.ungainableAbility() ||
        ["POWEROFALCHEMY", "RECEIVER", "TRACE", "WONDERGUARD"].includes(target.abilityId!)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await this.battle.pbShowAbilitySplash(user, true, false);
    const oldAbil = user.abilityId;
    user.ability = target.ability;
    await this.battle.pbReplaceAbilitySplash(user);
    await this.battle.pbDisplay(_INTL("{1} copied {2}'s {3}!",
                                      user.pbThis(), target.pbThis(true), target.abilityName()));
    await this.battle.pbHideAbilitySplash(user);
    await user.pbOnLosingAbility(oldAbil);
    await user.pbTriggerAbilityOnGainingIt();
  }
}
registerMoveClass("SetUserAbilityToTargetAbility", SetUserAbilityToTargetAbility);

//===============================================================================
// Target copies user's ability. (Entrainment)
//===============================================================================
export class SetTargetAbilityToUserAbility extends Move {
  override canMagicCoat(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (!user.ability) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (user.ungainableAbility() ||
        ["POWEROFALCHEMY", "RECEIVER", "TRACE"].includes(user.abilityId!)) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** Generation 9 Pack: adds Ability Shield immunity. */
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // Essentials
    let ret = false;
    if (target.unstoppableAbility() || target.ability?.id === "TRUANT") {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      ret = true;
    }
    // Generation 9 Pack
    // NOTE (Ruby parity): the Ability Shield message is shown even when
    //       show_message is false.
    if (!ret && target.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", target.pbThis()));
      return true;
    }
    return ret;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await this.battle.pbShowAbilitySplash(target, true, false);
    const oldAbil = target.abilityId;
    target.ability = user.ability;
    await this.battle.pbReplaceAbilitySplash(target);
    await this.battle.pbDisplay(_INTL("{1} acquired {2}!", target.pbThis(), target.abilityName()));
    await this.battle.pbHideAbilitySplash(target);
    await target.pbOnLosingAbility(oldAbil);
    await target.pbTriggerAbilityOnGainingIt();
  }
}
registerMoveClass("SetTargetAbilityToUserAbility", SetTargetAbilityToUserAbility);

//===============================================================================
// User and target swap abilities. (Skill Swap)
//===============================================================================
export class UserTargetSwapAbilities extends Move {
  override ignoresSubstitute(_user: Battler | null): boolean { return true; }

  /** Generation 9 Pack: fails if the user is holding an Ability Shield. */
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    // Generation 9 Pack
    if (user.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", user.pbThis()));
      return true;
    }
    // Essentials
    if (!user.ability) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (user.unstoppableAbility()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (user.ungainableAbility() || user.ability.id === "WONDERGUARD") {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /** Generation 9 Pack: adds Ability Shield immunity. */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    const ret = await this.pbFailsAgainstTargetEssentials(user, target, showMessage);
    // NOTE (Ruby parity): the Ability Shield message is shown even when
    //       show_message is false.
    if (!ret && target.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", target.pbThis()));
      return true;
    }
    return ret;
  }

  /** Essentials' pbFailsAgainstTarget? (Ruby: paldea_pbFailsAgainstTarget?). */
  private async pbFailsAgainstTargetEssentials(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (!target.ability ||
        (sameAbility(user, target) && Settings.MECHANICS_GENERATION_AT_RUNTIME <= 5)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.unstoppableAbility()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.ungainableAbility() || target.ability.id === "WONDERGUARD") {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    if (user.opposes(target)) {
      await this.battle.pbShowAbilitySplash(user, false, false);
      await this.battle.pbShowAbilitySplash(target, true, false);
    }
    const oldUserAbil = user.abilityId;
    const oldTargetAbil = target.abilityId;
    user.ability = oldTargetAbil;
    target.ability = oldUserAbil;
    if (user.opposes(target)) {
      await this.battle.pbReplaceAbilitySplash(user);
      await this.battle.pbReplaceAbilitySplash(target);
    }
    if (Scene.USE_ABILITY_SPLASH) {
      await this.battle.pbDisplay(_INTL("{1} swapped Abilities with its target!", user.pbThis()));
    } else {
      await this.battle.pbDisplay(_INTL("{1} swapped its {2} Ability with its target's {3} Ability!",
                                        user.pbThis(), target.abilityName(), user.abilityName()));
    }
    if (user.opposes(target)) {
      await this.battle.pbHideAbilitySplash(user);
      await this.battle.pbHideAbilitySplash(target);
    }
    await user.pbOnLosingAbility(oldUserAbil);
    await target.pbOnLosingAbility(oldTargetAbil);
    await user.pbTriggerAbilityOnGainingIt();
    await target.pbTriggerAbilityOnGainingIt();
  }
}
registerMoveClass("UserTargetSwapAbilities", UserTargetSwapAbilities);

//===============================================================================
// Target's ability is negated. (Gastro Acid)
//===============================================================================
export class NegateTargetAbility extends Move {
  override canMagicCoat(): boolean { return true; }

  /** Generation 9 Pack: adds Ability Shield immunity. */
  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // Essentials
    let ret = false;
    if (target.unstoppableAbility()) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      ret = true;
    }
    // Generation 9 Pack
    // NOTE (Ruby parity): the Ability Shield message is shown even when
    //       show_message is false.
    if (!ret && target.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", target.pbThis()));
      return true;
    }
    return ret;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.GastroAcid] = true;
    target.effects[PBEffects.Truant] = false;
    await this.battle.pbDisplay(_INTL("{1}'s Ability was suppressed!", target.pbThis()));
    await target.pbOnLosingAbility(target.abilityId, true);
  }
}
registerMoveClass("NegateTargetAbility", NegateTargetAbility);

//===============================================================================
// Negates the target's ability while it remains on the field, if it has already
// performed its action this round. (Core Enforcer)
//===============================================================================
export class NegateTargetAbilityIfTargetActed extends Move {
  /** Generation 9 Pack: adds Ability Shield immunity to effect only (may still take damage). */
  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    // Generation 9 Pack
    if (target.hasActiveItem("ABILITYSHIELD")) return;
    // Essentials
    if (target.damageState.substitute || target.effects[PBEffects.GastroAcid]) return;
    if (target.unstoppableAbility()) return;
    const choice = this.battle.choices[target.index]![0];
    if (choice !== "UseItem" &&
        !((choice === "UseMove" || choice === "Shift") && target.movedThisRound())) return;
    target.effects[PBEffects.GastroAcid] = true;
    target.effects[PBEffects.Truant] = false;
    await this.battle.pbDisplay(_INTL("{1}'s Ability was suppressed!", target.pbThis()));
    await target.pbOnLosingAbility(target.abilityId, true);
  }
}
registerMoveClass("NegateTargetAbilityIfTargetActed", NegateTargetAbilityIfTargetActed);

//===============================================================================
// Ignores all abilities that alter this move's success or damage.
// (Moongeist Beam, Sunsteel Strike)
//===============================================================================
export class IgnoreTargetAbility extends Move {
  override pbChangeUsageCounters(user: Battler, specialUsage: boolean): void {
    super.pbChangeUsageCounters(user, specialUsage);
    if (!specialUsage) this.battle.moldBreaker = true;
  }

  /** Generation 9 Pack: adds Ability Shield immunity. */
  override async pbOnStartUse(_user: Battler, targets: Battler[]): Promise<void> {
    // NOTE (Ruby parity): Ruby calls targets[0].hasActiveItem? without checking
    //       that there is a target (NoMethodError on nil if there's none).
    if (this.battle.moldBreaker && targets[0]!.hasActiveItem("ABILITYSHIELD")) {
      this.battle.moldBreaker = false;
    }
  }
}
registerMoveClass("IgnoreTargetAbility", IgnoreTargetAbility);

//===============================================================================
// For 5 rounds, user becomes airborne. (Magnet Rise)
//===============================================================================
export class StartUserAirborne extends Move {
  override unusableInGravity(): boolean { return true; }
  override canSnatch(): boolean { return true; }

  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Ingrain] ||
        user.effects[PBEffects.SmackDown] ||
        user.effects[PBEffects.MagnetRise] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(user: Battler): Promise<void> {
    user.effects[PBEffects.MagnetRise] = 5;
    await this.battle.pbDisplay(_INTL("{1} levitated with electromagnetism!", user.pbThis()));
  }
}
registerMoveClass("StartUserAirborne", StartUserAirborne);

//===============================================================================
// For 3 rounds, target becomes airborne and can always be hit. (Telekinesis)
//===============================================================================
export class StartTargetAirborneAndAlwaysHitByMoves extends Move {
  override unusableInGravity(): boolean { return true; }
  override canMagicCoat(): boolean { return true; }

  override async pbFailsAgainstTarget(_user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (target.effects[PBEffects.Ingrain] ||
        target.effects[PBEffects.SmackDown] ||
        target.effects[PBEffects.Telekinesis] > 0) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    if (target.isSpecies("DIGLETT") ||
        target.isSpecies("DUGTRIO") ||
        target.isSpecies("SANDYGAST") ||
        target.isSpecies("PALOSSAND") ||
        (target.isSpecies("GENGAR") && target.mega())) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(_user: Battler, target: Battler): Promise<void> {
    target.effects[PBEffects.Telekinesis] = 3;
    await this.battle.pbDisplay(_INTL("{1} was hurled into the air!", target.pbThis()));
  }
}
registerMoveClass("StartTargetAirborneAndAlwaysHitByMoves", StartTargetAirborneAndAlwaysHitByMoves);

//===============================================================================
// Hits airborne semi-invulnerable targets. (Sky Uppercut)
//===============================================================================
export class HitsTargetInSky extends Move {
  override hitsFlyingTargets(): boolean { return true; }
}
registerMoveClass("HitsTargetInSky", HitsTargetInSky);

//===============================================================================
// Grounds the target while it remains active. Hits some semi-invulnerable
// targets. (Smack Down, Thousand Arrows)
//===============================================================================
export class HitsTargetInSkyGroundsTarget extends Move {
  override hitsFlyingTargets(): boolean { return true; }

  override pbCalcTypeModSingle(moveType: Id, defType: Id, user: Battler, target: Battler): number {
    if (moveType === "GROUND" && defType === "FLYING") return Effectiveness.NORMAL_EFFECTIVE_ONE;
    return super.pbCalcTypeModSingle(moveType, defType, user, target);
  }

  override async pbEffectAfterAllHits(_user: Battler, target: Battler): Promise<void> {
    if (target.fainted()) return;
    if (target.damageState.unaffected || target.damageState.substitute) return;
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSkyTargetCannotAct") ||
        target.effects[PBEffects.SkyDrop] >= 0) return; // Sky Drop
    if (!target.airborne() && !target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
                                                      "TwoTurnAttackInvulnerableInSkyParalyzeTarget")) return;
    target.effects[PBEffects.SmackDown] = true;
    if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
                               "TwoTurnAttackInvulnerableInSkyParalyzeTarget")) { // NOTE: Not Sky Drop.
      target.effects[PBEffects.TwoTurnAttack] = null;
      if (!target.movedThisRound()) this.battle.pbClearChoice(target.index);
    }
    target.effects[PBEffects.MagnetRise] = 0;
    target.effects[PBEffects.Telekinesis] = 0;
    await this.battle.pbDisplay(_INTL("{1} fell straight down!", target.pbThis()));
  }
}
registerMoveClass("HitsTargetInSkyGroundsTarget", HitsTargetInSkyGroundsTarget);

//===============================================================================
// For 5 rounds, increases gravity on the field. Pokémon cannot become airborne.
// (Gravity)
//===============================================================================
export class StartGravity extends Move {
  override async pbMoveFailed(_user: Battler, _targets: Battler[]): Promise<boolean> {
    if (this.battle.field.effects[PBEffects.Gravity] > 0) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectGeneral(_user: Battler): Promise<void> {
    this.battle.field.effects[PBEffects.Gravity] = 5;
    await this.battle.pbDisplay(_INTL("Gravity intensified!"));
    for (const b of this.battle.allBattlers()) {
      let showMessage = false;
      if (b.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
                            "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
                            "TwoTurnAttackInvulnerableInSkyTargetCannotAct")) {
        b.effects[PBEffects.TwoTurnAttack] = null;
        if (!b.movedThisRound()) this.battle.pbClearChoice(b.index);
        showMessage = true;
      }
      if (b.effects[PBEffects.MagnetRise] > 0 ||
          b.effects[PBEffects.Telekinesis] > 0 ||
          b.effects[PBEffects.SkyDrop] >= 0) {
        b.effects[PBEffects.MagnetRise] = 0;
        b.effects[PBEffects.Telekinesis] = 0;
        b.effects[PBEffects.SkyDrop] = -1;
        showMessage = true;
      }
      if (showMessage) {
        await this.battle.pbDisplay(_INTL("{1} couldn't stay airborne because of gravity!", b.pbThis()));
      }
    }
  }
}
registerMoveClass("StartGravity", StartGravity);

//===============================================================================
// User transforms into the target. (Transform)
//===============================================================================
export class TransformUserIntoTarget extends Move {
  override async pbMoveFailed(user: Battler, _targets: Battler[]): Promise<boolean> {
    if (user.effects[PBEffects.Transform]) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  /**
   * ZUD Mechanics: fails if the user is Dynamaxed and attempts to Transform
   * into a species that is unable to have a Dynamax form.
   */
  override async pbFailsAgainstTarget(user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    // ZUD Mechanics
    // NOTE (Ruby parity): this message is shown even when show_message is false.
    if (user.dynamax() && !target.dynamaxAble()) {
      await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    // Essentials
    if (target.effects[PBEffects.Transform] ||
        target.effects[PBEffects.Illusion]) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return false;
  }

  override async pbEffectAgainstTarget(user: Battler, target: Battler): Promise<void> {
    await user.pbTransform(target);
  }

  /** Essentials Deluxe (redefined): edited for compatibility with battle effects that alter battler sprites. */
  override async pbShowAnimation(id: Id, user: Battler, targets: Battler | Battler[] | null, hitNum = 0,
    showAnimation = true): Promise<void> {
    await super.pbShowAnimation(id, user, targets, hitNum, showAnimation);
    const target = (targets as Battler[])[0]!;
    user.effects[PBEffects.TransformPokemon] = target.pokemon;
    this.battle.scene.pbChangePokemon(user, target.pokemon!);
  }
}
registerMoveClass("TransformUserIntoTarget", TransformUserIntoTarget);
