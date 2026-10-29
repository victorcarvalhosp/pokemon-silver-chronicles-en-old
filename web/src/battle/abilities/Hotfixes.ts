// Port of the ability handlers in Plugins/v20.1 Hotfixes/Battle bug fixes.rb
// (lines 402-412). The rest of that file patches battle methods and is ported
// in the core files it patches (see their headers).

import type { Id } from "../../data/gameData/gameData";
import type { Battler } from "../battler/Battler";
import { AbilityEffects } from "../other/AbilityEffects";

//===============================================================================
// Fixed Pastel Veil not providing poison immunity to allies, and not healing the
// bearer if it becomes poisoned anyway.
//===============================================================================
AbilityEffects.StatusImmunityFromAlly.add("PASTELVEIL", (_ability: Id, _battler: Battler, status: Id) => {
  if (status === "POISON") return true;
  return undefined;
});

AbilityEffects.StatusCure.copy("IMMUNITY", "PASTELVEIL");
