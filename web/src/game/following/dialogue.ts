// Port of Plugins/Following Pokemon EX/Configuration:
// - 001_Dialogue_Item.rb: :following_pkmn_item (the follower found an item);
// - 002_Dialogue_Specific.rb: :following_pkmn_talk for status, map flags,
//   map names and weather (+ the Pokémon Amie menu: Amie loads before this
//   plugin, so `defined?(PokeAmieScreen)` holds);
// - 003_Dialogue_Generic.rb: :following_pkmn_talk by random value;
// - 004_Disappearing.rb: :following_pkmn_appear (when the follower shows).
// Handlers run in registration order (EventHandlers.trigger_2 stops at the
// first non-nil result), so this file keeps the plugin's order.

import { _INTL } from "../../data/gameData/gameData";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Species } from "../../data/gameData/species";
import { rand } from "../../core/random";
import { pbMessage } from "../../ui/messages";
import { pbGetMapNameFromId } from "../../ui/planes";
import { EventHandlers } from "../eventHandlers";
import type { GamePlayer } from "../GamePlayer";
import type { GameMap } from "../GameMap";
import { G } from "../globals";
import type { Pokemon } from "../pokemon/Pokemon";
import { evaluateAsync } from "../scriptApi";
import { FollowingPkmnConfig as C } from "./config";
import { FollowingPkmn } from "./FollowingPkmn";
import { PBMoveRoute as R, pbMoveRoute } from "./moveRoute";

const gamePlayer = () => G.gamePlayer as unknown as GamePlayer;
const gameMap = () => G.gameMap as unknown as GameMap;
const playerName = () => G.player?.name ?? "";
/** $game_map.metadata */
const mapMeta = () => MapMetadata.tryGet(gameMap().mapId) as MapMetadata | null;
/** $game_map.name */
const mapName = () => pbGetMapNameFromId(gameMap().mapId);
/** Array#sample */
const sample = <T>(a: T[]): T => a[rand(a.length)]!;
/** $game_screen.weather_type */
const weather = () => G.gameScreen.weatherType;

/** The emote, a 1 s pause for the player, then one of `messages`. */
async function emoteAndSay(anim: number | null, pkmn: Pokemon, messages: string[]): Promise<true> {
  if (anim != null) {
    FollowingPkmn.animation(anim);
    pbMoveRoute(gamePlayer(), [R.Wait, 20]);
  }
  await pbMessage(_INTL(sample(messages), pkmn.name, playerName()));
  return true;
}

/** Shows messages[value] after the move route that goes with it. */
async function say(pkmn: Pokemon, messages: string[], value: number): Promise<true> {
  await pbMessage(_INTL(messages[value]!, pkmn.name, playerName()));
  return true;
}

/** pbMoveRoute($game_player, [Wait, playerWait]) + FollowingPkmn.move_route(route) */
function dance(playerWait: number, route: number[]): void {
  pbMoveRoute(gamePlayer(), [R.Wait, playerWait]);
  FollowingPkmn.moveRoute(route);
}

const JUMP = [R.Jump, 0, 0];
/** TurnRight, TurnUp, TurnLeft, TurnDown with `wait` between them. */
const spin = (wait: number) => [R.TurnRight, R.Wait, wait, R.TurnUp, R.Wait, wait, R.TurnLeft, R.Wait, wait, R.TurnDown];

//===============================================================================
// 001_Dialogue_Item.rb
//===============================================================================

// Special hold item on a map which includes battle in the name
EventHandlers.add("following_pkmn_item", "battle_map", async (_pkmn, _randomVal) => {
  if (mapName().includes(_INTL("Battle"))) {
    // This array can be edited and extended to your hearts content.
    const items = ["POKEBALL", "POKEBALL", "POKEBALL", "GREATBALL", "GREATBALL", "ULTRABALL"];
    // Choose a random item from the items array, give the player 2 of the item
    // with the message "{1} is holding a round object..."
    if (await FollowingPkmn.item(sample(items), 2, _INTL("{1} is holding a round object..."))) return true;
  }
  return null;
});

// Generic Item Dialogue
EventHandlers.add("following_pkmn_item", "regular", async (_pkmn, _randomVal) => {
  const items = [
    "POTION", "SUPERPOTION", "FULLRESTORE", "REVIVE", "PPUP",
    "PPMAX", "RARECANDY", "REPEL", "MAXREPEL", "ESCAPEROPE",
    "HONEY", "TINYMUSHROOM", "PEARL", "NUGGET", "GREATBALL",
    "ULTRABALL", "THUNDERSTONE", "MOONSTONE", "SUNSTONE", "DUSKSTONE",
    "REDAPRICORN", "BLUEAPRICORN", "YELLOWAPRICORN", "GREENAPRICORN", "PINKAPRICORN",
    "BLACKAPRICORN", "WHITEAPRICORN",
  ];
  // If no message or quantity is specified the default message is used and the quantity of item is 1
  if (await FollowingPkmn.item(sample(items))) return true;
  return null;
});

//===============================================================================
// 002_Dialogue_Specific.rb
//===============================================================================

// Amie Compatibility
EventHandlers.add("following_pkmn_talk", "amie", async (_pkmn, _randomVal, skipAmie = false) => {
  let cmd = 1;
  if (!skipAmie) {
    cmd = await pbMessage(_INTL("What would you like to do?"), [_INTL("Play"), _INTL("Talk"), _INTL("Cancel")]);
    // TODO(amie): Pokémon Amie's scene isn't ported; this calls it once registered.
    if (cmd === 0) await evaluateAsync({ call: "pokemonAmieRefresh", args: [] }, { event: null, interpreter: null });
  }
  if (cmd === 0 || cmd === 2) return true;
  return null;
});

// Special Dialogue when statused
EventHandlers.add("following_pkmn_talk", "status", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  const status = (anim: number, text: string) => {
    FollowingPkmn.animation(anim);
    pbMoveRoute(gamePlayer(), [R.Wait, 20]);
    return pbMessage(_INTL(text, pkmn.name));
  };
  switch (pkmn.status) {
    case "POISON": await status(C.ANIMATION_EMOTE_POISON, "{1} is shivering with the effects of being poisoned."); break;
    case "BURN": await status(C.ANIMATION_EMOTE_ANGRY, "{1}'s burn looks painful."); break;
    case "FROZEN": await status(C.ANIMATION_EMOTE_ELIPSES, "{1} seems very cold. It's frozen solid!"); break;
    case "SLEEP": await status(C.ANIMATION_EMOTE_ELIPSES, "{1} seems really tired."); break;
    case "PARALYSIS": await status(C.ANIMATION_EMOTE_ELIPSES, "{1} is standing still and twitching."); break;
  }
  if (pkmn.status !== "NONE") return true;
  return null;
});

// Specific message if the map has the Pokemon Lab metadata flag
EventHandlers.add("following_pkmn_talk", "pokemon_lab", async (pkmn, _randomVal) => {
  if (mapMeta()?.hasFlag("PokemonLab")) {
    return emoteAndSay(C.ANIMATION_EMOTE_ELIPSES, pkmn as Pokemon, [
      _INTL("{1} is touching some kind of switch."),
      _INTL("{1} has a cord in its mouth!"),
      _INTL("{1} seems to want to touch the machinery."),
    ]);
  }
  return null;
});

// Specific message if the map name has the players name in it like the Player's House
EventHandlers.add("following_pkmn_talk", "player_house", async (pkmn, _randomVal) => {
  if (mapName().includes(playerName())) {
    return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn as Pokemon, [
      _INTL("{1} is sniffing around the room."),
      _INTL("{1} noticed {2}'s mom is nearby."),
      _INTL("{1} seems to want to settle down at home."),
    ]);
  }
  return null;
});

// Specific message if the map has Pokecenter metadata flag
EventHandlers.add("following_pkmn_talk", "pokemon_center", async (pkmn, _randomVal) => {
  if (mapMeta()?.hasFlag("PokeCenter")) {
    return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn as Pokemon, [
      _INTL("{1} looks happy to see the nurse."),
      _INTL("{1} looks a little better just being in the Pokémon Center."),
      _INTL("{1} seems fascinated by the healing machinery."),
      _INTL("{1} looks like it wants to take a nap."),
      _INTL("{1} chirped a greeting at the nurse."),
      _INTL("{1} is watching {2} with a playful gaze."),
      _INTL("{1} seems to be completely at ease."),
      _INTL("{1} is making itself comfortable."),
      _INTL("There's a content expression on {1}'s face."),
    ]);
  }
  return null;
});

// Specific message if the map has the Gym metadata flag
EventHandlers.add("following_pkmn_talk", "gym", async (pkmn, _randomVal) => {
  if (mapMeta()?.hasFlag("GymMap")) {
    return emoteAndSay(C.ANIMATION_EMOTE_ANGRY, pkmn as Pokemon, [
      _INTL("{1} looks eager to battle!"),
      _INTL("{1} is looking at {2} with a determined gleam in its' eye."),
      _INTL("{1} is trying to intimidate the other trainers."),
      _INTL("{1} trusts {2} to come up with a winning strategy."),
      _INTL("{1} is keeping an eye on the gym leader."),
      _INTL("{1} is ready to pick a fight with someone."),
      _INTL("{1} looks like it might be preparing for a big showdown!"),
      _INTL("{1} wants to show off how strong it is!"),
      _INTL("{1} is...doing warm-up exercises?"),
      _INTL("{1} is growling quietly in contemplation..."),
    ]);
  }
  return null;
});

// Specific message when the weather is Storm. Pokemon of different types
// have different reactions to the weather.
EventHandlers.add("following_pkmn_talk", "storm_weather", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (weather() === "Storm") {
    if (pkmn.hasType("ELECTRIC")) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} is staring up at the sky."),
        _INTL("The storm seems to be making {1} excited."),
        _INTL("{1} looked up at the sky and shouted loudly!"),
        _INTL("The storm only seems to be energizing {1}!"),
        _INTL("{1} is happily zapping and jumping in circles!"),
        _INTL("The lightning doesn't bother {1} at all."),
      ]);
    }
    return emoteAndSay(C.ANIMATION_EMOTE_ELIPSES, pkmn, [
      _INTL("{1} is staring up at the sky."),
      _INTL("The storm seems to be making {1} a bit nervous."),
      _INTL("The lightning startled {1}!"),
      _INTL("The rain doesn't seem to bother {1} much."),
      _INTL("The weather seems to be putting {1} on edge."),
      _INTL("{1} was startled by the lightning and snuggled up to {2}!"),
    ]);
  }
  return null;
});

// Specific message when the weather is Snowy.
EventHandlers.add("following_pkmn_talk", "snow_weather", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (weather() === "Snow") {
    if (pkmn.hasType("ICE")) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} is watching the snow fall."),
        _INTL("{1} is thrilled by the snow!"),
        _INTL("{1} is staring up at the sky with a smile."),
        _INTL("The snow seems to have put {1} in a good mood."),
        _INTL("{1} is cheerful because of the cold!"),
      ]);
    }
    return emoteAndSay(C.ANIMATION_EMOTE_ELIPSES, pkmn, [
      _INTL("{1} is watching the snow fall."),
      _INTL("{1} is nipping at the falling snowflakes."),
      _INTL("{1} wants to catch a snowflake in its' mouth."),
      _INTL("{1} is fascinated by the snow."),
      _INTL("{1}'s teeth are chattering!"),
      _INTL("{1} made its body slightly smaller because of the cold..."),
    ]);
  }
  return null;
});

// Specific message when the weather is Blizzard.
EventHandlers.add("following_pkmn_talk", "blizzard_weather", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (weather() === "Blizzard") {
    if (pkmn.hasType("ICE")) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} is watching the hail fall."),
        _INTL("{1} isn't bothered at all by the hail."),
        _INTL("{1} is staring up at the sky with a smile."),
        _INTL("The hail seems to have put {1} in a good mood."),
        _INTL("{1} is gnawing on a piece of hailstone."),
      ]);
    }
    return emoteAndSay(C.ANIMATION_EMOTE_ANGRY, pkmn, [
      _INTL("{1} is getting pelted by hail!"),
      _INTL("{1} wants to avoid the hail."),
      _INTL("The hail is hitting {1} painfully."),
      _INTL("{1} looks unhappy."),
      _INTL("{1} is shaking like a leaf!"),
    ]);
  }
  return null;
});

// Specific message when the weather is Sandstorm.
EventHandlers.add("following_pkmn_talk", "sandstorm_weather", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (weather() === "Sandstorm") {
    if (["ROCK", "GROUND"].some((type) => pkmn.hasType(type))) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} is coated in sand."),
        _INTL("The weather doesn't seem to bother {1} at all!"),
        _INTL("The sand can't slow {1} down!"),
        _INTL("{1} is enjoying the weather."),
      ]);
    } else if (pkmn.hasType("STEEL")) {
      return emoteAndSay(C.ANIMATION_EMOTE_ELIPSES, pkmn, [
        _INTL("{1} is coated in sand, but doesn't seem to mind."),
        _INTL("{1} seems unbothered by the sandstorm."),
        _INTL("The sand doesn't slow {1} down."),
        _INTL("{1} doesn't seem to mind the weather."),
      ]);
    }
    return emoteAndSay(C.ANIMATION_EMOTE_ANGRY, pkmn, [
      _INTL("{1} is covered in sand..."),
      _INTL("{1} spat out a mouthful of sand!"),
      _INTL("{1} is squinting through the sandstorm."),
      _INTL("The sand seems to be bothering {1}."),
    ]);
  }
  return null;
});

// Specific message if the map has the Forest metadata flag
EventHandlers.add("following_pkmn_talk", "forest_map", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (mapMeta()?.hasFlag("Forest")) {
    FollowingPkmn.animation(C.ANIMATION_EMOTE_MUSIC);
    pbMoveRoute(gamePlayer(), [R.Wait, 20]);
    let messages: string[];
    if (["BUG", "GRASS"].some((type) => pkmn.hasType(type))) {
      messages = [
        _INTL("{1} seems highly interested in the trees."),
        _INTL("{1} seems to enjoy the buzzing of the bug Pokémon."),
        _INTL("{1} is jumping around restlessly in the forest."),
      ];
    } else {
      messages = [
        _INTL("{1} seems highly interested in the trees."),
        _INTL("{1} seems to enjoy the buzzing of the bug Pokémon."),
        _INTL("{1} is jumping around restlessly in the forest."),
        _INTL("{1} is wandering around and listening to the different sounds."),
        _INTL("{1} is munching at the grass."),
        _INTL("{1} is wandering around and enjoying the forest scenery."),
        _INTL("{1} is playing around, plucking bits of grass."),
        _INTL("{1} is staring at the light coming through the trees."),
        _INTL("{1} is playing around with a leaf!"),
        _INTL("{1} seems to be listening to the sound of rustling leaves."),
        _INTL("{1} is standing perfectly still and might be imitating a tree..."),
        _INTL("{1} got tangled in the branches and almost fell down!"),
        _INTL("{1} was surprised when it got hit by a branch!"),
      ];
    }
    return emoteAndSay(null, pkmn, messages);
  }
  return null;
});

// Specific message when the weather is Rainy.
EventHandlers.add("following_pkmn_talk", "rainy_weather", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (["Rain", "HeavyRain"].includes(weather())) {
    if (pkmn.hasType("FIRE") || pkmn.hasType("GROUND") || pkmn.hasType("ROCK")) {
      return emoteAndSay(C.ANIMATION_EMOTE_ANGRY, pkmn, [
        _INTL("{1} seems very upset the weather."),
        _INTL("{1} is shivering..."),
        _INTL("{1} doesn't seem to like being all wet..."),
        _INTL("{1} keeps trying to shake itself dry..."),
        _INTL("{1} moved closer to {2} for comfort."),
        _INTL("{1} is looking up at the sky and scowling."),
        _INTL("{1} seems to be having difficulty moving its body."),
      ]);
    } else if (pkmn.hasType("WATER") || pkmn.hasType("GRASS")) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} seems to be enjoying the weather."),
        _INTL("{1} seems to be happy about the rain!"),
        _INTL("{1} seems to be very surprised that it's raining!"),
        _INTL("{1} beamed happily at {2}!"),
        _INTL("{1} is gazing up at the rainclouds."),
        _INTL("Raindrops keep falling on {1}."),
        _INTL("{1} is looking up with its mouth gaping open."),
      ]);
    }
    return emoteAndSay(C.ANIMATION_EMOTE_ELIPSES, pkmn, [
      _INTL("{1} is staring up at the sky."),
      _INTL("{1} looks a bit surprised to see rain."),
      _INTL("{1} keeps trying to shake itself dry."),
      _INTL("The rain doesn't seem to bother {1} much."),
      _INTL("{1} is playing in a puddle!"),
      _INTL("{1} is slipping in the water and almost fell over!"),
    ]);
  }
  return null;
});

// Specific message if the map has Beach metadata flag
EventHandlers.add("following_pkmn_talk", "beach_map", async (pkmn, _randomVal) => {
  if (mapMeta()?.hasFlag("Beach")) {
    return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn as Pokemon, [
      _INTL("{1} seems to be enjoying the scenery."),
      _INTL("{1} seems to enjoy the sound of the waves moving the sand."),
      _INTL("{1} looks like it wants to swim!"),
      _INTL("{1} can barely look away from the ocean."),
      _INTL("{1} is staring longingly at the water."),
      _INTL("{1} keeps trying to shove {2} towards the water."),
      _INTL("{1} is excited to be looking at the sea!"),
      _INTL("{1} is happily watching the waves!"),
      _INTL("{1} is playing on the sand!"),
      _INTL("{1} is staring at {2}'s footprints in the sand."),
      _INTL("{1} is rolling around in the sand."),
    ]);
  }
  return null;
});

// Specific message when the weather is Sunny.
EventHandlers.add("following_pkmn_talk", "sunny_weather", async (pkmnArg, _randomVal) => {
  const pkmn = pkmnArg as Pokemon;
  if (weather() === "Sun") {
    if (pkmn.hasType("GRASS")) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} seems pleased to be out in the sunshine."),
        _INTL("{1} is soaking up the sunshine."),
        _INTL("The bright sunlight doesn't seem to bother {1} at all."),
        _INTL("{1} sent a ring-shaped cloud of spores into the air!"),
        _INTL("{1} is stretched out its body and is relaxing in the sunshine."),
        _INTL("{1} is giving off a floral scent."),
      ]);
    } else if (pkmn.hasType("FIRE")) {
      return emoteAndSay(C.ANIMATION_EMOTE_HAPPY, pkmn, [
        _INTL("{1} seems to be happy about the great weather!"),
        _INTL("The bright sunlight doesn't seem to bother {1} at all."),
        _INTL("{1} looks thrilled by the sunshine!"),
        _INTL("{1} blew out a fireball."),
        _INTL("{1} is breathing out fire!"),
        _INTL("{1} is hot and cheerful!"),
      ]);
    } else if (pkmn.hasType("DARK")) {
      return emoteAndSay(C.ANIMATION_EMOTE_ANGRY, pkmn, [
        _INTL("{1} is glaring up at the sky."),
        _INTL("{1} seems personally offended by the sunshine."),
        _INTL("The bright sunshine seems to bothering {1}."),
        _INTL("{1} looks upset for some reason."),
        _INTL("{1} is trying to stay in {2}'s shadow."),
        _INTL("{1} keeps looking for shelter from the sunlight."),
      ]);
    }
    return emoteAndSay(C.ANIMATION_EMOTE_ELIPSES, pkmn, [
      _INTL("{1} is squinting in the bright sunshine."),
      _INTL("{1} is starting to sweat."),
      _INTL("{1} seems a little uncomfortable in this weather."),
      _INTL("{1} looks a little overheated."),
      _INTL("{1} seems very hot..."),
      _INTL("{1} shielded its vision against the sparkling light!"),
    ]);
  }
  return null;
});

//===============================================================================
// 003_Dialogue_Generic.rb
//===============================================================================

// All dialogues with the Music Note animation
EventHandlers.add("following_pkmn_talk", "music_generic", async (pkmnArg, randomVal) => {
  if (randomVal !== 0) return null;
  const pkmn = pkmnArg as Pokemon;
  FollowingPkmn.animation(C.ANIMATION_EMOTE_MUSIC);
  pbMoveRoute(gamePlayer(), [R.Wait, 20]);
  const messages = [
    _INTL("{1} seems to want to play with {2}."),
    _INTL("{1} is singing and humming."),
    _INTL("{1} is looking up at {2} with a happy expression."),
    _INTL("{1} swayed and danced around as it pleased."),
    _INTL("{1} is jumping around in a carefree way!"),
    _INTL("{1} is showing off its agility!"),
    _INTL("{1} is moving around happily!"),
    _INTL("Whoa! {1} suddenly started dancing in happiness!"),
    _INTL("{1} is steadily keeping up with {2}!"),
    _INTL("{1} is happy skipping about."),
    _INTL("{1} is playfully nibbling at the ground."),
    _INTL("{1} is playfully nipping at {2}'s feet!"),
    _INTL("{1} is following {2} very closely!"),
    _INTL("{1} turns around and looks at {2}."),
    _INTL("{1} is working hard to show off its mighty power!"),
    _INTL("{1} looks like it wants to run around!"),
    _INTL("{1} is wandering around enjoying the scenery."),
    _INTL("{1} seems to be enjoying this a little bit!"),
    _INTL("{1} is cheerful!"),
    _INTL("{1} seems to be singing something?"),
    _INTL("{1} is dancing around happily!"),
    _INTL("{1} is having fun dancing a lively jig!"),
    _INTL("{1} is so happy, it started singing!"),
    _INTL("{1} looked up and howled!"),
    _INTL("{1} seems to be feeling optimistic."),
    _INTL("It looks like {1} feels like dancing!"),
    _INTL("{1} suddenly started to sing! It seems to be feeling great."),
    _INTL("It looks like {1} wants to dance with {2}!"),
  ];
  const value = rand(messages.length);
  // Special move route to go along with some of the dialogue
  switch (value) {
    case 3: case 9:
      dance(80, [R.TurnRight, R.Wait, 4, ...JUMP, R.Wait, 10, R.TurnUp, R.Wait, 4, ...JUMP, R.Wait, 10,
        R.TurnLeft, R.Wait, 4, ...JUMP, R.Wait, 10, R.TurnDown, R.Wait, 4, ...JUMP]);
      break;
    case 4: case 5:
      dance(40, [...JUMP, R.Wait, 10, ...JUMP, R.Wait, 10, ...JUMP]);
      break;
    case 6: case 17:
      dance(40, [R.TurnRight, R.Wait, 4, R.TurnDown, R.Wait, 4, R.TurnLeft, R.Wait, 4, R.TurnUp]);
      break;
    case 7: case 28: // (there's no message 28)
      dance(60, [...spin(4), R.Wait, 4, ...spin(4), R.Wait, 4, ...JUMP, R.Wait, 10, ...JUMP]);
      break;
    case 21: case 22:
      dance(50, [...spin(4), R.Wait, 4, ...JUMP, R.Wait, 10, ...JUMP]);
      break;
  }
  return say(pkmn, messages, value);
});

// All dialogues with the Angry animation
EventHandlers.add("following_pkmn_talk", "angry_generic", async (pkmnArg, randomVal) => {
  if (randomVal !== 1) return null;
  const pkmn = pkmnArg as Pokemon;
  FollowingPkmn.animation(C.ANIMATION_EMOTE_ANGRY);
  pbMoveRoute(gamePlayer(), [R.Wait, 20]);
  const messages = [
    _INTL("{1} let out a roar!"),
    _INTL("{1} is making a face like it's angry!"),
    _INTL("{1} seems to be angry for some reason."),
    _INTL("{1} chewed on {2}'s feet."),
    _INTL("{1} turned to face the other way, showing a defiant expression."),
    _INTL("{1} is trying to intimidate {2}'s foes!"),
    _INTL("{1} wants to pick a fight!"),
    _INTL("{1} is ready to fight!"),
    _INTL("It looks like {1} will fight just about anyone right now!"),
    _INTL("{1} is growling in a way that sounds almost like speech..."),
  ];
  const value = rand(messages.length);
  // Special move route to go along with some of the dialogue
  switch (value) {
    case 6: case 7: case 8:
      dance(25, [...JUMP, R.Wait, 10, ...JUMP]);
      break;
  }
  return say(pkmn, messages, value);
});

// All dialogues with the Neutral Animation
EventHandlers.add("following_pkmn_talk", "ellipses_generic", async (pkmnArg, randomVal) => {
  if (randomVal !== 2) return null;
  const pkmn = pkmnArg as Pokemon;
  FollowingPkmn.animation(C.ANIMATION_EMOTE_ELIPSES);
  pbMoveRoute(gamePlayer(), [R.Wait, 20]);
  const messages = [
    _INTL("{1} is looking down steadily."),
    _INTL("{1} is sniffing around."),
    _INTL("{1} is concentrating deeply."),
    _INTL("{1} faced {2} and nodded."),
    _INTL("{1} is glaring straight into {2}'s eyes."),
    _INTL("{1} is surveying the area."),
    _INTL("{1} focused with a sharp gaze!"),
    _INTL("{1} is looking around absentmindedly."),
    _INTL("{1} yawned very loudly!"),
    _INTL("{1} is relaxing comfortably."),
    _INTL("{1} is focusing its attention on {2}."),
    _INTL("{1} is staring intently at nothing."),
    _INTL("{1} is concentrating."),
    _INTL("{1} faced {2} and nodded."),
    _INTL("{1} is looking at {2}'s footprints."),
    _INTL("{1} seems to want to play and is gazing at {2} expectedly."),
    _INTL("{1} seems to be thinking deeply about something."),
    _INTL("{1} isn't paying attention to {2}...Seems it's thinking about something else."),
    _INTL("{1} seems to be feeling serious."),
    _INTL("{1} seems disinterested."),
    _INTL("{1}'s mind seems to be elsewhere."),
    _INTL("{1} seems to be observing the surroundings instead of watching {2}."),
    _INTL("{1} looks a bit bored."),
    _INTL("{1} has an intense look on its face."),
    _INTL("{1} is staring off into the distance."),
    _INTL("{1} seems to be carefully examining {2}'s face."),
    _INTL("{1} seems to be trying to communicate with its eyes."),
    _INTL("... {1} seems to have sneezed!"),
    _INTL("... {1} noticed that {2}'s shoes are a bit dirty."),
    _INTL("Seems {1} ate something strange, it's making an odd face... "),
    _INTL("{1} seems to be smelling something good."),
    _INTL("{1} noticed that {2}'s Bag has a little dirt on it..."),
    _INTL("...... ...... ...... ...... ...... ...... ...... ...... ...... ...... ...... {1} silently nodded!"),
  ];
  const value = rand(messages.length);
  // Special move route to go along with some of the dialogue
  switch (value) {
    case 1: case 5: case 7: case 20: case 21:
      dance(35, spin(10));
      break;
  }
  return say(pkmn, messages, value);
});

// All dialogues with the Happy animation
EventHandlers.add("following_pkmn_talk", "happy_generic", async (pkmnArg, randomVal) => {
  if (randomVal !== 3) return null;
  const pkmn = pkmnArg as Pokemon;
  FollowingPkmn.animation(C.ANIMATION_EMOTE_HAPPY);
  pbMoveRoute(gamePlayer(), [R.Wait, 20]);
  const messages = [
    _INTL("{1} began poking {2}."),
    _INTL("{1} looks very happy."),
    _INTL("{1} happily cuddled up to {2}."),
    _INTL("{1} is so happy that it can't stand still."),
    _INTL("{1} looks like it wants to lead!"),
    _INTL("{1} is coming along happily."),
    _INTL("{1} seems to be feeling great about walking with {2}!"),
    _INTL("{1} is glowing with health."),
    _INTL("{1} looks very happy."),
    _INTL("{1} put in extra effort just for {2}!"),
    _INTL("{1} is smelling the scents of the surounding air."),
    _INTL("{1} is jumping with joy!"),
    _INTL("{1} is still feeling great!"),
    _INTL("{1} stretched out its body and is relaxing."),
    _INTL("{1} is doing its best to keep up with {2}."),
    _INTL("{1} is happily cuddling up to {2}!"),
    _INTL("{1} is full of energy!"),
    _INTL("{1} is so happy that it can't stand still!"),
    _INTL("{1} is wandering around and listening to the different sounds."),
    _INTL("{1} gives {2} a happy look and a smile."),
    _INTL("{1} started breathing roughly through its nose in excitement!"),
    _INTL("{1} is trembling with eagerness!"),
    _INTL("{1} is so happy, it started rolling around."),
    _INTL("{1} looks thrilled at getting attention from {2}."),
    _INTL("{1} seems very pleased that {2} is noticing it!"),
    _INTL("{1} started wriggling its entire body with excitement!"),
    _INTL("It seems like {1} can barely keep itself from hugging {2}!"),
    _INTL("{1} is keeping close to {2}'s feet."),
  ];
  const value = rand(messages.length);
  // Special move route to go along with some of the dialogue
  switch (value) {
    case 3:
      dance(45, [...spin(4), R.Wait, 4, ...JUMP, R.Wait, 10, ...JUMP]);
      break;
    case 11: case 16: case 17: case 24:
      dance(40, [...JUMP, R.Wait, 10, ...JUMP, R.Wait, 10, ...JUMP]);
      break;
  }
  return say(pkmn, messages, value);
});

// All dialogues with the Heart animation
EventHandlers.add("following_pkmn_talk", "heart_generic", async (pkmnArg, randomVal) => {
  if (randomVal !== 4) return null;
  const pkmn = pkmnArg as Pokemon;
  FollowingPkmn.animation(C.ANIMATION_EMOTE_HEART);
  pbMoveRoute(gamePlayer(), [R.Wait, 20]);
  const messages = [
    _INTL("{1} suddenly started walking closer to {2}."),
    _INTL("Woah! {1} suddenly hugged {2}."),
    _INTL("{1} is rubbing up against {2}."),
    _INTL("{1} is keeping close to {2}."),
    _INTL("{1} blushed."),
    _INTL("{1} loves spending time with {2}!"),
    _INTL("{1} is suddenly playful!"),
    _INTL("{1} is rubbing against {2}'s legs!"),
    _INTL("{1} is regarding {2} with adoration!"),
    _INTL("{1} seems to want some affection from {2}."),
    _INTL("{1} seems to want some attention from {2}."),
    _INTL("{1} seems happy travelling with {2}."),
    _INTL("{1} seems to be feeling affectionate towards {2}."),
    _INTL("{1} is looking at {2} with loving eyes."),
    _INTL("{1} looks like it wants a treat from {2}."),
    _INTL("{1} looks like it wants {2} to pet it!"),
    _INTL("{1} is rubbing itself against {2} affectionately."),
    _INTL("{1} bumps its head gently against {2}'s hand."),
    _INTL("{1} rolls over and looks at {2} expectantly."),
    _INTL("{1} is looking at {2} with trusting eyes."),
    _INTL("{1} seems to be begging {2} for some affection!"),
    _INTL("{1} mimicked {2}!"),
  ];
  const value = rand(messages.length);
  // NOTE: the plugin writes `when 1, 6,` with a trailing comma, so Ruby reads
  //       the next line (pbMoveRoute($game_player, [Wait, 10])) as a third
  //       `when` value: 1 and 6 jump, and every other value runs that
  //       pbMoveRoute while testing the case.
  if (value === 1 || value === 6) {
    FollowingPkmn.moveRoute([...JUMP]);
  } else {
    pbMoveRoute(gamePlayer(), [R.Wait, 10]);
  }
  return say(pkmn, messages, value);
});

// All dialogues with no animation
EventHandlers.add("following_pkmn_talk", "generic", async (pkmnArg, randomVal) => {
  if (randomVal !== 5) return null;
  const pkmn = pkmnArg as Pokemon;
  const messages = [
    _INTL("{1} spun around in a circle!"),
    _INTL("{1} let out a battle cry."),
    _INTL("{1} is on the lookout!"),
    _INTL("{1} is standing patiently."),
    _INTL("{1} is looking around restlessly."),
    _INTL("{1} is wandering around."),
    _INTL("{1} yawned loudly!"),
    _INTL("{1} is steadily poking at the ground around {2}'s feet."),
    _INTL("{1} is looking at {2} and smiling."),
    _INTL("{1} is staring intently into the distance."),
    _INTL("{1} is keeping up with {2}."),
    _INTL("{1} looks pleased with itself."),
    _INTL("{1} is still going strong!"),
    _INTL("{1} is walking in sync with {2}."),
    _INTL("{1} started spinning around in circles."),
    _INTL("{1} looks at {2} with anticipation."),
    _INTL("{1} fell down and looks a little embarrassed."),
    _INTL("{1} is waiting to see what {2} will do."),
    _INTL("{1} is calmly watching {2}."),
    _INTL("{1} is looking to {2} for some kind of cue."),
    _INTL("{1} is staying in place, waiting for {2} to make a move."),
    _INTL("{1} obediently sat down at {2}'s feet."),
    _INTL("{1} jumped in surprise!"),
    _INTL("{1} jumped a little!"),
  ];
  const value = rand(messages.length);
  // Special move route to go along with some of the dialogue
  switch (value) {
    case 0:
      dance(15, spin(4));
      break;
    case 2: case 4:
      dance(35, spin(10));
      break;
    case 14:
      dance(50, [...spin(4), R.Wait, 4, ...spin(4), R.Wait, 4, ...spin(4)]);
      break;
    case 22: case 23:
      dance(10, [...JUMP]);
      break;
  }
  return say(pkmn, messages, value);
});

//===============================================================================
// 004_Disappearing.rb: "next true" lets the follower stay, "next false" hides it
//===============================================================================

EventHandlers.add("following_pkmn_appear", "vehicles", (_pkmn) => {
  // Don't follow if on bicyle
  if (G.pokemonGlobal.bicycle) return false;
  // Don't follow if on Pokeride ($PokemonGlobal.respond_to?(:mount): the Mount plugin doesn't add it)
  const g = G.pokemonGlobal as unknown as { mount?: unknown };
  if ("mount" in g && g.mount) return false;
  return null;
});

EventHandlers.add("following_pkmn_appear", "map_flag_keep", (_pkmn) => {
  // Always follow if map has the approriate flag to hide
  if (mapMeta()?.hasFlag("ShowFollowingPkmn")) return true;
  return null;
});

EventHandlers.add("following_pkmn_appear", "height", (pkmnArg) => {
  const pkmn = pkmnArg as Pokemon;
  const metadata = mapMeta();
  // $PokemonEncounters (wild encounters, a separate port): skipped until it exists.
  const encounters = (G as unknown as { pokemonEncounters?: { encounterPossibleHere(): boolean } | null }).pokemonEncounters;
  if (metadata && metadata.outdoorMap !== true && encounters) {
    // Don't follow if the Pokemon's height is greater than 3 meters and there are no encounters ie a building or something
    const height = Species.getSpeciesForm(pkmn.species, pkmn.form)?.height ?? 0;
    if (height / 10.0 > 3.0 && !encounters.encounterPossibleHere()) return false;
  }
  return null;
});

EventHandlers.add("following_pkmn_appear", "map_flag_remove", (_pkmn) => {
  // Don't follow if map has the approriate flag to show
  if (mapMeta()?.hasFlag("HideFollowingPkmn")) return false;
  return null;
});

EventHandlers.add("following_pkmn_appear", "surfing", (pkmn) => {
  const g = G.pokemonGlobal;
  if ((g.surfing && !G.gameTemp.endingSurf) || (FollowingPkmn.getEvent()?.terrainTag()?.canSurf && FollowingPkmn.active())) {
    // Don't follow if this is the Pokemon currently being ridden
    if (pkmn === g.currentSurfing) return false;
    // Follow if the Pokemon is water type, levitates or is manually removed
    if (FollowingPkmn.waterborneFollower()) return true;
    // Don't Follow
    return false;
  }
  return null;
});

EventHandlers.add("following_pkmn_appear", "diving", (pkmnArg) => {
  const pkmn = pkmnArg as Pokemon;
  if (G.pokemonGlobal.diving) {
    // Don't follow if this is the Pokemon currently being ridden
    if (pkmn === G.pokemonGlobal.currentDiving) return false;
    // Follow if the Pokemon is water type
    if (pkmn.hasType("WATER")) return true;
    // Don't Follow
    return false;
  }
  return null;
});
