// Port of Plugins/ZUD Mechanics/[010] Adventures/MaxLair_Map.rb: the Max Lair
// map (LAIR_COORDINATES and coordinate_check, LairMapScene's set-up, intro,
// HUD, raid battles and tile descriptions, LairDarknessSprite for Dark
// Lairs, LairMapScreen and pbMaxLairMap). Moving around the map is in
// MaxLair_Controls.ts (Ruby reopens LairMapScene).
//
// The map's sprites live in one hash whose keys say what each tile is
// ("Pokemon_3", "Warp_Hidden_2_3", "Chest_5_42"...), in creation order, as in
// Ruby; the controls look tiles up by those keys.
//
// Timing: the waits and the 1-frame movement steps count 40 fps frames
// (FrameWaiter), as in Ruby.

import { assetExists } from "../../core/assets";
import { DEBUG } from "../../core/debug";
import { rand as randInt } from "../../core/random";
import { _INTL } from "../../data/gameData/gameData";
import { TrainerType } from "../../data/gameData/trainerType";
import { Type } from "../../data/gameData/type";
import { unDynamax } from "../../battle/zud/scene/dynamaxSprite";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { pbDrawTextPositions } from "../../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../../ui/fades";
import { pbDisposeSpriteHash, pbSetSmallFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { FrameWaiter } from "../../ui/pokegear/frameClock";
import { preloadBitmaps } from "../../ui/rpgCache";
import { asHash } from "../../ui/scenes/frames";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { AnimatedSprite, IconSprite } from "../../ui/SpriteWrapper";
import { preloadPokemonSprite, PokemonSprite } from "../../ui/sprites/pokemonSprite";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../../ui/summary/summary";
import { Window_AdvancedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { pbBGMFade, pbBGMPlay, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { MaxRaidBattle } from "../maxRaid/Raid_Setup";
import { sample } from "../maxRaid/random";
import { pbDynamaxAdventure, pbLoadLairMapData } from "./Adventure_Main";

const player = () => G.player as unknown as Player;
const resolve = (p: string) => (assetExists(p) ? p : null);

//===============================================================================
// Conversion hash for tile coordinates.
//===============================================================================
// The key used for converting the letter + number tile coordinates entered in
// adventure_maps.txt into actual pixel coordinates to appear on screen.
// The letter of a tile's coordinates corresponds to its X-axis coordinate, and
// the two digit number corresponds to its Y-axis coordinate. These numbers are
// then both multiplied by 32, to get the exact screen positioning for the tile
// on a 32x32 grid.
//===============================================================================
export const LAIR_COORDINATES: Record<string, number> = {
  // X-Axis coordinates
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6,
  H: 7, I: 8, J: 9, K: 10, L: 11, M: 12, N: 13,
  O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20,
  V: 21, W: 22, X: 23, Y: 24, Z: 25,
  // Y-Axis coordinates
  "01": 11, "02": 10, "03": 9, "04": 8, "05": 7, "06": 6,
  "07": 5, "08": 4, "09": 3, "10": 2, "11": 1, "12": 0,
  "13": -1, "14": -2, "15": -3, "16": -4, "17": -5, "18": -6,
  "19": -7, "20": -8, "21": -9, "22": -10, "23": -11, "24": -12,
  "25": -13, "26": -14, "27": -15, "28": -16,
};

//-------------------------------------------------------------------------------
// Returns the converted pixel coordinates of a letter-number string.
//-------------------------------------------------------------------------------
export function coordinateCheck(coords: string, map: string | null = null): [number, number] {
  const c: string[] = [];
  [...coords].forEach((s, i) => {
    if (i === 0 || i === 1) c.push(s);
    else if (i === 2) c[1] += s;
  });
  if (map) {
    if (!(c[0]! in LAIR_COORDINATES)) {
      throw new Error(_INTL("{1} coordinate '{2}' in '{3}' doesn't exist. This coordinate must be a capital letter A-Z.", map, c[0], coords));
    } else if (!(c[1]! in LAIR_COORDINATES)) {
      throw new Error(_INTL("{1} coordinate '{2}' in '{3}' doesn't exist. This coordinate must be a padded two-digit number 01-28.", map, c[1], coords));
    }
    // NOTE (Ruby parity): with a map name this only validates (returns nil).
    return null as unknown as [number, number];
  }
  return [LAIR_COORDINATES[c[0]!]! * 32, LAIR_COORDINATES[c[1]!]! * 32];
}

type MapData = Record<string, string | boolean | string[]>;
/** A sprite of the map hash (all are positioned with x/y and shown with visible). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LairSprite = any;

//===============================================================================
// Max Lair map setup.
//===============================================================================
export class LairMapScene {
  mapData!: MapData;
  mapName = "";
  keycount = 0;
  maxHearts = 0;
  knockouts = 0;
  endlessMode = false;
  darknessMap = false;
  darknessLvl: number | null = null;
  path = "Graphics/Plugins/ZUD/Adventure/";
  lairPokemon: Pokemon[] = [];
  sprites: Record<string, LairSprite> = {};
  mapSprites: LairSprite[] = [];
  viewport!: Viewport;
  viewport2!: Viewport;
  darknessBmp: LairDarknessSprite | null = null;
  upperBounds = 0;
  lowerBounds = 0;
  leftBounds = 0;
  rightBounds = 0;
  startTile!: IconSprite;
  player!: IconSprite;
  cursor!: IconSprite;
  /** pbWait's 40 fps frames. */
  waiter = new FrameWaiter();

  async pbWait(frames: number): Promise<void> {
    await this.waiter.wait(frames);
  }

  //-----------------------------------------------------------------------------
  // Starts the Max Lair scene.
  //-----------------------------------------------------------------------------
  async pbStartScene(map: number): Promise<void> {
    this.mapData = pbLoadLairMapData()[map]! as MapData;
    this.mapName = _INTL("{1}", this.mapData.Name);
    this.keycount = pbDynamaxAdventure().keycount;
    this.maxHearts = this.knockouts = pbDynamaxAdventure().knockouts;
    this.endlessMode = pbDynamaxAdventure().endlessMode();
    this.darknessMap = pbDynamaxAdventure().darknessMap;
    this.darknessLvl = pbDynamaxAdventure().darknessLvl;
    //---------------------------------------------------------------------------
    // Creates all Pokemon objects for the lair.
    //---------------------------------------------------------------------------
    this.lairPokemon = [];
    pbDynamaxAdventure().lairSpecies.forEach((species, i) => {
      let rank = 0;
      if (i <= 1) rank = 2;
      else if (i <= 5) rank = 3;
      else if (i <= 9) rank = 4;
      else if (i === 10) rank = 6;
      const [pkmn] = MaxRaidBattle.generateFoe(species, rank);
      pkmn.level = player().party[0]!.level;
      if (rank === 6) pkmn.level += 5;
      this.lairPokemon.push(pkmn);
    });
    const playerIcon = TrainerType.playerMapIconFilename(player().trainerType, resolve, player().outfit);
    await Promise.all([
      preloadBitmaps([this.path + `Maps/${this.mapName}`, this.path + "tiles", "Graphics/Pictures/types",
        this.path + "arrows", "Graphics/Pictures/uparrow", "Graphics/Pictures/downarrow", "Graphics/Pictures/leftarrow",
        "Graphics/Pictures/rightarrow", this.path + "cursor", this.path + "map_ui", this.path + "hearts",
        "Graphics/Plugins/ZUD/Battle/raid_num", this.path + "Menus/menu_header", ...(playerIcon ? [playerIcon] : [])]),
      ...this.lairPokemon.map((p) => preloadPokemonSprite(p)),
    ]);
    //---------------------------------------------------------------------------
    // Draws the map.
    //---------------------------------------------------------------------------
    this.sprites = {};
    this.mapSprites = [];
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.viewport2 = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport2.z = 99999;
    const background = this.sprites.background = new IconSprite(0, 0, this.viewport);
    background.setBitmapFile(this.path + `Maps/${this.mapName}`);
    const bgheight = background.bitmap!.height;
    const bgwidth = background.bitmap!.width;
    this.mapSprites.push(background);
    this.upperBounds = -4;
    this.lowerBounds = (Graphics.height - bgheight) + 4;
    this.leftBounds = -4;
    this.rightBounds = (Graphics.width - bgwidth) - 4;
    background.y = Graphics.height - bgheight;
    if (this.darknessMap) this.darknessBmp = new LairDarknessSprite(this.viewport);
    if (this.darknessLvl) this.darknessBmp!.radius = this.darknessLvl;
    //---------------------------------------------------------------------------
    // Draws the map tiles.
    //---------------------------------------------------------------------------
    for (const key of Object.keys(this.mapData)) {
      if (!Array.isArray(this.mapData[key]) || key === "Hidden") continue;
      //-------------------------------------------------------------------------
      // Skips drawing Flare tiles if not a Dark Lair.
      //-------------------------------------------------------------------------
      if (key === "Flare" && !this.darknessMap) continue;
      //-------------------------------------------------------------------------
      (this.mapData[key] as string[]).forEach((coordsText, i) => {
        const hidden = this.mapData.Hidden as string[] | undefined;
        const h = hidden && hidden.includes(coordsText) ? "Hidden_" : "";
        let name: string;
        switch (key) {
          //-----------------------------------------------------------------------
          // Sets the keys for each tile sprite. Sprites with the word "Hidden" in
          // their key name are invisible until a Switch tile is turned on.
          // Pokemon tiles cannot be made into Hidden tiles.
          //-----------------------------------------------------------------------
          case "Pokemon": name = `${key}_${i}`; break;
          //-----------------------------------------------------------------------
          // Trap, Block and Chest tile keys are generated with a random number at
          // the end of their key name to designate which variation of that tile
          // they will trigger in the lair.
          // Trap tiles cannot be made into "Hidden" tiles, because they are already
          // visibly hidden by default, and aren't affected by Switch tiles.
          //-----------------------------------------------------------------------
          case "Trap": name = `${key}_${i}_` + String(randInt(6)); break;
          case "Block": name = `${key}_${h}${i}_` + String(randInt(12)); break;
          case "Chest": name = `${key}_${h}${i}_` + String(randInt(100)); break;
          //-----------------------------------------------------------------------
          // Warp tiles are given an additional index number at the end of their
          // key name that is +1 higher than their normal index. This designates
          // the index of the next Warp tile that this tile will Warp the player to.
          //-----------------------------------------------------------------------
          case "Warp": name = `${key}_${h}${i}_` + String(i + 1); break;
          //-----------------------------------------------------------------------
          default: name = `${key}_${h}${i}`; break;
        }
        const coords = coordinateCheck(coordsText);
        const tile = this.sprites[name] = new IconSprite(coords[0], coords[1], this.viewport);
        tile.setBitmapFile(this.path + "tiles");
        tile.visible = !name.includes("Hidden");
        switch (key) {
          //-----------------------------------------------------------------------
          // Gets the appropriate sprite for each tile type.
          //-----------------------------------------------------------------------
          case "Pokemon": tile.srcRect.set(64, 0, 32, 32); break;
          case "TurnNorth": tile.srcRect.set(96, 0, 32, 32); break;
          case "TurnSouth": tile.srcRect.set(128, 0, 32, 32); break;
          case "TurnWest": tile.srcRect.set(160, 0, 32, 32); break;
          case "TurnEast": tile.srcRect.set(192, 0, 32, 32); break;
          case "TurnFlip": tile.srcRect.set(0, 32, 32, 32); break;
          case "TurnRandom": tile.srcRect.set(32, 32, 32, 32); break;
          case "Warp": tile.srcRect.set(64, 32, 32, 32); break;
          case "Reset": tile.srcRect.set(96, 32, 32, 32); break;
          case "Switch": tile.srcRect.set(128, 32, 32, 32); break;
          case "Block": tile.srcRect.set(192, 32, 32, 32); break;
          case "NPCSwap": tile.srcRect.set(0, 64, 32, 32); break;
          case "NPCEquip": tile.srcRect.set(32, 64, 32, 32); break;
          case "NPCTrain": tile.srcRect.set(64, 64, 32, 32); break;
          case "NPCTutor": tile.srcRect.set(96, 64, 32, 32); break;
          case "NPCWard": tile.srcRect.set(128, 64, 32, 32); break;
          case "NPCHeal": tile.srcRect.set(160, 64, 32, 32); break;
          case "NPCRandom": tile.srcRect.set(192, 64, 32, 32); break;
          case "Berry": tile.srcRect.set(0, 96, 32, 32); break;
          case "Flare": tile.srcRect.set(32, 96, 32, 32); break;
          case "Key": tile.srcRect.set(64, 96, 32, 32); break;
          case "Chest": tile.srcRect.set(96, 96, 32, 32); break;
          case "Door": tile.srcRect.set(128, 96, 32, 32); break;
          //-----------------------------------------------------------------------
          // Trap tiles use no visible sprite so that they aren't visible, even if
          // their actual "visibility" isn't turned off.
          // Trap tiles will randomly have thier actual "visibility" turned on.
          // Traps with visibility turned on will trigger when stepped on.
          //-----------------------------------------------------------------------
          case "Trap":
            tile.srcRect.set(0, 0, 0, 0);
            tile.visible = randInt(10) > 4;
            break;
          //-----------------------------------------------------------------------
          // All Selection tiles use the same sprite, regardless of which variation
          // of Selection tile it is.
          //-----------------------------------------------------------------------
          default:
            tile.srcRect.set(32, 0, 32, 32);
            break;
          //-----------------------------------------------------------------------
        }
        this.mapSprites.push(tile);
      });
    }
    //---------------------------------------------------------------------------
    // Draws the start tile.
    //---------------------------------------------------------------------------
    let coords = coordinateCheck(this.mapData.Start as string);
    this.startTile = this.sprites.Start = new IconSprite(coords[0], coords[1], this.viewport);
    this.startTile.setBitmapFile(this.path + "tiles");
    this.startTile.srcRect.set(0, 0, 32, 32);
    this.mapSprites.push(this.startTile);
    //---------------------------------------------------------------------------
    // Draws all Pokemon and type icon sprites on the map.
    //---------------------------------------------------------------------------
    let type: string | null = null;
    this.lairPokemon.forEach((pkmn, i) => {
      const pokemon = this.sprites[`Shadow_${i}`] = new PokemonSprite(this.viewport);
      pokemon.setPokemonBitmap(pkmn);
      unDynamax(pokemon);
      pokemon.setOffset(PictureOrigin.CENTER);
      pokemon.x = this.sprites[`Pokemon_${i}`].x + 16;
      pokemon.y = this.sprites[`Pokemon_${i}`].y - 16;
      pokemon.zoomX = 0.5;
      pokemon.zoomY = 0.5;
      pokemon.color.alpha = 255;
      const poketype = this.sprites[`Type_${i}`] = new IconSprite(pokemon.x - 32, pokemon.y + 20, this.viewport2);
      poketype.setBitmapFile("Graphics/Pictures/types");
      type = sample(pkmn.types());
      poketype.srcRect.set(0, Type.get(type!).iconPosition * 28, 64, 28);
      this.mapSprites.push(pokemon, poketype);
    });
    //---------------------------------------------------------------------------
    // Draws the player's icon.
    //---------------------------------------------------------------------------
    coords = coordinateCheck(this.mapData.Player as string);
    this.player = this.sprites.Player = new IconSprite(coords[0], coords[1], this.viewport2);
    this.player.setBitmapFile(playerIcon);
    this.mapSprites.push(this.player);
    //---------------------------------------------------------------------------
    // Centers all map sprites.
    //---------------------------------------------------------------------------
    for (const sprite of this.mapSprites) {
      sprite.y += 8;
      sprite.x += 16;
    }
    //---------------------------------------------------------------------------
    // Draws all UI sprites.
    //---------------------------------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const arrow = this.sprites[`arrow_ui_${i}`] = new IconSprite(0, 0, this.viewport2);
      arrow.setBitmapFile(this.path + "arrows");
      arrow.srcRect.set(16 * i, 0, 16, 16);
      let mapArrow: AnimatedSprite;
      switch (i) {
        case 0:
          mapArrow = AnimatedSprite.createLong("Graphics/Pictures/uparrow", 8, 28, 40, 2, this.viewport2);
          mapArrow.x = Math.floor(Graphics.width / 2) - 14;
          mapArrow.y = 0;
          break;
        case 1:
          mapArrow = AnimatedSprite.createLong("Graphics/Pictures/downarrow", 8, 28, 40, 2, this.viewport2);
          mapArrow.x = Math.floor(Graphics.width / 2) - 14;
          mapArrow.y = Graphics.height - 44;
          break;
        case 2:
          mapArrow = AnimatedSprite.createLong("Graphics/Pictures/leftarrow", 8, 40, 28, 2, this.viewport2);
          mapArrow.x = 0;
          mapArrow.y = Math.floor(Graphics.height / 2) - 14;
          break;
        default:
          mapArrow = AnimatedSprite.createLong("Graphics/Pictures/rightarrow", 8, 40, 28, 2, this.viewport2);
          mapArrow.x = Graphics.width - 44;
          mapArrow.y = Math.floor(Graphics.height / 2) - 14;
          break;
      }
      this.sprites[`map_arrow_ui_${i}`] = mapArrow;
      mapArrow.play();
    }
    this.cursor = this.sprites.cursor_ui = new IconSprite(0, 0, this.viewport2);
    this.cursor.setBitmapFile(this.path + "cursor");
    this.cursor.srcRect.set(0, 0, 64, 64);
    const ui = (key: string, x: number, y: number, rect: [number, number, number, number]) => {
      const s = this.sprites[key] = new IconSprite(x, y, this.viewport2);
      s.setBitmapFile(this.path + "map_ui");
      s.srcRect.set(...rect);
      return s;
    };
    ui("return_ui", Graphics.width - 125, Graphics.height - 77, [135, 0, 125, 77]);
    ui("options_ui", Graphics.width - 122, Graphics.height - 26, [0, 56, 135, 26]);
    ui("speedup_ui", 0, Graphics.height - 26, [0, 30, 135, 26]).visible = false;
    ui("select_ui", 126, Graphics.height - 38, [0, 82, 260, 38]);
    ui("keycount", -2, 38, [0, 0, 135, 30]).visible = false;
    //---------------------------------------------------------------------------
    // Finalizes map.
    //---------------------------------------------------------------------------
    this.lairUpdateDarkness();
    this.lairUpdateHP();
    this.lairUpdateKeys();
    this.lairUpdateFloor();
    this.lairHideUISprites();
    await this.lairAutoMapPosition(this.sprites.Pokemon_10, 8, true);
    await this.lairAutoMapPosition(this.player, 2, true);
    pbBGMPlay("Dynamax Adventure");
    await this.lairMapIntro(type);
    let direction: number;
    if (this.startTile.x > this.player.x) direction = 3;
    else if (this.startTile.x < this.player.x) direction = 2;
    else if (this.startTile.y > this.player.y) direction = 1;
    else direction = 0;
    await this.lairMovePlayerIcon(direction);
    await this.lairChooseRoute();
  }

  //-----------------------------------------------------------------------------
  // Plays the intro to a lair map. Skippable in Debug mode.
  //-----------------------------------------------------------------------------
  async lairMapIntro(type: string | null): Promise<void> {
    if (DEBUG && Input.press(Input.CTRL)) return;
    const title = this.sprites.title = new IconSprite(Math.floor(Graphics.width / 2), 24, this.viewport2);
    const header = new IconSprite(0, 0, null);
    header.setBitmapFile(this.path + "Menus/menu_header");
    // Bitmap.new(file): a copy the title's text is drawn on.
    const bmp = new Bitmap(header.bitmap!.width, header.bitmap!.height);
    bmp.blt(0, 0, header.bitmap!, header.bitmap!.rect());
    header.dispose();
    title.setBitmap(bmp);
    title.x -= Math.floor(bmp.width / 2);
    pbSetSmallFont(bmp);
    pbDrawTextPositions(bmp, [[this.mapName, Math.floor(bmp.width / 2), 23, 2, new Color(248, 248, 248), new Color(0, 0, 0)]]);
    await this.pbWait(50);
    await this.lairAutoMapPosition(this.sprites.Pokemon_10, 2);
    await this.pbWait(15);
    this.lairPokemon[this.lairPokemon.length - 1]!.playCry();
    await this.pbWait(15);
    await pbMessage(_INTL("There's a strong {1}-type reaction coming from within the den!", Type.get(type!).name));
    title.visible = false;
    await this.lairAutoMapPosition(this.player, 4);
  }

  //-----------------------------------------------------------------------------
  // Updates the viewable space in a dark lair.
  //-----------------------------------------------------------------------------
  async lairUpdateDarknessRadius(): Promise<void> {
    if (this.darknessMap) {
      await this.darknessBmp!.setRadius(14, this.player.x, this.player.y, (n) => this.pbWait(n));
      this.darknessBmp!.refresh([this.player.x, this.player.y]);
    }
  }

  /** lair_UpdateDarkness(radius = false); the radius version is lairUpdateDarknessRadius (it waits). */
  lairUpdateDarkness(): void {
    if (this.darknessMap) this.darknessBmp!.refresh([this.player.x, this.player.y]);
  }

  //-----------------------------------------------------------------------------
  // Updates the player's total and remaining hearts.
  //-----------------------------------------------------------------------------
  lairUpdateHP(): void {
    this.knockouts = pbDynamaxAdventure().knockouts;
    for (let i = 0; i < this.maxHearts; i++) {
      // (Ruby makes new sprites each time and leaves the old ones undisposed.)
      this.sprites[`hearts${i}`]?.dispose();
      const heart = this.sprites[`hearts${i}`] = new IconSprite(4 + (i * 34), 4, this.viewport2);
      heart.setBitmapFile(this.path + "hearts");
      if (this.knockouts > i) heart.srcRect.set(0, 0, 34, 30);
      else heart.srcRect.set(34, 0, 68, 30);
    }
    this.pbUpdate();
  }

  //-----------------------------------------------------------------------------
  // Updates the number of Lair Keys in the player's posession.
  //-----------------------------------------------------------------------------
  lairUpdateKeys(): void {
    this.keycount = pbDynamaxAdventure().keycount;
    const keys = this.sprites.keycount as IconSprite;
    if (this.keycount > 0) {
      const base = new IconSprite(0, 0, null);
      base.setBitmapFile(this.path + "map_ui");
      const bmp = new Bitmap(base.bitmap!.width, base.bitmap!.height);
      bmp.blt(0, 0, base.bitmap!, base.bitmap!.rect());
      const counter = new IconSprite(0, 0, null);
      counter.setBitmapFile("Graphics/Plugins/ZUD/Battle/raid_num");
      keys.setBitmap(bmp);
      keys.srcRect.set(0, 0, 135, 30);
      let startX = 52;
      const startY = 11;
      const n = this.keycount === -1 ? [10] : String(Math.trunc(this.keycount)).split("").map(Number);
      const charWidth = Math.floor(counter.bitmap!.width / 11);
      const charHeight = Math.floor(counter.bitmap!.height / 4);
      for (const i of n) {
        bmp.blt(startX, startY, counter.bitmap!, rect(i * charWidth, 0, charWidth, charHeight));
        startX += charWidth;
      }
      base.dispose();
      counter.dispose();
      keys.visible = true;
    } else {
      keys.visible = false;
    }
    this.pbUpdate();
  }

  //-----------------------------------------------------------------------------
  // Updates the floor number of the current lair in Endless Mode.
  //-----------------------------------------------------------------------------
  lairUpdateFloor(): void {
    if (this.endlessMode) {
      const floorNum = pbDynamaxAdventure().lairFloor;
      const w = this.sprites.floorwindow = new Window_AdvancedTextPokemon(_INTL(`B${floorNum}F`));
      w.setSkin("Graphics/Windowskins/goldskin");
      w.resizeToFit(w.text, Graphics.width);
      w.x = Graphics.width - (w.width + 4);
      w.y = 4;
      w.viewport = this.viewport2;
    }
  }

  //-----------------------------------------------------------------------------
  // Views the party Summary while on the lair map.
  //-----------------------------------------------------------------------------
  async pbSummary(pokemon: Pokemon[], pkmnid: number, hidesprites: Record<string, LairSprite>): Promise<void> {
    const oldsprites = await pbFadeOutAndHide(asHash(hidesprites), () => this.pbUpdate());
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene, true);
    await screen.pbStartScreen(pokemon, pkmnid);
    await pbFadeInAndShow(asHash(hidesprites), oldsprites, () => this.pbUpdate());
  }

  //-----------------------------------------------------------------------------
  // Initiates a raid battle with a lair Pokemon.
  //-----------------------------------------------------------------------------
  async lairStartBattle(index: number): Promise<void> {
    if (this.sprites[`Shadow_${index}`].visible) {
      if (DEBUG && Input.press(Input.CTRL) && index < this.lairPokemon.length - 1) {
        this.sprites[`Shadow_${index}`].color.alpha = 0;
        this.sprites[`Shadow_${index}`].visible = false;
        this.sprites[`Type_${index}`].visible = false;
        return;
      }
      await pbFadeOutIn(async () => {
        if (!(DEBUG && Input.press(Input.CTRL))) {
          await pbMessage(_INTL("\\me[Max Raid Intro]You ventured deeper into the lair...\\wt[34] ...\\wt[34] ...\\wt[60]!\\wtnp[8]"));
        }
        this.sprites[`Shadow_${index}`].color.alpha = 0;
        this.sprites[`Shadow_${index}`].visible = false;
        this.sprites[`Type_${index}`].visible = false;
        pbDynamaxAdventure().bossBattled = this.lairPokemon[index] === this.lairPokemon[this.lairPokemon.length - 1];
        await MaxRaidBattle.start(this.lairPokemon[index]!, {
          size: player().party.length,
          turns: 10,
          kocount: this.knockouts,
          shield: 5,
          autoscale: false,
          simple: true,
          perfect_bonus: this.knockouts === this.maxHearts,
          bgm: pbDynamaxAdventure().bossBattled ? "Battle! Legendary Raid" : "Battle! Max Raid",
        }, { obtaintext: this.mapName + "." });
        this.lairUpdateHP();
      });
      if (!pbDynamaxAdventure().ended()) {
        await this.lairUpdateDarknessRadius();
        await this.lairAutoMapPosition(this.player, 2);
      }
    }
  }

  //-----------------------------------------------------------------------------
  // Gets the description text for each individual tile type.
  //-----------------------------------------------------------------------------
  async lairGetTileInfo(coords: [number, number]): Promise<void> {
    for (const key of Object.keys(this.sprites)) {
      const sprite = this.sprites[key];
      if (!sprite.visible) continue;
      if (!this.mapSprites.includes(sprite)) continue;
      if (key.includes("background") || key.includes("Shadow") || key.includes("Type")) continue;
      if (coords[0] !== sprite.x || coords[1] !== sprite.y) continue;
      switch (key.split("_")[0]) {
        //-------------------------------------------------------------------------
        case "Pokemon":
          await pbMessage(_INTL("This is a Raid Tile.\nPassing over this tile will initiate a battle against a wild Dynamaxed Pokémon."));
          await pbMessage(_INTL("Once captured or defeated, this tile is cleared and the Pokémon cannot be challenged again."));
          break;
        //-------------------------------------------------------------------------
        case "TurnRandom":
          await pbMessage(_INTL("This is a Random Turn Tile.\nPassing over this tile may force you into changing course in a random direction."));
          break;
        //-------------------------------------------------------------------------
        case "TurnFlip":
          await pbMessage(_INTL("This is a Flip Turn Tile.\nLanding on this tile will force you to reverse course and travel in the opposite direction."));
          break;
        //-------------------------------------------------------------------------
        case "NPCSwap":
          await pbMessage(_INTL("There's a Scientist on this tile.\nScientists have additional rental Pokémon you may add to your party by swapping out an existing party member."));
          await pbMessage(_INTL("After encountering a Scientist, they will leave the map and this tile will be cleared."));
          break;
        //-------------------------------------------------------------------------
        case "NPCEquip":
          await pbMessage(_INTL("There's a Backpacker on this tile.\nBackpackers carry a random assortment of items that may be given to your party Pokémon to hold."));
          break;
        //-------------------------------------------------------------------------
        case "NPCTrain":
          await pbMessage(_INTL("There's a Blackbelt on this tile.\nBlackbelts have secret training techniques that can power up particular stats of your party Pokémon."));
          break;
        //-------------------------------------------------------------------------
        case "NPCTutor":
          await pbMessage(_INTL("There's an Ace Trainer on this tile.\nAce Trainers can tutor your party Pokémon and teach them new moves for a strategical advantage."));
          break;
        //-------------------------------------------------------------------------
        case "NPCWard":
          await pbMessage(_INTL("There's a Channeler on this tile.\nChannelers will raise your spirit, increasing your heart counter by one."));
          await pbMessage(_INTL("After encountering a Channeler, they will leave the map and this tile will be cleared."));
          break;
        //-------------------------------------------------------------------------
        case "NPCHeal":
          await pbMessage(_INTL("There's a Nurse on this tile.\nNurses will heal your party Pokémon back to full health."));
          await pbMessage(_INTL("After encountering a Nurse, they will leave the map and this tile will be cleared."));
          break;
        //-------------------------------------------------------------------------
        case "NPCRandom":
          await pbMessage(_INTL("It's a mystery who's on this tile.\nYou'll never know who you'll run into!"));
          await pbMessage(_INTL("After encountering this mystery person, they will leave the map and this tile will be cleared."));
          break;
        //-------------------------------------------------------------------------
        case "Berry":
          await pbMessage(_INTL("There's a pile of Berries on this tile.\nIf you land on this tile, you may feed your party Pokémon these Berries to recover some HP."));
          await pbMessage(_INTL("This tile will become cleared after consuming the Berries."));
          break;
        //-------------------------------------------------------------------------
        case "Flare":
          await pbMessage(_INTL("There's a Flare on this tile.\nIf you land on this tile, you'll light the Flare to increase your visibility."));
          await pbMessage(_INTL("This tile will become cleared after the Flare has been used."));
          break;
        //-------------------------------------------------------------------------
        case "Key":
          await pbMessage(_INTL("There's a Lair Key on this tile.\nIf you land on this tile, you'll collect the key and increase your total number of Lair Keys by one."));
          await pbMessage(_INTL("This tile will become cleared after collecting the Lair Key."));
          break;
        //-------------------------------------------------------------------------
        case "Chest":
          await pbMessage(_INTL("There's a Treasure Chest on this tile.\nIf you land on this tile, you may open the chest and discover the contents within."));
          await pbMessage(_INTL("However, some chests you encounter may be locked and require the use of a Lair Key to be opened."));
          await pbMessage(_INTL("Unlike with Locked Doors, a Locked Chest does not consume the Lair Key upon use."));
          await pbMessage(_INTL("This tile will become cleared after the Treasure Chest has been opened."));
          break;
        //-------------------------------------------------------------------------
        case "Door":
          await pbMessage(_INTL("This is a Locked Door Tile.\nA locked door prevents movement on this path unless you have acquired a Lair Key to open it."));
          await pbMessage(_INTL("Opening the door will clear the tile, and allow you to proceed. However, this will consume one of your Lair Keys."));
          break;
        //-------------------------------------------------------------------------
        case "Block":
          await pbMessage(_INTL("This is a Roadblock Tile.\nAn obstacle prevents movement on this path unless you meet certain criteria."));
          await pbMessage(_INTL("Once the obstacle's criteria has been met, this tile will become cleared and you will not be required to clear the obstacle again."));
          break;
        //-------------------------------------------------------------------------
        case "Warp":
          await pbMessage(_INTL("This is a Warp Tile.\nLanding on this tile will teleport you to another Warp Tile on the map that is linked to this one."));
          break;
        //-------------------------------------------------------------------------
        case "Reset":
          await pbMessage(_INTL("This is a Reset Tile.\nLanding on this tile will teleport you back to the Start Tile of this map."));
          break;
        //-------------------------------------------------------------------------
        case "Switch":
          await pbMessage(_INTL("This is a Switch Tile.\nLanding on this tile will flip all switches to the ON position, revealing hidden tiles that are normally inactive."));
          await pbMessage(_INTL("Landing on a Switch Tile that is already in the ON position will revert all switches to the OFF position, and any revealed tiles will return to their inactive state."));
          break;
        //-------------------------------------------------------------------------
        default:
          //-----------------------------------------------------------------------
          // Start tile.
          //-----------------------------------------------------------------------
          if (coords[0] === this.startTile.x && coords[1] === this.startTile.y) {
            await pbMessage(_INTL("This is the Start Tile.\nThis will always be the first tile you move towards."));
          //-----------------------------------------------------------------------
          // Directional tile.
          //-----------------------------------------------------------------------
          } else if (this.lairCanTurn(null, coords)) {
            await pbMessage(_INTL("This is a Directional Tile.\nPassing over this tile will force you to move in the direction it's pointing."));
          //-----------------------------------------------------------------------
          // Selection tile.
          //-----------------------------------------------------------------------
          } else if (this.lairCanMove(null, coords)) {
            await pbMessage(_INTL("This is a Selection Tile.\nLanding on this tile will allow you to choose a new path to travel in."));
            await pbMessage(_INTL("The number of paths you can choose from varies with each individual Selection Tile."));
          }
          break;
      }
      break;
    }
  }

  //-----------------------------------------------------------------------------
  // General map utilities.
  //-----------------------------------------------------------------------------
  lairHideUISprites(): void {
    for (const key of Object.keys(this.sprites)) {
      if (!key.includes("_ui")) continue;
      this.sprites[key].visible = false;
    }
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites);
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
    this.viewport2.dispose();
    if (this.darknessMap) this.darknessBmp!.dispose();
    pbBGMFade(1.0);
    pbSEPlay("Door exit");
    await this.pbWait(25);
  }
}

const rect = (x: number, y: number, w: number, h: number) => new Rect(x, y, w, h);

//===============================================================================
// Sets up the darkness sprite used in Dark Lairs.
//===============================================================================
export class LairDarknessSprite extends Sprite {
  private darkness: Bitmap;
  private _radius: number;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
    this.darkness = new Bitmap(Graphics.width, Graphics.height);
    this._radius = this.radiusMin();
    this.setBitmap(this.darkness);
    this.z = 99999;
    this.refresh([0, 0]);
  }

  override dispose(): void {
    this.darkness.dispose();
    super.dispose();
  }

  radiusMin(): number { return 64; }
  radiusMax(): number { return 176; }
  radiusCur(): number { return this._radius; }

  get radius(): number { return this._radius; }
  set radius(value: number) { this._radius = value; }

  async setRadius(amount: number, x: number, y: number, wait: (frames: number) => Promise<void>): Promise<void> {
    if (this.radiusCur() < this.radiusMax()) {
      this._radius = this.radiusCur() + amount;
      if (this._radius > this.radiusMax()) this._radius = this.radiusMax();
    }
    pbSEPlay("Vs flash");
    this.refresh([x, y]);
    await wait(30);
  }

  refresh(coords: [number, number]): void {
    this.darkness.fillRect(0, 0, Graphics.width, Graphics.height, new Color(0, 0, 0, 255));
    const cx = coords[0] + 16;
    const cy = coords[1] + 16;
    let cradius = this._radius;
    const numfades = 5;
    for (let i = 1; i <= numfades; i++) {
      for (let j = cx - cradius; j <= cx + cradius; j++) {
        const diff2 = (cradius * cradius) - ((j - cx) * (j - cx));
        const diff = Math.sqrt(diff2);
        // (fill_rect truncates its Float arguments)
        this.darkness.fillRect(j, Math.trunc(cy - diff), 1, Math.trunc(diff * 2),
          new Color(0, 0, 0, (255.0 * (numfades - i)) / numfades));
      }
      cradius = Math.floor(cradius * 0.9);
    }
  }
}

//===============================================================================
// Used for calling the Max Lair Map screen.
//===============================================================================
export class LairMapScreen {
  constructor(private scene: LairMapScene) {}

  async pbStartScreen(map: number): Promise<void> {
    await this.scene.pbStartScene(map);
    await this.scene.pbEndScene();
  }
}

export async function pbMaxLairMap(map: number): Promise<void> {
  const scene = new LairMapScene();
  const screen = new LairMapScreen(scene);
  await screen.pbStartScreen(map);
}
