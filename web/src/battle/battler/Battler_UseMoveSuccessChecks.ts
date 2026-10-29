// Port of Data/Scripts/011_Battle/002_Battler/009_Battler_UseMoveSuccessChecks.rb, with:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb:442): pbCanChooseMove?
//   (Gigaton Hammer/Blood Moon can't be used twice in a row), :459
//   pbSuccessCheckAgainstTarget (Mold Breaker re-check, Silk Trap);
//   [001] Battle/[005] Weather and Status.rb:433 pbTryUseMove (Drowsy).
// - Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:267): pbTryUseMove,
//   pbSuccessCheckAgainstTarget, pbMissMessage (midbattle triggers).
// - ZUD Mechanics ([004] Battle_Battler/Battler_Overrides.rb:84): pbTryUseMove
//   (Z-Move flag), :257 pbCanChooseMove? (Power Moves), :287
//   pbSuccessCheckAgainstTarget (Dynamax immunities, Max Guard).
// Alias chains: pbCanChooseMove? = ZUD( Gen 9( core ) );
// pbTryUseMove = ZUD( Deluxe( Gen 9( core ) ) );
// pbSuccessCheckAgainstTarget = ZUD( Deluxe( Gen 9( core ) ) );
// pbMissMessage = Deluxe( core ).
// pbHyperModeObedience comes from 014_Pokemon/001_Pokemon-related/
// 002_ShadowPokemon_Other.rb:224 (its only caller is pbObedienceCheck? below).

import { rand } from "../../core/random";
import { _INTL } from "../../data/gameData/gameData";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness } from "../../data/gameData/type";
import type { BattleChoice } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";

/** Battle::SuccessState#protected (Battle#successStates is unknown[] in Battle.ts). */
const setSuccessStateProtected = (battler: Battler, idx: number): void => {
  (battler.battle.successStates[idx] as { protected: boolean }).protected = true;
};

/** @battle.choices[idx][4]: the move priority saved by pbCalculatePriority (BattleChoice is a 4-tuple). */
const choicePriority = (battler: Battler, idx: number): number =>
  (battler.battle.choices[idx] as unknown as unknown[])[4] as number;

/**
 * The checks of Battle::Battler#pbCanChooseMove? (ZUD( Gen 9( core ) )) up to,
 * not including, the move's own pbCanChooseMove? (Belch): returns the message
 * of the first one that fails, or null if they all pass. ZUD Mechanics: Power
 * Moves ignore effects that would prevent move selection, except that Taunt
 * still prevents the selection of Max Guard and Gravity still prevents the
 * selection of moves affected by Gravity.
 */
function cannotChooseMoveMessage(b: Battler, move: Move, commandPhase: boolean, specialUsage: boolean): string | null {
  // ZUD Mechanics
  if (move.powerMove()) {
    if (b.battle.field.effects[PBEffects.Gravity] > 0 && move.unusableInGravity()) {
      return _INTL("{1} can't use {2} because of gravity!", b.pbThis(), move.name);
    }
    if (b.effects[PBEffects.Taunt] > 0 && move.statusMove() && move.maxMove()) {
      return _INTL("{1} can't use {2} after the taunt!", b.pbThis(), move.name);
    }
    return null;
  }
  // Generation 9 Pack: Gigaton Hammer can't be selected consecutively.
  if (!b.effects[PBEffects.Instructed] && b.lastMoveUsed === move.id &&
      b.effects[PBEffects.SuccessiveMove] === move.id) {
    return _INTL("{1} can't be used twice in a row!", move.name);
  }
  // Disable
  if (b.effects[PBEffects.DisableMove] === move.id && !specialUsage) {
    return _INTL("{1}'s {2} is disabled!", b.pbThis(), move.name);
  }
  // Heal Block
  if (b.effects[PBEffects.HealBlock] > 0 && move.healingMove()) {
    return _INTL("{1} can't use {2} because of Heal Block!", b.pbThis(), move.name);
  }
  // Gravity
  if (b.battle.field.effects[PBEffects.Gravity] > 0 && move.unusableInGravity()) {
    return _INTL("{1} can't use {2} because of gravity!", b.pbThis(), move.name);
  }
  // Throat Chop
  if (b.effects[PBEffects.ThroatChop] > 0 && move.soundMove()) {
    return _INTL("{1} can't use {2} because of Throat Chop!", b.pbThis(), move.name);
  }
  // Choice Band/Gorilla Tactics
  if (!b.pbHasMove(b.effects[PBEffects.ChoiceBand])) b.effects[PBEffects.ChoiceBand] = null;
  if (b.effects[PBEffects.ChoiceBand] && move.id !== b.effects[PBEffects.ChoiceBand]) {
    const choicedMoveName = MoveData.get(b.effects[PBEffects.ChoiceBand]).name;
    if (b.hasActiveItem(["CHOICEBAND", "CHOICESPECS", "CHOICESCARF"])) {
      return _INTL("The {1} only allows the use of {2}!", b.itemName(), choicedMoveName);
    } else if (b.hasActiveAbility("GORILLATACTICS")) {
      return _INTL("{1} can only use {2}!", b.pbThis(), choicedMoveName);
    }
  }
  // Taunt
  if (b.effects[PBEffects.Taunt] > 0 && move.statusMove()) {
    return _INTL("{1} can't use {2} after the taunt!", b.pbThis(), move.name);
  }
  // Torment
  if (b.effects[PBEffects.Torment] && !b.effects[PBEffects.Instructed] &&
      b.lastMoveUsed && move.id === b.lastMoveUsed && move.id !== b.battle.struggle.id) {
    return _INTL("{1} can't use the same move twice in a row due to the torment!", b.pbThis());
  }
  // Imprison
  if (b.battle.allOtherSideBattlers(b.index).some((o) => o.effects[PBEffects.Imprison] && o.pbHasMove(move.id))) {
    return _INTL("{1} can't use its sealed {2}!", b.pbThis(), move.name);
  }
  // Assault Vest (prevents choosing status moves but doesn't prevent
  // executing them)
  if (b.hasActiveItem("ASSAULTVEST") && move.statusMove() && move.id !== "MEFIRST" && commandPhase) {
    return _INTL("The effects of the {1} prevent status moves from being used!", b.itemName());
  }
  return null;
}

const methods = {
  //=============================================================================
  // Decide whether the trainer is allowed to tell the Pokémon to use the given
  // move. Called when choosing a command for the round.
  // Also called when processing the Pokémon's action, because these effects also
  // prevent Pokémon action. Relevant because these effects can become active
  // earlier in the same round (after choosing the command but before using the
  // move) or an unusable move may be called by another move such as Metronome.
  //=============================================================================
  /**
   * pbCanChooseMove? without messages (showMessages = false); see
   * pbCanChooseMoveAsync for showMessages = true. Both run the same checks
   * (cannotChooseMoveMessage) followed by the move's own check (Belch).
   */
  pbCanChooseMove(this: Battler, move: Move, commandPhase: boolean, _showMessages: false = false,
    specialUsage = false): boolean {
    if (cannotChooseMoveMessage(this, move, commandPhase, specialUsage) != null) return false;
    // Belch
    // NOTE: needs Battle::Move#pbCanChooseMove? without messages to be
    //       synchronous (Move#pbCanChooseMove sync + Move#pbCanChooseMoveAsync,
    //       like Battle and Battler); typed so a Promise here is a type error.
    const moveAllows: boolean = move.pbCanChooseMove(this, commandPhase, false);
    if (!moveAllows) return false;
    return true;
  },

  /** pbCanChooseMove?(move, commandPhase, showMessages, specialUsage): shows the reason when showMessages. */
  async pbCanChooseMoveAsync(this: Battler, move: Move, commandPhase: boolean, showMessages = true,
    specialUsage = false): Promise<boolean> {
    const msg = cannotChooseMoveMessage(this, move, commandPhase, specialUsage);
    if (msg != null) {
      if (showMessages) {
        if (commandPhase) {
          await this.battle.pbDisplayPaused(msg);
        } else {
          await this.battle.pbDisplay(msg);
        }
      }
      return false;
    }
    // Belch
    if (!(await move.pbCanChooseMoveAsync(this, commandPhase, showMessages))) return false;
    return true;
  },

  //=============================================================================
  // Obedience check
  //=============================================================================
  /**
   * pbObedienceCheck? — Return true if Pokémon continues attacking (although it
   * may have chosen to use a different move in disobedience), or false if
   * attack stops.
   */
  async pbObedienceCheck(this: Battler, choice: BattleChoice): Promise<boolean> {
    if (this.usingMultiTurnAttack()) return true;
    if (choice[0] !== "UseMove") return true;
    if (!this.battle.internalBattle) return true;
    if (!this.battle.pbOwnedByPlayer(this.index)) return true;
    let disobedient = false;
    // Pokémon may be disobedient; calculate if it is
    let badgeLevel = (10 * (this.battle.pbPlayer().badgeCount() + 1)) + 5;
    if (this.battle.pbPlayer().badgeCount() >= 8) badgeLevel = GrowthRate.maxLevel();
    if (Settings.ANY_HIGH_LEVEL_POKEMON_CAN_DISOBEY ||
        (Settings.FOREIGN_HIGH_LEVEL_POKEMON_CAN_DISOBEY && this.pokemon!.foreign(this.battle.pbPlayer()))) {
      if (this.level > badgeLevel) {
        const a = Math.floor((this.level + badgeLevel) * this.battle.pbRandom(256) / 256);
        disobedient ||= (a >= badgeLevel);
      }
    }
    // Ruby's `|=` always evaluates its right-hand side (pbHyperModeObedience can call rand)
    const hyperModeDisobedient = !this.pbHyperModeObedience(choice[2] as Move | null);
    disobedient ||= hyperModeDisobedient;
    if (!disobedient) return true;
    // Pokémon is disobedient; make it do something else
    return this.pbDisobey(choice, badgeLevel);
  },

  async pbDisobey(this: Battler, choice: BattleChoice, badgeLevel: number): Promise<boolean> {
    const move = choice[2] as Move;
    PBDebug.log(`[Disobedience] ${this.pbThis()} disobeyed`);
    this.effects[PBEffects.Rage] = false;
    // Do nothing if using Snore/Sleep Talk
    if (this.status === "SLEEP" && move.usableWhenAsleep()) {
      await this.battle.pbDisplay(_INTL("{1} ignored orders and kept sleeping!", this.pbThis()));
      return false;
    }
    const b = Math.floor((this.level + badgeLevel) * this.battle.pbRandom(256) / 256);
    // Use another move
    if (b < badgeLevel) {
      await this.battle.pbDisplay(_INTL("{1} ignored orders!", this.pbThis()));
      if (!this.battle.pbCanShowFightMenu(this.index)) return false;
      const otherMoves: number[] = [];
      for (let i = 0; i < this.moves.length; i++) { // eachMoveWithIndex
        if (i === choice[1]) continue;
        if (this.battle.pbCanChooseMove(this.index, i, false)) otherMoves.push(i);
      }
      if (otherMoves.length === 0) return false; // No other move to use; do nothing
      const newChoice = otherMoves[this.battle.pbRandom(otherMoves.length)]!;
      choice[1] = newChoice;
      choice[2] = this.moves[newChoice];
      choice[3] = -1;
      return true;
    }
    const c = this.level - badgeLevel;
    let r = this.battle.pbRandom(256);
    // Fall asleep
    if (r < c && this.pbCanSleep(this, false)) {
      await this.pbSleepSelf(_INTL("{1} began to nap!", this.pbThis()));
      return false;
    }
    // Hurt self in confusion
    r -= c;
    if (r < c && this.status !== "SLEEP") {
      await this.pbConfusionDamage(_INTL("{1} won't obey! It hurt itself in its confusion!", this.pbThis()));
      return false;
    }
    // Show refusal message and do nothing
    switch (this.battle.pbRandom(4)) {
      case 0: await this.battle.pbDisplay(_INTL("{1} won't obey!", this.pbThis())); break;
      case 1: await this.battle.pbDisplay(_INTL("{1} turned away!", this.pbThis())); break;
      case 2: await this.battle.pbDisplay(_INTL("{1} is loafing around!", this.pbThis())); break;
      case 3: await this.battle.pbDisplay(_INTL("{1} pretended not to notice!", this.pbThis())); break;
    }
    return false;
  },

  /**
   * pbHyperModeObedience (014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb:224).
   * NOTE: Ruby uses Kernel#rand here, not @battle.pbRandom.
   */
  pbHyperModeObedience(this: Battler, move: Move | null): boolean {
    if (!this.inHyperMode()) return true;
    if (!move || move.type === "SHADOW") return true;
    return rand(100) < 20;
  },

  //=============================================================================
  // Check whether the user (self) is able to take action at all.
  // If this returns true, and if PP isn't a problem, the move will be considered
  // to have been used (even if it then fails for whatever reason).
  //=============================================================================
  async pbTryUseMove(this: Battler, choice: BattleChoice, move: Move, specialUsage: boolean,
    skipAccuracyCheck: boolean): Promise<boolean> {
    const core = async (): Promise<boolean> => {
      // Check whether it's possible for self to use the given move
      // NOTE: Encore has already changed the move being used, no need to have a
      //       check for it here.
      if (!(await this.pbCanChooseMoveAsync(move, false, true, specialUsage))) {
        this.lastMoveFailed = true;
        return false;
      }
      // Check whether it's possible for self to do anything at all
      if (this.effects[PBEffects.SkyDrop] >= 0) { // Intentionally no message here
        PBDebug.log(`[Move failed] ${this.pbThis()} can't use ${move.name} because of being Sky Dropped`);
        return false;
      }
      if (this.effects[PBEffects.HyperBeam] > 0) { // Intentionally before Truant
        await this.battle.pbDisplay(_INTL("{1} must recharge!", this.pbThis()));
        return false;
      }
      if (choice[1] === -2) { // Battle Palace
        await this.battle.pbDisplay(_INTL("{1} appears incapable of using its power!", this.pbThis()));
        return false;
      }
      // Skip checking all applied effects that could make self fail doing something
      if (skipAccuracyCheck) return true;
      // Check status problems and continue their effects/cure them
      switch (this.status) {
        case "SLEEP":
          this.statusCount -= 1;
          if (this.statusCount <= 0) {
            await this.pbCureStatus();
          } else {
            await this.pbContinueStatus();
            if (!move.usableWhenAsleep()) { // Snore/Sleep Talk
              this.lastMoveFailed = true;
              return false;
            }
          }
          break;
        case "FROZEN":
          if (!move.thawsUser()) {
            if (this.battle.pbRandom(100) < 20) {
              await this.pbCureStatus();
            } else {
              await this.pbContinueStatus();
              this.lastMoveFailed = true;
              return false;
            }
          }
          break;
      }
      // Obedience check
      if (!(await this.pbObedienceCheck(choice))) return false;
      // Truant
      if (this.hasActiveAbility("TRUANT")) {
        this.effects[PBEffects.Truant] = !this.effects[PBEffects.Truant];
        if (!this.effects[PBEffects.Truant]) { // True means loafing, but was just inverted
          await this.battle.pbShowAbilitySplash(this);
          await this.battle.pbDisplay(_INTL("{1} is loafing around!", this.pbThis()));
          this.lastMoveFailed = true;
          await this.battle.pbHideAbilitySplash(this);
          return false;
        }
      }
      // Flinching
      if (this.effects[PBEffects.Flinch]) {
        await this.battle.pbDisplay(_INTL("{1} flinched and couldn't move!", this.pbThis()));
        if (this.abilityActive()) {
          await AbilityEffects.triggerOnFlinch(this.ability, this, this.battle);
        }
        this.lastMoveFailed = true;
        return false;
      }
      // Confusion
      if (this.effects[PBEffects.Confusion] > 0) {
        this.effects[PBEffects.Confusion] -= 1;
        if (this.effects[PBEffects.Confusion] <= 0) {
          this.pbCureConfusion();
          await this.battle.pbDisplay(_INTL("{1} snapped out of its confusion.", this.pbThis()));
        } else {
          await this.battle.pbCommonAnimation("Confusion", this);
          await this.battle.pbDisplay(_INTL("{1} is confused!", this.pbThis()));
          const threshold = Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 ? 33 : 50; // % chance
          if (this.battle.pbRandom(100) < threshold) {
            await this.pbConfusionDamage(_INTL("It hurt itself in its confusion!"));
            this.lastMoveFailed = true;
            return false;
          }
        }
      }
      // Paralysis
      if (this.status === "PARALYSIS" && this.battle.pbRandom(100) < 25) {
        await this.pbContinueStatus();
        this.lastMoveFailed = true;
        return false;
      }
      // Infatuation
      if (this.effects[PBEffects.Attract] >= 0) {
        await this.battle.pbCommonAnimation("Attract", this);
        await this.battle.pbDisplay(_INTL("{1} is in love with {2}!", this.pbThis(),
          this.battle.battlers[this.effects[PBEffects.Attract]]!.pbThis(true)));
        if (this.battle.pbRandom(100) < 50) {
          await this.battle.pbDisplay(_INTL("{1} is immobilized by love!", this.pbThis()));
          this.lastMoveFailed = true;
          return false;
        }
      }
      return true;
    };
    // Generation 9 Pack: prevents the use of moves due to being Drowsy.
    const gen9 = async (): Promise<boolean> => {
      const ret = await core();
      if (!ret) return false;
      if (this.status === "DROWSY") {
        this.statusCount -= 1;
        if (this.statusCount <= 0) {
          await this.pbCureStatus();
        } else {
          if (!move.electrocuteUser()) {
            const chance = this.effectiveWeather() === "Hail" ? 66 : 33;
            if (this.battle.pbRandom(100) < chance) {
              await this.pbContinueStatus();
              this.lastMoveFailed = true;
              return false;
            }
          }
        }
      }
      return true;
    };
    // Essentials Deluxe: mid-battle triggers for when a move is used.
    const ret = await gen9();
    if (ret) {
      const type = move.type ?? "";
      const triggers = ["move", "move" + type, "move" + move.id, "move" + this.species];
      if (move.damagingMove()) {
        triggers.push("moveDamaging", "moveDamaging" + type, "moveDamaging" + this.species);
        if (move.physicalMove()) triggers.push("movePhysical", "movePhysical" + type, "movePhysical" + this.species);
        if (move.specialMove()) triggers.push("moveSpecial", "moveSpecial" + type, "moveSpecial" + this.species);
      } else {
        triggers.push("moveStatus", "moveStatus" + type, "moveStatus" + this.species);
      }
      await this.battle.scene.pbDeluxeTriggers?.(this, choice[3], triggers);
    }
    // ZUD Mechanics: registers whether the Z-Move was used.
    if (move.zMove()) this.lastMoveUsedIsZMove = ret;
    return ret;
  },

  //=============================================================================
  // Initial success check against the target. Done once before the first hit.
  // Includes move-specific failure conditions, protections and type immunities.
  //=============================================================================
  async pbSuccessCheckAgainstTarget(this: Battler, move: Move, user: Battler, target: Battler,
    targets: Battler[]): Promise<boolean> {
    const core = async (): Promise<boolean> => {
      const showMessage = move.pbShowFailMessages(targets);
      const typeMod = move.pbCalcTypeMod(move.calcType, user, target);
      target.damageState.typeMod = typeMod;
      // Two-turn attacks can't fail here in the charging turn
      if (user.effects[PBEffects.TwoTurnAttack]) return true;
      // Move-specific failures
      if (await move.pbFailsAgainstTarget(user, target, showMessage)) return false;
      // Immunity to priority moves because of Psychic Terrain
      if (this.battle.field.terrain === "Psychic" && target.affectedByTerrain() && target.opposes(user) &&
          choicePriority(this, user.index) > 0) { // Move priority saved from pbCalculatePriority
        if (showMessage) await this.battle.pbDisplay(_INTL("{1} surrounds itself with psychic terrain!", target.pbThis()));
        return false;
      }
      // Crafty Shield
      if (target.pbOwnSide().effects[PBEffects.CraftyShield] && user.index !== target.index &&
          move.statusMove() && !move.pbTarget(user).targetsAll) {
        if (showMessage) {
          await this.battle.pbCommonAnimation("CraftyShield", target);
          await this.battle.pbDisplay(_INTL("Crafty Shield protected {1}!", target.pbThis(true)));
        }
        target.damageState.protected = true;
        setSuccessStateProtected(this, user.index);
        return false;
      }
      if (!(user.hasActiveAbility("UNSEENFIST") && move.contactMove())) {
        // Wide Guard
        if (target.pbOwnSide().effects[PBEffects.WideGuard] && user.index !== target.index &&
            move.pbTarget(user).numTargets > 1 &&
            (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 || move.damagingMove())) {
          if (showMessage) {
            await this.battle.pbCommonAnimation("WideGuard", target);
            await this.battle.pbDisplay(_INTL("Wide Guard protected {1}!", target.pbThis(true)));
          }
          target.damageState.protected = true;
          setSuccessStateProtected(this, user.index);
          return false;
        }
        if (move.canProtectAgainst()) {
          // Quick Guard
          if (target.pbOwnSide().effects[PBEffects.QuickGuard] &&
              choicePriority(this, user.index) > 0) { // Move priority saved from pbCalculatePriority
            if (showMessage) {
              await this.battle.pbCommonAnimation("QuickGuard", target);
              await this.battle.pbDisplay(_INTL("Quick Guard protected {1}!", target.pbThis(true)));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            return false;
          }
          // Protect
          if (target.effects[PBEffects.Protect]) {
            if (showMessage) {
              await this.battle.pbCommonAnimation("Protect", target);
              await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            return false;
          }
          // King's Shield
          if (target.effects[PBEffects.KingsShield] && move.damagingMove()) {
            if (showMessage) {
              await this.battle.pbCommonAnimation("KingsShield", target);
              await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            if (move.pbContactMove(user) && user.affectedByContactEffect() &&
                await user.pbCanLowerStatStage("ATTACK", target)) {
              await user.pbLowerStatStage("ATTACK", Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8 ? 1 : 2, target);
            }
            return false;
          }
          // Spiky Shield
          if (target.effects[PBEffects.SpikyShield]) {
            if (showMessage) {
              await this.battle.pbCommonAnimation("SpikyShield", target);
              await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            if (move.pbContactMove(user) && user.affectedByContactEffect()) {
              await this.battle.scene.pbDamageAnimation(user);
              await user.pbReduceHP(Math.floor(user.totalhp / 8), false);
              await this.battle.pbDisplay(_INTL("{1} was hurt!", user.pbThis()));
              await user.pbItemHPHealCheck();
            }
            return false;
          }
          // Baneful Bunker
          if (target.effects[PBEffects.BanefulBunker]) {
            if (showMessage) {
              await this.battle.pbCommonAnimation("BanefulBunker", target);
              await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            if (move.pbContactMove(user) && user.affectedByContactEffect() &&
                user.pbCanPoison(target, false)) {
              await user.pbPoison(target);
            }
            return false;
          }
          // Obstruct
          if (target.effects[PBEffects.Obstruct] && move.damagingMove()) {
            if (showMessage) {
              await this.battle.pbCommonAnimation("Obstruct", target);
              await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            if (move.pbContactMove(user) && user.affectedByContactEffect() &&
                await user.pbCanLowerStatStage("DEFENSE", target)) {
              await user.pbLowerStatStage("DEFENSE", 2, target);
            }
            return false;
          }
          // Mat Block
          if (target.pbOwnSide().effects[PBEffects.MatBlock] && move.damagingMove()) {
            // NOTE: Confirmed no common animation for this effect.
            if (showMessage) await this.battle.pbDisplay(_INTL("{1} was blocked by the kicked-up mat!", move.name));
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            return false;
          }
        }
      }
      // Magic Coat/Magic Bounce
      if (move.statusMove() && move.canMagicCoat() && !target.semiInvulnerable() && target.opposes(user)) {
        if (target.effects[PBEffects.MagicCoat]) {
          target.damageState.magicCoat = true;
          target.effects[PBEffects.MagicCoat] = false;
          return false;
        }
        if (target.hasActiveAbility("MAGICBOUNCE") && !this.battle.moldBreaker &&
            !target.effects[PBEffects.MagicBounce]) {
          target.damageState.magicBounce = true;
          target.effects[PBEffects.MagicBounce] = true;
          return false;
        }
      }
      // Immunity because of ability (intentionally before type immunity check)
      if (await move.pbImmunityByAbility(user, target, showMessage)) return false;
      // Type immunity
      if (move.pbDamagingMove() && Effectiveness.ineffective(typeMod)) {
        PBDebug.log(`[Target immune] ${target.pbThis()}'s type immunity`);
        if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
        return false;
      }
      // Dark-type immunity to moves made faster by Prankster
      if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 && user.effects[PBEffects.Prankster] &&
          target.pbHasType("DARK") && target.opposes(user)) {
        PBDebug.log(`[Target immune] ${target.pbThis()} is Dark-type and immune to Prankster-boosted moves`);
        if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
        return false;
      }
      // Airborne-based immunity to Ground moves
      if (move.damagingMove() && move.calcType === "GROUND" &&
          target.airborne() && !move.hitsFlyingTargets()) {
        if (target.hasActiveAbility("LEVITATE") && !this.battle.moldBreaker) {
          if (showMessage) {
            await this.battle.pbShowAbilitySplash(target);
            if (Scene.USE_ABILITY_SPLASH) {
              await this.battle.pbDisplay(_INTL("{1} avoided the attack!", target.pbThis()));
            } else {
              await this.battle.pbDisplay(_INTL("{1} avoided the attack with {2}!", target.pbThis(), target.abilityName()));
            }
            await this.battle.pbHideAbilitySplash(target);
          }
          return false;
        }
        if (target.hasActiveItem("AIRBALLOON")) {
          if (showMessage) await this.battle.pbDisplay(_INTL("{1}'s {2} makes Ground moves miss!", target.pbThis(), target.itemName()));
          return false;
        }
        if (target.effects[PBEffects.MagnetRise] > 0) {
          if (showMessage) await this.battle.pbDisplay(_INTL("{1} makes Ground moves miss with Magnet Rise!", target.pbThis()));
          return false;
        }
        if (target.effects[PBEffects.Telekinesis] > 0) {
          if (showMessage) await this.battle.pbDisplay(_INTL("{1} makes Ground moves miss with Telekinesis!", target.pbThis()));
          return false;
        }
      }
      // Immunity to powder-based moves
      if (move.powderMove()) {
        if (target.pbHasType("GRASS") && Settings.MORE_TYPE_EFFECTS) {
          PBDebug.log(`[Target immune] ${target.pbThis()} is Grass-type and immune to powder-based moves`);
          if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
          return false;
        }
        if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
          if (target.hasActiveAbility("OVERCOAT") && !this.battle.moldBreaker) {
            if (showMessage) {
              await this.battle.pbShowAbilitySplash(target);
              if (Scene.USE_ABILITY_SPLASH) {
                await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
              } else {
                await this.battle.pbDisplay(_INTL("It doesn't affect {1} because of its {2}.", target.pbThis(true), target.abilityName()));
              }
              await this.battle.pbHideAbilitySplash(target);
            }
            return false;
          }
          if (target.hasActiveItem("SAFETYGOGGLES")) {
            PBDebug.log(`[Item triggered] ${target.pbThis()} has Safety Goggles and is immune to powder-based moves`);
            if (showMessage) await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", target.pbThis(true)));
            return false;
          }
        }
      }
      // Substitute
      if (target.effects[PBEffects.Substitute] > 0 && move.statusMove() &&
          !move.ignoresSubstitute(user) && user.index !== target.index) {
        PBDebug.log(`[Target immune] ${target.pbThis()} is protected by its Substitute`);
        if (showMessage) await this.battle.pbDisplay(_INTL("{1} avoided the attack!", target.pbThis(true)));
        return false;
      }
      return true;
    };
    // Generation 9 Pack: Silk Trap; rechecks for effects that ignore abilities
    // before running the success check.
    const gen9 = async (): Promise<boolean> => {
      this.battle.moldBreaker = user.hasMoldBreaker() || (move.statusMove() && user.hasActiveAbility("MYCELIUMMIGHT"));
      if (target.hasActiveItem("ABILITYSHIELD")) this.battle.moldBreaker = false;
      if (!(user.hasActiveAbility("UNSEENFIST") && move.contactMove())) {
        if (move.canProtectAgainst()) {
          if (target.effects[PBEffects.SilkTrap] && move.damagingMove()) {
            if (move.pbShowFailMessages(targets)) {
              await this.battle.pbCommonAnimation("SilkTrap", target);
              await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
            }
            target.damageState.protected = true;
            setSuccessStateProtected(this, user.index);
            if (move.pbContactMove(user) && user.affectedByContactEffect() &&
                await user.pbCanLowerStatStage("SPEED", target)) {
              await user.pbLowerStatStage("SPEED", 1, target);
            }
            return false;
          }
        }
      }
      return core();
    };
    // Essentials Deluxe: mid-battle triggers for when a used move fails.
    const deluxe = async (): Promise<boolean> => {
      const ret = await gen9();
      if (!ret) {
        const userTriggers = ["attackerNegated", "attackerNegated" + move.id, "attackerNegated" + (move.type ?? ""), "attackerNegated" + user.species];
        const targTriggers = ["defenderNegated", "defenderNegated" + move.id, "defenderNegated" + (move.type ?? ""), "defenderNegated" + target.species];
        if (userTriggers.length > 0) await this.battle.scene.pbDeluxeTriggers?.(user.index, target.index, userTriggers);
        if (targTriggers.length > 0) await this.battle.scene.pbDeluxeTriggers?.(target.index, user.index, targTriggers);
      }
      return ret;
    };
    // ZUD Mechanics: prevents Dynamax targets from being affected by various
    // moves. Also checks for moves that may bypass Max Guard.
    if (target.effects[PBEffects.Dynamax] > 0) {
      const functions = [
        "OHKO",                                    // Horn Drill, Guillotine, etc.
        "OHKOIce",                                 // Sheer Cold
        "OHKOHitsUndergroundTarget",               // Fissure
        "SetTargetAbilityToUserAbility",           // Entrainment
        "UserTargetSwapAbilities",                 // Skill Swap
        "PowerHigherWithTargetWeight",             // Low Kick, Grass Knot, etc.
        "PowerHigherWithUserHeavierThanTarget",    // Heat Crash, Heavy Slam, etc.
        "DisableTargetUsingSameMoveConsecutively", // Torment
        "DisableTargetLastMoveUsed",               // Disable
        "DisableTargetUsingDifferentMove",         // Encore
        "AttackerFaintsIfUserFaints",              // Destiny Bond
        "SwitchOutTargetStatusMove",               // Roar, Whirlwind, etc.
        "TargetUsesItsLastUsedMoveAgain",          // Instruct
      ];
      if (functions.includes(move.function)) {
        await this.battle.pbDisplay(_INTL("But it failed!"));
        return false;
      }
    }
    // Deferred: return false if !raid_SuccessCheck(move, user, target)
    // (ZUD Mechanics/[004] Battle_Battler/Battler_Overrides.rb:310, [009] Max Raid/Raid_Battle_Battler.rb:28;
    // it returns true outside Max Raid battles).
    if (target.effects[PBEffects.MaxGuard] && !user.effects[PBEffects.TwoTurnAttack]) {
      const bypass = ["MEANLOOK", "ROLEPLAY", "PERISHSONG", "DECORATE", "FEINT"];
      if (!bypass.includes(move.id) && move.function !== "ZUDBypassProtect") {
        await this.battle.pbCommonAnimation("Protect", target);
        await this.battle.pbDisplay(_INTL("{1} protected itself!", target.pbThis()));
        target.damageState.protected = true;
        setSuccessStateProtected(this, user.index);
        // Deferred: raid_ShieldBreak(move, target)
        // (ZUD Mechanics/[004] Battle_Battler/Battler_Overrides.rb:318, [009] Max Raid/Raid_Battle_Battler.rb:105)
        return false;
      }
    }
    return deluxe();
  },

  //=============================================================================
  // Per-hit success check against the target.
  // Includes semi-invulnerable move use and accuracy calculation.
  //=============================================================================
  async pbSuccessCheckPerHit(this: Battler, move: Move, user: Battler, target: Battler,
    skipAccuracyCheck: boolean): Promise<boolean> {
    // Two-turn attacks can't fail here in the charging turn
    if (user.effects[PBEffects.TwoTurnAttack]) return true;
    // Lock-On
    if (user.effects[PBEffects.LockOn] > 0 &&
        user.effects[PBEffects.LockOnPos] === target.index) return true;
    // Toxic
    if (await move.pbOverrideSuccessCheckPerHit(user, target)) return true;
    let miss = false;
    let hitsInvul = false;
    // No Guard
    if (user.hasActiveAbility("NOGUARD") ||
        target.hasActiveAbility("NOGUARD")) hitsInvul = true;
    // Future Sight
    if (this.battle.futureSight) hitsInvul = true;
    // Helping Hand
    if (move.function === "PowerUpAllyMove") hitsInvul = true;
    if (!hitsInvul) {
      // Semi-invulnerable moves
      if (target.effects[PBEffects.TwoTurnAttack]) {
        if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
          "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
          "TwoTurnAttackInvulnerableInSkyTargetCannotAct")) {
          if (!move.hitsFlyingTargets()) miss = true;
        } else if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground")) {
          if (!move.hitsDiggingTargets()) miss = true;
        } else if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderwater")) {
          if (!move.hitsDivingTargets()) miss = true;
        } else if (target.inTwoTurnAttack("TwoTurnAttackInvulnerableRemoveProtections")) {
          miss = true;
        }
      }
      if (target.effects[PBEffects.SkyDrop] >= 0 &&
          target.effects[PBEffects.SkyDrop] !== user.index && !move.hitsFlyingTargets()) {
        miss = true;
      }
    }
    if (miss) target.damageState.invulnerable = true;
    if (!miss) {
      // Called by another move
      if (skipAccuracyCheck) return true;
      // Accuracy check
      if (await move.pbAccuracyCheck(user, target)) return true; // Includes Counter/Mirror Coat
    }
    // Missed
    PBDebug.log("[Move failed] Failed pbAccuracyCheck or target is semi-invulnerable");
    return false;
  },

  //=============================================================================
  // Message shown when a move fails the per-hit success check above.
  //=============================================================================
  async pbMissMessage(this: Battler, move: Move, user: Battler, target: Battler): Promise<void> {
    if (target.damageState.affectionMissed) {
      await this.battle.pbDisplay(_INTL("{1} avoided the move in time with your shout!", target.pbThis()));
    } else if (move.pbTarget(user).numTargets > 1 || target.effects[PBEffects.TwoTurnAttack]) {
      await this.battle.pbDisplay(_INTL("{1} avoided the attack!", target.pbThis()));
    } else if (!(await move.pbMissMessage(user, target))) {
      await this.battle.pbDisplay(_INTL("{1}'s attack missed!", user.pbThis()));
    }
    // Essentials Deluxe: mid-battle triggers for when a used move misses.
    const userTriggers = ["attackerDodged", "attackerDodged" + move.id, "attackerDodged" + (move.type ?? ""), "attackerDodged" + user.species];
    const targTriggers = ["defenderDodged", "defenderDodged" + move.id, "defenderDodged" + (move.type ?? ""), "defenderDodged" + target.species];
    if (userTriggers.length > 0) await this.battle.scene.pbDeluxeTriggers?.(user.index, target.index, userTriggers);
    if (targTriggers.length > 0) await this.battle.scene.pbDeluxeTriggers?.(target.index, user.index, targTriggers);
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
