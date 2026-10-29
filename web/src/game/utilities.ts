// The parts of 019_Utilities/001_Utilities.rb no other module ports:
// temperature and constants helpers, timed events, pbGetPlayerGraphic,
// getRandomName, pbConvertItemToItem/ToPokemon, pbHideVisibleObjects /
// pbShowObjects / pbLoadRpgxpScene (the v20.1 Hotfixes' version,
// Overworld bug fixes.rb:42-59) and pbScreenCapture with the F8 key that
// 001_Technical/004_Input.rb binds to it.
//
// The rest of the file is ported where it's used (see docs/script-coverage.md).

import { assetExists } from "../core/assets";
import { Item } from "../data/gameData/item";
import { PlayerMetadata } from "../data/gameData/playerMetadata";
import { Species } from "../data/gameData/species";
import { TrainerType } from "../data/gameData/trainerType";
import { liveObjects } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { pbResolveBitmap } from "../ui/rpgCache";
import {
  moonphase, pbGetSeasonName, pbGetTimeNow, pbIsAutumn, pbIsFall, pbIsMonth, pbIsSeason, pbIsSpring, pbIsSummer, pbIsWinter,
  zodiac, zodiacComplements, zodiacOpposite, zodiacPartners,
} from "./dayNight";
import { getRandomNameEx } from "./frontier/generatorTrainers";
import { pbSEPlay } from "./GameSystem";
import { G } from "./globals";
import { defineScript } from "./scriptApi";

/** Converts a Celsius temperature to Fahrenheit. */
export function toFahrenheit(celsius: number): number {
  return Math.round((celsius * 9.0) / 5.0) + 32;
}

/** Converts a Fahrenheit temperature to Celsius. */
export function toCelsius(fahrenheit: number): number {
  return Math.round(((fahrenheit - 32) * 5.0) / 9.0);
}

//===============================================================================
// Constants utilities (unused in Ruby; modules are plain objects here)
//===============================================================================
export function isConst(val: unknown, mod: Record<string, unknown> | null | undefined, constant: string): boolean {
  if (!mod || !(constant in mod)) return false;
  return val === mod[constant];
}

export function hasConst(mod: Record<string, unknown> | null | undefined, constant: string | null | undefined): boolean {
  if (!mod || constant == null) return false;
  return constant in mod;
}

export function getConst(mod: Record<string, unknown> | null | undefined, constant: string | null | undefined): unknown {
  if (!mod || constant == null) return null;
  return mod[constant] ?? null;
}

//===============================================================================
// Event utilities
//===============================================================================
const refreshMap = () => (G.gameMap as unknown as { refresh?(): void } | null)?.refresh?.();
const nowSeconds = () => pbGetTimeNow().getTime() / 1000; // Time#to_f

export function pbTimeEvent(variableNumber: number | null, secs = 86_400): void {
  if (!G.gameVariables) return;
  if (variableNumber == null || variableNumber < 0) return;
  if (secs < 0) secs = 0;
  G.gameVariables.set(variableNumber, [nowSeconds(), secs]);
  refreshMap();
}

export function pbTimeEventDays(variableNumber: number | null, days = 0): void {
  if (!G.gameVariables) return;
  if (variableNumber == null || variableNumber < 0) return;
  if (days < 0) days = 0;
  const time = nowSeconds();
  const expiry = (time % 86_400.0) + days * 86_400.0;
  G.gameVariables.set(variableNumber, [time, expiry - time]);
  refreshMap();
}

export function pbTimeEventValid(variableNumber: number | null): boolean {
  if (!G.gameVariables) return false;
  if (variableNumber == null || variableNumber < 0) return false;
  let ret = false;
  const value = G.gameVariables.get(variableNumber);
  if (Array.isArray(value)) {
    ret = nowSeconds() - (value[0] as number) > (value[1] as number); // value[1] is age in seconds
    if ((value[1] as number) <= 0) ret = false; // zero age
  }
  if (!ret) {
    G.gameVariables.set(variableNumber, 0);
    refreshMap();
  }
  return ret;
}

//===============================================================================
// Player-related utilities, random name generator
//===============================================================================
/** pbGetPlayerGraphic (unused in Ruby) */
export function pbGetPlayerGraphic(): string {
  const id = (G.player as unknown as { characterID: number } | null)?.characterID ?? 0;
  if (id < 1) return "";
  const meta = PlayerMetadata.get(id);
  if (!meta) return "";
  // NOTE (Ruby parity): player_front_sprite_filename returns nil when there's
  // no sprite, and so does this.
  return TrainerType.playerFrontSpriteFilename(meta.trainerType ?? "", pbResolveBitmap, (G.player as unknown as { outfit?: number }).outfit ?? 0) ?? (null as unknown as string);
}

export function getRandomName(maxLength = 100): string {
  return getRandomNameEx(2, null, null, maxLength);
}

//===============================================================================
// Event command helpers
//===============================================================================
export function pbConvertItemToItem(variable: number, array: unknown[]): void {
  const item = Item.get(G.gameVariables.get(variable) as string);
  G.gameVariables.set(variable, null);
  for (let i = 0; i < Math.floor(array.length / 2); i++) {
    if (item.id !== array[2 * i]) continue;
    G.gameVariables.set(variable, array[2 * i + 1]);
    return;
  }
}

export function pbConvertItemToPokemon(variable: number, array: unknown[]): void {
  const item = Item.get(G.gameVariables.get(variable) as string);
  G.gameVariables.set(variable, null);
  for (let i = 0; i < Math.floor(array.length / 2); i++) {
    if (item.id !== array[2 * i]) continue;
    G.gameVariables.set(variable, Species.get(array[2 * i + 1] as string).id);
    return;
  }
}

//===============================================================================
// Scenes
//===============================================================================
type Shown = { visible: boolean; isDisposed?(): boolean };

/**
 * pbHideVisibleObjects: hides every visible sprite, viewport and plane
 * (ObjectSpace.each_object; windows are made of sprites here, and the map's
 * tiles go with the map scene's spritesets).
 */
export function pbHideVisibleObjects(): Shown[] {
  const visibleObjects: Shown[] = [];
  for (const o of liveObjects() as unknown as Shown[]) {
    if (o.isDisposed?.() || !o.visible) continue;
    visibleObjects.push(o);
    o.visible = false;
  }
  return visibleObjects;
}

export function pbShowObjects(visibleObjects: Shown[]): void {
  for (const o of visibleObjects) {
    if (o.isDisposed?.()) continue;
    o.visible = true;
  }
}

interface MapSceneLike { dispose(): void; createSpritesets(): Promise<void>; transferPlayer?: unknown }

/** pbLoadRpgxpScene(scene): runs another scene on top of the map, then goes back to it. */
export async function pbLoadRpgxpScene(scene: { main(): Promise<void> }): Promise<void> {
  const isMap = (s: unknown) => typeof (s as MapSceneLike | null)?.transferPlayer === "function";
  if (!isMap(G.scene)) return;
  const oldscene = G.scene as unknown as MapSceneLike;
  G.scene = scene as never;
  Graphics.freeze();
  oldscene.dispose();
  const visibleObjects = pbHideVisibleObjects();
  await Graphics.transition();
  Graphics.freeze();
  while (G.scene && !isMap(G.scene)) await (G.scene as unknown as { main(): Promise<void> }).main();
  await Graphics.transition();
  Graphics.freeze();
  G.scene = oldscene as never;
  await oldscene.createSpritesets();
  pbShowObjects(visibleObjects);
  await Graphics.transition();
}

/**
 * pbScreenCapture: saves the screen as "[YYYY-MM-DD] HH_MM_SS.mmm.png". The
 * browser's download takes the place of the save folder.
 */
export function pbScreenCapture(): void {
  const t = pbGetTimeNow();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  const filestart = `[${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}] ${p(t.getHours())}_${p(t.getMinutes())}_${p(t.getSeconds())}.${p(t.getMilliseconds(), 3)}`;
  if (typeof document === "undefined") return;
  const bitmap = Graphics.snapToBitmap();
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap.canvas, 0, 0);
  bitmap.dispose();
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${filestart}.png`;
  a.click();
  if (assetExists("Audio/SE/Pkmn exp full")) pbSEPlay("Pkmn exp full");
}

// 004_Input.rb: Input.update takes a screenshot on F8.
Input.addUpdateHook(() => {
  if (Input.trigger(Input.F8)) pbScreenCapture();
});

defineScript("pbTimeEvent", (_c, v, secs) => pbTimeEvent(v as number, secs == null ? undefined : Number(secs)));
defineScript("pbTimeEventDays", (_c, v, days) => pbTimeEventDays(v as number, days == null ? undefined : Number(days)));
defineScript("pbTimeEventValid", (_c, v) => pbTimeEventValid(v as number));
defineScript("pbConvertItemToItem", (_c, v, array) => pbConvertItemToItem(Number(v), array as unknown[]));
defineScript("pbConvertItemToPokemon", (_c, v, array) => pbConvertItemToPokemon(Number(v), array as unknown[]));
defineScript("toFahrenheit", (_c, c) => toFahrenheit(Number(c)));
defineScript("toCelsius", (_c, f) => toCelsius(Number(f)));
defineScript("getRandomName", (_c, max) => getRandomName(max == null ? undefined : Number(max)));
defineScript("pbScreenCapture", () => pbScreenCapture());

// 012_Overworld/003_Overworld_Time.rb's helpers, for event scripts.
defineScript("moonphase", () => moonphase());
defineScript("zodiac", (_c, m, d) => zodiac(Number(m), Number(d)));
defineScript("zodiacOpposite", (_c, s) => zodiacOpposite(Number(s)));
defineScript("zodiacPartners", (_c, s) => zodiacPartners(Number(s)));
defineScript("zodiacComplements", (_c, s) => zodiacComplements(Number(s)));
defineScript("pbIsMonth", (_c, v, ...m) => pbIsMonth(Number(v), ...m.map(Number)));
defineScript("pbIsSeason", (_c, v, ...m) => pbIsSeason(Number(v), ...m.map(Number)));
defineScript("pbIsSpring", () => pbIsSpring());
defineScript("pbIsSummer", () => pbIsSummer());
defineScript("pbIsAutumn", () => pbIsAutumn());
defineScript("pbIsFall", () => pbIsFall());
defineScript("pbIsWinter", () => pbIsWinter());
defineScript("pbGetSeasonName", (_c, s) => pbGetSeasonName(Number(s)));
