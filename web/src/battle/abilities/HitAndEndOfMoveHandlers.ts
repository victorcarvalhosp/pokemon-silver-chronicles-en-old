// Port of Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb (lines 1660-2249): the OnBeingHit, OnDealingHit, OnEndOfUsingMove and AfterMoveUseFromTarget handlers.
//
// All four triggers are async. Ruby's takesIndirectDamage?/affectedByContactEffect?/
// affectedByPowder? and pbCanX? calls that pass Battle::Scene::USE_ABILITY_SPLASH
// (i.e. may show a message) use the TS `...Async` variants; the ones that pass
// nothing use the sync variants.
// Later plugins replace some of these (Gen 9 Pack: MUMMY, WANDERINGSPIRIT,
// POISONTOUCH; ZUD Mechanics: CURSEDBODY, WANDERINGSPIRIT); see ./index.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Type } from "../../data/gameData/type";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";

//===============================================================================
// OnBeingHit handlers
//===============================================================================

AbilityEffects.OnBeingHit.add("AFTERMATH", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!target.fainted()) return;
  if (!move.pbContactMove(user)) return;
  await battle.pbShowAbilitySplash(target);
  if (!battle.moldBreaker) {
    const dampBattler = battle.pbCheckGlobalAbility("DAMP");
    if (dampBattler) {
      await battle.pbShowAbilitySplash(dampBattler);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1} cannot use {2}!", target.pbThis(), target.abilityName()));
      } else {
        await battle.pbDisplay(_INTL("{1} cannot use {2} because of {3}'s {4}!",
          target.pbThis(), target.abilityName(), dampBattler.pbThis(true), dampBattler.abilityName()));
      }
      await battle.pbHideAbilitySplash(dampBattler);
      await battle.pbHideAbilitySplash(target);
      return;
    }
  }
  if (await user.takesIndirectDamageAsync(Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    await battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(Math.floor(user.totalhp / 4), false);
    await battle.pbDisplay(_INTL("{1} was caught in the aftermath!", user.pbThis()));
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("ANGERPOINT", async (_ability: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
  if (!target.damageState.critical) return;
  if (!await target.pbCanRaiseStatStage("ATTACK", target)) return;
  await battle.pbShowAbilitySplash(target);
  target.stages.ATTACK = 6;
  target.statsRaisedThisRound = true;
  await battle.pbCommonAnimation("StatUp", target);
  if (Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1} maxed its {2}!", target.pbThis(), Stat.get("ATTACK").name));
  } else {
    await battle.pbDisplay(_INTL("{1}'s {2} maxed its {3}!",
      target.pbThis(), target.abilityName(), Stat.get("ATTACK").name));
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("COTTONDOWN", async (_ability: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
  // Deliberate fix (008_Battle_AbilityEffects.rb:1714 checks Defense, then lowers Speed).
  let any = false;
  for (const b of battle.allBattlers()) {
    if (await b.pbCanLowerStatStage("SPEED", target)) {
      any = true;
      break;
    }
  }
  if (!any) return;
  await battle.pbShowAbilitySplash(target);
  for (const b of battle.allBattlers()) {
    await b.pbLowerStatStageByAbility("SPEED", 1, target, false);
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("CURSEDBODY", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (user.fainted()) return;
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

AbilityEffects.OnBeingHit.add("CUTECHARM", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (target.fainted()) return;
  if (!move.pbContactMove(user)) return;
  if (battle.pbRandom(100) >= 30) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.pbCanAttractAsync(target, Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    let msg: string | null = null;
    if (!Scene.USE_ABILITY_SPLASH) {
      msg = _INTL("{1}'s {2} made {3} fall in love!", target.pbThis(),
        target.abilityName(), user.pbThis(true));
    }
    await user.pbAttract(target, msg);
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("EFFECTSPORE", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  // NOTE: This ability has a 30% chance of triggering, not a 30% chance of
  //       inflicting a status condition. It can try (and fail) to inflict a
  //       status condition that the user is immune to.
  if (!move.pbContactMove(user)) return;
  if (battle.pbRandom(100) >= 30) return;
  const r = battle.pbRandom(3);
  if (r === 0 && user.asleep()) return;
  if (r === 1 && user.poisoned()) return;
  if (r === 2 && user.paralyzed()) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.affectedByPowderAsync(Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    switch (r) {
      case 0:
        if (await user.pbCanSleepAsync(target, Scene.USE_ABILITY_SPLASH)) {
          let msg: string | null = null;
          if (!Scene.USE_ABILITY_SPLASH) {
            msg = _INTL("{1}'s {2} made {3} fall asleep!", target.pbThis(),
              target.abilityName(), user.pbThis(true));
          }
          await user.pbSleep(msg);
        }
        break;
      case 1:
        if (await user.pbCanPoisonAsync(target, Scene.USE_ABILITY_SPLASH)) {
          let msg: string | null = null;
          if (!Scene.USE_ABILITY_SPLASH) {
            msg = _INTL("{1}'s {2} poisoned {3}!", target.pbThis(),
              target.abilityName(), user.pbThis(true));
          }
          await user.pbPoison(target, msg);
        }
        break;
      case 2:
        if (await user.pbCanParalyzeAsync(target, Scene.USE_ABILITY_SPLASH)) {
          let msg: string | null = null;
          if (!Scene.USE_ABILITY_SPLASH) {
            msg = _INTL("{1}'s {2} paralyzed {3}! It may be unable to move!",
              target.pbThis(), target.abilityName(), user.pbThis(true));
          }
          await user.pbParalyze(target, msg);
        }
        break;
    }
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("FLAMEBODY", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.burned() || battle.pbRandom(100) >= 30) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.pbCanBurnAsync(target, Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    let msg: string | null = null;
    if (!Scene.USE_ABILITY_SPLASH) {
      msg = _INTL("{1}'s {2} burned {3}!", target.pbThis(), target.abilityName(), user.pbThis(true));
    }
    await user.pbBurn(target, msg);
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("GOOEY", async (_ability: Id, user: Battler, target: Battler, move: Move, _battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  // NOTE: checkContact (the last argument) is ignored by the Gen 9 Pack's
  //       pbLowerStatStageByAbility, as in Ruby (see Battler_StatStages.ts).
  await user.pbLowerStatStageByAbility("SPEED", 1, target, true, true);
});

AbilityEffects.OnBeingHit.copy("GOOEY", "TANGLINGHAIR");

AbilityEffects.OnBeingHit.add("ILLUSION", async (_ability: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
  // NOTE: This intentionally doesn't show the ability splash.
  if (!target.effects[PBEffects.Illusion]) return;
  target.effects[PBEffects.Illusion] = null;
  battle.scene.pbChangePokemon(target, target.pokemon!);
  await battle.pbDisplay(_INTL("{1}'s illusion wore off!", target.pbThis()));
  battle.pbSetSeen(target);
});

AbilityEffects.OnBeingHit.add("INNARDSOUT", async (_ability: Id, user: Battler, target: Battler, _move: Move, battle: Battle) => {
  if (!target.fainted() || user.dummy) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.takesIndirectDamageAsync(Scene.USE_ABILITY_SPLASH)) {
    await battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(target.damageState.hpLost, false);
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} is hurt!", user.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} is hurt by {2}'s {3}!", user.pbThis(),
        target.pbThis(true), target.abilityName()));
    }
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("IRONBARBS", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.takesIndirectDamageAsync(Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    await battle.scene.pbDamageAnimation(user);
    await user.pbReduceHP(Math.floor(user.totalhp / 8), false);
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} is hurt!", user.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1} is hurt by {2}'s {3}!", user.pbThis(),
        target.pbThis(true), target.abilityName()));
    }
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.copy("IRONBARBS", "ROUGHSKIN");

AbilityEffects.OnBeingHit.add("JUSTIFIED", async (_ability: Id, _user: Battler, target: Battler, move: Move, _battle: Battle) => {
  if (move.calcType !== "DARK") return;
  await target.pbRaiseStatStageByAbility("ATTACK", 1, target);
});

AbilityEffects.OnBeingHit.add("MUMMY", async (ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.fainted()) return;
  if (user.unstoppableAbility() || user.abilityId === ability) return;
  let oldAbil: Id | null = null;
  if (user.opposes(target)) await battle.pbShowAbilitySplash(target);
  if (await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    oldAbil = user.abilityId;
    if (user.opposes(target)) await battle.pbShowAbilitySplash(user, true, false);
    user.ability = ability;
    if (user.opposes(target)) await battle.pbReplaceAbilitySplash(user);
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s Ability became {2}!", user.pbThis(), user.abilityName()));
    } else {
      await battle.pbDisplay(_INTL("{1}'s Ability became {2} because of {3}!",
        user.pbThis(), user.abilityName(), target.pbThis(true)));
    }
    if (user.opposes(target)) await battle.pbHideAbilitySplash(user);
  }
  if (user.opposes(target)) await battle.pbHideAbilitySplash(target);
  await user.pbOnLosingAbility(oldAbil);
  await user.pbTriggerAbilityOnGainingIt();
});

AbilityEffects.OnBeingHit.add("PERISHBODY", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.fainted()) return;
  if (user.effects[PBEffects.PerishSong] > 0 || target.effects[PBEffects.PerishSong] > 0) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    user.effects[PBEffects.PerishSong] = 4;
    user.effects[PBEffects.PerishSongUser] = target.index;
    target.effects[PBEffects.PerishSong] = 4;
    target.effects[PBEffects.PerishSongUser] = target.index;
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("Both Pokémon will faint in three turns!"));
    } else {
      await battle.pbDisplay(_INTL("Both Pokémon will faint in three turns because of {1}'s {2}!",
        target.pbThis(true), target.abilityName()));
    }
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("POISONPOINT", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.poisoned() || battle.pbRandom(100) >= 30) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.pbCanPoisonAsync(target, Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    let msg: string | null = null;
    if (!Scene.USE_ABILITY_SPLASH) {
      msg = _INTL("{1}'s {2} poisoned {3}!", target.pbThis(), target.abilityName(), user.pbThis(true));
    }
    await user.pbPoison(target, msg);
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("RATTLED", async (_ability: Id, _user: Battler, target: Battler, move: Move, _battle: Battle) => {
  if (!["BUG", "DARK", "GHOST"].includes(move.calcType!)) return;
  await target.pbRaiseStatStageByAbility("SPEED", 1, target);
});

AbilityEffects.OnBeingHit.add("SANDSPIT", async (_ability: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
  await battle.pbStartWeatherAbility("Sandstorm", target);
});

AbilityEffects.OnBeingHit.add("STAMINA", async (_ability: Id, _user: Battler, target: Battler, _move: Move, _battle: Battle) => {
  await target.pbRaiseStatStageByAbility("DEFENSE", 1, target);
});

AbilityEffects.OnBeingHit.add("STATIC", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.paralyzed() || battle.pbRandom(100) >= 30) return;
  await battle.pbShowAbilitySplash(target);
  if (await user.pbCanParalyzeAsync(target, Scene.USE_ABILITY_SPLASH) &&
      await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    let msg: string | null = null;
    if (!Scene.USE_ABILITY_SPLASH) {
      msg = _INTL("{1}'s {2} paralyzed {3}! It may be unable to move!",
        target.pbThis(), target.abilityName(), user.pbThis(true));
    }
    await user.pbParalyze(target, msg);
  }
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.OnBeingHit.add("WANDERINGSPIRIT", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.ungainableAbility() || ["RECEIVER", "WONDERGUARD"].includes(user.abilityId!)) return;
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

AbilityEffects.OnBeingHit.add("WATERCOMPACTION", async (_ability: Id, _user: Battler, target: Battler, move: Move, _battle: Battle) => {
  if (move.calcType !== "WATER") return;
  await target.pbRaiseStatStageByAbility("DEFENSE", 2, target);
});

AbilityEffects.OnBeingHit.add("WEAKARMOR", async (_ability: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.physicalMove()) return;
  if (!await target.pbCanLowerStatStage("DEFENSE", target) &&
      !await target.pbCanRaiseStatStage("SPEED", target)) return;
  await battle.pbShowAbilitySplash(target);
  await target.pbLowerStatStageByAbility("DEFENSE", 1, target, false);
  await target.pbRaiseStatStageByAbility("SPEED",
    (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7) ? 2 : 1, target, false);
  await battle.pbHideAbilitySplash(target);
});

//===============================================================================
// OnDealingHit handlers
//===============================================================================

AbilityEffects.OnDealingHit.add("POISONTOUCH", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.contactMove()) return;
  if (battle.pbRandom(100) >= 30) return;
  await battle.pbShowAbilitySplash(user);
  if (target.hasActiveAbility("SHIELDDUST") && !battle.moldBreaker) {
    await battle.pbShowAbilitySplash(target);
    if (!Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} is unaffected!", target.pbThis()));
    }
    await battle.pbHideAbilitySplash(target);
  } else if (await target.pbCanPoisonAsync(user, Scene.USE_ABILITY_SPLASH)) {
    let msg: string | null = null;
    if (!Scene.USE_ABILITY_SPLASH) {
      msg = _INTL("{1}'s {2} poisoned {3}!", user.pbThis(), user.abilityName(), target.pbThis(true));
    }
    await target.pbPoison(user, msg);
  }
  await battle.pbHideAbilitySplash(user);
});

//===============================================================================
// OnEndOfUsingMove handlers
//===============================================================================

AbilityEffects.OnEndOfUsingMove.add("BEASTBOOST", async (_ability: Id, user: Battler, targets: Battler[], _move: Move, battle: Battle) => {
  if (battle.pbAllFainted(user.idxOpposingSide())) return;
  let numFainted = 0;
  for (const b of targets) if (b.damageState.fainted) numFainted += 1;
  if (numFainted === 0) return;
  const userStats = user.plainStats();
  let highestStatValue = 0;
  for (const value of Object.values(userStats)) if (highestStatValue < value) highestStatValue = value;
  for (const s of Stat.eachMainBattle()) {
    if (userStats[s.id]! < highestStatValue) continue;
    if (await user.pbCanRaiseStatStage(s.id, user)) {
      await user.pbRaiseStatStageByAbility(s.id, numFainted, user);
    }
    break;
  }
});

AbilityEffects.OnEndOfUsingMove.add("CHILLINGNEIGH", async (ability: Id, user: Battler, targets: Battler[], _move: Move, battle: Battle) => {
  if (battle.pbAllFainted(user.idxOpposingSide())) return;
  let numFainted = 0;
  for (const b of targets) if (b.damageState.fainted) numFainted += 1;
  if (numFainted === 0 || !await user.pbCanRaiseStatStage("ATTACK", user)) return;
  user.abilityId = "CHILLINGNEIGH"; // So the As One abilities can just copy this
  await user.pbRaiseStatStageByAbility("ATTACK", 1, user);
  user.abilityId = ability;
});

AbilityEffects.OnEndOfUsingMove.copy("CHILLINGNEIGH", "ASONECHILLINGNEIGH");

AbilityEffects.OnEndOfUsingMove.add("GRIMNEIGH", async (ability: Id, user: Battler, targets: Battler[], _move: Move, battle: Battle) => {
  if (battle.pbAllFainted(user.idxOpposingSide())) return;
  let numFainted = 0;
  for (const b of targets) if (b.damageState.fainted) numFainted += 1;
  if (numFainted === 0 || !await user.pbCanRaiseStatStage("SPECIAL_ATTACK", user)) return;
  user.abilityId = "GRIMNEIGH"; // So the As One abilities can just copy this
  await user.pbRaiseStatStageByAbility("SPECIAL_ATTACK", 1, user);
  user.abilityId = ability;
});

AbilityEffects.OnEndOfUsingMove.copy("GRIMNEIGH", "ASONEGRIMNEIGH");

AbilityEffects.OnEndOfUsingMove.add("MAGICIAN", async (_ability: Id, user: Battler, targets: Battler[], move: Move, battle: Battle) => {
  if (battle.futureSight) return;
  if (!move.pbDamagingMove()) return;
  if (user.item) return;
  if (user.wild()) return;
  for (const b of targets) {
    if (b.damageState.unaffected || b.damageState.substitute) continue;
    if (!b.item) continue;
    if (b.unlosableItem(b.item) || user.unlosableItem(b.item)) continue;
    await battle.pbShowAbilitySplash(user);
    if (b.hasActiveAbility("STICKYHOLD")) {
      if (user.opposes(b)) await battle.pbShowAbilitySplash(b);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1}'s item cannot be stolen!", b.pbThis()));
      }
      if (user.opposes(b)) await battle.pbHideAbilitySplash(b);
      // Deliberate fix (008_Battle_AbilityEffects.rb:2154 leaves the user's splash showing).
      await battle.pbHideAbilitySplash(user);
      continue;
    }
    user.item = b.item;
    b.item = null;
    if (b.hasActiveAbility("UNBURDEN")) b.effects[PBEffects.Unburden] = true;
    if (battle.wildBattle() && !user.initialItem() && user.itemId === b.initialItem()) {
      user.setInitialItem(user.item);
      b.setInitialItem(null);
    }
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1} stole {2}'s {3}!", user.pbThis(),
        b.pbThis(true), user.itemName()));
    } else {
      await battle.pbDisplay(_INTL("{1} stole {2}'s {3} with {4}!", user.pbThis(),
        b.pbThis(true), user.itemName(), user.abilityName()));
    }
    await battle.pbHideAbilitySplash(user);
    await user.pbHeldItemTriggerCheck();
    break;
  }
});

AbilityEffects.OnEndOfUsingMove.add("MOXIE", async (_ability: Id, user: Battler, targets: Battler[], _move: Move, battle: Battle) => {
  if (battle.pbAllFainted(user.idxOpposingSide())) return;
  let numFainted = 0;
  for (const b of targets) if (b.damageState.fainted) numFainted += 1;
  if (numFainted === 0 || !await user.pbCanRaiseStatStage("ATTACK", user)) return;
  await user.pbRaiseStatStageByAbility("ATTACK", numFainted, user);
});

//===============================================================================
// AfterMoveUseFromTarget handlers
//===============================================================================

AbilityEffects.AfterMoveUseFromTarget.add("BERSERK", async (_ability: Id, target: Battler, _user: Battler, move: Move,
  _switchedBattlers: number[], _battle: Battle) => {
  if (!move.damagingMove()) return;
  if (!target.droppedBelowHalfHP) return;
  if (!await target.pbCanRaiseStatStage("SPECIAL_ATTACK", target)) return;
  await target.pbRaiseStatStageByAbility("SPECIAL_ATTACK", 1, target);
});

AbilityEffects.AfterMoveUseFromTarget.add("COLORCHANGE", async (_ability: Id, target: Battler, _user: Battler, move: Move,
  _switchedBattlers: number[], battle: Battle) => {
  if (target.damageState.calcDamage === 0 || target.damageState.substitute) return;
  if (!move.calcType || Type.get(move.calcType).pseudoType) return;
  if (target.pbHasType(move.calcType) && !target.pbHasOtherType(move.calcType)) return;
  const typeName = Type.get(move.calcType).name;
  await battle.pbShowAbilitySplash(target);
  target.pbChangeTypes(move.calcType);
  await battle.pbDisplay(_INTL("{1}'s type changed to {2} because of its {3}!",
    target.pbThis(), typeName, target.abilityName()));
  await battle.pbHideAbilitySplash(target);
});

AbilityEffects.AfterMoveUseFromTarget.add("PICKPOCKET", async (_ability: Id, target: Battler, user: Battler, move: Move,
  switchedBattlers: number[], battle: Battle) => {
  // NOTE: According to Bulbapedia, this can still trigger to steal the user's
  //       item even if it was switched out by a Red Card. That doesn't make
  //       sense, so this code doesn't do it.
  if (target.wild()) return;
  if (switchedBattlers.includes(user.index)) return; // User was switched out
  if (!move.contactMove()) return;
  if (user.effects[PBEffects.Substitute] > 0 || target.damageState.substitute) return;
  if (target.item || !user.item) return;
  if (user.unlosableItem(user.item) || target.unlosableItem(user.item)) return;
  await battle.pbShowAbilitySplash(target);
  if (user.hasActiveAbility("STICKYHOLD")) {
    if (target.opposes(user)) await battle.pbShowAbilitySplash(user);
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s item cannot be stolen!", user.pbThis()));
    }
    if (target.opposes(user)) await battle.pbHideAbilitySplash(user);
    await battle.pbHideAbilitySplash(target);
    return;
  }
  target.item = user.item;
  user.item = null;
  if (user.hasActiveAbility("UNBURDEN")) user.effects[PBEffects.Unburden] = true;
  if (battle.wildBattle() && !target.initialItem() && target.itemId === user.initialItem()) {
    target.setInitialItem(target.item);
    user.setInitialItem(null);
  }
  await battle.pbDisplay(_INTL("{1} pickpocketed {2}'s {3}!", target.pbThis(),
    user.pbThis(true), target.itemName()));
  await battle.pbHideAbilitySplash(target);
  await target.pbHeldItemTriggerCheck();
});
