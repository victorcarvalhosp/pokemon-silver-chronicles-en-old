// The editor screens the Debug menu opens (020_Debug/001_Editor screens/*,
// 020_Debug/002_Animation editor/*, 016_UI/023_UI_MysteryGift.rb). They aren't
// ported yet: their ports set these. Until then openEditorScreen says so in
// the message window instead of opening anything.

import { _INTL } from "../ui/messageConfig";
import { pbMessage } from "../ui/messages";

type Screen = () => Promise<void>;

export const EditorScreens: {
  /** pbMetadataScreen (001_Editor screens/001_EditorScreens.rb: global and player metadata) */
  pbMetadataScreen?: Screen;
  /** pbEditMetadata (001_Editor screens/001_EditorScreens.rb) */
  pbEditMetadata?: Screen;
  /** pbEditMapMetadata(map_id) */
  pbEditMapMetadata?: (mapId: number) => Promise<void>;
  /** pbMapMetadataScreen(map_id) */
  pbMapMetadataScreen?: (mapId: number) => Promise<void>;
  /** pbConnectionsEditor (002_EditorScreens_MapConnections.rb) */
  pbConnectionsEditor?: Screen;
  /** pbTilesetScreen (003_EditorScreens_TerrainTags.rb) */
  pbTilesetScreen?: Screen;
  /** pbEncountersEditor */
  pbEncountersEditor?: Screen;
  /** pbTrainerTypeEditor */
  pbTrainerTypeEditor?: Screen;
  /** pbTrainerTypeEditorNew(default_name) (asked by pbTrainerTypeCheck in Debug mode) */
  pbTrainerTypeEditorNew?: (defaultName: string) => Promise<void>;
  /** pbTrainerBattleEditor */
  pbTrainerBattleEditor?: Screen;
  /** pbItemEditor */
  pbItemEditor?: Screen;
  /** pbPokemonEditor */
  pbPokemonEditor?: Screen;
  /** pbRegionalDexEditorMain */
  pbRegionalDexEditorMain?: Screen;
  /** SpritePositioner / SpritePositionerScreen (004_EditorScreens_SpritePositioning.rb) */
  pbSpritePositioner?: Screen;
  /** pbAutoPositionAll */
  pbAutoPositionAll?: Screen;
  /** pbAnimationEditor (002_Animation editor) */
  pbAnimationEditor?: Screen;
  /** pbAnimationsOrganiser */
  pbAnimationsOrganiser?: Screen;
  /** pbCreateMysteryGift(type, item) (016_UI/023_UI_MysteryGift.rb:100; the Pokémon Debug menu's "Mystery Gift") */
  pbCreateMysteryGift?: (type: number, item: unknown) => Promise<void>;
  /** pbManageMysteryGifts (016_UI/023_UI_MysteryGift.rb) */
  pbManageMysteryGifts?: Screen;
} = {};

/** Runs EditorScreens[name] if its port has registered it, else says it isn't ported yet. */
export async function openEditorScreen<K extends keyof typeof EditorScreens>(
  name: K, ...args: Parameters<NonNullable<(typeof EditorScreens)[K]>>
): Promise<void> {
  const fn = EditorScreens[name] as ((...a: unknown[]) => Promise<void>) | undefined;
  if (fn) {
    await fn(...args);
    return;
  }
  await pbMessage(_INTL("{1} isn't ported to the browser yet.", name));
}
