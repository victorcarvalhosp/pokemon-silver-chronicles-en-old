// Port of 012_Overworld/001_Overworld visuals/001_Overworld_Weather.rb
// (RPG::Weather): the overworld weather particles (rain, snow, sandstorm...),
// the tiled overlays (blizzard, sandstorm, fog), the weather's screen tone and
// the storm's flashes. Spriteset_Map makes one per map and feeds it
// $game_screen's weather every frame (sprites/spritesets.ts).
//
// All weather particles are assumed to start at the top/right and move to the
// bottom/left. Particles are only reset if they are off-screen to the left or
// bottom.
//
// Ruby relies on two RGSS conversions the port spells out: Sprite#x/#y/
// #opacity store integers (mkxp truncates a Float, opacity is clamped to
// 0..255), and Kernel#rand(Float) draws an integer below max.to_i.abs. The
// weather viewport's tone darkens everything under it, as mkxp applies a
// viewport's tone to the screen below (Viewport.toneScreen).

import { rand, random } from "../../core/random";
import { Weather as WeatherData } from "../../data/gameData/weather";
import type { Id } from "../../data/gameData/gameData";
import type { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color, Tone } from "../../rgss/types";
import { preloadBitmaps, RPGCache } from "../../ui/rpgCache";

/** RGSS Sprite#x= / #y=: the value is stored as an Integer. */
const int = Math.trunc;
/** RGSS Sprite#opacity=: an Integer clamped to 0..255. */
const opac = (v: number) => Math.max(0, Math.min(255, Math.trunc(v)));
/** Kernel#rand(max) for a Float max: 0...max.to_i.abs (a Float in 0...1 when that's 0). */
function krand(max: number): number {
  const n = Math.abs(Math.trunc(max));
  return n === 0 ? random() : rand(n);
}
/** Ruby Integer#/ */
const idiv = (a: number, b: number) => Math.floor(a / b);
/** Ruby Float#round (halves away from zero). */
const rround = (v: number) => Math.sign(v) * Math.round(Math.abs(v));

/** [GameData::Weather, particle bitmaps, tile bitmaps] */
type WeatherBitmaps = [WeatherData, Bitmap[], Bitmap[]];

/** Every graphic GameData::Weather names; preloaded with the first map (prepareMap). */
export function preloadWeatherGraphics(): Promise<void> {
  const names = new Set<string>();
  for (const w of WeatherData.DATA.values()) {
    for (const list of w.graphics) for (const name of list ?? []) names.add(`Graphics/Weather/${name}`);
  }
  return preloadBitmaps(names);
}

export class RPGWeather {
  static readonly MAX_SPRITES = 60;
  static readonly FADE_OLD_TILES_START = 0;
  static readonly FADE_OLD_TILES_END = 1;
  static readonly FADE_OLD_TONE_START = 0;
  static readonly FADE_OLD_TONE_END = 2;
  static readonly FADE_OLD_PARTICLES_START = 1;
  static readonly FADE_OLD_PARTICLES_END = 3;
  static readonly FADE_NEW_PARTICLES_START = 2;
  static readonly FADE_NEW_PARTICLES_END = 4;
  static readonly FADE_NEW_TONE_START = 3; // Shouldn't be sooner than FADE_OLD_TONE_END + 1
  static readonly FADE_NEW_TONE_END = 5;
  static readonly FADE_NEW_TILES_START = 4; // Shouldn't be sooner than FADE_OLD_TILES_END
  static readonly FADE_NEW_TILES_END = 5;

  readonly viewport: Viewport;
  private origViewport: Viewport | null;
  private weatherTypes = new Map<Id, WeatherBitmaps>();
  private _type: Id = "None";
  private _max = 0;
  private _ox = 0;
  private _oy = 0;
  private tilesWide = 0;
  private tilesTall = 0;
  private tileX = 0.0;
  private tileY = 0.0;
  /** +/- maximum addition to sun tone */
  private sunMagnitude = 0;
  /** Current addition to sun tone (0 to @sun_magnitude) */
  private sunStrength = 0;
  private timeUntilFlash = 0;
  private sprites: (Sprite | undefined)[] = [];
  private spriteLifetimes: number[] = [];
  private tiles: (Sprite | undefined)[] = [];
  private newSprites: (Sprite | undefined)[] = [];
  private newSpriteLifetimes: number[] = [];
  private fading = false;
  private targetType: Id | null = null;
  private targetMax: number | null = null;
  private oldMax: number | null = null;
  private newMax: number | null = null;
  private oldTone: Tone | null = null;
  private targetTone: Tone | null = null;
  private fadeTime = 0.0;
  private timeShift = 0;

  constructor(viewport: Viewport | null = null) {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = Math.max((viewport?.z ?? 0) + 1, 250); // Ensure weather appears above pictures (z=200)
    this.viewport.toneScreen = true;
    this.origViewport = viewport;
  }

  get type(): Id { return this._type; }
  get max(): number { return this._max; }
  get ox(): number { return this._ox; }
  get oy(): number { return this._oy; }

  dispose(): void {
    for (const sprite of this.sprites) sprite?.dispose();
    for (const sprite of this.newSprites) sprite?.dispose();
    for (const sprite of this.tiles) sprite?.dispose();
    this.viewport.dispose();
    // (The bitmaps are RPG::Cache's shared ones; the port's cache keeps them.)
  }

  fadeIn(newType: Id | number, newMax: number, duration = 1): void {
    if (this.fading) return;
    const type = WeatherData.get(newType).id;
    if (type === "None") newMax = 0;
    if (this._type === type && this._max === newMax) return;
    if (duration > 0) {
      this.targetType = type;
      this.targetMax = newMax;
      this.prepareBitmaps(this.targetType);
      this.oldMax = this._max;
      this.newMax = 0; // Current number of new particles
      const t = this.viewport.tone;
      this.oldTone = new Tone(t.red, t.green, t.blue, t.gray);
      this.targetTone = this.getWeatherTone(this.targetType, this.targetMax);
      this.fadeTime = 0.0;
      this.timeShift = 0;
      if (this._type === "None") {
        this.timeShift += 2; // No previous weather to fade out first
      } else if (!WeatherData.get(this._type).hasTiles()) {
        this.timeShift += 1; // No previous tiles to fade out first
      }
      this.fading = true;
      for (const sprite of this.newSprites) sprite?.dispose();
      this.newSprites = [];
      this.ensureSprites();
      this.newSprites.forEach((sprite, i) => this.setSpriteBitmap(sprite, i, this.targetType!));
    } else {
      this.setType(type);
      this.setMax(newMax);
    }
  }

  /** type= */
  setType(value: Id | number): void {
    const type = WeatherData.get(value).id;
    if (this._type === type) return;
    if (this.fading) {
      this._max = this.targetMax!;
      this.fading = false;
    }
    this._type = type;
    this.prepareBitmaps(this._type);
    if (WeatherData.get(this._type).hasTiles()) {
      const w = this.weatherTypes.get(this._type)![2][0]!.width;
      const h = this.weatherTypes.get(this._type)![2][0]!.height;
      this.tilesWide = Math.ceil(Graphics.width / w) + 1;
      this.tilesTall = Math.ceil(Graphics.height / h) + 1;
    } else {
      this.tilesWide = this.tilesTall = 0;
    }
    this.ensureSprites();
    this.sprites.forEach((sprite, i) => this.setSpriteBitmap(sprite, i, this._type));
    this.ensureTiles();
    this.tiles.forEach((sprite, i) => this.setTileBitmap(sprite, i, this._type));
  }

  /** max= */
  setMax(value: number): void {
    if (this._max === value) return;
    this._max = Math.max(0, Math.min(RPGWeather.MAX_SPRITES, value));
    this.ensureSprites();
    for (let i = 0; i < RPGWeather.MAX_SPRITES; i++) {
      if (this.sprites[i]) this.sprites[i]!.visible = i < this._max;
    }
  }

  set ox(value: number) {
    if (value === this._ox) return;
    this._ox = value;
    for (const sprite of this.sprites) if (sprite) sprite.ox = this._ox;
    for (const sprite of this.newSprites) if (sprite) sprite.ox = this._ox;
    for (const sprite of this.tiles) if (sprite) sprite.ox = this._ox;
  }

  set oy(value: number) {
    if (value === this._oy) return;
    this._oy = value;
    for (const sprite of this.sprites) if (sprite) sprite.oy = this._oy;
    for (const sprite of this.newSprites) if (sprite) sprite.oy = this._oy;
    for (const sprite of this.tiles) if (sprite) sprite.oy = this._oy;
  }

  getWeatherTone(weatherType: Id, maximum: number): Tone {
    return WeatherData.get(weatherType).tone(maximum);
  }

  prepareBitmaps(newType: Id): void {
    const weatherData = WeatherData.get(newType);
    const bitmapNames = weatherData.graphics;
    const entry: WeatherBitmaps = [weatherData, [], []];
    this.weatherTypes.set(newType, entry);
    for (let i = 0; i < 2; i++) { // 0=particles, 1=tiles
      const names = bitmapNames[i];
      if (!names) continue;
      for (const name of names) {
        // RPG::Cache.load_bitmap raises for a missing file; the graphics are
        // preloaded, so a miss here means the file really is missing.
        const bitmap = RPGCache.loadBitmap("Graphics/Weather/", name);
        if (!bitmap) throw new Error(`Failed to load image 'Graphics/Weather/${name}'`);
        (entry[i + 1] as Bitmap[]).push(bitmap);
      }
    }
  }

  private particleBitmaps(type: Id | null): Bitmap[] | undefined {
    return type == null ? undefined : this.weatherTypes.get(type)?.[1];
  }

  ensureSprites(): void {
    const own = this.particleBitmaps(this._type);
    if (this.sprites.length < RPGWeather.MAX_SPRITES && own && own.length > 0) {
      for (let i = 0; i < RPGWeather.MAX_SPRITES; i++) {
        if (!this.sprites[i]) {
          const sprite = new Sprite(this.viewport);
          sprite.z = 1000;
          sprite.ox = this._ox;
          sprite.oy = this._oy;
          sprite.opacity = 0;
          this.sprites[i] = sprite;
        }
        this.sprites[i]!.visible = i < this._max;
        this.spriteLifetimes[i] = 0;
      }
    }
    const target = this.particleBitmaps(this.targetType);
    if (this.fading && this.newSprites.length < RPGWeather.MAX_SPRITES && target && target.length > 0) {
      for (let i = 0; i < RPGWeather.MAX_SPRITES; i++) {
        if (!this.newSprites[i]) {
          const sprite = new Sprite(this.viewport);
          sprite.z = 1000;
          sprite.ox = this._ox;
          sprite.oy = this._oy;
          sprite.opacity = 0;
          this.newSprites[i] = sprite;
        }
        this.newSprites[i]!.visible = i < this.newMax!;
        this.newSpriteLifetimes[i] = 0;
      }
    }
  }

  ensureTiles(): void {
    if (this.tiles.length >= this.tilesWide * this.tilesTall) return;
    for (let i = 0; i < this.tilesWide * this.tilesTall; i++) {
      if (!this.tiles[i]) {
        const sprite = new Sprite(this.viewport);
        sprite.z = 1000;
        sprite.ox = this._ox;
        sprite.oy = this._oy;
        sprite.opacity = 0;
        this.tiles[i] = sprite;
      }
      this.tiles[i]!.visible = true;
    }
  }

  setSpriteBitmap(sprite: Sprite | undefined, index: number, weatherType: Id): void {
    if (!sprite) return;
    const weatherBitmaps = this.weatherTypes.get(weatherType)?.[1];
    if (!weatherBitmaps || weatherBitmaps.length === 0) {
      sprite.setBitmap(null);
      return;
    }
    if (this.weatherTypes.get(weatherType)![0].category === "Rain") {
      const lastIndex = weatherBitmaps.length - 1; // Last sprite is a splash
      if (index % 2 === 0) {
        sprite.setBitmap(weatherBitmaps[index % lastIndex]!);
      } else {
        sprite.setBitmap(weatherBitmaps[lastIndex]!);
      }
    } else {
      sprite.setBitmap(weatherBitmaps[index % weatherBitmaps.length]!);
    }
  }

  setTileBitmap(sprite: Sprite | undefined, index: number, weatherType: Id | null): void {
    if (!sprite || !weatherType) return;
    const weatherBitmaps = this.weatherTypes.get(weatherType)?.[2];
    if (weatherBitmaps && weatherBitmaps.length > 0) {
      sprite.setBitmap(weatherBitmaps[index % weatherBitmaps.length]!);
    } else {
      sprite.setBitmap(null);
    }
  }

  resetSpritePosition(sprite: Sprite, index: number, isNewSprite = false): void {
    const weatherType = isNewSprite ? this.targetType! : this._type;
    const lifetimes = isNewSprite ? this.newSpriteLifetimes : this.spriteLifetimes;
    if (index < (isNewSprite ? this.newMax! : this._max)) {
      sprite.visible = true;
    } else {
      sprite.visible = false;
      lifetimes[index] = 0;
      return;
    }
    const data = this.weatherTypes.get(weatherType)![0];
    const bitmap = sprite.bitmap!;
    const W = Graphics.width;
    const H = Graphics.height;
    if (data.category === "Rain" && index % 2 === 1) { // Splash
      sprite.x = int(this._ox - bitmap.width + rand(W + bitmap.width * 2));
      sprite.y = int(this._oy - bitmap.height + rand(H + bitmap.height * 2));
      lifetimes[index] = (30 + rand(20)) * 0.01; // 0.3-0.5 seconds
    } else {
      const xSpeed = data.particleDeltaX;
      const ySpeed = data.particleDeltaY;
      const gradient = xSpeed / ySpeed;
      if (Math.abs(gradient) >= 1) {
        // Position sprite to the right of the screen
        sprite.x = int(this._ox + W + rand(W));
        sprite.y = int(this._oy + H - krand(H + bitmap.height - W / gradient));
        const distanceToCover = sprite.x - this._ox - idiv(W, 2) + bitmap.width + rand(idiv(W * 8, 5));
        lifetimes[index] = Math.abs(distanceToCover / xSpeed);
      } else {
        // Position sprite to the top of the screen
        sprite.x = int(this._ox - bitmap.width + krand(W + bitmap.width - gradient * H));
        sprite.y = int(this._oy - bitmap.height - rand(H));
        const distanceToCover = this._oy - sprite.y + idiv(H, 2) + rand(idiv(H * 8, 5));
        lifetimes[index] = Math.abs(distanceToCover / ySpeed);
      }
    }
    sprite.opacity = 255;
  }

  updateSpritePosition(sprite: Sprite | undefined, index: number, isNewSprite = false): void {
    if (!sprite || !sprite.bitmap || !sprite.visible) return;
    const deltaT = Graphics.deltaS;
    const lifetimes = isNewSprite ? this.newSpriteLifetimes : this.spriteLifetimes;
    if (lifetimes[index]! >= 0) {
      lifetimes[index]! -= deltaT;
      if (lifetimes[index]! <= 0) {
        this.resetSpritePosition(sprite, index, isNewSprite);
        return;
      }
    }
    // Determine which weather type this sprite is representing
    const weatherType = isNewSprite ? this.targetType! : this._type;
    const data = this.weatherTypes.get(weatherType)![0];
    const W = Graphics.width;
    const H = Graphics.height;
    // Update visibility/position/opacity of sprite
    if (data.category === "Rain" && index % 2 === 1) { // Splash
      sprite.opacity = lifetimes[index]! < 0.2 ? 255 : 0; // 0.2 seconds
    } else {
      const distX = data.particleDeltaX * deltaT;
      const distY = data.particleDeltaY * deltaT;
      sprite.x = int(sprite.x + distX);
      sprite.y = int(sprite.y + distY);
      if (weatherType === "Snow") {
        sprite.x = int(sprite.x + (distX * (sprite.y - this._oy)) / (H * 3)); // Faster when further down screen
        sprite.x = int(sprite.x + ([2, 1, 0, -1][rand(4)]! * distX) / 8); // Random movement
        sprite.y = int(sprite.y + ([2, 1, 1, 0, 0, -1][index % 6]! * distY) / 10); // Variety
      }
      if (sprite.x - this._ox > W) sprite.x -= W;
      if (sprite.x - this._ox < -sprite.width) sprite.x += W;
      if (sprite.y - this._oy > H) sprite.y -= H;
      if (sprite.y - this._oy < -sprite.height) sprite.y += H;
      sprite.opacity = opac(sprite.opacity + data.particleDeltaOpacity * deltaT);
      const x = sprite.x - this._ox;
      const y = sprite.y - this._oy;
      // Check if sprite is off-screen; if so, reset it
      if (sprite.opacity < 64 || x < -sprite.bitmap.width || y > H) {
        this.resetSpritePosition(sprite, index, isNewSprite);
      }
    }
  }

  recalculateTilePositions(): void {
    const deltaT = Graphics.deltaS;
    let weatherType = this._type;
    if (this.fading && this.fadeTime >= Math.max(RPGWeather.FADE_OLD_TONE_END - this.timeShift, 0)) {
      weatherType = this.targetType!;
    }
    const [data, , tiles] = this.weatherTypes.get(weatherType)!;
    this.tileX += data.tileDeltaX * deltaT;
    this.tileY += data.tileDeltaY * deltaT;
    // NOTE (Ruby parity): fading from a tiled weather to one without tiles,
    // update_fading clears @tiles_wide once @fade_time is *past* the threshold
    // but this switches to the new type's (missing) tile bitmaps once it's *at*
    // it; if @fade_time ever lands exactly on it, Ruby calls `width` on nil
    // (001_Overworld_Weather.rb:315-320). Sums of 1/60 s or 1/40 s never do.
    while (this.tileX < this._ox - tiles[0]!.width) this.tileX += tiles[0]!.width;
    while (this.tileX > this._ox) this.tileX -= tiles[0]!.width;
    while (this.tileY < this._oy - tiles[0]!.height) this.tileY += tiles[0]!.height;
    while (this.tileY > this._oy) this.tileY -= tiles[0]!.height;
  }

  updateTilePosition(sprite: Sprite | undefined, index: number): void {
    if (!sprite || !sprite.bitmap || !sprite.visible) return;
    sprite.x = int(rround(this.tileX) + (index % this.tilesWide) * sprite.bitmap.width);
    sprite.y = int(rround(this.tileY) + idiv(index, this.tilesWide) * sprite.bitmap.height);
    if (sprite.x - this._ox < -sprite.bitmap.width) sprite.x += this.tilesWide * sprite.bitmap.width;
    if (sprite.y - this._oy > Graphics.height) sprite.y -= this.tilesTall * sprite.bitmap.height;
    sprite.visible = true;
    const R = RPGWeather;
    if (this.fading && this._type !== this.targetType) {
      if (this.fadeTime >= R.FADE_OLD_TILES_START && this.fadeTime < R.FADE_OLD_TILES_END) {
        if (this.timeShift === 0) { // There were old tiles to fade out
          const fraction = (this.fadeTime - Math.max(R.FADE_OLD_TILES_START - this.timeShift, 0)) / (R.FADE_OLD_TILES_END - R.FADE_OLD_TILES_START);
          sprite.opacity = opac(255 * (1 - fraction));
        }
      } else if (this.fadeTime >= Math.max(R.FADE_NEW_TILES_START - this.timeShift, 0) &&
                 this.fadeTime < Math.max(R.FADE_NEW_TILES_END - this.timeShift, 0)) {
        const fraction = (this.fadeTime - Math.max(R.FADE_NEW_TILES_START - this.timeShift, 0)) / (R.FADE_NEW_TILES_END - R.FADE_NEW_TILES_START);
        sprite.opacity = opac(255 * fraction);
      } else {
        sprite.opacity = 0;
      }
    } else {
      sprite.opacity = this._max > 0 ? 255 : 0;
    }
  }

  /** Set tone of viewport (general screen brightening/darkening) */
  updateScreenTone(): void {
    const R = RPGWeather;
    let weatherType = this._type;
    let weatherMax = this._max;
    let fraction = 1;
    let toneRed = 0;
    let toneGreen = 0;
    let toneBlue = 0;
    let toneGray = 0;
    const vt = this.viewport.tone;
    // Get base tone
    if (this.fading) {
      const oldTone = this.oldTone!;
      const targetTone = this.targetTone!;
      if (this._type === this.targetType) { // Just changing max
        if (this.fadeTime >= Math.max(R.FADE_NEW_TONE_START - this.timeShift, 0) &&
            this.fadeTime < Math.max(R.FADE_NEW_TONE_END - this.timeShift, 0)) {
          weatherMax = this.targetMax!;
          const fract = (this.fadeTime - Math.max(R.FADE_NEW_TONE_START - this.timeShift, 0)) / (R.FADE_NEW_TONE_END - R.FADE_NEW_TONE_START);
          toneRed = targetTone.red + (1 - fract) * (oldTone.red - targetTone.red);
          toneGreen = targetTone.green + (1 - fract) * (oldTone.green - targetTone.green);
          toneBlue = targetTone.blue + (1 - fract) * (oldTone.blue - targetTone.blue);
          toneGray = targetTone.gray + (1 - fract) * (oldTone.gray - targetTone.gray);
        } else {
          toneRed = vt.red;
          toneGreen = vt.green;
          toneBlue = vt.blue;
          toneGray = vt.gray;
        }
      } else if (this.timeShift < 2 && this.fadeTime >= R.FADE_OLD_TONE_START && this.fadeTime < R.FADE_OLD_TONE_END) {
        weatherMax = this.oldMax!;
        fraction = Math.max(0, Math.min(1, (this.fadeTime - R.FADE_OLD_TONE_START) / (R.FADE_OLD_TONE_END - R.FADE_OLD_TONE_START)));
        fraction = 1 - fraction;
        toneRed = oldTone.red;
        toneGreen = oldTone.green;
        toneBlue = oldTone.blue;
        toneGray = oldTone.gray;
      } else if (this.fadeTime >= Math.max(R.FADE_NEW_TONE_START - this.timeShift, 0)) {
        weatherType = this.targetType!;
        weatherMax = this.targetMax!;
        fraction = Math.max(0, Math.min(1, (this.fadeTime - Math.max(R.FADE_NEW_TONE_START - this.timeShift, 0)) / (R.FADE_NEW_TONE_END - R.FADE_NEW_TONE_START)));
        toneRed = targetTone.red;
        toneGreen = targetTone.green;
        toneBlue = targetTone.blue;
        toneGray = targetTone.gray;
      }
    } else {
      const baseTone = this.getWeatherTone(weatherType, weatherMax);
      toneRed = baseTone.red;
      toneGreen = baseTone.green;
      toneBlue = baseTone.blue;
      toneGray = baseTone.gray;
    }
    // Modify base tone
    if (weatherType === "Sun") {
      if (this.sunMagnitude !== weatherMax && this.sunMagnitude !== -weatherMax) this.sunMagnitude = weatherMax;
      if ((this.sunMagnitude > 0 && this.sunStrength > this.sunMagnitude) ||
          (this.sunMagnitude < 0 && this.sunStrength < 0)) {
        this.sunMagnitude *= -1;
      }
      this.sunStrength += (this.sunMagnitude * Graphics.deltaS) / 0.4; // 0.4 seconds per half flash
      toneRed += this.sunStrength;
      toneGreen += this.sunStrength;
      toneBlue += this.sunStrength / 2;
    }
    // Apply screen tone
    vt.set(toneRed * fraction, toneGreen * fraction, toneBlue * fraction, toneGray * fraction);
  }

  updateFading(): void {
    if (!this.fading) return;
    const R = RPGWeather;
    const oldFadeTime = this.fadeTime;
    this.fadeTime += Graphics.deltaS;
    // Change tile bitmaps
    if (this._type !== this.targetType) {
      const tileChangeThreshold = Math.max(R.FADE_OLD_TONE_END - this.timeShift, 0);
      if (oldFadeTime <= tileChangeThreshold && this.fadeTime > tileChangeThreshold) {
        this.tileX = this.tileY = 0.0;
        const target = this.weatherTypes.get(this.targetType!);
        if (target && target[2].length > 0) {
          const w = target[2][0]!.width;
          const h = target[2][0]!.height;
          this.tilesWide = Math.ceil(Graphics.width / w) + 1;
          this.tilesTall = Math.ceil(Graphics.height / h) + 1;
          this.ensureTiles();
          this.tiles.forEach((sprite, i) => this.setTileBitmap(sprite, i, this.targetType));
        } else {
          this.tilesWide = this.tilesTall = 0;
        }
      }
    }
    // Reduce the number of old weather particles
    if (this._max > 0 && this.fadeTime >= Math.max(R.FADE_OLD_PARTICLES_START - this.timeShift, 0)) {
      const fraction = (this.fadeTime - Math.max(R.FADE_OLD_PARTICLES_START - this.timeShift, 0)) / (R.FADE_OLD_PARTICLES_END - R.FADE_OLD_PARTICLES_START);
      this._max = this.oldMax! * (1 - fraction);
      // NOTE: Sprite visibilities aren't updated here; a sprite is allowed to
      //       die off naturally in def reset_sprite_position.
    }
    // Increase the number of new weather particles
    if (this.newMax! < this.targetMax! && this.fadeTime >= Math.max(R.FADE_NEW_PARTICLES_START - this.timeShift, 0)) {
      const fraction = (this.fadeTime - Math.max(R.FADE_NEW_PARTICLES_START - this.timeShift, 0)) / (R.FADE_NEW_PARTICLES_END - R.FADE_NEW_PARTICLES_START);
      this.newMax = Math.floor(this.targetMax! * fraction);
      this.newSprites.forEach((sprite, i) => { if (sprite) sprite.visible = i < this.newMax!; });
    }
    // End fading
    if (this.fadeTime >= (this.targetType === "None" ? R.FADE_OLD_PARTICLES_END : R.FADE_NEW_TILES_END) - this.timeShift &&
        !this.sprites.some((sprite) => sprite!.visible)) {
      this._type = this.targetType!;
      this._max = this.targetMax!;
      this.targetType = null;
      this.targetMax = null;
      this.oldMax = null;
      this.newMax = null;
      this.oldTone = null;
      this.targetTone = null;
      this.fadeTime = 0.0;
      this.timeShift = 0;
      for (const sprite of this.sprites) sprite?.dispose();
      this.sprites = this.newSprites;
      this.newSprites = [];
      this.spriteLifetimes = this.newSpriteLifetimes;
      this.newSpriteLifetimes = [];
      this.fading = false;
    }
  }

  update(): void {
    this.updateFading();
    this.updateScreenTone();
    // Storm flashes
    if (this._type === "Storm" && !this.fading) {
      if (this.timeUntilFlash > 0) {
        this.timeUntilFlash -= Graphics.deltaS;
        if (this.timeUntilFlash <= 0) {
          // flash(color, rand(2..4) * 20): frames at the original 40 fps
          this.viewport.flash(new Color(255, 255, 255, 230), ((2 + rand(3)) * 20) / 40);
        }
      }
      if (this.timeUntilFlash <= 0) {
        this.timeUntilFlash = (1 + rand(12)) * 0.5; // 0.5-6 seconds
      }
    }
    this.viewport.update(Graphics.deltaS);
    // Update weather particles (raindrops, snowflakes, etc.)
    const own = this.particleBitmaps(this._type);
    if (own && own.length > 0) {
      this.ensureSprites();
      for (let i = 0; i < RPGWeather.MAX_SPRITES; i++) this.updateSpritePosition(this.sprites[i], i, false);
    } else if (this.sprites.length > 0) {
      for (const sprite of this.sprites) sprite?.dispose();
      this.sprites = [];
    }
    // Update new weather particles (while fading in only)
    const target = this.particleBitmaps(this.targetType);
    if (this.fading && target && target.length > 0) {
      this.ensureSprites();
      for (let i = 0; i < RPGWeather.MAX_SPRITES; i++) this.updateSpritePosition(this.newSprites[i], i, true);
    } else if (this.newSprites.length > 0) {
      for (const sprite of this.newSprites) sprite?.dispose();
      this.newSprites = [];
    }
    // Update weather tiles (sandstorm/blizzard tiled overlay)
    if (this.tilesWide > 0 && this.tilesTall > 0) {
      this.ensureTiles();
      this.recalculateTilePositions();
      this.tiles.forEach((sprite, i) => this.updateTilePosition(sprite, i));
    } else if (this.tiles.length > 0) {
      for (const sprite of this.tiles) sprite?.dispose();
      this.tiles = [];
    }
  }

  /** For tests and the debug overlay: the particle/tile sprites. */
  debugState() {
    const s = (sp: Sprite | undefined) => sp ? [sp.x, sp.y, sp.opacity, sp.visible] : null;
    return {
      type: this._type, max: this._max, fading: this.fading, fadeTime: this.fadeTime,
      tone: [this.viewport.tone.red, this.viewport.tone.green, this.viewport.tone.blue, this.viewport.tone.gray],
      sprites: this.sprites.map(s), newSprites: this.newSprites.map(s), tiles: this.tiles.map(s),
      tileX: this.tileX, tileY: this.tileY,
    };
  }
}
