// What this game's trainer events call around a trainer battle:
// - pbExclaim / pbNoticePlayer (019_Utilities/001_Utilities.rb:170-197) with
//   pbFacingEachOther and pbMoveTowardPlayer (012_Overworld/001_Overworld.rb:415,
//   :623): the "!" over a trainer who spots the player and the walk up to them.
// - Interpreter#pbTrainerIntro's intro music (003_Game processing/003_Interpreter.rb:437);
//   the lock itself is in game/Interpreter.ts.
// - pbTrainerCheck (015_Trainers and player/002_Trainer_LoadAndNew.rb:81), a
//   debug-only check that's always true in a released game.
// - Partner trainers: pbRegisterPartner / pbDeregisterPartner
//   (012_Overworld/001_Overworld.rb:713-727).
// (The PBTrainers constants this game keeps for old events are registered with
// PBItems in game/scripts/pokemon.ts.)

import type { Id } from "../../data/gameData/gameData";
import { TrainerType } from "../../data/gameData/trainerType";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import type { SceneMap } from "../../scenes/SceneMap";
import type { AnimationSprite } from "../../sprites/AnimationSprite";
import { pbPlayTrainerIntroBGM } from "../battle/battleAudio";
import { EventHandlers } from "../eventHandlers";
import type { GameCharacter } from "../GameCharacter";
import { eventCanReachPlayer, pbEventFacesPlayer } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { pbCancelVehicles } from "../GamePlayer";
import { G, pbUpdateSceneMap } from "../globals";
import { pbTurnTowardEvent } from "../following/moveRoute";
import { Interpreter } from "../Interpreter";
import { PokemonOwner } from "../pokemon/PokemonOwner";
import { pokemonMap } from "../save/values";
import { defineScript } from "../scriptApi";
import { pbLoadTrainer } from "../trainer/loadAndNew";

/** Settings::EXCLAMATION_ANIMATION_ID (001_Settings.rb:376) */
export const EXCLAMATION_ANIMATION_ID = 3;

const gamePlayer = () => G.gamePlayer as unknown as GameCharacter;
const sceneMap = () => G.scene as unknown as SceneMap | null;

//===============================================================================
// Noticing the player
//===============================================================================
/** pbExclaim(event, id, tinting): plays an animation over the event(s) and waits for it to end. */
export async function pbExclaim(event: GameCharacter | GameCharacter[], id = EXCLAMATION_ANIMATION_ID, tinting = false): Promise<void> {
  let sprite: AnimationSprite | null | undefined = null;
  if (Array.isArray(event)) {
    const done: number[] = [];
    for (const i of event) {
      if (done.includes(i.id)) continue;
      const spriteset = sceneMap()?.spriteset(i.map.mapId);
      sprite ??= spriteset?.addUserAnimation(id, i.x, i.y, tinting, 2);
      done.push(i.id);
    }
  } else {
    const spriteset = sceneMap()?.spriteset(event.map.mapId);
    sprite = spriteset?.addUserAnimation(id, event.x, event.y, tinting, 2);
  }
  // NOTE (Ruby parity): Ruby calls sprite.disposed? on nil (NoMethodError) if
  // there's no spriteset; the port just doesn't wait then.
  while (sprite && !sprite.isDisposed()) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

/** pbFacingEachOther(event1, event2): next to each other and facing each other. */
export function pbFacingEachOther(event1: GameCharacter, event2: GameCharacter): boolean {
  return pbEventFacesPlayer(event1, event2, 1) && pbEventFacesPlayer(event2, event1, 1);
}

/** pbMoveTowardPlayer(event): walks the event up to the player, if nothing is in the way. */
export async function pbMoveTowardPlayer(event: GameCharacter): Promise<void> {
  const map = G.gameMap as unknown as GameMap;
  const maxsize = Math.max(map.width, map.height);
  if (!eventCanReachPlayer(event, gamePlayer(), maxsize)) return;
  for (;;) {
    const x = event.x;
    const y = event.y;
    event.moveTowardPlayer();
    if (event.x === x && event.y === y) break;
    while (event.moving()) {
      await Graphics.update();
      Input.update();
      await pbUpdateSceneMap();
    }
  }
  pokemonMap()?.addMovedEvent(event.id);
}

/** pbNoticePlayer(event): "!" (unless already face to face), then turn to and walk up to the event. */
export async function pbNoticePlayer(event: GameCharacter): Promise<void> {
  if (!pbFacingEachOther(event, gamePlayer())) await pbExclaim(event);
  pbTurnTowardEvent(gamePlayer(), event);
  await pbMoveTowardPlayer(event);
}

defineScript("pbExclaim", (_c, event, id, tinting) =>
  pbExclaim(event as GameCharacter, id == null ? EXCLAMATION_ANIMATION_ID : Number(id), !!tinting));
defineScript("pbNoticePlayer", (_c, event) => pbNoticePlayer(event as GameCharacter));
defineScript("pbFacingEachOther", (_c, a, b) => pbFacingEachOther(a as GameCharacter, b as GameCharacter));
defineScript("pbMoveTowardPlayer", (_c, event) => pbMoveTowardPlayer(event as GameCharacter));

//===============================================================================
// Trainer intro music (Interpreter#pbTrainerIntro)
//===============================================================================
// Interpreter#pbTrainerIntro(symbol) (`return true if $DEBUG && ...` is debug only).
Interpreter.prototype.pbTrainerIntro = function (this: Interpreter, symbol: string): boolean {
  const trType = TrainerType.get(symbol).id;
  this.pbGlobalLock();
  pbPlayTrainerIntroBGM(trType);
  return true;
};

//===============================================================================
// Trainer data checks (debug only)
//===============================================================================
/** pbTrainerCheck(tr_type, tr_name, max_battles, tr_version): offers to create missing trainers in $DEBUG. */
export function pbTrainerCheck(_trType: Id, _trName: string, _maxBattles: number, _trVersion = 0): boolean {
  return true; // return true if !$DEBUG
}
/** pbTrainerTypeCheck(trainer_type) */
export function pbTrainerTypeCheck(_trainerType: Id): boolean {
  return true; // return true if !$DEBUG
}

defineScript("pbTrainerCheck", (_c, type, name, max, version) => pbTrainerCheck(type as Id, String(name), Number(max), Number(version ?? 0)));
defineScript("pbTrainerTypeCheck", (_c, type) => pbTrainerTypeCheck(type as Id));

//===============================================================================
// Partner trainer
//===============================================================================
/** pbRegisterPartner(tr_type, tr_name, tr_id): the trainer who fights alongside the player. */
export function pbRegisterPartner(trType: Id, trName: string, trId = 0): void {
  trType = TrainerType.get(trType).id;
  pbCancelVehicles();
  const trainer = pbLoadTrainer(trType, trName, trId);
  // NOTE (Ruby parity): Ruby carries on with nil for a trainer that doesn't
  // exist and raises NoMethodError on trainer.party.
  if (!trainer) throw new Error(`undefined method 'party' for nil (pbRegisterPartner ${trType}, ${trName}, ${trId})`);
  EventHandlers.triggerSync("on_trainer_load", trainer);
  for (const i of trainer.party) {
    i.owner = PokemonOwner.newFromTrainer(trainer);
    i.calcStats();
  }
  G.pokemonGlobal.partner = [trType, trName, trainer.id, trainer.party];
}

/** pbDeregisterPartner */
export function pbDeregisterPartner(): void {
  G.pokemonGlobal.partner = null;
}

defineScript("pbRegisterPartner", (_c, type, name, id) => pbRegisterPartner(type as Id, String(name), Number(id ?? 0)));
defineScript("pbDeregisterPartner", () => pbDeregisterPartner());
