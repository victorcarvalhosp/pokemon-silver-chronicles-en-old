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
