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
  const implemented = codes.filter((c) => MoveClasses.has(moveClassNameForCode(c)));
  const unknown = codes.filter((c) => !MoveClasses.has(moveClassNameForCode(c)));
  const report = {
    note: "Move function codes (moves.json) without a Battle::Move class in web/src/battle/move; their moves use Battle::Move::Unimplemented (status moves fail, damaging moves just deal damage).",
    totalCodes: codes.length,
    implementedCount: implemented.length,
    unknownCount: unknown.length,
    implemented,
    unknown: Object.fromEntries(unknown.map((c) => [c, moves.get(c)!])),
  };
  if (process.env.UPDATE_REPORT || !existsSync(REPORT)) writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n");
  expect(JSON.parse(readFileSync(REPORT, "utf8"))).toEqual(report);
});
