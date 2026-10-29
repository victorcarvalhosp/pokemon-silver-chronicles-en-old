// Port of Plugins/Pokemon Silver Chronicles Helpers/CustomStairs.rb (the
// game's own staircase transfers, e.g. the Ruins of Alph: the player walks
// into the stairwell, the map changes, and they walk out of the other end)
// and transferPlayer from Utils.rb.

import { pbFadeOutIn } from "../../ui/fades";
import { pbWait } from "../../ui/scenes/frames";
import { Followers } from "../following/Followers";
import { FollowingPkmn } from "../following/FollowingPkmn";
import type { GameMap } from "../GameMap";
import type { GamePlayer } from "../GamePlayer";
import { pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import { defineScript } from "../scriptApi";
import { pbMoveRoute, PBMoveRoute } from "../scripts/moveRoute";
import { pbDismountBike } from "./bicycle";

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
/** Graphics.frame_rate in the original game: pbWait counts these frames. */
const FRAME_RATE = 40;

/**
 * transferPlayer(map, x, y, direction = 0) (Utils.rb): a "Transfer Player"
 * inside a fade, dismounting the bike.
 */
export async function transferPlayer(map: number, x: number, y: number, direction = 0): Promise<void> {
  await pbFadeOutIn(async () => {
    const t = G.gameTemp;
    t.playerTransferring = true;
    t.playerNewMapId = map;
    t.playerNewX = x;
    t.playerNewY = y;
    t.playerNewDirection = direction;
    await pbDismountBike();
    await (G.scene as unknown as { transferPlayer(): Promise<void> }).transferPlayer();
    // $game_map.refresh
    gameMap().needRefresh = true; // in case player moves to the same map
  });
}
defineScript("transferPlayer", (_c, map, x, y, direction) => transferPlayer(Number(map), Number(x), Number(y), Number(direction ?? 0)));

export const CustomStairs = {
  STAIRCASE_UP_FROM_BEHIND: 965,
  STAIRCASE_DOWN_ANIMATION_ACTIVE: 966,

  DIRECTION_DOWN: 2, // This is the direction code RPG Maker uses
  DIRECTION_UP: 8, // This is the direction code RPG Maker uses
  ANIMATION_SPEED: 2,

  async transferUp(map: number, x: number, y: number, shortStair = false): Promise<void> {
    const C = CustomStairs;
    const p = gamePlayer();
    // This event just activates if the user is facing up or down
    if (p.direction !== C.DIRECTION_DOWN && p.direction !== C.DIRECTION_UP) return;
    // Although this pokemon movement seems unnecessary, it actually
    // fixes a glitch where the Pokemon jumps weirdly behind the playes when moving
    // backwards and the Pokemon is on left or right.
    FollowingPkmn.moveRoute([PBMoveRoute.Wait, FRAME_RATE]);

    if (p.direction === C.DIRECTION_DOWN) {
      G.gameSwitches.set(C.STAIRCASE_UP_FROM_BEHIND, true);
      gameMap().refresh();
      if (shortStair) {
        pbMoveRoute(p, [PBMoveRoute.ThroughOn,
          PBMoveRoute.Down,
          PBMoveRoute.ThroughOff,
          PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
          PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
          PBMoveRoute.Backward]);
      } else {
        pbMoveRoute(p, [PBMoveRoute.ThroughOn,
          PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
          PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
          PBMoveRoute.Backward]);
      }
      await pbWait(Math.floor(FRAME_RATE / C.ANIMATION_SPEED));
    } else {
      pbMoveRoute(p, [PBMoveRoute.ThroughOn,
        PBMoveRoute.AlwaysOnTopOn,
        PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
        PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
        PBMoveRoute.Up,
        PBMoveRoute.Up]);
      await pbWait(Math.floor((FRAME_RATE * 2) / C.ANIMATION_SPEED));
    }

    G.gameSwitches.set(C.STAIRCASE_UP_FROM_BEHIND, false);
    G.gameSwitches.set(C.STAIRCASE_DOWN_ANIMATION_ACTIVE, true);

    pbSEPlay("Exit Door");

    pbMoveRoute(p, [PBMoveRoute.ThroughOff,
      PBMoveRoute.AlwaysOnTopOff]);

    await FollowingPkmn.toggleOff(false);
    await transferPlayer(map, x, y, C.DIRECTION_UP);

    if (shortStair) {
      pbMoveRoute(p, [
        PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
        PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
        PBMoveRoute.Up,
        PBMoveRoute.ChangeSpeed, 3,
        PBMoveRoute.ChangeFreq, 3,
      ]);
    } else {
      pbMoveRoute(p, [
        PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
        PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
        PBMoveRoute.Up,
        PBMoveRoute.ChangeSpeed, 3,
        PBMoveRoute.ChangeFreq, 3,
        PBMoveRoute.Up,
      ]);
    }

    await pbWait(FRAME_RATE);
    Followers.putFollowersOnPlayer();
    await FollowingPkmn.toggleOn(false);
    G.gameSwitches.set(C.STAIRCASE_DOWN_ANIMATION_ACTIVE, false);
    gameMap().refresh();
  },

  async transferDown(map: number, x: number, y: number, _shortStair = false): Promise<void> {
    const C = CustomStairs;
    const p = gamePlayer();
    // This event just activates if the user is facing up or down
    if (p.direction !== C.DIRECTION_DOWN && p.direction !== C.DIRECTION_UP) return;
    // Although this pokemon movement seems unnecessary, it actually
    // fixes a glitch where the Pokemon jumps weirdly behind the playes when moving
    // backwards and the Pokemon is on left or right.
    FollowingPkmn.moveRoute([PBMoveRoute.Wait, FRAME_RATE]);
    G.gameSwitches.set(C.STAIRCASE_DOWN_ANIMATION_ACTIVE, true);
    G.gameSwitches.set(C.STAIRCASE_UP_FROM_BEHIND, false); // Just a safety-check
    gameMap().refresh();

    pbMoveRoute(p, [PBMoveRoute.TurnUp,
      PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
      PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
      PBMoveRoute.Backward,
      PBMoveRoute.ThroughOn]);

    await pbWait(Math.floor(FRAME_RATE / C.ANIMATION_SPEED));

    G.gameSwitches.set(C.STAIRCASE_UP_FROM_BEHIND, false);

    pbSEPlay("Exit Door");

    pbMoveRoute(p, [PBMoveRoute.ThroughOff,
      PBMoveRoute.AlwaysOnTopOn]);

    await transferPlayer(map, x, y, C.DIRECTION_UP);

    await FollowingPkmn.toggleOff(false);

    // Still going down stairs after map transfer
    pbMoveRoute(p, [
      PBMoveRoute.TurnUp,
      PBMoveRoute.ChangeSpeed, C.ANIMATION_SPEED,
      PBMoveRoute.ChangeFreq, C.ANIMATION_SPEED,
      PBMoveRoute.Backward,
      PBMoveRoute.ChangeSpeed, 3,
      PBMoveRoute.ChangeFreq, 3,
      PBMoveRoute.Down,
      PBMoveRoute.AlwaysOnTopOff,
    ]);

    await pbWait(FRAME_RATE);
    await FollowingPkmn.toggleOn(false);
    Followers.putFollowersOnPlayer();

    G.gameSwitches.set(C.STAIRCASE_DOWN_ANIMATION_ACTIVE, false);
    gameMap().refresh();
  },
};

defineScript("CustomStairs.transferUp", (_c, map, x, y, shortStair) =>
  CustomStairs.transferUp(Number(map), Number(x), Number(y), !!shortStair));
defineScript("CustomStairs.transferDown", (_c, map, x, y, shortStair) =>
  CustomStairs.transferDown(Number(map), Number(x), Number(y), !!shortStair));
