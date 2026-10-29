// Port of Data/Scripts/011_Battle/005_AI/008_AI_Move_Utilities.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:237): pbCalcTypeModPokemon (replaces
//   core's, which reads an undefined `target`).
// - Improved AI (AI_Move_Utilities.rb): the new pbCalcTypeLinear, and
//   pbCheckMoveImmunity (redefined; Earth Eater).
// - Generation 9 Pack ([001] Battle/[003] Battle_AI.rb:142): pbRoughDamage
//   (redefined: "of Ruin" abilities, Hydro Steam, Snow, Frostbite, Drowsy,
//   Glaive Rush).
// Load order: Hotfixes, Generation 9 Pack, then Improved AI. Gen 9 Pack's
// pbCheckMoveImmunity (Battle_AI.rb:118, an alias adding Commander, Earth
// Eater, Well-Baked Body, Wind Rider, Good as Gold, Dazzling/Queenly
// Majesty/Armor Tail) is lost: Improved AI redefines the method without an
// alias. So pbCheckMoveImmunity here is Improved AI's alone, as in the game.
// Core's pbRoughDamage (008:297-578) is replaced by Gen 9 Pack's and isn't ported.

import type { Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battler } from "../battler/Battler";
import { type Move, MoveClasses } from "../move/Move";
import { AbilityEffects, type AccuracyModifiers, type DamageMultipliers } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv, rubyRound } from "../rubyMath";
import { AI, PBTrainerAI } from "./Battle_AI";

/** Battle::Move subclass methods the AI calls on specific function codes. */
type FixedDamageMoveLike = { pbFixedDamage(user: Battler, target: Battler): number };
type NaturalGiftMoveLike = { pbNaturalGiftBaseDamage(heldItem: Id | null): number };

/** move.is_a?(Battle::Move::<className>) */
function moveIsA(move: Move, className: string): boolean {
  const cls = MoveClasses.get(className);
  return cls != null && move instanceof cls;
}

const methods = {
  //=============================================================================
  //
  //=============================================================================
  /** pbTargetsMultiple? */
  pbTargetsMultiple(this: AI, move: Move, user: Battler): boolean {
    const targetData = move.pbTarget(user);
    if (targetData.numTargets <= 1) return false;
    let numTargets = 0;
    switch (targetData.id) {
      case "AllAllies":
        for (const b of this.battle.allSameSideBattlers(user)) if (b.index !== user.index) numTargets += 1;
        break;
      case "UserAndAllies":
        numTargets += this.battle.allSameSideBattlers(user).length;
        break;
      case "AllNearFoes":
        for (const b of this.battle.allOtherSideBattlers(user)) if (b.near(user)) numTargets += 1;
        break;
      case "AllFoes":
        numTargets += this.battle.allOtherSideBattlers(user).length;
        break;
      case "AllNearOthers":
        for (const b of this.battle.allBattlers()) if (b.near(user)) numTargets += 1;
        break;
      case "AllBattlers":
        numTargets += this.battle.allBattlers().length;
        break;
    }
    return numTargets > 1;
  },

  //=============================================================================
  // Move's type effectiveness
  //=============================================================================
  pbCalcTypeModSingle(this: AI, moveType: Id, defType: Id, user: Battler, target: Battler): number {
    let ret = Effectiveness.calculateOne(moveType, defType);
    if (Effectiveness.ineffectiveType(moveType, defType)) {
      // Ring Target
      if (target.hasActiveItem("RINGTARGET")) {
        ret = Effectiveness.NORMAL_EFFECTIVE_ONE;
      }
      // Foresight
      if ((user.hasActiveAbility("SCRAPPY") || target.effects[PBEffects.Foresight]) &&
          defType === "GHOST") {
        ret = Effectiveness.NORMAL_EFFECTIVE_ONE;
      }
      // Miracle Eye
      if (target.effects[PBEffects.MiracleEye] && defType === "DARK") {
        ret = Effectiveness.NORMAL_EFFECTIVE_ONE;
      }
    } else if (Effectiveness.superEffectiveType(moveType, defType)) {
      // Delta Stream's weather
      if (target.effectiveWeather() === "StrongWinds" && defType === "FLYING") {
        ret = Effectiveness.NORMAL_EFFECTIVE_ONE;
      }
    }
    // Grounded Flying-type Pokémon become susceptible to Ground moves
    if (!target.airborne() && defType === "FLYING" && moveType === "GROUND") {
      ret = Effectiveness.NORMAL_EFFECTIVE_ONE;
    }
    return ret;
  },

  pbCalcTypeMod(this: AI, moveType: Id | null | undefined, user: Battler, target: Battler): number {
    if (!moveType) return Effectiveness.NORMAL_EFFECTIVE;
    if (moveType === "GROUND" && target.pbHasType("FLYING") && target.hasActiveItem("IRONBALL")) {
      return Effectiveness.NORMAL_EFFECTIVE;
    }
    // Determine types
    const tTypes = target.pbTypes(true);
    // Get effectivenesses
    const typeMods = [Effectiveness.NORMAL_EFFECTIVE_ONE, Effectiveness.NORMAL_EFFECTIVE_ONE,
      Effectiveness.NORMAL_EFFECTIVE_ONE]; // 3 types max
    if (moveType === "SHADOW") {
      if (target.shadowPokemon()) {
        typeMods[0] = Effectiveness.NOT_VERY_EFFECTIVE_ONE;
      } else {
        typeMods[0] = Effectiveness.SUPER_EFFECTIVE_ONE;
      }
    } else {
      tTypes.forEach((type, i) => {
        typeMods[i] = this.pbCalcTypeModSingle(moveType, type, user, target);
      });
    }
    // Multiply all effectivenesses together
    let ret = 1;
    for (const m of typeMods) ret *= m;
    return ret;
  },

  /**
   * For switching. Determines the effectiveness of a potential switch-in against
   * an opposing battler. (v20.1 Hotfixes' version)
   */
  pbCalcTypeModPokemon(this: AI, battlerThis: Pokemon | Battler, battlerOther: Battler): number {
    const thisTypes = typesOf(battlerThis);
    const mod1 = Effectiveness.calculate(thisTypes[0]!, battlerOther.types[0], battlerOther.types[1]);
    let mod2 = Effectiveness.NORMAL_EFFECTIVE;
    if (thisTypes.length > 1) {
      mod2 = Effectiveness.calculate(thisTypes[1]!, battlerOther.types[0], battlerOther.types[1]);
      mod2 = mod2 / Effectiveness.NORMAL_EFFECTIVE;
    }
    return mod1 * mod2;
  },

  /** Improved AI: type effectiveness on a linear scale (0 = neutral, <0 = not very effective, >0 = super). */
  pbCalcTypeLinear(this: AI, moveType: Id | null, user: Battler, target: Battler): number {
    let ret = this.pbCalcTypeMod(moveType, user, target);
    if (ret === 0) return 0;
    // triple-type support
    ret *= ret;
    // convert to linear scale (Ruby: Math.log(ret, 2).round(0))
    ret = rubyRound(Math.log(ret) / Math.log(2));
    // offset values so that 0 = neutral, <0 = not very effective, >0 = super
    ret -= 6;
    return ret;
  },

  //=============================================================================
  // Immunity to a move because of the target's ability, item or other effects
  // (Improved AI's version)
  //=============================================================================
  pbCheckMoveImmunity(this: AI, score: number, move: Move, user: Battler, target: Battler, skill: number): boolean {
    const type = this.pbRoughType(move, user, skill);
    const typeMod = this.pbCalcTypeMod(type, user, target);
    // Type effectiveness
    if ((move.damagingMove() && Effectiveness.ineffective(typeMod)) || score <= 0) return true;
    // Immunity due to ability/item/other effects
    if (skill >= PBTrainerAI.mediumSkill()) {
      switch (type) {
        case "GROUND":
          if ((target.airborne() && !move.hitsFlyingTargets()) || target.hasActiveAbility("EARTHEATER")) return true;
          break;
        case "FIRE":
          if (target.hasActiveAbility("FLASHFIRE")) return true;
          break;
        case "WATER":
          if (target.hasActiveAbility(["DRYSKIN", "STORMDRAIN", "WATERABSORB"])) return true;
          break;
        case "GRASS":
          if (target.hasActiveAbility("SAPSIPPER")) return true;
          break;
        case "ELECTRIC":
          if (target.hasActiveAbility(["LIGHTNINGROD", "MOTORDRIVE", "VOLTABSORB"])) return true;
          break;
      }
      if (move.damagingMove() && Effectiveness.notVeryEffective(typeMod) &&
          target.hasActiveAbility("WONDERGUARD")) return true;
      if (move.damagingMove() && user.index !== target.index && !target.opposes(user) &&
          target.hasActiveAbility("TELEPATHY")) return true;
      if (move.statusMove() && move.canMagicCoat() && target.hasActiveAbility("MAGICBOUNCE") &&
          target.opposes(user)) return true;
      if (move.soundMove() && target.hasActiveAbility("SOUNDPROOF")) return true;
      if (move.bombMove() && target.hasActiveAbility("BULLETPROOF")) return true;
      if (move.powderMove()) {
        if (target.pbHasType("GRASS")) return true;
        if (target.hasActiveAbility("OVERCOAT")) return true;
        if (target.hasActiveItem("SAFETYGOGGLES")) return true;
      }
      if (move.statusMove() && target.effects[PBEffects.Substitute] > 0 &&
          !move.ignoresSubstitute(user) && user.index !== target.index) return true;
      if (move.statusMove() && Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 &&
          user.hasActiveAbility("PRANKSTER") && target.pbHasType("DARK") &&
          target.opposes(user)) return true;
      if (move.priority > 0 && this.battle.field.terrain === "Psychic" &&
          target.affectedByTerrain() && target.opposes(user)) return true;
    }
    return false;
  },

  //=============================================================================
  // Get approximate properties for a battler
  //=============================================================================
  pbRoughType(this: AI, move: Move, user: Battler, skill: number): Id | null {
    let ret = move.type;
    if (skill >= PBTrainerAI.highSkill()) {
      ret = move.pbCalcType(user);
    }
    return ret;
  },

  pbRoughStat(this: AI, battler: Battler, stat: Id, skill: number): number {
    if (skill >= PBTrainerAI.highSkill() && stat === "SPEED") return battler.pbSpeed();
    const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
    const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
    const stage = battler.stages[stat]! + 6;
    let value = 0;
    switch (stat) {
      case "ATTACK": value = battler.attack; break;
      case "DEFENSE": value = battler.defense; break;
      case "SPECIAL_ATTACK": value = battler.spatk; break;
      case "SPECIAL_DEFENSE": value = battler.spdef; break;
      case "SPEED": value = battler.speed; break;
    }
    return Math.floor(value * stageMul[stage]! / stageDiv[stage]!);
  },

  //=============================================================================
  // Get a better move's base damage value
  //=============================================================================
  pbMoveBaseDamage(this: AI, move: Move, user: Battler, target: Battler, skill: number): number {
    let baseDmg = move.baseDamage;
    if (baseDmg === 1) baseDmg = 60;
    if (skill < PBTrainerAI.mediumSkill()) return baseDmg;
    // Covers all function codes which have their own def pbBaseDamage
    switch (move.function) {
      // Sonic Boom, Dragon Rage, Super Fang, Night Shade, Endeavor
      case "FixedDamage20": case "FixedDamage40": case "FixedDamageHalfTargetHP":
      case "FixedDamageUserLevel": case "LowerTargetHPToUserHP":
        baseDmg = (move as unknown as FixedDamageMoveLike).pbFixedDamage(user, target);
        break;
      case "FixedDamageUserLevelRandom": // Psywave
        baseDmg = user.level;
        break;
      case "OHKO": case "OHKOIce": case "OHKOHitsUndergroundTarget":
        baseDmg = 200;
        break;
      case "CounterPhysicalDamage": case "CounterSpecialDamage": case "CounterDamagePlusHalf":
        baseDmg = 60;
        break;
      case "DoublePowerIfTargetUnderwater": case "DoublePowerIfTargetUnderground":
      case "BindTargetDoublePowerIfTargetUnderwater":
        baseDmg = move.pbModifyDamage(baseDmg, user, target);
        break;
      // Gust, Twister, Venoshock, Smelling Salts, Wake-Up Slap, Facade, Hex, Brine,
      // Retaliate, Weather Ball, Return, Frustration, Eruption, Crush Grip,
      // Stored Power, Punishment, Hidden Power, Fury Cutter, Echoed Voice,
      // Trump Card, Flail, Electro Ball, Low Kick, Fling, Spit Up
      case "DoublePowerIfTargetInSky":
      case "FlinchTargetDoublePowerIfTargetInSky":
      case "DoublePowerIfTargetPoisoned":
      case "DoublePowerIfTargetParalyzedCureTarget":
      case "DoublePowerIfTargetAsleepCureTarget":
      case "DoublePowerIfUserPoisonedBurnedParalyzed":
      case "DoublePowerIfTargetStatusProblem":
      case "DoublePowerIfTargetHPLessThanHalf":
      case "DoublePowerIfAllyFaintedLastTurn":
      case "TypeAndPowerDependOnWeather":
      case "PowerHigherWithUserHappiness":
      case "PowerLowerWithUserHappiness":
      case "PowerHigherWithUserHP":
      case "PowerHigherWithTargetHP":
      case "PowerHigherWithUserPositiveStatStages":
      case "PowerHigherWithTargetPositiveStatStages":
      case "TypeDependsOnUserIVs":
      case "PowerHigherWithConsecutiveUse":
      case "PowerHigherWithConsecutiveUseOnUserSide":
      case "PowerHigherWithLessPP":
      case "PowerLowerWithUserHP":
      case "PowerHigherWithUserFasterThanTarget":
      case "PowerHigherWithTargetWeight":
      case "ThrowUserItemAtTarget":
      case "PowerDependsOnUserStockpile":
        baseDmg = move.pbBaseDamage(baseDmg, user, target);
        break;
      case "DoublePowerIfUserHasNoItem": // Acrobatics
        if (!user.item || user.hasActiveItem("FLYINGGEM")) baseDmg *= 2;
        break;
      case "PowerHigherWithTargetFasterThanUser": { // Gyro Ball
        const targetSpeed = this.pbRoughStat(target, "SPEED", skill);
        const userSpeed = this.pbRoughStat(user, "SPEED", skill);
        baseDmg = Math.max(Math.min(rubyDiv(25 * targetSpeed, userSpeed), 150), 1);
        break;
      }
      case "RandomlyDamageOrHealTarget": // Present
        baseDmg = 50;
        break;
      case "RandomPowerDoublePowerIfTargetUnderground": // Magnitude
        baseDmg = 71;
        if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground")) baseDmg *= 2; // Dig
        break;
      case "TypeAndPowerDependOnUserBerry": // Natural Gift
        baseDmg = (move as unknown as NaturalGiftMoveLike).pbNaturalGiftBaseDamage(user.itemId);
        break;
      case "PowerHigherWithUserHeavierThanTarget": // Heavy Slam
        baseDmg = move.pbBaseDamage(baseDmg, user, target);
        if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 && skill >= PBTrainerAI.mediumSkill() &&
            target.effects[PBEffects.Minimize]) baseDmg *= 2;
        break;
      case "AlwaysCriticalHit": case "HitTwoTimes": case "HitTwoTimesPoisonTarget": // Frost Breath, Double Kick, Twineedle
        baseDmg *= 2;
        break;
      case "HitThreeTimesPowersUpWithEachHit": // Triple Kick
        baseDmg *= 6; // Hits do x1, x2, x3 baseDmg in turn, for x6 in total
        break;
      case "HitTwoToFiveTimes": // Fury Attack
        if (user.hasActiveAbility("SKILLLINK")) {
          baseDmg *= 5;
        } else {
          baseDmg = rubyDiv(baseDmg * 31, 10); // Average damage dealt
        }
        break;
      case "HitTwoToFiveTimesOrThreeForAshGreninja":
        if (user.isSpecies("GRENINJA") && user.form === 2) {
          baseDmg *= 4; // 3 hits at 20 power = 4 hits at 15 power
        } else if (user.hasActiveAbility("SKILLLINK")) {
          baseDmg *= 5;
        } else {
          baseDmg = rubyDiv(baseDmg * 31, 10); // Average damage dealt
        }
        break;
      case "HitOncePerUserTeamMember": { // Beat Up
        let mult = 0;
        this.battle.eachInTeamFromBattlerIndex(user.index, (pkmn) => {
          if (pkmn?.able() && pkmn.status === "NONE") mult += 1;
        });
        baseDmg *= mult;
        break;
      }
      case "TwoTurnAttackOneTurnInSun": // Solar Beam
        baseDmg = move.pbBaseDamageMultiplier(baseDmg, user, target);
        break;
      case "MultiTurnAttackPowersUpEachTurn": // Rollout
        if (user.effects[PBEffects.DefenseCurl]) baseDmg *= 2;
        break;
      case "MultiTurnAttackBideThenReturnDoubleDamage": // Bide
        baseDmg = 40;
        break;
      case "UserFaintsFixedDamageUserHP": // Final Gambit
        baseDmg = user.hp;
        break;
      case "EffectivenessIncludesFlyingType": // Flying Press
        if (Type.exists("FLYING")) {
          let mult: number;
          if (skill >= PBTrainerAI.highSkill()) {
            const targetTypes = target.pbTypes(true);
            mult = Effectiveness.calculate("FLYING", targetTypes[0], targetTypes[1], targetTypes[2]);
          } else {
            mult = Effectiveness.calculate("FLYING", target.types[0], target.types[1],
              target.effects[PBEffects.Type3] as Id | null);
          }
          baseDmg = rubyRound(baseDmg * mult / Effectiveness.NORMAL_EFFECTIVE);
        }
        if (skill >= PBTrainerAI.mediumSkill() && target.effects[PBEffects.Minimize]) baseDmg *= 2;
        break;
      case "DoublePowerIfUserLastMoveFailed": // Stomping Tantrum
        if (user.lastRoundMoveFailed) baseDmg *= 2;
        break;
      case "HitTwoTimesFlinchTarget": // Double Iron Bash
        baseDmg *= 2;
        if (skill >= PBTrainerAI.mediumSkill() && target.effects[PBEffects.Minimize]) baseDmg *= 2;
        break;
    }
    return baseDmg;
  },

  //=============================================================================
  // Damage calculation (Generation 9 Pack's version)
  //  -Applies the effects of the various "of Ruin" abilities.
  //  -Negates the damage reduction the move Hydro Steam would have in the Sun.
  //  -Increases the Defense of Ice-types during Snow weather (Gen 9 version).
  //  -Halves the damage dealt by special attacks if the user has the Frostbite status.
  //  -Increases damage taken if the targer has the Drowsy status.
  //  -Doubles damage taken by a target still vulnerable due to Glaive Rush's effect.
  //=============================================================================
  pbRoughDamage(this: AI, move: Move, user: Battler, target: Battler, skill: number, baseDmg: number): number {
    if (moveIsA(move, "FixedDamageMove")) return baseDmg;
    const type = this.pbRoughType(move, user, skill);
    let atk = this.pbRoughStat(user, "ATTACK", skill);
    if (move.function === "UseTargetAttackInsteadOfUserAttack") {
      atk = this.pbRoughStat(target, "ATTACK", skill);
    } else if (move.function === "UseUserBaseDefenseInsteadOfUserBaseAttack") {
      atk = this.pbRoughStat(user, "DEFENSE", skill);
    } else if (move.specialMove(type)) {
      if (move.function === "UseTargetAttackInsteadOfUserAttack") {
        atk = this.pbRoughStat(target, "SPECIAL_ATTACK", skill);
      } else {
        atk = this.pbRoughStat(user, "SPECIAL_ATTACK", skill);
      }
    }
    let defense = this.pbRoughStat(target, "DEFENSE", skill);
    if (move.specialMove(type) && move.function !== "UseTargetDefenseInsteadOfTargetSpDef") {
      defense = this.pbRoughStat(target, "SPECIAL_DEFENSE", skill);
    }
    const multipliers: DamageMultipliers = {
      base_damage_multiplier: 1.0,
      attack_multiplier: 1.0,
      defense_multiplier: 1.0,
      final_damage_multiplier: 1.0,
    };
    let moldBreaker = false;
    if (skill >= PBTrainerAI.highSkill() && target.hasMoldBreaker()) {
      moldBreaker = true;
    }
    if (skill >= PBTrainerAI.mediumSkill() && user.abilityActive()) {
      // Ruby: compares the move's ID with ability IDs, so it never matches.
      const abilityBlacklist: Id[] = ["ANALYTIC", "SNIPER", "TINTEDLENS", "AERILATE", "PIXILATE", "REFRIGERATE"];
      let canCheck = true;
      for (const m of abilityBlacklist) {
        if (move.id !== m) continue;
        canCheck = false;
        break;
      }
      if (canCheck) {
        AbilityEffects.triggerDamageCalcFromUser(
          user.ability, user, target, move, multipliers, baseDmg, type as Id,
        );
      }
    }
    if (skill >= PBTrainerAI.mediumSkill() && !moldBreaker) {
      for (const b of user.allAllies()) {
        if (!b.abilityActive()) continue;
        AbilityEffects.triggerDamageCalcFromAlly(
          b.ability, user, target, move, multipliers, baseDmg, type as Id,
        );
      }
    }
    if (skill >= PBTrainerAI.bestSkill() && !moldBreaker && target.abilityActive()) {
      // Ruby: compares the move's ID with ability IDs, so it never matches.
      const abilityBlacklist: Id[] = ["FILTER", "SOLIDROCK"];
      let canCheck = true;
      for (const m of abilityBlacklist) {
        if (move.id !== m) continue;
        canCheck = false;
        break;
      }
      if (canCheck) {
        AbilityEffects.triggerDamageCalcFromTarget(
          target.ability, user, target, move, multipliers, baseDmg, type as Id,
        );
      }
    }
    if (skill >= PBTrainerAI.bestSkill() && !moldBreaker) {
      for (const b of target.allAllies()) {
        if (!b.abilityActive()) continue;
        AbilityEffects.triggerDamageCalcFromTargetAlly(
          b.ability, user, target, move, multipliers, baseDmg, type as Id,
        );
      }
    }
    if (skill >= PBTrainerAI.mediumSkill() && user.itemActive()) {
      const itemBlacklist: Id[] = ["EXPERTBELT", "LIFEORB"];
      if (!itemBlacklist.includes(user.itemId as Id)) {
        ItemEffects.triggerDamageCalcFromUser(
          user.item, user, target, move, multipliers, baseDmg, type as Id,
        );
        // Ruby: also clears a gem the user really consumed this round.
        user.effects[PBEffects.GemConsumed] = null;
      }
    }
    if (skill >= PBTrainerAI.bestSkill() &&
        target.itemActive() && target.item && !target.item.isBerry()) {
      ItemEffects.triggerDamageCalcFromTarget(
        target.item, user, target, move, multipliers, baseDmg, type as Id,
      );
    }
    if (skill >= PBTrainerAI.mediumSkill() &&
        ((this.battle.pbCheckGlobalAbility("DARKAURA") && type === "DARK") ||
         (this.battle.pbCheckGlobalAbility("FAIRYAURA") && type === "FAIRY"))) {
      if (this.battle.pbCheckGlobalAbility("AURABREAK")) {
        multipliers.base_damage_multiplier! *= 2 / 3.0;
      } else {
        multipliers.base_damage_multiplier! *= 4 / 3.0;
      }
    }
    //---------------------------------------------------------------------------
    // Added for "of Ruin" abilities
    // Ruby: multiplies a local copy of the multiplier, so this has no effect.
    //---------------------------------------------------------------------------
    if (skill >= PBTrainerAI.mediumSkill()) {
      (["TABLETSOFRUIN", "SWORDOFRUIN", "VESSELOFRUIN", "BEADSOFRUIN"] as Id[]).forEach((abil, i) => {
        let category = (i < 2) ? move.physicalMove() : move.specialMove();
        if (i % 2 === 1 && this.battle.field.effects[PBEffects.WonderRoom] > 0) category = !category;
        let mult = (i % 2 === 0) ? multipliers.attack_multiplier! : multipliers.defense_multiplier!;
        if (this.battle.pbCheckGlobalAbility(abil) && !user.hasActiveAbility(abil) && category) mult *= 0.75;
      });
    }
    //---------------------------------------------------------------------------
    if (skill >= PBTrainerAI.mediumSkill() && user.hasActiveAbility("PARENTALBOND")) {
      multipliers.base_damage_multiplier! *= 1.25;
    }
    if (skill >= PBTrainerAI.mediumSkill() &&
        user.effects[PBEffects.Charge] > 0 && type === "ELECTRIC") {
      multipliers.base_damage_multiplier! *= 2;
    }
    if (skill >= PBTrainerAI.mediumSkill()) {
      if (type === "ELECTRIC") {
        if (this.battle.allBattlers().some((b) => b.effects[PBEffects.MudSport])) {
          multipliers.base_damage_multiplier! /= 3;
        }
        if (this.battle.field.effects[PBEffects.MudSportField] > 0) {
          multipliers.base_damage_multiplier! /= 3;
        }
      }
      if (type === "FIRE") {
        if (this.battle.allBattlers().some((b) => b.effects[PBEffects.WaterSport])) {
          multipliers.base_damage_multiplier! /= 3;
        }
        if (this.battle.field.effects[PBEffects.WaterSportField] > 0) {
          multipliers.base_damage_multiplier! /= 3;
        }
      }
    }
    if (skill >= PBTrainerAI.mediumSkill()) {
      switch (this.battle.field.terrain) {
        case "Electric":
          if (type === "ELECTRIC" && user.affectedByTerrain()) multipliers.base_damage_multiplier! *= 1.5;
          if (move.function === "IncreasePowerInElectricTerrain" && user.affectedByTerrain()) {
            multipliers.base_damage_multiplier! *= 1.5;
          }
          break;
        case "Grassy":
          if (type === "GRASS" && user.affectedByTerrain()) multipliers.base_damage_multiplier! *= 1.5;
          break;
        case "Psychic":
          if (type === "PSYCHIC" && user.affectedByTerrain()) multipliers.base_damage_multiplier! *= 1.5;
          break;
        case "Misty":
          if (type === "DRAGON" && target.affectedByTerrain()) multipliers.base_damage_multiplier! /= 2;
          break;
      }
    }
    if (skill >= PBTrainerAI.highSkill() && this.battle.internalBattle && target.pbOwnedByPlayer()) {
      if (move.physicalMove(type) && this.battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_DEFENSE) {
        multipliers.defense_multiplier! *= 1.1;
      } else if (move.specialMove(type) && this.battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_SPDEF) {
        multipliers.defense_multiplier! *= 1.1;
      }
    }
    if (skill >= PBTrainerAI.highSkill() && this.pbTargetsMultiple(move, user)) {
      multipliers.final_damage_multiplier! *= 0.75;
    }
    if (skill >= PBTrainerAI.mediumSkill()) {
      switch (user.effectiveWeather()) {
        case "Sun": case "HarshSun":
          switch (type) {
            case "FIRE":
              multipliers.final_damage_multiplier! *= 1.5;
              break;
            case "WATER": // Added for Hydro Steam
              if (move.function !== "IncreasePowerInSunWeather") multipliers.final_damage_multiplier! /= 2;
              break;
          }
          break;
        case "Rain": case "HeavyRain":
          switch (type) {
            case "FIRE":
              multipliers.final_damage_multiplier! /= 2;
              break;
            case "WATER":
              multipliers.final_damage_multiplier! *= 1.5;
              break;
          }
          break;
        case "Sandstorm":
          if (target.pbHasType("ROCK") && move.specialMove(type) &&
              move.function !== "UseTargetDefenseInsteadOfTargetSpDef") {
            multipliers.defense_multiplier! *= 1.5;
          }
          break;
        //-------------------------------------------------------------------------
        // Added for Gen 9 Snow
        //-------------------------------------------------------------------------
        case "Hail":
          if (Settings.HAIL_WEATHER_TYPE > 0 && target.pbHasType("ICE") && move.physicalMove(type) &&
              (move.physicalMove(type) || move.function === "UseTargetDefenseInsteadOfTargetSpDef")) {
            multipliers.defense_multiplier! *= 1.5;
          }
          break;
        //-------------------------------------------------------------------------
      }
    }
    if (skill >= PBTrainerAI.mediumSkill() && type && user.pbHasType(type)) {
      if (user.hasActiveAbility("ADAPTABILITY")) {
        multipliers.final_damage_multiplier! *= 2;
      } else {
        multipliers.final_damage_multiplier! *= 1.5;
      }
    }
    if (skill >= PBTrainerAI.mediumSkill()) {
      const typemod = this.pbCalcTypeMod(type, user, target);
      multipliers.final_damage_multiplier! *= typemod / Effectiveness.NORMAL_EFFECTIVE;
    }
    if (skill >= PBTrainerAI.highSkill() && move.physicalMove(type) &&
        user.status === "BURN" && !user.hasActiveAbility("GUTS") &&
        !(Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 &&
          move.function === "DoublePowerIfUserPoisonedBurnedParalyzed")) {
      multipliers.final_damage_multiplier! /= 2;
    }
    //---------------------------------------------------------------------------
    // Added for Drowsy (Ruby: checks the user's status, not the target's)
    //---------------------------------------------------------------------------
    if (skill >= PBTrainerAI.highSkill() && user.status === "DROWSY") {
      multipliers.final_damage_multiplier! *= 4 / 3.0;
    }
    //---------------------------------------------------------------------------
    // Added for Frostbite
    //---------------------------------------------------------------------------
    if (skill >= PBTrainerAI.highSkill() && move.specialMove(type) && user.status === "FROSTBITE") {
      multipliers.final_damage_multiplier! /= 2;
    }
    //---------------------------------------------------------------------------
    if (skill >= PBTrainerAI.highSkill() && !move.ignoresReflect() && !user.hasActiveAbility("INFILTRATOR")) {
      if (target.pbOwnSide().effects[PBEffects.AuroraVeil] > 0) {
        if (this.battle.pbSideBattlerCount(target) > 1) {
          multipliers.final_damage_multiplier! *= 2 / 3.0;
        } else {
          multipliers.final_damage_multiplier! /= 2;
        }
      } else if (target.pbOwnSide().effects[PBEffects.Reflect] > 0 && move.physicalMove(type)) {
        if (this.battle.pbSideBattlerCount(target) > 1) {
          multipliers.final_damage_multiplier! *= 2 / 3.0;
        } else {
          multipliers.final_damage_multiplier! /= 2;
        }
      } else if (target.pbOwnSide().effects[PBEffects.LightScreen] > 0 && move.specialMove(type)) {
        if (this.battle.pbSideBattlerCount(target) > 1) {
          multipliers.final_damage_multiplier! *= 2 / 3.0;
        } else {
          multipliers.final_damage_multiplier! /= 2;
        }
      }
    }
    if (skill >= PBTrainerAI.highSkill() && target.effects[PBEffects.Minimize] && move.tramplesMinimize()) {
      multipliers.final_damage_multiplier! *= 2;
    }
    //---------------------------------------------------------------------------
    // Added for Glaive Rush
    //---------------------------------------------------------------------------
    if (skill >= PBTrainerAI.highSkill() && target.effects[PBEffects.GlaiveRush] > 0) {
      multipliers.final_damage_multiplier! *= 2;
    }
    //---------------------------------------------------------------------------
    baseDmg = Math.max(rubyRound(baseDmg * multipliers.base_damage_multiplier!), 1);
    atk = Math.max(rubyRound(atk * multipliers.attack_multiplier!), 1);
    defense = Math.max(rubyRound(defense * multipliers.defense_multiplier!), 1);
    // Integer arithmetic once the level term is floored
    let damage = rubyDiv(rubyDiv(Math.floor((2.0 * user.level / 5) + 2) * baseDmg * atk, defense), 50) + 2;
    damage = Math.max(rubyRound(damage * multipliers.final_damage_multiplier!), 1);
    if (skill >= PBTrainerAI.mediumSkill()) {
      let c = 0;
      if (c >= 0 && user.abilityActive()) {
        c = AbilityEffects.triggerCriticalCalcFromUser(user.ability, user, target, c);
      }
      if (skill >= PBTrainerAI.bestSkill() && c >= 0 && !moldBreaker && target.abilityActive()) {
        c = AbilityEffects.triggerCriticalCalcFromTarget(target.ability, user, target, c);
      }
      if (c >= 0 && user.itemActive()) {
        c = ItemEffects.triggerCriticalCalcFromUser(user.item, user, target, c);
      }
      if (skill >= PBTrainerAI.bestSkill() && c >= 0 && target.itemActive()) {
        c = ItemEffects.triggerCriticalCalcFromTarget(target.item, user, target, c);
      }
      if (target.pbOwnSide().effects[PBEffects.LuckyChant] > 0) c = -1;
      if (c >= 0) {
        if (move.highCriticalRate()) c += 1;
        c += user.effects[PBEffects.FocusEnergy] as number;
        if (user.inHyperMode() && move.type === "SHADOW") c += 1;
      }
      if (c >= 0) {
        if (c > 4) c = 4;
        damage += damage * 0.1 * c;
      }
    }
    return Math.floor(damage);
  },

  //=============================================================================
  // Accuracy calculation
  //=============================================================================
  pbRoughAccuracy(this: AI, move: Move, user: Battler, target: Battler, skill: number): number {
    // "Always hit" effects and "always hit" accuracy
    if (skill >= PBTrainerAI.mediumSkill()) {
      if (target.effects[PBEffects.Minimize] && move.tramplesMinimize() &&
          Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) return 125;
      if (target.effects[PBEffects.Telekinesis] > 0) return 125;
    }
    let baseAcc = move.accuracy;
    if (skill >= PBTrainerAI.highSkill()) {
      baseAcc = move.pbBaseAccuracy(user, target);
    }
    if (baseAcc === 0 && skill >= PBTrainerAI.mediumSkill()) return 125;
    // Get the move's type
    const type = this.pbRoughType(move, user, skill);
    // Calculate all modifier effects
    const modifiers: AccuracyModifiers = {};
    modifiers.base_accuracy = baseAcc;
    modifiers.accuracy_stage = user.stages.ACCURACY!;
    modifiers.evasion_stage = target.stages.EVASION!;
    modifiers.accuracy_multiplier = 1.0;
    modifiers.evasion_multiplier = 1.0;
    this.pbCalcAccuracyModifiers(user, target, modifiers, move, type, skill);
    // Check if move can't miss
    if (modifiers.base_accuracy === 0) return 125;
    // Calculation
    const accStage = Math.min(Math.max(modifiers.accuracy_stage!, -6), 6) + 6;
    const evaStage = Math.min(Math.max(modifiers.evasion_stage!, -6), 6) + 6;
    const stageMul = [3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9];
    const stageDiv = [9, 8, 7, 6, 5, 4, 3, 3, 3, 3, 3, 3, 3];
    let accuracy = 100.0 * stageMul[accStage]! / stageDiv[accStage]!;
    let evasion = 100.0 * stageMul[evaStage]! / stageDiv[evaStage]!;
    accuracy = rubyRound(accuracy * modifiers.accuracy_multiplier!);
    evasion = rubyRound(evasion * modifiers.evasion_multiplier!);
    if (evasion < 1) evasion = 1;
    // Integer division: base_accuracy, accuracy and evasion are all Integers
    return rubyDiv(modifiers.base_accuracy! * accuracy, evasion);
  },

  pbCalcAccuracyModifiers(this: AI, user: Battler, target: Battler, modifiers: AccuracyModifiers, move: Move,
    type: Id | null, skill: number): void {
    let moldBreaker = false;
    if (skill >= PBTrainerAI.highSkill() && target.hasMoldBreaker()) {
      moldBreaker = true;
    }
    // Ability effects that alter accuracy calculation
    if (skill >= PBTrainerAI.mediumSkill()) {
      if (user.abilityActive()) {
        AbilityEffects.triggerAccuracyCalcFromUser(
          user.ability, modifiers, user, target, move, type as Id,
        );
      }
      for (const b of user.allAllies()) {
        if (!b.abilityActive()) continue;
        AbilityEffects.triggerAccuracyCalcFromAlly(
          b.ability, modifiers, user, target, move, type as Id,
        );
      }
    }
    if (skill >= PBTrainerAI.bestSkill() && target.abilityActive() && !moldBreaker) {
      AbilityEffects.triggerAccuracyCalcFromTarget(
        target.ability, modifiers, user, target, move, type as Id,
      );
    }
    // Item effects that alter accuracy calculation
    if (skill >= PBTrainerAI.mediumSkill() && user.itemActive()) {
      ItemEffects.triggerAccuracyCalcFromUser(
        user.item, modifiers, user, target, move, type as Id,
      );
    }
    if (skill >= PBTrainerAI.bestSkill() && target.itemActive()) {
      ItemEffects.triggerAccuracyCalcFromTarget(
        target.item, modifiers, user, target, move, type as Id,
      );
    }
    // Other effects, inc. ones that set accuracy_multiplier or evasion_stage to specific values
    if (skill >= PBTrainerAI.mediumSkill()) {
      if (this.battle.field.effects[PBEffects.Gravity] > 0) {
        modifiers.accuracy_multiplier! *= 5 / 3.0;
      }
      if (user.effects[PBEffects.MicleBerry]) {
        modifiers.accuracy_multiplier! *= 1.2;
      }
      if (target.effects[PBEffects.Foresight] && modifiers.evasion_stage! > 0) modifiers.evasion_stage = 0;
      if (target.effects[PBEffects.MiracleEye] && modifiers.evasion_stage! > 0) modifiers.evasion_stage = 0;
    }
    // "AI-specific calculations below"
    if (skill >= PBTrainerAI.mediumSkill()) {
      if (move.function === "IgnoreTargetDefSpDefEvaStatStages") modifiers.evasion_stage = 0; // Chip Away
      if (user.effects[PBEffects.LockOn] > 0 &&
          user.effects[PBEffects.LockOnPos] === target.index) modifiers.base_accuracy = 0;
    }
    if (skill >= PBTrainerAI.highSkill()) {
      if (move.function === "BadPoisonTarget" && // Toxic
          Settings.MORE_TYPE_EFFECTS && move.statusMove() && user.pbHasType("POISON")) {
        modifiers.base_accuracy = 0;
      }
      if (["OHKO", "OHKOIce", "OHKOHitsUndergroundTarget"].includes(move.function)) {
        modifiers.base_accuracy = move.accuracy + user.level - target.level;
        if (target.level > user.level) modifiers.accuracy_multiplier = 0;
        if (skill >= PBTrainerAI.bestSkill() && target.hasActiveAbility("STURDY")) {
          modifiers.accuracy_multiplier = 0;
        }
      }
    }
  },
};

/** Pokemon#types (a method) or Battle::Battler#types (an attribute). */
function typesOf(x: Pokemon | Battler): Id[] {
  return typeof x.types === "function" ? (x as Pokemon).types() : (x as Battler).types;
}

type Methods = typeof methods;
declare module "./Battle_AI" {
  interface AI extends Methods {}
}
Object.assign(AI.prototype, methods);
