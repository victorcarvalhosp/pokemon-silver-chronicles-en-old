// Port of Data/Scripts/011_Battle/006_Other battle code/010_Battle_PokeBallEffects.rb
// (the Battle::PokeBallEffects module, its handler hashes and every handler), with:
// - v20.1 Hotfixes (Battle bug fixes.rb:12): HEAVYBALL re-registered (same code as below).
// - Generation 9 Pack ([004] Items/[001] New Item Handlers.rb:79-139): the Hisuian Poké Balls
//   (ModifyCatchRate) and ORIGINBALL (IsUnconditional).

import type { Id } from "../../data/gameData/gameData";
import { EncounterType } from "../../data/gameData/encounterType";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import { ItemHandlerHash } from "../../game/items/ItemHandlers";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";

type IsUnconditionalHandler = (ball: Id, battle: Battle, battler: Battler) => boolean | null | undefined;
type ModifyCatchRateHandler = (ball: Id, catchRate: number, battle: Battle, battler: Battler) => number | null | undefined;
type OnCatchHandler = (ball: Id, battle: Battle, pkmn: Pokemon) => unknown;
type OnFailCatchHandler = (ball: Id, battle: Battle, battler: Battler) => unknown;

//===============================================================================
//
//===============================================================================
export const PokeBallEffects = {
  IsUnconditional: new ItemHandlerHash<IsUnconditionalHandler>(),
  ModifyCatchRate: new ItemHandlerHash<ModifyCatchRateHandler>(),
  OnCatch: new ItemHandlerHash<OnCatchHandler>(),
  OnFailCatch: new ItemHandlerHash<OnFailCatchHandler>(),

  /** isUnconditional? */
  isUnconditional(ball: Id, battle: Battle, battler: Battler): boolean {
    const ret = PokeBallEffects.IsUnconditional.trigger(ball, battle, battler);
    return ret != null ? ret : false;
  },

  modifyCatchRate(ball: Id, catchRate: number, battle: Battle, battler: Battler): number {
    const ret = PokeBallEffects.ModifyCatchRate.trigger(ball, catchRate, battle, battler);
    return ret != null ? ret : catchRate;
  },

  onCatch(ball: Id, battle: Battle, pkmn: Pokemon): void {
    PokeBallEffects.OnCatch.trigger(ball, battle, pkmn);
  },

  onFailCatch(ball: Id, battle: Battle, battler: Battler): void {
    G.stats.failedPokeBallCount += 1;
    PokeBallEffects.OnFailCatch.trigger(ball, battle, battler);
  },
};

//===============================================================================
// IsUnconditional
//===============================================================================
PokeBallEffects.IsUnconditional.add("MASTERBALL", () => true);

//===============================================================================
// ModifyCatchRate
// NOTE: This code is not called if the battler is an Ultra Beast (except if the
//       Ball is a Beast Ball). In this case, all Balls' catch rates are set
//       elsewhere to 0.1x.
//===============================================================================
PokeBallEffects.ModifyCatchRate.add("GREATBALL", (_ball, catchRate) => catchRate * 1.5);

PokeBallEffects.ModifyCatchRate.add("ULTRABALL", (_ball, catchRate) => catchRate * 2);

PokeBallEffects.ModifyCatchRate.add("SAFARIBALL", (_ball, catchRate) => catchRate * 1.5);

PokeBallEffects.ModifyCatchRate.add("NETBALL", (_ball, catchRate, _battle, battler) => {
  const multiplier = Settings.NEW_POKE_BALL_CATCH_RATES ? 3.5 : 3;
  if (battler.pbHasType("BUG") || battler.pbHasType("WATER")) catchRate *= multiplier;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("DIVEBALL", (_ball, catchRate, battle) => {
  if (battle.environment === "Underwater") catchRate *= 3.5;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("NESTBALL", (_ball, catchRate, _battle, battler) => {
  if (battler.level <= 30) {
    catchRate *= Math.max((41 - battler.level) / 10.0, 1);
  }
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("REPEATBALL", (_ball, catchRate, battle, battler) => {
  const multiplier = Settings.NEW_POKE_BALL_CATCH_RATES ? 3.5 : 3;
  if (battle.pbPlayer().owned(battler.species)) catchRate *= multiplier;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("TIMERBALL", (_ball, catchRate, battle) => {
  const multiplier = Math.min(1 + (0.3 * battle.turnCount), 4);
  catchRate *= multiplier;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("DUSKBALL", (_ball, catchRate, battle) => {
  const multiplier = Settings.NEW_POKE_BALL_CATCH_RATES ? 3 : 3.5;
  if (battle.time === 2) catchRate *= multiplier; // Night or in cave
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("QUICKBALL", (_ball, catchRate, battle) => {
  if (battle.turnCount === 0) catchRate *= 5;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("FASTBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  if (baseSpeed >= 100) catchRate *= 4;
  return Math.min(catchRate, 255);
});

PokeBallEffects.ModifyCatchRate.add("LEVELBALL", (_ball, catchRate, battle, battler) => {
  let maxlevel = 0;
  for (const b of battle.allSameSideBattlers()) if (b.level > maxlevel) maxlevel = b.level;
  if (maxlevel >= battler.level * 4) {
    catchRate *= 8;
  } else if (maxlevel >= battler.level * 2) {
    catchRate *= 4;
  } else if (maxlevel > battler.level) {
    catchRate *= 2;
  }
  return Math.min(catchRate, 255);
});

PokeBallEffects.ModifyCatchRate.add("LUREBALL", (_ball, catchRate) => {
  const multiplier = Settings.NEW_POKE_BALL_CATCH_RATES ? 5 : 3;
  // NOTE: Like Ruby, this fails if $game_temp.encounter_type is nil (a battle
  //       that didn't come from an encounter table).
  const encounterType = (G.gameTemp as unknown as { encounterType?: Id | null }).encounterType;
  if (EncounterType.get(encounterType as Id).type === "fishing") catchRate *= multiplier;
  return Math.min(catchRate, 255);
});

// v20.1 Hotfixes (Battle bug fixes.rb:12) registers this same handler again.
PokeBallEffects.ModifyCatchRate.add("HEAVYBALL", (_ball, catchRate, _battle, battler) => {
  if (catchRate === 0) return 0;
  const weight = battler.pbWeight();
  if (Settings.NEW_POKE_BALL_CATCH_RATES) {
    if (weight >= 3000) {
      catchRate += 30;
    } else if (weight >= 2000) {
      catchRate += 20;
    } else if (weight < 1000) {
      catchRate -= 20;
    }
  } else {
    if (weight >= 4096) {
      catchRate += 40;
    } else if (weight >= 3072) {
      catchRate += 30;
    } else if (weight >= 2048) {
      catchRate += 20;
    } else {
      catchRate -= 20;
    }
  }
  return Math.min(Math.max(catchRate, 1), 255); // catchRate.clamp(1, 255)
});

PokeBallEffects.ModifyCatchRate.add("LOVEBALL", (_ball, catchRate, battle, battler) => {
  for (const b of battle.allSameSideBattlers()) {
    if (b.species !== battler.species) continue;
    if (b.gender() === battler.gender() || b.gender() === 2 || battler.gender() === 2) continue;
    catchRate *= 8;
    break;
  }
  return Math.min(catchRate, 255);
});

PokeBallEffects.ModifyCatchRate.add("MOONBALL", (_ball, catchRate, _battle, battler) => {
  // NOTE: Moon Ball cares about whether any species in the target's evolutionary
  //       family can evolve with the Moon Stone, not whether the target itself
  //       can immediately evolve with the Moon Stone.
  const moonStone = Item.tryGet("MOONSTONE");
  if (moonStone && battler.pokemon!.speciesData().familyItemEvolutionsUseItem(moonStone.id)) {
    catchRate *= 4;
  }
  return Math.min(catchRate, 255);
});

PokeBallEffects.ModifyCatchRate.add("SPORTBALL", (_ball, catchRate) => catchRate * 1.5);

PokeBallEffects.ModifyCatchRate.add("DREAMBALL", (_ball, catchRate, _battle, battler) => {
  if (battler.asleep()) catchRate *= 4;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("BEASTBALL", (_ball, catchRate, _battle, battler) => {
  if (battler.pokemon!.speciesData().hasFlag("UltraBeast")) {
    catchRate *= 5;
  } else {
    catchRate = Math.floor(catchRate / 10); // Integer catch rate: integer division
  }
  return catchRate;
});

//===============================================================================
// Generation 9 Pack ([004] Items/[001] New Item Handlers.rb:79): new Poké Ball handlers.
//===============================================================================
PokeBallEffects.ModifyCatchRate.add("HISUIANPOKEBALL", (_ball, catchRate) => catchRate * 0.75);

PokeBallEffects.ModifyCatchRate.add("HISUIANGREATBALL", (_ball, catchRate) => catchRate * 1.5);

PokeBallEffects.ModifyCatchRate.add("HISUIANULTRABALL", (_ball, catchRate) => catchRate * 2.25);

PokeBallEffects.ModifyCatchRate.add("HISUIANHEAVYBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  if (baseSpeed <= 50) catchRate *= 1.25;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("LEADENBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  catchRate *= baseSpeed <= 50 ? 2 : 1.25;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("GIGATONBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  catchRate *= baseSpeed <= 50 ? 2.75 : 2;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("FEATHERBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  if (battler.airborne() || baseSpeed >= 100) catchRate *= 1.25;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("WINGBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  catchRate *= battler.airborne() || baseSpeed >= 100 ? 2 : 1.25;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("JETBALL", (_ball, catchRate, _battle, battler) => {
  const baseStats = battler.pokemon!.baseStats();
  const baseSpeed = baseStats.SPEED!;
  catchRate *= battler.airborne() || baseSpeed >= 100 ? 2.75 : 2;
  return catchRate;
});

PokeBallEffects.ModifyCatchRate.add("STRANGEBALL", (_ball, catchRate) => catchRate);

PokeBallEffects.IsUnconditional.add("ORIGINBALL", (_ball, _battle, battler) =>
  ["DIALGA", "PALKIA", "GIRATINA"].includes(battler.species) && battler.form === 1);

//===============================================================================
// OnCatch
//===============================================================================
PokeBallEffects.OnCatch.add("HEALBALL", (_ball, _battle, pkmn) => {
  pkmn.heal();
});

PokeBallEffects.OnCatch.add("FRIENDBALL", (_ball, _battle, pkmn) => {
  pkmn.happiness = 200;
});
