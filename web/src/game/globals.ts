// The game's global state, mirroring Essentials' $globals:
//   $PokemonSystem -> G.pokemonSystem   $game_temp -> G.gameTemp
//   $game_switches -> G.gameSwitches    $game_variables -> G.gameVariables
//   $game_self_switches -> G.gameSelfSwitches
//   $player -> G.player   $game_map -> G.gameMap   $game_player -> G.gamePlayer
//   $scene -> G.scene
// Classes that grow large live in their own modules and are assigned here.

import type { GameEvent } from "./GameEvent";
import type { GameScreen } from "./GameScreen";
import type { GameSystem } from "./GameSystem";
import type { PCItemStorage, PokemonBag } from "./items/PokemonBag";
import type { Mail } from "./pokemon/Mail";
import type { PokemonStorage } from "./pokemon/PokemonStorage";
import type { GameStats } from "./trainer/GameStats";

/** Port of PokemonSystem (016_UI/..._Options.rb): player settings. */
export class PokemonSystem {
  textspeed = 1; // 0 slow, 1 normal, 2 fast
  battlescene = 0;
  battlestyle = 1;
  sendtoboxes = 0;
  givenicknames = 0;
  frame = 0; // menu window frame (Settings::MENU_WINDOWSKINS)
  textskin = 0; // speech frame (Settings::SPEECH_WINDOWSKINS)
  screensize = 1;
  language = 0;
  runstyle = 1; // 0 walk, 1 run
  bgmvolume = 100;
  sevolume = 100;
  textinput = 0;
}

/** Port of PokemonGlobalMetadata (002_Save data): per-save overworld state. */
export class PokemonGlobalMetadata {
  bicycle = false;
  surfing = false;
  diving = false;
  sliding = false;
  fishing = false;
  bridge = 0;
  runningShoes = false;
  /** FollowerData of every follower (game/following/GameFollowerFactory.ts). */
  followers: unknown[] = [];
  // Following Pokemon EX (New Event Type/Misc.rb); game/following/FollowingPkmn.ts
  // has the accessors with the plugin's side effects (follower_toggled=, call_refresh).
  /** Whether the Following Pokémon has been toggled on. */
  followerToggled = false;
  /** Frames (at FRAME_RATE) the Following Pokémon has been behind the player. */
  timeTaken = 0;
  /** Whether the Following Pokémon is holding an item it found. */
  followerHoldItem = false;
  /** The Pokémon currently surfing / diving (Following Pokemon EX, game/field/followingFieldMoves.ts). */
  currentSurfing: unknown = null;
  currentDiving: unknown = null;
  /** A queued Following Pokémon refresh: [queued, animate, steps to wait]. */
  callRefresh: unknown[] = [false, false];
  /** [mapId, eventId] -> value (Interpreter#setVariable / pbSetEventTime). */
  eventvars: Record<string, unknown> = {};
  nextBattleBGM: unknown = null;
  pokecenterMapId = -1;
  pokecenterX = -1;
  pokecenterY = -1;
  pokecenterDirection = -1;
  escapePoint: number[] = [];
  /** Whether Flash lit up the current dark map. */
  flashUsed = false;
  /** [map, x, y] Teleport takes the player to (set on entering a map with a teleport destination). */
  healingSpot: number[] | null = null;
  visitedMaps: boolean[] = [];
  playerID = -1;
  /** The PC's item storage (created on first use, 019_UI_PC.rb). */
  pcItemStorage: PCItemStorage | null = null;
  /** Mail stored in the PC (pbMoveToMailbox). */
  mailbox: Mail[] | null = null;
}

/** What the rest of the game needs from PokemonMapFactory. */
export interface MapFactoryLike {
  areConnected(a: number, b: number): boolean;
}

/** What other systems need from Game_FollowerFactory ($game_temp.followers, game/following). */
export interface FollowerFactoryLike {
  readonly lastUpdate: number;
  /** each_follower: [event, FollowerData] pairs. */
  eachFollower(): [GameEvent, { direction: number }][];
  getFollowerByName(name: string): GameEvent | null;
  getFollowerByIndex(index?: number): GameEvent | null;
  moveFollowers(): void;
  turnFollowers(): void;
  mapTransferFollowers(): void;
  update(): Promise<void>;
}

let createFollowerFactory: (() => FollowerFactoryLike) | null = null;
/** Registers Game_FollowerFactory (game/following/index.ts). */
export function setFollowerFactoryClass(create: () => FollowerFactoryLike): void {
  createFollowerFactory = create;
}

/** Port of Game_Temp's fields used across systems (004_Game classes). */
export class GameTemp {
  private followers_: FollowerFactoryLike | null = null;
  private followersGlobal: PokemonGlobalMetadata | null = null;
  /**
   * $game_temp.followers: created on first use from $PokemonGlobal.followers.
   * Ruby keeps one for the whole session; here it's also rebuilt when
   * $PokemonGlobal is replaced (new game, loading a save after returning to
   * the title), which Ruby would otherwise carry over stale.
   */
  get followers(): FollowerFactoryLike | null {
    if (!this.followers_ || this.followersGlobal !== G.pokemonGlobal) {
      if (!createFollowerFactory) return null;
      this.followersGlobal = G.pokemonGlobal;
      this.followers_ = createFollowerFactory();
    }
    return this.followers_;
  }
  set followers(value: FollowerFactoryLike | null) {
    this.followers_ = value;
    this.followersGlobal = G.pokemonGlobal;
  }

  messageWindowShowing = false;
  inMenu = false;
  inBattle = false;
  /**
   * Following Pokemon EX (Refresh.rb:240-280): 1 once pbSetPokemonCenter queues
   * the Poké Center animation, 2 after Recover All put the follower away.
   */
  pokecenterFollowingPkmn = 0;
  playerTransferring = false;
  playerNewMapId = 0;
  playerNewX = 0;
  playerNewY = 0;
  playerNewDirection = 0;
  transitionProcessing = false;
  transitionName = "";
  menuCalling = false;
  menuBeep = false;
  commonEventId = 0;
  toTitle = false;
  encounterTriggered = false;
  inMiniUpdate = false;
  interactCalling = false;
  readyMenuCalling = false;
  debugCalling = false;
  titleScreenCalling = false;
  endingSurf = false;
  // Field moves (game/field)
  /** [map, x, y] chosen on the Fly map, or null. */
  flyDestination: [number, number, number] | null = null;
  /** [x, y] of the surf base while jumping on/off the water, or null. */
  surfBaseCoords: [number, number] | null = null;
  /** DarknessSprite on dark maps (game/field/DarknessSprite.ts), or null. */
  darknessSprite: { dispose(): void } | null = null;
  /** Following Pokemon EX: skip the follower's part of the field move animation. */
  noFollowerFieldMove = false;
  battlebackName = "";
  /** pbPushFade/pbPopFade depth. */
  fadestate = 0;
  begunNewGame = false;
  // Carmaniac's Speech Bubble (src/ui/speechBubble.ts)
  /** 0 none, 1 floating bubble, 2 speech bubble with arrow; consumed by the next message. */
  speechbubbleBubble = 0;
  speechbubbleVp: { dispose(): void } | null = null;
  speechbubbleArrow: { dispose(): void } | null = null;
  speechbubbleOutofrange = false;
  /** Event id of the speaker. */
  speechbubbleTalking: number | null = null;
  /** 0 default, 1 force top, 2 force bottom. */
  speechbubblePosition = 0;
  speechbubbleFollowerEvent: CharacterLike | null = null;
  /** In the Pokémon storage screen (forms that only change outside storage check it). */
  inStorage = false;
  // Map Zoom (src/game/weather/MapZoom.ts): the zoom and the windows it hides
  // while it snaps the screen. Only cmd_window is ever set in this game (the
  // speech bubble's pbCreateMessageWindow and DP Pause Menu replace the
  // plugin's versions that set the others).
  backgroundZoom: { update(): void; dispose(): void } | null = null;
  messageWindow: { visible: boolean } | null = null;
  cmdWindow: { visible: boolean } | null = null;
  pauseMenuScene: { pbShowMenu(): void; pbHideMenu(): void } | null = null;
  pauseMenuScreen: unknown = null;
  /** item -> [buy price, sell price] set by the Interpreter's setPrice/setSellPrice (-1 = default). */
  martPrices: Record<string, [number, number]> = {};
  clearMartPrices(): void { this.martPrices = {}; }
  // Essentials Deluxe ([002] Battle Deluxe/Battle_Deluxe.rb:8): deluxe battle
  // settings (see web/src/battle/deluxe/DeluxeTemp.ts).
  dxRules: Record<string, unknown> | null = null;
  dxPokemon: Record<string, unknown> | null = null;
  dxMidbattle: Record<string, unknown> | null = null;
}

export class GameSwitches {
  private data: boolean[] = [];
  get(id: number): boolean { return this.data[id] ?? false; }
  set(id: number, value: boolean): void { this.data[id] = value; }
  toJSON(): boolean[] { return this.data; }
  load(data: boolean[]): void { this.data = data; }
}

export class GameVariables {
  private data: unknown[] = [];
  get(id: number): unknown { return this.data[id] ?? 0; }
  set(id: number, value: unknown): void { this.data[id] = value; }
  toJSON(): unknown[] { return this.data; }
  load(data: unknown[]): void { this.data = data; }
}

export class GameSelfSwitches {
  private data = new Map<string, boolean>();
  private static key(mapId: number, eventId: number, ch: string) { return `${mapId},${eventId},${ch}`; }
  get(mapId: number, eventId: number, ch: string): boolean { return this.data.get(GameSelfSwitches.key(mapId, eventId, ch)) ?? false; }
  set(mapId: number, eventId: number, ch: string, value: boolean): void { this.data.set(GameSelfSwitches.key(mapId, eventId, ch), value); }
  toJSON(): [string, boolean][] { return [...this.data]; }
  load(data: [string, boolean][]): void { this.data = new Map(data); }
}

/** What other systems need from a map character (player, event, follower). */
export interface CharacterLike {
  id: number;
  x: number;
  y: number;
  direction: number;
  screenX(): number;
  screenY(): number;
  screenZ(height?: number): number;
}

/** What other systems need from the current map. */
export interface MapLike {
  mapId: number;
  events: Map<number, CharacterLike>;
}

/** Minimal trainer until the full Player/Trainer port lands. */
export interface TrainerLike {
  name: string;
  /** 0 male, 1 female (Essentials' player character gender). */
  gender: number;
  money: number;
}

export interface SceneLike {
  /** Scene_Map#miniupdate: keeps the map animating behind messages/menus. */
  miniupdate?(): Promise<void>;
  update?(): Promise<void>;
}

export const G = {
  pokemonSystem: new PokemonSystem(),
  gameTemp: new GameTemp(),
  gameSwitches: new GameSwitches(),
  gameVariables: new GameVariables(),
  gameSelfSwitches: new GameSelfSwitches(),
  player: null as TrainerLike | null,
  gameMap: null as MapLike | null,
  gamePlayer: null as CharacterLike | null,
  scene: null as SceneLike | null,
  // Assigned at boot by the modules that own these classes.
  gameSystem: null as unknown as GameSystem,
  gameScreen: null as unknown as GameScreen,
  pokemonGlobal: new PokemonGlobalMetadata(),
  mapFactory: null as unknown as MapFactoryLike,
  // Data model (assigned by save/modelValues.ts on new game / load).
  /** $bag */
  bag: null as unknown as PokemonBag,
  /** $PokemonStorage */
  storage: null as unknown as PokemonStorage,
  /** $stats */
  stats: null as unknown as GameStats,
};

/**
 * pbUpdateSceneMap (011_Messages.rb): updates the map scene while something
 * else has control, unless the screen is faded out (pbIsFaded?). Characters
 * don't move while G.gameTemp.inMenu; the map keeps animating behind menus.
 */
export async function pbUpdateSceneMap(): Promise<void> {
  if (G.gameTemp.fadestate <= 0) await G.scene?.miniupdate?.();
}
