// Overworld movement abilities: field moves / HMs, surfing and diving, the
// Bicycle, fishing, stairs and map autoscroll. Imported once at boot (through
// game/scripts/fieldMoves.ts), in the plugins' load order: the core
// (012_Overworld/004_Overworld_FieldMoves.rb, 005_Overworld_Fishing.rb), then
// Side Stairs Tiles, Pokemon Silver Chronicles Helpers (Whirlpool,
// CustomStairs), Marin's Enhanced Staircases, Following Pokemon EX
// (followingFieldMoves.ts), Fly Animation and the RSE Cable Car; registers
// the menus' FieldActions.

import "./SideStairs";
import "./EnhancedStaircases";
import "./FieldMoves";
import "./overworld";
import "./bicycle";
import "./DarknessSprite";
import "./Whirlpool";
import "./CustomStairs";
import "./followingFieldMoves";
import "./FlyAnimation";
import "./autoscroll";
import "./CableCar";
import { FieldActions } from "../../ui/menus/menuScreens";
import { PlayerHooks } from "../GamePlayer";
import type { Pokemon } from "../pokemon/Pokemon";
import { CanUseContext, checkBadge, HiddenMoveHandlers, pbBadgeFromSkill, pbCanUseHiddenMove, pbCanUseHiddenMoveSync,
  pbCheckHiddenMoveBadge, pbConfirmUseHiddenMove, pbUseHiddenMove } from "./HiddenMoveHandlers";
import { FieldMoves, pbFlyToNewLocation } from "./FieldMoves";

// Game_Player#move_generic -> pbEndSurf (with Following Pokemon EX's alias)
PlayerHooks.endSurf = (xOffset, yOffset) => FieldMoves.pbEndSurf(xOffset, yOffset);

// The party screen, Ready Menu, pause menu and Town Map call these.
FieldActions.useHiddenMove = async (pkmn, move) => !!(await pbUseHiddenMove(pkmn as Pokemon, move));
FieldActions.canUseHiddenMove = (pkmn, move, showmsg) => pbCanUseHiddenMoveSync(pkmn as Pokemon, move, showmsg);
FieldActions.canUseHiddenMoveAsync = (pkmn, move, showmsg) => pbCanUseHiddenMove(pkmn as Pokemon, move, showmsg);
FieldActions.confirmUseHiddenMove = (pkmn, move) => pbConfirmUseHiddenMove(pkmn as Pokemon, move);
FieldActions.hasHiddenMoveHandler = (move) => HiddenMoveHandlers.hasHandler(move);
FieldActions.badgeFromSkill = (skill) => pbBadgeFromSkill(skill);
FieldActions.checkHiddenMoveBadge = (badge, showmsg) => checkBadge(badge, new CanUseContext(showmsg));
FieldActions.checkHiddenMoveBadgeAsync = (badge, showmsg) => pbCheckHiddenMoveBadge(badge, showmsg);
FieldActions.flyToNewLocation = () => pbFlyToNewLocation();
