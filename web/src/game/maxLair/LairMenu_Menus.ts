// Port of Plugins/ZUD Mechanics/[010] Adventures/LairMenu_Menus.rb: the Max
// Lair menus (rental, exchange, equip, training, tutor, prize, treasure and
// record screens; methods of MaxLairEventScene, installed on its prototype),
// pbMaxLairMenu and MaxLairScreen.

import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Type } from "../../data/gameData/type";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Tone } from "../../rgss/types";
import { drawTextEx, pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { pbFadeOutIn } from "../../ui/fades";
import { pbDisposeSpriteHash } from "../../ui/messageConfig";
import { pbConfirmMessage, pbMessage } from "../../ui/messages";
import { pbPlayCloseMenuSE } from "../../ui/options/options";
import { PokemonPokedexInfo_Scene, PokemonPokedexInfoScreen } from "../../ui/pokedex/pokedexEntry";
import { IconSprite } from "../../ui/SpriteWrapper";
import { ItemIconSprite, preloadItemIcons } from "../../ui/sprites/itemIcon";
import { preloadPokemonSprite, PokemonSprite } from "../../ui/sprites/pokemonSprite";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { pbWait as pbWaitFrames } from "../../ui/scenes/frames";
import { PokemonBag } from "../items/PokemonBag";
import { pbPlayCursorSE, pbPlayDecisionSE, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import { pbNicknameAndStore } from "../pokemon/utilities";
import type { Player } from "../trainer/Player";
import { startsWithVowel } from "../items/itemUtilities";
import { raidRewards } from "../maxRaid/Raid_Setup";
import { sample, shuffle as shuffleArray, shuffleInPlace } from "../maxRaid/random";
import { lairEndlessRecord, pbDynamaxAdventure } from "./Adventure_Main";
import { MaxLairEventScene, preloadLairPokemon } from "./LairMenu_Base";

const player = () => G.player as unknown as Player;
const BASE = MaxLairEventScene.BASE;
const SHADOW = MaxLairEventScene.SHADOW;

/** The Max Lair menus pbMaxLairMenu opens. */
export type LairMenuType = "rental" | "exchange" | "equip" | "train" | "tutor" | "prize" | "treasure" | "record";

const methods = {
  //=============================================================================
  // Rental screen.
  //=============================================================================
  async pbRentalSelect(this: MaxLairEventScene): Promise<void> {
    await this.pbDrawRentalScreen();
    let index = -1;
    const maxindex = this.rentals.length - 1;
    drawTextEx(this.statictext, 4, 52, 164, 0, _INTL("Rental Party:"), BASE, SHADOW);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (this.rentalparty.length > 0) {
        this.sprites.actionbutton.visible = true;
        drawTextEx(this.statictext, 62, 353, 120, 0, _INTL("Summary"), BASE, SHADOW);
      }
      //-------------------------------------------------------------------------
      // Scrolls up/down through rental options.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.DOWN)) {
        pbPlayCursorSE();
        index += 1;
        if (index > maxindex) index = 0;
        this.sprites.slotsel.y = this.sprites[`pokeslot${index}`].y;
        this.sprites.rightarrow.y = 80 + (index * 114);
        this.sprites.slotsel.visible = true;
        this.sprites.rightarrow.visible = true;
      } else if (Input.trigger(Input.UP)) {
        pbPlayCursorSE();
        index -= 1;
        if (index < 0) index = maxindex;
        this.sprites.slotsel.y = this.sprites[`pokeslot${index}`].y;
        this.sprites.rightarrow.y = 80 + (index * 114);
        this.sprites.slotsel.visible = true;
        this.sprites.rightarrow.visible = true;
      //-------------------------------------------------------------------------
      // View the Summary of the current rental party.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.ACTION) && this.rentalparty.length > 0) {
        pbPlayDecisionSE();
        await this.pbSummary(this.rentalparty, 0, this.sprites);
      //-------------------------------------------------------------------------
      // Select a rental Pokemon.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.USE) && index > -1) {
        pbPlayDecisionSE();
        const cmd = await this.pbShowCommands([_INTL("Select"), _INTL("Summary"), _INTL("Back")], 0);
        if (cmd === 0) {
          //-----------------------------------------------------------------------
          // Adds the selected rental Pokemon to your rental team.
          //-----------------------------------------------------------------------
          const poke = this.rentals[index]!;
          if (await pbConfirmMessage(_INTL("Add {1} to your rental team?", poke.name))) {
            poke.playCry();
            this.rentalparty.push(poke);
            await pbWaitFrames(25);
            index = -1;
            for (let i = 0; i < this.rentals.length; i++) {
              this.sprites[`pkmnsprite${i}`].dispose();
              this.sprites[`gmaxsprite${i}`].dispose();
              this.sprites[`helditem${i}`].dispose();
            }
            this.pbClearAll();
            this.sprites.slotsel.visible = false;
            this.sprites.rightarrow.visible = false;
            await this.pbDrawRentalScreen();
            if (this.rentalparty.length >= this.size) {
              await pbWaitFrames(20);
              player().party = this.rentalparty;
              break;
            }
          }
        } else if (cmd === 1) {
          //-----------------------------------------------------------------------
          // View the Summary of the selected rental Pokemon.
          //-----------------------------------------------------------------------
          await this.pbSummary(this.rentals, index, this.sprites);
        }
      //-------------------------------------------------------------------------
      // Ends the Adventure.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.BACK)) {
        if (await pbConfirmMessage(_INTL("End the Dynamax Adventure?"))) break;
      }
    }
    pbPlayCloseMenuSE();
    await this.pbEndScene();
  },

  //=============================================================================
  // Exchange screen.
  //=============================================================================
  async pbSwapSelect(this: MaxLairEventScene): Promise<void> {
    const pokemon = pbDynamaxAdventure().newRental ?? pbDynamaxAdventure().generateRental();
    await this.pbDrawSwapScreen(pokemon);
    this.sprites.slotsel.visible = true;
    drawTextEx(this.statictext, 4, 52, 164, 0, _INTL("Current Party:"), BASE, SHADOW);
    drawTextEx(this.statictext, 220, 6, 400, 0, _INTL("Select a party member to swap."), BASE, SHADOW);
    if (await pbConfirmMessage(_INTL("Would you like to swap Pokémon?"))) {
      await pbMessage(_INTL("Select a party member to exchange."));
      let index = 0;
      const maxindex = player().party.length - 1;
      this.sprites.leftarrow.y = 95;
      this.sprites.leftarrow.visible = true;
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        //-----------------------------------------------------------------------
        // Scrolls up/down through your rental party.
        //-----------------------------------------------------------------------
        if (Input.trigger(Input.DOWN)) {
          pbPlayCursorSE();
          index += 1;
          if (index > maxindex) index = 0;
          this.sprites.leftarrow.y = 95 + (index * 40);
        } else if (Input.trigger(Input.UP)) {
          pbPlayCursorSE();
          index -= 1;
          if (index < 0) index = maxindex;
          this.sprites.leftarrow.y = 95 + (index * 40);
        //-----------------------------------------------------------------------
        // View the Summary of the rental Pokemon.
        //-----------------------------------------------------------------------
        } else if (Input.trigger(Input.ACTION)) {
          pbPlayDecisionSE();
          await this.pbSummary([pokemon], 0, this.sprites);
        //-----------------------------------------------------------------------
        // Select a party member.
        //-----------------------------------------------------------------------
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          const cmd = await this.pbShowCommands([_INTL("Select"), _INTL("Summary"), _INTL("Back")], 0);
          if (cmd === 0) {
            //---------------------------------------------------------------------
            // Exchanges the selected party member for the caught Pokemon.
            //---------------------------------------------------------------------
            const oldpoke = player().party[index]!;
            const olditem = player().party[index]!.itemId;
            if (await pbConfirmMessage(_INTL("Exchange {1} for the new Pokémon?", oldpoke.name))) {
              pokemon.playCry();
              await pbWaitFrames(25);
              this.sprites[`partysprite${index}`].dispose();
              this.sprites.pkmnsprite.dispose();
              this.sprites.gmaxsprite.dispose();
              this.sprites.helditem.dispose();
              this.sprites.slotsel.visible = false;
              this.sprites.leftarrow.visible = false;
              player().party[index] = pokemon;
              player().party[index]!.item = olditem;
              this.pbClearAll();
              await this.pbDrawSwapScreen();
              await pbMessage(_INTL("\\se[]{1} was added to the party!\\se[Pkmn move learnt]", pokemon.name));
              if (olditem != null) {
                await pbMessage(_INTL("{1}'s {2} was given to {3}.", oldpoke.name, Item.get(olditem).portionName, pokemon.name));
              }
              break;
            }
          } else if (cmd === 1) {
            //---------------------------------------------------------------------
            // View the Summary of the selected party member.
            //---------------------------------------------------------------------
            await this.pbSummary(player().party, index, this.sprites);
          }
        //-----------------------------------------------------------------------
        // Exits without swapping.
        //-----------------------------------------------------------------------
        } else if (Input.trigger(Input.BACK)) {
          if (await pbConfirmMessage(_INTL("Move on without swapping?"))) break;
        }
      }
    }
    pbDynamaxAdventure().newRental = null;
    pbPlayCloseMenuSE();
    await this.pbEndScene();
  },

  //=============================================================================
  // Equip screen.
  //=============================================================================
  async pbItemSelect(this: MaxLairEventScene): Promise<void> {
    const items: Id[] = [];
    //---------------------------------------------------------------------------
    // General item pool.
    //---------------------------------------------------------------------------
    const itempool: Id[] = ["ABILITYSHIELD", "AIRBALLOON", "ASSAULTVEST", "BRIGHTPOWDER",
      "CHOICESCARF", "CLEARAMULET", "COVERTCLOAK", "EXPERTBELT",
      "FOCUSBAND", "FOCUSSASH", "LEFTOVERS", "LIFEORB",
      "LIGHTCLAY", "MIRRORHERB", "POWERHERB", "PROTECTIVEPADS",
      "PUNCHINGGLOVE", "QUICKCLAW", "RAZORCLAW", "ROCKYHELMET",
      "SAFETYGOGGLES", "SCOPELENS", "SHELLBELL", "STICKYBARB",
      "UTILITYUMBRELLA", "WEAKNESSPOLICY", "WHITEHERB", "WIDELENS",
      "ZOOMLENS", "SITRUSBERRY", "LUMBERRY", "LEPPABERRY",
      "ELECTRICSEED", "GRASSYSEED", "MISTYSEED", "PSYCHICSEED"];
    //---------------------------------------------------------------------------
    // Adds type-specific items to item pool based on the party's types.
    //---------------------------------------------------------------------------
    for (const type of Type.each()) {
      if (!player().hasPokemonOfType(type.id)) continue;
      switch (type.id) {
        case "NORMAL": itempool.push("NORMALGEM", "SILKSCARF"); break;
        case "FIGHTING": itempool.push("BLACKBELT"); break;
        case "FLYING": itempool.push("SHARPBEAK"); break;
        case "POISON": itempool.push("POISONBARB", "BLACKSLUDGE"); break;
        case "BUG": itempool.push("SILVERPOWDER"); break;
        case "GROUND": itempool.push("SOFTSAND"); break;
        case "ROCK": itempool.push("HARDROCK"); break;
        case "GHOST": itempool.push("SPELLTAG"); break;
        case "STEEL": itempool.push("METALCOAT"); break;
        case "FIRE": itempool.push("CHARCOAL"); break;
        case "WATER": itempool.push("MYSTICWATER"); break;
        case "GRASS": itempool.push("MIRACLESEED"); break;
        case "ELECTRIC": itempool.push("MAGNET"); break;
        case "PSYCHIC": itempool.push("TWISTEDSPOON"); break;
        case "ICE": itempool.push("NEVERMELTICE"); break;
        case "DRAGON": itempool.push("DRAGONFANG"); break;
        case "DARK": itempool.push("BLACKGLASSES"); break;
        case "FAIRY": itempool.push("PIXIEPLATE"); break;
      }
    }
    //---------------------------------------------------------------------------
    // Allows for certain items to appear depending on the party.
    //---------------------------------------------------------------------------
    if (player().hasSpecies("PIKACHU") && Item.exists("LIGHTBALL")) items.push("LIGHTBALL");
    if (player().hasSpecies("MAROWAK") && Item.exists("THICKCLUB")) items.push("THICKCLUB");
    if ((player().hasSpecies("FARFETCHD") || player().hasSpecies("SIRFETCHD")) && Item.exists("LEEK")) items.push("LEEK");
    if (player().party.some((p) => p && p.speciesData().getEvolutions(true).length > 0)) items.push("EVIOLITE");
    if (player().party.some((p) => p && p.ev["ATTACK"]! > 0)) itempool.push("CHOICEBAND", "MUSCLEBAND");
    if (player().party.some((p) => p && p.ev["SPECIAL_ATTACK"]! > 0)) itempool.push("CHOICESPECS", "WISEGLASSES");
    //---------------------------------------------------------------------------
    for (;;) {
      if (itempool.length === 0) break;
      const randitem = sample(itempool)!;
      for (let i = itempool.length - 1; i >= 0; i--) if (itempool[i] === randitem) itempool.splice(i, 1);
      if (!Item.exists(randitem) || items.includes(randitem)) continue;
      items.push(randitem);
      if (items.length >= 6) break;
    }
    shuffleInPlace(items);
    await this.pbDrawItemScreen(items);
    let ended = false;
    this.sprites.menu.visible = true;
    this.sprites.actionbutton.visible = true;
    drawTextEx(this.statictext, 4, 52, 164, 0, _INTL("Current Party:"), BASE, SHADOW);
    drawTextEx(this.statictext, 62, 353, 120, 0, _INTL("Summary"), BASE, SHADOW);
    await preloadLairPokemon(player().party);
    await preloadItemIcons(player().party.map((p) => p.itemId));
    this.pbDrawParty(player().party, false);
    player().party.forEach((pkmn, i) => {
      const spritex = this.sprites[`partysprite${i}`].x;
      const spritey = this.sprites[`partysprite${i}`].y;
      const icon = this.sprites[`partyitem${i}`] = new ItemIconSprite(spritex + 73, spritey + 20, pkmn.itemId, this.viewport);
      icon.zoomX = 0.5;
      icon.zoomY = 0.5;
      if (!pkmn.itemId) icon.visible = false;
    });
    if (await pbConfirmMessage(_INTL("Would you like to give items to your Pokémon?"))) {
      const party = player().party;
      for (let i = 0; i < party.length; i++) {
        const pkmn = party[i]!;
        let index = 0;
        const maxindex = items.length - 1;
        let text = "";
        await pbMessage(_INTL("Select an item to give to {1}.", pkmn.name));
        if (pkmn.itemId) {
          const olditem = Item.get(pkmn.itemId).portionName;
          text = startsWithVowel(olditem) ? "an" : "a";
          text = _INTL("{1} is already holding {2} {3}.", pkmn.name, text, olditem);
          if (!(await pbConfirmMessage(_INTL("{1}\nReplace this item?", text)))) continue;
        }
        this.textPos.push([_INTL("Select {1}'s item.", pkmn.name), 250, 5, 0, BASE, SHADOW]);
        this.textPos.push([_INTL("{1}", pkmn.name), 46, (95 + (i * 40)) + 5, 0, BASE, SHADOW]);
        pbDrawTextPositions(this.changetext, this.textPos);
        this.sprites.rightarrow.x = this.xpos + 44;
        this.sprites.rightarrow.y = this.sprites[`itembg${index}`].y + 5;
        this.sprites.rightarrow.visible = true;
        this.sprites[`partyitem${i}`].visible = false;
        for (;;) {
          await Graphics.update();
          Input.update();
          this.pbUpdate();
          //---------------------------------------------------------------------
          // Scrolls up/down through the item options.
          //---------------------------------------------------------------------
          if (Input.trigger(Input.DOWN)) {
            pbPlayCursorSE();
            index += 1;
            if (index > maxindex) index = 0;
            this.sprites.rightarrow.y = this.sprites[`itembg${index}`].y + 5;
          } else if (Input.trigger(Input.UP)) {
            pbPlayCursorSE();
            index -= 1;
            if (index < 0) index = maxindex;
            this.sprites.rightarrow.y = this.sprites[`itembg${index}`].y + 5;
          //---------------------------------------------------------------------
          // View the Summary of the party.
          //---------------------------------------------------------------------
          } else if (Input.trigger(Input.ACTION)) {
            pbPlayDecisionSE();
            await this.pbSummary(player().party, i, this.sprites);
          //---------------------------------------------------------------------
          // Select an item.
          //---------------------------------------------------------------------
          } else if (Input.trigger(Input.USE)) {
            pbPlayDecisionSE();
            const cmd = await this.pbShowCommands([_INTL("Give"), _INTL("Details"), _INTL("Next"), _INTL("Exit")], 0);
            const itemname = Item.get(items[index]!).name;
            const itemportion = Item.get(items[index]!).portionName;
            if (cmd === 0) {
              //-------------------------------------------------------------------
              // Equips the selected hold item.
              //-------------------------------------------------------------------
              if (pkmn.hasItem(items[index]!)) {
                await pbMessage(_INTL("{1}", text));
              } else if (await pbConfirmMessage(_INTL("Give the {1} to {2}?", itemportion, pkmn.name))) {
                pkmn.playCry();
                await pbWaitFrames(25);
                await pbMessage(_INTL("{1} was given the {2}.", pkmn.name, itemportion));
                this.sprites[`partyitem${i}`].item = items[index]!;
                this.sprites[`partyitem${i}`].visible = true;
                this.sprites.rightarrow.visible = false;
                pkmn.item = items[index]!;
                for (let item = 0; item < items.length; item++) {
                  this.sprites[`itembg${item}`].dispose();
                  this.sprites[`itemname${item}`].dispose();
                  this.sprites[`itemsprite${item}`].dispose();
                }
                items.splice(index, 1);
                this.pbClearAll();
                await this.pbDrawItemScreen(items);
                break;
              }
            } else if (cmd === 1) {
              //-------------------------------------------------------------------
              // Checks the decription of the selected item.
              //-------------------------------------------------------------------
              await pbMessage(_INTL("{1}:\n{2}", itemname, Item.get(items[index]!).heldDescription));
            } else if (cmd === 2) {
              //-------------------------------------------------------------------
              // Skips to the next Pokemon.
              //-------------------------------------------------------------------
              if (await pbConfirmMessage(_INTL("Skip {1} without giving it an item?", pkmn.name))) {
                if (pkmn.itemId) this.sprites[`partyitem${i}`].visible = true;
                this.sprites.rightarrow.visible = false;
                for (let item = 0; item < items.length; item++) {
                  this.sprites[`itembg${item}`].dispose();
                  this.sprites[`itemname${item}`].dispose();
                  this.sprites[`itemsprite${item}`].dispose();
                }
                this.pbClearAll();
                await this.pbDrawItemScreen(items);
                break;
              }
            } else if (cmd === 3) {
              //-------------------------------------------------------------------
              // Exits item selection.
              //-------------------------------------------------------------------
              if (await pbConfirmMessage(_INTL("Move on without equipping any more items?"))) {
                ended = true;
                break;
              }
            }
          //---------------------------------------------------------------------
          // Exits item selection.
          //---------------------------------------------------------------------
          } else if (Input.trigger(Input.BACK)) {
            if (await pbConfirmMessage(_INTL("Move on without equipping any more items?"))) {
              ended = true;
              break;
            }
          }
        }
        if (ended) break;
      }
    }
    pbPlayCloseMenuSE();
    await this.pbEndScene();
  },

  //=============================================================================
  // Training screen.
  //=============================================================================
  async pbTrainingSelect(this: MaxLairEventScene): Promise<void> {
    const stats: [string, number][] = [
      [_INTL("Attack"), Stat.get("ATTACK").pbsOrder],
      [_INTL("Defense"), Stat.get("DEFENSE").pbsOrder],
      [_INTL("Sp. Atk"), Stat.get("SPECIAL_ATTACK").pbsOrder],
      [_INTL("Sp. Def"), Stat.get("SPECIAL_DEFENSE").pbsOrder],
      [_INTL("Speed"), Stat.get("SPEED").pbsOrder],
      [_INTL("Balanced"), 0],
    ];
    let ended = false;
    this.sprites.menu.visible = true;
    this.sprites.actionbutton.visible = true;
    drawTextEx(this.statictext, 4, 52, 164, 0, _INTL("Current Party:"), BASE, SHADOW);
    drawTextEx(this.statictext, 62, 353, 120, 0, _INTL("Summary"), BASE, SHADOW);
    await preloadLairPokemon(player().party);
    this.pbDrawParty(player().party, false);
    this.pbDrawStatScreen(stats);
    if (await pbConfirmMessage(_INTL("Would you like to train your Pokémon?\nDoing so may undo thier current training."))) {
      const party = player().party;
      for (let i = 0; i < party.length; i++) {
        const pkmn = party[i]!;
        let oldstat = 0;
        let index = 0;
        const maxindex = stats.length - 1;
        for (const s of Stat.eachMain()) {
          if (s.id === "HP" || pkmn.ev[s.id] !== 252) continue;
          oldstat = s.pbsOrder;
        }
        await pbMessage(_INTL("Select the type of training {1} should undergo.", pkmn.name));
        this.changesprites.clear();
        party.forEach((other, j) => {
          if (pkmn === other) return;
          this.pbDrawStatIcons(other, this.sprites[`partysprite${j}`]);
        });
        this.textPos.push([_INTL("Select {1}'s training.", pkmn.name), 230, 5, 0, BASE, SHADOW]);
        this.textPos.push([_INTL("{1}", pkmn.name), 46, (96 + (i * 40)) + 5, 0, BASE, SHADOW]);
        pbDrawTextPositions(this.changetext, this.textPos);
        this.sprites.rightarrow.x = this.xpos + 44;
        this.sprites.rightarrow.y = this.sprites[`statbg${index}`].y + 5;
        this.sprites.rightarrow.visible = true;
        for (;;) {
          await Graphics.update();
          Input.update();
          this.pbUpdate();
          //---------------------------------------------------------------------
          // Scrolls up/down through the stat options.
          //---------------------------------------------------------------------
          if (Input.trigger(Input.DOWN)) {
            pbPlayCursorSE();
            index += 1;
            if (index > maxindex) index = 0;
            this.sprites.rightarrow.y = this.sprites[`statbg${index}`].y + 5;
          } else if (Input.trigger(Input.UP)) {
            pbPlayCursorSE();
            index -= 1;
            if (index < 0) index = maxindex;
            this.sprites.rightarrow.y = this.sprites[`statbg${index}`].y + 5;
          //---------------------------------------------------------------------
          // View the Summary of the party.
          //---------------------------------------------------------------------
          } else if (Input.trigger(Input.ACTION)) {
            pbPlayDecisionSE();
            await this.pbSummary(player().party, i, this.sprites);
          //---------------------------------------------------------------------
          // Select a training course.
          //---------------------------------------------------------------------
          } else if (Input.trigger(Input.USE)) {
            pbPlayDecisionSE();
            const cmd = await this.pbShowCommands([_INTL("Train"), _INTL("Details"), _INTL("Next"), _INTL("Exit")], 0);
            const name = stats[index]![0];
            const newstat = stats[index]![1];
            if (cmd === 0) {
              //-------------------------------------------------------------------
              // Trains up the selected stat for the Pokemon.
              //-------------------------------------------------------------------
              const oldTotals: number[] = [];
              const newTotals: number[] = [];
              if (newstat === oldstat) {
                await pbMessage(_INTL("{1} already has {2} training.", pkmn.name, name));
              } else if (await pbConfirmMessage(_INTL("Give {1} some {2} training?", pkmn.name, name))) {
                pkmn.playCry();
                //-------------------------------------------------------------
                // Gets old stat totals
                //-------------------------------------------------------------
                for (const s of Stat.eachMain()) {
                  const v = statValue(pkmn, s.id);
                  if (v != null) oldTotals[s.pbsOrder] = v;
                }
                //-------------------------------------------------------------
                // Applies new EV's
                //-------------------------------------------------------------
                for (const s of Stat.eachMain()) {
                  if (s.id === "HP") continue;
                  pkmn.ev[s.id] = newstat === 0 ? 50 : (s.pbsOrder === newstat ? 252 : 0);
                }
                pkmn.calcStats();
                //-------------------------------------------------------------
                // Gets new stat totals
                //-------------------------------------------------------------
                for (const s of Stat.eachMain()) {
                  const v = statValue(pkmn, s.id);
                  if (v != null) newTotals[s.pbsOrder] = v;
                }
                //-------------------------------------------------------------
                await pbWaitFrames(25);
                await pbMessage(_INTL("{1} unlearned its previous training.\\nAnd...\x01", pkmn.name));
                pbSEPlay("Pkmn move learnt");
                if (newstat === 0) {
                  for (const s of Stat.eachMain()) {
                    if ([0, oldstat].includes(s.pbsOrder)) continue;
                    const diff = newTotals[s.pbsOrder]! - oldTotals[s.pbsOrder]!;
                    await pbMessage(_INTL("{1}'s training increased its {2} by {3} point(s)!", pkmn.name, s.name, diff));
                  }
                } else {
                  const diff = newTotals[newstat]! - oldTotals[newstat]!;
                  await pbMessage(_INTL("{1}'s training increased its {2} by {3} point(s)!", pkmn.name, name, diff));
                }
                this.sprites.rightarrow.visible = false;
                for (let j = 0; j < stats.length; j++) {
                  this.sprites[`statbg${j}`].dispose();
                  this.sprites[`statname${j}`].dispose();
                }
                stats.splice(index, 1);
                this.pbClearAll();
                this.menudisplay.clear();
                this.pbDrawStatScreen(stats);
                break;
              }
            } else if (cmd === 1) {
              //-------------------------------------------------------------------
              // Checks current training.
              //-------------------------------------------------------------------
              switch (newstat) {
                case 0:
                  await pbMessage(_INTL("{1} training will slightly improve {2}'s performance in all stat categories, but no stat will be maximized.", name, pkmn.name));
                  break;
                case 1: case 4: {
                  const category = newstat === 1 ? _INTL("physical") : _INTL("special");
                  await pbMessage(_INTL("{1} training will maximize {2}'s offense with {3} moves, at the expense of its other stats.", name, pkmn.name, category));
                  break;
                }
                case 2: case 5: {
                  const category = newstat === 2 ? _INTL("physical") : _INTL("special");
                  await pbMessage(_INTL("{1} training will maximize {2}'s resistance to {3} moves, at the expense of its other stats.", name, pkmn.name, category));
                  break;
                }
                case 3:
                  await pbMessage(_INTL("{1} training will maximize {2}'s capacity to act sooner than other Pokémon, at the expense of its other stats.", name, pkmn.name));
                  break;
              }
              for (const s of stats) {
                if (s[1] !== oldstat) continue;
                await pbMessage(_INTL("{1} currently has {2} training.", pkmn.name, s[0]));
                break;
              }
            } else if (cmd === 2) {
              //-------------------------------------------------------------------
              // Skips to the next Pokemon.
              //-------------------------------------------------------------------
              if (await pbConfirmMessage(_INTL("Skip {1} without giving it any training?", pkmn.name))) {
                this.sprites.rightarrow.visible = false;
                for (let j = 0; j < stats.length; j++) {
                  this.sprites[`statbg${j}`].dispose();
                  this.sprites[`statname${j}`].dispose();
                }
                this.pbClearAll();
                this.menudisplay.clear();
                this.pbDrawStatScreen(stats);
                break;
              }
            } else if (cmd === 3) {
              //-------------------------------------------------------------------
              // Exits training selection.
              //-------------------------------------------------------------------
              if (await pbConfirmMessage(_INTL("Move on without any further training?"))) {
                ended = true;
                break;
              }
            }
          //---------------------------------------------------------------------
          // Exits training selection.
          //---------------------------------------------------------------------
          } else if (Input.trigger(Input.BACK)) {
            if (await pbConfirmMessage(_INTL("Move on without any further training?"))) {
              ended = true;
              break;
            }
          }
        }
        if (ended) break;
      }
    }
    pbPlayCloseMenuSE();
    await this.pbEndScene();
  },

  //=============================================================================
  // Tutor screen.
  //=============================================================================
  async pbTutorSelect(this: MaxLairEventScene): Promise<void> {
    let movesToLearn = player().party.length;
    this.sprites.pokeslot1.visible = true;
    this.sprites.actionbutton.visible = true;
    drawTextEx(this.statictext, 4, 52, 164, 0, _INTL("Current Party:"), BASE, SHADOW);
    drawTextEx(this.statictext, 62, 353, 120, 0, _INTL("Summary"), BASE, SHADOW);
    await preloadLairPokemon(player().party);
    this.pbDrawParty(player().party);
    if (await pbConfirmMessage(_INTL("Would you like to tutor your Pokémon?"))) {
      await pbMessage(_INTL("Which Pokémon requires tutoring?"));
      let index = 0;
      const maxindex = player().party.length - 1;
      let moveSwap = false;
      const newmoves: (Id | null)[] = [];
      for (const pkmn of player().party) newmoves.push(this.pbGenerateTutorMove(pkmn));
      this.sprites.leftarrow.y = 95;
      this.sprites.leftarrow.visible = true;
      this.pbDrawTutorScreen(movesToLearn, player().party[index]!, newmoves[index]!);
      for (;;) {
        await Graphics.update();
        Input.update();
        this.pbUpdate();
        //-----------------------------------------------------------------------
        // Scrolls up/down through your rental party.
        //-----------------------------------------------------------------------
        if (Input.trigger(Input.DOWN)) {
          pbPlayCursorSE();
          index += 1;
          if (index > maxindex) index = 0;
          this.sprites.leftarrow.y = 95 + (index * 40);
          this.pbDrawTutorScreen(movesToLearn, player().party[index]!, newmoves[index]!);
        } else if (Input.trigger(Input.UP)) {
          pbPlayCursorSE();
          index -= 1;
          if (index < 0) index = maxindex;
          this.sprites.leftarrow.y = 95 + (index * 40);
          this.pbDrawTutorScreen(movesToLearn, player().party[index]!, newmoves[index]!);
        //-----------------------------------------------------------------------
        // View the Summary of the current rental party.
        //-----------------------------------------------------------------------
        } else if (Input.trigger(Input.ACTION)) {
          pbPlayDecisionSE();
          await this.pbSummary(player().party, index, this.sprites);
        //-----------------------------------------------------------------------
        // Select a party member.
        //-----------------------------------------------------------------------
        } else if (Input.trigger(Input.USE)) {
          pbPlayDecisionSE();
          const pkmn = player().party[index]!;
          // NOTE (Ruby parity): the move's name is read before checking that
          // there is one (GameData::Move.get(nil) raises, LairMenu_Menus.rb:668).
          if (!newmoves[index]) throw new Error("Unknown ID nil. (GameData::Move.get)");
          const movename = Move.get(newmoves[index]!).name;
          if (newmoves[index]) {
            const commands = [_INTL("Teach"), _INTL("Details")];
            if (!moveSwap) commands.push(_INTL("New Move"));
            commands.push(_INTL("Back"));
            const cmd = await this.pbShowCommands(commands, 0);
            if (cmd === 0) {
              //-------------------------------------------------------------------
              // Select a move to replace.
              //-------------------------------------------------------------------
              if (await pbConfirmMessage(_INTL("Teach {1} the move {2}?", pkmn.name, movename))) {
                pkmn.playCry();
                await pbWaitFrames(25);
                if (pkmn.numMoves() < 4) {
                  await pbMessage(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]", pkmn.name, movename));
                  pkmn.learnMove(newmoves[index]!);
                  movesToLearn -= 1;
                  newmoves[index] = this.pbGenerateTutorMove(pkmn);
                  this.pbDrawTutorScreen(movesToLearn, pkmn, newmoves[index]!);
                } else {
                  // NOTE (Ruby parity): `@scene.pbForgetMove` — MaxLairEventScene
                  // has no @scene, so tutoring a Pokémon that knows four moves
                  // raises NoMethodError (LairMenu_Menus.rb:690).
                  throw new Error("undefined method `pbForgetMove' for nil:NilClass");
                }
                if (movesToLearn <= 0) break;
              }
            } else if (cmd === 1) {
              //-------------------------------------------------------------------
              // Display the description of the new move.
              //-------------------------------------------------------------------
              await pbMessage(_INTL("{1}:\n{2}", movename, Move.get(newmoves[index]!).description));
            } else if (![-1, commands.length - 1].includes(cmd)) {
              //-------------------------------------------------------------------
              // Swap out the current move.
              //-------------------------------------------------------------------
              if (await pbConfirmMessage(_INTL("Would you like to swap out {1} for a different move?\nThis may only be done once.", movename))) {
                const newmove = this.pbGenerateTutorMove(pkmn, newmoves[index]!);
                if (newmove && newmove !== newmoves[index]) {
                  await pbMessage(_INTL("\\se[]The move {1} may now be taught to {2}!\\se[Pkmn move learnt]", Move.get(newmove).name, pkmn.name));
                  newmoves[index] = newmove;
                  this.pbDrawTutorScreen(movesToLearn, pkmn, newmoves[index]!);
                  moveSwap = true;
                } else {
                  await pbMessage(_INTL("{1} has no other moves to learn.", pkmn.name));
                }
              }
            }
          } else {
            await pbMessage(_INTL("{1} has no other moves to learn.", pkmn.name));
          }
        } else if (Input.trigger(Input.BACK)) {
          if (await pbConfirmMessage(_INTL("Move on without any additional tutoring?"))) break;
        }
      }
    }
    pbPlayCloseMenuSE();
    await this.pbEndScene();
  },

  //=============================================================================
  // Prize screen.
  //=============================================================================
  async pbPrizeSelect(this: MaxLairEventScene): Promise<void> {
    this.sprites.menu.visible = true;
    //---------------------------------------------------------------------------
    // Draws prizes.
    //---------------------------------------------------------------------------
    const prizes = pbDynamaxAdventure().prizes;
    for (let i = 0; i < 6; i++) {
      this.sprites[`partybg${i}`].x = this.xpos + 100;
      this.sprites[`partybg${i}`].y -= 30;
      this.sprites[`partybg${i}`].visible = i < prizes.length;
      this.sprites[`partyname${i}`].x = this.sprites[`partybg${i}`].x + 37;
      this.sprites[`partyname${i}`].y = this.sprites[`partybg${i}`].y + 9;
      this.sprites[`partyname${i}`].visible = i < prizes.length;
    }
    await Promise.all([preloadLairPokemon(prizes), ...prizes.map((p) => preloadPokemonSprite(p))]);
    this.pbDrawParty(prizes);
    //---------------------------------------------------------------------------
    // Draws loot.
    //---------------------------------------------------------------------------
    const loot = pbDynamaxAdventure().loot;
    let itemname = Item.get("DYNITEORE").name;
    if ("DYNITEORE" in loot) {
      await preloadItemIcons(["DYNITEORE"]);
      const spritex = 4;
      const spritey = 30;
      const bg = this.sprites.itembg = new IconSprite(spritex, spritey, this.viewport);
      bg.setBitmapFile(this.partyPath);
      const name = this.sprites.itemname = new IconSprite(spritex + 36, spritey + 9, this.viewport);
      name.setBitmapFile(this.path + "menu_slot");
      name.srcRect.set(166, 20, 150, 20);
      const icon = this.sprites.itemsprite = new ItemIconSprite(spritex + 19, spritey + 18, "DYNITEORE", this.viewport);
      icon.zoomX = 0.5;
      icon.zoomY = 0.5;
      this.textPos.push([_INTL("x{1} {2}", loot.DYNITEORE, itemname), spritex + 40, spritey + 11, 0, BASE, SHADOW]);
      pbDrawTextPositions(this.changetext, this.textPos);
    }
    //---------------------------------------------------------------------------
    await pbMessage(_INTL("You may select one of the captured Pokémon to keep."));
    let index = 0;
    const maxindex = prizes.length - 1;
    const sprite = this.sprites.pokemon = new PokemonSprite(this.viewport);
    sprite.setOffset(PictureOrigin.CENTER);
    sprite.x = 104;
    sprite.y = 190;
    sprite.setPokemonBitmap(prizes[index]!);
    this.sprites.rightarrow.x = this.xpos + 60;
    this.sprites.rightarrow.y = this.sprites[`partysprite${index}`].y + 5;
    this.sprites.rightarrow.visible = true;
    this.sprites.prizebg.visible = true;
    this.sprites.actionbutton.visible = true;
    drawTextEx(this.statictext, 250, 6, 400, 0, _INTL("Select one Pokémon to keep."), BASE, SHADOW);
    if (index > -1) drawTextEx(this.statictext, 62, 353, 120, 0, _INTL("Summary"), BASE, SHADOW);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      //-------------------------------------------------------------------------
      // Scrolls up/down through the prize options.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.DOWN)) {
        pbPlayCursorSE();
        index += 1;
        if (index > maxindex) index = 0;
        sprite.setPokemonBitmap(prizes[index]!);
        this.sprites.rightarrow.y = this.sprites[`partysprite${index}`].y + 5;
      } else if (Input.trigger(Input.UP)) {
        pbPlayCursorSE();
        index -= 1;
        if (index < 0) index = maxindex;
        sprite.setPokemonBitmap(prizes[index]!);
        this.sprites.rightarrow.y = this.sprites[`partysprite${index}`].y + 5;
      //-------------------------------------------------------------------------
      // View the Summary of a prize Pokemon.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.ACTION) && index > -1) {
        pbPlayDecisionSE();
        await this.pbSummary(prizes, index, this.sprites);
      }
      //-------------------------------------------------------------------------
      // Select a prize Pokemon.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.USE)) {
        pbPlayDecisionSE();
        const cmd = await this.pbShowCommands([_INTL("Select"), _INTL("Summary"), _INTL("Back")], 0);
        if (cmd === 0) {
          //-----------------------------------------------------------------------
          // Acquires the selected prize Pokemon.
          //-----------------------------------------------------------------------
          const pkmn = prizes[index]!;
          if (await pbConfirmMessage(_INTL("So, you'd like to take {1} with you?", pkmn.name))) {
            const wasOwned = player().owned(pkmn.species);
            player().pokedex.setSeen(pkmn.species);
            player().pokedex.setOwned(pkmn.species);
            player().pokedex.register(pkmn);
            if (Settings.SHOW_NEW_SPECIES_POKEDEX_ENTRY_MORE_OFTEN && !wasOwned && player().hasPokedex) {
              await pbMessage(_INTL("{1}'s data was added to the Pokédex.", pkmn.speciesName()));
              player().pokedex.registerLastSeen(pkmn);
              await pbFadeOutIn(async () => {
                const scene = new PokemonPokedexInfo_Scene();
                const screen = new PokemonPokedexInfoScreen(scene);
                await screen.pbDexEntry(pkmn.species);
              });
            } else {
              pkmn.playCry();
              await pbWaitFrames(25);
            }
            await pbNicknameAndStore(pkmn);
            await pbMessage(_INTL("You returned any remaining captured Pokémon and your rental party."));
            break;
          }
        } else if (cmd === 1) {
          //-----------------------------------------------------------------------
          // View the Summary of the selected Pokemon.
          //-----------------------------------------------------------------------
          await this.pbSummary(prizes, index, this.sprites);
        }
      } else if (Input.trigger(Input.BACK)) {
        if (await pbConfirmMessage(_INTL("Leave without taking any captured Pokémon with you?"))) break;
      }
    }
    if ("DYNITEORE" in loot) {
      const item = Item.get("DYNITEORE");
      itemname = loot.DYNITEORE === 1 ? item.portionName : item.portionNamePlural;
      await pbMessage(_INTL("You found {1} {2} during your adventure!", loot.DYNITEORE, itemname));
      await pbMessage(_INTL("You put the {1} in\\nyour Bag's <icon=bagPocket{2}>\\c[1]{3}\\c[0] pocket.",
        itemname, item.pocket, PokemonBag.pocketNames()[item.pocket - 1]));
      G.bag.add("DYNITEORE", loot.DYNITEORE!);
      delete pbDynamaxAdventure().loot.DYNITEORE;
    }
    pbPlayCloseMenuSE();
    await this.pbEndScene();
  },

  //=============================================================================
  // Treasure screen.
  //=============================================================================
  async pbTreasureScreen(this: MaxLairEventScene): Promise<void> {
    this.statictext.clear();
    const xpos = Math.floor(Graphics.width / 2), ypos = Math.floor(Graphics.height / 2);
    const header = this.sprites.header = new IconSprite(xpos - 100, ypos - 144, this.viewport);
    header.setBitmapFile(this.path + "menu_header");
    this.sprites.background.visible = false;
    this.sprites.menu.visible = true;
    this.sprites.menu.x = xpos - 150;
    const textPos: TextPosition[] = [[_INTL("Treasure Chest"), xpos, ypos - 122, 2, BASE, SHADOW]];
    let rank = 1, bonus = 1;
    const lairPkmn = pbDynamaxAdventure().lairSpecies;
    const lastPkmn = pbDynamaxAdventure().lastPokemon;
    const species = lastPkmn ? lastPkmn.species : lairPkmn[0]!;
    for (let i = 0; i < lairPkmn.length; i++) {
      if (species === lairPkmn[i]) {
        if (i <= 2) [rank, bonus] = [2, 3];
        else if (i <= 5) [rank, bonus] = [3, 4];
        else if (i <= 8) [rank, bonus] = [4, 5];
        else if (i <= 10) [rank, bonus] = [5, 5];
        break;
      }
    }
    const loot: Id[] = [];
    for (const i of Item.each()) if (i.isEvolutionStone()) loot.push(i.id);
    const rewards = raidRewards(species!, rank, bonus, sample(loot));
    const shown = shuffleArray(rewards);
    await preloadItemIcons(shown.map((r) => r[0]));
    for (let i = 0; i < shown.length; i++) {
      if (i >= rank) break;
      const [item, qty] = shown[i]!;
      if (!item || !Item.exists(item)) continue;
      const spritex = xpos - 90;
      const spritey = (ypos - 75) + (i * 40);
      const bg = this.sprites[`itembg${i}`] = new IconSprite(spritex, spritey, this.viewport);
      bg.setBitmapFile(this.partyPath);
      const name = this.sprites[`itemname${i}`] = new IconSprite(spritex + 36, spritey + 9, this.viewport);
      name.setBitmapFile(this.path + "menu_slot");
      name.srcRect.set(166, 20, 150, 20);
      const icon = this.sprites[`itemsprite${i}`] = new ItemIconSprite(spritex + 19, spritey + 18, item, this.viewport);
      icon.zoomX = 0.5;
      icon.zoomY = 0.5;
      const itemData = Item.get(item);
      const itemname = itemData.isTR() ? _INTL("{1} {2}", itemData.name, Move.get(itemData.move!).name) : itemData.name;
      textPos.push([_INTL("x{1} {2}", qty, itemname), spritex + 40, spritey + 11, 0, BASE, SHADOW]);
      pbDynamaxAdventure().addLoot(item, qty);
    }
    pbDrawTextPositions(this.changetext, textPos);
    await pbWaitFrames(30);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  },

  //=============================================================================
  // Record screen.
  //=============================================================================
  async pbEndlessRecordScreen(this: MaxLairEventScene): Promise<void> {
    this.statictext.clear();
    const xpos = Math.floor(Graphics.width / 2), ypos = Math.floor(Graphics.height / 2);
    const header = this.sprites.header = new IconSprite(xpos - 100, ypos - 144, this.viewport);
    header.setBitmapFile(this.path + "menu_header");
    const record = lairEndlessRecord();
    this.sprites.background.visible = false;
    this.sprites.menu.visible = true;
    this.sprites.menu.x = xpos - 150;
    this.sprites.menu.tone = new Tone(-48, -48, -48);
    const textPos: TextPosition[] = [
      [_INTL("Adventure Record"), xpos, ypos - 122, 2, BASE, SHADOW],
      [_INTL(`${record.map}`), xpos, ypos - 75, 2, BASE, SHADOW],
      [_INTL(`Floor Reached: B${record.floor}F`), xpos, ypos + 76, 2, BASE, SHADOW],
      [_INTL(`Pokémon Battled: ${record.battles}`), xpos, ypos + 105, 2, BASE, SHADOW],
    ];
    for (let i = 0; i < record.party.length; i++) {
      this.sprites[`partybg${i}`].x = xpos - 80;
      this.sprites[`partybg${i}`].y = (ypos - 47) + (i * 40);
      this.sprites[`partybg${i}`].visible = true;
      this.sprites[`partyname${i}`].x = this.sprites[`partybg${i}`].x + 36;
      this.sprites[`partyname${i}`].y = this.sprites[`partybg${i}`].y + 9;
      this.sprites[`partyname${i}`].visible = true;
    }
    await preloadLairPokemon(record.party);
    this.pbDrawParty(record.party);
    pbDrawTextPositions(this.changetext, textPos);
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK) || Input.trigger(Input.USE)) {
        pbPlayCloseMenuSE();
        break;
      }
    }
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
  },
};

/** The four main stats as the training screen reads them (attack, defense, spatk, spdef, speed). */
function statValue(pkmn: Pokemon, stat: Id): number | null {
  switch (stat) {
    case "ATTACK": return pkmn.attack;
    case "DEFENSE": return pkmn.defense;
    case "SPECIAL_ATTACK": return pkmn.spatk;
    case "SPECIAL_DEFENSE": return pkmn.spdef;
    case "SPEED": return pkmn.speed;
  }
  return null;
}


Object.assign(MaxLairEventScene.prototype, methods);
type Methods = typeof methods;
declare module "./LairMenu_Base" {
  interface MaxLairEventScene extends Methods {}
}

//===============================================================================
// Used for accessing various Max Lair menu screens.
//===============================================================================
export async function pbMaxLairMenu(menuType: LairMenuType): Promise<void> {
  const scene = new MaxLairEventScene();
  const screen = new MaxLairScreen(scene);
  await screen.pbStartSetScreen(menuType);
}

export class MaxLairScreen {
  constructor(private scene: MaxLairEventScene) {}

  async pbStartSetScreen(menuType: LairMenuType): Promise<void> {
    switch (menuType) {
      case "treasure":
        await this.scene.pbStartScene(false);
        await this.scene.pbTreasureScreen();
        break;
      case "record":
        await this.scene.pbStartScene(false);
        await this.scene.pbEndlessRecordScreen();
        break;
      default:
        await pbFadeOutIn(async () => {
          await this.scene.pbStartScene();
          switch (menuType) {
            case "rental": await this.scene.pbRentalSelect(); break;
            case "exchange": await this.scene.pbSwapSelect(); break;
            case "equip": await this.scene.pbItemSelect(); break;
            case "train": await this.scene.pbTrainingSelect(); break;
            case "tutor": await this.scene.pbTutorSelect(); break;
            case "prize": await this.scene.pbPrizeSelect(); break;
          }
        });
        break;
    }
  }
}
