# Runs Plugins/Unown Report/Unown_Report_Mechanic.rb headless and writes
# web/src/plugins/unownReport/unownReportReference.json, which
# web/src/plugins/unownReport/unownReport.test.ts replays against the
# TypeScript port (web/src/plugins/unownReport/UnownReportMechanic.ts):
# - which pages (commands) Scene_Unownreport#main lists for a Pokédex with
#   various Unown forms registered (genders, shiny, special sprite sets);
# - what each UnownreportButton draws (text and icon positions) and its
#   src_rect when selected or not;
# - Scene_Unownreport#update's button layout (y, visible, selected) for
#   every list length 1-10 and 28 at every cursor index;
# - the background chosen and $scene after BACK.
# The real Player::Pokedex (with Essentials Deluxe's seen_form?/register) is
# used; the window, sprites and bitmaps are stand-ins.
#
#   cd web && ruby tools/ruby-ref/unown_report_reference.rb

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

#===============================================================================
# Stand-ins
#===============================================================================
class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, width = 0, height = 0); set(x, y, width, height); end
  def set(x, y, width, height); @x = x; @y = y; @width = width; @height = height; end
end
class Sprite
  attr_accessor :x, :y, :z, :visible, :bitmap, :src_rect
  def initialize(_viewport = nil); @x = @y = @z = 0; @visible = true; @src_rect = Rect.new; end
  def update; end
  def dispose; end
end
class SpriteWrapper < Sprite; end
class IconSprite < Sprite
  attr_reader :file
  def initialize(x = 0, y = 0, viewport = nil); super(viewport); @x = x; @y = y; end
  def setBitmap(file); @file = file; end
end
class BitmapWrapper
  attr_reader :width, :height, :draws
  def initialize(w, h); @width = w; @height = h; @draws = []; end
  def clear; @draws = []; end
  def blt(*_a); end
  def dispose; end
end
class AnimatedBitmap
  def initialize(_file); end
  def width; 330; end   # Graphics/Pictures/UnownReport/unownreportButton.png
  def height; 104; end
  def bitmap; nil; end
  def dispose; end
end
class Window_CommandPokemon
  attr_accessor :commands, :index, :visible, :active
  def initialize(commands, _width = nil); @commands = commands; @index = 0; @active = true; end
  def update; end
end
class Scene_Map; end
def pbSetSystemFont(_b); end
def pbDrawTextPositions(bitmap, textpos); bitmap.draws.push(["text", textpos.map { |t| t[0, 4] }]); end
def pbDrawImagePositions(bitmap, imagepos); bitmap.draws.push(["image", imagepos]); end
def pbUpdateSpriteHash(sprites); sprites.each_value(&:update); end
def pbDisposeSpriteHash(_s); end
def pbPlayCancelSE; end
def pbResolveBitmap(path); File.exist?(File.join(ROOT, path + ".png")) ? path : nil; end
module Graphics; def self.transition(*_a); end; def self.freeze; end; end
$press_back = false
module Input; def self.trigger?(k); $press_back && k == Input::B; end; end

path = File.join(PLUGINS, "Unown Report", "Unown_Report_Mechanic.rb")
TOPLEVEL_BINDING.eval(File.read(path, encoding: "UTF-8"), path)

$player = Player.new("Gold", :PkMnTRAINER_Male)
$Trainer = $player

def new_dex(regs)
  $player.pokedex.clear
  regs.each { |gender, form, shiny, special| $player.pokedex.register(:UNOWN, gender, form, shiny, true, special) }
end

def run_scene(menu_index = 0)
  scene = Scene_Unownreport.new(menu_index)
  $scene = scene
  $press_back = true
  scene.main
  $press_back = false
  scene
end

def buttons(sprites)
  n = sprites["command_window"].commands.length
  (0...n).map { |i| sprites["button#{i}"] }
end

out = { "dexes" => [], "layouts" => [] }
# [gender, form, shiny, special]
[
  [],
  [[0, 0, 0, 0], [0, 5, 0, 0], [0, 26, 0, 0], [0, 27, 0, 0]],
  [[1, 3, 0, 0], [0, 10, 1, 0], [0, 12, 0, 2], [0, 14, 0, 3], [0, 20, 2, 0], [1, 21, 1, 1], [0, 25, 0, 1]],
  (0...28).map { |f| [0, f, 0, 0] },
].each do |regs|
  new_dex(regs)
  scene = run_scene
  sprites = scene.instance_variable_get(:@sprites)
  out["dexes"].push({
    "registered" => regs,
    "commands" => sprites["command_window"].commands,
    "background" => sprites["background"].file,
    "scene" => $scene.class.name,
    "buttons" => buttons(sprites).map { |b|
      { "x" => b.x, "y" => b.y, "visible" => b.visible, "draws" => b.bitmap.draws,
        "src" => [b.src_rect.x, b.src_rect.y, b.src_rect.width, b.src_rect.height] }
    },
  })
end

# Layout of the buttons for each list length and cursor position.
[1, 2, 3, 4, 5, 6, 7, 10, 28].each do |n|
  new_dex((0...n).map { |f| [0, f, 0, 0] })
  scene = run_scene(n > 2 ? 2 : 0)
  sprites = scene.instance_variable_get(:@sprites)
  first = buttons(sprites).map { |b| [b.y, b.visible, b.selected] }
  rows = (0...n).map do |idx|
    sprites["command_window"].index = idx
    scene.update
    buttons(sprites).map { |b| [b.y, b.visible, b.selected, b.src_rect.y] }
  end
  out["layouts"].push({ "length" => n, "menuIndex" => n > 2 ? 2 : 0, "afterMain" => first, "rows" => rows })
end

path = File.join(__dir__, "..", "..", "src", "plugins", "unownReport", "unownReportReference.json")
File.write(path, JSON.generate(out))
puts "wrote #{File.expand_path(path)}"
