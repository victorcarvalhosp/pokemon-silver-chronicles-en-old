// Phone contacts from 013_Items/004_Item_Phone.rb (the Pokégear phone UI is a separate scene).

import { G } from "../globals";
import { messages } from "../messageBridge";
import { defineScript } from "../scriptApi";

/** [visible, trainer type or identifier, name, map id, ...battle data] */
type PhoneNumber = [boolean, string | number, string, number, ...unknown[]];

function phoneNumbers(): PhoneNumber[] {
  const g = G.pokemonGlobal as unknown as { phoneNumbers?: PhoneNumber[] };
  g.phoneNumbers ??= [];
  return g.phoneNumbers;
}

/** pbFindPhoneTrainer: ignores whether the contact is visible. */
export function pbFindPhoneTrainer(trType: string | number, trName: string): PhoneNumber | null {
  return phoneNumbers().find((n) => n[1] === trType && n[2] === trName) ?? null;
}

export async function pbPhoneRegisterNPC(ident: string | number, name: string, mapid: number, showmessage = true): Promise<void> {
  const exists = pbFindPhoneTrainer(ident, name);
  if (exists) {
    if (exists[0]) return; // already visible
    exists[0] = true; // make visible
  } else {
    phoneNumbers().push([true, ident, name, mapid]);
  }
  if (showmessage) await messages().pbMessage(`\\me[Register phone]Registered ${name} in the Pokégear.`);
}

defineScript("pbPhoneRegisterNPC", (_c, ident, name, mapid, show) => pbPhoneRegisterNPC(ident as string | number, String(name), Number(mapid), show !== false));
defineScript("pbFindPhoneTrainer", (_c, type, name) => pbFindPhoneTrainer(type as string, String(name)));
defineScript("pbHasPhoneTrainer?", (_c, type, name) => pbFindPhoneTrainer(type as string, String(name)) != null);
