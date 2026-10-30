// Game_System#update's cut-scene skip (002_Game_System.rb:268-273): SPECIAL
// while an event with a "Cut Scene" comment runs sets its self switch A, ends
// the interpreter and restarts the event.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "../rgss/Input";
import { GameSystem } from "./GameSystem";
import { G } from "./globals";

function setup(comment: string, running = true) {
  const calls: string[] = [];
  const event = {
    id: 7,
    list: [{ cmd: "comment", lines: [comment] }, { cmd: "text", text: "Hi" }],
    start: () => calls.push("start"),
  };
  const sys = new GameSystem();
  sys.mapInterpreter = {
    running: () => running,
    update: async () => {},
    getSelf: () => event,
    pbSetSelfSwitch: (id: number, sw: string, v: boolean) => calls.push(`self ${id} ${sw} ${v}`),
    commandEnd: () => calls.push("end"),
  } as never;
  G.gameSystem = sys as never;
  return { sys, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("cut-scene skip", () => {
  it("skips an event with a Cut Scene comment when SPECIAL is pressed", () => {
    vi.spyOn(Input, "trigger").mockImplementation((b) => b === Input.SPECIAL);
    const { sys, calls } = setup("Cut Scene");
    sys.update();
    expect(calls).toEqual(["self 7 A true", "end", "start"]);
  });

  it("does nothing for other events, without SPECIAL, or with no event running", () => {
    vi.spyOn(Input, "trigger").mockImplementation((b) => b === Input.SPECIAL);
    const other = setup("Something else");
    other.sys.update();
    expect(other.calls).toEqual([]);
    const idle = setup("Cut Scene", false);
    idle.sys.update();
    expect(idle.calls).toEqual([]);
    vi.spyOn(Input, "trigger").mockReturnValue(false);
    const noKey = setup("Cut Scene");
    noKey.sys.update();
    expect(noKey.calls).toEqual([]);
  });
});
