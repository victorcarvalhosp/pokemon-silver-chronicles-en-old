// The Pokémon lifecycle ports against the game's own Ruby
// (lifecycleReference.json, written by web/tools/ruby-ref/lifecycle_reference.rb):
// egg generation (species, moves, IVs/nature/ability/Poké Ball inheritance,
// shininess rerolls, Pokérus) with scripted random numbers, hatching data,
// Day Care compatibility / steps / Exp / shared egg moves, berry plant growth
// over real time (with mulches and watering), evolution checks and
// pbEvolutionSuccess's results (species, moves learnt, Shedinja), trades
// (pbStartTrade's received Pokémon and trade evolution check), and the
// :hatch_eggs step countdown.
//
// core/random is replaced by the harness's scripted rand (raw % n while a
// scenario's rolls are active); Date is faked so pbGetTimeNow matches Ruby's.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const script = vi.hoisted(() => ({ on: false, rolls: [] as number[], used: 0 }));
vi.mock("../../core/random", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../core/random")>();
  const next = () => {
    if (script.rolls.length === 0) throw new Error("out of scripted rolls");
    script.used += 1;
    return script.rolls.shift()!;
  };
  return {
    ...real,
    random: () => (script.on ? next() / 2 ** 30 : real.random()),
    rand: (n: number) => (script.on ? (n > 0 ? next() % n : next() / 2 ** 30) : real.rand(n)),
  };
});

import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { evolvePokemon } from "../../ui/evolution/Evolution";
import { pbHatchEggsOnStep, pbHatchPokemonData } from "../../ui/hatching/EggHatching";
import { pbTradePokemon } from "../../ui/trading/Trading";
import { BerryPlantData } from "../berries/BerryPlants";
import { G, GameTemp, GameVariables, PokemonGlobalMetadata } from "../globals";
import { PokemonBag } from "../items/PokemonBag";
import { Pokemon } from "../pokemon/Pokemon";
import { PokemonOwner } from "../pokemon/PokemonOwner";
import "../pokemon/utilities"; // PokemonEvolutionScene.pbDuplicatePokemon (Shedinja)
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";
import { DayCare } from "./DayCare";
import ref from "./lifecycleReference.json";

interface Spec {
  species: Id; level: number; form?: number; gender?: number; nature?: Id; iv?: number[]; abilityIndex?: number;
  item?: Id; happiness?: number; pokeBall?: Id; moves?: Id[]; exp?: number; hp?: number; pid?: number;
  owner?: [number, string, number, number];
}

const player = () => G.player as unknown as Player;
const mainStats = () => GameData.Stat.eachMain().map((s) => s.id);

function resetWorld(bag: [Id, number][] = []): void {
  G.gameTemp = new GameTemp();
  const p = new Player("Gold", GameData.TrainerType.keys()[0]!);
  p.id = 12345678;
  G.player = p as never;
  G.bag = new PokemonBag();
  for (const [item, qty] of bag) G.bag.add(item, qty);
  G.stats = new GameStats();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameVariables = new GameVariables();
  G.gameMap = null;
}

function buildPokemon(spec: Spec): Pokemon {
  const owner = spec.owner ? new PokemonOwner(...spec.owner) : (player() as never);
  const pkmn = new Pokemon(spec.species, spec.level, owner);
  if (spec.form != null) pkmn.formSimple = spec.form;
  pkmn.personalID = spec.pid ?? 0x00010000;
  pkmn.shiny = false;
  mainStats().forEach((s, i) => { pkmn.iv[s] = spec.iv ? spec.iv[i]! : 10 + i; });
  pkmn.nature = spec.nature ?? "HARDY";
  if (spec.gender != null) pkmn.gender = spec.gender;
  pkmn.abilityIndex = spec.abilityIndex ?? 0;
  pkmn.item = spec.item ?? null;
  pkmn.happiness = spec.happiness ?? 70;
  pkmn.pokeBall = spec.pokeBall ?? "POKEBALL";
  if (spec.moves) {
    pkmn.forgetAllMoves();
    for (const id of spec.moves) pkmn.learnMove(id);
  }
  if (spec.exp != null) pkmn.exp = spec.exp;
  pkmn.calcStats();
  if (spec.hp != null) pkmn.hp = spec.hp;
  return pkmn;
}

function pokemonState(pkmn: Pokemon) {
  return {
    species: pkmn.species, form: pkmn.form, level: pkmn.level, exp: pkmn.exp, name: pkmn.name,
    nicknamed: pkmn.nicknamed(),
    gender: pkmn.gender, nature: pkmn.nature!.id, abilityIndex: pkmn.abilityIndex, ability: pkmn.ability?.id ?? null,
    iv: Object.fromEntries(mainStats().map((s) => [s, pkmn.iv[s]])),
    moves: pkmn.moves.map((m) => m.id), firstMoves: [...pkmn.firstMoves],
    item: pkmn.itemId, pokeBall: pkmn.pokeBall,
    shiny: pkmn.shiny, personalID: pkmn.personalID, pokerus: pkmn.pokerus,
    stepsToHatch: pkmn.stepsToHatch, happiness: pkmn.happiness, obtainText: pkmn.obtainText,
    obtainMethod: pkmn.obtainMethod, hatchedMap: pkmn.hatchedMap,
    owner: [pkmn.owner.id, pkmn.owner.name, pkmn.owner.gender, pkmn.owner.language],
    hp: pkmn.hp, totalhp: pkmn.totalhp, attack: pkmn.attack, speed: pkmn.speed,
  };
}

function scripted<T>(rolls: number[], fn: () => T): T {
  script.rolls = [...rolls];
  script.used = 0;
  script.on = true;
  try {
    return fn();
  } finally {
    script.on = false;
  }
}

const RUBY_NOW = 1_700_000_000;

beforeAll(() => {
  loadGameDataForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RUBY_NOW * 1000);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("Egg generation (DayCare::EggGenerator)", () => {
  for (const c of ref.eggs) {
    it(c.name, () => {
      resetWorld(c.bag as [Id, number][]);
      const a = buildPokemon(c.a as Spec);
      const b = buildPokemon(c.b as Spec);
      const egg = scripted(c.rolls, () => DayCare.EggGenerator.generate(a, b));
      expect(script.used, "random numbers used").toBe(c.used);
      expect(pokemonState(egg)).toEqual(c.egg);
      // pbHatch's data part
      G.gameMap = { mapId: 42 } as never;
      const hatched = egg.clone();
      hatched.stepsToHatch = 0;
      pbHatchPokemonData(hatched);
      expect({ ...pokemonState(hatched), eggsHatched: G.stats.eggsHatched }).toEqual(c.hatched);
    });
  }

  it("works out compatibility like Ruby", () => {
    for (const c of ref.compatibility) {
      resetWorld();
      player().party.push(buildPokemon(c.a as Spec), buildPokemon(c.b as Spec));
      DayCare.depositInternal(0);
      DayCare.depositInternal(0);
      DayCare.getCompatibility(5);
      expect(G.gameVariables.get(5), `${c.a.species} + ${c.b.species}`).toBe(c.compat);
    }
  });
});

describe("Day Care", () => {
  for (const c of ref.daycare) {
    it(c.name, () => {
      resetWorld(c.bag as [Id, number][]);
      for (const s of c.party) player().party.push(buildPokemon(s as Spec));
      const log: unknown[] = [];
      const dc = G.pokemonGlobal.dayCare;
      DayCare.depositInternal(0);
      const p0 = dc.get(0)!.pokemon!;
      log.push(["deposit", player().party.length, dc.count(), p0.form, p0.hp, p0.totalhp]);
      if (player().party.length > 1 && c.party.length > 2) DayCare.depositInternal(0);
      log.push(["count", DayCare.count()]);
      scripted(c.rolls, () => {
        for (let i = 0; i < c.steps; i++) {
          dc.updateOnStepTaken();
          if ((i + 1) % 100 !== 0) continue;
          log.push(["step", i + 1, dc.stepCounter, dc.eggGenerated, dc.slots.map((s) => (s.filled()
            ? [s.pokemon!.level, s.pokemon!.exp, s.pokemon!.moves.map((m) => m.id), s.levelGain(), s.cost(), s.choiceText()]
            : null))]);
        }
      });
      log.push(["used", script.used]);
      DayCare.getDetails(0, 1, 2);
      DayCare.getLevelGain(0, 3, 4);
      DayCare.getCompatibility(5);
      const rubyVars = (c.log.find((l) => l[0] === "vars")![1]) as Record<string, unknown>;
      log.push(["vars", Object.fromEntries(Object.keys(rubyVars).map((k) => [k, G.gameVariables.get(Number(k))]))]);
      log.push(["egg", DayCare.eggGeneratedQ() ? "generated" : "none"]);
      DayCare.withdraw(0);
      log.push(["withdraw", player().party.map((p) => p.species), DayCare.count(), G.stats.dayCareLevelsGained, G.stats.dayCareDeposits]);
      expect(log).toEqual(c.log);
    });
  }
});

describe("Berry plants", () => {
  for (const c of ref.berries) {
    it(`${c.berry} ${c.mulch ?? "no mulch"}`, () => {
      let now = RUBY_NOW;
      vi.setSystemTime(now * 1000);
      const plant = new BerryPlantData();
      plant.mulchId = c.mulch;
      plant.plant(c.berry);
      const states: unknown[] = [];
      for (const [hours, water] of c.steps as [number, boolean][]) {
        now += hours * 3600 + 17;
        vi.setSystemTime(now * 1000);
        plant.update();
        if (water && plant.growing()) plant.water();
        states.push([plant.growthStage, plant.timeAlive, plant.moistureLevel, plant.yieldPenalty, plant.replantCount,
          plant.wateringCount, plant.planted() ? plant.moistureStage() : -1,
          plant.grown() ? plant.berryYield() : null, plant.berryId, plant.mulchId]);
      }
      expect(states).toEqual(c.states);
      vi.setSystemTime(RUBY_NOW * 1000);
    });
  }
});

describe("Evolution", () => {
  for (const c of ref.evolutions) {
    it(c.name, () => {
      resetWorld(c.bag as [Id, number][]);
      const pkmn = buildPokemon(c.pkmn as Spec);
      player().party.push(pkmn);
      for (let i = 0; i < c.extra; i++) player().party.push(buildPokemon({ species: "PIDGEY", level: 5 }));
      let newSpecies: Id | null = null;
      if (c.check === "levelup") newSpecies = pkmn.checkEvolutionOnLevelUp();
      else if (c.check === "item") newSpecies = pkmn.checkEvolutionOnUseItem(c.item!);
      else newSpecies = pkmn.checkEvolutionOnTrade(buildPokemon(c.other as Spec));
      const learnt: Id[] = [];
      if (newSpecies) {
        G.stats.evolutionCount += 1;
        for (const move of evolvePokemon(pkmn, newSpecies).moves) { // pbLearnMove (recorded)
          learnt.push(move);
          pkmn.learnMove(move);
        }
      }
      expect({
        newSpecies, learnt, party: player().party.map(pokemonState), ball: G.bag.quantity("POKEBALL"),
        owned: player().owned(newSpecies ?? "NONE"), evolutionCount: G.stats.evolutionCount,
      }).toEqual({
        newSpecies: c.newSpecies, learnt: c.learnt, party: c.party, ball: c.ball, owned: c.owned, evolutionCount: c.evolutionCount,
      });
    });
  }

  it("checks level-up evolutions of every species like Ruby", () => {
    // Methods that read the map (Charjabug, Crabrawler, ...) raise in the
    // headless Ruby, which has no $game_map; they're left out.
    const sweep = (ref.levelUpSweep as [Id, number, number, string | null][]).filter((e) => e[3] !== "error");
    expect(sweep.length).toBeGreaterThan(3500);
    const got: unknown[] = [];
    for (const [species, level, happiness] of sweep) {
      resetWorld();
      const pkmn = new Pokemon(species, level, player() as never);
      pkmn.happiness = happiness;
      pkmn.gender = 0;
      pkmn.personalID = 0x00010000;
      pkmn.nature = "HARDY";
      mainStats().forEach((st, i) => { pkmn.iv[st] = 10 + i; });
      pkmn.calcStats();
      let r: string | null;
      try {
        r = pkmn.checkEvolutionOnLevelUp();
      } catch {
        r = "error";
      }
      got.push([species, level, happiness, r]);
    }
    expect(got).toEqual(sweep);
  });
});

describe("Trades (pbStartTrade)", () => {
  for (const c of ref.trades) {
    it(c.name, () => {
      resetWorld();
      for (const s of c.party) player().party.push(buildPokemon(s as Spec));
      const newpoke = typeof c.newpoke === "string" ? c.newpoke : buildPokemon(c.newpoke as Spec);
      const log: unknown[] = [];
      let error: string | null = null;
      scripted(c.rolls, () => {
        G.stats.tradeCount += 1;
        try {
          const myPokemon = player().party[c.index]!;
          const yourPokemon = pbTradePokemon(c.index, newpoke, c.nickname, c.trainer, c.gender);
          log.push([player().name, c.trainer]);
          log.push(["evolves", yourPokemon.checkEvolutionOnTrade(myPokemon)]);
          player().party[c.index] = yourPokemon;
        } catch (e) {
          error = (e as Error).message;
        }
      });
      expect({ used: script.used, log, error, received: pokemonState(player().party[c.index]!), tradeCount: G.stats.tradeCount })
        .toEqual({ used: c.used, log: c.log, error: c.error, received: c.received, tradeCount: c.tradeCount });
    });
  }
});

describe("Hatching countdown (:hatch_eggs)", () => {
  for (const c of ref.hatching) {
    it(c.name, async () => {
      resetWorld();
      for (const s of c.party) player().party.push(buildPokemon(s as Spec));
      for (const [sp, steps] of c.eggs as [Id, number][]) {
        const egg = buildPokemon({ species: sp, level: 1 });
        egg.stepsToHatch = steps;
        player().party.push(egg);
      }
      const hatched: Id[] = [];
      const log: unknown[] = [];
      for (let i = 0; i < c.steps; i++) {
        await pbHatchEggsOnStep(async (egg) => { hatched.push(egg.species); });
        log.push([player().party.map((p) => p.stepsToHatch), [...hatched]]);
      }
      expect(log).toEqual(c.log);
    });
  }
});

describe("Day Care save data", () => {
  it("round-trips the deposited Pokémon and counters", () => {
    resetWorld();
    player().party.push(buildPokemon({ species: "DITTO", level: 30 }), buildPokemon({ species: "EEVEE", level: 12, gender: 1 }));
    DayCare.depositInternal(0);
    const dc = G.pokemonGlobal.dayCare;
    dc.stepCounter = 77;
    dc.eggGenerated = true;
    const copy = DayCare.fromJSON(JSON.parse(JSON.stringify(dc.toJSON())));
    expect(copy.count()).toBe(1);
    expect(copy.get(0)!.pokemon!.species).toBe("DITTO");
    expect(copy.get(0)!.initialLevel).toBe(30);
    expect([copy.stepCounter, copy.eggGenerated, copy.gainExp, copy.shareEggMoves]).toEqual([77, true, true, true]);
  });
});
