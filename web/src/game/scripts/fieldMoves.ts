// Field move, vehicle and overworld-movement functions that event scripts call
// (the ports are in game/field). Importing this registers them, loads the
// whole field module and hooks it into the menus (FieldActions).

import type { GameEvent } from "../GameEvent";
import type { GamePlayer } from "../GamePlayer";
import { pbCancelVehicles } from "../GamePlayer";
import { G, pbUpdateSceneMap } from "../globals";
import { defineScript, type ScriptContext } from "../scriptApi";
import type { Pokemon } from "../pokemon/Pokemon";
import type { PokemonMapMetadata } from "../PokemonMapMetadata";
import type { GameStats } from "../trainer/GameStats";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import "../field";
import { pbDismountBike, pbMountBike } from "../field/bicycle";
import { FollowingPkmnConfig } from "../following/config";
import { FollowingPkmn } from "../following/FollowingPkmn";
import {
  FieldMoves, pbCut, pbEraseEscapePoint, pbHiddenMoveEvent, pbTransferSurfing, pbTransferUnderwater, pbRockSmash, pbRockSmashRandomEncounter, pbSmashEvent, pbStrength, pbSweetScent,
} from "../field/FieldMoves";
import { pbFishing } from "../field/Fishing";
import { pbCanUseHiddenMove, pbCheckHiddenMoveBadge, pbUseHiddenMove } from "../field/HiddenMoveHandlers";
import { pbHiddenMoveAnimation } from "../field/hiddenMoveAnimation";
import {
  pbBridgeOff, pbBridgeOn, pbCaveEntrance, pbCaveEntranceEx, pbCaveExit, pbJumpToward, pbSetEscapePoint, pbSlideOnIce,
} from "../field/overworld";
import { pbEraseWhirlpoolEvent, pbWhirlpool } from "../field/Whirlpool";

export { pbCheckHiddenMoveBadge, pbCut };

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
/** The running interpreter's @index (Interpreter methods that skip the next command). */
const bumpIndex = (ctx: ScriptContext) => { (ctx.interpreter as unknown as { index: number }).index += 1; };

defineScript("pbCut", () => pbCut());
defineScript("pbHeadbutt", (_c, event) => FieldMoves.pbHeadbutt((event as GameEvent | undefined) ?? null));
defineScript("pbRockSmash", () => pbRockSmash());
defineScript("pbRockSmashRandomEncounter", () => pbRockSmashRandomEncounter());
defineScript("pbStrength", () => pbStrength());
defineScript("pbSurf", () => FieldMoves.pbSurf());
defineScript("pbDive", () => FieldMoves.pbDive());
defineScript("pbSurfacing", () => FieldMoves.pbSurfacing());
defineScript("pbWaterfall", () => FieldMoves.pbWaterfall());
defineScript("pbAscendWaterfall", () => FieldMoves.pbAscendWaterfall());
defineScript("pbDescendWaterfall", () => FieldMoves.pbDescendWaterfall());
defineScript("pbSweetScent", () => pbSweetScent());
defineScript("pbWhirlpool", () => pbWhirlpool());
defineScript("pbSmashEvent", (_c, event) => pbSmashEvent(event as GameEvent | null));
defineScript("pbHiddenMoveAnimation", (_c, pkmn, fieldMove) => pbHiddenMoveAnimation(pkmn as Pokemon | null, !!fieldMove));
defineScript("pbCanUseHiddenMove?", (_c, pkmn, move, showmsg) => pbCanUseHiddenMove(pkmn as Pokemon, String(move), showmsg !== false));
defineScript("pbUseHiddenMove", (_c, pkmn, move) => pbUseHiddenMove(pkmn as Pokemon, String(move)));
defineScript("pbCheckHiddenMoveBadge", (_c, badge, showmsg) => pbCheckHiddenMoveBadge(Number(badge ?? -1), showmsg !== false));
defineScript("pbHiddenMoveEvent", () => pbHiddenMoveEvent());
defineScript("pbTransferUnderwater", (_c, m, x, y, d) => pbTransferUnderwater(Number(m), Number(x), Number(y), d == null ? undefined : Number(d)));
defineScript("pbTransferSurfing", (_c, m, x, y, d) => pbTransferSurfing(Number(m), Number(x), Number(y), d == null ? undefined : Number(d)));
defineScript("pbFishing", (_c, hasEncounter, rodType) => pbFishing(!!hasEncounter, Number(rodType ?? 1)));

// Vehicles and movement (012_Overworld/001_Overworld.rb, 009_Game_Player.rb)
defineScript("pbMountBike", () => pbMountBike());
defineScript("pbDismountBike", () => pbDismountBike());
defineScript("Kernel.pbMountBike", () => pbMountBike());
defineScript("Kernel.pbDismountBike", () => pbDismountBike());
defineScript("pbCancelVehicles", (_c, destination, cancelSwimming) =>
  pbCancelVehicles(destination == null ? null : Number(destination), cancelSwimming !== false));
defineScript("pbJumpToward", (_c, dist, playSound, cancelSurf) => pbJumpToward(Number(dist ?? 1), !!playSound, !!cancelSurf));
defineScript("pbSlideOnIce", () => pbSlideOnIce());
defineScript("pbBridgeOn", (_c, height) => pbBridgeOn(height == null ? 2 : Number(height)));
defineScript("pbBridgeOff", () => pbBridgeOff());
defineScript("pbSetEscapePoint", () => pbSetEscapePoint());
defineScript("pbEraseEscapePoint", () => pbEraseEscapePoint());
// 001_Overworld visuals/003_Overworld_MapTransitionAnims.rb
defineScript("pbCaveEntrance", () => pbCaveEntrance());
defineScript("pbCaveExit", () => pbCaveExit());
defineScript("pbCaveEntranceEx", (_c, exiting) => pbCaveEntranceEx(!!exiting));

/**
 * pbSetPokemonCenter (012_Overworld/001_Overworld.rb:701): where the player
 * returns after blacking out. With Following Pokemon EX's alias
 * (Refresh.rb:243-248): queues the Poké Center animation for the follower.
 */
export function pbSetPokemonCenter(): void {
  const g = G.pokemonGlobal;
  const p = gamePlayer();
  g.pokecenterMapId = G.gameMap!.mapId;
  g.pokecenterX = p.x;
  g.pokecenterY = p.y;
  g.pokecenterDirection = p.direction;
  if (FollowingPkmnConfig.SHOW_POKECENTER_ANIMATION && FollowingPkmn.active()) G.gameTemp.pokecenterFollowingPkmn = 1;
}
defineScript("pbSetPokemonCenter", () => pbSetPokemonCenter());

//===============================================================================
// Interpreter methods (003_Game processing/003_Interpreter.rb, Whilrpool HM.rb)
//===============================================================================
/** Interpreter#pbPushThisEvent: boulder events, pushed the way the player faces. */
async function pbPushThisEvent(ctx: ScriptContext): Promise<void> {
  const event = ctx.event as GameEvent;
  const oldX = event.x;
  const oldY = event.y;
  const p = gamePlayer();
  // Apply strict version of passable, which treats tiles that are passable
  // only from certain directions as fully impassible
  if (!event.canMoveInDirection(p.direction, true)) return;
  (G.stats as GameStats).strengthPushCount += 1;
  switch (p.direction) {
    case 2: event.moveDown(); break;
    case 4: event.moveLeft(); break;
    case 6: event.moveRight(); break;
    case 8: event.moveUp(); break;
  }
  (G as unknown as { pokemonMap: PokemonMapMetadata | null }).pokemonMap?.addMovedEvent(event.id);
  if (oldX !== event.x || oldY !== event.y) {
    p.lock();
    for (;;) {
      await Graphics.update();
      Input.update();
      await pbUpdateSceneMap();
      if (!event.moving()) break;
    }
    p.unlock();
  }
}
defineScript("pbPushThisEvent", (ctx) => pbPushThisEvent(ctx));

/** Interpreter#pbPushThisBoulder */
defineScript("pbPushThisBoulder", async (ctx) => {
  if ((G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap.strengthUsed) await pbPushThisEvent(ctx);
  return true;
});

/** Interpreter#pbSmashThisEvent */
defineScript("pbSmashThisEvent", async (ctx) => {
  const event = ctx.event as GameEvent | null;
  if (event) await pbSmashEvent(event);
  bumpIndex(ctx);
  return true;
});

/** pbEraseWhirlpoolThisEvent (Whilrpool HM.rb: runs in the interpreter, like pbSmashThisEvent) */
defineScript("pbEraseWhirlpoolThisEvent", async (ctx) => {
  const event = ctx.event as GameEvent | null;
  if (event) await pbEraseWhirlpoolEvent(event);
  bumpIndex(ctx);
  return true;
});
