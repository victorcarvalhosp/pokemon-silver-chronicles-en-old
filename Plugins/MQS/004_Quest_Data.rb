module QuestModule

  # You don't actually need to add any information, but the respective fields in the UI will be blank or "???"
  # I included this here mostly as an example of what not to do, but also to show it's a thing that exists
  Quest0 = {

  }
  # change 3

  # Here's the simplest example of a single-stage quest with everything specified - test
  # Quest1 = {
  #   :ID => "1",
  #   :Name => "Introductions",
  #   :QuestGiver => "Little Boy",
  #   :Stage1 => "Look for clues.",
  #   :Location1 => "Lappet Town",
  #   :QuestDescription => "Some wild Pokémon stole a little boy's favourite toy. Find those troublemakers and help him get it back.",
  #   :RewardString => "Something shiny!"
  # }

  # Here's an extension of the above that includes multiple stages
  MysteryEgg = {
    :ID => "1",
    :Name => "The journey begins",
    :QuestGiver => "Professor Elm",
    :Stage1 => "Get package with Mr. Pokémon.",
    :Stage2 => "Return Mystery Egg.",
    :Location1 => "Past Cherrygrove City",
    :Location2 => "New Bark Town",
    :QuestDescription => "Professor Elm asked you to get something with Mr. Pokémon for him. It's probably an Egg.",
  }

  # @todo: Still need to add code to complete it in the game
  JohtoPokedex = {
    :ID => "2",
    :Name => "Gotta catch ‘em all!",
    :QuestGiver => "Professor Oak",
    :Stage1 => "Complete the Johto Pokédex.",
    :Stage2 => "Register at least 6 Pokémon.",
    :Stage3 => "Register at least 20 Pokémon.",
    :Stage4 => "Register at least 35 Pokémon.",
    :Stage5 => "Register at least 55 Pokémon.",
    :Stage6 => "Register at least 80 Pokémon.",
    :Location1 => "nil",
    :Location2 => "Route 31",
    :QuestDescription => "Go meet many kinds of Pokémon and complete that Pokédex!",
  }
  # @todo: Still need to add code to complete it in the game

  JohtoGymChallenge = {
    :ID => "3",
    :Name => "Pokémon Gym challenge",
    :QuestGiver => "Professor Elm",
    :Stage1 => "Challenge Violet City's Gym.",
    :Stage2 => "Challenge Azalea Town's Gym.",
    :Stage3 => "Challenge Goldenrod City's Gym.",
    :Stage4 => "Challenge Ecruteak City's Gym.",
    :Stage5 => "Challenge the next Gym.",
    :Stage6 => "Challenge Blackthorn City's Gym.",
    :Stage7 => "Talk with Professor Elm.",
    :Location1 => "Violet City",
    :Location2 => "Azalea Town",
    :Location3 => "Goldenrod City",
    :Location4 => "Ecruteak City",
    :Location5 => "Cianwood, Olivine or Mahogany Town",
    :Location6 => "Blackthorn City",
    :Location7 => "New Bark Town",
    :QuestDescription => "Collect all 8 Gym Badges in Johto. If you manage to defeat all the Gym Leaders, you'll eventually challenge the Pokémon League Champion!",
  }

  StudentInDarkCave = {
    :ID => "4",
    :Name => "Playing in a Dark Cave...",
    :QuestGiver => "Teacher Earl",
    :Stage1 => "Search for the missing student.",
    :Stage2 => "Go back to Violet School.",
    :Location1 => "Dark Cave",
    :Location2 => "Violet City",
    :QuestDescription => "A student lef for recess and didn't return yet! He was saying something about playing in a Dark Cave...",
  }

  SproutTower = {
    :ID => "4",
    :Name => "Sprout Tower challenge",
    :QuestGiver => "nil",
    :Stage1 => "Train in the Sprout Tower.",
    :Location1 => "Violet City",
    :QuestDescription => "Facing Falkner must be very difficult for you, better train in the Sprout Tower before.",
  }

  TogepiEgg = {
    :ID => "5",
    :Name => "Caring for the Mystery Egg",
    :QuestGiver => "Professor Elm",
    :Stage1 => "Get Egg with the assistant.",
    :Stage2 => "Hatch the egg.",
    :Location1 => "Violet City Poké Center",
    :Location2 => "???",
    :QuestDescription => "Professor Elm wants you to take care of an Egg. It seems that a Pokémon will hatch from it only when you keep it in your party of Pokémon.",
  }

  BellsproutTrade = {
    :ID => "6",
    :Name => "Rocky Trade",
    :QuestGiver => "Youngster Andy",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Violet City",
    :QuestDescription => "This youngster in Violet City wants to trade a Bellsprout for his Onix. Do you think it's a good trade?",
  }


  RuinsOfAlphPuzzleOne = {
    :ID => "7",
    :Name => "Mysterious Ruins",
    :QuestGiver => "nil",
    :Stage1 => "Check the Ruins Misteries.",
    :Location1 => "Ruins of Alph",
    :QuestDescription => "There are odd patterns drawn on the walls of the ruins. They must be the keys for unraveling it's misteries.",
  }

  SchoolKidPhanpy = {
    :ID => "8",
    :Name => "Phanpy's fan",
    :QuestGiver => "School Kid Henry",
    :Stage1 => "Catch a Phanpy.",
    :Location1 => "Route 46",
    :RewardString => "Berries!",
    :QuestDescription => "This kid near Route 46 really wants to see a Phanpy. If you can help with that, he's happy to thank you with some berries as a thank-you gift.",
  }

  TCGInitiation = {
    :ID => "9",
    :Name => "Pokémon Cards",
    :QuestGiver => "TCG Fan Jack",
    :Stage1 => "Open the Booster Pack.",
    :Stage2 => "Win the TCG duel.",
    :Location1 => "Violet City Mart",
    :Location2 => "Violet City Mart",
    :RewardString => "A nice Pokémon Card",
    :QuestDescription => "This guy gave you a nice binder and a booster pack of Pokémon cards. He's really excited to see what you got! Open the pack and show him your new cards and learn how to play Pokémon TCG.",
  }

  TCGLeague = {
    :ID => "10",
    :Name => "Pokémon Card Clubs Challenge",
    :QuestGiver => "TCG Fan Jack",
    :Stage1 => "Defeat the Grass Club.",
    :Stage2 => "Defeat the Fighting Club.",
    :Stage3 => "Defeat the Rock Club.",
    :Stage4 => "Defeat the Water Club.",
    :Stage5 => "Defeat the Lightning Club.",
    :Stage6 => "Defeat the Psychic Club.",
    :Stage7 => "Defeat the Fire Club.",
    :Stage8 => "Defeat the Science Club.",
    :Location1 => "??",
    :Location2 => "??",
    :Location3 => "??",
    :Location4 => "??",
    :Location5 => "??",
    :Location6 => "??",
    :Location7 => "??",
    :Location8 => "??",
    :QuestDescription => "Defeat all 8 Card Clubs in Johto. If you manage to defeat all the Club Masters, you may inherit the Legendary Pokémon Cards!",
  }

  SlowpokeWell = {
    :ID => "11",
    :Name => "Slowpoke Rescue",
    :QuestGiver => "Kurt",
    :Stage1 => "Check the Slowpoke Well.",
    :Location1 => "Slowpoke Well",
    :QuestDescription => "Team Rocket is cutting off SlowpokeTails for sale. Help Kurt to stop them!",
  }

  FarfetchRescue = {
    :ID => "12",
    :Name => "Lazy Farfetch'd",
    :QuestGiver => "Charcoal Maker",
    :Stage1 => "Find the Farfetch'd.",
    :Location1 => "Ilex Forest",
    :QuestDescription => "One of the FARFETCH'D that cut trees for charcoal took off in the forest. Bring it back to the Charcoal Maker Apprentice.",
  }

  MaizieTeddiursa = {
    :ID => "13",
    :Name => "Cute Teddiursa",
    :QuestGiver => "Maizie",
    :Stage1 => "Catch a Teddiursa.",
    :Location1 => "Azalea Town",
    :QuestDescription => "Kurt's grand daughter wants a Teddiursa, can you catch one and bring it to her?",
  }

  WildPokemonInGoldenrod = {
    :ID => "14",
    :Name => "Wild Pokémon in Goldenrod",
    :Stage1 => "Catch the thief Pokémon.",
    :Location1 => "Goldenrod City",
    :QuestDescription => "This Pokémon is stealing items in Goldenrod City, can you make it stop?",
  }

  LetterDeliver = {
    :ID => "15",
    :Name => "Letter Delivery",
    :QuestGiver => "Webster",
    :Stage1 => "Get the letter.",
    :Location1 => "Goldenrod City Gate",
    :Stage2 => "Deliver the letter.",
    :Location2 => "Route 31",
    :QuestDescription => "This guy received a letter from a friend. Now he's asking for you to deliver the reply he wrote to his friend.",
  }

  BurnedTower = {
    :ID => "16",
    :Name => "Burned Tower",
    :Stage1 => "Explore the Burned Tower.",
    :Location1 => "Ecruteak City",
    :QuestDescription => "Morty, the Gym Leader, has gone to the Burned Tower. Go there to investigate what's happening.",
  }

  KimonoGirlsEcruteak = {
    :ID => "17",
    :Name => "Kimono Girls power",
    :Stage1 => "Defeat the 5 Kimono Girls.",
    :Location1 => "Ecruteak City - Dance Theater",
    :QuestGiver => "Hiroshi",
    :QuestDescription => "Not only are the Kimono Girls great dancers, they're also skilled at Pokémon. If you win against them, you'll receive a gift.",
  }

  OlivineLighthouse = {
    :ID => "18",
    :Name => "Lighthouse is turned off?",
    :Stage1 => "Go to the Lighthouse.",
    :Location1 => "Olivine City",
    :Stage2 => "Get some medicines to Amphy.",
    :Location2 => "Cianwood City",
    :Stage3 => "Deliver the medicines to Amphy.",
    :Location3 => "Olivine City - Lighthouse",
    :QuestDescription => "Olivine City Gym Leader isn't in the Gym, she is taking care of a sick Pokémon at the Lighthouse.",
  }

  MantykeTrade = {
    :ID => "19",
    :Name => "Billy Trade",
    :QuestGiver => "Fisherman Richard",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Olivine City",
    :QuestDescription => "This fisherman in Olivine City wants to trade a Krabby for his Mantyke. Do you think it's a good trade?",
  }

  TeamRockerGoldenrod = {
    :ID => "20",
    :Name => "Team Rocket is back?!",
    :QuestGiver => "Prof. Elm",
    :Stage1 => "Investigate the Radio Tower.",
    :Location1 => "Goldenrod City",
    :Stage2 => "Investigate the Underground Warehouse.",
    :Location2 => "Goldenrod City",
    :Stage3 => "Go to the transmission room.",
    :Location3 => "Radio Tower 5F",
    :QuestDescription => "Something weird is happening with the radio broadcasts. Maybe Team Rocket has returned. Do you know anything about it?",
  }

  MrMimeTrade = {
    :ID => "21",
    :Name => "Maria Trade",
    :QuestGiver => "Schoolgirl Maria",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Blackthorn City",
    :QuestDescription => "This schoolgirl in Blackthorn City wants to trade a Dratini for her Mr. Mime. Do you think it's a good trade?",
  }

  ArcheologyIsCool = {
    :ID => "22",
    :Name => "The Enigmatic Unown",
    :QuestGiver => "Researcher Albright",
    :Stage1 => "Catch an Unown.",
    :Location1 => "Ruins of Alph",
    :RewardString => "Thunder Stone",
    :QuestDescription => "Catch and bring an Unown to the Leader Researcher Albright in the Ruins of Alph to help with his research.",
  }

  LugiaTeamRocket = {
    :ID => "23",
    :Name => "Pokémon Mistery",
    :QuestGiver => "Kimono Girl Kuni",
    :Stage1 => "Help Kuni to recover the Tidal Bell",
    :Location1 => "Whirl Islands",
    :QuestDescription => "The Tidal Bell was stolen by Team Rocket, now Kimono Girl Kuni needs your help to get it back.",
  }


  JohtoPokemonLeague = {
    :ID => "24",
    :Name => "Johto Pokémon League!",
    :QuestGiver => "Prof. Elm",
    :Stage1 => "Battle against Elite Four.",
    :Location1 => "Indigo Plateau",
    :QuestDescription => "The Indigo League and Johto League share a single group of Elite Four and Champion; eight Badges from either region will allow a Trainer to battle the Elite Four at Kanto's Indigo Plateau. Now this time has come for you!",
  }

  WorldChampionshipTraining = {
    :ID => "25",
    :Name => "Train for the World Cup",
    :QuestGiver => "Prof. Elm",
    :Stage1 => "Re-match Johto Gym Leaders",
    :Stage2 => "Re-match Johto Gym Leaders 1/8",
    :Stage3 => "Re-match Johto Gym Leaders 2/8",
    :Stage4 => "Re-match Johto Gym Leaders 3/8",
    :Stage5 => "Re-match Johto Gym Leaders 4/8",
    :Stage6 => "Re-match Johto Gym Leaders 5/8",
    :Stage7 => "Re-match Johto Gym Leaders 6/8",
    :Stage8 => "Re-match Johto Gym Leaders 7/8",
    :Stage9 => "Re-match Johto Gym Leaders 8/8",
    :QuestDescription => "Now that you are the new Champion, a lot of people will be looking for a rematch! This includes the Gym Leaders... They are allowed to use their full-power this time, so be prepared.",
  }

  SSAqua = {
    :ID => "26",
    :Name => "S. S. Aqua trip",
    :QuestGiver => "S. S. Aqua Captain",
    :Stage1 => "Battle against all S. S. Aqua Trainers",
    :Location1 => "S. S. Aqua",
    :QuestDescription => "Most passengers are  Trainers and they're all itching to battle in their cabins. If you defeat all of them, please let the Captain know.",
  }

  HotelCheckIn = {
    :ID => "27",
    :Name => "Grand Hotel Check-in",
    :Stage1 => "Battle against all S. S. Aqua trainers",
    :Location1 => "Colosseum Town",
    :QuestDescription => "Your battle will be just tomorrow, try to get some rest and build your strength for what's to come.",
  }

  FirstWorldCupBattle = {
    :ID => "28",
    :Name => "First Pokémon World Cup Match!",
    :Stage1 => "Fist World Cup Match!",
    :Stage3 => "Knockout phase begins!",
    :Stage3 => "Quarter-finals phase begins!",
    :Location1 => "Colosseum Town",
    :QuestDescription => "That's it, the World Cup started! Go to the Stadium to participate in your first match, that will be against Caitlin, from Unova!",
  }

  SecondWorldCupBattle = {
    :ID => "29",
    :Name => "Second Pokémon World Cup Match!",
    :Stage1 => "Get some rest in the Grand Hotel.",
    :Stage2 => "Second World Cup Match!",
    :Location1 => "Colosseum Town",
    :QuestDescription => "That's it, the World Cup started! Go to the Stadium to participate in your second match, that will be against Nessa, from Galar!",
  }

  ThirdWorldCupBattle = {
    :ID => "30",
    :Name => "Third Pokémon World Cup Match!",
    :Stage1 => "Get some rest in the Grand Hotel.",
    :Stage2 => "Third World Cup Match!",
    :Location1 => "Colosseum Town",
    :QuestDescription => "It's time for the last Match in the Group phase! This time you'll face Paul, from Sinnoh!",
  }

  RoundOf16Battle = {
    :ID => "31",
    :Name => "World Cup Round of 16!",
    :Stage1 => "Go to the Stadium.",
    :Location1 => "Colosseum Town",
    :QuestDescription => "It's time for the Round of 16! Go to the Stadium to see the draw and see who you'll face!",
  }

  RoundOf8Battle = {
    :ID => "31",
    :Name => "World Cup Round of 8!",
    :Stage1 => "Go to the Stadium.",
    :Location1 => "Colosseum Town",
    :QuestDescription => "You've made it to the Round of 8! Your next battle will be against your Rival, so be ready!",
  }


  OaksResearch = {
    :ID => "32",
    :Name => "Oak's new research!",
    :QuestGiver => "Professor Oak",
    :Stage1 => "Go talk with Professor Oak.",
    :Stage2 => "Mega Evolve your new Pokémon.",
    :Stage3 => "Visit the Pokémon Lab in Cinnabar.",
    :Location1 => "Pallet Town",
    :Location2 => "nil",
    :Location3 => "Cinnabar Island",
    # :Location2 => "Route 31",
    :QuestDescription => "Professor Oak is working on a new research and wants your help on it!",
  }

  # @todo: Still need to add code to complete it in the game
  KantoPokedex = {
    :ID => "33",
    :Name => "Gotta catch ‘em all(Kanto)!",
    :QuestGiver => "Professor Oak",
    :Stage1 => "Complete the Kanto Pokédex.",
    :Stage2 => "Register at least 80 Pokémon.",
    :Location1 => "nil",
    # :Location2 => "Route 31",
    :QuestDescription => "Go meet many kinds of Pokémon and complete the Kanto Pokédex!",
  }

  RedRescue = {
    :ID => "35",
    :Name => "Red's missing!",
    :QuestGiver => "Yellow",
    :Stage1 => "Search for Red in the Viridian Forest.",
    :Location1 => "Viridian Forest",
    :Stage2 => "Search for Red in the Mt. Moon.",
    :Location2 => "Mt. Moon",
    :QuestDescription => "Red's is missing since he won the World Cup. Help Yellow and Prof. Oak to find him!",
  }


  KantoGymChallenge = {
    :ID => "36",
    :Name => "Pokémon Gym challenge",
    :QuestGiver => "Prof. Carvalho",
    :Stage1 => "Challenge Kanto Gym Leaders",
    :Stage2 => "Challenge Kanto Gym Leaders 1/8",
    :Stage3 => "Challenge Kanto Gym Leaders 2/8",
    :Stage4 => "Challenge Kanto Gym Leaders 3/8",
    :Stage5 => "Challenge Kanto Gym Leaders 4/8",
    :Stage6 => "Challenge Kanto Gym Leaders 5/8",
    :Stage7 => "Challenge Kanto Gym Leaders 6/8",
    :Stage8 => "Challenge Kanto Gym Leaders 7/8",
    :Stage9 => "Challenge Kanto Gym Leaders 8/8",
    :QuestDescription => "Collect all 8 Gym Badges in Kanto. If you manage to defeat all the Gym Leaders, you'll eventually challenge the Kanto Pokémon League Champion!",
  }


  GrowlitheTrade = {
    :ID => "37",
    :Name => "Wiglett Trade",
    :QuestGiver => "Mr. Johnson",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Cerulean City",
    :QuestDescription => "This old man in Cerulean City wants to trade a Growlithe for his Wiglett. Do you think it's a good trade?",
  }

  BillHouse = {
    :ID => "38",
    :Name => "Blue Johto Pokémon",
    :QuestGiver => "Bill's Grandparent",
    :Stage1 => "Show Bill's Grandparent a blue and round Pokémon.",
    :Location1 => "Route 25",
    :QuestDescription => "Bill's grandparent wants to see a blue and round Pokemon from Johto. Can you show it to him?",
  }

  CopycatGirl = {
    :ID => "39",
    :Name => "Copycat Girl lost doll",
    :QuestGiver => "Copycat Girl",
    :Stage1 => "Find the lost doll from the Copycat Girl.",
    :Stage2 => "Return the doll to the Copycat Girl.",
    :Location1 => "Vermilion City",
    :Location2 => "Saffron City",
    :QuestDescription => "The Copycat girl lost her cherised Poke Doll when she was visiting Vermilion City. Can you find it for her?",
    :RewardString => "Magnet Train Ticket!"
  }

  RocketRadioBroadcast = {
    :ID => "40",
    :Name => "Strange Radio Broadcast",
    :QuestGiver => "Lance",
    :Stage1 => "Investigate the Radio Broadcast.",
    :Stage2 => "Open the Boss Office door.",
    :Stage3 => "Follow Murkrow.",
    :Stage4 => "Stop the Radio Broadcast.",
    :Location1 => "Mahogany Town",
    :Location2 => "Mahogany Town - Souvenir Shop",
    :Location3 => "Mahogany Town - Souvenir Shop",
    :Location4 => "Mahogany Town - Souvenir Shop",
    :QuestDescription => "It seems that the Lake of Rage's Magikarp are being forced to evolve. A misterious radio broadcast coming from Mahogany is probably the cause.",
  }

  AssociationElections = {
    :ID => "41",
    :Name => "Pokémon Association Elections",
    :Stage1 => "Participate in the Elections.",
    :Stage2 => "Vote in the Elections.",
    :Stage3 => "Wait for the results.",
    :Location1 => "Celadon City",
    :Location2 => "Celadon City",
    :Location3 => "Celadon City",
    :QuestDescription => "The Pokémon Association is holding elections to elect their new president. You can vote for the candidate of your choice.",
  }

  LavenderTVTower = {
    :ID => "42",
    :Name => "Association Media Control",
    :Stage1 => "Meet Yellow",
    :Stage2 => "Squeeze through the vents.",
    :Location1 => "Lavender Town",
    :Location2 => "Lavender Catacombs",
    :QuestDescription => "Giovanni’s always at the tower now, running broadcasts, speeches, 'updates'.But it’s not just news, it’s all carefully controlled. Yellow needs your help to investigate the tower and find out what’s going on.",
  }

  SilphCoResearch = {
    :ID => "43",
    :Name => "Agent017 Secret Research",
    :Stage1 => "Find Secret Research location.",
    :Stage2 => "Destroy Psychic barrier.",
    :Location1 => "Saffron City",
    :Location2 => "Saffron City",
    :QuestDescription => "Agent017 is now the boss of Team Rocket. He's been conducting a secret Mewtwo research. Find out what he's up to.",
  }

  KantoPokemonLeague = {
    :ID => "44",
    :Name => "Kanto Pokémon League!",
    :QuestGiver => "Prof. Oak",
    :Stage1 => "Battle against Elite Four.",
    :Location1 => "Indigo Plateau",
    :QuestDescription => "The time has come for you again to challenge the Elite Four! What are their new members? How stronger they are now?",
  }

  GSBall = {
    :ID => "45",
    :Name => "Mysterious Ball",
    :QuestGiver => "Prof. Elm",
    :Stage1 => "Deliver Mysterious Ball to Prof. Ivy.",
    :Location1 => "Valencia Island",
    :QuestDescription => "Professor Elm asked you to deliver a Mysterious Ball to Professor Ivy in order to continue their research.",
  }

  OrangeIslandsGymChallenge = {
    :ID => "46",
    :Name => "Orange League challenge",
    :QuestGiver => "Prof. Ivy",
    :Stage1 => "Challenge Gym Leaders 1/4",
    :Stage2 => "Challenge Gym Leaders 2/4",
    :Stage3 => "Challenge Gym Leaders 3/4",
    :Stage4 => "Challenge Gym Leaders 4/4",
    :Stage5 => "Challenge The Supreme Gym Leader!",

    :QuestDescription => "Face all the Gym Leaders on the Orange Islands and prove you're the best against the Supreme Gym Leader!",
  }

  # @todo: Still need to add code to complete it in the game
  OrangeIslandsPokedex = {
    :ID => "47",
    :Name => "Gotta catch ‘em all(Archipelago)!",
    :QuestGiver => "Professor Ivy",
    :Stage1 => "Complete the Regional Pokédex.",
    :Stage2 => "Register at least 80 Pokémon.",
    :Location1 => "Orange Archipelago",
    # :Location2 => "Route 31",
    :QuestDescription => "Go meet many kinds of Pokémon and complete the Orange Archipelago Pokédex!",
  }

  RescueLapras = {
    :ID => "48",
    :Name => "Rescue Lapras!",
    :Stage1 => "Help Lapras against the swimmers.",
    :Stage2 => "Caught friendly Lapras.",
    :Location1 => "Route 50",
    :Location2 => "Route 50",
    :QuestDescription => "You saw some swimmers mistreating a Lapras. You need to help the poor Pokémon.",
  }

  MaxDensOrangeIslands = {
    :ID => "49",
    :Name => "Strange Energy Emerges",
    :QuestGiver => "Professor Ivy",
    :Stage1 => "Investigate the strange phenomenon.",
    :Location1 => "Route 51",
    :Stage2 => "Investigate the phenomenon 2/8",
    :Location2 => "Check Map for locations",
    :Stage3 => "Investigate the phenomenon 3/8",
    :Location3 => "Check Map for locations",
    :Stage4 => "Investigate the phenomenon 4/8",
    :Location4 => "Check Map for locations",
    :Stage5 => "Investigate the phenomenon 5/8",
    :Location5 => "Check Map for locations",
    :Stage6 => "Investigate the phenomenon 6/8",
    :Location6 => "Check Map for locations",
    :Stage7 => "Investigate the phenomenon 7/8",
    :Location7 => "Check Map for locations",
    :Stage8 => "Investigate the phenomenon 8/8",
    :Location8 => "Check Map for locations",
    :QuestDescription => "An unusual energy spike appeared right after Prof. Ivy tried a new method to open the GS Ball. You need to investigate the strange phenomenon.",
  }

  CrystalOnix = {
    :ID => "50",
    :Name => "Crystal Onix Legend",
    :Stage1 => "Search for the Crystal Onix.",
    :Location1 => "Sunburst Island",
    :QuestDescription => "Locals whisper about a legendary Crystal Onix that dwells deep inside the island’s shimmering caverns. Is that legend really true?",
  }

  PinkanProtection = {
    :ID => "51",
    :Name => "Pink Pokémon Protection",
    :Stage1 => "Find and defeat the burglars hiding somewhere.",
    :Location1 => "Pinkan Island",
    :QuestDescription => "Officer Jenny requested your help protecting the rare pink Pokémon of Pinkan Island. Suspicious burglars are targeting the protected species. Find and defeat all three burglars, then report back to Jenny. ",
  }

  AriadosTrade = {
    :ID => "52",
    :Name => "Rocky Trade",
    :QuestGiver => "Youngster Marcus",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Trovita Island",
    :QuestDescription => "This youngster in Trovita Island wants to trade an Ariados for his Charjabug. Do you think it's a good trade?",
  }

  BillsEngine = {
    :ID => "53",
    :Name => "Pokémon Fossil",
    :Stage1 => "Test Bill's Engine in a fossil.",
    :Location1 => "Route 57",
    :QuestDescription => "Bill made a new portable engine that can reanimate fossils. He is not sure if it works, so he wants you to test it in a fossil.",
  }

  GrapefruitIslands = {
    :ID => "54",
    :Name => "Settle the Orchard Spat",
    :Stage1 => "Test Bill's Engine in a fossil.",
    :QuestGiver => "Cowgirl Ruby",
    :Location1 => "Grapefruit Islands",
    :QuestDescription => "The orchard farmers are arguing about who is the strongest battler. The Orchard Leader asked you to settle the dispute by challenging all five of them throughout the orchards.",
  }

  SandygastTrade = {
    :ID => "55",
    :Name => "Pinsir Trade",
    :QuestGiver => "Kid Anya",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Kumquat Island",
    :QuestDescription => "This kid in Kumquat Island wants to trade a Sandygast for her Pinsir. Do you think it's a good trade?",
  }

  FestivalOfTheLegend = {
    :ID => "56",
    :Name => "Legend Festival",
    :Stage1 => "Participate in the Festival.",
    :Location1 => "Shamouti Island",
    :QuestDescription => "The inhabitants are celebrating their annual festival and selected you as their Chosen One, who must retrieve three crystal balls from each of the legendary birds islands and bring them to Shamouti's shrine.",
  }

  GSBall2 = {
    :ID => "57",
    :Name => "Mysterious Ball - Part 2",
    :QuestGiver => "Prof. Ivy",
    :Stage1 => "Deliver the Mysterious Ball to Prof. Birch.",
    :Location1 => "Hoenn",
    :QuestDescription => "Professor Ivy asked you to deliver the Mysterious Ball to Prof. Birch in order to continue their research.",
  }

  MareepTrade = {
    :ID => "58",
    :Name => "Poney Trade",
    :QuestGiver => "Larry",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Route 2",
    :QuestDescription => "This guy in Route 2 wants to trade a Mareep for his Ponyta. Do you think it's a good trade?",
  }


  HoennGymChallenge = {
    :ID => "59",
    :Name => "Pokémon Gym challenge",
    :QuestGiver => "Prof. Birch",
    :Stage1 => "Challenge Hoenn Gym Leaders",
    :Location1 => "Petalburg City",
    :Stage2 => "Challenge Hoenn Gym Leaders 2/8",
    :Stage3 => "Challenge Hoenn Gym Leaders 3/8",
    :Stage4 => "Challenge Hoenn Gym Leaders 4/8",
    :Stage5 => "Challenge Hoenn Gym Leaders 5/8",
    :Stage6 => "Challenge Hoenn Gym Leaders 6/8",
    :Stage7 => "Challenge Hoenn Gym Leaders 7/8",
    :Stage8 => "Challenge Hoenn Gym Leaders 8/8",
    :QuestDescription => "Collect all 8 Gym Badges in Hoenn. If you manage to defeat all the Gym Leaders, you'll eventually challenge the Hoenn Pokémon League!",
  }

  # @todo: Still need to add code to complete it in the game
  HoennPokedex = {
    :ID => "60",
    :Name => "Gotta catch ‘em all(Hoenn)!",
    :QuestGiver => "Prof. Birch",
    :Stage1 => "Complete the Regional Pokédex.",
    :Stage2 => "Register at least 80 Pokémon.",
    :Location1 => "Hoenn",
    # :Location2 => "Route 31",
    :QuestDescription => "Go meet many kinds of Pokémon and complete the Hoenn Pokédex!",
  }


  TakePartnerGirlToLab = {
    :ID => "61",
    :Name => "Help in the rain",
    :QuestGiver => "\\v[76]",
    :Stage1 => "Go with \\v[76] to the lab.",
    :Location1 => "Littleroot Town",
    :QuestDescription => "This cute girl wants your help to arrive in the Prof. Birch's lab. ",
  }

  TakePartnerBoyToLab = {
    :ID => "62",
    :Name => "Help in the rain",
    :QuestGiver => "\\v[77]",
    :Stage1 => "Go with \\v[77] to the lab.",
    :Location1 => "Littleroot Town",
    :QuestDescription => "This boy wants your help to arrive in the Prof. Birch's lab. ",
  }

  DoubleBattleBlackbelt = {
    :ID => "63",
    :Name => "Blackbelt's Double Battle",
    :QuestGiver => "Blackbelt Thomas",
    :Stage1 => "Defeat the Blackbelt's!",
    :Location1 => "Route 104",
    :QuestDescription => "This pair of Blackbelts want to test their skills against you and your partner in a Double Battle!",
  }

  WorkingShoes = {
    :ID => "64",
    :Name => "Dad's working shoes",
    :QuestGiver => "Mom",
    :Stage1 => "Buy Dad's new shoes",
    :Location1 => "Goldenrod City",
    :Stage2 => "Deliver the shoes",
    :Location2 => "New Bark Town",
    :QuestDescription => "Mom called with a “tiny favor.” Dad’s work shoes are falling apart, but he refuses to replace them. She wants you to quietly buy him a new pair in Goldenrod.",
  }

  BoxDelivery = {
    :ID => "65",
    :Name => "Dad's office delivery",
    :QuestGiver => "Dad",
    :Stage1 => "Get the box",
    :Location1 => "Mahogany Town",
    :Stage2 => "Deliver the box",
    :Location2 => "Goldenrod City",
    :QuestDescription => "Dad's boss asked him to bring a box from Mahogany Town for the office team in Goldenrod, but he’s too busy to step away from work. He trusted you with the job instead.",
  }

  SalarymanDadsFriend = {
    :ID => "66",
    :Name => "Dad's old friend",
    :QuestGiver => "Salaryman Richard",
    :Stage1 => "Battle him!",
    :Location1 => "Saffron City",
    :QuestDescription => "You meet a salaryman who knows your dad from years ago. He remembers how your dad once talked about becoming a Pokémon Trainer, even if life never gave him the time. Before catching his train, he asks for one friendly battle.",
  }

  DadProtectionGift = {
    :ID => "67",
    :Name => "Dad's visit in Kanto",
    :QuestGiver => "Dad",
    :Stage1 => "Meet Dad at the station.",
    :Location1 => "Saffron City",
    :QuestDescription => "Dad called after seeing the news in Kanto. He’s passing through Saffron for work and wants to meet you at the station to give you something.",
  }

  SickMiltank = {
    :ID => "68",
    :Name => "Sick Miltank",
    :QuestGiver => "Ranchers",
    :Stage1 => "Give Miltank an Oran Berry.",
    :Location1 => "Route 39",
    :Stage2 => "Give Miltank a Revival Herb.",
    :Location2 => "Route 39",
    :QuestDescription => "There's a sick Miltank in the Moomoo Farm. The ranchers are taking care of her, but she isn't getting better. Can you give her something to help her recover?",
  }

  ViridianSchool = {
    :ID => "69",
    :Name => "School Lessons",
    :QuestGiver => "School Teacher",
    :Stage1 => "Battle the Teacher",
    :Location1 => "Viridian City",
    :QuestDescription => "The school Teacher in Viridian City wants you to teach the students some Pokémon lessons in a demonstration battle. Can you help her?",
  }

  HeracrossTrade = {
    :ID => "70",
    :Name => "Sleepy Trade",
    :QuestGiver => "Student Enzo",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Viridian City",
    :QuestDescription => "This student in Viridian City wants to trade a Heracross for his Munchlax. Do you think it's a good trade?",
  }

  SecondStarterKanto = {
    :ID => "71",
    :Name => "A second chance",
    :QuestGiver => "Guitarist Wesley",
    :Stage1 => "Battle Wesley.",
    :Location1 => "Route 24",
    :QuestDescription => "This Trainer is about to release a Pokémon because it never bonded with them. Maybe it will choose you instead if you beat him in a battle.",
  }

  ThirdStarterKanto = {
    :ID => "72",
    :Name => "Unrequested visitor",
    :QuestGiver => "Lady Simone",
    :Stage1 => "Get the wild Pokémon",
    :Location1 => "Celadon City",
    :QuestDescription => "A wild starter has moved into someone’s home and won’t stop causing trouble. Can you make it stop?",
  }

  SafariZoneGoldTeeth = {
    :ID => "73",
    :Name => "Missing Gold Teeth",
    :QuestGiver => "Warden",
    :Stage1 => "Find the Gold Teeth",
    :Location1 => "Safari Zone",
    :Stage2 => "Return the Gold Teeth",
    :Location2 => "Fuchsia City",
    :QuestDescription => "The Safari Zone Warden is missing his golden teeth. Can you help him find them and bring back to him?",
  }

  FossilOwnerAptitudeTest1 = {
    :ID => "74",
    :Name => "Fossil Owner Test",
    :QuestGiver => "Warden Baoba",
    :Stage1 => "Revive the Fossil Pokémon",
    :Location1 => "Cinnabar Island",
    :Stage2 => "Show a Kabuto to Baoba",
    :Location2 => "Fuchsia City",
    :QuestDescription => "The Safari Zone Warden Baoba is testing your aptitude to be a fossil owner. If you show him a Kabuto, he will give you something special in return.",
  }

  FossilOwnerAptitudeTest2 = {
    :ID => "74",
    :Name => "Fossil Owner Test 2",
    :QuestGiver => "Warden Baoba",
    :Stage1 => "Revive the Fossil Pokémon",
    :Location1 => "Cinnabar Island",
    :Stage2 => "Show a Omanyte to Baoba",
    :Location2 => "Fuchsia City",
    :QuestDescription => "The Safari Zone Warden Baoba is testing your aptitude to be a fossil owner. If you show him a Omanyte, he will give you something special in return.",
  }

  TimeTraveler = {
    :ID => "75",
    :Name => "Time Traveler",
    :QuestGiver => "Time Traveler",
    :Stage1 => "Battle the 'Time Traveler'",
    :Location1 => "Ilex Forest",
    :QuestDescription => "This guy says he's from the past and that he traveled through time. It doesn't seem very credible, but he offers you a proof if you can beat him in a battle. ",
  }

  TimeTraveler2 = {
    :ID => "76",
    :Name => "Time Traveler 2",
    :QuestGiver => "Time Traveler",
    :Stage1 => "Battle the 'Time Traveler'",
    :Location1 => "Olivine City",
    :QuestDescription => "This guy says he's from the past and that he traveled through time. It doesn't seem very credible, but he offers you a proof if you can beat him in a battle. ",
  }

  SecondStarterOrangeIslands = {
    :ID => "77",
    :Name => "Fan Club Exhibition",
    :QuestGiver => "PokéManiac Isaac",
    :Stage1 => "Show your Pokémon",
    :Location1 => "Mandarim Island North",
    :QuestDescription => "This PokéManiac wants to see the final evolution of your Orange Island starter Pokémon.",
  }

  ThirdStarterOrangeIslands = {
    :ID => "78",
    :Name => "Pokédex Nerd",
    :QuestGiver => "Super Nerd Richard",
    :Stage1 => "Register 70 Pokémon",
    :Location1 => "Mandarim Island South",
    :QuestDescription => "This Super Nerd is really interested in the Orange Islands Pokédex, so he wants to check yours.",
  }

  DadVacation = {
    :ID => "79",
    :Name => "Dad's vacation",
    :QuestGiver => "Dad",
    :Stage1 => "Meet your family",
    :Location1 => "Kumquat Island",
    :Stage2 => "Do 3 family activities",
    :Location2 => "Kumquat Island",
    :QuestDescription => "After years working non-stop, your Dad was finally able to take a vacation. He invited you to join him and your mom at the beach so you can spend some quality time together. Can you make it there?",
  }

  SlakothTrade = {
    :ID => "80",
    :Name => "Slakoth Trade",
    :QuestGiver => "Lass Silvia",
    :Stage1 => "Trade Pokémon.",
    :Location1 => "Violet City",
    :QuestDescription => "This Lass in Rustboro City wants to trade a Bellsprout for his Onix. Do you think it's a good trade?",
  }

  MagicShowTickets = {
    :ID => "81",
    :Name => "Magic Show Tickets!",
    :QuestGiver => "Diane",
    :Stage1 => "Collect the 3 coupons.",
    :Location1 => "Rustboro City",
    :Stage2 => "Show the coupons to Diane.",
    :Location2 => "Rustboro City",
    :RewardString => "Magic Show Tickets",
    :QuestDescription => "A promotional campaign is being ran to give out some promotional tickets to the Great Butler's Magic Show. Collect a coupon from each of the 3 clowns to get tickets to the show.",
  }

  ButlerMagicShow = {
    :ID => "82",
    :Name => "Great Butler's Magic Show!",
    :QuestGiver => "Diane",
    :Location1 => "Route 116",
    :Stage1 => "Go to the Magic Show.",
    :QuestDescription => "Great Butler's Magic Show is coming to town! Go to the show and see the magic up close and personal.",
  }

  DoublebattleTournaments = {
    :ID => "83",
    :Name => "Double Battle Tournaments!",
    :Location1 => "Verdanturf Town",
    :Stage1 => "Participate in the Tournament.",
    :Location2 => "Slateport City",
    :Stage2 => "Participate in the Tournament.",
    :Location3 => "Fallarbor Town",
    :Stage3 => "Participate in the Tournament.",
    :QuestDescription => "There are 3 Battle Tournaments that happens across Hoenn. Win all of them to collect prizes and strengthen the bonds with your partner.",
  }

  



  # Here's an extension of the above that includes multiple stages
  # Quest2 = {
  #   :ID => "2",
  #   :Name => "Introductions",
  #   :QuestGiver => "Little Boy",
  #   :Stage1 => "Look for clues.",
  #   :Stage2 => "Follow the trail.",
  #   :Stage3 => "Catch the troublemakers!",
  #   :Location1 => "Lappet Town",
  #   :Location2 => "Viridian Forest",
  #   :Location3 => "Route 3",
	# :StageLabel1 => "1",
	# :StageLabel2 => "2",
  #   :QuestDescription => "Some wild Pokémon stole a little boy's favourite toy. Find those troublemakers and help him get it back.",
  #   :RewardString => "Something shiny!"
  # }

  # Here's an example of a quest with lots of stages that also doesn't have a stage location defined for every stage
  Quest3 = {
    :ID => "3",
    :Name => "Last-minute chores",
    :QuestGiver => "Grandma",
    :Stage1 => "A",
    :Stage2 => "B",
    :Stage3 => "C",
    :Stage4 => "D",
    :Stage5 => "E",
    :Stage6 => "F",
    :Stage7 => "G",
    :Stage8 => "H",
    :Stage9 => "I",
    :Stage10 => "J",
    :Stage11 => "K",
    :Stage12 => "L",
    :Location1 => "nil",
    :Location2 => "nil",
    :Location3 => "Dewford Town",
    :QuestDescription => "Isn't the alphabet longer than this?",
    :RewardString => "Chicken soup!"
  }

  # Here's an example of not defining the quest giver and reward text
  Quest4 = {
    :ID => "4",
    :Name => "A new beginning",
    :QuestGiver => "nil",
    :Stage1 => "Turning over a new leaf... literally!",
    :Stage2 => "Help your neighbours.",
    :Location1 => "Milky Way",
    :Location2 => "nil",
    :QuestDescription => "You crash landed on an alien planet. There are other humans here and they look hungry...",
    :RewardString => "nil"
  }

  # Other random examples you can look at if you want to fill out the UI and check out the page scrolling
  Quest5 = {
    :ID => "5",
    :Name => "All of my friends",
    :QuestGiver => "Barry",
    :Stage1 => "Meet your friends near Acuity Lake.",
    :QuestDescription => "Barry told me that he saw something cool at Acuity Lake and that I should go see. I hope it's not another trick.",
    :RewardString => "You win nothing for giving in to peer pressure."
  }

  Quest6 = {
    :ID => "6",
    :Name => "The journey begins",
    :QuestGiver => "Professor Oak",
    :Stage1 => "Deliver the parcel to the Pokémon Mart in Viridian City.",
    :Stage2 => "Return to the Professor.",
    :Location1 => "Viridian City",
    :Location2 => "nil",
    :QuestDescription => "The Professor has entrusted me with an important delivery for the Viridian City Pokémon Mart. This is my first task, best not mess it up!",
    :RewardString => "nil"
  }

  Quest7 = {
    :ID => "7",
    :Name => "Close encounters of the... first kind?",
    :QuestGiver => "nil",
    :Stage1 => "Make contact with the strange creatures.",
    :Location1 => "Rock Tunnel",
    :QuestDescription => "A sudden burst of light, and then...! What are you?",
    :RewardString => "A possible probing."
  }

  Quest8 = {
    :ID => "8",
    :Name => "These boots were made for walking",
    :QuestGiver => "Musician #1",
    :Stage1 => "Listen to the musician's, uhh, music.",
    :Stage2 => "Find the source of the power outage.",
    :Location1 => "nil",
    :Location2 => "Celadon City Sewers",
    :QuestDescription => "A musician was feeling down because he thinks no one likes his music. I should help him drum up some business."
  }

  Quest9 = {
    :ID => "9",
    :Name => "Got any grapes?",
    :QuestGiver => "Duck",
    :Stage1 => "Listen to The Duck Song.",
    :Stage2 => "Try not to sing it all day.",
    :Location1 => "YouTube",
    :QuestDescription => "Let's try to revive old memes by listening to this funny song about a duck wanting grapes.",
    :RewardString => "A loss of braincells. Hurray!"
  }

  Quest10 = {
    :ID => "10",
    :Name => "Singing in the rain",
    :QuestGiver => "Some old dude",
    :Stage1 => "I've run out of things to write.",
    :Stage2 => "If you're reading this, I hope you have a great day!",
    :Location1 => "Somewhere prone to rain?",
    :QuestDescription => "Whatever you want it to be.",
    :RewardString => "Wet clothes."
  }

  Quest11 = {
    :ID => "11",
    :Name => "When is this list going to end?",
    :QuestGiver => "Me",
    :Stage1 => "When IS this list going to end?",
    :Stage2 => "123",
    :Stage3 => "456",
    :Stage4 => "789",
    :QuestDescription => "I'm losing my sanity.",
    :RewardString => "nil"
  }

  Quest12 = {
    :ID => "12",
    :Name => "The laaast melon",
    :QuestGiver => "Some stupid dodo",
    :Stage1 => "Fight for the last of the food.",
    :Stage2 => "Don't die.",
    :Location1 => "A volcano/cliff thing?",
    :Location2 => "Good advice for life.",
    :QuestDescription => "Tea and biscuits, anyone?",
    :RewardString => "Food, glorious food!"
  }

end
