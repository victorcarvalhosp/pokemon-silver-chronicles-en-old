// 001_Technical/003_Intl_Messages.rb: intl.txt parsing, MessageTypes lookups
// (_INTL, _MAPINTL, pbGetMessage, GameData names), messages files, Extract
// Text's script scan and _ISPRINTF's sprintf.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import {
  _INTL, _ISPRINTF, _MAPINTL, Messages, MessageTypes, pbAddRgssScriptTexts, pbAddScriptTexts, pbCompileText,
  pbGetMessage, pbGetText, pbLoadMessages, pbSetDataMessages, sprintf,
} from "./intl";

const INTL_TXT = [
  "﻿# To localize this text for a particular language, please",
  "# translate every second line of this file.",
  "[1]",
  "Pikachu",
  "Pikachu-es",
  "[24]",
  "Hello {1}!",
  "¡Hola {1}!",
  "Line one<<n>>line two",
  "Línea uno<<n>>línea dos",
  "[21]",
  "29",
  "Route 29",
  "Ruta 29",
  "[Map0]",
  "Yes",
  "Sí",
  "[Map5]",
  "Welcome to the Day Care.",
  "Bienvenido a la guardería.",
  "",
].join("\r\n");

beforeAll(() => loadGameDataForTests());
afterEach(() => MessageTypes.reset());

describe("Intl messages", () => {
  it("without a language file, returns the original texts", () => {
    expect(_INTL("Hello {1}!", "Gold")).toBe("Hello Gold!");
    expect(_INTL("{1} and {2}", "a", null)).toBe("a and "); // nil.to_s
    expect(GameData.Species.get("PIKACHU").name).toBe("Pikachu");
    expect(pbGetMessage(MessageTypes.MapNames, 29)).toBe("");
  });

  it("parses intl.txt and translates script texts, data names, map texts and map names", () => {
    MessageTypes.setAll(pbGetText(INTL_TXT));
    expect(_INTL("Hello {1}!", "Gold")).toBe("¡Hola Gold!");
    expect(_INTL("Line one\nline two")).toBe("Línea uno\nlínea dos");
    expect(_INTL("Untranslated")).toBe("Untranslated");
    expect(GameData.Species.get("PIKACHU").name).toBe("Pikachu-es");
    expect(GameData.Species.get("RAICHU").name).toBe("Raichu");
    // Map texts: the map's own hash, then the common events' (Map0); keys ignore extra spaces
    expect(_MAPINTL(5, "Welcome to the  Day Care. ")).toBe("Bienvenido a la guardería.");
    expect(_MAPINTL(5, "Yes")).toBe("Sí");
    expect(_MAPINTL(6, "Welcome to the Day Care.")).toBe("Welcome to the Day Care.");
    expect(pbGetMessage(MessageTypes.MapNames, 29)).toBe("Ruta 29");
  });

  it("rejects malformed sections as Ruby does", () => {
    expect(() => pbGetText("Pikachu\r\n")).toThrow("Expected a section at the beginning of the file (line 1)");
    expect(() => pbGetText("[24]\r\nA\r\n")).toThrow("odd number of entries");
    expect(() => pbGetText("[21]\r\n1\r\nA\r\n")).toThrow("not divisible by 3");
    expect(() => pbGetText("[Map1]\r\n1\r\nA\r\nB\r\n")).toThrow("can't be an ordered list");
    expect(() => pbGetText("[Foo]\r\nA\r\nB\r\n")).toThrow("Invalid section name Foo");
  });

  it("compiles intl.txt into a messages file that loads back (pbCompileText / pbLoadMessages)", async () => {
    const json = pbCompileText(INTL_TXT);
    const prev = globalThis.fetch;
    globalThis.fetch = (async (url: string) => {
      expect(url).toBe("/data/espanol.json");
      return { ok: true, status: 200, json: async () => JSON.parse(json) as unknown } as Response;
    }) as typeof fetch;
    try {
      expect(await pbLoadMessages("Data/espanol.dat")).not.toBeNull();
    } finally {
      globalThis.fetch = prev;
    }
    expect(_INTL("Hello {1}!", "Kris")).toBe("¡Hola Kris!");
    expect(pbGetMessage(MessageTypes.MapNames, 29)).toBe("Ruta 29");
  });

  it("extracts the current messages as intl.txt, which parses back to the same texts", () => {
    const orig = new Messages();
    orig.setMessagesAsHash(MessageTypes.ScriptTexts, ["Hello {1}!", "Line one\nline two"]);
    orig.setMessages(MessageTypes.MapNames, [null, "New Bark Town"]);
    orig.setMapMessagesAsHash(3, ["Hi!"]);
    const txt = orig.extract(orig);
    expect(txt).toContain("[24]\r\nHello {1}!\r\nHello {1}!\r\nLine one<<n>>line two\r\nLine one<<n>>line two\r\n");
    expect(txt).toContain("[21]\r\n1\r\nNew Bark Town\r\nNew Bark Town\r\n");
    expect(txt).toContain("[Map3]\r\nHi!\r\nHi!\r\n");
    MessageTypes.setAll(pbGetText(txt));
    expect(_MAPINTL(3, "Hi!")).toBe("Hi!");
    expect(pbGetMessage(MessageTypes.MapNames, 1)).toBe("New Bark Town");
  });

  it("collects the data's texts as the Compiler does, for Extract Text", async () => {
    await pbSetDataMessages();
    const txt = MessageTypes.extract();
    expect(txt).toContain("[1]\r\n");
    expect(txt).toContain("\r\nPikachu\r\nPikachu\r\n");
    expect(txt).toContain("[5]\r\n");
    expect(txt).toContain("Thunderbolt\r\nThunderbolt\r\n");
  });

  it("finds _INTL/_ISPRINTF and _I strings in scripts (Extract Text)", () => {
    const texts: string[] = [];
    pbAddRgssScriptTexts(texts, 'pbMessage(_INTL("{1} learned {2}!\\n", a, b)); x = _ISPRINTF("{1:03d}", n);');
    expect(texts).toEqual(["{1} learned {2}!\n", "{1:03d}"]);
    const items: string[] = [];
    pbAddScriptTexts(items, 'pbMessage(_I("Say \\"hi\\""))');
    expect(items).toEqual(['Say "hi"']);
  });

  it("formats _ISPRINTF placeholders like Ruby's sprintf", () => {
    expect(_ISPRINTF("x{1:03d}", 7)).toBe("x007");
    expect(_ISPRINTF("x{1: 3d}", 7)).toBe("x  7");
    expect(_ISPRINTF("{1:.2f}%", 12.345)).toBe("12.35%");
    expect(sprintf("%-5s|%5s|%x|%X|%+d|%%", "ab", "cd", 255, 255, 3)).toBe("ab   |   cd|ff|FF|+3|%");
  });
});
