// Port of 007_Objects and windows/010_DrawText.rb, with the v20.1 Hotfixes
// version of drawSingleFormattedChar (underline/strikeout fix).
//
// Formatted characters keep Ruby's array layout so this file can be checked
// line by line against the original (ch[1] is x, ch[2] is y, ...).

import { Bitmap, Font } from "../rgss/Bitmap";
import { Color, Rect } from "../rgss/types";
import { RPGCache } from "./rpgCache";

/**
 * One formatted character, as returned by getFormattedText:
 *  0 text (or graphic path)  1 x  2 y  3 width  4 height  5 is graphic
 *  6 bold  7 italic  8 base colour  9 shadow colour  10 underline
 *  11 strikeout  12 font name  13 font size  14 position in the unformatted
 *  text  15 graphic rect  16 outline flags (1 outln, 2 outln2)
 */
export type FormattedChar = [
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  graphic: boolean,
  bold: boolean,
  italic: boolean,
  color: Color,
  shadow: Color | null,
  underline: boolean,
  strike: boolean,
  fontName: string,
  fontSize: number,
  position: number,
  graphicRect: Rect | null,
  outline: number,
];

/** What the formatter needs from a bitmap (lets tests measure without a canvas). */
export interface TextBitmap {
  font: Font;
  textSize(text: string): Rect;
  isDisposed(): boolean;
}

/** Ruby's /\s/ (ASCII whitespace only). */
const RUBY_SPACE = /[ \t\r\n\f\v]/;

const hex = (n: number, digits: number) => Math.trunc(n).toString(16).toUpperCase().padStart(digits, "0");

/** Font.exist?: true if the font family was registered (or we can't tell). */
export function fontExists(name: string): boolean {
  if (typeof document === "undefined" || !document.fonts) return true;
  const lower = name.toLowerCase();
  for (const face of document.fonts) {
    if (face.family.replace(/^["']|["']$/g, "").toLowerCase() === lower) return true;
  }
  return false;
}

//===============================================================================
// Text colours
//===============================================================================
export function ctag(color: Color): string {
  const ret =
    ((Math.trunc(color.red) << 24) | (Math.trunc(color.green) << 16) | (Math.trunc(color.blue) << 8) | Math.trunc(color.alpha)) >>> 0;
  return `<c=${hex(ret, 8)}>`;
}

export function shadowctag(base: Color, shadow: Color): string {
  return `<c2=${colorToRgb16(base)}${colorToRgb16(shadow)}>`;
}

export function shadowc3tag(base: Color, shadow: Color): string {
  return `<c3=${colorToRgb32(base)},${colorToRgb32(shadow)}>`;
}

export function shadowctagFromColor(color: Color): string {
  return shadowc3tag(color, getContrastColor(color));
}

export function shadowctagFromRgb(param: string): string {
  return shadowctagFromColor(rgbToColor(param));
}

export function colorToRgb32(color: Color | null | undefined): string {
  if (!color) return "";
  if (Math.trunc(color.alpha) === 255) return hex(color.red, 2) + hex(color.green, 2) + hex(color.blue, 2);
  return hex(color.red, 2) + hex(color.green, 2) + hex(color.blue, 2) + hex(color.alpha, 2);
}

export function colorToRgb16(color: Color): string {
  let ret = Math.trunc(color.red) >> 3;
  ret |= (Math.trunc(color.green) >> 3) << 5;
  ret |= (Math.trunc(color.blue) >> 3) << 10;
  return hex(ret, 4);
}

/** Ruby's String#to_i(16): leading hex digits, 0 if none. */
function hexToInt(s: string): number {
  const m = /^\s*[0-9a-f]+/i.exec(s);
  return m ? parseInt(m[0], 16) : 0;
}

export function rgbToColor(param: string | null | undefined): Color {
  if (!param) return Font.defaultColor.clone();
  const baseint = hexToInt(param);
  switch (param.length) {
    case 8:
      return new Color((baseint >>> 24) & 0xff, (baseint >> 16) & 0xff, (baseint >> 8) & 0xff, baseint & 0xff);
    case 6:
      return new Color((baseint >> 16) & 0xff, (baseint >> 8) & 0xff, baseint & 0xff);
    case 4:
      return new Color((baseint & 0x1f) << 3, ((baseint >> 5) & 0x1f) << 3, ((baseint >> 10) & 0x1f) << 3);
    case 1: {
      const i = parseInt(param, 10) || 0;
      if (i >= 8) return Font.defaultColor.clone();
      return [
        new Color(255, 255, 255, 255),
        new Color(128, 128, 255, 255),
        new Color(255, 128, 128, 255),
        new Color(128, 255, 128, 255),
        new Color(128, 255, 255, 255),
        new Color(255, 128, 255, 255),
        new Color(255, 255, 128, 255),
        new Color(192, 192, 192, 255),
      ][i]!;
    }
    default:
      return Font.defaultColor.clone();
  }
}

export function Rgb16ToColor(param: string): Color {
  const baseint = hexToInt(param);
  return new Color((baseint & 0x1f) << 3, ((baseint >> 5) & 0x1f) << 3, ((baseint >> 10) & 0x1f) << 3);
}

export function getContrastColor(color: Color): Color {
  const r = color.red;
  const g = color.green;
  const b = color.blue;
  const yuv = [
    r * 0.299 + g * 0.587 + b * 0.114,
    r * -0.1687 + g * -0.3313 + b * 0.5 + 0.5,
    r * 0.5 + g * -0.4187 + b * -0.0813 + 0.5,
  ] as [number, number, number];
  if (yuv[0] < 127.5) yuv[0] += (255 - yuv[0]) / 2;
  else yuv[0] = yuv[0] / 2;
  return new Color(
    yuv[0] + 1.4075 * (yuv[2] - 0.5),
    yuv[0] - 0.3455 * (yuv[1] - 0.5) - 0.7169 * (yuv[2] - 0.5),
    yuv[0] + 1.779 * (yuv[1] - 0.5),
    color.alpha,
  );
}

//===============================================================================
// Format text
//===============================================================================
export const FORMATREGEXP = /<(\/?)(c|c2|c3|o|fn|br|fs|i|b|r|pg|pog|u|s|icon|img|ac|ar|al|outln|outln2)(\s*=\s*([^>]*))?>/i;
const FORMATREGEXP_G = new RegExp(FORMATREGEXP.source, "gi");

export function fmtescape(text: string): string {
  if (/[&<>]/.test(text)) return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text;
}

function unescapeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export function toUnformattedText(text: string): string {
  return unescapeEntities(text.replace(FORMATREGEXP_G, ""));
}

export function unformattedTextLength(text: string): number {
  return Array.from(toUnformattedText(text)).length;
}

export function itemIconTag(item: { iconName?: string } | null): string {
  if (!item) return "";
  return `<icon=${item.iconName ?? ""}>`;
}

export function getFormattedTextForDims(
  bitmap: TextBitmap, xDst: number, yDst: number, widthDst: number, heightDst: number, text: string,
  lineheight: number, newlineBreaks = true, explicitBreaksOnly = false,
): FormattedChar[] {
  let text2 = text.replace(/<(\/?)(c|c2|c3|o|u|s)(\s*=\s*([^>]*))?>/gi, "");
  if (newlineBreaks) text2 = text2.replace(/<(\/?)(br)(\s*=\s*([^>]*))?>/gi, "\n");
  return getFormattedText(bitmap, xDst, yDst, widthDst, heightDst, text2, lineheight, newlineBreaks, explicitBreaksOnly, true);
}

function newlineChar(x: number, y: number, lineheight: number, color: Color, shadow: Color | null, position: number): FormattedChar {
  return ["\n", x, y, 0, lineheight, false, false, false, color, shadow, false, false, "", 8, position, null, 0];
}

export function getFormattedTextFast(
  bitmap: TextBitmap, xDst: number, yDst: number, widthDst: number, heightDst: number, text: string,
  lineheight: number, newlineBreaks = true, explicitBreaksOnly = false,
): FormattedChar[] {
  let x = 0;
  let y = 0;
  let characters: (FormattedChar | null)[] = [];
  const textchars = Array.from(text);
  const lastword = [0, 0]; // position of last word
  let hadspace = false;
  let hadnonspace = false;
  const bold = bitmap.font.bold;
  const italic = bitmap.font.italic;
  const colorclone = bitmap.font.color;
  let defaultfontname = bitmap.font.name;
  if (!fontExists(defaultfontname)) defaultfontname = "Arial";
  let havenl = false;
  let position = 0;
  while (position < textchars.length) {
    const yStart = 0;
    const xStart = 0;
    const width = isWaitChar(textchars[position]!) ? 0 : bitmap.textSize(textchars[position]!).width;
    if (textchars[position] === "\n") {
      if (newlineBreaks) { // treat newline as break
        havenl = true;
        characters.push(newlineChar(x, y * lineheight + yDst, lineheight, colorclone, null, position));
        y += 1;
        x = 0;
        hadspace = true;
        hadnonspace = false;
        position += 1;
        continue;
      } else { // treat newline as space
        textchars[position] = " ";
      }
    }
    const isspace = RUBY_SPACE.test(textchars[position]!) || isWaitChar(textchars[position]!);
    if (hadspace && !isspace) {
      // set last word to here
      lastword[0] = characters.length;
      lastword[1] = x;
      hadspace = false;
      hadnonspace = true;
    } else if (isspace) {
      hadspace = true;
    }
    const texty = lineheight * y + yDst + yStart;
    // Push character
    if (heightDst < 0 || yStart < yDst + heightDst) {
      if (isWaitChar(textchars[position]!)) havenl = true;
      characters.push([textchars[position]!, x + xStart, texty, width + 2, lineheight, false, bold, italic,
        colorclone, null, false, false, defaultfontname, bitmap.font.size, position, null, 0]);
    }
    x += width;
    if (!explicitBreaksOnly && x + 2 > widthDst && lastword[1] !== 0 && (!hadnonspace || !hadspace)) {
      havenl = true;
      characters.splice(lastword[0]!, 0, newlineChar(x, y * lineheight + yDst, lineheight, colorclone, null, position));
      lastword[0]! += 1;
      y += 1;
      x = 0;
      for (let i = lastword[0]!; i < characters.length; i++) {
        const ch = characters[i]!;
        ch[2] += lineheight;
        const charwidth = ch[3] - 2;
        ch[1] = x;
        x += charwidth;
      }
      lastword[1] = 0;
    }
    position += 1;
  }
  // Eliminate spaces before newlines and pause character
  if (havenl) characters = eliminateSpaces(characters, null);
  const result = characters as FormattedChar[];
  for (const char of result) char[1] = xDst + char[1];
  // Remove all characters with Y greater or equal to _yDst_+_heightDst_
  if (heightDst >= 0) return result.filter((char) => char[2] < yDst + heightDst);
  return result;
}

/** The "Eliminate spaces before newlines and pause character" pass (compacts). */
function eliminateSpaces<T>(characters: (FormattedChar | null)[], internal: (T | null)[] | null): (FormattedChar | null)[] {
  let firstspace = -1;
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i]!;
    if (ch[5] !== false) { // If not a character
      firstspace = -1;
    } else if ((ch[0] === "\n" || isWaitChar(ch[0])) && firstspace >= 0) {
      for (let j = firstspace; j < i; j++) {
        characters[j] = null;
        if (internal) internal[j] = null;
      }
      firstspace = -1;
    } else if (/[ \r\t]/.test(ch[0])) {
      if (firstspace < 0) firstspace = i;
    } else {
      firstspace = -1;
    }
  }
  if (firstspace > 0) {
    for (let j = firstspace; j < characters.length; j++) {
      characters[j] = null;
      if (internal) internal[j] = null;
    }
  }
  if (internal) {
    const kept = internal.filter((c) => c !== null);
    internal.length = 0;
    internal.push(...kept);
  }
  return characters.filter((c) => c !== null);
}

export function isWaitChar(x: string): boolean {
  return x === "\x01" || x === "\x02";
}

export function getLastParam<T>(array: (T | null | undefined)[], defaultValue: T): T {
  for (let i = array.length - 1; i >= 0; i--) {
    const v = array[i];
    if (v !== null && v !== undefined) return v;
  }
  return defaultValue;
}

type ColorPair = [Color, Color | null];

export function getLastColors(colorstack: ColorPair[], opacitystack: number[], defaultcolors: ColorPair): ColorPair {
  let colors = getLastParam(colorstack, defaultcolors);
  const opacity = getLastParam(opacitystack, 255);
  if (opacity !== 255) {
    colors = [
      new Color(colors[0].red, colors[0].green, colors[0].blue, Math.floor((colors[0].alpha * opacity) / 255)),
      colors[1] ? new Color(colors[1].red, colors[1].green, colors[1].blue, Math.floor((colors[1].alpha * opacity) / 255)) : null,
    ];
  }
  return colors;
}

/** [align, line, xStart, char?, extraspace?] (charactersInternal in Ruby). */
type InternalChar = [number, number, number, string?, number?];

/**
 * Formats a string of text and returns a list of formatted characters. See
 * the long comment in 010_DrawText.rb for the supported tags
 * (<b> <i> <u> <s> <al> <ar> <ac> <r> <br> <c=> <c2=> <c3=> <o=> <outln>
 * <outln2> <fn=> <fs=> <icon=> <img=>, and &lt; &gt; &amp; &apos; &quot;).
 */
export function getFormattedText(
  bitmap: TextBitmap | null, xDst: number, yDst: number, widthDst: number, heightDst: number, text: string,
  lineheight = 32, newlineBreaks = true, explicitBreaksOnly = false, collapseAlignments = false,
): FormattedChar[] {
  // (Ruby returns nil here, which callers can't handle anyway.)
  if (!bitmap || bitmap.isDisposed()) return [];
  if (widthDst <= 0 || heightDst === 0 || text.length === 0) return [];
  const textchunks: string[] = [];
  const controls: ([string, string, number, boolean] | null)[] = [];
  let m: RegExpExecArray | null;
  while ((m = FORMATREGEXP.exec(text))) {
    textchunks.push(text.slice(0, m.index));
    if (m[3] !== undefined) controls.push([m[2]!.toLowerCase(), m[4] ?? "", -1, m[1] === "/"]);
    else controls.push([m[2]!.toLowerCase(), "", -1, m[1] === "/"]);
    text = text.slice(m.index + m[0].length);
  }
  if (controls.length === 0) {
    return getFormattedTextFast(bitmap, xDst, yDst, widthDst, heightDst, text, lineheight, newlineBreaks, explicitBreaksOnly);
  }
  let x = 0;
  let y = 0;
  let characters: (FormattedChar | null)[] = [];
  const charactersInternal: (InternalChar | null)[] = [];
  textchunks.push(text);
  for (let i = 0; i < textchunks.length; i++) textchunks[i] = unescapeEntities(textchunks[i]!);
  let textlen = 0;
  controls.forEach((control, i) => {
    textlen += Array.from(textchunks[i]!).length;
    control![2] = textlen;
  });
  text = textchunks.join("");
  const textchars = Array.from(text);
  const colorstack: ColorPair[] = [];
  let boldcount = 0;
  let italiccount = 0;
  let outlinecount = 0;
  let underlinecount = 0;
  let strikecount = 0;
  let rightalign = 0;
  let outline2count = 0;
  const opacitystack: number[] = [];
  const oldfont = bitmap.font.clone();
  let defaultfontname = bitmap.font.name;
  const defaultfontsize = bitmap.font.size;
  let fontsize = defaultfontsize;
  const fontnamestack: string[] = [];
  const fontsizestack: number[] = [];
  const defaultcolors: ColorPair = [oldfont.color.clone(), null];
  if (!fontExists(defaultfontname)) defaultfontname = "Arial";
  let fontname = defaultfontname;
  const alignstack: number[] = [];
  let lastword = [0, 0]; // position of last word
  let hadspace = false;
  let hadnonspace = false;
  let havenl = false;
  let position = 0;
  while (position < textchars.length) {
    let nextline = 0;
    let graphic: string | null = null;
    let graphicX = 0;
    let graphicY = 4;
    let graphicWidth: number | null = null;
    let graphicHeight: number | null = null;
    let graphicRect: Rect | null = null;
    for (let i = 0; i < controls.length; i++) {
      const c = controls[i];
      if (!c || c[2] !== position) continue;
      const control = c[0];
      let param = c[1];
      const endtag = c[3];
      let stop = false;
      switch (control) {
        case "c":
          if (endtag) colorstack.pop();
          else colorstack.push([rgbToColor(param), null]);
          break;
        case "c2":
          if (endtag) colorstack.pop();
          else colorstack.push([Rgb16ToColor(param.slice(0, 4)), Rgb16ToColor(param.slice(4, 8))]);
          break;
        case "c3":
          if (endtag) {
            colorstack.pop();
          } else {
            const parts = param.split(",");
            // get pure colors unaffected by opacity
            const oldColors = getLastParam(colorstack, defaultcolors);
            const base = parts[0] ? rgbToColor(parts[0]) : oldColors[0];
            const shadow = parts[1] ? rgbToColor(parts[1]) : oldColors[1];
            colorstack.push([base, shadow]);
          }
          break;
        case "o":
          if (endtag) opacitystack.pop();
          else opacitystack.push(parseInt(param.replace(/\s+$/, ""), 10) || 0);
          break;
        case "b": boldcount += endtag ? -1 : 1; break;
        case "i": italiccount += endtag ? -1 : 1; break;
        case "u": underlinecount += endtag ? -1 : 1; break;
        case "s": strikecount += endtag ? -1 : 1; break;
        case "outln": outlinecount += endtag ? -1 : 1; break;
        case "outln2": outline2count += endtag ? -1 : 1; break;
        case "fs": // Font size
          if (endtag) fontsizestack.pop();
          else fontsizestack.push(parseInt(param.replace(/\s+$/, ""), 10) || 0);
          fontsize = getLastParam(fontsizestack, defaultfontsize);
          bitmap.font.size = fontsize;
          break;
        case "fn": // Font name
          if (endtag) {
            fontnamestack.pop();
          } else {
            fontname = param.replace(/\s+$/, "");
            fontnamestack.push(fontExists(fontname) ? fontname : "Arial");
          }
          fontname = getLastParam(fontnamestack, defaultfontname);
          bitmap.font.name = fontname;
          break;
        case "ar": // Right align
          if (endtag) alignstack.pop();
          else alignstack.push(1);
          if (x > 0 && nextline === 0) nextline = 1;
          break;
        case "al": // Left align
          if (endtag) alignstack.pop();
          else alignstack.push(0);
          if (x > 0 && nextline === 0) nextline = 1;
          break;
        case "ac": // Center align
          if (endtag) alignstack.pop();
          else alignstack.push(2);
          if (x > 0 && nextline === 0) nextline = 1;
          break;
        case "icon": // Icon
          if (!endtag) {
            param = param.replace(/\s+$/, "");
            graphic = `Graphics/Icons/${param}`;
            controls[i] = null;
            stop = true;
          }
          break;
        case "img": // Icon
          if (!endtag) {
            const parts = param.replace(/\s+$/, "").split("|");
            graphic = parts[0] ?? "";
            if (parts.length > 1) {
              graphicX = parseInt(parts[1] ?? "", 10) || 0;
              graphicY = parseInt(parts[2] ?? "", 10) || 0;
              graphicWidth = parseInt(parts[3] ?? "", 10) || 0;
              graphicHeight = parseInt(parts[4] ?? "", 10) || 0;
            }
            controls[i] = null;
            stop = true;
          }
          break;
        case "br": // Line break
          if (!endtag) nextline += 1;
          break;
        case "r": // Right align this line
          if (!endtag) {
            x = 0;
            rightalign = 1;
            lastword = [characters.length, x];
          }
          break;
      }
      if (stop) break;
      controls[i] = null;
    }
    bitmap.font.bold = boldcount > 0;
    bitmap.font.italic = italiccount > 0;
    let width: number;
    let xStart: number;
    let yStart: number;
    if (graphic) {
      if (graphicWidth === null) {
        const tempgraphic = RPGCache.loadBitmap(graphic);
        graphicWidth = tempgraphic?.width ?? 32;
        graphicHeight = tempgraphic?.height ?? 32;
      }
      width = graphicWidth; // +8  # No padding
      xStart = 0; // 4
      yStart = Math.max(Math.floor(lineheight / 2) - Math.floor(graphicHeight! / 2), 0);
      yStart += 4; // TEXT OFFSET
      graphicRect = new Rect(graphicX, graphicY, graphicWidth, graphicHeight!);
    } else {
      xStart = 0;
      yStart = 0;
      width = isWaitChar(textchars[position]!) ? 0 : bitmap.textSize(textchars[position]!).width;
      if (width > 0 && outline2count > 0) width += 2;
    }
    let alignment: number;
    if (rightalign === 1 && nextline === 0) alignment = 1;
    else alignment = getLastParam(alignstack, 0);
    for (let n = 0; n < nextline; n++) {
      havenl = true;
      characters.push(newlineChar(x, y * lineheight + yDst, lineheight, defaultcolors[0], defaultcolors[1], position));
      charactersInternal.push([alignment, y, 0]);
      y += 1;
      x = 0;
      rightalign = 0;
      lastword = [characters.length, x];
      hadspace = false;
      hadnonspace = false;
    }
    if (textchars[position] === "\n") {
      if (newlineBreaks) {
        if (nextline === 0) {
          havenl = true;
          characters.push(newlineChar(x, y * lineheight + yDst, lineheight, defaultcolors[0], defaultcolors[1], position));
          charactersInternal.push([alignment, y, 0]);
          y += 1;
          x = 0;
        }
        rightalign = 0;
        hadspace = true;
        hadnonspace = false;
        position += 1;
        continue;
      } else {
        textchars[position] = " ";
        if (!graphic) {
          width = bitmap.textSize(textchars[position]!).width;
          if (width > 0 && outline2count > 0) width += 2;
        }
      }
    }
    const isspace = RUBY_SPACE.test(textchars[position]!) || isWaitChar(textchars[position]!);
    if (hadspace && !isspace) {
      // set last word to here
      lastword[0] = characters.length;
      lastword[1] = x;
      hadspace = false;
      hadnonspace = true;
    } else if (isspace) {
      hadspace = true;
    }
    const texty = lineheight * y + yDst + yStart - 2; // TEXT OFFSET
    const colors = getLastColors(colorstack, opacitystack, defaultcolors);
    // Push character
    if (heightDst < 0 || texty < yDst + heightDst) {
      if (!graphic && isWaitChar(textchars[position]!)) havenl = true;
      const extraspace = !graphic && italiccount > 0 ? 2 + Math.floor(width / 2) : 2;
      characters.push([graphic ?? textchars[position]!, x + xStart, texty, width + extraspace, lineheight,
        !!graphic, boldcount > 0, italiccount > 0, colors[0], colors[1], underlinecount > 0, strikecount > 0,
        fontname, fontsize, position, graphicRect, (outlinecount > 0 ? 1 : 0) + (outline2count > 0 ? 2 : 0)]);
      charactersInternal.push([alignment, y, xStart, textchars[position], extraspace]);
    }
    x += width;
    if (!explicitBreaksOnly && x + 2 > widthDst && lastword[1] !== 0 && (!hadnonspace || !hadspace)) {
      havenl = true;
      characters.splice(lastword[0]!, 0, newlineChar(x, y * lineheight + yDst, lineheight, defaultcolors[0], defaultcolors[1], position));
      charactersInternal.splice(lastword[0]!, 0, [alignment, y, 0]);
      lastword[0]! += 1;
      y += 1;
      x = 0;
      for (let i = lastword[0]!; i < characters.length; i++) {
        const ch = characters[i]!;
        const internal = charactersInternal[i]!;
        ch[2] += lineheight;
        internal[1] += 1;
        const extraspace = internal[4] ?? 0;
        const charwidth = ch[3] - extraspace;
        ch[1] = x + internal[2];
        x += charwidth;
      }
      lastword[1] = 0;
    }
    if (!graphic) position += 1;
  }
  // (Ruby has a commented-out two-line balancing pass here.)
  if (havenl) characters = eliminateSpaces(characters, charactersInternal);
  const chars = characters as FormattedChar[];
  const internals = charactersInternal as InternalChar[];
  // Calculate Xs based on alignment
  // First, find all text runs with the same alignment on the same line
  let totalwidth = 0;
  const widthblocks: [number, number, number, number, number][] = [];
  let lastalign = 0;
  let lasty = 0;
  let runstart = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const internal = internals[i]!;
    if (i > 0 && (internal[0] !== lastalign || internal[1] !== lasty)) {
      // Found end of run
      widthblocks.push([runstart, i, lastalign, totalwidth, lasty]);
      runstart = i;
      totalwidth = 0;
    }
    lastalign = internal[0];
    lasty = internal[1];
    const extraspace = internal[4] ?? 0;
    totalwidth += c[3] - extraspace;
  }
  widthblocks.push([runstart, chars.length, lastalign, totalwidth, lasty]);
  if (collapseAlignments) {
    // Calculate the total width of each line
    const totalLineWidths: number[] = [];
    for (const block of widthblocks) {
      const ly = block[4];
      if (totalLineWidths[ly] === undefined) totalLineWidths[ly] = 0;
      // padding in case more than one line has different alignments
      if (totalLineWidths[ly] !== 0) totalLineWidths[ly]! += 16;
      totalLineWidths[ly]! += block[3];
    }
    // Calculate a new width for the next step
    const widths = totalLineWidths.filter((w) => w !== undefined);
    widthDst = Math.min(widthDst, widths.length ? Math.max(...widths) : 0);
  }
  // Now, based on the text runs found, recalculate Xs
  for (const block of widthblocks) {
    if (block[0] >= block[1]) continue;
    for (let i = block[0]; i < block[1]; i++) {
      const ch = chars[i]!;
      switch (block[2]) {
        case 1: ch[1] = xDst + (widthDst - block[3] - 4) + ch[1]; break;
        case 2: ch[1] = xDst + (Math.floor(widthDst / 2) - Math.floor(block[3] / 2)) + ch[1]; break;
        default: ch[1] = xDst + ch[1];
      }
    }
  }
  bitmap.font = oldfont;
  // Remove all characters with Y greater or equal to _yDst_+_heightDst_
  if (heightDst >= 0) return chars.filter((ch) => ch[2] < yDst + heightDst);
  return chars;
}

//===============================================================================
// Draw text and images on a bitmap
//===============================================================================
/** [text, x, y, width, height, line, position, column, length] */
export type LineBrokenText = [string, number, number, number, number, number, number, number, number];

export function getLineBrokenText(bitmap: TextBitmap, value: string, width: number, dims: number[] | null): LineBrokenText[] {
  let x = 0;
  let y = 0;
  let textheight = 0;
  const ret: LineBrokenText[] = [];
  if (dims) {
    dims[0] = 0;
    dims[1] = 0;
  }
  let line = 0;
  let position = 0;
  let column = 0;
  if (!bitmap || bitmap.isDisposed() || width <= 0) return ret;
  let textmsg = value;
  ret.push(["", 0, 0, 0, bitmap.textSize("X").height, 0, 0, 0, 0]);
  const re = /\n|(\S*([ \r\t\f]?))/y;
  for (;;) {
    re.lastIndex = 0;
    const m = re.exec(textmsg);
    if (!m || m[0] === "") break;
    const c = m[0];
    textmsg = textmsg.slice(c.length);
    const length = Array.from(c).length;
    if (c === "\n") {
      ret.push(["\n", x, y, 0, textheight, line, position, column, 0]);
      x = 0;
      y += textheight === 0 ? bitmap.textSize("X").height : textheight;
      line += 1;
      textheight = 0;
      column = 0;
      position += length;
      ret.push(["", x, y, 0, textheight, line, position, column, 0]);
      continue;
    }
    const word = c;
    const textSize = bitmap.textSize(word);
    const textwidth = textSize.width;
    if (x > 0 && x + textwidth >= width - 2) {
      // Zero-length word break
      ret.push(["", x, y, 0, textheight, line, position, column, 0]);
      x = 0;
      column = 0;
      y += textheight === 0 ? bitmap.textSize("X").height : textheight;
      line += 1;
      textheight = 0;
    }
    textheight = Math.max(textheight, textSize.height);
    ret.push([word, x, y, textwidth, textheight, line, position, column, length]);
    x += textwidth;
    if (dims && dims[0]! < x) dims[0] = x;
    position += length;
    column += length;
  }
  if (dims) dims[1] = y + textheight;
  return ret;
}

/** [text, x, y, width, height, color] */
export type LineBrokenChunk = [string, number, number, number, number, Color];

export function getLineBrokenChunks(bitmap: TextBitmap, value: string, width: number, dims: number[] | null, plain = false): LineBrokenChunk[] {
  let x = 0;
  let y = 0;
  const ret: LineBrokenChunk[] = [];
  if (dims) {
    dims[0] = 0;
    dims[1] = 0;
  }
  const reNoMatch = /<c=[^>]+>/;
  if (!bitmap || bitmap.isDisposed() || width <= 0) return ret;
  let textmsg = value;
  let color = Font.defaultColor.clone();
  const chunkRe = /\n|[^ \r\t\f\n-]*-+|(\S*([ \r\t\f]?))/y;
  for (;;) {
    chunkRe.lastIndex = 0;
    const m = chunkRe.exec(textmsg);
    if (!m || m[0] === "") break;
    const ccheck = m[0];
    textmsg = textmsg.slice(ccheck.length);
    if (ccheck === "\n") {
      x = 0;
      y += 32;
      continue;
    }
    const textcols: Color[] = [];
    let words: string[];
    if (ccheck.includes("<") && !plain) {
      for (const cm of ccheck.matchAll(/<c=([^>]+)>/g)) textcols.push(rgbToColor(cm[1]));
      words = ccheck.split(reNoMatch); // must have no matches because split can include match
    } else {
      words = [ccheck];
    }
    for (let i = 0; i < words.length; i++) {
      const word = words[i]!;
      if (word !== "") {
        const textSize = bitmap.textSize(word);
        const textwidth = textSize.width;
        if (x > 0 && x + textwidth > width) {
          const minTextSize = bitmap.textSize(word.replace(/\s*/g, ""));
          if (x > 0 && x + minTextSize.width > width) {
            x = 0;
            y += 32;
          }
        }
        ret.push([word, x, y, textwidth, 32, color]);
        x += textwidth;
        if (dims && dims[0]! < x) dims[0] = x;
      }
      if (textcols[i]) color = textcols[i]!;
    }
  }
  if (dims) dims[1] = y + 32;
  return ret;
}

export function renderLineBrokenChunks(bitmap: Bitmap, xDst: number, yDst: number, normtext: LineBrokenChunk[], maxheight = 0): void {
  for (const text of normtext) {
    const width = text[3];
    const textx = text[1] + xDst;
    const texty = text[2] + yDst;
    if (maxheight === 0 || text[2] < maxheight) {
      bitmap.font.color = text[5];
      bitmap.drawText(textx, texty, width + 2, text[4], text[0]);
    }
  }
}

export function renderLineBrokenChunksWithShadow(
  bitmap: Bitmap, xDst: number, yDst: number, normtext: LineBrokenChunk[], maxheight: number, baseColor: Color, shadowColor: Color,
): void {
  for (const chunk of normtext) {
    const width = chunk[3];
    const textx = chunk[1] + xDst;
    const texty = chunk[2] + yDst;
    if (maxheight === 0 || chunk[2] < maxheight) {
      const height = chunk[4];
      const text = chunk[0];
      bitmap.font.color = shadowColor;
      bitmap.drawText(textx + 2, texty, width + 2, height, text);
      bitmap.drawText(textx, texty + 2, width + 2, height, text);
      bitmap.drawText(textx + 2, texty + 2, width + 2, height, text);
      bitmap.font.color = baseColor;
      bitmap.drawText(textx, texty, width + 2, height, text);
    }
  }
}

export function drawBitmapBuffer(chars: FormattedChar[]): Bitmap {
  let width = 1;
  let height = 1;
  for (const ch of chars) {
    width = Math.max(width, ch[1] + ch[3]);
    height = Math.max(height, ch[2] + ch[4]);
  }
  const buffer = new Bitmap(width, height);
  drawFormattedChars(buffer, chars);
  return buffer;
}

/** v20.1 Hotfixes version (fixed underline/strikeout positions, with shadows). */
export function drawSingleFormattedChar(bitmap: Bitmap, ch: FormattedChar): void {
  if (ch[5]) { // If a graphic
    const graphic = RPGCache.loadBitmap(ch[0]);
    if (graphic && ch[15]) bitmap.blt(ch[1], ch[2], graphic, ch[15], ch[8].alpha);
    return;
  }
  if (bitmap.font.size !== ch[13]) bitmap.font.size = ch[13];
  if (ch[9]) { // shadow
    if (ch[10]) { // underline
      bitmap.fillRect(ch[1], ch[2] + ch[4] - Math.max(Math.floor((ch[4] - bitmap.font.size) / 2), 0) - 2, ch[3], 4, ch[9]);
    }
    if (ch[11]) { // strikeout
      bitmap.fillRect(ch[1], ch[2] + 2 + Math.floor(ch[4] / 2), ch[3], 4, ch[9]);
    }
  }
  if (ch[0] === "\n" || ch[0] === "\r" || ch[0] === " " || isWaitChar(ch[0])) {
    bitmap.font.color = ch[8];
  } else {
    bitmap.font.bold = ch[6];
    bitmap.font.italic = ch[7];
    bitmap.font.name = ch[12];
    let offset = 0;
    if (ch[9]) { // shadow
      bitmap.font.color = ch[9];
      if ((ch[16] & 1) !== 0) { // outline
        offset = 1;
        bitmap.drawText(ch[1], ch[2], ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1], ch[2] + 1, ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1], ch[2] + 2, ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 1, ch[2], ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 1, ch[2] + 2, ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 2, ch[2], ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 2, ch[2] + 1, ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 2, ch[2] + 2, ch[3] + 2, ch[4], ch[0]);
      } else if ((ch[16] & 2) !== 0) { // outline 2
        offset = 2;
        bitmap.drawText(ch[1], ch[2], ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1], ch[2] + 2, ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1], ch[2] + 4, ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 2, ch[2], ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 2, ch[2] + 4, ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 4, ch[2], ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 4, ch[2] + 2, ch[3] + 4, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 4, ch[2] + 4, ch[3] + 4, ch[4], ch[0]);
      } else {
        bitmap.drawText(ch[1] + 2, ch[2], ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1], ch[2] + 2, ch[3] + 2, ch[4], ch[0]);
        bitmap.drawText(ch[1] + 2, ch[2] + 2, ch[3] + 2, ch[4], ch[0]);
      }
    }
    bitmap.font.color = ch[8];
    bitmap.drawText(ch[1] + offset, ch[2] + offset, ch[3], ch[4], ch[0]);
  }
  if (ch[10]) { // underline
    bitmap.fillRect(ch[1], ch[2] + ch[4] - Math.max(Math.floor((ch[4] - bitmap.font.size) / 2), 0) - 2, ch[3] - 2, 2, ch[8]);
  }
  if (ch[11]) { // strikeout
    bitmap.fillRect(ch[1], ch[2] + 2 + Math.floor(ch[4] / 2), ch[3] - 2, 2, ch[8]);
  }
}

export function drawFormattedChars(bitmap: Bitmap, chars: FormattedChar[]): void {
  if (chars.length === 0 || !bitmap || bitmap.isDisposed()) return;
  const oldfont = bitmap.font.clone();
  for (const ch of chars) drawSingleFormattedChar(bitmap, ch);
  bitmap.font = oldfont;
}

export function drawTextEx(bitmap: Bitmap, x: number, y: number, width: number, numlines: number, text: string, baseColor: Color, shadowColor: Color): void {
  const normtext = getLineBrokenChunks(bitmap, text, width, null, true);
  renderLineBrokenChunksWithShadow(bitmap, x, y, normtext, numlines * 32, baseColor, shadowColor);
}

export function drawFormattedTextEx(
  bitmap: Bitmap, x: number, y: number, width: number, text: string, baseColor: Color | null = null, shadowColor: Color | null = null, lineheight = 32,
): void {
  const base = baseColor ? baseColor.clone() : new Color(96, 96, 96);
  const shadow = shadowColor ? shadowColor.clone() : new Color(208, 208, 200);
  text = `<c2=${colorToRgb16(base)}${colorToRgb16(shadow)}>${text}`;
  const chars = getFormattedText(bitmap, x, y, width, -1, text, lineheight);
  drawFormattedChars(bitmap, chars);
}

export function pbDrawShadowText(
  bitmap: Bitmap, x: number, y: number, width: number, height: number, string: string | null,
  baseColor: Color | null, shadowColor: Color | null = null, align = 0,
): void {
  if (!bitmap || string == null) return;
  width = width < 0 ? bitmap.textSize(string).width + 1 : width;
  height = height < 0 ? bitmap.textSize(string).height + 1 : height;
  if (shadowColor && shadowColor.alpha > 0) {
    bitmap.font.color = shadowColor;
    bitmap.drawText(x + 2, y, width, height, string, align);
    bitmap.drawText(x, y + 2, width, height, string, align);
    bitmap.drawText(x + 2, y + 2, width, height, string, align);
  }
  if (baseColor && baseColor.alpha > 0) {
    bitmap.font.color = baseColor;
    bitmap.drawText(x, y, width, height, string, align);
  }
}

export function pbDrawOutlineText(
  bitmap: Bitmap, x: number, y: number, width: number, height: number, string: string | null,
  baseColor: Color | null, shadowColor: Color | null = null, align = 0,
): void {
  if (!bitmap || string == null) return;
  width = width < 0 ? bitmap.textSize(string).width + 4 : width;
  height = height < 0 ? bitmap.textSize(string).height + 4 : height;
  if (shadowColor && shadowColor.alpha > 0) {
    bitmap.font.color = shadowColor;
    for (const [dx, dy] of [[-2, -2], [0, -2], [2, -2], [-2, 0], [2, 0], [-2, 2], [0, 2], [2, 2]] as const) {
      bitmap.drawText(x + dx, y + dy, width, height, string, align);
    }
  }
  if (baseColor && baseColor.alpha > 0) {
    bitmap.font.color = baseColor;
    bitmap.drawText(x, y, width, height, string, align);
  }
}

/**
 * Text command: [text, x, y, align (true/1 right, 2 centre), base, shadow,
 * outline (true/1)].
 */
export type TextPosition = [string, number, number, boolean | number, Color | null, (Color | null)?, (boolean | number)?];

export function pbDrawTextPositions(bitmap: Bitmap, textpos: TextPosition[]): void {
  for (const i of textpos) {
    const textsize = bitmap.textSize(i[0]);
    let x = i[1];
    const y = i[2];
    if (i[3] === true || i[3] === 1) x -= textsize.width; // right align
    else if (i[3] === 2) x -= Math.floor(textsize.width / 2); // centered
    if (i[6] === true || i[6] === 1) {
      pbDrawOutlineText(bitmap, x, y, textsize.width, textsize.height, i[0], i[4], i[5] ?? null);
    } else {
      pbDrawShadowText(bitmap, x, y, textsize.width, textsize.height, i[0], i[4], i[5] ?? null);
    }
  }
}

//===============================================================================
// Draw images on a bitmap
//===============================================================================
export function pbCopyBitmap(dstbm: Bitmap, srcbm: Bitmap, x: number, y: number, opacity = 255): void {
  dstbm.blt(x, y, srcbm, new Rect(0, 0, srcbm.width, srcbm.height), opacity);
}

/** Image command: [path, x, y, srcX?, srcY?, width?, height?] (needs the image preloaded). */
export type ImagePosition = [string, number, number, number?, number?, number?, number?];

export function pbDrawImagePositions(bitmap: Bitmap, textpos: ImagePosition[]): void {
  for (const i of textpos) {
    const src = RPGCache.loadBitmap(i[0]);
    if (!src) continue;
    const srcx = i[3] ?? 0;
    const srcy = i[4] ?? 0;
    const width = i[5] !== undefined && i[5] >= 0 ? i[5] : src.width;
    const height = i[6] !== undefined && i[6] >= 0 ? i[6] : src.height;
    bitmap.blt(i[1], i[2], src, new Rect(srcx, srcy, width, height));
  }
}
