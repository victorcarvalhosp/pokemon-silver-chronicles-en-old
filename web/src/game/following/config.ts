// Port of Plugins/Following Pokemon EX/Configuration/000_Config.rb, with the
// values this game sets.

export const FollowingPkmnConfig = {
  /** Common event to play when talking to the Following Pokémon; null = FollowingPkmn.talk. */
  FOLLOWER_COMMON_EVENT: null as number | null,

  // Animation IDs (Data/Animations: the plugin's emote animations)
  ANIMATION_COME_OUT: 542,
  ANIMATION_COME_IN: 543,
  ANIMATION_EMOTE_HEART: 549,
  ANIMATION_EMOTE_MUSIC: 548,
  ANIMATION_EMOTE_HAPPY: 544,
  ANIMATION_EMOTE_ELIPSES: 545,
  ANIMATION_EMOTE_ANGRY: 546,
  ANIMATION_EMOTE_POISON: 547,

  /** Key that toggles the follower (nil: disabled). */
  TOGGLE_FOLLOWER_KEY: null as string | null,
  /** Show the toggle in the Options screen (ui/options/options.ts reads its own copy). */
  SHOW_TOGGLE_IN_OPTIONS: false,
  /** Key that cycles the party ("JUMPUP" = Input::JUMPUP). */
  CYCLE_PARTY_KEY: "JUMPUP" as string | null,

  /** Pulse the follower with a status colour. */
  APPLY_STATUS_TONES: true,
  TONE_BURN: [206, 73, 43],
  TONE_POISON: [109, 55, 130],
  TONE_PARALYSIS: [204, 152, 44],
  TONE_FROZEN: [56, 160, 193],
  TONE_SLEEP: [0, 0, 0],

  /** Seconds before the follower gains friendship (while first in the party). */
  FRIENDSHIP_TIME_TAKEN: 125,
  /** Seconds before the follower finds an item. */
  ITEM_TIME_TAKEN: 375,

  /** The follower always stays in its move cycle (HGSS). */
  ALWAYS_ANIMATE: true,
  /** The follower always faces the player. */
  ALWAYS_FACE_PLAYER: true,
  /** Other events can't walk through the follower. */
  IMPASSABLE_FOLLOWER: true,
  /** The follower slides into battle instead of being thrown in a Poké Ball (battle scene). */
  SLIDE_INTO_BATTLE: true,
  /** Ball animation when Nurse Joy takes the Poké Balls. */
  SHOW_POKECENTER_ANIMATION: true,

  /** Pokémon that count as levitating (always behind the player when surfing). */
  LEVITATING_FOLLOWERS: [
    // Gen 1
    "BEEDRILL", "VENOMOTH", "ABRA", "GEODUDE", "MAGNEMITE", "GASTLY", "HAUNTER",
    "KOFFING", "WEEZING", "PORYGON", "MEW",
    // Gen 2
    "MISDREAVUS", "UNOWN", "PORYGON2", "CELEBI",
    // Gen 3
    "DUSTOX", "SHEDINJA", "MEDITITE", "VOLBEAT", "ILLUMISE", "FLYGON", "LUNATONE",
    "SOLROCK", "BALTOY", "CLAYDOL", "CASTFORM", "SHUPPET", "DUSKULL", "CHIMECHO",
    "GLALIE", "BELDUM", "METANG", "LATIAS", "LATIOS", "JIRACHI",
    // Gen 4
    "MISMAGIUS", "BRONZOR", "BRONZONG", "SPIRITOMB", "CARNIVINE", "MAGNEZONE",
    "PORYGONZ", "PROBOPASS", "DUSKNOIR", "FROSLASS", "ROTOM", "UXIE", "MESPRIT",
    "AZELF", "GIRATINA_1", "CRESSELIA", "DARKRAI",
    // Gen 5
    "MUNNA", "MUSHARNA", "YAMASK", "COFAGRIGUS", "SOLOSIS", "DUOSION", "REUNICLUS",
    "VANILLITE", "VANILLISH", "VANILLUXE", "ELGYEM", "BEHEEYEM", "LAMPENT",
    "CHANDELURE", "CRYOGONAL", "HYDREIGON", "VOLCARONA", "RESHIRAM", "ZEKROM",
    // Gen 6
    "SPRITZEE", "DRAGALGE", "CARBINK", "KLEFKI", "PHANTUMP", "DIANCIE", "HOOPA",
    // Gen 7
    "VIKAVOLT", "CUTIEFLY", "RIBOMBEE", "COMFEY", "DHELMISE", "TAPUKOKO", "TAPULELE",
    "TAPUBULU", "COSMOG", "COSMOEM", "LUNALA", "NIHILEGO", "KARTANA", "NECROZMA",
    "MAGEARNA", "POIPOLE", "NAGANADEL",
    // Gen 8
    "ORBEETLE", "FLAPPLE", "SINISTEA", "POLTEAGEIST", "FROSMOTH", "DREEPY", "DRAKLOAK",
    "DRAGAPULT", "ETERNATUS", "REGIELEKI", "REGIDRAGO", "CALYREX",
  ],

  /** Pokémon that never follow while surfing, whatever their type or ability. */
  SURFING_FOLLOWERS_EXCEPTIONS: [
    // Gen I
    "CHARIZARD", "PIDGEY", "SPEAROW", "FARFETCHD", "DODUO", "DODRIO", "SCYTHER",
    "ZAPDOS_1",
    // Gen II
    "NATU", "XATU", "MURKROW", "DELIBIRD",
    // Gen III
    "TAILLOW", "VIBRAVA", "TROPIUS",
    // Gen IV
    "STARLY", "HONCHKROW", "CHINGLING", "CHATOT", "ROTOM_1", "ROTOM_2", "ROTOM_3",
    "ROTOM_5", "SHAYMIN_1", "ARCEUS_2",
    // Gen V
    "ARCHEN", "DUCKLETT", "EMOLGA", "EELEKTRIK", "EELEKTROSS", "RUFFLET", "VULLABY",
    "LANDORUS_1",
    // Gen VI
    "FLETCHLING", "HAWLUCHA",
    // Gen VII
    "ROWLET", "DARTRIX", "PIKIPEK", "ORICORIO", "SILVALLY_2",
    // Gen VIII
    "ROOKIDEE", "CALYREX_1", "CALYREX_2",
  ],
};

/** FollowingPkmn.const_get("TONE_#{status}") */
export function statusTone(status: string): number[] | undefined {
  return (FollowingPkmnConfig as unknown as Record<string, number[] | undefined>)[`TONE_${status}`];
}

/** Settings::DUST_ANIMATION_ID (001_Settings.rb). */
export const DUST_ANIMATION_ID = 2;
