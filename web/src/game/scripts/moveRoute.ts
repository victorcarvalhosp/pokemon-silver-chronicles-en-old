// pbMoveRoute, PBMoveRoute and pbWait (012_Overworld/001_Overworld.rb), and
// Graphics.frame_rate, for event scripts (e.g. common event 46).

import type { MoveCommand, MoveRoute } from "../../data/events";
import type { GameCharacter } from "../GameCharacter";
import { defineScript } from "../scriptApi";
import { pbWaitSeconds } from "./overworld";

/** module PBMoveRoute: the RPG Maker move command codes. */
export const PBMoveRoute = {
  Down: 1, Left: 2, Right: 3, Up: 4, LowerLeft: 5, LowerRight: 6, UpperLeft: 7, UpperRight: 8,
  Random: 9, TowardPlayer: 10, AwayFromPlayer: 11, Forward: 12, Backward: 13,
  Jump: 14, // xoffset, yoffset
  Wait: 15, // frames
  TurnDown: 16, TurnLeft: 17, TurnRight: 18, TurnUp: 19, TurnRight90: 20, TurnLeft90: 21, Turn180: 22,
  TurnRightOrLeft90: 23, TurnRandom: 24, TurnTowardPlayer: 25, TurnAwayFromPlayer: 26,
  SwitchOn: 27, SwitchOff: 28, ChangeSpeed: 29, ChangeFreq: 30, // 1 param each
  WalkAnimeOn: 31, WalkAnimeOff: 32, StepAnimeOn: 33, StepAnimeOff: 34, DirectionFixOn: 35, DirectionFixOff: 36,
  ThroughOn: 37, ThroughOff: 38, AlwaysOnTopOn: 39, AlwaysOnTopOff: 40,
  Graphic: 41, // Name, hue, direction, pattern
  Opacity: 42, Blending: 43, PlaySE: 44, Script: 45, // 1 param each
  ScriptAsync: 101, // 1 param
} as const;
for (const [name, code] of Object.entries(PBMoveRoute)) defineScript(`PBMoveRoute::${name}`, () => code);

// The same names tools/convert/events.rb gives converted move routes.
const SIMPLE: Record<number, string> = {
  1: "down", 2: "left", 3: "right", 4: "up", 5: "lowerLeft", 6: "lowerRight", 7: "upperLeft", 8: "upperRight",
  9: "random", 10: "towardPlayer", 11: "awayFromPlayer", 12: "forward", 13: "backward",
  16: "turnDown", 17: "turnLeft", 18: "turnRight", 19: "turnUp", 20: "turnRight90", 21: "turnLeft90", 22: "turn180",
  23: "turnRightOrLeft90", 24: "turnRandom", 25: "turnTowardPlayer", 26: "turnAwayFromPlayer",
  31: "walkAnimeOn", 32: "walkAnimeOff", 33: "stepAnimeOn", 34: "stepAnimeOff", 35: "directionFixOn", 36: "directionFixOff",
  37: "throughOn", 38: "throughOff", 39: "alwaysOnTopOn", 40: "alwaysOnTopOff",
};

/** RPG::MoveCommand.new(code, parameters) in the converted JSON form. */
function moveCommand(code: number, p: unknown[] = []): MoveCommand {
  switch (code) {
    case 14: return { move: "jump", x: p[0] as number, y: p[1] as number };
    case 15: return { move: "wait", seconds: Number(p[0]) / 20 };
    case 27: return { move: "switchOn", id: p[0] as number };
    case 28: return { move: "switchOff", id: p[0] as number };
    case 29: return { move: "speed", value: p[0] as number };
    case 30: return { move: "frequency", value: p[0] as number };
    case 41: return { move: "graphic", characterName: p[0] as string, characterHue: p[1] as number, direction: p[2] as number, pattern: p[3] as number };
    case 42: return { move: "opacity", value: p[0] as number };
    case 43: return { move: "blendType", value: p[0] as number };
    case 44: return { move: "playSe", audio: typeof p[0] === "string" ? { name: p[0], volume: 80, pitch: 100 } : p[0] } as MoveCommand;
    case 45: return { move: "raw", code, parameters: p }; // TODO(move route scripts): Ruby strings
    default: return { move: SIMPLE[code] ?? "raw" } as MoveCommand;
  }
}

/** pbMoveRoute(event, commands, waitComplete = false) */
export function pbMoveRoute(event: GameCharacter | null, commands: unknown[], _waitComplete = false): MoveRoute {
  const list: MoveCommand[] = [moveCommand(PBMoveRoute.ThroughOn)];
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i] as number;
    switch (c) {
      case PBMoveRoute.Wait: case PBMoveRoute.SwitchOn: case PBMoveRoute.SwitchOff: case PBMoveRoute.ChangeSpeed:
      case PBMoveRoute.ChangeFreq: case PBMoveRoute.Opacity: case PBMoveRoute.Blending: case PBMoveRoute.PlaySE:
      case PBMoveRoute.Script:
        list.push(moveCommand(c, [commands[i + 1]]));
        i += 1;
        break;
      case PBMoveRoute.ScriptAsync:
        list.push(moveCommand(PBMoveRoute.Script, [commands[i + 1]]));
        list.push(moveCommand(PBMoveRoute.Wait, [0]));
        i += 1;
        break;
      case PBMoveRoute.Jump:
        list.push(moveCommand(c, [commands[i + 1], commands[i + 2]]));
        i += 2;
        break;
      case PBMoveRoute.Graphic:
        list.push(moveCommand(c, [commands[i + 1], commands[i + 2], commands[i + 3], commands[i + 4]]));
        i += 4;
        break;
      default:
        list.push(moveCommand(c));
    }
  }
  list.push(moveCommand(PBMoveRoute.ThroughOff));
  const route: MoveRoute = { repeat: false, skippable: true, list };
  event?.forceMoveRoute(route);
  return route;
}
defineScript("pbMoveRoute", (_c, event, commands, wait) => pbMoveRoute(event as GameCharacter | null, (commands as unknown[]) ?? [], !!wait));

/** Graphics.frame_rate as event scripts see it: Essentials' 40, so "Graphics.frame_rate / 5" stays 0.2 s. */
const ESSENTIALS_FRAME_RATE = 40;
/** pbWait(numFrames): numFrames at Graphics.frame_rate. */
defineScript("pbWait", (_c, frames) => pbWaitSeconds(Number(frames) / ESSENTIALS_FRAME_RATE));
defineScript("Graphics.frame_rate", () => ESSENTIALS_FRAME_RATE);
