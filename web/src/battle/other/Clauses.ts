// Port of Data/Scripts/011_Battle/006_Other battle code/006_Battle_Clauses.rb
// (no plugin patches). This script modifies the battle system to implement
// battle rules.
//
// Ruby reopens Battle, Battle::Battler and several Battle::Move subclasses and
// aliases their methods; here the prototype methods are wrapped at module load
// (../index.ts imports this file after every class file). The core
// pbEndOfRoundPhase is pbEndOfRoundPhaseCore (see Battle_EndOfRoundPhase.ts):
// this script wraps the core method before the plugins wrap it.
//
// The move effect classes are looked up in MoveClasses; the move effect port
// calls applyClausesToMoveClasses() after registering its classes (it is also
// called once at the end of this file, which patches the classes already
// registered). Each class is patched once.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Battle } from "../battle/Battle";
import { Battler } from "../battler/Battler";
import { type Move, MoveClasses } from "../move/Move";

/** Ruby truthiness of a battle rule value (only nil and false are falsy). */
const rule = (battle: Battle, name: string): boolean => {
  const v = battle.rules[name];
  return v != null && v !== false;
};

//===============================================================================
// Battle
//===============================================================================
// alias __clauses__pbDecisionOnDraw pbDecisionOnDraw
const __clauses__pbDecisionOnDraw = Battle.prototype.pbDecisionOnDraw;
// alias __clauses__pbEndOfRoundPhase pbEndOfRoundPhase (the core method)
const __clauses__pbEndOfRoundPhase = Battle.prototype.pbEndOfRoundPhaseCore;

Battle.prototype.pbDecisionOnDraw = function (this: Battle): number {
  if (rule(this, "selfkoclause")) {
    if (this.lastMoveUser < 0) {
      // in extreme cases there may be no last move user
      return 5; // game is a draw
    } else if (this.opposes(this.lastMoveUser)) {
      return 2; // loss
    } else {
      return 1; // win
    }
  }
  return __clauses__pbDecisionOnDraw.call(this);
};

// Redefined without alias (replaces the empty 002_Battle_StartAndEnd.rb version).
Battle.prototype.pbJudgeCheckpoint = function (this: Battle, user: Battler, move: Move | null = null): void {
  if (this.pbAllFainted(0) && this.pbAllFainted(1)) {
    if (rule(this, "drawclause")) { // NOTE: Also includes Life Orb (not implemented)
      if (!(move && move.function === "HealUserByHalfOfDamageDone")) {
        // Not a draw if fainting occurred due to Liquid Ooze
        this.decision = user.opposes() ? 1 : 2; // win / loss
      }
    } else if (rule(this, "modifiedselfdestructclause")) {
      if (move && move.function === "UserFaintsExplosive") { // Self-Destruct
        this.decision = user.opposes() ? 1 : 2; // win / loss
      }
    }
  }
};

Battle.prototype.pbEndOfRoundPhaseCore = async function (this: Battle): Promise<void> {
  await __clauses__pbEndOfRoundPhase.call(this);
  if (rule(this, "suddendeath") && this.decision === 0) {
    const p1able = this.pbAbleCount(0);
    const p2able = this.pbAbleCount(1);
    if (p1able > p2able) {
      this.decision = 1; // loss (sic: 1 is a win)
    } else if (p1able < p2able) {
      this.decision = 2; // win (sic: 2 is a loss)
    }
  }
};

//===============================================================================
// Battle::Battler
//===============================================================================
// alias __clauses__pbCanSleep? pbCanSleep? (both TS variants: without and with messages)
const __clauses__pbCanSleep = Battler.prototype.pbCanSleep;
const __clauses__pbCanSleepAsync = Battler.prototype.pbCanSleepAsync;
// alias __clauses__pbCanSleepYawn? pbCanSleepYawn?
const __clauses__pbCanSleepYawn = Battler.prototype.pbCanSleepYawn;
// alias __clauses__pbCanFreeze? pbCanFreeze?
const __clauses__pbCanFreeze = Battler.prototype.pbCanFreeze;
const __clauses__pbCanFreezeAsync = Battler.prototype.pbCanFreezeAsync;
// Ruby also does `alias __clauses__pbUseMove pbUseMove` but never redefines
// pbUseMove, so that alias has no effect.

function sleepClauseBlocks(b: Battler, user: Battler | null): boolean {
  const selfsleep = user != null && user.index === b.index;
  return (rule(b.battle, "modifiedsleepclause") || (!selfsleep && rule(b.battle, "sleepclause"))) &&
    b.pbHasStatusPokemon("SLEEP");
}

/** pbCanSleep? (without messages) */
Battler.prototype.pbCanSleep = function (this: Battler, user: Battler | null, showMessages: boolean,
  move: Move | null = null, ignoreStatus = false): boolean {
  if (sleepClauseBlocks(this, user)) return false;
  return __clauses__pbCanSleep.call(this, user, showMessages, move, ignoreStatus);
};

/** pbCanSleep? (with messages) */
Battler.prototype.pbCanSleepAsync = async function (this: Battler, user: Battler | null, showMessages: boolean,
  move: Move | null = null, ignoreStatus = false): Promise<boolean> {
  if (sleepClauseBlocks(this, user)) {
    if (showMessages) {
      await this.battle.pbDisplay(_INTL("But {1} couldn't sleep!", this.pbThis(true)));
    }
    return false;
  }
  return __clauses__pbCanSleepAsync.call(this, user, showMessages, move, ignoreStatus);
};

/** pbCanSleepYawn? */
Battler.prototype.pbCanSleepYawn = function (this: Battler): boolean {
  if ((rule(this.battle, "sleepclause") || rule(this.battle, "modifiedsleepclause")) &&
      this.pbHasStatusPokemon("SLEEP")) {
    return false;
  }
  return __clauses__pbCanSleepYawn.call(this);
};

/** pbCanFreeze?(*arg) (without messages) */
Battler.prototype.pbCanFreeze = function (this: Battler,
  ...arg: Parameters<typeof __clauses__pbCanFreeze>): boolean {
  if (rule(this.battle, "freezeclause") && this.pbHasStatusPokemon("FROZEN")) return false;
  return __clauses__pbCanFreeze.call(this, ...arg);
};

/** pbCanFreeze?(*arg) (with messages) */
Battler.prototype.pbCanFreezeAsync = async function (this: Battler,
  ...arg: Parameters<typeof __clauses__pbCanFreezeAsync>): Promise<boolean> {
  if (rule(this.battle, "freezeclause") && this.pbHasStatusPokemon("FROZEN")) return false;
  return __clauses__pbCanFreezeAsync.call(this, ...arg);
};

const battlerMethods = {
  /** pbHasStatusPokemon? */
  pbHasStatusPokemon(this: Battler, status: Id): boolean {
    let count = 0;
    for (const pkmn of this.battle.pbParty(this.index)) {
      if (!pkmn || pkmn.egg()) continue;
      if (pkmn.status !== status) continue;
      count += 1;
    }
    return count > 0;
  },
};

type BattlerMethods = typeof battlerMethods;
declare module "../battler/Battler" {
  interface Battler extends BattlerMethods {}
}
Object.assign(Battler.prototype, battlerMethods);

//===============================================================================
// Battle::Move subclasses
//===============================================================================
type MoveFailedFn = (this: Move, user: Battler, targets: Battler[]) => boolean | Promise<boolean>;
type FailsAgainstTargetFn = (this: Move, user: Battler, target: Battler, showMessage: boolean) => boolean | Promise<boolean>;

/** A patched move: the aliases Ruby adds (looked up dynamically through the prototype chain, as in Ruby). */
interface ClausesMove extends Move {
  __clauses__pbMoveFailed: MoveFailedFn;
  __clauses__pbFailsAgainstTarget: FailsAgainstTargetFn;
}
type Proto = Record<string, unknown>;

/**
 * Ruby's `unless method_defined?(:__clauses__x); alias __clauses__x x; end`
 * followed by `def x`. method_defined? also sees inherited aliases, so a
 * subclass of an already patched class (OHKOIce, OHKOHitsUndergroundTarget <
 * OHKO) gets no alias of its own, and its patched method calls the parent's
 * saved original. For OHKOIce that drops its own Ice-type check (Ruby bug,
 * preserved).
 */
function patchMoveMethod(proto: Proto, method: "pbMoveFailed" | "pbFailsAgainstTarget", wrapper: unknown): void {
  const aliasName = `__clauses__${method}`;
  if (!(aliasName in proto)) proto[aliasName] = proto[method];
  proto[method] = wrapper;
}

/** pbMoveFailed? of RaiseUserEvasion1 (Double Team) and RaiseUserEvasion2MinimizeUser (Minimize). */
async function evasionClauseMoveFailed(this: ClausesMove, user: Battler, targets: Battler[]): Promise<boolean> {
  if (!this.damagingMove() && rule(this.battle, "evasionclause")) {
    await this.battle.pbDisplay(_INTL("But it failed!"));
    return true;
  }
  return this.__clauses__pbMoveFailed(user, targets);
}

/** pbFailsAgainstTarget? that fails when the given rule is set. */
function ruleFailsAgainstTarget(ruleName: string) {
  return async function (this: ClausesMove, user: Battler, target: Battler, showMessage: boolean): Promise<boolean> {
    if (rule(this.battle, ruleName)) {
      if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
      return true;
    }
    return this.__clauses__pbFailsAgainstTarget(user, target, showMessage);
  };
}

/** pbFailsAgainstTarget? of StartPerishCountsForAllBattlers (Perish Song) and AttackerFaintsIfUserFaints (Destiny Bond). */
async function perishSongClauseFailsAgainstTarget(this: ClausesMove, user: Battler, target: Battler,
  showMessage: boolean): Promise<boolean> {
  if (rule(this.battle, "perishsongclause") &&
      this.battle.pbAbleNonActiveCount(user.idxOwnSide()) === 0) {
    if (showMessage) await this.battle.pbDisplay(_INTL("But it failed!"));
    return true;
  }
  return this.__clauses__pbFailsAgainstTarget(user, target, showMessage);
}

/** pbMoveFailed? of UserFaintsExplosive (Self-Destruct). */
async function selfKOClauseMoveFailed(this: ClausesMove, user: Battler, targets: Battler[]): Promise<boolean> {
  if (rule(this.battle, "selfkoclause")) {
    // Check whether no unfainted Pokemon remain in either party
    let count = this.battle.pbAbleNonActiveCount(user.idxOwnSide());
    count += this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
    if (count === 0) {
      // NOTE: Ruby shows "But it failed!" (without _INTL) and then returns
      //       false, so the move is still used (preserved).
      await this.battle.pbDisplay("But it failed!");
      return false;
    }
  }
  if (rule(this.battle, "selfdestructclause")) {
    // Check whether no unfainted Pokemon remain in either party
    let count = this.battle.pbAbleNonActiveCount(user.idxOwnSide());
    count += this.battle.pbAbleNonActiveCount(user.idxOpposingSide());
    if (count === 0) {
      await this.battle.pbDisplay(_INTL("{1}'s team was disqualified!", user.pbThis()));
      this.battle.decision = user.opposes() ? 1 : 2;
      return false;
    }
  }
  return this.__clauses__pbMoveFailed(user, targets);
}

/** The patched move classes, in the Ruby file's order (parents before subclasses). */
const MOVE_CLASS_PATCHES: [className: string, method: "pbMoveFailed" | "pbFailsAgainstTarget", wrapper: unknown][] = [
  ["RaiseUserEvasion1", "pbMoveFailed", evasionClauseMoveFailed], // Double Team
  ["RaiseUserEvasion2MinimizeUser", "pbMoveFailed", evasionClauseMoveFailed], // Minimize
  ["UserTargetSwapAbilities", "pbFailsAgainstTarget", ruleFailsAgainstTarget("skillswapclause")], // Skill Swap
  ["FixedDamage20", "pbFailsAgainstTarget", ruleFailsAgainstTarget("sonicboomclause")], // Sonic Boom
  ["FixedDamage40", "pbFailsAgainstTarget", ruleFailsAgainstTarget("sonicboomclause")], // Dragon Rage
  ["OHKO", "pbFailsAgainstTarget", ruleFailsAgainstTarget("ohkoclause")],
  ["OHKOIce", "pbFailsAgainstTarget", ruleFailsAgainstTarget("ohkoclause")],
  ["OHKOHitsUndergroundTarget", "pbFailsAgainstTarget", ruleFailsAgainstTarget("ohkoclause")],
  ["UserFaintsExplosive", "pbMoveFailed", selfKOClauseMoveFailed], // Self-Destruct
  ["StartPerishCountsForAllBattlers", "pbFailsAgainstTarget", perishSongClauseFailsAgainstTarget], // Perish Song
  ["AttackerFaintsIfUserFaints", "pbFailsAgainstTarget", perishSongClauseFailsAgainstTarget], // Destiny Bond
];

/** Classes (prototypes) already patched, so that each is patched once. */
const patchedMoveClasses = new WeakSet<object>();

/**
 * Applies the clause patches to the Battle::Move subclasses registered in
 * MoveClasses that haven't been patched yet. The move effect port calls this
 * after registering its classes. NOTE: register a parent class (OHKO) before
 * or together with its subclasses, so that they are patched in Ruby's order.
 */
export function applyClausesToMoveClasses(): void {
  for (const [className, method, wrapper] of MOVE_CLASS_PATCHES) {
    const cls = MoveClasses.get(className);
    if (!cls || patchedMoveClasses.has(cls.prototype)) continue;
    patchMoveMethod(cls.prototype as unknown as Proto, method, wrapper);
    patchedMoveClasses.add(cls.prototype);
  }
}

applyClausesToMoveClasses();
