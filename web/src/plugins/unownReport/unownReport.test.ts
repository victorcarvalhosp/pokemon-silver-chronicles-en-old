// Replays tools/ruby-ref/unown_report_reference.rb (the real
// Plugins/Unown Report/Unown_Report_Mechanic.rb on the real Player::Pokedex,
// headless) against the port: the pages listed for a Pokédex with various
// Unown forms registered, what each button draws, and the button layout for
// every list length and cursor position.

import { beforeAll, describe, expect, it } from "vitest";
import { loadGameDataForTests } from "../../data/gameData/testing";
import { G } from "../../game/globals";
import { Pokedex } from "../../game/trainer/Pokedex";
import { Scene_Unownreport, UnownreportButton, unownReportButtonRow } from "./UnownReportMechanic";
import ref from "./unownReportReference.json";

beforeAll(() => loadGameDataForTests());

function dexWith(regs: number[][]): Pokedex {
  const dex = new Pokedex();
  for (const [gender, form, shiny, special] of regs) dex.register("UNOWN", gender, form, shiny, true, special);
  return dex;
}

describe("Unown_Report_Mechanic.rb", () => {
  it("lists one page per Unown form seen (any gender, any sprite set seen_form? checks)", () => {
    for (const sc of ref.dexes) {
      G.player = { pokedex: dexWith(sc.registered), gender: 0 } as never;
      const scene = new Scene_Unownreport();
      const commands = scene.buildCommands();
      expect(commands).toEqual(sc.commands);
      commands.forEach((name, i) => expect(scene.cmd[name]).toBe(i));
      expect(sc.background).toBe("Graphics/Pictures/UnownReport/unownreportbg"); // no unownreportbgf graphic
      expect(sc.scene).toBe("Scene_Map"); // BACK
      // UnownreportButton#refresh: name and icon on both halves of the 330x104 button.
      sc.buttons.forEach((b, i) => {
        const { textpos, imagepos } = UnownreportButton.drawPositions(commands[i]!, 330);
        expect([["text", textpos.map((t) => t.slice(0, 4))], ["image", imagepos]]).toEqual(b.draws);
        expect(b.x).toBe(42);
      });
    }
  });

  it("lays the buttons out around the cursor (invisible buttons keep their last y)", () => {
    for (const sc of ref.layouts) {
      const n = sc.length;
      const ys = new Array<number>(n).fill(0);
      const place = (index: number) => ys.map((_, i) => {
        const { visible, y } = unownReportButtonRow(i, index, n);
        if (visible) ys[i] = y;
        return [ys[i], visible, i === index, i === index ? 52 : 0];
      });
      expect(place(sc.menuIndex).map((r) => r.slice(0, 3))).toEqual(sc.afterMain);
      sc.rows.forEach((row, idx) => expect(place(idx)).toEqual(row));
    }
  });
});
