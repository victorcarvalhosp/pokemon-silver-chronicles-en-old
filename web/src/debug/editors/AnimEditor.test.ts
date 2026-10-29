// The battle animation editor's data side (002_Animation editor/*, the
// editor parts of 007_BattleAnimationPlayer.rb, pbAnimationsOrganiser):
// web/data/pkmn-animations.json round trips through the dev server's real
// file endpoint over a temporary game root (testDevServer.ts), edits survive
// a save, Ruby's Integer/Float arithmetic on cel values, the .anm text format,
// PBAnimTiming#to_s (bugs included), paths and the organiser's list edits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AnimFrame, PBAnimation, PBAnimations, pbCreateCel,
} from "../../battle/scene/animationPlayer";
import type { AnimationData } from "../../sprites/SpriteAnimation";
import { JsonFloat } from "../DebugMenuExtraCode";
import { AnimEditorHooks } from "../DebugMenuExtraCode";
import {
  deepClone, loadPkmnAnimationsForEditor, newPBAnimTiming, parsePkmnAnimations, pbAnimTimingToS, pbConvertRPGAnimation,
  PKMN_ANIMATIONS_FILE, pkmnAnimationsText, rAdd, rDiv, rMod, rSub, savePkmnAnimations,
} from "./AnimEditor_Data";
import { dumpBase64Anim, loadBase64Anim, pbConvertAnimToNewFormat } from "./AnimEditor_ExportImport";
import { catmullRom, curveToPointPath, PointPath } from "./AnimEditor_Interpolation";
import { organiserCommands } from "./AnimationsOrganiser";
import { GAME_ROOT, installTempDevServer, type TempDevServer } from "./testDevServer";

const ORIGINAL = readFileSync(join(GAME_ROOT, PKMN_ANIMATIONS_FILE), "utf8");
let server: TempDevServer;

beforeAll(() => {
  server = installTempDevServer({ [PKMN_ANIMATIONS_FILE]: ORIGINAL });
});
afterAll(() => server.restore());

describe("pkmn-animations.json through the editor", () => {
  it("loads from the dev server and saves an unchanged file byte for byte", async () => {
    const file = (await loadPkmnAnimationsForEditor())!;
    expect(file.animations.length).toBe(1456);
    expect(pkmnAnimationsText(file) === ORIGINAL).toBe(true);
    await savePkmnAnimations(file);
    expect(server.read(PKMN_ANIMATIONS_FILE) === ORIGINAL).toBe(true);
  }, 120_000);

  it("keeps an edited cel and an added timing after save and reload", async () => {
    server.write(PKMN_ANIMATIONS_FILE, ORIGINAL);
    const file = (await loadPkmnAnimationsForEditor())!;
    // The first cel the file stores as a Float ("64.0"), moved 8 pixels right as the arrow keys do.
    let target: { a: number; f: number; c: number } | null = null;
    file.animations.array.forEach((anim, a) => anim?.array.forEach((frame, f) => frame.forEach((cel, c) => {
      if (!target && cel && (cel[AnimFrame.X] as unknown) instanceof JsonFloat) target = { a, f, c };
    })));
    const { a, f, c } = target!;
    const cel = file.animations.get(a)!.array[f]![c]!;
    const oldX = Number(cel[AnimFrame.X]);
    cel[AnimFrame.X] = rAdd(cel[AnimFrame.X], 8) as number;
    expect(String(cel[AnimFrame.X])).toBe(`${oldX + 8}.0`); // still a Float, as in Ruby
    const timing = newPBAnimTiming(0);
    timing.frame = 2;
    timing.name = "Test SE";
    file.animations.get(a)!.timing.push(timing);
    await savePkmnAnimations(file);
    const text = server.read(PKMN_ANIMATIONS_FILE)!;
    expect(text).not.toBe(ORIGINAL);
    const reread = parsePkmnAnimations(text);
    expect(Number(reread.animations.get(a)!.array[f]![c]![AnimFrame.X])).toBe(oldX + 8);
    const t = reread.animations.get(a)!.timing.at(-1)!;
    expect([t.frame, t.name, t.volume, t.pitch, t.duration]).toEqual([2, "Test SE", 80, 100, 5]);
    expect(text).toContain('"name":"Test SE","volume":80,"pitch":100,"bgX":null');
    expect(text).toContain('"flashColor":[255.0,255.0,255.0,255.0],"flashDuration":5}');
    // Only those two lines (the frame and the timing line of that animation) changed.
    const before = ORIGINAL.split("\n");
    const diff = text.split("\n").filter((l, i) => l !== before[i]);
    expect(diff.length).toBe(2);
  }, 120_000);
});

describe("Ruby numbers", () => {
  it("follows Integer and Float rules", () => {
    expect(rMod(-10, 360)).toBe(350); // rotate left from 0
    expect(rDiv(-7, 2)).toBe(-4); // Integer division floors
    expect(String(rSub(new JsonFloat("64.0"), 8))).toBe("56.0");
    expect(rAdd(1, 2)).toBe(3);
    expect(String(rDiv(new JsonFloat("9.0"), 2))).toBe("4.5");
  });

  it("deep-copies cels like Marshal (the clipboard)", () => {
    const frame = [pbCreateCel(1, 2, 3), null];
    const copy = deepClone(frame);
    copy[0]![AnimFrame.X] = 99;
    expect(frame[0]![AnimFrame.X]).toBe(1);
  });
});

describe("PBAnimation, PBAnimations and PBAnimTiming", () => {
  it("PBAnimation.new has one frame with the user and target cels", () => {
    const anim = new PBAnimation();
    expect([anim.id, anim.name, anim.position, anim.speed, anim.length]).toEqual([-1, "", 4, 20, 1]);
    const [user, target] = anim.array[0]!;
    expect([user![AnimFrame.X], user![AnimFrame.Y], user![AnimFrame.PATTERN], user![AnimFrame.FOCUS], user![AnimFrame.LOCKED]])
      .toEqual([128, 224, -1, 2, 1]);
    expect([target![AnimFrame.PATTERN], target![AnimFrame.FOCUS]]).toEqual([-2, 1]);
    expect(user!.length).toBe(27);
    expect(user![9]).toBeNull();
    anim.resize(3);
    expect(anim.length).toBe(3);
    anim.resize(2);
    expect(anim.length).toBe(2);
  });

  it("PBAnimations#resize pads with empty animations and puts the selection past the end (Ruby bug)", () => {
    const list = new PBAnimations(3);
    list.selected = 2;
    list.resize(1);
    expect(list.length).toBe(1);
    expect(list.selected).toBe(1);
    list.resize(4);
    expect(list.get(3)).toBeInstanceOf(PBAnimation);
  });

  it("PBAnimTiming#to_s", () => {
    const se = newPBAnimTiming(0);
    se.name = "Slash";
    expect(pbAnimTimingToS(se)).toBe("[1] Play SE: Slash (volume 80, pitch 100)");
    const bg = newPBAnimTiming(1);
    Object.assign(bg, { name: "bg", opacity: 200, colorRed: 0, colorGreen: 0, colorBlue: 0, colorAlpha: 0, bgX: 0, bgY: 0 });
    expect(pbAnimTimingToS(bg)).toBe('[1] Set BG: "bg" (color=0,0,0,0) (opacity=200) (coords=0,0)');
    const mod = newPBAnimTiming(2);
    mod.opacity = 100;
    expect(pbAnimTimingToS(mod)).toBe("[1] Change BG: @5 (opacity=100)");
    // Set FG: `@colorGreen | "-"`
    const fg = newPBAnimTiming(3);
    Object.assign(fg, { name: "fg", opacity: 255 });
    expect(pbAnimTimingToS(fg)).toBe('[1] Set FG: "fg" (color=-,true,-,-) (opacity=255) (coords=-,-)');
    fg.colorGreen = 10;
    expect(() => pbAnimTimingToS(fg)).toThrow(TypeError);
    // Set BG with no opacity: sprintf("%d", nil)
    expect(() => pbAnimTimingToS(newPBAnimTiming(1))).toThrow(TypeError);
  });
});

describe(".anm export/import (dumpBase64Anim / loadBase64Anim)", () => {
  it("round-trips an animation and sets the Debug menu's hooks", async () => {
    const file = parsePkmnAnimations(ORIGINAL);
    const anim = file.animations.get(36)!;
    const text = await dumpBase64Anim(anim);
    expect(text.split("\r\n").slice(0, -1).every((l) => l.length <= 60)).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
    const back = (await loadBase64Anim(text))!;
    const one = (a: PBAnimation) => pkmnAnimationsText({ move2anim: [], animations: new PBAnimations([a]) });
    expect(one(back)).toBe(one(anim));
    expect(await loadBase64Anim("not an animation")).toBeNull();
    expect(AnimEditorHooks.dumpBase64Anim).toBe(dumpBase64Anim);
    expect(AnimEditorHooks.loadBase64Anim).toBe(loadBase64Anim);
  });

  it("pbConvertAnimToNewFormat gives old cels a focus", () => {
    const anim = new PBAnimation();
    anim.position = 1;
    const cel = pbCreateCel(10, 20, 0);
    cel[AnimFrame.FOCUS] = null;
    anim.array[0]![2] = cel;
    expect(pbConvertAnimToNewFormat(anim)).toBe(true);
    expect([cel[AnimFrame.FOCUS], cel[AnimFrame.X], cel[AnimFrame.Y]]).toEqual([1, 394, 114]);
    expect(pbConvertAnimToNewFormat(anim)).toBe(false);
  });
});

describe("pbConvertRPGAnimation", () => {
  it("converts a map animation", () => {
    const rpg = (JSON.parse(readFileSync(join(GAME_ROOT, "web/data/animations.json"), "utf8")) as AnimationData[])[0]!;
    const anim = pbConvertRPGAnimation(rpg);
    expect(anim.name).toBe(rpg.name);
    expect(anim.length).toBe(rpg.frames.length);
    // frame 0: user, target, then the RPG cells (pattern -1 = none)
    expect(anim.array[0]![2]).toBeNull();
    expect(anim.array[0]![3]![AnimFrame.PATTERN]).toBe(rpg.frames[0]![1]![0]);
  });
});

describe("paths (003_AnimEditor_Interpolation.rb)", () => {
  it("smooths a freehand path over a number of frames", () => {
    const path = new PointPath();
    path.addPoint(0, 0);
    path.addPoint(10, 0);
    path.addPoint(10, 10);
    expect(path.totalDistance()).toBe(20);
    const smooth = path.smoothPointPath(4, true);
    expect([...smooth].map((p) => p.map(Number))).toEqual([[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [10, 10]]);
    expect(catmullRom(0, 0, 10, 10, 0)).toBe(0);
    const curve = curveToPointPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 30, y: 0 }], 4)!;
    expect(curve.length).toBe(4);
    expect(String(curve.at(0)[0])).toBe("0.0"); // Floats
  });
});

describe("pbAnimationsOrganiser's list edits", () => {
  it("swaps, inserts and deletes animations and saves the list", async () => {
    server.write(PKMN_ANIMATIONS_FILE, ORIGINAL);
    const file = (await loadPkmnAnimationsForEditor())!;
    const list = file.animations;
    const names = [list.get(0)!.name, list.get(1)!.name, list.get(2)!.name];
    // Z+Down on entry 1: swap with entry 0
    [list.array[0], list.array[1]] = [list.array[1]!, list.array[0]!];
    // Z+Right on entry 2: insert an empty animation
    list.insert(2, new PBAnimation());
    // Z+Left on the last entry: delete it
    list.deleteAt(list.length - 1);
    expect(organiserCommands(list).slice(0, 4)).toEqual([`0: ${names[1]}`, `1: ${names[0]}`, "2: ", `3: ${names[2]}`]);
    await savePkmnAnimations(file);
    const reread = parsePkmnAnimations(server.read(PKMN_ANIMATIONS_FILE)!).animations;
    expect(reread.length).toBe(1456);
    expect([reread.get(0)!.name, reread.get(1)!.name, reread.get(3)!.name]).toEqual([names[1], names[0], names[2]]);
    const empty = reread.get(2)!;
    expect([empty.id, empty.name, empty.position, empty.length, empty.timing.length]).toEqual([-1, "", 4, 1, 0]);
  }, 120_000);
});
