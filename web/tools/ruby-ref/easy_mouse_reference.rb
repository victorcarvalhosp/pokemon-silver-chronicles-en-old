# Runs Plugins/Easy Mouse System/Script.rb (and 004_Input.rb's
# Mouse.getMousePos) headless over scripted mkxp-z input, and writes
# web/src/plugins/easyMouse/easyMouseReference.json, which
# web/src/plugins/easyMouse/mouse.test.ts replays against Mouse.ts.
#
#   cd web && ruby tools/ruby-ref/easy_mouse_reference.rb
#
# Each step sets the mouse position / in-window flag and the held time of the
# left button (microseconds, Input.time?), runs Input.update (which the plugin
# aliases to call Mouse.update first), then records the plugin's queries on a
# few objects.

require "json"

ROOT = File.expand_path("../../..", __dir__)

module Graphics
  def self.frame_rate; 40; end
end

class Rect
  attr_accessor :x, :y, :width, :height
  def initialize(x = 0, y = 0, w = 0, h = 0); @x = x; @y = y; @width = w; @height = h; end
end

class Bitmap
  attr_reader :width, :height
  def initialize(w, h, opaque = nil); @width = w; @height = h; @opaque = opaque; end
  Pixel = Struct.new(:alpha)
  def get_pixel(x, y)
    a = (@opaque.nil? || @opaque.call(x, y)) ? 255 : 0
    a = 0 if x < 0 || y < 0 || x >= @width || y >= @height
    Pixel.new(a)
  end
end

class Viewport
  attr_accessor :rect
  def initialize(x, y, w, h); @rect = Rect.new(x, y, w, h); end
end

class Sprite
  attr_accessor :x, :y, :ox, :oy, :zoom_x, :zoom_y, :bitmap, :src_rect, :viewport
  def initialize(viewport = nil)
    @viewport = viewport; @x = 0; @y = 0; @ox = 0; @oy = 0; @zoom_x = 1; @zoom_y = 1
    @src_rect = Rect.new
  end
  def bitmap=(b); @bitmap = b; @src_rect = Rect.new(0, 0, b.width, b.height); end
end

module System
  class << self; attr_accessor :mouse_in_window; end
end

module Input
  MOUSELEFT = 38
  MOUSEMIDDLE = 39
  MOUSERIGHT = 40
  class << self
    attr_accessor :mouse_x, :mouse_y, :held
    def update; end
    def press?(b); b == MOUSELEFT && @held.to_i > 0; end
    def time?(b); b == MOUSELEFT ? @held.to_i : 0; end
  end
end

code = File.read(File.join(ROOT, "Data/Scripts/001_Technical/004_Input.rb"), encoding: "UTF-8")
code = code[code.index("module Mouse")..]
eval(code, TOPLEVEL_BINDING, "004_Input.rb")
eval(File.read(File.join(ROOT, "Plugins/Easy Mouse System/Script.rb"), encoding: "UTF-8"), TOPLEVEL_BINDING, "Script.rb")

vp = Viewport.new(16, 8, 200, 100)
plain = Sprite.new
plain.bitmap = Bitmap.new(40, 30)
plain.x = 50; plain.y = 40
zoomed = Sprite.new(vp)
zoomed.bitmap = Bitmap.new(20, 20, ->(x, y) { (x + y).even? })
zoomed.x = 30; zoomed.y = 20; zoomed.ox = 10; zoomed.oy = 10; zoomed.zoom_x = 2; zoomed.zoom_y = 2
cropped = Sprite.new
cropped.bitmap = Bitmap.new(64, 64)
cropped.src_rect = Rect.new(0, 0, 32, 16)
cropped.x = 200; cropped.y = 200
area = Rect.new(100, 100, 50, 50)
OBJECTS = { "plain" => plain, "zoomed" => zoomed, "cropped" => cropped, "area" => area, "viewport" => vp }

# [mouse_x, mouse_y, in_window, held_us]
STEPS = [
  [60, 50, true, 0], [60, 50, true, 0], [61, 50, true, 30_000], [61, 50, true, 60_000], [61, 50, true, 0],
  [61, 50, true, 0], [40, 26, true, 0], [41, 26, true, 10], [41, 26, true, 0], [41, 27, true, 0],
  [210, 205, true, 0], [210, 205, true, 400_000], [210, 205, true, 600_000], [210, 205, true, 0],
  [125, 125, true, 0], [125, 125, false, 0], [16, 8, true, 0], [216, 108, true, 0], [217, 108, true, 0],
  [0, 0, true, 700_000], [0, 0, true, 0],
].freeze

out = STEPS.map do |mx, my, inwin, held|
  Input.mouse_x = mx; Input.mouse_y = my; System.mouse_in_window = inwin; Input.held = held
  Input.update
  rec = { "x" => Mouse.x, "y" => Mouse.y }
  rec["params"] = OBJECTS.transform_values { |o| Mouse.object_params(o) }
  rec["over"] = OBJECTS.transform_values { |o| Mouse.over?(o) }
  rec["overPixel"] = { "zoomed" => Mouse.over_pixel?(zoomed), "plain" => Mouse.over_pixel?(plain) }
  rec["overRect"] = Mouse.over?(plain, Rect.new(5, 5, 10, 10))
  rec["press"] = Mouse.press?(plain)
  rec["holdSym"] = Mouse.hold?(:left)
  rec["hold"] = Mouse.hold?(cropped)
  rec["clickPlain"] = !!Mouse.click?(plain)
  rec["clickAny"] = !!Mouse.click?
  rec["static"] = Mouse.static?
  rec
end

path = File.expand_path("../../src/plugins/easyMouse/easyMouseReference.json", __dir__)
File.write(path, JSON.pretty_generate({ "steps" => STEPS, "out" => out }) + "\n")
puts "wrote #{out.size} steps to #{path}"
