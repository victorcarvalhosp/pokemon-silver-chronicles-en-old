// The Battle Frontier port against the game's own Ruby
// (battleFrontierReference.json, written by
// web/tools/ruby-ref/battle_frontier_reference.rb): rulesets and entry
// restrictions on sample teams, level adjustments, chosen and generated
// foes, Battle Factory Pokémon, the team generator (random Pokémon, tiers,
// trainer info, ratings, a real simulated battle), whole Battle Tower runs
// with real battles, and the Battle Swap screen's choices. Same Pokémon and
// the same random numbers on both sides.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class SeqRandom {
  constructor(private k = 0) {}
  next(x: number): number {
    const v = (this.k * 829348651 + 12345) % 2147483647;
    this.k += 1;
    return x > 0 ? v % x : 0;
  }
}
let seq = new SeqRandom();
const setSeed = (k: number) => (seq = new SeqRandom(k));
vi.mock("../../core/random", () => ({
  rand: (n: number) => seq.next(n),
  random: () => 0,
  seedRandom: () => {},
}));
vi.mock("../../core/debug", () => ({ DEBUG: false }));
let saves = 0;
vi.mock("../Game", () => ({ Game: { save: async () => { saves += 1; return true; } } }));
vi.mock("../battle/BattleIntroAnim", () => ({
  pbBattleAnimation: async (_bgm: unknown, _t: unknown, _f: unknown, block?: () => Promise<void>) => { await block?.(); },
  pbSceneStandby: async (block: () => Promise<void>) => { await block(); },
}));
const written: string[] = [];
vi.mock("./writeTrainerLists", () => ({ Compiler: { writeTrainerLists: async () => { written.push("write_trainer_lists"); } } }));

const { GameData } = await import("../../data/gameData");
const { loadGameDataForTests } = await import("../../data/gameData/testing");
const { pbLoadTrainerLists, setMiscPBSData } = await import("../../data/gameData/miscPBSData");
const { DebugSceneNoLogging } = await import("../../battle");
const { PBDebug } = await import("../../battle/other/PBDebug");
const { G, GameVariables, PokemonGlobalMetadata, GameTemp } = await import("../globals");
const { PokemonBag } = await import("../items/PokemonBag");
const { Pokemon } = await import("../pokemon/Pokemon");
const { PokemonStorage } = await import("../pokemon/PokemonStorage");
const { GameStats } = await import("../trainer/GameStats");
const { Player } = await import("../trainer/Player");
const { BattleCreationHelperMethods } = await import("../battle/BattleStarting");
const F = {
  ...(await import("./challengeRules")),
  ...(await import("./rulesets")),
  ...(await import("./entryRestrictions")),
  ...(await import("./levelAdjustment")),
  ...(await import("./challengeData")),
  ...(await import("./chooseFoes")),
  ...(await import("./battleChallenge")),
  ...(await import("./challengeBattles")),
  ...(await import("./generatorData")),
  ...(await import("./generatorPokemon")),
  ...(await import("./generatorTrainers")),
  ...(await import("./battleSim")),
  ...(await import("./battleSwap")),
};
const { PokemonSelection, TypeRestriction } = await import("../trainers/pokemonSelection");
const { FrontierMarshal } = await import("./marshal");
await import("./scripts");
const ref = (await import("./battleFrontierReference.json")).default as Record<string, unknown>;

type PokemonT = InstanceType<typeof Pokemon>;
type Rules = InstanceType<typeof F.PokemonChallengeRules>;
type MonSpec = { s: string; l?: number; n?: string; i?: string; m?: string[]; name?: string; egg?: boolean; fainted?: boolean; iv?: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let player: InstanceType<typeof Player>;
let log: string[] = [];
let errors: string[] = [];
const errLog: string[] = [];

/** Ruby's err { }: a value, or "!error". */
function err<T>(fn: () => T): T | "!error" {
  try {
    return fn();
  } catch (e) {
    errLog.push(String(e));
    return "!error";
  }
}
async function errAsync<T>(fn: () => Promise<T>): Promise<T | "!error"> {
  try {
    return await fn();
  } catch (e) {
    errLog.push(String(e));
    return "!error";
  }
}

function fnv(str: string): number {
  let h = 2166136261;
  for (const b of new TextEncoder().encode(str)) h = Number((BigInt(h ^ b) * 16777619n) & 0xFFFFFFFFn);
  return h;
}

function mon(spec: MonSpec): PokemonT {
  const pkmn = new Pokemon(spec.s, spec.l ?? 50, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = spec.iv ?? 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = spec.n ?? "HARDY";
  pkmn.item = spec.i ?? null;
  if (spec.m) {
    pkmn.forgetAllMoves();
    for (const m of spec.m) pkmn.learnMove(m);
  }
  if (spec.name) pkmn.name = spec.name;
  if (spec.egg) pkmn.stepsToHatch = 100;
  pkmn.calcStats();
  if (spec.fainted) pkmn.hp = 0;
  return pkmn;
}

function desc(pkmn: PokemonT | null | undefined): string | null {
  if (!pkmn) return null;
  const ivs = GameData.Stat.eachMain().map((s) => pkmn.iv[s.id]).join("/");
  const evs = GameData.Stat.eachMain().map((s) => pkmn.ev[s.id]).join("/");
  return `${pkmn.species} L${pkmn.level} exp=${pkmn.exp} i=${pkmn.itemId ?? ""} n=${pkmn.natureId ?? ""} a=${pkmn.abilityId ?? ""} g=${pkmn.gender} ` +
    `m=${pkmn.moves.map((m) => m.id).join(",")} iv=${ivs} ev=${evs} pid=${pkmn.personalID} ` +
    `hp=${pkmn.hp}/${pkmn.totalhp} st=${pkmn.attack},${pkmn.defense},${pkmn.spatk},${pkmn.spdef},${pkmn.speed} hap=${pkmn.happiness}`;
}

const pbp = (pk: InstanceType<typeof F.PBPokemon>) =>
  `${pk.species};${pk.item ?? ""};${pk.nature ?? ""};${pk.ev.join(",")};${pk.move1 ?? ""},${pk.move2 ?? ""},${pk.move3 ?? ""},${pk.move4 ?? ""}`;

function trainerDesc(t: InstanceType<typeof import("../trainer/Trainer").NPCTrainer>) {
  return { type: t.trainerType, name: t.name, id: t.id, lose: t.loseText, win: t.winText, party: t.party.map(desc) };
}

/** battle_frontier_reference.rb's LogScene. */
class LogScene extends DebugSceneNoLogging {
  override async pbDisplayMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayPausedMessage(msg: string): Promise<void> { log.push(msg); }
  override async pbDisplayConfirmMessage(msg: string): Promise<boolean> { log.push(`[confirm] ${msg}`); return true; }
  override async pbSendOutBattlers(sendOuts: [number, PokemonT][]): Promise<void> {
    for (const [idx, pkmn] of sendOuts) log.push(`[sendout] ${idx}: ${pkmn.name}`);
  }
  override async pbFaintBattler(battler: Any): Promise<void> { log.push(`[faint] ${battler.pbThis()}`); }
}

beforeAll(() => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  vi.spyOn(BattleCreationHelperMethods, "createBattleScene").mockImplementation(() => new LogScene());
  vi.spyOn(BattleCreationHelperMethods, "prepareBattle").mockImplementation((b: Any) => { b.controlPlayer = true; });
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  for (let i = 0; i < 8; i++) player.badges[i] = true;
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameTemp = new GameTemp();
  G.gameMap = { mapId: 191, needRefresh: false } as never;
  G.gamePlayer = { x: 7, y: 3, direction: 8 } as never;
  G.scene = null as never;
  PBDebug.continueOnError = true;
  PBDebug.sink = (msg: string) => {
    if (msg.startsWith("**Exception: ")) {
      log.push("[exception]");
      errors.push(msg);
    }
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const R = ref as Any;

//===============================================================================
describe("Battle Frontier data vs Ruby", () => {
  it("has Data/trainer_lists.dat's trainer lists", () => {
    const lists = F.loadTrainerListsDat();
    expect(lists.map((tr) => ({
      trainers: tr[0].length, pokemon: tr[1].length, challenges: tr[2], trainersFile: tr[3], pokemonFile: tr[4], isDefault: tr[5],
      trainersHash: fnv(tr[0].map((t) => t.map((x) => (Array.isArray(x) ? x.join(",") : String(x))).join("|")).join("\n")),
      pokemonHash: fnv(tr[1].map(pbp).join("\n")),
      firstTrainer: tr[0][0], firstPokemon: pbp(tr[1][0]!),
    }))).toEqual(R.data.lists);
  });

  it("has GameData in Ruby's order (species, moves, natures, trainer types, types, machines)", () => {
    const k = (ids: string[]) => [ids.length, fnv(ids.join(","))];
    expect({
      species: k(GameData.Species.keys()), moves: k(GameData.Move.keys()), natures: k(GameData.Nature.keys()),
      trainerTypes: k(GameData.TrainerType.keys()),
      types: fnv(GameData.Type.each().map((t) => t.id).join(",")),
      machines: fnv(GameData.Item.each().filter((i) => i.isMachine()).map((i) => i.move).join(",")),
    }).toEqual(R.data.keys);
  });

  it("reads and creates PBPokemon like Ruby", () => {
    const strs = ["PIKACHU;LIGHTBALL;TIMID;SA,spd;THUNDERBOLT,QUICKATTACK,,", " BULBASAUR ; ; ; ; XYZMOVE,,, ",
      "RATTATA;NOTANITEM;JOLLY;HP,ATK,DEF,SPATK,SPDEF,SPD,foo;RETURN,TACKLE,BITE,CRUNCH,HYPERFANG"];
    expect(strs.map((s) => {
      const pk = F.PBPokemon.fromInspected(s);
      setSeed(5);
      return [pbp(pk), desc(pk.createPokemon(30, 20, null)), err(() => pk.inspect()), pk.tocompact()];
    })).toEqual(R.data.fromInspected);
  });
});

//===============================================================================
const MONS: MonSpec[] = [
  { s: "PIKACHU", l: 20, i: "LIGHTBALL", m: ["THUNDERSHOCK", "QUICKATTACK"] },
  { s: "PICHU", l: 5, i: "BERRYJUICE", m: ["THUNDERSHOCK"] },
  { s: "RATTATA", l: 5, i: "ORANBERRY", m: ["TACKLE", "SONICBOOM"], name: "Pikachu" },
  { s: "SQUIRTLE", l: 18, i: "ORANBERRY", m: ["TACKLE", "BUBBLE"] },
  { s: "MEWTWO", l: 70, m: ["PSYCHIC"] },
  { s: "TYRANITAR", l: 55, i: "LEFTOVERS", m: ["CRUNCH", "ROCKSLIDE"] },
  { s: "WOBBUFFET", l: 30, m: ["COUNTER"] },
  { s: "SLAKING", l: 60, m: ["SLACKOFF"] },
  { s: "TOGEPI", l: 3, egg: true },
  { s: "ONIX", l: 25, m: ["ROCKTHROW"] },
  { s: "MAGIKARP", l: 15, fainted: true, m: ["SPLASH"] },
  { s: "SCYTHER", l: 5, m: ["QUICKATTACK"] },
  { s: "LATIAS", l: 50, i: "SOULDEW", m: ["DRAGONBREATH"] },
  { s: "UNOWN", l: 50, m: ["HIDDENPOWER"] },
  { s: "CLEFFA", l: 30, i: "LEFTOVERS", m: ["POUND"] },
  { s: "PIKACHU", l: 50, m: ["THUNDERBOLT"], name: "Sparky" },
  { s: "ARCEUS", l: 80, i: "CUSTAPBERRY", m: ["JUDGMENT"] },
  { s: "PIDGEY", l: 20, m: ["GUST"] },
];
const TEAMS = [[0, 3, 9], [0, 15, 3], [0, 3, 5, 9], [1, 2, 11], [3, 9, 17], [5, 6, 7], [0, 3, 14, 9, 17, 12], [12, 13, 4],
  [8, 10, 3], [3], [], [2, 3, 9, 17, 0, 14]];

const RULESET_BUILDERS: Record<string, () => Rules> = {
  "pbPikaCupRules(false)": () => F.pbPikaCupRules(false),
  "pbPikaCupRules(true)": () => F.pbPikaCupRules(true),
  "pbPokeCupRules(false)": () => F.pbPokeCupRules(false),
  "pbPrimeCupRules(true)": () => F.pbPrimeCupRules(true),
  "pbFancyCupRules(false)": () => F.pbFancyCupRules(false),
  "pbLittleCupRules(false)": () => F.pbLittleCupRules(false),
  "pbStrictLittleCupRules(true)": () => F.pbStrictLittleCupRules(true),
  "pbBattleTowerRules(false,false)": () => F.pbBattleTowerRules(false, false),
  "pbBattleTowerRules(true,true)": () => F.pbBattleTowerRules(true, true),
  "pbBattlePalaceRules(false,true)": () => F.pbBattlePalaceRules(false, true),
  "pbBattleArenaRules(false)": () => F.pbBattleArenaRules(false),
  "pbBattleFactoryRules(false,false)": () => F.pbBattleFactoryRules(false, false),
  "pbBattleFactoryRules(true,true)": () => F.pbBattleFactoryRules(true, true),
  StandardCup: () => new F.PokemonChallengeRules(new F.StandardCup()),
  DoubleCup: () => new F.PokemonChallengeRules(new F.DoubleCup()),
  FancyCup: () => new F.PokemonChallengeRules(new F.FancyCup()),
  LittleCup: () => new F.PokemonChallengeRules(new F.LittleCup()),
  LightCup: () => new F.PokemonChallengeRules(new F.LightCup()),
  "modeToRules(nil,3,0,0)": () => new F.BattleChallenge().modeToRules(null, 3, 0, 0),
  "modeToRules(true,4,1,1)": () => new F.BattleChallenge().modeToRules(true, 4, 1, 1),
  "modeToRules(true,3,2,2)": () => new F.BattleChallenge().modeToRules(true, 3, 2, 2),
  "selection(1,3)": () => new PokemonSelection.Parameters().setMinPokemon(1).setMaxPokemon(3).challenge(),
  "selection(3,3,fainted)": () => new PokemonSelection.Parameters().setMinPokemon(3).setMaxPokemon(3).setAcceptFainted(true).challenge(),
  "selection(2,6,types)": () => new PokemonSelection.Parameters().setMinPokemon(2).setBaseChallenge(
    new F.PokemonChallengeRules().addPokemonRule(new TypeRestriction(["ELECTRIC", "WATER"])),
  ).challenge(),
  "nickname+restricted": () => new F.PokemonChallengeRules().addTeamRule(new F.NicknameClause())
    .addSubsetRule(new F.RestrictedSpeciesSubsetRestriction("PIKACHU", "TYRANITAR")).setNumber(3),
};
const POKEMON_RULES: Record<string, () => { isValid(p: Any): boolean | null }> = {
  Standard: () => new F.StandardRestriction(), "Height(2)": () => new F.HeightRestriction(2),
  "Weight(20)": () => new F.WeightRestriction(20), NegativeExtendedGame: () => new F.NegativeExtendedGameClause(),
  Baby: () => new F.BabyRestriction(), UnevolvedForm: () => new F.UnevolvedFormRestriction(),
  NonEgg: () => new F.NonEggRestriction(), Able: () => new F.AblePokemonRestriction(),
  "Species(PIKACHU,ONIX)": () => new F.SpeciesRestriction("PIKACHU", "ONIX"),
  "BannedSpecies(PIKACHU)": () => new F.BannedSpeciesRestriction("PIKACHU"),
  "MinimumLevel(20)": () => new F.MinimumLevelRestriction(20), "MaximumLevel(20)": () => new F.MaximumLevelRestriction(20),
  "BannedItem(LEFTOVERS)": () => new F.BannedItemRestriction("LEFTOVERS"), ItemsDisallowed: () => new F.ItemsDisallowedClause(),
  SoulDew: () => new F.SoulDewClause(), LittleCup: () => new F.LittleCupRestriction(),
  "BaseStat(300,500)": () => new F.BaseStatRestriction(300, 500), Nonlegendary: () => new F.NonlegendaryRestriction(),
  "Inverse(Nonlegendary)": () => new F.InverseRestriction(new F.NonlegendaryRestriction()),
};
const TEAM_RULES: Record<string, () => { isValid(t: Any): boolean; errorMessage?(): string }> = {
  "RestrictedSpecies(1,PIKACHU,ONIX)": () => new F.RestrictedSpeciesRestriction(1, "PIKACHU", "ONIX"),
  "RestrictedSpeciesTeam(PIKACHU)": () => new F.RestrictedSpeciesTeamRestriction("PIKACHU"),
  "RestrictedSpeciesSubset(PIKACHU)": () => new F.RestrictedSpeciesSubsetRestriction("PIKACHU"),
  SameSpecies: () => new F.SameSpeciesClause(), Species: () => new F.SpeciesClause(),
  "TotalLevel(50)": () => new F.TotalLevelRestriction(50), Item: () => new F.ItemClause(),
  Nickname: () => new F.NicknameClause(),
};

describe("Battle Frontier rules vs Ruby", () => {
  it("validates Pokémon and teams like Ruby", () => {
    setSeed(100);
    const mons = MONS.map(mon);
    const team = (t: number[]) => t.map((i) => mons[i]!);
    const out = {
      mons: mons.map(desc),
      rulesets: Object.entries(RULESET_BUILDERS).map(([name, b]) => {
        const r = b();
        const rs = r.ruleset;
        const res: Record<string, unknown> = {
          name, number: rs.number, minLength: rs.minLength, maxLength: rs.maxLength,
          minTeamLength: rs.minTeamLength, maxTeamLength: rs.maxTeamLength,
          suggestedNumber: rs.suggestedNumber, suggestedLevel: rs.suggestedLevel,
          levelAdjustment: r.levelAdjustment ? r.levelAdjustment.constructor.name : null,
          battleType: r.battletype.constructor.name,
          valid: mons.map((p) => err(() => rs.isPokemonValid(p))),
          hasValidTeam: err(() => rs.hasValidTeam(mons)),
          hasRegistrableTeam: err(() => rs.hasRegistrableTeam(team([0, 3, 9, 17, 2, 14, 5]))),
        };
        res.teams = TEAMS.map((t) => {
          const errorsList: string[] = [];
          const v = err(() => rs.isValid(team(t), errorsList));
          return [v, errorsList, err(() => rs.hasValidTeam(team(t))), err(() => rs.canRegisterTeam(team(t)))];
        });
        return res;
      }),
      pokemonRules: Object.entries(POKEMON_RULES).map(([name, b]) => [name, mons.map((p) => err(() => b().isValid(p)))]),
      teamRules: Object.entries(TEAM_RULES).map(([name, b]) =>
        [name, TEAMS.map((t) => [err(() => b().isValid(team(t))), err(() => {
          const rule = b();
          if (!rule.errorMessage) throw new Error("undefined method `errorMessage'");
          return rule.errorMessage();
        })])]),
      species: [err(() => new F.HeightRestriction(1).isValid("ONIX")), err(() => new F.WeightRestriction(10).isValid("PIKACHU"))],
    };
    // Ruby's class names are unqualified here, as Battle Palace/Arena are in the port.
    const expected = R.rules;
    expect(out.mons).toEqual(expected.mons);
    for (let i = 0; i < out.rulesets.length; i++) expect(out.rulesets[i]).toEqual(expected.rulesets[i]);
    expect(out.pokemonRules).toEqual(expected.pokemonRules);
    expect(out.teamRules).toEqual(expected.teamRules);
    expect(out.species).toEqual(expected.species);
  });

  it("adjusts levels and puts them back like Ruby", () => {
    setSeed(100);
    const mons = MONS.map(mon);
    const ADJ: Record<string, () => Any> = {
      "Fixed(50)": () => new F.FixedLevelAdjustment(50), "Fixed(150)": () => new F.FixedLevelAdjustment(150),
      "Total(15,20,50)": () => new F.TotalLevelAdjustment(15, 20, 50),
      "Combined(Capped(30),nil)": () => new F.CombinedLevelAdjustment(new F.CappedLevelAdjustment(30), null),
      "SinglePlayerCapped(40)": () => new F.SinglePlayerCappedLevelAdjustment(40),
      "Capped(50)": () => new F.CappedLevelAdjustment(50), "LevelBalance(5)": () => new F.LevelBalanceAdjustment(5),
      "Enemy(5)": () => new F.EnemyLevelAdjustment(5), "Open(60)": () => new F.OpenLevelAdjustment(60),
      "Open()": () => new F.OpenLevelAdjustment(), "LevelAdjustment(0)": () => new F.LevelAdjustment(0),
      "LevelAdjustment(3)": () => new F.LevelAdjustment(3),
    };
    const out = Object.entries(ADJ).map(([name, b]) => {
      setSeed(7);
      const t1 = [mons[0]!, mons[5]!, mons[4]!].map((p) => p.clone());
      const t2 = [mons[3]!, mons[9]!, mons[17]!, mons[15]!].map((p) => p.clone());
      const adj = b();
      const ret = err(() => adj.adjustLevels(t1, t2));
      const after = [t1.map((p) => `${p.level}/${p.totalhp}`), t2.map((p) => `${p.level}/${p.totalhp}`)];
      if (Array.isArray(ret)) err(() => adj.unadjustLevels(t1, t2, ret));
      const back = [t1.map((p) => `${p.level}/${p.exp}/${p.totalhp}`), t2.map((p) => `${p.level}/${p.exp}/${p.totalhp}`)];
      const rules = new F.PokemonChallengeRules().setLevelAdjustment(err(() => b()) as Any);
      const bil = err(() => rules.adjustLevelsBilateral(t1, t2));
      const bilAfter = t1.map((p) => p.level);
      if (Array.isArray(bil)) err(() => rules.unadjustLevelsBilateral(t1, t2, bil));
      return { name, type: err(() => adj.type), ret, after, back, bilateral: Array.isArray(bil) ? "adjusted" : bil, bilAfter,
        bilBack: t1.map((p) => p.level) };
    });
    expect(out).toEqual(R.levels);
  });
});

//===============================================================================
function setChallenge(id: string): void {
  G.pokemonGlobal.challenge = null;
  F.pbBattleChallenge().currentChallenge = id;
}

describe("Battle Frontier foes vs Ruby", () => {
  it("chooses trainers like Ruby", () => {
    const btDefault = F.pbGetBTTrainers("towersingle");
    const btPoke = F.pbGetBTTrainers("pokecupsingle");
    setSeed(31);
    expect([0, 5, 6, 7, 12, 13, 14, 20, 21, 27, 28, 34, 35, 41, 42, 48, 49, 60, 100].map((w) =>
      [F.pbBattleChallengeTrainer(w, btDefault), F.pbBattleChallengeTrainer(w, btPoke)])).toEqual(R.foes.trainerIndex);
  });

  it("generates trainers like Ruby", () => {
    const cases: [string, () => Rules, number[]][] = [
      ["towersingle", () => F.pbBattleTowerRules(false, false), [0, 99, 100, 150, 219, 220, 299]],
      ["towerdoubleopen", () => F.pbBattleTowerRules(true, true), [10, 230]],
      ["pikacupsingle", () => F.pbBattleTowerRules(false, false), [3, 150]],
      ["littlecupdouble", () => F.pbLittleCupRules(true), [7]],
    ];
    const out = cases.flatMap(([id, rb, idxs]) => {
      setChallenge(id);
      return idxs.map((i) => {
        setSeed(1000 + i);
        return [id, i, trainerDesc(F.pbGenerateBattleTrainer(i, rb()))];
      });
    });
    expect(out).toEqual(R.foes.generated);
  });

  it("generates Battle Factory Pokémon like Ruby", () => {
    const out = ([[0, 0, 0, false], [7, 15, 0, false], [21, 30, 3, false], [56, 50, 0, false], [3, 0, 0, true], [14, 22, 3, true]] as const)
      .map(([w, s, nrent, open]) => {
        setChallenge(open ? "factorysingleopen" : "factorysingle");
        setSeed(2000 + w);
        const rules = F.pbBattleFactoryRules(false, open);
        const rentals = Array.from({ length: nrent }, (_, k) => F.pbGetBTPokemon("factorysingle")[k * 37]!.createPokemon(50, 10, null));
        const party = err(() => F.pbBattleFactoryPokemon(rules, w, s, rentals));
        return [w, s, nrent, open, Array.isArray(party) ? party.map(desc) : party, rules.ruleset.minLength, rules.ruleset.maxLength];
      });
    expect(out).toEqual(R.foes.factory);
  });

  it("runs the Battle Factory's rentals and swaps like Ruby", async () => {
    G.pokemonGlobal.challenge = null;
    setSeed(77);
    player.party = [mon({ s: "PIKACHU", l: 30 })];
    await F.pbBattleChallenge().set("factorysingle", 7, F.pbBattleFactoryRules(false, false));
    await F.pbBattleChallenge().start();
    const fd = F.pbBattleChallenge().extra!;
    fd.pbPrepareRentals();
    const rentals = fd.rentals;
    const opp = fd.opponent!;
    fd.rentals = rentals.slice(0, 3);
    F.pbBattleChallenge().pbAddWin();
    fd.pbPrepareSwaps();
    expect({
      trainers: F.pbBattleChallenge().bc.trainers, rentals: rentals.map(desc), opponent: trainerDesc(opp),
      next: trainerDesc(fd.opponent!), oldopponent: fd.oldopponent.map(desc),
    }).toEqual(R.foes.factoryChallenge);
    // Saving and loading keeps the factory data and its link back to the challenge
    const back = FrontierMarshal.load(JSON.parse(JSON.stringify(FrontierMarshal.dump(F.pbBattleChallenge())))) as InstanceType<typeof F.BattleChallenge>;
    expect(back.extra!.bcdata).toBe(back.bc);
    expect(back.extra!.rentals.map(desc)).toEqual(fd.rentals.map(desc));
    expect(back.rules.ruleset.maxLength).toBe(3);
    F.pbBattleChallenge().pbCancel();
  });
});

//===============================================================================
describe("Battle Frontier generator vs Ruby", () => {
  it("generates Pokémon, teams, trainer lists and ratings like Ruby", async () => {
    const gen: Record<string, unknown> = {};
    const Rg = R.generator;
    gen.legalMoves = [["PIKACHU", 50], ["SMEARGLE", 50], ["BULBASAUR", 20], ["EEVEE", 100], ["MAGIKARP", 30],
      ["TYRANITAR", 100], ["DITTO", 50], ["SCIZOR", 70], ["GENGAR", 50], ["CHANSEY", 50]].map(([s, l]) =>
      [s, l, F.pbGetLegalMoves2(s as string, l as number)]);
    expect(gen.legalMoves).toEqual(Rg.legalMoves);
    F.generatorCaches.legalMoves = {};
    F.generatorCaches.legalMovesLevel = 0;
    setSeed(4242);
    const rule50 = F.pbBattleTowerRules(false, false);
    expect(Array.from({ length: 14 }, () => desc(F.pbRandomPokemonFromRule(rule50, null)))).toEqual(Rg.random);
    setSeed(4343);
    const rule5 = F.pbLittleCupRules(false);
    expect(Array.from({ length: 6 }, () => desc(F.pbRandomPokemonFromRule(rule5, null)))).toEqual(Rg.randomLittle);
    setSeed(55);
    const pika = F.pbGetBTPokemon("pikacupsingle").slice(0, 60).map((pk) => pk.createPokemon(20, 31, null));
    expect([...Array.from({ length: 12 }, (_, i) => F.isBattlePokemonDuplicate(pika[i]!, pika[i + 1]!)),
      F.isBattlePokemonDuplicate(pika[0]!, pika[0]!.clone())]).toEqual(Rg.duplicates);
    expect(F.pbRemoveDuplicates([...pika, ...pika.slice(0, 10)]).map((p) => p.species)).toEqual(Rg.removeDuplicates);
    expect(F.pbArrangeByTier(pika, rule50).map((p) => p.species)).toEqual(Rg.arrangeByTier);
    setSeed(66);
    const party = pika.slice(0, 5);
    F.pbReplenishBattlePokemon(party, rule50);
    expect(party.map(desc)).toEqual(Rg.replenish);
    // Trainer info
    const original = pbLoadTrainerLists();
    try {
      written.length = 0;
      setSeed(88);
      const plist = pika.slice(0, 40);
      await F.pbTrainerInfo(plist, "pikacupsingle", F.pbBattleTowerRules(false, false));
      const saved = F.loadTrainerListsDat();
      const pkList = saved.find((tr) => tr[2].includes("pikacupsingle"))!;
      expect({
        files: ["Data/trainer_lists.dat", ...written], lists: saved.length, isDefault: pkList[5],
        trainers: pkList[0].slice(0, 12).map((t) => [t[0], t[1], t[5]]),
        numbersHash: fnv(pkList[0].map((t) => t[5].join(",")).join("|")),
        pokemon: pkList[1].map(pbp), levels: plist.map((p) => p.level),
      }).toEqual(Rg.trainerInfo);
      setMiscPBSData({ trainerLists: original });
      setSeed(99);
      await F.pbTrainerInfo(pika.slice(0, 20), "brandnewcup", F.pbBattleTowerRules(false, false));
      const s2 = F.loadTrainerListsDat();
      const last = s2[s2.length - 1]!;
      expect({ lists: s2.length, last: [last[2], last[3], last[4], last[5], last[0].length, fnv(last[0].map((t) => t[5].join(",")).join("|"))] })
        .toEqual(Rg.trainerInfoNew);
    } finally {
      setMiscPBSData({ trainerLists: original });
    }
    // Ratings and battles
    setSeed(123);
    const pool = F.pbGetBTPokemon("towersingle").slice(300, 360).map((pk) => pk.createPokemon(50, 31, null));
    const trule = F.pbBattleTowerRules(false, false).copy().setNumber(2);
    const teams = Array.from({ length: 6 }, () => new F.RuledTeam(pool, trule));
    expect(teams.map((t) => t.team.map((p) => p.species))).toEqual(Rg.teams);
    expect(pool.length).toBe(Rg.poolLeft);
    expect(Array.from({ length: 6 }, (_, i) => F.pbDecideWinner(teams[i]!.team, teams[(i + 1) % 6]!.team, 50 + i * 7, 61 - i))).toEqual(Rg.decide);
    expect(Array.from({ length: 3 }, (_, i) => F.pbDecideWinnerScore(teams[i]!.team, teams[i + 3]!.team, 9))).toEqual(Rg.scores);
    expect(([["THUNDERBOLT", "WATER", "FLYING", null], ["EARTHQUAKE", "ELECTRIC", "ELECTRIC", "LEVITATE"],
      ["TACKLE", "GHOST", "GHOST", null], ["SHADOWBALL", "BUG", "GHOST", "WONDERGUARD"],
      ["FIREBLAST", "GRASS", "BUG", null], ["GROWL", "NORMAL", "NORMAL", null]] as const).map(([m, t1, t2, a]) =>
      F.pbDecideWinnerEffectiveness(m, t1, t2, a, [-16, -8, 0, 4, 12, 20]))).toEqual(Rg.effectiveness);
    setSeed(200);
    const rounds: number[][][] = [];
    for (let r = 0; r < 3; r++) {
      for (let j = 0; j < teams.length; j++) await F.pbRuledBattle(teams[j]!, teams[(j + 2) % 6]!, trule);
      rounds.push(teams.map((t) => [t.games, t.totalGames]));
    }
    for (const t of teams) t.updateRating();
    expect(rounds).toEqual(Rg.ratings.rounds);
    const after = teams.map((t) => [...t.ratingRaw, t.totalGames, t.rating]);
    after.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(Rg.ratings.after[i][j], 9)));
    log = [];
    errors = [];
    setSeed(Rg.realBattle.seed);
    await F.pbRuledBattle(teams[0]!, teams[1]!, trule);
    expect({ seed: Rg.realBattle.seed, log, errorCount: errors.length, firstError: Rg.realBattle.firstError, games: [teams[0]!.games, teams[1]!.games],
      parties: [teams[0]!.team.map(desc), teams[1]!.team.map(desc)] }).toEqual(Rg.realBattle);
    const elo = new F.PlayerRatingElo();
    expect([elo.winChancePercent(), err(() => elo.update([])) ?? null, err(() => elo.update([new F.SingleMatch(1500, 300, 1)]))])
      .toEqual(Rg.elo);
    const pr = new F.PlayerRating();
    pr.update([]);
    [pr.rating, pr.deviation, pr.volatility, pr.winChancePercent()].forEach((v, j) => expect(v).toBeCloseTo(Rg.rating0[j], 9));
    expect([err(() => teams[0]!.toStr()), err(() => teams[0]!.load(pool)), err(() => teams[0]!.compare(teams[1]!))]).toEqual(Rg.errors);
    setSeed(300);
    expect([...([[0, null, 0, 12], [1, null, 1, 8], [2, null, null, 100], [3, null, 0, 5], [0, null, 2, 3]] as const)
      .map((a) => F.getRandomNameEx(...(a as unknown as [number, null, number | null, number]))),
    ...Array.from({ length: 5 }, () => F.getRandomNameEx(1, null, 0, 12))]).toEqual(Rg.names);
  });
});

//===============================================================================
async function runChallenge(id: string, rounds: number, rules: Rules, partySpecs: MonSpec[], seed: number, maxBattles: number) {
  G.pokemonGlobal.challenge = null;
  setSeed(seed);
  saves = 0;
  player.party = partySpecs.map(mon);
  player.party.push(mon({ s: "PIDGEY", l: 10 }));
  const res: Record<string, unknown> = { eligibleBeforeSet: err(() => F.pbHasEligible()), battles: [] as unknown[] };
  const c = F.pbBattleChallenge();
  await c.set(id, rounds, rules);
  res.eligible = F.pbHasEligible();
  c.setParty(player.party.slice(0, 3));
  await c.start(0, rounds);
  res.trainers = c.bc.trainers;
  res.partyAfterStart = player.party.map((p) => p.species);
  for (let n = 0; n < maxBattles; n++) {
    log = [];
    errors = [];
    const b: Record<string, unknown> = { battleNumber: c.battleNumber, next: c.nextTrainer, speech: F.pbBattleChallengeBeginSpeech() };
    const won = await F.pbBattleChallengeBattle();
    b.won = won;
    b.log = log;
    b.errors = errors;
    b.party = player.party.map(desc);
    b.record = G.gameTemp.lastBattleRecord != null;
    (res.battles as unknown[]).push(b);
    if (won) {
      c.pbAddWin();
      if (c.pbMatchOver()) {
        c.setDecision(1);
        break;
      }
      await c.pbGoOn();
    } else {
      c.setDecision(2);
      break;
    }
  }
  res.decision = c.decision;
  res.wins = c.wins;
  F.pbRecordLastBattle();
  await c.pbEnd();
  res.partyAfterEnd = player.party.map((p) => p.species);
  res.results = [c.getCurrentWins(id), c.getPreviousWins(id), c.getMaxWins(id), c.getPreviousWins(0 as never), c.getMaxWins(0 as never)];
  res.inChallenge = c.pbInChallenge();
  res.saves = saves;
  res.lastbattle = G.pokemonGlobal.lastbattle != null;
  return res;
}

const STRONG: MonSpec[] = [
  { s: "TYRANITAR", l: 70, n: "ADAMANT", i: "LEFTOVERS", m: ["CRUNCH", "ROCKSLIDE", "EARTHQUAKE", "DRAGONDANCE"] },
  { s: "SALAMENCE", l: 70, n: "JOLLY", i: "CHOICEBAND", m: ["DRAGONCLAW", "FLY", "EARTHQUAKE", "CRUNCH"] },
  { s: "DRAGONITE", l: 70, n: "ADAMANT", i: "SITRUSBERRY", m: ["OUTRAGE", "EXTREMESPEED", "FIREPUNCH", "EARTHQUAKE"] },
];
const WEAK: MonSpec[] = [
  { s: "CATERPIE", l: 12, m: ["TACKLE", "STRINGSHOT"] },
  { s: "WEEDLE", l: 12, m: ["POISONSTING"] },
  { s: "MAGIKARP", l: 15, m: ["SPLASH", "TACKLE"] },
];

describe("Battle Tower challenges vs Ruby", () => {
  const cases: [string, string, number, () => Rules, MonSpec[], number, number][] = [
    ["tower single lv50", "towersingle", 7, () => F.pbBattleTowerRules(false, false), STRONG, 11, 7],
    ["tower single open, lost", "towersingleopen", 7, () => F.pbBattleTowerRules(false, true), WEAK, 12, 3],
    ["tower double, 3 rounds", "towerdouble", 3, () => F.pbBattleTowerRules(true, false), [...STRONG, WEAK[0]!], 13, 3],
  ];
  for (const [i, [name, id, n, rb, party, seed, maxb]] of cases.entries()) {
    it(name, async () => {
      const res: Record<string, unknown> = { name, id, ...(await runChallenge(id, n, rb(), party, seed, maxb)) };
      const expected = R.challenge[i];
      expect(Object.keys(res).sort()).toEqual(Object.keys(expected).sort());
      for (const [k, v] of Object.entries(expected)) {
        if (k === "battles") {
          (v as unknown[]).forEach((b, j) => expect((res.battles as unknown[])[j]).toEqual(b));
          expect((res.battles as unknown[]).length).toBe((v as unknown[]).length);
        } else {
          expect([k, (res as Record<string, unknown>)[k]]).toEqual([k, v]);
        }
      }
    });
  }
});

//===============================================================================
class FakeSwapScene {
  calls: string[] = [];
  constructor(private script: unknown[]) {}
  nxt(kind: string): Any {
    const v = this.script.shift();
    this.calls.push(`${kind}=${String(v)}`);
    return v;
  }
  async pbStartRentScene(rentals: PokemonT[]) { this.calls.push(`startRent(${rentals.length})`); }
  async pbStartSwapScene(cur: PokemonT[], nw: PokemonT[]) { this.calls.push(`startSwap(${cur.length},${nw.length})`); }
  async pbChoosePokemon(canCancel: boolean) { return this.nxt(`choose(${canCancel})`); }
  async pbShowCommands(commands: string[]) { return this.nxt(`commands(${commands.join("|")})`); }
  async pbConfirm(message: string) { return this.nxt(`confirm(${message})`); }
  async pbSummary(list: PokemonT[], index: number) { this.calls.push(`summary(${list[index]!.species})`); }
  pbUpdateChoices(choices: number[]) { this.calls.push(`choices(${choices.join(",")})`); }
  pbSwapChosen(i: number) { this.calls.push(`swapChosen(${i})`); }
  pbSwapCanceled() { this.calls.push("swapCanceled"); }
  async pbEndScene() { this.calls.push("end"); }
}

describe("Battle Swap vs Ruby", () => {
  it("rents and swaps like Ruby", async () => {
    setSeed(400);
    const rent = F.pbGetBTPokemon("towersingle").slice(0, 6).map((pk) => pk.createPokemon(50, 10, null));
    const theirs = F.pbGetBTPokemon("towersingle").slice(100, 103).map((pk) => pk.createPokemon(50, 10, null));
    const out = [];
    for (const sw of R.swap as { name: string; script: unknown[] }[]) {
      const scene = new FakeSwapScene([...sw.script]);
      const screen = new F.BattleSwapScreen(scene);
      const cur = rent.slice(0, 3);
      const r = sw.name.startsWith("rent") ? (await screen.pbStartRent(rent)).map((p) => p.species) : await screen.pbStartSwap(cur, theirs);
      out.push({ name: sw.name, script: sw.script, result: r, current: cur.map((p) => p.species), calls: scene.calls });
    }
    expect(out).toEqual(R.swap);
  });
});

//===============================================================================
describe("Battle Frontier saving", () => {
  it("saves a challenge in progress and keeps the player's party its party", async () => {
    G.pokemonGlobal.challenge = null;
    setSeed(9);
    player.party = STRONG.map(mon);
    const c = F.pbBattleChallenge();
    await c.set("towersingle", 7, F.pbBattleTowerRules(false, false));
    c.setParty(player.party.slice(0, 2).concat(player.party.slice(2, 3)));
    await c.start();
    c.pbAddWin();
    const json = JSON.parse(JSON.stringify(FrontierMarshal.dump(c)));
    const back = FrontierMarshal.load(json) as InstanceType<typeof F.BattleChallenge>;
    expect(back.wins).toBe(1);
    expect(back.battleNumber).toBe(2);
    expect(back.bc.trainers).toEqual(c.bc.trainers);
    expect(back.bc.oldParty![0]).toBe(back.bc.party![0]); // shared Pokémon stay shared
    expect(back.rules.ruleset.isPokemonValid(back.bc.party![0])).toBe(true);
    expect(back.rules.levelAdjustment).toBeInstanceOf(F.CappedLevelAdjustment);
  });
});
