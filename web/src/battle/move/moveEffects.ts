// The move effect classes (Data/Scripts/011_Battle/003_Move/005-013), one TS
// file per Ruby file, in load order, then the plugin files that add new move
// effect classes. Each class registers itself with registerMoveClass under its
// Ruby class name; Battle::Move.from_pokemon_move looks function codes up there
// (see Move.ts). Plugin patches of existing classes (v20.1 Hotfixes,
// Generation 9 Pack [000] Move Functions.rb, Essentials Deluxe, ZUD Mechanics'
// Override_Moves.rb) are folded into the class in its core file; each file's
// header lists them.
//
// Function codes without a class use Battle::Move::Unimplemented (see
// data/reports/battle-function-codes.json).

import "./MoveEffects_Misc"; // 005
import "./MoveEffects_BattlerStats"; // 006
import "./MoveEffects_BattlerOther"; // 007
import "./MoveEffects_MoveAttributes"; // 008
import "./MoveEffects_MultiHit"; // 009
import "./MoveEffects_Healing"; // 010
import "./MoveEffects_Items"; // 011
import "./MoveEffects_ChangeMoveEffect"; // 012
import "./MoveEffects_SwitchingActing"; // 013
// 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb (Shadow moves)
import "./MoveEffects_Shadow";
// Generation 9 Pack Scripts/[002] Moves/[001] New Move Functions.rb
import "./MoveEffects_Gen9NewMoveFunctions";
// ZUD Mechanics/[008] Overrides/Override_Moves.rb (its new class)
import "./MoveEffects_ZUDOverrideMoves";
