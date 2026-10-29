// The interpreter flattens nested event commands into jumps; these check the
// jump targets match how Essentials walks RMXP's indented command lists.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Command } from "../data/events";
import { compile } from "./Interpreter";

const cmd = (c: string, extra: Record<string, unknown> = {}): Command => ({ cmd: c, ...extra });

describe("compile", () => {
  it("jumps to else when a condition fails, and past it when it passes", () => {
    const list = compile([
      cmd("if", { cond: {}, then: [cmd("A")], else: [cmd("B")] }),
      cmd("C"),
    ]);
    // [if, A, goto, B, C, end]
    expect(list.map((i) => (i.op === "cmd" ? i.c.cmd : i.op))).toEqual(["if", "A", "goto", "B", "C", "end"]);
    expect(list[0]).toMatchObject({ op: "if", elseAt: 3 });
    expect(list[2]).toMatchObject({ op: "goto", to: 4 });
  });

  it("sends each choice to its branch and every branch to the end", () => {
    const list = compile([
      cmd("choices", { choices: ["a", "b"], branches: [[cmd("A")], [cmd("B")]], cancel: "branch", cancelBranch: [cmd("X")] }),
      cmd("after"),
    ]);
    const ch = list[0] as { targets: number[]; cancelAt: number; endAt: number };
    expect(ch.targets).toEqual([1, 3]);
    expect(ch.cancelAt).toBe(5);
    expect(ch.endAt).toBe(6);
    expect(list[2]).toMatchObject({ op: "goto", to: 6 });
  });

  it("repeats loops and breaks out past them", () => {
    const list = compile([cmd("loop", { body: [cmd("A"), cmd("breakLoop")] }), cmd("after")]);
    // [A, goto(break)->3, goto(repeat)->0, after, end]
    expect(list[1]).toMatchObject({ op: "goto", to: 3 });
    expect(list[2]).toMatchObject({ op: "goto", to: 0 });
  });

  it("compiles every event list in the converted maps", () => {
    const dir = join(__dirname, "../../data/maps");
    let lists = 0;
    for (const id of [1, 2, 3, 4, 8, 51, 734]) {
      const map = JSON.parse(readFileSync(join(dir, `Map${String(id).padStart(3, "0")}.json`), "utf8")) as { events: { pages: { list: Command[] }[] }[] };
      for (const ev of map.events) {
        for (const page of ev.pages) {
          const out = compile(page.list);
          lists++;
          for (const i of out) {
            if (i.op === "goto") expect(i.to).toBeGreaterThanOrEqual(0);
            if (i.op === "if") expect(i.elseAt).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(lists).toBeGreaterThan(50);
  });
});
