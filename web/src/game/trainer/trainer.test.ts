// Trainers, the player and the Pokédex. to_trainer is checked against the
// Ruby reference (rubyReference.json), which ran Essentials' to_trainer with
// Essentials Deluxe's/ZUD's patches on the same trainers.
import { beforeAll, describe, expect, it } from "vitest";
import { seedRandom } from "../../core/random";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables } from "../globals";
import { Pokemon } from "../pokemon/Pokemon";
import ref from "../pokemon/rubyReference.json";
import { GameStats } from "./GameStats";
import { pbLoadTrainer } from "./loadAndNew";
import { Player } from "./Player";
import { Pokedex } from "./Pokedex";
import { NPCTrainer } from "./Trainer";

beforeAll(() => {
  loadGameDataForTests();
  seedRandom(7);
  G.gameVariables = new GameVariables();
});

const newPlayer = () => new Player("Gold", GameData.TrainerType.keys()[0]!);

describe("GameData::Trainer#to_trainer", () => {
  it("builds the same parties as Ruby", () => {
    G.player = newPlayer();
    for (const t of ref.trainers) {
      const [type, name, version] = t.id as [string, string, number];
      const tr = GameData.Trainer.get(type, name, version).toTrainer();
      expect(tr).toBeInstanceOf(NPCTrainer);
      expect([tr.name, tr.trainerType, tr.items, tr.loseText]).toEqual([t.name, t.type, t.items, t.loseText]);
      expect(tr.id).not.toBe((G.player as unknown as Player).id);
      const party = tr.party.map((pk) => ({
        species: pk.species, form: pk.formSimple, level: pk.level, item: pk.itemId, ability: pk.abilityId,
        nature: pk.natureId, gender: pk.gender, shiny: pk.shiny, moves: pk.moves.map((m) => m.id), iv: pk.iv, ev: pk.ev,
        happiness: pk.happiness, name: pk.name, ace: pk.ace, dynamaxLvl: pk.dynamaxLvl, gmaxFactor: pk.gmaxFactor, hp: pk.hp,
        totalhp: pk.totalhp, attack: pk.attack, defense: pk.defense, spatk: pk.spatk, spdef: pk.spdef, speed: pk.speed,
      }));
      expect(party, `${type} ${name} ${version}`).toEqual(t.party);
    }
  });

  it("uses the rival's name from its game variable", () => {
    G.player = newPlayer();
    G.gameVariables.set(111, "Silver");
    const tr = GameData.Trainer.get("Rival", "???", 1).toTrainer();
    expect(tr.name).toBe("Silver");
    G.gameVariables.set(111, 0);
    expect(pbLoadTrainer("YOUNGSTER", "Joey", 1)!.party.length).toBe(2);
    expect(pbLoadTrainer("YOUNGSTER", "Nobody")).toBeNull();
  });
});

describe("Trainer / Player", () => {
  it("party helpers", () => {
    const p = newPlayer();
    expect(p.partyFull()).toBe(false);
    p.party.push(new Pokemon("PIKACHU", 5, p), new Pokemon("TOGEPI", 5, p));
    p.party[1]!.stepsToHatch = 100; // an egg
    expect(p.pokemonCount()).toBe(1);
    expect(p.partyCount()).toBe(2);
    expect(p.hasSpecies("PIKACHU")).toBe(true);
    expect(p.hasSpecies("TOGEPI")).toBe(false); // eggs don't count
    expect(p.hasPokemonOfType("ELECTRIC")).toBe(true);
    expect(p.firstAblePokemon()!.species).toBe("PIKACHU");
    expect(p.party[0]!.owner.id).toBe(p.id);
    expect(p.party[0]!.foreign(p)).toBe(false);
    expect(p.removePokemonAtIndex(0)).toBe(false); // last able Pokémon
    expect(p.publicID()).toBe(p.id & 0xFFFF);
    expect(p.secretID()).toBe(p.id >>> 16);
  });

  it("player fields and limits", () => {
    const p = newPlayer();
    expect(p.money).toBe(GameData.Metadata.get().startMoney);
    p.money = 5_000_000;
    expect(p.money).toBe(999_999);
    p.coins = -5;
    expect(p.coins).toBe(0);
    expect(() => { p.money = 1.5; }).toThrow();
    p.badges[0] = true;
    p.badges[3] = true;
    expect(p.badgeCount()).toBe(2);
    p.characterID = 2;
    expect(p.trainerType).toBe(GameData.PlayerMetadata.get(2).trainerType);
    expect(p.outfitUnlocked).toEqual(["Basic Clothes"]);
    p.pbUnlockOutfit(2);
    expect(p.outfitUnlocked).toEqual(["Basic Clothes", "Rocket Uniform"]);
  });

  it("round-trips the player (party, Pokédex, plugin fields) through JSON", () => {
    const p = newPlayer();
    p.name = "Kris";
    p.characterID = 2;
    p.party.push(new Pokemon("CHIKORITA", 5, p));
    p.pokedex.register(p.party[0]!);
    p.pokedex.setOwned("CHIKORITA");
    p.pokedex.registerCaught("CHIKORITA");
    p.pokedex.unlock(0);
    p.hasRunningShoes = true;
    p.setBirthdate(1, 2, 2000);
    p.stars = 3;
    const json = JSON.parse(JSON.stringify(p.toJSON())) as ReturnType<Player["toJSON"]>;
    const q = Player.fromJSON(json);
    expect(q).toBeInstanceOf(Player);
    expect(JSON.parse(JSON.stringify(q.toJSON()))).toEqual(json);
    expect(q.party[0]).toBeInstanceOf(Pokemon);
    expect(q.owned("CHIKORITA")).toBe(true);
    expect(q.pokedex.caughtCount("CHIKORITA")).toBe(1);
    expect(q.characterID).toBe(2);
    expect(q.birthdate.getFullYear()).toBe(2000);
  });
});

describe("Pokedex (Essentials Deluxe's form tracking)", () => {
  it("matches Ruby for seen/owned counts and forms", () => {
    const dex = new Pokedex();
    const vulpix = new Pokemon("VULPIX_1", 10, null);
    dex.register(vulpix);
    dex.register("PIKACHU");
    dex.setOwned("PIKACHU");
    expect({
      seenCount: dex.seenCount(), ownedCount: dex.ownedCount(),
      vulpixForm1: dex.seenForm("VULPIX", vulpix.gender, 1), vulpixForm0: dex.seenForm("VULPIX", vulpix.gender, 0),
      forms: dex.seenFormsCount("VULPIX"), accessible: dex.accessibleDexes, dexes: dex.dexesCount(),
    }).toEqual(ref.dex);
    const back = Pokedex.fromJSON(JSON.parse(JSON.stringify(dex.toJSON())) as ReturnType<Pokedex["toJSON"]>);
    expect(back.toJSON()).toEqual(dex.toJSON());
    expect(back.accessibleDexes).toEqual(dex.accessibleDexes);
  });
});

describe("GameStats", () => {
  it("round-trips and keeps counters", () => {
    const s = new GameStats();
    s.distanceWalked = 10;
    s.distanceSurfed = 5;
    s.playTime = 100;
    s.setTimeToBadge(2);
    expect(s.distanceMoved()).toBe(15);
    expect(s.gymLeaderAttempts.length).toBe(50);
    const t = GameStats.fromJSON(JSON.parse(JSON.stringify(s.toJSON())) as Record<string, unknown>);
    expect(t.toJSON()).toEqual(s.toJSON());
    expect(t.timesToGetBadges[2]).toBe(100);
    expect(t.zmoveCount).toBe(0);
  });
});
