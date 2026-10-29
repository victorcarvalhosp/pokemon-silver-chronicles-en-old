// The Battle::Scene methods ZUD Mechanics adds ([005] Battle_Scene/
// Scene_Animation_Dynamax.rb:523-551, Scene_Animation_ZMove.rb:213-226,
// Scene_Animation_UltraBurst.rb:154-167): pbShowDynamax, pbDynamaxSendOut,
// pbRevertDynamax, pbShowZMove, pbShowUltraBurst. index.ts installs them on
// BattleScene. ([005] Battle_Scene/Scene.rb (Dynamax zoom in pbAnimationCore,
// the fight menu toggles) and Scene_PokemonDataBox.rb are in battle/scene/.)
//
// Ruby loads each cinematic's graphics as it builds it; here they're fetched
// first (the *Graphics functions), so the animations read them synchronously.

import { assetExists } from "../../../core/assets";
import type { Id } from "../../../data/gameData/gameData";
import { SpeciesMetrics } from "../../../data/gameData/speciesMetrics";
import { Species } from "../../../data/gameData/species";
import { TrainerType } from "../../../data/gameData/trainerType";
import { pbPlayCancelSE } from "../../../game/GameSystem";
import type { Pokemon } from "../../../game/pokemon/Pokemon";
import { Input } from "../../../rgss/Input";
import { preloadBitmaps } from "../../../ui/rpgCache";
import { preloadPokemonSprite, preloadSpeciesSprite } from "../../../ui/sprites/pokemonSprite";
import type { Battle } from "../../battle/Battle";
import type { Battler } from "../../battler/Battler";
import { PBEffects } from "../../other/PBEffects";
import { type Animation, ballGraphics, DX_ANIM_PATH } from "../../scene/animationBase";
import { DataBoxAppear, PokeballPlayerSendOut, PokeballTrainerSendOut } from "../../scene/animations";
import type { BattleScene } from "../../scene/BattleScene";
import { BattlerDynamax, BattlerDynamaxWild, cinematicPokemon, dynamaxSpriteParams, trainerItemFor } from "./Scene_Animation_Dynamax";
import { BattlerUltraBurst, ultraSpriteParams } from "./Scene_Animation_UltraBurst";
import { BattlerZMove } from "./Scene_Animation_ZMove";

const existing = (p: string): string | null => (assetExists(p) ? p : null);

/** The battle as the ZUD cinematics see it (the scene's SceneBattle is the real Battle). */
const battleOf = (scene: BattleScene): Battle => scene.battle as unknown as Battle;

//-----------------------------------------------------------------------------
// Graphics the cinematics load
//-----------------------------------------------------------------------------
/** The battleback files pbGetBattlefieldFiles may pick, and the Deluxe backdrops. */
function battlefieldGraphics(battle: Battle, subfolder: string): string[] {
  const names = [battle.backdrop, battle.backdropBase ?? "",
    battle.backdropBase ? `${battle.backdrop}_${battle.backdropBase}` : ""].filter((n) => n);
  const files: string[] = [];
  for (const n of names) {
    for (const t of ["", "_eve", "_night"]) files.push(`Graphics/Battlebacks/${n}${t}_bg`, `Graphics/Battlebacks/${n}${t}_base1`);
  }
  files.push(DX_ANIM_PATH + subfolder + "bg", DX_ANIM_PATH + subfolder + "base", "Graphics/Pictures/evolutionbg",
    DX_ANIM_PATH + "burst", DX_ANIM_PATH + "pulse", DX_ANIM_PATH + "skip_button", DX_ANIM_PATH + "fade");
  return files;
}

/** GameData::Species.shadow_filename's candidates (sceneFiles.shadowFilename reads them from the cache). */
function shadowGraphics(species: Id, form: number): string[] {
  const sp = Species.getSpeciesForm(species, form);
  if (!sp) return [];
  let path = `Graphics/Pokemon/Shadow/${sp.species}`;
  const files = [path];
  if (form > 0) files.push(path += `_${form}`);
  files.push(path + "_dmax", "Graphics/Pokemon/Shadow/dynamax");
  const metrics = SpeciesMetrics.getSpeciesForm(sp.species, form);
  if (metrics) files.push(`Graphics/Pokemon/Shadow/${metrics.shadowSize}`);
  return files;
}

function trainerGraphic(battle: Battle, idxBattler: number): string | null {
  const trainer = battle.pbGetOwnerFromBattlerIndex(idxBattler);
  return trainer ? TrainerType.frontSpriteFilename(trainer.trainerType, existing) : null;
}

async function preloadExisting(files: (string | null)[], sprites: Promise<void>[] = []): Promise<void> {
  await Promise.all([preloadBitmaps(files.filter((f): f is string => !!f && assetExists(f))), ...sprites]);
}

/** What BattlerDynamax/BattlerDynamaxWild show. */
async function preloadDynamaxGraphics(battle: Battle, idxBattler: number): Promise<void> {
  const battler = battle.battlers[idxBattler]!;
  const pkmn = cinematicPokemon(battler);
  const files: (string | null)[] = [...battlefieldGraphics(battle, "Dynamax/"), ...shadowGraphics(pkmn.species, pkmn.form)];
  if (!battler.wild()) {
    files.push(trainerGraphic(battle, idxBattler), "Graphics/Items/" + trainerItemFor(battle, idxBattler, "DynamaxBand", "DYNAMAXBAND"),
      ...ballGraphics(pkmn.pokeBall));
  }
  await preloadExisting(files, [preloadSpeciesSprite(...dynamaxSpriteParams(battler, pkmn)), preloadPokemonSprite(pkmn)]);
}

/** What BattlerZMove shows. */
async function preloadZMoveGraphics(battle: Battle, idxBattler: number, moveId: Id): Promise<void> {
  const battler = battle.battlers[idxBattler]!;
  const pkmn = cinematicPokemon(battler);
  const files: (string | null)[] = [...battlefieldGraphics(battle, "Z-Move/"), DX_ANIM_PATH + "Z-Move/particle",
    DX_ANIM_PATH + "Z-Move/Z-Titles/" + moveId];
  if (battler.itemId) files.push("Graphics/Items/" + battler.itemId);
  if (!battler.wild()) {
    files.push(trainerGraphic(battle, idxBattler), "Graphics/Items/" + trainerItemFor(battle, idxBattler, "ZRing", "ZRING"));
  }
  await preloadExisting(files, [preloadPokemonSprite(pkmn)]);
}

/** What BattlerUltraBurst shows. */
async function preloadUltraBurstGraphics(battle: Battle, idxBattler: number): Promise<void> {
  const pkmn = battle.battlers[idxBattler]!.pokemon!;
  const files = [...battlefieldGraphics(battle, "Ultra/"), DX_ANIM_PATH + "shine", DX_ANIM_PATH + "Ultra/icon",
    DX_ANIM_PATH + "Ultra/particles"];
  await preloadExisting(files, [preloadPokemonSprite(pkmn), preloadSpeciesSprite(...ultraSpriteParams(pkmn))]);
}

/** Plays a cinematic until it ends or the player presses ACTION (skip). */
async function playSkippable(scene: BattleScene, anim: Animation): Promise<void> {
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

//-------------------------------------------------------------------------------
// Calls the animations.
//-------------------------------------------------------------------------------
export const zudSceneMethods = {
  async pbShowDynamax(this: BattleScene, idxBattler: number): Promise<void> {
    const battle = battleOf(this);
    await preloadDynamaxGraphics(battle, idxBattler);
    const battler = battle.battlers[idxBattler]!;
    const dynamaxAnim = battler.wild()
      ? new BattlerDynamaxWild(this.sprites, this.viewport, idxBattler, battle)
      : new BattlerDynamax(this.sprites, this.viewport, idxBattler, battle);
    await playSkippable(this, dynamaxAnim);
  },

  async pbDynamaxSendOut(this: BattleScene, idxBattler: number, xpos: number, ypos: number): Promise<void> {
    const battle = battleOf(this);
    this.sprites[`pokemon_${idxBattler}`].x = xpos;
    this.sprites[`pokemon_${idxBattler}`].y = ypos;
    const battler = battle.battlers[idxBattler]!;
    await preloadBitmaps(ballGraphics(battler.pokemon!.pokeBall));
    const sendOutAnim: Animation = battler.opposes()
      ? new PokeballTrainerSendOut(this.sprites, this.viewport, 0, battler as never, false, 0)
      : new PokeballPlayerSendOut(this.sprites, this.viewport, 0, battler as never, false, 0);
    const dataBoxAnim = new DataBoxAppear(this.sprites, this.viewport, idxBattler);
    for (;;) {
      sendOutAnim.update();
      if (sendOutAnim.animDone()) dataBoxAnim.update();
      await this.pbUpdate();
      if (dataBoxAnim.animDone()) break;
    }
    sendOutAnim.dispose();
    dataBoxAnim.dispose();
    this.pbRefresh();
    battler.pokemon!.dynamax = true;
    await this.pbRevertDynamax(idxBattler, false);
  },

  async pbRevertDynamax(this: BattleScene, idxBattler: number, withForm = true): Promise<void> {
    await this.pbRevertBattlerStart(idxBattler);
    const battler = battleOf(this).battlers[idxBattler]! as Battler;
    if (battler.isSpecies("ALCREMIE") && withForm) battler.form = battler.effects[PBEffects.NonGMaxForm] as number;
    const poke = ((battler.effects[PBEffects.TransformPokemon] as Pokemon | null) ?? battler.displayPokemon())!;
    await this.pbChangePokemon(battler as never, poke);
    await this.pbRevertBattlerEnd();
  },

  async pbShowZMove(this: BattleScene, idxBattler: number, moveId: Id): Promise<void> {
    const battle = battleOf(this);
    await preloadZMoveGraphics(battle, idxBattler, moveId);
    const zmoveAnim = new BattlerZMove(this.sprites, this.viewport, idxBattler, battle, moveId);
    await playSkippable(this, zmoveAnim);
  },

  async pbShowUltraBurst(this: BattleScene, idxBattler: number): Promise<void> {
    const battle = battleOf(this);
    await preloadUltraBurstGraphics(battle, idxBattler);
    const ultraAnim = new BattlerUltraBurst(this.sprites, this.viewport, idxBattler, battle);
    await playSkippable(this, ultraAnim);
  },
};
