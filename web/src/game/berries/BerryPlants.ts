// Port of Data/Scripts/012_Overworld/006_Overworld_BerryPlants.rb
// (BerryPlantData, BerryPlantMoistureSprite, BerryPlantSprite, the
// :add_berry_plant_graphics handler, pbBerryPlant, pbPickBerry), with the
// v20.1 Hotfixes' BerryPlantSprite#set_event_graphic (Overworld bug fixes.rb:
// 180: fully grown plants no longer look like sprouts on entering the map).
//
// Plants live in $PokemonGlobal.eventvars like in Ruby; the "berry_plants"
// save value remembers which entries are plants so loading turns them back
// into BerryPlantData (the snapshot of $PokemonGlobal stores their fields).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { BerryPlant } from "../../data/gameData/berryPlant";
import { Item } from "../../data/gameData/item";
import { Settings as GameSettings } from "../../data/gameData/settings";
import { Weather } from "../../data/gameData/weather";
import { rand } from "../../core/random";
import type { Viewport } from "../../rgss/display";
import { isBitmapPreloaded, preloadBitmaps } from "../../ui/rpgCache";
import { assetExists } from "../../core/assets";
import { pbFadeOutIn } from "../../ui/fades";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { PokemonBag_Scene, PokemonBagScreen } from "../../ui/bag/bag";
import { IconSprite } from "../../ui/SpriteWrapper";
import { pbGetTimeNow } from "../dayNight";
import { EventHandlers } from "../eventHandlers";
import type { GameEvent } from "../GameEvent";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import { pbMapInterpreter } from "../Interpreter";
import { PokemonBag } from "../items/PokemonBag";
import { startsWithVowel } from "../items/itemUtilities";
import { SaveData } from "../save/SaveData";
import type { Player } from "../trainer/Player";

/** Settings::NEW_BERRY_PLANTS (MECHANICS_GENERATION >= 4 when 001_Settings.rb loads). */
export const NEW_BERRY_PLANTS = GameSettings.MECHANICS_GENERATION >= 4;
const PLANT_SPARKLE_ANIMATION_ID = 7;
const player = () => G.player as unknown as Player;
const timeNow = () => Math.floor(pbGetTimeNow().getTime() / 1000); // Time#to_i
/** Integer division as Ruby does it (rounds towards -infinity). */
const idiv = (a: number, b: number) => Math.floor(a / b);

//===============================================================================
// Represents a planted berry. Stored in $PokemonGlobal.eventvars.
//===============================================================================
export class BerryPlantData {
  /** false for Gen 3, true for Gen 4 */
  newMechanics = NEW_BERRY_PLANTS;
  berryId: Id | null = null;
  /** Gen 4 mechanics */
  mulchId: Id | null = null;
  timeAlive = 0;
  timeLastUpdated = 0;
  growthStage = 0;
  replantCount = 0;
  /** Gen 3 mechanics */
  wateredThisStage = false;
  /** Gen 3 mechanics */
  wateringCount = 0;
  /** Gen 4 mechanics */
  moistureLevel = 100;
  /** Gen 4 mechanics */
  yieldPenalty = 0;

  constructor() {
    this.reset();
  }

  reset(planting = false): void {
    this.newMechanics = NEW_BERRY_PLANTS;
    this.berryId = null;
    if (!planting) this.mulchId = null;
    this.timeAlive = 0;
    this.timeLastUpdated = 0;
    this.growthStage = 0;
    this.replantCount = 0;
    this.wateredThisStage = false;
    this.wateringCount = 0;
    this.moistureLevel = 100;
    this.yieldPenalty = 0;
  }

  plant(berryId: Id): void {
    this.reset(true);
    this.berryId = berryId;
    this.growthStage = 1;
    this.timeLastUpdated = timeNow();
  }

  replant(): void {
    this.timeAlive = 0;
    this.growthStage = 2;
    this.replantCount += 1;
    this.wateredThisStage = false;
    this.wateringCount = 0;
    this.moistureLevel = 100;
    this.yieldPenalty = 0;
  }

  planted(): boolean { return this.growthStage > 0; }
  growing(): boolean { return this.growthStage > 0 && this.growthStage < 5; }
  grown(): boolean { return this.growthStage >= 5; }
  replanted(): boolean { return this.replantCount > 0; }

  moistureStage(): number {
    if (!this.newMechanics) return 0;
    if (this.moistureLevel > 50) return 2;
    if (this.moistureLevel > 0) return 1;
    return 0;
  }

  water(): void {
    this.moistureLevel = 100;
    if (!this.wateredThisStage) {
      this.wateredThisStage = true;
      this.wateringCount += 1;
    }
  }

  berryYield(): number {
    const data = BerryPlant.get(this.berryId!);
    if (this.newMechanics) {
      return Math.max(idiv(data.maximumYield() * (5 - this.yieldPenalty), 5), data.minimumYield());
    } else if (this.wateringCount > 0) {
      let ret = (data.maximumYield() - data.minimumYield()) * (this.wateringCount - 1);
      ret += rand(1 + data.maximumYield() - data.minimumYield());
      return idiv(ret, 4) + data.minimumYield();
    }
    return data.minimumYield();
  }

  /**
   * Old mechanics only update a plant when its map is loaded. New mechanics
   * update it every frame while its map is loaded.
   */
  update(): void {
    if (!this.planted()) return;
    const time = timeNow();
    const timeDelta = time - this.timeLastUpdated;
    if (timeDelta <= 0) return;
    let newTimeAlive = this.timeAlive + timeDelta;
    // Get all growth data
    const plantData = BerryPlant.get(this.berryId!);
    let timePerStage = plantData.hoursPerStage * 3600; // In seconds
    let dryingPerHour = plantData.dryingPerHour;
    let maxReplants = BerryPlant.NUMBER_OF_REPLANTS;
    const stagesGrowing = BerryPlant.NUMBER_OF_GROWTH_STAGES;
    let stagesFullyGrown = BerryPlant.NUMBER_OF_FULLY_GROWN_STAGES;
    switch (this.mulchId) {
      case "GROWTHMULCH":
        timePerStage = Math.trunc(timePerStage * 0.75);
        dryingPerHour = Math.ceil(dryingPerHour * 1.5);
        break;
      case "DAMPMULCH":
        timePerStage = Math.trunc(timePerStage * 1.25);
        dryingPerHour = idiv(dryingPerHour, 2);
        break;
      case "GOOEYMULCH":
        maxReplants = Math.ceil(maxReplants * 1.5);
        break;
      case "STABLEMULCH":
        stagesFullyGrown = Math.ceil(stagesFullyGrown * 1.5);
        break;
    }
    // Do replants
    let doneReplant = false;
    for (;;) {
      const stagesThisLife = stagesGrowing + stagesFullyGrown - (this.replanted() ? 1 : 0);
      if (newTimeAlive < stagesThisLife * timePerStage) break;
      if (this.replantCount >= maxReplants) {
        this.reset();
        return;
      }
      this.replant();
      doneReplant = true;
      newTimeAlive -= stagesThisLife * timePerStage;
    }
    // Update how long plant has been alive for
    let oldGrowthStage = this.growthStage;
    this.timeAlive = newTimeAlive;
    this.growthStage = 1 + idiv(this.timeAlive, timePerStage);
    if (this.replanted()) this.growthStage += 1; // Replants start at stage 2
    this.timeLastUpdated = time;
    // Record watering (old mechanics), and apply drying out per hour (new mechanics)
    if (this.newMechanics) {
      const oldGrowthHour = doneReplant ? 0 : idiv(this.timeAlive - timeDelta, 3600);
      const newGrowthHour = idiv(this.timeAlive, 3600);
      if (newGrowthHour > oldGrowthHour) {
        for (let n = 0; n < newGrowthHour - oldGrowthHour; n++) {
          if (this.moistureLevel > 0) this.moistureLevel -= dryingPerHour;
          else this.yieldPenalty += 1;
        }
      }
    } else {
      if (doneReplant) oldGrowthStage = 0;
      const newGrowthStage = Math.min(this.growthStage, stagesGrowing + 1);
      if (newGrowthStage > oldGrowthStage) this.wateredThisStage = false;
      if (G.gameScreen && Weather.get(G.gameScreen.weatherType).category === "Rain") this.water();
    }
  }

  static fromJSON(json: Record<string, unknown>): BerryPlantData {
    const p = new BerryPlantData();
    for (const k of Object.keys(p) as (keyof BerryPlantData)[]) {
      if (k in json) (p as unknown as Record<string, unknown>)[k] = json[k];
    }
    return p;
  }
}

//===============================================================================
// Saving: eventvars entries that are plants
//===============================================================================
SaveData.register({
  id: "berry_plants",
  save: () => Object.entries(G.pokemonGlobal.eventvars).filter(([, v]) => v instanceof BerryPlantData).map(([k]) => k),
  load: (v) => {
    const vars = G.pokemonGlobal.eventvars;
    for (const key of v as string[]) {
      const value = vars[key];
      if (value && typeof value === "object" && !(value instanceof BerryPlantData)) {
        vars[key] = BerryPlantData.fromJSON(value as Record<string, unknown>);
      }
    }
  },
});

//===============================================================================
//
//===============================================================================
/** A user sprite of Spriteset_Map (update/dispose). */
interface UserSprite { update(): void; dispose(): void; isDisposed(): boolean }

export class BerryPlantMoistureSprite implements UserSprite {
  private sprite: IconSprite;
  /** -1 = none, 0 = dry, 1 = damp, 2 = wet */
  private moistureStage = -1;
  private disposed = false;

  constructor(private event: GameEvent | null, private map: GameMap | null, viewport: Viewport | null = null) {
    this.sprite = new IconSprite(0, 0, viewport);
    this.sprite.ox = 16;
    this.sprite.oy = 24;
    this.updateGraphic();
  }

  dispose(): void {
    this.sprite.dispose();
    this.map = null;
    this.event = null;
    this.disposed = true;
  }

  isDisposed(): boolean { return this.disposed; }

  updateGraphic(): void {
    const file = MOISTURE_FILES[this.moistureStage] ?? null; // -1: setBitmap("")
    if (!file || isBitmapPreloaded(file)) {
      this.sprite.setBitmapFile(file);
      return;
    }
    // IconSprite needs its graphic loaded first (Ruby loads it here).
    this.sprite.setBitmapFile(null);
    void preloadBitmaps([file]).then(() => {
      if (!this.disposed && MOISTURE_FILES[this.moistureStage] === file) this.sprite.setBitmapFile(file);
    });
  }

  update(): void {
    if (!this.sprite || !this.event) return;
    let newMoisture = -1;
    const berryPlant = this.event.variable();
    if (berryPlant instanceof BerryPlantData && berryPlant.planted()) newMoisture = berryPlant.moistureStage();
    if (newMoisture !== this.moistureStage) {
      this.moistureStage = newMoisture;
      this.updateGraphic();
    }
    this.sprite.update();
    // ScreenPosHelper (Game_Map::TILE_WIDTH / 32.0 = 1.0 zoom)
    this.sprite.x = this.event.screenX();
    this.sprite.y = this.event.screenY();
    this.sprite.zoomX = 1.0;
    this.sprite.zoomY = this.sprite.zoomX;
    // pbDayNightTint(@sprite): the map viewport is tinted as a whole here
    // (SceneMap.updateSpritesets), which covers this sprite.
  }
}
const MOISTURE_FILES: Record<number, string> = {
  0: "Graphics/Characters/berrytreedry", 1: "Graphics/Characters/berrytreedamp", 2: "Graphics/Characters/berrytreewet",
};

export class BerryPlantSprite implements UserSprite {
  private oldStage = 0;
  private disposed = false;

  constructor(private event: GameEvent | null, private map: GameMap | null, _viewport: Viewport | null) {
    const berryPlant = event!.variable() as BerryPlantData | null | undefined;
    if (!berryPlant) return;
    this.oldStage = berryPlant.growthStage;
    event!.characterName = "";
    this.updatePlant(berryPlant);
    this.setEventGraphic(berryPlant, true); // Set the event's graphic
  }

  dispose(): void {
    this.event = null;
    this.map = null;
    this.disposed = true;
  }

  isDisposed(): boolean { return this.disposed; }

  /** set_event_graphic, as the v20.1 Hotfixes fix it. */
  setEventGraphic(berryPlant: BerryPlantData | null, fullCheck = false): void {
    if (!berryPlant || (berryPlant.growthStage === this.oldStage && !fullCheck)) return;
    const event = this.event!;
    if (berryPlant.growthStage === 0) {
      event.characterName = "";
    } else {
      if (berryPlant.growthStage === 1) {
        event.characterName = "berrytreeplanted"; // Common to all berries
        event.turnDown();
      } else {
        const filename = `berrytree_${Item.get(berryPlant.berryId!).id}`;
        if (assetExists(`Graphics/Characters/${filename}`)) { // pbResolveBitmap
          event.characterName = filename;
          switch (berryPlant.growthStage) {
            case 2: event.turnDown(); break; // X sprouted
            case 3: event.turnLeft(); break; // X taller
            case 4: event.turnRight(); break; // X flowering
            default: if (berryPlant.growthStage >= 5) event.turnUp(); // X berries
          }
        } else {
          event.characterName = "Object ball";
        }
      }
      if (berryPlant.newMechanics && this.oldStage !== berryPlant.growthStage &&
          this.oldStage > 0 && berryPlant.growthStage <= BerryPlant.NUMBER_OF_GROWTH_STAGES + 1) {
        const scene = G.scene as unknown as { spriteset?(mapId: number): { addUserAnimation(...a: unknown[]): unknown } | undefined } | null;
        scene?.spriteset?.(this.map!.mapId)?.addUserAnimation(PLANT_SPARKLE_ANIMATION_ID, event.x, event.y, false, 1);
      }
    }
    this.oldStage = berryPlant.growthStage;
  }

  updatePlant(berryPlant: BerryPlantData, initial = false): void {
    if (berryPlant.planted() && (initial || berryPlant.newMechanics)) berryPlant.update();
  }

  update(): void {
    if (!this.event) return;
    const berryPlant = this.event.variable() as BerryPlantData | null | undefined;
    if (!berryPlant) return;
    this.updatePlant(berryPlant);
    this.setEventGraphic(berryPlant);
  }
}

//===============================================================================
//
//===============================================================================
EventHandlers.add("on_new_spriteset_map", "add_berry_plant_graphics", (s, v) => {
  const spriteset = s as { map: GameMap; addUserSprite(sprite: unknown): void };
  const viewport = v as Viewport;
  const map = spriteset.map;
  for (const event of map.events.values()) {
    if (!/berryplant/i.test(event.name)) continue;
    spriteset.addUserSprite(new BerryPlantMoistureSprite(event, map, viewport));
    spriteset.addUserSprite(new BerryPlantSprite(event, map, viewport));
  }
});

//===============================================================================
//
//===============================================================================
async function chooseItem(proc: (item: Id) => boolean): Promise<Id | null> {
  let ret: Id | null = null;
  await pbFadeOutIn(async () => {
    const scene = new PokemonBag_Scene();
    const screen = new PokemonBagScreen(scene, G.bag);
    ret = await screen.pbChooseItemScreen(proc);
  });
  return ret;
}

export async function pbBerryPlant(): Promise<void> {
  const interp = pbMapInterpreter();
  const thisEvent = interp.getSelf()!;
  let berryPlant = interp.getVariable() as BerryPlantData | null | undefined;
  if (!berryPlant) {
    berryPlant = new BerryPlantData();
    interp.setVariable(berryPlant);
  }
  let berry = berryPlant.berryId;
  // Interact with the event based on its growth
  if (berryPlant.grown()) {
    thisEvent.turnUp(); // Stop the event turning towards the player
    if (await pbPickBerry(berry!, berryPlant.berryYield())) berryPlant.reset();
    return;
  } else if (berryPlant.growing()) {
    const berryName = Item.get(berry!).name;
    switch (berryPlant.growthStage) {
      case 1: // X planted
        thisEvent.turnDown(); // Stop the event turning towards the player
        if (startsWithVowel(berryName)) await pbMessage(_INTL("An {1} was planted here.", berryName));
        else await pbMessage(_INTL("A {1} was planted here.", berryName));
        break;
      case 2: // X sprouted
        thisEvent.turnDown(); // Stop the event turning towards the player
        await pbMessage(_INTL("The {1} has sprouted.", berryName));
        break;
      case 3: // X taller
        thisEvent.turnLeft(); // Stop the event turning towards the player
        await pbMessage(_INTL("The {1} plant is growing bigger.", berryName));
        break;
      default: // X flowering
        thisEvent.turnRight(); // Stop the event turning towards the player
        if (NEW_BERRY_PLANTS) {
          await pbMessage(_INTL("This {1} plant is in bloom!", berryName));
        } else {
          switch (berryPlant.wateringCount) {
            case 4: await pbMessage(_INTL("This {1} plant is in fabulous bloom!", berryName)); break;
            case 3: await pbMessage(_INTL("This {1} plant is blooming very beautifully!", berryName)); break;
            case 2: await pbMessage(_INTL("This {1} plant is blooming prettily!", berryName)); break;
            case 1: await pbMessage(_INTL("This {1} plant is blooming cutely!", berryName)); break;
            default: await pbMessage(_INTL("This {1} plant is in bloom!", berryName));
          }
        }
    }
    // Water the growing plant
    for (const item of BerryPlant.WATERING_CANS) {
      if (!G.bag.has(item)) continue;
      if (!(await pbConfirmMessage(_INTL("Want to sprinkle some water with the {1}?", Item.get(item).name)))) break;
      berryPlant.water();
      await pbMessage(_INTL("{1} watered the plant.\\wtnp[40]", player().name));
      if (NEW_BERRY_PLANTS) await pbMessage(_INTL("There! All happy!"));
      else await pbMessage(_INTL("The plant seemed to be delighted."));
      break;
    }
    return;
  }
  // Nothing planted yet
  let askToPlant = true;
  if (NEW_BERRY_PLANTS) {
    // New mechanics
    if (berryPlant.mulchId) {
      await pbMessage(_INTL("{1} has been laid down.\x01", Item.get(berryPlant.mulchId).name));
    } else {
      switch (await pbMessage(_INTL("It's soft, earthy soil."), [_INTL("Fertilize"), _INTL("Plant Berry"), _INTL("Exit")], -1)) {
        case 0: { // Fertilize
          const mulch = await chooseItem((item) => Item.get(item).isMulch());
          if (!mulch) return;
          const mulchData = Item.get(mulch);
          if (mulchData.isMulch()) {
            berryPlant.mulchId = mulch;
            G.bag.remove(mulch);
            await pbMessage(_INTL("The {1} was scattered on the soil.\x01", mulchData.name));
          } else {
            await pbMessage(_INTL("That won't fertilize the soil!"));
            return;
          }
          break;
        }
        case 1: // Plant Berry
          askToPlant = false;
          break;
        default: // Exit/cancel
          return;
      }
    }
  } else {
    // Old mechanics
    if (!(await pbConfirmMessage(_INTL("It's soft, loamy soil.\nPlant a berry?")))) return;
    askToPlant = false;
  }
  if (!askToPlant || await pbConfirmMessage(_INTL("Want to plant a Berry?"))) {
    berry = await chooseItem((item) => Item.get(item).isBerry());
    if (berry) {
      G.stats.berriesPlanted += 1;
      berryPlant.plant(berry);
      G.bag.remove(berry);
      if (NEW_BERRY_PLANTS) {
        await pbMessage(_INTL("The {1} was planted in the soft, earthy soil.", Item.get(berry).name));
      } else if (startsWithVowel(Item.get(berry).name)) {
        await pbMessage(_INTL("{1} planted an {2} in the soft loamy soil.", player().name, Item.get(berry).name));
      } else {
        await pbMessage(_INTL("{1} planted a {2} in the soft loamy soil.", player().name, Item.get(berry).name));
      }
    }
  }
}

//===============================================================================
//
//===============================================================================
export async function pbPickBerry(berryId: Id, qty = 1): Promise<boolean> {
  const berry = Item.get(berryId);
  const berryName = qty > 1 ? berry.namePlural : berry.name;
  let message: string;
  if (qty > 1) message = _INTL("There are {1} \\c[1]{2}\\c[0]!\nWant to pick them?", qty, berryName);
  else message = _INTL("There is 1 \\c[1]{1}\\c[0]!\nWant to pick it?", berryName);
  if (!(await pbConfirmMessage(message))) return false;
  if (!G.bag.canAdd(berry.id, qty)) {
    await pbMessage(_INTL("Too bad...\nThe Bag is full..."));
    return false;
  }
  G.stats.berryPlantsPicked += 1;
  if (qty >= BerryPlant.get(berry.id).maximumYield()) G.stats.maxYieldBerryPlants += 1;
  G.bag.add(berry.id, qty);
  if (qty > 1) await pbMessage(_INTL("\\me[Berry get]You picked the {1} \\c[1]{2}\\c[0].\\wtnp[30]", qty, berryName));
  else await pbMessage(_INTL("\\me[Berry get]You picked the \\c[1]{1}\\c[0].\\wtnp[30]", berryName));
  const pocket = berry.pocket;
  await pbMessage(_INTL("{1} put the \\c[1]{2}\\c[0] in the <icon=bagPocket{3}>\\c[1]{4}\\c[0] Pocket.\x01",
    player().name, berryName, pocket, PokemonBag.pocketNames()[pocket - 1]));
  if (NEW_BERRY_PLANTS) await pbMessage(_INTL("The soil returned to its soft and earthy state."));
  else await pbMessage(_INTL("The soil returned to its soft and loamy state."));
  const thisEvent = pbMapInterpreter().getSelf()!;
  pbMapInterpreter().pbSetSelfSwitch(thisEvent.id, "A", true);
  return true;
}

