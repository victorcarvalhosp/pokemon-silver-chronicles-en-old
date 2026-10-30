# Bugs in the original game kept by the port

The port copies the original Ruby (Essentials v20.1 + this game's plugins) as
it behaves, bugs included, so the tests can compare it with Ruby round by
round. Each bug below is marked in the TypeScript with a `NOTE (Ruby parity)`
or `Ruby bug` comment. Fixing one means changing the TypeScript **and**
applying the same change to the Ruby harness in `tools/ruby-ref` (see
`patch_ability_handler` in `ability_reference.rb`), then adding a scenario
where the fix shows.

Already fixed on purpose: Pokémon Amie's feeding crash (22 foods), the happiness soft-cap crash, the Gen 9 Pack Sun
multiplier, and Cotton Down, Bad Dreams, Forewarn, Magician, Mummy/Lingering
Aroma, Neutralizing Gas, Opportunist and Synchronize. Event crashes, fixed in
the event data with the v20.1 names (`src/game/scripts/eventFixes.test.ts`):
`PBSpecies::X` (common events 2 and 7, Cinnabar Lab's trades on Map 516, the
Name Rater's `PBSpecies.getName`, and Maps 199, 207, 473, 676, 766) is now the
species ID; the Marts and the item on Maps 204, 218, 312, 357, 559, 568, 756,
784, 820, 822, 828 use POKEBALL, PARALYZEHEAL, XDEFENSE, XSPATK and POKEDOLL;
the Day Care (Map 440) uses `steps_to_hatch` and `DayCare.reset_egg_counters`
instead of `eggsteps` and `$PokemonGlobal.daycareEgg`; the Name Rater uses
`foreign?`; the Move Deleter (Maps 314, 758) uses `numMoves` and
`forget_move_at_index`; the Map 704 trade gives DARUMAKA_2 (Galarian, form 2
here) instead of the missing DARUMAKA_1; common events 2 and 7 use
`$player.has_species?` (v20 has no `pbHasSpecies?`). In TypeScript: common
events 2, 5, 6, 7 compact the party after the loop, so no Pokémon is skipped
(`storePartySpecies`); common event 32 opens v20's Hall of Fame entry screen
(`callHallOfFameCommonEvent`) and Map 438 v20's load screen (`startLoadScreen`)
instead of the v16 classes. Fillet Away and Chilly Reception always failed
because their PBS function codes named no class: `PBS/moves.txt` now says
`RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP` and `SwitchOutUserStartHailWeather`
(the Gen 9 Pack AI's cases use the new codes; `src/battle/gen9FunctionCodeFix.test.ts`).

Battles carry on after an error, as in the original (`PBDebug.logonerr`), so
the crashes below cut a move or a round short instead of stopping the game.

## Crashes and hangs

| Bug | Original | Port |
|---|---|---|
| Fury Cutter loops forever when its power is 0 | `011_Battle/003_Move/008_MoveEffects_MoveAttributes.rb:336` | `src/battle/move/MoveEffects_MoveAttributes.ts:434` |
| Jaboca Berry: undefined `battler` (NameError) | `011_Battle/006_Other battle code/009_Battle_ItemEffects.rb:1321` | `src/battle/items/Battle_ItemEffects.ts:1180` |
| Rowap Berry: undefined `battler` (NameError) | `009_Battle_ItemEffects.rb:1391` | `src/battle/items/Battle_ItemEffects.ts:1253` |
| Revival Blessing crashes on an empty party slot | Gen 9 Pack `[002] Moves/[001] New Move Functions.rb:857` | `src/battle/move/MoveEffects_Gen9NewMoveFunctions.ts:944` |
| Mold Breaker-type moves with no target crash (`targets[0]` unchecked) | Gen 9 Pack `[002] Moves/[000] Move Functions.rb:481` | `src/battle/move/MoveEffects_BattlerOther.ts:1472` |
| Powder's self-damage path: undefined `battler` (NameError) | `011_Battle/002_Battler/007_Battler_UseMove.rb` | `src/battle/battler/Battler_UseMove.ts:402` |
| AI: Surging Strikes / Wicked Blow at skill 48+ read undefined `targets` | `011_Battle/005_AI/007_AI_Move_EffectScores_3.rb:390` | `src/battle/ai/AI_Move_EffectScores_3.ts` |
| AI: moves that can't be redirected call `pbCalcType` without its argument (foe with Lightning Rod / Storm Drain) | `007_AI_Move_EffectScores_3.rb:938-939` | `src/battle/ai/AI_Move_EffectScores_3.ts` |
| AI: switching in on low HP with Spikes up calls a missing `hasActiveAbility?` | `011_Battle/005_AI/003_AI_Switch.rb:107` | `src/battle/ai/AI_Switch.ts` |
| AI: item checks pass the AI instead of the battle to `CanUseInBattle` (Poké Flute, Z-Crystals, Dynamax items would fail) | `002_AI_Item.rb:57`, Gen 9 Pack `[003] Battle_AI.rb:46` | `src/battle/ai/AI_Item.ts` |
| Commander needs the real scene's sprites | Gen 9 Pack `[003] Abilities/[001] New Ability Handlers.rb:362` | `src/battle/abilities/Gen9_NewAbilityHandlers.ts` |

## Gameplay

### Moves
| Bug | Original | Port |
|---|---|---|
| Take Heart cures status but never raises stats | Gen 9 Pack `[001] New Move Functions.rb:229` | `src/battle/move/MoveEffects_Gen9NewMoveFunctions.ts:263` |
| Simple Beam works on Truant/Simple targets (Symbol vs GameData check never true) | `007_MoveEffects_BattlerOther.rb:960` | `src/battle/move/MoveEffects_BattlerOther.ts:1140` |
| Secret Power: flinch check true for 6/10/12 instead of 7/11/13 | `012_MoveEffects_ChangeMoveEffect.rb:204` | `src/battle/move/MoveEffects_ChangeMoveEffect.ts:256` |
| Secret Power uses the misspelt animation `CONFUSIO` | `012_MoveEffects_ChangeMoveEffect.rb:295` | `src/battle/move/MoveEffects_ChangeMoveEffect.ts:375` |
| Shell Side Arm: tie-break category written to misspelt `@calcCategry`, never used | `008_MoveEffects_MoveAttributes.rb:1158` | `src/battle/move/MoveEffects_MoveAttributes.ts:1304` |
| Tailwind checks Wind Rider / Wind Power on the player's side only | Gen 9 Pack `[000] Move Functions.rb:231` | `src/battle/move/MoveEffects_BattlerStats.ts:2114` |
| Rapid Spin: the core's early return doesn't skip Steelsurge removal | ZUD `Override_Moves.rb:152-157` | `src/battle/move/MoveEffects_Misc.ts:663` |
| Defog only clears Steelsurge on the target's opposing side | ZUD `Override_Moves.rb:170` | `src/battle/move/MoveEffects_BattlerStats.ts:1336` |
| Salt Cure doesn't check for an existing Salt Cure (message repeats) | Gen 9 Pack `[001] New Move Functions.rb:441` | `src/battle/move/MoveEffects_Gen9NewMoveFunctions.ts:497` |
| Shed Tail: integer division makes `.ceil` do nothing | Gen 9 Pack `[001]:755` | `src/battle/move/MoveEffects_Gen9NewMoveFunctions.ts:834` |
| Doodle's message names the user for every ally | Gen 9 Pack `[001]:837` | `src/battle/move/MoveEffects_Gen9NewMoveFunctions.ts:920` |
| Instruct on a Dynamaxed target reads the last move (`moves[-1]`) | `013_MoveEffects_SwitchingActing.rb:609-613` | `src/battle/move/MoveEffects_SwitchingActing.ts` |
| Perish Song in a raid fails without a message | ZUD `Override_Moves.rb:422` | `src/battle/move/MoveEffects_Healing.ts:744` |
| Raging Bull's type display never fires (checks the wrong function code) | Gen 9 Pack | `src/battle/move/` |
| Hidden Power ORs its power bits into 60 (Gen ≤5 only; inactive here) | `008_MoveEffects_MoveAttributes.rb:1339` | `src/battle/move/MoveEffects_MoveAttributes.ts:1522` |
| Obstruct is in the Assist and Copycat blacklists twice (harmless) | v20.1 Hotfixes `Battle bug fixes.rb:44/52` | `src/battle/move/MoveEffects_ChangeMoveEffect.ts:846, 1231` |
| Dragon Darts designates `[nil]` with no valid targets | `009_MoveEffects_MultiHit.rb:64` | `src/battle/move/MoveEffects_MultiHit.ts:87` |

### Battle core
| Bug | Original | Port |
|---|---|---|
| The "of Ruin" abilities change a local copy, so they do nothing | Gen 9 Pack `[001] Battle/[001] Battle.rb` | `src/battle/move/Move_UsageCalculations.ts:350` |
| Under Clauses, Sheer Cold loses its own Ice-type immunity check | `006_Battle_Clauses.rb` | `src/battle/other/Clauses.ts:177` |
| Deluxe scripted-mechanic rules for Player/Foe never apply | Essentials Deluxe | `src/battle/battle/` |
| `usedInBattle` is indexed by battler slot, not party index (pbSendOut, pbFaint) | `011_Battle/001_Battle` | `src/battle/battle/` |
| Judgment with a Legend Plate: `pbGetBestTypeJudgment` isn't ported (throws) | Gen 9 Pack `[006] Legend Plate Functions.rb:34` | not ported |

### AI
| Bug | Original | Port |
|---|---|---|
| Charging moves and Hyper Beam estimated at 0 damage (`realDamage *= 2 / 3`, integer division) | `004_AI_Move.rb:271`, Improved AI | `src/battle/ai/AI_Move.ts` |
| A frozen target penalises the move whenever the user knows any non-thawing move | `004_AI_Move.rb:244` | `src/battle/ai/AI_Move.ts` |
| Switch-in matchups judged against the Pokémon switching out | `003_AI_Switch.rb:110,118` | `src/battle/ai/AI_Switch.ts` |
| Stat-lowering moves read the user's stages: LowerTargetSpAtk1, LowerTargetSpeed1, LowerPoisonedTargetAtkSpAtkSpd1, the Grass-ally boosts; RaiseUserAndAlliesAtkDef1 checks "can lower" | `005_AI_Move_EffectScores_1.rb:1028, 1046, 1148, 1254-1256, 1267-1275, 1321-1322, 1336` | `src/battle/ai/AI_Move_EffectScores_1.ts:1136, 1265, 1382, 1396, 1460, 1478` |
| Mimic/Sketch compare a Move with a Symbol (always unequal) | `007_AI_Move_EffectScores_3.rb:1106-1130` | `src/battle/ai/AI_Move_EffectScores_3.ts` |
| `user.hp < user.hp / 2` is never true | `007_AI_Move_EffectScores_3.rb:1348` | `src/battle/ai/AI_Move_EffectScores_3.ts:1619` |
| Improved AI replaces `pbCheckMoveImmunity` without aliasing, dropping Gen 9's immunities (Commander, Well-Baked Body, Wind Rider, Good as Gold, Dazzling/Queenly Majesty/Armor Tail) | Improved AI; Gen 9 Pack `[003] Battle_AI.rb:118` | `src/battle/ai/AI_Move_Utilities.ts` |
| Gen 9 `pbRoughDamage`: ability blacklists compare a move ID with ability IDs; Ruin multipliers change a local copy; Drowsy bonus checks the user; `GemConsumed` cleared as a side effect | Gen 9 Pack `[003] Battle_AI.rb` | `src/battle/ai/AI_Move_Utilities.ts` |
| `[:TRUANT, …].include?(target.ability)` always false | Gen 9 Pack `[004] Battle_AI_Move_EffectScores.rb:79, 109`; `006:427` | `src/battle/ai/` |
| Skill Swap checks the user's Ability Shield twice | Gen 9 Pack `[004]:128` | `src/battle/ai/AI_Move_EffectScores_Gen9.ts` |
| Revival Blessing bonus is 0 unless the whole party fainted (integer division) | Gen 9 Pack `[004]:566` | `src/battle/ai/AI_Move_EffectScores_Gen9.ts` |
| Look inverted, kept as written: Chilly Reception (`[004]:515`), DrowseTarget checking `pbCanSleep?` (`[004]:166`), Speed Swap's bonus (`005:1479`) | | `src/battle/ai/` |

### Items
| Bug | Original | Port |
|---|---|---|
| Micle Berry never triggers (inverted check) | `009_Battle_ItemEffects.rb:350` | `src/battle/items/Battle_ItemEffects.ts:190` |
| Rotom Catalog: the Light bulb never returns Rotom to its base form (`new_form > 0`) | `013_Items/002_Item_Effects.rb:1217` | `src/game/items/Item_Effects.ts` |
| Gen 9 status heals: on Drowsy/Frostbite, "It won't have any effect." then used anyway; on neither, the message twice | Gen 9 Pack `[004] Items/[000] Item Handlers.rb:116-117, 127-128, 171-172` | `src/battle/items/Gen9_ItemHandlers.ts` |
| Max Eggs: one Pokémon's Exp. cap carries over to the rest of the party | ZUD `[001] Data/Data_Item.rb:298` | `src/battle/items/ZUD_Data_Item.ts` |
| Dire Hit sets Focus Energy to 2 but refuses at 1 or more | `013_Items/003_Item_BattleEffects.rb:261-275, 686-695` | `src/battle/items/Item_BattleEffects.ts` |
| Ether's `move < 0` would raise on nil (unreachable) | `003_Item_BattleEffects.rb:153` | `src/battle/items/Item_BattleEffects.ts` |

### Abilities
| Bug | Original | Port |
|---|---|---|
| Cursed Body (ZUD) hides the splash twice and swaps user/target for `pbMoveFailedAromaVeil?` | ZUD `Override_Abilities.rb` | `src/battle/abilities/DeluxeAndZUD.ts` |

## Messages shown when they shouldn't be
These ignore `show_message`, so a message can appear during a silent check:
Poltergeist (`005_MoveEffects_Misc.rb:140`), Yawn (`007:62`), the Ability
Shield message of Skill Swap / Entrainment / Worry Seed / Simple Beam / Gastro
Acid (Gen 9 Pack `[000] Move Functions.rb:385-456`), Transform's Dynamax
check (ZUD `Override_Moves.rb:249`), Encore's Z-Move check (ZUD
`Override_Moves.rb:388-391`), Spicy Extract (Gen 9 Pack `[001]:503`). Also
"Safeguard!!" with a double "!" (`006_MoveEffects_BattlerStats.rb:1242`).

## PC storage and Poké Marts
| Bug | Original | Port |
|---|---|---|
| League regulations (HOENN_SWITCH on): Place into the party checks the empty party slot instead of the held Pokémon, so placing there is always refused | `016_UI/017_UI_PokemonStorage.rb:1826` | `src/ui/storage/PokemonStorageScreen.ts` (`pbPlace`) |
| setPrice / setSellPrice store the sell price doubled for a halving the v20.1 Hotfixes removed, so it sells for twice the given price (a buy price alone sells at the full buy price) | `003_Interpreter.rb:455-458`, Hotfixes `Misc bug fixes.rb:384` | `src/ui/mart/PokemonMart.ts` (`setPrice`) |

## Pokémon lifecycle (evolution, eggs, Day Care, trades, Hall of Fame, berry plants)
| Bug | Original | Port |
|---|---|---|
| The evolution screen is ended twice when a new species' Pokédex entry is shown and no move is learnt (inside the entry's fade, then by the caller): an extra invisible fade-out and a second follower refresh | `016_UI/001_Non-interactive UI/004_UI_Evolution.rb:525` | `src/ui/evolution/Evolution.ts` (`pbEndScreen`) |
| The trade screen is ended twice the same way, so the trade evolution check runs twice | `005_UI_Trading.rb:208`, `:233` | `src/ui/trading/Trading.ts` (`pbEndScreen`) |
| SpriteMetafile#color= records the object it keeps, so changing `color.alpha` afterwards also changes the recorded frame (the white fade is a frame ahead) | `004_UI_Evolution.rb:222-225` | `src/ui/evolution/Evolution.ts` (`SpriteMetafile`) |
| pbHatch's text-only fallback calls pbCustomEventsAfterHatch, which this game defined on the scene class (NoMethodError); unreachable since pbHatchAnimation always returns true | `003_UI_EggHatching.rb:245` | `src/ui/hatching/EggHatching.ts` (`pbHatch`) |
| Hall of Fame: `if $player.halloffame = []` assigns, so every entry overwrites the stored first-entry time | Mr. Gela's HGSS Trainer Card Scene `:76` | `src/ui/hallOfFame/HallOfFame.ts` (`writeTrainerData`) |
| Day Care OW Pokémon: the message shows the species ID ("PIKACHU") instead of its name; a species without a follower sprite crashes (`gsub!` on nil) | DayCare Overworld Pokemon `:66`, `:24` | `src/game/daycare/DayCareOverworld.ts` |
| Berry plant events have Direction Fix on, so `turn_left/right/up` never change the plant's frame: every stage after planting looks like the sprout | map events named BerryPlant (e.g. Map 203 EV6, page 2) | `src/game/berries/BerryPlants.ts` (`setEventGraphic`) |
| PLANT_SPARKLE_ANIMATION_ID is 7, which is "Move:FIREPUNCH" in this game's Animations, so a Fire Punch plays on the plant at each growth stage | `001_Settings.rb:388`, `Data/Animations.rxdata` | `src/game/berries/BerryPlants.ts` |

## Essentials Deluxe midbattle scripts and deluxe battles
No event in this game starts a deluxe battle, so these only show in scripts
written for one (`web/src/battle/deluxe`).

| Bug | Original | Port |
|---|---|---|
| `:teracharge` sets `$player.tera_charged`, which only exists with the Terastal Phenomenon plugin: NoMethodError (the preset DEMO_VS_SADA_PHASE_2 hits it) | `[002] Battle Deluxe/Midbattle_Main.rb:176` | `src/battle/deluxe/Midbattle_Main.ts` (`dxMidbattle`) |
| A speech after a loss in a wild battle reads `@battle.opponent[...]` (nil): NoMethodError | `Midbattle_Main.rb:229-231` | `src/battle/deluxe/Midbattle_Main.ts` (`speakerFor`) |
| `:status => [:TOXIC, true]`: pbInflictStatus checks `msg.empty?` on true: NoMethodError | `Midbattle_Main.rb:960`, `004_Battler_Statuses.rb:231` | `src/battle/deluxe/Midbattle_Main.ts` (`midbattleChangeStatus`) |
| `@midbattle_var.round` doesn't assign (a `:div`/`:mult` by a Float leaves a Float) | `Midbattle_Main.rb:457` | `src/battle/deluxe/Midbattle_Main.ts` (`midbattleSetVariable`) |
| `:bgm => [name, fade]` waits `fade * 60` frames of 40 fps after a fade given in seconds (1.5 times as long) | `Midbattle_Main.rb:472` | `src/battle/deluxe/Midbattle_Main.ts` (`midbattleChangeBGM`) |
| Move triggers pass the move's target index, -1 for moves without a single target, so `:Opposing` then picks `@battle.battlers[-1]` (the last battler) | `Midbattle_Triggers.rb:280`, `Midbattle_Main.rb:431` | `src/battle/deluxe/Midbattle_Main.ts` (`rubyAt`) |
| The Generation 9 Pack's additions to `$DELUXE_BATTLE_EFFECTS` (BoosterEnergy, DoubleShock, SaltCure, CudChew, GlaiveRush, Splinters, SupremeOverlord) never apply: it loads before Essentials Deluxe | Gen 9 Pack `[001] Battle/[000] PBEffects.rb:28-31` | `src/battle/deluxe/Midbattle_Effects.ts` |
| `[:environ]` rule: pbSetBackdrop sets the base if the backdrop exists and the backdrop if the base exists (checks swapped) | `[002] Battle Deluxe/Battle_Deluxe.rb:518-519` | `src/battle/deluxe/Battle_Deluxe.ts` (`pbSetBackdrop`) |
| Wild `:hp` setting: `(hp / n).ceil` divides Integers, so the `.ceil` does nothing | `Battle_Deluxe.rb:657` | `src/battle/deluxe/Battle_Deluxe.ts` (`pbApplyWildAttributes`) |

## ZUD Mechanics: Z-Moves, Ultra Burst, Dynamax (`web/src/battle/zud`)
| Bug | Original | Port |
|---|---|---|
| Light That Burns the Sky has function code `ZUDPhotonGeyser`, but the class is `ZUDPhotonGeyserEffect`: it's a plain damaging Z-Move (no Ability ignoring, no physical/special choice) | `PBS/moves.txt`, ZUD `[007] Move Effects/MoveEffects_Other.rb:30` | `src/battle/zud/MoveEffects_Other.ts` |
| G-Max Drum Solo/Fireball/Hydrosnipe, Searing Sunraze Smash, Menacing Moonraze Maelstrom and Guardian of Alola subclass Battle::Move classes, not Battle::PowerMove: they hit through Protect for full damage (no "couldn't fully protect"), and -ate Abilities retype them | `MoveEffects_Other.rb:22`, `:37` | `src/battle/zud/MoveEffects_Other.ts` |
| G-Max Depletion reads `b.moves[b.power_index]`; power_index is -1 unless the foe used a Power Move this round, so it drains the foe's last move | `MoveEffects_Other.rb:92`, `:98` | `src/battle/zud/MoveEffects_Other.ts` (`rubyAt`) |
| Power Move effects pass showMsg as pbInflictStatus/pbPoison's message: with true, `msg.empty?` raises NoMethodError (only status Power Moves that inflict statuses, none in PBS) | `[006] Battle_Move/PowerMove_BaseEffects.rb:355`, `:360` | `src/battle/zud/PowerMove_BaseEffects.ts` |
| pbFailureCheckGeneral reads an undefined `field` (NameError) when a non-targeting status Power Move sets @field (none in PBS) | `PowerMove_BaseEffects.rb:281-284` | `src/battle/zud/PowerMove_BaseEffects.ts` |
| Trinity Pledge's foe-side key is `:opposing` (not `:opponents`): applying it raises NoMethodError (not in PBS) | `MoveEffects_Custom.rb:67` | `src/battle/zud/MoveEffects_Custom.ts` |
| 10,000,000 Volt Thunderbolt can't be used: its species list is "PIKACHU forms above 7", which don't exist here, so it compiles to `[nil]` | `PBS/power_moves.txt` | data (`zudReference.test.ts` lists it as unreachable) |
| End of round while Dynamaxed: `move = battler.convert_maxmove(move)` only reassigns the block variable, so newly learnt moves aren't converted | `[003] Battle/Battle_Overrides.rb:240-244` | `src/battle/battle/Battle_EndOfRoundPhase.ts` |
| AI: if the AI switches while it could use a Z-Move, `choices[2]` is nil: NoMethodError, and the Z-Moves it added stay in its moves | `[003] Battle/Battle_AI.rb:75` | `src/battle/ai/AI_Move.ts` |
| AI: the G-Max Wind Rage score is under `"ZUDRemoveSideEffects"`, a code no move has | `Battle_AI.rb:499` | `src/battle/ai/AI_Move_EffectScores_ZUD.ts` |
| AI: Max Flutterby (damaging) scores the foes' Attack stages instead of Sp. Atk | `Battle_AI.rb:276` | `src/battle/ai/AI_Move_EffectScores_ZUD.ts` |

## Field moves, vehicles and stairs (`web/src/game/field`)
| Bug | Original | Port |
|---|---|---|
| Whirlpool's CanUseMove looks for events named "whirlpooltree", but the game's whirlpools are named "redemoinho": Whirlpool from the party menu / Ready Menu always says "You can't use that here." (facing one and pressing the button works) | `Pokemon Silver Chronicles Helpers/Whilrpool HM.rb:23` | `src/game/field/Whirlpool.ts` |
| Headbutt's UseMove handler ends without `next true`, so pbUseHiddenMove returns nil | `012_Overworld/004_Overworld_FieldMoves.rb:620-627` | `src/game/field/FieldMoves.ts` |
| pbHeadbuttEffect with no event in front of the player raises NoMethodError (`event.x`) | `004_Overworld_FieldMoves.rb:570` | `src/game/field/FieldMoves.ts` |
| Following Pokemon EX's field-move animation for the follower never plays: nothing passes `field_move = true` to pbHiddenMoveAnimation | Following Pokemon EX `Script Additions/Animations.rb:6-36` | `src/game/field/hiddenMoveAnimation.ts` |
| Fly from the party / Ready Menu (Fly Animation's handler) doesn't dismount the Bicycle, unlike the core's pbFlyToNewLocation | `Fly Animation/[003]HM Handlers.rb` | `src/game/field/FlyAnimation.ts` |
| Marin's Enhanced Staircases replaces Side Stairs Tiles' Game_Player#move_generic, so the player never takes Boonzeet's diagonal stair steps (no tileset uses the StairLeft/StairRight tags anyway) | `Marin's Enhanced Staircases/script.rb:162` | `src/game/field/EnhancedStaircases.ts`, `SideStairs.ts` |
| A "Slope" event without an "Offset:" (or "Width:") comment hands nil to slope() for what's missing | `Marin's Enhanced Staircases/script.rb:136` | `src/game/field/EnhancedStaircases.ts` (`getStairData`) |
| Cable car going down: the player's graphic is chosen by switch 140, not by gender (the gender check is commented out) | `Cable Car/Script.rb:203-205` | `src/game/field/CableCar.ts` |
| Fly Animation's NPC version (Gen 4 bird) arcs by height / 3 instead of / 4 | `Fly Animation/[004]Fly Animation Other Players.rb:63,66` | `src/game/field/FlyAnimation.ts` |
| Waterfall: pbAscendWaterfall / pbDescendWaterfall set `move_speed = 2`, but each step's `update_move` calls `set_movement_type(:surfing)`, which puts it back to 4: waterfalls go by at surfing speed | Following Pokemon EX `Script Additions/Field Moves.rb:130-178`, v20.1 Hotfixes `Overworld bug fixes.rb:105` | `src/game/field/followingFieldMoves.ts` |
| Waterfall: Following Pokemon EX's pbHiddenMoveAnimation gives the follower a 3-second Wait route that outlasts the ~2-second banner, so it is still on it during the climb (`follow_leader` returns early): the follower stays at the foot of the waterfall until the next step | Following Pokemon EX `Script Additions/Animations.rb:8` | `src/game/field/hiddenMoveAnimation.ts` |
| pbAscendWaterfall loops forever when the waterfall runs off the top of the map (`move_up` fails, the tile stays a waterfall); Seafoam Islands B3F (map 451) has one, but no transfer leads to that map | Following Pokemon EX `Script Additions/Field Moves.rb:139-148` | `src/game/field/followingFieldMoves.ts` |

## Overworld visuals and map plugins (`web/src/game/weather`, `web/src/sprites`)
| Bug | Original | Port |
|---|---|---|
| Particle effects only follow page changes for events that had one when the map loaded: an event whose first active page has no "Particle Engine Type" comment never gets its effect (the Super Arena's fires on maps 347/735 appear only after re-entering) | `005_Sprites/010_ParticleEngine.rb:88-89` | `src/sprites/ParticleEngine.ts` |
| Particle_Engine#remove_effect uses `delete_at`, shifting every later effect off its event's slot (only reached before any effect exists) | `010_ParticleEngine.rb:54` | `src/sprites/ParticleEngine.ts` |
| Dynamic shadows: an event with a "begin Shadow" comment gets a Sprite_Shadow per source, each built from the whole source list, so its first update raises NoMethodError (no event of this game has one); an empty comment line after "begin Shadow Source" raises too | `005_Sprites/009_Sprite_DynamicShadows.rb:139,236` | `src/sprites/SpriteCharacter.ts`, `SpriteDynamicShadows.ts` |
| RPG::Weather: fading from a tiled weather (blizzard/sandstorm/fog) to one without tiles reads the new type's missing tile bitmap if `@fade_time` lands exactly on the 2-second threshold (never does at 40 or 60 fps) | `012_Overworld/001_Overworld visuals/001_Overworld_Weather.rb:315-320` | `src/game/weather/Weather.ts` |
| LocationWindow never disposes the viewport it makes for its window (one empty viewport leaks per signpost) | `002_Overworld_Overlays.rb:10` | `src/game/weather/Overlays.ts` |
| Map Zoom: the snapshot it zooms is the whole screen under it, so the Photographer's camera frame (viewport z 99) is zoomed in with the map; only `$game_temp.cmd_window` is hidden from it (the speech bubble's pbCreateMessageWindow and DP Pause Menu replace the plugin's versions that would record the message window and pause menu) | `Plugins/Map Zoom/Map Zoom.rb:24-37` | `src/game/weather/MapZoom.ts` |
| Photographer: a party member without an overworld (follower) sprite makes `fname.gsub!` raise; pbPhotographWithPartner doesn't check that the follower exists | `Plugins/Photographer/Photographer.rb:26,267` | `src/game/weather/Photographer.ts` |
| RPG::Sprite#loop_animation always raises NoMethodError: SpriteAnimation#loop_animation reads the frame rate from `@_animation.name` (the one-shot animation, nil in the SpriteAnimation RPG::Sprite makes for a loop) instead of `@_loop_animation`'s (nothing in this game calls it) | `001_Technical/006_RPG_Sprite.rb:70` | `src/sprites/SpriteAnimation.ts` (loopAnimation) |

## Trainer battles, battle intros and special battle types (`web/src/game/battle`, `web/src/game/trainers`)
| Bug | Original | Port |
|---|---|---|
| SafariBattle never sets `@internalBattle`, so its pbSetSeen/pbSetCaught always return early (Safari catches still get "owned" from the catch code) | `011_Battle/007_Other battle types/001_SafariBattle.rb:303,313` | `src/game/battle/safari.ts` |
| A Safari battle's outcome handed to `:on_calling_wild_battle` is the decision number, not a boolean | `018_Alternate battle modes/001_SafariZone.rb:118` | `src/game/battle/safari.ts` |
| Bug Contest: pbEnd after an interrupted contest (flying out before judging) calls `place` on empty `@places` (NoMethodError) | `018_Alternate battle modes/002_BugContest.rb:262` | `src/game/battle/bugContest.ts` |
| Bug Contest battles skip pbSceneStandby (the map's sprites stay alive under the battle) | `002_BugContest.rb:390` | `src/game/battle/bugContest.ts` |
| `roamPokemonCaught` returns a fresh `[]` when unset and nothing sets it, so a defeated roamer is never reset by pbResetAllRoamers | `012_Overworld/002_Battle triggering/005_Overworld_RoamingPokemon.rb:7,221` | `src/game/battle/roaming.ts` |
| Roaming encounter check reads `$PokemonGlobal.roamPokemon`/`roamPosition`, nil until a map with a new name is entered | `005_Overworld_RoamingPokemon.rb:153` | `src/game/battle/roaming.ts` |
| pbRoamingPokemonBattle reads `pkmn.species` on what may be a species symbol | `005_Overworld_RoamingPokemon.rb:226` | `src/game/battle/roaming.ts` |
| Battle Palace: `defpercent` already includes `atkpercent`, which is added again, so defense moves are picked more often than the tables say | `003_BattlePalaceBattle.rb:122` | `src/game/battle/battlePalace.ts` |
| Battle Palace AI: switching to the healthiest Pokémon returns before `@justswitched` is recorded | `003_BattlePalaceBattle.rb:229` | `src/game/battle/battlePalace.ts` |
| Battle Arena: pbRecordBattlerAsActive calls a `super` that doesn't exist (dead code) | `004_BattleArenaBattle.rb:95` | `src/game/battle/battleArena.ts` |
| Battle Arena: the round counter is never reset after a replacement, so after the first judgment every round is judged | `004_BattleArenaBattle.rb:148` | `src/game/battle/battleArena.ts` |
| RecordedBattleModule#pbGetTrainerInfo's single-trainer branch reads an undefined `i` (never reached) | `005_RecordedBattle.rb:40` | `src/game/battle/recordedBattle.ts` |
| PlaybackHelper.pbGetBattleBGM calls a missing `pbGetTrainerBattleBGM`, so pbPlayBattle / pbPlayLastBattle always raise | `005_RecordedBattle.rb:264` | `src/game/battle/recordedBattle.ts` |
| pbRegisterPartner with a trainer that doesn't exist raises NoMethodError on `trainer.party` | `012_Overworld/001_Overworld.rb:717` | `src/game/trainers/trainerEvents.ts` |
| VSEliteFour never checks the player's `vsE4_` sprite; the alternate (Luka S.J.) VS intro never checks the player's `vsBar_`/`vsTrainer_` graphics (none exist here, so it never plays) | `009_Scenes/001_Transitions.rb:1448`; `002_Overworld_BattleIntroAnim.rb:289-296` | `src/game/battle/transitions.ts`, `BattleIntroAnim.ts` |
| ThreeBallDown places its black squares for a zoom it never applies (invisible: the zoom is 1) | `001_Transitions.rb:866-867` | `src/game/battle/transitions.ts` |

## Debug menus, editor helpers and PBS writers (`web/src/debug`, `web/src/compiler`)

Only reachable in Debug mode (the dev server, or `?debug=1`).

| Bug | Original | Port |
|---|---|---|
| Set Player Character: `break` inside the proc raises LocalJumpError (only with a single player character; this game has 6) | `020_Debug/003_Debug menus/002_Debug_MenuCommands.rb:842` | `src/debug/DebugMenuCommands.ts:1011` |
| Day Care "Set to other value": the number prompt defaults to the step counter, not the steps left (256 − counter) | `003_Debug_MenuExtraCode.rb:312` | `src/debug/DebugMenuExtraCode.ts:434` |
| Roaming Pokémon: the `roamPokemonCaught` writes go to a throwaway array, so a roamer never becomes "caught" | `012_Overworld/005_Overworld_RoamingPokemon.rb:8`, v20.1 Hotfixes `Debug bug fixes.rb:378-387` | `src/debug/DebugMenuExtraCode.ts:630` |
| Import Animations: `missingFiles` records the name after clearing it (`""`) | `003_Debug_MenuExtraCode.rb:672-673, 679-680` | `src/debug/DebugMenuExtraCode.ts:897, 905` |
| `pbCheckTileValidity`: tile IDs 1-47 read `autotile_names[-1]` (the last autotile) | `003_Debug_MenuExtraCode.rb:759-760` | `src/debug/DebugMenuExtraCode.ts:1129` |
| PokemonDebugPartyScreen#pbConfirm starts its result as -1 (harmless: every way out sets a boolean) | `003_Debug_MenuExtraCode.rb:820` | `src/debug/DebugMenuExtraCode.ts:1196` |
| Pokémon Debug "Set form": the cursor starts at the form *number* used as a list index (wrong row for species whose forms skip numbers) | v20.1 Hotfixes `Debug bug fixes.rb:291` (`007_Debug_PokemonCommands.rb:772`) | `src/debug/DebugPokemonCommands.ts:773` |
| Battle Debug "Set status" (Gen 9 Pack): Drowsy's default count is always 3, and on a battler `Battler#status=` then resets the chosen Drowsy count to 0 | Gen 9 Pack `[000] General/[002] Debug.rb:110-118`, `011_Battle/002_Battler/001_Battle_Battler.rb:113` | `src/debug/DebugBattlePkmnCommands.ts:106` |
| ZUD's ZHeal is initialised on sides but used on positions, so the battle effects editor shows it blank until toggled | ZUD `[003] Battle/Battle_Overrides.rb:13`, `Battle_PBEffects.rb:39` | `src/debug/DebugBattleExtraCode.ts:249` |
| `pbAllocateAnimation` resizes the list to 10 whatever its length (with 10+ animations the returned slot doesn't exist; Import Animations cuts the list to 10) | `020_Debug/001_Editor_Utilities.rb:57` | `src/debug/EditorUtilities.ts:131` |
| `pbChooseMoveListForSpecies`: an illegal (or first legal) default move's row is counted without the legal list's length, so the cursor starts on the wrong move | `001_Editor_Utilities.rb:187-191` | `src/debug/EditorUtilities.ts:300` |
| List screens: `list.index = list.commands.length if list.index == list.commands.length` does nothing (meant length − 1) | `003_Editor_Listers.rb:91-93, 99-101`, TDW Debug List Search `:151, :165` | `src/debug/EditorListers.ts:211, 230` |
| MetadataLister uses `@commands.length + 1` while `@commands` is still empty: the cursor always starts on the first player | `003_Editor_Listers.rb:258` | `src/debug/EditorListers.ts:451` |
| TDW Debug List Search: searching within search results maps entries to the wrong IDs (`@ids` was already narrowed) | `TDW Debug List Search.rb:189-191, 210-212, 231-233, 252-254` | `src/debug/EditorListers.ts:246` |
| GraphicsLister globs `*.png` and `*.PNG` without `uniq!`; Windows' case-insensitive glob lists every picture twice | `003_Editor_Listers.rb:135-138` | `src/debug/EditorListers.ts:75` |
| StringListProperty pushes `old_setting[i]` with no `i` (NameError on any non-empty list, e.g. editing Flags) | `002_Editor_DataTypes.rb:244` | `src/debug/EditorDataTypes.ts:344` |
| IVsProperty / EVsProperty read and write the old hash by `pbs_order` instead of stat ID (the hash gains keys 0-5) | `002_Editor_DataTypes.rb:558, 598` | `src/debug/EditorDataTypes.ts:654, 691` |
| EvolutionsProperty: `when String` never matches (`param_type` is the class), so a String parameter gets the 0-65535 number chooser | `002_Editor_DataTypes.rb:1282` | `src/debug/EditorDataTypes.ts:1398` |
| GameDataPoolProperty "Change value" with auto_sort sorts without keeping "[ADD VALUE]" first (cursor one row off) | `002_Editor_DataTypes.rb:1054` | `src/debug/EditorDataTypes.ts:1152` |
| chooseMapPoint and pbPropertyList never dispose their viewport (small leak) | `002_Editor_DataTypes.rb:685, 1551` | `src/debug/EditorDataTypes.ts:794, 1689` |
| ZUD `write_power_moves` writes `species.first` for flagged entries, which compile_power_moves already replaced: `PIKASHUNIUMZ` comes out as `Species = ` and recompiling fails | ZUD `[000] General/Compiler.rb:426, 454` (`:377`) | `src/compiler/WritePBS.ts:1199, 1233` |

### Editor screens (`web/src/debug/editors`, `web/src/ui/MysteryGift.ts`)

Paths under `020_Debug/001_Editor screens/` unless noted.

| Bug | Original | Port |
|---|---|---|
| Encounters editor: after adding or copying an encounter type, the cursor goes to the type's row in the *sorted* list while the list shows the types in their own order | `001_EditorScreens.rb:202, 231` | `src/debug/editors/EditorScreens.ts:221` |
| Trainer Pokémon editor (Essentials Deluxe): the moves are read from index 7, so the 4th move is dropped and a Shadow Pokémon gets `true` as its first move | Essentials Deluxe `[000] Essentials Patches/Trainer Data.rb:233` | `src/debug/editors/EditorScreens.ts:741` |
| Player metadata editor: "Home" is edited but left out of the saved hash | `001_EditorScreens.rb:783-793` | `src/debug/editors/EditorScreens.ts:931` |
| Species editor: the saved hash has no species/form or Mega/ZUD/Field Skills properties, which go back to their defaults (an item's HeldDescription/portion names likewise in the item editor) | `001_EditorScreens.rb:1109`, `:911` | `src/debug/editors/EditorScreens.ts:1225` |
| Regional Dex editor: saving an empty Dex loops forever (`dex.slice!(-1) until dex[-1]`). **Not reproduced**: the port stops at an empty Dex so the tab doesn't hang | `001_EditorScreens.rb:1254` | `src/debug/editors/EditorScreens.ts:1397` |
| Tileset editor compares the chosen row with the old tag's ID (harmless: the tags have no gaps) | `002_EditorScreens_TerrainTags.rb:215` | `src/debug/editors/TerrainTags.ts:306` |
| Map connections editor: `putNeighbors` records the wrong map, so a map can be placed again from its other neighbours | `003_EditorScreens_MapConnections.rb:177` | `src/debug/editors/MapConnections.ts:301` |
| Map connections editor: "Save changes? No" reloads the encounters, not the connections | `003_EditorScreens_MapConnections.rb:561` | `src/debug/editors/MapConnections.ts:654` |
| Auto-position Dynamax sprites: species without their own Dynamax metrics share the arrays, so `+8` also moves their normal front sprite down each run | ZUD `[000] General/Editors.rb:341`, `[001] Data/Data_Species.rb:168` | `src/debug/editors/SpritePositioning.ts:133` |
| `getPassabilityMinimap` (unused) calls `minimap.disposes` (NoMethodError) | `006_Map renderer/004_TileDrawingHelper.rb:229` | `src/debug/editors/TileDrawingHelper.ts:261` |
| Manage Mystery Gifts never writes the Master file back: edits and deletions are lost | `016_UI/023_UI_MysteryGift.rb:196, 212` | `src/ui/MysteryGift.ts:253` |

### Battle animation editor (`web/src/debug/editors`)

Paths under `020_Debug/002_Animation editor/` unless noted.

| Bug | Original | Port |
|---|---|---|
| PBAnimTiming#to_s, "Set FG": `@colorGreen \| "-"` (bitwise or): shows `true` for no green, raises TypeError for a set one (the SE/BG list crashes) | `011_Battle/006_Other battle code/007_BattleAnimationPlayer.rb:313` | `src/debug/editors/AnimEditor_Data.ts:253` |
| PBAnimTiming#to_s, "Set BG/FG": `sprintf("%d", @opacity)` raises TypeError when the opacity is unset | `007_BattleAnimationPlayer.rb:294, 316` | `src/debug/editors/AnimEditor_Data.ts:237` |
| PBAnimations#resize puts the selection one past the last animation (`selected = len`) | `007_BattleAnimationPlayer.rb:396` | `src/battle/scene/animationPlayer.ts:421` |
| OptionalSlider / OptionalTextSlider: `curvalue=`, `minvalue=`, `maxvalue=` call an undefined `slider` (NameError; never called) | `002_AnimEditor_ControlsButtons.rb:469, 503, 511, 717, 751, 759` | `src/debug/editors/AnimEditor_ControlsButtons.ts:524, 557, 563, 790, 817, 823` |
| OptionalSlider / OptionalTextSlider define `validate?` instead of `validate`, so they are redrawn every frame | `002_AnimEditor_ControlsButtons.rb:489, 737` | `src/debug/editors/AnimEditor_ControlsButtons.ts:542, 806` |
| ArrayCountSlider reads an undefined `canvas` (NameError; unused class) | `002_AnimEditor_ControlsButtons.rb:555` | `src/debug/editors/AnimEditor_ControlsButtons.ts:610` |
| Insert Frame copies the frame shallowly: both frames share their cels, so editing one edits the other | `001_AnimEditor_SceneElements.rb:663` | `src/debug/editors/AnimEditor_SceneElements.ts:743` |
| Renumber allows cel number 60 (MAX_SPRITES), past the last cel: the cel is never shown or played | `005_AnimEditor_Functions.rb:193` | `src/debug/editors/AnimEditor_Functions.ts:230` |
| Set Blending Color previews the color as a tone | `005_AnimEditor_Functions.rb:253` | `src/debug/editors/AnimEditor_Functions.ts:290` |
| Import Anim: an animation without a graphic also gets "The animation file … was not found" (the folder is prefixed before the empty check) | `004_AnimEditor_ExportImport.rb:69-70` | `src/debug/editors/AnimEditor_ExportImport.ts:153` |

## Minigames (`web/src/minigames`)

Triple Triad is this game's modified copy (custom cards such as `OAK`), and
the game's own NPCs only play with `noprize`, so most of the card-trading
crashes below can't happen from events. `TT` = `017_Minigames/002_Minigame_TripleTriad.rb`.

| Bug | Original | Port |
|---|---|---|
| A card that is neither a species nor a custom card raises NoMethodError on nil (`found_card.species`) | `TT:53-55` | `src/minigames/TripleTriad.ts:92` |
| Card selection: taking a card back (BACK) relists the cards with `GameData::Species.get`, which raises for custom cards (`OAK`) | `TT:358` | `src/minigames/TripleTriad.ts:565` |
| Win or loss with the default trade rule names the card with `GameData::Species.get` (raises for custom cards) | `TT:976, 1007` | `src/minigames/TripleTriad.ts:1180, 1203` |
| "direct" trade rule: `get_species_form(...).id` is nil for custom cards (NoMethodError) | `TT:957, 988, 1018` | `src/minigames/TripleTriad.ts:1151` |
| The opponent's "can't move" branch calls `continue`, not a Ruby keyword (NameError; unreachable) | `TT:911` | `src/minigames/TripleTriad.ts:1111` |
| pbSellTriads calls a missing global `pbDisplayPaused` for a 0-price card (unreachable: prices are ≥ 100) | `TT:1296` | `src/minigames/TripleTriad.ts:1495` |
| pbTriadList names cards with `GameData::Species.get` (raises for custom cards) | `TT:1346` | `src/minigames/TripleTriad.ts:1541` |
| Card backgrounds are `card_#{type}`: there is no `card_fighting`/`card_steel` (only `card_fight`), so Fighting and Steel cards have a blank background; species-form cards (`RATTATA_1`) have no `Cards/` picture | `Triple Triad Booster Packs/TripleTriad_Improvements.rb:30, 34` | `src/minigames/TripleTriad.ts:251` |
| Binder: the row count rounds with TOTAL_VISIBLE_ROWS instead of TOTAL_COLUMNS - 1, so with 19-20 (25-26, ...) cards the last row can't be reached | `TripleTriad_Binder.rb:51` | `src/minigames/TripleTriad_Binder.ts:108` |
| Binder with no cards: `@cards[0]` is nil (NoMethodError) | `TripleTriad_Binder.rb:106` | `src/minigames/TripleTriad_Binder.ts:167` |
| Binder: BACK plays the close-menu sound twice | `TripleTriad_Binder.rb:200-201` | `src/minigames/TripleTriad_Binder.ts:252` |
| Rubik's square (game 6) walks columns with `(width - 1) * height` instead of `(height - 1) * width` (wrong on non-square boards; all of this game's are square) | `007_Minigame_TilePuzzles.rb:412` | `src/minigames/TilePuzzles.ts:473` |
| Dance: an unknown game id raises NoMethodError in `initialize` before the "Minigame not found" check | `Dance Minigame/Main.rb:231` | `src/minigames/DanceMinigame.ts:326` |
| Dance: Infinite Mode has no lives and `handle_input` never returns `:exit`, so it never ends; `@forced_exit` is never set (the analysis always shows) | `Dance Minigame/Main.rb:277, 300, 337-357` | `src/minigames/DanceMinigame.ts:407, 445` |
| Dance: `valid_game_id?` builds a whole DanceGame each time (twice per pbDanceGame), shuffling its moves and leaving a viewport behind | `Dance Minigame/Main.rb:243-255, 904-909` | `src/minigames/DanceMinigame.ts:354` (the empty viewport is disposed) |

## Battle Frontier (`web/src/game/frontier`; paths under `018_Alternate battle modes/`)
| Bug | Original | Port |
|---|---|---|
| PokemonRuleSet#addSubsetRule pushes onto `@teamRules`, so subset rules (TotalLevelRestriction) are checked on whole teams and suggestedLevel never sees them | `002_Battle Frontier rules/002_Challenge_Rulesets.rb:103,50` | `rulesets.ts` |
| …so with the Pika/Poké/Fancy Cup rules no generated team is ever valid (3 Pokémon at the maximum level exceed the total): pbGenerateBattleTrainer and pbBattleFactoryPokemon loop forever for those cups | `001_Battle Frontier/003_Challenge_ChooseFoes.rb:74-80,153-160` | `chooseFoes.ts` |
| The Battle Tower's record board (map 191, event 5) asks for `getPreviousWins(0)`/`getMaxWins(0)`, but challenges are kept under their IDs (`"towersingle"`), so it always shows 0 | `Data/Map191.rxdata` (event data) | `data/maps/Map191.json` |
| Map 191's receptionist sends a resting challenger on to Goldenrod City (map 56, 0,6) instead of the battle room | `Data/Map191.rxdata` (event data) | `data/maps/Map191.json` |
| BattleChallenge#data compares the challenge's string ID with 0 (ArgumentError while a challenge is in progress; only reached by #rules without rules) | `001_Battle Frontier/001_Challenge_BattleChallenge.rb:141` | `battleChallenge.ts` |
| BattleChallengeData#pbEnd sets `$player.party = @oldParty` before checking a challenge is in progress (nil party) | `001_Challenge_BattleChallenge.rb:275` | `battleChallenge.ts` |
| pbBattleFactoryPokemon scales the last range end (881) to the list's length (882), so a Group 3 draw can pick index 882 (nil, NoMethodError): open level, or 21+ wins | `003_Challenge_ChooseFoes.rb:124,155` | `chooseFoes.ts` |
| LevelAdjustment#getAdjustment calls the class method getNullAdjustment on the instance (NoMethodError; every used subclass overrides it) | `002_Battle Frontier rules/004_Challenge_LevelAdjustment.rb:25` | `levelAdjustment.ts` |
| NegativeExtendedGameClause returns nil (invalid) for every Pokémon it doesn't ban | `002_Battle Frontier rules/003_Challenge_EntryRestrictions.rb:56-62` | `entryRestrictions.ts` |
| NicknameClause calls `NicknameChecker.check`, a module instance method (NoMethodError for 2+ Pokémon); NicknameChecker#getName returns the name un-upcased the first time | `003_Challenge_EntryRestrictions.rb:103-109,131` | `entryRestrictions.ts` |
| Rules without `errorMessage` (RestrictedSpecies*) raise NoMethodError when isValid? reports errors | `002_Challenge_Rulesets.rb:214,219` | `rulesets.ts` |
| PBPokemon#inspect calls `real_name_brief` on stat symbols (NoMethodError with any EVs) | `001_Battle Frontier/002_Challenge_Data.rb:173` | `challengeData.ts` |
| pbWriteCup: canceling the YES/NO prompt (no trainer lists) gives "YES, USE NEW" | `003_Battle Frontier generator/001_ChallengeGenerator_Data.rb:293-301` | `generatorData.ts` |
| isBattlePokemonDuplicate discards `moves.compact.sort` and the move lists always have 4 entries, so moves must match in order and any matching moves count as the same set | `001_ChallengeGenerator_Data.rb:136-139` | `generatorData.ts` |
| pbTrainerInfo's random trainer type loop has no `break` (hangs when a challenge has no trainer list and there's no default list) | `003_ChallengeGenerator_Trainers.rb:27-32` | `generatorTrainers.ts` |
| Team generation's real battles (pbRuledBattle, 1 in 100) use Battle::DebugSceneNoLogging, which lacks Essentials Deluxe's pbDeluxeTriggers: every attack phase raises, nobody moves, and the battle is decided on time after 100 rounds | `004_ChallengeGenerator_BattleSim.rb:401`; Essentials Deluxe `[000] Essentials Patches/Battle.rb:282` | `battleSim.ts` |
| PlayerRatingElo#update reads an undefined `match` (NameError); RuledTeam#toStr (PlayerRating#to_i), #load (indexes by Pokémon) and #compare (PlayerRating#compare) raise (all unused) | `004_ChallengeGenerator_BattleSim.rb:68-75,160` | `battleSim.ts` |
| Battle Swap: the rental screen's message window is Graphics.height wide | `001_Battle Frontier/005_UI_BattleSwap.rb:19` | `battleSwap.ts` |

## ZUD Max Raids and Dynamax Adventures (`web/src/game/maxRaid`, `web/src/game/maxLair`, `web/src/battle/zud/raid`; paths under ZUD `[009] Max Raid/` and `[010] Adventures/`)
| Bug | Original | Port |
|---|---|---|
| A Pokémon caught in a raid isn't marked as caught/owned in the Pokédex (RaidBattle#pbRecordAndStoreCaughtPokemon skips pbSetCaught) | `Raid_Battle.rb:15-21` | `src/battle/zud/raid/Raid_Battle.ts` |
| A saved den Pokémon's IVs are read in Hash order but applied in PBS order, so its Speed/Sp. Atk/Sp. Def IVs rotate each time the den is set up | `Raid_Setup.rb:109` | `src/game/maxRaid/Raid_Setup.ts` |
| Gender roll is inverted: the female chance makes the raid Pokémon male | `Raid_Setup.rb:145` | `src/game/maxRaid/Raid_Setup.ts` |
| A species in no raid rank (e.g. a Mega form picked by a random form) leaves rank nil and `i <= rank` raises ArgumentError | `Raid_Setup.rb:134-160` | `src/game/maxRaid/Raid_Setup.ts` |
| MaxRaidBattle.start_core's fallback passes an undefined `pokemon` (NameError; never reached) | `Raid_Setup.rb:52` | `src/game/maxRaid/Raid_Setup.ts` (passes dx_pokemon) |
| MaxRaidBattle.start returns true for every raid den (it returns pbEndScene's value, not the outcome); events must read the outcome variable | `Raid_Setup.rb:40-43` | `src/game/maxRaid/Raid_Setup.ts` |
| raid_GenerateSpeciesList raises NoMethodError when the map's encounter table gives nothing | `Raid_Ranks.rb:207` | `src/game/maxRaid/Raid_Ranks.ts` (keeps the previous params) |
| Rewards screen reads `rules[:environment]` (the rule is `:environ`), so the environment-based rewards never drop | `Raid_Den_Scene.rb:403` | `src/game/maxRaid/Raid_Den_Scene.ts` |
| Story dens: `:rank => 5` is overwritten by the boss's level (55 -> rank 4); `:gmax_factor`/`:catch_rate` options are read by nothing; the fallback branch learns `:DRAGON_DANCE` (not a move), uses `:Sunny` (not a weather) and leaves pkmn_options nil (NoMethodError) | `Raid_Mine.rb:114, 216-246` | `src/game/maxRaid/Raid_Mine.ts` |
| Map 851 (test map) event 6: `:species` isn't a rule anything reads, and the `:loot` pair makes the quantity `:DYNAMAXCANDY`, which `$bag.add` can't take (the rewards screen raises) | `Data/Map851.rxdata` (event data) | `src/game/scripts/maxRaid.ts` |
| Debug "Max Raid Battle": MAXRAID_SIZE is 6 here, past the end of sizemsg, so the menu shows "Raid Size []" until a size is picked | ZUD `[000] General/Debug.rb` | `src/game/maxRaid/Debug.ts` |
| lair_CanMove? calls `ret.include?` on nil when there's no Selection tile (NoMethodError) | `MaxLair_Controls.rb:25-28` | `src/game/maxLair/MaxLair_Controls.ts` (false) |
| A trapped chest sends the player back to the start even when it stays locked (no Lair Key) | `MaxLair_Controls.rb:166` | `src/game/maxLair/MaxLair_Controls.ts` |
| Move tutor: the move's name is read before checking there is one (GameData::Move.get(nil) raises) | `LairMenu_Menus.rb:668` | `src/game/maxLair/LairMenu_Menus.ts` |
| Move tutor: tutoring a Pokémon that knows four moves calls `@scene.pbForgetMove`, but MaxLairEventScene has no @scene (NoMethodError) | `LairMenu_Menus.rb:690` | `src/game/maxLair/LairMenu_Menus.ts` |

## Pokémon Amie (`web/src/plugins/pokemonAmie`; paths under `Plugins/Pokemon Amie/Pokemon Amie.rb`)

| Bug | Original | Port |
|---|---|---|
| Berries never use their berry_plants.dat entry (looked up by GameData::Item, keyed by symbol): every berry gives 3 + rand(4) affection. The loaded hash is kept in the Pokémon (`@berryPlantData`), so it goes into the save | `:198-207` | `src/plugins/pokemonAmie/amie.ts` (`feedAmie`; nothing stored) |
| PokeBattle_Battler is v19's battler class (v20.1: Battle::Battler), so Amie stats do nothing in battle | `:344-365` | `src/plugins/pokemonAmie/amie.ts` (unused class) |
| The hunger counter counts every event's steps (`:on_step_taken`), not just the player's, and lowers eggs' stats too | `:333-342` | `src/plugins/pokemonAmie/amie.ts` |
| Pressing on the open food bar with no food in the Bag raises NoMethodError (`food-1`) | `:946` | `src/plugins/pokemonAmie/PokeAmieScene.ts` |
| Closing an empty food bar leaves its count overlay (disposed inside the food loop) | `:523-526` | `src/plugins/pokemonAmie/PokeAmieScene.ts` |
| `@nibbleCooldown` starts nil: food picked up already over the Pokémon would raise on the first nibble | `:833` | `src/plugins/pokemonAmie/PokeAmieScene.ts` |
| The walk's second leg left is twice as long as the first, and the Pokémon creeps 3 px up each round trip (`@initial_y` re-read mid-bob) | `:387-411` | `src/plugins/pokemonAmie/PokeAmieScene.ts` |
| Every opening and every return from the switch screen costs 2 Enjoyment and plays a Following Pokémon line | `:710-712` | `src/plugins/pokemonAmie/PokeAmieScene.ts` |
| Most maps' BattleBack (cave1, tunnel, battle1, indoor2…) has no picture in `Graphics/Pictures/Pokemon Amie`, so the backdrop is blank (black) there | `:876-901` | `src/plugins/pokemonAmie/PokeAmieScene.ts` |

## Social Links (`web/src/plugins/socialLinks`; paths under `Plugins/Social Links/`)

| Bug | Original | Port |
|---|---|---|
| Bond Effects (EXP rate, shiny rolls, catch rate) are tracked and announced but do nothing: no script calls `active_bond_effect?` | `004_Player.rb:36` | `player.ts` (`activeBondEffect`, unused) |
| `pbSetSocialLinkBond` doesn't clamp (`bond.clamp` discards its result): bonds can go past the max or below 0 | `004_Player.rb:221` | `player.ts` (`pbSetLinkBond`) |
| `pbSetSocialLinkBond` reaching exactly the max (not silent) raises NoMethodError (`MAXED_BOND_MESSAGE ""` is a method call) after the sound effect and the new bond, before moments reset and effects refresh | `004_Player.rb:234` | `player.ts` (`pbSetLinkBond`) |
| `pbSetSocialLinkMoment` doesn't clamp, and its "shared a moment" message compares the old moments with the bond | `004_Player.rb:315, 323` | `player.ts` (`pbSetLinkMoment`) |
| `toggle_favorite(val)` sets `val` and then toggles it too | `001_Data.rb:39-42` | `data.ts` (`toggleFavorite`) |
| `pbSetSocialLinkLocation` / `FavoritePokemon` / `Status` (a String) on a link the player doesn't have raise NoMethodError | `004_Player.rb:352-372` | `player.ts` |
| Viewing a profile rewrites its stored status with the replaced text (`gsub!` on `@current_status`), freezing `\v[n]` values; a variable holding its own `\v[n]` loops forever | `003_SocialUI.rb:631, 711-737` | `SocialUI.ts`, `sceneLogic.ts` |
| Most profiles (Mother, Elm, Ivy, Kris, Yellow, Red, the route trainers) have no picture in `Graphics/UI/Social Links/Profile Pictures`: Ruby raises Errno::ENOENT drawing the list/profile; the port draws nothing there (as its pbDrawImagePositions/IconSprite do for any missing graphic) | `003_SocialUI.rb:323, 579` | `SocialUI.ts` |
| SocialMediaScreen's pbUpdate/pbRefresh/pbDisplay/pbDisplayForcedCommands/pbConfirm/pbShowCommands call scene methods that don't exist (unused) | `003_SocialUI.rb:762-784` | `SocialUI.ts` |
| The Script Variables setup (editing Game_Event's variable condition) was never applied, so `varValue?` is unused | `005_Script Variables.rb`, `008_Game_Event.rb:188` | `scriptVariables.ts` |

## Luka's Scripting Utilities (`web/src/plugins/lukasUtilities`; paths under `Plugins/Luka's Scripting Utilities/script.rb`)

Nothing in the game calls these helpers, so none of this shows in play.

| Bug | Original | Port |
|---|---|---|
| `Hash#deep_merge` returns the last non-Hash value (`h = hash[key]`) or merges into the top level; replaces Essentials' correct version (only `deep_merge!` is used) | `script.rb:214-226` | `extensions.ts:125` |
| `Color.new(n)` doesn't pad the hex (`0x00FF00` is red; `255` raises ArgumentError); `Color.new("r,g,b")` misreads; `Color.new()` raises | `script.rb:728-746` | `colors.ts:27` |
| `Color#to_rgb` doesn't strip `#` | `script.rb:759-765` | `colors.ts:60` |
| `Color.from_i` reads an undefined `clr` (NameError) | `script.rb:781-787` | `colors.ts:76` |
| `Color.parse` on a string without `#` calls the nonexistent `String#include` (NoMethodError) | `script.rb:797` | `colors.ts:86` |
| `Viewport#sprites` never increments its key: only the last sprite, under 0 | `script.rb:236-245` | `sprites.ts:69` |
| `Sprite#skew` skips row 0 (and blits row `height`); past 90° `@calMidX` halves the new bitmap's own width | `script.rb:361-366` | `sprites.ts:162` |
| `Sprite#avg_color` counts transparent samples in the divisor; a bitmap smaller than `freq` divides by 0 | `script.rb:395-414` | `sprites.ts:226` |
| `Sprite#create_outline` uses an undefined `r` (NameError) | `script.rb:423` | `sprites.ts:256` |
| `Sprite#colorize` swaps red and blue when blending (`amt` < 255) | `script.rb:457-471` | `sprites.ts:267` |
| `Sprite#mask` calls the nonexistent `Bitmap#mask` (NoMethodError); `Bitmap#mask!` returns a new bitmap | `script.rb:527, 611-639` | `sprites.ts:342`, `bitmaps.ts:131` |
| `TrailingSprite` copies call `center` (a getter) instead of `center!`; faded copies are never freed | `script.rb:928, 938-946` | `spriteClasses.ts:96` |
| `CallbackWrapper`'s `@params = {}` is a class-level variable: `execute` before `set` raises NoMethodError | `script.rb:1090` | `env.ts:75` |
| `Env.path` calls an undefined `getKnownFolder` | `script.rb:1194` | `env.ts:205` |
| `Env.interpret` cuts sections out with `gsub!` (repeated text and section names misparse), counts `""`/`-`/`.` as numbers, makes blank lines sub-sections named `""`, and raises NoMethodError on a file without sections | `script.rb:1248-1334` | `env.ts:259` |
| `getPolygonPoints` steps `360 / n` in integer division | `script.rb:1397` | `globals.ts:13` |

## Experiment with Scene, Unown Report, the Mega Evolution plugin, TC Wardrobe (`web/src/plugins/experimentWithScene`, `web/src/plugins/unownReport`, `web/src/plugins/megaEvolution`, `web/src/ui/scenes/Wardrobe.ts`; paths under `Plugins/`)

| Bug | Original | Port |
|---|---|---|
| MyUI::Scene#pbStartScene raises TypeError: `@vector.spoof(@vector)` splats the Vector as x with every other value nil (`Math.cos(nil)`), so pbMyUI/pbEndScene never run and the scene stays on screen. Nothing in the game opens this scene | `ExperimentWithScene/MyUI_Scene.rb:153` | `src/plugins/experimentWithScene/MyUIScene.ts` |
| pbStartScene replaces the player IconSprite with an empty Sprite without disposing it: the front sprite stays drawn at (0, 0) | `ExperimentWithScene/MyUI_Scene.rb:130` | `src/plugins/experimentWithScene/MyUIScene.ts` |
| MyUI.get_vector returns the :PLAYER vector for every key once it exists; add_vector(:CAMERA_MOTION, ...) appends the trailing 1 to the list instead of to each vector (only :CAMERA does that) | `ExperimentWithScene/MyUI Module.rb:26, 46, 101` | `src/plugins/experimentWithScene/MyUIModule.ts` |
| Vector starts @set as [x, y, scale, angle, …] but update reads [2] as the angle and [3] as the scale (swapped until the first set) | `ExperimentWithScene/Math Functions.rb:22, 135-136` | `src/plugins/experimentWithScene/MathFunctions.ts` |
| Battle::Scene#alignSprites / getRealVector, MyUI::Scene#spoof and #disposed? call methods that don't exist here (Elite Battle: DX's getCenter, doublebattle?, @scene, @sprite): NoMethodError. Nothing calls them | `Math Functions.rb:191, 199`; `MyUI_Scene.rb:48`; `Scene Camera.rb:127` | `src/plugins/experimentWithScene/` |
| Unown Report: USE on a page does nothing (empty `if`), so the report only lists the names of the forms seen | `Unown Report/Unown_Report_Mechanic.rb:214-216` | `src/plugins/unownReport/UnownReportMechanic.ts` |
| Mega Evolution plugin (SceneMegaEvolution; never runs in play, Essentials Deluxe's pbMegaEvolve replaces the plugin's): restoreColor restores nothing; the Pokémon is `Bitmap.new` of its front sprite file, a whole animation strip, shown centred with several frames side by side; the Mega strip then keeps the first strip's ox/oy, so it's drawn off screen (Ampharos); @viewport is never disposed | `Mega Evolution/Mega Evolution.rb:50, 146, 224-226, 271-276` | `src/plugins/megaEvolution/SceneMegaEvolution.ts` |
| TC Wardrobe: Map003's `pbUnlockOutfit(4)` is past the 4 outfits and unlocks nil (kept as null in the save) | `TC Wardrobe/001_main.rb:17`; `web/data/maps/Map003.json` | `src/game/trainer/Player.ts`, `src/ui/scenes/Wardrobe.ts` |

## Shadow Pokémon: purification and battle (`web/src/ui/purifyChamber`, `web/src/game/pokemon/shadowPokemonOther.ts`, `web/src/battle`)

| Bug | Original | Port |
|---|---|---|
| Leaving the set editor (EDIT) while a set is ready for purification hangs the game: "There is a Pokémon that is ready to open its heart!\1" goes through UIHelper.pbDisplay, which adds another `\1`; the first is a pause before the end, the window stays busy while paused, and UIHelper.pbDisplay only resumes a window that isn't busy (purification still works when the chamber is opened with a set ready) | `016_UI/022_UI_PurifyChamber.rb:542`, `016_UI/018_UI_ItemStorage.rb:211` | `src/ui/purifyChamber/PurifyChamberScreen.ts` (pbOpenSetDetail) |
| Past that hang (unreachable as is), pbDoPurify opens the set again over the open one (`@sprites` replaced, not disposed): the old set view would stay on screen until Ruby's GC frees it (the port disposes it when the scene ends) | `022_UI_PurifyChamber.rb:541-545`, `:1111` | `src/ui/purifyChamber/PurifyChamberScene.ts` (pbOpenSet, pbEnd) |
| SUMMARY on a set's Shadow Pokémon does nothing while the set has no regular Pokémon (the loop covers `setCount * 2` positions) | `022_UI_PurifyChamber.rb:1267` | `src/ui/purifyChamber/PurifyChamberScene.ts` (pbSummary) |
| `PurifyChamber#debugAdd` builds a `PseudoPokemon`, which v20.1 doesn't define (NameError; nothing calls it) | `022_UI_PurifyChamber.rb:279` | `src/ui/purifyChamber/PurifyChamber.ts` |
| The Time Flute only works on a Shadow Pokémon whose heart gauge isn't 0, then calls pbPurify, which returns unless it is 0: the flute is used up and does nothing (not in this game's items) | `014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb:289-292` | `src/game/pokemon/shadowPokemonOther.ts` |
| Switching out a Shadow Pokémon in Hyper Mode doesn't end it: pbInitPokemon's reset checks `inHyperMode?` after the switch-out has set the battler's HP to 0 (`pbAbilitiesOnSwitchOut`), so it is always false; Hyper Mode only ends by Call, a scent, the 10% end-of-round chance or fainting | `014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb:193-195`, `011_Battle/002_Battler/006_Battler_AbilityAndItem.rb:12` | `src/battle/battler/Battler_Initialize.ts` (pbInitPokemon) |
| Battle#pbCanUseItemOnPokemon?'s Hyper Mode check can't fire: the core version already refuses every non-scent item in Hyper Mode, and the alias exempts the three scents; if it did, it would show its message even with `showMessages` false | `002_ShadowPokemon_Other.rb:177-183`, `011_Battle/001_Battle/006_Battle_ActionUseItem.rb:18` | `src/battle/battle/Battle_ActionUseItem.ts` |

## Plugin audit leftovers (Generation 9 Pack, Mr. Gela's HGSS Trainer Card)

| Bug | Original | Port |
|---|---|---|
| Walking-evolution step handler crashes (NoMethodError on nil) on every step when the party has only Eggs and fainted Pokémon | Gen 9 Pack `[000] General/[000] Pokemon.rb:256` | `src/plugins/gen9Pack/stepHandlers.ts` |
| Mirror Herb: the comment says every 100 steps, the code waits for 256 | Gen 9 Pack `[000] General/[000] Pokemon.rb:280` | `src/plugins/gen9Pack/stepHandlers.ts` |
| Legend Plate transform animation brightens its tone table in place (`col = variances[3]; col.red += 255`), so each type's fourth tone (the plate's starting tone, the particles') gets brighter every time it plays | Gen 9 Pack `[001] Battle/[006] Legend Plate Functions.rb:279-282` | `src/battle/scene/ArceusTransform.ts` |
| `getForeignID(number)` ignores `number` (the loop overwrites it) | `Mr. Gela's HGSS Trainer Card Scene.rb:53` | `src/game/trainer/Player.ts` |

## Event scripts (`web/data/maps`, `web/data/common-events.json`; port in `src/game/scripts/eventScripts.ts`, `src/game/scripts/rubyErrors.ts`)

Calls in the game's events that the original game (v20.1 and its plugins) doesn't define, left over from the older Essentials the game started on. Each raises when it runs (NameError / NoMethodError → EventScriptError) and the game stops with the error box; the port raises the same (`rubyErrors.ts`). `data/eventScripts.test.ts` checks every other call resolves.

| Bug | Original (event) | Port |
|---|---|---|
| Secret Bases (Maps 255, 673, 209): `pbSecretBaseMart`, `pbSecretBasePC`, `pbNewSecretBase`, `pbInstallingBase`, `getAllCushions`… don't exist | events | `rubyErrors.ts` |
| Pokémon Center online counters (Map 842, common events 43-44): `GTS.open`, `PVP.open`, `OnlineLobby.open`, `pbWonderTrade`, `pbSave`, `Kernel.pbTransferPlayer` don't exist | events | `rubyErrors.ts` |
| `pbIsWeekday?` (common event 78; the function is `pbIsWeekday`), `pbTalkToFollower` (common event 41), `pbToggleFollowingPokemon` (Map 569), `pbFirstRaid` (Map 851) don't exist | events | `rubyErrors.ts` |
| Messages with a stray backslash show it as written: `\v [77]` / `\v [76]` (a space; Map 251 event 31), `\Olá` (Map 314), `\Hm!` (Map 678) | events | `data/eventScripts.test.ts` |

## Core overworld, saves and utilities (`web/src/game/field/stepHandlers.ts`, `web/src/game/dayNight.ts`, `web/src/game/save/SaveConversions.ts`, `web/src/core`)
| Bug | Original | Port |
|---|---|---|
| Pokérus never counts down: the `:pokerus_counter` frame handler returns while `$PokemonGlobal.pokerusTime` is nil, and nothing ever sets it | `012_Overworld/001_Overworld.rb:5-16`, `002_Overworld_Metadata.rb:105` | `src/game/field/stepHandlers.ts` |
| `moonphase` adds `hour * 60 + min * 60` seconds, counting hours as minutes | `012_Overworld/003_Overworld_Time.rb:151` | `src/game/dayNight.ts` |
| Scene_Map#autofade: at night, with a map's "_n" BGM already playing, the second test (`playingBGM.name != map.bgm.name`) is still true, so the night music fades and restarts on every transfer between maps sharing it | `003_Game processing/002_Scene_Map.rb:62-63` | `src/scenes/SceneMap.ts` |
| `Numeric#to_word` checks `self <= ret.length`, so 21 returns nil | `001_Technical/002_RubyUtilities.rb:78` | `src/core/rubyUtilities.ts` |
| `pbPostData` only posts to `http://` URLs; anything else (https included) returns "" | `001_Technical/002_Files/003_HTTP_Utilities.rb:7` | `src/core/httpUtilities.ts` |
| Pokégear phone: a trainer contact registered without its event (`pbPhoneRegister(nil, ...)`, 6 entries) is taken for an NPC contact, and `pbCommonEvent(:YOUNGSTER)` raises ArgumentError (`id < 0`) when it is called (no event of this game does that) | `013_Items/004_Item_Phone.rb:185-186`, `019_Utilities/001_Utilities.rb:496` | `src/ui/pokegear/phone.ts` |
| Save conversion `v20_refactor_day_care_variables`: an empty old slot becomes a Lv.50 Manaphy, and `next if slot.filled?` keeps looping, so the first old Pokémon fills every empty slot | `002_Save data/005_Game_SaveConversions.rb:176-183` | `src/game/save/SaveConversions.ts` |
| Save conversion `v20_rename_bag_variables` clears `@lastPocket` instead of `@lastpocket` | `005_Game_SaveConversions.rb:221` | `src/game/save/SaveConversions.ts` |
