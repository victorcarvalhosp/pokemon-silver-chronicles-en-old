// Port of the rest of Plugins/Essentials Deluxe/[000] Essentials Patches/
// Species Overworlds.rb: species_overworld_params, GameData::Species.
// overworld_filename / overworld_bitmap(_from_pokemon), and the animated
// overworld-sprite classes PokemonOverworldSprite (for a Pokémon, like
// PokemonIconSprite) and PokemonSpeciesOverworldSprite (for a species).
// (overworld_filename_from_pokemon and FollowingPkmn.change_sprite are in
// game/following/FollowingPkmn.ts, ow_sprite_filename in
// game/daycare/DayCareOverworld.ts.) Nothing in this game's scripts creates
// these sprites; they're here so scripts and screens can.
//
// Frame counting follows pokemonIcon.ts: update() runs every 60 Hz tick, so
// Graphics.frame_rate is FRAME_RATE.

import { assetExists } from "../../core/assets";
import type { Id } from "../../data/gameData/gameData";
import { FRAME_RATE } from "../../game/GameCharacter";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { Sprite, type Viewport } from "../../rgss/display";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { PictureOrigin } from "../scenes/PictureEx";
import { checkGraphicFile, type ShinyParam } from "./pokemonIcon";

export interface OverworldParams {
  species: Id | null; form: number; gender: number; shiny: ShinyParam; shadow: boolean; celestial: boolean;
}

/** species_overworld_params(*params) */
export function speciesOverworldParams(species: Id | null = null, form: number | null = null, gender: number | null = null,
                                       shiny: ShinyParam | null = null, shadow: boolean | null = null,
                                       celestial: boolean | null = null): OverworldParams {
  return {
    species: species || null,
    form: form || 0,
    gender: gender || 0,
    shiny: shiny || false,
    shadow: shadow || false,
    celestial: celestial || false,
  };
}

/** pbResolveBitmap for character sheets (".png", then ".gif"). */
function resolveCharacterFile(path: string): string | null {
  for (const ext of [".png", ".gif"]) if (assetExists(path + ext)) return path + ext;
  return null;
}

/** GameData::Species.overworld_filename(*params) */
export function overworldFilename(...params: Parameters<typeof speciesOverworldParams>): string {
  const p = speciesOverworldParams(...params);
  return checkGraphicFile("Graphics/Characters/", { ...p, species: p.species as Id }, "Followers", resolveCharacterFile) ?? "Graphics/Characters/Followers/";
}

/** GameData::Species.overworld_filename_from_pokemon */
function overworldFilenameFromPokemon(pkmn: Pokemon): string {
  const shiny: ShinyParam = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
  return overworldFilename(pkmn.species, pkmn.form, pkmn.gender, shiny, pkmn.shadowPokemon(), pkmn.celestial());
}

/** GameData::Species.overworld_bitmap(*params) (Pokémon Birthsigns isn't installed: hue 0). */
export function overworldBitmap(...params: Parameters<typeof speciesOverworldParams>) {
  const filename = overworldFilename(...params);
  return filename ? new AnimatedBitmap(filename, 0).deanimate() : null;
}

/** GameData::Species.overworld_bitmap_from_pokemon */
export function overworldBitmapFromPokemon(pkmn: Pokemon) {
  const shiny: ShinyParam = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
  return overworldBitmap(pkmn.species, pkmn.form, pkmn.gender, shiny, pkmn.shadowPokemon(), pkmn.celestial());
}

/** changeOrigin as these classes define it (CENTER is the middle of the frame). */
function changeOriginOf(sprite: Sprite, offset: number): void {
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
      sprite.oy = Math.floor(sprite.srcRect.height / 2); break;
    case PictureOrigin.BOTTOM_LEFT: case PictureOrigin.BOTTOM: case PictureOrigin.BOTTOM_RIGHT:
      sprite.oy = sprite.srcRect.height; break;
  }
}

/** RGSS skips the src_rect reset when the same bitmap is assigned again. */
function assignBitmap(sprite: Sprite, anim: AnimatedBitmap): void {
  if (sprite.bitmap !== anim.bitmap) sprite.setBitmap(anim.bitmap);
}

//-------------------------------------------------------------------------------
// Pokémon overworld sprite (for defined Pokémon)
//-------------------------------------------------------------------------------
export class PokemonOverworldSprite extends Sprite {
  selected = false;
  active = false;
  private _pokemon: Pokemon | null = null;
  private animBitmap: AnimatedBitmap | null = null;
  private numFrames = 0;
  private currentFrame = 0;
  private counter = 0;
  private direction = 0;
  private offset: number | null = null;
  /** x/y stay the logical position; the "jumping" offset is added when drawing. */
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

  setPokemon(value: Pokemon | null, dir = 0): void {
    this.direction = dir;
    this.pokemon = value;
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
    this.animBitmap = new AnimatedBitmap(overworldFilenameFromPokemon(value));
    this.setBitmap(this.animBitmap.bitmap);
    this.srcRect.width = Math.floor(this.animBitmap.width / 4);
    this.srcRect.height = Math.floor(this.animBitmap.height / 4);
    this.srcRect.y = this.srcRect.height * this.direction;
    this.numFrames = 4;
    if (this.currentFrame >= this.numFrames) this.currentFrame = 0;
    this.changeOrigin();
  }

  setOffset(offset: number = PictureOrigin.CENTER): void {
    this.offset = offset;
    this.changeOrigin();
  }

  changeOrigin(): void {
    if (!this.bitmap) return;
    if (this.offset == null) this.offset = PictureOrigin.TOP_LEFT;
    changeOriginOf(this, this.offset);
  }

  counterLimit(): number {
    const pkmn = this._pokemon!;
    if (pkmn.fainted()) return 0;
    let ret = Math.floor(FRAME_RATE / 2);
    if (pkmn.hp <= Math.floor(pkmn.totalhp / 4)) ret *= 4;
    else if (pkmn.hp <= Math.floor(pkmn.totalhp / 2)) ret *= 2;
    ret = Math.floor(ret / this.numFrames);
    if (ret < 1) ret = 1;
    return ret;
  }

  override update(dt?: number): void {
    if (!this.animBitmap) return;
    super.update(dt);
    this.animBitmap.update();
    assignBitmap(this, this.animBitmap);
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
    if (this.selected) {
      this.adjustedX = 4;
      this.adjustedY = this.currentFrame >= Math.floor(this.numFrames / 2) ? -2 : 6;
    } else {
      this.adjustedX = 0;
      this.adjustedY = 0;
    }
  }
}

//-------------------------------------------------------------------------------
// Pokémon overworld sprite (for species)
//-------------------------------------------------------------------------------
export class PokemonSpeciesOverworldSprite extends Sprite {
  private _species: Id | null;
  private _gender = 0;
  private _form = 0;
  private _shiny: ShinyParam = false;
  private _shadow = false;
  private _celestial = false;
  private animBitmap: AnimatedBitmap | null = null;
  private numFrames = 0;
  private currentFrame = 0;
  private counter = 0;
  private _direction = 0;
  private offset: number | null = null;

  constructor(species: Id | null, viewport: Viewport | null = null) {
    super(viewport);
    this._species = species;
    this.refresh();
  }

  override dispose(): void {
    this.animBitmap?.dispose();
    this.animBitmap = null;
    super.dispose();
  }

  get species(): Id | null { return this._species; }
  set species(value: Id | null) { this._species = value; this.refresh(); }
  get gender(): number { return this._gender; }
  set gender(value: number) { this._gender = value; this.refresh(); }
  get form(): number { return this._form; }
  set form(value: number) { this._form = value; this.refresh(); }
  get shiny(): ShinyParam { return this._shiny; }
  set shiny(value: ShinyParam) { this._shiny = value; this.refresh(); }
  get shadow(): boolean { return this._shadow; }
  set shadow(value: boolean) { this._shadow = value; this.refresh(); }
  get celestial(): boolean { return this._celestial; }
  set celestial(value: boolean) { this._celestial = value; this.refresh(); }
  set direction(value: number) { this._direction = value; this.refresh(); }

  pbSetParams(species: Id | null, gender: number, form: number, shiny: ShinyParam | null = null,
              shadow: boolean | null = null, celestial: boolean | null = null): void {
    this._species = species;
    this._gender = gender;
    this._form = form;
    this._shiny = shiny || false;
    this._shadow = shadow || false;
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
    changeOriginOf(this, this.offset);
  }

  counterLimit(): number {
    let ret = Math.floor(FRAME_RATE / 2);
    ret = Math.floor(ret / this.numFrames);
    if (ret < 1) ret = 1;
    return ret;
  }

  refresh(): void {
    this.animBitmap?.dispose();
    this.animBitmap = null;
    const bitmapFileName = overworldFilename(this._species, this._form, this._gender, this._shiny, this._shadow, this._celestial);
    if (!bitmapFileName) return;
    this.animBitmap = new AnimatedBitmap(bitmapFileName);
    this.setBitmap(this.animBitmap.bitmap);
    this.srcRect.width = Math.floor(this.animBitmap.width / 4);
    this.srcRect.height = Math.floor(this.animBitmap.height / 4);
    this.srcRect.y = this.srcRect.height * this._direction;
    this.numFrames = 4;
    if (this.currentFrame >= this.numFrames) this.currentFrame = 0;
    this.changeOrigin();
  }

  override update(dt?: number): void {
    if (!this.animBitmap) return;
    super.update(dt);
    this.animBitmap.update();
    assignBitmap(this, this.animBitmap);
    this.counter += 1;
    if (this.counter >= this.counterLimit()) {
      this.currentFrame = (this.currentFrame + 1) % this.numFrames;
      this.counter = 0;
    }
    this.srcRect.x = this.srcRect.width * this.currentFrame;
  }
}
