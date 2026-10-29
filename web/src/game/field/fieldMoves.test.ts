// The field moves and fishing against the game's own Ruby
// (fieldMovesReference.json, written by web/tools/ruby-ref/field_moves_reference.rb,
// which runs 004_Overworld_FieldMoves.rb, 005_Overworld_Fishing.rb, Improved
// Field Skills, Whilrpool HM.rb and the wild encounter code headless).
// Both sides stub the same screens (pbMessage, pbConfirmMessage,
// pbMessageDisplay, the hidden move animation, pbEncounter) and replay the
// same random numbers (rand(n) = raw % n) and button presses (by seconds into
// each wait).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { _INTL as intl } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { terrainTag } from "../../data/gameData/terrainTag";
import ref from "./fieldMovesReference.json";

//===============================================================================
// Scripted randomness, screens and engine
//===============================================================================
const rolls: number[] = [];
const used: number[] = [];
let scripting = false;
let seed = 1;
const setupRand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return n > 0 ? seed % n : seed / 2147483648; };
vi.mock("../../core/random", () => ({
  rand: (n: number) => {
    if (!scripting) return setupRand(n);
    if (rolls.length === 0) throw new Error("out of scripted rolls");
    const raw = rolls.shift()!;
    used.push(raw);
    return raw % n;
  },
  random: () => 0.5,
  seedRandom: () => {},
}));

type LogEntry = unknown[];
let log: LogEntry[] = [];
let answers: boolean[] = [];
let encounterResults: boolean[] = [];

vi.mock("../../ui/messageConfig", () => ({ _INTL: (s: string, ...a: unknown[]) => intl(s, ...a) }));
vi.mock("../../ui/messages", () => ({
  pbMessage: async (text: string) => { log.push(["msg", text]); return 0; },
  pbConfirmMessage: async (text: string) => {
    const ret = answers.length > 0 ? answers.shift()! : false;
    log.push(["confirm", text, ret]);
    return ret;
  },
  pbMessageDisplay: async (_w: unknown, text: string, letterbyletter = true) => {
    log.push(["display", text, letterbyletter]);
    return null;
  },
}));
vi.mock("../../ui/speechBubble", () => ({ pbCreateMessageWindow: () => ({}), pbDisposeMessageWindow: () => {} }));
vi.mock("../../ui/fades", () => ({ pbFadeOutIn: async (b?: () => unknown) => b?.() }));
vi.mock("../../ui/planes", () => ({ pbGetMapNameFromId: (id: number) => `MAP${id}` }));
vi.mock("../../ui/scenes/frames", () => ({ pbWait: async () => {} }));
vi.mock("../../rgss/display", () => ({ Viewport: class {}, Sprite: class {} }));
vi.mock("../../ui/bag/itemUtilities", () => ({ pbItemRestoreHP: () => 0 }));

// Fishing's waits: frames per phase, and button presses scripted by seconds.
let phase = "other";
let phaseFrame = 0;
const phaseIndex: Record<string, number> = {};
let phaseFrames: Record<string, number> = {};
let press: { phase: string; index: number; seconds: number } | null = null;
vi.mock("../../rgss/Graphics", () => ({
  Graphics: {
    width: 512, height: 384, frameCount: 0,
    update: async () => { phaseFrame += 1; phaseFrames[phase] = (phaseFrames[phase] ?? 0) + 1; },
  },
}));
vi.mock("../../rgss/Input", () => ({
  Input: {
    USE: 13, BACK: 12,
    update: () => {},
    trigger: (b: number) => {
      if (b !== 13 && b !== 12) return false;
      if (!press || press.phase !== phase || press.index !== (phaseIndex[phase] ?? 0)) return false;
      return phaseFrame / 60 >= press.seconds;
    },
  },
}));

vi.mock("./hiddenMoveAnimation", () => ({
  pbHiddenMoveAnimation: async (pkmn: { name: string } | null) => {
    log.push(["animation", pkmn ? pkmn.name : null]);
    return pkmn != null;
  },
}));
vi.mock("./bicycle", () => ({ pbDismountBike: async () => {}, pbMountBike: async () => {} }));
vi.mock("./overworld", () => ({ pbJumpToward: async () => true, pbJumpTowardStart: () => true, pbWaitWhileJumping: async () => {} }));
vi.mock("../GamePlayer", () => ({ pbCancelVehicles: () => {}, pbOnStepTaken: async () => {}, pbUpdateVehicle: () => {} }));
vi.mock("../GameSystem", () => ({ pbSEPlay: () => {}, pbBGMPlay: () => {} }));
vi.mock("../mapAudio", () => ({ pbCueBGM: () => {} }));
vi.mock("../scripts/moveRoute", () => ({ pbMoveRoute: () => {}, PBMoveRoute: {} }));
vi.mock("../encounters/PokemonEncounters", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../encounters/PokemonEncounters")>()),
  pbEncounter: async (encType: Id, onlySingle = true) => {
    const ret = encounterResults.length > 0 ? encounterResults.shift()! : true;
    log.push(["encounter", encType, onlySingle, ret]);
    return ret;
  },
}));

const { G, GameTemp, PokemonGlobalMetadata } = await import("../globals");
const { setMetadata } = await import("../metadata");
const { PokemonMapMetadata } = await import("../PokemonMapMetadata");
const { Pokemon } = await import("../pokemon/Pokemon");
const { GameStats } = await import("../trainer/GameStats");
const { Player } = await import("../trainer/Player");
const { PokemonEncounters, setPokemonEncounters } = await import("../encounters/PokemonEncounters");
const H = await import("./HiddenMoveHandlers");
const FM = await import("./FieldMoves");
const { pbWhirlpool } = await import("./Whirlpool");
const Fishing = await import("./Fishing");
const { FieldActions } = await import("../../ui/menus/menuScreens");
const { hasFieldSkill } = await import("../../ui/party/fieldSkills");
// What game/field/index.ts registers for the party screen
FieldActions.hasHiddenMoveHandler = (move) => H.HiddenMoveHandlers.hasHandler(move);
FieldActions.badgeFromSkill = (skill) => H.pbBadgeFromSkill(skill);
FieldActions.checkHiddenMoveBadge = (badge, showmsg) => H.checkBadge(badge, new H.CanUseContext(showmsg));
FieldActions.canUseHiddenMove = (pkmn, move, showmsg) => H.pbCanUseHiddenMoveSync(pkmn as never, move, showmsg);

//===============================================================================
// World setup (field_moves_reference.rb's setup_world)
//===============================================================================
type Spec = [Id, number, Id[]?, number?];
interface World {
  party?: Spec[]; badges?: number; map?: number; passable?: boolean; trainerId?: number;
  facingEvent?: [number, string, number, number] | null; terrain?: string; facingTerrain?: string; surfaceTerrain?: string;
  canTransfer?: boolean; global?: Record<string, unknown>; strengthUsed?: boolean; answers?: boolean[]; encounters?: boolean[];
  rolls?: number[]; press?: typeof press; direction?: number; x?: number; y?: number;
}

/** GameData::TerrainTag.get(:Name) */
const TAG_NUMBERS = new Map(Array.from({ length: 20 }, (_, n) => [terrainTag(n).id, n] as const));
const tag = (id: string | undefined) => terrainTag(TAG_NUMBERS.get(id ?? "None") ?? 0);

function setupWorld(w: World): void {
  log = [];
  answers = [...(w.answers ?? [])];
  encounterResults = [...(w.encounters ?? [])];
  rolls.length = 0;
  rolls.push(...(w.rolls ?? []));
  used.length = 0;
  scripting = false;
  G.gameTemp = new GameTemp();
  const p = new Player("Gold", GameData.TrainerType.keys()[0]!);
  p.id = w.trainerId ?? 12345678;
  p.badges = Array.from({ length: 8 }, (_, i) => i < (w.badges ?? 0));
  for (const [species, level, moves, abilityIndex] of w.party ?? [["PIKACHU", 20]]) {
    const pkmn = new Pokemon(species, level, p as never);
    if (moves) {
      pkmn.forgetAllMoves();
      for (const m of moves) pkmn.learnMove(m);
    }
    if (abilityIndex != null) pkmn.abilityIndex = abilityIndex;
    pkmn.ability = null;
    p.party.push(pkmn);
  }
  G.player = p as never;
  G.stats = new GameStats();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  Object.assign(G.pokemonGlobal, w.global ?? {});
  const pm = new PokemonMapMetadata();
  pm.strengthUsed = !!w.strengthUsed;
  (G as unknown as { pokemonMap: unknown }).pokemonMap = pm;
  G.gameSystem = { encounterDisabled: false } as never;
  const mapId = w.map ?? 139;
  G.gameMap = {
    mapId, events: new Map(),
    passable: () => (w.passable ?? true),
    terrainTag: () => tag(w.terrain),
  } as never;
  G.mapFactory = { getTerrainTag: () => tag(w.surfaceTerrain) } as never;
  const ev = w.facingEvent;
  const facing = ev ? { id: ev[0], name: ev[1], x: ev[2], y: ev[3] } : null;
  G.gamePlayer = {
    x: w.x ?? 10, y: w.y ?? 10, direction: w.direction ?? 8, pattern: 0, lockPattern: false,
    canMapTransferWithFollower: () => w.canTransfer ?? true,
    canRideVehicleWithFollower: () => w.canTransfer ?? true,
    pbTerrainTag: () => tag(w.terrain),
    terrainTag: () => tag(w.terrain),
    pbFacingTerrainTag: () => tag(w.facingTerrain),
    pbFacingEvent: () => facing,
    setMovementType: (type: string) => { log.push(["movementType", type]); },
    straighten: () => {},
  } as never;
  G.scene = {
    spriteset: () => ({ addUserAnimation: (...a: unknown[]) => { log.push(["userAnimation", ...a]); } }),
  } as never;
  const enc = new PokemonEncounters();
  enc.setup(mapId);
  setPokemonEncounters(enc);
  phase = "other";
  phaseFrame = 0;
  phaseFrames = {};
  for (const k of Object.keys(phaseIndex)) delete phaseIndex[k];
  press = w.press ?? null;
}

const party = () => (G.player as unknown as InstanceType<typeof Player>).party;

beforeAll(() => {
  loadGameDataForTests();
  const pbs = resolve(import.meta.dirname, "../../../data/pbs");
  setMetadata({
    maps: JSON.parse(readFileSync(resolve(pbs, "map-metadata.json"), "utf8")) as unknown,
    players: JSON.parse(readFileSync(resolve(pbs, "player-metadata.json"), "utf8")) as unknown,
    metadata: JSON.parse(readFileSync(resolve(pbs, "metadata.json"), "utf8")) as unknown,
  });
  // pbAscendWaterfall is stubbed in the Ruby harness too
  FM.FieldMoves.pbAscendWaterfall = async () => { log.push(["ascendWaterfall"]); };
  // Fishing's waits are tracked by phase, as the Ruby harness's aliases do
  const enter = (ph: string) => {
    if (ph !== "other") phaseIndex[ph] = (phaseIndex[ph] ?? 0) + 1;
    phase = ph;
    phaseFrame = 0;
  };
  const waitMessage = Fishing.pbWaitMessage;
  const waitForInput = Fishing.pbWaitForInput;
  Fishing.setFishingWaitHooks({
    waitMessage: async (w, t) => { enter("dots"); const r = await waitMessage(w, t); enter("other"); return r; },
    waitForInput: async (w, m, f) => { enter("bite"); const r = await waitForInput(w, m, f); enter("other"); return r; },
  });
});

const R = ref as unknown as {
  eligibility: { world: World; move: Id; can: boolean; canLog: LogEntry[]; confirm: boolean | null; confirmLog: LogEntry[] }[];
  handlers: [Id, boolean, number][];
  fieldSkills: { party: Spec[]; badges: number; hasFieldSkill: boolean[]; withMove: (number | null)[] }[];
  entry: { fn: string; world: World; ret: unknown; log: LogEntry[]; rolls: number[]; strengthUsed: boolean; stats: Record<string, number> }[];
  headbutt: { x: number; y: number; trainerId: number; roll: number; encounter: boolean; log: LogEntry[]; battles: number }[];
  rockSmash: { world: World; log: LogEntry[]; rolls: number[]; battles: number }[];
  fishing: { rod: number; hasEncounter: boolean; world: World; ret: boolean; log: LogEntry[]; rolls: number[]; ability: string;
    seconds: Record<string, number>; fishingCount: number }[];
};

function statsOf(): Record<string, number> {
  const s = G.stats;
  return {
    cut: s.cutCount, headbutt: s.headbuttCount, headbuttBattles: s.headbuttBattles,
    rockSmash: s.rockSmashCount, rockSmashBattles: s.rockSmashBattles, fishing: s.fishingCount,
  };
}

//===============================================================================
describe("field moves (004_Overworld_FieldMoves.rb)", () => {
  it("has the same handlers and badges as Improved Field Skills sees", () => {
    for (const [move, has, badge] of R.handlers) {
      expect(H.HiddenMoveHandlers.hasHandler(move), move).toBe(has);
      expect(H.pbBadgeFromSkill(move), move).toBe(badge);
    }
  });

  it("decides who can use which field move, with the same messages (pbCanUseHiddenMove?, pbConfirmUseHiddenMove)", async () => {
    for (const c of R.eligibility) {
      setupWorld({ ...c.world, party: [["PIKACHU", 30, [c.move]]] });
      const pkmn = party()[0]!;
      scripting = true;
      const can = await H.pbCanUseHiddenMove(pkmn, c.move, true);
      const where = `${c.move} ${(c.world as { name?: string }).name}`;
      expect(can, where).toBe(c.can);
      expect(log, where).toEqual(c.canLog);
      expect(H.pbCanUseHiddenMoveSync(pkmn, c.move, false), `${where} (no message)`).toBe(c.can);
      log = [];
      answers = [true];
      const confirm = can ? await H.pbConfirmUseHiddenMove(pkmn, c.move) : null;
      expect(confirm, where).toBe(c.confirm);
      expect(log, where).toEqual(c.confirmLog);
    }
  });

  it("finds field skills like Improved Field Skills (has_field_skill?, get_pokemon_with_move)", () => {
    for (const c of R.fieldSkills) {
      setupWorld({ party: c.party, badges: c.badges });
      const where = `${JSON.stringify(c.party)} with ${c.badges} badges`;
      expect(party().map((p) => hasFieldSkill(p)), where).toEqual(c.hasFieldSkill);
      const moves = ["CUT", "FLY", "SURF", "STRENGTH", "ROCKSMASH", "FLASH", "HEADBUTT", "TELEPORT", "DIG", "SWEETSCENT"];
      expect(moves.map((m) => {
        const p = (G.player as unknown as InstanceType<typeof Player>).getPokemonWithMove(m);
        return p ? party().indexOf(p) : null;
      }), where).toEqual(c.withMove);
    }
  });

  it("runs the events' entry points like the Ruby (pbCut, pbRockSmash, pbStrength, pbWhirlpool, pbWaterfall, pbHeadbutt)", async () => {
    const fns: Record<string, () => Promise<unknown>> = {
      pbCut: () => FM.pbCut(), pbRockSmash: () => FM.pbRockSmash(), pbStrength: () => FM.pbStrength(),
      pbWhirlpool: () => pbWhirlpool(), pbWaterfall: () => FM.FieldMoves.pbWaterfall(), pbHeadbutt: () => FM.FieldMoves.pbHeadbutt(),
    };
    for (const c of R.entry) {
      setupWorld(c.world);
      scripting = true;
      const ret = await fns[c.fn]!();
      scripting = false;
      const where = `${c.fn} ${JSON.stringify(c.world.party)} badges ${c.world.badges} answers ${c.world.answers}`;
      expect(ret, where).toBe(c.ret);
      expect(log, where).toEqual(c.log);
      expect(used, where).toEqual(c.rolls);
      expect((G as unknown as { pokemonMap: { strengthUsed: boolean } }).pokemonMap.strengthUsed, where).toBe(c.strengthUsed);
      expect(statsOf(), where).toEqual(c.stats);
    }
  });

  it("rolls Headbutt encounters from the tree's position and the trainer ID (pbHeadbuttEffect)", async () => {
    for (const c of R.headbutt) {
      setupWorld({ trainerId: c.trainerId, rolls: [c.roll], encounters: [c.encounter] });
      scripting = true;
      await FM.pbHeadbuttEffect({ id: 9, name: "HeadbuttTree", x: c.x, y: c.y } as never);
      scripting = false;
      const where = `tree at ${c.x},${c.y}, ID ${c.trainerId}, roll ${c.roll}`;
      expect(log, where).toEqual(c.log);
      expect(G.stats.headbuttBattles, where).toBe(c.battles);
    }
  });

  it("rolls Rock Smash encounters on this game's tables (pbRockSmashRandomEncounter)", async () => {
    for (const c of R.rockSmash) {
      setupWorld(c.world);
      scripting = true;
      await FM.pbRockSmashRandomEncounter();
      scripting = false;
      expect(log, `map ${c.world.map}`).toEqual(c.log);
      expect(used, `map ${c.world.map}`).toEqual(c.rolls);
      expect(G.stats.rockSmashBattles).toBe(c.battles);
    }
  });
});

describe("fishing (005_Overworld_Fishing.rb)", () => {
  it("bites, hooks and times its waits like pbFishing", async () => {
    for (const c of R.fishing) {
      setupWorld(c.world);
      if (c.world.party?.[0]?.[0] === "OCTILLERY") party()[0]!.abilityIndex = 0;
      expect(party()[0]!.abilityId === "SUCTIONCUPS", "speedup ability").toBe(c.ability === "SUCTIONCUPS");
      scripting = true;
      const ret = await Fishing.pbFishing(c.hasEncounter, c.rod);
      scripting = false;
      const where = `rod ${c.rod}, ${c.ability}, encounter ${c.hasEncounter}, press ${JSON.stringify(c.world.press)}, rolls ${c.rolls}`;
      expect(ret, where).toBe(c.ret);
      expect(log, where).toEqual(c.log);
      expect(used, where).toEqual(c.rolls);
      expect(G.stats.fishingCount, where).toBe(c.fishingCount);
      // Same durations in seconds (40 fps there, 60 Hz here): within one original frame.
      const seconds = Object.fromEntries(Object.entries(phaseFrames).map(([k, v]) => [k, v / 60]));
      expect(Object.keys(seconds).sort(), where).toEqual(Object.keys(c.seconds).sort());
      for (const [k, v] of Object.entries(c.seconds)) expect(Math.abs(seconds[k]! - v), `${where}: ${k} ${seconds[k]} vs ${v}`).toBeLessThanOrEqual(1 / 40 + 1e-9);
    }
  });
});
