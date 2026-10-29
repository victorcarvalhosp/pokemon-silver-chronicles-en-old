# Scenarios for ability_reference.rb (loaded by it; see there for the format).
#   scenario(name, side-0 party, side-1 party, turns, double:, trainer:, seed:)
#   turns: a round count (everyone uses move 0) or one array per round of
#   choices by battler index (singles: [player, foe]; doubles: [0, 1, 2, 3],
#   even = player side). A choice is nil/move index, [move, target], "s<n>"
#   (switch to party slot n) or "r" (run).
#   mon(species, ability, moves, level, i:, g:, hp: [num, den], st:, sc:, n:, f:)
# Any ability can be given to any species; most use the species' own.
# items: true marks scenarios that depend on held item effects (the
# TypeScript test skips them while those items' handlers aren't ported).

#===============================================================================
# Abilities of the Route 29-36 species and the Johto starters' lines
#===============================================================================
scenario "Aftermath", [mon(:CYNDAQUIL, :BLAZE, [:TACKLE], 60)], [mon(:STUNKY, :AFTERMATH, [:SCRATCH], 10)], 2
scenario "Ball Fetch (no ball)", [mon(:YAMPER, :BALLFETCH, [:TACKLE])], [mon(:PIDGEY, :KEENEYE, [:SANDATTACK])], 2
scenario "Big Pecks", [mon(:PIDGEY, :BIGPECKS, [:GUST])], [mon(:GROWLITHE, :INTIMIDATE, [:LEER])], 2
scenario "Blaze", [mon(:CYNDAQUIL, :BLAZE, [:EMBER], hp: [1, 4])], [mon(:CHIKORITA, :OVERGROW, [:GROWL])], 2
scenario "Blaze (above 1/3)", [mon(:QUILAVA, :BLAZE, [:EMBER])], [mon(:BAYLEEF, :OVERGROW, [:GROWL])], 1
scenario "Chlorophyll (Sunny Day)", [mon(:SUNKERN, :CHLOROPHYLL, [:SUNNYDAY, :ABSORB])],
         [mon(:PIDGEY, :KEENEYE, [:TACKLE])], [[0, 0], [1, 0], [1, 0]]
scenario "Cloud Nine", [mon(:PSYDUCK, :CLOUDNINE, [:WATERGUN])], [mon(:VULPIX, :DROUGHT, [:EMBER])], 2
scenario "Competitive (Intimidate)", [mon(:JIGGLYPUFF, :COMPETITIVE, [:POUND])], [mon(:GROWLITHE, :INTIMIDATE, [:EMBER])], 1
scenario "Competitive (Growl)", [mon(:JIGGLYPUFF, :COMPETITIVE, [:POUND])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 2
scenario "Compound Eyes", [mon(:YANMA, :COMPOUNDEYES, [:SUPERSONIC])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 3, seed: 7
scenario "Cute Charm", [mon(:JIGGLYPUFF, :CUTECHARM, [:POUND], g: 1)], [mon(:RATTATA, :RUNAWAY, [:TACKLE], g: 0)], 4, want: "Cute Charm"
scenario "Damp", [mon(:WOOPER, :DAMP, [:WATERGUN])], [mon(:GEODUDE, :STURDY, [:SELFDESTRUCT])], 1
scenario "Drought", [mon(:VULPIX, :DROUGHT, [:EMBER])], [mon(:CHIKORITA, :LEAFGUARD, [:TACKLE])], 3
scenario "Early Bird", [mon(:LEDYBA, :EARLYBIRD, [:TACKLE], st: "SLEEP", sc: 4)], [mon(:PIDGEY, :KEENEYE, [:TACKLE])], 3
scenario "Filter", [mon(:MRMIME, :FILTER, [:CONFUSION])], [mon(:PANCHAM, :IRONFIST, [:POISONJAB])], 2
scenario "Flame Body", [mon(:MAGBY, :FLAMEBODY, [:EMBER])], [mon(:RATTATA, :GUTS, [:TACKLE])], 4, want: "Flame Body"
scenario "Flash Fire", [mon(:GROWLITHE, :FLASHFIRE, [:EMBER])], [mon(:CYNDAQUIL, :BLAZE, [:EMBER])], 2
scenario "Forewarn", [mon(:DROWZEE, :FOREWARN, [:POUND])], [mon(:GEODUDE, :STURDY, [:TACKLE, :ROCKTHROW, :MAGNITUDE])], 1
scenario "Friend Guard", [mon(:JIGGLYPUFF, :FRIENDGUARD, [:POUND]), mon(:CYNDAQUIL, :BLAZE, [:TACKLE])],
         [mon(:RATTATA, :RUNAWAY, [:TACKLE]), mon(:PIDGEY, :KEENEYE, [:TACKLE])],
         [[[0, 1], [0, 2], [0, 3], [0, 2]], [[0, 1], [0, 2], [0, 3], [0, 0]]], double: true
scenario "Frisk", [mon(:SENTRET, :FRISK, [:SCRATCH])], [mon(:PIDGEY, :KEENEYE, [:TACKLE], i: :ORANBERRY)], 1
scenario "Gale Wings", [mon(:FLETCHLING, :GALEWINGS, [:PECK])], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 60)], 2
scenario "Gluttony", [mon(:BELLSPROUT, :GLUTTONY, [:VINEWHIP], i: :ORANBERRY)], [mon(:GROWLITHE, :INTIMIDATE, [:EMBER], 60)], 2
scenario "Guts (burned)", [mon(:RATTATA, :GUTS, [:TACKLE], st: "BURN")], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 2
scenario "Hustle", [mon(:NIDORANmA, :HUSTLE, [:PECK])], [mon(:WOOPER, :DAMP, [:GROWL])], 4, seed: 5
scenario "Imposter", [mon(:DITTO, :IMPOSTER, [:TRANSFORM])], [mon(:GROWLITHE, :INTIMIDATE, [:EMBER, :BITE])], 2
scenario "Infiltrator", [mon(:ZUBAT, :INFILTRATOR, [:LEECHLIFE])], [mon(:MRMIME, :SOUNDPROOF, [:REFLECT])], 2
scenario "Inner Focus", [mon(:ABRA, :INNERFOCUS, [:CONFUSION])], [mon(:AIPOM, :PICKUP, [:FAKEOUT])], 1
scenario "Insomnia", [mon(:HOOTHOOT, :INSOMNIA, [:PECK])], [mon(:DROWZEE, :FOREWARN, [:HYPNOSIS])], 2
scenario "Insomnia (asleep on switch-in)", [mon(:SPINARAK, :INSOMNIA, [:POISONSTING], st: "SLEEP")],
         [mon(:PIDGEY, :KEENEYE, [:TACKLE])], 1
scenario "Intimidate", [mon(:GROWLITHE, :INTIMIDATE)], [mon(:RATTATA, :GUTS)], 2
scenario "Iron Fist", [mon(:PANCHAM, :IRONFIST, [:COMETPUNCH, :TACKLE])], [mon(:SNUBBULL, :RATTLED, [:GROWL])], 2, seed: 2
scenario "Justified", [mon(:GROWLITHE, :JUSTIFIED, [:EMBER])], [mon(:HOUNDOUR, :EARLYBIRD, [:BITE])], 2
scenario "Keen Eye", [mon(:SPEAROW, :KEENEYE, [:PECK])], [mon(:GEODUDE, :SANDVEIL, [:SANDATTACK])], 3
scenario "Leaf Guard", [mon(:HOPPIP, :LEAFGUARD, [:SUNNYDAY, :TACKLE])], [mon(:MAREEP, :STATIC, [:THUNDERWAVE])],
         [[0, 0], [1, 0]]
scenario "Levitate", [mon(:GASTLY, :LEVITATE, [:LICK])], [mon(:WOOPER, :DAMP, [:MUDSLAP])], 2
scenario "Lightning Rod", [mon(:GOLDEEN, :LIGHTNINGROD, [:PECK])], [mon(:MAREEP, :STATIC, [:THUNDERSHOCK])], 2
scenario "Limber", [mon(:DITTO, :LIMBER, [:TACKLE])], [mon(:MAREEP, :STATIC, [:THUNDERWAVE])], 2
scenario "Magic Bounce", [mon(:NATU, :MAGICBOUNCE, [:PECK])], [mon(:EKANS, :SHEDSKIN, [:LEER, :POISONSTING])], 2
scenario "Magic Guard", [mon(:ABRA, :MAGICGUARD, [:TACKLE], st: "POISON")], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Mold Breaker", [mon(:PANCHAM, :MOLDBREAKER, [:TACKLE])], [mon(:PIDGEY, :BIGPECKS, [:GUST])], 1
scenario "Mold Breaker vs Levitate", [mon(:PANCHAM, :MOLDBREAKER, [:MUDSLAP])], [mon(:GASTLY, :LEVITATE, [:LICK])], 2
scenario "Moody", [mon(:BIDOOF, :MOODY, [:TACKLE])], [mon(:PIDGEY, :KEENEYE, [:TACKLE])], 3, seed: 13
scenario "Overgrow", [mon(:MEGANIUM, :OVERGROW, [:RAZORLEAF], hp: [1, 3])], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 1
scenario "Pickup", [mon(:AIPOM, :PICKUP, [:SCRATCH])], [mon(:RATTATA, :GLUTTONY, [:TACKLE], 20, i: :ORANBERRY, hp: [3, 5])], 3
scenario "Plus", [mon(:MAREEP, :PLUS, [:THUNDERSHOCK]), mon(:MAREEP, :MINUS, [:THUNDERSHOCK])],
         [mon(:PIDGEY, :KEENEYE, [:GROWL]), mon(:SPEAROW, :KEENEYE, [:GROWL])], 2, double: true
scenario "Poison Point", [mon(:NIDORANfE, :POISONPOINT, [:SCRATCH])], [mon(:RATTATA, :GUTS, [:TACKLE])], 4, want: "Poison Point"
scenario "Poison Touch", [mon(:GRIMER, :POISONTOUCH, [:POUND])], [mon(:RATTATA, :GUTS, [:GROWL])], 4, want: "Poison Touch"
scenario "Power of Alchemy", [mon(:GRIMER, :POWEROFALCHEMY, [:POUND], f: 1), mon(:GROWLITHE, :INTIMIDATE, [:TACKLE], 5)],
         [mon(:TYPHLOSION, :BLAZE, [:EMBER], 80), mon(:PIDGEY, :KEENEYE, [:GROWL])],
         [[[0, 1], [0, 2], [0, 3], [0, 0]], [[0, 1], [0, 0], [0, 3], [0, 0]]], double: true
scenario "Rattled (Bite)", [mon(:SNUBBULL, :RATTLED, [:TACKLE])], [mon(:HOUNDOUR, :EARLYBIRD, [:BITE])], 2
scenario "Rattled (Intimidate)", [mon(:LEDYBA, :RATTLED, [:TACKLE])], [mon(:GROWLITHE, :INTIMIDATE, [:EMBER])], 1
scenario "Rivalry (same gender)", [mon(:SHINX, :RIVALRY, [:TACKLE], g: 0)], [mon(:NIDORANmA, :POISONPOINT, [:GROWL], g: 0)], 1
scenario "Rivalry (opposite gender)", [mon(:SHINX, :RIVALRY, [:TACKLE], g: 0)], [mon(:NIDORANfE, :POISONPOINT, [:GROWL], g: 1)], 1
scenario "Rock Head", [mon(:GEODUDE, :ROCKHEAD, [:TAKEDOWN])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Run Away", [mon(:SENTRET, :RUNAWAY, [:SCRATCH])], [mon(:WOBBUFFET, :SHADOWTAG, [:SPLASH])], [["r", 0]]
scenario "Sand Veil (Sandstorm)", [mon(:GEODUDE, :SANDVEIL, [:SANDSTORM, :TACKLE])], [mon(:PIDGEY, :KEENEYE, [:TACKLE])],
         [[0, 0], [1, 0], [1, 0], [1, 0]], want: "missed"
scenario "Scrappy", [mon(:PANCHAM, :SCRAPPY, [:TACKLE])], [mon(:GASTLY, :LEVITATE, [:LICK])], 2
scenario "Sheer Force", [mon(:TOTODILE, :SHEERFORCE, [:BITE])], [mon(:PIDGEY, :KEENEYE, [:TACKLE])], 2
scenario "Shed Skin", [mon(:EKANS, :SHEDSKIN, [:WRAP], st: "POISON")], [mon(:PIDGEY, :KEENEYE, [:TACKLE])], 4, want: "Shed Skin"
scenario "Shield Dust", [mon(:CATERPIE, :SHIELDDUST, [:TACKLE])], [mon(:AIPOM, :PICKUP, [:FAKEOUT])], 1
scenario "Simple", [mon(:BIDOOF, :SIMPLE, [:DEFENSECURL])], [mon(:RATTATA, :RUNAWAY, [:TAILWHIP])], 2
scenario "Skill Link", [mon(:AIPOM, :SKILLLINK, [:FURYSWIPES])], [mon(:PIDGEY, :KEENEYE, [:TACKLE])], 2
scenario "Sniper (Focus Energy)", [mon(:SPEAROW, :SNIPER, [:FOCUSENERGY, :PECK])], [mon(:RATTATA, :RUNAWAY, [:GROWL])],
         [[0, 0], [1, 0], [1, 0], [1, 0]], want: "A critical hit!"
scenario "Solar Power", [mon(:SUNKERN, :SOLARPOWER, [:SUNNYDAY, :ABSORB])], [mon(:PIDGEY, :KEENEYE, [:GROWL])],
         [[0, 0], [1, 0], [1, 0]]
scenario "Soundproof", [mon(:MRMIME, :SOUNDPROOF, [:CONFUSION])], [mon(:JIGGLYPUFF, :CUTECHARM, [:SING, :GROWL])],
         [[0, 0], [0, 1]]
scenario "Speed Boost", [mon(:YANMA, :SPEEDBOOST, [:TACKLE])], [mon(:PIDGEY, :KEENEYE, [:TACKLE], 55)], 3
scenario "Static", [mon(:MAREEP, :STATIC, [:TACKLE])], [mon(:RATTATA, :GUTS, [:TACKLE])], 4, want: "Static"
scenario "Stench", [mon(:GRIMER, :STENCH, [:POUND], 60)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 4, want: "flinched"
scenario "Sticky Hold", [mon(:GRIMER, :STICKYHOLD, [:POUND], i: :ORANBERRY)], [mon(:HOUNDOUR, :UNNERVE, [:THIEF])], 1
scenario "Sturdy", [mon(:GEODUDE, :STURDY, [:TACKLE], 10)], [mon(:FERALIGATR, :TORRENT, [:SURF], 80)], 1
scenario "Swarm", [mon(:LEDYBA, :SWARM, [:BUGBITE], hp: [1, 4])], [mon(:SUNKERN, :CHLOROPHYLL, [:GROWL])], 1
scenario "Swift Swim (Rain Dance)", [mon(:MAGIKARP, :SWIFTSWIM, [:SPLASH]), mon(:POLIWAG, :SWIFTSWIM, [:RAINDANCE, :BUBBLE])],
         [mon(:GROWLITHE, :INTIMIDATE, [:TACKLE], 55)], [["s1", 0], [0, 0], [1, 0]], trainer: true
scenario "Synchronize", [mon(:NATU, :SYNCHRONIZE, [:PECK])], [mon(:PIDGEY, :KEENEYE, [:THUNDERWAVE])], 2
scenario "Synchronize (Toxic)", [mon(:ABRA, :SYNCHRONIZE, [:CONFUSION])], [mon(:PIDGEY, :KEENEYE, [:TOXIC])], 3
scenario "Tangled Feet", [mon(:PIDGEY, :TANGLEDFEET, [:TACKLE])], [mon(:ZUBAT, :INNERFOCUS, [:SUPERSONIC, :TACKLE])],
         [[0, 0], [0, 1], [0, 1], [0, 1]], want: "missed"
scenario "Technician", [mon(:MRMIME, :TECHNICIAN, [:CONFUSION])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Thick Fat", [mon(:RATTATA, :THICKFAT, [:TACKLE], f: 1)], [mon(:CYNDAQUIL, :BLAZE, [:EMBER])], 2
scenario "Tinted Lens", [mon(:HOOTHOOT, :TINTEDLENS, [:PECK])], [mon(:GEODUDE, :STURDY, [:DEFENSECURL])], 2
scenario "Torrent", [mon(:CROCONAW, :TORRENT, [:WATERGUN], hp: [1, 3])], [mon(:CYNDAQUIL, :BLAZE, [:GROWL])], 1
scenario "Unaware", [mon(:WOOPER, :UNAWARE, [:WATERGUN])], [mon(:BIDOOF, :SIMPLE, [:DEFENSECURL])], 3
scenario "Unnerve", [mon(:HOUNDOUR, :UNNERVE, [:EMBER])], [mon(:BELLSPROUT, :GLUTTONY, [:TACKLE], i: :ORANBERRY, hp: [1, 3])], 1
scenario "Vital Spirit", [mon(:MAGBY, :VITALSPIRIT, [:EMBER])], [mon(:JIGGLYPUFF, :CUTECHARM, [:SING])], 2
scenario "Water Absorb", [mon(:POLIWAG, :WATERABSORB, [:BUBBLE], hp: [1, 2])], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 2
scenario "Water Veil", [mon(:GOLDEEN, :WATERVEIL, [:PECK])], [mon(:VULPIX, :FLASHFIRE, [:WILLOWISP])], 2
scenario "Sweet Veil (ally)", [mon(:PIDGEY, :SWEETVEIL, [:TACKLE]), mon(:RATTATA, :GUTS, [:TACKLE])],
         [mon(:DROWZEE, :FOREWARN, [:HYPNOSIS]), mon(:JIGGLYPUFF, :CUTECHARM, [:SING])],
         [[[0, 1], [0, 2], [0, 3], [0, 0]]], double: true

#===============================================================================
# One or more abilities of every trigger kind
#===============================================================================
# SpeedCalc / WeightCalc
scenario "Quick Feet", [mon(:RATTATA, :QUICKFEET, [:TACKLE], st: "PARALYSIS")], [mon(:PIDGEY, :KEENEYE, [:TACKLE], 75)], 2
scenario "Heavy Metal (Low Kick)", [mon(:GEODUDE, :HEAVYMETAL, [:TACKLE])], [mon(:PANCHAM, :IRONFIST, [:LOWKICK])], 1
scenario "Light Metal (Grass Knot)", [mon(:GRAVELER, :LIGHTMETAL, [:DEFENSECURL], 60)], [mon(:SUNKERN, :CHLOROPHYLL, [:GRASSKNOT], 20)], 1
# OnHPDroppedBelowHalf
scenario "Emergency Exit (wild)", [mon(:PIDGEY, :KEENEYE, [:WINGATTACK], 40)], [mon(:RATTATA, :EMERGENCYEXIT, [:TACKLE], 50)], 3
scenario "Wimp Out (trainer)", [mon(:PIDGEY, :KEENEYE, [:WINGATTACK], 45)],
         [mon(:RATTATA, :WIMPOUT, [:TACKLE], 55), mon(:PIDGEY, :KEENEYE, [:TACKLE], 30)], 3, trainer: true
# StatusCheckNonIgnorable / StatusImmunityNonIgnorable
scenario "Comatose", [mon(:KOMALA, :COMATOSE, [:TACKLE])], [mon(:MAREEP, :STATIC, [:THUNDERWAVE])], 2
scenario "Shields Down", [mon(:MINIOR, :SHIELDSDOWN, [:TACKLE])], [mon(:GRIMER, :STENCH, [:TOXIC, :POUND])], 3
# StatusImmunityFromAlly / StatLossImmunityFromAlly
scenario "Flower Veil", [mon(:FLABEBE, :FLOWERVEIL, [:TACKLE]), mon(:SUNKERN, :CHLOROPHYLL, [:ABSORB])],
         [mon(:GROWLITHE, :INTIMIDATE, [:LEER]), mon(:MAREEP, :STATIC, [:THUNDERWAVE])],
         [[[0, 1], [0, 0], [0, 3], [0, 2]]], double: true
# OnStatusInflicted / StatusCure
scenario "Immunity (poisoned at start)", [mon(:SNORLAX, :IMMUNITY, [:TACKLE], st: "POISON")], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 1
scenario "Own Tempo", [mon(:SLOWPOKE, :OWNTEMPO, [:TACKLE])], [mon(:ZUBAT, :INNERFOCUS, [:SUPERSONIC])], 2
scenario "Oblivious", [mon(:SLOWPOKE, :OBLIVIOUS, [:TACKLE], g: 0)], [mon(:JIGGLYPUFF, :CUTECHARM, [:ATTRACT, :TAUNT], g: 1)],
         [[0, 0], [0, 1]]
scenario "Magma Armor (frozen at start)", [mon(:SLUGMA, :MAGMAARMOR, [:EMBER], st: "FROZEN")], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 1
# StatLossImmunity / NonIgnorable / OnStatLoss
scenario "Clear Body", [mon(:TENTACOOL, :CLEARBODY, [:BUBBLE])], [mon(:GROWLITHE, :INTIMIDATE, [:LEER])], 2
scenario "Hyper Cutter", [mon(:KRABBY, :HYPERCUTTER, [:BUBBLE])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 2
scenario "Full Metal Body (Mold Breaker)", [mon(:SOLGALEO, :FULLMETALBODY, [:TACKLE], 30)], [mon(:PANCHAM, :MOLDBREAKER, [:LEER])], 1
scenario "Defiant", [mon(:MANKEY, :DEFIANT, [:SCRATCH])], [mon(:GROWLITHE, :INTIMIDATE, [:LEER])], 2
# PriorityChange / PriorityBracketChange / PriorityBracketUse
scenario "Prankster", [mon(:SABLEYE, :PRANKSTER, [:CONFUSERAY])], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 60)], 2
scenario "Triage", [mon(:COMFEY, :TRIAGE, [:DRAININGKISS])], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 60)], 2
scenario "Stall", [mon(:SABLEYE, :STALL, [:SCRATCH], 60)], [mon(:SLOWPOKE, :OBLIVIOUS, [:TACKLE], 20)], 2
scenario "Quick Draw", [mon(:SLOWPOKE, :QUICKDRAW, [:TACKLE])], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 60)], 3, want: "Quick Draw"
# OnFlinch
scenario "Steadfast", [mon(:MACHOP, :STEADFAST, [:KARATECHOP])], [mon(:AIPOM, :PICKUP, [:FAKEOUT])], 1
# MoveBlocking
scenario "Dazzling", [mon(:BRUXISH, :DAZZLING, [:WATERGUN])], [mon(:RATTATA, :RUNAWAY, [:QUICKATTACK])], 2
# MoveImmunity
scenario "Volt Absorb", [mon(:CHINCHOU, :VOLTABSORB, [:BUBBLE], hp: [1, 2])], [mon(:MAREEP, :STATIC, [:THUNDERSHOCK, :THUNDERWAVE])],
         [[0, 0], [0, 1]]
scenario "Motor Drive", [mon(:ELECTIVIRE, :MOTORDRIVE, [:TACKLE])], [mon(:MAREEP, :STATIC, [:THUNDERSHOCK])], 2
scenario "Sap Sipper", [mon(:MAREEP, :SAPSIPPER, [:TACKLE])], [mon(:BELLSPROUT, :GLUTTONY, [:VINEWHIP])], 2
scenario "Storm Drain", [mon(:SHELLOS, :STORMDRAIN, [:MUDSLAP])], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 2
scenario "Dry Skin", [mon(:PARAS, :DRYSKIN, [:SCRATCH], hp: [1, 2])], [mon(:TOTODILE, :TORRENT, [:WATERGUN]), mon(:VULPIX, :DROUGHT, [:EMBER])],
         [[0, 0], [0, "s1"], [0, 0], [0, 0]], trainer: true
scenario "Wonder Guard", [mon(:SHEDINJA, :WONDERGUARD, [:SCRATCH])], [mon(:RATTATA, :RUNAWAY, [:TACKLE, :EMBER])],
         [[0, 0], [0, 1]]
scenario "Bulletproof", [mon(:CHESPIN, :BULLETPROOF, [:TACKLE])], [mon(:GASTLY, :LEVITATE, [:SHADOWBALL])], 1
scenario "Telepathy", [mon(:ELGYEM, :TELEPATHY, [:CONFUSION]), mon(:GEODUDE, :STURDY, [:MAGNITUDE])],
         [mon(:PIDGEY, :KEENEYE, [:GROWL]), mon(:RATTATA, :RUNAWAY, [:GROWL])], 2, double: true, seed: 3
# ModifyMoveBaseType (+ DamageCalcFromUser power boost)
scenario "Pixilate", [mon(:SYLVEON, :PIXILATE, [:TACKLE])], [mon(:PANCHAM, :IRONFIST, [:GROWL])], 1
scenario "Normalize", [mon(:SKITTY, :NORMALIZE, [:EMBER])], [mon(:GASTLY, :LEVITATE, [:LICK])], 2
scenario "Liquid Voice", [mon(:POPPLIO, :LIQUIDVOICE, [:HYPERVOICE])], [mon(:VULPIX, :DROUGHT, [:GROWL])], 1
# AccuracyCalcFromUser / FromAlly / FromTarget
scenario "No Guard", [mon(:MACHOP, :NOGUARD, [:DYNAMICPUNCH])], [mon(:RATTATA, :RUNAWAY, [:SANDATTACK])], 3, seed: 40
scenario "Victory Star (ally)", [mon(:VICTINI, :VICTORYSTAR, [:CONFUSION]), mon(:YANMA, :COMPOUNDEYES, [:HYPNOSIS])],
         [mon(:RATTATA, :RUNAWAY, [:TACKLE]), mon(:PIDGEY, :KEENEYE, [:TACKLE])], 2, double: true, want: "grew drowsy"
scenario "Wonder Skin", [mon(:SKITTY, :WONDERSKIN, [:TACKLE])], [mon(:MAREEP, :STATIC, [:THUNDERWAVE])], 3, seed: 16
scenario "Snow Cloak (Snow Warning)", [mon(:SNORUNT, :SNOWCLOAK, [:POWDERSNOW])], [mon(:SNOVER, :SNOWWARNING, [:TACKLE])], 3, seed: 17
# DamageCalcFromUser / FromAlly / FromTarget / NonIgnorable / TargetAlly
scenario "Huge Power", [mon(:MARILL, :HUGEPOWER, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Reckless", [mon(:STARAVIA, :RECKLESS, [:TAKEDOWN])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Strong Jaw", [mon(:TYRUNT, :STRONGJAW, [:BITE])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Tough Claws", [mon(:BINACLE, :TOUGHCLAWS, [:SCRATCH])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Analytic", [mon(:MAGNEMITE, :ANALYTIC, [:THUNDERSHOCK], 20)], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 60)], 2
scenario "Battery (ally)", [mon(:CHARJABUG, :BATTERY, [:BUGBITE]), mon(:MAREEP, :STATIC, [:THUNDERSHOCK])],
         [mon(:PIDGEY, :KEENEYE, [:GROWL]), mon(:RATTATA, :RUNAWAY, [:GROWL])], 1, double: true
scenario "Multiscale", [mon(:DRAGONITE, :MULTISCALE, [:TACKLE], 30)], [mon(:TYPHLOSION, :BLAZE, [:TACKLE], 60)], 2
scenario "Heatproof", [mon(:BRONZOR, :HEATPROOF, [:TACKLE])], [mon(:CYNDAQUIL, :BLAZE, [:EMBER])], 1
scenario "Fluffy", [mon(:STUFFUL, :FLUFFY, [:TACKLE])], [mon(:CYNDAQUIL, :BLAZE, [:TACKLE, :EMBER])], [[0, 0], [0, 1]]
scenario "Shadow Shield", [mon(:LUNALA, :SHADOWSHIELD, [:CONFUSION], 30)], [mon(:TYPHLOSION, :BLAZE, [:FLAMEWHEEL], 70)], 2
scenario "Fur Coat", [mon(:FURFROU, :FURCOAT, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
# CriticalCalcFromUser / FromTarget
scenario "Super Luck (+ Focus Energy: always critical)", [mon(:MURKROW, :SUPERLUCK, [:FOCUSENERGY, :PECK])], [mon(:SNORLAX, :THICKFAT, [:GROWL])],
         [[0, 0], [1, 0], [1, 0], [1, 0]]
scenario "Merciless", [mon(:MAREANIE, :MERCILESS, [:POISONSTING])], [mon(:RATTATA, :RUNAWAY, [:GROWL], st: "POISON")], 1
scenario "Battle Armor (Frost Breath)", [mon(:KABUTO, :BATTLEARMOR, [:SCRATCH])], [mon(:SNORUNT, :INNERFOCUS, [:FROSTBREATH])], 1
# OnBeingHit
scenario "Rough Skin", [mon(:CARVANHA, :ROUGHSKIN, [:BITE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Effect Spore", [mon(:PARAS, :EFFECTSPORE, [:SCRATCH])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 4, want: "Effect Spore"
scenario "Weak Armor", [mon(:ROGGENROLA, :WEAKARMOR, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Stamina", [mon(:MUDBRAY, :STAMINA, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Anger Point", [mon(:MANKEY, :ANGERPOINT, [:SCRATCH])], [mon(:SNORUNT, :INNERFOCUS, [:FROSTBREATH])], 2
scenario "Mummy", [mon(:YAMASK, :MUMMY, [:ASTONISH])], [mon(:PANCHAM, :IRONFIST, [:BITE])], 2
scenario "Cursed Body", [mon(:SHUPPET, :CURSEDBODY, [:ASTONISH])], [mon(:PANCHAM, :SCRAPPY, [:TACKLE])], 4, want: "Cursed Body"
scenario "Gooey", [mon(:GOOMY, :GOOEY, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Cotton Down", [mon(:GOSSIFLEUR, :COTTONDOWN, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Sand Spit", [mon(:SILICOBRA, :SANDSPIT, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Perish Body", [mon(:CURSOLA, :PERISHBODY, [:ASTONISH])], [mon(:RATTATA, :RUNAWAY, [:BITE])], 4
scenario "Wandering Spirit", [mon(:RUNERIGUS, :WANDERINGSPIRIT, [:ASTONISH])], [mon(:RATTATA, :GUTS, [:BITE])], 2
scenario "Water Compaction", [mon(:SANDYGAST, :WATERCOMPACTION, [:ABSORB])], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 1
scenario "Illusion", [mon(:ZORUA, :ILLUSION, [:SCRATCH]), mon(:CYNDAQUIL, :BLAZE, [:TACKLE])],
         [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Innards Out", [mon(:PYUKUMUKU, :INNARDSOUT, [:SPLASH], 20)], [mon(:TYPHLOSION, :BLAZE, [:FLAMEWHEEL], 80)], 1
scenario "Electromorphosis", [mon(:TADBULB, :ELECTROMORPHOSIS, [:THUNDERSHOCK])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Seed Sower", [mon(:ARBOLIVA, :SEEDSOWER, [:ABSORB])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Thermal Exchange", [mon(:FRIGIBAX, :THERMALEXCHANGE, [:TACKLE])], [mon(:CYNDAQUIL, :BLAZE, [:EMBER, :WILLOWISP])],
         [[0, 0], [0, 1]]
scenario "Toxic Debris", [mon(:GLIMMET, :TOXICDEBRIS, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Anger Shell", [mon(:KLAWF, :ANGERSHELL, [:TACKLE], hp: [3, 5])], [mon(:TYPHLOSION, :BLAZE, [:TACKLE], 60)], 2
# OnDealingHit / OnEndOfUsingMove / AfterMoveUseFromTarget
scenario "Moxie", [mon(:TYPHLOSION, :MOXIE, [:FLAMEWHEEL], 80)], [mon(:PIDGEY, :KEENEYE, [:GROWL], 5), mon(:RATTATA, :RUNAWAY, [:GROWL], 5)],
         2, trainer: true
scenario "Beast Boost", [mon(:NIHILEGO, :BEASTBOOST, [:POUND], 80)], [mon(:PIDGEY, :KEENEYE, [:GROWL], 5), mon(:RATTATA, :RUNAWAY, [:GROWL], 5)],
         2, trainer: true
scenario "Magician", [mon(:FENNEKIN, :MAGICIAN, [:EMBER])], [mon(:RATTATA, :RUNAWAY, [:TACKLE], i: :ORANBERRY)], 1
scenario "Color Change", [mon(:KECLEON, :COLORCHANGE, [:SCRATCH])], [mon(:CYNDAQUIL, :BLAZE, [:EMBER])], 2
scenario "Pickpocket", [mon(:SNEASEL, :PICKPOCKET, [:SCRATCH])], [mon(:RATTATA, :RUNAWAY, [:TACKLE], i: :ORANBERRY)], 1
scenario "Berserk", [mon(:DRAMPA, :BERSERK, [:TACKLE], hp: [3, 5])], [mon(:TYPHLOSION, :BLAZE, [:FLAMEWHEEL], 60)], 1
# EndOfRoundWeather / EndOfRoundHealing / EndOfRoundEffect / EndOfRoundGainItem
scenario "Rain Dish", [mon(:LOTAD, :RAINDISH, [:RAINDANCE, :ABSORB], hp: [1, 2])], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 2
scenario "Ice Body", [mon(:SNORUNT, :ICEBODY, [:HAIL, :POWDERSNOW], hp: [1, 2])], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 2
scenario "Hydration", [mon(:SEEL, :HYDRATION, [:RAINDANCE], st: "PARALYSIS")], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 2
scenario "Healer (ally)", [mon(:CHANSEY, :HEALER, [:POUND]), mon(:RATTATA, :GUTS, [:TACKLE], st: "BURN")],
         [mon(:PIDGEY, :KEENEYE, [:GROWL]), mon(:SPEAROW, :KEENEYE, [:GROWL])], 4, double: true, seed: 2
scenario "Bad Dreams", [mon(:DARKRAI, :BADDREAMS, [:HYPNOSIS], 40)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 3
scenario "Harvest (Sun)", [mon(:EXEGGCUTE, :HARVEST, [:SUNNYDAY], i: :ORANBERRY, hp: [2, 5])], [mon(:RATTATA, :RUNAWAY, [:TACKLE], 40)], 3, items: true
scenario "Cud Chew", [mon(:TAUROS, :CUDCHEW, [:TACKLE], i: :ORANBERRY, hp: [2, 5])], [mon(:RATTATA, :RUNAWAY, [:TACKLE], 40)], 3, items: true
# TrappingByTarget / CertainEscapeFromBattle
scenario "Shadow Tag", [mon(:CYNDAQUIL, :BLAZE, [:TACKLE]), mon(:PIDGEY, :KEENEYE)], [mon(:WOBBUFFET, :SHADOWTAG, [:SPLASH])],
         [["s1", 0], ["r", 0]]
scenario "Arena Trap", [mon(:CYNDAQUIL, :BLAZE, [:EMBER]), mon(:PIDGEY, :KEENEYE)], [mon(:DIGLETT, :ARENATRAP, [:SCRATCH])],
         [["s1", 0], [0, 0]], trainer: true
scenario "Magnet Pull", [mon(:STEELIX, :STURDY, [:TACKLE]), mon(:CYNDAQUIL, :BLAZE)], [mon(:MAGNEMITE, :MAGNETPULL, [:THUNDERSHOCK])],
         [["s1", 0], [0, 0]], trainer: true
# OnSwitchIn
scenario "Drizzle", [mon(:POLITOED, :DRIZZLE, [:WATERGUN])], [mon(:VULPIX, :FLASHFIRE, [:EMBER])], 2
scenario "Sand Stream", [mon(:TYRANITAR, :SANDSTREAM, [:BITE])], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 2
scenario "Snow Warning", [mon(:SNOVER, :SNOWWARNING, [:POWDERSNOW])], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 2
scenario "Pressure", [mon(:ZAPDOS, :PRESSURE, [:PECK])], [mon(:PIDGEY, :KEENEYE, [:GROWL])], 1
scenario "Anticipation", [mon(:CROAGUNK, :ANTICIPATION, [:POUND])], [mon(:PANCHAM, :IRONFIST, [:KARATECHOP, :CONFUSION])], 1
scenario "Download", [mon(:PORYGON, :DOWNLOAD, [:TACKLE])], [mon(:GEODUDE, :STURDY, [:DEFENSECURL])], 1
scenario "Trace", [mon(:PORYGON, :TRACE, [:TACKLE])], [mon(:GROWLITHE, :INTIMIDATE, [:EMBER])], 1
scenario "Electric Surge", [mon(:TAPUKOKO, :ELECTRICSURGE, [:THUNDERSHOCK], 30)], [mon(:DROWZEE, :FOREWARN, [:HYPNOSIS])], 2
scenario "Psychic Surge", [mon(:TAPULELE, :PSYCHICSURGE, [:CONFUSION], 30)], [mon(:RATTATA, :RUNAWAY, [:QUICKATTACK])], 2
scenario "Air Lock", [mon(:RAYQUAZA, :AIRLOCK, [:TACKLE], 30)], [mon(:POLITOED, :DRIZZLE, [:WATERGUN])], 1
scenario "Slow Start", [mon(:REGIGIGAS, :SLOWSTART, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Neutralizing Gas", [mon(:KOFFING, :NEUTRALIZINGGAS, [:TACKLE])], [mon(:GROWLITHE, :INTIMIDATE, [:EMBER])], 1
scenario "Intrepid Sword", [mon(:ZACIAN, :INTREPIDSWORD, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Dauntless Shield", [mon(:ZAMAZENTA, :DAUNTLESSSHIELD, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Screen Cleaner", [mon(:MRMIME, :FILTER, [:REFLECT]), mon(:MRMIME, :SCREENCLEANER, [:CONFUSION], f: 1)],
         [mon(:RATTATA, :RUNAWAY, [:LIGHTSCREEN])], [[0, 0], ["s1", 0]], trainer: true
scenario "Curious Medicine", [mon(:SLOWPOKE, :OBLIVIOUS, [:TACKLE]), mon(:SLOWPOKE, :CURIOUSMEDICINE, [:TACKLE], f: 1)],
         [mon(:GROWLITHE, :INTIMIDATE, [:EMBER]), mon(:PIDGEY, :KEENEYE, [:GROWL])],
         [[[0, 1], [0, 0], [0, 3], [0, 0]]], double: true
scenario "Costar", [mon(:FLAMIGO, :COSTAR, [:PECK]), mon(:GROWLITHE, :INTIMIDATE, [:TACKLE], 5), mon(:MANKEY, :DEFIANT, [:FOCUSENERGY])],
         [mon(:TYPHLOSION, :BLAZE, [:EMBER], 80), mon(:PIDGEY, :KEENEYE, [:GROWL])],
         [[[0, 1], [0, 2], [0, 3], [0, 0]]], double: true
scenario "Supreme Overlord", [mon(:RATTATA, :RUNAWAY, [:TACKLE], 5), mon(:KINGAMBIT, :SUPREMEOVERLORD, [:TACKLE], 30)],
         [mon(:TYPHLOSION, :BLAZE, [:FLAMEWHEEL], 80)], 2, trainer: true
scenario "Tablets of Ruin", [mon(:WOCHIEN, :TABLETSOFRUIN, [:ABSORB], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Protosynthesis (Drought)", [mon(:GREATTUSK, :PROTOSYNTHESIS, [:TACKLE], 30)], [mon(:VULPIX, :DROUGHT, [:EMBER])], 2
scenario "Quark Drive (Electric Surge)", [mon(:IRONTREADS, :QUARKDRIVE, [:TACKLE], 30)], [mon(:TAPUKOKO, :ELECTRICSURGE, [:THUNDERSHOCK], 30)], 2
scenario "Orichalcum Pulse", [mon(:KORAIDON, :ORICHALCUMPULSE, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Hadron Engine", [mon(:MIRAIDON, :HADRONENGINE, [:THUNDERSHOCK], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Wind Rider", [mon(:BRAMBLIN, :WINDRIDER, [:TACKLE])], [mon(:PIDGEY, :KEENEYE, [:BLEAKWINDSTORM])], 2
scenario "Wind Power", [mon(:WATTREL, :WINDPOWER, [:THUNDERSHOCK])], [mon(:PIDGEY, :KEENEYE, [:BLEAKWINDSTORM])], 2
scenario "As One", [mon(:CALYREX, :ASONECHILLINGNEIGH, [:CONFUSION], 30, f: 1)], [mon(:BELLSPROUT, :GLUTTONY, [:TACKLE], i: :ORANBERRY, hp: [1, 3])], 1, items: true
# OnSwitchOut
scenario "Natural Cure", [mon(:STARYU, :NATURALCURE, [:TACKLE], st: "PARALYSIS"), mon(:PIDGEY, :KEENEYE)],
         [mon(:RATTATA, :RUNAWAY, [:GROWL])], [["s1", 0], ["s0", 0]], trainer: true
scenario "Regenerator", [mon(:SLOWPOKE, :REGENERATOR, [:TACKLE], hp: [1, 2]), mon(:PIDGEY, :KEENEYE)],
         [mon(:RATTATA, :RUNAWAY, [:GROWL])], [["s1", 0], ["s0", 0]], trainer: true
scenario "Zero to Hero", [mon(:FINIZEN, :ZEROTOHERO, [:TACKLE]), mon(:PIDGEY, :KEENEYE)],
         [mon(:RATTATA, :RUNAWAY, [:GROWL])], [["s1", 0], ["s0", 0]], trainer: true
# ChangeOnBattlerFainting / OnBattlerFainting
scenario "Receiver", [mon(:PASSIMIAN, :RECEIVER, [:TACKLE]), mon(:RATTATA, :GUTS, [:TACKLE], 5)],
         [mon(:TYPHLOSION, :BLAZE, [:EMBER], 80), mon(:PIDGEY, :KEENEYE, [:GROWL])],
         [[[0, 1], [0, 2], [0, 3], [0, 0]], [[0, 1], [0, 0], [0, 3], [0, 0]]], double: true
scenario "Soul-Heart", [mon(:MAGEARNA, :SOULHEART, [:TACKLE], 80)],
         [mon(:PIDGEY, :KEENEYE, [:GROWL], 5), mon(:RATTATA, :RUNAWAY, [:GROWL], 5)], 2, trainer: true
# OnTerrainChange
scenario "Mimicry", [mon(:STUNFISK, :MIMICRY, [:TACKLE], f: 1)], [mon(:TAPUKOKO, :ELECTRICSURGE, [:THUNDERSHOCK], 30)], 1
# OnTypeChange
scenario "Protean (once per switch-in)", [mon(:FROAKIE, :PROTEAN, [:BUBBLE, :QUICKATTACK])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], [[1, 0], [0, 0]]
# OnOpposingStatGain
scenario "Opportunist", [mon(:ESPATHRA, :OPPORTUNIST, [:PECK])], [mon(:BIDOOF, :SIMPLE, [:DEFENSECURL])], 2
# Gen 9 replacements of old handlers
scenario "Illuminate (Gen 9)", [mon(:STARYU, :ILLUMINATE, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:SANDATTACK])], 2
scenario "Battle Bond (Gen 9)", [mon(:GRENINJA, :BATTLEBOND, [:WATERGUN], 80, f: 1)],
         [mon(:PIDGEY, :KEENEYE, [:GROWL], 5), mon(:RATTATA, :RUNAWAY, [:GROWL], 5)], 2, trainer: true
scenario "Purifying Salt", [mon(:NACLI, :PURIFYINGSALT, [:TACKLE])], [mon(:GASTLY, :LEVITATE, [:LICK, :WILLOWISP])], [[0, 0], [0, 1]]
scenario "Earth Eater", [mon(:ORTHWORM, :EARTHEATER, [:TACKLE], hp: [1, 2])], [mon(:WOOPER, :DAMP, [:MUDSLAP])], 1
scenario "Good as Gold", [mon(:GHOLDENGO, :GOODASGOLD, [:TACKLE], 30)], [mon(:MAREEP, :STATIC, [:THUNDERWAVE])], 1
scenario "Sharpness", [mon(:GALLADE, :SHARPNESS, [:AQUACUTTER], 30)], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Mycelium Might", [mon(:TOEDSCOOL, :MYCELIUMMIGHT, [:SPORE])], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 60)], 1

# More chance-based effects (want: picks a seed that triggers them)
scenario "Poison Point (Route 32 Wooper)", [mon(:WOOPER, :POISONPOINT, [:WATERGUN], f: 1)], [mon(:SPINARAK, :SWARM, [:POISONSTING, :SCRATCH])],
         [[0, 1]] * 4, want: "Poison Point"
scenario "Static (paralysis blocks a move)", [mon(:MAREEP, :STATIC, [:TACKLE])], [mon(:SENTRET, :FRISK, [:SCRATCH])], 4, want: "can't move"
scenario "Pickup (after a berry)", [mon(:AIPOM, :PICKUP, [:SCRATCH, :BUGBITE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE], i: :ORANBERRY)],
         [[1, 0], [0, 0]], want: "Pickup", items: true
scenario "Ball Fetch", [mon(:YAMPER, :BALLFETCH, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Sweet Veil (self)", [mon(:SWIRLIX, :SWEETVEIL, [:TACKLE])], [mon(:DROWZEE, :FOREWARN, [:HYPNOSIS])], 2
scenario "Hustle (miss)", [mon(:RATTATA, :HUSTLE, [:TACKLE], f: 1)], [mon(:SENTRET, :KEENEYE, [:GROWL])], 4, want: "missed"
scenario "Gooey (Tangling Hair copy)", [mon(:DUGTRIO, :TANGLINGHAIR, [:SCRATCH], f: 1)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 2
scenario "Trace (Intimidate re-triggers)", [mon(:RALTS, :TRACE, [:CONFUSION])], [mon(:EKANS, :INTIMIDATE, [:WRAP])], 1
scenario "Intimidate vs Inner Focus/Oblivious (Gen 8)", [mon(:ZUBAT, :INNERFOCUS, [:LEECHLIFE])], [mon(:SHINX, :INTIMIDATE, [:TACKLE])], 1
scenario "Intimidate (double)", [mon(:SNUBBULL, :INTIMIDATE, [:TACKLE]), mon(:LEDYBA, :RATTLED, [:TACKLE])],
         [mon(:GROWLITHE, :INTIMIDATE, [:EMBER]), mon(:SHINX, :RIVALRY, [:TACKLE])], 1, double: true

# Handlers not covered above
scenario "Aerilate", [mon(:PINSIR, :AERILATE, [:TACKLE])], [mon(:PANCHAM, :IRONFIST, [:GROWL])], 1
scenario "Galvanize", [mon(:GEODUDE, :GALVANIZE, [:TACKLE], f: 1)], [mon(:GOLDEEN, :WATERVEIL, [:GROWL])], 1
scenario "Refrigerate", [mon(:AMAURA, :REFRIGERATE, [:TACKLE])], [mon(:SUNKERN, :CHLOROPHYLL, [:GROWL])], 1
scenario "Defeatist", [mon(:ARCHEN, :DEFEATIST, [:PECK], hp: [1, 2])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Dragon's Maw", [mon(:REGIDRAGO, :DRAGONSMAW, [:DRAGONBREATH], 30)], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Flare Boost", [mon(:DRIFLOON, :FLAREBOOST, [:CONFUSION], st: "BURN")], [mon(:RATTATA, :INNERFOCUS, [:GROWL])], 1
scenario "Toxic Boost", [mon(:ZANGOOSE, :TOXICBOOST, [:SCRATCH], st: "POISON")], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Flower Gift (Sun)", [mon(:CHERRIM, :FLOWERGIFT, [:SUNNYDAY, :TACKLE]), mon(:PIDGEY, :KEENEYE, [:TACKLE])],
         [mon(:RATTATA, :RUNAWAY, [:GROWL]), mon(:SPEAROW, :KEENEYE, [:GROWL])],
         [[[0, 1], [0, 0], [0, 1], [0, 0]], [[1, 1], [0, 0], [0, 1], [0, 0]]], double: true
scenario "Gorilla Tactics (ZUD)", [mon(:DARMANITAN, :GORILLATACTICS, [:TACKLE, :SCRATCH], 30, f: 2)], [mon(:RATTATA, :RUNAWAY, [:GROWL])],
         [[0, 0], [1, 0]]
scenario "Grassy Surge + Grass Pelt", [mon(:SKIDDO, :GRASSPELT, [:TACKLE])], [mon(:TAPUBULU, :GRASSYSURGE, [:TACKLE], 30)], 2
scenario "Misty Surge", [mon(:TAPUFINI, :MISTYSURGE, [:WATERGUN], 30)], [mon(:MAREEP, :STATIC, [:THUNDERWAVE])], 2
scenario "Ice Scales", [mon(:FROSMOTH, :ICESCALES, [:TACKLE], 30)], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 1
scenario "Marvel Scale", [mon(:MILOTIC, :MARVELSCALE, [:TACKLE], 30, st: "PARALYSIS")], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Mega Launcher", [mon(:CLAUNCHER, :MEGALAUNCHER, [:WATERPULSE])], [mon(:RATTATA, :INNERFOCUS, [:GROWL])], 1
scenario "Neuroforce", [mon(:NECROZMA, :NEUROFORCE, [:CONFUSION], 30)], [mon(:PANCHAM, :IRONFIST, [:GROWL])], 1
scenario "Punk Rock", [mon(:TOXTRICITY, :PUNKROCK, [:HYPERVOICE], 30)], [mon(:JIGGLYPUFF, :PUNKROCK, [:HYPERVOICE])], 1
scenario "Pure Power", [mon(:MEDITITE, :PUREPOWER, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Prism Armor (Mold Breaker)", [mon(:PANCHAM, :MOLDBREAKER, [:POISONJAB])], [mon(:NECROZMA, :PRISMARMOR, [:GROWL], 30)], 1
scenario "Solid Rock", [mon(:GEODUDE, :SOLIDROCK, [:TACKLE])], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 1
scenario "Sand Force + Sand Rush", [mon(:EXCADRILL, :SANDFORCE, [:SANDSTORM, :METALCLAW], 30), mon(:SANDSHREW, :SANDRUSH, [:SCRATCH])],
         [mon(:RATTATA, :RUNAWAY, [:GROWL], 60), mon(:PIDGEY, :KEENEYE, [:GROWL], 60)],
         [[[0, 1], [0, 0], [0, 1], [0, 0]], [[1, 1], [0, 0], [0, 3], [0, 0]]], double: true
scenario "Slush Rush (Snow Warning)", [mon(:CUBCHOO, :SLUSHRUSH, [:POWDERSNOW])], [mon(:SNOVER, :SNOWWARNING, [:TACKLE], 60)], 2
scenario "Surge Surfer", [mon(:RAICHU, :SURGESURFER, [:THUNDERSHOCK], f: 1)], [mon(:TAPUKOKO, :ELECTRICSURGE, [:TACKLE], 40)], 2
scenario "Shell Armor (Frost Breath)", [mon(:SHELLDER, :SHELLARMOR, [:TACKLE])], [mon(:SNORUNT, :INNERFOCUS, [:FROSTBREATH])], 1
scenario "Stakeout", [mon(:GUMSHOOS, :STAKEOUT, [:TACKLE]), mon(:PIDGEY, :KEENEYE)],
         [mon(:RATTATA, :RUNAWAY, [:GROWL]), mon(:SENTRET, :RUNAWAY, [:GROWL])], [[0, "s1"]], trainer: true
scenario "Steelworker", [mon(:DHELMISE, :STEELWORKER, [:METALCLAW], 30)], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Steely Spirit (ally)", [mon(:PERRSERKER, :STEELYSPIRIT, [:GROWL], 30), mon(:MAGNEMITE, :STURDY, [:METALCLAW])],
         [mon(:RATTATA, :RUNAWAY, [:GROWL]), mon(:PIDGEY, :KEENEYE, [:GROWL])], 1, double: true
scenario "Power Spot (ally)", [mon(:STONJOURNER, :POWERSPOT, [:GROWL], 30), mon(:PIDGEY, :KEENEYE, [:TACKLE])],
         [mon(:RATTATA, :RUNAWAY, [:GROWL]), mon(:SENTRET, :RUNAWAY, [:GROWL])], 1, double: true
scenario "Transistor", [mon(:REGIELEKI, :TRANSISTOR, [:THUNDERSHOCK], 30)], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Water Bubble", [mon(:DEWPIDER, :WATERBUBBLE, [:BUBBLE])], [mon(:CYNDAQUIL, :BLAZE, [:EMBER, :WILLOWISP])], [[0, 0], [0, 1]]
scenario "White Smoke", [mon(:TORKOAL, :WHITESMOKE, [:EMBER])], [mon(:GROWLITHE, :INTIMIDATE, [:LEER])], 1
scenario "Unburden", [mon(:HITMONLEE, :UNBURDEN, [:TACKLE], i: :ORANBERRY, hp: [3, 5])], [mon(:YANMA, :SPEEDBOOST, [:TACKLE], 55)], 3, items: true
scenario "Iron Barbs", [mon(:FERROSEED, :IRONBARBS, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Teravolt / Turboblaze", [mon(:ZEKROM, :TERAVOLT, [:TACKLE], 30)], [mon(:RESHIRAM, :TURBOBLAZE, [:TACKLE], 30)], 1
scenario "Dark Aura + Aura Break", [mon(:YVELTAL, :DARKAURA, [:BITE], 30)], [mon(:ZYGARDE, :AURABREAK, [:BITE], 30)], 1
scenario "Fairy Aura", [mon(:XERNEAS, :FAIRYAURA, [:DRAININGKISS], 30)], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Desolate Land", [mon(:GROUDON, :DESOLATELAND, [:TACKLE], 30)], [mon(:TOTODILE, :TORRENT, [:WATERGUN])], 2
scenario "Primordial Sea", [mon(:KYOGRE, :PRIMORDIALSEA, [:TACKLE], 30)], [mon(:CYNDAQUIL, :BLAZE, [:EMBER])], 2
scenario "Delta Stream", [mon(:RAYQUAZA, :DELTASTREAM, [:TACKLE], 30)], [mon(:PANCHAM, :IRONFIST, [:ROCKTHROW])], 2
scenario "Ice Face", [mon(:EISCUE, :ICEFACE, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE, :HAIL])], [[0, 0], [0, 1], [0, 0]]
scenario "Pastel Veil", [mon(:PONYTA, :PASTELVEIL, [:TACKLE], f: 1), mon(:RATTATA, :GUTS, [:TACKLE])],
         [mon(:GRIMER, :STENCH, [:TOXIC]), mon(:PIDGEY, :KEENEYE, [:POISONPOWDER])],
         [[[0, 1], [0, 2], [0, 3], [0, 2]]], double: true
scenario "Queenly Majesty", [mon(:TSAREENA, :QUEENLYMAJESTY, [:TACKLE])], [mon(:RATTATA, :RUNAWAY, [:QUICKATTACK])], 1
scenario "Armor Tail", [mon(:FARIGIRAF, :ARMORTAIL, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:QUICKATTACK])], 1
scenario "Rocky Payload", [mon(:BOMBIRDIER, :ROCKYPAYLOAD, [:ROCKTHROW])], [mon(:RATTATA, :RUNAWAY, [:GROWL])], 1
scenario "Well-Baked Body", [mon(:DACHSBUN, :WELLBAKEDBODY, [:TACKLE])], [mon(:CYNDAQUIL, :BLAZE, [:EMBER])], 1
scenario "Lingering Aroma", [mon(:OINKOLOGNE, :LINGERINGAROMA, [:TACKLE])], [mon(:RATTATA, :GUTS, [:BITE])], 2
scenario "Beads of Ruin", [mon(:CHIYU, :BEADSOFRUIN, [:EMBER], 30)], [mon(:RATTATA, :RUNAWAY, [:WATERGUN])], 1
scenario "Sword of Ruin", [mon(:CHIENPAO, :SWORDOFRUIN, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], 1
scenario "Vessel of Ruin", [mon(:TINGLU, :VESSELOFRUIN, [:TACKLE], 30)], [mon(:RATTATA, :RUNAWAY, [:EMBER])], 1
scenario "Libero", [mon(:SCORBUNNY, :LIBERO, [:EMBER, :TACKLE])], [mon(:RATTATA, :RUNAWAY, [:TACKLE])], [[1, 0], [0, 0]]
scenario "Grim Neigh", [mon(:SPECTRIER, :GRIMNEIGH, [:DARKPULSE], 60)], [mon(:PIDGEY, :KEENEYE, [:GROWL], 5), mon(:RATTATA, :RUNAWAY, [:GROWL], 5)],
         2, trainer: true
scenario "Chilling Neigh", [mon(:GLASTRIER, :CHILLINGNEIGH, [:TACKLE], 60)], [mon(:PIDGEY, :KEENEYE, [:GROWL], 5), mon(:RATTATA, :RUNAWAY, [:GROWL], 5)],
         2, trainer: true

# Ruby bugs the port fixes on purpose; ability_reference.rb applies the same
# fixes to the Ruby handlers (patch_ability_handler). Cotton Down's fix (it
# checked Defense) only differs in edge cases, so the plain scenario covers it.
# Hypnosis inflicts Drowsy with no user, so there is no one to pass it back to;
# no move in the PBS data drowses or frostbites with a user, so the fixed
# branches never run in this game.
scenario "Synchronize (Drowsy from Hypnosis)", [mon(:NATU, :SYNCHRONIZE, [:PECK])], [mon(:DROWZEE, :FOREWARN, [:HYPNOSIS])], 2, want: "drowsy"
scenario "Neutralizing Gas vs Ability Shield", [mon(:KOFFING, :NEUTRALIZINGGAS, [:TACKLE])],
         [mon(:GROWLITHE, :INTIMIDATE, [:EMBER], i: :ABILITYSHIELD)], 1
scenario "Magician vs Sticky Hold", [mon(:FENNEKIN, :MAGICIAN, [:EMBER])], [mon(:GRIMER, :STICKYHOLD, [:POUND], i: :ORANBERRY)], 1
scenario "Bad Dreams vs Magic Guard", [mon(:DARKRAI, :BADDREAMS, [:POUND], 40)], [mon(:ABRA, :MAGICGUARD, [:TACKLE], st: "SLEEP")], 2
scenario "Forewarn (Eruption)", [mon(:DROWZEE, :FOREWARN, [:POUND])], [mon(:CAMERUPT, :MAGMAARMOR, [:ERUPTION, :FLAMETHROWER])], 1
scenario "Mummy vs Mummy", [mon(:YAMASK, :MUMMY, [:ASTONISH])], [mon(:COFAGRIGUS, :MUMMY, [:BITE])], 2
scenario "Opportunist (stats maxed)", [mon(:ESPATHRA, :OPPORTUNIST, [:BELLYDRUM])], [mon(:RATTATA, :RUNAWAY, [:SWORDSDANCE])], 2
