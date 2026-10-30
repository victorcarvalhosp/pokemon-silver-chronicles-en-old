// Pokémon Amie's logic (amie.ts) against the game's own Ruby:
// amieReference.json is written by web/tools/ruby-ref/amie_reference.rb, which
// loads Essentials v20.1, the item handlers in the game's load order and
// Plugins/Pokemon Amie/Pokemon Amie.rb headless. Both sides replay the same
// random numbers (rand(n) = raw % n). Compared: changeAmieStats for every
// method, feedAmie for every food (with the PokeAmie_Scene the item handlers
// get, with the plugin's pbDisplay/pbRefresh/pbHardRefresh/pbUpdate and a -1
// pbChooseMove made callable on both sides: a deliberate fix, see amieItemScene), getAmieStatLevel, resetAffection, the :hungerCounter step handler,
// pbFirstNonEggPokemonOrFaintedPokemon and setAmiePokemon.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { EventHandlers } from "../../game/eventHandlers";
import { G, GameTemp, GameVariables, type MapLike } from "../../game/globals";
import { setMessageHook, setTopRightWindowHook } from "../../game/items/itemUtilities";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import "../../battle/items/index";
import {
  EATABLE_ITEMS, amieItemScene, hungerCounter, pbFirstNonEggPokemonOrFaintedPokemon, setAmiePokemon,
} from "./amie";
import ref from "./amieReference.json";

//===============================================================================
// Scripted randomness, messages
//===============================================================================
const rnd = vi.hoisted(() => ({ rolls: [] as number[], used: [] as number[], free: true, seed: 1 }));
vi.mock("../../core/random", () => {
  // Setup (Pokemon.new, Player.new) draws freely; actions are scripted.
  const free = () => {
    rnd.seed = (rnd.seed * 1103515245 + 12345) % 2147483648;
    return rnd.seed / 2147483648;
  };
  return {
    rand: (n: number) => {
      if (rnd.free) return n > 0 ? Math.floor(free() * n) : free();
      if (rnd.rolls.length === 0) throw new Error("out of scripted rolls");
      const raw = rnd.rolls.shift()!;
      rnd.used.push(raw);
      if (!(n > 0)) throw new Error(`unexpected rand(${n})`);
      return raw % n;
    },
    random: () => free(),
    seedRandom: () => {},
  };
});
function script(raw: number[]): void {
  rnd.rolls = [...raw];
  rnd.used = [];
  rnd.free = false;
}

let log: unknown[][] = [];
vi.mock("../../ui/messages", () => ({
  pbMessage: async (text: string) => { log.push(["msg", text]); return 0; },
}));

//===============================================================================
// Setup
//===============================================================================
interface MonSpec {
  species: Id; level?: number; hp?: number; status?: Id; egg?: boolean; happiness?: number;
  ev?: Record<string, number>; amie?: [number, number, number];
}
type Amie = [number, number, number];

const reference = ref as unknown as {
  eatable: string[];
  maxPoints: number;
  stats: { setup: { method: string; amie: Amie; rolls: number[] }; result: { amie: Amie; log: unknown[][] } }[];
  feed: {
    setup: { name: string; item: Id; pokemon: MonSpec; bag: [Id, number][]; rolls: number[] };
    result: { error: [string, string] | null; pokemon: unknown; bag: unknown; log: unknown[][] };
  }[];
  levels: [number, number][];
  reset: { amie: Amie; after: Amie }[];
  hunger: { steps: number; counter: number; party: Amie[] }[];
  choose: { setup: { name: string; party: MonSpec[]; arg: number | null }; result: Record<string, unknown> }[];
  berryPlantData: { hitByItem: boolean };
};

let player: Player;
function newPlayer(): void {
  rnd.free = true;
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameTemp = new GameTemp();
  G.gameMap = { mapId: 5, events: new Map() } as MapLike; // changeHappiness reads $game_map.map_id
}

/** amie_reference.rb's build_pokemon. */
function buildPokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.species, spec.level ?? 30, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = spec.ev?.[s.id] ?? 0;
  }
  pkmn.nature = "HARDY";
  pkmn.abilityIndex = 0;
  pkmn.item = null;
  pkmn.calcStats();
  if (spec.hp != null) pkmn.hp = spec.hp;
  if (spec.status) pkmn.status = spec.status;
  if (spec.happiness) pkmn.happiness = spec.happiness;
  if (spec.egg) pkmn.stepsToHatch = 1;
  if (spec.amie) [pkmn.amieAffection, pkmn.amieFullness, pkmn.amieEnjoyment] = spec.amie;
  return pkmn;
}

const amieState = (p: Pokemon): Amie => [p.amieAffection, p.amieFullness, p.amieEnjoyment];

function pokemonState(pkmn: Pokemon) {
  const ev: Record<string, number> = {};
  for (const s of GameData.Stat.eachMain()) ev[s.id] = pkmn.ev[s.id]!;
  return {
    species: pkmn.species, level: pkmn.level, hp: pkmn.hp, totalhp: pkmn.totalhp, status: pkmn.status,
    happiness: pkmn.happiness, ev, amie: amieState(pkmn),
  };
}

const bagState = () => G.bag.pockets.flatMap((pocket) => (pocket ?? []).map((slot) => [slot[0], slot[1]]));

/** Ruby's [class, message] from the port's "Class: message" errors. */
function errorOf(e: unknown): [string, string] {
  const msg = e instanceof Error ? e.message : String(e);
  const i = msg.indexOf(": ");
  return [msg.slice(0, i), msg.slice(i + 2)];
}

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  setMessageHook(
    async (text) => { log.push(["msg", text]); return 0; },
    async (text) => { log.push(["confirmMsg", text, false]); return false; },
  );
  setTopRightWindowHook(async (text) => { log.push(["topRight", text]); });
});

//===============================================================================
// Tests
//===============================================================================
describe("Pokémon Amie vs Ruby", () => {
  it("has the plugin's food list and max points", () => {
    expect(EATABLE_ITEMS).toEqual(reference.eatable);
    expect(Pokemon.MAXAMIEPOINTS).toBe(reference.maxPoints);
  });

  it("never finds a berry in berry_plants.dat (looked up by GameData::Item)", () => {
    expect(reference.berryPlantData.hitByItem).toBe(false);
  });

  describe("changeAmieStats", () => {
    for (const { setup, result } of reference.stats) {
      it(`${setup.method} from ${setup.amie.join("/")}`, async () => {
        newPlayer();
        const pkmn = buildPokemon({ species: "PIKACHU", amie: setup.amie });
        log = [];
        script(setup.rolls);
        await pkmn.changeAmieStats(setup.method);
        expect(rnd.used).toEqual(setup.rolls);
        expect({ amie: amieState(pkmn), log }).toEqual(result);
      });
    }
  });

  describe("feedAmie", () => {
    for (const { setup, result } of reference.feed) {
      it(setup.name, async () => {
        newPlayer();
        for (const [item, qty] of setup.bag) G.bag.add(item, qty);
        const pkmn = buildPokemon(setup.pokemon);
        player.party = [pkmn];
        log = [];
        script(setup.rolls);
        let error: [string, string] | null = null;
        try {
          await pkmn.feedAmie(setup.item, pkmn, amieItemScene());
        } catch (e) {
          error = errorOf(e);
        }
        expect(rnd.used).toEqual(setup.rolls);
        expect({ error, pokemon: pokemonState(pkmn), bag: bagState(), log }).toEqual({
          error: result.error, pokemon: result.pokemon, bag: result.bag, log: result.log,
        });
      });
    }
  });

  it("getAmieStatLevel and resetAffection", () => {
    newPlayer();
    const pkmn = buildPokemon({ species: "PIKACHU" });
    for (const [points, level] of reference.levels) expect(pkmn.getAmieStatLevel(points)).toBe(level);
    for (const { amie, after } of reference.reset) {
      const p = buildPokemon({ species: "PIKACHU", amie });
      p.resetAffection();
      expect(amieState(p)).toEqual(after);
    }
  });

  it("lowers fullness and enjoyment every 50 steps of anyone (:hungerCounter)", () => {
    newPlayer();
    player.party = [
      buildPokemon({ species: "PIKACHU", amie: [10, 3, 1] }),
      buildPokemon({ species: "TOGEPI", level: 1, egg: true, amie: [0, 2, 0] }),
      buildPokemon({ species: "GEODUDE", level: 12, hp: 0, amie: [5, 120, 90] }),
    ];
    hungerCounter.value = 0;
    for (const { steps, counter, party } of reference.hunger) {
      for (let i = 0; i < steps; i++) EventHandlers.triggerSync("on_step_taken", {});
      expect(hungerCounter.value).toBe(counter);
      expect(player.party.map(amieState)).toEqual(party);
    }
  });

  describe("pbFirstNonEggPokemonOrFaintedPokemon / setAmiePokemon", () => {
    for (const { setup, result } of reference.choose) {
      it(setup.name, () => {
        newPlayer();
        player.party = setup.party.map(buildPokemon);
        const first = pbFirstNonEggPokemonOrFaintedPokemon();
        const res: Record<string, unknown> = { first: first ? player.party.indexOf(first) : null };
        try {
          const got = setAmiePokemon(setup.arg);
          res.set = got ? player.party.indexOf(got) : null;
        } catch (e) {
          res.error = errorOf(e);
        }
        expect(res).toEqual(result);
      });
    }
  });
});
