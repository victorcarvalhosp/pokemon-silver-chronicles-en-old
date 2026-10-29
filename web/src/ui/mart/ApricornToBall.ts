// Port of Plugins/Apricorn To Ball/Apricorn To Ball Script.rb: Kurt turns
// Apricorns into Poké Balls (apricornToBall, KurtEventPage). This game's
// version picks the Apricorn and how many from the filtered Bag ("Kurt
// multiple apricorn selection") and makes the speech bubble point at Kurt's
// event (KURT_EVENT_ID). The waiting time is real time (Time.now in Ruby);
// $player.next_run is kept as epoch milliseconds.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { G } from "../../game/globals";
import { pbReceiveItem } from "../../game/items/itemUtilities";
import type { PokemonBag } from "../../game/items/PokemonBag";
import type { Player } from "../../game/trainer/Player";
import { defineScript } from "../../game/scriptApi";
import { PokemonBag_Scene } from "../bag/bag";
import { pbFadeOutIn } from "../fades";
import { _INTL } from "../messageConfig";
import { pbConfirmMessage, pbMessage } from "../messages";

export const ApricornSettings = {
  /** Setting for how long it takes to change the Apricorn into selected Ball (hours). */
  APRICORN_TO_BALL_TIME: 1,
  /** Event ID of the Kurt NPC on the map (for speech bubbles). Must match the event that calls apricornToBall. */
  KURT_EVENT_ID: 4,
};

const player = () => G.player as unknown as Player;
const bag = () => G.bag as PokemonBag;

/** Time.now, as epoch milliseconds (replaceable by the tests). */
export const KurtClock = { now: (): number => Date.now() };

/** @@newRun (a class variable: lives for the session, not the save). */
let newRun: number | null = null;

export class KurtEventPage {
  private conversionHash: Record<string, Id>;

  // ==========  Messages for easy modification ========== //
  /** Initial Greeting / Greeting for Apricorn to Ball. */
  async greet(): Promise<boolean> {
    // Message codes: \f[path] = face graphic (under Graphics/Pictures/); \^ = wait for button; \pn = player name
    this.kurtBub();
    await pbMessage(_INTL("\\f[faceKurt]\\bHi, \\pn!"));
    this.kurtBub();
    await pbMessage(_INTL("\\f[faceKurt]\\bIf you like, I can convert one of yours Apricorns into a Poké Ball."));
    this.kurtBub();
    if (!(await pbConfirmMessage(_INTL("\\f[faceKurt]\\bDo you have an Apricorn for me?")))) return false;
    this.kurtBub();
    await pbMessage(_INTL("\\f[faceKurt]\\bWhich Apricorn would you like me to convert?"));
    return true;
  }

  /** Message for coming back when Ball isn't done yet. */
  async stillMaking(count = 1): Promise<void> {
    if (count > 1) {
      this.kurtBub();
      await pbMessage(_INTL("\\f[faceKurt]\\bSorry, I'm still making them."));
    } else {
      this.kurtBub();
      await pbMessage(_INTL("\\f[faceKurt]\\bSorry, I'm still making it."));
    }
    this.kurtBub();
    await pbMessage(_INTL("\\f[faceKurt]\\bCome back later."));
  }

  /** Message for coming back after Ball is finished. */
  async ballDone(count = 1): Promise<void> {
    this.kurtBub();
    await pbMessage(_INTL("\\f[faceKurt]\\bI've been waiting for you."));
    if (count > 1) {
      this.kurtBub();
      await pbMessage(_INTL("\\f[faceKurt]\\bI've completed the Poke Balls you asked me to make."));
    } else {
      this.kurtBub();
      await pbMessage(_INTL("\\f[faceKurt]\\bI've completed the Poke Ball you asked me to make."));
    }
  }

  async noThanks(): Promise<void> {
    this.kurtBub();
    await pbMessage(_INTL("\\f[faceKurt]\\bLet me know when you want me to convert an Apricorn for you."));
  }
  // ==========  End Messages ========== //

  constructor() {
    if (newRun == null) newRun = KurtClock.now();
    const p = player();
    if (p.ballForApricorn == null) p.ballForApricorn = null;
    if (p.ballForApricornCount == null) p.ballForApricornCount = 1;
    if (p.nextRun == null) p.nextRun = 0;
    this.conversionHash = {
      REDAPRICORN: "LEVELBALL",
      YELLOWAPRICORN: "MOONBALL",
      BLUEAPRICORN: "LUREBALL",
      GREENAPRICORN: "FRIENDBALL",
      PINKAPRICORN: "LOVEBALL",
      WHITEAPRICORN: "FASTBALL",
      BLACKAPRICORN: "HEAVYBALL",
      YLWAPRICORN: "MOONBALL",
      BLUAPRICORN: "LUREBALL",
      GRNAPRICORN: "FRIENDBALL",
      PNKAPRICORN: "LOVEBALL",
      WHTAPRICORN: "FASTBALL",
      BLKAPRICORN: "HEAVYBALL",
    };
  }

  async call(): Promise<void> {
    const p = player();
    const timeNow = KurtClock.now();
    const apricornToBallTime = ApricornSettings.APRICORN_TO_BALL_TIME;
    // ($player.next_run ||= ... never applies: initialize already set it to 0.)
    if (p.nextRun == null) p.nextRun = newRun! + apricornToBallTime * 60 * 60 * 1000;
    const nextRun = p.nextRun as number;
    if (p.ballForApricorn && timeNow >= nextRun) { // Ball is set and done.
      const count = p.ballForApricornCount || 1;
      await this.ballDone(count);
      await pbReceiveItem(p.ballForApricorn, count);
      p.ballForApricorn = null;
      p.ballForApricornCount = null;
      newRun = 0;
    } else if (p.ballForApricorn && timeNow <= nextRun) { // Ball is set and not done.
      const count = p.ballForApricornCount || 1;
      await this.stillMaking(count);
      const timeLeft = (nextRun - timeNow) / 1000;
      const formattedTimeLeft = this.formatTime(timeLeft);
      const ballName = Item.get(p.ballForApricorn).name;
      const ballNamePlural = Item.get(p.ballForApricorn).namePlural;
      if (count > 1) {
        this.kurtBub();
        await pbMessage(_INTL("\\f[faceKurt]\\bThere's still {1} left before your {2} are ready!", formattedTimeLeft, ballNamePlural));
      } else {
        this.kurtBub();
        await pbMessage(_INTL("\\f[faceKurt]\\bThere's still {1} left before your {2} is ready!", formattedTimeLeft, ballName));
      }
    } else if (await this.greet()) { // Ball is not set.
      await this.convertApricorn();
      if (p.ballForApricorn) {
        newRun = KurtClock.now();
        const resetTime = apricornToBallTime * 60 * 60 * 1000;
        p.nextRun = newRun + resetTime;
      } else {
        await this.noThanks();
      }
    } else {
      await this.noThanks();
    }
  }

  /**
   * Sets Carmaniac's Speech Bubble to show the next message on Kurt's event.
   * pbCallBub only works when run from the event (it uses get_character from the interpreter);
   * from script we set the same $game_temp vars using KURT_EVENT_ID directly.
   */
  private kurtBub(type = 2, position = 0): void {
    const t = G.gameTemp;
    t.speechbubbleFollowerEvent = null;
    t.speechbubbleTalking = ApricornSettings.KURT_EVENT_ID;
    t.speechbubbleBubble = type;
    t.speechbubblePosition = position;
  }

  formatTime(seconds: number): string {
    // Float#divmod: [floor quotient, remainder]
    const hours = Math.floor(seconds / 3600);
    const remainder = seconds - hours * 3600;
    const minutes = Math.floor(remainder / 60);
    const secs = Math.trunc(remainder - minutes * 60);
    const formatted: string[] = [];
    if (hours > 0) formatted.push(`${hours} hour(s)`);
    if (minutes > 0) formatted.push(`${minutes} minute(s)`);
    if (secs > 0) formatted.push(`${secs} second(s)`);
    return formatted.join(" ");
  }

  /**
   * Opens the bag filtered to apricorns; when the player selects an apricorn,
   * asks for quantity in the same bag UI, then returns [item, quantity] or [nil, 1].
   * Uses only the Scene (with filter) so the bag is never reopened unfiltered.
   */
  async chooseApricornAndQuantity(): Promise<[Id | null, number]> {
    let retItem: Id | null = null;
    let retQty = 1;
    const apricornFilter = (item: Id) => Item.get(item).isApricorn();
    const oldlastpocket = bag().lastViewedPocket;
    const oldchoices = [...bag().lastPocketSelections];
    bag().resetLastSelections();
    await pbFadeOutIn(async () => {
      const scene = new PokemonBag_Scene();
      await scene.pbStartScene(bag(), true, apricornFilter);
      const item = await scene.pbChooseItem();
      if (item) {
        let qty = bag().quantity(item);
        if (qty > 1) qty = await scene.pbChooseNumber(_INTL("How many do you want to convert?"), qty);
        if (qty > 0) {
          retItem = item;
          retQty = qty;
        }
      }
      await scene.pbEndScene();
    });
    bag().lastViewedPocket = oldlastpocket;
    bag().lastPocketSelections = oldchoices;
    G.gameVariables.set(8, retItem || "NONE");
    return [retItem, retQty];
  }

  async convertApricorn(): Promise<void> {
    const [apricorn, qty] = await this.chooseApricornAndQuantity();
    let quantity = qty;
    if (!apricorn || G.gameVariables.get(8) === "NONE") return;
    const aprBall = this.conversionHash[apricorn]!;
    const apricornData = Item.get(apricorn);
    const aprBallData = Item.get(aprBall);
    const ret = await pbConfirmMessage(_INTL(`\\f[faceKurt]\\bDo you want to turn your ${apricornData.name} into a ${aprBallData.name}?`));
    if (ret) {
      const maxQty = bag().quantity(apricorn);
      if (maxQty <= 0) {
        await pbMessage(_INTL("You don't have any left."));
        return;
      }
      if (quantity > maxQty) quantity = maxQty;
      const p = player();
      p.ballForApricornCount = quantity;
      p.ballForApricorn = aprBall;
      bag().remove(apricorn, quantity);
      if (quantity > 1) {
        await pbMessage(_INTL("\\f[faceKurt]\\bOkay. I'll turn your {1} {2} into {1} {3} for you.",
          quantity, apricornData.namePlural, aprBallData.namePlural));
      } else {
        await pbMessage(_INTL(`\\f[faceKurt]\\bOkay. I'll turn your ${apricornData.name} into a ${aprBallData.name} for you.`));
      }
      await pbMessage(_INTL("\\f[faceKurt]\\bI should be finished very soon."));
    }
  }
}

/** apricornToBall */
export async function apricornToBall(): Promise<void> {
  const apricornGuy = new KurtEventPage();
  await apricornGuy.call();
}

/** For the tests: forgets @@newRun, as a new session would. */
export function resetKurtSession(): void {
  newRun = null;
}

defineScript("apricornToBall", () => apricornToBall());
