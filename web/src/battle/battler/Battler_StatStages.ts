// Port of Data/Scripts/011_Battle/002_Battler/005_Battler_StatStages.rb, with:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb): pbCanLowerStatStage?
//   and pbLowerAttackStatStageIntimidate (Clear Amulet), pbLowerStatStageByAbility
//   (Guard Dog), pbRaiseStatStage/pbRaiseStatStageByCause/pbRaiseStatStageByAbility
//   (Opportunist/Mirror Herb), and the new pbMirrorStatUpsOpposing and
//   addSideStatUps.
// Alias chains: each patched method = Gen 9( core ).
//
// Async: pbCanRaiseStatStage and pbCanLowerStatStage are async (no sync
// variant): pbCanLowerStatStage? calls the StatLossImmunity ability/item
// triggers, which are async, and pbCanRaiseStatStage? calls it for Contrary.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";

/** Core Essentials' pbRaiseStatStage. */
async function raiseStatStageCore(b: Battler, stat: Id, increment: number, user: Battler | null,
  showAnim: boolean, ignoreContrary: boolean): Promise<boolean> {
  // Contrary
  if (b.hasActiveAbility("CONTRARY") && !ignoreContrary && !b.battle.moldBreaker) {
    return b.pbLowerStatStage(stat, increment, user, showAnim, true);
  }
  // Perform the stat stage change
  increment = b.pbRaiseStatStageBasic(stat, increment, ignoreContrary);
  if (increment <= 0) return false;
  // Stat up animation and message
  if (showAnim) await b.battle.pbCommonAnimation("StatUp", b);
  const arrStatTexts = [
    _INTL("{1}'s {2} rose!", b.pbThis(), Stat.get(stat).name),
    _INTL("{1}'s {2} rose sharply!", b.pbThis(), Stat.get(stat).name),
    _INTL("{1}'s {2} rose drastically!", b.pbThis(), Stat.get(stat).name),
  ];
  await b.battle.pbDisplay(arrStatTexts[Math.min(increment - 1, 2)]!);
  // Trigger abilities upon stat gain
  if (b.abilityActive()) {
    await AbilityEffects.triggerOnStatGain(b.ability, b, stat, user as Battler);
  }
  return true;
}

/** Core Essentials' pbRaiseStatStageByCause. */
async function raiseStatStageByCauseCore(b: Battler, stat: Id, increment: number, user: Battler, cause: string,
  showAnim: boolean, ignoreContrary: boolean): Promise<boolean> {
  // Contrary
  if (b.hasActiveAbility("CONTRARY") && !ignoreContrary && !b.battle.moldBreaker) {
    return b.pbLowerStatStageByCause(stat, increment, user, cause, showAnim, true);
  }
  // Perform the stat stage change
  increment = b.pbRaiseStatStageBasic(stat, increment, ignoreContrary);
  if (increment <= 0) return false;
  // Stat up animation and message
  if (showAnim) await b.battle.pbCommonAnimation("StatUp", b);
  let arrStatTexts: string[];
  if (user.index === b.index) {
    arrStatTexts = [
      _INTL("{1}'s {2} raised its {3}!", b.pbThis(), cause, Stat.get(stat).name),
      _INTL("{1}'s {2} sharply raised its {3}!", b.pbThis(), cause, Stat.get(stat).name),
      _INTL("{1}'s {2} drastically raised its {3}!", b.pbThis(), cause, Stat.get(stat).name),
    ];
  } else {
    arrStatTexts = [
      _INTL("{1}'s {2} raised {3}'s {4}!", user.pbThis(), cause, b.pbThis(true), Stat.get(stat).name),
      _INTL("{1}'s {2} sharply raised {3}'s {4}!", user.pbThis(), cause, b.pbThis(true), Stat.get(stat).name),
      _INTL("{1}'s {2} drastically raised {3}'s {4}!", user.pbThis(), cause, b.pbThis(true), Stat.get(stat).name),
    ];
  }
  await b.battle.pbDisplay(arrStatTexts[Math.min(increment - 1, 2)]!);
  // Trigger abilities upon stat gain
  if (b.abilityActive()) {
    await AbilityEffects.triggerOnStatGain(b.ability, b, stat, user);
  }
  return true;
}

/** Core Essentials' pbRaiseStatStageByAbility. */
async function raiseStatStageByAbilityCore(b: Battler, stat: Id, increment: number, user: Battler,
  splashAnim: boolean): Promise<boolean> {
  if (b.fainted()) return false;
  let ret = false;
  if (splashAnim) await b.battle.pbShowAbilitySplash(user);
  if (await b.pbCanRaiseStatStage(stat, user, null, Scene.USE_ABILITY_SPLASH)) {
    if (Scene.USE_ABILITY_SPLASH) {
      ret = await b.pbRaiseStatStage(stat, increment, user);
    } else {
      ret = await b.pbRaiseStatStageByCause(stat, increment, user, user.abilityName());
    }
  }
  if (splashAnim) await b.battle.pbHideAbilitySplash(user);
  return ret;
}

/** Core Essentials' pbCanLowerStatStage?. */
async function canLowerStatStageCore(b: Battler, stat: Id, user: Battler | null, move: Move | null,
  showFailMsg: boolean, ignoreContrary: boolean, ignoreMirrorArmor: boolean): Promise<boolean> {
  if (b.fainted()) return false;
  if (!b.battle.moldBreaker) {
    // Contrary
    if (b.hasActiveAbility("CONTRARY") && !ignoreContrary) {
      return b.pbCanRaiseStatStage(stat, user, move, showFailMsg, true);
    }
    // Mirror Armor
    if (b.hasActiveAbility("MIRRORARMOR") && !ignoreMirrorArmor &&
        user && user.index !== b.index && !b.statStageAtMin(stat)) {
      return true;
    }
  }
  if (!user || user.index !== b.index) { // Not self-inflicted
    if (b.effects[PBEffects.Substitute] > 0 &&
        (ignoreMirrorArmor || !(move && move.ignoresSubstitute(user)))) {
      if (showFailMsg) await b.battle.pbDisplay(_INTL("{1} is protected by its substitute!", b.pbThis()));
      return false;
    }
    if (b.pbOwnSide().effects[PBEffects.Mist] > 0 &&
        !(user && user.hasActiveAbility("INFILTRATOR"))) {
      if (showFailMsg) await b.battle.pbDisplay(_INTL("{1} is protected by Mist!", b.pbThis()));
      return false;
    }
    if (b.abilityActive()) {
      if (!b.battle.moldBreaker && await AbilityEffects.triggerStatLossImmunity(
        b.ability, b, stat, b.battle, showFailMsg,
      )) return false;
      if (await AbilityEffects.triggerStatLossImmunityNonIgnorable(
        b.ability, b, stat, b.battle, showFailMsg,
      )) return false;
    }
    if (!b.battle.moldBreaker) {
      for (const ally of b.allAllies()) {
        if (!ally.abilityActive()) continue;
        if (await AbilityEffects.triggerStatLossImmunityFromAlly(
          ally.ability, ally, b, stat, b.battle, showFailMsg,
        )) return false;
      }
    }
  }
  // Check the stat stage
  if (b.statStageAtMin(stat)) {
    if (showFailMsg) {
      await b.battle.pbDisplay(_INTL("{1}'s {2} won't go any lower!",
        b.pbThis(), Stat.get(stat).name));
    }
    return false;
  }
  return true;
}

/** Core Essentials' pbLowerStatStageByAbility. */
async function lowerStatStageByAbilityCore(b: Battler, stat: Id, increment: number, user: Battler,
  splashAnim: boolean, checkContact: boolean): Promise<boolean> {
  let ret = false;
  if (splashAnim) await b.battle.pbShowAbilitySplash(user);
  if (await b.pbCanLowerStatStage(stat, user, null, Scene.USE_ABILITY_SPLASH) &&
      (!checkContact || await b.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH))) {
    if (Scene.USE_ABILITY_SPLASH) {
      ret = await b.pbLowerStatStage(stat, increment, user);
    } else {
      ret = await b.pbLowerStatStageByCause(stat, increment, user, user.abilityName());
    }
  }
  if (splashAnim) await b.battle.pbHideAbilitySplash(user);
  return ret;
}

/** Core Essentials' pbLowerAttackStatStageIntimidate. */
async function lowerAttackStatStageIntimidateCore(b: Battler, user: Battler): Promise<boolean> {
  const battle = b.battle;
  if (b.fainted()) return false;
  // NOTE: Substitute intentionally blocks Intimidate even if self has Contrary.
  if (b.effects[PBEffects.Substitute] > 0) {
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} is protected by its substitute!", b.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1}'s substitute protected it from {2}'s {3}!",
        b.pbThis(), user.pbThis(true), user.abilityName()));
    }
    return false;
  }
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8 && b.hasActiveAbility(["OBLIVIOUS", "OWNTEMPO", "INNERFOCUS", "SCRAPPY"])) {
    await battle.pbShowAbilitySplash(b);
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s {2} cannot be lowered!", b.pbThis(), Stat.get("ATTACK").name));
    } else {
      await battle.pbDisplay(_INTL("{1}'s {2} prevents {3} loss!", b.pbThis(), b.abilityName(),
        Stat.get("ATTACK").name));
    }
    await battle.pbHideAbilitySplash(b);
    return false;
  }
  if (Scene.USE_ABILITY_SPLASH) {
    return b.pbLowerStatStageByAbility("ATTACK", 1, user, false);
  }
  // NOTE: These checks exist to ensure appropriate messages are shown if
  //       Intimidate is blocked somehow (i.e. the messages should mention the
  //       Intimidate ability by name).
  if (!b.hasActiveAbility("CONTRARY")) {
    if (b.pbOwnSide().effects[PBEffects.Mist] > 0) {
      await battle.pbDisplay(_INTL("{1} is protected from {2}'s {3} by Mist!",
        b.pbThis(), user.pbThis(true), user.abilityName()));
      return false;
    }
    if (b.abilityActive() &&
        (await AbilityEffects.triggerStatLossImmunity(b.ability, b, "ATTACK", battle, false) ||
         await AbilityEffects.triggerStatLossImmunityNonIgnorable(b.ability, b, "ATTACK", battle, false))) {
      await battle.pbDisplay(_INTL("{1}'s {2} prevented {3}'s {4} from working!",
        b.pbThis(), b.abilityName(), user.pbThis(true), user.abilityName()));
      return false;
    }
    for (const ally of b.allAllies()) {
      if (!ally.abilityActive()) continue;
      if (await AbilityEffects.triggerStatLossImmunityFromAlly(ally.ability, ally, b, "ATTACK", battle, false)) {
        await battle.pbDisplay(_INTL("{1} is protected from {2}'s {3} by {4}'s {5}!",
          b.pbThis(), user.pbThis(true), user.abilityName(), ally.pbThis(true), ally.abilityName()));
        return false;
      }
    }
  }
  if (!await b.pbCanLowerStatStage("ATTACK", user)) return false;
  return b.pbLowerStatStageByCause("ATTACK", 1, user, user.abilityName());
}

const methods = {
  //=============================================================================
  // Increase stat stages
  //=============================================================================
  /** statStageAtMax? */
  statStageAtMax(this: Battler, stat: Id): boolean {
    return this.stages[stat]! >= 6;
  },

  /** pbCanRaiseStatStage? (async: see the file header) */
  async pbCanRaiseStatStage(this: Battler, stat: Id, user: Battler | null = null, move: Move | null = null,
    showFailMsg = false, ignoreContrary = false): Promise<boolean> {
    if (this.fainted()) return false;
    // Contrary
    if (this.hasActiveAbility("CONTRARY") && !ignoreContrary && !this.battle.moldBreaker) {
      return this.pbCanLowerStatStage(stat, user, move, showFailMsg, true);
    }
    // Check the stat stage
    if (this.statStageAtMax(stat)) {
      if (showFailMsg) {
        await this.battle.pbDisplay(_INTL("{1}'s {2} won't go any higher!",
          this.pbThis(), Stat.get(stat).name));
      }
      return false;
    }
    return true;
  },

  pbRaiseStatStageBasic(this: Battler, stat: Id, increment: number, ignoreContrary = false): number {
    if (!this.battle.moldBreaker) {
      // Contrary
      if (this.hasActiveAbility("CONTRARY") && !ignoreContrary) {
        return this.pbLowerStatStageBasic(stat, increment, true);
      }
      // Simple
      if (this.hasActiveAbility("SIMPLE")) increment *= 2;
    }
    // Change the stat stage
    increment = Math.min(increment, 6 - this.stages[stat]!);
    if (increment > 0) {
      const statName = Stat.get(stat).name;
      const newStage = this.stages[stat]! + increment;
      PBDebug.log(`[Stat change] ${this.pbThis()}'s ${statName}: ${this.stages[stat]} -> ${newStage} (+${increment})`);
      this.stages[stat]! += increment;
      this.statsRaisedThisRound = true;
    }
    return increment;
  },

  /** Generation 9 Pack: tallies the stat raise for Opportunist/Mirror Herb. */
  async pbRaiseStatStage(this: Battler, stat: Id, increment: number, user: Battler | null, showAnim = true,
    ignoreContrary = false): Promise<boolean> {
    const ret = await raiseStatStageCore(this, stat, increment, user, showAnim, ignoreContrary);
    // Generation 9 Pack
    if (ret && !this.mirrorHerbUsed && !(this.hasActiveAbility("CONTRARY") && !ignoreContrary && !this.battle.moldBreaker)) {
      this.addSideStatUps(stat, increment);
    }
    return ret;
  },

  /** Generation 9 Pack: tallies the stat raise for Opportunist/Mirror Herb. */
  async pbRaiseStatStageByCause(this: Battler, stat: Id, increment: number, user: Battler, cause: string,
    showAnim = true, ignoreContrary = false): Promise<boolean> {
    const ret = await raiseStatStageByCauseCore(this, stat, increment, user, cause, showAnim, ignoreContrary);
    // Generation 9 Pack
    if (ret && !this.mirrorHerbUsed && !(this.hasActiveAbility("CONTRARY") && !ignoreContrary && !this.battle.moldBreaker)) {
      this.addSideStatUps(stat, increment);
    }
    return ret;
  },

  /** Generation 9 Pack: opposing Opportunist/Mirror Herb copy the raises. */
  async pbRaiseStatStageByAbility(this: Battler, stat: Id, increment: number, user: Battler,
    splashAnim = true): Promise<boolean> {
    const ret = await raiseStatStageByAbilityCore(this, stat, increment, user, splashAnim);
    // Generation 9 Pack
    await this.pbMirrorStatUpsOpposing();
    return ret;
  },

  //=============================================================================
  // Decrease stat stages
  //=============================================================================
  /** statStageAtMin? */
  statStageAtMin(this: Battler, stat: Id): boolean {
    return this.stages[stat]! <= -6;
  },

  /** pbCanLowerStatStage? — Generation 9 Pack: Clear Amulet. (Async: see the file header.) */
  async pbCanLowerStatStage(this: Battler, stat: Id, user: Battler | null = null, move: Move | null = null,
    showFailMsg = false, ignoreContrary = false, ignoreMirrorArmor = false): Promise<boolean> {
    // Generation 9 Pack
    if (this.fainted()) return false;
    if (!user || user.index !== this.index) {
      if (this.itemActive()) {
        if (await ItemEffects.triggerStatLossImmunity(this.item, this, stat, this.battle, showFailMsg)) return false;
      }
    }
    // Essentials
    return canLowerStatStageCore(this, stat, user, move, showFailMsg, ignoreContrary, ignoreMirrorArmor);
  },

  pbLowerStatStageBasic(this: Battler, stat: Id, increment: number, ignoreContrary = false): number {
    if (!this.battle.moldBreaker) {
      // Contrary
      if (this.hasActiveAbility("CONTRARY") && !ignoreContrary) {
        return this.pbRaiseStatStageBasic(stat, increment, true);
      }
      // Simple
      if (this.hasActiveAbility("SIMPLE")) increment *= 2;
    }
    // Change the stat stage
    increment = Math.min(increment, 6 + this.stages[stat]!);
    if (increment > 0) {
      const statName = Stat.get(stat).name;
      const newStage = this.stages[stat]! - increment;
      PBDebug.log(`[Stat change] ${this.pbThis()}'s ${statName}: ${this.stages[stat]} -> ${newStage} (-${increment})`);
      this.stages[stat]! -= increment;
      this.statsLoweredThisRound = true;
      this.statsDropped = true;
    }
    return increment;
  },

  async pbLowerStatStage(this: Battler, stat: Id, increment: number, user: Battler | null, showAnim = true,
    ignoreContrary = false, mirrorArmorSplash = 0, ignoreMirrorArmor = false): Promise<boolean> {
    if (!this.battle.moldBreaker) {
      // Contrary
      if (this.hasActiveAbility("CONTRARY") && !ignoreContrary) {
        return this.pbRaiseStatStage(stat, increment, user, showAnim, true);
      }
      // Mirror Armor
      if (this.hasActiveAbility("MIRRORARMOR") && !ignoreMirrorArmor &&
          user && user.index !== this.index && !this.statStageAtMin(stat)) {
        if (mirrorArmorSplash < 2) {
          await this.battle.pbShowAbilitySplash(this);
          if (!Scene.USE_ABILITY_SPLASH) {
            await this.battle.pbDisplay(_INTL("{1}'s {2} activated!", this.pbThis(), this.abilityName()));
          }
        }
        let ret = false;
        if (await user.pbCanLowerStatStage(stat, this, null, true, ignoreContrary, true)) {
          ret = await user.pbLowerStatStage(stat, increment, this, showAnim, ignoreContrary, mirrorArmorSplash, true);
        }
        if (mirrorArmorSplash % 2 === 0) await this.battle.pbHideAbilitySplash(this); // i.e. not 1 or 3
        return ret;
      }
    }
    // Perform the stat stage change
    increment = this.pbLowerStatStageBasic(stat, increment, ignoreContrary);
    if (increment <= 0) return false;
    // Stat down animation and message
    if (showAnim) await this.battle.pbCommonAnimation("StatDown", this);
    const arrStatTexts = [
      _INTL("{1}'s {2} fell!", this.pbThis(), Stat.get(stat).name),
      _INTL("{1}'s {2} harshly fell!", this.pbThis(), Stat.get(stat).name),
      _INTL("{1}'s {2} severely fell!", this.pbThis(), Stat.get(stat).name),
    ];
    await this.battle.pbDisplay(arrStatTexts[Math.min(increment - 1, 2)]!);
    // Trigger abilities upon stat loss
    if (this.abilityActive()) {
      await AbilityEffects.triggerOnStatLoss(this.ability, this, stat, user as Battler);
    }
    return true;
  },

  async pbLowerStatStageByCause(this: Battler, stat: Id, increment: number, user: Battler, cause: string,
    showAnim = true, ignoreContrary = false, ignoreMirrorArmor = false): Promise<boolean> {
    if (!this.battle.moldBreaker) {
      // Contrary
      if (this.hasActiveAbility("CONTRARY") && !ignoreContrary) {
        return this.pbRaiseStatStageByCause(stat, increment, user, cause, showAnim, true);
      }
      // Mirror Armor
      if (this.hasActiveAbility("MIRRORARMOR") && !ignoreMirrorArmor &&
          user && user.index !== this.index && !this.statStageAtMin(stat)) {
        await this.battle.pbShowAbilitySplash(this);
        if (!Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1}'s {2} activated!", this.pbThis(), this.abilityName()));
        }
        let ret = false;
        if (await user.pbCanLowerStatStage(stat, this, null, true, ignoreContrary, true)) {
          ret = await user.pbLowerStatStageByCause(stat, increment, this, this.abilityName(), showAnim, ignoreContrary, true);
        }
        await this.battle.pbHideAbilitySplash(this);
        return ret;
      }
    }
    // Perform the stat stage change
    increment = this.pbLowerStatStageBasic(stat, increment, ignoreContrary);
    if (increment <= 0) return false;
    // Stat down animation and message
    if (showAnim) await this.battle.pbCommonAnimation("StatDown", this);
    let arrStatTexts: string[];
    if (user.index === this.index) {
      arrStatTexts = [
        _INTL("{1}'s {2} lowered its {3}!", this.pbThis(), cause, Stat.get(stat).name),
        _INTL("{1}'s {2} harshly lowered its {3}!", this.pbThis(), cause, Stat.get(stat).name),
        _INTL("{1}'s {2} severely lowered its {3}!", this.pbThis(), cause, Stat.get(stat).name),
      ];
    } else {
      arrStatTexts = [
        _INTL("{1}'s {2} lowered {3}'s {4}!", user.pbThis(), cause, this.pbThis(true), Stat.get(stat).name),
        _INTL("{1}'s {2} harshly lowered {3}'s {4}!", user.pbThis(), cause, this.pbThis(true), Stat.get(stat).name),
        _INTL("{1}'s {2} severely lowered {3}'s {4}!", user.pbThis(), cause, this.pbThis(true), Stat.get(stat).name),
      ];
    }
    await this.battle.pbDisplay(arrStatTexts[Math.min(increment - 1, 2)]!);
    // Trigger abilities upon stat loss
    if (this.abilityActive()) {
      await AbilityEffects.triggerOnStatLoss(this.ability, this, stat, user);
    }
    return true;
  },

  /**
   * Generation 9 Pack: Guard Dog raises Attack instead of being Intimidated.
   * NOTE: The Gen 9 Pack doesn't pass checkContact on to the original method,
   *       so the contact check never happens (as in Ruby).
   */
  async pbLowerStatStageByAbility(this: Battler, stat: Id, increment: number, user: Battler, splashAnim = true,
    _checkContact = false): Promise<boolean> {
    if (this.hasActiveAbility("GUARDDOG") && user.abilityId === "INTIMIDATE") {
      return this.pbRaiseStatStageByAbility(stat, increment, this, true);
    }
    return lowerStatStageByAbilityCore(this, stat, increment, user, splashAnim, false);
  },

  /** Generation 9 Pack: Clear Amulet blocks Intimidate. */
  async pbLowerAttackStatStageIntimidate(this: Battler, user: Battler): Promise<boolean> {
    // Generation 9 Pack
    if (this.fainted()) return false;
    if (!this.hasActiveAbility("CONTRARY") && this.effects[PBEffects.Substitute] === 0) {
      if (this.itemActive() && await ItemEffects.triggerStatLossImmunity(this.item, this, "ATTACK", this.battle, true)) {
        return false;
      }
    }
    // Essentials
    return lowerAttackStatStageIntimidateCore(this, user);
  },

  //=============================================================================
  // Generation 9 Pack ([002] Battle_Battler.rb:163): Opportunist and Mirror Herb.
  //=============================================================================
  /** General proc for Opportunist and Mirror Herb. */
  async pbMirrorStatUpsOpposing(this: Battler): Promise<void> {
    const statUps = this.battle.sideStatUps[this.idxOwnSide()]!;
    if (this.fainted() || Object.keys(statUps).length === 0) return;
    for (const b of this.battle.allOtherSideBattlers(this.index)) {
      if (!b || b.fainted()) continue;
      if (b.abilityActive()) {
        await AbilityEffects.triggerOnOpposingStatGain(b.ability, b, this.battle, statUps);
      }
      if (b.itemActive()) {
        await b.pbItemOpposingStatGainCheck(statUps);
      }
    }
    for (const key of Object.keys(statUps)) delete statUps[key]; // statUps.clear
  },

  /** Used to tally up the amount of stats raised on each side. */
  addSideStatUps(this: Battler, stat: Id, increment: number): void {
    const statUps = this.battle.sideStatUps[this.idxOwnSide()]!;
    statUps[stat] ??= 0;
    statUps[stat] += increment;
  },

  //=============================================================================
  // Reset stat stages
  //=============================================================================
  /** hasAlteredStatStages? */
  hasAlteredStatStages(this: Battler): boolean {
    for (const s of Stat.eachBattle()) if (this.stages[s.id] !== 0) return true;
    return false;
  },

  /** hasRaisedStatStages? */
  hasRaisedStatStages(this: Battler): boolean {
    for (const s of Stat.eachBattle()) if (this.stages[s.id]! > 0) return true;
    return false;
  },

  /** hasLoweredStatStages? */
  hasLoweredStatStages(this: Battler): boolean {
    for (const s of Stat.eachBattle()) if (this.stages[s.id]! < 0) return true;
    return false;
  },

  pbResetStatStages(this: Battler): void {
    for (const s of Stat.eachBattle()) {
      if (this.stages[s.id]! > 0) {
        this.statsLoweredThisRound = true;
        this.statsDropped = true;
      } else if (this.stages[s.id]! < 0) {
        this.statsRaisedThisRound = true;
      }
      this.stages[s.id] = 0;
    }
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
