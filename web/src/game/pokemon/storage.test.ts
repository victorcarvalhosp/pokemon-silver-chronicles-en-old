// PokemonStorage and the pbAddPokemon family.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G } from "../globals";
import { setMessageHook } from "../items/itemUtilities";
import { Player } from "../trainer/Player";
import { Pokemon } from "./Pokemon";
import { PokemonBox, PokemonStorage, pbEachPokemon } from "./PokemonStorage";
import { pbAddPokemon, pbAddPokemonSilent, pbAddToPartySilent, pbBoxesFull, pbGenerateEgg } from "./utilities";

const messages: string[] = [];
const player = () => G.player as unknown as Player;

beforeAll(() => {
  loadGameDataForTests();
  setMessageHook(async (text) => { messages.push(text); return 0; }, async () => false);
});

beforeEach(() => {
  messages.length = 0;
  G.player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.storage = new PokemonStorage();
});

describe("PokemonStorage", () => {
  it("has 40 boxes of 30 and basic wallpapers", () => {
    const s = G.storage;
    expect(s.maxBoxes()).toBe(40);
    expect(s.maxPokemon(0)).toBe(PokemonBox.BOX_SIZE);
    expect(s.maxPokemon(-1)).toBe(6);
    expect(s.boxes[17]!.background).toBe(1);
    expect(s.boxes[0]!.name).toBe("Box 1");
    expect(s.isAvailableWallpaper(15)).toBe(true);
    expect(s.isAvailableWallpaper(16)).toBe(false);
    expect(s.availableWallpapers()[1].length).toBe(16);
  });

  it("stores caught Pokémon in the current box, then the next free one (healed)", () => {
    const s = G.storage;
    const p = new Pokemon("PIDGEY", 3, player());
    p.hp = 1;
    expect(s.pbStoreCaught(p)).toBe(0);
    expect(s.get(0, 0)).toBe(p);
    expect(p.hp).toBe(p.totalhp); // HEAL_STORED_POKEMON
    for (let i = 1; i < 30; i++) s.set(0, i, new Pokemon("RATTATA", 2, player()));
    expect(s.boxes[0]!.full()).toBe(true);
    expect(s.pbStoreCaught(new Pokemon("SENTRET", 2, player()))).toBe(1);
    expect(s.currentBox).toBe(1);
    expect(s.pbFirstFreePos(1)).toBe(1);
  });

  it("moves between party and boxes", () => {
    const s = G.storage;
    player().party.push(new Pokemon("CYNDAQUIL", 5, player()), new Pokemon("PIDGEY", 3, player()));
    expect(s.pbMove(0, -1, -1, 1)).toBe(true);
    expect(player().party.length).toBe(1);
    expect(s.get(0, 0)!.species).toBe("PIDGEY");
    expect(s.pbMove(-1, -1, 0, 0)).toBe(true);
    expect(player().party.map((p) => p.species)).toEqual(["CYNDAQUIL", "PIDGEY"]);
    expect(pbEachPokemon().length).toBe(2);
  });

  it("round-trips through JSON", () => {
    const s = G.storage;
    s.pbStoreCaught(new Pokemon("PIDGEY", 3, player()));
    s.boxes[3]!.name = "Favourites";
    s.unlockedWallpapers[20] = true;
    s.currentBox = 3;
    const json = JSON.parse(JSON.stringify(s.toJSON())) as ReturnType<PokemonStorage["toJSON"]>;
    const back = PokemonStorage.fromJSON(json);
    expect(back.toJSON()).toEqual(json);
    expect(back.get(0, 0)).toBeInstanceOf(Pokemon);
    expect(back.get(0, 1)).toBeNull();
    expect(back.isAvailableWallpaper(20)).toBe(true);
  });
});

describe("pbAddPokemon and friends", () => {
  it("pbAddPokemon: message, Pokédex, party", async () => {
    expect(await pbAddPokemon("TOTODILE", 5)).toBe(true);
    expect(messages[0]).toBe("Gold obtained Totodile!\\me[Pkmn get]\\wtnp[80]\x01");
    expect(player().party[0]!.species).toBe("TOTODILE");
    expect(player().owned("TOTODILE")).toBe(true);
    expect(player().seen("TOTODILE")).toBe(true);
    expect(player().party[0]!.firstMoves.length).toBeGreaterThan(0);
  });

  it("goes to the boxes when the party is full", async () => {
    for (let i = 0; i < 6; i++) pbAddToPartySilent("RATTATA", 2);
    expect(player().partyFull()).toBe(true);
    expect(pbAddPokemonSilent("PIDGEY", 3)).toBe(true);
    expect(G.storage.get(0, 0)!.species).toBe("PIDGEY");
    expect(await pbAddPokemon("SENTRET", 3)).toBe(true);
    expect(messages[messages.length - 1]).toBe("Sentret has been sent to Box \"Box 1\"!");
    expect(pbBoxesFull()).toBe(false);
    expect(pbGenerateEgg("TOGEPI")).toBe(false); // party full
  });

  it("pbGenerateEgg", () => {
    expect(pbGenerateEgg("TOGEPI", "Elm's Lab")).toBe(true);
    const egg = player().party[0]!;
    expect(egg.egg()).toBe(true);
    expect(egg.name).toBe("Egg");
    expect(egg.stepsToHatch).toBe(GameData.Species.get("TOGEPI").hatchSteps);
    expect(egg.obtainText).toBe("Elm's Lab");
  });
});
