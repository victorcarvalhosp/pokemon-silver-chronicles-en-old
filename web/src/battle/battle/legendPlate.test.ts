// The Generation 9 Pack's Legend Plate type choice (Battle_LegendPlate.ts,
// Battler#pbGetJudgmentType) against the game's Ruby: replays
// legendPlateReference.json (web/tools/ruby-ref/legend_plate_reference.rb).
// Same Pokémon setup as the AI reference (IVs 31, EVs 0, Hardy, Honey Gather
// unless the case says otherwise). Array#sample is recorded on both sides and
// returns the first candidate.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { Battle, DebugSceneNoLogging, PBEffects } from "../index";
import "../items";
import ref from "./legendPlateReference.json";

const sampled: { value: string[] | null } = { value: null };
vi.mock("../../game/maxRaid/random", async (orig) => {
  const actual = await orig<typeof import("../../game/maxRaid/random")>();
  return {
    ...actual,
    sample<T>(arr: readonly T[]): T | null {
      sampled.value = arr.map(String);
      return arr[0] ?? null;
    },
  };
});

type MonSpec = { s: string; a?: string; i?: string; m?: string[] };
type Case = {
  name: string; foe: MonSpec; check?: string; weather?: string; terrain?: string; charge?: boolean;
  field?: Record<string, number>; type3?: string; ally_ability?: string; faint?: boolean;
};
type Result = {
  name: string; case: Case; judgment?: string; sampled?: string[] | null; best?: string;
  sampledBest?: string[] | null; has?: boolean; error?: string;
};

const ARCEUS: MonSpec = { s: "ARCEUS", a: "MULTITYPE", i: "LEGENDPLATE", m: ["JUDGMENT"] };
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

function makePokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.s, 50, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = "HARDY";
  pkmn.ability = spec.a ?? "HONEYGATHER";
  pkmn.item = spec.i ?? null;
  pkmn.gender = 0;
  pkmn.forgetAllMoves();
  for (const m of spec.m ?? ["TACKLE"]) pkmn.learnMove(m);
  pkmn.calcStats();
  return pkmn;
}

describe("Legend Plate Judgment type vs Ruby", () => {
  for (const r of ref as Result[]) {
    it(r.name, async () => {
      const c = r.case;
      sampled.value = null;
      const p1 = [makePokemon(ARCEUS)];
      if (c.ally_ability) p1[0]!.ability = c.ally_ability;
      const p2 = [makePokemon(c.foe)];
      const scene = new DebugSceneNoLogging();
      const battle = new Battle(scene, p1, p2, player, null);
      battle.internalBattle = true;
      await scene.pbStartBattle(battle);
      battle.pbSetUpSides();
      const user = battle.battlers[0]!;
      const foe = battle.battlers[1]!;
      if (c.weather) {
        battle.field.weather = c.weather;
        battle.field.weatherDuration = 5;
      }
      if (c.terrain) {
        battle.field.terrain = c.terrain;
        battle.field.terrainDuration = 5;
      }
      for (const [e, v] of Object.entries(c.field ?? {})) {
        battle.field.effects[(PBEffects as unknown as Record<string, number>)[e]!] = v;
      }
      if (c.charge) user.effects[PBEffects.Charge] = 2;
      if (c.type3) user.battle.battlers[1]!.effects[PBEffects.Type3] = c.type3;
      if (c.faint) foe.hp = 0;
      expect(await user.pbGetJudgmentType(c.check ?? null)).toBe(r.judgment);
      expect(sampled.value).toEqual(r.sampled ?? null);
      sampled.value = null;
      expect(await battle.pbGetBestTypeJudgment(user, foe, null, c.check ?? null)).toBe(r.best);
      expect(sampled.value).toEqual(r.sampledBest ?? null);
      expect(user.hasLegendPlateJudgment()).toBe(r.has);
    });
  }
});
