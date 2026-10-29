// The overworld item handlers (Item_Effects.ts + the itemUtilities.ts
// helpers) against the game's own Ruby (fieldItemsReference.json, written by
// web/tools/ruby-ref/field_items_reference.rb, which runs 002_Item_Effects.rb,
// 001_Item_Utilities.rb and the v20.1 Hotfixes' pbChangeLevel headless).
// Each scenario carries its setup; this file builds the same state, stubs the
// same screens (the party screen, pbMessage/pbConfirmMessage,
// pbTopRightWindow, the evolution scene, the map and the player) and compares
// messages, return values and the resulting Pokémon/Bag/overworld state.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { terrainTag } from "../../data/gameData/terrainTag";
import { G, GameSelfSwitches, GameTemp, GameVariables, PokemonGlobalMetadata } from "../globals";
import { setMetadata } from "../metadata";
import { PokemonMapMetadata } from "../PokemonMapMetadata";
import { Pokemon } from "../pokemon/Pokemon";
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";
import { ItemHandlers } from "./ItemHandlers";
import { repelCounterStep, setFieldItemWaitHook } from "./Item_Effects";
import {
  type ItemEffectScene, pbChangeExp, pbChangeLevel, pbJustRaiseEffortValues, pbMaxUsesOfEVRaisingItem,
  pbRaiseEffortValues, setItemEvolutionSceneHook, setMessageHook, setTopRightWindowHook,
} from "./itemUtilities";
import { PokemonBag } from "./PokemonBag";
import ref from "./fieldItemsReference.json";

interface PokemonSpec {
  species: Id; level: number; form?: number; gender?: number; nature?: Id; natureForStats?: Id;
  abilityIndex?: number; item?: Id; happiness?: number; obtainMap?: number; pokeBall?: Id;
  ev?: Record<Id, number>; moves?: [Id, number?, number?][]; hp?: number; hpLoss?: number; status?: Id;
}

interface Setup {
  name: string;
  action: [string, ...unknown[]];
  party?: PokemonSpec[];
  target?: number;
  bag?: [Id, number][];
  global?: { repel?: number; escapePoint?: number[]; bicycle?: boolean; surfing?: boolean; diving?: boolean };
  map?: { mapId?: number; passable?: boolean; events?: [number, string, number, number, boolean][] };
  player: { x?: number; y?: number; direction?: number; canTransfer?: boolean; terrainNumber: number; facingTerrainNumber: number };
  coins?: number;
  answers?: { confirm?: boolean[]; move?: number[]; command?: number[]; pokemon?: number[] };
}

const scenarios = ref as unknown as { setup: Setup; result: unknown }[];

type LogEntry = unknown[];
let log: LogEntry[] = [];
let answers: Required<NonNullable<Setup["answers"]>>;

function nextAnswer<K extends keyof typeof answers>(kind: K, dflt: (typeof answers)[K][number]): (typeof answers)[K][number] {
  const list = answers[kind];
  return list.length > 0 ? list.shift()! : dflt;
}

/** field_items_reference.rb's PokemonPartyScreen stub. */
class StubPartyScreen implements ItemEffectScene {
  scene = { pbSetHelpText: (text: string) => { log.push(["helpText", text]); } };
  async pbDisplay(text: string): Promise<void> { log.push(["display", text]); }
  async pbConfirm(text: string): Promise<boolean> {
    const ret = nextAnswer("confirm", false);
    log.push(["sceneConfirm", text, ret]);
    return ret;
  }
  pbRefresh(): void { log.push(["refresh"]); }
  pbHardRefresh(): void { log.push(["hardRefresh"]); }
  pbUpdate(): void {}
  async pbChooseMove(_pkmn: Pokemon, helptext: string): Promise<number> {
    const ret = nextAnswer("move", 0);
    log.push(["chooseMove", helptext, ret]);
    return ret;
  }
  async pbShowCommands(helptext: string, commands: string[], index = 0): Promise<number> {
    const ret = nextAnswer("command", -1);
    log.push(["commands", helptext, commands, index, ret]);
    return ret;
  }
  async pbChoosePokemon(helptext: string | null = null): Promise<number> {
    const ret = nextAnswer("pokemon", -1);
    log.push(["choosePokemon", helptext, ret]);
    return ret;
  }
  pbRefreshAnnotations(ableProc: (pkmn: Pokemon) => boolean): void {
    log.push(["refreshAnnotations", player().party.map((p) => !!ableProc(p))]);
  }
  pbClearAnnotations(): void {}
}

/** field_items_reference.rb's StubPlayer. */
class StubPlayer {
  x = 10; y = 10; direction = 2; canTransfer = true; terrain = 0; facingTerrain = 0;
  canMapTransferWithFollower() { return this.canTransfer; }
  canRideVehicleWithFollower() { return this.canTransfer; }
  pbTerrainTag() { return terrainTag(this.terrain); }
  terrainTag() { return terrainTag(this.terrain); }
  pbFacingTerrainTag() { return terrainTag(this.facingTerrain); }
  turnDown() { this.direction = 2; }
  turnLeft() { this.direction = 4; }
  turnRight() { this.direction = 6; }
  turnUp() { this.direction = 8; }
  turnRight90() {
    switch (this.direction) {
      case 2: this.turnLeft(); break;
      case 4: this.turnUp(); break;
      case 6: this.turnDown(); break;
      case 8: this.turnRight(); break;
    }
  }
}

const player = () => G.player as unknown as Player;

beforeAll(() => {
  loadGameDataForTests();
  const pbs = resolve(import.meta.dirname, "../../../data/pbs");
  setMetadata({ maps: JSON.parse(readFileSync(resolve(pbs, "map-metadata.json"), "utf8")) as unknown });
  G.gameVariables = new GameVariables();
  setMessageHook(
    async (text) => { log.push(["msg", text]); return 0; },
    async (text) => {
      const ret = nextAnswer("confirm", false);
      log.push(["confirmMsg", text, ret]);
      return ret;
    },
  );
  setTopRightWindowHook(async (text) => { log.push(["topRight", text]); });
  setItemEvolutionSceneHook(async (pkmn, newSpecies, canCancel, after) => {
    log.push(["evolution", pkmn.species, newSpecies, canCancel]);
    await after();
  });
  setFieldItemWaitHook(async () => {});
});

function buildPokemon(spec: PokemonSpec): Pokemon {
  const pkmn = new Pokemon(spec.species, spec.level, player() as never);
  if (spec.form != null) pkmn.formSimple = spec.form;
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  for (const [k, v] of Object.entries(spec.ev ?? {})) pkmn.ev[k] = v;
  pkmn.nature = spec.nature ?? "HARDY";
  if (spec.natureForStats) pkmn.natureForStats = spec.natureForStats;
  if (spec.gender != null) pkmn.gender = spec.gender;
  pkmn.abilityIndex = spec.abilityIndex ?? 0;
  pkmn.ability = null;
  pkmn.item = spec.item ?? null;
  pkmn.happiness = spec.happiness ?? 70;
  pkmn.obtainMap = spec.obtainMap ?? 0;
  pkmn.pokeBall = spec.pokeBall ?? "POKEBALL";
  if (spec.moves) {
    pkmn.forgetAllMoves();
    spec.moves.forEach(([id, pp, ppup], i) => {
      pkmn.learnMove(id);
      if (ppup != null) pkmn.moves[i]!.ppup = ppup;
      if (pp != null) pkmn.moves[i]!.pp = pp;
    });
  }
  pkmn.calcStats();
  if (spec.hp != null) pkmn.hp = spec.hp;
  if (spec.hpLoss) pkmn.hp = pkmn.totalhp - spec.hpLoss;
  if (spec.status) pkmn.status = spec.status;
  return pkmn;
}

function pokemonState(pkmn: Pokemon) {
  return {
    species: pkmn.species, form: pkmn.form, level: pkmn.level, exp: pkmn.exp,
    hp: pkmn.hp, totalhp: pkmn.totalhp, attack: pkmn.attack, defense: pkmn.defense, spatk: pkmn.spatk,
    spdef: pkmn.spdef, speed: pkmn.speed, status: pkmn.status,
    ev: Object.fromEntries(GameData.Stat.eachMain().map((s) => [s.id, pkmn.ev[s.id]])),
    happiness: pkmn.happiness,
    moves: pkmn.moves.map((m) => [m.id, m.pp, m.ppup, m.totalPp]),
    natureForStats: pkmn.natureForStats?.id ?? null, ability: pkmn.ability?.id ?? null, abilityIndex: pkmn.abilityIndex,
    fused: pkmn.fused?.species ?? null,
  };
}

async function run(sc: Setup): Promise<unknown> {
  log = [];
  answers = {
    confirm: [...(sc.answers?.confirm ?? [])], move: [...(sc.answers?.move ?? [])],
    command: [...(sc.answers?.command ?? [])], pokemon: [...(sc.answers?.pokemon ?? [])],
  };
  G.gameTemp = new GameTemp();
  const p = new Player("Gold", GameData.TrainerType.keys()[0]!);
  p.id = 12345678;
  if (sc.coins != null) p.coins = sc.coins;
  G.player = p as never;
  G.bag = new PokemonBag();
  for (const [item, qty] of sc.bag ?? []) G.bag.add(item, qty);
  G.stats = new GameStats();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  Object.assign(G.pokemonGlobal, sc.global ?? {});
  (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap = new PokemonMapMetadata();
  G.gameSelfSwitches = new GameSelfSwitches();
  const m = sc.map ?? {};
  const mapId = m.mapId ?? 5;
  const events = new Map<number, unknown>();
  for (const [id, name, x, y, selfA] of m.events ?? []) {
    events.set(id, { id, name, x, y });
    if (selfA) G.gameSelfSwitches.set(mapId, id, "A", true);
  }
  const passable = m.passable ?? true;
  G.gameMap = { mapId, events, passable: () => passable, autoplay() {}, refresh() {} } as never;
  const gp = new StubPlayer();
  gp.x = sc.player.x ?? 10;
  gp.y = sc.player.y ?? 10;
  gp.direction = sc.player.direction ?? 2;
  gp.canTransfer = sc.player.canTransfer ?? true;
  gp.terrain = sc.player.terrainNumber;
  gp.facingTerrain = sc.player.facingTerrainNumber;
  G.gamePlayer = gp as never;
  const party = (sc.party ?? [{ species: "PIKACHU", level: 20 }]).map(buildPokemon);
  for (const pkmn of party) p.party.push(pkmn);
  const pkmn = party[sc.target ?? 0]!;
  const scene = new StubPartyScreen();
  const [kind, item, qty, ...rest] = sc.action as [string, Id, unknown, ...unknown[]];
  let ret: unknown;
  switch (kind) {
    case "UseOnPokemon": ret = await ItemHandlers.triggerUseOnPokemon(item, qty as number, pkmn, scene); break;
    case "UseOnPokemonMaximum":
      ret = [ItemHandlers.UseOnPokemonMaximum.trigger(item, pkmn), ItemHandlers.triggerUseOnPokemonMaximum(item, pkmn)];
      break;
    case "UseFromBag": ret = await ItemHandlers.triggerUseFromBag(item); break;
    case "ConfirmUseInField": ret = await ItemHandlers.triggerConfirmUseInField(item); break;
    case "UseInField": ret = await ItemHandlers.triggerUseInField(item); break;
    case "UseText": ret = ItemHandlers.getUseText(item); break;
    case "repelStep": {
      const after = repelCounterStep();
      if (after) await after();
      ret = null;
      break;
    }
    case "helper":
      switch (item) {
        case "pbRaiseEffortValues": ret = pbRaiseEffortValues(pkmn, qty as Id, rest[0] as number, rest[1] as boolean); break;
        case "pbJustRaiseEffortValues": ret = pbJustRaiseEffortValues(pkmn, qty as Id, rest[0] as number); break;
        case "pbMaxUsesOfEVRaisingItem": ret = pbMaxUsesOfEVRaisingItem(qty as Id, rest[0] as number, pkmn, rest[1] as boolean); break;
        case "pbChangeLevel": await pbChangeLevel(pkmn, qty as number, scene); ret = null; break;
        case "pbChangeExp": await pbChangeExp(pkmn, qty as number, scene); ret = null; break;
      }
      break;
  }
  return {
    ret: ret ?? null, log,
    party: p.party.map(pokemonState),
    bag: G.bag.pockets.flatMap((pocket) => (pocket ?? []).map((slot) => [slot[0], slot[1]])),
    repel: G.pokemonGlobal.repel ?? 0, escapePoint: G.pokemonGlobal.escapePoint,
    stats: { repelCount: G.stats.repelCount, itemfinderCount: G.stats.itemfinderCount },
    flutes: [
      (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap.blackFluteUsed,
      (G as unknown as { pokemonMap: PokemonMapMetadata }).pokemonMap.whiteFluteUsed,
    ],
    direction: gp.direction,
  };
}

describe("overworld item effects vs Ruby", () => {
  it("has a reference for every scenario", () => {
    expect(scenarios.length).toBeGreaterThan(150);
    for (const s of scenarios) expect((s.result as { error?: string }).error, s.setup.name).toBeUndefined();
  });

  for (const s of scenarios) {
    it(s.setup.name, async () => {
      expect(await run(s.setup)).toEqual(s.result);
    });
  }
});
