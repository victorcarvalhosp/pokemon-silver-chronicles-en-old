// Port of 003_Game processing/003_Interpreter.rb + 004_Interpreter_Commands.rb.
//
// Event lists arrive as nested named commands; setup() compiles them into a
// flat instruction list with jump targets (cached per list), and the runner
// keeps Ruby's semantics: a command returning false waits until next frame,
// child interpreters run first, move-route and message waits block, and
// labels are found by scanning the whole list like command_119 does.

import type { AudioRef, Command, Condition, Expr, MoveRoute } from "../data/events";
import { Data, getMapData, hasMapData } from "../data/store";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { Color, Tone } from "../rgss/types";
import { player } from "./GameCharacter";
import type { GameEvent } from "./GameEvent";
import { switchIsOn } from "./GameEvent";
import type { GameMap } from "./GameMap";
import type { GamePlayer } from "./GamePlayer";
import { G, pbUpdateSceneMap } from "./globals";
import { messages } from "./messageBridge";
import { pbBGMFade, pbBGMPlay, pbBGSFade, pbBGSPlay, pbMEPlay, pbSEPlay, pbSEStop } from "./GameSystem";
import { evaluateAsync, runStatements, truthy, type ScriptContext } from "./scriptApi";
import { rand } from "../core/random";
import { pbGetTimeNow } from "./dayNight";
import { FRAME_RATE } from "./GameCharacter";

type Instr =
  | { op: "cmd"; c: Command }
  | { op: "if"; c: Command; elseAt: number }
  | { op: "choices"; c: Command; targets: number[]; cancelAt: number; endAt: number }
  | { op: "goto"; to: number }
  | { op: "label"; name: string }
  | { op: "comment"; c: Command }
  | { op: "end" };

const compiled = new WeakMap<Command[], Instr[]>();

export function compile(list: Command[]): Instr[] {
  const cached = compiled.get(list);
  if (cached) return cached;
  const out: Instr[] = [];
  const loops: number[][] = []; // pending break gotos per loop
  const emit = (cmds: Command[]) => {
    for (const c of cmds) {
      switch (c.cmd) {
        case "if": {
          const at = out.length;
          const instr: Instr = { op: "if", c, elseAt: -1 };
          out.push(instr);
          emit(c.then as Command[]);
          if (c.else) {
            const skip = { op: "goto" as const, to: -1 };
            out.push(skip);
            instr.elseAt = out.length;
            emit(c.else as Command[]);
            skip.to = out.length;
          } else {
            instr.elseAt = out.length;
          }
          void at;
          break;
        }
        case "choices": {
          const instr: Instr = { op: "choices", c, targets: [], cancelAt: -1, endAt: -1 };
          out.push(instr);
          const ends: { op: "goto"; to: number }[] = [];
          for (const branch of c.branches as Command[][]) {
            instr.targets.push(out.length);
            emit(branch);
            const g = { op: "goto" as const, to: -1 };
            out.push(g);
            ends.push(g);
          }
          if (c.cancelBranch) {
            instr.cancelAt = out.length;
            emit(c.cancelBranch as Command[]);
          }
          instr.endAt = out.length;
          for (const g of ends) g.to = out.length;
          break;
        }
        case "loop": {
          const start = out.length;
          loops.push([]);
          emit(c.body as Command[]);
          out.push({ op: "goto", to: start });
          for (const b of loops.pop()!) (out[b] as { to: number }).to = out.length;
          break;
        }
        case "breakLoop":
          if (loops.length) {
            loops[loops.length - 1]!.push(out.length);
            out.push({ op: "goto", to: -1 });
          } else {
            out.push({ op: "end" }); // Ruby: break outside a loop ends the event
          }
          break;
        case "label":
          out.push({ op: "label", name: c.name as string });
          break;
        case "comment":
          out.push({ op: "comment", c });
          break;
        case "exitEvent":
          out.push({ op: "end" });
          break;
        default:
          out.push({ op: "cmd", c });
      }
    }
  };
  emit(list);
  out.push({ op: "end" });
  compiled.set(list, out);
  return out;
}

export class Interpreter {
  mapId = 0;
  eventId = 0;
  private list: Instr[] | null = null;
  private source: Command[] | null = null;
  private index = 0;
  private messageWaiting = false;
  private moveRouteWaiting = false;
  private waitCount = 0;
  private child: Interpreter | null = null;
  private buttonInput = false;
  private hiddenChoices: boolean[] = [];
  private renamedChoices: (string | undefined)[] = [];
  private followerMoveRoute_ = false;
  private followerMoveRouteId: string | null = null;
  private followerAnimation_ = false;
  private followerAnimationId: string | null = null;

  constructor(private depth = 0, private main = false) {
    if (depth > 100) throw new Error("Common event call has exceeded maximum limit.");
  }

  clear(): void {
    this.mapId = 0;
    this.eventId = 0;
    this.messageWaiting = false;
    this.moveRouteWaiting = false;
    this.waitCount = 0;
    this.child = null;
    this.buttonInput = false;
    this.hiddenChoices = [];
    this.renamedChoices = [];
    this.endFollowerOverrides();
  }

  setup(list: Command[] | null, eventId: number, mapId?: number): void {
    this.clear();
    this.mapId = mapId ?? G.gameMap?.mapId ?? 0;
    this.eventId = eventId;
    this.source = list;
    this.list = list ? compile(list) : null;
    this.index = 0;
  }

  /**
   * Where the running list came from, so a save made mid-event resumes it
   * (Essentials marshals the interpreter with its command list).
   */
  saveState(): InterpreterState | null {
    if (!this.list || !this.source) return null;
    const ref = findListRef(this.source);
    if (!ref) return null;
    return {
      ref, index: this.index, eventId: this.eventId, mapId: this.mapId, waitCount: this.waitCount,
      moveRouteWaiting: this.moveRouteWaiting, child: this.child?.saveState() ?? null,
    };
  }

  loadState(state: InterpreterState | null): void {
    this.setup(null, 0);
    if (!state) return;
    const list = resolveListRef(state.ref);
    if (!list) return;
    this.setup(list, state.eventId, state.mapId);
    this.index = state.index;
    this.waitCount = state.waitCount;
    this.moveRouteWaiting = state.moveRouteWaiting;
    if (state.child) {
      this.child = new Interpreter(this.depth + 1);
      this.child.loadState(state.child);
    }
  }

  setupStartingEvent(): void {
    const map = G.gameMap as unknown as GameMap;
    if (map.needRefresh) map.refresh();
    if (G.gameTemp.commonEventId > 0) {
      this.setup(Data.commonEvents.get(G.gameTemp.commonEventId)?.list ?? null, 0);
      G.gameTemp.commonEventId = 0;
      return;
    }
    for (const event of map.events.values()) {
      if (!event.isStarting) continue;
      if ((event.trigger ?? 0) < 3) {
        event.lock();
        event.clearStarting();
      }
      this.setup(event.list, event.id, event.map.mapId);
      return;
    }
    for (const ce of Data.commonEvents.values()) {
      if (ce.trigger !== 1 || !G.gameSwitches.get(ce.switchId)) continue;
      this.setup(ce.list, 0);
      return;
    }
  }

  running(): boolean {
    return this.list != null;
  }

  async update(): Promise<void> {
    let loopCount = 0;
    for (;;) {
      loopCount += 1;
      if (loopCount > 100) {
        await Graphics.update(); // freeze prevention
        loopCount = 0;
      }
      const map = G.gameMap as unknown as GameMap;
      if (map.mapId !== this.mapId && !(G.mapFactory as unknown as { areConnected(a: number, b: number): boolean }).areConnected(map.mapId, this.mapId)) {
        this.eventId = 0;
      }
      if (this.child) {
        await this.child.update();
        if (!this.child.running()) this.child = null;
        if (this.child) return;
      }
      if (this.messageWaiting) return;
      if (this.moveRouteWaiting) {
        if (player().moveRouteForcing) return;
        for (const e of map.events.values()) if (e.moveRouteForcing) return;
        for (const [e] of G.gameTemp.followers?.eachFollower() ?? []) if (e.moveRouteForcing) return;
        this.moveRouteWaiting = false;
      }
      if (this.waitCount > 0) {
        this.waitCount -= 1;
        return;
      }
      if (G.gameTemp.menuCalling) return;
      if (!this.list) {
        if (this.main) this.setupStartingEvent();
        if (!this.list) return;
      }
      if ((await this.executeCommand()) === false) return;
      this.index += 1;
    }
  }

  // --- helpers used by commands and scripts ------------------------------------

  getCharacter(parameter = 0): GameEvent | GamePlayer | null {
    if (parameter === -1) return G.gamePlayer as unknown as GamePlayer;
    const events = (G.gameMap as unknown as GameMap).events;
    return events.get(parameter === 0 ? this.eventId : parameter) ?? null;
  }
  getPlayer() { return this.getCharacter(-1); }

  /** The next Set Move Route moves a follower instead (nil: the first one). */
  followerMoveRoute(id: string | null = null): void {
    this.followerMoveRoute_ = true;
    this.followerMoveRouteId = id;
  }

  /** The next Show Animation plays on a follower instead (nil: the first one). */
  followerAnimation(id: string | null = null): void {
    this.followerAnimation_ = true;
    this.followerAnimationId = id;
  }

  endFollowerOverrides(): void {
    this.followerMoveRoute_ = false;
    this.followerMoveRouteId = null;
    this.followerAnimation_ = false;
    this.followerAnimationId = null;
  }

  /** Followers.get(name) */
  private follower(name: string | null): GameEvent | null {
    const f = G.gameTemp.followers;
    return (name ? f?.getFollowerByName(name) : f?.getFollowerByIndex()) ?? null;
  }

  /** command_210: Wait for Move's Completion. */
  command210(): boolean {
    if (!G.gameTemp.inBattle) this.moveRouteWaiting = true;
    return true;
  }
  getSelf() { return this.getCharacter(0) as GameEvent | null; }
  getEvent(id: number) { return this.getCharacter(id); }

  private context(): ScriptContext {
    return { event: this.getSelf(), interpreter: this as unknown as ScriptContext["interpreter"] };
  }

  pbGlobalLock(): void {
    for (const e of (G.gameMap as unknown as GameMap).events.values()) e.minilock();
  }
  pbGlobalUnlock(): void {
    for (const e of (G.gameMap as unknown as GameMap).events.values()) e.unlock();
  }

  pbSetSelfSwitch(eventid: number, switchName: string, value: boolean, mapid = -1): void {
    if (mapid < 0) mapid = this.mapId;
    const old = G.gameSelfSwitches.get(mapid, eventid, switchName);
    G.gameSelfSwitches.set(mapid, eventid, switchName, value);
    const f = G.mapFactory as unknown as { hasMap(id: number): boolean; getMap(id: number, add: boolean): GameMap };
    if (value !== old && f.hasMap(mapid)) f.getMap(mapid, false).needRefresh = true;
  }

  tsOff(c: string): boolean { return this.getSelf()?.tsOff(c) ?? true; }
  tsOn(c: string): boolean { return this.getSelf()?.tsOn(c) ?? false; }
  isTempSwitchOff(c: string) { return this.tsOff(c); }
  isTempSwitchOn(c: string) { return this.tsOn(c); }
  setTempSwitchOn(c: string): void { this.getSelf()?.setTempSwitchOn(c); }
  setTempSwitchOff(c: string): void { this.getSelf()?.setTempSwitchOff(c); }

  getVariable(...arg: number[]): unknown {
    if (arg.length === 0) return G.pokemonGlobal.eventvars[`${this.mapId},${this.eventId}`];
    return G.gameVariables.get(arg[0]!);
  }
  setVariable(...arg: unknown[]): void {
    if (arg.length === 1) G.pokemonGlobal.eventvars[`${this.mapId},${this.eventId}`] = arg[0];
    else {
      G.gameVariables.set(arg[0] as number, arg[1]);
      (G.gameMap as unknown as GameMap).needRefresh = true;
    }
  }
  pbGet(id: number): unknown { return G.gameVariables.get(id); }
  pbSet(id: number, value: unknown): void {
    G.gameVariables.set(id, value);
    (G.gameMap as unknown as GameMap).needRefresh = true;
  }

  /** Records now as this event's time and turns its self switch A on (also for `others`). */
  pbSetEventTime(...others: number[]): void {
    const time = Math.floor(pbGetTimeNow().getTime() / 1000);
    this.pbSetSelfSwitch(this.eventId, "A", true);
    G.pokemonGlobal.eventvars[`${this.mapId},${this.eventId}`] = time;
    for (const other of others) {
      this.pbSetSelfSwitch(other, "A", true);
      G.pokemonGlobal.eventvars[`${this.mapId},${other}`] = time;
    }
  }

  pbEraseThisEvent(): boolean {
    const event = (G.gameMap as unknown as GameMap).events.get(this.eventId);
    if (event) {
      event.erase();
      (G as unknown as { pokemonMap?: { addErasedEvent(id: number): void } | null }).pokemonMap?.addErasedEvent(this.eventId);
    }
    this.index += 1;
    return true;
  }

  async pbCommonEvent(id: number): Promise<void> {
    const ce = Data.commonEvents.get(id);
    if (!ce) return;
    const interp = new Interpreter();
    interp.setup(ce.list, 0);
    do {
      await Graphics.update();
      Input.update();
      await interp.update();
      await pbUpdateSceneMap();
    } while (interp.running());
  }

  /** game/trainers/trainerEvents.ts replaces this with the full version (trainer type check, intro BGM). */
  pbTrainerIntro(_symbol: string): boolean {
    this.pbGlobalLock();
    return true;
  }

  pbTrainerEnd(): void {
    this.pbGlobalUnlock();
    this.getSelf()?.eraseRoute();
  }

  hideChoice(number: number, condition = true): void {
    this.hiddenChoices[number - 1] = condition;
  }

  renameChoice(number: number, newName: string, condition = true): void {
    if (!condition || !newName) return;
    this.renamedChoices[number - 1] = newName;
  }

  commandEnd(): void {
    this.list = null;
    if (this.main && this.eventId > 0) (G.gameMap as unknown as GameMap).events.get(this.eventId)?.unlock();
  }

  // --- execution ----------------------------------------------------------------

  private async executeCommand(): Promise<boolean> {
    const instr = this.list![this.index];
    if (!instr || instr.op === "end") {
      this.commandEnd();
      return true;
    }
    switch (instr.op) {
      case "goto":
        this.index = instr.to - 1;
        return true;
      case "label":
      case "comment":
        return true;
      case "if": {
        const result = await this.condition(instr.c.cond as Condition);
        if (!result) this.index = instr.elseAt - 1;
        return true;
      }
      case "choices":
        return this.commandChoices(instr, null);
      case "cmd":
        return this.command(instr.c);
    }
  }

  /** Next instruction index the way pbNextIndex skips labels/comments/jumps. */
  private nextIndex(index: number): number {
    let i = index + 1;
    for (let guard = 0; guard < 10000; guard++) {
      const ins = this.list![i];
      if (!ins) return i;
      if (ins.op === "label" || ins.op === "comment") i += 1;
      else if (ins.op === "goto") i = ins.to > i ? ins.to : i + 1;
      else return i;
    }
    return i;
  }

  private setupChoices(c: Command): { choices: string[]; cancel: number; map: number[] } {
    let choices = [...(c.choices as string[])];
    choices = choices.map((ch, i) => this.renamedChoices[i] ?? ch);
    this.renamedChoices = [];
    const map = choices.map((_, i) => i);
    const visible = choices.map((ch, i) => (this.hiddenChoices[i] ? null : [ch, i] as const)).filter((x) => x !== null);
    this.hiddenChoices = [];
    const cancelRaw = c.cancel as number | string;
    // Essentials' cmdIfCancel: 0 disallows cancelling, n > 0 returns n - 1 (the
    // "branch" option is choices.length + 1, i.e. returns choices.length).
    const cancel = cancelRaw === "disallow" ? 0 : cancelRaw === "branch" ? choices.length + 1 : (cancelRaw as number) + 1;
    void map;
    return {
      choices: visible.map((v) => v[0]),
      cancel,
      map: visible.map((v) => v[1]),
    };
  }

  /** Jumps to the branch for the chosen option (index into the visible list). */
  private takeChoice(instr: Extract<Instr, { op: "choices" }>, chosen: number, visibleMap: number[]): void {
    const choices = (instr.c.choices as string[]).length;
    let target: number;
    if (chosen >= 0 && chosen < visibleMap.length) target = instr.targets[visibleMap[chosen]!]!;
    else if (chosen === choices) target = instr.cancelAt >= 0 ? instr.cancelAt : instr.endAt;
    else target = instr.endAt;
    this.index = target - 1;
  }

  private async commandChoices(instr: Extract<Instr, { op: "choices" }>, message: string | null): Promise<boolean> {
    const { choices, cancel, map } = this.setupChoices(instr.c);
    this.messageWaiting = true;
    const chosen = message != null
      ? await messages().pbMessage(message, choices, cancel)
      : await messages().pbShowCommands(choices, cancel);
    this.messageWaiting = false;
    Input.update();
    this.takeChoice(instr, chosen, map);
    return true;
  }

  private async condition(cond: Condition): Promise<boolean> {
    if ("switch" in cond) return switchIsOn(cond.switch, this.getSelf() as GameEvent | null) === cond.value;
    if ("variable" in cond) {
      const v1 = Number(G.gameVariables.get(cond.variable));
      const v2 = typeof cond.value === "object" ? Number(G.gameVariables.get(cond.value.variable)) : cond.value;
      switch (cond.op) {
        case "==": return v1 === v2;
        case ">=": return v1 >= v2;
        case "<=": return v1 <= v2;
        case ">": return v1 > v2;
        case "<": return v1 < v2;
        case "!=": return v1 !== v2;
      }
      return false;
    }
    if ("selfSwitch" in cond) {
      if (this.eventId <= 0) return false;
      const map = G.gameMap as unknown as GameMap;
      return G.gameSelfSwitches.get(map.mapId, this.eventId, cond.selfSwitch) === cond.value;
    }
    if ("timer" in cond) {
      if (!G.gameSystem.timerWorking) return false;
      const sec = Math.floor(G.gameSystem.timer);
      return cond.timer === ">=" ? sec >= cond.seconds : sec <= cond.seconds;
    }
    if ("character" in cond) {
      const ch = this.getCharacter(cond.character);
      return !!ch && ch.direction === cond.direction;
    }
    if ("gold" in cond) {
      const gold = G.player?.money ?? 0;
      return cond.gold === ">=" ? gold >= cond.value : gold <= cond.value;
    }
    if ("button" in cond) return Input.press(cond.button);
    if ("script" in cond) return truthy(await evaluateAsync(cond.script, this.context()));
    if ("ruby" in cond) return truthy(await evaluateAsync({ ruby: cond.ruby }, this.context()));
    return false;
  }

  private async command(c: Command): Promise<boolean> {
    const map = G.gameMap as unknown as GameMap;
    const t = G.gameTemp;
    switch (c.cmd) {
      case "text": {
        if (t.messageWindowShowing) return false;
        let message = c.text as string;
        const nextAt = this.nextIndex(this.index);
        const next = this.list![nextAt];
        if (next?.op === "cmd" && next.c.cmd === "text") message += "\x01";
        if (next?.op === "choices") {
          this.index = nextAt;
          return this.commandChoices(next, message);
        }
        if (next?.op === "cmd" && next.c.cmd === "inputNumber") {
          this.index = nextAt;
          const variable = next.c.variable as number;
          this.messageWaiting = true;
          const value = await messages().pbMessageChooseNumber(message, { maxDigits: next.c.digits as number, defaultValue: Number(G.gameVariables.get(variable)) });
          G.gameVariables.set(variable, value);
          map.needRefresh = true;
          this.messageWaiting = false;
          return true;
        }
        this.messageWaiting = true;
        await messages().pbMessage(message);
        this.messageWaiting = false;
        return true;
      }
      case "inputNumber": {
        this.messageWaiting = true;
        const variable = c.variable as number;
        const value = await messages().pbMessageChooseNumber(null, { maxDigits: c.digits as number, defaultValue: Number(G.gameVariables.get(variable)) });
        G.gameVariables.set(variable, value);
        map.needRefresh = true;
        this.messageWaiting = false;
        return true;
      }
      case "textOptions":
        if (t.messageWindowShowing) return false;
        G.gameSystem.messagePosition = c.position as number;
        G.gameSystem.messageFrame = c.frame as number;
        return true;
      case "buttonInput": {
        if (this.buttonInput) return false;
        this.buttonInput = true;
        await this.pbButtonInputProcessing(c.variable as number);
        this.buttonInput = false;
        this.index += 1;
        return true;
      }
      case "wait":
        this.waitCount = Math.round((c.seconds as number) * FRAME_RATE);
        return true;
      case "eraseEvent":
        if (this.eventId > 0) map.events.get(this.eventId)?.erase();
        this.index += 1;
        return false;
      case "commonEvent": {
        const ce = Data.commonEvents.get(c.id as number);
        if (ce) {
          this.child = new Interpreter(this.depth + 1);
          this.child.setup(ce.list, this.eventId);
        }
        return true;
      }
      case "jump": {
        const at = this.list!.findIndex((i) => i.op === "label" && i.name === c.label);
        if (at >= 0) this.index = at;
        return true;
      }
      case "switches": {
        let refresh = false;
        for (let i = c.from as number; i <= (c.to as number); i++) {
          if (G.gameSwitches.get(i) === c.value) continue;
          G.gameSwitches.set(i, c.value as boolean);
          refresh = true;
        }
        if (refresh) map.needRefresh = true;
        return true;
      }
      case "variables":
        this.controlVariables(c);
        return true;
      case "selfSwitch": {
        if (this.eventId > 0) {
          if (G.gameSelfSwitches.get(map.mapId, this.eventId, c.ch as string) !== c.value) {
            G.gameSelfSwitches.set(map.mapId, this.eventId, c.ch as string, c.value as boolean);
            map.needRefresh = true;
          }
        }
        return true;
      }
      case "timerStart":
        G.gameSystem.timerWorking = true;
        G.gameSystem.timer = c.seconds as number;
        return true;
      case "timerStop":
        G.gameSystem.timerWorking = false;
        return true;
      case "gold": {
        let v = this.operand(c.value);
        if (c.op === "sub") v = -v;
        if (G.player) G.player.money += v;
        return true;
      }
      case "saveAccess": G.gameSystem.saveDisabled = !c.enabled; return true;
      case "menuAccess": G.gameSystem.menuDisabled = !c.enabled; return true;
      case "encounters":
        G.gameSystem.encounterDisabled = !c.enabled;
        (player() as unknown as GamePlayer).makeEncounterCount();
        return true;
      case "transfer": {
        if (t.inBattle) return true;
        if (t.playerTransferring || t.messageWindowShowing || t.transitionProcessing) return false;
        t.playerTransferring = true;
        if (c.map !== undefined) {
          t.playerNewMapId = c.map as number;
          t.playerNewX = c.x as number;
          t.playerNewY = c.y as number;
        } else {
          t.playerNewMapId = Number(G.gameVariables.get(c.mapVariable as number));
          t.playerNewX = Number(G.gameVariables.get(c.xVariable as number));
          t.playerNewY = Number(G.gameVariables.get(c.yVariable as number));
        }
        t.playerNewDirection = c.direction as number;
        this.index += 1;
        if (c.fade) {
          Graphics.freeze();
          t.transitionProcessing = true;
          t.transitionName = "";
        }
        return false;
      }
      case "setEventLocation": {
        if (t.inBattle) return true;
        const ch = this.getCharacter(c.event as number);
        if (!ch) return true;
        if (c.x !== undefined) ch.moveto(c.x as number, c.y as number);
        else if (c.xVariable !== undefined) ch.moveto(Number(G.gameVariables.get(c.xVariable as number)), Number(G.gameVariables.get(c.yVariable as number)));
        else {
          const other = this.getCharacter(c.swapWith as number);
          if (other) {
            const ox = ch.x, oy = ch.y;
            ch.moveto(other.x, other.y);
            other.moveto(ox, oy);
          }
        }
        switch (c.direction) {
          case 2: ch.turnDown(); break;
          case 4: ch.turnLeft(); break;
          case 6: ch.turnRight(); break;
          case 8: ch.turnUp(); break;
        }
        return true;
      }
      case "scrollMap":
        if (t.inBattle) return true;
        if (map.scrolling()) return false;
        map.startScroll(c.direction as number, c.distance as number, c.speed as number);
        return true;
      case "mapSettings": {
        const p = c.parameters as unknown[];
        if (c.type === "panorama") {
          map.panoramaName = p[0] as string;
          map.panoramaHue = p[1] as number;
        } else if (c.type === "fog") {
          [map.fogName, map.fogHue, map.fogOpacity, map.fogBlendType, map.fogZoom, map.fogSx, map.fogSy] = p as [string, number, number, number, number, number, number];
        } else {
          map.battlebackName = p[0] as string;
          t.battlebackName = p[0] as string;
        }
        return true;
      }
      case "fogTone":
        map.startFogToneChange(Tone.fromArray(c.tone as number[]), c.seconds as number);
        return true;
      case "fogOpacity":
        map.startFogOpacityChange(c.opacity as number, c.seconds as number);
        return true;
      case "showAnimation": {
        let ch: GameEvent | GamePlayer | null = this.getCharacter(c.character as number);
        if (this.followerAnimation_) {
          ch = this.follower(this.followerAnimationId);
          this.followerAnimation_ = false;
          this.followerAnimationId = null;
        }
        if (ch) ch.animationId = c.animation as number;
        return true;
      }
      case "transparent":
        player().transparent = c.value as boolean;
        return true;
      case "moveRoute": {
        let ch: GameEvent | GamePlayer | null = this.getCharacter(c.character as number);
        if (this.followerMoveRoute_) {
          ch = this.follower(this.followerMoveRouteId);
          this.followerMoveRoute_ = false;
          this.followerMoveRouteId = null;
        }
        if (ch) ch.forceMoveRoute(c.route as MoveRoute);
        return true;
      }
      case "waitForMoveCompletion":
        if (!t.inBattle) this.moveRouteWaiting = true;
        return true;
      case "prepareTransition":
        if (t.messageWindowShowing) return false;
        Graphics.freeze();
        return true;
      case "executeTransition":
        if (t.transitionProcessing) return false;
        t.transitionProcessing = true;
        t.transitionName = c.name as string;
        this.index += 1;
        return false;
      case "screenTone":
        G.gameScreen.startToneChange(Tone.fromArray(c.tone as number[]), c.seconds as number);
        return true;
      case "screenFlash":
        G.gameScreen.startFlash(Color.fromArray(c.color as number[]), c.seconds as number);
        return true;
      case "screenShake":
        G.gameScreen.startShake(c.power as number, c.speed as number, c.seconds as number);
        return true;
      case "showPicture":
      case "movePicture": {
        const num = (c.id as number) + (t.inBattle ? 50 : 0);
        const x = c.x !== undefined ? (c.x as number) : Number(G.gameVariables.get(c.xVariable as number));
        const y = c.y !== undefined ? (c.y as number) : Number(G.gameVariables.get(c.yVariable as number));
        const origin = c.origin === "center" ? 1 : 0;
        const pic = G.gameScreen.pictures[num]!;
        if (c.cmd === "showPicture") pic.show(c.name as string, origin, x, y, c.zoomX as number, c.zoomY as number, c.opacity as number, c.blendType as number);
        else pic.move(c.seconds as number, origin, x, y, c.zoomX as number, c.zoomY as number, c.opacity as number, c.blendType as number);
        return true;
      }
      case "rotatePicture":
        G.gameScreen.pictures[(c.id as number) + (t.inBattle ? 50 : 0)]!.rotate(c.speed as number);
        return true;
      case "pictureTone":
        G.gameScreen.pictures[(c.id as number) + (t.inBattle ? 50 : 0)]!.startToneChange(Tone.fromArray(c.tone as number[]), c.seconds as number);
        return true;
      case "erasePicture":
        G.gameScreen.pictures[(c.id as number) + (t.inBattle ? 50 : 0)]!.erase();
        return true;
      case "weather":
        G.gameScreen.weather(c.type as number, c.power as number, c.seconds as number);
        return true;
      case "playBgm": pbBGMPlay(c.audio as AudioRef); return true;
      case "fadeOutBgm": pbBGMFade(c.seconds as number); return true;
      case "playBgs": pbBGSPlay(c.audio as AudioRef); return true;
      case "fadeOutBgs": pbBGSFade(c.seconds as number); return true;
      case "memorizeBgmBgs":
        G.gameSystem.bgmMemorize();
        G.gameSystem.bgsMemorize();
        return true;
      case "restoreBgmBgs":
        G.gameSystem.bgmRestore();
        G.gameSystem.bgsRestore();
        return true;
      case "playMe": pbMEPlay(c.audio as AudioRef); return true;
      case "playSe": pbSEPlay(c.audio as AudioRef); return true;
      case "stopSe": pbSEStop(); return true;
      case "callMenu":
        t.menuCalling = true;
        this.index += 1;
        return false;
      case "returnToTitle":
        t.titleScreenCalling = true;
        return false;
      case "windowskin":
      case "battleBgm":
      case "battleEndMe":
      case "callSave":
        // command_352: PokemonSaveScreen#pbSaveScreen
        await evaluateAsync({ call: "pbSaveScreen" }, this.context());
        return true;
      case "recoverAll":
      case "gameOver":
        // TODO(M4): windowskin change, battle BGM, party heal, game over.
        console.warn(`Event command ${c.cmd} isn't ported yet`);
        return true;
      case "call":
      case "assign":
        await runStatements([c], this.context());
        return true;
      case "script":
        await evaluateAsync({ ruby: c.ruby as string }, this.context());
        return true;
      default:
        console.warn(`Unknown event command ${c.cmd}`, c);
        return true;
    }
  }

  private operand(v: unknown): number {
    return typeof v === "object" && v && "variable" in v ? Number(G.gameVariables.get((v as { variable: number }).variable)) : Number(v);
  }

  private controlVariables(c: Command): void {
    const map = G.gameMap as unknown as GameMap;
    const v = c.value as number | Record<string, unknown>;
    let value = 0;
    if (typeof v === "number") value = v;
    else if ("variable" in v) value = Number(G.gameVariables.get(v.variable as number));
    else if ("random" in v) {
      const [lo, hi] = v.random as [number, number];
      value = lo + rand(hi - lo + 1);
    } else if ("character" in v) {
      const ch = this.getCharacter(v.character as number);
      if (ch) {
        switch (v.property) {
          case "x": value = ch.x; break;
          case "y": value = ch.y; break;
          case "direction": value = ch.direction; break;
          case "screenX": value = ch.screenX(); break;
          case "screenY": value = ch.screenY(); break;
          case "terrainTag": value = ch.terrainTag().idNumber; break;
        }
      }
    } else if ("other" in v) {
      switch (v.other) {
        case "mapId": value = map.mapId; break;
        case "partySize": value = ((G.player as unknown as { pokemonParty?: unknown[] }).pokemonParty ?? []).length; break;
        case "gold": value = G.player?.money ?? 0; break;
        case "playTime": value = Math.floor(Graphics.frameCount / FRAME_RATE); break;
        case "timer": value = Math.floor(G.gameSystem.timer); break;
        case "saveCount": value = G.gameSystem.saveCount; break;
      }
    }
    for (let i = c.from as number; i <= (c.to as number); i++) {
      let cur = Number(G.gameVariables.get(i));
      switch (c.op) {
        case "set": if (cur === value) continue; cur = value; break;
        case "add": if (cur >= 99_999_999) continue; cur += value; break;
        case "sub": if (cur <= -99_999_999) continue; cur -= value; break;
        case "mul": if (value === 1) continue; cur *= value; break;
        case "div": if (value === 0 || value === 1) continue; cur = Math.floor(cur / value); break;
        case "mod": if (value === 0 || value === 1) continue; cur %= value; break;
      }
      G.gameVariables.set(i, Math.max(-99_999_999, Math.min(99_999_999, cur)));
      map.needRefresh = true;
    }
  }

  async pbButtonInputProcessing(variableNumber = 0, timeoutSeconds = 0): Promise<number> {
    let ret = 0;
    let timer = Math.round(timeoutSeconds * FRAME_RATE);
    for (;;) {
      await Graphics.update();
      Input.update();
      await pbUpdateSceneMap();
      for (let i = 1; i <= 18; i++) if (Input.trigger(i)) ret = i;
      if (ret !== 0) break;
      if (timeoutSeconds > 0 && --timer <= 0) break;
    }
    Input.update();
    if (variableNumber > 0) {
      G.gameVariables.set(variableNumber, ret);
      (G.gameMap as unknown as GameMap).needRefresh = true;
    }
    return ret;
  }
}

export type ListRef = { map: number; event: number; page: number } | { common: number };

export interface InterpreterState {
  ref: ListRef;
  index: number;
  eventId: number;
  mapId: number;
  waitCount: number;
  moveRouteWaiting: boolean;
  child: InterpreterState | null;
}

/** Finds which event page or common event a command list belongs to. */
function findListRef(list: Command[]): ListRef | null {
  for (const [id, ce] of Data.commonEvents) if (ce.list === list) return { common: id };
  const maps = (G.mapFactory as unknown as { maps?: GameMap[] } | null)?.maps ?? [];
  for (const m of maps) {
    for (const ev of m.map.events) {
      const page = ev.pages.findIndex((p) => p.list === list);
      if (page >= 0) return { map: m.mapId, event: ev.id, page };
    }
  }
  return null;
}

function resolveListRef(ref: ListRef): Command[] | null {
  if ("common" in ref) return Data.commonEvents.get(ref.common)?.list ?? null;
  if (!hasMapData(ref.map)) return null;
  return getMapData(ref.map).events.find((e) => e.id === ref.event)?.pages[ref.page]?.list ?? null;
}

/** pbMapInterpreter */
export function pbMapInterpreter(): Interpreter {
  return G.gameSystem.mapInterpreter as unknown as Interpreter;
}

export type { Expr };
