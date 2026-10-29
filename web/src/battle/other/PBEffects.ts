// Port of Data/Scripts/011_Battle/006_Other battle code/001_PBEffects.rb, with
// the effects plugins add:
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb): 300-302.
// - ZUD Mechanics ([003] Battle/Battle_PBEffects.rb): battler 303-311, side 200-205.
// - Generation 9 Pack ([001] Battle/[000] PBEffects.rb): battler 400-413.
//
// As in Ruby, battler, position, side and field effects are separate index
// spaces that share one namespace (PBEffects.Bide = 4 indexes Battler#effects,
// PBEffects.HealingWish = 4 indexes ActivePosition#effects).

/**
 * An effects array (Battler#effects, ActiveSide#effects, ...). Values are
 * booleans, counters, battler indices (-1 = none), IDs, Pokémon or arrays,
 * as in Ruby, so the array is deliberately untyped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EffectsArray = any[];

export const PBEffects = {

  // These effects apply to a battler
  AquaRing: 0,
  Attract: 1,
  BanefulBunker: 2,
  BeakBlast: 3,
  Bide: 4,
  BideDamage: 5,
  BideTarget: 6,
  BurnUp: 7,
  Charge: 8,
  ChoiceBand: 9,
  Confusion: 10,
  Counter: 11,
  CounterTarget: 12,
  Curse: 13,
  Dancer: 14,
  DefenseCurl: 15,
  DestinyBond: 16,
  DestinyBondPrevious: 17,
  DestinyBondTarget: 18,
  Disable: 19,
  DisableMove: 20,
  Electrify: 21,
  Embargo: 22,
  Encore: 23,
  EncoreMove: 24,
  Endure: 25,
  FirstPledge: 26,
  FlashFire: 27,
  Flinch: 28,
  FocusEnergy: 29,
  FocusPunch: 30,
  FollowMe: 31,
  Foresight: 32,
  FuryCutter: 33,
  GastroAcid: 34,
  GemConsumed: 35,
  Grudge: 36,
  HealBlock: 37,
  HelpingHand: 38,
  HyperBeam: 39,
  Illusion: 40,
  Imprison: 41,
  Ingrain: 42,
  Instruct: 43,
  Instructed: 44,
  JawLock: 45,
  KingsShield: 46,
  LaserFocus: 47,
  LeechSeed: 48,
  LockOn: 49,
  LockOnPos: 50,
  MagicBounce: 51,
  MagicCoat: 52,
  MagnetRise: 53,
  MeanLook: 54,
  MeFirst: 55,
  Metronome: 56,
  MicleBerry: 57,
  Minimize: 58,
  MiracleEye: 59,
  MirrorCoat: 60,
  MirrorCoatTarget: 61,
  MoveNext: 62,
  MudSport: 63,
  Nightmare: 64,
  NoRetreat: 65,
  Obstruct: 66,
  Octolock: 67,
  Outrage: 68,
  ParentalBond: 69,
  PerishSong: 70,
  PerishSongUser: 71,
  PickupItem: 72,
  PickupUse: 73,
  Pinch: 74, // Battle Palace only
  Powder: 75,
  PowerTrick: 76,
  Prankster: 77,
  PriorityAbility: 78,
  PriorityItem: 79,
  Protect: 80,
  ProtectRate: 81,
  Quash: 82,
  Rage: 83,
  RagePowder: 84, // Used along with FollowMe
  Rollout: 85,
  Roost: 86,
  ShellTrap: 87,
  SkyDrop: 88,
  SlowStart: 89,
  SmackDown: 90,
  Snatch: 91,
  SpikyShield: 92,
  Spotlight: 93,
  Stockpile: 94,
  StockpileDef: 95,
  StockpileSpDef: 96,
  Substitute: 97,
  TarShot: 98,
  Taunt: 99,
  Telekinesis: 100,
  ThroatChop: 101,
  Torment: 102,
  Toxic: 103,
  Transform: 104,
  TransformSpecies: 105,
  Trapping: 106, // Trapping move
  TrappingMove: 107,
  TrappingUser: 108,
  Truant: 109,
  TwoTurnAttack: 110,
  Type3: 111,
  Unburden: 112,
  Uproar: 113,
  WaterSport: 114,
  WeightChange: 115,
  Yawn: 116,

  // These effects apply to a battler position
  FutureSightCounter: 0,
  FutureSightMove: 1,
  FutureSightUserIndex: 2,
  FutureSightUserPartyIndex: 3,
  HealingWish: 4,
  LunarDance: 5,
  Wish: 6,
  WishAmount: 7,
  WishMaker: 8,

  // These effects apply to a side
  AuroraVeil: 0,
  CraftyShield: 1,
  EchoedVoiceCounter: 2,
  EchoedVoiceUsed: 3,
  LastRoundFainted: 4,
  LightScreen: 5,
  LuckyChant: 6,
  MatBlock: 7,
  Mist: 8,
  QuickGuard: 9,
  Rainbow: 10,
  Reflect: 11,
  Round: 12,
  Safeguard: 13,
  SeaOfFire: 14,
  Spikes: 15,
  StealthRock: 16,
  StickyWeb: 17,
  Swamp: 18,
  Tailwind: 19,
  ToxicSpikes: 20,
  WideGuard: 21,

  // These effects apply to the battle (i.e. both sides)
  AmuletCoin: 0,
  FairyLock: 1,
  FusionBolt: 2,
  FusionFlare: 3,
  Gravity: 4,
  HappyHour: 5,
  IonDeluge: 6,
  MagicRoom: 7,
  MudSportField: 8,
  PayDay: 9,
  TrickRoom: 10,
  WaterSportField: 11,
  WonderRoom: 12,

  // Essentials Deluxe
  CriticalBoost: 300, // General crit-boosting effect used by a variety of mechanics.
  EncoreRestore: 301, // Used to restore Encore after using a battle mechanic that may temporarily ignore its effect.
  TransformPokemon: 302, // Used to get the correct sprite data while transformed in certain situations.

  // ZUD Mechanics (battler effects; ZHeal..Steelsurge apply to a side)
  Dynamax: 303, // The Dynamax state, and how many turns until it expires.
  NonGMaxForm: 304, // Records a G-Max Pokemon's base form to revert to (used for Alcremie).
  GMaxTrapping: 305, // Flags a battler as being trapped by a G-Max move, and persists even if the trap user switches out.
  MaxGuard: 306, // The effect for the move Max Guard.
  MaxRaidBoss: 307, // The effect that designates a Max Raid Pokemon.
  RaidShield: 308, // The current HP for a Max Raid Pokemon's shields.
  MaxShieldHP: 309, // The maximum total HP a Max Raid Pokemon's shields can have.
  ShieldCounter: 310, // The counter for triggering Raid Shields and other effects.
  KnockOutCount: 311, // The counter for KO's a Raid Pokemon needs to end the raid.
  ZHeal: 200, // The healing effect of Z-Parting Shot/Z-Memento.
  VineLash: 201, // The lingering effect of G-Max Vine Lash.
  Wildfire: 202, // The lingering effect of G-Max Wildfire.
  Cannonade: 203, // The lingering effect of G-Max Cannonade.
  Volcalith: 204, // The lingering effect of G-Max Volcalith.
  Steelsurge: 205, // The hazard effect of G-Max Steelsurge.

  // Generation 9 Pack
  AllySwitch: 400, // Used to determine if Ally Switch should fail.
  BoosterEnergy: 401, // Used to flag whether or not ParadoxStat should persist due to Booster Energy.
  Commander: 402, // Used for storing data related to Commander.
  CudChew: 403, // Used to count the remaining rounds until Cud Chew triggers.
  DoubleShock: 404, // Used for removing the user's Electric typing after using Double Shock.
  GlaiveRush: 405, // Used to count the remaining rounds until vulnerability from Glaive Rush wares off.
  ParadoxStat: 406, // Used to reference which stat is being boosted by Protosynthesis/Quark Drive.
  Protean: 407, // Used to flag a battler's Protean/Libero abilities to only trigger once per switch-in.
  SaltCure: 408, // Used to flag a battler as under the effects of Salt Cure.
  SilkTrap: 409, // Used to flag a battler as under the protection effects of Silk Trap.
  Splinters: 410, // Used to flag a battler as under the splinters effect.
  SplintersType: 411, // Used to determine the type effectiveness of splinters damage.
  SuccessiveMove: 412, // Used to flag Gigaton Hammer as unselectable by a battler on consecutive turns.
  SupremeOverlord: 413, // Used to trigger the effects of the Supreme Overlord ability.
} as const;
