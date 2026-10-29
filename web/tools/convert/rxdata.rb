# Loads RPG Maker XP .rxdata files with Ruby's own Marshal, using minimal
# stand-ins for the RGSS classes so no RPG Maker runtime is needed.
require "json"

class Table
  attr_reader :xsize, :ysize, :zsize, :data

  def self._load(bytes)
    _dim, xsize, ysize, zsize, size = bytes.unpack("l5")
    obj = allocate
    obj.instance_variable_set(:@xsize, xsize)
    obj.instance_variable_set(:@ysize, ysize)
    obj.instance_variable_set(:@zsize, zsize)
    obj.instance_variable_set(:@data, bytes[20, size * 2].unpack("s<*"))
    obj
  end
end

class Color
  attr_reader :values
  def self._load(bytes)
    obj = allocate
    obj.instance_variable_set(:@values, bytes.unpack("E4"))
    obj
  end
end

class Tone < Color; end

module RPG
  class Map; end
  class MapInfo; end
  class Event; class Page; class Condition; end; class Graphic; end; end; end
  class EventCommand; end
  class MoveRoute; end
  class MoveCommand; end
  class AudioFile; end
  class Tileset; end
  class CommonEvent; end
  class System; class Words; end; class TestBattler; end; end
  class Animation; class Frame; end; class Timing; end; end
end

# Essentials' battle animations (Data/PkmnAnimations.rxdata): PBAnimations and
# PBAnimation are Arrays with instance variables, PBAnimTiming a plain object.
class PBAnimations < Array; end
class PBAnimation < Array; end
class PBAnimTiming; end

module Rxdata
  module_function

  def load(path)
    File.open(path, "rb") { |f| Marshal.load(f) }
  end

  # Ruby 3 files tag strings as UTF-8; anything else is raw bytes that we
  # still read as UTF-8 (the editor wrote UTF-8 even without the tag).
  def str(value)
    return nil if value.nil?
    s = value.dup.force_encoding("UTF-8")
    s.valid_encoding? ? s : s.encode("UTF-8", "Windows-1252", invalid: :replace, undef: :replace)
  end

  def ivar(obj, name)
    obj.instance_variable_get("@#{name}")
  end

  def camel(name)
    name.to_s.sub(/^@/, "").gsub(/_([a-z0-9])/) { $1.upcase }
  end

  # Generic converter used for anything without a dedicated shape.
  def plain(value)
    case value
    when String then str(value)
    when Symbol then value.to_s
    when Integer, Float, TrueClass, FalseClass, NilClass then value
    when Array then value.map { |v| plain(v) }
    when Hash then value.each_with_object({}) { |(k, v), h| h[plain(k).to_s] = plain(v) }
    when Color then value.values
    when Table then { "xsize" => value.xsize, "ysize" => value.ysize, "zsize" => value.zsize, "data" => value.data }
    else
      value.instance_variables.each_with_object({}) { |iv, h| h[camel(iv)] = plain(value.instance_variable_get(iv)) }
    end
  end
end
