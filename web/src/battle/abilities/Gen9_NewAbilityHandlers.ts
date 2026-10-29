// Port of Plugins/Generation 9 Pack Scripts/[003] Abilities/[001] New Ability Handlers.rb
// (all of it): the handlers of the Generation 9 abilities, plus Gen 9 copies of
// older handlers (Armor Tail, Lingering Aroma, Thermal Exchange).
//
// Ruby bugs:
// - Opportunist (line 293): reads an undefined `user` when no stat was raised
//   (a NameError); fixed on purpose to use the battler.
// - Commander (line 362): hides the battler's sprite through
//   battle.scene.sprites, which only the real scene has (Ruby's
//   Battle::DebugSceneNoLogging raises NoMethodError there; here a scene
//   without sprites is skipped).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Stat } from "../../data/gameData/stat";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects, type DamageMultipliers } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";

//################################################################################
//
// New ability handlers.
//
//################################################################################

//===============================================================================
// Armor Tail
//===============================================================================
AbilityEffects.MoveBlocking.copy("DAZZLING", "QUEENLYMAJESTY", "ARMORTAIL");

//===============================================================================
// Rocky Payload
//===============================================================================
AbilityEffects.DamageCalcFromUser.add("ROCKYPAYLOAD",
  (_ability: Id, _user: Battler, _target: Battler, _move: Move, mults: DamageMultipliers, _baseDmg: number, type: Id) => {
    if (type === "ROCK") mults.attack_multiplier! *= 1.5;
  });

//===============================================================================
// Sharpness
//===============================================================================
AbilityEffects.DamageCalcFromUser.add("SHARPNESS",
  (_ability: Id, _user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.slicingMove()) mults.base_damage_multiplier! *= 1.5;
  });

//===============================================================================
// Supreme Overlord
//===============================================================================
AbilityEffects.DamageCalcFromUser.add("SUPREMEOVERLORD",
  (_ability: Id, user: Battler, _target: Battler, _move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    const bonus = user.effects[PBEffects.SupremeOverlord] as number;
    if (bonus <= 0) return;
    mults.base_damage_multiplier! *= (1 + (0.1 * bonus));
  });

AbilityEffects.OnSwitchIn.add("SUPREMEOVERLORD", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  const numFainted = Math.min(5, battler.numFaintedAllies());
  if (numFainted <= 0) return;
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} gained strength from the fallen!", battler.pbThis()));
  battler.effects[PBEffects.SupremeOverlord] = numFainted;
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// Mycelium Might
//===============================================================================
AbilityEffects.PriorityBracketChange.add("MYCELIUMMIGHT", (_ability: Id, battler: Battler, battle: Battle) => {
  const choices = battle.choices[battler.index]!;
  if (choices[0] === "UseMove") {
    if ((choices[2] as Move).statusMove()) return -1;
  }
  return undefined;
});

//===============================================================================
// Purifying Salt
//===============================================================================
AbilityEffects.StatusImmunity.add("PURIFYINGSALT", (_ability: Id, _battler: Battler, _status: Id) => {
  return true;
});

AbilityEffects.DamageCalcFromTarget.add("PURIFYINGSALT",
  (_ability: Id, _user: Battler, _target: Battler, _move: Move, mults: DamageMultipliers, _baseDmg: number, type: Id) => {
    if (type === "GHOST") mults.attack_multiplier! /= 2;
  });

//===============================================================================
// Earth Eater
//===============================================================================
AbilityEffects.MoveImmunity.add("EARTHEATER",
  async (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) => {
    return target.pbMoveImmunityHealingAbility(user, move, type, "GROUND", showMessage);
  });

//===============================================================================
// Good As Gold
//===============================================================================
AbilityEffects.MoveImmunity.add("GOODASGOLD",
  async (_ability: Id, user: Battler, target: Battler, move: Move, _type: Id, battle: Battle, showMessage: boolean) => {
    if (!move.statusMove()) return false;
    if (user.index === target.index) return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} blocks {3}!",
          target.pbThis(), target.abilityName(), move.name));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  });

//===============================================================================
// Well-Baked Body
//===============================================================================
AbilityEffects.MoveImmunity.add("WELLBAKEDBODY",
  async (_ability: Id, user: Battler, target: Battler, move: Move, type: Id, _battle: Battle, showMessage: boolean) => {
    return target.pbMoveImmunityStatRaisingAbility(user, move, type, "FIRE", "DEFENSE", 2, showMessage);
  });

//===============================================================================
// Wind Rider
//===============================================================================
AbilityEffects.MoveImmunity.add("WINDRIDER",
  async (_ability: Id, user: Battler, target: Battler, move: Move, _type: Id, battle: Battle, showMessage: boolean) => {
    if (!move.windMove()) return false;
    if (user.index === target.index) return false;
    if (showMessage) {
      await battle.pbShowAbilitySplash(target);
      if (await target.pbCanRaiseStatStage("ATTACK", user, move)) {
        if (Scene.USE_ABILITY_SPLASH) {
          await target.pbRaiseStatStage("ATTACK", 1, user);
        } else {
          await target.pbRaiseStatStageByCause("ATTACK", 1, user, target.abilityName());
        }
      } else if (Scene.USE_ABILITY_SPLASH) {
        await battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
      } else {
        await battle.pbDisplay(_INTL("{1}'s {2} made {3} ineffective!", target.pbThis(), target.abilityName(), move.name));
      }
      await battle.pbHideAbilitySplash(target);
    }
    return true;
  });

AbilityEffects.OnSwitchIn.add("WINDRIDER", async (_ability: Id, battler: Battler, _battle: Battle, _switchIn: boolean) => {
  if (battler.pbOwnSide().effects[PBEffects.Tailwind] <= 0) return;
  if (!await battler.pbCanRaiseStatStage("ATTACK", battler)) return;
  await battler.pbRaiseStatStageByAbility("ATTACK", 1, battler);
});

//===============================================================================
// Anger Shell
//===============================================================================
AbilityEffects.AfterMoveUseFromTarget.add("ANGERSHELL",
  async (_ability: Id, target: Battler, user: Battler, move: Move, _switchedBattlers: number[], battle: Battle) => {
    if (!move.damagingMove()) return;
    if (!target.droppedBelowHalfHP) return;
    let showAnim = true;
    await battle.pbShowAbilitySplash(target);
    for (const stat of ["ATTACK", "SPECIAL_ATTACK", "SPEED"]) {
      if (!await target.pbCanRaiseStatStage(stat, user, null, true)) continue;
      if (await target.pbRaiseStatStage(stat, 1, user, showAnim)) showAnim = false;
    }
    showAnim = true;
    for (const stat of ["DEFENSE", "SPECIAL_DEFENSE"]) {
      if (!await target.pbCanLowerStatStage(stat, user, null, true)) continue;
      if (await target.pbLowerStatStage(stat, 1, user, showAnim)) showAnim = false;
    }
    await battle.pbHideAbilitySplash(target);
  });

//===============================================================================
// Electromorphosis
//===============================================================================
AbilityEffects.OnBeingHit.add("ELECTROMORPHOSIS", async (_ability: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (target.fainted()) return;
  if (target.effects[PBEffects.Charge] > 0) return;
  await battle.pbShowAbilitySplash(target);
  target.effects[PBEffects.Charge] = 2;
  await battle.pbDisplay(_INTL("Being hit by {1} charged {2} with power!", move.name, target.pbThis(true)));
  await battle.pbHideAbilitySplash(target);
});

//===============================================================================
// Lingering Aroma
//===============================================================================
AbilityEffects.OnBeingHit.copy("MUMMY", "LINGERINGAROMA");

//===============================================================================
// Seed Sower
//===============================================================================
AbilityEffects.OnBeingHit.add("SEEDSOWER", async (_ability: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.damagingMove()) return;
  if (battle.field.terrain === "Grassy") return;
  await battle.pbShowAbilitySplash(target);
  await battle.pbStartTerrain(target, "Grassy");
});

//===============================================================================
// Thermal Exchange
//===============================================================================
AbilityEffects.OnBeingHit.add("THERMALEXCHANGE", async (_ability: Id, _user: Battler, target: Battler, move: Move, _battle: Battle) => {
  if (move.calcType !== "FIRE") return;
  await target.pbRaiseStatStageByAbility("ATTACK", 1, target);
});

AbilityEffects.StatusImmunity.add("THERMALEXCHANGE", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "BURN") return true;
  return undefined;
});

AbilityEffects.StatusCure.copy("WATERVEIL", "WATERBUBBLE", "THERMALEXCHANGE");

//===============================================================================
// Toxic Debris
//===============================================================================
AbilityEffects.OnBeingHit.add("TOXICDEBRIS", async (_ability: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.physicalMove()) return;
  if (target.damageState.substitute) return;
  if (target.pbOpposingSide().effects[PBEffects.ToxicSpikes] >= 2) return;
  await battle.pbShowAbilitySplash(target);
  target.pbOpposingSide().effects[PBEffects.ToxicSpikes] += 1;
  await battle.pbAnimation("TOXICSPIKES", target, target.pbDirectOpposing());
  await battle.pbDisplay(_INTL("Poison spikes were scattered on the ground all around {1}!", target.pbOpposingTeam(true)));
  await battle.pbHideAbilitySplash(target);
});

//===============================================================================
// Wind Power
//===============================================================================
AbilityEffects.OnBeingHit.add("WINDPOWER", async (_ability: Id, _user: Battler, target: Battler, move: Move, battle: Battle) => {
  if (!move.windMove()) return;
  if (target.effects[PBEffects.Charge] > 0) return;
  await battle.pbShowAbilitySplash(target);
  target.effects[PBEffects.Charge] = 2;
  await battle.pbDisplay(_INTL("Being hit by {1} charged {2} with power!", move.name, target.pbThis(true)));
  await battle.pbHideAbilitySplash(target);
});

//===============================================================================
// Cud Chew
//===============================================================================
AbilityEffects.EndOfRoundEffect.add("CUDCHEW", async (_ability: Id, battler: Battler, battle: Battle) => {
  if (battler.item) return;
  if (!battler.recycleItem() || !Item.get(battler.recycleItem()!).isBerry()) return;
  switch (battler.effects[PBEffects.CudChew]) {
    case 0: // End round after eat berry
      battler.effects[PBEffects.CudChew] += 1;
      break;
    default: // next turn after eat berry
      battler.effects[PBEffects.CudChew] = 0;
      await battle.pbShowAbilitySplash(battler, true);
      await battle.pbHideAbilitySplash(battler);
      await battler.pbHeldItemTriggerCheck(battler.recycleItem(), true);
      battler.setRecycleItem(null);
      break;
  }
});

//===============================================================================
// Opportunist
//===============================================================================
AbilityEffects.OnOpposingStatGain.add("OPPORTUNIST",
  async (_ability: Id, battler: Battler, battle: Battle, statUps: Record<Id, number>) => {
    let showAnim = true;
    await battle.pbShowAbilitySplash(battler);
    for (const [stat, increment] of Object.entries(statUps)) {
      if (!await battler.pbCanRaiseStatStage(stat, battler)) continue;
      if (await battler.pbRaiseStatStage(stat, increment, battler, showAnim)) showAnim = false;
    }
    if (showAnim) {
      // Deliberate fix: Ruby ([001] New Ability Handlers.rb:293) reads an
      // undefined `user` here (a NameError); battler was meant.
      await battle.pbDisplay(_INTL("{1}'s stats won't go any higher!", battler.pbThis()));
    }
    await battle.pbHideAbilitySplash(battler);
    await battler.pbItemOpposingStatGainCheck(statUps);
    // Mirror Herb can trigger off this ability.
    if (!showAnim) {
      const opposingStatUps = battle.sideStatUps[battler.idxOwnSide()]!;
      for (const b of battle.allOtherSideBattlers(battler.index)) {
        if (!b || b.fainted()) continue;
        if (b.itemActive()) {
          await b.pbItemOpposingStatGainCheck(opposingStatUps);
        }
      }
      for (const key of Object.keys(opposingStatUps)) delete opposingStatUps[key]; // opposingStatUps.clear
    }
  });

//===============================================================================
// Costar
//===============================================================================
AbilityEffects.OnSwitchIn.add("COSTAR", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  for (const b of battler.allAllies()) {
    if (b.index === battler.index) continue;
    if (!b.hasAlteredStatStages() && b.effects[PBEffects.FocusEnergy] === 0) continue;
    await battle.pbShowAbilitySplash(battler);
    battler.effects[PBEffects.FocusEnergy] = b.effects[PBEffects.FocusEnergy];
    for (const stat of Stat.eachBattle()) battler.stages[stat.id] = b.stages[stat.id]!;
    await battle.pbDisplay(_INTL("{1} copied {2}'s stat changes!", battler.pbThis(), b.pbThis(true)));
    await battle.pbHideAbilitySplash(battler);
    break;
  }
});

//===============================================================================
// Zero To Hero
//===============================================================================
AbilityEffects.OnSwitchIn.add("ZEROTOHERO", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battler.form === 0 || battler.abilityTriggered()) return;
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} underwent a heroic transformation!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
  battle.pbSetAbilityTrigger(battler);
});

AbilityEffects.OnSwitchOut.add("ZEROTOHERO", async (_ability: Id, battler: Battler, endOfBattle: boolean) => {
  if (battler.form === 1 || endOfBattle) return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  await battler.pbChangeForm(1, "");
});

//===============================================================================
// Commander
//===============================================================================
AbilityEffects.OnSwitchIn.add("COMMANDER", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battler.effects[PBEffects.Commander]) return;
  let showAnim = true;
  for (const b of battler.allAllies()) {
    if (!b || !b.near(battler) || b.fainted()) continue;
    if (!b.isSpecies("DONDOZO")) continue;
    if (b.effects[PBEffects.Commander]) continue;
    await battle.pbShowAbilitySplash(battler);
    battle.pbClearChoice(battler.index);
    await battle.pbDisplay(_INTL("{1} goes inside the mouth of {2}!", battler.pbThis(), b.pbThis(true)));
    // Only the real battle scene has sprites (see the header).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprite = (battle.scene as { sprites?: Record<string, any> }).sprites?.[`pokemon_${battler.index}`];
    if (sprite) sprite.visible = false;
    b.effects[PBEffects.Commander] = [battler.index, battler.form];
    battler.effects[PBEffects.Commander] = [b.index];
    for (const stat of ["ATTACK", "DEFENSE", "SPECIAL_ATTACK", "SPECIAL_DEFENSE", "SPEED"]) {
      if (!await b.pbCanRaiseStatStage(stat, b)) continue;
      if (await b.pbRaiseStatStage(stat, 2, b, showAnim)) showAnim = false;
    }
    await battle.pbHideAbilitySplash(battler);
    break;
  }
});

AbilityEffects.MoveImmunity.add("COMMANDER",
  async (_ability: Id, _user: Battler, target: Battler, _move: Move, _type: Id, battle: Battle, showMessage: boolean) => {
    if (!target.isCommander()) return false;
    if (showMessage) await battle.pbDisplay(_INTL("{1} avoided the attack!", target.pbThis()));
    return true;
  });

//===============================================================================
// Tablets of Ruin, Sword of Ruin, Vessel of Ruin, Beads of Ruin
//===============================================================================
AbilityEffects.OnSwitchIn.add("TABLETSOFRUIN", async (ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  let statName: string | null = null;
  switch (ability) {
    case "TABLETSOFRUIN": statName = Stat.get("ATTACK").name; break;
    case "SWORDOFRUIN": statName = Stat.get("DEFENSE").name; break;
    case "VESSELOFRUIN": statName = Stat.get("SPECIAL_ATTACK").name; break;
    case "BEADSOFRUIN": statName = Stat.get("SPECIAL_DEFENSE").name; break;
  }
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1}'s {2} weakened the {3} of all surrounding Pokémon!",
    battler.pbThis(), battler.abilityName(), statName));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.copy("TABLETSOFRUIN", "SWORDOFRUIN", "VESSELOFRUIN", "BEADSOFRUIN");

//===============================================================================
// Orichalcum Pulse
//===============================================================================
AbilityEffects.OnSwitchIn.add("ORICHALCUMPULSE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (["Sun", "HarshSun"].includes(battler.effectiveWeather())) {
    await battle.pbShowAbilitySplash(battler);
    await battle.pbDisplay(_INTL("{1} basked in the sunlight, sending its ancient pulse into a frenzy!", battler.pbThis()));
    await battle.pbHideAbilitySplash(battler);
  } else {
    await battle.pbStartWeatherAbility("Sun", battler);
    await battle.pbDisplay(_INTL("{1} turned the sunlight harsh, sending its ancient pulse into a frenzy!", battler.pbThis()));
  }
});

AbilityEffects.DamageCalcFromUser.add("ORICHALCUMPULSE",
  (_ability: Id, user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.physicalMove() && ["Sun", "HarshSun"].includes(user.effectiveWeather())) mults.attack_multiplier! *= 4 / 3.0;
  });

//===============================================================================
// Hadron Engine
//===============================================================================
AbilityEffects.OnSwitchIn.add("HADRONENGINE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  if (battle.field.terrain === "Electric") {
    await battle.pbDisplay(_INTL("{1} used the Electric Terrain to energize its futuristic engine!", battler.pbThis()));
    await battle.pbHideAbilitySplash(battler);
  } else {
    await battle.pbStartTerrain(battler, "Electric");
    await battle.pbDisplay(_INTL("{1} turned the ground into Electric Terrain, energizing its futuristic engine!", battler.pbThis()));
  }
});

AbilityEffects.DamageCalcFromUser.add("HADRONENGINE",
  (_ability: Id, user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    if (move.specialMove() && user.battle.field.terrain === "Electric") mults.attack_multiplier! *= 4 / 3.0;
  });

//===============================================================================
// Protosynthesis, Quark Drive
//===============================================================================
AbilityEffects.OnSwitchIn.add("PROTOSYNTHESIS", async (ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  let fieldCheck: boolean | null = null;
  switch (ability) {
    case "PROTOSYNTHESIS": fieldCheck = ["Sun", "HarshSun"].includes(battle.field.weather); break;
    case "QUARKDRIVE": fieldCheck = battle.field.terrain === "Electric"; break;
  }
  if (!fieldCheck && !battler.effects[PBEffects.BoosterEnergy] && battler.effects[PBEffects.ParadoxStat]) {
    await battle.pbDisplay(_INTL("The effects of {1}'s {2} wore off!", battler.pbThis(true), battler.abilityName()));
    battler.effects[PBEffects.ParadoxStat] = null;
  }
  if (battler.effects[PBEffects.ParadoxStat]) return;
  if (!fieldCheck && battler.itemId !== "BOOSTERENERGY") return;
  let highestStat: Id | null = null;
  let highestStatVal = 0;
  const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
  const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
  for (const [stat, val] of Object.entries(battler.plainStats())) {
    const stage = battler.stages[stat]! + 6;
    const realStat = Math.floor(val * stageMul[stage]! / stageDiv[stage]!);
    if (realStat > highestStatVal) {
      highestStatVal = realStat;
      highestStat = stat;
    }
  }
  if (highestStat) {
    await battle.pbShowAbilitySplash(battler);
    if (fieldCheck) {
      let cause: string | null = null;
      switch (ability) {
        case "PROTOSYNTHESIS": cause = "harsh sunlight"; break;
        case "QUARKDRIVE": cause = "Electric Terrain"; break;
      }
      await battle.pbDisplay(_INTL(`The ${cause} activated {1}'s {2}!`, battler.pbThis(true), battler.abilityName()));
    } else if (battler.itemId === "BOOSTERENERGY") {
      battler.effects[PBEffects.BoosterEnergy] = true;
      await battle.pbDisplay(_INTL("{1} used its {2} to activate its {3}!", battler.pbThis(), battler.itemName(), battler.abilityName()));
      await battler.pbHeldItemTriggered(battler.item!);
    }
    battler.effects[PBEffects.ParadoxStat] = highestStat;
    await battle.pbDisplay(_INTL("{1}'s {2} was heightened!", battler.pbThis(), Stat.get(highestStat).name));
    await battle.pbHideAbilitySplash(battler);
  }
});

AbilityEffects.OnSwitchIn.copy("PROTOSYNTHESIS", "QUARKDRIVE");

AbilityEffects.OnTerrainChange.add("QUARKDRIVE", async (ability: Id, battler: Battler, battle: Battle, switchIn: boolean) => {
  // (The trigger passes ability_changed as the 4th argument.)
  await AbilityEffects.triggerOnSwitchIn(ability, battler, battle, switchIn);
});

AbilityEffects.DamageCalcFromUser.add("PROTOSYNTHESIS",
  (_ability: Id, user: Battler, _target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    const stat = user.effects[PBEffects.ParadoxStat];
    if (move.physicalMove() && stat === "ATTACK") mults.attack_multiplier! *= 1.3;
    if (move.specialMove() && stat === "SPECIAL_ATTACK") mults.attack_multiplier! *= 1.3;
  });

AbilityEffects.DamageCalcFromUser.copy("PROTOSYNTHESIS", "QUARKDRIVE");

AbilityEffects.DamageCalcFromTarget.add("PROTOSYNTHESIS",
  (_ability: Id, _user: Battler, target: Battler, move: Move, mults: DamageMultipliers, _baseDmg: number, _type: Id) => {
    const stat = target.effects[PBEffects.ParadoxStat];
    if (move.physicalMove() && stat === "DEFENSE") mults.defense_multiplier! *= 1.3;
    if (move.specialMove() && stat === "SPECIAL_DEFENSE") mults.defense_multiplier! *= 1.3;
  });

AbilityEffects.DamageCalcFromTarget.copy("PROTOSYNTHESIS", "QUARKDRIVE");

AbilityEffects.SpeedCalc.add("PROTOSYNTHESIS", (_ability: Id, battler: Battler, mult: number, _ret?: unknown) => {
  if (battler.effects[PBEffects.ParadoxStat] === "SPEED") return mult * 1.5;
  return undefined;
});

AbilityEffects.SpeedCalc.copy("PROTOSYNTHESIS", "QUARKDRIVE");
