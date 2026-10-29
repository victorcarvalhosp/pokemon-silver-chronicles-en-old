// Port of Plugins/MQS (Modular Quest System) 001_Quest_Config.rb and
// 002_Quest_Main.rb. Quest definitions come from data/quests.json (the
// converter evaluates 004_Quest_Data.rb). The quest log UI is a separate scene.

import { G } from "./globals";
import { messages } from "./messageBridge";
import { defineScript } from "./scriptApi";
import { pbGetMapNameFromId } from "../ui/planes";

export const SHOW_FAILED_QUESTS = true;
export const QUEST_JINGLE = "Mining found all.ogg";
export const QUEST_FAIL = "GUI sel buzzer.ogg";
export const SORT_QUESTS = true;

export function colorQuest(color: string | null | undefined): string {
  const c = color?.toLowerCase();
  switch (c) {
    case "blue": return "7DC076EF";
    case "red": return "089D5EBF";
    case "green": return "26CC4B56";
    case "cyan": return "6F697395";
    case "magenta": return "5CFA729D";
    case "yellow": return "135D47BF";
    case "gray": return "56946F5A";
    case "white": return "7FDE6B39";
    case "purple": return "751272B7";
    case "orange": return "0E7F4F3F";
  }
  return "2D4A5694"; // the default dark gray
}

type QuestDef = Record<string, string>;
let questDefs: Record<string, QuestDef> = {};

export async function loadQuestData(): Promise<void> {
  questDefs = (await (await fetch("/data/quests.json")).json()) as Record<string, QuestDef>;
}

export interface Quest {
  id: string;
  stage: number;
  /** Time.now when started/updated, as an ISO string. */
  time: string;
  location: string;
  new: boolean;
  color: string | null;
  story: boolean;
}

function newQuest(id: string, color: string | null, story: boolean): Quest {
  return { id, stage: 1, time: new Date().toISOString(), location: pbGetMapNameFromId(G.gameMap?.mapId ?? 0), new: true, color, story };
}

/** Quest#stage=, capped at the quest's stage count. */
function setStage(q: Quest, value: number): void {
  q.stage = Math.min(value, QuestData.getMaxStagesForQuest(q.id));
}

const msg = (text: string) => messages().pbMessage(text);

export class Player_Quests {
  activeQuests: Quest[] = [];
  completedQuests: Quest[] = [];
  failedQuests: Quest[] = [];
  selectedQuestId = 0;

  async activateQuest(quest: string, color: string | null, story: boolean): Promise<void> {
    if (this.activeQuests.some((q) => q.id === quest)) return void (await msg("You have already started this quest."));
    if (this.completedQuests.some((q) => q.id === quest)) return void (await msg("You have already completed this quest."));
    if (this.failedQuests.some((q) => q.id === quest)) return void (await msg("You have already failed this quest."));
    this.activeQuests.push(newQuest(quest, color, story));
    await msg(`\\se[${QUEST_JINGLE}]<ac><c2=${colorQuest("red")}>New task added!</c2>\nCheck your task log for more details!</ac>`);
  }

  async failQuest(quest: string, color: string | null, story: boolean): Promise<void> {
    if (this.completedQuests.some((q) => q.id === quest)) return void (await msg("You have already completed this task."));
    if (this.failedQuests.some((q) => q.id === quest)) return void (await msg("You have already failed this task."));
    const i = this.activeQuests.findIndex((q) => q.id === quest);
    if (i >= 0) {
      const q = this.activeQuests[i]!;
      if (color != null) q.color = color;
      q.new = true; // makes the "!" icon appear when the quest updates
      q.time = new Date().toISOString();
      this.failedQuests.push(q);
      this.activeQuests.splice(i, 1);
      await msg(`\\se[${QUEST_FAIL}]<ac><c2=${colorQuest("red")}>Task failed!</c2>\nYour task log has been updated!</ac>`);
    } else {
      this.failedQuests.push(newQuest(quest, color ?? colorQuest(null), story));
    }
  }

  async completeQuest(quest: string, color: string | null, story: boolean): Promise<void> {
    if (this.completedQuests.some((q) => q.id === quest)) return void (await msg("You have already completed this task."));
    if (this.failedQuests.some((q) => q.id === quest)) return void (await msg("You have already failed this task."));
    const i = this.activeQuests.findIndex((q) => q.id === quest);
    if (i >= 0) {
      const q = this.activeQuests[i]!;
      if (color != null) q.color = color;
      q.new = true;
      q.time = new Date().toISOString();
      this.completedQuests.push(q);
      this.activeQuests.splice(i, 1);
      await msg(`\\se[${QUEST_JINGLE}]<ac><c2=${colorQuest("red")}>Task completed!</c2>\nYour task log has been updated!</ac>`);
    } else {
      this.completedQuests.push(newQuest(quest, color ?? colorQuest(null), story));
    }
  }

  async advanceQuestToStage(quest: string, stageNum: number, color: string | null, story: boolean): Promise<void> {
    const active = this.activeQuests.find((q) => q.id === quest);
    if (active) {
      setStage(active, stageNum);
      if (color != null) active.color = color;
      active.new = true;
      await msg(`\\se[${QUEST_JINGLE}]<ac><c2=${colorQuest("red")}>New task added!</c2>\nYour task log has been updated!</ac>`);
      return;
    }
    const q = newQuest(quest, color ?? colorQuest(null), story);
    setStage(q, stageNum);
    this.activeQuests.push(q);
  }
}

/** $PokemonGlobal.quests (created on demand, and re-wrapped after loading a save). */
export function playerQuests(): Player_Quests {
  const g = G.pokemonGlobal as unknown as { quests?: Player_Quests };
  if (!(g.quests instanceof Player_Quests)) g.quests = Object.assign(new Player_Quests(), g.quests ?? {});
  return g.quests;
}

export const QuestData = {
  processTextCodes(text: string | undefined): string {
    if (!text) return "";
    return String(text).replace(/\\v\[([0-9]+)\]/gi, (_, n: string) => String(G.gameVariables.get(Number(n))));
  },
  def(quest: string): QuestDef {
    const d = questDefs[quest];
    if (!d) throw new Error(`uninitialized constant QuestModule::${quest}`);
    return d;
  },
  getID: (q: string) => `${QuestData.def(q).ID ?? ""}`,
  getName: (q: string) => QuestData.processTextCodes(QuestData.def(q).Name),
  getQuestGiver: (q: string) => QuestData.processTextCodes(QuestData.def(q).QuestGiver),
  getQuestStages: (q: string) => Object.keys(QuestData.def(q)).filter((k) => k.includes("Stage")),
  getQuestReward: (q: string) => QuestData.processTextCodes(QuestData.def(q).RewardString),
  getQuestDescription: (q: string) => QuestData.processTextCodes(QuestData.def(q).QuestDescription),
  getStageLocation: (q: string, s: number) => QuestData.processTextCodes(QuestData.def(q)[`Location${s}`]),
  getStageDescription: (q: string, s: number) => QuestData.processTextCodes(QuestData.def(q)[`Stage${s}`]),
  getStageLabel: (q: string, s: number) => QuestData.processTextCodes(QuestData.def(q)[`StageLabel${s}`]),
  /** Counts every key containing "Stage" (StageLabel keys too, as MQS does). */
  getMaxStagesForQuest: (q: string) => QuestData.getQuestStages(q).length,
};

export function hasAnyQuests(): boolean {
  const q = playerQuests();
  return q.activeQuests.length > 0 || q.completedQuests.length > 0 || q.failedQuests.length > 0;
}

export function getCurrentStage(quest: string): number | null {
  return playerQuests().activeQuests.find((q) => q.id === quest)?.stage ?? null;
}

defineScript("activateQuest", (_c, quest, color, story) => playerQuests().activateQuest(String(quest), (color as string | undefined) ?? colorQuest(null), !!story));
defineScript("completeQuest", (_c, quest, color, story) => playerQuests().completeQuest(String(quest), (color as string | null) ?? null, !!story));
defineScript("failQuest", (_c, quest, color, story) => playerQuests().failQuest(String(quest), (color as string | null) ?? null, !!story));
defineScript("advanceQuestToStage", (_c, quest, stage, color, story) => playerQuests().advanceQuestToStage(String(quest), Number(stage), (color as string | null) ?? null, !!story));
defineScript("getActiveQuests", () => playerQuests().activeQuests.map((q) => q.id));
defineScript("getCompletedQuests", () => playerQuests().completedQuests.map((q) => q.id));
defineScript("getFailedQuests", () => playerQuests().failedQuests.map((q) => q.id));
defineScript("hasAnyQuests?", () => hasAnyQuests());
defineScript("getCurrentStage", (_c, quest) => getCurrentStage(String(quest)));
defineScript("taskCompleteJingle", () => msg(`\\se[${QUEST_JINGLE}]<ac><c2=${colorQuest("red")}>Task completed!</c2>\nYour task log has been updated!</ac>`));
defineScript("colorQuest", (_c, color) => colorQuest(color as string | null));
