// EditorDataTypes.ts: what each property shows after "Name=" (format), what a
// reset puts back (defaultValue), Ruby's inspect, and the list editors'
// data handling (GameDataPoolProperty, LevelUpMovesProperty,
// EvolutionsProperty) with the windows and choosers answered by the test.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GameData } from "../data/gameData";
import { loadGameDataForTests } from "../data/gameData/testing";

/** Answers for pbMessage / pbShowCommands / pbMessageChooseNumber / pbConfirmMessage, in order. */
const answers: unknown[] = [];
/** Answers for pbCommands2 / pbCommands3 and the GameData choosers, in order. */
const listAnswers: unknown[] = [];
const next = () => (answers.length > 0 ? answers.shift() : -1);
const nextList = () => listAnswers.shift();

vi.mock("../ui/messages", async (orig) => ({
  ...(await orig<typeof import("../ui/messages")>()),
  pbMessage: async (_msg: string, commands?: string[] | null) => (commands ? next() : 0),
  pbShowCommands: async () => next(),
  pbMessageChooseNumber: async () => next(),
  pbConfirmMessage: async () => next(),
}));
vi.mock("./EditorListers", async (orig) => ({
  ...(await orig<typeof import("./EditorListers")>()),
  pbListWindow: () => ({ dispose: () => {} }),
}));
vi.mock("./EditorUtilities", async (orig) => ({
  ...(await orig<typeof import("./EditorUtilities")>()),
  pbCommands2: async () => nextList(),
  pbCommands3: async () => nextList(),
  pbChooseFromGameDataList: async () => nextList(),
  pbChooseMoveList: async () => nextList(),
  pbChooseSpeciesList: async () => nextList(),
  pbChooseItemList: async () => nextList(),
}));

let T: typeof import("./EditorDataTypes");

beforeAll(async () => {
  loadGameDataForTests();
  T = await import("./EditorDataTypes");
});

describe("inspect", () => {
  it("shows values the way Ruby's inspect does", () => {
    expect(T.inspect(null)).toBe("nil");
    expect(T.inspect(undefined)).toBe("nil");
    expect(T.inspect(5)).toBe("5");
    expect(T.inspect(false)).toBe("false");
    expect(T.inspect("POTION")).toBe(":POTION");
    expect(T.inspect("1101")).toBe("\"1101\"");
    expect(T.inspect("Bob")).toBe("\"Bob\"");
    expect(T.inspect([3, 10, 12])).toBe("[3, 10, 12]");
    expect(T.inspect([0, ""])).toBe("[0, \"\"]");
    expect(T.inspect({ HP: 31, 0: 0 })).toBe("{0=>0, :HP=>31}");
  });
});

describe("format", () => {
  it("numbers, booleans and strings", () => {
    expect(T.ReadOnlyProperty.format("PIKACHU")).toBe(":PIKACHU");
    expect(T.UndefinedProperty.format(null)).toBe("nil");
    expect(new T.UIntProperty(3).format(12)).toBe("12");
    expect(new T.LimitProperty(255).format(0)).toBe("0");
    expect(new T.LimitProperty2(999).format(0)).toBe("0"); // 0 is true in Ruby
    expect(new T.LimitProperty2(999).format(null)).toBe("-");
    expect(new T.NonzeroLimitProperty(30).format(null)).toBe("nil");
    expect(T.BooleanProperty.format(true)).toBe("true");
    expect(T.BooleanProperty.format(null)).toBe("nil");
    expect(T.BooleanProperty2.format(true)).toBe("True");
    expect(T.BooleanProperty2.format(false)).toBe("False");
    expect(T.BooleanProperty2.format(null)).toBe("-");
    expect(T.StringProperty.format("Route 29")).toBe("Route 29");
    expect(T.StringProperty.format(null)).toBe("");
    expect(new T.LimitStringProperty(10).format("Bob")).toBe("Bob");
    expect(T.BGMProperty.format("Battle wild")).toBe("Battle wild");
    expect(T.ItemNameProperty.format("Potion")).toBe("Potion");
    expect(T.StringListProperty.format(["A", "B"])).toBe("A,B");
  });

  it("enums, genders and pockets", () => {
    const e = new T.EnumProperty(["Male", "Female", "Unknown"]);
    expect(e.format(0)).toBe("Male");
    expect(e.format(2)).toBe("Unknown");
    expect(e.format(null)).toBe("nil");
    expect(T.GenderProperty.format(0)).toBe("Male");
    expect(T.GenderProperty.format(1)).toBe("Female");
    expect(T.GenderProperty.format(2)).toBe("-");
    expect(T.GenderProperty.format(null)).toBe("-");
    expect(T.PocketProperty.format(0)).toBe("No Pocket");
    expect(T.PocketProperty.format(1)).toBe("Items");
    expect(T.PocketProperty.format(8)).toBe("Key Items");
    expect(T.PocketProperty.format(null)).toBe("nil");
  });

  it("EnumProperty2 and getConstantName", () => {
    const mod = { A: 0, B: 1, C: 2, maxValue: () => 2 };
    const e = new T.EnumProperty2(mod);
    expect(e.format(1)).toBe("B");
    expect(e.format(null)).toBe("-");
    expect(() => T.getConstantName(mod, 7)).toThrow("Value 7 not defined by a constant");
  });

  it("GameData IDs", () => {
    expect(T.SpeciesProperty.format("PIKACHU")).toBe("Pikachu");
    expect(T.SpeciesProperty.format("NOTASPECIES")).toBe("-");
    expect(T.SpeciesProperty.format(null)).toBe("-");
    expect(new T.SpeciesFormProperty(null).format("CHARIZARD_2")).toBe("Charizard_2");
    expect(new T.SpeciesFormProperty(null).format("CHARIZARD")).toBe("Charizard");
    expect(T.TypeProperty.format("FIRE")).toBe(GameData.Type.get("FIRE").realName);
    expect(T.MoveProperty.format("TACKLE")).toBe("Tackle");
    expect(new T.MovePropertyForSpecies(["PIKACHU"]).format("TACKLE")).toBe("Tackle");
    expect(T.ItemProperty.format("POTION")).toBe("Potion");
    expect(new T.BallProperty([]).format("POKEBALL")).toBe("Poké Ball");
    expect(new T.BallProperty([]).format(null)).toBe("-");
    expect(T.AbilityProperty.format("STATIC")).toBe(GameData.Ability.get("STATIC").realName);
    expect(T.TrainerTypeProperty.format("PkMnTRAINER_Male")).toBe("PkMn TRAINER");
    expect(new T.GameDataProperty("Nature").format("ADAMANT")).toBe("Adamant");
    expect(new T.GameDataProperty("Nature").format(null)).toBe("-");
    expect(() => new T.GameDataProperty("Nope")).toThrow("Couldn't find class Nope in module GameData.");
    expect(() => new T.GameDataPoolProperty("FILES")).toThrow("Couldn't find class FILES in module GameData.");
  });

  it("stat hashes in PBS order (HP, Atk, Def, Spe, SpA, SpD)", () => {
    const stats = { HP: 45, ATTACK: 49, DEFENSE: 49, SPECIAL_ATTACK: 65, SPECIAL_DEFENSE: 65, SPEED: 45 };
    expect(T.BaseStatsProperty.format(stats)).toBe("45,49,49,45,65,65");
    expect(T.EffortValuesProperty.format({ SPEED: 2 })).toBe("0,0,0,2,0,0");
    expect(new T.IVsProperty(31).format(stats)).toBe("45,49,49,45,65,65");
    expect(new T.IVsProperty(31).format(null)).toBe("-");
    expect(new T.EVsProperty(252).format({ HP: 4 })).toBe("4,0,0,0,0,0");
  });

  it("maps, weather and encounter slots", () => {
    expect(T.MapCoordsProperty.format([3, 10, 12])).toBe("[3, 10, 12]");
    expect(T.MapCoordsFacingProperty.format([3, 10, 12, 2])).toBe("[3, 10, 12, 2]");
    expect(T.MapSizeProperty.format([2, "1101"])).toBe("[2, \"1101\"]");
    expect(T.MapProperty.format(5)).toBe("5");
    expect(T.WeatherEffectProperty.format(["Rain", 40])).toBe(`${GameData.Weather.get("Rain").realName},40`);
    expect(T.WeatherEffectProperty.format(null)).toBe("-");
    expect(T.EncounterSlotProperty.format([20, "PIKACHU", 5, 5])).toBe("20, Pikachu (Lv.5)");
    expect(T.EncounterSlotProperty.format([20, "PIKACHU", 5, 8])).toBe("20, Pikachu (Lv.5-8)");
    expect(T.EncounterSlotProperty.format([10, "CHARIZARD_1", 30, 30])).toBe("10, Charizard_1 (Lv.30)");
    expect(T.EncounterSlotProperty.format([10, "CHARIZARD_1", 30, 35])).toBe("10, Charizard_1 (Lv.30-35)");
    expect(T.EncounterSlotProperty.format(null)).toBe("-");
  });

  it("move pools and evolutions", () => {
    expect(new T.GameDataPoolProperty("Item").format(["POTION", "POKEBALL"])).toBe("Potion,Poké Ball");
    expect(new T.EggMovesProperty().format([])).toBe("");
    expect(T.LevelUpMovesProperty.format([[1, "TACKLE"], [5, "GROWL"]])).toBe("1,Tackle,5,Growl");
    const evos = new T.EvolutionsProperty();
    expect(evos.format([["IVYSAUR", "Level", 16], ["RAICHU", "Item", "THUNDERSTONE"], ["ESPEON", "Happiness", null]]))
      .toBe("Ivysaur,Level,16,Raichu,Item,THUNDERSTONE,Espeon,Happiness,");
  });
});

describe("defaultValue", () => {
  it("is what Ruby's reset puts back", () => {
    expect(new T.UIntProperty(3).defaultValue()).toBe(0);
    expect(new T.LimitProperty(9).defaultValue()).toBe(0);
    expect(new T.LimitProperty2(9).defaultValue()).toBeNull();
    expect(new T.NonzeroLimitProperty(9).defaultValue()).toBe(1);
    expect(T.BooleanProperty2.defaultValue()).toBeNull();
    expect(new T.EnumProperty(["a"]).defaultValue()).toBe(0);
    expect(T.StringListProperty.defaultValue()).toEqual([]);
    expect(new T.SpeciesFormProperty("PIKACHU").defaultValue()).toBe("PIKACHU");
    expect(T.MapProperty.defaultValue()).toBe(0);
    expect(T.ItemNameProperty.defaultValue()).toBe("???");
    expect(T.PocketProperty.defaultValue()).toBe(1);
    expect(T.BaseStatsProperty.defaultValue()).toEqual({
      HP: 10, ATTACK: 10, DEFENSE: 10, SPECIAL_ATTACK: 10, SPECIAL_DEFENSE: 10, SPEED: 10,
    });
    expect(T.EffortValuesProperty.defaultValue()).toEqual({
      HP: 0, ATTACK: 0, DEFENSE: 0, SPECIAL_ATTACK: 0, SPECIAL_DEFENSE: 0, SPEED: 0,
    });
    expect(new T.GameDataPoolProperty("Item").defaultValue()).toEqual([]);
    expect(T.LevelUpMovesProperty.defaultValue()).toEqual([]);
    expect(new T.EvolutionsProperty().defaultValue()).toEqual([]);
    // No defaultValue: pbPropertyList resets these to nil
    expect("defaultValue" in T.BooleanProperty).toBe(false);
    expect("defaultValue" in T.StringProperty).toBe(false);
  });

  it("propertyListCommands lists Name=value", () => {
    const props: import("./EditorDataTypes").PropertyListEntry[] = [
      ["Width", new T.NonzeroLimitProperty(30), ""],
      ["Valid Squares", T.StringProperty, ""],
    ];
    expect(T.propertyListCommands([2, "11"], props)).toEqual(["Width=2", "Valid Squares=11"]);
  });
});

describe("set", () => {
  it("LimitProperty2 and the choice properties return nil when cancelled", async () => {
    answers.push(-1);
    expect(await new T.LimitProperty2(99).set("Form", 3)).toBeNull();
    answers.push(7);
    expect(await new T.LimitProperty2(99).set("Form", 3)).toBe(7);
    answers.push(1);
    expect(await T.BooleanProperty2.set("Shiny", null)).toBe(false);
    answers.push(-1);
    expect(await T.BooleanProperty2.set("Shiny", true)).toBeNull();
    answers.push(1);
    expect(await T.GenderProperty.set("Gender", null)).toBe(1);
    answers.push(-1);
    expect(await new T.EnumProperty(["a", "b"]).set("X", 1)).toBe(1);
    answers.push(2);
    expect(await T.PocketProperty.set("", 0)).toBe(3);
  });

  it("WeatherEffectProperty: None clears the weather", async () => {
    const ids = GameData.Weather.each().map((w) => w.id);
    answers.push(ids.indexOf("None"));
    expect(await T.WeatherEffectProperty.set("Weather", ["Rain", 40])).toBeNull();
    answers.push(ids.indexOf("Rain"), 60);
    expect(await T.WeatherEffectProperty.set("Weather", null)).toEqual(["Rain", 60]);
  });

  it("StringListProperty raises NameError on a non-empty list (Ruby parity)", async () => {
    await expect(T.StringListProperty.set("Flags", ["Town"])).rejects.toThrow("undefined local variable or method `i'");
  });

  it("StringListProperty adds values to an empty list", async () => {
    // Quit straight away and keep the (empty) list
    listAnswers.push(-1);
    answers.push(0); // Keep changes? Yes
    expect(await T.StringListProperty.set("Flags", [])).toEqual([]);
  });

  it("GameDataPoolProperty adds, swaps and applies", async () => {
    const pool = new T.GameDataPoolProperty("Item");
    // Add POTION, add POKEBALL, Action+Up on POKEBALL (index 1 after the cursor moved up), quit + apply
    listAnswers.push([0, 0], "POTION", [0, 0], "POKEBALL", [1, 1], [0, -1]);
    answers.push(0);
    expect(await pool.set(null, [])).toEqual(["POKEBALL", "POTION"]);
    // Cancelling ("No") keeps the old list
    listAnswers.push([0, 0], "POTION", [0, -1]);
    answers.push(1);
    const old = ["POKEBALL"];
    expect(await pool.set(null, old)).toBe(old);
  });

  it("GameDataPoolProperty without duplicates (egg moves) sorts and dedups", async () => {
    const egg = new T.EggMovesProperty();
    listAnswers.push([0, 0], "TACKLE", [0, -1]); // TACKLE is already there: just moves the cursor
    answers.push(0);
    expect(await egg.set(null, ["TACKLE", "GROWL", "TACKLE"])).toEqual(["GROWL", "TACKLE"]);
  });

  it("LevelUpMovesProperty keeps moves sorted by level", async () => {
    // Add a move at level 3 (GROWL), then quit + save
    listAnswers.push([0, 0], "GROWL", [0, -1]);
    answers.push(3, 0);
    expect(await T.LevelUpMovesProperty.set("Moves", [[1, "TACKLE"], [7, "THUNDERSHOCK"]]))
      .toEqual([[1, "TACKLE"], [3, "GROWL"], [7, "THUNDERSHOCK"]]);
  });

  it("EvolutionsProperty adds an evolution; a String parameter gets the number chooser (Ruby parity)", async () => {
    const evos = new T.EvolutionsProperty();
    const methods = GameData.Evolution.eachAlphabetically().map((e) => e.id);
    // Add evolution: species PIKACHU, method LocationFlag, parameter 12 from the number chooser
    listAnswers.push([0, 0], "PIKACHU", [0, -1]);
    answers.push(methods.indexOf("LocationFlag"), 12, 0);
    expect(await evos.set("Evolutions", [["IVYSAUR", "Level", 16]]))
      .toEqual([["IVYSAUR", "Level", 16], ["PIKACHU", "LocationFlag", 12]]);
  });
});
