// Port of Data/Scripts/011_Battle/001_Battle/009_Battle_CommandPhase.rb
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb:148-243): pbCancelChoice and pbCommandPhase
//   (battle mechanics, midbattle triggers), pbCanShowFightMenu? (the fight menu opens while
//   Encored if a mechanic is usable); Fight Menu.rb:227: pbFightMenu (battle mechanic buttons).
// - Generation 9 Pack ([001] Battle/[001] Battle.rb:59): pbCanShowCommands? (Commander).
// - ZUD Mechanics ([003] Battle/Battle_Overrides.rb:57): pbCanShowFightMenu? (restores Encore),
//   :67 pbCanChooseMove? (Power Moves ignore Encore).
// - pbCanChooseMove? is core 004_Battle_ActionAttacksPriority.rb:5; ZUD's redefinition (no alias)
//   replaces it, and it's ported here with the command menus.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { ItemHandlers } from "../../game/items/ItemHandlers";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { Battle } from "./Battle";
import { triggerCanUseInBattle } from "./Battle_ActionUseItem";

/**
 * Essentials Deluxe (Fight Menu.rb:10): the commands Battle::Scene#pbFightMenu
 * passes to its block besides a move index. NOTE: these replace core
 * Essentials' -2 (Mega Evolution) and -3 (Shift).
 */
export const DXTriggers = {
  MENU_TRIGGER_CANCEL: -1,
  MENU_TRIGGER_SHIFT_BATTLER: -2,
  MENU_TRIGGER_MEGA_EVOLUTION: -3,
  MENU_TRIGGER_Z_MOVE: -4,
  MENU_TRIGGER_ULTRA_BURST: -5,
  MENU_TRIGGER_DYNAMAX: -6,
  MENU_TRIGGER_BATTLE_STYLE: -7,
  MENU_TRIGGER_TERASTALLIZE: -8,
  MENU_TRIGGER_ZODIAC_POWER: -9,
  MENU_TRIGGER_CUSTOM_MECHANIC: -10,
  MENU_TRIGGER_FOCUS_METER: -11,
} as const;

const methods = {
  //=============================================================================
  // Clear commands
  //=============================================================================
  pbClearChoice(this: Battle, idxBattler: number): void {
    if (!this.choices[idxBattler]) this.choices[idxBattler] = ["None", 0, null, -1];
    const choice = this.choices[idxBattler];
    choice[0] = "None";
    choice[1] = 0;
    choice[2] = null;
    choice[3] = -1;
  },

  /** Essentials Deluxe's version (Battle.rb:148): also cancels battle mechanic selections. */
  pbCancelChoice(this: Battle, idxBattler: number): void {
    // If idxBattler's choice was to use an item, return that item to the Bag
    if (this.choices[idxBattler]![0] === "UseItem") {
      const item = this.choices[idxBattler]![1] as Id | null;
      if (item) this.pbReturnUnusedItemToBag(item, idxBattler);
    }
    // If idxBattler chose to Mega Evolve, cancel it
    this.pbUnregisterMegaEvolution(idxBattler);
    // PluginManager.installed?("ZUD Mechanics")
    this.pbUnregisterUltraBurst(idxBattler);
    if (this.pbRegisteredZMove(idxBattler)) {
      this.pbUnregisterZMove(idxBattler);
      this.battlers[idxBattler]!.powerTrigger = false;
      this.battlers[idxBattler]!.displayBaseMoves();
    }
    if (this.pbRegisteredDynamax(idxBattler)) {
      this.pbUnregisterDynamax(idxBattler);
      this.battlers[idxBattler]!.powerTrigger = false;
      this.battlers[idxBattler]!.displayBaseMoves();
    }
    // "PLA Battle Styles", "Terastal Phenomenon", "Pokémon Birthsigns" and
    // "Focus Meter System" aren't installed.
    this.pbUnregisterCustom(idxBattler);
    // Clear idxBattler's choice
    this.pbClearChoice(idxBattler);
  },

  //=============================================================================
  // Use main command menu (Fight/Pokémon/Bag/Run)
  //=============================================================================
  async pbCommandMenu(this: Battle, idxBattler: number, firstAction: boolean): Promise<number> {
    return this.scene.pbCommandMenu(idxBattler, firstAction);
  },

  //=============================================================================
  // Check whether actions can be taken
  //=============================================================================
  /** pbCanShowCommands? */
  pbCanShowCommands(this: Battle, idxBattler: number): boolean {
    // Generation 9 Pack: skip Tatsugiri's commands while in Dondozo's mouth
    if (this.battlers[idxBattler]!.isCommander()) return false;
    // --- Essentials ---
    const battler = this.battlers[idxBattler];
    if (!battler || battler.fainted()) return false;
    if (battler.usingMultiTurnAttack()) return false;
    return true;
  },

  /** pbCanShowFightMenu? */
  pbCanShowFightMenu(this: Battle, idxBattler: number): boolean {
    const battler = this.battlers[idxBattler]!;
    // ZUD Mechanics: returns the user's Encore state after executing a Z-Move
    const encoreRestore = battler.effects[PBEffects.EncoreRestore] as unknown[];
    if (encoreRestore.length > 0) {
      battler.effects[PBEffects.Encore] = encoreRestore[0];
      battler.effects[PBEffects.EncoreMove] = encoreRestore[1];
      encoreRestore.length = 0;
    }
    // Essentials Deluxe: the move window opens even when Encored if a mechanic is usable
    if (battler.effects[PBEffects.Encore] > 0 && !this.pbCanUseBattleMechanic(idxBattler)) return false;
    // No moves that can be chosen (will Struggle instead)
    let usable = false;
    for (let i = 0; i < battler.moves.length; i++) {
      if (!this.pbCanChooseMove(idxBattler, i, false)) continue;
      usable = true;
      break;
    }
    return usable;
  },

  /**
   * pbCanChooseMove?(idxBattler, idxMove, false, sleepTalk) — ZUD Mechanics'
   * version (Battle_Overrides.rb:67): Power Moves can be chosen while Encored.
   * This synchronous version can't show messages; use pbCanChooseMoveAsync for
   * showMessages = true.
   */
  pbCanChooseMove(this: Battle, idxBattler: number, idxMove: number, _showMessages: false, sleepTalk = false): boolean {
    const battler = this.battlers[idxBattler]!;
    const move = battler.moves[idxMove];
    if (!move) return false;
    if (move.pp === 0 && move.totalPp() > 0 && !sleepTalk) return false;
    if (battler.effects[PBEffects.Encore] > 0) {
      const idxEncoredMove = battler.pbEncoredMoveIndex();
      if (idxEncoredMove >= 0 && idxMove !== idxEncoredMove && !move.powerMove()) return false;
    }
    return battler.pbCanChooseMove(move, true, false, sleepTalk);
  },

  /** pbCanChooseMove? with messages (ZUD Mechanics' version, Battle_Overrides.rb:67). */
  async pbCanChooseMoveAsync(this: Battle, idxBattler: number, idxMove: number, showMessages: boolean,
    sleepTalk = false): Promise<boolean> {
    const battler = this.battlers[idxBattler]!;
    const move = battler.moves[idxMove];
    if (!move) return false;
    if (move.pp === 0 && move.totalPp() > 0 && !sleepTalk) {
      if (showMessages) await this.pbDisplayPaused(_INTL("There's no PP left for this move!"));
      return false;
    }
    if (battler.effects[PBEffects.Encore] > 0) {
      const idxEncoredMove = battler.pbEncoredMoveIndex();
      if (idxEncoredMove >= 0 && idxMove !== idxEncoredMove && !move.powerMove()) {
        if (showMessages) await this.pbDisplayPaused(_INTL("Encore prevents using this move!"));
        return false;
      }
    }
    return battler.pbCanChooseMoveAsync(move, true, showMessages, sleepTalk);
  },

  //=============================================================================
  // Use sub-menus to choose an action, and register it if is allowed
  //=============================================================================
  /**
   * Returns true if a choice was made, false if cancelled.
   * Essentials Deluxe's version (Fight Menu.rb:227): toggles battle mechanics.
   */
  async pbFightMenu(this: Battle, idxBattler: number): Promise<boolean> {
    // Auto-use Encored move or no moves choosable, so auto-use Struggle
    if (!this.pbCanShowFightMenu(idxBattler)) return this.pbAutoChooseMove(idxBattler);
    // Battle Palace only
    if (await this.pbAutoFightMenu(idxBattler)) return true;
    // Regular move selection
    let ret = false;
    const mechanics: boolean[] = [];
    mechanics.push(this.pbCanMegaEvolve(idxBattler));
    // PluginManager.installed?("ZUD Mechanics")
    mechanics.push(this.pbCanUltraBurst(idxBattler));
    mechanics.push(this.pbCanZMove(idxBattler));
    mechanics.push(this.pbCanDynamax(idxBattler));
    mechanics.push(false); // "PLA Battle Styles" isn't installed
    mechanics.push(false); // "Terastal Phenomenon" isn't installed
    mechanics.push(false); // "Pokémon Birthsigns" isn't installed
    mechanics.push(this.pbCanCustom(idxBattler));
    ["mega", "ultra", "zmove", "dynamax", "style", "tera", "zodiac", "custom"].forEach((mechanic, i) => {
      if (this.pbScriptedMechanic(idxBattler, mechanic)) mechanics[i] = false;
    });
    await this.scene.pbFightMenu(idxBattler, ...mechanics, async (cmd) => {
      switch (cmd) {
        case DXTriggers.MENU_TRIGGER_CANCEL: // Cancel
          break;
        case DXTriggers.MENU_TRIGGER_MEGA_EVOLUTION: // Mega Evolution
          this.pbToggleRegisteredMegaEvolution(idxBattler);
          return false;
        case DXTriggers.MENU_TRIGGER_ULTRA_BURST: // Ultra Burst
          this.pbToggleRegisteredUltraBurst(idxBattler);
          return false;
        case DXTriggers.MENU_TRIGGER_Z_MOVE: // Z-Moves
          this.pbToggleRegisteredZMove(idxBattler);
          return false;
        case DXTriggers.MENU_TRIGGER_DYNAMAX: // Dynamax
          this.pbToggleRegisteredDynamax(idxBattler);
          return false;
        case DXTriggers.MENU_TRIGGER_BATTLE_STYLE: // Style ("PLA Battle Styles" isn't installed)
          return false;
        case DXTriggers.MENU_TRIGGER_TERASTALLIZE: // Terastallize ("Terastal Phenomenon" isn't installed)
          return false;
        case DXTriggers.MENU_TRIGGER_ZODIAC_POWER: // Zodiac Powers ("Pokémon Birthsigns" isn't installed)
          return false;
        case DXTriggers.MENU_TRIGGER_FOCUS_METER: // Focus ("Focus Meter System" isn't installed)
          return false;
        case DXTriggers.MENU_TRIGGER_CUSTOM_MECHANIC: // Custom mechanic
          this.pbToggleRegisteredCustom(idxBattler);
          return false;
        case DXTriggers.MENU_TRIGGER_SHIFT_BATTLER: { // Shift
          this.pbUnregisterMegaEvolution(idxBattler);
          // PluginManager.installed?("ZUD Mechanics")
          this.pbUnregisterUltraBurst(idxBattler);
          this.pbUnregisterZMove(idxBattler);
          this.pbUnregisterDynamax(idxBattler);
          const battler = this.battlers[idxBattler]!;
          battler.powerTrigger = false;
          battler.displayBaseMoves();
          this.pbRegisterShift(idxBattler);
          this.pbUnregisterCustom(idxBattler);
          ret = true;
          break;
        }
        default: { // Chose a move to use
          const battler = this.battlers[idxBattler]!;
          if (cmd < 0 || !battler.moves[cmd] || !battler.moves[cmd].id) return false;
          if (!(await this.pbRegisterMove(idxBattler, cmd))) return false;
          if (!this.singleBattle() &&
              !(await this.pbChooseTarget(this.battlers[idxBattler]!, this.battlers[idxBattler]!.moves[cmd]!))) return false;
          ret = true;
        }
      }
      return true;
    });
    return ret;
  },

  async pbAutoFightMenu(this: Battle, _idxBattler: number): Promise<boolean> { return false; },

  async pbChooseTarget(this: Battle, battler: Battler, move: Move): Promise<boolean> {
    const targetData = move.pbTarget(battler);
    const idxTarget = await this.scene.pbChooseTarget(battler.index, targetData);
    if (idxTarget < 0) return false;
    this.pbRegisterTarget(battler.index, idxTarget);
    return true;
  },

  async pbItemMenu(this: Battle, idxBattler: number, firstAction: boolean): Promise<boolean> {
    if (this.trainerBattle()) {
      await this.pbDisplay(_INTL("Items can't be used in Trainer battles."));
      return false;
    }
    if (!this.internalBattle) {
      await this.pbDisplay(_INTL("Items can't be used here."));
      return false;
    }
    let ret = false;
    await this.scene.pbItemMenu(idxBattler, firstAction, async (item, useType, idxPkmn, idxMove, itemScene) => {
      if (!item) return false;
      let battler: Battler | null = null;
      let pkmn: Pokemon | null = null;
      switch (useType) {
        case 1: case 2: // Use on Pokémon/Pokémon's move
          if (!ItemHandlers.hasBattleUseOnPokemon(item)) return false;
          battler = this.pbFindBattler(idxPkmn, idxBattler);
          pkmn = this.pbParty(idxBattler)[idxPkmn] ?? null;
          if (!(await this.pbCanUseItemOnPokemon(item, pkmn, battler, itemScene))) return false;
          break;
        case 3: // Use on battler
          if (!ItemHandlers.hasBattleUseOnBattler(item)) return false;
          battler = this.pbFindBattler(idxPkmn, idxBattler);
          if (battler) pkmn = battler.pokemon;
          if (!(await this.pbCanUseItemOnPokemon(item, pkmn, battler, itemScene))) return false;
          break;
        case 4: // Poké Balls
          if (idxPkmn < 0) return false;
          battler = this.battlers[idxPkmn] ?? null;
          if (battler) pkmn = battler.pokemon;
          break;
        case 5: // No target (Poké Doll, Guard Spec., Launcher items)
          battler = this.battlers[idxBattler] ?? null;
          if (battler) pkmn = battler.pokemon;
          break;
        default:
          return false;
      }
      if (!pkmn) return false;
      if (!(await triggerCanUseInBattle(item, pkmn, battler, idxMove,
        firstAction, this, itemScene))) return false;
      if (!this.pbRegisterItem(idxBattler, item, idxPkmn, idxMove)) return false;
      ret = true;
      return true;
    });
    return ret;
  },

  async pbPartyMenu(this: Battle, idxBattler: number): Promise<boolean> {
    let ret = -1;
    if (this.debug) {
      ret = this.battleAI.pbDefaultChooseNewEnemy(idxBattler, this.pbParty(idxBattler));
    } else {
      ret = await this.pbPartyScreen(idxBattler, false, true, true);
    }
    return ret >= 0;
  },

  async pbRunMenu(this: Battle, idxBattler: number): Promise<boolean> {
    // Regardless of succeeding or failing to run, stop choosing actions
    return (await this.pbRun(idxBattler)) !== 0;
  },

  async pbCallMenu(this: Battle, idxBattler: number): Promise<boolean> {
    return this.pbRegisterCall(idxBattler);
  },

  async pbDebugMenu(this: Battle): Promise<void> {
    // pbBattleDebug(self) (debug/DebugMenus.ts; loaded lazily, the debug menus aren't part of the battle engine)
    const { pbBattleDebug } = await import("../../debug/DebugMenus");
    await pbBattleDebug(this);
    this.scene.pbRefreshEverything();
    for (const b of this.allBattlers()) await b.pbCheckFormOnWeatherChange();
    await this.pbEndPrimordialWeather();
    for (const b of this.allBattlers()) await b.pbAbilityOnTerrainChange();
    for (const b of this.allBattlers()) {
      await b.pbCheckFormOnMovesetChange();
      await b.pbCheckFormOnStatusChange();
    }
  },

  //=============================================================================
  // Command phase (Essentials Deluxe's version, Battle.rb:193)
  //=============================================================================
  async pbCommandPhase(this: Battle): Promise<void> {
    // Essentials Deluxe: midbattle triggers
    const triggers = ["turnCommand", "turnCommand_" + String(1 + this.turnCount)];
    await this.scene.pbDeluxeTriggers?.(null, null, triggers);
    // --- Essentials ---
    await this.scene.pbBeginCommandPhase();
    // Reset choices if commands can be shown
    this.battlers.forEach((b, i) => {
      if (!b) return;
      if (this.pbCanShowCommands(i)) this.pbClearChoice(i);
    });
    // Reset choices to perform Mega Evolution if it wasn't done somehow
    for (let side = 0; side < 2; side++) {
      this.megaEvolution[side]!.forEach((megaEvo, i) => {
        if (megaEvo >= 0) this.megaEvolution[side]![i] = -1;
      });
      // PluginManager.installed?("ZUD Mechanics")
      this.ultraBurst[side]!.forEach((uBurst, i) => {
        if (uBurst >= 0) this.ultraBurst[side]![i] = -1;
      });
      this.zMove[side]!.forEach((zMove, i) => {
        if (zMove >= 0) this.zMove[side]![i] = -1;
      });
      this.dynamax[side]!.forEach((dmax, i) => {
        if (dmax >= 0) this.dynamax[side]![i] = -1;
      });
      // "PLA Battle Styles", "Terastal Phenomenon", "Pokémon Birthsigns" and
      // "Focus Meter System" aren't installed.
      // Essentials Deluxe: custom mechanic (@custom is created by _Custom Placeholder_.rb:22)
      this.custom?.[side]!.forEach((custom, i) => {
        if (custom >= 0) this.custom![side]![i] = -1;
      });
    }
    // Choose actions for the round (player first, then AI)
    await this.pbCommandPhaseLoop(true); // Player chooses their actions
    if (this.decision !== 0) return; // Battle ended, stop choosing actions
    await this.pbCommandPhaseLoop(false); // AI chooses their actions
  },

  async pbCommandPhaseLoop(this: Battle, isPlayer: boolean): Promise<void> {
    // NOTE: Doing some things (e.g. running, throwing a Poké Ball) takes up all
    //       your actions in a round.
    const actioned: number[] = [];
    let idxBattler = -1;
    for (;;) {
      if (this.decision !== 0) break; // Battle ended, stop choosing actions
      idxBattler += 1;
      if (idxBattler >= this.battlers.length) break;
      if (!this.battlers[idxBattler] || this.pbOwnedByPlayer(idxBattler) !== isPlayer) continue;
      if (this.choices[idxBattler]![0] !== "None") continue; // Action is forced, can't choose one
      if (!this.pbCanShowCommands(idxBattler)) continue; // Action is forced, can't choose one
      // AI controls this battler
      if (this.controlPlayer || !this.pbOwnedByPlayer(idxBattler)) {
        await this.battleAI.pbDefaultChooseEnemyCommand(idxBattler);
        continue;
      }
      // Player chooses an action
      actioned.push(idxBattler);
      let commandsEnd = false; // Whether to cancel choosing all other actions this round
      for (;;) {
        const cmd = await this.pbCommandMenu(idxBattler, actioned.length === 1);
        // If being Sky Dropped, can't do anything except use a move
        if (cmd > 0 && this.battlers[idxBattler]!.effects[PBEffects.SkyDrop] >= 0) {
          await this.pbDisplay(_INTL("Sky Drop won't let {1} go!", this.battlers[idxBattler]!.pbThis(true)));
          continue;
        }
        if (cmd === 0) { // Fight
          if (await this.pbFightMenu(idxBattler)) break;
        } else if (cmd === 1) { // Bag
          if (await this.pbItemMenu(idxBattler, actioned.length === 1)) {
            if (this.pbItemUsesAllActions(this.choices[idxBattler]![1] as Id)) commandsEnd = true;
            break;
          }
        } else if (cmd === 2) { // Pokémon
          if (await this.pbPartyMenu(idxBattler)) break;
        } else if (cmd === 3) { // Run
          // NOTE: "Run" is only an available option for the first battler the
          //       player chooses an action for in a round. Attempting to run
          //       from battle prevents you from choosing any other actions in
          //       that round.
          if (await this.pbRunMenu(idxBattler)) {
            commandsEnd = true;
            break;
          }
        } else if (cmd === 4) { // Call
          if (await this.pbCallMenu(idxBattler)) break;
        } else if (cmd === -2) { // Debug
          await this.pbDebugMenu();
          continue;
        } else if (cmd === -1) { // Go back to previous battler's action choice
          if (actioned.length <= 1) continue;
          actioned.pop(); // Forget this battler was done
          idxBattler = actioned[actioned.length - 1]! - 1;
          this.pbCancelChoice(idxBattler + 1); // Clear the previous battler's choice
          actioned.pop(); // Forget the previous battler was done
          break;
        }
        this.pbCancelChoice(idxBattler);
      }
      if (commandsEnd) break;
    }
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
