# Runs the logic of Plugins/ExperimentWithScene (Math Functions.rb,
# MyUI Module.rb, MyUI_Scene.rb, Scene Camera.rb) headless, on fixed
# scenarios, and writes
# web/src/plugins/experimentWithScene/experimentSceneReference.json, which
# web/src/plugins/experimentWithScene/experimentScene.test.ts replays against
# the TypeScript port:
# - Vector: construction, update/finished? over many frames, set/setXY, the
#   x=/y=/angle=/scale= setters, lock, spoof (arrays, splatted arguments and
#   the TypeError a Vector argument raises), reset;
# - calculateCurve and singleDecInt?;
# - MyUI: add_vector (:CAMERA and other keys), get_vector before and after
#   :PLAYER is added, next_vector, random_vector, parse/get;
# - Battle::Scene#alignSprites / getRealVector (both raise NoMethodError) and
#   applySpriteProperties;
# - MyUI::Scene#pbStartScene with stand-in sprites: the camera vector after
#   every animateScene, and the TypeError it ends with.
#
#   cd web && ruby tools/ruby-ref/experiment_scene_reference.rb
#
# Kernel#rand (through Essentials' Kernel.oldRand) is replaced by a queue of
# raw numbers (rand(n) = raw % n), as in amie_reference.rb.

require "json"
require_relative "essentials"

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

def eval_game_code(code, path, line = 1)
  TOPLEVEL_BINDING.eval(code, path, line)
end

picture_ex = File.join(SCRIPTS, "005_Sprites", "011_PictureEx.rb")
eval_game_code(File.read(picture_ex, encoding: "UTF-8")[/^def getCubicPoint2\(.*?^end\r?$/m], picture_ex)

#===============================================================================
# Stand-ins for the engine objects the scene touches
#===============================================================================
module Console; def self.echo_li(*_a); end; end
class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, width = 0, height = 0); @x = x; @y = y; @width = width; @height = height; end
end
class Sprite
  attr_accessor :x, :y, :z, :ox, :oy, :zoom_x, :zoom_y, :opacity, :visible, :angle, :tone, :color, :bitmap, :src_rect
  def initialize(_viewport = nil)
    @x = @y = @z = @ox = @oy = @angle = 0
    @zoom_x = @zoom_y = 1.0
    @opacity = 255
    @visible = true
    @src_rect = Rect.new
  end
  def update; end
  def dispose; end
end
class IconSprite < Sprite
  def initialize(x = 0, y = 0, viewport = nil); super(viewport); @x = x; @y = y; end
  def setBitmap(_file); end
end
def pbBitmap(_name); Bitmap.new; end
module GameData
  class TrainerType
    def self.player_front_sprite_filename(_tr); "Graphics/Trainers/PkMnTRAINER_Male"; end
  end
end
$player = Struct.new(:trainer_type).new(:PkMnTRAINER_Male)

%w[Math\ Functions.rb MyUI\ Module.rb MyUI_Scene.rb Scene\ Camera.rb].each do |f|
  path = File.join(PLUGINS, "ExperimentWithScene", f)
  eval_game_code(File.read(path, encoding: "UTF-8").sub("﻿", ""), path)
end

#===============================================================================
# Scripted randomness
#===============================================================================
$rolls = []
$gen = Random.new(11)
class << Kernel
  def oldRand(arg = nil)
    raise "out of scripted rolls" if $rolls.empty?
    raise "unexpected rand(#{arg.inspect})" unless arg.is_a?(Integer) && arg > 0
    $rolls.shift % arg
  end
end
def rolls!(n)
  $rolls = Array.new(n) { $gen.rand(1 << 30) }
  $rolls.dup
end

def error_of
  yield
  nil
rescue StandardError => e
  { "class" => e.class.name, "message" => e.message.lines.first.chomp.sub(/ for #<.*>\z/, "") }
end

def vec_state(v)
  { "get" => v.get, "x2" => v.x2, "y2" => v.y2, "inc" => v.inc, "finished" => v.finished?, "locked" => v.locked?,
    "set" => v.instance_variable_get(:@set).dup, "constant" => v.instance_variable_get(:@constant) }
end

out = {}

#===============================================================================
# Vector
#===============================================================================
vectors = []
[
  { "args" => [], "target" => [10, -20, 45, 100, 2, 0.5], "inc" => 0.2, "frames" => 40 },
  { "args" => [102, 408, 32, 342, 1, 1], "target" => [132, 408, 24, 302, 1, 1], "inc" => 0.05, "frames" => 120 },
  { "args" => [-18, 332, 32, 292], "target" => [[238, 332, 32, 292, 1, 1]], "inc" => 0.1, "frames" => 60 },
  { "args" => [0.5, 1.25, 359, 3], "target" => [0.5, 1.25, 359, 3, 1, 1], "inc" => 0.3, "frames" => 5 },
  # No set: @set starts as [x, y, scale, angle, ...] while update reads [2] as the angle.
  { "args" => [0, 0, 30, 200], "target" => nil, "inc" => 0.2, "frames" => 6 },
].each do |sc|
  rolls = rolls!(1)
  v = Vector.new(*sc["args"])
  initial = vec_state(v)
  target = sc["target"]
  v.set(*target) if target
  v.inc = sc["inc"]
  frames = []
  sc["frames"].times { v.update; frames.push(vec_state(v)) }
  vectors.push(sc.merge("rolls" => rolls, "initial" => initial, "frames" => frames))
end
out["vectors"] = vectors

# Setters, setXY, lock, force
rolls = rolls!(1)
v = Vector.new(5, 6, 30, 50, 1, 1)
setters = [vec_state(v)]
v.x = 12; setters.push(vec_state(v))
v.y = -3.5; setters.push(vec_state(v))
v.angle = 90; setters.push(vec_state(v))
v.scale = 7.25; setters.push(vec_state(v))
v.setXY(100, 200); setters.push(vec_state(v))
v.lock; setters.push(vec_state(v))
v.lock; setters.push(vec_state(v))
v.force
v.set(1, 2, 3, 4, 5, 6); setters.push(vec_state(v))
v.update; setters.push(vec_state(v))
out["setters"] = { "rolls" => rolls, "states" => setters }

# spoof
v = Vector.new
out["spoof"] = [
  [[1, 2, 0.5, 10, 1, 1]], [0, 0, Math::PI / 3, 100], [-50, 20, 32, 292, 1], [238, 332, 32, 292, 1, 1],
].map { |args| { "args" => args, "ret" => v.spoof(*args) } }
out["spoofVectorError"] = error_of { v.spoof(v) }

#===============================================================================
# calculateCurve, singleDecInt?
#===============================================================================
out["curves"] = [
  [[0, 0, 50, 100, 100, 0], 10], [[10, 300, 256, 0, 500, 300], 7], [[-3.5, 2, 4, 8.25, 1, -1], 1], [[0, 0, 1, 1, 2, 2], 3],
].map { |pts, frames| { "points" => pts, "frames" => frames, "ret" => calculateCurve(*pts, frames) } }
out["singleDecInt"] = [0, 1, 7, 0.5, 1.1, 0.3, 2.25, -2.0, -0.7, 12.5, 0.1 + 0.2].map { |n| [n, singleDecInt?(n)] }

#===============================================================================
# MyUI
#===============================================================================
myui = {}
myui["cameraMotion"] = MyUI.get(:vectors)[:CAMERA_MOTION]
myui["getMainBefore"] = MyUI.get_vector(:MAIN)
myui["getBattlerBefore"] = MyUI.get_vector(:BATTLER, true)
myui["getCameraMotion"] = MyUI.get_vector(:CAMERA_MOTION)
myui["randomBefore"] = MyUI.random_vector(nil, nil)
myui["randomBeforeLast3"] = MyUI.random_vector(nil, 3)
camera = [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]
MyUI.add_vector(:CAMERA, *camera)
myui["camera"] = MyUI.get_vector(:CAMERA)
myui["cameraArgsAfter"] = camera
MyUI.add_vector(:ENEMY, 1, 2, 3)
myui["enemy"] = MyUI.get_vector(:ENEMY)
MyUI.next_vector([1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], 7, [9, 9, 9, 9, 9, 9, 9])
myui["randomNext"] = MyUI.random_vector(nil, 0)
myui["parse"] = [:vectors, "nextVectors", :tviewport, :smAnim, 5, nil].map { |k| [k.inspect, MyUI.parse(k).inspect] }
myui["getTviewport"] = MyUI.get(:tviewport).inspect
myui["getSmAnim"] = MyUI.get(:smAnim).inspect
out["myui"] = myui

#===============================================================================
# Battle::Scene helpers
#===============================================================================
scene = Battle::Scene.allocate
s1 = Sprite.new; s1.x = 3; s1.y = 4; s1.z = 5; s1.zoom_x = 1.5; s1.zoom_y = 0.5; s1.opacity = 128; s1.angle = 30
s1.tone = "tone"; s1.color = "color"; s1.visible = false
s2 = Sprite.new
scene.applySpriteProperties(s1, s2)
out["applySpriteProperties"] = %i[x y z zoom_x zoom_y opacity angle tone color visible].map { |m| s2.send(m) }
sp = Sprite.new; sp.src_rect = Rect.new(0, 0, 81, 40)
target = Sprite.new
out["alignSprites"] = { "error" => error_of { scene.alignSprites(sp, target) }, "ox" => sp.ox, "oy" => sp.oy }
scene.instance_variable_set(:@battle, Battle.allocate)
out["getRealVector"] = error_of { scene.getRealVector(0, true) }

#===============================================================================
# MyUI::Scene#pbStartScene
#===============================================================================
module TraceAnimate
  def animateScene(*args, &block)
    super
    $trace.push({ "vector" => vec_state(@vector), "playerX" => @sprites["player"].x, "orgPos" => @orgPos.dup })
  end
end
MyUI::Scene.prepend(TraceAnimate)
$trace = []
rolls = rolls!(80)
s = MyUI::Scene.new
err = error_of { s.pbStartScene }
used = 80 - $rolls.length
out["startScene"] = {
  "rolls" => rolls.first(used), "trace" => $trace, "error" => err,
  "vector" => vec_state(s.vector), "playerVector" => MyUI.get_vector(:PLAYER),
  "player" => { "x" => s.sprites["player"].x, "y" => s.sprites["player"].y, "z" => s.sprites["player"].z,
                "opacity" => s.sprites["player"].opacity, "srcWidth" => s.sprites["player"].src_rect.width },
  "bgZoom" => [s.sprites["bg"].zoom_x, s.sprites["bg"].zoom_y],
}
# After :PLAYER exists, get_vector returns it for every key.
out["myuiAfter"] = {
  "getMain" => MyUI.get_vector(:MAIN), "getEnemy" => MyUI.get_vector(:ENEMY),
  "random" => MyUI.random_vector(nil, nil),
}
# Vector#reset reads get_vector(:MAIN)
rolls = rolls!(2)
v = Vector.new(1, 2, 3, 4)
v.inc = 0.7
v.reset
out["reset"] = { "rolls" => rolls, "state" => vec_state(v) }
# moveEntireScene with an exception index; setVector ignores its arguments
s.moveEntireScene(5, -7, true, false, 2)
out["moveEntireScene"] = { "vector" => vec_state(s.vector), "orgPos" => s.instance_variable_get(:@orgPos) }
s.moveEntireScene(1, 1, false)
out["moveEntireSceneUnlocked"] = { "vector" => vec_state(s.vector), "orgPos" => s.instance_variable_get(:@orgPos) }
s.setVector(1, 2, 3, 4, 5)
out["setVector"] = vec_state(s.vector)
out["spoofScene"] = error_of { s.spoof([1, 2, 3, 4, 5, 1]) }
out["disposed"] = error_of { s.disposed? }

path = File.join(__dir__, "..", "..", "src", "plugins", "experimentWithScene", "experimentSceneReference.json")
File.write(path, JSON.generate(out))
puts "wrote #{File.expand_path(path)}"
