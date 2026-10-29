// Port of 001_Technical/001_Debugging/002_DebugConsole.rb: Kernel#echo /
// #echoln (only with $DEBUG) and the Console module's message formatting.
// Ruby prints to the console window mkxp opens in Debug mode; here the text
// goes to the browser's console, a line at a time (echo without a line break
// is buffered until the line ends). The ANSI colour codes are kept: Chrome's
// DevTools renders them.

import { DEBUG } from "../core/debug";

let pending = "";

/** Bitmap.max_size (mkxp: the GPU's largest texture side). */
function maxTextureSize(): number {
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    return gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0;
  } catch {
    return 0;
  }
}

/** Where finished lines go (console.log; tests can replace it). */
export const ConsoleOutput = {
  sink: (line: string): void => console.log(line),
};

function inspect(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null || value === undefined) return "nil";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Kernel#echo */
export function echo(string: unknown): void {
  if (!DEBUG) return;
  pending += typeof string === "string" ? string : inspect(string);
  const lines = pending.split(/\r?\n/);
  pending = lines.pop() ?? "";
  for (const line of lines) ConsoleOutput.sink(line);
}

/** Kernel#echoln */
export function echoln(string: unknown): void {
  echo(string);
  echo("\r\n");
}

/** Ruby's String#squeeze(chars): runs of the same character (of `chars`, or any) become one. */
function squeeze(str: string, chars: string | null = null): string {
  let out = "";
  for (const c of str) {
    if (out.endsWith(c) && (chars === null || chars.includes(c))) continue;
    out += c;
  }
  return out;
}

type ColorName = keyof typeof stringColors;
type FontOption = keyof typeof fontOptions;
export type MarkupOptions = { text?: ColorName; bg?: ColorName } & Partial<Record<FontOption, boolean>>;

const stringColors = {
  default: "38", black: "30", red: "31", green: "32", brown: "33",
  blue: "34", purple: "35", cyan: "36", gray: "37",
  dark_gray: "1;30", light_red: "1;31", light_green: "1;32", yellow: "1;33",
  light_blue: "1;34", light_purple: "1;35", light_cyan: "1;36", white: "1;37",
};

const backgroundColors: Record<ColorName, string> = {
  default: "0", black: "40", red: "41", green: "42", brown: "43",
  blue: "44", purple: "45", cyan: "46", gray: "47",
  dark_gray: "100", light_red: "101", light_green: "102", yellow: "103",
  light_blue: "104", light_purple: "105", light_cyan: "106", white: "107",
};

const fontOptions = {
  bold: "1", dim: "2", italic: "3", underline: "4", reverse: "7",
  hidden: "8",
};

// Text markup that turns text between them a certain color
const markupColors: Record<string, ColorName> = {
  "`": "cyan", '"': "purple", "==": "purple", "$": "green", "~": "red",
};

const markupOptions: Record<string, FontOption> = {
  "__": "underline", "*": "bold", "|": "italic",
};

const markupAllOptions = [...Object.keys(markupColors), ...Object.keys(markupOptions)];

export const Console = {
  /** Console.setup_console (run once at startup, like the Ruby file's last line). */
  setupConsole(): void {
    if (!DEBUG) return;
    echoln(`GPU Cache Max: ${maxTextureSize()}`);
    echoln("-------------------------------------------------------------------------------");
    echoln(`${document.title} Output Window`);
    echoln("-------------------------------------------------------------------------------");
    echoln("If you can see this window, you are running the game in Debug Mode. This means");
    echoln("that you're either playing a debug version of the game, or you're playing from");
    echoln("within RPG Maker XP.");
    echoln("");
    echoln("Closing this window will close the game. If you want to get rid of this window,");
    echoln("run the program from the Shell, or download a release version of the game.");
    echoln("-------------------------------------------------------------------------------");
    echoln("Debug Output:");
    echoln("-------------------------------------------------------------------------------");
    echoln("");
  },

  /** Console.readInput: there's no stdin in a browser (window.prompt is the nearest thing). */
  readInput(): string {
    return (typeof prompt === "function" ? prompt("") ?? "" : "").trim();
  },
  readInput2(): string {
    return Console.readInput();
  },
  getInput(): void {
    echo(Console.readInput2());
  },

  //-----------------------------------------------------------------------------
  //  echo string into console (example shorthand for common options)
  //-----------------------------------------------------------------------------
  /** heading 1 */
  echoH1(msg: string): void {
    echoln(Console.markupStyle(`*** ${msg} ***`, { text: "brown" }));
    echoln("");
  },

  /** heading 2 */
  echoH2(msg: string, options: MarkupOptions = {}): void {
    echoln(Console.markupStyle(msg, options));
    echoln("");
  },

  /** heading 3 */
  echoH3(msg: string): void {
    echoln(Console.markup(msg));
    echoln("");
  },

  /** list item */
  echoLi(msg: string, pad = 0, color: ColorName = "brown"): void {
    echo(Console.markupStyle("  -> ", { text: color }));
    const padding = pad - msg.length > 0 ? ".".repeat(pad - msg.length) : "";
    echo(Console.markup(msg + padding));
  },

  /** list item with line break after */
  echolnLi(msg: string, pad = 0, color: ColorName = "brown"): void {
    Console.echoLi(msg, pad, color);
    echoln("");
  },

  /** paragraph with markup */
  echoP(msg: string): void {
    echoln(Console.markup(msg));
  },

  /** warning message */
  echoWarn(msg: string): void {
    echoln(Console.markupStyle(`WARNING: ${msg}`, { text: "yellow" }));
  },

  /** error message */
  echoError(msg: string): void {
    echoln(Console.markupStyle(`ERROR: ${msg}`, { text: "light_red" }));
  },

  /** status output */
  echoStatus(status: boolean): void {
    if (status) echoln(Console.markupStyle("OK", { text: "green" }));
    else echoln(Console.markupStyle("FAIL", { text: "red" }));
  },

  /** completion output */
  echoDone(status: boolean): void {
    if (status) echoln(Console.markupStyle("done", { text: "green" }));
    else echoln(Console.markupStyle("error", { text: "red" }));
  },

  //-----------------------------------------------------------------------------
  // Markup options
  //-----------------------------------------------------------------------------
  stringColors, backgroundColors, fontOptions, markupColors, markupOptions,

  /** apply console coloring */
  markupStyle(string: string, { text = "default", bg = "default", ...options }: MarkupOptions = {}): string {
    // get colors
    const codeText = stringColors[text] ?? "";
    const codeBg = backgroundColors[bg] ?? "";
    // get options
    const optionsPool = (Object.keys(options) as FontOption[]).filter((key) => key in fontOptions && options[key]);
    const markupPool = squeeze(optionsPool.map((opt) => fontOptions[opt]).join(";"));
    // return formatted string
    return squeeze(`\x1b[${codeBg};${markupPool};${codeText}m${string}\x1b[0m`, ";");
  },

  //-----------------------------------------------------------------------------
  // Perform markup on text
  //-----------------------------------------------------------------------------
  markupComponent(string: string, component: string, key: string, options: Record<string, MarkupOptions>): [string, Record<string, MarkupOptions>] {
    // trim inner markup content
    const l = key.length;
    const trimmed = component.slice(l, component.length - l);
    // merge markup options
    options[trimmed] ??= {};
    if (key in markupColors) options[trimmed]!.text = markupColors[key];
    if (key in markupOptions) options[trimmed]![markupOptions[key]!] = true;
    // remove markup from input string
    string = string.split(component).join(trimmed);
    // return output
    return [string, options];
  },

  markupBreakdown(string: string, options: Record<string, MarkupOptions> = {}): [string, Record<string, MarkupOptions>] {
    // iterate through all options
    for (const key of markupAllOptions) {
      // ensure escape
      const keyChar = [...key].map((c) => "\\" + c).join("");
      // define regex
      const regex = new RegExp(`${keyChar}.*?${keyChar}`, "g");
      // go through matches
      const component = string.match(regex)?.[0];
      if (component !== undefined) return Console.markupBreakdown(...Console.markupComponent(string, component, key, options));
    }
    // return output
    return [string, options];
  },

  markup(string: string): string {
    // get a breakdown of all markup options
    const [broken, options] = Console.markupBreakdown(string);
    let ret = broken;
    // iterate through each option and apply
    for (const [key, opt] of Object.entries(options)) ret = ret.split(key).join(Console.markupStyle(key, opt));
    // return string
    return ret;
  },
};
