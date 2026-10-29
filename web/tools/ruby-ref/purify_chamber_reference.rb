# Runs the logic of Data/Scripts/016_UI/022_UI_PurifyChamber.rb and
# 014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb headless, on
# fixed scenarios, and writes
# web/src/ui/purifyChamber/purifyChamberReference.json, which
# web/src/ui/purifyChamber/purifyChamber.test.ts replays against the
# TypeScript port:
# - calcPoint, PurifyChamber.maximumTempo, PurifyChamberSet#partialSum;
# - PurifyChamberSet.typeAdvantage for every type pair and isSuperEffective
#   for every pair of a pool of Pokémon;
# - random sequences of chamber operations (setShadow, insertAfter, insertAt,
#   PurifyChamberHelper.pbSetPokemon, switch, facing=, currentSet=, heart
#   gauge changes, update and the :lower_heart_gauges step handler), with the
#   whole chamber (lists, facing, flow, tempo, affinity, shadowAffinity,
#   chamberFlow, isPurifiable?, pbGetPokemon/pbGetPokemon2 at every position)
#   and the messages after each one;
# - PurifyChamberHelper.adjustOnInsert;
# - PurifyChamberSetView#moveCursor for every set size, cursor and direction
#   (the view's graphics are skipped: refresh is a no-op on that instance);
# - pbPurify on Shadow Pokémon with saved Exp./EVs, with a recording scene.
# The windows, sprites and scenes are graphics only and are checked in the
# browser (web/dev-purify.html).
#
#   cd web && ruby tools/ruby-ref/purify_chamber_reference.rb
#
# Pokémon.new draws IVs, natures, genders… freely; every Pokémon's nature is
# then set explicitly so the heart gauge amounts match on both sides.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path, line = 1)
  TOPLEVEL_BINDING.eval(code, path, line)
end

$log = []
def pbMessage(message, _commands = nil, _cmdIfCancel = 0, _skin = nil, _defaultCmd = 0, &_block)
  $log << ["msg", message]
  0
end

def pbConfirmMessage(message, &_block)
  $log << ["confirmMsg", message]
  false
end

class Game_Temp
  def method_missing(*_a); nil; end
  def respond_to_missing?(*_a); true; end
end
$game_temp = Game_Temp.new
$game_map = Struct.new(:map_id).new(5)

# Engine/UI classes 022_UI_PurifyChamber.rb subclasses or reopens.
class PokemonGlobalMetadata; end
class Window_DrawableCommand; def initialize(*_a); end; end
class PokemonSystem; attr_accessor :givenicknames; end

eval_game_code(File.read(File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "002_ShadowPokemon_Other.rb"),
                         encoding: "UTF-8"), "002_ShadowPokemon_Other.rb")
purify = File.join(SCRIPTS, "016_UI", "022_UI_PurifyChamber.rb")
eval_game_code(File.read(purify, encoding: "UTF-8"), purify)

out = {}

#===============================================================================
# Pure functions
#===============================================================================
out["calcPoint"] = []
[[306, 158, 96], [0, 0, 1], [10, -5, 37]].each do |x, y, d|
  [-725, -360, -90, -45, 0, 1, 45, 90, 135, 180, 270, 359, 359.99, 360, 450, 720, 1000, 2159].each do |a|
    out["calcPoint"] << [x, y, d, a, calcPoint(x, y, d, a)]
  end
end
out["maximumTempo"] = PurifyChamber.maximumTempo
out["partialSum"] = (0..6).map { |x| PurifyChamberSet.new.partialSum(x) }
types = GameData::Type.keys.map(&:to_s).sort
out["types"] = types
out["typeAdvantage"] = types.map { |a| types.map { |b| PurifyChamberSet.typeAdvantage(a.to_sym, b.to_sym) ? 1 : 0 } }
out["adjustOnInsert"] = (-2..10).map { |p| [p, PurifyChamberHelper.adjustOnInsert(p)] }

#===============================================================================
# A pool of Pokémon
#===============================================================================
$player = Player.new("Gold", GameData::TrainerType.keys.first)
$stats = GameStats.new
$PokemonSystem = PokemonSystem.new
$PokemonSystem.givenicknames = 1

# [species, level, nature, shadow, heart gauge (nil = makeShadow's)]
POOL = [
  ["PIKACHU", 30, "HARDY", false, nil], ["GEODUDE", 20, "BOLD", false, nil], ["CHARMANDER", 15, "LONELY", false, nil],
  ["SQUIRTLE", 15, "BRAVE", false, nil], ["BULBASAUR", 15, "MODEST", false, nil], ["PIDGEY", 5, "TIMID", false, nil],
  ["RATTATA", 5, "JOLLY", false, nil], ["ONIX", 14, "CALM", false, nil], ["GASTLY", 18, "QUIRKY", false, nil],
  ["SNORLAX", 40, "SASSY", false, nil], ["EEVEE", 20, "DOCILE", false, nil], ["MAGNEMITE", 22, "RASH", false, nil],
  ["TOGEPI", 1, "HARDY", false, nil],
  ["BUTTERFREE", 25, "ADAMANT", true, nil], ["BEEDRILL", 25, "NAUGHTY", true, 30], ["ARBOK", 30, "IMPISH", true, 0],
  ["VULPIX", 20, "LAX", true, 7], ["MAGNETON", 30, "HASTY", true, 120], ["LUGIA", 50, "SERIOUS", true, 0],
  ["GROWLITHE", 20, "NAIVE", true, 250],
]
out["pool"] = POOL

def build_pool
  POOL.map do |sp, lv, nature, shadow, gauge|
    pkmn = Pokemon.new(sp.to_sym, lv)
    pkmn.nature = nature.to_sym
    if shadow
      pkmn.makeShadow
      pkmn.heart_gauge = gauge if gauge
    end
    pkmn
  end
end

pool = build_pool
out["isSuperEffective"] = pool.map { |a| pool.map { |b| PurifyChamberSet.isSuperEffective(a, b) ? 1 : 0 } }

#===============================================================================
# Operation sequences
#===============================================================================
def snapshot_chamber(ch, pool)
  idx = ->(p) { p ? pool.index(p) : nil }
  {
    "currentSet" => ch.currentSet,
    "sets" => (0...PurifyChamber::NUMSETS).map do |s|
      set = ch[s]
      {
        "list" => set.list.map { |p| idx.call(p) },
        "facing" => set.facing,
        "shadow" => idx.call(set.shadow),
        "flow" => set.flow,
        "tempo" => set.tempo,
        "affinity" => (-1..4).map { |i| set.affinity(i) },
        "shadowAffinity" => set.shadowAffinity,
        "chamberFlow" => ch.chamberFlow(s),
        "purifiable" => ch.isPurifiable?(s),
        "purifiableIgnoreRegular" => ch.isPurifiableIgnoreRegular?(s),
        "get2" => (-1..9).map { |pos| idx.call(PurifyChamberHelper.pbGetPokemon2(ch, s, pos)) },
      }
    end,
    "get" => (-1..9).map { |pos| idx.call(PurifyChamberHelper.pbGetPokemon(ch, pos)) },
    "slots" => (-1..PurifyChamber::NUMSETS).map { |c| (-1..4).map { |sl| idx.call(ch[c, sl]) } },
    "gauges" => pool.map { |p| p.heart_gauge },
    "counters" => pool.map { |p| p.heart_gauge_step_counter },
    "moves" => pool.map { |p| p.moves.map { |m| m.id.to_s } },
  }
end

step_handler = EventHandlers.class_variable_get(:@@events)[:on_player_step_taken]
                            .instance_variable_get(:@callbacks)[:lower_heart_gauges]

gen = Random.new(20261029)
out["sequences"] = []
6.times do |seq|
  pool = build_pool
  $player.party = [pool[0], pool[14], pool[16], pool[12]]
  ch = PurifyChamber.new
  $PokemonGlobal = Struct.new(:purifyChamber).new(ch)
  pick = lambda do |kind|
    case kind
    when :shadow then [13, 14, 15, 16, 17, 18, 19][gen.rand(7)]
    when :normal then gen.rand(13)
    else gen.rand(POOL.length)
    end
  end
  ops = []
  steps = []
  80.times do
    r = gen.rand(100)
    op = if r < 14 then ["setShadow", gen.rand(11) - 1, gen.rand(6) == 0 ? nil : pick.call(gen.rand(4) == 0 ? :any : :shadow)]
         elsif r < 34 then ["insertAfter", gen.rand(9), gen.rand(7) - 1, gen.rand(8) == 0 ? nil : pick.call(gen.rand(5) == 0 ? :any : :normal)]
         elsif r < 46 then ["insertAt", gen.rand(9), gen.rand(7) - 1, gen.rand(5) == 0 ? nil : pick.call(gen.rand(5) == 0 ? :any : :normal)]
         elsif r < 60 then ["helperSet", gen.rand(11) - 1, gen.rand(4) == 0 ? nil : pick.call(:any)]
         elsif r < 64 then ["switch", gen.rand(11) - 1, gen.rand(11) - 1]
         elsif r < 70 then ["facing", gen.rand(9), gen.rand(6) - 1]
         elsif r < 76 then ["currentSet", gen.rand(11) - 1]
         elsif r < 82 then ["heart", pick.call(:shadow), [0, 1, 5, 40, 300][gen.rand(5)]]
         elsif r < 92 then ["update"]
         else ["step", [1, 50, 255, 300][gen.rand(4)]]
         end
    $log = []
    case op[0]
    when "setShadow" then ch.setShadow(op[1], op[2] && pool[op[2]])
    when "insertAfter" then ch.insertAfter(op[1], op[2], op[3] && pool[op[3]])
    when "insertAt" then ch.insertAt(op[1], op[2], op[3] && pool[op[3]])
    when "helperSet" then PurifyChamberHelper.pbSetPokemon(ch, op[1], op[2] && pool[op[2]])
    when "switch" then ch.switch(op[1], op[2])
    when "facing" then ch[op[1]].facing = op[2]
    when "currentSet" then ch.currentSet = op[1]
    when "heart" then pool[op[1]].heart_gauge = op[2]
    when "update" then ch.update
    when "step" then op[1].times { step_handler.call }
    end
    ops << op
    steps << { "state" => snapshot_chamber(ch, pool), "log" => $log }
  end
  out["sequences"] << { "ops" => ops, "steps" => steps }
end

#===============================================================================
# PurifyChamberSetView#moveCursor
#===============================================================================
out["moveCursor"] = []
pool = build_pool
(0..PurifyChamber::SETSIZE).each do |count|
  ch = PurifyChamber.new
  count.times { |i| ch.insertAfter(0, ch.setCount(0), pool[i]) }
  view = PurifyChamberSetView.allocate
  def view.refresh; end
  view.instance_variable_set(:@chamber, ch)
  view.instance_variable_set(:@set, 0)
  (0..(PurifyChamber::SETSIZE * 2)).each do |cursor|
    [Input::UP, Input::DOWN, Input::LEFT, Input::RIGHT].each_with_index do |btn, b|
      view.instance_variable_set(:@cursor, cursor)
      view.moveCursor(btn)
      out["moveCursor"] << [count, cursor, b, view.cursor]
    end
  end
end

#===============================================================================
# pbPurify
#===============================================================================
class RecordingScene
  def pbDisplay(msg); $log << ["display", msg]; end
  def pbConfirm(msg); $log << ["confirm", msg]; false; end
  def pbUpdate; end
end

# [pool index, saved exp (nil = none), saved EVs (nil = none), givenicknames]
PURIFY = [
  [15, nil, nil, 1], [15, 40, { HP: 4, ATTACK: 252, SPEED: 300 }, 1], [18, 0, nil, 0], [16, 3, { DEFENSE: 10 }, 1],
  [14, 100, nil, 1], [17, nil, nil, 1], [13, 7, nil, 1],
]
out["purify"] = PURIFY.map do |i, exp, evs, nick|
  pool = build_pool
  pkmn = pool[i]
  pkmn.heart_gauge = 0 if [13, 14, 17].include?(i) && exp != 100
  pkmn.saved_exp = exp
  pkmn.saved_ev = evs ? (h = {}; GameData::Stat.each_main { |s| h[s.id] = evs[s.id] || 0 }; h) : nil
  $PokemonSystem.givenicknames = nick
  $stats = GameStats.new
  $log = []
  pbPurify(pkmn, RecordingScene.new)
  {
    "log" => $log,
    "shadow" => pkmn.shadowPokemon?,
    "moves" => pkmn.moves.map { |m| m.id.to_s },
    "firstMoves" => pkmn.first_moves.map(&:to_s),
    "exp" => pkmn.exp,
    "level" => pkmn.level,
    "ev" => pkmn.ev.map { |k, v| [k.to_s, v] }.to_h,
    "ribbons" => pkmn.ribbons.map(&:to_s),
    "savedExp" => pkmn.saved_exp,
    "savedEv" => pkmn.saved_ev.nil? ? nil : 1,
    "purified" => $stats.shadow_pokemon_purified,
  }
end

path = File.join(__dir__, "..", "..", "src", "ui", "purifyChamber", "purifyChamberReference.json")
File.write(path, JSON.generate(out))
puts "wrote #{path}"
