// Port of 004_Game classes/008_Game_Event.rb and 010_Game_CommonEvent.rb.

import type { Command } from "../data/events";
import { Data } from "../data/store";
import type { EventPage, MapEvent } from "../data/types";
import { GameCharacter, TILE_HEIGHT, TILE_WIDTH, player } from "./GameCharacter";
import type { GameMap } from "./GameMap";
import { G } from "./globals";
import { Interpreter } from "./Interpreter";
import { evaluate } from "./scriptApi";
import { pbGetTimeNow } from "./dayNight";

const SCREEN_W = 512;
const SCREEN_H = 384;

/** Evaluates switch `id`, running "s:" script switches in `self`'s context. */
export function switchIsOn(id: number, self: GameEvent | null): boolean {
  const name = Data.system.switches[id];
  if (!name) return false;
  const script = Data.system.scriptSwitches[id];
  if (script !== undefined) return !!evaluate(script, { event: self, interpreter: null });
  return G.gameSwitches.get(id);
}

export class GameEvent extends GameCharacter {
  readonly mapId: number;
  readonly event: MapEvent;
  trigger: number | null = null;
  list: Command[] | null = null;
  tempSwitches: Record<string, boolean> = {};
  needRefresh = false;
  private page: EventPage | null = null;
  private erased = false;
  private routeErased = false;
  private toUpdate = true;
  private interpreter: Interpreter | null = null;

  constructor(mapId: number, event: MapEvent, map: GameMap | null = null) {
    super(map);
    this.mapId = mapId;
    this.event = event;
    this.id = event.id;
    this.originalX = event.x;
    this.originalY = event.y;
    const size = /size\((\d+),(\d+)\)/i.exec(event.name);
    if (size) {
      this.width = Number(size[1]);
      this.height = Number(size[2]);
    }
    this.through = true;
    if (map) this.moveto(event.x, event.y);
    this.refresh();
  }

  get name(): string { return this.event.name; }
  get isStarting(): boolean { return this.starting; }

  setStarting(): void { this.starting = true; }
  clearStarting(): void { this.starting = false; }
  start(): void {
    if ((this.list?.length ?? 0) > 0) this.starting = true;
  }

  erase(): void {
    this.erased = true;
    this.refresh();
  }

  eraseRoute(): void {
    this.routeErased = true;
    this.refresh();
  }

  tsOn(c: string): boolean { return this.tempSwitches[c] === true; }
  tsOff(c: string): boolean { return !this.tempSwitches[c]; }
  setTempSwitchOn(c: string): void {
    this.tempSwitches[c] = true;
    this.refresh();
  }
  setTempSwitchOff(c: string): void {
    this.tempSwitches[c] = false;
    this.refresh();
  }
  isOff(c: string): boolean {
    return !G.gameSelfSwitches.get(this.mapId, this.event.id, c);
  }

  variable(): unknown {
    return G.pokemonGlobal.eventvars[`${this.mapId},${this.event.id}`];
  }
  setVariable(v: unknown): void {
    G.pokemonGlobal.eventvars[`${this.mapId},${this.event.id}`] = v;
  }

  expired(secs = 86_400): boolean {
    const ontime = this.variable() as number | undefined;
    const time = Math.floor(pbGetTimeNow().getTime() / 1000);
    return ontime != null && time > ontime + secs;
  }

  expiredDays(days = 1): boolean {
    const ontime = Number(this.variable() ?? 0);
    const now = pbGetTimeNow();
    const t = Math.floor(now.getTime() / 1000);
    let elapsed = Math.floor((t - ontime) / 86_400);
    if ((t - ontime) % 86_400 > now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) elapsed += 1;
    return elapsed >= days;
  }

  cooledDown(seconds: number): boolean {
    if (this.expired(seconds) && this.tsOff("A")) return true;
    this.needRefresh = true;
    return false;
  }

  cooledDownDays(days: number): boolean {
    if (this.expiredDays(days) && this.tsOff("A")) return true;
    this.needRefresh = true;
    return false;
  }

  onEvent(): boolean {
    const p = player();
    return this.mapId === (G.gameMap?.mapId ?? 0) && this.atCoordinate(p.x, p.y);
  }

  overTrigger(): boolean {
    if (this.characterName !== "" && !this.through) return false;
    if (/hiddenitem/i.test(this.event.name)) return false;
    for (const [i, j] of this.eachOccupiedTile()) if (this.map.passable(i, j, 0, player())) return true;
    return false;
  }

  override checkEventTriggerAfterTurning(): void {
    if (G.gameSystem.mapInterpreter.running() || this.starting) return;
    if (this.trigger !== 2) return;
    const m = /(?:sight|trainer)\((\d+)\)/i.exec(this.event.name);
    if (!m) return;
    if (!eventCanReachPlayer(this, player(), Number(m[1]))) return;
    if (this.jumping() || this.overTrigger()) return;
    this.start();
  }

  override checkEventTriggerTouch(dir: number): boolean {
    if (G.gameSystem.mapInterpreter.running()) return false;
    if (this.trigger !== 2) return false;
    const p = player();
    if (dir === 2 && p.y !== this.y + 1) return false;
    if (dir === 4 && p.x !== this.x - 1) return false;
    if (dir === 6 && p.x !== this.x + this.width) return false;
    if (dir === 8 && p.y !== this.y - this.height) return false;
    if (!this.inLineWithCoordinate(p.x, p.y)) return false;
    if (this.jumping() || this.overTrigger()) return false;
    this.start();
    return true;
  }

  checkEventTriggerAuto(): void {
    const p = player();
    if (this.trigger === 2) {
      if (this.atCoordinate(p.x, p.y) && !this.jumping() && this.overTrigger()) this.start();
    } else if (this.trigger === 3) {
      this.start();
    }
  }

  refresh(): void {
    let newPage: EventPage | null = null;
    if (!this.erased) {
      for (const page of [...this.event.pages].reverse()) {
        const c = page.condition;
        if (c.switch1 != null && !switchIsOn(c.switch1, this)) continue;
        if (c.switch2 != null && !switchIsOn(c.switch2, this)) continue;
        if (c.variable && Number(G.gameVariables.get(c.variable.id)) < c.variable.atLeast) continue;
        if (c.selfSwitch && G.gameSelfSwitches.get(this.mapId, this.event.id, c.selfSwitch) !== true) continue;
        newPage = page;
        break;
      }
    }
    if (newPage === this.page) return;
    this.page = newPage;
    this.clearStarting();
    if (!newPage) {
      this.tileId = 0;
      this.characterName = "";
      this.characterHue = 0;
      this.moveType = 0;
      this.through = true;
      this.trigger = null;
      this.list = null;
      this.interpreter = null;
      return;
    }
    const g = newPage.graphic;
    this.tileId = g.tileId;
    this.characterName = g.characterName;
    this.characterHue = g.characterHue;
    if (this.originalDirection !== g.direction) {
      this.direction = g.direction;
      this.originalDirection = this.direction;
      this.prelockDirection = 0;
    }
    if (this.originalPattern !== g.pattern) {
      this.pattern = g.pattern;
      this.originalPattern = this.pattern;
    }
    this.opacity = g.opacity;
    this.blendType = g.blendType;
    this.moveType = newPage.moveType;
    this.moveSpeed = newPage.moveSpeed;
    this.moveFrequency = newPage.moveFrequency;
    this.moveRoute = this.routeErased ? { repeat: true, skippable: false, list: [] } : newPage.moveRoute;
    this.moveRouteIndex = 0;
    this.moveRouteForcing = false;
    this.walkAnime = newPage.walkAnime;
    this.stepAnime = newPage.stepAnime;
    this.directionFix = newPage.directionFix;
    this.through = newPage.through;
    this.alwaysOnTop = newPage.alwaysOnTop;
    this.calculateBushDepth();
    this.trigger = newPage.trigger;
    this.list = newPage.list;
    this.interpreter = this.trigger === 4 ? new Interpreter() : null;
    this.checkEventTriggerAuto();
  }

  shouldUpdate(recalc = false): boolean {
    if (!recalc) return this.toUpdate;
    if (this.trigger === 3 || this.trigger === 4) return true;
    if (this.moveRouteForcing || this.movetoHappened) return true;
    if (/update/i.test(this.event.name)) return true;
    const range = 2;
    if (this.screenX() - this.spriteSize[0] / 2 > SCREEN_W + range * TILE_WIDTH) return false;
    if (this.screenX() + this.spriteSize[0] / 2 < -range * TILE_WIDTH) return false;
    if (this.screenYGround() - this.spriteSize[1] > SCREEN_H + range * TILE_HEIGHT) return false;
    if (this.screenYGround() < -range * TILE_HEIGHT) return false;
    return true;
  }

  override async update(): Promise<void> {
    this.toUpdate = this.shouldUpdate(true);
    if (!this.toUpdate) return;
    this.movetoHappened = false;
    const lastMoving = this.moving();
    super.update();
    if (!this.moving() && lastMoving) {
      (player() as unknown as { pbCheckEventTriggerFromDistance(t: number[]): boolean }).pbCheckEventTriggerFromDistance([2]);
    }
    if (this.needRefresh) {
      this.needRefresh = false;
      this.refresh();
    }
    this.checkEventTriggerAuto();
    if (this.interpreter) {
      if (!this.interpreter.running()) this.interpreter.setup(this.list, this.event.id, this.mapId);
      await this.interpreter.update();
    }
  }
}

export class GameCommonEvent {
  private interpreter: Interpreter | null = null;

  constructor(readonly commonEventId: number) {
    this.refresh();
  }

  get data() { return Data.commonEvents.get(this.commonEventId)!; }
  get trigger(): number { return this.data.trigger; }
  get switchId(): number { return this.data.switchId; }
  get list(): Command[] { return this.data.list; }

  refresh(): void {
    if (this.trigger === 2 && switchIsOn(this.switchId, null)) {
      this.interpreter ??= new Interpreter();
    } else {
      this.interpreter = null;
    }
  }

  async update(): Promise<void> {
    if (!this.interpreter) return;
    if (!this.interpreter.running()) this.interpreter.setup(this.list, 0);
    await this.interpreter.update();
  }
}

/** pbEventFacesPlayer? (012_Overworld/001_Overworld.rb). */
export function pbEventFacesPlayer(event: GameCharacter, p: GameCharacter, distance: number): boolean {
  if (distance <= 0) return false;
  let xMin: number, xMax: number, yMin: number, yMax: number;
  switch (event.direction) {
    case 2: xMin = event.x; xMax = event.x + event.width - 1; yMin = event.y + 1; yMax = event.y + distance; break;
    case 4: xMin = event.x - distance; xMax = event.x - 1; yMin = event.y - event.height + 1; yMax = event.y; break;
    case 6: xMin = event.x + event.width; xMax = event.x + event.width - 1 + distance; yMin = event.y - event.height + 1; yMax = event.y; break;
    case 8: xMin = event.x; xMax = event.x + event.width - 1; yMin = event.y - event.height + 1 - distance; yMax = event.y - event.height; break;
    default: return false;
  }
  return p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax;
}

/** pbEventCanReachPlayer? (012_Overworld/001_Overworld.rb). */
export function eventCanReachPlayer(event: GameCharacter, p: GameCharacter, distance: number): boolean {
  if (!pbEventFacesPlayer(event, p, distance)) return false;
  const deltaX = event.direction === 6 ? 1 : event.direction === 4 ? -1 : 0;
  const deltaY = event.direction === 2 ? 1 : event.direction === 8 ? -1 : 0;
  let realDistance = 0;
  switch (event.direction) {
    case 2: realDistance = p.y - event.y - 1; break;
    case 4: realDistance = event.x - p.x - 1; break;
    case 6: realDistance = p.x - event.x - event.width; break;
    case 8: realDistance = event.y - event.height - p.y; break;
  }
  for (let i = 0; i < realDistance; i++) {
    if (!event.canMoveFromCoordinate(event.x + i * deltaX, event.y + i * deltaY, event.direction)) return false;
  }
  return true;
}
