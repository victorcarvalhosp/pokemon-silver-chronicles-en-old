// Port of Plugins/Fly Animation (KleinStudio, updated by A.I.R): the bird
// that swoops across the screen and carries the player off/back when Fly is
// used from the party or the Ready Menu. Settings ([001]Settings.rb):
// BIRD_ANIMATION_TIME = 10, Show_Gen_4_Bird = true (flybird_gen4).
//
// The bird moves a fixed step per frame without scaling by
// Graphics.frame_rate, so it's stepped once per original 40 fps frame.
//
// Flying from the Town Map / Pokégear still uses the core's
// pbFlyToNewLocation, without the bird: the plugin only replaces the FLY
// UseMove handler.

import { Sprite } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { _INTL } from "../../ui/messageConfig";
import { pbFadeOutIn } from "../../ui/fades";
import { pbMessage } from "../../ui/messages";
import { FrameCounter } from "../../ui/frameTime";
import { preloadBitmap, RPGCache } from "../../ui/rpgCache";
import { Move } from "../../data/gameData/move";
import type { GameCharacter } from "../GameCharacter";
import type { GameMap } from "../GameMap";
import type { GamePlayer } from "../GamePlayer";
import { pbSEPlay } from "../GameSystem";
import { G, pbUpdateSceneMap } from "../globals";
import type { GameStats } from "../trainer/GameStats";
import type { Player } from "../trainer/Player";
import { defineScript } from "../scriptApi";
import { pbEraseEscapePoint, type FieldTemp } from "./FieldMoves";
import { HiddenMoveHandlers } from "./HiddenMoveHandlers";
import { pbHiddenMoveAnimation } from "./hiddenMoveAnimation";

/** [001]Settings.rb */
const BIRD_ANIMATION_TIME = 10;
const SHOW_GEN_4_BIRD = true;

const temp = () => G.gameTemp as unknown as FieldTemp;
const gameMap = () => G.gameMap as unknown as GameMap;

/**
 * The bird crossing the screen; `character` turns invisible (landing = true:
 * taking off) or visible again (landing = false) as the bird passes over the
 * middle. pbFlyAnimation and pbFlyAnimationNPC share this loop.
 */
async function birdAnimation(character: GameCharacter, landing: boolean, yDivisor: number): Promise<void> {
  if (landing) {
    character.turnLeft();
    pbSEPlay("flybird");
  }
  const width = Graphics.width;
  const height = Graphics.height;
  const name = SHOW_GEN_4_BIRD ? "flybird_gen4" : "flybird";
  await preloadBitmap(`Graphics/Pictures/${name}`);
  const flybird = new Sprite(null);
  flybird.setBitmap(RPGCache.loadBitmap("Graphics/Pictures/", name));
  const bw = flybird.bitmap?.width ?? 0;
  const bh = flybird.bitmap?.height ?? 0;
  flybird.ox = Math.floor(bw / 2);
  flybird.oy = Math.floor(bh / 2);
  flybird.x = width + bw;
  flybird.y = height / 4;
  const dx = Math.floor((width + bw - width / 2) / BIRD_ANIMATION_TIME);
  const dy = Math.floor((Math.floor(height / yDivisor) - height / 2) / BIRD_ANIMATION_TIME);
  const clock = new FrameCounter();
  let done = false;
  while (!done) {
    await pbUpdateSceneMap();
    for (let n = clock.tick(); n > 0; n--) {
      if (flybird.x > width / 2 + 10) {
        flybird.x -= dx;
        flybird.y -= dy;
      } else if (flybird.x <= width / 2 + 10 && flybird.x >= 0) {
        flybird.x -= dx;
        flybird.y += dy;
        character.opacity = landing ? 0 : 255; // setOpacity
      } else {
        done = true;
        break;
      }
    }
    if (!done) await Graphics.update();
  }
  flybird.dispose();
}

/** pbFlyAnimation(landing = true) */
export async function pbFlyAnimation(landing = true): Promise<void> {
  await birdAnimation(G.gamePlayer as unknown as GamePlayer, landing, 4);
}

/**
 * pbFlyAnimationNPC(landing = true, eventId) ([004]Fly Animation Other Players.rb).
 * NOTE (Ruby parity): the Gen 4 branch curves the bird by height / 3 instead
 * of height / 4 ([004]:63, 66), so NPCs' birds fly a shallower arc.
 */
export async function pbFlyAnimationNPC(landing: boolean, eventId: number): Promise<void> {
  const event = gameMap().events.get(eventId) as unknown as GameCharacter | undefined;
  // NOTE (Ruby parity): a missing event raises NoMethodError ($game_map.events[eventId].turn_left).
  if (!event) throw new Error(`pbFlyAnimationNPC: no event ${eventId}`);
  await birdAnimation(event, landing, SHOW_GEN_4_BIRD ? 3 : 4);
}
defineScript("pbFlyAnimationNPC", (_c, landing, eventId) => pbFlyAnimationNPC(landing !== false && landing != null, Number(eventId)));
defineScript("pbFlyAnimation", (_c, landing) => pbFlyAnimation(landing === undefined ? true : !!landing));

// [003]HM Handlers.rb: replaces the core's FLY UseMove handler.
// NOTE (Ruby parity): unlike the core's pbFlyToNewLocation it doesn't call
// pbDismountBike, so flying while cycling keeps the bike (pbCancelVehicles
// in transfer_player still drops it on maps where cycling isn't allowed).
HiddenMoveHandlers.UseMove.add("FLY", async (_move, pokemon) => {
  const t = temp();
  if (t.flyDestination == null) {
    await pbMessage(_INTL("You can't use that here."));
    return false;
  }
  if (!(await pbHiddenMoveAnimation(pokemon))) {
    const name = pokemon?.name ?? (G.player as unknown as Player).name;
    await pbMessage(_INTL("{1} used {2}!", name, Move.get("FLY").name));
  }
  (G.stats as GameStats).flyCount += 1;
  await pbFlyAnimation();
  await pbFadeOutIn(async () => {
    const dest = t.flyDestination!;
    G.gameTemp.playerNewMapId = dest[0];
    G.gameTemp.playerNewX = dest[1];
    G.gameTemp.playerNewY = dest[2];
    G.gameTemp.playerNewDirection = 2;
    t.flyDestination = null;
    await (G.scene as unknown as { transferPlayer(): Promise<void> }).transferPlayer();
    gameMap().autoplay();
    gameMap().refresh();
  });
  await pbFlyAnimation(false);
  pbEraseEscapePoint();
  return true;
});
