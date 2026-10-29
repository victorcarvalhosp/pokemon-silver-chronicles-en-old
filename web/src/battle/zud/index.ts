// ZUD Mechanics' battle side (Plugins/ZUD Mechanics, minus [009] Max Raid and
// [010] Adventures): Z-Moves, Ultra Burst and Dynamax/Gigantamax. Imported by
// battle/index.ts after the core so that these methods and Power Move classes
// are attached before a battle is created. Most of ZUD's patches of the core
// are folded into the core files (see their headers); these files hold what
// ZUD adds:
//   Battle.ts                  [003] Battle/Battle.rb:64-178 (pbCan*, pbUltraBurst, pbDynamax)
//   Battler_MoveConversion.ts  [004] Battle_Battler/Battler_MoveConversion.rb
//   Battle_Move.ts             [006] Battle_Move/Battle_Move.rb:84 (status_zmove_effect)
//   Battle_PowerMove.ts        [006] Battle_Move/Battle_PowerMove.rb
//   PowerMove_BaseEffects.ts   [006] Battle_Move/PowerMove_BaseEffects.rb
//   MoveEffects_*.ts           [007] Move Effects/*.rb
// (Essentials Deluxe's apply_*_effects, which GeneralEffect uses, are in
// deluxe/Midbattle_Effects.ts.) The AI parts are in ai/AI_Move.ts and ai/AI_Move_EffectScores_ZUD.ts, the
// scene parts in zud/scene/.

import "./Battle";
import "./Battler_MoveConversion";
import "./Battle_Move";
import "./Battle_PowerMove";
import "./PowerMove_BaseEffects";
import "./MoveEffects_BattlerStats";
import "./MoveEffects_BattlerStatus";
import "./MoveEffects_BattlerEffects";
import "./MoveEffects_BattleSides";
import "./MoveEffects_BattleField";
import "./MoveEffects_Other";
import "./MoveEffects_Custom";

export { PowerMove, PowerMoveClasses, registerPowerMoveClass, unknownPowerMoveCodes } from "./Battle_PowerMove";
