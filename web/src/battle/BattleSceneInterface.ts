// The Battle::Scene methods that the battle core (Battle, Battle::Battler,
// Battle::Move and the battle code of this game's plugins) calls on @scene.
// Names and parameters are Essentials' (004_Scene/*.rb and the plugins'
// Battle::Scene patches), camelCased; the scene port (web/src/battle/scene/)
// implements this interface, and DebugScene.ts implements it headlessly.
//
// Methods that block in Ruby (messages, animations, menus) return a Promise;
// the battle awaits them. Ruby blocks passed to a scene method (`yield`)
// become callbacks; returning true from the callback is Ruby's
// `break if yield ...` (closes the menu).

import type { Id } from "../data/gameData/gameData";
import type { Target } from "../data/gameData/target";
import type { Pokemon } from "../game/pokemon/Pokemon";
import type { Battle } from "./battle/Battle";
import type { Battler } from "./battler/Battler";

/** Battle::Scene constants the battle reads. */
export const Scene = {
  /** Battle::Scene::USE_ABILITY_SPLASH = (Settings::MECHANICS_GENERATION >= 5), evaluated at load (8). */
  USE_ABILITY_SPLASH: true,
};

/** The party/bag screen a battle callback receives (partyScene/itemScene): it can show messages. */
export interface BattleSubScene {
  pbDisplay(msg: string): Promise<void>;
}

/**
 * pbFightMenu's block: |cmd| where cmd is a move index or one of Essentials
 * Deluxe's (Fight Menu.rb) values: -1 cancel, -2 Shift (triple battles),
 * -3 Mega Evolution, -4.. -11 the other battle mechanics (DXTriggers in
 * battle/Battle_CommandPhase.ts). Return true to close the menu.
 */
export type FightMenuCallback = (cmd: number) => boolean | Promise<boolean>;

/** pbPartyScreen's block: |idxParty, partyScene|. Return true to close the screen. */
export type PartyScreenCallback = (idxParty: number, partyScene: BattleSubScene | null) => boolean | Promise<boolean>;

/**
 * pbItemMenu's block: |item, useType, idxPkmn, idxMove, itemScene|. useType is
 * the item's battle_use (1-5). Return true to close the bag.
 */
export type ItemMenuCallback = (
  item: Id, useType: number, idxPkmn: number, idxMove: number, itemScene: BattleSubScene | null,
) => boolean | Promise<boolean>;

/** A battler or a Pokémon: pbHPChanged/pbChangePokemon etc. accept either, as in Ruby. */
export type BattlerOrIndex = Battler | number;

export interface IBattleScene {
  // --- 001_Battle_Scene.rb ---------------------------------------------------
  /** Called whenever the battle begins (sets up sprites and plays the intro). */
  pbStartBattle(battle: Battle): Promise<void>;
  /** Called at the end of the battle (fades out, disposes). */
  pbEndBattle(result: number): Promise<void>;
  /** Updates the scene for one frame. */
  pbUpdate(cw?: unknown): Promise<void>;
  pbRefresh(): void;
  /** Redraws one battler's data box. */
  pbRefreshOne(idxBattler: number): void;
  pbRefreshEverything(): void;
  /**
   * Shows a message; brief messages don't wait for input. onShown is Ruby's
   * block (`yield if block_given?`), run once the whole message is shown.
   */
  pbDisplayMessage(msg: string, brief?: boolean, onShown?: () => void): Promise<void>;
  /** Shows a message and waits for the player to press a button. */
  pbDisplayPausedMessage(msg: string, onShown?: () => void): Promise<void>;
  pbDisplayConfirmMessage(msg: string): Promise<boolean>;
  /** Returns the chosen index, or defaultValue if cancelled (defaultValue -1 = can't cancel). */
  pbShowCommands(msg: string, commands: string[], defaultValue: number): Promise<number>;
  pbSwapBattlerSprites(idxA: number, idxB: number): void;
  pbBeginCommandPhase(): Promise<void>;
  pbBeginAttackPhase(): Promise<void>;
  pbBeginEndOfRoundPhase(): Promise<void>;
  /** Changes a battler's sprite to the given Pokémon (Transform, Illusion, form changes). */
  pbChangePokemon(idxBattler: BattlerOrIndex, pkmn: Pokemon): void;
  pbResetMoveIndex(idxBattler: number): void;
  /** Plays the wild battle victory BGM. */
  pbWildBattleSuccess(): void;
  /** Plays the trainer battle victory BGM. */
  pbTrainerBattleSuccess(): void;

  // --- 003_Scene_ChooseCommands.rb ---------------------------------------------
  /**
   * Returns 0 Fight, 1 Bag, 2 Pokémon, 3 Run/Call/Forfeit, 4 Call (Shadow),
   * -1 cancel (back to the previous battler's command).
   */
  pbCommandMenu(idxBattler: number, firstAction: boolean): Promise<number>;
  /** pbFightMenu(idxBattler, *mechanics) { |cmd| }: [mega, ultra, zmove, dynamax, style, tera, zodiac, custom]. */
  pbFightMenu(idxBattler: number, ...args: [...mechanics: boolean[], callback: FightMenuCallback]): Promise<void>;
  /**
   * mode (Essentials Deluxe/Enhanced UI) is the party screen mode: 0 switch,
   * 1 choose a Pokémon to use an item on.
   */
  pbPartyScreen(idxBattler: number, canCancel: boolean, mode: number, callback: PartyScreenCallback): Promise<void>;
  pbItemMenu(idxBattler: number, firstAction: boolean, callback: ItemMenuCallback): Promise<void>;
  /** Returns the chosen battler index, or -1 if cancelled. */
  pbChooseTarget(idxBattler: number, targetData: Target, visibleSprites?: unknown): Promise<number>;
  /** Returns the index of the move to forget (Pokemon::MAX_MOVES or -1 = don't learn). */
  pbForgetMove(pkmn: Pokemon, moveToLearn: Id): Promise<number>;
  /** Nicknaming a caught Pokémon; returns the new name. */
  pbNameEntry(helpText: string, pkmn: Pokemon): Promise<string>;
  /** Shows a newly caught species' Pokédex entry. */
  pbShowPokedex(species: Id): Promise<void>;

  // --- 004_Scene_PlayAnimations.rb ---------------------------------------------
  pbShowPartyLineup(side: number, fullAnim?: boolean): Promise<void>;
  /** Shows trainer idxTrainer (slides the opposing trainer back in). */
  pbShowOpponent(idxTrainer: number): Promise<void>;
  /** sendOuts: [[idxBattler, pkmn], ...]. */
  pbSendOutBattlers(sendOuts: [number, Pokemon][], startBattle?: boolean): Promise<void>;
  pbRecall(idxBattler: number): Promise<void>;
  pbShowAbilitySplash(battler: Battler): Promise<void>;
  pbHideAbilitySplash(battler: Battler): Promise<void>;
  pbReplaceAbilitySplash(battler: Battler): Promise<void>;
  /** Called by Battler#pbReduceHP and #pbRecoverHP. */
  pbHPChanged(battler: Battler, oldHP: number, showAnim?: boolean): Promise<void>;
  /** effectiveness: 0 normal, 1 not very effective, 2 super effective. */
  pbDamageAnimation(battler: Battler, effectiveness?: number): Promise<void>;
  /** targets: [[battler, oldHP, effectiveness], ...] */
  pbHitAndHPLossAnimation(targets: [Battler, number, number][]): Promise<void>;
  pbEXPBar(battler: Battler | null, startExp: number, endExp: number, tempExp1: number, tempExp2: number): Promise<void>;
  pbLevelUp(pkmn: Pokemon, battler: Battler | null, oldTotalHP: number, oldAttack: number, oldDefense: number,
    oldSpAtk: number, oldSpDef: number, oldSpeed: number): Promise<void>;
  pbFaintBattler(battler: Battler): Promise<void>;
  /** Poké Ball throw: shakes 0-4, critical capture flag. */
  pbThrow(ball: Id, shakes: number, critical: boolean, targetBattler: number, showPlayer?: boolean): Promise<void>;
  pbThrowSuccess(): Promise<void>;
  pbHideCaptureBall(idxBattler: number): Promise<void>;
  pbThrowAndDeflect(ball: Id, idxBattler: number): Promise<void>;
  /** moveID is a move's ID; targets one battler or an array. */
  pbAnimation(moveID: Id, user: Battler | null, targets: Battler | Battler[] | null, hitNum?: number): Promise<void>;
  pbCommonAnimation(animName: string, user?: Battler | null, target?: Battler | Battler[] | null): Promise<void>;

  /**
   * Graphics.frame_rate.times { @scene.pbUpdate } and similar fixed waits in
   * the battle code: waits `seconds` while updating the scene.
   */
  pbWaitSeconds(seconds: number): Promise<void>;

  // --- Plugins ---------------------------------------------------------------
  /** Essentials Deluxe (Battle_Scene.rb): whether a common animation exists. */
  pbCommonAnimationExists?(animName: string): boolean;
  /** Essentials Deluxe: Mega Evolution / Primal Reversion animations. */
  pbShowMegaEvolution?(idxBattler: number): Promise<void>;
  pbShowPrimalReversion?(idxBattler: number): Promise<void>;
  /** Essentials Deluxe: hides/shows a battler while its sprite is reverted. */
  pbRevertBattlerStart?(idxBattler: number): Promise<void>;
  pbRevertBattlerEnd?(): Promise<void>;
  /** Essentials Deluxe: a wild Pokémon fleeing (e.g. boss flee). */
  pbBattlerFlee?(battler: Battler, msg?: string | null): Promise<void>;
  /** Essentials Deluxe midbattle scripting (Midbattle_Triggers.rb:26). Deferred: no-op when absent. */
  pbDeluxeTriggers?(idxBattler: number | Battler | null, idxTarget: number | Battler | null, triggers: string[]): Promise<void>;
  /** ZUD Mechanics (deferred). */
  pbShowZMove?(idxBattler: number, moveId: Id): Promise<void>;
  pbShowUltraBurst?(idxBattler: number): Promise<void>;
  pbShowDynamax?(idxBattler: number): Promise<void>;
  pbRevertDynamax?(idxBattler: number, withForm?: boolean): Promise<void>;
  pbDynamaxSendOut?(idxBattler: number, xpos: number, ypos: number): Promise<void>;
  /** Generation 9 Pack (Legend Plate Arceus). */
  pbArceusTransform?(index: number, type?: Id): Promise<void>;
}
