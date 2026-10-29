// Port of pbAnimationsOrganiser (Data/Scripts/020_Debug/001_Editor screens/001_EditorScreens.rb:1425):
// Debug menu > Editors > Battle Animation Organiser, which rearranges, inserts
// and deletes battle animations. Saves web/data/pkmn-animations.json
// (Data/PkmnAnimations.rxdata) through the dev server's file endpoint.
// Registers EditorScreens.pbAnimationsOrganiser.

import { PBAnimation, resetBattleAnimationsData } from "../../battle/scene/animationPlayer";
import { Viewport } from "../../rgss/display";
import { Graphics } from "../../rgss/Graphics";
import { _INTL } from "../../ui/messageConfig";
import { pbMessage } from "../../ui/messages";
import { Window_AdvancedTextPokemon, Window_UnformattedTextPokemon } from "../../ui/windows/SpriteWindowText";
import { devWriteOrExplain } from "../devFiles";
import { EditorScreens } from "../editorScreens";
import { pbListWindow } from "../EditorListers";
import { pbCommands3 } from "../EditorUtilities";
import { loadPkmnAnimationsForEditor, PKMN_ANIMATIONS_FILE, savePkmnAnimations } from "./AnimEditor_Data";

/** The organiser's list entries ("0: Name"). */
export function organiserCommands(list: { length: number; get(i: number): PBAnimation | null }): string[] {
  const commands: string[] = [];
  for (let i = 0; i < list.length; i++) {
    commands.push(`${i}: ${list.get(i) ? list.get(i)!.name : "???"}`);
  }
  return commands;
}

export async function pbAnimationsOrganiser(): Promise<void> {
  const file = await loadPkmnAnimationsForEditor(); // pbLoadBattleAnimations
  const list = file?.animations ?? null;
  if (!list || !list.get(0)) {
    await pbMessage(_INTL("No animations exist."));
    return;
  }
  const viewport = new Viewport(0, 0, Graphics.width, Graphics.height);
  viewport.z = 99999;
  const cmdwin = pbListWindow([]);
  cmdwin.viewport = viewport;
  cmdwin.z = 2;
  const title = Window_UnformattedTextPokemon.newWithSize(
    _INTL("Animations Organiser"), Graphics.width / 2, 0, Graphics.width / 2, 64, viewport,
  );
  title.z = 2;
  const info = Window_AdvancedTextPokemon.newWithSize(
    _INTL("Z+Up/Down: Swap\nZ+Left: Delete\nZ+Right: Insert"),
    Graphics.width / 2, 64, Graphics.width / 2, Graphics.height - 64, viewport,
  );
  info.z = 2;
  let commands: string[] = [];
  let refreshlist = true;
  let cmd: [number, number] = [0, 0];
  for (;;) {
    if (refreshlist) commands = organiserCommands(list);
    refreshlist = false;
    cmd = await pbCommands3(cmdwin, commands, -1, cmd[1], true);
    const arr = list.array;
    switch (cmd[0]) {
      case 1: // Swap animation up
        if (cmd[1] >= 0 && cmd[1] < commands.length - 1) {
          [arr[cmd[1] + 1], arr[cmd[1]]] = [arr[cmd[1]] ?? null, arr[cmd[1] + 1] ?? null];
          refreshlist = true;
        }
        break;
      case 2: // Swap animation down
        if (cmd[1] > 0) {
          [arr[cmd[1] - 1], arr[cmd[1]]] = [arr[cmd[1]] ?? null, arr[cmd[1] - 1] ?? null];
          refreshlist = true;
        }
        break;
      case 3: // Delete spot
        list.deleteAt(cmd[1]);
        cmd[1] = Math.min(cmd[1], list.length - 1);
        refreshlist = true;
        await Graphics.wait(0.2); // pbWait(Graphics.frame_rate * 2 / 10)
        break;
      case 4: // Insert spot
        list.insert(cmd[1], new PBAnimation());
        refreshlist = true;
        await Graphics.wait(0.2);
        break;
      case 0: {
        const cmd2 = await pbMessage(_INTL("Save changes?"), [_INTL("Yes"), _INTL("No"), _INTL("Cancel")], 3);
        if (cmd2 === 0 || cmd2 === 1) {
          if (cmd2 === 0) {
            // Save animations here
            const saved = await devWriteOrExplain(PKMN_ANIMATIONS_FILE, () => savePkmnAnimations(file!));
            resetBattleAnimationsData(); // $game_temp.battle_animations_data = nil
            if (saved) await pbMessage(_INTL("Data saved."));
          }
          title.dispose();
          info.dispose();
          cmdwin.dispose();
          viewport.dispose();
          return;
        }
        break;
      }
    }
  }
}

EditorScreens.pbAnimationsOrganiser = pbAnimationsOrganiser;
