// Port of Enhanced UI's Pokémon Debug option (Plugins/Enhanced UI/[001] Pokemon
// UI.rb:381): "Shiny Leaf" in Essentials Deluxe's "Deluxe Options..." submenu.
// Kept apart from DebugPokemonCommands.ts because Enhanced UI loads after ZUD,
// whose "Dynamax..." option (battle/zud/Debug.ts) comes first in that submenu.

import { MenuHandlers } from "../ui/menus/menuHandlers";
import { _INTL } from "../ui/messageConfig";
import { ChooseNumberParams, pbMessageChooseNumber } from "../ui/messages";
import { pokemonDebugOption } from "./DebugPokemonCommands";

MenuHandlers.add("pokemon_debug_menu", "set_shiny_leaf", pokemonDebugOption({
  name: "Shiny Leaf",
  parent: "dx_pokemon_menu",
  effect: async (pkmn, pkmnid, _heldpoke, _settingUpBattle, screen) => {
    let cmd = 0;
    for (;;) {
      const msg = [_INTL("Has shiny crown."), _INTL(`Has shiny leaf x${pkmn.shinyLeaf}.`)][pkmn.shinyCrown() ? 0 : 1]!;
      cmd = await screen.pbShowCommands(msg, [
        _INTL("Set leaf count"),
        _INTL("Set crown"),
        _INTL("Reset")], cmd);
      if (cmd < 0) break;
      switch (cmd) {
        case 0: { // Set Leaf
          const params = new ChooseNumberParams();
          params.setRange(0, 6);
          params.setDefaultValue(pkmn.shinyLeaf);
          const leafcount = await pbMessageChooseNumber(
            _INTL("Set {1}'s leaf count (max. 6).", pkmn.name), params, () => screen.pbUpdate());
          pkmn.shinyLeaf = leafcount;
          break;
        }
        case 1: // Set Crown
          pkmn.shinyLeaf = 6;
          break;
        case 2: // Reset
          pkmn.shinyLeaf = 0;
          break;
      }
      screen.pbRefreshSingle(pkmnid);
    }
    return false;
  },
}));
