// Port of Plugins/MQS/003_Quest_UI.rb (Window_Quest, QuestList_Scene,
// QuestList_Screen, pbViewQuests): the quest log, opened from the
// Pokégear's "Tasks" (Pokegear Changes.rb). Quest data and logic are in
// game/quests.ts. The fades count raw 40 fps frames (15.times { Graphics.update }).

import { pbPlayBuzzerSE, pbPlayCursorSE, pbPlayDecisionSE } from "../../game/GameSystem";
import { colorQuest, playerQuests, QuestData, SHOW_FAILED_QUESTS, SORT_QUESTS, type Quest } from "../../game/quests";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { drawFormattedTextEx, pbDrawImagePositions, pbDrawTextPositions, type TextPosition } from "../drawText";
import { pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbDoEnsureBitmap, pbSetSystemFont, pbUpdateSpriteHash } from "../messageConfig";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, eachFrame, type Sprites } from "../scenes/frames";
import { BitmapSprite, IconSprite } from "../SpriteWrapper";
import { Window_DrawableCommand } from "../windows/SpriteWindowText";

const UI = "Graphics/Pictures/QuestUI/";

//===============================================================================
// Class that creates the scrolling list of quest names
//===============================================================================
export class Window_Quest extends Window_DrawableCommand {
  private _quests: Quest[] = [];

  constructor(x: number, y: number, width: number, height: number, viewport: Viewport | null) {
    super(x, y, width, height, viewport);
    this.windowskin = null;
    this._selarrow = new AnimatedBitmap("Graphics/Pictures/selarrow");
  }

  get quests(): Quest[] { return this._quests; }
  set quests(value: Quest[]) {
    this._quests = value;
    this.refresh();
  }

  override itemCount(): number {
    return this._quests?.length ?? 0;
  }

  override drawItem(index: number, _count: number, rect: Rect): void {
    if (index >= this.topRow + this.pageItemMax) return;
    rect = new Rect(rect.x + 16, rect.y, rect.width - 16, rect.height);
    const quest = this._quests[index]!;
    let name = QuestData.getName(quest.id);
    if (quest.story) name = "<b>" + `${name}` + "</b>";
    const col = quest.color;
    drawFormattedTextEx(this.contents!, rect.x, rect.y + 2, 436, `<c2=${col}>${name}</c2>`, this.baseColor, this.shadowColor);
    if (quest.new) pbDrawImagePositions(this.contents!, [[`${UI}new`, rect.width - 16, rect.y + 4]]);
  }

  override refresh(): void {
    if (this._selarrow === undefined) return;
    this._itemMax = this.itemCount();
    const dwidth = this.width - this.borderX;
    const dheight = this.height - this.borderY;
    this.contents = pbDoEnsureBitmap(this.contents, dwidth, dheight);
    this.contents.clear();
    for (let i = 0; i < this._itemMax; i++) {
      if (i < this.topItem || i > this.topItem + this.pageItemMax) continue;
      this.drawItem(i, this._itemMax, this.itemRect(i));
    }
    if (this.itemCount() > 0) this.drawCursor(this.index, this.itemRect(this.index));
  }

  override update(): void {
    super.update();
    this._uparrow.visible = false;
    this._downarrow.visible = false;
  }
}

/** Time#strftime("%B %d %Y %H:%M") */
function formatQuestTime(iso: string): string {
  const t = new Date(iso);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${months[t.getMonth()]} ${p2(t.getDate())} ${t.getFullYear()} ${p2(t.getHours())}:${p2(t.getMinutes())}`;
}

//===============================================================================
// Class that controls the UI
//===============================================================================
export class QuestList_Scene {
  private viewport!: Viewport;
  private sprites: Sprites = {};
  private base = new Color(80, 80, 88);
  private shadow = new Color(160, 160, 168);
  private quests: Quest[][] = [];
  private questsText: string[] = [];
  private currentQuest = 0;

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites as never);
  }

  private s<T>(key: string): T { return this.sprites[key] as T; }

  async pbStartScene(): Promise<void> {
    await preloadBitmaps([`${UI}bg_1`, `${UI}bg_2`, `${UI}page_icon1a`, `${UI}page_icon1b`, `${UI}page_icon2`, `${UI}pageIcon`, `${UI}new`,
      "Graphics/Pictures/selarrow"]);
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    this.sprites = {};
    this.base = new Color(80, 80, 88);
    this.shadow = new Color(160, 160, 168);
    addBackgroundPlane(this.sprites, "bg", "QuestUI/bg_1", this.viewport);
    const baseSprite = new IconSprite(0, 0, this.viewport);
    baseSprite.setBitmapFile(`${UI}bg_2`);
    this.sprites.base = baseSprite;
    const pageIcon1 = new IconSprite(0, 4, this.viewport);
    pageIcon1.setBitmapFile(SHOW_FAILED_QUESTS ? `${UI}page_icon1a` : `${UI}page_icon1b`);
    pageIcon1.x = Graphics.width - pageIcon1.bitmap!.width - 10;
    this.sprites.page_icon1 = pageIcon1;
    const pageIcon2 = new IconSprite(0, 4, this.viewport);
    pageIcon2.setBitmapFile(`${UI}page_icon2`);
    pageIcon2.x = Graphics.width - pageIcon2.bitmap!.width - 10;
    pageIcon2.opacity = 0;
    this.sprites.page_icon2 = pageIcon2;
    const pageIcon = new IconSprite(pageIcon1.x, 4, this.viewport);
    pageIcon.setBitmapFile(`${UI}pageIcon`);
    this.sprites.pageIcon = pageIcon;
    const q = playerQuests();
    this.quests = [q.activeQuests, q.completedQuests];
    this.questsText = ["Active", "Completed"];
    if (SHOW_FAILED_QUESTS) {
      this.quests.push(q.failedQuests);
      this.questsText.push("Failed");
    }
    if (SORT_QUESTS) {
      // sort_by! { |x| [x.story ? 0 : 1, x.time] } (sorts the player's own lists)
      for (const s of this.quests) {
        s.sort((a, b) => (a.story ? 0 : 1) - (b.story ? 0 : 1) || (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      }
    }
    this.currentQuest = 0;
    const itemlist = new Window_Quest(22, 28, Graphics.width - 22, Graphics.height - 80, this.viewport);
    itemlist.index = 0;
    itemlist.baseColor = this.base;
    itemlist.shadowColor = this.shadow;
    itemlist.quests = this.quests[this.currentQuest]!;
    this.sprites.itemlist = itemlist;
    for (const key of ["overlay1", "overlay2", "overlay3", "overlay_control"]) {
      const o = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
      if (key === "overlay2" || key === "overlay3") o.opacity = 0;
      pbSetSystemFont(o.bitmap!);
      this.sprites[key] = o;
    }
    pbDrawTextPositions(this.s<BitmapSprite>("overlay1").bitmap!, [
      [_INTL("{1} tasks", this.questsText[this.currentQuest]), 6, 6, 0, new Color(248, 248, 248), new Color(0, 0, 0), true],
    ]);
    const control = this.s<BitmapSprite>("overlay_control").bitmap!;
    drawFormattedTextEx(control, 38, 320, 436, `<c2=${colorQuest("red")}>ARROWS:</c2> Navigate`, this.base, this.shadow);
    drawFormattedTextEx(control, 38, 352, 436, `<c2=${colorQuest("red")}>A/S:</c2> Jump Down/Up`, this.base, this.shadow);
    drawFormattedTextEx(control, 326, 320, 436, `<c2=${colorQuest("red")}>New Activity:</c2>`, this.base, this.shadow);
    pbDrawImagePositions(control, [[`${UI}new`, 464, 314]]);
    await pbFadeInAndShow(asHash(this.sprites), null, () => this.pbUpdate());
  }

  async pbScene(): Promise<void> {
    const itemlist = this.s<Window_Quest>("itemlist");
    for (;;) {
      const selected = itemlist.index;
      itemlist.active = true;
      let dorefresh = false;
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      } else if (Input.trigger(Input.USE)) {
        if (this.quests[this.currentQuest]!.length === 0) {
          pbPlayBuzzerSE();
        } else {
          pbPlayDecisionSE();
          await this.fadeContent();
          itemlist.active = false;
          await this.pbQuest(this.quests[this.currentQuest]![selected]!);
          await this.showContent();
        }
      } else if (Input.trigger(Input.RIGHT)) {
        pbPlayCursorSE();
        this.currentQuest += 1;
        if (this.currentQuest > this.quests.length - 1) this.currentQuest = 0;
        dorefresh = true;
      } else if (Input.trigger(Input.LEFT)) {
        pbPlayCursorSE();
        this.currentQuest -= 1;
        if (this.currentQuest < 0) this.currentQuest = this.quests.length - 1;
        dorefresh = true;
      }
      if (dorefresh) this.swapQuestType();
    }
  }

  swapQuestType(): void {
    const overlay1 = this.s<BitmapSprite>("overlay1");
    overlay1.bitmap!.clear();
    const itemlist = this.s<Window_Quest>("itemlist");
    itemlist.index = 0; // Resets cursor position
    itemlist.quests = this.quests[this.currentQuest]!;
    this.s<IconSprite>("pageIcon").x = this.s<IconSprite>("page_icon1").x + 32 * this.currentQuest;
    pbDrawTextPositions(overlay1.bitmap!, [
      [_INTL("{1} tasks", this.questsText[this.currentQuest]), 6, 6, 0, new Color(248, 248, 248), new Color(0, 0, 0), true],
    ]);
  }

  private fadeSprites(delta: number): void {
    const itemlist = this.s<Window_Quest>("itemlist");
    itemlist.contentsOpacity += delta;
    for (const key of ["overlay1", "overlay_control", "page_icon1", "pageIcon"]) {
      const s = this.s<IconSprite>(key);
      s.opacity = Math.min(255, Math.max(0, s.opacity + delta));
    }
  }

  async fadeContent(): Promise<void> {
    await eachFrame(15, () => this.fadeSprites(-17));
  }

  async showContent(): Promise<void> {
    await eachFrame(15, () => this.fadeSprites(17));
  }

  private fadeDetail(delta: number): void {
    for (const key of ["overlay2", "overlay3", "page_icon2"]) {
      const s = this.s<IconSprite>(key);
      s.opacity = Math.min(255, Math.max(0, s.opacity + delta));
    }
  }

  async pbQuest(quest: Quest): Promise<void> {
    quest.new = false;
    this.drawQuestDesc(quest);
    await eachFrame(15, () => this.fadeDetail(17));
    let page = 1;
    const pageIcon2 = this.s<IconSprite>("page_icon2");
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.RIGHT) && page === 1) {
        pbPlayCursorSE();
        page += 1;
        pageIcon2.mirror = true;
        this.drawOtherInfo(quest);
      } else if (Input.trigger(Input.LEFT) && page === 2) {
        pbPlayCursorSE();
        page -= 1;
        pageIcon2.mirror = false;
        this.drawQuestDesc(quest);
      } else if (Input.trigger(Input.BACK)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
    await eachFrame(15, () => this.fadeDetail(-17));
    pageIcon2.mirror = false;
    this.s<Window_Quest>("itemlist").refresh();
  }

  drawQuestDesc(quest: Quest): void {
    const overlay2 = this.s<BitmapSprite>("overlay2").bitmap!;
    const overlay3 = this.s<BitmapSprite>("overlay3").bitmap!;
    overlay2.clear();
    overlay3.clear();
    // Quest name
    const questName = QuestData.getName(quest.id);
    pbDrawTextPositions(overlay2, [[`${questName}`, 6, 6, 0, new Color(248, 248, 248), new Color(0, 0, 0), true]]);
    // Quest description
    const questDesc = `<c2=${colorQuest("blue")}>Overview:</c2> ${QuestData.getQuestDescription(quest.id)}`;
    drawFormattedTextEx(overlay3, 38, 52, 436, questDesc, this.base, this.shadow);
    // Stage description
    const questStageDesc = QuestData.getStageDescription(quest.id, quest.stage);
    // Stage location; if 'nil' or missing, set to '???'
    let questStageLocation = QuestData.getStageLocation(quest.id, quest.stage);
    if (questStageLocation === "nil" || questStageLocation === "") questStageLocation = "???";
    drawFormattedTextEx(overlay3, 38, 320, 436, `<c2=${colorQuest("orange")}>Task:</c2> ${questStageDesc}`, this.base, this.shadow);
    drawFormattedTextEx(overlay3, 38, 352, 436, `<c2=${colorQuest("purple")}>Location:</c2> ${questStageLocation}`, this.base, this.shadow);
  }

  drawOtherInfo(quest: Quest): void {
    const overlay3 = this.s<BitmapSprite>("overlay3").bitmap!;
    overlay3.clear();
    // Quest giver; if 'nil' or missing, set to '???'
    let questGiver = QuestData.getQuestGiver(quest.id);
    if (questGiver === "nil" || questGiver === "") questGiver = "???";
    // Total number of stages for quest
    const questLength = QuestData.getMaxStagesForQuest(quest.id);
    // Map quest was originally started
    const originalMap = quest.location;
    // Vary text according to map name
    const loc = originalMap.includes("Route") ? "on" : "in";
    // Format time
    const time = formatQuestTime(quest.time);
    const q = playerQuests();
    const activeQuests = q.activeQuests.map((x) => x.id);
    let timeText: string;
    if (activeQuests.includes(quest.id)) timeText = "start";
    else if (q.completedQuests.some((x) => x.id === quest.id)) timeText = "completion";
    else timeText = "failure";
    // Quest reward
    let questReward = QuestData.getQuestReward(quest.id);
    if (questReward === "nil" || questReward === "" || activeQuests.includes(quest.id)) questReward = "???";
    const textpos: TextPosition[] = [
      [`Stage ${quest.stage}/${questLength}`, 38, 50, 0, this.base, this.shadow],
      [`${questGiver}`, 38, 122, 0, this.base, this.shadow],
      [`${originalMap}`, 38, 194, 0, this.base, this.shadow],
      [`${time}`, 38, 266, 0, this.base, this.shadow],
    ];
    drawFormattedTextEx(overlay3, 38, 92, 436, `<c2=${colorQuest("cyan")}>Quest received from:</c2>`, this.base, this.shadow);
    drawFormattedTextEx(overlay3, 38, 164, 436, `<c2=${colorQuest("magenta")}>Quest discovered ${loc}:</c2>`, this.base, this.shadow);
    drawFormattedTextEx(overlay3, 38, 236, 436, `<c2=${colorQuest("green")}>Quest ${timeText} time:</c2>`, this.base, this.shadow);
    drawFormattedTextEx(overlay3, 38, Graphics.height - 64, 436, `<c2=${colorQuest("red")}>Reward:</c2> ${questReward}`, this.base, this.shadow);
    pbDrawTextPositions(overlay3, textpos);
  }

  async pbEndScene(): Promise<void> {
    await pbFadeOutAndHide(asHash(this.sprites), () => this.pbUpdate());
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

//===============================================================================
// Class to call UI
//===============================================================================
export class QuestList_Screen {
  constructor(private scene: QuestList_Scene) {}

  async pbStartScreen(): Promise<void> {
    await this.scene.pbStartScene();
    await this.scene.pbScene();
    await this.scene.pbEndScene();
  }
}

/** Utility method for calling UI */
export async function pbViewQuests(): Promise<void> {
  const scene = new QuestList_Scene();
  const screen = new QuestList_Screen(scene);
  await screen.pbStartScreen();
}
