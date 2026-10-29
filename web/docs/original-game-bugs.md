# Bugs in the original game kept by the port

The port copies the original Ruby (Essentials v20.1 + this game's plugins) as
it behaves, bugs included, so the tests can compare it with Ruby round by
round. Each bug below is marked in the TypeScript with a `NOTE (Ruby parity)`
or `Ruby bug` comment. Fixing one means changing the TypeScript **and**
applying the same change to the Ruby harness in `tools/ruby-ref` (see
`patch_ability_handler` in `ability_reference.rb`), then adding a scenario
where the fix shows.

Already fixed on purpose: the happiness soft-cap crash, the Gen 9 Pack Sun
multiplier, and Cotton Down, Bad Dreams, Forewarn, Magician, Mummy/Lingering
Aroma, Neutralizing Gas, Opportunist and Synchronize.

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
| Fillet Away always fails: PBS code `RaiseUserAtk2SpAtk2Speed2LoseHalfOfTotalHP`, plugin class `RaiseUserAtkSpAtkSpeed2LoseHalfOfTotalHP` (data fix in `PBS/moves.txt`) | `PBS/moves.txt`, Gen 9 Pack `[001] New Move Functions.rb` | `data/reports/battle-function-codes.json` |
| Chilly Reception always fails: PBS code `StartHailWeatherSwitchOutUser`, plugin class `SwitchOutUserStartHailWeather` | same | same |
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
| Marts on maps 218, 312, 357, 559, 568, 756, 784, 820, 822, 828 list `PBItems::` names the compatibility class doesn't define (POKeBALL, PARLYZHEAL, XDEFEND, XSPECIAL, POKeDOLL): a NameError, so the mart never opens | `Pokemon Silver Chronicles Helpers.rb:7`, map events | `src/ui/mart/PokemonMart.ts` (the `pbPokemonMart` script) |

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
| The Galarian Darumaka trade (Map 704) asks for `DARUMAKA_1`, but the Galarian form is form 2 here: "Species DARUMAKA_1 does not exist." | Map 704 event, `PBS/pokemon_forms.txt:1363` | `src/ui/trading/Trading.ts` (`pbTradePokemon`) |
| The Electrode trade (Map 516) passes `PBSpecies::ELECTRODE`, a constant v20 doesn't define (NameError) | Map 516 event | left untranslated (`scriptApi` warns, the trade then fails like the original) |
| Common event 32 builds `HallofFameScene`/`HallofFame` (v16 class names, NameError) | `CommonEvent32` | left untranslated |

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
| PokemonRuleSet#addSubsetRule pushes onto `@teamRules` | `018_Alternate battle modes/002_Battle Frontier rules/002_Challenge_Rulesets.rb:105` | `src/game/trainers/pokemonSelection.ts` |
| pbRegisterPartner with a trainer that doesn't exist raises NoMethodError on `trainer.party` | `012_Overworld/001_Overworld.rb:717` | `src/game/trainers/trainerEvents.ts` |
| VSEliteFour never checks the player's `vsE4_` sprite; the alternate (Luka S.J.) VS intro never checks the player's `vsBar_`/`vsTrainer_` graphics (none exist here, so it never plays) | `009_Scenes/001_Transitions.rb:1448`; `002_Overworld_BattleIntroAnim.rb:289-296` | `src/game/battle/transitions.ts`, `BattleIntroAnim.ts` |
| ThreeBallDown places its black squares for a zoom it never applies (invisible: the zoom is 1) | `001_Transitions.rb:866-867` | `src/game/battle/transitions.ts` |
