// Test helper: GameData.load_all from web/data/pbs/*.json on disk (Node only).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { GameData } from "./index";

const PBS_DIR = resolve(import.meta.dirname, "../../../data/pbs");
let loaded = false;

/** Loads the compiled PBS data once per test file. */
export function loadGameDataForTests(): void {
  if (loaded) return;
  GameData.loadAllFrom((file) => JSON.parse(readFileSync(join(PBS_DIR, file), "utf8")) as unknown);
  loaded = true;
}
