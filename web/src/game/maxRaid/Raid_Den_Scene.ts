// Port of Plugins/ZUD Mechanics/[009] Max Raid/Raid_Den_Scene.rb: the Max
// Raid Den screens (MaxRaidScene: saving before a new den, the den's entry
// screen with its rank, silhouette, types, party and field conditions, entering
// the raid, and the rewards screen), raid_InitiateRaidDen and MaxRaidScreen.

import { rand } from "../../core/random";
import { DEBUG } from "../../core/debug";
import { Ability } from "../../data/gameData/ability";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { Move } from "../../data/gameData/move";
import { Type } from "../../data/gameData/type";
import { idOf } from "../../battle/deluxe/rubyData";
import { dxClear } from "../../battle/deluxe/DeluxeTemp";
import { unDynamax } from "../../battle/zud/scene/dynamaxSprite";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import { Color, Rect } from "../../rgss/types";
import { AnimatedBitmap } from "../../ui/AnimatedBitmap";
import { drawTextEx, pbDrawTextPositions, type TextPosition } from "../../ui/drawText";
import { pbFadeOutIn } from "../../ui/fades";
import { pbDisposeSpriteHash, pbSetSmallFont, pbUpdateSpriteHash } from "../../ui/messageConfig";
import { pbConfirmMessage, pbConfirmMessageSerious, pbMessage } from "../../ui/messages";
import { pbPokemonScreen } from "../../ui/party/party";
import { preloadBitmaps } from "../../ui/rpgCache";
import { pbWait } from "../../ui/scenes/frames";
import { PictureOrigin } from "../../ui/scenes/PictureEx";
import { BitmapSprite, IconSprite } from "../../ui/SpriteWrapper";
import { PokemonIconSprite, preloadPokemonIcons } from "../../ui/sprites/pokemonIcon";
import { preloadPokemonSprite, PokemonSprite } from "../../ui/sprites/pokemonSprite";
import { Window_CommandPokemon } from "../../ui/windows/SpriteWindowText";
import { clearBattleRules } from "../battle/BattleStarting";
import { Game } from "../Game";
import { pbPlayDecisionSE, pbSEPlay } from "../GameSystem";
import { G } from "../globals";
import { pbMapInterpreter } from "../Interpreter";
import type { Pokemon } from "../pokemon/Pokemon";
import { SaveData } from "../save/SaveData";
import type { Player } from "../trainer/Player";
import { pbDeregisterPartner } from "../trainers/trainerEvents";
import { type DxHash, MaxRaidBattle, raidRewards, type RaidReward } from "./Raid_Setup";

const player = () => G.player as unknown as Player;

/** What the den screen needs of the running Interpreter (get_self, getVariable/setVariable). */
interface DenInterpreter {
  getSelf(): unknown;
  getVariable(): unknown;
  setVariable(v: unknown): void;
}

const PATH = "Graphics/Plugins/ZUD/Raid Den/";
/** The graphics of the den's screens. */
export const RAID_DEN_GRAPHICS = [
  PATH + "raid_bg_entry", PATH + "raid_bg_header", PATH + "raid_bg_rewards", PATH + "raid_bonus", PATH + "raid_field",
  PATH + "raid_hard", PATH + "raid_loot", PATH + "raid_party_bg", PATH + "raid_star",
  "Graphics/Pictures/Controls help/help_usekey", "Graphics/Pictures/Controls help/help_backkey",
  "Graphics/Pictures/Controls help/help_actionkey", "Graphics/Pictures/Pokedex/icon_types",
  "Graphics/Plugins/ZUD/UI/gfactor",
];

//===============================================================================
// Max Raid Den.
//===============================================================================
export class MaxRaidScene {
  static readonly BASE = new Color(248, 248, 248);
  static readonly SHADOW = new Color(0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sprites: Record<string, any> = {};
  viewport!: Viewport;
  overlay!: BitmapSprite["bitmap"] & object;
  interp!: DenInterpreter;
  thisEvent: unknown = null;
  rules!: DxHash;
  pkmn!: Pokemon;
  path = PATH;
  result: unknown = null;
  bonuses: number[] = [];

  pbUpdate(): void {
    pbUpdateSpriteHash(this.sprites);
  }

  pbEndScene(): void {
    this.pbUpdate();
    pbDisposeSpriteHash(this.sprites);
    this.viewport.dispose();
    dxClear(clearBattleRules, pbDeregisterPartner);
  }

  //-----------------------------------------------------------------------------
  // Hash used for field conditions display.
  //-----------------------------------------------------------------------------
  raidFieldHash(): Record<string, number> {
    return {
      // Weather
      Sun: 1,
      Rain: 2,
      Sandstorm: 3,
      Hail: 4,
      ShadowSky: 5,
      Fog: 6, // Unimplemented
      HarshSun: 7, // Unused
      HeavyRain: 8, // Unused
      StrongWinds: 9, // Unused

      // Terrain
      Electric: 1,
      Grassy: 2,
      Misty: 3,
      Psychic: 4,

      // Environment
      None: 1, // Urban
      Grass: 2, // Fields
      TallGrass: 2, // Fields
      MovingWater: 3, // Aquatic
      StillWater: 3, // Aquatic
      Puddle: 4, // Wetlands
      Underwater: 5, // Underwater
      Cave: 6, // Cavern
      Rock: 7, // Rocky
      Sand: 8, // Sandy
      Forest: 9, // Forest
      ForestGrass: 9, // Forest
      Snow: 10, // Frosty
      Ice: 10, // Frosty
      Volcano: 11, // Volcanic
      Graveyard: 12, // Spiritual
      Sky: 13, // Sky
      Space: 14, // Space
      UltraSpace: 15, // Ultra Space
    };
  }

  //-----------------------------------------------------------------------------
  // Saves the game and saves a new Max Raid Pokemon for this event.
  //-----------------------------------------------------------------------------
  async raidSavingPrompt(pkmn: Pokemon): Promise<boolean> {
    let saveGame = false;
    this.interp = pbMapInterpreter() as unknown as DenInterpreter;
    this.thisEvent = this.interp.getSelf();
    const raidPkmn = this.interp.getVariable();
    // Holding CTRL in Debug mode skips the saving prompt.
    if (DEBUG && Input.press(Input.CTRL)) {
      this.interp.setVariable(null);
      await pbMessage(_INTL("You peered into the raid den before you..."));
      return true;
    }
    if (!raidPkmn) {
      const temp = G.gameTemp as unknown as { begunNewGame: boolean };
      if (await pbConfirmMessage(_INTL("You must save the game before entering a new raid den. Is this ok?"))) {
        saveGame = true;
        if ((await SaveData.exists()) && temp.begunNewGame) {
          await pbMessage(_INTL("WARNING!"));
          await pbMessage(_INTL("There is a different game file that is already saved."));
          await pbMessage(_INTL("If you save now, the other file's adventure, including items and Pokémon, will be entirely lost."));
          if (!(await pbConfirmMessageSerious(_INTL("Are you sure you want to save now and overwrite the other save file?")))) {
            pbSEPlay("GUI save choice");
            saveGame = false;
          }
        }
      } else {
        pbSEPlay("GUI save choice");
      }
      if (saveGame) {
        temp.begunNewGame = false;
        pbSEPlay("GUI save choice");
        this.interp.setVariable(pkmn);
        if (await Game.save()) {
          await pbMessage(_INTL("\\se[]{1} saved the game.\\me[GUI save game]\\wtnp[30]", player().name));
        } else {
          await pbMessage(_INTL("\\se[]Save failed.\\wtnp[30]"));
          this.interp.setVariable(null);
          saveGame = false;
        }
      }
      return saveGame;
    } else {
      await pbMessage(_INTL("You peered into the raid den before you..."));
      return true;
    }
  }

  //-----------------------------------------------------------------------------
  // Initializes the raid den.
  //-----------------------------------------------------------------------------
  async pbStartScene(pkmn: Pokemon): Promise<boolean | number> {
    const BASE = MaxRaidScene.BASE, SHADOW = MaxRaidScene.SHADOW;
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    G.pokemonGlobal.nextBattleBGM = null;
    if (!(await this.raidSavingPrompt(pkmn))) return false;
    this.rules = G.gameTemp.dxRules as DxHash;
    this.pkmn = (this.interp.getVariable() as Pokemon | null) ? this.interp.getVariable() as Pokemon : pkmn;
    await Promise.all([preloadBitmaps(RAID_DEN_GRAPHICS), preloadPokemonIcons([this.pkmn, ...player().ableParty()])]);
    const overlaySprite = this.sprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.overlay = overlaySprite.bitmap!;
    pbSetSmallFont(this.overlay);
    // (Ruby creates these IconSprites without the viewport.)
    const icon = (key: string, x: number, y: number, file: string) => {
      const s = this.sprites[key] = new IconSprite(x, y);
      s.setBitmapFile(file);
      return s;
    };
    icon("raidentry", 0, 0, this.path + "raid_bg_entry");
    for (const [key, x, y, file] of [["usebutton", 346, 214, "help_usekey"], ["backbutton", 346, 151, "help_backkey"],
      ["actionbutton", 54, 292, "help_actionkey"]] as const) {
      const s = icon(key, x, y, `Graphics/Pictures/Controls help/${file}`);
      s.zoomX = 0.5;
      s.zoomY = 0.5;
    }
    //---------------------------------------------------------------------------
    // Rank stars
    //---------------------------------------------------------------------------
    let starX = 10;
    for (let i = 1; i <= this.rules.rank; i++) {
      icon(`raidstar${i}`, starX, 64, this.path + "raid_star");
      starX += 40;
      if (i === 5) break;
    }
    //---------------------------------------------------------------------------
    // Raid Pokemon silhouette
    //---------------------------------------------------------------------------
    const pokeicon = this.sprites.pokeicon = new PokemonIconSprite(this.pkmn, this.viewport);
    pokeicon.x = 95;
    pokeicon.y = 140;
    pokeicon.color.alpha = 255;
    if (this.pkmn.gmax && pokeicon.bitmap!.height > 64) {
      pokeicon.x -= 12;
      pokeicon.y -= 12;
    } else {
      pokeicon.zoomX = 1.5;
      pokeicon.zoomY = 1.5;
    }
    //---------------------------------------------------------------------------
    // Raid Pokemon type display
    //---------------------------------------------------------------------------
    const typebitmap = new AnimatedBitmap(_INTL("Graphics/Pictures/Pokedex/icon_types"));
    this.pkmn.types().forEach((type, i) => {
      const typeNumber = Type.get(type).iconPosition;
      const typeRect = new Rect(0, typeNumber * 32, 96, 32);
      const typeX = i === 0 ? 10 : 110;
      this.overlay.blt(typeX, 106, typebitmap.bitmap, typeRect);
    });
    //---------------------------------------------------------------------------
    // Party icons
    //---------------------------------------------------------------------------
    const partyX = 127 - (19 * this.rules.size);
    for (let i = 0; i < this.rules.size; i++) {
      icon(`partybg${i}`, partyX + (37 * i), 252, this.path + "raid_party_bg");
    }
    const able = player().ableParty();
    for (let i = 0; i < able.length; i++) {
      const p = this.sprites[`partyicon${i}`] = new PokemonIconSprite(able[i]!, this.viewport);
      p.x = this.sprites[`partybg${i}`].x + 2;
      p.y = 251;
      p.zoomX = 0.5;
      p.zoomY = 0.5;
      if (i === this.rules.size - 1) break;
    }
    //---------------------------------------------------------------------------
    // Battlefield display
    //---------------------------------------------------------------------------
    const conds: (number | undefined)[] = [];
    const field = this.raidFieldHash();
    conds.push(fieldValue(field, this.rules.weather));
    conds.push(fieldValue(field, this.rules.terrain));
    // Environment isn't displayed if all field settings are default settings.
    const compact = () => conds.filter((c) => c != null);
    if (idOf(this.rules.environ) === "Cave") {
      if (compact().length > 0) conds.push(fieldValue(field, this.rules.environ));
    } else {
      conds.push(fieldValue(field, this.rules.environ));
    }
    if (compact().length > 0) {
      const fieldbg = icon("fieldbg", 295, 16, this.path + "raid_bg_header");
      fieldbg.mirror = true;
      const fieldbitmap = new AnimatedBitmap(_INTL(this.path + "raid_field"));
      let offset = 0;
      conds.forEach((cond, i) => {
        if (!cond) return;
        this.overlay.blt(444 - (offset * 58), 38, fieldbitmap.bitmap, new Rect(cond * 58, i * 32, 58, 32));
        offset += 1;
      });
    }
    //---------------------------------------------------------------------------
    // Extra raid conditions
    //---------------------------------------------------------------------------
    const extras: IconSprite[] = [];
    // G-Max symbol if this is a G-Max Raid.
    if (this.pkmn.gmax) extras.push(icon("gmax", 0, 94, "Graphics/Plugins/ZUD/UI/gfactor"));
    // Hard Mode symbol if this is a Hard Mode Raid.
    if (this.rules.hard) extras.push(icon("hard", 0, 80, this.path + "raid_hard"));
    // Bonus Item symbol if this raid has custom loot.
    if (this.rules.loot) extras.push(icon("loot", 0, 80, this.path + "raid_loot"));
    for (let i = 0; i < extras.length; i++) extras[i]!.x = 460 - (i * 54);
    //---------------------------------------------------------------------------
    // Text displays
    //---------------------------------------------------------------------------
    const textPos: TextPosition[] = [
      [_INTL("MAX RAID DEN"), 25, 32, 0, BASE, SHADOW],
      [_INTL("Leave Den"), 403, 154, 0, BASE, SHADOW],
      [_INTL("Enter Den"), 403, 217, 0, BASE, SHADOW],
      [_INTL("Set Party"), 111, 295, 0, BASE, SHADOW],
    ];
    if (compact().length > 0) textPos.push([_INTL("FIELD"), 450, 19, 0, BASE, SHADOW]);
    pbDrawTextPositions(this.overlay, textPos);
    const koText = this.rules.kocount === 1 ? "knock out" : "knock outs";
    const battletext = _INTL("Battle ends in {1} turns, or after {2} {3}.", this.rules.turns, this.rules.kocount, koText);
    drawTextEx(this.overlay, 287, 276, 220, 2, battletext, BASE, SHADOW);
    pbSEPlay("GUI trainer card open");
    return this.pbMaxRaidEntry();
  }

  //-----------------------------------------------------------------------------
  // Command options while the den entry screen is displayed.
  //-----------------------------------------------------------------------------
  async pbMaxRaidEntry(): Promise<boolean | number> {
    let outcome: boolean | number = false;
    let fullParty = player().party;
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      //-------------------------------------------------------------------------
      // Accesses Party screen and updates party display.
      //-------------------------------------------------------------------------
      if (Input.trigger(Input.ACTION)) {
        pbPlayDecisionSE();
        await pbPokemonScreen();
        fullParty = player().party;
        const able = player().ableParty();
        await preloadPokemonIcons(able);
        for (let i = 0; i < able.length; i++) {
          this.sprites[`partyicon${i}`].pokemon = able[i]!;
          if (i === this.rules.size - 1) break;
        }
      //-------------------------------------------------------------------------
      // Sets up and begins the Raid battle.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.USE)) {
        if (await pbConfirmMessage(_INTL("Enter the raid den with the displayed party?"))) {
          const raidParty: Pokemon[] = [];
          const able = player().ableParty();
          for (let i = 0; i < able.length; i++) {
            raidParty.push(able[i]!);
            if (i === this.rules.size - 1) break;
          }
          player().party = raidParty;
          await pbFadeOutIn(async () => {
            G.stats.maxRaidDensEntered += 1;
            pbSEPlay("Door enter");
            pbDisposeSpriteHash(this.sprites);
            this.viewport.dispose();
            await pbMessage(_INTL("\\me[Max Raid Intro]You ventured forth into the den...\\wt[34] ...\\wt[34] ...\\wt[60]!\\wtnp[8]")); // if !$DEBUG
            this.pkmn.heal();
            G.pokemonGlobal.nextBattleBGM = this.rules.bgm ?? null;
            outcome = await MaxRaidBattle.startCore(this.pkmn);
            await pbWait(20);
            pbSEPlay("Door exit");
          });
          player().party = fullParty;
          this.result = G.gameVariables.get(this.rules.outcome);
          if (this.result === 1 || this.result === 4) {
            G.stats.maxRaidDensCleared += 1;
            for (const pkmn of player().party) pkmn.heal();
            this.interp.setVariable(0);
          }
          await this.pbRaidRewardsScreen();
          break;
        }
      //-------------------------------------------------------------------------
      // Exits the Raid event.
      //-------------------------------------------------------------------------
      } else if (Input.trigger(Input.BACK)) {
        if (await pbConfirmMessage(_INTL("Would you like to leave the raid den?"))) {
          pbSEPlay("GUI menu close");
          break;
        }
      }
    }
    return outcome;
  }

  //-----------------------------------------------------------------------------
  // Initializes the Raid Rewards screen.
  //-----------------------------------------------------------------------------
  async pbRaidRewardsScreen(): Promise<void> {
    const BASE = MaxRaidScene.BASE, SHADOW = MaxRaidScene.SHADOW;
    this.sprites = {};
    this.viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
    this.viewport.z = 99999;
    await preloadPokemonSprite(this.pkmn);
    // (Ruby creates these IconSprites without the viewport.)
    const icon = (key: string, x: number, y: number, file: string) => {
      const s = this.sprites[key] = new IconSprite(x, y);
      s.setBitmapFile(file);
      return s;
    };
    icon("rewardscreen", 0, 0, this.path + "raid_bg_rewards");
    const back = icon("backbutton", 335, 292, "Graphics/Pictures/Controls help/help_backkey");
    back.zoomX = 0.5;
    back.zoomY = 0.5;
    const overlaySprite = this.sprites.overlay = new BitmapSprite(Graphics.width, Graphics.height, this.viewport);
    this.overlay = overlaySprite.bitmap!;
    pbSetSmallFont(this.overlay);
    const textPos: TextPosition[] = [];
    //---------------------------------------------------------------------------
    // Rank stars
    //---------------------------------------------------------------------------
    let starX = 385 - 20 * (this.rules.rank === 6 ? 5 : this.rules.rank);
    for (let i = 1; i <= this.rules.rank; i++) {
      icon(`raidstar${i}`, starX, 64, this.path + "raid_star");
      starX += 40;
      if (i === 5) break;
    }
    //---------------------------------------------------------------------------
    // Raid Pokemon sprite
    //---------------------------------------------------------------------------
    const sprite = this.sprites.pokemon = new PokemonSprite(this.viewport);
    sprite.setOffset(PictureOrigin.CENTER);
    sprite.x = 104;
    sprite.y = 206;
    sprite.setPokemonBitmap(this.pkmn);
    unDynamax(sprite);
    if (this.pkmn.gmaxFactor) icon("gmax", 140, 82, "Graphics/Plugins/ZUD/UI/gfactor");
    //---------------------------------------------------------------------------
    // Rewards display
    //---------------------------------------------------------------------------
    if (this.result === 1 || this.result === 4) {
      this.bonuses = [];
      if (this.rules.hard) this.bonuses.push(0);
      if (this.rules.perfect_bonus) this.bonuses.push(1);
      if (this.rules.timer_bonus > Math.floor(this.rules.turns / 2)) this.bonuses.push(2);
      if (this.rules.fairness_bonus) this.bonuses.push(3);
      if (this.result === 4) this.bonuses.push(4);
      if (this.bonuses.length > 0) {
        icon("bonusbg", 0, 16, this.path + "raid_bg_header");
        textPos.push([_INTL("BONUS"), 8, 19, 0, BASE, SHADOW]);
        const bonusbitmap = new AnimatedBitmap(_INTL(this.path + "raid_bonus"));
        for (let i = 0; i < this.bonuses.length; i++) {
          this.overlay.blt(i * 41, 38, bonusbitmap.bitmap, new Rect(this.bonuses[i]! * 41, 0, 41, 33));
        }
      }
      const rewards: RaidReward[] = raidRewards(this.pkmn.speciesData().id, this.rules.rank, this.bonuses.length);
      if (rand(10) < 1) {
        switch (idOf(this.rules.weather)) {
          case "Sun": rewards.push(["HEATROCK", 1]); break;
          case "Rain": rewards.push(["DAMPROCK", 1]); break;
          case "Sandstorm": rewards.push(["SMOOTHROCK", 1]); break;
          case "Hail": rewards.push(["ICYROCK", 1]); break;
          case "ShadowSky": rewards.push(["LIFEORB", 1]); break;
          case "Fog": rewards.push(["SMOKEBALL", 1]); break;
        }
      }
      if (rand(10) < 1) {
        switch (idOf(this.rules.terrain)) {
          case "Electric": rewards.push(["ELECTRICSEED", 1]); break;
          case "Grassy": rewards.push(["GRASSYSEED", 1]); break;
          case "Misty": rewards.push(["MISTYSEED", 1]); break;
          case "Psychic": rewards.push(["PSYCHICSEED", 1]); break;
        }
      }
      if (rand(10) < 1) {
        // NOTE (Ruby parity): reads rules[:environment], a key nothing sets
        // (the rule is :environ), so these rewards never drop (Raid_Den_Scene.rb:403).
        switch (idOf(this.rules.environment)) {
          case "None": rewards.push(["CELLBATTERY", 1]); break;
          case "Grass": rewards.push(["MIRACLESEED", 1]); break;
          case "TallGrass": rewards.push(["ABSORBBULB", 1]); break;
          case "MovingWater": rewards.push(["MYSTICWATER", 1]); break;
          case "StillWater": rewards.push(["FRESHWATER", 1]); break;
          case "Puddle": rewards.push(["LIGHTCLAY", 1]); break;
          case "Underwater": rewards.push(["SHOALSHELL", 1]); break;
          case "Cave": rewards.push(["LUMINOUSMOSS", 1]); break;
          case "Rock": rewards.push(["HARDSTONE", 1]); break;
          case "Sand": rewards.push(["SOFTSAND", 1]); break;
          case "Forest": rewards.push(["SHEDSHELL", 1]); break;
          case "ForestGrass": rewards.push(["SILVERPOWDER", 1]); break;
          case "Snow": rewards.push(["SNOWBALL", 1]); break;
          case "Ice": rewards.push(["NEVERMELTICE", 1]); break;
          case "Volcano": rewards.push(["CHARCOAL", 1]); break;
          case "Graveyard": rewards.push(["RAREBONE", 1]); break;
          case "Sky": rewards.push(["PRETTYFEATHER", 1]); break;
          case "Space": rewards.push(["STARDUST", 1]); break;
          case "UltraSpace": rewards.push(["COMETSHARD", 1]); break;
        }
      }
      if (this.rules.loot) {
        if (Array.isArray(this.rules.loot)) {
          rewards.push([idOf(this.rules.loot[0]), this.rules.loot[1] || 1]);
        } else {
          rewards.push([idOf(this.rules.loot), 1]);
        }
      }
      const items = raidAddRewards(rewards);
      const itemwindow = this.sprites.itemwindow = Window_CommandPokemon.newWithSize(items, 260, 92, 258, 196, this.viewport);
      itemwindow.index = 0;
      itemwindow.baseColor = BASE;
      itemwindow.shadowColor = SHADOW;
      itemwindow.windowskin = null;
    }
    //---------------------------------------------------------------------------
    // Other text displays
    //---------------------------------------------------------------------------
    let level: string | number = "???";
    let ability = "???";
    let result: string;
    switch (this.result) {
      case 1:
        result = "defeated";
        break;
      case 4:
        result = "caught";
        level = this.pkmn.level;
        ability = Ability.get(this.pkmn.abilityId!).name;
        if (this.pkmn.male()) {
          textPos.push(["♂", 20, 87, 0, new Color(24, 112, 216), new Color(136, 168, 208)]);
        } else if (this.pkmn.female()) {
          textPos.push(["♀", 20, 87, 0, new Color(248, 56, 32), new Color(224, 152, 144)]);
        }
        break;
      default:
        result = "lost to";
        textPos.push([_INTL("No Rewards Earned."), 386, 179, 2, BASE, SHADOW]);
        break;
    }
    result = _INTL("You {1} {2}!", result, this.pkmn.name);
    textPos.push(
      [result, 270, 32, 0, BASE, SHADOW],
      [_INTL("Exit"), 393, 295, 0, BASE, SHADOW],
      [_INTL("Lvl. {1}", level), 38, 88, 0, BASE, SHADOW],
      [_INTL("Ability: {1}", ability), 20, 295, 0, BASE, SHADOW],
    );
    pbDrawTextPositions(this.overlay, textPos);
    //---------------------------------------------------------------------------
    // Exits the screen
    //---------------------------------------------------------------------------
    for (;;) {
      await Graphics.update();
      Input.update();
      this.pbUpdate();
      if (Input.trigger(Input.BACK)) {
        pbSEPlay("GUI menu close");
        Input.update();
        break;
      }
    }
  }
}

/** raid_FieldHash[...] for a rule value (Symbol or string; nil for none). */
function fieldValue(field: Record<string, number>, v: unknown): number | undefined {
  const id = idOf(v);
  return id ? field[id] : undefined;
}

/**
 * The rewards loop of pbRaidRewardsScreen: puts each existing item in the
 * Bag and returns the item window's lines ("Name  xQty"; TRs with their move).
 */
export function raidAddRewards(rewards: RaidReward[]): string[] {
  const items: string[] = [];
  for (const [itemId, qty] of rewards) {
    if (!itemId || !Item.exists(itemId)) continue;
    const item = Item.get(itemId as Id);
    const itemname = item.isTR() ? _INTL("{1} {2}", item.name, Move.get(item.move!).name) : item.name;
    items.push(_INTL("{1}  x{2}", itemname, qty));
    G.bag.add(item.id, qty);
  }
  return items;
}

//===============================================================================
// Used to call a Max Raid Den in an event script.
//===============================================================================
/** raid_InitiateRaidDen(pkmn): returns what MaxRaidScreen#pbStartScreen does. */
export async function raidInitiateRaidDen(pkmn: Pokemon): Promise<unknown> {
  const scene = new MaxRaidScene();
  const screen = new MaxRaidScreen(scene);
  return screen.pbStartScreen(pkmn);
}

export class MaxRaidScreen {
  constructor(private scene: MaxRaidScene) {}

  async pbStartScreen(pkmn: Pokemon): Promise<unknown> {
    await this.scene.pbStartScene(pkmn);
    this.scene.pbEndScene();
    return {}; // ($game_temp.dx_clear's return: the cleared battle rules hash)
  }
}
