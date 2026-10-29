// Port of Data/Scripts/011_Battle/006_Other battle code/005_Battle_CatchAndStoreMixin.rb
// (module Battle::CatchAndStoreMixin, included in Battle: its methods are added to
// Battle.prototype), with:
// - v20.1 Hotfixes (Battle bug fixes.rb:60): pbStorePokemon (rule "forceCatchIntoParty"
//   can't be circumvented; the redefinition has the same code as v20.1's).
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:293): pbRecordAndStoreCaughtPokemon
//   (shadow Pokémon species data), :312 pbStorePokemon (clears the ace flag).
// - Essentials Deluxe ([002] Battle Deluxe/Battle_Deluxe.rb:403): pbCaptureCalc ([:setcapture] rule),
//   :414 pbRecordAndStoreCaughtPokemon ([:setcapture] :Demo); Midbattle_Triggers.rb:235:
//   pbThrowPokeBall (midbattle triggers).
// - ZUD Mechanics ([009] Max Raid/Raid_Battle.rb:478): pbStorePokemon (Dynamax data of caught
//   Pokémon; Max Lair/Max Raid storage in zud/raid/Raid_Battle_EndOfRound.ts).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import { MultipleForms } from "../../game/pokemon/formHandlers";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonOwner } from "../../game/pokemon/PokemonOwner";
import type { Player } from "../../game/trainer/Player";
import { startsWithVowel } from "../../game/items/itemUtilities";
import { Input } from "../../rgss/Input";
import { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { PBDebug } from "./PBDebug";
import { PokeBallEffects } from "./PokeBallEffects";
import { raidStorePokemon } from "../zud/raid/Raid_Battle_EndOfRound";
import { DEBUG } from "../../core/debug"; // $DEBUG

/** Essentials Deluxe: $game_temp.dx_rules if dx_rules? (set and not empty), else null. */
function dxRules(): Record<string, unknown> | null {
  const rules = (G.gameTemp as unknown as { dxRules?: Record<string, unknown> | null }).dxRules;
  return rules && Object.keys(rules).length > 0 ? rules : null;
}

/** $game_temp's per-battle party records (set when a battle starts). */
type PartyRecords = {
  partyLevelsBeforeBattle?: (number | null)[];
  partyCriticalHitsDealt?: (number | null)[];
  partyDirectDamageTaken?: (number | null)[];
};

/**
 * Battle::CatchAndStoreMixin#pbCaptureCalc as defined by Essentials (before
 * Essentials Deluxe's alias): how many shakes a thrown Poké Ball makes (4 = capture).
 */
function captureCalcCore(battle: Battle, pkmn: Pokemon, battler: Battler, catchRate: number | null, ball: Id): number {
  if (DEBUG && Input.press(Input.CTRL)) return 4;
  // Get a catch rate if one wasn't provided
  if (catchRate == null) catchRate = pkmn.speciesData().catchRate;
  // Modify catch_rate depending on the Poké Ball's effect
  if (!pkmn.speciesData().hasFlag("UltraBeast") || ball === "BEASTBALL") {
    catchRate = PokeBallEffects.modifyCatchRate(ball, catchRate, battle, battler);
  } else {
    catchRate = Math.floor(catchRate / 10); // Integer catch rate: integer division
  }
  // First half of the shakes calculation
  const a = battler.totalhp;
  const b = battler.hp;
  let x = (((3 * a) - (2 * b)) * catchRate) / (3 * a); // catch_rate.to_f: float division
  // Calculation modifiers
  if (battler.status === "SLEEP" || battler.status === "FROZEN") {
    x *= 2.5;
  } else if (battler.status !== "NONE") {
    x *= 1.5;
  }
  x = Math.floor(x);
  if (x < 1) x = 1;
  // Definite capture, no need to perform randomness checks
  if (x >= 255 || PokeBallEffects.isUnconditional(ball, battle, battler)) return 4;
  // Second half of the shakes calculation
  const y = Math.floor(65_536 / ((255.0 / x) ** 0.1875));
  // Critical capture check
  if (Settings.ENABLE_CRITICAL_CAPTURES) {
    let dexModifier = 0;
    const numOwned = (G.player as unknown as Player).pokedex.ownedCount();
    if (numOwned > 600) {
      dexModifier = 5;
    } else if (numOwned > 450) {
      dexModifier = 4;
    } else if (numOwned > 300) {
      dexModifier = 3;
    } else if (numOwned > 150) {
      dexModifier = 2;
    } else if (numOwned > 30) {
      dexModifier = 1;
    }
    if (G.bag.has("CATCHINGCHARM")) dexModifier *= 2;
    const c = Math.floor((x * dexModifier) / 12);
    // Calculate the number of shakes
    if (c > 0 && battle.pbRandom(256) < c) {
      battle.criticalCapture = true;
      if (battle.pbRandom(65_536) < y) return 4;
      return 0;
    }
  }
  // Calculate the number of shakes
  let numShakes = 0;
  for (let i = 0; i < 4; i++) {
    if (numShakes < i) break;
    if (battle.pbRandom(65_536) < y) numShakes += 1;
  }
  return numShakes;
}

const methods = {
  //=============================================================================
  // Store caught Pokémon
  //=============================================================================
  async pbStorePokemon(this: Battle, pkmn: Pokemon): Promise<void> {
    // ZUD Mechanics (Raid_Battle.rb:478): upon capturing a Dynamaxed Pokemon
    if (pkmn.isSpecies("ETERNATUS") || !pkmn.dynamaxAble) {
      pkmn.gmaxFactor = false;
      pkmn.dynamaxLvl = 0;
    }
    // Max Lair (inMaxLair?) and Max Raid (@raid_battle) storage (Raid_Battle.rb:483-496)
    if (await raidStorePokemon(this, pkmn)) return;
    // Essentials Deluxe (Battle_Misc.rb:312)
    pkmn.ace = false;
    // --- v20.1 Hotfixes (Battle bug fixes.rb:60) ---
    // Nickname the Pokémon (unless it's a Shadow Pokémon)
    if (!pkmn.shadowPokemon()) {
      if (G.pokemonSystem.givenicknames === 0 &&
          await this.pbDisplayConfirm(_INTL("Would you like to give a nickname to {1}?", pkmn.name))) {
        const nickname = await this.scene.pbNameEntry(_INTL("{1}'s nickname?", pkmn.speciesName()), pkmn);
        pkmn.name = nickname;
      }
    }
    // Store the Pokémon
    if (this.pbPlayer().partyFull() && (this.sendToBoxes === 0 || this.sendToBoxes === 2)) { // Ask/must add to party
      const cmds = [_INTL("Add to your party"),
        _INTL("Send to a Box"),
        _INTL("See {1}'s summary", pkmn.name),
        _INTL("Check party")];
      if (this.sendToBoxes === 2) cmds.splice(1, 1);
      storeLoop:
      for (;;) {
        let cmd = await this.pbShowCommands(_INTL("Where do you want to send {1} to?", pkmn.name), cmds, 99);
        if (cmd === 99) break; // Cancelling = send to a Box
        if (cmd >= 1 && this.sendToBoxes === 2) cmd += 1;
        switch (cmd) {
          case 0: { // Add to your party
            await this.pbDisplay(_INTL("Choose a Pokémon in your party to send to your Boxes."));
            let partyIndex = -1;
            await this.scene.pbPartyScreen(0, this.sendToBoxes !== 2, 1, (idxParty) => {
              partyIndex = idxParty;
              return true;
            });
            if (partyIndex < 0) continue storeLoop; // Cancelled
            const partySize = this.pbPlayer().party.length;
            // Send chosen Pokémon to storage
            // NOTE: This doesn't work properly if you catch multiple Pokémon in
            //       the same battle, because the code below doesn't alter the
            //       contents of pbParty(0), only pbPlayer.party. This means that
            //       viewing the party in battle after replacing a party Pokémon
            //       with a caught one (which is possible if you've caught a second
            //       Pokémon) will not show the first caught Pokémon in the party
            //       but will still show the boxed Pokémon in the party. Correcting
            //       this would take a surprising amount of code, and it's very
            //       unlikely to be needed anyway, so I'm ignoring it for now.
            const sendPkmn = this.pbPlayer().party[partyIndex]!;
            const storedBox = this.peer.pbStorePokemon(this.pbPlayer(), sendPkmn);
            this.pbPlayer().party.splice(partyIndex, 1);
            const boxName = this.peer.pbBoxName(storedBox);
            await this.pbDisplayPaused(_INTL("{1} has been sent to Box \"{2}\".", sendPkmn.name, boxName));
            // Rearrange all remembered properties of party Pokémon
            const gt = G.gameTemp as unknown as PartyRecords;
            for (let idx = partyIndex; idx < partySize; idx++) {
              if (idx < partySize - 1) {
                this.initialItems[0]![idx] = this.initialItems[0]![idx + 1]!;
                if (gt.partyLevelsBeforeBattle) gt.partyLevelsBeforeBattle[idx] = gt.partyLevelsBeforeBattle[idx + 1]!;
                if (gt.partyCriticalHitsDealt) gt.partyCriticalHitsDealt[idx] = gt.partyCriticalHitsDealt[idx + 1]!;
                if (gt.partyDirectDamageTaken) gt.partyDirectDamageTaken[idx] = gt.partyDirectDamageTaken[idx + 1]!;
              } else {
                this.initialItems[0]![idx] = null;
                if (gt.partyLevelsBeforeBattle) gt.partyLevelsBeforeBattle[idx] = null;
                if (gt.partyCriticalHitsDealt) gt.partyCriticalHitsDealt[idx] = null;
                if (gt.partyDirectDamageTaken) gt.partyDirectDamageTaken[idx] = null;
              }
            }
            break storeLoop;
          }
          case 1: // Send to a Box
            break storeLoop;
          case 2: { // See X's summary
            const { pbFadeOutIn } = await import("../../ui/fades");
            await pbFadeOutIn(async () => {
              const { PokemonSummary_Scene, PokemonSummaryScreen } = await import("../../ui/summary/summary");
              const summaryScene = new PokemonSummary_Scene();
              const summaryScreen = new PokemonSummaryScreen(summaryScene, true);
              await summaryScreen.pbStartScreen([pkmn], 0);
            });
            break;
          }
          case 3: // Check party
            // (Ruby passes no block; the scene doesn't call it in mode 2)
            await this.scene.pbPartyScreen(0, true, 2, () => true);
            break;
        }
      }
    }
    // Store as normal (add to party if there's space, or send to a Box if not)
    const storedBox = this.peer.pbStorePokemon(this.pbPlayer(), pkmn);
    if (storedBox < 0) {
      await this.pbDisplayPaused(_INTL("{1} has been added to your party.", pkmn.name));
      if (this.initialItems) this.initialItems[0]![this.pbPlayer().party.length - 1] = pkmn.itemId;
      return;
    }
    // Messages saying the Pokémon was stored in a PC box
    const boxName = this.peer.pbBoxName(storedBox);
    await this.pbDisplayPaused(_INTL("{1} has been sent to Box \"{2}\"!", pkmn.name, boxName));
  },

  /** Register all caught Pokémon in the Pokédex, and store them. */
  async pbRecordAndStoreCaughtPokemon(this: Battle): Promise<void> {
    // Essentials Deluxe (Battle_Deluxe.rb:414): [:setcapture] rule set to :Demo
    const rules = dxRules();
    if (rules && rules.setcapture === "Demo") return;
    // --- Essentials Deluxe (Battle_Misc.rb:293) ---
    for (const pkmn of this.caughtPokemon) {
      this.pbSetCaught(pkmn);
      this.pbSetSeen(pkmn); // In case the form changed upon leaving battle
      // Record the Pokémon's species as owned in the Pokédex
      if (!this.pbPlayer().owned(pkmn.species)) {
        this.pbPlayer().pokedex.setOwned(pkmn.species);
        if ((G.player as unknown as Player).hasPokedex) {
          await this.pbDisplayPaused(_INTL("{1}'s data was added to the Pokédex.", pkmn.name));
          this.pbPlayer().pokedex.registerLastSeen(pkmn);
          await this.scene.pbShowPokedex(pkmn.species);
        }
      }
      // Record a Shadow Pokémon's species as having been caught
      if (pkmn.shadowPokemon()) this.pbPlayer().pokedex.setShadowPokemonOwned(pkmn.speciesData().id);
      // Store caught Pokémon
      await this.pbStorePokemon(pkmn);
    }
    this.caughtPokemon.length = 0;
  },

  //=============================================================================
  // Throw a Poké Ball
  //=============================================================================
  async pbThrowPokeBall(this: Battle, idxBattler: number, ball: Id, catchRate: number | null = null,
    showPlayer = false): Promise<void> {
    // Essentials Deluxe (Midbattle_Triggers.rb:235): mid-battle triggers during the capture process
    const dxBattler = this.opposes(idxBattler) ? this.battlers[idxBattler]!
      : this.battlers[idxBattler]!.pbDirectOpposing(true);
    const personalID = dxBattler.pokemon!.personalID;
    let triggers = ["captureAttempt", "captureAttempt" + dxBattler.species];
    const types = dxBattler.pokemon!.types();
    for (const t of types) triggers.push("captureAttempt" + t);
    await this.scene.pbDeluxeTriggers?.(null, dxBattler.index, triggers);
    // --- Essentials ---
    core: {
      // Determine which Pokémon you're throwing the Poké Ball at
      let battler: Battler;
      if (this.opposes(idxBattler)) {
        battler = this.battlers[idxBattler]!;
      } else {
        battler = this.battlers[idxBattler]!.pbDirectOpposing(true);
      }
      if (battler.fainted()) battler = battler.allAllies()[0]!;
      // Messages
      const itemName = Item.get(ball).name;
      if (battler.fainted()) {
        if (startsWithVowel(itemName)) {
          await this.pbDisplay(_INTL("{1} threw an {2}!", this.pbPlayer().name, itemName));
        } else {
          await this.pbDisplay(_INTL("{1} threw a {2}!", this.pbPlayer().name, itemName));
        }
        await this.pbDisplay(_INTL("But there was no target..."));
        break core;
      }
      if (startsWithVowel(itemName)) {
        await this.pbDisplayBrief(_INTL("{1} threw an {2}!", this.pbPlayer().name, itemName));
      } else {
        await this.pbDisplayBrief(_INTL("{1} threw a {2}!", this.pbPlayer().name, itemName));
      }
      // Animation of opposing trainer blocking Poké Balls (unless it's a Snag Ball
      // at a Shadow Pokémon)
      if (this.trainerBattle() && !(Item.get(ball).isSnagBall() && battler.shadowPokemon())) {
        await this.scene.pbThrowAndDeflect(ball, 1);
        await this.pbDisplay(_INTL("The Trainer blocked your Poké Ball! Don't be a thief!"));
        break core;
      }
      // Calculate the number of shakes (4=capture)
      const pkmn = battler.pokemon!;
      this.criticalCapture = false;
      const numShakes = this.pbCaptureCalc(pkmn, battler, catchRate, ball);
      PBDebug.log(`[Threw Poké Ball] ${itemName}, ${numShakes} shakes (4=capture)`);
      // Animation of Ball throw, absorb, shake and capture/burst out
      await this.scene.pbThrow(ball, numShakes, this.criticalCapture, battler.index, showPlayer);
      // Outcome message
      switch (numShakes) {
        case 0:
          await this.pbDisplay(_INTL("Oh no! The Pokémon broke free!"));
          PokeBallEffects.onFailCatch(ball, this, battler);
          break;
        case 1:
          await this.pbDisplay(_INTL("Aww! It appeared to be caught!"));
          PokeBallEffects.onFailCatch(ball, this, battler);
          break;
        case 2:
          await this.pbDisplay(_INTL("Aargh! Almost had it!"));
          PokeBallEffects.onFailCatch(ball, this, battler);
          break;
        case 3:
          await this.pbDisplay(_INTL("Gah! It was so close, too!"));
          PokeBallEffects.onFailCatch(ball, this, battler);
          break;
        case 4:
          await this.pbDisplayBrief(_INTL("Gotcha! {1} was caught!", pkmn.name));
          await this.scene.pbThrowSuccess(); // Play capture success jingle
          this.pbRemoveFromParty(battler.index, battler.pokemonIndex);
          // Gain Exp
          if (Settings.GAIN_EXP_FOR_CAPTURE) {
            battler.captured = true;
            await this.pbGainExp();
            battler.captured = false;
          }
          battler.pbReset();
          if (this.pbAllFainted(battler.index)) {
            this.decision = this.trainerBattle() ? 1 : 4; // Battle ended by win/capture
          }
          // Modify the Pokémon's properties because of the capture
          if (Item.get(ball).isSnagBall()) {
            pkmn.owner = PokemonOwner.newFromTrainer(this.pbPlayer());
          }
          PokeBallEffects.onCatch(ball, this, pkmn);
          pkmn.pokeBall = ball;
          if (pkmn.mega()) pkmn.makeUnmega();
          pkmn.makeUnprimal();
          if (pkmn.shadowPokemon()) pkmn.updateShadowMoves();
          pkmn.recordFirstMoves();
          // Reset form
          if (MultipleForms.hasFunction(pkmn.species, "getForm")) pkmn.forcedForm = null;
          this.peer.pbOnLeavingBattle(this, pkmn, true, true);
          // Make the Poké Ball and data box disappear
          await this.scene.pbHideCaptureBall(idxBattler);
          // Save the Pokémon for storage at the end of battle
          this.caughtPokemon.push(pkmn);
          break;
      }
      if (numShakes !== 4) {
        if (!this.pokeBallFailed) this.firstPokeBall = ball;
        this.pokeBallFailed = true;
      }
    }
    // Essentials Deluxe: capture success/failure triggers
    const captured = this.caughtPokemon.some((p) => p.personalID === personalID);
    if (captured) {
      triggers = ["captureSuccess", "captureSuccess" + dxBattler.species];
      for (const t of types) triggers.push("captureSuccess" + t);
      await this.scene.pbDeluxeTriggers?.(null, null, triggers);
    } else {
      triggers = ["captureFailure", "captureFailure" + dxBattler.species];
      for (const t of types) triggers.push("captureFailure" + t);
      await this.scene.pbDeluxeTriggers?.(null, null, triggers);
    }
  },

  //=============================================================================
  // Calculate how many shakes a thrown Poké Ball will make (4 = capture)
  // (Essentials Deluxe's alias, Battle_Deluxe.rb:403: the [:setcapture] rule
  // decides the outcome)
  //=============================================================================
  pbCaptureCalc(this: Battle, pkmn: Pokemon, battler: Battler, catchRate: number | null, ball: Id): number {
    const rules = dxRules();
    let ret: number;
    if (rules && rules.setcapture != null) {
      ret = rules.setcapture !== false ? 4 : 0;
    } else {
      ret = captureCalcCore(this, pkmn, battler, catchRate, ball);
    }
    if (ret === 4) this.pokeBallFailed = false;
    return ret;
  },
};

type Methods = typeof methods;
declare module "../battle/Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
