// The Gen 9 Pack's Sun multiplier (Plugins/Generation 9 Pack Scripts/[001]
// Battle/[001] Battle.rb:278) assigns instead of comparing, so in the
// original every damaging move gets Hydro Steam's multiplier in Sun and has
// its function code overwritten. The port fixes it on purpose; these pin
// the fixed behaviour.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { Battle, DebugSceneNoLogging } from "./index";

let player: Player;

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
});

function makePokemon(species: string, move: string): Pokemon {
  const pkmn = new Pokemon(species, 50, player as never);
  for (const st of GameData.Stat.eachMain()) {
    pkmn.iv[st.id] = 31;
    pkmn.ev[st.id] = 0;
  }
  pkmn.nature = "HARDY";
  pkmn.ability = "HONEYGATHER"; // no ability effects
  pkmn.item = null;
  pkmn.moves = [];
  pkmn.learnMove(move);
  pkmn.calcStats();
  return pkmn;
}

/** Damage of `move` from Mew to Snorlax with a fixed roll, and the move's function code afterwards. */
async function damage(move: string, weather: string): Promise<[number, string]> {
  const scene = new DebugSceneNoLogging();
  const battle = new Battle(scene, [makePokemon("MEW", move)], [makePokemon("SNORLAX", "TACKLE")], player, null);
  battle.internalBattle = true;
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  battle.field.weather = weather;
  battle.pbRandom = () => 15;
  const user = battle.battlers[0]!;
  const target = battle.battlers[1]!;
  const m = user.moves[0]!;
  target.damageState.reset();
  m.calcType = m.pbCalcType(user);
  target.damageState.typeMod = m.pbCalcTypeMod(m.calcType, user, target);
  await m.pbCalcDamage(user, target);
  return [target.damageState.calcDamage, m.function];
}

describe("Sun damage (Gen 9 Pack fix)", () => {
  it("only boosts Hydro Steam, and leaves function codes alone", async () => {
    const cases: [string, number][] = [["WATERGUN", 0.5], ["TACKLE", 1], ["EMBER", 1.5], ["HYDROSTEAM", 1.5]];
    for (const [move, ratio] of cases) {
      const [plain, fnBefore] = await damage(move, "None");
      const [sunny, fnAfter] = await damage(move, "Sun");
      expect(sunny / plain, move).toBeCloseTo(ratio, 1);
      expect(fnAfter, move).toBe(fnBefore);
    }
  });
});
