// Port of Data/Scripts/014_Pokemon/001_Pokemon-related/004_PokemonStorage.rb
// (PokemonBox, PokemonStorage, pbEachPokemon...). RegionalStorage isn't
// ported (this game uses a single PokemonStorage).
//
// Box -1 is the player's party, as in Essentials. Ruby's storage[box] and
// storage[box, index] are get(box) / get(box, index); []= is set(box, index, pkmn).

import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { G } from "../globals";
import type { Player } from "../trainer/Player";
import { Pokemon, type PokemonJSON } from "./Pokemon";

const player = () => G.player as unknown as Player;

export interface PokemonBoxJSON {
  name: string;
  background: number;
  pokemon: (PokemonJSON | null)[];
}

export class PokemonBox {
  static readonly BOX_WIDTH = 6;
  static readonly BOX_HEIGHT = 5;
  static readonly BOX_SIZE = PokemonBox.BOX_WIDTH * PokemonBox.BOX_HEIGHT;

  readonly pokemon: (Pokemon | null)[];
  name: string;
  background: number;

  constructor(name: string, maxPokemon = PokemonBox.BOX_SIZE) {
    this.name = name;
    this.background = 0;
    this.pokemon = [];
    for (let i = 0; i < maxPokemon; i++) this.pokemon[i] = null;
  }

  get length(): number { return this.pokemon.length; }

  /** nitems: number of Pokémon in the box. */
  nitems(): number {
    let ret = 0;
    for (const pkmn of this.pokemon) if (pkmn != null) ret += 1;
    return ret;
  }

  /** full? */
  full(): boolean { return this.nitems() === this.length; }

  /** empty? */
  empty(): boolean { return this.nitems() === 0; }

  /** self[i] */
  get(i: number): Pokemon | null { return this.pokemon[i] ?? null; }

  /** self[i] = value */
  set(i: number, value: Pokemon | null): void { this.pokemon[i] = value; }

  each(): (Pokemon | null)[] { return [...this.pokemon]; }

  clear(): void { this.pokemon.length = 0; }

  toJSON(): PokemonBoxJSON {
    return { name: this.name, background: this.background, pokemon: this.pokemon.map((p) => (p ? p.toJSON() : null)) };
  }

  static fromJSON(json: PokemonBoxJSON): PokemonBox {
    const b = new PokemonBox(json.name, 0);
    b.background = json.background;
    for (const p of json.pokemon) b.pokemon.push(p ? Pokemon.fromJSON(p) : null);
    return b;
  }
}

export interface PokemonStorageJSON {
  boxes: PokemonBoxJSON[];
  currentBox: number;
  boxmode: number;
  unlockedWallpapers: (boolean | null)[];
}

export class PokemonStorage {
  static readonly BASICWALLPAPERQTY = 16;

  readonly boxes: PokemonBox[];
  currentBox: number;
  private boxmode: number;
  private _unlockedWallpapers: (boolean | null)[];

  constructor(maxBoxes = Settings.NUM_STORAGE_BOXES, maxPokemon = PokemonBox.BOX_SIZE) {
    this.boxes = [];
    for (let i = 0; i < maxBoxes; i++) {
      this.boxes[i] = new PokemonBox(_INTL("Box {1}", i + 1), maxPokemon);
      this.boxes[i]!.background = i % PokemonStorage.BASICWALLPAPERQTY;
    }
    this.currentBox = 0;
    this.boxmode = -1;
    this._unlockedWallpapers = [];
    for (let i = 0; i < this.allWallpapers().length; i++) this._unlockedWallpapers[i] = false;
  }

  allWallpapers(): string[] {
    return [
      // Basic wallpapers
      "Forest", "City", "Desert", "Savanna",
      "Crag", "Volcano", "Snow", "Cave",
      "Beach", "Seafloor", "River", "Sky",
      "Poké Center", "Machine", "Checks", "Simple",
      // Special wallpapers
      "Space", "Backyard", "Nostalgic 1", "Torchic",
      "Trio 1", "PikaPika 1", "Legend 1", "Team Galactic 1",
      "Distortion", "Contest", "Nostalgic 2", "Croagunk",
      "Trio 2", "PikaPika 2", "Legend 2", "Team Galactic 2",
      "Heart", "Soul", "Big Brother", "Pokéathlon",
      "Trio 3", "Spiky Pika", "Kimono Girl", "Revival",
    ];
  }

  get unlockedWallpapers(): (boolean | null)[] {
    if (!this._unlockedWallpapers) this._unlockedWallpapers = [];
    return this._unlockedWallpapers;
  }
  set unlockedWallpapers(value: (boolean | null)[]) { this._unlockedWallpapers = value; }

  /** isAvailableWallpaper?(i) */
  isAvailableWallpaper(i: number): boolean {
    if (!this._unlockedWallpapers) this._unlockedWallpapers = [];
    if (i < PokemonStorage.BASICWALLPAPERQTY) return true;
    if (this._unlockedWallpapers[i]) return true;
    return false;
  }

  /** [names, IDs] of the wallpapers the player can use. */
  availableWallpapers(): [string[], number[]] {
    const ret: [string[], number[]] = [[], []]; // Names, IDs
    const papers = this.allWallpapers();
    if (!this._unlockedWallpapers) this._unlockedWallpapers = [];
    papers.forEach((paper, i) => {
      if (!this.isAvailableWallpaper(i)) return;
      ret[0].push(paper);
      ret[1].push(i);
    });
    return ret;
  }

  /** The player's party ($player.party). */
  get party(): Pokemon[] { return player().party; }
  set party(_value: Pokemon[]) { throw new Error("Not supported"); }

  /** party_full? */
  partyFull(): boolean { return player().partyFull(); }

  maxBoxes(): number { return this.boxes.length; }

  /** maxPokemon(box): slots in that box (box -1 = party). */
  maxPokemon(box: number): number {
    if (box >= this.maxBoxes()) return 0;
    return box < 0 ? Settings.MAX_PARTY_SIZE : this.boxes[box]!.length;
  }

  /** full?: every box is full. */
  full(): boolean {
    for (let i = 0; i < this.maxBoxes(); i++) if (!this.boxes[i]!.full()) return false;
    return true;
  }

  pbFirstFreePos(box: number): number {
    if (box === -1) {
      const ret = this.party.length;
      return ret >= Settings.MAX_PARTY_SIZE ? -1 : ret;
    }
    for (let i = 0; i < this.maxPokemon(box); i++) if (!this.get(box, i)) return i;
    return -1;
  }

  /** self[x] (a box, or the party for -1) and self[x, y] (a Pokémon). */
  get(x: number): PokemonBox | Pokemon[];
  get(x: number, y: number): Pokemon | null;
  get(x: number, y?: number): PokemonBox | Pokemon[] | Pokemon | null {
    if (y == null) return x === -1 ? this.party : this.boxes[x]!;
    return x === -1 ? (this.party[y] ?? null) : this.boxes[x]!.get(y);
  }

  /** self[x, y] = value */
  set(x: number, y: number, value: Pokemon | null): void {
    if (x === -1) (this.party as (Pokemon | null)[])[y] = value;
    else this.boxes[x]!.set(y, value);
  }

  pbCopy(boxDst: number, indexDst: number, boxSrc: number, indexSrc: number): boolean {
    if (indexDst < 0 && boxDst < this.maxBoxes()) {
      let found = false;
      for (let i = 0; i < this.maxPokemon(boxDst); i++) {
        if (this.get(boxDst, i)) continue;
        found = true;
        indexDst = i;
        break;
      }
      if (!found) return false;
    }
    if (boxDst === -1) { // Copying into party
      if (this.partyFull()) return false;
      (this.party as (Pokemon | null)[])[this.party.length] = this.get(boxSrc, indexSrc);
      compact(this.party as (Pokemon | null)[]);
    } else { // Copying into box
      const pkmn = this.get(boxSrc, indexSrc);
      if (!pkmn) throw new Error("Trying to copy nil to storage");
      if (Settings.HEAL_STORED_POKEMON) {
        const oldReadyEvo = pkmn.readyToEvolve;
        pkmn.heal();
        pkmn.readyToEvolve = oldReadyEvo;
      }
      this.set(boxDst, indexDst, pkmn);
    }
    return true;
  }

  pbMove(boxDst: number, indexDst: number, boxSrc: number, indexSrc: number): boolean {
    if (!this.pbCopy(boxDst, indexDst, boxSrc, indexSrc)) return false;
    this.pbDelete(boxSrc, indexSrc);
    return true;
  }

  pbMoveCaughtToParty(pkmn: Pokemon): boolean {
    if (this.partyFull()) return false;
    this.party[this.party.length] = pkmn;
    return true;
  }

  pbMoveCaughtToBox(pkmn: Pokemon, box: number): boolean {
    for (let i = 0; i < this.maxPokemon(box); i++) {
      if (this.get(box, i) != null) continue;
      if (Settings.HEAL_STORED_POKEMON && box >= 0) {
        const oldReadyEvo = pkmn.readyToEvolve;
        pkmn.heal();
        pkmn.readyToEvolve = oldReadyEvo;
      }
      this.set(box, i, pkmn);
      return true;
    }
    return false;
  }

  /** pbStoreCaught(pkmn): puts it in the current box or the next with space; returns the box, or -1. */
  pbStoreCaught(pkmn: Pokemon): number {
    if (Settings.HEAL_STORED_POKEMON && this.currentBox >= 0) {
      const oldReadyEvo = pkmn.readyToEvolve;
      pkmn.heal();
      pkmn.readyToEvolve = oldReadyEvo;
    }
    for (let i = 0; i < this.maxPokemon(this.currentBox); i++) {
      if (this.get(this.currentBox, i) == null) {
        this.set(this.currentBox, i, pkmn);
        return this.currentBox;
      }
    }
    for (let j = 0; j < this.maxBoxes(); j++) {
      for (let i = 0; i < this.maxPokemon(j); i++) {
        if (this.get(j, i) != null) continue;
        this.set(j, i, pkmn);
        this.currentBox = j;
        return this.currentBox;
      }
    }
    return -1;
  }

  pbDelete(box: number, index: number): void {
    if (this.get(box, index)) {
      this.set(box, index, null);
      if (box === -1) compact(this.party as (Pokemon | null)[]);
    }
  }

  clear(): void {
    for (let i = 0; i < this.maxBoxes(); i++) this.boxes[i]!.clear();
  }

  toJSON(): PokemonStorageJSON {
    return {
      boxes: this.boxes.map((b) => b.toJSON()), currentBox: this.currentBox, boxmode: this.boxmode,
      unlockedWallpapers: [...this._unlockedWallpapers],
    };
  }

  static fromJSON(json: PokemonStorageJSON): PokemonStorage {
    const s = Object.create(PokemonStorage.prototype) as PokemonStorage;
    (s as { boxes: PokemonBox[] }).boxes = json.boxes.map((b) => PokemonBox.fromJSON(b));
    s.currentBox = json.currentBox;
    s.boxmode = json.boxmode;
    s._unlockedWallpapers = [...json.unlockedWallpapers];
    return s;
  }
}

/** Array#compact! */
function compact<T>(a: (T | null | undefined)[]): void {
  let w = 0;
  for (let r = 0; r < a.length; r++) if (a[r] != null) a[w++] = a[r];
  a.length = w;
}

const storage = () => (G as unknown as { storage: PokemonStorage }).storage;

export function pbUnlockWallpaper(index: number): void {
  storage().unlockedWallpapers[index] = true;
}

/** Don't know why you'd want to do this. */
export function pbLockWallpaper(index: number): void {
  storage().unlockedWallpapers[index] = false;
}

/** pbEachPokemon: every Pokémon in the party (box -1) and the boxes, as [pkmn, box]. */
export function pbEachPokemon(): [Pokemon, number][] {
  const ret: [Pokemon, number][] = [];
  const s = storage();
  for (let i = -1; i < s.maxBoxes(); i++) {
    for (let j = 0; j < s.maxPokemon(i); j++) {
      const container = s.get(i);
      const pkmn = Array.isArray(container) ? container[j] : container.get(j);
      if (pkmn) ret.push([pkmn, i]);
    }
  }
  return ret;
}

/** pbEachNonEggPokemon */
export function pbEachNonEggPokemon(): [Pokemon, number][] {
  return pbEachPokemon().filter(([pkmn]) => !pkmn.egg());
}
