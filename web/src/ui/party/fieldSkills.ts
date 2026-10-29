// Port of Improved Field Skills' party-screen parts ([001] Field Skills.rb:
// Pokemon#has_field_skill?, pbBadgeFromSkill and the "Skills" :party_menu
// option; [002] Party Skills.rb: the skills used from the party screen and
// pbGetEvolutionText). The plugin's pbUseKeyItem is in ui/menus/readyMenu.ts.
//
// Hidden move handlers (HiddenMoveHandlers, pbCanUseHiddenMove?,
// pbConfirmUseHiddenMove) are overworld code: they come from FieldActions
// (ui/menus/menuScreens.ts) when that port lands. Until then HM and misc.
// skills don't appear (no handler), as in Ruby for a move without one.

import type { Id } from "../../data/gameData/gameData";
import { Evolution } from "../../data/gameData/evolution";
import { GrowthRate } from "../../data/gameData/growthRate";
import { Item } from "../../data/gameData/item";
import { pbLoadTownMapData } from "../../data/gameData/miscPBSData";
import { Move as MoveData } from "../../data/gameData/move";
import { Settings } from "../../data/gameData/settings";
import { Species } from "../../data/gameData/species";
import { Type } from "../../data/gameData/type";
import { pbGetTimeNow } from "../../game/dayNight";
import { G } from "../../game/globals";
import { startsWithVowel } from "../../game/items/itemUtilities";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import type { Player } from "../../game/trainer/Player";
import { MenuHandlers } from "../menus/menuHandlers";
import { FieldActions, flyTemp, type HiddenMoveChoice, MenuFlags, MenuScreens } from "../menus/menuScreens";
import { _INTL } from "../messageConfig";
import { pbConfirmMessage, pbMessage } from "../messages";
import { pbItemRestoreHP } from "../bag/itemUtilities";
import type { PokemonPartyScreen } from "./party";

const player = () => G.player as unknown as Player;

/** Screens the skills open that are ported elsewhere. */
export const FieldSkillHooks: {
  /** pbRelearnMoveScreen(pkmn) (016_UI/021_UI_MoveRelearner.rb): true if a move was relearned. */
  relearnMoveScreen?: (pkmn: Pokemon) => Promise<boolean>;
} = {};

const hasHiddenMoveHandler = (move: Id) => FieldActions.hasHiddenMoveHandler?.(move) ?? false;
const canUseHiddenMove = (pkmn: Pokemon, move: Id, showmsg = true) => FieldActions.canUseHiddenMove?.(pkmn, move, showmsg) ?? false;

/** pbBadgeFromSkill(skill) */
export function pbBadgeFromSkill(skill: Id): number {
  switch (skill) {
    case "CUT": return Settings.BADGE_FOR_CUT;
    case "FLY": return Settings.BADGE_FOR_FLY;
    case "DIVE": return Settings.BADGE_FOR_DIVE;
    case "FLASH": return Settings.BADGE_FOR_FLASH;
    case "ROCKSMASH": return Settings.BADGE_FOR_ROCKSMASH;
    case "STRENGTH": return Settings.BADGE_FOR_STRENGTH;
    case "SURF": return Settings.BADGE_FOR_SURF;
    case "WATERFALL": return Settings.BADGE_FOR_WATERFALL;
    case "WHIRLPOOL": return Settings.BADGE_FOR_WHIRLPOOL;
    default: return -1;
  }
}

/** pbCheckHiddenMoveBadge(badge, showmsg) (012_Overworld/004_Overworld_FieldMoves.rb), unless the overworld port provides it. */
function pbCheckHiddenMoveBadge(badge = -1, showmsg = true): boolean {
  if (FieldActions.checkHiddenMoveBadge) return FieldActions.checkHiddenMoveBadge(badge, showmsg);
  if (badge < 0) return true; // No badge requirement
  if (MenuFlags.DEBUG) return true;
  // Settings::FIELD_MOVES_COUNT_BADGES is true
  if (player().badgeCount() >= badge) return true;
  if (showmsg) void pbMessage(_INTL("Sorry, a new Badge is required."));
  return false;
}

/** Pokemon#has_field_skill? */
export function hasFieldSkill(pkmn: Pokemon): boolean {
  if (pkmn.egg()) return false;
  // Checks for HM Skills.
  for (const skill of Settings.HM_SKILLS) {
    if (!MoveData.exists(skill)) continue;
    if (!hasHiddenMoveHandler(skill)) continue;
    if (Settings.HM_SKILLS_REQUIRE_BADGE) {
      const badge = pbBadgeFromSkill(skill);
      if (badge > 0 && !pbCheckHiddenMoveBadge(badge, false)) continue;
    }
    if (pkmn.speciesData().hasSkill(skill) || pkmn.hasMove(skill)) return true;
  }
  // Checks for Misc. Skills.
  for (const skill of Settings.MISC_SKILLS) {
    if (!MoveData.exists(skill)) continue;
    if (!hasHiddenMoveHandler(skill)) continue;
    if (Settings.MISC_SKILLS_REQUIRE_MOVE && !pkmn.hasMove(skill)) continue;
    if (pkmn.speciesData().hasSkill(skill) || pkmn.hasMove(skill)) return true;
  }
  // Checks for Heal Skills.
  for (const skill of Settings.HEAL_SKILLS) {
    if (!MoveData.exists(skill)) continue;
    if (Settings.HEAL_SKILLS_REQUIRE_MOVE && !pkmn.hasMove(skill)) continue;
    if (pkmn.speciesData().hasSkill(skill) || pkmn.hasMove(skill)) return true;
  }
  // Checks for other skills
  for (const skill of Settings.CUSTOM_SKILLS) {
    if (!MoveData.exists(skill)) continue;
    if (Settings.CUSTOM_SKILLS_REQUIRE_MOVE && !pkmn.hasMove(skill)) continue;
    if (pkmn.speciesData().hasSkill(skill) || pkmn.hasMove(skill)) return true;
  }
  return false;
}

//===============================================================================
// Field Skill menu handler.
//===============================================================================
MenuHandlers.add("party_menu", "field_skill", {
  name: "Skills",
  order: 21,
  condition: (_screen, party, partyIdx) => hasFieldSkill((party as Pokemon[])[partyIdx as number]!),
  effect: async (screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number): Promise<HiddenMoveChoice | null> => {
    let ret: HiddenMoveChoice | null = null;
    const pkmn = party[partyIdx]!;
    let command = 0;
    for (;;) {
      const skills: Id[] = [];
      const commands: (string | [string, number])[] = [];
      // Adds HM Skills.
      for (const skill of Settings.HM_SKILLS) {
        if (!MoveData.exists(skill)) continue;
        if (!hasHiddenMoveHandler(skill)) continue;
        if (!pkmn.speciesData().hasSkill(skill) && !pkmn.hasMove(skill)) continue;
        const badge = pbBadgeFromSkill(skill);
        if (Settings.HM_SKILLS_REQUIRE_BADGE && badge > 0 && !pbCheckHiddenMoveBadge(badge, false)) continue;
        const color = canUseHiddenMove(pkmn, skill, false) && pbCheckHiddenMoveBadge(badge, false) ? 1 : 4;
        commands.push([MoveData.get(skill).name, color]);
        skills.push(skill);
      }
      // Adds Misc. Skills.
      for (const skill of Settings.MISC_SKILLS) {
        if (!MoveData.exists(skill)) continue;
        if (!hasHiddenMoveHandler(skill)) continue;
        if (Settings.MISC_SKILLS_REQUIRE_MOVE) {
          if (!pkmn.hasMove(skill)) continue;
        } else if (!pkmn.speciesData().hasSkill(skill) && !pkmn.hasMove(skill)) {
          continue;
        }
        const color = canUseHiddenMove(pkmn, skill, false) ? 1 : 4;
        commands.push([MoveData.get(skill).name, color]);
        skills.push(skill);
      }
      // Adds Heal Skills.
      for (const skill of Settings.HEAL_SKILLS) {
        if (!MoveData.exists(skill)) continue;
        if (Settings.HEAL_SKILLS_REQUIRE_MOVE) {
          if (!pkmn.hasMove(skill)) continue;
        } else if (!pkmn.speciesData().hasSkill(skill) && !pkmn.hasMove(skill)) {
          continue;
        }
        const color = pkmn.hp >= Math.max(Math.floor(pkmn.totalhp / 5), 1) ? 1 : 4;
        commands.push([MoveData.get(skill).name, color]);
        skills.push(skill);
      }
      // Adds Other Skills.
      for (const skill of Settings.CUSTOM_SKILLS) {
        if (!MoveData.exists(skill)) continue;
        if (Settings.CUSTOM_SKILLS_REQUIRE_MOVE) {
          if (!pkmn.hasMove(skill)) continue;
        } else if (!pkmn.speciesData().hasSkill(skill) && !pkmn.hasMove(skill)) {
          continue;
        }
        let color = 1;
        for (const move of pkmn.moves) {
          if (move.id !== skill) continue;
          if (move.pp <= 0) color = 4;
        }
        commands.push([MoveData.get(skill).name, color]);
        skills.push(skill);
      }
      if (skills.length === 0) break;
      commands.push("Cancel");
      command = await screen.scene.pbShowCommands(_INTL("Do what with {1}?", pkmn.name), commands, command);
      if (command < 0 || command >= commands.length - 1) break;
      // `movename = commands[command]` is the [name, colour] pair in Ruby, so
      // messages using it show the pair as Array#to_s does (["Recover", 1]).
      const entry = commands[command]!;
      const movename = Array.isArray(entry) ? rubyArrayToS(entry) : entry;
      const skill = skills[command]!;
      if (Settings.CUSTOM_SKILLS.includes(skill)) { // Performs Custom Skill effects.
        let idxMove = 0;
        if (Settings.CUSTOM_SKILLS_REQUIRE_MOVE) {
          pkmn.moves.forEach((m, i) => { if (m.id === skill) idxMove = i; });
          if (pkmn.moves[idxMove]!.pp <= 0) {
            await screen.scene.pbDisplay(_INTL("Not enough PP..."));
            continue;
          }
        }
        let usedMove = 0;
        switch (skill) {
          case "RECOVER": usedMove = await pbRecoverPartySkill(pkmn, movename, screen, partyIdx); break;
          case "LIFEDEW": usedMove = await pbLifeDewPartySkill(pkmn, movename, screen, party, partyIdx); break;
          case "HEALBELL": case "AROMATHERAPY": usedMove = await pbStatusPartySkill(pkmn, movename, screen, party, partyIdx); break;
          case "INSTRUCT": usedMove = await pbInstructPartySkill(pkmn, movename, screen, party, partyIdx, idxMove); break;
          case "SKETCH": usedMove = await pbSketchPartySkill(pkmn, movename, screen, party, partyIdx); break;
          case "FUTURESIGHT": usedMove = await pbFutureSightPartySkill(pkmn, movename, screen, party, partyIdx, idxMove); break;
          default:
            await screen.scene.pbDisplay(_INTL("This move can't be used right now."));
            continue;
        }
        if (Settings.CUSTOM_SKILLS_REQUIRE_MOVE) {
          const move = pkmn.moves[idxMove]!;
          if (usedMove > 0 && move.id === skill) {
            const reduce = Math.min(usedMove, move.pp);
            move.pp -= reduce;
            const text = move.pp === 0 ? "ran out of PP..." : `had its PP reduced by ${reduce}!`;
            await screen.scene.pbDisplay(_INTL("{1}'s {2} {3}", pkmn.name, move.name, text));
          }
        }
      } else if (Settings.HEAL_SKILLS.includes(skill)) { // Performs Heal Skill effects.
        const amt = Math.max(Math.floor(pkmn.totalhp / 5), 1);
        if (pkmn.hp <= amt) {
          await screen.scene.pbDisplay(_INTL("Not enough HP..."));
          continue;
        } else {
          await pbHealPartySkill(pkmn, movename, screen, party, partyIdx);
        }
      } else { // Performs HM and miscellaneous field skill effects.
        if (FieldActions.canUseHiddenMoveAsync ? await FieldActions.canUseHiddenMoveAsync(pkmn, skill, true) : canUseHiddenMove(pkmn, skill)) {
          if (await FieldActions.confirmUseHiddenMove?.(pkmn, skill)) {
            await screen.scene.pbEndScene();
            if (skill === "FLY") {
              const flyRet = (await MenuScreens.flyMap?.()) ?? null;
              if (flyRet) {
                flyTemp().flyDestination = flyRet;
                ret = [pkmn, skill];
                break;
              }
              await screen.scene.pbStartScene(party, party.length > 1 ? _INTL("Choose a Pokémon.") : _INTL("Choose Pokémon or cancel."));
              break;
            }
            ret = [pkmn, skill];
          }
          if (ret) break;
        }
      }
    }
    return ret;
  },
});

/** Array#to_s for a [name, colour] command: Ruby 2+ inspects it, e.g. ["Recover", 1]. */
function rubyArrayToS(a: [string, number]): string {
  return `[${JSON.stringify(a[0])}, ${a[1]}]`;
}

//===============================================================================
// Code for party menu skills.
//===============================================================================
/** Healing Skill - Uses own HP to heal a party Pokemon's HP. */
export async function pbHealPartySkill(pkmn: Pokemon, movename: string, screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number): Promise<void> {
  const amt = Math.max(Math.floor(pkmn.totalhp / 5), 1);
  screen.scene.pbSetHelpText(_INTL("Use on which Pokémon?"));
  const oldPartyIdx = partyIdx;
  for (;;) {
    screen.scene.pbPreSelect(oldPartyIdx);
    partyIdx = await screen.scene.pbChoosePokemon(true, partyIdx);
    if (partyIdx < 0) break;
    const newpkmn = party[partyIdx]!;
    if (partyIdx === oldPartyIdx) {
      await screen.scene.pbDisplay(_INTL("{1} can't use {2} on itself!", pkmn.name, movename));
    } else if (newpkmn.egg()) {
      await screen.scene.pbDisplay(_INTL("{1} can't be used on an Egg!", movename));
    } else if (newpkmn.fainted() || newpkmn.hp === newpkmn.totalhp) {
      await screen.scene.pbDisplay(_INTL("{1} can't be used on that Pokémon.", movename));
    } else {
      pkmn.hp -= amt;
      const hpgain = pbItemRestoreHP(newpkmn, amt);
      await screen.scene.pbDisplay(_INTL("{1}'s HP was restored by {2} points.", newpkmn.name, hpgain));
      screen.scene.pbRefresh();
    }
    if (pkmn.hp <= amt) break;
  }
  screen.scene.pbSelect(oldPartyIdx);
  screen.scene.pbRefresh();
}

/** Recover Skill - Allows a Pokemon to recover its own HP. */
export async function pbRecoverPartySkill(pkmn: Pokemon, _movename: string, screen: PokemonPartyScreen, partyIdx: number): Promise<number> {
  let ret = 0;
  if (pkmn.hp === 0 || pkmn.hp === pkmn.totalhp) {
    await screen.scene.pbDisplay(_INTL("It won't have any effect."));
  } else {
    const amt = Math.max(Math.floor(pkmn.totalhp / 4), 1);
    const hpgain = pbItemRestoreHP(pkmn, amt);
    await screen.scene.pbDisplay(_INTL("{1}'s HP was restored by {2} points.", pkmn.name, hpgain));
    ret = 1;
  }
  screen.scene.pbSelect(partyIdx);
  screen.scene.pbRefresh();
  return ret;
}

/** Life Dew Skill - Allows a Pokemon to restore HP of the whole party at once. */
export async function pbLifeDewPartySkill(pkmn: Pokemon, _movename: string, screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number): Promise<number> {
  let ret = 0;
  if (pkmn.hp === 0) {
    await screen.scene.pbDisplay(_INTL("It won't have any effect."));
  } else {
    for (const p of party) {
      if (p.hp === 0 || p.hp === p.totalhp) continue;
      const amt = Math.max(Math.floor(p.totalhp / 4), 1);
      pbItemRestoreHP(p, amt);
      ret += 1;
    }
    if (ret === 0) await screen.scene.pbDisplay(_INTL("It won't have any effect."));
    else await screen.scene.pbDisplay(_INTL("{1} restored the party's HP!", pkmn.name));
  }
  screen.scene.pbSelect(partyIdx);
  screen.scene.pbRefresh();
  return ret;
}

/** Status Skill - Allows a Pokemon to heal the status of the entire party at once. */
export async function pbStatusPartySkill(pkmn: Pokemon, _movename: string, screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number): Promise<number> {
  let ret = 0;
  if (pkmn.hp === 0) {
    await screen.scene.pbDisplay(_INTL("It won't have any effect."));
  } else {
    for (const p of party) {
      if (p.status === "NONE") continue;
      p.healStatus();
      ret += 1;
    }
    if (ret === 0) await screen.scene.pbDisplay(_INTL("It won't have any effect."));
    else await screen.scene.pbDisplay(_INTL("{1} restored the party's condition!", pkmn.name));
  }
  screen.scene.pbSelect(partyIdx);
  screen.scene.pbRefresh();
  return ret;
}

/** Instruct Skill - Allows a party Pokemon to relearn a move from the party menu. */
export async function pbInstructPartySkill(pkmn: Pokemon, movename: string, screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number, idxMove: number): Promise<number> {
  let ret = 0;
  screen.scene.pbSetHelpText(_INTL("Use on which Pokémon?"));
  const oldPartyIdx = partyIdx;
  for (;;) {
    screen.scene.pbPreSelect(oldPartyIdx);
    partyIdx = await screen.scene.pbChoosePokemon(true, partyIdx);
    if (partyIdx < 0) break;
    const newpkmn = party[partyIdx]!;
    if (partyIdx === oldPartyIdx) {
      await screen.scene.pbDisplay(_INTL("{1} can't use {2} on itself!", pkmn.name, movename));
    } else if (newpkmn.egg()) {
      await screen.scene.pbDisplay(_INTL("{1} can't be used on an Egg!", movename));
    } else if (!newpkmn.canRelearnMove()) {
      await screen.scene.pbDisplay(_INTL("{1} has no moves to remember.", newpkmn.name));
    } else {
      if (FieldSkillHooks.relearnMoveScreen && (await FieldSkillHooks.relearnMoveScreen(newpkmn))) ret += 1;
      screen.scene.pbRefresh();
      if (Settings.CUSTOM_SKILLS_REQUIRE_MOVE && ret >= pkmn.moves[idxMove]!.pp) break;
    }
  }
  screen.scene.pbSelect(oldPartyIdx);
  screen.scene.pbRefresh();
  return ret;
}

/** Sketch Skill - Sketches a party Pokemon's move from the party menu. */
export async function pbSketchPartySkill(pkmn: Pokemon, movename: string, screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number): Promise<number> {
  screen.scene.pbSetHelpText(_INTL("Sketch from which Pokémon?"));
  const oldPartyIdx = partyIdx;
  for (;;) {
    screen.scene.pbPreSelect(oldPartyIdx);
    partyIdx = await screen.scene.pbChoosePokemon(true, partyIdx);
    if (partyIdx < 0) break;
    const newpkmn = party[partyIdx]!;
    if (partyIdx === oldPartyIdx) {
      await screen.scene.pbDisplay(_INTL("{1} can't use {2} on itself!", pkmn.name, movename));
    } else if (newpkmn.egg()) {
      await screen.scene.pbDisplay(_INTL("{1} can't be used on an Egg!", movename));
    } else {
      const newcommands: string[] = newpkmn.moves.map((move) => move.name);
      newcommands.push("Cancel");
      const choice = await screen.scene.pbShowCommands(_INTL("Sketch which of {1}'s moves?", newpkmn.name), newcommands);
      if (choice < newcommands.length - 1 && choice > -1) {
        const newmove = newpkmn.moves[choice]!;
        if (pkmn.hasMove(newmove.id)) {
          await screen.scene.pbDisplay(_INTL("{1} already knows {2}.", pkmn.name, newmove.name));
        } else if (newmove.type === "SHADOW") {
          await screen.scene.pbDisplay(_INTL("{1} can't be sketched.", newmove.name));
        // NOTE: Ruby calls screen.scene.pbConfirmMessage / pbMessage, which
        // PokemonParty_Scene doesn't have (NoMethodError); the global message
        // functions are used instead.
        } else if (await pbConfirmMessage(_INTL("Sketch {1}?", newmove.name), () => screen.pbUpdate())) {
          for (let i = 0; i <= pkmn.moves.length; i++) {
            if (pkmn.moves[i]?.id === "SKETCH") {
              pkmn.moves[i] = new PokemonMove(newmove.id);
              await pbMessage(_INTL("\\se[]{1} learned {2}!\\se[Pkmn move learnt]", pkmn.name, newmove.name), null, 0, null, 0, () => screen.pbUpdate());
              break;
            }
          }
          screen.scene.pbRefresh();
          break;
        } else {
          screen.scene.pbSetHelpText(_INTL("Sketch from which Pokémon?"));
        }
      } else {
        screen.scene.pbSetHelpText(_INTL("Sketch from which Pokémon?"));
      }
    }
  }
  screen.scene.pbSelect(oldPartyIdx);
  screen.scene.pbRefresh();
  return 0;
}

/** Future Sight Skill - Views the species of an Egg, or the upcoming evolution/move of a party member. */
export async function pbFutureSightPartySkill(pkmn: Pokemon, _movename: string, screen: PokemonPartyScreen, party: Pokemon[], partyIdx: number, idxMove: number): Promise<number> {
  let ret = 0;
  screen.scene.pbSetHelpText(_INTL("Use on which Pokémon?"));
  const oldPartyIdx = partyIdx;
  for (;;) {
    screen.scene.pbPreSelect(oldPartyIdx);
    partyIdx = await screen.scene.pbChoosePokemon(true, partyIdx);
    if (partyIdx < 0) break;
    const newpkmn = party[partyIdx]!;
    if (newpkmn.egg()) {
      // View Summary of Egg.
      const annotations: (string | null)[] = [null, null, null, null, null, null];
      annotations[partyIdx] = " ";
      screen.scene.pbAnnotate(annotations);
      const steps = newpkmn.stepsToHatch;
      newpkmn.name = newpkmn.speciesName();
      newpkmn.stepsToHatch = 0;
      newpkmn.hatchedMap = 0;
      newpkmn.timeEggHatched = pbGetTimeNow();
      await screen.scene.pbDisplay(_INTL("{1} caught a glimpse of this Egg's future...", pkmn.name));
      if (await screen.scene.pbSummary(partyIdx)) ret += 1;
      newpkmn.stepsToHatch = steps;
      newpkmn.hatchedMap = 0; // nil
      (newpkmn as unknown as { _timeEggHatched: number | null })._timeEggHatched = null; // timeEggHatched = nil
      newpkmn.name = "Egg";
      screen.scene.pbRefresh();
    } else {
      // Reveal evolution method of Pokemon.
      const selpkmn = pkmn === newpkmn ? "its own" : `${newpkmn.name}'s`;
      await screen.scene.pbDisplay(_INTL("{1} caught a glimpse of {2} future...", pkmn.name, selpkmn));
      const evos: ([Id, Id, number | string | null] | null)[] = newpkmn.speciesData().getEvolutions();
      evos.forEach((evo, i) => {
        if (!evo) return;
        const personal = ((pkmn.personalID >> 16) & 0xffff) % 10;
        switch (evo[1]) {
          case "None": case "Shedinja": evos[i] = null; break;
          case "Silcoon": if (personal >= 5) evos[i] = null; break;
          case "Cascoon": if (personal < 5) evos[i] = null; break;
          case "LevelMale": case "HappinessMale": case "HoldItemMale": case "ItemMale": case "TradeMale":
            if (!newpkmn.male()) evos[i] = null;
            break;
          case "LevelFemale": case "HappinessFemale": case "HoldItemFemale": case "ItemFemale": case "TradeFemale":
            if (!newpkmn.female()) evos[i] = null;
            break;
        }
      });
      const valid = evos.filter((e): e is [Id, Id, number | string | null] => !!e);
      const evoMsg = pbGetEvolutionText(valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)]! : null);
      if (evoMsg) {
        await screen.scene.pbDisplay(_INTL("{1} {2}", newpkmn.name, evoMsg));
        ret += 1;
      } else if (newpkmn.level < GrowthRate.maxLevel()) {
        // Reveal next level-up move of Pokemon.
        let nextMove: { level: number; move: Id } | null = null;
        for (const m of newpkmn.getMoveList()) {
          if (newpkmn.level > m.level) continue;
          if (newpkmn.hasMove(m.move)) continue;
          nextMove = m;
          break;
        }
        if (nextMove) {
          const nextMoveName = MoveData.get(nextMove.move).name;
          await screen.scene.pbDisplay(_INTL("{1} may learn {2} at level {3}.", newpkmn.name, nextMoveName, nextMove.level));
          ret += 1;
        } else {
          await screen.scene.pbDisplay(_INTL("{1}'s future is too vast to read.", newpkmn.name));
        }
      } else {
        await screen.scene.pbDisplay(_INTL("{1}'s future is too vast to read.", newpkmn.name));
      }
    }
    if (Settings.CUSTOM_SKILLS_REQUIRE_MOVE && ret >= pkmn.moves[idxMove]!.pp) break;
  }
  screen.scene.pbSelect(oldPartyIdx);
  screen.scene.pbRefresh();
  return ret;
}

/** pbGetEvolutionText(evo): what Future Sight says about an evolution [species, method, parameter]. */
export function pbGetEvolutionText(evo: [Id, Id, number | string | null] | null): string | null {
  if (!evo) return null;
  const method = evo[1];
  const param = evo[2];
  let name = "";
  let article = "";
  // A Symbol parameter (an ID); numbers are levels/counts.
  if (param != null && typeof param === "string") {
    switch (method) {
      case "HasMove": case "HappinessMove": name = MoveData.get(param).name; break;
      case "LevelUseMoveCount": name = MoveData.get(param).name; break;
      case "HasMoveType": case "HappinessMoveType": name = Type.get(param).name; break;
      case "HasInParty": case "TradeSpecies": name = Species.get(param).name; break;
      default: name = Item.get(param).name;
    }
    article = param === "LEFTOVERS" ? "some" : startsWithVowel(name) ? "an" : "a";
  }
  const evoData = Evolution.get(method);
  let text: string;
  if (evoData.eventProc) text = "may evolve when something special happens";
  else if (evoData.afterBattleProc) text = "may evolve after concluding a battle";
  else if (evoData.onTradeProc) text = "may evolve upon being traded";
  else if (evoData.useItemProc) text = `may evolve when exposed to ${article} ${name}`;
  else if (evoData.levelUpProc) {
    if (evoData.minimumLevel === 1) text = "may evolve upon leveling up";
    else text = `may evolve upon reaching level ${param ?? ""} or higher`;
  } else return null;
  switch (method) {
    case "LevelDay": case "ItemDay": case "TradeDay": text += " during the day."; break;
    case "LevelNight": case "ItemNight": case "TradeNight": text += " at nighttime."; break;
    case "LevelMorning": text += " in the morning."; break;
    case "LevelAfternoon": text += " in the afternoon."; break;
    case "LevelEvening": text += " during the evening."; break;
    case "LevelNoWeather": text += " while the weather is clear."; break;
    case "LevelSun": text += " while the sunlight is harsh."; break;
    case "LevelRain": text += " while its raining."; break;
    case "LevelSnow": text += " during a hailstorm."; break;
    case "LevelSandstorm": text += " during a sandstorm."; break;
    case "LevelCycling": text += " while traveling by bicycle."; break;
    case "LevelSurfing": text += " while traveling over water."; break;
    case "LevelDiving": text += " while traveling underwater."; break;
    case "LevelDarkness": text += " while traveling in darkness."; break;
    case "LevelDarkInParty": text += " while there's a Dark-type influence in the party."; break;
    case "AttackGreater": text += " while its Attack stat is higher than its Defense."; break;
    case "DefenseGreater": text += " while its Defense stat is higher than its Attack."; break;
    case "AtkDefEqual": text += " while its Attack and Defense stats are equal."; break;
    case "Ninjask": text += "...huh?\nIt looks like another Pokémon may emerge after it evolves..."; break;
    case "Location": case "LocationFlag": text += " while in a certain location."; break;
    // pbGetMessage(MessageTypes::RegionNames, param): the region names from the town map data.
    case "Region": text += ` while in the ${regionName(Number(param))} region.`; break;
    case "HasMove": text += ` while it knows the move ${name}.`; break;
    case "HasMoveType": text += ` while it knows ${article} ${name}-type move.`; break;
    case "HasInParty": text += ` while ${article} ${name} is in the party.`; break;
    case "TradeSpecies": text += ` for ${article} ${name}.`; break;
    case "DayHoldItem": text += ` while holding ${article} ${name} during the day.`; break;
    case "NightHoldItem": text += ` while holding ${article} ${name} at night.`; break;
    case "MaxHappiness": text += " while having total trust in its trainer."; break;
    case "HappinessDay": text += " while feeling happy during daytime hours."; break;
    case "HappinessNight": text += " while feeling happy during nighttime hours."; break;
    case "HappinessMove": text += ` while feeling happy and it knows the move ${name}.`; break;
    case "HappinessMoveType": text += ` while feeling happy and it knows ${article} ${name}-type move.`; break;
    case "HappinessHoldItem": case "HoldItemHappiness": text += ` while feeling happy and holding ${article} ${name}.`; break;
    case "Beauty": text += " while its feeling beautiful."; break;
    case "BattleDealCriticalHit": text += ` where it landed at least ${param ?? ""} critical hits.`; break;
    case "EventAfterDamageTaken": text += " after it took a certain amount of damage in battle."; break;
    case "HoldItem": case "TradeItem": case "HoldItemMale": case "HoldItemFemale": text += ` while holding ${article} ${name}.`; break;
    case "Happiness": case "ItemHappiness": case "HappinessMale": case "HappinessFemale": text += " while having great affection for its trainer."; break;
    // PLA & SV Evolution methods
    case "LevelWithPartner": text += " while you are partnered up with another trainer."; break;
    case "LevelUseMoveCount": text += ` after it has used the move ${name} 20 times.`; break;
    case "Walk": text += ` after walking ${param ?? ""} steps with it in the lead slot.`; break;
    case "CollectItems": text += ` after 999 ${name}s have been collected.`; break;
    case "LevelDefeatItsKindWithItem": text += ` after it has defeated 3 of its own species that held ${article} ${name}.`; break;
    case "LevelRecoilDamage": text += " after a certain amount of recoil damage has been taken while battling."; break;
    default: text += ".";
  }
  return text;
}

/** pbGetMessage(MessageTypes::RegionNames, region) */
function regionName(region: number): string {
  return pbLoadTownMapData()[region]?.name ?? "";
}
