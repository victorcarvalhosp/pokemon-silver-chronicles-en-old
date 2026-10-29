# Converts the RPG Maker XP project data (Data/*.rxdata) into the JSON files
# the web runtime reads from web/data/.
#
#   ruby web/tools/convert/convert.rb            # everything
#   ruby web/tools/convert/convert.rb 51 1 2     # only these maps (+ shared data)
#
# Event command lists are translated into named commands by events.rb; what
# couldn't be translated is listed in web/data/reports/conversion.json.
require "fileutils"
require_relative "rxdata"
require_relative "events"

ROOT = File.expand_path("../../..", __dir__)
DATA_IN = File.join(ROOT, "Data")
DATA_OUT = File.join(ROOT, "web", "data")

module Convert
  module_function

  REPORT = Events::Report.new

  def iv(obj, name)
    Rxdata.ivar(obj, name)
  end

  def audio(a)
    return nil if a.nil?
    name = Rxdata.str(iv(a, :name)).to_s
    { "name" => name, "volume" => iv(a, :volume), "pitch" => iv(a, :pitch) }
  end

  # Table[x, y, z] -> layers[z][y][x]
  def table3(t)
    (0...t.zsize).map do |z|
      (0...t.ysize).map { |y| t.data[(z * t.ysize + y) * t.xsize, t.xsize] }
    end
  end

  def move_route(r)
    {
      "repeat" => iv(r, :repeat),
      "skippable" => iv(r, :skippable),
      "list" => iv(r, :list).map { |c| { "code" => iv(c, :code), "parameters" => params(iv(c, :parameters)) } }
    }
  end

  def params(list)
    list.map do |p|
      case p
      when RPG::AudioFile then { "audio" => audio(p) }
      when RPG::MoveRoute then { "moveRoute" => move_route(p) }
      when Tone then { "tone" => p.values }
      when Color then { "color" => p.values }
      else Rxdata.plain(p)
      end
    end
  end

  def commands(list)
    list.map do |c|
      { "code" => iv(c, :code), "indent" => iv(c, :indent), "parameters" => params(iv(c, :parameters)) }
    end
  end

  def page(pg, where)
    cond = iv(pg, :condition)
    gfx = iv(pg, :graphic)
    {
      "condition" => {
        "switch1" => iv(cond, :switch1_valid) ? iv(cond, :switch1_id) : nil,
        "switch2" => iv(cond, :switch2_valid) ? iv(cond, :switch2_id) : nil,
        "variable" => iv(cond, :variable_valid) ? { "id" => iv(cond, :variable_id), "atLeast" => iv(cond, :variable_value) } : nil,
        "selfSwitch" => iv(cond, :self_switch_valid) ? Rxdata.str(iv(cond, :self_switch_ch)) : nil
      },
      "graphic" => {
        "tileId" => iv(gfx, :tile_id),
        "characterName" => Rxdata.str(iv(gfx, :character_name)).to_s,
        "characterHue" => iv(gfx, :character_hue),
        "direction" => iv(gfx, :direction),
        "pattern" => iv(gfx, :pattern),
        "opacity" => iv(gfx, :opacity),
        "blendType" => iv(gfx, :blend_type)
      },
      "moveType" => iv(pg, :move_type),
      "moveSpeed" => iv(pg, :move_speed),
      "moveFrequency" => iv(pg, :move_frequency),
      "moveRoute" => Events.move_route(move_route(iv(pg, :move_route)), where, REPORT),
      "walkAnime" => iv(pg, :walk_anime),
      "stepAnime" => iv(pg, :step_anime),
      "directionFix" => iv(pg, :direction_fix),
      "through" => iv(pg, :through),
      "alwaysOnTop" => iv(pg, :always_on_top),
      "trigger" => iv(pg, :trigger),
      "list" => Events.translate(commands(iv(pg, :list)), where, REPORT)
    }
  end

  def event(e, map_id)
    {
      "id" => iv(e, :id),
      "name" => Rxdata.str(iv(e, :name)),
      "x" => iv(e, :x),
      "y" => iv(e, :y),
      "pages" => iv(e, :pages).each_with_index.map { |pg, i| page(pg, "Map#{map_id}/EV#{iv(e, :id)}/p#{i}") }
    }
  end

  def map(id, info)
    m = Rxdata.load(File.join(DATA_IN, format("Map%03d.rxdata", id)))
    {
      "id" => id,
      "name" => info ? Rxdata.str(iv(info, :name)) : "",
      "tilesetId" => iv(m, :tileset_id),
      "width" => iv(m, :width),
      "height" => iv(m, :height),
      "autoplayBgm" => iv(m, :autoplay_bgm),
      "bgm" => audio(iv(m, :bgm)),
      "autoplayBgs" => iv(m, :autoplay_bgs),
      "bgs" => audio(iv(m, :bgs)),
      "encounterStep" => iv(m, :encounter_step),
      "layers" => table3(iv(m, :data)),
      "events" => iv(m, :events).keys.sort.map { |k| event(iv(m, :events)[k], id) }
    }
  end

  def map_infos
    infos = Rxdata.load(File.join(DATA_IN, "MapInfos.rxdata"))
    infos.keys.sort.map do |id|
      i = infos[id]
      {
        "id" => id, "name" => Rxdata.str(iv(i, :name)), "parentId" => iv(i, :parent_id),
        "order" => iv(i, :order), "expanded" => iv(i, :expanded),
        "scrollX" => iv(i, :scroll_x), "scrollY" => iv(i, :scroll_y)
      }
    end
  end

  def tilesets
    Rxdata.load(File.join(DATA_IN, "Tilesets.rxdata")).compact.map do |t|
      {
        "id" => iv(t, :id),
        "name" => Rxdata.str(iv(t, :name)),
        "tilesetName" => Rxdata.str(iv(t, :tileset_name)),
        "autotileNames" => iv(t, :autotile_names).map { |n| Rxdata.str(n) },
        "panoramaName" => Rxdata.str(iv(t, :panorama_name)),
        "panoramaHue" => iv(t, :panorama_hue),
        "fog" => {
          "name" => Rxdata.str(iv(t, :fog_name)), "hue" => iv(t, :fog_hue),
          "opacity" => iv(t, :fog_opacity), "blendType" => iv(t, :fog_blend_type),
          "zoom" => iv(t, :fog_zoom), "sx" => iv(t, :fog_sx), "sy" => iv(t, :fog_sy)
        },
        "battlebackName" => Rxdata.str(iv(t, :battleback_name)),
        "passages" => iv(t, :passages).data,
        "priorities" => iv(t, :priorities).data,
        "terrainTags" => iv(t, :terrain_tags).data
      }
    end
  end

  # RPG::Animation: per frame, 16 cells of [pattern, x, y, zoom, angle,
  # mirror, opacity, blend] (Table[cell, field]).
  def animations
    Rxdata.load(File.join(DATA_IN, "Animations.rxdata")).compact.map do |a|
      {
        "id" => iv(a, :id),
        "name" => Rxdata.str(iv(a, :name)),
        "animationName" => Rxdata.str(iv(a, :animation_name)),
        "animationHue" => iv(a, :animation_hue),
        "position" => iv(a, :position),
        "frameMax" => iv(a, :frame_max),
        "frames" => iv(a, :frames).map do |f|
          t = iv(f, :cell_data)
          (0...t.xsize).map { |i| (0...t.ysize).map { |j| t.data[i + j * t.xsize] } }
        end,
        "timings" => iv(a, :timings).map do |t|
          {
            "frame" => iv(t, :frame), "se" => audio(iv(t, :se)),
            "flashScope" => iv(t, :flash_scope), "flashColor" => iv(t, :flash_color).values,
            "flashDuration" => iv(t, :flash_duration), "condition" => iv(t, :condition)
          }
        end
      }
    end
  end

  # Plugins/MQS quest definitions (QuestModule constants), in definition order.
  def quests
    mod = Module.new
    Object.const_set(:QuestModule, mod) unless defined?(QuestModule)
    verbose, $VERBOSE = $VERBOSE, nil # the file redefines a key; Ruby keeps the last one
    load File.join(ROOT, "Plugins", "MQS", "004_Quest_Data.rb")
    $VERBOSE = verbose
    QuestModule.constants.each_with_object({}) do |name, out|
      out[name.to_s] = QuestModule.const_get(name).each_with_object({}) { |(k, v), h| h[k.to_s] = v.is_a?(String) ? Rxdata.str(v) : v }
    end
  end

  def common_events
    Rxdata.load(File.join(DATA_IN, "CommonEvents.rxdata")).compact.map do |c|
      {
        "id" => iv(c, :id), "name" => Rxdata.str(iv(c, :name)),
        "trigger" => iv(c, :trigger), "switchId" => iv(c, :switch_id),
        "list" => Events.translate(commands(iv(c, :list)), "CommonEvent#{iv(c, :id)}", REPORT)
      }
    end.reject { |c| c["name"].to_s.empty? && c["list"].size <= 1 }
  end

  def system
    s = Rxdata.load(File.join(DATA_IN, "System.rxdata"))
    names = ->(list) { list.each_with_index.map { |n, i| [i, Rxdata.str(n)] }.drop(1).reject { |_, n| n.to_s.empty? }.to_h }
    sounds = %i[cursor_se decision_se cancel_se buzzer_se equip_se shop_se save_se load_se
                battle_start_se escape_se actor_collapse_se enemy_collapse_se]
    {
      "startMapId" => iv(s, :start_map_id), "startX" => iv(s, :start_x), "startY" => iv(s, :start_y),
      "windowskinName" => Rxdata.str(iv(s, :windowskin_name)),
      "titleName" => Rxdata.str(iv(s, :title_name)),
      "titleBgm" => audio(iv(s, :title_bgm)),
      "battleBgm" => audio(iv(s, :battle_bgm)),
      "battleEndMe" => audio(iv(s, :battle_end_me)),
      "gameoverMe" => audio(iv(s, :gameover_me)),
      "battleTransition" => Rxdata.str(iv(s, :battle_transition)),
      "sounds" => sounds.to_h { |k| [Rxdata.camel(k.to_s), audio(iv(s, k))] },
      "switches" => names.call(iv(s, :switches)),
      "scriptSwitches" => names.call(iv(s, :switches)).select { |_, n| n.start_with?("s:") }
                             .transform_values { |n| ok, e = RubyExpr.expression(n[2..-1]); ok ? e : { "ruby" => n[2..-1] } },
      "variables" => names.call(iv(s, :variables))
    }
  end

  # Pretty JSON where anything short (and every array of plain numbers, so tile
  # rows read like a grid) stays on one line.
  def pretty(obj, indent = "")
    flat = JSON.generate(obj)
    return flat if flat.length + indent.length <= 100 || (obj.is_a?(Array) && obj.all? { |v| v.is_a?(Numeric) })
    inner = indent + "  "
    case obj
    when Array
      "[\n" + obj.map { |v| inner + pretty(v, inner) }.join(",\n") + "\n" + indent + "]"
    when Hash
      "{\n" + obj.map { |k, v| inner + JSON.generate(k.to_s) + ": " + pretty(v, inner) }.join(",\n") + "\n" + indent + "}"
    else
      flat
    end
  end

  def write(path, obj)
    FileUtils.mkdir_p(File.dirname(path))
    File.write(path, pretty(obj) + "\n")
  end
end

if $PROGRAM_NAME == __FILE__
  only = ARGV.map(&:to_i)
  infos = Rxdata.load(File.join(DATA_IN, "MapInfos.rxdata"))
  Convert.write(File.join(DATA_OUT, "system.json"), Convert.system)
  Convert.write(File.join(DATA_OUT, "tilesets.json"), Convert.tilesets)
  Convert.write(File.join(DATA_OUT, "common-events.json"), Convert.common_events)
  Convert.write(File.join(DATA_OUT, "animations.json"), Convert.animations)
  Convert.write(File.join(DATA_OUT, "quests.json"), Convert.quests)

  ids = Dir[File.join(DATA_IN, "Map[0-9]*.rxdata")].map { |f| File.basename(f)[/\d+/].to_i }.sort
  ids &= only unless only.empty?
  failures = []
  dims = {}
  ids.each do |id|
    data = Convert.map(id, infos[id])
    dims[id] = [data["width"], data["height"]]
    Convert.write(File.join(DATA_OUT, "maps", format("Map%03d.json", id)), data)
  rescue StandardError => e
    failures << "Map#{id}: #{e.class}: #{e.message}"
  end
  if only.empty?
    infos_out = Convert.map_infos.map { |i| i.merge("width" => dims.dig(i["id"], 0) || 0, "height" => dims.dig(i["id"], 1) || 0) }
    Convert.write(File.join(DATA_OUT, "map-infos.json"), infos_out)
  end
  Convert.write(File.join(DATA_OUT, "reports", "conversion.json"), Convert::REPORT.to_h)
  r = Convert::REPORT
  puts "converted #{ids.size - failures.size}/#{ids.size} maps"
  puts "untranslated: #{r.scripts.size} distinct scripts (#{r.scripts.values.sum(&:size)} uses), " \
       "#{r.conditions.size} distinct conditions (#{r.conditions.values.sum(&:size)} uses), " \
       "#{r.unknown_codes.size} unknown command codes"
  puts failures unless failures.empty?
  exit(failures.empty? ? 0 : 1)
end
