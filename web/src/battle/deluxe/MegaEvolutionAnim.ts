// Port of Essentials Deluxe's Mega Evolution / Primal Reversion cinematics
// ([000] Essentials Patches/Mega Evolution.rb:247-702) and the helpers they
// share with ZUD's cinematics ([000] Battle_Scene.rb:614-676:
// Battle#pbGetBattlefieldFiles, pbGetTypeColors).
//
// Battle#pbMegaEvolve / #pbPrimalReversion only play these when the game has
// no Common:MegaEvolution / Common:PrimalKyogre / Common:PrimalGroudon
// animation. This game has them, so in play the common animations show;
// the cinematics are reachable on the dev page (dev-deluxe.html?cinematic=1).
//
// Ruby loads every graphic when the animation is created; here
// pbShowMegaEvolution / pbShowPrimalReversion fetch them first.

import { assetExists } from "../../core/assets";
import { Item } from "../../data/gameData/item";
import type { Id } from "../../data/gameData/gameData";
import { TrainerType } from "../../data/gameData/trainerType";
import { pbPlayCancelSE } from "../../game/GameSystem";
import { G } from "../../game/globals";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { Viewport } from "../../rgss/display";
import { Input } from "../../rgss/Input";
import { Color, Tone } from "../../rgss/types";
import { preloadBitmaps } from "../../ui/rpgCache";
import type { PictureEx } from "../../ui/scenes/PictureEx";
import { preloadPokemonSprite, preloadSpeciesSprite, SpeciesFiles } from "../../ui/sprites/pokemonSprite";
import type { Battle } from "../battle/Battle";
import type { Battler } from "../battler/Battler";
import { Animation, DX_ANIM_PATH, type SceneSprites } from "../scene/animationBase";
import type { BattleScene } from "../scene/BattleScene";

const SCREEN_W = 512;
const SCREEN_H = 384;

const resolve = (path: string): string | null => (assetExists(path) ? path : null);

//===============================================================================
// Battle#pbGetBattlefieldFiles: the file names for battle background elements.
//===============================================================================
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
    if (resolve(`Graphics/Battlebacks/${trialName}_bg`)) backdropFilename = trialName;
    trialName = `${baseFilename}_${time}`;
    if (resolve(`Graphics/Battlebacks/${trialName}_base1`)) baseFilename = trialName;
  }
  if (!resolve(`Graphics/Battlebacks/${baseFilename}_base1`) && battle.backdropBase) {
    baseFilename = battle.backdropBase;
    if (time) {
      const trialName = `${baseFilename}_${time}`;
      if (resolve(`Graphics/Battlebacks/${trialName}_base1`)) baseFilename = trialName;
    }
  }
  return [backdropFilename, baseFilename];
}

/** pbGetTypeColors(type): [outline, bg] colors for a type (used by ZUD's cinematics). */
export function pbGetTypeColors(type: Id | null): [number[], number[]] {
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
    default: return [[255, 255, 255], [200, 200, 200]];
  }
}

/** The Pokémon a cinematic shows after the change: [species, gender, form, shiny, shadow]. */
function changedSpec(pkmn: Pokemon, form: number): unknown[] {
  return [pkmn.species, pkmn.gender, form, pkmn.shiny, pkmn.shadowPokemon()];
}

//===============================================================================
// Battle animation for triggering Mega Evolution.
//===============================================================================
export class BattlerMegaEvolve extends Animation {
  private battler: Battler;
  private pkmn: Pokemon;
  private mega: unknown[];
  private cryFile: string | null;
  private megastoneFile: string | null = null;
  private trainerFile: string | null = null;
  private itemFile: string | null = null;
  private path = DX_ANIM_PATH;
  private bgFile: string;
  private baseFile: string;

  constructor(sprites: SceneSprites, viewport: Viewport | null, idxBattler: number, private battle: Battle) {
    super(sprites, viewport);
    //---------------------------------------------------------------------------
    // Gets Pokemon data from battler index.
    this.battler = battle.battlers[idxBattler]!;
    this.opposes = battle.opposes(idxBattler);
    this.pkmn = this.battler.pokemon!;
    this.mega = changedSpec(this.pkmn, this.pkmn.getMegaForm());
    this.cryFile = SpeciesFiles.cryFilename(this.mega[0], this.mega[2]);
    if (this.battler.item && this.battler.item.isMegaStone()) {
      this.megastoneFile = "Graphics/Items/" + this.battler.itemId;
    }
    //---------------------------------------------------------------------------
    // Gets trainer data from battler index (non-wild only).
    if (!this.battler.wild()) {
      let trainerItem: Id = "MEGARING";
      const trainer = battle.pbGetOwnerFromBattlerIndex(idxBattler)!;
      this.trainerFile = TrainerType.frontSpriteFilename(trainer.trainerType, resolve);
      const items = Item.each().filter((item) => item.hasFlag("MegaRing")).map((item) => item.id);
      if (battle.pbOwnedByPlayer(idxBattler)) {
        for (const item of items) if (G.bag.has(item)) trainerItem = item;
      } else {
        const trainerItems = battle.pbGetOwnerItems(idxBattler);
        for (const item of items) if (trainerItems?.includes(item)) trainerItem = item;
      }
      this.itemFile = "Graphics/Items/" + trainerItem;
    }
    //---------------------------------------------------------------------------
    // Gets background and animation data.
    const [backdropFilename, baseFilename] = pbGetBattlefieldFiles(battle);
    this.bgFile = "Graphics/Battlebacks/" + backdropFilename + "_bg";
    this.baseFile = "Graphics/Battlebacks/" + baseFilename + "_base1";
    this.createProcesses();
  }

  /** The graphics the animation loads. */
  static graphics(battle: Battle, idxBattler: number): string[] {
    const battler = battle.battlers[idxBattler]!;
    const files = [DX_ANIM_PATH + "Mega/bg", DX_ANIM_PATH + "Mega/base", DX_ANIM_PATH + "burst", DX_ANIM_PATH + "Mega/orb_1",
      DX_ANIM_PATH + "Mega/shine", DX_ANIM_PATH + "Mega/orb_2", DX_ANIM_PATH + "particle", DX_ANIM_PATH + "pulse",
      DX_ANIM_PATH + "Mega/icon", DX_ANIM_PATH + "skip_button", DX_ANIM_PATH + "fade", "Graphics/Pictures/evolutionbg"];
    const [bd, base] = pbGetBattlefieldFiles(battle);
    files.push(`Graphics/Battlebacks/${bd}_bg`, `Graphics/Battlebacks/${base}_base1`);
    if (battler.itemId) files.push("Graphics/Items/" + battler.itemId);
    if (!battler.wild()) {
      const trainer = battle.pbGetOwnerFromBattlerIndex(idxBattler)!;
      const f = TrainerType.frontSpriteFilename(trainer.trainerType, resolve);
      if (f) files.push(f);
      for (const item of Item.each()) if (item.hasFlag("MegaRing")) files.push("Graphics/Items/" + item.id);
    }
    return files.filter((f) => assetExists(f));
  }

  override createProcesses(): void {
    if (!this.pkmn) return; // (fields are set after super())
    let delay = 0;
    const [centerX, centerY] = [SCREEN_W / 2, SCREEN_H / 2];
    const wildOffset = !this.battler.wild();
    //---------------------------------------------------------------------------
    // Sets up background.
    const [picBG] = this.dxSetBackdrop(this.path + "Mega/bg", this.bgFile, delay);
    //---------------------------------------------------------------------------
    // Sets up bases.
    const [arrBASES, trBaseOffset] = this.dxSetBases(this.path + "Mega/base", this.baseFile, delay, centerX, centerY, wildOffset);
    //---------------------------------------------------------------------------
    // Sets up trainer & Mega Ring
    let picTRAINER: PictureEx | null = null, trainerEndX = 0, trainerY = 0;
    let arrITEM: [PictureEx, number][] = [];
    if (!this.battler.wild()) {
      [picTRAINER, trainerEndX, trainerY, arrITEM] = this.dxSetTrainerWithItem(this.trainerFile!, this.itemFile!, delay, !this.opposes);
    }
    //---------------------------------------------------------------------------
    // Sets up overlay.
    const [picOVERLAY] = this.dxSetOverlay(this.path + "burst", delay);
    //---------------------------------------------------------------------------
    // Sets up battler.
    const [picPOKE, sprPOKE] = this.dxSetPokemon(this.pkmn, delay, !this.opposes, !this.battler.wild());
    //---------------------------------------------------------------------------
    // Sets up Mega Stone.
    const pokeSprite = this.pictureSprites[sprPOKE]!;
    const itemY = pokeSprite.y - (pokeSprite.bitmap?.height ?? 0);
    const arrSTONE = this.dxSetSpriteWithOutline(this.megastoneFile, delay, centerX, itemY);
    //---------------------------------------------------------------------------
    // Animation objects.
    const [picORB, sprORB] = this.dxSetSprite(this.path + "Mega/orb_1", delay, centerX, centerY, wildOffset, 0, 0);
    const [picSHINE] = this.dxSetSprite(this.path + "Mega/shine", delay, centerX, centerY, wildOffset);
    //---------------------------------------------------------------------------
    // Sets up Mega Pokemon.
    const arrPOKE = this.dxSetPokemonWithOutline(this.mega, delay, !this.opposes, !this.battler.wild());
    arrPOKE.at(-1)![0].setColor(delay, new Color(255, 255, 255));
    //---------------------------------------------------------------------------
    // Animation objects.
    const [picORB2, sprORB2] = this.dxSetSprite(this.path + "Mega/orb_2", delay, centerX, centerY, wildOffset, 0);
    const arrPARTICLES = this.dxSetParticles(this.path + "particle", delay, centerX, centerY, 200);
    const [picPULSE] = this.dxSetSprite(this.path + "pulse", delay, centerX, centerY, wildOffset, 100, 50);
    //---------------------------------------------------------------------------
    // Sets up Mega icon.
    const lastPoke = this.pictureSprites[arrPOKE.at(-1)![1]]!;
    const iconY = lastPoke.y - (lastPoke.bitmap?.height ?? 0) - 20;
    const [picICON] = this.dxSetSprite(this.path + "Mega/icon", delay, centerX, iconY, false, 0);
    //---------------------------------------------------------------------------
    // Sets up skip button & fade out.
    const picBUTTON = this.dxSetSkipButton(delay);
    const picFADE = this.dxSetFade(delay);
    ////////////////////////////////////////////////////////////////////////////
    // Animation start.
    ////////////////////////////////////////////////////////////////////////////
    // Fades in scene.
    picFADE.moveOpacity(delay, 8, 255);
    delay = picFADE.totalDuration();
    picBG.setVisible(delay, true);
    arrBASES.at(-1)!.setVisible(delay, true);
    picPOKE.setVisible(delay, true);
    picFADE.moveOpacity(delay, 8, 0);
    delay = picFADE.totalDuration();
    picBUTTON.moveXY(delay, 6, 0, SCREEN_H - 38);
    picBUTTON.moveXY(delay + 36, 6, 0, SCREEN_H);
    //---------------------------------------------------------------------------
    // Slides trainer on screen with base (non-wild only).
    if (picTRAINER) {
      picTRAINER.setVisible(delay + 4, true);
      arrBASES[0]!.setVisible(delay + 4, true);
      picTRAINER.moveXY(delay + 4, 8, trainerEndX, trainerY);
      arrBASES[0]!.moveXY(delay + 4, 8, trainerEndX - trBaseOffset, centerY - 33);
      delay = picTRAINER.totalDuration() + 1;
      //-------------------------------------------------------------------------
      // Mega Ring appears with outline; slide upwards.
      picTRAINER.setSE(delay, "DX Power Up");
      for (const [p, s] of arrITEM) {
        p.setVisible(delay, true);
        p.moveXY(delay, 15, this.pictureSprites[s]!.x, this.pictureSprites[s]!.y - 20);
        p.moveOpacity(delay, 15, 255);
        p.moveOpacity(delay + 15, 8, 0);
      }
      delay = picTRAINER.totalDuration();
    }
    //---------------------------------------------------------------------------
    // Mega Stone appears with outline; slide upwards.
    for (const [p, s] of arrSTONE) {
      p.setVisible(delay, true);
      p.moveXY(delay, 15, this.pictureSprites[s]!.x, this.pictureSprites[s]!.y - 20);
      p.moveOpacity(delay, 15, 255);
      p.moveOpacity(delay + 15, 8, 0);
    }
    //---------------------------------------------------------------------------
    // Darkens background/base tone; brightens Pokemon to white.
    if (this.battler.wild()) picBG.setSE(delay, "DX Power Up");
    picBG.moveTone(delay, 15, new Tone(-200, -200, -200));
    for (const p of arrBASES) p.moveTone(delay, 15, new Tone(-200, -200, -200));
    picPOKE.moveTone(delay, 8, new Tone(-255, -255, -255, 255));
    picPOKE.moveColor(delay + 8, 6, new Color(255, 255, 255));
    //---------------------------------------------------------------------------
    // Particles begin drawing in to Pokemon.
    const particleEnd = drawParticlesIn(arrPARTICLES, delay, centerX, centerY);
    delay = picPOKE.totalDuration() + 4;
    //---------------------------------------------------------------------------
    // White orb engulfs Pokemon; cracks appear; orb expands away from Pokemon.
    picORB.setVisible(delay, true);
    picORB2.setVisible(delay, true);
    picORB.setSE(delay, "Anim/Psych Up");
    picORB.moveZoom(delay, 12, 100);
    picORB.moveOpacity(delay, 12, 255);
    picORB2.moveOpacity(particleEnd, 16, 255);
    delay = picORB2.totalDuration();
    picSHINE.setVisible(delay, true);
    picSHINE.moveOpacity(delay, 4, 255);
    picPOKE.setVisible(delay, false);
    const t = 0.5;
    delay = shakeOrbs(this.pictureSprites, picORB, sprORB, picORB2, sprORB2, delay, t);
    picORB2.setSE(delay, "Anim/fog2");
    picORB2.moveZoom(delay, 8, 1000);
    picORB2.moveOpacity(delay, 8, 0);
    for (const [p] of arrPOKE) p.setVisible(delay + 6, true);
    picORB.moveZoom(delay + 6, 8, 1000);
    picORB.moveOpacity(delay + 6, 8, 0);
    //---------------------------------------------------------------------------
    // White screen flash; shows silhouette of Mega Pokemon.
    picFADE.setColor(delay + 4, new Color(255, 255, 255));
    picFADE.moveOpacity(delay + 4, 12, 255);
    delay = picFADE.totalDuration();
    arrPOKE.at(-1)![0].setColor(delay, new Color(0, 0, 0));
    picFADE.moveOpacity(delay, 6, 0);
    picFADE.setColor(delay + 6, new Color(0, 0, 0));
    delay = picFADE.totalDuration();
    //---------------------------------------------------------------------------
    // Mega Pokemon revealed; pulse expands outwards; overlay & Mega icon shown.
    picOVERLAY.setVisible(delay, true);
    picOVERLAY.moveOpacity(delay, 5, 0);
    picSHINE.setVisible(delay, true);
    picICON.setVisible(delay, true);
    picICON.moveOpacity(delay + 4, 8, 255);
    picPULSE.setVisible(delay, true);
    picPULSE.moveZoom(delay, 5, 1000);
    picPULSE.moveOpacity(delay + 2, 5, 0);
    arrPOKE.at(-1)![0].moveColor(delay, 8, new Color(0, 0, 0, 0));
    //---------------------------------------------------------------------------
    // Shakes Pokemon; plays cry; flashes overlay. Fades out.
    delay = shakePokemon(this.pictureSprites, arrPOKE, picPOKE, picOVERLAY, picSHINE, delay, t, this.cryFile);
    picOVERLAY.moveOpacity(delay, 4, 0);
    picSHINE.moveOpacity(delay, 4, 0);
    picFADE.moveOpacity(delay + 20, 8, 255);
  }
}

//===============================================================================
// Battle animation for triggering Primal Reversion.
//===============================================================================
export class BattlerPrimalReversion extends Animation {
  private pkmn: Pokemon;
  private primal: unknown[];
  private cryFile: string | null;
  private bgColor: Color | null = null;
  private path = DX_ANIM_PATH;
  private bgFile: string;
  private baseFile: string;

  constructor(sprites: SceneSprites, viewport: Viewport | null, idxBattler: number, battle: Battle) {
    super(sprites, viewport);
    //---------------------------------------------------------------------------
    // Gets Pokemon data from battler index.
    const battler = battle.battlers[idxBattler]!;
    this.opposes = battle.opposes(idxBattler);
    this.pkmn = battler.pokemon!;
    this.primal = changedSpec(this.pkmn, this.pkmn.getPrimalForm());
    this.cryFile = SpeciesFiles.cryFilename(this.primal[0], this.primal[2]);
    switch (this.pkmn.species) {
      case "GROUDON": this.bgColor = new Color(255, 0, 0, 180); break;
      case "KYOGRE": this.bgColor = new Color(0, 0, 255, 180); break;
    }
    //---------------------------------------------------------------------------
    // Gets background and animation data.
    const [backdropFilename, baseFilename] = pbGetBattlefieldFiles(battle);
    this.bgFile = "Graphics/Battlebacks/" + backdropFilename + "_bg";
    this.baseFile = "Graphics/Battlebacks/" + baseFilename + "_base1";
    this.createProcesses();
  }

  /** The graphics the animation loads. */
  static graphics(battle: Battle, idxBattler: number): string[] {
    const species = battle.battlers[idxBattler]!.species;
    const [bd, base] = pbGetBattlefieldFiles(battle);
    return [DX_ANIM_PATH + "Primal/bg", DX_ANIM_PATH + "Primal/base", DX_ANIM_PATH + "burst",
      DX_ANIM_PATH + `Primal/orb_${species}`, DX_ANIM_PATH + "shine", DX_ANIM_PATH + `Primal/icon_${species}`,
      DX_ANIM_PATH + "particle", DX_ANIM_PATH + "pulse", DX_ANIM_PATH + "skip_button", DX_ANIM_PATH + "fade",
      "Graphics/Pictures/evolutionbg", `Graphics/Battlebacks/${bd}_bg`, `Graphics/Battlebacks/${base}_base1`]
      .filter((f) => assetExists(f));
  }

  override createProcesses(): void {
    if (!this.pkmn) return; // (fields are set after super())
    let delay = 0;
    const [centerX, centerY] = [SCREEN_W / 2, SCREEN_H / 2];
    const species = this.pkmn.species;
    //---------------------------------------------------------------------------
    // Sets up background.
    const [picBG] = this.dxSetBackdrop(this.path + "Primal/bg", this.bgFile, delay);
    //---------------------------------------------------------------------------
    // Sets up bases.
    const [arrBASES] = this.dxSetBases(this.path + "Primal/base", this.baseFile, delay, centerX, centerY);
    //---------------------------------------------------------------------------
    // Sets up overlay.
    const [picOVERLAY] = this.dxSetOverlay(this.path + "burst", delay);
    //---------------------------------------------------------------------------
    // Sets up battler.
    const [picPOKE] = this.dxSetPokemon(this.pkmn, delay, !this.opposes);
    //---------------------------------------------------------------------------
    // Animation objects.
    const [picORB, sprORB] = this.dxSetSprite(this.path + "Primal/orb_" + species, delay, centerX, centerY, false, 0, 0);
    const [picSHINE] = this.dxSetSprite(this.path + "shine", delay, centerX, centerY);
    //---------------------------------------------------------------------------
    // Sets up Primal Pokemon.
    const arrPOKE = this.dxSetPokemonWithOutline(this.primal, delay, !this.opposes);
    arrPOKE.at(-1)![0].setColor(delay, new Color(255, 255, 255));
    //---------------------------------------------------------------------------
    // Sets up Primal icon.
    const [picORB2, sprORB2] = this.dxSetSprite(this.path + "Primal/icon_" + species, delay, centerX, centerY, false, 0);
    //---------------------------------------------------------------------------
    // Animation objects.
    const arrPARTICLES = this.dxSetParticles(this.path + "particle", delay, centerX, centerY, 200);
    const [picPULSE] = this.dxSetSprite(this.path + "pulse", delay, centerX, centerY, false, 100, 50);
    //---------------------------------------------------------------------------
    // Sets up skip button & fade out.
    const picBUTTON = this.dxSetSkipButton(delay);
    const picFADE = this.dxSetFade(delay);
    ////////////////////////////////////////////////////////////////////////////
    // Animation start.
    ////////////////////////////////////////////////////////////////////////////
    // Fades in scene.
    picFADE.moveOpacity(delay, 8, 255);
    delay = picFADE.totalDuration();
    picBG.setVisible(delay, true);
    arrBASES[0]!.setVisible(delay, true);
    picPOKE.setVisible(delay, true);
    picFADE.moveOpacity(delay, 8, 0);
    delay = picFADE.totalDuration();
    picBUTTON.moveXY(delay, 6, 0, SCREEN_H - 38);
    picBUTTON.moveXY(delay + 36, 6, 0, SCREEN_H);
    //---------------------------------------------------------------------------
    // Darkens background/base tone; brightens Pokemon to white.
    picPOKE.setSE(delay, "DX Power Up");
    picBG.moveTone(delay, 15, new Tone(-200, -200, -200));
    arrBASES[0]!.moveTone(delay, 15, new Tone(-200, -200, -200));
    picPOKE.moveTone(delay, 8, new Tone(-255, -255, -255, 255));
    picPOKE.moveColor(delay + 8, 6, new Color(255, 255, 255));
    //---------------------------------------------------------------------------
    // Particles begin drawing in to Pokemon.
    const particleEnd = drawParticlesIn(arrPARTICLES, delay, centerX, centerY);
    delay = picPOKE.totalDuration() + 4;
    //---------------------------------------------------------------------------
    // White orb engulfs Pokemon; Primal icon appears; orb expands away from Pokemon.
    picORB.setVisible(delay, true);
    picORB2.setVisible(delay, true);
    picORB.moveZoom(delay, 8, 100);
    picORB.moveOpacity(delay, 8, 255);
    picPOKE.moveOpacity(delay + 8, 4, 0);
    picORB2.setSE(particleEnd, "Anim/Scary Face");
    picORB2.moveOpacity(particleEnd, 16, 255);
    delay = picORB2.totalDuration();
    picSHINE.setVisible(delay, true);
    picSHINE.moveOpacity(delay, 4, 255);
    if (this.bgColor) {
      picBG.moveColor(delay, 12, this.bgColor);
      arrBASES[0]!.moveColor(delay, 12, this.bgColor);
    }
    const t = 0.5;
    picORB.setSE(delay, "Anim/Wring Out", 100, 60);
    delay = shakeOrbs(this.pictureSprites, picORB, sprORB, picORB2, sprORB2, delay, t);
    picORB2.setSE(delay, "Anim/Explosion");
    picORB2.moveZoom(delay, 8, 1000);
    picORB2.moveOpacity(delay, 8, 0);
    for (const [p] of arrPOKE) p.setVisible(delay + 6, true);
    picORB.moveZoom(delay + 6, 8, 1000);
    picORB.moveOpacity(delay + 6, 8, 0);
    //---------------------------------------------------------------------------
    // White screen flash; shows silhouette of Primal Pokemon.
    picFADE.setColor(delay + 4, this.bgColor ?? new Color(255, 255, 255));
    picFADE.moveOpacity(delay + 4, 12, 255);
    delay = picFADE.totalDuration();
    arrPOKE.at(-1)![0].setColor(delay, new Color(0, 0, 0));
    picFADE.moveOpacity(delay, 6, 0);
    picFADE.setColor(delay + 6, new Color(0, 0, 0));
    delay = picFADE.totalDuration();
    //---------------------------------------------------------------------------
    // Primal Pokemon revealed; pulse expands outwards; overlay shown.
    picOVERLAY.setVisible(delay, true);
    picOVERLAY.moveOpacity(delay, 5, 0);
    picSHINE.setVisible(delay, true);
    picPULSE.setVisible(delay, true);
    picPULSE.moveZoom(delay, 5, 1000);
    picPULSE.moveOpacity(delay + 2, 5, 0);
    arrPOKE.at(-1)![0].moveColor(delay, 8, new Color(0, 0, 0, 0));
    //---------------------------------------------------------------------------
    // Shakes Pokemon; plays cry; flashes overlay. Fades out.
    delay = shakePokemon(this.pictureSprites, arrPOKE, picPOKE, picOVERLAY, picSHINE, delay, t, this.cryFile);
    picOVERLAY.moveOpacity(delay, 4, 0);
    picSHINE.moveOpacity(delay, 4, 0);
    picFADE.moveOpacity(delay + 20, 8, 255);
  }
}

//-------------------------------------------------------------------------------
// The steps both cinematics share (written out twice in Ruby).
//-------------------------------------------------------------------------------
/** Particles draw in to the Pokémon twice; returns when the last one ends. */
function drawParticlesIn(arrPARTICLES: [PictureEx, number, number][], delay: number, centerX: number, centerY: number): number {
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
  return arrPARTICLES.at(-1)![0].totalDuration();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sprites = any[];

/** The two orbs shake 16 times; returns the delay after. */
function shakeOrbs(sprites: Sprites, picORB: PictureEx, sprORB: number, picORB2: PictureEx, sprORB2: number,
  delay: number, t: number): number {
  for (let i = 0; i < 16; i++) {
    picORB.moveXY(delay, t, sprites[sprORB].x + 2, sprites[sprORB].y);
    picORB2.moveXY(delay, t, sprites[sprORB2].x + 2, sprites[sprORB2].y);
    picORB.moveXY(delay + t, t, sprites[sprORB].x - 2, sprites[sprORB].y);
    picORB2.moveXY(delay + t, t, sprites[sprORB2].x - 2, sprites[sprORB2].y);
    delay = picORB2.totalDuration();
  }
  return delay;
}

/** The changed Pokémon shakes 16 times (its cry plays first); returns the delay after. */
function shakePokemon(sprites: Sprites, arrPOKE: [PictureEx, number][], picPOKE: PictureEx, picOVERLAY: PictureEx,
  picSHINE: PictureEx, delay: number, t: number, cryFile: string | null): number {
  for (let i = 0; i < 16; i++) {
    if (i > 0) {
      for (const [p, s] of arrPOKE) p.moveXY(delay, t, sprites[s].x, sprites[s].y + 2);
      for (const [p, s] of arrPOKE) p.moveXY(delay + t, t, sprites[s].x, sprites[s].y - 2);
      picOVERLAY.moveOpacity(delay + t, 2, 160);
      picSHINE.moveOpacity(delay + t, 2, 160);
    } else if (cryFile) {
      picPOKE.setSE(delay + t, cryFile);
    }
    picOVERLAY.moveOpacity(delay + t, 2, 240);
    picSHINE.moveOpacity(delay + t, 2, 240);
    delay = arrPOKE.at(-1)![0].totalDuration();
  }
  return delay;
}

//===============================================================================
// Calls the animations (Battle::Scene#pbShowMegaEvolution / #pbShowPrimalReversion).
//===============================================================================
async function playCinematic(scene: BattleScene, anim: Animation): Promise<void> {
  for (;;) {
    if (Input.press(Input.ACTION)) {
      pbPlayCancelSE();
      break;
    }
    anim.update();
    await scene.pbUpdate();
    if (anim.animDone()) break;
  }
  anim.dispose();
}

export async function pbShowMegaEvolution(scene: BattleScene, idxBattler: number): Promise<void> {
  const battle = scene.battle as unknown as Battle;
  const battler = battle.battlers[idxBattler]!;
  await Promise.all([preloadBitmaps(BattlerMegaEvolve.graphics(battle, idxBattler)),
    preloadPokemonSprite(battler.pokemon!), preloadSpeciesSprite(...changedSpec(battler.pokemon!, battler.pokemon!.getMegaForm()))]);
  await playCinematic(scene, new BattlerMegaEvolve(scene.sprites, scene.viewport, idxBattler, battle));
}

export async function pbShowPrimalReversion(scene: BattleScene, idxBattler: number): Promise<void> {
  const battle = scene.battle as unknown as Battle;
  const battler = battle.battlers[idxBattler]!;
  await Promise.all([preloadBitmaps(BattlerPrimalReversion.graphics(battle, idxBattler)),
    preloadPokemonSprite(battler.pokemon!), preloadSpeciesSprite(...changedSpec(battler.pokemon!, battler.pokemon!.getPrimalForm()))]);
  await playCinematic(scene, new BattlerPrimalReversion(scene.sprites, scene.viewport, idxBattler, battle));
}
