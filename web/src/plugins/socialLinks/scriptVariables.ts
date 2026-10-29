// Port of Plugins/Social Links/005_Script Variables.rb: Game_Event#varValue?,
// a variable condition's value where variables named "s:<Ruby code>" are
// evaluated. NOTE (Ruby parity): the plugin needs 008_Game_Event.rb's
// variable-condition line edited to call it; this game's isn't
// (008_Game_Event.rb:188 still reads $game_variables), and no variable is
// named "s:...", so nothing calls this.

import { Data } from "../../data/store";
import { G } from "../../game/globals";
import { evaluate, type ScriptContext } from "../../game/scriptApi";

export function varValue(id: number, ctx: ScriptContext = { event: null, interpreter: null }): unknown {
  const varname = Data.system?.variables[String(id)];
  if (!varname) return 0;
  const m = /^s:/.exec(varname);
  if (m) return evaluate({ ruby: varname.slice(m[0].length) }, ctx);
  return G.gameVariables.get(id);
}
