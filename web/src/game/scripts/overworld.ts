// Essentials functions that event scripts call, registered under their Ruby
// names. Plugin features that aren't ported yet are registered as explicit
// no-ops with a TODO, so they're easy to find and the events keep running.

import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Tone } from "../../rgss/types";
import type { GamePlayer } from "../GamePlayer";
import { G, pbUpdateSceneMap } from "../globals";
import { messages } from "../messageBridge";
import { playerMetadata } from "../metadata";
import type { Player } from "../Player";
import { defineScript } from "../scriptApi";
import { PBDayNight, pbGetTimeNow, pbIsWeekday } from "../dayNight";

const player = () => G.player as unknown as Player;
const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;

/** pbChangePlayer (019_Utilities/001_Utilities.rb) */
export function pbChangePlayer(id: number): boolean {
  if (id < 1 || !playerMetadata(id)) return false;
  player().characterID = id;
  return true;
}
defineScript("pbChangePlayer", (_c, id) => pbChangePlayer(Number(id)));

/** pbWait(frames) (012_Overworld): frames at the game's frame rate; takes Essentials frames (1/20 s at call sites). */
export async function pbWaitSeconds(seconds: number): Promise<void> {
  const end = Graphics.frameCount + Math.round(seconds * 60);
  while (Graphics.frameCount < end) {
    await Graphics.update();
    Input.update();
    await pbUpdateSceneMap();
  }
}

/** pbToneChangeAll(tone, duration) (001_Game_Screen.rb): duration in 1/20 s. */
defineScript("pbToneChangeAll", (_c, tone, duration) => {
  const seconds = Number(duration) / 20;
  G.gameScreen.startToneChange(tone as Tone, seconds);
  for (const p of G.gameScreen.pictures) p.startToneChange(tone as Tone, seconds);
});
defineScript("pbShake", (_c, power, speed, frames) => G.gameScreen.startShake(Number(power), Number(speed), Number(frames) / 20));
defineScript("pbFlash", (_c, color, frames) => G.gameScreen.startFlash(color as never, Number(frames) / 20));

// --- BW Gender Selector (Plugins/BW Gender Selector) ---------------------------
// TEMPORARY stand-in until the plugin's scene is ported (M3): a Boy/Girl
// choice that sets the same switches and player character.
const BOY_SELECTED_SWITCH = 140;
const GIRL_SELECTED_SWITCH = 141;
defineScript("pbGenderSelector", async () => {
  const choice = await messages().pbMessage("Are you a boy or a girl?", ["Boy", "Girl"], 0);
  const boy = choice === 0;
  pbChangePlayer(boy ? 1 : 2);
  G.gameSwitches.set(BOY_SELECTED_SWITCH, boy);
  G.gameSwitches.set(GIRL_SELECTED_SWITCH, !boy);
  (G.gameMap as unknown as { needRefresh: boolean }).needRefresh = true;
});

// --- Following Pokémon EX / Followers (plugins) --------------------------------
// TODO(followers): port Following Pokémon EX; these keep events running meanwhile.
for (const name of [
  "Followers.follow_into_door", "Followers.hide_followers", "Followers.put_followers_on_player",
  "FollowingPkmn.toggle", "FollowingPkmn.move_route", "pbCallBubFollower",
]) defineScript(name, () => null);
defineScript("follower_move_route", () => null);
defineScript("pbMapInterpreter.follower_move_route", () => null);

// --- Scenes not ported yet (M3) ----------------------------------------------
const todo = (name: string, milestone: string) =>
  defineScript(name, () => {
    console.warn(`${name} isn't ported yet (${milestone})`);
    return null;
  });
todo("pbEventScreen", "M3: Controls help scene");
todo("pbTrainerPC", "M3: PC");
todo("pbWardrobe", "M3: TC Wardrobe plugin");
todo("pbGetKeyItem", "M3: key item get scene");
todo("pbPhoneRegisterNPC", "M3: phone");
todo("pbUnlockOutfit", "M3: TC Wardrobe plugin");
todo("Pokemon.play_cry", "M4: cries");

void gamePlayer;

// --- Time (012_Overworld/003_Overworld_Time.rb) -------------------------------
defineScript("pbGetTimeNow", () => pbGetTimeNow());
defineScript("pbIsWeekday", (_c, v, ...days) => pbIsWeekday(Number(v), ...days.map(Number)));
defineScript("PBDayNight.isDay?", (_c, t) => PBDayNight.isDay(t as Date | undefined));
defineScript("PBDayNight.isNight?", (_c, t) => PBDayNight.isNight(t as Date | undefined));
defineScript("PBDayNight.isMorning?", (_c, t) => PBDayNight.isMorning(t as Date | undefined));
defineScript("PBDayNight.isAfternoon?", (_c, t) => PBDayNight.isAfternoon(t as Date | undefined));
defineScript("PBDayNight.isEvening?", (_c, t) => PBDayNight.isEvening(t as Date | undefined));
// Script switches 25-30: features that arrive later; false until then.
for (const name of ["pbInSafari?", "pbBugContestUndecided?", "pbBugContestDecided?", "pbInChallenge?"]) defineScript(name, () => false);
defineScript("pbNextMysteryGiftID", () => 0);
