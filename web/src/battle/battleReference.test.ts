// The battle core against values from the game's own Ruby battle code
// (rubyReference.json, written by web/tools/ruby-ref/battle_reference.rb,
// which runs Essentials v20.1 + this game's plugin patches headless). Each
// scenario here is set up exactly as in that script: same Pokémon (IVs, EVs,
// nature, ability Honey Gather, no item), same battle setup and the same
// "random" numbers.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables, type MapLike } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { NPCTrainer } from "../game/trainer/Trainer";
import { Battle, DebugSceneNoLogging, PBEffects } from "./index";
import ref from "./rubyReference.json";

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

let player: Player;

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
});

function makePokemon(species: string, level: number,
  { iv = 31, ev = 0, nature = "HARDY", moves = ["TACKLE"] }: { iv?: number; ev?: number; nature?: string; moves?: string[] } = {}): Pokemon {
  const pkmn = new Pokemon(species, level, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = iv;
    pkmn.ev[s.id] = ev;
  }
  pkmn.nature = nature;
  pkmn.ability = INERT_ABILITY;
  pkmn.item = null;
  pkmn.moves = [];
  for (const m of moves) pkmn.learnMove(m);
  pkmn.calcStats();
  return pkmn;
}

async function makeBattle(p1: Pokemon[], p2: Pokemon[], { double = false, random = null as SeqRandom | null } = {}): Promise<Battle> {
  const scene = new DebugSceneNoLogging();
  const battle = new Battle(scene, p1, p2, player, null);
  if (double) battle.setBattleMode("double");
  battle.internalBattle = true;
  if (random) {
    battle.pbRandom = (x: number) => random.next(x);
    battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  }
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  return battle;
}

describe("battle core vs Ruby", () => {
  it("calculates damage like Ruby", async () => {
    for (const c of ref.damage) {
      const att = makePokemon(c.attacker, c.attackerLevel, { moves: [c.move] });
      const dfn = makePokemon(c.defender, c.defenderLevel, { iv: 20, ev: 40, nature: "BOLD" });
      att.status = c.status;
      const battle = await makeBattle([att], [dfn]);
      battle.pbRandom = () => c.random;
      const user = battle.battlers[0]!;
      const target = battle.battlers[1]!;
      user.stages.ATTACK = c.atkStage;
      user.stages.SPECIAL_ATTACK = c.atkStage;
      target.stages.DEFENSE = c.defStage;
      target.stages.SPECIAL_DEFENSE = c.defStage;
      const m = user.moves[0]!;
      target.damageState.reset();
      target.damageState.critical = c.critical;
      m.calcType = m.pbCalcType(user);
      target.damageState.typeMod = m.pbCalcTypeMod(m.calcType, user, target);
      await m.pbCalcDamage(user, target);
      const label = `${c.attacker} ${c.move} -> ${c.defender} crit=${c.critical} rnd=${c.random}`;
      expect(target.damageState.typeMod, label).toBe(c.typeMod);
      expect(target.damageState.calcDamage, label).toBe(c.damage);
    }
  });

  it("applies Speed stages and paralysis like Ruby", async () => {
    for (const c of ref.speed) {
      const p1 = makePokemon("JOLTEON", 47);
      p1.status = c.status;
      const battle = await makeBattle([p1], [makePokemon("RATTATA", 5)]);
      const b = battle.battlers[0]!;
      b.stages.SPEED = c.stage;
      expect([b.speed, b.pbSpeed()], `stage ${c.stage} ${c.status}`).toEqual([c.speed, c.pbSpeed]);
    }
  });

  it("clamps stat stage changes like Ruby", async () => {
    for (const c of ref.stageChanges) {
      const battle = await makeBattle([makePokemon("MEW", 50)], [makePokemon("RATTATA", 5)]);
      const b = battle.battlers[0]!;
      b.stages.ATTACK = c.start;
      const changed = c.dir === "raise" ? b.pbRaiseStatStageBasic("ATTACK", c.increment) : b.pbLowerStatStageBasic("ATTACK", c.increment);
      expect([changed, b.stages.ATTACK], JSON.stringify(c)).toEqual([c.changed, c.result]);
    }
  });

  it("checks accuracy like Ruby", async () => {
    for (const c of ref.accuracy) {
      let hits = 0;
      for (let v = 0; v < 100; v++) {
        const battle = await makeBattle([makePokemon("MEW", 50, { moves: [c.move] })], [makePokemon("SNORLAX", 50)]);
        battle.pbRandom = () => v;
        const user = battle.battlers[0]!;
        const target = battle.battlers[1]!;
        user.stages.ACCURACY = c.accStage;
        target.stages.EVASION = c.evaStage;
        const m = user.moves[0]!;
        m.calcType = m.pbCalcType(user);
        if (m.pbAccuracyCheck(user, target)) hits += 1;
      }
      expect(hits, `${c.move} acc ${c.accStage} eva ${c.evaStage}`).toBe(c.hits);
    }
  });

  it("decides critical hits like Ruby", async () => {
    for (const c of ref.critical) {
      const battle = await makeBattle([makePokemon("MEW", 50, { moves: [c.move] })], [makePokemon("SNORLAX", 50)]);
      battle.pbRandom = () => c.random;
      const user = battle.battlers[0]!;
      user.effects[PBEffects.FocusEnergy] = c.focusEnergy;
      expect(user.moves[0]!.pbIsCritical(user, battle.battlers[1]!), JSON.stringify(c)).toBe(c.critical);
    }
  });

  it("orders battlers by priority and Speed like Ruby", async () => {
    for (const [ci, c] of ref.priority.entries()) {
      const mons = (c.cases as [string, number, string][]).map(([sp, lv, mv]) => makePokemon(sp, lv, { moves: [mv] }));
      const battle = await makeBattle([mons[0]!, mons[2]!], [mons[1]!, mons[3]!], { double: true, random: new SeqRandom(ci * 100) });
      for (let i = 0; i < 4; i++) {
        await battle.pbRegisterMove(i, 0, false);
        const move = battle.choices[i]![2] as { pbTarget(b: unknown): { numTargets: number } };
        if (move.pbTarget(battle.battlers[i]).numTargets === 1) battle.pbRegisterTarget(i, (i + 1) % 4);
      }
      battle.pbCalculatePriority(true);
      expect(battle.pbPriority().map((b) => b.index), JSON.stringify(c.cases)).toEqual(c.order);
      expect(battle.battlers.map((b) => b!.pbSpeed())).toEqual(c.speeds);
    }
  });

  it("gains Exp. and EVs like Ruby", async () => {
    for (const c of ref.exp) {
      const gainer = makePokemon(c.gainer, c.gainerLevel);
      gainer.exp = gainer.growthRate().minimumExpForLevel(c.gainerLevel);
      const defeated = makePokemon(c.defeated, c.defeatedLevel);
      const battle = await makeBattle([gainer], [defeated]);
      if (c.trainer) (battle as unknown as { opponent: NPCTrainer[] }).opponent = [new NPCTrainer("Joey", GameData.TrainerType.keys()[0]!)];
      if (c.expShare.length === 0) battle.battlers[1]!.participants = [0];
      const before = gainer.exp;
      G.gameMap = { mapId: 0, events: new Map() } as MapLike; // level-up happiness reads $game_map.map_id
      await battle.pbGainExpOne(0, battle.battlers[1]!, c.numPartic, c.expShare, false, false);
      battle.pbGainEVsOne(0, battle.battlers[1]!);
      G.gameMap = null;
      const label = `${c.gainer} Lv.${c.gainerLevel} beats ${c.defeated} Lv.${c.defeatedLevel}`;
      expect(gainer.exp - before, label).toBe(c.expGained);
      expect(gainer.level, label).toBe(c.levelAfter);
      expect(gainer.ev, label).toEqual(c.evs);
    }
  });

  it("counts Poké Ball shakes like Ruby", async () => {
    for (const c of ref.catch) {
      const wild = makePokemon(c.species, c.level);
      wild.hp = c.hp;
      expect(wild.totalhp).toBe(c.totalhp);
      wild.status = c.status;
      const battle = await makeBattle([makePokemon("MEW", 50)], [wild], { random: new SeqRandom(c.randomStart) });
      const shakes = battle.pbCaptureCalc(wild, battle.battlers[1]!, null, c.ball);
      expect([shakes, battle.criticalCapture], `${c.species} ${c.ball}`).toEqual([c.shakes, c.critical]);
    }
  });

  it("decides whether running away works like Ruby", async () => {
    for (const c of ref.run) {
      const got: [number, number, number][] = [];
      for (const [v] of c.results as [number, number, number][]) {
        const battle = await makeBattle([makePokemon(c.player, c.playerLevel)], [makePokemon(c.wild, c.wildLevel)]);
        battle.battleAI.pbAIRandom = () => v;
        battle.runCommand = c.attempts;
        battle.choices[0] = ["None", 0, null, -1];
        const ret = await battle.pbRun(0);
        got.push([v, ret, battle.decision]);
      }
      expect(got, `${c.player} vs ${c.wild}, attempts ${c.attempts}`).toEqual(c.results);
    }
  });
});
