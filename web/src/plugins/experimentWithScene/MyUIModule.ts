// Port of Plugins/ExperimentWithScene/MyUI Module.rb: the MyUI module, a
// trimmed copy of Elite Battle: DX's EliteBattle module that stores camera
// vectors, plus the :CAMERA_MOTION vectors the file adds at load.
//
// Vector data is [x, y, angle, scale, zoom1, zoom2]; add_vector appends the
// trailing 1. The failsafe modules at the end of the file (EnvironmentEBDX,
// TerrainEBDX, BattleScripts) are empty and nothing reads them.

import { DEBUG } from "../../core/debug";

export type VectorData = number[];
type Stored = VectorData | (VectorData | number)[];

const state = {
  // variables for storing system data
  vectors: new Map<string, Stored>(),
  nextVectors: [] as VectorData[],
  // slight transition gimmick
  tviewport: null as unknown,
};

/** Console.echo_li */
const echoLi = (msg: string): void => {
  if (DEBUG) console.info(msg);
};

/** Array#clone: a shallow copy. */
const clone = <T>(a: T[]): T[] => [...a];

export const MyUI = {
  /** stores vector data */
  addVector(key: string, ...args: (VectorData | number)[]): void {
    if (key === "CAMERA") {
      const list: VectorData[] = [];
      for (const v of args as VectorData[]) {
        v.push(1);
        list.push(v);
      }
      state.vectors.set(key, list);
      return;
    }
    // NOTE (Ruby parity): only :CAMERA's vectors get their trailing 1; for
    // :CAMERA_MOTION (below) the 1 is appended to the list of vectors itself.
    args.push(1);
    state.vectors.set(key, args);
  },

  /**
   * returns vector data. NOTE (Ruby parity): once :PLAYER is stored (by
   * MyUI::Scene#pbStartScene) every key returns it (MyUI Module.rb:46).
   */
  getVector(key: string, _cond: unknown = null): VectorData {
    echoLi(`Arrived on get_vector ${key}`);
    if (state.vectors.has("PLAYER")) {
      echoLi("Arrived on has key :PLAYER");
      return clone(state.vectors.get("PLAYER") as VectorData);
    }
    // ORDER IS X,Y,SCALE,ANGLE - Don't know the last one yet I think it's Z-index
    if (!state.vectors.has(key)) return [102, 408, 32, 342, 1, 1];
    echoLi("ARRIVED ON FINAL RETURN");
    return clone(state.vectors.get(key) as VectorData);
  },

  /** store random motion vectors */
  nextVector(...args: unknown[]): void {
    for (const vec of args) {
      if (Array.isArray(vec) && vec.length > 5) state.nextVectors.push(vec as VectorData);
    }
  },

  /** gets random camera vector motion */
  randomVector(battle: unknown, last: number | null): (VectorData | number)[] {
    // failsafe
    const motion = state.vectors.get("CAMERA_MOTION");
    if (!Array.isArray(motion) || motion.length === 0) {
      return clone(MyUI.getVector("MAIN", battle));
    }
    const a: (VectorData | number)[] = state.nextVectors.length > 0 ? clone(state.nextVectors) : clone(motion);
    a.push(MyUI.getVector("MAIN", battle));
    if (last != null && last < a.length && last >= -a.length) a.splice(last, 1); // delete_at(last)
    return a;
  },

  /**
   * internally parses action to valid symbolic name: the name if MyUI has
   * that instance variable (eval("defined?(@#{var})")), else nil.
   */
  parse(v: unknown): string | null {
    if (typeof v !== "string") return null;
    return v in state ? v : null;
  },

  /** gets value of specified varaible */
  get(v: unknown): unknown {
    const name = MyUI.parse(v);
    if (name == null) return null;
    return state[name as keyof typeof state];
  },
};

MyUI.addVector("CAMERA_MOTION",
  [132, 408, 24, 302, 1],
  [122, 294, 20, 322, 1],
  [238, 304, 26, 322, 1],
  [0, 384, 26, 322, 1],
  [198, 298, 18, 282, 1],
  [196, 306, 26, 242, 0.6],
  [156, 280, 18, 226, 0.6],
  [60, 280, 12, 388, 1],
  [160, 286, 16, 340, 1],
);
