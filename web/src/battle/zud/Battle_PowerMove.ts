// Port of Plugins/ZUD Mechanics/[006] Battle_Move/Battle_PowerMove.rb: the
// general Battle::PowerMove class (Z-Moves and Max Moves), with
// from_pokemon_move, the Power Move base damage tables and the partial
// protection rule.
//
// Battle::PowerMove.from_pokemon_move looks up "Battle::PowerMove::<code>"
// with Object.const_defined?/const_get, which also search the ancestors of
// Battle::PowerMove: a code without a PowerMove class (e.g. the function code
// of the status move a Z-Powered status move is made from, "RaiseUserAttack2")
// finds Battle::Move::<code>, so those moves are plain Battle::Moves (with
// old_move set, so zmove_flag). Here: PowerMoveClasses first, then
// MoveClasses, then Battle::PowerMove::Unimplemented. The Power Move effect
// classes register themselves with registerPowerMoveClass (zud/MoveEffects_*.ts);
// some of them subclass Battle::Move classes rather than Battle::PowerMove
// (Max Guard, G-Max Drum Solo & co., Guardian of Alola), as in Ruby.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Target } from "../../data/gameData/target";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { Move, type MoveClass, MoveClasses, moveClassNameForCode } from "../move/Move";
import { PBEffects } from "../other/PBEffects";

/** Battle::PowerMove::<name> classes, by name (Ruby's class name for the function code). */
export const PowerMoveClasses = new Map<string, MoveClass>();

/** Registers a Battle::PowerMove::<name> class (see Move.ts's registerMoveClass). */
export function registerPowerMoveClass(name: string, cls: MoveClass): void {
  PowerMoveClasses.set(name, cls);
}

/** Function codes that PowerMove.fromPokemonMove couldn't find a class for (they use PowerMove::Unimplemented). */
export const unknownPowerMoveCodes = new Set<string>();

/**
 * A Battle::Move as GameData::PowerMove's zmove_from/maxmove_from see it:
 * `when Battle::PowerMove` only for instances of Battle::PowerMove.
 */
export function powerMoveParam(move: Move): { id: Id; type: Id; powerMove: boolean } {
  return { id: move.id, type: move.type!, powerMove: move instanceof PowerMove };
}

export class PowerMove extends Move {
  /**
   * Ruby's `when Battle::PowerMove` in GameData::PowerMove.zmove_from /
   * maxmove_from (data/gameData/powerMove.ts reads this marker; Battle::Move
   * instances, including Power Move classes that don't subclass
   * Battle::PowerMove, don't have it).
   */
  readonly isPowerMoveClass = true;

  constructor(battle: Battle, move: PokemonMove | null) {
    // validate move => Pokemon::Move
    super(battle, move);
    const oldMove = this.oldMove as Move;
    this.category = (MoveData.get(move!.id).category === 2) ? 2 : oldMove.category;
    if (this.baseDamage <= 10 && this.category < 2) {
      if (move!.zMove()) this.baseDamage = this.calcDamageZmove();
      if (move!.maxMove()) this.baseDamage = this.calcDamageMaxmove();
    }
  }

  static override fromPokemonMove(battle: Battle, move: PokemonMove): Move {
    // validate move => Pokemon::Move
    const code = move.functionCode || "None";
    const className = moveClassNameForCode(code);
    const cls = PowerMoveClasses.get(className) ?? MoveClasses.get(className);
    if (cls) return new cls(battle, move);
    unknownPowerMoveCodes.add(code);
    return new (PowerMoveClasses.get("Unimplemented") ?? PowerMove)(battle, move);
  }

  //-----------------------------------------------------------------------------
  // Abilities that change move type don't work on Power Moves. (unless Z-Powered status moves)
  //-----------------------------------------------------------------------------
  override pbBaseType(user: Battler): Id | null {
    if (this.zmoveFlag) return super.pbBaseType(user);
    return this.type;
  }

  //-----------------------------------------------------------------------------
  // Protection moves don't fully negate Power Moves.
  //-----------------------------------------------------------------------------
  override pbModifyDamage(damageMult: number, _user: Battler, target: Battler): number {
    if (this.function === "ZUDBypassProtect") return damageMult; // G-Max One Blow/Rapid Flow
    let isProtected = false;
    if (target.effects[PBEffects.Protect] ||
        target.effects[PBEffects.KingsShield] ||
        target.effects[PBEffects.SpikyShield] ||
        target.effects[PBEffects.BanefulBunker] ||
        target.effects[PBEffects.Obstruct] ||
        target.pbOwnSide().effects[PBEffects.MatBlock]) {
      isProtected = true;
    } else if (target.effects[PBEffects.SilkTrap]) { // defined?(PBEffects::SilkTrap): Gen 9 Pack
      isProtected = true;
    } else if (Target.get(this.target).numTargets > 1 &&
               target.pbOwnSide().effects[PBEffects.WideGuard]) {
      isProtected = true;
    }
    if (isProtected) {
      // Ruby displays this during the damage calculation (pbCalcDamage plays it there).
      const msg = _INTL("{1} couldn't fully protect itself!", target.pbThis());
      this.battle.pendingSceneEffects.push(() => this.battle.pbDisplay(msg));
      return damageMult / 4;
    }
    return damageMult;
  }

  //-----------------------------------------------------------------------------
  // Calculates the base power of a Z-Move, based on the original move.
  //-----------------------------------------------------------------------------
  calcDamageZmove(): number {
    const oldMove = this.oldMove as Move;
    const damage = oldMove.baseDamage;
    const func = oldMove.function;
    if (this.statusMove() || this.zmoveFlag) return 0;
    switch (func) {
      case "OHKO": // Horn Drill, Guillotine, etc.
      case "OHKOIce": // Sheer Cold
      case "OHKOHitsUndergroundTarget": // Fissure
        return 180;
    }
    switch (oldMove.id) {
      case "VCREATE": return 220;
      case "GEARGRIND": return 180;
      case "FLYINGPRESS": return 170;
      case "HEX": return 160;
      case "WEATHERBALL": return 160;
      case "COREENFORCER": return 140;
      case "MEGADRAIN": return 120;
      case "STRUGGLE": return 1;
    }
    if (damage >= 140) return 200;
    else if (damage >= 130) return 195;
    else if (damage >= 120) return 190;
    else if (damage >= 110) return 185;
    else if (damage >= 100) return 180;
    else if (damage >= 90) return 175;
    else if (damage >= 80) return 160;
    else if (damage >= 70) return 140;
    else if (damage >= 60) return 120;
    return 100;
  }

  //-----------------------------------------------------------------------------
  // Calculates the base power of a Max Move, based on the original move.
  //-----------------------------------------------------------------------------
  calcDamageMaxmove(): number {
    const oldMove = this.oldMove as Move;
    const damage = oldMove.baseDamage;
    const func = oldMove.function;
    if (oldMove.statusMove()) return 0;
    const weaken = (Settings.MOVE_TYPES_TO_WEAKEN as readonly string[]).includes(oldMove.type ?? "");
    switch (func) {
      case "PowerHigherWithUserHP": // Eruption, Water Spout, etc.
        return weaken ? 100 : 150;
      case "PowerHigherWithTargetHP": // Crush Grip
        return weaken ? 95 : 140;
      case "HitTwoTimes": // Bonemarang, Dual Wingbeat, etc.
      case "HitTwoTimesTargetThenTargetAlly": // Dragon Darts
      case "HitTwoTimesFlinchTarget": // Double Iron Bash
      case "HitThreeTimesPowersUpWithEachHit": { // Triple Kick
        const dmg = (damage >= 60) ? 140 : (damage >= 40) ? 130 : 120;
        return weaken ? dmg - 40 : dmg;
      }
      case "OHKO": // Horn Drill, Guillotine, etc.
      case "OHKOIce": // Sheer Cold
      case "OHKOHitsUndergroundTarget": // Fissure
      case "PowerLowerWithUserHP": // Flail, Reversal, etc.
      case "LowerTargetHPToUserHP": // Endeavor
      case "PowerHigherWithUserFasterThanTarget": // Electro Ball
      case "PowerHigherWithTargetFasterThanUser": // Gyro Ball
      case "PowerHigherWithTargetWeight": // Grass Knot, Low Kick, etc.
      case "PowerHigherWithUserHeavierThanTarget": // Heavy Slam, Heat Crash, etc.
      case "PowerHigherWithUserPositiveStatStages": // Stored Power, Power Trip, etc.
        return weaken ? 100 : 130;
      case "HitTwoToFiveTimes": // Bullet Seed, Pin Missile, etc.
      case "HitTwoToFiveTimesRaiseUserSpd1LowerUserDef1": // Scale Shot
      case "HitThreeTimesAlwaysCriticalHit": { // Surging Strikes
        const dmg = (damage >= 25) ? 130 : 100;
        return weaken ? dmg - 30 : dmg;
      }
      case "FixedDamageUserLevel": // Night Shade, Seismic Toss, etc.
      case "FixedDamageUserLevelRandom": // Psywave
      case "FixedDamageHalfTargetHP": // Super Fang
      case "UserFaintsFixedDamageUserHP": // Final Gambit
      case "CounterPhysicalDamage": // Counter
      case "CounterSpecialDamage": // Mirror Coat
      case "CounterDamagePlusHalf": // Metal Burst
      case "HitOncePerUserTeamMember": // Beat Up
      case "ThrowUserItemAtTarget": // Fling
      case "RandomlyDamageOrHealTarget": // Present
      case "PowerDependsOnUserStockpile": // Spit Up
        return weaken ? 75 : 100;
    }
    if (damage >= 150) return weaken ? 100 : 150;
    else if (damage >= 110) return weaken ? 95 : 140;
    else if (damage >= 75) return weaken ? 90 : 130;
    else if (damage >= 65) return weaken ? 85 : 120;
    else if (damage >= 55) return weaken ? 80 : 110;
    else if (damage >= 45) return weaken ? 75 : 100;
    return weaken ? 70 : 90;
  }
}
