// Port of Data/Scripts/001_Technical/003_Intl_Messages.rb: the translation
// system. Messages holds the game's texts per MessageTypes section (arrays
// indexed by ID, or hashes keyed by the English text); MessageTypes is the
// loaded language plus the fallback; _INTL / _ISPRINTF / _MAPINTL look a text
// up and fill in its {1}, {2}... placeholders.
//
// Browser equivalents: Ruby's Marshal'd messages.dat (and each language's
// .dat in Settings::LANGUAGES) is JSON fetched from web/data (OrderedHash
// sections become {"hash": [[key, value], ...]}); intl.txt (Extract Text /
// Compile Text) is read and written as a string. The original texts live in
// the game data itself (PBS names, event text), so the fallback set
// (@@messagesFallback, Data/messages.dat) is empty unless a file is loaded
// into it, and a lookup with nothing loaded returns its key as in Ruby.

/** An Essentials OrderedHash: a Hash that remembers its keys' order. */
export type OrderedHash = Map<string, string>;
/** One section: an Array indexed by ID, or an OrderedHash keyed by the original text. */
type Section = string[] | OrderedHash;
/** messages[0] is the per-map hashes (index 0: common events); the rest are sections by MessageTypes ID. */
type MessageData = (Section | (OrderedHash | undefined)[] | undefined)[];

const isHash = (s: unknown): s is OrderedHash => s instanceof Map;
const toS = (v: unknown): string => (v == null ? "" : String(v)); // Ruby's to_s (nil.to_s is "")

//===============================================================================
// Text extraction (Debug: Extract Text)
//===============================================================================

/** pbAddScriptTexts(items, script): the strings in _I("...") calls. */
export function pbAddScriptTexts(items: string[], script: string): void {
  for (const m of script.matchAll(/(?:_I)\s*\(\s*"((?:[^\\"]*\\"?)*[^"]*)"/g)) {
    items.push(m[1]!.replace(/\\"/g, "\"").replace(/\\\\/g, "\\"));
  }
}

/** pbAddRgssScriptTexts(items, script): the strings in _INTL("...") / _ISPRINTF("...") calls. */
export function pbAddRgssScriptTexts(items: string[], script: string): void {
  for (const m of script.matchAll(/(?:_INTL|_ISPRINTF)\s*\(\s*"((?:[^\\"]*\\"?)*[^"]*)"/g)) {
    items.push(m[1]!.replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\1/g, "\x01")
      .replace(/\\"/g, "\"").replace(/\\\\/g, "\\"));
  }
}

/** The event command lists pbSetTextMessages reads (map event pages or common events). */
interface TextCommand { cmd: string; text?: unknown; choices?: unknown; fn?: unknown; args?: unknown; ruby?: unknown; cond?: unknown; then?: unknown; else?: unknown; [k: string]: unknown }

/**
 * The texts of one event list, as pbSetTextMessages collects them: Show Text
 * (101 + 401 continuation lines, already joined here), Show Choices (102),
 * and _I("...") in Script commands (355/655), Script conditions (111/12) and
 * Script move route commands (209/45). Nested branches are walked in order,
 * as Ruby walks the flat list.
 */
function addEventTexts(list: unknown, items: string[], choices: string[]): void {
  if (!Array.isArray(list)) return;
  for (const c of list as TextCommand[]) {
    if (!c || typeof c !== "object") continue;
    if (c.cmd === "text" && typeof c.text === "string") {
      const item = c.text.replace(/([^.!?])\s\s+/g, "$1 ");
      if (item !== "") items.push(item);
    } else if (c.cmd === "choices" && Array.isArray(c.choices)) {
      for (const ch of c.choices) choices.push(toS(ch));
    }
    if (typeof c.ruby === "string") pbAddScriptTexts(items, c.ruby);
    const cond = c.cond as { ruby?: unknown } | undefined;
    if (cond && typeof cond.ruby === "string") pbAddScriptTexts(items, cond.ruby);
    for (const v of Object.values(c)) {
      if (Array.isArray(v)) addEventTexts(v, items, choices);
      else if (v && typeof v === "object" && Array.isArray((v as { list?: unknown }).list)) addEventTexts((v as { list: unknown }).list, items, choices);
    }
  }
}

/** items |= []; choices |= []; items.concat(choices) */
function uniqConcat(items: string[], choices: string[]): string[] {
  return [...new Set(items), ...new Set(choices)];
}

/**
 * pbSetTextMessages: gathers every translatable text into MessageTypes:
 * the scripts' _INTL/_ISPRINTF strings (ScriptTexts), and each map's and the
 * common events' texts. `scripts` are the script sources to scan (Ruby reads
 * $RGSS_SCRIPTS and PluginScripts.rxdata; the port's sources, by default).
 */
export async function pbSetTextMessages(scripts?: string[]): Promise<void> {
  const { Graphics } = await import("../rgss/Graphics");
  await Graphics.update();
  const texts: string[] = [];
  for (const scr of scripts ?? await portScriptSources()) pbAddRgssScriptTexts(texts, scr);
  // Must add messages because this code is used by both game system and Editor
  MessageTypes.addMessagesAsHash(MessageTypes.ScriptTexts, texts);
  const { Data, getMapData, hasMapData, preloadMaps } = await import("../data/store");
  let items: string[] = [];
  let choices: string[] = [];
  for (const event of Data.commonEvents.values()) addEventTexts((event as { list?: unknown }).list, items, choices);
  MessageTypes.setMapMessagesAsHash(0, uniqConcat(items, choices));
  for (const id of Data.mapInfos.keys()) {
    if (!hasMapData(id)) await preloadMaps(id, 0).catch(() => {}); // next if !pbRgssExists?(filename)
    if (!hasMapData(id)) continue;
    const map = getMapData(id);
    items = [];
    choices = [];
    for (const event of map.events) for (const page of event.pages) addEventTexts(page.list, items, choices);
    MessageTypes.setMapMessagesAsHash(id, uniqConcat(items, choices));
  }
  await Graphics.update();
}

/**
 * The data sections the Compiler fills while compiling the PBS files and the
 * map metadata (021_Compiler/002_Compiler_CompilePBS.rb: setMessagesAsHash for
 * names, descriptions, categories...; setMessages for map names), from the
 * game data the port loaded.
 */
export async function pbSetDataMessages(): Promise<void> {
  const { GameData } = await import("../data/gameData");
  const { Data } = await import("../data/store");
  const { mapMetadata } = await import("../game/metadata");
  const T = MessageTypes;
  const hash = (type: number, list: (string | null | undefined)[]) => T.setMessagesAsHash(type, list);
  const species = GameData.Species.each();
  hash(T.Species, species.map((s) => s.realName));
  hash(T.FormNames, species.map((s) => s.realFormName));
  hash(T.Kinds, species.map((s) => s.realCategory));
  hash(T.Entries, species.map((s) => s.realPokedexEntry));
  hash(T.Types, GameData.Type.each().map((t) => t.realName));
  hash(T.Abilities, GameData.Ability.each().map((a) => a.realName));
  hash(T.AbilityDescs, GameData.Ability.each().map((a) => a.realDescription));
  hash(T.Moves, GameData.Move.each().map((m) => m.realName));
  hash(T.MoveDescriptions, GameData.Move.each().map((m) => m.realDescription));
  hash(T.Items, GameData.Item.each().map((i) => i.realName));
  hash(T.ItemPlurals, GameData.Item.each().map((i) => i.realNamePlural));
  hash(T.ItemDescriptions, GameData.Item.each().map((i) => i.realDescription));
  hash(T.RibbonNames, GameData.Ribbon.each().map((r) => r.realName));
  hash(T.RibbonDescriptions, GameData.Ribbon.each().map((r) => r.realDescription));
  hash(T.TrainerTypes, GameData.TrainerType.each().map((t) => t.realName));
  hash(T.TrainerNames, GameData.Trainer.each().map((t) => t.realName));
  hash(T.TrainerLoseText, GameData.Trainer.each().map((t) => t.realLoseText));
  const mapNames: string[] = [];
  for (const id of Data.mapInfos.keys()) {
    const name = mapMetadata(id)?.name as string | undefined;
    if (name) mapNames[id] = name;
  }
  T.setMessages(T.MapNames, mapNames);
  const creator = (GameData.Metadata.get() as { realStorageCreator?: string | null } | undefined)?.realStorageCreator;
  if (creator) T.setMessages(T.StorageCreator, [creator]);
}

/**
 * Debug menu's Extract Text: compiles every text (pbSetDataMessages +
 * pbSetTextMessages, as Compile Data does) and returns MessageTypes.extract's
 * intl.txt.
 */
export async function pbExtractAllText(): Promise<string> {
  await pbSetDataMessages();
  await pbSetTextMessages();
  return messages.extract(messages);
}

/** The port's own sources (the RGSS scripts' equivalent), loaded only when Extract Text needs them. */
async function portScriptSources(): Promise<string[]> {
  // Dev server only (a build would carry every source file as a chunk).
  const modules = (import.meta.env.DEV ? import.meta.glob("/src/**/*.ts", { query: "?raw", import: "default" }) : {}) as Record<string, () => Promise<string>>;
  const ret: string[] = [];
  for (const [path, load] of Object.entries(modules)) if (!path.endsWith(".test.ts")) ret.push(await load());
  return ret;
}

//===============================================================================
// intl.txt
//===============================================================================

/** pbEachIntlSection(file): yields each [section] of an intl.txt and its name. */
export function* pbEachIntlSection(file: string): Generator<[string[], string]> {
  const re = /^\s*\[\s*([^\]]+)\s*\]\s*$/;
  let havesection = false;
  let sectionname: string | null = null;
  let lastsection: string[] = [];
  const lines = file.replace(/^﻿/, "").split(/(?<=\n)/);
  for (let lineno = 1; lineno <= lines.length; lineno++) {
    const line = lines[lineno - 1]!.replace(/\r?\n$/, "");
    if (/^#/.test(line) || /^\s*$/.test(line)) continue;
    const m = re.exec(line);
    if (m) {
      if (havesection) yield [lastsection, sectionname!];
      lastsection = [];
      sectionname = m[1]!;
      havesection = true;
    } else {
      if (sectionname == null) throw new Error(`Expected a section at the beginning of the file (line ${lineno})`);
      lastsection.push(line.replace(/\s+$/, ""));
    }
  }
  if (havesection) yield [lastsection, sectionname!];
}

/** pbGetText(infile): parses an intl.txt into the messages structure. */
export function pbGetText(infile: string): MessageData {
  const intldat: MessageData = [];
  for (const [section, name] of pbEachIntlSection(infile)) {
    if (section.length === 0) continue;
    const m = /^([Mm][Aa][Pp])?(\d+)$/.exec(name);
    if (!m) throw new Error(`Invalid section name ${name}`);
    const ismap = !!m[1];
    const id = Number(m[2]);
    let itemlength: number;
    let intlhash: Section;
    if (/^\d+$/.test(section[0]!)) {
      intlhash = [];
      itemlength = 3;
      if (ismap) throw new Error(`Section ${name} can't be an ordered list (section was recognized as an ordered list because its first line is a number)`);
      if (section.length % 3 !== 0) throw new Error(`Section ${name}'s line count is not divisible by 3 (section was recognized as an ordered list because its first line is a number)`);
    } else {
      intlhash = new Map();
      itemlength = 2;
      if (section.length % 2 === 1) throw new Error(`Section ${name} has an odd number of entries (section was recognized as a hash because its first line is not a number)`);
    }
    for (let i = 0; i < section.length;) {
      if (itemlength === 3) {
        if (!/^\d+$/.test(section[i]!)) throw new Error(`Expected a number in section ${name}, got ${section[i]} instead`);
        const key = Number(section[i]);
        i += 1;
        (intlhash as string[])[key] = Messages.denormalizeValue(section[i + 1]!);
      } else {
        orderedSet(intlhash as OrderedHash, Messages.denormalizeValue(section[i]!), Messages.denormalizeValue(section[i + 1]!));
      }
      i += 2;
    }
    if (ismap) {
      intldat[0] ??= [];
      (intldat[0] as (OrderedHash | undefined)[])[id] = intlhash as OrderedHash;
    } else {
      intldat[id] = intlhash;
    }
  }
  return intldat;
}

/** pbCompileText: intl.txt -> the messages file's contents (Ruby writes intl.dat). */
export function pbCompileText(intlTxt: string): string {
  return Messages.serialize(pbGetText(intlTxt));
}

/** OrderedHash#[]=: a nil/empty value removes the key. */
function orderedSet(hash: OrderedHash, key: string, value: string | null | undefined): void {
  if (!value) hash.delete(key);
  else hash.set(key, value);
}

//===============================================================================
// Messages
//===============================================================================
export class Messages {
  private messages: MessageData | null = null;
  private filename: string | null;
  private loading: Promise<void> | null = null;

  constructor(filename: string | null = null, delayLoad = false) {
    this.filename = filename;
    if (this.filename && !delayLoad) this.loading = this.loadMessageFile(this.filename).then(() => {});
  }

  /** Ruby loads the delayed file on first use; here it has to be awaited first (MessageTypes.ready). */
  async delayedLoad(): Promise<void> {
    if (this.loading) await this.loading;
    if (this.filename && !this.messages) {
      await this.loadMessageFile(this.filename);
      this.filename = null;
    }
  }

  static stringToKey(str: string): string;
  static stringToKey(str: string | null | undefined): string | null | undefined;
  static stringToKey(str: string | null | undefined): string | null | undefined {
    if (str && /[\r\n\t\x01]|^\s+|\s+$|\s{2,}/.test(str)) {
      return str.replace(/^\s+/, "").replace(/\s+$/, "").replace(/\s{2,}/g, " ");
    }
    return str;
  }

  static normalizeValue(value: string): string {
    if (/[\r\n\t\x01]|^[[\]]/.test(value)) {
      return value.replace(/\r/g, "<<r>>").replace(/\n/g, "<<n>>").replace(/\t/g, "<<t>>")
        .replace(/\[/g, "<<[>>").replace(/\]/g, "<<]>>").replace(/\x01/g, "<<1>>");
    }
    return value;
  }

  static denormalizeValue(value: string): string {
    if (/<<[rnt1[\]]>>/.test(value)) {
      return value.replace(/<<1>>/g, "\x01").replace(/<<r>>/g, "\r").replace(/<<n>>/g, "\n")
        .replace(/<<\[>>/g, "[").replace(/<<\]>>/g, "]").replace(/<<t>>/g, "\t");
    }
    return value;
  }

  /** Messages.writeObject(f, msgs, secname, origMessages): one intl.txt section. */
  static writeObject(f: string[], msgs: Section | undefined, secname: string | number, origMessages: Messages | null = null): void {
    if (!msgs) return;
    if (Array.isArray(msgs)) {
      f.push(`[${secname}]\r\n`);
      for (let j = 0; j < msgs.length; j++) {
        if (!msgs[j]) continue;
        const value = Messages.normalizeValue(msgs[j]!);
        const origValue = origMessages
          ? Messages.normalizeValue(origMessages.get(secname as number, j))
          : Messages.normalizeValue(MessageTypes.get(secname as number, j));
        f.push(`${j}\r\n`, origValue + "\r\n", value + "\r\n");
      }
    } else if (isHash(msgs)) {
      f.push(`[${secname}]\r\n`);
      for (const [key, v] of msgs) {
        if (!v) continue;
        // key is already serialized
        f.push(Messages.normalizeValue(key) + "\r\n", Messages.normalizeValue(v) + "\r\n");
      }
    }
  }

  getMessages(): MessageData {
    return this.messages ?? [];
  }

  /** extract(outfile): the intl.txt text for these messages (Ruby compares with Data/messages.dat). */
  extract(origMessages: Messages = MessageTypes.fallback()): string {
    const f: string[] = ["﻿", "# To localize this text for a particular language, please\r\n", "# translate every second line of this file.\r\n"];
    const orig = origMessages.getMessages();
    const maps = orig[0] as (OrderedHash | undefined)[] | undefined;
    if (maps) for (let i = 0; i < maps.length; i++) Messages.writeObject(f, maps[i], `Map${i}`, origMessages);
    for (let i = 1; i < orig.length; i++) Messages.writeObject(f, orig[i] as Section | undefined, i, origMessages);
    return f.join("");
  }

  setMessages(type: number, array: (string | null | undefined)[]): void {
    this.messages ??= [];
    const arr: string[] = [];
    for (let i = 0; i < array.length; i++) arr[i] = array[i] ? array[i]! : "";
    this.messages[type] = arr;
  }

  addMessages(type: number, array: (string | null | undefined)[]): void {
    this.messages ??= [];
    const arr = Array.isArray(this.messages[type]) ? (this.messages[type] as string[]) : [];
    for (let i = 0; i < array.length; i++) arr[i] = array[i] ? array[i]! : arr[i] ? arr[i]! : "";
    this.messages[type] = arr;
  }

  static createHash(_type: number, array: (string | null | undefined)[]): OrderedHash {
    const arr: OrderedHash = new Map();
    for (const s of array) if (s) orderedSet(arr, Messages.stringToKey(s), s);
    return arr;
  }

  static addToHash(_type: number, array: (string | null | undefined)[], hash: OrderedHash | undefined): OrderedHash {
    hash ??= new Map();
    for (const s of array) if (s) orderedSet(hash, Messages.stringToKey(s), s);
    return hash;
  }

  setMapMessagesAsHash(type: number, array: (string | null | undefined)[]): void {
    this.messages ??= [];
    this.messages[0] ??= [];
    (this.messages[0] as (OrderedHash | undefined)[])[type] = Messages.createHash(type, array);
  }

  addMapMessagesAsHash(type: number, array: (string | null | undefined)[]): void {
    this.messages ??= [];
    this.messages[0] ??= [];
    const maps = this.messages[0] as (OrderedHash | undefined)[];
    maps[type] = Messages.addToHash(type, array, maps[type]);
  }

  setMessagesAsHash(type: number, array: (string | null | undefined)[]): void {
    this.messages ??= [];
    this.messages[type] = Messages.createHash(type, array);
  }

  addMessagesAsHash(type: number, array: (string | null | undefined)[]): void {
    this.messages ??= [];
    const cur = this.messages[type];
    this.messages[type] = Messages.addToHash(type, array, isHash(cur) ? cur : undefined);
  }

  /** The JSON a messages file holds (Ruby: Marshal.dump(@messages)). */
  static serialize(messages: MessageData): string {
    const enc = (s: unknown): unknown => (isHash(s) ? { hash: [...s] } : Array.isArray(s) ? s.map(enc) : s ?? null);
    return JSON.stringify(messages.map((s, i) => (i === 0 && Array.isArray(s) ? s.map(enc) : enc(s))));
  }

  static deserialize(json: unknown): MessageData | null {
    if (!Array.isArray(json)) return null;
    const dec = (s: unknown): unknown => {
      if (s && typeof s === "object" && !Array.isArray(s) && Array.isArray((s as { hash?: unknown }).hash)) {
        return new Map((s as { hash: [string, string][] }).hash);
      }
      return s ?? undefined;
    };
    return json.map((s, i) => (i === 0 && Array.isArray(s) ? s.map(dec) : dec(s))) as MessageData;
  }

  /** saveMessages(filename): the file's contents (written by the caller, e.g. through DevFiles). */
  saveMessages(): string {
    return Messages.serialize(this.messages ?? []);
  }

  /** loadMessageFile(filename): fetches a messages file; null (and no messages) if it's missing or corrupt. */
  async loadMessageFile(filename: string): Promise<MessageData | null> {
    try {
      const res = await fetch(messagesUrl(filename));
      if (!res.ok) throw new Error(`${filename}: ${res.status}`);
      this.messages = Messages.deserialize(await res.json());
      if (!this.messages) throw new Error("Corrupted data");
      return this.messages;
    } catch {
      this.messages = null;
      return null;
    }
  }

  /** Uses already-parsed messages (a compiled intl.txt, or a file read some other way). */
  setAll(messages: MessageData | null): void {
    this.messages = messages;
    this.filename = null;
  }

  set(type: number, id: number, value: string): void {
    if (!this.messages) return;
    const s = this.messages[type];
    if (!Array.isArray(s)) return;
    (s as string[])[id] = value;
  }

  getCount(type: number): number {
    if (!this.messages) return 0;
    const s = this.messages[type];
    if (!s) return 0;
    return isHash(s) ? s.size : s.length;
  }

  get(type: number, id: number): string {
    if (!this.messages) return "";
    const s = this.messages[type];
    if (!s) return "";
    const v = isHash(s) ? s.get(String(id)) : (s as string[])[id];
    return typeof v === "string" && v ? v : "";
  }

  getFromHash(type: number, key: string): string {
    if (!this.messages || !this.messages[type] || !key) return key;
    const s = this.messages[type];
    if (!isHash(s)) return key;
    const v = s.get(Messages.stringToKey(key));
    return v ? v : key;
  }

  getFromMapHash(type: number, key: string): string {
    if (!this.messages) return key;
    const maps = this.messages[0] as (OrderedHash | undefined)[] | undefined;
    if (!maps) return key;
    if (!maps[type] && !maps[0]) return key;
    const id = Messages.stringToKey(key);
    const own = maps[type]?.get(id);
    if (own) return own;
    const common = maps[0]?.get(id);
    if (common) return common;
    return key;
  }
}

/** "Data/english.dat" -> the JSON the dev server / static build serves from web/data. */
function messagesUrl(filename: string): string {
  return "/data/" + filename.replace(/^Data\//i, "").replace(/\.dat$/i, ".json");
}

//===============================================================================
// MessageTypes
//===============================================================================
let messages = new Messages();
let messagesFallback = new Messages("Data/messages.dat", true);

export const MessageTypes = {
  // Value 0 is used for common event and map event text
  Species: 1,
  Kinds: 2,
  Entries: 3,
  FormNames: 4,
  Moves: 5,
  MoveDescriptions: 6,
  Items: 7,
  ItemPlurals: 8,
  ItemDescriptions: 9,
  Abilities: 10,
  AbilityDescs: 11,
  Types: 12,
  TrainerTypes: 13,
  TrainerNames: 14,
  BeginSpeech: 15,
  EndSpeechWin: 16,
  EndSpeechLose: 17,
  RegionNames: 18,
  PlaceNames: 19,
  PlaceDescriptions: 20,
  MapNames: 21,
  PhoneMessages: 22,
  TrainerLoseText: 23,
  ScriptTexts: 24,
  RibbonNames: 25,
  RibbonDescriptions: 26,
  StorageCreator: 27,
  // Plugins' sections (ZUD Mechanics [000] General/Messages, Essentials Deluxe).
  GMaxNames: 28,
  GMaxEntries: 29,
  ItemPortionNames: 30,
  ItemPortionNamePlurals: 31,
  ItemHeldDescriptions: 32,

  stringToKey: (str: string) => Messages.stringToKey(str),
  normalizeValue: (value: string) => Messages.normalizeValue(value),
  denormalizeValue: (value: string) => Messages.denormalizeValue(value),
  /**
   * MessageTypes.extract(outfile): the intl.txt text. Ruby reads the texts
   * back from the saved Data/messages.dat; the port has them in memory.
   */
  extract: () => messages.extract(messages),
  setMessages: (type: number, array: (string | null | undefined)[]) => messages.setMessages(type, array),
  addMessages: (type: number, array: (string | null | undefined)[]) => messages.addMessages(type, array),
  createHash: (type: number, array: (string | null | undefined)[]) => Messages.createHash(type, array),
  addMapMessagesAsHash: (type: number, array: (string | null | undefined)[]) => messages.addMapMessagesAsHash(type, array),
  setMapMessagesAsHash: (type: number, array: (string | null | undefined)[]) => messages.setMapMessagesAsHash(type, array),
  addMessagesAsHash: (type: number, array: (string | null | undefined)[]) => messages.addMessagesAsHash(type, array),
  setMessagesAsHash: (type: number, array: (string | null | undefined)[]) => messages.setMessagesAsHash(type, array),
  /** MessageTypes.saveMessages(filename): the messages file's contents. */
  saveMessages: () => messages.saveMessages(),
  loadMessageFile: (filename: string) => messages.loadMessageFile(filename),

  get(type: number, id: number): string {
    let ret = messages.get(type, id);
    if (ret === "") ret = messagesFallback.get(type, id);
    return ret;
  },

  getCount(type: number): number {
    const c1 = messages.getCount(type);
    const c2 = messagesFallback.getCount(type);
    return c1 > c2 ? c1 : c2;
  },

  getOriginal: (type: number, id: number) => messagesFallback.get(type, id),
  getFromHash: (type: number, key: string) => messages.getFromHash(type, key),
  getFromMapHash: (type: number, key: string) => messages.getFromMapHash(type, key),

  /** The fallback set (@@messagesFallback, Data/messages.dat): loads it if it hasn't been yet. */
  fallback(): Messages {
    return messagesFallback;
  },
  /** Awaits the fallback file's delayed load (Ruby loads it on its first lookup). */
  ready: () => messagesFallback.delayedLoad(),
  /** Uses parsed messages as the current language (e.g. a compiled intl.txt). */
  setAll: (data: MessageData | null) => messages.setAll(data),
  /** Back to no translations (tests, switching to the original language). */
  reset(): void {
    messages = new Messages();
    messagesFallback = new Messages("Data/messages.dat", true);
  },
};

export async function pbLoadMessages(file: string): Promise<MessageData | null> {
  return MessageTypes.loadMessageFile(file);
}

export function pbGetMessageCount(type: number): number {
  return MessageTypes.getCount(type);
}

export function pbGetMessage(type: number, id: number): string {
  return MessageTypes.get(type, id);
}

export function pbGetMessageFromHash(type: number, id: string): string {
  return MessageTypes.getFromHash(type, id);
}

/** Fills in {1}, {2}... (gsub!(/\{i\}/, arg[i].to_s) for each argument). */
function fill(string: string, args: readonly unknown[]): string {
  return string.replace(/\{(\d+)\}/g, (m, n: string) => (Number(n) >= 1 && Number(n) <= args.length ? toS(args[Number(n) - 1]) : m));
}

/** Fills in {1:fmt}, {2:fmt}... with sprintf("%fmt", arg). */
function fillPrintf(string: string, args: readonly unknown[]): string {
  return string.replace(/\{(\d+):([^}]+?)\}/g, (m, n: string, fmt: string) =>
    (Number(n) >= 1 && Number(n) <= args.length ? sprintf("%" + fmt, args[Number(n) - 1]) : m));
}

/**
 * Replaces first argument with a localized version and formats the other
 * parameters by replacing {1}, {2}, etc. with those placeholders.
 */
export function _INTL(str: string, ...args: unknown[]): string {
  let string: string;
  try {
    string = MessageTypes.getFromHash(MessageTypes.ScriptTexts, str);
  } catch {
    string = str;
  }
  return fill(string, args);
}

/**
 * Replaces first argument with a localized version and formats the other
 * parameters by replacing {1}, {2}, etc. with those placeholders.
 * This version acts more like sprintf, supports e.g. {1:d} or {2:s}
 */
export function _ISPRINTF(str: string, ...args: unknown[]): string {
  let string: string;
  try {
    string = MessageTypes.getFromHash(MessageTypes.ScriptTexts, str);
  } catch {
    string = str;
  }
  return fillPrintf(string, args);
}

/** _I(str, *arg): _MAPINTL for the current map. */
export function _I(mapId: number, str: string, ...args: unknown[]): string {
  return _MAPINTL(mapId, str, ...args);
}

export function _MAPINTL(mapId: number, str: string, ...args: unknown[]): string {
  return fill(MessageTypes.getFromMapHash(mapId, str), args);
}

export function _MAPISPRINTF(mapId: number, str: string, ...args: unknown[]): string {
  return fillPrintf(MessageTypes.getFromMapHash(mapId, str), args);
}

/** pbChooseLanguage (019_Utilities/001_Utilities.rb): the language menu. */
export async function pbChooseLanguage(languages: readonly (readonly [string, string])[]): Promise<number> {
  const { pbShowCommands } = await import("../ui/messages");
  return pbShowCommands(null, languages.map((l) => l[0]));
}

/**
 * Kernel#sprintf for the conversions Essentials' texts use: %[flags][width]
 * [.precision] with d i u f e E g G x X o b B s c p and %%.
 */
export function sprintf(format: string, ...args: unknown[]): string {
  let n = 0;
  return format.replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+))?([diufeEgGxXobBscp%])/g, (_m, flags: string, w: string | undefined, prec: string | undefined, conv: string) => {
    if (conv === "%") return "%";
    const width = w === "*" ? Number(args[n++]) : w ? Number(w) : 0;
    const arg = args[n++];
    const p = prec != null ? Number(prec) : null;
    let body: string;
    let sign = "";
    const num = (v: unknown) => (typeof v === "number" ? v : Number(v));
    switch (conv) {
      case "d": case "i": case "u": {
        const v = Math.trunc(num(arg));
        sign = v < 0 ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "";
        body = String(Math.abs(v));
        if (p != null) body = body.padStart(p, "0");
        break;
      }
      case "f": case "e": case "E": case "g": case "G": {
        const v = num(arg);
        sign = v < 0 ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "";
        const a = Math.abs(v);
        const digits = p ?? 6;
        if (conv === "f") body = a.toFixed(digits);
        else if (conv === "e" || conv === "E") body = a.toExponential(digits).replace(/e([+-])(\d)$/, "e$10$2");
        else body = String(Number(a.toPrecision(digits || 1)));
        if (conv === "E" || conv === "G") body = body.toUpperCase();
        break;
      }
      case "x": case "X": case "o": case "b": case "B": {
        const v = Math.trunc(num(arg));
        sign = v < 0 ? "-" : flags.includes("+") ? "+" : "";
        body = Math.abs(v).toString(conv === "o" ? 8 : conv === "b" || conv === "B" ? 2 : 16);
        if (conv === "X") body = body.toUpperCase();
        if (p != null) body = body.padStart(p, "0");
        if (flags.includes("#") && v !== 0) body = (conv === "o" ? "0" : conv === "X" ? "0X" : conv === "x" ? "0x" : conv === "B" ? "0B" : "0b") + body;
        break;
      }
      case "c":
        body = typeof arg === "number" ? String.fromCharCode(arg) : toS(arg).charAt(0);
        break;
      case "p":
        body = JSON.stringify(arg);
        break;
      default:
        body = toS(arg);
        if (p != null) body = body.slice(0, p);
    }
    const len = sign.length + body.length;
    if (len >= width) return sign + body;
    if (flags.includes("-")) return sign + body + " ".repeat(width - len);
    if (flags.includes("0") && !"sc".includes(conv) && !(p != null && "diuxXob".includes(conv))) return sign + "0".repeat(width - len) + body;
    return " ".repeat(width - len) + sign + body;
  });
}
