// Port of Data/Scripts/011_Battle/005_AI/001_Battle_AI.rb, with:
// - Generation 9 Pack ([001] Battle/[003] Battle_AI.rb:16): initialize
//   (@using_item_on_party).
// - Essentials Deluxe ([000] Essentials Patches/Mega Evolution.rb:92):
//   pbEnemyShouldMegaEvolve? (wild Pokémon only if they're flagged as an ace).
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb:374):
//   pbDefaultChooseEnemyCommand (Ultra Burst, Dynamax and custom mechanics).
// - Essentials Deluxe ([001] Plugin Patches/_Custom Placeholder_.rb:41):
//   pbEnemyShouldCustom?.
// - ZUD Mechanics ([003] Battle/Battle_AI.rb:10,29): pbEnemyShouldUltraBurst?,
//   pbEnemyShouldDynamax? (the Z-Move choice is in AI_Move.ts's pbChooseMoves).
//
// The rest of Battle::AI is in the other files of this folder (one per Ruby
// file); ai/AI.ts imports them in load order. Import AI from there.
//
// Async: the methods that can register an action (pbRegisterMove,
// pbAutoFightMenu, ...) or reach a check that is async in the battler
// (pbCanLowerStatStage, pbCanRaiseStatStage, pbCanChooseAnyMove,
// pbCanUseItemOnPokemon, ItemHandlers::CanUseInBattle) are async. They never
// show messages: the AI only uses the silent forms, as Ruby does.
//
// Randomness: pbAIRandom is Ruby's rand(x) (Kernel#rand, not @battle.pbRandom);
// here it goes through battle.pbRandom so that there is one random stream.

import type { Battle } from "../battle/Battle";
import { PBDebug } from "../other/PBDebug";

/**
 * AI skill levels:
 *     0:     Wild Pokémon
 *     1-31:  Basic trainer (young/inexperienced)
 *     32-47: Some skill
 *     48-99: High skill
 *     100+:  Best trainers (Gym Leaders, Elite Four, Champion)
 * NOTE: A trainer's skill value can range from 0-255, but by default only four
 *       distinct skill levels exist. The skill value is typically the same as
 *       the trainer's base money value.
 */
export const PBTrainerAI = {
  // Minimum skill level to be in each AI category.
  minimumSkill(): number { return 1; },
  mediumSkill(): number { return 32; },
  highSkill(): number { return 48; },
  bestSkill(): number { return 100; },
};

/** [move index, score, target index] */
export type AIChoice = [number, number, number];

/** Ruby truthiness: only nil and false are falsy (0 and "" are truthy). */
export function truthy(x: unknown): boolean {
  return x != null && x !== false;
}

export class AI {
  readonly battle: Battle;
  /** Generation 9 Pack: whether the item chosen by pbEnemyItemToUse is for a party Pokémon (a revival item). */
  usingItemOnParty: boolean;

  constructor(battle: Battle) {
    this.battle = battle;
    // Generation 9 Pack
    this.usingItemOnParty = false;
  }

  pbAIRandom(x: number): number { return this.battle.pbRandom(x); }

  pbStdDev(choices: AIChoice[]): number {
    let sum = 0;
    let n = 0;
    for (const c of choices) {
      sum += c[1];
      n += 1;
    }
    if (n < 2) return 0;
    const mean = sum / n;
    let varianceTimesN = 0;
    for (const c of choices) {
      if (c[1] <= 0) continue;
      const deviation = c[1] - mean;
      varianceTimesN += deviation * deviation;
    }
    // Using population standard deviation
    // [(n-1) makes it a sample std dev, would be 0 with only 1 sample]
    return Math.sqrt(varianceTimesN / n);
  }

  //=============================================================================
  // Decide whether the opponent should Mega Evolve their Pokémon
  // (Essentials Deluxe: wild Pokémon only if they're flagged as an ace)
  //=============================================================================
  pbEnemyShouldMegaEvolve(idxBattler: number): boolean {
    if (this.battle.pbScriptedMechanic(idxBattler, "mega")) return false;
    const battler = this.battle.battlers[idxBattler]!;
    const elig = battler.wild() ? battler.ace() : true;
    if (this.battle.pbCanMegaEvolve(idxBattler) && elig) {
      PBDebug.log(`[AI] ${battler.pbThis()} (${idxBattler}) will Mega Evolve`);
      return true;
    }
    return false;
  }

  //=============================================================================
  // ZUD Mechanics: Ultra Burst
  // The AI will immediately use Ultra Burst, if possible.
  //=============================================================================
  pbEnemyShouldUltraBurst(idxBattler: number): boolean {
    if (this.battle.pbScriptedMechanic(idxBattler, "ultra")) return false;
    const battler = this.battle.battlers[idxBattler]!;
    const elig = battler.wild() ? battler.ace() : true;
    if (this.battle.pbCanUltraBurst(idxBattler) && elig) {
      PBDebug.log(`[AI] ${battler.pbThis()} (${idxBattler}) will Ultra Burst`);
      return true;
    }
    return false;
  }

  //=============================================================================
  // ZUD Mechanics: Dynamax
  // The AI will only Dynamax their last Pokemon that is entered in their lineup,
  // as listed in their PBS data. However, if an earlier Pokemon in their lineup
  // is flagged as an ace, they will Dynamax that one instead. The AI will
  // immediately Dynamax whichever Pokemon is on the field first.
  //=============================================================================
  pbEnemyShouldDynamax(idxBattler: number): boolean {
    if (this.battle.pbScriptedMechanic(idxBattler, "dynamax")) return false;
    const battler = this.battle.battlers[idxBattler]!;
    const ace = battler.wild() ? battler.ace() : (battler.ace() || this.battle.pbAbleCount(idxBattler) === 1);
    if (this.battle.pbCanDynamax(idxBattler) && ace) {
      if (!this.battle.pbOwnedByPlayer(idxBattler)) battler.displayPowerMoves("Max Move");
      PBDebug.log(`[AI] ${battler.pbThis()} (${idxBattler}) will Dynamax`);
      return true;
    }
    return false;
  }

  /** Essentials Deluxe: placeholder for a custom battle mechanic. */
  pbEnemyShouldCustom(_idxBattler: number): boolean { return false; }

  //=============================================================================
  // Choose an action (Essentials Deluxe's version)
  //=============================================================================
  async pbDefaultChooseEnemyCommand(idxBattler: number): Promise<void> {
    if (await this.pbEnemyShouldUseItem(idxBattler)) return;
    if (await this.pbEnemyShouldWithdraw(idxBattler)) return;
    if (await this.battle.pbAutoFightMenu(idxBattler)) return;
    if (this.pbEnemyShouldMegaEvolve(idxBattler)) this.battle.pbRegisterMegaEvolution(idxBattler);
    // PluginManager.installed?("ZUD Mechanics")
    if (this.pbEnemyShouldUltraBurst(idxBattler)) this.battle.pbRegisterUltraBurst(idxBattler);
    if (this.pbEnemyShouldDynamax(idxBattler)) this.battle.pbRegisterDynamax(idxBattler);
    // "Terastal Phenomenon", "Pokémon Birthsigns" and "Focus Meter System"
    // aren't installed.
    if (!this.battle.pbScriptedMechanic(idxBattler, "custom") && this.pbEnemyShouldCustom(idxBattler)) {
      this.battle.pbRegisterCustom(idxBattler);
    }
    await this.pbChooseMoves(idxBattler);
    // "PLA Battle Styles" isn't installed.
  }
}
