// Registry of the screens and field actions the menus open (pause menu,
// Ready Menu). Their ports live elsewhere and register themselves here, e.g.
//
//   MenuScreens.party = async () => new PokemonPartyScreen(new PokemonParty_Scene(), G.player.party).pbPokemonScreen();
//
// Each entry is the body Essentials runs *inside* the menu's pbFadeOutIn
// (scene + screen + pbStartScreen); the menu does the fading, the follow-up
// (hidden move, key item, Fly) and the sprite hiding/showing exactly as the
// Ruby does. When an entry isn't registered the menu shows nothing and plays
// the buzzer.
//
// Also here: the defensive views of game state the menus read before the
// Player/Bag/Pokémon models are ported (G.bag, $PokemonGlobal fields, ...).

import { G } from "../../game/globals";

/** [pokemon, move] as returned by PokemonPartyScreen#pbPokemonScreen. */
export type HiddenMoveChoice = [unknown, string];
/** [map id, x, y] (Game_Temp#fly_destination). */
export type FlyDestination = [number, number, number];

/** What a menu needs from an icon sprite (PokemonIconSprite / ItemIconSprite). */
export interface MenuIconSprite {
  x: number;
  y: number;
  z: number;
  visible: boolean;
  update(): void;
  dispose(): void;
}

export const MenuScreens: {
  /** PokemonPokedexScreen#pbStartScreen (uses $PokemonGlobal.pokedexDex). */
  pokedex?: () => Promise<void>;
  /** PokemonPokedexMenuScreen#pbStartScreen (several dexes accessible). */
  pokedexMenu?: () => Promise<void>;
  /** PokemonPartyScreen.new(scene, $player.party).pbPokemonScreen: a hidden move to use, or null. */
  party?: () => Promise<HiddenMoveChoice | null>;
  /** PokemonBagScreen.new(scene, $bag).pbStartScreen: the item chosen to use in the field, or null. */
  bag?: () => Promise<string | null>;
  /** PokemonPokegearScreen#pbStartScreen (may set G.gameTemp.flyDestination). */
  pokegear?: () => Promise<void>;
  /** PokemonRegionMapScreen.new(PokemonRegionMap_Scene.new(-1, false)).pbStartScreen. */
  townMap?: () => Promise<unknown>;
  /** PokemonRegionMapScreen#pbStartFlyScreen: the Fly destination, or null. */
  flyMap?: () => Promise<FlyDestination | null>;
  /** PokemonTrainerCardScreen#pbStartScreen (Mr. Gela's HGSS Trainer Card in this game). */
  trainerCard?: () => Promise<void>;
  /** pbDebugMenu */
  debugMenu?: () => Promise<void>;
} = {};

/** Overworld functions the menus call after a screen returns. */
export const FieldActions: {
  /** pbUseHiddenMove(pokemon, move) */
  useHiddenMove?: (pkmn: unknown, move: string) => Promise<boolean>;
  /** pbCanUseHiddenMove?(pokemon, move, showmsg) */
  canUseHiddenMove?: (pkmn: unknown, move: string, showmsg: boolean) => boolean;
  /** pbConfirmUseHiddenMove(pokemon, move) */
  confirmUseHiddenMove?: (pkmn: unknown, move: string) => Promise<boolean>;
  /** HiddenMoveHandlers.hasHandler(move) */
  hasHiddenMoveHandler?: (move: string) => boolean;
  /** pbBadgeFromSkill(skill) (Improved Field Skills) */
  badgeFromSkill?: (skill: string) => number;
  /** pbCheckHiddenMoveBadge(badge, showmsg) */
  checkHiddenMoveBadge?: (badge: number, showmsg: boolean) => boolean;
  /** pbUseKeyItemInField(item): true if the item was used. */
  useKeyItemInField?: (item: string) => Promise<boolean>;
  /** ItemHandlers.triggerConfirmUseInField(item) */
  confirmUseInField?: (item: string) => Promise<boolean>;
  /** pbFlyToNewLocation: flies to G.gameTemp.flyDestination if set; true if it did. */
  flyToNewLocation?: () => Promise<boolean>;
  /** FollowingPkmn (Following Pokemon EX) for its Options entry. */
  followingPkmn?: { canCheck(): boolean; getEvent(): unknown; refresh(anim: boolean): void };
} = {};

/** Game data and icon sprites the Ready Menu draws. Defaults show the raw IDs and no icons. */
export const MenuData: {
  /** GameData::Move.exists?(move) */
  moveExists?: (move: string) => boolean;
  /** GameData::Move.get(move).name */
  moveName?: (move: string) => string;
  /** GameData::Item.get(item).name */
  itemName?: (item: string) => string;
  /** GameData::Item.get(item).is_important? */
  itemIsImportant?: (item: string) => boolean;
  /** ItemIconSprite.new(x, y, item, viewport) */
  itemIconSprite?: (x: number, y: number, item: string, viewport: import("../../rgss/display").Viewport | null) => MenuIconSprite;
  /** PokemonIconSprite.new(pokemon, viewport) with setOffset(PictureOrigin::CENTER) */
  pokemonIconSprite?: (pkmn: unknown, viewport: import("../../rgss/display").Viewport | null) => MenuIconSprite;
} = {};

/** $DEBUG: off, as in a released game (mkxp sets it only for editor test plays). */
export const MenuFlags = { DEBUG: false };

//===============================================================================
// Defensive views of models that aren't ported yet
//===============================================================================

/** The parts of PokemonBag ($bag) the menus read. */
export interface BagLike {
  registeredItems?: string[];
  /** [move index, item index, side (0 moves, 1 items)] */
  readyMenuSelection?: number[];
  has?(item: string, qty?: number): boolean;
  quantity?(item: string): number;
}

/** The parts of a Pokémon the Ready Menu reads. */
export interface PokemonLike {
  egg?: boolean | (() => boolean);
  isEgg?: boolean | (() => boolean);
  hasMove?(move: string): boolean;
  speciesData?: { hasSkill?(skill: string): boolean };
}

/** The parts of Player ($player) the menus read. */
export interface PlayerLike {
  name: string;
  hasPokedex?: boolean;
  hasPokegear?: boolean;
  hasRunningShoes?: boolean;
  party?: unknown[];
  pokedex?: { accessibleDexes?: number[] | (() => number[]) };
}

/** $PokemonGlobal fields the menus use (DP Pause Menu adds last_menu_index). */
export interface MenuGlobals {
  lastMenuIndex?: number | null;
  pokedexDex?: number;
  followerToggled?: boolean;
  safariState?: unknown;
  bugContestState?: unknown;
}

/** Game_Temp#fly_destination */
export interface FlyTemp {
  flyDestination?: FlyDestination | null;
}

export function menuBag(): BagLike | null {
  return ((G as unknown as { bag?: BagLike | null }).bag) ?? null;
}

export function menuPlayer(): PlayerLike | null {
  return (G.player as unknown as PlayerLike | null) ?? null;
}

export function menuGlobals(): MenuGlobals {
  return G.pokemonGlobal as unknown as MenuGlobals;
}

export function flyTemp(): FlyTemp {
  return G.gameTemp as unknown as FlyTemp;
}

export function bagHas(item: string): boolean {
  return menuBag()?.has?.(item) ?? false;
}

export function isEgg(pkmn: PokemonLike): boolean {
  const e = pkmn.egg ?? pkmn.isEgg;
  return typeof e === "function" ? e.call(pkmn) : !!e;
}
