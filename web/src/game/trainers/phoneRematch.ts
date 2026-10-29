// The trainer rematch side of 013_Items/004_Item_Phone.rb that trainer events
// use after a battle: pbPhoneRegisterBattle (:42), pbRandomPhoneTrainer (:68)
// and the :phone_call_counter frame handler (:149), which counts down to each
// contact's rematch (flipping its event to self switch B) and to random calls.
// The data helpers and the call itself are in ui/pokegear/phone.ts.

import { TrainerType } from "../../data/gameData/trainerType";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { rand } from "../../core/random";
import { _INTL } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import {
  pbPhoneCall, pbPhoneGenerateCall, pbPhoneIncrement, pbPhoneRegister, pbSetReadyToBattle, phoneNumbers, type PhoneNumber,
} from "../../ui/pokegear/phone";
import { PokemonGlobalExtras } from "../battle/globalExtras";
import { EventHandlers } from "../eventHandlers";
import { FRAME_RATE, type GameCharacter } from "../GameCharacter";
import { pbMapInterpreterRunning } from "../GamePlayer";
import { G } from "../globals";
import { mapMetadata } from "../metadata";
import { pbFindPhoneTrainer } from "../scripts/phone";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";

declare module "../globals" {
  interface PokemonGlobalMetadata {
    /** Frames (at Graphics.frame_rate) until the next random phone call. */
    phoneTime?: number;
  }
}

const player = () => G.player as unknown as Player | null;

/** pbPhoneRegisterBattle(message, event, trainertype, trainername, maxbattles) */
export async function pbPhoneRegisterBattle(message: string | null, event: { id: number } | null, trainertype: string,
  trainername: string, maxbattles: number): Promise<boolean> {
  if (!player()?.hasPokegear) return false; // Can't register without a Pokégear
  if (!TrainerType.exists(trainertype)) return false;
  trainertype = TrainerType.get(trainertype).id;
  const contact = pbFindPhoneTrainer(trainertype, trainername);
  if (contact && contact[0]) return false; // Existing contact and is visible
  message ??= _INTL("Let me register you.");
  if (!(await pbConfirmMessage(message))) return false;
  // (pbGetMessageFromHash(MessageTypes::TrainerNames, name): the game has no translations.)
  const displayname = _INTL("{1} {2}", TrainerType.get(trainertype).name, trainername);
  if (contact) { // Previously registered, just make visible
    contact[0] = true;
  } else { // Add new contact
    pbPhoneRegister(event, trainertype, trainername);
    pbPhoneIncrement(trainertype, trainername, maxbattles);
  }
  await pbMessage(_INTL("\\me[Register phone]Registered {1} in the Pokégear.", displayname));
  return true;
}

/** pbRandomPhoneTrainer: a visible trainer contact on another map of this region, or nil. */
export function pbRandomPhoneTrainer(): PhoneNumber | null {
  const temparray: PhoneNumber[] = [];
  const thisMapMetadata = mapMetadata(G.gameMap!.mapId);
  if (!thisMapMetadata || !thisMapMetadata.townMapPosition) return null;
  const currentRegion = thisMapMetadata.townMapPosition[0];
  for (const num of phoneNumbers()) {
    if (!num[0] || num.length !== 8) continue; // if not visible or not a trainer
    if (G.gameMap!.mapId === num[6]) continue; // Can't call if on same map
    const callerMapMetadata = MapMetadata.tryGet(num[6] as number);
    if (!callerMapMetadata || !callerMapMetadata.townMapPosition) continue;
    // Can't call if in different region
    if (callerMapMetadata.townMapPosition[0] !== currentRegion) continue;
    temparray.push(num);
  }
  if (temparray.length === 0) return null;
  return temparray[rand(temparray.length)]!;
}

// :phone_call_counter. Graphics.frame_rate frames are this port's 60 Hz ticks
// (the counts are written in terms of frame_rate, so the times are the same).
EventHandlers.add("on_frame_update", "phone_call_counter", async () => {
  if (!player()?.hasPokegear) return;
  const g = G.pokemonGlobal;
  // Reset time to next phone call if necessary
  if (!g.phoneTime || g.phoneTime <= 0) g.phoneTime = (20 + rand(20)) * 60 * FRAME_RATE;
  // Don't count down various phone times if other things are happening
  phoneNumbers();
  const t = G.gameTemp;
  if (t.inMenu || t.inBattle || t.messageWindowShowing) return;
  if ((G.gamePlayer as unknown as GameCharacter).moveRouteForcing || pbMapInterpreterRunning()) return;
  // Count down time to next phone call
  g.phoneTime -= 1;
  // Count down time to next can-battle for each trainer contact
  if (g.phoneTime % FRAME_RATE === 0) { // Every second
    for (const num of phoneNumbers()) {
      if (!num[0] || num.length !== 8) continue; // if not visible or not a trainer
      // Reset time to next can-battle if necessary
      if (num[4] === 0) {
        num[3] = (20 + rand(20)) * 60; // 20-40 minutes
        num[4] = 1;
      }
      // Count down time to next can-battle
      num[3] = (num[3] as number) - 1;
      // Ready to battle
      if ((num[3] as number) <= 0 && num[4] === 1) {
        num[4] = 2; // set ready-to-battle flag
        pbSetReadyToBattle(num);
      }
    }
  }
  // Time for a random phone call; generate one
  if (g.phoneTime <= 0) {
    // find all trainer phone numbers
    const phonenum = pbRandomPhoneTrainer();
    if (phonenum) {
      const call = pbPhoneGenerateCall(phonenum);
      await pbPhoneCall(call, phonenum);
    }
  }
});

PokemonGlobalExtras.register("phoneNumbers");
PokemonGlobalExtras.register("phoneTime");

defineScript("pbPhoneRegisterBattle", (_c, message, event, type, name, max) =>
  pbPhoneRegisterBattle((message as string | null) ?? null, event as { id: number } | null, String(type), String(name), Number(max)));
defineScript("pbRandomPhoneTrainer", () => pbRandomPhoneTrainer());
