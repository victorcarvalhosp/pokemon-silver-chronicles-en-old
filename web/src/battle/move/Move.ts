// Port of Data/Scripts/011_Battle/003_Move/001_Battle_Move.rb (class
// Battle::Move: fields, from_pokemon_move and the move's properties), with:
// - Generation 9 Pack ([001] Battle/[001] Battle.rb:180): windMove?,
//   slicingMove?, electrocuteUser?, display_type (Judgement, Raging Bull).
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:326): short_name.
// - ZUD Mechanics ([006] Battle_Move/Battle_Move.rb:8): specialUseZMove,
//   zmove_flag, old_move, zMove?/maxMove?/powerMove?.
//
// Function codes: Ruby looks up the class Battle::Move::<code> (or
// Battle::Move::Effect<code> for codes starting with a digit). Here every move
// effect class registers itself under that name with registerMoveClass(); the
// move effect files (005-013) only need to call it. Codes without a class fall
// back to Battle::Move::Unimplemented (which behaves like a plain damaging move
// and makes status moves fail), as in Ruby, and are recorded in
// unknownFunctionCodes.
//
// The rest of the class is in Move_Usage.ts, Move_UsageCalculations.ts and
// Move_BaseEffects.ts; see ../index.ts.

import type { Id } from "../../data/gameData/gameData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Target } from "../../data/gameData/target";
import { Type } from "../../data/gameData/type";
import type { MoveCategory } from "../../data/pbs/types";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBEffects } from "../other/PBEffects";

/** A Battle::Move subclass (what Ruby's Object.const_get(class_name) returns). */
export type MoveClass = new (battle: Battle, move: PokemonMove | null) => Move;

/** Battle::Move::<name> classes, by name (function code, or "Effect" + code for codes starting with a digit). */
export const MoveClasses = new Map<string, MoveClass>();

/**
 * Registers a Battle::Move subclass under its Ruby class name
 * (`Battle::Move::RaiseUserAttack1` → "RaiseUserAttack1",
 * `Battle::Move::Effect000`-style names keep their "Effect" prefix).
 */
export function registerMoveClass(name: string, cls: MoveClass): void {
  MoveClasses.set(name, cls);
}

/** Function codes that Move.fromPokemonMove couldn't find a class for (they use Unimplemented). */
export const unknownFunctionCodes = new Set<string>();

/** Ruby's class name for a function code. */
export function moveClassNameForCode(code: string): string {
  return /^\d/.test(code) ? `Effect${code}` : code;
}

export class Move {
  readonly battle: Battle;
  realMove: PokemonMove | null;
  id: Id;
  name: string;
  /** Function code (Ruby: @function). */
  function: string;
  baseDamage: number;
  type: Id | null;
  category: MoveCategory;
  accuracy: number;
  pp: number;
  /** Ruby: attr_writer :total_pp (usually undefined; see totalPp()). */
  _totalPp: number | null = null;
  addlEffect: number;
  target: Id;
  priority: number;
  flags: string[];
  calcType: Id | null;
  /** For Aerilate, Pixilate, Refrigerate, Galvanize */
  powerBoost: boolean;
  snatched: boolean;
  // Essentials Deluxe
  shortName: string;
  // ZUD Mechanics
  specialUseZMove = false;
  /** zmove_flag: a status move turned into a Z-Move (Z-<name>). */
  zmoveFlag = false;
  oldMove: unknown = null;

  static readonly CRITICAL_HIT_RATIOS = Settings.NEW_CRITICAL_HIT_RATE_MECHANICS ? [24, 8, 2, 1] : [16, 8, 4, 3, 2];

  /** to_int */
  toInt(): Id { return this.id; }

  //=============================================================================
  // Creating a move
  //=============================================================================
  /**
   * move is null only for subclasses that set every field themselves (Ruby's
   * Battle::Move::Struggle and ::Confusion don't call super).
   */
  constructor(battle: Battle, move: PokemonMove | null) {
    this.battle = battle;
    this.realMove = move;
    this.id = move ? move.id : "";
    this.name = move ? move.name : ""; // Get the move's name
    // Get data on the move
    this.function = move ? move.functionCode : "None";
    this.baseDamage = move ? move.baseDamage : 0;
    this.type = move ? move.type : null;
    this.category = move ? move.category : 2;
    this.accuracy = move ? move.accuracy : 0;
    this.pp = move ? move.pp : 0; // Can be changed with Mimic/Transform
    this.addlEffect = move ? move.effectChance : 0;
    this.target = move ? move.target : "None";
    this.priority = move ? move.priority : 0;
    this.flags = move ? [...move.flags] : [];
    this.calcType = null;
    this.powerBoost = false; // For Aerilate, Pixilate, Refrigerate, Galvanize
    this.snatched = false;
    // Essentials Deluxe
    this.shortName = Move.shortenName(this.name);
    // ZUD Mechanics
    this.specialUseZMove = false;
    this.oldMove = move ? move.oldMove : null;
    this.zmoveFlag = !!this.oldMove && this.statusMove() && !this.powerMove();
    if (this.zmoveFlag) {
      this.name = "Z-" + this.name;
      this.shortName = Move.shortenName(this.name);
    }
  }

  /** Essentials Deluxe: @short_name (Settings::SHORTEN_MOVES). */
  static shortenName(name: string): string {
    return Settings.SHORTEN_MOVES && name.length > 16 ? name.slice(0, 13) + "..." : name;
  }

  /**
   * This is the code actually used to generate a Battle::Move object. The
   * object generated is a subclass of this one which depends on the move's
   * function code.
   */
  static fromPokemonMove(battle: Battle, move: PokemonMove): Move {
    const code = move.functionCode || "None";
    const cls = MoveClasses.get(moveClassNameForCode(code));
    if (cls) return new cls(battle, move);
    unknownFunctionCodes.add(code);
    return new (MoveClasses.get("Unimplemented") ?? Move)(battle, move);
  }

  /** Battle::Move::Struggle.new(battle, nil), used when the STRUGGLE move doesn't exist. */
  static createStruggle(battle: Battle): Move {
    return new (MoveClasses.get("Struggle") ?? Move)(battle, null);
  }

  //=============================================================================
  // About the move
  //=============================================================================
  pbTarget(_user: Battler | null): Target { return Target.get(this.target); }

  /** total_pp */
  totalPp(): number {
    if (this._totalPp && this._totalPp > 0) return this._totalPp; // Usually undefined
    if (this.realMove) return this.realMove.totalPp;
    return 0;
  }

  /** total_pp= */
  setTotalPp(value: number | null): void { this._totalPp = value; }

  /**
   * physicalMove?
   * NOTE: This method is only ever called while using a move (and also by the
   *       AI), so using @calcType here is acceptable.
   */
  physicalMove(thisType: Id | null = null): boolean {
    if (Settings.MOVE_CATEGORY_PER_MOVE) return this.category === 0;
    thisType ??= this.calcType;
    thisType ??= this.type;
    if (!thisType) return true;
    return Type.get(thisType).physical();
  }

  /**
   * specialMove?
   * NOTE: This method is only ever called while using a move (and also by the
   *       AI), so using @calcType here is acceptable.
   */
  specialMove(thisType: Id | null = null): boolean {
    if (Settings.MOVE_CATEGORY_PER_MOVE) return this.category === 1;
    thisType ??= this.calcType;
    thisType ??= this.type;
    if (!thisType) return false;
    return Type.get(thisType).special();
  }

  /** damagingMove? */
  damagingMove(): boolean { return this.category !== 2; }
  /** statusMove? */
  statusMove(): boolean { return this.category === 2; }

  pbPriority(_user: Battler): number { return this.priority; }

  usableWhenAsleep(): boolean { return false; }
  unusableInGravity(): boolean { return false; }
  healingMove(): boolean { return false; }
  recoilMove(): boolean { return false; }
  flinchingMove(): boolean { return false; }
  callsAnotherMove(): boolean { return false; }
  /**
   * Whether the move can/will hit more than once in the same turn (including
   * Beat Up which may instead hit just once). Not the same as pbNumHits>1.
   */
  multiHitMove(): boolean { return false; }
  chargingTurnMove(): boolean { return false; }
  successCheckPerHit(): boolean { return false; }
  hitsFlyingTargets(): boolean { return false; }
  hitsDiggingTargets(): boolean { return false; }
  hitsDivingTargets(): boolean { return false; }
  /** For Brick Break */
  ignoresReflect(): boolean { return false; }
  /** For Future Sight/Doom Desire */
  targetsPosition(): boolean { return false; }
  /** For Snipe Shot */
  cannotRedirect(): boolean { return false; }
  /** For Explosion */
  worksWithNoTargets(): boolean { return false; }
  /** For Facade */
  damageReducedByBurn(): boolean { return true; }
  triggersHyperMode(): boolean { return false; }
  canSnatch(): boolean { return false; }
  canMagicCoat(): boolean { return false; }

  protected hasFlagRe(re: RegExp): boolean { return this.flags.some((f) => re.test(f)); }
  contactMove(): boolean { return this.hasFlagRe(/^Contact$/i); }
  canProtectAgainst(): boolean { return this.hasFlagRe(/^CanProtect$/i); }
  canMirrorMove(): boolean { return this.hasFlagRe(/^CanMirrorMove$/i); }
  thawsUser(): boolean { return this.hasFlagRe(/^ThawsUser$/i); }
  highCriticalRate(): boolean { return this.hasFlagRe(/^HighCriticalHitRate$/i); }
  bitingMove(): boolean { return this.hasFlagRe(/^Biting$/i); }
  punchingMove(): boolean { return this.hasFlagRe(/^Punching$/i); }
  soundMove(): boolean { return this.hasFlagRe(/^Sound$/i); }
  powderMove(): boolean { return this.hasFlagRe(/^Powder$/i); }
  pulseMove(): boolean { return this.hasFlagRe(/^Pulse$/i); }
  bombMove(): boolean { return this.hasFlagRe(/^Bomb$/i); }
  danceMove(): boolean { return this.hasFlagRe(/^Dance$/i); }
  /** Causes perfect accuracy and double damage if target used Minimize. Perfect accuracy only with Gen 6+ mechanics. */
  tramplesMinimize(): boolean { return this.hasFlagRe(/^TramplesMinimize$/i); }
  // Generation 9 Pack: new move flags.
  windMove(): boolean { return this.hasFlagRe(/^Wind$/i); }
  slicingMove(): boolean { return this.hasFlagRe(/^Slicing$/i); }
  electrocuteUser(): boolean { return this.hasFlagRe(/^ElectrocuteUser$/i); }

  /** For False Swipe */
  nonLethal(_user: Battler, _target: Battler): boolean { return false; }

  /** ignoresSubstitute? — user is the Pokémon using this move */
  ignoresSubstitute(user: Battler | null): boolean {
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      if (this.soundMove()) return true;
      if (user?.hasActiveAbility("INFILTRATOR")) return true;
    }
    return false;
  }

  /** display_type — Generation 9 Pack: Judgement (Legend Plate) and Raging Bull show their real type. */
  displayType(battler: Battler): Id {
    switch (this.function) {
      case "TypeDependsOnUserPlate": // Judgement
      case "TypeDependsOnUserForm": // Raging Bull
        return this.pbBaseType(battler)!;
      case "TypeDependsOnUserMorpekoFormRaiseUserSpeed1":
        if (battler.isSpecies("MORPEKO") || battler.effects[PBEffects.TransformSpecies] === "MORPEKO") {
          return this.pbBaseType(battler)!;
        }
        break;
    }
    return this.realMove!.displayType(battler.pokemon);
  }

  /** display_damage */
  displayDamage(battler: Battler): number {
    return this.realMove!.displayDamage(battler.pokemon);
  }

  /** display_category */
  displayCategory(battler: Battler): MoveCategory {
    return this.realMove!.displayCategory(battler.pokemon);
  }

  /** display_accuracy */
  displayAccuracy(battler: Battler): number { return this.realMove!.displayAccuracy(battler.pokemon); }

  // ZUD Mechanics
  /** zMove? */
  zMove(): boolean { return MoveData.get(this.id).zMove() || this.zmoveFlag; }
  /** maxMove? */
  maxMove(): boolean { return MoveData.get(this.id).maxMove(); }
  /** powerMove? */
  powerMove(): boolean { return MoveData.get(this.id).powerMove(); }
}

// Battle::Move::None (005_MoveEffects_Misc.rb:4) is an empty subclass: moves
// with no special effect (function code "None") are plain Battle::Moves.
export class None extends Move {}
registerMoveClass("None", None);
