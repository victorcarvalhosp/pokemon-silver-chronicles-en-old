// 001_Technical/001_Debugging ports (console markup, errors, validate,
// deprecation) and 001_Debug_Menus' CommandMenuList.

import { describe, expect, it, vi } from "vitest";

vi.mock("../core/debug", () => ({ DEBUG: true }));

const { Console, ConsoleOutput, echo, echoln } = await import("./DebugConsole");
const { EventScriptError, PrintHooks, pbCriticalCode, pbExceptionText, pbPrintException, Reset } = await import("./Errors");
const { Integer, NilClass, validate } = await import("./Validation");
const { Deprecation, deprecatedMethodAlias } = await import("./Deprecation");
const { CommandMenuList } = await import("./DebugMenus");

function captureConsole(): string[] {
  const lines: string[] = [];
  ConsoleOutput.sink = (l) => lines.push(l);
  return lines;
}

describe("DebugConsole", () => {
  it("buffers echo until the line ends", () => {
    const lines = captureConsole();
    echo("a");
    echo("b");
    expect(lines).toEqual([]);
    echoln("c");
    echo({ x: 1 });
    echoln("");
    expect(lines).toEqual(["abc", '{"x":1}']);
  });

  it("formats like Ruby's markup_style (squeezed ';')", () => {
    expect(Console.markupStyle("OK", { text: "green" })).toBe("\x1b[0;32mOK\x1b[0m");
    expect(Console.markupStyle("x", { text: "light_red", bg: "blue", bold: true, underline: true })).toBe("\x1b[44;1;4;1;31mx\x1b[0m");
  });

  it("applies inline markup", () => {
    expect(Console.markup("a `b` *c*")).toBe(`a ${Console.markupStyle("b", { text: "cyan" })} ${Console.markupStyle("c", { bold: true })}`);
    expect(Console.markup("plain")).toBe("plain");
  });

  it("echo_li pads with dots and echo_done says done/error", () => {
    const lines = captureConsole();
    Console.echoLi("abc", 6);
    Console.echoDone(true);
    expect(lines).toEqual([`${Console.markupStyle("  -> ", { text: "brown" })}abc...${Console.markupStyle("done", { text: "green" })}`]);
  });
});

describe("Errors", () => {
  it("formats the exception box like pbPrintException", () => {
    const text = pbExceptionText(new TypeError("boom"));
    expect(text.startsWith("[Pokémon Essentials version 20.1]\r\n[v20.1 Hotfixes 1.0.7]\r\n\r\nException: TypeError\r\nMessage: boom\r\n\r\nBacktrace:\r\n")).toBe(true);
    expect(pbExceptionText(new EventScriptError("Event 3 on map 5"))).toBe("[Pokémon Essentials version 20.1]\r\n[v20.1 Hotfixes 1.0.7]\r\n\r\nEvent 3 on map 5");
  });

  it("shows the message box and pbCriticalCode returns 0/1", async () => {
    const shown: string[] = [];
    PrintHooks.show = async (t) => { shown.push(t); return false; };
    try {
      expect(await pbCriticalCode(() => {})).toBe(1);
      expect(await pbCriticalCode(() => { throw new Error("bad"); })).toBe(0);
      await expect(pbCriticalCode(() => { throw new Reset(); })).rejects.toBeInstanceOf(Reset);
      await pbPrintException(new Error("again"));
      expect(shown).toHaveLength(2);
      expect(shown[0]).toContain("Message: bad");
      expect(shown[0]).toContain("This exception was logged in errorlog.txt.");
    } finally {
      PrintHooks.show = null;
    }
  });
});

describe("validate / Deprecation", () => {
  it("raises ArgumentError listing every failed check", () => {
    expect(() => validate([1, Integer], ["x", String], [null, [NilClass, String]], [[], "push"])).not.toThrow();
    expect(() => validate([1.5, Integer], [3, [String, NilClass]], [{}, "push"])).toThrow(
      "Invalid argument passed to method.\r\nExpected 1.5 to be a Integer, but got Float.\r\n" +
      "Expected 3 to be one of [String, NilClass], but got Integer.\r\nExpected [object Object] to respond to push.");
  });

  it("warns on deprecated methods and aliases", () => {
    const lines = captureConsole();
    Deprecation.warnMethod("type1", "v21", "pkmn.types");
    expect(lines[0]).toContain('WARNING: Usage of deprecated method "type1" or its alias.');
    class Foo { bar(x: number) { return x * 2; } }
    deprecatedMethodAlias(Foo, "baz", "bar", { removalIn: "v21" });
    expect((new Foo() as unknown as { baz(x: number): number }).baz(3)).toBe(6);
    expect(lines.join("\n")).toContain('Usage of deprecated method "Foo#baz" or its alias.');
    expect(() => deprecatedMethodAlias(Foo, "x", "missing")).toThrow("Foo does not have method missing defined");
  });
});

describe("CommandMenuList", () => {
  const list = new CommandMenuList();
  list.add("field_menu", { name: "Field...", parent: "main" }, "Field...", "Field options");
  list.add("warp", { name: "Warp", parent: "field_menu" }, "Warp", null);
  list.add("switches", { name: "Switches", parent: "field_menu" }, "Switches", "Edit switches");
  list.add("other_menu", { name: "Other...", parent: "main" }, "Other...", null);

  it("lists the current submenu and goes back to the parent's row", () => {
    expect(list.list()).toEqual(["Field...", "Other..."]);
    expect(list.getDesc(1)).toBe("<No description available>");
    expect(list.hasSubMenu(list.getCommand(0))).toBe(true);
    list.currentList = "field_menu";
    expect(list.list()).toEqual(["Warp", "Switches"]);
    expect(list.getCommand(1)).toBe("switches");
    expect(list.getDesc(1)).toBe("Edit switches");
    expect(list.hasSubMenu("warp")).toBe(false);
    expect(list.getParent()).toEqual(["main", 0]);
    list.currentList = "main";
    expect(list.getParent()).toBeNull();
  });
});
