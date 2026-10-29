// The Bug-Catching Contest:
// - 011_Battle/007_Other battle types/002_BugContestBattle.rb: the
//   Battle::Scene additions (help window for comparing catches) and class
//   BugContestBattle.
// - 018_Alternate battle modes/002_BugContest.rb: BugContestState, the timer,
//   judging and scoring (pbBugContestScore), the map handlers, the wild
//   battle override and pbBugContestBattle. The pause menu's Quit Contest
//   option is in ui/menus/pauseMenu.ts (DP Pause Menu's version).

import { rand } from "../../core/random";
import { _INTL, type Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Species } from "../../data/gameData/species";
import { Battle } from "../../battle/battle/Battle";
import type { IBattleScene } from "../../battle/BattleSceneInterface";
import { BattleScene } from "../../battle/scene/BattleScene";
import { Graphics } from "../../rgss/Graphics";
import { Input } from "../../rgss/Input";
import type { SceneMap } from "../../scenes/SceneMap";
import type { AnimationSprite } from "../../sprites/AnimationSprite";
import { pbFadeOutIn } from "../../ui/fades";
import { pbMessage } from "../../ui/messages";
import { Window_AdvancedTextPokemon, Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { pokemonEncounters, pbGenerateWildPokemon, specialBattleHooks } from "../encounters/PokemonEncounters";
import { rubySortBy } from "../encounters/rubySort";
import { EventHandlers } from "../eventHandlers";
import { pbDismountBike } from "../field/bicycle";
import type { GameCharacter } from "../GameCharacter";
import type { GameMap } from "../GameMap";
import { pbMapInterpreterRunning } from "../GamePlayer";
import { G } from "../globals";
import { pbGetTimeNow } from "../dayNight";
import { Pokemon, type PokemonJSON } from "../pokemon/Pokemon";
import { pbNicknameAndStore } from "../pokemon/utilities";
import { defineScript } from "../scriptApi";
import type { Player } from "../trainer/Player";
import { pbGetWildBattleBGM } from "./battleAudio";
import { pbBattleAnimation } from "./BattleIntroAnim";
import { BattleCreationHelperMethods, type BattleLike, setBattleRule } from "./BattleStarting";
import { PokemonGlobalExtras } from "./globalExtras";

/** Settings::BUG_CONTEST_TIME (001_Settings.rb:90): seconds a contest lasts (0 = infinite). */
export const BUG_CONTEST_TIME: number = 20 * 60;
/** Graphics.frame_rate: the contest timer counts this port's 60 Hz ticks (Graphics.frame_count). */
const FRAME_RATE = Math.round(1 / Graphics.deltaS);

declare module "../globals" {
  interface PokemonGlobalMetadata {
    bugContestState?: BugContestState | null;
  }
}

const player = () => G.player as unknown as Player;

//===============================================================================
// Bug Catching Contest battle scene (the visuals of the battle)
//===============================================================================
// alias _bugContest_pbInitSprites pbInitSprites
const bugContestPbInitSprites = BattleScene.prototype.pbInitSprites;
BattleScene.prototype.pbInitSprites = function (this: BattleScene): void {
  bugContestPbInitSprites.call(this);
  // "helpwindow" shows the currently caught Pokémon's details when asking if
  // you want to replace it with a newly caught Pokémon.
  const helpwindow = Window_UnformattedTextPokemon.newWithSize("", 0, 0, 32, 32, this.viewport);
  helpwindow.z = 90;
  helpwindow.visible = false;
  this.sprites.helpwindow = helpwindow;
};

const sceneMethods = {
  pbShowHelp(this: BattleScene, text: string): void {
    const w: Window_UnformattedTextPokemon = this.sprites.helpwindow;
    w.resizeToFit(text, Graphics.width);
    w.y = 0;
    w.x = 0;
    w.text = text;
    w.visible = true;
  },

  pbHideHelp(this: BattleScene): void {
    this.sprites.helpwindow.visible = false;
  },
};

type SceneMethods = typeof sceneMethods;
declare module "../../battle/scene/BattleScene" {
  interface BattleScene extends SceneMethods {}
}
Object.assign(BattleScene.prototype, sceneMethods);

//===============================================================================
// Bug Catching Contest battle class
//===============================================================================
export class BugContestBattle extends Battle {
  ballCount: number;
  private ballConst: Id;

  constructor(...args: ConstructorParameters<typeof Battle>) {
    super(...args);
    // (Ruby sets these before calling super; nothing in Battle#initialize reads them.)
    this.ballCount = 0;
    this.ballConst = Item.get("SPORTBALL").id;
  }

  override async pbItemMenu(idxBattler: number, _firstAction: boolean): Promise<boolean> {
    return this.pbRegisterItem(idxBattler, this.ballConst, 1);
  }

  override async pbCommandMenu(idxBattler: number, _firstAction: boolean): Promise<number> {
    return (this.scene as unknown as BattleScene).pbCommandMenuEx(idxBattler, [
      _INTL("Sport Balls: {1}", this.ballCount),
      _INTL("Fight"),
      _INTL("Ball"),
      _INTL("Pokémon"),
      _INTL("Run"),
    ], 4);
  }

  override pbConsumeItemInBag(_item: Id | null, _idxBattler: number): void {
    if (this.ballCount > 0) this.ballCount -= 1;
  }

  override async pbStorePokemon(pkmn: Pokemon): Promise<void> {
    const state = pbBugContestState();
    const scene = this.scene as unknown as BattleScene;
    if (state.lastPokemon) {
      const lastPokemon = state.lastPokemon;
      await this.pbDisplayPaused(_INTL("You already caught a {1}.", lastPokemon.name));
      const helptext = _INTL("STOCK POKéMON:\n {1} Lv.{2} MaxHP: {3}\nTHIS POKéMON:\n {4} Lv.{5} MaxHP: {6}",
        lastPokemon.name, lastPokemon.level, lastPokemon.totalhp, pkmn.name, pkmn.level, pkmn.totalhp);
      scene.pbShowHelp(helptext);
      if (await this.pbDisplayConfirm(_INTL("Switch Pokémon?"))) {
        state.lastPokemon = pkmn;
        scene.pbHideHelp();
      } else {
        scene.pbHideHelp();
        return;
      }
    } else {
      state.lastPokemon = pkmn;
    }
    await this.pbDisplay(_INTL("Caught {1}!", pkmn.name));
  }

  override async pbEndOfRoundPhase(): Promise<void> {
    await super.pbEndOfRoundPhase();
    if (this.ballCount <= 0 && this.decision === 0) this.decision = 3;
  }
}

//===============================================================================
// The contest
//===============================================================================
type Place = [contestant: number, species: Id, score: number];

export class BugContestState {
  static readonly CONTESTANT_NAMES = [
    _INTL("Bug Catcher Ed"),
    _INTL("Bug Catcher Benny"),
    _INTL("Bug Catcher Josh"),
    _INTL("Camper Barry"),
    _INTL("Cool Trainer Nick"),
    _INTL("Lass Abby"),
    _INTL("Picnicker Cindy"),
    _INTL("Youngster Samuel"),
  ];
  static readonly TIME_ALLOWED = BUG_CONTEST_TIME;

  ballcount = 0;
  decision = 0;
  lastPokemon: Pokemon | null = null;
  timer = 0;
  private ended = false;
  private inProgress_ = false;
  private otherparty: Pokemon[] = [];
  private contestants: number[] = [];
  private places: Place[] = [];
  private start: [number, number, number, number] | null = null;
  private contestMaps: number[] = [];
  private reception: number[] = [];
  private chosenPokemon = 0;
  private lastContest: number | null = null;

  constructor() {
    this.clear();
    this.lastContest = null;
  }

  /** Returns whether the last contest ended less than 24 hours ago. */
  pbContestHeld(): boolean {
    if (this.lastContest == null) return false;
    const timenow = pbGetTimeNow();
    return Math.floor(timenow.getTime() / 1000) - this.lastContest < 24 * 60 * 60; // 24 hours
  }

  expired(): boolean {
    if (!this.undecided()) return false;
    if (BugContestState.TIME_ALLOWED <= 0) return false;
    let curtime = this.timer + BugContestState.TIME_ALLOWED * FRAME_RATE;
    curtime = Math.max(curtime - Graphics.frameCount, 0);
    return curtime <= 0;
  }

  clear(): void {
    this.ballcount = 0;
    this.ended = false;
    this.inProgress_ = false;
    this.decision = 0;
    this.lastPokemon = null;
    this.otherparty = [];
    this.contestants = [];
    this.places = [];
    this.start = null;
    this.contestMaps = [];
    this.reception = [];
  }

  inProgress(): boolean {
    return this.inProgress_;
  }

  undecided(): boolean {
    return this.inProgress_ && this.decision === 0;
  }

  decided(): boolean {
    return (this.inProgress_ && this.decision !== 0) || this.ended;
  }

  pbSetPokemon(chosenpoke: number): void {
    this.chosenPokemon = chosenpoke;
  }

  pbSetContestMap(...maps: (number | string)[]): void {
    for (const map of maps) {
      if (typeof map === "string") { // Map metadata flag
        for (const mapData of MapMetadata.each()) if (mapData.hasFlag(map)) this.contestMaps.push(mapData.id);
      } else {
        this.contestMaps.push(map);
      }
    }
    console.log(`contest maps: [${this.contestMaps.join(", ")}]`); // echoln
  }

  /**
   * Reception map is handled separately from contest map since the reception map
   * can be outdoors, with its own grassy patches.
   */
  pbSetReception(...maps: (number | string)[]): void {
    for (const map of maps) {
      if (typeof map === "string") { // Map metadata flag
        for (const mapData of MapMetadata.each()) if (mapData.hasFlag(map)) this.reception.push(mapData.id);
      } else {
        this.reception.push(map);
      }
    }
    console.log(`reception maps: [${this.reception.join(", ")}]`); // echoln
  }

  pbOffLimits(map: number): boolean {
    if (this.contestMaps.includes(map)) return false;
    if (this.reception.includes(map)) return false;
    return true;
  }

  pbSetJudgingPoint(startMap: number, startX: number, startY: number, dir = 8): void {
    this.start = [startMap, startX, startY, dir];
  }

  pbJudge(): void {
    const judgearray: Place[] = [];
    if (this.lastPokemon) judgearray.push([-1, this.lastPokemon.species, pbBugContestScore(this.lastPokemon)]);
    const mapsWithEncounters: [number, Id][] = [];
    const enc = pokemonEncounters();
    for (const map of this.contestMaps) {
      let encType: Id = "BugContest";
      if (!enc.mapHasEncounterType(map, encType)) encType = "Land";
      if (enc.mapHasEncounterType(map, encType)) mapsWithEncounters.push([map, encType]);
    }
    if (mapsWithEncounters.length === 0) throw new Error(_INTL("There are no Bug Contest/Land encounters for any Bug Contest maps."));
    for (const cont of this.contestants) {
      const encData = mapsWithEncounters[rand(mapsWithEncounters.length)]!; // .sample
      const chosen = enc.chooseWildPokemonForMap(encData[0], encData[1]);
      if (!chosen) throw new Error(_INTL("No encounters for map {1} somehow, so can't judge contest.", encData[0]));
      const pokemon = new Pokemon(chosen[0], chosen[1]);
      pokemon.hp = 1 + rand(pokemon.totalhp - 1); // rand(1...pokemon.totalhp)
      const score = pbBugContestScore(pokemon);
      judgearray.push([cont, pokemon.species, score]);
    }
    if (judgearray.length < 3) throw new Error(_INTL("Too few bug catching contestants"));
    rubySortBy(judgearray, (a, b) => b[2] - a[2]); // sort by score in descending order
    this.places.push(judgearray[0]!);
    this.places.push(judgearray[1]!);
    this.places.push(judgearray[2]!);
  }

  pbGetPlaceInfo(place: number): void {
    const cont = this.places[place]![0];
    if (cont < 0) G.gameVariables.set(1, player().name);
    else G.gameVariables.set(1, BugContestState.CONTESTANT_NAMES[cont]);
    G.gameVariables.set(2, Species.get(this.places[place]![1]).name);
    G.gameVariables.set(3, this.places[place]![2]);
    if (G.gameMap) (G.gameMap as unknown as GameMap).needRefresh = true;
  }

  pbClearIfEnded(): void {
    if (!this.inProgress_ && (!this.start || this.start[0] !== G.gameMap!.mapId)) this.clear();
  }

  async pbStartJudging(): Promise<void> {
    this.decision = 1;
    this.pbJudge();
    const scene = G.scene as unknown as SceneMap | null;
    if (scene && typeof scene.transferPlayer === "function") {
      await pbFadeOutIn(async () => {
        const t = G.gameTemp;
        t.playerTransferring = true;
        t.playerNewMapId = this.start![0];
        t.playerNewX = this.start![1];
        t.playerNewY = this.start![2];
        t.playerNewDirection = this.start![3];
        await pbDismountBike();
        await scene.transferPlayer();
        (G.gameMap as unknown as GameMap).needRefresh = true; // in case player moves to the same map
      });
    }
  }

  pbIsContestant(i: number): boolean {
    return this.contestants.some((item) => i === item);
  }

  pbStart(ballcount: number): void {
    this.ballcount = ballcount;
    this.inProgress_ = true;
    this.otherparty = [];
    this.lastPokemon = null;
    this.lastContest = null;
    this.timer = Graphics.frameCount;
    this.places = [];
    const party = player().party;
    const chosenpkmn = party[this.chosenPokemon]!;
    for (let i = 0; i < party.length; i++) {
      if (i !== this.chosenPokemon) this.otherparty.push(party[i]!);
    }
    this.contestants = [];
    for (let n = 0; n < Math.min(5, BugContestState.CONTESTANT_NAMES.length); n++) {
      for (;;) {
        const value = rand(BugContestState.CONTESTANT_NAMES.length);
        if (this.contestants.includes(value)) continue;
        this.contestants.push(value);
        break;
      }
    }
    player().party = [chosenpkmn];
    this.decision = 0;
    this.ended = false;
    G.stats.bugContestCount += 1;
  }

  place(): number {
    for (let i = 0; i < 3; i++) {
      if (this.places[i]![0] < 0) return i;
    }
    return 3;
  }

  async pbEnd(interrupted = false): Promise<void> {
    if (!this.inProgress_) return;
    for (const pkmn of this.otherparty) player().party.push(pkmn);
    if (interrupted) {
      this.ended = false;
    } else {
      if (this.lastPokemon) await pbNicknameAndStore(this.lastPokemon);
      this.ended = true;
    }
    // NOTE (Ruby parity): when the contest is interrupted before judging,
    // @places is empty and `place` raises NoMethodError on nil (002_BugContest.rb:262).
    if (this.place() === 0) G.stats.bugContestWins += 1;
    this.ballcount = 0;
    this.inProgress_ = false;
    this.decision = 0;
    this.lastPokemon = null;
    this.otherparty = [];
    this.contestMaps = [];
    this.reception = [];
    const timenow = pbGetTimeNow();
    this.lastContest = Math.floor(timenow.getTime() / 1000);
    (G.gameMap as unknown as GameMap).needRefresh = true;
  }

  toJSON(): unknown {
    const pk = (p: Pokemon | null) => (p ? p.toJSON() : null);
    return {
      ballcount: this.ballcount, decision: this.decision, lastPokemon: pk(this.lastPokemon), timer: this.timer,
      ended: this.ended, inProgress: this.inProgress_, otherparty: this.otherparty.map((p) => p.toJSON()),
      contestants: this.contestants, places: this.places, start: this.start, contestMaps: this.contestMaps,
      reception: this.reception, chosenPokemon: this.chosenPokemon, lastContest: this.lastContest,
    };
  }

  static fromJSON(json: unknown): BugContestState {
    const j = json as Record<string, unknown>;
    const s = new BugContestState();
    s.ballcount = j.ballcount as number;
    s.decision = j.decision as number;
    s.lastPokemon = j.lastPokemon ? Pokemon.fromJSON(j.lastPokemon as PokemonJSON) : null;
    s.timer = j.timer as number;
    s.ended = j.ended as boolean;
    s.inProgress_ = j.inProgress as boolean;
    s.otherparty = ((j.otherparty as PokemonJSON[]) ?? []).map((p) => Pokemon.fromJSON(p));
    s.contestants = (j.contestants as number[]) ?? [];
    s.places = (j.places as Place[]) ?? [];
    s.start = (j.start as BugContestState["start"]) ?? null;
    s.contestMaps = (j.contestMaps as number[]) ?? [];
    s.reception = (j.reception as number[]) ?? [];
    s.chosenPokemon = (j.chosenPokemon as number) ?? 0;
    s.lastContest = (j.lastContest as number | null) ?? null;
    return s;
  }
}

//===============================================================================
// The timer shown during the contest
//===============================================================================
export class TimerDisplay {
  private timer: Window_AdvancedTextPokemon;
  private totalSec: number | null = null;

  constructor(private start: number, private maxtime: number) {
    this.timer = Window_AdvancedTextPokemon.newWithSize("", Graphics.width - 120, 0, 120, 64);
    this.timer.z = 99999;
  }

  dispose(): void {
    this.timer.dispose();
  }

  isDisposed(): boolean {
    return this.timer.isDisposed();
  }

  update(): void {
    let curtime = Math.max(this.start + this.maxtime - Graphics.frameCount, 0);
    curtime = Math.floor(curtime / FRAME_RATE);
    if (curtime !== this.totalSec) {
      // Calculate total number of seconds
      this.totalSec = curtime;
      // Make a string for displaying the timer
      const min = Math.floor(this.totalSec / 60);
      const sec = this.totalSec % 60;
      this.timer.text = `<ac>${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; // _ISPRINTF("<ac>{1:02d}:{2:02d}")
    }
  }
}

//===============================================================================
// Scoring and state
//===============================================================================
/**
 * Returns a score for this Pokemon in the Bug Catching Contest.
 * Not exactly the HGSS calculation, but it should be decent enough.
 */
export function pbBugContestScore(pkmn: Pokemon): number {
  const levelscore = pkmn.level * 4;
  let ivscore = 0;
  for (const iv of Object.values(pkmn.iv)) ivscore += iv / Pokemon.IV_STAT_LIMIT;
  ivscore = Math.floor(ivscore * 100);
  const hpscore = Math.floor((100.0 * pkmn.hp) / pkmn.totalhp);
  const catchRate = pkmn.speciesData().catchRate;
  let rarescore = 60;
  if (catchRate <= 120) rarescore += 20;
  if (catchRate <= 60) rarescore += 20;
  return levelscore + ivscore + hpscore + rarescore;
}

export function pbBugContestState(): BugContestState {
  G.pokemonGlobal.bugContestState ??= new BugContestState();
  return G.pokemonGlobal.bugContestState;
}

/** Returns true if the Bug Catching Contest in progress */
export function pbInBugContest(): boolean {
  return pbBugContestState().inProgress();
}

/** Returns true if the Bug Catching Contest in progress and has not yet been judged */
export function pbBugContestUndecided(): boolean {
  return pbBugContestState().undecided();
}

/** Returns true if the Bug Catching Contest in progress and is being judged */
export function pbBugContestDecided(): boolean {
  return pbBugContestState().decided();
}

export async function pbBugContestStartOver(): Promise<void> {
  for (const pkmn of player().party) {
    pkmn.heal();
    pkmn.makeUnmega();
    pkmn.makeUnprimal();
  }
  await pbBugContestState().pbStartJudging();
}

specialBattleHooks.inBugContest = pbInBugContest;
PokemonGlobalExtras.register("bugContestState", {
  save: (v) => (v as BugContestState).toJSON(),
  load: (v) => BugContestState.fromJSON(v),
});

//===============================================================================
// Map handlers
//===============================================================================
EventHandlers.add("on_map_or_spriteset_change", "show_bug_contest_timer", (s) => {
  const scene = s as SceneMap;
  if (!pbInBugContest() || pbBugContestState().decision !== 0 || BugContestState.TIME_ALLOWED === 0) return;
  // (Spriteset_Map#addUserSprite only updates and disposes its user sprites.)
  scene.spriteset()?.addUserSprite(
    new TimerDisplay(pbBugContestState().timer, BugContestState.TIME_ALLOWED * FRAME_RATE) as unknown as AnimationSprite,
  );
});

EventHandlers.add("on_frame_update", "bug_contest_counter", async () => {
  if (!pbBugContestState().expired()) return;
  if ((G.gamePlayer as unknown as GameCharacter).moveRouteForcing || pbMapInterpreterRunning() ||
      G.gameTemp.messageWindowShowing) return;
  await pbMessage(_INTL("ANNOUNCER: BEEEEEP!"));
  await pbMessage(_INTL("Time's up!"));
  await pbBugContestState().pbStartJudging();
});

EventHandlers.add("on_enter_map", "end_bug_contest", () => {
  pbBugContestState().pbClearIfEnded();
});

EventHandlers.add("on_leave_map", "end_bug_contest", (newMapId) => {
  if (!pbInBugContest() || !pbBugContestState().pbOffLimits(newMapId as number)) return;
  // Clear bug contest if player flies/warps/teleports out of the contest
  // (pbEnd(true) shows no messages, so it runs to the end here)
  void pbBugContestState().pbEnd(true);
});

//===============================================================================
// The battle
//===============================================================================
EventHandlers.add("on_calling_wild_battle", "bug_contest_battle", async (p, l, h) => {
  const pkmn = p as Pokemon;
  const handled = h as (boolean | null)[];
  // handled is an array: [nil]. If [true] or [false], the battle has already
  // been overridden (the boolean is its outcome), so don't do anything that
  // would override it again
  if (handled[0] != null) return;
  if (!pbInBugContest()) return;
  handled[0] = await pbBugContestBattle(pkmn.species, l as number);
});

export async function pbBugContestBattle(species: Id, level: number): Promise<boolean> {
  // Record information about party Pokémon to be used at the end of battle (e.g.
  // comparing levels for an evolution check)
  await EventHandlers.trigger("on_start_battle");
  // Generate a wild Pokémon based on the species and level
  const pkmn = pbGenerateWildPokemon(species, level);
  const foeParty = [pkmn];
  // Calculate who the trainers and their party are
  const playerTrainer = [player()];
  const playerParty = player().party;
  const playerPartyStarts = [0];
  // Create the battle scene (the visual side of it)
  const scene = BattleCreationHelperMethods.createBattleScene();
  // Create the battle class (the mechanics side of it)
  const battle = new BugContestBattle(scene as IBattleScene, playerParty, foeParty, playerTrainer as never, null);
  battle.party1starts = playerPartyStarts;
  battle.ballCount = pbBugContestState().ballcount;
  setBattleRule("single");
  BattleCreationHelperMethods.prepareBattle(battle as unknown as BattleLike);
  // Perform the battle itself
  let decision = 0;
  await pbBattleAnimation(pbGetWildBattleBGM(foeParty), 0, foeParty, async () => {
    // NOTE (Ruby parity): unlike every other battle, no pbSceneStandby here
    // (002_BugContest.rb:390), so the map's sprites stay alive under the battle.
    decision = await battle.pbStartBattle();
    await BattleCreationHelperMethods.afterBattle(decision, true);
    if (decision === 2 || decision === 5) { // Lost or drew
      G.gameSystem.bgmUnpause();
      G.gameSystem.bgsUnpause();
      await pbBugContestStartOver();
    }
  });
  Input.update();
  // Update Bug Contest game data based on result of battle
  pbBugContestState().ballcount = battle.ballCount;
  if (pbBugContestState().ballcount === 0) {
    await pbMessage(_INTL("ANNOUNCER:  The Bug-Catching Contest is over!"));
    await pbBugContestState().pbStartJudging();
  }
  // Save the result of the battle in Game Variable 1
  BattleCreationHelperMethods.setOutcome(decision, 1);
  // Used by the Poké Radar to update/break the chain
  await EventHandlers.trigger("on_wild_battle_end", species, level, decision);
  // Return false if the player lost or drew the battle, and true if any other result
  return decision !== 2 && decision !== 5;
}

//===============================================================================
// Event scripts
//===============================================================================
defineScript("pbBugContestState", () => pbBugContestState());
defineScript("pbInBugContest?", () => pbInBugContest());
defineScript("pbBugContestUndecided?", () => pbBugContestUndecided());
defineScript("pbBugContestDecided?", () => pbBugContestDecided());
defineScript("pbBugContestScore", (_c, pkmn) => pbBugContestScore(pkmn as Pokemon));
defineScript("pbBugContestBattle", (_c, species, level) => pbBugContestBattle(species as Id, Number(level)));
