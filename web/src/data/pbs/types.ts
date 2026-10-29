// Shapes of the JSON files written by tools/pbs/compile.ts (`pnpm pbs`) into
// data/pbs/. Each mirrors what Essentials v20.1's compiler (plus this game's
// plugins) stores in the matching Data/*.dat file, after the GameData class's
// initialize has applied its defaults:
//
// - Field names are the Ruby attribute names in camelCase (base_stats →
//   baseStats, battle_BGM → battleBGM). Translatable `real_*` attributes drop
//   the prefix (real_name → name): they hold the English text, which is also
//   the key Essentials looks translations up by.
// - IDs are Essentials' symbol IDs as strings ("PIKACHU", "PIKACHU_1", "POTION").
// - Ruby nil is null. Files listing GameData records are arrays in Essentials'
//   registration order (the order GameData::X.each / .keys use).

/** Symbol ID of a GameData record or hardcoded enum value. */
export type Id = string;

/** Per-stat values keyed by GameData::Stat ID (HP, ATTACK, DEFENSE, SPECIAL_ATTACK, SPECIAL_DEFENSE, SPEED). */
export type StatValues = Record<Id, number>;

/** types.json — GameData::Type */
export interface TypeData {
  id: Id;
  name: string;
  specialType: boolean;
  pseudoType: boolean;
  flags: string[];
  weaknesses: Id[];
  resistances: Id[];
  immunities: Id[];
  iconPosition: number;
}

/** abilities.json — GameData::Ability */
export interface AbilityData {
  id: Id;
  name: string;
  description: string;
  flags: string[];
}

/** 0 = Physical, 1 = Special, 2 = Status (index into ["Physical", "Special", "Status"]). */
export type MoveCategory = 0 | 1 | 2;

/** moves.json — GameData::Move */
export interface MoveData {
  id: Id;
  name: string;
  type: Id;
  category: MoveCategory;
  /** PBS "Power". */
  baseDamage: number;
  accuracy: number;
  totalPp: number;
  /** GameData::Target ID. */
  target: Id;
  priority: number;
  functionCode: string;
  flags: string[];
  effectChance: number;
  description: string;
}

/** items.json — GameData::Item */
export interface ItemData {
  id: Id;
  name: string;
  namePlural: string;
  pocket: number;
  price: number;
  /** Defaults to price / 2 (integer division). */
  sellPrice: number;
  description: string;
  /** Essentials Deluxe's HeldDescription; null means "use description". */
  heldDescription: string | null;
  /** 0 = none, 1 = OnPokemon, 2 = Direct, 3 = TM, 4 = HM, 5 = TR. */
  fieldUse: number;
  /** 0 = none, 1 = OnPokemon, 2 = OnMove, 3 = OnBattler, 4 = OnFoe, 5 = Direct. */
  battleUse: number;
  /** Defaults to !is_important? (not a key item, TM, HM or ZUD Z-Crystal). */
  consumable: boolean;
  flags: string[];
  /** Move taught by a TM/HM/TR. */
  move: Id | null;
}

/** berry-plants.json — GameData::BerryPlant */
export interface BerryPlantData {
  id: Id;
  hoursPerStage: number;
  dryingPerHour: number;
  /** [minimum, maximum] berries. */
  yield: [number, number];
}

export interface LevelUpMove {
  /** Can be -1 (Gen 9 Pack: Move Reminder-only) or 0 (learned on evolution). */
  level: number;
  move: Id;
}

/** One entry of GameData::Species#evolutions ([species, method, parameter, is_prevolution]). */
export interface Evolution {
  species: Id;
  /** GameData::Evolution ID, or "None" for the placeholder Essentials adds to a prevolution. */
  method: Id;
  /** Integer, string, or an ID (item/move/species/type), per the method's parameter type; null if none. */
  parameter: number | string | null;
  /** True for the entry recording what this species evolves from. */
  prevolution: boolean;
}

/** species.json — GameData::Species (base species and forms; forms have id "SPECIES_n"). */
export interface SpeciesData {
  id: Id;
  species: Id;
  form: number;
  name: string;
  formName: string | null;
  category: string;
  pokedexEntry: string;
  pokedexForm: number;
  types: Id[];
  baseStats: StatValues;
  evs: StatValues;
  baseExp: number;
  growthRate: Id;
  genderRatio: Id;
  catchRate: number;
  happiness: number;
  moves: LevelUpMove[];
  tutorMoves: Id[];
  eggMoves: Id[];
  abilities: Id[];
  hiddenAbilities: Id[];
  wildItemCommon: Id[];
  wildItemUncommon: Id[];
  wildItemRare: Id[];
  eggGroups: Id[];
  hatchSteps: number;
  incense: Id | null;
  offspring: Id[];
  evolutions: Evolution[];
  /** Tenths of a metre. */
  height: number;
  /** Tenths of a kilogram. */
  weight: number;
  color: Id;
  shape: Id;
  habitat: Id;
  generation: number;
  flags: string[];
  megaStone: Id | null;
  megaMove: Id | null;
  unmegaForm: number;
  megaMessage: number;
  /** ZUD: can't Dynamax (Settings::DYNAMAX_BANLIST, a few hardcoded forms, or Mega/Primal forms). */
  noDynamax: boolean;
  /** ZUD: G-Max form data from power_moves.txt, if this species can Gigantamax. */
  gmaxHeight: number | null;
  gmaxName: string | null;
  gmaxDex: string | null;
  /** Improved Field Skills: field moves usable without knowing them. */
  fieldSkills: Id[];
}

/** species-metrics.json — GameData::SpeciesMetrics (+ Gen 8 Pack scales, ZUD Dynamax metrics). */
export interface SpeciesMetricsData {
  id: Id;
  species: Id;
  form: number;
  backSprite: [number, number];
  frontSprite: [number, number];
  frontSpriteAltitude: number;
  shadowX: number;
  shadowSize: number;
  frontSpriteScale: number;
  backSpriteScale: number;
  dmaxBackSprite: [number, number];
  dmaxFrontSprite: [number, number];
  dmaxAltitude: number;
  dmaxShadowX: number;
  dmaxShadowSize: number;
  gmaxBackSprite: [number, number];
  gmaxFrontSprite: [number, number];
  gmaxAltitude: number;
  gmaxShadowX: number;
  gmaxShadowSize: number;
}

/** shadow-pokemon.json — GameData::ShadowPokemon */
export interface ShadowPokemonData {
  id: Id;
  /** Not validated as move IDs at compile time (as in Essentials). */
  moves: string[];
  gaugeSize: number;
  flags: string[];
}

/** ribbons.json — GameData::Ribbon */
export interface RibbonData {
  id: Id;
  name: string;
  iconPosition: number;
  description: string;
  flags: string[];
}

/** regional-dexes.json — index is the dex number; null for numbers with no section. */
export type RegionalDexes = (Id[] | null)[];

/** One slot of an encounter table ([chance, species, min level, max level]). */
export interface EncounterSlot {
  chance: number;
  species: Id;
  minLevel: number;
  maxLevel: number;
}

/** encounters.json — GameData::Encounter */
export interface EncounterData {
  /** "map_version". */
  id: string;
  map: number;
  version: number;
  /** Encounter type ID → step chance (defaults to the type's trigger_chance). */
  stepChances: Record<Id, number>;
  /** Encounter type ID → slots, merged and sorted by descending chance. */
  types: Record<Id, EncounterSlot[]>;
}

/** trainer-types.json — GameData::TrainerType */
export interface TrainerTypeData {
  id: Id;
  name: string;
  /** 0 = male, 1 = female, 2 = unknown/mixed. */
  gender: 0 | 1 | 2;
  baseMoney: number;
  /** Defaults to baseMoney. */
  skillLevel: number;
  flags: string[];
  introBGM: string | null;
  battleBGM: string | null;
  victoryBGM: string | null;
}

/** A Pokémon in a trainer's party. Optional fields are absent when not set in trainers.txt. */
export interface TrainerPokemon {
  species: Id;
  level: number;
  form?: number;
  name?: string;
  moves?: Id[];
  ability?: Id;
  abilityIndex?: number;
  item?: Id;
  /** 0 = male, 1 = female. */
  gender?: 0 | 1;
  nature?: Id;
  /** Missing stats default to the first value given, then 0. */
  iv?: StatValues;
  ev?: StatValues;
  happiness?: number;
  shininess?: boolean;
  superShininess?: boolean;
  shadowness?: boolean;
  pokeBall?: Id;
  // Essentials Deluxe / ZUD trainers.txt extensions.
  size?: number;
  trainerAce?: boolean;
  memento?: number;
  focus?: number;
  birthsign?: number;
  dynamaxLvl?: number;
  gmaxfactor?: boolean;
  nodynamax?: boolean;
  mastery?: boolean;
  teratype?: number;
}

/** trainers.json — GameData::Trainer */
export interface TrainerData {
  /** [trainer type, name, version]. */
  id: [Id, string, number];
  trainerType: Id;
  name: string;
  version: number;
  items: Id[];
  loseText: string;
  pokemon: TrainerPokemon[];
}

/** A trainer in a Battle Tower/Cup trainers file: [type, name, begin, win, lose, pokemon numbers]. */
export interface FacilityTrainer {
  trainerType: Id | null;
  name: string | null;
  beginSpeech: string | null;
  endSpeechWin: string | null;
  endSpeechLose: string | null;
  /** Indices into the list's pokemon. */
  pokemonNos: number[] | null;
}

/** PBPokemon, as built by PBPokemon.fromInspected. */
export interface FacilityPokemon {
  species: Id | null;
  item: Id | null;
  nature: Id | null;
  move1: Id | null;
  move2: Id | null;
  move3: Id | null;
  move4: Id | null;
  /** Stat IDs to put EVs into. */
  ev: Id[];
}

/** trainer-lists.json — one per [DefaultTrainerList]/[TrainerList] in battle_facility_lists.txt. */
export interface TrainerList {
  trainers: FacilityTrainer[];
  pokemon: FacilityPokemon[];
  challenges: string[];
  trainersFile: string;
  pokemonFile: string;
  isDefault: boolean;
}

/** [map ID, x, y, direction]. */
export type MapCoordsFacing = [number, number, number, number];

/** metadata.json — GameData::Metadata (section 0). */
export interface MetadataData {
  id: 0;
  startMoney: number;
  startItemStorage: Id[];
  home: MapCoordsFacing | null;
  /** null means "Bill". */
  storageCreator: string | null;
  wildBattleBGM: string | null;
  trainerBattleBGM: string | null;
  wildVictoryBGM: string | null;
  trainerVictoryBGM: string | null;
  wildCaptureME: string | null;
  surfBGM: string | null;
  bicycleBGM: string | null;
}

/** player-metadata.json — GameData::PlayerMetadata (sections 1+). Unset charsets fall back at runtime (run → walk, etc.). */
export interface PlayerMetadataData {
  id: number;
  trainerType: Id | null;
  walkCharset: string | null;
  runCharset: string | null;
  cycleCharset: string | null;
  surfCharset: string | null;
  diveCharset: string | null;
  fishCharset: string | null;
  surfFishCharset: string | null;
  /** Always null: v20.1's compile_metadata never passes Home to player metadata. */
  home: MapCoordsFacing | null;
}

/** map-metadata.json — GameData::MapMetadata. Unset values are null, as in Essentials. */
export interface MapMetadataData {
  id: number;
  /** null: use the map's name from map-infos.json. */
  name: string | null;
  outdoorMap: boolean | null;
  announceLocation: boolean | null;
  canBicycle: boolean | null;
  alwaysBicycle: boolean | null;
  /** [map ID, x, y]. */
  teleportDestination: [number, number, number] | null;
  /** [GameData::Weather ID, chance percent]. */
  weather: [Id, number] | null;
  /** [region, x, y]. */
  townMapPosition: [number, number, number] | null;
  diveMapId: number | null;
  darkMap: boolean | null;
  safariMap: boolean | null;
  snapEdges: boolean | null;
  randomDungeon: boolean | null;
  battleBackground: string | null;
  wildBattleBGM: string | null;
  trainerBattleBGM: string | null;
  wildVictoryBGM: string | null;
  trainerVictoryBGM: string | null;
  wildCaptureME: string | null;
  /** [width in squares, string of 1/0 per square]. */
  townMapSize: [number, string] | null;
  battleEnvironment: Id | null;
  flags: string[];
}

/** Edge of a map: "N", "E", "S", "W", or an integer if one was given. */
export type MapEdge = "N" | "E" | "S" | "W" | number;

/** map-connections.json — one line of map_connections.txt ([map1, edge1, pos1, map2, edge2, pos2]). */
export interface MapConnection {
  map1: number;
  edge1: MapEdge;
  position1: number;
  map2: number;
  edge2: MapEdge;
  position2: number;
}

/** A Point of town_map.txt ([x, y, name, poi, fly map, fly x, fly y, switch]). */
export interface TownMapPoint {
  x: number;
  y: number;
  name: string;
  poi: string;
  flyMapId: number | null;
  flyX: number | null;
  flyY: number | null;
  /** Game switch that must be on for the point to show. */
  switchId: number | null;
}

export interface TownMapRegion {
  name: string | null;
  filename: string | null;
  points: TownMapPoint[];
}

/** town-map.json — index is the region number; null for numbers with no section. */
export type TownMap = (TownMapRegion | null)[];

/** phone.json — PhoneDatabase */
export interface PhoneData {
  generics: string[];
  greetings: string[];
  greetingsMorning: string[];
  greetingsEvening: string[];
  bodies1: string[];
  bodies2: string[];
  battleRequests: string[];
  /** Filled at runtime as trainers register; always empty when compiled. */
  trainers: unknown[];
}

/** Status Z-Move effect lists keyed by stage ("1", "2", "3"). */
export type StagedMoves = Record<string, Id[]>;

/** ZSTATUS-only fields of a power move. */
export interface ZStatusEffects {
  statusAtk: StagedMoves;
  statusDef: StagedMoves;
  statusSpatk: StagedMoves;
  statusSpdef: StagedMoves;
  statusSpeed: StagedMoves;
  statusAcc: StagedMoves;
  statusEva: StagedMoves;
  statusOmni: StagedMoves;
  /** "1" = heal user, "2" = heal switch-in. */
  statusHeal: StagedMoves;
  statusCrit: Id[];
  statusReset: Id[];
  statusFocus: Id[];
}

/** power-moves.json — ZUD GameData::PowerMove (PBS/Plugins/ZUD/power_moves.txt). */
export interface PowerMoveData extends Partial<ZStatusEffects> {
  /** A type ID (generic), "ZMOVE_n", "ULTRA_n", "GMAX_n" or "ZSTATUS". */
  id: Id;
  zmove: Id | null;
  ultra: number | null;
  maxmove: Id | null;
  type: Id | null;
  item: Id | null;
  move: Id | null;
  /** Can contain null when a form flag matched nothing (as in ZUD). */
  species: (Id | null)[];
  flag: string | null;
  gmax: boolean;
}

/** raid-ranks.json — ZUD raid_ranks.dat. */
export interface RaidRanks {
  /** Species per raid rank 1–6 (index 0 = rank 1). */
  ranks: Id[][];
  total: Id[];
  banned: Id[];
}

/** adventure-maps.json — ZUD Max Lair maps; index is the map number. Keys are the PBS keys (Name, Start, Player, DarkMap, Pokemon, ...). */
export type AdventureMaps = (Record<string, string | boolean | string[]> | null)[];

export interface Issue {
  severity: "error" | "warning";
  /** Relative to the game root, e.g. "PBS/moves.txt". */
  file: string;
  line: number | null;
  section?: string;
  key?: string;
  message: string;
}

/** What compileAll returns. */
export interface Report {
  /** Output file name → number of records. */
  counts: Record<string, number>;
  /** PBS (and plugin PBS) files read, relative to the game root. */
  sources: string[];
  /** Files under PBS/ that neither Essentials nor an installed plugin reads. */
  unread: string[];
  issues: Issue[];
}
