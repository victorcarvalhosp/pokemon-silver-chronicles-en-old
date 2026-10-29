// Port of the graphics of Data/Scripts/016_UI/022_UI_PurifyChamber.rb:
// pbDrawGauge, Window_PurifyChamberSets, DirectFlowDiagram, FlowDiagram,
// PurifyChamberSetView and PurifyChamberScene (which opens the PC storage
// screen, ../storage, to choose Pokémon, and the Summary). The model is in
// ./PurifyChamber.ts, the screen in ./PurifyChamberScreen.ts.
//
// The flow diagrams move their dots once per original 40 fps frame
// (FrameCounter). RGSS truncates sprite coordinates; calcPoint's floats are
// truncated where Ruby assigns them to a sprite.

import { G } from "../../game/globals";
import { pbPlayCancelSE, pbPlayCursorSE, pbPlayDecisionSE } from "../../game/GameSystem";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import type { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { Type } from "../../data/gameData/type";
import type { Bitmap } from "../../rgss/Bitmap";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect, Tone } from "../../rgss/types";
import { UIHelper } from "../bag/UIHelper";
import { pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { FrameCounter } from "../frameTime";
import { _INTL, pbDisposeSpriteHash, pbSetSmallFont, pbUpdateSpriteHash } from "../messageConfig";
import { addBackgroundOrColoredPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { PokemonIconSprite, preloadPokemonIcons } from "../sprites/pokemonIcon";
import { BitmapSprite } from "../SpriteWrapper";
import { PokemonStorageScene } from "../storage/PokemonStorageScene";
import { PokemonStorageScreen, type Selection } from "../storage/PokemonStorageScreen";
import { PokemonSummary_Scene, PokemonSummaryScreen } from "../summary/summary";
import { Window_AdvancedTextPokemon, Window_DrawableCommand, type Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";
import { PurifyChamber, PurifyChamberHelper, calcPoint, idiv } from "./PurifyChamber";

/** Float#% / Integer#% (the result has the divisor's sign). */
const rmod = (a: number, b: number): number => ((a % b) + b) % b;

//===============================================================================
// General purpose utilities
//===============================================================================
export function pbDrawGauge(bitmap: Bitmap | null, rect: Rect, color: Color, value: number, maxValue: number): void {
  if (!bitmap) return;
  bitmap.fillRect(rect.x, rect.y, rect.width, rect.height, new Color(0, 0, 0));
  const width = maxValue <= 0 ? 0 : idiv((rect.width - 4) * value, maxValue);
  if (rect.width >= 4 && rect.height >= 4) {
    bitmap.fillRect(rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, new Color(248, 248, 248));
    bitmap.fillRect(rect.x + 2, rect.y + 2, width, rect.height - 4, color);
  }
}

//===============================================================================
//
//===============================================================================
export class Window_PurifyChamberSets extends Window_DrawableCommand {
  private chamber!: PurifyChamber;
  private _switching = -1;

  constructor(chamber: PurifyChamber, x: number, y: number, width: number, height: number, viewport: Viewport | null = null) {
    super(x, y, width, height, viewport);
    this.chamber = chamber;
    this._switching = -1;
    this.refresh();
  }

  override itemCount(): number {
    return PurifyChamber.NUMSETS;
  }

  get switching(): number { return this._switching; }
  set switching(value: number) {
    this._switching = value;
    this.refresh();
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (!this.chamber) return; // (called from the superclass before Ruby's ivars exist)
    const textpos: TextPosition[] = [];
    rect = this.drawCursor(index, rect);
    if (index === this._switching) {
      textpos.push([String(index + 1), rect.x, rect.y, false, new Color(248, 0, 0), this.shadowColor]);
    } else {
      textpos.push([String(index + 1), rect.x, rect.y, false, this.baseColor, this.shadowColor]);
    }
    if (this.chamber.setCount(index) > 0) {
      pbDrawGauge(this.contents, new Rect(rect.x + 16, rect.y + 6, 48, 8),
        new Color(0, 0, 256), this.chamber.get(index).tempo(), PurifyChamber.maximumTempo());
    }
    const shadow = this.chamber.getShadow(index);
    if (shadow) {
      pbDrawGauge(this.contents, new Rect(rect.x + 16, rect.y + 18, 48, 8),
        new Color(192, 0, 256), shadow.heartGauge, shadow.maxGaugeSize());
    }
    pbDrawTextPositions(this.contents!, textpos);
  }
}

//===============================================================================
// The dots of a flow diagram (DirectFlowDiagram and FlowDiagram share them).
//===============================================================================
abstract class FlowDots {
  protected points: BitmapSprite[] = [];
  protected strength = 0;
  protected offset = 0;
  protected x = 306;
  protected y = 158;
  protected distance = 96;
  private clock = new FrameCounter();

  constructor(protected viewport: Viewport | null = null) {}

  /** 0=none, 1=weak, 2=strong */
  setFlowStrength(strength: number): void {
    this.strength = strength;
  }

  set visible(value: boolean) {
    for (const point of this.points) point.visible = value;
  }

  dispose(): void {
    for (const point of this.points) point.dispose();
  }

  protected ensurePoint(j: number): void {
    if (!this.points[j] || this.points[j].isDisposed()) {
      this.points[j] = new BitmapSprite(8, 8, this.viewport);
      this.points[j].bitmap!.fillRect(0, 0, 8, 8, new Color(0, 0, 0));
    }
    this.points[j].tone = this.strength === 2 ? new Tone(232, 232, 248) : new Tone(16, 16, 232);
    this.points[j].visible = this.strength !== 0;
  }

  /** update, once per original frame. */
  update(): void {
    const n = this.clock.tick();
    for (let f = 0; f < n; f++) this.updateFrame();
  }

  protected abstract updateFrame(): void;

  set color(value: Color) {
    for (const point of this.points) point.color = value;
  }
}

//===============================================================================
//
//===============================================================================
export class DirectFlowDiagram extends FlowDots {
  private angle = 0;

  protected updateFrame(): void {
    for (const point of this.points) {
      point.update();
      point.visible = false;
    }
    let j = 0;
    let i = 0;
    while (i < this.distance) {
      const o = (i + this.offset) % this.distance;
      if (o >= 0 && o < this.distance) {
        this.ensurePoint(j);
        const pt = calcPoint(this.x, this.y, o, this.angle);
        this.points[j]!.x = Math.trunc(pt[0]);
        this.points[j]!.y = Math.trunc(pt[1]);
        j += 1;
      }
      i += this.strength === 2 ? 16 : 32;
    }
    this.offset += this.strength === 2 ? 3 : 2;
    this.offset %= this.distance;
  }

  setAngle(angle1: number): void {
    this.angle = angle1 - Math.floor(angle1 / 360) * 360;
  }
}

//===============================================================================
//
//===============================================================================
export class FlowDiagram extends FlowDots {
  private startAngle = 0;
  private endAngle = 0;

  withinRange(angle: number, startAngle: number, endAngle: number): boolean {
    if (startAngle > endAngle) {
      return (angle >= startAngle || angle <= endAngle) && angle >= 0 && angle <= 360;
    }
    return angle >= startAngle && angle <= endAngle;
  }

  protected updateFrame(): void {
    for (const point of this.points) {
      point.update();
      point.visible = false;
    }
    let j = 0;
    let i = 0;
    while (i < 360) {
      const angle = rmod(i + this.offset, 360);
      if (this.withinRange(angle, this.startAngle, this.endAngle)) {
        this.ensurePoint(j);
        const pt = calcPoint(this.x, this.y, this.distance, angle);
        this.points[j]!.x = Math.trunc(pt[0]);
        this.points[j]!.y = Math.trunc(pt[1]);
        j += 1;
      }
      i += this.strength === 2 ? 10 : 20;
    }
    this.offset -= this.strength === 2 ? 3 : 2;
    this.offset = rmod(this.offset, 360 * 6);
  }

  setRange(angle1: number, angle2: number): void {
    this.startAngle = angle1 - Math.floor(angle1 / 360) * 360;
    this.endAngle = angle2 - Math.floor(angle2 / 360) * 360;
    if (this.startAngle === this.endAngle && angle1 !== angle2) {
      this.startAngle = 0;
      this.endAngle = 359.99;
    }
  }
}

//===============================================================================
// Ruby subclasses Sprite (with no bitmap of its own) and overrides visible=
// and color=; Sprite's visible/color are plain fields here, so this keeps
// them itself.
//===============================================================================
export class PurifyChamberSetView {
  private _set: number;
  private _cursor = -1;
  private _heldpkmn: Pokemon | null = null;
  private view: BitmapSprite;
  private info: BitmapSprite;
  private flows: FlowDiagram[] = [];
  private directflow: DirectFlowDiagram;
  private sprites: PokemonIconSprite[] = [];
  private chamber: PurifyChamber;
  private viewport: Viewport | null;
  private _visible = true;
  private _color = new Color(0, 0, 0, 0);
  private disposed = false;
  /** Sprite#angle, which refresh passes to setAngle before its loop sets one. */
  private readonly angle = 0;

  constructor(chamber: PurifyChamber, set: number, viewport: Viewport | null = null) {
    this.viewport = viewport;
    this._set = set;
    this.view = new BitmapSprite(64, 64, viewport);
    this.view.bitmap!.fillRect(8, 8, 48, 48, new Color(255, 255, 255));
    this.view.bitmap!.fillRect(10, 10, 44, 44, new Color(255, 255, 255, 128));
    this.info = new BitmapSprite(Graphics.width - 112, 48, viewport);
    this.directflow = new DirectFlowDiagram(viewport);
    this.directflow.setAngle(0);
    this.directflow.setFlowStrength(1);
    this.sprites[0] = new PokemonIconSprite(null, viewport);
    this.sprites[0].setOffset();
    for (let i = 0; i < PurifyChamber.SETSIZE * 2; i++) {
      this.sprites[i + 1] = new PokemonIconSprite(null, viewport);
      this.sprites[i + 1]!.setOffset();
    }
    this.sprites[1 + PurifyChamber.SETSIZE * 2] = new PokemonIconSprite(null, viewport);
    this.sprites[1 + PurifyChamber.SETSIZE * 2]!.setOffset();
    this.chamber = chamber;
    this.refresh();
  }

  get set(): number { return this._set; }
  set set(value: number) {
    this._set = value;
    this.refresh();
  }

  get cursor(): number { return this._cursor; }
  set cursor(value: number) {
    this._cursor = value;
    this.refresh();
  }

  get heldpkmn(): Pokemon | null { return this._heldpkmn; }
  set heldpkmn(value: Pokemon | null) {
    this._heldpkmn = value;
    this.refresh();
  }

  refreshFlows(): void {
    for (const flow of this.flows) flow.setFlowStrength(0);
    const setcount = this.chamber.setCount(this._set);
    for (let i = 0; i < setcount; i++) {
      if (!this.flows[i]) this.flows[i] = new FlowDiagram(this.viewport);
      let angle = 360 - idiv(i * 360, setcount);
      angle += 90; // start at 12 not 3 o'clock
      const endAngle = angle - idiv(360, setcount);
      this.flows[i]!.setRange(endAngle, angle);
      this.flows[i]!.setFlowStrength(this.chamber.get(this._set).affinity(i));
    }
  }

  moveCursor(button: number): void {
    let points = Math.max(this.chamber.setCount(this._set) * 2, 1);
    const oldcursor = this._cursor;
    if (this._cursor === 0 && points > 0) {
      if (button === Input.UP) this._cursor = 1;
      if (button === Input.RIGHT) this._cursor = idiv(points * 1, 4) + 1;
      if (button === Input.DOWN) this._cursor = idiv(points * 2, 4) + 1;
      if (button === Input.LEFT) this._cursor = idiv(points * 3, 4) + 1;
    } else if (this._cursor > 0) {
      let pos: number | null = this._cursor - 1;
      if (this.chamber.setCount(this._set) === PurifyChamber.SETSIZE) {
        points = Math.max(idiv(points, 2), 1);
        pos = idiv(pos, 2);
      }
      const seg = idiv(pos * 8, points);
      switch (seg) {
        case 7: case 0:
          if (button === Input.LEFT) pos -= 1;
          if (button === Input.RIGHT) pos += 1;
          if (button === Input.DOWN) pos = null;
          break;
        case 1: case 2:
          if (button === Input.UP) pos -= 1;
          if (button === Input.DOWN) pos += 1;
          if (button === Input.LEFT) pos = null;
          break;
        case 3: case 4:
          if (button === Input.RIGHT) pos -= 1;
          if (button === Input.LEFT) pos += 1;
          if (button === Input.UP) pos = null;
          break;
        case 5: case 6:
          if (button === Input.DOWN) pos -= 1;
          if (button === Input.UP) pos += 1;
          if (button === Input.RIGHT) pos = null;
          break;
      }
      if (pos == null) {
        this._cursor = 0;
      } else {
        pos -= Math.floor(pos / points) * points; // modulus
        if (this.chamber.setCount(this._set) === PurifyChamber.SETSIZE) pos *= 2;
        this._cursor = pos + 1;
      }
    }
    if (this._cursor !== oldcursor) this.refresh();
  }

  checkCursor(index: number): void {
    if (this._cursor === index) {
      this.view.x = this.sprites[index]!.x - idiv(this.view.bitmap!.width, 2);
      this.view.y = this.sprites[index]!.y - idiv(this.view.bitmap!.height, 2);
      this.view.visible = true;
    }
  }

  refresh(): void {
    let pkmn = this.chamber.getShadow(this._set);
    this.view.visible = false;
    const bitmap = this.info.bitmap!;
    bitmap.fillRect(0, 0, bitmap.width, bitmap.height, new Color(0, 248, 0));
    pbSetSmallFont(bitmap);
    const textpos: TextPosition[] = [];
    const base = new Color(248, 248, 248);
    const shadow = new Color(128, 128, 128);
    if (pkmn) {
      const types = pkmn.types();
      if (types.length === 1) {
        textpos.push([_INTL("{1}  Lv.{2}  {3}", pkmn.name, pkmn.level, Type.get(types[0]!).name), 2, 6, 0, base, shadow]);
      } else {
        textpos.push([_INTL("{1}  Lv.{2}  {3}/{4}", pkmn.name, pkmn.level, Type.get(types[0]!).name,
          Type.get(types[1]!).name), 2, 6, 0, base, shadow]);
      }
      textpos.push([_INTL("FLOW"), 2 + idiv(bitmap.width, 2), 30, 0, base, shadow]);
      // draw heart gauge
      pbDrawGauge(bitmap, new Rect(idiv(bitmap.width * 3, 4), 8, idiv(bitmap.width * 1, 4), 8),
        new Color(192, 0, 256), pkmn.heartGauge, pkmn.maxGaugeSize());
      // draw flow gauge
      pbDrawGauge(bitmap, new Rect(idiv(bitmap.width * 3, 4), 32, idiv(bitmap.width * 1, 4), 8),
        new Color(0, 0, 248), this.chamber.chamberFlow(this._set), 7);
    }
    if (this.chamber.setCount(this._set) > 0) {
      textpos.push([_INTL("TEMPO"), 2, 30, 0, base, shadow]);
      // draw tempo gauge
      pbDrawGauge(bitmap, new Rect(idiv(bitmap.width * 1, 4), 32, idiv(bitmap.width * 1, 4), 8),
        new Color(0, 0, 248), this.chamber.get(this._set).tempo(), PurifyChamber.maximumTempo());
    }
    pbDrawTextPositions(bitmap, textpos);
    this.info.x = Graphics.width - bitmap.width;
    this.info.y = Graphics.height - bitmap.height;
    this.sprites[0]!.pokemon = pkmn;
    this.sprites[0]!.x = 306;
    this.sprites[0]!.y = 158;
    this.sprites[0]!.z = 2;
    // NOTE (Ruby parity): Ruby's `angle` here isn't a local yet, so it calls
    // Sprite#angle (0); the strength set next hides it anyway.
    this.directflow.setAngle(this.angle);
    this.directflow.setFlowStrength(0);
    this.checkCursor(0);
    const points = Math.max(this.chamber.setCount(this._set) * 2, 1);
    const setList = this.chamber.setList(this._set);
    this.refreshFlows();
    for (let i = 0; i < PurifyChamber.SETSIZE * 2; i++) {
      pkmn = i % 2 === 1 || i >= points ? null : (setList[idiv(i, 2)] ?? null);
      let angle = 360 - idiv(i * 360, points);
      angle += 90; // start at 12 not 3 o'clock
      if (pkmn && this.chamber.get(this._set).facing === idiv(i, 2)) {
        this.directflow.setAngle(angle);
        this.directflow.setFlowStrength(this.chamber.get(this._set).shadowAffinity());
      }
      const point = calcPoint(306, 158, 96, angle);
      this.sprites[i + 1]!.x = Math.trunc(point[0]);
      this.sprites[i + 1]!.y = Math.trunc(point[1]);
      this.sprites[i + 1]!.z = 2;
      this.sprites[i + 1]!.pokemon = pkmn;
      this.checkCursor(i + 1);
    }
    const held = this.sprites[1 + PurifyChamber.SETSIZE * 2]!;
    held.pokemon = this._heldpkmn;
    held.visible = this.view.visible;
    held.x = this.view.x + idiv(this.view.bitmap!.width, 2);
    held.y = this.view.y + idiv(this.view.bitmap!.height, 2);
    held.z = 3;
  }

  getCurrent(): Pokemon | null {
    return PurifyChamberHelper.pbGetPokemon(this.chamber, this._cursor);
  }

  get visible(): boolean { return this._visible; }
  set visible(value: boolean) {
    this._visible = value;
    for (const sprite of this.sprites) sprite.visible = value;
    for (const flow of this.flows) flow.visible = value;
    this.directflow.visible = value;
    this.view.visible = value;
    this.info.visible = value;
  }

  get color(): Color { return this._color; }
  set color(value: Color) {
    this._color = value;
    for (const sprite of this.sprites) sprite.color = value.clone();
    for (const flow of this.flows) flow.color = value.clone();
    this.directflow.color = value.clone();
    this.view.color = value.clone();
    this.info.color = value.clone();
  }

  update(): void {
    for (const sprite of this.sprites) sprite?.update();
    for (const flow of this.flows) flow.update();
    this.directflow.update();
    this.view.update();
    this.info.update();
  }

  isDisposed(): boolean { return this.disposed; }

  dispose(): void {
    for (const sprite of this.sprites) sprite?.dispose();
    for (const flow of this.flows) flow.dispose();
    this.directflow.dispose();
    this.view.dispose();
    this.info.dispose();
    this.sprites.length = 0;
    this.disposed = true;
  }
}

//===============================================================================
//
//===============================================================================
export class PurifyChamberScene {
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private viewportmsg!: Viewport;
  private chamber!: PurifyChamber;
  private setOpen = false;
  /** Sets opened over an open one (see pbOpenSet), disposed in pbEnd. */
  private leaked: [Sprites, Viewport, Viewport][] = [];

  private get setview(): PurifyChamberSetView { return this.sprites.setview as PurifyChamberSetView; }
  private get setwindow(): Window_PurifyChamberSets { return this.sprites.setwindow as Window_PurifyChamberSets; }
  private get msgwindow(): Window_AdvancedTextPokemon { return this.sprites.msgwindow as Window_AdvancedTextPokemon; }

  pbUpdate(): void {
    pbUpdateSpriteHash(asHash(this.sprites));
  }

  pbRefresh(): void {
    if (this.sprites.setview) {
      this.setview.refresh();
      this.setwindow.refresh();
    }
  }

  pbStart(chamber: PurifyChamber): void {
    this.chamber = chamber;
  }

  pbEnd(): void {
    for (const [sprites, viewport, viewportmsg] of this.leaked) {
      pbDisposeSpriteHash(asHash(sprites));
      viewport.dispose();
      viewportmsg.dispose();
    }
    this.leaked = [];
  }

  async pbOpenSet(set: number): Promise<void> {
    await Promise.all([
      preloadBitmaps(["Graphics/Pictures/purifychamberbg"]),
      preloadPokemonIcons(this.chamber.sets.flatMap((s) => [s.shadow, ...s.list])),
    ]);
    // NOTE (Ruby parity): PurifyChamberScreen#pbOpenSetDetail purifies with
    // the set still open (022_UI_PurifyChamber.rb:541-545), and pbOpenSet (:1111)
    // replaces @sprites without disposing them: the old set view stays on
    // screen, under the new one and after it closes, until Ruby's GC frees
    // it. Here it goes when the scene ends (pbEnd).
    if (this.setOpen) this.leaked.push([this.sprites, this.viewport, this.viewportmsg]);
    this.setOpen = true;
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.viewportmsg = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewportmsg.z = 99999;
    addBackgroundOrColoredPlane(this.sprites, "bg", "purifychamberbg", new Color(64, 48, 96), this.viewport);
    this.sprites.setwindow = new Window_PurifyChamberSets(this.chamber, 0, 0, 112, Graphics.height, this.viewport);
    this.sprites.setview = new PurifyChamberSetView(this.chamber, set, this.viewport);
    const msgwindow = new Window_AdvancedTextPokemon("");
    this.sprites.msgwindow = msgwindow;
    msgwindow.viewport = this.viewportmsg;
    msgwindow.visible = false;
    this.setwindow.index = set;
    await pbDeactivateWindows(asHash(this.sprites));
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbCloseSet(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(asHash(this.sprites));
    this.viewport.dispose();
    this.viewportmsg.dispose();
    this.setOpen = false;
  }

  pbOpenSetDetail(set: number): void {
    this.setwindow.index = set;
    this.setview.set = set;
    this.setview.cursor = 0;
  }

  pbCloseSetDetail(): void {}

  pbPurify(): void {
    this.pbRefresh();
  }

  pbMove(_pos: number): void {
    this.setview.heldpkmn = this.setview.getCurrent();
    this.pbRefresh();
  }

  pbShift(_pos: number, _heldpoke: Pokemon | null): void {
    this.setview.heldpkmn = this.setview.getCurrent();
    this.pbRefresh();
  }

  pbPlace(_pos: number, _heldpoke: Pokemon | null): void {
    this.setview.heldpkmn = null;
    this.pbRefresh();
  }

  pbReplace(_pos: unknown, _storagePos: Selection): void {
    this.setview.heldpkmn = null;
    this.pbRefresh();
  }

  pbRotate(_facing: number): void {}

  pbWithdraw(_pos: number, _heldpoke: Pokemon | null): void {
    this.setview.heldpkmn = null;
    this.pbRefresh();
  }

  async pbDisplay(msg: string): Promise<void> {
    await UIHelper.pbDisplay(this.msgwindow, msg, false, () => this.pbUpdate());
  }

  async pbConfirm(msg: string): Promise<boolean> {
    return UIHelper.pbConfirm(this.msgwindow, msg, () => this.pbUpdate());
  }

  async pbShowCommands(msg: string, commands: string[]): Promise<number> {
    return UIHelper.pbShowCommands(this.msgwindow as unknown as Window_UnformattedTextPokemon, msg, commands, 0,
      () => this.pbUpdate());
  }

  /** [0, position] a position was chosen, [1, set] a new set was chosen, [3, 0] cancel. */
  async pbSetScreen(): Promise<[number, number]> {
    let ret: [number, number] = [3, 0];
    await pbDeactivateWindows(asHash(this.sprites), async () => {
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        let btn = 0;
        if (Input.repeat(Input.DOWN)) btn = Input.DOWN;
        if (Input.repeat(Input.UP)) btn = Input.UP;
        if (Input.repeat(Input.RIGHT)) btn = Input.RIGHT;
        if (Input.repeat(Input.LEFT)) btn = Input.LEFT;
        if (btn !== 0) {
          pbPlayCursorSE();
          this.setview.moveCursor(btn);
        }
        if (Input.repeat(Input.JUMPUP)) {
          const nextset = this.setview.set === 0 ? PurifyChamber.NUMSETS - 1 : this.setview.set - 1;
          pbPlayCursorSE();
          ret = [1, nextset];
          return;
        } else if (Input.repeat(Input.JUMPDOWN)) {
          const nextset = this.setview.set === PurifyChamber.NUMSETS - 1 ? 0 : this.setview.set + 1;
          pbPlayCursorSE();
          ret = [1, nextset];
          return;
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          ret = [0, this.setview.cursor];
          return;
        } else if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          ret = [3, 0];
          return;
        }
      }
    });
    return ret;
  }

  async pbChooseSet(): Promise<number> {
    let ret = -1;
    await pbActivateWindow(asHash(this.sprites), "setwindow", async () => {
      let oldindex = this.setwindow.index;
      for (;;) {
        if (oldindex !== this.setwindow.index) {
          oldindex = this.setwindow.index;
          this.setview.set = oldindex;
        }
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          ret = this.setwindow.index;
          return;
        }
        if (Input.trigger(Input.BACK)) {
          pbPlayCancelSE();
          ret = -1;
          return;
        }
      }
    });
    return ret;
  }

  async pbSwitch(set: number): Promise<number> {
    this.setwindow.switching = set;
    const ret = await this.pbChooseSet();
    this.setwindow.switching = -1;
    return ret < 0 ? set : ret;
  }

  async pbSummary(pos: number, heldpkmn: Pokemon | null): Promise<void> {
    if (heldpkmn) {
      const oldsprites = await pbFadeOutAndHide(asHash(this.sprites));
      const scene = new PokemonSummary_Scene();
      const screen = new PokemonSummaryScreen(scene);
      await screen.pbStartScreen([heldpkmn], 0);
      await pbFadeInAndShow(asHash(this.sprites), oldsprites);
      return;
    }
    const party: Pokemon[] = [];
    const indexes: number[] = [];
    let startindex = 0;
    const set = this.setview.set;
    // NOTE (Ruby parity): 022_UI_PurifyChamber.rb:1267 loops over setCount * 2
    // positions only, so with no regular Pokémon in the set the Shadow
    // Pokémon's Summary doesn't open.
    for (let i = 0; i < this.chamber.setCount(set) * 2; i++) {
      const p = PurifyChamberHelper.pbGetPokemon2(this.chamber, set, i);
      if (!p) continue;
      if (i === pos) startindex = party.length;
      party.push(p);
      indexes.push(i);
    }
    if (party.length === 0) return;
    const oldsprites = await pbFadeOutAndHide(asHash(this.sprites));
    const scene = new PokemonSummary_Scene();
    const screen = new PokemonSummaryScreen(scene);
    const selection = await screen.pbStartScreen(party, startindex);
    this.setview.cursor = indexes[selection]!;
    await pbFadeInAndShow(asHash(this.sprites), oldsprites);
  }

  pbPositionHint(pos: number): void {
    this.setview.cursor = pos;
    this.pbRefresh();
  }

  pbChangeSet(set: number): void {
    this.setview.set = set;
    this.setwindow.index = set;
    this.setwindow.refresh();
    this.pbRefresh();
  }

  async pbChoosePokemon(): Promise<Selection | null> {
    const visible = await pbFadeOutAndHide(asHash(this.sprites));
    const scene = new PokemonStorageScene();
    const screen = new PokemonStorageScreen(scene, G.storage as PokemonStorage);
    const pos = await screen.pbChoosePokemon();
    this.pbRefresh();
    await pbFadeInAndShow(asHash(this.sprites), visible);
    return pos;
  }
}
