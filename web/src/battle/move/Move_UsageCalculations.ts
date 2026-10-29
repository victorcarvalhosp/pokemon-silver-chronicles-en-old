// Port of Data/Scripts/011_Battle/003_Move/003_Move_UsageCalculations.rb, with:
// - Generation 9 Pack ([001] Battle/[001] Battle.rb:225): pbAdditionalEffectChance
//   (Covert Cloak, Frostbite chance doubled in Hail/Snow); :238 pbFlinchChance
//   (Covert Cloak); :249 pbAccuracyCheck (Commander, Glaive Rush); :265
//   pbCalcDamageMultipliers (Ruin abilities, Hydro Steam, Electro Drift-style
//   terrain boost, Snow Defense boost, Frostbite, Drowsy, Glaive Rush).
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:331): pbIsCritical?
//   is redefined (CriticalBoost effect).
// - ZUD Mechanics ([006] Battle_Move/Battle_Move.rb:47): pbBaseType is redefined
//   (Z-Moves ignore type-changing abilities); [009] Max Raid/Raid_Battle_Overrides.rb:153
//   pbCalcDamage (Max Raid shield thresholds), :178 pbCalcDamageMultipliers
//   (damage reduced while Raid shields are up), :189 pbAdditionalEffectChance
//   (no added effects while Raid shields are up).
// Alias chains (load order Hotfixes → Gen 9 → Mega → Deluxe → ZUD):
//   pbAdditionalEffectChance = ZUD( Gen 9( core ) )
//   pbCalcDamageMultipliers = ZUD( Gen 9( core ) )
//   pbCalcDamage = ZUD( core ); pbFlinchChance = Gen 9( core )
//   pbAccuracyCheck = Gen 9( core )
//   pbIsCritical? = Deluxe (redefined); pbBaseType = ZUD (redefined)
//
// Sync/async: see the table in Move_Usage.ts. Everything here is synchronous
// except pbCalcDamage (async because Spectral Thief's override displays).
//
// Numeric notes (bit-exact with Ruby): stats, base damage and the damage are
// Integers; the multipliers hash holds Floats (start at 1.0), so every
// operation on it is a float operation. `x.round` is rubyRound, Integer
// division of positive Integers is Math.floor(a / b).

import type { Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Battler } from "../battler/Battler";
import { AbilityEffects, type AccuracyModifiers, type DamageMultipliers } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Confusion } from "./Move_BaseEffects";
import { Move } from "./Move";

const methods = {
  //=============================================================================
  // Move's type calculation
  //=============================================================================
  /** ZUD Mechanics (redefined): Z-Moves aren't affected by type-changing Abilities. */
  pbBaseType(this: Move, user: Battler): Id | null {
    let ret = this.type;
    if (user.selectedMoveIsZMove) return ret;
    if (ret && user.abilityActive()) {
      ret = AbilityEffects.triggerModifyMoveBaseType(user.ability, user, this, ret);
    }
    return ret;
  },

  pbCalcType(this: Move, user: Battler): Id | null {
    this.powerBoost = false;
    let ret = this.pbBaseType(user);
    if (ret && Type.exists("ELECTRIC")) {
      if (this.battle.field.effects[PBEffects.IonDeluge] && ret === "NORMAL") {
        ret = "ELECTRIC";
        this.powerBoost = false;
      }
      if (user.effects[PBEffects.Electrify]) {
        ret = "ELECTRIC";
        this.powerBoost = false;
      }
    }
    return ret;
  },

  //=============================================================================
  // Type effectiveness calculation
  //=============================================================================
  pbCalcTypeModSingle(this: Move, moveType: Id, defType: Id, user: Battler, target: Battler): number {
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

  pbCalcTypeMod(this: Move, moveType: Id | null, user: Battler, target: Battler): number {
    if (!moveType) return Effectiveness.NORMAL_EFFECTIVE;
    if (moveType === "GROUND" && target.pbHasType("FLYING") && target.hasActiveItem("IRONBALL")) {
      return Effectiveness.NORMAL_EFFECTIVE;
    }
    // Determine types
    const tTypes = target.pbTypes(true);
    // Get effectivenesses
    const typeMods: number[] = [Effectiveness.NORMAL_EFFECTIVE_ONE, Effectiveness.NORMAL_EFFECTIVE_ONE,
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
    if (target.effects[PBEffects.TarShot] && moveType === "FIRE") ret *= 2;
    return ret;
  },

  //=============================================================================
  // Accuracy check
  //=============================================================================
  pbBaseAccuracy(this: Move, _user: Battler, _target: Battler): number { return this.accuracy; },

  /** Accuracy calculations for one-hit KO moves are handled elsewhere. */
  pbAccuracyCheck(this: Move, user: Battler, target: Battler): boolean {
    // Generation 9 Pack: moves on Pokémon whose Commander ability is currently
    // active always miss; moves on Pokémon who are under the negative effects
    // of Glaive Rush always hit.
    if (target.isCommander()) return false;
    if (target.effects[PBEffects.GlaiveRush] > 0) return true;
    // "Always hit" effects and "always hit" accuracy
    if (target.effects[PBEffects.Telekinesis] > 0) return true;
    if (target.effects[PBEffects.Minimize] && this.tramplesMinimize() && Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      return true;
    }
    const baseAcc = this.pbBaseAccuracy(user, target);
    if (baseAcc === 0) return true;
    // Calculate all multiplier effects
    const modifiers: AccuracyModifiers = {};
    modifiers.base_accuracy = baseAcc;
    modifiers.accuracy_stage = user.stages.ACCURACY!;
    modifiers.evasion_stage = target.stages.EVASION!;
    modifiers.accuracy_multiplier = 1.0;
    modifiers.evasion_multiplier = 1.0;
    this.pbCalcAccuracyModifiers(user, target, modifiers);
    // Check if move can't miss
    if (modifiers.base_accuracy === 0) return true;
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
    // (no accuracy handler sets base_accuracy to a Float).
    const threshold = Math.floor(modifiers.base_accuracy! * accuracy / evasion);
    // Calculation
    const r = this.battle.pbRandom(100);
    if (Settings.AFFECTION_EFFECTS && this.battle.internalBattle &&
        target.pbOwnedByPlayer() && target.affectionLevel() === 5 && !target.mega()) {
      if (r < threshold - 10) return true;
      if (r < threshold) target.damageState.affectionMissed = true;
      return false;
    }
    return r < threshold;
  },

  pbCalcAccuracyModifiers(this: Move, user: Battler, target: Battler, modifiers: AccuracyModifiers): void {
    // Ability effects that alter accuracy calculation
    if (user.abilityActive()) {
      AbilityEffects.triggerAccuracyCalcFromUser(
        user.ability, modifiers, user, target, this, this.calcType as Id,
      );
    }
    for (const b of user.allAllies()) {
      if (!b.abilityActive()) continue;
      AbilityEffects.triggerAccuracyCalcFromAlly(
        b.ability, modifiers, user, target, this, this.calcType as Id,
      );
    }
    if (target.abilityActive() && !this.battle.moldBreaker) {
      AbilityEffects.triggerAccuracyCalcFromTarget(
        target.ability, modifiers, user, target, this, this.calcType as Id,
      );
    }
    // Item effects that alter accuracy calculation
    if (user.itemActive()) {
      ItemEffects.triggerAccuracyCalcFromUser(
        user.item, modifiers, user, target, this, this.calcType as Id,
      );
    }
    if (target.itemActive()) {
      ItemEffects.triggerAccuracyCalcFromTarget(
        target.item, modifiers, user, target, this, this.calcType as Id,
      );
    }
    // Other effects, inc. ones that set accuracy_multiplier or evasion_stage to
    // specific values
    if (this.battle.field.effects[PBEffects.Gravity] > 0) {
      modifiers.accuracy_multiplier! *= 5 / 3.0;
    }
    if (user.effects[PBEffects.MicleBerry]) {
      user.effects[PBEffects.MicleBerry] = false;
      modifiers.accuracy_multiplier! *= 1.2;
    }
    if (target.effects[PBEffects.Foresight] && modifiers.evasion_stage! > 0) modifiers.evasion_stage = 0;
    if (target.effects[PBEffects.MiracleEye] && modifiers.evasion_stage! > 0) modifiers.evasion_stage = 0;
  },

  //=============================================================================
  // Critical hit check
  //=============================================================================
  /**
   * Return values:
   *   -1: Never a critical hit.
   *    0: Calculate normally.
   *    1: Always a critical hit.
   */
  pbCritialOverride(this: Move, _user: Battler, _target: Battler): number { return 0; },

  /**
   * pbIsCritical? — Returns whether the move will be a critical hit.
   * Essentials Deluxe (redefined): adds the CriticalBoost effect.
   */
  pbIsCritical(this: Move, user: Battler, target: Battler): boolean {
    if (target.pbOwnSide().effects[PBEffects.LuckyChant] > 0) return false;
    const ratios = Settings.NEW_CRITICAL_HIT_RATE_MECHANICS ? [24, 8, 2, 1] : [16, 8, 4, 3, 2];
    let c = 0;
    // Ability effects that alter critical hit rate
    if (c >= 0 && user.abilityActive()) {
      c = AbilityEffects.triggerCriticalCalcFromUser(user.ability, user, target, c);
    }
    if (c >= 0 && target.abilityActive() && !this.battle.moldBreaker) {
      c = AbilityEffects.triggerCriticalCalcFromTarget(target.ability, user, target, c);
    }
    // Item effects that alter critical hit rate
    if (c >= 0 && user.itemActive()) {
      c = ItemEffects.triggerCriticalCalcFromUser(user.item, user, target, c);
    }
    if (c >= 0 && target.itemActive()) {
      c = ItemEffects.triggerCriticalCalcFromTarget(target.item, user, target, c);
    }
    if (c < 0) return false;
    // Move-specific "always/never a critical hit" effects
    switch (this.pbCritialOverride(user, target)) {
      case 1: return true;
      case -1: return false;
    }
    // Other effects
    if (c > 50) return true; // Merciless
    if (user.effects[PBEffects.LaserFocus] > 0) return true;
    if (this.highCriticalRate()) {
      // (PluginManager.installed?("PLA Battle Styles") && user.strong_style?) ? 2 : 1 —
      // PLA Battle Styles isn't installed.
      c += 1;
    }
    c += user.effects[PBEffects.FocusEnergy];
    c += user.effects[PBEffects.CriticalBoost]; // Essentials Deluxe
    if (user.inHyperMode() && this.type === "SHADOW") c += 1;
    if (c >= ratios.length) c = ratios.length - 1;
    // Calculation
    if (ratios[c] === 1) return true;
    const r = this.battle.pbRandom(ratios[c]!);
    if (r === 0) return true;
    if (r === 1 && Settings.AFFECTION_EFFECTS && this.battle.internalBattle &&
        user.pbOwnedByPlayer() && user.affectionLevel() === 5 && !target.mega()) {
      target.damageState.affectionCritical = true;
      return true;
    }
    return false;
  },

  //=============================================================================
  // Damage calculation
  //=============================================================================
  pbBaseDamage(this: Move, baseDmg: number, _user: Battler, _target: Battler): number { return baseDmg; },
  pbBaseDamageMultiplier(this: Move, damageMult: number, _user: Battler, _target: Battler): number { return damageMult; },
  pbModifyDamage(this: Move, damageMult: number, _user: Battler, _target: Battler): number { return damageMult; },

  /** Returns [stat, stage + 6]. */
  pbGetAttackStats(this: Move, user: Battler, _target: Battler): [number, number] {
    if (this.specialMove()) {
      return [user.spatk, user.stages.SPECIAL_ATTACK! + 6];
    }
    return [user.attack, user.stages.ATTACK! + 6];
  },

  /** Returns [stat, stage + 6]. */
  pbGetDefenseStats(this: Move, _user: Battler, target: Battler): [number, number] {
    if (this.specialMove()) {
      return [target.spdef, target.stages.SPECIAL_DEFENSE! + 6];
    }
    return [target.defense, target.stages.DEFENSE! + 6];
  },

  async pbCalcDamage(this: Move, user: Battler, target: Battler, numTargets = 1): Promise<void> {
    calcDamageCore(this, user, target, numTargets);
    await this.battle.pbPlayPendingSceneEffects();
    // ZUD Mechanics (Max Raid): damage thresholds for triggering Max Raid shields.
    if (this.battle.raidBattle &&
        target.effects[PBEffects.MaxRaidBoss] &&
        target.effects[PBEffects.ShieldCounter] > 0 &&
        target.damageState.calcDamage > 0) {
      let thresh: number | undefined;
      switch (target.effects[PBEffects.ShieldCounter]) {
        case 1: thresh = Math.floor(target.totalhp / 2); break;
        case 2: thresh = Math.floor(target.totalhp / 5); break;
      }
      // Ruby: thresh is nil (and this raises) for ShieldCounter > 2.
      const hpstop = target.totalhp - thresh!;
      let damage = target.damageState.calcDamage;
      if ((target.hp > hpstop) && (damage > target.hp - hpstop)) {
        damage = target.hp - hpstop + 1;
      } else if (target.hp <= hpstop) {
        damage = 1;
      }
      target.damageState.calcDamage = damage;
    }
  },

  pbCalcDamageMultipliers(this: Move, user: Battler, target: Battler, numTargets: number, type: Id | null,
    baseDmg: number, multipliers: DamageMultipliers): void {
    // Generation 9 Pack: effects that affect damage calculation, applied before
    // the core ones.
    //  -Applies the effects of the various "of Ruin" abilities.
    //  -Negates the damage reduction the move Hydro Steam would have in the Sun.
    //  -Increases the Defense of Ice-types during Snow weather (Gen 9 version).
    //  -Halves the damage dealt by special attacks if the user has the Frostbite status.
    //  -Increases damage taken if the targer has the Drowsy status.
    //  -Doubles damage taken by a target still vulnerable due to Glaive Rush's effect.
    (["TABLETSOFRUIN", "SWORDOFRUIN", "VESSELOFRUIN", "BEADSOFRUIN"] as Id[]).forEach((abil, i) => {
      let category = (i < 2) ? this.physicalMove() : this.specialMove();
      if (i % 2 === 1 && this.battle.field.effects[PBEffects.WonderRoom] > 0) category = !category;
      let mult = (i % 2 === 0) ? multipliers.attack_multiplier! : multipliers.defense_multiplier!;
      // NOTE: Ruby bug preserved — this multiplies a local copy, so the Ruin
      //       abilities have no effect on the multipliers.
      if (this.battle.pbCheckGlobalAbility(abil) && !user.hasActiveAbility(abil) && category) mult *= 0.75;
      void mult;
    });
    if (this.battle.field.terrain === "Electric" && user.affectedByTerrain() &&
        this.function === "IncreasePowerInElectricTerrain") {
      if (type !== "ELECTRIC") multipliers.base_damage_multiplier! *= 1.5;
    }
    switch (user.effectiveWeather()) {
      case "Sun":
      case "HarshSun":
        // Deliberate fix: the plugin writes `if @function = "IncreasePowerInSunWeather"`
        // (an assignment), so in Sun every damaging move got this multiplier and
        // had its function code overwritten. Only Hydro Steam is meant to.
        if (this.function === "IncreasePowerInSunWeather") {
          multipliers.final_damage_multiplier! *= (type === "FIRE") ? 1 : (type === "WATER") ? 3 : 1.5;
        }
        break;
      case "Hail":
        if (Settings.HAIL_WEATHER_TYPE > 0 && target.pbHasType("ICE") &&
            (this.physicalMove() || this.function === "UseTargetDefenseInsteadOfTargetSpDef")) {
          multipliers.defense_multiplier! *= 1.5;
        }
        break;
    }
    if (user.status === "FROSTBITE" && this.specialMove()) {
      multipliers.final_damage_multiplier! /= 2;
    }
    if (target.status === "DROWSY") {
      multipliers.final_damage_multiplier! *= 4 / 3.0;
    }
    if (target.effects[PBEffects.GlaiveRush] > 0) multipliers.final_damage_multiplier! *= 2;
    // Core Essentials
    calcDamageMultipliersCore(this, user, target, numTargets, type, baseDmg, multipliers);
    // ZUD Mechanics (Max Raid): Max Raid Pokémon take greatly reduced damage while shields are up.
    if (target.effects[PBEffects.RaidShield] > 0) {
      multipliers.final_damage_multiplier! /= 24;
    }
  },

  //=============================================================================
  // Additional effect chance
  //=============================================================================
  pbAdditionalEffectChance(this: Move, user: Battler, target: Battler, effectChance = 0): number {
    // ZUD Mechanics (Max Raid): effect immunity for Max Raid Pokémon while shields are up.
    if (target.effects[PBEffects.MaxRaidBoss] && target.effects[PBEffects.RaidShield] > 0) return 0;
    // Generation 9 Pack: Covert Cloak blocks additional effects; moves that may
    // cause Frostbite have an increased chance to do so in Hail/Snow.
    if (target.hasActiveItem("COVERTCLOAK")) return 0;
    let ret = additionalEffectChanceCore(this, user, target, effectChance);
    if (ret === 0 || ret === 100) return ret;
    if (this.battle.pbWeather() === "Hail" &&
        (this.function.includes("FrostbiteTarget") ||
         (Settings.FREEZE_EFFECTS_CAUSE_FROSTBITE && this.function.includes("FreezeTarget")))) {
      ret *= 2;
    }
    return Math.min(ret, 100);
  },

  /**
   * NOTE: Flinching caused by a move's effect is applied in that move's code,
   *       not here.
   */
  pbFlinchChance(this: Move, user: Battler, target: Battler): number {
    // Generation 9 Pack: Covert Cloak.
    if (target.hasActiveItem("COVERTCLOAK")) return 0;
    if (this.flinchingMove()) return 0;
    if (target.hasActiveAbility("SHIELDDUST") && !this.battle.moldBreaker) return 0;
    let ret = 0;
    if (user.hasActiveAbility("STENCH", true) ||
        user.hasActiveItem(["KINGSROCK", "RAZORFANG"], true)) {
      ret = 10;
    }
    if (user.hasActiveAbility("SERENEGRACE") ||
        user.pbOwnSide().effects[PBEffects.Rainbow] > 0) ret *= 2;
    return ret;
  },
};

/** Core Essentials pbCalcDamage (wrapped by ZUD Mechanics' Max Raid alias). */
function calcDamageCore(move: Move, user: Battler, target: Battler, numTargets: number): void {
  if (move.statusMove()) return;
  if (target.damageState.disguise || target.damageState.iceFace) {
    target.damageState.calcDamage = 1;
    return;
  }
  const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
  const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
  // Get the move's type
  const type = move.calcType; // nil is treated as physical
  // Calculate whether this hit deals critical damage
  target.damageState.critical = move.pbIsCritical(user, target);
  // Calcuate base power of move
  let baseDmg = move.pbBaseDamage(move.baseDamage, user, target);
  // Calculate user's attack stat
  let [atk, atkStage] = move.pbGetAttackStats(user, target);
  if (!target.hasActiveAbility("UNAWARE") || move.battle.moldBreaker) {
    if (target.damageState.critical && atkStage < 6) atkStage = 6;
    atk = Math.floor(atk * stageMul[atkStage]! / stageDiv[atkStage]!);
  }
  // Calculate target's defense stat
  let [defense, defStage] = move.pbGetDefenseStats(user, target);
  if (!user.hasActiveAbility("UNAWARE")) {
    if (target.damageState.critical && defStage > 6) defStage = 6;
    defense = Math.floor(defense * stageMul[defStage]! / stageDiv[defStage]!);
  }
  // Calculate all multiplier effects
  const multipliers: DamageMultipliers = {
    base_damage_multiplier: 1.0,
    attack_multiplier: 1.0,
    defense_multiplier: 1.0,
    final_damage_multiplier: 1.0,
  };
  move.pbCalcDamageMultipliers(user, target, numTargets, type, baseDmg, multipliers);
  // Main damage calculation
  baseDmg = Math.max(rubyRound(baseDmg * multipliers.base_damage_multiplier!), 1);
  atk = Math.max(rubyRound(atk * multipliers.attack_multiplier!), 1);
  defense = Math.max(rubyRound(defense * multipliers.defense_multiplier!), 1);
  // ((2.0 * level / 5) + 2).floor is an Integer, so the rest is Integer
  // arithmetic (Integer division floors).
  let damage = Math.floor(Math.floor(Math.floor((2.0 * user.level / 5) + 2) * baseDmg * atk / defense) / 50) + 2;
  damage = Math.max(rubyRound(damage * multipliers.final_damage_multiplier!), 1);
  target.damageState.calcDamage = damage;
}

/** Core Essentials pbCalcDamageMultipliers (wrapped by Generation 9 Pack and ZUD Mechanics). */
function calcDamageMultipliersCore(move: Move, user: Battler, target: Battler, numTargets: number, type: Id | null,
  baseDmg: number, multipliers: DamageMultipliers): void {
  const battle = move.battle;
  // Global abilities
  if ((battle.pbCheckGlobalAbility("DARKAURA") && type === "DARK") ||
      (battle.pbCheckGlobalAbility("FAIRYAURA") && type === "FAIRY")) {
    if (battle.pbCheckGlobalAbility("AURABREAK")) {
      multipliers.base_damage_multiplier! *= 2 / 3.0;
    } else {
      multipliers.base_damage_multiplier! *= 4 / 3.0;
    }
  }
  // Ability effects that alter damage
  if (user.abilityActive()) {
    AbilityEffects.triggerDamageCalcFromUser(
      user.ability, user, target, move, multipliers, baseDmg, type as Id,
    );
  }
  if (!battle.moldBreaker) {
    // NOTE: It's odd that the user's Mold Breaker prevents its partner's
    //       beneficial abilities (i.e. Flower Gift boosting Atk), but that's
    //       how it works.
    for (const b of user.allAllies()) {
      if (!b.abilityActive()) continue;
      AbilityEffects.triggerDamageCalcFromAlly(
        b.ability, user, target, move, multipliers, baseDmg, type as Id,
      );
    }
    if (target.abilityActive()) {
      AbilityEffects.triggerDamageCalcFromTarget(
        target.ability, user, target, move, multipliers, baseDmg, type as Id,
      );
      AbilityEffects.triggerDamageCalcFromTargetNonIgnorable(
        target.ability, user, target, move, multipliers, baseDmg, type as Id,
      );
    }
    for (const b of target.allAllies()) {
      if (!b.abilityActive()) continue;
      AbilityEffects.triggerDamageCalcFromTargetAlly(
        b.ability, user, target, move, multipliers, baseDmg, type as Id,
      );
    }
  }
  // Item effects that alter damage
  if (user.itemActive()) {
    ItemEffects.triggerDamageCalcFromUser(
      user.item, user, target, move, multipliers, baseDmg, type as Id,
    );
  }
  if (target.itemActive()) {
    ItemEffects.triggerDamageCalcFromTarget(
      target.item, user, target, move, multipliers, baseDmg, type as Id,
    );
  }
  // Parental Bond's second attack
  if (user.effects[PBEffects.ParentalBond] === 1) {
    multipliers.base_damage_multiplier! /= (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7) ? 4 : 2;
  }
  // Other
  if (user.effects[PBEffects.MeFirst]) {
    multipliers.base_damage_multiplier! *= 1.5;
  }
  if (user.effects[PBEffects.HelpingHand] && !(move instanceof Confusion)) {
    multipliers.base_damage_multiplier! *= 1.5;
  }
  if (user.effects[PBEffects.Charge] > 0 && type === "ELECTRIC") {
    multipliers.base_damage_multiplier! *= 2;
  }
  // Mud Sport
  if (type === "ELECTRIC") {
    if (battle.allBattlers().some((b) => b.effects[PBEffects.MudSport])) {
      multipliers.base_damage_multiplier! /= 3;
    }
    if (battle.field.effects[PBEffects.MudSportField] > 0) {
      multipliers.base_damage_multiplier! /= 3;
    }
  }
  // Water Sport
  if (type === "FIRE") {
    if (battle.allBattlers().some((b) => b.effects[PBEffects.WaterSport])) {
      multipliers.base_damage_multiplier! /= 3;
    }
    if (battle.field.effects[PBEffects.WaterSportField] > 0) {
      multipliers.base_damage_multiplier! /= 3;
    }
  }
  // Terrain moves
  const terrainMultiplier = (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8) ? 1.3 : 1.5;
  switch (battle.field.terrain) {
    case "Electric":
      if (type === "ELECTRIC" && user.affectedByTerrain()) multipliers.base_damage_multiplier! *= terrainMultiplier;
      break;
    case "Grassy":
      if (type === "GRASS" && user.affectedByTerrain()) multipliers.base_damage_multiplier! *= terrainMultiplier;
      break;
    case "Psychic":
      if (type === "PSYCHIC" && user.affectedByTerrain()) multipliers.base_damage_multiplier! *= terrainMultiplier;
      break;
    case "Misty":
      if (type === "DRAGON" && target.affectedByTerrain()) multipliers.base_damage_multiplier! /= 2;
      break;
  }
  // Badge multipliers
  if (battle.internalBattle) {
    if (user.pbOwnedByPlayer()) {
      if (move.physicalMove() && battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_ATTACK) {
        multipliers.attack_multiplier! *= 1.1;
      } else if (move.specialMove() && battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_SPATK) {
        multipliers.attack_multiplier! *= 1.1;
      }
    }
    if (target.pbOwnedByPlayer()) {
      if (move.physicalMove() && battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_DEFENSE) {
        multipliers.defense_multiplier! *= 1.1;
      } else if (move.specialMove() && battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_SPDEF) {
        multipliers.defense_multiplier! *= 1.1;
      }
    }
  }
  // Multi-targeting attacks
  if (numTargets > 1) {
    multipliers.final_damage_multiplier! *= 0.75;
  }
  // Weather
  switch (user.effectiveWeather()) {
    case "Sun":
    case "HarshSun":
      switch (type) {
        case "FIRE": multipliers.final_damage_multiplier! *= 1.5; break;
        case "WATER": multipliers.final_damage_multiplier! /= 2; break;
      }
      break;
    case "Rain":
    case "HeavyRain":
      switch (type) {
        case "FIRE": multipliers.final_damage_multiplier! /= 2; break;
        case "WATER": multipliers.final_damage_multiplier! *= 1.5; break;
      }
      break;
    case "Sandstorm":
      if (target.pbHasType("ROCK") && move.specialMove() && move.function !== "UseTargetDefenseInsteadOfTargetSpDef") {
        multipliers.defense_multiplier! *= 1.5;
      }
      break;
  }
  // Critical hits
  if (target.damageState.critical) {
    if (Settings.NEW_CRITICAL_HIT_RATE_MECHANICS) {
      multipliers.final_damage_multiplier! *= 1.5;
    } else {
      multipliers.final_damage_multiplier! *= 2;
    }
  }
  // Random variance
  if (!(move instanceof Confusion)) {
    const random = 85 + battle.pbRandom(16);
    multipliers.final_damage_multiplier! *= random / 100.0;
  }
  // STAB
  if (type && user.pbHasType(type)) {
    if (user.hasActiveAbility("ADAPTABILITY")) {
      multipliers.final_damage_multiplier! *= 2;
    } else {
      multipliers.final_damage_multiplier! *= 1.5;
    }
  }
  // Type effectiveness
  multipliers.final_damage_multiplier! *= target.damageState.typeMod / Effectiveness.NORMAL_EFFECTIVE;
  // Burn
  if (user.status === "BURN" && move.physicalMove() && move.damageReducedByBurn() &&
      !user.hasActiveAbility("GUTS")) {
    multipliers.final_damage_multiplier! /= 2;
  }
  // Aurora Veil, Reflect, Light Screen
  if (!move.ignoresReflect() && !target.damageState.critical &&
      !user.hasActiveAbility("INFILTRATOR")) {
    if (target.pbOwnSide().effects[PBEffects.AuroraVeil] > 0) {
      if (battle.pbSideBattlerCount(target) > 1) {
        multipliers.final_damage_multiplier! *= 2 / 3.0;
      } else {
        multipliers.final_damage_multiplier! /= 2;
      }
    } else if (target.pbOwnSide().effects[PBEffects.Reflect] > 0 && move.physicalMove()) {
      if (battle.pbSideBattlerCount(target) > 1) {
        multipliers.final_damage_multiplier! *= 2 / 3.0;
      } else {
        multipliers.final_damage_multiplier! /= 2;
      }
    } else if (target.pbOwnSide().effects[PBEffects.LightScreen] > 0 && move.specialMove()) {
      if (battle.pbSideBattlerCount(target) > 1) {
        multipliers.final_damage_multiplier! *= 2 / 3.0;
      } else {
        multipliers.final_damage_multiplier! /= 2;
      }
    }
  }
  // Minimize
  if (target.effects[PBEffects.Minimize] && move.tramplesMinimize()) {
    multipliers.final_damage_multiplier! *= 2;
  }
  // Move-specific base damage modifiers
  multipliers.base_damage_multiplier = move.pbBaseDamageMultiplier(multipliers.base_damage_multiplier!, user, target);
  // Move-specific final damage modifiers
  multipliers.final_damage_multiplier = move.pbModifyDamage(multipliers.final_damage_multiplier!, user, target);
}

/** Core Essentials pbAdditionalEffectChance (wrapped by Generation 9 Pack and ZUD Mechanics). */
function additionalEffectChanceCore(move: Move, user: Battler, target: Battler, effectChance: number): number {
  if (target.hasActiveAbility("SHIELDDUST") && !move.battle.moldBreaker) return 0;
  let ret = (effectChance > 0) ? effectChance : move.addlEffect;
  if ((Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 || move.function !== "EffectDependsOnEnvironment") &&
      (user.hasActiveAbility("SERENEGRACE") || user.pbOwnSide().effects[PBEffects.Rainbow] > 0)) {
    ret *= 2;
  }
  // Skipped: `ret = 100 if $DEBUG && Input.press?(Input::CTRL)` (debug-only key check).
  return ret;
}

type Methods = typeof methods;
declare module "./Move" {
  interface Move extends Methods {}
}
Object.assign(Move.prototype, methods);
