// Port of 017_Minigames/001_Minigame_Duel.rb ("Duel" mini-game, based on
// the Duel minigame by Alael).
//
// Frame counts scale by Graphics.frame_rate (40), and the windows slide by
// a fixed distance per frame, so the loops run per original frame
// (common.ts) with the map updated every tick (pbUpdateSceneMap).
//
// The move routes call Game_Character methods through ScriptAsync
// ("moveRight90", "jumpForward"...). The port's move route scripts don't run
// Ruby, so duelMoveRoute turns them into the move they make: the duel turns
// direction fix on first, so the direction they read is the one at the time
// the route is set.

import type { Id } from "../data/gameData/gameData";
import { TrainerType } from "../data/gameData/trainerType";
import { assetExists } from "../core/assets";
import { rand } from "../core/random";
import type { MoveCommand } from "../data/events";
import type { GameCharacter } from "../game/GameCharacter";
import { G, pbUpdateSceneMap } from "../game/globals";
import { PBMoveRoute, pbMoveRoute } from "../game/scripts/moveRoute";
import { NPCTrainer } from "../game/trainer/Trainer";
import { Viewport } from "../rgss/display";
import { Graphics } from "../rgss/Graphics";
import { Color } from "../rgss/types";
import { fmtescape } from "../ui/drawText";
import { _INTL, pbDisposeSpriteHash } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";
import { preloadBitmaps } from "../ui/rpgCache";
import { pbWait } from "../ui/scenes/frames";
import { IconSprite } from "../ui/SpriteWrapper";
import { Window_AdvancedTextPokemon } from "../ui/windows/SpriteWindowText";
import { OriginalFrames, player, RUBY_FRAME_RATE } from "./common";

export class DuelWindow extends Window_AdvancedTextPokemon {
  private _hp = 10;
  private _name = "";
  private _isEnemy = false;

  constructor(name: string, isEnemy: boolean) {
    super();
    this._hp = 10;
    this._name = name;
    this._isEnemy = isEnemy;
    this.width = 160;
    this.height = 96;
    this.duelRefresh();
  }

  get hp(): number { return this._hp; }
  set hp(value: number) {
    this._hp = value;
    this.duelRefresh();
  }

  get name(): string { return this._name; }
  set name(value: string) {
    this._name = value;
    this.duelRefresh();
  }

  get isEnemy(): boolean { return this._isEnemy; }
  set isEnemy(value: boolean) {
    this._isEnemy = value;
    this.duelRefresh();
  }

  duelRefresh(): void {
    const nameColor = this._isEnemy ? "<ar><c3=E00808,F8B870>" : "<c3=3050C8,A0C0F0>";
    const hpColor = "<c3=209808,90F090>";
    this.text = _INTL("{1}{2}\r\n{3}HP: {4}", nameColor, fmtescape(this._name), hpColor, this._hp);
  }
}

/** ScriptAsync "method" (a Game_Character method of the duel) as the move it makes. */
function scriptMove(ch: GameCharacter | null, script: string): MoveCommand {
  const dir = ch?.direction ?? 2;
  const step = (d: number): MoveCommand => ({ move: ({ 2: "down", 4: "left", 6: "right", 8: "up" } as const)[d as 2 | 4 | 6 | 8] });
  const offset = (d: number) => [d === 4 ? -1 : d === 6 ? 1 : 0, d === 8 ? -1 : d === 2 ? 1 : 0] as const;
  switch (script) {
    case "moveLeft90": return step(({ 2: 6, 4: 2, 6: 8, 8: 4 } as Record<number, number>)[dir]!); // anticlockwise
    case "moveRight90": return step(({ 2: 4, 4: 8, 6: 2, 8: 6 } as Record<number, number>)[dir]!); // clockwise
    case "jumpForward": { const [x, y] = offset(dir); return { move: "jump", x, y }; }
    case "jumpBackward": { const [x, y] = offset(dir); return { move: "jump", x: -x, y: -y }; }
  }
  throw new Error(`Duel move route script ${script} isn't ported`);
}

/** pbMoveRoute(event, commands) with the duel's ScriptAsync commands (see the header). */
function duelMoveRoute(event: GameCharacter | null, commands: unknown[]): void {
  const plain: unknown[] = [];
  const scripts: [number, string][] = [];
  for (let i = 0; i < commands.length; i++) {
    if (commands[i] === PBMoveRoute.ScriptAsync) {
      scripts.push([plain.length, commands[i + 1] as string]);
      plain.push(PBMoveRoute.Wait, 0); // placeholder, replaced below
      i += 1;
    } else {
      plain.push(commands[i]);
    }
  }
  if (scripts.length === 0) {
    pbMoveRoute(event, plain);
    return;
  }
  // Build the route without forcing it, splice the script moves in, then force it.
  const route = pbMoveRoute(null, plain);
  // pbMoveRoute's list: ThroughOn, one entry per command (two-value commands take one), ThroughOff.
  let entry = 1;
  let k = 0;
  const twoValue = new Set<number>([PBMoveRoute.Wait, PBMoveRoute.SwitchOn, PBMoveRoute.SwitchOff, PBMoveRoute.ChangeSpeed,
    PBMoveRoute.ChangeFreq, PBMoveRoute.Opacity, PBMoveRoute.Blending, PBMoveRoute.PlaySE, PBMoveRoute.Script]);
  const entryOf: number[] = [];
  while (k < plain.length) {
    entryOf[k] = entry;
    const c = plain[k] as number;
    k += twoValue.has(c) ? 2 : c === PBMoveRoute.Jump ? 3 : c === PBMoveRoute.Graphic ? 5 : 1;
    entry += 1;
  }
  // Each ScriptAsync becomes the script's move followed by a 0-frame wait.
  for (let s = scripts.length - 1; s >= 0; s--) {
    const [pos, script] = scripts[s]!;
    const at = entryOf[pos]!;
    route.list.splice(at, 1, scriptMove(event, script), { move: "wait", seconds: 0 });
  }
  event?.forceMoveRoute(route);
}

/** pbShake(power, speed, frames) */
function pbShake(power: number, speed: number, frames: number): void {
  G.gameScreen?.startShake(power, speed, frames / 20);
}

/** pbFlash(color, frames) */
function pbFlash(color: Color, frames: number): void {
  G.gameScreen?.startFlash(color, frames / 20);
}

//===============================================================================
//
//===============================================================================
export class PokemonDuel {
  private event: GameCharacter | null = null;
  private viewport!: Viewport;
  private sprites: {
    player: IconSprite; opponent: IconSprite; playerwindow: DuelWindow; opponentwindow: DuelWindow;
  } = null as never;
  private oldmovespeed = 0;
  private oldeventspeed = 0;
  private hp: [number, number] = [10, 10];
  private special: [boolean, boolean] = [false, false];
  private frames = new OriginalFrames();

  private async frame(): Promise<void> {
    await this.frames.updateWithInput(() => pbUpdateSceneMap());
  }

  async pbStartDuel(opponent: NPCTrainer, event: GameCharacter | null): Promise<void> {
    this.event = event;
    const exists = (p: string) => (assetExists(p) ? p : null);
    const playerFile = TrainerType.frontSpriteFilename(player().trainerType, exists);
    const opponentFile = TrainerType.frontSpriteFilename(opponent.trainerType, exists);
    await preloadBitmaps([playerFile, opponentFile].filter((f): f is string => !!f));
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const playerSprite = new IconSprite(-128 - 32, 96, this.viewport);
    playerSprite.setBitmapFile(playerFile);
    const opponentSprite = new IconSprite(Graphics.width + 32, 96, this.viewport);
    opponentSprite.setBitmapFile(opponentFile);
    const playerwindow = new DuelWindow(player().name, false);
    playerwindow.x = -playerwindow.width;
    playerwindow.viewport = this.viewport;
    const opponentwindow = new DuelWindow(opponent.name, true);
    opponentwindow.x = Graphics.width;
    opponentwindow.viewport = this.viewport;
    this.sprites = { player: playerSprite, opponent: opponentSprite, playerwindow, opponentwindow };
    await pbWait(Math.floor(RUBY_FRAME_RATE / 2));
    const distancePerFrame = Math.floor((8 * 20) / RUBY_FRAME_RATE);
    while (this.sprites.player.x < 0) {
      this.sprites.player.x += distancePerFrame;
      this.sprites.playerwindow.x += distancePerFrame;
      this.sprites.opponent.x -= distancePerFrame;
      this.sprites.opponentwindow.x -= distancePerFrame;
      await this.frame();
    }
    const gamePlayer = G.gamePlayer as unknown as GameCharacter;
    this.oldmovespeed = gamePlayer?.moveSpeed ?? 3;
    this.oldeventspeed = event?.moveSpeed ?? 3;
    duelMoveRoute(gamePlayer,
      [PBMoveRoute.ChangeSpeed, 2,
        PBMoveRoute.DirectionFixOn]);
    duelMoveRoute(event,
      [PBMoveRoute.ChangeSpeed, 2,
        PBMoveRoute.DirectionFixOn]);
    await pbWait(Math.floor((RUBY_FRAME_RATE * 3) / 4));
  }

  async pbDuel(opponent: NPCTrainer, event: GameCharacter | null, speeches: string[]): Promise<boolean> {
    await this.pbStartDuel(opponent, event);
    const me = G.gamePlayer as unknown as GameCharacter;
    const fr = RUBY_FRAME_RATE;
    this.hp = [10, 10];
    this.special = [false, false];
    let decision: boolean;
    for (;;) {
      if (this.hp[0] < 0) this.hp[0] = 0;
      if (this.hp[1] < 0) this.hp[1] = 0;
      await this.pbRefresh();
      if (this.hp[0] <= 0) {
        decision = false;
        break;
      } else if (this.hp[1] <= 0) {
        decision = true;
        break;
      }
      let action = 0;
      const scores = [3, 4, 4, 2];
      const choices = (this.special[1]) ? 3 : 4;
      if (this.special[1]) scores[3] = 0;
      const total = scores[0]! + scores[1]! + scores[2]! + scores[3]!;
      if (total <= 0) {
        action = rand(choices);
      } else {
        const num = rand(total);
        let cumtotal = 0;
        for (let i = 0; i < 4; i++) {
          cumtotal += scores[i]!;
          if (num < cumtotal) {
            action = i;
            break;
          }
        }
      }
      if (action === 3) this.special[1] = true;
      await pbMessage(_INTL("{1}: {2}", opponent.name, speeches[(action * 3) + rand(3)]));
      const list = [
        _INTL("DEFEND"),
        _INTL("PRECISE ATTACK"),
        _INTL("FIERCE ATTACK"),
      ];
      if (!this.special[0]) list.push(_INTL("SPECIAL ATTACK"));
      const command = await pbMessage(_INTL("Choose a command."), list, 0);
      if (command === 3) this.special[0] = true;
      if (action === 0 && command === 0) {
        duelMoveRoute(me,
          [PBMoveRoute.ScriptAsync, "moveRight90",
            PBMoveRoute.ScriptAsync, "moveLeft90",
            PBMoveRoute.ScriptAsync, "moveLeft90",
            PBMoveRoute.ScriptAsync, "moveRight90"]);
        duelMoveRoute(event,
          [PBMoveRoute.ScriptAsync, "moveLeft90",
            PBMoveRoute.ScriptAsync, "moveRight90",
            PBMoveRoute.ScriptAsync, "moveRight90",
            PBMoveRoute.ScriptAsync, "moveLeft90"]);
        await pbWait(Math.floor(fr / 2));
        await pbMessage(_INTL("You study each other's movements..."));
      } else if (action === 0 && command === 1) {
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.Forward]);
        await pbWait(Math.floor((fr * 4) / 10));
        pbShake(9, 9, 8);
        await this.pbFlashScreens(false, true);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        this.hp[1] -= 1;
        await pbMessage(_INTL("Your attack was not blocked!"));
      } else if (action === 0 && command === 2) {
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpForward"]);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.Backward]);
        await pbWait(fr);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Forward]);
        await pbMessage(_INTL("Your attack was evaded!"));
      } else if ([0, 1, 2].includes(action) && command === 3) {
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpForward"]);
        await pbWait(Math.floor((fr * 4) / 10));
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 5,
            PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 2]);
        await pbWait(Math.floor(fr / 2));
        pbShake(9, 9, 8);
        await this.pbFlashScreens(false, true);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Forward]);
        this.hp[1] -= 3;
        await pbMessage(_INTL("You pierce through the opponent's defenses!"));
      } else if (action === 1 && command === 0) {
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.Forward]);
        await pbWait(Math.floor((fr * 4) / 10));
        pbShake(9, 9, 8);
        await this.pbFlashScreens(true, false);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        this.hp[0] -= 1;
        await pbMessage(_INTL("You fail to block the opponent's attack!"));
      } else if (action === 1 && command === 1) {
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.Forward]);
        await pbWait(Math.floor((fr * 6) / 10));
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Forward]);
        await pbWait(Math.floor((fr * 6) / 10));
        duelMoveRoute(event, [PBMoveRoute.Backward]);
        duelMoveRoute(me, [PBMoveRoute.Forward]);
        await pbWait(Math.floor((fr * 6) / 10));
        duelMoveRoute(me, [PBMoveRoute.Backward]);
        await pbMessage(_INTL("You cross blades with the opponent!"));
      } else if ((action === 1 && command === 2) ||
                 (action === 2 && command === 1) ||
                 (action === 2 && command === 2)) {
        duelMoveRoute(me,
          [PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpForward"]);
        await pbWait(Math.floor((fr * 8) / 10));
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.Forward]);
        await pbWait(Math.floor((fr * 9) / 10));
        pbShake(9, 9, 8);
        await this.pbFlashScreens(true, true);
        duelMoveRoute(me,
          [PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 2]);
        duelMoveRoute(event,
          [PBMoveRoute.Backward,
            PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 2]);
        await pbWait(fr);
        duelMoveRoute(event, [PBMoveRoute.Forward]);
        duelMoveRoute(me, [PBMoveRoute.Forward]);
        this.hp[0] -= action; // Enemy action
        this.hp[1] -= command; // Player command
        await pbMessage(_INTL("You hit each other!"));
      } else if (action === 2 && command === 0) {
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.Forward]);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpBackward"]);
        await pbWait(fr);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Forward]);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        await pbMessage(_INTL("You evade the opponent's attack!"));
      } else if (action === 3 && [0, 1, 2].includes(command)) {
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpForward"]);
        await pbWait(Math.floor((fr * 4) / 10));
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 5,
            PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 2]);
        await pbWait(Math.floor(fr / 2));
        pbShake(9, 9, 8);
        await this.pbFlashScreens(true, false);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Forward]);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 2,
            PBMoveRoute.Backward]);
        this.hp[0] -= 3;
        await pbMessage(_INTL("The opponent pierces through your defenses!"));
      } else if (action === 3 && command === 3) {
        duelMoveRoute(me, [PBMoveRoute.Backward]);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpForward"]);
        duelMoveRoute(event,
          [PBMoveRoute.Wait, 15,
            PBMoveRoute.ChangeSpeed, 4,
            PBMoveRoute.ScriptAsync, "jumpForward"]);
        await pbWait(fr);
        duelMoveRoute(event,
          [PBMoveRoute.ChangeSpeed, 5,
            PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 2]);
        duelMoveRoute(me,
          [PBMoveRoute.ChangeSpeed, 5,
            PBMoveRoute.Backward,
            PBMoveRoute.ChangeSpeed, 2]);
        pbShake(9, 9, 8);
        pbFlash(new Color(255, 255, 255, 255), 20);
        await this.pbFlashScreens(true, true);
        duelMoveRoute(me, [PBMoveRoute.Forward]);
        this.hp[0] -= 4;
        this.hp[1] -= 4;
        await pbMessage(_INTL("Your special attacks collide!"));
      }
    }
    await this.pbEndDuel();
    return decision;
  }

  async pbEndDuel(): Promise<void> {
    await pbWait(Math.floor((RUBY_FRAME_RATE * 3) / 4));
    duelMoveRoute(G.gamePlayer as unknown as GameCharacter,
      [PBMoveRoute.DirectionFixOff,
        PBMoveRoute.ChangeSpeed, this.oldmovespeed]);
    duelMoveRoute(this.event,
      [PBMoveRoute.DirectionFixOff,
        PBMoveRoute.ChangeSpeed, this.oldeventspeed]);
    const fadeTime = Math.floor((RUBY_FRAME_RATE * 4) / 10);
    const alphaDiff = Math.ceil(255.0 / fadeTime);
    const s = this.sprites;
    for (let n = 0; n < fadeTime; n++) {
      s.player.opacity = Math.max(0, s.player.opacity - alphaDiff);
      s.opponent.opacity = Math.max(0, s.opponent.opacity - alphaDiff);
      s.playerwindow.contentsOpacity -= alphaDiff;
      s.opponentwindow.contentsOpacity -= alphaDiff;
      s.playerwindow.opacity -= alphaDiff;
      s.opponentwindow.opacity -= alphaDiff;
      await this.frame();
    }
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }

  async pbFlashScreens(player: boolean, opponent: boolean): Promise<void> {
    let i = 0;
    const flashTime = Math.floor((RUBY_FRAME_RATE * 2) / 10);
    const alphaDiff = Math.ceil((2 * 255.0) / flashTime);
    const s = this.sprites;
    const paint = () => {
      if (player) {
        s.player.color = new Color(255, 255, 255, i * alphaDiff);
        s.playerwindow.color = new Color(255, 255, 255, i * alphaDiff);
      }
      if (opponent) {
        s.opponent.color = new Color(255, 255, 255, i * alphaDiff);
        s.opponentwindow.color = new Color(255, 255, 255, i * alphaDiff);
      }
    };
    for (let n = 0; n < flashTime; n++) {
      i += 1;
      paint();
      await this.frame();
    }
    for (let n = 0; n < flashTime; n++) {
      i -= 1;
      paint();
      await this.frame();
    }
    if (!player || !opponent) await pbWait(Math.floor((RUBY_FRAME_RATE * 4) / 10));
  }

  async pbRefresh(): Promise<void> {
    this.sprites.playerwindow.hp = this.hp[0];
    this.sprites.opponentwindow.hp = this.hp[1];
    await pbWait(Math.floor(RUBY_FRAME_RATE / 4));
  }
}

// Starts a duel.
// trainer_id - ID or symbol of the opponent's trainer type.
// trainer_name - Name of the opponent
// event - Game_Event object for the character's event
// speeches - Array of 12 speeches
export async function pbDuel(trainerId: Id, trainerName: string, event: GameCharacter | null, speeches: string[]): Promise<boolean> {
  trainerId = TrainerType.get(trainerId).id;
  const duel = new PokemonDuel();
  const opponent = new NPCTrainer(trainerName, trainerId); // pbGetMessageFromHash(MessageTypes::TrainerNames, trainer_name)
  const speechTexts: string[] = [];
  for (let i = 0; i < 12; i++) speechTexts.push(speeches[i]!); // _I(speeches[i])
  return duel.pbDuel(opponent, event, speechTexts);
}
