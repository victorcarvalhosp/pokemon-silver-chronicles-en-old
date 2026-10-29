// Port of Data/Scripts/011_Battle/005_AI/004_AI_Move.rb, with:
// - Improved AI (AI_Move.rb:7): pbChooseMoves (redefined: no "preferred
//   moves" pick, different bad-move thresholds, and a second pick weighted by
//   score ** exponent), pbGetMoveScoreDamage (redefined: weaker flinch bonus,
//   weak attacks halved, a bonus for type effectiveness).
// - ZUD Mechanics ([003] Battle/Battle_AI.rb:50): pbChooseMoves (alias adding
//   the user's Z-Moves to its choices when it can use one).
// Alias chain: pbChooseMoves = ZUD( Improved AI ). Core's pbChooseMoves and
// pbGetMoveScoreDamage are replaced and aren't ported.

import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { powerMoveParam } from "../zud/Battle_PowerMove";
import { AI, type AIChoice, PBTrainerAI } from "./Battle_AI";

/** Improved AI/settings.rb */
const MIN_EXPONENT = 1.5;
const MAX_EXPONENT = 6.0;

const methods = {
  //=============================================================================
  // Main move-choosing method (moves with higher scores are more likely to be
  // chosen) — ZUD Mechanics' alias: adds the user's Z-Moves to its choices.
  //=============================================================================
  async pbChooseMoves(this: AI, idxBattler: number): Promise<void> {
    const user = this.battle.battlers[idxBattler]!;
    const elig = user.wild() ? user.ace() : true;
    if (this.battle.pbCanZMove(idxBattler) && elig && !this.battle.pbScriptedMechanic(idxBattler, "zmove")) {
      // Adds every eligible Z-Move to the user's movepool selection if the user
      // has the Z-Move option available to use.
      const newMoves: (Move | null)[] = [];
      user.baseMoves.length = 0;
      const species = user.effects[PBEffects.Transform]
        ? (user.effects[PBEffects.TransformPokemon] as Pokemon).speciesData().id : null;
      user.moves.forEach((m) => { // eachMoveWithIndex
        user.baseMoves.push(m);
        let zmove: Move | null;
        if (user.pokemon!.compatZmove(powerMoveParam(m), null, species)) {
          zmove = user.convertZmove(m, user.itemId, species);
          zmove.pp = m.pp;
        } else {
          zmove = null;
        }
        newMoves.push(zmove);
      });
      if (newMoves.length > 0) {
        for (const m of newMoves) if (m) user.moves.push(m);
      }
      await this.improvedAI_pbChooseMoves(idxBattler);
      // Registers the Z-Move mechanic if the AI determined a Z-Move is the best
      // move to use.
      const chosen = this.battle.choices[idxBattler]![2] as Move | null;
      // NOTE (Ruby parity): if the AI chose to switch instead, choices[2] is nil
      //       and Ruby raises NoMethodError here (Battle_AI.rb:75), leaving the
      //       Z-Moves in the user's moves.
      if (!chosen) throw new TypeError("undefined method `zMove?' for nil:NilClass");
      if (chosen.zMove()) {
        this.battle.pbRegisterZMove(idxBattler);
        user.powerTrigger = true;
        user.selectedMoveIsZMove = true;
        newMoves.forEach((m, i) => {
          if (m !== chosen) return;
          user.powerIndex = i;
        });
      }
      if (user.baseMoves.length > 0) {
        user.moves.length = 0;
        for (const m of user.baseMoves) user.moves.push(m as Move);
      }
    } else {
      await this.improvedAI_pbChooseMoves(idxBattler);
    }
  },

  /** Improved AI's pbChooseMoves (ZUD's zud_pbChooseMoves). */
  async improvedAI_pbChooseMoves(this: AI, idxBattler: number): Promise<void> {
    const user = this.battle.battlers[idxBattler]!;
    const wildBattler = user.wild();
    let skill = 0;
    let exponent = 1;
    if (!wildBattler) {
      skill = this.battle.pbGetOwnerFromBattlerIndex(user.index)?.skillLevel() || 0;
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
        await this.pbRegisterMoveTrainer(user, i, choices, skill);
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
    // Log the available choices (Ruby: only if $INTERNAL)
    if (PBDebug.sink) {
      const fmt = (cs: AIChoice[]) => cs.map((c) => `${user.moves[c[0]]!.name}=${c[1]}${c[2] >= 0 ? ` (target ${c[2]})` : ""}`).join(", ");
      PBDebug.log(`[AI] Move choices for ${user.pbThis(true)} (${user.index}): raw: (${fmt(choices)}), weighted: (${fmt(weightedChoices)})`);
    }

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
    // (totalScore is still 0 if the choices were just picked at random)
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
    const chosen = this.battle.choices[idxBattler]?.[2] as Move | null | undefined;
    if (chosen) PBDebug.log(`[AI] ${user.pbThis()} (${user.index}) will use ${chosen.name}`);
  },

  //=============================================================================
  // Get scores for the given move against each possible target
  //=============================================================================
  /** Wild Pokémon choose their moves randomly. */
  pbRegisterMoveWild(this: AI, _user: Battler, idxMove: number, choices: AIChoice[]): void {
    choices.push([idxMove, 100, -1]); // Move index, score, target
  },

  /** Trainer Pokémon calculate how much they want to use each of their moves. */
  async pbRegisterMoveTrainer(this: AI, user: Battler, idxMove: number, choices: AIChoice[],
    skill: number): Promise<void> {
    const move = user.moves[idxMove]!;
    const targetData = move.pbTarget(user);
    if (["UserAndAllies", "AllAllies", "AllBattlers"].includes(targetData.id) ||
        targetData.numTargets === 0) {
      // If move has no targets, affects the user, a side or the whole field, or
      // specially affects multiple Pokémon and the AI calculates an overall
      // score at once instead of per target
      const score = await this.pbGetMoveScore(move, user, user, skill);
      if (score > 0) choices.push([idxMove, score, -1]);
    } else if (targetData.numTargets > 1) {
      // If move affects multiple battlers and you don't choose a particular one
      let totalScore = 0;
      for (const b of this.battle.allBattlers()) {
        if (!this.battle.pbMoveCanTarget(user.index, b.index, targetData)) continue;
        const score = await this.pbGetMoveScore(move, user, b, skill);
        totalScore += user.opposes(b) ? score : -score;
      }
      if (totalScore > 0) choices.push([idxMove, totalScore, -1]);
    } else {
      // If move affects one battler and you have to choose which one
      const scoresAndTargets: [number, number][] = [];
      for (const b of this.battle.allBattlers()) {
        if (!this.battle.pbMoveCanTarget(user.index, b.index, targetData)) continue;
        if (targetData.targetsFoe && !user.opposes(b)) continue;
        const score = await this.pbGetMoveScore(move, user, b, skill);
        if (score > 0) scoresAndTargets.push([score, b.index]);
      }
      if (scoresAndTargets.length > 0) {
        // Get the one best target for the move
        // (Ruby's sort! keeps tied elements in order for arrays this small, as a stable sort does)
        scoresAndTargets.sort((a, b) => b[0] - a[0]);
        choices.push([idxMove, scoresAndTargets[0]![0], scoresAndTargets[0]![1]]);
      }
    }
  },

  //=============================================================================
  // Get a score for the given move being used against the given target
  //=============================================================================
  async pbGetMoveScore(this: AI, move: Move, user: Battler, target: Battler, skill = 100): Promise<number> {
    if (skill < PBTrainerAI.minimumSkill()) skill = PBTrainerAI.minimumSkill();
    let score = 100;
    score = await this.pbGetMoveScoreFunctionCode(score, move, user, target, skill);
    // A score of 0 here means it absolutely should not be used
    if (score <= 0) return 0;
    if (skill >= PBTrainerAI.mediumSkill()) {
      // Prefer damaging moves if AI has no more Pokémon or AI is less clever
      if (this.battle.pbAbleNonActiveCount(user.idxOwnSide()) === 0 &&
          !(skill >= PBTrainerAI.highSkill() && this.battle.pbAbleNonActiveCount(target.idxOwnSide()) > 0)) {
        if (move.statusMove()) {
          score /= 1.5;
        } else if (target.hp <= Math.floor(target.totalhp / 2)) {
          score *= 1.5;
        }
      }
      // Don't prefer attacking the target if they'd be semi-invulnerable
      if (skill >= PBTrainerAI.highSkill() && move.accuracy > 0 &&
          (target.semiInvulnerable() || target.effects[PBEffects.SkyDrop] >= 0)) {
        let miss = true;
        if (user.hasActiveAbility("NOGUARD") || target.hasActiveAbility("NOGUARD")) miss = false;
        if (miss && this.pbRoughStat(user, "SPEED", skill) > this.pbRoughStat(target, "SPEED", skill)) {
          // Knows what can get past semi-invulnerability
          if (target.effects[PBEffects.SkyDrop] >= 0 ||
              target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
                "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
                "TwoTurnAttackInvulnerableInSkyTargetCannotAct")) {
            if (move.hitsFlyingTargets()) miss = false;
          } else if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground")) {
            if (move.hitsDiggingTargets()) miss = false;
          } else if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderwater")) {
            if (move.hitsDivingTargets()) miss = false;
          }
        }
        if (miss) score -= 80;
      }
      // Pick a good move for the Choice items
      if (user.hasActiveItem(["CHOICEBAND", "CHOICESPECS", "CHOICESCARF"]) ||
          user.hasActiveAbility("GORILLATACTICS")) {
        if (move.baseDamage >= 60) {
          score += 60;
        } else if (move.damagingMove()) {
          score += 30;
        } else if (move.function === "UserTargetSwapItems") {
          score += 70; // Trick
        } else {
          score -= 60;
        }
      }
      // If user is asleep, prefer moves that are usable while asleep
      if (user.status === "SLEEP" && !move.usableWhenAsleep()) {
        for (const m of user.moves) {
          if (!m.usableWhenAsleep()) continue;
          score -= 60;
          break;
        }
      }
      // If user is frozen, prefer a move that can thaw the user
      if (user.status === "FROZEN") {
        if (move.thawsUser()) {
          score += 40;
        } else {
          for (const m of user.moves) {
            if (!m.thawsUser()) continue;
            score -= 60;
            break;
          }
        }
      }
      // If target is frozen, don't prefer moves that could thaw them
      // (Ruby: penalises the move if the user knows any move that doesn't thaw)
      if (target.status === "FROZEN") {
        for (const m of user.moves) {
          if (m.thawsUser()) continue;
          score -= 60;
          break;
        }
      }
    }
    // Don't prefer moves that are ineffective because of abilities or effects
    if (this.pbCheckMoveImmunity(score, move, user, target, skill)) return 0;
    // Adjust score based on how much damage it can deal
    if (move.damagingMove()) {
      score = this.pbGetMoveScoreDamage(score, move, user, target, skill);
    } else { // Status moves
      // Don't prefer attacks which don't deal damage
      score -= 10;
      // Account for accuracy of move
      const accuracy = this.pbRoughAccuracy(move, user, target, skill);
      score *= accuracy / 100.0;
      if (score <= 10 && skill >= PBTrainerAI.highSkill()) score = 0;
    }
    score = Math.trunc(score);
    if (score < 0) score = 0;
    return score;
  },

  //=============================================================================
  // Add to a move's score based on how much damage it will deal (as a percentage
  // of the target's current HP) — Improved AI's version
  //=============================================================================
  pbGetMoveScoreDamage(this: AI, score: number, move: Move, user: Battler, target: Battler, skill: number): number {
    if (score <= 0) return 0;
    // Calculate how much damage the move will do (roughly)
    const baseDmg = this.pbMoveBaseDamage(move, user, target, skill);
    let realDamage = this.pbRoughDamage(move, user, target, skill, baseDmg);
    // Account for accuracy of move
    const accuracy = this.pbRoughAccuracy(move, user, target, skill);
    realDamage *= accuracy / 100.0;
    // Two-turn attacks waste 2 turns to deal one lot of damage
    if (move.chargingTurnMove() || move.function === "AttackAndSkipNextTurn") { // Hyper Beam
      // Ruby: 2 / 3 is Integer division (0), so this zeroes the damage.
      realDamage *= 0; // Not halved because semi-invulnerable during use or hits first turn
    }
    // Prefer flinching external effects (note that move effects which cause
    // flinching are dealt with in the function code part of score calculation)
    if (skill >= PBTrainerAI.mediumSkill() && !move.flinchingMove() &&
        !target.hasActiveAbility("INNERFOCUS") &&
        !target.hasActiveAbility("SHIELDDUST") &&
        target.effects[PBEffects.Substitute] === 0) {
      let canFlinch = false;
      if (user.hasActiveItem(["KINGSROCK", "RAZORFANG"]) ||
          user.hasActiveAbility("STENCH")) {
        canFlinch = true;
      }
      if (canFlinch) realDamage *= 1.1;
    }
    // Convert damage to percentage of target's remaining HP
    let damagePercentage = realDamage * 100.0 / target.hp;
    // Don't prefer weak attacks
    if (damagePercentage < 20) damagePercentage /= 2;
    // Prefer damaging attack if level difference is significantly high
    if (user.level - 10 > target.level) damagePercentage *= 1.2;
    // Adjust score
    if (damagePercentage > 120) damagePercentage = 120; // Treat all lethal moves the same
    if (damagePercentage > 100) damagePercentage += 40; // Prefer moves likely to be lethal
    score += Math.trunc(damagePercentage);
    // prefer super effective moves
    if (skill >= PBTrainerAI.highSkill()) {
      score += this.pbCalcTypeLinear(move.type, user, target) * 14;
    } else {
      score += this.pbCalcTypeLinear(move.type, user, target) * 10;
    }
    return score;
  },
};

type Methods = typeof methods;
declare module "./Battle_AI" {
  interface AI extends Methods {}
}
Object.assign(AI.prototype, methods);
