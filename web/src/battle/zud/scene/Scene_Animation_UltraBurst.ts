// Port of Plugins/ZUD Mechanics/[005] Battle_Scene/Scene_Animation_UltraBurst.rb:
// Battle::Scene::Animation::BattlerUltraBurst. The scene method that plays it
// is in Scene.ts.

import type { Pokemon } from "../../../game/pokemon/Pokemon";
import type { Viewport } from "../../../rgss/display";
import { Color, Tone } from "../../../rgss/types";
import { SpeciesFiles } from "../../../ui/sprites/pokemonSprite";
import type { Battle } from "../../battle/Battle";
import { Animation, DX_ANIM_PATH, type SceneSprites } from "../../scene/animationBase";
import { pbGetBattlefieldFiles } from "./Scene_Animation_Dynamax";

const SCREEN_W = 512;
const SCREEN_H = 384;

/** The Ultra form's species parameters: [species, gender, form, shiny, shadow]. */
export function ultraSpriteParams(pkmn: Pokemon): unknown[] {
  return [pkmn.species, pkmn.gender, pkmn.getUltraForm(), pkmn.shiny, pkmn.shadowPokemon()];
}

//===============================================================================
// Battle animation for triggering Ultra Burst.
//===============================================================================
export class BattlerUltraBurst extends Animation {
  private pkmn: Pokemon;
  private ultra: unknown[];
  private cryFile: string | null;
  private path: string;
  private bgFile: string;
  private baseFile: string;

  constructor(sprites: SceneSprites, viewport: Viewport | null, idxBattler: number, battle: Battle) {
    super(sprites, viewport);
    //---------------------------------------------------------------------------
    // Gets Pokemon data from battler index.
    const battler = battle.battlers[idxBattler]!;
    this.opposes = battle.opposes(idxBattler);
    this.pkmn = battler.pokemon!;
    this.ultra = ultraSpriteParams(this.pkmn);
    this.cryFile = SpeciesFiles.cryFilename(this.ultra[0], this.ultra[2]);
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
    const picBG = this.dxSetBackdrop(this.path + "Ultra/bg", this.bgFile, delay)[0];
    //---------------------------------------------------------------------------
    // Sets up bases.
    const arrBASES = this.dxSetBases(this.path + "Ultra/base", this.baseFile, delay, centerX, centerY)[0];
    //---------------------------------------------------------------------------
    // Sets up overlay.
    const picOVERLAY = this.dxSetOverlay(this.path + "burst", delay)[0];
    //---------------------------------------------------------------------------
    // Sets up shine.
    const picSHINE = this.dxSetSprite(this.path + "shine", delay, centerX, centerY)[0];
    //---------------------------------------------------------------------------
    // Sets up battler.
    const [picPOKE, sprPOKE] = this.dxSetPokemon(this.pkmn, delay, !this.opposes);
    //---------------------------------------------------------------------------
    // Sets up Ultra Pokemon.
    const arrPOKE = this.dxSetPokemonWithOutline(this.ultra, delay, !this.opposes);
    //---------------------------------------------------------------------------
    // Sets up pulse.
    const picPULSE = this.dxSetSprite(this.path + "pulse", delay, centerX, centerY, false, 100, 50)[0];
    //---------------------------------------------------------------------------
    // Sets up Ultra icon.
    const picICON = this.dxSetSprite(this.path + "Ultra/icon", delay, centerX, centerY, false, 0)[0];
    //---------------------------------------------------------------------------
    // Sets up particles.
    const arrPARTICLES = this.dxSetParticlesRect(this.path + "Ultra/particles", delay, 154, 128, 200, false, true);
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
    arrBASES[0]!.setVisible(delay, true);
    picPOKE.setVisible(delay, true);
    picFADE.moveOpacity(delay, 8, 0);
    delay = picFADE.totalDuration();
    picBUTTON.moveXY(delay, 6, 0, SCREEN_H - 38);
    picBUTTON.moveXY(delay + 26, 6, 0, SCREEN_H);
    //---------------------------------------------------------------------------
    // Darkens background/base tone; begins zooming in ultra particles.
    picPOKE.setSE(delay, "DX Power Up");
    picBG.moveTone(delay, 15, new Tone(-200, -200, -200));
    arrBASES[0]!.moveTone(delay, 15, new Tone(-200, -200, -200));
    let repeat = delay;
    for (let t = 0; t < 2; t++) {
      if (t > 0) repeat -= 4;
      arrPARTICLES.forEach((p, i) => {
        p[0].setVisible(repeat + i, true);
        p[0].setXY(repeat + i, p[1], p[2]);
        p[0].moveXY(repeat + i, 4, centerX, centerY);
        p[0].moveZoom(repeat + i, 4, 0);
        repeat = p[0].totalDuration();
        p[0].setVisible(repeat + i, false);
        p[0].setXY(repeat + i, p[1], p[2]);
        p[0].setZoom(repeat + i, 100);
        repeat = p[0].totalDuration() - 2;
      });
    }
    //---------------------------------------------------------------------------
    // Shakes Pokemon; changes tone to white; shows and zooms in ultra icon.
    const t = 0.5;
    for (let i = 0; i < 16; i++) {
      picPOKE.moveXY(delay, t, ps[sprPOKE]!.x, ps[sprPOKE]!.y + 2);
      picPOKE.moveXY(delay + t, t, ps[sprPOKE]!.x, ps[sprPOKE]!.y - 2);
      delay = picPOKE.totalDuration();
      if (i === 0) {
        picICON.setVisible(delay + 8, true);
        picICON.moveOpacity(delay + 8, 16, 255);
        picICON.moveZoom(delay + 8, 16, 50);
      }
    }
    picPOKE.moveTone(delay - 8, 2, new Tone(255, 255, 255, 255));
    //---------------------------------------------------------------------------
    // White screen flash; hides icon; reveals Ultra Pokemon with outline.
    picFADE.setColor(delay + 8, new Color(255, 255, 255));
    picFADE.moveOpacity(delay + 8, 12, 255);
    delay = picFADE.totalDuration();
    picPOKE.setVisible(delay, false);
    picICON.setVisible(delay, false);
    for (const [p] of arrPOKE) p.setVisible(delay, true);
    picFADE.moveOpacity(delay, 6, 0);
    picFADE.setColor(delay + 6, new Color(0, 0, 0));
    delay = picFADE.totalDuration();
    //---------------------------------------------------------------------------
    // Shakes Pokemon; plays cry; flashes overlay. Fades out.
    picOVERLAY.setVisible(delay, true);
    picSHINE.setVisible(delay, true);
    picPULSE.setVisible(delay, true);
    picPULSE.moveZoom(delay, 5, 1000);
    picPULSE.moveOpacity(delay + 2, 5, 0);
    for (let i = 0; i < 16; i++) {
      if (i > 0) {
        for (const [p, s] of arrPOKE) p.moveXY(delay, t, ps[s]!.x, ps[s]!.y + 2);
        for (const [p, s] of arrPOKE) p.moveXY(delay + t, t, ps[s]!.x, ps[s]!.y - 2);
        picOVERLAY.moveOpacity(delay + t, 2, 160);
        picSHINE.moveOpacity(delay + t, 2, 160);
      } else {
        if (this.cryFile) picPOKE.setSE(delay + t, this.cryFile);
      }
      picOVERLAY.moveOpacity(delay + t, 2, 240);
      picSHINE.moveOpacity(delay + t, 2, 240);
      delay = arrPOKE[arrPOKE.length - 1]![0].totalDuration();
    }
    picOVERLAY.moveOpacity(delay, 4, 0);
    picSHINE.moveOpacity(delay, 4, 0);
    picFADE.moveOpacity(delay + 20, 8, 255);
  }
}
