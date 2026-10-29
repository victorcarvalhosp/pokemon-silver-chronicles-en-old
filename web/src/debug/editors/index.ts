// The Essentials editors (020_Debug/001_Editor screens/*, 020_Debug/002_Animation
// editor/*, 016_UI/023_UI_MysteryGift.rb's management screens) and the hooks
// the Debug menu calls them through. Each file registers its screens in
// EditorScreens (../editorScreens.ts) when imported; debug/index.ts imports
// this once.

import "./EditorScreens";
import "./AnimEditor_Functions";
import "./AnimationsOrganiser";
import "./TileDrawingHelper";
import "./TerrainTags";
import "./MapConnections";
import "./SpritePositioning";
import "../../ui/MysteryGift";
