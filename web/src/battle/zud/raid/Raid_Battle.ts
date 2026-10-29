// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Battle.rb:
// - class RaidBattle < Battle: the Max Raid boss's attack-phase effects
//   (Neutralizing Wave, Hard Mode's Immobilizing Wave), the Cheer command that
//   replaces Run, and storing what's caught.
// The rest of the file: the command menu mode showing "Cheer" is in
// scene/Scene_Raid.ts, the Battle additions in Raid_Battle_EndOfRound.ts.
//
// Randomness: Ruby's Cheer picks its effect and stat with Array#sample on
// Kernel#rand; here it goes through battle.pbRandom like the rest of the
// battle (see MoveEffects_MultiHit.ts).

import { _INTL } from "../../../data/gameData/gameData";
import { Stat } from "../../../data/gameData/stat";
import { DEBUG } from "../../../core/debug";
import { G } from "../../../game/globals";
import { Input } from "../../../rgss/Input";
import { pbSEPlay } from "../../audio";
import { Battle } from "../../battle/Battle";
import type { Battler } from "../../battler/Battler";
import { PBEffects } from "../../other/PBEffects";
import type { BattleScene } from "../../scene/BattleScene";
import { rubySample } from "../PowerMove_BaseEffects";
import { inMaxLair } from "./maxLairHooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DxHash = Record<string, any>;
const dxRules = () => (G.gameTemp.dxRules ?? {}) as DxHash;

//===============================================================================
// The RaidBattle class, used for handling battle mechanics for raids.
//===============================================================================
export class RaidBattle extends Battle {
  readonly hardMode: boolean;

  constructor(...args: ConstructorParameters<typeof Battle>) {
    super(...args);
    (this as { raidBattle: boolean }).raidBattle = true;
    this.hardMode = dxRules().hard;
  }

  override async pbRecordAndStoreCaughtPokemon(): Promise<void> {
    // NOTE (Ruby parity): unlike Battle's, this doesn't call pbSetCaught or
    // register the species as owned, so a Pokémon caught in a raid isn't
    // marked as caught in the Pokédex (Raid_Battle.rb:15-21).
    for (const pkmn of this.caughtPokemon) {
      this.pbSetSeen(pkmn);
      await this.pbStorePokemon(pkmn);
    }
    this.caughtPokemon.length = 0;
  }

  //-----------------------------------------------------------------------------
  // Raid Pokemon effects during the Attack Phase (before using a move).
  //-----------------------------------------------------------------------------
  override async pbAttackPhaseRaidBoss(): Promise<void> {
    for (const b of this.pbPriority()) {
      if (!b.effects[PBEffects.MaxRaidBoss]) continue;
      //-------------------------------------------------------------------------
      // Neutralizing Wave
      //-------------------------------------------------------------------------
      const rand = this.pbRandom(10);
      let neutralize: boolean;
      if (rand < 2 ||
          (b.status !== "NONE" && rand < 5) ||
          (b.effects[PBEffects.RaidShield] > 0 && rand < 4)) {
        neutralize = b.hp < b.totalhp - Math.floor(b.totalhp / 5);
      } else {
        neutralize = false;
      }
      if (neutralize) {
        await this.pbDisplay(_INTL("{1} released a neutralizing wave of Dynamax energy!", b.pbThis()));
        await this.scene.pbWaveAttack?.(b.index);
        await this.pbDisplay(_INTL("All stat increases and Abilities of your Pokémon were nullified!"));
        if (b.status !== "NONE") {
          await b.pbCureStatus(false);
          await this.pbDisplay(_INTL("{1}'s status returned to normal!", b.pbThis()));
        }
        for (const p of eachOpposing(b)) {
          p.effects[PBEffects.GastroAcid] = true;
          for (const s of Stat.eachBattle()) if (p.stages[s.id]! > 0) p.stages[s.id] = 0;
        }
      }
      //-------------------------------------------------------------------------
      // Hard Mode Bonuses (Immobilizing Wave)
      //-------------------------------------------------------------------------
      if (this.hardMode) {
        if (b.effects[PBEffects.ShieldCounter] === -1 && b.effects[PBEffects.RaidShield] <= 0) {
          await this.pbDisplay(_INTL("{1} released an immense wave of Dynamax energy!", b.pbThis()));
          await this.scene.pbWaveAttack?.(b.index);
          for (const p of eachOpposing(b)) {
            if (p.effects[PBEffects.Dynamax] > 0) {
              await this.pbDisplay(_INTL("{1} is unaffected!", p.pbThis()));
            } else {
              await this.pbDisplay(_INTL("The oppressive force immobilized {1}!", p.pbThis()));
              p.effects[PBEffects.TwoTurnAttack] = null;
              if (!p.movedThisRound()) this.pbClearChoice(p.index);
            }
          }
          b.effects[PBEffects.ShieldCounter] -= 1;
        }
      }
    }
  }

  //-----------------------------------------------------------------------------
  // Adds the Cheer command to the menu; replaces Run.
  //-----------------------------------------------------------------------------
  override async pbCommandMenu(idxBattler: number, _firstAction: boolean): Promise<number> {
    let ret = await (this.scene as unknown as BattleScene).pbCommandMenuEx(idxBattler, [
      _INTL("What will\n{1} do?", this.battlers[idxBattler]!.name),
      _INTL("Fight"),
      _INTL("Bag"),
      _INTL("Pokémon"),
      _INTL("Cheer"),
    ], 5);
    if (ret === 3) ret = 4;
    return DEBUG && Input.press(Input.CTRL) ? 3 : ret;
  }

  //-----------------------------------------------------------------------------
  // Registers the Cheer command to be used during the Attack Phase.
  //-----------------------------------------------------------------------------
  override async pbCallMenu(idxBattler: number): Promise<boolean> {
    return this.pbRegisterCheer(idxBattler);
  }

  pbRegisterCheer(idxBattler: number): boolean {
    const choice = this.choices[idxBattler]!;
    choice[0] = "Cheer";
    choice[1] = 0;
    choice[2] = null;
    return true;
  }

  override async pbAttackPhaseCheer(): Promise<void> {
    for (const b of this.pbPriority()) {
      if (!(this.choices[b.index]![0] === "Cheer" && !b.fainted())) continue;
      b.lastMoveFailed = false; // Counts as a successful move for Stomping Tantrum.
      await this.pbCheer(b.index);
    }
  }

  //-----------------------------------------------------------------------------
  // Cheer command.
  //-----------------------------------------------------------------------------
  async pbCheer(idxBattler: number): Promise<void> {
    const rules = dxRules();
    const battler = this.battlers[idxBattler]!;
    const boss = battler.pbDirectOpposing(true);
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    const trainerName = this.pbGetOwnerName(idxBattler);
    let dmaxInUse = false;
    for (const b of this.allSameSideBattlers(battler)) if (b.dynamax()) dmaxInUse = true;
    //---------------------------------------------------------------------------
    // Determines the possible Cheer effects.
    //---------------------------------------------------------------------------
    let cheered = 0;
    // Hash keys, in insertion order (setting a key again keeps its place).
    const cheerEffects: Record<string, true> = {};
    const empty = () => Object.keys(cheerEffects).length === 0;
    // (player_losing is computed but never used.)
    //---------------------------------------------------------------------------
    // Counts the number of party members using Cheer this turn.
    //---------------------------------------------------------------------------
    for (const b of this.allSameSideBattlers(battler)) {
      if (this.choices[b.index]![0] !== "Cheer") continue;
      cheered += 1;
    }
    const anyLowHP = () => this.allSameSideBattlers(battler).some((b) => b.hp <= Math.floor(b.totalhp / 2));
    switch (cheered) {
      case 0:
        cheerEffects.none = true;
        break;
      //---------------------------------------------------------------------------
      // Builds hash of possible Cheer effects for a single Cheer.
      //---------------------------------------------------------------------------
      // :reflect     => No Reflect and party size is 1 or Pokemon fainted.
      // :lightscreen => No Light Screen and party size is 1 or Pokemon fainted.
      // :shieldbreak => Raid Shield active and party size is 1 and turn count < 5.
      // :dynamax     => Dynamax used and party size is 1 and turn count < 5.
      // :heal        => Party Pokemon have low HP and party size is 1 and turn count < 5.
      // :none        => No above effects qualify and party size > 1.
      // :boost       => Always available.
      //---------------------------------------------------------------------------
      case 1:
        if (rules.size === 1) {
          if (boss.effects[PBEffects.Dynamax] < 10) {
            if (anyLowHP()) cheerEffects.heal = true;
          }
          if (empty() && boss.effects[PBEffects.Dynamax] < 5) {
            if (!dmaxInUse && this.dynamax[side]![owner] !== -1) cheerEffects.dynamax = true;
            if (boss.effects[PBEffects.RaidShield] > 1) cheerEffects.shieldbreak = true;
          }
          if (empty()) {
            if (battler.pbOwnSide().effects[PBEffects.Reflect] === 0) cheerEffects.reflect = true;
            if (battler.pbOwnSide().effects[PBEffects.LightScreen] === 0) cheerEffects.lightscreen = true;
            cheerEffects.boost = true;
          }
        } else {
          if (!rules.perfect_bonus) {
            if (battler.pbOwnSide().effects[PBEffects.Reflect] === 0) cheerEffects.reflect = true;
            if (battler.pbOwnSide().effects[PBEffects.LightScreen] === 0) cheerEffects.lightscreen = true;
          }
          if (empty()) cheerEffects.none = true;
          cheerEffects.boost = true;
        }
        break;
      //---------------------------------------------------------------------------
      // Builds hash of possible Cheer effects for a double Cheer.
      //---------------------------------------------------------------------------
      // :heal        => Party Pokemon have low HP and Pokemon fainted or turn count < 5.
      // :timer       => Party size > 2 and turn count is 1.
      // :shieldbreak => Raid Shield active and party size is 2 and Pokemon fainted or turn count < 5.
      // :dynamax     => Dynamax used and party size is 2 and Pokemon fainted or turn count < 5.
      // :boost       => No above effects qualify.
      //---------------------------------------------------------------------------
      case 2:
        if (!rules.perfect_bonus || boss.effects[PBEffects.Dynamax] < 5) {
          if (anyLowHP()) cheerEffects.heal = true;
        }
        if (rules.size > 2 && boss.effects[PBEffects.Dynamax] === 1) cheerEffects.timer = true;
        if (rules.size === 2 && (!rules.perfect_bonus || boss.effects[PBEffects.Dynamax] < 5)) {
          if (boss.effects[PBEffects.RaidShield] > 0) cheerEffects.shieldbreak = true;
          if (!dmaxInUse && this.dynamax[side]![owner] !== -1) cheerEffects.dynamax = true;
        }
        if (empty()) cheerEffects.boost = true;
        break;
      //---------------------------------------------------------------------------
      // Builds hash of possible Cheer effects for a triple+ Cheer.
      //---------------------------------------------------------------------------
      // :shieldbreak => Raid Shield active and Pokemon fainted.
      // :dynamax     => Dynamax used and Pokemon fainted.
      // :kocount     => KO count is 1.
      // :heal        => No above effects qualify and party Pokemon have low HP.
      // :boost       => No above effects qualify.
      //---------------------------------------------------------------------------
      default:
        if (!rules.perfect_bonus || boss.effects[PBEffects.Dynamax] < 5) {
          if (boss.effects[PBEffects.RaidShield] > 0) cheerEffects.shieldbreak = true;
          if (!dmaxInUse && this.dynamax[side]![owner] !== -1) cheerEffects.dynamax = true;
        }
        if (boss.effects[PBEffects.KnockOutCount] === 1 && !inMaxLair()) cheerEffects.kocount = true;
        if (empty()) {
          if (anyLowHP()) cheerEffects.heal = true;
        }
        if (empty()) cheerEffects.boost = true;
        break;
    }
    //---------------------------------------------------------------------------
    // Chooses a random Cheer effect and displays Cheer messages.
    //---------------------------------------------------------------------------
    const partyPriority: Battler[] = [];
    for (const b of this.pbPriority()) {
      if (b.opposes()) continue;
      if (this.choices[b.index]![0] !== "Cheer") continue;
      partyPriority.push(b);
    }
    const randeffect = rubySample(this, Object.keys(cheerEffects));
    await this.pbDisplay(_INTL("{1} cheered for {2}!", trainerName, battler.pbThis(true)));
    await this.pbAnimation("ENCORE", battler, battler);
    if (!["none", "dynamax"].includes(randeffect!)) {
      if (battler === partyPriority[0]) {
        await this.pbDisplay(_INTL("{1}'s cheering was powered up by all the Dynamax Energy!", trainerName));
      } else {
        await this.pbDisplay(_INTL("{1}'s continuous cheering grew in power!", trainerName));
      }
    }
    const last = partyPriority[partyPriority.length - 1];
    switch (randeffect) {
      //---------------------------------------------------------------------------
      // No effect.
      //---------------------------------------------------------------------------
      case "none":
        await this.pbDisplay(_INTL("The cheer echoed feebly around the area..."));
        break;
      //---------------------------------------------------------------------------
      // Applies Reflect on the user's side.
      //---------------------------------------------------------------------------
      case "reflect":
        await this.pbAnimation("REFLECT", battler, battler);
        battler.pbOwnSide().effects[PBEffects.Reflect] = 5;
        await this.pbDisplay(_INTL("Reflect raised {1}'s Defense!", battler.pbTeam(true)));
        break;
      //---------------------------------------------------------------------------
      // Applies Light Screen to the user's side.
      //---------------------------------------------------------------------------
      case "lightscreen":
        await this.pbAnimation("LIGHTSCREEN", battler, battler);
        battler.pbOwnSide().effects[PBEffects.LightScreen] = 5;
        await this.pbDisplay(_INTL("Light Screen raised {1}'s Special Defense!", battler.pbTeam(true)));
        break;
      //---------------------------------------------------------------------------
      // Restores the HP and status of each ally Pokemon.
      // Only eligible when at least one party member is at or below 50% HP.
      // Triggers after the final Cheer of this round.
      //---------------------------------------------------------------------------
      case "heal":
        if (battler === last) {
          for (const b of eachSameSide(this, battler)) {
            if (b.hp < b.totalhp) {
              await b.pbRecoverHP(b.totalhp);
              await this.pbDisplay(_INTL("{1}'s HP was restored.", b.pbThis()));
            }
            await b.pbCureStatus();
          }
        }
        break;
      //---------------------------------------------------------------------------
      // Raises a random stat for each ally Pokemon.
      // The number of stages raised is based on how many Cheers were used.
      // Triggers after the final Cheer of this round.
      //---------------------------------------------------------------------------
      case "boost":
        if (battler === last) {
          for (const b of eachSameSide(this, battler)) {
            const stat = rubySample(this, ["ATTACK", "DEFENSE", "SPEED", "SPECIAL_ATTACK", "SPECIAL_DEFENSE", "ACCURACY", "EVASION"])!;
            if (await b.pbCanRaiseStatStage(stat, b, null, true)) {
              await b.pbRaiseStatStage(stat, cheered, b, true, true);
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      // Increases the raid timer by 1 additional turn.
      // Triggers after the final Cheer of this round.
      //---------------------------------------------------------------------------
      case "timer":
        if (battler === last) {
          boss.effects[PBEffects.Dynamax] += 1;
          await this.pbDisplay(_INTL("{1} seemed distracted by all your cheering!", battler.pbThis(true)));
          this.scene.pbRefresh();
          pbSEPlay("Anim/Lucky Chant");
          await this.pbDisplay(_INTL("You bought yourself an extra turn in the raid!"));
        }
        break;
      //---------------------------------------------------------------------------
      // Increases the raid KO counter by 1 additional KO.
      // Triggers after the final Cheer of this round.
      //---------------------------------------------------------------------------
      case "kocount":
        if (battler === last) {
          boss.effects[PBEffects.KnockOutCount] += 1;
          await this.pbDisplay(_INTL("{1} seemed distracted by all your cheering!", battler.pbThis(true)));
          this.scene.pbRefresh();
          pbSEPlay("Anim/Lucky Chant");
          await this.pbDisplay(_INTL("The storm raging around {1} calmed down a bit!", battler.pbThis(true)));
        }
        break;
      //---------------------------------------------------------------------------
      // Removes the Raid Pokemon's shield.
      // Only eligible when the Max Raid Pokemon has active shields.
      // Triggers after the final Cheer of this round.
      //---------------------------------------------------------------------------
      case "shieldbreak":
        if (battler === last) {
          await this.scene.pbDamageAnimation(boss);
          boss.effects[PBEffects.RaidShield] = 0;
          this.scene.pbRefresh();
          await this.scene.pbRaidShield?.(boss);
          await this.pbDisplay(_INTL("The mysterious barrier disappeared!"));
          const oldhp = boss.hp;
          boss.hp -= Math.floor(boss.totalhp / 8);
          if (boss.hp <= 1) boss.hp = 1;
          await this.scene.pbHPChanged(boss, oldhp);
          if (boss.hp > 1) {
            for (const stat of ["DEFENSE", "SPECIAL_DEFENSE"]) {
              if (await boss.pbCanLowerStatStage(stat, boss, null, true)) {
                await boss.pbLowerStatStage(stat, 2, boss, true, false, 0, true);
              }
            }
          }
        }
        break;
      //---------------------------------------------------------------------------
      // Replenishes the player's ability to Dynamax.
      // Only eligible if Dynamax has already been used.
      // Triggers after the final Cheer of this round.
      //---------------------------------------------------------------------------
      case "dynamax": {
        const item = this.pbGetDynamaxBandName(battler.index);
        if (battler === last) { // Last Cheer user.
          this.pbSetBattleMechanicUsage(battler.index, "Dynamax", -1);
          pbSEPlay("Anim/Lucky Chant");
          await this.pbDisplayPaused(_INTL("The absorbed Dynamax energy fully recharged {1}'s {2}!\n{1} can use Dynamax again!", trainerName, item));
        } else if (battler === partyPriority[0]) { // First Cheer user.
          await this.pbDisplay(_INTL("{1}'s {2} absorbed a little of the surrounding Dynamax Energy!", trainerName, item));
        } else { // All other Cheer users.
          await this.pbDisplay(_INTL("{1}'s {2} absorbed even more of the surrounding Dynamax Energy!", trainerName, item));
        }
        break;
      }
    }
  }
}

/** Battler#eachOpposing: each unfainted foe, checked as it's reached. */
function* eachOpposing(b: Battler): Generator<Battler> {
  for (const p of b.battle.battlers) if (p && !p.fainted() && p.opposes(b.index)) yield p;
}

/** Battle#eachSameSideBattler: each unfainted battler on the side, checked as it's reached. */
function* eachSameSide(battle: Battle, b: Battler): Generator<Battler> {
  for (const p of battle.battlers) if (p && !p.fainted() && !p.opposes(b.index)) yield p;
}

