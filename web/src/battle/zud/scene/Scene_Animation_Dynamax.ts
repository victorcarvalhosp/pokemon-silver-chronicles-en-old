// Port of Plugins/ZUD Mechanics/[005] Battle_Scene/Scene_Animation_Dynamax.rb:
// Battle::Scene::Animation::BattlerDynamax (a trainer's Pokémon: recalled into
// its ball, which grows with Dynamax energy and drops back onto the field)
// and ::BattlerDynamaxWild. The scene methods that play them are in Scene.ts.
//
// Delays and durations are PictureEx's (1/20 s), as in Ruby. Every graphic is
// preloaded by Scene.ts (dynamaxGraphics) before the animation is created.

import { Item } from "../../../data/gameData/item";
import { TrainerType } from "../../../data/gameData/trainerType";
import { G } from "../../../game/globals";
import type { Pokemon } from "../../../game/pokemon/Pokemon";
import type { Viewport } from "../../../rgss/display";
import { Color, Tone } from "../../../rgss/types";
import { PictureOrigin } from "../../../ui/scenes/PictureEx";
import { SpeciesFiles } from "../../../ui/sprites/pokemonSprite";
import { resolveBitmap } from "../../../ui/sprites/pokemonIcon";
import type { Battle } from "../../battle/Battle";
import type { Battler } from "../../battler/Battler";
import { PBEffects } from "../../other/PBEffects";
import { Animation, DX_ANIM_PATH, type SceneSprites } from "../../scene/animationBase";
import { shadowFilename } from "../../scene/sceneFiles";
import { applyDynamax } from "./dynamaxSprite";
import { assetExists } from "../../../core/assets";

const SCREEN_W = 512;
const SCREEN_H = 384;
const WHITE = () => new Color(255, 255, 255);

/** Battle#pbGetBattlefieldFiles (Essentials Deluxe, [000] Battle_Scene.rb:618): [backdrop, base] names. */
export function pbGetBattlefieldFiles(battle: Battle): [string, string] {
  let time: string | null = null;
  switch (battle.time) {
    case 1: time = "eve"; break;
    case 2: time = "night"; break;
  }
  let backdropFilename = battle.backdrop;
  let baseFilename = battle.backdrop;
  if (battle.backdropBase) baseFilename = `${baseFilename}_${battle.backdropBase}`;
  if (time) {
    let trialName = `${backdropFilename}_${time}`;
    if (resolveBitmap(`Graphics/Battlebacks/${trialName}_bg`)) backdropFilename = trialName;
    trialName = `${baseFilename}_${time}`;
    if (resolveBitmap(`Graphics/Battlebacks/${trialName}_base1`)) baseFilename = trialName;
  }
  if (!resolveBitmap(`Graphics/Battlebacks/${baseFilename}_base1`) && battle.backdropBase) {
    baseFilename = battle.backdropBase;
    if (time) {
      const trialName = `${baseFilename}_${time}`;
      if (resolveBitmap(`Graphics/Battlebacks/${trialName}_base1`)) baseFilename = trialName;
    }
  }
  return [backdropFilename, baseFilename];
}

/** The trainer's item of the given flag that the cinematic shows (Dynamax Band, Z-Ring). */
export function trainerItemFor(battle: Battle, idxBattler: number, flag: string, fallback: string): string {
  const items: string[] = [];
  for (const item of Item.each()) if (item.hasFlag(flag)) items.push(item.id);
  let trainerItem = fallback;
  if (battle.pbOwnedByPlayer(idxBattler)) {
    for (const item of items) {
      if (!G.bag.has(item)) continue;
      trainerItem = item;
    }
  } else {
    const trainerItems = battle.pbGetOwnerItems(idxBattler);
    for (const item of items) {
      if (!trainerItems?.includes(item)) continue;
      trainerItem = item;
    }
  }
  return trainerItem;
}

/** The species parameters of the Dynamax sprite: [species, gender, form, shiny, shadow, back, egg, dmax, gmax]. */
export function dynamaxSpriteParams(battler: Battler, pkmn: Pokemon): unknown[] {
  return [pkmn.species, pkmn.gender, pkmn.form, pkmn.shiny, pkmn.shadowPokemon(), false, false, true,
    battler.gmaxFactor() && pkmn.hasGmax()];
}

/** The Pokémon the cinematics show (the Transform target's sprite, or the Illusion). */
export function cinematicPokemon(battler: Battler): Pokemon {
  return ((battler.effects[PBEffects.TransformPokemon] as Pokemon | null) ?? battler.displayPokemon())!;
}

//===============================================================================
// Battle animation for triggering Dynamax. (Trainer's Pokemon)
//===============================================================================
export class BattlerDynamax extends Animation {
  private battle: Battle;
  private battler: Battler;
  private pkmn: Pokemon;
  private dynamax: unknown[];
  private shadowFile: string;
  private cryFile: string | null;
  private ballFile: string;
  private calyrex: boolean;
  private trainerFile: string | null;
  private itemFile: string;
  private path: string;
  private bgFile: string;
  private baseFile: string;

  //-----------------------------------------------------------------------------
  // Initializes data used for the animation.
  //-----------------------------------------------------------------------------
  constructor(sprites: SceneSprites, viewport: Viewport | null, idxBattler: number, battle: Battle) {
    super(sprites, viewport);
    //---------------------------------------------------------------------------
    // Gets Pokemon data from battler index.
    this.battle = battle;
    this.battler = battle.battlers[idxBattler]!;
    this.opposes = battle.opposes(idxBattler);
    this.pkmn = cinematicPokemon(this.battler);
    this.dynamax = dynamaxSpriteParams(this.battler, this.pkmn);
    this.shadowFile = shadowFilename(this.pkmn.species, this.pkmn.form, true) ?? "";
    this.cryFile = SpeciesFiles.cryFilename(this.pkmn.species, this.pkmn.form, null, this.dynamax[3], this.dynamax[4],
      true, this.dynamax[this.dynamax.length - 1]);
    this.ballFile = "Graphics/Battle animations/ball_" + String(this.pkmn.pokeBall);
    this.calyrex = this.pkmn.isSpecies("CALYREX");
    //---------------------------------------------------------------------------
    // Gets trainer data from battler index.
    const trainer = battle.pbGetOwnerFromBattlerIndex(idxBattler)!;
    this.trainerFile = TrainerType.frontSpriteFilename(trainer.trainerType, resolveBitmap);
    this.itemFile = "Graphics/Items/" + trainerItemFor(battle, idxBattler, "DynamaxBand", "DYNAMAXBAND");
    //---------------------------------------------------------------------------
    // Gets background and animation data.
    this.path = DX_ANIM_PATH;
    const [backdropFilename, baseFilename] = pbGetBattlefieldFiles(battle);
    this.bgFile = "Graphics/Battlebacks/" + backdropFilename + "_bg";
    this.baseFile = "Graphics/Battlebacks/" + baseFilename + "_base1";
    this.createProcesses();
  }

  //-----------------------------------------------------------------------------
  // Plays the animation.
  //-----------------------------------------------------------------------------
  override createProcesses(): void {
    let delay = 0;
    const centerX = SCREEN_W / 2, centerY = SCREEN_H / 2;
    const ps = this.pictureSprites;
    //---------------------------------------------------------------------------
    // Sets up background.
    const bgData = this.dxSetBackdrop(this.path + "Dynamax/bg", this.bgFile, delay);
    const zoomBG = assetExists(this.path + "Dynamax/bg") ? 1 : 1.5;
    const picBG = bgData[0];
    //---------------------------------------------------------------------------
    // Sets up overlay.
    const picOVERLAY = this.dxSetOverlay(this.path + "burst", delay)[0];
    //---------------------------------------------------------------------------
    // Sets up Dynamax shadow.
    const [picSHADOW, sprSHADOW] = this.dxSetSprite(this.shadowFile, delay, centerX, centerY, false, 0, 0);
    const shadowOffset = Math.floor(bitmapWidth(ps[sprSHADOW]) / 2);
    const shadowX = ps[sprSHADOW]!.x - shadowOffset;
    let shadowY = ps[sprSHADOW]!.y;
    picSHADOW.setXY(delay, shadowX, shadowY);
    //---------------------------------------------------------------------------
    // Sets up Dynamax Pokemon.
    const arrPOKE = this.dxSetPokemonWithOutline(this.dynamax, delay, !this.opposes);
    arrPOKE[arrPOKE.length - 1]![0].setColor(delay, WHITE());
    for (const [p, s] of arrPOKE) {
      ps[s]!.y += 30;
      applyDynamax(ps[s] as never, this.pkmn);
      p.setXY(delay, ps[s]!.x, ps[s]!.y);
      p.setZoom(delay, 0);
      p.setOpacity(delay, 0);
    }
    //---------------------------------------------------------------------------
    // Sets up pulse.
    const picPULSE = this.dxSetSprite(this.path + "pulse", delay, centerX, centerY, false, 100, 50)[0];
    //---------------------------------------------------------------------------
    // Sets up base.
    const baseData = this.dxSetBases(this.path + "Dynamax/base", this.baseFile, delay, centerX, centerY);
    const picBASE = baseData[0][0]!;
    const sprBASE = this.pictureEx.length - 1;
    ps[sprBASE]!.x = centerX - Math.floor(bitmapWidth(ps[sprBASE]) / 2);
    const baseX = ps[sprBASE]!.x, baseY = ps[sprBASE]!.y;
    picBASE.setXY(delay, baseX, baseY);
    //---------------------------------------------------------------------------
    // Sets up battler.
    const picPOKE = this.dxSetPokemon(this.pkmn, delay, !this.opposes)[0];
    //---------------------------------------------------------------------------
    // Sets up trainer
    const [picTRAINER, sprTRAINER] = this.dxSetSprite(this.trainerFile ?? "", delay, centerX, 138);
    let offset: number;
    if (this.opposes) {
      offset = 64;
      ps[sprTRAINER]!.x = SCREEN_W;
    } else {
      offset = -64;
      ps[sprTRAINER]!.mirror = true;
      ps[sprTRAINER]!.x = -bitmapWidth(ps[sprTRAINER]);
    }
    const trainerX = ps[sprTRAINER]!.x, trainerY = ps[sprTRAINER]!.y;
    const trainerEndX = centerX - Math.floor(bitmapWidth(ps[sprTRAINER]) / 2);
    picTRAINER.setXY(delay, trainerX, trainerY);
    picTRAINER.setOrigin(delay, PictureOrigin.TOP_LEFT);
    //---------------------------------------------------------------------------
    // Sets up Dynamax Band
    const arrITEM = this.dxSetSpriteWithOutline(this.itemFile, delay, centerX, 130);
    //---------------------------------------------------------------------------
    // Sets Poke Ball.
    const [picBALL, sprBALL] = this.dxSetSprite(this.ballFile, delay, centerX + 112, centerY + 55);
    const ballX = ps[sprBALL]!.x, ballY = ps[sprBALL]!.y;
    picBALL.setSrcSize(delay, 32, 64);
    //---------------------------------------------------------------------------
    // Sets up skip button & fade out.
    const picBUTTON = this.dxSetSkipButton(delay);
    const picFADE = this.dxSetFade(delay);
    //############################################################################
    // Animation start.
    //############################################################################
    // Fades in scene.
    picFADE.moveOpacity(delay, 8, 255);
    delay = picFADE.totalDuration();
    picBG.setVisible(delay, true);
    picBASE.setVisible(delay, true);
    picPOKE.setVisible(delay, true);
    picBALL.setVisible(delay, true);
    picFADE.moveOpacity(delay, 8, 0);
    delay = picFADE.totalDuration();
    picBUTTON.moveXY(delay, 6, 0, SCREEN_H - 38);
    picBUTTON.moveXY(delay + 36, 6, 0, SCREEN_H);
    //---------------------------------------------------------------------------
    // Opens Poke Ball; begins recall of Pokemon.
    picPOKE.moveColor(delay, 4, new Color(31 * 8, 22 * 8, 30 * 8, 255));
    delay = picPOKE.totalDuration();
    picPOKE.setSE(delay, "Battle recall");
    picBALL.setName(delay, this.ballFile + "_open");
    picBALL.setSrcSize(delay, 32, 64);
    //---------------------------------------------------------------------------
    // Shrink and move Pokemon sprite to ball; close ball.
    picPOKE.moveZoom(delay, 6, 0);
    picPOKE.moveXY(delay, 6, centerX, ballY);
    picPOKE.setVisible(delay + 6, false);
    delay = picPOKE.totalDuration() + 1;
    picBALL.setName(delay, this.ballFile);
    picBALL.setSrcSize(delay, 32, 64);
    //---------------------------------------------------------------------------
    // Slides trainer on screen; shifts ball over.
    picBALL.moveXY(delay, 8, ballX + -offset, ballY);
    picTRAINER.setVisible(delay + 6, true);
    picTRAINER.moveXY(delay + 6, 12, trainerEndX, trainerY);
    delay = picTRAINER.totalDuration() + 1;
    //---------------------------------------------------------------------------
    // Dynamax Band appears with outline; slides upwards.
    picBALL.setSE(delay, "DX Power Up");
    for (const [p, s] of arrITEM) {
      p.setVisible(delay, true);
      p.moveXY(delay, 15, ps[s]!.x, ps[s]!.y - 20);
      p.moveOpacity(delay, 15, 255);
    }
    delay = arrITEM[arrITEM.length - 1]![0].totalDuration() + 1;
    //---------------------------------------------------------------------------
    // Poke Ball enlarges and changes color.
    picBALL.setSE(delay, "Anim/Psych Up", 100);
    picBALL.moveZoom(delay, 6, 150);
    const enlargeX = this.opposes ? -8 : 120;
    picBALL.moveXY(delay, 6, ballX + enlargeX, ballY);
    picBALL.moveColor(delay, 6, new Color(255, 51, 153, 180));
    delay = picBALL.totalDuration() + 6;
    picBALL.setVisible(delay, false);
    for (const [p] of arrITEM) p.setVisible(delay, false);
    //---------------------------------------------------------------------------
    // Overlay flashes; trainer and base zoom off screen.
    picBG.moveZoom(delay, 6, zoomBG * 150);
    picOVERLAY.setVisible(delay, true);
    picOVERLAY.moveOpacity(delay, 6, 255);
    picBASE.moveZoom(delay, 6, 600);
    picBASE.setOpacity(delay + 6, 0);
    if (this.opposes) picTRAINER.moveXY(delay, 6, trainerEndX + 128, trainerY);
    picTRAINER.moveZoom(delay, 6, 600);
    picTRAINER.setSE(delay, "Battle throw", 100);
    picTRAINER.setVisible(delay + 6, false);
    delay = picTRAINER.totalDuration();
    //---------------------------------------------------------------------------
    // Base reappears to serve as the "landing" spot for Poke Ball.
    const bgX = -(SCREEN_W / 4), bgY = -(SCREEN_H / 4);
    picBG.setXY(delay, bgX, bgY);
    picBASE.setXY(delay, baseX, baseY);
    picBASE.setZoom(delay, 100);
    picBASE.moveOpacity(delay, 6, 255);
    picOVERLAY.moveOpacity(delay, 6, 0);
    picOVERLAY.setVisible(delay + 4, false);
    delay = picOVERLAY.totalDuration() + 20;
    //---------------------------------------------------------------------------
    // Poke Ball drops, sinks into base, and shakes screen.
    const newBallX = ballX + enlargeX + offset;
    picBALL.setVisible(delay, true);
    picBALL.setXY(delay, newBallX, -32);
    delay = picBALL.totalDuration() + 2;
    for (let i = 0; i < 4; i++) {
      const t = [4, 4, 3, 2][i]!;
      const d = [1, 2, 4, 8][i]!;
      if (i === 0) delay -= t;
      if (i > 0) {
        picBG.moveXY(delay, t, bgX, bgY - Math.floor(100 / d));
        picBASE.moveXY(delay, t, baseX, baseY - Math.floor(100 / d));
        picBALL.moveXY(delay, t, newBallX, ballY - Math.floor(100 / d));
      } else {
        picBALL.setSrcSize(delay + (2 * t), 32, 40);
        picBALL.setSE(delay + (2 * t), "Anim/Earth1");
      }
      picBG.moveXY(delay + t, t, bgX, bgY);
      picBASE.moveXY(delay + t, t, baseX, baseY);
      picBALL.moveXY(delay + t, t, newBallX, ballY);
      delay = picBALL.totalDuration();
    }
    //---------------------------------------------------------------------------
    // Poke Ball opens.
    delay += 10;
    picBASE.moveOpacity(delay, 4, 0);
    for (const [p] of arrPOKE) {
      p.setVisible(delay, true);
      p.setXY(delay, centerX, centerY + 100);
    }
    picBALL.setSE(delay, "Battle recall");
    picBALL.setName(delay, this.ballFile + "_open");
    picBALL.setSrcSize(delay, 32, 40);
    picBALL.moveOpacity(delay, 4, 0);
    //---------------------------------------------------------------------------
    // Dynamax Pokemon zooms out of ball; shadow expands along with Pokemon.
    picSHADOW.setVisible(delay, true);
    shadowY *= 1.5;
    picSHADOW.setXY(delay, shadowX + shadowOffset, shadowY);
    picSHADOW.moveZoom(delay, 20, 200);
    picSHADOW.moveOpacity(delay, 20, 100);
    for (const [p, s] of arrPOKE) {
      p.setSE(delay, "Anim/Psych Up", 100, 60);
      p.moveXY(delay, 20, ps[s]!.x, ps[s]!.y);
      p.moveZoom(delay, 20, 150);
      p.moveOpacity(delay + 4, 6, 255);
    }
    //---------------------------------------------------------------------------
    // Background zooms out along with Pokemon; color and tone changes.
    delay += 4;
    picBG.moveXY(delay, 20, -4, -4);
    picBG.moveZoom(delay, 20, zoomBG * 100);
    let bgColor = this.calyrex ? new Color(0, 204, 204, 245) : new Color(255, 51, 153, 245);
    picBG.moveColor(delay, 20, bgColor);
    picBG.moveTone(delay, 10, new Tone(100, 100, 100, 100));
    //---------------------------------------------------------------------------
    // Trainer and the base zoom back in from off screen.
    const trainerX2 = this.opposes ? offset * 2 + 32 : offset / 2;
    const newTrainerX = trainerEndX + trainerX2, newTrainerY = trainerY + 160;
    picBASE.setOrigin(delay, PictureOrigin.CENTER);
    picBASE.setXY(delay, newTrainerX, newTrainerY + 228);
    picBASE.setZoom(delay, 600);
    picBASE.moveZoom(delay, 16, 50);
    picBASE.moveXY(delay, 16, newTrainerX, newTrainerY + 32);
    picBASE.moveOpacity(delay, 16, 255);
    picTRAINER.setVisible(delay, true);
    picTRAINER.setOrigin(delay, PictureOrigin.CENTER);
    picTRAINER.setXY(delay, newTrainerX, newTrainerY);
    picTRAINER.moveZoom(delay, 16, 50);
    delay = picBG.totalDuration() + 4;
    //---------------------------------------------------------------------------
    // Changes the tone and color of the background and base. Flashes overlay.
    bgColor = this.calyrex ? new Color(0, 204, 204, 80) : new Color(255, 51, 153, 80);
    picOVERLAY.setOpacity(delay, 255);
    if (!this.calyrex) picOVERLAY.setColor(delay, new Color(255, 51, 153, 200));
    picBG.setName(delay, "Graphics/Pictures/evolutionbg");
    picBG.setZoom(delay, 110);
    picBG.setXY(delay, -25, -19);
    picBG.moveColor(delay, 10, bgColor);
    picBG.moveTone(delay, 10, new Tone(-200, -200, -200));
    picBASE.moveColor(delay, 10, bgColor);
    picBASE.moveTone(delay, 10, new Tone(-100, -100, -100));
    //---------------------------------------------------------------------------
    // Shakes screen; plays Pokemon cry while flashing overlay. Fades out.
    delay = picBG.totalDuration() + 12;
    for (let i = 0; i < 6; i++) {
      const t = [4, 4, 3, 2, 2, 2][i]!;
      const d = [2, 4, 4, 4, 8, 8][i]!;
      if (i === 0) delay -= t;
      if (i > 0) {
        picOVERLAY.moveOpacity(delay + 2, t, 240);
        picBG.moveXY(delay, t, -25, -Math.floor(100 / d));
        picBASE.moveXY(delay, t, newTrainerX, (newTrainerY + 32) - Math.floor(100 / d));
        picTRAINER.moveXY(delay, t, newTrainerX, newTrainerY - Math.floor(100 / d));
        for (const [p, s] of arrPOKE) p.moveXY(delay + 2, t, ps[s]!.x, ps[s]!.y - Math.floor(200 / d));
      } else {
        picOVERLAY.setVisible(delay, true);
        picPULSE.setVisible(delay, true);
        picPULSE.moveZoom(delay, 10, 1000);
        picPULSE.moveOpacity(delay + 2, 10, 0);
        dynamaxCryAndOutline(arrPOKE, delay, t, this.dynamax, this.cryFile, this.calyrex);
      }
      picOVERLAY.moveOpacity(delay + t, t, 160);
      picBG.moveXY(delay + t, t, -25, -19);
      picBASE.moveXY(delay + t, t, newTrainerX, newTrainerY + 32);
      picTRAINER.moveXY(delay + t, t, newTrainerX, newTrainerY);
      for (const [p, s] of arrPOKE) p.moveXY(delay + t, t, ps[s]!.x, ps[s]!.y);
      delay = arrPOKE[arrPOKE.length - 1]![0].totalDuration();
    }
    picOVERLAY.moveOpacity(delay, 4, 0);
    picFADE.moveOpacity(delay + 20, 8, 255);
  }
}

/** The first shake of both animations: the cry (lower-pitched without G-Max) and the outline colour. */
function dynamaxCryAndOutline(arrPOKE: [import("../../../ui/scenes/PictureEx").PictureEx, number][], delay: number, t: number,
  dynamax: unknown[], cryFile: string | null, calyrex: boolean): void {
  for (let i = 0; i < arrPOKE.length; i++) {
    if (i === arrPOKE.length - 1) {
      if (dynamax[dynamax.length - 1]) {
        if (cryFile) arrPOKE[i]![0].setSE(delay + (2 * t), cryFile);
      } else {
        if (cryFile) arrPOKE[i]![0].setSE(delay + (2 * t), cryFile, 100, 60);
      }
      arrPOKE[i]![0].setSE(delay + (2 * t), "Anim/Explosion3");
      arrPOKE[i]![0].moveColor(delay, 5, new Color(31 * 8, 22 * 8, 30 * 8, 0));
    } else {
      const outlineColor = calyrex ? new Color(36, 243, 243) : new Color(250, 57, 96);
      arrPOKE[i]![0].moveColor(delay, 5, outlineColor);
    }
  }
}

//===============================================================================
// Battle animation for triggering Dynamax. (Wild Pokemon)
//===============================================================================
export class BattlerDynamaxWild extends Animation {
  private pkmn: Pokemon;
  private dynamax: unknown[];
  private shadowFile: string;
  private cryFile: string | null;
  private calyrex: boolean;
  private path: string;
  private bgFile: string;
  private baseFile: string;

  constructor(sprites: SceneSprites, viewport: Viewport | null, idxBattler: number, battle: Battle) {
    super(sprites, viewport);
    //---------------------------------------------------------------------------
    // Gets Pokemon data from battler index.
    const battler = battle.battlers[idxBattler]!;
    this.opposes = battle.opposes(idxBattler);
    this.pkmn = cinematicPokemon(battler);
    this.dynamax = dynamaxSpriteParams(battler, this.pkmn);
    this.shadowFile = shadowFilename(this.pkmn.species, this.pkmn.form, true) ?? "";
    this.cryFile = SpeciesFiles.cryFilename(this.pkmn.species, this.pkmn.form, null, this.dynamax[3], this.dynamax[4],
      true, this.dynamax[this.dynamax.length - 1]);
    this.calyrex = this.pkmn.isSpecies("CALYREX");
    //---------------------------------------------------------------------------
    // Gets background and animation data.
    this.path = DX_ANIM_PATH;
    const [backdropFilename, baseFilename] = pbGetBattlefieldFiles(battle);
    this.bgFile = "Graphics/Battlebacks/" + backdropFilename + "_bg";
    this.baseFile = "Graphics/Battlebacks/" + baseFilename + "_base1";
    this.createProcesses();
  }

  override createProcesses(): void {
    let delay = 0;
    const centerX = SCREEN_W / 2, centerY = SCREEN_H / 2;
    const ps = this.pictureSprites;
    //---------------------------------------------------------------------------
    // Sets up background.
    const picBG = this.dxSetBackdrop(this.path + "Dynamax/bg", this.bgFile, delay)[0];
    const zoomBG = assetExists(this.path + "Dynamax/bg") ? 1 : 1.5;
    //---------------------------------------------------------------------------
    // Sets up base.
    const baseData = this.dxSetBases(this.path + "Dynamax/base", this.baseFile, delay, centerX, centerY + 30);
    const picBASE = baseData[0][0]!;
    const sprBASE = this.pictureEx.length - 1;
    ps[sprBASE]!.x = centerX - Math.floor(bitmapWidth(ps[sprBASE]) / 2);
    picBASE.setXY(delay, ps[sprBASE]!.x, ps[sprBASE]!.y);
    //---------------------------------------------------------------------------
    // Sets up Dynamax shadow.
    const [picSHADOW, sprSHADOW] = this.dxSetSprite(this.shadowFile, delay, centerX, centerY, false, 0, 0);
    const shadowOffset = Math.floor(bitmapWidth(ps[sprSHADOW]) / 2);
    const shadowX = ps[sprSHADOW]!.x - shadowOffset;
    const shadowY = ps[sprSHADOW]!.y;
    picSHADOW.setXY(delay, shadowX, shadowY);
    //---------------------------------------------------------------------------
    // Sets up overlay.
    const picOVERLAY = this.dxSetOverlay(this.path + "burst", delay)[0];
    //---------------------------------------------------------------------------
    // Sets up battler.
    const [picPOKE, sprPOKE] = this.dxSetPokemon(this.pkmn, delay, !this.opposes);
    ps[sprPOKE]!.y += 30;
    picPOKE.setXY(delay, ps[sprPOKE]!.x, ps[sprPOKE]!.y);
    //---------------------------------------------------------------------------
    // Sets up Dynamax Pokemon.
    const arrPOKE = this.dxSetPokemonWithOutline(this.dynamax, delay, !this.opposes);
    arrPOKE[arrPOKE.length - 1]![0].setColor(delay, WHITE());
    for (const [p, s] of arrPOKE) {
      ps[s]!.y += 30;
      applyDynamax(ps[s] as never, this.pkmn);
      p.setXY(delay, ps[s]!.x, ps[s]!.y);
    }
    //---------------------------------------------------------------------------
    // Sets up pulse.
    const picPULSE = this.dxSetSprite(this.path + "pulse", delay, centerX, centerY, false, 100, 50)[0];
    //---------------------------------------------------------------------------
    // Sets up skip button & fade out.
    const picBUTTON = this.dxSetSkipButton(delay);
    const picFADE = this.dxSetFade(delay);
    //############################################################################
    // Animation start.
    //############################################################################
    // Fades in scene.
    picFADE.moveOpacity(delay, 8, 255);
    delay = picFADE.totalDuration();
    picBG.setVisible(delay, true);
    picBASE.setVisible(delay, true);
    picPOKE.setVisible(delay, true);
    picFADE.moveOpacity(delay, 8, 0);
    delay = picFADE.totalDuration();
    picBUTTON.moveXY(delay, 6, 0, SCREEN_H - 38);
    picBUTTON.moveXY(delay + 36, 6, 0, SCREEN_H);
    //---------------------------------------------------------------------------
    // Changes the tone and color of the background, base and Pokemon.
    let bgColor = this.calyrex ? new Color(0, 204, 204, 245) : new Color(255, 51, 153, 245);
    picBG.moveColor(delay, 15, bgColor);
    picBG.moveTone(delay, 15, new Tone(-200, -200, -200));
    picBASE.moveColor(delay, 15, bgColor);
    picBASE.moveTone(delay, 15, new Tone(-200, -200, -200));
    picPOKE.moveTone(delay, 15, new Tone(255, 255, 255, 255));
    delay = picPOKE.totalDuration();
    //---------------------------------------------------------------------------
    // Dynamax Pokemon is shown and begins to enlarge along with a shadow.
    picSHADOW.setVisible(delay, true);
    picSHADOW.setXY(delay, shadowX + shadowOffset, shadowY * 1.5);
    picSHADOW.moveZoom(delay, 20, 200);
    picSHADOW.moveOpacity(delay, 20, 100);
    picBASE.setVisible(delay, false);
    picPOKE.setVisible(delay + 1, false);
    for (const [p] of arrPOKE) {
      p.setVisible(delay, true);
      p.setSE(delay, "Anim/Psych Up", 100, 60);
      p.moveZoom(delay, 20, 150);
    }
    delay += 4;
    picBG.moveXY(delay, 20, -4, -4);
    picBG.moveZoom(delay, 20, zoomBG * 100);
    delay = picBG.totalDuration() + 4;
    //---------------------------------------------------------------------------
    // Changes the tone and color of the background. Shows overlay.
    bgColor = this.calyrex ? new Color(0, 204, 204, 80) : new Color(255, 51, 153, 80);
    picOVERLAY.setOpacity(delay, 255);
    if (!this.calyrex) picOVERLAY.setColor(delay, new Color(255, 51, 153, 200));
    picBG.setName(delay, "Graphics/Pictures/evolutionbg");
    picBG.setZoom(delay, 110);
    picBG.setXY(delay, -25, -19);
    picBG.moveColor(delay, 10, bgColor);
    picBG.moveTone(delay, 10, new Tone(-200, -200, -200));
    //---------------------------------------------------------------------------
    // Shakes screen; plays Pokemon cry while flashing overlay. Fades out.
    delay = picBG.totalDuration() + 12;
    for (let i = 0; i < 6; i++) {
      const t = [4, 4, 3, 2, 2, 2][i]!;
      const d = [2, 4, 4, 4, 8, 8][i]!;
      if (i === 0) delay -= t;
      if (i > 0) {
        picOVERLAY.moveOpacity(delay + 2, t, 240);
        picBG.moveXY(delay, t, -25, -Math.floor(100 / d));
        for (const [p, s] of arrPOKE) p.moveXY(delay + 2, t, ps[s]!.x, ps[s]!.y - Math.floor(200 / d));
      } else {
        picOVERLAY.setVisible(delay, true);
        picPULSE.setVisible(delay, true);
        picPULSE.moveZoom(delay, 10, 1000);
        picPULSE.moveOpacity(delay + 2, 10, 0);
        dynamaxCryAndOutline(arrPOKE, delay, t, this.dynamax, this.cryFile, this.calyrex);
      }
      picOVERLAY.moveOpacity(delay + t, t, 160);
      picBG.moveXY(delay + t, t, -25, -19);
      for (const [p, s] of arrPOKE) p.moveXY(delay + t, t, ps[s]!.x, ps[s]!.y);
      delay = arrPOKE[arrPOKE.length - 1]![0].totalDuration();
    }
    picOVERLAY.moveOpacity(delay, 4, 0);
    picFADE.moveOpacity(delay + 20, 8, 255);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bitmapWidth = (s: any): number => s?.bitmap?.width ?? 0;
