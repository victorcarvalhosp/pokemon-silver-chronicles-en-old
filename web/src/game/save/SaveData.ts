// Port of 002_Save data/001_SaveData.rb + 002_SaveData_Value.rb (+ the
// v20.1 Hotfixes' reset_on_new_game): a registry of named save values, each
// with save/load/new-game procs. Saves are versioned JSON in IndexedDB
// instead of a Marshal file; "Game" and "Game.bak" mirror Game.rxdata/.bak.

export interface SaveValue {
  id: string;
  /** Loaded at boot even before choosing Continue (options, system). */
  loadInBootup?: boolean;
  /** Reset to the new-game value when starting a new game (Hotfixes: stats). */
  resetOnNewGame?: boolean;
  save(): unknown;
  load(value: unknown): void;
  newGame?(): void;
}

export type SaveHash = Record<string, unknown>;

/** Bumped when the JSON layout changes in a way old saves need converting for. */
export const SAVE_FORMAT = 1;
const DB_NAME = "pokemon-silver-chronicles";
const STORE = "saves";
export const FILE_PATH = "Game";

const values: SaveValue[] = [];
const loaded = new Set<string>();

export const SaveData = {
  /** Adds a value; re-registering an id replaces it in place, keeping the load order. */
  register(value: SaveValue): void {
    const i = values.findIndex((v) => v.id === value.id);
    if (i >= 0) values[i] = value;
    else values.push(value);
  },

  unregister(id: string): void {
    const i = values.findIndex((v) => v.id === id);
    if (i >= 0) values.splice(i, 1);
  },

  compileSaveHash(): SaveHash {
    const hash: SaveHash = { __format: SAVE_FORMAT };
    for (const v of values) hash[v.id] = v.save();
    return hash;
  },

  /** SaveData.valid?: a hash with the values a game can't load without. */
  valid(hash: unknown): hash is SaveHash {
    if (!hash || typeof hash !== "object") return false;
    return Object.keys(REQUIRED).every((id) => id in (hash as SaveHash));
  },

  loadAllValues(hash: SaveHash): void {
    for (const v of values) {
      if (!(v.id in hash)) continue;
      v.load(hash[v.id]);
      loaded.add(v.id);
    }
  },

  loadBootupValues(hash: SaveHash): void {
    for (const v of values) {
      if (!v.loadInBootup || !(v.id in hash)) continue;
      v.load(hash[v.id]);
      loaded.add(v.id);
    }
  },

  initializeBootupValues(): void {
    for (const v of values) {
      if (v.loadInBootup && v.newGame) {
        v.newGame();
        loaded.add(v.id);
      }
    }
  },

  /** SaveData.load_new_game_values (with the Hotfixes' reset_on_new_game). */
  loadNewGameValues(): void {
    for (const v of values) {
      if (v.newGame && (!loaded.has(v.id) || v.resetOnNewGame)) {
        v.newGame();
        loaded.add(v.id);
      }
    }
  },

  markValuesAsUnloaded(): void {
    for (const v of values) if (!v.loadInBootup || v.resetOnNewGame) loaded.delete(v.id);
  },

  // --- storage ---------------------------------------------------------------

  async exists(path = FILE_PATH): Promise<boolean> {
    return (await idb("readonly", (s) => s.getKey(path))) !== undefined;
  },

  async readFromFile(path = FILE_PATH): Promise<SaveHash | null> {
    const text = (await idb("readonly", (s) => s.get(path))) as string | undefined;
    if (text == null) return null;
    try {
      return runConversions(JSON.parse(text) as SaveHash);
    } catch {
      return null;
    }
  },

  async saveToFile(path = FILE_PATH): Promise<void> {
    await SaveData.writeToFile(SaveData.compileSaveHash(), path);
  },

  /** Writes a save hash as it is (the load screen's language change rewrites the loaded one). */
  async writeToFile(hash: SaveHash, path = FILE_PATH): Promise<void> {
    await idb("readwrite", (s) => s.put(JSON.stringify(hash), path));
  },

  /** Copies the save to its backup (Essentials keeps Game.rxdata.bak). */
  async backup(path = FILE_PATH): Promise<void> {
    const text = await idb("readonly", (s) => s.get(path));
    if (text != null) await idb("readwrite", (s) => s.put(text, `${path}.bak`));
  },

  async deleteFile(): Promise<void> {
    await idb("readwrite", (s) => s.delete(FILE_PATH));
    await idb("readwrite", (s) => s.delete(`${FILE_PATH}.bak`));
  },

  /** The save as a downloadable file. */
  async exportFile(): Promise<Blob | null> {
    const text = (await idb("readonly", (s) => s.get(FILE_PATH))) as string | undefined;
    return text == null ? null : new Blob([text], { type: "application/json" });
  },

  /** Replaces the save with an exported file (the old one goes to the backup). */
  async importFile(file: Blob): Promise<boolean> {
    const text = await file.text();
    let hash: SaveHash;
    try {
      hash = JSON.parse(text) as SaveHash;
    } catch {
      return false;
    }
    if (!SaveData.valid(hash)) return false;
    await SaveData.backup();
    await idb("readwrite", (s) => s.put(text, FILE_PATH));
    return true;
  },
};

/** Values every save must contain (the rest may be missing in old saves). */
const REQUIRED: Record<string, true> = { player: true, map_factory: true, game_player: true };

/** Upgrades older JSON layouts in place (002_Save data/003_SaveData_Conversion.rb's role). */
function runConversions(hash: SaveHash): SaveHash {
  const format = Number(hash.__format ?? 0);
  if (format > SAVE_FORMAT) throw new Error("Save made by a newer version of the game");
  hash.__format = SAVE_FORMAT;
  return hash;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = op(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
