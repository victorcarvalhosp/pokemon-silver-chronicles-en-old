// 019_Utilities/001_Utilities.rb leftovers and 003_Overworld_Time.rb's moon
// phase / zodiac / season helpers (moon phases checked against Ruby).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { G, GameVariables } from "./globals";
import { moonphase, pbIsSeason, zodiac, zodiacOpposite } from "./dayNight";
import { pbTimeEvent, pbTimeEventValid, toCelsius, toFahrenheit } from "./utilities";

beforeEach(() => {
  G.gameVariables = new GameVariables();
  G.gameMap = null;
});

describe("time helpers", () => {
  it("moonphase matches Ruby (hours counted as minutes included)", () => {
    const dates = [new Date(2026, 9, 29, 12, 0, 0), new Date(2024, 0, 25, 18, 30, 5), new Date(2000, 0, 6), new Date(2025, 2, 14, 23, 59, 59)];
    expect(dates.map((d) => moonphase(d))).toEqual([5, 4, 0, 4]);
  });

  it("zodiac signs", () => {
    expect(zodiac(3, 21)).toBe(0); // Aries
    expect(zodiac(1, 19)).toBe(9); // Capricorn
    expect(zodiac(3, 1)).toBe(11); // Pisces
    expect(zodiacOpposite(0)).toBe(6);
  });

  it("pbIsSeason stores the season's name", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29)); // October: (10 - 1) % 4 = 1
    expect(pbIsSeason(5, 1)).toBe(true);
    expect(G.gameVariables.get(5)).toBe("Summer");
    vi.useRealTimers();
  });

  it("timed events expire after their age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 29, 10, 0, 0));
    pbTimeEvent(7, 60);
    vi.setSystemTime(new Date(2026, 9, 29, 10, 0, 30));
    expect(pbTimeEventValid(7)).toBe(false); // resets the variable
    pbTimeEvent(7, 60);
    vi.setSystemTime(new Date(2026, 9, 29, 10, 2, 0));
    expect(pbTimeEventValid(7)).toBe(true);
    vi.useRealTimers();
  });

  it("temperatures", () => {
    expect(toCelsius(50)).toBe(10);
    expect(toFahrenheit(21)).toBe(70);
  });
});
