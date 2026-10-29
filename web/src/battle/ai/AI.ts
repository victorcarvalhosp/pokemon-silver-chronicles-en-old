// Battle::AI (Data/Scripts/011_Battle/005_AI/*.rb + the Improved AI, Generation
// 9 Pack, v20.1 Hotfixes, Essentials Deluxe and ZUD Mechanics patches): import
// AI from this module, which loads every part of the class in the game's load
// order (the order matters for pbGetMoveScoreFunctionCode, whose parts each
// wrap the previous one as Ruby's aliases do):
//   pbGetMoveScoreFunctionCode = ZUD( Improved AI( Gen 9( core 3( core 2( core 1 ))))).
// See each file's header for what it ports and what's deferred.

import { AI } from "./Battle_AI";
// Data/Scripts/011_Battle/005_AI (002-008, with their plugin patches)
import "./AI_Item";
import "./AI_Switch";
import "./AI_Move";
import "./AI_Move_EffectScores_1";
import "./AI_Move_EffectScores_2";
import "./AI_Move_EffectScores_3";
import "./AI_Move_Utilities";
// Plugins, in plugin load order
import "./AI_Move_EffectScores_Gen9";
import "./AI_Move_EffectScores_ImprovedAI";
import "./AI_Move_EffectScores_ZUD";

export { AI };
export { type AIChoice, PBTrainerAI } from "./Battle_AI";
