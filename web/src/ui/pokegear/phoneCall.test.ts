// pbCallTrainer's NPC branch (013_Items/004_Item_Phone.rb:185-190): a contact
// that isn't an 8-entry trainer contact runs the common event its ident names.
// Regression: the port used to turn a trainer type into pbCommonEvent(NaN)
// (and a "messages not defined" box) where Ruby raises.
import { describe, expect, it, vi } from "vitest";

const shown = vi.hoisted(() => [] as string[]);
vi.mock("../messages", async (orig) => ({
  ...(await orig<typeof import("../messages")>()),
  pbMessage: async (m: string) => { shown.push(m); return 0; },
}));

const { G } = await import("../../game/globals");
const { pbCallTrainer, pbCommonEvent } = await import("./phone");

describe("pbCallTrainer, NPC contacts", () => {
  it("says so when an NPC's common event doesn't exist", async () => {
    G.pokemonGlobal = { phoneNumbers: [[true, 99999, "Mother", 3]] } as never;
    await pbCallTrainer(99999, "Mother");
    expect(shown).toEqual(["Mother's messages not defined.\nCouldn't call common event 99999."]);
  });

  it("raises like Ruby for a trainer contact registered without an event (pbCommonEvent(:YOUNGSTER))", async () => {
    G.pokemonGlobal = { phoneNumbers: [[true, "YOUNGSTER", "Joey", 0, 0, 0]] } as never;
    await expect(pbCallTrainer("YOUNGSTER", "Joey")).rejects.toThrow("comparison of Symbol with 0 failed");
    await expect(pbCommonEvent(-1)).resolves.toBe(false);
  });
});
