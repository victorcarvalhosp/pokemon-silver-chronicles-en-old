// Port of Plugins/ZUD Mechanics/[010] Adventures/MaxLair_Controls.rb: moving
// on the Max Lair map (LairMapScene's tile checks and triggers, warps,
// switches, the player icon's movement, camera scrolling, the map view and
// route selection). Ruby reopens LairMapScene; these are installed on its
// prototype.
//
// Movement steps 2 px per 40 fps frame (FrameWaiter), as in Ruby; holding
// ACTION moves instantly.

import { _INTL } from "../../data/gameData/gameData";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbFadeOutIn } from "../../ui/fades";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { pbPlayCancelSE, pbPlayDecisionSE, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Player } from "../trainer/Player";
import { sample } from "../maxRaid/random";
import { lairEndlessRecord, pbDynamaxAdventure } from "./Adventure_Main";
import type {} from "./Adventure_Triggers";
import { pbMaxLairMenu } from "./LairMenu_Menus";
import { LairMapScene } from "./MaxLair_Map";

const player = () => G.player as unknown as Player;
type Coords = [number, number];
type TileValue = number | number[] | null;

const methods = {
  //-----------------------------------------------------------------------------
  // Returns whether there is a cardinal directional tile at the given coordinates.
  // Uses the player's coordinates if none are given.
  // Direction may be set to check for a specific cardinal direction.
  //-----------------------------------------------------------------------------
  lairCanTurn(this: LairMapScene, direction: string | null = null, coords: Coords | null = null): boolean {
    if (!["North", "South", "West", "East"].includes(direction!)) direction = "Turn";
    return typeof this.lairTileType(direction!, coords) === "number";
  },

  //-----------------------------------------------------------------------------
  // Returns whether there is a Selection tile at the given coordinates.
  // Uses the player's coordinates if none are given.
  // Direction may be set to check if the chosen Selection tile allows for
  // movement in that cardinal direction.
  //-----------------------------------------------------------------------------
  lairCanMove(this: LairMapScene, direction: string | null = null, coords: Coords | null = null): boolean {
    const ret = this.lairTileType("Select", coords);
    if (!direction) return Array.isArray(ret);
    // NOTE (Ruby parity): ret.include? raises NoMethodError when there's no
    // Selection tile here (MaxLair_Controls.rb:25-28); it's false here.
    const list = Array.isArray(ret) ? ret : [];
    switch (direction) {
      case "North": return list.includes(0);
      case "South": return list.includes(1);
      case "West": return list.includes(2);
      case "East": return list.includes(3);
    }
    return false;
  },

  //-----------------------------------------------------------------------------
  // Returns whether there is a specified type of tile at the given coordinates.
  // Uses the player's coordinates if none are given.
  // Tile must be set to a string that appears in a specific tile's sprite key.
  // For example, set tile to "Warp" to check if the tile is a Warp tile.
  //-----------------------------------------------------------------------------
  lairOnTile(this: LairMapScene, tile = "", coords: Coords | null = null): boolean {
    if (!coords) coords = [this.player.x, this.player.y];
    for (const key of Object.keys(this.sprites)) {
      if (!key.includes(tile)) continue;
      const s = this.sprites[key];
      if (!s.visible) continue;
      if (coords[0] === s.x && coords[1] === s.y) return true;
    }
    return false;
  },

  //-----------------------------------------------------------------------------
  // Returns values related to the specified tile type at the given coordinates.
  // Uses the player's coordinates if none are given.
  // Tile must be set to a string that appears in a specific tile's sprite key.
  // For example, set tile to "NPC" to get the value of the specific type of
  // NPC event used for this tile, if any.
  //-----------------------------------------------------------------------------
  lairTileType(this: LairMapScene, tile = "", coords: Coords | null = null): TileValue {
    if (!this.lairOnTile(tile, coords)) return null;
    if (!coords) coords = [this.player.x, this.player.y];
    for (const key of Object.keys(this.sprites)) {
      if (!key.includes(tile)) continue;
      const s = this.sprites[key];
      if (!s.visible) continue;
      if (coords[0] !== s.x || coords[1] !== s.y) continue;
      switch (key.split("_")[0]) {
        //-------------------------------------------------------------------------
        // Directional values.
        //-------------------------------------------------------------------------
        case "TurnNorth": return 0;
        case "TurnSouth": return 1;
        case "TurnWest": return 2;
        case "TurnEast": return 3;
        case "TurnRandom": return 4;
        case "TurnFlip": return 5;
        //-------------------------------------------------------------------------
        // Event values.
        //-------------------------------------------------------------------------
        case "NPCSwap": return 0;
        case "NPCEquip": return 1;
        case "NPCTrain": return 2;
        case "NPCTutor": return 3;
        case "NPCWard": return 4;
        case "NPCHeal": return 5;
        case "NPCRandom": return 6;
        //-------------------------------------------------------------------------
        // Selection values.
        //-------------------------------------------------------------------------
        case "SelectNS": return [0, 1];
        case "SelectNW": return [0, 2];
        case "SelectNE": return [0, 3];
        case "SelectSW": return [1, 2];
        case "SelectSE": return [1, 3];
        case "SelectWE": return [2, 3];
        case "SelectNSW": return [0, 1, 2];
        case "SelectNSE": return [0, 1, 3];
        case "SelectNWE": return [0, 2, 3];
        case "SelectSWE": return [1, 2, 3];
        case "SelectNSWE": return [0, 1, 2, 3];
        //-------------------------------------------------------------------------
        // All other values are derived from the tile's index, or whatever value
        // appears last in the sprite's key.
        //-------------------------------------------------------------------------
        default: return rubyToI(key.split("_").pop()!);
      }
    }
    return null;
  },

  //-----------------------------------------------------------------------------
  // Triggers the event related to the specific tile the player is on.
  // Index refers to the player's current directional movement, from 0-3.
  // If a triggered tile would alter the player's movement, then this returns the
  // new index associated with the new direction the player should move in.
  //-----------------------------------------------------------------------------
  async lairTriggerTile(this: LairMapScene, index: number): Promise<number> {
    let clear: boolean | null | undefined = false;
    let reset = false;
    const adventure = pbDynamaxAdventure();
    //---------------------------------------------------------------------------
    // The order in which tiles are triggered. Specifically done so in case there
    // are multiple events stacked on a single tile for whatever reason.
    //---------------------------------------------------------------------------
    const tiles = ["Trap", "Block", "Door", "Pokemon", "NPC", "Chest", "Berry", "Key",
      "Flare", "Switch", "Warp", "Reset", "Turn", "Select", "Start"];
    for (const type of tiles) {
      if (!this.lairOnTile(type)) continue;
      const value = this.lairTileType(type) as number;
      switch (type) {
        //-------------------------------------------------------------------------
        // Tile effects.
        //-------------------------------------------------------------------------
        case "Trap":
          clear = await adventure.lairTileTrap(value);
          break;
        //-------------------------------------------------------------------------
        case "Block":
          clear = await adventure.lairTileBlock(value);
          if (!clear) index = this.lairRedirectMovement(index);
          break;
        //-------------------------------------------------------------------------
        case "Door":
          clear = await adventure.lairTileDoor();
          if (!clear) index = this.lairRedirectMovement(index);
          this.lairUpdateKeys();
          break;
        //-------------------------------------------------------------------------
        case "Pokemon":
          await this.lairStartBattle(value);
          break;
        //-------------------------------------------------------------------------
        case "NPC":
          switch (value) {
            case 0: // Scientist
              clear = await adventure.lairNpcSwap();
              break;
            case 1: // Backpacker
              await adventure.lairNpcEquip();
              break;
            case 2: // Blackbelt
              await adventure.lairNpcTrain();
              break;
            case 3: // Ace Trainer
              await adventure.lairNpcTutor();
              break;
            case 4: // Channeler
              await adventure.lairNpcWardIntro();
              this.knockouts = adventure.knockouts;
              if (this.maxHearts < 6) this.maxHearts += 1;
              this.lairUpdateHP();
              clear = await adventure.lairNpcWardOutro();
              break;
            case 5: // Nurse
              clear = await adventure.lairNpcHeal();
              break;
            case 6: // Random
              clear = await adventure.lairNpcRandom();
              break;
          }
          break;
        //-------------------------------------------------------------------------
        case "Chest":
          clear = await adventure.lairTileChest(value);
          // NOTE (Ruby parity): a trapped chest sends the player back to the
          // start even when it stays locked (no Lair Key) (MaxLair_Controls.rb:166).
          reset = value % 10 === 0;
          break;
        //-------------------------------------------------------------------------
        case "Berry":
          clear = await adventure.lairTileBerry();
          break;
        //-------------------------------------------------------------------------
        case "Key":
          clear = await adventure.lairTileKey();
          this.lairUpdateKeys();
          break;
        //-------------------------------------------------------------------------
        case "Flare":
          clear = await adventure.lairTileFlare();
          await this.lairUpdateDarknessRadius();
          break;
        //-------------------------------------------------------------------------
        case "Switch":
          await this.lairSwitchToggle();
          break;
        //-------------------------------------------------------------------------
        case "Warp":
          await this.lairWarpPlayer(value);
          break;
        //-------------------------------------------------------------------------
        case "Reset":
          reset = true;
          break;
        //-------------------------------------------------------------------------
        case "Turn":
          switch (value) {
            case 4: index = this.lairRedirectMovement(index, true); break;
            case 5: index = this.lairRedirectMovement(index); break;
            default: index = value; break;
          }
          break;
        //-------------------------------------------------------------------------
        case "Start": case "Select":
          index = -1;
          break;
        //-------------------------------------------------------------------------
      }
      break;
    }
    if (clear) this.lairClearTile();
    if (reset) index = await this.lairRestartPosition(true);
    return index;
  },

  //-----------------------------------------------------------------------------
  // Used for reversing the player's movement path, where index refers to the
  // player's current directional movement, from 0-3.
  // Returns a random new direction instead if random = true. Cannot randomize
  // the player back in the opposite direction they were just moving in.
  //-----------------------------------------------------------------------------
  lairRedirectMovement(this: LairMapScene, index: number, random = false): number {
    let newIndex = -1;
    switch (index) {
      case 0: newIndex = 1; break;
      case 1: newIndex = 0; break;
      case 2: newIndex = 3; break;
      case 3: newIndex = 2; break;
    }
    if (random) {
      const directions = [0, 1, 2, 3].filter((d) => d !== newIndex);
      return sample(directions)!;
    }
    return newIndex;
  },

  //-----------------------------------------------------------------------------
  // Warps the player to the next available Warp tile.
  // Warp tiles are linked in sequential order, in the order they are listed in
  // the adventure_maps.txt PBS file. The final warp tile listed links back to
  // the first. If the next available Warp tile is not visible for some reason,
  // skips to the next available Warp tile in the list.
  //-----------------------------------------------------------------------------
  async lairWarpPlayer(this: LairMapScene, value: number): Promise<void> {
    let firstWarp = null, nextWarp = null;
    for (const key of Object.keys(this.sprites)) {
      if (!key.includes("Warp")) continue;
      if (!this.sprites[key].visible) continue;
      if (!firstWarp) firstWarp = this.sprites[key];
      const num = rubyToI(key.split("_").pop()!);
      if (num > value) nextWarp = this.sprites[key];
      if (nextWarp) break;
    }
    if (!nextWarp) nextWarp = firstWarp;
    await this.pbWait(20);
    pbSEPlay("Player jump");
    this.player.visible = false;
    this.player.x = nextWarp.x;
    this.player.y = nextWarp.y;
    await this.lairAutoMapPosition(this.player, 8);
    pbSEPlay("Player jump");
    this.player.visible = true;
    await this.pbWait(20);
  },

  //-----------------------------------------------------------------------------
  // Transports the player back to the start tile of the lair.
  //-----------------------------------------------------------------------------
  async lairRestartPosition(this: LairMapScene, msg = false): Promise<number> {
    await pbFadeOutIn(async () => {
      this.player.x = this.startTile.x;
      this.player.y = this.startTile.y;
      await this.lairAutoMapPosition(this.player, 2, true);
      pbSEPlay("Anim/Teleport");
    });
    if (msg) await pbMessage(_INTL("You were suddenly transported back to the entrance of the lair!"));
    return -1;
  },

  //-----------------------------------------------------------------------------
  // Toggles the visibility of all Hidden tiles on the map, as well as toggling
  // all Switch tiles between the ON and OFF positions.
  //-----------------------------------------------------------------------------
  async lairSwitchToggle(this: LairMapScene): Promise<void> {
    await this.pbWait(10);
    pbSEPlay("Voltorb flip tile");
    for (const key of Object.keys(this.sprites)) {
      if (key.includes("Hidden")) {
        this.sprites[key].visible = !this.sprites[key].visible;
      } else if (key.includes("Switch")) {
        const icon = this.sprites[key].srcRect.x;
        const pos = icon === 128 ? 160 : 128;
        this.sprites[key].srcRect.set(pos, 32, 32, 32);
      }
    }
  },

  //-----------------------------------------------------------------------------
  // Switches off the visibility of whatever tile the player is currently on,
  // preventing that tile's effects from being triggerable again.
  //-----------------------------------------------------------------------------
  lairClearTile(this: LairMapScene): void {
    const coords = [this.player.x, this.player.y];
    for (const sprite of this.mapSprites) {
      if ([this.player, this.startTile, this.sprites.background].includes(sprite)) continue;
      if (coords[0] === sprite.x && coords[1] === sprite.y) sprite.visible = false;
    }
  },

  //-----------------------------------------------------------------------------
  // Toggles the opacity for Pokemon shadow sprites. Used during movement for
  // better map visibility.
  //-----------------------------------------------------------------------------
  lairChangePokeOpacity(this: LairMapScene, fade = true): void {
    for (const key of Object.keys(this.sprites)) {
      if (!this.mapSprites.includes(this.sprites[key])) continue;
      if (!key.includes("Shadow")) continue;
      this.sprites[key].opacity = fade ? 100 : 255;
    }
  },

  //-----------------------------------------------------------------------------
  // Moves the player's icon around the map. Index refers to the player's current
  // directional movement, from 0-3. Speed refers to how many pixels the player's
  // icon will move per frame.
  // Movement is instantaneous if the ACTION button is held.
  //-----------------------------------------------------------------------------
  async lairMovePlayerIcon(this: LairMapScene, index = 0, speed = 2): Promise<void> {
    this.lairChangePokeOpacity();
    for (;;) {
      const boundsReached = this.player.x < 32 ||
                            this.player.y < 32 ||
                            this.player.x > Graphics.width - 32 ||
                            this.player.y > Graphics.height - 32;
      const instant = Input.press(Input.ACTION);
      if (!instant) await this.pbWait(1);
      switch (index) {
        case 0: this.player.y -= speed; break;
        case 1: this.player.y += speed; break;
        case 2: this.player.x -= speed; break;
        case 3: this.player.x += speed; break;
        default: return;
      }
      index = await this.lairTriggerTile(index);
      this.lairUpdateDarkness();
      if (boundsReached) await this.lairAutoMapPosition(this.player, speed);
      if (pbDynamaxAdventure().ended()) break;
    }
  },

  //-----------------------------------------------------------------------------
  // Automatically scrolls the map to the correct position when needed.
  // Sprite refers to the specific sprite the camera should center on when
  // positioning itself, usually the player's icon.
  // Speed refers to how many pixels the map should scroll per frame to reach its
  // destination.
  // Scrolling is instantaneous when instant = true.
  //-----------------------------------------------------------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async lairAutoMapPosition(this: LairMapScene, sprite: any, speed: number, instant = false): Promise<void> {
    let xBoundsReached = false;
    let yBoundsReached = false;
    const center = [Math.floor(Graphics.width / 2) - 16, Math.floor(Graphics.height / 2) - 16];
    const bg = this.sprites.background;
    for (;;) {
      const coords = [sprite.x, sprite.y];
      if (coords[0] === center[0]) xBoundsReached = true;
      if (coords[1] === center[1]) yBoundsReached = true;
      this.lairUpdateDarkness();
      //-------------------------------------------------------------------------
      // X-axis movement.
      //-------------------------------------------------------------------------
      if (!xBoundsReached) {
        // Target sprite is left of center.
        if (coords[0] < center[0]!) {
          if (bg.x + 2 * speed >= this.leftBounds + 2) {
            xBoundsReached = true;
          } else if ((center[0]! - coords[0]) % (2 * speed) === 0) {
            if (!instant) await this.pbWait(1);
            for (const sp of this.mapSprites) sp.x += 2 * speed;
          } else {
            for (const sp of this.mapSprites) sp.x += 1;
          }
        }
        // Target sprite is right of center.
        if (coords[0] > center[0]!) {
          if (bg.x - 2 * speed <= this.rightBounds + 2) {
            xBoundsReached = true;
          } else if ((coords[0] - center[0]!) % (2 * speed) === 0) {
            if (!instant) await this.pbWait(1);
            for (const sp of this.mapSprites) sp.x -= 2 * speed;
          } else {
            for (const sp of this.mapSprites) sp.x -= 1;
          }
        }
      //-------------------------------------------------------------------------
      // Y-axis movement.
      //-------------------------------------------------------------------------
      } else if (!yBoundsReached) {
        // Target sprite is above center.
        if (coords[1] < center[1]!) {
          if (bg.y + 2 * speed >= this.upperBounds + 2) {
            yBoundsReached = true;
          } else if ((center[1]! - coords[1]) % (2 * speed) === 0) {
            if (!instant) await this.pbWait(1);
            for (const sp of this.mapSprites) sp.y += 2 * speed;
          } else {
            for (const sp of this.mapSprites) sp.y += 1;
          }
        }
        // Target sprite is below center.
        if (coords[1] > center[1]!) {
          if (bg.y - 2 * speed <= this.lowerBounds + 2) {
            yBoundsReached = true;
          } else if ((coords[1] - center[1]!) % (2 * speed) === 0) {
            if (!instant) await this.pbWait(1);
            for (const sp of this.mapSprites) sp.y -= 2 * speed;
          } else {
            for (const sp of this.mapSprites) sp.y -= 1;
          }
        }
      }
      if (xBoundsReached && yBoundsReached) break;
    }
  },

  //-----------------------------------------------------------------------------
  // Allows for player-controlled map scrolling while viewing the Max Lair map.
  //-----------------------------------------------------------------------------
  async lairMapScroll(this: LairMapScene): Promise<void> {
    const move = 8;
    this.lairHideUISprites();
    this.cursor.x = this.player.x - 16;
    this.cursor.y = this.player.y - 16;
    this.cursor.visible = true;
    this.sprites.return_ui.visible = true;
    for (const key of Object.keys(this.sprites)) {
      if (!key.includes("Pokemon")) continue;
      this.sprites[key].visible = true;
    }
    const bg = this.sprites.background;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      for (let i = 0; i < 4; i++) this.sprites[`map_arrow_ui_${i}`].visible = true;
      //-------------------------------------------------------------------------
      // Scroll map and cursor upwards.
      //-------------------------------------------------------------------------
      if (Input.press(Input.UP)) {
        if (this.cursor.y > 0) this.cursor.y -= move;
        if (bg.y <= this.upperBounds - move) {
          for (const sp of this.mapSprites) sp.y += move;
          this.lairUpdateDarkness();
        } else {
          this.sprites.map_arrow_ui_0.visible = false;
        }
      }
      //-------------------------------------------------------------------------
      // Scroll map and cursor downwards.
      //-------------------------------------------------------------------------
      if (Input.press(Input.DOWN)) {
        if (this.cursor.y <= Graphics.height - 72) this.cursor.y += move;
        if (bg.y >= this.lowerBounds + move) {
          for (const sp of this.mapSprites) sp.y -= move;
          this.lairUpdateDarkness();
        } else {
          this.sprites.map_arrow_ui_1.visible = false;
        }
      }
      //-------------------------------------------------------------------------
      // Scroll map and cursor to the left.
      //-------------------------------------------------------------------------
      if (Input.press(Input.LEFT)) {
        if (this.cursor.x > 0) this.cursor.x -= move;
        if (bg.x <= this.leftBounds - move) {
          for (const sp of this.mapSprites) sp.x += move;
          this.lairUpdateDarkness();
        } else {
          this.sprites.map_arrow_ui_2.visible = false;
        }
      }
      //-------------------------------------------------------------------------
      // Scroll map and cursor to the right.
      //-------------------------------------------------------------------------
      if (Input.press(Input.RIGHT)) {
        if (this.cursor.x <= Graphics.width - 72) this.cursor.x += move;
        if (bg.x >= this.rightBounds + move) {
          for (const sp of this.mapSprites) sp.x -= move;
          this.lairUpdateDarkness();
        } else {
          this.sprites.map_arrow_ui_3.visible = false;
        }
      }
      //-------------------------------------------------------------------------
      // Toggle Pokemon and type icon sprite visibility.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.ACTION)) {
        pbSEPlay("GUI party switch");
        for (const key of Object.keys(this.sprites)) {
          if (key.includes("Shadow") || key.includes("Type")) {
            this.sprites[key].visible = !this.sprites[key].visible;
          }
        }
      }
      //-------------------------------------------------------------------------
      // Gets tile information.
      //-------------------------------------------------------------------------
      if (Array.isArray(this.lairCursorReact()) && !this.darknessMap) {
        this.cursor.srcRect.set(64, 0, 64, 64);
        if (Input.trigger(Input.USE)) {
          this.cursor.x = this.lairCursorReact()![0] - 16;
          this.cursor.y = this.lairCursorReact()![1] - 16;
          this.cursor.srcRect.set(64, 0, 64, 64);
          const newcoords: Coords = [this.cursor.x + 16, this.cursor.y + 16];
          await this.lairGetTileInfo(newcoords);
        }
      }
      //-------------------------------------------------------------------------
      // Cycles through raid species from first to last.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.JUMPUP)) {
        const coords: Coords = [this.cursor.x + 16, this.cursor.y + 16];
        let index = (this.lairTileType("Pokemon", coords) as number | null) ?? 0;
        let sprite;
        if (index === this.lairPokemon.length - 1) {
          sprite = this.sprites.Pokemon_0;
        } else {
          index += 1;
          sprite = this.sprites[`Pokemon_${index}`];
        }
        pbSEPlay("GUI party switch");
        await this.lairAutoMapPosition(sprite, move, true);
        this.cursor.x = sprite.x - 16;
        this.cursor.y = sprite.y - 16;
      //-------------------------------------------------------------------------
      // Cycles through raid species from last to first.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.JUMPDOWN)) {
        const coords: Coords = [this.cursor.x + 16, this.cursor.y + 16];
        let index = (this.lairTileType("Pokemon", coords) as number | null) ?? 0;
        let sprite;
        if (index === 0) {
          index = this.lairPokemon.length - 1;
          sprite = this.sprites[`Pokemon_${index}`];
        } else {
          index -= 1;
          sprite = this.sprites[`Pokemon_${index}`];
        }
        pbSEPlay("GUI party switch");
        await this.lairAutoMapPosition(sprite, move, true);
        this.cursor.x = sprite.x - 16;
        this.cursor.y = sprite.y - 16;
      }
      //-------------------------------------------------------------------------
      // Returns to route selection.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.BACK)) {
        pbPlayCancelSE();
        this.lairHideUISprites();
        for (let i = 0; i < this.lairPokemon.length; i++) {
          if (this.sprites[`Shadow_${i}`].color.alpha === 255) {
            this.sprites[`Shadow_${i}`].visible = true;
            this.sprites[`Type_${i}`].visible = true;
          } else {
            this.sprites[`Shadow_${i}`].visible = false;
            this.sprites[`Type_${i}`].visible = false;
          }
        }
        await this.lairAutoMapPosition(this.player, move);
        this.sprites.select_ui.visible = true;
        this.sprites.options_ui.visible = true;
        break;
      }
    }
  },

  //-----------------------------------------------------------------------------
  // Changes the map view cursor while hovering over a selectable tile.
  //-----------------------------------------------------------------------------
  lairCursorReact(this: LairMapScene): Coords | null {
    let select: Coords | null = null;
    this.cursor.srcRect.set(0, 0, 64, 64);
    for (const key of Object.keys(this.sprites)) {
      const s = this.sprites[key];
      if (!this.mapSprites.includes(s)) continue;
      if (key.includes("background") || key.includes("Shadow") || key.includes("Type")) continue;
      if (!s.visible || key.includes("Trap")) continue;
      const withinXRange = this.cursor.x + 16 >= s.x - 20 && this.cursor.x + 16 <= s.x + 20;
      const withinYRange = this.cursor.y + 16 >= s.y - 20 && this.cursor.y + 16 <= s.y + 20;
      if (withinXRange && withinYRange) select = [s.x, s.y];
    }
    return select;
  },

  //-----------------------------------------------------------------------------
  // Allows the player to select a route to take while on a Selection tile.
  //-----------------------------------------------------------------------------
  async lairChooseRoute(this: LairMapScene): Promise<void> {
    let endgame = false;
    for (;;) {
      if (pbDynamaxAdventure().ended()) break;
      await this.lairAutoMapPosition(this.player, 2);
      this.lairChangePokeOpacity(false);
      this.sprites.speedup_ui.visible = false;
      await pbMessage(_INTL("Which path would you like to take?"));
      let index: number | null = null;
      if (this.lairCanMove("East")) index = 3;
      if (this.lairCanMove("West")) index = 2;
      if (this.lairCanMove("South")) index = 1;
      if (this.lairCanMove("North")) index = 0;
      this.sprites[`arrow_ui_${index}`].color = new Color(255, 0, 0, 200);
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        this.sprites.arrow_ui_0.y = this.player.y - 16;
        this.sprites.arrow_ui_1.y = this.player.y + 32;
        this.sprites.arrow_ui_0.x = this.sprites.arrow_ui_1.x = this.player.x + 8;
        this.sprites.arrow_ui_2.x = this.player.x - 16;
        this.sprites.arrow_ui_3.x = this.player.x + 32;
        this.sprites.arrow_ui_2.y = this.sprites.arrow_ui_3.y = this.player.y + 10;
        const indexes = (this.lairTileType("Select") as number[] | null) ?? [];
        for (const i of indexes) this.sprites[`arrow_ui_${i}`].visible = true;
        this.sprites.select_ui.visible = true;
        this.sprites.options_ui.visible = true;
        //-----------------------------------------------------------------------
        // Selects between available routes to take.
        //-----------------------------------------------------------------------
        if (Input.trigger(Input.UP) && this.lairCanMove("North")) {
          pbPlayDecisionSE();
          index = 0;
        } else if (Input.trigger(Input.DOWN) && this.lairCanMove("South")) {
          pbPlayDecisionSE();
          index = 1;
        } else if (Input.trigger(Input.LEFT) && this.lairCanMove("West")) {
          pbPlayDecisionSE();
          index = 2;
        } else if (Input.trigger(Input.RIGHT) && this.lairCanMove("East")) {
          pbPlayDecisionSE();
          index = 3;
        }
        for (let i = 0; i < 4; i++) {
          this.sprites[`arrow_ui_${i}`].color = i === index ? new Color(255, 0, 0, 200) : new Color(0, 0, 0, 0);
        }
        //-----------------------------------------------------------------------
        // Confirms a selected route.
        //-----------------------------------------------------------------------
        if (Input.trigger(Input.USE)) {
          if (await pbConfirmMessage(_INTL("Are you sure you want to take this path?"))) {
            this.lairHideUISprites();
            this.sprites.speedup_ui.visible = true;
            await this.lairMovePlayerIcon(index!);
            break;
          }
        //-----------------------------------------------------------------------
        // Options menu.
        //-----------------------------------------------------------------------
        } else if (Input.trigger(Input.ACTION)) {
          let cmd = 0;
          const commands = [_INTL("View Map"), _INTL("View Party")];
          if (this.endlessMode && lairEndlessRecord().floor > 1) commands.push(_INTL("View Record"));
          commands.push(_INTL("Leave Lair"));
          for (;;) {
            cmd = await pbMessage(_INTL("What would you like to do?"), commands, -1, null, 0);
            if (cmd === -1) break;
            if (cmd === 0) { await this.lairMapScroll(); break; }
            if (cmd === 1) { await this.pbSummary(player().party, 0, this.sprites); break; }
            if (cmd === commands.length - 1) {
              if (await pbConfirmMessage(_INTL("End your Dynamax Adventure?\nAny captured Pokémon and acquired treasure will be lost."))) {
                endgame = true;
                break;
              }
            } else {
              await pbMaxLairMenu("record");
            }
          }
          if (endgame) break;
        }
      }
      if (endgame) break;
    }
    //---------------------------------------------------------------------------
    // Resets the entire lair from the start if playing in Endless Mode.
    //---------------------------------------------------------------------------
    if (this.endlessMode && pbDynamaxAdventure().victory()) {
      await pbMessage(_INTL("The storm seems to have died down a bit..."));
      pbDynamaxAdventure().bossSpecies = null;
      pbDynamaxAdventure().bossBattled = false;
      pbDynamaxAdventure().lairFloor += 1;
      if (this.darknessMap) pbDynamaxAdventure().darknessLvl = this.darknessBmp!.radiusCur();
    } else {
      await pbMessage(_INTL("Your Dynamax Adventure is over!"));
      pbDynamaxAdventure().abandoned = endgame;
    }
  },
};

/** String#to_i (leading digits; 0 if none). */
function rubyToI(s: string): number {
  const m = /^\s*[-+]?\d+/.exec(s);
  return m ? parseInt(m[0], 10) : 0;
}

Object.assign(LairMapScene.prototype, methods);
type Methods = typeof methods;
declare module "./MaxLair_Map" {
  interface LairMapScene extends Methods {}
}
