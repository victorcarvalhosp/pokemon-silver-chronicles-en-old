// Names the game's events call that don't exist in the original game (v20.1
// and its plugins): left over from the older Essentials the game started on,
// or from plugins it doesn't have. In Ruby each raises when the script runs
// (NameError/NoMethodError), Interpreter#execute_script turns that into an
// EventScriptError and the game stops with the error box. NOTE (Ruby parity):
// they raise the same here, so the port stops where the original does. The
// events are listed in docs/original-game-bugs.md ("Event scripts"). The
// ones that were fixed on purpose (PBSpecies, old PBItems names, the Day Care,
// Name Rater and Move Deleter's v16 calls...) are edits to the event data.

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

// Online features from other games.
for (const name of ["GTS.open", "PVP.open", "OnlineLobby.open"]) missingConstant(name);
// Secret Bases, Wonder Trade, follower helpers...
for (const name of [
  "pbSecretBaseMart", "pbSecretBasePC", "pbNewSecretBase", "pbInstallingBase",
  "getAllCushions", "getAllDolls", "getAllMats", "getAllOrnaments", "getAllPlants", "getAllPosters",
  "pbWonderTrade", "pbSave", "pbFirstRaid", "pbIsWeekday?",
  "pbTalkToFollower", "pbToggleFollowingPokemon",
]) missingMethod(name);
missingMethod("Kernel.pbTransferPlayer", "Kernel:Module");
