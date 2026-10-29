// Port of Plugins/TC Wardrobe (001_main.rb, 002_config.rb): Temporal Chains'
// Wardrobe by DarrylBD99.
//
// The plugin adds Player#outfit_unlocked (initialised to the base outfit in
// Player#initialize). The Player class lives elsewhere, so the field is read
// and written by plain property access here and created on first use when a
// Player doesn't have it yet (see outfitUnlocked()).

import { G } from "../../game/globals";
import { pbPlayBuzzerSE, pbPlayCursorSE } from "../../game/GameSystem";
import { playerMetadata } from "../../game/metadata";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbCopyBitmap, pbDrawImagePositions, pbDrawTextPositions } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbDoEnsureBitmap, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbMessage } from "../messages";
import { preloadBitmaps } from "../rpgCache";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_DrawableCommand } from "../windows/SpriteWindowText";
import { type Sprites, asHash } from "./frames";
import { addBackgroundPlane } from "../planes";

//==============================================================================#
//                                   SETTINGS                                   #
//==============================================================================#
export const WardrobeConfig = {
  // Determine the type of wardrobe you want:
  // 0 - A scroll selection like Yes or No choices
  // 1 - Wardrobe with custom GUI
  TYPE: 1,

  // Outfit Names in order of number index (must keep/consist of base outfit)
  OUTFITS: [
    "Basic Clothes",
    "Winter Clothes",
    "Rocket Uniform",
    "Kanto Clothes",
  ],

  // Change background style (only works if TYPE is 1):
  // 0 - Basic Background
  // 1 - Basic Background (Pokeball Silhouette)
  // 2 - Basic Background (Pikachu Silhouette)
  // 3 - Elite Trainer Background
  // 4 - Sword and Shield Background
  BG_TYPE: 0,
};

interface WardrobePlayer {
  name: string;
  characterID: number;
  outfit: number;
  /** attr_accessor :outfit_unlocked (added by this plugin) */
  outfitUnlocked?: (string | undefined)[];
}

const player = () => G.player as unknown as WardrobePlayer;

/** $player.outfit_unlocked; Player#initialize sets it to [OUTFITS[0]]. */
export function outfitUnlocked(p: WardrobePlayer = player()): (string | undefined)[] {
  p.outfitUnlocked ??= [WardrobeConfig.OUTFITS[0]];
  return p.outfitUnlocked;
}

/** Player#trainer_type: GameData::PlayerMetadata.get(@character_ID || 1).trainer_type */
function trainerType(): string {
  return String(playerMetadata(player().characterID || 1)?.trainerType ?? "");
}

/** $player.outfit = value (Player#outfit= also refreshes the player's charset). */
function setOutfit(value: number): void {
  const p = player();
  if (p.outfit === value) return;
  p.outfit = value;
  (G.gamePlayer as unknown as { refreshCharset?(): void } | null)?.refreshCharset?.();
}

/** Player#pbUnlockOutfit */
export function playerUnlockOutfit(outfitIndex: number): void {
  const outfitUnlock = WardrobeConfig.OUTFITS[outfitIndex];
  const unlocked = outfitUnlocked();
  if (!unlocked.includes(outfitUnlock)) {
    unlocked.push(outfitUnlock);
    console.log(`Outfit ${outfitUnlock} Unlocked`);
  } else {
    console.log(`Outfit ${outfitUnlock} already unlocked`);
  }
}

export function pbUnlockOutfit(outfitIndex: number): void {
  playerUnlockOutfit(outfitIndex);
}

export class Window_Wardrobe extends Window_DrawableCommand {
  declare _outfits: string[];
  declare _selarrowWardrobe: AnimatedBitmap;
  declare _outfitSelected: number;

  constructor(outfits: string[], x: number, y: number, width: number, height: number, viewport: Viewport | null, index: number) {
    super(x, y, width, height, viewport);
    this._outfits = outfits;
    this._selarrowWardrobe = new AnimatedBitmap("Graphics/Pictures/TC Wardrobe/cursor");
    this._baseColor = new Color(88, 88, 80);
    this._shadowColor = new Color(168, 184, 184);
    this._outfitSelected = index;
    this.index = index;
    this.windowskin = null;
  }

  override dispose(): void {
    this._selarrowWardrobe?.dispose();
    super.dispose();
  }

  override itemCount(): number {
    return this._outfits?.length ?? 0;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    rect = new Rect(rect.x + 16, rect.y, rect.width - 16, rect.height);
    const outfit = this._outfits[index]!;
    const baseColor = this.baseColor;
    const shadowColor = this.shadowColor;
    pbDrawTextPositions(this.contents!, [[outfit, rect.x, rect.y + 6, false, baseColor, shadowColor]]);
    if (index === this._outfitSelected) {
      pbDrawImagePositions(this.contents!, [["Graphics/Pictures/TC Wardrobe/check", rect.x + rect.width - 34, rect.y + 8, 0, 0, -1, 24]]);
    }
  }

  override drawCursor(index: number, rect: Rect): Rect {
    if (this.index === index) pbCopyBitmap(this.contents!, this._selarrowWardrobe.bitmap, rect.x, rect.y + 4);
    return rect;
  }

  set outfitSelected(value: number) {
    this._outfitSelected = value;
    this.refresh();
  }

  override refresh(): void {
    if (this._selarrowWardrobe === undefined) return; // (Ruby sets @outfits before super; see SpriteWindowText.ts)
    this._itemMax = this.itemCount();
    this.updateCursorRect();
    const dwidth = this.width - this.borderX;
    const dheight = this.height - this.borderY;
    this.contents = pbDoEnsureBitmap(this.contents, dwidth, dheight);
    this.contents.clear();
    for (let i = 0; i < this._itemMax; i++) {
      if (i < this.topItem || i > this.topItem + this.pageItemMax) continue;
      this.drawItem(i, this._itemMax, this.itemRect(i));
    }
    this.drawCursor(this.index, this.itemRect(this.index));
  }
}

export class WardrobeScene {
  private viewport: Viewport;
  private sprites: Sprites = {};
  private baseColor = new Color(88, 88, 80);
  private shadowColor = new Color(168, 184, 184);
  private outfitAll = WardrobeConfig.OUTFITS;
  private outfitSelected: number;
  private outfitCurrent: number;
  private outfitHover: number;
  private orderedList: string[];
  private overlayText: string;
  private index: number;

  constructor(orderedList: string[], index: number, overlayText: string) {
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.outfitSelected = player().outfit;
    this.outfitCurrent = player().outfit;
    this.outfitHover = player().outfit;
    this.orderedList = orderedList;
    this.overlayText = overlayText;
    this.index = index;
  }

  private list(): Window_Wardrobe { return this.sprites["outfitlist"] as unknown as Window_Wardrobe; }

  /** The rest of Ruby's initialize (pbFadeInAndShow blocks). */
  async initialize(): Promise<void> {
    const bgType = WardrobeConfig.BG_TYPE;
    addBackgroundPlane(this.sprites, "bg", _INTL("TC Wardrobe/bg_{1}", bgType), this.viewport);
    this.sprites["outfitlist"] = new Window_Wardrobe(this.orderedList, Graphics.width - 300, 74, 282, 236, this.viewport, this.index);
    const overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.sprites["overlay"] = overlay;
    pbSetSystemFont(overlay.bitmap!);
    pbDrawTextPositions(overlay.bitmap!, [[this.overlayText, 16, 18, false, this.baseColor, this.shadowColor]]);
    this.sprites["player"] = new IconSprite(12, 112, this.viewport);
    this.pbUpdateTrainerGraphic();
    pbUpdateSpriteHash(this.sprites as never);
    this.list().refresh();
    await pbFadeInAndShow(asHash(this.sprites));
  }

  async pbMain(): Promise<void> {
    for (;;) {
      await Graphics.update();
      Input.update();
      const list = this.list();
      if (Input.repeat(Input.UP)) {
        if (!(list.index > 0)) {
          await this.pbEdgeBlock(Input.UP);
          continue;
        }
        list.index -= 1;
        this.pbSwitchOutfit();
      } else if (Input.repeat(Input.DOWN)) {
        if (!(list.index < this.orderedList.length - 1)) {
          await this.pbEdgeBlock(Input.DOWN);
          continue;
        }
        list.index += 1;
        this.pbSwitchOutfit();
      } else if (Input.trigger(Input.USE)) {
        if (this.outfitSelected === this.outfitHover) {
          pbPlayBuzzerSE();
          continue;
        }
        this.outfitSelected = this.outfitHover;
        list.outfitSelected = list.index;
        pbPlayCursorSE();
      } else if (Input.trigger(Input.BACK)) {
        if (this.outfitSelected === this.outfitCurrent) break;
        const comfirm = await pbMessage(_INTL("Would you like to go with this outfit?"),
          [_INTL("Yes"), _INTL("No"), _INTL("Leave without changing")], 2);
        if (comfirm === 0) setOutfit(this.outfitSelected);
        if (comfirm === 0 || comfirm === 2) break;
      }
    }
  }

  /** make sure Buzzer doesn't play multiple times when holding key */
  async pbEdgeBlock(input: number): Promise<void> {
    let block = false;
    for (;;) {
      await Graphics.update();
      Input.update();
      if (Input.release(input)) break;
      if (!block) pbPlayBuzzerSE();
      block = true;
    }
  }

  /** switches outfit of player in UI */
  pbSwitchOutfit(): void {
    const outfitSel = this.orderedList[this.list().index]!;
    this.outfitHover = this.outfitAll.indexOf(outfitSel);
    this.pbUpdateTrainerGraphic();
    pbPlayCursorSE();
  }

  pbUpdateTrainerGraphic(): void {
    let playerFilename = trainerType();
    if (this.outfitHover > 0) playerFilename += _INTL("_{1}", this.outfitHover);
    const spr = this.sprites["player"] as unknown as IconSprite;
    spr.setBitmapFile(_INTL("Graphics/Trainers/{1}", playerFilename));
    spr.zoomX = 2;
    spr.zoomY = 2;
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

/** Every graphic the wardrobe GUI can show for the current player. */
export function wardrobeBitmaps(): string[] {
  const tt = trainerType();
  return [
    `Graphics/Pictures/TC Wardrobe/bg_${WardrobeConfig.BG_TYPE}`,
    "Graphics/Pictures/TC Wardrobe/cursor",
    "Graphics/Pictures/TC Wardrobe/check",
    ...WardrobeConfig.OUTFITS.map((_, i) => `Graphics/Trainers/${tt}${i > 0 ? `_${i}` : ""}`),
  ];
}

export class Wardrobe {
  private GUI_ENABLED = WardrobeConfig.TYPE === 1;
  private outfitCurrent = player().outfit;
  private outfitAll = WardrobeConfig.OUTFITS;
  private unlockedOutfits = outfitUnlocked();
  private selectedIndex = 0;
  private outfitListOrdered: string[] = [];
  private scene: WardrobeScene | null = null;

  /**
   * Ruby's initialize. Its `return true/false` (outfit changed or not) is
   * discarded by Wardrobe.new, so pbWardrobe returns the Wardrobe object;
   * this method returns that flag for callers that want it.
   */
  async initialize(overlayText: string): Promise<boolean> {
    for (const i of this.outfitAll) {
      if (this.unlockedOutfits.includes(i)) this.outfitListOrdered.push(i);
      if (this.outfitAll.indexOf(i) === this.outfitCurrent) this.selectedIndex = this.outfitListOrdered.indexOf(i);
    }

    if (this.GUI_ENABLED) {
      await preloadBitmaps(wardrobeBitmaps());
      await pbFadeOutIn(async () => {
        this.scene = new WardrobeScene(this.outfitListOrdered, this.selectedIndex, overlayText);
        await this.scene.initialize();
        await this.scene.pbMain();
        await this.scene.pbEndScene();
      });
    } else {
      const outfitChosen = await pbMessage(_INTL("Choose an outfit"), this.outfitListOrdered, -1, null, this.selectedIndex);
      if (outfitChosen < 0) return false;
      const outfitSelected = this.outfitListOrdered[outfitChosen]!;
      setOutfit(this.outfitAll.indexOf(outfitSelected));
    }

    if (player().outfit === this.outfitCurrent) return false;
    return true;
  }
}

export async function pbWardrobe(overlayText: string = _INTL("{1}'s Wardrobe", player().name)): Promise<Wardrobe> {
  const ret = new Wardrobe();
  await ret.initialize(overlayText);
  return ret;
}
