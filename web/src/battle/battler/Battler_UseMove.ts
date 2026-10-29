// Port of Data/Scripts/011_Battle/002_Battler/007_Battler_UseMove.rb, with:
// - ZUD Mechanics ([004] Battle_Battler/Battler_Overrides.rb:91): pbUseMove
//   (Power Move registration), :104 pbEndTurn (Z-Move usage), :122
//   pbUseMoveSimple (redefined: Z-Powered called moves);
//   [009] Max Raid/Raid_Battle_Overrides.rb:17 pbProcessTurn (raid_UseBaseMoves, in zud/raid/).
// Alias chains: pbProcessTurn = ZUD Max Raid( core ); pbUseMove = ZUD( core );
// pbEndTurn = ZUD( core ); pbUseMoveSimple = ZUD's redefinition.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Type } from "../../data/gameData/type";
import { pbSEPlay } from "../../game/GameSystem";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { BattleChoice } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import { Move, MoveClasses } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Battler } from "./Battler";
import { raidUseBaseMoves } from "../zud/raid/Raid_Battle_Battler";

/**
 * Battle::SuccessState (007_Other battle types/004_BattleArenaBattle.rb:4).
 * Battle#successStates is typed unknown[] in Battle.ts; this is the part of it
 * that move usage reads and writes.
 */
interface SuccessState {
  useState: number;
  typeMod: number;
  protected: boolean;
  updateSkill(): void;
}

const successState = (battler: Battler, idx: number): SuccessState =>
  battler.battle.successStates[idx] as SuccessState;

const methods = {
  //=============================================================================
  // Turn processing
  //=============================================================================
  async pbProcessTurn(this: Battler, choice: BattleChoice, tryFlee = true): Promise<boolean> {
    const core = async (): Promise<boolean> => {
      if (this.fainted()) return false;
      // Wild roaming Pokémon always flee if possible
      if (tryFlee && this.wild() &&
          this.battle.rules["alwaysflee"] && this.battle.pbCanRun(this.index)) {
        this.pbBeginTurn(choice);
        pbSEPlay("Battle flee");
        await this.battle.pbDisplay(_INTL("{1} fled from battle!", this.pbThis()));
        this.battle.decision = 3;
        await this.pbEndTurn(choice);
        return true;
      }
      // Shift with the battler next to this one
      if (choice[0] === "Shift") {
        let idxOther = -1;
        switch (this.battle.pbSideSize(this.index)) {
          case 2:
            idxOther = (this.index + 2) % 4;
            break;
          case 3:
            if (this.index !== 2 && this.index !== 3) { // If not in middle spot already
              idxOther = this.index % 2 === 0 ? 2 : 3;
            }
            break;
        }
        if (idxOther >= 0) {
          this.battle.pbSwapBattlers(this.index, idxOther);
          switch (this.battle.pbSideSize(this.index)) {
            case 2:
              await this.battle.pbDisplay(_INTL("{1} moved across!", this.pbThis()));
              break;
            case 3:
              await this.battle.pbDisplay(_INTL("{1} moved to the center!", this.pbThis()));
              break;
          }
        }
        this.pbBeginTurn(choice);
        await this.pbCancelMoves();
        this.lastRoundMoved = this.battle.turnCount; // Done something this round
        return true;
      }
      // If this battler's action for this round wasn't "use a move"
      if (choice[0] !== "UseMove") {
        // Clean up effects that end at battler's turn
        this.pbBeginTurn(choice);
        await this.pbEndTurn(choice);
        return false;
      }
      // Use the move
      PBDebug.log(`[Move usage] ${this.pbThis()} started using ${(choice[2] as Move).name}`);
      await PBDebug.logonerr(() => this.pbUseMove(choice, choice[2] === this.battle.struggle));
      await this.battle.pbJudge();
      // Update priority order
      if (Settings.RECALCULATE_TURN_ORDER_AFTER_SPEED_CHANGES) await this.battle.pbCalculatePriority();
      return true;
    };
    const ret = await core();
    // ZUD Mechanics (Max Raid): lets Max Raid Pokémon strike multiple times per turn.
    if (ret && this.battle.decision === 0) await raidUseBaseMoves(this, choice); // Raid_Battle_Battler.rb:80
    return ret;
  },

  //=============================================================================
  //
  //=============================================================================
  pbBeginTurn(this: Battler, _choice: BattleChoice): void {
    // Cancel some lingering effects which only apply until the user next moves
    this.effects[PBEffects.DestinyBondPrevious] = this.effects[PBEffects.DestinyBond];
    this.effects[PBEffects.DestinyBond] = false;
    this.effects[PBEffects.Grudge] = false;
    this.effects[PBEffects.MoveNext] = false;
    this.effects[PBEffects.Quash] = 0;
    // Encore's effect ends if the encored move is no longer available
    if (this.effects[PBEffects.Encore] > 0 && this.pbEncoredMoveIndex() < 0) {
      this.effects[PBEffects.Encore] = 0;
      this.effects[PBEffects.EncoreMove] = null;
    }
  },

  /**
   * Called when the usage of various multi-turn moves is disrupted due to
   * failing pbTryUseMove, being ineffective against all targets, or because
   * Pursuit was used specially to intercept a switching foe.
   * Cancels the use of multi-turn moves and counters thereof. Note that Hyper
   * Beam's effect is NOT cancelled.
   */
  async pbCancelMoves(this: Battler, fullCancel = false): Promise<void> {
    // Outragers get confused anyway if they are disrupted during their final
    // turn of using the move
    if (this.effects[PBEffects.Outrage] === 1 && this.pbCanConfuseSelf(false) && !fullCancel) {
      await this.pbConfuse(_INTL("{1} became confused due to fatigue!", this.pbThis()));
    }
    // Cancel usage of most multi-turn moves
    this.effects[PBEffects.TwoTurnAttack] = null;
    this.effects[PBEffects.Rollout] = 0;
    this.effects[PBEffects.Outrage] = 0;
    this.effects[PBEffects.Uproar] = 0;
    this.effects[PBEffects.Bide] = 0;
    this.currentMove = null;
    // Reset counters for moves which increase them when used in succession
    this.effects[PBEffects.FuryCutter] = 0;
  },

  async pbEndTurn(this: Battler, _choice: BattleChoice): Promise<void> {
    // ZUD Mechanics: registers (or unregisters) the Z-Move once its turn is over.
    if (_choice[0] === "UseMove" && (_choice[2] as Move).zMove()) {
      if (this.lastMoveUsedIsZMove) {
        this.battle.pbSetBattleMechanicUsage(this.index, "Z-Move");
      } else {
        this.battle.pbUnregisterZMove(this.index);
      }
      this.powerTrigger = false;
    }
    this.lastRoundMoved = this.battle.turnCount; // Done something this round
    if (!this.effects[PBEffects.ChoiceBand] &&
        (this.hasActiveItem(["CHOICEBAND", "CHOICESPECS", "CHOICESCARF"]) ||
        this.hasActiveAbility("GORILLATACTICS"))) {
      if (this.lastMoveUsed && this.pbHasMove(this.lastMoveUsed)) {
        this.effects[PBEffects.ChoiceBand] = this.lastMoveUsed;
      } else if (this.lastRegularMoveUsed && this.pbHasMove(this.lastRegularMoveUsed)) {
        this.effects[PBEffects.ChoiceBand] = this.lastRegularMoveUsed;
      }
    }
    this.effects[PBEffects.BeakBlast] = false;
    if (this.effects[PBEffects.Charge] === 1) this.effects[PBEffects.Charge] = 0;
    this.effects[PBEffects.GemConsumed] = null;
    this.effects[PBEffects.ShellTrap] = false;
    for (const b of this.battle.allBattlers()) await b.pbContinualAbilityChecks(); // Trace, end primordial weathers
  },

  async pbConfusionDamage(this: Battler, msg: string): Promise<void> {
    this.damageState.reset();
    const confusionMove = new (MoveClasses.get("Confusion")!)(this.battle, null);
    confusionMove.calcType = confusionMove.pbCalcType(this); // nil
    this.damageState.typeMod = confusionMove.pbCalcTypeMod(confusionMove.calcType, this, this); // 8
    confusionMove.pbCheckDamageAbsorption(this, this);
    await confusionMove.pbCalcDamage(this, this);
    confusionMove.pbReduceDamage(this, this);
    this.hp -= this.damageState.hpLost;
    await confusionMove.pbAnimateHitAndHPLost(this, [this]);
    await this.battle.pbDisplay(msg); // "It hurt itself in its confusion!"
    confusionMove.pbRecordDamageLost(this, this);
    await confusionMove.pbEndureKOMessage(this);
    if (this.fainted()) await this.pbFaint();
    await this.pbItemHPHealCheck();
  },

  //=============================================================================
  // Simple "use move" method, used when a move calls another move and for Future
  // Sight's attack
  //=============================================================================
  /**
   * ZUD Mechanics (Battler_Overrides.rb:122) redefines this to allow the
   * Z-Powered version of moves selected via other moves, such as Sleep Talk.
   */
  async pbUseMoveSimple(this: Battler, moveID: Id, target = -1, idxMove = -1, specialUsage = true): Promise<void> {
    const choice = [] as unknown as BattleChoice;
    choice[0] = "UseMove"; // "Use move"
    choice[1] = idxMove; // Index of move to be used in user's moveset
    if (idxMove >= 0) {
      choice[2] = this.moves[idxMove];
    } else {
      choice[2] = Move.fromPokemonMove(this.battle, new PokemonMove(moveID));
      (choice[2] as Move).pp = -1;
    }
    choice[3] = target; // Target (-1 means no target yet)
    PBDebug.log(`[Move usage] ${this.pbThis()} started using the called/simple move ${(choice[2] as Move).name}`);
    // ZUD Mechanics
    const side = this.battle.opposes(this.index) ? 1 : 0;
    const owner = this.battle.pbGetOwnerIndexFromBattlerIndex(this.index);
    if (this.battle.zMove[side]![owner] === this.index) {
      const zMove = this.convertZmove(choice[2] as Move, null, this.effects[PBEffects.TransformSpecies] as Id | null);
      zMove.specialUseZMove = true;
      choice[2] = zMove;
      await this.pbUseMove(choice, specialUsage);
    } else {
      await this.pbUseMove(choice, specialUsage);
    }
  },

  //=============================================================================
  // Master "use move" method
  //=============================================================================
  async pbUseMove(this: Battler, choice: BattleChoice, specialUsage = false): Promise<void> {
    // ZUD Mechanics: registers a selected Power Move and converts it.
    this.lastMoveUsedIsZMove = false;
    if ((choice[2] as Move).powerMove()) {
      if (this.powerIndex === -1) this.powerIndex = choice[1];
      choice[2] = this.calcPowerMove(choice[2] as Move);
      if (this.selectedMoveIsZMove) {
        (choice[2] as Move).specialUseZMove = specialUsage;
      }
    }
    // NOTE: This is intentionally determined before a multi-turn attack can
    //       set specialUsage to true.
    const skipAccuracyCheck = (specialUsage && choice[2] !== this.battle.struggle);
    // Start using the move
    this.pbBeginTurn(choice);
    // Force the use of certain moves if they're already being used
    if (this.usingMultiTurnAttack()) {
      choice[2] = Move.fromPokemonMove(this.battle, new PokemonMove(this.currentMove!));
      specialUsage = true;
    } else if (this.effects[PBEffects.Encore] > 0 && choice[1] >= 0 &&
               this.battle.pbCanShowCommands(this.index)) {
      const idxEncoredMove = this.pbEncoredMoveIndex();
      if (idxEncoredMove >= 0 && choice[1] !== idxEncoredMove &&
          this.battle.pbCanChooseMove(this.index, idxEncoredMove, false)) { // Change move if battler was Encored mid-round
        choice[1] = idxEncoredMove;
        choice[2] = this.moves[idxEncoredMove];
        choice[3] = -1; // No target chosen
      }
    }
    // Labels the move being used as "move"
    let move = choice[2] as Move | null | undefined;
    if (!move) return; // if move was not chosen somehow
    // Try to use the move (inc. disobedience)
    this.lastMoveFailed = false;
    if (!(await this.pbTryUseMove(choice, move, specialUsage, skipAccuracyCheck))) {
      this.lastMoveUsed = null;
      this.lastMoveUsedType = null;
      if (!specialUsage) {
        this.lastRegularMoveUsed = null;
        this.lastRegularMoveTarget = -1;
      }
      await this.battle.pbGainExp(); // In case self is KO'd due to confusion
      await this.pbCancelMoves();
      await this.pbEndTurn(choice);
      return;
    }
    move = choice[2] as Move | null | undefined; // In case disobedience changed the move to be used
    if (!move) return; // if move was not chosen somehow
    // Subtract PP
    if (!specialUsage && !this.pbReducePP(move)) {
      await this.battle.pbDisplay(_INTL("{1} used {2}!", this.pbThis(), move.name));
      await this.battle.pbDisplay(_INTL("But there was no PP left for the move!"));
      this.lastMoveUsed = null;
      this.lastMoveUsedType = null;
      this.lastRegularMoveUsed = null;
      this.lastRegularMoveTarget = -1;
      this.lastMoveFailed = true;
      await this.pbCancelMoves();
      await this.pbEndTurn(choice);
      return;
    }
    // Stance Change
    if (this.isSpecies("AEGISLASH") && this.abilityId === "STANCECHANGE") {
      if (move.damagingMove()) {
        await this.pbChangeForm(1, _INTL("{1} changed to Blade Forme!", this.pbThis()));
      } else if (move.id === "KINGSSHIELD") {
        await this.pbChangeForm(0, _INTL("{1} changed to Shield Forme!", this.pbThis()));
      }
    }
    // Calculate the move's type during this usage
    move.calcType = move.pbCalcType(this);
    // Start effect of Mold Breaker
    this.battle.moldBreaker = this.hasMoldBreaker();
    // Remember that user chose a two-turn move
    if (move.pbIsChargingTurn(this)) {
      // Beginning the use of a two-turn attack
      this.effects[PBEffects.TwoTurnAttack] = move.id;
      this.currentMove = move.id;
    } else {
      this.effects[PBEffects.TwoTurnAttack] = null; // Cancel use of two-turn attack
    }
    // Add to counters for moves which increase them when used in succession
    move.pbChangeUsageCounters(this, specialUsage);
    // Charge up Metronome item
    if (this.hasActiveItem("METRONOME") && !move.callsAnotherMove()) {
      if (this.lastMoveUsed && this.lastMoveUsed === move.id && !this.lastMoveFailed) {
        this.effects[PBEffects.Metronome] += 1;
      } else {
        this.effects[PBEffects.Metronome] = 0;
      }
    }
    // Record move as having been used
    this.lastMoveUsed = move.id;
    this.lastMoveUsedType = move.calcType; // For Conversion 2
    if (!specialUsage) {
      this.lastRegularMoveUsed = move.id; // For Disable, Encore, Instruct, Mimic, Mirror Move, Sketch, Spite
      this.lastRegularMoveTarget = choice[3]; // For Instruct (remembering original target is fine)
      if (!this.movesUsed.includes(move.id)) this.movesUsed.push(move.id); // For Last Resort
    }
    this.battle.lastMoveUsed = move.id; // For Copycat
    this.battle.lastMoveUser = this.index; // For "self KO" battle clause to avoid draws
    successState(this, this.index).useState = 1; // Battle Arena - assume failure
    // Find the default user (self or Snatcher) and target(s)
    let user = this.pbFindUser(choice, move);
    user = this.pbChangeUser(choice, move, user);
    let targets = this.pbFindTargets(choice, move, user);
    targets = await this.pbChangeTargets(move, user, targets);
    // Pressure
    if (!specialUsage) {
      for (const b of targets) {
        if (!(b.opposes(user) && b.hasActiveAbility("PRESSURE"))) continue;
        PBDebug.log(`[Ability triggered] ${b.pbThis()}'s ${b.abilityName()}`);
        user.pbReducePP(move);
      }
      if (move.pbTarget(user).affectsFoeSide) {
        for (const b of this.battle.allOtherSideBattlers(user)) {
          if (!b.hasActiveAbility("PRESSURE")) continue;
          PBDebug.log(`[Ability triggered] ${b.pbThis()}'s ${b.abilityName()}`);
          user.pbReducePP(move);
        }
      }
    }
    // Dazzling/Queenly Majesty make the move fail here
    for (const b of this.battle.pbPriority(true)) {
      if (!b || !b.abilityActive()) continue;
      if (AbilityEffects.triggerMoveBlocking(b.ability, b, user, targets, move, this.battle)) {
        await this.battle.pbDisplayBrief(_INTL("{1} used {2}!", user.pbThis(), move.name));
        await this.battle.pbShowAbilitySplash(b);
        await this.battle.pbDisplay(_INTL("{1} cannot use {2}!", user.pbThis(), move.name));
        await this.battle.pbHideAbilitySplash(b);
        user.lastMoveFailed = true;
        await this.pbCancelMoves();
        await this.pbEndTurn(choice);
        return;
      }
    }
    // "X used Y!" message
    // Can be different for Bide, Fling, Focus Punch and Future Sight
    // NOTE: This intentionally passes self rather than user. The user is always
    //       self except if Snatched, but this message should state the original
    //       user (self) even if the move is Snatched.
    await move.pbDisplayUseMessage(this);
    // Snatch's message (user is the new user, self is the original user)
    if (move.snatched) {
      this.lastMoveFailed = true; // Intentionally applies to self, not user
      await this.battle.pbDisplay(_INTL("{1} snatched {2}'s move!", user.pbThis(), this.pbThis(true)));
    }
    // "But it failed!" checks
    if (await move.pbMoveFailed(user, targets)) {
      PBDebug.log(`[Move failed] In function code ${move.function}'s def pbMoveFailed?`);
      user.lastMoveFailed = true;
      await this.pbCancelMoves();
      await this.pbEndTurn(choice);
      return;
    }
    // Perform set-up actions and display messages
    // Messages include Magnitude's number and Pledge moves' "it's a combo!"
    await move.pbOnStartUse(user, targets);
    // Self-thawing due to the move
    if (user.status === "FROZEN" && move.thawsUser()) {
      await user.pbCureStatus(false);
      await this.battle.pbDisplay(_INTL("{1} melted the ice!", user.pbThis()));
    }
    // Powder
    if (user.effects[PBEffects.Powder] && move.calcType === "FIRE") {
      await this.battle.pbCommonAnimation("Powder", user);
      await this.battle.pbDisplay(_INTL("When the flame touched the powder on the Pokémon, it exploded!"));
      user.lastMoveFailed = true;
      if (!["Rain", "HeavyRain"].includes(user.effectiveWeather()) && user.takesIndirectDamage()) {
        await user.pbTakeEffectDamage(rubyRound(user.totalhp / 4.0), false, async (_hpLost: number) => {
          // NOTE: Ruby bug preserved: this block refers to an undefined local
          //       variable `battler` (it was meant to be user), so it raises a
          //       NameError in Essentials v20.1.
          // @battle.pbDisplay(_INTL("{1} is hurt by its {2}!", battler.pbThis, battler.itemName))
          throw new Error("undefined local variable or method `battler' for Battle::Battler");
        });
        await this.battle.pbGainExp(); // In case user is KO'd by this
      }
      await this.pbCancelMoves();
      await this.pbEndTurn(choice);
      return;
    }
    // Primordial Sea, Desolate Land
    if (move.damagingMove()) {
      switch (this.battle.pbWeather()) {
        case "HeavyRain":
          if (move.calcType === "FIRE") {
            await this.battle.pbDisplay(_INTL("The Fire-type attack fizzled out in the heavy rain!"));
            user.lastMoveFailed = true;
            await this.pbCancelMoves();
            await this.pbEndTurn(choice);
            return;
          }
          break;
        case "HarshSun":
          if (move.calcType === "WATER") {
            await this.battle.pbDisplay(_INTL("The Water-type attack evaporated in the harsh sunlight!"));
            user.lastMoveFailed = true;
            await this.pbCancelMoves();
            await this.pbEndTurn(choice);
            return;
          }
          break;
      }
    }
    // Protean
    if (user.hasActiveAbility(["LIBERO", "PROTEAN"]) &&
        !move.callsAnotherMove() && !move.snatched &&
        user.pbHasOtherType(move.calcType) && !Type.get(move.calcType!).pseudoType) {
      await this.battle.pbShowAbilitySplash(user);
      user.pbChangeTypes(move.calcType!);
      const typeName = Type.get(move.calcType!).name;
      await this.battle.pbDisplay(_INTL("{1}'s type changed to {2}!", user.pbThis(), typeName));
      await this.battle.pbHideAbilitySplash(user);
      // NOTE: The GF games say that if Curse is used by a non-Ghost-type
      //       Pokémon which becomes Ghost-type because of Protean, it should
      //       target and curse itself. I think this is silly, so I'm making it
      //       choose a random opponent to curse instead.
      if (move.function === "CurseTargetOrLowerUserSpd1RaiseUserAtkDef1" && targets.length === 0) {
        choice[3] = -1;
        targets = this.pbFindTargets(choice, move, user);
      }
    }
    //---------------------------------------------------------------------------
    let magicCoater = -1;
    let magicBouncer = -1;
    // Ruby: a local assigned in the else branch below (nil if that branch isn't
    // taken; the Dancer check only reads it when user.lastMoveFailed is false).
    let realNumHits = 0;
    if (targets.length === 0 && move.pbTarget(user).numTargets > 0 && !move.worksWithNoTargets()) {
      // def pbFindTargets should have found a target(s), but it didn't because
      // they were all fainted
      // All target types except: None, User, UserSide, FoeSide, BothSides
      await this.battle.pbDisplay(_INTL("But there was no target..."));
      user.lastMoveFailed = true;
    } else { // We have targets, or move doesn't use targets
      // Reset whole damage state, perform various success checks (not accuracy)
      for (const b of this.battle.allBattlers()) {
        b.droppedBelowHalfHP = false;
        b.statsDropped = false;
      }
      for (const b of targets) {
        b.damageState.reset();
        if (await this.pbSuccessCheckAgainstTarget(move, user, b, targets)) continue;
        b.damageState.unaffected = true;
      }
      // Magic Coat/Magic Bounce checks (for moves which don't target Pokémon)
      if (targets.length === 0 && move.statusMove() && move.canMagicCoat()) {
        for (const b of this.battle.pbPriority(true)) {
          if (b.fainted() || !b.opposes(user)) continue;
          if (b.semiInvulnerable()) continue;
          if (b.effects[PBEffects.MagicCoat]) {
            magicCoater = b.index;
            b.effects[PBEffects.MagicCoat] = false;
            break;
          } else if (b.hasActiveAbility("MAGICBOUNCE") && !this.battle.moldBreaker &&
                     !b.effects[PBEffects.MagicBounce]) {
            magicBouncer = b.index;
            b.effects[PBEffects.MagicBounce] = true;
            break;
          }
        }
      }
      // Get the number of hits
      const numHits = move.pbNumHits(user, targets);
      // Process each hit in turn
      realNumHits = 0;
      for (let i = 0; i < numHits; i++) {
        if (magicCoater >= 0 || magicBouncer >= 0) break;
        const success = await this.pbProcessMoveHit(move, user, targets, i, skipAccuracyCheck);
        if (!success) {
          if (i === 0 && targets.length > 0) {
            let hasFailed = false;
            for (const t of targets) {
              if (t.damageState.protected) continue;
              hasFailed = t.damageState.unaffected;
              if (!t.damageState.unaffected) break;
            }
            user.lastMoveFailed = hasFailed;
          }
          break;
        }
        realNumHits += 1;
        if (user.fainted()) break;
        if (["SLEEP", "FROZEN"].includes(user.status)) break;
        // NOTE: If a multi-hit move becomes disabled partway through doing those
        //       hits (e.g. by Cursed Body), the rest of the hits continue as
        //       normal.
        if (!targets.some((t) => !t.fainted())) break; // All targets are fainted
      }
      // Battle Arena only - attack is successful
      successState(this, user.index).useState = 2;
      if (targets.length > 0) {
        successState(this, user.index).typeMod = 0;
        for (const b of targets) {
          if (b.damageState.unaffected) continue;
          successState(this, user.index).typeMod += b.damageState.typeMod;
        }
      }
      // Effectiveness message for multi-hit moves
      // NOTE: No move is both multi-hit and multi-target, and the messages below
      //       aren't quite right for such a hypothetical move.
      if (numHits > 1) {
        if (move.damagingMove()) {
          for (const b of targets) {
            if (b.damageState.unaffected || b.damageState.substitute) continue;
            await move.pbEffectivenessMessage(user, b, targets.length);
          }
        }
        if (realNumHits === 1) {
          await this.battle.pbDisplay(_INTL("Hit 1 time!"));
        } else if (realNumHits > 1) {
          await this.battle.pbDisplay(_INTL("Hit {1} times!", realNumHits));
        }
      }
      // Magic Coat's bouncing back (move has targets)
      for (const b of targets) {
        if (b.fainted()) continue;
        if (!b.damageState.magicCoat && !b.damageState.magicBounce) continue;
        if (b.damageState.magicBounce) await this.battle.pbShowAbilitySplash(b);
        await this.battle.pbDisplay(_INTL("{1} bounced the {2} back!", b.pbThis(), move.name));
        if (b.damageState.magicBounce) await this.battle.pbHideAbilitySplash(b);
        const newChoice = [...choice] as BattleChoice;
        newChoice[3] = user.index;
        let newTargets = this.pbFindTargets(newChoice, move, b);
        newTargets = await this.pbChangeTargets(move, b, newTargets);
        let success = false;
        if (!(await move.pbMoveFailed(b, newTargets))) {
          // Ruby nils out the failed targets in place (each_with_index), then compact!s
          const withNils = newTargets as (Battler | null)[];
          for (let idx = 0; idx < withNils.length; idx++) {
            const newTarget = withNils[idx]!;
            if (await this.pbSuccessCheckAgainstTarget(move, b, newTarget, newTargets)) {
              success = true;
              continue;
            }
            withNils[idx] = null;
          }
          newTargets = withNils.filter((t): t is Battler => t != null);
        }
        if (success) await this.pbProcessMoveHit(move, b, newTargets, 0, false);
        if (!success) b.lastMoveFailed = true;
        for (const otherB of targets) if (otherB?.fainted()) await otherB.pbFaint();
        if (user.fainted()) await user.pbFaint();
      }
      // Magic Coat's bouncing back (move has no targets)
      if (magicCoater >= 0 || magicBouncer >= 0) {
        const mc = this.battle.battlers[magicCoater >= 0 ? magicCoater : magicBouncer]!;
        if (!mc.fainted()) {
          user.lastMoveFailed = true;
          if (magicBouncer >= 0) await this.battle.pbShowAbilitySplash(mc);
          await this.battle.pbDisplay(_INTL("{1} bounced the {2} back!", mc.pbThis(), move.name));
          if (magicBouncer >= 0) await this.battle.pbHideAbilitySplash(mc);
          let success = false;
          if (!(await move.pbMoveFailed(mc, []))) {
            success = await this.pbProcessMoveHit(move, mc, [], 0, false);
          }
          if (!success) mc.lastMoveFailed = true;
          for (const b of targets) if (b?.fainted()) await b.pbFaint();
          if (user.fainted()) await user.pbFaint();
        }
      }
      // Move-specific effects after all hits
      for (const b of targets) await move.pbEffectAfterAllHits(user, b);
      // Faint if 0 HP
      for (const b of targets) if (b?.fainted()) await b.pbFaint();
      if (user.fainted()) await user.pbFaint();
      // External/general effects after all hits. Eject Button, Shell Bell, etc.
      await this.pbEffectsAfterMove(user, targets, move, realNumHits);
      for (const b of this.battle.allBattlers()) {
        b.droppedBelowHalfHP = false;
        b.statsDropped = false;
      }
    }
    // End effect of Mold Breaker
    this.battle.moldBreaker = false;
    // Gain Exp
    await this.battle.pbGainExp();
    // Battle Arena only - update skills
    for (const b of this.battle.allBattlers()) successState(this, b.index).updateSkill();
    // Shadow Pokémon triggering Hyper Mode
    if (this.battle.choices[this.index]![0] !== "None") await this.pbHyperMode(); // Not if self is replaced
    // End of move usage
    await this.pbEndTurn(choice);
    // Instruct
    for (const b of this.battle.allBattlers()) {
      if (!b.effects[PBEffects.Instruct] || !b.lastMoveUsed) continue;
      b.effects[PBEffects.Instruct] = false;
      let idxMove = -1;
      b.eachMoveWithIndex((m, i) => { if (m.id === b.lastMoveUsed) idxMove = i; });
      if (idxMove < 0) continue;
      const oldLastRoundMoved = b.lastRoundMoved;
      await this.battle.pbDisplay(_INTL("{1} used the move instructed by {2}!", b.pbThis(), user.pbThis(true)));
      b.effects[PBEffects.Instructed] = true;
      // NOTE: Ruby checks self's @moves[idxMove] here, not b's (preserved).
      if (await b.pbCanChooseMoveAsync(this.moves[idxMove]!, false)) {
        await PBDebug.logonerr(() => b.pbUseMoveSimple(b.lastMoveUsed!, b.lastRegularMoveTarget, idxMove, false));
        b.lastRoundMoved = oldLastRoundMoved;
        await this.battle.pbJudge();
        if (this.battle.decision > 0) return;
      }
      b.effects[PBEffects.Instructed] = false;
    }
    // Dancer
    if (!this.effects[PBEffects.Dancer] && !user.lastMoveFailed && realNumHits > 0 &&
        !move.snatched && magicCoater < 0 && this.battle.pbCheckGlobalAbility("DANCER") &&
        move.danceMove()) {
      const dancers: Battler[] = [];
      for (const b of this.battle.pbPriority(true)) {
        if (b.index !== user.index && b.hasActiveAbility("DANCER")) dancers.push(b);
      }
      while (dancers.length > 0) {
        const nextUser = dancers.pop()!;
        const oldLastRoundMoved = nextUser.lastRoundMoved;
        // NOTE: Petal Dance being used because of Dancer shouldn't lock the
        //       Dancer into using that move, and shouldn't contribute to its
        //       turn counter if it's already locked into Petal Dance.
        const oldOutrage = nextUser.effects[PBEffects.Outrage];
        if (nextUser.effects[PBEffects.Outrage] > 0) nextUser.effects[PBEffects.Outrage] += 1;
        const oldCurrentMove = nextUser.currentMove;
        let preTarget = choice[3];
        if (nextUser.opposes(user) || !nextUser.opposes(preTarget)) preTarget = user.index;
        await this.battle.pbShowAbilitySplash(nextUser, true);
        await this.battle.pbHideAbilitySplash(nextUser);
        if (!Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} kept the dance going with {2}!",
            nextUser.pbThis(), nextUser.abilityName()));
        }
        nextUser.effects[PBEffects.Dancer] = true;
        if (await nextUser.pbCanChooseMoveAsync(move, false)) {
          await PBDebug.logonerr(() => nextUser.pbUseMoveSimple(move.id, preTarget));
          nextUser.lastRoundMoved = oldLastRoundMoved;
          nextUser.effects[PBEffects.Outrage] = oldOutrage;
          nextUser.currentMove = oldCurrentMove;
          await this.battle.pbJudge();
          if (this.battle.decision > 0) return;
        }
        nextUser.effects[PBEffects.Dancer] = false;
      }
    }
  },

  //=============================================================================
  // Attack a single target
  //=============================================================================
  async pbProcessMoveHit(this: Battler, move: Move, user: Battler, targets: Battler[], hitNum: number,
    skipAccuracyCheck: boolean): Promise<boolean> {
    if (user.fainted()) return false;
    // For two-turn attacks being used in a single turn
    await move.pbInitialEffect(user, targets, hitNum);
    let numTargets = 0; // Number of targets that are affected by this hit
    // Count a hit for Parental Bond (if it applies)
    if (user.effects[PBEffects.ParentalBond] > 0) user.effects[PBEffects.ParentalBond] -= 1;
    // Accuracy check (accuracy/evasion calc)
    if (hitNum === 0 || move.successCheckPerHit()) {
      for (const b of targets) {
        b.damageState.missed = false;
        if (b.damageState.unaffected) continue;
        if (await this.pbSuccessCheckPerHit(move, user, b, skipAccuracyCheck)) {
          numTargets += 1;
        } else {
          b.damageState.missed = true;
          b.damageState.unaffected = true;
        }
      }
      // If failed against all targets
      if (targets.length > 0 && numTargets === 0 && !move.worksWithNoTargets()) {
        for (const b of targets) {
          if (!b.damageState.missed || b.damageState.magicCoat) continue;
          await this.pbMissMessage(move, user, b);
          if (user.itemActive()) {
            await ItemEffects.triggerOnMissingTarget(user.item, user, b, move, hitNum, this.battle);
          }
          if (move.pbRepeatHit()) break; // Dragon Darts only shows one failure message
        }
        await move.pbCrashDamage(user);
        await user.pbItemHPHealCheck();
        await this.pbCancelMoves();
        return false;
      }
    }
    // If we get here, this hit will happen and do something
    const allTargets = targets;
    targets = move.pbDesignateTargetsForHit(targets, hitNum); // For Dragon Darts
    for (const b of targets) b.damageState.resetPerHit();
    //---------------------------------------------------------------------------
    // Calculate damage to deal
    if (move.pbDamagingMove()) {
      for (const b of targets) {
        if (b.damageState.unaffected) continue;
        // Check whether Substitute/Disguise will absorb the damage
        move.pbCheckDamageAbsorption(user, b);
        // Calculate the damage against b
        // pbCalcDamage shows the "eat berry" animation for SE-weakening
        // berries, although the message about it comes after the additional
        // effect below
        await move.pbCalcDamage(user, b, targets.length); // Stored in damageState.calcDamage
        // Lessen damage dealt because of False Swipe/Endure/etc.
        move.pbReduceDamage(user, b); // Stored in damageState.hpLost
      }
    }
    // Show move animation (for this hit)
    await move.pbShowAnimation(move.id, user, targets, hitNum);
    // Type-boosting Gem consume animation/message
    if (user.effects[PBEffects.GemConsumed] && hitNum === 0) {
      // NOTE: The consume animation and message for Gems are shown now, but the
      //       actual removal of the item happens in def pbEffectsAfterMove.
      await this.battle.pbCommonAnimation("UseItem", user);
      await this.battle.pbDisplay(_INTL("The {1} strengthened {2}'s power!",
        Item.get(user.effects[PBEffects.GemConsumed]).name, move.name));
    }
    // Messages about missed target(s) (relevant for multi-target moves only)
    if (!move.pbRepeatHit()) {
      for (const b of targets) {
        if (!b.damageState.missed) continue;
        await this.pbMissMessage(move, user, b);
        if (user.itemActive()) {
          await ItemEffects.triggerOnMissingTarget(user.item, user, b, move, hitNum, this.battle);
        }
      }
    }
    // Deal the damage (to all allies first simultaneously, then all foes
    // simultaneously)
    if (move.pbDamagingMove()) {
      // This just changes the HP amounts and does nothing else
      for (const b of targets) if (!b.damageState.unaffected) await move.pbInflictHPDamage(b);
      // Animate the hit flashing and HP bar changes
      await move.pbAnimateHitAndHPLost(user, targets);
    }
    // Self-Destruct/Explosion's damaging and fainting of user
    if (hitNum === 0) await move.pbSelfKO(user);
    if (user.fainted()) await user.pbFaint();
    if (move.pbDamagingMove()) {
      for (const b of targets) {
        if (b.damageState.unaffected) continue;
        // NOTE: This method is also used for the OHKO special message.
        await move.pbHitEffectivenessMessages(user, b, targets.length);
        // Record data about the hit for various effects' purposes
        move.pbRecordDamageLost(user, b);
      }
      // Close Combat/Superpower's stat-lowering, Flame Burst's splash damage,
      // and Incinerate's berry destruction
      for (const b of targets) {
        if (b.damageState.unaffected) continue;
        await move.pbEffectWhenDealingDamage(user, b);
      }
      // Ability/item effects such as Static/Rocky Helmet, and Grudge, etc.
      for (const b of targets) {
        if (b.damageState.unaffected) continue;
        await this.pbEffectsOnMakingHit(move, user, b);
      }
      // Disguise/Endure/Sturdy/Focus Sash/Focus Band messages
      for (const b of targets) {
        if (b.damageState.unaffected) continue;
        await move.pbEndureKOMessage(b);
      }
      // HP-healing held items (checks all battlers rather than just targets
      // because Flame Burst's splash damage affects non-targets)
      for (const b of this.battle.pbPriority(true)) await b.pbItemHPHealCheck();
      // Animate battlers fainting (checks all battlers rather than just targets
      // because Flame Burst's splash damage affects non-targets)
      for (const b of this.battle.pbPriority(true)) if (b?.fainted()) await b.pbFaint();
    }
    await this.battle.pbJudgeCheckpoint(user, move);
    // Main effect (recoil/drain, etc.)
    for (const b of targets) {
      if (b.damageState.unaffected) continue;
      await move.pbEffectAgainstTarget(user, b);
    }
    await move.pbEffectGeneral(user);
    for (const b of targets) if (b?.fainted()) await b.pbFaint();
    if (user.fainted()) await user.pbFaint();
    // Additional effect
    if (!user.hasActiveAbility("SHEERFORCE")) {
      for (const b of targets) {
        if (b.damageState.calcDamage === 0) continue;
        const chance = move.pbAdditionalEffectChance(user, b);
        if (chance <= 0) continue;
        if (this.battle.pbRandom(100) < chance) {
          await move.pbAdditionalEffect(user, b);
        }
      }
    }
    // Make the target flinch (because of an item/ability)
    for (const b of targets) {
      if (b.fainted()) continue;
      if (b.damageState.calcDamage === 0 || b.damageState.substitute) continue;
      const chance = move.pbFlinchChance(user, b);
      if (chance <= 0) continue;
      if (this.battle.pbRandom(100) < chance) {
        PBDebug.log(`[Item/ability triggered] ${user.pbThis()}'s King's Rock/Razor Fang or Stench`);
        b.pbFlinch(user);
      }
    }
    // Message for and consuming of type-weakening berries
    // NOTE: The "consume held item" animation for type-weakening berries occurs
    //       during pbCalcDamage above (before the move's animation), but the
    //       message about it only shows here.
    for (const b of targets) {
      if (b.damageState.unaffected) continue;
      if (!b.damageState.berryWeakened) continue;
      await this.battle.pbDisplay(_INTL("The {1} weakened the damage to {2}!", b.itemName(), b.pbThis(true)));
      await b.pbConsumeItem();
    }
    // Steam Engine (goes here because it should be after stat changes caused by
    // the move)
    if (["FIRE", "WATER"].includes(move.calcType!)) {
      for (const b of targets) {
        if (b.damageState.unaffected) continue;
        if (b.damageState.calcDamage === 0 || b.damageState.substitute) continue;
        if (!b.hasActiveAbility("STEAMENGINE")) continue;
        if (await b.pbCanRaiseStatStage("SPEED", b)) await b.pbRaiseStatStageByAbility("SPEED", 6, b);
      }
    }
    // Fainting
    for (const b of targets) if (b?.fainted()) await b.pbFaint();
    if (user.fainted()) await user.pbFaint();
    // Dragon Darts' second half of attack
    if (move.pbRepeatHit() && hitNum === 0 &&
        targets.some((b) => !b.fainted() && !b.damageState.unaffected)) {
      await this.pbProcessMoveHit(move, user, allTargets, 1, skipAccuracyCheck);
    }
    return true;
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
