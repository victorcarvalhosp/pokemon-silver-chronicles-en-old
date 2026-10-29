// Port of 016_UI/004_UI_Pokedex_Entry.rb (PokemonPokedexInfo_Scene,
// PokemonPokedexInfoScreen) with this game's plugin patches, in load order:
//   26 Generation 8 Pack: Footprint Replcement.rb's drawPageInfo (the
//      species icon instead of the footprint: DEX_SHOWS_FOOTPRINTS is false)
//      and the sprite boxes in pbUpdateDummyPokemon (EBDX Wrapper
//      Compatibility.rb) — both superseded below, keeping their behaviour.
//   29 Essentials Deluxe (Pokedex.rb): pbUpdateDummyPokemon, pbGetAvailableForms,
//      pbChooseForm, drawPageForms with shiny/super shiny/Shadow forms.
//   30 ZUD Mechanics (UI_Pokedex.rb): Gigantamax forms (pbAddGmaxForms) and
//      its drawPageInfo (G-Max height/entry), which replaces Gen 8's.
//   34 Enhanced UI: drawPageInfo also draws egg groups and the body shape.
// This game's 004 adds debug Console.echoln_li calls to pbGetEncounterPoints
// (left out); one of them reads mappos[0], which would raise for an encounter
// map without a Town Map position, so such maps are skipped here.

import { assetExists } from "../../core/assets";
import type { Id } from "../../data/gameData/gameData";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { pbGetRegionalNumber, pbLoadTownMapData } from "../../data/gameData/miscPBSData";
import { PowerMove } from "../../data/gameData/powerMove";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { SpeciesMetrics } from "../../data/gameData/speciesMetrics";
import { Type } from "../../data/gameData/type";
import { Encounter } from "../../data/gameData/encounter";
import type { EncounterSlot, TownMapRegion } from "../../data/pbs/types";
import { G } from "../../game/globals";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE, pbSEStop } from "../../game/GameSystem";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { drawTextEx, pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { originalFrameCount } from "../frameTime";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { preloadBitmaps, RPGCache } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { PictureOrigin, PokemonSprite, preloadSpeciesFiles, preloadSpeciesSprite, SpeciesFiles, type Shininess } from "../sprites/pokemonSprite";
import { AnimatedSprite, BitmapSprite, IconSprite } from "../SpriteWrapper";
import { REGION_MAP_EXTRAS, PokemonRegionMap_Scene, currentMapMetadata } from "../pokegear/regionMap";
import { DEXES_WITH_OFFSETS, dexGlobals, pad3, player, userInUS } from "./dexCommon";
import { enhancedUIGraphics, EnhancedUISettings, pbDisplayBodyShape, pbDisplayEggGroups } from "./enhancedUI";
import type { DexEntry } from "./pokedexMain";
import { PokemonSpeciesIconSprite } from "../sprites/pokemonIcon";

const DEX = "Graphics/Pictures/Pokedex/";

/** [form name, gender, form, shiny, special] */
type AvailableForm = [string, number, number, number, number];

/** sprintf/_ISPRINTF("%.1f") */
const f1 = (n: number) => n.toFixed(1);

/** GameData::Species#bitmap_exists?(subfolder, female, shiny, special) — Essentials Deluxe's. */
function bitmapExists(sp: Species, subfolder: string, female = false, shiny = 0, special = 0): boolean {
  let path = subfolder === "Followers" ? "Graphics/Characters/" : "Graphics/Pokemon/";
  path += subfolder;
  path += shiny === 2 ? " super shiny/" : shiny === 1 ? " shiny/" : "/";
  if (special === 2) path += "Gigantamax/";
  path += sp.species;
  if (sp.form > 0) path += "_" + sp.form;
  if (female) path += "_female";
  if (special === 1) path += "_shadow";
  if (special === 3) path += "_celestial";
  return assetExists(path);
}

export class PokemonPokedexInfo_Scene {
  private viewport!: Viewport;
  private dexlist: DexEntry[] = [];
  private index = 0;
  private region = -1;
  private page = 1;
  private showBattledCount = false;
  private brief = false;
  private typebitmap!: AnimatedBitmap;
  private sprites: Sprites = {};
  private mapdata: (TownMapRegion | null)[] = [];
  private available: AvailableForm[] = [];
  private species: Id = "";
  private gender = 0;
  private form = 0;
  private shiny = 0;
  private special = 0;
  private shadow = false;
  private gmax = false;
  private celestial = false;

  private s<T>(key: string): T { return this.sprites[key] as T; }

  /** Fetches the current species' sprites and icon before they're shown. */
  private async preloadDummyPokemon(): Promise<void> {
    const species = this.dexlist[this.index]![0];
    const [gender, form, shinyN, specialN] = player().pokedex.lastFormSeen(species);
    const shiny: Shininess = shinyN === 2 ? "super_shiny" : shinyN === 1;
    const shadow = specialN === 1;
    const gmax = specialN === 2;
    const celestial = specialN === 3;
    await Promise.all([
      preloadSpeciesSprite(species, gender, form, shiny, shadow, false, false, false, gmax, celestial),
      this.brief ? null : preloadSpeciesSprite(species, gender, form, shiny, shadow, true, false, false, gmax, celestial),
      preloadSpeciesFiles([SpeciesFiles.iconFilename(species, form, gender, shiny, shadow, false, false, gmax, celestial)]),
    ]);
  }

  /** Starts fetching the neighbouring seen species' sprites (not awaited). */
  private prefetchNeighbours(): void {
    for (const step of [-1, 1]) {
      let i = this.index + step;
      while (i >= 0 && i < this.dexlist.length && !player().seen(this.dexlist[i]![0])) i += step;
      const entry = this.dexlist[i];
      if (!entry) continue;
      const [gender, form] = player().pokedex.lastFormSeen(entry[0]);
      void preloadSpeciesSprite(entry[0], gender, form);
    }
  }

  async pbStartScene(dexlist: DexEntry[], index: number, region: number): Promise<void> {
    this.dexlist = dexlist;
    this.index = index;
    this.region = region;
    this.page = 1;
    this.showBattledCount = false;
    this.mapdata = pbLoadTownMapData();
    const mappos = currentMapMetadata()?.townMapPosition;
    if (this.region < 0) this.region = mappos ? mappos[0] : 0; // Use player's current region (region 0 default)
    const areamapFile = `Graphics/Pictures/${this.mapdata[this.region]?.filename ?? ""}`;
    await Promise.all([
      preloadBitmaps([`${DEX}icon_types`, `${DEX}bg_info`, `${DEX}bg_area`, `${DEX}bg_forms`, `${DEX}overlay_area`,
        `${DEX}overlay_areanone`, `${DEX}overlay_info`, `${DEX}icon_own`, "Graphics/Pictures/uparrow", "Graphics/Pictures/downarrow",
        "Graphics/Pokemon/Icons/000", areamapFile, ...REGION_MAP_EXTRAS.map((h) => `Graphics/Pictures/${h[4]}`), ...enhancedUIGraphics()]),
      this.preloadDummyPokemon(),
    ]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.typebitmap = new AnimatedBitmap(_INTL(`${DEX}icon_types`));
    this.sprites = {};
    this.sprites.background = new IconSprite(0, 0, this.viewport);
    const infosprite = new PokemonSprite(this.viewport);
    infosprite.setOffset(PictureOrigin.CENTER);
    infosprite.x = 104;
    infosprite.y = 136;
    this.sprites.infosprite = infosprite;
    const areamap = new IconSprite(0, 0, this.viewport);
    areamap.setBitmapFile(areamapFile);
    areamap.x += Math.floor((Graphics.width - areamap.bitmap!.width) / 2);
    areamap.y += Math.floor((Graphics.height + 32 - areamap.bitmap!.height) / 2);
    this.sprites.areamap = areamap;
    for (const hidden of REGION_MAP_EXTRAS) {
      if (hidden[0] !== this.region || hidden[1] <= 0 || !G.gameSwitches.get(hidden[1])) continue;
      // (Ruby draws onto the cached map bitmap; this draws onto a copy.)
      if (areamap.bitmap === RPGCache.loadBitmap(areamapFile)) areamap.setBitmap(areamap.bitmap!.clone());
      pbDrawImagePositions(areamap.bitmap!, [[`Graphics/Pictures/${hidden[4]}`,
        hidden[2] * PokemonRegionMap_Scene.SQUARE_WIDTH, hidden[3] * PokemonRegionMap_Scene.SQUARE_HEIGHT]]);
    }
    this.sprites.areahighlight = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    const areaoverlay = new IconSprite(0, 0, this.viewport);
    areaoverlay.setBitmapFile(`${DEX}overlay_area`);
    this.sprites.areaoverlay = areaoverlay;
    const formfront = new PokemonSprite(this.viewport);
    formfront.setOffset(PictureOrigin.CENTER);
    formfront.x = 130;
    formfront.y = 158;
    this.sprites.formfront = formfront;
    const formback = new PokemonSprite(this.viewport);
    formback.setOffset(PictureOrigin.BOTTOM);
    formback.x = 382; // y is set below as it depends on metrics
    this.sprites.formback = formback;
    const formicon = new PokemonSpeciesIconSprite(null as unknown as Id, this.viewport); // (nil until pbUpdateDummyPokemon)
    formicon.setOffset(PictureOrigin.CENTER);
    formicon.x = 82;
    formicon.y = 328;
    this.sprites.formicon = formicon;
    const uparrow = AnimatedSprite.createLong("Graphics/Pictures/uparrow", 8, 28, 40, 2, this.viewport);
    uparrow.x = 242;
    uparrow.y = 268;
    uparrow.play();
    uparrow.visible = false;
    this.sprites.uparrow = uparrow;
    const downarrow = AnimatedSprite.createLong("Graphics/Pictures/downarrow", 8, 28, 40, 2, this.viewport);
    downarrow.x = 242;
    downarrow.y = 348;
    downarrow.play();
    downarrow.visible = false;
    this.sprites.downarrow = downarrow;
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    pbSetSystemFont(overlay.bitmap!);
    this.sprites.overlay = overlay;
    this.pbUpdateDummyPokemon();
    this.available = this.pbGetAvailableForms();
    this.drawPage(this.page);
    this.prefetchNeighbours();
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  /** For standalone access, shows first page only */
  async pbStartSceneBrief(species: Id): Promise<void> {
    let dexnum = 0;
    let dexnumshift = false;
    if (player().pokedex.unlocked(-1)) { // National Dex is unlocked
      const speciesData = Species.tryGet(species);
      if (speciesData) {
        const nationalDexList: Id[] = ["NONE", ...Species.eachSpecies().map((s) => s.species)];
        dexnum = Math.max(nationalDexList.indexOf(speciesData.species), 0);
        if (dexnum > 0 && DEXES_WITH_OFFSETS.includes(-1)) dexnumshift = true;
      }
    } else {
      for (let i = 0; i < player().pokedex.dexesCount() - 1; i++) { // Regional Dexes
        if (!player().pokedex.unlocked(i)) continue;
        const num = pbGetRegionalNumber(i, species);
        if (num <= 0) continue;
        dexnum = num;
        if (DEXES_WITH_OFFSETS.includes(i)) dexnumshift = true;
        break;
      }
    }
    this.dexlist = [[species, "", 0, 0, dexnum, dexnumshift]];
    this.index = 0;
    this.page = 1;
    this.brief = true;
    await Promise.all([
      preloadBitmaps([`${DEX}icon_types`, `${DEX}bg_info`, `${DEX}overlay_info`, `${DEX}icon_own`, ...enhancedUIGraphics()]),
      this.preloadDummyPokemon(),
    ]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.typebitmap = new AnimatedBitmap(_INTL(`${DEX}icon_types`));
    this.sprites = {};
    this.sprites.background = new IconSprite(0, 0, this.viewport);
    const infosprite = new PokemonSprite(this.viewport);
    infosprite.setOffset(PictureOrigin.CENTER);
    infosprite.x = 104;
    infosprite.y = 136;
    this.sprites.infosprite = infosprite;
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    pbSetSystemFont(overlay.bitmap!);
    this.sprites.overlay = overlay;
    this.pbUpdateDummyPokemon();
    this.drawPage(this.page);
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.typebitmap.dispose();
    this.viewport.dispose();
  }

  pbUpdate(): void {
    if (this.page === 2) {
      let intensity = (originalFrameCount() % 40) * 12;
      if (intensity > 240) intensity = 480 - intensity;
      this.s<BitmapSprite>("areahighlight").opacity = intensity;
    }
    pbUpdateSpriteHash(this.sprites as never);
  }

  /** pbUpdateDummyPokemon — Essentials Deluxe's (with Generation 8's sprite boxes). */
  pbUpdateDummyPokemon(): void {
    this.species = this.dexlist[this.index]![0];
    [this.gender, this.form, this.shiny, this.special] = player().pokedex.lastFormSeen(this.species);
    if (!Settings.POKEDEX_SHINY_FORMS) this.shiny = 0;
    if (this.special === 1 && !Settings.POKEDEX_SHADOW_FORMS) this.special = 0;
    this.shadow = this.special === 1;
    this.gmax = this.special === 2;
    this.celestial = this.special === 3;
    const shiny: Shininess = this.shiny === 2 ? "super_shiny" : this.shiny === 1;
    const metricsData = SpeciesMetrics.getSpeciesForm(this.species, this.form)!;
    const args = [this.species, this.gender, this.form, shiny, this.shadow, false, false, false, this.gmax, this.celestial];
    const infosprite = this.s<PokemonSprite>("infosprite");
    infosprite.setSpeciesBitmap(...args);
    const formfront = this.sprites.formfront as PokemonSprite | undefined;
    formfront?.setSpeciesBitmap(...args);
    const formback = this.sprites.formback as PokemonSprite | undefined;
    if (formback) {
      formback.setSpeciesBitmap(this.species, this.gender, this.form, shiny, this.shadow, true, false, false, this.gmax, this.celestial);
      formback.y = 256;
      formback.y += metricsData.backSprite[1] * 2;
    }
    (this.sprites.formicon as PokemonSpeciesIconSprite | undefined)?.pbSetParams(this.species, this.gender, this.form, shiny, this.shadow, false, this.gmax, this.celestial);
    // Generation 8 Pack
    const spData = SpeciesMetrics.getSpeciesForm(this.species, this.form)!;
    infosprite.constrict([208, 200]);
    formfront?.constrict([200, 196]);
    if (!formback) return;
    formback.constrict([300, 294]);
    if (spData.backSpriteScale === spData.frontSpriteScale) return;
    formback.setOffset(PictureOrigin.CENTER);
    if (formfront) formback.y = formfront.y;
    formback.zoomX = spData.frontSpriteScale / spData.backSpriteScale;
    formback.zoomY = spData.frontSpriteScale / spData.backSpriteScale;
  }

  /** pbGetAvailableForms — Essentials Deluxe's: every seen form, gender, shininess and Shadow/G-Max look. */
  pbGetAvailableForms(): AvailableForm[] {
    let ret: AvailableForm[] = [];
    let multipleForms = false;
    const shinyChecks = Settings.POKEDEX_SHINY_FORMS ? 2 : 0;
    const specialChecks = Settings.POKEDEX_SHADOW_FORMS ? 2 : 1;
    const dex = player().pokedex;
    for (const sp of Species.each()) {
      if (sp.species !== this.species) continue;
      if (sp.form !== 0 && !sp.realFormName) continue;
      if (sp.pokedexForm !== sp.form) continue;
      if (sp.form > 0) multipleForms = true;
      if (sp.singleGendered()) {
        const realGender = sp.genderRatio === "AlwaysFemale" ? 1 : 0;
        const formGender = sp.genderRatio === "Genderless" ? 2 : realGender + 3;
        for (let i = 0; i < specialChecks; i++) {
          for (let j = 0; j <= shinyChecks; j++) {
            if (dex.seenForm(this.species, realGender, sp.form, j, i) && bitmapExists(sp, "Front", false, j, i)) {
              ret.push([sp.formName ?? "", formGender, sp.form, j, i]);
            }
          }
        }
      } else {
        for (let realGender = 0; realGender < 2; realGender++) {
          let showAllForms = true;
          for (let i = 0; i < specialChecks; i++) {
            const formGender = bitmapExists(sp, "Front", true, 0, i) ? realGender : realGender + 3;
            for (let j = 0; j <= shinyChecks; j++) {
              if (dex.seenForm(this.species, realGender, sp.form, j, i) || (Settings.DEX_SHOWS_ALL_FORMS && showAllForms)) {
                if (bitmapExists(sp, "Front", realGender === 1, j, i)) ret.push([sp.formName ?? "", formGender, sp.form, j, i]);
              }
              showAllForms = false;
            }
          }
        }
      }
      // Plugin-specific forms (ZUD Mechanics)
      ret = this.pbAddGmaxForms(sp, ret, shinyChecks);
    }
    // compact! / uniq!
    const seen = new Set<string>();
    ret = ret.filter((e) => {
      const key = JSON.stringify(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (const entry of ret) {
      let formName = "";
      switch (entry[3]) {
        case 1: formName += _INTL("Shiny"); break;
        case 2: formName += _INTL("Super Shiny"); break;
      }
      if (!entry[0]) {
        let specialForm = "";
        switch (entry[4]) {
          case 1: specialForm = _INTL("Shadow"); break;
          case 2: specialForm = _INTL("Gigantamax"); break;
          case 3: specialForm = _INTL("Celestial"); break;
        }
        if (specialForm) {
          if (formName) formName += " ";
          formName += specialForm;
        }
      } else {
        if (formName) formName += " ";
        formName += entry[0];
      }
      let genderForm = "";
      switch (entry[1]) {
        case 0: genderForm = _INTL("Male"); break;
        case 1: genderForm = _INTL("Female"); break;
        case 2: if (!entry[0] && multipleForms) genderForm = _INTL("One Form"); break;
      }
      if (genderForm) {
        if (formName) formName += " ";
        formName += genderForm;
      }
      entry[0] = _INTL("{1}", formName);
      if (entry[1] > 2) entry[1] -= 3;
      if (entry[1] >= 2) entry[1] = 0;
    }
    return ret;
  }

  /** ZUD Mechanics: adds G-Max forms to a species's form list. */
  pbAddGmaxForms(species: Species, formArray: AvailableForm[], checks = 1): AvailableForm[] {
    if (!PowerMove.speciesList("G-Max").includes(species.id)) return formArray;
    let gmaxForm: number;
    switch (species.species) {
      case "TOXTRICITY": gmaxForm = 1; break;
      case "ALCREMIE": gmaxForm = 62; break;
      default: gmaxForm = species.form;
    }
    if (gmaxForm > species.form) return formArray;
    const gmaxName = species.gmaxFormName ? species.gmaxFormName : _INTL(`Gigantamax ${species.name}`);
    for (let realGender = 0; realGender < 2; realGender++) {
      for (let i = 0; i <= checks; i++) {
        if (player().pokedex.seenForm(this.species, realGender, species.form, i, 2) || Settings.DEX_SHOWS_ALL_FORMS) {
          const data: AvailableForm = [gmaxName, 3, gmaxForm, i, 2];
          const included = formArray.some((f) => f.every((v, k) => v === data[k]));
          if (!included && bitmapExists(species, "Front", realGender === 1, i, 2)) formArray.push(data);
        }
      }
    }
    return formArray;
  }

  drawPage(page: number): void {
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    overlay.clear();
    // Make certain sprites visible
    this.s<PokemonSprite>("infosprite").visible = this.page === 1;
    const vis = (key: string, v: boolean) => {
      const spr = this.sprites[key] as { visible: boolean } | undefined;
      if (spr) spr.visible = v;
    };
    vis("areamap", this.page === 2);
    vis("areahighlight", this.page === 2);
    vis("areaoverlay", this.page === 2);
    vis("formfront", this.page === 3);
    vis("formback", this.page === 3);
    vis("formicon", this.page === 3);
    // Draw page-specific information
    switch (page) {
      case 1: this.drawPageInfo(); break;
      case 2: this.drawPageArea(); break;
      case 3: this.drawPageForms(); break;
    }
  }

  /** drawPageInfo — ZUD Mechanics' (G-Max info; species icon instead of footprint), plus Enhanced UI's egg groups and body shape. */
  drawPageInfo(): void {
    this.s<IconSprite>("background").setBitmapFile(`${DEX}bg_info`);
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    const base = new Color(88, 88, 80);
    const shadow = new Color(168, 184, 184);
    const imagepos: ImagePosition[] = [];
    if (this.brief) imagepos.push([`${DEX}overlay_info`, 0, 0]);
    const speciesData = Species.getSpeciesForm(this.species, this.form)!;
    let indexText = "???";
    const entry = this.dexlist[this.index]!;
    if (entry[4] > 0) {
      let indexNumber = entry[4];
      if (entry[5]) indexNumber -= 1;
      indexText = pad3(indexNumber);
    }
    const textpos: TextPosition[] = [
      [_INTL("{1}{2} {3}", indexText, " ", speciesData.name), 246, 48, 0, new Color(248, 248, 248), new Color(0, 0, 0)],
    ];
    if (this.showBattledCount) {
      textpos.push([_INTL("Number Battled"), 314, 164, 0, base, shadow]);
      textpos.push([String(player().pokedex.battledCount(this.species)), 452, 196, 1, base, shadow]);
    } else {
      textpos.push([_INTL("Height"), 314, 164, 0, base, shadow]);
      textpos.push([_INTL("Weight"), 314, 196, 0, base, shadow]);
    }
    if (player().owned(this.species)) {
      textpos.push([_INTL("{1} Pokémon", speciesData.category), 246, 80, 0, base, shadow]);
      if (!this.showBattledCount) {
        const height = this.gmax ? (speciesData.gmaxHeight ?? 0) : speciesData.height;
        const weight = speciesData.weight;
        if (userInUS()) {
          const inches = Math.round(height / 0.254);
          const pounds = this.gmax ? _INTL("????.? lbs.") : `${f1(Math.round(weight / 0.45359) / 10.0).padStart(4, " ")} lbs.`;
          textpos.push([`${Math.floor(inches / 12)}'${String(inches % 12).padStart(2, "0")}"`, 460, 164, 1, base, shadow]);
          textpos.push([pounds, 494, 196, 1, base, shadow]);
        } else {
          const kilograms = this.gmax ? _INTL("????.? kg") : `${f1(weight / 10.0)} kg`;
          textpos.push([`${f1(height / 10.0)} m`, 470, 164, 1, base, shadow]);
          textpos.push([kilograms, 482, 196, 1, base, shadow]);
        }
      }
      const dexentry = this.gmax ? speciesData.gmaxDexEntry : speciesData.pokedexEntry;
      drawTextEx(overlay, 40, 246, Graphics.width - 40 * 2, 4, dexentry ?? "", base, shadow);
      // Generation 8 Pack with DEX_SHOWS_FOOTPRINTS off: the species icon instead of the footprint
      const shiny: Shininess = this.shiny === 2 ? "super_shiny" : this.shiny === 1;
      const footprintfile = SpeciesFiles.iconFilename(this.species, this.form, this.gender, shiny, this.shadow, false, false, this.gmax, this.celestial);
      if (footprintfile) {
        const footprint = RPGCache.loadBitmap(footprintfile);
        if (footprint) {
          const minWidth = Math.floor(((footprint.width >= footprint.height * 2 ? footprint.height : footprint.width) - 64) / 2);
          const minHeight = Math.max(Math.floor((footprint.height - 56) / 2), 0);
          overlay.blt(210, 130, footprint, new Rect(minWidth, minHeight, 64, 56));
        }
      }
      imagepos.push([`${DEX}icon_own`, 212, 44]);
      speciesData.types.forEach((type, i) => {
        const typeNumber = Type.get(type).iconPosition;
        overlay.blt(296 + 100 * i, 120, this.typebitmap.bitmap, new Rect(0, typeNumber * 32, 96, 32));
      });
    } else {
      textpos.push([_INTL("????? Pokémon"), 246, 80, 0, base, shadow]);
      if (!this.showBattledCount) {
        if (userInUS()) {
          textpos.push([_INTL("???'??\""), 460, 164, 1, base, shadow]);
          textpos.push([_INTL("????.? lbs."), 494, 196, 1, base, shadow]);
        } else {
          textpos.push([_INTL("????.? m"), 470, 164, 1, base, shadow]);
          textpos.push([_INTL("????.? kg"), 482, 196, 1, base, shadow]);
        }
      }
    }
    pbDrawTextPositions(overlay, textpos);
    pbDrawImagePositions(overlay, imagepos);
    // --- Enhanced UI ---
    if (!player().owned(this.species)) return;
    if (EnhancedUISettings.POKEDEX_EGG_GROUPS) pbDisplayEggGroups(speciesData, overlay, 148, 204, true);
    if (EnhancedUISettings.POKEDEX_BODY_SHAPES) pbDisplayBodyShape(speciesData, overlay, 170, 154, true);
  }

  pbFindEncounter(encTypes: Record<Id, EncounterSlot[]> | null | undefined, species: Id): boolean {
    if (!encTypes) return false;
    for (const slots of Object.values(encTypes)) {
      if (!slots) continue;
      for (const slot of slots) if (Species.get(slot.species).species === species) return true;
    }
    return false;
  }

  /** A 1D array of values corresponding to points on the Town Map (true where the species lives). */
  pbGetEncounterPoints(): boolean[] {
    const { LEFT, RIGHT } = PokemonRegionMap_Scene;
    // Determine all visible points on the Town Map (i.e. only ones with a
    // defined point in town_map.txt, and which either have no Self Switch
    // controlling their visibility or whose Self Switch is ON)
    const visiblePoints = new Set<string>();
    for (const loc of this.mapdata[this.region]?.points ?? []) {
      if (loc.switchId != null && !G.gameSwitches.get(loc.switchId)) continue; // Point is not visible
      visiblePoints.add(`${loc.x},${loc.y}`);
    }
    // Find all points with a visible area for @species
    const townMapWidth = 1 + RIGHT - LEFT;
    const ret: boolean[] = [];
    const encounterVersion = (G.pokemonGlobal as unknown as { encounterVersion?: number }).encounterVersion ?? 0;
    for (const encData of Encounter.eachOfVersion(encounterVersion)) {
      if (!this.pbFindEncounter(encData.types, this.species)) continue; // Species isn't in encounter table
      // Get the map belonging to the encounter table
      const mapMetadata = MapMetadata.tryGet(encData.map);
      if (!mapMetadata || mapMetadata.hasFlag("HideEncountersInPokedex")) continue;
      const mappos = mapMetadata.townMapPosition;
      if (!mappos) continue; // (see the header comment)
      if (mappos[0] !== this.region) continue; // Map isn't in the region being shown
      // Get the size and shape of the map in the Town Map
      const mapSize = mapMetadata.townMapSize;
      let mapWidth = 1;
      let mapHeight = 1;
      let mapShape = "1";
      if (mapSize && mapSize[0] && mapSize[0] > 0) { // Map occupies multiple points
        mapWidth = mapSize[0];
        mapShape = mapSize[1];
        mapHeight = Math.ceil(mapShape.length / mapWidth);
      }
      // Mark each visible point covered by the map as containing the area
      for (let i = 0; i < mapWidth; i++) {
        for (let j = 0; j < mapHeight; j++) {
          if ((parseInt(mapShape.charAt(i + j * mapWidth), 10) || 0) === 0) continue; // Point isn't part of map
          if (!visiblePoints.has(`${mappos[1] + i},${mappos[2] + j}`)) continue; // Point isn't visible
          ret[mappos[1] + i + (mappos[2] + j) * townMapWidth] = true;
        }
      }
    }
    return ret;
  }

  drawPageArea(): void {
    const { SQUARE_WIDTH: sqwidth, SQUARE_HEIGHT: sqheight, LEFT, RIGHT } = PokemonRegionMap_Scene;
    this.s<IconSprite>("background").setBitmapFile(_INTL(`${DEX}bg_area`));
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    const base = new Color(88, 88, 80);
    const shadow = new Color(168, 184, 184);
    const highlight = this.s<BitmapSprite>("areahighlight").bitmap!;
    highlight.clear();
    // Get all points to be shown as places where @species can be encountered
    const points = this.pbGetEncounterPoints();
    // Draw coloured squares on each point of the Town Map with a nest
    const pointcolor = new Color(0, 248, 248);
    const pointcolorhl = new Color(192, 248, 248);
    const townMapWidth = 1 + RIGHT - LEFT;
    const areamap = this.s<IconSprite>("areamap").bitmap!;
    for (let j = 0; j < points.length; j++) {
      if (!points[j]) continue;
      let x = (j % townMapWidth) * sqwidth;
      x += Math.floor((Graphics.width - areamap.width) / 2);
      let y = Math.floor(j / townMapWidth) * sqheight;
      y += Math.floor((Graphics.height + 32 - areamap.height) / 2);
      highlight.fillRect(x, y, sqwidth, sqheight, pointcolor);
      if (j - townMapWidth < 0 || !points[j - townMapWidth]) highlight.fillRect(x, y - 2, sqwidth, 2, pointcolorhl);
      if (j + townMapWidth >= points.length || !points[j + townMapWidth]) highlight.fillRect(x, y + sqheight, sqwidth, 2, pointcolorhl);
      if (j % townMapWidth === 0 || !points[j - 1]) highlight.fillRect(x - 2, y, 2, sqheight, pointcolorhl);
      if ((j + 1) % townMapWidth === 0 || !points[j + 1]) highlight.fillRect(x + sqwidth, y, 2, sqheight, pointcolorhl);
    }
    // Set the text
    const textpos: TextPosition[] = [];
    if (points.length === 0) {
      pbDrawImagePositions(overlay, [[`${DEX}overlay_areanone`, 108, 188]]);
      textpos.push([_INTL("Area unknown"), Graphics.width / 2, Graphics.height / 2 + 6, 2, base, shadow]);
    }
    textpos.push([this.mapdata[this.region]?.name ?? "", 414, 50, 2, base, shadow]); // pbGetMessage(MessageTypes::RegionNames, @region)
    textpos.push([_INTL("{1}'s area", Species.get(this.species).name), Graphics.width / 2, 358, 2, base, shadow]);
    pbDrawTextPositions(overlay, textpos);
  }

  /** drawPageForms — Essentials Deluxe's. */
  drawPageForms(): void {
    this.s<IconSprite>("background").setBitmapFile(_INTL(`${DEX}bg_forms`));
    const overlay = this.s<BitmapSprite>("overlay").bitmap!;
    const base = new Color(88, 88, 80);
    const shadow = new Color(168, 184, 184);
    let formname = "";
    for (const i of this.available) {
      if (i[1] === this.gender && i[2] === this.form && i[3] === this.shiny && i[4] === this.special) {
        formname = i[0];
        break;
      }
    }
    pbDrawTextPositions(overlay, [
      [Species.get(this.species).name, Graphics.width / 2, Graphics.height - 82, 2, base, shadow],
      [formname, Graphics.width / 2, Graphics.height - 50, 2, base, shadow],
    ]);
  }

  pbGoToPrevious(): void {
    let newindex = this.index;
    while (newindex > 0) {
      newindex -= 1;
      if (player().seen(this.dexlist[newindex]![0])) {
        this.index = newindex;
        break;
      }
    }
  }

  pbGoToNext(): void {
    let newindex = this.index;
    while (newindex < this.dexlist.length - 1) {
      newindex += 1;
      if (player().seen(this.dexlist[newindex]![0])) {
        this.index = newindex;
        break;
      }
    }
  }

  /** pbChooseForm — Essentials Deluxe's. */
  async pbChooseForm(): Promise<void> {
    let index = 0;
    for (let i = 0; i < this.available.length; i++) {
      const a = this.available[i]!;
      if (a[1] === this.gender && a[2] === this.form && a[3] === this.shiny && a[4] === this.special) {
        index = i;
        break;
      }
    }
    let oldindex = -1;
    const uparrow = this.s<AnimatedSprite>("uparrow");
    const downarrow = this.s<AnimatedSprite>("downarrow");
    for (;;) {
      if (oldindex !== index) {
        const a = this.available[index]!;
        player().pokedex.setLastFormSeen(this.species, a[1], a[2], a[3], a[4]);
        await this.preloadDummyPokemon();
        this.pbUpdateDummyPokemon();
        this.drawPage(this.page);
        uparrow.visible = index > 0;
        downarrow.visible = index < this.available.length - 1;
        oldindex = index;
      }
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.UP)) {
        pbPlayCursorSE();
        index = (index + this.available.length - 1) % this.available.length;
      } else if (Input.trigger(Input.DOWN)) {
        pbPlayCursorSE();
        index = (index + 1) % this.available.length;
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        break;
      }
    }
    uparrow.visible = false;
    downarrow.visible = false;
  }

  async pbScene(): Promise<number> {
    SpeciesFiles.playCryFromSpecies(this.species, this.form);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      let dorefresh = false;
      if (Input.trigger(Input.ACTION)) {
        pbSEStop();
        if (this.page === 1) SpeciesFiles.playCryFromSpecies(this.species, this.form);
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        switch (this.page) {
          case 1: // Info
            this.showBattledCount = !this.showBattledCount;
            dorefresh = true;
            break;
          case 2: // Area
            break;
          case 3: // Forms
            if (this.available.length > 1) {
              pbPlayDecisionSE();
              await this.pbChooseForm();
              dorefresh = true;
            }
            break;
        }
      } else if (Input.trigger(Input.UP) || Input.trigger(Input.DOWN)) {
        const oldindex = this.index;
        if (Input.trigger(Input.UP)) this.pbGoToPrevious();
        else this.pbGoToNext();
        if (this.index !== oldindex) {
          await this.preloadDummyPokemon();
          this.pbUpdateDummyPokemon();
          this.available = this.pbGetAvailableForms();
          pbSEStop();
          if (this.page === 1) SpeciesFiles.playCryFromSpecies(this.species, this.form);
          else pbPlayCursorSE();
          dorefresh = true;
          this.prefetchNeighbours();
        }
      } else if (Input.trigger(Input.LEFT)) {
        const oldpage = this.page;
        this.page -= 1;
        if (this.page < 1) this.page = 1;
        if (this.page > 3) this.page = 3;
        if (this.page !== oldpage) {
          pbPlayCursorSE();
          dorefresh = true;
        }
      } else if (Input.trigger(Input.RIGHT)) {
        const oldpage = this.page;
        this.page += 1;
        if (this.page < 1) this.page = 1;
        if (this.page > 3) this.page = 3;
        if (this.page !== oldpage) {
          pbPlayCursorSE();
          dorefresh = true;
        }
      }
      if (dorefresh) this.drawPage(this.page);
    }
    return this.index;
  }

  async pbSceneBrief(): Promise<void> {
    SpeciesFiles.playCryFromSpecies(this.species, this.form);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.ACTION)) {
        pbSEStop();
        SpeciesFiles.playCryFromSpecies(this.species, this.form);
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        break;
      }
    }
  }
}

//===============================================================================
//
//===============================================================================
export class PokemonPokedexInfoScreen {
  constructor(private scene: PokemonPokedexInfo_Scene) {}

  /** Index of last species viewed in dexlist */
  async pbStartScreen(dexlist: DexEntry[], index: number, region: number): Promise<number> {
    await this.scene.pbStartScene(dexlist, index, region);
    const ret = await this.scene.pbScene();
    await this.scene.pbEndScene();
    return ret;
  }

  /** For use from a Pokémon's summary screen */
  async pbStartSceneSingle(species: Id): Promise<void> {
    // (Settings::USE_CURRENT_REGION_DEX is false)
    const region = dexGlobals().pokedexDex; // National Dex -1, regional Dexes 0, 1, etc.
    const dexnum = pbGetRegionalNumber(region, species);
    const dexnumshift = DEXES_WITH_OFFSETS.includes(region);
    const dexlist: DexEntry[] = [[species, Species.get(species).name, 0, 0, dexnum, dexnumshift]];
    await this.scene.pbStartScene(dexlist, 0, region);
    await this.scene.pbScene();
    await this.scene.pbEndScene();
  }

  /** For use when capturing a new species */
  async pbDexEntry(species: Id): Promise<void> {
    await this.scene.pbStartSceneBrief(species);
    await this.scene.pbSceneBrief();
    await this.scene.pbEndScene();
  }
}
