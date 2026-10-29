// Port of Plugins/ZUD Mechanics/[005] Battle_Scene/Scene_Animation_ZMove.rb:
// Battle::Scene::Animation::BattlerZMove (the trainer raises the Z-Ring, the
// Pokémon gathers Z-Power, the Z-Move's title). The scene method that plays it
// is in Scene.ts; pbGetTypeColors is Essentials Deluxe's ([000] Battle_Scene.rb:653).

import type { Id } from "../../../data/gameData/gameData";
import { Move as MoveData } from "../../../data/gameData/move";
import { TrainerType } from "../../../data/gameData/trainerType";
import type { Pokemon } from "../../../game/pokemon/Pokemon";
import type { Viewport } from "../../../rgss/display";
import { Color, Tone } from "../../../rgss/types";
import { resolveBitmap } from "../../../ui/sprites/pokemonIcon";
import { SpeciesFiles } from "../../../ui/sprites/pokemonSprite";
import type { Battle } from "../../battle/Battle";
import type { Battler } from "../../battler/Battler";
import { Animation, DX_ANIM_PATH, type SceneSprites } from "../../scene/animationBase";
import { cinematicPokemon, pbGetBattlefieldFiles, trainerItemFor } from "./Scene_Animation_Dynamax";

const SCREEN_W = 512;
const SCREEN_H = 384;

/** pbGetTypeColors(type): [outline, bg] RGB triples. */
export function pbGetTypeColors(type: Id | null): [[number, number, number], [number, number, number]] {
  switch (type) {
    case "NORMAL": return [[216, 216, 192], [168, 168, 120]];
    case "FIGHTING": return [[240, 128, 48], [192, 48, 40]];
    case "FLYING": return [[200, 192, 248], [168, 144, 240]];
    case "POISON": return [[216, 128, 184], [160, 64, 160]];
    case "GROUND": return [[248, 248, 120], [224, 192, 104]];
    case "ROCK": return [[224, 192, 104], [184, 160, 56]];
    case "BUG": return [[216, 224, 48], [168, 184, 32]];
    case "GHOST": return [[168, 144, 240], [112, 88, 152]];
    case "STEEL": return [[216, 216, 192], [184, 184, 208]];
    case "FIRE": return [[248, 208, 48], [240, 128, 48]];
    case "WATER": return [[152, 216, 216], [104, 144, 240]];
    case "GRASS": return [[192, 248, 96], [120, 200, 80]];
    case "ELECTRIC": return [[248, 248, 120], [248, 208, 48]];
    case "PSYCHIC": return [[248, 192, 176], [248, 88, 136]];
    case "ICE": return [[208, 248, 232], [152, 216, 216]];
    case "DRAGON": return [[184, 160, 248], [112, 56, 248]];
    case "DARK": return [[168, 168, 120], [112, 88, 72]];
    case "FAIRY": return [[248, 216, 224], [240, 168, 176]];
  }
  return [[255, 255, 255], [200, 200, 200]];
}

/** The Z-Move titles shown at the top of the screen instead of the bottom. */
const UPPER_TITLES = ["CATASTROPIKA", "TENMILLIONVOLTTHUNDERBOLT", "LETSSNUGGLEFOREVER"];

//===============================================================================
// Battle animation for triggering Z-Moves.
//===============================================================================
export class BattlerZMove extends Animation {
  private battler: Battler;
  private pkmn: Pokemon;
  private cryFile: string | null;
  private zcrystalFile: string | null = null;
  private trainerFile: string | null = null;
  private itemFile: string | null = null;
  private path: string;
  private titleFile: string;
  private upperTitle: boolean;
  private bgFile: string;
  private baseFile: string;
  private typeOutline: [number, number, number];
  private typeBg: [number, number, number];

  //-----------------------------------------------------------------------------
  // Initializes data used for the animation.
  //-----------------------------------------------------------------------------
  constructor(sprites: SceneSprites, viewport: Viewport | null, idxBattler: number, battle: Battle, moveId: Id) {
    super(sprites, viewport);
    //---------------------------------------------------------------------------
    // Gets Pokemon data from battler index.
    this.battler = battle.battlers[idxBattler]!;
    this.opposes = battle.opposes(idxBattler);
    this.pkmn = cinematicPokemon(this.battler);
    this.cryFile = SpeciesFiles.cryFilenameFromPokemon(this.pkmn);
    if (this.battler.item && this.battler.item.isZCrystal()) {
      this.zcrystalFile = "Graphics/Items/" + this.battler.itemId;
    }
    //---------------------------------------------------------------------------
    // Gets trainer data from battler index.
    if (!this.battler.wild()) {
      const trainer = battle.pbGetOwnerFromBattlerIndex(idxBattler)!;
      this.trainerFile = TrainerType.frontSpriteFilename(trainer.trainerType, resolveBitmap);
      this.itemFile = "Graphics/Items/" + trainerItemFor(battle, idxBattler, "ZRing", "ZRING");
    }
    //---------------------------------------------------------------------------
    // Gets background and animation data.
    this.path = DX_ANIM_PATH;
    this.titleFile = this.path + "Z-Move/Z-Titles/" + moveId;
    this.upperTitle = UPPER_TITLES.includes(moveId);
    const [backdropFilename, baseFilename] = pbGetBattlefieldFiles(battle);
    this.bgFile = "Graphics/Battlebacks/" + backdropFilename + "_bg";
    this.baseFile = "Graphics/Battlebacks/" + baseFilename + "_base1";
    [this.typeOutline, this.typeBg] = pbGetTypeColors(MoveData.get(moveId).type);
    this.createProcesses();
  }

  //-----------------------------------------------------------------------------
  // Plays the animation.
  //-----------------------------------------------------------------------------
  override createProcesses(): void {
    let delay = 0;
    const centerX = SCREEN_W / 2, centerY = SCREEN_H / 2;
    const ps = this.pictureSprites;
    const wild = this.battler.wild();
    //---------------------------------------------------------------------------
    // Sets up background.
    const picBG = this.dxSetBackdrop(this.path + "Z-Move/bg", this.bgFile, delay)[0];
    //---------------------------------------------------------------------------
    // Sets up bases.
    const [arrBASES, trBaseOffset] = this.dxSetBases(this.path + "Z-Move/base", this.baseFile, delay, centerX, centerY, !wild);
    //---------------------------------------------------------------------------
    // Sets up trainer & Z-Ring
    let picTRAINER = null, trainerEndX = 0, trainerY = 0, arrITEM: ReturnType<Animation["dxSetSpriteWithOutline"]> = [];
    if (!wild) {
      [picTRAINER, trainerEndX, trainerY, arrITEM] = this.dxSetTrainerWithItem(this.trainerFile ?? "", this.itemFile!, delay, !this.opposes);
    }
    //---------------------------------------------------------------------------
    // Sets up overlay.
    const picOVERLAY = this.dxSetOverlay(this.path + "burst", delay)[0];
    //---------------------------------------------------------------------------
    // Sets up battler.
    const arrPOKE = this.dxSetPokemonWithOutline(this.pkmn, delay, !this.opposes, !wild, new Color(...this.typeOutline));
    const lastPoke = arrPOKE[arrPOKE.length - 1]!;
    //---------------------------------------------------------------------------
    // Sets up Z-Crystal.
    const itemY = ps[lastPoke[1]]!.y - bitmapHeight(ps[lastPoke[1]]);
    const arrCRYSTAL = this.dxSetSpriteWithOutline(this.zcrystalFile, delay, centerX, itemY);
    //---------------------------------------------------------------------------
    // Sets particles.
    const arrPARTICLES = this.dxSetParticles(this.path + "Z-Move/particle", delay, centerX, centerY, 200);
    //---------------------------------------------------------------------------
    // Sets up pulse.
    const picPULSE = this.dxSetSprite(this.path + "pulse", delay, centerX, centerY, !wild, 100, 50)[0];
    //---------------------------------------------------------------------------
    // Sets Z-Move title.
    const arrTITLE = this.dxSetTitleWithOutline(this.titleFile, delay, this.upperTitle, new Color(...this.typeOutline));
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
    arrBASES[arrBASES.length - 1]!.setVisible(delay, true);
    lastPoke[0].setVisible(delay, true);
    picFADE.moveOpacity(delay, 8, 0);
    delay = picFADE.totalDuration();
    picBUTTON.moveXY(delay, 6, 0, SCREEN_H - 38);
    picBUTTON.moveXY(delay + 36, 6, 0, SCREEN_H);
    //---------------------------------------------------------------------------
    // Slides trainer on screen with base (non-wild only).
    if (!wild) {
      picTRAINER!.setVisible(delay + 4, true);
      arrBASES[0]!.setVisible(delay + 4, true);
      picTRAINER!.moveXY(delay + 4, 8, trainerEndX, trainerY);
      arrBASES[0]!.moveXY(delay + 4, 8, trainerEndX - trBaseOffset, centerY - 33);
      delay = picTRAINER!.totalDuration() + 1;
      //-------------------------------------------------------------------------
      // Z-Ring appears with outline; slide upwards.
      picTRAINER!.setSE(delay, "DX Power Up");
      for (const [p, s] of arrITEM) {
        p.setVisible(delay, true);
        p.moveXY(delay, 15, ps[s]!.x, ps[s]!.y - 20);
        p.moveOpacity(delay, 15, 255);
      }
      delay = picTRAINER!.totalDuration();
    }
    //---------------------------------------------------------------------------
    // Z-Crystal appears with outline; slide upwards.
    if (wild) picBG.setSE(delay, "DX Power Up");
    for (const [p, s] of arrCRYSTAL) {
      p.setVisible(delay, true);
      p.moveXY(delay, 15, ps[s]!.x, ps[s]!.y - 20);
      p.moveOpacity(delay, 15, 255);
    }
    //---------------------------------------------------------------------------
    // Particles begin traveling towards the Pokemon; overlay shown.
    picOVERLAY.setVisible(delay, true);
    picOVERLAY.moveOpacity(delay, 30, 255);
    let repeat = delay;
    for (let t = 0; t < 2; t++) {
      if (t > 0) repeat -= 4;
      arrPARTICLES.forEach((p, i) => {
        p[0].setVisible(repeat + i, true);
        p[0].moveXY(repeat + i, 4, centerX, centerY);
        repeat = p[0].totalDuration();
        p[0].setVisible(repeat + i, false);
        p[0].setXY(repeat + i, p[1], p[2]);
        p[0].setZoom(repeat + i, 100);
        repeat = p[0].totalDuration() - 2;
      });
    }
    //---------------------------------------------------------------------------
    // Background/base match move type color; Pokemon becomes white. Shakes Pokemon.
    picBG.moveColor(delay, 15, new Color(...this.typeBg, 180));
    picBG.moveTone(delay, 15, new Tone(-200, -200, -200));
    for (const p of arrBASES) {
      p.moveColor(delay, 15, new Color(...this.typeBg, 180));
      p.moveTone(delay, 15, new Tone(-200, -200, -200));
    }
    lastPoke[0].moveTone(delay, 15, new Tone(255, 255, 255, 255));
    delay = lastPoke[0].totalDuration();
    const t = 0.5;
    for (let i = 0; i < 16; i++) {
      for (const [p, s] of arrPOKE) p.moveXY(delay, t, ps[s]!.x, ps[s]!.y + 2);
      for (const [p, s] of arrPOKE) p.moveXY(delay + t, t, ps[s]!.x, ps[s]!.y - 2);
      delay = arrPOKE[0]![0].totalDuration();
    }
    //---------------------------------------------------------------------------
    // White screen flash; hides item sprites; reverts Pokemon tone; shows outline.
    picFADE.setColor(delay, new Color(255, 255, 255));
    picFADE.moveOpacity(delay, 12, 255);
    delay = picFADE.totalDuration();
    picOVERLAY.setVisible(delay, false);
    if (!wild) for (const [p] of arrITEM) p.setVisible(delay, false);
    for (const [p] of arrCRYSTAL) p.setVisible(delay, false);
    for (const [p] of arrPOKE) p.setVisible(delay, true);
    lastPoke[0].moveTone(delay, 6, new Tone(0, 0, 0, 0));
    picFADE.moveOpacity(delay, 6, 0);
    picFADE.setColor(delay + 6, new Color(0, 0, 0));
    delay = picFADE.totalDuration();
    //---------------------------------------------------------------------------
    // Z-Move title zooms on screen; shakes title and reveals name; fades out.
    if (arrTITLE.length > 0) {
      const lastTitle = arrTITLE[arrTITLE.length - 1]!;
      lastTitle[0].setSE(delay, "Z-Move Title");
      for (const [p] of arrTITLE) {
        p.setVisible(delay, true);
        p.moveOpacity(delay, 4, 255);
        p.moveZoom(delay, 4, 100);
      }
      delay = lastTitle[0].totalDuration();
      for (let i = 0; i < 16; i++) {
        for (const [p, s] of arrTITLE) p.moveXY(delay, t, ps[s]!.x + 8, ps[s]!.y);
        for (const [p, s] of arrTITLE) p.moveXY(delay + t, t, ps[s]!.x - 8, ps[s]!.y);
        delay = lastTitle[0].totalDuration();
      }
      picPULSE.setVisible(delay, true);
      picPULSE.moveZoom(delay, 5, 1000);
      picPULSE.moveOpacity(delay + 2, 5, 0);
      for (const [p, s] of arrTITLE) {
        p.setXY(delay, ps[s]!.x + 8, ps[s]!.y);
        p.setTone(delay, new Tone(0, 0, 0, 0));
      }
      delay = lastTitle[0].totalDuration();
    }
    picFADE.moveOpacity(delay + 20, 8, 255);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bitmapHeight = (s: any): number => s?.bitmap?.height ?? 0;
