// Port of Plugins/ZUD Mechanics/[010] Adventures/LairMenu_Base.rb: the base of
// every Max Lair menu (MaxLairEventScene: background, party slots, the
// rental/swap/item/stat/tutor screens' drawing, tutor move generation and
// the scene utilities). The menus themselves are in LairMenu_Menus.ts (Ruby
// reopens the class; they're installed on its prototype).
//
// Ruby loads each graphic as it draws it; here the menu's graphics are fetched
// in pbStartScene and the Pokémon/item icons before each screen draws them.

import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Stat } from "../../data/gameData/stat";
import { Type } from "../../data/gameData/type";
import { Ability } from "../../data/gameData/ability";
import type { Id } from "../../data/gameData/gameData";
import type { Bitmap } from "../../rgss/Bitmap";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { drawTextEx, pbDrawImagePositions, pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../../ui/fades";
import { _INTL, pbBottomLeftLines, pbBottomRight, pbDisposeSpriteHash, pbDisposed, pbSetSmallFont } from "../../ui/messageConfig";
import { preloadBitmaps } from "../../ui/rpgCache";
import { asHash } from "../../ui/scenes/frames";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { HeldItemIconSprite, ItemIconSprite, preloadHeldItemIcons, preloadItemIcons } from "../../ui/sprites/itemIcon";
import { PokemonIconSprite, preloadPokemonIcons } from "../../ui/sprites/pokemonIcon";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../../ui/summary/summary";
import { Window_AdvancedTextPokemon, Window_CommandPokemon } from "../../ui/windows/SpriteWindowText";
import { pbPlayCancelSE, pbPlayDecisionSE, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { raidGenerateMovelists } from "../maxRaid/Raid_Setup";
import { sample } from "../maxRaid/random";
import { pbDynamaxAdventure } from "./Adventure_Main";

const player = () => G.player as unknown as Player;

/** The graphics every Max Lair menu draws. */
const MENU_PATH = "Graphics/Plugins/ZUD/Adventure/Menus/";
export const LAIR_MENU_GRAPHICS = [
  MENU_PATH + "menu_bg", MENU_PATH + "menu", MENU_PATH + "menu_slot", MENU_PATH + "menu_header", MENU_PATH + "stat_icons",
  "Graphics/Plugins/ZUD/Raid Den/raid_party_bg", "Graphics/Pictures/rightarrow", "Graphics/Pictures/leftarrow",
  "Graphics/Pictures/Controls help/help_actionkey", "Graphics/Pictures/types", "Graphics/Pictures/category",
  "Graphics/Plugins/ZUD/UI/gfactor",
];

/** Fetches the icons a menu shows for these Pokémon (party icons and held items). */
export async function preloadLairPokemon(pkmns: (Pokemon | null | undefined)[]): Promise<void> {
  await Promise.all([preloadPokemonIcons(pkmns), preloadHeldItemIcons(pkmns.map((p) => p?.itemId))]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MenuSprite = any;

//===============================================================================
// Base setup for all Max Lair menus.
//===============================================================================
export class MaxLairEventScene {
  static readonly BASE = new Color(248, 248, 248);
  static readonly SHADOW = new Color(0, 0, 0);

  rentals: Pokemon[] = [];
  rentalparty: Pokemon[] = [];
  textPos: TextPosition[] = [];
  imagePos: unknown[] = [];
  size = 3;
  path = MENU_PATH;
  partyPath = "Graphics/Plugins/ZUD/Raid Den/raid_party_bg";
  viewport!: Viewport;
  sprites: Record<string, MenuSprite> = {};
  xpos = 0;
  ypos = 0;
  menudisplay!: Bitmap;
  changesprites!: Bitmap;
  statictext!: Bitmap;
  changetext!: Bitmap;
  typebitmap!: AnimatedBitmap;
  categorybitmap!: AnimatedBitmap;
  statbitmap!: AnimatedBitmap;

  //-----------------------------------------------------------------------------
  // Begins the screen.
  //-----------------------------------------------------------------------------
  async pbStartScene(showParty = true): Promise<void> {
    await preloadBitmaps(LAIR_MENU_GRAPHICS);
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    this.rentals = [];
    this.rentalparty = [];
    this.textPos = [];
    this.imagePos = [];
    this.size = 3;
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    const icon = (key: string, x: number, y: number, file: string) => {
      const s = this.sprites[key] = new IconSprite(x, y, this.viewport);
      s.setBitmapFile(file);
      return s;
    };
    icon("background", 0, 0, this.path + "menu_bg");
    const prizebg = icon("prizebg", 0, 0, this.path + "menu");
    prizebg.srcRect.set(0, 0, 197, 384);
    prizebg.visible = false;
    const menu = icon("menu", 197, 0, this.path + "menu");
    menu.srcRect.set(197, 0, 315, 384);
    menu.visible = false;
    this.xpos = Graphics.width - 330;
    this.ypos = 39;
    for (let i = 0; i < 3; i++) {
      const slot = icon(`pokeslot${i}`, this.xpos, this.ypos + (i * 114), this.path + "menu_slot");
      slot.srcRect.set(0, 110, 330, 115);
      slot.visible = false;
    }
    const slotsel = icon("slotsel", this.xpos, this.ypos, this.path + "menu_slot");
    slotsel.srcRect.set(0, 0, 166, 108);
    slotsel.visible = false;
    const rightarrow = this.sprites.rightarrow = AnimatedSprite.createLong("Graphics/Pictures/rightarrow", 8, 40, 28, 2, this.viewport);
    rightarrow.x = this.xpos - 30;
    rightarrow.play();
    rightarrow.visible = false;
    const leftarrow = this.sprites.leftarrow = AnimatedSprite.createLong("Graphics/Pictures/leftarrow", 8, 40, 28, 2, this.viewport);
    leftarrow.x = this.xpos - 42;
    leftarrow.play();
    leftarrow.visible = false;
    const action = icon("actionbutton", 6, 350, "Graphics/Pictures/Controls help/help_actionkey");
    action.zoomX = 0.5;
    action.zoomY = 0.5;
    action.visible = false;
    for (let i = 0; i < 6; i++) {
      icon(`partybg${i}`, 4, 90 + (i * 40), this.partyPath).visible = showParty && i < this.size;
      const name = icon(`partyname${i}`, 40, 99 + (i * 40), this.path + "menu_slot");
      name.srcRect.set(166, 20, 150, 20);
      name.visible = showParty && i < this.size;
    }
    const layer = (key: string, small: boolean) => {
      const s = this.sprites[key] = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
      s.z += 1;
      if (small) pbSetSmallFont(s.bitmap!);
      return s.bitmap!;
    };
    this.menudisplay = layer("menudisplay", false);
    this.changesprites = layer("changesprites", false);
    this.statictext = layer("statictext", true);
    this.changetext = layer("changetext", true);
    drawTextEx(this.statictext, 4, 6, 164, 0, _INTL("DYNAMAX ADVENTURE"), BASE, SHADOW);
    this.typebitmap = new AnimatedBitmap("Graphics/Pictures/types");
    this.categorybitmap = new AnimatedBitmap("Graphics/Pictures/category");
    this.statbitmap = new AnimatedBitmap(this.path + "stat_icons");
    const messagebox = this.sprites.messagebox = new Window_AdvancedTextPokemon("");
    messagebox.viewport = this.viewport;
    messagebox.visible = false;
    messagebox.letterbyletter = true;
    pbBottomLeftLines(messagebox, 2);
    pbSEPlay("GUI trainer card open");
  }

  //-----------------------------------------------------------------------------
  // Draws the Summary screen for inputted Pokemon.
  //-----------------------------------------------------------------------------
  async pbSummary(pokemon: Pokemon[], pkmnid: number, hidesprites: Record<string, MenuSprite>): Promise<void> {
    const oldsprites = await pbFadeOutAndHide(asHash(hidesprites), () => this.pbUpdate());
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene, true);
    await screen.pbStartScreen(pokemon, pkmnid);
    await pbFadeInAndShow(asHash(hidesprites), oldsprites, () => this.pbUpdate());
  }

  //-----------------------------------------------------------------------------
  // Draws the type icons for Pokemon and Moves.
  //-----------------------------------------------------------------------------
  pbDrawTypeIcons(poke: Pokemon, sprite: MenuSprite): void {
    const ypos = sprite.y + 2;
    poke.types().forEach((type, i) => {
      const typeNumber = Type.get(type).iconPosition;
      const typeRect = new Rect(0, typeNumber * 28, 64, 28);
      const typeY = i === 1 ? ypos + 32 : ypos;
      this.changesprites.blt(this.xpos + 86, typeY, this.typebitmap.bitmap, typeRect);
    });
  }

  //-----------------------------------------------------------------------------
  // Draws the icons used to display a Pokemon's stat training.
  //-----------------------------------------------------------------------------
  pbDrawStatIcons(poke: Pokemon, sprite: MenuSprite, rental = false): void {
    let stat = 0;
    const xpos = rental ? Graphics.width - 34 : sprite.x + 55;
    const ypos = rental ? sprite.y - 2 : sprite.y + 5;
    for (const s of Stat.eachMain()) {
      if (s.id === "HP" || poke.ev[s.id]! < 252) continue;
      stat = s.pbsOrder;
      break;
    }
    this.changesprites.blt(xpos, ypos, this.statbitmap.bitmap, new Rect(stat * 32, 0, 32, 32));
  }

  //-----------------------------------------------------------------------------
  // Draws an array of Pokemon to display, usually the player's current party.
  //-----------------------------------------------------------------------------
  pbDrawParty(party: Pokemon[], showname = true): void {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    party.forEach((pkmn, i) => {
      // (Ruby makes new sprites each time and leaves the old ones undisposed.)
      this.sprites[`partysprite${i}`]?.dispose();
      const s = this.sprites[`partysprite${i}`] = new PokemonIconSprite(pkmn, this.viewport);
      const spritex = s.x = this.sprites[`partybg${i}`].x + 2;
      const spritey = s.y = this.sprites[`partybg${i}`].y - 2;
      s.zoomX = 0.5;
      s.zoomY = 0.5;
      if (showname) {
        this.textPos.push([_INTL("{1}", pkmn.name), spritex + 40, spritey + 13, 0, BASE, SHADOW]);
        pbDrawTextPositions(this.changetext, this.textPos);
      }
    });
  }

  /** The rental/swap slot of one Pokémon (name, gender, Ability, moves, stat and type icons). */
  private drawPokemonSlot(poke: Pokemon, slot: MenuSprite, spritex: number, spritey: number): void {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    const offset = poke.genderless() ? -4 : 12;
    const name = poke.name;
    const abil = Ability.get(poke.abilityId!).name;
    let mark = "", base: Color | null = null, shadow: Color | null = null;
    if (poke.male()) [mark, base, shadow] = ["♂", new Color(24, 112, 216), new Color(136, 168, 208)];
    if (poke.female()) [mark, base, shadow] = ["♀", new Color(248, 56, 32), new Color(224, 152, 144)];
    if (!poke.genderless()) this.textPos.push([mark, spritex - 4, spritey + 67, 0, base, shadow]);
    this.textPos.push([_INTL("{1}", name), spritex + offset, spritey + 68, 0, BASE, SHADOW]);
    this.textPos.push([_INTL("{1}", abil), spritex - 4, spritey + 88, 0, BASE, SHADOW]);
    poke.moves.forEach((m, i) => {
      const xpos = spritex + 160;
      const ypos = (spritey + 22) + (i * 22);
      const move = Move.get(m.id).name;
      this.textPos.push([_INTL("{1}", move), xpos, ypos, 0, SHADOW, BASE]);
    });
    this.pbDrawStatIcons(poke, slot, true);
  }

  //-----------------------------------------------------------------------------
  // Draws all core info for a Pokemon rental screen.
  //-----------------------------------------------------------------------------
  async pbDrawRentalScreen(): Promise<void> {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    await preloadLairPokemon(this.rentalparty);
    this.pbDrawParty(this.rentalparty);
    const remainder = this.size - this.rentalparty.length;
    if (remainder > 0) {
      this.textPos.push([_INTL("Select {1} more rental Pokémon.", remainder), 230, 5, 0, BASE, SHADOW]);
      for (let i = 0; i < this.size; i++) this.rentals.push(pbDynamaxAdventure().generateRental());
      await preloadLairPokemon(this.rentals);
      for (let i = 0; i < this.size; i++) {
        this.sprites[`pokeslot${i}`].visible = true;
        const gmax = this.sprites[`gmaxsprite${i}`] = new IconSprite(0, 0, this.viewport);
        gmax.setBitmapFile("Graphics/Plugins/ZUD/UI/gfactor");
        const icon = this.sprites[`pkmnsprite${i}`] = new PokemonIconSprite(this.rentals[i]!, this.viewport);
        const spritex = icon.x = this.xpos + 12;
        const spritey = icon.y = this.ypos + (i * 114);
        gmax.x = spritex - 4;
        gmax.y = spritey + 4;
        gmax.visible = this.rentals[i]!.gmaxFactor;
        this.sprites[`helditem${i}`] = new HeldItemIconSprite(spritex - 8, spritey + 40, this.rentals[i]!, this.viewport);
        this.drawPokemonSlot(this.rentals[i]!, this.sprites[`pokeslot${i}`], spritex, spritey);
        this.pbDrawTypeIcons(this.rentals[i]!, icon);
      }
    }
    pbDrawTextPositions(this.changetext, this.textPos);
  }

  //-----------------------------------------------------------------------------
  // Draws all core info for a Pokemon exchange screen.
  //-----------------------------------------------------------------------------
  async pbDrawSwapScreen(pokemon: Pokemon | null = null): Promise<void> {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    await preloadLairPokemon([...player().party, pokemon]);
    this.pbDrawParty(player().party);
    if (pokemon) {
      const slot = 1;
      this.sprites[`pokeslot${slot}`].visible = true;
      const gmax = this.sprites.gmaxsprite = new IconSprite(0, 0, this.viewport);
      gmax.setBitmapFile("Graphics/Plugins/ZUD/UI/gfactor");
      const icon = this.sprites.pkmnsprite = new PokemonIconSprite(pokemon, this.viewport);
      const spritex = icon.x = this.xpos + 12;
      const spritey = icon.y = this.ypos + (slot * 114);
      this.sprites.slotsel.y = this.sprites[`pokeslot${slot}`].y;
      gmax.x = spritex - 4;
      gmax.y = spritey + 4;
      gmax.visible = pokemon.gmaxFactor;
      this.sprites.helditem = new HeldItemIconSprite(spritex - 8, spritey + 40, pokemon, this.viewport);
      pbDrawImagePositions(this.changesprites, [[this.path + "menu_slot", this.xpos + 10, spritey - 15, 166, 0, 60, 20]]);
      this.drawPokemonSlot(pokemon, this.sprites[`pokeslot${slot}`], spritex, spritey);
      this.pbDrawTypeIcons(pokemon, icon);
      this.sprites.actionbutton.visible = true;
      this.textPos.push([_INTL("Summary"), 62, 353, 0, BASE, SHADOW]);
    }
    pbDrawTextPositions(this.changetext, this.textPos);
  }

  //-----------------------------------------------------------------------------
  // Draws all core info for a Pokemon held item equip screen.
  //-----------------------------------------------------------------------------
  async pbDrawItemScreen(items: Id[]): Promise<void> {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    await preloadItemIcons(items);
    items.forEach((item, i) => {
      const spritex = this.xpos + 80;
      const spritey = 56 + (i * 40);
      const bg = this.sprites[`itembg${i}`] = new IconSprite(spritex, spritey, this.viewport);
      bg.setBitmapFile(this.partyPath);
      const name = this.sprites[`itemname${i}`] = new IconSprite(spritex + 36, spritey + 9, this.viewport);
      name.setBitmapFile(this.path + "menu_slot");
      name.srcRect.set(166, 20, 150, 20);
      const icon = this.sprites[`itemsprite${i}`] = new ItemIconSprite(spritex + 19, spritey + 18, item, this.viewport);
      icon.zoomX = 0.5;
      icon.zoomY = 0.5;
      this.textPos.push([_INTL("{1}", Item.get(item).name), spritex + 40, spritey + 11, 0, BASE, SHADOW]);
    });
    pbDrawTextPositions(this.changetext, this.textPos);
  }

  //-----------------------------------------------------------------------------
  // Draws all core info for a Pokemon EV training screen.
  //-----------------------------------------------------------------------------
  pbDrawStatScreen(stats: [string, number][]): void {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    player().party.forEach((pkmn, i) => this.pbDrawStatIcons(pkmn, this.sprites[`partysprite${i}`]));
    stats.forEach((stat, i) => {
      const spritex = this.xpos + 80;
      const spritey = 56 + (i * 40);
      const bg = this.sprites[`statbg${i}`] = new IconSprite(spritex, spritey, this.viewport);
      bg.setBitmapFile(this.partyPath);
      const name = this.sprites[`statname${i}`] = new IconSprite(spritex + 36, spritey + 9, this.viewport);
      name.setBitmapFile(this.path + "menu_slot");
      name.srcRect.set(166, 20, 150, 20);
      this.menudisplay.blt(spritex + 2, spritey + 3, this.statbitmap.bitmap, new Rect(stat[1] * 32, 0, 32, 32));
      this.textPos.push([_INTL("{1} Training", stat[0]), spritex + 40, spritey + 11, 0, BASE, SHADOW]);
    });
    pbDrawTextPositions(this.changetext, this.textPos);
  }

  //-----------------------------------------------------------------------------
  // Draws all core info for a Pokemon move tutor screen.
  //-----------------------------------------------------------------------------
  pbDrawTutorScreen(movesToLearn: number, pokemon: Pokemon, newmove: Id | null): void {
    const BASE = MaxLairEventScene.BASE, SHADOW = MaxLairEventScene.SHADOW;
    const slot = 1;
    const textPos: TextPosition[] = [];
    const spritex = this.xpos + 12;
    const spritey = this.ypos + (slot * 114);
    this.menudisplay.clear();
    this.changesprites.clear();
    textPos.push([_INTL("Select {1} more move(s) to tutor.", movesToLearn), 230, 5, 0, BASE, SHADOW]);
    if (newmove) {
      this.sprites.slotsel.y = this.sprites[`pokeslot${slot}`].y;
      this.sprites.slotsel.visible = true;
      pbDrawImagePositions(this.changesprites, [[this.path + "menu_slot", this.xpos + 10, spritey - 15, 166, 0, 60, 20]]);
      const m = Move.get(newmove);
      const damage = m.baseDamage > 0 ? m.baseDamage : "---";
      const accuracy = m.accuracy > 0 ? m.accuracy : "---";
      const typerect = new Rect(0, Type.get(m.type).iconPosition * 28, 64, 28);
      const catrect = new Rect(0, m.category * 28, 64, 28);
      this.changesprites.blt(spritex - 4, spritey + 42, this.typebitmap.bitmap, typerect);
      this.changesprites.blt(spritex - 4, spritey + 74, this.categorybitmap.bitmap, catrect);
      textPos.push([_INTL("{1}", m.name), spritex - 4, spritey + 18, 0, BASE, SHADOW]);
      textPos.push([_INTL("BP: {1}", damage), spritex + 72, spritey + 46, 0, BASE, SHADOW]);
      textPos.push([_INTL("AC: {1}", accuracy), spritex + 72, spritey + 66, 0, BASE, SHADOW]);
      textPos.push([_INTL("PP: {1}", m.totalPp), spritex + 72, spritey + 86, 0, BASE, SHADOW]);
      this.pbDrawStatIcons(pokemon, this.sprites[`pokeslot${slot}`], true);
      pokemon.moves.forEach((mv, i) => {
        const xpos = spritex + 160;
        const ypos = (spritey + 22) + (i * 22);
        textPos.push([_INTL("{1}", Move.get(mv.id).name), xpos, ypos, 0, SHADOW, BASE]);
      });
    } else {
      this.sprites.slotsel.visible = false;
      textPos.push([_INTL("No moves to learn."), spritex + 80, spritey + 50, 0, SHADOW, BASE]);
    }
    pbSetSmallFont(this.menudisplay);
    pbDrawTextPositions(this.menudisplay, textPos);
  }

  //-----------------------------------------------------------------------------
  // Used to generate an appropriate tutor move for a Pokemon.
  //-----------------------------------------------------------------------------
  pbGenerateTutorMove(pkmn: Pokemon, oldmove: Id | null = null): Id | null {
    const pokemoves = pkmn.moves.map((move) => move.id);
    const tutormoves: Id[] = [];
    // movelist.flatten!.compact!
    const movelist = raidGenerateMovelists(pkmn.speciesData().id, true).flat().filter((m) => m != null);
    for (const m of movelist) {
      if (m === oldmove) continue;
      if (pokemoves.includes(m)) continue;
      switch (Move.get(m).category) {
        case 0: // Physical
          if (pkmn.ev["SPECIAL_ATTACK"] === 252) continue;
          break;
        case 1: // Special
          if (pkmn.ev["ATTACK"] === 252) continue;
          break;
      }
      tutormoves.push(m);
    }
    return tutormoves.length === 0 ? oldmove : sample(tutormoves);
  }

  //-----------------------------------------------------------------------------
  // Scene utilities.
  //-----------------------------------------------------------------------------
  async pbShowCommands(commands: string[], index = 0): Promise<number> {
    let ret = -1;
    const cmdwindow = new Window_CommandPokemon(commands);
    try {
      cmdwindow.z = this.viewport.z + 1;
      cmdwindow.index = index;
      pbBottomRight(cmdwindow);
      for (;;) {
        await Graphics.update();
        Input.update();
        cmdwindow.update();
        this.pbUpdate();
        if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          ret = -1;
          break;
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          ret = cmdwindow.index;
          break;
        }
      }
    } finally {
      cmdwindow.dispose();
    }
    return ret;
  }

  pbClearAll(): void {
    this.rentals.length = 0;
    this.textPos.length = 0;
    this.imagePos.length = 0;
    this.changetext.clear();
    this.changesprites.clear();
  }

  pbUpdate(): void {
    for (const sprite of Object.values(this.sprites)) {
      if (sprite && !pbDisposed(sprite)) sprite.update();
    }
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  }
}
