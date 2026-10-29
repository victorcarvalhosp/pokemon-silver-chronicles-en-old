// Port of Plugins/Cable Car/Script.rb (RSE Cable Car Scene by Zaffre): the
// ride up or down Mt. Chimney's cable car, then a map transfer. Events call
// `CableCarScene.new(going_up, map_id, map_x, map_y, direction, weather)`.
//
// The scene steps its sprites by fixed amounts between pbWait(n) calls,
// which count original 40 fps frames (ui/scenes/frames.ts' pbWait).

import { rand } from "../../core/random";
import { Sprite } from "../../rgss/display";
import { preloadBitmaps, RPGCache } from "../../ui/rpgCache";
import { pbDisposeSpriteHash } from "../../ui/messageConfig";
import { pbWait } from "../../ui/scenes/frames";
import type { GameMap } from "../GameMap";
import { pbBGMFade, pbBGMPlay, pbBGMStop } from "../GameSystem";
import { G } from "../globals";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";

/** The random hiker/NPC has a 1/64 chance of appearing (1 = always appears). */
const HIKER_PERCENTAGE = 64;
/** The NPCs that can appear (Graphics/Pictures/CableCar). */
const HIKER_FILE_NAMES = ["hiker", "hiker1"];
/** Background music while riding (Audio/BGM). */
const CABLE_CAR_BGM = "Cable Car";

const DIR = "Graphics/Pictures/CableCar/";
const GRAPHICS = ["black", "bg", "trees", "ground", "cable_car", "player_male", "player_female", "door", "pole", "ash", ...HIKER_FILE_NAMES];

/** Sprite.new + Bitmap.new("Graphics/Pictures/CableCar/<name>") */
function picture(name: string): Sprite {
  const s = new Sprite(null);
  s.setBitmap(RPGCache.loadBitmap(DIR, name));
  return s;
}

/** CableCarScene.new(going_up, map_id, map_x, map_y, direction = 2, weather = true) */
export async function cableCarScene(goingUp: boolean, mapId: number, mapX: number, mapY: number, direction = 2, weather = true): Promise<void> {
  await preloadBitmaps(GRAPHICS.map((g) => DIR + g));
  pbBGMFade(10);
  const sprites: Record<string, Sprite> = {};
  sprites.Black = picture("black");
  sprites.Black.z = 99999;
  sprites.Black.opacity = 0;
  for (let i = 0; i <= 14; i++) {
    sprites.Black.opacity += 17;
    await pbWait(1);
  }
  let hiker = false;
  let hikerName = "";
  if (rand(HIKER_PERCENTAGE) === 0) {
    hiker = true;
    hikerName = HIKER_FILE_NAMES[rand(HIKER_FILE_NAMES.length)]!;
  }
  pbBGMPlay(CABLE_CAR_BGM);
  await pbWait(10);
  sprites.BG = picture("bg");
  sprites.BG.z = 90000;
  const s = sprites;
  /** Ruby's `@sprites["Hiker"].x += 2 if hiker` etc. */
  const hk = (fn: (h: Sprite) => void) => { if (hiker) fn(s.Hiker!); };
  const ash = (fn: (a: Sprite) => void) => { if (weather) fn(s.Ash!); };
  /** The Black fade in/out at the start and end of the ride (opacity clamps at 0/255). */
  const fadeStep = (i: number) => {
    if (i < 4) s.Black!.opacity = Math.max(0, s.Black!.opacity - 50);
    else if (i === 4) s.Black!.opacity = Math.max(0, s.Black!.opacity - 55);
    else if (i >= 46 && i < 50) s.Black!.opacity = Math.min(255, s.Black!.opacity + 50);
    else if (i === 50) s.Black!.opacity = Math.min(255, s.Black!.opacity + 55);
  };
  if (goingUp) {
    s.Trees = picture("trees");
    s.Trees.x = -1024;
    s.Trees.y = 190;
    s.Trees.z = 92000;
    if (hiker) {
      // hiker2 = "hiker1" (unused)
      s.Hiker = picture(hikerName);
      s.Hiker.x = 200;
      s.Hiker.y = 286;
      s.Hiker.z = 93000;
    }
    s.Ground = picture("ground");
    s.Ground.x = -1792;
    s.Ground.y = -160;
    s.Ground.z = 94000;
    s.CC = picture("cable_car");
    s.CC.x = 406;
    s.CC.y = 98;
    s.CC.z = 96000;
    s.Player = picture((G.player as unknown as Player).female() ? "player_female" : "player_male");
    s.Player.x = 438;
    s.Player.y = 158;
    s.Player.z = 96100;
    s.Door = picture("door");
    s.Door.x = 454;
    s.Door.y = 210;
    s.Door.z = 96200;
    s.Poles = picture("pole");
    s.Poles.x = -1024;
    s.Poles.y = -638;
    s.Poles.z = 98000;
    if (weather) {
      s.Ash = picture("ash");
      s.Ash.opacity = 0;
      s.Ash.x = -1650;
      s.Ash.y = -650;
      s.Ash.z = 99000;
    }
    for (let i = 0; i <= 50; i++) {
      fadeStep(i);
      if (i >= 26 && i <= 30) ash((a) => { a.opacity = Math.min(255, a.opacity + 50); });
      ash((a) => { a.y += 3; a.x += 8; });
      s.Ground.y += 1; s.Ground.x += 4;
      hk((h) => { h.x += 2; });
      s.CC.x -= 2; s.Door.x -= 2; s.Player.x -= 2;
      s.Poles.x += 6; s.Poles.y += 3;
      await pbWait(2);
      ash((a) => { a.y += 3; a.x += 8; });
      s.Ground.y += 1; s.Ground.x += 4;
      hk((h) => { h.y += 1; h.x += 4; });
      s.Trees.y += 1; s.Trees.x += 1;
      s.Poles.x += 6; s.Poles.y += 3;
      await pbWait(2);
      ash((a) => { a.y += 3; a.x += 8; });
      s.Ground.y += 1; s.Ground.x += 4;
      hk((h) => { h.y += 1; h.x += 4; });
      s.Poles.x += 6; s.Poles.y += 3;
      await pbWait(2);
      ash((a) => { a.y += 3; a.x += 8; });
      s.Ground.y += 1; s.Ground.x += 4;
      hk((h) => { h.y += 1; h.x += 4; });
      s.Trees.y += 1; s.Trees.x += 1;
      s.CC.y -= 2; s.CC.x -= 2;
      s.Door.y -= 2; s.Door.x -= 2;
      s.Player.y -= 2; s.Player.x -= 2;
      if (i % 2 === 0) {
        s.Player.y -= 2;
        hk((h) => { h.y -= 2; });
      } else {
        s.Player.y += 2;
        hk((h) => { h.y += 2; });
      }
      s.Poles.x += 6; s.Poles.y += 3;
      await pbWait(2);
    }
  } else {
    s.Trees = picture("trees");
    s.Trees.x = -922;
    s.Trees.y = 292;
    s.Trees.z = 92000;
    if (hiker) {
      s.Hiker = picture(hikerName);
      s.Hiker.x = 190;
      s.Hiker.y = 276;
      s.Hiker.z = 93000;
    }
    s.Ground = picture("ground");
    s.Ground.x = -976;
    s.Ground.y = 44;
    s.Ground.z = 94000;
    s.CC = picture("cable_car");
    s.CC.x = 202;
    s.CC.y = -4;
    s.CC.z = 96000;
    // NOTE (Ruby parity): going down, the game's copy picks the graphic by
    //       switch 140 instead of the player's gender (Script.rb:203-205: the
    //       gender check is commented out), unlike the ride up.
    s.Player = picture(G.gameSwitches.get(140) ? "player_male" : "player_female");
    s.Player.x = 234;
    s.Player.y = 56;
    s.Player.z = 96100;
    s.Door = picture("door");
    s.Door.x = 250;
    s.Door.y = 108;
    s.Door.z = 96200;
    s.Poles = picture("pole");
    s.Poles.x = 200;
    s.Poles.y = -26;
    s.Poles.z = 98000;
    if (weather) {
      s.Ash = picture("ash");
      s.Ash.opacity = 250;
      s.Ash.x = -18;
      s.Ash.y = -38;
      s.Ash.z = 99000;
    }
    for (let i = 0; i <= 50; i++) {
      fadeStep(i);
      if (i >= 26 && i <= 30) ash((a) => { a.opacity = Math.max(0, a.opacity - 50); });
      ash((a) => { a.y -= 3; a.x -= 8; });
      s.Ground.y -= 1; s.Ground.x -= 4;
      hk((h) => { h.x -= 2; });
      s.CC.x += 2; s.Door.x += 2; s.Player.x += 2;
      s.Poles.x -= 6; s.Poles.y -= 3;
      await pbWait(2);
      ash((a) => { a.y -= 3; a.x -= 8; });
      s.Ground.y -= 1; s.Ground.x -= 4;
      hk((h) => { h.y -= 1; h.x -= 4; });
      s.Trees.y -= 1; s.Trees.x -= 1;
      s.Poles.x -= 6; s.Poles.y -= 3;
      await pbWait(2);
      ash((a) => { a.y -= 3; a.x -= 8; });
      s.Ground.y -= 1; s.Ground.x -= 4;
      hk((h) => { h.y -= 1; h.x -= 4; });
      s.Poles.x -= 6; s.Poles.y -= 3;
      await pbWait(2);
      ash((a) => { a.y -= 3; a.x -= 8; });
      s.Ground.y -= 1; s.Ground.x -= 4;
      hk((h) => { h.y -= 1; h.x -= 4; });
      s.Trees.y -= 1; s.Trees.x -= 1;
      s.CC.y += 2; s.CC.x += 2;
      s.Door.y += 2; s.Door.x += 2;
      s.Player.y += 2; s.Player.x += 2;
      if (i % 2 === 0) {
        s.Player.y -= 2;
        hk((h) => { h.y -= 2; });
      } else {
        s.Player.y += 2;
        hk((h) => { h.y += 2; });
      }
      s.Poles.x -= 6; s.Poles.y -= 3;
      await pbWait(2);
    }
  }
  for (const k of ["BG", "Trees", "Ground", "CC", "Player", "Poles", "Door"]) s[k]!.dispose();
  if (hiker) s.Hiker!.dispose();
  if (weather) s.Ash!.dispose();
  pbBGMFade(3);
  await pbWait(5);
  const t = G.gameTemp;
  t.playerTransferring = true;
  t.playerNewMapId = mapId;
  t.playerNewX = mapX;
  t.playerNewY = mapY;
  t.playerNewDirection = direction;
  pbBGMStop(0);
  await pbWait(5);
  for (let i = 0; i <= 14; i++) {
    s.Black!.opacity -= 17;
    await pbWait(1);
  }
  pbDisposeSpriteHash(sprites as never);
  (G.gameMap as unknown as GameMap).autoplay();
}

defineScript("CableCarScene.new", (_c, goingUp, mapId, mapX, mapY, direction, weather) =>
  cableCarScene(!!goingUp, Number(mapId), Number(mapX), Number(mapY), direction == null ? 2 : Number(direction), weather == null ? true : !!weather));
