// Port of 016_UI/021_UI_MoveRelearner.rb: MoveRelearner_Scene,
// MoveRelearnerScreen and pbRelearnMoveScreen (the Move Relearner's event,
// Map 162, and the Improved Field Skills / ZUD items that open it).

import type { Id } from "../../data/gameData/gameData";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Type } from "../../data/gameData/type";
import { G } from "../../game/globals";
import { pbLearnMove } from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { UIHelper } from "../bag/UIHelper";
import { drawTextEx, pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../drawText";
import { pbActivateWindow, pbDeactivateWindows, pbFadeInAndShow, pbFadeOutAndHide, pbFadeOutIn } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { PictureOrigin } from "../scenes/PictureEx";
import { PokemonIconSprite, preloadPokemonIcons } from "../sprites/pokemonIcon";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_CommandPokemon } from "../windows/SpriteWindowText";
import { FieldSkillHooks } from "./fieldSkills";

const BITMAPS = ["reminderbg", "reminderSel", "reminderButtons", "types", "category"].map((f) => `Graphics/Pictures/${f}`);

type Sprites = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

//===============================================================================
// Scene class for handling appearance of the screen
//===============================================================================
export class MoveRelearner_Scene {
  static readonly VISIBLEMOVES = 4;
  private pokemon!: Pokemon;
  private moves: Id[] = [];
  private viewport!: Viewport;
  private sprites: Sprites = {};
  private typebitmap!: AnimatedBitmap;

  async pbDisplay(msg: string, brief = false): Promise<void> {
    await UIHelper.pbDisplay(this.sprites.msgwindow, msg, brief, () => this.pbUpdate());
  }

  async pbConfirm(msg: string): Promise<boolean> {
    return UIHelper.pbConfirm(this.sprites.msgwindow, msg, () => this.pbUpdate());
  }

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites);
  }

  async pbStartScene(pokemon: Pokemon, moves: Id[]): Promise<void> {
    await Promise.all([preloadBitmaps(BITMAPS), preloadPokemonIcons([pokemon])]);
    this.pokemon = pokemon;
    this.moves = moves;
    const moveCommands: string[] = [];
    for (const m of moves) moveCommands.push(Move.get(m).name);
    // Create sprite hash
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const s: Sprites = (this.sprites = {});
    addBackgroundPlane(s, "bg", "reminderbg", this.viewport);
    s.pokeicon = new PokemonIconSprite(this.pokemon, this.viewport);
    s.pokeicon.setOffset(PictureOrigin.CENTER);
    s.pokeicon.x = 320;
    s.pokeicon.y = 84;
    s.background = new IconSprite(0, 0, this.viewport);
    s.background.setBitmap("Graphics/Pictures/reminderSel");
    s.background.y = 78;
    s.background.srcRect = new Rect(0, 72, 258, 72);
    s.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    pbSetSystemFont(s.overlay.bitmap);
    s.commands = new Window_CommandPokemon(moveCommands, 32);
    s.commands.height = 32 * (MoveRelearner_Scene.VISIBLEMOVES + 1);
    s.commands.visible = false;
    s.msgwindow = new Window_AdvancedTextPokemon("");
    s.msgwindow.visible = false;
    s.msgwindow.viewport = this.viewport;
    this.typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/types"));
    this.pbDrawMoveList();
    await pbDeactivateWindows(s);
    // Fade in all sprites
    await pbFadeInAndShow(s, null, () => this.pbUpdate());
  }

  pbDrawMoveList(): void {
    const overlay = this.sprites.overlay.bitmap;
    overlay.clear();
    const commands = this.sprites.commands as Window_CommandPokemon;
    const types = this.pokemon.types();
    types.forEach((type, i) => {
      const typeNumber = Type.get(type).iconPosition;
      const typeRect = new Rect(0, typeNumber * 28, 64, 28);
      const typeX = types.length === 1 ? 400 : 366 + 70 * i;
      overlay.blt(typeX, 70, this.typebitmap.bitmap, typeRect);
    });
    const textpos: TextPosition[] = [
      [_INTL("Teach which move?"), 16, 14, 0, new Color(88, 88, 80), new Color(168, 184, 184)],
    ];
    const imagepos: ImagePosition[] = [];
    let yPos = 88;
    for (let i = 0; i < MoveRelearner_Scene.VISIBLEMOVES; i++) {
      const moveobject = this.moves[commands.topItem + i];
      if (moveobject) {
        const moveData = Move.get(moveobject);
        const typeNumber = Type.get(moveData.displayType(this.pokemon)).iconPosition;
        imagepos.push(["Graphics/Pictures/types", 12, yPos - 4, 0, typeNumber * 28, 64, 28]);
        textpos.push([moveData.name, 80, yPos, 0, new Color(248, 248, 248), new Color(0, 0, 0)]);
        textpos.push([_INTL("PP"), 112, yPos + 32, 0, new Color(64, 64, 64), new Color(176, 176, 176)]);
        if (moveData.totalPp > 0) {
          textpos.push([_INTL("{1}/{1}", moveData.totalPp), 230, yPos + 32, 1, new Color(64, 64, 64), new Color(176, 176, 176)]);
        } else {
          textpos.push(["--", 230, yPos + 32, 1, new Color(64, 64, 64), new Color(176, 176, 176)]);
        }
      }
      yPos += 64;
    }
    imagepos.push(["Graphics/Pictures/reminderSel", 0, 78 + (commands.index - commands.topItem) * 64, 0, 0, 258, 72]);
    const selMoveData = Move.get(this.moves[commands.index]!);
    const basedamage = selMoveData.displayDamage(this.pokemon);
    const category = selMoveData.displayCategory(this.pokemon);
    const accuracy = selMoveData.displayAccuracy(this.pokemon);
    textpos.push([_INTL("CATEGORY"), 272, 120, 0, new Color(248, 248, 248), new Color(0, 0, 0)]);
    textpos.push([_INTL("POWER"), 272, 152, 0, new Color(248, 248, 248), new Color(0, 0, 0)]);
    textpos.push([basedamage <= 1 ? (basedamage === 1 ? "???" : "---") : String(Math.trunc(basedamage)),
      468, 152, 2, new Color(64, 64, 64), new Color(176, 176, 176)]);
    textpos.push([_INTL("ACCURACY"), 272, 184, 0, new Color(248, 248, 248), new Color(0, 0, 0)]);
    textpos.push([accuracy === 0 ? "---" : `${accuracy}%`, 468, 184, 2, new Color(64, 64, 64), new Color(176, 176, 176)]);
    pbDrawTextPositions(overlay, textpos);
    imagepos.push(["Graphics/Pictures/category", 436, 116, 0, category * 28, 64, 28]);
    if (commands.index < this.moves.length - 1) imagepos.push(["Graphics/Pictures/reminderButtons", 48, 350, 0, 0, 76, 32]);
    if (commands.index > 0) imagepos.push(["Graphics/Pictures/reminderButtons", 134, 350, 76, 0, 76, 32]);
    pbDrawImagePositions(overlay, imagepos);
    drawTextEx(overlay, 272, 216, 230, 5, selMoveData.description, new Color(64, 64, 64), new Color(176, 176, 176));
  }

  /** Processes the scene */
  async pbChooseMove(): Promise<Id | null> {
    let oldcmd = -1;
    let ret: Id | null = null;
    const commands = this.sprites.commands as Window_CommandPokemon;
    await pbActivateWindow(this.sprites, "commands", async () => {
      for (;;) {
        oldcmd = commands.index;
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        if (commands.index !== oldcmd) {
          this.sprites.background.x = 0;
          this.sprites.background.y = 78 + (commands.index - commands.topItem) * 64;
          this.pbDrawMoveList();
        }
        if (Input.trigger(Input.BACK)) {
          ret = null;
          return;
        } else if (Input.trigger(Input.USE)) {
          ret = this.moves[commands.index]!;
          return;
        }
      }
    });
    return ret;
  }

  /** End the scene here */
  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(this.sprites, () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites);
    this.typebitmap.dispose();
    this.viewport.dispose();
  }
}

//===============================================================================
// Screen class for handling game logic
//===============================================================================
export class MoveRelearnerScreen {
  constructor(private scene: MoveRelearner_Scene) {}

  pbGetRelearnableMoves(pkmn: Pokemon | null): Id[] {
    if (!pkmn || pkmn.egg() || pkmn.shadowPokemon()) return [];
    let moves: Id[] = [];
    for (const m of pkmn.getMoveList()) {
      if (m.level > pkmn.level || pkmn.hasMove(m.move)) continue;
      if (!moves.includes(m.move)) moves.push(m.move);
    }
    if (Settings.MOVE_RELEARNER_CAN_TEACH_MORE_MOVES && pkmn.firstMoves) {
      const tmoves: Id[] = [];
      for (const i of pkmn.firstMoves) {
        if (!moves.includes(i) && !pkmn.hasMove(i)) tmoves.push(i);
      }
      moves = [...tmoves, ...moves]; // List first moves before level-up moves
    }
    return [...new Set(moves)]; // remove duplicates
  }

  async pbStartScreen(pkmn: Pokemon): Promise<boolean> {
    const moves = this.pbGetRelearnableMoves(pkmn);
    await this.scene.pbStartScene(pkmn, moves);
    for (;;) {
      const move = await this.scene.pbChooseMove();
      if (move) {
        if (await this.scene.pbConfirm(_INTL("Teach {1}?", Move.get(move).name))) {
          if (await pbLearnMove(pkmn, move)) {
            G.stats.movesTaughtByReminder += 1;
            await this.scene.pbEndScene();
            return true;
          }
        }
      } else if (await this.scene.pbConfirm(_INTL("Give up trying to teach a new move to {1}?", pkmn.name))) {
        await this.scene.pbEndScene();
        return false;
      }
    }
  }
}

//===============================================================================
//
//===============================================================================
export async function pbRelearnMoveScreen(pkmn: Pokemon): Promise<boolean> {
  let retval = true;
  await pbFadeOutIn(async () => {
    const scene = new MoveRelearner_Scene();
    const screen = new MoveRelearnerScreen(scene);
    retval = await screen.pbStartScreen(pkmn);
  });
  return retval;
}
FieldSkillHooks.relearnMoveScreen = pbRelearnMoveScreen;
