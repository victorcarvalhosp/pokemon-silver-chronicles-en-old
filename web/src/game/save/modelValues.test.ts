// The data model's save values (player, bag, storage_system, stats), and the
// event-script helpers in scripts/pokemon.ts.
import { beforeAll, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G } from "../globals";
import { setMessageHook } from "../items/itemUtilities";
import { PokemonBag } from "../items/PokemonBag";
import { Pokemon } from "../pokemon/Pokemon";
import { PokemonStorage } from "../pokemon/PokemonStorage";
import { evaluate, evaluateAsync, runStatements } from "../scriptApi";
import "../scripts/pokemon";
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";
import "./modelValues";
import { SaveData } from "./SaveData";

beforeAll(() => {
  loadGameDataForTests();
  setMessageHook(async () => 0, async () => false);
});

describe("save values", () => {
  it("new game creates Essentials' objects, and a save hash loads back identically", () => {
    SaveData.loadNewGameValues();
    const player = G.player as unknown as Player;
    expect(player).toBeInstanceOf(Player);
    expect(player.name).toBe("Unnamed");
    expect(G.bag).toBeInstanceOf(PokemonBag);
    expect(G.storage).toBeInstanceOf(PokemonStorage);
    expect(G.stats).toBeInstanceOf(GameStats);
    player.party.push(new Pokemon("CYNDAQUIL", 5, player));
    G.bag.add("POTION", 2);
    G.storage.pbStoreCaught(new Pokemon("PIDGEY", 3, player));
    G.stats.distanceWalked = 42;
    const hash = JSON.parse(JSON.stringify(SaveData.compileSaveHash())) as Record<string, unknown>;
    expect(Object.keys(hash)).toEqual(["__format", "player", "bag", "storage_system", "stats"]);
    G.player = null;
    SaveData.loadAllValues(hash);
    expect(G.player).toBeInstanceOf(Player);
    expect((G.player as unknown as Player).party[0]!.species).toBe("CYNDAQUIL");
    expect(G.bag.quantity("POTION")).toBe(2);
    expect(G.storage.get(0, 0)!.species).toBe("PIDGEY");
    expect(G.stats.distanceWalked).toBe(42);
    expect(JSON.parse(JSON.stringify(SaveData.compileSaveHash()))).toEqual(hash);
  });
});

describe("event script helpers", () => {
  const ctx = { event: null, interpreter: null };

  it("resolves $player/$bag calls and the old PBItems constants", async () => {
    SaveData.markValuesAsUnloaded();
    SaveData.loadNewGameValues();
    expect(await evaluateAsync({ call: "pbReceiveItem", args: [{ call: "PBItems::POTION" }] }, ctx)).toBe(true);
    expect(evaluate({ call: "$bag.quantity", args: ["POTION"] }, ctx)).toBe(1);
    expect(evaluate({ call: "$bag.has?", args: ["POTION"] }, ctx)).toBe(true);
    expect(await evaluateAsync({ call: "pbAddPokemon", args: ["CHIKORITA", 5] }, ctx)).toBe(true);
    expect(evaluate({ call: "$player.has_species?", args: ["CHIKORITA"] }, ctx)).toBe(true);
    expect(evaluate({ call: "$player.pokemon_count" }, ctx)).toBe(1);
    expect(evaluate({ call: "$player.party_full?" }, ctx)).toBe(false);
    expect(evaluate({ call: "$player.first_able_pokemon.isSpecies?", args: ["CHIKORITA"] }, ctx)).toBe(true);
    expect(evaluate({ call: "$player.pokedex.owned_count" }, ctx)).toBe(1);
    expect(evaluate({ call: "$PokemonStorage.full?" }, ctx)).toBe(false);
    G.gameVariables.set(5, 0);
    expect((evaluate({ call: "pbGetPokemon", args: [5] }, ctx) as Pokemon).species).toBe("CHIKORITA");
    expect(evaluate({ call: "PBTrainers::YOUNGSTER" }, ctx)).toBe("YOUNGSTER");
    await runStatements([{ cmd: "assign", target: "$player.coins", op: "+=", value: 50 }], ctx);
    expect((G.player as unknown as Player).coins).toBe(50);
    await runStatements([{ cmd: "assign", target: "$player.badges[]", args: [2], op: "=", value: true }], ctx);
    expect(evaluate({ call: "$player.badge_count" }, ctx)).toBe(1);
    expect(GameData.Item.exists(evaluate({ call: "PBItems::COINCASE" }, ctx) as string)).toBe(true);
  });
});
