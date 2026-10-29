// Scene effects that Ruby plays from inside synchronous code (a type-weakening
// berry's EatBerry animation during damage calculation) must have finished
// when the async caller moves on. Started without being awaited, they ran
// alongside the battle and two coroutines waited on Graphics.update().
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

function makePokemon(species: string, move: string, item: string | null = null): Pokemon {
  const pkmn = new Pokemon(species, 20, player as never);
  pkmn.ability = "HONEYGATHER"; // no ability effects
  pkmn.item = item;
  pkmn.moves = [];
  pkmn.learnMove(move);
  pkmn.calcStats();
  return pkmn;
}

describe("scene effects from damage calculation", () => {
  it("plays a Chilan Berry's EatBerry animation before pbCalcDamage resolves", async () => {
    const played: string[] = [];
    class SlowAnimScene extends DebugSceneNoLogging {
      override async pbCommonAnimation(name: string): Promise<void> {
        await new Promise((r) => setTimeout(r, 5));
        played.push(name);
      }
    }
    const scene = new SlowAnimScene();
    const battle = new Battle(scene, [makePokemon("CYNDAQUIL", "TACKLE")], [makePokemon("SENTRET", "TACKLE", "CHILANBERRY")], player, null);
    battle.internalBattle = true;
    await scene.pbStartBattle(battle);
    battle.pbSetUpSides();
    const user = battle.battlers[0]!;
    const target = battle.battlers[1]!;
    const m = user.moves[0]!;
    target.damageState.reset();
    m.calcType = m.pbCalcType(user);
    target.damageState.typeMod = m.pbCalcTypeMod(m.calcType, user, target);
    await m.pbCalcDamage(user, target);
    expect(target.damageState.berryWeakened).toBe(true);
    expect(played).toEqual(["EatBerry"]);
    expect(battle.pendingSceneEffects).toEqual([]);
  });
});
