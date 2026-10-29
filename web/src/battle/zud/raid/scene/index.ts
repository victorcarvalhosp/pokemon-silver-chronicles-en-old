// Max Raid battles on the battle scene (imported by zud/scene/index.ts):
// - the Battle::Scene methods pbRaidShield and pbWaveAttack
//   (Scene_Animation_MaxRaid.ts);
// - the command/target menu mode with "Cheer" instead of "Run"
//   (ZUD Mechanics/[009] Max Raid/Raid_Battle.rb:366-372);
// - preloading what a raid boss's databox and the raid animations draw (the
//   databox itself is in battle/scene/objects.ts).

import { preloadBitmaps } from "../../../../ui/rpgCache";
import { BattleScene } from "../../../scene/BattleScene";
import { CommandMenu } from "../../../scene/menus";
import { RAID_SHIELD_GRAPHICS, raidSceneMethods, WAVE_ATTACK_GRAPHICS } from "./Scene_Animation_MaxRaid";

Object.assign(BattleScene.prototype, raidSceneMethods);

type RaidSceneMethods = typeof raidSceneMethods;
declare module "../../../scene/BattleScene" {
  interface BattleScene extends RaidSceneMethods {}
}

//===============================================================================
// Adds a command menu configuration to display the "Cheer" command.
//===============================================================================
// (TargetMenu::MODES is the same array as CommandMenu::MODES in the port.)
(CommandMenu.MODES as unknown as number[][]).push([0, 2, 1, 10]); // 5 = Fight, Bag, Pokemon, Cheer

/** The graphics a Max Raid boss's databox draws (ZUD [005] Scene_PokemonDataBox.rb). */
export const RAID_DATABOX_GRAPHICS = [
  "Graphics/Plugins/ZUD/Battle/databox_raid", "Graphics/Plugins/ZUD/Battle/overlay_hp",
  "Graphics/Plugins/ZUD/Battle/raid_num", "Graphics/Plugins/ZUD/Battle/raid_bar",
  "Graphics/Plugins/ZUD/Battle/raid_shield", "Graphics/Plugins/ZUD/Battle/shiny",
  "Graphics/Plugins/ZUD/Battle/icon_own",
];

BattleScene.extraPreloads.push(async (scene) => {
  const battle = scene.battle as unknown as { raidBattle?: boolean } | null;
  if (!battle?.raidBattle) return;
  await preloadBitmaps([...RAID_DATABOX_GRAPHICS, ...RAID_SHIELD_GRAPHICS, ...WAVE_ATTACK_GRAPHICS]);
});
