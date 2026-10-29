// Port of 016_UI/009_UI_RegionMap.rb (Town Map / Fly map: MapBottomSprite,
// PokemonRegionMap_Scene, PokemonRegionMapScreen, pbShowMap), with the
// plugins this game's version calls into:
//   8  Special Icons Map: draw_special_icons_position (Max Raid den icons).
//   12 Roaming Icon: draw_roaming_position (icons for roaming Pokémon).
// The map editor mode ($DEBUG: point renaming, saving town_map.txt) isn't
// ported; $DEBUG is off in the released game.
//
// pbMapScene moves the cursor by `8 * 20 / Graphics.frame_rate` px per frame:
// 160 px/s at the original 40 fps. Integer division at 60 Hz would give 2 px
// (120 px/s), so the cursor moves 160/60 px per tick and lands on the grid.

import { assetExists } from "../../core/assets";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { pbLoadTownMapData } from "../../data/gameData/miscPBSData";
import { Settings as GameSettings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { TrainerType } from "../../data/gameData/trainerType";
import type { TownMapPoint, TownMapRegion } from "../../data/pbs/types";
import { FRAME_RATE } from "../../game/GameCharacter";
import { pbPlayDecisionSE } from "../../game/GameSystem";
import { G } from "../../game/globals";
import type { Player } from "../../game/trainer/Player";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbDrawImagePositions, pbDrawTextPositions } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { FieldActions, flyTemp, MenuFlags, type FlyDestination } from "../menus/menuScreens";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbConfirmMessage, pbMessage } from "../messages";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundOrColoredPlane, pbGetMapNameFromId } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../SpriteWrapper";

const resolve = (path: string) => (assetExists(path) ? path : null);

/** Settings::REGION_MAP_EXTRAS: [region, switch, x, y, graphic, show on wall map] (none in this game). */
export const REGION_MAP_EXTRAS: [number, number, number, number, string, boolean][] = [];
/** Settings::CAN_FLY_FROM_TOWN_MAP */
export const CAN_FLY_FROM_TOWN_MAP = true;
/** Settings::FIELD_MOVES_COUNT_BADGES */
const FIELD_MOVES_COUNT_BADGES = true;

/**
 * Settings::ROAMING_SPECIES, the fields Roaming Icon reads: [species, level,
 * game switch]. (Roaming itself isn't ported; with no $PokemonGlobal.roamPosition
 * no icons show.)
 */
export const ROAMING_SPECIES: [string, number, number][] = [
  ["RATTATA", 5, 999],
  ["RATTATA", 5, 999],
  ["RATTATA", 5, 999],
  ["RATTATA", 5, 999],
  ["MEOWTH_2", 40, 752],
];

/** Special Icons Map's SPECIAL_ICONS. */
export const SPECIAL_ICONS: { name: string; switchOn: number; mapIndex: number; icon: string }[] = [
  { name: "Den 1", switchOn: 831, mapIndex: 156, icon: "den_red.png" },
  { name: "Den 2", switchOn: 832, mapIndex: 591, icon: "den_red.png" },
  { name: "Den 3", switchOn: 833, mapIndex: 525, icon: "den_red.png" },
  { name: "Den 4", switchOn: 834, mapIndex: 534, icon: "den_red.png" },
  { name: "Den 5", switchOn: 835, mapIndex: 537, icon: "den_red.png" },
  { name: "Den 6", switchOn: 836, mapIndex: 541, icon: "den_red.png" },
  { name: "Den 7", switchOn: 837, mapIndex: 544, icon: "den_red.png" },
  { name: "Den 8", switchOn: 838, mapIndex: 549, icon: "den_red.png" },
];

const player = () => G.player as unknown as Player;

/** $PokemonGlobal fields this file reads. */
interface MapGlobals {
  visitedMaps: boolean[];
  roamPosition?: Record<number, number> | null;
  roamPokemon?: unknown[] | null;
}
const globals = () => G.pokemonGlobal as unknown as MapGlobals;

/** $game_map.metadata */
export function currentMapMetadata(): MapMetadata | null {
  return G.gameMap ? MapMetadata.tryGet(G.gameMap.mapId) : null;
}

/** pbCheckHiddenMoveBadge(badge, showmsg) (012_Overworld/004_Overworld_FieldMoves.rb). */
async function pbCheckHiddenMoveBadge(badge = -1, showmsg = true): Promise<boolean> {
  if (FieldActions.checkHiddenMoveBadge) return FieldActions.checkHiddenMoveBadge(badge, showmsg);
  if (badge < 0) return true; // No badge requirement
  if (MenuFlags.DEBUG) return true;
  const p = player();
  if (FIELD_MOVES_COUNT_BADGES ? p.badgeCount() >= badge : p.badges[badge]) return true;
  if (showmsg) await pbMessage(_INTL("Sorry, a new Badge is required."));
  return false;
}

/** pbCanFly?(pkmn = nil, show_messages = false) */
export async function pbCanFly(pkmn: unknown = null, showMessages = false): Promise<boolean> {
  if (!(await pbCheckHiddenMoveBadge(GameSettings.BADGE_FOR_FLY, showMessages))) return false;
  if (!MenuFlags.DEBUG && !pkmn && !player().getPokemonWithMove("FLY")) return false;
  const gp = G.gamePlayer as unknown as { canMapTransferWithFollower?(): boolean } | null;
  if (gp?.canMapTransferWithFollower && !gp.canMapTransferWithFollower()) {
    if (showMessages) await pbMessage(_INTL("It can't be used when you have someone with you."));
    return false;
  }
  if (!currentMapMetadata()?.outdoorMap) {
    if (showMessages) await pbMessage(_INTL("You can't use that here."));
    return false;
  }
  return true;
}

//===============================================================================
//
//===============================================================================
export class MapBottomSprite extends Sprite {
  static readonly TEXT_MAIN_COLOR = new Color(248, 248, 248);
  static readonly TEXT_SHADOW_COLOR = new Color(0, 0, 0);
  private _mapname = "";
  private _maplocation = "";
  private _mapdetails = "";

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    pbSetSystemFont(this.bitmap!);
    this.refresh();
  }

  override dispose(): void {
    if (!this.isDisposed()) this.bitmap?.dispose();
    super.dispose();
  }

  get mapname(): string { return this._mapname; }
  set mapname(value: string) {
    if (this._mapname === value) return;
    this._mapname = value;
    this.refresh();
  }

  get maplocation(): string { return this._maplocation; }
  set maplocation(value: string) {
    if (this._maplocation === value) return;
    this._maplocation = value;
    this.refresh();
  }

  /** From Wichu */
  set mapdetails(value: string) {
    if (this._mapdetails === value) return;
    this._mapdetails = value;
    this.refresh();
  }

  refresh(): void {
    const bitmap = this.bitmap!;
    bitmap.clear();
    pbDrawTextPositions(bitmap, [
      [this._mapname, 18, 4, 0, MapBottomSprite.TEXT_MAIN_COLOR, MapBottomSprite.TEXT_SHADOW_COLOR],
      [this._maplocation, 18, 360, 0, MapBottomSprite.TEXT_MAIN_COLOR, MapBottomSprite.TEXT_SHADOW_COLOR],
      [this._mapdetails, Graphics.width - 16, 360, 1, MapBottomSprite.TEXT_MAIN_COLOR, MapBottomSprite.TEXT_SHADOW_COLOR],
    ]);
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonRegionMap_Scene {
  static readonly LEFT = 0;
  static readonly TOP = 0;
  static readonly RIGHT = 29;
  static readonly BOTTOM = 19;
  static readonly SQUARE_WIDTH = 16;
  static readonly SQUARE_HEIGHT = 16;

  private editor = false;
  private viewport!: Viewport;
  private sprites: Sprites = {};
  private mapData: (TownMapRegion | null)[] = [];
  private flyMap = false;
  private mode = 0;
  private map: TownMapRegion | null = null;
  private mapX = 0;
  private mapY = 0;
  private changed = false;

  constructor(private region = -1, private wallmap = true) {}

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  private mapBitmap(): Bitmap {
    return (this.sprites.map as IconSprite).bitmap!;
  }

  async pbStartScene(asEditor = false, flyMap = false): Promise<boolean> {
    const { LEFT, TOP, RIGHT, BOTTOM, SQUARE_WIDTH, SQUARE_HEIGHT } = PokemonRegionMap_Scene;
    this.editor = asEditor;
    this.sprites = {};
    this.mapData = pbLoadTownMapData();
    this.flyMap = flyMap;
    this.mode = flyMap ? 1 : 0;
    const mapMetadata = currentMapMetadata();
    const playerpos = mapMetadata ? mapMetadata.townMapPosition : null;
    let mapindex: number;
    if (!playerpos) {
      mapindex = 0;
      this.map = this.mapData[0] ?? null;
      this.mapX = LEFT;
      this.mapY = TOP;
    } else if (this.region >= 0 && this.region !== playerpos[0] && this.mapData[this.region]) {
      mapindex = this.region;
      this.map = this.mapData[this.region] ?? null;
      this.mapX = LEFT;
      this.mapY = TOP;
    } else {
      mapindex = playerpos[0];
      this.map = this.mapData[playerpos[0]] ?? null;
      this.mapX = playerpos[1];
      this.mapY = playerpos[2];
      const mapsize = mapMetadata!.townMapSize;
      if (mapsize && mapsize[0] && mapsize[0] > 0) {
        const sqwidth = mapsize[0];
        const sqheight = Math.ceil(mapsize[1].length / mapsize[0]);
        const gp = G.gamePlayer;
        const gm = G.gameMap as unknown as { width: number; height: number };
        if (sqwidth > 1) this.mapX += Math.floor(((gp?.x ?? 0) * sqwidth) / gm.width);
        if (sqheight > 1) this.mapY += Math.floor(((gp?.y ?? 0) * sqheight) / gm.height);
      }
    }
    if (!this.map) {
      await pbMessage(_INTL("The map data cannot be found."));
      return false;
    }
    const playerIcon = TrainerType.playerMapIconFilename(player().trainerType, resolve, player().outfit);
    await preloadBitmaps([
      "Graphics/Pictures/mapbg", `Graphics/Pictures/${this.map.filename}`, "Graphics/Pictures/mapFly", "Graphics/Pictures/mapCursor",
      ...REGION_MAP_EXTRAS.map((g) => `Graphics/Pictures/${g[4]}`),
      ...ROAMING_SPECIES.map((r) => this.getRoamingIcon(r[0])), ...SPECIAL_ICONS.map((i) => this.getSpecialIconPath(i.icon)),
      playerIcon,
    ].filter((f): f is string => !!f));
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    addBackgroundOrColoredPlane(this.sprites, "background", "mapbg", new Color(0, 0, 0), this.viewport);
    const map = new IconSprite(0, 0, this.viewport);
    this.sprites.map = map;
    map.setBitmapFile(`Graphics/Pictures/${this.map.filename}`);
    map.x += Math.floor((Graphics.width - map.bitmap!.width) / 2);
    map.y += Math.floor((Graphics.height - map.bitmap!.height) / 2);
    for (const graphic of REGION_MAP_EXTRAS) {
      if (graphic[0] !== mapindex || !this.locationShown(graphic)) continue;
      if (!this.sprites.map2) {
        const map2 = new BitmapSprite(480, 320, this.viewport);
        map2.x = map.x;
        map2.y = map.y;
        this.sprites.map2 = map2;
      }
      pbDrawImagePositions((this.sprites.map2 as BitmapSprite).bitmap!,
        [[`Graphics/Pictures/${graphic[4]}`, graphic[2] * SQUARE_WIDTH, graphic[3] * SQUARE_HEIGHT]]);
    }
    const mapbottom = new MapBottomSprite(this.viewport);
    this.sprites.mapbottom = mapbottom;
    mapbottom.mapname = this.map.name ?? ""; // pbGetMessage(MessageTypes::RegionNames, mapindex)
    mapbottom.maplocation = this.pbGetMapLocation(this.mapX, this.mapY);
    mapbottom.mapdetails = this.pbGetMapDetails(this.mapX, this.mapY);
    this.drawRoamingPosition(mapindex);
    this.drawSpecialIconsPosition(mapindex);
    if (playerpos && mapindex === playerpos[0]) {
      const p = new IconSprite(0, 0, this.viewport);
      this.sprites.player = p;
      p.setBitmapFile(playerIcon);
      p.x = this.pointXToScreenX(this.mapX);
      p.y = this.pointYToScreenY(this.mapY);
    }
    let k = 0;
    for (let i = LEFT; i <= RIGHT; i++) {
      for (let j = TOP; j <= BOTTOM; j++) {
        const healspot = this.pbGetHealingSpot(i, j);
        if (!healspot || !globals().visitedMaps[healspot[0]]) continue;
        const point = AnimatedSprite.create("Graphics/Pictures/mapFly", 2, 16, this.viewport);
        point.x = this.pointXToScreenX(i);
        point.y = this.pointYToScreenY(j);
        point.visible = this.mode === 1;
        point.play();
        this.sprites[`point${k}`] = point;
        k += 1;
      }
    }
    const cursor = AnimatedSprite.create("Graphics/Pictures/mapCursor", 2, 5, this.viewport);
    cursor.x = this.pointXToScreenX(this.mapX);
    cursor.y = this.pointYToScreenY(this.mapY);
    cursor.play();
    this.sprites.cursor = cursor;
    const help = new BitmapSprite(Graphics.width, 32, this.viewport);
    this.sprites.help = help;
    pbSetSystemFont(help.bitmap!);
    await this.refreshFlyScreen();
    this.changed = false;
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
    return true;
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  pointXToScreenX(x: number): number {
    const { SQUARE_WIDTH } = PokemonRegionMap_Scene;
    return Math.floor(-SQUARE_WIDTH / 2) + x * SQUARE_WIDTH + Math.floor((Graphics.width - this.mapBitmap().width) / 2);
  }

  pointYToScreenY(y: number): number {
    const { SQUARE_HEIGHT } = PokemonRegionMap_Scene;
    return Math.floor(-SQUARE_HEIGHT / 2) + y * SQUARE_HEIGHT + Math.floor((Graphics.height - this.mapBitmap().height) / 2);
  }

  locationShown(point: (typeof REGION_MAP_EXTRAS)[number]): boolean {
    if (this.wallmap) return point[5];
    return point[1] > 0 && G.gameSwitches.get(point[1]);
  }

  /** The point at (x, y), or null if it's hidden by its game switch. */
  private visiblePoint(x: number, y: number): TownMapPoint | "hidden" | null {
    if (!this.map?.points) return null;
    for (const point of this.map.points) {
      if (point.x !== x || point.y !== y) continue;
      const sw = point.switchId;
      if (sw != null && (this.wallmap || sw <= 0 || !G.gameSwitches.get(sw))) return "hidden";
      return point;
    }
    return null;
  }

  pbGetMapLocation(x: number, y: number): string {
    const point = this.visiblePoint(x, y);
    if (!point || point === "hidden") return "";
    return point.name; // pbGetMessageFromHash(MessageTypes::PlaceNames, point[2])
  }

  pbGetMapDetails(x: number, y: number): string {
    const point = this.visiblePoint(x, y);
    if (!point || point === "hidden") return "";
    return point.poi; // pbGetMessageFromHash(MessageTypes::PlaceDescriptions, point[3])
  }

  pbGetHealingSpot(x: number, y: number): FlyDestination | null {
    const point = this.visiblePoint(x, y);
    if (!point || point === "hidden") return null;
    return point.flyMapId != null && point.flyX != null && point.flyY != null ? [point.flyMapId, point.flyX, point.flyY] : null;
  }

  async refreshFlyScreen(): Promise<void> {
    if (this.flyMap || !CAN_FLY_FROM_TOWN_MAP || !(await pbCanFly())) return;
    const help = (this.sprites.help as BitmapSprite).bitmap!;
    help.clear();
    const text = this.mode === 0 ? _INTL("ACTION: Fly") : _INTL("ACTION: Cancel Fly");
    pbDrawTextPositions(help, [[text, Graphics.width - 16, 4, 1, new Color(248, 248, 248), new Color(0, 0, 0)]]);
    for (const [key, sprite] of Object.entries(this.sprites)) {
      if (!key.includes("point") || !(sprite instanceof AnimatedSprite)) continue;
      sprite.visible = this.mode === 1;
      sprite.frame = 0;
    }
  }

  async pbMapScene(): Promise<FlyDestination | null> {
    const { LEFT, TOP, RIGHT, BOTTOM, SQUARE_WIDTH, SQUARE_HEIGHT } = PokemonRegionMap_Scene;
    let xOffset = 0;
    let yOffset = 0;
    let newX = 0;
    let newY = 0;
    const distPerFrame = (8 * 20) / FRAME_RATE;
    const toward0 = (v: number) => (v > 0 ? Math.max(0, v - distPerFrame) : Math.min(0, v + distPerFrame));
    const cursor = this.sprites.cursor as AnimatedSprite;
    const mapbottom = this.sprites.mapbottom as MapBottomSprite;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (xOffset !== 0 || yOffset !== 0) {
        xOffset = toward0(xOffset);
        yOffset = toward0(yOffset);
        cursor.x = Math.round(newX - xOffset);
        cursor.y = Math.round(newY - yOffset);
        continue;
      }
      let ox = 0;
      let oy = 0;
      switch (Input.dir8()) {
        case 1: case 2: case 3:
          if (this.mapY < BOTTOM) oy = 1;
          break;
        case 7: case 8: case 9:
          if (this.mapY > TOP) oy = -1;
          break;
      }
      switch (Input.dir8()) {
        case 1: case 4: case 7:
          if (this.mapX > LEFT) ox = -1;
          break;
        case 3: case 6: case 9:
          if (this.mapX < RIGHT) ox = 1;
          break;
      }
      if (ox !== 0 || oy !== 0) {
        this.mapX += ox;
        this.mapY += oy;
        xOffset = ox * SQUARE_WIDTH;
        yOffset = oy * SQUARE_HEIGHT;
        newX = cursor.x + xOffset;
        newY = cursor.y + yOffset;
      }
      mapbottom.maplocation = this.pbGetMapLocation(this.mapX, this.mapY);
      mapbottom.mapdetails = this.pbGetMapDetails(this.mapX, this.mapY);
      if (Input.trigger(Input.BACK)) {
        // (The editor's "Save changes?" prompt isn't ported.)
        if (this.editor && this.changed) {
          if (await pbConfirmMessage(_INTL("Exit from the map?"), () => this.pbUpdate())) break;
        } else {
          break;
        }
      } else if (Input.trigger(Input.USE) && this.mode === 1) { // Choosing an area to fly to
        const healspot = this.pbGetHealingSpot(this.mapX, this.mapY);
        if (healspot && (globals().visitedMaps[healspot[0]] || (MenuFlags.DEBUG && Input.press(Input.CTRL)))) {
          if (this.flyMap) return healspot;
          const name = pbGetMapNameFromId(healspot[0]);
          if (await pbConfirmMessage(_INTL("Would you like to use Fly to go to {1}?", name), () => this.pbUpdate())) return healspot;
        }
      } else if (Input.trigger(Input.ACTION) && !this.wallmap && !this.flyMap && (await pbCanFly())) {
        pbPlayDecisionSE();
        this.mode = this.mode === 1 ? 0 : 1;
        await this.refreshFlyScreen();
      }
    }
    pbPlayCloseMenuSE();
    return null;
  }

  //-----------------------------------------------------------------------------
  // Roaming Icon (by FL)
  //-----------------------------------------------------------------------------
  drawRoamingPosition(mapindex: number): void {
    const { SQUARE_WIDTH, SQUARE_HEIGHT } = PokemonRegionMap_Scene;
    let iconIndex = 0;
    const g = globals();
    const roamPokemon = g.roamPokemon ?? [];
    for (const [key, map] of Object.entries(g.roamPosition ?? {})) {
      const idx = Number(key);
      const roamer = ROAMING_SPECIES[idx];
      if (!roamer) continue;
      const active = G.gameSwitches.get(roamer[2]) &&
        (roamPokemon.length <= idx || roamPokemon[idx] !== true) && player().seen(roamer[0]);
      if (!active) continue;
      const roamTownMapPos = MapMetadata.tryGet(map)?.townMapPosition;
      if (!roamTownMapPos) continue;
      if (mapindex !== roamTownMapPos[0]) continue;
      const x = roamTownMapPos[1];
      const y = roamTownMapPos[2];
      const icon = new IconSprite(0, 0, this.viewport);
      icon.setBitmapFile(this.getRoamingIcon(roamer[0]));
      icon.x = Math.floor(-SQUARE_WIDTH / 2) + x * SQUARE_WIDTH + Math.floor((Graphics.width - this.mapBitmap().width) / 2);
      icon.y = Math.floor(-SQUARE_HEIGHT / 2) + y * SQUARE_HEIGHT + Math.floor((Graphics.height - this.mapBitmap().height) / 2);
      this.sprites[`roaming${iconIndex}`] = icon;
      iconIndex += 1;
    }
  }

  getRoamingIcon(species: string): string | null {
    const speciesData = Species.tryGet(species);
    if (!speciesData) return null;
    const path = "Graphics/Pokemon/Map icons/";
    if (speciesData.form > 0) {
      const ret = resolve(`${path}${speciesData.species}_${speciesData.form}`);
      if (ret) return ret;
    }
    const ret = resolve(`${path}${speciesData.species}`);
    if (ret) return ret;
    return resolve(path + "000");
  }

  //-----------------------------------------------------------------------------
  // Special Icons Map (by victordevjs)
  //-----------------------------------------------------------------------------
  drawSpecialIconsPosition(mapindex: number): void {
    const { SQUARE_WIDTH, SQUARE_HEIGHT } = PokemonRegionMap_Scene;
    let iconIndex = 0;
    for (const iconConfig of SPECIAL_ICONS) {
      // Check if the switch is ON for this icon
      if (!G.gameSwitches.get(iconConfig.switchOn)) continue;
      const townMapPos = MapMetadata.tryGet(iconConfig.mapIndex)?.townMapPosition;
      if (!townMapPos) continue;
      // Only draw if this icon is on the current map being displayed
      if (mapindex !== townMapPos[0]) continue;
      const x = townMapPos[1];
      const y = townMapPos[2];
      const iconPath = this.getSpecialIconPath(iconConfig.icon);
      if (!iconPath) continue;
      const icon = new IconSprite(0, 0, this.viewport);
      icon.setBitmapFile(iconPath);
      icon.x = Math.floor(-SQUARE_WIDTH / 2) + x * SQUARE_WIDTH + Math.floor((Graphics.width - this.mapBitmap().width) / 2);
      icon.y = Math.floor(-SQUARE_HEIGHT / 2) + y * SQUARE_HEIGHT + Math.floor((Graphics.height - this.mapBitmap().height) / 2);
      this.sprites[`special_icon${iconIndex}`] = icon;
      iconIndex += 1;
    }
  }

  getSpecialIconPath(iconFilename: string): string | null {
    const path = "Graphics/Pictures/Pokegear/Map icons/";
    const ret = resolve(path + iconFilename);
    if (ret) return ret;
    // Fallback to default icon if specified icon doesn't exist
    return resolve(path + "000");
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonRegionMapScreen {
  constructor(private scene: PokemonRegionMap_Scene) {}

  async pbStartFlyScreen(): Promise<FlyDestination | null> {
    if (!(await this.scene.pbStartScene(false, true))) return null;
    const ret = await this.scene.pbMapScene();
    await this.scene.pbEndScene();
    return ret;
  }

  async pbStartScreen(): Promise<FlyDestination | null> {
    if (!(await this.scene.pbStartScene(MenuFlags.DEBUG))) return null;
    const ret = await this.scene.pbMapScene();
    await this.scene.pbEndScene();
    return ret;
  }
}

/** pbShowMap(region = -1, wallmap = true) */
export async function pbShowMap(region = -1, wallmap = true): Promise<void> {
  await pbFadeOutIn(async () => {
    const scene = new PokemonRegionMap_Scene(region, wallmap);
    const screen = new PokemonRegionMapScreen(scene);
    const ret = await screen.pbStartScreen();
    if (ret && !wallmap) flyTemp().flyDestination = ret;
  });
}
