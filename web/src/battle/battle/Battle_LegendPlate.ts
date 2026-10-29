// Port of Plugins/Generation 9 Pack Scripts/[001] Battle/[006] Legend Plate
// Functions.rb, Battle class additions (lines 8-157): the type an Arceus
// holding the Legend Plate turns Judgment into, against the move's target.
// (Battle::Battler#pbGetJudgmentType / hasLegendPlateJudgment? are in
// battler/Battler_AbilityAndItem.ts; Judgment itself in
// move/MoveEffects_MoveAttributes.ts; the transform animation in
// scene/ArceusTransform.ts.)
//
// Battle#pbGetBestTypeJudgment is async here because
// AbilityEffects.triggerMoveImmunity is (it can show messages; not here, as
// showMessage is false).

import type { Id } from "../../data/gameData/gameData";
import { Effectiveness, Type } from "../../data/gameData/type";
import { sample } from "../../game/maxRaid/random";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battler } from "../battler/Battler";
import { Move } from "../move/Move";
import { AbilityEffects, type DamageMultipliers } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";
import { Battle } from "./Battle";

/** Ruby's Hash#sort on Integer keys, then .first / .last: the entry with the smallest / largest key. */
function extremeKey<T>(hash: Map<number, T>, largest: boolean): T {
  let bestKey: number | null = null;
  for (const k of hash.keys()) {
    if (bestKey === null || (largest ? k > bestKey : k < bestKey)) bestKey = k;
  }
  return hash.get(bestKey!)!;
}

const methods = {
  //-----------------------------------------------------------------------------
  // Type calculation
  //-----------------------------------------------------------------------------
  // Used when an Arceus holding a Legend Plate uses the move Judgment.
  // Calculates the ideal type to change to against the target of the move.
  // Randomizes type if there are multiple types with equivalent strength.
  // Won't change type if check_type is already among the best types to use.
  // If the target has no type, (for example a pure Fire-type who used Burn Up)
  // and the target also has no abilities, item, or effects in play that would
  // affect the type chosen, then the Normal type will be chosen.
  //-----------------------------------------------------------------------------
  // The following factors are considered when calculating a type:
  //   -Type effectiveness.
  //   -The target's third type, if any. (Forest's Curse, Trick-or-Treat)
  //   -Type-based immunities, if any. (Considers Ring Target/Foresight/Miracle Eye)
  //   -Ability-based immunities related to typing. (Levitate, Water Absorb, etc.)
  //   -Ability-based power modifiers related to typing. (Heat Proof, Thick Fat, etc.)
  //   -Item-based immunities related to typing. (Air Balloon, Iron Ball, etc.)
  //   -User effect-based power modifiers related to typing. (Charge)
  //   -Target effect-based immunities related to typing. (Magnet Rise, Smack Down, etc.)
  //   -Field power modifiers related to typing. (Mud Sport, Water Sport)
  //   -Weather and Terrain power modifiers related to typing.
  //-----------------------------------------------------------------------------
  //   *Note: The opponent's type-weakening berries are not considered.
  //-----------------------------------------------------------------------------
  async pbGetBestTypeJudgment(this: Battle, user: Battler, target: Battler | null, move: Move | null = null,
                              checkType: Id | null = null): Promise<Id> {
    if (!target) return "NORMAL";
    const allTypes: Id[] = [];
    const effectiveTypes = new Map<number, Id[]>();
    const targetTypes = target.pbTypes(true);
    if (!move) move = Move.fromPokemonMove(this, new PokemonMove("JUDGMENT"));
    for (const typeData of Type.each()) {
      if (typeData.pseudoType) continue;
      const type = typeData.id;
      allTypes.push(type);
      if (await this.pbTargetHasTypeImmunity(user, target, move, type, targetTypes)) continue;
      const multipliers: DamageMultipliers = {
        base_damage_multiplier: 1.0,
        attack_multiplier: 1.0,
        defense_multiplier: 1.0,
        final_damage_multiplier: 1.0,
      };
      this.pbCalcTypeMultsJudgment(user, target, move, type, targetTypes, multipliers);
      // Float#round (half away from zero), then Integer arithmetic.
      const baseMult = Math.max(rubyRound(multipliers.base_damage_multiplier!), 1);
      const atkMult = Math.max(rubyRound(multipliers.attack_multiplier!), 1);
      const defMult = Math.max(rubyRound(multipliers.defense_multiplier!), 1);
      const dmgMult = Math.max(rubyRound(multipliers.final_damage_multiplier!), 1);
      const strength = Math.floor((baseMult * atkMult) / defMult) * dmgMult;
      if (!effectiveTypes.has(strength)) effectiveTypes.set(strength, []);
      effectiveTypes.get(strength)!.push(type);
    }
    const bestTypes = effectiveTypes.size === 0 ? allTypes : extremeKey(effectiveTypes, true);
    const bestType = this.pbCalcOptimalType(user, target, move, bestTypes, targetTypes, checkType);
    return bestType;
  },

  //-----------------------------------------------------------------------------
  // Checks if the target is immune to a given type by its typing, ability, or effect.
  //-----------------------------------------------------------------------------
  /** pbTargetHasTypeImmunity? */
  async pbTargetHasTypeImmunity(this: Battle, user: Battler, target: Battler, move: Move, type: Id,
                                _targetTypes: Id[]): Promise<boolean> {
    if (type === "FIRE" && target.effectiveWeather() === "HeavyRain") return true;
    if (type === "WATER" && target.effectiveWeather() === "HarshSun") return true;
    if (move.pbCalcTypeMod(type, user, target) === Effectiveness.INEFFECTIVE) return true;
    if (target.abilityActive() && !this.moldBreaker) {
      if (await AbilityEffects.triggerMoveImmunity(target.ability!, user, target, move, type, this, false)) return true;
    }
    return false;
  },

  //-----------------------------------------------------------------------------
  // Calculates the effectiveness of a given type used against the target.
  //-----------------------------------------------------------------------------
  pbCalcTypeMultsJudgment(this: Battle, user: Battler, target: Battler, move: Move, type: Id,
                          _targetTypes: Id[], multipliers: DamageMultipliers): void {
    if ((this.pbCheckGlobalAbility("DARKAURA") && type === "DARK") ||
        (this.pbCheckGlobalAbility("FAIRYAURA") && type === "FAIRY")) {
      if (this.pbCheckGlobalAbility("AURABREAK")) {
        multipliers.base_damage_multiplier! *= 2 / 3.0;
      } else {
        multipliers.base_damage_multiplier! *= 4 / 3.0;
      }
    }
    if (target.abilityActive() && !this.moldBreaker) {
      AbilityEffects.triggerDamageCalcFromTarget(target.ability!, user, target, move, multipliers, move.baseDamage, type);
      AbilityEffects.triggerDamageCalcFromTargetNonIgnorable(target.ability!, user, target, move, multipliers, move.baseDamage, type);
    }
    const typeCalc = move.pbCalcTypeMod(type, user, target);
    if (typeCalc > Effectiveness.INEFFECTIVE) {
      multipliers.final_damage_multiplier! *= typeCalc;
    }
    switch (type) {
      case "FIRE":
        if (this.field.effects[PBEffects.WaterSportField] > 0) multipliers.base_damage_multiplier! /= 3;
        break;
      case "ELECTRIC":
        if (user.effects[PBEffects.Charge] > 0) multipliers.base_damage_multiplier! *= 2;
        if (this.field.effects[PBEffects.MudSportField] > 0) multipliers.base_damage_multiplier! /= 3;
        break;
    }
    if (user.affectedByTerrain()) {
      switch (this.field.terrain) {
        case "Electric": if (type === "ELECTRIC") multipliers.base_damage_multiplier! *= 1.3; break;
        case "Grassy": if (type === "GRASS") multipliers.base_damage_multiplier! *= 1.3; break;
        case "Psychic": if (type === "PSYCHIC") multipliers.base_damage_multiplier! *= 1.3; break;
        case "Misty": if (type === "DRAGON") multipliers.base_damage_multiplier! /= 2; break;
      }
    }
    switch (user.effectiveWeather()) {
      case "Sun": case "HarshSun":
        if (type === "FIRE") multipliers.final_damage_multiplier! *= 1.5;
        if (type === "WATER") multipliers.final_damage_multiplier! /= 2;
        break;
      case "Rain": case "HeavyRain":
        if (type === "WATER") multipliers.final_damage_multiplier! *= 1.5;
        if (type === "FIRE") multipliers.final_damage_multiplier! /= 2;
        break;
    }
  },

  //-----------------------------------------------------------------------------
  // Determines the optimal type to select out of the array of most effective types.
  //-----------------------------------------------------------------------------
  // -Returns most effective type if only one type would be most effective.
  // -If multiple effective types, returns the type that would be the best
  //  defensive type vs the target's primary type.
  // -If multiple effective types still exist, returns the type out of remaining
  //  types that would be the best defensive type vs the target's secondary type.
  // -If multiple effective types still exist, prefer selecting the last used
  //  type if that type is among the remaining types.
  // -Otherwise, select a random effective type.
  //-----------------------------------------------------------------------------
  pbCalcOptimalType(this: Battle, user: Battler, target: Battler, move: Move, effectiveTypes: Id[],
                    targetTypes: Id[], checkType: Id | null): Id {
    if (effectiveTypes.length === 1) return effectiveTypes[0]!;
    for (const targetType of targetTypes) {
      const effectiveness = new Map<number, Id[]>();
      for (const type of effectiveTypes) {
        // (moveType, defType) = (the target's type, the candidate): how well the
        // candidate type resists the target's own type, as the comment says.
        const strength = move.pbCalcTypeModSingle(targetType, type, user, target);
        if (!effectiveness.has(strength)) effectiveness.set(strength, []);
        effectiveness.get(strength)!.push(type);
      }
      effectiveTypes = [...extremeKey(effectiveness, false)];
      if (effectiveTypes.length === 1) break;
    }
    if (checkType && effectiveTypes.includes(checkType)) return checkType;
    return sample(effectiveTypes)!;
  },
};

/** Float#round: halves away from zero. */
function rubyRound(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x);
}

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
