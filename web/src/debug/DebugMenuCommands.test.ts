// The overworld Debug menu's options (DebugMenuCommands.ts,
// 002_Debug_MenuCommands.rb + v20.1 Hotfixes + Essentials Deluxe): where each
// option is listed (CommandMenuList, as pbDebugMenu builds it) and what the
// options that change the game's state do, with scripted answers for the
// message/command/number prompts.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedRandom } from "../core/random";
import { GameData } from "../data/gameData";
import { Settings } from "../data/gameData/settings";
import { loadGameDataForTests } from "../data/gameData/testing";
import { G, GameSelfSwitches, GameSwitches, GameVariables, PokemonGlobalMetadata } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonStorage } from "../game/pokemon/PokemonStorage";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { MenuHandlers } from "../ui/menus/menuHandlers";
import { CommandMenuList } from "./DebugMenus";

/** Scripted answers for pbShowCommands / pbMessageChooseNumber / pbConfirmMessage, and the messages shown. */
const commands: number[] = [];
const numbers: number[] = [];
const confirms: boolean[] = [];
const messages: string[] = [];
vi.mock("../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../ui/messages")>()),
  pbMessage: async (msg: string, cmds: string[] | null = null) => {
    messages.push(msg);
    return cmds ? commands.shift() ?? -1 : 0;
  },
  pbShowCommands: async () => commands.shift() ?? -1,
  pbMessageChooseNumber: async (msg: string, params: { cancelNumber: number }) => {
    messages.push(msg);
    return numbers.length > 0 ? numbers.shift()! : params.cancelNumber;
  },
  pbConfirmMessage: async (msg: string) => { messages.push(msg); return confirms.shift() ?? false; },
  pbCreateMessageWindow: () => ({}),
  pbDisposeMessageWindow: () => {},
  pbMessageDisplay: async (_w: unknown, msg: string) => { messages.push(msg); return null; },
}));
vi.mock("./DebugConsole", () => {
  const noop = () => {};
  return {
    Console: { echoH1: noop, echoH2: noop, echoLi: noop, echolnLi: noop, echoWarn: noop, echoError: noop, echoDone: noop },
    echo: noop,
    echoln: noop,
  };
});
const written: string[] = [];
vi.mock("../compiler/WritePBS", () => {
  const writer = (name: string) => async () => { written.push(name); };
  return {
    Compiler: {
      writeAll: writer("all"), writeAbilities: writer("abilities"), writeTrainerLists: writer("trainer_lists"),
      writeBerryPlants: writer("berry_plants"), writeEncounters: writer("encounters"), writeItems: writer("items"),
      writeConnections: writer("connections"), writeMapMetadata: writer("map_metadata"), writeMetadata: writer("metadata"),
      writeMoves: writer("moves"), writePhone: writer("phone"), writePokemon: writer("pokemon"),
      writePokemonForms: writer("pokemon_forms"), writePokemonMetrics: writer("pokemon_metrics"),
      writeRegionalDexes: writer("regional_dexes"), writeRibbons: writer("ribbons"),
      writeShadowPokemon: writer("shadow_pokemon"), writeTownMap: writer("town_map"),
      writeTrainerTypes: writer("trainer_types"), writeTrainers: writer("trainers"), writeTypes: writer("types"),
    },
  };
});
let compileOutput = "";
vi.mock("./devFiles", async (orig) => ({
  ...(await orig<typeof import("./devFiles")>()),
  DevFiles: { compilePbs: async () => compileOutput },
  devWriteOrExplain: async (_what: string, block: () => Promise<void>) => { await block(); return true; },
}));

await import("./DebugMenuCommands");
const { debugFillBoxes, debugClearBoxes, debugFillBag, debugGiveDemoParty } = await import("./DebugMenuCommands");

const player = () => G.player as unknown as Player;
const run = (option: string, ...args: unknown[]) => MenuHandlers.call("debug_menu", option, "effect", ...args) as Promise<unknown>;

/** The option names pbDebugMenu lists under `parent`. */
function listed(parent: string): string[] {
  const list = new CommandMenuList();
  for (const [option, hash, name] of MenuHandlers.eachAvailable("debug_menu")) list.add(option, hash, name);
  list.currentList = parent;
  return list.list();
}

beforeAll(() => {
  loadGameDataForTests();
});

beforeEach(() => {
  G.player = new Player("Gold", GameData.TrainerType.keys()[0]!) as never;
  G.bag = new PokemonBag();
  G.storage = new PokemonStorage();
  G.stats = new GameStats();
  G.gameVariables = new GameVariables();
  G.gameSwitches = new GameSwitches();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameMap = null;
  commands.length = 0;
  numbers.length = 0;
  confirms.length = 0;
  messages.length = 0;
  written.length = 0;
});

describe("menu structure", () => {
  it("lists the submenus under main in Essentials' order, then Essentials Deluxe's", () => {
    expect(listed("main")).toEqual([
      "Field Options...", "Battle Options...", "Item Options...", "Pokémon Options...", "Player Options...",
      "Information Editors...", "Other Options...", "Deluxe Plugins...",
    ]);
  });

  it("lists each option under its parent", () => {
    expect(listed("field_menu")).toEqual([
      "Warp to Map", "Refresh Map", "Switches", "Variables", "Use PC", "Toggle Storage Wallpapers", "Day Care",
      "Skip Credits", "Use Relic Stone", "Use Purify Chamber",
    ]);
    expect(listed("battle_menu")).toEqual([
      "Test Wild Battle", "Test Wild Battle Advanced", "Test Trainer Battle", "Test Trainer Battle Advanced",
      "Toggle Battle Logging", "Reset Map's Trainers", "Ready All Phone Rematches", "Roaming Pokémon",
      "Set Encounters Version",
    ]);
    expect(listed("items_menu")).toEqual(["Add Item", "Fill Bag", "Empty Bag"]);
    expect(listed("pokemon_menu")).toEqual([
      "Add Pokémon", "Give Demo Party", "Heal Party", "Quick Hatch", "Fill Storage Boxes", "Clear Storage Boxes",
      "Access Pokémon Storage",
    ]);
    expect(listed("player_menu")).toEqual([
      "Set Badges", "Set Money", "Set Coins", "Set Battle Points", "Toggle Running Shoes", "Toggle Pokégear",
      "Toggle Pokédex and Dexes", "Toggle Pokémon Box Link's Effect", "Toggle Exp. All's Effect",
      "Set Player Character", "Set Player Outfit", "Set Player Name", "Randomize Player ID",
    ]);
    expect(listed("editors_menu")).toEqual([
      "Edit Metadata", "Edit Map Metadata", "Edit Map Connections", "Edit Terrain Tags", "Edit Wild Encounters",
      "Edit Trainer Types", "Edit Individual Trainers", "Edit Items", "Edit Pokémon Species", "Edit Regional Dexes",
      "Edit Pokémon Sprite Positions", "Auto-Position All Pokémon Sprites", "Battle Animation Editor",
      "Battle Animation Organiser", "Import All Battle Animations", "Export All Battle Animations",
    ]);
    expect(listed("other_menu")).toEqual([
      "Manage Mystery Gifts", "Extract Text", "Compile Text", "Compile Data", "Create PBS File(s)",
      "Fix Invalid Tiles", "Rename Outdated Files", "Reload System Cache",
    ]);
    // (ZUD's "ZUD..." is also under Deluxe Plugins...; battle/zud/Debug.ts registers it.)
    expect(listed("dx_menu")).toContain("Essentials Deluxe...");
    expect(listed("deluxe_menu")).toEqual(["Toggle Switch", "Set Player's Birthday"]);
  });

  it("hides the submenus that aren't always shown (pbDebugMenu(false))", () => {
    const hidden = MenuHandlers.eachAvailable("debug_menu")
      .filter(([, hash]) => hash.always_show === false).map(([option]) => option);
    expect(hidden).toEqual(["field_menu", "battle_menu", "items_menu", "pokemon_menu", "player_menu", "dx_menu"]);
  });

  it("describes options with their Ruby descriptions", () => {
    const list = new CommandMenuList();
    for (const [option, hash, name] of MenuHandlers.eachAvailable("debug_menu")) {
      list.add(option, hash, name, hash.description as string);
    }
    list.currentList = "items_menu";
    expect(list.getDesc(2)).toBe("Remove all items from the Bag.");
  });
});

describe("player options", () => {
  it("toggles running shoes, Pokégear, Box Link and Exp. All", async () => {
    await run("toggle_running_shoes");
    expect(player().hasRunningShoes).toBe(true);
    await run("toggle_running_shoes");
    expect(player().hasRunningShoes).toBe(false);
    await run("toggle_pokegear");
    await run("toggle_box_link");
    await run("toggle_exp_all");
    expect([player().hasPokegear, player().hasBoxLink, player().hasExpAll]).toEqual([true, true, true]);
    expect(messages).toEqual([
      "Gave Running Shoes.", "Lost Running Shoes.", "Gave Pokégear.", "Enabled Pokémon Box Link's effect.",
      "Enabled Exp. All's effect.",
    ]);
  });

  it("sets money, coins and BP; cancelling keeps the old amount", async () => {
    numbers.push(123456);
    await run("set_money");
    expect(player().money).toBe(123456);
    expect(messages.at(-1)).toBe("You now have $123,456.");
    await run("set_money"); // cancel: setDefaultValue makes the cancel value the current amount
    expect(player().money).toBe(123456);
    numbers.push(4321, 77);
    await run("set_coins");
    await run("set_bp");
    expect([player().coins, player().battlePoints]).toEqual([4321, 77]);
    expect(messages.filter((m) => m.startsWith("You now have"))).toEqual([
      "You now have $123,456.", "You now have $123,456.", "You now have 4,321 Coins.", "You now have 77 BP.",
    ]);
  });

  it("gives, removes and toggles badges", async () => {
    commands.push(0, 3, -1); // Give all, toggle Badge 2, close
    await run("set_badges");
    expect(player().badges.length).toBe(24);
    expect(player().badges.filter((b) => b).length).toBe(23);
    expect(player().badges[1]).toBe(false);
    commands.push(1, -1); // Remove all
    await run("set_badges");
    expect(player().badges.some((b) => b)).toBe(false);
  });

  it("toggles the Pokédex and each Regional Dex", async () => {
    const dex = player().pokedex;
    const wasUnlocked = dex.unlocked(0);
    commands.push(0, 1, -1); // Have Pokédex, first Dex
    await run("toggle_pokedex");
    expect(player().hasPokedex).toBe(true);
    expect(dex.unlocked(0)).toBe(!wasUnlocked);
  });

  it("randomizes the player's ID with two 16-bit halves", async () => {
    seedRandom(42);
    await run("random_id");
    expect(player().id).toBeGreaterThanOrEqual(0);
    expect(player().id).toBeLessThan(2 ** 32);
    expect(messages.at(-1)).toBe(`The player's ID was changed to ${player().publicID()} (full ID: ${player().id}).`);
  });

  it("changes the outfit", async () => {
    numbers.push(2);
    await run("change_outfit");
    expect(player().outfit).toBe(2);
    expect(messages.at(-1)).toBe("Player's outfit was changed.");
  });
});

describe("Pokémon options", () => {
  it("heals the party and makes eggs hatch on the next step", async () => {
    const mon = new Pokemon("PIKACHU", 10);
    mon.hp = 1;
    const egg = new Pokemon("TOGEPI", 1);
    egg.stepsToHatch = 500;
    player().party = [mon, egg];
    await run("heal_party");
    expect(mon.hp).toBe(mon.totalhp);
    await run("quick_hatch_party_eggs");
    expect(egg.stepsToHatch).toBe(1);
    expect(mon.stepsToHatch).toBe(0);
  });

  it("gives the demo party with its field moves", () => {
    player().party = [new Pokemon("PIKACHU", 3)];
    debugGiveDemoParty();
    expect(player().party.map((p) => p.species)).toEqual(["PIKACHU", "PIDGEOTTO", "KADABRA", "GYARADOS", "DIGLETT", "CHANSEY"]);
    expect(player().party.every((p) => p.level === 20)).toBe(true);
    expect(player().party[1]!.moves.map((m) => m.id)).toContain("FLY");
    expect(player().party[4]!.moves.map((m) => m.id)).toEqual(["DIG", "CUT", "HEADBUTT", "ROCKSMASH"]);
    expect(player().pokedex.owned("GYARADOS")).toBe(true);
  });

  it("fills the boxes with one of each species and registers them, then clears them", () => {
    const completed = debugFillBoxes();
    const species = GameData.Species.each().filter((s) => s.form === 0).map((s) => s.species);
    const boxQty = G.storage.maxPokemon(0);
    expect(completed).toBe(species.length <= Settings.NUM_STORAGE_BOXES * boxQty);
    const first = G.storage.get(0, 0) as Pokemon;
    expect(first.species).toBe(species[0]);
    expect(first.level).toBe(50);
    expect((G.storage.get(Math.floor(1 / boxQty), 1 % boxQty) as Pokemon).species).toBe(species[1]);
    expect(player().pokedex.owned(species[0]!)).toBe(true);
    debugClearBoxes();
    for (let i = 0; i < G.storage.maxBoxes(); i++) {
      for (let j = 0; j < G.storage.maxPokemon(i); j++) expect(G.storage.get(i, j)).toBeNull();
    }
  });
});

describe("item options", () => {
  it("fills the Bag with every item (key items once) and empties it", async () => {
    debugFillBag(5);
    const item = GameData.Item.each().find((i) => !i.isImportant())!;
    const key = GameData.Item.each().find((i) => i.isImportant())!;
    expect(G.bag.quantity(item.id)).toBe(5);
    expect(G.bag.quantity(key.id)).toBe(1);
    await run("empty_bag");
    expect(G.bag.quantity(item.id)).toBe(0);
  });
});

describe("field and battle options", () => {
  it("toggles credit skipping", async () => {
    await run("skip_credits");
    expect(G.pokemonGlobal.creditsPlayed).toBe(true);
    expect(messages).toEqual(["Credits can be skipped when played in future."]);
  });

  it("resets the self switches of events named Trainer", async () => {
    G.gameMap = {
      mapId: 7, needRefresh: false,
      events: new Map([[1, { id: 1, name: "Trainer(4)" }], [2, { id: 2, name: "Sign" }]]),
    } as never;
    G.gameSelfSwitches.set(7, 1, "A", true);
    G.gameSelfSwitches.set(7, 1, "B", true);
    G.gameSelfSwitches.set(7, 2, "A", true);
    await run("reset_trainers");
    expect(G.gameSelfSwitches.get(7, 1, "A")).toBe(false);
    expect(G.gameSelfSwitches.get(7, 1, "B")).toBe(false);
    expect(G.gameSelfSwitches.get(7, 2, "A")).toBe(true);
    expect((G.gameMap as unknown as { needRefresh: boolean }).needRefresh).toBe(true);
  });

  it("readies phone trainers with an event for rematches", async () => {
    const trainer = [true, "YOUNGSTER", "Joey", 0, 0, 0, 5, 3];
    const npc = [true, "MOM", "Mom", 1];
    (G.pokemonGlobal as unknown as { phoneNumbers: unknown[] }).phoneNumbers = [trainer, npc];
    await run("ready_rematches");
    expect(trainer[4]).toBe(2);
    expect(G.gameSelfSwitches.get(5, 3, "B")).toBe(true);
    expect(messages.at(-1)).toBe("All trainers in the Phone are now ready to rebattle.");
  });

  it("sets the encounters version", async () => {
    numbers.push(3);
    await run("encounter_version");
    expect((G.pokemonGlobal as unknown as { encounterVersion: number }).encounterVersion).toBe(3);
  });

  it("toggles Essentials Deluxe's Mega Evolution switch", async () => {
    await run("debug_mega");
    expect(G.gameSwitches.get(Settings.NO_MEGA_EVOLUTION)).toBe(true);
    expect(messages.at(-1)).toBe("Mega Evolution disabled.");
  });

  it("sets the player's birthday (Essentials Deluxe)", async () => {
    commands.push(2); // March
    numbers.push(3);
    confirms.push(true);
    await run("debug_birthday");
    expect(messages).toContain("So, your birthday is March 3rd, correct?");
    expect(player().birthdate.getDate()).toBe(3);
    expect(player().birthdate.getMonth()).toBe(2);
    expect(messages.at(-1)).toBe("The player's birthdate was set to March 3.");
  });
});

describe("other options", () => {
  it("writes the chosen PBS files", async () => {
    commands.push(0, 5, 20, -1); // Create all, items.txt, types.txt, close
    await run("create_pbs_files");
    expect(written).toEqual(["all", "items", "types"]);
    expect(messages).toEqual(["File written.", "File written.", "File written."]);
  });

  it("compiles the PBS files and reloads GameData", async () => {
    const loadAll = vi.spyOn(GameData, "loadAll").mockResolvedValue();
    compileOutput = "compiled";
    await run("compile_data");
    expect(loadAll).toHaveBeenCalled();
    expect(messages).toEqual(["All game data was compiled."]);
    loadAll.mockRestore();
  });
});
