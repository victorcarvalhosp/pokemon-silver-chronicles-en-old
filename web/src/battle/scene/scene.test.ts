import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AnimFrame, isReversed, transformPoint } from "./animationPlayer";
import { BattleScene } from "./BattleScene";

describe("Battle::Scene positions", () => {
  it("places battlers and trainers like Essentials (512x384)", () => {
    expect(BattleScene.pbBattlerPosition(0)).toEqual([128, 304]);
    expect(BattleScene.pbBattlerPosition(1)).toEqual([414, 118]);
    expect(BattleScene.pbBattlerPosition(2, 2)).toEqual([160, 320]);
    expect(BattleScene.pbBattlerPosition(5, 3)).toEqual([334, 102]);
    expect(BattleScene.pbTrainerPosition(0)).toEqual([128, 288]);
    expect(BattleScene.pbTrainerPosition(1, 1, 2)).toEqual([382, 108]);
  });
});

describe("PBAnimationPlayerX transforms", () => {
  it("maps the editor's user/target line onto the actual sprites", () => {
    // Focus points map onto the destination line's ends
    expect(transformPoint(128, 224, 384, 96, 100, 250, 400, 60, 128, 224)).toEqual([100, 250]);
    expect(transformPoint(128, 224, 384, 96, 100, 250, 400, 60, 384, 96)).toEqual([400, 60]);
    expect(transformPoint(128, 224, 384, 96, 100, 250, 400, 60, 256, 160)).toEqual([250, 155]);
    // A foe attacking the player reverses the line
    expect(isReversed(128, 384, 414, 128)).toBe(true);
    expect(isReversed(128, 384, 128, 414)).toBe(false);
  });
});

describe("pkmn-animations.json", () => {
  const data = JSON.parse(readFileSync(new URL("../../../data/pkmn-animations.json", import.meta.url), "utf8")) as {
    move2anim: [Record<string, number>, Record<string, number>];
    animations: ({ name: string; graphic: string; frames: ((number | null)[] | null)[][] } | null)[];
  };

  it("indexes move animations by name, as the compiler's move2anim does", () => {
    for (const [move, index] of Object.entries(data.move2anim[0])) {
      expect(data.animations[index]?.name.replace(/^Move:\s*/, "")).toBe(move);
    }
    for (const [move, index] of Object.entries(data.move2anim[1])) {
      expect(data.animations[index]?.name.replace(/^OppMove:\s*/, "")).toBe(move);
    }
  });

  it("stores each cel as the 27-element AnimFrame array", () => {
    const ember = data.animations[data.move2anim[0].EMBER!]!;
    expect(ember.graphic).toBe("PRAS- Fire.png");
    const cel = ember.frames[0]![0]!;
    expect(cel).toHaveLength(27);
    expect(cel[AnimFrame.PATTERN]).toBe(-1); // cel 0 is the user's sprite
    expect(cel[AnimFrame.FOCUS]).toBeTypeOf("number");
  });
});
