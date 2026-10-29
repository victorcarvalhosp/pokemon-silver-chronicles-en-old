// Port of Data/Scripts/011_Battle/004_Scene/009_Battle_DebugScene.rb
// Essentials Deluxe ([002] Battle Deluxe/Midbattle_Main.rb:1388): dx_midbattle.
//
// Battle::DebugSceneNoLogging: a headless scene, used when generating new
// trainers for battle challenges (and here for scripted tests). It shows
// nothing and picks commands, moves and replacements at random. Methods that
// IBattleScene needs but the Ruby class doesn't define are harmless defaults
// (marked "Not in Ruby"). Subclass it to script a battle: every method is a
// normal method and the battle is in the protected `battle` field.

import { rand } from "../core/random";
import type { Id } from "../data/gameData/gameData";
import type { Target } from "../data/gameData/target";
import type { Pokemon } from "../game/pokemon/Pokemon";
import type { Battle } from "./battle/Battle";
import type { Battler } from "./battler/Battler";
import type {
  BattlerOrIndex,
  FightMenuCallback,
  IBattleScene,
  ItemMenuCallback,
  PartyScreenCallback,
} from "./BattleSceneInterface";

export class DebugSceneNoLogging implements IBattleScene {
  protected battle: Battle | null;
  protected lastCmd: number[];
  protected lastMove: number[];

  constructor() {
    this.battle = null;
    this.lastCmd = [0, 0, 0, 0];
    this.lastMove = [0, 0, 0, 0];
  }

  /** Called whenever the battle begins. */
  async pbStartBattle(battle: Battle): Promise<void> {
    this.battle = battle;
    this.lastCmd = [0, 0, 0, 0];
    this.lastMove = [0, 0, 0, 0];
  }

  pbBlitz(_keys: unknown): number {
    return rand(30);
  }

  /** Called whenever a new round begins. */
  async pbBeginCommandPhase(): Promise<void> {}
  async pbBeginAttackPhase(): Promise<void> {}
  async pbBeginEndOfRoundPhase(): Promise<void> {}
  async pbShowOpponent(_idxTrainer: number): Promise<void> {}
  async pbDamageAnimation(_battler: Battler, _effectiveness = 0): Promise<void> {}
  async pbCommonAnimation(_animName: string, _user: Battler | null = null, _target: Battler | Battler[] | null = null): Promise<void> {}
  async pbAnimation(_moveID: Id, _user: Battler | null, _targets: Battler | Battler[] | null, _hitNum = 0): Promise<void> {}
  async pbHitAndHPLossAnimation(_targets: [Battler, number, number][]): Promise<void> {}
  async pbShowPartyLineup(_side: number, _fullAnim = false): Promise<void> {}
  async pbShowAbilitySplash(_battler: Battler, _delay = false, _logTrigger = true): Promise<void> {}
  async pbReplaceAbilitySplash(_battler: Battler): Promise<void> {}
  async pbHideAbilitySplash(_battler: Battler): Promise<void> {}
  async pbEndBattle(_result: number): Promise<void> {}
  pbWildBattleSuccess(): void {}
  pbTrainerBattleSuccess(): void {}
  pbBattleArenaJudgment(_b1: Battler, _b2: Battler, _r1: number[], _r2: number[]): void {}
  pbBattleArenaBattlers(_b1: Battler, _b2: Battler): void {}

  async pbUpdate(_cw: unknown = null): Promise<void> {}
  pbRefresh(): void {}
  pbRefreshOne(_idxBattler: number): void {}
  /** Not in Ruby. */
  pbRefreshEverything(): void {}

  /**
   * NOTE: as in Ruby, the block (onShown) is ignored: the debug scene's
   * pbDisplayMessage doesn't yield.
   */
  async pbDisplayMessage(_msg: string, _brief = false, _onShown?: () => void): Promise<void> {}
  /** alias pbDisplay pbDisplayMessage (makes this scene usable as a party/bag sub-scene). */
  async pbDisplay(msg: string, brief = false): Promise<void> {
    await this.pbDisplayMessage(msg, brief);
  }
  async pbDisplayPausedMessage(_msg: string, _onShown?: () => void): Promise<void> {}
  async pbDisplayConfirmMessage(_msg: string): Promise<boolean> { return true; }
  async pbShowCommands(_msg: string, _commands: string[], _defaultValue: number): Promise<number> { return 0; }

  async pbSendOutBattlers(_sendOuts: [number, Pokemon][], _startBattle = false): Promise<void> {}
  async pbRecall(_idxBattler: number): Promise<void> {}
  /** Ruby returns -1 without yielding: no item is ever chosen. */
  async pbItemMenu(_idxBattler: number, _firstAction: boolean, _callback: ItemMenuCallback): Promise<void> {}
  pbResetMoveIndex(_idxBattler: number): void {}

  async pbHPChanged(_battler: Battler, _oldHP: number, _showAnim = false): Promise<void> {}
  pbChangePokemon(_idxBattler: BattlerOrIndex, _pkmn: Pokemon): void {}
  async pbFaintBattler(_battler: Battler): Promise<void> {}
  async pbEXPBar(_battler: Battler, _startExp: number, _endExp: number, _tempExp1: number, _tempExp2: number): Promise<void> {}
  async pbLevelUp(_pkmn: Pokemon, _battler: Battler | null, _oldTotalHP: number, _oldAttack: number, _oldDefense: number,
    _oldSpAtk: number, _oldSpDef: number, _oldSpeed: number): Promise<void> {}
  /** Always forget first move */
  async pbForgetMove(_pkmn: Pokemon, _moveToLearn: Id): Promise<number> { return 0; }

  async pbCommandMenu(_idxBattler: number, _firstAction: boolean): Promise<number> {
    if (rand(15) === 0) return 1; // Bag
    if (rand(10) === 0) return 4; // Call
    return 0; // Fight
  }

  /**
   * NOTE: Ruby yields `rand(battler.move.length)`, but Battle::Battler has no
   * `move` method (it raises NoMethodError); this uses battler.moves.length,
   * which is what was meant.
   */
  async pbFightMenu(idxBattler: number, _megaEvoPossible = false, callback: FightMenuCallback): Promise<void> {
    const battler = this.battle!.battlers[idxBattler]!;
    for (let i = 0; i < 50; i++) {
      if (await callback(rand(battler.moves.length))) break;
    }
  }

  async pbChooseTarget(idxBattler: number, _targetData: Target, _visibleSprites: unknown = null): Promise<number> {
    const targets = this.battle!.allOtherSideBattlers(idxBattler).map((b) => b.index);
    if (targets.length === 0) return -1;
    // Ruby: targets.sample
    return targets[rand(targets.length)]!;
  }

  async pbPartyScreen(idxBattler: number, _canCancel = false, _mode = 0, callback?: PartyScreenCallback): Promise<void> {
    const replacements: number[] = [];
    this.battle!.eachInTeamFromBattlerIndex(idxBattler, (_b, idxParty) => {
      if (!this.battle!.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    if (replacements.length === 0) return;
    for (let i = 0; i < 50; i++) {
      if (await callback?.(replacements[rand(replacements.length)]!, this)) break;
    }
  }

  // --- Not in Ruby: IBattleScene methods the debug scene doesn't define -----
  async pbNameEntry(_helpText: string, pkmn: Pokemon): Promise<string> { return pkmn.name; }
  async pbShowPokedex(_species: Id): Promise<void> {}
  pbSwapBattlerSprites(_idxA: number, _idxB: number): void {}
  async pbThrow(_ball: Id, _shakes: number, _critical: boolean, _targetBattler: number, _showPlayer = false): Promise<void> {}
  async pbThrowSuccess(): Promise<void> {}
  async pbHideCaptureBall(_idxBattler: number): Promise<void> {}
  async pbThrowAndDeflect(_ball: Id, _idxBattler: number): Promise<void> {}
  async pbWaitSeconds(_seconds: number): Promise<void> {}

  // --- Essentials Deluxe (Midbattle_Main.rb:1388): Battle Facility compatibility ---
  dxMidbattle(_idxBattler: number | null, _idxTarget: number | null, ..._triggers: string[]): void {}
}

export { DebugSceneNoLogging as DebugSceneNoVisuals };
