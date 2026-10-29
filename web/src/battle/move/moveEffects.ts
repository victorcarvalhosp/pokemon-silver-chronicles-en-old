// The move effect classes (Data/Scripts/011_Battle/003_Move/005-013), one TS
// file per Ruby file, in load order. Each class registers itself with
// registerMoveClass under its Ruby class name; Battle::Move.from_pokemon_move
// looks function codes up there (see Move.ts).
//
// Only a few classes of 006 and 008 are ported so far (MoveEffects_BattlerStats.ts,
// MoveEffects_MoveAttributes.ts);
// function codes without a class use Battle::Move::Unimplemented.

import "./MoveEffects_BattlerStats";
import "./MoveEffects_MoveAttributes";
