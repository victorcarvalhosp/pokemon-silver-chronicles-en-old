# Scenarios for deluxe_reference.rb: Mega Evolution / Primal Reversion turns
# and midbattle scripts (the presets of Midbattle_Config.rb plus scripts that
# use the remaining triggers and effects).
#
#   scenario name, player party, foe party, turns (choices per battler per
#            round, or a number of rounds of default choices), options:
#     trainer: true (the foe is a trainer, items: its items), double: true,
#     bag: { item => qty }, midbattle: { trigger => script }, choices: [...]
#     (answers to the midbattle's choice prompts), seed:, want: "text"

M = PBEffects

#===============================================================================
# Mega Evolution
#===============================================================================
mega = { "mega" => true }
scenario "Mega: player's Charizard X with a Mega Ring, once per battle",
         [mon(:CHARIZARD, :BLAZE, [:DRAGONCLAW, :FLAMETHROWER], 60, i: "CHARIZARDITEX")],
         [mon(:BLASTOISE, :TORRENT, [:WATERGUN], 60), mon(:VENUSAUR, :OVERGROW, [:VINEWHIP], 60)],
         [[mega, nil], [mega, nil], [mega, nil]], trainer: true, bag: { "MEGARING" => 1 }
scenario "Mega: no Mega Ring, no Mega Evolution",
         [mon(:CHARIZARD, :BLAZE, [:DRAGONCLAW], 60, i: "CHARIZARDITEY")],
         [mon(:BLASTOISE, :TORRENT, [:WATERGUN], 60)],
         [[mega, nil]], trainer: true
scenario "Mega: both sides Mega Evolve in one turn; Charizard Y's Drought on Mega Evolving",
         [mon(:CHARIZARD, :BLAZE, [:FLAMETHROWER], 60, i: "CHARIZARDITEY")],
         [mon(:GENGAR, :CURSEDBODY, [:SHADOWBALL], 60, i: "GENGARITE")],
         [[mega, { "aimega" => true }], [mega, nil]], trainer: true, items: ["MEGARING"], bag: { "MEGARING" => 1 }
scenario "Mega: trainer AI Mega Evolves Garchomp (needs the trainer's Mega Ring)",
         [mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:GARCHOMP, :ROUGHSKIN, [:DRAGONCLAW], 60, i: "GARCHOMPITE")],
         [[nil, { "aimega" => true }], [nil, { "aimega" => true }]], trainer: true, items: ["MEGARING"]
scenario "Mega: trainer without a Mega Ring can't",
         [mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:GARCHOMP, :ROUGHSKIN, [:DRAGONCLAW], 60, i: "GARCHOMPITE")],
         [[nil, { "aimega" => true }]], trainer: true
scenario "Mega: a wild ace Mega Evolves; a wild non-ace doesn't",
         [mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:KANGASKHAN, :EARLYBIRD, [:TACKLE], 60, i: "KANGASKHANITE", ace: true)],
         [[nil, { "aimega" => true }], [nil, { "aimega" => true }]]
scenario "Mega: a wild non-ace doesn't Mega Evolve",
         [mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:KANGASKHAN, :EARLYBIRD, [:TACKLE], 60, i: "KANGASKHANITE")],
         [[nil, { "aimega" => true }]]
scenario "Mega: Rayquaza with Dragon Ascent (fervent wish)",
         [mon(:RAYQUAZA, :AIRLOCK, [:DRAGONASCENT, :EXTREMESPEED], 70)],
         [mon(:SNORLAX, :THICKFAT, [:BODYSLAM], 70)],
         [[mega, nil], [nil, nil]], trainer: true, bag: { "MEGARING" => 1 }
scenario "Mega: double battle, one Mega Evolution per trainer",
         [mon(:AMPHAROS, :STATIC, [:THUNDERBOLT], 60, i: "AMPHAROSITE"),
          mon(:GYARADOS, :INTIMIDATE, [:WATERFALL], 60, i: "GYARADOSITE")],
         [mon(:PIDGEOT, :KEENEYE, [:WINGATTACK], 60), mon(:RATICATE, :GUTS, [:TACKLE], 60)],
         [[mega, nil, mega, nil], [nil, nil, mega, nil]], trainer: true, double: true, bag: { "MEGARING" => 1 }
scenario "Mega: switching out cancels nothing; the Mega form stays after switching",
         [mon(:GYARADOS, :INTIMIDATE, [:WATERFALL], 60, i: "GYARADOSITE"), mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:SNORLAX, :THICKFAT, [:BODYSLAM], 60)],
         [[mega, nil], ["s1", nil], ["s1", nil], [mega, nil]], trainer: true, bag: { "MEGARING" => 1 }

#===============================================================================
# Primal Reversion
#===============================================================================
scenario "Primal: Kyogre and Groudon revert on entering battle",
         [mon(:KYOGRE, :DRIZZLE, [:SURF], 70, i: "BLUEORB")],
         [mon(:GROUDON, :DROUGHT, [:EARTHQUAKE], 70, i: "REDORB")],
         2, trainer: true
scenario "Primal: a Kyogre sent in later reverts",
         [mon(:PIKACHU, :STATIC, [:SPLASH], 30, hp: [1, 20]), mon(:KYOGRE, :DRIZZLE, [:SURF], 70, i: "BLUEORB")],
         [mon(:GARCHOMP, :ROUGHSKIN, [:DRAGONCLAW], 70)],
         3, trainer: true

#===============================================================================
# Midbattle presets (Midbattle_Config.rb)
#===============================================================================
scenario "Preset DEMO_MEGA_EVOLUTION: the trainer's speech before Mega Evolving",
         [mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:GYARADOS, :INTIMIDATE, [:WATERFALL], 60, i: "GYARADOSITE"),
          mon(:CHARIZARD, :BLAZE, [:FLAMETHROWER], 60, i: "CHARIZARDITEY")],
         [[nil, { "aimega" => true }], [nil, { "aimega" => true }], [nil, { "aimega" => true }]],
         trainer: true, items: ["MEGARING"], midbattle: EssentialsDeluxe::DEMO_MEGA_EVOLUTION
scenario "Preset DEMO_PRIMAL_REVERSION",
         [mon(:LAPRAS, :WATERABSORB, [:ICEBEAM], 60)],
         [mon(:GROUDON, :DROUGHT, [:EARTHQUAKE], 70, i: "REDORB")],
         2, trainer: true, midbattle: EssentialsDeluxe::DEMO_PRIMAL_REVERSION
scenario "Preset DEMO_SPEECH (trainer battle)",
         [mon(:GRAVELER, :STURDY, [:ROCKTHROW, :DEFENSECURL], 30), mon(:PIDGEOTTO, :KEENEYE, [:GUST], 30)],
         [mon(:CHARMANDER, :BLAZE, [:EMBER, :GROWL], 20), mon(:ODDISH, :CHLOROPHYLL, [:POISONPOWDER, :ABSORB], 20)],
         [[0, 1], [1, 0], ["s1", 0], [0, 0], [0, 0], [0, 0]], trainer: true, midbattle: EssentialsDeluxe::DEMO_SPEECH
scenario "Preset DEMO_SPEECH (wild double battle)",
         [mon(:MACHOP, :GUTS, [:KARATECHOP, :LEER], 25), mon(:GEODUDE, :STURDY, [:TACKLE], 25)],
         [mon(:RATTATA, :RUNAWAY, [:TACKLE], 10), mon(:SPEAROW, :KEENEYE, [:PECK], 10)],
         [[0, nil, 0, nil], [[0, 3], nil, [0, 1], nil], [0, nil, 0, nil]], double: true,
         midbattle: EssentialsDeluxe::DEMO_SPEECH
scenario "Preset DEMO_CAPTURE_TUTORIAL",
         [mon(:CYNDAQUIL, :BLAZE, [:TACKLE, :LEER], 15)],
         [mon(:SENTRET, :RUNAWAY, [:SCRATCH], 5)],
         [[0, nil], [0, nil], [0, nil], [0, nil], [0, nil]], midbattle: EssentialsDeluxe::DEMO_CAPTURE_TUTORIAL
scenario "Preset DEMO_VS_OPAL: quiz choices (correct/incorrect)",
         [mon(:TYRANITAR, :SANDSTREAM, [:CRUNCH], 60), mon(:LAPRAS, :WATERABSORB, [:SURF], 60)],
         [mon(:WEEZING, :LEVITATE, [:SLUDGE], 60), mon(:MAWILE, :INTIMIDATE, [:BITE], 60)],
         6, trainer: true, choices: [1, 0, 0], midbattle: EssentialsDeluxe::DEMO_VS_OPAL
scenario "Preset DEMO_VS_SADA_PHASE_2 (raises NoMethodError on :teracharge)",
         [mon(:DRAGONITE, :INNERFOCUS, [:DRAGONCLAW, :EXTREMESPEED], 70)],
         [mon(:ARCANINE, :INTIMIDATE, [:TAUNT, :BULKUP, :FLAMETHROWER, :GIGAIMPACT], 70)],
         6, trainer: true, midbattle: EssentialsDeluxe::DEMO_VS_SADA_PHASE_2
scenario "Preset DEMO_WILD_ROTOM",
         [mon(:MARILL, :THICKFAT, [:WATERGUN, :DEFENSECURL], 30), mon(:DIGLETT, :ARENATRAP, [:DIG, :MUDSLAP], 30)],
         [mon(:ROTOM, :LEVITATE, [:THUNDERSHOCK, :ASTONISH], 30)],
         [[0, nil], [1, nil], ["s1", nil], [1, nil], [1, nil]], midbattle: EssentialsDeluxe::DEMO_WILD_ROTOM
scenario "Preset DEMO_COLLAPSING_CAVE",
         [mon(:ONIX, :STURDY, [:BIND, :HARDEN], 30)],
         [mon(:GOLBAT, :INNERFOCUS, [:LEECHLIFE], 30), mon(:GRAVELER, :STURDY, [:ROCKTHROW], 30)],
         5, trainer: true, midbattle: EssentialsDeluxe::DEMO_COLLAPSING_CAVE
scenario "Preset DEMO_BATTLE_QUIZMASTER",
         [mon(:FERALIGATR, :TORRENT, [:SURF, :CRUNCH], 50), mon(:MEGANIUM, :OVERGROW, [:RAZORLEAF], 50)],
         [mon(:PORYGON, :TRACE, [:TRIATTACK, :RECOVER], 40), mon(:MAGNEMITE, :STURDY, [:THUNDERSHOCK], 40)],
         6, trainer: true, choices: [2, 3, 0, 1, 0], midbattle: EssentialsDeluxe::DEMO_BATTLE_QUIZMASTER

#===============================================================================
# Custom midbattle scripts: the other triggers and effects
#===============================================================================
scenario "Midbattle: turn triggers (_N, _every_N, _repeat_alt, _random, odds)",
         [mon(:PIKACHU, :STATIC, [:THUNDERSHOCK, :GROWL], 40)],
         [mon(:EEVEE, :RUNAWAY, [:TACKLE, :TAILWHIP], 40)],
         [[1, 1]] * 5, trainer: true, midbattle: {
           "turnCommand_1"          => "First command phase.",
           "turnAttack_every_2"     => { :text => "Even attack phase {1}." },
           "turnEnd_repeat_alt"     => { :text => "Odd round end." },
           "turnCommand_random"     => { :text => "A random command trigger." },
           "turnEnd_repeat_random_30" => { :text => "A 30% repeat trigger." },
           "turnAttack_3"           => [:Opposing, "Round three, {1}!", :Self, "My turn, {1}."]
         }
scenario "Midbattle: :battler/:trainer, stats, effects, rename, HP, status cures",
         [mon(:HOOTHOOT, :INSOMNIA, [:PECK, :GROWL], 30)],
         [mon(:WOOPER, :DAMP, [:WATERGUN, :TAILWHIP], 30)],
         [[1, 1], [0, 0], [0, 0]], trainer: true, midbattle: {
           "turnCommand" => {
             :battler => :Opposing,
             :text    => "{1} braces itself!",
             :stats   => [:ATTACK, 2, :SPEED, -1, :Random, 1],
             :effects => [[M::FocusEnergy, 2, "{1} is getting pumped!"], [M::Endure, true],
                          [M::Type3, :GHOST, "{1} turned partly Ghost type!"], [M::CriticalBoost, 1]],
             :rename  => "Swampy"
           },
           "turnEnd_1" => {
             :battler => :Self,
             :hp      => [-3, "{1} was hurt by debris!"],
             :status  => [:BURN, true],
             :battler_1 => :Opposing,
             :status_1  => [:POISON, "{1} breathed in toxic fumes!"]
           },
           "turnEnd_2" => {
             :hp     => [2, "{1} recovered a bit."],
             :status => [:NONE, true],
             :stats  => :Reset,
             :battler => :Opposing,
             :stats_1 => :Reset_Raised
           }
         }
scenario "Midbattle: team and field effects, weather, terrain, environment, backdrop",
         [mon(:SLOWPOKE, :OWNTEMPO, [:CONFUSION, :WATERGUN], 30)],
         [mon(:PSYDUCK, :DAMP, [:SCRATCH, :WATERGUN], 30)],
         [[0, 0]] * 6, trainer: true, midbattle: {
           "turnCommand_1" => {
             :team    => [[M::Reflect, 3, "A wall shields {1}!"], [M::Spikes, 2, "Spikes scattered around {1}!"],
                          [M::StealthRock, true, "Rocks float around {1}!"], [M::Tailwind, 2, "A tailwind blew behind {1}!"]],
             :battler => :Opposing,
             :team_1  => [[M::LightScreen, 2, "{1} is protected!"], [M::Safeguard, 2, "{1} is veiled!"]],
             :field   => [[M::TrickRoom, 3, "The dimensions were twisted!"], [M::Gravity, 2, "Gravity intensified!"],
                          [M::IonDeluge, true, "A deluge of ions showers the field!"]],
             :weather => :Rain,
             :terrain => :Electric,
             :environ => :Cave,
             :backdrop => "cave1"
           },
           "turnEnd_3" => { :weather => :None, :terrain => :None, :team => [[M::Spikes, 0, "The spikes vanished from around {1}!"]] },
           "turnCommand_4" => { :weather => :Random, :terrain => :Random, :environ => :Random },
           "endTeamEffect_foe"    => { :text => "Trigger endTeamEffect_foe." },
           "endTeamEffectREFLECT" => { :text => "Trigger endTeamEffectREFLECT." },
           "endFieldEffect"       => { :text => "Trigger endFieldEffect." },
           "endFieldEffectGRAVITY" => { :text => "Gravity is back to normal." },
           "endWeather"           => { :text => "Trigger endWeather." },
           "endTerrainELECTRIC"   => { :text => "Trigger endTerrainELECTRIC." },
           "endEffectTAUNT_foe"   => "My taunt wore off!"
         }
scenario "Midbattle: ability, item, moves, form changes",
         [mon(:CASTFORM, :FORECAST, [:TACKLE, :WEATHERBALL], 30)],
         [mon(:ROTOM, :LEVITATE, [:THUNDERSHOCK], 30), mon(:UNOWN, :LEVITATE, [:HIDDENPOWER], 30, f: 0)],
         [[0, 0]] * 4, trainer: true, midbattle: {
           "turnCommand_1" => {
             :ability => [:DROUGHT, true],
             :item    => [:LEFTOVERS, true],
             :battler => :Opposing,
             :form    => [3, "{1} changed its appliance!"],
             :item_1  => [[:CHARCOAL, :MYSTICWATER], "{1} found something."],
             :ability_1 => [:VOLTABSORB, "{1} absorbs electricity now!"]
           },
           "turnCommand_2" => {
             :moves   => [:SPLASH, nil, :GROWL],
             :item    => [:Remove, true],
             :battler => :Opposing,
             :form    => :Cycle,
             :ability_1 => :Reset
           },
           "turnCommand_3" => {
             :moves   => :Reset,
             :battler => :Opposing,
             :form    => [:Random, "{1} possessed something!"],
             :moves_1 => :THUNDERBOLT
           }
         }
scenario "Midbattle: forced switches (:Choose, species, index, :Forced, :Random)",
         [mon(:CHIKORITA, :OVERGROW, [:TACKLE], 20), mon(:CYNDAQUIL, :BLAZE, [:EMBER], 20),
          mon(:TOTODILE, :TORRENT, [:WATERGUN], 20)],
         [mon(:BELLSPROUT, :CHLOROPHYLL, [:VINEWHIP], 20), mon(:ZUBAT, :INNERFOCUS, [:LEECHLIFE], 20),
          mon(:GASTLY, :LEVITATE, [:LICK], 20)],
         [[0, 0]] * 5, trainer: true, midbattle: {
           "turnCommand_1" => { :switch => :Choose },
           "turnCommand_2" => { :battler => :Opposing, :switch => [:GASTLY, "{2} called {1} back!"] },
           "turnCommand_3" => { :switch => 0 },
           "turnCommand_4" => { :battler => :Opposing, :switch => :Forced },
           "turnCommand_5" => { :switch => :Random },
           "switchOut_foe"       => "Come back!",
           "switchIn_foe"        => "Go!",
           "switchSentOut"       => { :text => "{1} was sent out." },
           "switchSentOutLast_foe" => "That's my last one!"
         }
scenario "Midbattle: items used by a script, forced moves",
         [mon(:MAREEP, :STATIC, [:TACKLE, :THUNDERWAVE, :GROWL], 20, hp: [1, 3])],
         [mon(:HOPPIP, :CHLOROPHYLL, [:TACKLE, :SYNTHESIS, :POISONPOWDER, :ABSORB], 20)],
         [[0, 0], [0, 0], [0, 0], [0, 0]], trainer: true, midbattle: {
           "turnAttack_1" => { :useitem => :POTION, :battler => :Opposing, :usemove => :StatusFoe },
           "turnAttack_2" => { :useitem => :XATTACK, :usemove => [2, 1], :battler => :Opposing, :usemove_1 => :HealSelf },
           "turnAttack_3" => { :useitem => [:FULLHEAL, :ANTIDOTE], :battler => :Opposing, :usemove => :DamageFoe },
           "turnAttack_4" => { :battler => :Opposing, :usemove => :ABSORB, :useitem => :GUARDSPEC }
         }
scenario "Midbattle: speech arrays (:Speaker, :SE, :Cry, :Anim, speaker index), choices, variables",
         [mon(:MARILL, :THICKFAT, [:TACKLE, :DEFENSECURL], 30)],
         [mon(:JIGGLYPUFF, :CUTECHARM, [:POUND, :SING], 30)],
         [[0, 0]] * 4, trainer: true, choices: [1, 0, 2], midbattle: {
           "turnCommand_1" => [:Opposing, :Cry, "Puff!", :SE, "Anim/Applause", :Anim, :GROWL, "Listen to my song, {2}!",
                               :Speaker, { :name => "Announcer", :skin => 1 }, "What a show!",
                               :Speaker, :JIGGLYPUFF, "Jiggly!", 0, "I'll do my best, \\PN!"],
           "turnEnd_1" => {
             :setchoice => ["colour", 2],
             :speech => [:Opposing, "Pop quiz!", "What colour am I?", { "Blue" => "Nope!", "Pink" => "Right, {1}!" }]
           },
           "choice_colour_correct" => { :setvar => 2, :text => "You got it." },
           "choice_colour_incorrect" => { :setvar => [:sub, 1], :text => "Wrong." },
           "turnEnd_2" => {
             :setchoice => "pick",
             :text => ["Pick a number.", ["One", "Two", "Three"]]
           },
           "choice_pick_1" => { :setvar => [:mult, 3] },
           "choice_pick_3" => { :setvar => [:add, 5], :text => "Three it is." },
           "variable_up"     => "The score went up!",
           "variable_down"   => "The score went down...",
           "variable_over_3" => { :text => "Over three points!" },
           "variable_under_2" => { :text => "Under two points." },
           "turnEnd_3" => { :blankspeech => [:Speaker, "Narrator", "And so the battle went on."], :wait => 4,
                            :bgm => ["Battle trainer", 1], :playcry => true, :anim => "StatUp" }
         }
scenario "Midbattle: :delay and :ignore, move/attack triggers, endbattle",
         [mon(:SNUBBULL, :INTIMIDATE, [:TACKLE, :SCARYFACE], 30)],
         [mon(:GASTLY, :LEVITATE, [:LICK, :CONFUSERAY], 30)],
         [[0, 0], [1, 1], [0, 0], [0, 0], [0, 0]], trainer: true, midbattle: {
           "turnEnd_repeat" => { :delay => ["attackerNegated", "defenderNegated_foe"], :text => "Delayed text after a negated move." },
           "move_repeat"    => { :ignore => "moveStatus_foe", :text => "Move trigger until the foe uses a status move." },
           "attackerNegated" => "Ha! Normal moves don't touch my Gastly!",
           "defenderNegatedLICK_foe" => "Unreachable trigger key.",
           "moveStatus_foe" => { :text => "{1} used a status move." },
           "statusInflicted" => { :text => "{1} got a status condition." },
           "turnEnd_4" => { :text => "Time's up!", :endbattle => 1 }
         }
scenario "Midbattle: KO triggers, super/not very effective, HP thresholds",
         [mon(:SANDSHREW, :SANDVEIL, [:SCRATCH, :DIG], 40), mon(:PSYDUCK, :DAMP, [:WATERGUN], 40)],
         [mon(:CHARMANDER, :BLAZE, [:EMBER], 20), mon(:VULPIX, :FLASHFIRE, [:EMBER], 20)],
         [[1, 0], [1, 0], [0, 0], [1, 0], [0, 0], [0, 0]], trainer: true, midbattle: {
           "attackerSEdmg"       => "Super effective!",
           "defenderSEdmg_foe"   => "Ouch, super effective!",
           "attackerNVEdmg_foe"  => "Barely a scratch.",
           "defenderHPHalf_foe"  => "I'm down to half!",
           "defenderHPLowLast_foe" => "My last one is almost out!",
           "fainted_foe"         => { :text => "{1} fainted, said the script." },
           "faintedLast_foe"     => "No! My last Pokémon!",
           "faintedCHARMANDER_foe" => "Charmander, no!",
           "switchInLast_foe"    => "Only one left...",
           "attackerHPHalf"      => { :text => "{1} is getting tired." }
         }
scenario "Midbattle: Mega Evolution through :usespecial, :lockspecial",
         [mon(:AMPHAROS, :STATIC, [:GROWL], 60, i: "AMPHAROSITE")],
         [mon(:ABSOL, :PRESSURE, [:LEER], 60, i: "ABSOLITE")],
         [[0, 0], [0, 0], [0, 0]], trainer: true, items: ["MEGARING"], bag: { "MEGARING" => 1 }, midbattle: {
           "turnAttack_1" => { :battler => :Opposing, :usespecial => [:Mega, "{2} activated the Mega Ring!"] },
           "turnCommand_2" => { :lockspecial => :Mega, :text => "Mega Evolution was locked." },
           "turnAttack_2" => { :usespecial => :Mega },
           "turnCommand_3" => { :lockspecial => :Mega },
           "turnAttack_3" => { :usespecial => :MegaEvolution },
           "megaABSOL_foe" => "Absol, Mega Evolve!",
           "mega" => "Here goes!"
         }
scenario "Midbattle: wild battle, capture triggers and :disableballs",
         [mon(:QUILAVA, :BLAZE, [:EMBER], 30)],
         [mon(:PIDGEY, :KEENEYE, [:TACKLE], 3)],
         [["iPOKEBALL", nil], ["iPOKEBALL", nil], ["iPOKEBALL", nil], ["iPOKEBALL", nil]],
         bag: { "POKEBALL" => 4 }, midbattle: {
           "turnCommand_1" => { :disableballs => false, :text => "Throw away!" },
           "captureAttempt" => "Here it comes!",
           "captureFailure" => { :text => "It broke free!" },
           "captureSuccess" => { :text => "Gotcha, said the script." },
           "item" => "The player used an item."
         }
scenario "Midbattle: a loss",
         [mon(:CATERPIE, :SHIELDDUST, [:STRINGSHOT], 5, hp: [1, 10])],
         [mon(:TYRANITAR, :SANDSTREAM, [:CRUNCH], 60)],
         3, trainer: true, midbattle: {
           "loss" => "Better luck next time!",
           "faintedLast" => { :text => "Trigger faintedLast." }
         }

#===============================================================================
# Deluxe battle rules ([002] Battle Deluxe/Battle_Deluxe.rb)
#===============================================================================
scenario "Rules: [:raidcapture], \"Don't Catch\" (the wild Pokémon flees instead of fainting)",
         [mon(:TYPHLOSION, :BLAZE, [:FLAMETHROWER], 60)],
         [mon(:SNEASEL, :INNERFOCUS, [:SCRATCH], 20)],
         2, choices: [1], rules: { :raidcapture => ["{1} escaped into the forest!", nil, 0] },
         midbattle: { "fainted_foe" => "Unreachable: it didn't faint." }
scenario "Rules: [:raidcapture] in a wild double battle (the other one stays)",
         [mon(:TYPHLOSION, :BLAZE, [:FLAMETHROWER], 60), mon(:AMPHAROS, :STATIC, [:SPLASH], 60)],
         [mon(:SNEASEL, :INNERFOCUS, [:SCRATCH], 20), mon(:SWINUB, :OBLIVIOUS, [:TACKLE], 20)],
         [[[0, 1], nil, 0, nil], [[0, 3], nil, 0, nil]], double: true, choices: [1, 1],
         rules: { :raidcapture => [nil, nil, 0] }
scenario "Rules: [:setcapture] true and [:introtext]",
         [mon(:TYPHLOSION, :BLAZE, [:SPLASH], 60)],
         [mon(:SNEASEL, :INNERFOCUS, [:SCRATCH], 20)],
         [["iPOKEBALL", nil]], bag: { "POKEBALL" => 1 },
         rules: { :setcapture => true, :introtext => "A wild {1} blocks the path!" }
