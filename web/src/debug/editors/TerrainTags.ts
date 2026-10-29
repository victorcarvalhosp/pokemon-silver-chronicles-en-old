// Port of Data/Scripts/020_Debug/001_Editor screens/002_EditorScreens_TerrainTags.rb:
// the Tileset editor (Debug menu > Editors > Edit Terrain Tags). Registers
// EditorScreens.pbTilesetScreen.
//
// Ruby edits load_data("Data/Tilesets.rxdata") and saves it back; here the
// tilesets are web/data/tilesets.json, read from disk through the dev server
// (or the served copy without it) and written back in the importer's layout
// (prettyDataJSON), so a save only changes the terrain tag lines it edited.
// After saving, the game uses the new tags at once ($data_tilesets = ...).

import { Data } from "../../data/store";
import type { Tileset } from "../../data/types";
import { terrainTag } from "../../data/gameData/terrainTag";
import { G } from "../../game/globals";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Viewport } from "../../rgss/display";
import { Color } from "../../rgss/types";
import { pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn, type SpriteHash } from "../../ui/fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, Settings } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage, pbShowCommands } from "../../ui/messages";
import { pbSetResizeFactor } from "../../ui/options/options";
import { BitmapSprite } from "../../ui/SpriteWrapper";
import { Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { parseDataJSON, prettyDataJSON } from "../DebugMenuExtraCode";
import { DevFiles, devWriteOrExplain } from "../devFiles";
import { EditorScreens } from "../editorScreens";
import { pad3 } from "./EditorData";
import { TileDrawingHelper } from "./TileDrawingHelper";

export const TILESETS_FILE = "web/data/tilesets.json";

/** GameData::TerrainTag's tags in id_number order (each), with their real_name (the ID). */
const TERRAIN_TAGS: { idNumber: number; realName: string }[] = [];
for (let i = 0; ; i++) {
  const tag = terrainTag(i);
  if (i > 0 && tag.idNumber === 0) break;
  TERRAIN_TAGS.push({ idNumber: tag.idNumber, realName: tag.id });
}

/** load_data("Data/Tilesets.rxdata"): the tilesets file as on disk (the list, in file order). */
export async function loadTilesetsData(): Promise<Tileset[]> {
  let text: string | null = null;
  try {
    text = await DevFiles.read(TILESETS_FILE);
  } catch {
    text = null;
  }
  if (text === null) text = await (await fetch("/data/tilesets.json")).text();
  return parseDataJSON(text) as Tileset[];
}

/** save_data(tilesets, "Data/Tilesets.rxdata") + $data_tilesets = tilesets */
export async function saveTilesetsData(tilesets: Tileset[]): Promise<boolean> {
  const ok = await devWriteOrExplain(TILESETS_FILE, () => DevFiles.write(TILESETS_FILE, prettyDataJSON(tilesets) + "\n"));
  if (ok) {
    for (const t of tilesets) {
      // The JSON floats (JsonFloat) the file may hold become plain numbers for the game.
      Data.tilesets.set(t.id, JSON.parse(JSON.stringify(t)) as Tileset);
    }
  }
  return ok;
}

//===============================================================================
// Edits the terrain tags of tiles in tilesets.
//===============================================================================
export class PokemonTilesetScene {
  static readonly TILE_SIZE = 32; // in pixels
  static readonly TILES_PER_ROW = 8;
  static readonly TILESET_WIDTH = PokemonTilesetScene.TILES_PER_ROW * PokemonTilesetScene.TILE_SIZE;
  static readonly TILES_PER_AUTOTILE = 48;
  static readonly TILESET_START_ID = PokemonTilesetScene.TILES_PER_ROW * PokemonTilesetScene.TILES_PER_AUTOTILE;
  static readonly CURSOR_COLOR = new Color(255, 0, 0);
  static readonly TEXT_COLOR = new Color(80, 80, 80);
  static readonly TEXT_SHADOW_COLOR = new Color(192, 192, 192);

  private tilesetsData: Tileset[] = [];
  private viewport!: Viewport;
  private sprites: Record<string, BitmapSprite | Window_UnformattedTextPokemon> = {};
  private visibleHeight = 0;
  private tileset!: Tileset;
  private tilehelper: TileDrawingHelper | null = null;
  private x = 0;
  private y = 0;
  private topY = 0;
  private height = 0;

  /** initialize (async: the tilesets and graphics are fetched). */
  async init(): Promise<void> {
    const T = PokemonTilesetScene;
    this.tilesetsData = await loadTilesetsData();
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    this.sprites.title = Window_UnformattedTextPokemon.newWithSize(
      _INTL("Tileset Editor\r\nA/S: SCROLL\r\nZ: MENU"),
      T.TILESET_WIDTH, 0, Graphics.width - T.TILESET_WIDTH, 128, this.viewport,
    );
    this.sprites.tileset = new BitmapSprite(T.TILESET_WIDTH, Graphics.height, this.viewport);
    this.sprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    pbSetSystemFont(this.overlay);
    this.visibleHeight = Math.floor(this.tilesetBitmap.height / T.TILE_SIZE);
    await this.loadTileset(1);
  }

  private get overlay() { return (this.sprites.overlay as BitmapSprite).bitmap!; }
  private get tilesetBitmap() { return (this.sprites.tileset as BitmapSprite).bitmap!; }

  /** The tileset with that ID (@tilesets_data[id]). */
  private tilesetData(id: number): Tileset | null {
    return this.tilesetsData.find((t) => t?.id === id) ?? null;
  }

  async openScreen(): Promise<void> {
    await pbFadeInAndShow(this.sprites as SpriteHash);
  }

  async closeScreen(): Promise<void> {
    await pbFadeOutAndHide(this.sprites as SpriteHash);
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
    this.tilehelper?.dispose();
    const gameMap = G.gameMap as { mapId: number } | null;
    if (gameMap && G.mapFactory) {
      (G.mapFactory as unknown as { setup(id: number): void }).setup(gameMap.mapId);
      const player = G.gamePlayer as unknown as { x: number; y: number; center(x: number, y: number): void };
      player.center(player.x, player.y);
      const scene = G.scene as unknown as { disposeSpritesets?: () => void; createSpritesets?: () => Promise<void> } | null;
      if (scene?.createSpritesets && scene.disposeSpritesets) { // $scene.is_a?(Scene_Map)
        scene.disposeSpritesets(); // $scene.dispose
        await scene.createSpritesets();
      }
    }
  }

  async loadTileset(id: number): Promise<void> {
    const T = PokemonTilesetScene;
    this.tileset = this.tilesetData(id)!;
    this.tilehelper?.dispose();
    this.tilehelper = await TileDrawingHelper.fromTileset(this.tileset);
    this.x = 0;
    this.y = 0;
    this.topY = 0;
    this.height = Math.floor((this.tileset.terrainTags.length - T.TILESET_START_ID) / T.TILES_PER_ROW) + 1;
    this.drawTiles();
    this.drawOverlay();
  }

  async chooseTileset(): Promise<void> {
    const commands: string[] = [];
    for (let i = 1; i < this.tilesetsData.length + 1; i++) {
      const t = this.tilesetData(i);
      if (t) commands.push(`${pad3(i)} ${t.name}`);
    }
    const ret = await pbShowCommands(null, commands, -1);
    if (ret >= 0) await this.loadTileset(ret + 1);
  }

  drawTiles(): void {
    const T = PokemonTilesetScene;
    this.tilesetBitmap.clear();
    for (let yy = 0; yy < this.visibleHeight; yy++) {
      const autotileRow = this.topY === 0 && yy === 0; // Autotiles
      const idYOffset = autotileRow ? 0 : T.TILESET_START_ID + ((this.topY + yy - 1) * T.TILES_PER_ROW);
      for (let xx = 0; xx < T.TILES_PER_ROW; xx++) {
        const idXOffset = autotileRow ? xx * T.TILES_PER_AUTOTILE : xx;
        this.tilehelper!.bltTile(this.tilesetBitmap, xx * T.TILE_SIZE, yy * T.TILE_SIZE, idYOffset + idXOffset);
      }
    }
  }

  drawOverlay(): void {
    const T = PokemonTilesetScene;
    this.overlay.clear();
    // Draw all text over tiles (terrain tag numbers)
    const textpos: TextPosition[] = [];
    for (let yy = 0; yy < this.visibleHeight; yy++) {
      for (let xx = 0; xx < T.TILES_PER_ROW; xx++) {
        const tileId = this.tileIDFromCoordinates(xx, this.topY + yy);
        const terr = this.tileset.terrainTags[tileId];
        textpos.push([terr == null ? "" : String(terr), (xx * T.TILE_SIZE) + (T.TILE_SIZE / 2), (yy * T.TILE_SIZE) + 6, 2,
          T.TEXT_COLOR, T.TEXT_SHADOW_COLOR]);
      }
    }
    pbDrawTextPositions(this.overlay, textpos);
    // Draw cursor
    const cursorX = this.x * T.TILE_SIZE;
    const cursorY = (this.y - this.topY) * T.TILE_SIZE;
    this.overlay.fillRect(cursorX, cursorY, T.TILE_SIZE, 4, T.CURSOR_COLOR);
    this.overlay.fillRect(cursorX, cursorY, 4, T.TILE_SIZE, T.CURSOR_COLOR);
    this.overlay.fillRect(cursorX, cursorY + T.TILE_SIZE - 4, T.TILE_SIZE, 4, T.CURSOR_COLOR);
    this.overlay.fillRect(cursorX + T.TILE_SIZE - 4, cursorY, 4, T.TILE_SIZE, T.CURSOR_COLOR);
    // Draw information about selected tile on right side
    this.drawTileDetails();
  }

  drawTileDetails(): void {
    const T = PokemonTilesetScene;
    const overlay = this.overlay;
    const tileX = Math.floor(Graphics.width * 3 / 4) - T.TILE_SIZE;
    const tileY = Math.floor(Graphics.height / 2) - T.TILE_SIZE;
    const tileId = this.tileIDFromCoordinates(this.x, this.y) || 0;
    // Draw tile (at 200% size)
    this.tilehelper!.bltSmallTile(overlay, tileX, tileY, T.TILE_SIZE * 2, T.TILE_SIZE * 2, tileId);
    // Draw box around tile image
    const white = new Color(255, 255, 255);
    overlay.fillRect(tileX - 1, tileY - 1, (T.TILE_SIZE * 2) + 2, 1, white);
    overlay.fillRect(tileX - 1, tileY - 1, 1, (T.TILE_SIZE * 2) + 2, white);
    overlay.fillRect(tileX - 1, tileY + (T.TILE_SIZE * 2), (T.TILE_SIZE * 2) + 2, 1, white);
    overlay.fillRect(tileX + (T.TILE_SIZE * 2), tileY - 1, 1, (T.TILE_SIZE * 2) + 2, white);
    // Write terrain tag info about selected tile
    const tag = this.tileset.terrainTags[tileId] || 0;
    const known = TERRAIN_TAGS.find((t) => t.idNumber === tag);
    const terrainTagName = known ? `${tag}: ${known.realName}` : String(tag);
    const textpos: TextPosition[] = [
      [_INTL("Terrain Tag:"), tileX + T.TILE_SIZE, tileY + (T.TILE_SIZE * 2) + 22, 2, new Color(248, 248, 248), new Color(40, 40, 40)],
      [terrainTagName, tileX + T.TILE_SIZE, tileY + (T.TILE_SIZE * 2) + 54, 2, new Color(248, 248, 248), new Color(40, 40, 40)],
    ];
    // Draw all text
    pbDrawTextPositions(overlay, textpos);
  }

  tileIDFromCoordinates(x: number, y: number): number {
    const T = PokemonTilesetScene;
    if (y === 0) return x * T.TILES_PER_AUTOTILE; // Autotile
    return T.TILESET_START_ID + ((y - 1) * T.TILES_PER_ROW) + x;
  }

  setTerrainTagForTileID(i: number, value: number): void {
    const T = PokemonTilesetScene;
    if (i < T.TILESET_START_ID) {
      for (let j = 0; j < T.TILES_PER_AUTOTILE; j++) this.tileset.terrainTags[i + j] = value;
    } else {
      this.tileset.terrainTags[i] = value;
    }
  }

  updateCursorPosition(xOffset: number, yOffset: number): void {
    const T = PokemonTilesetScene;
    const oldX = this.x;
    const oldY = this.y;
    const oldTopY = this.topY;
    if (xOffset !== 0) {
      this.x += xOffset;
      this.x = Math.min(Math.max(this.x, 0), T.TILES_PER_ROW - 1);
    }
    if (yOffset !== 0) {
      this.y += yOffset;
      this.y = Math.min(Math.max(this.y, 0), this.height - 1);
      if (this.y < this.topY) this.topY = this.y;
      if (this.y >= this.topY + this.visibleHeight) this.topY = this.y - this.visibleHeight + 1;
      if (this.topY < 0) this.topY = 0;
    }
    if (this.topY !== oldTopY) this.drawTiles();
    if (this.x !== oldX || this.y !== oldY) this.drawOverlay();
  }

  /** The data the editor saves (for the tests). */
  get tilesets(): Tileset[] { return this.tilesetsData; }

  async pbStartScene(): Promise<void> {
    await this.openScreen();
    for (;;) {
      await Graphics.update();
      Input.update();
      if (Input.repeat(Input.UP)) {
        this.updateCursorPosition(0, -1);
      } else if (Input.repeat(Input.DOWN)) {
        this.updateCursorPosition(0, 1);
      } else if (Input.repeat(Input.LEFT)) {
        this.updateCursorPosition(-1, 0);
      } else if (Input.repeat(Input.RIGHT)) {
        this.updateCursorPosition(1, 0);
      } else if (Input.repeat(Input.JUMPUP)) {
        this.updateCursorPosition(0, -this.visibleHeight);
      } else if (Input.repeat(Input.JUMPDOWN)) {
        this.updateCursorPosition(0, this.visibleHeight);
      } else if (Input.trigger(Input.ACTION)) {
        const commands = [_INTL("Go to bottom"), _INTL("Go to top"), _INTL("Change tileset"), _INTL("Cancel")];
        switch (await pbShowCommands(null, commands, -1)) {
          case 0: this.updateCursorPosition(0, 99_999); break;
          case 1: this.updateCursorPosition(0, -99_999); break;
          case 2: await this.chooseTileset(); break;
        }
      } else if (Input.trigger(Input.BACK)) {
        if (await pbConfirmMessage(_INTL("Save changes?"))) {
          if (await saveTilesetsData(this.tilesetsData)) {
            await pbMessage(_INTL("To ensure that the changes remain, close and reopen RPG Maker XP."));
          }
        }
        if (await pbConfirmMessage(_INTL("Exit from the editor?"))) break;
      } else if (Input.trigger(Input.USE)) {
        const selected = this.tileIDFromCoordinates(this.x, this.y);
        const oldTag = this.tileset.terrainTags[selected];
        const cmds: string[] = [];
        const ids: number[] = [];
        let oldIdx = 0;
        for (const tag of TERRAIN_TAGS) {
          if (tag.idNumber === oldTag) oldIdx = cmds.length;
          cmds.push(`${tag.idNumber}: ${tag.realName}`);
          ids.push(tag.idNumber);
        }
        const val = await pbMessage(_INTL("\\l[1]\\ts[]Set the terrain tag."), cmds, -1, null, oldIdx);
        // NOTE (Ruby parity): compares the chosen row with the old tag's ID
        // (002_EditorScreens_TerrainTags.rb:215); harmless while the tags are
        // numbered 0, 1, 2... without gaps, as they are here.
        if (val >= 0 && val !== oldTag) {
          this.setTerrainTagForTileID(selected, ids[val]!);
          this.drawOverlay();
        }
      }
    }
    await this.closeScreen();
  }
}

//===============================================================================
//
//===============================================================================
export async function pbTilesetScreen(): Promise<void> {
  await pbFadeOutIn(async () => {
    Graphics.resizeScreen(Settings.SCREEN_WIDTH, Settings.SCREEN_HEIGHT * 2);
    pbSetResizeFactor(1);
    try {
      const scene = new PokemonTilesetScene();
      await scene.init();
      await scene.pbStartScene();
    } finally {
      Graphics.resizeScreen(Settings.SCREEN_WIDTH, Settings.SCREEN_HEIGHT);
      pbSetResizeFactor((G.pokemonSystem as { screensize: number }).screensize);
    }
  });
}

EditorScreens.pbTilesetScreen = pbTilesetScreen;
