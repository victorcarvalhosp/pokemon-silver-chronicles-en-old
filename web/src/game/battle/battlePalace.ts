// Port of 011_Battle/007_Other battle types/003_BattlePalaceBattle.rb: Battle
// Palace battles, where every Pokémon picks its own moves by nature (attack /
// defense / support tables, different when in a pinch), and the Battle::AI
// patch for switching in the Palace. Battle Frontier glue (which creates
// these battles) is in recordedBattle.ts.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Battle } from "../../battle/battle/Battle";
import { AI } from "../../battle/ai/AI";
import type { Battler } from "../../battle/battler/Battler";
import type { Move } from "../../battle/move/Move";
import { PBEffects } from "../../battle/other/PBEffects";

declare module "../../battle/ai/AI" {
  interface AI {
    battlePalace?: boolean;
    /** Battle Palace: whether each battler switched last round (set by AI#initialize's alias). */
    justswitched?: boolean[];
  }
}

/** Percentage chances of choosing attack, defense, support moves */
const BattlePalaceUsualTable: Record<string, [number, number, number]> = {
  HARDY: [61, 7, 32],
  LONELY: [20, 25, 55],
  BRAVE: [70, 15, 15],
  ADAMANT: [38, 31, 31],
  NAUGHTY: [20, 70, 10],
  BOLD: [30, 20, 50],
  DOCILE: [56, 22, 22],
  RELAXED: [25, 15, 60],
  IMPISH: [69, 6, 25],
  LAX: [35, 10, 55],
  TIMID: [62, 10, 28],
  HASTY: [58, 37, 5],
  SERIOUS: [34, 11, 55],
  JOLLY: [35, 5, 60],
  NAIVE: [56, 22, 22],
  MODEST: [35, 45, 20],
  MILD: [44, 50, 6],
  QUIET: [56, 22, 22],
  BASHFUL: [30, 58, 12],
  RASH: [30, 13, 57],
  CALM: [40, 50, 10],
  GENTLE: [18, 70, 12],
  SASSY: [88, 6, 6],
  CAREFUL: [42, 50, 8],
  QUIRKY: [56, 22, 22],
};
const BattlePalacePinchTable: Record<string, [number, number, number]> = {
  HARDY: [61, 7, 32],
  LONELY: [84, 8, 8],
  BRAVE: [32, 60, 8],
  ADAMANT: [70, 15, 15],
  NAUGHTY: [70, 22, 8],
  BOLD: [32, 58, 10],
  DOCILE: [56, 22, 22],
  RELAXED: [75, 15, 10],
  IMPISH: [28, 55, 17],
  LAX: [29, 6, 65],
  TIMID: [30, 20, 50],
  HASTY: [88, 6, 6],
  SERIOUS: [29, 11, 60],
  JOLLY: [35, 60, 5],
  NAIVE: [56, 22, 22],
  MODEST: [34, 60, 6],
  MILD: [34, 6, 60],
  QUIET: [56, 22, 22],
  BASHFUL: [30, 58, 12],
  RASH: [27, 6, 67],
  CALM: [25, 62, 13],
  GENTLE: [90, 5, 5],
  SASSY: [22, 20, 58],
  CAREFUL: [42, 5, 53],
  QUIRKY: [56, 22, 22],
};

export class BattlePalaceBattle extends Battle {
  justswitched: boolean[];

  constructor(...args: ConstructorParameters<typeof Battle>) {
    super(...args);
    this.justswitched = [false, false, false, false];
    this.battleAI.battlePalace = true;
  }

  pbMoveCategory(move: Move): number {
    if (move.target === "User" || move.function === "MultiTurnAttackBideThenReturnDoubleDamage") {
      return 1;
    } else if (move.statusMove() || move.function === "CounterPhysicalDamage" || move.function === "CounterSpecialDamage") {
      return 2;
    }
    return 0;
  }

  /** Different implementation of pbCanChooseMove, ignores Imprison/Torment/Taunt/Disable/Encore */
  pbCanChooseMovePartial(idxPokemon: number, idxMove: number): boolean {
    const thispkmn = this.battlers[idxPokemon]!;
    const thismove = thispkmn.moves[idxMove];
    if (!thismove) return false;
    if (thismove.pp <= 0) return false;
    if (thispkmn.effects[PBEffects.ChoiceBand] && thismove.id !== thispkmn.effects[PBEffects.ChoiceBand] &&
        thispkmn.hasActiveItem("CHOICEBAND")) {
      return false;
    }
    // though incorrect, just for convenience (actually checks Torment later)
    if (thispkmn.effects[PBEffects.Torment] && thispkmn.lastMoveUsed && thismove.id === thispkmn.lastMoveUsed) {
      return false;
    }
    return true;
  }

  /** Returns the value of its last assignment (-1, truthy), as Ruby does. */
  override async pbRegisterMove(idxBattler: number, idxMove: number, _showMessages = true): Promise<boolean> {
    const thisBattler = this.battlers[idxBattler]!;
    const choice = this.choices[idxBattler]!;
    choice[0] = "UseMove";
    choice[1] = idxMove; // Index of move to be used (-2="Incapable of using its power...")
    choice[2] = idxMove === -2 ? this.struggle : thisBattler.moves[idxMove]; // Battle::Move object
    choice[3] = -1; // No target chosen yet
    return true;
  }

  override async pbAutoFightMenu(idxBattler: number): Promise<boolean> {
    const thisBattler = this.battlers[idxBattler]!;
    const nature = thisBattler.nature()!.id;
    const randnum = this.battleAI.pbAIRandom(100);
    let category = 0;
    let atkpercent = 0;
    let defpercent = 0;
    if (thisBattler.effects[PBEffects.Pinch]) {
      atkpercent = BattlePalacePinchTable[nature]![0];
      defpercent = atkpercent + BattlePalacePinchTable[nature]![1];
    } else {
      atkpercent = BattlePalaceUsualTable[nature]![0];
      defpercent = atkpercent + BattlePalaceUsualTable[nature]![1];
    }
    // NOTE (Ruby parity): defpercent already includes atkpercent, which is
    // added again here, so defense moves are picked more often than the
    // tables say (003_BattlePalaceBattle.rb:122).
    if (randnum < atkpercent) {
      category = 0;
    } else if (randnum < atkpercent + defpercent) {
      category = 1;
    } else {
      category = 2;
    }
    const moves: number[] = [];
    for (let i = 0; i < thisBattler.moves.length; i++) {
      if (!this.pbCanChooseMovePartial(idxBattler, i)) continue;
      if (this.pbMoveCategory(thisBattler.moves[i]!) !== category) continue;
      moves[moves.length] = i;
    }
    if (moves.length === 0) {
      // No moves of selected category
      await this.pbRegisterMove(idxBattler, -2);
    } else {
      const chosenmove = moves[this.battleAI.pbAIRandom(moves.length)]!;
      await this.pbRegisterMove(idxBattler, chosenmove);
    }
    return true;
  }

  async pbPinchChange(battler: Battler | null): Promise<void> {
    if (!battler || battler.fainted()) return;
    if (battler.effects[PBEffects.Pinch] || battler.status === "SLEEP") return;
    if (battler.hp > Math.floor(battler.totalhp / 2)) return;
    const nature: Id = battler.nature()!.id;
    battler.effects[PBEffects.Pinch] = true;
    switch (nature) {
      case "QUIET": case "BASHFUL": case "NAIVE": case "QUIRKY": case "HARDY": case "DOCILE": case "SERIOUS":
        await this.pbDisplay(_INTL("{1} is eager for more!", battler.pbThis()));
        break;
      case "CAREFUL": case "RASH": case "LAX": case "SASSY": case "MILD": case "TIMID":
        await this.pbDisplay(_INTL("{1} began growling deeply!", battler.pbThis()));
        break;
      case "GENTLE": case "ADAMANT": case "HASTY": case "LONELY": case "RELAXED": case "NAUGHTY":
        await this.pbDisplay(_INTL("A glint appears in {1}'s eyes!", battler.pbThis(true)));
        break;
      case "JOLLY": case "BOLD": case "BRAVE": case "CALM": case "IMPISH": case "MODEST":
        await this.pbDisplay(_INTL("{1} is getting into position!", battler.pbThis()));
        break;
    }
  }

  override async pbEndOfRoundPhase(): Promise<void> {
    await super.pbEndOfRoundPhase();
    if (this.decision !== 0) return;
    for (const b of this.allBattlers()) await this.pbPinchChange(b);
  }
}

//===============================================================================
// Battle::AI (initialize alias: @justswitched, made on first use here)
//===============================================================================
const battlePalacePbEnemyShouldWithdraw = AI.prototype.pbEnemyShouldWithdraw;

AI.prototype.pbEnemyShouldWithdraw = async function (this: AI, idxBattler: number): Promise<boolean> {
  if (!this.battlePalace) return battlePalacePbEnemyShouldWithdraw.call(this, idxBattler);
  this.justswitched ??= [false, false, false, false];
  const thispkmn = this.battle.battlers[idxBattler]!;
  let shouldswitch = false;
  if (thispkmn.effects[PBEffects.PerishSong] === 1) {
    shouldswitch = true;
  } else if (!(await this.battle.pbCanChooseAnyMove(idxBattler)) && thispkmn.turnCount && thispkmn.turnCount > 5) {
    shouldswitch = true;
  } else {
    const hppercent = Math.floor((thispkmn.hp * 100) / thispkmn.totalhp);
    const percents: number[] = [];
    let maxindex = -1;
    let maxpercent = 0;
    let factor = 0;
    this.battle.pbParty(idxBattler).forEach((pkmn, i) => {
      if (this.battle.pbCanSwitch(idxBattler, i)) {
        percents[i] = Math.floor((100 * pkmn!.hp) / pkmn!.totalhp);
        if (percents[i]! > maxpercent) {
          maxindex = i;
          maxpercent = percents[i]!;
        }
      } else {
        percents[i] = 0;
      }
    });
    if (hppercent < 50) factor = maxpercent < hppercent ? 20 : 40;
    if (hppercent < 25) factor = maxpercent < hppercent ? 30 : 50;
    switch (thispkmn.status) {
      case "SLEEP": case "FROZEN": factor += 20; break;
      case "POISON": case "BURN": factor += 10; break;
      case "PARALYSIS": factor += 15; break;
    }
    if (this.justswitched[idxBattler]) {
      factor -= 60;
      if (factor < 0) factor = 0;
    }
    shouldswitch = this.pbAIRandom(100) < factor;
    if (shouldswitch && maxindex >= 0) {
      // NOTE (Ruby parity): returns before recording @justswitched, so it is
      // only set when no healthier Pokémon was found (003_BattlePalaceBattle.rb:229).
      this.battle.pbRegisterSwitch(idxBattler, maxindex);
      return true;
    }
  }
  this.justswitched[idxBattler] = shouldswitch;
  if (shouldswitch) {
    const party = this.battle.pbParty(idxBattler);
    for (let i = 0; i < party.length; i++) {
      if (!this.battle.pbCanSwitch(idxBattler, i)) continue;
      this.battle.pbRegisterSwitch(idxBattler, i);
      return true;
    }
  }
  return false;
};
