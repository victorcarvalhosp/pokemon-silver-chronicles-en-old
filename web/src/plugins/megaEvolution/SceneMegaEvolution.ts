// Port of Plugins/Mega Evolution/Mega Evolution.rb (bo4p5687): the plugin's
// SceneMegaEvolution animation (lines 5-277) and its Battle#pbMegaEvolve
// redefinition (lines 280-326).
//
// Not used in battle: Essentials Deluxe ([000] Essentials Patches/Mega
// Evolution.rb) redefines Battle#pbMegaEvolve again, without an alias, and
// loads after this plugin, so Deluxe's version (common animations, or its own
// cinematic; battle/battle/Battle_ActionOther.ts, battle/deluxe/
// MegaEvolutionAnim.ts) is the one that runs and SceneMegaEvolution is never
// created. The plugin's header says as much ("With latest ZUD plugin, this is
// not working anymore"). Its pbMegaEvolve is kept below as a plain function
// (pluginPbMegaEvolve) and is not installed on Battle; the scene can be
// watched on the dev page (dev-plugin-scenes.html?scene=mega).
//
// Frames are the original 40 fps ones; pbWait counts them on a clock kept for
// the whole animation, so many short waits add up to the original duration.
// Ruby loads each graphic where it's used; start() fetches them all first.

import { assetExists } from "../../core/assets";
import { _INTL } from "../../core/intl";
import { rand } from "../../core/random";
import { Settings } from "../../data/gameData/settings";
import { pbBGMPlay } from "../../game/GameSystem";
import { G, pbUpdateSceneMap } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Battle } from "../../battle/battle/Battle";
import type { Battler } from "../../battle/battler/Battler";
import type { Move } from "../../battle/move/Move";
import { AbilityEffects } from "../../battle/other/AbilityEffects";
import { PBEffects } from "../../battle/other/PBEffects";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { FrameCounter } from "../../ui/frameTime";
import { pbDisposeSpriteHash } from "../../ui/messageConfig";
import { preloadBitmaps, RPGCache } from "../../ui/rpgCache";
import { f32 } from "../../ui/scenes/frames";
import { SpeciesFiles } from "../../ui/sprites/pokemonSprite";

const resolve = (path: string): string | null => (assetExists(path) ? path : null);
const MEGA_DIR = "Pictures/Mega Evolution";

export class SceneMegaEvolution {
  sprites: Record<string, Sprite> = {};
  private viewport: Viewport;
  private red: Record<string, number> = {};
  private green: Record<string, number> = {};
  private blue: Record<string, number> = {};
  private xyb: Record<string, number> | null = null;
  private previousBGM: ReturnType<typeof G.gameSystem.getPlayingBGM> = null;
  private pkmn!: Pokemon;
  private middlex = 0;
  private middley = 0;
  private clock = new FrameCounter();
  private credit = 0;

  constructor() {
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.red = {};
    this.green = {};
    this.blue = {};
  }

  /** pbWait(numFrames): 40 fps frames, counted on the scene's clock. */
  private async pbWait(numFrames: number): Promise<void> {
    while (this.credit < numFrames) {
      await Graphics.update();
      Input.update();
      await pbUpdateSceneMap();
      this.credit += this.clock.tick();
    }
    this.credit -= numFrames;
  }

  /** `n.times { body; pbWait(w) }` */
  private async repeat(n: number, w: number, body: (i: number) => void): Promise<void> {
    for (let i = 0; i < n; i++) {
      body(i);
      await this.pbWait(w);
    }
  }

  async start(time: number, backdrop: string, pkmn: Pokemon): Promise<void> {
    this.previousBGM = G.gameSystem.getPlayingBGM();
    pbBGMPlay("megaevolution");
    this.pkmn = pkmn;
    // Scene
    let timeName: string | null = null;
    switch (time) {
      case 1: timeName = "eve"; break;
      case 2: timeName = "night"; break;
    }
    let backdropFilename = backdrop;
    if (timeName) {
      const trialName = `${backdropFilename}_${timeName}`;
      if (resolve("Graphics/Battlebacks/" + trialName + "_bg")) backdropFilename = trialName;
    }
    await preloadBitmaps([
      `Graphics/Battlebacks/${backdropFilename}_bg`, "Graphics/Pictures/Battle/icon_mega",
      ...["Base", "Buble Pink", "Circle", "Circle 2", "Light", "Light 2"].map((f) => `Graphics/${MEGA_DIR}/${f}`),
      ...[this.bitmapPkmn(), this.bitmapPkmn(pkmn.getMegaForm() || pkmn.form)].filter((f): f is string => !!f),
    ]);
    // Center
    this.middlex = Graphics.width / 2; // Settings::SCREEN_WIDTH (512)
    this.middley = Graphics.height / 2; // Settings::SCREEN_HEIGHT (384)
    // Background
    this.createSprite("bg", `${backdropFilename}_bg`, this.viewport, "Battlebacks");
    this.setZoom("bg", 1, 1.35);
    // Base
    this.createSprite("base", "Base", this.viewport);
    this.sprites["base"]!.opacity = 0;
    const s = this.sprites;
    // Save color
    const red = s["bg"]!.color.red;
    const green = s["bg"]!.color.green;
    const blue = s["bg"]!.color.blue;
    this.saveColor("bg", red, green, blue);
    // Set white screen (bitmap)
    s["bg"]!.color.red = 255;
    s["bg"]!.color.green = 255;
    s["bg"]!.color.blue = 255;
    await this.repeat(17, 1, () => { s["bg"]!.color.alpha += 15; });
    await this.pbWait(5);
    // Restore color (background)
    this.restoreColor("bg", red, green, blue);
    await this.repeat(17, 1, () => { s["bg"]!.color.alpha -= 15; });
    await this.pbWait(2);
    // Pokemon
    // NOTE (Ruby parity): Bitmap.new(front sprite file) is the whole file, and
    // this game's front sprites are animation strips (e.g. 6552x91), so the
    // strip is shown centred, several frames side by side (Mega Evolution.rb:50).
    s["pkmn"] = new Sprite(this.viewport);
    s["pkmn"].setBitmap(this.loadBitmap(this.bitmapPkmn()));
    let ox = Math.floor((s["pkmn"].bitmap?.width ?? 0) / 2);
    let oy = Math.floor((s["pkmn"].bitmap?.height ?? 0) / 2);
    this.setOxoySprite("pkmn", ox, oy);
    this.setXySprite("pkmn", this.middlex, this.middley);
    // GameData::Species.play_cry(@pkmn)
    await this.pbWait(20);
    // Buble (effect)
    this.setPositionEffectBuble();
    // Set red screen (bitmap)
    s["bg"]!.color.red = 235;
    s["bg"]!.color.green = 0;
    s["bg"]!.color.blue = 0;
    // (the Pokémon's color is Sprite's default black: it turns into a silhouette)
    await this.repeat(17, 1, () => {
      s["bg"]!.color.alpha += 12;
      s["base"]!.opacity = Math.min(255, s["base"]!.opacity + 15);
      s["pkmn"]!.color.alpha += 15;
    });
    await this.pbWait(1);
    // Set circle
    this.createSprite("circle", "Circle", this.viewport);
    ox = Math.floor(s["circle"]!.bitmap!.width / 2);
    oy = Math.floor(s["circle"]!.bitmap!.height / 2);
    this.setOxoySprite("circle", ox, oy);
    this.setXySprite("circle", this.middlex, this.middley);
    this.setZoom("circle", 0, 0);
    // Set buble
    for (const [n, calc] of [[0, 0], [4, 1], [8, 2], [12, 3], [1, 0], [5, 1], [9, 2], [13, 3],
      [2, 0], [6, 1], [10, 2], [14, 3], [3, 0], [7, 1], [11, 2], [15, 3]] as const) {
      await this.setEffectBuble(n, calc);
    }
    // Animation
    let zoom = 0;
    await this.repeat(15, 2, () => {
      zoom += 0.2;
      this.setZoom("circle", zoom, zoom);
    });
    // Save color (pokemon)
    const redpkmn = s["pkmn"].color.red;
    const greenpkmn = s["pkmn"].color.green;
    const bluepkmn = s["pkmn"].color.blue;
    this.saveColor("pkmn", redpkmn, greenpkmn, bluepkmn);
    // Set white (pokemon)
    s["pkmn"].color.red = 255;
    s["pkmn"].color.green = 255;
    s["pkmn"].color.blue = 255;
    s["pkmn"].color.alpha = 255;
    this.setVisibleSprite("circle");
    await this.pbWait(1);
    // Light
    this.createSprite("light", "Light", this.viewport);
    let srcw = Math.floor(s["light"]!.bitmap!.width / 3);
    let srch = s["light"]!.bitmap!.height;
    this.setSrcWhSprite("light", srcw, srch);
    this.setSrcXySprite("light", 0, 0);
    this.setVisibleSprite("light");
    // Circle 2
    this.createSprite("circle 2", "Circle 2", this.viewport);
    srcw = Math.floor(s["circle 2"]!.bitmap!.width / 3);
    srch = s["circle 2"]!.bitmap!.height;
    this.setSrcWhSprite("circle 2", srcw, srch);
    this.setSrcXySprite("circle 2", 0, 0);
    this.setOxoySprite("circle 2", Math.floor(srcw / 2), Math.floor(srch / 2));
    this.setXySprite("circle 2", this.middlex, this.middley);
    // Save color (circle)
    const redc = s["circle 2"]!.color.red;
    const greenc = s["circle 2"]!.color.green;
    const bluec = s["circle 2"]!.color.blue;
    this.saveColor("circle 2", redc, greenc, bluec);
    // Set white (circle)
    s["circle 2"]!.color.red = 255;
    s["circle 2"]!.color.green = 255;
    s["circle 2"]!.color.blue = 255;
    s["circle 2"]!.color.alpha = 255;
    await this.pbWait(1);
    // Animation
    zoom = 1;
    let mul = 0;
    let inc = 0;
    await this.repeat(9, 5, () => {
      mul += 1;
      zoom += 0.1;
      this.setZoom("circle 2", zoom, zoom);
      if (mul >= 7) {
        // Restore color (circle)
        this.restoreColor("circle 2", redc, greenc, bluec);
        s["circle 2"]!.color.alpha = 0;
        let srcx = Math.floor(s["circle 2"]!.bitmap!.width / 3) * inc;
        this.setSrcXySprite("circle 2", srcx, 0);
        this.setVisibleSprite("light", true);
        srcx = Math.floor(s["light"]!.bitmap!.width / 3) * inc;
        this.setSrcXySprite("light", srcx, 0);
        inc += 1;
      }
    });
    this.createSprite("scene", `${backdropFilename}_bg`, this.viewport, "Battlebacks");
    this.setZoom("scene", 1, 1.35);
    s["scene"]!.color.red = 255;
    s["scene"]!.color.green = 255;
    s["scene"]!.color.blue = 255;
    s["scene"]!.color.alpha = 255;
    // Restore color
    // Pokemon
    this.restoreColor("pkmn", redpkmn, greenpkmn, bluepkmn);
    s["pkmn"].color.alpha = 0;
    this.setZoom("pkmn", 2, 2);
    // Background
    this.restoreColor("bg", red, green, blue);
    s["bg"]!.color.alpha = 0;
    await this.pbWait(10);
    this.setVisibleSprite("circle 2");
    this.setVisibleSprite("light");
    this.setVisibleSprite("base");
  }

  async megaEvolve(): Promise<void> {
    const s = this.sprites;
    // Reset Form
    // NOTE (Ruby parity): ox/oy stay those of the first strip, so a Mega strip
    // of another width is drawn off-centre, often entirely off screen
    // (Mega Evolution.rb:146; Ampharos: ox 1239 on a 960-wide strip).
    s["pkmn"]!.setBitmap(this.loadBitmap(this.bitmapPkmn()));
    await this.repeat(17, 2, () => { s["scene"]!.opacity = Math.max(0, s["scene"]!.opacity - 15); });
    let zoom = 2;
    await this.repeat(10, 2, () => {
      zoom -= 0.1;
      this.setZoom("pkmn", zoom, zoom);
    });
    this.createSprite("light 2", "Light 2", this.viewport);
    let ox = Math.floor(s["light 2"]!.bitmap!.width / 2);
    let oy = Math.floor(s["light 2"]!.bitmap!.height / 2);
    this.setOxoySprite("light 2", ox, oy);
    this.setXySprite("light 2", this.middlex, this.middley - 130);
    this.createSprite("icon", "icon_mega", this.viewport, "Pictures/Battle");
    ox = Math.floor(s["icon"]!.bitmap!.width / 2);
    oy = Math.floor(s["icon"]!.bitmap!.height / 2);
    this.setOxoySprite("icon", ox, oy);
    this.setXySprite("icon", this.middlex, this.middley - 130);
    this.setZoom("icon", 1.5, 1.5);
    let o = 0;
    await this.repeat(10, 5, () => {
      s["light 2"]!.angle = f32(s["light 2"]!.angle + 36);
      if (o === 5) SpeciesFiles.playCryFromPokemon(this.pkmn);
      o += 1;
    });
    await this.pbWait(10);
    if (this.previousBGM) pbBGMPlay(this.previousBGM); // (pbBGMPlay(nil) returns at once)
  }

  setXYB(xname: string, yname: string, xcoor: number, ycoor: number): void {
    this.xyb ??= {};
    this.xyb[xname] = xcoor;
    this.xyb[yname] = ycoor;
  }

  //-------------------------------------------------------------------------------
  // Effect
  //-------------------------------------------------------------------------------
  /** Buble: 16 bubbles, four in each corner around the middle of each quadrant. */
  setPositionEffectBuble(): void {
    for (let i = 0; i < 16; i++) {
      if (!this.sprites[`buble ${i}`]) this.createSprite(`buble ${i}`, "Buble Pink", this.viewport);
      let xbb: number;
      let ybb: number;
      if (i <= 3) {
        xbb = Math.floor(this.middlex / 2) - rand(10);
        ybb = Math.floor(this.middley / 2) - rand(10);
      } else if (i <= 7) {
        xbb = Math.floor(this.middlex / 2) - rand(10);
        ybb = this.middley * 1.5 + rand(10);
      } else if (i <= 11) {
        xbb = this.middlex * 1.5 + rand(10);
        ybb = Math.floor(this.middley / 2) - rand(10);
      } else {
        xbb = this.middlex * 1.5 + rand(10);
        ybb = this.middley * 1.5 + rand(10);
      }
      this.setXYB(`x ${i}`, `y ${i}`, xbb, ybb);
      this.setXySprite(`buble ${i}`, xbb, ybb);
      this.setVisibleSprite(`buble ${i}`);
    }
  }

  /** Moves bubble `number` a fifth of the way to the centre, 5 times, then hides it. */
  async setEffectBuble(number: number, calc: number): Promise<void> {
    this.setVisibleSprite(`buble ${number}`, true);
    const b = this.sprites[`buble ${number}`]!;
    await this.repeat(5, 1, () => {
      const xch = this.xyb![`x ${number}`]!;
      const ych = this.xyb![`y ${number}`]!;
      const xxx = Math.floor((this.middlex - xch) / 5);
      const yyy = Math.floor((this.middley - ych) / 5);
      const xxx2 = Math.floor((xch - this.middlex) / 5);
      const yyy2 = Math.floor((ych - this.middley) / 5);
      switch (calc) {
        case 0: b.x += xxx; b.y += yyy; break;
        case 1: b.x += xxx; b.y -= yyy2; break;
        case 2: b.x -= xxx2; b.y += yyy; break;
        default: b.x -= xxx2; b.y -= yyy2;
      }
    });
    this.setVisibleSprite(`buble ${number}`);
    await this.pbWait(1);
  }

  //-------------------------------------------------------------------------------
  // Bitmap, Color
  //-------------------------------------------------------------------------------
  /** The Pokémon's front sprite file (form: its current one unless given). */
  bitmapPkmn(form: number = this.pkmn?.form ?? 0): string | null {
    const p = this.pkmn;
    return SpeciesFiles.frontSpriteFilename(p.species, form, p.gender, p.shiny, p.shadowPokemon());
  }

  saveColor(sprite: string, red: number, green: number, blue: number): void {
    this.red[sprite] = red;
    this.green[sprite] = green;
    this.blue[sprite] = blue;
  }

  /**
   * NOTE (Ruby parity): only reassigns its own arguments, so no color is
   * restored (Mega Evolution.rb:224-226). Each call is followed by alpha = 0
   * (or a fade to 0), so nothing shows.
   */
  restoreColor(sprite: string, _red: number, _green: number, _blue: number): void {
    void [this.red[sprite], this.green[sprite], this.blue[sprite]];
  }

  //-------------------------------------------------------------------------------
  // Set
  //-------------------------------------------------------------------------------
  private loadBitmap(path: string | null) {
    return path ? RPGCache.loadBitmap(path) : null; // (Bitmap.new: a missing file raises in Ruby)
  }

  /** Image */
  createSprite(spritename: string, filename: string, vp: Viewport, dir = MEGA_DIR): void {
    const sprite = new Sprite(vp);
    sprite.setBitmap(this.loadBitmap(`Graphics/${dir}/${filename}`));
    this.sprites[spritename] = sprite;
  }

  /** Set ox, oy */
  setOxoySprite(spritename: string, ox: number, oy: number): void {
    this.sprites[spritename]!.ox = ox;
    this.sprites[spritename]!.oy = oy;
  }

  /** Set x, y */
  setXySprite(spritename: string, x: number, y: number): void {
    this.sprites[spritename]!.x = Math.trunc(x);
    this.sprites[spritename]!.y = Math.trunc(y);
  }

  /** Set zoom */
  setZoom(spritename: string, zoomX: number, zoomY: number): void {
    this.sprites[spritename]!.zoomX = f32(zoomX);
    this.sprites[spritename]!.zoomY = f32(zoomY);
  }

  /** Set visible */
  setVisibleSprite(spritename: string, vsb = false): void {
    this.sprites[spritename]!.visible = vsb;
  }

  /** Set src */
  setSrcWhSprite(spritename: string, w: number, h: number): void {
    this.sprites[spritename]!.srcRect.width = w;
    this.sprites[spritename]!.srcRect.height = h;
  }

  setSrcXySprite(spritename: string, x: number, y: number): void {
    this.sprites[spritename]!.srcRect.x = x;
    this.sprites[spritename]!.srcRect.y = y;
  }

  //-------------------------------------------------------------------------------
  //-------------------------------------------------------------------------------
  async endScene(): Promise<void> {
    // Reset bitmap
    await this.megaEvolve();
    // End
    pbDisposeSpriteHash(this.sprites as never);
    // NOTE (Ruby parity): @viewport is never disposed (an empty viewport is left behind).
  }
}

//===============================================================================
// Mega: the plugin's Battle#pbMegaEvolve. Not installed (see the header):
// Essentials Deluxe's redefinition replaces it.
//===============================================================================
const nilOrEmpty = (s: string | null | undefined): boolean => s == null || s === "";

export async function pluginPbMegaEvolve(battle: Battle, idxBattler: number): Promise<void> {
  const battler = battle.battlers[idxBattler];
  if (!battler || !battler.pokemon) return;
  if (!battler.hasMega() || battler.mega()) return;
  if (battler.pbOwnedByPlayer()) G.stats.megaEvolutionCount += 1;
  const trainerName = battle.pbGetOwnerName(idxBattler);
  const oldAbility = battler.abilityId;
  // Break Illusion
  if (battler.hasActiveAbility("ILLUSION")) {
    await AbilityEffects.triggerOnBeingHit(battler.ability, null as unknown as Battler, battler, null as unknown as Move, battle);
  }
  // Mega Evolve
  switch (battler.pokemon.megaMessage()) {
    case 1: // Rayquaza
      await battle.pbDisplay(_INTL("{1}'s fervent wish has reached {2}!", trainerName, battler.pbThis()));
      break;
    default:
      await battle.pbDisplay(_INTL("{1}'s {2} is reacting to {3}'s {4}!",
        battler.pbThis(), battler.itemName(), trainerName, battle.pbGetMegaRingName(idxBattler)));
  }
  // Animation
  const megascene = new SceneMegaEvolution();
  await megascene.start(battle.time, battle.backdrop, battler.pokemon);
  // pbCommonAnimation("MegaEvolution",battler)
  battler.pokemon.makeMega();
  battler.form = battler.pokemon.form;
  battler.pbUpdate(true);
  battle.scene.pbChangePokemon(battler, battler.pokemon);
  battle.scene.pbRefreshOne(idxBattler);
  // pbCommonAnimation("MegaEvolution2",battler)
  // End animation
  await megascene.endScene();
  let megaName = battler.pokemon.megaName();
  if (nilOrEmpty(megaName)) megaName = _INTL("Mega {1}", battler.pokemon.speciesName());
  await battle.pbDisplay(_INTL("{1} has Mega Evolved into {2}!", battler.pbThis(), megaName));
  const side = battler.idxOwnSide();
  const owner = battle.pbGetOwnerIndexFromBattlerIndex(idxBattler);
  battle.megaEvolution[side]![owner] = -2;
  if (battler.isSpecies("GENGAR") && battler.mega()) {
    battler.effects[PBEffects.Telekinesis] = 0;
  }
  // Trigger ability
  await battler.pbOnLosingAbility(oldAbility);
  await battler.pbTriggerAbilityOnGainingIt();
  // Recalculate turn order
  if (Settings.RECALCULATE_TURN_ORDER_AFTER_MEGA_EVOLUTION) battle.pbCalculatePriority(false, [idxBattler]);
}
