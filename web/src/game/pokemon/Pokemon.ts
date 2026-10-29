// Port of Data/Scripts/014_Pokemon/001_Pokemon.rb, 002_Pokemon_MegaEvolution.rb
// and 003_Pokemon_ShadowPokemon.rb, with the plugin patches this game loads:
// - v20.1 Hotfixes: update_shadow_moves / replace_moves.
// - Generation 9 Pack: evolution counters, reset_moves skipping level -1 moves.
// - Essentials Deluxe: ace, scale, baseStats via form handlers, getPrimalForm,
//   check_for_attribute, dynamax?/gmax?/tera?/celestial? placeholders.
// - ZUD Mechanics: Dynamax level/state, G-Max factor, Ultra Burst, Z-Move and
//   Max Move compatibility, Dynamax HP in calcHP/calc_stats.
// - Enhanced UI: shiny leaves.  Pokémon Amie: affection/fullness/enjoyment.
//
// Naming: Ruby methods keep their names in camelCase with ?/! dropped
// (egg? → egg(), hasItem? → hasItem(), calc_stats → calcStats()). Ruby
// attributes with a custom writer are accessors (level, exp, hp, form, name,
// item, ability, nature, gender, status, species), and where `x?` and `x=`
// both exist the accessor serves both (shiny?/shiny=, gmax_factor?/=).
//
// IDs and personal IDs are 32-bit unsigned (>>> 0) as Ruby's Integers.
//
// Saving: toJSON() / Pokemon.fromJSON() round-trip every instance variable.

import { rand } from "../../core/random";
import { Ability } from "../../data/gameData/ability";
import { Evolution } from "../../data/gameData/evolution";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { GenderRatio } from "../../data/gameData/genderRatio";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Nature } from "../../data/gameData/nature";
import { PowerMove, type MoveLike } from "../../data/gameData/powerMove";
import { Ribbon } from "../../data/gameData/ribbon";
import { Settings } from "../../data/gameData/settings";
import { ShadowPokemon } from "../../data/gameData/shadowPokemon";
import { Species } from "../../data/gameData/species";
import { Stat } from "../../data/gameData/stat";
import { Status } from "../../data/gameData/status";
import { Type } from "../../data/gameData/type";
import type { LevelUpMove } from "../../data/pbs/types";
import { pbGetTimeNow } from "../dayNight";
import { G } from "../globals";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";
import { Trainer } from "../trainer/Trainer";
import { pbMessageHook } from "../items/itemUtilities";
import { MultipleForms } from "./formHandlers";
import { Mail } from "./Mail";
import { PokemonMove, type PokemonMoveJSON } from "./PokemonMove";
import { PokemonOwner, type PokemonOwnerJSON } from "./PokemonOwner";

export type StatHash = Record<Id, number>;

const clamp = (v: number, lo: number, hi: number) => {
  if (lo > hi) throw new RangeError("min argument must be smaller than max argument"); // Ruby's Comparable#clamp
  return Math.min(Math.max(v, lo), hi);
};
const nowSeconds = () => Math.floor(pbGetTimeNow().getTime() / 1000);
const player = () => G.player as unknown as Player | null;
const stats = () => (G as unknown as { stats?: GameStats }).stats;

export class Pokemon {
  /** Max total IVs. */
  static readonly IV_STAT_LIMIT = 31;
  /** Max total EVs. */
  static readonly EV_LIMIT = 510;
  /** Max EVs that a single stat can have. */
  static readonly EV_STAT_LIMIT = 252;
  /** Maximum length a Pokémon's nickname can be. */
  static readonly MAX_NAME_SIZE = 10;
  /** Maximum number of moves a Pokémon can know at once. */
  static readonly MAX_MOVES = 4;
  /** Pokémon Amie: max points of each Amie stat. */
  static readonly MAXAMIEPOINTS = 255;
  static readonly Move = PokemonMove;
  static readonly Owner = PokemonOwner;

  private _species!: Id;
  /** Forces the form, ignoring form handlers (set by trainers' Form). */
  forcedForm: number | null = null;
  /** Time (seconds since epoch) when Furfrou's/Hoopa's form was set. */
  timeFormSet: number | null = null;
  private _form = 0;
  private _level: number | null = null;
  private _exp = 0;
  /** Steps left until this egg hatches; 0 if not an egg. */
  stepsToHatch = 0;
  private _hp = 1;
  private _status: Id = "NONE";
  /** Sleep turns left, or 1 if badly poisoned. */
  statusCount = 0;
  private _gender: number | null = null;
  private _shiny: boolean | null = null;
  private _superShiny: boolean | null = null;
  private _abilityIndex: number | null = null;
  private _ability: Id | null = null;
  private _nature: Id | null = null;
  private _natureForStats: Id | null = null;
  private _item: Id | null = null;
  private _mail: Mail | null = null;
  moves: PokemonMove[] = [];
  /** Moves known when obtained (relearnable). */
  firstMoves: Id[] = [];
  ribbons: Id[] = [];
  cool = 0;
  beauty = 0;
  cute = 0;
  smart = 0;
  tough = 0;
  sheen = 0;
  /** Pokérus strain and infection time (strain * 16 + days). */
  pokerus = 0;
  private _name: string | null = null;
  happiness = 0;
  pokeBall: Id = "POKEBALL";
  /** Markings (index = marking, value = colour). */
  markings: number[] = [];
  iv: StatHash = {};
  /** Stats that are treated as having perfect IVs (Hyper Training). */
  ivMaxed: Record<Id, boolean | undefined> = {};
  ev: StatHash = {};
  totalhp = 1;
  attack = 0;
  defense = 0;
  spatk = 0;
  spdef = 0;
  speed = 0;
  owner!: PokemonOwner;
  /** 0 = met, 1 = as egg, 2 = traded, 4 = fateful encounter. */
  obtainMethod = 0;
  obtainMap = 0;
  obtainText: string | null = null;
  obtainLevel = 0;
  hatchedMap = 0;
  private _timeReceived = 0;
  private _timeEggHatched: number | null = null;
  /** Another Pokémon fused into this one (Kyurem/Necrozma/Calyrex). */
  fused: Pokemon | null = null;
  personalID = 0;
  readyToEvolve = false;
  cannotStore = false;
  cannotRelease = false;
  cannotTrade = false;
  // Shadow Pokémon (003_Pokemon_ShadowPokemon.rb)
  shadow: boolean | null = null;
  private _heartGauge: number | null = null;
  private _hyperMode: boolean | null = null;
  savedExp: number | null = null;
  savedEv: StatHash | null = null;
  shadowMoves: (Id | null)[] | null = null;
  heartGaugeStepCounter: number | null = null;
  // Essentials Deluxe
  private _trainerAce = false;
  private _scale: number | null = null;
  // ZUD Mechanics
  private _dynamaxLvl: number | null = 0;
  private _dynamax = false;
  private _reverted = false;
  private _gmaxFactor = false;
  private _dynamaxAble: boolean | null = null;
  // Generation 9 Pack
  private _evoMoveCount: Record<Id, number> | null = null;
  private _evoCrestCount: Record<Id, number> | null = null;
  private _evoRecoilCount: number | null = null;
  private _evoStepCount: number | null = null;
  // Enhanced UI
  private _shinyLeaf: number | null = 0;
  // Pokémon Amie
  private _amieAffection: number | null = null;
  private _amieFullness: number | null = null;
  private _amieEnjoyment: number | null = null;

  /**
   * Creates a new Pokémon object.
   * @param owner the Pokémon's owner (a trainer or an Owner; null for none). Defaults to $player.
   * @param withMoves whether the Pokémon should have moves
   * @param recheckForm whether to auto-check the form
   */
  constructor(species: Id | Species, level: number, owner: PokemonOwner | Trainer | null | undefined = G.player as unknown as Trainer, withMoves = true, recheckForm = true) {
    // ZUD Mechanics / Enhanced UI set their fields before Essentials' initialize.
    this._dynamaxLvl = 0;
    this._dynamax = false;
    this._reverted = false;
    this._gmaxFactor = false;
    this._dynamaxAble = null;
    this._shinyLeaf = 0;
    // --- Essentials ---
    const speciesData = Species.get(species);
    this._species = speciesData.species;
    this._form = speciesData.baseForm();
    this.forcedForm = null;
    this.timeFormSet = null;
    this.level = level;
    this.stepsToHatch = 0;
    this.healStatus();
    this._gender = null;
    this._shiny = null;
    this._abilityIndex = null;
    this._ability = null;
    this._nature = null;
    this._natureForStats = null;
    this._item = null;
    this._mail = null;
    this.moves = [];
    if (withMoves) this.resetMoves();
    this.firstMoves = [];
    this.ribbons = [];
    this.cool = 0;
    this.beauty = 0;
    this.cute = 0;
    this.smart = 0;
    this.tough = 0;
    this.sheen = 0;
    this.pokerus = 0;
    this._name = null;
    this.happiness = speciesData.happiness;
    this.pokeBall = "POKEBALL";
    this.markings = [];
    this.iv = {};
    this.ivMaxed = {};
    this.ev = {};
    for (const s of Stat.eachMain()) {
      this.iv[s.id] = rand(Pokemon.IV_STAT_LIMIT + 1);
      this.ev[s.id] = 0;
    }
    if (owner instanceof PokemonOwner) this.owner = owner;
    else if (owner instanceof Trainer) this.owner = PokemonOwner.newFromTrainer(owner);
    else this.owner = new PokemonOwner(0, "", 2, 2);
    this.obtainMethod = 0; // Met
    if (G.gameSwitches && G.gameSwitches.get(Settings.FATEFUL_ENCOUNTER_SWITCH)) this.obtainMethod = 4;
    this.obtainMap = G.gameMap ? G.gameMap.mapId : 0;
    this.obtainText = null;
    this.obtainLevel = level;
    this.hatchedMap = 0;
    this._timeReceived = nowSeconds();
    this._timeEggHatched = null;
    this.fused = null;
    this.personalID = (rand(2 ** 16) | (rand(2 ** 16) << 16)) >>> 0;
    this._hp = 1;
    this.totalhp = 1;
    this.calcStats();
    if (this._form === 0 && recheckForm) {
      const f = MultipleForms.call("getFormOnCreation", this) as number | null;
      if (f != null) {
        this.form = f;
        if (withMoves) this.resetMoves();
      }
    }
    // --- Generation 9 Pack ---
    this._evoMoveCount = {};
    this._evoCrestCount = {};
    this._evoRecoilCount = 0;
    this._evoStepCount = 0;
    // --- Essentials Deluxe ---
    this._trainerAce = false;
    this._scale = rand(256);
  }

  /** Pokemon.play_cry(species, form) — audio isn't part of the data model; see the cry port. */
  static playCryHook: ((pkmn: Pokemon | Id, form?: number) => void) | null = null;
  static playCry(species: Id, form = 0): void {
    Pokemon.playCryHook?.(species, form);
  }
  playCry(): void {
    Pokemon.playCryHook?.(this);
  }

  inspect(): string {
    return `#<Pokemon ${this._species} Lv.${this._level ?? "???"}>`;
  }

  //=============================================================================
  // Species and form
  //=============================================================================

  /** species_data: the GameData::Species for this species and form. */
  speciesData(): Species {
    return Species.getSpeciesForm(this._species, this.formSimple)!;
  }

  /** The species symbol. Setting it changes the species (and the form, if the new species ID is a form). */
  get species(): Id { return this._species; }
  set species(speciesId: Id) {
    const newSpeciesData = Species.get(speciesId);
    if (this._species === newSpeciesData.species) return;
    this._species = newSpeciesData.species;
    const defaultForm = newSpeciesData.defaultForm();
    if (defaultForm >= 0) this._form = defaultForm;
    else if (newSpeciesData.form > 0) this._form = newSpeciesData.form;
    this.forcedForm = null;
    if (this.singleGendered()) this._gender = null;
    this._level = null; // In case growth rate is different for the new species
    this._ability = null;
    this.calcStats();
  }

  /** isSpecies?(check_species) */
  isSpecies(checkSpecies: Id): boolean {
    return this._species === checkSpecies || (Species.exists(checkSpecies) && this._species === Species.get(checkSpecies).species);
  }

  /** The form, recalculated by the species' getForm handler outside battle/storage. */
  get form(): number {
    if (this.forcedForm != null) return this.forcedForm;
    const temp = G.gameTemp as unknown as { inBattle?: boolean; inStorage?: boolean };
    if (temp.inBattle || temp.inStorage) return this._form;
    const calcForm = MultipleForms.call("getForm", this) as number | null;
    if (calcForm != null && calcForm !== this._form) this.form = calcForm;
    return this._form;
  }

  /** form=: sets the form and runs onSetForm. Its messages aren't awaited; use setForm to wait for them. */
  set form(value: number) {
    const oldForm = this._form;
    this._form = value;
    this._ability = null;
    void MultipleForms.call("onSetForm", this, value, oldForm);
    this.calcStats();
    player()?.pokedex?.register(this);
  }

  /** setForm(value) { block }: like form=, running the block before onSetForm and awaiting it. */
  async setForm(value: number, block?: () => void | Promise<void>): Promise<void> {
    const oldForm = this._form;
    this._form = value;
    this._ability = null;
    if (block) await block();
    await MultipleForms.call("onSetForm", this, value, oldForm);
    this.calcStats();
    player()?.pokedex?.register(this);
  }

  /** form_simple: the form without recalculating it. Setting it skips the form handlers. */
  get formSimple(): number { return this.forcedForm ?? this._form; }
  set formSimple(value: number) {
    this._form = value;
    this.calcStats();
  }

  //=============================================================================
  // Level
  //=============================================================================

  get level(): number {
    if (!this._level) this._level = this.growthRate().levelFromExp(this._exp);
    return this._level;
  }

  set level(value: number) {
    if (value < 1 || value > GrowthRate.maxLevel()) throw new RangeError(_INTL("The level number ({1}) is invalid.", value));
    this._exp = this.growthRate().minimumExpForLevel(value);
    this._level = value;
  }

  get exp(): number { return this._exp; }
  /** Shadow Pokémon store gained Exp. in saved_exp instead. */
  set exp(value: number) {
    if (this.shadowPokemon()) {
      this.savedExp = (this.savedExp ?? 0) + value - this._exp;
    } else {
      this._exp = value;
      this._level = null;
    }
  }

  /** egg? */
  egg(): boolean { return this.stepsToHatch > 0; }

  growthRate(): GrowthRate { return GrowthRate.get(this.speciesData().growthRate); }

  baseExp(): number { return this.speciesData().baseExp; }

  /** exp_fraction: how far through the current level this Pokémon is (0.0-1.0). */
  expFraction(): number {
    const lvl = this.level;
    if (lvl >= GrowthRate.maxLevel()) return 0.0;
    const gRate = this.growthRate();
    const startExp = gRate.minimumExpForLevel(lvl);
    const endExp = gRate.minimumExpForLevel(lvl + 1);
    return (this._exp - startExp) / (endExp - startExp);
  }

  //=============================================================================
  // Status
  //=============================================================================

  get hp(): number { return this._hp; }
  set hp(value: number) {
    this._hp = clamp(value, 0, this.totalhp);
    if (this._hp === 0) this.healStatus();
    if (this._hp === 0) this.readyToEvolve = false;
    // Shadow Pokémon
    if (this._hp <= 0) this._hyperMode = false;
  }

  get status(): Id { return this._status; }
  set status(value: Id) {
    if (!this.able()) return;
    const newStatus = Status.tryGet(value);
    if (!newStatus) throw new TypeError(_INTL("Attempted to set {1} as Pokémon status", typeof value));
    this._status = newStatus.id;
  }

  /** able?: not an egg and not fainted. */
  able(): boolean { return !this.egg() && this._hp > 0; }

  /** fainted? */
  fainted(): boolean { return !this.egg() && this._hp <= 0; }

  healHP(): void {
    if (this.egg()) return;
    this._hp = this.totalhp;
  }

  healStatus(): void {
    if (this.egg()) return;
    this._status = "NONE";
    this.statusCount = 0;
  }

  healPP(moveIndex = -1): void {
    if (this.egg()) return;
    if (moveIndex >= 0) this.moves[moveIndex]!.pp = this.moves[moveIndex]!.totalPp;
    else for (const m of this.moves) m.pp = m.totalPp;
  }

  heal(): void {
    if (this.egg()) return;
    this.healHP();
    this.healStatus();
    this.healPP();
    this.readyToEvolve = false;
  }

  //=============================================================================
  // Types
  //=============================================================================

  types(): Id[] { return [...this.speciesData().types]; }
  /** Deprecated in v20 (use types). */
  type1(): Id { return this.types()[0]!; }
  type2(): Id { const t = this.types(); return t[1] ?? t[0]!; }

  /** hasType?(type) */
  hasType(type: Id): boolean {
    const t = Type.get(type).id;
    return this.types().includes(t);
  }

  //=============================================================================
  // Gender
  //=============================================================================

  /** 0 = male, 1 = female, 2 = genderless; set to 0/1/null (no effect on single-gendered species). */
  get gender(): number {
    if (this._gender == null) {
      const spData = this.speciesData();
      if (spData.singleGendered()) {
        switch (spData.genderRatio) {
          case "AlwaysMale": this._gender = 0; break;
          case "AlwaysFemale": this._gender = 1; break;
          default: this._gender = 2;
        }
      } else {
        const femaleChance = GenderRatio.get(spData.genderRatio).femaleChance!;
        this._gender = (this.personalID & 0xFF) < femaleChance ? 1 : 0;
      }
    }
    return this._gender;
  }

  set gender(value: number | null) {
    if (this.singleGendered()) return;
    if (value == null || value === 0 || value === 1) this._gender = value;
  }

  makeMale(): void { this.gender = 0; }
  makeFemale(): void { this.gender = 1; }
  male(): boolean { return this.gender === 0; }
  female(): boolean { return this.gender === 1; }
  genderless(): boolean { return this.gender === 2; }
  singleGendered(): boolean { return this.speciesData().singleGendered(); }

  //=============================================================================
  // Shininess
  //=============================================================================

  /** shiny? (derived from the personal ID and owner ID unless set) / shiny= */
  get shiny(): boolean {
    if (this._shiny == null) {
      const a = (this.personalID ^ this.owner.id) >>> 0;
      const b = a & 0xFFFF;
      const c = (a >>> 16) & 0xFFFF;
      const d = b ^ c;
      this._shiny = d < Settings.SHINY_POKEMON_CHANCE;
    }
    return this._shiny;
  }
  set shiny(value: boolean | null) { this._shiny = value; }

  /** super_shiny? / super_shiny= (setting it to true also makes it shiny). */
  get superShiny(): boolean {
    if (this._superShiny == null) {
      const a = (this.personalID ^ this.owner.id) >>> 0;
      const b = a & 0xFFFF;
      const c = (a >>> 16) & 0xFFFF;
      const d = b ^ c;
      this._superShiny = d === 0;
    }
    return this._superShiny;
  }
  set superShiny(value: boolean | null) {
    this._superShiny = value;
    if (this._superShiny) this._shiny = true;
  }

  //=============================================================================
  // Ability
  //=============================================================================

  /** 0/1 = natural abilities, 2+ = hidden abilities. */
  get abilityIndex(): number {
    if (this._abilityIndex == null) this._abilityIndex = this.personalID & 1;
    return this._abilityIndex;
  }
  set abilityIndex(value: number | null) {
    this._abilityIndex = value;
    this._ability = null;
  }

  /** The Ability data; set it with an ability ID (or null to recalculate it from ability_index). */
  get ability(): Ability | null { return Ability.tryGet(this.abilityId); }
  set ability(value: Id | null) {
    if (value && !Ability.exists(value)) return;
    this._ability = value ? Ability.get(value).id : value;
  }

  get abilityId(): Id | null {
    if (!this._ability) {
      const spData = this.speciesData();
      let abilIndex = this.abilityIndex;
      if (abilIndex >= 2) { // Hidden ability
        this._ability = spData.hiddenAbilities[abilIndex - 2] ?? null;
        if (!this._ability) abilIndex = this.personalID & 1;
      }
      if (!this._ability) { // Natural ability or no hidden ability defined
        this._ability = spData.abilities[abilIndex] ?? spData.abilities[0] ?? null;
      }
    }
    return this._ability;
  }

  /** hasAbility?(check_ability = nil) */
  hasAbility(checkAbility: Id | null = null): boolean {
    const currentAbility = this.ability;
    if (checkAbility == null) return currentAbility !== null;
    return !!currentAbility && currentAbility.equals(checkAbility);
  }

  /** hasHiddenAbility? */
  hasHiddenAbility(): boolean { return this.abilityIndex >= 2; }

  /** getAbilityList: [[ability ID, index], ...] */
  getAbilityList(): [Id, number][] {
    const ret: [Id, number][] = [];
    const spData = this.speciesData();
    spData.abilities.forEach((a, i) => { if (a) ret.push([a, i]); });
    spData.hiddenAbilities.forEach((a, i) => { if (a) ret.push([a, i + 2]); });
    return ret;
  }

  //=============================================================================
  // Nature
  //=============================================================================

  /** The Nature data (defaults to personalID % number of natures); set it with a nature ID. */
  get nature(): Nature | null {
    if (!this._nature) {
      const idx = this.personalID % Nature.count();
      this._nature = Nature.get(Nature.keys()[idx]!).id;
    }
    return Nature.tryGet(this._nature);
  }
  set nature(value: Id | null) {
    if (value && !Nature.exists(value)) return;
    this._nature = value ? Nature.get(value).id : value;
    if (!this._natureForStats) this.calcStats();
  }

  get natureId(): Id | null { return this._nature; }

  /** The nature used for stat calculation (a Mint's), else the nature. */
  get natureForStats(): Nature | null {
    if (this._natureForStats) return Nature.tryGet(this._natureForStats);
    return this.nature;
  }
  set natureForStats(value: Id | null) {
    if (value && !Nature.exists(value)) return;
    this._natureForStats = value ? Nature.get(value).id : value;
    this.calcStats();
  }

  get natureForStatsId(): Id | null { return this._natureForStats; }

  /**
   * hasNature?(check_nature = nil). With no argument Ruby checks @nature_id,
   * which is never set, so it's always false; kept as is.
   */
  hasNature(checkNature: Id | null = null): boolean {
    if (checkNature == null) return false;
    return !!this.nature && this.nature.equals(checkNature);
  }

  //=============================================================================
  // Items
  //=============================================================================

  /** The held Item data; set it with an item ID or null. */
  get item(): Item | null { return Item.tryGet(this._item); }
  set item(value: Id | null) {
    if (value && !Item.exists(value)) return;
    this._item = value ? Item.get(value).id : value;
  }

  get itemId(): Id | null { return this._item; }

  /** hasItem?(check_item = nil) */
  hasItem(checkItem: Id | null = null): boolean {
    if (checkItem == null) return this._item !== null;
    const heldItem = this.item;
    return !!heldItem && heldItem.equals(checkItem);
  }

  /** [common, uncommon, rare] wild held items. */
  wildHoldItems(): [Id[], Id[], Id[]] {
    const spData = this.speciesData();
    return [spData.wildItemCommon, spData.wildItemUncommon, spData.wildItemRare];
  }

  /** The held mail (dropped if the Pokémon no longer holds its item). */
  get mail(): Mail | null {
    if (this._mail && (!this._mail.item || !this.hasItem(this._mail.item))) this._mail = null;
    return this._mail;
  }
  set mail(mail: Mail | null) {
    if (mail != null && !(mail instanceof Mail)) throw new TypeError(`Invalid value ${String(mail)} given`);
    this._mail = mail;
  }

  //=============================================================================
  // Moves
  //=============================================================================

  numMoves(): number { return this.moves.length; }

  /** hasMove?(move_id) */
  hasMove(moveId: Id | null): boolean {
    const moveData = MoveData.tryGet(moveId);
    if (!moveData) return false;
    return this.moves.some((m) => m.id === moveData.id);
  }

  /** The level-up moveset: [{level, move}] (Ruby's [level, move] pairs). */
  getMoveList(): LevelUpMove[] { return this.speciesData().moves; }

  /** reset_moves: the last 4 moves learnable by level (Generation 9 Pack: ignoring level -1 moves). */
  resetMoves(): void {
    const thisLevel = this.level;
    const moveset = this.getMoveList();
    let knowableMoves: Id[] = [];
    for (const m of moveset) if (m.level >= 0 && m.level <= thisLevel) knowableMoves.push(m.move);
    // reverse, uniq (keeps the last occurrence of each), reverse back
    knowableMoves = [...new Set(knowableMoves.reverse())].reverse();
    this.moves.length = 0;
    const firstMoveIndex = Math.max(knowableMoves.length - Pokemon.MAX_MOVES, 0);
    for (let i = firstMoveIndex; i < knowableMoves.length; i++) this.moves.push(new PokemonMove(knowableMoves[i]!));
  }

  /** learn_move: adds the move (or moves it to the end if known), forgetting the first if there are too many. */
  learnMove(moveId: Id): void {
    const moveData = MoveData.tryGet(moveId);
    if (!moveData) return;
    // Move the Pokémon's existing move to the end of its moveset
    for (let i = 0; i < this.moves.length; i++) {
      const m = this.moves[i]!;
      if (m.id !== moveData.id) continue;
      this.moves.push(m);
      this.moves.splice(i, 1);
      return;
    }
    // Pokémon doesn't know the move; learn it
    this.moves.push(new PokemonMove(moveData.id));
    // Delete the first known move if self now knows more moves than it should
    if (this.numMoves() > Pokemon.MAX_MOVES) this.moves.shift();
  }

  forgetMove(moveId: Id): void {
    const moveData = MoveData.tryGet(moveId);
    if (!moveData) return;
    this.moves = this.moves.filter((m) => m.id !== moveData.id);
  }

  forgetMoveAtIndex(index: number): void {
    if (index >= 0 && index < this.moves.length) this.moves.splice(index, 1);
  }

  forgetAllMoves(): void { this.moves.length = 0; }

  recordFirstMoves(): void {
    this.clearFirstMoves();
    for (const m of this.moves) this.firstMoves.push(m.id);
  }

  addFirstMove(moveId: Id): void {
    const moveData = MoveData.tryGet(moveId);
    if (moveData && !this.firstMoves.includes(moveData.id)) this.firstMoves.push(moveData.id);
  }

  removeFirstMove(moveId: Id): void {
    const moveData = MoveData.tryGet(moveId);
    if (moveData) this.firstMoves = this.firstMoves.filter((m) => m !== moveData.id);
  }

  clearFirstMoves(): void { this.firstMoves.length = 0; }

  /** compatible_with_move?(move_id): can be taught it by a TM/tutor. */
  compatibleWithMove(moveId: Id): boolean {
    const moveData = MoveData.tryGet(moveId);
    return !!moveData && this.speciesData().tutorMoves.includes(moveData.id);
  }

  /** can_relearn_move? */
  canRelearnMove(): boolean {
    if (this.egg() || this.shadowPokemon()) return false;
    const thisLevel = this.level;
    for (const m of this.getMoveList()) if (m.level <= thisLevel && !this.hasMove(m.move)) return true;
    for (const m of this.firstMoves) if (!this.hasMove(m)) return true;
    return false;
  }

  //=============================================================================
  // Ribbons
  //=============================================================================

  numRibbons(): number { return this.ribbons.length; }

  hasRibbon(ribbon: Id): boolean {
    const ribbonData = Ribbon.tryGet(ribbon);
    return !!ribbonData && this.ribbons.includes(ribbonData.id);
  }

  giveRibbon(ribbon: Id): void {
    const ribbonData = Ribbon.tryGet(ribbon);
    if (!ribbonData || this.ribbons.includes(ribbonData.id)) return;
    this.ribbons.push(ribbonData.id);
  }

  /** upgradeRibbon(*args): replaces the first ribbon held with the next in the list, or gives the first. */
  upgradeRibbon(...args: Id[]): Id | null {
    for (let i = 0; i < args.length; i++) {
      const thisRibbonData = Ribbon.tryGet(args[i]!);
      if (!thisRibbonData) continue;
      for (let j = 0; j < this.ribbons.length; j++) {
        if (this.ribbons[j] !== thisRibbonData.id) continue;
        const nextRibbonData = Ribbon.tryGet(args[i + 1]);
        if (!nextRibbonData) continue;
        this.ribbons[j] = nextRibbonData.id;
        return this.ribbons[j]!;
      }
    }
    const firstRibbonData = Ribbon.tryGet(args[0]);
    const lastRibbonData = Ribbon.tryGet(args[args.length - 1]);
    if (firstRibbonData && lastRibbonData && !this.hasRibbon(lastRibbonData.id)) {
      this.giveRibbon(firstRibbonData.id);
      return firstRibbonData.id;
    }
    return null;
  }

  takeRibbon(ribbon: Id): void {
    const ribbonData = Ribbon.tryGet(ribbon);
    if (!ribbonData) return;
    const i = this.ribbons.indexOf(ribbonData.id);
    if (i < 0) throw new TypeError("no implicit conversion from nil to integer"); // Ruby's delete_at(nil)
    this.ribbons.splice(i, 1);
  }

  clearAllRibbons(): void { this.ribbons.length = 0; }

  //=============================================================================
  // Pokérus
  //=============================================================================

  pokerusStrain(): number { return Math.floor(this.pokerus / 16); }

  /** 0 = not infected, 1 = infected, 2 = cured. */
  pokerusStage(): number {
    if (this.pokerus === 0) return 0;
    return this.pokerus % 16 === 0 ? 2 : 1;
  }

  givePokerus(strain = 0): void {
    if (this.pokerusStage() === 2) return; // Can't re-infect a cured Pokémon
    const s = stats();
    if (s) s.pokerusInfections += 1;
    if (strain <= 0 || strain >= 16) strain = 1 + rand(15);
    const time = 1 + (strain % 4);
    this.pokerus = time;
    this.pokerus |= strain << 4;
  }

  resetPokerusTime(): void {
    if (this.pokerus === 0) return;
    const strain = Math.floor(this.pokerus / 16);
    const time = 1 + (strain % 4);
    this.pokerus = time;
    this.pokerus |= strain << 4;
  }

  lowerPokerusCount(): void {
    if (this.pokerusStage() !== 1) return;
    this.pokerus -= 1;
  }

  curePokerus(): void {
    this.pokerus -= this.pokerus % 16;
  }

  //=============================================================================
  // Ownership, obtained information
  //=============================================================================

  /** foreign?(trainer = $player) */
  foreign(trainer: Trainer = G.player as unknown as Trainer): boolean {
    return this.owner.id !== trainer.id || this.owner.name !== trainer.name;
  }

  /** Time received (Ruby Time; here a Date). */
  get timeReceived(): Date { return new Date(this._timeReceived * 1000); }
  set timeReceived(value: Date | number) { this._timeReceived = toSeconds(value); }

  /** Time the egg hatched, or null if it wasn't obtained as an egg. */
  get timeEggHatched(): Date | null {
    return this.obtainMethod === 1 ? new Date((this._timeEggHatched ?? 0) * 1000) : null;
  }
  set timeEggHatched(value: Date | number) { this._timeEggHatched = toSeconds(value); }

  //=============================================================================
  // Other
  //=============================================================================

  /** The nickname, or the species name. Setting the species name (or "") clears the nickname. */
  get name(): string { return this.nicknamed() ? this._name! : this.speciesName(); }
  set name(value: string | null) {
    if (!value || value === "" || value === this.speciesName()) value = null;
    this._name = value;
  }

  /** nicknamed? */
  nicknamed(): boolean { return !!this._name; }

  speciesName(): string { return this.speciesData().name; }

  /** Height in 0.1 m. */
  height(): number { return this.speciesData().height; }
  /** Weight in 0.1 kg. */
  weight(): number { return this.speciesData().weight; }

  /** evYield: EVs given when defeated. */
  evYield(): StatHash {
    const thisEvs = this.speciesData().evs;
    const ret: StatHash = {};
    for (const s of Stat.eachMain()) ret[s.id] = thisEvs[s.id]!;
    return ret;
  }

  /** affection_level: 0-5 from happiness. */
  affectionLevel(): number {
    const h = this.happiness;
    if (h >= 0 && h < 100) return 0;
    if (h >= 100 && h < 150) return 1;
    if (h >= 150 && h < 200) return 2;
    if (h >= 200 && h < 230) return 3;
    if (h >= 230 && h < 255) return 4;
    return 5; // 255
  }

  /** changeHappiness(method). Shadow Pokémon at heart stage 4+ aren't affected. */
  changeHappiness(method: string): void {
    if (this.shadowPokemon() && this.heartStage() >= 4) return;
    let gain = 0;
    const happinessRange = Math.floor(this.happiness / 100);
    const pick = (a: number[]) => a[happinessRange]!;
    switch (method) {
      case "walking": gain = pick([2, 2, 1]); break;
      case "levelup": gain = pick([5, 4, 3]); break;
      case "groom": gain = pick([10, 10, 4]); break;
      case "evberry": gain = pick([10, 5, 2]); break;
      case "vitamin": gain = pick([5, 3, 2]); break;
      case "wing": gain = pick([3, 2, 1]); break;
      case "machine": case "battleitem": gain = pick([1, 1, 0]); break;
      case "faint": gain = -1; break;
      case "faintbad": gain = pick([-5, -5, -10]); break; // Fainted against an opponent that is 30+ levels higher
      case "powder": gain = pick([-5, -5, -10]); break;
      case "energyroot": gain = pick([-10, -10, -15]); break;
      case "revivalherb": gain = pick([-15, -15, -20]); break;
      default: throw new Error(_INTL("Unknown happiness-changing method: {1}", method));
    }
    if (gain > 0) {
      if (this.obtainMap === G.gameMap?.mapId) gain += 1;
      if (this.pokeBall === "LUXURYBALL") gain += 1;
      if (this.hasItem("SOOTHEBELL")) gain = Math.floor(gain * 1.5);
      // Deliberate fix: Ruby's gain.clamp(0, 179 - happiness) raises (and the
      // original game crashes) once happiness is above 179. The soft cap means
      // these gains stop at 179, so above it they add nothing.
      if (Settings.APPLY_HAPPINESS_SOFT_CAP && method !== "evberry") gain = Math.max(0, Math.min(gain, 179 - this.happiness));
    }
    this.happiness = clamp(this.happiness + gain, 0, 255);
  }

  //=============================================================================
  // Evolution checks
  //=============================================================================

  /** The species this Pokémon would evolve into by levelling up, or null. */
  checkEvolutionOnLevelUp(): Id | null {
    return this.checkEvolutionInternal((pkmn, newSpecies, method, parameter) =>
      (Evolution.get(method).callLevelUp(pkmn, parameter) ? newSpecies : null));
  }

  checkEvolutionOnUseItem(itemUsed: Id): Id | null {
    return this.checkEvolutionInternal((pkmn, newSpecies, method, parameter) =>
      (Evolution.get(method).callUseItem(pkmn, parameter, itemUsed) ? newSpecies : null));
  }

  checkEvolutionOnTrade(otherPkmn: Pokemon): Id | null {
    return this.checkEvolutionInternal((pkmn, newSpecies, method, parameter) =>
      (Evolution.get(method).callOnTrade(pkmn, parameter, otherPkmn) ? newSpecies : null));
  }

  checkEvolutionAfterBattle(partyIndex: number): Id | null {
    return this.checkEvolutionInternal((pkmn, newSpecies, method, parameter) =>
      (Evolution.get(method).callAfterBattle(pkmn, partyIndex, parameter) ? newSpecies : null));
  }

  checkEvolutionByEvent(value: unknown = 0): Id | null {
    return this.checkEvolutionInternal((pkmn, newSpecies, method, parameter) =>
      (Evolution.get(method).callEvent(pkmn, parameter, value) ? newSpecies : null));
  }

  /** action_after_evolution: runs the after_evolution procs (Shedinja, held item consumption...). */
  actionAfterEvolution(newSpecies: Id): void {
    for (const evo of this.speciesData().getEvolutions(true)) { // [new_species, method, parameter]
      if (Evolution.get(evo[1]).callAfterEvolution(this, evo[0], evo[2], newSpecies)) break;
    }
  }

  checkEvolutionInternal(check: (pkmn: Pokemon, newSpecies: Id, method: Id, parameter: number | string | null) => Id | null): Id | null {
    if (this.egg() || this.shadowPokemon()) return null;
    if (this.hasItem("EVERSTONE")) return null;
    if (this.hasAbility("BATTLEBOND")) return null;
    for (const evo of this.speciesData().getEvolutions(true)) { // [new_species, method, parameter]
      const ret = check(this, evo[0], evo[1], evo[2]);
      if (ret) return ret;
    }
    return null;
  }

  /** trigger_event_evolution(number): runs the evolution scene (pbFadeOutInWithMusic) if an Event evolution matches. */
  async triggerEventEvolution(number: number): Promise<boolean> {
    const newSpecies = this.checkEvolutionByEvent(number);
    if (newSpecies) {
      // The one evolution scene path (game/items/itemUtilities.ts), loaded on demand to avoid an import cycle.
      const { pbItemEvolutionScene } = await import("../items/itemUtilities");
      await pbItemEvolutionScene(this, newSpecies, true);
      return true;
    }
    return false;
  }

  //=============================================================================
  // Stat calculations
  //=============================================================================

  /** baseStats (Essentials Deluxe: a form handler's "baseStats" wins, e.g. Gigantamax Eternatus). */
  baseStats(): StatHash {
    const thisBaseStats = this.speciesData().baseStats;
    const baseStats: StatHash = {};
    for (const s of Stat.eachMain()) baseStats[s.id] = thisBaseStats[s.id]!;
    const formStats = MultipleForms.call("baseStats", this) as StatHash | null;
    return formStats ?? baseStats;
  }

  /** calcIV: IVs with Hyper Training applied. */
  calcIV(): StatHash {
    const thisIvs = this.iv;
    const ret: StatHash = {};
    for (const s of Stat.eachMain()) ret[s.id] = this.ivMaxed[s.id] ? Pokemon.IV_STAT_LIMIT : thisIvs[s.id]!;
    return ret;
  }

  /** calcHP (ZUD: multiplied by the Dynamax boost). */
  calcHP(base: number, level: number, iv: number, ev: number): number {
    if (base === 1) return 1; // For Shedinja
    return Math.ceil((Math.floor((((base * 2) + iv + Math.floor(ev / 4)) * level) / 100) + level + 10) * this.dynamaxBoost());
  }

  calcStat(base: number, level: number, iv: number, ev: number, nat: number): number {
    return Math.floor(((Math.floor((((base * 2) + iv + Math.floor(ev / 4)) * level) / 100) + 5) * nat) / 100);
  }

  /** calc_stats (ZUD Mechanics' version, handling Dynamax HP). */
  calcStats(): void {
    if (this.shouldForceRevert()) {
      if (this.dynamax) this._reverted = true;
      this._dynamax = false;
      this._gmaxFactor = false;
    }
    const baseStats = this.baseStats();
    const thisLevel = this.level;
    const thisIV = this.calcIV();
    const natureMod: StatHash = {};
    for (const s of Stat.eachMain()) natureMod[s.id] = 100;
    const thisNature = this.natureForStats;
    if (thisNature) for (const change of thisNature.statChanges) natureMod[change[0]]! += change[1];
    const st: StatHash = {};
    for (const s of Stat.eachMain()) {
      if (s.id === "HP") st[s.id] = this.calcHP(baseStats[s.id]!, thisLevel, thisIV[s.id]!, this.ev[s.id]!);
      else st[s.id] = this.calcStat(baseStats[s.id]!, thisLevel, thisIV[s.id]!, this.ev[s.id]!, natureMod[s.id]!);
    }
    const oldHpDiff = this.totalhp - this._hp; // For Eternatus
    if (this.dynamax && !this.reverted()) {
      this.totalhp = st.HP!;
      this.hp = Math.ceil(this._hp * this.dynamaxCalc());
      if (this.canEmax()) this.hp = Math.max(this.totalhp - oldHpDiff, 1);
    } else if (this.reverted() && !this.dynamax) {
      this.totalhp = st.HP!;
      this.hp = Math.round(this._hp / this.dynamaxCalc());
      if (this.canEmax()) this.hp = Math.max(this.totalhp - oldHpDiff, 1);
    } else {
      const hpDifference = st.HP! - this.totalhp;
      this.totalhp = st.HP!;
      if (this._hp > 0 || hpDifference > 0) this.hp = Math.max(this._hp + hpDifference, 1);
    }
    this.attack = st.ATTACK!;
    this.defense = st.DEFENSE!;
    this.spatk = st.SPECIAL_ATTACK!;
    this.spdef = st.SPECIAL_DEFENSE!;
    this.speed = st.SPEED!;
    if (this.shouldForceRevert()) {
      this._dynamaxLvl = 0;
      this._reverted = false;
      this._dynamaxAble = false;
    }
  }

  //=============================================================================
  // Pokémon creation
  //=============================================================================

  /** clone: a deep copy (Ruby clones the stats hashes, moves, owner and ribbons). */
  clone(): Pokemon {
    return Pokemon.fromJSON(JSON.parse(JSON.stringify(this.toJSON())) as PokemonJSON);
  }

  //=============================================================================
  // Mega Evolution / Primal Reversion (002_Pokemon_MegaEvolution.rb)
  //=============================================================================

  /** getMegaForm: the Mega form this Pokémon can turn into with its item/move, or 0. */
  getMegaForm(): number {
    let ret = 0;
    for (const data of Species.each()) {
      if (data.species !== this._species || data.unmegaForm !== this.formSimple) continue;
      if (data.megaStone && this.hasItem(data.megaStone)) {
        ret = data.form;
        break;
      } else if (data.megaMove && this.hasMove(data.megaMove)) {
        ret = data.form;
        break;
      }
    }
    return ret; // form number, or 0 if no accessible Mega form
  }

  getUnmegaForm(): number { return this.mega() ? this.speciesData().unmegaForm : -1; }

  hasMegaForm(): boolean {
    const megaForm = this.getMegaForm();
    return megaForm > 0 && megaForm !== this.formSimple;
  }

  /** mega? */
  mega(): boolean {
    const spData = this.speciesData();
    return !!(spData.megaStone || spData.megaMove);
  }

  makeMega(): void {
    const megaForm = this.getMegaForm();
    if (megaForm > 0) this.form = megaForm;
  }

  makeUnmega(): void {
    const unmegaForm = this.getUnmegaForm();
    if (unmegaForm >= 0) this.form = unmegaForm;
  }

  megaName(): string {
    const formName = this.speciesData().formName;
    return formName ? formName : _INTL("Mega {1}", this.speciesData().name);
  }

  /** 0 = default message, 1 = Rayquaza message. */
  megaMessage(): number {
    const megaForm = this.getMegaForm();
    return Species.getSpeciesForm(this._species, megaForm)?.megaMessage ?? 0;
  }

  hasPrimalForm(): boolean { return MultipleForms.call("getPrimalForm", this) != null; }

  /** primal? */
  primal(): boolean {
    const v = MultipleForms.call("getPrimalForm", this);
    return v != null && v === this._form;
  }

  makePrimal(): void {
    const v = MultipleForms.call("getPrimalForm", this) as number | null;
    if (v != null) this.form = v;
  }

  makeUnprimal(): void {
    const v = MultipleForms.call("getUnprimalForm", this) as number | null;
    if (v != null) this.form = v;
    else if (this.primal()) this.form = 0;
  }

  /** Essentials Deluxe: getPrimalForm (the current form if there's no Primal form). */
  getPrimalForm(): number {
    const v = MultipleForms.call("getPrimalForm", this) as number | null;
    return v ?? this._form;
  }

  //=============================================================================
  // Shadow Pokémon (003_Pokemon_ShadowPokemon.rb, v20.1 Hotfixes)
  //=============================================================================

  get heartGauge(): number { return this._heartGauge ?? 0; }
  set heartGauge(value: number | null) { this._heartGauge = value; }

  shadowData(): ShadowPokemon | null {
    let ret = ShadowPokemon.tryGet(this.speciesData().id);
    if (!ret) ret = ShadowPokemon.tryGet(this._species);
    return ret;
  }

  maxGaugeSize(): number {
    const data = this.shadowData();
    return data ? data.gaugeSize : ShadowPokemon.HEART_GAUGE_SIZE;
  }

  adjustHeart(value: number): void {
    if (!this.shadowPokemon()) return;
    this._heartGauge = clamp(this.heartGauge + value, 0, this.maxGaugeSize());
  }

  changeHeartGauge(method: string, multiplier = 1): void {
    if (!this.shadowPokemon()) return;
    const heartAmounts: Record<Id, number[]> = {
      HARDY: [110, 300, 100, 90],
      LONELY: [70, 330, 100, 130],
      BRAVE: [130, 270, 90, 80],
      ADAMANT: [110, 270, 110, 80],
      NAUGHTY: [120, 270, 110, 70],
      BOLD: [110, 270, 90, 100],
      DOCILE: [100, 360, 80, 120],
      RELAXED: [90, 270, 110, 100],
      IMPISH: [120, 300, 100, 80],
      LAX: [100, 270, 90, 110],
      TIMID: [70, 330, 110, 120],
      HASTY: [130, 300, 70, 100],
      SERIOUS: [100, 330, 110, 90],
      JOLLY: [120, 300, 90, 90],
      NAIVE: [100, 300, 120, 80],
      MODEST: [70, 300, 120, 110],
      MILD: [80, 270, 100, 120],
      QUIET: [100, 300, 100, 100],
      BASHFUL: [80, 300, 90, 130],
      RASH: [90, 300, 90, 120],
      CALM: [80, 300, 110, 110],
      GENTLE: [70, 300, 130, 100],
      SASSY: [130, 240, 100, 70],
      CAREFUL: [90, 300, 100, 110],
      QUIRKY: [130, 270, 80, 90],
    };
    const amounts = this._nature ? heartAmounts[this._nature] : undefined;
    let amt = 100;
    switch (method) {
      case "battle": amt = amounts ? amounts[0]! : 100; break;
      case "call": amt = amounts ? amounts[1]! : 300; break;
      case "walking": amt = amounts ? amounts[2]! : 100; break;
      case "scent":
        amt = amounts ? amounts[3]! : 100;
        amt *= multiplier;
        break;
      default: throw new Error(_INTL("Unknown heart gauge-changing method: {1}", method));
    }
    this.adjustHeart(-amt);
  }

  heartStage(): number {
    if (!this.shadowPokemon()) return 0;
    const maxSize = this.maxGaugeSize();
    const stageSize = maxSize / 5.0;
    return Math.ceil(Math.min(this.heartGauge, maxSize) / stageSize);
  }

  /** shadowPokemon? */
  shadowPokemon(): boolean {
    return !!this.shadow && this._heartGauge != null && this._heartGauge >= 0;
  }

  get hyperMode(): boolean {
    return this.heartGauge === 0 || this._hp === 0 ? false : !!this._hyperMode;
  }
  set hyperMode(value: boolean) { this._hyperMode = value; }

  makeShadow(): void {
    this.shadow = true;
    this._hyperMode = false;
    this.savedExp = 0;
    this.savedEv = {};
    for (const s of Stat.eachMain()) this.savedEv[s.id] = 0;
    this._heartGauge = this.maxGaugeSize();
    this.heartGaugeStepCounter = 0;
    this.shadowMoves = [];
    // Retrieve Shadow moveset for this Pokémon
    const data = this.shadowData();
    if (data) {
      for (const m of data.moves) {
        if (MoveData.exists(m)) this.shadowMoves.push(m);
        if (this.shadowMoves.length >= Pokemon.MAX_MOVES) break;
      }
    }
    // Record this Pokémon's Shadow moves
    if (this.shadowMoves.length === 0 && MoveData.exists("SHADOWRUSH")) this.shadowMoves.push("SHADOWRUSH");
    // Record this Pokémon's original moves
    if (this.shadowMoves.length > 0) {
      this.moves.forEach((m, i) => { this.shadowMoves![Pokemon.MAX_MOVES + i] = m.id; });
      this.updateShadowMoves();
    }
  }

  /** update_shadow_moves (v20.1 Hotfixes version; the parameter is ignored). */
  updateShadowMoves(_param: unknown = null): void {
    if (!this.shadowMoves || this.shadowMoves.length === 0) return;
    // Not a Shadow Pokémon (any more); relearn all its original moves
    if (!this.shadowPokemon()) {
      if (this.shadowMoves.length > Pokemon.MAX_MOVES) {
        const newMoves: Id[] = [];
        this.shadowMoves.forEach((m, i) => { if (m && i >= Pokemon.MAX_MOVES) newMoves.push(m); });
        this.replaceMoves(newMoves);
      }
      this.shadowMoves = null;
      return;
    }
    // Is a Shadow Pokémon; ensure it knows the appropriate moves depending on its heart stage
    // Start with all Shadow moves
    const newMoves: Id[] = [];
    this.shadowMoves.forEach((m, i) => { if (m && i < Pokemon.MAX_MOVES) newMoves.push(m); });
    const numShadowMoves = newMoves.length;
    // Add some original moves (skipping ones in the same slot as a Shadow Move)
    const numOriginalMoves = [3, 3, 2, 1, 1, 0][this.heartStage()]!;
    if (numOriginalMoves > 0) {
      let relearnedCount = 0;
      for (let i = 0; i < this.shadowMoves.length; i++) {
        const m = this.shadowMoves[i];
        if (!m || i < Pokemon.MAX_MOVES + numShadowMoves) continue;
        newMoves.push(m);
        relearnedCount += 1;
        if (relearnedCount >= numOriginalMoves) break;
      }
    }
    // Relearn Shadow moves plus some original moves (may not change anything)
    this.replaceMoves(newMoves);
  }

  /** replace_moves (v20.1 Hotfixes version). */
  replaceMoves(newMoves: (Id | null)[]): void {
    // Forget any known moves that aren't in new_moves
    this.moves = this.moves.filter((m) => newMoves.includes(m.id));
    // Learn any moves in new_moves that aren't known
    for (const move of newMoves) {
      if (!move || !MoveData.exists(move) || this.hasMove(move)) continue;
      if (this.numMoves() >= Pokemon.MAX_MOVES) break;
      this.learnMove(move);
    }
  }

  /** purifiable? */
  purifiable(): boolean {
    if (!this.shadowPokemon() || this.heartGauge > 0) return false;
    if (this.isSpecies("LUGIA")) return false;
    return true;
  }

  async checkReadyToPurify(): Promise<void> {
    if (!this.shadowPokemon()) return;
    this.updateShadowMoves();
    if (this.heartGauge === 0) await pbMessageHook(_INTL("{1} can now be purified!", this.name));
  }

  /** add_evs(added_evs): adds EVs respecting the per-stat and total limits. */
  addEvs(addedEvs: StatHash): void {
    let total = 0;
    for (const e of Object.values(this.ev)) total += e;
    for (const s of Stat.eachMain()) {
      let addition = clamp(addedEvs[s.id]!, 0, Pokemon.EV_STAT_LIMIT - this.ev[s.id]!);
      addition = clamp(addition, 0, Pokemon.EV_LIMIT - total);
      if (addition === 0) continue;
      this.ev[s.id]! += addition;
      total += addition;
    }
  }

  //=============================================================================
  // Essentials Deluxe
  //=============================================================================

  /** ace? / ace= : the trainer's ace (changes battle music etc.). */
  get ace(): boolean { return this._trainerAce || false; }
  set ace(value: boolean) { this._trainerAce = value; }

  /** Size (0-255) for the size display; random on creation. */
  get scale(): number { return this._scale ?? 100; }
  set scale(value: number) { this._scale = clamp(value, 0, 255); }

  nameTitle(): string { return this.name; }

  /** tera? (Terastal Phenomenon isn't installed.) */
  tera(): boolean { return false; }
  /** celestial? (Pokémon Birthsigns isn't installed.) */
  celestial(): boolean { return false; }

  /** check_for_attribute(attribute, value): used by pbNumOwnedSpecies. */
  checkForAttribute(attribute: string | null, value: unknown): boolean {
    switch (attribute) {
      case "level": return this.level === value;
      case "form": return this.form === value;
      case "pokerus": return this.pokerusStage() === value;
      case "ball": return this.pokeBall === value;
      case "shiny": return value ? this.shiny : !this.shiny;
      case "shadow": return value ? this.shadowPokemon() : !this.shadowPokemon();
      case "hatched": return value ? this.timeEggHatched !== null : !this.timeEggHatched;
      case "foreign": return value ? this.foreign() : !this.foreign();
      case "gmax": return value ? this.gmaxFactor : !this.gmaxFactor;
      case "celestial": return value ? this.celestial() : !this.celestial();
      case "gender": return value === 1 ? this.female() : this.male();
      case "item": return this.hasItem(value as Id);
      case "move": return this.hasMove(value as Id);
      case "ribbon": return this.hasRibbon(value as Id);
      case "nature": return this.hasNature(value as Id);
      case "ability": return this.hasAbility(value as Id);
      // teratype / focus / blessed / birthsign need plugins that aren't installed (NoMethodError in Ruby).
      default: return true;
    }
  }

  //=============================================================================
  // ZUD Mechanics ([001] Data/Data_Pokemon.rb)
  //=============================================================================

  get dynamaxLvl(): number { return this._dynamaxLvl || 0; }
  set dynamaxLvl(value: number | null) {
    this._dynamaxLvl = this.dynamaxAble ? value : 0;
    if (this.dynamaxLvl > 10) this._dynamaxLvl = 10;
    if (this.dynamaxLvl < 0) this._dynamaxLvl = 0;
  }

  /** raid_dmax_lvl= (no upper cap). */
  set raidDmaxLvl(value: number) {
    this._dynamaxLvl = this.dynamaxAble ? value : 0;
    if (this.dynamaxLvl < 0) this._dynamaxLvl = 0;
  }

  /** gmax_factor? / gmax_factor= */
  get gmaxFactor(): boolean { return this._gmaxFactor || false; }
  set gmaxFactor(value: boolean) { this._gmaxFactor = this.dynamaxAble ? value : false; }

  /** dynamax? / dynamax= */
  get dynamax(): boolean { return this._dynamax || false; }
  set dynamax(value: boolean) {
    if (this.tera()) {
      this.unmax();
    } else {
      if (this.speciesData().id === "ETERNATUS") this._gmaxFactor = value;
      this._dynamax = this.dynamaxAble ? value : false;
      this._reverted = this.dynamaxAble ? !value : false;
      player()?.pokedex?.register(this);
    }
  }

  /** reverted? */
  reverted(): boolean { return this._reverted || false; }
  set reversion(value: boolean) { this._reverted = this.dynamaxAble ? value : false; }

  unmax(): void {
    if (this.dynamax) {
      this._dynamax = false;
      this._reverted = true;
    }
    this.calcStats();
    this._reverted = false;
  }

  /** dynamax_able? / dynamax_able= */
  get dynamaxAble(): boolean {
    if (this.egg() || this.shadowPokemon() || this.tera() || this.celestial()) return false;
    return this._dynamaxAble != null ? this._dynamaxAble : !this.speciesData().noDynamax;
  }
  set dynamaxAble(value: boolean) {
    this._dynamaxAble = this.speciesData().noDynamax ? false : value;
  }

  /** should_force_revert? */
  shouldForceRevert(): boolean {
    if (this.shadowPokemon() || this.celestial()) return true;
    if (!this._dynamaxAble && this._dynamaxAble != null) return true;
    const inBattleForm = this.mega() || this.primal() || this.ultra() || this.tera();
    if ((this.dynamax || this.reverted()) && inBattleForm) return true;
    if (this.speciesData().noDynamax && !inBattleForm) return true;
    return false;
  }

  /** hasGmax? */
  hasGmax(): boolean {
    if (!this.dynamaxAble) return false;
    return PowerMove.speciesList("G-Max").includes(this.speciesData().id);
  }

  /** canGmax? */
  canGmax(): boolean { return this.hasGmax() && this.gmaxFactor; }

  /** gmax? */
  get gmax(): boolean {
    if (this.dynamax && this.gmaxFactor) {
      if (this.hasGmax() || this.speciesData().id === "ETERNATUS") return true;
    }
    return false;
  }

  /** canEmax? */
  canEmax(): boolean {
    if (!this.dynamaxAble) return false;
    return this.speciesData().id === "ETERNATUS" && this.gmaxFactor;
  }

  getUltraForm(): number {
    if (!this.compatUltra(this.itemId)) return 0;
    return PowerMove.ultraFrom(this.itemId, this.speciesData().id) ?? 0;
  }

  getUnUltraForm(): number {
    let ret = -1;
    for (const data of PowerMove.each()) {
      if (!data.isUltra()) continue;
      const species = Species.get(data.species[0]!).species;
      const ultraSpecies = `${species}_${data.ultra}`;
      if (this.speciesData().id !== ultraSpecies) continue;
      ret = Species.get(data.species[0]!).form;
    }
    return ret;
  }

  hasUltraForm(): boolean {
    const ultraForm = this.getUltraForm();
    return ultraForm > 0 && ultraForm !== this.formSimple;
  }

  /** ultra? */
  ultra(): boolean { return this.getUnUltraForm() !== -1; }

  makeUltra(): void {
    const ultraForm = this.getUltraForm();
    if (ultraForm > 0) this.form = ultraForm;
  }

  makeUnUltra(): void {
    const unUltraForm = this.getUnUltraForm();
    if (unUltraForm >= 0) this.form = unUltraForm;
  }

  ultraName(): string {
    const formName = this.speciesData().formName;
    return formName ? formName : _INTL("Ultra {1}", this.speciesData().name);
  }

  /** compat_zmove?(param, equipping = nil, transform = nil) */
  compatZmove(param: MoveLike[] | MoveLike | Id, equipping: Id | null = null, transform: Id | null = null): boolean {
    if (this.egg() || this.shadowPokemon() || this.celestial()) return false;
    const item = equipping ? equipping : this.itemId;
    const species = transform ? transform : this.speciesData().id;
    return PowerMove.compat("Z-Move", param, item, species);
  }

  /** compat_ultra?(equipping = nil) */
  compatUltra(equipping: Id | null = null): boolean {
    if (this.egg() || this.shadowPokemon() || this.celestial()) return false;
    const item = equipping ? equipping : this.itemId;
    return PowerMove.compat("Ultra", item, this.speciesData().id);
  }

  /** compat_maxmove?(param, transform = nil) */
  compatMaxmove(param: MoveLike[] | MoveLike | Id, transform: Id | null = null): boolean {
    if (this.egg() || this.shadowPokemon() || this.celestial()) return false;
    const species = transform ? transform : this.speciesData().id;
    return PowerMove.compat("Max Move", param, species);
  }

  getZmove(param: MoveLike[] | MoveLike | Id, item: Id | null = null, transform: Id | null = null): Id | null {
    if (!this.compatZmove(param, null, transform) && item != null) return null;
    const species = transform ? transform : this.speciesData().id;
    return PowerMove.zmoveFrom(param, item, species);
  }

  getMaxmove(param: MoveLike[] | MoveLike | Id, category: number | null = null, transform: Id | null = null): Id | null {
    if (!this.compatMaxmove(param, transform)) return null;
    if (category === 2) return "MAXGUARD";
    const species = transform ? transform : this.speciesData().id;
    const gmax = Species.get(species).hasGmax() && this.gmaxFactor;
    return PowerMove.maxmoveFrom(param, species, gmax);
  }

  /** real_hp: HP without the Dynamax boost (Ruby Integer/Float division as written). */
  realHp(): number { const b = this.dynamaxBoost(); return b === 1 ? this._hp : this._hp / b; }
  realTotalhp(): number { const b = this.dynamaxBoost(); return b === 1 ? this.totalhp : this.totalhp / b; }
  dynamaxCalc(): number { return 1.5 + (this.dynamaxLvl * 0.05); }
  dynamaxBoost(): number { return this.dynamax ? this.dynamaxCalc() : 1; }

  /** calc_lair_evs: random EV spread for Dynamax Adventure rentals. */
  calcLairEvs(): void {
    for (const s of Stat.eachMain()) this.ev[s.id] = 0;
    const randEv = rand(6);
    if (randEv === 0) {
      for (const s of Stat.eachMain()) this.ev[s.id] = 50;
    } else {
      for (const s of Stat.eachMain()) {
        if (s.pbsOrder !== randEv) continue;
        this.ev[s.id] = 252;
        break;
      }
    }
    this.ev.HP = 252;
    this.calcStats();
  }

  //=============================================================================
  // Generation 9 Pack (evolution counters)
  //=============================================================================

  initEvoMoveCount(move: Id): void {
    if (!this._evoMoveCount) this._evoMoveCount = {};
    if (!this._evoMoveCount[move]) this._evoMoveCount[move] = 0;
  }

  moveCountEvolution(move: Id, qty = 1): void {
    for (const evo of this.speciesData().getEvolutions()) {
      if (evo[1] === "LevelUseMoveCount" && evo[2] === move) {
        this.initEvoMoveCount(move);
        this._evoMoveCount![move]! += qty;
        break;
      }
    }
  }

  evoMoveCount(move: Id): number {
    this.initEvoMoveCount(move);
    return this._evoMoveCount![move]!;
  }

  setEvoMoveCount(move: Id, value: number): void {
    this.initEvoMoveCount(move);
    this._evoMoveCount![move] = value;
  }

  initEvoCrestCount(item: Id): void {
    if (!this._evoCrestCount) this._evoCrestCount = {};
    if (!this._evoCrestCount[item]) this._evoCrestCount[item] = 0;
  }

  leadersCrestEvolution(item: Id, qty = 1): void {
    for (const evo of this.speciesData().getEvolutions()) {
      if (evo[1] === "LevelDefeatItsKindWithItem" && evo[2] === item) {
        this.initEvoCrestCount(item);
        this._evoCrestCount![item]! += qty;
        break;
      }
    }
  }

  evoCrestCount(item: Id): number {
    this.initEvoCrestCount(item);
    return this._evoCrestCount![item]!;
  }

  /**
   * set_evo_crest_count: Ruby calls an undefined init_crest_count here
   * (NoMethodError); kept so the bug shows up the same way.
   */
  setEvoCrestCount(_item: Id, _value: number): void {
    throw new Error("undefined method `init_crest_count' for Pokemon");
  }

  recoilEvolution(qty = 1): void {
    for (const evo of this.speciesData().getEvolutions()) {
      if (evo[1] === "LevelRecoilDamage") {
        if (!this._evoRecoilCount) this._evoRecoilCount = 0;
        this._evoRecoilCount += qty;
        break;
      }
    }
  }

  get evoRecoilCount(): number { return this._evoRecoilCount || 0; }
  set evoRecoilCount(value: number) { this._evoRecoilCount = value; }

  walkingEvolution(qty = 1): void {
    for (const evo of this.speciesData().getEvolutions()) {
      if (evo[1] === "LevelWalk") {
        if (!this._evoStepCount) this._evoStepCount = 0;
        this._evoStepCount += qty;
        break;
      }
    }
  }

  get evoStepCount(): number { return this._evoStepCount || 0; }
  set evoStepCount(value: number) { this._evoStepCount = value; }

  //=============================================================================
  // Enhanced UI (shiny leaves)
  //=============================================================================

  get shinyLeaf(): number { return this._shinyLeaf || 0; }
  set shinyLeaf(value: number) { this._shinyLeaf = value < 0 ? 0 : value > 6 ? 6 : value; }
  /** shiny_crown? */
  shinyCrown(): boolean { return this._shinyLeaf === 6; }
  /** shiny_leaf? */
  hasShinyLeaf(): boolean { return this._shinyLeaf != null && this._shinyLeaf > 0; }

  //=============================================================================
  // Pokémon Amie
  //=============================================================================

  get amieAffection(): number { return this._amieAffection ??= 0; }
  set amieAffection(value: number) { this._amieAffection = amieClamp(value); }
  get amieFullness(): number { return this._amieFullness ??= 0; }
  set amieFullness(value: number) { this._amieFullness = amieClamp(value); }
  get amieEnjoyment(): number { return this._amieEnjoyment ??= 0; }
  set amieEnjoyment(value: number) { this._amieEnjoyment = amieClamp(value); }

  /** getAmieStatLevel(points): 0-5. */
  getAmieStatLevel(points: number): number | null {
    if (points === 0) return 0;
    if (points >= 1 && points < 50) return 1;
    if (points >= 50 && points < 100) return 2;
    if (points >= 100 && points < 150) return 3;
    if (points >= 150 && points < Pokemon.MAXAMIEPOINTS) return 4;
    if (points === Pokemon.MAXAMIEPOINTS) return 5;
    return null;
  }

  getAffectionLevel(): number | null { return this.getAmieStatLevel(this.amieAffection); }
  getFullnessLevel(): number | null { return this.getAmieStatLevel(this.amieFullness); }
  getEnjoymentLevel(): number | null { return this.getAmieStatLevel(this.amieEnjoyment); }

  //=============================================================================
  // Saving
  //=============================================================================

  toJSON(): PokemonJSON {
    return {
      species: this._species, forcedForm: this.forcedForm, timeFormSet: this.timeFormSet, form: this._form,
      level: this._level, exp: this._exp, stepsToHatch: this.stepsToHatch, hp: this._hp, totalhp: this.totalhp,
      status: this._status, statusCount: this.statusCount, gender: this._gender, shiny: this._shiny,
      superShiny: this._superShiny, abilityIndex: this._abilityIndex, ability: this._ability, nature: this._nature,
      natureForStats: this._natureForStats, item: this._item, mail: this._mail ? this._mail.toJSON() : null,
      moves: this.moves.map((m) => m.toJSON()), firstMoves: [...this.firstMoves], ribbons: [...this.ribbons],
      cool: this.cool, beauty: this.beauty, cute: this.cute, smart: this.smart, tough: this.tough, sheen: this.sheen,
      pokerus: this.pokerus, name: this._name, happiness: this.happiness, pokeBall: this.pokeBall,
      markings: [...this.markings], iv: { ...this.iv }, ivMaxed: { ...this.ivMaxed }, ev: { ...this.ev },
      attack: this.attack, defense: this.defense, spatk: this.spatk, spdef: this.spdef, speed: this.speed,
      owner: this.owner.toJSON(), obtainMethod: this.obtainMethod, obtainMap: this.obtainMap,
      obtainText: this.obtainText, obtainLevel: this.obtainLevel, hatchedMap: this.hatchedMap,
      timeReceived: this._timeReceived, timeEggHatched: this._timeEggHatched,
      fused: this.fused ? this.fused.toJSON() : null, personalID: this.personalID,
      readyToEvolve: this.readyToEvolve, cannotStore: this.cannotStore, cannotRelease: this.cannotRelease,
      cannotTrade: this.cannotTrade,
      shadow: this.shadow, heartGauge: this._heartGauge, hyperMode: this._hyperMode, savedExp: this.savedExp,
      savedEv: this.savedEv ? { ...this.savedEv } : null, shadowMoves: this.shadowMoves ? [...this.shadowMoves] : null,
      heartGaugeStepCounter: this.heartGaugeStepCounter,
      trainerAce: this._trainerAce, scale: this._scale,
      dynamaxLvl: this._dynamaxLvl, dynamax: this._dynamax, reverted: this._reverted, gmaxFactor: this._gmaxFactor,
      dynamaxAble: this._dynamaxAble,
      evoMoveCount: this._evoMoveCount ? { ...this._evoMoveCount } : null,
      evoCrestCount: this._evoCrestCount ? { ...this._evoCrestCount } : null,
      evoRecoilCount: this._evoRecoilCount, evoStepCount: this._evoStepCount,
      shinyLeaf: this._shinyLeaf,
      amieAffection: this._amieAffection, amieFullness: this._amieFullness, amieEnjoyment: this._amieEnjoyment,
    };
  }

  static fromJSON(json: PokemonJSON): Pokemon {
    const p = Object.create(Pokemon.prototype) as Pokemon;
    // Class field initializers don't run for Object.create; set every field from the save.
    p._species = json.species;
    p.forcedForm = json.forcedForm;
    p.timeFormSet = json.timeFormSet;
    p._form = json.form;
    p._level = json.level;
    p._exp = json.exp;
    p.stepsToHatch = json.stepsToHatch;
    p._hp = json.hp;
    p.totalhp = json.totalhp;
    p._status = json.status;
    p.statusCount = json.statusCount;
    p._gender = json.gender;
    p._shiny = json.shiny;
    p._superShiny = json.superShiny;
    p._abilityIndex = json.abilityIndex;
    p._ability = json.ability;
    p._nature = json.nature;
    p._natureForStats = json.natureForStats;
    p._item = json.item;
    p._mail = json.mail ? Mail.fromJSON(json.mail as Parameters<typeof Mail.fromJSON>[0]) : null;
    p.moves = json.moves.map((m) => PokemonMove.fromJSON(m));
    p.firstMoves = [...json.firstMoves];
    p.ribbons = [...json.ribbons];
    p.cool = json.cool;
    p.beauty = json.beauty;
    p.cute = json.cute;
    p.smart = json.smart;
    p.tough = json.tough;
    p.sheen = json.sheen;
    p.pokerus = json.pokerus;
    p._name = json.name;
    p.happiness = json.happiness;
    p.pokeBall = json.pokeBall;
    p.markings = [...json.markings];
    p.iv = { ...json.iv };
    p.ivMaxed = { ...json.ivMaxed };
    p.ev = { ...json.ev };
    p.attack = json.attack;
    p.defense = json.defense;
    p.spatk = json.spatk;
    p.spdef = json.spdef;
    p.speed = json.speed;
    p.owner = PokemonOwner.fromJSON(json.owner);
    p.obtainMethod = json.obtainMethod;
    p.obtainMap = json.obtainMap;
    p.obtainText = json.obtainText;
    p.obtainLevel = json.obtainLevel;
    p.hatchedMap = json.hatchedMap;
    p._timeReceived = json.timeReceived;
    p._timeEggHatched = json.timeEggHatched;
    p.fused = json.fused ? Pokemon.fromJSON(json.fused) : null;
    p.personalID = json.personalID;
    p.readyToEvolve = json.readyToEvolve;
    p.cannotStore = json.cannotStore;
    p.cannotRelease = json.cannotRelease;
    p.cannotTrade = json.cannotTrade;
    p.shadow = json.shadow;
    p._heartGauge = json.heartGauge;
    p._hyperMode = json.hyperMode;
    p.savedExp = json.savedExp;
    p.savedEv = json.savedEv ? { ...json.savedEv } : null;
    p.shadowMoves = json.shadowMoves ? [...json.shadowMoves] : null;
    p.heartGaugeStepCounter = json.heartGaugeStepCounter;
    p._trainerAce = json.trainerAce;
    p._scale = json.scale;
    p._dynamaxLvl = json.dynamaxLvl;
    p._dynamax = json.dynamax;
    p._reverted = json.reverted;
    p._gmaxFactor = json.gmaxFactor;
    p._dynamaxAble = json.dynamaxAble;
    p._evoMoveCount = json.evoMoveCount ? { ...json.evoMoveCount } : null;
    p._evoCrestCount = json.evoCrestCount ? { ...json.evoCrestCount } : null;
    p._evoRecoilCount = json.evoRecoilCount;
    p._evoStepCount = json.evoStepCount;
    p._shinyLeaf = json.shinyLeaf;
    p._amieAffection = json.amieAffection;
    p._amieFullness = json.amieFullness;
    p._amieEnjoyment = json.amieEnjoyment;
    return p;
  }
}

function toSeconds(value: Date | number): number {
  return typeof value === "number" ? Math.trunc(value) : Math.floor(value.getTime() / 1000);
}

function amieClamp(value: number): number {
  if (value > Pokemon.MAXAMIEPOINTS) return Pokemon.MAXAMIEPOINTS;
  if (value < 0) return 0;
  return value;
}

/** A saved Pokémon: every instance variable, by its Ruby name in camelCase. */
export interface PokemonJSON {
  species: Id; forcedForm: number | null; timeFormSet: number | null; form: number; level: number | null;
  exp: number; stepsToHatch: number; hp: number; totalhp: number; status: Id; statusCount: number;
  gender: number | null; shiny: boolean | null; superShiny: boolean | null; abilityIndex: number | null;
  ability: Id | null; nature: Id | null; natureForStats: Id | null; item: Id | null; mail: object | null;
  moves: PokemonMoveJSON[]; firstMoves: Id[]; ribbons: Id[]; cool: number; beauty: number; cute: number;
  smart: number; tough: number; sheen: number; pokerus: number; name: string | null; happiness: number;
  pokeBall: Id; markings: number[]; iv: StatHash; ivMaxed: Record<Id, boolean | undefined>; ev: StatHash;
  attack: number; defense: number; spatk: number; spdef: number; speed: number; owner: PokemonOwnerJSON;
  obtainMethod: number; obtainMap: number; obtainText: string | null; obtainLevel: number; hatchedMap: number;
  timeReceived: number; timeEggHatched: number | null; fused: PokemonJSON | null; personalID: number;
  readyToEvolve: boolean; cannotStore: boolean; cannotRelease: boolean; cannotTrade: boolean;
  shadow: boolean | null; heartGauge: number | null; hyperMode: boolean | null; savedExp: number | null;
  savedEv: StatHash | null; shadowMoves: (Id | null)[] | null; heartGaugeStepCounter: number | null;
  trainerAce: boolean; scale: number | null;
  dynamaxLvl: number | null; dynamax: boolean; reverted: boolean; gmaxFactor: boolean; dynamaxAble: boolean | null;
  evoMoveCount: Record<Id, number> | null; evoCrestCount: Record<Id, number> | null;
  evoRecoilCount: number | null; evoStepCount: number | null;
  shinyLeaf: number | null;
  amieAffection: number | null; amieFullness: number | null; amieEnjoyment: number | null;
}
