// Port of Data/Scripts/011_Battle/002_Battler/004_Battler_Statuses.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:252): pbCanInflictStatus? (Flame Orb/
//   Toxic Orb can't replace an existing status problem; only Rest can).
// - Generation 9 Pack ([001] Battle/[005] Weather and Status.rb): the Drowsy and
//   Frostbite statuses (drowsy?/frostbite? and their pbCan*/pb* helpers),
//   pbHasStatus?, pbCanInflictStatus?, pbCanSynchronizeStatus?, pbInflictStatus,
//   pbCureStatus, pbContinueStatus (redefined).
// - Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:316):
//   pbInflictStatus (midbattle triggers).
// - ZUD Mechanics ([004] Battle_Battler/Battler_Overrides.rb:203): pbFlinch
//   (Dynamax Pokémon can't flinch).
// Alias chains: pbCanInflictStatus? = Gen 9( Hotfixes ) (the Hotfixes version
//   replaces core's); pbInflictStatus = Deluxe( Gen 9( core ) );
//   pbHasStatus?/pbCanSynchronizeStatus?/pbCureStatus = Gen 9( core );
//   pbFlinch = ZUD( core ).
//
// Sync/async variants: the "can it be inflicted?" checks (pbCanInflictStatus,
// pbCanSleep, pbCanPoison, pbCanBurn, pbCanParalyze, pbCanFreeze, pbCanDrowse,
// pbCanFrostbite, pbCanConfuse, pbCanConfuseSelf, pbCanAttract) have a sync
// version that never shows messages (same parameters as Ruby; showMessages is
// ignored) and an `...Async` version that shows them when showMessages is
// true. Use the Async version whenever Ruby passes showMessages = true (or a
// variable). Every message in these checks is shown just before returning, so
// the checks run synchronously and the Async version then plays the queued
// messages in order.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Status } from "../../data/gameData/status";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";

/** Messages/ability splashes a check wants to show, in order (null = don't show). */
type DisplayQueue = (() => Promise<void>)[] | null;

async function playQueue(q: (() => Promise<void>)[]): Promise<void> {
  for (const f of q) await f();
}

/** Ruby's nil_or_empty?(msg) */
function nilOrEmpty(msg: string | null | undefined): boolean {
  return msg == null || msg === "";
}

/** Pushes battle.pbDisplay(msg) onto the queue. */
function say(q: DisplayQueue, b: Battler, msg: string): void {
  q?.push(() => b.battle.pbDisplay(msg));
}

/**
 * v20.1 Hotfixes' pbCanInflictStatus? (Battle bug fixes.rb:252), which
 * replaces core Essentials' version.
 */
function canInflictStatusHotfix(b: Battler, newStatus: Id, user: Battler | null, showMessages: boolean,
  move: Move | null, ignoreStatus: boolean, q: DisplayQueue): boolean {
  if (b.fainted()) return false;
  const selfInflicted = !!(user && user.index === b.index); // Rest and Flame Orb/Toxic Orb only
  // Already have that status problem
  if (b.status === newStatus && !ignoreStatus) {
    if (showMessages) {
      let msg = "";
      switch (b.status) {
        case "SLEEP": msg = _INTL("{1} is already asleep!", b.pbThis()); break;
        case "POISON": msg = _INTL("{1} is already poisoned!", b.pbThis()); break;
        case "BURN": msg = _INTL("{1} already has a burn!", b.pbThis()); break;
        case "PARALYSIS": msg = _INTL("{1} is already paralyzed!", b.pbThis()); break;
        case "FROZEN": msg = _INTL("{1} is already frozen solid!", b.pbThis()); break;
      }
      say(q, b, msg);
    }
    return false;
  }
  // Trying to replace a status problem with another one
  if (b.status !== "NONE" && !ignoreStatus && !(selfInflicted && move)) { // Rest can replace a status problem
    if (showMessages) say(q, b, _INTL("It doesn't affect {1}...", b.pbThis(true)));
    return false;
  }
  // Trying to inflict a status problem on a Pokémon behind a substitute
  if (b.effects[PBEffects.Substitute] > 0 && !(move && move.ignoresSubstitute(user)) && !selfInflicted) {
    if (showMessages) say(q, b, _INTL("It doesn't affect {1}...", b.pbThis(true)));
    return false;
  }
  // Weather immunity
  if (newStatus === "FROZEN" && ["Sun", "HarshSun"].includes(b.effectiveWeather())) {
    if (showMessages) say(q, b, _INTL("It doesn't affect {1}...", b.pbThis(true)));
    return false;
  }
  // Terrains immunity
  if (b.affectedByTerrain()) {
    switch (b.battle.field.terrain) {
      case "Electric":
        if (newStatus === "SLEEP") {
          if (showMessages) say(q, b, _INTL("{1} surrounds itself with electrified terrain!", b.pbThis(true)));
          return false;
        }
        break;
      case "Misty":
        if (showMessages) say(q, b, _INTL("{1} surrounds itself with misty terrain!", b.pbThis(true)));
        return false;
    }
  }
  // Uproar immunity
  if (newStatus === "SLEEP" && !(b.hasActiveAbility("SOUNDPROOF") && !b.battle.moldBreaker)) {
    for (const ob of b.battle.allBattlers()) {
      if (ob.effects[PBEffects.Uproar] === 0) continue;
      if (showMessages) say(q, b, _INTL("But the uproar kept {1} awake!", b.pbThis(true)));
      return false;
    }
  }
  // Type immunities
  let hasImmuneType = false;
  switch (newStatus) {
    case "SLEEP":
      // No type is immune to sleep
      break;
    case "POISON":
      if (!(user && user.hasActiveAbility("CORROSION"))) {
        hasImmuneType ||= b.pbHasType("POISON");
        hasImmuneType ||= b.pbHasType("STEEL");
      }
      break;
    case "BURN":
      hasImmuneType ||= b.pbHasType("FIRE");
      break;
    case "PARALYSIS":
      hasImmuneType ||= b.pbHasType("ELECTRIC") && Settings.MORE_TYPE_EFFECTS;
      break;
    case "FROZEN":
      hasImmuneType ||= b.pbHasType("ICE");
      break;
  }
  if (hasImmuneType) {
    if (showMessages) say(q, b, _INTL("It doesn't affect {1}...", b.pbThis(true)));
    return false;
  }
  // Ability immunity
  let immuneByAbility = false;
  let immAlly: Battler | null = null;
  if (AbilityEffects.triggerStatusImmunityNonIgnorable(b.ability, b, newStatus)) {
    immuneByAbility = true;
  } else if (selfInflicted || !b.battle.moldBreaker) {
    if (b.abilityActive() && AbilityEffects.triggerStatusImmunity(b.ability, b, newStatus)) {
      immuneByAbility = true;
    } else {
      for (const ally of b.allAllies()) {
        if (!ally.abilityActive()) continue;
        if (!AbilityEffects.triggerStatusImmunityFromAlly(ally.ability, b, newStatus)) continue;
        immuneByAbility = true;
        immAlly = ally;
        break;
      }
    }
  }
  if (immuneByAbility) {
    if (showMessages) {
      const splashBattler = immAlly ?? b;
      q?.push(() => b.battle.pbShowAbilitySplash(splashBattler));
      let msg = "";
      if (Scene.USE_ABILITY_SPLASH) {
        switch (newStatus) {
          case "SLEEP": msg = _INTL("{1} stays awake!", b.pbThis()); break;
          case "POISON": msg = _INTL("{1} cannot be poisoned!", b.pbThis()); break;
          case "BURN": msg = _INTL("{1} cannot be burned!", b.pbThis()); break;
          case "PARALYSIS": msg = _INTL("{1} cannot be paralyzed!", b.pbThis()); break;
          case "FROZEN": msg = _INTL("{1} cannot be frozen solid!", b.pbThis()); break;
        }
      } else if (immAlly) {
        switch (newStatus) {
          case "SLEEP":
            msg = _INTL("{1} stays awake because of {2}'s {3}!",
              b.pbThis(), immAlly.pbThis(true), immAlly.abilityName());
            break;
          case "POISON":
            msg = _INTL("{1} cannot be poisoned because of {2}'s {3}!",
              b.pbThis(), immAlly.pbThis(true), immAlly.abilityName());
            break;
          case "BURN":
            msg = _INTL("{1} cannot be burned because of {2}'s {3}!",
              b.pbThis(), immAlly.pbThis(true), immAlly.abilityName());
            break;
          case "PARALYSIS":
            msg = _INTL("{1} cannot be paralyzed because of {2}'s {3}!",
              b.pbThis(), immAlly.pbThis(true), immAlly.abilityName());
            break;
          case "FROZEN":
            msg = _INTL("{1} cannot be frozen solid because of {2}'s {3}!",
              b.pbThis(), immAlly.pbThis(true), immAlly.abilityName());
            break;
        }
      } else {
        switch (newStatus) {
          case "SLEEP": msg = _INTL("{1} stays awake because of its {2}!", b.pbThis(), b.abilityName()); break;
          case "POISON": msg = _INTL("{1}'s {2} prevents poisoning!", b.pbThis(), b.abilityName()); break;
          case "BURN": msg = _INTL("{1}'s {2} prevents burns!", b.pbThis(), b.abilityName()); break;
          case "PARALYSIS": msg = _INTL("{1}'s {2} prevents paralysis!", b.pbThis(), b.abilityName()); break;
          case "FROZEN": msg = _INTL("{1}'s {2} prevents freezing!", b.pbThis(), b.abilityName()); break;
        }
      }
      say(q, b, msg);
      q?.push(() => b.battle.pbHideAbilitySplash(splashBattler));
    }
    return false;
  }
  // Safeguard immunity
  if (b.pbOwnSide().effects[PBEffects.Safeguard] > 0 && !selfInflicted && move &&
      !(user && user.hasActiveAbility("INFILTRATOR"))) {
    if (showMessages) say(q, b, _INTL("{1}'s team is protected by Safeguard!", b.pbThis()));
    return false;
  }
  return true;
}

/**
 * Generation 9 Pack's pbCanInflictStatus? (wraps the Hotfixes version): checks
 * Drowsy/Frostbite immunities. Effects that make a battler immune to Sleep also
 * make them immune to Drowsy; effects that make a battler immune to Freeze also
 * make them immune to Frostbite.
 */
function canInflictStatusGen9(b: Battler, newStatus: Id, user: Battler | null, showMessages: boolean,
  move: Move | null, ignoreStatus: boolean, q: DisplayQueue): boolean {
  const originalStatus = newStatus;
  switch (newStatus) {
    case "SLEEP": if (Settings.SLEEP_EFFECTS_CAUSE_DROWSY) newStatus = "DROWSY"; break;
    case "FROZEN": if (Settings.FREEZE_EFFECTS_CAUSE_FROSTBITE) newStatus = "FROSTBITE"; break;
  }
  if (!["DROWSY", "FROSTBITE"].includes(newStatus)) {
    return canInflictStatusHotfix(b, originalStatus, user, showMessages, move, ignoreStatus, q);
  }
  const selfInflicted = !!(user && user.index === b.index);
  //-------------------------------------------------------------------------
  // General immunities.
  //-------------------------------------------------------------------------
  if (b.status === newStatus && !ignoreStatus) {
    if (showMessages) {
      if (newStatus === "DROWSY") say(q, b, _INTL("{1} is already drowsy!", b.pbThis()));
      if (newStatus === "FROSTBITE") say(q, b, _INTL("{1} is already frostbitten!", b.pbThis()));
    }
    return false;
  }
  if ((b.status !== "NONE" && !ignoreStatus && !selfInflicted) ||
      (b.effects[PBEffects.Substitute] > 0 && !(move && move.ignoresSubstitute(user)) && !selfInflicted)) {
    if (showMessages) say(q, b, _INTL("It doesn't affect {1}...", b.pbThis(true)));
    return false;
  }
  switch (newStatus) {
    //-------------------------------------------------------------------------
    // Drowzy immunities.
    //-------------------------------------------------------------------------
    case "DROWSY":
      if (b.affectedByTerrain() && b.battle.field.terrain === "Electric") {
        if (showMessages) say(q, b, _INTL("{1} surrounds itself with electrified terrain!", b.pbThis(true)));
        return false;
      }
      if (!(b.hasActiveAbility("SOUNDPROOF") && !b.battle.moldBreaker)) {
        for (const ob of b.battle.allBattlers()) {
          if (ob.effects[PBEffects.Uproar] === 0) continue;
          if (showMessages) say(q, b, _INTL("But the uproar kept {1} alert!", b.pbThis(true)));
          return false;
        }
      }
      break;
    //-------------------------------------------------------------------------
    // Frostbite immunities.
    //-------------------------------------------------------------------------
    case "FROSTBITE":
      if (b.pbHasType("ICE") || ["Sun", "HarshSun"].includes(b.effectiveWeather())) {
        if (showMessages) say(q, b, _INTL("It doesn't affect {1}...", b.pbThis(true)));
        return false;
      }
      break;
  }
  //-------------------------------------------------------------------------
  // Ability immunities.
  // Abilities that block Sleep also block Drowsiness.
  // Abilities that block Freeze also block Frostbites.
  //-------------------------------------------------------------------------
  let immuneByAbility = false;
  let immAlly: Battler | null = null;
  if (AbilityEffects.triggerStatusImmunityNonIgnorable(b.ability, b, originalStatus)) {
    immuneByAbility = true;
  } else if (selfInflicted || !b.battle.moldBreaker) {
    if (b.abilityActive() && AbilityEffects.triggerStatusImmunity(b.ability, b, originalStatus)) {
      immuneByAbility = true;
    } else {
      for (const ally of b.allAllies()) {
        if (!ally.abilityActive()) continue;
        if (!AbilityEffects.triggerStatusImmunityFromAlly(ally.ability, b, originalStatus)) continue;
        immuneByAbility = true;
        immAlly = ally;
        break;
      }
    }
  }
  if (immuneByAbility) {
    if (showMessages) {
      const splashBattler = immAlly ?? b;
      q?.push(() => b.battle.pbShowAbilitySplash(splashBattler));
      let msg = "";
      if (Scene.USE_ABILITY_SPLASH) {
        switch (originalStatus) {
          case "SLEEP": msg = _INTL("{1} stays alert!", b.pbThis()); break;
          case "FROZEN": msg = _INTL("{1} cannot be frostbitten!", b.pbThis()); break;
        }
      } else if (immAlly) {
        switch (originalStatus) {
          case "SLEEP": msg = _INTL("{1} stays alert because of {2}'s {3}!", b.pbThis(), immAlly.pbThis(true), immAlly.abilityName()); break;
          case "FROZEN": msg = _INTL("{1} cannot be frostbitten because of {2}'s {3}!", b.pbThis(), immAlly.pbThis(true), immAlly.abilityName()); break;
        }
      } else {
        switch (originalStatus) {
          case "SLEEP": msg = _INTL("{1}'s {2} prevents drowsiness!", b.pbThis(), b.abilityName()); break;
          case "FROZEN": msg = _INTL("{1}'s {2} prevents frostbites!", b.pbThis(), b.abilityName()); break;
        }
      }
      say(q, b, msg);
      q?.push(() => b.battle.pbHideAbilitySplash(splashBattler));
    }
    return false;
  }
  //-------------------------------------------------------------------------
  // Safeguard immunity.
  //-------------------------------------------------------------------------
  if (b.pbOwnSide().effects[PBEffects.Safeguard] > 0 && !selfInflicted && move &&
      !(user && user.hasActiveAbility("INFILTRATOR"))) {
    if (showMessages) say(q, b, _INTL("{1}'s team is protected by Safeguard!", b.pbThis()));
    return false;
  }
  return true;
}

/** pbCanConfuse? (core). */
function canConfuseCore(b: Battler, user: Battler | null, showMessages: boolean, move: Move | null,
  selfInflicted: boolean, q: DisplayQueue): boolean {
  if (b.fainted()) return false;
  if (b.effects[PBEffects.Confusion] > 0) {
    if (showMessages) say(q, b, _INTL("{1} is already confused.", b.pbThis()));
    return false;
  }
  if (b.effects[PBEffects.Substitute] > 0 && !(move && move.ignoresSubstitute(user)) && !selfInflicted) {
    if (showMessages) say(q, b, _INTL("But it failed!"));
    return false;
  }
  // Terrains immunity
  if (b.affectedByTerrain() && b.battle.field.terrain === "Misty" && Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7) {
    if (showMessages) say(q, b, _INTL("{1} surrounds itself with misty terrain!", b.pbThis(true)));
    return false;
  }
  if ((selfInflicted || !b.battle.moldBreaker) && b.hasActiveAbility("OWNTEMPO")) {
    if (showMessages) {
      q?.push(() => b.battle.pbShowAbilitySplash(b));
      if (Scene.USE_ABILITY_SPLASH) {
        say(q, b, _INTL("{1} doesn't become confused!", b.pbThis()));
      } else {
        say(q, b, _INTL("{1}'s {2} prevents confusion!", b.pbThis(), b.abilityName()));
      }
      q?.push(() => b.battle.pbHideAbilitySplash(b));
    }
    return false;
  }
  if (b.pbOwnSide().effects[PBEffects.Safeguard] > 0 && !selfInflicted &&
      !(user && user.hasActiveAbility("INFILTRATOR"))) {
    if (showMessages) say(q, b, _INTL("{1}'s team is protected by Safeguard!", b.pbThis()));
    return false;
  }
  return true;
}

/**
 * pbCanAttract? (core).
 * NOTE: When an ally's Aroma Veil blocks it, Ruby shows the message and then
 *       returns true (so the attraction still happens). Preserved.
 */
function canAttractCore(b: Battler, user: Battler | null, showMessages: boolean, q: DisplayQueue): boolean {
  if (b.fainted()) return false;
  if (!user || user.fainted()) return false;
  if (b.effects[PBEffects.Attract] >= 0) {
    if (showMessages) say(q, b, _INTL("{1} is unaffected!", b.pbThis()));
    return false;
  }
  const agender = user.gender();
  const ogender = b.gender();
  if (agender === 2 || ogender === 2 || agender === ogender) {
    if (showMessages) say(q, b, _INTL("{1} is unaffected!", b.pbThis()));
    return false;
  }
  if (!b.battle.moldBreaker) {
    if (b.hasActiveAbility(["AROMAVEIL", "OBLIVIOUS"])) {
      if (showMessages) {
        q?.push(() => b.battle.pbShowAbilitySplash(b));
        if (Scene.USE_ABILITY_SPLASH) {
          say(q, b, _INTL("{1} is unaffected!", b.pbThis()));
        } else {
          say(q, b, _INTL("{1}'s {2} prevents romance!", b.pbThis(), b.abilityName()));
        }
        q?.push(() => b.battle.pbHideAbilitySplash(b));
      }
      return false;
    } else {
      for (const ally of b.allAllies()) {
        if (!ally.hasActiveAbility("AROMAVEIL")) continue;
        if (showMessages) {
          q?.push(() => b.battle.pbShowAbilitySplash(b));
          if (Scene.USE_ABILITY_SPLASH) {
            say(q, b, _INTL("{1} is unaffected!", b.pbThis()));
          } else {
            say(q, b, _INTL("{1}'s {2} prevents romance!", ally.pbThis(), ally.abilityName()));
          }
          q?.push(() => b.battle.pbHideAbilitySplash(b));
        }
        return true;
      }
    }
  }
  return true;
}

/** Core Essentials' pbInflictStatus. */
async function inflictStatusCore(b: Battler, newStatus: Id, newStatusCount: number, msg: string | null,
  user: Battler | null): Promise<void> {
  // Inflict the new status
  b.status = newStatus;
  b.statusCount = newStatusCount;
  b.effects[PBEffects.Toxic] = 0;
  // Show animation
  if (newStatus === "POISON" && newStatusCount > 0) {
    await b.battle.pbCommonAnimation("Toxic", b);
  } else {
    const animName = Status.get(newStatus).animation;
    if (animName) await b.battle.pbCommonAnimation(animName, b);
  }
  // Show message
  if (msg && msg !== "") {
    await b.battle.pbDisplay(msg);
  } else {
    switch (newStatus) {
      case "SLEEP":
        await b.battle.pbDisplay(_INTL("{1} fell asleep!", b.pbThis()));
        break;
      case "POISON":
        if (newStatusCount > 0) {
          await b.battle.pbDisplay(_INTL("{1} was badly poisoned!", b.pbThis()));
        } else {
          await b.battle.pbDisplay(_INTL("{1} was poisoned!", b.pbThis()));
        }
        break;
      case "BURN":
        await b.battle.pbDisplay(_INTL("{1} was burned!", b.pbThis()));
        break;
      case "PARALYSIS":
        await b.battle.pbDisplay(_INTL("{1} is paralyzed! It may be unable to move!", b.pbThis()));
        break;
      case "FROZEN":
        await b.battle.pbDisplay(_INTL("{1} was frozen solid!", b.pbThis()));
        break;
    }
  }
  if (newStatus === "SLEEP") PBDebug.log(`[Status change] ${b.pbThis()}'s sleep count is ${newStatusCount}`);
  // Form change check
  await b.pbCheckFormOnStatusChange();
  // Synchronize
  if (b.abilityActive()) {
    await AbilityEffects.triggerOnStatusInflicted(b.ability, b, user as Battler, newStatus);
  }
  // Status cures
  await b.pbItemStatusCureCheck();
  await b.pbAbilityStatusCureCheck();
  // Petal Dance/Outrage/Thrash get cancelled immediately by falling asleep
  // NOTE: I don't know why this applies only to Outrage and only to falling
  //       asleep (i.e. it doesn't cancel Rollout/Uproar/other multi-turn
  //       moves, and it doesn't cancel any moves if self becomes frozen/
  //       disabled/anything else). This behaviour was tested in Gen 5.
  if (b._status === "SLEEP" && b.effects[PBEffects.Outrage] > 0) {
    b.effects[PBEffects.Outrage] = 0;
    b.currentMove = null;
  }
}

/** Generation 9 Pack's pbInflictStatus (wraps core): inflicts Drowsy/Frostbite. */
async function inflictStatusGen9(b: Battler, newStatus: Id, newStatusCount: number, msg: string | null,
  user: Battler | null): Promise<void> {
  switch (newStatus) {
    case "SLEEP": if (Settings.SLEEP_EFFECTS_CAUSE_DROWSY) newStatus = "DROWSY"; break;
    case "FROZEN": if (Settings.FREEZE_EFFECTS_CAUSE_FROSTBITE) newStatus = "FROSTBITE"; break;
  }
  if (!["DROWSY", "FROSTBITE"].includes(newStatus)) {
    await inflictStatusCore(b, newStatus, newStatusCount, msg, user);
    return;
  }
  b.status = newStatus;
  b.statusCount = newStatusCount;
  b.effects[PBEffects.Toxic] = 0;
  const animName = Status.get(newStatus).animation;
  if (animName) await b.battle.pbCommonAnimation(animName, b);
  if (msg && msg !== "") {
    await b.battle.pbDisplay(msg);
  } else {
    switch (newStatus) {
      case "DROWSY": await b.battle.pbDisplay(_INTL("{1} grew drowsy!\nIt may be too sleepy to move!", b.pbThis())); break;
      case "FROSTBITE": await b.battle.pbDisplay(_INTL("{1} was frostbitten!", b.pbThis())); break;
    }
  }
  if (newStatus === "DROWSY") PBDebug.log(`[Status change] ${b.pbThis()}'s drowsy count is ${newStatusCount}`);
  await b.pbCheckFormOnStatusChange();
  if (b.abilityActive()) {
    await AbilityEffects.triggerOnStatusInflicted(b.ability, b, user as Battler, newStatus);
  }
  await b.pbItemStatusCureCheck();
  await b.pbAbilityStatusCureCheck();
}

/** Core Essentials' pbCanSynchronizeStatus?. */
function canSynchronizeStatusCore(b: Battler, newStatus: Id, target: Battler | null): boolean {
  if (b.fainted()) return false;
  // Trying to replace a status problem with another one
  if (b.status !== "NONE") return false;
  // Terrain immunity
  if (b.battle.field.terrain === "Misty" && b.affectedByTerrain()) return false;
  // Type immunities
  let hasImmuneType = false;
  switch (newStatus) {
    case "POISON":
      // NOTE: target will have Synchronize, so it can't have Corrosion.
      if (!(target && target.hasActiveAbility("CORROSION"))) {
        hasImmuneType ||= b.pbHasType("POISON");
        hasImmuneType ||= b.pbHasType("STEEL");
      }
      break;
    case "BURN":
      hasImmuneType ||= b.pbHasType("FIRE");
      break;
    case "PARALYSIS":
      hasImmuneType ||= b.pbHasType("ELECTRIC") && Settings.MORE_TYPE_EFFECTS;
      break;
  }
  if (hasImmuneType) return false;
  // Ability immunity
  if (AbilityEffects.triggerStatusImmunityNonIgnorable(b.ability, b, newStatus)) return false;
  if (b.abilityActive() && AbilityEffects.triggerStatusImmunity(b.ability, b, newStatus)) return false;
  for (const ally of b.allAllies()) {
    if (!ally.abilityActive()) continue;
    if (!AbilityEffects.triggerStatusImmunityFromAlly(ally.ability, b, newStatus)) continue;
    return false;
  }
  // Safeguard immunity
  // NOTE: Ruby reads `user` here, which isn't defined in this method (a
  //       NameError if Safeguard is up). Treated as nil: Safeguard blocks it.
  const user: Battler | null = null;
  if (b.pbOwnSide().effects[PBEffects.Safeguard] > 0 &&
      !(user && (user as Battler).hasActiveAbility("INFILTRATOR"))) {
    return false;
  }
  return true;
}

const methods = {
  //=============================================================================
  // Generalised checks for whether a status problem can be inflicted
  //=============================================================================
  /**
   * NOTE: Not all "does it have this status?" checks use this method. If the
   *       check is leading up to curing self of that status condition, then it
   *       will look at the value of @status directly instead - if it is that
   *       status condition then it is curable. This method only checks for
   *       "counts as having that status", which includes Comatose which can't be
   *       cured.
   * Generation 9 Pack: Drowsy counts as asleep and Frostbite as frozen.
   */
  pbHasStatus(this: Battler, checkStatus: Id): boolean {
    let ret: boolean;
    if (AbilityEffects.triggerStatusCheckNonIgnorable(this.ability, this, checkStatus)) {
      ret = true;
    } else {
      ret = this._status === checkStatus;
    }
    // Generation 9 Pack
    if (ret) return ret;
    switch (checkStatus) {
      case "SLEEP":
        if (this._status === "DROWSY" && Settings.SLEEP_EFFECTS_CAUSE_DROWSY) return true;
        break;
      case "FROZEN":
        if (this._status === "FROSTBITE" && Settings.FREEZE_EFFECTS_CAUSE_FROSTBITE) return true;
        break;
    }
    return ret;
  },

  /** pbHasAnyStatus? */
  pbHasAnyStatus(this: Battler): boolean {
    if (AbilityEffects.triggerStatusCheckNonIgnorable(this.ability, this, null as unknown as Id)) {
      return true;
    }
    return this._status !== "NONE";
  },

  /** pbCanInflictStatus? without messages (see the file header). */
  pbCanInflictStatus(this: Battler, newStatus: Id, user: Battler | null, _showMessages: boolean,
    move: Move | null = null, ignoreStatus = false): boolean {
    return canInflictStatusGen9(this, newStatus, user, false, move, ignoreStatus, null);
  },

  /** pbCanInflictStatus?, showing messages when showMessages. */
  async pbCanInflictStatusAsync(this: Battler, newStatus: Id, user: Battler | null, showMessages: boolean,
    move: Move | null = null, ignoreStatus = false): Promise<boolean> {
    const q: (() => Promise<void>)[] = [];
    const ret = canInflictStatusGen9(this, newStatus, user, showMessages, move, ignoreStatus, q);
    await playQueue(q);
    return ret;
  },

  /**
   * pbCanSynchronizeStatus? — Generation 9 Pack: also passes Drowsy/Frostbite
   * through the Sleep/Freeze immunities.
   */
  pbCanSynchronizeStatus(this: Battler, newStatus: Id, target: Battler | null): boolean {
    const ret = canSynchronizeStatusCore(this, newStatus, target);
    // Generation 9 Pack
    if (!ret) return false;
    if (newStatus === "FROSTBITE" && this.pbHasType("ICE")) return false;
    switch (newStatus) {
      case "DROWSY": newStatus = "SLEEP"; break;
      case "FROSTBITE": newStatus = "FROZEN"; break;
    }
    if (AbilityEffects.triggerStatusImmunityNonIgnorable(this.ability, this, newStatus)) return false;
    if (this.abilityActive() && AbilityEffects.triggerStatusImmunity(this.ability, this, newStatus)) return false;
    for (const b of this.allAllies()) {
      if (!b.abilityActive()) continue;
      if (!AbilityEffects.triggerStatusImmunityFromAlly(b.ability, this, newStatus)) continue;
      return false;
    }
    return true;
  },

  //=============================================================================
  // Generalised infliction of status problem
  //=============================================================================
  /** pbInflictStatus — Essentials Deluxe( Generation 9 Pack( core ) ). */
  async pbInflictStatus(this: Battler, newStatus: Id, newStatusCount = 0, msg: string | null = null,
    user: Battler | null = null): Promise<void> {
    // Essentials Deluxe
    const oldStatus = this.status;
    await inflictStatusGen9(this, newStatus, newStatusCount, msg, user);
    // Essentials Deluxe: midbattle triggers for when a status condition is inflicted.
    if (!["NONE", oldStatus].includes(this.status)) {
      const triggers = ["statusInflicted", "statusInflicted" + this.status, "statusInflicted" + this.species];
      await this.battle.scene.pbDeluxeTriggers?.(this, null, triggers);
    }
  },

  //=============================================================================
  // Sleep
  //=============================================================================
  /** asleep? */
  asleep(this: Battler): boolean {
    return this.pbHasStatus("SLEEP");
  },

  /** pbCanSleep? without messages. */
  pbCanSleep(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null,
    ignoreStatus = false): boolean {
    return this.pbCanInflictStatus("SLEEP", user, showMessages, move, ignoreStatus);
  },

  /** pbCanSleep? with messages. */
  async pbCanSleepAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null,
    ignoreStatus = false): Promise<boolean> {
    return this.pbCanInflictStatusAsync("SLEEP", user, showMessages, move, ignoreStatus);
  },

  /** pbCanSleepYawn? */
  pbCanSleepYawn(this: Battler): boolean {
    if (this.status !== "NONE") return false;
    if (this.affectedByTerrain() && ["Electric", "Misty"].includes(this.battle.field.terrain)) {
      return false;
    }
    if (!this.hasActiveAbility("SOUNDPROOF") && this.battle.allBattlers().some((b) => b.effects[PBEffects.Uproar] > 0)) {
      return false;
    }
    if (AbilityEffects.triggerStatusImmunityNonIgnorable(this.ability, this, "SLEEP")) {
      return false;
    }
    // NOTE: Bulbapedia claims that Flower Veil shouldn't prevent sleep due to
    //       drowsiness, but I disagree because that makes no sense. Also, the
    //       comparable Sweet Veil does prevent sleep due to drowsiness.
    if (this.abilityActive() && AbilityEffects.triggerStatusImmunity(this.ability, this, "SLEEP")) {
      return false;
    }
    for (const b of this.allAllies()) {
      if (!b.abilityActive()) continue;
      if (!AbilityEffects.triggerStatusImmunityFromAlly(b.ability, this, "SLEEP")) continue;
      return false;
    }
    // NOTE: Bulbapedia claims that Safeguard shouldn't prevent sleep due to
    //       drowsiness. I disagree with this too. Compare with the other sided
    //       effects Misty/Electric Terrain, which do prevent it.
    if (this.pbOwnSide().effects[PBEffects.Safeguard] > 0) return false;
    return true;
  },

  async pbSleep(this: Battler, msg: string | null = null): Promise<void> {
    await this.pbInflictStatus("SLEEP", this.pbSleepDuration(), msg);
  },

  async pbSleepSelf(this: Battler, msg: string | null = null, duration = -1): Promise<void> {
    await this.pbInflictStatus("SLEEP", this.pbSleepDuration(duration), msg);
  },

  pbSleepDuration(this: Battler, duration = -1): number {
    if (duration <= 0) duration = 2 + this.battle.pbRandom(3);
    if (this.hasActiveAbility("EARLYBIRD")) duration = Math.floor(duration / 2);
    return duration;
  },

  //=============================================================================
  // Generation 9 Pack ([005] Weather and Status.rb:152): Drowsy utilities.
  //=============================================================================
  /** drowsy? */
  drowsy(this: Battler): boolean {
    return this.pbHasStatus("DROWSY");
  },

  /** pbCanDrowse? without messages. */
  pbCanDrowse(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null,
    ignoreStatus = false): boolean {
    return this.pbCanInflictStatus("DROWSY", user, showMessages, move, ignoreStatus);
  },

  /** pbCanDrowse? with messages. */
  async pbCanDrowseAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null,
    ignoreStatus = false): Promise<boolean> {
    return this.pbCanInflictStatusAsync("DROWSY", user, showMessages, move, ignoreStatus);
  },

  /** pbCanDrowseSynchronize? */
  pbCanDrowseSynchronize(this: Battler, target: Battler | null): boolean {
    return this.pbCanSynchronizeStatus("DROWSY", target);
  },

  async pbDrowse(this: Battler, user: Battler | null = null, msg: string | null = null): Promise<void> {
    await this.pbInflictStatus("DROWSY", this.pbSleepDuration() + 1, msg, user);
  },

  async pbDrowseSelf(this: Battler, msg: string | null = null, duration = -1): Promise<void> {
    await this.pbInflictStatus("DROWSY", this.pbSleepDuration(duration) + 1, msg);
  },

  //=============================================================================
  // Poison
  //=============================================================================
  /** poisoned? */
  poisoned(this: Battler): boolean {
    return this.pbHasStatus("POISON");
  },

  /** pbCanPoison? without messages. */
  pbCanPoison(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): boolean {
    return this.pbCanInflictStatus("POISON", user, showMessages, move);
  },

  /** pbCanPoison? with messages. */
  async pbCanPoisonAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): Promise<boolean> {
    return this.pbCanInflictStatusAsync("POISON", user, showMessages, move);
  },

  /** pbCanPoisonSynchronize? */
  pbCanPoisonSynchronize(this: Battler, target: Battler | null): boolean {
    return this.pbCanSynchronizeStatus("POISON", target);
  },

  async pbPoison(this: Battler, user: Battler | null = null, msg: string | null = null, toxic = false): Promise<void> {
    await this.pbInflictStatus("POISON", toxic ? 1 : 0, msg, user);
  },

  //=============================================================================
  // Burn
  //=============================================================================
  /** burned? */
  burned(this: Battler): boolean {
    return this.pbHasStatus("BURN");
  },

  /** pbCanBurn? without messages. */
  pbCanBurn(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): boolean {
    return this.pbCanInflictStatus("BURN", user, showMessages, move);
  },

  /** pbCanBurn? with messages. */
  async pbCanBurnAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): Promise<boolean> {
    return this.pbCanInflictStatusAsync("BURN", user, showMessages, move);
  },

  /** pbCanBurnSynchronize? */
  pbCanBurnSynchronize(this: Battler, target: Battler | null): boolean {
    return this.pbCanSynchronizeStatus("BURN", target);
  },

  async pbBurn(this: Battler, user: Battler | null = null, msg: string | null = null): Promise<void> {
    await this.pbInflictStatus("BURN", 0, msg, user);
  },

  //=============================================================================
  // Paralyze
  //=============================================================================
  /** paralyzed? */
  paralyzed(this: Battler): boolean {
    return this.pbHasStatus("PARALYSIS");
  },

  /** pbCanParalyze? without messages. */
  pbCanParalyze(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): boolean {
    return this.pbCanInflictStatus("PARALYSIS", user, showMessages, move);
  },

  /** pbCanParalyze? with messages. */
  async pbCanParalyzeAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): Promise<boolean> {
    return this.pbCanInflictStatusAsync("PARALYSIS", user, showMessages, move);
  },

  /** pbCanParalyzeSynchronize? */
  pbCanParalyzeSynchronize(this: Battler, target: Battler | null): boolean {
    return this.pbCanSynchronizeStatus("PARALYSIS", target);
  },

  async pbParalyze(this: Battler, user: Battler | null = null, msg: string | null = null): Promise<void> {
    await this.pbInflictStatus("PARALYSIS", 0, msg, user);
  },

  //=============================================================================
  // Freeze
  //=============================================================================
  /** frozen? */
  frozen(this: Battler): boolean {
    return this.pbHasStatus("FROZEN");
  },

  /** pbCanFreeze? without messages. */
  pbCanFreeze(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): boolean {
    return this.pbCanInflictStatus("FROZEN", user, showMessages, move);
  },

  /** pbCanFreeze? with messages. */
  async pbCanFreezeAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): Promise<boolean> {
    return this.pbCanInflictStatusAsync("FROZEN", user, showMessages, move);
  },

  async pbFreeze(this: Battler, msg: string | null = null): Promise<void> {
    await this.pbInflictStatus("FROZEN", 0, msg);
  },

  //=============================================================================
  // Generation 9 Pack ([005] Weather and Status.rb:175): Frostbite utilities.
  //=============================================================================
  /** frostbite? */
  frostbite(this: Battler): boolean {
    return this.pbHasStatus("FROSTBITE");
  },

  /** pbCanFrostbite? without messages. */
  pbCanFrostbite(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): boolean {
    return this.pbCanInflictStatus("FROSTBITE", user, showMessages, move);
  },

  /** pbCanFrostbite? with messages. */
  async pbCanFrostbiteAsync(this: Battler, user: Battler | null, showMessages: boolean, move: Move | null = null): Promise<boolean> {
    return this.pbCanInflictStatusAsync("FROSTBITE", user, showMessages, move);
  },

  /** pbCanFrostbiteSynchronize? */
  pbCanFrostbiteSynchronize(this: Battler, target: Battler | null): boolean {
    return this.pbCanSynchronizeStatus("FROSTBITE", target);
  },

  async pbFrostbite(this: Battler, user: Battler | null = null, msg: string | null = null): Promise<void> {
    await this.pbInflictStatus("FROSTBITE", 0, msg, user);
  },

  //=============================================================================
  // Generalised status displays
  //=============================================================================
  /**
   * Generation 9 Pack (Weather and Status.rb:402, redefined): Drowsy/Frostbite
   * messages. onAnimated is Ruby's block (`yield if block_given?`), run after
   * the animation and before the message.
   */
  async pbContinueStatus(this: Battler, onAnimated?: () => unknown): Promise<void> {
    if (this.status === "POISON" && this._statusCount > 0) {
      await this.battle.pbCommonAnimation("Toxic", this);
    } else {
      const animName = Status.get(this.status).animation;
      if (animName) await this.battle.pbCommonAnimation(animName, this);
    }
    if (onAnimated) await onAnimated();
    switch (this.status) {
      case "SLEEP":
        await this.battle.pbDisplay(_INTL("{1} is fast asleep.", this.pbThis()));
        PBDebug.log(`[Status continues] ${this.pbThis()}'s sleep count is ${this._statusCount}`);
        break;
      case "POISON":
        await this.battle.pbDisplay(_INTL("{1} was hurt by poison!", this.pbThis()));
        break;
      case "BURN":
        await this.battle.pbDisplay(_INTL("{1} was hurt by its burn!", this.pbThis()));
        break;
      case "PARALYSIS":
        await this.battle.pbDisplay(_INTL("{1} is paralyzed! It can't move!", this.pbThis()));
        break;
      case "FROZEN":
        await this.battle.pbDisplay(_INTL("{1} is frozen solid!", this.pbThis()));
        break;
      case "DROWSY":
        await this.battle.pbDisplay(_INTL("{1} is too drowsy to move!", this.pbThis()));
        PBDebug.log(`[Status continues] ${this.pbThis()}'s drowsy count is ${this._statusCount}`);
        break;
      case "FROSTBITE":
        await this.battle.pbDisplay(_INTL("{1} was hurt by its frostbite!", this.pbThis()));
        break;
    }
  },

  /** pbCureStatus — Generation 9 Pack( core ): cures Drowsy/Frostbite. */
  async pbCureStatus(this: Battler, showMessages = true): Promise<void> {
    // Generation 9 Pack
    if (["DROWSY", "FROSTBITE"].includes(this.status)) {
      const oldStatus = this.status;
      this.status = "NONE";
      if (showMessages) {
        switch (oldStatus) {
          case "DROWSY": await this.battle.pbDisplay(_INTL("{1} became alert again.", this.pbThis())); break;
          case "FROSTBITE": await this.battle.pbDisplay(_INTL("{1}'s frostbite was healed.", this.pbThis())); break;
        }
      }
      if (!showMessages) PBDebug.log(`[Status change] ${this.pbThis()}'s status was cured`);
      return;
    }
    // Essentials
    const oldStatus = this.status;
    this.status = "NONE";
    if (showMessages) {
      switch (oldStatus) {
        case "SLEEP": await this.battle.pbDisplay(_INTL("{1} woke up!", this.pbThis())); break;
        case "POISON": await this.battle.pbDisplay(_INTL("{1} was cured of its poisoning.", this.pbThis())); break;
        case "BURN": await this.battle.pbDisplay(_INTL("{1}'s burn was healed.", this.pbThis())); break;
        case "PARALYSIS": await this.battle.pbDisplay(_INTL("{1} was cured of paralysis.", this.pbThis())); break;
        case "FROZEN": await this.battle.pbDisplay(_INTL("{1} thawed out!", this.pbThis())); break;
      }
    }
    if (!showMessages) PBDebug.log(`[Status change] ${this.pbThis()}'s status was cured`);
  },

  //=============================================================================
  // Confusion
  //=============================================================================
  /** pbCanConfuse? without messages (Ruby's showMessages defaults to true: use the Async version then). */
  pbCanConfuse(this: Battler, user: Battler | null = null, _showMessages = true, move: Move | null = null,
    selfInflicted = false): boolean {
    return canConfuseCore(this, user, false, move, selfInflicted, null);
  },

  /** pbCanConfuse? with messages. */
  async pbCanConfuseAsync(this: Battler, user: Battler | null = null, showMessages = true, move: Move | null = null,
    selfInflicted = false): Promise<boolean> {
    const q: (() => Promise<void>)[] = [];
    const ret = canConfuseCore(this, user, showMessages, move, selfInflicted, q);
    await playQueue(q);
    return ret;
  },

  /** pbCanConfuseSelf? without messages. */
  pbCanConfuseSelf(this: Battler, showMessages: boolean): boolean {
    return this.pbCanConfuse(null, showMessages, null, true);
  },

  /** pbCanConfuseSelf? with messages. */
  async pbCanConfuseSelfAsync(this: Battler, showMessages: boolean): Promise<boolean> {
    return this.pbCanConfuseAsync(null, showMessages, null, true);
  },

  async pbConfuse(this: Battler, msg: string | null = null): Promise<void> {
    this.effects[PBEffects.Confusion] = this.pbConfusionDuration();
    await this.battle.pbCommonAnimation("Confusion", this);
    if (nilOrEmpty(msg)) msg = _INTL("{1} became confused!", this.pbThis());
    await this.battle.pbDisplay(msg!);
    PBDebug.log(`[Lingering effect] ${this.pbThis()}'s confusion count is ${this.effects[PBEffects.Confusion]}`);
    // Confusion cures
    await this.pbItemStatusCureCheck();
    await this.pbAbilityStatusCureCheck();
  },

  pbConfusionDuration(this: Battler, duration = -1): number {
    if (duration <= 0) duration = 2 + this.battle.pbRandom(4);
    return duration;
  },

  pbCureConfusion(this: Battler): void {
    this.effects[PBEffects.Confusion] = 0;
  },

  //=============================================================================
  // Attraction
  //=============================================================================
  /** pbCanAttract? without messages. */
  pbCanAttract(this: Battler, user: Battler | null, _showMessages = true): boolean {
    return canAttractCore(this, user, false, null);
  },

  /** pbCanAttract? with messages. */
  async pbCanAttractAsync(this: Battler, user: Battler | null, showMessages = true): Promise<boolean> {
    const q: (() => Promise<void>)[] = [];
    const ret = canAttractCore(this, user, showMessages, q);
    await playQueue(q);
    return ret;
  },

  async pbAttract(this: Battler, user: Battler, msg: string | null = null): Promise<void> {
    this.effects[PBEffects.Attract] = user.index;
    await this.battle.pbCommonAnimation("Attract", this);
    if (nilOrEmpty(msg)) msg = _INTL("{1} fell in love!", this.pbThis());
    await this.battle.pbDisplay(msg!);
    // Destiny Knot
    if (this.hasActiveItem("DESTINYKNOT") && user.pbCanAttract(this, false)) {
      await user.pbAttract(this, _INTL("{1} fell in love from the {2}!", user.pbThis(true), this.itemName()));
    }
    // Attraction cures
    await this.pbItemStatusCureCheck();
    await this.pbAbilityStatusCureCheck();
  },

  pbCureAttract(this: Battler): void {
    this.effects[PBEffects.Attract] = -1;
  },

  //=============================================================================
  // Flinching
  //=============================================================================
  /** ZUD Mechanics: Dynamax Pokemon are immune to flinching effects. */
  pbFlinch(this: Battler, _user: Battler | null = null): void {
    // ZUD Mechanics
    if (this.effects[PBEffects.Dynamax] > 0) return;
    // Essentials
    if (this.hasActiveAbility("INNERFOCUS") && !this.battle.moldBreaker) return;
    this.effects[PBEffects.Flinch] = true;
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
