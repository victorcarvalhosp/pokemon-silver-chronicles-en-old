// Port of 011_Battle/007_Other battle types/005_RecordedBattle.rb: battles that
// record every command, switch and random number (RecordedBattleModule) and
// battles that play such a record back (RecordedBattlePlaybackModule), for
// regular, Battle Palace and Battle Arena battles. Ruby's Marshal.dump of the
// parties/record is JSON here (Pokémon through toJSON/fromJSON).
//
// Also the battle-type half of 018_Alternate battle modes/001_Battle Frontier/
// 004_Challenge_Battles.rb that creates and replays these battles: BattleType,
// BattleTower/BattlePalace/BattleArena, pbOrganizedBattleEx, pbRecordLastBattle,
// pbPlayLastBattle and pbPlayBattle (the Battle Tower events call the first
// two; the rest of the Battle Frontier isn't ported).

import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { Battle, type BattleTrainer } from "../../battle/battle/Battle";
import type { IBattleScene } from "../../battle/BattleSceneInterface";
import { Input } from "../../rgss/Input";
import { G } from "../globals";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import { defineScript } from "../scriptApi";
import { Player } from "../trainer/Player";
import { NPCTrainer } from "../trainer/Trainer";
import { pbGetTrainerBattleBGM } from "./battleAudio";
import { BattleArenaBattle } from "./battleArena";
import { pbBattleAnimation, pbSceneStandby } from "./BattleIntroAnim";
import { BattlePalaceBattle } from "./battlePalace";
import { BattleCreationHelperMethods, type BattleLike } from "./BattleStarting";
import { PokemonGlobalExtras } from "./globalExtras";

declare module "../globals" {
  interface GameTemp {
    lastBattleRecord?: string | null;
  }
  interface PokemonGlobalMetadata {
    lastbattle?: string | null;
  }
}

/** Player: [type, name, id, badges]; NPCTrainer: [type, name, id, lose text, win text] */
type TrainerInfo = [Id, string, number, boolean[]] | [Id, string, number, string, string];
/** [battle type, properties, rounds, random numbers, switches] */
export type BattleRecord = [number, Record<string, unknown>, unknown[][][], number[], number[]];

const Commands = { FIGHT: 0, BAG: 1, POKEMON: 2, RUN: 3 } as const;

// Marshal.dump / Marshal.restore of parties, starts, items and rules
const dumpParty = (party: (Pokemon | null)[]) => JSON.stringify(party.map((p) => (p ? p.toJSON() : null)));
const restoreParty = (s: unknown) => (JSON.parse(s as string) as (PokemonJSON | null)[]).map((p) => (p ? Pokemon.fromJSON(p) : null));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BattleClass = new (...args: any[]) => Battle;

//===============================================================================
//
//===============================================================================
export function RecordedBattleModule<B extends BattleClass>(Base: B) {
  return class extends Base {
    randomnumbers: number[] = [];
    rounds: unknown[][][] = [];
    switches: number[] = [];
    roundindex = -1;
    properties: Record<string, unknown> = {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      super(...args);
      // The AI's rolls are Kernel#rand in Ruby, which this module doesn't
      // record (only Battle#pbRandom); the port's AI otherwise goes through
      // battle.pbRandom, and playback (which never asks the AI) would then
      // read its rolls as the battle's.
      this.battleAI.pbAIRandom = (x: number) => rand(x);
    }

    get randomnums(): number[] { return this.randomnumbers; }

    pbGetBattleType(): number {
      return 0; // Battle Tower
    }

    pbGetTrainerInfo(trainer: BattleTrainer[] | null): TrainerInfo[] | null {
      if (!trainer) return null;
      // NOTE (Ruby parity): the branch for a single trainer (not an array)
      // reads an undefined local `i` (NameError, 005_RecordedBattle.rb:40);
      // @player and @opponent are always arrays, so it never runs.
      const ret: TrainerInfo[] = [];
      for (const tr of trainer) {
        if (tr instanceof Player) {
          ret.push([tr.trainerType, tr.name, tr.id, [...tr.badges]]);
        } else { // NPCTrainer
          const npc = tr as NPCTrainer;
          ret.push([npc.trainerType, npc.name, npc.id, npc.loseText || "...", npc.winText || "..."]);
        }
      }
      return ret;
    }

    override async pbStartBattle(): Promise<number> {
      const p: Record<string, unknown> = {};
      this.properties = p;
      p.internalBattle = this.internalBattle;
      p.player = this.pbGetTrainerInfo(this.player);
      p.opponent = this.pbGetTrainerInfo(this.opponent);
      p.party1 = dumpParty(this.party1);
      p.party2 = dumpParty(this.party2);
      p.party1starts = JSON.stringify(this.party1starts);
      p.party2starts = JSON.stringify(this.party2starts);
      p.weather = this.field.weather;
      p.weatherDuration = this.field.weatherDuration;
      p.canRun = this.canRun;
      p.switchStyle = this.switchStyle;
      p.showAnims = this.showAnims;
      p.items = JSON.stringify(this.items);
      p.backdrop = this.backdrop;
      p.backdropBase = this.backdropBase;
      p.time = this.time;
      p.environment = this.environment;
      p.rules = JSON.stringify(this.rules);
      return super.pbStartBattle();
    }

    /** Marshal.dump([battle type, properties, rounds, random numbers, switches]) */
    pbDumpRecord(): string {
      return JSON.stringify([this.pbGetBattleType(), this.properties, this.rounds, this.randomnumbers, this.switches]);
    }

    override async pbSwitchInBetween(idxBattler: number, checkLaxOnly = false, canCancel = false): Promise<number> {
      const ret = await super.pbSwitchInBetween(idxBattler, checkLaxOnly, canCancel);
      this.switches.push(ret);
      return ret;
    }

    override async pbRegisterMove(idxBattler: number, idxMove: number, showMessages = true): Promise<boolean> {
      if (await super.pbRegisterMove(idxBattler, idxMove, showMessages)) {
        this.rounds[this.roundindex]![idxBattler] = [Commands.FIGHT, idxMove];
        return true;
      }
      return false;
    }

    override pbRegisterTarget(idxBattler: number, idxTarget: number): void {
      super.pbRegisterTarget(idxBattler, idxTarget);
      this.rounds[this.roundindex]![idxBattler]![2] = idxTarget;
    }

    override async pbRun(idxBattler: number, duringBattle = false): Promise<number> {
      const ret = await super.pbRun(idxBattler, duringBattle);
      this.rounds[this.roundindex]![idxBattler] = [Commands.RUN, this.decision];
      return ret;
    }

    override async pbAutoChooseMove(idxBattler: number, showMessages = true): Promise<boolean> {
      const ret = await super.pbAutoChooseMove(idxBattler, showMessages);
      this.rounds[this.roundindex]![idxBattler] = [Commands.FIGHT, -1];
      return ret;
    }

    override pbRegisterSwitch(idxBattler: number, idxParty: number): boolean {
      if (super.pbRegisterSwitch(idxBattler, idxParty)) {
        this.rounds[this.roundindex]![idxBattler] = [Commands.POKEMON, idxParty];
        return true;
      }
      return false;
    }

    override pbRegisterItem(idxBattler: number, item: Id, idxTarget: number | null = null, idxMove: number | null = null): boolean {
      if (super.pbRegisterItem(idxBattler, item, idxTarget, idxMove)) {
        this.rounds[this.roundindex]![idxBattler] = [Commands.BAG, item, idxTarget, idxMove];
        return true;
      }
      return false;
    }

    override async pbCommandPhase(): Promise<void> {
      this.roundindex += 1;
      this.rounds[this.roundindex] = [[], [], [], []];
      await super.pbCommandPhase();
    }

    override async pbStorePokemon(_pkmn: Pokemon): Promise<void> {}

    override pbRandom(num: number): number {
      const ret = super.pbRandom(num);
      this.randomnumbers.push(ret);
      return ret;
    }
  };
}

//===============================================================================
//
//===============================================================================
export function RecordedBattlePlaybackModule<B extends BattleClass>(Base: B) {
  return class extends Base {
    battletype: number;
    properties: Record<string, unknown>;
    rounds: unknown[][][];
    randomnums: number[];
    switches: number[];
    roundindex: number;
    randomindex: number;
    switchindex: number;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...args: any[]) {
      const [scene, battle] = args as [IBattleScene, BattleRecord];
      const properties = battle[1];
      super(scene,
        restoreParty(properties.party1),
        restoreParty(properties.party2),
        PlaybackHelper.pbCreateTrainerInfo(properties.player as TrainerInfo[] | null),
        PlaybackHelper.pbCreateTrainerInfo(properties.opponent as TrainerInfo[] | null));
      this.battletype = battle[0];
      this.properties = properties;
      this.rounds = battle[2];
      this.randomnums = battle[3];
      this.switches = battle[4];
      this.roundindex = -1;
      this.randomindex = 0;
      this.switchindex = 0;
    }

    override async pbStartBattle(): Promise<number> {
      const p = this.properties;
      this.party1starts = JSON.parse(p.party1starts as string);
      this.party2starts = JSON.parse(p.party2starts as string);
      this.internalBattle = p.internalBattle as boolean;
      this.field.weather = p.weather as Id;
      this.field.weatherDuration = p.weatherDuration as number;
      this.canRun = p.canRun as boolean;
      this.switchStyle = p.switchStyle as boolean;
      this.showAnims = p.showAnims as boolean;
      this.backdrop = p.backdrop as string;
      this.backdropBase = p.backdropBase as string | null;
      this.time = p.time as number;
      this.environment = p.environment as Id;
      this.items = JSON.parse(p.items as string);
      this.rules = JSON.parse(p.rules as string);
      return super.pbStartBattle();
    }

    override async pbSwitchInBetween(_idxBattler: number, _checkLaxOnly = false, _canCancel = false): Promise<number> {
      const ret = this.switches[this.switchindex]!;
      this.switchindex += 1;
      return ret;
    }

    override pbRandom(_num: number): number {
      const ret = this.randomnums[this.randomindex]!;
      this.randomindex += 1;
      return ret;
    }

    override pbDisplayPaused(str: string): Promise<void> {
      return this.pbDisplay(str);
    }

    override async pbCommandPhaseLoop(isPlayer: boolean): Promise<void> {
      if (!isPlayer) return;
      this.roundindex += 1;
      for (let i = 0; i < 4; i++) {
        const round = this.rounds[this.roundindex]![i] as unknown[];
        if (round.length === 0) continue;
        this.pbClearChoice(i);
        switch (round[0]) {
          case Commands.FIGHT:
            if (round[1] === -1) await this.pbAutoChooseMove(i, false);
            else await this.pbRegisterMove(i, round[1] as number);
            if (round[2] != null) this.pbRegisterTarget(i, round[2] as number);
            break;
          case Commands.BAG:
            this.pbRegisterItem(i, round[1] as Id, round[2] as number | null, round[3] as number | null);
            break;
          case Commands.POKEMON:
            this.pbRegisterSwitch(i, round[1] as number);
            break;
          case Commands.RUN:
            this.decision = round[1] as number;
            break;
        }
      }
    }
  };
}

//===============================================================================
//
//===============================================================================
export class RecordedBattle extends RecordedBattleModule(Battle) {
  override pbGetBattleType(): number { return 0; }
}

export class RecordedBattlePalaceBattle extends RecordedBattleModule(BattlePalaceBattle) {
  override pbGetBattleType(): number { return 1; }
}

export class RecordedBattleArenaBattle extends RecordedBattleModule(BattleArenaBattle) {
  override pbGetBattleType(): number { return 2; }
}

// (The playback module's initialize(scene, battle) replaces Battle's argument list.)
type PlaybackArgs = ConstructorParameters<typeof Battle>;
const playbackArgs = (scene: unknown, battle: BattleRecord) => [scene, battle] as unknown as PlaybackArgs;
export class PlaybackBattle extends RecordedBattlePlaybackModule(Battle) {
  constructor(scene: unknown, battle: BattleRecord) { super(...playbackArgs(scene, battle)); }
}
export class BattlePalacePlaybackBattle extends RecordedBattlePlaybackModule(BattlePalaceBattle) {
  constructor(scene: unknown, battle: BattleRecord) { super(...playbackArgs(scene, battle)); }
}
export class BattleArenaPlaybackBattle extends RecordedBattlePlaybackModule(BattleArenaBattle) {
  constructor(scene: unknown, battle: BattleRecord) { super(...playbackArgs(scene, battle)); }
}

//===============================================================================
//
//===============================================================================
export const PlaybackHelper = {
  pbGetOpponent(battle: BattleRecord): BattleTrainer[] | null {
    return PlaybackHelper.pbCreateTrainerInfo(battle[1].opponent as TrainerInfo[] | null);
  },

  /**
   * NOTE (Ruby parity): calls self.pbGetTrainerBattleBGM, which the module
   * doesn't have (NoMethodError, 005_RecordedBattle.rb:264), so playing back a
   * recorded battle (pbPlayBattle) always raises.
   */
  pbGetBattleBGM(battle: BattleRecord): never {
    PlaybackHelper.pbGetOpponent(battle);
    throw new Error("undefined method `pbGetTrainerBattleBGM' for RecordedBattle::PlaybackHelper:Module");
  },

  pbCreateTrainerInfo(trainer: TrainerInfo[] | null): BattleTrainer[] | null {
    if (!trainer) return null;
    const ret: BattleTrainer[] = [];
    for (const tr of trainer) {
      let t: Player | NPCTrainer;
      if (tr.length === 4) { // Player
        t = new Player(tr[1], tr[0]);
        t.badges = tr[3];
      } else { // NPCTrainer
        t = new NPCTrainer(tr[1], tr[0]);
        t.loseText = tr[3] || "...";
        t.winText = tr[4] || "...";
      }
      t.id = tr[2];
      ret.push(t);
    }
    return ret;
  },
};

//===============================================================================
// 004_Challenge_Battles.rb: battle types and organized battles
//===============================================================================
type ChallengeTrainer = { party: Pokemon[] };
export class BattleType {
  pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new Battle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}
export class BattleTower extends BattleType {
  override pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new RecordedBattle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}
export class BattlePalace extends BattleType {
  override pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new RecordedBattlePalaceBattle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}
export class BattleArena extends BattleType {
  override pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new RecordedBattleArenaBattle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}

/**
 * The parts of PokemonChallengeRules pbOrganizedBattleEx uses: the battle type
 * and level adjustment (Battle Frontier level adjustments aren't ported; with
 * none, adjustLevels returns nil as in Ruby).
 */
export interface ChallengeData {
  battletype?: BattleType;
  levelAdjustment?: unknown;
}

/** pbOrganizedBattleEx(opponent, challengedata): returns whether the player won. */
export async function pbOrganizedBattleEx(opponent: NPCTrainer, challengedata: ChallengeData | null): Promise<boolean> {
  // (Skipping the battle with Ctrl is a $DEBUG feature.)
  const player = G.player as unknown as Player;
  player.healParty();
  // Remember original data, to be restored after battle
  challengedata ??= {};
  if (challengedata.levelAdjustment) throw new Error("Battle Frontier level adjustments aren't ported");
  const olditems = player.party.map((p) => p.itemId);
  const olditems2 = opponent.party.map((p) => p.itemId);
  // Create the battle scene (the visual side of it)
  const scene = BattleCreationHelperMethods.createBattleScene();
  // Create the battle class (the mechanics side of it)
  const battle = (challengedata.battletype ?? new BattleTower()).pbCreateBattle(scene, player, opponent) as
    Battle & { pbDumpRecord?(): string };
  battle.internalBattle = false;
  // Set various other properties in the battle class
  BattleCreationHelperMethods.prepareBattle(battle as unknown as BattleLike);
  // Perform the battle itself
  let decision = 0;
  await pbBattleAnimation(pbGetTrainerBattleBGM(opponent), 0, null, async () => { // (battletype 0, as in Ruby)
    await pbSceneStandby(async () => {
      decision = await battle.pbStartBattle();
    });
  });
  Input.update();
  // Heal both parties and restore their original items
  player.party.forEach((pkmn, i) => {
    pkmn.heal();
    pkmn.makeUnmega();
    pkmn.makeUnprimal();
    pkmn.item = olditems[i] ?? null;
  });
  opponent.party.forEach((pkmn, i) => {
    pkmn.heal();
    pkmn.makeUnmega();
    pkmn.makeUnprimal();
    pkmn.item = olditems2[i] ?? null;
  });
  // Save the record of the battle
  G.gameTemp.lastBattleRecord = null;
  if (decision === 1 || decision === 2 || decision === 5) { // if win, loss or draw
    G.gameTemp.lastBattleRecord = battle.pbDumpRecord ? battle.pbDumpRecord() : null;
  }
  switch (decision) {
    case 1: G.stats.trainerBattlesWon += 1; break; // Won
    case 2: case 3: case 5: G.stats.trainerBattlesLost += 1; break; // Lost, fled, draw
  }
  // Return true if the player won the battle, and false if any other result
  return decision === 1;
}

/** pbRecordLastBattle */
export function pbRecordLastBattle(): void {
  G.pokemonGlobal.lastbattle = G.gameTemp.lastBattleRecord ?? null;
  G.gameTemp.lastBattleRecord = null;
}

/** pbPlayLastBattle */
export async function pbPlayLastBattle(): Promise<void> {
  await pbPlayBattle(G.pokemonGlobal.lastbattle ?? null);
}

/** pbPlayBattle(battledata) */
export async function pbPlayBattle(battledata: string | null): Promise<void> {
  if (!battledata) return;
  const scene = BattleCreationHelperMethods.createBattleScene() as { abortable: boolean };
  scene.abortable = true;
  const lastbattle = JSON.parse(battledata) as BattleRecord;
  let battleplayer: Battle | null = null;
  switch (lastbattle[0]) {
    case 0: battleplayer = new PlaybackBattle(scene, lastbattle); break; // BattleChallenge::BattleTowerID
    case 1: battleplayer = new BattlePalacePlaybackBattle(scene, lastbattle); break; // BattlePalaceID
    case 2: battleplayer = new BattleArenaPlaybackBattle(scene, lastbattle); break; // BattleArenaID
  }
  const bgm = PlaybackHelper.pbGetBattleBGM(lastbattle); // raises, as in Ruby (see there)
  await pbBattleAnimation(bgm, 0, null, async () => {
    await pbSceneStandby(async () => {
      await battleplayer!.pbStartBattle();
    });
  });
}

PokemonGlobalExtras.register("lastbattle");

defineScript("pbRecordLastBattle", () => pbRecordLastBattle());
defineScript("pbPlayLastBattle", () => pbPlayLastBattle());
defineScript("pbPlayBattle", (_c, data) => pbPlayBattle(data as string | null));
defineScript("pbOrganizedBattleEx", (_c, opponent, data) => pbOrganizedBattleEx(opponent as NPCTrainer, data as ChallengeData | null));

