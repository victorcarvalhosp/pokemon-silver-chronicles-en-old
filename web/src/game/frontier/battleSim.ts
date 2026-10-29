// Port of 018_Alternate battle modes/003_Battle Frontier generator/004_ChallengeGenerator_BattleSim.rb:
// the teams team generation pits against each other, their Glicko-2 (or
// Elo) ratings, and deciding a battle (mostly by a score, sometimes by a real
// battle in the debug scene).

import { DebugSceneNoLogging } from "../../battle/DebugScene";
import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { Move } from "../../data/gameData/move";
import { TrainerType } from "../../data/gameData/trainerType";
import { Effectiveness } from "../../data/gameData/type";
import type { Pokemon } from "../pokemon/Pokemon";
import { NPCTrainer } from "../trainer/Trainer";
import type { PokemonChallengeRules } from "./challengeRules";
import { baseStatTotal } from "./generatorPokemon";

/**
 * Battle::DebugSceneNoLogging as this game has it. NOTE (Ruby parity):
 * Essentials Deluxe's battle code calls the scene's pbDeluxeTriggers, which
 * only Battle::Scene defines (Midbattle_Triggers.rb:26), so in this scene
 * every attack phase raises NoMethodError at its start (Essentials Deluxe
 * [000] Essentials Patches/Battle.rb:282): no Pokémon ever moves, and the
 * battle is decided on time after 100 rounds (battle.debug).
 */
export class RuledBattleDebugScene extends DebugSceneNoLogging {
  async pbDeluxeTriggers(): Promise<void> {
    throw new Error("undefined method `pbDeluxeTriggers' for #<Battle::DebugSceneNoLogging>");
  }
}

//===============================================================================
//
//===============================================================================
export class RuledTeam {
  team: Pokemon[];
  protected _totalGames: number | null;
  protected _rating: PlayerRating;
  protected history: MatchHistory;

  constructor(party: Pokemon[], rule: PokemonChallengeRules) {
    const count = rule.ruleset.suggestedNumber;
    this.team = [];
    const retnum: number[] = [];
    for (;;) {
      for (let i = 0; i < count; i++) {
        retnum[i] = rand(party.length);
        this.team[i] = party[retnum[i]!]!;
        party.splice(retnum[i]!, 1);
      }
      if (rule.ruleset.isValid(this.team)) break;
    }
    this._totalGames = 0;
    this._rating = new PlayerRating();
    this.history = new MatchHistory(this._rating);
  }

  /** [](i) */
  at(i: number): Pokemon | undefined {
    return this.team[i];
  }

  get length(): number {
    return this.team.length;
  }

  get rating(): number {
    return this._rating.winChancePercent();
  }

  get ratingData(): PlayerRating {
    return this._rating;
  }

  get ratingRaw(): number[] {
    return [this._rating.rating, this._rating.deviation, this._rating.volatility, this._rating.winChancePercent()];
  }

  compare(other: RuledTeam): number {
    // (PlayerRating has no compare: NoMethodError in Ruby.)
    return (this._rating as unknown as { compare(o: PlayerRating): number }).compare(other.ratingData);
  }

  get totalGames(): number {
    return (this._totalGames || 0) + this.games;
  }

  addMatch(other: RuledTeam, score: number): void {
    this.history.addMatch(other.ratingData, score);
  }

  get games(): number {
    return this.history.length;
  }

  updateRating(): void {
    if (!this._totalGames) this._totalGames = 0;
    const oldgames = this.games;
    this.history.updateAndClear();
    const newgames = this.games;
    this._totalGames += oldgames - newgames;
  }

  /** NOTE (Ruby parity): PlayerRating has no to_i (NoMethodError, 004_ChallengeGenerator_BattleSim.rb:68). Unused. */
  toStr(): string {
    throw new Error("undefined method `to_i' for #<PlayerRating>");
  }

  /** NOTE (Ruby parity): indexes party with a Pokémon (TypeError, 004_ChallengeGenerator_BattleSim.rb:72). Unused. */
  load(_party: Pokemon[]): Pokemon[] {
    if (this.team.length > 0) throw new Error("no implicit conversion of Pokemon into Integer");
    return [];
  }
}

//===============================================================================
//
//===============================================================================
export class SingleMatch {
  readonly opponentRating: number;
  readonly opponentDeviation: number;
  /** -1=draw, 0=lose, 1=win */
  readonly score: number;
  readonly kValue: number;

  constructor(opponentRating: number, opponentDev: number, score: number, kValue = 16) {
    this.opponentRating = opponentRating;
    this.opponentDeviation = opponentDev;
    this.score = score;
    this.kValue = kValue;
  }
}

//===============================================================================
//
//===============================================================================
export class MatchHistory {
  protected matches: SingleMatch[] = [];
  protected thisPlayer: { update(matches: SingleMatch[]): void };

  constructor(thisPlayer: { update(matches: SingleMatch[]): void }) {
    this.thisPlayer = thisPlayer;
  }

  at(i: number): SingleMatch | undefined {
    return this.matches[i];
  }

  get length(): number {
    return this.matches.length;
  }

  each(block: (item: SingleMatch) => void): void {
    for (const item of this.matches) block(item);
  }

  /** 1=I won; 0=Other player won; -1: Draw */
  addMatch(otherPlayer: { rating: number; deviation: number }, result: number): void {
    this.matches.push(new SingleMatch(otherPlayer.rating, otherPlayer.deviation, result));
  }

  updateAndClear(): void {
    this.thisPlayer.update(this.matches);
    this.matches.length = 0;
  }
}

//===============================================================================
//
//===============================================================================
export class PlayerRatingElo {
  static readonly K_VALUE = 16;

  rating = 1600.0;
  protected _deviation = 0;
  protected _volatility = 0;
  protected estimatedRating: number | null = null;

  winChancePercent(): number {
    if (this.estimatedRating) return this.estimatedRating;
    const x = 1 + 10.0 ** ((this.rating - 1600.0) / 400.0);
    this.estimatedRating = x === 0 ? 1.0 : 1.0 / x;
    return this.estimatedRating;
  }

  /** NOTE (Ruby parity): reads an undefined `match` (NameError, 004_ChallengeGenerator_BattleSim.rb:160). Unused. */
  update(matches: SingleMatch[]): void {
    if (matches.length === 0) return;
    throw new Error("undefined local variable or method `match' for #<PlayerRatingElo>");
  }
}

//===============================================================================
//
//===============================================================================
export class PlayerRating {
  volatility = 0.9;
  deviation = 350.0;
  rating = 1500.0;
  protected estimatedRating: number | null = null;

  winChancePercent(): number {
    if (this.estimatedRating) return this.estimatedRating;
    if (this.deviation > 100) {
      // https://www.smogon.com/forums/threads/make-sense-of-your-shoddy-battle-rating.55764/
      const otherRating = 1500.0;
      const otherDeviation = 350.0;
      const s = Math.sqrt(100_000.0 + this.deviation * this.deviation + otherDeviation * otherDeviation);
      const g = 10.0 ** ((otherRating - this.rating) * 0.79 / s);
      this.estimatedRating = (1.0 / (1.0 + g)) * 100.0; // Percent chance that I win against opponent
    } else {
      // GLIXARE method
      const rds = this.deviation * this.deviation;
      const sqr = Math.sqrt(15.905694331435 * (rds + 221_781.21786254));
      const inner = (1500.0 - this.rating) * Math.PI / sqr;
      this.estimatedRating = (10_000.0 / (1.0 + 10.0 ** inner) + 0.5) / 100.0;
    }
    return this.estimatedRating;
  }

  update(matches: SingleMatch[], system = 1.2): void {
    let volatility = this.volatility2();
    let deviation = this.deviation2();
    let rating = this.rating2();
    if (matches.length === 0) {
      this.setDeviation2(Math.sqrt(deviation * deviation + volatility * volatility));
      return;
    }
    const g: number[] = [];
    const e: number[] = [];
    const score: number[] = [];
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]!;
      g[i] = this.getGFactor(match.opponentDeviation);
      e[i] = this.getEFactor(rating, match.opponentRating, g[i]!);
      score[i] = match.score;
    }
    // Estimated variance
    let variance = 0.0;
    for (let i = 0; i < matches.length; i++) variance += g[i]! * g[i]! * e[i]! * (1 - e[i]!);
    variance = 1.0 / variance;
    // Improvement sum
    let sum = 0.0;
    for (let i = 0; i < matches.length; i++) {
      const v = score[i]!;
      if (v !== -1) sum += g[i]! * (v - e[i]!);
    }
    volatility = this.getUpdatedVolatility(volatility, deviation, variance, sum, system);
    // Update deviation
    const t = deviation * deviation + volatility * volatility;
    deviation = 1.0 / Math.sqrt(1.0 / t + 1.0 / variance);
    // Update rating
    rating = rating + deviation * deviation * sum;
    this.setRating2(rating);
    this.setDeviation2(deviation);
    this.setVolatility2(volatility);
  }

  // private

  /** alias volatility2 volatility */
  protected volatility2(): number {
    return this.volatility;
  }

  protected rating2(): number {
    return (this.rating - 1500.0) / 173.7178;
  }

  protected deviation2(): number {
    return this.deviation / 173.7178;
  }

  protected getGFactor(deviation: number): number {
    // deviation is not yet in glicko2
    deviation /= 173.7178;
    return 1.0 / Math.sqrt(1.0 + (3.0 * deviation * deviation) / (Math.PI * Math.PI));
  }

  protected getEFactor(rating: number, opponentRating: number, g: number): number {
    // rating is already in glicko2
    // opponentRating is not yet in glicko2
    opponentRating = (opponentRating - 1500.0) / 173.7178;
    return 1.0 / (1.0 + Math.exp(-g * (rating - opponentRating)));
  }

  protected setVolatility2(value: number): void {
    this.volatility = value;
  }

  protected setRating2(value: number): void {
    this.estimatedRating = null;
    this.rating = value * 173.7178 + 1500.0;
  }

  protected setDeviation2(value: number): void {
    this.estimatedRating = null;
    this.deviation = value * 173.7178;
  }

  protected getUpdatedVolatility(volatility: number, deviation: number, variance: number, improvementSum: number, system: number): number {
    const improvement = improvementSum * variance;
    const a = Math.log(volatility * volatility);
    const squSystem = system * system;
    const squDeviation = deviation * deviation;
    const squVariance = variance + variance;
    const squDevplusVar = squDeviation + variance;
    let x0 = a;
    for (let n = 0; n < 100; n++) { // Up to 100 iterations to avoid potentially infinite loops
      const e = Math.exp(x0);
      const d = squDevplusVar + e;
      const squD = d * d;
      const i = improvement / d;
      const h1 = -(x0 - a) / squSystem - 0.5 * e * i * i;
      let h2 = -1.0 / squSystem - 0.5 * e * squDevplusVar / squD;
      h2 += 0.5 * squVariance * e * (squDevplusVar - e) / (squD * d);
      const x1 = x0;
      x0 -= h1 / h2;
      if (Math.abs(x1 - x0) < 0.000001) break;
    }
    return Math.exp(x0 / 2.0);
  }
}

//===============================================================================
//
//===============================================================================
export function pbDecideWinnerEffectiveness(move: Id, otype1: Id, otype2: Id, ability: Id | null, scores: number[]): number {
  const data = Move.get(move);
  if (data.baseDamage === 0) return 0;
  const atype = data.type;
  let typemod = Effectiveness.NORMAL_EFFECTIVE_ONE ** 2;
  if (ability !== "LEVITATE" || data.type !== "GROUND") {
    let mod1 = Effectiveness.calculateOne(atype, otype1);
    let mod2 = otype1 === otype2 ? Effectiveness.NORMAL_EFFECTIVE_ONE : Effectiveness.calculateOne(atype, otype2);
    if (ability === "WONDERGUARD") {
      if (mod1 <= Effectiveness.NORMAL_EFFECTIVE_ONE) mod1 = Effectiveness.NORMAL_EFFECTIVE_ONE;
      if (mod2 <= Effectiveness.NORMAL_EFFECTIVE_ONE) mod2 = Effectiveness.NORMAL_EFFECTIVE_ONE;
    }
    typemod = mod1 * mod2;
  }
  if (typemod === 0) return scores[0]!; // Ineffective
  if (typemod === 1) return scores[1]!; // Doubly not very effective
  if (typemod === 2) return scores[2]!; // Not very effective
  if (typemod === 4) return scores[3]!; // Normal effective
  if (typemod === 8) return scores[4]!; // Super effective
  if (typemod === 16) return scores[5]!; // Doubly super effective
  return 0;
}

export function pbDecideWinnerScore(party0: Pokemon[], party1: Pokemon[], rating: number): number {
  let score = 0;
  const types1: Id[] = [];
  const types2: Id[] = [];
  const abilities: (Id | null)[] = [];
  for (let j = 0; j < party1.length; j++) {
    const types = party1[j]!.types();
    types1.push(types[0]!);
    types2.push(types[1] || types[0]!);
    abilities.push(party1[j]!.abilityId);
  }
  for (let i = 0; i < party0.length; i++) {
    for (const move of party0[i]!.moves) {
      if (!move) continue;
      for (let j = 0; j < party1.length; j++) {
        score += pbDecideWinnerEffectiveness(move.id, types1[j]!, types2[j]!, abilities[j]!, [-16, -8, 0, 4, 12, 20]);
      }
    }
    const basestatsum = baseStatTotal(party0[i]!.species);
    score += Math.floor(basestatsum / 10);
    if (party0[i]!.item) score += 10; // Not in Battle Dome ranking
  }
  score += rating + rand(32);
  return score;
}

export function pbDecideWinner(party0: Pokemon[], party1: Pokemon[], rating0: number, rating1: number): number {
  rating0 = Math.round(rating0 * 15.0 / 100);
  rating1 = Math.round(rating1 * 15.0 / 100);
  const score0 = pbDecideWinnerScore(party0, party1, rating0);
  const score1 = pbDecideWinnerScore(party1, party0, rating1);
  if (score0 === score1) {
    if (rating0 === rating1) return 5;
    return rating0 > rating1 ? 1 : 2;
  } else {
    return score0 > score1 ? 1 : 2;
  }
}

//===============================================================================
//
//===============================================================================
export async function pbRuledBattle(team1: RuledTeam, team2: RuledTeam, rule: PokemonChallengeRules): Promise<void> {
  let decision = 0;
  if (rand(100) === 0) {
    const level = rule.ruleset.suggestedLevel;
    const tType = TrainerType.keys()[0]!;
    const trainer1 = new NPCTrainer("PLAYER1", tType);
    const trainer2 = new NPCTrainer("PLAYER2", tType);
    const items1: (Id | null)[] = [];
    const items2: (Id | null)[] = [];
    team1.team.forEach((p, i) => {
      if (!p) return;
      if (p.level !== level) {
        p.level = level;
        p.calcStats();
      }
      items1[i] = p.itemId;
      trainer1.party.push(p);
    });
    team2.team.forEach((p, i) => {
      if (!p) return;
      if (p.level !== level) {
        p.level = level;
        p.calcStats();
      }
      items2[i] = p.itemId;
      trainer2.party.push(p);
    });
    const scene = new RuledBattleDebugScene();
    const battle = rule.createBattle(scene, trainer1, trainer2);
    battle.debug = true;
    battle.controlPlayer = true;
    battle.internalBattle = false;
    decision = await battle.pbStartBattle();
    team1.team.forEach((p, i) => {
      if (!p) return;
      p.heal();
      p.item = items1[i] ?? null;
    });
    team2.team.forEach((p, i) => {
      if (!p) return;
      p.heal();
      p.item = items2[i] ?? null;
    });
  } else {
    const party1: Pokemon[] = [];
    const party2: Pokemon[] = [];
    for (let i = 0; i < team1.length; i++) party1.push(team1.at(i)!);
    for (let i = 0; i < team2.length; i++) party2.push(team2.at(i)!);
    decision = pbDecideWinner(party1, party2, team1.rating, team2.rating);
  }
  switch (decision) {
    case 1: // Team 1 wins
      team1.addMatch(team2, 1);
      team2.addMatch(team1, 0);
      break;
    case 2: // Team 2 wins
      team1.addMatch(team2, 0);
      team2.addMatch(team1, 1);
      break;
    default:
      team1.addMatch(team2, -1);
      team2.addMatch(team1, -1);
  }
}
