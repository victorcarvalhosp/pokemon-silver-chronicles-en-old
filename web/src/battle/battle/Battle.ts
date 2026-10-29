// Port of Data/Scripts/011_Battle/001_Battle/001_Battle.rb (class Battle), with
// the plugin patches to its fields and core methods:
// - Generation 9 Pack ([001] Battle/[001] Battle.rb): abils_triggered,
//   rage_hit_count, fainted_count, sideStatUps and their accessors;
//   pbSetDefeated (Kingambit evolution counter); [005] Weather and Status.rb:
//   pbStartWeather (Snow).
// - Essentials Deluxe ([000] Essentials Patches/Battle.rb): raid_battle,
//   scripted mechanics (Deluxe battle rules); Battle_Misc.rb: pbSetSeen.
// - ZUD Mechanics ([003] Battle/Battle_Overrides.rb): Z-Move/Ultra Burst/
//   Dynamax usage arrays, Z-Rings and Dynamax Bands.
//
// The rest of the class is in the other files of this folder (one per Ruby
// file); see ../index.ts. Results of battle (this.decision):
//    0 - Undecided or aborted
//    1 - Player won
//    2 - Player lost
//    3 - Player or wild Pokémon ran from battle, or player forfeited the match
//    4 - Wild Pokémon was caught
//    5 - Draw
// Possible actions a battler can take in a round (choices[i][0]):
//    "None", "UseMove", "SwitchOut", "UseItem", "Call", "Run", "Shift"

import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { BattleTerrain } from "../../data/gameData/battleTerrain";
import { BattleWeather } from "../../data/gameData/battleWeather";
import { Item } from "../../data/gameData/item";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Player } from "../../game/trainer/Player";
import type { NPCTrainer, Trainer } from "../../game/trainer/Trainer";
import { AI } from "../ai/AI";
import { type IBattleScene, Scene } from "../BattleSceneInterface";
import { Battler } from "../battler/Battler";
import { Move } from "../move/Move";
import { ActiveField, type ActivePosition, ActiveSide } from "../other/ActiveField";
import { ItemEffects } from "../other/ItemEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { Peer } from "../other/Peers";
import type { SuccessState } from "./Battle_StartAndEnd";

/** A trainer on either side: the player (or a partner) or an NPC trainer. */
export type BattleTrainer = Player | NPCTrainer | Trainer;

/**
 * One battler's choice for the round, Ruby's 4-element array:
 * [action, index (move/party/item use), Battle::Move or item ID, target index,
 * move priority (set by pbCalculatePriority)].
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BattleChoice = [Id, any, any, number, number?];

/** The battle rules set by setBattleRule/Deluxe battle rules (Ruby: hash with string keys). */
export type BattleRules = Record<string, unknown>;

/** A battler index, or something with an index (Ruby's `respond_to?("index")`). */
export type BattlerRef = number | { index: number };

export const refIndex = (x: BattlerRef): number => (typeof x === "number" ? x : x.index);

export class Battle {
  /** Scene object for this battle */
  readonly scene: IBattleScene;
  peer: Peer;
  /** Effects common to the whole of a battle */
  readonly field: ActiveField;
  /** Effects common to each side of a battle */
  readonly sides: ActiveSide[];
  /** Effects that apply to a battler position */
  readonly positions: ActivePosition[];
  /** Currently active Pokémon */
  readonly battlers: (Battler | null)[];
  /** Array of number of battlers per side */
  sideSizes: number[];
  /** Filename fragment used for background graphics */
  backdrop: string;
  /** Filename fragment used for base graphics */
  backdropBase: string | null;
  /** Time of day (0=day, 1=eve, 2=night) */
  time: number;
  /** Battle surroundings (for mechanics purposes) */
  environment: Id;
  turnCount: number;
  /** Decision: 0=undecided; 1=win; 2=loss; 3=escaped; 4=caught */
  decision: number;
  /** Player trainer (or array of trainers) */
  readonly player: BattleTrainer[] | null;
  /** Opponent trainer (or array of trainers) */
  readonly opponent: NPCTrainer[] | null;
  /** Items held by opponents */
  items: Id[][] | null;
  /** Items held by allies */
  allyItems: Id[][] | null;
  /** Array of start indexes for each player-side trainer's party */
  party1starts: number[];
  /** Array of start indexes for each opponent-side trainer's party */
  party2starts: number[];
  /** Internal battle flag */
  internalBattle: boolean;
  /** Debug flag */
  debug: boolean;
  /** True if player can run from battle */
  canRun: boolean;
  /** True if player won't black out if they lose */
  canLose: boolean;
  /** Switch/Set "battle style" option */
  switchStyle: boolean;
  /** "Battle Effects" option */
  showAnims: boolean;
  /** Whether player's Pokémon are AI controlled */
  controlPlayer: boolean;
  /** Whether Pokémon can gain Exp/EVs */
  expGain: boolean;
  /** Whether the player can gain/lose money */
  moneyGain: boolean;
  /** Whether Poké Balls cannot be thrown at all */
  disablePokeBalls: boolean;
  /** Send to Boxes (0=ask, 1=don't ask, 2=must add to party) */
  sendToBoxes: number;
  rules: BattleRules;
  /** Choices made by each Pokémon this round */
  choices: BattleChoice[];
  /** Battle index of each trainer's Pokémon to Mega Evolve */
  megaEvolution: number[][];
  readonly initialItems: (Id | null)[][];
  readonly recycleItems: (Id | null)[][];
  readonly belch: boolean[][];
  readonly battleBond: boolean[][];
  readonly corrosiveGas: boolean[][];
  /** Whether each Pokémon was used in battle (for Burmy) */
  readonly usedInBattle: boolean[][];
  /** Success states */
  successStates: SuccessState[];
  /** Last move used */
  lastMoveUsed: Id | null;
  /** Last move user */
  lastMoveUser: number;
  /** ID of the first thrown Poké Ball that failed */
  firstPokeBall: Id | null = null;
  /** Set after first_poke_ball to prevent it being set again */
  pokeBallFailed = false;
  /** True if during the switching phase of the round */
  switching: boolean;
  /** True if Future Sight is hitting */
  futureSight: boolean;
  /** True during the end of round */
  endOfRound: boolean;
  /** True if Mold Breaker applies */
  moldBreaker: boolean;
  /** The Struggle move */
  readonly struggle: Move;
  /**
   * Scene effects started from synchronous code (damage calculation) that
   * Ruby plays right there; the async caller plays them with
   * pbPlayPendingSceneEffects at that same point in the flow.
   */
  pendingSceneEffects: (() => Promise<void>)[] = [];

  async pbPlayPendingSceneEffects(): Promise<void> {
    while (this.pendingSceneEffects.length > 0) await this.pendingSceneEffects.shift()!();
  }

  // Private in Ruby (instance variables without accessors).
  caughtPokemon: Pokemon[];
  party1: (Pokemon | null)[];
  party2: (Pokemon | null)[];
  party1order: number[];
  party2order: number[];
  /**
   * Battlers in order of action this round (pbCalculatePriority): [battler,
   * speed, priority bracket, priority, sub-priority, ..., random order] (see
   * PriorityEntry in Battle_ActionAttacksPriority.ts).
   */
  priority: [Battler, number, number, number, number, number, number][];
  priorityTrickRoom: boolean;
  runCommand: number;
  _nextPickupUse: number;
  megaRings: Id[];
  battleAI: AI;
  /** Battle::CatchAndStoreMixin: whether the last throw was a critical capture. */
  criticalCapture = false;

  // Generation 9 Pack
  /** Used to track any once-per-battle ability triggers for each Pokemon. */
  abilsTriggered: boolean[][];
  /** Used to track the number of hits that have been taken for Rage Fist. */
  rageHitCount: number[][];
  /** Used to track the number of fainted battlers for Last Respects/Supreme Overlord. */
  faintedCount: number[];
  /** Used to tally up the number of stat boosts to mirror with Opportunist/Mirror Herb. */
  sideStatUps: Record<Id, number>[];

  // Essentials Deluxe
  readonly raidBattle: boolean;
  /** Mechanics that only trigger when scripted: mechanic -> [side][owner] -> bool. */
  scriptedMechanics: Record<string, boolean[][]>;
  // Plugins that aren't installed; pbSetBattleMechanicUsage writes them.
  battleStyle: number[][] | null = null;
  terastallize: number[][] | null = null;
  zodiac: number[][] | null = null;
  /** Essentials Deluxe ([001] Plugin Patches/_Custom Placeholder_.rb:22): the custom-mechanic placeholder. */
  custom: number[][] | null = null;

  // ZUD Mechanics
  zMove: number[][];
  ultraBurst: number[][];
  dynamax: number[][];
  zRings: Id[];
  dynamaxBands: Id[];

  pbRandom(x: number): number { return rand(x); }

  //=============================================================================
  // Creating the battle class
  //=============================================================================
  constructor(scene: IBattleScene, p1: (Pokemon | null)[], p2: (Pokemon | null)[],
    player: BattleTrainer | BattleTrainer[] | null, opponent: NPCTrainer | NPCTrainer[] | null) {
    // Essentials Deluxe
    this.raidBattle = false;
    // --- Essentials ---
    if (p1.length === 0) {
      throw new Error(_INTL("Party 1 has no Pokémon."));
    } else if (p2.length === 0) {
      throw new Error(_INTL("Party 2 has no Pokémon."));
    }
    this.scene = scene;
    this.peer = new Peer();
    this.field = new ActiveField(); // Whole field (gravity/rooms)
    this.sides = [new ActiveSide(), // Player's side
      new ActiveSide()]; // Foe's side
    this.positions = []; // Battler positions
    this.battlers = [];
    this.sideSizes = [1, 1]; // Single battle, 1v1
    this.backdrop = "";
    this.backdropBase = null;
    this.time = 0;
    this.environment = "None"; // e.g. Tall grass, cave, still water
    this.turnCount = 0;
    this.decision = 0;
    this.caughtPokemon = [];
    if (player != null && !Array.isArray(player)) player = [player];
    if (opponent != null && !Array.isArray(opponent)) opponent = [opponent];
    this.player = player; // Array of Player/NPCTrainer objects, or nil
    this.opponent = opponent; // Array of NPCTrainer objects, or nil
    this.items = null;
    this.allyItems = null; // Array of items held by ally. This is just used for Mega Evolution for now.
    this.party1 = p1;
    this.party2 = p2;
    this.party1order = Array.from({ length: this.party1.length }, (_, i) => i);
    this.party2order = Array.from({ length: this.party2.length }, (_, i) => i);
    this.party1starts = [0];
    this.party2starts = [0];
    this.internalBattle = true;
    this.debug = false;
    this.canRun = true;
    this.canLose = false;
    this.switchStyle = true;
    this.showAnims = true;
    this.controlPlayer = false;
    this.expGain = true;
    this.moneyGain = true;
    this.disablePokeBalls = false;
    this.sendToBoxes = 1;
    this.rules = {};
    this.priority = [];
    this.priorityTrickRoom = false;
    this.choices = [];
    this.megaEvolution = [
      new Array<number>(this.player ? this.player.length : 1).fill(-1),
      new Array<number>(this.opponent ? this.opponent.length : 1).fill(-1),
    ];
    this.initialItems = [
      Array.from({ length: this.party1.length }, (_, i) => this.party1[i]?.itemId ?? null),
      Array.from({ length: this.party2.length }, (_, i) => this.party2[i]?.itemId ?? null),
    ];
    this.recycleItems = [new Array<Id | null>(this.party1.length).fill(null), new Array<Id | null>(this.party2.length).fill(null)];
    this.belch = [new Array<boolean>(this.party1.length).fill(false), new Array<boolean>(this.party2.length).fill(false)];
    this.battleBond = [new Array<boolean>(this.party1.length).fill(false), new Array<boolean>(this.party2.length).fill(false)];
    this.corrosiveGas = [new Array<boolean>(this.party1.length).fill(false), new Array<boolean>(this.party2.length).fill(false)];
    this.usedInBattle = [new Array<boolean>(this.party1.length).fill(false), new Array<boolean>(this.party2.length).fill(false)];
    this.successStates = [];
    this.lastMoveUsed = null;
    this.lastMoveUser = -1;
    this.switching = false;
    this.futureSight = false;
    this.endOfRound = false;
    this.moldBreaker = false;
    this.runCommand = 0;
    this._nextPickupUse = 0;
    if (MoveData.exists("STRUGGLE")) {
      this.struggle = Move.fromPokemonMove(this, new PokemonMove("STRUGGLE"));
    } else {
      this.struggle = Move.createStruggle(this);
    }
    this.megaRings = [];
    for (const item of Item.each()) if (item.hasFlag("MegaRing")) this.megaRings.push(item.id);
    this.battleAI = new AI(this);
    // --- Generation 9 Pack ---
    this.abilsTriggered = [new Array<boolean>(this.party1.length).fill(false), new Array<boolean>(this.party2.length).fill(false)];
    this.rageHitCount = [new Array<number>(this.party1.length).fill(0), new Array<number>(this.party2.length).fill(0)];
    this.faintedCount = [0, 0];
    this.sideStatUps = [{}, {}];
    // --- Essentials Deluxe ---
    this.scriptedMechanics = {};
    this.pbApplyDeluxeRules();
    this.custom = [
      new Array<number>(this.player ? this.player.length : 1).fill(-1),
      new Array<number>(this.opponent ? this.opponent.length : 1).fill(-1),
    ];
    // --- ZUD Mechanics ---
    const perTrainer = () => [
      new Array<number>(this.player ? this.player.length : 1).fill(-1),
      new Array<number>(this.opponent ? this.opponent.length : 1).fill(-1),
    ];
    this.zMove = perTrainer();
    this.ultraBurst = perTrainer();
    this.dynamax = perTrainer();
    this.zRings = [];
    for (const item of Item.each()) if (item.hasFlag("ZRing")) this.zRings.push(item.id);
    this.dynamaxBands = [];
    for (const item of Item.each()) if (item.hasFlag("DynamaxBand")) this.dynamaxBands.push(item.id);
  }

  /**
   * Essentials Deluxe (Battle.rb:14): applies $game_temp.dx_rules (autobattle,
   * compbattle, win/lose texts, scripted mechanics) when a Deluxe battle set them.
   */
  pbApplyDeluxeRules(): void {
    const rules = (G.gameTemp as unknown as { dxRules?: Record<string, unknown> | null }).dxRules;
    if (!rules) return;
    if (rules.autobattle) this.controlPlayer = true;
    if (rules.compbattle) this.internalBattle = false;
    if (this.opponent) {
      const win = rules.wintext as (string | null)[] | undefined;
      if (win) this.opponent.forEach((t, i) => { t.winText = win[i] ?? null; });
      const lose = rules.losetext as (string | null)[] | undefined;
      if (lose) this.opponent.forEach((t, i) => { t.loseText = lose[i] ?? null; });
    }
    const scripted = rules.scripted as Record<string, unknown[]> | undefined;
    if (!scripted) return;
    for (const [mechanic, trainerSyms] of Object.entries(scripted)) {
      // The trainers are Symbols (:Player, :FoeSide...): Syms in a deluxe hash (battle/deluxe/rubyData.ts).
      const trainers = trainerSyms.map((t) => String(t));
      this.scriptedMechanics[mechanic] = [
        new Array<boolean>(this.player ? this.player.length : 1).fill(false),
        new Array<boolean>(this.opponent ? this.opponent.length : 1).fill(false),
      ];
      const m = this.scriptedMechanics[mechanic]!;
      for (const trainer of trainers) {
        switch (trainer) {
          case "Player": case "Ally": {
            const owner = trainer === "Player" ? 0 : 1;
            // Ruby: `next if !@scriptedMechanics[mechanic][side][owner]` (always false here, so this never sets)
            if (!m[0]![owner]) continue;
            m[0]![owner] = true;
            break;
          }
          case "PlayerSide": case "AllySide":
            for (let owner = 0; owner < (this.player?.length ?? 0); owner++) m[0]![owner] = true;
            break;
          case "Foe": case "FoeAlly": case "FoeAlly1": case "FoeAlly2": {
            const owner = { Foe: 0, FoeAlly: 1, FoeAlly1: 1, FoeAlly2: 2 }[trainer];
            if (!m[1]![owner]) continue;
            m[1]![owner] = true;
            break;
          }
          case "FoeSide":
            for (let owner = 0; owner < (this.opponent?.length ?? 0); owner++) m[1]![owner] = true;
            break;
        }
      }
    }
  }

  /** Essentials Deluxe: pbScriptedMechanic? — checks if certain battle mechanics only trigger as part of a scripted battle. */
  pbScriptedMechanic(idxBattler: number, mechanic: string): boolean {
    const m = this.scriptedMechanics[mechanic];
    if (!m) return false;
    const side = this.battlers[idxBattler]!.idxOwnSide();
    const owner = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    return m[side]![owner] ?? false;
  }

  //=============================================================================
  // Information about the type and size of the battle
  //=============================================================================
  /** wildBattle? */
  wildBattle(): boolean { return this.opponent == null; }
  /** trainerBattle? */
  trainerBattle(): boolean { return this.opponent != null; }

  /**
   * Sets the number of battler slots on each side of the field independently.
   * For "1v2" names, the first number is for the player's side and the second
   * number is for the opposing side.
   */
  setBattleMode(mode: string): void {
    switch (mode) {
      case "triple": case "3v3": this.sideSizes = [3, 3]; break;
      case "3v2": this.sideSizes = [3, 2]; break;
      case "3v1": this.sideSizes = [3, 1]; break;
      case "2v3": this.sideSizes = [2, 3]; break;
      case "double": case "2v2": this.sideSizes = [2, 2]; break;
      case "2v1": this.sideSizes = [2, 1]; break;
      case "1v3": this.sideSizes = [1, 3]; break;
      case "1v2": this.sideSizes = [1, 2]; break;
      default: this.sideSizes = [1, 1]; // Single, 1v1 (default)
    }
  }

  /** singleBattle? */
  singleBattle(): boolean {
    return this.pbSideSize(0) === 1 && this.pbSideSize(1) === 1;
  }

  pbSideSize(index: number): number {
    return this.sideSizes[index % 2]!;
  }

  maxBattlerIndex(): number {
    return this.pbSideSize(0) > this.pbSideSize(1) ? (this.pbSideSize(0) - 1) * 2 : (this.pbSideSize(1) * 2) - 1;
  }

  //=============================================================================
  // Trainers and owner-related methods
  //=============================================================================
  pbPlayer(): Player { return this.player![0] as Player; }

  /**
   * Given a battler index, returns the index within @player/@opponent of the
   * trainer that controls that battler index.
   * NOTE: You shouldn't ever have more trainers on a side than there are battler
   *       positions on that side. This method doesn't account for if you do.
   */
  pbGetOwnerIndexFromBattlerIndex(idxBattler: number): number {
    const trainer = this.opposes(idxBattler) ? this.opponent : this.player;
    if (!trainer) return 0;
    switch (trainer.length) {
      case 2: {
        const n = this.pbSideSize(idxBattler % 2);
        if (n === 3) return [0, 0, 1][Math.floor(idxBattler / 2)]!;
        return Math.floor(idxBattler / 2); // Same as [0,1][idxBattler/2], i.e. 2 battler slots
      }
      case 3:
        return Math.floor(idxBattler / 2);
    }
    return 0;
  }

  pbGetOwnerFromBattlerIndex(idxBattler: number): BattleTrainer | null {
    const idxTrainer = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    const trainer = this.opposes(idxBattler) ? this.opponent : this.player;
    return trainer == null ? null : (trainer[idxTrainer] ?? null);
  }

  pbGetOwnerIndexFromPartyIndex(idxBattler: number, idxParty: number): number {
    let ret = -1;
    const starts = this.pbPartyStarts(idxBattler);
    for (let i = 0; i < starts.length; i++) {
      if (starts[i]! > idxParty) break;
      ret = i;
    }
    return ret;
  }

  /**
   * Only used for the purpose of an error message when one trainer tries to
   * switch another trainer's Pokémon.
   */
  pbGetOwnerFromPartyIndex(idxBattler: number, idxParty: number): BattleTrainer | null {
    const idxTrainer = this.pbGetOwnerIndexFromPartyIndex(idxBattler, idxParty);
    const trainer = this.opposes(idxBattler) ? this.opponent : this.player;
    return trainer == null ? null : (trainer[idxTrainer] ?? null);
  }

  pbGetOwnerName(idxBattler: number): string {
    const idxTrainer = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    if (this.opposes(idxBattler)) return this.opponent![idxTrainer]!.fullName(); // Opponent
    if (idxTrainer > 0) return this.player![idxTrainer]!.fullName(); // Ally trainer
    return this.player![idxTrainer]!.name; // Player
  }

  pbGetOwnerItems(idxBattler: number): Id[] {
    if (this.opposes(idxBattler)) {
      if (!this.items) return [];
      return this.items[this.pbGetOwnerIndexFromBattlerIndex(idxBattler)]!;
    }
    if (!this.allyItems) return [];
    return this.allyItems[this.pbGetOwnerIndexFromBattlerIndex(idxBattler)]!;
  }

  /**
   * Returns whether the battler in position idxBattler is owned by the same
   * trainer that owns the Pokémon in party slot idxParty. This assumes that
   * both the battler position and the party slot are from the same side.
   */
  pbIsOwner(idxBattler: number, idxParty: number): boolean {
    const idxTrainer1 = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    const idxTrainer2 = this.pbGetOwnerIndexFromPartyIndex(idxBattler, idxParty);
    return idxTrainer1 === idxTrainer2;
  }

  /** pbOwnedByPlayer? */
  pbOwnedByPlayer(idxBattler: number): boolean {
    if (this.opposes(idxBattler)) return false;
    return this.pbGetOwnerIndexFromBattlerIndex(idxBattler) === 0;
  }

  /**
   * Returns the number of Pokémon positions controlled by the given trainerIndex
   * on the given side of battle.
   */
  pbNumPositions(side: number, idxTrainer: number): number {
    let ret = 0;
    for (let i = 0; i < this.pbSideSize(side); i++) {
      const t = this.pbGetOwnerIndexFromBattlerIndex((i * 2) + side);
      if (t !== idxTrainer) continue;
      ret += 1;
    }
    return ret;
  }

  //=============================================================================
  // Get party information (counts all teams on the same side)
  //=============================================================================
  pbParty(idxBattler: number): (Pokemon | null)[] {
    return this.opposes(idxBattler) ? this.party2 : this.party1;
  }

  pbOpposingParty(idxBattler: number): (Pokemon | null)[] {
    return this.opposes(idxBattler) ? this.party1 : this.party2;
  }

  pbPartyOrder(idxBattler: number): number[] {
    return this.opposes(idxBattler) ? this.party2order : this.party1order;
  }

  pbPartyStarts(idxBattler: number): number[] {
    return this.opposes(idxBattler) ? this.party2starts : this.party1starts;
  }

  /**
   * Returns the player's team in its display order. Used when showing the party
   * screen.
   */
  pbPlayerDisplayParty(idxBattler = 0): Pokemon[] {
    const partyOrders = this.pbPartyOrder(idxBattler);
    const [idxStart] = this.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    const ret: Pokemon[] = [];
    this.eachInTeamFromBattlerIndex(idxBattler, (pkmn, i) => { ret[partyOrders[i]! - idxStart] = pkmn; });
    return ret;
  }

  pbAbleCount(idxBattler = 0): number {
    const party = this.pbParty(idxBattler);
    let count = 0;
    for (const pkmn of party) if (pkmn?.able()) count += 1;
    return count;
  }

  pbAbleNonActiveCount(idxBattler = 0): number {
    const party = this.pbParty(idxBattler);
    const inBattleIndices = this.allSameSideBattlers(idxBattler).map((b) => b.pokemonIndex);
    let count = 0;
    party.forEach((pkmn, idxParty) => {
      if (!pkmn || !pkmn.able()) return;
      if (inBattleIndices.includes(idxParty)) return;
      count += 1;
    });
    return count;
  }

  /** pbAllFainted? */
  pbAllFainted(idxBattler = 0): boolean {
    return this.pbAbleCount(idxBattler) === 0;
  }

  pbTeamAbleNonActiveCount(idxBattler = 0): number {
    const inBattleIndices = this.allSameSideBattlers(idxBattler).map((b) => b.pokemonIndex);
    let count = 0;
    this.eachInTeamFromBattlerIndex(idxBattler, (pkmn, i) => {
      if (!pkmn || !pkmn.able()) return;
      if (inBattleIndices.includes(i)) return;
      count += 1;
    });
    return count;
  }

  /**
   * For the given side of the field (0=player's, 1=opponent's), returns an array
   * containing the number of able Pokémon in each team.
   */
  pbAbleTeamCounts(side: number): number[] {
    const party = this.pbParty(side);
    const partyStarts = this.pbPartyStarts(side);
    const ret: number[] = [];
    let idxTeam = -1;
    let nextStart = 0;
    party.forEach((pkmn, i) => {
      if (i >= nextStart) {
        idxTeam += 1;
        nextStart = idxTeam < partyStarts.length - 1 ? partyStarts[idxTeam + 1]! : party.length;
      }
      if (!pkmn || !pkmn.able()) return;
      ret[idxTeam] = (ret[idxTeam] ?? 0) + 1;
    });
    return ret;
  }

  //=============================================================================
  // Get team information (a team is only the Pokémon owned by a particular
  // trainer)
  //=============================================================================
  pbTeamIndexRangeFromBattlerIndex(idxBattler: number): [number, number] {
    const partyStarts = this.pbPartyStarts(idxBattler);
    const idxTrainer = this.pbGetOwnerIndexFromBattlerIndex(idxBattler);
    const idxPartyStart = partyStarts[idxTrainer]!;
    const idxPartyEnd = idxTrainer < partyStarts.length - 1 ? partyStarts[idxTrainer + 1]! : this.pbParty(idxBattler).length;
    return [idxPartyStart, idxPartyEnd];
  }

  pbTeamLengthFromBattlerIndex(idxBattler: number): number {
    const [idxPartyStart, idxPartyEnd] = this.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    return idxPartyEnd - idxPartyStart;
  }

  eachInTeamFromBattlerIndex(idxBattler: number, fn: (pkmn: Pokemon, i: number) => void): void {
    const party = this.pbParty(idxBattler);
    const [idxPartyStart, idxPartyEnd] = this.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    party.forEach((pkmn, i) => { if (pkmn && i >= idxPartyStart && i < idxPartyEnd) fn(pkmn, i); });
  }

  eachInTeam(side: number, idxTrainer: number, fn: (pkmn: Pokemon, i: number) => void): void {
    const party = this.pbParty(side);
    const partyStarts = this.pbPartyStarts(side);
    const idxPartyStart = partyStarts[idxTrainer]!;
    const idxPartyEnd = idxTrainer < partyStarts.length - 1 ? partyStarts[idxTrainer + 1]! : party.length;
    party.forEach((pkmn, i) => { if (pkmn && i >= idxPartyStart && i < idxPartyEnd) fn(pkmn, i); });
  }

  /**
   * Used for Illusion.
   * NOTE: This cares about the temporary rearranged order of the team. That is,
   *       if you do some switching, the last Pokémon in the team could change
   *       and the Illusion could be a different Pokémon.
   */
  pbLastInTeam(idxBattler: number): number {
    const party = this.pbParty(idxBattler);
    const partyOrders = this.pbPartyOrder(idxBattler);
    const [idxPartyStart, idxPartyEnd] = this.pbTeamIndexRangeFromBattlerIndex(idxBattler);
    let ret = -1;
    party.forEach((pkmn, i) => {
      if (i < idxPartyStart || i >= idxPartyEnd) return; // Check the team only
      if (!pkmn || !pkmn.able()) return; // Can't copy a non-fainted Pokémon or egg
      if (ret < 0 || partyOrders[i]! > partyOrders[ret]!) ret = i;
    });
    return ret;
  }

  /** Used to calculate money gained/lost after winning/losing a battle. */
  pbMaxLevelInTeam(side: number, idxTrainer: number): number {
    let ret = 1;
    this.eachInTeam(side, idxTrainer, (pkmn) => { if (pkmn.level > ret) ret = pkmn.level; });
    return ret;
  }

  //=============================================================================
  // Iterate through battlers
  //=============================================================================
  /** Unused */
  eachBattler(fn: (b: Battler) => void): void {
    for (const b of this.battlers) if (b && !b.fainted()) fn(b);
  }

  allBattlers(): Battler[] {
    return this.battlers.filter((b): b is Battler => b != null && !b.fainted());
  }

  /** Unused */
  eachSameSideBattler(idxBattler: BattlerRef, fn: (b: Battler) => void): void {
    const idx = refIndex(idxBattler);
    for (const b of this.battlers) if (b && !b.fainted() && !b.opposes(idx)) fn(b);
  }

  allSameSideBattlers(idxBattler: BattlerRef = 0): Battler[] {
    const idx = refIndex(idxBattler);
    return this.battlers.filter((b): b is Battler => b != null && !b.fainted() && !b.opposes(idx));
  }

  /** Unused */
  eachOtherSideBattler(idxBattler: BattlerRef, fn: (b: Battler) => void): void {
    const idx = refIndex(idxBattler);
    for (const b of this.battlers) if (b && !b.fainted() && b.opposes(idx)) fn(b);
  }

  allOtherSideBattlers(idxBattler: BattlerRef = 0): Battler[] {
    const idx = refIndex(idxBattler);
    return this.battlers.filter((b): b is Battler => b != null && !b.fainted() && b.opposes(idx));
  }

  pbSideBattlerCount(idxBattler: BattlerRef = 0): number {
    return this.allSameSideBattlers(idxBattler).length;
  }

  pbOpposingBattlerCount(idxBattler: BattlerRef = 0): number {
    return this.allOtherSideBattlers(idxBattler).length;
  }

  /** This method only counts the player's Pokémon, not a partner trainer's. */
  pbPlayerBattlerCount(): number {
    return this.allSameSideBattlers().filter((b) => b.pbOwnedByPlayer()).length;
  }

  pbCheckGlobalAbility(abil: Id | Id[]): Battler | null {
    for (const b of this.allBattlers()) if (b.hasActiveAbility(abil)) return b;
    return null;
  }

  pbCheckOpposingAbility(abil: Id | Id[], idxBattler = 0, nearOnly = false): Battler | null {
    for (const b of this.allOtherSideBattlers(idxBattler)) {
      if (nearOnly && !b.near(idxBattler)) continue;
      if (b.hasActiveAbility(abil)) return b;
    }
    return null;
  }

  /**
   * Given a battler index, and using battle side sizes, returns an array of
   * battler indices from the opposing side that are in order of most "opposite".
   * Used when choosing a target and pressing up/down to move the cursor to the
   * opposite side, and also when deciding which target to select first for some
   * moves.
   */
  pbGetOpposingIndicesInOrder(idxBattler: number): number[] {
    switch (this.pbSideSize(0)) {
      case 1:
        switch (this.pbSideSize(1)) {
          case 1: // 1v1 single
            if (this.opposes(idxBattler)) return [0];
            return [1];
          case 2: // 1v2
            if (this.opposes(idxBattler)) return [0];
            return [3, 1];
          case 3: // 1v3
            if (this.opposes(idxBattler)) return [0];
            return [3, 5, 1];
        }
        break;
      case 2:
        switch (this.pbSideSize(1)) {
          case 1: // 2v1
            if (this.opposes(idxBattler)) return [0, 2];
            return [1];
          case 2: // 2v2 double
            return [[3, 1], [2, 0], [1, 3], [0, 2]][idxBattler]!;
          case 3: // 2v3
            if (idxBattler < 3) return [[5, 3, 1], [2, 0], [3, 1, 5]][idxBattler]!;
            return [0, 2];
        }
        break;
      case 3:
        switch (this.pbSideSize(1)) {
          case 1: // 3v1
            if (this.opposes(idxBattler)) return [2, 0, 4];
            return [1];
          case 2: // 3v2
            return [[3, 1], [2, 4, 0], [3, 1], [2, 0, 4], [1, 3]][idxBattler]!;
          case 3: // 3v3 triple
            return [[5, 3, 1], [4, 2, 0], [3, 5, 1], [2, 0, 4], [1, 3, 5], [0, 2, 4]][idxBattler]!;
        }
        break;
    }
    return [idxBattler];
  }

  //=============================================================================
  // Comparing the positions of two battlers
  //=============================================================================
  /** opposes? */
  opposes(idxBattler1: BattlerRef, idxBattler2: BattlerRef = 0): boolean {
    return (refIndex(idxBattler1) & 1) !== (refIndex(idxBattler2) & 1);
  }

  /** nearBattlers? */
  nearBattlers(idxBattler1: number, idxBattler2: number): boolean {
    if (idxBattler1 === idxBattler2) return false;
    if (this.pbSideSize(0) <= 2 && this.pbSideSize(1) <= 2) return true;
    // Get all pairs of battler positions that are not close to each other
    const pairsArray = [[0, 4], [1, 5]]; // Covers 3v1 and 1v3
    switch (this.pbSideSize(0)) {
      case 3:
        switch (this.pbSideSize(1)) {
          case 3: // 3v3 (triple)
            pairsArray.push([0, 1]);
            pairsArray.push([4, 5]);
            break;
          case 2: // 3v2
            pairsArray.push([0, 1]);
            pairsArray.push([3, 4]);
            break;
        }
        break;
      case 2: // 2v3
        pairsArray.push([0, 1]);
        pairsArray.push([2, 5]);
        break;
    }
    // See if any pair matches the two battlers being assessed
    for (const pair of pairsArray) {
      if (pair.includes(idxBattler1) && pair.includes(idxBattler2)) return false;
    }
    return true;
  }

  //=============================================================================
  // Altering a party or rearranging battlers
  //=============================================================================
  pbRemoveFromParty(idxBattler: number, idxParty: number): void {
    const party = this.pbParty(idxBattler);
    // Erase the Pokémon from the party
    party[idxParty] = null;
    // Rearrange the display order of the team to place the erased Pokémon last
    // in it (to avoid gaps)
    const partyOrders = this.pbPartyOrder(idxBattler);
    const partyStarts = this.pbPartyStarts(idxBattler);
    const idxTrainer = this.pbGetOwnerIndexFromPartyIndex(idxBattler, idxParty);
    const idxPartyStart = partyStarts[idxTrainer]!;
    const idxPartyEnd = idxTrainer < partyStarts.length - 1 ? partyStarts[idxTrainer + 1]! : party.length;
    const origPartyPos = partyOrders[idxParty]!; // Position of erased Pokémon initially
    partyOrders[idxParty] = idxPartyEnd; // Put erased Pokémon last in the team
    for (let i = 0; i < party.length; i++) {
      if (i < idxPartyStart || i >= idxPartyEnd) continue; // Only check the team
      if (partyOrders[i]! < origPartyPos) continue; // Appeared before erased Pokémon
      partyOrders[i] = partyOrders[i]! - 1; // Appeared after erased Pokémon; bump it up by 1
    }
  }

  pbSwapBattlers(idxA: number, idxB: number): boolean {
    if (!this.battlers[idxA] || !this.battlers[idxB]) return false;
    // Can't swap if battlers aren't owned by the same trainer
    if (this.opposes(idxA, idxB)) return false;
    if (this.pbGetOwnerIndexFromBattlerIndex(idxA) !== this.pbGetOwnerIndexFromBattlerIndex(idxB)) return false;
    [this.battlers[idxA], this.battlers[idxB]] = [this.battlers[idxB], this.battlers[idxA]];
    [this.battlers[idxA]!.index, this.battlers[idxB]!.index] = [this.battlers[idxB]!.index, this.battlers[idxA]!.index];
    [this.choices[idxA], this.choices[idxB]] = [this.choices[idxB]!, this.choices[idxA]!];
    this.scene.pbSwapBattlerSprites(idxA, idxB);
    // Swap the target of any battlers' effects that point at either of the
    // swapped battlers, to ensure they still point at the correct target
    // NOTE: LeechSeed is not swapped, because drained HP goes to whichever
    //       Pokémon is in the position that Leech Seed was used from.
    // NOTE: PerishSongUser doesn't need to change, as it's only used to
    //       determine which side the Perish Song user was on, and a battler
    //       can't change sides.
    const effectsToSwap = [PBEffects.Attract,
      PBEffects.BideTarget,
      PBEffects.CounterTarget,
      PBEffects.JawLock,
      PBEffects.LockOnPos,
      PBEffects.MeanLook,
      PBEffects.MirrorCoatTarget,
      PBEffects.Octolock,
      PBEffects.SkyDrop,
      PBEffects.TrappingUser];
    for (const b of this.allBattlers()) {
      for (const i of effectsToSwap) {
        if (b.effects[i] !== idxA && b.effects[i] !== idxB) continue;
        b.effects[i] = b.effects[i] === idxA ? idxB : idxA;
      }
    }
    return true;
  }

  //=============================================================================
  //
  //=============================================================================
  /**
   * Returns the battler representing the Pokémon at index idxParty in its party,
   * on the same side as a battler with battler index of idxBattlerOther.
   */
  pbFindBattler(idxParty: number, idxBattlerOther: BattlerRef = 0): Battler | null {
    for (const b of this.allSameSideBattlers(idxBattlerOther)) if (b.pokemonIndex === idxParty) return b;
    return null;
  }

  /** Only used for Wish, as the Wishing Pokémon will no longer be in battle. */
  pbThisEx(idxBattler: number, idxParty: number): string {
    const party = this.pbParty(idxBattler);
    if (this.opposes(idxBattler)) {
      if (this.trainerBattle()) return _INTL("The opposing {1}", party[idxParty]!.name);
      return _INTL("The wild {1}", party[idxParty]!.name);
    }
    if (!this.pbOwnedByPlayer(idxBattler)) return _INTL("The ally {1}", party[idxParty]!.name);
    return party[idxParty]!.name;
  }

  /** Essentials Deluxe (Battle_Misc.rb:275): correctly records seen special Pokémon forms. */
  pbSetSeen(battler: Battler | Pokemon | null): void {
    if (!battler || !this.internalBattle) return;
    if (battler instanceof Battler) {
      const shiny = battler.superShiny() ? 2 : battler.shiny() ? 1 : 0;
      const special = battler.shadowPokemon() ? 1 : battler.gmax() ? 2 : battler.celestial() ? 3 : 0;
      this.pbPlayer().pokedex.register(battler.displaySpecies(), battler.displayGender(),
        battler.displayForm(), shiny, true, special);
    } else {
      this.pbPlayer().pokedex.register(battler);
    }
  }

  pbSetCaught(battler: Battler | Pokemon | null): void {
    if (!battler || !this.internalBattle) return;
    if (battler instanceof Battler) {
      this.pbPlayer().pokedex.registerCaught(battler.displaySpecies());
    } else {
      this.pbPlayer().pokedex.registerCaught(battler.species);
    }
  }

  pbSetDefeated(battler: Battler | Pokemon | null): void {
    if (!battler || !this.internalBattle) return;
    if (battler instanceof Battler) {
      this.pbPlayer().pokedex.registerDefeated(battler.displaySpecies());
    } else {
      this.pbPlayer().pokedex.registerDefeated(battler.species);
    }
    // Generation 9 Pack ([001] Battle.rb:136): counter for the Bisharp -> Kingambit evolution method.
    if (!(battler instanceof Battler) || battler.lastFoeAttacker.length === 0) return;
    const attacker = this.battlers[battler.lastFoeAttacker[battler.lastFoeAttacker.length - 1]!]!;
    if (!attacker.pbOwnedByPlayer()) return;
    if (attacker.species !== battler.species) return;
    attacker.pokemon!.leadersCrestEvolution(battler.itemId!);
  }

  nextPickupUse(): number {
    this._nextPickupUse += 1;
    return this._nextPickupUse;
  }

  //=============================================================================
  // Generation 9 Pack ([001] Battle.rb:29): various utilities.
  //=============================================================================
  /** pbAbilityTriggered? */
  pbAbilityTriggered(battler: Battler): boolean {
    return this.abilsTriggered[battler.index & 1]![battler.pokemonIndex]!;
  }

  pbSetAbilityTrigger(battler: Battler, value = true): void {
    this.abilsTriggered[battler.index & 1]![battler.pokemonIndex] = value;
  }

  pbAddRageHit(battler: Battler, value = 1): void {
    this.rageHitCount[battler.index & 1]![battler.pokemonIndex]! += value;
  }

  pbRageHitCount(battler: Battler): number {
    return this.rageHitCount[battler.index & 1]![battler.pokemonIndex]!;
  }

  pbAddFaintedAlly(idxBattler: BattlerRef): void {
    const idx = refIndex(idxBattler);
    if (this.faintedCount[idx & 1]! < 100) this.faintedCount[idx & 1]! += 1;
  }

  pbFaintedAllyCount(idxBattler: BattlerRef): number {
    return this.faintedCount[refIndex(idxBattler) & 1]!;
  }

  //=============================================================================
  // Weather
  //=============================================================================
  /** defaultWeather= */
  setDefaultWeather(value: Id): void {
    this.field.defaultWeather = value;
    this.field.weather = value;
    this.field.weatherDuration = -1;
  }

  /** Returns the effective weather (note that weather effects can be negated) */
  pbWeather(): Id {
    if (this.allBattlers().some((b) => b.hasActiveAbility(["CLOUDNINE", "AIRLOCK"]))) return "None";
    return this.field.weather;
  }

  /**
   * Used for causing weather by a move or by an ability.
   * Generation 9 Pack ([005] Weather and Status.rb:54): Hail is Snow (or a
   * hailstorm) depending on Settings::HAIL_WEATHER_TYPE.
   */
  async pbStartWeather(user: Battler | null, newWeather: Id, fixedDuration = false, showAnim = true): Promise<void> {
    if (this.field.weather === newWeather) return;
    this.field.weather = newWeather;
    let duration = fixedDuration ? 5 : -1;
    if (duration > 0 && user && user.itemActive()) {
      duration = ItemEffects.triggerWeatherExtender(user.item, this.field.weather, duration, user, this);
    }
    this.field.weatherDuration = duration;
    const weatherData = BattleWeather.tryGet(this.field.weather);
    if (showAnim && weatherData) await this.pbCommonAnimation(weatherData.animation!);
    if (user) await this.pbHideAbilitySplash(user);
    if (newWeather === "Hail" && Settings.HAIL_WEATHER_TYPE > 0) {
      // Generation 9 Pack
      if (Settings.HAIL_WEATHER_TYPE === 2) {
        await this.pbDisplay(_INTL("A harsh hailstorm bellows!"));
      } else {
        await this.pbDisplay(_INTL("It started to snow!"));
      }
    } else {
      switch (this.field.weather) {
        case "Sun": await this.pbDisplay(_INTL("The sunlight turned harsh!")); break;
        case "Rain": await this.pbDisplay(_INTL("It started to rain!")); break;
        case "Sandstorm": await this.pbDisplay(_INTL("A sandstorm brewed!")); break;
        case "Hail": await this.pbDisplay(_INTL("It started to hail!")); break;
        case "HarshSun": await this.pbDisplay(_INTL("The sunlight turned extremely harsh!")); break;
        case "HeavyRain": await this.pbDisplay(_INTL("A heavy rain began to fall!")); break;
        case "StrongWinds": await this.pbDisplay(_INTL("Mysterious strong winds are protecting Flying-type Pokémon!")); break;
        case "ShadowSky": await this.pbDisplay(_INTL("A shadow sky appeared!")); break;
      }
    }
    // Check for end of primordial weather, and weather-triggered form changes
    for (const b of this.allBattlers()) await b.pbCheckFormOnWeatherChange();
    await this.pbEndPrimordialWeather();
  }

  async pbEndPrimordialWeather(): Promise<void> {
    const oldWeather = this.field.weather;
    // End Primordial Sea, Desolate Land, Delta Stream
    switch (this.field.weather) {
      case "HarshSun":
        if (!this.pbCheckGlobalAbility("DESOLATELAND")) {
          this.field.weather = "None";
          await this.pbDisplay("The harsh sunlight faded!");
        }
        break;
      case "HeavyRain":
        if (!this.pbCheckGlobalAbility("PRIMORDIALSEA")) {
          this.field.weather = "None";
          await this.pbDisplay("The heavy rain has lifted!");
        }
        break;
      case "StrongWinds":
        if (!this.pbCheckGlobalAbility("DELTASTREAM")) {
          this.field.weather = "None";
          await this.pbDisplay("The mysterious air current has dissipated!");
        }
        break;
    }
    if (this.field.weather !== oldWeather) {
      // Check for form changes caused by the weather changing
      for (const b of this.allBattlers()) await b.pbCheckFormOnWeatherChange();
      // Start up the default weather
      if (this.field.defaultWeather !== "None") await this.pbStartWeather(null, this.field.defaultWeather);
    }
  }

  async pbStartWeatherAbility(newWeather: Id, battler: Battler, ignorePrimal = false): Promise<void> {
    if (!ignorePrimal && ["HarshSun", "HeavyRain", "StrongWinds"].includes(this.field.weather)) return;
    if (this.field.weather === newWeather) return;
    await this.pbShowAbilitySplash(battler);
    if (!Scene.USE_ABILITY_SPLASH) {
      await this.pbDisplay(_INTL("{1}'s {2} activated!", battler.pbThis(), battler.abilityName()));
    }
    let fixedDuration = false;
    if (Settings.FIXED_DURATION_WEATHER_FROM_ABILITY &&
        !["HarshSun", "HeavyRain", "StrongWinds"].includes(newWeather)) fixedDuration = true;
    await this.pbStartWeather(battler, newWeather, fixedDuration);
    // NOTE: The ability splash is hidden again in def pbStartWeather.
  }

  //=============================================================================
  // Terrain
  //=============================================================================
  /** defaultTerrain= */
  setDefaultTerrain(value: Id): void {
    this.field.defaultTerrain = value;
    this.field.terrain = value;
    this.field.terrainDuration = -1;
  }

  async pbStartTerrain(user: Battler | null, newTerrain: Id, fixedDuration = true): Promise<void> {
    if (this.field.terrain === newTerrain) return;
    this.field.terrain = newTerrain;
    let duration = fixedDuration ? 5 : -1;
    if (duration > 0 && user && user.itemActive()) {
      duration = ItemEffects.triggerTerrainExtender(user.item, newTerrain, duration, user, this);
    }
    this.field.terrainDuration = duration;
    const terrainData = BattleTerrain.tryGet(this.field.terrain);
    if (terrainData) await this.pbCommonAnimation(terrainData.animation!);
    if (user) await this.pbHideAbilitySplash(user);
    switch (this.field.terrain) {
      case "Electric":
        await this.pbDisplay(_INTL("An electric current runs across the battlefield!"));
        break;
      case "Grassy":
        await this.pbDisplay(_INTL("Grass grew to cover the battlefield!"));
        break;
      case "Misty":
        await this.pbDisplay(_INTL("Mist swirled about the battlefield!"));
        break;
      case "Psychic":
        await this.pbDisplay(_INTL("The battlefield got weird!"));
        break;
    }
    // Check for abilities/items that trigger upon the terrain changing
    for (const b of this.allBattlers()) await b.pbAbilityOnTerrainChange();
    for (const b of this.allBattlers()) await b.pbItemTerrainStatBoostCheck();
  }

  //=============================================================================
  // Messages and animations
  //=============================================================================
  async pbDisplay(msg: string, onShown?: () => void): Promise<void> {
    await this.scene.pbDisplayMessage(msg, false, onShown);
  }

  async pbDisplayBrief(msg: string): Promise<void> {
    await this.scene.pbDisplayMessage(msg, true);
  }

  async pbDisplayPaused(msg: string, onShown?: () => void): Promise<void> {
    await this.scene.pbDisplayPausedMessage(msg, onShown);
  }

  async pbDisplayConfirm(msg: string): Promise<boolean> {
    return this.scene.pbDisplayConfirmMessage(msg);
  }

  /**
   * defaultValue of -1 means "can't cancel". If it's 0 or greater, returns that
   * value when pressing the "Back" button.
   */
  async pbShowCommands(msg: string, commands: string[], defaultValue = -1): Promise<number> {
    return this.scene.pbShowCommands(msg, commands, defaultValue);
  }

  async pbAnimation(move: Id, user: Battler | null, targets: Battler | Battler[] | null, hitNum = 0): Promise<void> {
    if (this.showAnims) await this.scene.pbAnimation(move, user, targets, hitNum);
  }

  async pbCommonAnimation(name: string, user: Battler | null = null, targets: Battler | Battler[] | null = null): Promise<void> {
    if (this.showAnims) await this.scene.pbCommonAnimation(name, user, targets);
  }

  async pbShowAbilitySplash(battler: Battler, delay = false, logTrigger = true): Promise<void> {
    if (logTrigger) PBDebug.log(`[Ability triggered] ${battler.pbThis()}'s ${battler.abilityName()}`);
    if (!Scene.USE_ABILITY_SPLASH) return;
    await this.scene.pbShowAbilitySplash(battler);
    if (delay) {
      await this.scene.pbWaitSeconds(1); // 1 second
    }
  }

  async pbHideAbilitySplash(battler: Battler): Promise<void> {
    if (!Scene.USE_ABILITY_SPLASH) return;
    await this.scene.pbHideAbilitySplash(battler);
  }

  async pbReplaceAbilitySplash(battler: Battler): Promise<void> {
    if (!Scene.USE_ABILITY_SPLASH) return;
    await this.scene.pbReplaceAbilitySplash(battler);
  }
}
