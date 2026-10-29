// The held item handlers (Battle_ItemEffects.ts + the plugins' item handlers)
// against the game's own Ruby battle code: heldItemsReference.json is written
// by web/tools/ruby-ref/held_items_reference.rb, which runs Essentials v20.1 +
// this game's plugins headless on scripted battles. Each scenario in the JSON
// is plain data (Pokémon, setup, the moves used each round), replayed here
// exactly as in that script, with the same "random" numbers: after the
// switch-in phase and after each round, every message shown and each battler's
// HP, stat stages, status, held item and Speed must match Ruby's.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables, type MapLike } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import type { PartyScreenCallback } from "../BattleSceneInterface";
import { Battle, type Battler, DebugSceneNoLogging, PBEffects } from "../index";
import "./index";
import { RubyNameError } from "./Battle_ItemEffects";
import ref from "./heldItemsReference.json";

const INERT_ABILITY = "HONEYGATHER";

/** battle_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x. */
class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

type MonSpec = { species: string; level?: number; item?: string | null; moves?: string[]; nature?: string; iv?: number; ev?: number };
type SetupOp = (string | number)[];
type BattlerState = {
  index: number; species: string; hp: number; totalhp: number; status: string; item: string | null;
  stages: Record<string, number>; speed: number;
};
type Round = { messages: string[]; battlers: BattlerState[]; decision: number; error?: string };
type Scenario = {
  name: string; p1: MonSpec[]; p2: MonSpec[]; double?: boolean; setup?: SetupOp[];
  turns: number[][][]; randomStart: number; rounds: Round[];
};

let player: Player;

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = new Array<boolean>(8).fill(true); // so that no Pokémon disobeys
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
});

function makePokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.species, spec.level ?? 50, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = spec.iv ?? 31;
    pkmn.ev[s.id] = spec.ev ?? 0;
  }
  pkmn.nature = spec.nature ?? "HARDY";
  pkmn.ability = INERT_ABILITY;
  pkmn.item = spec.item ?? null;
  pkmn.moves = [];
  for (const m of spec.moves ?? ["TACKLE"]) pkmn.learnMove(m);
  pkmn.calcStats();
  return pkmn;
}

function battlerState(b: Battler): BattlerState {
  const stages: Record<string, number> = {};
  for (const s of GameData.Stat.eachBattle()) stages[s.id] = b.stages[s.id]!;
  return {
    index: b.index, species: b.species, hp: b.hp, totalhp: b.totalhp, status: b.status,
    item: b.itemId, stages, speed: b.pbSpeed(),
  };
}

function applySetup(battle: Battle, op: SetupOp): void {
  const b = typeof op[1] === "number" ? battle.battlers[op[1]]! : null;
  switch (op[0]) {
    case "hp": b!.hp = op[2] as number; break;
    case "hpFraction": b!.hp = Math.max(Math.floor(b!.totalhp * (op[2] as number) / (op[3] as number)), 1); break;
    case "status": b!.status = op[2] as string; break;
    case "stage": b!.stages[op[2] as string] = op[3] as number; break;
    case "effect": b!.effects[(PBEffects as unknown as Record<string, number>)[op[2] as string]!] = op[3]; break;
    case "pp":
      b!.moves[op[2] as number]!.pp = op[3] as number;
      b!.pokemon!.moves[op[2] as number]!.pp = op[3] as number;
      break;
    case "terrain": battle.field.terrain = op[1] as string; break;
  }
}

/** held_items_reference.rb's run_scenario. */
async function runScenario(sc: Scenario): Promise<Round[]> {
  const random = new SeqRandom(sc.randomStart);
  const log: string[] = [];
  const scene = new DebugSceneNoLogging();
  scene.pbDisplayMessage = async (msg: string) => { log.push(msg); };
  scene.pbDisplayPausedMessage = async (msg: string) => { log.push(msg); };
  scene.pbDisplayConfirmMessage = async (msg: string) => { log.push(msg); return true; };
  const p1 = sc.p1.map(makePokemon);
  const p2 = sc.p2.map(makePokemon);
  const battle = new Battle(scene, p1, p2, player, null);
  // DebugSceneNoLogging#pbPartyScreen with the SeqRandom instead of Kernel#rand
  // (as held_items_reference.rb does)
  scene.pbPartyScreen = async (idxBattler: number, _canCancel = false, _mode = 0,
    callback?: PartyScreenCallback): Promise<void> => {
    const replacements: number[] = [];
    battle.eachInTeamFromBattlerIndex(idxBattler, (_b, idxParty) => {
      if (!battle.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    if (replacements.length === 0) return;
    for (let i = 0; i < 50; i++) {
      if (await callback?.(replacements[random.next(replacements.length)]!, scene)) break;
    }
  };
  if (sc.double) battle.setBattleMode("double");
  battle.internalBattle = true;
  battle.expGain = false;
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  for (const op of sc.setup ?? []) applySetup(battle, op);
  const rounds: Round[] = [];
  const snapshot = (error?: string): void => {
    const r: Round = {
      messages: [...log], battlers: battle.battlers.filter((b): b is Battler => !!b).map(battlerState),
      decision: battle.decision,
    };
    if (error) r.error = error;
    rounds.push(r);
    log.length = 0;
  };
  try {
    await battle.pbOnAllBattlersEnteringBattle();
    snapshot();
    for (const turn of sc.turns) {
      if (battle.decision > 0) break;
      for (const [i, [idxMove, idxTargetIn]] of turn.entries()) {
        const b = battle.battlers[i];
        if (!b || b.fainted()) continue;
        if (!battle.pbCanShowCommands(i)) continue;
        battle.pbClearChoice(i);
        if (!(await battle.pbRegisterMove(i, idxMove!, false))) continue;
        const move = battle.choices[i]![2] as { pbTarget(b: Battler): { numTargets: number } };
        if (move.pbTarget(b).numTargets === 1) {
          const idxTarget = idxTargetIn ?? battle.battlers.findIndex((ob) => !!ob && b.opposes(ob.index));
          battle.pbRegisterTarget(i, idxTarget);
        }
      }
      await battle.pbAttackPhase();
      if (battle.decision === 0) await battle.pbEndOfRoundPhase();
      battle.turnCount += 1;
      snapshot();
    }
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    snapshot(e.name);
    if (!(e instanceof RubyNameError)) throw e;
  }
  return rounds;
}

/** Ruby bug scenarios where Ruby's PBDebug.logonerr swallows the NameError (see below). */
const SWALLOWED_NAME_ERROR = ["Jaboca Berry (Ruby bug: NameError)", "Rowap Berry (Ruby bug: NameError)"];

describe("held items vs Ruby", () => {
  for (const sc of ref.scenarios as Scenario[]) {
    it(sc.name, async () => {
      const rounds = await runScenario(sc);
      if (SWALLOWED_NAME_ERROR.includes(sc.name)) {
        // Jaboca/Rowap Berry raise NameError (009_Battle_ItemEffects.rb:1321,
        // 1391). Ruby's PBDebug.logonerr around Battler#pbUseMove swallows it
        // and the battle goes on (the attacker, never marked as having moved,
        // even attacks again); the TS port's Battler#pbProcessTurn rethrows.
        // So only check that the handler raises NameError at the same point.
        expect(rounds.length).toBe(2);
        expect(rounds[0]).toEqual(sc.rounds[0]);
        expect(rounds[1]!.error).toBe("NameError");
        expect(sc.rounds[1]!.error).toMatch(/^NameError/);
        const msgs = rounds[1]!.messages;
        expect(msgs).toEqual(sc.rounds[1]!.messages.slice(0, msgs.length));
        expect(msgs[msgs.length - 1]).toMatch(/ used /);
        return;
      }
      expect(rounds.length, sc.name).toBe(sc.rounds.length);
      for (let i = 0; i < rounds.length; i++) {
        expect(rounds[i], `${sc.name}, round ${i}`).toEqual(sc.rounds[i]);
      }
    });
  }

  it("gains Exp. and EVs with Lucky Egg, Macho Brace and the Power items like Ruby", async () => {
    for (const c of ref.exp) {
      const gainer = makePokemon({ species: c.gainer, level: c.gainerLevel, item: c.item });
      gainer.exp = gainer.growthRate().minimumExpForLevel(c.gainerLevel);
      const defeated = makePokemon({ species: c.defeated, level: c.defeatedLevel });
      const scene = new DebugSceneNoLogging();
      const battle = new Battle(scene, [gainer], [defeated], player, null);
      battle.internalBattle = true;
      await scene.pbStartBattle(battle);
      battle.pbSetUpSides();
      battle.battlers[1]!.participants = [0];
      const before = gainer.exp;
      G.gameMap = { mapId: 0, events: new Map() } as MapLike; // level-up happiness reads $game_map.map_id
      await battle.pbGainExpOne(0, battle.battlers[1]!, 1, [], false, false);
      battle.pbGainEVsOne(0, battle.battlers[1]!);
      G.gameMap = null;
      const label = `${c.gainer} Lv.${c.gainerLevel} (${c.item}) beats ${c.defeated} Lv.${c.defeatedLevel}`;
      expect(gainer.exp - before, label).toBe(c.expGained);
      expect(gainer.ev, label).toEqual(c.evs);
    }
  });
});
