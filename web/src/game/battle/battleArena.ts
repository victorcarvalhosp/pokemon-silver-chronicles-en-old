// Port of 011_Battle/007_Other battle types/004_BattleArenaBattle.rb: Battle
// Arena battles (no switching; after three rounds a referee judges Mind, Skill
// and Body), the Battle::AI patch (never switch) and the Battle::Scene
// judgment screen. Battle::SuccessState is in the battle core
// (battle/battle/Battle_StartAndEnd.ts).

import { _INTL } from "../../data/gameData/gameData";
import { Battle } from "../../battle/battle/Battle";
import { AI } from "../../battle/ai/AI";
import type { Battler } from "../../battle/battler/Battler";
import type { Move } from "../../battle/move/Move";
import { BattleScene } from "../../battle/scene/BattleScene";
import { Bitmap } from "../../rgss/Bitmap";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Color } from "../../rgss/types";
import { pbDrawImagePositions, pbDrawTextPositions, type ImagePosition, type TextPosition } from "../../ui/drawText";
import { FrameCounter } from "../../ui/frameTime";
import { pbSetSystemFont } from "../../ui/messageConfig";
import { pbCreateMessageWindow, pbDisposeMessageWindow, pbMessage, pbMessageDisplay } from "../../ui/messages";
import { preloadBitmaps } from "../../ui/rpgCache";
import { SpriteWindow_Base } from "../../ui/windows/SpriteWindow";

declare module "../../battle/ai/AI" {
  interface AI {
    battleArena?: boolean;
  }
}

type ArenaScene = {
  pbBattleArenaBattlers(b1: Battler, b2: Battler): void | Promise<void>;
  pbBattleArenaJudgment(b1: Battler, b2: Battler, r1: number[], r2: number[]): void | Promise<void>;
};

export class BattleArenaBattle extends Battle {
  battlersChanged: boolean;
  mind: number[];
  skill: number[];
  starthp: number[];
  count: number;
  partyindexes: number[];

  constructor(...args: ConstructorParameters<typeof Battle>) {
    super(...args);
    this.battlersChanged = true;
    this.mind = [0, 0];
    this.skill = [0, 0];
    this.starthp = [0, 0];
    this.count = 0;
    this.partyindexes = [0, 0];
    this.battleAI.battleArena = true;
  }

  private get arenaScene(): ArenaScene { return this.scene as unknown as ArenaScene; }

  /** pbCanSwitchLax? (the port's core splits it; this covers every form of it). */
  override _pbCanSwitchLax(idxBattler: number, _idxParty: number, msgs: string[] | null): boolean {
    msgs?.push(_INTL("{1} can't be switched out!", this.battlers[idxBattler]!.pbThis()));
    return false;
  }

  override async pbEORSwitch(favorDraws = false): Promise<void> {
    if (favorDraws && this.decision === 5) return;
    if (!favorDraws && this.decision > 0) return;
    this.pbJudge();
    if (this.decision > 0) return;
    for (let side = 0; side < 2; side++) {
      if (!this.battlers[side]!.fainted()) continue;
      if (this.partyindexes[side]! + 1 >= this.pbParty(side).length) continue;
      this.partyindexes[side]! += 1;
      const newpoke = this.partyindexes[side]!;
      await this.pbMessagesOnReplace(side, newpoke);
      await this.pbReplace(side, newpoke);
      await this.pbOnBattlerEnteringBattle(side);
    }
  }

  override async pbOnAllBattlersEnteringBattle(): Promise<void> {
    this.battlersChanged = true;
    for (let side = 0; side < 2; side++) {
      this.mind[side] = 0;
      this.skill[side] = 0;
      this.starthp[side] = this.battlers[side]!.hp;
    }
    this.count = 0;
    return super.pbOnAllBattlersEnteringBattle();
  }

  /**
   * NOTE (Ruby parity): Battle has no pbRecordBattlerAsActive in v20.1, so
   * `super` raises NoMethodError (004_BattleArenaBattle.rb:95). Nothing calls it.
   */
  pbRecordBattlerAsActive(_battler: Battler): never {
    this.battlersChanged = true;
    for (let side = 0; side < 2; side++) {
      this.mind[side] = 0;
      this.skill[side] = 0;
      this.starthp[side] = this.battlers[side]!.hp;
    }
    this.count = 0;
    throw new Error("super: no superclass method `pbRecordBattlerAsActive'");
  }

  pbMindScore(move: Move): number {
    if (move.function === "ProtectUser" || // Detect/Protect
        move.function === "UserEnduresFaintingThisTurn" || // Endure
        move.function === "FlinchTargetFailsIfNotUserFirstTurn") { // Fake Out
      return -1;
    }
    if (move.function === "CounterPhysicalDamage" || // Counter
        move.function === "CounterSpecialDamage" || // Mirror Coat
        move.function === "MultiTurnAttackBideThenReturnDoubleDamage") { // Bide
      return 0;
    }
    if (move.statusMove()) return 0;
    return 1;
  }

  override async pbCommandPhase(): Promise<void> {
    if (this.battlersChanged) {
      await this.arenaScene.pbBattleArenaBattlers(this.battlers[0]!, this.battlers[1]!);
      this.battlersChanged = false;
      this.count = 0;
    }
    await super.pbCommandPhase();
    if (this.decision !== 0) return;
    // Update mind rating (asserting that a move was chosen)
    // TODO: Actually done at Pokémon's turn
    for (let side = 0; side < 2; side++) {
      const choice = this.choices[side]!;
      if (choice[2] && choice[0] === "UseMove") this.mind[side]! += this.pbMindScore(choice[2] as Move);
    }
  }

  override async pbEndOfRoundPhase(): Promise<void> {
    await super.pbEndOfRoundPhase();
    if (this.decision !== 0) return;
    // Update skill rating
    for (let side = 0; side < 2; side++) {
      this.skill[side]! += this.successStates[side]!.skill;
    }
    // Increment turn counter
    // NOTE (Ruby parity): @count is only reset when @battlersChanged, which
    // only pbOnAllBattlersEnteringBattle sets (pbRecordBattlerAsActive is never
    // called), so after the first judgment every later round is judged
    // (004_BattleArenaBattle.rb:148).
    this.count += 1;
    if (this.count < 3) return;
    // Half all multi-turn moves
    await this.battlers[0]!.pbCancelMoves(true);
    await this.battlers[1]!.pbCancelMoves(true);
    // Calculate scores in each category
    const ratings1 = [0, 0, 0];
    const ratings2 = [0, 0, 0];
    if (this.mind[0] === this.mind[1]) {
      ratings1[0] = 1;
      ratings2[0] = 1;
    } else if (this.mind[0]! > this.mind[1]!) {
      ratings1[0] = 2;
    } else {
      ratings2[0] = 2;
    }
    if (this.skill[0] === this.skill[1]) {
      ratings1[1] = 1;
      ratings2[1] = 1;
    } else if (this.skill[0]! > this.skill[1]!) {
      ratings1[1] = 2;
    } else {
      ratings2[1] = 2;
    }
    const body = [0, 0];
    body[0] = Math.floor((this.battlers[0]!.hp * 100) / Math.max(this.starthp[0]!, 1));
    body[1] = Math.floor((this.battlers[1]!.hp * 100) / Math.max(this.starthp[1]!, 1));
    if (body[0] === body[1]) {
      ratings1[2] = 1;
      ratings2[2] = 1;
    } else if (body[0] > body[1]) {
      ratings1[2] = 2;
    } else {
      ratings2[2] = 2;
    }
    // Show scores
    await this.arenaScene.pbBattleArenaJudgment(this.battlers[0]!, this.battlers[1]!, [...ratings1], [...ratings2]);
    // Calculate total scores
    const points: [number, number] = [0, 0];
    for (const val of ratings1) points[0] += val;
    for (const val of ratings2) points[1] += val;
    // Make judgment
    const [b0, b1] = [this.battlers[0]!, this.battlers[1]!];
    if (points[0] === points[1]) {
      await this.pbDisplay(_INTL("{1} tied the opponent\n{2} in a referee's decision!", b0.name, b1.name));
      // NOTE: Pokémon doesn't really lose HP, but the effect is mostly the
      //       same.
      b0.hp = 0;
      await b0.pbFaint(false);
      b1.hp = 0;
      await b1.pbFaint(false);
    } else if (points[0]! > points[1]!) {
      await this.pbDisplay(_INTL("{1} defeated the opponent\n{2} in a referee's decision!", b0.name, b1.name));
      b1.hp = 0;
      await b1.pbFaint(false);
    } else {
      await this.pbDisplay(_INTL("{1} lost to the opponent\n{2} in a referee's decision!", b0.name, b1.name));
      b0.hp = 0;
      await b0.pbFaint(false);
    }
    await this.pbGainExp();
    await this.pbEORSwitch();
  }
}

//===============================================================================
// Battle::AI
//===============================================================================
const battleArenaPbEnemyShouldWithdraw = AI.prototype.pbEnemyShouldWithdraw;
AI.prototype.pbEnemyShouldWithdraw = async function (this: AI, idxBattler: number): Promise<boolean> {
  if (!this.battleArena) return battleArenaPbEnemyShouldWithdraw.call(this, idxBattler);
  return false;
};

//===============================================================================
// Battle::Scene
//===============================================================================
const grey = () => new Color(72, 72, 72);
const light = () => new Color(208, 208, 200);

const sceneMethods = {
  /**
   * `n.times { |i| pbGraphicsUpdate; ... }`: n frames at the original 40 fps,
   * as 60 Hz ticks (each original frame runs the body once, after its update).
   */
  async forOriginalFrames(this: BattleScene, n: number, body: (i: number) => void): Promise<void> {
    const counter = new FrameCounter();
    for (let i = 0; i < n;) {
      await this.pbGraphicsUpdate();
      for (let k = counter.tick(); k > 0 && i < n; k--, i++) body(i);
    }
  },

  async pbBattleArenaUpdate(this: BattleScene): Promise<void> {
    await this.pbGraphicsUpdate();
  },

  updateJudgment(this: BattleScene, window: SpriteWindow_Base, phase: number, battler1: Battler, battler2: Battler,
    ratings1: number[], ratings2: number[]): void {
    let total1 = 0;
    let total2 = 0;
    for (let i = 0; i < phase; i++) {
      total1 += ratings1[i]!;
      total2 += ratings2[i]!;
    }
    const contents = window.contents!;
    contents.clear();
    pbSetSystemFont(contents);
    const textpos: TextPosition[] = [
      [battler1.name, 64, 6, 2, new Color(248, 0, 0), light()],
      [_INTL("VS"), 144, 6, 2, grey(), light()],
      [battler2.name, 224, 6, 2, grey(), light()],
      [_INTL("Mind"), 144, 54, 2, grey(), light()],
      [_INTL("Skill"), 144, 86, 2, grey(), light()],
      [_INTL("Body"), 144, 118, 2, grey(), light()],
      [String(total1), 64, 166, 2, grey(), light()],
      [_INTL("Judgment"), 144, 166, 2, grey(), light()],
      [String(total2), 224, 166, 2, grey(), light()],
    ];
    pbDrawTextPositions(contents, textpos);
    const images: ImagePosition[] = [];
    for (let i = 0; i < phase; i++) {
      const y = [48, 80, 112][i]!;
      let x = ratings1[i] === ratings2[i] ? 64 : ratings1[i]! > ratings2[i]! ? 0 : 32;
      images.push(["Graphics/Pictures/judgment", 64 - 16, y, x, 0, 32, 32]);
      x = ratings1[i] === ratings2[i] ? 64 : ratings1[i]! < ratings2[i]! ? 0 : 32;
      images.push(["Graphics/Pictures/judgment", 224 - 16, y, x, 0, 32, 32]);
    }
    pbDrawImagePositions(contents, images);
    contents.fillRect(16, 150, 256, 4, new Color(80, 80, 80));
  },

  async pbBattleArenaBattlers(this: BattleScene, battler1: Battler, battler2: Battler): Promise<void> {
    await pbMessage(_INTL("REFEREE: {1} VS {2}!\nCommence battling!\\wtnp[20]", battler1.name, battler2.name),
      null, 0, null, 0, () => this.pbBattleArenaUpdate());
  },

  async pbBattleArenaJudgment(this: BattleScene, battler1: Battler, battler2: Battler, ratings1: number[], ratings2: number[]): Promise<void> {
    await preloadBitmaps(["Graphics/Pictures/judgment"]);
    let msgwindow: ReturnType<typeof pbCreateMessageWindow> | null = null;
    let dimmingvp: Viewport | null = null;
    let infowindow: SpriteWindow_Base | null = null;
    const updates = (...extra: ({ update(): void } | null)[]) => async () => {
      await this.pbBattleArenaUpdate();
      for (const e of extra) e?.update();
    };
    try {
      msgwindow = pbCreateMessageWindow();
      dimmingvp = new Viewport(0, 0, Graphics.width, Graphics.height - msgwindow.height);
      await pbMessageDisplay(msgwindow,
        _INTL("REFEREE: That's it! We will now go to judging to determine the winner!\\wtnp[20]"), true, null,
        updates(dimmingvp));
      dimmingvp.z = 99999;
      infowindow = new SpriteWindow_Base(80, 0, 320, 224);
      infowindow.contents = new Bitmap(infowindow.width - infowindow.borderX, infowindow.height - infowindow.borderY);
      infowindow.z = 99999;
      infowindow.visible = false;
      const mw = msgwindow;
      const vp = dimmingvp;
      await this.forOriginalFrames(11, (i) => {
        this.pbInputUpdate();
        mw.update();
        vp.update();
        vp.color = new Color(0, 0, 0, Math.floor((i * 128) / 10));
      });
      sceneMethods.updateJudgment.call(this, infowindow, 0, battler1, battler2, ratings1, ratings2);
      infowindow.visible = true;
      const iw = infowindow;
      await this.forOriginalFrames(11, () => {
        this.pbInputUpdate();
        mw.update();
        vp.update();
        iw.update();
      });
      const show = async (phase: number, text: string) => {
        if (phase > 0) sceneMethods.updateJudgment.call(this, infowindow!, phase, battler1, battler2, ratings1, ratings2);
        await pbMessageDisplay(msgwindow, text, true, null, updates(dimmingvp, infowindow));
      };
      await show(1, _INTL("REFEREE: Judging category 1, Mind!\nThe Pokémon showing the most guts!\\wtnp[40]"));
      await show(2, _INTL("REFEREE: Judging category 2, Skill!\nThe Pokémon using moves the best!\\wtnp[40]"));
      await show(3, _INTL("REFEREE: Judging category 3, Body!\nThe Pokémon with the most vitality!\\wtnp[40]"));
      let total1 = 0;
      let total2 = 0;
      for (let i = 0; i < 3; i++) {
        total1 += ratings1[i]!;
        total2 += ratings2[i]!;
      }
      const battle = (this as unknown as { battle: Battle }).battle;
      if (total1 === total2) {
        await show(0, _INTL("REFEREE: Judgment: {1} to {2}!\nWe have a draw!\\wtnp[40]", total1, total2));
      } else if (total1 > total2) {
        await show(0, _INTL("REFEREE: Judgment: {1} to {2}!\nThe winner is {3}'s {4}!\\wtnp[40]",
          total1, total2, battle.pbGetOwnerName(battler1.index), battler1.name));
      } else {
        await show(0, _INTL("REFEREE: Judgment: {1} to {2}!\nThe winner is {3}!\\wtnp[40]", total1, total2, battler2.name));
      }
      infowindow.visible = false;
      msgwindow.visible = false;
      await this.forOriginalFrames(11, (i) => {
        this.pbInputUpdate();
        mw.update();
        vp.update();
        vp.color = new Color(0, 0, 0, Math.floor(((10 - i) * 128) / 10));
      });
    } finally {
      if (msgwindow) pbDisposeMessageWindow(msgwindow);
      dimmingvp?.dispose();
      infowindow?.contents?.dispose();
      infowindow?.dispose();
    }
  },
};

type SceneMethods = typeof sceneMethods;
declare module "../../battle/scene/BattleScene" {
  interface BattleScene extends SceneMethods {}
}
Object.assign(BattleScene.prototype, sceneMethods);
