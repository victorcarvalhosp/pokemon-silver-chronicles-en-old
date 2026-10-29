// Port of the Pokémon icon sprites (014_Pokemon/001_Pokemon-related/
// 003_Pokemon_Sprites.rb: PokemonIconSprite, PokemonSpeciesIconSprite) and the
// icon filename lookups from 010_Data/002_PBS data/009_Species_Files.rb, as
// this game loads them:
// - Essentials Deluxe ([000] Essentials Patches/Species Files.rb) replaces
//   check_graphic_file / icon_filename / icon_filename_from_pokemon (adds the
//   super shiny, Dynamax/Gigantamax and celestial lookups) and
//   PokemonIconSprite#pokemon= / PokemonSpeciesIconSprite (applyIconEffects,
//   shadow/dmax/gmax/celestial params). "Pokémon Birthsigns" isn't installed,
//   so the celestial hue is always 0.
// - Essentials Deluxe / ZUD's Sprite#applyIconEffects: Dynamax icons are
//   zoomed 1.5x (only in battle; out of battle no Pokémon is Dynamaxed). The
//   Dynamax pattern overlay (mkxp-z Sprite#pattern) isn't supported.
//
// The original counts the icon animation in Graphics.frame_rate frames, one
// per update call; at our 60 Hz that's FRAME_RATE = 60 (GameCharacter.ts).
//
// Graphics must be preloaded (rpgCache): preloadPokemonIcons() resolves the
// exact file each Pokémon will use and fetches it.

import { assetExists } from "../../core/assets";
import type { Id } from "../../data/gameData/gameData";
import { Species } from "../../data/gameData/species";
import { FRAME_RATE } from "../../game/GameCharacter";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbResolveBitmap, preloadBitmaps } from "../rpgCache";
import { PictureOrigin } from "../scenes/PictureEx";

/**
 * pbResolveBitmap for filename probing: files that don't exist resolve to
 * null without a "not preloaded" warning (Ruby probes many names).
 */
export function resolveBitmap(path: string): string | null {
  return assetExists(path) ? pbResolveBitmap(path) : null;
}

/** pbResolveBitmap answered from the asset index alone (to find what to preload). */
function existsOnly(path: string): string | null {
  return assetExists(path) ? path : null;
}

type Resolve = (path: string) => string | null;

/** shiny: false, true or "super_shiny" (Essentials Deluxe's :super_shiny). */
export type ShinyParam = boolean | "super_shiny";

/** species_icon_params(species, form, gender, shiny, shadow, egg, dmax, gmax, celestial) */
export interface SpeciesIconParams {
  species: Id;
  form?: number;
  gender?: number;
  shiny?: ShinyParam;
  shadow?: boolean;
  egg?: boolean;
  dmax?: boolean;
  gmax?: boolean;
  celestial?: boolean;
}

//===============================================================================
// GameData::Species file lookups (Essentials Deluxe versions)
//===============================================================================

/** GameData::Species.check_graphic_file(path, params, subfolder) */
export function checkGraphicFile(path: string, params: SpeciesIconParams, subfolder = "", resolve: Resolve = resolveBitmap): string | null {
  const species = params.species;
  const form = params.form ?? 0;
  const gender = params.gender ?? 0;
  const shiny = params.shiny ?? false;
  const shadow = params.shadow ?? false;
  const dmax = params.dmax ?? false;
  const gmax = params.gmax ?? false;
  const celestial = params.celestial ?? false;
  let trySpecies = species;
  let tryForm = form > 0 ? `_${form}` : "";
  let tryGender = gender === 1 ? "_female" : "";
  let tryShadow = shadow ? "_shadow" : "";
  let tryDmax = dmax ? "_dmax" : "";
  let tryGmax = gmax ? "_gmax" : "";
  let tryCelest = celestial ? "_celestial" : "";
  const subfolderTries: string[] = [];
  if (subfolder) {
    if (gmax) {
      if (shiny === "super_shiny") subfolderTries.push(" super shiny/Gigantamax/");
      if (shiny) subfolderTries.push(" shiny/Gigantamax/");
      subfolderTries.push("/Gigantamax/");
    }
    if (dmax) {
      if (shiny === "super_shiny") subfolderTries.push(" super shiny/Dynamax/");
      if (shiny) subfolderTries.push(" shiny/Dynamax/");
      subfolderTries.push("/Dynamax/");
    }
    if (shiny) {
      if (shiny === "super_shiny") subfolderTries.push(" super shiny/");
      subfolderTries.push(" shiny/");
    }
    subfolderTries.push("/");
  }
  subfolderTries.push("");
  const factors: [number, string, string][] = [];
  if (celestial) factors.push([6, tryCelest, ""]);
  if (gmax) factors.push([5, tryGmax, ""]);
  if (dmax) factors.push([4, tryDmax, ""]);
  if (shadow) factors.push([3, tryShadow, ""]);
  if (gender === 1) factors.push([2, tryGender, ""]);
  if (form > 0) factors.push([1, tryForm, ""]);
  factors.push([0, trySpecies, "000"]);
  for (let i = 0; i < 2 ** factors.length; i++) {
    factors.forEach((factor, index) => {
      const value = Math.floor(i / 2 ** index) % 2 === 0 ? factor[1] : factor[2];
      switch (factor[0]) {
        case 0: trySpecies = value; break;
        case 1: tryForm = value; break;
        case 2: tryGender = value; break;
        case 3: tryShadow = value; break;
        case 4: tryDmax = value; break;
        case 5: tryGmax = value; break;
        case 6: tryCelest = value; break;
      }
    });
    for (const tryFolder of subfolderTries) {
      const ret = resolve(`${path}${subfolder}${tryFolder}${trySpecies}${tryForm}${tryGender}${tryShadow}${tryDmax}${tryGmax}${tryCelest}`);
      if (ret) return ret;
    }
  }
  return null;
}

/** GameData::Species.check_egg_graphic_file(path, species, form, suffix) */
export function checkEggGraphicFile(path: string, species: Id, form: number, suffix = "", resolve: Resolve = resolveBitmap): string | null {
  const speciesData = Species.getSpeciesForm(species, form);
  if (!speciesData) return null;
  if (form > 0) {
    const ret = resolve(`${path}${speciesData.species}_${form}${suffix}`);
    if (ret) return ret;
  }
  return resolve(`${path}${speciesData.species}${suffix}`);
}

/** GameData::Species.egg_icon_filename(species, form) */
export function eggIconFilename(species: Id, form: number, resolve: Resolve = resolveBitmap): string | null {
  const ret = checkEggGraphicFile("Graphics/Pokemon/Eggs/", species, form, "_icon", resolve);
  return ret ?? resolve("Graphics/Pokemon/Eggs/000_icon");
}

/** GameData::Species.icon_filename(species, form, gender, shiny, shadow, egg, dmax, gmax, celestial) */
export function speciesIconFilename(params: SpeciesIconParams, resolve: Resolve = resolveBitmap): string | null {
  if (params.egg) return eggIconFilename(params.species, params.form ?? 0, resolve);
  return checkGraphicFile("Graphics/Pokemon/", params, "Icons", resolve);
}

/** The icon parameters icon_filename_from_pokemon passes for a Pokémon. */
export function pokemonIconParams(pkmn: Pokemon): SpeciesIconParams {
  const shiny: ShinyParam = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
  return {
    species: pkmn.species, form: pkmn.form, gender: pkmn.gender, shiny, shadow: pkmn.shadowPokemon(),
    egg: pkmn.egg(), dmax: pkmn.dynamax, gmax: pkmn.gmax, celestial: pkmn.celestial(),
  };
}

/** GameData::Species.icon_filename_from_pokemon(pkmn) */
export function iconFilenameFromPokemon(pkmn: Pokemon, resolve: Resolve = resolveBitmap): string | null {
  return speciesIconFilename(pokemonIconParams(pkmn), resolve);
}

/** Fetches the icon graphics these Pokémon will show (call before creating their sprites). */
export async function preloadPokemonIcons(pkmns: Iterable<Pokemon | null | undefined>): Promise<void> {
  const paths = new Set<string>();
  for (const p of pkmns) {
    if (!p) continue;
    const file = iconFilenameFromPokemon(p, existsOnly);
    if (file) paths.add(file);
  }
  await preloadBitmaps(paths);
}

/** Fetches a species icon (PokemonSpeciesIconSprite) before it's shown. */
export async function preloadSpeciesIcons(list: Iterable<SpeciesIconParams>): Promise<void> {
  const paths = new Set<string>();
  for (const params of list) {
    const file = speciesIconFilename(params, existsOnly);
    if (file) paths.add(file);
  }
  await preloadBitmaps(paths);
}

/** RGSS skips the src_rect reset when the same bitmap is assigned again. */
function assignBitmap(sprite: Sprite, bitmap: Bitmap | null): void {
  if (sprite.bitmap !== bitmap) sprite.setBitmap(bitmap);
}

/** Sprite#changeOrigin for icons: oy in the middle of the lower 3/4 for CENTER. */
function iconChangeOrigin(sprite: Sprite, offset: number): void {
  switch (offset) {
    case PictureOrigin.TOP_LEFT: case PictureOrigin.LEFT: case PictureOrigin.BOTTOM_LEFT:
      sprite.ox = 0; break;
    case PictureOrigin.TOP: case PictureOrigin.CENTER: case PictureOrigin.BOTTOM:
      sprite.ox = Math.floor(sprite.srcRect.width / 2); break;
    case PictureOrigin.TOP_RIGHT: case PictureOrigin.RIGHT: case PictureOrigin.BOTTOM_RIGHT:
      sprite.ox = sprite.srcRect.width; break;
  }
  switch (offset) {
    case PictureOrigin.TOP_LEFT: case PictureOrigin.TOP: case PictureOrigin.TOP_RIGHT:
      sprite.oy = 0; break;
    case PictureOrigin.LEFT: case PictureOrigin.CENTER: case PictureOrigin.RIGHT:
      // NOTE: This assumes the top quarter of the icon is blank, so oy is placed
      //       in the middle of the lower three quarters of the image.
      sprite.oy = Math.floor((sprite.srcRect.height * 5) / 8); break;
    case PictureOrigin.BOTTOM_LEFT: case PictureOrigin.BOTTOM: case PictureOrigin.BOTTOM_RIGHT:
      sprite.oy = sprite.srcRect.height; break;
  }
}

//===============================================================================
// Pokémon icon (for defined Pokémon)
//===============================================================================
export class PokemonIconSprite extends Sprite {
  selected = false;
  active = false;
  private _pokemon: Pokemon | null = null;
  private animBitmap: AnimatedBitmap | null = null;
  private numFrames = 0;
  private currentFrame = 0;
  private counter = 0;
  private offset: number | null = null;
  /** Offset due to "jumping" animation in party screen (x/y stay the logical position). */
  private adjustedX = 0;
  private adjustedY = 0;

  constructor(pokemon: Pokemon | null, viewport: Viewport | null = null) {
    super(viewport);
    this.pokemon = pokemon;
  }

  override dispose(): void {
    this.animBitmap?.dispose();
    this.animBitmap = null;
    super.dispose();
  }

  /** x/y are the logical position; the jump offset is added when drawing. */
  override sync(): void {
    const ax = this.adjustedX;
    const ay = this.adjustedY;
    this.x += ax;
    this.y += ay;
    try {
      super.sync();
    } finally {
      this.x -= ax;
      this.y -= ay;
    }
  }

  get pokemon(): Pokemon | null { return this._pokemon; }
  set pokemon(value: Pokemon | null) {
    this._pokemon = value;
    this.animBitmap?.dispose();
    this.animBitmap = null;
    if (!value) {
      this.setBitmap(null);
      this.currentFrame = 0;
      this.counter = 0;
      return;
    }
    const file = iconFilenameFromPokemon(value);
    this.animBitmap = new AnimatedBitmap(file); // Pokémon Birthsigns isn't installed: hue 0
    this.setBitmap(this.animBitmap.bitmap);
    this.srcRect.width = this.animBitmap.height;
    this.srcRect.height = this.animBitmap.height;
    this.applyIconEffects();
    this.numFrames = Math.floor(this.animBitmap.width / this.animBitmap.height);
    if (this.currentFrame >= this.numFrames) this.currentFrame = 0;
    this.changeOrigin();
  }

  /** Sprite#applyIconEffects (Essentials Deluxe + ZUD) */
  applyIconEffects(): void {
    // resetEffects -> unDynamax / unTera
    if (this.zoomX > 1) this.zoomX = 1;
    if (this.zoomY > 1) this.zoomY = 1;
    if (this._pokemon?.dynamax) {
      // applyDynamaxIcon: Settings::SHOW_DYNAMAX_SIZE (the pattern overlay isn't supported)
      if (this.bitmap && this.bitmap.height <= 64) this.zoomX = this.zoomY = 1.5;
      else this.zoomX = this.zoomY = 1;
    }
  }

  setOffset(offset: number = PictureOrigin.CENTER): void {
    this.offset = offset;
    this.changeOrigin();
  }

  changeOrigin(): void {
    if (!this.bitmap) return;
    if (this.offset == null) this.offset = PictureOrigin.TOP_LEFT;
    iconChangeOrigin(this, this.offset);
  }

  /** How long to show each frame of the icon for */
  counterLimit(): number {
    const pkmn = this._pokemon!;
    if (pkmn.fainted()) return 0; // Fainted - no animation
    // ret is initially the time a whole animation cycle lasts. It is divided by
    // the number of frames in that cycle at the end.
    let ret = Math.floor(FRAME_RATE / 4); // Green HP - 0.25 seconds
    if (pkmn.hp <= Math.floor(pkmn.totalhp / 4)) ret *= 4; // Red HP - 1 second
    else if (pkmn.hp <= Math.floor(pkmn.totalhp / 2)) ret *= 2; // Yellow HP - 0.5 seconds
    ret = Math.floor(ret / this.numFrames);
    if (ret < 1) ret = 1;
    return ret;
  }

  override update(dt?: number): void {
    if (!this.animBitmap) return;
    super.update(dt);
    this.animBitmap.update();
    assignBitmap(this, this.animBitmap.bitmap);
    // Update animation
    const cl = this.counterLimit();
    if (cl === 0) {
      this.currentFrame = 0;
    } else {
      this.counter += 1;
      if (this.counter >= cl) {
        this.currentFrame = (this.currentFrame + 1) % this.numFrames;
        this.counter = 0;
      }
    }
    this.srcRect.x = this.srcRect.width * this.currentFrame;
    // Update "jumping" animation (used in party screen)
    if (this.selected) {
      this.adjustedX = 4;
      this.adjustedY = this.currentFrame >= Math.floor(this.numFrames / 2) ? -2 : 6;
    } else {
      this.adjustedX = 0;
      this.adjustedY = 0;
    }
  }
}

//===============================================================================
// Pokémon icon (for species)
//===============================================================================
export class PokemonSpeciesIconSprite extends Sprite {
  private _species: Id;
  private _gender = 0;
  private _form = 0;
  private _shiny: ShinyParam = false;
  private _shadow = false;
  private _dmax = false;
  private _gmax = false;
  private _celestial = false;
  private animBitmap: AnimatedBitmap | null = null;
  private numFrames = 0;
  private currentFrame = 0;
  private counter = 0;
  private offset: number | null = null;

  constructor(species: Id, viewport: Viewport | null = null) {
    super(viewport);
    this._species = species;
    this.refresh();
  }

  override dispose(): void {
    this.animBitmap?.dispose();
    this.animBitmap = null;
    super.dispose();
  }

  get species(): Id { return this._species; }
  set species(value: Id) { this._species = value; this.refresh(); }
  get gender(): number { return this._gender; }
  set gender(value: number) { this._gender = value; this.refresh(); }
  get form(): number { return this._form; }
  set form(value: number) { this._form = value; this.refresh(); }
  get shiny(): ShinyParam { return this._shiny; }
  set shiny(value: ShinyParam) { this._shiny = value; this.refresh(); }
  get shadow(): boolean { return this._shadow; }
  set shadow(value: boolean) { this._shadow = value; this.refresh(); }
  get dmax(): boolean { return this._dmax; }
  set dmax(value: boolean) { this._dmax = value; this.refresh(); }
  get gmax(): boolean { return this._gmax; }
  set gmax(value: boolean) { this._gmax = value; this.refresh(); }
  get celestial(): boolean { return this._celestial; }
  set celestial(value: boolean) { this._celestial = value; this.refresh(); }

  /** pbSetParams(species, gender, form, shiny, shadow, dmax, gmax, celestial) */
  pbSetParams(species: Id, gender: number, form: number, shiny: ShinyParam = false, shadow = false, dmax = false, gmax = false, celestial = false): void {
    this._species = species;
    this._gender = gender;
    this._form = form;
    this._shiny = shiny || false;
    this._shadow = shadow || false;
    this._dmax = dmax || false;
    this._gmax = gmax || false;
    this._celestial = celestial || false;
    this.refresh();
  }

  setOffset(offset: number = PictureOrigin.CENTER): void {
    this.offset = offset;
    this.changeOrigin();
  }

  changeOrigin(): void {
    if (!this.bitmap) return;
    if (this.offset == null) this.offset = PictureOrigin.TOP_LEFT;
    iconChangeOrigin(this, this.offset);
  }

  /** How long to show each frame of the icon for */
  counterLimit(): number {
    // ret is initially the time a whole animation cycle lasts. It is divided by
    // the number of frames in that cycle at the end.
    let ret = Math.floor(FRAME_RATE / 4); // 0.25 seconds
    ret = Math.floor(ret / this.numFrames);
    if (ret < 1) ret = 1;
    return ret;
  }

  refresh(): void {
    this.animBitmap?.dispose();
    this.animBitmap = null;
    const bitmapFileName = speciesIconFilename({
      species: this._species, form: this._form, gender: this._gender, shiny: this._shiny, shadow: this._shadow,
      egg: false, dmax: this._dmax, gmax: this._gmax, celestial: this._celestial,
    });
    if (!bitmapFileName) return;
    this.animBitmap = new AnimatedBitmap(bitmapFileName);
    this.setBitmap(this.animBitmap.bitmap);
    this.srcRect.width = this.animBitmap.height;
    this.srcRect.height = this.animBitmap.height;
    this.numFrames = Math.floor(this.animBitmap.width / this.animBitmap.height);
    if (this.currentFrame >= this.numFrames) this.currentFrame = 0;
    this.changeOrigin();
  }

  override update(dt?: number): void {
    if (!this.animBitmap) return;
    super.update(dt);
    this.animBitmap.update();
    assignBitmap(this, this.animBitmap.bitmap);
    // Update animation
    this.counter += 1;
    if (this.counter >= this.counterLimit()) {
      this.currentFrame = (this.currentFrame + 1) % this.numFrames;
      this.counter = 0;
    }
    this.srcRect.x = this.srcRect.width * this.currentFrame;
  }
}
