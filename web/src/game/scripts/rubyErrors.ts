// Names the game's events call that don't exist in the original game (v20.1
// and its plugins): left over from the older Essentials the game started on,
// or from plugins it doesn't have. In Ruby each raises when the script runs
// (NameError/NoMethodError), Interpreter#execute_script turns that into an
// EventScriptError and the game stops with the error box. NOTE (Ruby parity):
// they raise the same here, so the port stops where the original does. The
// events are listed in docs/original-game-bugs.md ("Event scripts").

import { defineScript } from "../scriptApi";

/** A Ruby NameError / NoMethodError raised by an event script. */
export class RubyScriptError extends Error {
  constructor(name: "NameError" | "NoMethodError", message: string) {
    super(message);
    this.name = name;
  }
}

export function rubyNameError(message: string): never {
  throw new RubyScriptError("NameError", message);
}

export function rubyNoMethodError(message: string): never {
  throw new RubyScriptError("NoMethodError", message);
}

/** Registers `name` as a call that raises Ruby's error for it. */
function missingMethod(name: string, receiver = "#<Interpreter>"): void {
  const bare = name.replace(/^#/, "");
  const method = bare.slice(bare.lastIndexOf(".") + 1);
  defineScript(name, () => rubyNoMethodError(`undefined method \`${method}' for ${receiver}`));
}
function missingConstant(name: string): void {
  defineScript(name, () => rubyNameError(`uninitialized constant ${name.split(/\.|::(?=[a-z])/)[0]}`));
}

// PBSpecies doesn't exist since v19 (the Chronicles Helpers keep PBItems and
// PBTrainers only), so PBSpecies::X raises.
for (const species of ["ARON", "BULBASAUR", "CHARMANDER", "CHIKORITA", "ELECTRODE", "GROUDON", "KECLEON", "RAIKOU",
  "SQUIRTLE", "TANGELA", "RAICHU", "VENONAT"]) {
  defineScript(`PBSpecies::${species}`, () => rubyNameError("uninitialized constant PBSpecies"));
}
defineScript("PBSpecies.getName", () => rubyNameError("uninitialized constant PBSpecies"));
// PBItems constants the Chronicles Helpers don't define (old item names).
for (const item of ["PARLYZHEAL", "POKeBALL", "POKeDOLL", "XDEFEND", "XSPECIAL"]) {
  defineScript(`PBItems::${item}`, () => rubyNameError(`uninitialized constant PBItems::${item}`));
}
// Online features and scenes from other games/versions.
for (const name of ["GTS.open", "PVP.open", "OnlineLobby.open", "PokemonLoadScene.new"]) missingConstant(name);
// Secret Bases, Wonder Trade, old move-deleter and follower helpers...
for (const name of [
  "pbSecretBaseMart", "pbSecretBasePC", "pbNewSecretBase", "pbInstallingBase",
  "getAllCushions", "getAllDolls", "getAllMats", "getAllOrnaments", "getAllPlants", "getAllPosters",
  "pbWonderTrade", "pbSave", "pbDeleteMove", "pbNumMoves", "pbFirstRaid", "pbIsWeekday?",
  "pbTalkToFollower", "pbToggleFollowingPokemon",
]) missingMethod(name);
missingMethod("Kernel.pbTransferPlayer", "Kernel:Module");
// Pokemon methods from older versions (v20: steps_to_hatch, foreign?).
// (A "#name" entry is a method looked up on whatever receiver the event has.)
missingMethod("#eggsteps", "#<Pokemon>");
missingMethod("#isForeign?", "#<Pokemon>");
// v20's PokemonGlobalMetadata has no daycareEgg/daycareEggSteps (only old saves had them).
missingMethod("$PokemonGlobal.daycareEgg=", "#<PokemonGlobalMetadata>");
missingMethod("$PokemonGlobal.daycareEggSteps=", "#<PokemonGlobalMetadata>");
