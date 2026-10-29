// Port of Data/Scripts/015_Trainers and player/004_Player.rb (Player < Trainer),
// with the fields this game's plugins add to it:
// - Essentials Deluxe: birthdate.
// - ZUD Mechanics: has_raid_database.
// - Social Links: social_links (a plugins/socialLinks SocialLinks) / bond_effects.
// - TC Wardrobe: outfit_unlocked, pbUnlockOutfit.
// - Mr. Gela's HGSS Trainer Card: score, stars, halloffame, tclass.
// - Apricorn To Ball: ball_for_apricorn(_count), next_run.

import type { Id } from "../../data/gameData/gameData";
import { Metadata } from "../../data/gameData/metadata";
import { PlayerMetadata } from "../../data/gameData/playerMetadata";
import { Settings } from "../../data/gameData/settings";
import { TrainerType } from "../../data/gameData/trainerType";
import { _INTL } from "../../data/gameData/gameData";
import { rand } from "../../core/random";
import { G } from "../globals";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import { SocialLinks, type SocialLinksJSON } from "../../plugins/socialLinks/player";
import { Pokedex, type PokedexJSON } from "./Pokedex";
import { Trainer, pbGetLanguage, randomTrainerID, type TrainerJSON } from "./Trainer";

/** TC Wardrobe's WardrobeConfig::OUTFITS. */
export const WARDROBE_OUTFITS = ["Basic Clothes", "Winter Clothes", "Rocket Uniform", "Kanto Clothes"];

export interface BondEffects {
  EXP: unknown[];
  Shiny: unknown[];
  CatchRate: unknown[];
}

export interface PlayerJSON extends TrainerJSON {
  characterID: number;
  outfit: number;
  badges: boolean[];
  money: number;
  coins: number;
  battlePoints: number;
  soot: number;
  pokedex: PokedexJSON;
  hasPokedex: boolean;
  hasPokegear: boolean;
  hasRunningShoes: boolean;
  hasBoxLink: boolean;
  seenStorageCreator: boolean;
  hasExpAll: boolean;
  mysteryGiftUnlocked: boolean;
  mysteryGifts: unknown[];
  birthdate: number | null;
  hasRaidDatabase: boolean;
  socialLinks: SocialLinksJSON | null;
  bondEffects: BondEffects | null;
  outfitUnlocked: string[];
  score: number | null;
  stars: number | null;
  halloffame: unknown[] | null;
  tclass: string | null;
  ballForApricorn: Id | null;
  ballForApricornCount: number | null;
  nextRun: unknown;
  hasSnagMachine?: boolean;
  seenPurifyChamber?: boolean;
}

export class Player extends Trainer {
  private _characterID = 0;
  private _outfit = 0;
  /** Gym badges (index = badge number). */
  badges: boolean[] = [];
  private _money = 0;
  private _coins = 0;
  private _battlePoints = 0;
  private _soot = 0;
  pokedex!: Pokedex;
  hasPokedex = false;
  hasPokegear = false;
  hasRunningShoes = false;
  hasBoxLink = false;
  seenStorageCreator = false;
  hasExpAll = false;
  // Shadow Pokémon (016_UI/022_UI_PurifyChamber.rb)
  hasSnagMachine = false;
  seenPurifyChamber = false;
  mysteryGiftUnlocked = false;
  mysteryGifts: unknown[] = [];
  // Essentials Deluxe (seconds since the epoch; null = $PokemonGlobal.startTime)
  private _birthdate: number | null = null;
  // ZUD Mechanics
  hasRaidDatabase = false;
  // Social Links
  socialLinks: SocialLinks | null = null;
  private _bondEffects: BondEffects | null = null;
  // TC Wardrobe
  outfitUnlocked: string[] = [];
  // Mr. Gela's HGSS Trainer Card
  private _score: number | null = null;
  private _stars: number | null = null;
  private _halloffame: unknown[] | null = null;
  private _tclass: string | null = null;
  // Apricorn To Ball
  ballForApricorn: Id | null = null;
  ballForApricornCount: number | null = null;
  nextRun: unknown = null;

  constructor(name: string, trainerType: Id) {
    super(name, trainerType);
    // --- Essentials ---
    this._characterID = 0;
    this._outfit = 0;
    this.badges = new Array<boolean>(8).fill(false);
    this._money = Metadata.get().startMoney;
    this._coins = 0;
    this._battlePoints = 0;
    this._soot = 0;
    this.pokedex = new Pokedex();
    this.hasPokedex = false;
    this.hasPokegear = false;
    this.hasRunningShoes = false;
    this.hasBoxLink = false;
    this.seenStorageCreator = false;
    this.hasExpAll = false;
    this.mysteryGiftUnlocked = false;
    this.mysteryGifts = [];
    // --- 022_UI_PurifyChamber.rb ---
    this.hasSnagMachine = false;
    this.seenPurifyChamber = false;
    // --- Social Links ---
    this.socialLinks = new SocialLinks();
    this._bondEffects = { EXP: [], Shiny: [], CatchRate: [] };
    // --- TC Wardrobe: calls Trainer#initialize a second time (new ID and language, empty party) ---
    this._trainerType = TrainerType.get(trainerType).id;
    this.name = name;
    this.id = randomTrainerID();
    this.language = pbGetLanguage();
    this.party = [];
    this.outfitUnlocked = [WARDROBE_OUTFITS[0]!];
    // --- ZUD Mechanics ---
    this.hasRaidDatabase = false;
  }

  /** character_ID: which player (metadata section) this is. Refreshes the charset when changed. */
  get characterID(): number { return this._characterID; }
  set characterID(value: number) {
    if (this._characterID === value) return;
    this._characterID = value;
    refreshCharset();
  }

  get outfit(): number { return this._outfit; }
  set outfit(value: number) {
    if (this._outfit === value) return;
    this._outfit = value;
    refreshCharset();
  }

  /** The player's trainer type comes from their player metadata. */
  override get trainerType(): Id { return PlayerMetadata.get(this._characterID || 1).trainerType!; }
  override set trainerType(value: Id) { this._trainerType = value; }

  get money(): number { return this._money; }
  set money(value: number) { this._money = clampInt(value, Settings.MAX_MONEY); }

  get coins(): number { return this._coins; }
  set coins(value: number) { this._coins = clampInt(value, Settings.MAX_COINS); }

  get battlePoints(): number { return this._battlePoints; }
  set battlePoints(value: number) { this._battlePoints = clampInt(value, Settings.MAX_BATTLE_POINTS); }

  get soot(): number { return this._soot; }
  set soot(value: number) { this._soot = clampInt(value, Settings.MAX_SOOT); }

  badgeCount(): number {
    return this.badges.filter((badge) => badge === true).length;
  }

  /** seen?(species) */
  seen(species: Id): boolean { return this.pokedex.seen(species); }
  /** owned?(species) */
  owned(species: Id): boolean { return this.pokedex.owned(species); }

  // --- Essentials Deluxe (Trainer Data.rb) ------------------------------------
  /** birthdate: set with setBirthdate, else $PokemonGlobal.startTime. */
  get birthdate(): Date {
    if (this._birthdate != null) return new Date(this._birthdate * 1000);
    const start = (G.pokemonGlobal as unknown as { startTime?: Date | number }).startTime;
    return start instanceof Date ? start : new Date(Number(start ?? 0) * 1000);
  }

  setBirthdate(day: number, month: number, year: number | null = null): void {
    if (year == null) year = new Date().getFullYear() - 1;
    this._birthdate = Math.floor(new Date(year, month - 1, day).getTime() / 1000);
  }

  /** is_anniversary?(date = nil) */
  isAnniversary(date: Date | null = null, now: Date = new Date()): boolean {
    const d = date ?? this.birthdate;
    return now.getDate() === d.getDate() && now.getMonth() === d.getMonth() && now.getFullYear() > d.getFullYear();
  }

  // --- Social Links (the logic is plugins/socialLinks/player.ts) -------------
  get bondEffects(): BondEffects {
    if (!this._bondEffects) this._bondEffects = { EXP: [], Shiny: [], CatchRate: [] };
    if (!this._bondEffects.CatchRate) this._bondEffects.CatchRate = [];
    return this._bondEffects;
  }
  set bondEffects(value: BondEffects) { this._bondEffects = value; }

  // --- TC Wardrobe --------------------------------------------------------------
  pbUnlockOutfit(outfitIndex: number): void {
    // NOTE (Ruby parity): Map003 calls pbUnlockOutfit(4), past the 4 outfits, which pushes nil.
    // null (not undefined) so it survives a save and is found by includes afterwards.
    const outfitUnlock = (WARDROBE_OUTFITS[outfitIndex] ?? null) as string;
    if (!this.outfitUnlocked.includes(outfitUnlock)) {
      this.outfitUnlocked.push(outfitUnlock);
      console.log(`Outfit ${outfitUnlock} Unlocked`);
    } else {
      console.log(`Outfit ${outfitUnlock} already unlocked`);
    }
  }

  // --- Mr. Gela's HGSS Trainer Card -----------------------------------------------
  get score(): number { return (this._score ??= 0); }
  set score(v: number) { this._score = v; }
  get stars(): number { return (this._stars ??= 0); }
  set stars(v: number) { this._stars = v; }
  get halloffame(): unknown[] { return (this._halloffame ??= []); }
  set halloffame(v: unknown[]) { this._halloffame = v; }
  get tclass(): string { return (this._tclass ??= "PKMN Trainer"); }
  set tclass(v: string) { this._tclass = v; }
  /** fullname2: "<class> <name>" (only a commented-out line of the card uses it). */
  fullname2(): string { return _INTL("{1} {2}", (G.player as unknown as Player).tclass, (G.player as unknown as Player).name); }
  /** getForeignID(number = nil): a random ID other than this Trainer's ID. */
  getForeignID(number: number | null = null): number {
    // NOTE (Ruby parity): Mr. Gela's HGSS Trainer Card Scene.rb:53 assigns
    // `number` and then the loop overwrites it, so it's ignored.
    let fid = 0;
    if (number != null) fid = number;
    for (;;) {
      fid = rand(256);
      fid |= rand(256) << 8;
      fid |= rand(256) << 16;
      fid = (fid | (rand(256) << 24)) >>> 0;
      if (fid !== this.id) break;
    }
    return fid;
  }
  /** setForeignID(other, number = nil) */
  setForeignID(other: Player, number: number | null = null): void {
    this.id = other.getForeignID(number);
  }

  //=============================================================================

  override toJSON(): PlayerJSON {
    return {
      ...super.toJSON(),
      characterID: this._characterID, outfit: this._outfit, badges: [...this.badges], money: this._money,
      coins: this._coins, battlePoints: this._battlePoints, soot: this._soot, pokedex: this.pokedex.toJSON(),
      hasPokedex: this.hasPokedex, hasPokegear: this.hasPokegear, hasRunningShoes: this.hasRunningShoes,
      hasBoxLink: this.hasBoxLink, seenStorageCreator: this.seenStorageCreator, hasExpAll: this.hasExpAll,
      mysteryGiftUnlocked: this.mysteryGiftUnlocked, mysteryGifts: JSON.parse(JSON.stringify(this.mysteryGifts)) as unknown[],
      birthdate: this._birthdate, hasRaidDatabase: this.hasRaidDatabase,
      socialLinks: this.socialLinks ? this.socialLinks.toJSON() : null,
      bondEffects: this._bondEffects ? JSON.parse(JSON.stringify(this._bondEffects)) as BondEffects : null,
      outfitUnlocked: [...this.outfitUnlocked], score: this._score, stars: this._stars,
      halloffame: this._halloffame ? JSON.parse(JSON.stringify(this._halloffame)) as unknown[] : null,
      tclass: this._tclass, ballForApricorn: this.ballForApricorn, ballForApricornCount: this.ballForApricornCount,
      nextRun: this.nextRun, hasSnagMachine: this.hasSnagMachine, seenPurifyChamber: this.seenPurifyChamber,
    };
  }

  static override fromJSON(json: PlayerJSON): Player {
    const p = Object.create(Player.prototype) as Player;
    p.loadJSON(json);
    p._characterID = json.characterID;
    p._outfit = json.outfit;
    p.badges = [...json.badges];
    p._money = json.money;
    p._coins = json.coins;
    p._battlePoints = json.battlePoints;
    p._soot = json.soot;
    p.pokedex = Pokedex.fromJSON(json.pokedex);
    p.hasPokedex = json.hasPokedex;
    p.hasPokegear = json.hasPokegear;
    p.hasRunningShoes = json.hasRunningShoes;
    p.hasBoxLink = json.hasBoxLink;
    p.seenStorageCreator = json.seenStorageCreator;
    p.hasExpAll = json.hasExpAll;
    p.mysteryGiftUnlocked = json.mysteryGiftUnlocked;
    // A Pokémon gift ([id, 0, pokemon, name]) is saved as the Pokémon's JSON (Pokemon#toJSON).
    p.mysteryGifts = (JSON.parse(JSON.stringify(json.mysteryGifts ?? [])) as unknown[]).map((g) =>
      (Array.isArray(g) && g[1] === 0 && g[2] && typeof g[2] === "object"
        ? [g[0], 0, Pokemon.fromJSON(g[2] as PokemonJSON), ...g.slice(3)] : g));
    p._birthdate = json.birthdate ?? null;
    p.hasRaidDatabase = json.hasRaidDatabase ?? false;
    p.socialLinks = json.socialLinks ? SocialLinks.fromJSON(json.socialLinks) : null;
    p._bondEffects = json.bondEffects ? JSON.parse(JSON.stringify(json.bondEffects)) as BondEffects : null;
    p.outfitUnlocked = [...(json.outfitUnlocked ?? [])];
    p._score = json.score ?? null;
    p._stars = json.stars ?? null;
    p._halloffame = json.halloffame ? JSON.parse(JSON.stringify(json.halloffame)) as unknown[] : null;
    p._tclass = json.tclass ?? null;
    p.ballForApricorn = json.ballForApricorn ?? null;
    p.ballForApricornCount = json.ballForApricornCount ?? null;
    p.nextRun = json.nextRun ?? null;
    p.hasSnagMachine = json.hasSnagMachine ?? false;
    p.seenPurifyChamber = json.seenPurifyChamber ?? false;
    return p;
  }
}

/** $game_player&.refresh_charset */
function refreshCharset(): void {
  (G.gamePlayer as unknown as { refreshCharset?(): void } | null)?.refreshCharset?.();
}

/** validate value => Integer, then clamp to 0..max. */
function clampInt(value: number, max: number): number {
  if (!Number.isInteger(value)) throw new TypeError(`Invalid value ${String(value)} given (expected Integer)`);
  return Math.min(Math.max(value, 0), max);
}
