// The parts of Essentials' Settings module (001_Settings.rb, 002_BattleSettings.rb)
// that the data model reads, plus the constants this game's plugins add to
// Settings (Essentials Deluxe, ZUD Mechanics, Generation 8 Pack, Improved
// Field Skills). Values are this game's, not Essentials' defaults.

export const MECHANICS_GENERATION = 8;

export const Settings = {
  // --- 001_Settings.rb ---------------------------------------------------------
  GAME_VERSION: "1.0.0",
  MECHANICS_GENERATION,
  MAX_MONEY: 999_999,
  MAX_COINS: 99_999,
  MAX_BATTLE_POINTS: 9_999,
  MAX_SOOT: 9_999,
  MAX_PLAYER_NAME_SIZE: 10,
  MAX_PARTY_SIZE: 6,
  MAXIMUM_LEVEL: 100,
  EGG_LEVEL: 1,
  SHINY_POKEMON_CHANCE: MECHANICS_GENERATION >= 6 ? 16 : 8,
  SUPER_SHINY: false,
  POKERUS_CHANCE: 3,
  SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN: MECHANICS_GENERATION >= 7,
  /** [trainer type, game variable holding the rival's name]. */
  RIVAL_NAMES: [
    ["Rival", 111],
    ["RIVAL2", 12],
    ["CHAMPION", 12],
    ["GIRLFRIEND", 76],
    ["BOYFRIEND", 77],
  ] as [string, number][],
  BADGE_FOR_FLASH: 0,
  BADGE_FOR_CUT: 2,
  BADGE_FOR_ROCKSMASH: 3,
  BADGE_FOR_STRENGTH: 5,
  BADGE_FOR_SURF: 4,
  BADGE_FOR_FLY: 1,
  BADGE_FOR_WHIRLPOOL: 7,
  BADGE_FOR_WATERFALL: 8,
  BADGE_FOR_DIVE: 15,
  /** Per pocket (index = pocket - 1); -1 means unlimited. ZUD appends the Z-Crystals pocket. */
  BAG_MAX_POCKET_SIZE: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
  /** Per pocket (index = pocket - 1). ZUD appends `true` for the Z-Crystals pocket. */
  BAG_POCKET_AUTO_SORT: [false, false, false, true, true, false, false, false, true],
  BAG_MAX_PER_SLOT: 999,
  /** Whether the Move Relearner can also teach the first moves (egg moves known when hatched, TR moves). */
  MOVE_RELEARNER_CAN_TEACH_MORE_MOVES: MECHANICS_GENERATION >= 6,
  NUM_STORAGE_BOXES: 40,
  HEAL_STORED_POKEMON: MECHANICS_GENERATION >= 8,
  /** Whether poisoned Pokémon will lose HP while walking around in the field. */
  POISON_IN_FIELD: MECHANICS_GENERATION <= 4,
  /** Whether poisoned Pokémon will faint while walking around in the field (true), or survive the poisoning with 1 HP (false). */
  POISON_FAINT_IN_FIELD: MECHANICS_GENERATION <= 3,
  /** The ID of the animation played when the player steps on grass (grass rustling). */
  GRASS_ANIMATION_ID: 1,
  /**
   * An array of available languages in the game, and their corresponding message
   * file in the Data folder (served from web/data as .json, see core/intl.ts).
   * Edit only if you have 2 or more languages to choose from.
   */
  LANGUAGES: [
    //  ["English", "english.dat"],
    //  ["Deutsch", "deutsch.dat"]
  ] as [string, string][],
  USE_CURRENT_REGION_DEX: false,
  DEX_SHOWS_ALL_FORMS: false,
  STARTING_OVER_SWITCH: 1,
  SEEN_POKERUS_SWITCH: 979,
  SHINY_WILD_POKEMON_SWITCH: 978,
  FATEFUL_ENCOUNTER_SWITCH: 977,
  DISABLE_BOX_LINK_SWITCH: 976,

  // --- 002_BattleSettings.rb ---------------------------------------------------
  RECALCULATE_TURN_ORDER_AFTER_MEGA_EVOLUTION: MECHANICS_GENERATION >= 7,
  RECALCULATE_TURN_ORDER_AFTER_SPEED_CHANGES: MECHANICS_GENERATION >= 8,
  ANY_HIGH_LEVEL_POKEMON_CAN_DISOBEY: true,
  FOREIGN_HIGH_LEVEL_POKEMON_CAN_DISOBEY: true,
  MOVE_CATEGORY_PER_MOVE: MECHANICS_GENERATION >= 4,
  NEW_CRITICAL_HIT_RATE_MECHANICS: MECHANICS_GENERATION >= 6,
  MORE_TYPE_EFFECTS: MECHANICS_GENERATION >= 6,
  FIXED_DURATION_WEATHER_FROM_ABILITY: MECHANICS_GENERATION >= 6,
  X_STAT_ITEMS_RAISE_BY_TWO_STAGES: MECHANICS_GENERATION >= 7,
  NEW_POKE_BALL_CATCH_RATES: MECHANICS_GENERATION >= 7,
  SOUL_DEW_POWERS_UP_TYPES: MECHANICS_GENERATION >= 7,
  AFFECTION_EFFECTS: true,
  APPLY_HAPPINESS_SOFT_CAP: true,
  NUM_BADGES_BOOST_ATTACK: MECHANICS_GENERATION >= 4 ? 999 : 1,
  NUM_BADGES_BOOST_DEFENSE: MECHANICS_GENERATION >= 4 ? 999 : 5,
  NUM_BADGES_BOOST_SPATK: MECHANICS_GENERATION >= 4 ? 999 : 7,
  NUM_BADGES_BOOST_SPDEF: MECHANICS_GENERATION >= 4 ? 999 : 7,
  NUM_BADGES_BOOST_SPEED: MECHANICS_GENERATION >= 4 ? 999 : 3,
  NO_MEGA_EVOLUTION: 975,
  SCALED_EXP_FORMULA: (MECHANICS_GENERATION as number) === 5 || MECHANICS_GENERATION >= 7,
  SPLIT_EXP_BETWEEN_GAINERS: MECHANICS_GENERATION <= 5,
  MORE_EXP_FROM_TRAINER_POKEMON: MECHANICS_GENERATION <= 6,
  MORE_EVS_FROM_POWER_ITEMS: MECHANICS_GENERATION >= 7,
  ENABLE_CRITICAL_CAPTURES: MECHANICS_GENERATION >= 5,
  GAIN_EXP_FOR_CAPTURE: MECHANICS_GENERATION >= 6,
  NEW_CAPTURE_CAN_REPLACE_PARTY_MEMBER: MECHANICS_GENERATION >= 7,
  NO_MONEY_LOSS: 658,
  CHECK_EVOLUTION_AFTER_ALL_BATTLES: MECHANICS_GENERATION >= 6,
  CHECK_EVOLUTION_FOR_FAINTED_POKEMON: true,
  /**
   * Generation 9 Pack's Settings.rb redefines Settings::MECHANICS_GENERATION = 9
   * after every constant above was computed from 8, so methods that read
   * Settings::MECHANICS_GENERATION when they run (the battle code's
   * `Settings::MECHANICS_GENERATION >= n` checks) see 9.
   */
  MECHANICS_GENERATION_AT_RUNTIME: 9,

  // --- Generation 9 Pack Scripts/Settings.rb -----------------------------------
  /** 0 = Hail, 1 = Snow, 2 = both. */
  HAIL_WEATHER_TYPE: 1,
  SLEEP_EFFECTS_CAUSE_DROWSY: true,
  FREEZE_EFFECTS_CAUSE_FROSTBITE: true,

  // --- Essentials Deluxe/Settings.rb -------------------------------------------
  POKEDEX_SHINY_FORMS: true,
  POKEDEX_SHADOW_FORMS: true,
  SHOW_MEGA_ANIM: true,
  SHOW_PRIMAL_ANIM: true,
  SHORTEN_MOVES: true,
  NO_TERASTALLIZE: 39,
  NO_Z_MOVE: 974,
  NO_ULTRA_BURST: 973,
  NO_DYNAMAX: 972,
  NO_STYLE_MOVES: 971,
  NO_ZODIAC_POWER: 970,
  NO_FOCUS_MECHANIC: 969,
  DYNAMAX_ANY_MAP: 968,
  CAN_DYNAMAX_WILD: 967,

  // --- ZUD Mechanics/Settings.rb -----------------------------------------------
  SHOW_ZUD_ANIM: true,
  SHOW_DYNAMAX_SIZE: true,
  SHOW_DYNAMAX_COLOR: true,
  DYNAMAX_TURNS: 3,
  MOVE_TYPES_TO_WEAKEN: ["FIGHTING", "POISON"],
  MAXRAID_SIZE: 6,
  MAXRAID_KOS: 3,
  MAXRAID_TIMER: 14,
  MAXRAID_SHIELD: 2,
  /** Dark Lair frequency (0 = Never, 1 = Rarely, 2 = Common, 3 = Always). */
  DARK_LAIR_FREQUENCY: 1,
  UNLOCK_DATABASE_FROM_RAIDS: true,
  HIDE_UNSEEN_SPECIES: false,
  DYNAMAX_BANLIST: ["PICHU_2", "GRENINJA_1", "GRENINJA_2"],
  /** Generation 9 Pack is installed. */
  GENERATION_LIMIT: 9,
  REGIONAL_FORMS: [["Alolan", 1], ["Galarian", 1], ["Hisuian", 0], ["Paldean", 1]] as [string, number][],

  // --- Generation 8 Pack Scripts/000_Config.rb ---------------------------------
  FRONT_BATTLER_SPRITE_SCALE: 1,
  BACK_BATTLER_SPRITE_SCALE: 2,

  // --- Improved Field Skills/[000] Settings.rb ---------------------------------
  HM_SKILLS: ["CUT", "FLY", "SURF", "STRENGTH", "WATERFALL", "DIVE", "FLASH", "ROCKSMASH", "WHIRLPOOL"],
  MISC_SKILLS: ["DEFOG", "ROCKCLIMB", "DIG", "TELEPORT", "SWEETSCENT", "HEADBUTT", "SECRETPOWER",
    "SUNNYDAY", "RAINDANCE", "SANDSTORM", "HAIL", "EXTREMESPEED", "CAMOUFLAGE", "BOUNCE"],
  HEAL_SKILLS: ["SOFTBOILED", "MILKDRINK", "HEALPULSE"],
  CUSTOM_SKILLS: ["RECOVER", "LIFEDEW", "HEALBELL", "AROMATHERAPY", "INSTRUCT", "SKETCH", "FUTURESIGHT"],
  HM_SKILLS_REQUIRE_BADGE: true,
  MISC_SKILLS_REQUIRE_MOVE: true,
  HEAL_SKILLS_REQUIRE_MOVE: true,
  CUSTOM_SKILLS_REQUIRE_MOVE: true,

  /** Settings.bag_pocket_names (+ ZUD's "Z-Crystals"). Index = pocket - 1. */
  bagPocketNames(): string[] {
    return ["Items", "Medicine", "Poké Balls", "TMs & HMs", "Berries", "Mail", "Battle Items", "Key Items", "Z-Crystals"];
  },

  /** Settings.pokedex_names: [name, region] or a plain name for the National Dex. */
  pokedexNames(): ([string, number] | string)[] {
    return [
      ["Johto Pokédex", 0],
      ["Kanto Pokédex", 1],
      ["Hoenn Pokédex", 2],
      ["Sinnoh Pokédex", 3],
      ["Orange Islands Dex", 4],
      "National Pokédex",
    ];
  },
};
