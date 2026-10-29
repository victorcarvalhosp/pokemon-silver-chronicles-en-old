# Runs the logic of Plugins/Social Links headless, on fixed scenarios, and
# writes web/src/plugins/socialLinks/socialLinksReference.json, which
# web/src/plugins/socialLinks/socialLinks.test.ts replays against the
# TypeScript port (web/src/plugins/socialLinks/):
# - the global helpers (pbAddSocialLink, pbGainSocialLinkBond, pbSetSocialLinkStatus...)
#   step by step, with the messages/sound effects each one shows and the state
#   after it (links in order, bond, moments, statuses, favourites, bond effects);
# - Player#active_bond_effect? for every style on several species;
# - SocialMediaMenu_Scene#pbSortSocialLinks for every sort method;
# - SocialMedia_Scene#pbRunTextThroughReplacement;
# - pbNormalizeStringForMatching, SocialLinkProfile#phone_contact and
#   pbAddSocialLinksFromPhone on phone contact lists;
# - SocialLinks#pbSanitizeProfileID on events named SocialLink(:ID).
# The scenes' sprites are checked in the browser (web/dev-social.html).
#
#   cd web && ruby tools/ruby-ref/social_links_reference.rb
#
# Loading: essentials.rb (GameData from Data/*.dat, Pokemon, Player), then the
# plugin's files in Data/PluginScripts.rxdata order over stand-ins for the
# window/sprite classes 003_SocialUI.rb subclasses. Kernel#rand is a queue
# of raw numbers (rand(n) = raw % n), as in amie_reference.rb.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

#===============================================================================
# Stand-ins and recording stubs
#===============================================================================
class Window_DrawableCommand; end
class Game_Character; end
class Game_Event < Game_Character
  attr_accessor :id, :name, :map_id
  def initialize(id, name, map_id); @id = id; @name = name; @map_id = map_id; end
end
class Interpreter
  def initialize(event); @event = event; end
  def get_character(*_a); @event; end
end
module Console
  def self.echo_warn(msg); $log << ["warn", msg]; end
end
module Essentials; VERSION = "20.1" unless const_defined?(:VERSION); end

$log = []
def pbMessage(message, *_a, &_b); $log << ["msg", message]; 0; end
def pbSEPlay(name, *_a); $log << ["se", name.is_a?(String) ? name : name.name]; end
$clock = 0
def pbGetTimeNow; $clock += 1; Time.at(1_700_000_000 + $clock); end

class FakeVariables
  def initialize; @data = {}; end
  def [](i); @data[i] || 0; end
  def []=(i, v); @data[i] = v; end
end
$game_variables = FakeVariables.new
$PokemonGlobal = Struct.new(:phoneNumbers).new(nil)

$rolls = []
$gen = Random.new(7)
$free = true # setup (Player.new, Pokemon.new) draws freely; steps are scripted
class << Kernel
  def oldRand(arg = nil)
    return (arg ? $gen.rand(arg) : $gen.rand) if $free
    raise "out of scripted rolls" if $rolls.empty?
    raw = $rolls.shift
    raise "unexpected rand(#{arg.inspect})" unless arg.is_a?(Integer) && arg > 0
    raw % arg
  end
end

#===============================================================================
# The plugin (Data/PluginScripts.rxdata order)
#===============================================================================
SL_DIR = File.join(PLUGINS, "Social Links")
["000_Settings.rb", "001_Data.rb", "002_Configuration.rb", "003_SocialUI.rb", "004_Player.rb",
 "005_Script Variables.rb", "PHONE_INTEGRATION_EXAMPLE.rb"].each do |f|
  path = File.join(SL_DIR, f)
  TOPLEVEL_BINDING.eval(File.read(path, encoding: "UTF-8"), path)
end

# Test-only profiles: what 002_Configuration.rb's don't exercise (moments_max
# arrays, default rates, negative effects). The test registers the same.
EXTRA_PROFILES = [
  { "id" => "TESTA", "name" => "Señor Ñandú", "image" => "default", "init_bond" => 2,
    "moments_max" => [2, 3, 4], "bond_max" => 4,
    "bond_effects" => { 1 => [["EXP", "FIRE", nil], ["Shiny", "FIRE", nil], ["CatchRate", "FIRE", nil]],
                        3 => [["EXP", "WATER", 0.5], ["Shiny", "WATER", -1], ["CatchRate", "WATER", 0.8],
                              ["Shiny", "GRASS", 0]] },
    "static_status_pool" => ["One", "Two"],
    "random_status_pool" => [["R0"], ["R1", 1], ["R3", 3], ["R4", 4]] },
  { "id" => "TESTB", "name" => "  Zed   Two ", "init_status" => "Hi \\PN, \\v[5]",
    "favorite_pokemon" => ["EEVEE", 1, 0, false] },
].freeze
EXTRA_PROFILES.each do |h|
  hash = {}
  h.each do |k, v|
    v = v.to_sym if k == "id"
    v = v.transform_values { |list| list.map { |e, t, r| [e.to_sym, t.to_sym, r] } } if k == "bond_effects"
    v = [v[0].to_sym, *v[1..]] if k == "favorite_pokemon"
    hash[k.to_sym] = v
  end
  GameData::SocialLinkProfile.register(hash)
end

#===============================================================================
# Helpers
#===============================================================================
def error_of(e)
  { "class" => e.class.to_s, "message" => e.message.lines.first.to_s.strip }
end

def jsonable(v)
  case v
  when Symbol then v.to_s
  when Array then v.map { |x| jsonable(x) }
  when Hash then v.map { |k, x| [k.to_s, jsonable(x)] }.to_h
  when Float then v
  else v
  end
end

def snapshot
  links = $player.social_links.links.map do |id, p|
    { "id" => id.to_s, "name" => p.name, "bond" => p.bond, "moments" => p.moments,
      "status" => p.instance_variable_get(:@current_status), "location" => p.current_location,
      "favoritePokemon" => jsonable(p.favorite_pokemon), "pastStatuses" => p.past_statuses.dup,
      "favorite" => p.favorite, "timeAdded" => p.time_added.to_i - 1_700_000_000 }
  end
  { "links" => links, "theme" => $player.social_links.theme_color,
    "bondEffects" => jsonable($player.bond_effects) }
end

def new_player
  $player = Player.new("Gold", :PkMnTRAINER_Male)
  $player.money = 123_456
  $clock = 0
end

# One step: the call, what it returned (or raised), its messages, the state after.
def step(steps, op, *args, rolls: nil)
  $log = []
  $rolls = rolls ? rolls.dup : []
  $free = false
  kw = args.last.is_a?(Hash) ? args.pop : {}
  res = {}
  begin
    ret = yield(*args, **kw)
    res["ret"] = jsonable(ret)
  rescue StandardError => e
    res["error"] = error_of(e)
  end
  $free = true
  res["rollsLeft"] = $rolls.length
  steps << { "op" => op, "args" => jsonable(args), "kw" => jsonable(kw), "rolls" => rolls,
             "result" => res, "log" => $log, "state" => snapshot }
end

SYM = ->(s) { s.is_a?(String) ? s.to_sym : s }
OPS = {
  "add" => ->(id, silent: false) { pbAddSocialLink(SYM[id], silent: silent) },
  "remove" => ->(id, silent: false) { pbRemoveSocialLink(SYM[id], silent: silent) },
  "has" => ->(id) { pbHasSocialLink?(SYM[id]) },
  "gainBond" => ->(id, val, silent: false) { pbGainSocialLinkBond(SYM[id], val, silent: silent) },
  "lowerBond" => ->(id, val, silent: false) { pbLowerSocialLinkBond(SYM[id], val, silent: silent) },
  "setBond" => ->(id, val, silent: false) { pbSetSocialLinkBond(SYM[id], val, silent: silent) },
  "getBond" => ->(id) { pbGetSocialLinkBond(SYM[id]) },
  "bondMaxed" => ->(id) { pbSocialLinkBondMaxed?(SYM[id]) },
  "gainMoment" => ->(id, val, silent: false) { pbGainSocialLinkMoment(SYM[id], val, silent: silent) },
  "lowerMoment" => ->(id, val, silent: false) { pbLowerSocialLinkMoment(SYM[id], val, silent: silent) },
  "setMoment" => ->(id, val, silent: false) { pbSetSocialLinkMoment(SYM[id], val, silent: silent) },
  "getMoments" => ->(id) { pbGetSocialLinkMoments(SYM[id]) },
  "momentsMaxed" => ->(id) { pbSocialLinkMomentsMaxed?(SYM[id]) },
  "setLocation" => ->(id, loc) { pbSetSocialLinkLocation(SYM[id], loc) },
  "setPokemon" => ->(id, *rest) { pbSetSocialLinkFavoritePokemon(SYM[id], *rest.each_with_index.map { |v, i| i == 0 && v ? v.to_sym : v }) },
  "setStatus" => ->(id, status) { pbSetSocialLinkStatus(SYM[id], status) },
  "setStatusRandom" => ->(id) { pbSetSocialLinkStatusRandom(SYM[id]) },
  "currentStatus" => ->(id) { $player.social_links.links[SYM[id]].current_status },
  "momentsMax" => ->(id) { $player.social_links.links[SYM[id]].moments_max },
  "toggleFavorite" => ->(id, *val) { $player.social_links.links[SYM[id]].toggle_favorite(*val) },
  "setTheme" => ->(color) { pbSetSocialTheme(color) },
  "phone" => ->(numbers) { $PokemonGlobal.phoneNumbers = numbers.map { |n| n.each_with_index.map { |v, i| i == 1 && v.is_a?(String) ? v.to_sym : v } }; nil },
  "fromPhone" => ->(silent: false) { pbAddSocialLinksFromPhone(silent: silent) },
  "phoneContact" => ->(id) { c = $player.social_links.links[SYM[id]].phone_contact; c ? jsonable(c) : nil },
  "hasPhoneContact" => ->(id) { $player.social_links.links[SYM[id]].has_phone_contact? },
  "event" => ->(name, op) { pbAddSocialLink(Game_Event.new(3, name, 890)) if op == "add" },
  "interpreter" => ->(name) { pbHasSocialLink?(Interpreter.new(Game_Event.new(4, name, 890))) },
}.freeze

def run(steps, op, *args, rolls: nil, **kw)
  args.push(kw) unless kw.empty?
  step(steps, op, *args, rolls: rolls) { |*a, **kw| kw.empty? ? OPS[op].call(*a) : OPS[op].call(*a, **kw) }
end

out = {}
out["extraProfiles"] = EXTRA_PROFILES

#===============================================================================
# Scenario 1: adding, bonds, moments, bond effects
#===============================================================================
new_player
s = []
run(s, "add", "JOEY")
run(s, "add", "JOEY")
run(s, "add", "PROFOAK", silent: true)
run(s, "add", "BROCK")
run(s, "has", "BROCK")
run(s, "has", "MOTHER")
run(s, "add", "NOBODY")
run(s, "gainBond", "JOEY", 1)
run(s, "gainBond", "JOEY", 2)
run(s, "gainBond", "JOEY", 3)
run(s, "gainBond", "JOEY", 1, silent: true)
run(s, "gainBond", "JOEY", 5)
run(s, "gainBond", "JOEY", 1)
run(s, "bondMaxed", "JOEY")
run(s, "lowerBond", "JOEY", 1)
run(s, "lowerBond", "JOEY", 2)
run(s, "lowerBond", "JOEY", 4)
run(s, "lowerBond", "JOEY", 20, silent: true)
run(s, "lowerBond", "JOEY", 1)
run(s, "setBond", "JOEY", 7)
run(s, "setBond", "JOEY", 2)
run(s, "setBond", "JOEY", 1)
run(s, "setBond", "JOEY", 12, silent: true)
run(s, "getBond", "JOEY")
run(s, "setBond", "JOEY", 3, silent: true)
run(s, "setBond", "JOEY", 10)
run(s, "setBond", "JOEY", 9, silent: true)
run(s, "setBond", "JOEY", 10)
run(s, "gainBond", "BROCK", 1)
run(s, "gainBond", "BROCK", 5)
run(s, "gainBond", "MOTHER", 1)
run(s, "gainMoment", "PROFOAK", 1)
run(s, "gainMoment", "PROFOAK", 3)
run(s, "gainMoment", "PROFOAK", 3)
run(s, "gainMoment", "PROFOAK", 1)
run(s, "momentsMaxed", "PROFOAK")
run(s, "getMoments", "PROFOAK")
run(s, "lowerMoment", "PROFOAK", 1)
run(s, "lowerMoment", "PROFOAK", 2)
run(s, "lowerMoment", "PROFOAK", 9)
run(s, "lowerMoment", "PROFOAK", 1)
run(s, "setMoment", "PROFOAK", 3)
run(s, "setMoment", "PROFOAK", 1)
run(s, "setMoment", "PROFOAK", 9)
run(s, "setMoment", "PROFOAK", 2)
run(s, "gainBond", "PROFOAK", 4)
run(s, "gainBond", "PROFOAK", 5)
run(s, "lowerBond", "PROFOAK", 6)
run(s, "add", "TESTA")
run(s, "momentsMax", "TESTA")
run(s, "gainMoment", "TESTA", 5)
run(s, "gainBond", "TESTA", 1)
run(s, "momentsMax", "TESTA")
run(s, "gainMoment", "TESTA", 5, silent: true)
run(s, "gainBond", "TESTA", 1)
run(s, "momentsMax", "TESTA")
run(s, "setBond", "TESTA", 0)
run(s, "setBond", "TESTA", 3, silent: true)
run(s, "remove", "BROCK")
run(s, "remove", "BROCK")
run(s, "remove", "TESTA", silent: true)
run(s, "add", "TESTA", silent: true)
run(s, "setTheme", "Orange")
out["scenario1"] = s

#===============================================================================
# Scenario 2: active_bond_effect?
#===============================================================================
new_player
pbAddSocialLink(:JOEY, silent: true)
pbAddSocialLink(:PROFOAK, silent: true)
pbAddSocialLink(:TESTA, silent: true)
species = %i[PIKACHU RATTATA PIDGEY MAGNEMITE CHARMANDER SQUIRTLE LOTAD BULBASAUR GEODUDE]
active = []
[[:JOEY, 0], [:PROFOAK, 0], [:TESTA, 2], [:JOEY, 2], [:PROFOAK, 4], [:JOEY, 7], [:PROFOAK, 9], [:TESTA, 4],
 [:JOEY, 10], [:JOEY, 6], [:TESTA, 1]].each do |id, bond|
  pbSetSocialLinkBond(id, bond, silent: true)
  row = { "set" => [id.to_s, bond], "bondEffects" => jsonable($player.bond_effects), "values" => {} }
  species.each do |sp|
    pkmn = Pokemon.new(sp, 5)
    row["values"][sp.to_s] = %i[EXP Shiny CatchRate].map { |st| $player.active_bond_effect?(st, pkmn) }
  end
  row["values"]["unknownStyle"] = $player.active_bond_effect?(:Other, Pokemon.new(:PIKACHU, 5))
  active << row
end
out["activeBondEffect"] = active

#===============================================================================
# Scenario 3: statuses, favourite Pokémon, location, favourites
#===============================================================================
new_player
s = []
run(s, "add", "PROFOAK", silent: true)
run(s, "add", "TESTA", silent: true)
run(s, "add", "TESTB", silent: true)
run(s, "add", "MOTHER", silent: true)
run(s, "currentStatus", "TESTA")
run(s, "currentStatus", "PROFOAK")
run(s, "setStatus", "PROFOAK", 1)
run(s, "setStatus", "PROFOAK", 1)
run(s, "setStatus", "PROFOAK", 7)
run(s, "setStatus", "PROFOAK", "A custom status")
run(s, "setStatus", "PROFOAK", "")
run(s, "currentStatus", "PROFOAK")
run(s, "setStatus", "PROFOAK", 2.5)
run(s, "setStatusRandom", "PROFOAK", rolls: [5])
run(s, "setStatusRandom", "PROFOAK", rolls: [0])
run(s, "setStatusRandom", "PROFOAK")
run(s, "setStatusRandom", "MOTHER")
run(s, "setStatusRandom", "TESTA", rolls: [7])
run(s, "setStatusRandom", "TESTA", rolls: [7])
run(s, "setStatusRandom", "TESTA")
run(s, "setBond", "TESTA", 4, silent: true)
run(s, "setStatusRandom", "TESTA", rolls: [1])
run(s, "setStatus", "TESTA", 0)
run(s, "setStatus", "TESTA", 1)
run(s, "setStatus", "TESTA", 1)
run(s, "setLocation", "TESTB", "Goldenrod City")
run(s, "setPokemon", "TESTB", "PIKACHU", 1, 2, true)
run(s, "setPokemon", "TESTB", "MEW")
run(s, "setPokemon", "TESTB", nil)
run(s, "toggleFavorite", "MOTHER")
run(s, "toggleFavorite", "TESTA")
run(s, "toggleFavorite", "TESTA")
run(s, "toggleFavorite", "PROFOAK", true)
run(s, "toggleFavorite", "PROFOAK", false)
run(s, "setStatus", "NOBODY", "x")
run(s, "setLocation", "BROCK", "x")
run(s, "getBond", "BROCK")
run(s, "gainBond", "BROCK", 1)
out["scenario3"] = s

#===============================================================================
# Scenario 4: sorting (SocialMediaMenu_Scene#pbSortSocialLinks)
#===============================================================================
class ListStub; def refresh; end; end
new_player
%i[MOTHER JOEY PROFOAK BROCK TESTB KRIS].each { |id| pbAddSocialLink(id, silent: true) }
pbSetSocialLinkBond(:JOEY, 4, silent: true)
pbSetSocialLinkBond(:PROFOAK, 4, silent: true)
pbSetSocialLinkBond(:BROCK, 1, silent: true)
pbSetSocialLinkBond(:KRIS, 9, silent: true)
sorts = []
[[], [:PROFOAK], [:PROFOAK, :MOTHER]].each do |favs|
  $player.social_links.links.each_value { |p| p.favorite = favs.include?(p.id) }
  [true, false].each do |allow|
    SocialLinkSettings.send(:remove_const, :ALLOW_FAVORITING)
    SocialLinkSettings.const_set(:ALLOW_FAVORITING, allow)
    4.times do |m|
      scene = SocialMediaMenu_Scene.allocate
      list = []
      $player.social_links.links.each { |k, v| list.push([k, v]) }
      scene.instance_variable_set(:@social_links, list)
      scene.instance_variable_set(:@sort_method, m)
      scene.instance_variable_set(:@sprites, { "itemlist" => ListStub.new })
      scene.pbSortSocialLinks
      sorts << { "favorites" => favs.map(&:to_s), "allowFavoriting" => allow, "method" => m,
                 "order" => list.map { |k, _| k.to_s } }
    end
  end
end
SocialLinkSettings.send(:remove_const, :ALLOW_FAVORITING)
SocialLinkSettings.const_set(:ALLOW_FAVORITING, true)
out["sorts"] = { "state" => snapshot, "results" => sorts }

#===============================================================================
# Scenario 5: pbRunTextThroughReplacement, pbNormalizeStringForMatching
#===============================================================================
texts = ["Hello \\PN!", "You have \\pm.", "Line\\nbreak \\N", "\\[ff0000ff]red", "\\pg boy \\pog girl",
         "\\b blue \\r red \\B \\R", "Var \\v[5] and \\V[6]", "Nested \\v[7]", "<b>bold</b> <i>it</i>",
         "plain", "\\v[99]", "\\PG\\POG", "\\\\pn"]
replace = []
# The game's player trainer types are all Gender = Unknown (male?/female? are
# both false), so the \\pg/\\pog branches are also run with them forced.
[["Gold", nil], ["Kris", :male], ["Lyra", :female]].each do |name, forced|
  $player = Player.new(name, :PkMnTRAINER_Male)
  $player.define_singleton_method(:male?) { forced == :male } if forced
  $player.define_singleton_method(:female?) { forced == :female } if forced
  tt = forced.to_s
  $player.money = 1_234_567
  $game_variables = FakeVariables.new
  $game_variables[5] = 42
  $game_variables[6] = "six"
  $game_variables[7] = "\\v[5]!"
  texts.each do |t|
    replace << { "forced" => tt, "name" => name, "male" => $player.male?, "female" => $player.female?,
                 "in" => t, "out" => SocialMedia_Scene.allocate.pbRunTextThroughReplacement(t.dup) }
  end
end
out["textReplacement"] = replace
out["normalize"] = ["  Señor  Ñandú ", "Pokéfan Beverly", "ÀÉÎÕÜ àéîõü çÇ", "Tab\there\nnew", "MiXeD Case",
                    "", "Ünïcödé ß ø", "Prof. Oak"].map { |t| [t, pbNormalizeStringForMatching(t)] }

#===============================================================================
# Scenario 6: phone integration, pbSanitizeProfileID with events
#===============================================================================
new_player
s = []
run(s, "fromPhone")
run(s, "phone", [])
run(s, "fromPhone")
run(s, "phone", [[true, "YOUNGSTER", "Joey", 0, 0, 0],
                 [true, "YOUNGSTER", "Ian", 0, 0, 0, 30, 4],
                 [false, "MOTHER_ID", "Mother", 1],
                 [true, 50, "professor oak", 1],
                 [true, "COOLTRAINER_Male", "Gaven", 0, 0, 0, 45, 2],
                 [true, 7, "Señor Ñandú", 3],
                 [true, "BUGCATCHER", "Wade", 0, 0, 0, 31, 3]])
run(s, "add", "JOEY", silent: true)
run(s, "add", "MOTHER", silent: true)
run(s, "hasPhoneContact", "JOEY")
run(s, "phoneContact", "JOEY")
run(s, "phoneContact", "MOTHER")
run(s, "fromPhone")
run(s, "phoneContact", "IAN")
run(s, "phoneContact", "PROFOAK")
run(s, "phoneContact", "GAVEN")
run(s, "phoneContact", "TESTA")
run(s, "phoneContact", "WADE")
run(s, "fromPhone")
run(s, "phone", [[true, "YOUNGSTER", "Kris", 0, 0, 0, 1, 1]])
run(s, "fromPhone")
run(s, "fromPhone", silent: true)
run(s, "event", "Yellow SocialLink(:YELLOW)", "add")
run(s, "event", "sociallink(:RED)", "add")
run(s, "interpreter", "x SOCIALLINK(:RED)")
run(s, "interpreter", "SocialLink(:RED) trailing")
run(s, "event", "NoLabel", "add")
out["phone"] = s

path = File.expand_path("../../src/plugins/socialLinks/socialLinksReference.json", __dir__)
File.write(path, JSON.pretty_generate(out) + "\n")
puts "wrote #{path}: #{out.map { |k, v| "#{k} #{v.is_a?(Array) ? v.length : 1}" }.join(', ')}"
