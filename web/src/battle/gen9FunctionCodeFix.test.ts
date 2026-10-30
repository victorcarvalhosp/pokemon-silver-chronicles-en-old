// PBS/moves.txt gave Fillet Away and Chilly Reception function codes no class
// has (RaiseUserAtk2SpAtk2Speed2LoseHalfOfTotalHP, StartHailWeatherSwitchOutUser;
// the Gen 9 Pack's classes are RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP and
// SwitchOutUserStartHailWeather), so both used Battle::Move::Unimplemented and
// always failed. Fixed on purpose in the PBS; these pin the moves working.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP, SwitchOutUserStartHailWeather } from "./move/MoveEffects_Gen9NewMoveFunctions";
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
  pkmn.ability = "HONEYGATHER"; // no ability effects
  pkmn.item = null;
  pkmn.moves = [];
  pkmn.learnMove(move);
  pkmn.calcStats();
  return pkmn;
}

async function battleWith(move: string) {
  const scene = new DebugSceneNoLogging();
  const battle = new Battle(scene, [makePokemon("MEW", move)], [makePokemon("SNORLAX", "TACKLE")], player, null);
  battle.internalBattle = true;
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  const user = battle.battlers[0]!;
  return { battle, user, move: user.moves[0]! };
}

describe("Gen 9 moves whose PBS function code had no class", () => {
  it("both codes are in PBS", () => {
    expect(GameData.Move.get("FILLETAWAY").functionCode).toBe("RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP");
    expect(GameData.Move.get("CHILLYRECEPTION").functionCode).toBe("SwitchOutUserStartHailWeather");
  });

  it("Fillet Away halves the user's HP and sharply raises Attack, Sp. Atk and Speed", async () => {
    const { user, move } = await battleWith("FILLETAWAY");
    expect(move).toBeInstanceOf(RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP);
    expect(await move.pbMoveFailed(user, [])).toBe(false);
    const hp = user.hp;
    await move.pbEffectGeneral(user);
    expect(user.hp).toBe(hp - Math.floor(user.totalhp / 2));
    expect([user.stages.ATTACK, user.stages.SPECIAL_ATTACK, user.stages.SPEED]).toEqual([2, 2, 2]);
  });

  it("Chilly Reception starts hail", async () => {
    const { battle, user, move } = await battleWith("CHILLYRECEPTION");
    expect(move).toBeInstanceOf(SwitchOutUserStartHailWeather);
    expect(await move.pbMoveFailed(user, [])).toBe(false);
    await move.pbEffectGeneral(user);
    expect(battle.field.weather).toBe("Hail");
  });
});
