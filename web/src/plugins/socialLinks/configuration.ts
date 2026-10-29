// Port of Plugins/Social Links/002_Configuration.rb: the game's Social Link
// profiles (GameData::SocialLinkProfile.register). See that file for what
// every key does; phone calling works for any profile whose :name matches a
// phone contact (SocialLinkProfile#phoneContact).

import { _INTL } from "../../core/intl";
import { GameDataSocialLinkProfile } from "./data";

GameDataSocialLinkProfile.register({
  id: "PROFOAK",
  name: _INTL("Professor Oak"),
  image: "Oak",
  initLocation: _INTL("Pallet Town"),
  initStatus: _INTL("It's a good day."),
  favoritePokemon: "PIKACHU",
  imContactId: "PROFOAK",
  bondEffects: [
    [1, [["CatchRate", "ELECTRIC", 1.2]]],
    [4, [["EXP", "ELECTRIC", 1.1]]],
    [9, [["Shiny", "ELECTRIC", 2]]],
  ],
  staticStatusPool: [
    _INTL("Hello World"),
    _INTL("#TooManyCharmander"),
    _INTL("#NotEnoughBulbasaur"),
  ],
  randomStatusPool: [
    [_INTL("It's a great day.")],
    [_INTL("It's a fine day."), 2],
    [_INTL("It's an okay day."), 6],
    [_INTL("It's an alright day."), 8],
  ],
});

GameDataSocialLinkProfile.register({
  id: "JOEY",
  name: _INTL("Joey"), // Matches trainer name (works with or without "Youngster")
  image: "Joey",
  initLocation: _INTL("Viridian City"),
  initStatus: _INTL("It's getting cold out. Maybe I should try wearing longer shorts?"),
  favoritePokemon: ["RATTATA", 0, 0, true],
  bondEffects: [
    [2, [["EXP", "NORMAL", 1.1], ["Shiny", "NORMAL", 1]]],
    [5, [["CatchRate", "NORMAL", 1.4]]],
    [7, [["Shiny", "NORMAL", 2]]],
    [10, [["EXP", "NORMAL", 1.8], ["Shiny", "NORMAL", 5]]],
  ],
});

GameDataSocialLinkProfile.register({
  id: "MOTHER",
  name: _INTL("Mother"),
  image: "Mother",
  initLocation: _INTL("New Bark Town"),
  initStatus: _INTL("Stay safe out there, sweetie!"),
});

GameDataSocialLinkProfile.register({
  id: "BROCK",
  name: _INTL("Brock"),
  image: "Brock",
  initStatus: _INTL("I've see a <b>lot</b> of Geodude around lately. It brings a tear to my eye."),
  bondMax: 3,
  bondIconCoords: [
    [112, 154],
    [138, 138],
    [154, 112],
  ],
});

const simple: [string, string, string, string, string][] = [
  // id, name, image, init_location, init_status
  ["PROFELM", _INTL("Professor Elm"), "Elm", _INTL("New Bark Town"), _INTL("Research is going well today!")],
  ["PROFIVY", _INTL("Professor Ivy"), "Ivy", _INTL("Valencia Island"), _INTL("The weather is beautiful here.")],
  ["KRIS", _INTL("Kris"), "Kris", _INTL("New Bark Town"), _INTL("Ready for a new adventure!")],
  ["YELLOW", _INTL("Yellow"), "Yellow", _INTL("Viridian City"), _INTL("Spending time with my Pokémon.")],
  ["RED", _INTL("Red"), "Red", _INTL("Mt. Silver"), _INTL("...")],
  ["WADE", _INTL("Bug Catcher Wade"), "Wade", _INTL("Route 31"), _INTL("Found some cool Bug Pokémon today!")],
  ["LIZ", _INTL("Picnicker Liz"), "Liz", _INTL("Route 32"), _INTL("Perfect day for a picnic!")],
  ["ANTHONY", _INTL("Hiker Anthony"), "Anthony", _INTL("Route 33"), _INTL("The mountain trails are calling me.")],
  ["IAN", _INTL("Youngster Ian"), "Ian", _INTL("Route 34"), _INTL("Training hard every day!")],
  ["IRWIN", _INTL("Juggler Irwin"), "Irwin", _INTL("Route 35"), _INTL("Practicing my juggling skills.")],
  ["BEVERLY", _INTL("Pokéfan Beverly"), "Beverly", _INTL("Route 36"), _INTL("My Pokémon are so adorable today!")],
  ["DANA", _INTL("Lass Dana"), "Dana", _INTL("Route 38"), _INTL("Enjoying the sunshine!")],
  ["WILTON", _INTL("Fisherman Wilton"), "Wilton", _INTL("Route 44"), _INTL("The fish are biting today!")],
  ["GAVEN", _INTL("CoolTrainer Gaven"), "Gaven", _INTL("Route 45"), _INTL("Always ready for a battle!")],
];
for (const [id, name, image, initLocation, initStatus] of simple) {
  GameDataSocialLinkProfile.register({ id, name, image, initLocation, initStatus });
}
