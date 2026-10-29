// Port of Data/Scripts/016_UI/001_Non-interactive UI/006_UI_HallOfFame.rb
// (HallOfFame_Scene, HallOfFameScreen, the PC menu entry, the
// PokemonGlobalMetadata accessors, pbHallOfFameEntry, pbHallOfFamePC), with
// Mr. Gela's HGSS Trainer Card Scene's writeTrainerData (it stores the first
// Hall of Fame time in $player.halloffame).
//
// $PokemonGlobal.hallOfFame holds Pokémon, so it (with hallOfFameLastNumber
// and the credits' creditsPlayed) is kept outside PokemonGlobalMetadata's
// plain snapshot and saved as its own SaveData value, "hall_of_fame".
//
// Waits count 40 fps frames (Graphics.frame_rate = 40); each runs once per
// elapsed 1/40 s (eachFrame / frameLoop).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Species } from "../../data/gameData/species";
import { TrainerType } from "../../data/gameData/trainerType";
import { assetExists } from "../../core/assets";
import { pbGetTimeNow } from "../../game/dayNight";
import { pbBGMFade, pbBGMPlay } from "../../game/GameSystem";
import type { GameMap } from "../../game/GameMap";
import { G, PokemonGlobalMetadata } from "../../game/globals";
import { Pokemon, type PokemonJSON } from "../../game/pokemon/Pokemon";
import type { Player } from "../../game/trainer/Player";
import { SaveData } from "../../game/save/SaveData";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbSetSpritesToColor } from "../fades";
import { FRAME_RATE, FrameCounter, originalFrameCount } from "../frameTime";
import { pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbMessage, pbMessageDisplay } from "../messages";
import { MenuHandlers } from "../menus/menuHandlers";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, eachFrame, type Sprites } from "../scenes/frames";
import { PictureOrigin } from "../scenes/PictureEx";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { pokemonBitmapRequest, PokemonSprite } from "../sprites/pokemonSprite";
import { Window_AdvancedTextPokemon } from "../windows/SpriteWindowText";

const player = () => G.player as unknown as Player;
const resolve = (p: string) => (assetExists(p) ? p : null);

//===============================================================================
// PokemonGlobalMetadata: hallOfFame, hallOfFameLastNumber (and Scene_Credits'
// creditsPlayed, 007_UI_Credits.rb)
//===============================================================================
interface HallOfFameData {
  hallOfFame: Pokemon[][];
  /** Number necessary if hallOfFame array reach in its size limit */
  hallOfFameLastNumber: number;
  creditsPlayed: boolean;
}
declare module "../../game/globals" {
  interface PokemonGlobalMetadata extends HallOfFameData {}
}
const hallData = new WeakMap<PokemonGlobalMetadata, HallOfFameData>();
const dataOf = (g: PokemonGlobalMetadata): HallOfFameData => {
  let d = hallData.get(g);
  if (!d) hallData.set(g, (d = { hallOfFame: [], hallOfFameLastNumber: 0, creditsPlayed: false }));
  return d;
};
for (const key of ["hallOfFame", "hallOfFameLastNumber", "creditsPlayed"] as const) {
  Object.defineProperty(PokemonGlobalMetadata.prototype, key, {
    configurable: true,
    get(this: PokemonGlobalMetadata) { return dataOf(this)[key]; },
    set(this: PokemonGlobalMetadata, value: never) { dataOf(this)[key] = value; },
  });
}

interface HallOfFameJSON { hallOfFame: PokemonJSON[][]; hallOfFameLastNumber: number; creditsPlayed: boolean }
SaveData.register({
  id: "hall_of_fame",
  save: (): HallOfFameJSON => {
    const g = G.pokemonGlobal;
    return {
      hallOfFame: g.hallOfFame.map((team) => team.map((p) => p.toJSON())),
      hallOfFameLastNumber: g.hallOfFameLastNumber,
      creditsPlayed: g.creditsPlayed,
    };
  },
  load: (v) => {
    const json = v as HallOfFameJSON;
    const g = G.pokemonGlobal;
    g.hallOfFame = json.hallOfFame.map((team) => team.map((p) => Pokemon.fromJSON(p)));
    g.hallOfFameLastNumber = json.hallOfFameLastNumber;
    g.creditsPlayed = json.creditsPlayed;
  },
  newGame: () => { hallData.delete(G.pokemonGlobal); },
});

//===============================================================================
// * Hall of Fame - by FL (Credits will be apreciated)
//===============================================================================
export class HallOfFame_Scene {
  /** When true, all pokémon will be in one line; when false, in two lines */
  static readonly SINGLEROW = false;
  /** Make the pokémon movement ON in hall entry */
  static readonly ANIMATION = true;
  /** Speed in pokémon movement in hall entry. Don't use less than 2! */
  static readonly ANIMATIONSPEED = 32;
  /** Entry wait time (in 1/20 seconds) between showing each Pokémon (and trainer) */
  static readonly ENTRYWAITTIME = 64;
  /** Maximum number limit of simultaneous hall entries saved (0 = none, -1 = no limit) */
  static readonly HALLLIMIT = 50;
  /** The entry music name. Put "" to doesn't play anything */
  static readonly ENTRYMUSIC: string = "Hall of Fame";
  /** Allow eggs to be show and saved in hall */
  static readonly ALLOWEGGS = true;
  /** Remove the hallbars when the trainer sprite appears */
  static readonly REMOVEBARS = true;
  /** The final fade speed on entry */
  static readonly FINALFADESPEED = 16;
  /** Sprites opacity value when them aren't selected */
  static readonly OPACITY = 64;
  static readonly BASECOLOR = new Color(248, 248, 248);
  static readonly SHADOWCOLOR = new Color(0, 0, 0);

  private sprites: Sprites = {};
  private viewport!: Viewport;
  private alreadyFadedInEnd = false;
  private useMusic = false;
  private battlerIndex = 0;
  private hallEntry: Pokemon[] = [];
  private hallIndex = 0;
  private nationalDexList: Id[] = [];
  private xmovement: number[] = [];
  private ymovement: number[] = [];

  private get overlay(): BitmapSprite { return this.sprites.overlay as BitmapSprite; }

  /** Placement for pokemon icons */
  async pbStartScene(): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/hallfamebars", "Graphics/Pictures/hallfamebg"]);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    // Comment the below line to doesn't use a background
    addBackgroundPlane(this.sprites, "bg", "hallfamebg", this.viewport);
    const hallbars = new IconSprite(0, 0, this.viewport);
    this.sprites.hallbars = hallbars;
    hallbars.setBitmapFile("Graphics/Pictures/hallfamebars");
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites.overlay = overlay;
    overlay.z = 10;
    pbSetSystemFont(overlay.bitmap!);
    this.alreadyFadedInEnd = false;
    this.useMusic = false;
    this.battlerIndex = 0;
    this.hallEntry = [];
    this.nationalDexList = ["NONE"];
    for (const s of Species.eachSpecies()) this.nationalDexList.push(s.species);
  }

  async pbStartSceneEntry(): Promise<void> {
    await this.pbStartScene();
    this.useMusic = !!HallOfFame_Scene.ENTRYMUSIC && HallOfFame_Scene.ENTRYMUSIC !== "";
    if (this.useMusic) pbBGMPlay(HallOfFame_Scene.ENTRYMUSIC);
    this.saveHallEntry();
    this.xmovement = [];
    this.ymovement = [];
    await this.createBattlers();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbStartScenePC(): Promise<void> {
    await this.pbStartScene();
    this.hallIndex = G.pokemonGlobal.hallOfFame.length - 1;
    this.hallEntry = G.pokemonGlobal.hallOfFame[G.pokemonGlobal.hallOfFame.length - 1]!;
    await this.createBattlers(false);
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
    await this.pbUpdatePC();
  }

  async pbEndScene(): Promise<void> {
    if (this.useMusic) (G.gameMap as unknown as GameMap | null)?.autoplay();
    const msgwindow = this.sprites.msgwindow as Window_AdvancedTextPokemon | undefined;
    if (msgwindow) pbDisposeMessageWindow(msgwindow);
    if (!this.alreadyFadedInEnd) await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  /** slowFadeOut(sprites, exponent): 2 exponent */
  async slowFadeOut(sprites: Sprites, exponent: number, block?: () => void): Promise<void> {
    // To handle values above 8
    const extraWaitExponent = exponent - 9;
    if (exponent > 8) exponent = 8;
    const max = 2 ** exponent;
    const speed = Math.floor((2 ** 8) / max);
    for (let j = 0; j <= max; j++) {
      if (extraWaitExponent > -1) await eachFrame(2 ** extraWaitExponent, () => this.pbUpdate());
      await pbSetSpritesToColor(asHash(sprites), new Color(0, 0, 0, j * speed));
      block ? block() : pbUpdateSpriteHash(sprites as never);
    }
  }

  /** Dispose the sprite if the sprite exists and make it null */
  restartSpritePosition(sprites: Sprites, spritename: string): void {
    (sprites[spritename] as { dispose(): void } | null | undefined)?.dispose();
    sprites[spritename] = null;
  }

  /** Change the pokémon sprites opacity except the index one */
  setPokemonSpritesOpacity(index: number, opacity = 255): void {
    for (let n = 0; n < this.hallEntry.length; n++) {
      const s = this.sprites[`pokemon${n}`] as PokemonSprite | null | undefined;
      if (s) s.opacity = n === index ? 255 : opacity;
    }
  }

  saveHallEntry(): void {
    for (const pkmn of player().party) {
      // Clones every pokémon object
      if (!pkmn.egg() || HallOfFame_Scene.ALLOWEGGS) this.hallEntry.push(pkmn.clone());
    }
    // Update the global variables
    const g = G.pokemonGlobal;
    g.hallOfFame.push(this.hallEntry);
    g.hallOfFameLastNumber += 1;
    if (HallOfFame_Scene.HALLLIMIT > -1 && g.hallOfFame.length > HallOfFame_Scene.HALLLIMIT) g.hallOfFame.splice(0, 1);
  }

  /** Return the x/y point position in screen for battler index number. Don't use odd numbers! */
  xpointformula(battlernumber: number): number {
    let ret = 0;
    if (HallOfFame_Scene.SINGLEROW) {
      ret = ((60 * Math.floor(battlernumber / 2)) + 48) * (this.xpositionformula(battlernumber) - 1);
      ret += Math.floor(Graphics.width / 2) - 56;
    } else {
      ret = 32 + (160 * this.xpositionformula(battlernumber));
    }
    return ret;
  }

  ypointformula(battlernumber: number): number {
    if (HallOfFame_Scene.SINGLEROW) return 96 - (8 * Math.floor(battlernumber / 2));
    return 32 + Math.floor((128 * this.ypositionformula(battlernumber)) / 2);
  }

  /** Returns 0, 1 or 2 as the x/y column value */
  xpositionformula(battlernumber: number): number {
    if (HallOfFame_Scene.SINGLEROW) return (battlernumber % 2) * 2;
    return Math.floor(battlernumber / 3) % 2 === 0 ? (19 - battlernumber) % 3 : (19 + battlernumber) % 3;
  }

  ypositionformula(battlernumber: number): number {
    if (HallOfFame_Scene.SINGLEROW) return 1;
    return (Math.floor(battlernumber / 3) % 2) * 2;
  }

  moveSprite(i: number): void {
    const spritename = i > -1 ? `pokemon${i}` : "trainer";
    const sprite = this.sprites[spritename] as { x: number; y: number };
    const speed = i > -1 ? HallOfFame_Scene.ANIMATIONSPEED : 2;
    // Ruby indexes @xmovement[-1] (the last entry) for the trainer.
    const k = i < 0 ? this.xmovement.length + i : i;
    if (!HallOfFame_Scene.ANIMATION) { // Skips animation
      sprite.x -= speed * this.xmovement[k]!;
      this.xmovement[k] = 0;
      sprite.y -= speed * this.ymovement[k]!;
      this.ymovement[k] = 0;
    }
    if (this.xmovement[k] !== 0) {
      const direction = this.xmovement[k]! > 0 ? -1 : 1;
      sprite.x += speed * direction;
      this.xmovement[k]! += direction;
    }
    if (this.ymovement[k] !== 0) {
      const direction = this.ymovement[k]! > 0 ? -1 : 1;
      sprite.y += speed * direction;
      this.ymovement[k]! += direction;
    }
  }

  async createBattlers(hide = true): Promise<void> {
    // Ruby reads each sprite's bitmap size right after setting it.
    await preloadBitmaps(this.hallEntry.map((p) => pokemonBitmapRequest(p)?.file).filter((f): f is string => !!f));
    // Movement in animation
    for (let i = 0; i < 6; i++) {
      // Clear all 6 pokémon sprites and dispose the ones that exists every time
      // that this method is call
      this.restartSpritePosition(this.sprites, `pokemon${i}`);
      if (i >= this.hallEntry.length) continue;
      const xpoint = this.xpointformula(i);
      const ypoint = this.ypointformula(i);
      const pok = this.hallEntry[i]!;
      const sprite = new PokemonSprite(this.viewport);
      this.sprites[`pokemon${i}`] = sprite;
      sprite.setOffset(PictureOrigin.TOP_LEFT);
      sprite.setPokemonBitmap(pok);
      // This method doesn't put the exact coordinates
      sprite.x = xpoint;
      sprite.y = ypoint;
      if (sprite.bitmap && !sprite.isDisposed()) {
        sprite.x += Math.floor((128 - sprite.bitmap.width) / 2);
        sprite.y += Math.floor((128 - sprite.bitmap.height) / 2);
      }
      if (HallOfFame_Scene.SINGLEROW) sprite.z = 7 - i;
      if (!hide) continue;
      // Animation distance calculation
      const horizontal = 1 - this.xpositionformula(i);
      const vertical = 1 - this.ypositionformula(i);
      const bw = sprite.bitmap?.width ?? 0;
      const bh = sprite.bitmap?.height ?? 0;
      let xdistance = horizontal === -1 ? -bw : Graphics.width;
      let ydistance = vertical === -1 ? -bh : Graphics.height;
      xdistance = Math.abs(Math.floor((xdistance - sprite.x) / HallOfFame_Scene.ANIMATIONSPEED)) + 1;
      ydistance = Math.abs(Math.floor((ydistance - sprite.y) / HallOfFame_Scene.ANIMATIONSPEED)) + 1;
      const biggerdistance = xdistance > ydistance ? xdistance : ydistance;
      this.xmovement[i] = biggerdistance;
      if (horizontal === -1) this.xmovement[i]! *= -1;
      if (horizontal === 0) this.xmovement[i] = 0;
      this.ymovement[i] = biggerdistance;
      if (vertical === -1) this.ymovement[i]! *= -1;
      if (vertical === 0) this.ymovement[i] = 0;
      // Hide the battlers
      sprite.x += this.xmovement[i]! * HallOfFame_Scene.ANIMATIONSPEED;
      sprite.y += this.ymovement[i]! * HallOfFame_Scene.ANIMATIONSPEED;
    }
  }

  async createTrainerBattler(): Promise<void> {
    const file = TrainerType.frontSpriteFilename(player().trainerType, resolve);
    if (file) await preloadBitmaps([file]);
    const trainer = new IconSprite(0, 0, this.viewport);
    this.sprites.trainer = trainer;
    trainer.setBitmapFile(file);
    if (HallOfFame_Scene.SINGLEROW) {
      trainer.x = Math.floor(Graphics.width / 2);
      trainer.y = 178;
    } else {
      trainer.x = Graphics.width - 96;
      trainer.y = 160;
    }
    trainer.z = 9;
    trainer.ox = Math.floor((trainer.bitmap?.width ?? 0) / 2);
    trainer.oy = Math.floor((trainer.bitmap?.height ?? 0) / 2);
    if (HallOfFame_Scene.REMOVEBARS) {
      this.overlay.bitmap!.clear();
      (this.sprites.hallbars as IconSprite).visible = false;
    }
    this.xmovement[this.battlerIndex] = 0;
    this.ymovement[this.battlerIndex] = 0;
    if (HallOfFame_Scene.ANIMATION && !HallOfFame_Scene.SINGLEROW) { // Trainer Animation
      const startpoint = Math.floor(Graphics.width / 2);
      // 2 is the trainer speed
      this.xmovement[this.battlerIndex] = Math.floor((startpoint - trainer.x) / 2);
      trainer.x = startpoint;
    } else {
      await eachFrame(HallOfFame_Scene.ENTRYWAITTIME, () => this.pbUpdate());
    }
  }

  /** writeTrainerData, as Mr. Gela's HGSS Trainer Card Scene replaces it. */
  async writeTrainerData(): Promise<void> {
    const totalsec = Math.floor(originalFrameCount() / FRAME_RATE);
    const hour = Math.floor(totalsec / 60 / 60);
    const min = Math.floor(totalsec / 60) % 60;
    // Store time of first Hall of Fame in $player.halloffame if not array is empty
    // NOTE (Ruby parity): `if $player.halloffame = []` assigns (always true), so
    // every entry replaces the stored time instead of keeping the first one
    // (Mr. Gela's HGSS Trainer Card Scene.rb:76).
    player().halloffame = [];
    player().halloffame.push(pbGetTimeNow());
    player().halloffame.push(totalsec);
    const pubid = String(player().publicID(player().id)).padStart(5, "0");
    let lefttext = _INTL("Name<r>{1}<br>", player().name);
    lefttext += _INTL("IDNo.<r>{1}<br>", pubid);
    lefttext += `Time<r>${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}<br>`;
    lefttext += _INTL("Pokédex<r>{1}/{2}<br>", player().pokedex.ownedCount(), player().pokedex.seenCount());
    const messagebox = new Window_AdvancedTextPokemon(lefttext);
    this.sprites.messagebox = messagebox;
    messagebox.viewport = this.viewport;
    if (messagebox.width < 192) messagebox.width = 192;
    const msgwindow = pbCreateMessageWindow(this.viewport);
    this.sprites.msgwindow = msgwindow;
    await pbMessageDisplay(msgwindow, _INTL("League champion!\nCongratulations!\\^"));
  }

  writePokemonData(pokemon: Pokemon, hallNumber = -1): void {
    const overlay = this.overlay.bitmap!;
    overlay.clear();
    let pokename = pokemon.name;
    let speciesname = pokemon.speciesName();
    if (pokemon.male()) speciesname += "♂";
    else if (pokemon.female()) speciesname += "♀";
    pokename += "/" + speciesname;
    if (pokemon.egg()) pokename = _INTL("Egg") + "/" + _INTL("Egg");
    const idno = pokemon.owner.name === "" || pokemon.egg() ? "?????" : String(pokemon.owner.publicId()).padStart(5, "0");
    let dexnumber = _INTL("No. ???");
    if (!pokemon.egg()) {
      const i = this.nationalDexList.indexOf(pokemon.species);
      const number = i < 0 ? 0 : i;
      dexnumber = `No. ${String(number).padStart(3, "0")}`;
    }
    const B = HallOfFame_Scene.BASECOLOR;
    const S = HallOfFame_Scene.SHADOWCOLOR;
    const textPositions: TextPosition[] = [
      [dexnumber, 32, Graphics.height - 74, 0, B, S],
      [pokename, Graphics.width - 192, Graphics.height - 74, 2, B, S],
      [_INTL("Lv. {1}", pokemon.egg() ? "?" : pokemon.level), 64, Graphics.height - 42, 0, B, S],
      [_INTL("IDNo.{1}", pokemon.egg() ? "?????" : idno), Graphics.width - 192, Graphics.height - 42, 2, B, S],
    ];
    if (hallNumber > -1) {
      textPositions.push([_INTL("Hall of Fame No."), Math.floor(Graphics.width / 2) - 104, 6, 0, B, S]);
      textPositions.push([String(hallNumber), Math.floor(Graphics.width / 2) + 104, 6, 1, B, S]);
    }
    pbDrawTextPositions(overlay, textPositions);
  }

  writeWelcome(): void {
    const overlay = this.overlay.bitmap!;
    overlay.clear();
    pbDrawTextPositions(overlay, [[_INTL("Welcome to the Hall of Fame!"),
      Math.floor(Graphics.width / 2), Graphics.height - 68, 2, HallOfFame_Scene.BASECOLOR, HallOfFame_Scene.SHADOWCOLOR]]);
  }

  /** Each pass of Ruby's loop is one 40 fps frame: pbUpdateAnimation runs once per elapsed original frame. */
  async pbAnimationLoop(): Promise<void> {
    const done = () => this.battlerIndex === this.hallEntry.length + 2;
    let clock = new FrameCounter();
    while (!done()) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      for (let n = clock.tick(); n > 0 && !done(); n--) {
        if (await this.pbUpdateAnimation()) {
          clock = new FrameCounter(false); // it waited: don't catch up on the time spent
          break;
        }
      }
    }
  }

  async pbPCSelection(): Promise<void> {
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      let continueScene = true;
      if (Input.trigger(Input.BACK)) break; // Exits
      if (Input.trigger(Input.USE)) { // Moves the selection one entry backward
        this.battlerIndex += 10;
        continueScene = await this.pbUpdatePC();
      }
      if (Input.trigger(Input.LEFT)) { // Moves the selection one pokémon forward
        this.battlerIndex -= 1;
        continueScene = await this.pbUpdatePC();
      }
      if (Input.trigger(Input.RIGHT)) { // Moves the selection one pokémon backward
        this.battlerIndex += 1;
        continueScene = await this.pbUpdatePC();
      }
      if (!continueScene) break;
    }
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  /** One frame of pbUpdateAnimation; returns true when it waited (anything but a sprite move). */
  async pbUpdateAnimation(): Promise<boolean> {
    const n = this.hallEntry.length;
    if (this.battlerIndex <= n) {
      if (this.xmovement[this.battlerIndex] !== 0 || this.ymovement[this.battlerIndex] !== 0) {
        const spriteIndex = this.battlerIndex < n ? this.battlerIndex : -1;
        this.moveSprite(spriteIndex);
        return false;
      } else {
        this.battlerIndex += 1;
        if (this.battlerIndex <= n) {
          // If it is a pokémon, write the pokémon text, wait the
          // ENTRYWAITTIME and goes to the next battler
          this.hallEntry[this.battlerIndex - 1]!.playCry();
          this.writePokemonData(this.hallEntry[this.battlerIndex - 1]!);
          await eachFrame(Math.floor((HallOfFame_Scene.ENTRYWAITTIME * FRAME_RATE) / 20), () => this.pbUpdate());
          if (this.battlerIndex < n) { // Preparates the next battler
            this.setPokemonSpritesOpacity(this.battlerIndex, HallOfFame_Scene.OPACITY);
            this.overlay.bitmap!.clear();
          } else { // Show the welcome message and preparates the trainer
            this.setPokemonSpritesOpacity(-1);
            this.writeWelcome();
            await eachFrame(Math.floor((HallOfFame_Scene.ENTRYWAITTIME * 2 * FRAME_RATE) / 20), () => this.pbUpdate());
            if (!HallOfFame_Scene.SINGLEROW) this.setPokemonSpritesOpacity(-1, HallOfFame_Scene.OPACITY);
            await this.createTrainerBattler();
          }
        }
      }
    } else if (this.battlerIndex > n) {
      // Write the trainer data and fade
      await this.writeTrainerData();
      await eachFrame(Math.floor((HallOfFame_Scene.ENTRYWAITTIME * FRAME_RATE) / 20), () => this.pbUpdate());
      const fadeSpeed = Math.floor((Math.log(2 ** 12) - Math.log(HallOfFame_Scene.FINALFADESPEED)) / Math.log(2));
      if (this.useMusic) pbBGMFade((2 ** fadeSpeed) / 20);
      await this.slowFadeOut(this.sprites, fadeSpeed, () => this.pbUpdate());
      this.alreadyFadedInEnd = true;
      this.battlerIndex += 1;
    }
    return true;
  }

  async pbUpdatePC(): Promise<boolean> {
    const g = G.pokemonGlobal;
    // Change the team
    if (this.battlerIndex >= this.hallEntry.length) {
      this.hallIndex -= 1;
      if (this.hallIndex === -1) return false;
      this.hallEntry = g.hallOfFame[this.hallIndex]!;
      this.battlerIndex = 0;
      await this.createBattlers(false);
    } else if (this.battlerIndex < 0) {
      this.hallIndex += 1;
      if (this.hallIndex >= g.hallOfFame.length) return false;
      this.hallEntry = g.hallOfFame[this.hallIndex]!;
      this.battlerIndex = this.hallEntry.length - 1;
      await this.createBattlers(false);
    }
    // Change the pokemon
    this.hallEntry[this.battlerIndex]!.playCry();
    this.setPokemonSpritesOpacity(this.battlerIndex, HallOfFame_Scene.OPACITY);
    const hallNumber = g.hallOfFameLastNumber + this.hallIndex - g.hallOfFame.length + 1;
    this.writePokemonData(this.hallEntry[this.battlerIndex]!, hallNumber);
    return true;
  }
}

//===============================================================================
//
//===============================================================================
export class HallOfFameScreen {
  constructor(private scene: HallOfFame_Scene) {}

  async pbStartScreenEntry(): Promise<void> {
    await this.scene.pbStartSceneEntry();
    await this.scene.pbAnimationLoop();
    await this.scene.pbEndScene();
  }

  async pbStartScreenPC(): Promise<void> {
    await this.scene.pbStartScenePC();
    await this.scene.pbPCSelection();
    await this.scene.pbEndScene();
  }
}

//===============================================================================
//
//===============================================================================
MenuHandlers.add("pc_menu", "hall_of_fame", {
  name: () => _INTL("Hall of Fame"),
  order: 40,
  condition: () => G.pokemonGlobal.hallOfFameLastNumber > 0,
  effect: async () => {
    await pbMessage(_INTL("\\se[PC access]Accessed the Hall of Fame."));
    await pbHallOfFamePC();
    return false;
  },
});

//===============================================================================
//
//===============================================================================
export async function pbHallOfFameEntry(): Promise<void> {
  const scene = new HallOfFame_Scene();
  const screen = new HallOfFameScreen(scene);
  await screen.pbStartScreenEntry();
}

export async function pbHallOfFamePC(): Promise<void> {
  const scene = new HallOfFame_Scene();
  const screen = new HallOfFameScreen(scene);
  await screen.pbStartScreenPC();
}
