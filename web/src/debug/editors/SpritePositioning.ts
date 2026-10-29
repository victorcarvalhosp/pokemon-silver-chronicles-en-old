// Port of Data/Scripts/020_Debug/001_Editor screens/004_EditorScreens_SpritePositioning.rb
// (findBottom, pbAutoPositionAll, SpritePositioner, SpritePositionerScreen)
// with ZUD Mechanics' overrides folded in (Plugins/ZUD Mechanics/[000]
// General/Editors.rb): holding Ctrl while the editor opens edits the Dynamax
// and G-Max metrics (PBS/Plugins/ZUD/dynamax_metrics.txt) instead of the
// normal ones (PBS/pokemon_metrics.txt), and Ctrl with "Auto-Position All
// Pokémon Sprites" runs pbAutoPositionDynamax. Registers
// EditorScreens.pbSpritePositioner and pbAutoPositionAll.
//
// The sprites' graphics are fetched before they're shown (pbChangeSpecies is
// async). Saving keeps the metrics in the loaded GameData and rewrites the PBS
// file; not saving rereads the compiled metrics (EditorData.ts).

import { BattleScene } from "../../battle/scene/BattleScene";
import { shadowFilename } from "../../battle/scene/sceneFiles";
import { applyDynamax, DYNAMAX_PATTERN_GRAPHICS } from "../../battle/zud/scene/dynamaxSprite";
import { Compiler } from "../../compiler/WritePBS";
import { GameData, type Id } from "../../data/gameData";
import { pbPlayCancelSE, pbPlayDecisionSE } from "../../game/GameSystem";
import type { Bitmap } from "../../rgss/Bitmap";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { pbFadeInAndShow, pbFadeOutAndHide, type SpriteHash } from "../../ui/fades";
import { _INTL, pbDisposeSpriteHash, pbSetSmallFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { AnimatedPlane } from "../../ui/planes";
import { pbResolveBitmap, preloadBitmap, preloadBitmaps } from "../../ui/rpgCache";
import {
  EBDXBitmapWrapper, PictureOrigin, PokemonSprite, preloadSpeciesSprite, speciesSpriteParams, spriteBitmapRequest,
} from "../../ui/sprites/pokemonSprite";
import { IconSprite } from "../../ui/SpriteWrapper";
import { Window_CommandPokemon, Window_CommandPokemonEx, Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { EditorScreens } from "../editorScreens";
import { gameDataLoad, gameDataSave } from "./EditorData";

type Metrics = InstanceType<typeof GameData.SpeciesMetrics>;
type XY = [number, number];

//===============================================================================
//
//===============================================================================
export function findBottom(bitmap: Bitmap | null): number {
  if (!bitmap) return 0;
  const data = bitmap.ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  for (let i = 1; i <= bitmap.height; i++) {
    const row = (bitmap.height - i) * bitmap.width * 4;
    for (let j = 0; j < bitmap.width; j++) {
      if (data[row + j * 4 + 3]! > 0) return bitmap.height - i;
    }
  }
  return 0;
}

/** GameData::Species.sprite_bitmap(species, form, nil, nil, nil, back, egg, dmax, gmax) (an EBDXBitmapWrapper). */
async function speciesSpriteBitmap(species: Id, form: number, back: boolean, dmax = false, gmax = false): Promise<EBDXBitmapWrapper | null> {
  const req = spriteBitmapRequest(speciesSpriteParams(species, form, null, null, null, back, false, dmax, gmax));
  if (!req) return null;
  if (!(await preloadBitmap(req.file))) return null;
  return new EBDXBitmapWrapper(req.file, req.scale);
}

/** Graphics.update every 5 seconds of a long job (Time.now.to_i - t >= 5). */
function keepAlive(): () => Promise<void> {
  let t = Math.floor(Date.now() / 1000);
  return async () => {
    if (Math.floor(Date.now() / 1000) - t >= 5) {
      t = Math.floor(Date.now() / 1000);
      await Graphics.update();
    }
  };
}

/** The base Essentials pbAutoPositionAll (ZUD aliases it as zud_pbAutoPositionAll). */
export async function zudPbAutoPositionAll(): Promise<void> {
  const tick = keepAlive();
  for (const sp of GameData.Species.each()) {
    await tick();
    const metrics = GameData.SpeciesMetrics.getSpeciesForm(sp.species, sp.form)!;
    const bitmap1 = await speciesSpriteBitmap(sp.species, sp.form, true);
    const bitmap2 = await speciesSpriteBitmap(sp.species, sp.form, false);
    if (bitmap1?.bitmap) { // Player's y
      metrics.backSprite[0] = 0;
      metrics.backSprite[1] = Math.floor((bitmap1.height - (findBottom(bitmap1.bitmap) + 1)) / 2);
    }
    if (bitmap2?.bitmap) { // Foe's y
      metrics.frontSprite[0] = 0;
      metrics.frontSprite[1] = Math.floor((bitmap2.height - (findBottom(bitmap2.bitmap) + 1)) / 2);
      metrics.frontSprite[1] += 4; // Just because
    }
    metrics.frontSpriteAltitude = 0; // Shouldn't be used
    metrics.shadowX = 0;
    metrics.shadowSize = 2;
    bitmap1?.dispose();
    bitmap2?.dispose();
  }
  // GameData::SpeciesMetrics.save; Compiler.write_pokemon_metrics
  await gameDataSave("PBS/pokemon_metrics.txt", () => Compiler.writePokemonMetrics());
}

//-------------------------------------------------------------------------------
// Automatically positions Dynamax sprites. (ZUD)
//-------------------------------------------------------------------------------
export async function pbAutoPositionDynamax(): Promise<void> {
  const tick = keepAlive();
  const speciesList = GameData.PowerMove.speciesList("G-Max");
  // Gigantamax sprites
  for (const i of speciesList) {
    if (!i || !GameData.Species.tryGet(i)) continue;
    await tick();
    const sp = GameData.Species.get(i);
    const metrics = GameData.SpeciesMetrics.getSpeciesForm(sp.species, sp.form)!;
    const bitmap1 = await speciesSpriteBitmap(sp.species, sp.form, true, false, true);
    const bitmap2 = await speciesSpriteBitmap(sp.species, sp.form, false, false, true);
    if (bitmap1?.bitmap) {
      metrics.gmaxBackSprite[0] = 0;
      metrics.gmaxBackSprite[1] = Math.floor((bitmap1.height - (findBottom(bitmap1.bitmap) + 1)) / 2) + 45;
    }
    if (bitmap2?.bitmap) {
      metrics.gmaxFrontSprite[0] = 0;
      metrics.gmaxFrontSprite[1] = Math.floor((bitmap2.height - (findBottom(bitmap2.bitmap) + 1)) / 2) + 4;
    }
    metrics.gmaxAltitude = 0;
    metrics.gmaxShadowX = 0;
    metrics.gmaxShadowSize = 3;
    bitmap1?.dispose();
    bitmap2?.dispose();
  }
  // All other Dynamax sprites
  for (const sp of GameData.Species.each()) {
    const metrics = GameData.SpeciesMetrics.getSpeciesForm(sp.species, sp.form)!;
    await tick();
    // NOTE (Ruby parity): a species without its own Dynamax metrics shares
    // the arrays (dmax_front_sprite *is* front_sprite, ZUD [001] Data/
    // Data_Species.rb:168), so the +8 below also moves its normal front
    // sprite down 8 more pixels each run (ZUD [000] General/Editors.rb:341).
    metrics.dmaxBackSprite[0] = metrics.backSprite[0];
    metrics.dmaxBackSprite[1] = metrics.backSprite[1];
    metrics.dmaxFrontSprite[0] = metrics.frontSprite[0];
    metrics.dmaxFrontSprite[1] = metrics.frontSprite[1] + 8;
    metrics.dmaxAltitude = metrics.frontSpriteAltitude;
    metrics.dmaxShadowX = metrics.shadowX;
    metrics.dmaxShadowSize = 3;
  }
  // GameData::SpeciesMetrics.save; Compiler.write_dynamax_metrics
  await gameDataSave("PBS/Plugins/ZUD/dynamax_metrics.txt", () => Compiler.writeDynamaxMetrics());
}

/** ZUD's pbAutoPositionAll: Ctrl repositions the Dynamax sprites instead. */
export async function pbAutoPositionAll(): Promise<void> {
  if (Input.press(Input.CTRL)) {
    await pbMessage(_INTL("Auto-positioning Dynamax sprites..."));
    await pbAutoPositionDynamax();
  } else {
    await zudPbAutoPositionAll();
  }
}

//===============================================================================
// (with ZUD's Dynamax mode: @mode 0 = normal, 1 = Dynamax, 2 = G-Max)
//===============================================================================
interface MetricsSet {
  back: XY;
  front: XY;
  altitude: number;
  shadow_x: number;
  shadow_size: number;
}

export class SpritePositioner {
  private sprites: Record<string, IconSprite | PokemonSprite | AnimatedPlane | Window_UnformattedTextPokemon> = {};
  private viewport!: Viewport;
  private oldSpeciesIndex = 0;
  private species: Id | null = null; // This cannot be a species_form
  private form: number | null = 0;
  metricsChanged = false;
  private starting = false;
  private mode = 0;
  private dynamaxMode = false;
  private gmax = false;
  private metrics: Partial<MetricsSet> = {};

  private get pkmn0() { return this.sprites.pokemon_0 as PokemonSprite; }
  private get pkmn1() { return this.sprites.pokemon_1 as PokemonSprite; }
  private get shadow1() { return this.sprites.shadow_1 as IconSprite; }
  private get info() { return this.sprites.info as Window_UnformattedTextPokemon; }

  /** ZUD's pbOpen, then the original. */
  async pbOpen(): Promise<void> {
    this.mode = 0;
    this.dynamaxMode = Input.press(Input.CTRL);
    if (this.dynamaxMode) {
      this.mode = 1;
      await pbMessage(_INTL("Opening editor in Dynamax Mode..."));
    }
    this.gmax = false;
    this.metrics = {};
    // zud_pbOpen
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const battlebg = "Graphics/Battlebacks/indoor1_bg";
    const playerbase = "Graphics/Battlebacks/indoor1_base0";
    const enemybase = "Graphics/Battlebacks/indoor1_base1";
    await preloadBitmaps([battlebg, playerbase, enemybase, "Graphics/Pictures/Battle/debug_message", ...DYNAMAX_PATTERN_GRAPHICS]);
    const bg = new AnimatedPlane(this.viewport);
    bg.setBitmap(battlebg);
    bg.z = 0;
    this.sprites.battle_bg = bg;
    let [baseX, baseY] = BattleScene.pbBattlerPosition(0);
    const base0 = new IconSprite(baseX, baseY, this.viewport);
    base0.setBitmapFile(playerbase);
    if (base0.bitmap) base0.x -= Math.floor(base0.bitmap.width / 2);
    if (base0.bitmap) base0.y -= base0.bitmap.height;
    base0.z = 1;
    this.sprites.base_0 = base0;
    [baseX, baseY] = BattleScene.pbBattlerPosition(1);
    const base1 = new IconSprite(baseX, baseY, this.viewport);
    base1.setBitmapFile(enemybase);
    if (base1.bitmap) base1.x -= Math.floor(base1.bitmap.width / 2);
    if (base1.bitmap) base1.y -= Math.floor(base1.bitmap.height / 2);
    base1.z = 1;
    this.sprites.base_1 = base1;
    const messageBox = new IconSprite(0, Graphics.height - 96, this.viewport);
    messageBox.setBitmapFile("Graphics/Pictures/Battle/debug_message");
    messageBox.z = 2;
    this.sprites.messageBox = messageBox;
    const shadow = new IconSprite(0, 0, this.viewport);
    shadow.z = 3;
    this.sprites.shadow_1 = shadow;
    for (const i of [0, 1]) {
      const s = new PokemonSprite(this.viewport);
      s.setOffset(PictureOrigin.BOTTOM);
      s.z = 4;
      this.sprites[`pokemon_${i}`] = s;
    }
    const info = new Window_UnformattedTextPokemon("");
    info.viewport = this.viewport;
    info.visible = false;
    this.sprites.info = info;
    this.oldSpeciesIndex = 0;
    this.species = null;
    this.form = 0;
    this.metricsChanged = false;
    this.refresh();
    this.starting = true;
  }

  async pbClose(): Promise<void> {
    if (this.metricsChanged && await pbConfirmMessage(_INTL("Some metrics have been edited. Save changes?"))) {
      await this.pbSaveMetrics();
      this.metricsChanged = false;
    } else {
      await gameDataLoad(GameData.SpeciesMetrics); // Clear all changes to metrics
    }
    await pbFadeOutAndHide(this.sprites as SpriteHash, () => this.update());
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  }

  /** ZUD: writes the Dynamax metrics in Dynamax mode. */
  async pbSaveMetrics(): Promise<void> {
    // GameData::SpeciesMetrics.save
    if (this.dynamaxMode) {
      await gameDataSave("PBS/Plugins/ZUD/dynamax_metrics.txt", () => Compiler.writeDynamaxMetrics());
    } else {
      await gameDataSave("PBS/pokemon_metrics.txt", () => Compiler.writePokemonMetrics());
    }
  }

  /** ZUD: the metrics of the mode being edited (the same arrays as the data's). */
  pbGetMetrics(data: Metrics): void {
    if (Object.keys(this.metrics).length === 0) {
      const metrics = {
        back: [data.backSprite, data.dmaxBackSprite, data.gmaxBackSprite],
        front: [data.frontSprite, data.dmaxFrontSprite, data.gmaxFrontSprite],
        altitude: [data.frontSpriteAltitude, data.dmaxAltitude, data.gmaxAltitude],
        shadow_x: [data.shadowX, data.dmaxShadowX, data.gmaxShadowX],
        shadow_size: [data.shadowSize, data.dmaxShadowSize, data.gmaxShadowSize],
      };
      this.metrics = {
        back: metrics.back[this.mode] as XY,
        front: metrics.front[this.mode] as XY,
        altitude: metrics.altitude[this.mode]!,
        shadow_x: metrics.shadow_x[this.mode]!,
        shadow_size: metrics.shadow_size[this.mode]!,
      };
    }
  }

  pbApplyMetrics(data: Metrics): void {
    this.pbGetMetrics(data);
    const m = this.metrics as MetricsSet;
    switch (this.mode) {
      case 0:
        data.backSprite = m.back;
        data.frontSprite = m.front;
        data.frontSpriteAltitude = m.altitude;
        data.shadowX = m.shadow_x;
        data.shadowSize = m.shadow_size;
        break;
      case 1:
        data.dmaxBackSprite = m.back;
        data.dmaxFrontSprite = m.front;
        data.dmaxAltitude = m.altitude;
        data.dmaxShadowX = m.shadow_x;
        data.dmaxShadowSize = m.shadow_size;
        break;
      case 2:
        data.gmaxBackSprite = m.back;
        data.gmaxFrontSprite = m.front;
        data.gmaxAltitude = m.altitude;
        data.gmaxShadowX = m.shadow_x;
        data.gmaxShadowSize = m.shadow_size;
        break;
    }
  }

  update(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  refresh(): void {
    if (!this.species) {
      this.pkmn0.visible = false;
      this.pkmn1.visible = false;
      this.shadow1.visible = false;
      return;
    }
    const metricsData = GameData.SpeciesMetrics.getSpeciesForm(this.species, this.form)!;
    this.pbApplyMetrics(metricsData);
    for (const i of [0, 1]) {
      const pos = BattleScene.pbBattlerPosition(i, 1);
      const s = this.sprites[`pokemon_${i}`] as PokemonSprite;
      s.x = pos[0];
      s.y = pos[1];
      metricsData.applyMetricsToSprite(s, i, false, this.mode);
      s.visible = true;
      if (i !== 1) continue;
      this.shadow1.x = pos[0];
      this.shadow1.y = pos[1];
      if (this.shadow1.bitmap) {
        this.shadow1.x -= Math.floor(this.shadow1.bitmap.width / 2);
        this.shadow1.y -= Math.floor(this.shadow1.bitmap.height / 2);
      }
      metricsData.applyMetricsToSprite(this.shadow1, i, true, this.mode);
      this.shadow1.visible = true;
    }
  }

  pbAutoPosition(): void {
    const m = this.metrics as MetricsSet;
    const oldBackY = m.back[1];
    const oldFrontY = m.front[1];
    const oldFrontAltitude = m.altitude;
    const bitmap1 = this.pkmn0.bitmap;
    const bitmap2 = this.pkmn1.bitmap;
    if (!bitmap1 || !bitmap2) return; // (Ruby raises on a missing graphic)
    const newBackY = Math.floor((bitmap1.height - (findBottom(bitmap1) + 1)) / 2);
    let newFrontY = Math.floor((bitmap2.height - (findBottom(bitmap2) + 1)) / 2);
    newFrontY += 4;
    if (newBackY !== oldBackY || newFrontY !== oldFrontY || oldFrontAltitude !== 0) {
      m.back[1] = newBackY;
      m.front[1] = newFrontY;
      m.altitude = 0;
      this.metricsChanged = true;
      this.refresh();
    }
  }

  async pbChangeSpecies(species: Id | null, form: number | null, gmax: boolean | null): Promise<void> {
    this.species = species;
    this.form = form;
    this.gmax = !!gmax;
    this.mode = this.gmax ? 2 : this.dynamaxMode ? 1 : 0;
    const speciesData = GameData.Species.getSpeciesForm(this.species, this.form);
    if (!speciesData) return;
    const metricsData = GameData.SpeciesMetrics.getSpeciesForm(this.species, this.form)!;
    this.pbGetMetrics(metricsData);
    const params0 = [this.species, 0, this.form, false, false, true, false, this.dynamaxMode, this.gmax];
    const params1 = [this.species, 0, this.form, false, false, false, false, this.dynamaxMode, this.gmax];
    const shadowFile = shadowFilename(this.species!, this.form ?? 0, this.dynamaxMode);
    await Promise.all([preloadSpeciesSprite(...params0), preloadSpeciesSprite(...params1),
      shadowFile ? preloadBitmap(shadowFile) : Promise.resolve(null)]);
    this.pkmn0.setSpeciesBitmap(...params0);
    this.pkmn1.setSpeciesBitmap(...params1);
    this.shadow1.setBitmapFile(shadowFile);
    if (this.dynamaxMode) {
      applyDynamax(this.pkmn0, this.species);
      applyDynamax(this.pkmn1, this.species);
    }
  }

  async pbShadowSize(): Promise<boolean> {
    await this.pbChangeSpecies(this.species, this.form, this.gmax);
    this.refresh();
    const metricsData = GameData.SpeciesMetrics.getSpeciesForm(this.species, this.form)!;
    const m = this.metrics as MetricsSet;
    if (this.dynamaxMode) {
      await pbMessage("Dynamax Pokémon have their own shadow sprite. The shadow size metric cannot be edited.");
      return false;
    } else if (pbResolveBitmap(`Graphics/Pokemon/Shadow/${metricsData.species}_${metricsData.form}`) ||
               pbResolveBitmap(`Graphics/Pokemon/Shadow/${metricsData.species}`)) {
      await pbMessage("This species has its own shadow sprite in Graphics/Pokemon/Shadow/. The shadow size metric cannot be edited.");
      return false;
    }
    const oldval = m.shadow_size;
    const cmdvals = [0];
    const commands = [_INTL("None")];
    let defindex = 0;
    let i = 0;
    for (;;) {
      i += 1;
      const fn = `Graphics/Pokemon/Shadow/${i}`;
      if (!pbResolveBitmap(fn)) break;
      cmdvals.push(i);
      commands.push(String(i));
      if (oldval === i) defindex = cmdvals.length - 1;
    }
    const cw = new Window_CommandPokemon(commands);
    cw.index = defindex;
    cw.viewport = this.viewport;
    let ret = false;
    let oldindex = cw.index;
    for (;;) {
      await Graphics.update();
      Input.update();
      cw.update();
      this.update();
      if (cw.index !== oldindex) {
        oldindex = cw.index;
        m.shadow_size = cmdvals[cw.index]!;
        this.pbApplyMetrics(metricsData);
        await this.pbChangeSpecies(this.species, this.form, this.gmax);
        this.refresh();
      }
      if (Input.trigger(Input.ACTION)) {
        pbPlayDecisionSE();
        if (m.shadow_size !== oldval) this.metricsChanged = true;
        ret = true;
        break;
      } else if (Input.trigger(Input.BACK)) {
        m.shadow_size = oldval;
        this.pbApplyMetrics(metricsData);
        pbPlayCancelSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        break;
      }
    }
    cw.dispose();
    return ret;
  }

  /** Returns whether to go on to the next parameter (null: no species). */
  async pbSetParameter(param: number): Promise<boolean | null> {
    if (!this.species) return null;
    if (param === 2) return this.pbShadowSize();
    if (param === 4) {
      this.pbAutoPosition();
      return false;
    }
    const m = this.metrics as MetricsSet;
    let sprite: PokemonSprite | IconSprite;
    let xpos: number;
    let ypos: number;
    switch (param) {
      case 0:
        sprite = this.pkmn0;
        xpos = m.back[0];
        ypos = m.back[1];
        break;
      case 1:
        sprite = this.pkmn1;
        xpos = m.front[0];
        ypos = m.front[1];
        break;
      default: // 3
        sprite = this.shadow1;
        xpos = m.shadow_x;
        ypos = 0;
    }
    const oldxpos = xpos;
    const oldypos = ypos;
    this.info.visible = true;
    let ret = false;
    for (;;) {
      sprite.visible = (Graphics.frameCount % 16) < 12; // Flash the selected sprite
      await Graphics.update();
      Input.update();
      this.update();
      switch (param) {
        case 0: this.info.setTextToFit(`Ally Position = ${xpos},${ypos}`); break;
        case 1: this.info.setTextToFit(`Enemy Position = ${xpos},${ypos}`); break;
        case 3: this.info.setTextToFit(`Shadow Position = ${xpos}`); break;
      }
      if ((Input.repeat(Input.UP) || Input.repeat(Input.DOWN)) && param !== 3) {
        ypos += Input.repeat(Input.DOWN) ? 1 : -1;
        if (param === 0) m.back[1] = ypos;
        else if (param === 1) m.front[1] = ypos;
        this.refresh();
      }
      if (Input.repeat(Input.LEFT) || Input.repeat(Input.RIGHT)) {
        xpos += Input.repeat(Input.RIGHT) ? 1 : -1;
        if (param === 0) m.back[0] = xpos;
        else if (param === 1) m.front[0] = xpos;
        else m.shadow_x = xpos;
        this.refresh();
      }
      if (Input.repeat(Input.ACTION) && param !== 3) { // Cycle to next option
        if (xpos !== oldxpos || ypos !== oldypos) this.metricsChanged = true;
        ret = true;
        pbPlayDecisionSE();
        break;
      } else if (Input.repeat(Input.BACK)) {
        if (param === 0) {
          m.back[0] = oldxpos;
          m.back[1] = oldypos;
        } else if (param === 1) {
          m.front[0] = oldxpos;
          m.front[1] = oldypos;
        } else {
          m.shadow_x = oldxpos;
        }
        pbPlayCancelSE();
        this.refresh();
        break;
      } else if (Input.repeat(Input.USE)) {
        if (xpos !== oldxpos || (param !== 3 && ypos !== oldypos)) this.metricsChanged = true;
        pbPlayDecisionSE();
        break;
      }
    }
    this.info.visible = false;
    sprite.visible = true;
    return ret;
  }

  async pbMenu(species: Id, form: number, gmax: boolean): Promise<number> {
    await this.pbChangeSpecies(species, form, gmax);
    this.refresh();
    const cw = new Window_CommandPokemon([
      _INTL("Set Ally Position"), _INTL("Set Enemy Position"), _INTL("Set Shadow Size"),
      _INTL("Set Shadow Position"), _INTL("Auto-Position Sprites"),
    ]);
    cw.x = Graphics.width - cw.width;
    cw.y = Graphics.height - cw.height;
    cw.viewport = this.viewport;
    let ret = -1;
    for (;;) {
      await Graphics.update();
      Input.update();
      cw.update();
      this.update();
      if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        ret = cw.index;
        break;
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        break;
      }
    }
    cw.dispose();
    return ret;
  }

  /** The species the list offers: [id, species, form, name, gmax] sorted by name. */
  speciesList(): [Id, Id, number, string, boolean][] {
    const allspecies: [Id, Id, number, string, boolean][] = [];
    for (const sp of GameData.Species.each()) {
      if (sp.noDynamax && this.dynamaxMode) continue;
      let name = sp.form === 0 ? sp.name : _INTL("{1} (form {2})", sp.realName, sp.form);
      if (name && name !== "") allspecies.push([sp.id, sp.species, sp.form, name, false]);
      if (this.dynamaxMode && sp.hasGmax() && !(sp.species === "ALCREMIE" && sp.form > 0)) {
        name = _INTL("{1} (G-Max)", sp.realName);
        if (name && name !== "") allspecies.push([sp.id, sp.species, sp.form, name, true]);
      }
    }
    allspecies.sort((a, b) => (a[3] < b[3] ? -1 : a[3] > b[3] ? 1 : 0));
    return allspecies;
  }

  async pbChooseSpecies(): Promise<[Id, number, boolean] | false> {
    if (this.starting) {
      await pbFadeInAndShow(this.sprites as SpriteHash, null, () => this.update());
      this.starting = false;
    }
    const cw = Window_CommandPokemonEx.newEmpty(0, 0, 260, 32 + (24 * 6), this.viewport);
    cw.rowHeight = 24;
    pbSetSmallFont(cw.contents!);
    cw.x = Graphics.width - cw.width;
    cw.y = Graphics.height - cw.height;
    const allspecies = this.speciesList();
    cw.commands = allspecies.map((sp) => sp[3]);
    cw.index = this.oldSpeciesIndex;
    let ret: [Id, number, boolean] | false = false;
    let oldindex = -1;
    for (;;) {
      await Graphics.update();
      Input.update();
      cw.update();
      if (cw.index !== oldindex) {
        oldindex = cw.index;
        this.metrics = {};
        const sp = allspecies[cw.index]!;
        await this.pbChangeSpecies(sp[1], sp[2], sp[4]);
        this.refresh();
      }
      this.update();
      if (Input.trigger(Input.BACK)) {
        this.metrics = {};
        await this.pbChangeSpecies(null, null, null);
        this.refresh();
        break;
      } else if (Input.trigger(Input.USE)) {
        const sp = allspecies[cw.index]!;
        await this.pbChangeSpecies(sp[1], sp[2], sp[4]);
        ret = [sp[1], sp[2], sp[4]];
        break;
      }
    }
    this.oldSpeciesIndex = cw.index;
    cw.dispose();
    return ret;
  }
}

//===============================================================================
//
//===============================================================================
export class SpritePositionerScreen {
  constructor(private scene: SpritePositioner) {}

  async pbStart(): Promise<void> {
    await this.scene.pbOpen();
    for (;;) {
      const species = await this.scene.pbChooseSpecies();
      if (!species) break;
      for (;;) {
        let command = await this.scene.pbMenu(...species);
        if (command < 0) break;
        for (;;) {
          const par = await this.scene.pbSetParameter(command);
          if (!par) break;
          command = (command + 1) % 3;
        }
      }
    }
    await this.scene.pbClose();
  }
}

EditorScreens.pbSpritePositioner = async () => {
  const sp = new SpritePositioner();
  const sps = new SpritePositionerScreen(sp);
  await sps.pbStart();
};
EditorScreens.pbAutoPositionAll = pbAutoPositionAll;
