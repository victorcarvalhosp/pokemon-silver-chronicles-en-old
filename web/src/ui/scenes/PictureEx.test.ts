import { describe, expect, it } from "vitest";
import { CharacterEntryHelper } from "../textEntry/TextEntry";
import { rgssOpacity } from "./frames";
import { PictureEx, Processes } from "./PictureEx";

describe("PictureEx", () => {
  it("scales 1/20 s delays and durations by the 60 Hz frame rate", () => {
    const pic = new PictureEx(0);
    pic.setOpacity(0, 0);
    pic.moveOpacity(10, 10, 255); // starts after 0.5 s, lasts 0.5 s
    pic.update();
    expect(pic.opacity).toBe(0);
    for (let i = 0; i < 30; i++) pic.update();
    expect(pic.opacity).toBe(0); // first frame of the move: frame counter 0
    expect(pic.frameUpdates).toContain(Processes.OPACITY);
    for (let i = 0; i < 15; i++) pic.update();
    expect(pic.opacity).toBeCloseTo(127.5);
    for (let i = 0; i < 15; i++) pic.update();
    expect(pic.opacity).toBe(255);
    expect(pic.running()).toBe(false);
  });

  it("totalDuration and negative delays queue after the running processes", () => {
    const pic = new PictureEx(0);
    pic.moveXY(0, 20, 100, 0);
    expect(pic.totalDuration()).toBe(20);
    pic.moveXY(-1, 0, 100, 50); // jumps once the first move's 1 s is over
    for (let i = 0; i < 60; i++) pic.update();
    expect(pic.x).toBeCloseTo((59 * 100) / 60);
    expect(pic.y).toBe(0);
    pic.update();
    expect([pic.x, pic.y]).toEqual([100, 50]);
    expect(pic.running()).toBe(false);
  });
});

describe("mkxp-z sprite values", () => {
  it("truncates and clamps opacity like Sprite#opacity=", () => {
    let o = 0;
    for (let i = 0; i < 10; i++) o = rgssOpacity(o + 25.5);
    expect(o).toBe(250); // the BW Gender Selector's pbShow
    for (let i = 0; i < 10; i++) o = rgssOpacity(o - 25.5);
    expect(o).toBe(0);
  });
});

describe("CharacterEntryHelper", () => {
  it("inserts and deletes at the cursor, respecting maxlength", () => {
    const h = new CharacterEntryHelper("Gol");
    h.maxlength = 4;
    expect(h.insert("d")).toBe(true);
    expect(h.insert("!")).toBe(false);
    h.cursor = 1;
    expect(h.delete()).toBe(true);
    expect(h.text).toBe("old");
    expect(h.cursor).toBe(0);
    expect(h.delete()).toBe(false);
  });
});
