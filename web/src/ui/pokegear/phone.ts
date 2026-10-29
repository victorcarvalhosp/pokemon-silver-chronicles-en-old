// Port of 016_UI/010_UI_Phone.rb (Window_PhoneList, PokemonPhoneScene) and
// the parts of 013_Items/004_Item_Phone.rb the phone screen uses: calling a
// contact (pbCallTrainer, pbPhoneGenerateCall, pbPhoneCall...) and the
// rematch counters' data helpers (pbPhoneRegister, pbPhoneIncrement...).
// Registering NPC contacts is in game/scripts/phone.ts; the :phone_call_counter
// frame handler (rematch countdowns and random calls) is in
// game/trainers/phoneRematch.ts.
// Also here: pbCommonEvent (019_Utilities/001_Utilities.rb), which NPC
// contacts' calls run.

import { assetExists } from "../../core/assets";
import { Encounter } from "../../data/gameData/encounter";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { pbLoadPhoneData } from "../../data/gameData/miscPBSData";
import { Species } from "../../data/gameData/species";
import { Trainer } from "../../data/gameData/trainer";
import { TrainerType } from "../../data/gameData/trainerType";
import { Data } from "../../data/store";
import { PBDayNight, pbGetTimeNow } from "../../game/dayNight";
import { G, pbUpdateSceneMap } from "../../game/globals";
import { Interpreter } from "../../game/Interpreter";
import { pbFindPhoneTrainer } from "../../game/scripts/phone";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../AnimatedBitmap";
import { pbCopyBitmap } from "../drawText";
import { pbActivateWindow, pbFadeInAndShow, pbFadeOutAndHide } from "../fades";
import { _INTL, pbDisposeSpriteHash, pbUpdateSpriteHash } from "../messageConfig";
import { pbMessage } from "../messages";
import { pbPlayCloseMenuSE } from "../options/options";
import { addBackgroundPlane, pbGetMapNameFromId } from "../planes";
import { preloadBitmaps } from "../rpgCache";
import { asHash, type Sprites } from "../scenes/frames";
import { IconSprite } from "../SpriteWrapper";
import { Window_AdvancedTextPokemon, Window_CommandPokemon, Window_UnformattedTextPokemon } from "../windows/SpriteWindowText";
import { currentMapMetadata } from "./regionMap";

/**
 * A $PokemonGlobal.phoneNumbers entry. NPCs: [visible, ident, name, map id].
 * Trainers: [visible, trainer type, name, time to next battle, can battle
 * (0 no, 1 counting down, 2 ready, 3 asked to battle), battle count, map id, event id].
 */
export type PhoneNumber = [boolean, string | number, string, number, ...unknown[]];

export function phoneNumbers(): PhoneNumber[] {
  const g = G.pokemonGlobal as unknown as { phoneNumbers?: PhoneNumber[] };
  g.phoneNumbers ??= [];
  return g.phoneNumbers;
}

/** pbCommonEvent(id): runs a common event to completion; false if it doesn't exist. */
export async function pbCommonEvent(id: number): Promise<boolean> {
  if (id < 0) return false;
  const ce = Data.commonEvents.get(id);
  if (!ce) return false;
  const interp = new Interpreter();
  interp.setup(ce.list, 0);
  for (;;) {
    await Graphics.update();
    Input.update();
    await interp.update();
    await pbUpdateSceneMap();
    if (!interp.running()) break;
  }
  return true;
}

//===============================================================================
// Phone screen
//===============================================================================
export class Window_PhoneList extends Window_CommandPokemon {
  override drawCursor(index: number, rect: Rect): Rect {
    const selarrow = new AnimatedBitmap("Graphics/Pictures/phoneSel");
    if (this.index === index) pbCopyBitmap(this.contents!, selarrow.bitmap, rect.x, rect.y);
    return new Rect(rect.x + 28, rect.y + 8, rect.width - 16, rect.height);
  }

  override drawItem(index: number, count: number, rect: Rect): void {
    if (index >= this.topRow + this.pageItemMax) return;
    super.drawItem(index, count, rect);
    this.drawCursor(index - 1, this.itemRect(index - 1));
  }
}

/** [trainer type, name, map id, waiting for a rematch] or, for NPCs, [ident, name, map id]. */
type PhoneTrainer = [string | number, string, number | undefined, boolean] | [string | number, string, number | undefined];

export class PokemonPhoneScene {
  private sprites: Sprites = {};
  private viewport!: Viewport;
  private trainers: PhoneTrainer[] = [];

  private iconFile(trainer: PhoneTrainer): string | null {
    if (trainer.length === 4) return TrainerType.charsetFilename(String(trainer[0]), (p) => (assetExists(p) ? p : null));
    return `Graphics/Characters/phone${String(trainer[0]).padStart(3, "0")}`;
  }

  private setIcon(trainer: PhoneTrainer): void {
    const icon = this.sprites.icon as IconSprite;
    icon.setBitmapFile(this.iconFile(trainer));
    const charwidth = icon.bitmap?.width ?? 0;
    const charheight = icon.bitmap?.height ?? 0;
    icon.x = 86 - Math.floor(charwidth / 8);
    icon.y = 134 - Math.floor(charheight / 8);
    icon.srcRect = new Rect(0, 0, Math.floor(charwidth / 4), Math.floor(charheight / 4));
  }

  async start(): Promise<void> {
    const commands: string[] = [];
    this.trainers = [];
    for (const num of phoneNumbers()) {
      if (!num[0]) continue; // if visible
      if (num.length === 8) { // if trainer
        this.trainers.push([num[1], num[2], num[6] as number, (num[4] as number) >= 2]);
      } else { // if NPC
        this.trainers.push([num[1], num[2], num[3]]);
      }
    }
    if (this.trainers.length === 0) {
      await pbMessage(_INTL("There are no phone numbers stored."));
      return;
    }
    await preloadBitmaps([
      "Graphics/Pictures/phonebg", "Graphics/Pictures/phoneSel", "Graphics/Pictures/phoneRematch",
      ...this.trainers.map((t) => this.iconFile(t)).filter((f): f is string => !!f),
    ]);
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    const list = Window_PhoneList.newEmpty(152, 32, Graphics.width - 142, Graphics.height - 80, this.viewport) as Window_PhoneList;
    this.sprites.list = list;
    const header = Window_UnformattedTextPokemon.newWithSize(_INTL("Phone"), 2, -18, 128, 64, this.viewport);
    header.baseColor = new Color(248, 248, 248);
    header.shadowColor = new Color(0, 0, 0);
    this.sprites.header = header;
    const first = this.trainers[0]!;
    const mapname = first[2] ? pbGetMapNameFromId(first[2]) : "";
    const bottom = Window_AdvancedTextPokemon.newWithSize("", 162, Graphics.height - 64, Graphics.width - 158, 64, this.viewport);
    bottom.text = "<ac>" + mapname;
    this.sprites.bottom = bottom;
    this.sprites.info = Window_AdvancedTextPokemon.newWithSize("", -8, 224, 180, 160, this.viewport);
    addBackgroundPlane(this.sprites, "bg", "phonebg", this.viewport);
    this.sprites.icon = new IconSprite(70, 102, this.viewport);
    this.setIcon(first);
    for (const trainer of this.trainers) {
      if (trainer.length === 4) {
        // pbGetMessageFromHash(MessageTypes::TrainerNames, name)
        commands.push(_INTL("{1} {2}", TrainerType.get(String(trainer[0])).name, trainer[1])); // trainer's display name
      } else {
        commands.push(trainer[1]); // NPC's display name
      }
    }
    list.commands = commands;
    const refreshRematches = () => {
      for (let i = 0; i < list.pageItemMax; i++) {
        const spr = this.sprites[`rematch[${i}]`] as IconSprite;
        spr.clearBitmaps();
        const j = i + list.topItem;
        if (j >= commands.length) continue;
        const trainer = this.trainers[j]!;
        if (trainer.length === 4 && trainer[3]) spr.setBitmapFile("Graphics/Pictures/phoneRematch");
      }
    };
    for (let i = 0; i < list.pageItemMax; i++) this.sprites[`rematch[${i}]`] = new IconSprite(468, 62 + i * 32, this.viewport);
    refreshRematches();
    let rematchcount = 0;
    for (const trainer of this.trainers) if (trainer.length === 4 && trainer[3]) rematchcount += 1;
    let infotext = _INTL("Registered<br>");
    infotext += _INTL(" <r>{1}<br>", list.commands.length);
    infotext += _INTL("Waiting for a rematch<r>{1}", rematchcount);
    (this.sprites.info as Window_AdvancedTextPokemon).text = infotext;
    await pbFadeInAndShow(asHash(this.sprites));
    await pbActivateWindow(asHash(this.sprites), "list", async () => {
      let oldindex = -1;
      for (;;) {
        await Graphics.update();
        Input.update();
        pbUpdateSpriteHash(this.sprites as never);
        if (list.index !== oldindex) {
          oldindex = list.index; // (Ruby never updates oldindex, so this refresh runs every frame; same result)
          const trainer = this.trainers[list.index]!;
          this.setIcon(trainer);
          const name = trainer[2] ? pbGetMapNameFromId(trainer[2]) : "";
          bottom.text = "<ac>" + name;
          refreshRematches();
        }
        if (Input.trigger(Input.BACK)) {
          pbPlayCloseMenuSE();
          break;
        } else if (Input.trigger(Input.USE)) {
          const index = list.index;
          if (index >= 0) await pbCallTrainer(this.trainers[index]![0], this.trainers[index]![1]);
        }
      }
    });
    await pbFadeOutAndHide(asHash(this.sprites));
    pbDisposeSpriteHash(this.sprites as never);
    this.viewport.dispose();
  }
}

//===============================================================================
// Register contacts / contact information (004_Item_Phone.rb)
//===============================================================================
export function pbPhoneRegister(event: { id: number } | null, trainertype: string, trainername: string): void {
  if (pbFindPhoneTrainer(trainertype, trainername)) return;
  const phonenum: PhoneNumber = [true, trainertype, trainername, 0, 0, 0]; // time to next battle, can battle, battle count
  if (event) phonenum.push(G.gameMap?.mapId ?? 0, event.id);
  phoneNumbers().push(phonenum);
}

export function pbPhoneDeleteContact(index: number): void {
  const num = phoneNumbers()[index]!;
  num[0] = false; // Remove from contact list
  if (num.length === 8) {
    num[3] = 0; // Reset countdown
    num[4] = 0; // Reset countdown
  }
}

export function pbPhoneBattleCount(trType: string, trName: string): number {
  const trainer = pbFindPhoneTrainer(trType, trName);
  return trainer ? (trainer[5] as number) : 0;
}

export function pbPhoneReadyToBattle(trType: string, trName: string): boolean {
  const trainer = pbFindPhoneTrainer(trType, trName);
  return !!trainer && (trainer[4] as number) >= 2;
}

/** pbPhoneIncrement: increments the battle count and resets the rematch countdown. */
export function pbPhoneIncrement(trType: string, trName: string, maxbattles: number): void {
  const trainer = pbFindPhoneTrainer(trType, trName);
  if (!trainer) return;
  if ((trainer[5] as number) < maxbattles) trainer[5] = (trainer[5] as number) + 1; // Increment battle count
  trainer[3] = 0; // reset time to can-battle
  trainer[4] = 0; // reset can-battle flag
}

export function pbPhoneReset(trType: string, trName: string): boolean {
  const trainer = pbFindPhoneTrainer(trType, trName);
  if (!trainer) return false;
  trainer[3] = 0;
  trainer[4] = 0;
  return true;
}

export function pbSetReadyToBattle(num: PhoneNumber): void {
  if (!num[6] || !num[7]) return;
  G.gameSelfSwitches.set(num[6] as number, num[7] as number, "A", false);
  G.gameSelfSwitches.set(num[6] as number, num[7] as number, "B", true);
  const map = G.gameMap as unknown as { needRefresh?: boolean } | null;
  if (map) map.needRefresh = true;
}

//===============================================================================
// Player calls a contact
//===============================================================================
export async function pbCallTrainer(trtype: string | number, trname: string): Promise<void> {
  const trainer = pbFindPhoneTrainer(trtype, trname);
  if (!trainer) return;
  // Special NPC contacts
  if (trainer.length !== 8) {
    if (!(await pbCommonEvent(Number(trtype)))) {
      await pbMessage(_INTL("{1}'s messages not defined.\nCouldn't call common event {2}.", trainer[2], trtype));
    }
    return;
  }
  // Trainer contacts
  if (G.gameMap?.mapId === trainer[6]) {
    await pbMessage(_INTL("The Trainer is close by.\nTalk to the Trainer in person!"));
    return;
  }
  const callerPos = MapMetadata.tryGet(trainer[6] as number)?.townMapPosition;
  const thisPos = currentMapMetadata()?.townMapPosition;
  if (!callerPos || !thisPos || callerPos[0] !== thisPos[0]) {
    await pbMessage(_INTL("The Trainer is out of range."));
    return; // Can't call if in different region
  }
  const call = pbPhoneGenerateCall(trainer);
  await pbPhoneCall(call, trainer);
}

//===============================================================================
// Generate phone message
//===============================================================================
const rand = (n: number) => Math.floor(Math.random() * n);

export function pbPhoneGenerateCall(phonenum: PhoneNumber): string {
  const phoneData = pbLoadPhoneData()!;
  // Choose random greeting depending on time of day
  let call = pbRandomPhoneItem(phoneData.greetings);
  const time = pbGetTimeNow();
  if (PBDayNight.isMorning(time)) {
    const modcall = pbRandomPhoneItem(phoneData.greetingsMorning);
    if (modcall && modcall !== "") call = modcall;
  } else if (PBDayNight.isEvening(time)) {
    const modcall = pbRandomPhoneItem(phoneData.greetingsEvening);
    if (modcall && modcall !== "") call = modcall;
  }
  call += "\\m";
  if (phonenum[4] === 2 || (rand(2) === 0 && phonenum[4] === 3)) {
    // If "can battle" is set, make ready to battle
    call += pbRandomPhoneItem(phoneData.battleRequests);
    pbSetReadyToBattle(phonenum);
    phonenum[4] = 3;
  } else if (rand(4) < 3) {
    // Choose random body
    call += pbRandomPhoneItem(phoneData.bodies1);
    call += "\\m";
    call += pbRandomPhoneItem(phoneData.bodies2);
  } else {
    // Choose random generic
    call += pbRandomPhoneItem(phoneData.generics);
  }
  return call;
}

/** pbGetMessageFromHash(MessageTypes::PhoneMessages, ...) is the text itself (no translations). */
export function pbRandomPhoneItem(array: string[]): string {
  return array[rand(array.length)] ?? "";
}

export function pbRandomEncounterSpecies(encTable: { species: string }[] | undefined): string | null {
  if (!encTable || encTable.length === 0) return null;
  const len = Math.min(encTable.length, 4);
  return encTable[rand(len)]!.species;
}

export function pbEncounterSpecies(phonenum: PhoneNumber): string {
  if (!phonenum[6] || phonenum[6] === 0) return "";
  const encounterVersion = (G.pokemonGlobal as unknown as { encounterVersion?: number }).encounterVersion ?? 0;
  const encounterData = Encounter.get(phonenum[6] as number, encounterVersion);
  if (!encounterData) return "";
  const encTables = encounterData.types;
  const species = pbRandomEncounterSpecies(encTables.Land) ?? pbRandomEncounterSpecies(encTables.Cave) ?? pbRandomEncounterSpecies(encTables.Water);
  if (!species) return "";
  return Species.get(species).name;
}

export function pbTrainerSpecies(phonenum: PhoneNumber): string {
  if (!phonenum[0]) return "";
  const partyid = Math.max(0, (phonenum[5] as number) - 1);
  const trainerData = Trainer.tryGet(String(phonenum[1]), phonenum[2], partyid);
  if (!trainerData) return "";
  const pkmn = trainerData.pokemon.length === 1 ? trainerData.pokemon[0]!.species : trainerData.pokemon[rand(trainerData.pokemon.length)]!.species;
  return Species.get(pkmn).name;
}

export function pbTrainerMapName(phonenum: PhoneNumber): string {
  if (!phonenum[6] || phonenum[6] === 0) return "";
  return pbGetMapNameFromId(phonenum[6] as number);
}

//===============================================================================
// The phone call itself
//===============================================================================
export async function pbPhoneCall(call: string, phonenum: PhoneNumber): Promise<void> {
  await pbMessage(_INTL("......\\wt[5] ......\\1"));
  const encspecies = pbEncounterSpecies(phonenum);
  const trainerspecies = pbTrainerSpecies(phonenum);
  const trainermap = pbTrainerMapName(phonenum);
  const messages = call.split("\\m");
  for (let i = 0; i < messages.length; i++) {
    let m = messages[i]!;
    m = m.replace(/\\TN/g, phonenum[2]);
    m = m.replace(/\\TP/g, trainerspecies);
    m = m.replace(/\\TE/g, encspecies);
    m = m.replace(/\\TM/g, trainermap);
    if (i < messages.length - 1) m += "\\1";
    await pbMessage(m);
  }
  await pbMessage(_INTL("Click!\\wt[10]\n......\\wt[5] ......\\1"));
}
