// Shapes of the game data JSON files in web/data/ (see docs/data.md; first
// imported from the RPG Maker XP project by tools/convert/convert.rb).

import type { Command, MoveRoute } from "./events";

export interface AudioFile {
  name: string;
  volume: number;
  pitch: number;
}

export interface EventPage {
  condition: {
    switch1: number | null;
    switch2: number | null;
    variable: { id: number; atLeast: number } | null;
    selfSwitch: string | null;
  };
  graphic: {
    tileId: number;
    characterName: string;
    characterHue: number;
    direction: number;
    pattern: number;
    opacity: number;
    blendType: number;
  };
  moveType: number;
  moveSpeed: number;
  moveFrequency: number;
  moveRoute: MoveRoute;
  walkAnime: boolean;
  stepAnime: boolean;
  directionFix: boolean;
  through: boolean;
  alwaysOnTop: boolean;
  trigger: number;
  list: Command[];
}

export interface MapEvent {
  id: number;
  name: string;
  x: number;
  y: number;
  pages: EventPage[];
}

export interface MapData {
  id: number;
  name: string;
  tilesetId: number;
  width: number;
  height: number;
  autoplayBgm: boolean;
  bgm: AudioFile;
  autoplayBgs: boolean;
  bgs: AudioFile;
  encounterStep: number;
  /** layers[z][y][x] tile ids */
  layers: number[][][];
  events: MapEvent[];
}

export interface Tileset {
  id: number;
  name: string;
  tilesetName: string;
  autotileNames: string[];
  panoramaName: string;
  panoramaHue: number;
  fog: { name: string; hue: number; opacity: number; blendType: number; zoom: number; sx: number; sy: number };
  battlebackName: string;
  /** Indexed by tile id. */
  passages: number[];
  priorities: number[];
  terrainTags: number[];
}

export interface MapInfo {
  id: number;
  width: number;
  height: number;
  name: string;
  parentId: number;
  order: number;
  expanded: boolean;
  scrollX: number;
  scrollY: number;
}

export interface SystemData {
  startMapId: number;
  startX: number;
  startY: number;
  windowskinName: string;
  titleName: string;
  titleBgm: AudioFile;
  battleBgm: AudioFile;
  battleEndMe: AudioFile;
  gameoverMe: AudioFile;
  battleTransition: string;
  sounds: Record<string, AudioFile>;
  switches: Record<string, string>;
  variables: Record<string, string>;
  /** Switches named "s:...": an expression evaluated in the event's context. */
  scriptSwitches: Record<string, import("./events").Expr | { ruby: string }>;
}
