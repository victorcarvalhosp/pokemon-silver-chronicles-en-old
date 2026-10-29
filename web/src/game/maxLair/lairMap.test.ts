// The Max Lair map (MaxLair_Map.rb, MaxLair_Controls.rb) against the game's
// own Ruby, headless: raidReference.json.gz's "lairMaps" (written by
// web/tools/ruby-ref/raid_reference.rb) builds a lair with scripted random
// numbers (the lair's species and Pokémon, trap/block/chest variations,
// visible traps, type icons), snapshots every sprite (key, position,
// visibility, src_rect, opacity, colour alpha), then walks a scripted route
// (at each Selection tile, the n-th way) through the real movement and tile
// code: turns, warps, switches, doors, roadblocks, traps, chests, NPCs and
// battles (recorded and counted as won), messages and menus logged.
// Sprites here only have their PNG's size, as in the harness.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { beforeAll, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  // No OffscreenCanvas in node: bitmaps that draw nothing.
  const ctx = new Proxy({}, { get: () => () => ({}) });
  (globalThis as Record<string, unknown>).OffscreenCanvas = class {
    constructor(public width: number, public height: number) {}
    getContext(): unknown { return ctx; }
  };
  return { log: [] as string[], script: { on: false, rolls: [] as number[], used: 0 }, root: "" };
});

vi.mock("../../core/random", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../core/random")>();
  const s = env.script;
  const next = () => {
    if (s.rolls.length === 0) throw new Error("out of scripted rolls");
    s.used += 1;
    return s.rolls.shift()!;
  };
  return {
    ...real,
    random: () => (s.on ? next() / 2 ** 30 : real.random()),
    rand: (n: number) => (s.on ? (n > 0 ? next() % n : next() / 2 ** 30) : real.rand(n)),
  };
});

/** A PNG's size from its header (the harness's png_size). */
function pngSize(path: string | null): [number, number] {
  if (!path) return [32, 32];
  for (const f of [path + ".png", path]) {
    try {
      const b = readFileSync(join(env.root, f));
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    } catch { /* next */ }
  }
  return [32, 32];
}

vi.mock("../../ui/SpriteWrapper", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/SpriteWrapper")>();
  const { Bitmap } = await import("../../rgss/Bitmap");
  const { Sprite } = await import("../../rgss/display");
  class IconSprite extends Sprite {
    constructor(x = 0, y = 0, viewport: unknown = null) {
      super(viewport as never);
      this.x = x;
      this.y = y;
    }
    setBitmapFile(file: string | null): void {
      if (!file) return;
      const [w, h] = pngSize(file);
      this.setBitmap(new Bitmap(w, h));
    }
  }
  class AnimatedSprite extends Sprite {
    static createLong(_n: string, _c: number, _w: number, _h: number, _s: number, viewport: unknown = null): AnimatedSprite {
      return new AnimatedSprite(viewport as never);
    }
    play(): void {}
  }
  return { ...orig, IconSprite, AnimatedSprite };
});
vi.mock("../../ui/sprites/pokemonSprite", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../ui/sprites/pokemonSprite")>();
  const { Sprite } = await import("../../rgss/display");
  class PokemonSprite extends Sprite {
    setPokemonBitmap(): void {}
    setOffset(): void {}
  }
  return { ...orig, PokemonSprite, preloadPokemonSprite: async () => {} };
});
vi.mock("../../ui/rpgCache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/rpgCache")>()), preloadBitmaps: async () => {},
}));
vi.mock("../../ui/messages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/messages")>()),
  pbMessage: async (msg: string) => { env.log.push(msg); return 0; },
  pbConfirmMessage: async (msg: string) => { env.log.push(msg); return true; },
}));
vi.mock("./LairMenu_Menus", () => ({ pbMaxLairMenu: async (type: string) => { env.log.push(`[menu] ${type}`); } }));
vi.mock("../field/hiddenMoveAnimation", () => ({
  pbHiddenMoveAnimation: async (p: { species: string } | null) => { env.log.push(`[hiddenmove] ${p?.species ?? ""}`); return true; },
}));
vi.mock("../../ui/fades", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/fades")>()),
  pbFadeOutIn: async (block?: () => unknown) => { await block?.(); },
  pbFadeOutAndHide: async () => ({}),
  pbFadeInAndShow: async () => {},
}));
vi.mock("../../ui/pokegear/frameClock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/pokegear/frameClock")>()),
  FrameWaiter: class { async wait(): Promise<void> {} },
}));
vi.mock("../../ui/scenes/frames", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/scenes/frames")>()), pbWait: async () => {},
}));
vi.mock("../GameSystem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../GameSystem")>()),
  pbSEPlay: () => {}, pbBGMPlay: () => {}, pbBGMFade: () => {}, pbPlayDecisionSE: () => {}, pbPlayCancelSE: () => {},
}));

import { Container } from "pixi.js";
import { loadAssetIndex } from "../../core/assets";
import { attachStage } from "../../rgss/display";
import { GameData } from "../../data/gameData";
import { Settings } from "../../data/gameData/settings";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G, GameSwitches, GameTemp, GameVariables, PokemonGlobalMetadata } from "../globals";
import { PokemonBag } from "../items/PokemonBag";
import { Pokemon } from "../pokemon/Pokemon";
import { GameStats } from "../trainer/GameStats";
import { Player } from "../trainer/Player";
import { pbDynamaxAdventure } from "./Adventure_Main";
import "./Adventure_Triggers";
import { LairMapScene } from "./MaxLair_Map";
import "./MaxLair_Controls";

type LairCase = { case: { map: number; seed: number; route: number[] }; species: string[]; built: unknown[][] | null;
  final: unknown[][] | null; log: string[]; adventure: unknown[]; party: unknown[][]; used: number; error: string | null };

const REF = JSON.parse(gunzipSync(readFileSync(resolve(import.meta.dirname, "../../battle/zud/raid/raidReference.json.gz"))).toString("utf8")) as
  { gen: { lairMaps: LairCase[] } };

const lairRolls = (seed: number) => Array.from({ length: 4000 }, (_, i) => (((i + seed) * 2654435761) + 977) % (1 << 30));

let player: Player;

beforeAll(async () => {
  env.root = resolve(import.meta.dirname, "../../../..");
  attachStage(new Container());
  loadGameDataForTests();
  G.gameVariables = new GameVariables();
  G.gameSwitches = new GameSwitches();
  G.gameSwitches.set(Settings.CAN_DYNAMAX_WILD, true);
  // pbResolveBitmap: Pokémon icons (generate_foe's gender check) and the player's map icon.
  const files: string[] = [];
  for (const dir of ["Graphics/Pokemon/Icons", "Graphics/Pictures", "Graphics/Battlebacks"]) {
    for (const f of readdirSync(join(env.root, dir))) files.push(`${dir}/${f}`.toLowerCase());
  }
  const fetch0 = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]) })) as never;
  await loadAssetIndex();
  globalThis.fetch = fetch0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2024, 0, 15, 12, 0, 0));
});

function resetWorld(): void {
  G.gameTemp = new GameTemp();
  G.gameTemp.dxRules = {};
  G.gameTemp.dxPokemon = {};
  G.pokemonGlobal = new PokemonGlobalMetadata();
  player = new Player("Gold", GameData.TrainerType.keys()[0]!);
  player.id = 12345678;
  player.badges = Array(8).fill(true);
  G.player = player as never;
  G.bag = new PokemonBag();
  G.stats = new GameStats();
  const noTerrain = () => ({ battleEnvironment: null });
  G.gameMap = { mapId: 0, events: new Map() } as never;
  G.gamePlayer = { terrainTag: noTerrain, pbFacingTerrainTag: noTerrain } as never;
}

function makePokemon(sp: string, lv: number): Pokemon {
  const pkmn = new Pokemon(sp, lv, player as never);
  for (const s of GameData.Stat.eachMain()) {
    pkmn.iv[s.id] = 31;
    pkmn.ev[s.id] = 0;
  }
  pkmn.nature = "HARDY";
  pkmn.abilityIndex = 0;
  pkmn.item = null;
  pkmn.makeMale();
  pkmn.moves = [];
  pkmn.learnMove("TACKLE");
  pkmn.calcStats();
  return pkmn;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dump = (scene: LairMapScene) => Object.entries(scene.sprites).map(([k, s]: [string, any]) =>
  [k, s.x, s.y, !!s.visible, [s.srcRect.x, s.srcRect.y, s.srcRect.width, s.srcRect.height], s.opacity, s.color.alpha]);

describe("Max Lair map vs Ruby (headless)", () => {
  it.each(REF.gen.lairMaps.map((c) => [`map ${c.case.map}, seed ${c.case.seed}`, c] as const))("%s", async (_n, c) => {
    resetWorld();
    for (const sp of ["PIDGEOT", "MACHAMP", "GYARADOS"]) player.party.push(makePokemon(sp, 50));
    const adv = pbDynamaxAdventure();
    (adv as unknown as { _inProgress: boolean })._inProgress = true;
    adv.knockouts = 3;
    env.log.length = 0;
    let built: unknown[][] | null = null;
    let final: unknown[][] | null = null;
    let error: string | null = null;
    const s = env.script;
    s.rolls = lairRolls(c.case.seed);
    s.used = 0;
    s.on = true;
    try {
      adv.generateSpecies();
      const scene = new LairMapScene();
      scene.lairMapIntro = async () => {};
      // A battle is recorded and counted as won (the harness's lair_StartBattle).
      scene.lairStartBattle = async (index: number) => {
        if (!scene.sprites[`Shadow_${index}`].visible) return;
        env.log.push(`[battle] ${index} ${scene.lairPokemon[index]!.species}`);
        scene.sprites[`Shadow_${index}`].color.alpha = 0;
        scene.sprites[`Shadow_${index}`].visible = false;
        scene.sprites[`Type_${index}`].visible = false;
        pbDynamaxAdventure().bossBattled = scene.lairPokemon[index] === scene.lairPokemon[scene.lairPokemon.length - 1];
      };
      // Route selection on a script (the harness's lair_ChooseRoute).
      scene.lairChooseRoute = async () => {
        for (const r of c.case.route) {
          if (pbDynamaxAdventure().ended()) break;
          const ways = (scene.lairTileType("Select") as number[] | null) ?? [];
          if (ways.length === 0) break;
          const way = ways[r % ways.length]!;
          env.log.push(`[route] ${scene.player.x},${scene.player.y} ${ways.join("")} ${way}`);
          await scene.lairMovePlayerIcon(way);
        }
      };
      let first = true;
      const move = scene.lairMovePlayerIcon.bind(scene);
      scene.lairMovePlayerIcon = async (...a: Parameters<typeof move>) => {
        if (first) {
          first = false;
          built = dump(scene);
        }
        await move(...a);
      };
      await scene.pbStartScene(c.case.map);
      final = dump(scene);
    } catch (e) {
      error = String(e);
    } finally {
      s.on = false;
    }
    expect(error != null, `TS error ${error} / Ruby error ${c.error}`).toBe(c.error != null);
    expect(adv.lairSpecies, "lair species").toEqual(c.species);
    expect(built, "map as built").toEqual(c.built);
    expect(env.log, "route log").toEqual(c.log);
    expect(final, "map after the route").toEqual(c.final);
    expect([adv.keycount, adv.knockouts, adv.bossBattled, adv.loot]).toEqual([c.adventure[0], c.adventure[1], c.adventure[2],
      Array.isArray(c.adventure[3]) ? {} : c.adventure[3]]);
    expect(player.party.map((p) => [p.species, p.hp, p.status])).toEqual(c.party);
    expect(s.used, "random numbers used").toBe(c.used);
  });
});
