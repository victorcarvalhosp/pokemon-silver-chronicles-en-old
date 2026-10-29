// The battle Debug menu's options (DebugBattleCommands.ts, 004_Debug_BattleCommands.rb),
// its Pokémon editor (DebugBattlePkmnCommands.ts, 005_Debug_BattlePkmnCommands.rb
// with the Gen 9 Pack's :set_status) and the effects editor
// (DebugBattleExtraCode.ts, 006_Debug_BattleExtraCode.rb with the plugins'
// DebugVariables): each effect runs on a headless battle with scripted answers
// for pbMessage/pbMessageChooseNumber/pbConfirmMessage and the list choosers,
// and the effects editor's loop gets scripted button presses.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Battle as BattleType } from "../battle/battle/Battle";
import { PBEffects } from "../battle/other/PBEffects";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { MenuHandlers } from "../ui/menus/menuHandlers";

/** Scripted answers: pbMessage commands, chosen numbers, confirmations and chooser IDs. */
const commands: number[] = [];
const numbers: number[] = [];
const confirms: boolean[] = [];
const chosen: (string | null)[] = [];
const messages: string[] = [];
vi.mock("../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../ui/messages")>()),
  pbMessage: async (msg: string, cmds: string[] | null = null) => {
    messages.push(msg);
    return cmds ? commands.shift() ?? -1 : 0;
  },
  pbMessageChooseNumber: async (msg: string, params: { initialNumber: number; cancelNumber: number }) => {
    messages.push(msg);
    return numbers.length > 0 ? numbers.shift()! : params.cancelNumber;
  },
  pbConfirmMessage: async (msg: string) => { messages.push(msg); return confirms.shift() ?? false; },
}));
vi.mock("./EditorUtilities", () => ({
  pbChooseMoveList: async () => chosen.shift() ?? null,
  pbChooseItemList: async () => chosen.shift() ?? null,
  pbChooseAbilityList: async () => chosen.shift() ?? null,
  pbChooseSpeciesList: async () => chosen.shift() ?? null,
  pbChooseTypeList: async () => chosen.shift() ?? null,
  pbChooseStatList: async (mode: string) => { messages.push(`stat list ${mode}`); return chosen.shift() ?? null; },
}));
const poolResults: string[][] = [];
vi.mock("./EditorDataTypes", () => ({
  GameDataPoolProperty: class {
    constructor(public gameData: string) {}
    async set(_name: string | null, old: string[]): Promise<string[]> { return poolResults.shift() ?? old; }
  },
}));

// The effects editor's frames: which row the window is on and which buttons are pressed.
interface Frame { index?: number; trigger?: number[]; repeat?: number[] }
const frames: Frame[] = [];
let frame: Frame = {};
vi.mock("../rgss/Graphics", async (orig) => {
  const mod = await orig<typeof import("../rgss/Graphics")>();
  return { ...mod, Graphics: Object.assign(mod.Graphics, { update: async () => {} }) };
});
vi.mock("../rgss/Input", async (orig) => {
  const mod = await orig<typeof import("../rgss/Input")>();
  return {
    ...mod,
    Input: Object.assign(mod.Input, {
      update: () => { frame = frames.shift() ?? { trigger: [mod.Input.BACK] }; },
      trigger: (b: number) => frame.trigger?.includes(b) ?? false,
      repeat: (b: number) => frame.repeat?.includes(b) ?? false,
    }),
  };
});
vi.mock("../rgss/display", async (orig) => ({
  ...(await orig<typeof import("../rgss/display")>()),
  Viewport: class { z = 0; dispose(): void {} },
}));
// A list window that only tracks its row (set by the scripted frames).
vi.mock("../ui/windows/SpriteWindowText", async (orig) => ({
  ...(await orig<typeof import("../ui/windows/SpriteWindowText")>()),
  Window_DrawableCommand: class {
    index = 0;
    active = false;
    refreshes = 0;
    update(): void { if (frame.index !== undefined) this.index = frame.index; }
    refresh(): void { this.refreshes += 1; }
    dispose(): void {}
  },
}));

const { Battle, DebugSceneNoLogging } = await import("../battle");
const { BattleDebugVariables, BattleDebugSetEffects } = await import("./DebugBattleExtraCode");
const { Input } = await import("../rgss/Input");

let player: Player;

beforeAll(async () => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  await import("./DebugBattleCommands");
  await import("./DebugBattlePkmnCommands");
});

beforeEach(() => {
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
  commands.length = numbers.length = confirms.length = chosen.length = messages.length = frames.length = 0;
  poolResults.length = 0;
});

function makePokemon(species: string): Pokemon {
  const pkmn = new Pokemon(species, 50, player as never);
  pkmn.ability = "HONEYGATHER";
  pkmn.item = null;
  pkmn.calcStats();
  return pkmn;
}

async function makeBattle(): Promise<BattleType> {
  const scene = new DebugSceneNoLogging();
  const battle = new Battle(scene, [makePokemon("MEW")], [makePokemon("SNORLAX")], player, null);
  battle.internalBattle = true;
  await scene.pbStartBattle(battle);
  battle.pbSetUpSides();
  return battle;
}

const battleCall = (option: string, battle: BattleType) => MenuHandlers.call("battle_debug_menu", option, "effect", battle);
const pkmnCall = (option: string, battle: BattleType, battler = battle.battlers[0]!) =>
  MenuHandlers.call("battle_pokemon_debug_menu", option, "effect", battler.pokemon, battler, battle);

describe("battle Debug menu registration", () => {
  it("registers every option of 004/005 with their parents and usage", () => {
    const names = (menu: string) => MenuHandlers.eachAvailable(menu).map(([o]) => o);
    expect(names("battle_debug_menu")).toEqual([
      "battlers", "list_player_battlers", "list_foe_battlers", "speed_order", "pokemon_teams", "trainers",
      "trainer_items", "mega_evolution", "field", "weather", "terrain", "environment_time", "backdrop",
      "set_field_effects", "player_side", "opposing_side", "position_effects",
    ]);
    expect(names("battle_pokemon_debug_menu")).toEqual([
      "hp_status_menu", "set_hp", "set_status", "full_heal", "level_stats", "set_stat_stages", "set_stat_values",
      "set_level", "set_exp", "hidden_values", "set_happiness", "set_types", "moves", "teach_move", "forget_move",
      "set_move_pp", "reset_moves", "set_item", "set_ability", "set_nature", "set_gender", "set_form",
      "set_species", "set_shininess", "shadow_pokemon", "set_effects",
    ]);
    const usage = (o: string) => MenuHandlers.eachAvailable("battle_pokemon_debug_menu").find(([n]) => n === o)![1].usage;
    expect(usage("set_stat_stages")).toBe("battler");
    expect(usage("reset_moves")).toBe("pokemon");
    expect(usage("set_hp")).toBe("both");
  });
});

describe("Battle::DebugVariables", () => {
  it("keeps Essentials' order, then the Gen 9 Pack, Deluxe and ZUD additions", () => {
    const battler = [...BattleDebugVariables.BATTLER_EFFECTS.keys()];
    // Ruby hashes keep insertion order: Rage Powder is listed after Follow Me.
    expect(battler.indexOf(PBEffects.RagePowder)).toBe(battler.indexOf(PBEffects.FollowMe) + 1);
    expect(battler.slice(battler.indexOf(PBEffects.Yawn))).toEqual([
      PBEffects.Yawn, PBEffects.AllySwitch, PBEffects.CudChew, PBEffects.DoubleShock, PBEffects.GlaiveRush,
      PBEffects.ParadoxStat, PBEffects.BoosterEnergy, PBEffects.SaltCure, PBEffects.SilkTrap, PBEffects.Splinters,
      PBEffects.SplintersType, PBEffects.SupremeOverlord, PBEffects.CriticalBoost, PBEffects.MaxGuard,
    ]);
    expect(BattleDebugVariables.BATTLER_EFFECTS.get(PBEffects.ParadoxStat)).toMatchObject({ default: null, type: "stat" });
    expect(BattleDebugVariables.BATTLER_EFFECTS.get(PBEffects.SplintersType)).toMatchObject({ default: null, type: "type" });
    expect(BattleDebugVariables.BATTLER_EFFECTS.get(PBEffects.CriticalBoost)).toMatchObject({ default: 0, max: 4 });
    expect([...BattleDebugVariables.SIDE_EFFECTS.keys()].slice(-5)).toEqual([
      PBEffects.VineLash, PBEffects.Wildfire, PBEffects.Cannonade, PBEffects.Volcalith, PBEffects.Steelsurge,
    ]);
    expect([...BattleDebugVariables.POSITION_EFFECTS.keys()]).toEqual([
      PBEffects.HealingWish, PBEffects.LunarDance, PBEffects.ZHeal,
    ]);
    expect(BattleDebugVariables.FIELD_EFFECTS.get(PBEffects.PayDay)!.max).toBe(999_999);
    expect(BattleDebugVariables.BATTLER_EFFECTS.has(PBEffects.Toxic)).toBe(false);
  });
});

describe("field options", () => {
  it("sets the weather type (5 rounds by default), its duration and clears it", async () => {
    const battle = await makeBattle();
    const types = GameData.BattleWeather.each().filter((w) => w.id !== "None").map((w) => w.id);
    commands.push(0, types.indexOf("Rain"), -1);
    await battleCall("weather", battle);
    expect([battle.field.weather, battle.field.weatherDuration]).toEqual(["Rain", 5]);
    commands.push(1, -1);
    numbers.push(8);
    await battleCall("weather", battle);
    expect(battle.field.weatherDuration).toBe(8);
    commands.push(1, -1);
    numbers.push(0); // 0 = infinite
    await battleCall("weather", battle);
    expect(battle.field.weatherDuration).toBe(-1);
    expect(messages.at(-1)).toBe("\\ts[]Current weather: Rain\r\nDuration : Infinite");
    commands.push(2, -1);
    await battleCall("weather", battle);
    expect([battle.field.weather, battle.field.weatherDuration]).toEqual(["None", 0]);
    commands.push(1, -1);
    await battleCall("weather", battle);
    expect(messages).toContain("\\ts[]There is no weather.");
  });

  it("sets the terrain and its duration", async () => {
    const battle = await makeBattle();
    const types = GameData.BattleTerrain.each().filter((t) => t.id !== "None").map((t) => t.id);
    commands.push(0, types.indexOf("Psychic"), 1, -1);
    numbers.push(3);
    await battleCall("terrain", battle);
    expect([battle.field.terrain, battle.field.terrainDuration]).toEqual(["Psychic", 3]);
  });

  it("sets the environment and the time of day", async () => {
    const battle = await makeBattle();
    const envs = GameData.Environment.each().map((e) => e.id);
    commands.push(0, envs.indexOf("Cave"), 1, 2, -1);
    await battleCall("environment_time", battle);
    expect([battle.environment, battle.time]).toEqual(["Cave", 2]);
  });
});

describe("trainer options", () => {
  it("toggles whether a trainer can Mega Evolve", async () => {
    const battle = await makeBattle();
    expect(battle.megaEvolution[0]![0]).toBe(-1);
    commands.push(0, -1);
    await battleCall("mega_evolution", battle);
    expect(battle.megaEvolution[0]![0]).toBe(-2);
  });

  it("edits an NPC trainer's items through GameDataPoolProperty", async () => {
    const battle = { opponent: [{ fullName: () => "Lance" }], player: [{ fullName: () => "Gold" }],
      items: [["FULLRESTORE"]], allyItems: null };
    poolResults.push(["HYPERPOTION", "FULLHEAL"]);
    commands.push(0, -1);
    await battleCall("trainer_items", battle as never);
    expect(battle.items).toEqual([["HYPERPOTION", "FULLHEAL"]]);
    // A wild battle has no NPC trainers.
    await battleCall("trainer_items", { opponent: null, player: [{}] } as never);
    expect(messages).toContain("\\ts[]There are no NPC trainers in this battle.");
  });
});

describe("Battle::DebugSetEffects", () => {
  const row = (table: Map<number, unknown>, effect: number) => [...table.keys()].indexOf(effect);

  it("sets Reflect's duration on the foe's side (Use chooses a number, Left/Right step it)", async () => {
    const battle = await makeBattle();
    const r = row(BattleDebugVariables.SIDE_EFFECTS, PBEffects.Reflect);
    frames.push({ index: r, trigger: [Input.USE] }, { index: r, repeat: [Input.RIGHT] });
    numbers.push(5);
    await battleCall("opposing_side", battle);
    expect(battle.sides[1]!.effects[PBEffects.Reflect]).toBe(6);
    expect(battle.sides[0]!.effects[PBEffects.Reflect]).toBe(0);
    expect(messages).toContain("Set value (0-99).");
    // Action resets it to the default; Left stops at the minimum.
    frames.push({ index: r, trigger: [Input.ACTION] }, { index: r, repeat: [Input.LEFT] });
    await battleCall("opposing_side", battle);
    expect(battle.sides[1]!.effects[PBEffects.Reflect]).toBe(0);
  });

  it("toggles boolean field effects and caps integers at their max", async () => {
    const battle = await makeBattle();
    const fe = BattleDebugVariables.FIELD_EFFECTS;
    frames.push({ index: row(fe, PBEffects.FusionBolt), trigger: [Input.USE] },
      { index: row(fe, PBEffects.HappyHour), repeat: [Input.RIGHT] },
      { index: row(fe, PBEffects.HappyHour), repeat: [Input.RIGHT] });
    await battleCall("set_field_effects", battle);
    expect(battle.field.effects[PBEffects.FusionBolt]).toBe(true);
    expect(battle.field.effects[PBEffects.HappyHour]).toBe(true);
    const se = BattleDebugVariables.SIDE_EFFECTS;
    battle.sides[0]!.effects[PBEffects.Spikes] = 3;
    frames.push({ index: row(se, PBEffects.Spikes), repeat: [Input.RIGHT] });
    await battleCall("player_side", battle);
    expect(battle.sides[0]!.effects[PBEffects.Spikes]).toBe(3);
  });

  it("edits a battler's effects: battler indices, moves, and the Gen 9 stat/type kinds", async () => {
    const battle = await makeBattle();
    const be = BattleDebugVariables.BATTLER_EFFECTS;
    const mew = battle.battlers[0]!;
    commands.push(2); // [None], [0] Mew, [1] Snorlax
    chosen.push("TACKLE", "ATTACK", "FIRE");
    frames.push(
      { index: row(be, PBEffects.LeechSeed), trigger: [Input.USE] },
      { index: row(be, PBEffects.Attract), repeat: [Input.RIGHT] },
      { index: row(be, PBEffects.DisableMove), trigger: [Input.USE] },
      { index: row(be, PBEffects.ParadoxStat), trigger: [Input.USE] },
      { index: row(be, PBEffects.SplintersType), trigger: [Input.USE] },
      { index: row(be, PBEffects.Substitute), trigger: [Input.USE] },
    );
    numbers.push(42);
    await pkmnCall("set_effects", battle);
    expect(mew.effects[PBEffects.LeechSeed]).toBe(1);
    expect(mew.effects[PBEffects.Attract]).toBe(0);
    expect(mew.effects[PBEffects.DisableMove]).toBe("TACKLE");
    expect(mew.effects[PBEffects.ParadoxStat]).toBe("ATTACK");
    expect(mew.effects[PBEffects.SplintersType]).toBe("FIRE");
    expect(mew.effects[PBEffects.Substitute]).toBe(42);
    expect(messages).toContain("stat list main_battle");
    expect(messages).toContain("Set value (0-999).");
    // Action clears an ID.
    frames.push({ index: row(be, PBEffects.DisableMove), trigger: [Input.ACTION] });
    await pkmnCall("set_effects", battle);
    expect(mew.effects[PBEffects.DisableMove]).toBe(null);
  });

  it("edits a position's effects (Z-Healing starts as nil, as in ZUD)", async () => {
    const battle = await makeBattle();
    const pe = BattleDebugVariables.POSITION_EFFECTS;
    expect(battle.positions[1]!.effects[PBEffects.ZHeal]).toBeUndefined();
    commands.push(1, -1);
    frames.push({ index: row(pe, PBEffects.ZHeal), trigger: [Input.USE] });
    await battleCall("position_effects", battle);
    expect(battle.positions[1]!.effects[PBEffects.ZHeal]).toBe(true);
  });

  it("can be constructed directly for each mode", async () => {
    const battle = await makeBattle();
    for (const [mode, side] of [["field", 0], ["side", 1], ["position", 0], ["battler", 1]] as const) {
      const editor = new BattleDebugSetEffects(battle, mode, side);
      frames.push({ trigger: [Input.BACK] });
      await editor.update();
      editor.dispose();
    }
  });
});

describe("battle Pokémon editor", () => {
  it("sets a battler's HP (min 1 in battle) and heals it", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    numbers.push(20);
    await pkmnCall("set_hp", battle);
    expect([mew.hp, mew.pokemon!.hp]).toEqual([20, 20]);
    expect(messages.at(-1)).toBe(`\\ts[]Set ${mew.pbThis(true)}'s HP (1-${mew.totalhp}).`);
    await pkmnCall("full_heal", battle);
    expect(mew.hp).toBe(mew.totalhp);
  });

  it("sets statuses: sleep turns, toxic count, and the Gen 9 Drowsy count", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    const ids = ["NONE", ...GameData.Status.each().filter((s) => s.id !== "NONE").map((s) => s.id)];
    commands.push(ids.indexOf("SLEEP"), -1);
    numbers.push(4);
    await pkmnCall("set_status", battle);
    expect([mew.status, mew.statusCount]).toEqual(["SLEEP", 4]);
    commands.push(ids.indexOf("POISON"), -1);
    confirms.push(true);
    numbers.push(3);
    await pkmnCall("set_status", battle);
    expect([mew.status, mew.statusCount, mew.effects[PBEffects.Toxic]]).toEqual(["POISON", 1, 3]);
    commands.push(ids.indexOf("PARALYSIS"), 0, -1);
    await pkmnCall("set_status", battle);
    expect(mew.status).toBe("NONE");
    // NOTE (Ruby parity): Battler#status= drops a Drowsy battler's count.
    commands.push(ids.indexOf("DROWSY"), -1);
    numbers.push(5);
    await pkmnCall("set_status", battle);
    expect(messages).toContain(`\\ts[]Set ${mew.pbThis(true)}'s drowsy count (0-99).`);
    expect([mew.status, mew.statusCount]).toEqual(["DROWSY", 0]);
    // A party Pokémon keeps it.
    const party = makePokemon("PIKACHU");
    commands.push(ids.indexOf("DROWSY"), -1);
    numbers.push(5);
    await MenuHandlers.call("battle_pokemon_debug_menu", "set_status", "effect", party, null, battle);
    expect([party.status, party.statusCount]).toEqual(["DROWSY", 5]);
  });

  it("sets and resets stat stages", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    const stats = GameData.Stat.eachBattle().map((s) => s.id);
    commands.push(stats.indexOf("SPEED"), stats.indexOf("ATTACK"), -1);
    numbers.push(-3, 2);
    await pkmnCall("set_stat_stages", battle);
    expect([mew.stages.SPEED, mew.stages.ATTACK]).toEqual([-3, 2]);
    commands.push(stats.length, -1); // [Reset all]
    await pkmnCall("set_stat_stages", battle);
    expect(stats.every((s) => mew.stages[s] === 0)).toBe(true);
  });

  it("sets a battler's stat values and recalculates them", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    const stats = GameData.Stat.eachMainBattle().map((s) => s.id);
    const before = mew.attack;
    commands.push(stats.indexOf("ATTACK"), -1);
    numbers.push(999);
    await pkmnCall("set_stat_values", battle);
    expect(mew.attack).toBe(999);
    commands.push(stats.length, -1);
    await pkmnCall("set_stat_values", battle);
    expect(mew.attack).toBe(before);
  });

  it("sets the battler's or the Pokémon's ability", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    commands.push(1, -1);
    chosen.push("INTIMIDATE");
    await pkmnCall("set_ability", battle);
    expect([mew.abilityId, mew.pokemon!.abilityId]).toEqual(["INTIMIDATE", "HONEYGATHER"]);
    commands.push(0, -1);
    chosen.push("LEVITATE");
    await pkmnCall("set_ability", battle);
    expect([mew.abilityId, mew.pokemon!.abilityId]).toEqual(["LEVITATE", "LEVITATE"]);
  });

  it("sets and removes the held item", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    commands.push(0, -1);
    chosen.push("LEFTOVERS");
    await pkmnCall("set_item", battle);
    expect([mew.itemId, mew.pokemon!.itemId]).toEqual(["LEFTOVERS", "LEFTOVERS"]);
    commands.push(1, -1);
    await pkmnCall("set_item", battle);
    expect([mew.itemId, mew.pokemon!.itemId]).toEqual([null, null]);
  });

  it("sets, adds and removes types", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    commands.push(1, 2, -1);
    chosen.push("FIRE", "GHOST");
    await pkmnCall("set_types", battle);
    expect(mew.types).toEqual(["PSYCHIC", "FIRE"]);
    expect(mew.effects[PBEffects.Type3]).toBe("GHOST");
    commands.push(0, -1);
    chosen.push("PSYCHIC");
    confirms.push(true);
    await pkmnCall("set_types", battle);
    expect(mew.types).toEqual(["FIRE"]);
  });

  it("teaches and forgets moves on both the Pokémon and the battler", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    const pkmn = mew.pokemon!;
    while (pkmn.numMoves() > 3) pkmn.forgetMoveAtIndex(0);
    mew.moves.splice(0, mew.moves.length - pkmn.numMoves());
    chosen.push("SURF");
    await pkmnCall("teach_move", battle);
    expect(pkmn.moves.at(-1)!.id).toBe("SURF");
    expect(mew.moves.at(-1)!.id).toBe("SURF");
    commands.push(pkmn.numMoves() - 1);
    await pkmnCall("forget_move", battle);
    expect(pkmn.hasMove("SURF")).toBe(false);
    expect(mew.moves.some((m) => m.id === "SURF")).toBe(false);
  });

  it("sets a move's PP on the battler too", async () => {
    const battle = await makeBattle();
    const mew = battle.battlers[0]!;
    commands.push(0, 0, -1, -1);
    numbers.push(1);
    await pkmnCall("set_move_pp", battle);
    expect([mew.pokemon!.moves[0]!.pp, mew.moves[0]!.pp]).toEqual([1, 1]);
  });
});
