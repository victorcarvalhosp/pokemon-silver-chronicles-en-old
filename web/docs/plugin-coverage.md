# Plugin coverage

Every `.rb` file of every plugin the game loads (the list in
`Data/PluginScripts.rxdata`; the source is `Plugins/<folder>/`), with where
its port lives. Paths are under `web/`. Not loaded, so not listed:
`Plugins/Plugins to add later/`, `Plugins/Scripts/` (empty) and
`Plugins/Social Links.zip`.

**Ported** is "yes" when every class, method and handler of the file has a TS
counterpart, and "n/a" when the file has nothing that runs in this game (fully
commented out, or only active with a plugin that isn't installed). Quirks and
bugs of the original that the port keeps are in
[original-game-bugs.md](original-game-bugs.md).

How this was checked (2026-10-29): a script listed each file's `def`,
`class`/`module` and `XxxHandlers.add` ids, camelCased them and searched the
TS source and the PBS compiler (`src/`, `tools/`); every miss was then read in
the Ruby and either ported or explained in the notes below. Logic ported in
that pass has vitest replays of the real Ruby (harnesses in
`tools/ruby-ref/`):

| Harness | Test |
|---|---|
| `amie_reference.rb` | `src/plugins/pokemonAmie/amie.test.ts` |
| `social_links_reference.rb` | `src/plugins/socialLinks/socialLinks.test.ts` |
| `purify_chamber_reference.rb` | `src/ui/purifyChamber/purifyChamber.test.ts` |
| `experiment_scene_reference.rb` | `src/plugins/experimentWithScene/experimentScene.test.ts` |
| `unown_report_reference.rb` | `src/plugins/unownReport/unownReport.test.ts` |
| `lukas_utilities_reference.rb` | `src/plugins/lukasUtilities/lukasUtilities.test.ts` |
| `easy_mouse_reference.rb` | `src/plugins/easyMouse/mouse.test.ts` |
| `legend_plate_reference.rb` | `src/battle/battle/legendPlate.test.ts` |

Screens that are hard to reach in play have dev pages: `dev-amie.html`,
`dev-social.html`, `dev-purify.html`, `dev-plugin-scenes.html`
(`?scene=myui|unown|mega`), `dev-scenes.html?scene=wardrobe`.

Not a plugin but ported in the same pass: `Data/Scripts/016_UI/022_UI_PurifyChamber.rb`
(`src/ui/purifyChamber/`) and the non-battle half of
`014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb`
(`src/game/pokemon/shadowPokemonOther.ts`, `src/ui/purifyChamber/RelicStone.ts`).
The battle half of that file (Shadow Pokémon in battle: Hyper Mode, Shadow
moves) is still unported.

| Plugin | File | Ported | Where (web/) | Notes |
|---|---|---|---|---|
| Apricorn To Ball | Apricorn To Ball Script.rb | yes | `src/ui/mart/ApricornToBall.ts` |  |
| BW Gender Selector | BWGenderSelector.rb | yes | `src/ui/scenes/GenderSelector.ts` |  |
| BW Gender Selector | BWGenderSettings.rb | yes | `src/ui/scenes/GenderSelector.ts` |  |
| BW Key Items | BW Key Item.rb | yes | `src/ui/scenes/KeyItem.ts` |  |
| Cable Car | Script.rb | yes | `src/game/field/CableCar.ts` |  |
| Carmaniac's Speech Bubble | Carmaniac's Speech Bubble.rb | yes | `src/ui/speechBubble.ts` |  |
| DP Pause Menu | Script.rb | yes | `src/ui/menus/pauseMenu.ts` |  |
| Dance Minigame | Main.rb | yes | `src/minigames/DanceMinigame.ts` |  |
| DayCare Overworld Pokemon | DayCare Overworld Pokemon.rb | yes | `src/game/daycare/DayCareOverworld.ts` |  |
| Easy Mouse System | Script.rb | yes | `src/plugins/easyMouse/Mouse.ts`, `src/rgss/Input.ts` | Mouse API ported whole, checked against the Ruby (21 scripted steps). Only Pokémon Amie uses it; no Essentials menu reads the mouse. DP Pause Menu reads `$mouse`, which nothing defines, so its mouse code is dead in the original too. |
| Encounter List UI | 002_UI_Encounters.rb | yes | `src/ui/pokegear/encounterList.ts` |  |
| Enhanced UI | [000] Settings.rb | yes | `src/battle/deluxe/EnhancedBattleUI.ts`, `src/ui/pokedex/enhancedUI.ts` |  |
| Enhanced UI | [001] Pokemon UI.rb | yes | `src/ui/pokedex/enhancedUI.ts`, `src/ui/summary/pluginDisplays.ts`, `src/ui/summary/summary.ts`, `src/debug/index.ts` |  |
| Enhanced UI | [002] Battle UI.rb | yes | `src/battle/deluxe/EnhancedBattleUI.ts`, `src/battle/scene/BattleScene.ts` |  |
| Essentials Deluxe | Settings.rb | yes | `src/data/gameData/settings.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Battle.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/battle/Battle_AttackPhase.ts`, `src/battle/battle/Battle_ActionUseItem.ts`, `src/battle/battle/Battle_ActionOther.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Battle_Misc.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/move/Move_UsageCalculations.ts`, `src/battle/move/MoveEffects_BattlerOther.ts`, `src/battle/move/Move.ts` | hasBirthsign? and the other stubs return false/nil for plugins that aren’t installed. |
| Essentials Deluxe | [000] Essentials Patches/Battle_Scene.rb | yes | `src/battle/deluxe/MegaEvolutionAnim.ts`, `src/battle/deluxe/Midbattle_Main.ts`, `src/battle/zud/scene/Scene_Animation_Dynamax.ts`, `src/battle/zud/scene/Scene_Animation_ZMove.ts` | applyTera/unTera/applyTeraIcon are no-op stubs for Terastal Phenomenon (not installed); pbSOSJoin only exists with SOS Battles (not installed). |
| Essentials Deluxe | [000] Essentials Patches/Compiler.rb | yes | `tools/pbs/compilePlugins.ts`, `tools/pbs/compile.ts`, `src/compiler/WritePBS.ts` | compile_plugin_* are in the PBS compiler; dx_plugin_check only checks other plugins’ versions. |
| Essentials Deluxe | [000] Essentials Patches/Databoxes.rb | yes | `src/battle/scene/objects.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Debug.rb | yes | `src/battle/battle/Battle_StartAndEnd.ts`, `src/battle/other/PBDebug.ts`, `src/battle/zud/Debug.ts`, `src/debug/DebugBattleExtraCode.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Fight Menu.rb | yes | `src/battle/battle/Battle_CommandPhase.ts`, `src/battle/deluxe/EnhancedBattleUI.ts`, `src/battle/scene/pluginUI.ts`, `src/battle/scene/menus.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Mega Evolution.rb | yes | `src/battle/battle/Battle_AttackPhase.ts`, `src/battle/battle/Battle_ActionOther.ts`, `src/battle/deluxe/MegaEvolutionAnim.ts`, `src/battle/deluxe/index.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Miscellaneous.rb | yes | `src/ui/storage/PokemonStorageScene.ts`, `src/game/trainer/GameStats.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Pokedex.rb | yes | `src/ui/pokedex/pokedexMain.ts`, `src/ui/pokedex/pokedexEntry.ts`, `src/game/trainer/Pokedex.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Pokemon.rb | yes | `src/ui/pokedex/enhancedUI.ts`, `src/game/battle/roaming.ts`, `src/game/pokemon/utilities.ts`, `src/game/pokemon/Pokemon.ts` | legendary_egg_group? added in this pass (`src/ui/pokedex/enhancedUI.ts`). |
| Essentials Deluxe | [000] Essentials Patches/Species Files.rb | yes | `src/battle/scene/objects.ts`, `src/ui/sprites/pokemonSprite.ts`, `src/ui/sprites/pokemonIcon.ts`, `src/data/gameData/speciesMetrics.ts` | Spinda’s alterBitmap path (prepare_strip/compile_strip) only runs on single-frame sprites; this game’s Spinda sprites are strips, so it never runs (see `pokemonSprite.ts`). |
| Essentials Deluxe | [000] Essentials Patches/Species Overworlds.rb | yes | `src/ui/sprites/pokemonOverworldSprite.ts`, `src/game/daycare/DayCareOverworld.ts`, `src/game/following/FollowingPkmn.ts` | overworld_bitmap(_from_pokemon), PokemonOverworldSprite, PokemonSpeciesOverworldSprite added in this pass (`src/ui/sprites/pokemonOverworldSprite.ts`; unused by the game). |
| Essentials Deluxe | [000] Essentials Patches/Sprite Outliner.rb | yes | `src/battle/deluxe/EnhancedBattleUI.ts` |  |
| Essentials Deluxe | [000] Essentials Patches/Trainer Data.rb | yes | `src/data/gameData/trainer.ts`, `src/debug/EditorDataTypes.ts`, `src/debug/editors/EditorScreens.ts`, `tools/pbs/compileTrainers.ts` |  |
| Essentials Deluxe | [001] Plugin Patches/BW Party Screen.rb | n/a | — | Only applies with BW Party Screen installed (it isn’t). |
| Essentials Deluxe | [001] Plugin Patches/BW Storage System.rb | n/a | — | Only applies with BW Storage System installed (it isn’t). |
| Essentials Deluxe | [001] Plugin Patches/Interactable Bag Screen.rb | n/a | — | Only applies with “Bag Screen w/int. Party” installed (it isn’t). |
| Essentials Deluxe | [001] Plugin Patches/_Custom Placeholder_.rb | yes | `src/battle/battle/Battle_AttackPhase.ts`, `src/battle/battle/Battle_ActionOther.ts`, `src/battle/ai/Battle_AI.ts` |  |
| Essentials Deluxe | [002] Battle Deluxe/Battle_Deluxe.rb | yes | `src/battle/battle/Battle_StartAndEnd.ts`, `src/battle/deluxe/DeluxeTemp.ts`, `src/battle/deluxe/Battle_Deluxe.ts`, `src/battle/other/CatchAndStoreMixin.ts` |  |
| Essentials Deluxe | [002] Battle Deluxe/Battle_Scene.rb | yes | `src/battle/deluxe/MegaEvolutionAnim.ts`, `src/battle/deluxe/Midbattle_Main.ts`, `src/battle/zud/scene/Scene_Animation_Dynamax.ts`, `src/battle/zud/scene/Scene_Animation_ZMove.ts` |  |
| Essentials Deluxe | [002] Battle Deluxe/Midbattle_Config.rb | yes | `src/battle/deluxe/Midbattle_Config.ts` |  |
| Essentials Deluxe | [002] Battle Deluxe/Midbattle_Effects.rb | yes | `src/battle/battle/Battle_EndOfRoundPhase.ts`, `src/battle/deluxe/Midbattle_Effects.ts` |  |
| Essentials Deluxe | [002] Battle Deluxe/Midbattle_Main.rb | yes | `src/battle/deluxe/Midbattle_Main.ts`, `src/battle/DebugScene.ts` |  |
| Essentials Deluxe | [002] Battle Deluxe/Midbattle_Triggers.rb | yes | `src/battle/battle/Battle_ActionUseItem.ts`, `src/battle/battle/Battle_ActionSwitching.ts`, `src/battle/battle/Battle_StartAndEnd.ts`, `src/battle/battle/Battle_EndOfRoundPhase.ts` |  |
| ExperimentWithScene | Math Functions.rb | yes | `src/plugins/experimentWithScene/MathFunctions.ts`, `src/plugins/experimentWithScene/index.ts` |  |
| ExperimentWithScene | MyUI Module.rb | yes | `src/plugins/experimentWithScene/MyUIModule.ts`, `src/plugins/experimentWithScene/index.ts` |  |
| ExperimentWithScene | MyUI_Scene.rb | yes | `src/plugins/experimentWithScene/MathFunctions.ts`, `src/plugins/experimentWithScene/SceneCamera.ts`, `src/plugins/experimentWithScene/index.ts`, `src/plugins/experimentWithScene/MyUIScene.ts` | The scene raises at MyUI_Scene.rb:153 as in Ruby; nothing in the game opens it. |
| ExperimentWithScene | Scene Camera.rb | yes | `src/plugins/experimentWithScene/SceneCamera.ts`, `src/plugins/experimentWithScene/index.ts`, `src/plugins/experimentWithScene/MyUIScene.ts` |  |
| Fly Animation | [001]Settings.rb | yes | `src/game/field/FlyAnimation.ts` |  |
| Fly Animation | [002]Fly Animation.rb | yes | `src/ui/hallOfFame/Credits.ts`, `src/game/field/FlyAnimation.ts`, `src/game/field/FieldMoves.ts`, `src/game/field/index.ts` |  |
| Fly Animation | [003]HM Handlers.rb | yes | `src/game/field/FlyAnimation.ts`, `src/game/field/FieldMoves.ts` |  |
| Fly Animation | [004]Fly Animation Other Players.rb | yes | `src/game/field/FlyAnimation.ts` |  |
| Following Pokemon EX | Configuration/000_Config.rb | yes | `src/game/following/config.ts` |  |
| Following Pokemon EX | Configuration/001_Dialogue_Item.rb | yes | `src/game/following/dialogue.ts` |  |
| Following Pokemon EX | Configuration/002_Dialogue_Specific.rb | yes | `src/game/following/dialogue.ts` |  |
| Following Pokemon EX | Configuration/003_Dialogue_Generic.rb | yes | `src/game/following/dialogue.ts` |  |
| Following Pokemon EX | Configuration/004_Disappearing.rb | yes | `src/game/following/dialogue.ts` |  |
| Following Pokemon EX | Main Module/Event_Sprite Commands.rb | yes | `src/game/following/FollowingPkmn.ts` |  |
| Following Pokemon EX | Main Module/Internal Commands.rb | yes | `src/game/following/FollowingPkmn.ts` |  |
| Following Pokemon EX | Main Module/User Commands.rb | yes | `src/game/following/FollowingPkmn.ts` |  |
| Following Pokemon EX | New Event Type/Event Sprite.rb | yes | `src/game/following/FollowerSprites.ts`, `src/game/following/aliases.ts`, `src/sprites/SpriteCharacter.ts` |  |
| Following Pokemon EX | New Event Type/Following Event.rb | yes | `src/game/following/GameFollower.ts`, `src/game/following/GameFollowerFactory.ts` |  |
| Following Pokemon EX | New Event Type/Misc.rb | yes | `src/game/globals.ts`, `src/game/following/FollowingPkmn.ts`, `src/game/following/Followers.ts`, `src/game/following/aliases.ts` |  |
| Following Pokemon EX | Script Additions/Animations.rb | yes | `src/battle/scene/animations.ts`, `src/game/field/hiddenMoveAnimation.ts`, `src/game/following/index.ts` |  |
| Following Pokemon EX | Script Additions/Compatibility.rb | yes | `src/ui/options/options.ts`, `src/game/eventHandlers.ts`, `src/game/following/GameFollower.ts`, `src/game/following/aliases.ts` | NamedEvent#trigger_2 is EventHandlers.trigger2. |
| Following Pokemon EX | Script Additions/Field Moves.rb | yes | `src/game/field/FieldMoves.ts`, `src/game/field/followingFieldMoves.ts` |  |
| Following Pokemon EX | Script Additions/Refresh.rb | yes | `src/ui/evolution/Evolution.ts`, `src/ui/bag/bag.ts`, `src/ui/trading/Trading.ts`, `src/ui/hatching/EggHatching.ts` |  |
| Generation 8 Pack Scripts | 000_Config.rb | yes | `src/game/following/config.ts` |  |
| Generation 8 Pack Scripts | Sprite Scaling/Custom Sprite Scales.rb | yes | `src/compiler/WritePBS.ts` |  |
| Generation 8 Pack Scripts | Sprite Scaling/EBDX Wrapper Compatibility.rb | yes | `src/ui/storage/PokemonStorageScene.ts`, `src/ui/pokedex/pokedexMain.ts`, `src/ui/summary/summary.ts` |  |
| Generation 8 Pack Scripts | Sprite Scaling/EBDX Wrapper.rb | yes | `src/ui/hallOfFame/Credits.ts`, `src/ui/sprites/pokemonSprite.ts`, `src/compiler/WritePBS.ts`, `tools/pbs/compileSpecies.ts` | prepare_strip/compile_strip: see Species Files.rb. |
| Generation 8 Pack Scripts | Sprite Scaling/Footprint Replcement.rb | yes | `src/ui/pokedex/pokedexEntry.ts` |  |
| Generation 9 Pack Scripts | Settings.rb | yes | `src/data/gameData/settings.ts` |  |
| Generation 9 Pack Scripts | [000] General/[000] Pokemon.rb | yes | `src/game/pokemon/Pokemon.ts`, `src/plugins/gen9Pack/stepHandlers.ts` | The :evolution_steps and :mirrorherb_step step handlers added in this pass. |
| Generation 9 Pack Scripts | [000] General/[001] Summary.rb | yes | `src/ui/summary/summary.ts` |  |
| Generation 9 Pack Scripts | [000] General/[002] Debug.rb | yes | `src/debug/DebugBattleExtraCode.ts`, `src/debug/EditorUtilities.ts`, `src/debug/DebugPokemonCommands.ts`, `src/debug/DebugBattlePkmnCommands.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[000] PBEffects.rb | yes | `src/battle/deluxe/Midbattle_Effects.ts`, `src/battle/other/PBEffects.ts`, `src/debug/DebugBattleExtraCode.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[001] Battle.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/battle/Battle_ActionOther.ts`, `src/battle/battle/Battle_ActionSwitching.ts`, `src/battle/battle/Battle_EndOfRoundPhase.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[002] Battle_Battler.rb | yes | `src/battle/battler/Battler_StatStages.ts`, `src/battle/battler/Battler_ChangeSelf.ts`, `src/battle/battler/Battler_AbilityAndItem.ts`, `src/battle/battler/Battler_UseMoveSuccessChecks.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[003] Battle_AI.rb | yes | `src/battle/ai/AI_Switch.ts`, `src/battle/ai/Battle_AI.ts`, `src/battle/ai/AI_Move_Utilities.ts`, `src/battle/ai/AI_Item.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[004] AI_Move_EffectScores.rb | yes | `src/battle/ai/AI_Move_EffectScores_Gen9.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[005] Weather and Status.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/battler/Battler_UseMoveSuccessChecks.ts`, `src/battle/battler/Battler_Statuses.ts` |  |
| Generation 9 Pack Scripts | [001] Battle/[006] Legend Plate Functions.rb | yes | `src/battle/battle/Battle_LegendPlate.ts`, `src/battle/scene/ArceusTransform.ts`, `src/battle/battler/Battler_AbilityAndItem.ts`, `src/battle/move/MoveEffects_MoveAttributes.ts` | Battle#pbGetBestTypeJudgment + helpers and the Arceus transform animation added in this pass (22 cases vs Ruby). |
| Generation 9 Pack Scripts | [002] Moves/[000] Move Functions.rb | yes | `src/battle/move/MoveEffects_Healing.ts`, `src/battle/move/MoveEffects_Items.ts`, `src/battle/move/MoveEffects_BattlerOther.ts`, `src/battle/move/moveEffects.ts` |  |
| Generation 9 Pack Scripts | [002] Moves/[001] New Move Functions.rb | yes | `src/battle/move/MoveEffects_Gen9NewMoveFunctions.ts`, `src/battle/move/moveEffects.ts` |  |
| Generation 9 Pack Scripts | [003] Abilities/[000] Ability Handlers.rb | yes | `src/battle/other/AbilityEffects.ts`, `src/battle/abilities/Gen9_AbilityHandlers.ts` |  |
| Generation 9 Pack Scripts | [003] Abilities/[001] New Ability Handlers.rb | yes | `src/battle/abilities/Gen9_NewAbilityHandlers.ts` |  |
| Generation 9 Pack Scripts | [004] Items/[000] Item Handlers.rb | yes | `src/battle/items/Item_BattleEffects.ts`, `src/battle/items/Gen9_ItemHandlers.ts`, `src/game/items/Item_Effects.ts` |  |
| Generation 9 Pack Scripts | [004] Items/[001] New Item Handlers.rb | yes | `src/battle/other/PokeBallEffects.ts`, `src/battle/other/ItemEffects.ts`, `src/battle/items/Item_BattleEffects.ts`, `src/battle/items/Gen9_NewItemHandlers.ts` |  |
| Improved AI | AI_EffectScores.rb | yes | `src/battle/ai/AI_Move_EffectScores_ImprovedAI.ts` |  |
| Improved AI | AI_Move.rb | yes | `src/battle/ai/AI_Move.ts` |  |
| Improved AI | AI_Move_Utilities.rb | yes | `src/battle/ai/AI_Move_Utilities.ts` |  |
| Improved AI | settings.rb | yes | `src/battle/ai/AI_Move.ts` |  |
| Improved Field Skills | [000] Settings.rb | yes | `src/data/gameData/settings.ts` |  |
| Improved Field Skills | [001] Field Skills.rb | yes | `src/ui/party/fieldSkills.ts`, `src/ui/menus/readyMenu.ts`, `src/game/field/HiddenMoveHandlers.ts`, `src/compiler/WritePBS.ts` |  |
| Improved Field Skills | [002] Party Skills.rb | yes | `src/ui/party/fieldSkills.ts` |  |
| Luka's Scripting Utilities | script.rb | yes | `src/plugins/lukasUtilities/colors.ts`, `src/plugins/lukasUtilities/sprites.ts`, `src/plugins/lukasUtilities/bitmaps.ts`, `src/plugins/lukasUtilities/spriteClasses.ts` | Whole library added in this pass as helper functions/classes (22 tests vs Ruby). Browser: file access through the asset index and the dev file endpoint; `Dir.delete_all` throws (no delete route); `PluginManager.find_dir` is always nil (Plugins/ isn’t served). |
| MQS | 001_Quest_Config.rb | yes | `src/game/quests.ts` |  |
| MQS | 002_Quest_Main.rb | yes | `src/game/quests.ts` |  |
| MQS | 003_Quest_UI.rb | yes | `src/ui/quests/questList.ts` |  |
| MQS | 004_Quest_Data.rb | yes | `src/game/quests.ts` |  |
| Map Zoom | Map Zoom.rb | yes | `src/game/weather/MapZoom.ts` |  |
| Marin's Enhanced Staircases | script.rb | yes | `src/game/field/EnhancedStaircases.ts` |  |
| Mega Evolution | Mega Evolution.rb | yes | `src/plugins/megaEvolution/SceneMegaEvolution.ts`, `src/battle/deluxe/MegaEvolutionAnim.ts`, `src/battle/battle/Battle_ActionOther.ts` | SceneMegaEvolution ported but not installed: Essentials Deluxe replaces its caller, so Deluxe’s animation is the active one. |
| Mount | Mount.rb | n/a | — | Every line is commented out; nothing to port. |
| Mr. Gela's HGSS Trainer Card Scene | Mr. Gela's HGSS Trainer Card Scene.rb | yes | `src/ui/trainerCard/trainerCard.ts`, `src/game/trainer/Player.ts`, `src/ui/hallOfFame/HallOfFame.ts` | fullname2 / getForeignID / setForeignID added to Player in this pass. |
| Overworld Shadows EX | Config.rb | yes | `src/game/following/OverworldShadows.ts` |  |
| Overworld Shadows EX | script.rb | yes | `src/game/encounters/visibleEncounters.ts`, `src/game/following/OverworldShadows.ts`, `src/game/following/SpriteOWShadow.ts` |  |
| Partner Trainer Card | Partner Trainer Card.rb | yes | `src/ui/hallOfFame/Credits.ts`, `src/ui/trainerCard/partnerTrainerCard.ts`, `src/game/scripts/infoScreens.ts`, `src/dev/infoDemo.ts` |  |
| Photographer | Photographer.rb | yes | `src/game/weather/Photographer.ts` |  |
| Pokemon Amie | Pokemon Amie.rb | yes | `src/plugins/pokemonAmie/amie.ts`, `src/plugins/pokemonAmie/index.ts`, `src/plugins/pokemonAmie/PokeAmieScene.ts` | Whole plugin incl. the scene. `Game_Mouse` (no such class) and duplicate no-op globals skipped. Feeding a food with a field-use handler crashes as in Ruby. |
| Pokemon Selection Before Battle | Pokemon Selection Before Battle.rb | yes | `src/ui/hallOfFame/Credits.ts`, `src/game/trainers/pokemonSelection.ts`, `src/game/frontier/rulesets.ts` | refreshGlobals (`$player ||= $Trainer`) does nothing in v20.1. |
| Pokemon Silver Chronicles Helpers | CustomStairs.rb | yes | `src/game/field/CustomStairs.ts` |  |
| Pokemon Silver Chronicles Helpers | Items.rb | yes | `src/battle/move/MoveEffects_Items.ts`, `src/battle/items/ZUD_Override_Items.ts`, `src/battle/items/index.ts`, `src/game/items/pluginItems.ts` |  |
| Pokemon Silver Chronicles Helpers | Pokegear Changes.rb | yes | `src/ui/pokegear/encounterList.ts`, `src/ui/pokegear/pokegear.ts` |  |
| Pokemon Silver Chronicles Helpers | Pokemon Silver Chronicles Helpers.rb | yes | `src/game/scripts/pokemon.ts`, `src/game/scripts/rubyErrors.ts`, `src/game/trainers/trainerEvents.ts` |  |
| Pokemon Silver Chronicles Helpers | Utils.rb | yes | `src/game/pokemon/utilities.ts`, `src/game/field/CustomStairs.ts`, `src/game/scripts/eventScripts.ts`, `src/game/scripts/pokemon.ts` |  |
| Pokemon Silver Chronicles Helpers | Whilrpool HM.rb | yes | `src/game/field/Whirlpool.ts`, `src/game/field/FieldMoves.ts`, `src/game/scripts/fieldMoves.ts` |  |
| Roaming Icon | Roaming Icon.rb | yes | `src/ui/pokegear/regionMap.ts`, `src/ui/hallOfFame/Credits.ts`, `src/game/battle/roaming.ts` |  |
| Roulette Game | Roulette Game.rb | yes | `src/minigames/Roulette.ts` | coinHolder is $player in v20 (inlined). |
| Side Stairs Tiles | Side Stairs Tiles.rb | yes | `src/game/field/SideStairs.ts` |  |
| Social Links | 000_Settings.rb | yes | `src/plugins/socialLinks/settings.ts`, `src/plugins/socialLinks/index.ts` |  |
| Social Links | 001_Data.rb | yes | `src/plugins/socialLinks/data.ts`, `src/plugins/socialLinks/normalize.ts`, `src/plugins/socialLinks/index.ts` |  |
| Social Links | 002_Configuration.rb | yes | `src/plugins/socialLinks/data.ts`, `src/plugins/socialLinks/SocialUI.ts`, `src/plugins/socialLinks/index.ts`, `src/plugins/socialLinks/configuration.ts` |  |
| Social Links | 003_SocialUI.rb | yes | `src/plugins/socialLinks/SocialUI.ts`, `src/plugins/socialLinks/sceneLogic.ts`, `src/plugins/socialLinks/normalize.ts`, `src/plugins/socialLinks/index.ts` |  |
| Social Links | 004_Player.rb | yes | `src/plugins/socialLinks/player.ts`, `src/plugins/socialLinks/index.ts`, `src/game/trainer/Player.ts` | Bond effects are tracked and announced, but nothing in the original reads active_bond_effect?, so they change nothing in play. |
| Social Links | 005_Script Variables.rb | yes | `src/plugins/socialLinks/scriptVariables.ts`, `src/plugins/socialLinks/index.ts` | Ported; unused (the Game_Event edit it needs was never applied). |
| Social Links | PHONE_INTEGRATION_EXAMPLE.rb | yes | `src/plugins/socialLinks/phoneIntegrationExample.ts`, `src/plugins/socialLinks/index.ts` | Loaded by the game, so ported (all six helpers). |
| Special Icons Map | Special Icons Map.rb | yes | `src/ui/pokegear/regionMap.ts`, `src/ui/hallOfFame/Credits.ts` |  |
| Speed Up 2.0 | 01_Speed_Up.rb | yes | `src/game/speedUp.ts` |  |
| TC Wardrobe | 001_main.rb | yes | `src/ui/scenes/Wardrobe.ts` | Checked line by line in this pass. |
| TC Wardrobe | 002_config.rb | yes | `src/ui/scenes/Wardrobe.ts` |  |
| TDW Debug List Search | TDW Debug List Search.rb | yes | `src/ui/hallOfFame/Credits.ts`, `src/ui/textEntry/keyboard.ts`, `src/debug/EditorListers.ts`, `src/debug/EditorUtilities.ts` |  |
| Triple Triad Booster Packs | TripleTriad_Binder.rb | yes | `src/minigames/TripleTriad.ts`, `src/minigames/TripleTriad_Binder.ts` |  |
| Triple Triad Booster Packs | TripleTriad_Booster_Packs.rb | yes | `src/minigames/TripleTriad_BoosterPacks.ts`, `src/game/items/pluginItems.ts` |  |
| Triple Triad Booster Packs | TripleTriad_Improvements.rb | yes | `src/minigames/TripleTriad.ts`, `src/minigames/TripleTriad_Improvements.ts` |  |
| Triple Triad Booster Packs | TripleTriad_ReceiveCard.rb | yes | `src/minigames/TripleTriad_ReceiveCard.ts` |  |
| Unown Report | Item_Unown_Report.rb | yes | `src/plugins/unownReport/index.ts`, `src/plugins/unownReport/ItemUnownReport.ts`, `src/game/items/pluginItems.ts` |  |
| Unown Report | Unown_Report_Mechanic.rb | yes | `src/plugins/unownReport/UnownReportMechanic.ts`, `src/plugins/unownReport/index.ts` | USE does nothing, as in Ruby. |
| Visible Overworld Wild Encounters | 001_visible overworld wild encounters script.rb | yes | `src/game/encounters/visibleEncounters.ts` |  |
| Visible Overworld Wild Encounters | 004_add_on_max_spawn.rb | yes | `src/game/encounters/visibleEncounters.ts` |  |
| Visible Overworld Wild Encounters | 005_add_on_additional_despawn_methods.rb | yes | `src/game/encounters/visibleEncounters.ts` |  |
| ZUD Mechanics | Settings.rb | yes | `src/data/gameData/settings.ts` |  |
| ZUD Mechanics | [000] General/Compiler.rb | yes | `src/compiler/WritePBS.ts` |  |
| ZUD Mechanics | [000] General/Debug.rb | yes | `src/battle/battle/Battle_StartAndEnd.ts`, `src/battle/zud/Debug.ts`, `src/game/maxRaid/Debug.ts`, `src/game/maxRaid/index.ts` |  |
| ZUD Mechanics | [000] General/Editors.rb | yes | `src/debug/editors/SpritePositioning.ts` |  |
| ZUD Mechanics | [000] General/Sprite.rb | yes | `src/battle/zud/scene/dynamaxSprite.ts`, `src/battle/scene/objects.ts` |  |
| ZUD Mechanics | [001] Data/Data_Item.rb | yes | `src/battle/items/ZUD_Data_Item.ts`, `src/battle/items/Item_BattleEffects.ts`, `src/battle/items/index.ts` |  |
| ZUD Mechanics | [001] Data/Data_Pokemon.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/battle/Battle_AttackPhase.ts`, `src/battle/battle/Battle_ActionAttacksPriority.ts`, `src/battle/battle/Battle_ActionOther.ts` |  |
| ZUD Mechanics | [001] Data/Data_PowerMove.rb | yes | `src/data/gameData/move.ts`, `src/data/gameData/powerMove.ts`, `src/compiler/WritePBS.ts` |  |
| ZUD Mechanics | [001] Data/Data_Species.rb | yes | `src/battle/scene/sceneFiles.ts` |  |
| ZUD Mechanics | [002] UI/UI_Pokedex.rb | yes | `src/ui/pokedex/pokedexEntry.ts` |  |
| ZUD Mechanics | [002] UI/UI_Summary.rb | yes | `src/ui/summary/pluginDisplays.ts`, `src/ui/summary/summary.ts` |  |
| ZUD Mechanics | [003] Battle/Battle.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/battle/Battle_AttackPhase.ts`, `src/battle/battle/Battle_ActionOther.ts`, `src/battle/battle/Battle_ActionSwitching.ts` |  |
| ZUD Mechanics | [003] Battle/Battle_AI.rb | yes | `src/battle/ai/Battle_AI.ts`, `src/battle/ai/AI_Move_EffectScores_ZUD.ts`, `src/battle/ai/AI_Item.ts`, `src/battle/ai/AI_Move.ts` |  |
| ZUD Mechanics | [003] Battle/Battle_Overrides.rb | yes | `src/battle/battle/Battle.ts`, `src/battle/battle/Battle_ActionAttacksPriority.ts`, `src/battle/battle/Battle_ActionSwitching.ts`, `src/battle/battle/Battle_StartAndEnd.ts` |  |
| ZUD Mechanics | [003] Battle/Battle_PBEffects.rb | yes | `src/battle/deluxe/Midbattle_Effects.ts`, `src/battle/other/PBEffects.ts`, `src/debug/DebugBattleExtraCode.ts` |  |
| ZUD Mechanics | [004] Battle_Battler/Battler.rb | yes | `src/battle/battler/Battler_ChangeSelf.ts`, `src/battle/battler/Battler_UseMoveSuccessChecks.ts`, `src/battle/battler/Battler.ts`, `src/battle/battler/Battler_UseMoveTriggerEffects.ts` |  |
| ZUD Mechanics | [004] Battle_Battler/Battler_MoveConversion.rb | yes | `src/battle/battler/Battler_ChangeSelf.ts`, `src/battle/zud/Battler_MoveConversion.ts`, `src/battle/zud/index.ts` |  |
| ZUD Mechanics | [004] Battle_Battler/Battler_Overrides.rb | yes | `src/battle/battler/Battler_ChangeSelf.ts`, `src/battle/battler/Battler_UseMoveSuccessChecks.ts`, `src/battle/battler/Battler.ts`, `src/battle/battler/Battler_Statuses.ts` |  |
| ZUD Mechanics | [005] Battle_Scene/Scene.rb | yes | `src/battle/deluxe/MegaEvolutionAnim.ts`, `src/battle/zud/scene/Scene_Animation_Dynamax.ts`, `src/battle/zud/scene/Scene_Animation_ZMove.ts`, `src/battle/zud/scene/Scene.ts` |  |
| ZUD Mechanics | [005] Battle_Scene/Scene_Animation_Dynamax.rb | yes | `src/battle/zud/scene/Scene_Animation_Dynamax.ts`, `src/battle/zud/scene/Scene.ts` |  |
| ZUD Mechanics | [005] Battle_Scene/Scene_Animation_MaxRaid.rb | yes | `src/battle/zud/raid/scene/Scene_Animation_MaxRaid.ts` |  |
| ZUD Mechanics | [005] Battle_Scene/Scene_Animation_UltraBurst.rb | yes | `src/battle/zud/scene/Scene_Animation_UltraBurst.ts`, `src/battle/zud/scene/Scene.ts` |  |
| ZUD Mechanics | [005] Battle_Scene/Scene_Animation_ZMove.rb | yes | `src/battle/zud/scene/Scene_Animation_ZMove.ts`, `src/battle/zud/scene/Scene.ts` |  |
| ZUD Mechanics | [005] Battle_Scene/Scene_PokemonDataBox.rb | yes | `src/battle/zud/raid/scene/index.ts`, `src/battle/zud/scene/Scene.ts`, `src/battle/scene/objects.ts` |  |
| ZUD Mechanics | [006] Battle_Move/Battle_Move.rb | yes | `src/battle/move/Move_UsageCalculations.ts`, `src/battle/move/Move.ts`, `src/battle/move/Move_Usage.ts`, `src/battle/zud/Battle_Move.ts` |  |
| ZUD Mechanics | [006] Battle_Move/Battle_PowerMove.rb | yes | `src/battle/zud/Battle_PowerMove.ts`, `src/battle/zud/index.ts` |  |
| ZUD Mechanics | [006] Battle_Move/PowerMove_BaseEffects.rb | yes | `src/battle/zud/PowerMove_BaseEffects.ts`, `src/battle/zud/index.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_BattleField.rb | yes | `src/battle/zud/MoveEffects_BattleField.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_BattleSides.rb | yes | `src/battle/zud/MoveEffects_BattleSides.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_BattlerEffects.rb | yes | `src/battle/zud/MoveEffects_BattlerEffects.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_BattlerStats.rb | yes | `src/battle/move/MoveEffects_BattlerStats.ts`, `src/battle/zud/MoveEffects_BattlerStats.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_BattlerStatus.rb | yes | `src/battle/zud/MoveEffects_BattlerStatus.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_Custom.rb | yes | `src/battle/zud/MoveEffects_Custom.ts` |  |
| ZUD Mechanics | [007] Move Effects/MoveEffects_Other.rb | yes | `src/battle/zud/MoveEffects_Other.ts` |  |
| ZUD Mechanics | [008] Overrides/Override_Abilities.rb | yes | `src/battle/abilities/DeluxeAndZUD.ts` |  |
| ZUD Mechanics | [008] Overrides/Override_Items.rb | yes | `src/battle/items/Battle_ItemEffects.ts`, `src/battle/items/ZUD_Override_Items.ts`, `src/battle/items/index.ts` |  |
| ZUD Mechanics | [008] Overrides/Override_Moves.rb | yes | `src/battle/move/MoveEffects_Healing.ts`, `src/battle/move/Move_BaseEffects.ts`, `src/battle/move/MoveEffects_BattlerOther.ts`, `src/battle/move/moveEffects.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Battle.rb | yes | `src/battle/other/CatchAndStoreMixin.ts`, `src/battle/zud/raid/Raid_Battle.ts`, `src/battle/zud/raid/Raid_Battle_EndOfRound.ts`, `src/battle/zud/raid/scene/index.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Battle_Battler.rb | yes | `src/battle/battler/Battler_UseMove.ts`, `src/battle/battler/Battler_Initialize.ts`, `src/battle/zud/raid/Raid_Battle_Battler.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Battle_Overrides.rb | yes | `src/battle/move/Move_UsageCalculations.ts`, `src/battle/battler/Battler_UseMoveTriggerEffects.ts`, `src/battle/battler/Battler_UseMove.ts`, `src/battle/zud/raid/Raid_Battle_Overrides.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Database.rb | yes | `src/game/maxRaid/Raid_Database.ts`, `src/game/maxRaid/index.ts`, `src/game/scripts/maxRaid.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Den_Event.rb | yes | `src/game/maxRaid/Raid_Den_Event.ts`, `src/game/maxRaid/index.ts`, `src/game/scripts/maxRaid.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Den_Scene.rb | yes | `src/game/maxRaid/Raid_Den_Scene.ts`, `src/game/maxRaid/index.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Mine.rb | yes | `src/game/maxRaid/Raid_Mine.ts`, `src/game/maxRaid/index.ts`, `src/game/scripts/maxRaid.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Ranks.rb | yes | `src/game/maxRaid/Raid_Ranks.ts`, `src/game/maxRaid/index.ts` |  |
| ZUD Mechanics | [009] Max Raid/Raid_Setup.rb | yes | `src/game/maxRaid/Raid_Setup.ts`, `src/game/maxRaid/Raid_Mine.ts`, `src/game/maxRaid/index.ts` |  |
| ZUD Mechanics | [010] Adventures/Adventure_Main.rb | yes | `src/battle/zud/raid/maxLairHooks.ts`, `src/game/maxLair/Adventure_Main.ts`, `src/game/maxLair/index.ts`, `src/game/scripts/maxRaid.ts` |  |
| ZUD Mechanics | [010] Adventures/Adventure_Triggers.rb | yes | `src/game/maxLair/index.ts`, `src/game/maxLair/Adventure_Triggers.ts` |  |
| ZUD Mechanics | [010] Adventures/LairMenu_Base.rb | yes | `src/game/maxLair/LairMenu_Base.ts`, `src/game/maxLair/index.ts` |  |
| ZUD Mechanics | [010] Adventures/LairMenu_Menus.rb | yes | `src/game/maxLair/index.ts`, `src/game/maxLair/LairMenu_Menus.ts` |  |
| ZUD Mechanics | [010] Adventures/MaxLair_Controls.rb | yes | `src/game/maxLair/MaxLair_Controls.ts`, `src/game/maxLair/index.ts` |  |
| ZUD Mechanics | [010] Adventures/MaxLair_Map.rb | yes | `src/game/maxLair/index.ts`, `src/game/maxLair/MaxLair_Map.ts` |  |
| v20.1 Hotfixes | Battle bug fixes.rb | yes | `src/battle/battle/Battle_EndOfRoundPhase.ts`, `src/battle/move/MoveEffects_Healing.ts`, `src/battle/move/MoveEffects_MoveAttributes.ts`, `src/battle/move/Move_Usage.ts` |  |
| v20.1 Hotfixes | Compiler bug fixes.rb | n/a | — | update_door_event fixes RPG Maker map compilation, which the web port doesn’t do (maps are JSON; see data.md). |
| v20.1 Hotfixes | Debug bug fixes.rb | yes | `src/debug/DebugMenuExtraCode.ts`, `src/debug/DebugMenuCommands.ts`, `src/debug/DebugPokemonCommands.ts` |  |
| v20.1 Hotfixes | Misc bug fixes.rb | yes | `src/ui/storage/PokemonStorageScene.ts`, `src/ui/evolution/Evolution.ts`, `src/ui/mart/PokemonMart.ts`, `src/game/daycare/DayCare.ts` |  |
| v20.1 Hotfixes | Overworld bug fixes.rb | yes | `src/scenes/SceneMap.ts`, `src/game/berries/BerryPlants.ts`, `src/game/utilities.ts`, `src/game/GamePlayer.ts` |  |

