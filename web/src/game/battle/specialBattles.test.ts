// Trainer battles and the special battle types against the game's own Ruby
// (specialBattlesReference.json, written by
// web/tools/ruby-ref/special_battles_reference.rb on Essentials v20.1 + this
// game's plugins). Random numbers replay the harness's counter sequence.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** special_battles_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x. */
class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}
let seq = new SeqRandom();
vi.mock("../../core/random", () => ({
  rand: (n: number) => seq.next(n),
  random: () => 0,
  seedRandom: () => {},
}));

const { GameData } = await import("../../data/gameData");
const { loadGameDataForTests } = await import("../../data/gameData/testing");
const { Battle, DebugSceneNoLogging } = await import("../../battle");
const { G, GameSwitches, GameVariables, PokemonGlobalMetadata, PokemonSystem } = await import("../globals");
const { PokemonBag } = await import("../items/PokemonBag");
const { Pokemon } = await import("../pokemon/Pokemon");
const { PokemonStorage } = await import("../pokemon/PokemonStorage");
const { GameStats } = await import("../trainer/GameStats");
const { Player } = await import("../trainer/Player");
const { TrainerBattle } = await import("./BattleStarting");
const { SafariBattle } = await import("./safari");
const { BugContestState, pbBugContestScore } = await import("./bugContest");
const { pbResetAllRoamers, pbRoamPokemon, roamPokemonCaught } = await import("./roaming");
const { pbPokeRadarChooseGrasses } = await import("./pokeRadar");
const ref = (await import("./specialBattlesReference.json")).default;

type PlayerT = InstanceType<typeof Player>;
type PokemonT = InstanceType<typeof Pokemon>;
let player: PlayerT;

beforeAll(() => {
  loadGameDataForTests();
});

beforeEach(() => {
  seq = new SeqRandom();
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameVariables = new GameVariables();
  G.gameSwitches = new GameSwitches();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.pokemonSystem = new PokemonSystem();
  G.pokemonSystem.givenicknames = 1;
  G.gameMap = null;
  // (the harness stubs pbSEPlay)
  G.gameSystem = { sePlay: () => {}, getPlayingBGM: () => null } as never;
});

const summarize = (pk: PokemonT) => ({ species: pk.species, level: pk.level, item: pk.itemId ?? null, hp: pk.hp, totalhp: pk.totalhp });

describe("trainer battles vs Ruby", () => {
  it("builds the foes, prize money and money lost like Ruby", async () => {
    const party = () => [new Pokemon("CYNDAQUIL", 14, player as never), new Pokemon("PIDGEY", 9, player as never)];
    for (const t of ref.trainers) {
      const [type, name, version] = t.id as [string, string, number];
      const [trainers, items, foeParty, starts] = TrainerBattle.generateFoes([type, name, version]);
      const tr = trainers[0]!;
      const what = `${type} ${name} ${version}`;
      expect([tr.name, tr.trainerType, tr.baseMoney(), tr.skillLevel(), items, starts, tr.loseText], what)
        .toEqual([t.name, t.type, t.baseMoney, t.skill, t.items, t.starts, t.loseText]);
      expect(foeParty.map(summarize), what).toEqual(t.party);
      player.party = party();
      const gain: number[] = [];
      for (const money of [0, 3, 2000, 999_999]) {
        player.money = money;
        const battle = new Battle(new DebugSceneNoLogging(), player.party, tr.party, player, [tr]);
        battle.internalBattle = true;
        await battle.pbGainMoney();
        gain.push(player.money);
      }
      expect(gain, `prize money: ${what}`).toEqual(t.gain);
      const lose: number[] = [];
      for (let badges = 0; badges <= 9; badges++) {
        player.badges = new Array<boolean>(badges).fill(true);
        for (const money of [0, 100, 5000]) {
          player.money = money;
          const battle = new Battle(new DebugSceneNoLogging(), player.party, tr.party, player, [tr]);
          battle.internalBattle = true;
          await battle.pbLoseMoney();
          lose.push(player.money);
        }
      }
      expect(lose, `money lost: ${what}`).toEqual(t.lose);
    }
  });

  it("puts two trainers on one side like pbDoubleTrainerBattle", async () => {
    const [trainers, items, foeParty, starts] = TrainerBattle.generateFoes(["YOUNGSTER", "Joey", 0, "BUGCATCHER", "Don", 0]);
    const d = ref.doubleFoes;
    expect([trainers.map((t) => t.name), items, starts]).toEqual([d.names, d.items, d.starts]);
    expect(foeParty.map(summarize)).toEqual(d.party);
    player.money = 3000;
    player.party = [new Pokemon("CYNDAQUIL", 14, player as never), new Pokemon("PIDGEY", 9, player as never)];
    const battle = new Battle(new DebugSceneNoLogging(), player.party, foeParty, player, trainers);
    battle.internalBattle = true;
    battle.party2starts = starts;
    await battle.pbGainMoney();
    expect(player.money).toBe(d.gain);
  });
});

describe("Safari Zone vs Ruby", () => {
  it("has the same escape rates", () => {
    const b = Object.create(SafariBattle.prototype) as InstanceType<typeof SafariBattle>;
    expect([3, 45, 46, 60, 61, 120, 121, 250, 251, 255].map((c) => b.pbEscapeRate(c))).toEqual(ref.safariEscapeRate);
  });

  it("plays Safari battles (Ball/Bait/Rock/Run) like Ruby", async () => {
    for (const c of ref.safari) {
      player.party = [new Pokemon("CYNDAQUIL", 14, player as never)];
      const pkmn = new Pokemon(c.species, c.level);
      seq = new SeqRandom(c.start);
      const log: string[] = [];
      const commands = [...c.commands];
      const handlers: Record<string, (...a: never[]) => unknown> = {
        pbSafariCommandMenu: () => { const cmd = commands.shift(); log.push(`cmd ${cmd}`); return cmd ?? 3; },
        pbDisplayMessage: (msg: string) => { log.push(msg); },
        pbDisplayPausedMessage: (msg: string) => { log.push(msg); },
        pbDisplayConfirmMessage: (msg: string) => { log.push(`?${msg}`); return false; },
        pbThrow: (ball: string, shakes: number, critical: boolean, target: number, showPlayer: boolean) => {
          log.push(`throw ${ball} ${shakes} ${critical} ${target} ${showPlayer}`);
        },
        pbThrowSuccess: () => { log.push("success"); },
        pbEndBattle: (d: number) => { log.push(`end ${d}`); },
      };
      // Ruby's stand-in answers nil to everything else (method_missing).
      const scene = new Proxy(handlers, { get: (h, k: string) => h[k] ?? (() => undefined) });
      const battle = new SafariBattle(scene, player, [pkmn]);
      battle.ballCount = c.species === "KANGASKHAN" ? 2 : 6;
      battle.pbRandom = (x: number) => seq.next(x);
      const decision = await battle.pbStartBattle();
      expect({ decision, balls: battle.ballCount, log, partySize: player.party.length }, c.species)
        .toEqual({ decision: c.decision, balls: c.balls, log: c.log, partySize: c.partySize });
    }
  });
});

describe("Bug-Catching Contest vs Ruby", () => {
  it("scores catches like pbBugContestScore", () => {
    for (const c of ref.bugContestScores) {
      const pkmn = new Pokemon(c.species, c.level);
      for (const [k, v] of Object.entries(c.iv)) pkmn.iv[k] = v;
      pkmn.calcStats();
      pkmn.hp = c.hp;
      expect(pbBugContestScore(pkmn), c.species).toBe(c.score);
    }
  });

  it("draws contestants and keeps the other Pokémon like BugContestState#pbStart", () => {
    for (const c of ref.bugContestDraws) {
      player.party = [new Pokemon("CYNDAQUIL", 14, player as never), new Pokemon("PIDGEY", 9, player as never)];
      seq = new SeqRandom(c.start);
      const st = new BugContestState();
      st.pbSetPokemon(1);
      st.pbStart(20);
      const s = st as unknown as { contestants: number[]; otherparty: PokemonT[] };
      expect([s.contestants, player.party.map((p) => p.species), s.otherparty.map((p) => p.species)])
        .toEqual([c.contestants, c.party, c.other]);
    }
  });

  it("finds the player's place like BugContestState#place", () => {
    const placings = [[[-1, "SCYTHER", 300], [2, "PINSIR", 290], [4, "VENONAT", 200]],
      [[3, "SCYTHER", 300], [-1, "PINSIR", 290], [4, "VENONAT", 200]],
      [[3, "SCYTHER", 300], [1, "PINSIR", 290], [4, "VENONAT", 200]]];
    expect(placings.map((places) => {
      const st = new BugContestState();
      (st as unknown as { places: unknown }).places = places;
      return st.place();
    })).toEqual(ref.bugContestPlaces);
  });
});

describe("roaming Pokémon vs Ruby", () => {
  it("roam between maps like pbRoamPokemon", () => {
    for (const c of ref.roaming) {
      seq = new SeqRandom(c.switch752 ? (c.switch999 ? 300 : 200) : 100);
      G.gameSwitches.set(752, c.switch752);
      G.gameSwitches.set(999, c.switch999);
      G.pokemonGlobal.roamPosition = null;
      G.pokemonGlobal.roamPokemon = null;
      const steps: [number, number][][] = [];
      for (let i = 0; i < 40; i++) {
        pbRoamPokemon();
        steps.push(Object.entries(G.pokemonGlobal.roamPosition!).map(([k, v]) => [Number(k), v]));
      }
      expect(steps, `switches 752=${c.switch752} 999=${c.switch999}`).toEqual(c.steps);
    }
  });

  it("never resets a defeated roamer (roamPokemonCaught isn't stored, as in Ruby)", () => {
    G.pokemonGlobal.roamPokemon = [true, true, null, null, true];
    roamPokemonCaught()[0] = false;
    roamPokemonCaught()[1] = true;
    pbResetAllRoamers();
    expect(G.pokemonGlobal.roamPokemon.map((v) => v === true)).toEqual(ref.roamReset);
  });
});

describe("Poké Radar vs Ruby", () => {
  it("picks the same shaking grass", () => {
    for (const c of ref.pokeRadar) {
      seq = new SeqRandom(c.start);
      const holes = c.holes as number[][];
      G.gameMap = {
        width: 24, height: 18,
        terrainTag: (x: number, y: number) => {
          const grass = !holes.some((h) => h[0] === x && h[1] === y);
          return { landWildEncounters: grass, showsGrassRustle: grass };
        },
      } as never;
      G.gamePlayer = { x: c.player[0], y: c.player[1] } as never;
      G.gameTemp.pokeRadarData = [0, 0, c.chain, [], false];
      expect(pbPokeRadarChooseGrasses(), `player at ${c.player}`).toEqual(c.grasses);
    }
  });
});
