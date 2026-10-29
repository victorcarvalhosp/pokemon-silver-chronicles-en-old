# Runs the game's own RPG::Weather (012_Overworld/001_Overworld visuals/
# 001_Overworld_Weather.rb, with GameData::Weather from 012_Weather.rb) and
# Particle_Engine (005_Sprites/010_ParticleEngine.rb) headless, frame by
# frame, and writes web/src/game/weather/weatherReference.json, which
# weather.test.ts compares the TypeScript port against.
#
#   cd web && ruby tools/ruby-ref/weather_reference.rb
#
# Engine stand-ins model what the scripts rely on: Sprite#x/#y store integers
# (mkxp truncates Floats), opacity is clamped to 0..255, Tone components are
# clamped, bitmaps only have the real files' sizes. Graphics.delta_s is a 60 Hz
# tick (the port's). Randomness: the k-th raw number is
# (k * 829348651 + 12345) % 2147483647; Kernel#rand(n) = raw % n (a Float n
# counts as n.to_i.abs; 0 gives raw / 2147483647.0), as in the TS test.

require "json"

ROOT = File.expand_path("../../..", __dir__)
SCRIPTS = File.join(ROOT, "Data", "Scripts")

#===============================================================================
# Engine stand-ins
#===============================================================================
module Graphics
  def self.width; 512; end
  def self.height; 384; end
  def self.frame_rate; 40; end
  def self.delta_s; 1 / 60.0; end
end

class Tone
  attr_reader :red, :green, :blue, :gray
  def initialize(r = 0, g = 0, b = 0, gray = 0); set(r, g, b, gray); end
  def set(r, g = 0, b = 0, gray = 0)
    @red = r.to_f.clamp(-255, 255); @green = g.to_f.clamp(-255, 255)
    @blue = b.to_f.clamp(-255, 255); @gray = gray.to_f.clamp(0, 255)
    self
  end
end

class Color
  attr_reader :red, :green, :blue, :alpha
  def initialize(r = 0, g = 0, b = 0, a = 255); @red = r; @green = g; @blue = b; @alpha = a; end
end

class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, w = 0, h = 0); @x = x; @y = y; @width = w; @height = h; end
end

$flashes = []
$frame = 0

class Viewport
  attr_accessor :z, :rect, :tone
  def initialize(x = 0, y = 0, w = 512, h = 384); @rect = Rect.new(x, y, w, h); @z = 0; @tone = Tone.new; end
  def flash(color, duration); $flashes.push([$frame, [color.red, color.green, color.blue, color.alpha], duration]); end
  def update; end
  def dispose; @disposed = true; end
end

class Bitmap
  attr_reader :width, :height, :name
  def initialize(path)
    @name = File.basename(path)
    file = Dir.glob(File.join(ROOT, path) + ".png").first or raise "Failed to load image '#{path}'"
    @width, @height = File.binread(file, 24)[16, 8].unpack("NN")
  end
  def dispose; @disposed = true; end
  def disposed?; @disposed == true; end
end

class Sprite
  attr_reader :x, :y, :opacity, :bitmap
  attr_accessor :z, :ox, :oy, :visible, :blend_type
  def initialize(viewport = nil); @viewport = viewport; @x = 0; @y = 0; @z = 0; @ox = 0; @oy = 0
    @opacity = 255; @visible = true; @blend_type = 0; @bitmap = nil; end
  def x=(v); @x = v.to_i; end
  def y=(v); @y = v.to_i; end
  def opacity=(v); @opacity = v.to_i.clamp(0, 255); end
  def bitmap=(b); @bitmap = b; end
  def width; @bitmap ? @bitmap.width : 0; end
  def height; @bitmap ? @bitmap.height : 0; end
  def dispose; @disposed = true; end
  def disposed?; @disposed == true; end
end

module RPG
  class Cache
    def self.load_bitmap(folder, name, _hue = 0); Bitmap.new(folder + name); end
  end
end

#===============================================================================
# Deterministic randomness
#===============================================================================
$k = 0
def next_raw
  v = ((($k * 829_348_651) + 12_345) % 2_147_483_647)
  $k += 1
  v
end

module Kernel
  def self.old_rand(max = 0)
    raw = next_raw
    max = max.to_i.abs if max.is_a?(Float)
    return raw / 2_147_483_647.0 if max == 0
    raw % max
  end
end

# Essentials' rand (001_Technical/002_RubyUtilities.rb)
def rand(a = nil, b = nil)
  if a.is_a?(Range)
    lo = a.min
    hi = a.max
    return lo + Kernel.old_rand(hi - lo + 1)
  elsif a.is_a?(Numeric)
    return a + Kernel.old_rand(b - a + 1) if b.is_a?(Numeric)
    return Kernel.old_rand(a)
  end
  Kernel.old_rand
end

#===============================================================================
# GameData::Weather and RPG::Weather from the game's scripts
#===============================================================================
module GameData
  module ClassMethods
    def register(hash)
      obj = new(hash)
      self::DATA[hash[:id]] = obj
      self::DATA[hash[:id_number]] = obj if hash[:id_number]
    end
    def get(other)
      return other if other.is_a?(self)
      self::DATA[other] or raise "Unknown ID #{other}"
    end
  end
  module InstanceMethods; end
end

load File.join(SCRIPTS, "010_Data", "001_Hardcoded data", "012_Weather.rb")
load File.join(SCRIPTS, "012_Overworld", "001_Overworld visuals", "001_Overworld_Weather.rb")

class RPG::Weather
  def snapshot
    s = ->(sp) { sp ? [sp.x, sp.y, sp.opacity, sp.visible ? true : false] : nil }
    {
      "frame" => $frame, "type" => @type.to_s, "max" => @max, "fading" => @fading,
      "tone" => [@viewport.tone.red, @viewport.tone.green, @viewport.tone.blue, @viewport.tone.gray],
      "sprites" => @sprites.map(&s), "newSprites" => @new_sprites.map(&s), "tiles" => @tiles.map(&s),
      "tileX" => @tile_x, "tileY" => @tile_y
    }
  end
end

# A scenario: a list of steps [frames, type, max, duration, dox, doy]; each
# frame Spriteset_Map#update calls fade_in(type, max, duration), sets ox/oy and
# updates. ox/oy move by dox/doy pixels per frame (the camera scrolling).
SCENARIOS = {
  "rain" => [[420, :Rain, 60, 0.05, 0, 0]],
  "rainToStorm" => [[360, :Rain, 60, 0.05, 0, 0], [900, :Storm, 60, 0.05, 0, 0]],
  "snowScrolling" => [[480, :Snow, 60, 1, 2, 1]],
  "blizzardToSandstorm" => [[360, :Blizzard, 60, 1, 0, 0], [420, :Sandstorm, 42, 1, -1, 0]],
  "sandstormToNone" => [[360, :Sandstorm, 60, 1, 0, 0], [300, :None, 0, 1, 0, 0]],
  "sun" => [[400, :Sun, 60, 1, 0, 0]],
  "fog" => [[400, :Fog, 60, 1, 3, 0]],
  "heavyRainNow" => [[200, :HeavyRain, 60, 0, 0, 0], [380, :HeavyRain, 24, 1, 0, 0]],
}

out = {}
SCENARIOS.each do |name, steps|
  $k = 0
  $flashes = []
  $frame = 0
  w = RPG::Weather.new(Viewport.new(0, 0, 512, 384))
  ox = 0
  oy = 0
  snaps = []
  steps.each do |frames, type, max, duration, dox, doy|
    frames.times do
      w.fade_in(type, max, duration)
      ox += dox
      oy += doy
      w.ox = ox
      w.oy = oy
      w.update
      $frame += 1
      snaps.push(w.snapshot) if $frame % 20 == 0
    end
  end
  out[name] = { "steps" => steps.map { |s| [s[0], s[1].to_s, s[2], s[3], s[4], s[5]] }, "snapshots" => snaps,
                "flashes" => $flashes, "rawCalls" => $k }
end

#===============================================================================
# Particle_Engine
#===============================================================================
load File.join(SCRIPTS, "005_Sprites", "013_ScreenPosHelper.rb")

class AnimatedBitmap
  def initialize(path, _hue = 0); @bitmap = Bitmap.new(path); end
  def deanimate; @bitmap; end
end

class Game_Event
  attr_accessor :id, :real_x, :real_y, :screen_x, :screen_y, :list, :pe_refresh
  def initialize(id, list); @id = id; @list = list; @real_x = 0; @real_y = 0; @screen_x = 0; @screen_y = 0; @pe_refresh = true; end
  def tile_id; 0; end
  def character_name; ""; end
  def screen_z(height = 0); @screen_y + 32 - height; end
  def refresh; end
end

# Only the parts of the engine below the Game_Event alias at the end of the file.
src = File.read(File.join(SCRIPTS, "005_Sprites", "010_ParticleEngine.rb"))
eval(src[0...src.index("class Game_Event < Game_Character")], binding, "010_ParticleEngine.rb")

EventCommand = Struct.new(:code, :parameters)
def pbEventCommentInput(*args)
  parameters = []
  list = args[0].list
  elements = args[1]
  trigger = args[2]
  return nil if list.nil?
  list.each do |item|
    next if ![108, 408].include?(item.code)
    next if item.parameters[0] != trigger
    start = list.index(item) + 1
    finish = start + elements
    (start...finish).each { |id| parameters.push(list[id].parameters[0]) if list[id] }
    return parameters
  end
  nil
end

MapStub = Struct.new(:events)
particles = {}
%w[fire smoke teleport spirit explosion aura soot sootsmoke rocket fixteleport smokescreen flare splash starteleport].each do |type|
  $k = 0
  list = [EventCommand.new(108, ["Particle Engine Type"]), EventCommand.new(408, [type]), EventCommand.new(0, [])]
  ev = Game_Event.new(3, list)
  ev.real_x = 10 * 128; ev.real_y = 8 * 128; ev.screen_x = 256; ev.screen_y = 224
  engine = Particle_Engine.new(Viewport.new(0, 0, 512, 384), MapStub.new({ 3 => ev }))
  snaps = []
  120.times do |f|
    if f >= 60 && f < 90   # the event walks left half a tile per frame... and the screen follows a bit
      ev.real_x -= 4
      ev.screen_x -= 1
    end
    engine.update
    eff = engine.instance_variable_get(:@effect)[3]
    if (f + 1) % 10 == 0
      parts = eff.instance_variable_get(:@particles)
      snaps.push(parts.map { |p| [p.x, p.y, p.opacity] })
    end
  end
  particles[type] = { "snapshots" => snaps, "rawCalls" => $k }
end
out["particles"] = particles

File.write(File.join(ROOT, "web", "src", "game", "weather", "weatherReference.json"), JSON.generate(out))
puts "wrote weatherReference.json (#{out.keys.length - 1} weather scenarios, #{particles.length} particle effects)"
