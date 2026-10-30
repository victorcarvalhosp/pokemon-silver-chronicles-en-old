# Ruby script coverage

Which of `Data/Scripts/**/*.rb` (Pokémon Essentials v20.1, as this game ships
it) the TypeScript port covers, one row per file. `020_Debug` and
`021_Compiler` are tracked by the debug-menu work and left out; plugins
(`Plugins/`) are tracked by the plugin audit.

A file is **ported** when its classes and methods have TypeScript
equivalents (names camelCased, `?`/`!` dropped). **Browser equivalent** means
the Ruby is engine glue the browser does differently (files, Marshal, mkxp);
the note says what replaces it. **Partial** lists what's missing, with
Ruby file:line. Paths in "Where" are under `web/src/`.

Last checked 2026-10-29: 266 ported, 6 browser equivalents, 1 partial,
1 superseded by a plugin, 1 deferred (random dungeons). Unused helpers and
editor-only code that are skipped inside a "ported" file are listed in its
notes.

## What's left

| Ruby | Missing | Why it waits |
|---|---|---|
| `006_Map renderer/004_TileDrawingHelper.rb:1-196` | `TileDrawingHelper`, the minimap | Debug editors only |
| `012_Overworld/008_Overworld_RandomDungeons.rb` | Everything | Deferred by agreement |

Event scripts still written in Ruby (`{"cmd": "script", "ruby": …}`, see
`web/data/reports/conversion.json`) are the event-scripts work, not a Ruby
file of their own.

## Files

| Ruby file (`Data/Scripts/`) | Status | Where (`web/src/`) | Notes |
|---|---|---|---|
| 001_Settings.rb | ported | data/gameData/settings.ts | Constants sit in data/gameData/settings.ts or next to their users. `SCREEN_SCALE` (:397): the browser scales the canvas. |
| 001_Technical/001_Debugging/001_PBDebug.rb | ported | battle/other/PBDebug.ts | `flush` (:17): the log goes to the console. |
| 001_Technical/001_Debugging/002_DebugConsole.rb | ported | debug/DebugConsole.ts |  |
| 001_Technical/001_Debugging/003_Errors.rb | ported | debug/Errors.ts |  |
| 001_Technical/001_Debugging/004_Validation.rb | ported | debug/Validation.ts |  |
| 001_Technical/001_Debugging/005_Deprecation.rb | ported | debug/Deprecation.ts |  |
| 001_Technical/001_MKXP_Compatibility.rb | browser equivalent | rgss/Bitmap.ts, rgss/Graphics.ts, ui/options/options.ts | Bitmap text offsets, `Graphics.delta_s`; `pbSetResizeFactor` (:36) is a no-op (the page scales); `pbSetWindowText` (:8) not ported (the tab title is fixed). |
| 001_Technical/002_Files/001_FileTests.rb | ported (browser equivalent) | core/fileTests.ts, core/assets.ts, ui/rpgCache.ts, debug/devFiles.ts | Existence checks on the asset index, contents fetched, saves in IndexedDB. `Dir.create`/`all_dirs`/`delete_all` (:48-88) go through the dev server's file endpoint (`/__dev/mkdir`, `/__dev/list?dirs=1`, `/__dev/delete`, same web/data/ and PBS/ restriction as writes; tools/devFiles.ts), so only under `pnpm dev`. |
| 001_Technical/002_Files/002_FileMixins.rb | ported | core/fileTests.ts | On byte arrays (StringInput/StringOutput). |
| 001_Technical/002_Files/003_HTTP_Utilities.rb | ported | core/httpUtilities.ts | On fetch; the browser sets Host/User-Agent/Content-Length itself. |
| 001_Technical/002_RubyUtilities.rb | ported | core/rubyUtilities.ts (also itemUtilities.ts, PokemonMart.ts) | As functions. `Object#inspect`, `Class#to_sym` (:4-22) only serve Ruby's debugging. Ruby bug kept: `to_word` (:78) returns nil for 21. |
| 001_Technical/003_Intl_Messages.rb | ported | core/intl.ts | Messages files are JSON under web/data; `_INTL`, GameData names, map names, event text/choices and the Load screen's Language option go through it. Debug Extract/Compile Text use it. |
| 001_Technical/004_Input.rb | ported | rgss/Input.ts, game/utilities.ts | F8 screenshot hook in game/utilities.ts; `Mouse.getMousePos` (:29) is `Input.mouseX/mouseY`. |
| 001_Technical/005_PluginManager.rb | browser equivalent | — | Plugins are static imports in Ruby's load order; each `PluginManager.installed?` is resolved in place. No runtime registry/`readMeta`/`runPlugins`. |
| 001_Technical/006_RPG_Sprite.rb | ported | sprites/SpriteAnimation.ts | SpriteAnimation (once and looped), RPG::Sprite's animation lists, and RPG::Sprite itself (`RPGSprite`: `whiten`, `appear`, `escape`, `collapse`, `damage`, `blink_on`/`off`, counted in 40 fps frames). Unused by this game. Ruby bug kept: `loop_animation` reads `@_animation.name` (:70), so it always fails from RPG::Sprite. Not ported: `@@_animations` sharing of position-3 animations and the x=/y= cell moves (cells are placed again on each update). |
| 002_BattleSettings.rb | ported | data/gameData/settings.ts, game/encounters/settings.ts |  |
| 002_Save data/001_SaveData.rb | browser equivalent | game/save/SaveData.ts | Versioned JSON in IndexedDB, plus export/import. `get_data_from_file` (:24), `to_hash_format` (:73), `move_old_windows_save` (:86) don't apply. |
| 002_Save data/002_SaveData_Value.rb | ported (simplified) | game/save/SaveData.ts | No type validation (`validate_value` :107, `ensure_class` :117); `from_old_format` (:153) doesn't apply. |
| 002_Save data/003_SaveData_Conversion.rb | ported | game/save/SaveConversions.ts, game/save/SaveData.ts | Conversions run on the save's JSON before loading; the port's own layout changes use `__format`. |
| 002_Save data/004_Game_SaveValues.rb | ported | game/save/values.ts, game/save/modelValues.ts |  |
| 002_Save data/005_Game_SaveConversions.rb | ported | game/save/SaveConversions.ts | All 11 v20 conversions, on JSON values. Ruby bugs kept: an empty old Day Care slot becomes a Lv.50 Manaphy and one old Pokémon fills every empty slot (:176-183); `@lastPocket` cleared instead of `@lastpocket` (:221). |
| 003_Game processing/001_StartGame.rb | ported | game/Game.ts, game/newGame.ts, game/save/values.ts | Magic-number check in `load_map` ported (data has no magic number, so it always matches). The DEBUG missing-map recovery (:84-92) is `pbRecoverMissingMap` (pbWarpToMap; a load with no map chosen is abandoned instead of `exit`); it applies to every load, as the port's saves don't hold the maps. |
| 003_Game processing/002_Scene_Map.rb | ported | scenes/SceneMap.ts | Night BGM (`_n`) in `autofade` ported; `createSingleSpriteset` (:29) is unused in Ruby. |
| 003_Game processing/003_Interpreter.rb | ported | game/Interpreter.ts, game/scriptApi.ts | Script commands run translated statements or hand-written `defineRubyScript` ports; untranslated Ruby is the event-scripts work (see data/reports/conversion.json). `pbShowPicture` (:299) not ported (no data uses it). |
| 003_Game processing/004_Interpreter_Commands.rb | ported (pre-compiled) | game/Interpreter.ts | Codes are converted to named commands (web/tools/convert); 303 Name Input isn't converted (no data uses it). |
| 003_Game processing/005_Event_Handlers.rb | ported | game/eventHandlers.ts, game/items/ItemHandlers.ts, ui/menus/menuHandlers.ts |  |
| 003_Game processing/006_Event_HandlerCollections.rb | ported | game/eventHandlers.ts, ui/menus/menuHandlers.ts |  |
| 004_Game classes/001_Game_Screen.rb | ported | game/GameScreen.ts, game/scripts/overworld.ts, game/field/stepHandlers.ts |  |
| 004_Game classes/001_Switches and Variables/001_Game_Temp.rb | ported | game/globals.ts | `battle_abort`, `menu_last_choice` not used by the port's menus. |
| 004_Game classes/001_Switches and Variables/002_Game_Switches.rb | ported | game/globals.ts | Script switches ("s:") in game/GameEvent.ts. |
| 004_Game classes/001_Switches and Variables/003_Game_Variables.rb | ported | game/globals.ts |  |
| 004_Game classes/001_Switches and Variables/004_Game_SelfSwitches.rb | ported | game/globals.ts |  |
| 004_Game classes/002_Game_System.rb | ported | game/GameSystem.ts | `setDefaultBGM`/`@defaultBGM` ported (Jukebox). The SPECIAL-key cut-scene skip in `update` (:268) ported (no map has a "Cut Scene" comment). |
| 004_Game classes/003_Game_Picture.rb | ported | game/GameScreen.ts |  |
| 004_Game classes/004_Game_Map.rb | ported | game/GameMap.ts | `bgm_name` night variant and `erase_tile` ported. |
| 004_Game classes/005_Game_Map_Autoscroll.rb | ported | game/field/autoscroll.ts, game/GameMap.ts |  |
| 004_Game classes/006_Game_MapFactory.rb | ported | game/MapFactory.ts | Unused helpers not ported: `isPassableStrict?` (:188), `getThisAndOtherPosRelativePos` (:254), `getOffsetEventPos` (:261), `hasConnections?` (:430), `eachConnectionForMap` (:442), `getMapEdge` (:467), `updateTilesets` (:501). |
| 004_Game classes/007_Game_Character.rb | ported | game/GameCharacter.ts | `move_random_UD`/`move_random_LR` (:671-675) unused. |
| 004_Game classes/008_Game_Event.rb | ported | game/GameEvent.ts | `varAsInt` (:97) unused. Runtime-added events can be saved with their data (`savedWithData`). |
| 004_Game classes/009_Game_Player.rb | ported | game/GamePlayer.ts, game/field/bicycle.ts, game/battle/startOver.ts |  |
| 004_Game classes/010_Game_CommonEvent.rb | ported | game/GameEvent.ts |  |
| 004_Game classes/011_Game_Follower.rb | ported | game/following/GameFollower.ts |  |
| 004_Game classes/012_Game_FollowerFactory.rb | ported | game/following/GameFollowerFactory.ts, game/following/Followers.ts, game/following/FollowerSprites.ts |  |
| 004_Game classes/013_Game_Stats.rb | ported | game/trainer/GameStats.ts, game/Game.ts |  |
| 005_Sprites/001_Sprite_Picture.rb | ported | sprites/spritesets.ts |  |
| 005_Sprites/002_Sprite_Timer.rb | ported | sprites/SpriteTimer.ts |  |
| 005_Sprites/003_Sprite_Character.rb | ported | sprites/SpriteCharacter.ts |  |
| 005_Sprites/004_Sprite_Reflection.rb | ported | sprites/SpriteReflection.ts |  |
| 005_Sprites/005_Sprite_SurfBase.rb | ported | game/field/SpriteSurfBase.ts |  |
| 005_Sprites/006_Spriteset_Global.rb | ported | sprites/spritesets.ts |  |
| 005_Sprites/007_Spriteset_Map.rb | ported | sprites/spritesets.ts |  |
| 005_Sprites/008_Sprite_AnimationSprite.rb | ported | sprites/AnimationSprite.ts, sprites/spritesets.ts |  |
| 005_Sprites/009_Sprite_DynamicShadows.rb | ported | sprites/SpriteDynamicShadows.ts, sprites/spritesets.ts, sprites/SpriteCharacter.ts |  |
| 005_Sprites/010_ParticleEngine.rb | ported | sprites/ParticleEngine.ts |  |
| 005_Sprites/011_PictureEx.rb | ported | ui/scenes/PictureEx.ts |  |
| 005_Sprites/012_Interpolators.rb | ported | ui/scenes/Interpolators.ts |  |
| 005_Sprites/013_ScreenPosHelper.rb | ported | sprites/ScreenPosHelper.ts |  |
| 006_Map renderer/001_TilemapRenderer.rb | ported | map/TilemapRenderer.ts | Restructured for PixiJS; `tone` (pbDayNightTint) tones the tile graphics. `EXTRA_AUTOTILES` (:343) is empty in Ruby. |
| 006_Map renderer/002_TilesetWrapper.rb | browser equivalent | core/assets.ts, map/TilemapRenderer.ts | 4096px image strips. |
| 006_Map renderer/003_AutotileExpander.rb | ported | map/autotiles.ts |  |
| 006_Map renderer/004_TileDrawingHelper.rb | partial | map/autotiles.ts | Autotile pattern tables ported. Not ported (debug minimap/editors only): `TileDrawingHelper` (:1-147), `createMinimap` (:149), `bltMinimapAutotile` (:174), `getPassabilityMinimap` (:196). |
| 007_Objects and windows/001_RPG_Cache.rb | browser equivalent | ui/rpgCache.ts, sprites/cache.ts | Texture caches instead of refcounted bitmaps. |
| 007_Objects and windows/002_MessageConfig.rb | ported | ui/messageConfig.ts, ui/fades.ts, ui/planes.ts |  |
| 007_Objects and windows/003_Window.rb | ported | ui/windows/SpriteWindow.ts | Folded into SpriteWindow. |
| 007_Objects and windows/004_SpriteWindow.rb | ported | ui/windows/SpriteWindow.ts |  |
| 007_Objects and windows/005_SpriteWindow_text.rb | ported | ui/windows/SpriteWindowText.ts |  |
| 007_Objects and windows/006_SpriteWindow_pictures.rb | ported | ui/windows/SpriteWindowPictures.ts |  |
| 007_Objects and windows/007_SpriteWrapper.rb | ported | ui/SpriteWrapper.ts, ui/party/ChangelingSprite.ts |  |
| 007_Objects and windows/008_AnimatedBitmap.rb | ported | ui/AnimatedBitmap.ts |  |
| 007_Objects and windows/009_Planes.rb | ported | ui/planes.ts |  |
| 007_Objects and windows/010_DrawText.rb | ported | ui/drawText.ts | `drawTextTable` (:1064), `pbDrawShadow` (:1095) unused. |
| 007_Objects and windows/011_Messages.rb | ported | ui/messages.ts, ui/planes.ts | Not ported: `pbCurrentEventCommentInput` (:45, only the cut-scene skip uses it), `pbGetBasicMapNameFromId` (:252, inlined). |
| 007_Objects and windows/012_TextEntry.rb | ported | ui/textEntry/TextEntry.ts | `Window_MultilineTextEntry` (:261) ported too (no game code uses it). |
| 008_Audio/001_Audio.rb | browser equivalent | rgss/Audio.ts, battle/scene/sceneFiles.ts |  |
| 008_Audio/002_Audio_Play.rb | ported | game/GameSystem.ts, ui/messages.ts |  |
| 009_Scenes/001_Transitions.rb | ported | game/battle/transitions.ts, rgss/Graphics.ts |  |
| 009_Scenes/002_EventScene.rb | ported | ui/scenes/EventScene.ts, game/scripts/scenes.ts |  |
| 010_Data/001_GameData.rb | ported | data/gameData/gameData.ts, debug/editors/EditorData.ts |  |
| 010_Data/001_Hardcoded data/001_GrowthRate.rb | ported | data/gameData/growthRate.ts |  |
| 010_Data/001_Hardcoded data/002_GenderRatio.rb | ported | data/gameData/genderRatio.ts |  |
| 010_Data/001_Hardcoded data/003_EggGroup.rb | ported | data/gameData/eggGroup.ts |  |
| 010_Data/001_Hardcoded data/004_BodyShape.rb | ported | data/gameData/bodyShape.ts |  |
| 010_Data/001_Hardcoded data/005_BodyColor.rb | ported | data/gameData/bodyColor.ts |  |
| 010_Data/001_Hardcoded data/006_Habitat.rb | ported | data/gameData/habitat.ts |  |
| 010_Data/001_Hardcoded data/007_Evolution.rb | ported | data/gameData/evolution.ts |  |
| 010_Data/001_Hardcoded data/008_Stat.rb | ported | data/gameData/stat.ts |  |
| 010_Data/001_Hardcoded data/009_Nature.rb | ported | data/gameData/nature.ts |  |
| 010_Data/001_Hardcoded data/010_Status.rb | ported | data/gameData/status.ts |  |
| 010_Data/001_Hardcoded data/011_TerrainTag.rb | ported | data/gameData/terrainTag.ts, game/encounters/visibleEncounters.ts |  |
| 010_Data/001_Hardcoded data/012_Weather.rb | ported | data/gameData/weather.ts |  |
| 010_Data/001_Hardcoded data/013_EncounterType.rb | ported | data/gameData/encounterType.ts |  |
| 010_Data/001_Hardcoded data/014_Environment.rb | ported | data/gameData/environment.ts |  |
| 010_Data/001_Hardcoded data/015_BattleWeather.rb | ported | data/gameData/battleWeather.ts |  |
| 010_Data/001_Hardcoded data/016_BattleTerrain.rb | ported | data/gameData/battleTerrain.ts |  |
| 010_Data/001_Hardcoded data/017_Target.rb | ported | data/gameData/target.ts |  |
| 010_Data/002_PBS data/001_MiscPBSData.rb | ported | data/gameData/miscPBSData.ts, battle/scene/animationPlayer.ts |  |
| 010_Data/002_PBS data/002_PhoneDatabase.rb | ported | data/gameData/miscPBSData.ts |  |
| 010_Data/002_PBS data/003_Type.rb | ported | data/gameData/type.ts |  |
| 010_Data/002_PBS data/004_Ability.rb | ported | data/gameData/ability.ts |  |
| 010_Data/002_PBS data/005_Move.rb | ported | data/gameData/move.ts, compiler/WritePBS.ts |  |
| 010_Data/002_PBS data/006_Item.rb | ported | data/gameData/item.ts, compiler/WritePBS.ts |  |
| 010_Data/002_PBS data/007_BerryPlant.rb | ported | data/gameData/berryPlant.ts |  |
| 010_Data/002_PBS data/008_Species.rb | ported | data/gameData/species.ts |  |
| 010_Data/002_PBS data/009_Species_Files.rb | ported | battle/scene/sceneFiles.ts, data/gameData/species.ts, ui/sprites/pokemonIcon.ts |  |
| 010_Data/002_PBS data/010_SpeciesMetrics.rb | ported | data/gameData/speciesMetrics.ts |  |
| 010_Data/002_PBS data/011_ShadowPokemon.rb | ported | data/gameData/shadowPokemon.ts |  |
| 010_Data/002_PBS data/012_Ribbon.rb | ported | data/gameData/ribbon.ts |  |
| 010_Data/002_PBS data/013_Encounter.rb | ported | data/gameData/encounter.ts |  |
| 010_Data/002_PBS data/014_TrainerType.rb | ported | data/gameData/trainerType.ts, compiler/WritePBS.ts |  |
| 010_Data/002_PBS data/015_Trainer.rb | ported | data/gameData/trainer.ts |  |
| 010_Data/002_PBS data/016_Metadata.rb | ported | data/gameData/metadata.ts | `editor_properties` is the debug editors' (other agent). |
| 010_Data/002_PBS data/017_PlayerMetadata.rb | ported | data/gameData/playerMetadata.ts | `editor_properties`: debug editors. |
| 010_Data/002_PBS data/018_MapMetadata.rb | ported | data/gameData/mapMetadata.ts | `editor_properties`: debug editors. |
| 011_Battle/001_Battle/001_Battle.rb | ported | battle/battle/Battle.ts |  |
| 011_Battle/001_Battle/002_Battle_StartAndEnd.rb | ported | battle/battle/Battle_StartAndEnd.ts, battle/other/Clauses.ts |  |
| 011_Battle/001_Battle/003_Battle_ExpAndMoveLearning.rb | ported | battle/battle/Battle_ExpAndMoveLearning.ts, battle/audio.ts |  |
| 011_Battle/001_Battle/004_Battle_ActionAttacksPriority.rb | ported | battle/battle/Battle_ActionAttacksPriority.ts, battle/battle/Battle_CommandPhase.ts |  |
| 011_Battle/001_Battle/005_Battle_ActionSwitching.rb | ported | battle/battle/Battle_ActionSwitching.ts |  |
| 011_Battle/001_Battle/006_Battle_ActionUseItem.rb | ported | battle/battle/Battle_ActionUseItem.ts |  |
| 011_Battle/001_Battle/007_Battle_ActionRunning.rb | ported | battle/battle/Battle_ActionRunning.ts, battle/audio.ts |  |
| 011_Battle/001_Battle/008_Battle_ActionOther.rb | ported | battle/battle/Battle_ActionOther.ts |  |
| 011_Battle/001_Battle/009_Battle_CommandPhase.rb | ported | battle/battle/Battle_CommandPhase.ts |  |
| 011_Battle/001_Battle/010_Battle_AttackPhase.rb | ported | battle/battle/Battle_AttackPhase.ts, battle/battle/Battle_ActionSwitching.ts |  |
| 011_Battle/001_Battle/011_Battle_EndOfRoundPhase.rb | ported | battle/battle/Battle_EndOfRoundPhase.ts |  |
| 011_Battle/002_Battler/001_Battle_Battler.rb | ported | battle/battler/Battler.ts, debug/DebugBattlePkmnCommands.ts |  |
| 011_Battle/002_Battler/002_Battler_Initialize.rb | ported | battle/battler/Battler_Initialize.ts, battle/battler/Battler.ts |  |
| 011_Battle/002_Battler/003_Battler_ChangeSelf.rb | ported | battle/battler/Battler_ChangeSelf.ts |  |
| 011_Battle/002_Battler/004_Battler_Statuses.rb | ported | battle/battler/Battler_Statuses.ts |  |
| 011_Battle/002_Battler/005_Battler_StatStages.rb | ported | battle/battler/Battler_StatStages.ts |  |
| 011_Battle/002_Battler/006_Battler_AbilityAndItem.rb | ported | battle/battler/Battler_AbilityAndItem.ts |  |
| 011_Battle/002_Battler/007_Battler_UseMove.rb | ported | battle/battler/Battler_UseMove.ts |  |
| 011_Battle/002_Battler/008_Battler_UseMoveTargeting.rb | ported | battle/battler/Battler_UseMoveTargeting.ts |  |
| 011_Battle/002_Battler/009_Battler_UseMoveSuccessChecks.rb | ported | battle/battler/Battler_UseMoveSuccessChecks.ts |  |
| 011_Battle/002_Battler/010_Battler_UseMoveTriggerEffects.rb | ported | battle/battler/Battler_UseMoveTriggerEffects.ts |  |
| 011_Battle/003_Move/001_Battle_Move.rb | ported | battle/move/Move.ts |  |
| 011_Battle/003_Move/002_Move_Usage.rb | ported | battle/move/Move_Usage.ts |  |
| 011_Battle/003_Move/003_Move_UsageCalculations.rb | ported | battle/move/Move_UsageCalculations.ts |  |
| 011_Battle/003_Move/004_Move_BaseEffects.rb | ported | battle/move/Move_BaseEffects.ts |  |
| 011_Battle/003_Move/005_MoveEffects_Misc.rb | ported | battle/move/MoveEffects_Misc.ts, battle/move/Move.ts |  |
| 011_Battle/003_Move/006_MoveEffects_BattlerStats.rb | ported | battle/move/MoveEffects_BattlerStats.ts |  |
| 011_Battle/003_Move/007_MoveEffects_BattlerOther.rb | ported | battle/move/MoveEffects_BattlerOther.ts |  |
| 011_Battle/003_Move/008_MoveEffects_MoveAttributes.rb | ported | battle/move/MoveEffects_MoveAttributes.ts | `pbCalcAccuracyMultipliers` (:1279) is misnamed and never called in Ruby. |
| 011_Battle/003_Move/009_MoveEffects_MultiHit.rb | ported | battle/move/MoveEffects_MultiHit.ts |  |
| 011_Battle/003_Move/010_MoveEffects_Healing.rb | ported | battle/move/MoveEffects_Healing.ts |  |
| 011_Battle/003_Move/011_MoveEffects_Items.rb | ported | battle/move/MoveEffects_Items.ts |  |
| 011_Battle/003_Move/012_MoveEffects_ChangeMoveEffect.rb | ported | battle/move/MoveEffects_ChangeMoveEffect.ts |  |
| 011_Battle/003_Move/013_MoveEffects_SwitchingActing.rb | ported | battle/move/MoveEffects_SwitchingActing.ts |  |
| 011_Battle/004_Scene/001_Battle_Scene.rb | ported | battle/scene/BattleScene.ts, battle/BattleSceneInterface.ts |  |
| 011_Battle/004_Scene/002_Scene_Initialize.rb | ported | battle/scene/BattleScene.ts |  |
| 011_Battle/004_Scene/003_Scene_ChooseCommands.rb | ported | battle/scene/BattleScene.ts, battle/BattleSceneInterface.ts |  |
| 011_Battle/004_Scene/004_Scene_PlayAnimations.rb | ported | battle/scene/BattleScene.ts, battle/BattleSceneInterface.ts |  |
| 011_Battle/004_Scene/005_Battle_Scene_Menus.rb | ported | battle/scene/menus.ts |  |
| 011_Battle/004_Scene/006_Battle_Scene_Objects.rb | ported | battle/scene/objects.ts |  |
| 011_Battle/004_Scene/007_Battle_Scene_BaseAnimation.rb | ported | battle/scene/animationBase.ts |  |
| 011_Battle/004_Scene/008_Battle_Scene_Animations.rb | ported | battle/scene/animations.ts |  |
| 011_Battle/004_Scene/009_Battle_DebugScene.rb | ported | battle/DebugScene.ts |  |
| 011_Battle/005_AI/001_Battle_AI.rb | ported | battle/ai/Battle_AI.ts |  |
| 011_Battle/005_AI/002_AI_Item.rb | ported | battle/ai/AI_Item.ts |  |
| 011_Battle/005_AI/003_AI_Switch.rb | ported | battle/ai/AI_Switch.ts |  |
| 011_Battle/005_AI/004_AI_Move.rb | ported | battle/ai/AI_Move.ts |  |
| 011_Battle/005_AI/005_AI_Move_EffectScores_1.rb | ported | battle/ai/AI_Move_EffectScores_1.ts |  |
| 011_Battle/005_AI/006_AI_Move_EffectScores_2.rb | ported | battle/ai/AI_Move_EffectScores_2.ts |  |
| 011_Battle/005_AI/007_AI_Move_EffectScores_3.rb | ported | battle/ai/AI_Move_EffectScores_3.ts |  |
| 011_Battle/005_AI/008_AI_Move_Utilities.rb | ported | battle/ai/AI_Move_Utilities.ts | Core `pbRoughDamage` (:297-578) is replaced by the Gen 9 Pack's, as in the game. |
| 011_Battle/006_Other battle code/001_PBEffects.rb | ported | battle/other/PBEffects.ts |  |
| 011_Battle/006_Other battle code/002_Battle_ActiveField.rb | ported | battle/other/ActiveField.ts |  |
| 011_Battle/006_Other battle code/003_Battle_DamageState.rb | ported | battle/other/DamageState.ts |  |
| 011_Battle/006_Other battle code/004_Battle_Peers.rb | ported | battle/other/Peers.ts |  |
| 011_Battle/006_Other battle code/005_Battle_CatchAndStoreMixin.rb | ported | battle/other/CatchAndStoreMixin.ts |  |
| 011_Battle/006_Other battle code/006_Battle_Clauses.rb | ported | battle/other/Clauses.ts, battle/battle/Battle_EndOfRoundPhase.ts |  |
| 011_Battle/006_Other battle code/007_BattleAnimationPlayer.rb | ported (runtime) | battle/scene/animationPlayer.ts | Editor-only helpers belong to the animation editor (debug agent): `pbCreateCel` :77, `pbResetCel` :88, `pbConvertRPGAnimation` :115, `RPG::Animation` helpers :175-192, `PBAnimations#delete_at/resize` :384-388, `PBAnimation#delete_at/addFrame` :455-469. |
| 011_Battle/006_Other battle code/008_Battle_AbilityEffects.rb | ported | battle/other/AbilityEffects.ts, battle/index.ts, battle/abilities/index.ts |  |
| 011_Battle/006_Other battle code/009_Battle_ItemEffects.rb | ported | battle/other/ItemEffects.ts, battle/items/Battle_ItemEffects.ts, battle/index.ts |  |
| 011_Battle/006_Other battle code/010_Battle_PokeBallEffects.rb | ported | battle/other/PokeBallEffects.ts |  |
| 011_Battle/007_Other battle types/001_SafariBattle.rb | ported | game/battle/safari.ts |  |
| 011_Battle/007_Other battle types/002_BugContestBattle.rb | ported | game/battle/bugContest.ts |  |
| 011_Battle/007_Other battle types/003_BattlePalaceBattle.rb | ported | game/battle/battlePalace.ts |  |
| 011_Battle/007_Other battle types/004_BattleArenaBattle.rb | ported | game/battle/battleArena.ts, battle/battler/Battler_UseMove.ts, battle/battle/Battle_StartAndEnd.ts |  |
| 011_Battle/007_Other battle types/005_RecordedBattle.rb | ported | game/battle/recordedBattle.ts |  |
| 012_Overworld/001_Overworld visuals/001_Overworld_Weather.rb | ported | game/weather/Weather.ts |  |
| 012_Overworld/001_Overworld visuals/002_Overworld_Overlays.rb | ported | game/weather/Overlays.ts, game/field/DarknessSprite.ts |  |
| 012_Overworld/001_Overworld visuals/003_Overworld_MapTransitionAnims.rb | ported | game/field/overworld.ts, game/battle/startOver.ts, game/scripts/fieldMoves.ts |  |
| 012_Overworld/001_Overworld.rb | ported | game/field/stepHandlers.ts, game/field/overworld.ts, game/GamePlayer.ts, game/mapAudio.ts | The Pokérus counter, low battery (Battery Status API), walking happiness, field poison + `pbCheckAllFainted`, soot, grass rustle, `pbPokerus?`, `pbFacingTileRegular` are in field/stepHandlers.ts. Ruby bug kept: `pokerusTime` is never set, so Pokérus never counts down (:5-16). |
| 012_Overworld/002_Battle triggering/001_Overworld_BattleStarting.rb | ported | game/battle/BattleStarting.ts, game/battle/scripts.ts | All deprecated v21 wrappers (:748-842) are event scripts with their deprecation warnings. |
| 012_Overworld/002_Battle triggering/002_Overworld_BattleIntroAnim.rb | ported | game/battle/BattleIntroAnim.ts |  |
| 012_Overworld/002_Battle triggering/003_Overworld_WildEncounters.rb | ported | game/encounters/PokemonEncounters.ts |  |
| 012_Overworld/002_Battle triggering/004_Overworld_EncounterModifiers.rb | ported | game/encounters/PokemonEncounters.ts |  |
| 012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb | ported | game/battle/roaming.ts, debug/DebugMenuExtraCode.ts, game/encounters/visibleEncounters.ts |  |
| 012_Overworld/002_Overworld_Metadata.rb | ported | game/PokemonMapMetadata.ts, game/field/stepHandlers.ts, debug/DebugMenuCommands.ts |  |
| 012_Overworld/003_Overworld_Time.rb | ported | game/dayNight.ts, game/pokemon/formHandlers.ts (pbGetSeason), ui/summary/summary.ts, ui/trainerCard/trainerCard.ts | Moon phase, zodiac, months, seasons ported. Ruby bug kept: `moonphase` counts hours as minutes (:151). |
| 012_Overworld/004_Overworld_FieldMoves.rb | ported | game/field/FieldMoves.ts, game/GamePlayer.ts, game/field/index.ts |  |
| 012_Overworld/005_Overworld_Fishing.rb | ported | game/field/Fishing.ts, game/field/index.ts |  |
| 012_Overworld/006_Overworld_BerryPlants.rb | ported | game/berries/BerryPlants.ts, game/scripts/lifecycle.ts |  |
| 012_Overworld/007_Overworld_DayCare.rb | ported | game/daycare/DayCare.ts, game/scripts/lifecycle.ts |  |
| 012_Overworld/008_Overworld_RandomDungeons.rb | deferred | — | Agreed: random dungeons come later. |
| 013_Items/001_Item_Utilities.rb | ported | ui/bag/itemUtilities.ts, game/items/itemUtilities.ts, battle/ai/AI_Item.ts |  |
| 013_Items/002_Item_Effects.rb | ported | game/items/Item_Effects.ts, battle/items/index.ts, ui/bag/itemUtilities.ts |  |
| 013_Items/003_Item_BattleEffects.rb | ported | battle/items/Item_BattleEffects.ts, battle/items/index.ts, game/items/ItemHandlers.ts |  |
| 013_Items/004_Item_Phone.rb | ported | ui/pokegear/phone.ts, game/scripts/phone.ts, game/trainers/phoneRematch.ts |  |
| 013_Items/005_Item_PokeRadar.rb | ported | game/battle/pokeRadar.ts, game/field/bicycle.ts, game/encounters/PokemonEncounters.ts |  |
| 013_Items/006_Item_Mail.rb | ported | ui/party/mail.ts, game/pokemon/Mail.ts |  |
| 013_Items/007_Item_Sprites.rb | ported | ui/sprites/itemIcon.ts |  |
| 013_Items/008_PokemonBag.rb | ported | game/items/PokemonBag.ts |  |
| 014_Pokemon/001_Pokemon-related/001_FormHandlers.rb | ported | game/pokemon/formHandlers.ts, ui/sprites/pokemonSprite.ts | Spinda's spots (`drawSpot` :37, `pbSpindaSpots` :61, SPINDA `alterBitmap`) ported; with the Gen 8 Pack they only apply to single-frame sprites (Essentials Deluxe's Species Files.rb:236), and this game's Spinda sprites are animated strips. |
| 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb | ported | game/pokemon/shadowPokemonOther.ts, ui/purifyChamber/RelicStone.ts, battle/battle/Battle_ActionUseItem.ts, battle/battler/Battler.ts, Battler_Initialize.ts, Battler_ChangeSelf.ts, Battler_UseMoveSuccessChecks.ts, battle/move/MoveEffects_Shadow.ts | Purification, Relic Stone, scents/Time Flute, the event handlers; the battle half (:167-404: item check in Hyper Mode, `pbInitPokemon`, `shadowPokemon?`/`inHyperMode?`, `pbHyperMode`, `pbHyperModeObedience`, the Shadow move classes) checked against Ruby by battle/shadowBattleReference.test.ts (tools/ruby-ref/shadow_battle_reference.rb). This game's PBS has no SHADOW type or Shadow moves, so the test registers them. |
| 014_Pokemon/001_Pokemon-related/003_Pokemon_Sprites.rb | ported | ui/sprites/pokemonIcon.ts, ui/sprites/pokemonSprite.ts |  |
| 014_Pokemon/001_Pokemon-related/004_PokemonStorage.rb | ported | game/pokemon/PokemonStorage.ts | `RegionalStorage` (:267-300) left out: the game uses one storage. |
| 014_Pokemon/001_Pokemon.rb | ported | game/pokemon/Pokemon.ts, game/battle/scripts.ts |  |
| 014_Pokemon/002_Pokemon_MegaEvolution.rb | ported | game/pokemon/Pokemon.ts |  |
| 014_Pokemon/003_Pokemon_ShadowPokemon.rb | ported | game/pokemon/Pokemon.ts |  |
| 014_Pokemon/004_Pokemon_Move.rb | ported | game/pokemon/PokemonMove.ts |  |
| 014_Pokemon/005_Pokemon_Owner.rb | ported | game/pokemon/PokemonOwner.ts |  |
| 015_Trainers and player/001_Trainer.rb | ported | game/trainer/Trainer.ts |  |
| 015_Trainers and player/002_Trainer_LoadAndNew.rb | ported | game/trainer/loadAndNew.ts, game/scripts/pokemon.ts, game/trainers/trainerEvents.ts |  |
| 015_Trainers and player/003_Trainer_Sprites.rb | ported | ui/planes.ts |  |
| 015_Trainers and player/004_Player.rb | ported | game/trainer/Player.ts, plugins/socialLinks/player.ts, plugins/socialLinks/index.ts |  |
| 015_Trainers and player/005_Player_Pokedex.rb | ported | game/trainer/Pokedex.ts |  |
| 016_UI/001_Non-interactive UI/001_UI_SplashesAndTitleScreen.rb | ported | ui/scenes/SplashesAndTitleScreen.ts | Random title cry ported. |
| 016_UI/001_Non-interactive UI/002_UI_Controls.rb | ported | game/scripts/scenes.ts, ui/scenes/ButtonEventScene.ts |  |
| 016_UI/001_Non-interactive UI/003_UI_EggHatching.rb | ported | ui/hatching/EggHatching.ts, game/scripts/lifecycle.ts |  |
| 016_UI/001_Non-interactive UI/004_UI_Evolution.rb | ported | ui/evolution/Evolution.ts | The `{ pbUpdate }` block reaches pbLearnMove's messages. `pbSaveSpriteStateAndBitmap`/`pbRestoreSpriteStateAndBitmap` (:333-340) are never called in Ruby. |
| 016_UI/001_Non-interactive UI/005_UI_Trading.rb | ported | ui/trading/Trading.ts, game/scripts/lifecycle.ts |  |
| 016_UI/001_Non-interactive UI/006_UI_HallOfFame.rb | ported | ui/hallOfFame/HallOfFame.ts, game/scripts/lifecycle.ts |  |
| 016_UI/001_Non-interactive UI/007_UI_Credits.rb | ported | ui/hallOfFame/Credits.ts, game/scripts/lifecycle.ts, ui/hallOfFame/HallOfFame.ts |  |
| 016_UI/001_UI_PauseMenu.rb | superseded | ui/menus/pauseMenu.ts (plugin) | This game replaces `call_menu` with the DP Pause Menu plugin (Plugins/DP Pause Menu/Script.rb:35), which is ported; the core menu never shows in the original either. |
| 016_UI/002_UI_Pokedex_Menu.rb | ported | ui/pokedex/pokedexMenu.ts |  |
| 016_UI/003_UI_Pokedex_Main.rb | ported | ui/pokedex/pokedexMain.ts |  |
| 016_UI/004_UI_Pokedex_Entry.rb | ported | ui/pokedex/pokedexEntry.ts |  |
| 016_UI/005_UI_Party.rb | ported | ui/party/party.ts, ui/storage/PokemonStorageScene.ts |  |
| 016_UI/006_UI_Summary.rb | ported | ui/summary/summary.ts, plugins/pokemonAmie/amie.ts |  |
| 016_UI/007_UI_Bag.rb | ported | ui/bag/bag.ts |  |
| 016_UI/008_UI_Pokegear.rb | ported | ui/pokegear/pokegear.ts |  |
| 016_UI/009_UI_RegionMap.rb | ported | ui/pokegear/regionMap.ts |  |
| 016_UI/010_UI_Phone.rb | ported | ui/pokegear/phone.ts |  |
| 016_UI/011_UI_Jukebox.rb | ported | ui/pokegear/jukebox.ts |  |
| 016_UI/012_UI_TrainerCard.rb | ported | ui/trainerCard/trainerCard.ts |  |
| 016_UI/013_UI_Load.rb | ported | ui/load/loadScreen.ts | Language option ported (shows with 2+ Settings.LANGUAGES); the Mystery Gift option ported (shows once the player has a Mystery Gift saved or `mysteryGiftUnlocked`, calls `pbDownloadMysteryGift` in ui/MysteryGift.ts). |
| 016_UI/014_UI_Save.rb | ported | ui/save/saveScreen.ts | `pbEmergencySave` (:1) only runs on Hangup, which a browser doesn't have. |
| 016_UI/015_UI_Options.rb | ported | ui/options/options.ts |  |
| 016_UI/016_UI_ReadyMenu.rb | ported | ui/menus/readyMenu.ts |  |
| 016_UI/017_UI_PokemonStorage.rb | ported | ui/storage/PokemonStorageScene.ts, ui/storage/PokemonStorageScreen.ts |  |
| 016_UI/018_UI_ItemStorage.rb | ported | ui/storage/ItemStorage.ts, ui/bag/UIHelper.ts |  |
| 016_UI/019_UI_PC.rb | ported | game/scripts/pc.ts, game/globals.ts, battle/other/Peers.ts |  |
| 016_UI/020_UI_PokeMart.rb | ported | ui/mart/PokemonMart.ts | `getItemIconRect` (:56) is marked unused. |
| 016_UI/021_UI_MoveRelearner.rb | ported (another agent) | ui/party/moveRelearner.ts |  |
| 016_UI/022_UI_PurifyChamber.rb | ported (another agent, in progress) | ui/purifyChamber/* |  |
| 016_UI/023_UI_MysteryGift.rb | ported (another agent, in progress) | ui/MysteryGift.ts |  |
| 016_UI/024_UI_TextEntry.rb | ported | ui/textEntry/UI_TextEntry.ts | The Pokémon icon on the naming screen ported. |
| 017_Minigames/001_Minigame_Duel.rb | ported | minigames/Duel.ts |  |
| 017_Minigames/002_Minigame_TripleTriad.rb | ported | minigames/TripleTriad.ts, minigames/scripts.ts |  |
| 017_Minigames/003_Minigame_SlotMachine.rb | ported | minigames/SlotMachine.ts |  |
| 017_Minigames/004_Minigame_VoltorbFlip.rb | ported | minigames/VoltorbFlip.ts |  |
| 017_Minigames/005_Minigame_Lottery.rb | ported | minigames/Lottery.ts |  |
| 017_Minigames/006_Minigame_Mining.rb | ported | minigames/Mining.ts |  |
| 017_Minigames/007_Minigame_TilePuzzles.rb | ported | minigames/TilePuzzles.ts |  |
| 018_Alternate battle modes/001_Battle Frontier/001_Challenge_BattleChallenge.rb | ported | game/frontier/battleChallenge.ts |  |
| 018_Alternate battle modes/001_Battle Frontier/002_Challenge_Data.rb | ported | game/frontier/challengeData.ts | Marshal `_dump/_load` (:188-192) replaced by JSON. |
| 018_Alternate battle modes/001_Battle Frontier/003_Challenge_ChooseFoes.rb | ported | game/frontier/chooseFoes.ts |  |
| 018_Alternate battle modes/001_Battle Frontier/004_Challenge_Battles.rb | ported | game/frontier/challengeBattles.ts, game/battle/recordedBattle.ts |  |
| 018_Alternate battle modes/001_Battle Frontier/005_UI_BattleSwap.rb | ported | game/frontier/battleSwap.ts |  |
| 018_Alternate battle modes/001_SafariZone.rb | ported | game/battle/safari.ts, game/encounters/PokemonEncounters.ts |  |
| 018_Alternate battle modes/002_Battle Frontier rules/001_Challenge_ChallengeRules.rb | ported | game/frontier/challengeRules.ts, game/frontier/scripts.ts |  |
| 018_Alternate battle modes/002_Battle Frontier rules/002_Challenge_Rulesets.rb | ported | game/frontier/rulesets.ts |  |
| 018_Alternate battle modes/002_Battle Frontier rules/003_Challenge_EntryRestrictions.rb | ported | game/frontier/entryRestrictions.ts |  |
| 018_Alternate battle modes/002_Battle Frontier rules/004_Challenge_LevelAdjustment.rb | ported | game/frontier/levelAdjustment.ts |  |
| 018_Alternate battle modes/002_Battle Frontier rules/005_Challenge_BattleRules.rb | ported | game/frontier/battleRules.ts |  |
| 018_Alternate battle modes/002_BugContest.rb | ported | game/battle/bugContest.ts, game/encounters/PokemonEncounters.ts |  |
| 018_Alternate battle modes/003_Battle Frontier generator/001_ChallengeGenerator_Data.rb | ported | game/frontier/generatorData.ts |  |
| 018_Alternate battle modes/003_Battle Frontier generator/002_ChallengeGenerator_Pokemon.rb | ported | game/frontier/generatorPokemon.ts |  |
| 018_Alternate battle modes/003_Battle Frontier generator/003_ChallengeGenerator_Trainers.rb | ported | game/frontier/generatorTrainers.ts |  |
| 018_Alternate battle modes/003_Battle Frontier generator/004_ChallengeGenerator_BattleSim.rb | ported | game/frontier/battleSim.ts |  |
| 019_Utilities/001_Utilities.rb | ported | game/utilities.ts, ui/textEntry/playerName.ts, game/trainers/trainerEvents.ts, game/scripts/eventScripts.ts | Spread over its users; the leftovers (temperatures, constants, timed events, pbGetPlayerGraphic, getRandomName, item conversions, pbHideVisibleObjects/pbShowObjects, pbLoadRpgxpScene (v20.1 Hotfixes version), pbScreenCapture) are in game/utilities.ts; `pbChooseLanguage` in core/intl.ts. |
| 019_Utilities/002_Utilities_Pokemon.rb | ported | game/pokemon/utilities.ts |  |
| 019_Utilities/003_Utilities_BattleAudio.rb | ported | game/battle/battleAudio.ts, game/battle/scripts.ts, battle/scene/BattleScene.ts |  |
| 999_Main/999_Main.rb | ported | main.ts | `pbEmergencySave` on Hangup doesn't apply. |
