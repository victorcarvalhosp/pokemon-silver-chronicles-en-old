// The Pokémon Debug menu's options (DebugPokemonCommands.ts, 007_Debug_PokemonCommands.rb
// with the v20.1 Hotfixes / Gen 9 Pack / Essentials Deluxe / Enhanced UI versions):
// each effect is driven with a fake screen whose pbShowCommands/pbConfirm give
// scripted answers, pbMessageChooseNumber and the list choosers are stubbed.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameVariables } from "../game/globals";
import { setMessageHook } from "../game/items/itemUtilities";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { MenuHandlers } from "../ui/menus/menuHandlers";
import type { PokemonDebugScreen } from "./DebugMenus";

/** Answers for pbMessageChooseNumber (the default value when empty) and the choosers. */
const numbers: number[] = [];
const chosen: (string | null)[] = [];
const messages: string[] = [];
vi.mock("../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../ui/messages")>()),
  pbMessageChooseNumber: async (msg: string, params: { initialNumber: number; minNumber: number; maxNumber: number }) => {
    messages.push(msg);
    if (numbers.length === 0) return params.initialNumber;
    return Math.min(Math.max(numbers.shift()!, params.minNumber), params.maxNumber);
  },
  pbMessage: async (msg: string) => { messages.push(msg); return 0; },
}));
vi.mock("./EditorUtilities", () => ({
  pbChooseMoveList: async () => chosen.shift() ?? null,
  pbChooseItemList: async () => chosen.shift() ?? null,
  pbChooseAbilityList: async () => chosen.shift() ?? null,
  pbChooseSpeciesList: async () => chosen.shift() ?? null,
}));
vi.mock("../ui/textEntry/UI_TextEntry", () => ({
  pbEnterPokemonName: async () => chosen.shift() ?? "",
  pbEnterPlayerName: async () => chosen.shift() ?? "",
}));

/** A PokemonDebugScreen answering pbShowCommands/pbConfirm/pbChooseMove from scripts. */
class FakeScreen implements PokemonDebugScreen {
  commands: number[] = [];
  confirms: boolean[] = [];
  shown: { help: string; commands: string[]; index?: number }[] = [];
  displayed: string[] = [];
  refreshed = 0;
  constructor(commands: number[] = [], confirms: boolean[] = []) {
    this.commands = commands;
    this.confirms = confirms;
  }
  async pbShowCommands(help: string, commands: string[], index?: number): Promise<number> {
    this.shown.push({ help, commands, index });
    return this.commands.shift() ?? -1;
  }
  async pbDisplay(text: string): Promise<void> { this.displayed.push(text); }
  async pbConfirm(text: string): Promise<boolean> { this.displayed.push(text); return this.confirms.shift() ?? false; }
  async pbChooseMove(_pkmn: Pokemon, _help: string): Promise<number> { return this.commands.shift() ?? -1; }
  pbRefreshSingle(): void { this.refreshed += 1; }
  pbUpdate(): void {}
}

let player: Player;
const run = (option: string, pkmn: Pokemon, screen: PokemonDebugScreen, settingUpBattle = false, pkmnid: unknown = 0,
  heldpoke: Pokemon | null = null) =>
  MenuHandlers.call("pokemon_debug_menu", option, "effect", pkmn, pkmnid, heldpoke, settingUpBattle, screen) as Promise<boolean>;

beforeAll(async () => {
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  await import("./DebugPokemonCommands");
  await import("../battle/zud/Debug");
  await import("./DebugPokemonCommands_EnhancedUI");
});

beforeEach(() => {
  numbers.length = 0;
  chosen.length = 0;
  messages.length = 0;
  setMessageHook(async (text) => { messages.push(text); return 0; }, async () => false);
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameMap = null;
});

const make = (species = "PIKACHU", level = 20) => new Pokemon(species, level, player as never);

describe("Pokémon Debug menu options", () => {
  it("registers the options in Essentials' order with the plugins' submenus", () => {
    const options = MenuHandlers.eachAvailable("pokemon_debug_menu");
    const main = options.filter(([, h]) => h.parent === "main").map(([o]) => o);
    expect(main).toEqual(["hp_status_menu", "level_stats", "moves", "set_item", "set_ability", "set_nature",
      "set_gender", "species_and_form", "cosmetic", "set_discardable", "set_egg", "shadow_pkmn", "mystery_gift",
      "duplicate", "delete", "dx_pokemon_menu"]);
    const dx = options.filter(([, h]) => h.parent === "dx_pokemon_menu").map(([o]) => o);
    expect(dx).toEqual(["set_ace", "set_scale", "set_dynamax", "set_shiny_leaf"]);
  });

  it("sets HP, makes fainted and fully heals", async () => {
    const pkmn = make();
    numbers.push(7);
    const screen = new FakeScreen();
    expect(await run("set_hp", pkmn, screen)).toBe(false);
    expect(pkmn.hp).toBe(7);
    expect(messages[0]).toBe(`Set Pikachu's HP (max. ${pkmn.totalhp}).`);
    await run("make_fainted", pkmn, screen);
    expect(pkmn.hp).toBe(0);
    await run("full_heal", pkmn, screen);
    expect(pkmn.hp).toBe(pkmn.totalhp);
    expect(screen.displayed).toEqual(["Pikachu was fully healed."]);
    expect(screen.refreshed).toBe(3);
  });

  it("sets a status, with a sleep or drowsy count (Gen 9 Pack)", async () => {
    const pkmn = make();
    const ids = ["NONE", ...GameData.Status.each().filter((s) => s.id !== "NONE").map((s) => s.id)];
    const screen = new FakeScreen([ids.indexOf("SLEEP"), ids.indexOf("DROWSY"), -1]);
    numbers.push(5, 2);
    await run("set_status", pkmn, screen);
    expect(pkmn.status).toBe("DROWSY");
    expect(pkmn.statusCount).toBe(2);
    expect(messages).toEqual(["Set the Pokémon's sleep count.", "Set the Pokémon's drowsy count."]);
    expect(screen.shown[1]!.help).toBe("Current status: Sleep (turns: 5)");
    expect(screen.shown[0]!.commands[0]).toBe("[Cure]");
    // A count of 0 cancels; [Cure] heals
    numbers.push(0);
    await run("set_status", pkmn, new FakeScreen([ids.indexOf("SLEEP"), 0, -1]));
    expect(pkmn.status).toBe("NONE");
    pkmn.hp = 0;
    const fainted = new FakeScreen();
    await run("set_status", pkmn, fainted);
    expect(fainted.displayed).toEqual(["Pikachu is fainted, can't change status."]);
  });

  it("gives, uninfects and clears Pokérus", async () => {
    const pkmn = make();
    await run("set_pokerus", pkmn, new FakeScreen([0, 1]));
    expect(pkmn.pokerusStage()).toBe(2);
    expect(pkmn.pokerus % 16).toBe(0);
    await run("set_pokerus", pkmn, new FakeScreen([2]));
    expect(pkmn.pokerus).toBe(0);
  });

  it("sets level and Exp", async () => {
    const pkmn = make("PIKACHU", 20);
    numbers.push(42);
    await run("set_level", pkmn, new FakeScreen());
    expect(pkmn.level).toBe(42);
    expect(messages[0]).toBe(`Set the Pokémon's level (max. ${GameData.GrowthRate.maxLevel()}).`);
    const minxp = pkmn.growthRate().minimumExpForLevel(42);
    numbers.push(minxp + 3);
    await run("set_exp", pkmn, new FakeScreen());
    expect(pkmn.exp).toBe(minxp + 3);
    expect(pkmn.level).toBe(42);
  });

  it("sets EVs (capped by the total) and IVs", async () => {
    const pkmn = make();
    numbers.push(252, 252, 252);
    // Set EVs: HP, Attack, Defense (the third is capped to 510 - 504 = 6), back, back
    await run("hidden_values", pkmn, new FakeScreen([0, 0, 1, 2, -1, -1]));
    expect(pkmn.ev.HP).toBe(252);
    expect(pkmn.ev.ATTACK).toBe(252);
    expect(pkmn.ev.DEFENSE).toBe(6);
    expect(messages[2]).toBe("Set the EV for Defense (max. 6).");
    // Max randomise all reaches the EV limit
    const evCount = GameData.Stat.eachMain().length;
    await run("hidden_values", pkmn, new FakeScreen([0, evCount + 1, -1, -1]));
    const total = Object.values(pkmn.ev).reduce((a, b) => a + b, 0);
    expect(total).toBe(Pokemon.EV_LIMIT);
    for (const v of Object.values(pkmn.ev)) expect(v).toBeLessThanOrEqual(Pokemon.EV_STAT_LIMIT);
    numbers.push(0);
    const screen = new FakeScreen([1, 0, -1, -1]);
    await run("hidden_values", pkmn, screen);
    expect(pkmn.iv.HP).toBe(0);
    expect(screen.shown[1]!.help).toMatch(/^Change which IV\?\nHidden Power:\n.+, power \d+\nTotal: \d+\/186 \(\d+%\)$/);
    expect(screen.shown[0]!.help).toMatch(/^Personal ID is 0x[0-9A-F]{8}\.$/);
  });

  it("sets happiness, contest stats, Deluxe size and ace", async () => {
    const pkmn = make();
    numbers.push(200, 33, 255);
    await run("set_happiness", pkmn, new FakeScreen());
    await run("set_tough", pkmn, new FakeScreen());
    const screen = new FakeScreen();
    await run("set_scale", pkmn, screen);
    expect([pkmn.happiness, pkmn.tough, pkmn.scale]).toEqual([200, 33, 255]);
    expect(screen.displayed).toEqual(["Pikachu is now considered XXXL in size."]);
    numbers.push(150);
    await run("set_scale", pkmn, screen);
    expect(screen.displayed[1]).toBe("Pikachu is now considered Medium in size.");
    await run("set_ace", pkmn, screen);
    expect(pkmn.ace).toBe(true);
    await run("set_ace", pkmn, screen);
    expect(pkmn.ace).toBe(false);
    expect(screen.displayed.slice(2)).toEqual(["Pikachu is flagged as an ace Pokémon.", "Pikachu is unflagged as an ace Pokémon."]);
  });

  it("teaches, forgets and resets moves; sets PP", async () => {
    const pkmn = make("PIKACHU", 5);
    pkmn.forgetAllMoves();
    chosen.push("THUNDERBOLT");
    await run("teach_move", pkmn, new FakeScreen());
    expect(pkmn.moves.map((m) => m.id)).toEqual(["THUNDERBOLT"]);
    expect(messages).toEqual(["\\se[]Pikachu learned Thunderbolt!\\se[Pkmn move learnt]"]);
    // Set PP: move 0, Set PP Up 3, Set PP 1, back, back
    numbers.push(3, 1);
    await run("set_move_pp", pkmn, new FakeScreen([0, 2, 0, -1, -1]));
    expect(pkmn.moves[0]!.ppup).toBe(3);
    expect(pkmn.moves[0]!.pp).toBe(1);
    await run("set_move_pp", pkmn, new FakeScreen([1, -1])); // Restore all PP
    expect(pkmn.moves[0]!.pp).toBe(pkmn.moves[0]!.totalPp);
    const screen = new FakeScreen([0]);
    await run("forget_move", pkmn, screen);
    expect(pkmn.moves).toEqual([]);
    expect(screen.displayed).toEqual(["Pikachu forgot Thunderbolt."]);
    await run("reset_moves", pkmn, screen);
    expect(pkmn.moves.length).toBeGreaterThan(0);
    await run("set_initial_moves", pkmn, screen);
    expect(pkmn.firstMoves).toEqual(pkmn.moves.map((m) => m.id));
  });

  it("sets and removes the held item (mail gets a letter)", async () => {
    const pkmn = make();
    const mail = GameData.Item.each().find((i) => i.isMail())!;
    chosen.push(mail.id);
    await run("set_item", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.itemId).toBe(mail.id);
    expect(pkmn.mail?.message).toBe("Text");
    expect(pkmn.mail?.sender).toBe("Gold");
    await run("set_item", pkmn, new FakeScreen([1, -1]));
    expect(pkmn.hasItem()).toBe(false);
  });

  it("sets the ability, nature and gender", async () => {
    const pkmn = make();
    const abils = pkmn.getAbilityList();
    const hidden = abils.findIndex((a) => a[1] >= 2);
    const screen = new FakeScreen([0, hidden, -1]);
    await run("set_ability", pkmn, screen);
    expect(pkmn.abilityIndex).toBe(abils[hidden]![1]);
    expect(pkmn.abilityId).toBe(abils[hidden]![0]);
    expect(screen.shown[1]!.commands[hidden]).toBe("(H) " + GameData.Ability.get(abils[hidden]![0]).name);
    chosen.push("LEVITATE");
    await run("set_ability", pkmn, new FakeScreen([1, -1]));
    expect(pkmn.abilityId).toBe("LEVITATE");
    await run("set_ability", pkmn, new FakeScreen([2, -1]));
    expect(pkmn.abilityId).toBe(GameData.Species.get("PIKACHU").abilities[pkmn.personalID & 1] ??
      GameData.Species.get("PIKACHU").abilities[0]);

    const natures = GameData.Nature.each().map((n) => n.id);
    const nscreen = new FakeScreen([natures.indexOf("ADAMANT"), -1]);
    await run("set_nature", pkmn, nscreen);
    expect(pkmn.natureId).toBe("ADAMANT");
    expect(nscreen.shown[0]!.commands[natures.indexOf("ADAMANT")]).toBe("Adamant (+Atk, -SpAtk)");
    expect(nscreen.shown[0]!.commands[natures.indexOf("HARDY")]).toBe("Hardy (---)");
    expect(nscreen.shown[1]!.help).toBe("Nature is Adamant.");

    await run("set_gender", pkmn, new FakeScreen([1, -1]));
    expect(pkmn.female()).toBe(true);
    await run("set_gender", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.male()).toBe(true);
    const genderless = make("MAGNEMITE");
    const gscreen = new FakeScreen();
    await run("set_gender", genderless, gscreen);
    expect(gscreen.displayed).toEqual(["Magnemite is single-gendered or genderless."]);
  });

  it("sets the species and form (v20.1 Hotfixes: one-form species can reset to 0)", async () => {
    const pkmn = make();
    chosen.push("RAICHU");
    await run("species_and_form", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.species).toBe("RAICHU");
    expect(player.pokedex.seen("RAICHU")).toBe(true);
    // Raichu has an Alolan form (1)
    const screen = new FakeScreen([1, 1, -1]);
    await run("species_and_form", pkmn, screen);
    expect(pkmn.form).toBe(1);
    expect(screen.shown[1]!.commands.slice(0, 2)).toEqual(["0: Unnamed form", `1: ${GameData.Species.get("RAICHU_1").formName}`]);
    // One-form species with a non-zero form
    const one = make("BULBASAUR");
    one.formSimple = 3;
    const oneScreen = new FakeScreen([1, -1], [true]);
    await run("species_and_form", one, oneScreen);
    expect(oneScreen.displayed).toEqual(["Species Bulbasaur only has one form.", "Do you want to reset the form to 0?"]);
    expect(one.form).toBe(0);
  });

  it("sets shininess, Poké Ball, ribbons, nickname and ownership", async () => {
    const pkmn = make();
    await run("set_shininess", pkmn, new FakeScreen([1, -1]));
    expect([pkmn.shiny, pkmn.superShiny]).toEqual([true, true]);
    await run("set_shininess", pkmn, new FakeScreen([0, -1]));
    expect([pkmn.shiny, pkmn.superShiny]).toEqual([true, false]);
    await run("set_shininess", pkmn, new FakeScreen([2, -1]));
    expect(pkmn.shiny).toBe(false);

    const balls = GameData.Item.each().filter((i) => i.isPokeBall()).map((i) => [i.id, i.name] as const)
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    await run("set_pokeball", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.pokeBall).toBe(balls[0]![0]);

    const ribbons = GameData.Ribbon.each();
    await run("set_ribbons", pkmn, new FakeScreen([ribbons.length, -1])); // Give all
    expect(pkmn.numRibbons()).toBe(ribbons.length);
    await run("set_ribbons", pkmn, new FakeScreen([0, ribbons.length + 1, -1])); // Toggle first, clear all
    expect(pkmn.numRibbons()).toBe(0);

    chosen.push("Sparky");
    await run("set_nickname", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.name).toBe("Sparky");
    await run("set_nickname", pkmn, new FakeScreen([1, -1]));
    expect(pkmn.nicknamed()).toBe(false);

    numbers.push(12345);
    chosen.push("Red");
    const oscreen = new FakeScreen([4, 1, 2, 1, -1]);
    await run("ownership", pkmn, oscreen);
    expect(pkmn.owner.id).toBe(((12345 | (12345 << 16)) >>> 0));
    expect(pkmn.owner.name).toBe("Red");
    expect(pkmn.owner.gender).toBe(1);
    expect(oscreen.shown.at(-1)!.help).toBe("Foreign Pokémon\nRed\nFemale\n12345 (" + pkmn.owner.id + ")");
    await run("ownership", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.foreign(player as never)).toBe(false);
  });

  it("toggles discardability", async () => {
    const pkmn = make();
    await run("set_discardable", pkmn, new FakeScreen([0, 2, -1]));
    expect([pkmn.cannotStore, pkmn.cannotRelease, pkmn.cannotTrade]).toEqual([true, false, true]);
  });

  it("makes an egg and hatches it", async () => {
    const pkmn = make("BULBASAUR");
    await run("set_egg", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.egg()).toBe(true);
    expect(pkmn.level).toBe(1);
    expect(pkmn.name).toBe("Egg");
    expect(pkmn.stepsToHatch).toBe(pkmn.speciesData().hatchSteps);
    expect(pkmn.obtainMethod).toBe(1);
    await run("set_egg", pkmn, new FakeScreen([2, -1]));
    expect(pkmn.stepsToHatch).toBe(1);
    await run("set_egg", pkmn, new FakeScreen([1, -1]));
    expect(pkmn.egg()).toBe(false);
    expect(pkmn.name).toBe("Bulbasaur");
    expect(pkmn.obtainMethod).toBe(0);
    // A species that can't come from an egg asks first
    const legendary = make("MEWTWO");
    const screen = new FakeScreen([0, -1], [false]);
    await run("set_egg", legendary, screen);
    expect(screen.displayed).toEqual(["Mewtwo cannot legally be an egg. Make egg anyway?"]);
    expect(legendary.egg()).toBe(false);
  });

  it("makes a Shadow Pokémon and sets its heart gauge", async () => {
    const pkmn = make();
    await run("shadow_pkmn", pkmn, new FakeScreen([0, -1]));
    expect(pkmn.shadowPokemon()).toBe(true);
    expect(pkmn.heartGauge).toBe(pkmn.maxGaugeSize());
    numbers.push(0);
    await run("shadow_pkmn", pkmn, new FakeScreen([1, -1]));
    expect(pkmn.heartGauge).toBe(0);
    expect(messages).toContain("Pikachu can now be purified!");
  });

  it("sets Enhanced UI's shiny leaves", async () => {
    const pkmn = make();
    numbers.push(4);
    const screen = new FakeScreen([0, 1, 2, -1]);
    await run("set_shiny_leaf", pkmn, screen);
    expect(screen.shown.map((s) => s.help)).toEqual(["Has shiny leaf x0.", "Has shiny leaf x4.", "Has shiny crown.",
      "Has shiny leaf x0."]);
    expect(pkmn.shinyLeaf).toBe(0);
    expect(messages).toEqual(["Set Pikachu's leaf count (max. 6)."]);
  });

  it("says Mystery Gift isn't ported", async () => {
    await run("mystery_gift", make(), new FakeScreen());
    expect(messages).toEqual(["pbCreateMysteryGift isn't ported to the browser yet."]);
  });
});

describe("Duplicate and Delete", () => {
  it("duplicates and deletes a party Pokémon", async () => {
    const { PokemonPartyScreen } = await import("../ui/party/party");
    const pkmn = make();
    player.party.push(pkmn);
    let hardRefreshes = 0;
    const scene = { pbHardRefresh: () => { hardRefreshes += 1; }, pbDisplay: async (t: string) => { messages.push(t); },
      pbDisplayConfirm: async () => true };
    const screen = new PokemonPartyScreen(scene as never, player.party);
    expect(await run("duplicate", pkmn, screen as never)).toBe(true);
    expect(player.party.length).toBe(2);
    expect(player.party[1]).not.toBe(pkmn);
    expect(player.party[1]!.personalID).toBe(pkmn.personalID);
    expect(messages).toEqual(["The Pokémon was duplicated."]);
    expect(await run("delete", pkmn, screen as never, false, 0)).toBe(true);
    expect(player.party.length).toBe(1);
    expect(player.party[0]).not.toBe(pkmn);
    expect(hardRefreshes).toBe(2);
  });

  it("duplicates into a box and deletes from storage", async () => {
    const { PokemonStorageScreen } = await import("../ui/storage/PokemonStorageScreen");
    const storage = G.storage as PokemonStorage;
    for (let i = 0; i < 6; i++) player.party.push(make());
    const pkmn = make();
    storage.set(0, 0, pkmn);
    storage.currentBox = 0;
    const calls: string[] = [];
    const scene = {
      pbHardRefresh: () => calls.push("hardRefresh"), pbRefresh: () => calls.push("refresh"),
      pbRelease: async () => { calls.push("release"); },
      pbShowCommands: async () => 0, // "Yes" to pbConfirm
      pbDisplay: async (t: string) => { messages.push(t); },
    };
    const screen = new PokemonStorageScreen(scene as never, storage);
    await run("duplicate", pkmn, screen as never, false, [0, 0]);
    expect(storage.get(0, 1)?.personalID).toBe(pkmn.personalID);
    expect(messages).toEqual([]); // Stored in the current box: no message
    await run("delete", pkmn, screen as never, false, [0, 0]);
    expect(storage.get(0, 0)).toBeNull();
    expect(calls).toEqual(["hardRefresh", "release", "refresh"]);
    // A held Pokémon is dropped instead
    screen.heldpkmn = pkmn;
    await run("delete", pkmn, screen as never, false, [0, 0], pkmn);
    expect(screen.heldpkmn).toBeNull();
  });
});
