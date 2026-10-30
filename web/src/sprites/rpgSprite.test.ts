// RPG::Sprite's effects (001_Technical/006_RPG_Sprite.rb:233-486): one step per
// original 40 fps frame, the same values as Ruby's per-frame update.
import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { attachStage } from "../rgss/display";
import { RPGSprite, SpriteAnimation, type AnimationData } from "./SpriteAnimation";

attachStage(new Container());

/** Runs n original frames (each 1/40 s, as three 60 Hz ticks per two frames). */
function frames(s: RPGSprite, n: number): void {
  for (let i = 0; i < n; i++) s.update(1 / 40);
}

describe("RPGSprite effects", () => {
  it("whiten fades the white colour out over 16 frames", () => {
    const s = new RPGSprite();
    s.whiten();
    expect([s.color.alpha, s.opacity, s.effect()]).toEqual([128, 255, true]);
    frames(s, 1);
    expect(s.color.alpha).toBe(118); // 128 - (16 - 15) * 10
    frames(s, 15);
    expect([s.color.alpha, s.effect()]).toEqual([0, false]); // clamped from -32
  });

  it("appear, escape and collapse step the opacity (clamped as Sprite#opacity= does)", () => {
    const s = new RPGSprite();
    s.appear();
    frames(s, 4);
    expect(s.opacity).toBe(64);
    frames(s, 12);
    expect(s.opacity).toBe(255); // 256 clamped
    s.escape();
    frames(s, 1);
    expect(s.opacity).toBe(246);
    frames(s, 31);
    expect(s.opacity).toBe(0);
    s.collapse();
    expect([s.blendType, s.color.red, s.color.green, s.color.alpha]).toEqual([1, 255, 64, 255]);
    frames(s, 48);
    expect([s.opacity, s.effect()]).toEqual([0, false]);
  });

  it("a 60 Hz update advances two original frames every three ticks", () => {
    const s = new RPGSprite();
    s.whiten();
    for (let i = 0; i < 3; i++) s.update(1 / 60);
    expect(s.color.alpha).toBe(108); // two frames
  });

  it("blink pulses the white colour with a 32-frame period until blinkOff", () => {
    const s = new RPGSprite();
    s.blinkOn();
    frames(s, 1);
    expect(s.color.alpha).toBe(90); // (16 - 1) * 6
    frames(s, 16);
    expect(s.color.alpha).toBe(6); // count 17: (17 - 16) * 6
    s.blinkOff();
    expect([s.isBlink(), s.color.alpha]).toEqual([false, 0]);
  });
});

describe("SpriteAnimation#loopAnimation", () => {
  it("fails without a one-shot animation, as in Ruby (006_RPG_Sprite.rb:70)", () => {
    const s = new RPGSprite();
    const anim = { id: 1, name: "Loop", animationName: "", animationHue: 0, position: 1, frameMax: 2,
      frames: [[], []], timings: [] } as AnimationData;
    expect(() => new SpriteAnimation(s).loopAnimation(anim)).toThrow(TypeError);
  });
});
