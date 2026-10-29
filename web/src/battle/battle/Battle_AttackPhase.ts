// Port of Data/Scripts/011_Battle/001_Battle/010_Battle_AttackPhase.rb
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb:279): pbAttackPhase (midbattle triggers,
//   battle mechanics); Battle.rb:80-88: pbAttackPhaseZMoves/UltraBurst/Dynamax/RaidBoss/Cheer/
//   Styles/Terastallize/ZodiacPower/Focus placeholders; Mega Evolution.rb:109: pbAttackPhaseMegaEvolution
//   (wild aces may Mega Evolve); [001] Plugin Patches/_Custom Placeholder_.rb:34: pbAttackPhaseCustom.
// - ZUD Mechanics ([003] Battle/Battle.rb:236-326): pbAttackPhaseZMoves, pbAttackPhaseUltraBurst,
//   pbAttackPhaseDynamax (pbUltraBurst and pbDynamax are in ../zud/Battle.ts).
// pbPursuit (Ruby line 24, redefined by Essentials Deluxe Battle.rb:248) is ported
// separately, not in this file.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battle } from "./Battle";

const methods = {
  //=============================================================================
  // Attack phase actions
  //=============================================================================
  /** Quick Claw, Custap Berry's "X let it move first!" message. */
  async pbAttackPhasePriorityChangeMessages(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (b.effects[PBEffects.PriorityAbility] && b.abilityActive()) {
        await AbilityEffects.triggerPriorityBracketUse(b.ability, b, this);
      } else if (b.effects[PBEffects.PriorityItem] && b.itemActive()) {
        await ItemEffects.triggerPriorityBracketUse(b.item, b, this);
      }
    }
  },

  async pbAttackPhaseCall(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (!(this.choices[b.index]![0] === "Call" && !b.fainted())) continue;
      b.lastMoveFailed = false; // Counts as a successful move for Stomping Tantrum
      await this.pbCall(b.index);
    }
  },

  async pbAttackPhaseSwitch(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (!(this.choices[b.index]![0] === "SwitchOut" && !b.fainted())) continue;
      const idxNewPkmn = this.choices[b.index]![1] as number; // Party index of Pokémon to switch to
      b.lastMoveFailed = false; // Counts as a successful move for Stomping Tantrum
      this.lastMoveUser = b.index;
      // Switching message
      await this.pbMessageOnRecall(b);
      // Pursuit interrupts switching
      await this.pbPursuit(b.index);
      if (this.decision > 0) return;
      // Switch Pokémon
      for (const b2 of this.allBattlers()) {
        b2.droppedBelowHalfHP = false;
        b2.statsDropped = false;
      }
      await this.pbRecallAndReplace(b.index, idxNewPkmn);
      await this.pbOnBattlerEnteringBattle(b.index, true);
    }
  },

  async pbAttackPhaseItems(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (!(this.choices[b.index]![0] === "UseItem" && !b.fainted())) continue;
      b.lastMoveFailed = false; // Counts as a successful move for Stomping Tantrum
      const item = this.choices[b.index]![1] as Id | null;
      if (!item) continue;
      const target = this.choices[b.index]![2] as number;
      switch (Item.get(item).battleUse) {
        case 1: case 2: // Use on Pokémon/Pokémon's move
          if (target >= 0) await this.pbUseItemOnPokemon(item, target, b);
          break;
        case 3: // Use on battler
          await this.pbUseItemOnBattler(item, target, b);
          break;
        case 4: // Use Poké Ball
          await this.pbUsePokeBallInBattle(item, target, b);
          break;
        case 5: // Use directly
          await this.pbUseItemInBattle(item, target, b);
          break;
        default:
          continue;
      }
      if (this.decision > 0) return;
    }
    if (Settings.RECALCULATE_TURN_ORDER_AFTER_SPEED_CHANGES) this.pbCalculatePriority();
  },

  /** Essentials Deluxe's version (Mega Evolution.rb:109): wild aces may Mega Evolve. */
  async pbAttackPhaseMegaEvolution(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (b.wild() && !b.ace()) continue;
      if (!(this.choices[b.index]![0] === "UseMove" && !b.fainted())) continue;
      const owner = this.pbGetOwnerIndexFromBattlerIndex(b.index);
      if (this.megaEvolution[b.idxOwnSide()]![owner] !== b.index) continue;
      await this.pbMegaEvolve(b.index);
    }
  },

  async pbAttackPhaseMoves(this: Battle): Promise<void> {
    const usesMoveOrShift = (idx: number): boolean =>
      this.choices[idx]![0] === "UseMove" || this.choices[idx]![0] === "Shift";
    // Show charging messages (Focus Punch)
    for (const b of this.pbPriority()) {
      if (!(this.choices[b.index]![0] === "UseMove" && !b.fainted())) continue;
      if (b.movedThisRound()) continue;
      await (this.choices[b.index]![2] as Move).pbDisplayChargeMessage(b);
    }
    // Main move processing loop
    for (;;) {
      const priority = this.pbPriority();
      // Forced to go next
      let advance = false;
      for (const b of priority) {
        if (!(b.effects[PBEffects.MoveNext] && !b.fainted())) continue;
        if (!usesMoveOrShift(b.index)) continue;
        if (b.movedThisRound()) continue;
        advance = await b.pbProcessTurn(this.choices[b.index]!);
        if (advance) break;
      }
      if (this.decision > 0) return;
      if (advance) continue;
      // Regular priority order
      for (const b of priority) {
        if (b.effects[PBEffects.Quash] > 0 || b.fainted()) continue;
        if (!usesMoveOrShift(b.index)) continue;
        if (b.movedThisRound()) continue;
        advance = await b.pbProcessTurn(this.choices[b.index]!);
        if (advance) break;
      }
      if (this.decision > 0) return;
      if (advance) continue;
      // Quashed
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8) {
        for (const b of priority) {
          if (!(b.effects[PBEffects.Quash] > 0 && !b.fainted())) continue;
          if (!usesMoveOrShift(b.index)) continue;
          if (b.movedThisRound()) continue;
          advance = await b.pbProcessTurn(this.choices[b.index]!);
          if (advance) break;
        }
      } else {
        let quashLevel = 0;
        for (;;) {
          quashLevel += 1;
          let moreQuash = false;
          for (const b of priority) {
            if (b.effects[PBEffects.Quash] > quashLevel) moreQuash = true;
            if (!(b.effects[PBEffects.Quash] === quashLevel && !b.fainted())) continue;
            if (!usesMoveOrShift(b.index)) continue;
            if (b.movedThisRound()) continue;
            advance = await b.pbProcessTurn(this.choices[b.index]!);
            break;
          }
          if (advance || !moreQuash) break;
        }
      }
      if (this.decision > 0) return;
      if (advance) continue;
      // Check for all done
      for (const b of priority) {
        if (b.fainted()) continue;
        if (b.movedThisRound() || !["UseMove", "Shift"].includes(this.choices[b.index]![0])) continue;
        advance = true;
        break;
      }
      if (advance) continue;
      // All Pokémon have moved; end the loop
      break;
    }
  },

  //=============================================================================
  // Essentials Deluxe (Battle.rb:80): compatibility across multiple plugins.
  //=============================================================================
  /** ZUD Mechanics (Battle.rb:236): flags the battlers using a Z-Move this round. */
  async pbAttackPhaseZMoves(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (b.wild() && !b.ace()) continue;
      if (!(this.choices[b.index]![0] === "UseMove" && !b.fainted())) continue;
      const owner = this.pbGetOwnerIndexFromBattlerIndex(b.index);
      if (this.zMove[b.idxOwnSide()]![owner] !== b.index) continue;
      b.selectedMoveIsZMove = true;
    }
  },

  /** ZUD Mechanics (Battle.rb:277). */
  async pbAttackPhaseUltraBurst(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (b.wild() && !b.ace()) continue;
      if (!(this.choices[b.index]![0] === "UseMove" && !b.fainted())) continue;
      const owner = this.pbGetOwnerIndexFromBattlerIndex(b.index);
      if (this.ultraBurst[b.idxOwnSide()]![owner] !== b.index) continue;
      await this.pbUltraBurst(b.index);
    }
  },

  /** ZUD Mechanics (Battle.rb:318). */
  async pbAttackPhaseDynamax(this: Battle): Promise<void> {
    for (const b of this.pbPriority()) {
      if (b.wild() && !b.ace()) continue;
      if (!(this.choices[b.index]![0] === "UseMove" && !b.fainted())) continue;
      const owner = this.pbGetOwnerIndexFromBattlerIndex(b.index);
      if (this.dynamax[b.idxOwnSide()]![owner] !== b.index) continue;
      await this.pbDynamax(b.index);
    }
  },

  // Placeholders: Max Raid bosses and Cheer are only used by ZUD's RaidBattle
  // subclass (zud/raid/Raid_Battle.ts, Raid_Battle.rb:26,103); the other
  // plugins aren't installed.
  async pbAttackPhaseRaidBoss(this: Battle): Promise<void> {},
  async pbAttackPhaseCheer(this: Battle): Promise<void> {},
  async pbAttackPhaseStyles(this: Battle): Promise<void> {},
  async pbAttackPhaseTerastallize(this: Battle): Promise<void> {},
  async pbAttackPhaseZodiacPower(this: Battle): Promise<void> {},
  async pbAttackPhaseFocus(this: Battle): Promise<void> {},
  /** Essentials Deluxe (_Custom Placeholder_.rb:34). */
  async pbAttackPhaseCustom(this: Battle): Promise<void> {},

  //=============================================================================
  // Attack phase (Essentials Deluxe's version, Battle.rb:279)
  //=============================================================================
  async pbAttackPhase(this: Battle): Promise<void> {
    await this.scene.pbBeginAttackPhase();
    // Essentials Deluxe: midbattle triggers
    const triggers = ["turnAttack", "turnAttack_" + String(1 + this.turnCount)];
    await this.scene.pbDeluxeTriggers?.(null, null, triggers);
    // Reset certain effects
    this.battlers.forEach((b, i) => {
      if (!b) return;
      if (!b.fainted()) b.turnCount += 1;
      (this.successStates[i] as { clear(): void }).clear();
      const action = this.choices[i]![0];
      if (action !== "UseMove" && action !== "Shift" && action !== "SwitchOut") {
        b.effects[PBEffects.DestinyBond] = false;
        b.effects[PBEffects.Grudge] = false;
      }
      if (!this.pbChoseMoveFunctionCode(i, "StartRaiseUserAtk1WhenDamaged")) b.effects[PBEffects.Rage] = false;
    });
    PBDebug.log("");
    // Calculate move order for this round
    this.pbCalculatePriority(true);
    // Perform actions
    await this.pbAttackPhaseFocus();
    await this.pbAttackPhasePriorityChangeMessages();
    await this.pbAttackPhaseCall();
    await this.pbAttackPhaseZodiacPower();
    await this.pbAttackPhaseSwitch();
    if (this.decision > 0) return;
    await this.pbAttackPhaseItems();
    if (this.decision > 0) return;
    await this.pbAttackPhaseMegaEvolution();
    await this.pbAttackPhaseUltraBurst();
    await this.pbAttackPhaseZMoves();
    await this.pbAttackPhaseDynamax();
    await this.pbAttackPhaseTerastallize();
    await this.pbAttackPhaseCustom();
    await this.pbAttackPhaseStyles();
    await this.pbAttackPhaseRaidBoss();
    await this.pbAttackPhaseCheer();
    await this.pbAttackPhaseMoves();
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
