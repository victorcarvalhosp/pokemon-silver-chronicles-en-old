// Port of 005_Sprites/010_ParticleEngine.rb (Peter O.'s Particle Engine, based
// on Near Fantastica's and PinkMan's): an event whose page has the comment
// "Particle Engine Type" followed by a line (or comment) naming an effect
// ("fire", "smoke", "aura", "soot", ...) emits particles from Graphics/Fogs.
// Every Spriteset_Map gets a Particle_Engine (game/weather/Overlays.ts).
//
// Particle positions are whole pixels: ParticleSprite copies them onto an RGSS
// Sprite, which stores integers.

import { rand } from "../core/random";
import type { Bitmap } from "../rgss/Bitmap";
import { Sprite, type Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { GameEvent } from "../game/GameEvent";
import type { GameMap } from "../game/GameMap";
import { pbEventCommentInput } from "../ui/messages";
import { preloadBitmaps, RPGCache } from "../ui/rpgCache";
import { ScreenPosHelper } from "./ScreenPosHelper";

/** The Graphics/Fogs files the effects use (read synchronously, so preloaded). */
const PARTICLE_GRAPHICS = ["particle", "smoke", "wideportal", "explosion", "explosionsmoke", "star"];

export function preloadParticleGraphics(): Promise<void> {
  return preloadBitmaps(PARTICLE_GRAPHICS.map((f) => "Graphics/Fogs/" + f));
}

type EffectClass = new (event: GameEvent, viewport: Viewport | null) => ParticleEffect_Event;

export class ParticleEngine {
  private map: GameMap | null;
  private viewport: Viewport | null;
  private effect: (ParticleEffect_Event | null | undefined)[] = [];
  private disposed = false;
  private firsttime = true;
  private effects: Record<string, EffectClass>;

  constructor(viewport: Viewport | null = null, map: GameMap | null = null) {
    this.map = map;
    this.viewport = viewport;
    this.effects = {
      // PinkMan's Effects
      fire: Fire,
      smoke: Smoke,
      teleport: Teleport,
      spirit: Spirit,
      explosion: Explosion,
      aura: Aura,
      // BlueScope's Effects
      soot: Soot,
      sootsmoke: SootSmoke,
      rocket: Rocket,
      fixteleport: FixedTeleport,
      smokescreen: Smokescreen,
      flare: Flare,
      splash: Splash,
      // By Peter O.
      starteleport: StarTeleport,
    };
  }

  dispose(): void {
    if (this.isDisposed()) return;
    for (const particle of this.effect) particle?.dispose();
    this.effect = [];
    this.map = null;
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  addEffect(event: GameEvent): void {
    this.effect[event.id] = this.pbParticleEffect(event);
  }

  removeEffect(event: GameEvent): void {
    if (this.effect[event.id] == null) return;
    this.effect[event.id]!.dispose();
    // NOTE (Ruby parity): Array#delete_at shifts every later effect down one
    // slot (010_ParticleEngine.rb:54), so they no longer sit at their event's
    // id. Only the first update removes effects, when there are none yet.
    this.effect.splice(event.id, 1);
  }

  reallocEffect(event: GameEvent, particle: ParticleEffect_Event | null): ParticleEffect_Event | null {
    const type = pbEventCommentInput(event, 1, "Particle Engine Type");
    if (type == null) {
      particle?.dispose();
      return null;
    }
    const name = rubyDowncase(type[0]);
    const cls = this.effects[name];
    if (cls == null) {
      particle?.dispose();
      return null;
    }
    if (!particle || !(particle instanceof cls)) {
      (particle as ParticleEffect_Event | null)?.dispose();
      particle = new cls(event, this.viewport);
    }
    return particle;
  }

  pbParticleEffect(event: GameEvent): ParticleEffect_Event | null {
    return this.reallocEffect(event, null);
  }

  update(): void {
    if (this.firsttime) {
      this.firsttime = false;
      for (const event of this.map!.events.values()) {
        this.removeEffect(event);
        this.addEffect(event);
      }
    }
    this.effect.forEach((p, i) => {
      let particle = p;
      // NOTE (Ruby parity): an event without an effect when the map loaded is
      // skipped for good, even after its page changes to one with the comment
      // (010_ParticleEngine.rb:88-89).
      if (particle == null) return;
      if ((particle.event as GameEvent & { peRefresh?: boolean }).peRefresh) {
        const event = particle.event as GameEvent & { peRefresh?: boolean };
        event.peRefresh = false;
        particle = this.reallocEffect(event, particle);
        this.effect[i] = particle;
      }
      particle?.update();
    });
  }
}

/** type[0].downcase: Ruby raises for a non-String (the command after the comment isn't one). */
function rubyDowncase(v: unknown): string {
  if (typeof v !== "string") throw new TypeError(`undefined method \`downcase' for ${v === undefined || v === null ? "nil:NilClass" : typeof v}`);
  return v.toLowerCase();
}

export class ParticleEffect {
  private _x = 0;
  private _y = 0;
  private _z = 0;
  get x(): number { return this._x; }
  set x(v: number) { this._x = v; }
  get y(): number { return this._y; }
  set y(v: number) { this._y = v; }
  get z(): number { return this._z; }
  set z(v: number) { this._z = v; }
  update(): void {}
  dispose(): void {}
}

export class ParticleSprite {
  x = 0;
  y = 0;
  z = 0;
  ox = 0;
  oy = 0;
  opacity = 255;
  blendType = 0;
  private _bitmap: Bitmap | null = null;
  private sprite: Sprite | null = null;
  private minleft = 0;
  private mintop = 0;

  constructor(private viewport: Viewport | null) {}

  dispose(): void {
    this.sprite?.dispose();
  }

  get bitmap(): Bitmap | null { return this._bitmap; }
  set bitmap(value: Bitmap | null) {
    this._bitmap = value;
    if (value) {
      this.minleft = -value.width;
      this.mintop = -value.height;
    } else {
      this.minleft = 0;
      this.mintop = 0;
    }
  }

  update(): void {
    const w = Graphics.width;
    const h = Graphics.height;
    if (!this.sprite && this.x >= this.minleft && this.y >= this.mintop && this.x < w && this.y < h) {
      this.sprite = new Sprite(this.viewport);
    } else if (this.sprite && (this.x < this.minleft || this.y < this.mintop || this.x >= w || this.y >= h)) {
      this.sprite.dispose();
      this.sprite = null;
    }
    if (this.sprite) {
      const s = this.sprite;
      if (s.x !== this.x) s.x = Math.trunc(this.x);
      s.x = Math.trunc(s.x - this.ox);
      if (s.y !== this.y) s.y = Math.trunc(this.y);
      s.y = Math.trunc(s.y - this.oy);
      if (s.z !== this.z) s.z = Math.trunc(this.z);
      const o = Math.max(0, Math.min(255, Math.trunc(this.opacity)));
      if (s.opacity !== this.opacity) s.opacity = o;
      if (s.blendType !== this.blendType) s.blendType = this.blendType;
      if (s.bitmap !== this._bitmap) s.setBitmap(this._bitmap);
    }
  }
}

/** Hue-shifted copies per [filename, hue] (Ruby: AnimatedBitmap.new(path, hue).deanimate). */
function hueBitmap(filename: string, hue: number): Bitmap | null {
  const base = RPGCache.loadBitmap("Graphics/Fogs/", filename);
  if (!base) throw new Error(`Failed to load image 'Graphics/Fogs/${filename}'`);
  // mkxp's Bitmap#hue_change takes whole degrees.
  const degrees = Math.trunc(hue);
  if (degrees === 0) return base;
  const bmp = base.clone();
  bmp.hueChange(degrees);
  return bmp;
}

export class ParticleEffect_Event extends ParticleEffect {
  event: GameEvent;
  protected viewport: Viewport | null;
  protected particles: ParticleSprite[] = [];
  protected particlex: number[] = [];
  protected particley: number[] = [];
  protected opacity: number[] = [];
  protected bitmaps = new Map<string, Bitmap | null>();
  protected randomhue = 0;
  protected leftright = 0;
  protected fade = 0;
  protected maxparticless = 0;
  protected hue = 0;
  protected slowdown = 1;
  protected ytop = 0;
  protected ybottom = 0;
  protected xleft = 0;
  protected xright = 0;
  protected xgravity = 0;
  protected ygravity = 0;
  protected xoffset = 0;
  protected yoffset = 0;
  protected opacityvar = 0;
  protected originalopacity = 0;
  protected startingx = 0;
  protected startingy = 0;
  protected screenX = 0;
  protected screenY = 0;
  protected realX = 0;
  protected realY = 0;
  protected filename: string | null = null;
  protected zoffset = 0;
  protected bmwidth = 32;
  protected bmheight = 32;
  protected offsetx = 0;
  protected offsety = 0;

  constructor(event: GameEvent, viewport: Viewport | null = null) {
    super();
    this.event = event;
    this.viewport = viewport;
  }

  setParameters(params: number[]): void {
    [this.randomhue, this.leftright, this.fade,
      this.maxparticless, this.hue, this.slowdown,
      this.ytop, this.ybottom, this.xleft, this.xright,
      this.xgravity, this.ygravity, this.xoffset, this.yoffset,
      this.opacityvar, this.originalopacity] = params as [number, number, number, number, number, number, number, number,
      number, number, number, number, number, number, number, number];
  }

  loadBitmap(filename: string, hue: number): Bitmap | null {
    const key = `${filename}#${Math.trunc(hue)}`;
    let bitmap = this.bitmaps.get(key);
    if (!bitmap || bitmap.isDisposed()) {
      bitmap = hueBitmap(filename, hue);
      this.bitmaps.set(key, bitmap);
    }
    return bitmap;
  }

  initParticles(filename: string | null, opacity: number, zOffset = 0, blendtype = 1): void {
    this.particles = [];
    this.particlex = [];
    this.particley = [];
    this.opacity = [];
    this.startingx = this.x + this.xoffset;
    this.startingy = this.y + this.yoffset;
    this.screenX = this.x;
    this.screenY = this.y;
    this.realX = this.event.realX;
    this.realY = this.event.realY;
    this.filename = filename;
    this.zoffset = zOffset;
    this.bmwidth = 32;
    this.bmheight = 32;
    for (let i = 0; i < this.maxparticless; i++) {
      this.particlex[i] = -this.xoffset;
      this.particley[i] = -this.yoffset;
      this.particles[i] = new ParticleSprite(this.viewport);
      if (filename) this.particles[i]!.bitmap = this.loadBitmap(filename, this.hue);
      if (i === 0 && this.particles[i]!.bitmap) {
        this.bmwidth = this.particles[i]!.bitmap!.width;
        this.bmheight = this.particles[i]!.bitmap!.height;
      }
      this.particles[i]!.blendType = blendtype;
      this.particles[i]!.y = this.startingy;
      this.particles[i]!.x = this.startingx;
      this.particles[i]!.z = this.z + zOffset;
      this.opacity[i] = rand(Math.floor(opacity / 4));
      this.particles[i]!.opacity = this.opacity[i]!;
      this.particles[i]!.update();
    }
  }

  override get x(): number { return ScreenPosHelper.pbScreenX(this.event); }
  override set x(_v: number) {}
  override get y(): number { return ScreenPosHelper.pbScreenY(this.event); }
  override set y(_v: number) {}
  override get z(): number { return ScreenPosHelper.pbScreenZ(this.event); }
  override set z(_v: number) {}

  override update(): void {
    if (this.viewport && (this.viewport.rect.x >= Graphics.width || this.viewport.rect.y >= Graphics.height)) return;
    const selfX = this.x;
    const selfY = this.y;
    const selfZ = this.z;
    const newRealX = this.event.realX;
    const newRealY = this.event.realY;
    this.startingx = selfX + this.xoffset;
    this.startingy = selfY + this.yoffset;
    this.offsetx = this.realX === newRealX ? 0 : selfX - this.screenX;
    this.offsety = this.realY === newRealY ? 0 : selfY - this.screenY;
    this.screenX = selfX;
    this.screenY = selfY;
    this.realX = newRealX;
    this.realY = newRealY;
    if (this.opacityvar > 0 && this.viewport) {
      const opac = 255.0 / this.opacityvar;
      let minX = opac * Math.floor(-this.xgravity / this.slowdown) + this.startingx;
      let maxX = opac * Math.floor(this.xgravity / this.slowdown) + this.startingx;
      let minY = opac * Math.floor(-this.ygravity / this.slowdown) + this.startingy;
      let maxY = this.startingy;
      minX -= this.bmwidth;
      minY -= this.bmheight;
      maxX += this.bmwidth;
      maxY += this.bmheight;
      if (maxX < 0 || maxY < 0 || minX >= Graphics.width || minY >= Graphics.height) return;
    }
    const particleZ = selfZ + this.zoffset;
    for (let i = 0; i < this.maxparticless; i++) {
      const p = this.particles[i]!;
      p.z = particleZ;
      if (p.y <= this.ytop) this.resetParticle(i);
      if (p.x <= this.xleft) this.resetParticle(i);
      if (p.y >= this.ybottom) this.resetParticle(i);
      if (p.x >= this.xright) this.resetParticle(i);
      if (this.fade === 0) {
        if (this.opacity[i]! <= 0) {
          this.opacity[i] = this.originalopacity;
          this.resetParticle(i);
        }
      } else if (this.opacity[i]! <= 0) {
        this.opacity[i] = 250;
        this.resetParticle(i);
      }
      this.calcParticlePos(i);
      if (this.randomhue === 1) {
        this.hue += 0.5;
        if (this.hue >= 360) this.hue = 0;
        if (this.filename) p.bitmap = this.loadBitmap(this.filename, this.hue);
      }
      this.opacity[i] = this.opacity[i]! - rand(this.opacityvar);
      p.opacity = this.opacity[i]!;
      p.update();
    }
  }

  /** The four "move back to the start" blocks of update. */
  private resetParticle(i: number): void {
    this.particles[i]!.y = this.startingy + this.yoffset;
    this.particles[i]!.x = this.startingx + this.xoffset;
    this.particlex[i] = 0.0;
    this.particley[i] = 0.0;
  }

  calcParticlePos(i: number): void {
    this.leftright = rand(2);
    let xo: number;
    if (this.leftright === 1) {
      xo = -this.xgravity / this.slowdown;
    } else {
      xo = this.xgravity / this.slowdown;
    }
    const yo = -this.ygravity / this.slowdown;
    this.particlex[i]! += xo;
    this.particley[i]! += yo;
    this.particlex[i]! -= this.offsetx;
    this.particley[i]! -= this.offsety;
    this.particlex[i] = Math.floor(this.particlex[i]!);
    this.particley[i] = Math.floor(this.particley[i]!);
    this.particles[i]!.x = this.particlex[i]! + this.startingx + this.xoffset;
    this.particles[i]!.y = this.particley[i]! + this.startingy + this.yoffset;
  }

  override dispose(): void {
    for (const particle of this.particles) particle.dispose();
    for (const [key, bitmap] of this.bitmaps) {
      // Hue 0 is RPG::Cache's shared bitmap (Ruby's cache is reference counted).
      if (!key.endsWith("#0")) bitmap?.dispose();
    }
    this.particles = [];
    this.bitmaps.clear();
  }

  /** For tests: each particle's [x, y, opacity]. */
  debugState(): number[][] {
    return this.particles.map((p) => [p.x, p.y, p.opacity]);
  }
}

export class Fire extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 1, 20, 40, 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0.10, -5, -13, 30, 0]);
    this.initParticles("particle", 250);
  }
}

export class Smoke extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 0, 80, 20, 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0.10, -5, -15, 5, 80]);
    this.initParticles("smoke", 250);
  }
}

export class Teleport extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([1, 1, 1, 10, rand(360), 1, -64, Graphics.height, -64, Graphics.width, 0, 3, -8, -15, 20, 0]);
    this.initParticles("wideportal", 250);
    for (let i = 0; i < this.maxparticless; i++) {
      this.particles[i]!.ox = 16;
      this.particles[i]!.oy = 16;
    }
  }
}

export class Spirit extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([1, 0, 1, 20, rand(360), 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0.10, -5, -13, 30, 0]);
    this.initParticles("particle", 250);
  }
}

export class Explosion extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 1, 20, 0, 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0.10, -5, -13, 30, 0]);
    this.initParticles("explosion", 250);
  }
}

export class Aura extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 1, 20, 0, 1, -64, Graphics.height, -64, Graphics.width, 2, 2, -5, -13, 30, 0]);
    this.initParticles("particle", 250);
  }
}

export class Soot extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 0, 20, 0, 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0.10, -5, -15, 5, 80]);
    this.initParticles("smoke", 100, 0, 2);
  }
}

export class SootSmoke extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 0, 30, 0, 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0.10, -5, -15, 5, 80]);
    this.initParticles("smoke", 100, 0);
    for (let i = 0; i < this.maxparticless; i++) this.particles[i]!.blendType = rand(6) < 3 ? 1 : 2;
  }
}

export class Rocket extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 0, 60, 0, 0.5, -64, Graphics.height, -64, Graphics.width, 0.5, 0, -5, -15, 5, 80]);
    this.initParticles("smoke", 100, -1);
  }
}

export class FixedTeleport extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([1, 0, 1, 10, rand(360), 1, -Graphics.height, Graphics.height, 0, Graphics.width, 0, 3, -8, -15, 20, 0]);
    this.initParticles("wideportal", 250);
    for (let i = 0; i < this.maxparticless; i++) {
      this.particles[i]!.ox = 16;
      this.particles[i]!.oy = 16;
    }
  }
}

/** By Peter O. */
export class StarTeleport extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 1, 10, 0, 1, -Graphics.height, Graphics.height, 0, Graphics.width, 0, 3, -8, -15, 10, 0]);
    this.initParticles("star", 250);
    for (let i = 0; i < this.maxparticless; i++) {
      this.particles[i]!.ox = 48;
      this.particles[i]!.oy = 48;
    }
  }
}

export class Smokescreen extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 0, 250, 0, 0.2, -64, Graphics.height, -64, Graphics.width, 0.8, 0.8, -5, -15, 5, 80]);
    this.initParticles(null, 100);
    for (let i = 0; i < this.maxparticless; i++) {
      const rnd = rand(3);
      this.opacity[i] = rnd === 0 ? 1 : 100;
      const filename = rnd === 0 ? "explosionsmoke" : "smoke";
      this.particles[i]!.bitmap = this.loadBitmap(filename, this.hue);
    }
  }

  override calcParticlePos(i: number): void {
    if (this.randomhue === 1) {
      const filename = rand(3) === 0 ? "explosionsmoke" : "smoke";
      this.particles[i]!.bitmap = this.loadBitmap(filename, this.hue);
    }
    const multiple = 1.7;
    let xgrav = (this.xgravity * multiple) / this.slowdown;
    if (rand(2) === 1) xgrav = -xgrav;
    let ygrav = (this.ygravity * multiple) / this.slowdown;
    if (rand(2) === 1) ygrav = -ygrav;
    this.particlex[i]! += xgrav;
    this.particley[i]! += ygrav;
    this.particlex[i]! -= this.offsetx;
    this.particley[i]! -= this.offsety;
    this.particlex[i] = Math.floor(this.particlex[i]!);
    this.particley[i] = Math.floor(this.particley[i]!);
    this.particles[i]!.x = this.particlex[i]! + this.startingx + this.xoffset;
    this.particles[i]!.y = this.particley[i]! + this.startingy + this.yoffset;
  }
}

export class Flare extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 1, 30, 10, 1, -64, Graphics.height, -64, Graphics.width, 2, 2, -5, -12, 30, 0]);
    this.initParticles("particle", 255);
  }
}

export class Splash extends ParticleEffect_Event {
  constructor(event: GameEvent, viewport: Viewport | null) {
    super(event, viewport);
    this.setParameters([0, 0, 1, 30, 255, 1, -64, Graphics.height, -64, Graphics.width, 4, 2, -5, -12, 30, 0]);
    this.initParticles("smoke", 50);
  }

  override update(): void {
    super.update();
    for (let i = 0; i < this.maxparticless; i++) {
      this.particles[i]!.opacity = 50;
      this.particles[i]!.update();
    }
  }
}

//===============================================================================
// class Game_Event: attr_accessor :pe_refresh, set after every refresh
//===============================================================================
declare module "../game/GameEvent" {
  interface GameEvent {
    peRefresh?: boolean;
  }
}
const eventProto = GameEvent.prototype as unknown as { refresh(this: GameEvent): void };
const nfParticlesGameMapRefresh = eventProto.refresh;
eventProto.refresh = function (this: GameEvent) {
  nfParticlesGameMapRefresh.call(this);
  this.peRefresh = true;
};
