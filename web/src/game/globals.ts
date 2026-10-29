// The game's global state, mirroring Essentials' $globals:
//   $PokemonSystem -> G.pokemonSystem   $game_temp -> G.gameTemp
//   $game_switches -> G.gameSwitches    $game_variables -> G.gameVariables
//   $game_self_switches -> G.gameSelfSwitches
//   $player -> G.player   $game_map -> G.gameMap   $game_player -> G.gamePlayer
//   $scene -> G.scene
// Classes that grow large live in their own modules and are assigned here.

import type { GameScreen } from "./GameScreen";
import type { GameSystem } from "./GameSystem";

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
  /** Partner trainers / followers (Following Pokémon EX keeps its own). */
  followers: unknown[] = [];
  /** [mapId, eventId] -> value (Interpreter#setVariable / pbSetEventTime). */
  eventvars: Record<string, unknown> = {};
  nextBattleBGM: unknown = null;
  pokecenterMapId = -1;
  pokecenterX = -1;
  pokecenterY = -1;
  pokecenterDirection = -1;
  escapePoint: number[] = [];
  visitedMaps: boolean[] = [];
  playerID = -1;
}

/** What the rest of the game needs from PokemonMapFactory. */
export interface MapFactoryLike {
  areConnected(a: number, b: number): boolean;
}

/** Port of Game_Temp's fields used across systems (004_Game classes). */
export class GameTemp {
  messageWindowShowing = false;
  inMenu = false;
  inBattle = false;
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
  battlebackName = "";
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
};

/** pbUpdateSceneMap (Essentials): updates the map scene while something else has control. */
export async function pbUpdateSceneMap(): Promise<void> {
  if (!G.gameTemp.inMenu) await G.scene?.miniupdate?.();
}
