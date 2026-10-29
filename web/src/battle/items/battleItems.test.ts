// The items used from the Bag in battle (Item_BattleEffects.ts, the port of
// 013_Items/003_Item_BattleEffects.rb) against the game's own Ruby code:
// battleItemsReference.json is written by
// web/tools/ruby-ref/battle_items_reference.rb, which runs Essentials v20.1 +
// this game's plugins + 003_Item_BattleEffects.rb headless on scripted
// battles. Each scenario in the JSON is plain data (Pokémon, Bag, setup, what
// each battler does each round), replayed here exactly as in that script,
// with the same "random" numbers: items go through Battle#pbItemMenu (the
// command phase's Bag code, with a scene whose pbItemMenu picks the
// scenario's item) and pbAttackPhase's item use. After the switch-in phase
// and after each round, every message shown, each battler's HP, stages,
// status, effects and PP, the party, the Bag, the caught Pokémon and the
// decision must match Ruby's.
//
// The Ruby side has the core 003 handlers only; here the Generation 9 Pack's
// item handlers are registered on top (via ../index), which only differ for
// Drowsy/Frostbite (not used by these scenarios).
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GameData } from "../../data/gameData";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables, type MapLike } from "../../game/globals";
import { PokemonBag } from "../../game/items/PokemonBag";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonStorage } from "../../game/pokemon/PokemonStorage";
import { GameStats } from "../../game/trainer/GameStats";
import { Player } from "../../game/trainer/Player";
import { NPCTrainer } from "../../game/trainer/Trainer";
import { triggerCanUseInBattle, triggerUseInBattle } from "../battle/Battle_ActionUseItem";
import type { ItemMenuCallback, PartyScreenCallback } from "../BattleSceneInterface";
import { Battle, type Battler, DebugSceneNoLogging, PBEffects } from "../index";
import ref from "./battleItemsReference.json";

const INERT_ABILITY = "HONEYGATHER";

/** battle_reference.rb's SeqRandom: the k-th call returns ((k * 829348651 + 12345) % 2147483647) % x. */
class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}

type MonSpec = { species: string; level?: number; moves?: string[]; nature?: string; iv?: number; ev?: number };
type SetupOp = (string | number | boolean | null)[];
type TurnEntry = (string | number | boolean | null)[];
type BattlerState = {
  index: number; species: string; hp: number; totalhp: number; status: string;
  stages: Record<string, number>; effects: Record<string, number>; pp: number[]; fainted: boolean;
};
type PokemonState = { species: string; hp: number; status: string; pp: number[]; happiness: number };
type Round = {
  messages: string[]; battlers: BattlerState[]; party: PokemonState[]; bag: Record<string, number>;
  mist: number[]; caught: [string, string][]; decision: number; checks?: (boolean | null)[];
  itemMenu?: boolean[]; error?: string;
};
type Scenario = {
  name: string; p1: MonSpec[]; p2: MonSpec[]; double?: boolean; trainer?: boolean; storageFull?: boolean;
  bag?: Record<string, number>; keyItems?: string[]; setup?: SetupOp[];
  setupBeforeTurn?: Record<string, SetupOp[]>; checks?: SetupOp[];
  turns: TurnEntry[][]; randomStart: number; rounds: Round[];
};

let player: Player;

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = new Array<boolean>(8).fill(true); // so that no Pokémon disobeys
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  // changeHappiness reads $game_map.map_id (Pokémon here are obtained on map 0)
  G.gameMap = { mapId: 0, events: new Map() } as MapLike;
});

function makePokemon(spec: MonSpec): Pokemon {
  const pkmn = new Pokemon(spec.species, spec.level ?? 50, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = spec.iv ?? 31;
    pkmn.ev[s.id] = spec.ev ?? 0;
  }
  pkmn.nature = spec.nature ?? "HARDY";
  pkmn.ability = INERT_ABILITY;
  pkmn.item = null;
  pkmn.moves = [];
  for (const m of spec.moves ?? ["TACKLE"]) pkmn.learnMove(m);
  pkmn.calcStats();
  return pkmn;
}

const EFFECTS = ["Confusion", "Attract", "FocusEnergy", "Embargo"] as const;

function battlerState(b: Battler): BattlerState {
  const stages: Record<string, number> = {};
  for (const s of GameData.Stat.eachBattle()) stages[s.id] = b.stages[s.id]!;
  const effects: Record<string, number> = {};
  for (const e of EFFECTS) effects[e] = b.effects[PBEffects[e]] as number;
  return {
    index: b.index, species: b.species, hp: b.hp, totalhp: b.totalhp, status: b.status,
    stages, effects, pp: b.moves.map((m) => m!.pp), fainted: b.fainted(),
  };
}

function pokemonState(p: Pokemon): PokemonState {
  return { species: p.species, hp: p.hp, status: p.status, pp: p.moves.map((m) => m.pp), happiness: p.happiness };
}

function applySetup(battle: Battle, op: SetupOp): void {
  const b = typeof op[1] === "number" ? battle.battlers[op[1]] ?? null : null;
  switch (op[0]) {
    case "hp": b!.hp = op[2] as number; break;
    case "hpFraction": b!.hp = Math.max(Math.floor(b!.totalhp * (op[2] as number) / (op[3] as number)), 1); break;
    case "status": b!.status = op[2] as string; break;
    case "sleep":
      b!.status = "SLEEP";
      b!.statusCount = op[2] as number;
      break;
    case "stage": b!.stages[op[2] as string] = op[3] as number; break;
    case "effect": b!.effects[(PBEffects as unknown as Record<string, number>)[op[2] as string]!] = op[3]; break;
    case "pp":
      b!.moves[op[2] as number]!.pp = op[3] as number;
      b!.pokemon!.moves[op[2] as number]!.pp = op[3] as number;
      break;
    case "partyHp": battle.pbParty(0)[op[1] as number]!.hp = op[2] as number; break;
    case "partyPP": battle.pbParty(0)[op[1] as number]!.moves[op[2] as number]!.pp = op[3] as number; break;
    case "battle": (battle as unknown as Record<string, unknown>)[op[1] as string] = op[2]; break;
  }
}

/** What the Bag picks for an item's battle use when the scenario doesn't say. */
function defaultIdxPkmn(battle: Battle, idxBattler: number, useType: number): number {
  switch (useType) {
    case 1: case 2: case 3: return battle.battlers[idxBattler]!.pokemonIndex;
    case 4: return battle.allOtherSideBattlers(idxBattler)[0]!.index;
    default: return idxBattler;
  }
}

/** battle_items_reference.rb's run_scenario. */
async function runScenario(sc: Scenario): Promise<Round[]> {
  const random = new SeqRandom(sc.randomStart);
  const log: string[] = [];
  const bag = new PokemonBag();
  G.bag = bag;
  for (const [id, qty] of Object.entries(sc.bag ?? {})) bag.add(id, qty);
  for (const id of sc.keyItems ?? []) bag.add(id, 1);
  const scene = new DebugSceneNoLogging();
  scene.pbDisplayMessage = async (msg: string) => { log.push(msg); };
  scene.pbDisplayPausedMessage = async (msg: string) => { log.push(msg); };
  scene.pbDisplayConfirmMessage = async (msg: string) => { log.push(msg); return true; };
  // $PokemonStorage: only its full? is read (by the Poké Balls' CanUseInBattle)
  if (sc.storageFull) G.storage.full = () => true;
  const p1 = sc.p1.map(makePokemon);
  const p2 = sc.p2.map(makePokemon);
  // (party_full? is the player's own party, not the battle's)
  player.party = sc.storageFull ? p1 : [];
  const opponent = sc.trainer ? [new NPCTrainer("Joey", GameData.TrainerType.keys()[0]!)] : null;
  const battle = new Battle(scene, p1, p2, player, opponent);
  scene.pbPartyScreen = async (idxBattler: number, _canCancel = false, _mode = 0,
    callback?: PartyScreenCallback): Promise<void> => {
    const replacements: number[] = [];
    battle.eachInTeamFromBattlerIndex(idxBattler, (_b, idxParty) => {
      if (!battle.pbFindBattler(idxParty, idxBattler)) replacements.push(idxParty);
    });
    if (replacements.length === 0) return;
    for (let i = 0; i < 50; i++) {
      if (await callback?.(replacements[random.next(replacements.length)]!, scene)) break;
    }
  };
  // The Bag: picks the scenario's item once
  let bagChoice: [Id, number, number, number] | null = null;
  scene.pbItemMenu = async (_idxBattler: number, _firstAction: boolean, callback: ItemMenuCallback) => {
    await callback(...bagChoice!, scene);
  };
  if (sc.double) battle.setBattleMode("double");
  battle.internalBattle = true;
  battle.expGain = false;
  battle.pbRandom = (x: number) => random.next(x);
  battle.battleAI.pbAIRandom = (x: number) => random.next(x);
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  for (const op of sc.setup ?? []) applySetup(battle, op);
  const rounds: Round[] = [];
  const bagItems = [...Object.keys(sc.bag ?? {}), ...(sc.keyItems ?? [])];
  const snapshot = (extra: Partial<Round> = {}): void => {
    rounds.push({
      messages: [...log], battlers: battle.battlers.filter((b): b is Battler => !!b).map(battlerState),
      party: battle.pbParty(0).filter((p): p is Pokemon => !!p).map(pokemonState),
      bag: Object.fromEntries(bagItems.map((id) => [id, bag.quantity(id)])),
      mist: battle.sides.map((s) => s.effects[PBEffects.Mist] as number),
      caught: battle.caughtPokemon.map((p) => [p.species, p.pokeBall]),
      decision: battle.decision, ...extra,
    });
    log.length = 0;
  };
  try {
    await battle.pbOnAllBattlersEnteringBattle();
    const checks: (boolean | null)[] = [];
    for (const op of sc.checks ?? []) {
      if (op[0] === "canUse") {
        const battler = op[2] != null ? battle.battlers[op[2] as number]! : null;
        const pkmn = op[3] != null ? battle.pbParty(0)[op[3] as number]! : battler!.pokemon;
        checks.push(await triggerCanUseInBattle(op[1] as Id, pkmn, battler, op[4] as number,
          op[5] as boolean, battle, scene, true));
      } else if (op[0] === "use") {
        await triggerUseInBattle(op[1] as Id, battle.battlers[op[2] as number]!, battle);
        checks.push(null);
      }
    }
    snapshot(sc.checks ? { checks } : {});
    for (const [t, turn] of sc.turns.entries()) {
      if (battle.decision > 0) break;
      for (const op of sc.setupBeforeTurn?.[String(t)] ?? []) applySetup(battle, op);
      const menu: boolean[] = [];
      for (const [i, entry] of turn.entries()) {
        const b = battle.battlers[i];
        if (!b || b.fainted()) continue;
        if (!battle.pbCanShowCommands(i)) continue;
        battle.pbClearChoice(i);
        if (entry[0] === "item") {
          const [, id, idxPkmnIn, idxMove, firstAction] = entry as [string, Id, number | null, number | null, boolean | null];
          const useType = GameData.Item.get(id).battleUse;
          const idxPkmn = idxPkmnIn ?? defaultIdxPkmn(battle, i, useType);
          bagChoice = [id, useType, idxPkmn, idxMove ?? -1];
          menu.push(await battle.pbItemMenu(i, firstAction ?? true));
          continue;
        }
        const [idxMove, idxTargetIn] = entry as [number, number | undefined];
        if (!(await battle.pbRegisterMove(i, idxMove, false))) continue;
        const move = battle.choices[i]![2] as { pbTarget(b: Battler): { numTargets: number } };
        if (move.pbTarget(b).numTargets === 1) {
          const idxTarget = idxTargetIn ?? battle.battlers.findIndex((ob) => !!ob && b.opposes(ob.index));
          battle.pbRegisterTarget(i, idxTarget);
        }
      }
      await battle.pbAttackPhase();
      if (battle.decision === 0) await battle.pbEndOfRoundPhase();
      battle.turnCount += 1;
      snapshot({ itemMenu: menu });
    }
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    snapshot({ error: e.name });
    throw e;
  }
  return rounds;
}

describe("items used in battle vs Ruby", () => {
  for (const sc of ref.scenarios as unknown as Scenario[]) {
    it(sc.name, async () => {
      const rounds = await runScenario(sc);
      expect(rounds.length, sc.name).toBe(sc.rounds.length);
      for (let i = 0; i < rounds.length; i++) {
        expect(rounds[i], `${sc.name}, round ${i}`).toEqual(sc.rounds[i]);
      }
    });
  }
});
