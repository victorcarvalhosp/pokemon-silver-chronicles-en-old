// What the editors use instead of Ruby's `GameData::X.save` / `GameData::X.load`
// (001_GameData.rb): in Essentials the editors keep their edits in the loaded
// GameData, `save` writes Data/*.dat and the Compiler.write_* call rewrites the
// PBS file. Here the game reads web/data/pbs/*.json, compiled from PBS by
// `pnpm pbs`, so:
// - save: the edits stay in the loaded GameData (the game uses them at once)
//   and the PBS file is rewritten through the dev server; the compiled JSON
//   catches up at the next Compile Data / `pnpm pbs` (the same convention as
//   pbNewTrainer in game/trainer/loadAndNew.ts).
// - load: rereads the compiled JSON (web/data/pbs/<file>), dropping the edits.

import { GameData } from "../../data/gameData";
import { devWriteOrExplain } from "../devFiles";

type Reloadable = { DATA: Map<unknown, unknown>; register(hash: never): unknown };

/** The compiled file each GameData class is loaded from (GameData.loadAllFrom). */
const FILES: [Reloadable, string][] = [
  [GameData.Item as unknown as Reloadable, "items.json"],
  [GameData.Species as unknown as Reloadable, "species.json"],
  [GameData.SpeciesMetrics as unknown as Reloadable, "species-metrics.json"],
  [GameData.Encounter as unknown as Reloadable, "encounters.json"],
  [GameData.TrainerType as unknown as Reloadable, "trainer-types.json"],
  [GameData.Trainer as unknown as Reloadable, "trainers.json"],
  [GameData.PlayerMetadata as unknown as Reloadable, "player-metadata.json"],
  [GameData.MapMetadata as unknown as Reloadable, "map-metadata.json"],
];

/** Where reloads read the compiled data from (replaceable in tests). */
export const EditorDataSource = {
  async read(file: string): Promise<unknown> {
    const res = await fetch(`/data/pbs/${file}`);
    if (!res.ok) throw new Error(`Missing data/pbs/${file}; run pnpm pbs`);
    return res.json();
  },
};

/** GameData::X.load: rereads cls's compiled data, dropping unsaved edits. */
export async function gameDataLoad(cls: unknown): Promise<void> {
  const entry = FILES.find(([c]) => c === cls);
  if (!entry) throw new Error("No compiled file for this GameData class");
  const [klass, file] = entry;
  const list = (await EditorDataSource.read(file)) as unknown[];
  klass.DATA.clear();
  for (const h of list) klass.register(h as never);
}

/**
 * GameData::X.save + Compiler.write_x: the loaded data already holds the
 * edits; rewrites the PBS file(s) (`what` names them in the error message).
 */
export async function gameDataSave(what: string, write: () => Promise<void>): Promise<boolean> {
  return devWriteOrExplain(what, write);
}

/** sprintf("%03d", n) */
export function pad3(n: number): string {
  return n < 0 ? `-${String(-n).padStart(2, "0")}` : String(n).padStart(3, "0");
}

/** nil_or_empty?(string) */
export function nilOrEmpty(s: string | null | undefined): boolean {
  return s === null || s === undefined || s === "";
}

/** Ruby truthiness: only nil and false are false. */
export function rb(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/** Array#uniq + Array#compact */
export function uniqCompact<T>(arr: (T | null | undefined)[]): T[] {
  return [...new Set(arr)].filter((v): v is T => v !== null && v !== undefined);
}
