// Port of Data/Scripts/011_Battle/001_Battle/008_Battle_ActionOther.rb
// - Essentials Deluxe ([000] Essentials Patches/Mega Evolution.rb:119-235): pbHasMegaRing? (wild
//   Pokémon don't need one), pbCanMegaEvolve? (wild Pokémon may Mega Evolve), pbMegaEvolve,
//   pbPrimalReversion (midbattle triggers, Deluxe animations, wild messages).
//   Mega Evolution/Mega Evolution.rb:281 also redefines pbMegaEvolve (its own SceneMegaEvolution
//   animation), but it loads before Essentials Deluxe, whose redefinition (no alias) replaces it.
// - Generation 9 Pack ([001] Battle/[001] Battle.rb:148): pbReviveInParty (Revival Blessing).
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb:93-134): pbSetBattleMechanicUsage,
//   pbCanUseBattleMechanic?; [001] Plugin Patches/_Custom Placeholder_.rb: custom mechanic placeholders.
// - ZUD Mechanics ([003] Battle/Battle.rb): Z-Rings, Dynamax Bands, registering Z-Moves/Ultra
//   Burst/Dynamax (the eligibility checks, pbUltraBurst and pbDynamax are in ../zud/Battle.ts).

import { _INTL } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import { Input } from "../../rgss/Input";
import type { Battler } from "../battler/Battler";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBEffects } from "../other/PBEffects";
import type { Move } from "../move/Move";
import { Battle } from "./Battle";
import { DEBUG } from "../../core/debug"; // $DEBUG

/** nil_or_empty? */
const nilOrEmpty = (s: string | null | undefined): boolean => s == null || s === "";

const methods = {
  //=============================================================================
  // Shifting a battler to another position in a battle larger than double
  //=============================================================================
  /** pbCanShift? */
  pbCanShift(this: Battle, idxBattler: number): boolean {
    if (this.pbSideSize(0) <= 2 && this.pbSideSize(1) <= 2) return false; // Double battle or smaller
    let idxOther = -1;
    switch (this.pbSideSize(idxBattler)) {
      case 1:
        return false; // Only one battler on that side
      case 2:
        idxOther = (idxBattler + 2) % 4;
        break;
      case 3:
        if ([2, 3].includes(idxBattler)) return false; // In middle spot already
        idxOther = idxBattler % 2 === 0 ? 2 : 3;
        break;
    }
    if (this.pbGetOwnerIndexFromBattlerIndex(idxBattler) !== this.pbGetOwnerIndexFromBattlerIndex(idxOther)) return false;
    return true;
  },

  pbRegisterShift(this: Battle, idxBattler: number): boolean {
    const choice = this.choices[idxBattler]!;
    choice[0] = "Shift";
    choice[1] = 0;
    choice[2] = null;
    return true;
  },

  //=============================================================================
  // Calling at a battler
  //=============================================================================
  pbRegisterCall(this: Battle, idxBattler: number): boolean {
    const choice = this.choices[idxBattler]!;
    choice[0] = "Call";
    choice[1] = 0;
    choice[2] = null;
    return true;
  },

  async pbCall(this: Battle, idxBattler: number): Promise<void> {
    const battler = this.battlers[idxBattler]!;
    const trainerName = this.pbGetOwnerName(idxBattler);
    await this.pbDisplay(_INTL("{1} called {2}!", trainerName, battler.pbThis(true)));
    await this.pbDisplay(_INTL("{1}!", battler.name));
    if (battler.shadowPokemon()) {
      if (battler.inHyperMode()) {
        battler.pokemon!.hyperMode = false;
        battler.pokemon!.changeHeartGauge("call");
        await this.pbDisplay(_INTL("{1} came to its senses from the Trainer's call!", battler.pbThis()));
      } else {
        await this.pbDisplay(_INTL("But nothing happened!"));
      }
    } else if (battler.status === "SLEEP") {
      await battler.pbCureStatus();
    } else if (await battler.pbCanRaiseStatStage("ACCURACY", battler)) {
      await battler.pbRaiseStatStage("ACCURACY", 1, battler);
      await battler.pbItemOnStatDropped();
    } else {
      await this.pbDisplay(_INTL("But nothing happened!"));
    }
  },

  //=============================================================================
  // Choosing to Mega Evolve a battler
  //=============================================================================
  /** pbHasMegaRing? */
  pbHasMegaRing(this: Battle, idxBattler: number): boolean {
    // Essentials Deluxe (Mega Evolution.rb:120): wild Pokémon don't need a Mega Ring
    if (this.battlers[idxBattler]!.wild()) return true;
    // --- Essentials ---
    if (this.pbOwnedByPlayer(idxBattler)) {
      for (const item of this.megaRings) if (G.bag.has(item)) return true;
    } else {
      const trainerItems = this.pbGetOwnerItems(idxBattler);
      if (!trainerItems) return false;
      for (const item of this.megaRings) if (trainerItems.includes(item)) return true;
    }
    return false;
  },

  pbGetMegaRingName(this: Battle, idxBattler: number): string {
    if (this.megaRings.length > 0) {
      if (this.pbOwnedByPlayer(idxBattler)) {
        for (const item of this.megaRings) if (G.bag.has(item)) return Item.get(item).name;
      } else {
        const trainerItems = this.pbGetOwnerItems(idxBattler);
        for (const item of this.megaRings) if (trainerItems?.includes(item)) return Item.get(item).name;
      }
    }
    return _INTL("Mega Ring");
  },

  /** pbCanMegaEvolve? — Essentials Deluxe's version (Mega Evolution.rb:125). */
  pbCanMegaEvolve(this: Battle, idxBattler: number): boolean {
    const battler = this.battlers[idxBattler]!;
    if (G.gameSwitches.get(Settings.NO_MEGA_EVOLUTION)) return false;
    if (!battler.hasMega()) return false;
    if (DEBUG && Input.press(Input.CTRL) && !battler.wild()) return true;
    if (battler.effects[PBEffects.SkyDrop] >= 0) return false;
    if (!this.pbHasMegaRing(idxBattler)) return false;
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.megaEvolution[side]![owner] === -1;
  },

  pbRegisterMegaEvolution(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.megaEvolution[side]![owner] = idxBattler;
  },

  pbUnregisterMegaEvolution(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.megaEvolution[side]![owner] === idxBattler) this.megaEvolution[side]![owner] = -1;
  },

  pbToggleRegisteredMegaEvolution(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.megaEvolution[side]![owner] === idxBattler) {
      this.megaEvolution[side]![owner] = -1;
    } else {
      this.megaEvolution[side]![owner] = idxBattler;
    }
  },

  /** pbRegisteredMegaEvolution? */
  pbRegisteredMegaEvolution(this: Battle, idxBattler: number): boolean {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.megaEvolution[side]![owner] === idxBattler;
  },

  //=============================================================================
  // Mega Evolving a battler (Essentials Deluxe's version, Mega Evolution.rb:137)
  //=============================================================================
  async pbMegaEvolve(this: Battle, idxBattler: number): Promise<void> {
    const battler = this.battlers[idxBattler];
    if (!battler || !battler.pokemon) return;
    if (!battler.hasMega() || battler.mega()) return;
    const triggers = ["mega", "mega" + battler.species];
    for (const t of battler.pokemon.types()) triggers.push("mega" + t);
    await this.scene.pbDeluxeTriggers?.(idxBattler, null, triggers);
    if (battler.pbOwnedByPlayer()) G.stats.megaEvolutionCount += 1;
    const oldAbility = battler.abilityId;
    // Break Illusion
    if (battler.hasActiveAbility("ILLUSION")) {
      await AbilityEffects.triggerOnBeingHit(battler.ability, null as unknown as Battler, battler,
        null as unknown as Move, this);
    }
    // Mega Evolve
    if (battler.wild()) {
      switch (battler.pokemon.megaMessage()) {
        case 1:
          await this.pbDisplay(_INTL("{1} radiates with Mega energy!", battler.pbThis()));
          break;
        default:
          await this.pbDisplay(_INTL("{1}'s {2} radiates with Mega energy!", battler.pbThis(), battler.itemName()));
      }
    } else {
      const trainerName = this.pbGetOwnerName(idxBattler);
      switch (battler.pokemon.megaMessage()) {
        case 1: // Rayquaza
          await this.pbDisplay(_INTL("{1}'s fervent wish has reached {2}!", trainerName, battler.pbThis()));
          break;
        default:
          await this.pbDisplay(_INTL("{1}'s {2} is reacting to {3}'s {4}!",
            battler.pbThis(), battler.itemName(), trainerName, this.pbGetMegaRingName(idxBattler)));
      }
    }
    if (this.scene.pbCommonAnimationExists?.("MegaEvolution")) {
      await this.pbCommonAnimation("MegaEvolution", battler);
      battler.pokemon.makeMega();
      battler.form = battler.pokemon.form;
      this.scene.pbChangePokemon(battler, battler.pokemon);
      await this.pbCommonAnimation("MegaEvolution2", battler);
    } else {
      if (Settings.SHOW_MEGA_ANIM && G.pokemonSystem.battlescene === 0) {
        await this.scene.pbShowMegaEvolution?.(idxBattler);
        battler.pokemon.makeMega();
        battler.form = battler.pokemon.form;
        this.scene.pbChangePokemon(battler, battler.pokemon);
      } else {
        await this.scene.pbRevertBattlerStart?.(idxBattler);
        battler.pokemon.makeMega();
        battler.form = battler.pokemon.form;
        this.scene.pbChangePokemon(battler, battler.pokemon);
        await this.scene.pbRevertBattlerEnd?.();
      }
    }
    battler.pbUpdate(true);
    this.scene.pbRefreshOne(idxBattler);
    let megaName = battler.pokemon.megaName();
    if (nilOrEmpty(megaName)) megaName = _INTL("Mega {1}", battler.pokemon.speciesName());
    await this.pbDisplay(_INTL("{1} has Mega Evolved into {2}!", battler.pbThis(), megaName));
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.megaEvolution[side]![owner] = -2;
    if (battler.isSpecies("GENGAR") && battler.mega()) {
      battler.effects[PBEffects.Telekinesis] = 0;
    }
    // Trigger ability
    await battler.pbOnLosingAbility(oldAbility);
    await battler.pbTriggerAbilityOnGainingIt();
    // Recalculate turn order
    if (Settings.RECALCULATE_TURN_ORDER_AFTER_MEGA_EVOLUTION) this.pbCalculatePriority(false, [idxBattler]);
  },

  //=============================================================================
  // Primal Reverting a battler (Essentials Deluxe's version, Mega Evolution.rb:202)
  //=============================================================================
  async pbPrimalReversion(this: Battle, idxBattler: number): Promise<void> {
    const battler = this.battlers[idxBattler];
    if (!battler || !battler.pokemon || battler.fainted()) return;
    if (!battler.hasPrimal() || battler.primal()) return;
    if (battler.pbOwnedByPlayer()) G.stats.primalReversionCount += 1;
    const triggers = ["primal", "primal" + battler.species];
    for (const t of battler.pokemon.types()) triggers.push("primal" + t);
    await this.scene.pbDeluxeTriggers?.(idxBattler, null, triggers);
    if (this.scene.pbCommonAnimationExists?.("PrimalKyogre") ||
        this.scene.pbCommonAnimationExists?.("PrimalGroudon")) {
      // NOTE: Only Kyogre and Groudon revert here (Ruby's `case battler.species`).
      switch (battler.species) {
        case "KYOGRE":
          await this.pbCommonAnimation("PrimalKyogre", battler);
          battler.pokemon.makePrimal();
          battler.form = battler.pokemon.form;
          this.scene.pbChangePokemon(battler, battler.pokemon);
          await this.pbCommonAnimation("PrimalKyogre2", battler);
          break;
        case "GROUDON":
          await this.pbCommonAnimation("PrimalGroudon", battler);
          battler.pokemon.makePrimal();
          battler.form = battler.pokemon.form;
          this.scene.pbChangePokemon(battler, battler.pokemon);
          await this.pbCommonAnimation("PrimalGroudon2", battler);
          break;
      }
    } else {
      if (Settings.SHOW_PRIMAL_ANIM && G.pokemonSystem.battlescene === 0) {
        await this.scene.pbShowPrimalReversion?.(idxBattler);
        battler.pokemon.makePrimal();
        battler.form = battler.pokemon.form;
        this.scene.pbChangePokemon(battler, battler.pokemon);
      } else {
        await this.scene.pbRevertBattlerStart?.(idxBattler);
        battler.pokemon.makePrimal();
        battler.form = battler.pokemon.form;
        this.scene.pbChangePokemon(battler, battler.pokemon);
        await this.scene.pbRevertBattlerEnd?.();
      }
    }
    battler.pbUpdate(true);
    this.scene.pbRefreshOne(idxBattler);
    await this.pbDisplay(_INTL("{1}'s Primal Reversion!\nIt reverted to its primal form!", battler.pbThis()));
  },

  //=============================================================================
  // Generation 9 Pack ([001] Battle.rb:148): used to revive a party Pokemon
  // with Revival Blessing.
  //=============================================================================
  async pbReviveInParty(this: Battle, idxBattler: number, canCancel = false): Promise<void> {
    let partyIndex = -1;
    if (this.pbOwnedByPlayer(idxBattler)) {
      await this.scene.pbPartyScreen(idxBattler, canCancel, 2, (idxParty) => {
        partyIndex = idxParty;
        return true;
      });
    } else {
      partyIndex = this.battleAI.pbDefaultChooseReviveEnemy(idxBattler, this.pbParty(idxBattler));
    }
    if (partyIndex < 0) return;
    const party = this.pbParty(idxBattler);
    const pkmn = party[partyIndex]!;
    pkmn.hp = Math.max(1, Math.floor(pkmn.totalhp / 2));
    pkmn.healStatus();
    const displayname = this.pbOwnedByPlayer(idxBattler) ? pkmn.name : _INTL("The opposing {1}", pkmn.name);
    await this.pbDisplay(_INTL("{1} was revived and is ready to fight again!", displayname));
  },

  //=============================================================================
  // Essentials Deluxe ([000] Essentials Patches/Battle.rb:93): battle mechanics
  //=============================================================================
  /** Tool for resetting a variety of specific battle mechanics. */
  pbSetBattleMechanicUsage(this: Battle, idxBattler: number, mode: number | string, set = -2): void {
    const battler = this.battlers[idxBattler];
    if (!battler || !battler.pokemon) return;
    const side = battler.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    // NOTE: @battleStyle/@terastallize/@zodiac are nil (their plugins aren't
    //       installed), so modes 4-6 raise an error in Ruby too.
    switch (mode) {
      case 0: case "Mega": this.megaEvolution[side]![owner] = set; break;
      case 1: case "Z-Move": this.zMove[side]![owner] = set; break;
      case 2: case "Ultra": this.ultraBurst[side]![owner] = set; break;
      case 3: case "Dynamax": this.dynamax[side]![owner] = set; break;
      case 4: case "Style": this.battleStyle![side]![owner] = set; break;
      case 5: case "Tera": this.terastallize![side]![owner] = set; break;
      case 6: case "Zodiac": this.zodiac![side]![owner] = set; break;
      case 7: case "Custom": if (this.custom) this.custom[side]![owner] = set; break;
    }
  },

  /** pbCanUseBattleMechanic? — checks if any battle mechanic is usable. */
  pbCanUseBattleMechanic(this: Battle, idxBattler: number): boolean {
    if (this.pbCanMegaEvolve(idxBattler)) return true;
    // PluginManager.installed?("ZUD Mechanics")
    if (this.pbCanZMove(idxBattler)) return true;
    if (this.pbCanUltraBurst(idxBattler)) return true;
    if (this.pbCanDynamax(idxBattler)) return true;
    // "PLA Battle Styles", "Terastal Phenomenon", "Pokémon Birthsigns" and
    // "Focus Meter System" aren't installed.
    if (this.pbCanCustom(idxBattler)) return true;
    return false;
  },

  //-----------------------------------------------------------------------------
  // Essentials Deluxe ([001] Plugin Patches/_Custom Placeholder_.rb:28):
  // placeholder code for customized battle mechanics to be used by other plugins.
  //-----------------------------------------------------------------------------
  /** pbCanCustom? */
  pbCanCustom(this: Battle, _idxBattler: number): boolean { return false; },
  async pbCustomMechanic(this: Battle, _idxBattler: number): Promise<void> {},
  pbRegisterCustom(this: Battle, _idxBattler: number): void {},
  pbUnregisterCustom(this: Battle, _idxBattler: number): void {},
  pbToggleRegisteredCustom(this: Battle, _idxBattler: number): void {},
  /** pbRegisteredCustom? */
  pbRegisteredCustom(this: Battle, _idxBattler: number): boolean { return false; },

  //=============================================================================
  // ZUD Mechanics ([003] Battle/Battle.rb): Z-Rings
  //=============================================================================
  /** pbHasZRing? */
  pbHasZRing(this: Battle, idxBattler: number): boolean {
    if (this.battlers[idxBattler]!.wild()) return true;
    if (this.pbOwnedByPlayer(idxBattler)) {
      for (const item of this.zRings) if (G.bag.has(item)) return true;
    } else {
      const trainerItems = this.pbGetOwnerItems(idxBattler);
      if (!trainerItems) return false;
      for (const item of this.zRings) if (trainerItems.includes(item)) return true;
    }
    return false;
  },

  pbGetZRingName(this: Battle, idxBattler: number): string {
    if (this.zRings.length > 0) {
      if (this.pbOwnedByPlayer(idxBattler)) {
        for (const item of this.zRings) if (G.bag.has(item)) return Item.get(item).portionName;
      } else {
        const trainerItems = this.pbGetOwnerItems(idxBattler);
        for (const item of this.zRings) if (trainerItems?.includes(item)) return Item.get(item).portionName;
      }
    }
    return _INTL("Z-Ring");
  },

  //-----------------------------------------------------------------------------
  // Dynamax Bands
  //-----------------------------------------------------------------------------
  /** pbHasDynamaxBand? */
  pbHasDynamaxBand(this: Battle, idxBattler: number): boolean {
    if (this.battlers[idxBattler]!.wild()) return true;
    if (this.pbOwnedByPlayer(idxBattler)) {
      for (const item of this.dynamaxBands) if (G.bag.has(item)) return true;
    } else {
      const trainerItems = this.pbGetOwnerItems(idxBattler);
      if (!trainerItems) return false;
      for (const item of this.dynamaxBands) if (trainerItems.includes(item)) return true;
    }
    return false;
  },

  pbGetDynamaxBandName(this: Battle, idxBattler: number): string {
    if (this.dynamaxBands.length > 0) {
      if (this.pbOwnedByPlayer(idxBattler)) {
        // NOTE: name for the player, portion_name for other trainers (as in Ruby).
        for (const item of this.dynamaxBands) if (G.bag.has(item)) return Item.get(item).name;
      } else {
        const trainerItems = this.pbGetOwnerItems(idxBattler);
        for (const item of this.dynamaxBands) if (trainerItems?.includes(item)) return Item.get(item).portionName;
      }
    }
    return _INTL("Dynamax Band");
  },

  //-----------------------------------------------------------------------------
  // Eligibility checks (pbCanZMove?, pbCanUltraBurst?, pbCanDynamax?) and
  // pbUltraBurst/pbDynamax (Battle.rb:64-178): see ../zud/Battle.ts.
  //-----------------------------------------------------------------------------

  //-----------------------------------------------------------------------------
  // Registering Z-Moves.
  //-----------------------------------------------------------------------------
  pbRegisterZMove(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.zMove[side]![owner] = idxBattler;
  },

  pbUnregisterZMove(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.zMove[side]![owner] === idxBattler) this.zMove[side]![owner] = -1;
  },

  pbToggleRegisteredZMove(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.zMove[side]![owner] === idxBattler) {
      this.zMove[side]![owner] = -1;
    } else {
      this.zMove[side]![owner] = idxBattler;
    }
  },

  /** pbRegisteredZMove? */
  pbRegisteredZMove(this: Battle, idxBattler: number): boolean {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.zMove[side]![owner] === idxBattler;
  },

  //-----------------------------------------------------------------------------
  // Registering Ultra Burst.
  //-----------------------------------------------------------------------------
  pbRegisterUltraBurst(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.ultraBurst[side]![owner] = idxBattler;
  },

  pbUnregisterUltraBurst(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.ultraBurst[side]![owner] === idxBattler) this.ultraBurst[side]![owner] = -1;
  },

  pbToggleRegisteredUltraBurst(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.ultraBurst[side]![owner] === idxBattler) {
      this.ultraBurst[side]![owner] = -1;
    } else {
      this.ultraBurst[side]![owner] = idxBattler;
    }
  },

  /** pbRegisteredUltraBurst? */
  pbRegisteredUltraBurst(this: Battle, idxBattler: number): boolean {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.ultraBurst[side]![owner] === idxBattler;
  },

  //-----------------------------------------------------------------------------
  // Registering Dynamax
  //-----------------------------------------------------------------------------
  pbRegisterDynamax(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    this.dynamax[side]![owner] = idxBattler;
  },

  pbUnregisterDynamax(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.dynamax[side]![owner] === idxBattler) this.dynamax[side]![owner] = -1;
  },

  pbToggleRegisteredDynamax(this: Battle, idxBattler: number): void {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.dynamax[side]![owner] === idxBattler) {
      this.dynamax[side]![owner] = -1;
    } else {
      this.dynamax[side]![owner] = idxBattler;
    }
  },

  /** pbRegisteredDynamax? */
  pbRegisteredDynamax(this: Battle, idxBattler: number): boolean {
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return this.dynamax[side]![owner] === idxBattler;
  },
};

type Methods = typeof methods;
declare module "./Battle" {
  interface Battle extends Methods {}
}
Object.assign(Battle.prototype, methods);
