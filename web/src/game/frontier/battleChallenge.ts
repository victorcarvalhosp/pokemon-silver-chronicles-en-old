// Port of 018_Alternate battle modes/001_Battle Frontier/001_Challenge_BattleChallenge.rb:
// BattleChallenge (the challenge in progress and every challenge's records),
// BattleChallengeData (the current run: party, trainers, wins), BattleChallengeType
// (a challenge's win/swap records) and BattleFactoryData (Battle Factory rentals).

import { GrowthRate } from "../../data/gameData/growthRate";
import { _INTL } from "../../data/gameData/gameData";
import { pbFadeOutIn } from "../../ui/fades";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { NPCTrainer } from "../trainer/Trainer";
import { BattleSwapScene, BattleSwapScreen } from "./battleSwap";
import { BattleArena, BattlePalace, BattleTower, pbOrganizedBattleEx } from "./challengeBattles";
import { gamePlayerMoveto2, pbBattleChallenge, pbGetBTTrainers } from "./challengeData";
import { PokemonChallengeRules } from "./challengeRules";
import { pbBattleChallengeTrainer, pbBattleFactoryPokemon, pbGenerateBattleTrainer, sampleN } from "./chooseFoes";
import { pbWriteCup } from "./generatorData";
import { OpenLevelAdjustment } from "./levelAdjustment";
import { DoubleBattle, SingleBattle } from "./battleRules";
import { StandardRules } from "./rulesets";

const player = () => G.player as unknown as Player;

/** Game.save(safe: true) (loaded lazily: Game pulls in the whole map scene). */
async function gameSave(safe: boolean): Promise<void> {
  const { Game } = await import("../Game");
  await Game.save(safe);
}

//===============================================================================
//
//===============================================================================
export class BattleChallenge {
  static readonly BattleTowerID = 0;
  static readonly BattlePalaceID = 1;
  static readonly BattleArenaID = 2;
  static readonly BattleFactoryID = 3;

  bc: BattleChallengeData;
  /** The challenge ID (a string; -1 when none is in progress). */
  currentChallenge: string | number;
  types: Record<string, BattleChallengeType>;
  id: string | null = null;
  numRounds: number | null = null;
  _rules: PokemonChallengeRules | null = null;

  constructor() {
    this.bc = new BattleChallengeData();
    this.currentChallenge = -1;
    this.types = {};
  }

  async set(id: string, numrounds: number, rules: PokemonChallengeRules): Promise<void> {
    this.id = id;
    this.numRounds = numrounds;
    this._rules = rules;
    this.register(id, /double/.exec(id)?.[0] ?? null, 3,
      /^factory/.test(id) ? BattleChallenge.BattleFactoryID : BattleChallenge.BattleTowerID,
      /open$/.test(id) ? 1 : 0);
    await pbWriteCup(id, rules);
  }

  register(id: string, doublebattle: unknown, numPokemon: number, battletype: number, mode = 1): void {
    this.ensureType(id);
    if (battletype === BattleChallenge.BattleFactoryID) {
      this.bc.setExtraData(new BattleFactoryData(this.bc));
      numPokemon = 3;
      battletype = BattleChallenge.BattleTowerID;
    }
    if (!this._rules) this._rules = this.modeToRules(doublebattle, numPokemon, battletype, mode);
  }

  get rules(): PokemonChallengeRules {
    if (!this._rules) {
      const data = this.data!; // (nil when no challenge is in progress: NoMethodError)
      this._rules = this.modeToRules(data.doublebattle, data.numPokemon!, data.battletype!, data.mode!);
    }
    return this._rules;
  }

  modeToRules(doublebattle: unknown, numPokemon: number, battletype: number, mode: number): PokemonChallengeRules {
    const rules = new PokemonChallengeRules();
    // Set the battle type
    switch (battletype) {
      case BattleChallenge.BattlePalaceID:
        rules.setBattleType(new BattlePalace());
        break;
      case BattleChallenge.BattleArenaID:
        rules.setBattleType(new BattleArena());
        doublebattle = false;
        break;
      default: // Factory works the same as Tower
        rules.setBattleType(new BattleTower());
    }
    // Set standard rules and maximum level
    switch (mode) {
      case 1: // Open Level
        rules.setRuleset(new StandardRules(numPokemon, GrowthRate.maxLevel()));
        rules.setLevelAdjustment(new OpenLevelAdjustment(30));
        break;
      case 2: // Battle Tent
        rules.setRuleset(new StandardRules(numPokemon, GrowthRate.maxLevel()));
        rules.setLevelAdjustment(new OpenLevelAdjustment(60));
        break;
      default:
        rules.setRuleset(new StandardRules(numPokemon, 50));
        rules.setLevelAdjustment(new OpenLevelAdjustment(50));
    }
    // Set whether battles are single or double
    if (doublebattle) {
      rules.addBattleRule(new DoubleBattle());
    } else {
      rules.addBattleRule(new SingleBattle());
    }
    return rules;
  }

  async start(..._args: unknown[]): Promise<void> {
    const t = this.ensureType(this.id!);
    this.currentChallenge = this.id!; // must appear before pbStart
    await this.bc.pbStart(t, this.numRounds!);
  }

  pbStart(_challenge: unknown): void {}

  async pbEnd(): Promise<void> {
    if (this.currentChallenge !== -1) {
      this.ensureType(this.currentChallenge).saveWins(this.bc);
      this.currentChallenge = -1;
    }
    await this.bc.pbEnd();
  }

  async pbBattle(): Promise<boolean> {
    if (this.bc.extraData) return this.bc.extraData.pbBattle(this); // Battle Factory
    const opponent = pbGenerateBattleTrainer(this.nextTrainer, this.rules);
    const bttrainers = pbGetBTTrainers(this.id);
    const trainerdata = bttrainers[this.nextTrainer]!;
    opponent.loseText = trainerdata[4]; // pbGetMessageFromHash(MessageTypes::EndSpeechLose, ...)
    opponent.winText = trainerdata[3]; // pbGetMessageFromHash(MessageTypes::EndSpeechWin, ...)
    const ret = await pbOrganizedBattleEx(opponent, this.rules);
    return ret;
  }

  pbInChallenge(): boolean {
    return this.pbInProgress();
  }

  pbInProgress(): boolean {
    return this.bc.inProgress;
  }

  pbResting(): boolean {
    return this.bc.resting;
  }

  get extra(): BattleFactoryData | null { return this.bc.extraData; }
  get decision(): number { return this.bc.decision; }
  get wins(): number { return this.bc.wins; }
  get swaps(): number { return this.bc.swaps; }
  get battleNumber(): number { return this.bc.battleNumber; }
  get nextTrainer(): number { return this.bc.nextTrainer; }
  async pbGoOn(): Promise<void> { await this.bc.pbGoOn(); }
  pbAddWin(): void { this.bc.pbAddWin(); }
  pbCancel(): void { this.bc.pbCancel(); }
  async pbRest(): Promise<void> { await this.bc.pbRest(); }
  pbMatchOver(): boolean { return this.bc.pbMatchOver(); }
  async pbGoToStart(): Promise<void> { await this.bc.pbGoToStart(); }

  setDecision(value: number): void {
    this.bc.decision = value;
  }

  setParty(value: Pokemon[]): void {
    this.bc.setParty(value);
  }

  /**
   * NOTE (Ruby parity): challenge IDs are strings, and `@currentChallenge < 0`
   * raises ArgumentError for a string (001_Challenge_BattleChallenge.rb:141),
   * so this fails whenever a challenge is in progress. Only #rules calls it,
   * when no rules were given, which the game never does.
   */
  get data(): BattleChallengeType | null {
    if (!this.pbInProgress()) return null;
    if (typeof this.currentChallenge === "string") throw new Error("comparison of String with 0 failed");
    if (this.currentChallenge < 0) return null;
    return this.ensureType(this.currentChallenge).clone();
  }

  getCurrentWins(challenge: string): number {
    return this.ensureType(challenge).currentWins;
  }

  getPreviousWins(challenge: string): number {
    return this.ensureType(challenge).previousWins;
  }

  getMaxWins(challenge: string): number {
    return this.ensureType(challenge).maxWins;
  }

  getCurrentSwaps(challenge: string): number {
    return this.ensureType(challenge).currentSwaps;
  }

  getPreviousSwaps(challenge: string): number {
    return this.ensureType(challenge).previousSwaps;
  }

  getMaxSwaps(challenge: string): number {
    return this.ensureType(challenge).maxSwaps;
  }

  // private

  /**
   * (Ruby hash keys keep their type.) NOTE (Ruby parity): map 191's record
   * board asks for challenge 0, an Integer key of its own, while the Battle
   * Tower's records are under "towersingle", so the board always shows 0.
   */
  protected ensureType(id: string | number): BattleChallengeType {
    const key = typeof id === "number" ? `#${id}` : id;
    if (!this.types[key]) this.types[key] = new BattleChallengeType();
    return this.types[key];
  }
}

//===============================================================================
//
//===============================================================================
export class BattleChallengeData {
  battleNumber = 0;
  numRounds = 0;
  party: Pokemon[] | null = null;
  inProgress = false;
  resting = false;
  wins = 0;
  swaps = 0;
  decision = 0;
  extraData: BattleFactoryData | null = null;
  start: [number, number, number] | null = null;
  trainers: number[] = [];
  oldParty: Pokemon[] | null = null;

  constructor() {
    this.reset();
  }

  setExtraData(value: BattleFactoryData | null): void {
    this.extraData = value;
  }

  setParty(value: Pokemon[]): void {
    if (this.inProgress) player().party = value;
    this.party = value;
  }

  async pbStart(t: BattleChallengeType, numRounds: number): Promise<void> {
    this.inProgress = true;
    this.resting = false;
    this.decision = 0;
    this.swaps = t.currentSwaps;
    this.wins = t.currentWins;
    this.battleNumber = 1;
    this.trainers = [];
    if (numRounds <= 0) throw new Error(_INTL("Number of rounds is 0 or less."));
    this.numRounds = numRounds;
    // Get all the trainers for the next set of battles
    const btTrainers = pbGetBTTrainers(pbBattleChallenge().currentChallenge);
    while (this.trainers.length < this.numRounds) {
      const newtrainer = pbBattleChallengeTrainer(this.wins + this.trainers.length, btTrainers);
      let found = false;
      for (const tr of this.trainers) if (tr === newtrainer) found = true;
      if (!found) this.trainers.push(newtrainer);
    }
    this.start = [G.gameMap!.mapId, G.gamePlayer!.x, G.gamePlayer!.y];
    this.oldParty = player().party;
    if (this.party) player().party = this.party;
    await gameSave(true);
  }

  async pbGoToStart(): Promise<void> {
    const scene = G.scene as unknown as { transferPlayer?: () => Promise<void> } | null;
    if (scene && typeof scene.transferPlayer === "function") { // $scene.is_a?(Scene_Map)
      G.gameTemp.playerTransferring = true;
      G.gameTemp.playerNewMapId = this.start![0];
      G.gameTemp.playerNewX = this.start![1];
      G.gameTemp.playerNewY = this.start![2];
      G.gameTemp.playerNewDirection = 8;
      const { pbDismountBike } = await import("../field/bicycle");
      await pbDismountBike();
      await scene.transferPlayer();
    }
  }

  pbAddWin(): void {
    if (!this.inProgress) return;
    this.battleNumber += 1;
    this.wins += 1;
  }

  pbAddSwap(): void {
    if (this.inProgress) this.swaps += 1;
  }

  pbMatchOver(): boolean {
    if (!this.inProgress || this.decision !== 0) return true;
    return this.battleNumber > this.numRounds;
  }

  async pbRest(): Promise<void> {
    if (!this.inProgress) return;
    this.resting = true;
    await this.pbSaveInProgress();
  }

  async pbGoOn(): Promise<void> {
    if (!this.inProgress) return;
    this.resting = false;
    await this.pbSaveInProgress();
  }

  pbCancel(): void {
    if (this.oldParty) player().party = this.oldParty;
    this.reset();
  }

  async pbEnd(): Promise<void> {
    // NOTE (Ruby parity): before checking that a challenge is in progress
    // (nil without one, 001_Challenge_BattleChallenge.rb:275).
    player().party = this.oldParty!;
    if (!this.inProgress) return;
    const save = this.decision !== 0;
    this.reset();
    (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
    if (save) await gameSave(true);
  }

  get nextTrainer(): number {
    return this.trainers[this.battleNumber - 1]!;
  }

  // private

  protected reset(): void {
    this.inProgress = false;
    this.resting = false;
    this.start = null;
    this.decision = 0;
    this.wins = 0;
    this.swaps = 0;
    this.battleNumber = 0;
    this.trainers = [];
    this.oldParty = null;
    this.party = null;
    this.extraData = null;
  }

  protected async pbSaveInProgress(): Promise<void> {
    const gameMap = G.gameMap!;
    const gamePlayer = G.gamePlayer! as unknown as { x: number; y: number; direction: number };
    const oldmapid = gameMap.mapId;
    const oldx = gamePlayer.x;
    const oldy = gamePlayer.y;
    const olddirection = gamePlayer.direction;
    gameMap.mapId = this.start![0];
    gamePlayerMoveto2(gamePlayer, this.start![1], this.start![2]);
    gamePlayer.direction = 8; // facing up
    await gameSave(true);
    gameMap.mapId = oldmapid;
    gamePlayerMoveto2(gamePlayer, oldx, oldy);
    gamePlayer.direction = olddirection;
  }
}

//===============================================================================
//
//===============================================================================
export class BattleChallengeType {
  currentWins = 0;
  previousWins = 0;
  maxWins = 0;
  currentSwaps = 0;
  previousSwaps = 0;
  maxSwaps = 0;
  // attr_readers nothing sets (nil), read by BattleChallenge#rules
  readonly doublebattle: unknown = null;
  readonly numPokemon: number | null = null;
  readonly battletype: number | null = null;
  readonly mode: number | null = null;

  constructor() {
    this.previousWins = 0;
    this.maxWins = 0;
    this.currentWins = 0;
    this.currentSwaps = 0;
    this.previousSwaps = 0;
    this.maxSwaps = 0;
  }

  /** Object#clone */
  clone(): BattleChallengeType {
    return Object.assign(new BattleChallengeType(), this);
  }

  saveWins(challenge: BattleChallengeData): void {
    if (challenge.decision === 0) { // if undecided
      this.currentWins = 0;
      this.currentSwaps = 0;
    } else {
      if (challenge.decision === 1) { // if won
        this.currentWins = challenge.wins;
        this.currentSwaps = challenge.swaps;
      } else { // if lost
        this.currentWins = 0;
        this.currentSwaps = 0;
      }
      this.maxWins = Math.max(this.maxWins, challenge.wins);
      this.previousWins = challenge.wins;
      this.maxSwaps = Math.max(this.maxSwaps, challenge.swaps);
      this.previousSwaps = challenge.swaps;
    }
  }
}

//===============================================================================
// Battle Factory data
//===============================================================================
export class BattleFactoryData {
  declare bcdata: BattleChallengeData;
  rentals: Pokemon[] = [];
  trainerid = 0;
  opponent: NPCTrainer | null = null;
  oldopponent: Pokemon[] = [];

  constructor(bcdata: BattleChallengeData) {
    // (Non-enumerable: a link back to the data holding this; see marshal.ts.)
    Object.defineProperty(this, "bcdata", { value: bcdata, writable: true, enumerable: false, configurable: true });
  }

  pbPrepareRentals(): void {
    this.rentals = pbBattleFactoryPokemon(pbBattleChallenge().rules, this.bcdata.wins, this.bcdata.swaps, []);
    this.trainerid = this.bcdata.nextTrainer;
    const bttrainers = pbGetBTTrainers(pbBattleChallenge().currentChallenge);
    const trainerdata = bttrainers[this.trainerid]!;
    // pbGetMessageFromHash(MessageTypes::TrainerNames / EndSpeechLose / EndSpeechWin, ...)
    this.opponent = new NPCTrainer(trainerdata[1], trainerdata[0]);
    this.opponent.loseText = trainerdata[4];
    this.opponent.winText = trainerdata[3];
    const opponentPkmn = pbBattleFactoryPokemon(pbBattleChallenge().rules, this.bcdata.wins, this.bcdata.swaps, this.rentals);
    this.opponent.party = sampleN(opponentPkmn, 3);
  }

  async pbChooseRentals(): Promise<void> {
    await pbFadeOutIn(async () => {
      const scene = new BattleSwapScene();
      const screen = new BattleSwapScreen(scene);
      this.rentals = await screen.pbStartRent(this.rentals);
      this.bcdata.pbAddSwap();
      this.bcdata.setParty(this.rentals);
    });
  }

  pbPrepareSwaps(): void {
    this.oldopponent = this.opponent!.party;
    const trainerid = this.bcdata.nextTrainer;
    const bttrainers = pbGetBTTrainers(pbBattleChallenge().currentChallenge);
    const trainerdata = bttrainers[trainerid]!;
    this.opponent = new NPCTrainer(trainerdata[1], trainerdata[0]);
    this.opponent.loseText = trainerdata[4];
    this.opponent.winText = trainerdata[3];
    const opponentPkmn = pbBattleFactoryPokemon(pbBattleChallenge().rules, this.bcdata.wins, this.bcdata.swaps,
      [...this.rentals, ...this.oldopponent]);
    this.opponent.party = sampleN(opponentPkmn, 3);
  }

  async pbChooseSwaps(): Promise<boolean> {
    let swapMade = true;
    await pbFadeOutIn(async () => {
      const scene = new BattleSwapScene();
      const screen = new BattleSwapScreen(scene);
      swapMade = await screen.pbStartSwap(this.rentals, this.oldopponent);
      if (swapMade) this.bcdata.pbAddSwap();
      this.bcdata.setParty(this.rentals);
    });
    return swapMade;
  }

  async pbBattle(challenge: BattleChallenge): Promise<boolean> {
    // (Ruby also looks up the trainer's data here and doesn't use it.)
    void pbGetBTTrainers(pbBattleChallenge().currentChallenge)[this.trainerid];
    return pbOrganizedBattleEx(this.opponent!, challenge.rules);
  }
}
