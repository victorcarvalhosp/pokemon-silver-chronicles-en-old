// Port of Plugins/Pokemon Amie/Pokemon Amie.rb, the scene: pbClickSprite,
// PokeAmie_Scene (walk animation, the switch screen, the zoomed and mirrored
// Pokémon sprites, the hearts, petting and feeding with the mouse, the
// backdrop), PokeAmieScreen, pokemonAmieRefresh and Luka S.J.'s Sprite#maskOLD.
// The data side (feedAmie, changeAmieStats, setAmiePokemon...) is ./amie.ts.
//
// The scene is driven by the Easy Mouse System (plugins/easyMouse/Mouse.ts).
//
// Timing: the scene counts frames (the walk moves 2 px a frame, petting needs
// 50 frames, a bite 20, the menus animate over 5-15 frames) and calls
// Graphics.update in several places per loop. Each of those is one original
// 40 fps frame here (OriginalFrames, minigames/common.ts), so the scene runs
// at the original speed. Input.update gets the time that really passed, so
// Input.time? (Mouse.click?'s 0.5 s, Mouse.hold?) measures seconds as in mkxp-z.
// Time.now (the pet sound, the 0.2 s still-mouse wait before picking up food,
// the 0.5 s "is full!" message) is game time: frames × seconds per frame.

import { FRAME_RATE } from "../../ui/frameTime";
import { DEBUG } from "../../core/debug";
import { rand } from "../../core/random";
import type { Id } from "../../data/gameData/gameData";
import { _INTL } from "../../data/gameData/gameData";
import { fetchPlayTime } from "../../battle/scene/sceneFiles";
import { EventHandlers } from "../../game/eventHandlers";
import { pbPlayCancelSE, pbSEPlay } from "../../game/GameSystem";
import { G, pbUpdateSceneMap } from "../../game/globals";
import type { PokemonBag } from "../../game/items/PokemonBag";
import { mapMetadata } from "../../game/metadata";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { pbGetEnvironment } from "../../game/battle/BattleStarting";
import { OriginalFrames } from "../../minigames/common";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { type TextPosition, pbDrawOutlineText, pbDrawTextPositions } from "../../ui/drawText";
import { pbFadeOutIn } from "../../ui/fades";
import { pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { RPGCache, preloadBitmaps } from "../../ui/rpgCache";
import { f32 } from "../../ui/scenes/frames";
import { BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { ItemIconSprite, itemIconFilename, preloadItemIcons } from "../../ui/sprites/itemIcon";
import { PokemonIconSprite, preloadPokemonIcons } from "../../ui/sprites/pokemonIcon";
import { PokemonSprite, SpeciesFiles, preloadPokemonSprite } from "../../ui/sprites/pokemonSprite";
import { Mouse } from "../easyMouse/Mouse";
import { maskBang } from "../lukasUtilities/bitmaps";
import { EATABLE_ITEMS, POKEMON_ZOOM, amieItemScene, setAmiePokemon } from "./amie";

const AMIE = "Graphics/Pictures/Pokemon Amie/";
const party = () => (G.player as unknown as { party: Pokemon[] }).party;
const bag = () => G.bag as PokemonBag;

/** Every picture of the plugin's folder the scene shows (besides the backdrop). */
const PICTURES = [
  "hand1", "hand2", "switch", "back", "feed", "feedshow", "active", "affect", "affect_empty", "full",
  "full_empty", "enjoy", "enjoy_empty", "heart", "textbox", "eaten1", "eaten2", "eaten3",
  "bgswitch1", "bgswitch2", "bgswitch3", "bgswitch4", "bgswitch5", "bgswitch6",
];

//===============================================================================
// Frames, input and time
//===============================================================================
const frames = new OriginalFrames();
/** Graphics.update (one 40 fps frame). */
const graphicsUpdate = (): Promise<void> => frames.update();
let lastInputFrame = 0;
/** Input.update, with the time since the previous one (see the header). */
function inputUpdate(): void {
  const dt = (Graphics.frameCount - lastInputFrame) * Graphics.deltaS;
  lastInputFrame = Graphics.frameCount;
  Input.update(dt > 0 && dt < 1 ? dt : Graphics.deltaS);
}
/** pbWait(1): Graphics.update; Input.update; pbUpdateSceneMap */
async function pbWait1(): Promise<void> {
  await graphicsUpdate();
  inputUpdate();
  await pbUpdateSceneMap();
}
/** Time.now.to_f (game time, in seconds). */
const timeNow = (): number => Graphics.frameCount * Graphics.deltaS;
/** `@time = 0`: Time.now - 0 is always larger than the waits compared with it. */
const LONG_AGO = Number.NEGATIVE_INFINITY;
/** Integer#/ */
const idiv = (a: number, b: number): number => Math.floor(a / b);

/**
 * IconSprite#setBitmap(file). In mkxp-z the sprite ends up showing the whole
 * new bitmap: `bitmap=` resets src_rect in place, and `self.src_rect = oldrc`
 * assigns that same Rect back. SpriteWrapper's setBitmapFile restores the old
 * rectangle instead (the hand cursor is 29×28, the food icons 48×48), so the
 * rectangle is reset here.
 */
function setIcon(sprite: Sprite, file: string): void {
  const icon = sprite as IconSprite;
  icon.setBitmapFile(file);
  if (icon.bitmap) icon.srcRect.set(0, 0, icon.bitmap.width, icon.bitmap.height);
}

//===============================================================================
// pbClickSprite
//===============================================================================
export async function pbClickSprite(sprite: Sprite): Promise<void> {
  let i = 1;
  for (let n = 0; n < 5; n++) {
    sprite.zoomX = f32(sprite.zoomX - 0.1 ** i);
    sprite.zoomY = f32(sprite.zoomY - 0.1 ** i);
    i += 1;
    await graphicsUpdate();
  }
  pbPlayCancelSE();
  i = 1;
  for (let n = 0; n < 5; n++) {
    sprite.zoomX = f32(sprite.zoomX + 0.1 ** i);
    sprite.zoomY = f32(sprite.zoomY + 0.1 ** i);
    i += 1;
    await graphicsUpdate();
  }
}

//===============================================================================
// Sprite Mask by Luka S.J. (Sprite#maskOLD)
//===============================================================================
/** Bitmaps maskOLD made, so the next call can free the one it replaces (Ruby leaves them to the GC). */
const maskedBitmaps = new WeakSet<Bitmap>();

/**
 * sprite.maskOLD(mask, xpush, ypush): masks the sprite's current bitmap with
 * another (a Bitmap, a Sprite or a graphic's path): the result is the mask's
 * size, centred on the bitmap, each pixel taking the lower of the two alphas.
 * Returns the new bitmap, or false.
 */
export function maskOLD(sprite: Sprite, mask: Bitmap | Sprite | string | null = null, xpush = 0, ypush = 0): Bitmap | false {
  // exits out of the function if the sprite currently has no bitmap to mask
  if (!sprite.bitmap) return false;
  // backs up the Sprites current bitmap
  const old = sprite.bitmap;
  // check for mask types
  let mbmp: Bitmap | null;
  if (mask instanceof Bitmap) mbmp = mask; // accepts Bitmap.new
  else if (mask instanceof Sprite) mbmp = mask.bitmap; // accepts other Sprite.new
  else if (typeof mask === "string") mbmp = RPGCache.loadBitmap("", mask); // accepts Strings
  else return false; // exits if non-matching type
  if (!mbmp) throw new Error(`Errno::ENOENT: File not found - ${String(mask)}`);
  // the same pixel transfer as Scripting Utilities' Bitmap#mask! (plugins/lukasUtilities)
  const ret = maskBang(old, mbmp, xpush, ypush) as Bitmap;
  sprite.setBitmap(ret);
  maskedBitmaps.add(ret);
  if (maskedBitmaps.has(old)) old.dispose();
  // returns finalized bitmap to be used elsewhere
  return ret;
}

//===============================================================================
// This class performs menu screen processing.
//-------------------------------------------------------------------------------
// Adapted by rigbycwts for use with Pokemon-Amie for Essentials, Edited by Pizza Sun
//===============================================================================
type SpriteHash = Record<string, Sprite | null | undefined>;

export class PokeAmie_Scene {
  animationState = 0;
  private pokemon: Pokemon | null = null;
  private partyIndex: number | null = null;
  private selectedIndex: number | null = null;
  private sprites: SpriteHash = {};
  private viewport!: Viewport;
  private counter = 0;
  private foodcounter = 0;
  private shouldbreak = false;
  private time1 = 0;
  private time2 = 0;
  private time3 = 0;
  private switch_ = 0;
  private feedshow = 0;
  private foodnum = 0;
  private mouseX: number | null = null;
  private food: Id | null = null;
  private feeding = false;
  private items: Id[] = [];
  private mask: string | null = null;
  private full = false;
  private custom = false;
  /** @nibbleCooldown: never initialised by pbStartScene (nil until the first frame not spent nibbling). */
  private nibbleCooldown: number | null = null;
  private initialY = 0;
  /** getPlayTime("Audio/SE/pet.ogg") */
  private petPlayTime = 0;

  private sp(key: string): Sprite {
    const s = this.sprites[key];
    if (!s) throw new Error(`NoMethodError: undefined method for nil:NilClass (@sprites["${key}"])`);
    return s;
  }

  //-----------------------------------------------------------------------------
  // * Frame Update
  //-----------------------------------------------------------------------------
  async updateWalkAnimation(): Promise<void> {
    if (this.sp("pokemon").isDisposed()) {
      this.animationState = 0;
      return;
    }

    if (Mouse.overPixel(this.sp("pokemon")) && Mouse.press(this.sp("pokemon"), "left")) return;

    // Calculate the new x-coordinate for the walking animation
    if (this.animationState === 0) {
      // Store the initial y-coordinate of the sprite
      this.initialY = this.sp("pokemon").y;
    }

    if (this.animationState < 100) {
      // Walk to the left
      this.sp("pokemon").x -= 2;
      if (this.animationState === 99) this.sprites["pokemon"] = this.createMirroredSprite(this.sp("pokemon"));
    } else if (this.animationState < 300) {
      // Walk to the right
      this.sp("pokemon").x += 2;
      if (this.animationState === 299) this.sprites["pokemon"] = this.createMirroredSprite(this.sp("pokemon"));
    } else {
      // Reset the walking state and mirror property
      // NOTE (Ruby parity): from -100 the next leg left is 200 frames, twice
      // the first one; and @initial_y is re-read at state 0 from a y that is
      // still bobbing, so the Pokémon creeps 3 px up each round trip.
      this.animationState = -100;
    }

    // Just move y a little bit to simulate a walking animation
    // (Sprite#y= keeps the integer part, as mkxp-z does.)
    this.sp("pokemon").y = Math.trunc(this.initialY + 5 * Math.sin((this.animationState * Math.PI) / 5));

    // Increment the animation state
    this.animationState += 1;

    // Update the sprite and refresh the graphics
    pbUpdateSpriteHash(this.sprites);
    await graphicsUpdate();
  }

  async update(): Promise<void> {
    // Update windows
    pbUpdateSpriteHash(this.sprites);
    await this.updateWalkAnimation();
    if (this.custom) {
      this.updateCustom();
    } else {
      await this.updateCommand();
    }
    if (this.switch === 1) {
      await pbFadeOutIn(() => this.pbSwitchScreen(), 99_999);
    }
    const text = this.sprites["text"];
    if (this.switch !== 0 && text && !text.isDisposed()) {
      const base = new Color(248, 248, 248);
      const shadow = new Color(104, 104, 104);
      this.selectedIndex ??= this.partyIndex;
      const pkname = party()[this.selectedIndex!]!.name;
      const textpos1: TextPosition[] = [
        [_INTL("Affection"), 32, 70, 0, base, shadow],
        [_INTL("Fullness"), 32, 102, 0, base, shadow],
        [_INTL("Enjoyment"), 32, 134, 0, base, shadow],
        [_INTL("Select the Pokémon you'd like to play with!"), 74, 348, 0, base, shadow],
        [pkname, 70, 20, 0, base, shadow],
      ];
      text.dispose();
      const sprite = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
      this.sprites["text"] = sprite;
      pbSetSystemFont(sprite.bitmap!);
      pbDrawTextPositions(sprite.bitmap!, textpos1);
    }
    if (this.feedshow === 1) {
      const fs = this.sprites["feedshow"];
      if (fs == null || fs.isDisposed()) {
        const sprite = new IconSprite(0, 0);
        this.sprites["feedshow"] = sprite;
        sprite.viewport = this.viewport;
        setIcon(sprite, AMIE + "feedshow");
        sprite.oy = idiv(sprite.bitmap!.height, 2);
        sprite.x = this.sp("feed").x;
        sprite.y = this.sp("feed").y;
        sprite.zoomX = f32(0.2);
        sprite.zoomY = f32(0.2);
        for (let n = 0; n < 8; n++) {
          sprite.zoomX = f32(sprite.zoomX + 0.1);
          await graphicsUpdate();
        }
        for (let n = 0; n < 4; n++) {
          sprite.zoomY = f32(sprite.zoomY + 0.2);
          await graphicsUpdate();
        }
      }
      this.foodnum = 0;
      const itemcount = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
      this.sprites["itemcount"] = itemcount;
      pbSetSystemFont(itemcount.bitmap!);
      itemcount.bitmap!.font.size = 24;
      itemcount.z = 1;
      const feed = this.sp("feed");
      for (const item of EATABLE_ITEMS) {
        if (!(bag().quantity(item) > 0)) continue;
        this.items[this.foodnum] = item;
        const food = new ItemIconSprite(0, 0, null, this.viewport);
        this.sprites[`food${this.foodnum}`] = food;
        food.item = item;
        food.ox = idiv(food.bitmap!.width, 2);
        food.oy = idiv(food.bitmap!.height, 2);
        food.x = food.ox + feed.ox + feed.x + food.bitmap!.width * this.foodnum;
        food.y = feed.y;
        const num = bag().quantity(item);
        pbDrawOutlineText(itemcount.bitmap!, food.x, food.y, 24, 24, String(num), new Color(248, 248, 248), new Color(30, 30, 30), 0);
        let srcx = feed.x - food.x;
        if (srcx < 0) srcx = 0;
        food.srcRect.set(srcx, 0, food.bitmap!.width, food.bitmap!.width);
        this.foodnum += 1;
      }
      this.feedshow = 3;
    } else if (this.feedshow === 2) {
      // NOTE (Ruby parity): the count overlay is disposed inside the food loop
      // (Pokemon Amie.rb:525), so with no food it stays (empty) until the scene ends.
      for (let item = 0; item < this.foodnum; item++) {
        this.sp(`food${item}`).dispose();
        this.sp("itemcount").dispose();
      }
      const sprite = this.sp("feedshow");
      for (let n = 0; n < 4; n++) {
        sprite.zoomY = f32(sprite.zoomY - 0.2);
        await graphicsUpdate();
      }
      for (let n = 0; n < 8; n++) {
        if (sprite.zoomX - 0.1 <= 0) break;
        sprite.zoomX = f32(sprite.zoomX - 0.1);
        await graphicsUpdate();
      }
      sprite.dispose();
      this.feedshow = 0;
    }
  }

  get switch(): number {
    return this.switch_;
  }

  pbSwitchScreen(): void {
    const base = new Color(248, 248, 248);
    const shadow = new Color(104, 104, 104);
    const pkname = party()[this.partyIndex!]!.name;
    const textpos1: TextPosition[] = [
      [_INTL("Affection"), 32, 70, 0, base, shadow],
      [_INTL("Fullness"), 32, 102, 0, base, shadow],
      [_INTL("Enjoyment"), 32, 134, 0, base, shadow],
      [_INTL("Select the Pokémon you'd like to play with!"), 74, 348, 0, base, shadow],
      [pkname, 70, 20, 0, base, shadow],
    ];
    const text = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites["text"] = text;
    pbSetSystemFont(text.bitmap!);
    pbDrawTextPositions(text.bitmap!, textpos1);
    for (let i = 0; i < party().length; i++) {
      const icon = new PokemonIconSprite(party()[i]!, this.viewport);
      this.sprites[`pokeicon${i}`] = icon;
      icon.ox = idiv(icon.bitmap!.width, 4);
      icon.oy = idiv(icon.bitmap!.height, 2);
      icon.x = 68 + 76 * i;
      icon.y = 228;
      icon.z = 1;
    }
    const index = this.partyIndex! + 1;
    setIcon(this.sp("bgmap"), AMIE + "bgswitch" + String(index));
    this.sp("pokemon").dispose();
    this.sp("switch").dispose();
    this.sp("feed").dispose();
    const fs = this.sprites["feedshow"];
    if (fs != null && !fs.isDisposed()) {
      fs.dispose();
      this.feedshow = 0;
    }
    if (this.foodnum > 0) {
      const ic = this.sprites["itemcount"];
      if (ic != null && !ic.isDisposed()) ic.dispose();
      for (let x = 0; x < this.foodnum; x++) {
        const food = this.sprites[`food${x}`];
        if (food == null) continue;
        if (!food.isDisposed()) food.dispose();
      }
    }
    const active = new IconSprite(0, 0);
    this.sprites["active"] = active;
    active.viewport = this.viewport;
    setIcon(active, AMIE + "active");
    active.ox = idiv(active.bitmap!.width, 2);
    active.oy = idiv(active.bitmap!.height, 2);
    active.x = 68 + 76 * this.partyIndex! + 24;
    active.y = 228 + 24;
    active.z = 2;
    // Draw Affection, Fullness and Enjoyment
    this.drawHearts(this.pokemon!, true);
    this.switch_ = 2;
  }

  /**
   * The five hearts of each stat (pbSwitchScreen makes them, a click on an
   * icon redraws them for that Pokémon with the same code).
   */
  private drawHearts(pkmn: Pokemon, create: boolean): void {
    const rows: [string, number | null, number][] = [
      ["affect", pkmn.getAffectionLevel(), 87],
      ["full", pkmn.getFullnessLevel(), 87 + 32],
      ["enjoy", pkmn.getEnjoymentLevel(), 87 + 64],
    ];
    for (let a = 1; a < 6; a++) {
      for (const [name, level, y] of rows) {
        if (create) this.sprites[`${name}${a}`] = new IconSprite(0, 0);
        const s = this.sp(`${name}${a}`);
        // (`a <= nil` raises in Ruby; levels are never nil for 0-255 points.)
        setIcon(s, AMIE + (a <= level! ? name : `${name}_empty`));
        const space = 15;
        s.viewport = this.viewport;
        s.ox = idiv(s.bitmap!.width, 2);
        s.oy = idiv(s.bitmap!.height, 2);
        s.x = 178 + s.bitmap!.width * a + space;
        s.y = y;
      }
    }
  }
  //-----------------------------------------------------------------------------

  async pbStartScene(pokemon: Pokemon | null): Promise<void> {
    this.pokemon = pokemon;
    this.partyIndex = this.getPartyIndex(this.pokemon);
    this.sprites = {};
    this.counter = 0;
    this.foodcounter = 0;
    this.shouldbreak = false;
    this.time1 = LONG_AGO;
    this.time2 = LONG_AGO;
    this.time3 = LONG_AGO;
    this.switch_ = 0;
    this.feedshow = 0;
    this.foodnum = 0;
    this.mouseX = null;
    this.food = null;
    this.feeding = false;
    this.items = [];
    this.mask = null;
    this.full = false;
    // Ruby loads graphics as it shows them; here they are fetched first.
    await this.preload();
    await this.main();
  }

  /** Fetches the graphics (and pet.ogg's length) the scene can show. */
  private async preload(): Promise<void> {
    const members = party().filter((p): p is Pokemon => !!p);
    const [, , , petTime] = await Promise.all([
      preloadBitmaps([...PICTURES.map((p) => AMIE + p), AMIE + backdropName()]),
      preloadItemIcons(EATABLE_ITEMS),
      preloadPokemonIcons(members),
      fetchPlayTime("pet.ogg"),
      ...members.filter((p) => !p.egg()).map((p) => preloadPokemonSprite(p)),
    ]);
    this.petPlayTime = petTime;
  }

  //-----------------------------------------------------------------------------
  // * Main Processing
  //-----------------------------------------------------------------------------
  async main(): Promise<void> {
    // Makes the text window
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99_999;
    const bgmap = new IconSprite(0, 0);
    this.sprites["bgmap"] = bgmap;
    setIcon(bgmap, AMIE + this.pbBackdrop());
    bgmap.viewport = this.viewport;
    const mouse = new IconSprite(0, 0);
    this.sprites["mouse"] = mouse;
    setIcon(mouse, AMIE + "hand2");
    mouse.z = 5;
    mouse.viewport = this.viewport;
    mouse.ox = idiv(mouse.bitmap!.width, 2);
    mouse.oy = idiv(mouse.bitmap!.height, 2);
    mouse.x = Mouse.x;
    mouse.y = Mouse.y;

    const sw = new IconSprite(0, 0);
    this.sprites["switch"] = sw;
    setIcon(sw, AMIE + "switch");
    sw.viewport = this.viewport;
    // sets switch icon to bottom right
    sw.ox = sw.bitmap!.width;
    sw.oy = sw.bitmap!.height;
    sw.x = Graphics.width;
    sw.y = Graphics.height;
    const back = new IconSprite(0, 0);
    this.sprites["back"] = back;
    setIcon(back, AMIE + "back");
    back.viewport = this.viewport;
    // sets 'back' icon to bottom left
    back.oy = back.bitmap!.height;
    back.y = Graphics.height;
    const feed = new IconSprite(0, 0);
    this.sprites["feed"] = feed;
    setIcon(feed, AMIE + "feed");
    feed.viewport = this.viewport;
    feed.ox = idiv(feed.bitmap!.width, 2);
    feed.oy = idiv(feed.bitmap!.height, 2);
    feed.x = 50;
    feed.y = 50;
    feed.z = 2;
    const pk = new PokemonSprite(this.viewport);
    this.sprites["pokemon"] = pk;
    pk.setPokemonBitmap(this.pokemon);
    pk.mirror = false;
    pk.color = new Color(0, 0, 0, 0);
    if (!pk.bitmap || !this.pokemon) throw new Error("NoMethodError: undefined method `width' for nil:NilClass");
    pk.ox = idiv(pk.bitmap.width, 2);
    pk.oy = idiv(pk.bitmap.height, 2);
    pk.x = idiv(Graphics.width, 2);
    pk.y = idiv(Graphics.height, 2) + 30;
    pk.z = 3;
    // NOTE (Ruby parity): main also runs on every return from the switch screen
    // (Pokemon Amie.rb:921-937, 1017-1021), so each return costs 2 Enjoyment
    // and plays the cry and a Following Pokémon line again.
    this.pokemon.amieEnjoyment = this.pokemon.amieEnjoyment - 2;
    if (POKEMON_ZOOM !== 1) this.sprites["pokemon"] = this.createZoomedSprite(pk);
    await this.playPokemonInitialIteration();
    this.custom = false;
  }

  // We can't just zoom the image, we need to create a new sprite with the correct size
  // otherwise the Mouse.over_pixel doesn't work as intended, as it still hover above the original image.
  createZoomedSprite(original: Sprite, zoomFactor = POKEMON_ZOOM): Sprite {
    const zoomed = new Sprite();
    const src = original.bitmap!;
    zoomed.setBitmap(new Bitmap(src.width * zoomFactor, src.height * zoomFactor));
    zoomed.bitmap!.stretchBlt(zoomed.bitmap!.rect(), src, src.rect());
    zoomed.x = original.x;
    zoomed.y = original.y;
    zoomed.z = 3;
    zoomed.ox = idiv(zoomed.bitmap!.width, 2);
    zoomed.oy = idiv(zoomed.bitmap!.height, 2);
    zoomed.color = original.color;
    zoomed.viewport = original.viewport;
    original.dispose();
    return zoomed;
  }

  // We can't just use .mirror because the mouse.over_pixel?? method doesn't take into account the mirrored properties
  createMirroredSprite(original: Sprite): Sprite {
    const mirrored = new Sprite();
    const src = original.bitmap!;
    const bmp = new Bitmap(src.width, src.height);
    // This seems quite heavy, there's probably a better way to do this
    // (Ruby: get_pixel/set_pixel for each pixel; the same pixels, copied in one go.)
    const from = src.ctx.getImageData(0, 0, src.width, src.height);
    const to = bmp.ctx.createImageData(src.width, src.height);
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * src.width + (src.width - x - 1)) * 4;
        for (let c = 0; c < 4; c++) to.data[di + c] = from.data[si + c]!;
      }
    }
    bmp.ctx.putImageData(to, 0, 0); // a new bitmap: its texture is made when first drawn
    mirrored.setBitmap(bmp);
    mirrored.x = original.x;
    mirrored.y = original.y;
    mirrored.z = 3;
    mirrored.ox = idiv(bmp.width, 2);
    mirrored.oy = idiv(bmp.height, 2);
    mirrored.color = original.color;
    mirrored.viewport = original.viewport;
    src.dispose(); // the zoomed/mirrored bitmap it replaces is this scene's own (Ruby leaves it to the GC)
    original.dispose();
    return mirrored;
  }

  async playPokemonInitialIteration(): Promise<void> {
    SpeciesFiles.playPokemonCry(this.pokemon!, 90, 110);

    // Custom text example
    // pbDisplay(_INTL("{1} is looking at you!",@pokemon.name))
    // (`return unless defined?(FollowingPkmn)`: Following Pokemon EX is installed.)
    // If we have FollowingPkmnEx, let's trigger the talk event
    const randomVal = rand(6);
    await EventHandlers.trigger2("following_pkmn_talk", this.pokemon, randomVal, true);

    // Here we could do all sorts of logic
    // (The plugin's commented-out example rotates the sprite to look excited.)
  }

  async playHeartAnimation(): Promise<void> {
    SpeciesFiles.playPokemonCry(this.pokemon!, 90, 110);
    for (let i = 0; i < 4; i++) { // creates the hearts
      const heart = new IconSprite(0, 0);
      this.sprites[String(i)] = heart;
      setIcon(heart, AMIE + "heart");
      heart.viewport = this.viewport;
      heart.z = 4;
      heart.x = this.sp("pokemon").x + rand(70) - 40;
      heart.y = idiv(Graphics.height, 2) - rand(40) + 30;
    }
    for (let n = 0; n < 15; n++) {
      for (let i = 0; i < 4; i++) { // moves hearts
        const heart = this.sp(String(i));
        heart.x += idiv(rand(100), 10) - idiv(rand(100), 10);
        heart.y -= (idiv(rand(4), 3) + 1) * 3;
      }
      pbUpdateSpriteHash(this.sprites);
      await graphicsUpdate();
    }
    for (let i = 0; i < 4; i++) this.sp(String(i)).dispose();
  }

  async pbAmieMouse(): Promise<void> {
    const mouse = this.sp("mouse");
    if (!this.sp("pokemon").isDisposed() && this.feeding !== true) {
      if (Mouse.overPixel(this.sp("pokemon")) && Mouse.press(this.sp("pokemon"), "left")) { // Pressing mouse while over Pokemon?
        setIcon(mouse, AMIE + "hand1");
        await pbWait1();

        if (!Mouse.static()) { // Is the mouse moving?
          this.counter += 1;
          if (timeNow() - this.time2 > this.petPlayTime) { // Audio doesn't overlap
            pbSEPlay("pet.ogg", 90, 100);
            this.time2 = timeNow();
          }
          if (this.counter >= 50) { // after counter reaches number, hearts appear
            await this.pokemon!.changeAmieStats("pet");
            await this.playHeartAnimation();
            await graphicsUpdate();
            this.counter = 0;
          }
        }
      } else {
        setIcon(mouse, AMIE + "hand2");
      }
    }
    if (!this.sp("pokemon").isDisposed() && this.feeding === true) {
      // holding food on the pokemon
      if (Mouse.overPixel(this.sp("pokemon")) && Mouse.press(this.sp("pokemon"), "left") && this.food != null) {
        // NOTE (Ruby parity): @nibbleCooldown is nil until a frame of feeding is
        // spent off the Pokémon (Pokemon Amie.rb:833); food picked up straight
        // over it would raise here.
        if (this.nibbleCooldown == null) throw new Error("NoMethodError: undefined method `+' for nil:NilClass");
        this.nibbleCooldown += 1;
        if (this.nibbleCooldown >= idiv(FRAME_RATE * 1, 2)) {
          this.foodcounter += 1;
          this.nibbleCooldown = 0;
        }
        this.time1 = timeNow();
        if (this.foodcounter === 1) {
          pbSEPlay("eat.ogg", 90, 100);
          this.mask = AMIE + "eaten1.png";
          this.foodcounter = 2;
        }
        if (this.foodcounter === 3) {
          pbSEPlay("eat.ogg", 90, 100);
          this.mask = AMIE + "eaten2.png";
          this.foodcounter = 4;
        }
        if (this.foodcounter === 5) {
          pbSEPlay("eat.ogg", 90, 100);
          setIcon(mouse, AMIE + "eaten3.png");
          const pk = this.pokemon!.species;
          await this.pokemon!.feedAmie(this.food, this.pokemon!, amieItemScene());
          // NOTE (Ruby parity): @sprites["pokemon"] is the zoomed plain Sprite,
          // which has no setPokemonBitmap (Pokemon Amie.rb:854). No food that
          // gets this far changes the species.
          if (pk !== this.pokemon!.species) throw new Error("NoMethodError: undefined method `setPokemonBitmap' for #<Sprite>");
          this.feeding = false;
          this.foodcounter = 0;
          this.time1 = LONG_AGO;
          await this.playHeartAnimation();
          setIcon(mouse, AMIE + "hand2");
          mouse.ox = idiv(mouse.bitmap!.width, 2);
          mouse.oy = idiv(mouse.bitmap!.height, 2);
          this.mask = null;
          await graphicsUpdate();
        }
      } else {
        // not holding food on the pokemon
        this.nibbleCooldown = 0;
      }
      maskOLD(mouse, this.mask);
    }
    // moves hand picture to mouse position
    mouse.x = Mouse.x;
    mouse.y = Mouse.y;
  }

  /** pbBackdrop: gets background based off location */
  pbBackdrop(): string {
    const backdrop = backdropName();
    if (DEBUG) console.info(`MY MESSAGE ${JSON.stringify(currentMapMetadata() ?? null)}`); // Console.echo_li
    return backdrop;
  }

  //-----------------------------------------------------------------------------
  // * Frame Update (when command window is active)
  //-----------------------------------------------------------------------------
  updateCustom(): void {
    if (!Input.trigger(Input.B)) return;
    this.custom = false;
  }

  /** update_command */
  async updateCommand(): Promise<void> {
    // If B button was pressed
    if (Input.trigger(Input.BACK)) {
      if (this.switch === 0) {
        pbPlayCancelSE();
        this.shouldbreak = true; // ends scene loop and starts to end scene
      } else {
        pbPlayCancelSE();
        this.switch_ = 0;
        await pbFadeOutIn(async () => {
          pbDisposeSpriteHash(this.sprites);
          this.viewport.dispose();
          await this.main();
        }, 99_999);
      }
    }
    const textbox = this.sprites["textbox"];
    if (textbox != null && !textbox.isDisposed() && Mouse.click(textbox)) {
      await pbClickSprite(textbox);
      this.switch_ = 0;
      await pbFadeOutIn(async () => {
        this.partyIndex = this.selectedIndex;
        this.pokemon = party()[this.partyIndex!]!;
        pbDisposeSpriteHash(this.sprites);
        this.viewport.dispose();
        await this.main();
      }, 99_999);
    }
    if (!this.sp("switch").isDisposed() && Mouse.click(this.sp("switch"))) { // clicks on switch sprite
      await pbClickSprite(this.sp("switch"));
      this.switch_ = 1;
    }
    const fs = this.sprites["feedshow"];
    if (fs != null && !fs.isDisposed() && (Mouse.press(fs, "left") && !Mouse.overPixel(this.sp("feed")) &&
        Mouse.overPixel(fs)) && this.mouseX != null) {
      let dx = Mouse.x - this.mouseX;
      // NOTE (Ruby parity): with no food in the Bag there is no "food-1" and
      // this raises (Pokemon Amie.rb:946): pressing on the empty food bar stops the game.
      const last = this.sprites[`food${this.foodnum - 1}`];
      if (!last) throw new Error("NoMethodError: undefined method `x' for nil:NilClass");
      if (last.x + last.bitmap!.width + dx <= 512) dx = 0;
      const lx = this.sp("food0").ox + this.sp("feed").ox + this.sp("feed").x;
      if (this.sp("food0").x + dx >= lx) dx = 0;
      this.sp("itemcount").bitmap!.clear();
      for (let x = 0; x < this.foodnum; x++) {
        const food = this.sp(`food${x}`);
        food.x += dx;
        let srcx = this.sp("feed").x - food.x + 40;
        if (srcx < 0) srcx = 0;
        food.srcRect.set(srcx, 0, food.bitmap!.width, food.bitmap!.width);
        const num = bag().quantity(this.items[x]!);
        if (this.sp("feed").x < food.x) {
          pbDrawOutlineText(this.sp("itemcount").bitmap!, food.x, food.y, 24, 24, String(num),
            new Color(248, 248, 248), new Color(30, 30, 30), 0);
        }
      }
    }
    this.mouseX = Mouse.x;
    if (Input.release(Input.MOUSELEFT) && this.feeding === true) {
      this.foodcounter = 0;
      this.mask = null;
      this.feeding = false;
    }
    if (this.sprites["feedshow"] != null) {
      // (Mouse.static? remembers the position it was called with: the second
      // call in a frame is always true, as in the plugin.)
      if (Input.release(Input.MOUSELEFT) || !Mouse.static()) this.time1 = timeNow();
      if (Mouse.static() && timeNow() - this.time1 > 0.2 && !this.sp("feedshow").isDisposed()) {
        for (let x = 0; x < this.foodnum; x++) {
          if (!Mouse.press(this.sp(`food${x}`), "left")) continue;
          if (this.pokemon!.getFullnessLevel() === 5) {
            this.full = true;
            this.time3 = timeNow();
            pbDrawOutlineText(this.sp("itemcount").bitmap!, idiv(Graphics.width, 2) - 64, this.sp("feed").x + 30, 128, 32,
              this.pokemon!.name + " is full!", new Color(248, 248, 248), new Color(30, 30, 30), 0);
            break;
          }
          const mouse = this.sp("mouse");
          setIcon(mouse, itemIconFilename(this.items[x]!));
          mouse.ox = idiv(mouse.bitmap!.width, 2);
          mouse.oy = idiv(mouse.bitmap!.height, 2);
          this.food = this.items[x]!;
          this.feeding = true;
          this.feedshow = 2;
        }
      }
      if (this.full === true && timeNow() - this.time3 > 0.5) {
        this.full = false;
        const fs2 = this.sprites["feedshow"];
        if (fs2 != null && !fs2.isDisposed()) {
          this.sp("itemcount").bitmap!.clear();
          for (let x = 0; x < this.foodnum; x++) {
            const num = bag().quantity(this.items[x]!);
            pbDrawOutlineText(this.sp("itemcount").bitmap!, this.sp(`food${x}`).x, this.sp(`food${x}`).y, 24, 24, String(num),
              new Color(248, 248, 248), new Color(30, 30, 30), 0);
          }
        }
      }
    }
    // (`Mouse.hold?(:left)` passes the Symbol as the object: it is only "over"
    // it at pixel (0, 0), and click? is only true once the button is up, so
    // it never stops the click.)
    if (!this.sp("feed").isDisposed() && (Mouse.click(this.sp("feed")) && !Mouse.hold("left"))) { // clicks on feed sprite
      if (this.feedshow === 3) {
        await pbClickSprite(this.sp("feed"));
        this.feedshow = 2;
      }
      if (this.feedshow === 0) {
        await pbClickSprite(this.sp("feed"));
        this.feedshow = 1;
      }
    }
    if (Mouse.click(this.sp("back"))) {
      await pbClickSprite(this.sp("back"));
      if (this.switch === 0) {
        this.shouldbreak = true; // ends scene loop and starts to end scene
      } else {
        this.switch_ = 0;
        await pbFadeOutIn(async () => {
          pbDisposeSpriteHash(this.sprites);
          this.viewport.dispose();
          await this.main();
        }, 99_999);
      }
    }
    for (let i = 0; i < party().length; i++) {
      const icon = this.sprites[`pokeicon${i}`];
      if (icon == null) break;
      if (icon.isDisposed()) break;

      // on the pokemon switch screen
      if (!Mouse.click(icon)) continue;
      this.selectedIndex = i;
      const selected = party()[this.selectedIndex]!;
      this.drawHearts(selected, false);
      const tb = this.sprites["textbox"];
      if (selected.egg() && tb != null && !tb.isDisposed()) {
        tb.dispose();
        this.sp("overlay").dispose();
      }
      const tb2 = this.sprites["textbox"];
      if (this.partyIndex !== this.selectedIndex && !selected.egg() && (tb2 == null || tb2.isDisposed())) {
        const box = new IconSprite(96, 281);
        this.sprites["textbox"] = box;
        setIcon(box, AMIE + "textbox");
        box.viewport = this.viewport;
        box.x += idiv(box.bitmap!.width, 2);
        box.y += idiv(box.bitmap!.height, 2);
        box.ox = idiv(box.bitmap!.width, 2);
        box.oy = idiv(box.bitmap!.height, 2);
        const base = new Color(64, 64, 64);
        const shadow = new Color(176, 176, 176);
        const tx = box.x;
        const ty = box.y - idiv(3 * box.oy, 4);
        const textpos: TextPosition[] = [[_INTL("Switch Pokémon!"), tx, ty, 2, base, shadow]];
        const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
        this.sprites["overlay"] = overlay;
        pbSetSystemFont(overlay.bitmap!);
        pbDrawTextPositions(overlay.bitmap!, textpos);
      }
      const tb3 = this.sprites["textbox"];
      if (this.selectedIndex === this.partyIndex && tb3 != null && !tb3.isDisposed()) {
        tb3.dispose();
        this.sp("overlay").dispose();
      }

      const index = i + 1;
      setIcon(this.sp("bgmap"), AMIE + "bgswitch" + String(index));
    }
  }

  break(): boolean {
    return this.shouldbreak;
  }

  /** getPartyIndex(pkmn) (Ruby returns the `for` loop's range when it isn't found; it always is). */
  getPartyIndex(pkmn: Pokemon | null): number | null {
    const i = party().findIndex((p) => p === pkmn);
    return i >= 0 ? i : null;
  }

  pbEndScene(): void {
    // Disposes the windows
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  }
}

/** $game_map.metadata */
function currentMapMetadata() {
  const map = G.gameMap as { mapId?: number } | null;
  return map?.mapId != null ? mapMetadata(map.mapId) : undefined;
}

/** pbBackdrop's choice of picture (gets background based off location). */
function backdropName(): string {
  const environ = G.gameMap ? pbGetEnvironment() : "None";
  // Choose backdrop
  let backdrop = "Field";
  const meta = currentMapMetadata();
  if (environ === "Cave") backdrop = "Cave";
  else if (environ === "MovingWater") backdrop = "Water";
  else if (environ === "Underwater") backdrop = "Underwater";
  else if (environ === "Rock") backdrop = "Mountain";
  else if (!G.gameMap || !meta) backdrop = "IndoorA";
  if (G.gameMap && meta) {
    // NOTE (Ruby parity): most maps' BattleBack (cave1, tunnel, battle1...)
    // has no picture in Graphics/Pictures/Pokemon Amie, so their backdrop is
    // a blank 32×32 bitmap (GifBitmap's fallback): a black background.
    const back = meta.battleBackground;
    if (back && back !== "") backdrop = back;
  }
  const next = (G.pokemonGlobal as { nextBattleBack?: string | null } | null)?.nextBattleBack;
  if (next) backdrop = next;
  // Apply graphics
  return backdrop;
}

export class PokeAmieScreen {
  private animationState = 0;

  constructor(private scene: PokeAmie_Scene) {
    scene.animationState = this.animationState;
  }

  async pbStartAmie(pokemon: Pokemon | null): Promise<void> {
    await this.scene.pbStartScene(pokemon);
    lastInputFrame = Graphics.frameCount;
    // Main loop
    for (;;) {
      // Update game screen
      await graphicsUpdate();
      // Update input information
      inputUpdate();
      // Frame update
      await this.scene.update();
      // Mouse Check
      await this.scene.pbAmieMouse();
      // Abort loop
      if (this.scene.break()) break;
    }
    await pbFadeOutIn(() => this.scene.pbEndScene(), 99_999);
  }
}

/** pokemonAmieRefresh(pkmn = nil): plays with party member `pkmn` (an index), or the first able one. */
export async function pokemonAmieRefresh(pkmn: number | null = null): Promise<void> {
  const pokemon = setAmiePokemon(pkmn);
  await pbFadeOutIn(async () => {
    const scene = new PokeAmie_Scene();
    const screen = new PokeAmieScreen(scene);
    await screen.pbStartAmie(pokemon);
  }, 99_999);
}
