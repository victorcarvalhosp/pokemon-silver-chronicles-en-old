// The battle core (Data/Scripts/011_Battle, minus the scene and the AI): import
// this module (not the class files directly) so that every part of Battle,
// Battle::Battler and Battle::Move is attached to its class, in Ruby's load
// order, before a battle is created.
//
//   import { Battle } from "../battle";
//   const battle = new Battle(scene, playerParty, [wildPkmn], G.player, null);
//   const decision = await battle.pbStartBattle();

// 001_Battle
import "./battle/Battle";
import "./battle/Battle_StartAndEnd";
import "./battle/Battle_ExpAndMoveLearning";
import "./battle/Battle_ActionAttacksPriority";
import "./battle/Battle_ActionSwitching";
import "./battle/Battle_ActionUseItem";
import "./battle/Battle_ActionRunning";
import "./battle/Battle_ActionOther";
import "./battle/Battle_CommandPhase";
import "./battle/Battle_AttackPhase";
import "./battle/Battle_EndOfRoundPhase";
// 002_Battler
import "./battler/Battler";
import "./battler/Battler_Initialize";
import "./battler/Battler_ChangeSelf";
import "./battler/Battler_Statuses";
import "./battler/Battler_StatStages";
import "./battler/Battler_AbilityAndItem";
import "./battler/Battler_UseMove";
import "./battler/Battler_UseMoveTargeting";
import "./battler/Battler_UseMoveSuccessChecks";
import "./battler/Battler_UseMoveTriggerEffects";
// 003_Move (001-004; the move effect classes of 005-013 register themselves
// with registerMoveClass from their own files, imported below them)
import "./move/Move";
import "./move/Move_Usage";
import "./move/Move_UsageCalculations";
import "./move/Move_BaseEffects";
import "./move/moveEffects";
// 006_Other battle code
import "./other/PBEffects";
import "./other/ActiveField";
import "./other/DamageState";
import "./other/Peers";
import "./other/CatchAndStoreMixin";
import "./other/Clauses";
import "./other/AbilityEffects";
import "./abilities"; // the ability handlers (008_Battle_AbilityEffects.rb + plugins)
import "./other/ItemEffects";
import "./items"; // the item handlers (009_Battle_ItemEffects.rb, 013_Items/002-003 + plugins)
import "./other/PokeBallEffects";
// ZUD Mechanics: Z-Moves, Ultra Burst, Dynamax (Power Move classes, pbDynamax etc.)
import "./zud";

export { Battle } from "./battle/Battle";
export type { BattleChoice, BattleTrainer } from "./battle/Battle";
export { Battler } from "./battler/Battler";
export { Move, MoveClasses, moveClassNameForCode, registerMoveClass, unknownFunctionCodes } from "./move/Move";
export { PBEffects } from "./other/PBEffects";
export { AbilityEffects } from "./other/AbilityEffects";
export { ItemEffects } from "./other/ItemEffects";
export { AI } from "./ai/AI";
export { DebugSceneNoLogging, DebugSceneNoVisuals } from "./DebugScene";
export type { IBattleScene } from "./BattleSceneInterface";
export { Scene } from "./BattleSceneInterface";
