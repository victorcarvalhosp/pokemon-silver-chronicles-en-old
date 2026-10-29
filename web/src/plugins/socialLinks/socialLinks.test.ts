//===============================================================================
// Social Links' logic against the game's own Ruby: socialLinksReference.json
// is written by web/tools/ruby-ref/social_links_reference.rb, which loads
// Essentials v20.1 and Plugins/Social Links headless. Both sides run the same
// steps and replay the same random numbers (rand(n) = raw % n). Compared, per
// step: the return value (or error), the messages and sound effects, and the
// state after it (links in order with bond, moments, statuses, location,
// favourite Pokémon, favourite flag, time added; Player#bond_effects). Also:
// active_bond_effect? on several species, pbSortSocialLinks, the status text
// replacement, pbNormalizeStringForMatching, the phone contact matching and
// pbSanitizeProfileID on events. And saves round-trip through Player JSON.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Id } from "../../data/gameData/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameVariables, PokemonGlobalMetadata } from "../../game/globals";
import { Pokemon } from "../../game/pokemon/Pokemon";
import { Player } from "../../game/trainer/Player";
import { GameDataSocialLinkProfile, type BondEffectDef, type SocialLinkProfileHash } from "./data";
import * as F from "./functions";
import { pbNormalizeStringForMatching } from "./normalize";
import { RANDOM_STATUS, SocialLinks, activeBondEffect, socialLinksIO } from "./player";
import { pbRunTextThroughReplacement, pbSortSocialLinks, type LinkEntry } from "./sceneLogic";
import { SocialLinkSettings } from "./settings";
import "./configuration";
import ref from "./socialLinksReference.json";

//===============================================================================
// Scripted randomness, clock, messages
//===============================================================================
const rnd = vi.hoisted(() => ({ rolls: [] as number[], free: true, seed: 1 }));
vi.mock("../../core/random", () => {
  const free = () => {
    rnd.seed = (rnd.seed * 1103515245 + 12345) % 2147483648;
    return rnd.seed / 2147483648;
  };
  return {
    rand: (n: number) => {
      if (rnd.free) return n > 0 ? Math.floor(free() * n) : free();
      if (rnd.rolls.length === 0) throw new Error("out of scripted rolls");
      const raw = rnd.rolls.shift()!;
      if (!(n > 0)) throw new Error(`unexpected rand(${n})`);
      return raw % n;
    },
    random: () => free(),
    seedRandom: () => {},
  };
});
const clock = vi.hoisted(() => ({ t: 0 }));
vi.mock("../../game/dayNight", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  pbGetTimeNow: () => new Date((1_700_000_000 + ++clock.t) * 1000),
}));

let log: [string, string][] = [];
socialLinksIO.message = async (text) => { log.push(["msg", text]); };
socialLinksIO.se = async (name) => { log.push(["se", name]); };
socialLinksIO.warn = (text) => { log.push(["warn", text]); };

//===============================================================================
// Reference
//===============================================================================
type Json = unknown;
interface Step {
  op: string;
  args: Json[];
  kw: { silent?: boolean };
  rolls: number[] | null;
  result: { ret?: Json; error?: { class: string; message: string }; rollsLeft: number };
  log: [string, string][];
  state: State;
}
interface State { links: Record<string, Json>[]; theme: string; bondEffects: Record<string, Json[]> }
const reference = ref as unknown as {
  extraProfiles: Record<string, Json>[];
  scenario1: Step[];
  activeBondEffect: { set: [string, number]; bondEffects: Record<string, Json[]>; values: Record<string, Json> }[];
  scenario3: Step[];
  sorts: { state: State; results: { favorites: string[]; allowFavoriting: boolean; method: number; order: string[] }[] };
  textReplacement: { forced: string; name: string; male: boolean; female: boolean; in: string; out: string }[];
  normalize: [string, string][];
  phone: Step[];
};

/** social_links_reference.rb's EXTRA_PROFILES, registered the same way. */
function registerExtraProfiles(): void {
  for (const h of reference.extraProfiles) {
    const hash: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(h)) {
      const key = k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
      hash[key] = key === "bondEffects"
        ? Object.entries(v as Record<string, BondEffectDef[]>).map(([lvl, list]) => [Number(lvl), list])
        : v;
    }
    GameDataSocialLinkProfile.register(hash as unknown as SocialLinkProfileHash);
  }
}

let player: Player;
function newPlayer(name = "Gold"): void {
  rnd.free = true;
  player = new Player(name, "PkMnTRAINER_Male");
  player.money = 123_456;
  G.player = player as never;
  clock.t = 0;
}

function snapshot(): State {
  const links = [...(player.socialLinks as SocialLinks).links.values()].map((p) => ({
    id: p.id, name: p.name, bond: p.bond, moments: p.moments, status: p.rawCurrentStatus, location: p.currentLocation,
    favoritePokemon: p.favoritePokemon, pastStatuses: [...p.pastStatuses], favorite: p.favorite,
    timeAdded: Math.round(p.timeAdded / 1000) - 1_700_000_000,
  }));
  return { links, theme: (player.socialLinks as SocialLinks).themeColor, bondEffects: JSON.parse(JSON.stringify(player.bondEffects)) };
}

const links = () => (player.socialLinks as SocialLinks).links;
const OPS: Record<string, (args: Json[], silent: boolean) => unknown> = {
  add: ([id], s) => F.pbAddSocialLink(id as Id, s),
  remove: ([id], s) => F.pbRemoveSocialLink(id as Id, s),
  has: ([id]) => F.pbHasSocialLink(id as Id),
  gainBond: ([id, v], s) => F.pbGainSocialLinkBond(id as Id, v as number, s),
  lowerBond: ([id, v], s) => F.pbLowerSocialLinkBond(id as Id, v as number, s),
  setBond: ([id, v], s) => F.pbSetSocialLinkBond(id as Id, v as number, s),
  getBond: ([id]) => F.pbGetSocialLinkBond(id as Id),
  bondMaxed: ([id]) => F.pbSocialLinkBondMaxed(id as Id),
  gainMoment: ([id, v], s) => F.pbGainSocialLinkMoment(id as Id, v as number, s),
  lowerMoment: ([id, v], s) => F.pbLowerSocialLinkMoment(id as Id, v as number, s),
  setMoment: ([id, v], s) => F.pbSetSocialLinkMoment(id as Id, v as number, s),
  getMoments: ([id]) => F.pbGetSocialLinkMoments(id as Id),
  momentsMaxed: ([id]) => F.pbSocialLinkMomentsMaxed(id as Id),
  setLocation: ([id, loc]) => F.pbSetSocialLinkLocation(id as Id, loc as string),
  setPokemon: ([id, ...rest]) =>
    F.pbSetSocialLinkFavoritePokemon(id as Id, (rest[0] ?? null) as Id | null, (rest[1] ?? 0) as number, (rest[2] ?? 0) as number, (rest[3] ?? false) as boolean),
  setStatus: ([id, status]) => F.pbSetSocialLinkStatus(id as Id, status as string | number),
  setStatusRandom: ([id]) => F.pbSetSocialLinkStatusRandom(id as Id),
  currentStatus: ([id]) => links().get(id as Id)!.currentStatus,
  momentsMax: ([id]) => links().get(id as Id)!.momentsMax,
  toggleFavorite: ([id, ...val]) => links().get(id as Id)!.toggleFavorite(val.length ? (val[0] as boolean) : null),
  setTheme: ([color]) => F.pbSetSocialTheme(color as string),
  phone: ([numbers]) => {
    (G.pokemonGlobal as unknown as { phoneNumbers: unknown }).phoneNumbers = JSON.parse(JSON.stringify(numbers));
    return null;
  },
  fromPhone: (_a, s) => F.pbAddSocialLinksFromPhone(s),
  phoneContact: ([id]) => links().get(id as Id)!.phoneContact(),
  hasPhoneContact: ([id]) => links().get(id as Id)!.hasPhoneContact(),
  event: ([name, op]) => (op === "add" ? F.pbAddSocialLink({ id: 3, name: name as string, mapId: 890 }) : null),
  interpreter: ([name]) => F.pbHasSocialLink({ getCharacter: () => ({ id: 4, name, mapId: 890 }) } as never),
};

async function replay(steps: Step[]): Promise<void> {
  for (const [i, step] of steps.entries()) {
    log = [];
    rnd.rolls = [...(step.rolls ?? [])];
    rnd.free = false;
    const res: Record<string, unknown> = {};
    try {
      const ret = await OPS[step.op]!(step.args, !!step.kw.silent);
      res.ret = ret === undefined ? null : JSON.parse(JSON.stringify(ret));
    } catch (e) {
      const err = e as Error;
      res.error = { class: err.name === "Error" ? "RuntimeError" : err.name, message: err.message };
    }
    rnd.free = true;
    res.rollsLeft = rnd.rolls.length;
    const label = `step ${i}: ${step.op}(${JSON.stringify(step.args)}, ${JSON.stringify(step.kw)})`;
    expect(res, label).toEqual(step.result);
    expect(log, label).toEqual(step.log);
    expect(snapshot(), label).toEqual(step.state);
  }
}

beforeAll(() => {
  loadGameDataForTests();
  registerExtraProfiles();
  G.gameVariables = new GameVariables();
  G.pokemonGlobal = new PokemonGlobalMetadata() as never;
  (G.pokemonGlobal as unknown as { phoneNumbers: unknown }).phoneNumbers = null;
});

//===============================================================================
// Tests
//===============================================================================
describe("Social Links vs Ruby", () => {
  it("adds links, gains/lowers/sets bonds and moments, refreshes bond effects", async () => {
    newPlayer();
    await replay(reference.scenario1);
  });

  it("statuses, favourite Pokémon, location, favourites", async () => {
    newPlayer();
    await replay(reference.scenario3);
  });

  it("phone integration and SocialLink(:ID) event labels", async () => {
    newPlayer();
    (G.pokemonGlobal as unknown as { phoneNumbers: unknown }).phoneNumbers = null;
    await replay(reference.phone);
  });

  it("active_bond_effect? (EXP rate, shiny rolls, catch rate)", async () => {
    newPlayer();
    for (const id of ["JOEY", "PROFOAK", "TESTA"]) await F.pbAddSocialLink(id, true);
    for (const row of reference.activeBondEffect) {
      await F.pbSetSocialLinkBond(row.set[0], row.set[1], true);
      expect(JSON.parse(JSON.stringify(player.bondEffects)), JSON.stringify(row.set)).toEqual(row.bondEffects);
      const values: Record<string, unknown> = {};
      for (const sp of Object.keys(row.values)) {
        if (sp === "unknownStyle") continue;
        const pkmn = new Pokemon(sp, 5);
        values[sp] = ["EXP", "Shiny", "CatchRate"].map((st) => activeBondEffect(player, st, pkmn));
      }
      values.unknownStyle = activeBondEffect(player, "Other", new Pokemon("PIKACHU", 5));
      expect(values, JSON.stringify(row.set)).toEqual(row.values);
    }
  });

  it("pbSortSocialLinks", async () => {
    newPlayer();
    for (const id of ["MOTHER", "JOEY", "PROFOAK", "BROCK", "TESTB", "KRIS"]) await F.pbAddSocialLink(id, true);
    await F.pbSetSocialLinkBond("JOEY", 4, true);
    await F.pbSetSocialLinkBond("PROFOAK", 4, true);
    await F.pbSetSocialLinkBond("BROCK", 1, true);
    await F.pbSetSocialLinkBond("KRIS", 9, true);
    const saved = SocialLinkSettings.ALLOW_FAVORITING;
    try {
      for (const r of reference.sorts.results) {
        for (const p of links().values()) p.favorite = r.favorites.includes(p.id);
        SocialLinkSettings.ALLOW_FAVORITING = r.allowFavoriting;
        const list: LinkEntry[] = [...links()];
        pbSortSocialLinks(list, r.method);
        expect(list.map(([k]) => k), JSON.stringify(r)).toEqual(r.order);
      }
    } finally {
      SocialLinkSettings.ALLOW_FAVORITING = saved;
    }
    expect(snapshot()).toEqual(reference.sorts.state);
  });

  it("pbRunTextThroughReplacement", () => {
    for (const r of reference.textReplacement) {
      newPlayer(r.name);
      player.money = 1_234_567;
      if (r.forced) {
        player.male = () => r.forced === "male";
        player.female = () => r.forced === "female";
      }
      expect([player.male(), player.female()]).toEqual([r.male, r.female]);
      G.gameVariables = new GameVariables();
      G.gameVariables.set(5, 42);
      G.gameVariables.set(6, "six");
      G.gameVariables.set(7, "\\v[5]!");
      expect(pbRunTextThroughReplacement(r.in), `${r.forced} ${JSON.stringify(r.in)}`).toBe(r.out);
    }
  });

  it("pbNormalizeStringForMatching", () => {
    for (const [input, out] of reference.normalize) expect(pbNormalizeStringForMatching(input), JSON.stringify(input)).toBe(out);
  });
});

describe("Social Links saves", () => {
  it("round-trip through Player JSON", async () => {
    newPlayer();
    for (const id of ["JOEY", "PROFOAK", "TESTB"]) await F.pbAddSocialLink(id, true);
    await F.pbGainSocialLinkBond("JOEY", 7, true);
    await F.pbGainSocialLinkMoment("PROFOAK", 2, true);
    F.pbSetSocialLinkStatus("PROFOAK", 0);
    F.pbSetSocialLinkFavoritePokemon("TESTB", "MEW", 1, 0, true);
    links().get("PROFOAK")!.toggleFavorite();
    F.pbSetSocialTheme("Green");
    const json = JSON.parse(JSON.stringify(player.toJSON()));
    const loaded = Player.fromJSON(json);
    expect(loaded.socialLinks).toBeInstanceOf(SocialLinks);
    expect(JSON.parse(JSON.stringify(loaded.toJSON()))).toEqual(json);
    const before = snapshot();
    player = loaded;
    G.player = loaded as never;
    expect(snapshot()).toEqual(before);
    // Still works after loading
    expect(await F.pbGainSocialLinkBond("JOEY", 1, true)).toBe(true);
    expect(F.pbGetSocialLinkBond("JOEY")).toBe(8);
    expect(F.pbSetSocialLinkStatus("PROFOAK", 0)).toBe(false); // already shown
  });

  it("an old save without Social Links gets them on first use", () => {
    newPlayer();
    const json = JSON.parse(JSON.stringify(player.toJSON()));
    json.socialLinks = null;
    const loaded = Player.fromJSON(json);
    expect(loaded.socialLinks).toBeNull();
    G.player = loaded as never;
    expect(F.pbHasSocialLink("JOEY")).toBe(false);
    expect(loaded.socialLinks).toBeInstanceOf(SocialLinks);
  });
});
