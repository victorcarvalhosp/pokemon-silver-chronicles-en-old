// Port of Data/Scripts/010_Data/002_PBS data/008_Species.rb, with the plugin
// changes this game loads:
// - ZUD Mechanics: no_dynamax, G-Max name/height/entry, hasGmax?, regional
//   variant checks, get_raid_forms.
// - Essentials Deluxe: get_family_moves.
// - Improved Field Skills: field_skills / has_skill?.
//
// Ruby keeps evolutions as [species, method, parameter, is_prevolution] and
// level-up moves as [level, move]; species.json stores them as objects
// ({species, method, parameter, prevolution} / {level, move}). Methods that
// return evolution lists return Ruby's tuples.
//
// Not ported here: 009_Species_Files.rb (sprite/icon/cry filenames and
// bitmaps) — that's graphics/audio code; Essentials Deluxe and ZUD override
// most of it.

import type { Evolution as EvolutionEntry, LevelUpMove, SpeciesData, StatValues } from "../pbs/types";
import { Evolution } from "./evolution";
import { type Id, SymbolData, hasFlag } from "./gameData";
import { GenderRatio } from "./genderRatio";
import { PowerMove } from "./powerMove";
import { Settings } from "./settings";
import { SpeciesMetrics } from "./speciesMetrics";
import { Stat } from "./stat";

/** [species, method, parameter] */
export type EvolutionTuple = [Id, Id, number | string | null];
/** [prevolution species, evolution species, method, parameter] */
export type FamilyEvolutionTuple = [Id, Id, Id, number | string | null];

export class Species extends SymbolData {
  static DATA = new Map<Id, Species>();
  readonly id: Id;
  readonly species: Id;
  readonly form: number;
  readonly realName: string;
  readonly realFormName: string | null;
  readonly realCategory: string;
  readonly realPokedexEntry: string;
  readonly pokedexForm: number;
  readonly types: Id[];
  readonly baseStats: StatValues;
  readonly evs: StatValues;
  readonly baseExp: number;
  readonly growthRate: Id;
  // attr_accessor in Essentials Deluxe's Compiler patch.
  genderRatio: Id;
  readonly catchRate: number;
  readonly happiness: number;
  readonly moves: LevelUpMove[];
  readonly tutorMoves: Id[];
  eggMoves: Id[];
  readonly abilities: Id[];
  readonly hiddenAbilities: Id[];
  readonly wildItemCommon: Id[];
  readonly wildItemUncommon: Id[];
  readonly wildItemRare: Id[];
  eggGroups: Id[];
  readonly hatchSteps: number;
  readonly incense: Id | null;
  offspring: Id[];
  readonly evolutions: EvolutionEntry[];
  readonly height: number;
  readonly weight: number;
  readonly color: Id;
  readonly shape: Id;
  habitat: Id;
  readonly generation: number;
  flags: string[];
  readonly megaStone: Id | null;
  readonly megaMove: Id | null;
  readonly unmegaForm: number;
  readonly megaMessage: number;
  // ZUD Mechanics
  readonly noDynamax: boolean;
  gmaxHeight: number | null;
  realGmaxName: string | null;
  realGmaxDex: string | null;
  // Improved Field Skills
  fieldSkills: Id[];

  /** get_species_form(species, form): the form's data, or the species' if the form isn't defined. */
  static getSpeciesForm(species: Id | Species | null | undefined, form: number | null | undefined): Species | null {
    if (!species || form == null) return null;
    const sp = species instanceof Species ? species.species : species;
    const trial = `${sp}_${form}`;
    const speciesForm = Species.DATA.has(trial) ? trial : sp;
    return Species.DATA.get(speciesForm) ?? null;
  }

  /** each_species: base forms only. */
  static eachSpecies(): Species[] {
    return Species.each().filter((s) => s.form === 0);
  }

  static speciesCount(): number {
    return Species.eachSpecies().length;
  }

  constructor(hash: Partial<SpeciesData> & { id: Id }) {
    super();
    this.id = hash.id;
    this.species = hash.species ?? this.id;
    this.form = hash.form ?? 0;
    this.realName = hash.name ?? "Unnamed";
    this.realFormName = hash.formName ?? null;
    this.realCategory = hash.category ?? "???";
    this.realPokedexEntry = hash.pokedexEntry ?? "???";
    this.pokedexForm = hash.pokedexForm ?? this.form;
    this.types = hash.types ?? ["NORMAL"];
    this.baseStats = { ...(hash.baseStats ?? {}) };
    this.evs = { ...(hash.evs ?? {}) };
    for (const s of Stat.eachMain()) {
      if (!this.baseStats[s.id] || this.baseStats[s.id]! <= 0) this.baseStats[s.id] = 1;
      if (!this.evs[s.id] || this.evs[s.id]! < 0) this.evs[s.id] = 0;
    }
    this.baseExp = hash.baseExp ?? 100;
    this.growthRate = hash.growthRate ?? "Medium";
    this.genderRatio = hash.genderRatio ?? "Female50Percent";
    this.catchRate = hash.catchRate ?? 255;
    this.happiness = hash.happiness ?? 70;
    this.moves = hash.moves ?? [];
    this.tutorMoves = hash.tutorMoves ?? [];
    this.eggMoves = hash.eggMoves ?? [];
    this.abilities = hash.abilities ?? [];
    this.hiddenAbilities = hash.hiddenAbilities ?? [];
    this.wildItemCommon = hash.wildItemCommon ?? [];
    this.wildItemUncommon = hash.wildItemUncommon ?? [];
    this.wildItemRare = hash.wildItemRare ?? [];
    this.eggGroups = hash.eggGroups ?? ["Undiscovered"];
    this.hatchSteps = hash.hatchSteps ?? 1;
    this.incense = hash.incense ?? null;
    this.offspring = hash.offspring ?? [];
    this.evolutions = hash.evolutions ?? [];
    this.height = hash.height ?? 1;
    this.weight = hash.weight ?? 1;
    this.color = hash.color ?? "Red";
    this.shape = hash.shape ?? "Head";
    this.habitat = hash.habitat ?? "None";
    this.generation = hash.generation ?? 0;
    this.flags = hash.flags ?? [];
    this.megaStone = hash.megaStone ?? null;
    this.megaMove = hash.megaMove ?? null;
    this.unmegaForm = hash.unmegaForm ?? 0;
    this.megaMessage = hash.megaMessage ?? 0;
    // ZUD Mechanics (the compiler already stored the result in species.json)
    if (hash.noDynamax != null) {
      this.noDynamax = hash.noDynamax;
    } else {
      const banned = [...Settings.DYNAMAX_BANLIST, "KYOGRE_1", "GROUDON_1", "NECROZMA_3", "NECROZMA_4",
        "ZACIAN", "ZACIAN_1", "ZAMAZENTA", "ZAMAZENTA_1"];
      this.noDynamax = banned.includes(this.id) || !!this.megaStone || !!this.megaMove;
    }
    this.gmaxHeight = hash.gmaxHeight ?? null;
    this.realGmaxName = hash.gmaxName ?? null;
    this.realGmaxDex = hash.gmaxDex ?? null;
    // Improved Field Skills
    this.fieldSkills = hash.fieldSkills ?? [];
  }

  get name(): string { return this.realName; }
  get formName(): string | null { return this.realFormName; }
  get category(): string { return this.realCategory; }
  get pokedexEntry(): string { return this.realPokedexEntry; }

  /** default_form: the form set by a DefaultForm_n flag, or -1. */
  defaultForm(): number {
    for (const flag of this.flags) {
      const m = /^DefaultForm_(\d+)$/i.exec(flag);
      if (m) return Number(m[1]);
    }
    return -1;
  }

  baseForm(): number {
    const def = this.defaultForm();
    return def >= 0 ? def : this.form;
  }

  /** single_gendered? */
  singleGendered(): boolean {
    return GenderRatio.get(this.genderRatio).singleGendered();
  }

  baseStatTotal(): number {
    return Object.values(this.baseStats).reduce((a, b) => a + b, 0);
  }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }

  /** apply_metrics_to_sprite */
  applyMetricsToSprite(sprite: { x: number; y: number; mirror?: boolean }, index: number, shadow = false): void {
    SpeciesMetrics.getSpeciesForm(this.species, this.form)!.applyMetricsToSprite(sprite, index, shadow);
  }

  /** shows_shadow? */
  showsShadow(): boolean {
    return SpeciesMetrics.getSpeciesForm(this.species, this.form)!.showsShadow();
  }

  /** get_evolutions(exclude_invalid = false): [species, method, parameter] for each evolution. */
  getEvolutions(excludeInvalid = false): EvolutionTuple[] {
    const ret: EvolutionTuple[] = [];
    for (const evo of this.evolutions) {
      if (evo.prevolution) continue; // Is the prevolution
      if (evo.method === "None" && excludeInvalid) continue;
      ret.push([evo.species, evo.method, evo.parameter]);
    }
    return ret;
  }

  /** get_family_evolutions(exclude_invalid = true): [prevo, evo, method, parameter] down the whole line. */
  getFamilyEvolutions(excludeInvalid = true): FamilyEvolutionTuple[] {
    const keys = Species.keys();
    const evos = this.getEvolutions(excludeInvalid).sort((a, b) => keys.indexOf(a[0]) - keys.indexOf(b[0]));
    const ret: FamilyEvolutionTuple[] = [];
    for (const evo of evos) {
      ret.push([this.species, ...evo]);
      const evoArray = Species.get(evo[0]).getFamilyEvolutions(excludeInvalid);
      if (evoArray.length > 0) ret.push(...evoArray);
    }
    return ret;
  }

  getPreviousSpecies(): Id {
    if (this.evolutions.length === 0) return this.species;
    for (const evo of this.evolutions) if (evo.prevolution) return evo.species;
    return this.species;
  }

  getBabySpecies(checkItems = false, item1: Id | null = null, item2: Id | null = null): Id {
    let ret = this.species;
    if (this.evolutions.length === 0) return ret;
    for (const evo of this.evolutions) {
      if (!evo.prevolution) continue; // Not the prevolution
      if (checkItems) {
        const incense = Species.get(evo.species).incense;
        if (!incense || item1 === incense || item2 === incense) ret = evo.species;
      } else {
        ret = evo.species; // Species of prevolution
      }
      break;
    }
    if (ret !== this.species) ret = Species.get(ret).getBabySpecies(checkItems, item1, item2);
    return ret;
  }

  getFamilySpecies(): Id[] {
    const sp = this.getBabySpecies();
    const evos = Species.get(sp).getFamilyEvolutions(false);
    if (evos.length === 0) return [sp];
    return [...new Set([sp, ...evos.map((e) => e[1])])];
  }

  /** breeding_can_produce?(other_species) */
  breedingCanProduce(otherSpecies: Id): boolean {
    const otherFamily = Species.get(otherSpecies).getFamilySpecies();
    if (this.offspring.length > 0) return otherFamily.some((s) => this.offspring.includes(s));
    return otherFamily.includes(this.species);
  }

  /** get_egg_moves: this form's egg moves, or its prevolution's. */
  getEggMoves(): Id[] {
    if (this.eggMoves.length > 0) return this.eggMoves;
    const prevo = this.getPreviousSpecies();
    if (prevo !== this.species) return Species.getSpeciesForm(prevo, this.form)!.getEggMoves();
    return this.eggMoves;
  }

  /** family_evolutions_have_method?(check_method, check_param = nil) */
  familyEvolutionsHaveMethod(checkMethod: Id | Id[], checkParam: unknown = null): boolean {
    const sp = this.getBabySpecies();
    const evos = Species.get(sp).getFamilyEvolutions();
    if (evos.length === 0) return false;
    for (const evo of evos) {
      if (Array.isArray(checkMethod)) {
        if (!checkMethod.includes(evo[2])) continue;
      } else if (evo[2] !== checkMethod) {
        continue;
      }
      if (checkParam == null || evo[3] === checkParam) return true;
    }
    return false;
  }

  /** family_item_evolutions_use_item?(check_item = nil) */
  familyItemEvolutionsUseItem(checkItem: Id | null = null): boolean {
    const sp = this.getBabySpecies();
    const evos = Species.get(sp).getFamilyEvolutions();
    if (!evos || evos.length === 0) return false;
    for (const evo of evos) {
      if (Evolution.get(evo[2]).useItemProc === null) continue;
      if (checkItem == null || evo[3] === checkItem) return true;
    }
    return false;
  }

  /** minimum_level: the lowest level this species can legitimately be at. */
  minimumLevel(): number {
    if (this.evolutions.length === 0) return 1;
    for (const evo of this.evolutions) {
      if (!evo.prevolution) continue; // Not the prevolution
      const evoMethodData = Evolution.get(evo.method);
      if (evoMethodData.levelUpProc === null) continue;
      const minLevel = evoMethodData.minimumLevel;
      return minLevel === 0 ? (evo.parameter as number) : minLevel + 1;
    }
    return 1;
  }

  // --- Essentials Deluxe ([000] Essentials Patches/Pokemon.rb) -----------------
  /** get_family_moves: moves the whole evolutionary line can learn (level-up from baby/prevo/self, tutor, egg). */
  getFamilyMoves(): Id[] {
    const moves: Id[] = [];
    const baby = Species.getSpeciesForm(this.getBabySpecies(), this.form)!;
    const prev = Species.getSpeciesForm(this.getPreviousSpecies(), this.form)!;
    if (baby.species !== this.species) for (const m of baby.moves) moves.push(m.move);
    if (prev.species !== this.species && prev.species !== baby.species) for (const m of prev.moves) moves.push(m.move);
    for (const m of this.moves) moves.push(m.move);
    for (const m of this.tutorMoves) moves.push(m);
    for (const m of this.getEggMoves()) moves.push(m);
    return [...new Set(moves)];
  }

  // --- ZUD Mechanics ([001] Data/Data_Species.rb) ------------------------------
  get gmaxFormName(): string | null { return this.realGmaxName; }
  get gmaxDexEntry(): string | null { return this.realGmaxDex; }

  /** hasGmax? */
  hasGmax(): boolean {
    if (this.noDynamax) return false;
    return PowerMove.speciesList("G-Max").includes(this.id);
  }

  /** regionalVariant? */
  regionalVariant(): boolean {
    let regional = false;
    for (const i of Settings.REGIONAL_FORMS) {
      if (!this.realFormName) break;
      if (this.realFormName.includes("Zen Mode")) break;
      if (this.realFormName.includes(i[0])) {
        regional = true;
        break;
      }
    }
    return regional;
  }

  /** encounterRegional?(current region, from pbGetCurrentRegion) */
  encounterRegional(currentRegion: number): boolean {
    for (const i of Settings.REGIONAL_FORMS) {
      // Ruby calls include? on a nil form name here (an error); treated as no match.
      if (this.realFormName?.includes(i[0]) && currentRegion === i[1]) return true;
    }
    return false;
  }

  /** get_raid_forms(banned species from pbGetRaidRank[:banned]) */
  getRaidForms(banned: Id[]): Id[] {
    const ret: Id[] = [];
    for (const sp of Species.each()) {
      if (sp.species !== this.species) continue;
      if (banned.includes(sp.id)) continue;
      if (sp.generation > Settings.GENERATION_LIMIT) continue;
      ret.push(sp.id);
    }
    return ret;
  }

  // --- Improved Field Skills ---------------------------------------------------
  /** has_skill?(skill) */
  hasSkill(skill: Id): boolean {
    const s = skill.toUpperCase();
    return this.fieldSkills.some((x) => x === s);
  }
}
