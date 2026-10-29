// Port of 012_Overworld/003_Overworld_Time.rb: PBDayNight and pbDayNightTint.
// Uses the real clock, like Essentials.

import { _INTL } from "../core/intl";
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

//===============================================================================
// Moon phases and Zodiac
//===============================================================================
/**
 * Calculates the phase of the moon (in UTC): 0 New Moon, 1 Waxing Crescent,
 * 2 First Quarter, 3 Waxing Gibbous, 4 Full Moon, 5 Waning Gibbous,
 * 6 Last Quarter, 7 Waning Crescent.
 */
export function moonphase(time: Date | null = null): number {
  time ??= pbGetTimeNow();
  const transitions = [
    1.8456618033125, 5.5369854099375, 9.2283090165625, 12.9196326231875,
    16.6109562298125, 20.3022798364375, 23.9936034430625, 27.6849270496875,
  ];
  const mon = time.getMonth() + 1;
  const yy = time.getFullYear() - Math.floor((12 - mon) / 10.0);
  let j = Math.floor(365.25 * (4712 + yy)) + Math.floor(((mon + 9) % 12) * 30.6 + 0.5) + time.getDate() + 59;
  if (j > 2_299_160) j -= Math.floor(Math.floor(yy / 100.0 + 49) * 0.75) - 38;
  // NOTE (Ruby parity): hours are counted as minutes (hour * 60 + min * 60),
  // so the time of day barely moves the phase (003_Overworld_Time.rb:151).
  j += (time.getHours() * 60 + time.getMinutes() * 60 + time.getSeconds()) / 86_400.0;
  let v = (j - 2_451_550.1) / 29.530588853;
  v = v - Math.floor(v) + (v < 0 ? 1 : 0);
  const ag = v * 29.53;
  for (let i = 0; i < transitions.length; i++) if (ag <= transitions[i]!) return i;
  return 0;
}

/** The zodiac sign for a month (1 = January) and day: 0 is Aries, 11 is Pisces. */
export function zodiac(month: number, day: number): number {
  const time = [
    3, 21, 4, 19, // Aries
    4, 20, 5, 20, // Taurus
    5, 21, 6, 20, // Gemini
    6, 21, 7, 20, // Cancer
    7, 23, 8, 22, // Leo
    8, 23, 9, 22, // Virgo
    9, 23, 10, 22, // Libra
    10, 23, 11, 21, // Scorpio
    11, 22, 12, 21, // Sagittarius
    12, 22, 1, 19, // Capricorn
    1, 20, 2, 18, // Aquarius
    2, 19, 3, 20, // Pisces
  ];
  for (let i = 0; i < time.length / 4; i++) {
    if (month === time[i * 4] && day >= time[i * 4 + 1]!) return i;
    if (month === time[i * 4 + 2] && day <= time[i * 4 + 3]!) return i;
  }
  return 0;
}

/** The opposite of the given zodiac sign (0 is Aries, 11 is Pisces). */
export const zodiacOpposite = (sign: number) => (sign + 6) % 12;
export const zodiacPartners = (sign: number) => [(sign + 4) % 12, (sign + 8) % 12];
export const zodiacComplements = (sign: number) => [(sign + 1) % 12, (sign + 11) % 12];

//===============================================================================
// Days of the week
//===============================================================================
/** pbIsWeekday(wdayVariable, *arg) */
export function pbIsWeekday(wdayVariable: number, ...days: number[]): boolean {
  const wday = pbGetTimeNow().getDay();
  if (wdayVariable > 0) {
    G.gameVariables.set(wdayVariable, [_INTL("Sunday"), _INTL("Monday"), _INTL("Tuesday"), _INTL("Wednesday"),
      _INTL("Thursday"), _INTL("Friday"), _INTL("Saturday")][wday]);
    if (G.gameMap) (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
  }
  return days.includes(wday);
}

//===============================================================================
// Months (pbGetMonthName is in ui/summary, pbGetAbbrevMonthName in ui/trainerCard)
//===============================================================================
const MONTHS = () => [_INTL("January"), _INTL("February"), _INTL("March"), _INTL("April"), _INTL("May"), _INTL("June"),
  _INTL("July"), _INTL("August"), _INTL("September"), _INTL("October"), _INTL("November"), _INTL("December")];

export function pbIsMonth(monVariable: number, ...months: number[]): boolean {
  const thismon = pbGetTimeNow().getMonth() + 1;
  if (monVariable > 0) {
    G.gameVariables.set(monVariable, MONTHS()[thismon - 1]); // pbGetMonthName(thismon)
    if (G.gameMap) (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
  }
  return months.includes(thismon);
}

//===============================================================================
// Seasons (pbGetSeason is in game/pokemon/formHandlers.ts)
//===============================================================================
const seasonNow = () => (pbGetTimeNow().getMonth() + 1 - 1) % 4; // pbGetSeason

export function pbGetSeasonName(season: number): string {
  return [_INTL("Spring"), _INTL("Summer"), _INTL("Autumn"), _INTL("Winter")][season]!;
}

export function pbIsSeason(seasonVariable: number, ...seasons: number[]): boolean {
  const thisseason = seasonNow();
  if (seasonVariable > 0) {
    G.gameVariables.set(seasonVariable, pbGetSeasonName(thisseason));
    if (G.gameMap) (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
  }
  return seasons.includes(thisseason);
}

export const pbIsSpring = () => pbIsSeason(0, 0); // Jan, May, Sep
export const pbIsSummer = () => pbIsSeason(0, 1); // Feb, Jun, Oct
export const pbIsAutumn = () => pbIsSeason(0, 2); // Mar, Jul, Nov
export const pbIsFall = () => pbIsAutumn();
export const pbIsWinter = () => pbIsSeason(0, 3); // Apr, Aug, Dec
