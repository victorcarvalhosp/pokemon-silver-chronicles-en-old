// Which move function codes have a Battle::Move class in the port, and which
// fall back to Battle::Move::Unimplemented. The list is kept in
// data/reports/battle-function-codes.json; regenerate it after porting move
// effect classes with:  UPDATE_REPORT=1 npx vitest run src/battle/move/functionCodes.test.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { MoveClasses, moveClassNameForCode } from "../index";
import { PowerMoveClasses } from "../zud";

/**
 * Power Move function codes that have no class in Ruby either: ZUD's
 * Battle::PowerMove.from_pokemon_move gives their moves
 * Battle::PowerMove::Unimplemented, as the port does (see zud/Battle_PowerMove.ts).
 */
const NO_CLASS_IN_RUBY: Record<string, string> = {
  ZUDBypassProtect: "G-Max One Blow/Rapid Flow: a plain Power Move; Max Guard/protection checks test the function code itself",
  ZUDPhotonGeyser: "NOTE (Ruby parity): the class is ZUDPhotonGeyserEffect, so Light That Burns the Sky is a plain damaging Z-Move",
};

const REPORT = resolve(import.meta.dirname, "../../../data/reports/battle-function-codes.json");

beforeAll(() => loadGameDataForTests());

it("lists the function codes that still use Battle::Move::Unimplemented", () => {
  const moves = new Map<string, string[]>();
  for (const m of GameData.Move.each()) {
    const code = m.functionCode || "None";
    if (!moves.has(code)) moves.set(code, []);
    moves.get(code)!.push(m.id);
  }
  const codes = [...moves.keys()].sort();
  // Power Moves (Z-Moves, Max Moves) look their class up in Battle::PowerMove,
  // then Battle::Move (ZUD's from_pokemon_move, see zud/Battle_PowerMove.ts).
  const isPowerCode = (c: string) => moves.get(c)!.some((id) => GameData.Move.get(id).powerMove());
  const has = (c: string) => MoveClasses.has(moveClassNameForCode(c)) ||
    (isPowerCode(c) && PowerMoveClasses.has(moveClassNameForCode(c)));
  const implemented = codes.filter((c) => has(c));
  const noClassInRuby = codes.filter((c) => !has(c) && NO_CLASS_IN_RUBY[c]);
  const unknown = codes.filter((c) => !has(c) && !NO_CLASS_IN_RUBY[c]);
  const report = {
    note: "Move function codes (moves.json) without a Battle::Move class in web/src/battle/move (or, for Z-Moves/Max Moves, a Battle::PowerMove class in web/src/battle/zud); their moves use Battle::Move::Unimplemented (status moves fail, damaging moves just deal damage). powerMoveCodesWithoutRubyClass: Power Move codes that have no class in Ruby either (Battle::PowerMove::Unimplemented in both).",
    totalCodes: codes.length,
    implementedCount: implemented.length,
    unknownCount: unknown.length,
    implemented,
    unknown: Object.fromEntries(unknown.map((c) => [c, moves.get(c)!])),
    powerMoveCodesWithoutRubyClass: Object.fromEntries(noClassInRuby.map((c) => [c, { moves: moves.get(c)!, why: NO_CLASS_IN_RUBY[c] }])),
  };
  if (process.env.UPDATE_REPORT || !existsSync(REPORT)) writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  expect(JSON.parse(readFileSync(REPORT, "utf8"))).toEqual(report);
});
