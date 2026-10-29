// Full headless wild battles through Battle::DebugSceneNoLogging: a win, a
// loss (whiteout) and a successful escape, with no unhandled errors.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedRandom } from "../core/random";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { Battle, DebugSceneNoLogging } from "./index";
import { PBDebug } from "./other/PBDebug";
import type { FightMenuCallback } from "./BattleSceneInterface";

/** A debug scene whose player always picks the same command (and move 0), recording every message. */
class ScriptedScene extends DebugSceneNoLogging {
  messages: string[] = [];
  constructor(private command: number, private moveIndex = 0) { super(); }
  override async pbCommandMenu(idxBattler: number, _firstAction: boolean): Promise<number> {
    // The wild Pokémon is AI-controlled; the command menu is only shown for the player.
    void idxBattler;
    return this.command;
  }
  override async pbFightMenu(_idxBattler: number, ...args: [...mechanics: boolean[], callback: FightMenuCallback]): Promise<void> {
    await (args[args.length - 1] as FightMenuCallback)(this.moveIndex);
  }
  override async pbDisplayMessage(msg: string): Promise<void> { this.messages.push(msg); }
  override async pbDisplayPausedMessage(msg: string): Promise<void> { this.messages.push(msg); }
}

let errors: string[] = [];

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  const player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  errors = [];
  PBDebug.sink = (msg) => { if (/error|exception/i.test(msg)) errors.push(msg); };
});

function makeBattle(scene: ScriptedScene, starter: Pokemon, wild: Pokemon): Battle {
  const player = G.player as unknown as Player;
  player.party = [starter];
  const battle = new Battle(scene, player.party, [wild], player, null);
  battle.internalBattle = true;
  return battle;
}

const mon = (species: string, level: number, moves: string[]): Pokemon => {
  const p = new Pokemon(species, level, G.player as never);
  p.moves = [];
  for (const m of moves) p.learnMove(m);
  return p;
};

describe("headless wild battle", () => {
  it("runs to a win and gains Exp.", async () => {
    seedRandom(1234);
    const starter = mon("CYNDAQUIL", 5, ["TACKLE", "LEER"]);
    const wild = mon("PIDGEY", 3, ["TACKLE", "GROWL"]);
    const scene = new ScriptedScene(0);
    const expBefore = starter.exp;
    const decision = await makeBattle(scene, starter, wild).pbStartBattle();
    expect(errors).toEqual([]);
    expect(decision).toBe(1);
    expect(wild.fainted()).toBe(true);
    expect(starter.exp).toBeGreaterThan(expBefore);
    expect(scene.messages).toContain("Oh! A wild Pidgey appeared!");
    expect(scene.messages.some((m) => /fainted!/.test(m))).toBe(true);
    expect(scene.messages.some((m) => /got \d+ Exp\. Points!/.test(m))).toBe(true);
  });

  it("runs to a loss (whiteout)", async () => {
    seedRandom(99);
    const starter = mon("CYNDAQUIL", 3, ["LEER"]);
    const wild = mon("RATTATA", 12, ["TACKLE"]);
    const scene = new ScriptedScene(0);
    const decision = await makeBattle(scene, starter, wild).pbStartBattle();
    expect(errors).toEqual([]);
    expect(decision).toBe(2);
    expect(starter.fainted()).toBe(true);
    expect(scene.messages).toContain("You have no more Pokémon that can fight!");
    expect(scene.messages).toContain("You blacked out!");
  });

  it("runs away successfully", async () => {
    seedRandom(5);
    const starter = mon("CYNDAQUIL", 10, ["TACKLE"]);
    const wild = mon("PIDGEY", 3, ["TACKLE"]);
    const scene = new ScriptedScene(3);
    const decision = await makeBattle(scene, starter, wild).pbStartBattle();
    expect(errors).toEqual([]);
    expect(decision).toBe(3);
    expect(scene.messages).toContain("You got away safely!");
  });
});
