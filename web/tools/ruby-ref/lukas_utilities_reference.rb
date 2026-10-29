# Runs Plugins/Luka's Scripting Utilities/script.rb headless over the real
# Essentials scripts and writes
# web/src/plugins/lukasUtilities/lukasUtilitiesReference.json, which
# web/src/plugins/lukasUtilities/lukasUtilities.test.ts replays against the
# TypeScript port: Numeric#delta, the String/Array/Hash helpers, Color
# (initialize, to_hex/to_rgb/to_dec/to_i, from_i, parse, darken), Tone#all,
# getPolygonPoints, randCircleCord (scripted rand), Env (char_esc/char_dsc,
# guid_to_hex, path, interpret), CallbackWrapper, the Sprite anchor/zoom
# helpers, the blit layouts of blur_sprite / skew / pbSelBitmap /
# Bitmap.smartWindow, the pixel functions (bmp_circle, swap_colors, mask!,
# avg_color, colorize) on a pixel-array Bitmap stand-in, and update traces of
# ScrollingSprite / SpriteSheet / SelectorSprite / TrailingSprite /
# RainbowSprite at Graphics.frame_rate 60 (the port's).
#
#   cd web && ruby tools/ruby-ref/lukas_utilities_reference.rb
#
# The stand-ins follow mkxp-z: Color/Tone components are clamped floats,
# Rect fields and Sprite#opacity are integers (truncated; opacity clamped),
# get_pixel outside a bitmap is Color(0, 0, 0, 0), Bitmap.new/blt truncate.

require "json"
require "tmpdir"
require_relative "essentials"

$frame_rate = 40
module Graphics
  def self.frame_rate; $frame_rate; end
end

# Real colour storage before Essentials (and then the plugin) alias Color#initialize.
class Color
  def initialize(r = 0, g = 0, b = 0, a = 255)
    @r = cl(r); @g = cl(g); @b = cl(b); @a = cl(a)
  end
  def cl(v); [[v.to_f, 0.0].max, 255.0].min; end
  def red; @r; end
  def green; @g; end
  def blue; @b; end
  def alpha; @a; end
  def red=(v); @r = cl(v); end
  def green=(v); @g = cl(v); end
  def blue=(v); @b = cl(v); end
  def alpha=(v); @a = cl(v); end
  def set(c); @r, @g, @b, @a = c.red, c.green, c.blue, c.alpha; self; end
  def ==(o); o.is_a?(Color) && [red, green, blue, alpha] == [o.red, o.green, o.blue, o.alpha]; end
  def to_a; [red, green, blue, alpha]; end
end

failures = Essentials.load!
warn failures.join("\n") unless failures.empty?

class Tone
  def initialize(r = 0, g = 0, b = 0, gr = 0); @r = r.to_f; @g = g.to_f; @b = b.to_f; @gr = gr.to_f; end
  def cl(v); [[v.to_f, -255.0].max, 255.0].min; end
  def red; @r; end
  def green; @g; end
  def blue; @b; end
  def red=(v); @r = cl(v); end
  def green=(v); @g = cl(v); end
  def blue=(v); @b = cl(v); end
  def to_a; [@r, @g, @b, @gr]; end
end

class Rect
  attr_reader :x, :y, :width, :height
  def initialize(x = 0, y = 0, w = 0, h = 0); set(x, y, w, h); end
  def set(x, y, w, h); @x = x.to_i; @y = y.to_i; @width = w.to_i; @height = h.to_i; self; end
  def x=(v); @x = v.to_i; end
  def y=(v); @y = v.to_i; end
  def width=(v); @width = v.to_i; end
  def height=(v); @height = v.to_i; end
  def to_a; [x, y, width, height]; end
end

$ops = []
class Font; attr_accessor :name, :size, :bold; end
# essentials.rb's stand-ins answer every missing method with nil; mkxp-z's raise.
class Bitmap; remove_method :method_missing; end
class Sprite; remove_method :method_missing; end

class Bitmap
  attr_reader :width, :height
  def initialize(w = 32, h = 32)
    w, h = 48, 48 if w.is_a?(String) # Bitmap.new(path): a 48x48 skin
    @width = w.to_i; @height = h.to_i
    @px = Array.new(@width * @height) { [0, 0, 0, 0] }
    $ops << ["new", @width, @height]
  end
  def font; @font ||= Font.new; end
  def rect; Rect.new(0, 0, @width, @height); end
  def get_pixel(x, y)
    x = x.to_i; y = y.to_i
    return Color.new(0, 0, 0, 0) if x < 0 || y < 0 || x >= @width || y >= @height
    Color.new(*@px[y * @width + x])
  end
  def set_pixel(x, y, c)
    x = x.to_i; y = y.to_i
    return if x < 0 || y < 0 || x >= @width || y >= @height
    @px[y * @width + x] = [c.red.to_i, c.green.to_i, c.blue.to_i, c.alpha.to_i]
  end
  def fill_rect(*a)
    a = [a[0].x, a[0].y, a[0].width, a[0].height, a[1]] if a[0].is_a?(Rect)
    x, y, w, h, c = a
    (y.to_i...(y.to_i + h.to_i)).each { |yy| (x.to_i...(x.to_i + w.to_i)).each { |xx| set_pixel(xx, yy, c) } }
  end
  def blt(x, y, src, rect, opacity = 255); $ops << ["blt", x.to_i, y.to_i, rect.to_a, opacity]; end
  def stretch_blt(dest, src, rect, opacity = 255); $ops << ["stretch_blt", dest.to_a, rect.to_a]; end
  def hue_change(h); $ops << ["hue", h]; end
  def clear; end
  def dispose; end
  def clone; b = super; b.instance_variable_set(:@px, @px.map(&:dup)); b; end
  def raw_data; @px.flatten.pack("C*"); end
  def raw_data=(s); @px = s.unpack("C*").each_slice(4).to_a; end
  def pixels; @px.map(&:dup); end
  def load(px); @px = px.map(&:dup); self; end
end

class Viewport
  attr_accessor :rect
  def initialize(x = 0, y = 0, w = 512, h = 384); @rect = Rect.new(x, y, w, h); end
end

class Sprite
  attr_accessor :x, :y, :z, :ox, :oy, :zoom_x, :zoom_y, :visible, :viewport, :src_rect, :color
  attr_reader :bitmap, :opacity
  def initialize(viewport = nil)
    @viewport = viewport; @x = @y = @z = @ox = @oy = 0; @zoom_x = @zoom_y = 1.0
    @opacity = 255; @visible = true; @src_rect = Rect.new; @color = Color.new(0, 0, 0, 0)
  end
  def bitmap=(b); @src_rect = Rect.new(0, 0, b.width, b.height) if b && b != @bitmap; @bitmap = b; end
  def opacity=(v); @opacity = [[v.to_i, 0].max, 255].min; end
  def update; end
  def dispose; end
end

$cache = { "Graphics/Pictures/sel" => [16, 12], "Graphics/Pictures/sheet" => [64, 16] }
module RPG
  class Cache
    def self.load_bitmap(dir, file)
      size = $cache[dir + file] or raise Errno::ENOENT, dir + file
      Bitmap.new(*size)
    end
  end
end

# FileTests.rb isn't in the harness's script set: ErrorLogger.new only needs this.
module RTP; def self.getSaveFileName(f); f; end; end unless defined?(RTP)
def echoln(*_a); end unless defined?(echoln)
def safeExists?(f); File.exist?(f); end unless defined?(safeExists?)

path = File.join(PLUGINS, "Luka's Scripting Utilities", "script.rb")
TOPLEVEL_BINDING.eval(File.read(path, encoding: "UTF-8"), path)

$logs = []
class ErrorLogger
  def log_msg(msg, type = "INFO", _file = nil); $logs << [type.upcase, msg]; end
end

$rolls = []
$gen = Random.new(5)
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
  { "class" => e.class.name, "message" => e.message.lines.first.to_s.chomp.sub(/ for #<.*>\z/, "") }
end
def result_of
  r = nil
  e = error_of { r = yield }
  e ? { "error" => e } : { "value" => r }
end
def col(c); c.is_a?(Color) ? c.to_a : c; end

out = {}

# Numeric#delta
out["delta"] = [40, 60].flat_map do |fr|
  $frame_rate = fr
  [-2.5, -1, 0, 1, 3, 7.3, 24, 0.035, 32, 4].flat_map do |v|
    [[:add, true], [:add, false], [:sub, true], [:sub, false]].map do |t, r|
      { "fr" => fr, "v" => v, "type" => t.to_s, "round" => r, "out" => v.delta(t, r) }
    end
  end
end
$frame_rate = 40
out["round"] = [2.567.round(2), 5.round, 2.5.round, -2.5.round, 1234.round(-2)]

# String
alphabet = "0123456789.-"
strs = ["", "-", ".", "-.", "1.2.3", "-0", "12", "-5", "5.", ".5", "-.5", "1-2", "a1", " 1", "1\n", "TRUE", "1e5"]
200.times { strs << Array.new($gen.rand(1..6)) { alphabet[$gen.rand(alphabet.length)] }.join }
out["strings"] = strs.map { |s| { "s" => s, "numeric" => s.is_numeric?, "to_i" => s.to_i, "to_f" => s.to_f, "neg0" => (s.to_f == 0 && 1.0 / s.to_f < 0) } }
out["bytes"] = "héllo~".bytes

# Array
out["swap_at"] = [[[1, 2, 3], 0, 2], [[1, 2, 3], -1, 0], [[1, 2], 0, 4], [[[1], [2]], 0, 1], [[1, 2], -3, 0]].map do |a, i, j|
  arr = a.map { |v| v.is_a?(Array) ? v.dup : v }
  e = error_of { arr.swap_at(i, j) }
  { "arr" => a, "i" => i, "j" => j, "out" => arr, "error" => e }
end
out["to_last"] = [[[1, 2, 1, 3], 1], [[1, 2], 5], [[], 0]].map { |a, v| { "arr" => a, "v" => v, "out" => a.dup.to_last(v) } }
out["string_include"] = [[["ab", 1, "z"], "xxabyy"], [["q"], "abc"], [["a"], 5], [[], "a"], [[""], "a"]].map { |a, v| { "arr" => a, "v" => v, "out" => a.string_include?(v) } }

# Hash
h = { "a" => 1, "b" => nil, "c" => false, "d" => 0 }
out["hash"] = {
  "has_key" => [[["a"], h.has_key?("a")], [["a", "b"], h.has_key?("a", "b")], [["a", "z"], h.has_key?("a", "z")], [[], h.has_key?]],
  "try_key" => [[["a"], h.try_key?("a")], [["a", "d"], h.try_key?("a", "d")], [["b"], h.try_key?("b")], [["c"], h.try_key?("c")], [["z"], h.try_key?("z")]],
  "get_key" => [["a", h.get_key("a")], ["z", h.get_key("z")], ["b", h.get_key("b")]],
}
merges = [
  [{ "a" => 1 }, { "b" => 2 }],
  [{ "a" => { "x" => 1 } }, { "a" => { "y" => 2 } }],
  [{ "a" => { "x" => 1 }, "b" => 3 }, { "b" => 5, "a" => { "z" => 1 } }],
  [{ "a" => { "x" => 1 } }, { "a" => 7 }],
  [{ "a" => 1 }, 5],
  [{ "a" => 1, "b" => { "q" => 1 } }, { "a" => { "n" => 1 }, "b" => { "r" => 2 } }],
  [{ "a" => 1, "b" => { "q" => 1 } }, { "a" => 3, "b" => { "r" => 2 } }],
]
out["deep_merge"] = merges.map do |a, b|
  bang = Marshal.load(Marshal.dump(a))
  bang.deep_merge!(b)
  { "a" => a, "b" => b, "bang" => bang, "merge" => result_of { Marshal.load(Marshal.dump(a)).deep_merge(b) } }
end

# Color
color_args = [[255, 0, 128], [1.5, 300, -4], [10, 20, 30, 40], ["#FF8000"], ["ff8000"], ["#F"], [""], ["255,0,0"], [0xFF00], [0x00FF00],
              [0xFFFFFF], [255], [0x123456], [1.5], [nil], [], [1, 2]]
out["color_new"] = color_args.map { |a| { "args" => a, "out" => result_of { col(Color.new(*a)) } } }
cs = [Color.new(255, 128, 0), Color.new(254.7, 3.2, 16, 100), Color.new(0, 0, 0, 0), Color.new(12, 34, 56, 255)]
out["color_methods"] = cs.map do |c|
  { "c" => c.to_a, "hex" => c.to_hex, "dec" => c.to_dec, "i" => c.to_i, "darken" => col(c.darken), "darken5" => col(c.darken(0.5)) }
end
out["to_rgb"] = ["FF8000", "#FF0000", 0xFF00, "f", 0x123456].map { |v| { "v" => v, "out" => result_of { Color.new(0, 0, 0).to_rgb(v) } } }
out["from_i"] = error_of { Color.from_i(5) }
out["parse"] = ["#00FF00", "255,0,0", "abc", 0x123456, 1.5, nil, :sym].map { |v| { "v" => v.is_a?(Symbol) ? nil : v, "sym" => v.is_a?(Symbol), "out" => result_of { col(Color.parse(v)) } } }
out["parse_color"] = col(Color.parse(Color.new(1, 2, 3)))
out["named"] = %i[red green blue black white yellow orange purple brown teal magenta].map { |n| [n.to_s, col(Color.send(n))] }

# Tone
t = Tone.new(10, 20, 31)
all1 = t.all
t.all = -40
out["tone"] = { "all" => all1, "after" => t.to_a, "all2" => t.all }

# getPolygonPoints / randCircleCord
out["polygon"] = [[3], [5, 30, 60], [7, 50, 20, 15], [4, 10, 10, 45, 0, 0], [6, 25.5, 12, 30, 100, 50]].map { |a| { "args" => a, "out" => getPolygonPoints(*a) } }
out["circle"] = [[5], [10], [37], [10, 3], [8, 0]].map do |a|
  rolls = rolls!(2)
  { "args" => a, "rolls" => rolls, "out" => randCircleCord(*a) }
end

# Env
esc = ["C:\\Users\\a/b", "x:y*z?\"<w>|", "&bs;plain", "nothing"]
out["char"] = esc.map { |s| e = Env.char_esc(s.dup); { "s" => s, "esc" => e, "dsc" => Env.char_dsc(e.dup), "dsc_raw" => Env.char_dsc(s.dup) } }
out["guid"] = Env::COMMON_PATHS.map { |k, v| [k, Env.guid_to_hex(v)] }
out["env_path"] = [error_of { Env.path("DESKTOP") }, error_of { Env.path("NOPE") }]
out["env_directory"] = Env.directory.include?("\\") || !Env.directory.include?("/")
files = {
  "basic" => "[A]\nx = 1\n[B]\ny = 2,3.5,true\n",
  "crlf" => "[Main]\r\nName = Foo # comment\r\nList = 1, 2,,-,.\r\nFlag = False\r\n\r\nSub\r\nXY = 3,4\r\n[Other]\r\nXYZ=1,2,3\r\n",
  "tabs" => "[S]\n\tkey\t=\tval\n\t\n[T]\n#only comment\nbad line\nk==v\n=5\n",
  "repeat" => "[A]\nx = 1\n[B]\nx = 1\n[A]\nz = 9\n",
  "sections" => "head = 1\n[1]\na = 1\n[2]\nb = 2\n[]\nc = 3\n",
  "nested" => "[[a]]\nq = 1\n[b]\nw = [2]\n",
  "noindex" => "x = 1\n",
  "xyerr" => "[P]\nXY = 1\n",
  "xyzerr" => "[P]\nSub\nXYZ = 1,2\n",
  "empty" => "",
  "lone" => "[A]",
  "cr" => "[A]\rx = 1\r[B]\ny = 2",
}
Dir.mktmpdir do |dir|
  out["interpret"] = files.map do |name, text|
    f = File.join(dir, "#{name}.txt")
    File.binwrite(f, text)
    r = result_of { Env.interpret(f) }
    r["error"]["message"] = r["error"]["message"].gsub(f, "FILE") if r["error"]
    # full multi-line error messages (lengthError)
    begin; Env.interpret(f); rescue StandardError => e; r["full"] = e.message.gsub(f, "FILE"); end
    { "name" => name, "text" => text, "out" => r }
  end
  out["interpret_missing"] = Env.interpret(File.join(dir, "nope.txt"))
end
out["format_error"] = Env.formatError("f.txt", "Sec", "__pk__", "Float", "K", "v")
out["format_error_sub"] = Env.formatError("f.txt", "Sec", "Sub", "Integer", "K", "v")

# CallbackWrapper
cw = CallbackWrapper.new
out["callback_unset"] = error_of { cw.execute(proc { 1 }, 1, 2) }
cw.set({ :a => 5, "b" => "x" })
out["callback"] = cw.execute(proc { |me| [@a, @b, self.length, me.length, self[0]] }, 7, 8, 9)

# Sprite anchors / zoom
vp = Viewport.new(0, 0, 301, 217)
out["anchors"] = [[31, 17, nil], [30, 16, vp], [1, 1, vp], [0, 0, nil]].map do |w, h, v|
  s = Sprite.new(v); s.src_rect = Rect.new(0, 0, w, h)
  r = { "w" => w, "h" => h, "vp" => !v.nil?, "center" => s.center, "bottom" => s.bottom }
  s.center!; r["center!"] = [s.ox, s.oy, s.x, s.y]
  s.center!(true); r["center!snap"] = [s.ox, s.oy, s.x, s.y]
  s.bottom!; r["bottom!"] = [s.ox, s.oy]
  s.zoom = 1.75; r["zoom"] = [s.zoom, s.zoom_x, s.zoom_y]
  r
end
s = Sprite.new; s.default!
out["default"] = %w[speed toggle end_x end_y ex ey zx zy param direction].map { |k| s.send(k) }
s.bitmap = Bitmap.new(10, 4); out["x_mid"] = [s.x_mid]
s.ox = 3; s.instance_variable_set(:@bitmap, nil); out["x_mid"] << s.x_mid

# Blit layouts
def ops_of; $ops = []; yield; $ops; end
out["blur"] = [[2, 35], [1, 50], [3, 10]].map do |bv, op|
  s = Sprite.new; s.bitmap = Bitmap.new(20, 10)
  { "args" => [bv, op], "ops" => ops_of { s.blur_sprite(bv, op) } }
end
out["skew"] = [[10, 6, 45], [10, 6, 90], [7, 5, 120], [12, 4, 30.5]].map do |w, h, a|
  s = Sprite.new; s.bitmap = Bitmap.new(w, h)
  ops = ops_of { s.skew(a) }
  { "args" => [w, h, a], "ops" => ops, "mid" => s.x_mid, "again" => s.skew(a) }
end
out["sel"] = [[30, 20], [8, 8]].map do |w, h|
  { "rect" => [w, h], "ops" => ops_of { pbSelBitmap("Graphics/Pictures/sel", Rect.new(0, 0, w, h)) } }
end
out["smart"] = [[Rect.new(16, 16, 16, 16), Rect.new(0, 0, 100, 60)], [Rect.new(8, 4, 30, 36), Rect.new(0, 0, 50, 50)]].map do |sl, r|
  { "slice" => sl.to_a, "rect" => r.to_a, "ops" => ops_of { Bitmap.smartWindow(sl, r) } }
end
$logs = []
b = pbBitmap("Graphics/Pictures/sel")
out["pbBitmap"] = { "size" => [b.width, b.height], "stored" => b.storedPath }
b = pbBitmap("Graphics/Pictures/missing")
out["pbBitmap_missing"] = { "size" => [b.width, b.height], "logs" => $logs }

# Pixel functions
def bmp_from(w, h, px); Bitmap.new(w, h).load(px); end
pal = [[255, 0, 0, 255], [0, 0, 255, 255], [10, 200, 30, 128], [0, 0, 0, 0], [255, 255, 255, 255], [90, 60, 30, 255]]
def grid(w, h, pal); Array.new(w * h) { |i| pal[(i * 7 + i / 3) % pal.length] }; end
circles = [[9, 9, []], [10, 8, [Color.new(1, 2, 3), 3, 4.5, 3]], [10, 8, [Color.new(9, 9, 9), 3, 4.5, 3, true]], [7, 7, [Color.new(5, 5, 5), 2.5, 3, 3]]]
out["circle_px"] = circles.map do |w, h, args|
  bmp = Bitmap.new(w, h); bmp.bmp_circle(*args)
  { "w" => w, "h" => h, "args" => args.map { |a| col(a) }, "px" => bmp.pixels }
end
src = grid(4, 3, pal)
b1 = bmp_from(4, 3, src); b1.swap_colors({ "#FF0000" => "#00FF00", "#0000FF" => "#FFFFFF", "#FFFFFF" => "#000000" })
mapb = bmp_from(2, 2, [[255, 0, 0, 255], [90, 60, 30, 255], [1, 2, 3, 255], [4, 5, 6, 255]])
b2 = bmp_from(4, 3, src); b2.swap_colors(mapb)
out["swap"] = { "src" => src, "hash" => b1.pixels, "bitmap" => b2.pixels, "map" => mapb.pixels,
                "badkey" => error_of { bmp_from(4, 3, src).swap_colors({ "255,0,0" => "#000000" }) } }
msrc = grid(6, 6, pal)
mmask = Array.new(16) { |i| [0, 0, 0, (i * 37) % 256] }
out["mask"] = [[1, -1], [0, 0], [3, 2]].map do |xp, yp|
  r = bmp_from(6, 6, msrc).mask!(bmp_from(4, 4, mmask), xp, yp)
  { "push" => [xp, yp], "px" => r.pixels }
end
out["mask_src"] = msrc
out["mask_mask"] = mmask
out["mask_bad"] = bmp_from(6, 6, msrc).mask!(5)
asrc = grid(5, 4, pal)
out["avg"] = [2, 1, 3].map do |f|
  s = Sprite.new; s.bitmap = bmp_from(5, 4, asrc)
  { "freq" => f, "out" => col(s.avg_color(f)) }
end
out["avg_src"] = asrc
s = Sprite.new; s.bitmap = Bitmap.new(1, 1)
out["avg_zero"] = error_of { s.avg_color(2) }
csrc = grid(3, 2, pal)
out["colorize"] = [[Color.new(200, 100, 50), 128], [Color.new(200, 100, 50), 255], [Color.new(0, 255, 10), 30]].map do |c, amt|
  s = Sprite.new; s.bitmap = bmp_from(3, 2, csrc); s.colorize(c, amt)
  { "color" => col(c), "amt" => amt, "px" => s.bitmap.pixels }
end
out["colorize_src"] = csrc
s = Sprite.new; s.bitmap = Bitmap.new(2, 2)
out["errors"] = { "outline" => error_of { s.create_outline(Color.new(1, 1, 1)) }, "mask" => error_of { s.mask(Bitmap.new(1, 1)) },
                  "outline_nil" => Sprite.new.create_outline(Color.new(1, 1, 1)), "mask_nil" => Sprite.new.mask(nil) }

# Sprite classes at frame_rate 60
$frame_rate = 60
def scroll_trace(speed, direction, vertical, pulse, n)
  s = ScrollingSprite.new
  s.speed = speed if speed
  s.direction = direction if direction
  s.setBitmap(Bitmap.new(40, 30), vertical, pulse)
  frames = [[s.src_rect.to_a, s.opacity]]
  n.times { s.update; frames << [s.src_rect.to_a, s.opacity] }
  { "speed" => speed, "direction" => direction, "vertical" => vertical, "pulse" => pulse, "frames" => frames }
end
out["scrolling"] = [scroll_trace(nil, nil, false, false, 6), scroll_trace(7, -1, true, true, 12), scroll_trace(0.25, 1, false, true, 14),
                    scroll_trace(1, -1, false, false, 10), scroll_trace(100, 1, false, true, 8)]
out["sheet"] = [[4, 1, false], [3, 2, true], [5, 0.5, false]].map do |frames, speed, vertical|
  s = SpriteSheet.new(nil, frames)
  s.speed = speed
  s.setBitmap(Bitmap.new(60, 45), vertical)
  tr = [s.src_rect.to_a]
  12.times { s.update; tr << s.src_rect.to_a }
  { "frames" => frames, "speed" => speed, "vertical" => vertical, "trace" => tr }
end
anchor = Sprite.new; anchor.bitmap = Bitmap.new(33, 21); anchor.x = 100; anchor.y = 50; anchor.ox = 5; anchor.oy = 3; anchor.opacity = 120
sel = SelectorSprite.new(nil, 4)
sel.filename = "Graphics/Pictures/sel"
sel.target(anchor)
seltr = [[sel.src_rect.to_a, sel.ox, sel.oy, sel.bitmap.width, sel.bitmap.height]]
10.times { sel.update; seltr << [sel.src_rect.to_a, sel.x, sel.y, sel.opacity, sel.visible] }
out["selector"] = seltr
tr = TrailingSprite.new(nil, Bitmap.new(8, 8))
tr.keyFrame = 2; tr.x = 10; tr.y = 20; tr.color = Color.new(5, 6, 7, 8)
trace = [tr.disposed?]
9.times do |i|
  tr.x += 3
  tr.update
  sp = tr.instance_variable_get(:@sprites)
  trace << sp.map { |k, v| [k, v.x, v.y, v.opacity, v.zoom_x.round(9), v.ox, col(v.color)] }
end
out["trailing"] = trace
rb = RainbowSprite.new
$ops = []
rb.setBitmap(Bitmap.new(4, 4), 400)
hues = []
5.times { $ops = []; rb.update; hues << $ops.select { |o| o[0] == "hue" }.map { |o| o[1] } }
rb.setBitmap(Bitmap.new(4, 4), 1)
3.times { $ops = []; rb.update; hues << $ops.select { |o| o[0] == "hue" }.map { |o| o[1] } }
out["rainbow"] = hues

path = File.join(__dir__, "..", "..", "src", "plugins", "lukasUtilities", "lukasUtilitiesReference.json")
File.write(path, JSON.pretty_generate(out).then { |s| s.length > 400_000 ? JSON.generate(out) : s })
puts "wrote #{File.expand_path(path)}"
