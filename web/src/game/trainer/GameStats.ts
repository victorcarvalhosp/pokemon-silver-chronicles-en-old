// Port of Data/Scripts/004_Game classes/013_Game_Stats.rb (GameStats, $stats),
// with the counters Essentials Deluxe adds for its plugins
// ([000] Essentials Patches/Miscellaneous.rb).
//
// Not here: the Graphics.update alias that adds delta time to play_time
// (Graphics is in rgss/; it should do `G.stats.playTime += delta` there).

import { Species } from "../../data/gameData/species";
import { G } from "../globals";
import type { Player } from "./Player";

export class GameStats {
  // --- Essentials ---
  // Travel
  distanceWalked = 0;
  distanceCycled = 0;
  distanceSurfed = 0;
  distanceSlidOnIce = 0;
  cycleCount = 0;
  surfCount = 0;
  diveCount = 0;
  // Field actions
  flyCount = 0;
  cutCount = 0;
  flashCount = 0;
  rockSmashCount = 0;
  rockSmashBattles = 0;
  headbuttCount = 0;
  headbuttBattles = 0;
  strengthPushCount = 0;
  waterfallCount = 0;
  waterfallsDescended = 0;
  // Items
  repelCount = 0;
  itemfinderCount = 0;
  fishingCount = 0;
  fishingBattles = 0;
  pokeRadarCount = 0;
  pokeRadarLongestChain = 0;
  berryPlantsPicked = 0;
  maxYieldBerryPlants = 0;
  berriesPlanted = 0;
  // NPCs
  pokeCenterCount = 0;  // Incremented in Poké Center nurse events
  revivedFossilCount = 0;  // Incremented in fossil reviver events
  lotteryPrizeCount = 0;  // Incremented in lottery NPC events
  // Pokémon
  eggsHatched = 0;
  evolutionCount = 0;
  evolutionsCancelled = 0;
  tradeCount = 0;
  movesTaughtByItem = 0;
  movesTaughtByTutor = 0;
  movesTaughtByReminder = 0;
  dayCareDeposits = 0;
  dayCareLevelsGained = 0;
  pokerusInfections = 0;
  shadowPokemonPurified = 0;
  // Battles
  wildBattlesWon = 0;
  wildBattlesLost = 0;
  trainerBattlesWon = 0;
  trainerBattlesLost = 0;
  totalExpGained = 0;
  battleMoneyGained = 0;
  battleMoneyLost = 0;
  blackedOutCount = 0;
  megaEvolutionCount = 0;
  failedPokeBallCount = 0;
  // Currency
  moneySpentAtMarts = 0;
  moneyEarnedAtMarts = 0;
  martItemsBought = 0;
  premierBallsEarned = 0;
  drinksBought = 0;  // Incremented in vending machine events
  drinksWon = 0;  // Incremented in vending machine events
  coinsWon = 0;
  coinsLost = 0;
  battlePointsWon = 0;
  battlePointsSpent = 0;
  sootCollected = 0;
  // Special stats
  gymLeaderAttempts = new Array<number>(50).fill(0);  // Incremented in Gym Leader events (50 is arbitrary but suitably large)
  timesToGetBadges = [] as number[];  // Set with set_time_to_badge(number) in Gym Leader events
  eliteFourAttempts = 0;  // Incremented in door event leading to the first E4 member
  hallOfFameEntryCount = 0;  // Incremented in Hall of Fame event
  timeToEnterHallOfFame = 0;  // Set with set_time_to_hall_of_fame in Hall of Fame event
  safariPokemonCaught = 0;
  mostCapturesPerSafariGame = 0;
  bugContestCount = 0;
  bugContestWins = 0;
  // Play
  playTime = 0;
  playSessions = 0;
  timeLastSaved = 0;
  // --- Essentials Deluxe ---
  primalReversionCount = 0;
  // ZUD Plugin
  zmoveCount = 0;
  statusZmoveCount = 0;
  ultraBurstCount = 0;
  dynamaxCount = 0;
  gigantamaxCount = 0;
  totalDynamaxLvlsGained = 0;
  totalGmaxFactorsGiven = 0;
  maxRaidDensEntered = 0;
  maxRaidDensCleared = 0;
  maxLairsEntered = 0;
  darkLairsEntered = 0;
  endlessLairsEntered = 0;
  maxLairsCleared = 0;
  endlessLairRecords = 0;
  // PLA Battle Styles
  strongStyleCount = 0;
  agileStyleCount = 0;
  totalMovesMastered = 0;
  // Terastal Phenomenon
  terastallizeCount = 0;
  wildTeraBattles = 0;
  totalTeraTypesChanged = 0;
  // Focus Meter System
  accuracyFocusCount = 0;
  evasionFocusCount = 0;
  criticalFocusCount = 0;
  potencyFocusCount = 0;
  passiveFocusCount = 0;
  enragedFocusCount = 0;
  totalFocusStylesChanged = 0;
  // Pokemon Birthsigns
  zodiacPowerCount = 0;
  cooldownCommandCount = 0;
  totalTimesBlessed = 0;
  // Legendary Breeding
  legendaryEggsHatched = 0;
  paradoxPokemonEngineered = 0;

  /** distance_moved */
  distanceMoved(): number {
    return this.distanceWalked + this.distanceCycled + this.distanceSurfed;
  }

  /** caught_pokemon_count */
  caughtPokemonCount(): number {
    const player = G.player as unknown as Player | null;
    if (!player) return 0;
    let ret = 0;
    for (const sp of Species.eachSpecies()) ret += player.pokedex.caughtCount(sp.id);
    return ret;
  }

  /** save_count ($game_system.save_count) */
  saveCount(): number {
    return (G.gameSystem as unknown as { saveCount?: number } | null)?.saveCount ?? 0;
  }

  setTimeToBadge(number: number): void {
    this.timesToGetBadges[number] = this.playTime;
  }

  setTimeToHallOfFame(): void {
    this.timeToEnterHallOfFame = this.playTime;
  }

  /** play_time_per_session (Ruby divides by zero sessions to Infinity/NaN for Floats too). */
  playTimePerSession(): number {
    return this.playTime / this.playSessions;
  }

  setTimeLastSaved(): void {
    this.timeLastSaved = this.playTime;
  }

  timeSinceLastSave(): number {
    return this.playTime - this.timeLastSaved;
  }

  toJSON(): Record<string, unknown> {
    return JSON.parse(JSON.stringify({ ...this })) as Record<string, unknown>;
  }

  /** Restores a saved GameStats; counters missing from older saves keep their initial values. */
  static fromJSON(json: Record<string, unknown>): GameStats {
    const s = new GameStats();
    for (const [k, v] of Object.entries(json)) {
      if (k in s) (s as unknown as Record<string, unknown>)[k] = JSON.parse(JSON.stringify(v));
    }
    return s;
  }
}
