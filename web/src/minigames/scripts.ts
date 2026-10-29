// The minigames' event script functions (by their Ruby names, see
// game/scriptApi.ts), the Triple Triad plugin item hooks
// (game/items/pluginItems.ts) and the `$speeches` global the Duel event
// (map 194) builds before calling pbDuel.

import type { Id } from "../data/gameData/gameData";
import type { GameCharacter } from "../game/GameCharacter";
import { PluginItemHooks } from "../game/items/pluginItems";
import { defineScript } from "../game/scriptApi";
import { pbDanceGame, pbShowInfiniteScore, pbSurvivalTimeRecord } from "./DanceMinigame";
import { pbDuel } from "./Duel";
import { pbLottery, pbSetLotteryNumber } from "./Lottery";
import { pbMiningGame } from "./Mining";
import { Roulette } from "./Roulette";
import { pbSlotMachine } from "./SlotMachine";
import { pbTilePuzzle } from "./TilePuzzles";
import { pbCanTriadDuel, pbGiveTriadCard, pbSellTriads, pbTriadDuel, pbTriadList } from "./TripleTriad";
import { BoosterPack } from "./TripleTriad_BoosterPacks";
import { pbBuyTriads, pbTriadBinder } from "./TripleTriad_Improvements";
import { pbGiveTriadCardWithAnimation } from "./TripleTriad_ReceiveCard";
import { pbVoltorbFlip } from "./VoltorbFlip";

const num = (v: unknown, d: number) => (v == null ? d : Number(v));

// Triple Triad (002_Minigame_TripleTriad.rb and the Booster Packs plugin)
defineScript("pbCanTriadDuel?", () => pbCanTriadDuel());
defineScript("pbTriadDuel", (_c, name, minLevel, maxLevel, rules, oppdeck, prize) =>
  pbTriadDuel(String(name), Number(minLevel), Number(maxLevel), rules ?? null, oppdeck ?? null, (prize as Id | null) ?? null));
defineScript("pbBuyTriads", (_c, species) => pbBuyTriads((species as Id[] | undefined) ?? []));
defineScript("pbSellTriads", () => pbSellTriads());
defineScript("pbTriadList", () => pbTriadList());
defineScript("pbTriadBinder", () => pbTriadBinder());
defineScript("pbGiveTriadCard", (_c, species, quantity) => pbGiveTriadCard(species as Id, num(quantity, 1)));
defineScript("pbGiveTriadCardWithAnimation", (_c, item, quantity) => pbGiveTriadCardWithAnimation(item as Id, num(quantity, 1)));
defineScript("BoosterPack.initialize_all_packs", () => BoosterPack.initializeAllPacks());
defineScript("BoosterPack.give", (_c, item, n, index) => BoosterPack.give(item as Id, Number(n), num(index, 0)));
defineScript("BoosterPack.print_species_array", (_c, type) => BoosterPack.printSpeciesArray(type as Id));

PluginItemHooks.triadBinder = pbTriadBinder;
PluginItemHooks.boosterPackGive = (item, numberOfCards, boosterIndex) => BoosterPack.give(item, numberOfCards, boosterIndex);

// 001-007_Minigame_*.rb
defineScript("pbDuel", (ctx, trainerId, trainerName, event, speeches) =>
  pbDuel(trainerId as Id, String(trainerName), (event ?? ctx.event) as GameCharacter | null, (speeches as string[]) ?? []));
defineScript("pbSlotMachine", (_c, difficulty) => pbSlotMachine(num(difficulty, 1)));
defineScript("pbVoltorbFlip", () => pbVoltorbFlip());
defineScript("pbSetLotteryNumber", (_c, variable) => pbSetLotteryNumber(num(variable, 1)));
defineScript("pbLottery", (_c, winnum, nameVar, positionVar, matchedVar) =>
  pbLottery(winnum, num(nameVar, 2), num(positionVar, 3), num(matchedVar, 4)));
defineScript("pbMiningGame", () => pbMiningGame());
defineScript("pbTilePuzzle", (_c, game, board, width, height) => pbTilePuzzle(Number(game), board, num(width, 0), num(height, 0)));

// Plugins/Roulette Game
defineScript("Roulette.start", (_c, wager, colors) => Roulette.start(num(wager, 1), (colors as typeof Roulette.RED | null) ?? null));
defineScript("Roulette::RED", () => Roulette.RED);
defineScript("Roulette::GREEN", () => Roulette.GREEN);
defineScript("Roulette::BLUE", () => Roulette.BLUE);

// Plugins/Dance Minigame
defineScript("pbDanceGame", (_c, gameId, bpm) => pbDanceGame(Number(gameId), num(bpm, 120)));
defineScript("PBMiniGames::DanceGame.pbDanceGame", (_c, gameId, bpm) => pbDanceGame(Number(gameId), num(bpm, 120)));
defineScript("pbShowInfiniteScore", () => pbShowInfiniteScore());
defineScript("pbSurvivalTimeRecord", (_c, id) => pbSurvivalTimeRecord(num(id, 1)));

// `$speeches = []; $speeches.push(...)` (a Ruby global; not saved, as in Ruby)
let speeches: unknown = null;
defineScript("$speeches", () => speeches);
defineScript("$speeches=", (_c, value) => { speeches = value; });
