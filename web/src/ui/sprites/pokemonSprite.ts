// Port of the Pokémon battler-sprite code used out of battle:
// - 014_Pokemon/001_Pokemon-related/003_Pokemon_Sprites.rb: PokemonSprite.
// - 010_Data/002_PBS data/009_Species_Files.rb: GameData::Species sprite,
//   footprint and cry file resolution.
// as this game's plugins replace them, in plugin load order
// (Data/PluginScripts.rxdata):
//   26 Generation 8 Pack Scripts: EBDXBitmapWrapper (sprite scaling and strip
//      animation), PokemonSprite#constrict, egg_sprite_bitmap (Sprite
//      Scaling/EBDX Wrapper*.rb).
//   29 Essentials Deluxe ([000] Essentials Patches/Species Files.rb):
//      check_graphic_file with Dynamax/Gigantamax/Celestial/super shiny
//      variants, the positional parameter lists (species_sprite_params...),
//      front/back_sprite_bitmap (EBDXBitmapWrapper, since Gen 8 is installed),
//      the PokemonSprite setters and check_cry_file. These replace Gen 8's
//      versions of the same methods, which load earlier.
//   30 ZUD Mechanics: footprint_filename(species, form, gmax) and
//      Pokemon#play_cry (Dynamax volume/pitch).
// Pokémon Birthsigns isn't installed (no celestial hue). A species'
// "alterBitmap" (Spinda's spots) runs on single-frame sprites only, as with
// Gen 8 installed (Species Files.rb:236-243); this game's Spinda sprites are
// animated strips.
//
// File existence is checked against the asset index (synchronously, as
// Ruby's pbResolveBitmap does). Bitmaps still have to be fetched: PokemonSprite
// shows nothing until its graphic has loaded, then sets it (scenes can call
// preloadSpeciesSprite first so that never shows).

import { assetExists } from "../../core/assets";
import type { Id } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { SpeciesMetrics } from "../../data/gameData/speciesMetrics";
import { pbSEPlay } from "../../game/GameSystem";
import { MultipleForms } from "../../game/pokemon/formHandlers";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, type Viewport } from "../../rgss/display";
import { Color, Rect } from "../../rgss/types";
import { FrameCounter } from "../frameTime";
import { isBitmapPreloaded, preloadBitmap, preloadBitmaps, RPGCache } from "../rpgCache";
import { PictureOrigin } from "../scenes/PictureEx";
import { checkGraphicFile, type SpeciesIconParams } from "./pokemonIcon";

export { PictureOrigin };

/** shiny parameter: false, true, or Essentials Deluxe's :super_shiny. */
export type Shininess = boolean | "super_shiny";

/** pbResolveBitmap for Pokémon graphics: the path if the file exists. */
function resolveGraphic(path: string): string | null {
  return assetExists(path) ? path : null;
}

/** pbResolveAudioSE */
function pbResolveAudioSE(file: string): string | null {
  return assetExists(`Audio/SE/${file}`) ? file : null;
}

//===============================================================================
// Species parameter hashes (Essentials Deluxe)
//===============================================================================
export interface SpriteParams {
  species: Id | null;
  form: number;
  gender: number;
  shiny: Shininess;
  shadow: boolean;
  back: boolean;
  egg: boolean;
  dmax: boolean;
  gmax: boolean;
  celestial: boolean;
}

/** species_sprite_params(species, form, gender, shiny, shadow, back, egg, dmax, gmax, celestial) */
export function speciesSpriteParams(...params: unknown[]): SpriteParams {
  return {
    species: (params[0] as Id) || null,
    form: (params[1] as number) || 0,
    gender: (params[2] as number) || 0,
    shiny: (params[3] as Shininess) || false,
    shadow: (params[4] as boolean) || false,
    back: (params[5] as boolean) || false,
    egg: (params[6] as boolean) || false,
    dmax: (params[7] as boolean) || false,
    gmax: (params[8] as boolean) || false,
    celestial: (params[9] as boolean) || false,
  };
}

/** species_sprite_params2: gender before form (PokemonSprite#setSpeciesBitmap's order). */
export function speciesSpriteParams2(...params: unknown[]): SpriteParams {
  return speciesSpriteParams(params[0], params[2], params[1], ...params.slice(3));
}

/** species_icon_params(species, form, gender, shiny, shadow, egg, dmax, gmax, celestial) */
export function speciesIconParams(...params: unknown[]): Omit<SpriteParams, "back"> {
  return {
    species: (params[0] as Id) || null,
    form: (params[1] as number) || 0,
    gender: (params[2] as number) || 0,
    shiny: (params[3] as Shininess) || false,
    shadow: (params[4] as boolean) || false,
    egg: (params[5] as boolean) || false,
    dmax: (params[6] as boolean) || false,
    gmax: (params[7] as boolean) || false,
    celestial: (params[8] as boolean) || false,
  };
}

interface CryParams {
  species: Id | null;
  form: number;
  suffix: string;
  shiny: Shininess;
  shadow: boolean;
  dmax: boolean;
  gmax: boolean;
  celestial: boolean;
}

/** species_cry_params(species, form, suffix, shiny, shadow, dmax, gmax, celestial) */
function speciesCryParams(...params: unknown[]): CryParams {
  return {
    species: (params[0] as Id) || null,
    form: (params[1] as number) || 0,
    suffix: (params[2] as string) || "",
    shiny: (params[3] as Shininess) || false,
    shadow: (params[4] as boolean) || false,
    dmax: (params[5] as boolean) || false,
    gmax: (params[6] as boolean) || false,
    celestial: (params[7] as boolean) || false,
  };
}

//===============================================================================
// GameData::Species file names
//===============================================================================
type GraphicParams = Pick<SpriteParams, "species" | "form" | "gender" | "shiny" | "shadow" | "dmax" | "gmax" | "celestial">;

export const SpeciesFiles = {
  /** check_graphic_file(path, params, subfolder) — Essentials Deluxe's. */
  checkGraphicFile(path: string, params: GraphicParams, subfolder = ""): string | null {
    // Same port of Deluxe's check_graphic_file as the icons use, resolved against the asset index.
    return checkGraphicFile(path, params as SpeciesIconParams, subfolder, resolveGraphic);
  },

  /** check_egg_graphic_file(path, species, form, suffix) */
  checkEggGraphicFile(path: string, species: Id, form: number, suffix = ""): string | null {
    const speciesData = Species.getSpeciesForm(species, form);
    if (!speciesData) return null;
    if (form > 0) {
      const ret = resolveGraphic(`${path}${speciesData.species}_${form}${suffix}`);
      if (ret) return ret;
    }
    return resolveGraphic(`${path}${speciesData.species}${suffix}`);
  },

  /** front_sprite_filename(species, form, gender, shiny, shadow, back, egg, dmax, gmax, celestial) */
  frontSpriteFilename(...params: unknown[]): string | null {
    return SpeciesFiles.checkGraphicFile("Graphics/Pokemon/", speciesSpriteParams(...params), "Front");
  },

  backSpriteFilename(...params: unknown[]): string | null {
    return SpeciesFiles.checkGraphicFile("Graphics/Pokemon/", speciesSpriteParams(...params), "Back");
  },

  eggSpriteFilename(species: Id, form: number): string | null {
    const ret = SpeciesFiles.checkEggGraphicFile("Graphics/Pokemon/Eggs/", species, form);
    return ret ?? resolveGraphic("Graphics/Pokemon/Eggs/000");
  },

  spriteFilename(...params: unknown[]): string | null {
    const data = speciesSpriteParams(...params);
    if (data.egg) return SpeciesFiles.eggSpriteFilename(data.species!, data.form);
    if (data.back) return SpeciesFiles.backSpriteFilename(...params);
    return SpeciesFiles.frontSpriteFilename(...params);
  },

  eggIconFilename(species: Id, form: number): string | null {
    const ret = SpeciesFiles.checkEggGraphicFile("Graphics/Pokemon/Eggs/", species, form, "_icon");
    return ret ?? resolveGraphic("Graphics/Pokemon/Eggs/000_icon");
  },

  /** icon_filename(species, form, gender, shiny, shadow, egg, dmax, gmax, celestial) */
  iconFilename(...params: unknown[]): string | null {
    const p = speciesIconParams(...params);
    if (p.egg) return SpeciesFiles.eggIconFilename(p.species!, p.form);
    return SpeciesFiles.checkGraphicFile("Graphics/Pokemon/", p, "Icons");
  },

  iconFilenameFromPokemon(pkmn: Pokemon): string | null {
    const shiny: Shininess = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
    return SpeciesFiles.iconFilename(pkmn.species, pkmn.form, pkmn.gender, shiny, pkmn.shadowPokemon(), pkmn.egg(),
      pkmn.dynamax, pkmn.gmax, pkmn.celestial());
  },

  /** footprint_filename(species, form, gmax) — ZUD's (it appends the form name to the base path, so form footprints never resolve; kept). */
  footprintFilename(species: Id, form = 0, gmax = false): string | null {
    const speciesData = Species.getSpeciesForm(species, form);
    if (!speciesData) return null;
    const gmaxFile = gmax ? "Gigantamax/" : "";
    let path = "Graphics/Pokemon/Footprints/" + gmaxFile;
    path += `${speciesData.species}`;
    let ret = resolveGraphic(path);
    if (form > 0) {
      path += `${speciesData.species}_${form}`;
      const newRet = resolveGraphic(path);
      if (newRet) ret = newRet;
    }
    return ret;
  },

  //-----------------------------------------------------------------------------
  // Cries (Essentials Deluxe's check_cry_file)
  //-----------------------------------------------------------------------------
  checkCryFile(...params: unknown[]): string | null {
    const p = speciesCryParams(...params);
    const speciesData = Species.getSpeciesForm(p.species, p.form);
    if (!speciesData) return null;
    const baseFile = `${speciesData.species}` + p.suffix;
    const formFile = `${speciesData.species}` + `_${p.form}` + p.suffix;
    const file = p.form > 0 ? formFile : baseFile;
    const baseFolder = "Cries/";
    const tryFolder = (sub: string): string | null => {
      const folder = baseFolder + sub;
      const cry = folder + file;
      const backup = folder + baseFile;
      if (pbResolveAudioSE(cry)) return cry;
      if (pbResolveAudioSE(backup)) return backup;
      return null;
    };
    if (p.gmax) {
      const r = tryFolder("Gigantamax/");
      if (r) return r;
    }
    if (p.dmax) {
      const r = tryFolder("Dynamax/");
      if (r) return r;
    }
    if (p.celestial) {
      const r = tryFolder("Celestial/");
      if (r) return r;
    }
    if (p.shadow) {
      const r = tryFolder("Shadow/");
      if (r) return r;
    }
    if (p.shiny) {
      if (p.shiny === "super_shiny") {
        const cry = baseFolder + "Super shiny/" + file;
        if (pbResolveAudioSE(cry)) return cry;
      }
      const r = tryFolder("Shiny/");
      if (r) return r;
    }
    const cry = baseFolder + file;
    const backup = baseFolder + baseFile;
    if (pbResolveAudioSE(cry)) return cry;
    return pbResolveAudioSE(backup) ? backup : null;
  },

  cryFilename(...params: unknown[]): string | null {
    return SpeciesFiles.checkCryFile(...params);
  },

  cryFilenameFromPokemon(pkmn: Pokemon, suffix = ""): string | null {
    const shiny: Shininess = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
    return SpeciesFiles.checkCryFile(pkmn.species, pkmn.form, suffix, shiny, pkmn.shadowPokemon(), pkmn.dynamax, pkmn.gmax, pkmn.celestial());
  },

  /** play_cry_from_species(species, form, volume, pitch) */
  playCryFromSpecies(species: Id, form = 0, volume = 90, pitch = 100): void {
    const filename = SpeciesFiles.cryFilename(species, form);
    if (!filename) return;
    pbSEPlay(filename, volume, pitch);
  },

  /** play_cry_from_pokemon(pkmn, volume, pitch) */
  playCryFromPokemon(pkmn: Pokemon, volume = 90, pitch: number | null = 100): void {
    if (!pkmn || pkmn.egg()) return;
    const filename = SpeciesFiles.cryFilenameFromPokemon(pkmn);
    if (!filename) return;
    pbSEPlay(filename, volume, pitch ?? 100);
  },

  /** Pokemon#play_cry as ZUD Mechanics overrides it (Dynamax cries are louder, or lower-pitched without a file). */
  playPokemonCry(pkmn: Pokemon, volume = 90, pitch: number | null = null): void {
    if (pkmn.dynamax) {
      volume = 100;
      const sub = pkmn.gmax ? "Gigantamax" : "Dynamax";
      const sd = pkmn.speciesData();
      if (!pbResolveAudioSE(`Cries/${sub}/${sd.id}`) && !pbResolveAudioSE(`Cries/${sub}/${sd.species}`)) pitch = 60;
    }
    SpeciesFiles.playCryFromPokemon(pkmn, volume, pitch);
  },
};

//===============================================================================
// EBDXBitmapWrapper (Generation 8 Pack: Sprite Scaling/EBDX Wrapper.rb)
//===============================================================================
/**
 * Animated bitmap made from a sprite strip (frames as wide as the strip is
 * tall) or a single image, scaled up by `scale`. The source must be preloaded.
 * Frames are scaled lazily from the cached strip, which draws the same pixels
 * as building every frame up front.
 */
export class EBDXBitmapWrapper {
  width = 0;
  height = 0;
  totalFrames = 0;
  frameIdx = 0;
  constrict: number | null = null;
  constrictX: number | null = null;
  constrictY: number | null = null;
  scale: number;
  frameSkip: number;
  private frame = 0;
  private frames = 2;
  private direction = 1;
  private speed = 2;
  private bmpFile: string;
  /** Source rectangles of each frame in the strip. */
  private sources: Rect[] = [];
  private source: Bitmap | null = null;
  private frameCache = new Map<number, Bitmap>();
  private tempBmp: Bitmap | null = null;
  private drawnKey = "";
  private disposedFlag = false;
  private clock = new FrameCounter(false);

  constructor(file: string, scale: number = Settings.FRONT_BATTLER_SPRITE_SCALE, skip = 1) {
    if (file == null) throw new Error("EBDXBitmapWrapper filename is nil.");
    this.scale = scale;
    this.frameSkip = skip;
    this.bmpFile = file;
    this.refresh();
  }

  /** Graphics.frame_rate / 40.0 (40 fps in this game: SMOOTH_FRAMERATE is false). */
  get delta(): number { return 1; }
  get length(): number { return this.totalFrames; }
  isDisposed(): boolean { return this.disposedFlag; }

  dispose(): void {
    for (const b of this.frameCache.values()) b.dispose();
    this.frameCache.clear();
    this.tempBmp?.dispose();
    this.tempBmp = null;
    this.disposedFlag = true;
  }

  private frameBitmap(i: number): Bitmap {
    let bmp = this.frameCache.get(i);
    if (!bmp) {
      bmp = new Bitmap(this.width, this.height);
      if (this.source) bmp.stretchBlt(new Rect(0, 0, this.width, this.height), this.source, this.sources[i]!);
      this.frameCache.set(i, bmp);
    }
    return bmp;
  }

  /** The current frame, cropped to the constraint box. */
  get bitmap(): Bitmap | null {
    if (this.disposedFlag || !this.tempBmp) return null;
    const [x, y, w, h] = this.box();
    const key = `${this.frameIdx},${x},${y},${w},${h}`;
    if (key !== this.drawnKey) {
      this.tempBmp.clear();
      this.tempBmp.blt(x, y, this.frameBitmap(this.frameIdx), new Rect(x, y, w, h));
      this.drawnKey = key;
    }
    return this.tempBmp;
  }

  copy(): Bitmap { return this.frameBitmap(this.frameIdx).clone(); }

  /**
   * prepare_strip, alter_bitmap(i) for each frame, compile_strip: `alter`
   * changes every scaled frame in place.
   */
  alterFrames(alter: (bitmap: Bitmap) => void): void {
    for (let i = 0; i < this.totalFrames; i++) alter(this.frameBitmap(i));
    this.drawnKey = "";
  }

  refresh(): void {
    this.dispose();
    this.disposedFlag = false;
    this.drawnKey = "";
    const fBmp = RPGCache.loadBitmap(this.bmpFile);
    this.source = fBmp;
    this.sources = [];
    if (!fBmp) throw new Error(`Unable to construct proper bitmap sheet from \`${this.bmpFile}\``);
    if (fBmp.width > fBmp.height * 2) {
      this.width = fBmp.height * this.scale;
      this.height = fBmp.height * this.scale;
      const n = Math.ceil(fBmp.width / fBmp.height);
      for (let i = 0; i < n; i++) this.sources.push(new Rect(i * fBmp.height, 0, fBmp.height, fBmp.height));
    } else {
      this.width = fBmp.width * this.scale;
      this.height = fBmp.height * this.scale;
      this.sources.push(new Rect(0, 0, fBmp.width, fBmp.height));
    }
    this.totalFrames = this.sources.length;
    this.tempBmp = new Bitmap(this.width, this.width);
  }

  setSpeed(value: number): void { this.speed = value; }
  reverse(): void { this.direction = this.direction > 0 ? -1 : 1; }

  toFrame(frame: number | string): void {
    if (typeof frame === "string") frame = frame === "last" ? this.totalFrames - 1 : 0;
    if (frame >= this.totalFrames) frame = this.totalFrames - 1;
    if (frame < 0) frame = 0;
    this.frameIdx = frame;
  }

  play(): void {
    if (this.finished()) return;
    this.update();
  }

  deanimate(): void {
    this.frame = 0;
    this.frameIdx = 0;
  }

  finished(): boolean { return this.frameIdx >= this.totalFrames - 1; }

  /** The constraint box: [x, y, w, h]. */
  box(): [number, number, number, number] {
    const cX = this.constrictX ?? this.constrict ?? this.width;
    const x = cX < this.width ? Math.ceil((this.width - cX) / 2.0) : 0;
    const w = cX < this.width ? cX : this.width;
    const cY = this.constrictY ?? this.constrict ?? this.height;
    const y = cY < this.height ? Math.ceil((this.height - cY) / 2.0) : 0;
    const h = cY < this.height ? cY : this.height;
    return [x, y, w, h];
  }

  /** Advances the animation; counts the original 40 fps frames. */
  update(): void {
    const n = this.clock.tick();
    if (this.disposedFlag || this.speed < 1) return;
    for (let k = 0; k < n; k++) {
      this.frames = this.speed === 2 ? 4 : this.speed === 3 ? 5 : 2;
      this.frame += 1;
      if (this.frame < this.frames * this.frameSkip * this.delta) continue;
      this.frameIdx += this.direction;
      if (this.frameIdx >= this.totalFrames) this.frameIdx = 0;
      if (this.frameIdx < 0) this.frameIdx = this.totalFrames - 1;
      this.frame = 0;
    }
  }
}

/** [file, scale] of the bitmap for a sprite request, or null. */
export type BitmapRequest = { file: string; scale: number } | null;

/** pokemon_sprite_bitmap's MultipleForms "alterBitmap" for a (non-egg) Pokémon, bound to it. */
function alterBitmapFor(pkmn: Pokemon | null, species: Id | null): ((bitmap: Bitmap) => void) | null {
  if (!pkmn || pkmn.egg()) return null;
  const fn = MultipleForms.getFunction(Species.get(species ?? pkmn.species).species, "alterBitmap");
  return fn ? (bitmap: Bitmap) => fn(pkmn, bitmap) : null;
}

/** front_sprite_bitmap / back_sprite_bitmap / egg_sprite_bitmap: which file at which scale. */
export function spriteBitmapRequest(data: SpriteParams): BitmapRequest {
  // A nil species looks up "" and then falls back to the "000" graphic, as in Ruby.
  if (data.egg) {
    if (!data.species) return null;
    // Generation 8 Pack's egg_sprite_bitmap (front scale).
    const file = SpeciesFiles.eggSpriteFilename(data.species, data.form);
    const spData = SpeciesMetrics.getSpeciesForm(data.species, data.form);
    return file ? { file, scale: spData ? spData.frontSpriteScale : Settings.FRONT_BATTLER_SPRITE_SCALE } : null;
  }
  const args = [data.species, data.form, data.gender, data.shiny, data.shadow, data.back, data.egg, data.dmax, data.gmax, data.celestial];
  const file = data.back ? SpeciesFiles.backSpriteFilename(...args) : SpeciesFiles.frontSpriteFilename(...args);
  if (!file) return null;
  const spData = SpeciesMetrics.getSpeciesForm(data.species, data.form);
  const scale = data.back
    ? (spData ? spData.backSpriteScale : Settings.BACK_BATTLER_SPRITE_SCALE)
    : (spData ? spData.frontSpriteScale : Settings.FRONT_BATTLER_SPRITE_SCALE);
  return { file, scale };
}

export function pokemonBitmapRequest(pkmn: Pokemon, back = false, species: Id | null = null, setDmax: "none" | "dmax" | "gmax" | null = null): BitmapRequest {
  const sp = Species.get(species ?? pkmn.species).species;
  if (pkmn.egg()) return spriteBitmapRequest(speciesSpriteParams(sp, pkmn.form, 0, false, false, false, true));
  let dmax: boolean;
  let gmax: boolean;
  switch (setDmax) {
    case "none": dmax = gmax = false; break;
    case "dmax": dmax = true; gmax = false; break;
    case "gmax": dmax = true; gmax = true; break;
    default: dmax = pkmn.dynamax; gmax = pkmn.gmax;
  }
  const shiny: Shininess = pkmn.superShiny ? "super_shiny" : pkmn.shiny;
  return spriteBitmapRequest(speciesSpriteParams(sp, pkmn.form, pkmn.gender, shiny, pkmn.shadowPokemon(), back, pkmn.egg(), dmax, gmax, pkmn.celestial()));
}

/** Fetches the graphic setSpeciesBitmap(...params) would show (PokemonSprite's parameter order). */
export async function preloadSpeciesSprite(...params: unknown[]): Promise<void> {
  const req = spriteBitmapRequest(speciesSpriteParams2(...params));
  if (req) await preloadBitmap(req.file);
}

/** Fetches the graphic setPokemonBitmap(pkmn, back) would show. */
export async function preloadPokemonSprite(pkmn: Pokemon, back = false): Promise<void> {
  const req = pokemonBitmapRequest(pkmn, back);
  if (req) await preloadBitmap(req.file);
}

/** Fetches the files from SpeciesFiles that a scene draws directly (icons, footprints). */
export async function preloadSpeciesFiles(files: (string | null | undefined)[]): Promise<void> {
  await preloadBitmaps(files.filter((f): f is string => !!f));
}

//===============================================================================
// Pokémon sprite (used out of battle)
//===============================================================================
export class PokemonSprite extends Sprite {
  private _iconbitmap: EBDXBitmapWrapper | null = null;
  private offset: number | null = null;
  /** The latest bitmap request; a load that finishes after a newer request is dropped. */
  private request = 0;
  /** constrict() calls made while the bitmap was loading. */
  private pendingConstrict: { amt: number | number[]; deanimate: boolean } | null = null;

  constructor(viewport: Viewport | null = null) {
    super(viewport);
  }

  override dispose(): void {
    this._iconbitmap?.dispose();
    this._iconbitmap = null;
    this.request++;
    if (!this.isDisposed()) this.setBitmap(null);
    super.dispose();
  }

  clearBitmap(): void {
    this._iconbitmap?.dispose();
    this._iconbitmap = null;
    this.request++;
    this.setBitmap(null);
  }

  setOffset(offset: number = PictureOrigin.CENTER): void {
    this.offset = offset;
    this.changeOrigin();
  }

  changeOrigin(): void {
    if (!this.bitmap) return;
    if (this.offset == null) this.offset = PictureOrigin.CENTER;
    switch (this.offset) {
      case PictureOrigin.TOP_LEFT: case PictureOrigin.LEFT: case PictureOrigin.BOTTOM_LEFT:
        this.ox = 0;
        break;
      case PictureOrigin.TOP: case PictureOrigin.CENTER: case PictureOrigin.BOTTOM:
        this.ox = Math.floor(this.bitmap.width / 2);
        break;
      case PictureOrigin.TOP_RIGHT: case PictureOrigin.RIGHT: case PictureOrigin.BOTTOM_RIGHT:
        this.ox = this.bitmap.width;
        break;
    }
    switch (this.offset) {
      case PictureOrigin.TOP_LEFT: case PictureOrigin.TOP: case PictureOrigin.TOP_RIGHT:
        this.oy = 0;
        break;
      case PictureOrigin.LEFT: case PictureOrigin.CENTER: case PictureOrigin.RIGHT:
        this.oy = Math.floor(this.bitmap.height / 2);
        break;
      case PictureOrigin.BOTTOM_LEFT: case PictureOrigin.BOTTOM: case PictureOrigin.BOTTOM_RIGHT:
        this.oy = this.bitmap.height;
        break;
    }
  }

  /** Builds the wrapper for `req` now if its graphic is loaded, else once it has loaded. */
  private applyRequest(req: BitmapRequest, after?: () => void, alter?: ((bitmap: Bitmap) => void) | null): void {
    this._iconbitmap?.dispose();
    this._iconbitmap = null;
    const token = ++this.request;
    this.pendingConstrict = null;
    const apply = () => {
      if (token !== this.request || this.isDisposed()) return;
      this._iconbitmap = req ? new EBDXBitmapWrapper(req.file, req.scale) : null;
      if (alter && this._iconbitmap?.totalFrames === 1) this._iconbitmap.alterFrames(alter);
      this.setBitmap(this._iconbitmap ? this._iconbitmap.bitmap : null);
      after?.();
      this.changeOrigin();
      const pc = this.pendingConstrict;
      this.pendingConstrict = null;
      if (pc) this.constrict(pc.amt, pc.deanimate);
    };
    if (!req || isBitmapPreloaded(req.file)) {
      apply();
    } else {
      this.setBitmap(null);
      void preloadBitmap(req.file).then(apply);
    }
  }

  /** setPokemonBitmap(pokemon, back = false, species = nil, setDmax = nil) — Essentials Deluxe's. */
  setPokemonBitmap(pokemon: Pokemon | null, back = false, species: Id | null = null, setDmax: "none" | "dmax" | "gmax" | null = null): void {
    this.applyRequest(pokemon ? pokemonBitmapRequest(pokemon, back, species, setDmax) : null, () => {
      this.color = new Color(0, 0, 0, 0);
      // applyEffects(pokemon): Dynamax/Tera sprite effects are battle-only (no-ops here).
    }, alterBitmapFor(pokemon, species));
  }

  setPokemonBitmapSpecies(pokemon: Pokemon | null, species: Id, back = false): void {
    this.applyRequest(pokemon ? pokemonBitmapRequest(pokemon, back, species) : null, undefined, alterBitmapFor(pokemon, species));
  }

  /** setSpeciesBitmap(species, gender, form, shiny, shadow, back, egg, dmax, gmax, celestial) — Essentials Deluxe's. */
  setSpeciesBitmap(...params: unknown[]): void {
    this.applyRequest(spriteBitmapRequest(speciesSpriteParams2(...params)));
  }

  /** Generation 8 Pack: crops the sprite to a box (amt or [w, h]); optionally stops the animation. */
  constrict(amt: number | number[], deanimate = false): void {
    const b = this._iconbitmap;
    if (!b) {
      if (this.request > 0) this.pendingConstrict = { amt, deanimate };
      return;
    }
    if (Array.isArray(amt)) {
      b.constrictX = amt[0]!;
      b.constrictY = amt[1]!;
      b.constrict = Math.max(...amt);
    } else {
      b.constrict = amt;
    }
    if (deanimate) {
      b.setSpeed(0);
      b.deanimate();
    }
    this.update();
  }

  override update(dt?: number): void {
    super.update(dt);
    if (this._iconbitmap) {
      this._iconbitmap.update();
      const bmp = this._iconbitmap.bitmap;
      if (bmp !== this.bitmap) this.setBitmap(bmp);
    }
  }
}
