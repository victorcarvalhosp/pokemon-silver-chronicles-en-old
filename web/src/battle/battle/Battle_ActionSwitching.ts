// Port of Data/Scripts/011_Battle/001_Battle/005_Battle_ActionSwitching.rb,
// with the plugin patches to these methods:
// - Generation 9 Pack ([001] Battle/[001] Battle.rb:68): pbCanSwitch?
//   (Commander). (Its pbReviveInParty, [001] Battle.rb:148, is in Battle_ActionOther.ts.)
// - Essentials Deluxe ([002] Battle Deluxe/Midbattle_Triggers.rb:93-151):
//   midbattle triggers in pbMessageOnRecall, pbMessagesOnReplace (rewritten:
//   name titles), pbReplace, pbRecallAndReplace (rewritten).
// - ZUD Mechanics ([003] Battle/Battle_Overrides.rb): pbEffectsOnBattlerEnteringPosition
//   (:89, Z-Memento/Z-Parting Shot healing), pbEntryHazards (:108, G-Max
//   Steelsurge), pbRecallAndReplace (:261) and pbSwitchInBetween (:268)
//   (revert Dynamax when switching out).
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb:248): pbPursuit
//   (core 010_Battle_AttackPhase.rb:24; ported here, as the AttackPhase port
//   leaves it out).
// Alias chains: pbRecallAndReplace = ZUD( Deluxe ); pbReplace = Deluxe( core );
// pbCanSwitch? = Gen 9( core ).
//
// pbCanSwitchLax?/pbCanSwitch? only show messages through the party screen
// (partyScene): pbCanSwitchLax/pbCanSwitch are the synchronous queries without
// a party screen (what the AI, moves and items use), and
// pbCanSwitchLaxAsync/pbCanSwitchAsync take the party screen and show its
// message.

import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Type, Effectiveness } from "../../data/gameData/type";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { BattleSubScene } from "../BattleSceneInterface";
import type { Battler } from "../battler/Battler";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBEffects } from "../other/PBEffects";
import { Battle } from "./Battle";

const methods = {
  //=============================================================================
  // Choosing Pokémon to switch
  //=============================================================================
  /**
   * pbCanSwitchLax? body: msgs (when given, i.e. Ruby's partyScene is set)
   * receives the message the party screen should show.
   */
  _pbCanSwitchLax(this: Battle, idxBattler: number, idxParty: number, msgs: string[] | null): boolean {
    if (idxParty < 0) return true;
    const party = this.pbParty(idxBattler);
    if (idxParty >= party.length) return false;
    if (!party[idxParty]) return false;
    if (party[idxParty].egg()) {
      msgs?.push(_INTL("An Egg can't battle!"));
      return false;
    }
    if (!this.pbIsOwner(idxBattler, idxParty)) {
      if (msgs) {
        const owner = this.pbGetOwnerFromPartyIndex(idxBattler, idxParty)!;
        msgs.push(_INTL("You can't switch {1}'s Pokémon with one of yours!", owner.name));
      }
      return false;
    }
    if (party[idxParty].fainted()) {
      msgs?.push(_INTL("{1} has no energy left to battle!", party[idxParty].name));
      return false;
    }
    if (this.pbFindBattler(idxParty, idxBattler)) {
      msgs?.push(_INTL("{1} is already in battle!", party[idxParty].name));
      return false;
    }
    return true;
  },

  /**
   * pbCanSwitchLax? without a party screen — Checks whether the replacement
   * Pokémon (at party index idxParty) can enter battle.
   */
  pbCanSwitchLax(this: Battle, idxBattler: number, idxParty: number): boolean {
    return this._pbCanSwitchLax(idxBattler, idxParty, null);
  },

  /**
   * pbCanSwitchLax?(idxBattler, idxParty, partyScene)
   * NOTE: Messages are only shown while in the party screen when choosing a
   *       command for the next round.
   */
  async pbCanSwitchLaxAsync(this: Battle, idxBattler: number, idxParty: number,
    partyScene: BattleSubScene | null = null): Promise<boolean> {
    const msgs: string[] | null = partyScene ? [] : null;
    const ret = this._pbCanSwitchLax(idxBattler, idxParty, msgs);
    if (partyScene) for (const msg of msgs!) await partyScene.pbDisplay(msg);
    return ret;
  },

  /** pbCanSwitch? body (Generation 9 Pack's version); msgs as in _pbCanSwitchLax. */
  _pbCanSwitch(this: Battle, idxBattler: number, idxParty: number, msgs: string[] | null): boolean {
    // --- Essentials ---
    const coreCanSwitch = (): boolean => {
      // Check whether party Pokémon can switch in
      if (!this._pbCanSwitchLax(idxBattler, idxParty, msgs)) return false;
      // Make sure another battler isn't already choosing to switch to the party
      // Pokémon
      for (const b of this.allSameSideBattlers(idxBattler)) {
        if (this.choices[b.index]![0] !== "SwitchOut" || this.choices[b.index]![1] !== idxParty) continue;
        msgs?.push(_INTL("{1} has already been selected.", this.pbParty(idxBattler)[idxParty]!.name));
        return false;
      }
      // Check whether battler can switch out
      const battler = this.battlers[idxBattler]!;
      if (battler.fainted()) return true;
      // Ability/item effects that allow switching no matter what
      if (battler.abilityActive() &&
          AbilityEffects.triggerCertainSwitching(battler.ability, battler, this)) {
        return true;
      }
      if (battler.itemActive() &&
          ItemEffects.triggerCertainSwitching(battler.item, battler, this)) {
        return true;
      }
      // Other certain switching effects
      if (Settings.MORE_TYPE_EFFECTS && battler.pbHasType("GHOST")) return true;
      // Other certain trapping effects
      if (battler.trappedInBattle()) {
        msgs?.push(_INTL("{1} can't be switched out!", battler.pbThis()));
        return false;
      }
      // Trapping abilities/items
      for (const b of this.allOtherSideBattlers(idxBattler)) {
        if (!b.abilityActive()) continue;
        if (AbilityEffects.triggerTrappingByTarget(b.ability, battler, b, this)) {
          msgs?.push(_INTL("{1}'s {2} prevents switching!", b.pbThis(), b.abilityName()));
          return false;
        }
      }
      for (const b of this.allOtherSideBattlers(idxBattler)) {
        if (!b.itemActive()) continue;
        if (ItemEffects.triggerTrappingByTarget(b.item, battler, b, this)) {
          msgs?.push(_INTL("{1}'s {2} prevents switching!", b.pbThis(), b.itemName()));
          return false;
        }
      }
      return true;
    };
    const ret = coreCanSwitch();
    // --- Generation 9 Pack: Pokémon affected by Commander can't switch out for any reason ---
    const commander = this.battlers[idxBattler]!.effects[PBEffects.Commander];
    if (ret && commander != null && commander !== false) {
      // NOTE: Ruby uses an undefined local `battler` here (a NameError when a
      //       party screen is open); this uses the battler at idxBattler.
      msgs?.push(_INTL("{1} can't be switched out!", this.battlers[idxBattler]!.pbThis()));
      return false;
    }
    return ret;
  },

  /**
   * pbCanSwitch? without a party screen — Check whether the currently active
   * Pokémon (at battler index idxBattler) can switch out (and that its
   * replacement at party index idxParty can switch in).
   */
  pbCanSwitch(this: Battle, idxBattler: number, idxParty = -1): boolean {
    return this._pbCanSwitch(idxBattler, idxParty, null);
  },

  /**
   * pbCanSwitch?(idxBattler, idxParty, partyScene)
   * NOTE: Messages are only shown while in the party screen when choosing a
   *       command for the next round.
   */
  async pbCanSwitchAsync(this: Battle, idxBattler: number, idxParty = -1,
    partyScene: BattleSubScene | null = null): Promise<boolean> {
    const msgs: string[] | null = partyScene ? [] : null;
    const ret = this._pbCanSwitch(idxBattler, idxParty, msgs);
    if (partyScene) for (const msg of msgs!) await partyScene.pbDisplay(msg);
    return ret;
  },

  /** pbCanChooseNonActive? */
  pbCanChooseNonActive(this: Battle, idxBattler: number): boolean {
    const party = this.pbParty(idxBattler);
    for (let i = 0; i < party.length; i++) {
      if (this.pbCanSwitchLax(idxBattler, i)) return true;
    }
    return false;
  },

  pbRegisterSwitch(this: Battle, idxBattler: number, idxParty: number): boolean {
    if (!this.pbCanSwitch(idxBattler, idxParty)) return false;
    const choice = this.choices[idxBattler]!;
    choice[0] = "SwitchOut";
    choice[1] = idxParty; // Party index of Pokémon to switch in
    choice[2] = null;
    return true;
  },

  //=============================================================================
  // Open the party screen and potentially pick a replacement Pokémon (or AI
  // chooses replacement)
  //=============================================================================
  /**
   * Open party screen and potentially choose a Pokémon to switch with. Used in
   * all instances where the party screen is opened.
   */
  async pbPartyScreen(this: Battle, idxBattler: number, checkLaxOnly = false, canCancel = false,
    shouldRegister = false): Promise<number> {
    let ret = -1;
    await this.scene.pbPartyScreen(idxBattler, canCancel, 0, async (idxParty, partyScene) => {
      if (checkLaxOnly) {
        if (!(await this.pbCanSwitchLaxAsync(idxBattler, idxParty, partyScene))) return false;
      } else if (!(await this.pbCanSwitchAsync(idxBattler, idxParty, partyScene))) {
        return false;
      }
      if (shouldRegister && (idxParty < 0 || !this.pbRegisterSwitch(idxBattler, idxParty))) {
        return false;
      }
      ret = idxParty;
      return true;
    });
    return ret;
  },

  /**
   * For choosing a replacement Pokémon when prompted in the middle of other
   * things happening (U-turn, Baton Pass, in def pbEORSwitch).
   * ZUD Mechanics (Battle_Overrides.rb:268): reverts Dynamax if a replacement
   * was chosen.
   */
  async pbSwitchInBetween(this: Battle, idxBattler: number, checkLaxOnly = false, canCancel = false): Promise<number> {
    let ret: number;
    if (this.pbOwnedByPlayer(idxBattler)) {
      ret = await this.pbPartyScreen(idxBattler, checkLaxOnly, canCancel);
    } else {
      ret = await this.battleAI.pbDefaultChooseNewEnemy(idxBattler, this.pbParty(idxBattler));
    }
    // ZUD Mechanics
    if (this.battlers[idxBattler]!.dynamax() && ret > -1) await this.battlers[idxBattler]!.unmax();
    return ret;
  },

  //=============================================================================
  // Pursuit (core: 010_Battle_AttackPhase.rb:24; Essentials Deluxe's
  // redefinition, [000] Essentials Patches/Battle.rb:248, ensures certain
  // battle mechanics trigger prior to using Pursuit). Called by
  // pbAttackPhaseSwitch when a battler is about to switch out.
  //=============================================================================
  async pbPursuit(this: Battle, idxSwitcher: number): Promise<void> {
    this.switching = true;
    for (const b of this.pbPriority()) {
      if (b.fainted() || !b.opposes(idxSwitcher)) continue; // Shouldn't hit an ally
      if (b.movedThisRound() || !this.pbChoseMoveFunctionCode(b.index, "PursueSwitchingFoe")) continue;
      // Check whether Pursuit can be used
      const choice = this.choices[b.index]!;
      if (!this.pbMoveCanTarget(b.index, idxSwitcher, (choice[2] as Move).pbTarget(b))) continue;
      if (!(await this.pbCanChooseMoveAsync(b.index, choice[1] as number, false))) continue;
      if (b.status === "SLEEP" || b.status === "FROZEN") continue;
      if (b.effects[PBEffects.SkyDrop] >= 0) continue;
      if (b.hasActiveAbility("TRUANT") && b.effects[PBEffects.Truant]) continue;
      // Mega Evolve (Essentials Deluxe: wild Pokémon too)
      const owner = this.pbGetOwnerIndexFromBattlerIndex(b.index);
      if (this.megaEvolution[b.idxOwnSide()]![owner] === b.index) await this.pbMegaEvolve(b.index);
      // Essentials Deluxe: ZUD Mechanics is installed
      if (this.ultraBurst[b.idxOwnSide()]![owner] === b.index) await this.pbUltraBurst(b.index);
      // (PLA Battle Styles and Terastal Phenomenon aren't installed.)
      // Use Pursuit
      choice[3] = idxSwitcher; // Change Pursuit's target
      await b.pbProcessTurn(choice, false);
      if (this.decision > 0 || this.battlers[idxSwitcher]!.fainted()) break;
    }
    this.switching = false;
  },

  //=============================================================================
  // Switching Pokémon
  //=============================================================================
  /**
   * General switching method that checks if any Pokémon need to be sent out and,
   * if so, does. Called at the end of each round.
   */
  async pbEORSwitch(this: Battle, favorDraws = false): Promise<void> {
    if (this.decision > 0 && !favorDraws) return;
    if (this.decision === 5 && favorDraws) return;
    this.pbJudge();
    if (this.decision > 0) return;
    // Check through each fainted battler to see if that spot can be filled.
    const switched: number[] = [];
    for (;;) {
      switched.length = 0;
      for (const b of this.battlers) {
        if (!b || !b.fainted()) continue;
        const idxBattler = b.index;
        if (!this.pbCanChooseNonActive(idxBattler)) continue;
        if (!this.pbOwnedByPlayer(idxBattler)) { // Opponent/ally is switching in
          if (b.wild()) continue; // Wild Pokémon can't switch
          const idxPartyNew = await this.pbSwitchInBetween(idxBattler);
          const opponent = this.pbGetOwnerFromBattlerIndex(idxBattler)!;
          // NOTE: The player is only offered the chance to switch their own
          //       Pokémon when an opponent replaces a fainted Pokémon in single
          //       battles. In double battles, etc. there is no such offer.
          if (this.internalBattle && this.switchStyle && this.trainerBattle() && this.pbSideSize(0) === 1 &&
              this.opposes(idxBattler) && !this.battlers[0]!.fainted() && !switched.includes(0) &&
              this.pbCanChooseNonActive(0) && this.battlers[0]!.effects[PBEffects.Outrage] === 0) {
            let idxPartyForName = idxPartyNew;
            const enemyParty = this.pbParty(idxBattler);
            if (enemyParty[idxPartyNew]!.abilityId === "ILLUSION" && !this.pbCheckGlobalAbility("NEUTRALIZINGGAS")) {
              const newIndex = this.pbLastInTeam(idxBattler);
              if (newIndex >= 0 && newIndex !== idxPartyNew) idxPartyForName = newIndex;
            }
            if (await this.pbDisplayConfirm(_INTL("{1} is about to send out {2}. Will you switch your Pokémon?",
              opponent.fullName(), enemyParty[idxPartyForName]!.name))) {
              const idxPlayerPartyNew = await this.pbSwitchInBetween(0, false, true);
              if (idxPlayerPartyNew >= 0) {
                await this.pbMessageOnRecall(this.battlers[0]!);
                await this.pbRecallAndReplace(0, idxPlayerPartyNew);
                switched.push(0);
              }
            }
          }
          await this.pbRecallAndReplace(idxBattler, idxPartyNew);
          switched.push(idxBattler);
        } else if (this.trainerBattle()) { // Player switches in in a trainer battle
          const idxPlayerPartyNew = await this.pbGetReplacementPokemonIndex(idxBattler); // Owner chooses
          await this.pbRecallAndReplace(idxBattler, idxPlayerPartyNew);
          switched.push(idxBattler);
        } else { // Player's Pokémon has fainted in a wild battle
          let doSwitch = false;
          if (await this.pbDisplayConfirm(_INTL("Use next Pokémon?"))) {
            doSwitch = true;
          } else {
            doSwitch = ((await this.pbRun(idxBattler, true)) <= 0);
          }
          if (doSwitch) {
            const idxPlayerPartyNew = await this.pbGetReplacementPokemonIndex(idxBattler); // Owner chooses
            await this.pbRecallAndReplace(idxBattler, idxPlayerPartyNew);
            switched.push(idxBattler);
          }
        }
      }
      if (switched.length === 0) break;
      await this.pbOnBattlerEnteringBattle(switched);
    }
  },

  async pbGetReplacementPokemonIndex(this: Battle, idxBattler: number, random = false): Promise<number> {
    if (random) {
      const choices: number[] = []; // Find all Pokémon that can switch in
      this.eachInTeamFromBattlerIndex(idxBattler, (_pkmn, i) => {
        if (this.pbCanSwitchLax(idxBattler, i)) choices.push(i);
      });
      if (choices.length === 0) return -1;
      return choices[this.pbRandom(choices.length)]!;
    }
    return this.pbSwitchInBetween(idxBattler, true);
  },

  /**
   * Actually performs the recalling and sending out in all situations.
   * Essentials Deluxe (Midbattle_Triggers.rb:145): rewritten with withTriggers;
   * ZUD Mechanics (Battle_Overrides.rb:261): reverts Dynamax prior to switching out.
   */
  async pbRecallAndReplace(this: Battle, idxBattler: number, idxParty: number, randomReplacement = false,
    batonPass = false, withTriggers = true): Promise<void> {
    // ZUD Mechanics
    if (this.battlers[idxBattler]!.dynamax()) await this.battlers[idxBattler]!.unmax();
    // Essentials Deluxe
    if (!this.battlers[idxBattler]!.fainted()) await this.scene.pbRecall(idxBattler);
    await this.battlers[idxBattler]!.pbAbilitiesOnSwitchOut(); // Inc. primordial weather check
    if (this.pbSideSize(idxBattler) === 1) await this.scene.pbShowPartyLineup(idxBattler & 1);
    if (!randomReplacement) await this.pbMessagesOnReplace(idxBattler, idxParty, withTriggers);
    await this.pbReplace(idxBattler, idxParty, batonPass, withTriggers);
  },

  /** Essentials Deluxe (Midbattle_Triggers.rb:93): "switchOut" midbattle triggers first. */
  async pbMessageOnRecall(this: Battle, battler: Battler, withTriggers = true): Promise<void> {
    // Essentials Deluxe
    if (!battler.fainted() && withTriggers) {
      const triggers = ["switchOut", "switchOut" + battler.species];
      for (const t of battler.pokemon!.types()) triggers.push("switchOut" + t);
      await this.scene.pbDeluxeTriggers?.(battler, null, triggers);
    }
    // --- Essentials ---
    if (battler.pbOwnedByPlayer()) {
      if (battler.hp <= Math.floor(battler.totalhp / 4)) {
        await this.pbDisplayBrief(_INTL("Good job, {1}! Come back!", battler.name));
      } else if (battler.hp <= Math.floor(battler.totalhp / 2)) {
        await this.pbDisplayBrief(_INTL("OK, {1}! Come back!", battler.name));
      } else if (battler.turnCount >= 5) {
        await this.pbDisplayBrief(_INTL("{1}, that's enough! Come back!", battler.name));
      } else if (battler.turnCount >= 2) {
        await this.pbDisplayBrief(_INTL("{1}, come back!", battler.name));
      } else {
        await this.pbDisplayBrief(_INTL("{1}, switch out! Come back!", battler.name));
      }
    } else {
      const owner = this.pbGetOwnerName(battler.index);
      await this.pbDisplayBrief(_INTL("{1} withdrew {2}!", owner, battler.name));
    }
  },

  /**
   * Only called from def pbRecallAndReplace and Battle Arena's def pbSwitch.
   * Essentials Deluxe (Midbattle_Triggers.rb:102): rewritten with "switchIn"
   * midbattle triggers and name titles.
   */
  async pbMessagesOnReplace(this: Battle, idxBattler: number, idxParty: number, withTriggers = true): Promise<void> {
    const party = this.pbParty(idxBattler);
    if (withTriggers) {
      const nextPoke = party[idxParty]!;
      const triggers = ["switchIn", "switchIn" + nextPoke.species];
      for (const t of nextPoke.types()) triggers.push("switchIn" + t);
      if (this.pbAbleNonActiveCount(idxBattler) === 1) triggers.push("switchInLast");
      await this.scene.pbDeluxeTriggers?.(idxBattler, null, triggers);
    }
    let newPkmnName = party[idxParty]!.nameTitle();
    if (party[idxParty]!.abilityId === "ILLUSION" && !this.pbCheckGlobalAbility("NEUTRALIZINGGAS")) {
      const newIndex = this.pbLastInTeam(idxBattler);
      if (newIndex >= 0 && newIndex !== idxParty) newPkmnName = party[newIndex]!.nameTitle();
    }
    if (this.pbOwnedByPlayer(idxBattler)) {
      const opposing = this.battlers[idxBattler]!.pbDirectOpposing();
      if (opposing.fainted() || opposing.hp === opposing.totalhp) {
        await this.pbDisplayBrief(_INTL("You're in charge, {1}!", newPkmnName));
      } else if (opposing.hp >= Math.floor(opposing.totalhp / 2)) {
        await this.pbDisplayBrief(_INTL("Go for it, {1}!", newPkmnName));
      } else if (opposing.hp >= Math.floor(opposing.totalhp / 4)) {
        await this.pbDisplayBrief(_INTL("Just a little more! Hang in there, {1}!", newPkmnName));
      } else {
        await this.pbDisplayBrief(_INTL("Your opponent's weak! Get 'em, {1}!", newPkmnName));
      }
    } else {
      const owner = this.pbGetOwnerFromBattlerIndex(idxBattler)!;
      await this.pbDisplayBrief(_INTL("{1} sent out {2}!", owner.fullName(), newPkmnName));
    }
  },

  /**
   * Only called from def pbRecallAndReplace above and Battle Arena's def
   * pbSwitch.
   * Essentials Deluxe (Midbattle_Triggers.rb:134): "switchSentOut" midbattle triggers after.
   */
  async pbReplace(this: Battle, idxBattler: number, idxParty: number, batonPass = false,
    withTriggers = true): Promise<void> {
    // --- Essentials ---
    const party = this.pbParty(idxBattler);
    const idxPartyOld = this.battlers[idxBattler]!.pokemonIndex;
    // Initialise the new Pokémon
    this.battlers[idxBattler]!.pbInitialize(party[idxParty]!, idxParty, batonPass);
    // Reorder the party for this battle
    const partyOrder = this.pbPartyOrder(idxBattler);
    [partyOrder[idxParty], partyOrder[idxPartyOld]] = [partyOrder[idxPartyOld]!, partyOrder[idxParty]!];
    // Send out the new Pokémon
    await this.pbSendOut([[idxBattler, party[idxParty]!]]);
    if (Settings.RECALCULATE_TURN_ORDER_AFTER_SPEED_CHANGES) this.pbCalculatePriority(false, [idxBattler]);
    // --- Essentials Deluxe ---
    if (withTriggers) {
      const battler = this.battlers[idxBattler]!;
      const triggers = ["switchSentOut", "switchSentOut" + battler.species];
      for (const t of battler.pokemon!.types()) triggers.push("switchSentOut" + t);
      if (this.pbAbleNonActiveCount(idxBattler) === 0) triggers.push("switchSentOutLast");
      await this.scene.pbDeluxeTriggers?.(idxBattler, null, triggers);
    }
  },

  /**
   * Called from def pbReplace above and at the start of battle.
   * sendOuts is an array; each element is itself an array: [idxBattler,pkmn]
   */
  async pbSendOut(this: Battle, sendOuts: [number, Pokemon][], startBattle = false): Promise<void> {
    for (const b of sendOuts) this.peer.pbOnEnteringBattle(this, this.battlers[b[0]]!, b[1]);
    await this.scene.pbSendOutBattlers(sendOuts, startBattle);
    for (const b of sendOuts) {
      this.scene.pbResetMoveIndex(b[0]);
      this.pbSetSeen(this.battlers[b[0]]!);
      // NOTE: Indexed by battler index / 2, not party index (as in Ruby).
      this.usedInBattle[b[0] & 1]![Math.floor(b[0] / 2)] = true;
    }
  },

  //=============================================================================
  // Effects upon a Pokémon entering battle
  //=============================================================================
  /** Called at the start of battle only. */
  async pbOnAllBattlersEnteringBattle(this: Battle): Promise<void> {
    this.pbCalculatePriority(true);
    const battlerIndices: number[] = [];
    for (const b of this.allBattlers()) battlerIndices.push(b.index);
    await this.pbOnBattlerEnteringBattle(battlerIndices);
    this.pbCalculatePriority();
    // Check forms are correct
    for (const b of this.allBattlers()) await b.pbCheckForm();
  },

  /**
   * Called when one or more Pokémon switch in. Does a lot of things, including
   * entry hazards, form changes and items/abilities that trigger upon switching
   * in.
   */
  async pbOnBattlerEnteringBattle(this: Battle, battlerIndex: number | (number | number[])[],
    skipEventReset = false): Promise<void> {
    const indices: number[] = Array.isArray(battlerIndex) ? battlerIndex.flat() : [battlerIndex];
    // NOTE: This isn't done for switch commands, because they previously call
    //       pbRecallAndReplace, which could cause Neutralizing Gas to end, which
    //       in turn could cause Intimidate to trigger another Pokémon's Eject
    //       Pack. That Eject Pack should trigger at the end of this method, but
    //       this resetting would prevent that from happening, so it is skipped
    //       and instead done earlier in def pbAttackPhaseSwitch.
    if (!skipEventReset) {
      for (const b of this.allBattlers()) {
        b.droppedBelowHalfHP = false;
        b.statsDropped = false;
      }
    }
    // For each battler that entered battle, in speed order
    for (const b of this.pbPriority(true)) {
      if (!indices.includes(b.index) || b.fainted()) continue;
      this.pbRecordBattlerAsParticipated(b);
      await this.pbMessagesOnBattlerEnteringBattle(b);
      // Position/field effects triggered by the battler appearing
      await this.pbEffectsOnBattlerEnteringPosition(b); // Healing Wish/Lunar Dance
      await this.pbEntryHazards(b);
      // Battler faints if it is knocked out because of an entry hazard above
      if (b.fainted()) {
        await b.pbFaint();
        await this.pbGainExp();
        this.pbJudge();
        continue;
      }
      await b.pbCheckForm();
      // Primal Revert upon entering battle
      await this.pbPrimalReversion(b.index);
      // Ending primordial weather, checking Trace
      await b.pbContinualAbilityChecks(true);
      // Abilities that trigger upon switching in
      if ((!b.fainted() && b.unstoppableAbility()) || b.abilityActive()) {
        await AbilityEffects.triggerOnSwitchIn(b.ability, b, this, true);
      }
      await this.pbEndPrimordialWeather(); // Checking this again just in case
      // Items that trigger upon switching in (Air Balloon message)
      if (b.itemActive()) {
        await ItemEffects.triggerOnSwitchIn(b.item, b, this);
      }
      // Berry check, status-curing ability check
      await b.pbHeldItemTriggerCheck();
      await b.pbAbilityStatusCureCheck();
    }
    // Check for triggering of Emergency Exit/Wimp Out/Eject Pack (only one will
    // be triggered)
    for (const b of this.pbPriority(true)) {
      if (await b.pbItemOnStatDropped()) break;
      if (await b.pbAbilitiesOnDamageTaken()) break;
    }
    for (const b of this.allBattlers()) {
      b.droppedBelowHalfHP = false;
      b.statsDropped = false;
    }
  },

  pbRecordBattlerAsParticipated(this: Battle, battler: Battler): void {
    // Record money-doubling effect of Amulet Coin/Luck Incense
    if (!battler.opposes() && ["AMULETCOIN", "LUCKINCENSE"].includes(battler.itemId!)) {
      this.field.effects[PBEffects.AmuletCoin] = true;
    }
    // Update battlers' participants (who will gain Exp/EVs when a battler faints)
    for (const b of this.allBattlers()) b.pbUpdateParticipants();
  },

  async pbMessagesOnBattlerEnteringBattle(this: Battle, battler: Battler): Promise<void> {
    // Introduce Shadow Pokémon
    if (battler.shadowPokemon()) {
      await this.pbCommonAnimation("Shadow", battler);
      if (battler.opposes()) await this.pbDisplay(_INTL("Oh!\nA Shadow Pokémon!"));
    }
  },

  /**
   * Called when a Pokémon enters battle, and when Ally Switch is used.
   * ZUD Mechanics (Battle_Overrides.rb:89): Z-Memento/Z-Parting Shot healing first.
   */
  async pbEffectsOnBattlerEnteringPosition(this: Battle, battler: Battler): Promise<void> {
    const position = this.positions[battler.index]!;
    // ZUD Mechanics: Z-Power healing
    if (position.effects[PBEffects.ZHeal]) {
      if (battler.canHeal()) {
        await this.pbCommonAnimation("HealingWish", battler);
        await this.pbDisplay(_INTL("The Z-Power healed {1}!", battler.pbThis(true)));
        await battler.pbRecoverHP(battler.totalhp);
        position.effects[PBEffects.ZHeal] = false;
      } else if (Settings.MECHANICS_GENERATION_AT_RUNTIME < 8) {
        position.effects[PBEffects.ZHeal] = false;
      }
    }
    // --- Essentials ---
    // Healing Wish
    if (position.effects[PBEffects.HealingWish]) {
      if (battler.canHeal() || battler.status !== "NONE") {
        await this.pbCommonAnimation("HealingWish", battler);
        await this.pbDisplay(_INTL("The healing wish came true for {1}!", battler.pbThis(true)));
        await battler.pbRecoverHP(battler.totalhp);
        await battler.pbCureStatus(false);
        position.effects[PBEffects.HealingWish] = false;
      } else if (Settings.MECHANICS_GENERATION_AT_RUNTIME < 8) {
        position.effects[PBEffects.HealingWish] = false;
      }
    }
    // Lunar Dance
    if (position.effects[PBEffects.LunarDance]) {
      let fullPp = true;
      for (const m of battler.moves) if (m.pp < m.totalPp()) fullPp = false;
      if (battler.canHeal() || battler.status !== "NONE" || !fullPp) {
        await this.pbCommonAnimation("LunarDance", battler);
        await this.pbDisplay(_INTL("{1} became cloaked in mystical moonlight!", battler.pbThis()));
        await battler.pbRecoverHP(battler.totalhp);
        await battler.pbCureStatus(false);
        for (const m of battler.moves) await battler.pbSetPP(m, m.totalPp());
        position.effects[PBEffects.LunarDance] = false;
      } else if (Settings.MECHANICS_GENERATION_AT_RUNTIME < 8) {
        position.effects[PBEffects.LunarDance] = false;
      }
    }
  },

  /** ZUD Mechanics (Battle_Overrides.rb:108): G-Max Steelsurge first. */
  async pbEntryHazards(this: Battle, battler: Battler): Promise<void> {
    const battlerSide = battler.pbOwnSide();
    // ZUD Mechanics: G-Max Steelsurge
    if (battlerSide.effects[PBEffects.Steelsurge] && battler.takesIndirectDamage() &&
        Type.exists("STEEL") && !battler.hasActiveItem("HEAVYDUTYBOOTS")) {
      const bTypes = battler.pbTypes(true);
      let eff = Effectiveness.calculate("STEEL", bTypes[0] ?? null, bTypes[1] ?? null, bTypes[2] ?? null);
      if (!Effectiveness.ineffective(eff)) {
        eff = eff / Effectiveness.NORMAL_EFFECTIVE; // Float
        await battler.pbReduceHP(battler.totalhp * eff / 8, false);
        await this.pbDisplay(_INTL("The sharp steel bit into {1}!", battler.pbThis(true)));
        await battler.pbItemHPHealCheck();
      }
    }
    // --- Essentials ---
    // Stealth Rock
    if (battlerSide.effects[PBEffects.StealthRock] && battler.takesIndirectDamage() &&
        Type.exists("ROCK") && !battler.hasActiveItem("HEAVYDUTYBOOTS")) {
      const bTypes = battler.pbTypes(true);
      let eff = Effectiveness.calculate("ROCK", bTypes[0] ?? null, bTypes[1] ?? null, bTypes[2] ?? null);
      if (!Effectiveness.ineffective(eff)) {
        eff = eff / Effectiveness.NORMAL_EFFECTIVE; // Float
        await battler.pbReduceHP(battler.totalhp * eff / 8, false);
        await this.pbDisplay(_INTL("Pointed stones dug into {1}!", battler.pbThis()));
        await battler.pbItemHPHealCheck();
      }
    }
    // Spikes
    if (battlerSide.effects[PBEffects.Spikes] > 0 && battler.takesIndirectDamage() &&
        !battler.airborne() && !battler.hasActiveItem("HEAVYDUTYBOOTS")) {
      const spikesDiv = [8, 6, 4][battlerSide.effects[PBEffects.Spikes] - 1]!;
      await battler.pbReduceHP(Math.floor(battler.totalhp / spikesDiv), false);
      await this.pbDisplay(_INTL("{1} is hurt by the spikes!", battler.pbThis()));
      await battler.pbItemHPHealCheck();
    }
    // Toxic Spikes
    if (battlerSide.effects[PBEffects.ToxicSpikes] > 0 && !battler.fainted() && !battler.airborne()) {
      if (battler.pbHasType("POISON")) {
        battlerSide.effects[PBEffects.ToxicSpikes] = 0;
        await this.pbDisplay(_INTL("{1} absorbed the poison spikes!", battler.pbThis()));
      } else if ((await battler.pbCanPoison(null, false)) && !battler.hasActiveItem("HEAVYDUTYBOOTS")) {
        if (battlerSide.effects[PBEffects.ToxicSpikes] === 2) {
          await battler.pbPoison(null, _INTL("{1} was badly poisoned by the poison spikes!", battler.pbThis()), true);
        } else {
          await battler.pbPoison(null, _INTL("{1} was poisoned by the poison spikes!", battler.pbThis()));
        }
      }
    }
    // Sticky Web
    if (battlerSide.effects[PBEffects.StickyWeb] && !battler.fainted() && !battler.airborne() &&
        !battler.hasActiveItem("HEAVYDUTYBOOTS")) {
      await this.pbDisplay(_INTL("{1} was caught in a sticky web!", battler.pbThis()));
      if (await battler.pbCanLowerStatStage("SPEED")) {
        await battler.pbLowerStatStage("SPEED", 1, null);
        await battler.pbItemStatRestoreCheck();
      }
    }
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
