// Port of Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb
// (lines 295-873): the SpeedCalc, WeightCalc, OnHPDroppedBelowHalf,
// StatusCheckNonIgnorable, StatusImmunity(NonIgnorable/FromAlly),
// OnStatusInflicted, StatusCure, StatLossImmunity(NonIgnorable/FromAlly),
// OnStatLoss, PriorityChange, PriorityBracketChange, PriorityBracketUse and
// OnFlinch handlers.
//
// SpeedCalc, WeightCalc, StatusCheckNonIgnorable, the StatusImmunity kinds,
// PriorityChange and PriorityBracketChange are synchronous; the others are
// async (see ../other/AbilityEffects.ts). Speed multipliers start as a Float
// (1.0) in Battler#pbSpeed, so they stay floats here; weights are Integers, so
// Light Metal's halving is an integer division.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { pbSEPlay } from "../audio";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";

//===============================================================================
// SpeedCalc handlers
//===============================================================================

AbilityEffects.SpeedCalc.add("CHLOROPHYLL", (_ability: Id, battler: Battler, mult: number) => {
  if (["Sun", "HarshSun"].includes(battler.effectiveWeather())) return mult * 2;
});

AbilityEffects.SpeedCalc.add("QUICKFEET", (_ability: Id, battler: Battler, mult: number) => {
  if (battler.pbHasAnyStatus()) return mult * 1.5;
});

AbilityEffects.SpeedCalc.add("SANDRUSH", (_ability: Id, battler: Battler, mult: number) => {
  if (["Sandstorm"].includes(battler.effectiveWeather())) return mult * 2;
});

AbilityEffects.SpeedCalc.add("SLOWSTART", (_ability: Id, battler: Battler, mult: number) => {
  if (battler.effects[PBEffects.SlowStart] > 0) return mult / 2;
});

AbilityEffects.SpeedCalc.add("SLUSHRUSH", (_ability: Id, battler: Battler, mult: number) => {
  if (["Hail"].includes(battler.effectiveWeather())) return mult * 2;
});

AbilityEffects.SpeedCalc.add("SURGESURFER", (_ability: Id, battler: Battler, mult: number) => {
  if (battler.battle.field.terrain === "Electric") return mult * 2;
});

AbilityEffects.SpeedCalc.add("SWIFTSWIM", (_ability: Id, battler: Battler, mult: number) => {
  if (["Rain", "HeavyRain"].includes(battler.effectiveWeather())) return mult * 2;
});

AbilityEffects.SpeedCalc.add("UNBURDEN", (_ability: Id, battler: Battler, mult: number) => {
  if (battler.effects[PBEffects.Unburden] && !battler.item) return mult * 2;
});

//===============================================================================
// WeightCalcy handlers
//===============================================================================

AbilityEffects.WeightCalc.add("HEAVYMETAL", (_ability: Id, _battler: Battler, w: number) => {
  return w * 2;
});

AbilityEffects.WeightCalc.add("LIGHTMETAL", (_ability: Id, _battler: Battler, w: number) => {
  return Math.max(Math.floor(w / 2), 1);
});

//===============================================================================
// OnHPDroppedBelowHalf handlers
//===============================================================================

AbilityEffects.OnHPDroppedBelowHalf.add("EMERGENCYEXIT",
  async (_ability: Id, battler: Battler, moveUser: Battler | null, battle: Battle) => {
    if (battler.effects[PBEffects.SkyDrop] >= 0 ||
        battler.inTwoTurnAttack("TwoTurnAttackInvulnerableInSkyTargetCannotAct")) return false; // Sky Drop
    // In wild battles
    if (battle.wildBattle()) {
      if (battler.opposes() && battle.pbSideBattlerCount(battler.index) > 1) return false;
      if (!battle.pbCanRun(battler.index)) return false;
      await battle.pbShowAbilitySplash(battler, true);
      await battle.pbHideAbilitySplash(battler);
      pbSEPlay("Battle flee");
      await battle.pbDisplay(_INTL("{1} fled from battle!", battler.pbThis()));
      battle.decision = 3; // Escaped
      return true;
    }
    // In trainer battles
    if (battle.pbAllFainted(battler.idxOpposingSide())) return false;
    if (!battle.pbCanSwitch(battler.index)) return false; // Battler can't switch out
    if (!battle.pbCanChooseNonActive(battler.index)) return false; // No Pokémon can switch in
    await battle.pbShowAbilitySplash(battler, true);
    await battle.pbHideAbilitySplash(battler);
    if (!Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s {2} activated!", battler.pbThis(), battler.abilityName()));
    }
    await battle.pbDisplay(_INTL("{1} went back to {2}!",
      battler.pbThis(), battle.pbGetOwnerName(battler.index)));
    if (battle.endOfRound) { // Just switch out
      if (!battler.fainted()) await battle.scene.pbRecall(battler.index);
      await battler.pbAbilitiesOnSwitchOut(); // Inc. primordial weather check
      return true;
    }
    const newPkmn = await battle.pbGetReplacementPokemonIndex(battler.index); // Owner chooses
    if (newPkmn < 0) return false; // Shouldn't ever do this
    await battle.pbRecallAndReplace(battler.index, newPkmn);
    battle.pbClearChoice(battler.index); // Replacement Pokémon does nothing this round
    if (moveUser && battler.index === moveUser.index) battle.moldBreaker = false;
    await battle.pbOnBattlerEnteringBattle(battler.index);
    return true;
  });

AbilityEffects.OnHPDroppedBelowHalf.copy("EMERGENCYEXIT", "WIMPOUT");

//===============================================================================
// StatusCheckNonIgnorable handlers
//===============================================================================

AbilityEffects.StatusCheckNonIgnorable.add("COMATOSE", (_ability: Id, battler: Battler, status: Id | null) => {
  if (!battler.isSpecies("KOMALA")) return false;
  if (status == null || status === "SLEEP") return true;
});

//===============================================================================
// StatusImmunity handlers
//===============================================================================

AbilityEffects.StatusImmunity.add("FLOWERVEIL", (_ability: Id, battler: Battler, _status: Id) => {
  if (battler.pbHasType("GRASS")) return true;
});

AbilityEffects.StatusImmunity.add("IMMUNITY", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "POISON") return true;
});

AbilityEffects.StatusImmunity.copy("IMMUNITY", "PASTELVEIL");

AbilityEffects.StatusImmunity.add("INSOMNIA", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "SLEEP") return true;
});

AbilityEffects.StatusImmunity.copy("INSOMNIA", "SWEETVEIL", "VITALSPIRIT");

AbilityEffects.StatusImmunity.add("LEAFGUARD", (_ability: Id, battler: Battler, _status: Id) => {
  if (["Sun", "HarshSun"].includes(battler.effectiveWeather())) return true;
});

AbilityEffects.StatusImmunity.add("LIMBER", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "PARALYSIS") return true;
});

AbilityEffects.StatusImmunity.add("MAGMAARMOR", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "FROZEN") return true;
});

AbilityEffects.StatusImmunity.add("WATERVEIL", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "BURN") return true;
});

AbilityEffects.StatusImmunity.copy("WATERVEIL", "WATERBUBBLE");

//===============================================================================
// StatusImmunityNonIgnorable handlers
//===============================================================================

AbilityEffects.StatusImmunityNonIgnorable.add("COMATOSE", (_ability: Id, battler: Battler, _status: Id) => {
  if (battler.isSpecies("KOMALA")) return true;
});

AbilityEffects.StatusImmunityNonIgnorable.add("SHIELDSDOWN", (_ability: Id, battler: Battler, _status: Id) => {
  if (battler.isSpecies("MINIOR") && battler.form < 7) return true;
});

//===============================================================================
// StatusImmunityFromAlly handlers
//===============================================================================

AbilityEffects.StatusImmunityFromAlly.add("FLOWERVEIL", (_ability: Id, battler: Battler, _status: Id) => {
  if (battler.pbHasType("GRASS")) return true;
});

AbilityEffects.StatusImmunityFromAlly.add("SWEETVEIL", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "SLEEP") return true;
});

//===============================================================================
// OnStatusInflicted handlers
//===============================================================================

AbilityEffects.OnStatusInflicted.add("SYNCHRONIZE", async (_ability: Id, battler: Battler, user: Battler | null, status: Id) => {
  if (!user || user.index === battler.index) return;
  switch (status) {
    case "POISON":
      if (user.pbCanPoisonSynchronize(battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        let msg: string | null = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} poisoned {3}!", battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbPoison(null, msg, (battler.statusCount > 0));
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
    case "BURN":
      if (user.pbCanBurnSynchronize(battler)) {
        await battler.battle.pbShowAbilitySplash(battler);
        let msg: string | null = null;
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
        let msg: string | null = null;
        if (!Scene.USE_ABILITY_SPLASH) {
          msg = _INTL("{1}'s {2} paralyzed {3}! It may be unable to move!",
            battler.pbThis(), battler.abilityName(), user.pbThis(true));
        }
        await user.pbParalyze(null, msg);
        await battler.battle.pbHideAbilitySplash(battler);
      }
      break;
  }
});

//===============================================================================
// StatusCure handlers
//===============================================================================

AbilityEffects.StatusCure.add("IMMUNITY", async (_ability: Id, battler: Battler) => {
  if (battler.status !== "POISON") return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battler.battle.pbDisplay(_INTL("{1}'s {2} cured its poisoning!", battler.pbThis(), battler.abilityName()));
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.add("INSOMNIA", async (_ability: Id, battler: Battler) => {
  if (battler.status !== "SLEEP") return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battler.battle.pbDisplay(_INTL("{1}'s {2} woke it up!", battler.pbThis(), battler.abilityName()));
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.copy("INSOMNIA", "VITALSPIRIT");

AbilityEffects.StatusCure.add("LIMBER", async (_ability: Id, battler: Battler) => {
  if (battler.status !== "PARALYSIS") return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battler.battle.pbDisplay(_INTL("{1}'s {2} cured its paralysis!", battler.pbThis(), battler.abilityName()));
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.add("MAGMAARMOR", async (_ability: Id, battler: Battler) => {
  if (battler.status !== "FROZEN") return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battler.battle.pbDisplay(_INTL("{1}'s {2} defrosted it!", battler.pbThis(), battler.abilityName()));
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.add("OBLIVIOUS", async (_ability: Id, battler: Battler) => {
  if (battler.effects[PBEffects.Attract] < 0 &&
      (battler.effects[PBEffects.Taunt] === 0 || Settings.MECHANICS_GENERATION_AT_RUNTIME <= 5)) return;
  await battler.battle.pbShowAbilitySplash(battler);
  if (battler.effects[PBEffects.Attract] >= 0) {
    battler.pbCureAttract();
    if (Scene.USE_ABILITY_SPLASH) {
      await battler.battle.pbDisplay(_INTL("{1} got over its infatuation.", battler.pbThis()));
    } else {
      await battler.battle.pbDisplay(_INTL("{1}'s {2} cured its infatuation status!",
        battler.pbThis(), battler.abilityName()));
    }
  }
  if (battler.effects[PBEffects.Taunt] > 0 && Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
    battler.effects[PBEffects.Taunt] = 0;
    if (Scene.USE_ABILITY_SPLASH) {
      await battler.battle.pbDisplay(_INTL("{1}'s Taunt wore off!", battler.pbThis()));
    } else {
      await battler.battle.pbDisplay(_INTL("{1}'s {2} made its taunt wear off!",
        battler.pbThis(), battler.abilityName()));
    }
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.add("OWNTEMPO", async (_ability: Id, battler: Battler) => {
  if (battler.effects[PBEffects.Confusion] === 0) return;
  await battler.battle.pbShowAbilitySplash(battler);
  battler.pbCureConfusion();
  if (Scene.USE_ABILITY_SPLASH) {
    await battler.battle.pbDisplay(_INTL("{1} snapped out of its confusion.", battler.pbThis()));
  } else {
    await battler.battle.pbDisplay(_INTL("{1}'s {2} snapped it out of its confusion!",
      battler.pbThis(), battler.abilityName()));
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.add("WATERVEIL", async (_ability: Id, battler: Battler) => {
  if (battler.status !== "BURN") return;
  await battler.battle.pbShowAbilitySplash(battler);
  await battler.pbCureStatus(Scene.USE_ABILITY_SPLASH);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battler.battle.pbDisplay(_INTL("{1}'s {2} healed its burn!", battler.pbThis(), battler.abilityName()));
  }
  await battler.battle.pbHideAbilitySplash(battler);
});

AbilityEffects.StatusCure.copy("WATERVEIL", "WATERBUBBLE");

//===============================================================================
// StatLossImmunity handlers
//===============================================================================

AbilityEffects.StatLossImmunity.add("BIGPECKS",
  async (_ability: Id, battler: Battler, stat: Id, battle: Battle, showMessages: boolean) => {
    if (stat !== "DEFENSE") return false;
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

AbilityEffects.StatLossImmunity.add("CLEARBODY",
  async (_ability: Id, battler: Battler, _stat: Id, battle: Battle, showMessages: boolean) => {
    if (showMessages) {
      await battle.pbShowAbilitySplash(battler);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1}'s stats cannot be lowered!", battler.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} prevents stat loss!", battler.pbThis(), battler.abilityName()));
      }
      await battle.pbHideAbilitySplash(battler);
    }
    return true;
  });

AbilityEffects.StatLossImmunity.copy("CLEARBODY", "WHITESMOKE");

AbilityEffects.StatLossImmunity.add("FLOWERVEIL",
  async (_ability: Id, battler: Battler, _stat: Id, battle: Battle, showMessages: boolean) => {
    if (!battler.pbHasType("GRASS")) return false;
    if (showMessages) {
      await battle.pbShowAbilitySplash(battler);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1}'s stats cannot be lowered!", battler.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} prevents stat loss!", battler.pbThis(), battler.abilityName()));
      }
      await battle.pbHideAbilitySplash(battler);
    }
    return true;
  });

AbilityEffects.StatLossImmunity.add("HYPERCUTTER",
  async (_ability: Id, battler: Battler, stat: Id, battle: Battle, showMessages: boolean) => {
    if (stat !== "ATTACK") return false;
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

AbilityEffects.StatLossImmunity.add("KEENEYE",
  async (_ability: Id, battler: Battler, stat: Id, battle: Battle, showMessages: boolean) => {
    if (stat !== "ACCURACY") return false;
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

//===============================================================================
// StatLossImmunityNonIgnorable handlers
//===============================================================================

AbilityEffects.StatLossImmunityNonIgnorable.add("FULLMETALBODY",
  async (_ability: Id, battler: Battler, _stat: Id, battle: Battle, showMessages: boolean) => {
    if (showMessages) {
      await battle.pbShowAbilitySplash(battler);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1}'s stats cannot be lowered!", battler.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} prevents stat loss!", battler.pbThis(), battler.abilityName()));
      }
      await battle.pbHideAbilitySplash(battler);
    }
    return true;
  });

//===============================================================================
// StatLossImmunityFromAlly handlers
//===============================================================================

AbilityEffects.StatLossImmunityFromAlly.add("FLOWERVEIL",
  async (_ability: Id, bearer: Battler, battler: Battler, _stat: Id, battle: Battle, showMessages: boolean) => {
    if (!battler.pbHasType("GRASS")) return false;
    if (showMessages) {
      await battle.pbShowAbilitySplash(bearer);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("{1}'s stats cannot be lowered!", battler.pbThis()));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} prevents {3}'s stat loss!",
          bearer.pbThis(), bearer.abilityName(), battler.pbThis(true)));
      }
      await battle.pbHideAbilitySplash(bearer);
    }
    return true;
  });

//===============================================================================
// OnStatGain handlers
//===============================================================================

// There aren't any!

//===============================================================================
// OnStatLoss handlers
//===============================================================================

AbilityEffects.OnStatLoss.add("COMPETITIVE", async (_ability: Id, battler: Battler, _stat: Id, user: Battler | null) => {
  if (user && !user.opposes(battler)) return;
  await battler.pbRaiseStatStageByAbility("SPECIAL_ATTACK", 2, battler);
});

AbilityEffects.OnStatLoss.add("DEFIANT", async (_ability: Id, battler: Battler, _stat: Id, user: Battler | null) => {
  if (user && !user.opposes(battler)) return;
  await battler.pbRaiseStatStageByAbility("ATTACK", 2, battler);
});

//===============================================================================
// PriorityChange handlers
//===============================================================================

AbilityEffects.PriorityChange.add("GALEWINGS", (_ability: Id, battler: Battler, move: Move, pri: number) => {
  if ((Settings.MECHANICS_GENERATION_AT_RUNTIME <= 6 || battler.hp === battler.totalhp) &&
      move.type === "FLYING") return pri + 1;
});

AbilityEffects.PriorityChange.add("PRANKSTER", (_ability: Id, battler: Battler, move: Move, pri: number) => {
  if (move.statusMove()) {
    battler.effects[PBEffects.Prankster] = true;
    return pri + 1;
  }
});

AbilityEffects.PriorityChange.add("TRIAGE", (_ability: Id, _battler: Battler, move: Move, pri: number) => {
  if (move.healingMove()) return pri + 3;
});

//===============================================================================
// PriorityBracketChange handlers
//===============================================================================

AbilityEffects.PriorityBracketChange.add("QUICKDRAW", (_ability: Id, _battler: Battler, battle: Battle) => {
  if (battle.pbRandom(100) < 30) return 1;
});

AbilityEffects.PriorityBracketChange.add("STALL", (_ability: Id, _battler: Battler, _battle: Battle) => {
  return -1;
});

//===============================================================================
// PriorityBracketUse handlers
//===============================================================================

AbilityEffects.PriorityBracketUse.add("QUICKDRAW", async (_ability: Id, battler: Battler, battle: Battle) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} made {2} move faster!", battler.abilityName(), battler.pbThis(true)));
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// OnFlinch handlers
//===============================================================================

AbilityEffects.OnFlinch.add("STEADFAST", async (_ability: Id, battler: Battler, _battle: Battle) => {
  await battler.pbRaiseStatStageByAbility("SPEED", 1, battler);
});
