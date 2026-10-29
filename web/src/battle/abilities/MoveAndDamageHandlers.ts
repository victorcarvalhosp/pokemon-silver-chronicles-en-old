// Port of Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb
// (lines 874-1659): the MoveBlocking, MoveImmunity, ModifyMoveBaseType,
// AccuracyCalcFromUser/Ally/Target, DamageCalcFromUser/Ally/Target/
// TargetNonIgnorable/TargetAlly and CriticalCalcFromUser/Target handlers.
//
// Only the MoveImmunity handlers are async (they show the ability splash and
// messages); the others run during move priority/accuracy/damage calculation
// and are synchronous. The multiplier hashes use Ruby's symbol names as keys
// (mults.base_damage_multiplier, mods.evasion_stage, ...); their values start
// as Floats in Ruby, so the multiplications/divisions here are float ops.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { type AccuracyModifiers, AbilityEffects, type DamageMultipliers } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";

//===============================================================================
// MoveBlocking handlers
//===============================================================================

AbilityEffects.MoveBlocking.add("DAZZLING",
  (_ability: Id, bearer: Battler, user: Battler, targets: Battler[], _move: Move, battle: Battle) => {
    // @battle.choices[idx][4]: the move priority saved by pbCalculatePriority
    if ((battle.choices[user.index]![4] as number) <= 0) return false;
    if (!bearer.opposes(user)) return false;
    let ret = false;
    for (const b of targets) {
      if (!b.opposes(user)) continue;
      ret = true;
    }
    return ret;
  },
);

AbilityEffects.MoveBlocking.copy("DAZZLING", "QUEENLYMAJESTY");

//===============================================================================
// MoveImmunity handlers
//===============================================================================

AbilityEffects.MoveImmunity.add("BULLETPROOF",
  async (_ability: Id, _user: Battler, target: Battler, move: Move, _type: Id, battle: Battle, showMessage: boolean) => {
    if (!move.bombMove()) return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} made {3} ineffective!",
          target.pbThis(), target.abilityName(), move.name));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  },
);

AbilityEffects.MoveImmunity.add("FLASHFIRE",
  async (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, battle: Battle, showMessage: boolean) => {
    if (user.index === target.index) return false;
    if (type !== "FIRE") return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (!target.effects[PBEffects.FlashFire]) {
        target.effects[PBEffects.FlashFire] = true;
        if (Scene.USE_ABILITY_SPLASH) {
          await battle.pbDisplay(_INTL("The power of {1}'s Fire-type moves rose!", target.pbThis(true)));
        } else {
          await battle.pbDisplay(_INTL("The power of {1}'s Fire-type moves rose because of its {2}!",
            target.pbThis(true), target.abilityName()));
        }
      } else if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} made {3} ineffective!",
          target.pbThis(), target.abilityName(), move.name));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  },
);

AbilityEffects.MoveImmunity.add("LIGHTNINGROD",
  (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) =>
    target.pbMoveImmunityStatRaisingAbility(user, move, type, "ELECTRIC", "SPECIAL_ATTACK", 1, showMessage),
);

AbilityEffects.MoveImmunity.add("MOTORDRIVE",
  (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) =>
    target.pbMoveImmunityStatRaisingAbility(user, move, type, "ELECTRIC", "SPEED", 1, showMessage),
);

AbilityEffects.MoveImmunity.add("SAPSIPPER",
  (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) =>
    target.pbMoveImmunityStatRaisingAbility(user, move, type, "GRASS", "ATTACK", 1, showMessage),
);

AbilityEffects.MoveImmunity.add("SOUNDPROOF",
  async (_ability: Id, user: Battler, target: Battler, move: Move, _type: Id, battle: Battle, showMessage: boolean) => {
    if (!move.soundMove()) return false;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8 && user.index === target.index) return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} blocks {3}!", target.pbThis(), target.abilityName(), move.name));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  },
);

AbilityEffects.MoveImmunity.add("STORMDRAIN",
  (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) =>
    target.pbMoveImmunityStatRaisingAbility(user, move, type, "WATER", "SPECIAL_ATTACK", 1, showMessage),
);

AbilityEffects.MoveImmunity.add("TELEPATHY",
  async (_ability: Id, user: Battler, target: Battler, move: Move, _type: Id, battle: Battle, showMessage: boolean) => {
    if (move.statusMove()) return false;
    if (user.index === target.index || target.opposes(user)) return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1} avoids attacks by its ally Pokémon!", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1} avoids attacks by its ally Pokémon with {2}!",
          target.pbThis(), target.abilityName()));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  },
);

AbilityEffects.MoveImmunity.add("VOLTABSORB",
  (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) =>
    target.pbMoveImmunityHealingAbility(user, move, type, "ELECTRIC", showMessage),
);

AbilityEffects.MoveImmunity.add("WATERABSORB",
  (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) =>
    target.pbMoveImmunityHealingAbility(user, move, type, "WATER", showMessage),
);

AbilityEffects.MoveImmunity.copy("WATERABSORB", "DRYSKIN");

AbilityEffects.MoveImmunity.add("WONDERGUARD",
  async (_ability: Id, _user: Battler, target: Battler, move: Move, type: Id, battle: Battle, showMessage: boolean) => {
    if (move.statusMove()) return false;
    if (!type || Effectiveness.superEffective(target.damageState.typeMod)) return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1} avoided damage with {2}!", target.pbThis(), target.abilityName()));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  },
);

//===============================================================================
// ModifyMoveBaseType handlers
//===============================================================================

AbilityEffects.ModifyMoveBaseType.add("AERILATE", (_ability: Id, _user: Battler, move: Move, type: Id) => {
  if (type !== "NORMAL" || !Type.exists("FLYING")) return undefined;
  move.powerBoost = true;
  return "FLYING";
});

AbilityEffects.ModifyMoveBaseType.add("GALVANIZE", (_ability: Id, _user: Battler, move: Move, type: Id) => {
  if (type !== "NORMAL" || !Type.exists("ELECTRIC")) return undefined;
  move.powerBoost = true;
  return "ELECTRIC";
});

AbilityEffects.ModifyMoveBaseType.add("LIQUIDVOICE", (_ability: Id, _user: Battler, move: Move, _type: Id) => {
  if (Type.exists("WATER") && move.soundMove()) return "WATER";
  return undefined;
});

AbilityEffects.ModifyMoveBaseType.add("NORMALIZE", (_ability: Id, _user: Battler, move: Move, _type: Id) => {
  if (!Type.exists("NORMAL")) return undefined;
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7) move.powerBoost = true;
  return "NORMAL";
});

AbilityEffects.ModifyMoveBaseType.add("PIXILATE", (_ability: Id, _user: Battler, move: Move, type: Id) => {
  if (type !== "NORMAL" || !Type.exists("FAIRY")) return undefined;
  move.powerBoost = true;
  return "FAIRY";
});

AbilityEffects.ModifyMoveBaseType.add("REFRIGERATE", (_ability: Id, _user: Battler, move: Move, type: Id) => {
  if (type !== "NORMAL" || !Type.exists("ICE")) return undefined;
  move.powerBoost = true;
  return "ICE";
});

//===============================================================================
// AccuracyCalcFromUser handlers
//===============================================================================

type AccuracyHandler = (ability: Id, mods: AccuracyModifiers, user: Battler, target: Battler, move: Move, type: Id) => void;

AbilityEffects.AccuracyCalcFromUser.add("COMPOUNDEYES", ((_a, mods) => {
  mods.accuracy_multiplier! *= 1.3;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromUser.add("HUSTLE", ((_a, mods, _user, _target, move) => {
  if (move.physicalMove()) mods.accuracy_multiplier! *= 0.8;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromUser.add("KEENEYE", ((_a, mods) => {
  if (mods.evasion_stage! > 0 && Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) mods.evasion_stage = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromUser.add("NOGUARD", ((_a, mods) => {
  mods.base_accuracy = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromUser.add("UNAWARE", ((_a, mods, _user, _target, move) => {
  if (move.damagingMove()) mods.evasion_stage = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromUser.add("VICTORYSTAR", ((_a, mods) => {
  mods.accuracy_multiplier! *= 1.1;
}) as AccuracyHandler);

//===============================================================================
// AccuracyCalcFromAlly handlers
//===============================================================================

AbilityEffects.AccuracyCalcFromAlly.add("VICTORYSTAR", ((_a, mods) => {
  mods.accuracy_multiplier! *= 1.1;
}) as AccuracyHandler);

//===============================================================================
// AccuracyCalcFromTarget handlers
//===============================================================================

AbilityEffects.AccuracyCalcFromTarget.add("LIGHTNINGROD", ((_a, mods, _user, _target, _move, type) => {
  if (type === "ELECTRIC") mods.base_accuracy = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("NOGUARD", ((_a, mods) => {
  mods.base_accuracy = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("SANDVEIL", ((_a, mods, _user, target) => {
  if (target.effectiveWeather() === "Sandstorm") mods.evasion_multiplier! *= 1.25;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("SNOWCLOAK", ((_a, mods, _user, target) => {
  if (target.effectiveWeather() === "Hail") mods.evasion_multiplier! *= 1.25;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("STORMDRAIN", ((_a, mods, _user, _target, _move, type) => {
  if (type === "WATER") mods.base_accuracy = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("TANGLEDFEET", ((_a, mods, _user, target) => {
  if (target.effects[PBEffects.Confusion] > 0) mods.accuracy_multiplier! /= 2;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("UNAWARE", ((_a, mods, _user, _target, move) => {
  if (move.damagingMove()) mods.accuracy_stage = 0;
}) as AccuracyHandler);

AbilityEffects.AccuracyCalcFromTarget.add("WONDERSKIN", ((_a, mods, user, target, move) => {
  if (move.statusMove() && user.opposes(target) && mods.base_accuracy! > 50) {
    mods.base_accuracy = 50;
  }
}) as AccuracyHandler);

//===============================================================================
// DamageCalcFromUser handlers
//===============================================================================

type DamageHandler = (ability: Id, user: Battler, target: Battler, move: Move, mults: DamageMultipliers,
  baseDmg: number, type: Id) => void;

AbilityEffects.DamageCalcFromUser.add("AERILATE", ((_a, _user, _target, move, mults) => {
  if (move.powerBoost) mults.base_damage_multiplier! *= 1.2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.copy("AERILATE", "PIXILATE", "REFRIGERATE", "GALVANIZE", "NORMALIZE");

AbilityEffects.DamageCalcFromUser.add("ANALYTIC", ((_a, user, _target, move, mults) => {
  // NOTE: In the official games, if another battler faints earlier in the
  //       round but it would have moved after the user, then Analytic does not
  //       power up the move. However, this makes the determination so much
  //       more complicated (involving pbPriority and counting or not counting
  //       speed/priority modifiers depending on which Generation's mechanics
  //       are being used), so I'm choosing to ignore it. The effect is thus:
  //       "power up the move if all other battlers on the field right now have
  //       already moved".
  // Ruby: move.pbMoveFailedLastInRound?(user, false). That method is async in
  // TS (it can show "But it failed!"), so its check is repeated here (with
  // show_message false it never displays anything).
  const unmoved = move.battle.allBattlers().some((b) =>
    b.index !== user.index &&
    ["UseMove", "Shift"].includes(move.battle.choices[b.index]![0]) &&
    !b.movedThisRound());
  if (!unmoved) {
    mults.base_damage_multiplier! *= 1.3;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("BLAZE", ((_a, user, _target, _move, mults, _baseDmg, type) => {
  if (user.hp <= Math.floor(user.totalhp / 3) && type === "FIRE") {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("DEFEATIST", ((_a, user, _target, _move, mults) => {
  if (user.hp <= Math.floor(user.totalhp / 2)) mults.attack_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("DRAGONSMAW", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "DRAGON") mults.attack_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("FLAREBOOST", ((_a, user, _target, move, mults) => {
  if (user.burned() && move.specialMove()) {
    mults.base_damage_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("FLASHFIRE", ((_a, user, _target, _move, mults, _baseDmg, type) => {
  if (user.effects[PBEffects.FlashFire] && type === "FIRE") {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("FLOWERGIFT", ((_a, user, _target, move, mults) => {
  if (move.physicalMove() && ["Sun", "HarshSun"].includes(user.effectiveWeather())) {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("GORILLATACTICS", ((_a, _user, _target, move, mults) => {
  if (move.physicalMove()) mults.attack_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("GUTS", ((_a, user, _target, move, mults) => {
  if (user.pbHasAnyStatus() && move.physicalMove()) {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("HUGEPOWER", ((_a, _user, _target, move, mults) => {
  if (move.physicalMove()) mults.attack_multiplier! *= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.copy("HUGEPOWER", "PUREPOWER");

AbilityEffects.DamageCalcFromUser.add("HUSTLE", ((_a, _user, _target, move, mults) => {
  if (move.physicalMove()) mults.attack_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("IRONFIST", ((_a, _user, _target, move, mults) => {
  if (move.punchingMove()) mults.base_damage_multiplier! *= 1.2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("MEGALAUNCHER", ((_a, _user, _target, move, mults) => {
  if (move.pulseMove()) mults.base_damage_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("MINUS", ((_a, user, _target, move, mults) => {
  if (!move.specialMove()) return;
  if (user.allAllies().some((b) => b.hasActiveAbility(["MINUS", "PLUS"]))) {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.copy("MINUS", "PLUS");

AbilityEffects.DamageCalcFromUser.add("NEUROFORCE", ((_a, _user, target, _move, mults) => {
  if (Effectiveness.superEffective(target.damageState.typeMod)) {
    mults.final_damage_multiplier! *= 1.25;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("OVERGROW", ((_a, user, _target, _move, mults, _baseDmg, type) => {
  if (user.hp <= Math.floor(user.totalhp / 3) && type === "GRASS") {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("PUNKROCK", ((_a, _user, _target, move, mults) => {
  if (move.soundMove()) mults.attack_multiplier! *= 1.3;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("RECKLESS", ((_a, _user, _target, move, mults) => {
  if (move.recoilMove()) mults.base_damage_multiplier! *= 1.2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("RIVALRY", ((_a, user, target, _move, mults) => {
  if (user.gender() !== 2 && target.gender() !== 2) {
    if (user.gender() === target.gender()) {
      mults.base_damage_multiplier! *= 1.25;
    } else {
      mults.base_damage_multiplier! *= 0.75;
    }
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("SANDFORCE", ((_a, user, _target, _move, mults, _baseDmg, type) => {
  if (user.effectiveWeather() === "Sandstorm" &&
      ["ROCK", "GROUND", "STEEL"].includes(type)) {
    mults.base_damage_multiplier! *= 1.3;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("SHEERFORCE", ((_a, _user, _target, move, mults) => {
  if (move.addlEffect > 0) mults.base_damage_multiplier! *= 1.3;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("SLOWSTART", ((_a, user, _target, move, mults) => {
  if (user.effects[PBEffects.SlowStart] > 0 && move.physicalMove()) mults.attack_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("SOLARPOWER", ((_a, user, _target, move, mults) => {
  if (move.specialMove() && ["Sun", "HarshSun"].includes(user.effectiveWeather())) {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("SNIPER", ((_a, _user, target, _move, mults) => {
  if (target.damageState.critical) {
    mults.final_damage_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("STAKEOUT", ((_a, _user, target, _move, mults) => {
  if (target.battle.choices[target.index]![0] === "SwitchOut") mults.attack_multiplier! *= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("STEELWORKER", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "STEEL") mults.attack_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("STEELYSPIRIT", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "STEEL") mults.final_damage_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("STRONGJAW", ((_a, _user, _target, move, mults) => {
  if (move.bitingMove()) mults.base_damage_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("SWARM", ((_a, user, _target, _move, mults, _baseDmg, type) => {
  if (user.hp <= Math.floor(user.totalhp / 3) && type === "BUG") {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("TECHNICIAN", ((_a, user, target, move, mults, baseDmg) => {
  if (user.index !== target.index && move && move.id !== "STRUGGLE" &&
      baseDmg * mults.base_damage_multiplier! <= 60) {
    mults.base_damage_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("TINTEDLENS", ((_a, _user, target, _move, mults) => {
  if (Effectiveness.resistant(target.damageState.typeMod)) mults.final_damage_multiplier! *= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("TORRENT", ((_a, user, _target, _move, mults, _baseDmg, type) => {
  if (user.hp <= Math.floor(user.totalhp / 3) && type === "WATER") {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("TOUGHCLAWS", ((_a, _user, _target, move, mults) => {
  if (move.contactMove()) mults.base_damage_multiplier! *= 4 / 3.0;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("TOXICBOOST", ((_a, user, _target, move, mults) => {
  if (user.poisoned() && move.physicalMove()) {
    mults.base_damage_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("TRANSISTOR", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "ELECTRIC") mults.attack_multiplier! *= 1.5;
}) as DamageHandler);

AbilityEffects.DamageCalcFromUser.add("WATERBUBBLE", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "WATER") mults.attack_multiplier! *= 2;
}) as DamageHandler);

//===============================================================================
// DamageCalcFromAlly handlers
//===============================================================================

AbilityEffects.DamageCalcFromAlly.add("BATTERY", ((_a, _user, _target, move, mults) => {
  if (!move.specialMove()) return;
  mults.final_damage_multiplier! *= 1.3;
}) as DamageHandler);

AbilityEffects.DamageCalcFromAlly.add("FLOWERGIFT", ((_a, user, _target, move, mults) => {
  if (move.physicalMove() && ["Sun", "HarshSun"].includes(user.effectiveWeather())) {
    mults.attack_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromAlly.add("POWERSPOT", ((_a, _user, _target, _move, mults) => {
  mults.final_damage_multiplier! *= 1.3;
}) as DamageHandler);

AbilityEffects.DamageCalcFromAlly.add("STEELYSPIRIT", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "STEEL") mults.final_damage_multiplier! *= 1.5;
}) as DamageHandler);

//===============================================================================
// DamageCalcFromTarget handlers
//===============================================================================

AbilityEffects.DamageCalcFromTarget.add("DRYSKIN", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "FIRE") mults.base_damage_multiplier! *= 1.25;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("FILTER", ((_a, _user, target, _move, mults) => {
  if (Effectiveness.superEffective(target.damageState.typeMod)) {
    mults.final_damage_multiplier! *= 0.75;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.copy("FILTER", "SOLIDROCK");

AbilityEffects.DamageCalcFromTarget.add("FLOWERGIFT", ((_a, _user, target, move, mults) => {
  if (move.specialMove() && ["Sun", "HarshSun"].includes(target.effectiveWeather())) {
    mults.defense_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("FLUFFY", ((_a, user, _target, move, mults) => {
  if (move.calcType === "FIRE") mults.final_damage_multiplier! *= 2;
  if (move.pbContactMove(user)) mults.final_damage_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("FURCOAT", ((_a, _user, _target, move, mults) => {
  if (move.physicalMove() ||
      move.function === "UseTargetDefenseInsteadOfTargetSpDef") { // Psyshock
    mults.defense_multiplier! *= 2;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("GRASSPELT", ((_a, user, _target, _move, mults) => {
  if (user.battle.field.terrain === "Grassy") {
    mults.defense_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("HEATPROOF", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "FIRE") mults.base_damage_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("ICESCALES", ((_a, _user, _target, move, mults) => {
  if (move.specialMove()) mults.final_damage_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("MARVELSCALE", ((_a, _user, target, move, mults) => {
  if (target.pbHasAnyStatus() && move.physicalMove()) {
    mults.defense_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("MULTISCALE", ((_a, _user, target, _move, mults) => {
  if (target.hp === target.totalhp) mults.final_damage_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("PUNKROCK", ((_a, _user, _target, move, mults) => {
  if (move.soundMove()) mults.final_damage_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("THICKFAT", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (["FIRE", "ICE"].includes(type)) mults.base_damage_multiplier! /= 2;
}) as DamageHandler);

AbilityEffects.DamageCalcFromTarget.add("WATERBUBBLE", ((_a, _user, _target, _move, mults, _baseDmg, type) => {
  if (type === "FIRE") mults.final_damage_multiplier! /= 2;
}) as DamageHandler);

//===============================================================================
// DamageCalcFromTargetNonIgnorable handlers
//===============================================================================

AbilityEffects.DamageCalcFromTargetNonIgnorable.add("PRISMARMOR", ((_a, _user, target, _move, mults) => {
  if (Effectiveness.superEffective(target.damageState.typeMod)) {
    mults.final_damage_multiplier! *= 0.75;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTargetNonIgnorable.add("SHADOWSHIELD", ((_a, _user, target, _move, mults) => {
  if (target.hp === target.totalhp) {
    mults.final_damage_multiplier! /= 2;
  }
}) as DamageHandler);

//===============================================================================
// DamageCalcFromTargetAlly handlers
//===============================================================================

AbilityEffects.DamageCalcFromTargetAlly.add("FLOWERGIFT", ((_a, _user, target, move, mults) => {
  if (move.specialMove() && ["Sun", "HarshSun"].includes(target.effectiveWeather())) {
    mults.defense_multiplier! *= 1.5;
  }
}) as DamageHandler);

AbilityEffects.DamageCalcFromTargetAlly.add("FRIENDGUARD", ((_a, _user, _target, _move, mults) => {
  mults.final_damage_multiplier! *= 0.75;
}) as DamageHandler);

//===============================================================================
// CriticalCalcFromUser handlers
//===============================================================================

AbilityEffects.CriticalCalcFromUser.add("MERCILESS", (_ability: Id, _user: Battler, target: Battler, _c: number) => {
  if (target.poisoned()) return 99;
  return undefined;
});

AbilityEffects.CriticalCalcFromUser.add("SUPERLUCK", (_ability: Id, _user: Battler, _target: Battler, c: number) => {
  return c + 1;
});

//===============================================================================
// CriticalCalcFromTarget handlers
//===============================================================================

AbilityEffects.CriticalCalcFromTarget.add("BATTLEARMOR", (_ability: Id, _user: Battler, _target: Battler, _c: number) => {
  return -1;
});

AbilityEffects.CriticalCalcFromTarget.copy("BATTLEARMOR", "SHELLARMOR");
