// GameData over the compiled PBS JSON and the hardcoded data. Numbers marked
// "Ruby" come from rubyReference.json, produced by running Essentials' own
// code (with this game's plugins) under plain Ruby.
import { beforeAll, describe, expect, it } from "vitest";
import ref from "../../game/pokemon/rubyReference.json";
import { Effectiveness, GameData } from "./index";
import { loadGameDataForTests } from "./testing";

beforeAll(() => loadGameDataForTests());

describe("GameData class methods", () => {
  it("get / try_get / exists? / keys / each like Essentials", () => {
    const pika = GameData.Species.get("PIKACHU");
    expect(pika.name).toBe("Pikachu");
    expect(GameData.Species.get(pika)).toBe(pika);
    expect(GameData.Species.tryGet("NOTAPOKEMON")).toBeNull();
    expect(GameData.Species.tryGet(null)).toBeNull();
    expect(() => GameData.Species.get("NOTAPOKEMON")).toThrow("Unknown ID NOTAPOKEMON.");
    expect(GameData.Species.exists("PIKACHU")).toBe(true);
    expect(GameData.Species.exists(pika)).toBe(true);
    expect(GameData.Species.exists(null)).toBe(false);
    expect(GameData.Species.keys()[0]).toBe("BULBASAUR");
    expect(GameData.Species.each().length).toBe(GameData.Species.count());
    expect(pika.equals("PIKACHU")).toBe(true);
    expect(GameData.Item.get("POTION").equals(GameData.Item.get("POTION"))).toBe(true);
  });

  it("Weather is known by symbol and number, iterated by number", () => {
    expect(GameData.Weather.get(1).id).toBe("Rain");
    expect(GameData.Weather.get("Rain").idNumber).toBe(1);
    expect(GameData.Weather.count()).toBe(9);
    expect(GameData.Weather.each().map((w) => w.idNumber)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(GameData.Weather.get("Rain").tone(40)).toMatchObject({ red: -30, green: -30, blue: -30, gray: 10 });
  });

  it("metadata classes", () => {
    expect(GameData.Metadata.get().startMoney).toBe(3000);
    expect(GameData.Metadata.get().storageCreator).toBe("Bill");
    expect(GameData.PlayerMetadata.get(99).id).toBe(1); // falls back to player 1
    expect(GameData.MapMetadata.get(1).realName).toBe("New Bark Town");
    expect(GameData.MapMetadata.tryGet(1)?.townMapPosition).toEqual([0, 23, 13]);
  });

  it("encounter tables by map and version (falling back to version 0)", () => {
    const e = GameData.Encounter.get(4, 0)!;
    expect(e.id).toBe("4_0");
    expect(GameData.Encounter.get(4, 3)).toBe(e);
    expect(GameData.Encounter.exists(4, 3)).toBe(false);
    expect(e.types.LandDay![0]).toMatchObject({ chance: 20, species: "PIDGEY" });
  });
});

describe("hardcoded data", () => {
  it("natures in Essentials' order (the default-nature formula depends on it)", () => {
    expect(GameData.Nature.keys()).toEqual([
      "HARDY", "LONELY", "BRAVE", "ADAMANT", "NAUGHTY", "BOLD", "DOCILE", "RELAXED", "IMPISH", "LAX", "TIMID", "HASTY",
      "SERIOUS", "JOLLY", "NAIVE", "MODEST", "MILD", "QUIET", "BASHFUL", "RASH", "CALM", "GENTLE", "SASSY", "CAREFUL", "QUIRKY",
    ]);
    expect(GameData.Nature.get("ADAMANT").statChanges).toEqual([["ATTACK", 10], ["SPECIAL_ATTACK", -10]]);
  });

  it("stats: each_main order and PBS order", () => {
    expect(GameData.Stat.eachMain().map((s) => s.id)).toEqual(["HP", "ATTACK", "DEFENSE", "SPECIAL_ATTACK", "SPECIAL_DEFENSE", "SPEED"]);
    expect(GameData.Stat.eachBattle().map((s) => s.id)).toContain("EVASION");
    expect(GameData.Stat.get("SPEED").pbsOrder).toBe(3);
  });

  it("growth rates match Ruby (exp tables, level_from_exp, maximum_exp)", () => {
    for (const g of ref.exp) {
      const rate = GameData.GrowthRate.get(g.id);
      expect(rate.maximumExp(), g.id).toBe(g.max);
      const exps = [0, 1, 7, 8, 100, 1000, 1059859, 1059860, 2_000_000, 600000, 599999];
      expect(exps.map((e) => rate.levelFromExp(e)), g.id).toEqual(g.levels);
      expect([1, 2, 10, 50, 99, 100].map((l) => rate.minimumExpForLevel(l)), g.id).toEqual(g.min);
    }
    expect(GameData.GrowthRate.get("Medium").addExp(999_990, 100)).toBe(1_000_000);
  });

  it("plugin registrations are present (Gen 9 evolutions/statuses, Deluxe habitat)", () => {
    expect(GameData.Evolution.exists("LevelWalk")).toBe(true);
    expect(GameData.Evolution.keys().slice(-6)).toEqual(["CollectItems", "LevelWithPartner", "LevelUseMoveCount",
      "LevelDefeatItsKindWithItem", "LevelRecoilDamage", "LevelWalk"]);
    expect(GameData.Status.get("FROSTBITE").iconPosition).toBe(6);
    expect(GameData.Habitat.get("UltraSpace").name).toBe("Ultra Space");
    expect(GameData.Evolution.get("Happiness").minimumLevel).toBe(1);
    expect(GameData.Evolution.get("Level").parameter).toBe("Integer");
  });

  it("gender ratios and targets", () => {
    expect(GameData.GenderRatio.get("Genderless").singleGendered()).toBe(true);
    expect(GameData.GenderRatio.get("FemaleOneEighth").femaleChance).toBe(32);
    expect(GameData.Target.get("NearFoe").canTargetOneFoe()).toBe(true);
    expect(GameData.Target.get("Other").canChooseDistantTarget()).toBe(true);
  });
});

describe("PBS data classes", () => {
  it("type effectiveness", () => {
    expect(Effectiveness.calculate("WATER", "FIRE")).toBe(Effectiveness.SUPER_EFFECTIVE_ONE * 2 * 2);
    expect(Effectiveness.calculate("WATER", "FIRE", "GROUND")).toBe(32); // 4x = 4 * 4 * 2 (NORMAL_EFFECTIVE is 8)
    expect(Effectiveness.calculate("NORMAL", "GHOST")).toBe(0);
    expect(Effectiveness.calculate("FIRE", "WATER", "WATER")).toBe(4); // same type counted once
    expect(Effectiveness.superEffectiveType("ELECTRIC", "WATER", "FLYING")).toBe(true);
    expect(Effectiveness.resistantType("GRASS", "FIRE")).toBe(true);
    expect(Effectiveness.normalType("NORMAL", "WATER")).toBe(true);
  });

  it("items: flags, important/consumable, sell price, plugin checks", () => {
    const potion = GameData.Item.get("POTION");
    expect(potion.sellPrice).toBe(Math.floor(potion.price / 2));
    expect(potion.consumable).toBe(true);
    expect(potion.isMedicine()).toBe(true);
    const tm = GameData.Item.each().find((i) => i.isTM())!;
    expect(tm.isImportant()).toBe(true);
    expect(tm.canHold()).toBe(false);
    const z = GameData.Item.each().find((i) => i.isZCrystal())!;
    expect(z.isImportant()).toBe(true);
    expect(z.unlosable("PIKACHU", "STATIC")).toBe(true);
    expect(GameData.Item.get("FISTPLATE").unlosable("ARCEUS", "MULTITYPE")).toBe(true);
    expect(GameData.Item.get("FISTPLATE").unlosable("ARCEUS", "PRESSURE")).toBe(false);
    expect(GameData.Item.get("LEFTOVERS").unlosable("PIKACHU", "STATIC")).toBe(false);
  });

  it("moves: category checks and ZUD's name fix-up", () => {
    const tackle = GameData.Move.get("TACKLE");
    expect(tackle.physical()).toBe(true);
    expect(tackle.special()).toBe(false);
    expect(GameData.Move.get("GROWL").physical()).toBe(false);
    expect(GameData.Move.get("CUT").hiddenMove()).toBe(true);
  });

  it("species: forms, evolution family, baby species, minimum level (Ruby)", () => {
    const vulpix1 = GameData.Species.getSpeciesForm("VULPIX", 1)!;
    expect(vulpix1.id).toBe("VULPIX_1");
    expect(GameData.Species.getSpeciesForm("PIKACHU", 99)!.id).toBe("PIKACHU");
    expect(GameData.Species.getSpeciesForm(null, 0)).toBeNull();
    for (const [sp, lvl] of ref.minimumLevel) expect(GameData.Species.get(sp as string).minimumLevel(), sp as string).toBe(lvl);
    for (const [sp, baby, family] of ref.babies) {
      expect(GameData.Species.get(sp as string).getBabySpecies()).toBe(baby);
      expect(GameData.Species.get(sp as string).getFamilySpecies()).toEqual(family);
    }
    expect(GameData.Species.get("CHARMANDER").getEvolutions()).toEqual([["CHARMELEON", "Level", 16]]);
    expect(GameData.Species.get("CHARMANDER").getFamilyEvolutions().map((e) => e[1])).toEqual(["CHARMELEON", "CHARIZARD"]);
    expect(GameData.Species.get("PIKACHU").breedingCanProduce("PICHU")).toBe(true);
  });

  it("species metrics: form metrics fall back to the species' and are registered lazily", () => {
    const base = GameData.SpeciesMetrics.getSpeciesForm("PIKACHU", 0)!;
    expect(GameData.SpeciesMetrics.exists("PIKACHU_57")).toBe(false);
    const form = GameData.SpeciesMetrics.getSpeciesForm("PIKACHU", 57)!;
    expect(form.id).toBe("PIKACHU_57");
    expect(form.frontSprite).toEqual(base.frontSprite);
    expect(form.frontSprite).not.toBe(base.frontSprite);
    expect(form.dmaxShadowSize).toBe(3);
    expect(GameData.SpeciesMetrics.exists("PIKACHU_57")).toBe(true);
    expect(() => GameData.SpeciesMetrics.getSpeciesForm("NOTAPOKEMON", 0)).toThrow();
  });

  it("trainer types and trainers", () => {
    expect(GameData.TrainerType.get("YOUNGSTER").male()).toBe(true);
    expect(GameData.Trainer.exists("YOUNGSTER", "Joey", 1)).toBe(true);
    expect(GameData.Trainer.get("YOUNGSTER", "Joey").pokemon[0]!.species).toBe("RATTATA");
    expect(GameData.Trainer.tryGet("YOUNGSTER", "Nobody")).toBeNull();
  });

  it("ZUD power moves", () => {
    expect(GameData.PowerMove.speciesList("G-Max")).toContain("CHARIZARD");
    expect(GameData.Species.get("CHARIZARD").hasGmax()).toBe(true);
    expect(GameData.Species.get("PIDGEY").hasGmax()).toBe(false);
    expect(GameData.PowerMove.maxmoveFrom("EMBER", "CHARMANDER")).toBe("MAXFLARE");
  });
});
