// Port of the ability handlers in
//   Plugins/Essentials Deluxe/[000] Essentials Patches/Battle_Misc.rb (lines 388-410: Imposter)
//   Plugins/ZUD Mechanics/[008] Overrides/Override_Abilities.rb (all of it: Forewarn,
//     Cursed Body, Emergency Exit/Wimp Out, Gorilla Tactics, Wandering Spirit)
// in plugin load order (Essentials Deluxe, then ZUD Mechanics). These replace
// the core Essentials/Generation 9 Pack handlers of the same abilities.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { pbSEPlay } from "../audio";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects, type DamageMultipliers } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";

//###############################################################################
// Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb)
//###############################################################################

//===============================================================================
// Imposter
//===============================================================================
// Edited for compatibility with battle effects that alter battler sprites.
//-------------------------------------------------------------------------------
AbilityEffects.OnSwitchIn.add("IMPOSTER", async (_ability: Id, battler: Battler, battle: Battle, switchIn: boolean) => {
  if (!switchIn || battler.effects[PBEffects.Transform]) return;
  const choice = battler.pbDirectOpposing();
  if (choice.fainted()) return;
  if (battler.dynamax() && !choice.dynamaxAble()) return;
  if (choice.effects[PBEffects.Transform] ||
      choice.effects[PBEffects.Illusion] ||
      choice.effects[PBEffects.Substitute] > 0 ||
      choice.effects[PBEffects.SkyDrop] >= 0 ||
      choice.semiInvulnerable()) return;
  await battle.pbShowAbilitySplash(battler, true);
  await battle.pbHideAbilitySplash(battler);
  battler.effects[PBEffects.TransformPokemon] = choice.pokemon;
  await battle.pbAnimation("TRANSFORM", battler, choice);
  battle.scene.pbChangePokemon(battler, choice.pokemon!);
  await battler.pbTransform(choice);
});

//###############################################################################
// ZUD Mechanics ([008] Overrides/Override_Abilities.rb)
//###############################################################################

//===============================================================================
// Forewarn
//===============================================================================
// Checks the target's base moves, not Max Moves.
//-------------------------------------------------------------------------------
AbilityEffects.OnSwitchIn.add("FOREWARN", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.pbOwnedByPlayer()) return;
  let highestPower = 0;
  let forewarnMoves: string[] = [];
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    b.eachMoveWithIndex((mv, i) => {
      let m = mv;
      if (b.dynamax()) m = b.baseMoves[i] as Move;
      let power = m.baseDamage;
      if (["OHKO", "OHKOIce", "OHKOHitsUndergroundTarget"].includes(m.function)) power = 160;
      if (["PowerHigherWithUserHP"].includes(m.function)) power = 150; // Eruption (fixed: not also 80)
      if (["CounterPhysicalDamage",
        "CounterSpecialDamage",
        "CounterDamagePlusHalf"].includes(m.function)) power = 120;
      if (["FixedDamage20",
        "FixedDamage40",
        "FixedDamageUserLevel",
        "LowerTargetHPToUserHP",
        "FixedDamageUserLevelRandom",
        "PowerHigherWithUserHappiness",
        "PowerLowerWithUserHappiness",
        "PowerHigherWithTargetFasterThanUser",
        "TypeAndPowerDependOnUserBerry",
        "PowerHigherWithLessPP",
        "PowerLowerWithUserHP",
        "PowerHigherWithTargetWeight"].includes(m.function)) power = 80;
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME <= 5 && m.function === "TypeDependsOnUserIVs") power = 80;
      if (power < highestPower) return;
      if (power > highestPower) forewarnMoves = [];
      forewarnMoves.push(m.name);
      highestPower = power;
    });
  }
  if (forewarnMoves.length > 0) {
    await battle.pbShowAbilitySplash(battler);
    const forewarnMoveName = forewarnMoves[battle.pbRandom(forewarnMoves.length)];
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} was alerted to {2}!",
        battler.pbThis(), forewarnMoveName));
    } else {
      await battle.pbDisplay(_INTL("{1}'s Forewarn alerted it to {2}!",
        battler.pbThis(), forewarnMoveName));
    }
    await battle.pbHideAbilitySplash(battler);
  }
});

//===============================================================================
// Cursed Body
//===============================================================================
// Ability fails to trigger if the attacker is a Dynamaxed Pokemon.
//-------------------------------------------------------------------------------
AbilityEffects.OnBeingHit.add("CURSEDBODY", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (user.fainted() || user.dynamax()) return;
  if (user.effects[PBEffects.Disable] > 0) return;
  let regularMove: Move | null = null;
  for (const m of user.moves) {
    if (m.id !== user.lastRegularMoveUsed) continue;
    regularMove = m;
    break;
  }
  if (!regularMove || (regularMove.pp === 0 && regularMove.totalPp() > 0)) return;
  if (battle.pbRandom(100) >= 30) return;
  await battle.pbShowAbilitySplash(target);
  // (Ruby passes the Cursed Body bearer as the "user" and the attacker as the "target".)
  if (!await move.pbMoveFailedAromaVeil(target, user, Scene.USE_ABILITY_SPLASH)) {
    user.effects[PBEffects.Disable] = 3;
    user.effects[PBEffects.DisableMove] = regularMove.id;
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s {2} was disabled!", user.pbThis(), regularMove.name));
    } else {
      await battle.pbDisplay(_INTL("{1}'s {2} was disabled by {3}'s {4}!",
        user.pbThis(), regularMove.name, target.pbThis(true), target.abilityName()));
    }
    await battle.pbHideAbilitySplash(target);
    await user.pbItemStatusCureCheck();
  }
  await battle.pbHideAbilitySplash(target);
});

//===============================================================================
// Emergency Exit/Wimp Out
//===============================================================================
// Ability fails to trigger if the user is a Max Raid Boss.
//-------------------------------------------------------------------------------
AbilityEffects.OnHPDroppedBelowHalf.add("EMERGENCYEXIT", async (_ability: Id, battler: Battler, moveUser: Battler | null, battle: Battle) => {
  if (battler.effects[PBEffects.SkyDrop] >= 0 ||
      battler.inTwoTurnAttack("TwoTurnAttackInvulnerableInSkyTargetCannotAct")) return false;
  if (battle.wildBattle()) {
    if (battler.effects[PBEffects.MaxRaidBoss]) return false;
    if (battler.opposes() && battle.pbSideBattlerCount(battler.index) > 1) return false;
    if (!battle.pbCanRun(battler.index)) return false;
    await battle.pbShowAbilitySplash(battler, true);
    await battle.pbHideAbilitySplash(battler);
    pbSEPlay("Battle flee");
    await battle.pbDisplay(_INTL("{1} fled from battle!", battler.pbThis()));
    battle.decision = 3;
    return true;
  }
  if (battle.pbAllFainted(battler.idxOpposingSide())) return false;
  if (!battle.pbCanSwitch(battler.index)) return false;
  if (!battle.pbCanChooseNonActive(battler.index)) return false;
  await battle.pbShowAbilitySplash(battler, true);
  await battle.pbHideAbilitySplash(battler);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1}'s {2} activated!", battler.pbThis(), battler.abilityName()));
  }
  await battle.pbDisplay(_INTL("{1} went back to {2}!",
    battler.pbThis(), battle.pbGetOwnerName(battler.index)));
  if (battle.endOfRound) {
    if (!battler.fainted()) await battle.scene.pbRecall(battler.index);
    await battler.pbAbilitiesOnSwitchOut();
    return true;
  }
  const newPkmn = await battle.pbGetReplacementPokemonIndex(battler.index);
  if (newPkmn < 0) return false;
  await battle.pbRecallAndReplace(battler.index, newPkmn);
  battle.pbClearChoice(battler.index);
  if (moveUser && battler.index === moveUser.index) battle.moldBreaker = false;
  await battle.pbOnBattlerEnteringBattle(battler.index);
  return true;
});

AbilityEffects.OnHPDroppedBelowHalf.copy("EMERGENCYEXIT", "WIMPOUT");

//===============================================================================
// Gorilla Tactics
//===============================================================================
// No Attack multiplier applied when using Z-Moves/Max Moves.
//-------------------------------------------------------------------------------
AbilityEffects.DamageCalcFromUser.add("GORILLATACTICS",
  (_ability: Id, _user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.physicalMove() && !move.powerMove()) mults.attack_multiplier! *= 1.5;
  });

//===============================================================================
// Wandering Spirit
//===============================================================================
// Ability fails to trigger if the attacker is a Dynamaxed Pokemon.
//-------------------------------------------------------------------------------
AbilityEffects.OnBeingHit.add("WANDERINGSPIRIT", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.dynamax()) return;
  if (user.ungainableAbility() || ["RECEIVER", "WONDERGUARD"].includes(user.abilityId!)) return;
  if (user.hasActiveItem("ABILITYSHIELD") || target.hasActiveItem("ABILITYSHIELD")) return;
  let oldUserAbil: Id | null = null;
  let oldTargetAbil: Id | null = null;
  if (user.opposes(target)) await battle.pbShowAbilitySplash(target);
  if (await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    if (user.opposes(target)) await battle.pbShowAbilitySplash(user, true, false);
    oldUserAbil = user.abilityId;
    oldTargetAbil = target.abilityId;
    user.ability = oldTargetAbil;
    target.ability = oldUserAbil;
    if (user.opposes(target)) {
      await battle.pbReplaceAbilitySplash(user);
      await battle.pbReplaceAbilitySplash(target);
    }
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} swapped Abilities with {2}!", target.pbThis(), user.pbThis(true)));
    } else {
      await battle.pbDisplay(_INTL("{1} swapped its {2} Ability with {3}'s {4} Ability!",
        target.pbThis(), user.abilityName(), user.pbThis(true), target.abilityName()));
    }
    if (user.opposes(target)) {
      await battle.pbHideAbilitySplash(user);
      await battle.pbHideAbilitySplash(target);
    }
  }
  if (user.opposes(target)) await battle.pbHideAbilitySplash(target);
  await user.pbOnLosingAbility(oldUserAbil);
  await target.pbOnLosingAbility(oldTargetAbil);
  await user.pbTriggerAbilityOnGainingIt();
  await target.pbTriggerAbilityOnGainingIt();
});
