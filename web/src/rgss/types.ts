// RGSS value types (Color, Tone, Rect) with the same semantics as RPG Maker
// XP: components are clamped and mutable in place.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Color {
  constructor(
    private _r = 0,
    private _g = 0,
    private _b = 0,
    private _a = 255,
  ) {
    this.set(_r, _g, _b, _a);
  }
  get red() { return this._r; }
  set red(v) { this._r = clamp(v, 0, 255); }
  get green() { return this._g; }
  set green(v) { this._g = clamp(v, 0, 255); }
  get blue() { return this._b; }
  set blue(v) { this._b = clamp(v, 0, 255); }
  get alpha() { return this._a; }
  set alpha(v) { this._a = clamp(v, 0, 255); }
  set(r: number | Color, g = 0, b = 0, a = 255): this {
    if (r instanceof Color) return this.set(r.red, r.green, r.blue, r.alpha);
    this.red = r; this.green = g; this.blue = b; this.alpha = a;
    return this;
  }
  clone(): Color { return new Color(this._r, this._g, this._b, this._a); }
  equals(o: Color): boolean { return o._r === this._r && o._g === this._g && o._b === this._b && o._a === this._a; }
  toCss(): string { return `rgba(${this._r},${this._g},${this._b},${this._a / 255})`; }
  static fromArray(v: readonly number[]): Color { return new Color(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 255); }
}

export class Tone {
  constructor(
    private _r = 0,
    private _g = 0,
    private _b = 0,
    private _gray = 0,
  ) {
    this.set(_r, _g, _b, _gray);
  }
  get red() { return this._r; }
  set red(v) { this._r = clamp(v, -255, 255); }
  get green() { return this._g; }
  set green(v) { this._g = clamp(v, -255, 255); }
  get blue() { return this._b; }
  set blue(v) { this._b = clamp(v, -255, 255); }
  get gray() { return this._gray; }
  set gray(v) { this._gray = clamp(v, 0, 255); }
  set(r: number | Tone, g = 0, b = 0, gray = 0): this {
    if (r instanceof Tone) return this.set(r.red, r.green, r.blue, r.gray);
    this.red = r; this.green = g; this.blue = b; this.gray = gray;
    return this;
  }
  clone(): Tone { return new Tone(this._r, this._g, this._b, this._gray); }
  equals(o: Tone): boolean { return o._r === this._r && o._g === this._g && o._b === this._b && o._gray === this._gray; }
  isZero(): boolean { return !this._r && !this._g && !this._b && !this._gray; }
  static fromArray(v: readonly number[]): Tone { return new Tone(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0); }
}

export class Rect {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}
  set(x: number | Rect, y = 0, width = 0, height = 0): this {
    if (x instanceof Rect) return this.set(x.x, x.y, x.width, x.height);
    this.x = x; this.y = y; this.width = width; this.height = height;
    return this;
  }
  clone(): Rect { return new Rect(this.x, this.y, this.width, this.height); }
  equals(o: Rect): boolean { return o.x === this.x && o.y === this.y && o.width === this.width && o.height === this.height; }
  empty(): this { return this.set(0, 0, 0, 0); }
}
