# Runs the game's real minigame code headless and writes
# web/src/minigames/minigamesReference.json, which
# web/src/minigames/minigames.test.ts replays against the TypeScript port:
#
# - 017_Minigames/002_Minigame_TripleTriad.rb + Plugins/Triple Triad Booster
#   Packs (TripleTriad_Improvements.rb, TripleTriad_Booster_Packs.rb): every
#   card's numbers, type, name and price; TriadScreen#pbStartScreen with a
#   scripted scene (rules, captures, the AI's moves, trades); BoosterPack.give
#   and the booster stock;
# - 001_Minigame_Duel.rb: PokemonDuel#pbDuel (the opponent's choices and the
#   outcome of every command), with the movement and flashes stubbed;
# - 003_Minigame_SlotMachine.rb: SlotMachineReel (shuffle, spin, slipping)
#   and SlotMachineScene#pbPayout;
# - 004_Minigame_VoltorbFlip.rb: pbNewGame's board generation, levels 1-8;
# - 005_Minigame_Lottery.rb: pbSetLotteryNumber on fixed dates, pbLottery;
# - 006_Minigame_Mining.rb: item/iron placement, the tiles, pbHit;
# - 007_Minigame_TilePuzzles.rb: pbShuffleTiles for games 1-7;
# - Plugins/Roulette Game: the cursor's multipliers and bets, startSpin's
#   result, processResults' payouts.
#
#   cd web && ruby tools/ruby-ref/minigames_reference.rb
#
# Kernel#rand is replaced by a queue of raw numbers (rand(n) = raw % n;
# Essentials' rand(a..b) is a + rand(b - a + 1)) and Array#shuffle!/#sample
# by Ruby 2.6's algorithms on top of it; the TypeScript test replays the same
# numbers. Graphics are stubs (the classes accept any call). Sorting with a
# block is the system Ruby's (macOS qsort_r), as rubySort's "bsd".

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

#===============================================================================
# Stubs
#===============================================================================
class Anything
  def method_missing(*_a); self; end
  def respond_to_missing?(*_a); true; end
end

module Console; def self.echo_li(*_a); end; end unless defined?(Console) && Console.respond_to?(:echo_li)
module Console; def self.echo_li(*_a); end; end
class BitmapSprite < Sprite
  def initialize(*_a); @bitmap = Anything.new; end
  attr_accessor :bitmap
end
class IconSprite < Sprite; end
class AnimatedBitmap
  def initialize(*_a); end
  def bitmap; Anything.new; end
  def width; 64; end
  def height; 64; end
  def dispose; end
end
class BitmapWrapper < Anything; def initialize(*_a); end; end
class Window_AdvancedTextPokemon < Anything; def initialize(*_a); end; end
class MoveSelectionSprite < Sprite; end
def pbUpdateSpriteHash(*_a); end
def pbPlayCursorSE; end
def pbPlayBuzzerSE; end
def pbPlayDecisionSE; end
def pbSEStop; end
def pbFadeOutIn(*_a); yield if block_given?; end
def pbDrawTextPositions(*_a); end

$messages = []
$answers = []
def pbMessage(text, commands = nil, *_a)
  $messages << ["msg", text]
  return 0 if !commands
  ret = ($answers.shift || 0) % commands.length
  $messages << ["choice", ret]
  ret
end
def pbConfirmMessage(text, *_a)
  ret = $answers.shift
  ret = false if ret.nil?
  $messages << ["confirm", text, ret]
  ret
end

#===============================================================================
# Scripted randomness
#===============================================================================
$rolls = []
$used = []
$gen = Random.new(1)
class << Kernel
  def oldRand(arg = nil)
    raise "out of scripted rolls" if $rolls.empty?
    raw = $rolls.shift
    $used.push(raw)
    raise "unexpected rand(#{arg.inspect})" unless arg.is_a?(Integer) && arg > 0
    raw % arg
  end
end
class Array
  def shuffle!(*_a)
    i = length
    while i > 0
      j = Kernel.rand(i)
      i -= 1
      self[i], self[j] = self[j], self[i]
    end
    self
  end
  def shuffle(*_a); dup.shuffle!; end
  def sample(*_a)
    return nil if empty?
    return self[0] if length == 1
    self[Kernel.rand(length)]
  end
end
def rolls!(n)
  $rolls = Array.new(n) { $gen.rand(1 << 30) }
  $used = []
end

def eval_game_file(path, filter = nil)
  code = File.read(path, encoding: "UTF-8").scrub
  code = filter.call(code) if filter
  TOPLEVEL_BINDING.eval(code, path)
end

storage_rb = File.read(File.join(SCRIPTS, "014_Pokemon", "001_Pokemon-related", "004_PokemonStorage.rb"), encoding: "UTF-8")
TOPLEVEL_BINDING.eval(storage_rb[/^def pbEachPokemon\b.*?^end\r?$/m])
MINIGAMES = File.join(SCRIPTS, "017_Minigames")
TRIAD = File.join(PLUGINS, "Triple Triad Booster Packs")
%w[001_Minigame_Duel.rb 002_Minigame_TripleTriad.rb 003_Minigame_SlotMachine.rb 004_Minigame_VoltorbFlip.rb
   005_Minigame_Lottery.rb 006_Minigame_Mining.rb 007_Minigame_TilePuzzles.rb].each do |f|
  eval_game_file(File.join(MINIGAMES, f))
end
eval_game_file(File.join(TRIAD, "TripleTriad_Booster_Packs.rb"))
eval_game_file(File.join(TRIAD, "TripleTriad_Improvements.rb"))
eval_game_file(File.join(PLUGINS, "Roulette Game", "Roulette Game.rb"))

def new_world
  saved = [$rolls, $used]
  $rolls = Array.new(16, 0) # Player.new's trainer ID (not part of what's compared)
  $used = []
  $PokemonGlobal = PokemonGlobalMetadata.new
  $player = Player.new("Gold", GameData::TrainerType.keys.first)
  $player.id = 12_345_678
  $rolls, $used = saved
  $messages = []
  $answers = []
end

out = {}

#===============================================================================
# Triple Triad cards
#===============================================================================
out["speciesKeys"] = GameData::Species.keys.map(&:to_s)
out["typeKeys"] = GameData::Type.keys.map(&:to_s)
cards = {}
(GameData::Species.keys + [:OAK, :OAK_2, :RATTATA_2]).each do |sp|
  c = TriadCard.new(sp)
  cards[sp.to_s] = [c.north, c.east, c.south, c.west, c.type.to_s, c.name, c.price]
end
out["cards"] = cards
# bonus(): every attacking type against every defending type
bonus = {}
GameData::Type.each do |a|
  next if a.pseudo_type
  ca = TriadCard.new(:PIKACHU)
  ca.instance_variable_set(:@type, a.id)
  row = []
  GameData::Type.each do |d|
    next if d.pseudo_type
    cd = TriadCard.new(:PIKACHU)
    cd.instance_variable_set(:@type, d.id)
    row << ca.bonus(cd)
  end
  bonus[a.id.to_s] = row
end
out["bonus"] = bonus

#===============================================================================
# Triple Triad duels (TriadScreen#pbStartScreen with a scripted scene)
#===============================================================================
class StubTriadScene
  attr_reader :log

  def initialize(cancel_turn)
    @log = []
    @turn = 0
    @cancel_turn = cancel_turn
  end

  def snapshot
    @battle.board.map { |sq| [sq.owner, sq.card ? sq.card.species.to_s : nil, sq.type ? sq.type.to_s : nil] }
  end

  def pbStartScene(battle); @battle = battle; @log << ["start", snapshot]; end
  def pbEndScene; @log << ["end"]; end
  def pbDisplay(text); @log << ["display", text]; end
  def pbDisplayPaused(text); @log << ["paused", text]; end
  def pbNotifyCards(p, o); @log << ["notify", p.map(&:to_s), o.map(&:to_s)]; end
  def pbShowPlayerCards(cards); @log << ["showPlayer", cards.map(&:to_s)]; end
  def pbShowOpponentCards(cards); @log << ["showOpponent", cards.map(&:to_s)]; end
  def pbUpdateScore; end

  def pbChooseTriadCard(storage)
    chosen = []
    while chosen.length < @battle.maxCards
      item = storage[(chosen.length * 2) % storage.length]
      chosen << item[0]
      @battle.pbSubtract(storage, item[0])
    end
    @log << ["chosen", chosen.map(&:to_s)]
    chosen
  end

  def pbPlayerChooseCard(num)
    @turn += 1
    idx = (@turn * 7) % num
    @log << ["choose", idx]
    idx
  end

  def pbPlayerPlaceCard(_card_index)
    if @turn == @cancel_turn
      @cancel_turn = -1
      @log << ["place", nil]
      return nil
    end
    start = (@turn * 5) % 9
    i = (0...9).map { |k| (start + k) % 9 }.find { |k| !@battle.isOccupied?(k % 3, k / 3) }
    @log << ["place", [i % 3, i / 3]]
    [i % 3, i / 3]
  end

  def pbEndPlaceCard(pos, ci); @log << ["endPlace", pos, ci, snapshot]; end
  def pbOpponentPlaceCard(card, pos, ci); @log << ["oppPlace", card.species.to_s, pos, ci]; end
  def pbEndOpponentPlaceCard(pos, ci); @log << ["endOpp", pos, ci, snapshot]; end
end

DUEL_DECKS = [
  %w[PIKACHU CHARMANDER SQUIRTLE BULBASAUR GEODUDE ONIX MACHOP ABRA],
  %w[RATTATA_1 OAK CATERPIE PIDGEY ZUBAT ZUBAT SANDSHREW VULPIX],
  %w[DRAGONITE TYRANITAR GYARADOS SNORLAX LAPRAS MEWTWO ALAKAZAM MACHAMP],
]
OPP_DECKS = [
  %w[RATTATA WEEDLE CATERPIE PIKACHU BELLSPROUT],
  %w[ARCEUS ARCEUS ARCEUS ARCEUS ARCEUS],
  %w[CHINCHOU SANDSHREW VULPIX PARAS MACHOP],
  %w[ELEKID METAPOD CLEFFA TOGEPI LEDYBA],
  %w[MEWTWO MEW LUGIA HOOH CELEBI],
]
RULES = [
  [], ["samewins"], ["elements"], ["samewins", "elements"], ["wrap"], ["wrap", "samewins"],
  ["openhand", "countunplayed"], ["randomhand"], ["direct"], ["winall"], ["noprize"], ["elements", "noprize"],
  ["samewins", "elements", "noprize"], ["direct", "elements"], ["winall", "samewins"],
]
duels = []
seed = 0
RULES.each_with_index do |rules, ri|
  [0, 1, 2].each do |di|
    seed += 1
    deck = DUEL_DECKS[(ri + di) % DUEL_DECKS.length]
    oppdeck = (di == 2 && ri.even?) ? nil : OPP_DECKS[(ri * 3 + di) % OPP_DECKS.length]
    prize = (di == 1 && ri % 4 == 0) ? "CATERPIE" : nil
    min_level = (ri + di) % 5
    owned = %w[PIKACHU RATTATA ZUBAT GEODUDE ONIX CATERPIE]
    $gen = Random.new(1000 + seed)
    new_world
    owned.each { |s| $player.pokedex.set_owned(s.to_sym) }
    deck.each { |c| $PokemonGlobal.triads.add(c.to_sym) }
    rolls!(8000)
    scene = StubTriadScene.new(ri % 3 == 0 ? 2 : -1)
    screen = TriadScreen.new(scene)
    error = nil
    begin
      result = screen.pbStartScreen("Jack", min_level, [min_level + 2, 9].min, rules,
                                    oppdeck && oppdeck.map(&:to_sym), prize && prize.to_sym)
    rescue StandardError => e
      error = "#{e.class}: #{e.message.lines.first&.strip}"
    end
    duels << {
      "rules" => rules, "deck" => deck, "oppdeck" => oppdeck, "prize" => prize, "minLevel" => min_level,
      "maxLevel" => [min_level + 2, 9].min, "owned" => owned, "cancelTurn" => (ri % 3 == 0 ? 2 : -1),
      "rolls" => $used, "result" => result, "error" => error, "log" => scene.log,
      "triads" => $PokemonGlobal.triads.items.map { |i| [i[0].to_s, i[1]] }
    }
  end
end
out["duels"] = duels

#===============================================================================
# Booster packs (BoosterPack.give, $PokemonGlobal.booster_stock)
#===============================================================================
boosters = []
[[1, 5], [3, 5], [8, 5], [0, 5], [5, 35]].each_with_index do |(index, n), k|
  $gen = Random.new(2000 + k)
  new_world
  rolls!(4000)
  BoosterPack.initialize_all_packs if k == 2
  item = %i[BOOSTERPACK_GENESIS BOOSTERPACK_DISCOVERY BOOSTERPACK_LABORATORY BOOSTERPACK_GENESIS BOOSTERPACK_EVOLUTION][k]
  ret = BoosterPack.give(item, n, index)
  boosters << {
    "index" => index, "n" => n, "item" => item.to_s, "init" => k == 2, "ret" => ret, "rolls" => $used,
    "messages" => $messages, "stock" => $PokemonGlobal.instance_variable_get(:@booster_stock).map { |s| s && s.map(&:to_s) },
    "triads" => $PokemonGlobal.triads.items.map { |i| [i[0].to_s, i[1]] }
  }
end
out["boosters"] = boosters

#===============================================================================
# Duel (PokemonDuel#pbDuel)
#===============================================================================
class PokemonDuel
  def pbStartDuel(_opponent, _event); end
  def pbEndDuel; end
  def pbFlashScreens(*_a); end
  def pbRefresh; $messages << ["hp", @hp.dup]; end
end
def pbMoveRoute(*_a); end
module PBMoveRoute; def self.const_missing(_n); 0; end; end
def pbShake(*_a); end
def pbFlash(*_a); end
duel_scenarios = []
8.times do |k|
  $gen = Random.new(3000 + k)
  new_world
  rolls!(400)
  $answers = Array.new(60) { |i| [0, 1, 2, 3, 1, 2, 0, 3][(i * (k + 1) + k) % 8] }
  answers = $answers.dup
  opponent = NPCTrainer.new("Cristian", :BLACKBELT)
  speeches = Array.new(12) { |i| "speech#{i}" }
  decision = PokemonDuel.new.pbDuel(opponent, nil, speeches)
  duel_scenarios << { "answers" => answers, "rolls" => $used, "decision" => decision, "log" => $messages }
end
out["duel"] = duel_scenarios

#===============================================================================
# Slot machine
#===============================================================================
reels = []
[0, 1, 2].each do |difficulty|
  6.times do |k|
    $gen = Random.new(4000 + difficulty * 10 + k)
    rolls!(200)
    reel = SlotMachineReel.new(0, 0, difficulty)
    initial = { "reel" => reel.reel.dup, "showing" => reel.showing }
    reel.startSpinning
    steps = []
    (5 + k * 3).times { reel.update; steps << [reel.toppos, reel.showing] }
    reel.stopSpinning(k == 5)
    slipping = reel.slipping
    n = 0
    while reel.spinning
      reel.update
      steps << [reel.toppos, reel.showing]
      n += 1
      raise "reel never stops" if n > 500
    end
    reels << { "difficulty" => difficulty, "spins" => 5 + k * 3, "noslip" => k == 5, "rolls" => $used,
               "initial" => initial, "slipping" => slipping, "steps" => steps, "final" => reel.showing }
  end
end
out["reels"] = reels

class FakeReel
  def initialize(showing); @showing = showing; end
  def showing; @showing; end
end
payouts = []
$gen = Random.new(4500)
120.times do |k|
  combos = Array.new(3) { Array.new(3) { [0, 0, 1, 2, 3, 4, 5, 6, 7, 5, 6, 0][$gen.rand(12)] } }
  combos[1] = combos[0].dup if k % 7 == 0
  combos[2] = combos[0].dup if k % 5 == 0
  wager = 1 + (k % 3)
  scene = SlotMachineScene.new
  sprites = Hash.new { |h, key| h[key] = Anything.new }
  sprites["reel1"] = FakeReel.new(combos[0])
  sprites["reel2"] = FakeReel.new(combos[1])
  sprites["reel3"] = FakeReel.new(combos[2])
  sprites["payout"] = SlotMachineScore.new(0, 0, 0)
  sprites["credit"] = SlotMachineScore.new(0, 0, 100)
  scene.instance_variable_set(:@sprites, sprites)
  scene.wager = wager
  scene.pbPayout
  payouts << { "reels" => combos, "wager" => wager, "credit" => sprites["credit"].score, "replay" => scene.replay }
end
out["payouts"] = payouts

#===============================================================================
# Voltorb Flip boards (pbNewGame's generation)
#===============================================================================
vf_code = File.read(File.join(MINIGAMES, "004_Minigame_VoltorbFlip.rb"), encoding: "UTF-8").gsub("\r\n", "\n")
gen = vf_code[/^    squareValues = \[\].*?squareValues\.delete_at\(r\)\n    end\n/m]
raise "Voltorb Flip board generation not found" if !gen
TOPLEVEL_BINDING.eval("class VoltorbFlip\n def gen_board(level)\n @level = level\n @squares = [0, 0, 0, false]\n#{gen}\n @squares\n end\nend")
boards = []
(1..8).each do |level|
  5.times do |k|
    $gen = Random.new(5000 + level * 10 + k)
    rolls!(200)
    squares = VoltorbFlip.new.gen_board(level)
    boards << { "level" => level, "rolls" => $used, "squares" => squares }
  end
end
out["voltorbFlip"] = boards

#===============================================================================
# Lottery
#===============================================================================
lottery = []
[[2026, 10, 29], [2026, 1, 1], [2025, 12, 31], [2024, 2, 29], [2000, 6, 15], [2026, 7, 4], [1999, 11, 30], [2030, 3, 9]].each do |y, m, d|
  t = Time.local(y, m, d, 12, 0, 0)
  hash = t.day + (t.month << 5) + (t.year << 9)
  r = Random.new(hash).rand(65_536) # what srand(hash); rand(65_536) draws
  lottery << { "date" => [y, m, d], "number" => format("%05d", r) }
end
# pbLottery's matching, with party / boxes of Pokémon carrying owner IDs
LotteryOwner = Struct.new(:public_id)
LotteryMon = Struct.new(:name, :owner)
class LotteryStorage
  def initialize(boxes); @boxes = boxes; end
  def maxBoxes; @boxes.length; end
  def maxPokemon(i); i < 0 ? $player.party.length : @boxes[i].length; end
  def [](i); i < 0 ? $player.party : @boxes[i]; end
end
class FakeVariables < Hash; end
lottery_draws = []
$gen = Random.new(6000)
10.times do |k|
  winnum = format("%05d", $gen.rand(65_536))
  ids = Array.new(9) { |i| (i % 3 == 0) ? winnum.to_i - $gen.rand(10) * (10**$gen.rand(5)) : $gen.rand(65_536) }
  ids = ids.map { |v| v % 65_536 }
  party = ids[0, 3].each_with_index.map { |id, i| LotteryMon.new("P#{i}", LotteryOwner.new(id)) }
  boxes = [ids[3, 3].each_with_index.map { |id, i| LotteryMon.new("B#{i}", LotteryOwner.new(id)) },
           ids[6, 3].each_with_index.map { |id, i| LotteryMon.new("C#{i}", LotteryOwner.new(id)) }]
  $player = Struct.new(:party).new(party)
  $PokemonStorage = LotteryStorage.new(boxes)
  $game_variables = FakeVariables.new
  pbLottery(winnum)
  lottery_draws << { "winnum" => winnum, "party" => ids[0, 3], "boxes" => [ids[3, 3], ids[6, 3]],
                     "vars" => [$game_variables[2], $game_variables[3], $game_variables[4]] }
end
out["lottery"] = { "numbers" => lottery, "draws" => lottery_draws }

#===============================================================================
# Mining
#===============================================================================
mining = []
8.times do |k|
  $gen = Random.new(7000 + k)
  rolls!(3000)
  scene = MiningGameScene.new
  sprites = Hash.new { |h, key| h[key] = Anything.new }
  scene.instance_variable_set(:@sprites, sprites)
  scene.instance_variable_set(:@itembitmap, AnimatedBitmap.new)
  scene.instance_variable_set(:@ironbitmap, AnimatedBitmap.new)
  scene.instance_variable_set(:@items, [])
  scene.instance_variable_set(:@itemswon, [])
  scene.instance_variable_set(:@iron, [])
  scene.pbDistributeItems
  scene.pbDistributeIron
  layers = []
  MiningGameScene::BOARD_HEIGHT.times do |i|
    MiningGameScene::BOARD_WIDTH.times do |j|
      tile = MiningGameTile.new(32 * j, 64 + (32 * i))
      sprites["tile#{j + (i * MiningGameScene::BOARD_WIDTH)}"] = tile
      layers << tile.layer
    end
  end
  items = scene.instance_variable_get(:@items).map(&:dup)
  iron = scene.instance_variable_get(:@iron).map(&:dup)
  # Hits: pick/hammer at scripted positions
  cursor = MiningGameCursor.new(58, 0)
  sprites["cursor"] = cursor
  crack = MiningGameCounter.new(0, 4)
  sprites["crack"] = crack
  hits = []
  25.times do |h|
    cursor.position = (h * 37 + k * 11) % 130
    cursor.mode = (h + k) % 2
    cursor.counter = 0
    scene.pbHit
    hits << [cursor.position, cursor.mode, crack.hits, cursor.hit,
             scene.instance_variable_get(:@itemswon).map(&:to_s)]
  end
  final_layers = (0...130).map { |i| sprites["tile#{i}"].layer }
  mining << { "rolls" => $used, "items" => items, "iron" => iron, "layers" => layers, "hits" => hits,
              "finalLayers" => final_layers,
              "revealed" => scene.instance_variable_get(:@items).map { |i| i[3] ? true : false } }
end
out["mining"] = mining

#===============================================================================
# Tile puzzles (pbShuffleTiles)
#===============================================================================
puzzles = []
(1..7).each do |game|
  [[4, 4], [3, 3], [5, 4]].each_with_index do |(w, h), k|
    $gen = Random.new(8000 + game * 10 + k)
    rolls!(4000)
    scene = TilePuzzleScene.new(game, "Kabuto", w, h)
    scene.instance_variable_set(:@heldtile, -1)
    scene.instance_variable_set(:@angles, [])
    scene.instance_variable_set(:@sprites, Hash.new { |hh, key| hh[key] = Anything.new })
    tiles = scene.pbShuffleTiles
    scene.instance_variable_set(:@tiles, tiles)
    puzzles << { "game" => game, "width" => w, "height" => h, "rolls" => $used, "tiles" => tiles,
                 "angles" => scene.instance_variable_get(:@angles), "cursor" => scene.pbDefaultCursorPosition }
  end
end
out["tilePuzzles"] = puzzles

#===============================================================================
# Roulette
#===============================================================================
class RouletteSprite < Anything
  attr_accessor :x, :y, :visible
  attr_reader :file
  def setBitmap(f); @file = f; end
end
roulette_cursor = []
$gen = Random.new(9000)
6.times do |k|
  played = Array.new(12) { |i| k > 0 && (i * 5 + k) % 7 < k }
  sprite = RouletteSprite.new
  cursor = Roulette::Cursor.new(sprite, played, 100, 200)
  moves = Array.new(30) { %w[up down left right][$gen.rand(4)] }
  states = moves.map do |m|
    cursor.send("move#{m.capitalize}")
    [cursor.indexX, cursor.indexY, cursor.multiplier, cursor.bentPositions, sprite.file, sprite.x, sprite.y]
  end
  roulette_cursor << { "played" => played, "moves" => moves, "states" => states }
end
spins = []
6.times do |k|
  $gen = Random.new(9100 + k)
  rolls!(300)
  new_world
  $player.coins = 50
  scene = Roulette::Scene.new
  played = Array.new(12) { |i| (i * 3 + k) % 7 < k }
  played_before = played.dup
  sprites = Hash.new { |h, key| h[key] = Anything.new }
  scene.instance_variable_set(:@sprites, sprites)
  scene.instance_variable_set(:@playedBalls, played)
  scene.instance_variable_set(:@roulette, Anything.new)
  scene.instance_variable_set(:@usedIconColor, nil)
  scene.instance_variable_set(:@wager, 1 + k % 3)
  scene.instance_variable_set(:@tableBallPosArray, [])
  cursor = Roulette::Cursor.new(RouletteSprite.new, played, 100, 200)
  [[0, 1], [2, 0], [3, 3], [0, 3], [1, 2], [4, 0]][k].tap { |x, y| cursor.setIndex(x, y) }
  scene.instance_variable_set(:@cursor, cursor)
  scene.startSpin
  result = scene.instance_variable_get(:@result)
  $answers = [k.even?]
  scene.processResults
  spins << { "played" => played_before, "wager" => 1 + k % 3, "index" => [cursor.indexX, cursor.indexY], "rolls" => $used,
             "result" => result, "degrees" => scene.instance_variable_get(:@degreesToSpin),
             "coins" => $player.coins, "exit" => scene.instance_variable_get(:@exit),
             "playedAfter" => scene.instance_variable_get(:@playedBalls).dup, "messages" => $messages }
end
out["roulette"] = { "cursor" => roulette_cursor, "spins" => spins }

File.write(File.join(ROOT, "web", "src", "minigames", "minigamesReference.json"), JSON.generate(out))
puts "wrote minigamesReference.json: #{duels.length} duels, #{cards.length} cards"
