// Port of Plugins/Social Links/001_Data.rb: SocialLinkProfile (a Social Link
// the player has, saved in $player.social_links) and GameData::SocialLinkProfile
// (the profiles 002_Configuration.rb registers; there's no PBS file for them,
// so there's nothing to compile or load).
//
// Ruby symbols (profile ids, species, types, effect types) are strings here.

import { MessageTypes, _INTL, pbGetMessageFromHash } from "../../core/intl";
import type { Id } from "../../data/gameData/gameData";
import { TrainerType } from "../../data/gameData/trainerType";
import { pbGetTimeNow } from "../../game/dayNight";
import { G } from "../../game/globals";
import { pbNormalizeStringForMatching } from "./normalize";
import { SocialLinkSettings } from "./settings";

/** :favorite_pokemon: a species, or [species, gender (0 male, 1 female), form, shiny?]. */
export type FavoritePokemon = Id | [Id, (number | null)?, (number | null)?, (boolean | null)?];
/** A :bond_effects entry: [:EXP / :Shiny / :CatchRate, type, rate (nil = the default)]. */
export type BondEffectDef = [string, Id, number | null | undefined];
type Coords = [number, number];

/** A $PokemonGlobal.phoneNumbers entry (NPCs have 4 elements, trainers 8). */
export type PhoneNumber = [boolean, string | number, string, number, ...unknown[]];

/** The hash GameData::SocialLinkProfile.register takes (Ruby's keys, camelCased). */
export interface SocialLinkProfileHash {
  id: Id;
  name?: string;
  image?: string;
  initBond?: number;
  initLocation?: string;
  initStatus?: string;
  favoritePokemon?: FavoritePokemon | null;
  imContactId?: Id | null;
  staticStatusPool?: string[];
  randomStatusPool?: [string, (number | null)?][];
  /** bond level => effects; kept in the hash's order (a Map, or an object's/array's entries). */
  bondEffects?: Map<number, BondEffectDef[]> | Record<number, BondEffectDef[]> | [number, BondEffectDef[]][];
  bondMax?: number;
  bondIconCoords?: (Coords | null)[] | null;
  momentsMax?: number | number[];
  // The Free Market plugin's buyer data (not in this game; stored as-is).
  buyerBondReq?: unknown;
  cantBuyLots?: unknown;
  canBuyCondition?: unknown;
  currencyBudgets?: unknown;
  onlyUseBudgets?: unknown;
  preferredItems?: unknown;
  unpreferredItems?: unknown;
  preferredPriceRange?: unknown;
  unpreferredPriceRange?: unknown;
  scoreAdjustment?: unknown;
  buyerPersonality?: unknown;
  afterPurchase?: unknown;
}

//===============================================================================
// GameData::SocialLinkProfile
//===============================================================================
export class GameDataSocialLinkProfile {
  readonly id: Id;
  readonly name: string;
  readonly image: string;
  readonly initBond: number;
  readonly initLocation: string;
  readonly initStatus: string;
  readonly favoritePokemon: FavoritePokemon | null;
  readonly imContactId: Id | null;
  readonly staticStatusPool: string[];
  readonly randomStatusPool: [string, (number | null)?][];
  readonly bondEffects: Map<number, BondEffectDef[]>;
  readonly bondMax: number;
  readonly bondIconCoords: (Coords | null)[] | null;
  readonly momentsMax: number | number[];
  readonly freeMarketData: Record<string, unknown>;

  static readonly DATA = new Map<Id, GameDataSocialLinkProfile>();

  static register(hash: SocialLinkProfileHash): void {
    this.DATA.set(hash.id, new GameDataSocialLinkProfile(hash));
  }

  static exists(other: Id | GameDataSocialLinkProfile | null | undefined): boolean {
    if (other == null) return false;
    return this.DATA.has(other instanceof GameDataSocialLinkProfile ? other.id : other);
  }

  static get(other: Id | GameDataSocialLinkProfile): GameDataSocialLinkProfile {
    if (other instanceof GameDataSocialLinkProfile) return other;
    const ret = this.DATA.get(other);
    if (!ret) throw new Error(`Unknown ID ${other}.`);
    return ret;
  }

  static tryGet(other: Id | GameDataSocialLinkProfile | null | undefined): GameDataSocialLinkProfile | null {
    if (other == null) return null;
    if (other instanceof GameDataSocialLinkProfile) return other;
    return this.DATA.get(other) ?? null;
  }

  static keys(): Id[] { return [...this.DATA.keys()]; }

  /** Yields all data in the order they were defined. */
  static each(): IterableIterator<GameDataSocialLinkProfile> { return this.DATA.values(); }

  constructor(hash: SocialLinkProfileHash) {
    this.id = hash.id;
    this.name = hash.name || "???";
    this.image = hash.image || "default";
    this.initBond = hash.initBond || 0;
    this.initLocation = hash.initLocation || "???";
    this.initStatus = hash.initStatus || "";
    this.favoritePokemon = hash.favoritePokemon || null;
    this.imContactId = hash.imContactId || null;
    this.staticStatusPool = hash.staticStatusPool || [];
    this.randomStatusPool = hash.randomStatusPool || [];
    const effects = hash.bondEffects;
    this.bondEffects = effects instanceof Map ? effects
      : new Map(Array.isArray(effects) ? effects : Object.entries(effects ?? {}).map(([k, v]) => [Number(k), v] as [number, BondEffectDef[]]));
    this.bondMax = hash.bondMax || SocialLinkSettings.BOND_LEVEL_MAX;
    this.bondIconCoords = hash.bondIconCoords || null;
    this.momentsMax = hash.momentsMax || SocialLinkSettings.MOMENTS_COUNT_MAX;
    this.freeMarketData = {
      buyerBondReq: hash.buyerBondReq ?? null,
      cantBuyLots: hash.cantBuyLots ?? null,
      canBuyCondition: hash.canBuyCondition ?? null,
      currencyBudgets: hash.currencyBudgets ?? null,
      onlyUseBudgets: hash.onlyUseBudgets ?? null,
      preferredItems: hash.preferredItems ?? null,
      unpreferredItems: hash.unpreferredItems ?? null,
      preferredPriceRange: hash.preferredPriceRange ?? null,
      unpreferredPriceRange: hash.unpreferredPriceRange ?? null,
      scoreAdjustment: hash.scoreAdjustment ?? null,
      buyerPersonality: hash.buyerPersonality ?? null,
      afterPurchase: hash.afterPurchase ?? null,
    };
  }
}

/** $PokemonGlobal.phoneNumbers as it is (nil until the first contact is registered). */
export function rawPhoneNumbers(): PhoneNumber[] | null {
  return (G.pokemonGlobal as unknown as { phoneNumbers?: PhoneNumber[] | null }).phoneNumbers ?? null;
}

/**
 * The names a trainer contact (an 8-element entry) is known by: "<trainer
 * type name> <name>" and just the name (as phone_contact and
 * pbAddSocialLinksFromPhone build them).
 */
export function phoneTrainerNames(num: PhoneNumber): [string, string] {
  const trainerTypeName = TrainerType.get(num[1] as Id).name;
  const trainerName = pbGetMessageFromHash(MessageTypes.TrainerNames, num[2]);
  // Remove gender/variant suffix from trainer type (e.g., "Cool Trainer_Male" -> "Cool Trainer")
  const trainerTypeBase = (trainerTypeName.split("_")[0] ?? "").trim();
  // Build full name with base trainer type
  return [_INTL("{1} {2}", trainerTypeBase, trainerName), trainerName];
}

export interface SocialLinkProfileJSON {
  id: Id;
  name: string;
  image: string;
  currentLocation: string;
  currentStatus: string;
  pastStatuses: string[];
  bond: number;
  moments: number;
  favoritePokemon: FavoritePokemon | null;
  imContactId: Id | null;
  /** Milliseconds since the epoch (Ruby: a Time). */
  timeAdded: number;
  favorite: boolean;
}

//===============================================================================
// SocialLinkProfile: a Social Link the player has
//===============================================================================
export class SocialLinkProfile {
  id!: Id;
  name!: string;
  image!: string;
  currentLocation!: string;
  private _currentStatus!: string;
  pastStatuses!: string[];
  bond!: number;
  moments!: number;
  favoritePokemon!: FavoritePokemon | null;
  imContactId!: Id | null;
  timeAdded!: number;
  favorite!: boolean;

  constructor(id: Id) {
    const data = GameDataSocialLinkProfile.get(id);
    this.id = data.id;
    this.name = data.name;
    this.image = data.image;
    this.bond = data.initBond;
    this.moments = 0;
    this.currentLocation = data.initLocation;
    this._currentStatus = data.initStatus;
    this.pastStatuses = [];
    // NOTE (Ruby parity): the same object as the GameData's (001_Data.rb:30), so
    // pbSetLinkPokemon replaces it rather than editing it; nothing edits it in place.
    this.favoritePokemon = data.favoritePokemon;
    this.imContactId = data.imContactId;
    this.timeAdded = pbGetTimeNow().getTime();
    this.favorite = false;
  }

  /** current_status: a placeholder when there's none. */
  get currentStatus(): string {
    if (this._currentStatus === "") return _INTL("<i>{1} hasn't posted a recent status.</i>", this.name);
    return this._currentStatus;
  }
  set currentStatus(value: string) { this._currentStatus = value; }
  /** @current_status itself. */
  get rawCurrentStatus(): string { return this._currentStatus; }

  /**
   * toggle_favorite(val = nil). NOTE (Ruby parity, 001_Data.rb:39-42): `val`
   * is set and then toggled too, so toggle_favorite(true) unfavourites.
   */
  toggleFavorite(val: boolean | null = null): boolean {
    if (val != null) this.favorite = val;
    this.favorite = !this.favorite;
    return this.favorite;
  }

  get bondMax(): number {
    return GameDataSocialLinkProfile.get(this.id).bondMax || SocialLinkSettings.BOND_LEVEL_MAX;
  }

  get bondIconCoords(): (Coords | null)[] | null {
    return GameDataSocialLinkProfile.get(this.id).bondIconCoords;
  }

  get momentsMax(): number {
    const max = GameDataSocialLinkProfile.get(this.id).momentsMax || SocialLinkSettings.MOMENTS_COUNT_MAX;
    if (Array.isArray(max)) return max.at(this.bond) ?? max.at(-1)!; // (Ruby indexes, negative ones too)
    return max;
  }

  hasPhoneContact(): boolean {
    return this.phoneContact() != null;
  }

  /** The visible phone contact whose name matches this Social Link's (first match). */
  phoneContact(): PhoneNumber | null {
    const numbers = rawPhoneNumbers();
    if (!numbers) return null;
    // Normalize this Social Link's name for matching
    const myNameNormalized = pbNormalizeStringForMatching(this.name);
    // Search for a phone contact matching this Social Link's name
    for (const num of numbers) {
      if (!num[0]) continue; // Skip if not visible
      if (num.length === 8) {
        // Trainers: "TrainerType TrainerName" or just "TrainerName" (normalized)
        const [fullName, trainerName] = phoneTrainerNames(num);
        if (myNameNormalized === pbNormalizeStringForMatching(fullName) || myNameNormalized === pbNormalizeStringForMatching(trainerName)) {
          return num;
        }
      } else if (myNameNormalized === pbNormalizeStringForMatching(num[2])) {
        // For NPCs, match the name directly (normalized)
        return num;
      }
    }
    return null;
  }

  toJSON(): SocialLinkProfileJSON {
    return {
      id: this.id, name: this.name, image: this.image, currentLocation: this.currentLocation,
      currentStatus: this._currentStatus, pastStatuses: [...this.pastStatuses], bond: this.bond, moments: this.moments,
      favoritePokemon: this.favoritePokemon == null ? null : (JSON.parse(JSON.stringify(this.favoritePokemon)) as FavoritePokemon),
      imContactId: this.imContactId, timeAdded: this.timeAdded, favorite: this.favorite,
    };
  }

  static fromJSON(json: SocialLinkProfileJSON): SocialLinkProfile {
    const p = Object.create(SocialLinkProfile.prototype) as SocialLinkProfile;
    p.id = json.id;
    p.name = json.name;
    p.image = json.image;
    p.currentLocation = json.currentLocation;
    p._currentStatus = json.currentStatus ?? "";
    p.pastStatuses = [...(json.pastStatuses ?? [])];
    p.bond = json.bond;
    p.moments = json.moments;
    p.favoritePokemon = json.favoritePokemon ?? null;
    p.imContactId = json.imContactId ?? null;
    p.timeAdded = json.timeAdded;
    p.favorite = !!json.favorite;
    return p;
  }
}
