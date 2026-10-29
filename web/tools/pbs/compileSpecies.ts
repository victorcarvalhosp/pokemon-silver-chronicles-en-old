// compile_pokemon, compile_pokemon_forms and (the Generation 8 Pack Scripts
// override of) compile_pokemon_metrics, with GameData::Species and
// GameData::SpeciesMetrics initialize defaults, including the fields ZUD
// Mechanics, Improved Field Skills and the Gen 8 Pack add in initialize.

import type { Evolution, LevelUpMove, SpeciesData, SpeciesMetricsData, StatValues } from "../../src/data/pbs/types.ts";
import { PbsError, type Ctx } from "./context.ts";
import { checkEnumField, csvPosInt, getCsvRecord, type Schema, type Value } from "./csv.ts";
import { eachFileSection, type SectionValue } from "./readers.ts";
import { rubyRound, rubySplit, rx, uniq } from "./ruby.ts";
import { or } from "./sections.ts";

export interface StatInfo {
  id: string;
  pbsOrder: number;
}

/** GameData::Stat.each_main (type :main or :main_battle), from the scripts. */
export function mainStats(ctx: Ctx): StatInfo[] {
  return (ctx.ruby.registrations.get("Stat") ?? [])
    .filter((r) => [":main", ":main_battle"].includes(r.props.get("type") ?? ""))
    .map((r) => ({ id: r.id, pbsOrder: parseInt(r.props.get("pbs_order") ?? "-1", 10) }));
}

/** GameData::Evolution#parameter: null, "Integer", "String", or a GameData class name. */
export function evolutionParameter(ctx: Ctx, method: string): string | null {
  const reg = (ctx.ruby.registrations.get("Evolution") ?? []).filter((r) => r.id === method).pop();
  const p = reg?.props.get("parameter");
  if (!p || p === "nil") return null;
  return p.startsWith(":") ? p.slice(1) : p;
}

/** GameData::Species.schema, with the Generation 9 Pack's "Moves" override (levels may be negative). */
export function speciesSchema(compilingForms: boolean): Record<string, Schema> {
  const ret: Record<string, Schema> = {
    FormName: [0, "q"],
    Category: [0, "s"],
    Pokedex: [0, "q"],
    Types: [0, "eE", "Type", "Type"],
    BaseStats: [0, "vvvvvv"],
    EVs: [0, "*ev", "Stat"],
    BaseExp: [0, "v"],
    CatchRate: [0, "u"],
    Happiness: [0, "u"],
    Moves: [0, "*ie", null, "Move"],
    TutorMoves: [0, "*e", "Move"],
    EggMoves: [0, "*e", "Move"],
    Abilities: [0, "*e", "Ability"],
    HiddenAbilities: [0, "*e", "Ability"],
    WildItemCommon: [0, "*e", "Item"],
    WildItemUncommon: [0, "*e", "Item"],
    WildItemRare: [0, "*e", "Item"],
    EggGroups: [0, "*e", "EggGroup"],
    HatchSteps: [0, "v"],
    Height: [0, "f"],
    Weight: [0, "f"],
    Color: [0, "e", "BodyColor"],
    Shape: [0, "e", "BodyShape"],
    Habitat: [0, "e", "Habitat"],
    Generation: [0, "i"],
    Flags: [0, "*s"],
    BattlerPlayerX: [0, "i"],
    BattlerPlayerY: [0, "i"],
    BattlerEnemyX: [0, "i"],
    BattlerEnemyY: [0, "i"],
    BattlerAltitude: [0, "i"],
    BattlerShadowX: [0, "i"],
    BattlerShadowSize: [0, "u"],
    // Old names, removed in v21.
    Type1: [0, "e", "Type"],
    Type2: [0, "e", "Type"],
    Rareness: [0, "u"],
    Compatibility: [0, "*e", "EggGroup"],
    Kind: [0, "s"],
    BaseEXP: [0, "v"],
    EffortPoints: [0, "*ev", "Stat"],
    HiddenAbility: [0, "*e", "Ability"],
    StepsToHatch: [0, "v"],
  };
  if (compilingForms) {
    ret.PokedexForm = [0, "u"];
    ret.Offspring = [0, "*e", "Species"];
    ret.Evolutions = [0, "*ees", "Species", "Evolution", null];
    ret.MegaStone = [0, "e", "Item"];
    ret.MegaMove = [0, "e", "Move"];
    ret.UnmegaForm = [0, "u"];
    ret.MegaMessage = [0, "u"];
  } else {
    ret.InternalName = [0, "n"];
    ret.Name = [0, "s"];
    ret.GrowthRate = [0, "e", "GrowthRate"];
    ret.GenderRatio = [0, "e", "GenderRatio"];
    ret.Incense = [0, "e", "Item"];
    ret.Offspring = [0, "*s"];
    ret.Evolutions = [0, "*ses", null, "Evolution", null];
    ret.GenderRate = [0, "e", "GenderRatio"];
  }
  return ret;
}

/** The species hash passed to GameData::Species.new (camelCased Ruby hash keys). */
export interface SpeciesHash {
  id: string;
  species?: string;
  form?: number;
  name?: string | null;
  formName?: string | null;
  category?: string | null;
  pokedexEntry?: string | null;
  pokedexForm?: number | null;
  types?: string[] | null;
  baseStats?: StatValues | null;
  evs?: StatValues | null;
  baseExp?: number | null;
  growthRate?: string | null;
  genderRatio?: string | null;
  catchRate?: number | null;
  happiness?: number | null;
  moves?: LevelUpMove[] | null;
  tutorMoves?: string[] | null;
  eggMoves?: string[] | null;
  abilities?: string[] | null;
  hiddenAbilities?: string[] | null;
  wildItemCommon?: string[] | null;
  wildItemUncommon?: string[] | null;
  wildItemRare?: string[] | null;
  eggGroups?: string[] | null;
  hatchSteps?: number | null;
  incense?: string | null;
  offspring?: string[] | null;
  evolutions?: Evolution[] | null;
  height?: number | null;
  weight?: number | null;
  color?: string | null;
  shape?: string | null;
  habitat?: string | null;
  generation?: number | null;
  flags?: string[] | null;
  megaStone?: string | null;
  megaMove?: string | null;
  unmegaForm?: number | null;
  megaMessage?: number | null;
}

/** GameData::Species#initialize, plus ZUD's and Improved Field Skills' additions. */
export function makeSpecies(ctx: Ctx, h: SpeciesHash, dynamaxBanlist: readonly string[]): SpeciesData {
  const form = h.form ?? 0;
  const baseStats: StatValues = { ...(h.baseStats ?? {}) };
  const evs: StatValues = { ...(h.evs ?? {}) };
  for (const s of mainStats(ctx)) {
    if (!baseStats[s.id] || baseStats[s.id]! <= 0) baseStats[s.id] = 1;
    if (evs[s.id] === undefined || evs[s.id]! < 0) evs[s.id] = 0;
  }
  const megaStone = h.megaStone ?? null;
  const megaMove = h.megaMove ?? null;
  return {
    id: h.id,
    species: h.species ?? h.id,
    form,
    name: h.name ?? "Unnamed",
    formName: h.formName ?? null,
    category: h.category ?? "???",
    pokedexEntry: h.pokedexEntry ?? "???",
    pokedexForm: h.pokedexForm ?? form,
    types: h.types ?? ["NORMAL"],
    baseStats,
    evs,
    baseExp: h.baseExp ?? 100,
    growthRate: h.growthRate ?? "Medium",
    genderRatio: h.genderRatio ?? "Female50Percent",
    catchRate: h.catchRate ?? 255,
    happiness: h.happiness ?? 70,
    moves: h.moves ?? [],
    tutorMoves: h.tutorMoves ?? [],
    eggMoves: h.eggMoves ?? [],
    abilities: h.abilities ?? [],
    hiddenAbilities: h.hiddenAbilities ?? [],
    wildItemCommon: h.wildItemCommon ?? [],
    wildItemUncommon: h.wildItemUncommon ?? [],
    wildItemRare: h.wildItemRare ?? [],
    eggGroups: h.eggGroups ?? ["Undiscovered"],
    hatchSteps: h.hatchSteps ?? 1,
    incense: h.incense ?? null,
    offspring: h.offspring ?? [],
    evolutions: h.evolutions ?? [],
    height: h.height ?? 1,
    weight: h.weight ?? 1,
    color: h.color ?? "Red",
    shape: h.shape ?? "Head",
    habitat: h.habitat ?? "None",
    generation: h.generation ?? 0,
    flags: h.flags ?? [],
    megaStone,
    megaMove,
    unmegaForm: h.unmegaForm ?? 0,
    megaMessage: h.megaMessage ?? 0,
    // ZUD Mechanics/[001] Data/Data_Species.rb
    noDynamax: dynamaxBanlist.includes(h.id) || megaStone !== null || megaMove !== null,
    gmaxHeight: null,
    gmaxName: null,
    gmaxDex: null,
    // Improved Field Skills/[001] Field Skills.rb
    fieldSkills: [],
  };
}

/** The hash passed to GameData::SpeciesMetrics.new. */
export interface MetricsHash {
  id: string;
  species?: string;
  form?: number;
  backSprite?: [number, number] | null;
  frontSprite?: [number, number] | null;
  frontSpriteAltitude?: number | null;
  shadowX?: number | null;
  shadowSize?: number | null;
  frontSpriteScale?: number | null;
  backSpriteScale?: number | null;
}

export interface MetricsDefaults {
  frontSpriteScale: number;
  backSpriteScale: number;
}

/** GameData::SpeciesMetrics#initialize, with the Gen 8 Pack's scales and ZUD's Dynamax defaults. */
export function makeMetrics(h: MetricsHash, defaults: MetricsDefaults): SpeciesMetricsData {
  const backSprite = h.backSprite ?? [0, 0];
  const frontSprite = h.frontSprite ?? [0, 0];
  const frontSpriteAltitude = h.frontSpriteAltitude ?? 0;
  const shadowX = h.shadowX ?? 0;
  return {
    id: h.id,
    species: h.species ?? h.id,
    form: h.form ?? 0,
    backSprite,
    frontSprite,
    frontSpriteAltitude,
    shadowX,
    shadowSize: h.shadowSize ?? 2,
    frontSpriteScale: h.frontSpriteScale ?? defaults.frontSpriteScale,
    backSpriteScale: h.backSpriteScale ?? defaults.backSpriteScale,
    dmaxBackSprite: backSprite,
    dmaxFrontSprite: frontSprite,
    dmaxAltitude: frontSpriteAltitude,
    dmaxShadowX: shadowX,
    dmaxShadowSize: 3,
    gmaxBackSprite: backSprite,
    gmaxFrontSprite: frontSprite,
    gmaxAltitude: frontSpriteAltitude,
    gmaxShadowX: shadowX,
    gmaxShadowSize: 3,
  };
}

export interface SpeciesSettings {
  dynamaxBanlist: string[];
  metrics: MetricsDefaults;
}

const NUMERIC = /^[+-]?\d+(?:\.\d+)?\n?$/;

/** Where each species' keys were defined, for errors found after parsing. */
type KeyLines = Map<string, { section: number; keys: Record<string, number> }>;

/**
 * Parses one section's values against the species schema, applying the
 * compile-time sanitising shared by compile_pokemon and compile_pokemon_forms.
 * Returns null if any value failed to parse.
 */
function parseSpeciesSection(
  ctx: Ctx,
  sectionName: string,
  contents: Map<string, SectionValue>,
  schema: Record<string, Schema>,
  stats: StatInfo[],
  forms: boolean,
): Record<string, Value | StatValues> | null {
  const parsed: Record<string, Value | StatValues> = {};
  let ok = true;
  for (const key of Object.keys(schema)) {
    const entry = contents.get(key);
    if (!entry || entry.value.length === 0) continue;
    const good = ctx.attempt(
      entry.line,
      () => {
        let value: Value;
        if ((key === "EVs" || key === "EffortPoints") && NUMERIC.test(rubySplit(entry.value, ",")[0] ?? "")) {
          value = getCsvRecord(ctx, entry.value, [0, "uuuuuu"]);
        } else {
          value = getCsvRecord(ctx, entry.value, schema[key]!);
        }
        if (Array.isArray(value) && value.length === 0) value = null;
        let result: Value | StatValues = value;
        switch (key) {
          case "BaseStats": {
            const arr = value as number[];
            const hash: StatValues = {};
            for (const s of stats) if (s.pbsOrder >= 0) hash[s.id] = arr[s.pbsOrder]!;
            result = hash;
            break;
          }
          case "EVs":
          case "EffortPoints": {
            const arr = value as Value[];
            const hash: StatValues = {};
            if (Array.isArray(arr[0])) {
              for (const pair of arr as [string, number][]) hash[pair[0]] = pair[1];
              for (const s of stats) hash[s.id] ??= 0;
            } else {
              for (const s of stats) if (s.pbsOrder >= 0) hash[s.id] = arr[s.pbsOrder] as number;
            }
            result = hash;
            break;
          }
          case "Height":
          case "Weight": {
            const n = rubyRound((value as number) * 10);
            if (n <= 0) throw new PbsError(`Value for '${key}' can't be less than or close to 0 (section ${sectionName})`);
            result = n;
            break;
          }
          case "Evolutions": {
            const evos = value as Value[][];
            if (forms) {
              for (const evo of evos) evo[2] = evolutionParam(ctx, evo[1] as string, evo[2] as string);
            }
            result = evos;
            break;
          }
        }
        parsed[key] = result;
      },
      { section: sectionName, key },
    );
    if (!good) ok = false;
  }
  return ok ? parsed : null;
}

/** Converts an evolution parameter per GameData::Evolution#parameter. */
function evolutionParam(ctx: Ctx, method: string, raw: string | null): string | number | null {
  const type = evolutionParameter(ctx, method);
  if (type === null) return null;
  if (type === "Integer") return csvPosInt({ s: raw ?? "" });
  if (type === "String") return raw;
  return checkEnumField(ctx, (raw ?? "").trim(), type) as string;
}

const toEvolutions = (v: Value | StatValues | undefined): Evolution[] | null =>
  v ? (v as Value[][]).map((e) => ({ species: e[0] as string, method: e[1] as string, parameter: e[2] as string | number | null, prevolution: false })) : null;

const toMoves = (v: Value | StatValues | undefined): LevelUpMove[] | null =>
  v ? (v as [number, string][]).map(([level, move]) => ({ level, move })) : null;

type Parsed = Record<string, Value | StatValues>;
const pick = <T>(p: Parsed, ...keys: string[]): T | null => {
  for (const k of keys) {
    const v = p[k];
    if (v !== undefined && v !== null && v !== false) return v as T;
  }
  return null;
};

function metricsFromBattlerKeys(p: Parsed): boolean {
  return ["BattlerPlayerX", "BattlerPlayerY", "BattlerEnemyX", "BattlerEnemyY", "BattlerAltitude", "BattlerShadowX", "BattlerShadowSize"].some(
    (k) => p[k] !== undefined && p[k] !== null,
  );
}

export function compilePokemon(ctx: Ctx, settings: SpeciesSettings, path = ctx.pbsPath("pokemon.txt")): void {
  const table = ctx.table<SpeciesData>("Species");
  table.clear();
  const metrics = ctx.table<SpeciesMetricsData>("SpeciesMetrics");
  const schema = speciesSchema(false);
  const stats = mainStats(ctx);
  const lines: KeyLines = new Map();
  for (const section of eachFileSection(ctx, path)) {
    const contents = new Map(section.entries);
    if (!/^\d+/.test(section.name)) contents.set("InternalName", { value: section.name, line: section.line });
    const missing = ["Name", "InternalName"].filter((k) => !contents.get(k)?.value);
    if (missing.length > 0) {
      for (const k of missing) ctx.error(section.line, `The entry ${k} is required in ${ctx.file} section ${section.name}.`, { section: section.name });
      continue;
    }
    const internal = contents.get("InternalName")!.value;
    if (table.has(internal)) {
      ctx.error(section.line, `Species ID '${internal}' is used twice.`, { section: section.name });
      continue;
    }
    const p = parseSpeciesSection(ctx, section.name, contents, schema, stats, false);
    if (!p) continue;
    let types = (p.Types as (string | null)[] | null) ?? [p.Type1 as string | null, p.Type2 as string | null];
    types = uniq(types.filter((t): t is string => t !== null && t !== undefined));
    const id = p.InternalName as string;
    table.set(
      id,
      makeSpecies(
        ctx,
        {
          id,
          name: pick(p, "Name"),
          formName: pick(p, "FormName"),
          category: pick(p, "Category", "Kind"),
          pokedexEntry: pick(p, "Pokedex"),
          types: types as string[],
          baseStats: pick(p, "BaseStats"),
          evs: pick(p, "EVs", "EffortPoints"),
          baseExp: pick(p, "BaseExp", "BaseEXP"),
          growthRate: pick(p, "GrowthRate"),
          genderRatio: pick(p, "GenderRatio", "GenderRate"),
          catchRate: pick(p, "CatchRate", "Rareness"),
          happiness: pick(p, "Happiness"),
          moves: toMoves(p.Moves),
          tutorMoves: pick(p, "TutorMoves"),
          eggMoves: pick(p, "EggMoves"),
          abilities: pick(p, "Abilities"),
          hiddenAbilities: pick(p, "HiddenAbilities", "HiddenAbility"),
          wildItemCommon: pick(p, "WildItemCommon"),
          wildItemUncommon: pick(p, "WildItemUncommon"),
          wildItemRare: pick(p, "WildItemRare"),
          eggGroups: pick(p, "EggGroups", "Compatibility"),
          hatchSteps: pick(p, "HatchSteps", "StepsToHatch"),
          incense: pick(p, "Incense"),
          offspring: pick(p, "Offspring"),
          evolutions: toEvolutions(p.Evolutions),
          height: pick(p, "Height"),
          weight: pick(p, "Weight"),
          color: pick(p, "Color"),
          shape: pick(p, "Shape"),
          habitat: pick(p, "Habitat"),
          generation: pick(p, "Generation"),
          flags: pick(p, "Flags"),
        },
        settings.dynamaxBanlist,
      ),
    );
    const keys: Record<string, number> = {};
    for (const [k, v] of contents) keys[k] = v.line;
    lines.set(id, { section: section.line, keys });
    // Backwards-compatible metrics in pokemon.txt.
    if (metricsFromBattlerKeys(p)) {
      metrics.set(
        id,
        makeMetrics(
          {
            id,
            backSprite: [or(p.BattlerPlayerX as Value, 0), or(p.BattlerPlayerY as Value, 0)],
            frontSprite: [or(p.BattlerEnemyX as Value, 0), or(p.BattlerEnemyY as Value, 0)],
            frontSpriteAltitude: or(p.BattlerAltitude as Value, 0),
            shadowX: or(p.BattlerShadowX as Value, 0),
            shadowSize: or(p.BattlerShadowSize as Value, 2),
          },
          settings.metrics,
        ),
      );
    }
  }
  const lineOf = (id: string, key: string) => lines.get(id)?.keys[key] ?? lines.get(id)?.section ?? null;
  // Enumerate offspring species (this couldn't be done earlier).
  for (const species of table.values()) {
    species.offspring = species.offspring.filter((sp) =>
      ctx.attempt(lineOf(species.id, "Offspring"), () => void checkEnumField(ctx, sp.trim(), "Species"), { section: species.id, key: "Offspring" }),
    );
  }
  // Enumerate evolution species and parameters.
  for (const species of table.values()) {
    species.evolutions = species.evolutions.filter((evo) =>
      ctx.attempt(
        lineOf(species.id, "Evolutions"),
        () => {
          evo.species = checkEnumField(ctx, evo.species.trim(), "Species") as string;
          evo.parameter = evolutionParam(ctx, evo.method, evo.parameter as string | null);
        },
        { section: species.id, key: "Evolutions" },
      ),
    );
  }
  // Add a prevolution "evolution" entry to every evolved species.
  const allEvos = new Map<string, Evolution>();
  for (const species of table.values()) {
    for (const evo of species.evolutions) {
      if (!allEvos.has(evo.species)) allEvos.set(evo.species, { species: species.species, method: evo.method, parameter: evo.parameter, prevolution: true });
    }
  }
  for (const species of table.values()) {
    const prevo = allEvos.get(species.species);
    if (prevo) species.evolutions.push({ ...prevo });
  }
}

const FORM_SECTION = rx(String.raw`^\w+[-,\s]{1}\d+$`);
const FORM_SPLIT = rx(String.raw`[-,\s]`);

export function compilePokemonForms(ctx: Ctx, settings: SpeciesSettings, path = ctx.pbsPath("pokemon_forms.txt")): void {
  const table = ctx.table<SpeciesData>("Species");
  const metrics = ctx.table<SpeciesMetricsData>("SpeciesMetrics");
  const schema = speciesSchema(true);
  const stats = mainStats(ctx);
  const usedForms = new Map<string, Set<number>>();
  for (const section of eachFileSection(ctx, path)) {
    if (!FORM_SECTION.test(section.name)) {
      ctx.warn(section.line, `Section [${section.name}] is ignored (expected [SPECIES,form]).`, { section: section.name });
      continue;
    }
    const split = rubySplit(section.name, FORM_SPLIT);
    let speciesId = "";
    let form = 0;
    const headerOk = ctx.attempt(
      section.line,
      () => {
        if (split.length !== 2) throw new PbsError(`Section name ${section.name} is invalid. Expected syntax like [XXX,Y] (XXX=species ID, Y=form number).`);
        speciesId = checkEnumField(ctx, split[0]!, "Species") as string;
        form = csvPosInt({ s: split[1]! });
        if (form === 0) throw new PbsError("A form cannot be defined with a form number of 0.");
        if (usedForms.get(speciesId)?.has(form)) throw new PbsError(`Form ${form} for species ID ${speciesId} is defined twice.`);
      },
      { section: section.name },
    );
    if (!headerOk) continue;
    if (!usedForms.has(speciesId)) usedForms.set(speciesId, new Set());
    usedForms.get(speciesId)!.add(form);
    const base = table.get(speciesId)!;
    const p = parseSpeciesSection(ctx, section.name, section.entries, schema, stats, true);
    if (!p) continue;
    const formId = `${speciesId}_${form}`;
    let types = p.Types as (string | null)[] | null;
    if (!types && p.Type1) types = [p.Type1 as string, (p.Type2 as string | null) ?? null];
    types ??= [...base.types];
    types = uniq(types.filter((t): t is string => t !== null && t !== undefined));
    const moves = toMoves(p.Moves) ?? base.moves.map((m) => ({ ...m }));
    const evolutions = toEvolutions(p.Evolutions) ?? base.evolutions.map((e) => ({ ...e }));
    const hash: SpeciesHash = {
      id: formId,
      species: speciesId,
      form,
      name: base.name,
      formName: pick(p, "FormName"),
      category: pick(p, "Category", "Kind") ?? base.category,
      pokedexEntry: pick(p, "Pokedex") ?? base.pokedexEntry,
      pokedexForm: pick(p, "PokedexForm"),
      types: types as string[],
      baseStats: pick(p, "BaseStats") ?? base.baseStats,
      evs: pick(p, "EVs", "EffortPoints") ?? base.evs,
      baseExp: pick(p, "BaseExp", "BaseEXP") ?? base.baseExp,
      growthRate: base.growthRate,
      genderRatio: base.genderRatio,
      catchRate: pick(p, "CatchRate", "Rareness") ?? base.catchRate,
      happiness: pick(p, "Happiness") ?? base.happiness,
      moves,
      tutorMoves: pick(p, "TutorMoves") ?? [...base.tutorMoves],
      eggMoves: pick(p, "EggMoves") ?? [...base.eggMoves],
      abilities: pick(p, "Abilities") ?? [...base.abilities],
      hiddenAbilities: pick(p, "HiddenAbilities", "HiddenAbility") ?? [...base.hiddenAbilities],
      wildItemCommon: pick(p, "WildItemCommon") ?? [...base.wildItemCommon],
      wildItemUncommon: pick(p, "WildItemUncommon") ?? [...base.wildItemUncommon],
      wildItemRare: pick(p, "WildItemRare") ?? [...base.wildItemRare],
      eggGroups: pick(p, "EggGroups", "Compatibility") ?? [...base.eggGroups],
      hatchSteps: pick(p, "HatchSteps", "StepsToHatch") ?? base.hatchSteps,
      incense: base.incense,
      offspring: pick(p, "Offspring") ?? [...base.offspring],
      evolutions,
      height: pick(p, "Height") ?? base.height,
      weight: pick(p, "Weight") ?? base.weight,
      color: pick(p, "Color") ?? base.color,
      shape: pick(p, "Shape") ?? base.shape,
      habitat: pick(p, "Habitat") ?? base.habitat,
      generation: pick(p, "Generation") ?? base.generation,
      flags: pick(p, "Flags") ?? [...base.flags],
      megaStone: pick(p, "MegaStone"),
      megaMove: pick(p, "MegaMove"),
      unmegaForm: pick(p, "UnmegaForm"),
      megaMessage: pick(p, "MegaMessage"),
    };
    // If the form has any wild items, none are inherited from the base species.
    if (p.WildItemCommon || p.WildItemUncommon || p.WildItemRare) {
      hash.wildItemCommon = pick(p, "WildItemCommon");
      hash.wildItemUncommon = pick(p, "WildItemUncommon");
      hash.wildItemRare = pick(p, "WildItemRare");
    }
    table.set(formId, makeSpecies(ctx, hash, settings.dynamaxBanlist));
    if (metricsFromBattlerKeys(p)) {
      if (!metrics.has(speciesId)) metrics.set(speciesId, makeMetrics({ id: speciesId }, settings.metrics));
      const bm = metrics.get(speciesId)!;
      metrics.set(
        formId,
        makeMetrics(
          {
            id: formId,
            species: speciesId,
            form,
            backSprite: [or(p.BattlerPlayerX as Value, bm.backSprite[0]), or(p.BattlerPlayerY as Value, bm.backSprite[1])],
            frontSprite: [or(p.BattlerEnemyX as Value, bm.frontSprite[0]), or(p.BattlerEnemyY as Value, bm.frontSprite[1])],
            frontSpriteAltitude: or(p.BattlerAltitude as Value, bm.frontSpriteAltitude),
            shadowX: or(p.BattlerShadowX as Value, bm.shadowX),
            shadowSize: or(p.BattlerShadowSize as Value, bm.shadowSize),
          },
          settings.metrics,
        ),
      );
    }
  }
  // Add a prevolution entry to evolved forms that define their own evolution
  // methods (and so don't have one inherited from the base species).
  const allEvos = new Map<string, Evolution>();
  for (const species of table.values()) {
    for (const evo of species.evolutions) {
      if (!evo.prevolution && !allEvos.has(evo.species)) {
        allEvos.set(evo.species, { species: species.species, method: evo.method, parameter: evo.parameter, prevolution: true });
      }
    }
  }
  for (const species of table.values()) {
    if (species.evolutions.some((e) => e.prevolution)) continue;
    const prevoEvo = allEvos.get(species.species);
    if (!prevoEvo) continue;
    species.evolutions.push({ ...prevoEvo });
    const prevo = table.get(prevoEvo.species)!;
    if (!prevo.evolutions.some((e) => !e.prevolution && e.species === species.species)) {
      prevo.evolutions.push({ species: species.species, method: "None", parameter: null, prevolution: false });
    }
  }
}

/** Generation 8 Pack Scripts' compile_pokemon_metrics (adds FrontSpriteScale/BackSpriteScale). */
export function compilePokemonMetrics(ctx: Ctx, settings: SpeciesSettings, path = ctx.pbsPath("pokemon_metrics.txt")): void {
  const metrics = ctx.table<SpeciesMetricsData>("SpeciesMetrics");
  const schema: Record<string, Schema> = {
    BackSprite: [0, "ii"],
    FrontSprite: [0, "ii"],
    FrontSpriteAltitude: [0, "i"],
    ShadowX: [0, "i"],
    ShadowSize: [0, "u"],
    FrontSpriteScale: [0, "i"],
    BackSpriteScale: [0, "i"],
  };
  for (const section of eachFileSection(ctx, path)) {
    const split = rubySplit(section.name, FORM_SPLIT);
    let speciesId = "";
    let form = 0;
    const headerOk = ctx.attempt(
      section.line,
      () => {
        if (split.length === 0 || split.length > 2) {
          throw new PbsError(`Section name ${section.name} is invalid. Expected syntax like [XXX] or [XXX,Y] (XXX=species ID, Y=form number).`);
        }
        speciesId = checkEnumField(ctx, split[0]!, "Species") as string;
        form = split[1] !== undefined ? csvPosInt({ s: split[1] }) : 0;
      },
      { section: section.name },
    );
    if (!headerOk) continue;
    const p: Record<string, Value> = {};
    let ok = true;
    for (const key of Object.keys(schema)) {
      const entry = section.entries.get(key);
      if (!entry || entry.value.length === 0) continue;
      const good = ctx.attempt(
        entry.line,
        () => {
          let value = getCsvRecord(ctx, entry.value, schema[key]!);
          if (Array.isArray(value) && value.length === 0) value = null;
          p[key] = value;
        },
        { section: section.name, key },
      );
      if (!good) ok = false;
    }
    if (!ok) continue;
    const id = form > 0 ? `${speciesId}_${form}` : speciesId;
    metrics.set(
      id,
      makeMetrics(
        {
          id,
          species: speciesId,
          form,
          backSprite: (p.BackSprite as [number, number] | undefined) ?? null,
          frontSprite: (p.FrontSprite as [number, number] | undefined) ?? null,
          frontSpriteAltitude: (p.FrontSpriteAltitude as number | undefined) ?? null,
          shadowX: (p.ShadowX as number | undefined) ?? null,
          shadowSize: (p.ShadowSize as number | undefined) ?? null,
          frontSpriteScale: (p.FrontSpriteScale as number | undefined) ?? null,
          backSpriteScale: (p.BackSpriteScale as number | undefined) ?? null,
        },
        settings.metrics,
      ),
    );
  }
}
