// Port of 018_Alternate battle modes/001_Battle Frontier/004_Challenge_Battles.rb:
// the battle types a challenge creates (recorded Tower/Palace/Arena battles),
// pbOrganizedBattleEx (a challenge battle with the challenge's level
// adjustment and battle rules) and recording/playing back the last battle.
// The recorded battle classes are in game/battle/recordedBattle.ts.

import { Battle } from "../../battle/battle/Battle";
import type { IBattleScene } from "../../battle/BattleSceneInterface";
import { DEBUG } from "../../core/debug";
import { _INTL } from "../../data/gameData/gameData";
import { Audio } from "../../rgss/Audio";
import { Input } from "../../rgss/Input";
import { ChooseNumberParams, pbMessage, pbMessageChooseNumber } from "../../ui/messages";
import { pbGetTrainerBattleBGM } from "../battle/battleAudio";
import { pbBattleAnimation, pbSceneStandby } from "../battle/BattleIntroAnim";
import { BattleCreationHelperMethods, type BattleLike } from "../battle/BattleStarting";
import {
  type BattleRecord, BattleArenaPlaybackBattle, BattlePalacePlaybackBattle, PlaybackBattle, PlaybackHelper,
  RecordedBattle, RecordedBattleArenaBattle, RecordedBattlePalaceBattle,
} from "../battle/recordedBattle";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import type { Player } from "../trainer/Player";
import type { NPCTrainer } from "../trainer/Trainer";
import { PokemonChallengeRules } from "./challengeRules";

declare module "../globals" {
  interface GameTemp {
    lastBattleRecord?: string | null;
  }
  interface PokemonGlobalMetadata {
    lastbattle?: string | null;
  }
}

/** A trainer a battle type puts in a battle (the player or an NPCTrainer). */
export type ChallengeTrainer = { party: Pokemon[] };

//===============================================================================
//
//===============================================================================
export class BattleType {
  pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new Battle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}

//===============================================================================
//
//===============================================================================
export class BattleTower extends BattleType {
  override pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new RecordedBattle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}

//===============================================================================
//
//===============================================================================
export class BattlePalace extends BattleType {
  override pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new RecordedBattlePalaceBattle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}

//===============================================================================
//
//===============================================================================
export class BattleArena extends BattleType {
  override pbCreateBattle(scene: unknown, trainer1: ChallengeTrainer, trainer2: ChallengeTrainer): Battle {
    return new RecordedBattleArenaBattle(scene as IBattleScene, trainer1.party, trainer2.party, trainer1 as never, trainer2 as never);
  }
}

//===============================================================================
//
//===============================================================================
/** pbOrganizedBattleEx(opponent, challengedata): returns whether the player won. */
export async function pbOrganizedBattleEx(opponent: NPCTrainer, challengedata: PokemonChallengeRules | null): Promise<boolean> {
  // Skip battle if holding Ctrl in Debug mode
  if (Input.press(Input.CTRL) && DEBUG) {
    await pbMessage(_INTL("SKIPPING BATTLE..."));
    await pbMessage(_INTL("AFTER WINNING..."));
    await pbMessage(opponent.loseText || "...");
    G.gameTemp.lastBattleRecord = null;
    Audio.meStop(); // pbMEStop
    return true;
  }
  const player = G.player as unknown as Player;
  player.healParty();
  // Remember original data, to be restored after battle
  if (!challengedata) challengedata = new PokemonChallengeRules();
  const oldlevels = challengedata.adjustLevels(player.party, opponent.party);
  const olditems = player.party.map((p) => p.itemId);
  const olditems2 = opponent.party.map((p) => p.itemId);
  // Create the battle scene (the visual side of it)
  const scene = BattleCreationHelperMethods.createBattleScene();
  // Create the battle class (the mechanics side of it)
  const battle = challengedata.createBattle(scene, player, opponent) as Battle & { pbDumpRecord?(): string };
  battle.internalBattle = false;
  // Set various other properties in the battle class
  BattleCreationHelperMethods.prepareBattle(battle as unknown as BattleLike);
  // Perform the battle itself
  let decision = 0;
  await pbBattleAnimation(pbGetTrainerBattleBGM(opponent), 0, null, async () => {
    await pbSceneStandby(async () => {
      decision = await battle.pbStartBattle();
    });
  });
  Input.update();
  // Restore both parties to their original levels
  challengedata.unadjustLevels(player.party, opponent.party, oldlevels);
  // Heal both parties and restore their original items
  player.party.forEach((pkmn, i) => {
    pkmn.heal();
    pkmn.makeUnmega();
    pkmn.makeUnprimal();
    pkmn.item = olditems[i] ?? null;
  });
  opponent.party.forEach((pkmn, i) => {
    pkmn.heal();
    pkmn.makeUnmega();
    pkmn.makeUnprimal();
    pkmn.item = olditems2[i] ?? null;
  });
  // Save the record of the battle
  G.gameTemp.lastBattleRecord = null;
  if (decision === 1 || decision === 2 || decision === 5) { // if win, loss or draw
    // (A BattleType's plain Battle has no pbDumpRecord: NoMethodError in Ruby.)
    G.gameTemp.lastBattleRecord = battle.pbDumpRecord!();
  }
  switch (decision) {
    case 1: G.stats.trainerBattlesWon += 1; break; // Won
    case 2: case 3: case 5: G.stats.trainerBattlesLost += 1; break; // Lost, fled, draw
  }
  // Return true if the player won the battle, and false if any other result
  return decision === 1;
}

//===============================================================================
// Methods that record and play back a battle.
//===============================================================================
export function pbRecordLastBattle(): void {
  G.pokemonGlobal.lastbattle = G.gameTemp.lastBattleRecord ?? null;
  G.gameTemp.lastBattleRecord = null;
}

export async function pbPlayLastBattle(): Promise<void> {
  await pbPlayBattle(G.pokemonGlobal.lastbattle ?? null);
}

/** pbPlayBattle(battledata): Ruby's Marshal.restore of the record is JSON.parse here. */
export async function pbPlayBattle(battledata: string | null): Promise<void> {
  if (!battledata) return;
  const scene = BattleCreationHelperMethods.createBattleScene() as { abortable: boolean };
  scene.abortable = true;
  const lastbattle = JSON.parse(battledata) as BattleRecord;
  let battleplayer: Battle | null = null;
  switch (lastbattle[0]) {
    case 0: battleplayer = new PlaybackBattle(scene, lastbattle); break; // BattleChallenge::BattleTowerID
    case 1: battleplayer = new BattlePalacePlaybackBattle(scene, lastbattle); break; // BattlePalaceID
    case 2: battleplayer = new BattleArenaPlaybackBattle(scene, lastbattle); break; // BattleArenaID
  }
  const bgm = PlaybackHelper.pbGetBattleBGM(lastbattle); // raises, as in Ruby (see there)
  await pbBattleAnimation(bgm, 0, null, async () => {
    await pbSceneStandby(async () => {
      await battleplayer!.pbStartBattle();
    });
  });
}

//===============================================================================
// Debug playback methods.
//===============================================================================
export async function pbDebugPlayBattle(): Promise<void> {
  const params = new ChooseNumberParams();
  params.setRange(0, 500);
  params.setInitialValue(0);
  params.setCancelValue(-1);
  const num = await pbMessageChooseNumber(_INTL("Choose a battle."), params);
  if (num >= 0) await pbPlayBattleFromFile(`Battles/Battle${String(num).padStart(3, "0")}.dat`);
}

/**
 * pbPlayBattleFromFile(filename): pbRgssOpen reads the file from the game
 * folder (raising Errno::ENOENT if it's missing); here it's fetched from the
 * dev server's /game/ path, holding a record as pbDumpRecord writes it (JSON).
 */
export async function pbPlayBattleFromFile(filename: string): Promise<void> {
  const res = await fetch(`/game/${filename}`);
  if (!res.ok) throw new Error(`No such file or directory @ rb_sysopen - ${filename}`);
  await pbPlayBattle(await res.text());
}
