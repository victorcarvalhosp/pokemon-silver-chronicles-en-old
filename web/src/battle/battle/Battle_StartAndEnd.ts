// Port of Data/Scripts/011_Battle/001_Battle/002_Battle_StartAndEnd.rb, with
// the plugin patches to these methods:
// - Essentials Deluxe ([002] Battle Deluxe/Battle_Deluxe.rb:344):
//   pbStartBattleSendOut (rewritten: [:introtext] rule, name_title).
// - Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:223):
//   pbLoseMoney ("loss" midbattle trigger).
// - ZUD Mechanics ([003] Battle/Battle_Overrides.rb:281): pbEndOfBattle
//   (reverts Dynamax at the end of battle).
// Also Battle::SuccessState (007_Other battle types/004_BattleArenaBattle.rb:4),
// which pbCreateBattler creates, and PBDebug.logonerr
// (001_Technical/001_Debugging/001_PBDebug.rb:4), which pbBattleLoop uses.

import { _INTL } from "../../data/gameData/gameData";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness } from "../../data/gameData/type";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { Battler } from "../battler/Battler";
import { ActivePosition } from "../other/ActiveField";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battle } from "./Battle";

/** Battle::BattleAbortedException (a Ruby Exception, not a StandardError). */
export class BattleAbortedException extends Error {
  constructor(message = "Battle aborted") {
    super(message);
    this.name = "BattleAbortedException";
  }
}

//===============================================================================
// Success state (007_Other battle types/004_BattleArenaBattle.rb)
//===============================================================================
export class SuccessState {
  typeMod = Effectiveness.NORMAL_EFFECTIVE;
  /** 0 - not used, 1 - failed, 2 - succeeded */
  useState = 0;
  protected = false;
  skill = 0;

  constructor() { this.clear(); }

  clear(full = true): void {
    this.typeMod = Effectiveness.NORMAL_EFFECTIVE;
    this.useState = 0;
    this.protected = false;
    if (full) this.skill = 0;
  }

  updateSkill(): void {
    switch (this.useState) {
      case 1:
        if (!this.protected) this.skill = -2;
        break;
      case 2:
        if (Effectiveness.superEffective(this.typeMod)) {
          this.skill = 2;
        } else if (Effectiveness.normal(this.typeMod)) {
          this.skill = 1;
        } else if (Effectiveness.notVeryEffective(this.typeMod)) {
          this.skill = -1;
        } else { // Ineffective
          this.skill = -2;
        }
        break;
    }
    this.clear(false);
  }
}

/**
 * PBDebug.logonerr: runs the block; a StandardError raised in it is logged and
 * printed (pbPrintException) and the battle carries on. Ruby's bare `rescue`
 * doesn't catch BattleAbortedException (an Exception), so that propagates.
 */
async function logonerr(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof BattleAbortedException || !(e instanceof Error)) throw e;
    PBDebug.log("");
    PBDebug.log(`**Exception: ${e.message}`);
    PBDebug.log(String(e.stack));
    PBDebug.log("");
    console.error(e); // pbPrintException($!)
    // Ruby shows the exception in a message box and carries on with the battle.
    // In the browser an error that repeats every phase would spin forever, so
    // unless PBDebug.continueOnError is set the error propagates.
    if (!PBDebug.continueOnError) throw e;
  }
}

/** Array#to_s, for the debug log. */
const inspectArray = (a: (number | undefined)[]): string =>
  `[${Array.from(a, (x) => (x == null ? "nil" : String(x))).join(", ")}]`;

/** Integer#to_s_formatted: thousands separators. */
const toSFormatted = (n: number): string => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const methods = {
  pbAbort(this: Battle): never {
    throw new BattleAbortedException("Battle aborted");
  },

  //=============================================================================
  // Makes sure all Pokémon exist that need to. Alter the type of battle if
  // necessary. Will never try to create battler positions, only delete them
  // (except for wild Pokémon whose number of positions are fixed). Reduces the
  // size of each side by 1 and tries again. If the side sizes are uneven, only
  // the larger side's size will be reduced by 1 each time, until both sides are
  // an equal size (then both sides will be reduced equally).
  //=============================================================================
  pbEnsureParticipants(this: Battle): void {
    // Prevent battles larger than 2v2 if both sides have multiple trainers
    // NOTE: This is necessary to ensure that battlers can never become unable to
    //       hit each other due to being too far away. In such situations,
    //       battlers will move to the centre position at the end of a round, but
    //       because they cannot move into a position owned by a different
    //       trainer, it's possible that battlers will be unable to move close
    //       enough to hit each other if there are multiple trainers on both
    //       sides.
    if (this.trainerBattle() && (this.sideSizes[0]! > 2 || this.sideSizes[1]! > 2) &&
        this.player!.length > 1 && this.opponent!.length > 1) {
      throw new Error(_INTL("Can't have battles larger than 2v2 where both sides have multiple trainers"));
    }
    // Find out how many Pokémon each trainer has
    const side1counts = this.pbAbleTeamCounts(0);
    const side2counts = this.pbAbleTeamCounts(1);
    // Change the size of the battle depending on how many wild Pokémon there are
    if (this.wildBattle() && side2counts[0] !== this.sideSizes[1]) {
      if (this.sideSizes[0] === this.sideSizes[1]) {
        // Even number of battlers per side, change both equally
        this.sideSizes = [side2counts[0]!, side2counts[0]!];
      } else {
        // Uneven number of battlers per side, just change wild side's size
        this.sideSizes[1] = side2counts[0]!;
      }
    }
    // Check if battle is possible, including changing the number of battlers per
    // side if necessary
    for (;;) {
      let needsChanging = false;
      for (let side = 0; side < 2; side++) { // Each side in turn
        if (side === 1 && this.wildBattle()) continue; // Wild side's size already checked above
        const sideCounts = side === 0 ? side1counts : side2counts;
        const requireds: number[] = [];
        // Find out how many Pokémon each trainer on side needs to have
        for (let i = 0; i < this.sideSizes[side]!; i++) {
          const idxTrainer = this.pbGetOwnerIndexFromBattlerIndex((i * 2) + side);
          if (requireds[idxTrainer] == null) requireds[idxTrainer] = 0;
          requireds[idxTrainer] += 1;
        }
        // Compare the have values with the need values
        if (requireds.length > sideCounts.length) {
          throw new Error(_INTL("Error: def pbGetOwnerIndexFromBattlerIndex gives invalid owner index ({1} for battle type {2}v{3}, trainers {4}v{5})",
            requireds.length - 1, this.sideSizes[0], this.sideSizes[1], side1counts.length, side2counts.length));
        }
        for (let i = 0; i < sideCounts.length; i++) {
          if (!requireds[i] || requireds[i] === 0) {
            switch (side) {
              case 0:
                throw new Error(_INTL("Player-side trainer {1} has no battler position for their Pokémon to go (trying {2}v{3} battle)",
                  i + 1, this.sideSizes[0], this.sideSizes[1]));
              case 1:
                throw new Error(_INTL("Opposing trainer {1} has no battler position for their Pokémon to go (trying {2}v{3} battle)",
                  i + 1, this.sideSizes[0], this.sideSizes[1]));
            }
          }
          // NOTE: sideCounts[i] is nil in Ruby for a team with no able Pokémon
          //       (Integer <= nil raises there); here the comparison is false.
          if (requireds[i]! <= sideCounts[i]!) continue; // Trainer has enough Pokémon to fill their positions
          if (requireds[i] === 1) {
            if (side === 0) throw new Error(_INTL("Player-side trainer {1} has no able Pokémon", i + 1));
            if (side === 1) throw new Error(_INTL("Opposing trainer {1} has no able Pokémon", i + 1));
          }
          // Not enough Pokémon, try lowering the number of battler positions
          needsChanging = true;
          break;
        }
        if (needsChanging) break;
      }
      if (!needsChanging) break;
      // Reduce one or both side's sizes by 1 and try again
      let newSize: number;
      if (this.wildBattle()) {
        PBDebug.log(`${this.sideSizes[0]}v${this.sideSizes[1]} battle isn't possible ` +
                    `(${inspectArray(side1counts)} player-side teams versus ${side2counts[0]} wild Pokémon)`);
        newSize = this.sideSizes[0]! - 1;
      } else {
        PBDebug.log(`${this.sideSizes[0]}v${this.sideSizes[1]} battle isn't possible ` +
                    `(${inspectArray(side1counts)} player-side teams versus ${inspectArray(side2counts)} opposing teams)`);
        newSize = Math.max(...this.sideSizes) - 1;
      }
      if (newSize === 0) {
        throw new Error(_INTL("Couldn't lower either side's size any further, battle isn't possible"));
      }
      for (let side = 0; side < 2; side++) {
        if (side === 1 && this.wildBattle()) continue; // Wild Pokémon's side size is fixed
        if (this.sideSizes[side] === 1 || newSize > this.sideSizes[side]!) continue;
        this.sideSizes[side] = newSize;
      }
      PBDebug.log(`Trying ${this.sideSizes[0]}v${this.sideSizes[1]} battle instead`);
    }
  },

  //=============================================================================
  // Set up all battlers
  //=============================================================================
  pbCreateBattler(this: Battle, idxBattler: number, pkmn: Pokemon, idxParty: number): void {
    if (this.battlers[idxBattler] != null) {
      throw new Error(_INTL("Battler index {1} already exists", idxBattler));
    }
    this.battlers[idxBattler] = new Battler(this, idxBattler);
    this.positions[idxBattler] = new ActivePosition();
    this.pbClearChoice(idxBattler);
    this.successStates[idxBattler] = new SuccessState();
    this.battlers[idxBattler]!.pbInitialize(pkmn, idxParty);
  },

  /** Returns [side][idxTrainer] -> battler indices sent out at the start of battle. */
  pbSetUpSides(this: Battle): number[][][] {
    const ret: number[][][] = [[], []];
    for (let side = 0; side < 2; side++) {
      // Set up wild Pokémon
      if (side === 1 && this.wildBattle()) {
        this.pbParty(1).forEach((pkmn, idxPkmn) => {
          this.pbCreateBattler((2 * idxPkmn) + side, pkmn!, idxPkmn);
          // Changes the Pokémon's form upon entering battle (if it should)
          this.peer.pbOnEnteringBattle(this, this.battlers[(2 * idxPkmn) + side]!, pkmn!, true);
          this.pbSetSeen(this.battlers[(2 * idxPkmn) + side]!);
          this.usedInBattle[side]![idxPkmn] = true;
        });
        continue;
      }
      // Set up player's Pokémon and trainers' Pokémon
      const trainer = side === 0 ? this.player! : this.opponent!;
      const requireds: number[] = [];
      // Find out how many Pokémon each trainer on side needs to have
      for (let i = 0; i < this.sideSizes[side]!; i++) {
        const idxTrainer = this.pbGetOwnerIndexFromBattlerIndex((i * 2) + side);
        if (requireds[idxTrainer] == null) requireds[idxTrainer] = 0;
        requireds[idxTrainer] += 1;
      }
      // For each trainer in turn, find the needed number of Pokémon for them to
      // send out, and initialize them
      // NOTE: battlerNumber isn't reset for each trainer (as in Ruby), so the
      //       party order swap below compares against starts[idxTrainer] plus
      //       the number of battlers already created on this side.
      let battlerNumber = 0;
      const partyOrder = this.pbPartyOrder(side);
      const starts = this.pbPartyStarts(side);
      for (let idxTrainer = 0; idxTrainer < trainer.length; idxTrainer++) {
        ret[side]![idxTrainer] = [];
        // eachInTeam(side, idxTrainer) (inlined so that `break` works)
        const party = this.pbParty(side);
        const idxPartyStart = starts[idxTrainer]!;
        const idxPartyEnd = idxTrainer < starts.length - 1 ? starts[idxTrainer + 1]! : party.length;
        for (let idxPkmn = 0; idxPkmn < party.length; idxPkmn++) {
          const pkmn = party[idxPkmn];
          if (!pkmn || idxPkmn < idxPartyStart || idxPkmn >= idxPartyEnd) continue;
          if (!pkmn.able()) continue;
          const idxBattler = (2 * battlerNumber) + side;
          this.pbCreateBattler(idxBattler, pkmn, idxPkmn);
          ret[side]![idxTrainer]!.push(idxBattler);
          if (idxPkmn !== starts[idxTrainer]! + battlerNumber) {
            const idxOther = starts[idxTrainer]! + battlerNumber;
            [partyOrder[idxPkmn], partyOrder[idxOther]] = [partyOrder[idxOther]!, partyOrder[idxPkmn]!];
          }
          battlerNumber += 1;
          if (ret[side]![idxTrainer]!.length >= requireds[idxTrainer]!) break;
        }
      }
    }
    return ret;
  },

  //=============================================================================
  // Send out all battlers at the start of battle
  // Essentials Deluxe (Battle_Deluxe.rb:344): rewritten for the [:introtext]
  // rule and name titles.
  //=============================================================================
  async pbStartBattleSendOut(this: Battle, sendOuts: number[][][]): Promise<void> {
    // "Want to battle" messages
    const dxRules = (G.gameTemp as unknown as { dxRules?: Record<string, unknown> | null }).dxRules;
    // foes = @opponent || pbParty(1); names are foe.name (wild) or foe.full_name
    const foeNames: string[] = this.wildBattle()
      ? this.pbParty(1).map((foe) => foe!.name)
      : this.opponent!.map((foe) => foe.fullName());
    // $game_temp.dx_rules? && $game_temp.dx_rules[:introtext]
    if (dxRules != null && Object.keys(dxRules).length > 0 &&
        dxRules.introtext != null && dxRules.introtext !== false) {
      await this.pbDisplayPaused(_INTL(String(dxRules.introtext), ...foeNames));
    } else {
      let msg = this.wildBattle() ? "Oh! A wild " : "You are challenged by ";
      foeNames.forEach((name, i) => {
        if (i > 0) msg += i === foeNames.length - 1 ? " and " : ", ";
        msg += name;
      });
      msg += this.wildBattle() ? " appeared!" : "!";
      await this.pbDisplayPaused(_INTL("{1}", msg));
    }
    // Send out Pokémon (opposing trainers first)
    for (const side of [1, 0]) {
      if (side === 1 && this.wildBattle()) continue;
      let msg = "";
      const toSendOut: number[] = [];
      const trainers = side === 0 ? [...this.player!].reverse() : this.opponent!;
      for (let i = 0; i < trainers.length; i++) {
        const t = trainers[i]!;
        if (msg.length > 0) msg += "\r\n";
        let sent: number[];
        if (side === 0 && i === trainers.length - 1) {
          msg += "Go! ";
          sent = sendOuts[side]![0]!;
        } else {
          msg += `${t.fullName()} sent out `;
          // NOTE: Every partner trainer uses sendOuts[0][1] (as in Deluxe).
          sent = side === 0 ? sendOuts[0]![1]! : sendOuts[1]![i]!;
        }
        sent.forEach((idxBattler, j) => {
          if (j > 0) msg += j === sent.length - 1 ? " and " : ", ";
          msg += this.battlers[idxBattler]!.nameTitle();
        });
        msg += "!";
        toSendOut.push(...sent);
      }
      if (msg.length > 0) await this.pbDisplayBrief(_INTL("{1}", msg));
      // The actual sending out of Pokémon
      const animSendOuts: [number, Pokemon][] = [];
      for (const idxBattler of toSendOut) {
        animSendOuts.push([idxBattler, this.battlers[idxBattler]!.pokemon!]);
      }
      await this.pbSendOut(animSendOuts, true);
    }
  },

  //=============================================================================
  // Start a battle
  //=============================================================================
  /** The battle's entry point; returns this.decision. */
  async pbStartBattle(this: Battle): Promise<number> {
    PBDebug.log("");
    PBDebug.log("******************************************");
    let logMsg = "[Started battle] ";
    if (this.sideSizes[0] === 1 && this.sideSizes[1] === 1) {
      logMsg += "Single ";
    } else if (this.sideSizes[0] === 2 && this.sideSizes[1] === 2) {
      logMsg += "Double ";
    } else if (this.sideSizes[0] === 3 && this.sideSizes[1] === 3) {
      logMsg += "Triple ";
    } else {
      logMsg += `${this.sideSizes[0]}v${this.sideSizes[1]} `;
    }
    if (this.wildBattle()) logMsg += "wild ";
    if (this.trainerBattle()) logMsg += "trainer ";
    logMsg += `battle (${this.player!.length} trainer(s) vs. `;
    if (this.wildBattle()) logMsg += `${this.pbParty(1).length} wild Pokémon)`;
    if (this.trainerBattle()) logMsg += `${this.opponent!.length} trainer(s))`;
    PBDebug.log(logMsg);
    this.pbEnsureParticipants();
    for (const pkmn of this.pbParty(0)) if (pkmn) this.peer.pbOnStartingBattle(this, pkmn, this.wildBattle());
    for (const pkmn of this.pbParty(1)) if (pkmn) this.peer.pbOnStartingBattle(this, pkmn, this.wildBattle());
    try {
      await this.pbStartBattleCore();
    } catch (e) {
      if (!(e instanceof BattleAbortedException)) throw e;
      this.decision = 0;
      await this.scene.pbEndBattle(this.decision);
    }
    return this.decision;
  },

  async pbStartBattleCore(this: Battle): Promise<void> {
    // Set up the battlers on each side
    const sendOuts = this.pbSetUpSides();
    // Create all the sprites and play the battle intro animation
    await this.scene.pbStartBattle(this);
    // Show trainers on both sides sending out Pokémon
    await this.pbStartBattleSendOut(sendOuts);
    // Weather announcement
    const weatherData = BattleWeather.tryGet(this.field.weather);
    if (weatherData) await this.pbCommonAnimation(weatherData.animation!);
    switch (this.field.weather) {
      case "Sun": await this.pbDisplay(_INTL("The sunlight is strong.")); break;
      case "Rain": await this.pbDisplay(_INTL("It is raining.")); break;
      case "Sandstorm": await this.pbDisplay(_INTL("A sandstorm is raging.")); break;
      case "Hail": await this.pbDisplay(_INTL("Hail is falling.")); break;
      case "HarshSun": await this.pbDisplay(_INTL("The sunlight is extremely harsh.")); break;
      case "HeavyRain": await this.pbDisplay(_INTL("It is raining heavily.")); break;
      case "StrongWinds": await this.pbDisplay(_INTL("The wind is strong.")); break;
      case "ShadowSky": await this.pbDisplay(_INTL("The sky is shadowy.")); break;
    }
    // Terrain announcement
    const terrainData = BattleTerrain.tryGet(this.field.terrain);
    if (terrainData) await this.pbCommonAnimation(terrainData.animation!);
    switch (this.field.terrain) {
      case "Electric":
        await this.pbDisplay(_INTL("An electric current runs across the battlefield!"));
        break;
      case "Grassy":
        await this.pbDisplay(_INTL("Grass is covering the battlefield!"));
        break;
      case "Misty":
        await this.pbDisplay(_INTL("Mist swirls about the battlefield!"));
        break;
      case "Psychic":
        await this.pbDisplay(_INTL("The battlefield is weird!"));
        break;
    }
    // Abilities upon entering battle
    await this.pbOnAllBattlersEnteringBattle();
    // Main battle loop
    await this.pbBattleLoop();
  },

  //=============================================================================
  // Main battle loop
  //=============================================================================
  async pbBattleLoop(this: Battle): Promise<void> {
    this.turnCount = 0;
    for (;;) { // Now begin the battle loop
      PBDebug.log("");
      PBDebug.log(`***Round ${this.turnCount + 1}***`);
      if (this.debug && this.turnCount >= 100) {
        this.decision = this.pbDecisionOnTime();
        PBDebug.log("");
        PBDebug.log("***Undecided after 100 rounds, aborting***");
        this.pbAbort();
      }
      PBDebug.log("");
      // Command phase
      await logonerr(() => this.pbCommandPhase());
      if (this.decision > 0) break;
      // Attack phase
      await logonerr(() => this.pbAttackPhase());
      if (this.decision > 0) break;
      // End of round phase
      await logonerr(() => this.pbEndOfRoundPhase());
      if (this.decision > 0) break;
      this.turnCount += 1;
    }
    await this.pbEndOfBattle();
  },

  //=============================================================================
  // End of battle
  //=============================================================================
  async pbGainMoney(this: Battle): Promise<void> {
    if (!this.internalBattle || !this.moneyGain) return;
    // Money rewarded from opposing trainers
    if (this.trainerBattle()) {
      let tMoney = 0;
      this.opponent!.forEach((t, i) => {
        tMoney += this.pbMaxLevelInTeam(1, i) * t.baseMoney();
      });
      if (this.field.effects[PBEffects.AmuletCoin]) tMoney *= 2;
      if (this.field.effects[PBEffects.HappyHour]) tMoney *= 2;
      const oldMoney = this.pbPlayer().money;
      this.pbPlayer().money += tMoney;
      const moneyGained = this.pbPlayer().money - oldMoney;
      if (moneyGained > 0) {
        G.stats.battleMoneyGained += moneyGained;
        await this.pbDisplayPaused(_INTL("You got ${1} for winning!", toSFormatted(moneyGained)));
      }
    }
    // Pick up money scattered by Pay Day
    if (this.field.effects[PBEffects.PayDay] > 0) {
      if (this.field.effects[PBEffects.AmuletCoin]) this.field.effects[PBEffects.PayDay] *= 2;
      if (this.field.effects[PBEffects.HappyHour]) this.field.effects[PBEffects.PayDay] *= 2;
      const oldMoney = this.pbPlayer().money;
      this.pbPlayer().money += this.field.effects[PBEffects.PayDay];
      const moneyGained = this.pbPlayer().money - oldMoney;
      if (moneyGained > 0) {
        G.stats.battleMoneyGained += moneyGained;
        await this.pbDisplayPaused(_INTL("You picked up ${1}!", toSFormatted(moneyGained)));
      }
    }
  },

  /** Essentials Deluxe (Midbattle_Triggers.rb:223): "loss" midbattle trigger first. */
  async pbLoseMoney(this: Battle): Promise<void> {
    await this.scene.pbDeluxeTriggers?.(null, null, ["loss"]);
    // --- Essentials ---
    if (!this.internalBattle || !this.moneyGain) return;
    if (G.gameSwitches.get(Settings.NO_MONEY_LOSS)) return;
    const maxLevel = this.pbMaxLevelInTeam(0, 0); // Player's Pokémon only, not partner's
    const multiplier = [8, 16, 24, 36, 48, 64, 80, 100, 120];
    const idxMultiplier = Math.min(this.pbPlayer().badgeCount(), multiplier.length - 1);
    let tMoney = maxLevel * multiplier[idxMultiplier]!;
    if (tMoney > this.pbPlayer().money) tMoney = this.pbPlayer().money;
    const oldMoney = this.pbPlayer().money;
    this.pbPlayer().money -= tMoney;
    const moneyLost = oldMoney - this.pbPlayer().money;
    if (moneyLost > 0) {
      G.stats.battleMoneyLost += moneyLost;
      if (this.trainerBattle()) {
        await this.pbDisplayPaused(_INTL("You gave ${1} to the winner...", toSFormatted(moneyLost)));
      } else {
        await this.pbDisplayPaused(_INTL("You panicked and dropped ${1}...", toSFormatted(moneyLost)));
      }
    }
  },

  async pbEndOfBattle(this: Battle): Promise<number> {
    // ZUD Mechanics (Battle_Overrides.rb:281): reverts Dynamax at the end of
    // battle, regardless of remaining turn count.
    for (const b of this.battlers) {
      if (!b || !b.dynamax() || b.effects[PBEffects.MaxRaidBoss]) continue;
      await b.unmax();
    }
    // --- Essentials ---
    const oldDecision = this.decision;
    if (this.decision === 1 && this.wildBattle() && this.caughtPokemon.length > 0) this.decision = 4;
    const playerName = (): string => this.pbPlayer().name;
    const withPlayerName = (msg: string): string => msg.replace(/\\[Pp][Nn]/g, () => playerName());
    switch (oldDecision) {
      //##### WIN #####
      case 1:
        PBDebug.log("");
        PBDebug.log("***Player won***");
        if (this.trainerBattle()) {
          this.scene.pbTrainerBattleSuccess();
          switch (this.opponent!.length) {
            case 1:
              await this.pbDisplayPaused(_INTL("You defeated {1}!", this.opponent![0]!.fullName()));
              break;
            case 2:
              await this.pbDisplayPaused(_INTL("You defeated {1} and {2}!", this.opponent![0]!.fullName(),
                this.opponent![1]!.fullName()));
              break;
            case 3:
              await this.pbDisplayPaused(_INTL("You defeated {1}, {2} and {3}!", this.opponent![0]!.fullName(),
                this.opponent![1]!.fullName(), this.opponent![2]!.fullName()));
              break;
          }
          for (let i = 0; i < this.opponent!.length; i++) {
            const trainer = this.opponent![i]!;
            await this.scene.pbShowOpponent(i);
            let msg = trainer.loseText;
            if (!msg || msg.length === 0) msg = "...";
            await this.pbDisplayPaused(withPlayerName(msg));
          }
        }
        // Gain money from winning a trainer battle, and from Pay Day
        if (this.decision !== 4) await this.pbGainMoney();
        // Hide remaining trainer
        if (this.trainerBattle() && this.caughtPokemon.length > 0) await this.scene.pbShowOpponent(this.opponent!.length);
        break;
      //##### LOSE, DRAW #####
      case 2: case 5:
        PBDebug.log("");
        if (this.decision === 2) PBDebug.log("***Player lost***");
        if (this.decision === 5) PBDebug.log("***Player drew with opponent***");
        if (this.internalBattle) {
          await this.pbDisplayPaused(_INTL("You have no more Pokémon that can fight!"));
          if (this.trainerBattle()) {
            switch (this.opponent!.length) {
              case 1:
                await this.pbDisplayPaused(_INTL("You lost against {1}!", this.opponent![0]!.fullName()));
                break;
              case 2:
                await this.pbDisplayPaused(_INTL("You lost against {1} and {2}!",
                  this.opponent![0]!.fullName(), this.opponent![1]!.fullName()));
                break;
              case 3:
                await this.pbDisplayPaused(_INTL("You lost against {1}, {2} and {3}!",
                  this.opponent![0]!.fullName(), this.opponent![1]!.fullName(), this.opponent![2]!.fullName()));
                break;
            }
          }
          // Lose money from losing a battle
          await this.pbLoseMoney();
          if (!this.canLose) await this.pbDisplayPaused(_INTL("You blacked out!"));
        } else if (this.decision === 2) { // Lost in a Battle Frontier battle
          if (this.opponent) {
            for (let i = 0; i < this.opponent.length; i++) {
              const trainer = this.opponent[i]!;
              await this.scene.pbShowOpponent(i);
              let msg = trainer.winText;
              if (!msg || msg.length === 0) msg = "...";
              await this.pbDisplayPaused(withPlayerName(msg));
            }
          }
        }
        break;
      //##### CAUGHT WILD POKÉMON #####
      case 4:
        if (!Settings.GAIN_EXP_FOR_CAPTURE) this.scene.pbWildBattleSuccess();
        break;
    }
    // Register captured Pokémon in the Pokédex, and store them
    await this.pbRecordAndStoreCaughtPokemon();
    // Collect Pay Day money in a wild battle that ended in a capture
    if (this.decision === 4) await this.pbGainMoney();
    // Pass on Pokérus within the party
    if (this.internalBattle) {
      const party = (G.player as unknown as Player).party;
      const infected: number[] = [];
      party.forEach((pkmn, i) => {
        if (pkmn.pokerusStage() === 1) infected.push(i);
      });
      for (const idxParty of infected) {
        const strain = party[idxParty]!.pokerusStrain();
        if (idxParty > 0 && party[idxParty - 1]!.pokerusStage() === 0 && this.pbRandom(3) === 0) { // 33%
          party[idxParty - 1]!.givePokerus(strain);
        }
        if (idxParty < party.length - 1 && party[idxParty + 1]!.pokerusStage() === 0 && this.pbRandom(3) === 0) { // 33%
          party[idxParty + 1]!.givePokerus(strain);
        }
      }
    }
    // Clean up battle stuff
    await this.scene.pbEndBattle(this.decision);
    for (const b of this.battlers) {
      if (!b) continue;
      await this.pbCancelChoice(b.index); // Restore unused items to Bag
      if (b.abilityActive()) await AbilityEffects.triggerOnSwitchOut(b.ability, b, true);
    }
    const party0 = this.pbParty(0);
    for (let i = 0; i < party0.length; i++) {
      const pkmn = party0[i];
      if (!pkmn) continue;
      this.peer.pbOnLeavingBattle(this, pkmn, this.usedInBattle[0]![i]!, true); // Reset form
      pkmn.item = this.initialItems[0]![i] ?? null;
    }
    return this.decision;
  },

  //=============================================================================
  // Judging
  //=============================================================================
  pbJudgeCheckpoint(this: Battle, _user: Battler | null, _move: unknown = null): void {},

  pbDecisionOnTime(this: Battle): number {
    const counts = [0, 0];
    const hpTotals = [0, 0];
    for (let side = 0; side < 2; side++) {
      for (const pkmn of this.pbParty(side)) {
        if (!pkmn || !pkmn.able()) continue;
        counts[side] = counts[side]! + 1;
        hpTotals[side] = hpTotals[side]! + pkmn.hp;
      }
    }
    if (counts[0]! > counts[1]!) return 1; // Win (player has more able Pokémon)
    if (counts[0]! < counts[1]!) return 2; // Loss (foe has more able Pokémon)
    if (hpTotals[0]! > hpTotals[1]!) return 1; // Win (player has more HP in total)
    if (hpTotals[0]! < hpTotals[1]!) return 2; // Loss (foe has more HP in total)
    return 5; // Draw
  },

  /** Unused */
  pbDecisionOnTime2(this: Battle): number {
    const counts = [0, 0];
    const hpTotals = [0, 0];
    for (let side = 0; side < 2; side++) {
      for (const pkmn of this.pbParty(side)) {
        if (!pkmn || !pkmn.able()) continue;
        counts[side] = counts[side]! + 1;
        hpTotals[side] = hpTotals[side]! + Math.floor(100 * pkmn.hp / pkmn.totalhp);
      }
      if (counts[side]! > 1) hpTotals[side] = Math.floor(hpTotals[side]! / counts[side]!);
    }
    if (counts[0]! > counts[1]!) return 1; // Win (player has more able Pokémon)
    if (counts[0]! < counts[1]!) return 2; // Loss (foe has more able Pokémon)
    if (hpTotals[0]! > hpTotals[1]!) return 1; // Win (player has a bigger average HP %)
    if (hpTotals[0]! < hpTotals[1]!) return 2; // Loss (foe has a bigger average HP %)
    return 5; // Draw
  },

  pbDecisionOnDraw(this: Battle): number { return 5; }, // Draw

  pbJudge(this: Battle): void {
    const fainted1 = this.pbAllFainted(0);
    const fainted2 = this.pbAllFainted(1);
    if (fainted1 && fainted2) {
      this.decision = this.pbDecisionOnDraw(); // Draw
    } else if (fainted1) {
      this.decision = 2; // Loss
    } else if (fainted2) {
      this.decision = 1; // Win
    }
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
