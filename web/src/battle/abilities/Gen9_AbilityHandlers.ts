// Port of Plugins/Generation 9 Pack Scripts/[003] Abilities/[000] Ability Handlers.rb,
// lines 32-558 ("Updates to old ability handlers"): these replace core
// Essentials' handlers of the same abilities. Lines 1-31 (the OnTypeChange and
// OnOpposingStatGain hashes and the Commander-aware triggerOnSwitchIn) are in
// ../other/AbilityEffects.ts.
//
// Ruby bugs fixed on purpose (the Ruby test harness applies the same fixes):
// - Synchronize (line 233/244): calls pbSleep/pbFreeze(nil, msg), an
//   ArgumentError; it inflicts Drowsy/Frostbite as its messages say.
// - Neutralizing Gas (line 393-394): reads undefined `target` and `@battle`
//   when a battler holds an Ability Shield (a NameError).
// - Mummy (line 310): compared Symbols with a GameData::Ability, so the
//   Mummy/Lingering Aroma check never applied.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Type } from "../../data/gameData/type";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";

//################################################################################
//
// Updates to old ability handlers.
//
//################################################################################

//===============================================================================
// Insomnia, Vital Spirit
//===============================================================================
// Adds Drowsy as a status that may be healed.
//-------------------------------------------------------------------------------
AbilityEffects.StatusCure.add("INSOMNIA", async (_ability: Id, battler: Battler) => {
  if (!["SLEEP", "DROWSY"].includes(battler.status)) return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    let msg: string | null = null;
    switch (battler.status) {
      case "SLEEP": msg = _INTL("{1}'s {2} woke it up!", battler.pbThis(), battler.abilityName()); break;
      case "DROWSY": msg = _INTL("{1}'s {2} made it alert again!", battler.pbThis(), battler.abilityName()); break;
    }
    await battler.battle.pbDisplay(msg!);
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.copy("INSOMNIA", "VITALSPIRIT");

//===============================================================================
// Magma Armor
//===============================================================================
// Adds Frostbite as a status that may be healed.
//-------------------------------------------------------------------------------
AbilityEffects.StatusCure.add("MAGMAARMOR", async (_ability: Id, battler: Battler) => {
  if (!["FROZEN", "FROSTBITE"].includes(battler.status)) return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    let msg: string | null = null;
    switch (battler.status) {
      case "FROZEN": msg = _INTL("{1}'s {2} defrosted it!", battler.pbThis(), battler.abilityName()); break;
      case "FROSTBITE": msg = _INTL("{1}'s {2} healed its frostbite!", battler.pbThis(), battler.abilityName()); break;
    }
    await battler.battle.pbDisplay(msg!);
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// Healer
//===============================================================================
// Adds Drowsy/Frostbite as statuses that may be healed.
//-------------------------------------------------------------------------------
AbilityEffects.EndOfRoundHealing.add("HEALER", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (!(battle.pbRandom(100) < 30)) return;
  for (const b of battler.allAllies()) {
    if (b.status === "NONE") continue;
    await battle.pbShowAbilitySplash(battler);
    const oldStatus = b.status;
    await b.pbCureStatus(Scene.USE_ABILITY_SPLASH);
    if (!Scene.USE_ABILITY_SPLASH) {
      switch (oldStatus) {
        case "SLEEP":
          await battle.pbDisplay(_INTL("{1}'s {2} woke its partner up!", battler.pbThis(), battler.abilityName()));
          break;
        case "POISON":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its partner's poison!", battler.pbThis(), battler.abilityName()));
          break;
        case "BURN":
          await battle.pbDisplay(_INTL("{1}'s {2} healed its partner's burn!", battler.pbThis(), battler.abilityName()));
          break;
        case "PARALYSIS":
          await battle.pbDisplay(_INTL("{1}'s {2} cured its partner's paralysis!", battler.pbThis(), battler.abilityName()));
          break;
        case "FROZEN":
          await battle.pbDisplay(_INTL("{1}'s {2} defrosted its partner!", battler.pbThis(), battler.abilityName()));
          break;
        case "DROWSY":
          await battle.pbDisplay(_INTL("{1}'s {2} made its partner alert again!", battler.pbThis(), battler.abilityName()));
          break;
        case "FROSTBITE":
          await battle.pbDisplay(_INTL("{1}'s {2} healed its partner's frostbite!", battler.pbThis(), battler.abilityName()));
          break;
      }
    }
    await battle.pbHideAbilitySplash(battler);
  }
});

/** The messages Hydration and Shed Skin show without ability splashes (identical in both). */
async function curedSelfMessage(battle: Battle, battler: Battler, oldStatus: Id): Promise<void> {
  switch (oldStatus) {
    case "SLEEP":
      await battle.pbDisplay(_INTL("{1}'s {2} woke it up!", battler.pbThis(), battler.abilityName()));
      break;
    case "POISON":
      await battle.pbDisplay(_INTL("{1}'s {2} cured its poison!", battler.pbThis(), battler.abilityName()));
      break;
    case "BURN":
      await battle.pbDisplay(_INTL("{1}'s {2} healed its burn!", battler.pbThis(), battler.abilityName()));
      break;
    case "PARALYSIS":
      await battle.pbDisplay(_INTL("{1}'s {2} cured its paralysis!", battler.pbThis(), battler.abilityName()));
      break;
    case "FROZEN":
      await battle.pbDisplay(_INTL("{1}'s {2} defrosted it!", battler.pbThis(), battler.abilityName()));
      break;
    case "DROWSY":
      await battle.pbDisplay(_INTL("{1}'s {2} made it alert again!", battler.pbThis(), battler.abilityName()));
      break;
    case "FROSTBITE":
      await battle.pbDisplay(_INTL("{1}'s {2} healed its frostbite!", battler.pbThis(), battler.abilityName()));
      break;
  }
}

//===============================================================================
// Hydration
//===============================================================================
// Adds Drowsy/Frostbite as statuses that may be healed.
//-------------------------------------------------------------------------------
AbilityEffects.EndOfRoundHealing.add("HYDRATION", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.status === "NONE") return;
  if (!["Rain", "HeavyRain"].includes(battler.effectiveWeather())) return;
  await battle.pbShowAbilitySplash(battler);
  const oldStatus = battler.status;
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) await curedSelfMessage(battle, battler, oldStatus);
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// Shed Skin
//===============================================================================
// Adds Drowsy/Frostbite as statuses that may be healed.
//-------------------------------------------------------------------------------
AbilityEffects.EndOfRoundHealing.add("SHEDSKIN", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.status === "NONE") return;
  if (!(battle.pbRandom(100) < 30)) return;
  await battle.pbShowAbilitySplash(battler);
  const oldStatus = battler.status;
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) await curedSelfMessage(battle, battler, oldStatus);
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// Synchronize
//===============================================================================
// Adds Drowsy/Frostbite as statuses that may be passed.
//-------------------------------------------------------------------------------
AbilityEffects.OnStatusInflicted.add("SYNCHRONIZE", async (_ability: Id, battler: Battler, user: Battler | null, status: Id) => {
  if (!user || user.index === battler.index) return;
  let msg: string | null;
  switch (status) {
    case "POISON":
      if (user.pbCanPoisonSynchronize(battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        msg = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} poisoned {3}!", battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbPoison(null, msg, battler.statusCount > 0);
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
    case "BURN":
      if (user.pbCanBurnSynchronize(battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        msg = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} burned {3}!", battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbBurn(null, msg);
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
    case "PARALYSIS":
      if (user.pbCanParalyzeSynchronize(battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        msg = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} paralyzed {3}! It may be unable to move!",
            battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbParalyze(null, msg);
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
    case "DROWSY":
      // Deliberate fix: Ruby checks :SLEEP and calls pbSleep(nil, msg) (an
      // ArgumentError); the messages show Drowsy was meant.
      if (user.pbCanSynchronizeStatus("DROWSY", battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        msg = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} made {3} drowsy! It may be too sleepy to move!",
            battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbDrowse(null, msg);
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
    case "FROSTBITE":
      // Deliberate fix: Ruby checks :FROZEN and calls pbFreeze(nil, msg) (an
      // ArgumentError); the messages show Frostbite was meant.
      if (user.pbCanSynchronizeStatus("FROSTBITE", battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        msg = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} caused {3} to become frostbitten!", battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbFrostbite(null, msg);
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
  }
});

//===============================================================================
// Poison Touch
//===============================================================================
// Adds Covert Cloak immunity.
//-------------------------------------------------------------------------------
AbilityEffects.OnDealingHit.add("POISONTOUCH", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.contactMove()) return;
  if (battle.pbRandom(100) >= 30) return;
  if (target.hasActiveItem("COVERTCLOAK")) return;
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
// Power of Alchemy, Receiver
//===============================================================================
// Adds Ability Shield immunity.
//-------------------------------------------------------------------------------
AbilityEffects.ChangeOnBattlerFainting.add("POWEROFALCHEMY", async (_ability: Id, battler: Battler, fainted: Battler, battle: Battle) => {
  if (battler.opposes(fainted)) return;
  if (fainted.uncopyableAbility()) return;
  if (battler.hasActiveItem("ABILITYSHIELD")) return;
  await battle.pbShowAbilitySplash(battler, true);
  battler.ability = fainted.ability;
  await battle.pbReplaceAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1}'s {2} was taken over!", fainted.pbThis(), fainted.abilityName()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.ChangeOnBattlerFainting.copy("POWEROFALCHEMY", "RECEIVER");

//===============================================================================
// Mummy
//===============================================================================
// Adds Ability Shield immunity. Lingering Aroma ability uses the same code.
//-------------------------------------------------------------------------------
AbilityEffects.OnBeingHit.add("MUMMY", async (ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.fainted()) return;
  if (user.unstoppableAbility()) return;
  // Deliberate fix: Ruby ([000] Ability Handlers.rb:310) compares the Symbols
  // with a GameData::Ability, so this check never matched.
  if (["MUMMY", "LINGERINGAROMA"].includes(user.abilityId ?? "")) return;
  if (user.hasActiveItem("ABILITYSHIELD")) return;
  let oldAbil: Id | null = null;
  if (user.opposes(target)) await battle.pbShowAbilitySplash(target);
  if (await user.affectedByContactEffectAsync(Scene.USE_ABILITY_SPLASH)) {
    oldAbil = user.abilityId;
    if (user.opposes(target)) await battle.pbShowAbilitySplash(user, true, false);
    user.ability = ability;
    if (user.opposes(target)) await battle.pbReplaceAbilitySplash(user);
    if (Scene.USE_ABILITY_SPLASH) {
      let msg: string | null = null;
      switch (ability) {
        case "MUMMY": msg = _INTL("{1}'s Ability became {2}!", user.pbThis(), user.abilityName()); break;
        case "LINGERINGAROMA": msg = _INTL("A lingering aroma clings to {1}!", user.pbThis(true)); break;
      }
      await battle.pbDisplay(msg!);
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

//===============================================================================
// Wandering Spirit
//===============================================================================
// Adds Ability Shield immunity.
// (Replaced again by ZUD Mechanics' version: see DeluxeAndZUD.ts.)
//-------------------------------------------------------------------------------
AbilityEffects.OnBeingHit.add("WANDERINGSPIRIT", async (_ability: Id, user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.pbContactMove(user)) return;
  if (user.uncopyableAbility()) return;
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

//===============================================================================
// Neutralizing Gas
//===============================================================================
// Adds Ability Shield immunity.
//-------------------------------------------------------------------------------
AbilityEffects.OnSwitchIn.add("NEUTRALIZINGGAS", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler, true);
  await battle.pbHideAbilitySplash(battler);
  await battle.pbDisplay(_INTL("Neutralizing gas filled the area!"));
  for (const b of battle.allBattlers()) {
    if (b.hasActiveItem("ABILITYSHIELD")) {
      // Deliberate fix: Ruby ([000] Ability Handlers.rb:393) reads undefined
      // `target` and `@battle` here (a NameError); b and battle were meant.
      const itemname = Item.get(b.itemId!).name;
      await battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its {2}!", b.pbThis(), itemname));
      continue;
    }
    b.effects[PBEffects.SlowStart] = 0;
    b.effects[PBEffects.Truant] = false;
    if (!b.hasActiveItem(["CHOICEBAND", "CHOICESPECS", "CHOICESCARF"])) {
      b.effects[PBEffects.ChoiceBand] = null;
    }
    if (b.effects[PBEffects.Illusion]) {
      b.effects[PBEffects.Illusion] = null;
      if (!b.effects[PBEffects.Transform]) {
        battle.scene.pbChangePokemon(b, b.pokemon!);
        await battle.pbDisplay(_INTL("{1}'s {2} wore off!", b.pbThis(), b.abilityName()));
        battle.pbSetSeen(b);
      }
    }
  }
  battler.abilityId = null;
  const hadUnnerve = battle.pbCheckGlobalAbility("UNNERVE");
  battler.abilityId = "NEUTRALIZINGGAS";
  if (hadUnnerve && !battle.pbCheckGlobalAbility("UNNERVE")) {
    for (const b of battle.allBattlers()) await b.pbItemsOnUnnerveEnding();
  }
});

//===============================================================================
// Intimidate
//===============================================================================
// Targets with Guard Dog don't proc items that are only used when Intimidated.
//-------------------------------------------------------------------------------
AbilityEffects.OnSwitchIn.add("INTIMIDATE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    if (!b.near(battler)) continue;
    let checkItem = true;
    if (b.hasActiveAbility(["CONTRARY", "GUARDDOG"])) {
      if (b.statStageAtMax("ATTACK")) checkItem = false;
    } else if (b.statStageAtMin("ATTACK")) {
      checkItem = false;
    }
    const checkAbility = await b.pbLowerAttackStatStageIntimidate(battler);
    if (checkAbility) await b.pbAbilitiesOnIntimidated();
    if (checkItem) await b.pbItemOnIntimidatedCheck();
  }
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// Anger Point
//===============================================================================
// Allows Mirror Herb/Opportunist to copy the stat boosts granted by this ability.
//-------------------------------------------------------------------------------
AbilityEffects.OnBeingHit.add("ANGERPOINT", async (_ability: Id, _user: Battler, target: Battler, _move: Move, battle: Battle) => {
  if (!target.damageState.critical) return;
  if (!await target.pbCanRaiseStatStage("ATTACK", target)) return;
  await battle.pbShowAbilitySplash(target);
  target.stages.ATTACK = 6;
  target.addSideStatUps("ATTACK", 6);
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

//===============================================================================
// Dauntless Shield
//===============================================================================
// Adds once-per-battle check.
//-------------------------------------------------------------------------------
AbilityEffects.OnSwitchIn.add("DAUNTLESSSHIELD", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9 && battler.abilityTriggered()) return;
  await battler.pbRaiseStatStageByAbility("DEFENSE", 1, battler);
  battle.pbSetAbilityTrigger(battler);
});

//===============================================================================
// Intrepid Sword
//===============================================================================
// Adds once-per-battle check.
//-------------------------------------------------------------------------------
AbilityEffects.OnSwitchIn.add("INTREPIDSWORD", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9 && battler.abilityTriggered()) return;
  await battler.pbRaiseStatStageByAbility("ATTACK", 1, battler);
  battle.pbSetAbilityTrigger(battler);
});

//===============================================================================
// Protean, Libero
//===============================================================================
// Gen 9+ version that only triggers once per switch-in.
//-------------------------------------------------------------------------------
AbilityEffects.OnTypeChange.add("PROTEAN", (ability: Id, battler: Battler, type: Id) => {
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME < 9) return;
  if (Type.get(type).pseudoType) return;
  battler.effects[PBEffects.Protean] = ability;
});

AbilityEffects.OnTypeChange.copy("PROTEAN", "LIBERO");

//===============================================================================
// Battle Bond
//===============================================================================
// Gen 9+ version that boosts stats instead of becoming Ash-Greninja.
//-------------------------------------------------------------------------------
AbilityEffects.OnEndOfUsingMove.add("BATTLEBOND", async (_ability: Id, user: Battler, targets: Battler[], _move: Move, battle: Battle) => {
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME < 9) return;
  if (user.fainted() || battle.pbAllFainted(user.idxOpposingSide())) return;
  if (!user.isSpecies("GRENINJA") || user.effects[PBEffects.Transform]) return;
  if (battle.battleBond[user.index & 1]![user.pokemonIndex]) return;
  let numFainted = 0;
  for (const b of targets) if (b.damageState.fainted) numFainted += 1;
  if (numFainted === 0) return;
  await battle.pbShowAbilitySplash(user);
  battle.battleBond[user.index & 1]![user.pokemonIndex] = true;
  await battle.pbDisplay(_INTL("{1} became fully charged due to its bond with its Trainer!", user.pbThis()));
  await battle.pbHideAbilitySplash(user);
  let showAnim = true;
  for (const stat of ["ATTACK", "SPECIAL_ATTACK", "SPEED"]) {
    if (!await user.pbCanRaiseStatStage(stat, user)) continue;
    if (await user.pbRaiseStatStage(stat, 1, user, showAnim)) showAnim = false;
  }
  if (showAnim) await battle.pbDisplay(_INTL("{1}'s stats won't go any higher!", user.pbThis()));
});

//===============================================================================
// Illuminate
//===============================================================================
// Gen 9+ version that prevent loss of accuracy.
//-------------------------------------------------------------------------------
AbilityEffects.StatLossImmunity.add("ILLUMINATE", async (_ability: Id, battler: Battler, stat: Id, battle: Battle, showMessages: boolean) => {
  if (stat !== "ACCURACY" || Settings.MECHANICS_GENERATION_AT_RUNTIME < 9) return false;
  if (showMessages) {
    await battle.pbShowAbilitySplash(battler);
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s {2} cannot be lowered!", battler.pbThis(), Stat.get(stat).name));
    } else {
      await battle.pbDisplay(_INTL("{1}'s {2} prevents {3} loss!", battler.pbThis(),
        battler.abilityName(), Stat.get(stat).name));
    }
    await battle.pbHideAbilitySplash(battler);
  }
  return true;
});
