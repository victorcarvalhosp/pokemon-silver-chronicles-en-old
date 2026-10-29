// Port of Data/Scripts/011_Battle/005_AI/003_AI_Switch.rb, with:
// - Generation 9 Pack ([001] Battle/[003] Battle_AI.rb:81,92):
//   pbDefaultChooseReviveEnemy (new; Revival Blessing and revival items), and
//   pbEnemyShouldWithdrawEx? (alias: forces a switch to trigger Zero to Hero).
// Alias chain: pbEnemyShouldWithdrawEx? = Gen 9( core ).

import type { Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Effectiveness } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { rubyDiv } from "../rubyMath";
import { AI, PBTrainerAI, truthy } from "./Battle_AI";

/** Core's pbEnemyShouldWithdrawEx? (Gen 9 Pack's paldea_pbEnemyShouldWithdrawEx?). */
async function coreEnemyShouldWithdrawEx(ai: AI, idxBattler: number, forceSwitch: boolean): Promise<boolean> {
  const battle = ai.battle;
  if (battle.wildBattle()) return false;
  let shouldSwitch = forceSwitch;
  let batonPass = -1;
  let moveType: Id | null = null;
  const skill = battle.pbGetOwnerFromBattlerIndex(idxBattler)!.skillLevel() || 0;
  const battler = battle.battlers[idxBattler]!;
  // If Pokémon is within 6 levels of the foe, and foe's last move was
  // super-effective and powerful
  if (!shouldSwitch && battler.turnCount > 0 && skill >= PBTrainerAI.highSkill()) {
    const target = battler.pbDirectOpposing(true);
    if (!target.fainted() && target.lastMoveUsed &&
        Math.abs(target.level - battler.level) <= 6) {
      const moveData = MoveData.get(target.lastMoveUsed);
      moveType = moveData.type;
      const typeMod = ai.pbCalcTypeMod(moveType, target, battler);
      if (Effectiveness.superEffective(typeMod) && moveData.baseDamage > 50) {
        const switchChance = (moveData.baseDamage > 70) ? 30 : 20;
        shouldSwitch = (ai.pbAIRandom(100) < switchChance);
      }
    }
  }
  // Pokémon can't do anything (must have been in battle for at least 5 rounds)
  if (!(await battle.pbCanChooseAnyMove(idxBattler)) &&
      battler.turnCount >= 5) {
    shouldSwitch = true;
  }
  // Pokémon is Perish Songed and has Baton Pass
  if (skill >= PBTrainerAI.highSkill() && battler.effects[PBEffects.PerishSong] === 1) {
    for (let i = 0; i < battler.moves.length; i++) {
      const m = battler.moves[i]!;
      if (m.function !== "SwitchOutUserPassOnEffects") continue; // Baton Pass
      if (!battle.pbCanChooseMove(idxBattler, i, false)) continue;
      batonPass = i;
      break;
    }
  }
  // Pokémon will faint because of bad poisoning at the end of this round, but
  // would survive at least one more round if it were regular poisoning instead
  if (battler.status === "POISON" && battler.statusCount > 0 &&
      skill >= PBTrainerAI.highSkill()) {
    const toxicHP = rubyDiv(battler.totalhp, 16);
    const nextToxicHP = toxicHP * (battler.effects[PBEffects.Toxic] + 1);
    if (battler.hp <= nextToxicHP && battler.hp > toxicHP * 2 && ai.pbAIRandom(100) < 80) {
      shouldSwitch = true;
    }
  }
  // Pokémon is Encored into an unfavourable move
  if (battler.effects[PBEffects.Encore] > 0 && skill >= PBTrainerAI.mediumSkill()) {
    const idxEncoredMove = battler.pbEncoredMoveIndex();
    if (idxEncoredMove >= 0) {
      let scoreSum = 0;
      let scoreCount = 0;
      for (const b of battler.allOpposing()) {
        scoreSum += await ai.pbGetMoveScore(battler.moves[idxEncoredMove]!, battler, b, skill);
        scoreCount += 1;
      }
      if (scoreCount > 0 && rubyDiv(scoreSum, scoreCount) <= 20 && ai.pbAIRandom(100) < 80) {
        shouldSwitch = true;
      }
    }
  }
  // If there is a single foe and it is resting after Hyper Beam or is
  // Truanting (i.e. free turn)
  if (battle.pbSideSize(battler.index + 1) === 1 &&
      !battler.pbDirectOpposing().fainted() && skill >= PBTrainerAI.highSkill()) {
    const opp = battler.pbDirectOpposing();
    if ((opp.effects[PBEffects.HyperBeam] > 0 ||
        (opp.hasActiveAbility("TRUANT") && opp.effects[PBEffects.Truant])) && ai.pbAIRandom(100) < 80) {
      shouldSwitch = false;
    }
  }
  // Sudden Death rule - I'm not sure what this means
  if (truthy(battle.rules.suddendeath) && battler.turnCount > 0) {
    if (battler.hp <= rubyDiv(battler.totalhp, 4) && ai.pbAIRandom(100) < 30) {
      shouldSwitch = true;
    } else if (battler.hp <= rubyDiv(battler.totalhp, 2) && ai.pbAIRandom(100) < 80) {
      shouldSwitch = true;
    }
  }
  // Pokémon is about to faint because of Perish Song
  if (battler.effects[PBEffects.PerishSong] === 1) {
    shouldSwitch = true;
  }
  if (shouldSwitch) {
    const list: number[] = [];
    const [, idxPartyEnd] = battle.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    const party = battle.pbParty(idxBattler);
    for (let i = 0; i < party.length; i++) {
      const pkmn = party[i]!;
      if (i === idxPartyEnd - 1) continue; // Don't choose to switch in ace
      if (!battle.pbCanSwitch(idxBattler, i)) continue;
      // If perish count is 1, it may be worth it to switch
      // even with Spikes, since Perish Song's effect will end
      if (battler.effects[PBEffects.PerishSong] !== 1) {
        // Will contain effects that recommend against switching
        const spikes = battler.pbOwnSide().effects[PBEffects.Spikes] as number;
        // Don't switch to this if too little HP
        if (spikes > 0) {
          const spikesDmg = [8, 6, 4][spikes - 1]!;
          if (pkmn.hp <= rubyDiv(pkmn.totalhp, spikesDmg) && !pkmn.hasType("FLYING")) {
            // Ruby: Pokemon has no hasActiveAbility? (NoMethodError)
            throw new Error("NoMethodError: undefined method `hasActiveAbility?' for Pokemon");
          }
        }
      }
      // moveType is the type of the target's last used move
      // (Ruby: the effectiveness is against the battler switching out, not pkmn)
      if (moveType && Effectiveness.ineffective(ai.pbCalcTypeMod(moveType, battler, battler))) {
        let weight = 65;
        const typeMod = ai.pbCalcTypeModPokemon(pkmn, battler.pbDirectOpposing(true));
        if (Effectiveness.superEffective(typeMod)) {
          // Greater weight if new Pokemon's type is effective against target
          weight = 85;
        }
        if (ai.pbAIRandom(100) < weight) list.unshift(i); // Put this Pokemon first
      } else if (moveType && Effectiveness.resistant(ai.pbCalcTypeMod(moveType, battler, battler))) {
        let weight = 40;
        const typeMod = ai.pbCalcTypeModPokemon(pkmn, battler.pbDirectOpposing(true));
        if (Effectiveness.superEffective(typeMod)) {
          // Greater weight if new Pokemon's type is effective against target
          weight = 60;
        }
        if (ai.pbAIRandom(100) < weight) list.unshift(i); // Put this Pokemon first
      } else {
        list.push(i); // put this Pokemon last
      }
    }
    if (list.length > 0) {
      if (batonPass >= 0 && await battle.pbRegisterMove(idxBattler, batonPass, false)) {
        PBDebug.log(`[AI] ${battler.pbThis()} (${idxBattler}) will use Baton Pass to avoid Perish Song`);
        return true;
      }
      if (battle.pbRegisterSwitch(idxBattler, list[0]!)) {
        PBDebug.log(`[AI] ${battler.pbThis()} (${idxBattler}) will switch with ` +
          battle.pbParty(idxBattler)[list[0]!]!.name);
        return true;
      }
    }
  }
  return false;
}

const methods = {
  //=============================================================================
  // Decide whether the opponent should switch Pokémon
  //=============================================================================
  async pbEnemyShouldWithdraw(this: AI, idxBattler: number): Promise<boolean> {
    return this.pbEnemyShouldWithdrawEx(idxBattler, false);
  },

  /** Generation 9 Pack's alias: encourages AI trainers to switch out to trigger Zero to Hero. */
  async pbEnemyShouldWithdrawEx(this: AI, idxBattler: number, forceSwitch: boolean): Promise<boolean> {
    if (this.battle.wildBattle()) return false;
    const battler = this.battle.battlers[idxBattler]!;
    if (battler.hasActiveAbility("ZEROTOHERO") && battler.form === 0) {
      const switchFunctions = [
        "SwitchOutUserStatusMove", // Teleport
        "SwitchOutUserDamagingMove", // U-Turn/Volt Switch
        "SwitchOutUserPassOnEffects", // Baton Pass
        "LowerTargetAtkSpAtk1SwitchOutUser", // Parting Shot
        "StartHailWeatherSwitchOutUser", // Chilly Reception
        "UserMakeSubstituteSwitchOut", // Shed Tail
      ];
      for (let i = 0; i < battler.moves.length; i++) {
        if (!switchFunctions.includes(battler.moves[i]!.function)) continue;
        if (!this.battle.pbCanChooseMove(idxBattler, i, false)) continue;
        forceSwitch = true;
        break;
      }
    }
    return coreEnemyShouldWithdrawEx(this, idxBattler, forceSwitch);
  },

  //=============================================================================
  // Choose a replacement Pokémon
  //=============================================================================
  pbDefaultChooseNewEnemy(this: AI, idxBattler: number, party: (Pokemon | null)[]): number {
    const enemies: number[] = [];
    const [, idxPartyEnd] = this.battle.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    party.forEach((_p, i) => {
      if (i === idxPartyEnd - 1 && enemies.length > 0) return; // Ignore ace if possible
      if (this.battle.pbCanSwitchLax(idxBattler, i)) enemies.push(i);
    });
    if (enemies.length === 0) return -1;
    return this.pbChooseBestNewEnemy(idxBattler, party, enemies);
  },

  pbChooseBestNewEnemy(this: AI, idxBattler: number, party: (Pokemon | null)[], enemies: number[] | null): number {
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
  },

  /** Generation 9 Pack: used to allow an AI trainer to select a Pokemon in the party to revive. */
  pbDefaultChooseReviveEnemy(this: AI, idxBattler: number, party: (Pokemon | null)[]): number {
    const enemies: number[] = [];
    party.forEach((p, i) => { if (!p!.egg() && p!.fainted()) enemies.push(i); });
    return this.pbChooseBestNewEnemy(idxBattler, party, enemies);
  },
};

type Methods = typeof methods;
declare module "./Battle_AI" {
  interface AI extends Methods {}
}
Object.assign(AI.prototype, methods);
