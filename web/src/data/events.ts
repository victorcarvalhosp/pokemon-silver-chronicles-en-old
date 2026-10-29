// Event command JSON written by tools/convert/events.rb.

export type Expr =
  | number
  | string
  | boolean
  | null
  | Expr[]
  | { call: string; on?: Expr; args?: Expr[] }
  | { op: string; left: Expr; right: Expr }
  | { op: "!"; value: Expr };

export interface AudioRef {
  name: string;
  volume: number;
  pitch: number;
}

export type Condition =
  | { switch: number; value: boolean }
  | { variable: number; op: string; value: number | { variable: number } }
  | { selfSwitch: string; value: boolean }
  | { timer: ">=" | "<="; seconds: number }
  | { character: number; direction: number }
  | { gold: ">=" | "<="; value: number }
  | { button: number }
  | { script: Expr }
  | { ruby: string }
  | { raw: unknown[] };

export type MoveCommand =
  | { move: "jump"; x: number; y: number }
  | { move: "wait"; seconds: number }
  | { move: "switchOn" | "switchOff"; id: number }
  | { move: "speed" | "frequency" | "opacity" | "blendType"; value: number }
  | { move: "graphic"; characterName: string; characterHue: number; direction: number; pattern: number }
  | { move: "playSe"; audio: AudioRef }
  | { move: "script"; do?: Command[]; ruby?: string }
  | { move: "raw"; code: number; parameters: unknown[] }
  | { move: string };

export interface MoveRoute {
  repeat: boolean;
  skippable: boolean;
  list: MoveCommand[];
}

/** One event command. Fields depend on `cmd`; see tools/convert/events.rb. */
export interface Command {
  cmd: string;
  [field: string]: unknown;
}

export interface CommonEvent {
  id: number;
  name: string;
  /** 0 none, 1 autorun, 2 parallel */
  trigger: number;
  switchId: number;
  list: Command[];
}
