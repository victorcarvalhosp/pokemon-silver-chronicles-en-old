// pbLearnMove(pkmn, move, ...) { block }: every message it shows runs the
// caller's block each frame (001_Item_Utilities.rb:577-622), e.g. the
// evolution scene's pbUpdate (004_UI_Evolution.rb:630) that keeps its
// sprites animating while "X learned Y!" is on screen.
import { beforeAll, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { Pokemon } from "../pokemon/Pokemon";
import { pbLearnMove, setForgetMoveHook, setMessageHook } from "./itemUtilities";

const blocks: unknown[] = [];
beforeAll(() => {
  loadGameDataForTests();
  setMessageHook(async (_t, _c, _cc, block) => { blocks.push(block); return 0; }, async (_t, block) => { blocks.push(block); return true; });
});

describe("pbLearnMove's block", () => {
  it("reaches every message and confirmation", async () => {
    void GameData;
    const pkmn = new Pokemon("PIKACHU", 30);
    while (pkmn.numMoves() < 4) pkmn.learnMove(["GROWL", "TAILWHIP", "QUICKATTACK", "THUNDERSHOCK"][pkmn.numMoves()]!);
    setForgetMoveHook(async () => 0);
    const update = () => {};
    blocks.length = 0;
    expect(await pbLearnMove(pkmn, "THUNDERBOLT", true, false, update)).toBe(true);
    expect(blocks.length).toBe(5); // wants to learn, forget?, 1 2 and, forgot, learned
    expect(blocks.every((b) => b === update)).toBe(true);
  });
});
