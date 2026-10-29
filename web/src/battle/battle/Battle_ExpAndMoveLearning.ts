// Port of Data/Scripts/011_Battle/001_Battle/003_Battle_ExpAndMoveLearning.rb
// (no plugin patches these methods).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { G } from "../../game/globals";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Player } from "../../game/trainer/Player";
import type { Battler } from "../battler/Battler";
import { Move } from "../move/Move";
import { ItemEffects } from "../other/ItemEffects";
import { pbSEPlay } from "../audio";
import { Battle } from "./Battle";

/** Integer#clamp(min, max) */
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** Integer#to_word */
function toWord(n: number): string {
  const ret = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
    "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
  if (Number.isInteger(n) && n >= 0 && n <= ret.length) return ret[n] ?? "";
  return String(n);
}

const methods = {
  //=============================================================================
  // Gaining Experience
  //=============================================================================
  async pbGainExp(this: Battle): Promise<void> {
    // Play wild victory music if it's the end of the battle (has to be here)
    if (this.wildBattle() && this.pbAllFainted(1) && !this.pbAllFainted(0)) this.scene.pbWildBattleSuccess();
    if (!this.internalBattle || !this.expGain) return;
    // Go through each battler in turn to find the Pokémon that participated in
    // battle against it, and award those Pokémon Exp/EVs
    const expAll = (G.player as unknown as Player).hasExpAll || G.bag.has("EXPALL");
    const p1 = this.pbParty(0);
    for (const b of this.battlers) {
      if (!b?.opposes()) continue; // Can only gain Exp from fainted foes
      if (b.participants.length === 0) continue;
      if (!(b.fainted() || b.captured)) continue;
      // Count the number of participants
      let numPartic = 0;
      for (const partic of b.participants) {
        if (!(p1[partic]?.able() && this.pbIsOwner(0, partic))) continue;
        numPartic += 1;
      }
      // Find which Pokémon have an Exp Share
      const expShare: number[] = [];
      if (!expAll) {
        this.eachInTeam(0, 0, (pkmn, i) => {
          if (!pkmn.able()) return;
          if (!pkmn.hasItem("EXPSHARE") && Item.tryGet(this.initialItems[0]![i])?.id !== "EXPSHARE") return;
          expShare.push(i);
        });
      }
      // Calculate EV and Exp gains for the participants
      if (numPartic > 0 || expShare.length > 0 || expAll) {
        // Gain EVs and Exp for participants
        const team: [Pokemon, number][] = [];
        this.eachInTeam(0, 0, (pkmn, i) => team.push([pkmn, i]));
        for (const [pkmn, i] of team) {
          if (!pkmn.able()) continue;
          if (!(b.participants.includes(i) || expShare.includes(i))) continue;
          this.pbGainEVsOne(i, b);
          await this.pbGainExpOne(i, b, numPartic, expShare, expAll, !pkmn.shadowPokemon());
        }
        // Gain EVs and Exp for all other Pokémon because of Exp All
        if (expAll) {
          let showMessage = true;
          const team2: [Pokemon, number][] = [];
          this.eachInTeam(0, 0, (pkmn, i) => team2.push([pkmn, i]));
          for (const [pkmn, i] of team2) {
            if (!pkmn.able()) continue;
            if (b.participants.includes(i) || expShare.includes(i)) continue;
            if (showMessage) await this.pbDisplayPaused(_INTL("Your other Pokémon also gained Exp. Points!"));
            showMessage = false;
            this.pbGainEVsOne(i, b);
            await this.pbGainExpOne(i, b, numPartic, expShare, expAll, false);
          }
        }
      }
      // Clear the participants array
      b.participants = [];
    }
  },

  pbGainEVsOne(this: Battle, idxParty: number, defeatedBattler: Battler): void {
    const pkmn = this.pbParty(0)[idxParty]!; // The Pokémon gaining EVs from defeatedBattler
    const evYield = defeatedBattler.pokemon!.evYield();
    // Num of effort points pkmn already has
    let evTotal = 0;
    for (const s of Stat.eachMain()) evTotal += pkmn.ev[s.id]!;
    // Modify EV yield based on pkmn's held item
    // (Ruby passes the Pokémon itself as the handlers' battler argument.)
    const pkmnAsBattler = pkmn as unknown as Battler;
    if (!ItemEffects.triggerEVGainModifier(pkmn.item, pkmnAsBattler, evYield)) {
      ItemEffects.triggerEVGainModifier(this.initialItems[0]![idxParty] ?? null, pkmnAsBattler, evYield);
    }
    // Double EV gain because of Pokérus
    if (pkmn.pokerusStage() >= 1) { // Infected or cured
      for (const stat of Object.keys(evYield)) evYield[stat] = evYield[stat]! * 2;
    }
    // Gain EVs for each stat in turn
    if (pkmn.shadowPokemon() && pkmn.heartStage() <= 3 && pkmn.savedEv) {
      for (const e of Object.values(pkmn.savedEv)) evTotal += e;
      for (const s of Stat.eachMain()) {
        let evGain = clamp(evYield[s.id]!, 0, Pokemon.EV_STAT_LIMIT - pkmn.ev[s.id]! - pkmn.savedEv[s.id]!);
        evGain = clamp(evGain, 0, Pokemon.EV_LIMIT - evTotal);
        pkmn.savedEv[s.id] = pkmn.savedEv[s.id]! + evGain;
        evTotal += evGain;
      }
    } else {
      for (const s of Stat.eachMain()) {
        let evGain = clamp(evYield[s.id]!, 0, Pokemon.EV_STAT_LIMIT - pkmn.ev[s.id]!);
        evGain = clamp(evGain, 0, Pokemon.EV_LIMIT - evTotal);
        pkmn.ev[s.id] = pkmn.ev[s.id]! + evGain;
        evTotal += evGain;
      }
    }
  },

  async pbGainExpOne(this: Battle, idxParty: number, defeatedBattler: Battler, numPartic: number,
    expShare: number[], expAll: boolean, showMessages = true): Promise<void> {
    const pkmn = this.pbParty(0)[idxParty]!; // The Pokémon gaining Exp from defeatedBattler
    const growthRate = pkmn.growthRate();
    // Don't bother calculating if gainer is already at max Exp
    if (pkmn.exp >= growthRate.maximumExp()) {
      pkmn.calcStats(); // To ensure new EVs still have an effect
      return;
    }
    const isPartic = defeatedBattler.participants.includes(idxParty);
    const hasExpShare = expShare.includes(idxParty);
    const level = defeatedBattler.level;
    // Main Exp calculation
    let exp = 0;
    const a = level * defeatedBattler.pokemon!.baseExp();
    if (expShare.length > 0 && (isPartic || hasExpShare)) {
      if (numPartic === 0) { // No participants, all Exp goes to Exp Share holders
        exp = Math.floor(a / (Settings.SPLIT_EXP_BETWEEN_GAINERS ? expShare.length : 1));
      } else if (Settings.SPLIT_EXP_BETWEEN_GAINERS) { // Gain from participating and/or Exp Share
        if (isPartic) exp = Math.floor(a / (2 * numPartic));
        if (hasExpShare) exp += Math.floor(a / (2 * expShare.length));
      } else { // Gain from participating and/or Exp Share (Exp not split)
        exp = isPartic ? a : Math.floor(a / 2);
      }
    } else if (isPartic) { // Participated in battle, no Exp Shares held by anyone
      exp = Math.floor(a / (Settings.SPLIT_EXP_BETWEEN_GAINERS ? numPartic : 1));
    } else if (expAll) { // Didn't participate in battle, gaining Exp due to Exp All
      // NOTE: Exp All works like the Exp Share from Gen 6+, not like the Exp All
      //       from Gen 1, i.e. Exp isn't split between all Pokémon gaining it.
      exp = Math.floor(a / 2);
    }
    if (exp <= 0) return;
    // Pokémon gain more Exp from trainer battles
    if (Settings.MORE_EXP_FROM_TRAINER_POKEMON && this.trainerBattle()) exp = Math.floor(exp * 1.5);
    // Scale the gained Exp based on the gainer's level (or not)
    if (Settings.SCALED_EXP_FORMULA) {
      exp = Math.floor(exp / 5);
      let levelAdjust = ((2 * level) + 10.0) / (pkmn.level + level + 10.0);
      levelAdjust = levelAdjust ** 5;
      levelAdjust = Math.sqrt(levelAdjust);
      exp *= levelAdjust;
      exp = Math.floor(exp);
      if (isPartic || hasExpShare) exp += 1;
    } else {
      exp = Math.floor(exp / 7);
    }
    // Foreign Pokémon gain more Exp
    const player = this.pbPlayer();
    let isOutsider = (pkmn.owner.id !== player.id ||
                     (pkmn.owner.language !== 0 && pkmn.owner.language !== player.language));
    if (isOutsider) {
      if (pkmn.owner.language !== 0 && pkmn.owner.language !== player.language) {
        exp = Math.floor(exp * 1.7);
      } else {
        exp = Math.floor(exp * 1.5);
      }
    }
    // Exp. Charm increases Exp gained
    if (G.bag.has("EXPCHARM")) exp = Math.floor(exp * 3 / 2);
    // Modify Exp gain based on pkmn's held item
    // (Ruby passes the Pokémon itself as the handlers' battler argument.)
    const pkmnAsBattler = pkmn as unknown as Battler;
    let i = ItemEffects.triggerExpGainModifier(pkmn.item, pkmnAsBattler, exp);
    if (i < 0) {
      i = ItemEffects.triggerExpGainModifier(this.initialItems[0]![idxParty] ?? null, pkmnAsBattler, exp);
    }
    if (i >= 0) exp = i;
    // Boost Exp gained with high affection
    if (Settings.AFFECTION_EFFECTS && this.internalBattle && pkmn.affectionLevel() >= 4 && !pkmn.mega()) {
      exp = Math.floor(exp * 6 / 5);
      isOutsider = true; // To show the "boosted Exp" message
    }
    // Make sure Exp doesn't exceed the maximum
    const expFinal = growthRate.addExp(pkmn.exp, exp);
    const expGained = expFinal - pkmn.exp;
    if (expGained <= 0) return;
    // "Exp gained" message
    if (showMessages) {
      if (isOutsider) {
        await this.pbDisplayPaused(_INTL("{1} got a boosted {2} Exp. Points!", pkmn.name, expGained));
      } else {
        await this.pbDisplayPaused(_INTL("{1} got {2} Exp. Points!", pkmn.name, expGained));
      }
    }
    let curLevel = pkmn.level;
    const newLevel = growthRate.levelFromExp(expFinal);
    if (newLevel < curLevel) {
      const debugInfo = `Levels: ${curLevel}->${newLevel} | Exp: ${pkmn.exp}->${expFinal} | gain: ${expGained}`;
      throw new Error(_INTL("{1}'s new level is less than its\r\ncurrent level, which shouldn't happen.\r\n[Debug: {2}]",
        pkmn.name, debugInfo));
    }
    // Give Exp
    if (pkmn.shadowPokemon()) {
      if (pkmn.heartStage() <= 3) {
        pkmn.exp += expGained;
        G.stats.totalExpGained += expGained;
      }
      return;
    }
    G.stats.totalExpGained += expGained;
    let tempExp1 = pkmn.exp;
    const battler = this.pbFindBattler(idxParty);
    for (;;) { // For each level gained in turn...
      // EXP Bar animation
      const levelMinExp = growthRate.minimumExpForLevel(curLevel);
      const levelMaxExp = growthRate.minimumExpForLevel(curLevel + 1);
      const tempExp2 = levelMaxExp < expFinal ? levelMaxExp : expFinal;
      pkmn.exp = tempExp2;
      // battler is nil when the Pokémon isn't in battle (the scene returns early)
      await this.scene.pbEXPBar(battler as Battler, levelMinExp, levelMaxExp, tempExp1, tempExp2);
      tempExp1 = tempExp2;
      curLevel += 1;
      if (curLevel > newLevel) {
        // Gained all the Exp now, end the animation
        pkmn.calcStats();
        battler?.pbUpdate(false);
        if (battler) this.scene.pbRefreshOne(battler.index);
        break;
      }
      // Levelled up
      if (battler) await this.pbCommonAnimation("LevelUp", battler);
      const oldTotalHP = pkmn.totalhp;
      const oldAttack = pkmn.attack;
      const oldDefense = pkmn.defense;
      const oldSpAtk = pkmn.spatk;
      const oldSpDef = pkmn.spdef;
      const oldSpeed = pkmn.speed;
      if (battler?.pokemon) {
        battler.pokemon.changeHappiness("levelup");
      }
      pkmn.calcStats();
      battler?.pbUpdate(false);
      if (battler) this.scene.pbRefreshOne(battler.index);
      await this.pbDisplayPaused(_INTL("{1} grew to Lv. {2}!", pkmn.name, curLevel));
      await this.scene.pbLevelUp(pkmn, battler, oldTotalHP, oldAttack, oldDefense,
        oldSpAtk, oldSpDef, oldSpeed);
      // Learn all moves learned at this level
      const moveList = pkmn.getMoveList();
      for (const m of moveList) {
        if (m.level === curLevel) await this.pbLearnMove(idxParty, m.move);
      }
    }
  },

  //=============================================================================
  // Learning a move
  //=============================================================================
  async pbLearnMove(this: Battle, idxParty: number, newMove: Id): Promise<void> {
    const pkmn = this.pbParty(0)[idxParty];
    if (!pkmn) return;
    const pkmnName = pkmn.name;
    const battler = this.pbFindBattler(idxParty);
    const moveName = MoveData.get(newMove).name;
    // Pokémon already knows the move
    if (pkmn.hasMove(newMove)) return;
    // Pokémon has space for the new move; just learn it
    if (pkmn.numMoves() < Pokemon.MAX_MOVES) {
      pkmn.learnMove(newMove);
      await this.pbDisplay(_INTL("{1} learned {2}!", pkmnName, moveName), () => pbSEPlay("Pkmn move learnt"));
      if (battler) {
        battler.moves.push(Move.fromPokemonMove(this, pkmn.moves[pkmn.moves.length - 1]!));
        await battler.pbCheckFormOnMovesetChange();
      }
      return;
    }
    // Pokémon already knows the maximum number of moves; try to forget one to learn the new move
    await this.pbDisplayPaused(_INTL("{1} wants to learn {2}, but it already knows {3} moves.",
      pkmnName, moveName, toWord(pkmn.numMoves())));
    if (await this.pbDisplayConfirm(_INTL("Should {1} forget a move to learn {2}?", pkmnName, moveName))) {
      for (;;) {
        const forgetMove = await this.scene.pbForgetMove(pkmn, newMove);
        if (forgetMove >= 0) {
          const oldMoveName = pkmn.moves[forgetMove]!.name;
          pkmn.moves[forgetMove] = new PokemonMove(newMove); // Replaces current/total PP
          if (battler) battler.moves[forgetMove] = Move.fromPokemonMove(this, pkmn.moves[forgetMove]!);
          await this.pbDisplayPaused(_INTL("1, 2, and... ... ... Ta-da!"), () => pbSEPlay("Battle ball drop"));
          await this.pbDisplayPaused(_INTL("{1} forgot how to use {2}. And...", pkmnName, oldMoveName));
          await this.pbDisplay(_INTL("{1} learned {2}!", pkmnName, moveName), () => pbSEPlay("Pkmn move learnt"));
          await battler?.pbCheckFormOnMovesetChange();
          break;
        } else if (await this.pbDisplayConfirm(_INTL("Give up on learning {1}?", moveName))) {
          await this.pbDisplay(_INTL("{1} did not learn {2}.", pkmnName, moveName));
          break;
        }
      }
    } else {
      await this.pbDisplay(_INTL("{1} did not learn {2}.", pkmnName, moveName));
    }
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
