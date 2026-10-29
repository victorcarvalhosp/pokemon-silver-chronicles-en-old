// Tests for the text formatter (010_DrawText.rb port) and the message text
// code parsing in messages.ts. Text is "measured" with a fixed-width fake
// bitmap (10 px per character) so expected positions are easy to derive by
// hand from the Ruby code.

import { describe, expect, it, vi } from "vitest";
import { Font } from "../rgss/Bitmap";
import { Color, Rect } from "../rgss/types";
import {
  type FormattedChar, type TextBitmap, colorToRgb16, colorToRgb32, ctag, getFormattedText, getLineBrokenChunks,
  Rgb16ToColor, rgbToColor, shadowc3tag, shadowctag, toUnformattedText, unformattedTextLength,
} from "./drawText";
import { G } from "../game/globals";
import { getSkinColor } from "./messageConfig";
// rgss/Audio and rgss/Input touch browser globals on import, which Node doesn't have.
vi.mock("../rgss/Audio", () => ({ Audio: {}, unlockAudio: async () => {} }));
vi.mock("../rgss/Input", () => ({ Input: {} }));

import { pbCsvField, pbMessageReplaceTextCodes, pbMessageSplitControls, pbStringToAudioFile } from "./messages";

function fakeBitmap(charWidth = 10): TextBitmap {
  const font = new Font();
  return {
    font,
    textSize: (text: string) => new Rect(0, 0, Array.from(text).length * charWidth * (font.bold ? 2 : 1), 26),
    isDisposed: () => false,
  };
}

/** Visible characters grouped by line: "Hello|world foo". */
function lines(chars: FormattedChar[]): string {
  return chars
    .filter((c) => !c[5])
    .map((c) => c[0])
    .join("")
    .split("\n")
    .join("|");
}

const rgb = (c: Color | null) => (c ? [c.red, c.green, c.blue, c.alpha] : null);

describe("colour helpers", () => {
  it("converts between colours and tags", () => {
    expect(colorToRgb32(new Color(248, 248, 248))).toBe("F8F8F8");
    expect(colorToRgb32(new Color(1, 2, 3, 4))).toBe("01020304");
    expect(shadowc3tag(new Color(80, 80, 88), new Color(160, 160, 168))).toBe("<c3=505058,A0A0A8>");
    expect(ctag(new Color(255, 0, 0))).toBe("<c=FF0000FF>");
    // 16-bit colours keep 5 bits per channel
    const c16 = colorToRgb16(new Color(248, 16, 8));
    expect(c16).toBe("045F"); // 31 | 2 << 5 | 1 << 10
    expect(rgb(Rgb16ToColor(c16))).toEqual([248, 16, 8, 255]);
    expect(shadowctag(new Color(248, 248, 248), new Color(72, 80, 88))).toBe(`<c2=${colorToRgb16(new Color(248, 248, 248))}${colorToRgb16(new Color(72, 80, 88))}>`);
  });

  it("parses every rgbToColor format", () => {
    expect(rgb(rgbToColor("E00808"))).toEqual([224, 8, 8, 255]);
    expect(rgb(rgbToColor("E0080880"))).toEqual([224, 8, 8, 128]);
    expect(rgb(rgbToColor(colorToRgb16(new Color(48, 80, 200))))).toEqual([48, 80, 200, 255]);
    expect(rgb(rgbToColor("2"))).toEqual([255, 128, 128, 255]);
    expect(rgb(rgbToColor("9"))).toEqual(rgb(Font.defaultColor));
  });

  it("picks \\c[n] colours for light and dark skins like getSkinColor", () => {
    expect(getSkinColor(null, 1, false)).toBe("<c3=0070F8,78B8E8>");
    expect(getSkinColor(null, 1, true)).toBe("<c3=78B8E8,0070F8>");
    expect(getSkinColor(null, 0, false)).toBe("<c3=505058,A0A0A8>");
    expect(getSkinColor(null, 0, true)).toBe("<c3=F8F8F8,485058>");
    expect(getSkinColor(null, 12, true)).toBe("<c3=F8F8F8,485058>"); // 12 is never reversed
    expect(getSkinColor(null, 99, false)).toBe("<c3=505058,A0A0A8>");
  });
});

describe("toUnformattedText", () => {
  it("strips tags and decodes entities", () => {
    expect(toUnformattedText("<c3=505058,A0A0A8><ac>Hi &lt;3 <b>you</b>&amp;me</ac>")).toBe("Hi <3 you&me");
    expect(unformattedTextLength("<b>Pokémon</b>")).toBe(7);
  });
});

describe("getFormattedText", () => {
  it("wraps at word boundaries and drops the space before the break (fast path)", () => {
    const chars = getFormattedText(fakeBitmap(), 0, 0, 100, -1, "Hello world foo");
    expect(lines(chars)).toBe("Hello|world foo");
    const w = chars.find((c) => c[0] === "w")!;
    expect([w[1], w[2]]).toEqual([0, 32]); // second line, no TEXT OFFSET in the fast path
    const f = chars.find((c) => c[0] === "f")!;
    expect(f[1]).toBe(60);
    // character width is the glyph width + 2
    expect(chars[0]![3]).toBe(12);
  });

  it("honours explicit newlines and explicitBreaksOnly", () => {
    expect(lines(getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "One\nTwo"))).toBe("One|Two");
    expect(lines(getFormattedText(fakeBitmap(), 0, 0, 50, -1, "aaa bbb ccc", 32, true, true))).toBe("aaa bbb ccc");
    // newlineBreaks = false turns "\n" into a space
    expect(lines(getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "One\nTwo", 32, false))).toBe("One Two");
  });

  it("applies colour tags and the -2 TEXT OFFSET (slow path)", () => {
    const text = "<c3=E00808,D0D0C8>Red<c3=3050C8,D0D0C8> blue";
    const chars = getFormattedText(fakeBitmap(), 0, 0, 1000, -1, text);
    expect(lines(chars)).toBe("Red blue");
    const r = chars[0]!;
    expect(r[2]).toBe(-2);
    expect(rgb(r[8])).toEqual([224, 8, 8, 255]);
    expect(rgb(r[9])).toEqual([208, 208, 200, 255]);
    const b = chars.find((c) => c[0] === "b")!;
    expect(rgb(b[8])).toEqual([48, 80, 200, 255]);
    expect(b[1]).toBe(40);
  });

  it("supports <c2>, closing tags restoring the previous colour and <o>", () => {
    const base = colorToRgb16(new Color(248, 248, 248));
    const shadow = colorToRgb16(new Color(72, 80, 88));
    const chars = getFormattedText(fakeBitmap(), 0, 0, 1000, -1, `<c2=${base}${shadow}>A<c=FF0000>B</c><o=128>C`);
    expect(rgb(chars[0]![8])).toEqual([248, 248, 248, 255]);
    expect(rgb(chars[0]![9])).toEqual([72, 80, 88, 255]);
    expect(rgb(chars[1]![8])).toEqual([255, 0, 0, 255]);
    expect(chars[1]![9]).toBeNull();
    expect(rgb(chars[2]![8])).toEqual([248, 248, 248, 128]);
  });

  it("marks bold/italic/underline and measures bold text with the bold font", () => {
    const chars = getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "a<b>b</b><i>c</i><u>d</u>");
    expect(chars.map((c) => [c[0], c[6], c[7], c[10]])).toEqual([
      ["a", false, false, false],
      ["b", true, false, false],
      ["c", false, true, false],
      ["d", false, false, true],
    ]);
    expect(chars[2]![1]).toBe(30); // "b" was 20 px wide in bold
    expect(chars[2]![3]).toBe(10 + 2 + 5); // italic extra space: 2 + width / 2
  });

  it("centres <ac> text and right-aligns <ar>/<r> text", () => {
    const centred = getFormattedText(fakeBitmap(), 0, 0, 200, -1, "<ac>abcd</ac>");
    // run width 40: x = 200/2 - 40/2
    expect(centred[0]![1]).toBe(80);
    const right = getFormattedText(fakeBitmap(), 0, 0, 200, -1, "<ar>abcd</ar>");
    // x = widthDst - runwidth - 4
    expect(right[0]![1]).toBe(156);
    const r = getFormattedText(fakeBitmap(), 0, 0, 200, -1, "ab<r>cd");
    expect(lines(r)).toBe("abcd");
    expect(r[2]![1]).toBe(200 - 20 - 4);
    expect(r[0]![1]).toBe(0);
  });

  it("starts a new line for <ac> after text and for <br>", () => {
    expect(lines(getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "Hi<ac>there</ac>"))).toBe("Hi|there");
    expect(lines(getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "a<br>b"))).toBe("a|b");
  });

  it("collapses alignment widths when asked (window sizing)", () => {
    const chars = getFormattedText(fakeBitmap(), 0, 0, 400, -1, "<ac>abcd</ac>", 32, true, false, true);
    expect(chars[0]![1]).toBe(0); // widthDst collapses to the line's 40 px
  });

  it("keeps wait characters zero-width and removes spaces before them", () => {
    const chars = getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "<b></b>Wait \x02now");
    const wait = chars.find((c) => c[0] === "\x02")!;
    expect(wait[3]).toBe(2);
    expect(chars.some((c) => c[0] === " ")).toBe(false);
    // (removing the space doesn't move the following characters back)
    expect(chars.find((c) => c[0] === "n")![1]).toBe(50);
  });

  it("drops characters below heightDst", () => {
    // Line 2 is at y = 32 - 2 (TEXT OFFSET), so heightDst 32 would keep it.
    const chars = getFormattedText(fakeBitmap(), 0, 0, 1000, 30, "<b></b>one\ntwo");
    expect(lines(chars)).toBe("one|"); // the line-1 newline itself stays
  });

  it("decodes entities after splitting tags", () => {
    expect(lines(getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "<b></b>&lt;b&gt;"))).toBe("<b>");
  });

  it("returns positions in the unformatted text", () => {
    const chars = getFormattedText(fakeBitmap(), 0, 0, 1000, -1, "<c3=E00808,D0D0C8>ab<b>c</b>");
    expect(chars.map((c) => c[14])).toEqual([0, 1, 2]);
  });
});

describe("getLineBrokenChunks", () => {
  it("breaks plain text into words that fit the width", () => {
    const dims = [0, 0];
    const chunks = getLineBrokenChunks(fakeBitmap(), "aaa bbb-ccc dd", 80, dims, true);
    expect(chunks.map((c) => [c[0], c[1], c[2]])).toEqual([
      ["aaa ", 0, 0],
      ["bbb-", 40, 0],
      ["ccc ", 0, 32],
      ["dd", 40, 32],
    ]);
    expect(dims).toEqual([80, 64]);
  });
});

describe("message text codes", () => {
  const skin = { windowskin: null, setSkin: () => {} };

  it("expands \\PN, \\n, \\v[], \\r, \\b and \\l[]", () => {
    G.player = { name: "Gold", gender: 0, money: 1234567 };
    G.gameVariables.set(5, 42);
    const { text, linecount } = pbMessageReplaceTextCodes("\\l[3]\\rHi \\PN!\\nYou have \\v[5] \\bitems \\PM", skin);
    expect(linecount).toBe(3);
    expect(text).toBe("<c3=F8F8F8,485058><c3=E00808,D0D0C8>Hi Gold!\nYou have 42 <c3=3050C8,D0D0C8>items $1,234,567");
  });

  it("turns \\pg/\\pog into the gender colours", () => {
    G.player = { name: "Kris", gender: 1, money: 0 };
    expect(pbMessageReplaceTextCodes("\\pgA\\pogB", skin).text).toContain("<c3=E00808,D0D0C8>A<c3=3050C8,D0D0C8>B");
  });

  it("splits control codes out with their unformatted positions", () => {
    const { text, controls } = pbMessageSplitControls("<c3=505058,A0A0A8>\\f[facemom]Hi\\.there\\wt[5]!\\se[Choose:80]\\^");
    expect(text).toBe("<c3=505058,A0A0A8>Hi\x02there\x02!");
    expect(controls).toEqual([
      ["f", "facemom", 0],
      [".", "", 3],
      ["wt", "5", 9],
      ["se", "Choose:80", 10],
      ["^", "", 10],
    ]);
    expect(pbMessageSplitControls("a\\ff[face,2]b\\!").controls).toEqual([["ff", "face,2", 1], ["!", "", 3]]);
  });

  it("parses \\ch CSV fields and audio strings", () => {
    const holder = { str: '12,2,"Yes, sir",No' };
    expect([pbCsvField(holder), pbCsvField(holder), pbCsvField(holder), pbCsvField(holder)]).toEqual(["12", "2", "Yes, sir", "No"]);
    expect(holder.str).toBe("");
    expect(pbStringToAudioFile("Choose:80:150")).toEqual({ name: "Choose", volume: 80, pitch: 150 });
    expect(pbStringToAudioFile("Choose")).toEqual({ name: "Choose", volume: 100, pitch: 100 });
  });
});
