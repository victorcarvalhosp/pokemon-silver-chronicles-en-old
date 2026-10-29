// Port of Data/Scripts/011_Battle/002_Battler/001_Battle_Battler.rb
// (class Battle::Battler: fields, accessors and queries), with the plugin
// patches to these methods:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb): proteanTrigger,
//   mirrorHerbUsed, legendPlateType; ability_triggered?/num_times_hit/
//   num_fainted_allies; pbTypes (Double Shock); unstoppable/ungainable/
//   uncopyableAbility?, activeAbilityShield?, abilityActive? (Ability Shield,
//   Gen 9 Battle Bond/Protean); Commander; trappedInBattle?.
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb): base_moves,
//   power_trigger, ace?, name_title, plugin compatibility queries;
//   Mega Evolution.rb: hasMega?.
// - ZUD Mechanics ([004] Battle_Battler/Battler.rb): power_index,
//   ignore_dynamax, Z-Move/Ultra Burst/Dynamax queries, unmax;
//   Battler_Overrides.rb: pbEncoredMoveIndex, pbHasMove?.
//
// The rest of the class is in the other files of this folder (one per Ruby
// file); see ../index.ts.

import { Ability } from "../../data/gameData/ability";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import type { Nature } from "../../data/gameData/nature";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Type } from "../../data/gameData/type";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Player } from "../../game/trainer/Player";
import type { Battle } from "../battle/Battle";
import { Scene } from "../BattleSceneInterface";
import type { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import type { ActiveSide } from "../other/ActiveField";
import { DamageState } from "../other/DamageState";
import { ItemEffects } from "../other/ItemEffects";
import { type EffectsArray, PBEffects } from "../other/PBEffects";

export class Battler {
  // Fundamental to this object
  readonly battle: Battle;
  index: number;
  // The Pokémon and its properties
  pokemon: Pokemon | null = null;
  pokemonIndex = -1;
  species: Id = "";
  types: Id[] = [];
  abilityId: Id | null = null;
  itemId: Id | null = null;
  moves: Move[] = [];
  attack = 0;
  spatk = 0;
  speed = 0;
  stages: Record<Id, number> = {};
  totalhp = 0;
  /** Boolean to mark whether self has fainted properly (Ruby: @fainted; fainted? is hp <= 0) */
  faintedProperly = false;
  /** Boolean to mark whether self was captured */
  captured = false;
  dummy = false;
  effects: EffectsArray = [];
  // Things the battler has done in battle
  turnCount = 0;
  participants: number[] = [];
  lastAttacker: number[] = [];
  lastFoeAttacker: number[] = [];
  lastHPLost = 0;
  lastHPLostFromFoe = 0;
  lastMoveUsed: Id | null = null;
  lastMoveUsedType: Id | null = null;
  lastRegularMoveUsed: Id | null = null;
  /** For Instruct */
  lastRegularMoveTarget = -1;
  lastRoundMoved = -1;
  /** For Stomping Tantrum */
  lastMoveFailed = false;
  /** For Stomping Tantrum */
  lastRoundMoveFailed = false;
  movesUsed: Id[] = [];
  /** ID of multi-turn move currently being used */
  currentMove: Id | null = null;
  /** Used for Emergency Exit/Wimp Out */
  droppedBelowHalfHP = false;
  /** Used for Eject Pack */
  statsDropped = false;
  /** Boolean for whether self took damage this round */
  tookDamageThisRound = false;
  tookPhysicalHit = false;
  /** Boolean for whether self's stat(s) raised this round */
  statsRaisedThisRound = false;
  /** Boolean for whether self's stat(s) lowered this round */
  statsLoweredThisRound = false;
  /** Whether Hail started in the round */
  canRestoreIceFace = false;
  damageState: DamageState;

  // Ruby's instance variables behind the custom accessors above (public so the
  // other Battler_*.ts files can set them directly, as Ruby does with @level etc.).
  _name = "";
  _level = 0;
  _form = 0;
  _defense = 0;
  _spdef = 0;
  _hp = 0;
  _status: Id = "NONE";
  _statusCount = 0;

  // Generation 9 Pack
  /** Used to flag when it's okay for Protean/Libero to trigger. */
  proteanTrigger = false;
  /** Used to stop Opportunist/Mirror Herb from triggering off other Mirror Herbs. */
  mirrorHerbUsed = false;
  /** Stores the default type to display for Judgment when used with a Legend Plate. */
  legendPlateType: Id | null = null;

  // Essentials Deluxe
  /** The battler's moves before a plugin mechanic replaced them (Battle::Move or Pokemon::Move). */
  baseMoves: (Move | PokemonMove)[] = [];
  powerTrigger = false;

  // ZUD Mechanics
  /** Saves the move index of a selected Power Move. */
  powerIndex = -1;
  /** Flags whether HP changing effects should factor in the user's Dynamax HP or not. */
  ignoreDynamax = false;
  /** Checks if the user's selected move is considered a Z-Move. */
  selectedMoveIsZMove = false;
  /** Checks if a Z-Move was the user's last selected move (even if it failed to trigger). */
  lastMoveUsedIsZMove = false;

  //=============================================================================
  // Creating a battler (002_Battler_Initialize.rb#initialize)
  //=============================================================================
  constructor(btl: Battle, idxBattler: number) {
    this.battle = btl;
    this.index = idxBattler;
    this.captured = false;
    this.dummy = false;
    this.stages = {};
    this.effects = [];
    this.damageState = new DamageState();
    this.pbInitBlank();
    this.pbInitEffects(false);
  }

  //=============================================================================
  // Complex accessors
  //=============================================================================
  get level(): number { return this._level; }
  set level(value: number) {
    this._level = value;
    if (this.pokemon) this.pokemon.level = value;
  }

  get form(): number { return this._form; }
  set form(value: number) {
    this._form = value;
    if (this.pokemon) this.pokemon.form = value;
  }

  get ability(): Ability | null {
    return Ability.tryGet(this.abilityId);
  }
  set ability(value: Id | Ability | null) {
    const newAbility = Ability.tryGet(value);
    this.abilityId = newAbility ? newAbility.id : null;
  }

  get item(): Item | null {
    return Item.tryGet(this.itemId);
  }
  set item(value: Id | Item | null) {
    const newItem = Item.tryGet(value);
    this.itemId = newItem ? newItem.id : null;
    if (this.pokemon) this.pokemon.item = this.itemId;
  }

  get defense(): number {
    if (this.battle.field.effects[PBEffects.WonderRoom] > 0) return this._spdef;
    return this._defense;
  }
  set defense(value: number) { this._defense = value; }

  get spdef(): number {
    if (this.battle.field.effects[PBEffects.WonderRoom] > 0) return this._defense;
    return this._spdef;
  }
  set spdef(value: number) { this._spdef = value; }

  get hp(): number { return this._hp; }
  set hp(value: number) {
    this._hp = Math.trunc(value);
    if (this.pokemon) this.pokemon.hp = Math.trunc(value);
  }

  /** fainted? */
  fainted(): boolean { return this._hp <= 0; }

  get status(): Id { return this._status; }
  set status(value: Id) {
    if (this._status === "SLEEP" && value !== "SLEEP") this.effects[PBEffects.Truant] = false;
    if (value !== "POISON" || this.statusCount === 0) this.effects[PBEffects.Toxic] = 0;
    this._status = value;
    if (this.pokemon) this.pokemon.status = value;
    if (value !== "POISON" && value !== "SLEEP") this.statusCount = 0;
    this.battle.scene.pbRefreshOne(this.index);
  }

  get statusCount(): number { return this._statusCount; }
  set statusCount(value: number) {
    this._statusCount = value;
    if (this.pokemon) this.pokemon.statusCount = value;
    this.battle.scene.pbRefreshOne(this.index);
  }

  //=============================================================================
  // Properties from Pokémon
  //=============================================================================
  happiness(): number { return this.pokemon ? this.pokemon.happiness : 0; }
  affectionLevel(): number { return this.pokemon ? this.pokemon.affectionLevel() : 2; }
  gender(): number { return this.pokemon ? this.pokemon.gender : 0; }
  nature(): Nature | null { return this.pokemon ? this.pokemon.nature : null; }
  pokerusStage(): number { return this.pokemon ? this.pokemon.pokerusStage() : 0; }

  //=============================================================================
  // Mega Evolution, Primal Reversion, Shadow Pokémon
  //=============================================================================
  /**
   * hasMega? — Essentials Deluxe (Mega Evolution.rb:79): not while in another
   * battle form or able to use a higher-priority mechanic.
   */
  hasMega(): boolean {
    if (this.shadowPokemon() || this.effects[PBEffects.Transform]) return false;
    if (this.mega() || this.primal() || this.ultra() || this.dynamax() || this.inStyle() || this.tera() || this.celestial()) return false;
    if (this.hasPrimal() || this.hasZMove() || this.hasUltra() || this.hasZodiacPower()) return false;
    return this.pokemon?.hasMegaForm() ?? false;
  }

  /** mega? */
  mega(): boolean { return this.pokemon?.mega() ?? false; }

  /** hasPrimal? */
  hasPrimal(): boolean {
    if (this.effects[PBEffects.Transform]) return false;
    return this.pokemon?.hasPrimalForm() ?? false;
  }

  /** primal? */
  primal(): boolean { return this.pokemon?.primal() ?? false; }

  /** shadowPokemon? */
  shadowPokemon(): boolean { return false; }

  /** inHyperMode? */
  inHyperMode(): boolean { return false; }

  //=============================================================================
  // Display-only properties
  //=============================================================================
  get name(): string {
    const illusion = this.effects[PBEffects.Illusion] as Pokemon | null;
    if (illusion) return illusion.name;
    return this._name;
  }
  set name(value: string) { this._name = value; }

  displayPokemon(): Pokemon | null {
    const illusion = this.effects[PBEffects.Illusion] as Pokemon | null;
    if (illusion) return illusion;
    return this.pokemon;
  }

  displaySpecies(): Id {
    const illusion = this.effects[PBEffects.Illusion] as Pokemon | null;
    if (illusion) return illusion.species;
    return this.species;
  }

  displayGender(): number {
    const illusion = this.effects[PBEffects.Illusion] as Pokemon | null;
    if (illusion) return illusion.gender;
    return this.gender();
  }

  displayForm(): number {
    const illusion = this.effects[PBEffects.Illusion] as Pokemon | null;
    if (illusion) return illusion.form;
    return this.form;
  }

  /** shiny? */
  shiny(): boolean {
    const illusion = this.effects[PBEffects.Illusion] as Pokemon | null;
    if (illusion) return illusion.shiny;
    return this.pokemon?.shiny ?? false;
  }

  /** super_shiny? */
  superShiny(): boolean {
    return this.pokemon?.superShiny ?? false;
  }

  /** owned? (alias owned) */
  owned(): boolean {
    if (!this.battle.wildBattle()) return false;
    return (G.player as unknown as Player).owned(this.displaySpecies());
  }

  abilityName(): string {
    const abil = this.ability;
    return abil ? abil.name : "";
  }

  itemName(): string {
    const itm = this.item;
    return itm ? itm.name : "";
  }

  pbThis(lowerCase = false): string {
    if (this.opposes()) {
      if (this.battle.trainerBattle()) {
        return lowerCase ? _INTL("the opposing {1}", this.name) : _INTL("The opposing {1}", this.name);
      } else {
        return lowerCase ? _INTL("the wild {1}", this.name) : _INTL("The wild {1}", this.name);
      }
    } else if (!this.pbOwnedByPlayer()) {
      return lowerCase ? _INTL("the ally {1}", this.name) : _INTL("The ally {1}", this.name);
    }
    return this.name;
  }

  pbTeam(lowerCase = false): string {
    if (this.opposes()) {
      return lowerCase ? _INTL("the opposing team") : _INTL("The opposing team");
    }
    return lowerCase ? _INTL("your team") : _INTL("Your team");
  }

  pbOpposingTeam(lowerCase = false): string {
    if (this.opposes()) {
      return lowerCase ? _INTL("your team") : _INTL("Your team");
    }
    return lowerCase ? _INTL("the opposing team") : _INTL("The opposing team");
  }

  // Essentials Deluxe (Battle_Misc.rb:28)
  /** ace? */
  ace(): boolean { return this.pokemon?.ace ?? false; }
  /** name_title */
  nameTitle(): string { return this.name; }

  //=============================================================================
  // Calculated properties
  //=============================================================================
  pbSpeed(): number {
    if (this.fainted()) return 1;
    const stageMul = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
    const stageDiv = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];
    const stage = this.stages.SPEED! + 6;
    const speed = Math.floor(this.speed * stageMul[stage]! / stageDiv[stage]!);
    let speedMult = 1.0;
    // Ability effects that alter calculated Speed
    if (this.abilityActive()) {
      speedMult = AbilityEffects.triggerSpeedCalc(this.ability, this, speedMult);
    }
    // Item effects that alter calculated Speed
    if (this.itemActive()) {
      speedMult = ItemEffects.triggerSpeedCalc(this.item, this, speedMult);
    }
    // Other effects
    if (this.pbOwnSide().effects[PBEffects.Tailwind] > 0) speedMult *= 2;
    if (this.pbOwnSide().effects[PBEffects.Swamp] > 0) speedMult /= 2;
    // Paralysis
    if (this.status === "PARALYSIS" && !this.hasActiveAbility("QUICKFEET")) {
      speedMult /= Settings.MECHANICS_GENERATION_AT_RUNTIME >= 7 ? 2 : 4;
    }
    // Badge multiplier
    if (this.battle.internalBattle && this.pbOwnedByPlayer() &&
        this.battle.pbPlayer().badgeCount() >= Settings.NUM_BADGES_BOOST_SPEED) {
      speedMult *= 1.1;
    }
    // Calculation
    return Math.max(Math.round(speed * speedMult), 1);
  }

  pbWeight(): number {
    let ret = this.pokemon ? this.pokemon.weight() : 500;
    ret += this.effects[PBEffects.WeightChange];
    if (ret < 1) ret = 1;
    if (this.abilityActive() && !this.battle.moldBreaker) {
      ret = AbilityEffects.triggerWeightCalc(this.ability, this, ret);
    }
    if (this.itemActive()) {
      ret = ItemEffects.triggerWeightCalc(this.item, this, ret);
    }
    return Math.max(ret, 1);
  }

  //=============================================================================
  // Queries about what the battler has
  //=============================================================================
  plainStats(): Record<Id, number> {
    const ret: Record<Id, number> = {};
    ret.ATTACK = this.attack;
    ret.DEFENSE = this.defense;
    ret.SPECIAL_ATTACK = this.spatk;
    ret.SPECIAL_DEFENSE = this.spdef;
    ret.SPEED = this.speed;
    return ret;
  }

  /** isSpecies? */
  isSpecies(species: Id): boolean {
    return this.pokemon?.isSpecies(species) ?? false;
  }

  /**
   * Returns the active types of this Pokémon. The array should not include the
   * same type more than once, and should not include any invalid types.
   */
  pbTypes(withType3 = false): Id[] {
    let ret = [...new Set(this.types)];
    // Burn Up erases the Fire-type.
    if (this.effects[PBEffects.BurnUp]) ret = ret.filter((t) => t !== "FIRE");
    // Roost erases the Flying-type. If there are no types left, adds the Normal-
    // type.
    if (this.effects[PBEffects.Roost]) {
      ret = ret.filter((t) => t !== "FLYING");
      if (ret.length === 0) ret.push("NORMAL");
    }
    // Add the third type specially.
    const type3 = this.effects[PBEffects.Type3] as Id | null;
    if (withType3 && type3 && !ret.includes(type3)) ret.push(type3);
    // Generation 9 Pack: Double Shock erases the Electric-type.
    if (this.effects[PBEffects.DoubleShock]) ret = ret.filter((t) => t !== "ELECTRIC");
    return ret;
  }

  /** pbHasType? */
  pbHasType(type: Id | null | undefined): boolean {
    if (!type) return false;
    const activeTypes = this.pbTypes(true);
    return activeTypes.includes(Type.get(type).id);
  }

  /** pbHasOtherType? */
  pbHasOtherType(type: Id | null | undefined): boolean {
    if (!type) return false;
    const typeId = Type.get(type).id;
    const activeTypes = this.pbTypes(true).filter((t) => t !== typeId);
    return activeTypes.length > 0;
  }

  /**
   * abilityActive? — Generation 9 Pack ([002] Battle_Battler.rb:260): Gen 9
   * Battle Bond and Protean/Libero, and Ability Shield ignoring Neutralizing Gas.
   * NOTE: Do not create any held item which affects whether a Pokémon's ability
   *       is active. The ability Klutz affects whether a Pokémon's item is
   *       active, and the code for the two combined would cause an infinite loop
   *       (regardless of whether any Pokémon actually has either the ability or
   *       the item - the code existing is enough to cause the loop).
   */
  abilityActive(ignoreFainted = false, checkAbility: Id | Id[] | null = null): boolean {
    if (this.fainted() && !ignoreFainted) return false;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 9) {
      if (!checkAbility && this.abilityId === "BATTLEBOND") return true;
      if (this.proteanTrigger && this.abilityId === this.effects[PBEffects.Protean]) {
        if (!checkAbility || checkAbility === this.abilityId) return false;
        if (Array.isArray(checkAbility) && checkAbility.includes(this.abilityId!)) return false;
      }
    }
    if (this.effects[PBEffects.GastroAcid]) return false;
    if (checkAbility !== "NEUTRALIZINGGAS" && this.abilityId !== "NEUTRALIZINGGAS" &&
        !this.activeAbilityShield(checkAbility) && this.battle.pbCheckGlobalAbility("NEUTRALIZINGGAS")) return false;
    return true;
  }

  /** hasActiveAbility? (alias hasWorkingAbility) */
  hasActiveAbility(checkAbility: Id | Id[], ignoreFainted = false): boolean {
    if (!this.abilityActive(ignoreFainted, checkAbility)) return false;
    if (Array.isArray(checkAbility)) return this.abilityId != null && checkAbility.includes(this.abilityId);
    return this.abilityId != null && this.abilityId === checkAbility;
  }

  /**
   * unstoppableAbility? — Applies to both losing self's ability (i.e. being
   * replaced by another) and having self's ability be negated.
   * Generation 9 Pack: adds Commander, Protosynthesis, Quark Drive, Zero to Hero.
   */
  unstoppableAbility(abil: Id | Ability | null = null): boolean {
    const data = Ability.tryGet(abil ?? this.abilityId);
    if (!data) return false;
    const abilityBlacklist = [
      // Form-changing abilities
      "BATTLEBOND",
      "DISGUISE",
      //      "FLOWERGIFT",                                        // This can be stopped
      //      "FORECAST",                                          // This can be stopped
      "GULPMISSILE",
      "ICEFACE",
      "MULTITYPE",
      "POWERCONSTRUCT",
      "SCHOOLING",
      "SHIELDSDOWN",
      "STANCECHANGE",
      "ZENMODE",
      // Abilities intended to be inherent properties of a certain species
      "ASONECHILLINGNEIGH",
      "ASONEGRIMNEIGH",
      "COMATOSE",
      "RKSSYSTEM",
    ];
    if (abilityBlacklist.includes(data.id)) return true;
    return ["COMMANDER", "PROTOSYNTHESIS", "QUARKDRIVE", "ZEROTOHERO"].includes(data.id);
  }

  /**
   * ungainableAbility? — Applies to gaining the ability.
   * Generation 9 Pack: adds Wonder Guard, Commander, Protosynthesis, Quark Drive, Zero to Hero.
   */
  ungainableAbility(abil: Id | Ability | null = null): boolean {
    const data = Ability.tryGet(abil ?? this.abilityId);
    if (!data) return false;
    const abilityBlacklist = [
      // Form-changing abilities
      "BATTLEBOND",
      "DISGUISE",
      "FLOWERGIFT",
      "FORECAST",
      "GULPMISSILE",
      "ICEFACE",
      "MULTITYPE",
      "POWERCONSTRUCT",
      "SCHOOLING",
      "SHIELDSDOWN",
      "STANCECHANGE",
      "ZENMODE",
      // Appearance-changing abilities
      "ILLUSION",
      "IMPOSTER",
      // Abilities intended to be inherent properties of a certain species
      "ASONECHILLINGNEIGH",
      "ASONEGRIMNEIGH",
      "COMATOSE",
      "RKSSYSTEM",
      // Abilities that can't be negated
      "NEUTRALIZINGGAS",
    ];
    if (abilityBlacklist.includes(data.id)) return true;
    return ["WONDERGUARD", "COMMANDER", "PROTOSYNTHESIS", "QUARKDRIVE", "ZEROTOHERO"].includes(data.id);
  }

  /** uncopyableAbility? — Generation 9 Pack: returns true if ability cannot be copied. */
  uncopyableAbility(abil: Id | Ability | null = null): boolean {
    const data = Ability.tryGet(abil ?? this.abilityId);
    if (!data) return false;
    if (this.ungainableAbility(data)) return true;
    return ["POWEROFALCHEMY", "RECEIVER", "TRACE"].includes(data.id);
  }

  /** activeAbilityShield? — Generation 9 Pack: specifically used to check for an Ability Shield for Neutralizing Gas. */
  activeAbilityShield(checkAbility: Id | Id[] | null): boolean {
    if (this.fainted()) return false;
    if (this.itemId !== "ABILITYSHIELD") return false;
    if (this.effects[PBEffects.Embargo] > 0) return false;
    if (this.battle.field.effects[PBEffects.MagicRoom] > 0) return false;
    if (this.battle.corrosiveGas[this.index % 2]![this.pokemonIndex]) return false;
    if (checkAbility === "KLUTZ" || this.abilityId === "KLUTZ") return false;
    return true;
  }

  /** itemActive? */
  itemActive(ignoreFainted = false): boolean {
    if (this.fainted() && !ignoreFainted) return false;
    if (this.effects[PBEffects.Embargo] > 0) return false;
    if (this.battle.field.effects[PBEffects.MagicRoom] > 0) return false;
    if (this.battle.corrosiveGas[this.index % 2]![this.pokemonIndex]) return false;
    if (this.hasActiveAbility("KLUTZ", ignoreFainted)) return false;
    return true;
  }

  /** hasActiveItem? (alias hasWorkingItem) */
  hasActiveItem(checkItem: Id | Id[], ignoreFainted = false): boolean {
    if (!this.itemActive(ignoreFainted)) return false;
    if (Array.isArray(checkItem)) return this.itemId != null && checkItem.includes(this.itemId);
    return this.itemId != null && this.itemId === checkItem;
  }

  /** unlosableItem? — Returns whether the specified item will be unlosable for this Pokémon. */
  unlosableItem(checkItem: Id | Item | null): boolean {
    if (!checkItem) return false;
    const itemData = Item.get(checkItem);
    if (itemData.isMail()) return true;
    if (this.effects[PBEffects.Transform]) return false;
    // Items that change a Pokémon's form
    if (this.mega()) { // Check if item was needed for this Mega Evolution
      if (this.pokemon!.speciesData().megaStone === itemData.id) return true;
    } else { // Check if item could cause a Mega Evolution
      for (const data of Species.each()) {
        if (data.species !== this.species || data.unmegaForm !== this.form) continue;
        if (data.megaStone === itemData.id) return true;
      }
    }
    // Other unlosable items
    return itemData.unlosable(this.species, this.abilityId);
  }

  eachMove(fn: (m: Move) => void): void {
    for (const m of this.moves) fn(m);
  }

  eachMoveWithIndex(fn: (m: Move, i: number) => void): void {
    this.moves.forEach((m, i) => fn(m, i));
  }

  /**
   * pbHasMove? — ZUD Mechanics (Battler_Overrides.rb:213): checks the user's
   * base moves instead of its current moves while Dynamaxed.
   */
  pbHasMove(moveId: Id | null | undefined): boolean {
    if (!moveId) return false;
    if (this.dynamax()) {
      for (const m of this.baseMoves) if (m.id === moveId) return true;
    } else {
      for (const m of this.moves) if (m.id === moveId) return true;
    }
    return false;
  }

  /** pbHasMoveType? */
  pbHasMoveType(checkType: Id | null | undefined): boolean {
    if (!checkType) return false;
    const typeId = Type.get(checkType).id;
    for (const m of this.moves) if (m.type === typeId) return true;
    return false;
  }

  /** pbHasMoveFunction? */
  pbHasMoveFunction(...arg: string[]): boolean {
    for (const m of this.moves) {
      for (const code of arg) if (m.function === code) return true;
    }
    return false;
  }

  pbGetMoveWithID(moveId: Id | null | undefined): Move | null {
    if (!moveId) return null;
    for (const m of this.moves) if (m.id === moveId) return m;
    return null;
  }

  /** hasMoldBreaker? */
  hasMoldBreaker(): boolean {
    return this.hasActiveAbility(["MOLDBREAKER", "TERAVOLT", "TURBOBLAZE"]);
  }

  /** canChangeType? */
  canChangeType(): boolean {
    return !["MULTITYPE", "RKSSYSTEM"].includes(this.abilityId!);
  }

  /** airborne? */
  airborne(): boolean {
    if (this.hasActiveItem("IRONBALL")) return false;
    if (this.effects[PBEffects.Ingrain]) return false;
    if (this.effects[PBEffects.SmackDown]) return false;
    if (this.battle.field.effects[PBEffects.Gravity] > 0) return false;
    if (this.pbHasType("FLYING")) return true;
    if (this.hasActiveAbility("LEVITATE") && !this.battle.moldBreaker) return true;
    if (this.hasActiveItem("AIRBALLOON")) return true;
    if (this.effects[PBEffects.MagnetRise] > 0) return true;
    if (this.effects[PBEffects.Telekinesis] > 0) return true;
    return false;
  }

  /** affectedByTerrain? */
  affectedByTerrain(): boolean {
    if (this.airborne()) return false;
    if (this.semiInvulnerable()) return false;
    return true;
  }

  /**
   * takesIndirectDamage? without a message (showMsg = false). Ruby callers that
   * pass showMsg = true (ability handlers pass Battle::Scene::USE_ABILITY_SPLASH)
   * use `await takesIndirectDamageAsync(true)`.
   */
  takesIndirectDamage(): boolean {
    if (this.fainted()) return false;
    if (this.hasActiveAbility("MAGICGUARD")) return false;
    return true;
  }

  /** takesIndirectDamage?(showMsg): shows the Magic Guard message when showMsg. */
  async takesIndirectDamageAsync(showMsg = false): Promise<boolean> {
    if (this.fainted()) return false;
    if (this.hasActiveAbility("MAGICGUARD")) {
      if (showMsg) {
        await this.battle.pbShowAbilitySplash(this);
        if (Scene.USE_ABILITY_SPLASH) {
          await this.battle.pbDisplay(_INTL("{1} is unaffected!", this.pbThis()));
        } else {
          await this.battle.pbDisplay(_INTL("{1} is unaffected because of its {2}!", this.pbThis(), this.abilityName()));
        }
        await this.battle.pbHideAbilitySplash(this);
      }
      return false;
    }
    return true;
  }

  /** takesSandstormDamage? */
  takesSandstormDamage(): boolean {
    if (!this.takesIndirectDamage()) return false;
    if (this.pbHasType("GROUND") || this.pbHasType("ROCK") || this.pbHasType("STEEL")) return false;
    if (this.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground",
      "TwoTurnAttackInvulnerableUnderwater")) return false;
    if (this.hasActiveAbility(["OVERCOAT", "SANDFORCE", "SANDRUSH", "SANDVEIL"])) return false;
    if (this.hasActiveItem("SAFETYGOGGLES")) return false;
    return true;
  }

  /** takesHailDamage? */
  takesHailDamage(): boolean {
    if (!this.takesIndirectDamage()) return false;
    if (this.pbHasType("ICE")) return false;
    if (this.inTwoTurnAttack("TwoTurnAttackInvulnerableUnderground",
      "TwoTurnAttackInvulnerableUnderwater")) return false;
    if (this.hasActiveAbility(["OVERCOAT", "ICEBODY", "SNOWCLOAK"])) return false;
    if (this.hasActiveItem("SAFETYGOGGLES")) return false;
    return true;
  }

  /** takesShadowSkyDamage? */
  takesShadowSkyDamage(): boolean {
    if (this.fainted()) return false;
    if (this.shadowPokemon()) return false;
    return true;
  }

  effectiveWeather(): Id {
    let ret = this.battle.pbWeather();
    if (["Sun", "Rain", "HarshSun", "HeavyRain"].includes(ret) && this.hasActiveItem("UTILITYUMBRELLA")) ret = "None";
    return ret;
  }

  /** affectedByPowder? without a message (showMsg = false); see affectedByPowderAsync. */
  affectedByPowder(): boolean {
    if (this.fainted()) return false;
    if (this.pbHasType("GRASS") && Settings.MORE_TYPE_EFFECTS) return false;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      if (this.hasActiveAbility("OVERCOAT") && !this.battle.moldBreaker) return false;
      if (this.hasActiveItem("SAFETYGOGGLES")) return false;
    }
    return true;
  }

  /** affectedByPowder?(showMsg) */
  async affectedByPowderAsync(showMsg = false): Promise<boolean> {
    if (this.fainted()) return false;
    if (this.pbHasType("GRASS") && Settings.MORE_TYPE_EFFECTS) {
      if (showMsg) await this.battle.pbDisplay(_INTL("{1} is unaffected!", this.pbThis()));
      return false;
    }
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) {
      if (this.hasActiveAbility("OVERCOAT") && !this.battle.moldBreaker) {
        if (showMsg) {
          await this.battle.pbShowAbilitySplash(this);
          if (Scene.USE_ABILITY_SPLASH) {
            await this.battle.pbDisplay(_INTL("{1} is unaffected!", this.pbThis()));
          } else {
            await this.battle.pbDisplay(_INTL("{1} is unaffected because of its {2}!", this.pbThis(), this.abilityName()));
          }
          await this.battle.pbHideAbilitySplash(this);
        }
        return false;
      }
      if (this.hasActiveItem("SAFETYGOGGLES")) {
        if (showMsg) {
          await this.battle.pbDisplay(_INTL("{1} is unaffected because of its {2}!", this.pbThis(), this.itemName()));
        }
        return false;
      }
    }
    return true;
  }

  /** canHeal? */
  canHeal(): boolean {
    if (this.fainted() || this.hp >= this.totalhp) return false;
    if (this.effects[PBEffects.HealBlock] > 0) return false;
    return true;
  }

  /** affectedByContactEffect? without a message (showMsg = false); see affectedByContactEffectAsync. */
  affectedByContactEffect(): boolean {
    if (this.fainted()) return false;
    if (this.hasActiveItem("PROTECTIVEPADS")) return false;
    return true;
  }

  /** affectedByContactEffect?(showMsg) */
  async affectedByContactEffectAsync(showMsg = false): Promise<boolean> {
    if (this.fainted()) return false;
    if (this.hasActiveItem("PROTECTIVEPADS")) {
      if (showMsg) await this.battle.pbDisplay(_INTL("{1} protected itself with the {2}!", this.pbThis(), this.itemName()));
      return false;
    }
    return true;
  }

  /** trappedInBattle? — Generation 9 Pack: Commander also traps. */
  trappedInBattle(): boolean {
    if (this.effects[PBEffects.Commander]) return true;
    if (this.effects[PBEffects.Trapping] > 0) return true;
    if (this.effects[PBEffects.MeanLook] >= 0) return true;
    if (this.effects[PBEffects.JawLock] >= 0) return true;
    if (this.battle.allBattlers().some((b) => b.effects[PBEffects.JawLock] === this.index)) return true;
    if (this.effects[PBEffects.Octolock] >= 0) return true;
    if (this.effects[PBEffects.Ingrain]) return true;
    if (this.effects[PBEffects.NoRetreat]) return true;
    if (this.battle.field.effects[PBEffects.FairyLock] > 0) return true;
    return false;
  }

  /** movedThisRound? */
  movedThisRound(): boolean {
    return this.lastRoundMoved != null && this.lastRoundMoved === this.battle.turnCount;
  }

  /** usingMultiTurnAttack? */
  usingMultiTurnAttack(): boolean {
    if (this.effects[PBEffects.TwoTurnAttack]) return true;
    if (this.effects[PBEffects.HyperBeam] > 0) return true;
    if (this.effects[PBEffects.Rollout] > 0) return true;
    if (this.effects[PBEffects.Outrage] > 0) return true;
    if (this.effects[PBEffects.Uproar] > 0) return true;
    if (this.effects[PBEffects.Bide] > 0) return true;
    return false;
  }

  /** inTwoTurnAttack? */
  inTwoTurnAttack(...arg: string[]): boolean {
    if (!this.effects[PBEffects.TwoTurnAttack]) return false;
    const ttaFunction = MoveData.get(this.effects[PBEffects.TwoTurnAttack]).functionCode;
    for (const a of arg) if (a === ttaFunction) return true;
    return false;
  }

  /** semiInvulnerable? */
  semiInvulnerable(): boolean {
    return this.inTwoTurnAttack("TwoTurnAttackInvulnerableInSky",
      "TwoTurnAttackInvulnerableUnderground",
      "TwoTurnAttackInvulnerableUnderwater",
      "TwoTurnAttackInvulnerableInSkyParalyzeTarget",
      "TwoTurnAttackInvulnerableRemoveProtections",
      "TwoTurnAttackInvulnerableInSkyTargetCannotAct");
  }

  /** ZUD Mechanics (Battler_Overrides.rb:187): index of encored move is reset during the turn a Z-Move is used. */
  pbEncoredMoveIndex(): number {
    const choice = this.battle.choices[this.index];
    if (choice && choice[0] === "UseMove" && (choice[2] as Move).zMove()) {
      const turns = this.effects[PBEffects.Encore];
      const move = this.effects[PBEffects.EncoreMove];
      this.effects[PBEffects.EncoreRestore] = [turns, move];
      return -1;
    }
    if (this.effects[PBEffects.Encore] === 0 || !this.effects[PBEffects.EncoreMove]) return -1;
    let ret = -1;
    for (let i = 0; i < this.moves.length; i++) {
      if (this.moves[i]!.id !== this.effects[PBEffects.EncoreMove]) continue;
      ret = i;
      break;
    }
    return ret;
  }

  initialItem(): Id | null {
    return this.battle.initialItems[this.index & 1]![this.pokemonIndex] ?? null;
  }

  setInitialItem(value: Id | Item | null): void {
    const itemData = Item.tryGet(value);
    const newItem = itemData ? itemData.id : null;
    this.battle.initialItems[this.index & 1]![this.pokemonIndex] = newItem;
  }

  recycleItem(): Id | null {
    return this.battle.recycleItems[this.index & 1]![this.pokemonIndex] ?? null;
  }

  setRecycleItem(value: Id | Item | null): void {
    const itemData = Item.tryGet(value);
    const newItem = itemData ? itemData.id : null;
    this.battle.recycleItems[this.index & 1]![this.pokemonIndex] = newItem;
  }

  /** belched? */
  belched(): boolean {
    return this.battle.belch[this.index & 1]![this.pokemonIndex]!;
  }

  setBelched(): void {
    this.battle.belch[this.index & 1]![this.pokemonIndex] = true;
  }

  //=============================================================================
  // Methods relating to this battler's position on the battlefield
  //=============================================================================
  /** opposes? — Returns whether the given position belongs to the opposing Pokémon's side. */
  opposes(i: number | { index: number } = 0): boolean {
    const idx = typeof i === "number" ? i : i.index;
    return (this.index & 1) !== (idx & 1);
  }

  /** near? — Returns whether the given position/battler is near to self. */
  near(i: number | { index: number }): boolean {
    const idx = typeof i === "number" ? i : i.index;
    return this.battle.nearBattlers(this.index, idx);
  }

  /** pbOwnedByPlayer? — Returns whether self is owned by the player. */
  pbOwnedByPlayer(): boolean {
    return this.battle.pbOwnedByPlayer(this.index);
  }

  /** wild? */
  wild(): boolean {
    return this.battle.wildBattle() && this.opposes();
  }

  /**
   * Returns 0 if self is on the player's side, or 1 if self is on the opposing
   * side.
   */
  idxOwnSide(): number {
    return this.index & 1;
  }

  /**
   * Returns 1 if self is on the player's side, or 0 if self is on the opposing
   * side.
   */
  idxOpposingSide(): number {
    return (this.index & 1) ^ 1;
  }

  /** Returns the data structure for this battler's side. */
  pbOwnSide(): ActiveSide {
    return this.battle.sides[this.idxOwnSide()]!;
  }

  /** Returns the data structure for the opposing Pokémon's side. */
  pbOpposingSide(): ActiveSide {
    return this.battle.sides[this.idxOpposingSide()]!;
  }

  /** Yields each unfainted ally Pokémon. (Unused) */
  eachAlly(fn: (b: Battler) => void): void {
    for (const b of this.battle.battlers) {
      if (b && !b.fainted() && !b.opposes(this.index) && b.index !== this.index) fn(b);
    }
  }

  /** Returns an array containing all unfainted ally Pokémon. */
  allAllies(): Battler[] {
    return this.battle.allSameSideBattlers(this.index).filter((b) => b.index !== this.index);
  }

  /** Yields each unfainted opposing Pokémon. (Unused) */
  eachOpposing(fn: (b: Battler) => void): void {
    for (const b of this.battle.battlers) if (b && !b.fainted() && b.opposes(this.index)) fn(b);
  }

  /** Returns an array containing all unfainted opposing Pokémon. */
  allOpposing(): Battler[] {
    return this.battle.allOtherSideBattlers(this.index);
  }

  /**
   * Returns the battler that is most directly opposite to self. unfaintedOnly is
   * whether it should prefer to return a non-fainted battler.
   */
  pbDirectOpposing(unfaintedOnly = false): Battler {
    for (const i of this.battle.pbGetOpposingIndicesInOrder(this.index)) {
      if (!this.battle.battlers[i]) continue;
      if (unfaintedOnly && this.battle.battlers[i]!.fainted()) break;
      return this.battle.battlers[i]!;
    }
    // Wanted an unfainted battler but couldn't find one; make do with a fainted
    // battler
    for (const i of this.battle.pbGetOpposingIndicesInOrder(this.index)) {
      if (this.battle.battlers[i]) return this.battle.battlers[i]!;
    }
    return this.battle.battlers[this.index ^ 1]!;
  }

  //=============================================================================
  // Generation 9 Pack ([002] Battle_Battler.rb:35)
  //=============================================================================
  /** ability_triggered? */
  abilityTriggered(): boolean {
    return this.battle.pbAbilityTriggered(this);
  }

  numTimesHit(): number {
    return this.battle.pbRageHitCount(this);
  }

  numFaintedAllies(): number {
    return this.battle.pbFaintedAllyCount(this);
  }

  /** isCommander? */
  isCommander(): boolean {
    const commander = this.effects[PBEffects.Commander] as unknown[] | null;
    return commander != null && commander.length === 1;
  }

  /** isCommanderHost? */
  isCommanderHost(): boolean {
    const commander = this.effects[PBEffects.Commander] as unknown[] | null;
    return commander != null && commander.length === 2;
  }

  //=============================================================================
  // Essentials Deluxe (Battle_Misc.rb:215): plugin mechanics that aren't
  // installed. (ZUD Mechanics' versions of the Z-Move/Ultra Burst/Dynamax
  // queries follow.)
  //=============================================================================
  /** hasStyles? */
  hasStyles(): boolean { return false; }
  /** inStyle? */
  inStyle(): boolean { return false; }
  /** tera? */
  tera(): boolean { return false; }
  /** hasTera? */
  hasTera(): boolean { return false; }
  /** hasZodiacPower? */
  hasZodiacPower(): boolean { return false; }
  /** celestial? */
  celestial(): boolean { return false; }
  focusMeter(): number { return 0; }

  //=============================================================================
  // ZUD Mechanics ([004] Battle_Battler/Battler.rb)
  //=============================================================================
  /** ultra? */
  ultra(): boolean { return this.pokemon?.ultra() ?? false; }
  /** dynamax? */
  dynamax(): boolean { return this.pokemon?.dynamax ?? false; }
  /** gmax? */
  gmax(): boolean { return this.pokemon?.gmax ?? false; }
  /** dynamax_able? */
  dynamaxAble(): boolean { return this.pokemon?.dynamaxAble ?? false; }
  dynamaxBoost(): number | null { return this.pokemon?.dynamaxBoost() ?? null; }
  /** gmax_factor? */
  gmaxFactor(): boolean { return this.pokemon?.gmaxFactor ?? false; }
  /** Gets the non-Dynamax HP of a Pokemon. */
  realHp(): number | null { return this.pokemon?.realHp() ?? null; }
  realTotalhp(): number | null { return this.pokemon?.realTotalhp() ?? null; }

  /**
   * hasZMove? — Higher priority than Mega Evolution, Dynamax, Battle Styles,
   * Terastallization; lower than Primal Reversion, Zodiac Powers, Ultra Burst.
   */
  hasZMove(): boolean {
    if (this.shadowPokemon()) return false;
    if (this.mega() || this.primal() || this.dynamax() || this.inStyle() || this.tera() || this.celestial()) return false;
    if (this.hasPrimal() || this.hasUltra() || this.hasZodiacPower()) return false;
    return this.hasCompatibleZMove(this.moves);
  }

  /** hasCompatibleZMove? */
  hasCompatibleZMove(move: Move[] | Move | null = null): boolean {
    const transform = this.effects[PBEffects.Transform];
    const newpoke = this.effects[PBEffects.TransformPokemon] as Pokemon | null;
    const species = transform ? newpoke!.speciesData().id : null;
    if (!this.item || !Item.get(this.item).isZCrystal()) return false;
    if (transform && Item.get(this.item).isUltraItem()) return false;
    return this.pokemon?.compatZmove(move as never, null, species) ?? false;
  }

  /**
   * hasUltra? — Higher priority than Mega Evolution, Z-Moves, Dynamax, Battle
   * Styles, Terastallization; lower than Primal Reversion, Zodiac Powers.
   */
  hasUltra(): boolean {
    if (this.shadowPokemon() || this.effects[PBEffects.Transform]) return false;
    if (this.mega() || this.primal() || this.ultra() || this.dynamax() || this.inStyle() || this.tera() || this.celestial()) return false;
    if (this.hasPrimal() || this.hasZodiacPower()) return false;
    return this.pokemon?.hasUltraForm() ?? false;
  }

  /**
   * hasDynamax? — Higher priority than Battle Styles, Terastallization; lower
   * than Primal Reversion, Zodiac Powers, Ultra Burst, Z-Moves, Mega Evolution.
   */
  hasDynamax(): boolean {
    if (this.shadowPokemon()) return false;
    if (this.mega() || this.primal() || this.ultra() || this.dynamax() || this.inStyle() || this.tera() || this.celestial()) return false;
    if (this.hasMega() || this.hasPrimal() || this.hasZMove() || this.hasUltra() || this.hasZodiacPower()) return false;
    if (this.canEmax()) return true;
    const pokemon = (this.effects[PBEffects.TransformPokemon] as Pokemon | null) ?? this.displayPokemon();
    return (pokemon?.dynamaxAble ?? false) && !pokemon!.isSpecies("ETERNATUS");
  }

  /** hasDynamaxAvail? */
  hasDynamaxAvail(): boolean {
    if (!this.hasDynamax()) return false;
    if (!this.pbOwnedByPlayer() && !this.battle.pbHasDynamaxBand(this.index)) return false;
    const mapData = G.gameMap ? MapMetadata.tryGet(G.gameMap.mapId) : null;
    if (this.canEmax() && !(G.gameMap && mapData?.hasFlag("EternaSpot"))) return false;
    if (this.battle.raidBattle && this.battle.pbHasDynamaxBand(this.index)) return true;
    if (this.battle.wildBattle() && !G.gameSwitches.get(Settings.CAN_DYNAMAX_WILD)) return false;
    if (G.gameSwitches.get(Settings.DYNAMAX_ANY_MAP) && this.battle.pbHasDynamaxBand(this.index)) return true;
    return !!G.gameMap && (mapData?.hasFlag("PowerSpot") ?? false) && this.battle.pbHasDynamaxBand(this.index);
  }

  /** hasGmax? */
  hasGmax(): boolean {
    if (!this.hasDynamax()) return false;
    return this.pokemon?.hasGmax() ?? false;
  }

  /** canGmax? */
  canGmax(): boolean {
    return this.hasGmax() && this.gmaxFactor();
  }

  /** canEmax? */
  canEmax(): boolean {
    if (this.effects[PBEffects.Transform] || this.effects[PBEffects.Illusion]) return false;
    return this.pokemon?.canEmax() ?? false;
  }

  /** Reverts the effects of Dynamax. */
  async unmax(): Promise<void> {
    this.pokemon!.dynamax = false;
    this.pbUpdate();
    this.pokemon!.reversion = false;
    if (!this.effects[PBEffects.MaxRaidBoss]) {
      this.displayBaseMoves();
      this.powerTrigger = false;
      this.effects[PBEffects.Dynamax] = 0;
      this.battle.scene.pbRefreshOne(this.index);
      await this.battle.scene.pbRevertDynamax?.(this.index);
      if (!this.fainted()) await this.battle.scene.pbHPChanged(this, this.totalhp);
    }
  }
}
