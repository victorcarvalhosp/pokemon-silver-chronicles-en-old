// Followers / Following Pokemon EX on the real converted maps: the follower
// keeps to the tile behind the player (also across a map connection), walks
// into doors and comes out on the player, survives a save/load, and the
// plugin's script helpers behave like the Ruby.
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAssetIndex } from "../../core/assets";
import { GameData } from "../../data/gameData";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { loadGameData, preloadMaps, setMapConnections } from "../../data/store";
import { SceneMap } from "../../scenes/SceneMap";
import { EventHandlers } from "../eventHandlers";
import { REAL_RES_X, REAL_RES_Y } from "../GameCharacter";
import type { GameEvent } from "../GameEvent";
import { GamePlayer } from "../GamePlayer";
import { G, GameSelfSwitches, GameSwitches, GameVariables, PokemonGlobalMetadata } from "../globals";
import { GameSystem } from "../GameSystem";
import { GameScreen } from "../GameScreen";
import { Interpreter } from "../Interpreter";
import { PokemonMapFactory } from "../MapFactory";
import { Pokemon } from "../pokemon/Pokemon";
import { restore, snapshot } from "../save/snapshot";
import { Player } from "../trainer/Player";
import { Followers, FollowingPkmn } from "./index";
import type { GameFollower } from "./GameFollower";
import { GameFollowingPkmn } from "./GameFollower";
import type { GameFollowerFactory } from "./GameFollowerFactory";
import { PBMoveRoute, pbMoveRoute } from "./moveRoute";

const DATA = resolve(import.meta.dirname, "../../../data");
const GAME = resolve(import.meta.dirname, "../../../..");

beforeAll(async () => {
  // Serve web/data from disk to the loaders.
  globalThis.fetch = (async (url: string) => {
    if (url === "/game/__index.json") {
      // The dev server's asset index, for the graphics these tests look up.
      const files = (readdirSync(join(GAME, "Graphics/Characters"), { recursive: true }) as string[])
        .map((f) => `graphics/characters/${f.split("\\").join("/")}`.toLowerCase());
      const index = files.flatMap((f) => [f, f.replace(/\.[a-z]+$/, "")]);
      return { ok: true, status: 200, json: async () => index } as Response;
    }
    const text = readFileSync(join(DATA, String(url).replace(/^\/data\//, "")), "utf8");
    return { ok: true, status: 200, json: async () => JSON.parse(text) as unknown } as Response;
  }) as typeof fetch;
  await loadAssetIndex();
  loadGameDataForTests();
  await loadGameData();
  const connections = JSON.parse(readFileSync(join(DATA, "pbs/map-connections.json"), "utf8")) as
    { map1: number; edge1: string; position1: number; map2: number; edge2: string; position2: number }[];
  setMapConnections(connections.map((c) => [c.map1, c.edge1, c.position1, c.map2, c.edge2, c.position2]));
  await preloadMaps(8, 0);
  await preloadMaps(1, 2);
});

const player = () => G.gamePlayer as unknown as GamePlayer;
const factory = () => G.gameTemp.followers as unknown as GameFollowerFactory;
const follower = () => factory().getFollowerByIndex()!;

/** Runs a character's frames until it stops moving and its forced route ends. */
async function settle(ev: GameFollower, max = 600): Promise<void> {
  for (let i = 0; i < max && (ev.moving() || ev.jumping() || ev.moveRouteForcing); i++) await ev.update();
}

/** Finishes the player's step instantly (the follower only cares about its tile). */
function landPlayer(): void {
  const p = player();
  p.realX = p.x * REAL_RES_X;
  p.realY = p.y * REAL_RES_Y;
}

/** A fresh session on `mapId` with a Chikorita in the party and Scene_Map as $scene. */
function startOn(mapId: number, x: number, y: number, dir: number): void {
  G.pokemonGlobal = new PokemonGlobalMetadata();
  G.gameSwitches = new GameSwitches();
  G.gameVariables = new GameVariables();
  G.gameSelfSwitches = new GameSelfSwitches();
  G.gameSystem = new GameSystem();
  G.gameScreen = new GameScreen();
  G.gameSystem.mapInterpreter = new Interpreter(0, true);
  const trainer = new Player("Gold", GameData.TrainerType.keys()[0]!);
  G.player = trainer as never;
  trainer.party.push(new Pokemon("CHIKORITA", 5, trainer as never));
  G.scene = Object.create(SceneMap.prototype) as never; // $scene.is_a?(Scene_Map), no sprites
  G.gamePlayer = new GamePlayer() as never;
  new PokemonMapFactory(mapId);
  player().moveto(x, y);
  player().direction = dir;
}

describe("Following Pokémon in Elm's Lab", () => {
  beforeEach(() => startOn(8, 9, 13, 8));

  it("starts behind the player, facing them, with its overworld sprite", async () => {
    // Event 14 ("FollowerPkmn") is far away, so it's moved behind the player first.
    await FollowingPkmn.startFollowing(14, false);
    const ev = follower();
    expect(ev).toBeInstanceOf(GameFollowingPkmn);
    expect([ev.x, ev.y, ev.direction]).toEqual([9, 14, 8]);
    expect(ev.characterName).toBe("Followers/CHIKORITA.png");
    expect(FollowingPkmn.active()).toBe(true);
    const data = G.pokemonGlobal.followers[0] as { name: string; originalMapId: number; eventId: number };
    expect(data).toMatchObject({ name: "FollowingPkmn", originalMapId: 8, eventId: 14 });
  });

  it("steps onto the tile the player left and turns towards them", async () => {
    await FollowingPkmn.startFollowing(14, false);
    const ev = follower();
    await settle(ev);
    player().moveLeft(); // (9,13) -> (8,13)
    landPlayer();
    factory().moveFollowers();
    await settle(ev);
    expect([ev.x, ev.y, ev.direction]).toEqual([9, 13, 4]);
    player().moveUp(); // (8,13) -> (8,12)
    landPlayer();
    factory().moveFollowers();
    await settle(ev);
    expect([ev.x, ev.y, ev.direction]).toEqual([8, 13, 8]);
    expect((G.pokemonGlobal.followers[0] as { x: number; y: number }).y).toBe(13);
  });

  it("walks into a door with the player and comes out on top of them", async () => {
    await FollowingPkmn.startFollowing(14, false);
    const ev = follower();
    await settle(ev);
    // Followers.follow_into_door: one step onto the player's tile, then invisible.
    Followers.followIntoDoor();
    expect(ev.moveRouteForcing).toBe(true);
    await settle(ev);
    expect([ev.x, ev.y, ev.opacity]).toEqual([9, 13, 0]);
    // Scene_Map#transfer_player: the map changes, then map_transfer_followers.
    (G.mapFactory as unknown as PokemonMapFactory).setup(1);
    player().moveto(14, 9);
    player().turnDown();
    factory().mapTransferFollowers();
    expect([ev.map.mapId, ev.x, ev.y, ev.opacity]).toEqual([1, 14, 9, 255]);
    const data = G.pokemonGlobal.followers[0] as { currentMapId: number; invisibleAfterTransfer: boolean };
    expect(data.currentMapId).toBe(1);
    await factory().update();
    expect(ev.transparent).toBe(true); // hidden until the player moves
    player().moveDown(); // the door event walks the player out
    factory().moveFollowers();
    await factory().update();
    expect(data.invisibleAfterTransfer).toBe(false);
    expect(ev.transparent).toBe(false);
  });

  it("is rebuilt from $PokemonGlobal.followers after saving and loading", async () => {
    await FollowingPkmn.startFollowing(14, false);
    player().moveLeft();
    landPlayer();
    factory().moveFollowers();
    await settle(follower());
    // The "global_metadata" save value: snapshot -> JSON -> restore.
    const json = JSON.parse(JSON.stringify(snapshot(G.pokemonGlobal))) as unknown;
    const loaded = new PokemonGlobalMetadata();
    restore(loaded, json);
    G.pokemonGlobal = loaded;
    // $game_temp.followers is rebuilt for the loaded $PokemonGlobal.
    const ev = follower();
    expect(ev).toBeInstanceOf(GameFollowingPkmn);
    expect([ev.map.mapId, ev.x, ev.y, ev.characterName]).toEqual([8, 9, 13, "Followers/CHIKORITA.png"]);
    expect(G.pokemonGlobal.followerToggled).toBe(true);
    await FollowingPkmn.refresh(false);
    expect(FollowingPkmn.active()).toBe(true);
  });

  it("can't be walked through by other events while it follows", async () => {
    await FollowingPkmn.startFollowing(14, false);
    const ev = follower();
    await factory().update(); // Marin's factory makes followers solid (through = false)
    const events = (G.gameMap as unknown as { events: Map<number, GameEvent> }).events;
    const elm = [...events.values()].find((e) => e.id !== 14 && e.characterName !== "")!;
    const [x, y] = [ev.x - 1, ev.y];
    expect(elm.passable(x, y, 6)).toBe(false);
    FollowingPkmn.setFollowerToggled(false);
    expect(FollowingPkmn.active()).toBe(false);
  });
});

describe("Following Pokémon across a map connection", () => {
  it("moves onto Route 29 when the player crosses New Bark Town's west edge", async () => {
    // Try New Bark Town's rows until one lets the player walk off the west edge.
    let crossed = false;
    for (let row = 0; row < 30 && !crossed; row++) {
      startOn(1, 2, row, 4);
      if (!player().canMoveInDirection(4)) continue;
      Followers.add(1, "Partner", null); // any map event works as a (non-Pokémon) follower
      const ev = follower();
      ev.moveto(3, row);
      for (let step = 0; step < 4; step++) {
        player().moveLeft();
        landPlayer();
        (G.mapFactory as unknown as PokemonMapFactory).setCurrentMap();
        factory().moveFollowers();
        await settle(ev);
      }
      const p = player();
      if (p.map.mapId !== 4) continue;
      crossed = true;
      expect(ev.map.mapId).toBe(4);
      // One tile behind (east of) the player, on Route 29's coordinates.
      expect([ev.x, ev.y]).toEqual([p.x + 1, p.y]);
    }
    expect(crossed).toBe(true);
  });
});

describe("script helpers", () => {
  it("pbMoveRoute wraps the commands in Through On/Off like Essentials", () => {
    const route = pbMoveRoute(null, [PBMoveRoute.TurnRight, PBMoveRoute.Wait, 4, PBMoveRoute.Jump, 0, 0, PBMoveRoute.Opacity, 0]);
    expect(route).toEqual({
      repeat: false,
      skippable: true,
      list: [
        { move: "throughOn" }, { move: "turnRight" }, { move: "wait", seconds: 0.2 },
        { move: "jump", x: 0, y: 0 }, { move: "opacity", value: 0 }, { move: "throughOff" },
      ],
    });
  });

  it("EventHandlers.trigger_2 returns the first non-nil result, else -1", async () => {
    EventHandlers.add("test_trigger_2", "a", () => null);
    EventHandlers.add("test_trigger_2", "b", () => false);
    EventHandlers.add("test_trigger_2", "c", () => true);
    expect(EventHandlers.trigger2Sync("test_trigger_2")).toBe(false);
    expect(await EventHandlers.trigger2("test_trigger_2")).toBe(false);
    EventHandlers.add("test_trigger_2b", "a", () => undefined);
    expect(EventHandlers.trigger2Sync("test_trigger_2b")).toBe(-1);
    expect(EventHandlers.trigger2Sync("nothing_registered")).toBe(null);
  });
});
