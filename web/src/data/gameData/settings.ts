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
  NUM_STORAGE_BOXES: 40,
  HEAL_STORED_POKEMON: MECHANICS_GENERATION >= 8,
  USE_CURRENT_REGION_DEX: false,
  DEX_SHOWS_ALL_FORMS: false,
  STARTING_OVER_SWITCH: 1,
  SEEN_POKERUS_SWITCH: 979,
  SHINY_WILD_POKEMON_SWITCH: 978,
  FATEFUL_ENCOUNTER_SWITCH: 977,
  DISABLE_BOX_LINK_SWITCH: 976,

  // --- 002_BattleSettings.rb ---------------------------------------------------
  MOVE_CATEGORY_PER_MOVE: MECHANICS_GENERATION >= 4,
  AFFECTION_EFFECTS: true,
  APPLY_HAPPINESS_SOFT_CAP: true,

  // --- Essentials Deluxe/Settings.rb -------------------------------------------
  POKEDEX_SHINY_FORMS: true,
  POKEDEX_SHADOW_FORMS: true,

  // --- ZUD Mechanics/Settings.rb -----------------------------------------------
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
