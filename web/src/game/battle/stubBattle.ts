// STUB battle, used until the battle core (web/src/battle) is wired into
// battleFactory (BattleStarting.ts). It has the fields prepare_battle sets,
// shows who the foes are for a moment (or until USE is pressed) and returns a
// win. Not part of Essentials.

import type { Id } from "../../data/gameData/gameData";
import { Bitmap } from "../../rgss/Bitmap";
import { Sprite, Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color } from "../../rgss/types";
import { pbSetSystemFont } from "../../ui/messageConfig";
import type { Pokemon } from "../pokemon/Pokemon";
import type { NPCTrainer, Trainer } from "../trainer/Trainer";
import type { BattleLike } from "./BattleStarting";

export function createStubBattle(_scene: unknown, playerParty: Pokemon[], foeParty: Pokemon[], _playerTrainers: Trainer[], foeTrainers: NPCTrainer[] | null): BattleLike {
  const battle: BattleLike & { mode: string } = {
    mode: "single",
    canLose: false,
    canRun: true,
    rules: {},
    expGain: true,
    moneyGain: true,
    disablePokeBalls: false,
    sendToBoxes: 1,
    switchStyle: true,
    showAnims: true,
    defaultTerrain: null as Id | null,
    defaultWeather: null as Id | null,
    environment: "None",
    backdrop: "",
    backdropBase: null,
    time: 0,
    party1starts: [0],
    party2starts: [0],
    allyItems: [],
    items: null,
    setBattleMode(mode: string) {
      battle.mode = mode;
    },
    singleBattle() {
      return battle.mode === "single" || battle.mode === "1v1";
    },
    async pbStartBattle(): Promise<number> {
      const foes = foeTrainers?.length
        ? foeTrainers.map((t) => `${t.fullName()}`).join(" & ")
        : foeParty.map((p) => `${p.speciesData().species}${p.shiny ? " (shiny)" : ""} Lv. ${p.level}`).join(" & ");
      console.info(`[stub battle] ${foes} vs ${playerParty.map((p) => p.speciesData().species).join(", ")} -> win (1)`);
      const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
      viewport.z = 100000;
      const bitmap = new Bitmap(Graphics.width, Graphics.height);
      bitmap.fillRect(0, 0, Graphics.width, Graphics.height, new Color(24, 24, 40));
      pbSetSystemFont(bitmap);
      bitmap.font.color = new Color(248, 248, 248);
      bitmap.drawText(0, 120, Graphics.width, 32, "STUB BATTLE (battle core not wired)", 1);
      bitmap.drawText(0, 168, Graphics.width, 32, `${foeTrainers?.length ? "Trainer" : "Wild"}: ${foes}`, 1);
      bitmap.drawText(0, 216, Graphics.width, 32, `Backdrop: ${battle.backdrop} / ${battle.backdropBase ?? "-"}, env ${battle.environment}`, 1);
      bitmap.drawText(0, 264, Graphics.width, 32, "Outcome: win", 1);
      const sprite = new Sprite(viewport);
      sprite.setBitmap(bitmap);
      for (let i = 0; i < Math.round(2 / Graphics.deltaS); i++) {
        await Graphics.update();
        Input.update();
        if (i > 10 && Input.trigger(Input.USE)) break;
      }
      sprite.dispose();
      bitmap.dispose();
      viewport.dispose();
      return 1;
    },
  };
  return battle;
}
