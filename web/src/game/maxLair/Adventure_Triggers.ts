// Port of Plugins/ZUD Mechanics/[010] Adventures/Adventure_Triggers.rb: the
// Max Lair event tiles (NPCs, berries, chests, keys, doors, flares,
// roadblocks, traps), methods of DynamaxAdventure (Ruby reopens the class;
// they're installed on its prototype here). Each returns whether the tile is
// cleared (nil when the adventure isn't running).

import { DEBUG } from "../../core/debug";
import { rand } from "../../core/random";
import { _INTL } from "../../data/gameData/gameData";
import { TrainerType } from "../../data/gameData/trainerType";
import { Input } from "../../rgss/Input";
import { pbMessage } from "../../ui/messages";
import { pbWait } from "../../ui/scenes/frames";
import { pbHiddenMoveAnimation } from "../field/hiddenMoveAnimation";
import { pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import { sample } from "../maxRaid/random";
import { DynamaxAdventure } from "./Adventure_Main";
import { pbMaxLairMenu } from "./LairMenu_Menus";

const player = () => G.player as unknown as Player;
const WINDOWSKIN = DynamaxAdventure.WINDOWSKIN;

/** The text colour code for an NPC of the given trainer type (blue male, red female). */
function genderCode(trainerType: string): string {
  const trainer = TrainerType.tryGet(trainerType);
  const gender = trainer ? trainer.gender : 2;
  return gender === 0 ? "\\b" : gender === 1 ? "\\r" : "";
}

const methods = {
  //-----------------------------------------------------------------------------
  // Scientist NPC
  // Allows the player to exchange a party member for a new rental Pokemon.
  //-----------------------------------------------------------------------------
  async lairNpcSwap(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    const g = genderCode("SCIENTIST");
    await pbMessage(_INTL("You encountered a Scientist!"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}How have the results of your adventure been so far?`));
    await pbMessage(_INTL(`${g}I have a rental Pokémon here that I could swap with you, if you'd like.`));
    await pbMaxLairMenu("exchange");
    await pbMessage(_INTL(`${g}I'll head back to study the new data I've gathered.`));
    await pbMessage(_INTL(`${g}Please report any new findings you may discover on your adventure!`));
    return true;
  },

  //-----------------------------------------------------------------------------
  // Backpacker NPC
  // Allows the player to equip items to party members out of a randomized list.
  //-----------------------------------------------------------------------------
  async lairNpcEquip(this: DynamaxAdventure): Promise<void> {
    if (this.ended()) return;
    if (!this.inProgress()) return;
    const g = genderCode("HIKER");
    await pbMessage(_INTL("You encountered a Backpacker!"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}I was worried I'd run into trouble in here, so I stocked up on more than I can carry...`));
    await pbMessage(_INTL(`${g}I can share my supplies with you if you're in need. What items would you like?`));
    await pbMaxLairMenu("equip");
    await pbMessage(_INTL(`${g}Remember, preparation is the key to victory!`));
  },

  //-----------------------------------------------------------------------------
  // Blackbelt NPC
  // Allows the player to reallocate EV points of party members.
  //-----------------------------------------------------------------------------
  async lairNpcTrain(this: DynamaxAdventure): Promise<void> {
    if (this.ended()) return;
    if (!this.inProgress()) return;
    const g = genderCode("BLACKBELT");
    await pbMessage(_INTL("You encountered a Blackbelt!"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}I've been training deep in this lair so that I can grow strong like a Dynamax Pokémon!`));
    await pbMessage(_INTL(`${g}Do you want to become strong, too? Let me share my secret training techniques with you!`));
    await pbMaxLairMenu("train");
    await pbMessage(_INTL(`${g}Keep pushing yourself until you've reached your limits!`));
  },

  //-----------------------------------------------------------------------------
  // Ace Trainer NPC
  // Allows the player to tutor their party Pokemon to teach them up to three
  // new randomly generated moves in total.
  //-----------------------------------------------------------------------------
  async lairNpcTutor(this: DynamaxAdventure): Promise<void> {
    if (this.ended()) return;
    if (!this.inProgress()) return;
    const g = genderCode("COOLTRAINER_F");
    await pbMessage(_INTL("You encountered an Ace Trainer!"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}I've been studying the most effective tactics to use in Dynamax battles.`));
    await pbMessage(_INTL(`${g}If you'd like, I can teach one of your Pokémon a new move to help it excel in battle!`));
    await pbMaxLairMenu("tutor");
    await pbMessage(_INTL(`${g}A good strategy will help you overcome any obstacle!`));
  },

  //-----------------------------------------------------------------------------
  // Channeller NPC
  // Increases the player's current and total heart counter by 1.
  // The heart counter caps at six, and will not increase beyond that.
  //-----------------------------------------------------------------------------
  async lairNpcWardIntro(this: DynamaxAdventure): Promise<void> {
    if (this.ended()) return;
    if (!this.inProgress()) return;
    const g = genderCode("CHANNELER");
    await pbMessage(_INTL("You encountered a Channeler!"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}Ahh! Your spirit beckons me to cleanse it of its weariness!`));
    await pbMessage(_INTL(`${g}Let me exorcise the demons that plague your body and soul!`));
    await pbMessage(_INTL(`${g}...\\wt[10] ...\\wt[10] ...\\wt[20]Begone!`));
    this.knockouts += 1;
    if (this.knockouts > 6) this.knockouts = 6;
  },

  async lairNpcWardOutro(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    const g = genderCode("CHANNELER");
    pbSEPlay("Anim/Natural Gift");
    await pbMessage(_INTL("Your total number of hearts increased!\\wt[34]"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}What am I even doing here, you ask?\nHaha! Foolish child.`));
    const randtext = rand(5);
    switch (randtext) {
      case 0:
        await pbMessage(_INTL(`${g}I was once an adventurer like you who got lost in this lair.\nMany...\\wt[10]many years ago.\\wt[10]`));
        await pbMessage(_INTL("Huh? The Channeler suddenly vanished!"), null, 0, WINDOWSKIN);
        break;
      case 1:
        await pbMessage(_INTL(`${g}I go where the spirits say I'm needed! Nothing more!`));
        await pbMessage(_INTL(`${g}I must go now, young one. There are many other souls that need saving!`));
        break;
      case 2:
        await pbMessage(_INTL(`${g}What makes you think I was ever really here at all?\nOooooo....\\wt[10]`));
        await pbWait(20);
        await pbMessage(_INTL("The Channeler tripped over a rock during their dramatic exit."), null, 0, WINDOWSKIN);
        break;
      case 3:
        await pbMessage(_INTL(`${g}I was summoned here by the wailing of souls crying out from this lair!`));
        await pbMessage(_INTL(`${g}..but now that I'm here, I think it was just the wind.`));
        await pbMessage(_INTL(`${g}Perhaps it was fate that drew me here to meet you?\nAlas, it is now time for us to part ways.`));
        await pbMessage(_INTL(`${g}Farewell, child. Good luck on your journeys.`));
        break;
      case 4:
        await pbMessage(_INTL(`${g}If you must know, I...\\wt[10]just got lost.`));
        await pbMessage(_INTL(`${g}The exit is back there, you say?\nThank you, child.`));
        await pbMessage(_INTL(`${g}May the spirits guide you better than they have me!`));
        break;
    }
    return true;
  },

  //-----------------------------------------------------------------------------
  // Nurse NPC
  // Fully restores the player's party.
  //-----------------------------------------------------------------------------
  async lairNpcHeal(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    const g = genderCode("LASS");
    await pbMessage(_INTL("You encountered a Nurse!"), null, 0, WINDOWSKIN);
    await pbMessage(_INTL(`${g}Are your Pokémon feeling a bit worn out from your adventure?`));
    await pbMessage(_INTL(`\\me[Pkmn healing]${g}Please, let me heal them back to full health.\\wtnp[30]`));
    for (const p of player().party) p.heal();
    await pbMessage(_INTL(`${g}I'll be going now.\nGood luck with the rest of your adventure!`));
    return true;
  },

  //-----------------------------------------------------------------------------
  // Random NPC
  // The effect of a random NPC Tile is applied.
  //-----------------------------------------------------------------------------
  async lairNpcRandom(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    switch (rand(5)) {
      case 0: await this.lairNpcSwap(); break;
      case 1: await this.lairNpcEquip(); break;
      case 2: await this.lairNpcTrain(); break;
      case 3: await this.lairNpcTutor(); break;
      case 4: await this.lairNpcHeal(); break;
    }
    return true;
  },

  //-----------------------------------------------------------------------------
  // Berries
  // Heals up to 50% of each party member's max HP if any party Pokemon are
  // damaged. Leaves the berries behind if already at full health.
  //-----------------------------------------------------------------------------
  async lairTileBerry(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    await pbMessage(_INTL("You found some Berries lying on the ground!"));
    let needsHealing = false;
    for (const p of player().party) if (p.hp < p.totalhp) needsHealing = true;
    if (needsHealing) {
      pbSEPlay("Anim/Recovery");
      await pbMessage(_INTL("Your Pokémon ate the Berries and some of their HP was restored!"));
      for (const i of player().party) {
        i.hp += Math.floor(i.totalhp / 2);
        if (i.hp > i.totalhp) i.hp = i.totalhp;
      }
      return true;
    } else {
      await pbMessage(_INTL("But your Pokémon are already at full health..."));
      await pbMessage(_INTL("You decided to leave the Berries behind and press on!"));
      return false;
    }
  },

  //-----------------------------------------------------------------------------
  // Treasure Chest
  // Collects random rewards. The quality of the rewards scales with the difficulty
  // of the last Pokemon that was encountered in the lair. Some chests are locked,
  // and require a Lair Key to open. Some chests are also traps, and may warp the
  // player back to the start of the lair.
  //-----------------------------------------------------------------------------
  async lairTileChest(this: DynamaxAdventure, value: number): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    await pbMessage(_INTL("You found a Treasure Chest!"));
    const trapChest = value % 10 === 0; // value.digits.first == 0
    const trapMessages = async () => {
      await pbWait(8);
      pbSEPlay("Exclaim");
      await pbMessage(_INTL("Huh?"));
      await pbMessage(_INTL("A pair of glowing red eyes peeked at you from within the chest..."));
      await pbMessage(_INTL("A mysterious Pokémon growled from within and shrouded you in darkness!"));
    };
    if (value < 15) {
      await pbMessage(_INTL("But the chest appears to be locked..."));
      if (this.keycount > 0) {
        await pbMessage(_INTL("You used a Lair Key to unlock the Treasure Chest!"));
        pbSEPlay("Battle catch click");
        if (!trapChest) await pbMaxLairMenu("treasure");
        if (trapChest) await trapMessages();
        return true;
      } else {
        await pbMessage(_INTL("With a heavy sigh, you decided to press on and leave the chest behind..."));
        return false;
      }
    } else {
      pbSEPlay("Battle catch click");
      if (!trapChest) await pbMaxLairMenu("treasure");
      if (trapChest) await trapMessages();
      return true;
    }
  },

  //-----------------------------------------------------------------------------
  // Lair Keys
  // Collects a key that may be used to unlock doors and chests.
  //-----------------------------------------------------------------------------
  async lairTileKey(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    this.keycount += 1;
    await pbMessage(_INTL("\\me[Bug catching 3rd]You found a Lair Key!\\wtnp[30]"));
    return true;
  },

  //-----------------------------------------------------------------------------
  // Locked Door
  // Prevents passage unless a key is used to unlock it.
  //-----------------------------------------------------------------------------
  async lairTileDoor(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    if (debugCtrl()) return true;
    await pbMessage(_INTL("A massive locked door blocks your path."));
    if (this.keycount > 0) {
      this.keycount -= 1;
      await pbMessage(_INTL("You used a Lair Key to open the door!"));
      pbSEPlay("Battle catch click");
      await pbWait(2);
      pbSEPlay("Door open");
      return true;
    } else {
      await pbMessage(_INTL("Unable to proceed, you turned back the way you came."));
      return false;
    }
  },

  //-----------------------------------------------------------------------------
  // Flare
  // Lights a found flare to illuminate a dark lair and increase visibility.
  //-----------------------------------------------------------------------------
  async lairTileFlare(this: DynamaxAdventure): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    await pbMessage(_INTL("\\me[Bug catching 3rd]You found a Flare!\\wtnp[30]"));
    if (this.darknessMap) {
      await pbMessage(_INTL("You lit the flare and increased your visibility!"));
      return true;
    } else {
      await pbMessage(_INTL("But this is of no use to you in this lair..."));
      return false;
    }
  },

  //-----------------------------------------------------------------------------
  // Roadblocks
  // Prevents movement unless a party member meets certain criteria.
  //-----------------------------------------------------------------------------
  async lairTileBlock(this: DynamaxAdventure, value: number): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    if (debugCtrl()) return true;
    let pokemon: Pokemon | null = null;
    let text = "";
    const party = player().pokemonParty();
    const lastWith = (test: (p: Pokemon) => boolean) => { for (const p of party) if (test(p)) pokemon = p; };
    const firstWith = (test: (p: Pokemon) => boolean) => {
      for (const p of party) {
        if (pokemon) break;
        if (test(p)) pokemon = p;
      }
    };
    switch (value) {
      //---------------------------------------------------------------------------
      case 0: // Flying-type (Chasm)
        await pbMessage(_INTL("A deep chasm blocks your path."));
        await pbMessage(_INTL("A Flying-type Pokémon may be able to lift you safely across."));
        text = "{1} happily carried you across the chasm.";
        lastWith((p) => p.hasType("FLYING"));
        break;
      //---------------------------------------------------------------------------
      case 1: // Water-type (Ferry)
        await pbMessage(_INTL("A large pool of murky water blocks your path."));
        await pbMessage(_INTL("A Water-type Pokémon may be able to ferry you safely across."));
        text = "{1} happily carried you across the water.";
        lastWith((p) => p.hasType("WATER"));
        break;
      //---------------------------------------------------------------------------
      case 2: // Fighting-type (Wall)
        await pbMessage(_INTL("You reached what appears to be a dead end, but the wall here seems thin."));
        await pbMessage(_INTL("A Fighting-type Pokémon may be able to punch through the wall and forge a path forward."));
        text = "{1} bashed through the wall with a mighty blow!";
        lastWith((p) => p.hasType("FIGHTING"));
        break;
      //---------------------------------------------------------------------------
      case 3: // Psychic-type (Pitfall)
        await pbMessage(_INTL("The floor here seems unstable in certain spots, and you may fall through if you proceed."));
        await pbMessage(_INTL("A Psychic-type Pokémon may be able to foresee the safest route forward and avoid any pitfalls."));
        text = "{1} foresaw the dangers ahead and navigated you safely across.";
        lastWith((p) => p.hasType("PSYCHIC"));
        break;
      //---------------------------------------------------------------------------
      case 4: // Rock/Ground/Steel-type (Sandstorm)
        await pbMessage(_INTL("Strong winds funneled through the passage have whipped up a storm of dust that blocks your path."));
        await pbMessage(_INTL("A Rock, Ground, or Steel-type Pokémon may be able to safely guide you through the storm."));
        text = "{1} bravely traversed the storm and led you across.";
        firstWith((p) => p.hasType("ROCK") || p.hasType("GROUND") || p.hasType("STEEL"));
        break;
      //---------------------------------------------------------------------------
      case 5: // Bug/Dark/Ghost (Spooky)
        await pbMessage(_INTL("An eerie wail howling from the depths of the lair stops you cold in your tracks."));
        await pbMessage(_INTL("A Bug, Dark, or Ghost-type Pokémon may be able to scout the path ahead without fear."));
        text = "{1} investigated the eerie wail and discovered it was just the wind!";
        firstWith((p) => p.hasType("BUG") || p.hasType("DARK") || p.hasType("GHOST"));
        break;
      //---------------------------------------------------------------------------
      case 6: // Attack EV's (Boulder)
        await pbMessage(_INTL("A massive boulder blocks your path."));
        await pbMessage(_INTL("A Pokémon sufficienty trained in Attack may be physically capable of moving it."));
        text = "{1} flexed its muscles and tossed the boulder aside with ease!";
        lastWith((p) => p.ev["ATTACK"] === 252);
        break;
      //---------------------------------------------------------------------------
      case 7: // Defense EV's (Rockslide)
        await pbMessage(_INTL("Falling rocks makes it too dangerous to press on."));
        await pbMessage(_INTL("A Pokémon sufficienty trained in Defense may be tough enough to shield you from harm."));
        text = "{1} unflinchingly shrugged off the falling rocks as you moved on ahead!";
        lastWith((p) => p.ev["DEFENSE"] === 252);
        break;
      //---------------------------------------------------------------------------
      case 8: // Speed EV's (Incline)
        await pbMessage(_INTL("A steep incline makes it too difficult to climb any further."));
        await pbMessage(_INTL("A Pokémon sufficienty trained in Speed may be quick enough to carry you up with ease."));
        text = "{1} bolted you up the incline without breaking a sweat!";
        lastWith((p) => p.ev["SPEED"] === 252);
        break;
      //---------------------------------------------------------------------------
      case 9: // Sp.Atk EV's (Barrier)
        await pbMessage(_INTL("An impenetrable barrier of Dynamax energy blocks your path."));
        await pbMessage(_INTL("A Pokémon sufficienty trained in Special Attack may be powerful enough to blast through it."));
        text = "{1} let out a yawn and effortlessly shattered the barrier!";
        lastWith((p) => p.ev["SPECIAL_ATTACK"] === 252);
        break;
      //---------------------------------------------------------------------------
      case 10: // Sp.Def EV's (Energy waves)
        await pbMessage(_INTL("A powerful wave of Dynamax energy prevents you from continuing on this path."));
        await pbMessage(_INTL("A Pokémon sufficienty trained in Special Defense may have enough fortitude to carry you through it."));
        text = "{1} swatted away the waves of energy and carried you through unscathed!";
        lastWith((p) => p.ev["SPECIAL_DEFENSE"] === 252);
        break;
      //---------------------------------------------------------------------------
      case 11: // Balanced EV's (Gauntlet)
        await pbMessage(_INTL("An intimidating gauntlet of various challenges prevents you from pressing onwards."));
        await pbMessage(_INTL("A Pokémon with balanced training may be capable of overcoming the numerous obstacles."));
        text = "{1} impressively traversed the gauntlet with near-perfect form!";
        lastWith((p) => p.ev["ATTACK"] === 50);
        break;
      //---------------------------------------------------------------------------
    }
    if (pokemon) {
      const p = pokemon as Pokemon;
      await pbHiddenMoveAnimation(p);
      await pbMessage(_INTL(text, p.name));
      return true;
    } else {
      await pbMessage(_INTL("Unable to proceed, you turned back the way you came."));
      return false;
    }
  },

  //-----------------------------------------------------------------------------
  // Hidden Traps
  // May inflict negative effects on a random party member when triggered.
  //-----------------------------------------------------------------------------
  async lairTileTrap(this: DynamaxAdventure, value: number): Promise<boolean | null> {
    if (this.ended()) return null;
    if (!this.inProgress()) return null;
    pbSEPlay("Exclaim");
    const pokemon = sample(player().party)!;
    let text1 = "", text2 = "", text3 = "";
    let failure = false;
    let status = "NONE";
    switch (value) {
      //---------------------------------------------------------------------------
      case 0: // Damage (Falling)
        await pbMessage(_INTL("You suddenly lost your footing and fell down a deep shaft!"));
        text1 = "{1} came to your rescue and cushioned your fall!";
        text2 = "Luckily, {1} managed to avoid harm!";
        text3 = "However, {1} was injured in the process...";
        failure = rand(10) < 2;
        break;
      //---------------------------------------------------------------------------
      case 1: // Sleep (Mushroom spores)
        await pbMessage(_INTL("A nearby overgrown mushroom suddenly burst and released a cloud of spores!"));
        text1 = "{1} pushed you aside and was hit by the cloud of spores instead!";
        text2 = "Luckily, the spores had no effect on {1}!";
        text3 = "{1} became drowsy due to the spores!";
        failure = pokemon.hasType("GRASS");
        status = "SLEEP";
        break;
      //---------------------------------------------------------------------------
      case 2: // Poison (Mysterious ooze)
        await pbMessage(_INTL("A mysterious ooze leaked from the cieling and fell towards you!"));
        text1 = "{1} pushed you aside and was hit by the mysterious ooze instead!";
        text2 = "Luckily, the mysterious ooze had no effect on {1}!";
        text3 = "{1} became poisoned due to the mysterious ooze!";
        failure = pokemon.hasType("POISON");
        status = "POISON";
        break;
      //---------------------------------------------------------------------------
      case 3: // Burn (Hot steam)
        await pbMessage(_INTL("A geyser of hot steam suddenly erupted beneath your feet!"));
        text1 = "{1} pushed you aside and was hit by the hot steam instead!";
        text2 = "Luckily, the hot steam had no effect on {1}!";
        text3 = "{1} became burned due to the hot steam!";
        failure = pokemon.hasType("FIRE");
        status = "BURN";
        break;
      //---------------------------------------------------------------------------
      case 4: // Paralysis (Electrical pulse)
        await pbMessage(_INTL("An electrical pulse was suddenly released by charged iron deposits nearby!"));
        text1 = "{1} pushed you aside and was hit by the electrical pulse instead!";
        text2 = "Luckily, the electrical pulse had no effect on {1}!";
        text3 = "{1} became paralyzed due to the electrical pulse!";
        failure = pokemon.hasType("ELECTRIC");
        status = "PARALYSIS";
        break;
      //---------------------------------------------------------------------------
      case 5: // Frozen (Frigid water)
        await pbMessage(_INTL("You walked over a sheet of ice and it began to crack beneath your feet!"));
        text1 = "{1} pushed you aside and plunged into the frigid water instead!";
        text2 = "Luckily, the frigid water had no effect on {1}!";
        text3 = "{1} was frozen solid due to the frigid water!";
        failure = pokemon.hasType("ICE");
        status = "FROZEN";
        break;
      //---------------------------------------------------------------------------
    }
    await pbHiddenMoveAnimation(pokemon);
    await pbMessage(_INTL(text1, pokemon.name));
    if (failure) {
      pbSEPlay("Mining found all");
      await pbMessage(_INTL(text2, pokemon.name));
    } else {
      if (value === 0) {
        pokemon.hp -= Math.floor(pokemon.totalhp / 4);
        if (pokemon.hp <= 0) pokemon.hp = 1;
      } else {
        pokemon.status = status;
        if (value === 1) pokemon.statusCount = 4;
      }
      pbSEPlay("Battle damage normal");
      await pbMessage(_INTL(text3, pokemon.name));
    }
    return true;
  },
};

/** $DEBUG && Input.press?(Input::CTRL) */
function debugCtrl(): boolean { return DEBUG && Input.press(Input.CTRL); }

Object.assign(DynamaxAdventure.prototype, methods);
type Methods = typeof methods;
declare module "./Adventure_Main" {
  interface DynamaxAdventure extends Methods {}
}
