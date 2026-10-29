// Port of Data/Scripts/011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb (lines 2544-3208): the
// CertainSwitching, TrappingByTarget, OnSwitchIn, OnSwitchOut, ChangeOnBattlerFainting,
// OnBattlerFainting, OnTerrainChange, OnIntimidated and CertainEscapeFromBattle handlers.
//
// TrappingByTarget and CertainEscapeFromBattle are synchronous triggers (their
// handlers only return a value); the others are async.
//
// Workarounds:
// - Anticipation needs pbHiddenPower (008_MoveEffects_MoveAttributes.rb:1318),
//   which belongs to the move effect files; its type part is replicated here
//   (hiddenPowerType).
// - Battle::Scene#pbChangePokemon is sync in IBattleScene but returns a Promise
//   in the real scene, so it's awaited here.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness, Type } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";

/**
 * pbHiddenPower(pkmn)[0] (008_MoveEffects_MoveAttributes.rb:1318): the type of
 * a Pokémon's Hidden Power, from its IVs.
 */
function hiddenPowerType(pkmn: Pokemon): Id | undefined {
  const iv = pkmn.iv;
  let idxType = 0;
  const byIcon: Id[][] = [];
  for (const t of Type.each()) {
    byIcon[t.iconPosition] ??= [];
    if (!t.pseudoType && !["NORMAL", "SHADOW"].includes(t.id)) byIcon[t.iconPosition]!.push(t.id);
  }
  const types = byIcon.flat().filter((t) => t != null);
  idxType |= (iv.HP! & 1);
  idxType |= (iv.ATTACK! & 1) << 1;
  idxType |= (iv.DEFENSE! & 1) << 2;
  idxType |= (iv.SPEED! & 1) << 3;
  idxType |= (iv.SPECIAL_ATTACK! & 1) << 4;
  idxType |= (iv.SPECIAL_DEFENSE! & 1) << 5;
  idxType = Math.floor((types.length - 1) * idxType / 63);
  return types[idxType];
}

const OHKO_FUNCTIONS = ["OHKO", "OHKOIce", "OHKOHitsUndergroundTarget"];

//===============================================================================
// CertainSwitching handlers
//===============================================================================

// There aren't any!

//===============================================================================
// TrappingByTarget handlers
//===============================================================================

AbilityEffects.TrappingByTarget.add("ARENATRAP", (_ability: Id, switcher: Battler, _bearer: Battler, _battle: Battle) => {
  if (!switcher.airborne()) return true;
  return undefined;
});

AbilityEffects.TrappingByTarget.add("MAGNETPULL", (_ability: Id, switcher: Battler, _bearer: Battler, _battle: Battle) => {
  if (switcher.pbHasType("STEEL")) return true;
  return undefined;
});

AbilityEffects.TrappingByTarget.add("SHADOWTAG", (_ability: Id, switcher: Battler, _bearer: Battler, _battle: Battle) => {
  if (!switcher.hasActiveAbility("SHADOWTAG")) return true;
  return undefined;
});

//===============================================================================
// OnSwitchIn handlers
//===============================================================================

AbilityEffects.OnSwitchIn.add("AIRLOCK", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1} has {2}!", battler.pbThis(), battler.abilityName()));
  }
  await battle.pbDisplay(_INTL("The effects of the weather disappeared."));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.copy("AIRLOCK", "CLOUDNINE");

AbilityEffects.OnSwitchIn.add("ANTICIPATION", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.pbOwnedByPlayer()) return;
  const battlerTypes = battler.pbTypes(true);
  const types = battlerTypes;
  let found = false;
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    // eachMove with Ruby's `next`/`break` (a plain loop over the battler's moves)
    for (const m of b.moves) {
      if (m.statusMove()) continue;
      if (types.length > 0) {
        let moveType = m.type;
        if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6 && m.function === "TypeDependsOnUserIVs") { // Hidden Power
          moveType = hiddenPowerType(b.pokemon!) ?? null;
        }
        const eff = Effectiveness.calculate(moveType!, types[0], types[1], types[2]);
        if (Effectiveness.ineffective(eff)) continue;
        if (!Effectiveness.superEffective(eff) && !OHKO_FUNCTIONS.includes(m.function)) continue;
      } else if (!OHKO_FUNCTIONS.includes(m.function)) {
        continue;
      }
      found = true;
      break;
    }
    if (found) break;
  }
  if (found) {
    await battle.pbShowAbilitySplash(battler);
    await battle.pbDisplay(_INTL("{1} shuddered with anticipation!", battler.pbThis()));
    await battle.pbHideAbilitySplash(battler);
  }
});

AbilityEffects.OnSwitchIn.add("ASONECHILLINGNEIGH", async (ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} has two Abilities!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
  battler.abilityId = "UNNERVE";
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is too nervous to eat Berries!", battler.pbOpposingTeam()));
  await battle.pbHideAbilitySplash(battler);
  battler.abilityId = ability;
});

AbilityEffects.OnSwitchIn.copy("ASONECHILLINGNEIGH", "ASONEGRIMNEIGH");

AbilityEffects.OnSwitchIn.add("AURABREAK", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} reversed all other Pokémon's auras!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("COMATOSE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is drowsing!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("CURIOUSMEDICINE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.allAllies().some((b) => b.hasAlteredStatStages())) return;
  await battle.pbShowAbilitySplash(battler);
  for (const b of battler.allAllies()) {
    if (!b.hasAlteredStatStages()) continue;
    b.pbResetStatStages();
    if (Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s stat changes were removed!", b.pbThis()));
    } else {
      await battle.pbDisplay(_INTL("{1}'s stat changes were removed by {2}'s {3}!",
        b.pbThis(), battler.pbThis(true), battler.abilityName()));
    }
  }
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("DARKAURA", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is radiating a dark aura!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("DAUNTLESSSHIELD", async (_ability: Id, battler: Battler, _battle: Battle, _switchIn: boolean) => {
  await battler.pbRaiseStatStageByAbility("DEFENSE", 1, battler);
});

AbilityEffects.OnSwitchIn.add("DELTASTREAM", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("StrongWinds", battler, true);
});

AbilityEffects.OnSwitchIn.add("DESOLATELAND", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("HarshSun", battler, true);
});

AbilityEffects.OnSwitchIn.add("DOWNLOAD", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  let oDef = 0;
  let oSpDef = 0;
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    oDef += b.defense;
    oSpDef += b.spdef;
  }
  const stat = (oDef < oSpDef) ? "ATTACK" : "SPECIAL_ATTACK";
  await battler.pbRaiseStatStageByAbility(stat, 1, battler);
});

AbilityEffects.OnSwitchIn.add("DRIZZLE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("Rain", battler);
});

AbilityEffects.OnSwitchIn.add("DROUGHT", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("Sun", battler);
});

AbilityEffects.OnSwitchIn.add("ELECTRICSURGE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battle.field.terrain === "Electric") return;
  await battle.pbShowAbilitySplash(battler);
  await battle.pbStartTerrain(battler, "Electric");
  // NOTE: The ability splash is hidden again in def pbStartTerrain.
});

AbilityEffects.OnSwitchIn.add("FAIRYAURA", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is radiating a fairy aura!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("FOREWARN", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.pbOwnedByPlayer()) return;
  let highestPower = 0;
  let forewarnMoves: string[] = [];
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    b.eachMove((m) => {
      let power = m.baseDamage;
      if (OHKO_FUNCTIONS.includes(m.function)) power = 160;
      if (["PowerHigherWithUserHP"].includes(m.function)) power = 150; // Eruption
      // Counter, Mirror Coat, Metal Burst
      if (["CounterPhysicalDamage",
        "CounterSpecialDamage",
        "CounterDamagePlusHalf"].includes(m.function)) power = 120;
      // Sonic Boom, Dragon Rage, Night Shade, Endeavor, Psywave,
      // Return, Frustration, Crush Grip, Gyro Ball, Hidden Power,
      // Natural Gift, Trump Card, Flail, Grass Knot
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
      // Deliberate fix: Ruby (008_Battle_AbilityEffects.rb:2762, ZUD's copy too) also
      // lists "PowerHigherWithUserHP" (Eruption) at 80, overriding its 150.
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

AbilityEffects.OnSwitchIn.add("FRISK", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.pbOwnedByPlayer()) return;
  const foes = battle.allOtherSideBattlers(battler.index).filter((b) => b.item);
  if (foes.length > 0) {
    await battle.pbShowAbilitySplash(battler);
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      for (const b of foes) {
        await battle.pbDisplay(_INTL("{1} frisked {2} and found its {3}!",
          battler.pbThis(), b.pbThis(true), b.itemName()));
      }
    } else {
      const foe = foes[battle.pbRandom(foes.length)]!;
      await battle.pbDisplay(_INTL("{1} frisked the foe and found one {2}!",
        battler.pbThis(), foe.itemName()));
    }
    await battle.pbHideAbilitySplash(battler);
  }
});

AbilityEffects.OnSwitchIn.add("GRASSYSURGE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battle.field.terrain === "Grassy") return;
  await battle.pbShowAbilitySplash(battler);
  await battle.pbStartTerrain(battler, "Grassy");
  // NOTE: The ability splash is hidden again in def pbStartTerrain.
});

AbilityEffects.OnSwitchIn.add("ICEFACE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.isSpecies("EISCUE") || battler.form !== 1) return;
  if (battler.effectiveWeather() !== "Hail") return;
  await battle.pbShowAbilitySplash(battler);
  if (!Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1}'s {2} activated!", battler.pbThis(), battler.abilityName()));
  }
  await battler.pbChangeForm(0, _INTL("{1} transformed!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("IMPOSTER", async (_ability: Id, battler: Battler, battle: Battle, switchIn: boolean) => {
  if (!switchIn || battler.effects[PBEffects.Transform]) return;
  const choice = battler.pbDirectOpposing();
  if (choice.fainted()) return;
  if (choice.effects[PBEffects.Transform] ||
      choice.effects[PBEffects.Illusion] ||
      choice.effects[PBEffects.Substitute] > 0 ||
      choice.effects[PBEffects.SkyDrop] >= 0 ||
      choice.semiInvulnerable()) return;
  await battle.pbShowAbilitySplash(battler, true);
  await battle.pbHideAbilitySplash(battler);
  await battle.pbAnimation("TRANSFORM", battler, choice);
  await battle.scene.pbChangePokemon(battler, choice.pokemon!);
  await battler.pbTransform(choice);
});

AbilityEffects.OnSwitchIn.add("INTIMIDATE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  for (const b of battle.allOtherSideBattlers(battler.index)) {
    if (!b.near(battler)) continue;
    let checkItem = true;
    if (b.hasActiveAbility("CONTRARY")) {
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

AbilityEffects.OnSwitchIn.add("INTREPIDSWORD", async (_ability: Id, battler: Battler, _battle: Battle, _switchIn: boolean) => {
  await battler.pbRaiseStatStageByAbility("ATTACK", 1, battler);
});

AbilityEffects.OnSwitchIn.add("MIMICRY", async (ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battle.field.terrain === "None") return;
  await AbilityEffects.triggerOnTerrainChange(ability, battler, battle, false);
});

AbilityEffects.OnSwitchIn.add("MISTYSURGE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battle.field.terrain === "Misty") return;
  await battle.pbShowAbilitySplash(battler);
  await battle.pbStartTerrain(battler, "Misty");
  // NOTE: The ability splash is hidden again in def pbStartTerrain.
});

AbilityEffects.OnSwitchIn.add("MOLDBREAKER", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} breaks the mold!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("NEUTRALIZINGGAS", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler, true);
  await battle.pbHideAbilitySplash(battler);
  await battle.pbDisplay(_INTL("Neutralizing gas filled the area!"));
  for (const b of battle.allBattlers()) {
    // Slow Start - end all turn counts
    b.effects[PBEffects.SlowStart] = 0;
    // Truant - let b move on its first turn after Neutralizing Gas disappears
    b.effects[PBEffects.Truant] = false;
    // Gorilla Tactics - end choice lock
    if (!b.hasActiveItem(["CHOICEBAND", "CHOICESPECS", "CHOICESCARF"])) {
      b.effects[PBEffects.ChoiceBand] = null;
    }
    // Illusion - end illusions
    if (b.effects[PBEffects.Illusion]) {
      b.effects[PBEffects.Illusion] = null;
      if (!b.effects[PBEffects.Transform]) {
        await battle.scene.pbChangePokemon(b, b.pokemon!);
        await battle.pbDisplay(_INTL("{1}'s {2} wore off!", b.pbThis(), b.abilityName()));
        battle.pbSetSeen(b);
      }
    }
  }
  // Trigger items upon Unnerve being negated
  battler.abilityId = null; // Allows checking if Unnerve was active before
  const hadUnnerve = battle.pbCheckGlobalAbility("UNNERVE");
  battler.abilityId = "NEUTRALIZINGGAS";
  if (hadUnnerve && !battle.pbCheckGlobalAbility("UNNERVE")) {
    for (const b of battle.allBattlers()) await b.pbItemsOnUnnerveEnding();
  }
});

AbilityEffects.OnSwitchIn.add("PASTELVEIL", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (!battler.allAllies().some((b) => b.status === "POISON")) return;
  await battle.pbShowAbilitySplash(battler);
  for (const b of battler.allAllies()) {
    if (b.status !== "POISON") continue;
    await b.pbCureStatus(Scene.USE_ABILITY_SPLASH);
    if (!Scene.USE_ABILITY_SPLASH) {
      await battle.pbDisplay(_INTL("{1}'s {2} cured {3}'s poisoning!",
        battler.pbThis(), battler.abilityName(), b.pbThis(true)));
    }
  }
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("PRESSURE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is exerting its pressure!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("PRIMORDIALSEA", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("HeavyRain", battler, true);
});

AbilityEffects.OnSwitchIn.add("PSYCHICSURGE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battle.field.terrain === "Psychic") return;
  await battle.pbShowAbilitySplash(battler);
  await battle.pbStartTerrain(battler, "Psychic");
  // NOTE: The ability splash is hidden again in def pbStartTerrain.
});

AbilityEffects.OnSwitchIn.add("SANDSTREAM", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("Sandstorm", battler);
});

AbilityEffects.OnSwitchIn.add("SCREENCLEANER", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  if (battler.pbOwnSide().effects[PBEffects.AuroraVeil] === 0 &&
      battler.pbOwnSide().effects[PBEffects.LightScreen] === 0 &&
      battler.pbOwnSide().effects[PBEffects.Reflect] === 0 &&
      battler.pbOpposingSide().effects[PBEffects.AuroraVeil] === 0 &&
      battler.pbOpposingSide().effects[PBEffects.LightScreen] === 0 &&
      battler.pbOpposingSide().effects[PBEffects.Reflect] === 0) return;
  await battle.pbShowAbilitySplash(battler);
  if (battler.pbOpposingSide().effects[PBEffects.AuroraVeil] > 0) {
    battler.pbOpposingSide().effects[PBEffects.AuroraVeil] = 0;
    await battle.pbDisplay(_INTL("{1}'s Aurora Veil wore off!", battler.pbOpposingTeam()));
  }
  if (battler.pbOpposingSide().effects[PBEffects.LightScreen] > 0) {
    battler.pbOpposingSide().effects[PBEffects.LightScreen] = 0;
    await battle.pbDisplay(_INTL("{1}'s Light Screen wore off!", battler.pbOpposingTeam()));
  }
  if (battler.pbOpposingSide().effects[PBEffects.Reflect] > 0) {
    battler.pbOpposingSide().effects[PBEffects.Reflect] = 0;
    await battle.pbDisplay(_INTL("{1}'s Reflect wore off!", battler.pbOpposingTeam()));
  }
  if (battler.pbOwnSide().effects[PBEffects.AuroraVeil] > 0) {
    battler.pbOwnSide().effects[PBEffects.AuroraVeil] = 0;
    await battle.pbDisplay(_INTL("{1}'s Aurora Veil wore off!", battler.pbTeam()));
  }
  if (battler.pbOwnSide().effects[PBEffects.LightScreen] > 0) {
    battler.pbOwnSide().effects[PBEffects.LightScreen] = 0;
    await battle.pbDisplay(_INTL("{1}'s Light Screen wore off!", battler.pbTeam()));
  }
  if (battler.pbOwnSide().effects[PBEffects.Reflect] > 0) {
    battler.pbOwnSide().effects[PBEffects.Reflect] = 0;
    await battle.pbDisplay(_INTL("{1}'s Reflect wore off!", battler.pbTeam()));
  }
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("SLOWSTART", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  battler.effects[PBEffects.SlowStart] = 5;
  if (Scene.USE_ABILITY_SPLASH) {
    await battle.pbDisplay(_INTL("{1} can't get it going!", battler.pbThis()));
  } else {
    await battle.pbDisplay(_INTL("{1} can't get it going because of its {2}!",
      battler.pbThis(), battler.abilityName()));
  }
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("SNOWWARNING", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbStartWeatherAbility("Hail", battler);
});

AbilityEffects.OnSwitchIn.add("TERAVOLT", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is radiating a bursting aura!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("TURBOBLAZE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is radiating a blazing aura!", battler.pbThis()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.OnSwitchIn.add("UNNERVE", async (_ability: Id, battler: Battler, battle: Battle, _switchIn: boolean) => {
  await battle.pbShowAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1} is too nervous to eat Berries!", battler.pbOpposingTeam()));
  await battle.pbHideAbilitySplash(battler);
});

//===============================================================================
// OnSwitchOut handlers
//===============================================================================

AbilityEffects.OnSwitchOut.add("IMMUNITY", (_ability: Id, battler: Battler, _endOfBattle: boolean) => {
  if (battler.status !== "POISON") return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  battler.status = "NONE";
});

AbilityEffects.OnSwitchOut.add("INSOMNIA", (_ability: Id, battler: Battler, _endOfBattle: boolean) => {
  if (battler.status !== "SLEEP") return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  battler.status = "NONE";
});

AbilityEffects.OnSwitchOut.copy("INSOMNIA", "VITALSPIRIT");

AbilityEffects.OnSwitchOut.add("LIMBER", (_ability: Id, battler: Battler, _endOfBattle: boolean) => {
  if (battler.status !== "PARALYSIS") return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  battler.status = "NONE";
});

AbilityEffects.OnSwitchOut.add("MAGMAARMOR", (_ability: Id, battler: Battler, _endOfBattle: boolean) => {
  if (battler.status !== "FROZEN") return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  battler.status = "NONE";
});

AbilityEffects.OnSwitchOut.add("NATURALCURE", (_ability: Id, battler: Battler, _endOfBattle: boolean) => {
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  battler.status = "NONE";
});

AbilityEffects.OnSwitchOut.add("REGENERATOR", async (_ability: Id, battler: Battler, endOfBattle: boolean) => {
  if (endOfBattle) return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  await battler.pbRecoverHP(Math.floor(battler.totalhp / 3), false, false);
});

AbilityEffects.OnSwitchOut.add("WATERVEIL", (_ability: Id, battler: Battler, _endOfBattle: boolean) => {
  if (battler.status !== "BURN") return;
  PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
  battler.status = "NONE";
});

AbilityEffects.OnSwitchOut.copy("WATERVEIL", "WATERBUBBLE");

//===============================================================================
// ChangeOnBattlerFainting handlers
//===============================================================================

AbilityEffects.ChangeOnBattlerFainting.add("POWEROFALCHEMY", async (_ability: Id, battler: Battler, fainted: Battler, battle: Battle) => {
  if (battler.opposes(fainted)) return;
  if (fainted.ungainableAbility() ||
      ["POWEROFALCHEMY", "RECEIVER", "TRACE", "WONDERGUARD"].includes(fainted.abilityId!)) return;
  await battle.pbShowAbilitySplash(battler, true);
  battler.ability = fainted.ability;
  await battle.pbReplaceAbilitySplash(battler);
  await battle.pbDisplay(_INTL("{1}'s {2} was taken over!", fainted.pbThis(), fainted.abilityName()));
  await battle.pbHideAbilitySplash(battler);
});

AbilityEffects.ChangeOnBattlerFainting.copy("POWEROFALCHEMY", "RECEIVER");

//===============================================================================
// OnBattlerFainting handlers
//===============================================================================

AbilityEffects.OnBattlerFainting.add("SOULHEART", async (_ability: Id, battler: Battler, _fainted: Battler, _battle: Battle) => {
  await battler.pbRaiseStatStageByAbility("SPECIAL_ATTACK", 1, battler);
});

//===============================================================================
// OnTerrainChange handlers
//===============================================================================

AbilityEffects.OnTerrainChange.add("MIMICRY", async (_ability: Id, battler: Battler, battle: Battle, _abilityChanged: boolean) => {
  if (battle.field.terrain === "None") {
    // Revert to original typing
    await battle.pbShowAbilitySplash(battler);
    battler.pbResetTypes();
    await battle.pbDisplay(_INTL("{1} changed back to its regular type!", battler.pbThis()));
    await battle.pbHideAbilitySplash(battler);
  } else {
    // Change to new typing
    const terrainHash: Record<string, Id> = {
      Electric: "ELECTRIC",
      Grassy: "GRASS",
      Misty: "FAIRY",
      Psychic: "PSYCHIC",
    };
    let newType: Id | null = terrainHash[battle.field.terrain] ?? null;
    let newTypeName: string | null = null;
    if (newType) {
      const typeData = Type.tryGet(newType);
      if (!typeData) newType = null;
      if (typeData) newTypeName = typeData.name;
    }
    if (newType) {
      await battle.pbShowAbilitySplash(battler);
      battler.pbChangeTypes(newType);
      await battle.pbDisplay(_INTL("{1}'s type changed to {2}!", battler.pbThis(), newTypeName));
      await battle.pbHideAbilitySplash(battler);
    }
  }
});

//===============================================================================
// OnIntimidated handlers
//===============================================================================

AbilityEffects.OnIntimidated.add("RATTLED", async (_ability: Id, battler: Battler, _battle: Battle) => {
  if (Settings.MECHANICS_GENERATION_AT_RUNTIME < 8) return;
  await battler.pbRaiseStatStageByAbility("SPEED", 1, battler);
});

//===============================================================================
// CertainEscapeFromBattle handlers
//===============================================================================

AbilityEffects.CertainEscapeFromBattle.add("RUNAWAY", (_ability: Id, _battler: Battler) => {
  return true;
});
