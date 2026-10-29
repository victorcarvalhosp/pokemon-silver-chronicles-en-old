// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Database.rb: the Max Raid
// Database (PokemonDatabaseSprite, a page of species icons; RaidDataScene's
// search mode with its filters, selection mode and each species' raid data
// page; RaidDataScreen, pbOpenRaidData) and Player#has_raid_database (in
// game/trainer/Player.ts). This game commented out the Pokégear entry
// (Raid_Database.rb:1055-1064), so the Database only opens from the Debug menu.

import { DEBUG } from "../../core/debug";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Habitat } from "../../data/gameData/habitat";
import { pbGetRegionalNumber } from "../../data/gameData/miscPBSData";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Type } from "../../data/gameData/type";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { drawTextEx, pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { pbDeactivateWindows, pbFadeOutAndHide, pbFadeOutIn } from "../../ui/fades";
import { pbDisposeSpriteHash, pbSetSmallFont, pbSetSystemFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { DEXES_WITH_OFFSETS } from "../../ui/pokedex/dexCommon";
import { preloadBitmaps } from "../../ui/rpgCache";
import { asHash } from "../../ui/scenes/frames";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { PokemonSpeciesIconSprite, preloadSpeciesIcons } from "../../ui/sprites/pokemonIcon";
import { preloadSpeciesSprite, PokemonSprite, SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import { Window_CommandPokemon } from "../../ui/windows/SpriteWindowText";
import { pbPlayBuzzerSE, pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Player } from "../trainer/Player";
import { raidGenerateMovelists } from "./Raid_Setup";
import { pbGetRaidRank, raidGenerateSpeciesList, raidGetSeenSpecies, raidRanksAppearedIn } from "./Raid_Ranks";

const player = () => G.player as unknown as Player;

/** The species icons a page of the list shows (each icon fetched before it's drawn). */
function pageSpecies(list: Id[], page: number): Id[] {
  const ret: Id[] = [];
  for (let i = 0; i < RaidDataScene.PAGE_SIZE; i++) {
    const index = RaidDataScene.PAGE_SIZE * page + i;
    if (index > list.length - 1) break;
    let pokemon = list[index]!;
    if (pokemon === "WISHIWASHI") pokemon = "WISHIWASHI_1";
    else if (pokemon === "PALAFIN") pokemon = "PALAFIN_1";
    ret.push(pokemon);
  }
  return ret;
}

//===============================================================================
// Draws an entire page of species sprites to appear in the Database.
//===============================================================================
export class PokemonDatabaseSprite extends Sprite {
  private pokemonsprites: (PokemonSpeciesIconSprite | null)[] = [];
  private contents: Bitmap;

  /** Fetch the page's icons first (preloadPage). */
  constructor(list: Id[], page: number, viewport: Viewport | null = null) {
    super(viewport);
    let xpos = 0;
    const ypos = 42;
    let offset = 1;
    const species = pageSpecies(list, page);
    for (let i = 0; i < species.length; i++) {
      this.pokemonsprites[i] = null;
      if (i >= RaidDataScene.ROW_SIZE * offset) offset += 1;
      const s = this.pokemonsprites[i] = new PokemonSpeciesIconSprite(species[i]!, viewport);
      s.viewport = this.viewport;
      s.zoomX = 0.5;
      s.zoomY = 0.5;
      if (xpos >= RaidDataScene.ROW_SIZE * RaidDataScene.ICON_GAP) xpos = 0;
      xpos += RaidDataScene.ICON_GAP;
      s.x = xpos;
      s.y = ypos + RaidDataScene.ICON_GAP * offset;
    }
    this.contents = new Bitmap(324, 296);
    this.setBitmap(this.contents);
    this.x = 0;
    this.y = 0;
    this.installVisible();
  }

  static async preloadPage(list: Id[], page: number): Promise<void> {
    await preloadSpeciesIcons(pageSpecies(list, page).map((species) => ({ species })));
  }

  override dispose(): void {
    if (!this.isDisposed()) {
      for (let i = 0; i < RaidDataScene.PAGE_SIZE; i++) {
        this.pokemonsprites[i]?.dispose();
        this.pokemonsprites[i] = null;
      }
      this.contents.dispose();
      super.dispose();
    }
  }

  /** visible= also shows/hides the page's icons (Sprite#visible is a plain field here, so it's set up per instance). */
  private installVisible(): void {
    let visible = this.visible;
    Object.defineProperty(this, "visible", {
      get: () => visible,
      set: (value: boolean) => {
        visible = value;
        for (let i = 0; i < RaidDataScene.PAGE_SIZE; i++) {
          const s = this.pokemonsprites[i];
          if (s && !s.isDisposed()) s.visible = value;
        }
      },
    });
  }

  getPokemon(index: number): PokemonSpeciesIconSprite | null | undefined {
    return this.pokemonsprites[index];
  }

  override update(dt?: number): void {
    super.update(dt);
    for (const s of this.pokemonsprites) s?.update();
  }
}

const PATH = "Graphics/Plugins/ZUD/Raid Database/";
export const RAID_DATABASE_GRAPHICS = [
  PATH + "data_menu", PATH + "data_search", PATH + "data_results", PATH + "data_bg", PATH + "data_moves",
  "Graphics/Pictures/uparrow", "Graphics/Pictures/downarrow", "Graphics/Pictures/leftarrow", "Graphics/Pictures/rightarrow",
  "Graphics/Pictures/Storage/cursor_point_1", "Graphics/Pictures/types", "Graphics/Plugins/ZUD/UI/gfactor",
];

//===============================================================================
// Max Raid Database
//===============================================================================
export class RaidDataScene {
  static readonly PAGE_SIZE = 98;
  static readonly ROW_SIZE = 14;
  static readonly ICON_GAP = 32;
  static readonly BASE = new Color(248, 248, 248);
  static readonly SHADOW = new Color(104, 104, 104);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: Record<string, any> = {};
  viewport!: Viewport;
  path = PATH;
  pagetext!: Bitmap;
  overlay!: Bitmap;
  raidlist: Id[] = [];
  pagehead: unknown[] = [];
  nationalDexList: Id[] = [];
  raidlvl = "";
  // The data page's sprites and drawing state.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datasprites: Record<string, any> = {};
  dataviewport!: Viewport;
  dataoverlay!: Bitmap;
  dataoverlay2!: Bitmap;
  typebitmap!: AnimatedBitmap;
  movebitmap!: AnimatedBitmap;
  movePos: TextPosition[] = [];
  datamoves1: Id[] = [];
  datamoves2: Id[] = [];
  datamoves3: Id[] = [];
  datamoves4: Id[] = [];

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites);
  }

  async pbEndScene(): Promise<void> {
    pbPlayCloseMenuSE();
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  }

  //-----------------------------------------------------------------------------
  // Gets the appropriate form name to display.
  //-----------------------------------------------------------------------------
  pbRaidFormName(species: Id, dataPage = false): string {
    const poke = Species.get(species);
    let formName = poke.formName || "";
    if (dataPage) {
      const hideBaseName = ["CASTFORM", "ROTOM", "GIRATINA", "ARCEUS", "KYUREM", "KELDEO", "MELOETTA",
        "GENESECT", "FURFROU", "AEGISLASH", "XERNEAS", "ZYGARDE", "WISHIWASHI",
        "SILVALLY", "MIMIKYU", "CRAMORANT", "EISCUE", "MORPEKO", "GIMMIGHOUL"];
      if (hideBaseName.includes(poke.id)) formName = "";
      if (poke.species === "ROCKRUFF" && poke.form !== 0) formName = "Own Tempo";
      if (formName.length > 15) formName = formName.slice(0, 13) + "...";
      return _INTL("{1}", formName);
    } else {
      const showBaseName = ["BURMY", "WORMADAM", "BASCULIN", "DEERLING", "SAWSBUCK", "MEOWSTIC",
        "ORICORIO", "LYCANROC", "INDEEDEE", "TOXTRICITY", "URSHIFU", "BASCULEGION"];
      if (showBaseName.includes(poke.id) || poke.form > 0) {
        if (formName.length > 13) formName = formName.slice(0, 11) + "...";
        return _INTL("{1} ({2})", poke.name, formName);
      } else {
        return _INTL("{1}", poke.name);
      }
    }
  }

  //-----------------------------------------------------------------------------
  // Initializes scene.
  //-----------------------------------------------------------------------------
  async pbStartScene(): Promise<void> {
    const BASE = RaidDataScene.BASE, SHADOW = RaidDataScene.SHADOW;
    await preloadBitmaps(RAID_DATABASE_GRAPHICS);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const icon = (key: string, file: string) => {
      const s = this.sprites[key] = new IconSprite(0, 0, this.viewport);
      s.setBitmapFile(file);
      return s;
    };
    icon("screen", this.path + "data_menu");
    icon("search", this.path + "data_search").visible = false;
    icon("results", this.path + "data_results").visible = false;
    const searchcmds = [
      _INTL("Show Pokémon"),
      _INTL("Filter: Raid"),
      _INTL("Filter: Type"),
      _INTL("Filter: Habitat"),
      _INTL("Filter: Region"),
      _INTL("Exit"),
    ];
    const settings = this.sprites.settings = Window_CommandPokemon.newWithSize(searchcmds, 65, 95, 500, 250, this.viewport);
    settings.index = 0;
    settings.baseColor = BASE;
    settings.shadowColor = SHADOW;
    settings.windowskin = null;
    settings.visible = false;
    // (Ruby passes "" as the commands; an empty list draws the same.)
    const filter = this.sprites.filter = Window_CommandPokemon.newWithSize([], 160, 95, 300, 220, this.viewport);
    filter.index = 0;
    filter.baseColor = BASE;
    filter.shadowColor = SHADOW;
    filter.windowskin = null;
    filter.visible = false;
    this.pagetext = (this.sprites.pagetext = new BitmapSprite(Graphics.width, Graphics.height, this.viewport)).bitmap!;
    pbSetSmallFont(this.pagetext);
    this.overlay = (this.sprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport)).bitmap!;
    this.raidlist = [];
    this.pagehead = [];
    this.nationalDexList = ["NONE"];
    for (const s of Species.eachSpecies()) this.nationalDexList.push(s.species);
  }

  //-----------------------------------------------------------------------------
  // Search mode.
  //-----------------------------------------------------------------------------
  async pbRaidData(): Promise<void> {
    const BASE = RaidDataScene.BASE, SHADOW = RaidDataScene.SHADOW;
    const textPos: TextPosition[] = [];
    let command = 0;
    let type: Id | null = null;
    let habitat: Id | null = null;
    let gen: number | null = null;
    let raid: number | null = 1;
    const badges = player().badgeCount();
    if (badges > 0) raid = 2;
    if (badges >= 3) raid = 3;
    if (badges >= 6) raid = 4;
    if (badges >= 8) raid = 5;
    this.raidlvl = `Raid: Lv. ${raid}`;
    const regionNames = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova", "Kalos", "Alola", "Galar/Hisui", "Paldea"];
    const regions = regionNames.slice(0, Settings.GENERATION_LIMIT);
    const count = (): number => (Settings.HIDE_UNSEEN_SPECIES
      ? raidGetSeenSpecies([type, habitat, gen], raid, null, true).length
      : raidGenerateSpeciesList([type, habitat, gen], raid, null, true).length);
    let pkmnCount = Settings.HIDE_UNSEEN_SPECIES
      ? raidGetSeenSpecies([], raid, null, true).length
      : raidGenerateSpeciesList([], raid, null, true).length;
    textPos.push(
      [_INTL(`[${this.raidlvl}]`), 270, 149, 0, BASE, SHADOW],
      [_INTL("[Any]"), 270, 181, 0, BASE, SHADOW],
      [_INTL("[Any]"), 270, 213, 0, BASE, SHADOW],
      [_INTL("[Any]"), 270, 245, 0, BASE, SHADOW],
      [_INTL("Available Pokémon: {1}", pkmnCount), 256, 346, 2, BASE, SHADOW],
    );
    pbSetSystemFont(this.overlay);
    pbDrawTextPositions(this.overlay, textPos);
    pbSEPlay("PC access");
    /** The filter sub-menu loop: returns the chosen index, or null if cancelled. */
    const chooseFilter = async (cmds: string[]): Promise<number | null> => {
      this.sprites.filter.commands = cmds;
      this.sprites.settings.visible = false;
      this.sprites.filter.visible = true;
      this.overlay.clear();
      textPos.length = 0;
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        if (Input.trigger(Input.BACK)) return null;
        if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          return this.sprites.filter.index;
        }
      }
    };
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      const ids: Id[] = [];
      let cmds: string[] = [];
      this.sprites.filter.index = 0;
      this.sprites.filter.visible = false;
      command = this.sprites.settings.index;
      this.sprites.settings.visible = true;
      this.sprites.search.visible = true;
      if (Input.trigger(Input.USE)) {
        if (command === -1 || command === 5) break;
        switch (command) {
          //-----------------------------------------------------------------------
          // Enters selection mode.
          //-----------------------------------------------------------------------
          case 0:
            if (pkmnCount > 0) {
              pbPlayDecisionSE();
              await pbFadeOutIn(async () => {
                this.raidlist.length = 0;
                this.raidlist = Settings.HIDE_UNSEEN_SPECIES
                  ? raidGetSeenSpecies([type, habitat, gen], raid, null, true)
                  : raidGenerateSpeciesList([type, habitat, gen], raid, null, true);
                this.sprites.settings.visible = false;
                this.sprites.search.visible = false;
                this.sprites.results.visible = true;
                this.overlay.clear();
              });
              await pbDeactivateWindows(asHash(this.sprites), () => this.pbSpeciesSelect());
            } else {
              pbPlayBuzzerSE();
            }
            break;
          //-----------------------------------------------------------------------
          // Filter: Raid Level
          //-----------------------------------------------------------------------
          case 1: {
            cmds.push(_INTL("Raid Level 1"));
            if (badges > 0) cmds.push(_INTL("Raid Level 2"));
            if (badges >= 3) cmds.push(_INTL("Raid Level 3"));
            if (badges >= 6) cmds.push(_INTL("Raid Level 4"));
            if (badges >= 8) cmds.push(_INTL("Raid Level 5"));
            if (badges >= 8) cmds.push(_INTL("Legendary Raid"));
            if (badges >= 8) cmds.push(_INTL("Remove Raid Level"));
            const choice = await chooseFilter(cmds);
            if (choice != null) {
              raid = choice + 1;
              if (cmds.length === 7 && raid >= cmds.length) raid = null;
            }
            break;
          }
          //-----------------------------------------------------------------------
          // Filter: Type
          //-----------------------------------------------------------------------
          case 2: {
            for (const t of Type.each()) {
              if (t.id === "QMARKS") continue;
              ids.push(t.id);
              cmds.push(t.name);
            }
            cmds.push(_INTL("Remove Type"));
            const choice = await chooseFilter(cmds);
            if (choice != null) {
              type = ids[choice] ?? null;
              if (choice >= cmds.length) type = null;
            }
            break;
          }
          //-----------------------------------------------------------------------
          // Filter: Habitat
          //-----------------------------------------------------------------------
          case 3: {
            for (const h of Habitat.each()) {
              ids.push(h.id);
              cmds.push(h.name);
            }
            cmds.push(_INTL("Remove Habitat"));
            const choice = await chooseFilter(cmds);
            if (choice != null) {
              habitat = ids[choice] ?? null;
              if (choice >= cmds.length) habitat = null;
            }
            break;
          }
          //-----------------------------------------------------------------------
          // Filter: Generation
          //-----------------------------------------------------------------------
          case 4: {
            cmds = cmds.concat(regions);
            cmds.push(_INTL("Remove Region"));
            const choice = await chooseFilter(cmds);
            if (choice != null) {
              gen = choice + 1;
              if (gen >= cmds.length) gen = null;
            }
            break;
          }
        }
        //-----------------------------------------------------------------------
        this.overlay.clear();
        textPos.length = 0;
        this.sprites.settings.index = 0;
        let text1 = raid ? _INTL("Raid Lvl. {1}", raid) : "Any";
        const text2 = type ? Type.get(type).name : "Any";
        const text3 = habitat ? Habitat.get(habitat).name : "Any";
        const text4 = gen ? regions[gen - 1] : "Any";
        if (raid === 6) text1 = "Legendary";
        pkmnCount = count();
        textPos.push(
          [_INTL("[{1}]", text1), 270, 149, 0, BASE, SHADOW],
          [_INTL("[{1}]", text2), 270, 181, 0, BASE, SHADOW],
          [_INTL("[{1}]", text3), 270, 213, 0, BASE, SHADOW],
          [_INTL("[{1}]", text4), 270, 245, 0, BASE, SHADOW],
          [_INTL("Available Pokémon: {1}", pkmnCount), 256, 346, 2, BASE, SHADOW],
        );
        this.raidlvl = text1 === "Any" ? "Raid: Any Lv." : `Raid: Lv. ${raid}`;
        if (raid === 6) this.raidlvl = "Raid: Legend";
        pbDrawTextPositions(this.overlay, textPos);
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        break;
      }
    }
  }

  //-----------------------------------------------------------------------------
  // Selection mode.
  //-----------------------------------------------------------------------------
  async pbSpeciesSelect(): Promise<void> {
    const BASE = RaidDataScene.BASE, SHADOW = RaidDataScene.SHADOW;
    const { PAGE_SIZE, ROW_SIZE } = RaidDataScene;
    const textPos: TextPosition[] = [];
    let index = 0;
    let offset = 0;
    let page = 1;
    let maxpage = 0;
    let spritelist = -1;
    let select = index + offset;
    const pkmnTotal = this.raidlist.length;
    let pokeName = this.pbRaidFormName(this.raidlist[select]!);
    for (let i = 0; i < pkmnTotal; i++) if (i >= PAGE_SIZE * maxpage) maxpage += 1;
    textPos.push([_INTL("{1}", pokeName), 256, 352, 2, BASE, SHADOW]);
    const drawPageText = () => {
      drawTextEx(this.pagetext, 35, 55, 150, 2, _INTL("{1}", this.raidlvl), BASE, SHADOW);
      drawTextEx(this.pagetext, 376, 308, 150, 2, _INTL("Page: {1}/{2}", page, maxpage), BASE, SHADOW);
    };
    drawPageText();
    const up = this.sprites.uparrow = AnimatedSprite.createLong("Graphics/Pictures/uparrow", 8, 28, 40, 2, this.viewport);
    up.x = 242;
    up.y = 44;
    up.play();
    up.visible = false;
    const down = this.sprites.downarrow = AnimatedSprite.createLong("Graphics/Pictures/downarrow", 8, 28, 40, 2, this.viewport);
    down.x = 242;
    down.y = 298;
    down.play();
    down.visible = false;
    await PokemonDatabaseSprite.preloadPage(this.raidlist, 0);
    this.sprites.pokelist = new PokemonDatabaseSprite(this.raidlist, 0, this.viewport);
    const cursor = this.sprites.cursor = new IconSprite(0, 0, this.viewport);
    cursor.setBitmapFile("Graphics/Pictures/Storage/cursor_point_1");
    cursor.zoomX = 0.5;
    cursor.zoomY = 0.5;
    const placeCursor = () => {
      cursor.x = this.sprites.pokelist.getPokemon(index).x + 10;
      cursor.y = this.sprites.pokelist.getPokemon(index).y - 10;
    };
    placeCursor();
    cursor.z = 1;
    this.sprites.overlay.dispose(); // (Ruby makes a new overlay and leaves the old one)
    this.overlay = (this.sprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport)).bitmap!;
    pbSetSystemFont(this.overlay);
    pbDrawTextPositions(this.overlay, textPos);
    pbSEPlay("GUI storage show party panel");
    const newPage = async () => {
      this.sprites.pokelist.dispose();
      await PokemonDatabaseSprite.preloadPage(this.raidlist, page - 1);
      this.sprites.pokelist = new PokemonDatabaseSprite(this.raidlist, page - 1, this.viewport);
    };
    const redrawName = (withPage: boolean) => {
      this.overlay.clear();
      if (withPage) this.pagetext.clear();
      textPos.length = 0;
      select = index + offset;
      pokeName = this.pbRaidFormName(this.raidlist[select]!);
      if (withPage) drawPageText();
      textPos.push([_INTL("{1}", pokeName), 256, 352, 2, BASE, SHADOW]);
      pbDrawTextPositions(this.overlay, textPos);
    };
    const lastIndex = () => {
      let endsprite = 0;
      for (let i = 0; i < PAGE_SIZE; i++) {
        if (!this.sprites.pokelist.getPokemon(endsprite)) continue;
        if (endsprite > PAGE_SIZE) break;
        endsprite += 1;
      }
      return endsprite - 1;
    };
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (pkmnTotal > PAGE_SIZE) {
        up.visible = true;
        down.visible = true;
        if (offset <= 0) up.visible = false;
        if (offset >= pkmnTotal - PAGE_SIZE) down.visible = false;
      }
      //-------------------------------------------------------------------------
      // Scrolling upwards
      //-------------------------------------------------------------------------
      if (Input.repeat(Input.UP)) {
        Input.update();
        index -= ROW_SIZE;
        // Previous page of species
        if (pkmnTotal > PAGE_SIZE && offset > 0 && index < 0) {
          for (let i = offset - PAGE_SIZE; i < this.raidlist.length; i++) {
            spritelist += 1;
            if (spritelist >= PAGE_SIZE) break;
          }
          page -= 1;
          offset -= spritelist;
          spritelist = -1;
          index = 0;
          await newPage();
          pbSEPlay("GUI summary change page");
        } else {
          pbPlayCursorSE();
        }
        // Returns to last index
        if (index < 0) index = lastIndex();
        placeCursor();
        redrawName(true);
      //-------------------------------------------------------------------------
      // Scrolling downwards
      //-------------------------------------------------------------------------
      } else if (Input.repeat(Input.DOWN)) {
        Input.update();
        index += ROW_SIZE;
        // Next page of species
        if (pkmnTotal > PAGE_SIZE + offset && index > PAGE_SIZE - 1) {
          for (let i = PAGE_SIZE + offset; i < this.raidlist.length; i++) {
            spritelist += 1;
            if (spritelist >= PAGE_SIZE) break;
          }
          page += 1;
          offset += spritelist;
          if (spritelist < PAGE_SIZE) offset += PAGE_SIZE - spritelist;
          spritelist = -1;
          index = 0;
          await newPage();
          pbSEPlay("GUI summary change page");
        } else {
          pbPlayCursorSE();
        }
        // Returns to first index
        if (index > PAGE_SIZE - 1) index = 0;
        if (!this.sprites.pokelist.getPokemon(index)) index = 0;
        if (index < PAGE_SIZE) placeCursor();
        redrawName(true);
      //-------------------------------------------------------------------------
      // Scrolling left
      //-------------------------------------------------------------------------
      } else if (Input.repeat(Input.LEFT)) {
        pbPlayCursorSE();
        Input.update();
        index -= 1;
        // Returns to last index
        if (index < 0) index = lastIndex();
        placeCursor();
        redrawName(false);
      //-------------------------------------------------------------------------
      // Scrolling right
      //-------------------------------------------------------------------------
      } else if (Input.repeat(Input.RIGHT)) {
        if (index < PAGE_SIZE) {
          pbPlayCursorSE();
          Input.update();
          index += 1;
          // Returns to first index
          if (index > PAGE_SIZE - 1) index = 0;
          if (!this.sprites.pokelist.getPokemon(index)) index = 0;
          placeCursor();
          redrawName(false);
        }
      //-------------------------------------------------------------------------
      // Scrolls up through entire pages at a time.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.JUMPUP)) {
        Input.update();
        if (pkmnTotal > PAGE_SIZE && page > 1) {
          for (let i = offset - PAGE_SIZE; i < this.raidlist.length; i++) {
            spritelist += 1;
            if (spritelist >= PAGE_SIZE) break;
          }
          page -= 1;
          offset -= spritelist;
          spritelist = -1;
          index = 0;
          await newPage();
          placeCursor();
          pbSEPlay("GUI summary change page");
          redrawName(true);
        }
      //-------------------------------------------------------------------------
      // Scrolls down through entire pages at a time.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.JUMPDOWN)) {
        Input.update();
        if (pkmnTotal > PAGE_SIZE + offset && page < maxpage) {
          for (let i = PAGE_SIZE + offset; i < this.raidlist.length; i++) {
            spritelist += 1;
            if (spritelist >= PAGE_SIZE) break;
          }
          page += 1;
          offset += spritelist;
          if (spritelist < PAGE_SIZE) offset += PAGE_SIZE - spritelist;
          spritelist = -1;
          index = 0;
          await newPage();
          placeCursor();
          pbSEPlay("GUI summary change page");
          redrawName(true);
        }
      //-------------------------------------------------------------------------
      // Opens species' raid data page.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        await pbFadeOutIn(async () => {
          select = index + offset;
          let pkmn: Id | null = null;
          for (let i = 0; i < this.raidlist.length; i++) if (select === i) pkmn = this.raidlist[i]!;
          await this.pbRaidDataPage(pkmn!);
        });
      //-------------------------------------------------------------------------
      // Returns to search mode.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.BACK)) {
        pbSEPlay("GUI storage hide party panel");
        await pbFadeOutIn(() => {
          this.sprites.pokelist.dispose();
          this.sprites.cursor.dispose();
          this.sprites.uparrow.dispose();
          this.sprites.downarrow.dispose();
          this.sprites.results.visible = false;
          this.pagetext.clear();
          this.overlay.clear();
        });
        break;
      }
    }
  }

  //-----------------------------------------------------------------------------
  // Species data to display.
  //-----------------------------------------------------------------------------
  pbSetSpeciesData(species: Id): void {
    const BASE = RaidDataScene.BASE, SHADOW = RaidDataScene.SHADOW;
    const display = 8;   // Number of moves displayed (counts 0)
    const ydiff = 17;    // Difference in y positioning between moves.
    const xposL = 92;    // X position of left move column.
    const xposR = 270;   // X position of right move column.
    const yposT = 36;    // Y position of top move row.
    const yposB = 224;   // Y position of bottom move row.
    const pkmn = Species.get(species);
    let form: number;
    switch (pkmn.species) {
      case "MINIOR": form = 0; break;
      case "WISHIWASHI": form = 1; break;
      default: form = pkmn.form; break;
    }
    const habitat = Habitat.get(pkmn.habitat).name;
    const ranks = raidRanksAppearedIn(pkmn.id);
    const moves = raidGenerateMovelists(pkmn.id);
    this.datamoves1 = moves[0];
    this.datamoves2 = moves[1];
    this.datamoves3 = moves[2];
    this.datamoves4 = moves[3];
    this.datasprites.pokemon.setSpeciesBitmap(pkmn.species, null, form);
    this.datasprites.pokemon.zoomX = 0.5;
    this.datasprites.pokemon.zoomY = 0.5;
    this.datasprites.gmax.visible = pkmn.hasGmax();
    pkmn.types.forEach((type, i) => {
      const typeNumber = Type.get(type).iconPosition;
      const typeRect = new Rect(0, typeNumber * 28, 64, 28);
      const typeX = pkmn.types.length === 1 ? 400 : 367 + (68 * i);
      this.dataoverlay.blt(typeX, 194, this.typebitmap.bitmap, typeRect);
    });
    const mb = this.movebitmap.bitmap;
    if (this.datamoves1.length > 0) this.dataoverlay.blt(0, 0, mb, new Rect(0, 0, 181, 194));
    if (this.datamoves2.length > 0) this.dataoverlay.blt(181, 0, mb, new Rect(181, 0, 181, 194));
    if (this.datamoves3.length > 0) this.dataoverlay.blt(0, 193, mb, new Rect(0, 194, 181, 388));
    if (this.datamoves4.length > 0) this.dataoverlay.blt(181, 193, mb, new Rect(181, 194, 362, 388));
    const textPos: TextPosition[] = [
      [pkmn.name, 434, 22, 2, BASE, SHADOW],
      [_INTL("Habitat:"), 434, 332, 2, BASE, SHADOW],
      [_INTL("{1}", habitat), 434, 356, 2, BASE, SHADOW],
      [_INTL("Appears In:"), 383, 229, 0, BASE, SHADOW],
    ];
    let dexnum = 0;
    let dexnumshift = false;
    const dex = player().pokedex;
    if (dex.unlocked(-1)) {
      dexnum = Math.max(this.nationalDexList.indexOf(pkmn.species), 0);
      if (DEXES_WITH_OFFSETS.includes(-1)) dexnumshift = true;
    } else {
      for (let i = 0; i < dex.dexesCount() - 1; i++) {
        if (!dex.unlocked(i)) continue;
        const num = pbGetRegionalNumber(i, pkmn.species);
        if (num <= 0) continue;
        dexnum = num;
        if (DEXES_WITH_OFFSETS.includes(i)) dexnumshift = true;
        break;
      }
    }
    if (dexnum > 0) {
      if (dexnumshift) dexnum -= 1;
      textPos.push(["#" + String(dexnum).padStart(3, "0"), 477, 58, 2, BASE, SHADOW]);
    }
    if (this.pbRaidFormName(pkmn.id, true) !== pkmn.name) {
      textPos.push([this.pbRaidFormName(pkmn.id, true), 434, 151, 2, BASE, SHADOW]);
    }
    if (ranks.length > 0) {
      if (ranks.includes(6)) {
        textPos.push([_INTL("Legendary Raid"), 368, 261, 0, BASE, SHADOW]);
      } else {
        for (let i = 0; i < ranks.length; i++) {
          textPos.push([_INTL("Raid Lv. {1}", ranks[i]), 389, 257 + (20 * i), 0, BASE, SHADOW]);
        }
      }
    } else {
      textPos.push([_INTL("None"), 413, 261, 0, BASE, SHADOW]);
    }
    const columns: [Id[], number, number, number][] = [
      [this.datamoves1, xposL, yposT, 97],  // Primary movelist
      [this.datamoves2, xposR, yposT, 97],  // Secondary movelist
      [this.datamoves3, xposL, yposB, 290], // Spread moves movelist
      [this.datamoves4, xposR, yposB, 290], // Support moves movelist
    ];
    for (const [list, x, y, noneY] of columns) {
      if (list.length > 0) {
        for (let i = 0; i < list.length; i++) {
          this.movePos.push([Move.get(list[i]!).name, x, y + (i * ydiff), 2, BASE, SHADOW]);
          if (i >= display) break;
        }
      } else {
        textPos.push([_INTL("None Found"), x, noneY, 2, BASE, SHADOW]);
      }
    }
    pbSetSmallFont(this.dataoverlay);
    pbSetSmallFont(this.dataoverlay2);
    pbDrawTextPositions(this.dataoverlay, textPos);
    pbDrawTextPositions(this.dataoverlay2, this.movePos);
  }

  /** The cry and sprite of a species, fetched before pbSetSpeciesData draws it. */
  private async preloadSpecies(species: Id): Promise<void> {
    const pkmn = Species.get(species);
    const form = pkmn.species === "MINIOR" ? 0 : pkmn.species === "WISHIWASHI" ? 1 : pkmn.form;
    await preloadSpeciesSprite(pkmn.species, null, form);
  }

  //-----------------------------------------------------------------------------
  // Raid Data page
  //-----------------------------------------------------------------------------
  async pbRaidDataPage(pkmn: Id): Promise<void> {
    const BASE = RaidDataScene.BASE, SHADOW = RaidDataScene.SHADOW;
    let page = 0;
    let display = 8;
    const ydiff = 17;
    const xposL = 92;
    const xposR = 270;
    const yposT = 36;
    const yposB = 224;
    this.movePos = [];
    this.datasprites = {};
    this.dataviewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.dataviewport.z = 99999;
    const screen = this.datasprites.screen = new IconSprite(0, 0, this.dataviewport);
    screen.setBitmapFile(this.path + "data_bg");
    this.dataoverlay = (this.datasprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.dataviewport)).bitmap!;
    this.dataoverlay2 = (this.datasprites.overlay2 = new BitmapSprite(Graphics.width, Graphics.height, this.dataviewport)).bitmap!;
    const sprite = this.datasprites.pokemon = new PokemonSprite(this.dataviewport);
    sprite.setOffset(PictureOrigin.CENTER);
    sprite.x = 432;
    sprite.y = 110;
    const gmax = this.datasprites.gmax = new IconSprite(472, 124, this.dataviewport);
    gmax.setBitmapFile("Graphics/Plugins/ZUD/UI/gfactor");
    const arrow = (key: string, file: string, w: number, h: number, x: number, y: number) => {
      const a = this.datasprites[key] = AnimatedSprite.createLong(file, 8, w, h, 2, this.dataviewport);
      a.x = x;
      a.y = y;
      a.play();
      a.visible = false;
    };
    arrow("uparrow", "Graphics/Pictures/uparrow", 28, 40, 167, 4);
    arrow("downarrow", "Graphics/Pictures/downarrow", 28, 40, 167, 345);
    arrow("leftarrow", "Graphics/Pictures/leftarrow", 40, 28, 352, 92);
    arrow("rightarrow", "Graphics/Pictures/rightarrow", 40, 28, 472, 92);
    this.typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    this.movebitmap = new AnimatedBitmap(_INTL(this.path + "data_moves"));
    await this.preloadSpecies(pkmn);
    this.pbSetSpeciesData(pkmn);
    let pkmndata = Species.get(pkmn);
    const form = ["WISHIWASHI", "PALAFIN"].includes(pkmndata.species) ? 1 : pkmndata.form;
    SpeciesFiles.playCryFromSpecies(pkmndata.species, form);
    let raidforms = pkmndata.getRaidForms(pbGetRaidRank().banned);
    const redrawMoves = (stepOffset: (i: number) => boolean) => {
      this.movePos.length = 0;
      this.dataoverlay2.clear();
      const offsets = [-1, -1, -1, -1];
      const lists = [this.datamoves1, this.datamoves2, this.datamoves3, this.datamoves4];
      const xs = [xposL, xposR, xposL, xposR];
      const ys = [yposT, yposT, yposB, yposB];
      lists.forEach((list, n) => {
        for (let i = page; i < list.length; i++) {
          if (stepOffset(i)) offsets[n]! += 1;
          this.movePos.push([Move.get(list[i]!).name, xs[n]!, ys[n]! + (offsets[n]! * ydiff), 2, BASE, SHADOW]);
          if (i >= display) break;
        }
      });
      pbDrawTextPositions(this.dataoverlay2, this.movePos);
    };
    const showSpecies = async (species: Id, cry: boolean) => {
      pkmn = species;
      page = 0;
      display = 8;
      this.movePos.length = 0;
      this.dataoverlay.clear();
      this.dataoverlay2.clear();
      await this.preloadSpecies(species);
      this.pbSetSpeciesData(species);
      if (cry) {
        pkmndata = Species.get(pkmn);
        SpeciesFiles.playCryFromSpecies(pkmndata.species, pkmndata.form);
        raidforms = pkmndata.getRaidForms(pbGetRaidRank().banned);
      }
    };
    for (;;) {
      await Graphics.update();
      Input.update();
      pbUpdateSpriteHash(this.datasprites);
      const topReached = !(page > 0);
      const endReached1 = this.datamoves1.length <= display + 1;
      const endReached2 = this.datamoves2.length <= display + 1;
      const endReached3 = this.datamoves3.length <= display + 1;
      const endReached4 = this.datamoves4.length <= display + 1;
      const endReached = endReached1 && endReached2 && endReached3 && endReached4;
      this.datasprites.uparrow.visible = !topReached;
      this.datasprites.downarrow.visible = !endReached;
      this.datasprites.leftarrow.visible = raidforms.length > 1 && pkmn !== raidforms[0];
      this.datasprites.rightarrow.visible = raidforms.length > 1 && pkmn !== raidforms[raidforms.length - 1];
      //-------------------------------------------------------------------------
      // Scrolling movelists upwards.
      //-------------------------------------------------------------------------
      if (Input.repeat(Input.UP)) {
        if (!topReached) {
          page -= 9;
          if (page < 0) page = 0;
          display -= 9;
          if (page === 0) display = 8;
          pbSEPlay("GUI summary change page");
          Input.update();
          redrawMoves(() => true); // (offset += 1 if i < list.length: always)
        }
      //-------------------------------------------------------------------------
      // Scrolling movelists downwards.
      //-------------------------------------------------------------------------
      } else if (Input.repeat(Input.DOWN)) {
        if (!endReached) {
          page += 9;
          display += 9;
          pbSEPlay("GUI summary change page");
          Input.update();
          redrawMoves((i) => i > 0);
        }
      //-------------------------------------------------------------------------
      // Scrolling left through forms.
      //-------------------------------------------------------------------------
      } else if (Input.repeat(Input.LEFT)) {
        if (raidforms.length > 1 && pkmn !== raidforms[0]) {
          let prevForm = pkmn;
          for (const f of raidforms) {
            if (f === pkmn) break;
            prevForm = f;
          }
          await showSpecies(prevForm, false);
          pbSEPlay("GUI party switch");
        }
      //-------------------------------------------------------------------------
      // Scrolling right through forms.
      //-------------------------------------------------------------------------
      } else if (Input.repeat(Input.RIGHT)) {
        if (raidforms.length > 1 && pkmn !== raidforms[raidforms.length - 1]) {
          let nextForm = pkmn;
          for (const f of [...raidforms].reverse()) {
            if (f === pkmn) break;
            nextForm = f;
          }
          await showSpecies(nextForm, false);
          pbSEPlay("GUI party switch");
        }
      //-------------------------------------------------------------------------
      // Scrolling up through species list.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.JUMPUP)) {
        if (this.raidlist.length > 1 && pkmn !== this.raidlist[0]) {
          let prevSpecies = pkmn;
          for (const species of this.raidlist) {
            if (species === pkmn) break;
            prevSpecies = species;
          }
          await showSpecies(prevSpecies, true);
        }
      //-------------------------------------------------------------------------
      // Scrolling down through species list.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.JUMPDOWN)) {
        if (this.raidlist.length > 1 && pkmn !== this.raidlist[this.raidlist.length - 1]) {
          let nextSpecies = pkmn;
          for (const species of [...this.raidlist].reverse()) {
            if (species === pkmn) break;
            nextSpecies = species;
          }
          await showSpecies(nextSpecies, true);
        }
      //-------------------------------------------------------------------------
      // Test battle (Debug Mode only)
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.USE) && DEBUG) {
        Input.update();
        if (await pbConfirmMessage(_INTL("Test battle this Max Raid species?"))) {
          await pbMessage(_INTL("Choose any desired raid criteria for this battle."));
          // (Loaded here so the Debug menu's options register in their own order; debug/index.ts.)
          const { pbDebugMaxRaidBattle } = await import("./Debug");
          await pbDebugMaxRaidBattle(pkmn);
        }
      //-------------------------------------------------------------------------
      // Plays the species cry.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.ACTION)) {
        Input.update();
        pkmndata = Species.get(pkmn);
        SpeciesFiles.playCryFromSpecies(pkmndata.species, form);
      //-------------------------------------------------------------------------
      // Returns to selection mode.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        Input.update();
        break;
      }
    }
    pbDisposeSpriteHash(this.datasprites);
    this.dataviewport.dispose();
  }
}

//===============================================================================
// Calls the Max Raid Database.
//===============================================================================
export class RaidDataScreen {
  constructor(private scene: RaidDataScene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbRaidData();
    await this.scene.pbEndScene();
  }
}

export async function pbOpenRaidData(): Promise<void> {
  await pbFadeOutIn(async () => {
    const scene = new RaidDataScene();
    const screen = new RaidDataScreen(scene);
    await screen.pbStartScreen();
  });
}

//-------------------------------------------------------------------------------
// Adds the Raid Database to the Pokegear if unlocked.
// (Commented out in this game, Raid_Database.rb:1055-1064.)
//-------------------------------------------------------------------------------
