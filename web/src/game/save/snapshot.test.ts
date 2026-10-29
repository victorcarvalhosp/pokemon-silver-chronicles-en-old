import { describe, expect, it } from "vitest";
import { Color, Tone } from "../../rgss/types";
import { restore, snapshot } from "./snapshot";

class State {
  tone = new Tone(-10, 20, 30, 40);
  color = new Color(1, 2, 3, 4);
  list = [1, 2, { a: true }];
  byKey = new Map([["x", 1]]);
  skipped = "keep";
  name = "";
}

describe("snapshot", () => {
  it("round-trips tones, colours, maps and nested data through JSON", () => {
    const a = new State();
    a.name = "Ethan";
    const json = JSON.parse(JSON.stringify(snapshot(a, ["skipped"]))) as unknown;
    const b = new State();
    b.skipped = "untouched";
    restore(b, json);
    expect(b.name).toBe("Ethan");
    expect(b.tone).toBeInstanceOf(Tone);
    expect([b.tone.red, b.tone.green, b.tone.blue, b.tone.gray]).toEqual([-10, 20, 30, 40]);
    expect(b.color.alpha).toBe(4);
    expect(b.list).toEqual([1, 2, { a: true }]);
    expect(b.byKey.get("x")).toBe(1);
    expect(b.skipped).toBe("untouched");
  });
});
