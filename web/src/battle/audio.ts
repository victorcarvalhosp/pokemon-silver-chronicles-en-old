// The sound effects/ME the battle core plays itself in Ruby (pbSEPlay in
// 003_Battle_ExpAndMoveLearning.rb and 007_Battle_ActionRunning.rb, ...).
// Headless battles (tests, DebugSceneNoLogging) run without a Game_System, so
// these do nothing when there's no G.gameSystem.

import { pbMEPlay as gameMEPlay, pbSEPlay as gameSEPlay } from "../game/GameSystem";
import { G } from "../game/globals";

export function pbSEPlay(name: string): void {
  if (G.gameSystem) gameSEPlay(name);
}

export function pbMEPlay(name: string): void {
  if (G.gameSystem) gameMEPlay(name);
}
