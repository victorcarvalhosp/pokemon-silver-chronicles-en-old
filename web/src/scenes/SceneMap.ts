// Port of 003_Game processing/002_Scene_Map.rb.

import { connectionsFor, getMapData, preloadMaps } from "../data/store";
import { Data } from "../data/store";
import { EventHandlers } from "../game/eventHandlers";
import { pbDayNightTint } from "../game/dayNight";
import type { GameMap } from "../game/GameMap";
import { pbCancelVehicles, type GamePlayer } from "../game/GamePlayer";
import { G } from "../game/globals";
import { pbMapInterpreter } from "../game/Interpreter";
import type { PokemonMapFactory } from "../game/MapFactory";
import { pbBGMFade } from "../game/GameSystem";
import { SaveData } from "../game/save/SaveData";
import { TilemapRenderer, type TilemapSource } from "../map/TilemapRenderer";
import { Graphics } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { preloadMapGraphics } from "../sprites/cache";
import { SpritesetGlobal, SpritesetMap, mapViewports } from "../sprites/spritesets";

const factory = () => G.mapFactory as unknown as PokemonMapFactory;
const gameMap = () => G.gameMap as unknown as GameMap;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;

function tilemapSource(map: GameMap): TilemapSource {
  return {
    mapId: map.mapId,
    width: map.width,
    height: map.height,
    tileset: map.tileset,
    displayX: Math.round(map.displayX / 4),
    displayY: Math.round(map.displayY / 4),
    tile: (x, y, l) => map.tile(x, y, l),
  };
}

/** Loads everything a map (and the maps around it) needs before it's shown. */
export async function prepareMap(id: number, renderer?: TilemapRenderer): Promise<void> {
  await preloadMaps(id, 2);
  const ids = [id, ...connectionsFor(id).flatMap((c) => [c.mapA, c.mapB])];
  await Promise.all(ids.map(async (m) => {
    const data = getMapData(m);
    const tileset = Data.tilesets.get(data.tilesetId);
    await Promise.all([preloadMapGraphics(data), tileset && renderer ? renderer.prepare(tileset) : null]);
  }));
}

/** Scenes Scene_Map opens; filled in by the menu ports (PokemonPauseMenu, pbUseKeyItem). */
export const SceneMapHooks = {
  pauseMenu: async (): Promise<void> => {},
  useKeyItem: async (): Promise<void> => {},
  /** Marin's Enhanced Staircases' transfer_player alias (game/field/EnhancedStaircases.ts). */
  afterTransferPlayer: (): void => {},
};

export class SceneMap {
  renderer: TilemapRenderer | null = null;
  spritesetGlobal: SpritesetGlobal | null = null;
  private spritesets = new Map<number, SpritesetMap>();

  spriteset(mapId = -1): SpritesetMap | undefined {
    if (mapId > 0 && this.spritesets.has(mapId)) return this.spritesets.get(mapId);
    for (const s of this.spritesets.values()) if (s.map === gameMap()) return s;
    return this.spritesets.values().next().value;
  }

  async createSpritesets(): Promise<void> {
    this.renderer ??= new TilemapRenderer(mapViewports().v1.node);
    for (const map of factory().maps) await this.renderer.prepare(map.tileset);
    this.spritesetGlobal ??= new SpritesetGlobal(gamePlayer());
    this.spritesets = new Map();
    for (const map of factory().maps) this.spritesets.set(map.mapId, new SpritesetMap(map, this.renderer));
    factory().setSceneStarted(this);
    await this.updateSpritesets(true);
  }

  disposeSpritesets(): void {
    for (const s of this.spritesets.values()) s.dispose();
    this.spritesets = new Map();
  }

  dispose(): void {
    this.disposeSpritesets();
    this.spritesetGlobal?.dispose();
    this.spritesetGlobal = null;
  }

  autofade(mapid: number): void {
    const playingBGM = G.gameSystem.playingBgm;
    const playingBGS = G.gameSystem.playingBgs;
    if (!playingBGM && !playingBGS) return;
    const map = getMapData(mapid);
    if (playingBGM && map.autoplayBgm && playingBGM.name !== map.bgm.name) pbBGMFade(0.8);
    if (playingBGS && map.autoplayBgs && playingBGS.name !== map.bgs.name) pbBGMFade(0.8);
  }

  async transferPlayer(cancelSwimming = true): Promise<void> {
    const t = G.gameTemp;
    t.playerTransferring = false;
    await prepareMap(t.playerNewMapId, this.renderer ?? undefined);
    pbCancelVehicles(t.playerNewMapId, cancelSwimming);
    G.pokemonGlobal.bridge = 0; // pbBridgeOff
    this.autofade(t.playerNewMapId);
    if (gameMap().mapId !== t.playerNewMapId) factory().setup(t.playerNewMapId);
    const p = gamePlayer();
    p.moveto(t.playerNewX, t.playerNewY);
    switch (t.playerNewDirection) {
      case 2: p.turnDown(); break;
      case 4: p.turnLeft(); break;
      case 6: p.turnRight(); break;
      case 8: p.turnUp(); break;
    }
    p.straighten();
    G.gameTemp.followers?.mapTransferFollowers();
    await gameMap().update();
    this.disposeSpritesets();
    await this.createSpritesets();
    if (t.transitionProcessing) {
      t.transitionProcessing = false;
      await Graphics.transition();
    }
    gameMap().autoplay();
    Input.update();
    SceneMapHooks.afterTransferPlayer();
  }

  async miniupdate(): Promise<void> {
    G.gameTemp.inMiniUpdate = true;
    for (;;) {
      await gamePlayer().update();
      await this.updateMaps();
      G.gameSystem.update();
      G.gameScreen.update(G.gameTemp.inBattle);
      if (!G.gameTemp.playerTransferring) break;
      await this.transferPlayer(false);
      if (G.gameTemp.transitionProcessing) break;
    }
    await this.updateSpritesets();
    G.gameTemp.inMiniUpdate = false;
  }

  async updateMaps(): Promise<void> {
    for (const map of [...factory().maps]) await map.update();
    factory().updateMaps(this);
  }

  async updateSpritesets(refresh = false): Promise<void> {
    void refresh;
    const f = factory();
    for (const map of f.maps) {
      if (!this.spritesets.has(map.mapId)) {
        await this.renderer!.prepare(map.tileset);
        this.spritesets.set(map.mapId, new SpritesetMap(map, this.renderer!));
      }
    }
    for (const [id, s] of [...this.spritesets]) {
      if (f.hasMap(id)) s.update();
      else {
        s.dispose();
        this.spritesets.delete(id);
      }
    }
    this.spritesetGlobal!.update();
    // pbDayNightTint(@map_renderer) and each Sprite_Character, applied to their viewport.
    // TODO(regulartone): events named "regulartone" should stay untinted.
    pbDayNightTint({ tone: mapViewports().v1.preTone });
    this.renderer!.update(Graphics.deltaS);
    const maps = [gameMap(), ...f.maps.filter((m) => m !== gameMap())];
    this.renderer!.draw(maps.map(tilemapSource), G.pokemonGlobal.bridge);
    await EventHandlers.trigger("on_frame_update"); // handlers may show messages (Bug Contest, phone calls)
  }

  async update(): Promise<void> {
    const t = G.gameTemp;
    for (;;) {
      await pbMapInterpreter().update();
      await gamePlayer().update();
      await this.updateMaps();
      G.gameSystem.update();
      G.gameScreen.update(t.inBattle);
      if (!t.playerTransferring) break;
      await this.transferPlayer(false);
      if (t.transitionProcessing) break;
    }
    await this.updateSpritesets();
    if (t.titleScreenCalling) {
      SaveData.markValuesAsUnloaded();
      G.scene = null; // $scene = pbCallTitle (main.ts runs the title loop)
      return;
    }
    if (t.transitionProcessing) {
      t.transitionProcessing = false;
      if (t.transitionName === "") await Graphics.transition();
      else await Graphics.transition(40 / 20, "Graphics/Transitions/" + t.transitionName);
    }
    if (t.messageWindowShowing) return;
    if (!pbMapInterpreter().running()) {
      if (Input.trigger(Input.USE)) t.interactCalling = true;
      else if (Input.trigger(Input.ACTION)) {
        if (!G.gameSystem.menuDisabled && !gamePlayer().moving()) {
          t.menuCalling = true;
          t.menuBeep = true;
        }
      } else if (Input.trigger(Input.SPECIAL)) {
        if (!gamePlayer().moving()) t.readyMenuCalling = true;
      }
    }
    if (!gamePlayer().moving()) {
      if (t.menuCalling) {
        await this.callMenu();
      } else if (t.readyMenuCalling) {
        t.readyMenuCalling = false;
        gamePlayer().straighten();
        await SceneMapHooks.useKeyItem();
      } else if (t.interactCalling) {
        t.interactCalling = false;
        gamePlayer().straighten();
        await EventHandlers.trigger("on_player_interact");
      }
    }
  }

  async callMenu(): Promise<void> {
    const t = G.gameTemp;
    t.menuCalling = false;
    t.inMenu = true;
    gamePlayer().straighten();
    await gameMap().update();
    await SceneMapHooks.pauseMenu();
    t.inMenu = false;
  }

  async main(): Promise<void> {
    await this.createSpritesets();
    await Graphics.transition();
    for (;;) {
      await Graphics.update();
      Input.update();
      await this.update();
      if (G.scene !== (this as unknown)) break;
    }
    Graphics.freeze();
    this.dispose();
    if (G.gameTemp.titleScreenCalling) {
      if (pbMapInterpreter().running()) pbMapInterpreter().commandEnd();
      G.gameTemp.titleScreenCalling = false;
      await Graphics.transition();
      Graphics.freeze();
    }
  }
}
