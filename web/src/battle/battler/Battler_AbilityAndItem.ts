// Port of Data/Scripts/011_Battle/002_Battler/006_Battler_AbilityAndItem.rb, with:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb): pbContinualAbilityChecks
//   (Commander, Protean/Libero reset, Legend Plate type, Ability Shield vs.
//   Trace, Opportunist/Mirror Herb) and the new pbItemOpposingStatGainCheck
//   (Mirror Herb); ([001] Battle/[006] Legend Plate Functions.rb:175):
//   pbGetJudgmentType, hasLegendPlateJudgment?.
// Alias chain: pbContinualAbilityChecks = Gen 9( core ).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Ability } from "../../data/gameData/ability";
import { Item } from "../../data/gameData/item";
import { Settings } from "../../data/gameData/settings";
import { Effectiveness } from "../../data/gameData/type";
import { Scene } from "../BattleSceneInterface";
import { type Move, MoveClasses } from "../move/Move";
import { AbilityEffects, type DamageMultipliers } from "../other/AbilityEffects";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";

/** An item to use: an item ID, a GameData::Item, or nil. */
type ItemRef = Id | Item | null;

/** Core Essentials' pbContinualAbilityChecks. */
async function continualAbilityChecksCore(b: Battler, onSwitchIn: boolean): Promise<void> {
  const battle = b.battle;
  // Check for end of primordial weather
  await battle.pbEndPrimordialWeather();
  // Trace
  if (b.hasActiveAbility("TRACE")) {
    // NOTE: In Gen 5 only, Trace only triggers upon the Trace bearer switching
    //       in and not at any later times, even if a traceable ability turns
    //       up later. Essentials ignores this, and allows Trace to trigger
    //       whenever it can even in Gen 5 battle mechanics.
    const choices = battle.allOtherSideBattlers(b.index).filter((ob) =>
      !ob.ungainableAbility() &&
      !["POWEROFALCHEMY", "RECEIVER", "TRACE"].includes(ob.abilityId!));
    if (choices.length > 0) {
      const choice = choices[battle.pbRandom(choices.length)]!;
      await battle.pbShowAbilitySplash(b);
      b.ability = choice.ability;
      await battle.pbDisplay(_INTL("{1} traced {2}'s {3}!", b.pbThis(), choice.pbThis(true), choice.abilityName()));
      await battle.pbHideAbilitySplash(b);
      if (!onSwitchIn && (b.unstoppableAbility() || b.abilityActive())) {
        await AbilityEffects.triggerOnSwitchIn(b.ability, b, battle);
      }
    }
  }
}

const methods = {
  //=============================================================================
  // Ability trigger checks
  //=============================================================================
  async pbAbilitiesOnSwitchOut(this: Battler): Promise<void> {
    if (this.abilityActive()) {
      await AbilityEffects.triggerOnSwitchOut(this.ability, this, false);
    }
    // Reset form
    // NOTE: Ruby indexes usedInBattle with @index / 2 (not @pokemonIndex).
    this.battle.peer.pbOnLeavingBattle(this.battle, this.pokemon,
      this.battle.usedInBattle[this.idxOwnSide()]![Math.floor(this.index / 2)] ?? false);
    // Treat self as fainted
    this._hp = 0;
    this.faintedProperly = true;
    // Check for end of Neutralizing Gas/Unnerve
    if (this.hasActiveAbility("NEUTRALIZINGGAS", true)) await this.pbAbilitiesOnNeutralizingGasEnding();
    if (this.hasActiveAbility("UNNERVE", true)) await this.pbItemsOnUnnerveEnding();
    // Check for end of primordial weather
    await this.battle.pbEndPrimordialWeather();
  },

  async pbAbilitiesOnFainting(this: Battler): Promise<void> {
    // Self fainted; check all other battlers to see if their abilities trigger
    for (const b of this.battle.pbPriority(true)) {
      if (!b || !b.abilityActive()) continue;
      await AbilityEffects.triggerChangeOnBattlerFainting(b.ability, b, this, this.battle);
    }
    for (const b of this.battle.pbPriority(true)) {
      if (!b || !b.abilityActive()) continue;
      await AbilityEffects.triggerOnBattlerFainting(b.ability, b, this, this.battle);
    }
    if (this.hasActiveAbility("NEUTRALIZINGGAS", true)) await this.pbAbilitiesOnNeutralizingGasEnding();
    if (this.hasActiveAbility("UNNERVE", true)) await this.pbItemsOnUnnerveEnding();
  },

  /** Used for Emergency Exit/Wimp Out. Returns whether self has switched out. */
  async pbAbilitiesOnDamageTaken(this: Battler, moveUser: Battler | null = null): Promise<boolean> {
    if (!this.droppedBelowHalfHP) return false;
    if (!this.abilityActive()) return false;
    return AbilityEffects.triggerOnHPDroppedBelowHalf(this.ability, this, moveUser, this.battle);
  },

  async pbAbilityOnTerrainChange(this: Battler, abilityChanged = false): Promise<void> {
    if (!this.abilityActive()) return;
    await AbilityEffects.triggerOnTerrainChange(this.ability, this, this.battle, abilityChanged);
  },

  /** Used for Rattled's Gen 8 effect. Called when Intimidate is triggered. */
  async pbAbilitiesOnIntimidated(this: Battler): Promise<void> {
    if (!this.abilityActive()) return;
    await AbilityEffects.triggerOnIntimidated(this.ability, this, this.battle);
  },

  async pbAbilitiesOnNeutralizingGasEnding(this: Battler): Promise<void> {
    if (this.battle.pbCheckGlobalAbility("NEUTRALIZINGGAS")) return;
    await this.battle.pbDisplay(_INTL("The effects of the neutralizing gas wore off!"));
    await this.battle.pbEndPrimordialWeather();
    for (const b of this.battle.pbPriority(true)) {
      if (b.fainted()) continue;
      if (!b.unstoppableAbility() && !b.abilityActive()) continue;
      await AbilityEffects.triggerOnSwitchIn(b.ability, b, this.battle);
    }
  },

  /**
   * Called when a Pokémon (self) enters battle, at the end of each move used,
   * and at the end of each round.
   * Generation 9 Pack: Commander, resets Protean/Libero, updates the Legend
   * Plate type, Ability Shield stops Trace, and opposing Opportunist/Mirror Herb.
   */
  async pbContinualAbilityChecks(this: Battler, onSwitchIn = false): Promise<void> {
    // Generation 9 Pack
    await this.battle.pbEndPrimordialWeather();
    if (this.hasActiveAbility("COMMANDER")) {
      await AbilityEffects.triggerOnSwitchIn(this.ability, this, this.battle);
    }
    this.proteanTrigger = false;
    const plateType = await this.pbGetJudgmentType(this.legendPlateType);
    this.legendPlateType = plateType;
    if (this.hasActiveAbility("TRACE") && this.hasActiveItem("ABILITYSHIELD")) {
      await this.battle.pbShowAbilitySplash(this);
      await this.battle.pbDisplay(_INTL("{1}'s Ability is protected by the effects of its Ability Shield!", this.pbThis()));
      await this.battle.pbHideAbilitySplash(this);
    } else {
      // Essentials
      await continualAbilityChecksCore(this, onSwitchIn);
    }
    // Generation 9 Pack
    await this.pbMirrorStatUpsOpposing();
  },

  //=============================================================================
  // Generation 9 Pack ([006] Legend Plate Functions.rb:175)
  //=============================================================================
  /**
   * Type setter. Saves an ideal type to the user's @legendPlateType attribute.
   * This attribute is continually reset throughout the battle to keep it updated
   * based on what's most optimal at each stage of the fight.
   * *Note: Only the player's Pokemon has this attribute calculated continuously
   * so that the type icon displayed in the fight window can be updated. Opponents
   * don't need this, so it'll only return :NORMAL until actually using the move.
   * (Battle#pbGetBestTypeJudgment is async: it calls the MoveImmunity trigger.)
   */
  async pbGetJudgmentType(this: Battler, checkType: Id | null = null): Promise<Id> {
    if (this.pbOwnedByPlayer() && this.hasLegendPlateJudgment()) {
      let target: Battler | null = null;
      for (const i of this.battle.pbGetOpposingIndicesInOrder(this.index)) {
        const battler = this.battle.battlers[i];
        if (!battler || battler.fainted() || battler.isCommander()) continue;
        target = battler;
        break;
      }
      // Battle#pbGetBestTypeJudgment: battle/Battle_LegendPlate.ts.
      return (await this.battle.pbGetBestTypeJudgment(this, target, null, checkType)) || "NORMAL";
    }
    return "NORMAL";
  },

  /** hasLegendPlateJudgment? — used to simplify checking for a valid Pokemon using the Legend Plate. */
  hasLegendPlateJudgment(this: Battler): boolean {
    return this.isSpecies("ARCEUS") &&
      this.hasActiveAbility("MULTITYPE") &&
      this.hasActiveItem("LEGENDPLATE") &&
      this.pbHasMove("JUDGMENT");
  },

  //=============================================================================
  // Ability curing
  //=============================================================================
  /** Cures status conditions, confusion and infatuation. */
  async pbAbilityStatusCureCheck(this: Battler): Promise<void> {
    if (this.abilityActive()) {
      await AbilityEffects.triggerStatusCure(this.ability, this);
    }
  },

  //=============================================================================
  // Ability effects
  //=============================================================================
  /**
   * For abilities that grant immunity to moves of a particular type, and raises
   * one of the ability's bearer's stats instead.
   */
  async pbMoveImmunityStatRaisingAbility(this: Battler, user: Battler, move: Move, moveType: Id, immuneType: Id,
    stat: Id, increment: number, showMessage: boolean): Promise<boolean> {
    if (user.index === this.index) return false;
    if (moveType !== immuneType) return false;
    // NOTE: If show_message is false (Dragon Darts only), the stat will not be
    //       raised. This is not how the official games work, but I'm considering
    //       that a bug because Dragon Darts won't be fired at self in the first
    //       place if it's immune, so why would this ability be triggered by them?
    if (showMessage) {
      await this.battle.pbShowAbilitySplash(this);
      if (await this.pbCanRaiseStatStage(stat, this)) {
        if (Scene.USE_ABILITY_SPLASH) {
          await this.pbRaiseStatStage(stat, increment, this);
        } else {
          await this.pbRaiseStatStageByCause(stat, increment, this, this.abilityName());
        }
      } else if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", this.pbThis(true)));
      } else {
        await this.battle.pbDisplay(_INTL("{1}'s {2} made {3} ineffective!", this.pbThis(), this.abilityName(), move.name));
      }
      await this.battle.pbHideAbilitySplash(this);
    }
    return true;
  },

  /**
   * For abilities that grant immunity to moves of a particular type, and heals
   * the ability's bearer by 1/4 of its total HP instead.
   */
  async pbMoveImmunityHealingAbility(this: Battler, user: Battler, move: Move, moveType: Id, immuneType: Id,
    showMessage: boolean): Promise<boolean> {
    if (user.index === this.index) return false;
    if (moveType !== immuneType) return false;
    // NOTE: If show_message is false (Dragon Darts only), HP will not be healed.
    //       This is not how the official games work, but I'm considering that a
    //       bug because Dragon Darts won't be fired at self in the first place
    //       if it's immune, so why would this ability be triggered by them?
    if (showMessage) {
      await this.battle.pbShowAbilitySplash(this);
      if (this.canHeal() && await this.pbRecoverHP(Math.floor(this.totalhp / 4)) > 0) {
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", this.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1}'s {2} restored its HP.", this.pbThis(), this.abilityName()));
        }
      } else if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("It doesn't affect {1}...", this.pbThis(true)));
      } else {
        await this.battle.pbDisplay(_INTL("{1}'s {2} made {3} ineffective!", this.pbThis(), this.abilityName(), move.name));
      }
      await this.battle.pbHideAbilitySplash(this);
    }
    return true;
  },

  //=============================================================================
  // Ability change
  //=============================================================================
  async pbOnLosingAbility(this: Battler, oldAbil: Id | null, suppressed = false): Promise<void> {
    if (oldAbil === "NEUTRALIZINGGAS" && (suppressed || !this.effects[PBEffects.GastroAcid])) {
      await this.pbAbilitiesOnNeutralizingGasEnding();
    } else if (oldAbil === "UNNERVE" && (suppressed || !this.effects[PBEffects.GastroAcid])) {
      await this.pbItemsOnUnnerveEnding();
    } else if (oldAbil === "ILLUSION" && this.effects[PBEffects.Illusion]) {
      this.effects[PBEffects.Illusion] = null;
      if (!this.effects[PBEffects.Transform]) {
        this.battle.scene.pbChangePokemon(this, this.pokemon!);
        await this.battle.pbDisplay(_INTL("{1}'s {2} wore off!", this.pbThis(), Ability.get(oldAbil).name));
        this.battle.pbSetSeen(this);
      }
    }
    if (this.unstoppableAbility()) this.effects[PBEffects.GastroAcid] = false;
    if (this.abilityId !== "SLOWSTART") this.effects[PBEffects.SlowStart] = 0;
    if (this.abilityId !== "TRUANT") this.effects[PBEffects.Truant] = false;
    // Check for end of primordial weather
    await this.battle.pbEndPrimordialWeather();
    // Revert form if Flower Gift/Forecast was lost
    await this.pbCheckFormOnWeatherChange(true);
    // Abilities that trigger when the terrain changes
    await this.pbAbilityOnTerrainChange(true);
  },

  async pbTriggerAbilityOnGainingIt(this: Battler): Promise<void> {
    // Ending primordial weather, checking Trace
    await this.pbContinualAbilityChecks(true); // Don't trigger Traced ability as it's triggered below
    // Abilities that trigger upon switching in
    if ((!this.fainted() && this.unstoppableAbility()) || this.abilityActive()) {
      await AbilityEffects.triggerOnSwitchIn(this.ability, this, this.battle);
    }
    // Status-curing ability check
    await this.pbAbilityStatusCureCheck();
    // Check for end of primordial weather
    await this.battle.pbEndPrimordialWeather();
  },

  //=============================================================================
  // Held item consuming/removing
  //=============================================================================
  /** canConsumeBerry? */
  canConsumeBerry(this: Battler): boolean {
    if (this.battle.pbCheckOpposingAbility("UNNERVE", this.index)) return false;
    return true;
  },

  /** canConsumePinchBerry? */
  canConsumePinchBerry(this: Battler, checkGluttony = true): boolean {
    if (!this.canConsumeBerry()) return false;
    if (this._hp <= Math.floor(this.totalhp / 4)) return true;
    if (this._hp <= Math.floor(this.totalhp / 2) && (!checkGluttony || this.hasActiveAbility("GLUTTONY"))) return true;
    return false;
  },

  /**
   * permanent is whether the item is lost even after battle. Is false for Knock
   * Off.
   */
  pbRemoveItem(this: Battler, permanent = true): void {
    if (!this.hasActiveAbility("GORILLATACTICS")) this.effects[PBEffects.ChoiceBand] = null;
    if (this.item && this.hasActiveAbility("UNBURDEN")) this.effects[PBEffects.Unburden] = true;
    if (permanent && this.itemId === this.initialItem()) this.setInitialItem(null);
    this.item = null;
  },

  async pbConsumeItem(this: Battler, recoverable = true, symbiosis = true, belch = true): Promise<void> {
    PBDebug.log(`[Item consumed] ${this.pbThis()} consumed its held ${this.itemName()}`);
    if (recoverable) {
      this.setRecycleItem(this.itemId);
      this.effects[PBEffects.PickupItem] = this.itemId;
      this.effects[PBEffects.PickupUse] = this.battle.nextPickupUse();
    }
    if (belch && this.item!.isBerry()) this.setBelched();
    this.pbRemoveItem();
    if (symbiosis) await this.pbSymbiosis();
  },

  async pbSymbiosis(this: Battler): Promise<void> {
    if (this.fainted()) return;
    if (this.item) return;
    for (const b of this.battle.pbPriority(true)) {
      if (b.opposes(this)) continue;
      if (!b.hasActiveAbility("SYMBIOSIS")) continue;
      if (!b.item || b.unlosableItem(b.item)) continue;
      if (this.unlosableItem(b.item)) continue;
      await this.battle.pbShowAbilitySplash(b);
      if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("{1} shared its {2} with {3}!",
          b.pbThis(), b.itemName(), this.pbThis(true)));
      } else {
        await this.battle.pbDisplay(_INTL("{1}'s {2} let it share its {3} with {4}!",
          b.pbThis(), b.abilityName(), b.itemName(), this.pbThis(true)));
      }
      this.item = b.item;
      b.item = null;
      if (b.hasActiveAbility("UNBURDEN")) b.effects[PBEffects.Unburden] = true;
      await this.battle.pbHideAbilitySplash(b);
      await this.pbHeldItemTriggerCheck();
      break;
    }
  },

  /**
   * item_to_use is an item ID or GameData::Item object. own_item is whether the
   * item is held by self. fling is for Fling only.
   */
  async pbHeldItemTriggered(this: Battler, itemToUse: Id | Item, ownItem = true, fling = false): Promise<void> {
    // Cheek Pouch
    if (this.hasActiveAbility("CHEEKPOUCH") && Item.get(itemToUse).isBerry() && this.canHeal()) {
      await this.battle.pbShowAbilitySplash(this);
      await this.pbRecoverHP(Math.floor(this.totalhp / 3));
      if (Scene.USE_ABILITY_SPLASH) {
        await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", this.pbThis()));
      } else {
        await this.battle.pbDisplay(_INTL("{1}'s {2} restored its HP.", this.pbThis(), this.abilityName()));
      }
      await this.battle.pbHideAbilitySplash(this);
    }
    if (ownItem) await this.pbConsumeItem();
    if (!ownItem && !fling) await this.pbSymbiosis(); // Bug Bite/Pluck users trigger Symbiosis
  },

  //=============================================================================
  // Held item trigger checks
  //=============================================================================
  /**
   * NOTE: A Pokémon using Bug Bite/Pluck, and a Pokémon having an item thrown at
   *       it via Fling, will gain the effect of the item even if the Pokémon is
   *       affected by item-negating effects.
   * item_to_use is an item ID for Bug Bite/Pluck and Fling, and nil otherwise.
   * fling is for Fling only.
   */
  async pbHeldItemTriggerCheck(this: Battler, itemToUse: ItemRef = null, fling = false): Promise<void> {
    if (this.fainted()) return;
    if (!itemToUse && !this.itemActive()) return;
    await this.pbItemHPHealCheck(itemToUse, fling);
    await this.pbItemStatusCureCheck(itemToUse, fling);
    await this.pbItemEndOfMoveCheck(itemToUse, fling);
    // For Enigma Berry, Kee Berry and Maranga Berry, which have their effects
    // when forcibly consumed by Pluck/Fling.
    if (itemToUse) {
      const itm = itemToUse ?? this.item;
      if (await ItemEffects.triggerOnBeingHitPositiveBerry(itm, this, this.battle, true)) {
        await this.pbHeldItemTriggered(itm, false, fling);
      }
    }
  },

  /**
   * item_to_use is an item ID for Bug Bite/Pluck and Fling, and nil otherwise.
   * fling is for Fling only.
   */
  async pbItemHPHealCheck(this: Battler, itemToUse: ItemRef = null, fling = false): Promise<void> {
    if (!itemToUse && !this.itemActive()) return;
    const itm = itemToUse ?? this.item;
    if (await ItemEffects.triggerHPHeal(itm, this, this.battle, itemToUse != null)) {
      await this.pbHeldItemTriggered(itm!, itemToUse == null, fling);
    } else if (!itemToUse) {
      await this.pbItemTerrainStatBoostCheck();
    }
  },

  /**
   * Cures status conditions, confusion, infatuation and the other effects cured
   * by Mental Herb.
   * item_to_use is an item ID for Bug Bite/Pluck and Fling, and nil otherwise.
   * fling is for Fling only.
   */
  async pbItemStatusCureCheck(this: Battler, itemToUse: ItemRef = null, fling = false): Promise<void> {
    if (this.fainted()) return;
    if (!itemToUse && !this.itemActive()) return;
    const itm = itemToUse ?? this.item;
    if (await ItemEffects.triggerStatusCure(itm, this, this.battle, itemToUse != null)) {
      await this.pbHeldItemTriggered(itm!, itemToUse == null, fling);
    }
  },

  /**
   * Called at the end of using a move.
   * item_to_use is an item ID for Bug Bite/Pluck and Fling, and nil otherwise.
   * fling is for Fling only.
   */
  async pbItemEndOfMoveCheck(this: Battler, itemToUse: ItemRef = null, fling = false): Promise<void> {
    if (this.fainted()) return;
    if (!itemToUse && !this.itemActive()) return;
    const itm = itemToUse ?? this.item;
    if (await ItemEffects.triggerOnEndOfUsingMove(itm, this, this.battle, itemToUse != null)) {
      await this.pbHeldItemTriggered(itm!, itemToUse == null, fling);
    } else if (await ItemEffects.triggerOnEndOfUsingMoveStatRestore(itm, this, this.battle, itemToUse != null)) {
      await this.pbHeldItemTriggered(itm!, itemToUse == null, fling);
    }
  },

  /**
   * Used for White Herb (restore lowered stats). Only called by Moody and Sticky
   * Web, as all other stat reduction happens because of/during move usage and
   * this handler is also called at the end of each move's usage.
   * item_to_use is an item ID for Bug Bite/Pluck and Fling, and nil otherwise.
   * fling is for Fling only.
   */
  async pbItemStatRestoreCheck(this: Battler, itemToUse: ItemRef = null, fling = false): Promise<void> {
    if (this.fainted()) return;
    if (!itemToUse && !this.itemActive()) return;
    const itm = itemToUse ?? this.item;
    if (await ItemEffects.triggerOnEndOfUsingMoveStatRestore(itm, this, this.battle, itemToUse != null)) {
      await this.pbHeldItemTriggered(itm!, itemToUse == null, fling);
    }
  },

  /** Called when the battle terrain changes and when a Pokémon loses HP. */
  async pbItemTerrainStatBoostCheck(this: Battler): Promise<void> {
    if (!this.itemActive()) return;
    if (await ItemEffects.triggerTerrainStatBoost(this.item, this, this.battle)) {
      await this.pbHeldItemTriggered(this.item!);
    }
  },

  /**
   * Used for Adrenaline Orb. Called when Intimidate is triggered (even if
   * Intimidate has no effect on the Pokémon).
   */
  async pbItemOnIntimidatedCheck(this: Battler): Promise<void> {
    if (!this.itemActive()) return;
    if (await ItemEffects.triggerOnIntimidated(this.item, this, this.battle)) {
      await this.pbHeldItemTriggered(this.item!);
    }
  },

  /** Used for Eject Pack. Returns whether self has switched out. */
  async pbItemOnStatDropped(this: Battler, moveUser: Battler | null = null): Promise<boolean> {
    if (!this.statsDropped) return false;
    if (!this.itemActive()) return false;
    return ItemEffects.triggerOnStatLoss(this.item, this, moveUser, this.battle);
  },

  async pbItemsOnUnnerveEnding(this: Battler): Promise<void> {
    for (const b of this.battle.pbPriority(true)) {
      if (b.item?.isBerry()) await b.pbHeldItemTriggerCheck();
    }
  },

  /**
   * Generation 9 Pack ([002] Battle_Battler.rb:151): used for triggering and
   * consuming Mirror Herb.
   */
  async pbItemOpposingStatGainCheck(this: Battler, statUps: Record<Id, number>, itemToUse: ItemRef = null): Promise<void> {
    if (this.fainted()) return;
    if (!itemToUse && !this.itemActive()) return;
    const itm = itemToUse ?? this.item;
    if (await ItemEffects.triggerOnOpposingStatGain(itm, this, this.battle, statUps, !itemToUse)) {
      await this.pbHeldItemTriggered(itm!, itemToUse == null, false);
    }
  },

  //=============================================================================
  // Item effects
  //=============================================================================
  async pbConfusionBerry(this: Battler, itemToUse: Id | Item, forced: boolean, flavor: number,
    confuseMsg: string): Promise<boolean> {
    if (!forced && !this.canHeal()) return false;
    if (!forced && !this.canConsumePinchBerry(Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7)) return false;
    const usedItemName = Item.get(itemToUse).name;
    let fractionToHeal = 8; // Gens 6 and lower
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME === 7) {
      fractionToHeal = 2;
    } else if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 8) {
      fractionToHeal = 3;
    }
    let amt = Math.floor(this.totalhp / fractionToHeal);
    let ripening = false;
    if (this.hasActiveAbility("RIPEN")) {
      await this.battle.pbShowAbilitySplash(this, forced);
      amt *= 2;
      ripening = true;
    }
    if (!forced) await this.battle.pbCommonAnimation("EatBerry", this);
    if (ripening) await this.battle.pbHideAbilitySplash(this);
    amt = await this.pbRecoverHP(amt);
    if (amt > 0) {
      if (forced) {
        PBDebug.log(`[Item triggered] Forced consuming of ${usedItemName}`);
        await this.battle.pbDisplay(_INTL("{1}'s HP was restored.", this.pbThis()));
      } else {
        await this.battle.pbDisplay(_INTL("{1} restored its health using its {2}!", this.pbThis(), usedItemName));
      }
    }
    const flavorStat = ["ATTACK", "DEFENSE", "SPEED", "SPECIAL_ATTACK", "SPECIAL_DEFENSE"][flavor];
    for (const change of this.nature()!.statChanges) {
      if (change[1] > 0 || change[0] !== flavorStat) continue;
      await this.battle.pbDisplay(confuseMsg);
      if (this.pbCanConfuseSelf(false)) await this.pbConfuse();
      break;
    }
    return true;
  },

  async pbStatIncreasingBerry(this: Battler, itemToUse: Id | Item, forced: boolean, stat: Id,
    increment = 1): Promise<boolean> {
    if (!forced && !this.canConsumePinchBerry()) return false;
    if (!await this.pbCanRaiseStatStage(stat, this)) return false;
    const usedItemName = Item.get(itemToUse).name;
    let ripening = false;
    if (this.hasActiveAbility("RIPEN")) {
      await this.battle.pbShowAbilitySplash(this, forced);
      increment *= 2;
      ripening = true;
    }
    if (!forced) await this.battle.pbCommonAnimation("EatBerry", this);
    if (ripening) await this.battle.pbHideAbilitySplash(this);
    if (!forced) return this.pbRaiseStatStageByCause(stat, increment, this, usedItemName);
    PBDebug.log(`[Item triggered] Forced consuming of ${usedItemName}`);
    return this.pbRaiseStatStage(stat, increment, this);
  },

  /**
   * Called from (synchronous) DamageCalcFromTarget item handlers during damage
   * calculation, so this is sync: the multipliers and berryWeakened are set
   * immediately, and the ability splash/EatBerry animation are queued for
   * Move#pbCalcDamage to play straight after the calculation.
   */
  pbMoveTypeWeakeningBerry(this: Battler, berryType: Id, moveType: Id, mults: DamageMultipliers): void {
    if (moveType !== berryType) return;
    if (!Effectiveness.superEffective(this.damageState.typeMod) && moveType !== "NORMAL") return;
    mults.final_damage_multiplier! /= 2;
    this.damageState.berryWeakened = true;
    let ripening = false;
    if (this.hasActiveAbility("RIPEN")) {
      mults.final_damage_multiplier! /= 2;
      ripening = true;
    }
    this.battle.pendingSceneEffects.push(async () => {
      if (ripening) await this.battle.pbShowAbilitySplash(this);
      await this.battle.pbCommonAnimation("EatBerry", this);
      if (ripening) await this.battle.pbHideAbilitySplash(this);
    });
  },

  pbMoveTypePoweringUpGem(this: Battler, gemType: Id, move: Move, moveType: Id, mults: DamageMultipliers): void {
    const pledgeMove = MoveClasses.get("PledgeMove");
    if (pledgeMove && move instanceof pledgeMove) return; // Pledge moves never consume Gems
    if (moveType !== gemType) return;
    this.effects[PBEffects.GemConsumed] = this.itemId;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      mults.base_damage_multiplier! *= 1.3;
    } else {
      mults.base_damage_multiplier! *= 1.5;
    }
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
