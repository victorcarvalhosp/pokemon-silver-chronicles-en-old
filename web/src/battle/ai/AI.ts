// Stand-in for Battle::AI (Data/Scripts/011_Battle/005_AI/*.rb + the Improved
// AI, Essentials Deluxe, ZUD Mechanics and Generation 9 Pack AI patches) until
// the full AI is ported. What's here is faithful:
// - 001_Battle_AI.rb: PBTrainerAI, pbAIRandom, pbStdDev, pbEnemyShouldMegaEvolve?
//   (Essentials Deluxe's version: Mega Evolution.rb:91), pbDefaultChooseEnemyCommand
//   (Essentials Deluxe's version: Battle.rb:374).
// - Improved AI/AI_Move.rb:7 pbChooseMoves, and pbRegisterMoveWild.
// - 003_AI_Switch.rb: pbDefaultChooseNewEnemy, pbChooseBestNewEnemy;
//   Generation 9 Pack ([003] Battle_AI.rb:81) pbDefaultChooseReviveEnemy.
// Deferred (stubbed): pbEnemyShouldUseItem? (002_AI_Item.rb), pbEnemyShouldWithdraw?/
// pbEnemyShouldWithdrawEx? (003_AI_Switch.rb), move scoring for trainers
// (pbRegisterMoveTrainer/pbGetMoveScore, 004-008 + Improved AI) which here gives
// every usable move score 100, ZUD's Z-Move/Ultra Burst/Dynamax AI.

import { Effectiveness } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
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

/** Improved AI/settings.rb */
const MIN_EXPONENT = 1.5;
const MAX_EXPONENT = 6.0;

export class AI {
  readonly battle: Battle;

  constructor(battle: Battle) {
    this.battle = battle;
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

  /** Deferred: 002_AI_Item.rb. */
  async pbEnemyShouldUseItem(_idxBattler: number): Promise<boolean> { return false; }
  /** Deferred: 003_AI_Switch.rb. */
  async pbEnemyShouldWithdraw(_idxBattler: number): Promise<boolean> { return false; }
  /** Deferred: 003_AI_Switch.rb (+ Generation 9 Pack Zero to Hero). */
  async pbEnemyShouldWithdrawEx(_idxBattler: number, _forceSwitch: boolean): Promise<boolean> { return false; }
  /** Deferred: ZUD Mechanics AI. */
  pbEnemyShouldUltraBurst(_idxBattler: number): boolean { return false; }
  pbEnemyShouldDynamax(_idxBattler: number): boolean { return false; }
  /** Essentials Deluxe: custom mechanic hook. */
  pbEnemyShouldCustom(_idxBattler: number): boolean { return false; }

  //=============================================================================
  // Choose an action
  //=============================================================================
  async pbDefaultChooseEnemyCommand(idxBattler: number): Promise<void> {
    if (await this.pbEnemyShouldUseItem(idxBattler)) return;
    if (await this.pbEnemyShouldWithdraw(idxBattler)) return;
    if (await this.battle.pbAutoFightMenu(idxBattler)) return;
    if (this.pbEnemyShouldMegaEvolve(idxBattler)) this.battle.pbRegisterMegaEvolution(idxBattler);
    // ZUD Mechanics
    if (this.pbEnemyShouldUltraBurst(idxBattler)) this.battle.pbRegisterUltraBurst(idxBattler);
    if (this.pbEnemyShouldDynamax(idxBattler)) this.battle.pbRegisterDynamax(idxBattler);
    if (!this.battle.pbScriptedMechanic(idxBattler, "custom") && this.pbEnemyShouldCustom(idxBattler)) {
      // Essentials Deluxe: @battle.pbRegisterCustom(idxBattler) (no custom mechanic in this game)
    }
    await this.pbChooseMoves(idxBattler);
  }

  //=============================================================================
  // Main move-choosing method (moves with higher scores are more likely to be
  // chosen) — Improved AI's version.
  //=============================================================================
  async pbChooseMoves(idxBattler: number): Promise<void> {
    const user = this.battle.battlers[idxBattler]!;
    const wildBattler = user.wild();
    let skill = 0;
    let exponent = 1;
    if (!wildBattler) {
      skill = (this.battle.pbGetOwnerFromBattlerIndex(user.index) as { skillLevel?: () => number } | null)?.skillLevel?.() ?? 0;
      // Set the exponent to a number in the range based on the opponent's skill level
      exponent = MIN_EXPONENT + (MAX_EXPONENT - MIN_EXPONENT) * (skill / 100.0);
    }
    // Get scores and targets for each move
    // NOTE: A move is only added to the choices array if it has a non-zero
    //       score.
    const choices: AIChoice[] = [];
    const weightedChoices: AIChoice[] = [];
    for (let i = 0; i < user.moves.length; i++) {
      if (!this.battle.pbCanChooseMove(idxBattler, i, false)) continue;
      if (wildBattler) {
        this.pbRegisterMoveWild(user, i, choices);
        weightedChoices.push(choices[choices.length - 1]!);
      } else {
        this.pbRegisterMoveTrainer(user, i, choices, skill);
      }
    }
    // Figure out useful information about the choices
    let totalScore = 0;
    let totalWeightedScore = 0;
    let maxScore = 0;
    for (const c of choices) {
      totalScore += c[1];
      if (maxScore < c[1]) maxScore = c[1];
      // Populate the weightedChoices array
      if (!wildBattler) {
        // By applying an exponent to the score, higher values become much more favored by the RNG
        // The raw score is divided by 50 before applying the exponent to reduce the risk of overflow
        weightedChoices.push([c[0], Math.floor((c[1] / 50.0) ** exponent), c[2]]);
      }
    }
    for (const c of weightedChoices) totalWeightedScore += c[1];
    // Decide whether all choices are bad, and if so, try switching instead
    if (!wildBattler && skill >= PBTrainerAI.highSkill()) {
      let badMoves = false;
      if (((maxScore <= 30 && user.turnCount > 1) ||
           (maxScore <= 60 && user.turnCount > 3)) && this.pbAIRandom(100) < 80) {
        badMoves = true;
      }
      if (!badMoves && totalScore < 100 && user.turnCount > 1) {
        badMoves = true;
        for (const c of choices) {
          if (!user.moves[c[0]]!.damagingMove()) continue;
          badMoves = false;
          break;
        }
        if (badMoves && this.pbAIRandom(100) < 10) badMoves = false;
      }
      if (badMoves && await this.pbEnemyShouldWithdrawEx(idxBattler, true)) {
        PBDebug.log(`[AI] ${user.pbThis()} (${user.index}) will switch due to terrible moves`);
        return;
      }
    }
    // If there are no calculated choices, pick one at random
    if (choices.length === 0) {
      PBDebug.log(`[AI] ${user.pbThis()} (${user.index}) doesn't want to use any moves; picking one at random`);
      for (let i = 0; i < user.moves.length; i++) {
        if (!this.battle.pbCanChooseMove(idxBattler, i, false)) continue;
        choices.push([i, 100, -1]); // Move index, score, target
      }
      if (choices.length === 0) { // No moves are physically possible to use; use Struggle
        await this.battle.pbAutoChooseMove(user.index);
      }
    }
    // Randomly choose a move from the choices and register it
    let randNum = this.pbAIRandom(totalScore);
    for (const c of choices) {
      randNum -= c[1];
      if (randNum >= 0) continue;
      await this.battle.pbRegisterMove(idxBattler, c[0], false);
      if (c[2] >= 0) this.battle.pbRegisterTarget(idxBattler, c[2]);
      break;
    }
    // Choose a move based off of the weighted score values
    if (!wildBattler && maxScore > 100) {
      randNum = this.pbAIRandom(totalWeightedScore);
      for (const c of weightedChoices) {
        randNum -= c[1];
        if (randNum >= 0) continue;
        await this.battle.pbRegisterMove(idxBattler, c[0], false);
        if (c[2] >= 0) this.battle.pbRegisterTarget(idxBattler, c[2]);
        break;
      }
    }
    // Log the result
    const chosen = this.battle.choices[idxBattler]?.[2] as { name: string } | null | undefined;
    if (chosen) PBDebug.log(`[AI] ${user.pbThis()} (${user.index}) will use ${chosen.name}`);
  }

  //=============================================================================
  // Get scores for the given move against each possible target
  //=============================================================================
  /** Wild Pokémon choose their moves randomly. */
  pbRegisterMoveWild(_user: Battler, idxMove: number, choices: AIChoice[]): void {
    choices.push([idxMove, 100, -1]); // Move index, score, target
  }

  /**
   * Trainer Pokémon calculate how much they want to use each of their moves.
   * Deferred: move scoring (004_AI_Move.rb pbRegisterMoveTrainer/pbGetMoveScore
   * and the Improved AI); every move scores 100 against its first possible target.
   */
  pbRegisterMoveTrainer(user: Battler, idxMove: number, choices: AIChoice[], _skill: number): void {
    const move = user.moves[idxMove]!;
    const targetData = move.pbTarget(user);
    if (targetData.numTargets !== 1 || ["UserAndAllies", "AllAllies", "AllBattlers"].includes(targetData.id)) {
      choices.push([idxMove, 100, -1]);
      return;
    }
    for (const b of this.battle.allBattlers()) {
      if (!this.battle.pbMoveCanTarget(user.index, b.index, targetData)) continue;
      if (!user.opposes(b)) continue;
      choices.push([idxMove, 100, b.index]);
      return;
    }
    choices.push([idxMove, 100, -1]);
  }

  //=============================================================================
  // Choose a replacement Pokémon (003_AI_Switch.rb)
  //=============================================================================
  pbDefaultChooseNewEnemy(idxBattler: number, party: (Pokemon | null)[]): number {
    const enemies: number[] = [];
    const [, idxPartyEnd] = this.battle.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    party.forEach((_p, i) => {
      if (i === idxPartyEnd - 1 && enemies.length > 0) return; // Ignore ace if possible
      if (this.battle.pbCanSwitchLax(idxBattler, i)) enemies.push(i);
    });
    if (enemies.length === 0) return -1;
    return this.pbChooseBestNewEnemy(idxBattler, party, enemies);
  }

  pbChooseBestNewEnemy(idxBattler: number, party: (Pokemon | null)[], enemies: number[] | null): number {
    if (!enemies || enemies.length === 0) return -1;
    let best = -1;
    let bestSum = 0;
    for (const i of enemies) {
      const pkmn = party[i]!;
      let sum = 0;
      for (const m of pkmn.moves) {
        if (m.baseDamage === 0) continue;
        for (const b of this.battle.battlers[idxBattler]!.allOpposing()) {
          const bTypes = b.pbTypes(true);
          sum += Effectiveness.calculate(m.type, bTypes[0], bTypes[1], bTypes[2]);
        }
      }
      if (best === -1 || sum > bestSum) {
        best = i;
        bestSum = sum;
      }
    }
    return best;
  }

  /** Generation 9 Pack ([003] Battle_AI.rb:81): picks a fainted party member to revive (Revival Blessing). */
  pbDefaultChooseReviveEnemy(idxBattler: number, party: (Pokemon | null)[]): number {
    const enemies: number[] = [];
    party.forEach((p, i) => { if (p && !p.egg() && p.fainted()) enemies.push(i); });
    return this.pbChooseBestNewEnemy(idxBattler, party, enemies);
  }
}
