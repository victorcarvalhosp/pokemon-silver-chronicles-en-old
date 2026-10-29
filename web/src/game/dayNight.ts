// Port of 012_Overworld/003_Overworld_Time.rb: PBDayNight and pbDayNightTint.
// Uses the real clock, like Essentials.

import { Tone } from "../rgss/types";
import { Graphics } from "../rgss/Graphics";
import { FRAME_RATE } from "./GameCharacter";
import { G } from "./globals";
import { mapMetadata } from "./metadata";

const TIME_SHADING = true; // Settings::TIME_SHADING

const HOURLY_TONES: readonly Tone[] = [
  new Tone(-70, -90, 15, 55), new Tone(-70, -90, 15, 55), new Tone(-70, -90, 15, 55), // midnight
  new Tone(-70, -90, 15, 55), new Tone(-60, -70, -5, 50), new Tone(-40, -50, -35, 50),
  new Tone(-40, -50, -35, 50), new Tone(-40, -50, -35, 50), new Tone(-40, -50, -35, 50), // 6 AM
  new Tone(-20, -25, -15, 20), new Tone(0, 0, 0, 0), new Tone(0, 0, 0, 0),
  new Tone(0, 0, 0, 0), new Tone(0, 0, 0, 0), new Tone(0, 0, 0, 0), // noon
  new Tone(0, 0, 0, 0), new Tone(0, 0, 0, 0), new Tone(0, 0, 0, 0),
  new Tone(-5, -30, -20, 0), new Tone(-15, -60, -10, 20), new Tone(-15, -60, -10, 20), // 6 PM
  new Tone(-40, -75, 5, 40), new Tone(-70, -90, 15, 55), new Tone(-70, -90, 15, 55),
];

export function pbGetTimeNow(): Date {
  return new Date();
}

const cachedTone = new Tone();
let lastUpdate: number | null = null;

export const PBDayNight = {
  isDay: (time = pbGetTimeNow()) => time.getHours() >= 5 && time.getHours() < 20,
  isNight: (time = pbGetTimeNow()) => time.getHours() >= 20 || time.getHours() < 5,
  isMorning: (time = pbGetTimeNow()) => time.getHours() >= 5 && time.getHours() < 10,
  isAfternoon: (time = pbGetTimeNow()) => time.getHours() >= 14 && time.getHours() < 17,
  isEvening: (time = pbGetTimeNow()) => time.getHours() >= 17 && time.getHours() < 20,

  getShade(): number {
    let time = minutes();
    if (time > 12 * 60) time = 24 * 60 - time;
    return Math.floor((255 * time) / (12 * 60)); // Integer division in Ruby
  },

  getTone(): Tone {
    if (!TIME_SHADING) return cachedTone;
    if (lastUpdate == null || Graphics.frameCount - lastUpdate >= FRAME_RATE * 30) {
      const realMinutes = minutes();
      const hour = Math.floor(realMinutes / 60);
      const minute = realMinutes % 60;
      const tone = HOURLY_TONES[hour]!;
      const next = HOURLY_TONES[(hour + 1) % 24]!;
      cachedTone.red = ((next.red - tone.red) * minute) / 60 + tone.red;
      cachedTone.green = ((next.green - tone.green) * minute) / 60 + tone.green;
      cachedTone.blue = ((next.blue - tone.blue) * minute) / 60 + tone.blue;
      cachedTone.gray = ((next.gray - tone.gray) * minute) / 60 + tone.gray;
      lastUpdate = Graphics.frameCount;
    }
    return cachedTone;
  },
};

function minutes(): number {
  const now = pbGetTimeNow();
  return now.getHours() * 60 + now.getMinutes();
}

/** pbDayNightTint: sets `object.tone` to the time-of-day tone on outdoor maps. */
export function pbDayNightTint(object: { tone: Tone }): void {
  // return if !$scene.is_a?(Scene_Map)
  if (typeof (G.scene as { transferPlayer?: unknown } | null)?.transferPlayer !== "function") return;
  const map = G.gameMap;
  if (TIME_SHADING && map && mapMetadata(map.mapId)?.outdoorMap) object.tone.set(PBDayNight.getTone());
  else object.tone.set(0, 0, 0, 0);
}

/** pbIsWeekday(wdayVariable, *arg) (012_Overworld/003_Overworld_Time.rb). */
export function pbIsWeekday(wdayVariable: number, ...days: number[]): boolean {
  const wday = pbGetTimeNow().getDay();
  if (wdayVariable > 0) G.gameVariables.set(wdayVariable, ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wday]);
  return days.includes(wday);
}
