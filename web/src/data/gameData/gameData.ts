// Port of 010_Data/001_GameData.rb: the class methods every GameData class
// gets (register / get / try_get / exists? / keys / each / count) and the
// instance == check.
//
// Ruby mixes ClassMethods* into each class with `extend`; here each GameData
// class extends one of the base classes below and declares its own
// `static DATA` map (Ruby's per-class DATA constant). Statics use a typed
// `this`, so `GameData.Species.get("PIKACHU")` returns a Species.
//
// Symbols are plain strings. Ruby's `other.is_a?(self)` (passing a record
// instead of its ID) is supported the same way.

export type Id = string;

/** Constructor + DATA of a GameData class, as seen by the shared statics. */
export interface DataClass<T, K = Id> {
  new (hash: never): T;
  DATA: Map<K, T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor<T> = new (hash: any) => T;

/** _INTL (001_Technical/003_Intl_Messages.rb): the translated text, with {1}, {2}... filled in. */
export { _INTL } from "../../core/intl";

function resolve<T, K>(cls: DataClass<T, K>, other: unknown): unknown {
  return other instanceof (cls as unknown as abstract new (...a: never[]) => T) ? (other as { id: unknown }).id : other;
}

/** GameData::ClassMethodsSymbols: data known only by a symbol ID, iterated in definition order. */
export abstract class SymbolData {
  abstract readonly id: Id;

  static register<C extends Ctor<{ id: Id }>>(this: C & { DATA: Map<Id, InstanceType<C>> }, hash: ConstructorParameters<C>[0]): InstanceType<C> {
    const obj = new this(hash) as InstanceType<C>;
    this.DATA.set(obj.id, obj);
    return obj;
  }

  /** exists?(other) */
  static exists<T>(this: DataClass<T>, other: unknown): boolean {
    if (other == null) return false;
    return this.DATA.has(resolve(this, other) as Id);
  }

  static get<T>(this: DataClass<T>, other: Id | T): T {
    if (other instanceof (this as unknown as abstract new (...a: never[]) => T)) return other as T;
    const ret = this.DATA.get(other as Id);
    if (ret === undefined) throw new Error(`Unknown ID ${String(other)}.`);
    return ret;
  }

  /** try_get(other) */
  static tryGet<T>(this: DataClass<T>, other: Id | T | null | undefined): T | null {
    if (other == null) return null;
    if (other instanceof (this as unknown as abstract new (...a: never[]) => T)) return other as T;
    return this.DATA.get(other as Id) ?? null;
  }

  static keys<T>(this: DataClass<T>): Id[] {
    return [...this.DATA.keys()];
  }

  /** each: in the order the data was defined. */
  static each<T>(this: DataClass<T>): T[] {
    return [...this.DATA.values()];
  }

  /** each_alphabetically */
  static eachAlphabetically<T extends { realName: string }>(this: DataClass<T>): T[] {
    return [...this.DATA.values()].sort((a, b) => (a.realName < b.realName ? -1 : a.realName > b.realName ? 1 : 0));
  }

  static count<T>(this: DataClass<T>): number {
    return this.DATA.size;
  }

  /** InstanceMethods#== : compares by ID (a symbol, string or another record). */
  equals(other: unknown): boolean {
    if (other == null) return false;
    if (typeof other === "string") return this.id === other;
    if (other instanceof (this.constructor as abstract new (...a: never[]) => unknown)) return this.id === (other as SymbolData).id;
    return false;
  }
}

/** GameData::ClassMethods: data known by a symbol and an ID number (Weather). */
export abstract class SymbolAndNumberData {
  abstract readonly id: Id;
  abstract readonly idNumber: number;

  static register<C extends Ctor<{ id: Id; idNumber: number }>>(this: C & { DATA: Map<Id | number, InstanceType<C>> }, hash: ConstructorParameters<C>[0]): InstanceType<C> {
    const obj = new this(hash) as InstanceType<C>;
    this.DATA.set(obj.id, obj);
    this.DATA.set(obj.idNumber, obj);
    return obj;
  }

  static exists<T>(this: DataClass<T, Id | number>, other: unknown): boolean {
    if (other == null) return false;
    return this.DATA.has(resolve(this, other) as Id);
  }

  static get<T>(this: DataClass<T, Id | number>, other: Id | number | T): T {
    if (other instanceof (this as unknown as abstract new (...a: never[]) => T)) return other as T;
    const ret = this.DATA.get(other as Id);
    if (ret === undefined) throw new Error(`Unknown ID ${String(other)}.`);
    return ret;
  }

  static tryGet<T>(this: DataClass<T, Id | number>, other: Id | number | T | null | undefined): T | null {
    if (other == null) return null;
    if (other instanceof (this as unknown as abstract new (...a: never[]) => T)) return other as T;
    return this.DATA.get(other as Id) ?? null;
  }

  /** Both the symbol and the number keys, as in Ruby. */
  static keys<T>(this: DataClass<T, Id | number>): (Id | number)[] {
    return [...this.DATA.keys()];
  }

  /** each: in order of id_number, once per record. */
  static each<T extends { idNumber: number }>(this: DataClass<T, Id | number>): T[] {
    const ret: T[] = [];
    for (const [k, v] of this.DATA) if (typeof k !== "number") ret.push(v);
    return ret.sort((a, b) => a.idNumber - b.idNumber);
  }

  static count<T>(this: DataClass<T, Id | number>): number {
    return this.DATA.size / 2;
  }

  equals(other: unknown): boolean {
    if (other == null) return false;
    if (typeof other === "string") return this.id === other;
    if (typeof other === "number") return this.idNumber === other;
    if (other instanceof (this.constructor as abstract new (...a: never[]) => unknown)) return this.id === (other as SymbolAndNumberData).id;
    return false;
  }
}

/** GameData::ClassMethodsIDNumbers: data known only by an ID number (metadata). */
export abstract class NumberData {
  abstract readonly id: number;

  static register<C extends Ctor<{ id: number }>>(this: C & { DATA: Map<number, InstanceType<C>> }, hash: ConstructorParameters<C>[0]): InstanceType<C> {
    const obj = new this(hash) as InstanceType<C>;
    this.DATA.set(obj.id, obj);
    return obj;
  }

  static exists<T>(this: DataClass<T, number>, other: unknown): boolean {
    if (other == null) return false;
    return this.DATA.has(resolve(this, other) as number);
  }

  static tryGet<T>(this: DataClass<T, number>, other: number | T | null | undefined): T | null {
    if (other == null) return null;
    if (other instanceof (this as unknown as abstract new (...a: never[]) => T)) return other as T;
    return this.DATA.get(other as number) ?? null;
  }

  static keys<T>(this: DataClass<T, number>): number[] {
    return [...this.DATA.keys()];
  }

  /** each: in numerical order. */
  static each<T>(this: DataClass<T, number>): T[] {
    return [...this.DATA.keys()].sort((a, b) => a - b).map((k) => this.DATA.get(k)!);
  }

  static count<T>(this: DataClass<T, number>): number {
    return this.DATA.size;
  }

  equals(other: unknown): boolean {
    if (other == null) return false;
    if (typeof other === "number") return this.id === other;
    if (other instanceof (this.constructor as abstract new (...a: never[]) => unknown)) return this.id === (other as NumberData).id;
    return false;
  }
}

/** has_flag?: case-insensitive flag check shared by most PBS classes. */
export function hasFlag(flags: readonly string[], flag: string): boolean {
  const f = flag.toLowerCase();
  return flags.some((x) => x.toLowerCase() === f);
}
