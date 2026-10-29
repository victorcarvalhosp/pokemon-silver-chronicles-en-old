// Port of 017_Minigames/002_Minigame_TripleTriad.rb, as this game changed it
// (custom cards, card names from TriadCard, prices x10, sell at 1/8), plus the
// methods Plugins/Triple Triad Booster Packs adds to TriadCard
// (TripleTriad_Improvements.rb: createImprovedBack, createModifiedBitmap;
// TripleTriad_Binder.rb: createNewBitmap), which are in the class here. The
// plugin's pbBuyTriads replaces this file's (TripleTriad_Improvements.ts);
// the binder and the card animation are in their own files.
//
// Card storage is $PokemonGlobal.triads (saved through PokemonGlobalExtras).
// Cards are species IDs ("PIKACHU", "RATTATA_1": a species-form ID read as a
// species with form 0) or this game's custom cards ("OAK").
//
// The scene's loops run once per original 40 fps frame (common.ts); the
// card bitmaps are drawn from graphics preloaded by preloadTriadCards.

import { Effectiveness } from "../data/gameData/type";
import { Species } from "../data/gameData/species";
import { Type } from "../data/gameData/type";
import type { Id } from "../data/gameData/gameData";
import { assetExists } from "../core/assets";
import { rand } from "../core/random";
import { pbBGMFade, pbBGMPlay, pbPlayBuzzerSE, pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../game/GameSystem";
import { ItemStorageHelper, type ItemSlot } from "../game/items/PokemonBag";
import { PokemonGlobalExtras } from "../game/battle/globalExtras";
import { Bitmap } from "../rgss/Bitmap";
import { Sprite, Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, Rect } from "../rgss/types";
import { AnimatedBitmap } from "../ui/AnimatedBitmap";
import { pbDrawTextPositions } from "../ui/drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutInWithMusic } from "../ui/fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../ui/messageConfig";
import { ChooseNumberParams, pbConfirmMessage, pbGetGoldString, pbMessage, pbMessageChooseNumber } from "../ui/messages";
import { pbScrollMap, toSFormatted } from "../ui/mart/PokemonMart";
import { addBackgroundPlane } from "../ui/planes";
import { preloadBitmaps } from "../ui/rpgCache";
import { asHash, type Sprites } from "../ui/scenes/frames";
import { speciesIconFilename } from "../ui/sprites/pokemonIcon";
import { Window_AdvancedTextPokemon, Window_CommandPokemonEx, Window_UnformattedTextPokemon } from "../ui/windows/SpriteWindowText";
import { OriginalFrames, player, pokemonGlobal, RUBY_FRAME_RATE, rubySample, spaceship } from "./common";
import { rubySortBy } from "../game/encounters/rubySort";

const exists = (path: string) => (assetExists(path) ? path : null);

//===============================================================================
// Card class
//===============================================================================

// Order of the properties: species, form, real name, type, north, east, south, west

export function pbGetCustomCards(): CustomTriadCard[] {
  const cardOak = new CustomTriadCard("OAK", "Professor Oak", "NORMAL", 10, 9, 8, 7);
  const cardOak2 = new CustomTriadCard("OAK_2", "Professor Oak 2", "NORMAL", 10, 9, 8, 7);
  const rattata2 = new CustomTriadCard("RATTATA_2", "Rattata", "NORMAL", 3, 4, 2, 1);

  const customCards = [cardOak, cardOak2, rattata2];
  return customCards;
}

// We have one triad card for each Pokemon species and form
// But we have custom cards that are not Pokemon or different cards for the same pokemon form
// We create a new class to handle these custom cards - We give the same properties as
// a Pokemon have to facilitate the handling of the cards later
export class CustomTriadCard {
  constructor(
    readonly species: Id,
    readonly name: string,
    readonly type: Id,
    readonly north: number,
    readonly east: number,
    readonly south: number,
    readonly west: number,
  ) {}
}

export class TriadCard {
  readonly species: Id;
  readonly form: number;
  north = 0;
  east = 0;
  south = 0;
  west = 0;
  type: Id = "NORMAL";
  name = "";

  readCard(species: Id, form = 0): void {
    let speciesData = Species.getSpeciesForm(species, form);
    if (!speciesData) {
      const speciesToFind = species;
      const foundCard = pbGetCustomCards().find((card) => card.species === speciesToFind);
      // NOTE (Ruby parity): 002_Minigame_TripleTriad.rb:54 reads found_card.species
      // without checking it; a card that is neither a species nor a custom
      // card raises NoMethodError on nil.
      if (!foundCard) throw new TypeError(`undefined method 'species' for nil (Triple Triad card ${species})`);
      this.name = foundCard.name;
      this.type = foundCard.type;
      this.west = foundCard.west;
      this.east = foundCard.east;
      this.north = foundCard.north;
      this.south = foundCard.south;
    } else {
      speciesData = Species.getSpeciesForm(this.species, this.form)!;
      const baseStats = speciesData.baseStats;
      const hp = baseStats.HP!;
      const attack = baseStats.ATTACK!;
      const defense = baseStats.DEFENSE!;
      const spAtk = baseStats.SPECIAL_ATTACK!;
      const spDef = baseStats.SPECIAL_DEFENSE!;
      const speed = baseStats.SPEED!;
      this.name = speciesData.formName || speciesData.realName;
      this.type = speciesData.types[0]!;
      if (this.type === "NORMAL" && speciesData.types[1]) this.type = speciesData.types[1];
      this.west = this.baseStatToValue(attack + Math.floor(speed / 3));
      this.east = this.baseStatToValue(defense + Math.floor(hp / 3));
      this.north = this.baseStatToValue(spAtk + Math.floor(speed / 3));
      this.south = this.baseStatToValue(spDef + Math.floor(hp / 3));
    }
  }

  constructor(species: Id, form = 0) {
    this.species = species;
    this.form = form;
    this.readCard(species, form);
  }

  baseStatToValue(stat: number): number {
    if (stat >= 189) return 10;
    if (stat >= 160) return 9;
    if (stat >= 134) return 8;
    if (stat >= 115) return 7;
    if (stat >= 100) return 6;
    if (stat >= 86) return 5;
    if (stat >= 73) return 4;
    if (stat >= 60) return 3;
    if (stat >= 45) return 2;
    return 1;
  }

  attack(panel: number): number {
    return [this.west, this.east, this.north, this.south][panel]!;
  }

  defense(panel: number): number {
    return [this.east, this.west, this.south, this.north][panel]!;
  }

  bonus(opponent: TriadCard): number {
    switch (Effectiveness.calculateOne(this.type, opponent.type)) {
      case Effectiveness.INEFFECTIVE: return -2;
      case Effectiveness.NOT_VERY_EFFECTIVE_ONE: return -1;
      case Effectiveness.SUPER_EFFECTIVE_ONE: return 1;
    }
    return 0;
  }

  price(): number {
    const maxValue = Math.max(this.north, this.east, this.south, this.west);
    let ret = (this.north * this.north) + (this.east * this.east) + (this.south * this.south) + (this.west * this.west);
    ret += maxValue * maxValue;
    ret *= maxValue;
    ret *= (this.north + this.east + this.south + this.west);
    ret = Math.floor(ret / 10); // Ranges from 2 to 24,000
    // Quantize prices to the next highest "unit"
    if (ret > 10_000) {
      ret = (1 + Math.floor(ret / 1000)) * 1000;
    } else if (ret > 5000) {
      ret = (1 + Math.floor(ret / 500)) * 500;
    } else if (ret > 1000) {
      ret = (1 + Math.floor(ret / 100)) * 100;
    } else if (ret > 500) {
      ret = (1 + Math.floor(ret / 50)) * 50;
    } else {
      ret = (1 + Math.floor(ret / 10)) * 10;
    }
    return ret * 10; // Prices are multiplied by 10 as I want to make the cards much more expensive (@todo: evaluate if 10 is too much)
  }

  static createBack(type: Id | null = null, noback = false): Bitmap {
    const bitmap = new Bitmap(80, 96);
    if (!noback) {
      const cardbitmap = new AnimatedBitmap("Graphics/Pictures/triad_card_opponent");
      bitmap.blt(0, 0, cardbitmap.bitmap, new Rect(0, 0, cardbitmap.width, cardbitmap.height));
      cardbitmap.dispose();
    }
    if (type) {
      const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
      const typeNumber = Type.get(type).iconPosition;
      const typerect = new Rect(0, typeNumber * 28, 64, 28);
      bitmap.blt(8, 50, typebitmap.bitmap, typerect, 192);
      typebitmap.dispose();
    }
    return bitmap;
  }

  createBitmap(owner: number): Bitmap {
    if (owner === 0) return TriadCard.createBack();
    const bitmap = new Bitmap(80, 96);
    let cardbitmap: AnimatedBitmap;
    if (owner === 2) { // Opponent
      cardbitmap = new AnimatedBitmap("Graphics/Pictures/triad_card_opponent");
    } else { // Player
      cardbitmap = new AnimatedBitmap("Graphics/Pictures/triad_card_player");
    }
    const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    const iconbitmap = new AnimatedBitmap(triadIconFilename(this.species, this.form));
    const numbersbitmap = new AnimatedBitmap("Graphics/Pictures/triad_numbers");
    // Draw card background
    bitmap.blt(0, 0, cardbitmap.bitmap, new Rect(0, 0, cardbitmap.width, cardbitmap.height));
    // Draw type icon
    const typeNumber = Type.get(this.type).iconPosition;
    const typerect = new Rect(0, typeNumber * 28, 64, 28);
    bitmap.blt(8, 50, typebitmap.bitmap, typerect, 192);
    // Draw Pokémon icon
    bitmap.blt(8, 24, iconbitmap.bitmap, new Rect(0, 0, 64, 64));
    // Draw numbers
    bitmap.blt(8, 16, numbersbitmap.bitmap, new Rect(this.west * 16, 0, 16, 16));
    bitmap.blt(22, 6, numbersbitmap.bitmap, new Rect(this.north * 16, 0, 16, 16));
    bitmap.blt(36, 16, numbersbitmap.bitmap, new Rect(this.east * 16, 0, 16, 16));
    bitmap.blt(22, 26, numbersbitmap.bitmap, new Rect(this.south * 16, 0, 16, 16));
    cardbitmap.dispose();
    typebitmap.dispose();
    iconbitmap.dispose();
    numbersbitmap.dispose();
    return bitmap;
  }

  //-----------------------------------------------------------------------------
  // TripleTriad_Improvements.rb (Triple Triad changes made by victordevjs)
  //-----------------------------------------------------------------------------
  static createImprovedBack(type: Id | null = null, noback = false): Bitmap {
    const bitmap = new Bitmap(80, 96);
    if (!noback) {
      const cardbitmap = new AnimatedBitmap("Graphics/Pictures/Triple Triad/triad_card_back");
      bitmap.blt(0, 0, cardbitmap.bitmap, new Rect(0, 0, cardbitmap.width, cardbitmap.height));
      cardbitmap.dispose();
    }
    if (type) {
      const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
      const typeNumber = Type.get(type).iconPosition;
      const typerect = new Rect(0, typeNumber * 28, 64, 28);
      bitmap.blt(8, 50, typebitmap.bitmap, typerect, 192);
      typebitmap.dispose();
    }
    return bitmap;
  }

  createModifiedBitmap(owner: number, isOnBoard = false): Bitmap {
    if (owner === 0) return TriadCard.createImprovedBack();
    const bitmap = new Bitmap(80, 96);
    // NOTE (Ruby parity): TripleTriad_Improvements.rb:30 builds "card_#{@type}"
    // (card_FIGHTING, card_STEEL...). Windows matches it to card_fire.png & co.
    // regardless of case, but there is no card_fighting.png or card_steel.png
    // (only card_fight.png), so those cards get a blank 32x32 background.
    const cardbitmap = new AnimatedBitmap(`Graphics/Pictures/Triple Triad/types/card_${this.type}`);

    const filename = triadCardFilename(this.species, this.form);
    const iconbitmap = new AnimatedBitmap(`Graphics/Pictures/Triple Triad/Cards/${filename}`);
    const numbersbitmap = new AnimatedBitmap("Graphics/Pictures/triad_numbers");
    // Draw card background
    bitmap.blt(0, 0, cardbitmap.bitmap, new Rect(0, 0, cardbitmap.width, cardbitmap.height));

    // Draw Pokémon icon
    bitmap.blt(0, 0, iconbitmap.bitmap, new Rect(0, 0, 80, 96));
    // Draw numbers
    bitmap.blt(32, 60, numbersbitmap.bitmap, new Rect(this.north * 16, 0, 16, 16));
    bitmap.blt(14, 69, numbersbitmap.bitmap, new Rect(this.west * 16, 0, 16, 16));
    bitmap.blt(50, 69, numbersbitmap.bitmap, new Rect(this.east * 16, 0, 16, 16));
    bitmap.blt(32, 76, numbersbitmap.bitmap, new Rect(this.south * 16, 0, 16, 16));

    // Let's add some image so we can identify who is owning the card on the board
    if (isOnBoard) {
      let boardOwner: AnimatedBitmap;
      if (owner === 2) { // Opponent
        boardOwner = new AnimatedBitmap("Graphics/Pictures/Triple Triad/triad_card_opponent");
      } else { // Player
        boardOwner = new AnimatedBitmap("Graphics/Pictures/Triple Triad/triad_card_player");
      }
      bitmap.blt(0, 0, boardOwner.bitmap, new Rect(0, 0, 80, 96));
      boardOwner.dispose();
    }

    cardbitmap.dispose();
    iconbitmap.dispose();
    numbersbitmap.dispose();
    return bitmap;
  }

  //-----------------------------------------------------------------------------
  // TripleTriad_Binder.rb (unused by the game)
  //-----------------------------------------------------------------------------
  createNewBitmap(owner: number): Bitmap {
    if (owner === 0) return TriadCard.createBack();
    const bitmap = new Bitmap(80, 96);
    let cardbitmap: AnimatedBitmap;
    if (owner === 2) { // Opponent
      cardbitmap = new AnimatedBitmap("Graphics/Pictures/triad_card_opponent");
    } else { // Player
      cardbitmap = new AnimatedBitmap("Graphics/Pictures/triad_card_player");
    }
    const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    const iconbitmap = new AnimatedBitmap(triadIconFilename(this.species, this.form));
    const numbersbitmap = new AnimatedBitmap("Graphics/Pictures/triad_numbers");
    // Draw card background
    bitmap.blt(0, 0, cardbitmap.bitmap, new Rect(0, 0, cardbitmap.width, cardbitmap.height));
    // Draw type icon
    const typeNumber = Type.get(this.type).iconPosition;
    const typerect = new Rect(0, typeNumber * 28, 64, 28);
    bitmap.blt(8, 50, typebitmap.bitmap, typerect, 192);
    // Draw Pokémon icon
    bitmap.blt(8, 24, iconbitmap.bitmap, new Rect(0, 0, 64, 64));
    // Draw numbers
    bitmap.blt(8, 16, numbersbitmap.bitmap, new Rect(this.west * 16, 0, 16, 16));
    bitmap.blt(22, 6, numbersbitmap.bitmap, new Rect(this.north * 16, 0, 16, 16));
    bitmap.blt(36, 16, numbersbitmap.bitmap, new Rect(this.east * 16, 0, 16, 16));
    bitmap.blt(22, 26, numbersbitmap.bitmap, new Rect(this.south * 16, 0, 16, 16));
    cardbitmap.dispose();
    typebitmap.dispose();
    iconbitmap.dispose();
    numbersbitmap.dispose();
    return bitmap;
  }
}

/** createModifiedBitmap's card picture name: "#{@species}_#{@form}" for forms. */
function triadCardFilename(species: Id, form: number): string {
  return form > 0 ? `${species}_${form}` : species;
}

/** GameData::Species.icon_filename(@species, @form) (nil, and so a crash in AnimatedBitmap, for custom cards). */
function triadIconFilename(species: Id, form: number): string | null {
  return speciesIconFilename({ species, form }, exists);
}

const TRIAD_UI_BITMAPS = [
  "Graphics/Pictures/triad_card_opponent", "Graphics/Pictures/triad_card_player", "Graphics/Pictures/types",
  "Graphics/Pictures/triad_numbers", "Graphics/Pictures/Triple Triad/triad_card_back",
  "Graphics/Pictures/Triple Triad/triad_card_opponent", "Graphics/Pictures/Triple Triad/triad_card_player",
];

/** Fetches what the card bitmaps of these cards draw (call before showing them). */
export async function preloadTriadCards(cards: Iterable<Id>, withIcons = false): Promise<void> {
  const paths = new Set(TRIAD_UI_BITMAPS);
  for (const card of cards) {
    let triad: TriadCard;
    try {
      triad = new TriadCard(card);
    } catch {
      continue; // fails again (as in Ruby) where it's used
    }
    paths.add(`Graphics/Pictures/Triple Triad/types/card_${triad.type}`);
    paths.add(`Graphics/Pictures/Triple Triad/Cards/${triadCardFilename(triad.species, triad.form)}`);
    if (withIcons) {
      const icon = triadIconFilename(triad.species, triad.form);
      if (icon) paths.add(icon);
    }
  }
  await preloadBitmaps(paths);
}

//===============================================================================
// Duel screen visuals
//===============================================================================
export class TriadSquare {
  owner = 0;
  card: TriadCard | null = null;
  type: Id | null = null;

  attack(panel: number): number {
    return this.card!.attack(panel);
  }

  bonus(square: TriadSquare): number {
    return this.card!.bonus(square.card!);
  }

  defense(panel: number): number {
    return this.card!.defense(panel);
  }
}

/** What TriadScreen needs from its scene (TriadScene, or a test stub). */
export interface TriadSceneInterface {
  pbStartScene(battle: TriadScreen): Promise<void>;
  pbEndScene(): Promise<void>;
  pbDisplay(text: string): Promise<void>;
  pbDisplayPaused(text: string): Promise<void>;
  pbNotifyCards(playerCards: Id[], opponentCards: Id[]): void;
  pbChooseTriadCard(cardStorage: ItemSlot[]): Promise<Id[]>;
  pbShowPlayerCards(cards: Id[]): void;
  pbShowOpponentCards(cards: Id[]): Promise<void>;
  pbPlayerChooseCard(numCards: number): Promise<number>;
  pbPlayerPlaceCard(cardIndex: number): Promise<[number, number] | null>;
  pbEndPlaceCard(position: [number, number], cardIndex: number): void;
  pbOpponentPlaceCard(triadCard: TriadCard, position: [number, number], cardIndex: number): void;
  pbEndOpponentPlaceCard(position: [number, number], cardIndex: number): void;
  pbUpdateScore(): void;
}

// Scene class for handling appearance of the screen
export class TriadScene implements TriadSceneInterface {
  private sprites: Sprites = {};
  private bitmaps: Bitmap[] = [];
  private battle!: TriadScreen;
  private viewport!: Viewport;
  private cardBitmaps: (Bitmap | null)[] = [];
  private opponentCardBitmaps: (Bitmap | null)[] = [];
  private cardIndexes: number[] = [];
  private opponentCardIndexes: number[] = [];
  private boardSprites: (Sprite | undefined)[] = [];
  private boardCards: (TriadCard | undefined)[] = [];
  private playerCards: Id[] = [];
  private opponentCards: Id[] = [];
  private frames = new OriginalFrames();

  private spr(key: string): Sprite { return this.sprites[key] as Sprite; }
  private get helpwindow(): Window_AdvancedTextPokemon { return this.sprites.helpwindow as Window_AdvancedTextPokemon; }

  /** Graphics.update; Input.update; pbUpdate */
  private async frame(): Promise<void> {
    await this.frames.update(() => this.pbUpdate());
    Input.update();
  }

  async pbStartScene(battle: TriadScreen): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/Triple Triad/triad_bg", ...TRIAD_UI_BITMAPS]);
    this.sprites = {};
    this.bitmaps = [];
    this.battle = battle;
    // Allocate viewport
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    addBackgroundPlane(this.sprites, "background", "Triple Triad/triad_bg", this.viewport);
    this.sprites.helpwindow = Window_AdvancedTextPokemon.newWithSize(
      "", 0, Graphics.height - 64, Graphics.width, 64, this.viewport,
    );
    for (let i = 0; i < this.battle.width * this.battle.height; i++) {
      const s = new Sprite(this.viewport);
      this.sprites[`sprite${i}`] = s;
      s.x = Math.floor(Graphics.width / 2) - 118 + ((i % 3) * 78);
      s.y = 36 + (Math.floor(i / 3) * 94);
      s.z = 2;
      const bm = TriadCard.createBack(this.battle.board[i]!.type, true);
      this.bitmaps.push(bm);
      s.setBitmap(bm);
    }
    this.cardBitmaps = [];
    this.opponentCardBitmaps = [];
    this.cardIndexes = [];
    this.opponentCardIndexes = [];
    this.boardSprites = [];
    this.boardCards = [];
    for (let i = 0; i < this.battle.maxCards(); i++) {
      const s = new Sprite(this.viewport);
      this.sprites[`player${i}`] = s;
      s.x = Graphics.width - 92;
      s.y = 44 + (44 * i);
      s.z = 2;
      this.cardIndexes.push(i);
    }
    const overlay = new Sprite(this.viewport);
    this.sprites.overlay = overlay;
    overlay.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    pbSetSystemFont(overlay.bitmap!);
    pbDrawTextPositions(
      overlay.bitmap!,
      [[this.battle.opponentName, 52, 10, 2, new Color(248, 248, 248), new Color(96, 96, 96)],
        [this.battle.playerName, Graphics.width - 52, 10, 2, new Color(248, 248, 248), new Color(96, 96, 96)]],
    );
    const score = new Sprite(this.viewport);
    this.sprites.score = score;
    score.setBitmap(new Bitmap(Graphics.width, Graphics.height));
    pbSetSystemFont(score.bitmap!);
    pbBGMPlay("Triple Triad");
    // Fade in all sprites
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbEndScene(): Promise<void> {
    pbBGMFade(1.0);
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    for (const bm of this.bitmaps) bm.dispose();
    this.viewport.dispose();
  }

  async pbDisplay(text: string): Promise<void> {
    this.helpwindow.text = text;
    let timer = 0.0;
    for (;;) {
      await this.frame();
      timer += 1 / RUBY_FRAME_RATE; // Graphics.delta_s
      if (timer >= 1.5) break;
    }
  }

  async pbDisplayPaused(text: string): Promise<void> {
    const helpwindow = this.helpwindow;
    helpwindow.letterbyletter = true;
    helpwindow.text = text + "\x01";
    for (;;) {
      await this.frame();
      if (Input.trigger(Input.USE)) {
        if (helpwindow.busy()) {
          if (helpwindow.pausing()) pbPlayDecisionSE();
          helpwindow.resume();
        } else {
          break;
        }
      }
    }
    helpwindow.letterbyletter = false;
    helpwindow.text = "";
  }

  pbNotifyCards(playerCards: Id[], opponentCards: Id[]): void {
    this.playerCards = playerCards;
    this.opponentCards = opponentCards;
  }

  async pbChooseTriadCard(cardStorage: ItemSlot[]): Promise<Id[]> {
    await preloadTriadCards(cardStorage.map((item) => item[0]));
    let commands: string[] = [];
    const chosenCards: Id[] = [];
    for (const item of cardStorage) {
      const loadedCard = new TriadCard(item[0]);
      commands.push(_INTL("{1} x{2}", loadedCard.name, item[1]));
      // commands.push(_INTL("{1} x{2}", GameData::Species.get(item[0]).name, item[1]))
    }
    const command = Window_CommandPokemonEx.newWithSize(commands, 0, 0, Math.floor(Graphics.width / 2), Graphics.height - 64, this.viewport);
    this.helpwindow.text = _INTL("Choose {1} cards to use for this duel.", this.battle.maxCards());
    const preview = new Sprite(this.viewport);
    preview.x = Math.floor(Graphics.width / 2) + 20;
    preview.y = 60;
    preview.z = 4;
    let index = -1;
    for (let i = 0; i < this.battle.maxCards(); i++) {
      const s = new Sprite(this.viewport);
      this.sprites[`player${i}`] = s;
      s.x = Graphics.width - 92;
      s.y = 44 + (44 * i);
      s.z = 2;
    }
    for (;;) {
      await this.frames.update(() => {
        this.pbUpdate();
        command.update();
      });
      Input.update();
      if (command.index !== index) {
        preview.bitmap?.dispose();
        if (command.index < cardStorage.length) {
          const item = cardStorage[command.index]!;
          // Selecting cards before battle
          preview.setBitmap(new TriadCard(item[0]).createModifiedBitmap(1));
        }
        index = command.index;
      }
      if (Input.trigger(Input.BACK)) {
        if (chosenCards.length > 0) {
          const item = chosenCards.pop()!;
          this.battle.pbAdd(cardStorage, item);
          commands = [];
          for (const it of cardStorage) {
            // NOTE (Ruby parity): 002_Minigame_TripleTriad.rb:358 names the cards
            // with GameData::Species.get here, which raises for custom cards (OAK).
            commands.push(_INTL("{1} x{2}", Species.get(it[0]).name, it[1]));
          }
          command.commands = commands;
          index = -1;
        } else {
          pbPlayBuzzerSE();
        }
      } else if (Input.trigger(Input.USE)) {
        if (chosenCards.length === this.battle.maxCards()) break;
        const item = cardStorage[command.index];
        if (!item || this.battle.quantity(cardStorage, item[0]) === 0) {
          pbPlayBuzzerSE();
        } else {
          pbPlayDecisionSE();
          const sprite = this.spr(`player${chosenCards.length}`);
          sprite.bitmap?.dispose();
          this.cardBitmaps[chosenCards.length] = new TriadCard(item[0]).createModifiedBitmap(1);
          sprite.setBitmap(this.cardBitmaps[chosenCards.length]!);
          chosenCards.push(item[0]);
          this.battle.pbSubtract(cardStorage, item[0]);
          commands = [];
          for (const it of cardStorage) {
            commands.push(_INTL("{1} x{2}", new TriadCard(it[0]).name, it[1]));
          }
          command.commands = commands;
          if (command.index >= commands.length) command.index = commands.length - 1;
          index = -1;
        }
      }
      if (Input.trigger(Input.USE) || Input.trigger(Input.BACK)) {
        for (let i = 0; i < this.battle.maxCards(); i++) {
          this.spr(`player${i}`).visible = (i < chosenCards.length);
        }
        if (chosenCards.length === this.battle.maxCards()) {
          this.helpwindow.text = _INTL("{1} cards have been chosen.", this.battle.maxCards());
          command.visible = false;
          command.active = false;
          preview.visible = false;
        } else {
          this.helpwindow.text = _INTL("Choose {1} cards to use for this duel.", this.battle.maxCards());
          command.visible = true;
          command.active = true;
          preview.visible = true;
        }
      }
    }
    command.dispose();
    preview.bitmap?.dispose();
    preview.dispose();
    return chosenCards;
  }

  pbShowPlayerCards(cards: Id[]): void {
    for (let i = 0; i < this.battle.maxCards(); i++) {
      const s = new Sprite(this.viewport);
      this.sprites[`player${i}`] = s;
      s.x = Graphics.width - 92;
      s.y = 44 + (44 * i);
      s.z = 2;
      s.setBitmap(new TriadCard(cards[i]!).createModifiedBitmap(1));
      this.cardBitmaps.push(s.bitmap);
    }
  }

  async pbShowOpponentCards(cards: Id[]): Promise<void> {
    await preloadTriadCards(cards);
    for (let i = 0; i < this.battle.maxCards(); i++) {
      const s = new Sprite(this.viewport);
      this.sprites[`opponent${i}`] = s;
      s.x = 12;
      s.y = 44 + (44 * i);
      s.z = 2;
      s.setBitmap(this.battle.openHand ? new TriadCard(cards[i]!).createModifiedBitmap(2) : TriadCard.createImprovedBack());
      this.opponentCardBitmaps.push(s.bitmap);
      this.opponentCardIndexes.push(i);
    }
  }

  async pbViewOpponentCards(numCards: number): Promise<number> {
    this.helpwindow.text = _INTL("Check opponent's cards.");
    let choice = 0;
    let lastChoice = -1;
    for (;;) {
      if (lastChoice !== choice) {
        let y = 44;
        for (let i = 0; i < this.opponentCardIndexes.length; i++) {
          const s = this.spr(`opponent${this.opponentCardIndexes[i]}`);
          s.setBitmap(this.opponentCardBitmaps[this.opponentCardIndexes[i]!] ?? null);
          s.x = (i === choice) ? 28 : 12;
          s.y = y;
          s.z = 2;
          y += 44;
        }
        lastChoice = choice;
      }
      if (choice === -1) break;
      await this.frame();
      if (Input.repeat(Input.DOWN)) {
        pbPlayCursorSE();
        choice += 1;
        if (choice >= numCards) choice = 0;
      } else if (Input.repeat(Input.UP)) {
        pbPlayCursorSE();
        choice -= 1;
        if (choice < 0) choice = numCards - 1;
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        choice = -1;
      }
    }
    return choice;
  }

  async pbPlayerChooseCard(numCards: number): Promise<number> {
    if (this.battle.openHand) {
      this.helpwindow.text = _INTL("Choose a card, or check opponent with Z.");
    } else {
      this.helpwindow.text = _INTL("Choose a card.");
    }
    let choice = 0;
    let lastChoice = -1;
    for (;;) {
      if (lastChoice !== choice) {
        let y = 44;
        for (let i = 0; i < this.cardIndexes.length; i++) {
          const s = this.spr(`player${this.cardIndexes[i]}`);
          s.setBitmap(this.cardBitmaps[this.cardIndexes[i]!] ?? null);
          s.x = (i === choice) ? Graphics.width - 108 : Graphics.width - 92;
          s.y = y;
          s.z = (i === choice) ? 3 : 2;
          y += 44;
        }
        lastChoice = choice;
      }
      await this.frame();
      if (Input.repeat(Input.DOWN)) {
        pbPlayCursorSE();
        choice += 1;
        if (choice >= numCards) choice = 0;
      } else if (Input.repeat(Input.UP)) {
        pbPlayCursorSE();
        choice -= 1;
        if (choice < 0) choice = numCards - 1;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        break;
      } else if (Input.trigger(Input.ACTION) && this.battle.openHand) {
        pbPlayDecisionSE();
        await this.pbViewOpponentCards(numCards);
        this.helpwindow.text = _INTL("Choose a card, or check opponent with Z.");
        choice = 0;
        lastChoice = -1;
      }
    }
    return choice;
  }

  async pbPlayerPlaceCard(cardIndex: number): Promise<[number, number] | null> {
    this.helpwindow.text = _INTL("Place the card.");
    let boardX = 0;
    let boardY = 0;
    let doRefresh = true;
    for (;;) {
      if (doRefresh) {
        let y = 44;
        for (let i = 0; i < this.cardIndexes.length; i++) {
          const s = this.spr(`player${this.cardIndexes[i]}`);
          if (i === cardIndex) { // Card being placed
            s.x = Math.floor(Graphics.width / 2) - 118 + (boardX * 78);
            s.y = 36 + (boardY * 94);
            s.z = 4;
          } else { // Other cards in hand
            s.x = Graphics.width - 92;
            s.y = y;
            s.z = 2;
            y += 44;
          }
        }
        doRefresh = false;
      }
      await this.frame();
      if (Input.repeat(Input.DOWN)) {
        pbPlayCursorSE();
        boardY += 1;
        if (boardY >= this.battle.height) boardY = 0;
        doRefresh = true;
      } else if (Input.repeat(Input.UP)) {
        pbPlayCursorSE();
        boardY -= 1;
        if (boardY < 0) boardY = this.battle.height - 1;
        doRefresh = true;
      } else if (Input.repeat(Input.LEFT)) {
        pbPlayCursorSE();
        boardX -= 1;
        if (boardX < 0) boardX = this.battle.width - 1;
        doRefresh = true;
      } else if (Input.repeat(Input.RIGHT)) {
        pbPlayCursorSE();
        boardX += 1;
        if (boardX >= this.battle.width) boardX = 0;
        doRefresh = true;
      } else if (Input.trigger(Input.BACK)) {
        return null;
      } else if (Input.trigger(Input.USE)) {
        if (this.battle.isOccupied(boardX, boardY)) {
          pbPlayBuzzerSE();
        } else {
          pbPlayDecisionSE();
          this.spr(`player${this.cardIndexes[cardIndex]}`).z = 2;
          break;
        }
      }
    }
    return [boardX, boardY];
  }

  pbEndPlaceCard(position: [number, number], cardIndex: number): void {
    const spriteIndex = this.cardIndexes[cardIndex]!;
    const boardIndex = (position[1] * this.battle.width) + position[0];
    this.boardSprites[boardIndex] = this.spr(`player${spriteIndex}`);
    this.boardCards[boardIndex] = new TriadCard(this.playerCards[spriteIndex]!);
    this.pbRefresh();
    this.cardIndexes.splice(cardIndex, 1);
    this.pbUpdateScore();
  }

  pbOpponentPlaceCard(triadCard: TriadCard, position: [number, number], cardIndex: number): void {
    let y = 44;
    for (let i = 0; i < this.opponentCardIndexes.length; i++) {
      const sprite = this.spr(`opponent${this.opponentCardIndexes[i]}`);
      if (i === cardIndex) {
        this.opponentCardBitmaps[this.opponentCardIndexes[i]!] = triadCard.createModifiedBitmap(2);
        sprite.bitmap?.dispose();
        sprite.setBitmap(this.opponentCardBitmaps[this.opponentCardIndexes[i]!]!);
        sprite.x = Math.floor(Graphics.width / 2) - 118 + (position[0] * 78);
        sprite.y = 36 + (position[1] * 94);
        sprite.z = 2;
      } else {
        sprite.x = 12;
        sprite.y = y;
        sprite.z = 2;
        y += 44;
      }
    }
  }

  pbEndOpponentPlaceCard(position: [number, number], cardIndex: number): void {
    const spriteIndex = this.opponentCardIndexes[cardIndex]!;
    const boardIndex = (position[1] * this.battle.width) + position[0];
    this.boardSprites[boardIndex] = this.spr(`opponent${spriteIndex}`);
    this.boardCards[boardIndex] = new TriadCard(this.opponentCards[spriteIndex]!);
    this.pbRefresh();
    this.opponentCardIndexes.splice(cardIndex, 1);
    this.pbUpdateScore();
  }

  pbRefresh(): void {
    for (let i = 0; i < this.battle.width * this.battle.height; i++) {
      const x = i % this.battle.width;
      const y = Math.floor(i / this.battle.width);
      const sprite = this.boardSprites[i];
      if (!sprite) continue;
      sprite.bitmap?.dispose();
      const owner = this.battle.getOwner(x, y);
      // Here we need to apply a different rule for the card color, so we can identify the owner
      sprite.setBitmap(this.boardCards[i]!.createModifiedBitmap(owner, true));
    }
  }

  pbUpdateScore(): void {
    const bitmap = this.spr("score").bitmap!;
    bitmap.clear();
    let playerscore = 0;
    let oppscore = 0;
    for (let i = 0; i < this.battle.width * this.battle.height; i++) {
      if (this.boardSprites[i]) {
        if (this.battle.board[i]!.owner === 1) playerscore += 1;
        if (this.battle.board[i]!.owner === 2) oppscore += 1;
      }
    }
    if (this.battle.countUnplayedCards) {
      playerscore += this.cardIndexes.length;
      oppscore += this.opponentCardIndexes.length;
    }
    pbDrawTextPositions(
      bitmap,
      [[_INTL("{1}-{2}", oppscore, playerscore), Math.floor(Graphics.width / 2), 10, 2, new Color(248, 248, 248), new Color(96, 96, 96)]],
    );
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }
}

//===============================================================================
// Duel screen logic
//===============================================================================
export class TriadScreen {
  openHand = false;
  countUnplayedCards = false;
  readonly width = 3;
  readonly height = 3;
  board: TriadSquare[] = [];
  playerName = "";
  opponentName = "";
  private sameWins = false;
  private wrapAround = false;
  private elements = false;
  private randomHand = false;
  private trade = 0;
  private triadCards: ItemSlot[] = [];

  constructor(private scene: TriadSceneInterface) {}

  maxCards(): number {
    let numcards = this.width * this.height;
    if (numcards % 2 === 1) {
      numcards = Math.floor(numcards / 2) + 1;
    } else {
      numcards = Math.floor(numcards / 2);
    }
    return numcards;
  }

  isOccupied(x: number, y: number): boolean {
    return this.board[(y * this.width) + x]!.owner !== 0;
  }

  getOwner(x: number, y: number): number {
    return this.board[(y * this.width) + x]!.owner;
  }

  getPanel(x: number, y: number): TriadSquare {
    return this.board[(y * this.width) + x]!;
  }

  quantity(items: ItemSlot[], item: Id): number {
    return ItemStorageHelper.quantity(items, item);
  }

  pbAdd(items: ItemSlot[], item: Id): boolean {
    return ItemStorageHelper.add(items, triads().maxSize(), TriadStorage.MAX_PER_SLOT, item, 1);
  }

  pbSubtract(items: ItemSlot[], item: Id): boolean {
    return ItemStorageHelper.remove(items, item, 1);
  }

  flipBoard(x: number, y: number, attackerParam: TriadSquare | null = null, recurse = false): [number, number][] | null {
    const panels = [x - 1, y, x + 1, y, x, y - 1, x, y + 1];
    if (panels[0]! < 0) panels[0] = (this.wrapAround ? this.width - 1 : 0); // left
    if (panels[2]! > this.width - 1) panels[2] = (this.wrapAround ? 0 : this.width - 1); // right
    if (panels[5]! < 0) panels[5] = (this.wrapAround ? this.height - 1 : 0); // top
    if (panels[7]! > this.height - 1) panels[7] = (this.wrapAround ? 0 : this.height - 1); // bottom
    const attacker = attackerParam ?? this.board[(y * this.width) + x]!;
    const flips: [number, number][] = [];
    if (attackerParam && this.board[(y * this.width) + x]!.owner !== 0) return null;
    if (!attacker.card || attacker.owner === 0) return null;
    for (let i = 0; i < 4; i++) {
      const defenderX = panels[i * 2]!;
      const defenderY = panels[(i * 2) + 1]!;
      const defender = this.board[(defenderY * this.width) + defenderX]!;
      if (!defender.card) continue;
      if (attacker.owner !== defender.owner) {
        let attack = attacker.attack(i);
        const defense = defender.defense(i);

        if (this.elements) {
          // attack += attacker.bonus(attacker.type)
          // If attacker's type matches the tile's element, add
          // a bonus of 1 (only for original attacker, not combos)
          if (!recurse && attacker.type === attacker.card.type) attack += 1;
        }
        // Modifier depends on opponent's Pokémon type:
        // +1 - Super effective
        // -1 - Not very effective
        // -2 - Immune
        attack += attacker.bonus(defender);
        if (attack > defense || (attack === defense && this.sameWins)) {
          flips.push([defenderX, defenderY]);
          if (attackerParam == null) {
            defender.owner = attacker.owner;
            if (this.sameWins) {
              // Combo with the "sameWins" rule
              const ret = this.flipBoard(defenderX, defenderY, null, true);
              if (ret) flips.push(...ret);
            }
          } else if (this.sameWins) {
            // Combo with the "sameWins" rule
            const ret = this.flipBoard(defenderX, defenderY, attackerParam, true);
            if (ret) flips.push(...ret);
          }
        }
      }
    }
    return flips;
  }

  // If pbStartScreen includes parameters, it should
  // pass the parameters to pbStartScene.
  async pbStartScreen(opponentName: string, minLevel: number, maxLevel: number, rules: unknown = null,
    oppdeck: unknown = null, prize: Id | null = null): Promise<number> {
    if (minLevel < 0 || minLevel > 9) throw new Error(_INTL("Minimum level must be 0 through 9."));
    if (maxLevel < 0 || maxLevel > 9) throw new Error(_INTL("Maximum level must be 0 through 9."));
    if (maxLevel < minLevel) throw new Error(_INTL("Maximum level shouldn't be less than the minimum level."));
    if (Array.isArray(rules) && rules.length > 0) {
      for (const rule of rules) {
        if (rule === "samewins") this.sameWins = true;
        if (rule === "openhand") this.openHand = true;
        if (rule === "wrap") this.wrapAround = true;
        if (rule === "elements") this.elements = true;
        if (rule === "randomhand") this.randomHand = true;
        if (rule === "countunplayed") this.countUnplayedCards = true;
        if (rule === "direct") this.trade = 1;
        if (rule === "winall") this.trade = 2;
        if (rule === "noprize") this.trade = 3;
      }
    }
    this.triadCards = [];
    let count = 0;
    const storage = triads();
    for (let i = 0; i < storage.length(); i++) {
      const item = storage.at(i)!;
      ItemStorageHelper.add(this.triadCards, storage.maxSize(), TriadStorage.MAX_PER_SLOT, item[0], item[1]);
      count += item[1]; // Add item count to total count
    }
    this.board = [];
    this.playerName = player() ? player().name : "Trainer";
    this.opponentName = opponentName;
    const typeKeys = Type.keys();
    for (let i = 0; i < this.width * this.height; i++) {
      const square = new TriadSquare();
      if (this.elements) {
        for (;;) {
          const trialType = rubySample(typeKeys)!;
          const typeData = Type.get(trialType);
          if (typeData.pseudoType) continue;
          square.type = typeData.id;
          break;
        }
      }
      this.board.push(square);
    }
    await this.scene.pbStartScene(this); // (param1, param2)
    // Check whether there are enough cards.
    if (count < this.maxCards()) {
      await this.scene.pbDisplayPaused(_INTL("You don't have enough cards."));
      await this.scene.pbEndScene();
      return 0;
    }
    // Set the player's cards.
    let cards: Id[] = [];
    if (this.randomHand) { // Determine hand at random
      for (let n = 0; n < this.maxCards(); n++) {
        const randCard = this.triadCards[rand(this.triadCards.length)]!;
        const id = randCard[0];
        this.pbSubtract(this.triadCards, id);
        cards.push(id);
      }
      await preloadTriadCards(cards);
      this.scene.pbShowPlayerCards(cards);
    } else {
      cards = await this.scene.pbChooseTriadCard(this.triadCards);
    }
    // Set the opponent's cards.
    let opponentCards: Id[];
    if (Array.isArray(oppdeck) && oppdeck.length === this.maxCards()) { // Preset
      opponentCards = [];
      for (const i of oppdeck as Id[]) {
        // species_data = GameData::Species.try_get(i)
        // if !species_data
        //   @scene.pbDisplayPaused(_INTL("Opponent has an illegal card, \"{1}\".", i))
        //   @scene.pbEndScene
        //   return 0
        // end
        opponentCards.push(i);
      }
    } else {
      const speciesKeys = Species.keys();
      const candidates: [Id, number][] = [];
      while (candidates.length < 200) {
        let card = rubySample(speciesKeys)!;
        const cardData = Species.get(card);
        card = cardData.id; // Make sure it's a symbol
        const triad = new TriadCard(card);
        const total = triad.north + triad.south + triad.east + triad.west;
        // Add random species and its total point count
        candidates.push([card, total]);
        if (candidates.length < 200 && player().owned(cardData.species)) {
          // Add again if player owns the species
          candidates.push([card, total]);
        }
      }
      // sort by total point count
      rubySortBy(candidates, (a, b) => spaceship(a[1], b[1]));
      opponentCards = [];
      for (let n = 0; n < this.maxCards(); n++) {
        // Choose random card from candidates based on trainer's level
        const index = minLevel + rand(20);
        opponentCards.push(candidates[index]![0]);
      }
    }
    const originalCards = [...cards];
    const originalOpponentCards = [...opponentCards];
    this.scene.pbNotifyCards([...cards], [...opponentCards]);
    await this.scene.pbShowOpponentCards(opponentCards);
    await this.scene.pbDisplay(_INTL("Choosing the starting player..."));
    this.scene.pbUpdateScore();
    let playerTurn = (rand(2) === 0);
    await this.scene.pbDisplay(_INTL("{1} will go first.", (playerTurn) ? this.playerName : this.opponentName));
    for (let turn = 0; turn < this.width * this.height; turn++) {
      let position: [number, number] | null = null;
      let triadCard: TriadCard | null = null;
      let cardIndex = 0;
      if (playerTurn) {
        // Player's turn
        while (!position) {
          cardIndex = await this.scene.pbPlayerChooseCard(cards.length);
          triadCard = new TriadCard(cards[cardIndex]!);
          position = await this.scene.pbPlayerPlaceCard(cardIndex);
        }
      } else {
        // Opponent's turn
        await this.scene.pbDisplay(_INTL("{1} is making a move...", this.opponentName));
        let scores: [number, number, number, number][] = [];
        for (let ci = 0; ci < opponentCards.length; ci++) {
          const square = new TriadSquare();
          square.card = new TriadCard(opponentCards[ci]!);
          square.owner = 2;
          for (let i = 0; i < this.width * this.height; i++) {
            const x = i % this.width;
            const y = Math.floor(i / this.width);
            square.type = this.board[i]!.type;
            const flips = this.flipBoard(x, y, square);
            if (flips) scores.push([ci, x, y, flips.length]);
          }
        }
        // Sort by number of flips
        rubySortBy(scores, (a, b) => (b[3] === a[3]) ? -1 + rand(3) : spaceship(b[3], a[3]));
        scores = scores.slice(0, opponentCards.length); // Get the best results
        if (scores.length === 0) {
          await this.scene.pbDisplay(_INTL("{1} can't move somehow...", this.opponentName));
          playerTurn = !playerTurn;
          // NOTE (Ruby parity): 002_Minigame_TripleTriad.rb:911 calls `continue`,
          // which isn't a Ruby keyword (NameError). Unreachable: the side to
          // move always has a card and the board an empty square.
          throw new ReferenceError("undefined local variable or method `continue' for TriadScreen");
        }
        const result = scores[rand(scores.length)]!;
        cardIndex = result[0];
        triadCard = new TriadCard(opponentCards[cardIndex]!);
        position = [result[1], result[2]];
        this.scene.pbOpponentPlaceCard(triadCard, position, cardIndex);
      }
      const boardIndex = (position[1] * this.width) + position[0];
      this.board[boardIndex]!.card = triadCard;
      this.board[boardIndex]!.owner = playerTurn ? 1 : 2;
      this.flipBoard(position[0], position[1]);
      if (playerTurn) {
        cards.splice(cardIndex, 1);
        this.scene.pbEndPlaceCard(position, cardIndex);
      } else {
        opponentCards.splice(cardIndex, 1);
        this.scene.pbEndOpponentPlaceCard(position, cardIndex);
      }
      playerTurn = !playerTurn;
    }
    // Determine the winner
    let playerCount = 0;
    let opponentCount = 0;
    for (let i = 0; i < this.width * this.height; i++) {
      if (this.board[i]!.owner === 1) playerCount += 1;
      if (this.board[i]!.owner === 2) opponentCount += 1;
    }
    if (this.countUnplayedCards) {
      playerCount += cards.length;
      opponentCount += opponentCards.length;
    }
    const keepCardsOfYourColor = () => {
      for (const card of originalCards) storage.remove(card);
      for (const i of cards) storage.add(i);
      for (let i = 0; i < this.width * this.height; i++) {
        if (this.board[i]!.owner === 1) {
          // NOTE (Ruby parity): get_species_form is nil for custom cards (NoMethodError on nil.id).
          const card = Species.getSpeciesForm(this.board[i]!.card!.species, this.board[i]!.card!.form)!.id;
          storage.add(card);
        }
      }
    };
    let result = 0;
    let cardname: string | null = null;
    if (playerCount === opponentCount) {
      await this.scene.pbDisplayPaused(_INTL("The game is a draw."));
      result = 3;
      if (this.trade === 1) {
        // Keep only cards of your color
        keepCardsOfYourColor();
        await this.scene.pbDisplayPaused(_INTL("Kept all cards of your color."));
      }
    } else if (playerCount > opponentCount) {
      await this.scene.pbDisplayPaused(_INTL("{1} won against {2}.", this.playerName, this.opponentName));
      result = 1;
      if (prize) {
        const speciesData = Species.tryGet(prize);
        if (speciesData && storage.add(speciesData.id)) {
          await this.scene.pbDisplayPaused(_INTL("Got opponent's {1} card.", speciesData.name));
        }
      } else {
        switch (this.trade) {
          case 0: { // Gain 1 random card from opponent's deck
            const card = originalOpponentCards[rand(originalOpponentCards.length)]!;
            if (storage.add(card)) {
              // NOTE (Ruby parity): GameData::Species.get raises for custom cards.
              cardname = Species.get(card).name;
              await this.scene.pbDisplayPaused(_INTL("Got opponent's {1} card.", cardname));
            }
            break;
          }
          case 1: // Keep only cards of your color
            keepCardsOfYourColor();
            await this.scene.pbDisplayPaused(_INTL("Kept all cards of your color."));
            break;
          case 2: // Gain all opponent's cards
            for (const card of originalOpponentCards) storage.add(card);
            await this.scene.pbDisplayPaused(_INTL("Got all opponent's cards."));
            break;
        }
      }
    } else {
      await this.scene.pbDisplayPaused(_INTL("{1} lost against {2}.", this.playerName, this.opponentName));
      result = 2;
      switch (this.trade) {
        case 0: { // Lose 1 random card from your deck
          const card = originalCards[rand(originalCards.length)]!;
          storage.remove(card);
          // NOTE (Ruby parity): GameData::Species.get raises for custom cards.
          cardname = Species.get(card).name;
          await this.scene.pbDisplayPaused(_INTL("Opponent won your {1} card.", cardname));
          break;
        }
        case 1: // Keep only cards of your color
          keepCardsOfYourColor();
          await this.scene.pbDisplayPaused(_INTL("Kept all cards of your color.", cardname));
          break;
        case 2: // Lose all your cards
          for (const card of originalCards) storage.remove(card);
          await this.scene.pbDisplayPaused(_INTL("Opponent won all your cards."));
          break;
      }
    }
    await this.scene.pbEndScene();
    return result;
  }
}

//===============================================================================
// Start duel
//===============================================================================
export function pbCanTriadDuel(): boolean {
  const cardCount = triads().totalCards();
  return cardCount >= MINIMUM_TRIAD_CARDS;
}

export async function pbTriadDuel(name: string, minLevel: number, maxLevel: number, rules: unknown = null,
  oppdeck: unknown = null, prize: Id | null = null): Promise<number> {
  let ret = 0;
  await pbFadeOutInWithMusic(async () => {
    const scene = new TriadScene();
    const screen = new TriadScreen(scene);
    ret = await screen.pbStartScreen(name, minLevel, maxLevel, rules, oppdeck, prize);
  });
  return ret;
}

//===============================================================================
// Card storage
//===============================================================================
/** PokemonGlobalMetadata::MINIMUM_TRIAD_CARDS */
export const MINIMUM_TRIAD_CARDS = 5;

/** $PokemonGlobal.triads (created on first use). */
export function triads(): TriadStorage {
  const g = pokemonGlobal();
  if (!(g.triads instanceof TriadStorage)) g.triads = new TriadStorage();
  return g.triads as TriadStorage;
}

export class TriadStorage {
  items: ItemSlot[] = [];

  static readonly MAX_PER_SLOT = 999; // Max. number of items per slot

  at(i: number): ItemSlot | undefined {
    return this.items[i];
  }

  length(): number {
    return this.items.length;
  }

  empty(): boolean {
    return this.items.length === 0;
  }

  maxSize(): number {
    return this.items.length + 1;
  }

  clear(): void {
    this.items.length = 0;
  }

  getItem(index: number): Id | null {
    if (index < 0 || index >= this.items.length) return null;
    return this.items[index]![0];
  }

  // Number of the item in the given index
  getItemCount(index: number): number {
    if (index < 0 || index >= this.items.length) return 0;
    return this.items[index]![1];
  }

  quantity(item: Id): number {
    return ItemStorageHelper.quantity(this.items, item);
  }

  canAdd(item: Id, qty = 1): boolean {
    return ItemStorageHelper.canAdd(this.items, this.maxSize(), TriadStorage.MAX_PER_SLOT, item, qty);
  }

  add(item: Id, qty = 1): boolean {
    return ItemStorageHelper.add(this.items, this.maxSize(), TriadStorage.MAX_PER_SLOT, item, qty);
  }

  remove(item: Id, qty = 1): boolean {
    return ItemStorageHelper.remove(this.items, item, qty);
  }

  totalCards(): number {
    let ret = 0;
    for (const itm of this.items) ret += itm[1];
    return ret;
  }
}

/** $PokemonGlobal.triads in the save (Ruby marshals PokemonGlobalMetadata whole). */
export const TRIADS_SAVE = {
  save: (v: unknown) => (v as TriadStorage).items.map((slot) => [...slot]),
  load: (json: unknown) => {
    const storage = new TriadStorage();
    storage.items = (json as ItemSlot[]).map((slot) => [slot[0], slot[1]] as ItemSlot);
    return storage;
  },
};
PokemonGlobalExtras.register("triads", TRIADS_SAVE);

//===============================================================================
// Card shop screen (replaced by TripleTriad_Improvements.rb's pbBuyTriads)
//===============================================================================
/** Ruby's `commands.sort! { |a, b| a[1] <=> b[1] }` on the shop's [price, name, text, id] rows. */
export function sortShopCommands(commands: [number, string, string, Id][]): void {
  rubySortBy(commands, (a, b) => spaceship(a[1], b[1])); // Sort alphabetically
}

/** The shop window loop shared by both versions of pbBuyTriads (identical code in Ruby). */
export async function runTriadShop(commands: [number, string, string, Id][]): Promise<void> {
  const realcommands: string[] = [];
  if (commands.length === 0) {
    await pbMessage(_INTL("There are no cards that you can buy."));
    return;
  }
  sortShopCommands(commands);
  for (const command of commands) realcommands.push(command[2]);
  await preloadTriadCards(commands.map((c) => c[3]), true);
  // Scroll right before showing screen
  await pbScrollMap(4, 3, 5);
  const cmdwindow = Window_CommandPokemonEx.newWithSize(realcommands, 0, 0, Math.floor(Graphics.width / 2), Graphics.height);
  cmdwindow.z = 99999;
  const goldwindow = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Money:\r\n{1}", pbGetGoldString()), 0, 0, 32, 32,
  );
  goldwindow.resizeToFit(goldwindow.text, Graphics.width);
  goldwindow.x = Graphics.width - goldwindow.width;
  goldwindow.y = 0;
  goldwindow.z = 99999;
  const preview = new Sprite();
  preview.x = Math.floor((Graphics.width * 3) / 4) - 40;
  preview.y = Math.floor(Graphics.height / 2) - 48;
  preview.z = 4;
  preview.setBitmap(new TriadCard(commands[cmdwindow.index]![3]).createBitmap(1));
  let olditem = commands[cmdwindow.index]![3];
  for (;;) {
    await Graphics.update();
    Input.update();
    cmdwindow.active = true;
    cmdwindow.update();
    goldwindow.update();
    if (commands[cmdwindow.index]![3] !== olditem) {
      preview.bitmap?.dispose();
      preview.setBitmap(new TriadCard(commands[cmdwindow.index]![3]).createBitmap(1));
      olditem = commands[cmdwindow.index]![3];
    }
    if (Input.trigger(Input.BACK)) {
      break;
    } else if (Input.trigger(Input.USE)) {
      let price = commands[cmdwindow.index]![0];
      const item = commands[cmdwindow.index]![3];
      const itemname = commands[cmdwindow.index]![1];
      cmdwindow.active = false;
      cmdwindow.update();
      if (player().money < price) {
        await pbMessage(_INTL("You don't have enough money."));
        continue;
      }
      let maxafford = (price <= 0) ? 99 : Math.floor(player().money / price);
      if (maxafford > 99) maxafford = 99;
      const params = new ChooseNumberParams();
      params.setRange(1, maxafford);
      params.setInitialValue(1);
      params.setCancelValue(0);
      const quantity = await pbMessageChooseNumber(
        _INTL("The {1} card? Certainly. How many would you like?", itemname), params,
      );
      if (quantity <= 0) continue;
      price *= quantity;
      if (!await pbConfirmMessage(_INTL("{1}, and you want {2}. That will be ${3}. OK?", itemname, quantity, toSFormatted(price)))) continue;
      if (player().money < price) {
        await pbMessage(_INTL("You don't have enough money."));
        continue;
      }
      if (!triads().canAdd(item, quantity)) {
        await pbMessage(_INTL("You have no room for more cards."));
        continue;
      }
      triads().add(item, quantity);
      player().money -= price;
      goldwindow.text = _INTL("Money:\r\n{1}", pbGetGoldString());
      await pbMessage(_INTL("Here you are! Thank you!\\se[Mart buy item]"));
    }
  }
  cmdwindow.dispose();
  goldwindow.dispose();
  preview.bitmap?.dispose();
  preview.dispose();
  // Scroll right before showing screen
  await pbScrollMap(6, 3, 5);
}

/** The original pbBuyTriads (overridden by the plugin's, see TripleTriad_Improvements.ts). */
export async function pbBuyTriadsCore(): Promise<void> {
  const commands: [number, string, string, Id][] = [];
  for (const s of Species.eachSpecies()) {
    if (!player().owned(s.species)) continue;
    const price = new TriadCard(s.id).price();
    commands.push([price, s.name, _INTL("{1} - ${2}", s.name, toSFormatted(price)), s.id]);
  }
  await runTriadShop(commands);
}

function sellCommands(): string[] {
  const commands: string[] = [];
  const storage = triads();
  for (let i = 0; i < storage.length(); i++) {
    const item = storage.at(i)!;
    const speciesname = new TriadCard(item[0]).name;
    commands.push(_INTL("{1} x{2}", speciesname, item[1]));
  }
  commands.push(_INTL("CANCEL"));
  return commands;
}

export async function pbSellTriads(): Promise<void> {
  let totalCards = 0;
  const storage = triads();
  for (let i = 0; i < storage.length(); i++) totalCards += storage.at(i)![1];
  let commands = sellCommands();
  if (totalCards === 0) {
    await pbMessage(_INTL("You have no cards."));
    return;
  }
  await preloadTriadCards(storage.items.map((slot) => slot[0]));
  // Scroll right before showing screen
  await pbScrollMap(4, 3, 5);
  const cmdwindow = Window_CommandPokemonEx.newWithSize(commands, 0, 0, Math.floor(Graphics.width / 2), Graphics.height);
  cmdwindow.z = 99999;
  const goldwindow = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Money:\r\n{1}", pbGetGoldString()), 0, 0, 32, 32,
  );
  goldwindow.resizeToFit(goldwindow.text, Graphics.width);
  goldwindow.x = Graphics.width - goldwindow.width;
  goldwindow.y = 0;
  goldwindow.z = 99999;
  const preview = new Sprite();
  preview.x = Math.floor((Graphics.width * 3) / 4) - 40;
  preview.y = Math.floor(Graphics.height / 2) - 48;
  preview.z = 4;
  let item = storage.getItem(cmdwindow.index);
  preview.setBitmap(new TriadCard(item!).createModifiedBitmap(1));
  let olditem = storage.getItem(cmdwindow.index);
  let done = false;
  while (!done) {
    for (;;) {
      await Graphics.update();
      Input.update();
      cmdwindow.active = true;
      cmdwindow.update();
      goldwindow.update();
      item = storage.getItem(cmdwindow.index);
      if (olditem !== item) {
        preview.bitmap?.dispose();
        if (item) preview.setBitmap(new TriadCard(item).createModifiedBitmap(1));
        olditem = item;
      }
      if (Input.trigger(Input.BACK)) {
        done = true;
        break;
      }
      if (Input.trigger(Input.USE)) {
        if (cmdwindow.index >= storage.length()) {
          done = true;
          break;
        }
        item = storage.getItem(cmdwindow.index)!;
        const itemname = new TriadCard(item).name;
        let quantity = storage.quantity(item);
        let price = new TriadCard(item).price();
        if (price === 0) {
          // NOTE (Ruby parity): 002_Minigame_TripleTriad.rb:1296 calls a
          // pbDisplayPaused that doesn't exist outside scenes (NoMethodError).
          // Unreachable: a card's price is at least 100.
          throw new TypeError("undefined method `pbDisplayPaused' for main:Object");
        }
        cmdwindow.active = false;
        cmdwindow.update();
        if (quantity > 1) {
          const params = new ChooseNumberParams();
          params.setRange(1, quantity);
          params.setInitialValue(1);
          params.setCancelValue(0);
          quantity = await pbMessageChooseNumber(
            _INTL("The {1} card? How many would you like to sell?", itemname), params,
          );
        }
        if (quantity > 0) {
          price = Math.floor(price / 8); // Divide by 8 as I want to sell at 1/8th of the price - so player can't make easy money with selling gained cards.
          price *= quantity;
          if (await pbConfirmMessage(_INTL("I can pay ${1}. Would that be OK?", toSFormatted(price)))) {
            player().money += price;
            goldwindow.text = _INTL("Money:\r\n{1}", pbGetGoldString());
            storage.remove(item, quantity);
            await pbMessage(_INTL("Turned over the {1} card and received ${2}.\\se[Mart buy item]", itemname, toSFormatted(price)));
            commands = sellCommands();
            cmdwindow.commands = commands;
            break;
          }
        }
      }
    }
  }
  cmdwindow.dispose();
  goldwindow.dispose();
  preview.bitmap?.dispose();
  preview.dispose();
  // Scroll right before showing screen
  await pbScrollMap(6, 3, 5);
}

export async function pbTriadList(): Promise<void> {
  let totalCards = 0;
  const commands: string[] = [];
  const storage = triads();
  for (let i = 0; i < storage.length(); i++) {
    const item = storage.at(i)!;
    // NOTE (Ruby parity): GameData::Species.get raises for custom cards.
    const speciesname = Species.get(item[0]).name;
    commands.push(_INTL("{1} x{2}", speciesname, item[1]));
    totalCards += item[1];
  }
  commands.push(_INTL("CANCEL"));
  if (totalCards === 0) {
    await pbMessage(_INTL("You have no cards."));
    return;
  }
  await preloadTriadCards(storage.items.map((slot) => slot[0]), true);
  const cmdwindow = Window_CommandPokemonEx.newWithSize(commands, 0, 0, Math.floor(Graphics.width / 2), Graphics.height);
  cmdwindow.z = 99999;
  const sprite = new Sprite();
  sprite.x = Math.floor(Graphics.width / 2) + 40;
  sprite.y = 48;
  sprite.z = 99999;
  let done = false;
  let lastIndex = -1;
  while (!done) {
    for (;;) {
      await Graphics.update();
      Input.update();
      cmdwindow.update();
      if (lastIndex !== cmdwindow.index) {
        sprite.bitmap?.dispose();
        if (cmdwindow.index < storage.length()) {
          sprite.setBitmap(new TriadCard(storage.getItem(cmdwindow.index)!).createBitmap(1));
        }
        lastIndex = cmdwindow.index;
      }
      if (Input.trigger(Input.BACK) ||
          (Input.trigger(Input.USE) && cmdwindow.index >= storage.length())) {
        done = true;
        break;
      }
    }
  }
  cmdwindow.dispose();
  sprite.dispose();
}

//===============================================================================
// Give the player a particular card
//===============================================================================
export function pbGiveTriadCard(species: Id, quantity = 1): boolean {
  // sp = GameData::Species.try_get(species)
  // return false if !sp
  if (!triads().canAdd(species, quantity)) return false;
  // $PokemonGlobal.triads.add(sp.id, quantity)
  triads().add(species, quantity);

  return true;
}
