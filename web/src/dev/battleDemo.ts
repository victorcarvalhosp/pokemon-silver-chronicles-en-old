// Dev page for the battle scene (web/dev-battle.html): a scripted mock battle,
// wild Lv. 3 Pidgey vs. the player's Lv. 5 Cyndaquil on Route 29's grass
// battleback, driving Battle::Scene the way the battle core does:
//   intro slide-in -> "Wild PIDGEY appeared!" -> "Go! CYNDAQUIL!" (ball throw
//   and burst) -> command menu -> fight menu -> move animation + HP drain ->
//   Pidgey's move -> ... -> faint -> Exp. bar -> victory -> fade out.
// Bag opens the battle-mode Bag: a Potion heals (HealthUp animation, HP bar),
// a Poké Ball is thrown (?shakes=0..4, default 4 = caught). Pokémon opens the
// battle-mode party screen. Run ends the battle.
//
//   ?time=1 / ?time=2   evening / night backdrop     ?shiny=1  shiny Pidgey
//   ?ability=1  ability splash after the intro         ?levelup=1  enough Exp. to level up
//   Enter/Space/C = USE   Esc/X = BACK   arrows = move   Enter restarts at the end
// When the browser pane is hidden requestAnimationFrame stops; drive it with
// __demo.step(n) (60 Hz ticks) and __demo.press("Enter") from the console.

import { rand } from "../core/random";
import { createScreen } from "../core/screen";
import type { Id } from "../data/gameData/gameData";
import { Item } from "../data/gameData/item";
import { Metadata } from "../data/gameData/metadata";
import { Move as MoveData } from "../data/gameData/move";
import { Effectiveness } from "../data/gameData/type";
import { pbBGMPlay } from "../game/GameSystem";
import { GameSystem } from "../game/GameSystem";
import { G } from "../game/globals";
import { PokemonBag } from "../game/items/PokemonBag";
import { initializeGame } from "../game/newGame";
import { Pokemon } from "../game/pokemon/Pokemon";
import { PokemonMove } from "../game/pokemon/PokemonMove";
import { GameStats } from "../game/trainer/GameStats";
import { Player } from "../game/trainer/Player";
import { unlockAudio } from "../rgss/Audio";
import { Graphics, initGraphics, render, runGame, runTick } from "../rgss/Graphics";
import { Input } from "../rgss/Input";
import { _INTL } from "../ui/messageConfig";
import { pbStringToAudioFile } from "../ui/messages";
import { BattleScene, DXTriggers } from "../battle/scene/BattleScene";
import type { SceneBattle, SceneBattler, SceneMove, SceneTrainer } from "../battle/scene/types";
import type { Target } from "../data/gameData/target";

const hud = document.getElementById("hud")!;
const params = new URLSearchParams(location.search);
addEventListener("keydown", () => void unlockAudio(), { once: true });

const app = await createScreen(document.getElementById("screen")!);
initGraphics(app);
await initializeGame();
G.gameSystem = new GameSystem();
G.gameSystem.saveDisabled = true;
G.stats = new GameStats();

const player = new Player("Gold", "PkMnTRAINER_Male");
G.player = player as never;
player.hasPokedex = true;
const bag = new PokemonBag();
G.bag = bag;
for (const [item, qty] of [["POTION", 5], ["ANTIDOTE", 2], ["POKEBALL", 5], ["ORANBERRY", 1]] as [string, number][]) bag.add(item, qty);
G.gameMap = { mapId: 4, events: new Map() } as never; // Route 29
G.scene = { async miniupdate() {} };

class AbortError extends Error {}

/** The running scene, for the console (__demo.scene). */
const current: { scene: BattleScene | null } = { scene: null };

//===============================================================================
// Mock battle (just what Battle::Scene reads)
//===============================================================================
class MockMove implements SceneMove {
  constructor(readonly move: PokemonMove) {}
  get id(): Id { return this.move.id; }
  get name(): string { return this.move.name; }
  get shortName(): string { return this.name.length > 16 ? this.name.slice(0, 13) + "..." : this.name; }
  get pp(): number { return this.move.pp; }
  totalPp(): number { return this.move.totalPp; }
  displayType(): Id { return this.move.type; }
}

class MockBattler implements SceneBattler {
  effects: unknown[] = [];
  statusCount = 0;
  moves: MockMove[];
  constructor(readonly battle: MockBattle, readonly index: number, readonly pokemon: Pokemon) {
    this.moves = pokemon.moves.map((m) => new MockMove(m));
  }
  get pokemonIndex(): number { return 0; }
  get name(): string { return this.pokemon.name; }
  get hp(): number { return this.pokemon.hp; }
  set hp(v: number) { this.pokemon.hp = v; }
  get totalhp(): number { return this.pokemon.totalhp; }
  get level(): number { return this.pokemon.level; }
  get status(): Id { return this.pokemon.status; }
  abilityName(): string { return this.pokemon.ability?.name ?? ""; }
  displayGender(): number { return this.pokemon.gender; }
  fainted(): boolean { return this.pokemon.hp <= 0; }
  opposes(i = 0): boolean { return (this.index & 1) !== (i & 1); }
  shiny(): boolean { return this.pokemon.shiny; }
  superShiny(): boolean { return this.pokemon.superShiny; }
  mega(): boolean { return false; }
  primal(): boolean { return false; }
  owned(): boolean { return this.battle.wildBattle() && player.owned(this.pokemon.species); }
  isSpecies(s: Id): boolean { return this.pokemon.isSpecies(s); }
  pbThis(lowerCase = false): string {
    if (!this.opposes()) return this.name;
    return lowerCase ? _INTL("the wild {1}", this.name) : _INTL("The wild {1}", this.name);
  }
}

class MockBattle implements SceneBattle {
  scene: BattleScene;
  battlers: MockBattler[];
  sideSizes = [1, 1];
  player: SceneTrainer[] = [player];
  opponent = null;
  time = Number(params.get("time") ?? 0);
  backdrop = "grass"; // Route 29: BattleBack = grass
  backdropBase = "grass"; // Environment Grass -> battle_base "grass"
  showAnims = true;
  constructor(scene: BattleScene, ours: Pokemon, foe: Pokemon) {
    this.scene = scene;
    this.battlers = [new MockBattler(this, 0, ours), new MockBattler(this, 1, foe)];
  }
  trainerBattle(): boolean { return false; }
  wildBattle(): boolean { return true; }
  singleBattle(): boolean { return true; }
  pbSideSize(i: number): number { return this.sideSizes[i % 2]!; }
  opposes(a: number, b = 0): boolean { return (a & 1) !== (b & 1); }
  pbParty(i: number): Pokemon[] { return i % 2 === 0 ? player.party : [this.battlers[1]!.pokemon]; }
  pbPartyStarts(): number[] { return [0]; }
  pbPartyOrder(): number[] { return [0, 1, 2, 3, 4, 5]; }
  pbTeamIndexRangeFromBattlerIndex(): [number, number] { return [0, 6]; }
  pbPlayerDisplayParty(): Pokemon[] { return player.party; }
  pbNumPositions(): number { return 1; }
  pbTeamLengthFromBattlerIndex(i: number): number { return this.pbParty(i).length; }
  pbPlayerBattlerCount(): number { return 1; }
  pbOpposingBattlerCount(): number { return 1; }
  allBattlers(): MockBattler[] { return this.battlers.filter((b) => !b.fainted()); }
  allSameSideBattlers(i = 0): MockBattler[] { return this.allBattlers().filter((b) => !b.opposes(i)); }
  allOtherSideBattlers(i = 0): MockBattler[] { return this.allBattlers().filter((b) => b.opposes(i)); }
  nearBattlers(): boolean { return true; }
  pbGetOpposingIndicesInOrder(i: number): number[] { return i % 2 === 0 ? [1] : [0]; }
  pbMoveCanTarget(_u: number, _t: number, _d: Target): boolean { return true; }
  pbGetOwnerIndexFromBattlerIndex(): number { return 0; }
  pbGetOwnerFromBattlerIndex(): SceneTrainer { return player; }
  pbPlayer(): SceneTrainer { return player; }
  pbCanShift(): boolean { return false; }
  pbAbort(): void { throw new AbortError("Battle aborted"); }
  pbDisplay(msg: string): Promise<void> { return this.scene.pbDisplayMessage(msg); }
  pbDisplayPaused(msg: string): Promise<void> { return this.scene.pbDisplayPausedMessage(msg); }
  pbDisplayBrief(msg: string): Promise<void> { return this.scene.pbDisplayMessage(msg, true); }
}

//===============================================================================
// The script
//===============================================================================
function makeParty(): [Pokemon, Pokemon] {
  const cyndaquil = new Pokemon("CYNDAQUIL", 5);
  cyndaquil.moves = ["TACKLE", "LEER", "SMOKESCREEN", "EMBER"].map((m) => new PokemonMove(m));
  cyndaquil.pokeBall = "POKEBALL";
  player.party = [cyndaquil];
  const pidgey = new Pokemon("PIDGEY", 3);
  pidgey.moves = ["TACKLE", "SANDATTACK"].map((m) => new PokemonMove(m));
  if (params.get("shiny")) pidgey.shiny = true;
  return [cyndaquil, pidgey];
}

/** Effectiveness index the damage SE uses: 0 normal, 1 not very, 2 super. */
function effectiveness(moveType: Id, target: Pokemon): number {
  const types = target.speciesData().types;
  const value = Effectiveness.calculate(moveType, types[0], types[1]);
  return Effectiveness.superEffective(value) ? 2 : Effectiveness.notVeryEffective(value) ? 1 : 0;
}

/** One move: message, animation, HP drop (Battle::Move#pbAnimateHitAndHPLost). */
async function useMove(battle: MockBattle, scene: BattleScene, user: MockBattler, target: MockBattler, idxMove: number, damage: number): Promise<void> {
  const move = user.moves[idxMove]!;
  move.move.pp -= 1;
  await battle.pbDisplay(_INTL("{1} used {2}!", user.pbThis(), move.name));
  await scene.pbAnimation(move.id, user, target);
  if (MoveData.get(move.id).category === 2) {
    await battle.pbDisplay(_INTL("{1}'s {2} fell!", target.pbThis(), move.id === "SANDATTACK" ? _INTL("accuracy") : _INTL("Defense")));
    return;
  }
  const oldHP = target.hp;
  target.hp = Math.max(0, target.hp - damage);
  await scene.pbHitAndHPLossAnimation([[target, oldHP, effectiveness(move.move.type, target.pokemon)]]);
}

async function battleDemo(): Promise<void> {
  const [cyndaquil, pidgey] = makeParty();
  const scene = new BattleScene();
  const battle = new MockBattle(scene, cyndaquil, pidgey);
  current.scene = scene;
  const [ours, foe] = battle.battlers as [MockBattler, MockBattler];
  pbBGMPlay(pbStringToAudioFile(Metadata.get().wildBattleBGM || "Battle wild"));
  hud.textContent = "Wild battle demo\nEnter/Space = USE, Esc/X = BACK, arrows";
  // Battle#pbStartBattle
  await scene.pbStartBattle(battle);
  await battle.pbDisplayPaused(_INTL("Wild {1} appeared!", pidgey.name));
  if (params.get("ability")) { // An ability splash (as Battle#pbStartBattle's ability triggers show them)
    await scene.pbShowAbilitySplash(foe);
    await battle.pbDisplay(_INTL("{1} is watching closely!", foe.pbThis()));
    await scene.pbHideAbilitySplash(foe);
  }
  await battle.pbDisplayBrief(_INTL("Go! {1}!", cyndaquil.name));
  await scene.pbSendOutBattlers([[0, cyndaquil]], true);
  // Command phase loop
  let turn = 0;
  for (;;) {
    await scene.pbBeginCommandPhase();
    const cmd = await scene.pbCommandMenu(0, true);
    let chosenMove = -1;
    let chosenItem: Id | null = null;
    if (cmd === 0) { // Fight
      await scene.pbFightMenu(0, false, false, false, false, false, false, false, false, (c) => {
        if (c === DXTriggers.MENU_TRIGGER_CANCEL) return true;
        if (c < 0 || !ours.moves[c]) return false;
        chosenMove = c;
        return true;
      });
      if (chosenMove < 0) continue;
    } else if (cmd === 1) { // Bag: Poké Balls and Potions can be used
      await scene.pbItemMenu(0, true, (item, useType) => {
        if (useType !== 4 && item !== "POTION") return false;
        chosenItem = item;
        return true;
      });
      if (!chosenItem) continue;
    } else if (cmd === 2) { // Pokémon (switching isn't possible with one Pokémon)
      await scene.pbPartyScreen(0, true, 0, () => false);
      continue;
    } else if (cmd === 3) { // Run
      await battle.pbDisplayPaused(_INTL("You got away safely!"));
      await scene.pbEndBattle(3);
      return;
    } else {
      continue;
    }
    // Attack phase
    await scene.pbBeginAttackPhase();
    if (chosenItem === "POTION") { // Battle#pbUseItemOnPokemon -> Battler#pbRecoverHP
      bag.remove(chosenItem);
      await battle.pbDisplayBrief(_INTL("{1} used the {2}.", player.name, Item.get(chosenItem).name));
      const oldHP = ours.hp;
      ours.hp = Math.min(ours.totalhp, ours.hp + 20);
      await scene.pbHPChanged(ours, oldHP, true);
      await battle.pbDisplay(_INTL("{1}'s HP was restored.", ours.name));
    } else if (chosenItem) { // Battle#pbThrowPokeBall
      bag.remove(chosenItem);
      await battle.pbDisplayBrief(_INTL("{1} threw a {2}!", player.name, Item.get(chosenItem).name));
      const shakes = Number(params.get("shakes") ?? 4);
      await scene.pbThrow(chosenItem, shakes, false, 1);
      if (shakes >= 4) {
        await battle.pbDisplayBrief(_INTL("Gotcha! {1} was caught!", pidgey.name));
        await scene.pbThrowSuccess();
        await scene.pbHideCaptureBall(1);
        await scene.pbEndBattle(4);
        return;
      }
      await battle.pbDisplay([_INTL("Oh no! The Pokémon broke free!"), _INTL("Aww! It appeared to be caught!"),
        _INTL("Aargh! Almost had it!"), _INTL("Gah! It was so close, too!")][shakes]!);
    } else {
      const dmg = turn === 0 ? Math.ceil(foe.totalhp * 0.6) : foe.totalhp;
      await useMove(battle, scene, ours, foe, chosenMove, dmg);
      if (foe.fainted()) break;
      if (MoveData.get(ours.moves[chosenMove]!.id).category !== 2) turn += 1; // the next damaging move knocks Pidgey out
    }
    await useMove(battle, scene, foe, ours, rand(2), Math.max(1, Math.floor(ours.totalhp / 5)));
  }
  // Pidgey faints
  await scene.pbFaintBattler(foe);
  await battle.pbDisplayPaused(_INTL("{1} fainted!", foe.pbThis()));
  scene.pbWildBattleSuccess();
  // Exp. gain (Battle#pbGainExpOne)
  let expGained = Math.floor((pidgey.speciesData().baseExp * pidgey.level) / 5);
  if (params.get("levelup")) expGained = cyndaquil.growthRate().minimumExpForLevel(cyndaquil.level + 1) - cyndaquil.exp + 10;
  await battle.pbDisplayPaused(_INTL("{1} got {2} Exp. Points!", cyndaquil.name, expGained));
  const growthRate = cyndaquil.growthRate();
  const expFinal = cyndaquil.exp + expGained;
  let tempExp1 = cyndaquil.exp;
  for (;;) {
    const curLevel = cyndaquil.level;
    const levelMinExp = growthRate.minimumExpForLevel(curLevel);
    const levelMaxExp = growthRate.minimumExpForLevel(curLevel + 1);
    const tempExp2 = levelMaxExp < expFinal ? levelMaxExp : expFinal;
    cyndaquil.exp = tempExp2;
    await scene.pbEXPBar(ours, levelMinExp, levelMaxExp, tempExp1, tempExp2);
    tempExp1 = tempExp2;
    if (tempExp2 < levelMaxExp) break;
    // Levelled up
    await scene.pbCommonAnimation("LevelUp", ours);
    const old = [cyndaquil.totalhp, cyndaquil.attack, cyndaquil.defense, cyndaquil.spatk, cyndaquil.spdef, cyndaquil.speed] as const;
    cyndaquil.calcStats();
    scene.pbRefreshOne(0);
    await battle.pbDisplayPaused(_INTL("{1} grew to Lv. {2}!", cyndaquil.name, cyndaquil.level));
    await scene.pbLevelUp(cyndaquil, ours, ...old);
  }
  await scene.pbEndBattle(1);
}

async function waitForKey(keys: number[]): Promise<void> {
  for (;;) {
    await Graphics.update();
    Input.update();
    if (keys.some((k) => Input.trigger(k))) return;
  }
}

runGame(async () => {
  for (;;) {
    try {
      await battleDemo();
    } catch (e) {
      if (!(e instanceof AbortError)) throw e;
    }
    hud.textContent = "Battle over. Enter restarts.";
    await waitForKey([Input.USE]);
  }
}, (e) => {
  console.error(e);
  hud.textContent = String(e instanceof Error ? e.stack : e);
});

async function step(n = 1): Promise<void> {
  for (let i = 0; i < n; i++) await runTick();
  render();
}

/** Presses a key for one tick (KeyboardEvent code, e.g. "Enter", "Escape", "ArrowDown", "KeyZ"). */
async function press(code: string, ticks = 2): Promise<void> {
  dispatchEvent(new KeyboardEvent("keydown", { code }));
  await step(ticks);
  dispatchEvent(new KeyboardEvent("keyup", { code }));
  await step(1);
}

/** The canvas as a PNG data URL (after rendering). */
function snapshot(): string {
  render();
  return (app.canvas as HTMLCanvasElement).toDataURL("image/png");
}

Object.assign(window, { __demo: { G, Graphics, Input, step, press, snapshot, get scene() { return current.scene; } } });
