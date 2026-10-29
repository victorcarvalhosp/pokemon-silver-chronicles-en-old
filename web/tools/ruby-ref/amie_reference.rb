# Runs the logic of Plugins/Pokemon Amie/Pokemon Amie.rb headless, on fixed
# scenarios, and writes web/src/plugins/pokemonAmie/amieReference.json, which
# web/src/plugins/pokemonAmie/amie.test.ts replays against the TypeScript port
# (web/src/plugins/pokemonAmie/amie.ts):
# - Pokemon#changeAmieStats for every method, from several starting points;
# - Pokemon#feedAmie for every EATABLE_ITEMS entry (and a non-food item, a
#   full Pokémon, the clamps), with a real PokeAmie_Scene as the scene the
#   item handlers get, as the scene passes `self`;
# - Pokemon#resetAffection and getAmieStatLevel's boundaries;
# - the :hungerCounter step handler (HUNGERCOUNTER, every 50 steps);
# - pbFirstNonEggPokemonOrFaintedPokemon and setAmiePokemon.
# The scene itself (PokeAmie_Scene's sprites and mouse) is graphics only and
# is checked in the browser (web/dev-amie.html).
#
#   cd web && ruby tools/ruby-ref/amie_reference.rb
#
# Loading: as plugin_items_reference.rb (the core and plugin item handlers in
# the game's load order), then the Amie plugin. Kernel#rand is replaced by a
# queue of raw numbers (rand(n) = raw % n; Essentials' rand(a..b) is
# a + rand(b - a + 1)), as in minigames_reference.rb.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path, line = 1)
  TOPLEVEL_BINDING.eval(code, path, line)
end

def eval_from(path, marker, back)
  lines = File.read(path, encoding: "UTF-8").lines
  idx = lines.index { |l| l.include?(marker) }
  raise "#{marker} not found in #{path}" if !idx
  start = idx - back
  eval_game_code(lines[start..].join, path, start + 1)
end

%w[002_Item_Effects.rb 003_Item_BattleEffects.rb].each do |f|
  path = File.join(SCRIPTS, "013_Items", f)
  eval_game_code(File.read(path, encoding: "UTF-8"), path)
end
hotfixes = File.join(PLUGINS, "v20.1 Hotfixes", "Misc bug fixes.rb")
change_level = File.read(hotfixes, encoding: "UTF-8")[/^def pbChangeLevel\(.*?^end\r?$/m]
eval_game_code(change_level, hotfixes)
GEN9_ITEMS = File.join(PLUGINS, "Generation 9 Pack Scripts", "[004] Items")
gen9_handlers = File.join(GEN9_ITEMS, "[000] Item Handlers.rb")
eval_game_code(File.read(gen9_handlers, encoding: "UTF-8"), gen9_handlers)
eval_from(File.join(GEN9_ITEMS, "[001] New Item Handlers.rb"), "# New item handlers (from the bag).", 2)
eval_from(File.join(PLUGINS, "ZUD Mechanics", "[001] Data", "Data_Item.rb"), "# Z-Crystals", 1)
zud_overrides = File.join(PLUGINS, "ZUD Mechanics", "[008] Overrides", "Override_Items.rb")
eval_game_code(File.read(zud_overrides, encoding: "UTF-8"), zud_overrides)
class GameStats
  attr_accessor :total_dynamax_lvls_gained, :total_gmax_factors_given
end
module GameData
  class Item
    def portion_name; return name; end
  end
end

#===============================================================================
# Recording stubs
#===============================================================================
$log = []

def pbMessage(message, _commands = nil, _cmdIfCancel = 0, _skin = nil, _defaultCmd = 0, &_block)
  $log << ["msg", message]
  0
end

def pbConfirmMessage(message, &_block)
  $log << ["confirmMsg", message, false]
  false
end

def pbTopRightWindow(text, _scene = nil)
  $log << ["topRight", text]
end

def pbFadeOutIn(*_args)
  yield if block_given?
end

def pbFadeOutInWithMusic(*_args)
  yield if block_given?
end

# 001_Technical/002_Files: Data/ files are read from the game folder.
def pbRgssOpen(file, mode = nil, &block)
  File.open(File.join(ROOT, file), mode, &block)
end

class Game_Temp
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end
$game_temp = Game_Temp.new
# $game_map.map_id: changeHappiness (EV-lowering berries) reads it.
$game_map = Struct.new(:map_id).new(5)
$PokemonGlobal = nil

#===============================================================================
# Scripted randomness
#===============================================================================
$rolls = []
$used = []
$gen = Random.new(7)
$free = true # setup (Pokemon.new, Player.new) draws freely; actions are scripted
class << Kernel
  def oldRand(arg = nil)
    return (arg ? $gen.rand(arg) : $gen.rand) if $free
    raise "out of scripted rolls" if $rolls.empty?
    raw = $rolls.shift
    $used.push(raw)
    raise "unexpected rand(#{arg.inspect})" unless arg.is_a?(Integer) && arg > 0
    raw % arg
  end
end
def rolls!(n = 16)
  $rolls = Array.new(n) { $gen.rand(1 << 30) }
  $used = []
  $free = false
end

def free!
  $free = true
end

#===============================================================================
# The plugin
#===============================================================================
amie = File.join(PLUGINS, "Pokemon Amie", "Pokemon Amie.rb")
eval_game_code(File.read(amie, encoding: "UTF-8"), amie)

# Ruby 2.6 can't call `self.private_method` (2.7+ can); essentials.rb makes
# Pokemon's private methods public for that reason. The Amie plugin's methods
# are public already.
#===============================================================================
# Helpers
#===============================================================================
def new_player
  free!
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $bag = PokemonBag.new
  $stats = GameStats.new
  $stats.total_dynamax_lvls_gained = 0
  $stats.total_gmax_factors_given = 0
end

# spec: species, level, hp, status, egg, happiness, ev {stat => n}, amie [aff, full, enjoy]
def build_pokemon(spec)
  pkmn = Pokemon.new(spec["species"].to_sym, spec["level"] || 30, $player)
  GameData::Stat.each_main do |s|
    pkmn.iv[s.id] = 31
    pkmn.ev[s.id] = (spec["ev"] || {})[s.id.to_s] || 0
  end
  pkmn.nature = :HARDY
  pkmn.ability_index = 0
  pkmn.item = nil
  pkmn.calc_stats
  pkmn.hp = spec["hp"] if spec.key?("hp")
  pkmn.status = spec["status"].to_sym if spec["status"]
  pkmn.happiness = spec["happiness"] if spec["happiness"]
  pkmn.steps_to_hatch = 1 if spec["egg"]
  if spec["amie"]
    pkmn.amie_affection, pkmn.amie_fullness, pkmn.amie_enjoyment = spec["amie"]
  end
  pkmn
end

def mon(species, level = 30, **rest)
  { "species" => species, "level" => level }.merge(rest.transform_keys(&:to_s))
end

def amie_state(pkmn)
  [pkmn.amie_affection, pkmn.amie_fullness, pkmn.amie_enjoyment]
end

def main_stat_ids
  ret = []
  GameData::Stat.each_main { |s| ret << s.id }
  ret
end

def pokemon_state(pkmn)
  {
    "species" => pkmn.species.to_s, "level" => pkmn.level, "hp" => pkmn.hp, "totalhp" => pkmn.totalhp,
    "status" => pkmn.status.to_s, "happiness" => pkmn.happiness,
    "ev" => main_stat_ids.map { |s| [s.to_s, pkmn.ev[s]] }.to_h,
    "amie" => amie_state(pkmn)
  }
end

def bag_state
  $bag.pockets.flat_map { |pocket| pocket.map { |slot| [slot[0].to_s, slot[1]] } }
end

def error_of(e)
  [e.class.to_s, e.message.lines.first.strip.gsub(/#<(\w+):0x\h+>/, '#<\1>')]
end

#===============================================================================
# Scenarios
#===============================================================================
out = { "eatable" => EATABLE_ITEMS.map(&:to_s), "maxPoints" => Pokemon::MAXAMIEPOINTS,
        "stats" => [], "feed" => [], "levels" => [], "reset" => [], "hunger" => [], "choose" => [] }

# --- changeAmieStats -------------------------------------------------------------
methods = %w[walking sendInBattle feedPlainBean feedPatternBean feedRainbowBean feedMalasada
             feedMalasadaDisliked feedMalasadaLiked pet unknown]
[[0, 0, 0], [100, 200, 250], [254, 255, 1], [130, 3, 30]].each do |start|
  methods.each do |m|
    new_player
    pkmn = build_pokemon(mon("PIKACHU", amie: start))
    rolls!
    $log = []
    pkmn.changeAmieStats(m)
    out["stats"] << { "setup" => { "method" => m, "amie" => start, "rolls" => $used.dup },
                      "result" => { "amie" => amie_state(pkmn), "log" => $log } }
  end
end

# --- feedAmie ----------------------------------------------------------------------
def feed(out, name, item, spec, bag: nil)
  new_player
  bag ||= [[item, 2]]
  bag.each { |i, q| $bag.add(i.to_sym, q) }
  pkmn = build_pokemon(spec)
  $player.party = [pkmn]
  scene = PokeAmie_Scene.new
  rolls!
  $log = []
  error = nil
  ret = nil
  begin
    ret = pkmn.feedAmie(item.to_sym, pkmn, scene)
  rescue StandardError => e
    error = error_of(e)
  end
  out["feed"] << {
    "setup" => { "name" => name, "item" => item, "pokemon" => spec, "bag" => bag, "rolls" => $used.dup },
    "result" => { "error" => error, "pokemon" => pokemon_state(pkmn), "bag" => bag_state, "log" => $log,
                  "returned" => ret.is_a?(Integer) || ret.nil? || ret == true || ret == false ? ret : ret.class.to_s }
  }
end

hurt = ->(extra = {}) { mon("PIKACHU", 30, **{ hp: 20, status: "BURN", amie: [10, 0, 5], happiness: 70 }.merge(extra)) }
EATABLE_ITEMS.each do |item|
  feed(out, "#{item} on a hurt, burnt Pikachu", item.to_s, hurt.())
end
feed(out, "Oran Berry at full HP", "ORANBERRY", mon("PIKACHU", 30, amie: [10, 0, 5]))
feed(out, "Pomeg Berry with HP EVs", "POMEGBERRY", mon("PIKACHU", 30, amie: [10, 0, 5], ev: { "HP" => 100 }))
feed(out, "Razz Berry", "RAZZBERRY", mon("PIKACHU", 30, amie: [10, 0, 5]))
feed(out, "Razz Berry near the caps", "RAZZBERRY", mon("PIKACHU", 30, amie: [253, 200, 255]))
feed(out, "Razz Berry when fullness is 254", "RAZZBERRY", mon("PIKACHU", 30, amie: [10, 254, 0]))
feed(out, "Razz Berry when full", "RAZZBERRY", mon("PIKACHU", 30, amie: [10, 255, 0]))
feed(out, "Razz Berry, last one in the Bag", "RAZZBERRY", mon("PIKACHU", 30, amie: [0, 0, 0]), bag: [["RAZZBERRY", 1]])
feed(out, "Liechi Berry", "LIECHIBERRY", mon("PIKACHU", 30, amie: [60, 100, 0]))
feed(out, "Potion (not food)", "POTION", hurt.())
feed(out, "Rare Candy at full HP", "RARECANDY", mon("PIKACHU", 30, amie: [10, 0, 5]))
feed(out, "Lum Berry, healthy", "LUMBERRY", mon("PIKACHU", 30, amie: [10, 0, 5]))

# --- getAmieStatLevel, resetAffection ----------------------------------------------
new_player
lv = build_pokemon(mon("PIKACHU"))
[0, 1, 49, 50, 99, 100, 149, 150, 254, 255].each { |p| out["levels"] << [p, lv.getAmieStatLevel(p)] }
[[0, 0, 0], [77, 12, 200], [255, 255, 255]].each do |start|
  pkmn = build_pokemon(mon("PIKACHU", amie: start))
  pkmn.resetAffection
  out["reset"] << { "amie" => start, "after" => amie_state(pkmn) }
end

# --- :hungerCounter ----------------------------------------------------------------
new_player
$player.party = [build_pokemon(mon("PIKACHU", amie: [10, 3, 1])), build_pokemon(mon("TOGEPI", 1, egg: true, amie: [0, 2, 0])),
                 build_pokemon(mon("GEODUDE", 12, hp: 0, amie: [5, 120, 90]))]
eval_game_code("HUNGERCOUNTER = 0", "(reset)")
counts = [1, 48, 1, 1, 49, 1, 60, 50, 40]
counts.each do |n|
  n.times { EventHandlers.trigger(:on_step_taken, Object.new) }
  out["hunger"] << { "steps" => n, "counter" => HUNGERCOUNTER, "party" => $player.party.map { |p| amie_state(p) } }
end

# --- pbFirstNonEggPokemonOrFaintedPokemon, setAmiePokemon ----------------------------
choose = lambda do |name, specs, arg|
  new_player
  $player.party = specs.map { |s| build_pokemon(s) }
  first = pbFirstNonEggPokemonOrFaintedPokemon
  res = { "first" => first ? $player.party.index(first) : nil }
  begin
    got = setAmiePokemon(arg)
    res["set"] = got ? $player.party.index(got) : nil
  rescue StandardError => e
    res["error"] = error_of(e)
  end
  out["choose"] << { "setup" => { "name" => name, "party" => specs, "arg" => arg }, "result" => res }
end
egg = mon("TOGEPI", 1, egg: true)
fainted = mon("GEODUDE", 12, hp: 0)
able = mon("PIKACHU")
choose.("default, first able", [egg, fainted, able, mon("EEVEE")], nil)
choose.("index of an able one", [egg, fainted, able, mon("EEVEE")], 3)
choose.("index of a fainted one", [egg, fainted, able], 1)
choose.("index of an egg", [egg, fainted, able], 0)
choose.("nobody able", [egg, fainted], nil)
choose.("nobody able, egg index", [egg, fainted], 0)
choose.("index past the party", [able], 4)

# --- feedAmie's berry plant lookup (Data/berry_plants.dat) ----------------------------
berry_data = pbRgssOpen("Data/berry_plants.dat", "rb") { |f| Marshal.load(f) }
out["berryPlantData"] = {
  "loaded" => berry_data.is_a?(Hash), "keyClass" => berry_data.keys.first.class.to_s,
  "hitByItem" => !berry_data[GameData::Item.get(:ORANBERRY)].nil?, "hitBySymbol" => !berry_data[:ORANBERRY].nil?
}

path = File.expand_path("../../src/plugins/pokemonAmie/amieReference.json", __dir__)
File.write(path, JSON.pretty_generate(out) + "\n")
puts "wrote #{path}: #{out.map { |k, v| "#{k} #{v.is_a?(Array) ? v.length : 1}" }.join(', ')}"
