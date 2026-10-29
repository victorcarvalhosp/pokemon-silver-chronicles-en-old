# Translates RPG Maker XP event command lists (numeric codes + indentation)
# into nested, named JSON commands. Mirrors what Essentials' Interpreter does
# at runtime where that is static (joining Show Text lines, merging
# consecutive Show Choices), and converts durations (1/20 s units) to seconds.
require_relative "ruby_expr"

module Events
  # Essentials v20.1 reads every event duration as param * frame_rate / 20,
  # i.e. the editor's "frames" are 1/20 s.
  FPS = 20.0
  COMPARE = ["==", ">=", "<=", ">", "<", "!="].freeze
  VAR_OPS = %w[set add sub mul div mod].freeze
  BRANCH_MARKERS = [402, 403, 404, 411, 412, 413, 601, 602, 603, 604, 605].freeze
  MOVE_NAMES = {
    1 => "down", 2 => "left", 3 => "right", 4 => "up",
    5 => "lowerLeft", 6 => "lowerRight", 7 => "upperLeft", 8 => "upperRight",
    9 => "random", 10 => "towardPlayer", 11 => "awayFromPlayer", 12 => "forward", 13 => "backward",
    16 => "turnDown", 17 => "turnLeft", 18 => "turnRight", 19 => "turnUp",
    20 => "turnRight90", 21 => "turnLeft90", 22 => "turn180", 23 => "turnRightOrLeft90",
    24 => "turnRandom", 25 => "turnTowardPlayer", 26 => "turnAwayFromPlayer",
    31 => "walkAnimeOn", 32 => "walkAnimeOff", 33 => "stepAnimeOn", 34 => "stepAnimeOff",
    35 => "directionFixOn", 36 => "directionFixOff", 37 => "throughOn", 38 => "throughOff",
    39 => "alwaysOnTopOn", 40 => "alwaysOnTopOff"
  }.freeze

  # Collects what couldn't be translated, across all files.
  class Report
    attr_reader :scripts, :conditions, :unknown_codes

    def initialize
      @scripts = Hash.new { |h, k| h[k] = [] }
      @conditions = Hash.new { |h, k| h[k] = [] }
      @unknown_codes = Hash.new { |h, k| h[k] = [] }
    end

    def to_h
      sort = ->(h) { h.sort_by { |k, v| [-v.size, k.to_s] }.map { |k, v| { "code" => k, "count" => v.size, "where" => v.first(5) } } }
      {
        "untranslatedScripts" => sort.call(@scripts),
        "untranslatedConditions" => sort.call(@conditions),
        "unknownCommandCodes" => sort.call(@unknown_codes)
      }
    end
  end

  module_function

  def seconds(frames)
    (frames.to_f / FPS).round(4)
  end

  def p(c)
    c["parameters"]
  end

  # Translates a list from the converter (hashes with code/indent/parameters).
  def translate(list, where, report)
    Translator.new(list, where, report).run
  end

  def move_route(route, where, report)
    {
      "repeat" => route["repeat"],
      "skippable" => route["skippable"],
      "list" => route["list"].reject { |m| m["code"] == 0 }.map { |m| move_command(m, where, report) }
    }
  end

  def move_command(m, where, report)
    a = m["parameters"]
    case m["code"]
    when 14 then { "move" => "jump", "x" => a[0], "y" => a[1] }
    when 15 then { "move" => "wait", "seconds" => seconds(a[0]) }
    when 27 then { "move" => "switchOn", "id" => a[0] }
    when 28 then { "move" => "switchOff", "id" => a[0] }
    when 29 then { "move" => "speed", "value" => a[0] }
    when 30 then { "move" => "frequency", "value" => a[0] }
    when 41 then { "move" => "graphic", "characterName" => a[0], "characterHue" => a[1], "direction" => a[2], "pattern" => a[3] }
    when 42 then { "move" => "opacity", "value" => a[0] }
    when 43 then { "move" => "blendType", "value" => a[0] }
    when 44 then { "move" => "playSe", "audio" => a[0]["audio"] }
    when 45 then { "move" => "script" }.merge(script_body(a[0], where, report))
    else
      name = MOVE_NAMES[m["code"]]
      unless name
        report.unknown_codes["move #{m['code']}"] << where
        return { "move" => "raw", "code" => m["code"], "parameters" => a }
      end
      { "move" => name }
    end
  end

  # A Script command body: translated statements, or the original Ruby.
  def script_body(code, where, report)
    return { "do" => [] } if code.strip.empty?
    stmts = RubyExpr.statements(code)
    return { "do" => stmts } if stmts
    report.scripts[code] << where
    { "ruby" => code }
  end

  def condition_script(code, where, report)
    ok, expr = RubyExpr.expression(code)
    return { "script" => expr } if ok
    report.conditions[code] << where
    { "ruby" => code }
  end

  class Translator
    def initialize(list, where, report)
      @list = list
      @where = where
      @report = report
      @i = 0
    end

    def run
      seq(0)
    end

    private

    def cur
      @list[@i]
    end

    def code
      cur && cur["code"]
    end

    def p(c = cur)
      c["parameters"]
    end

    # Reads commands at this indent until the block's terminating code-0
    # (consumed) or a branch marker belonging to the parent (not consumed).
    def seq(indent)
      out = []
      loop do
        c = cur
        break if c.nil? || c["indent"] < indent
        if c["code"].zero? && c["indent"] == indent
          @i += 1
          break
        end
        break if c["indent"] == indent && BRANCH_MARKERS.include?(c["code"])
        cmd = command(c)
        out.concat(cmd.is_a?(Array) ? cmd : [cmd]) if cmd
      end
      out
    end

    def command(c)
      indent = c["indent"]
      a = p(c)
      @i += 1
      case c["code"]
      when 101 then show_text(a[0])
      when 102 then show_choices(a, indent)
      when 103 then { "cmd" => "inputNumber", "variable" => a[0], "digits" => a[1] }
      when 104 then { "cmd" => "textOptions", "position" => a[0], "frame" => a[1] }
      when 105 then { "cmd" => "buttonInput", "variable" => a[0] }
      when 106 then { "cmd" => "wait", "seconds" => Events.seconds(a[0]) }
      when 108 then comment(a[0])
      when 111 then conditional(a, indent)
      when 112
        body = seq(indent + 1)
        @i += 1 if code == 413
        { "cmd" => "loop", "body" => body }
      when 113 then { "cmd" => "breakLoop" }
      when 115 then { "cmd" => "exitEvent" }
      when 116 then { "cmd" => "eraseEvent" }
      when 117 then { "cmd" => "commonEvent", "id" => a[0] }
      when 118 then { "cmd" => "label", "name" => a[0] }
      when 119 then { "cmd" => "jump", "label" => a[0] }
      when 121 then { "cmd" => "switches", "from" => a[0], "to" => a[1], "value" => a[2].zero? }
      when 122 then control_variables(a)
      when 123 then { "cmd" => "selfSwitch", "ch" => a[0], "value" => a[1].zero? }
      when 124 then a[0].zero? ? { "cmd" => "timerStart", "seconds" => a[1] } : { "cmd" => "timerStop" }
      when 125 then { "cmd" => "gold", "op" => a[0].zero? ? "add" : "sub", "value" => operand(a[1], a[2]) }
      when 131 then { "cmd" => "windowskin", "name" => a[0] }
      when 132 then { "cmd" => "battleBgm", "audio" => a[0]["audio"] }
      when 133 then { "cmd" => "battleEndMe", "audio" => a[0]["audio"] }
      when 134 then { "cmd" => "saveAccess", "enabled" => a[0] == 1 }
      when 135 then { "cmd" => "menuAccess", "enabled" => a[0] == 1 }
      when 136 then { "cmd" => "encounters", "enabled" => a[0] == 1 }
      when 201 then transfer(a)
      when 202 then set_event_location(a)
      when 203 then { "cmd" => "scrollMap", "direction" => a[0], "distance" => a[1], "speed" => a[2] }
      when 204 then { "cmd" => "mapSettings", "type" => %w[panorama fog battleback][a[0]], "parameters" => a[1..-1] }
      when 205 then { "cmd" => "fogTone", "tone" => a[0]["tone"], "seconds" => Events.seconds(a[1]) }
      when 206 then { "cmd" => "fogOpacity", "opacity" => a[0], "seconds" => Events.seconds(a[1]) }
      when 207 then { "cmd" => "showAnimation", "character" => a[0], "animation" => a[1] }
      when 208 then { "cmd" => "transparent", "value" => a[0].zero? }
      when 209 then move_route_command(a)
      when 210 then { "cmd" => "waitForMoveCompletion" }
      when 221 then { "cmd" => "prepareTransition" }
      when 222 then { "cmd" => "executeTransition", "name" => a[0] }
      when 223 then { "cmd" => "screenTone", "tone" => a[0]["tone"], "seconds" => Events.seconds(a[1]) }
      when 224 then { "cmd" => "screenFlash", "color" => a[0]["color"], "seconds" => Events.seconds(a[1]) }
      when 225 then { "cmd" => "screenShake", "power" => a[0], "speed" => a[1], "seconds" => Events.seconds(a[2]) }
      when 231 then picture("showPicture", a, a[1], 2)
      when 232 then picture("movePicture", a, nil, 2).merge("seconds" => Events.seconds(a[1]))
      when 233 then { "cmd" => "rotatePicture", "id" => a[0], "speed" => a[1] }
      when 234 then { "cmd" => "pictureTone", "id" => a[0], "tone" => a[1]["tone"], "seconds" => Events.seconds(a[2]) }
      when 235 then { "cmd" => "erasePicture", "id" => a[0] }
      when 236 then { "cmd" => "weather", "type" => a[0], "power" => a[1], "seconds" => Events.seconds(a[2]) }
      when 241 then { "cmd" => "playBgm", "audio" => a[0]["audio"] }
      when 242 then { "cmd" => "fadeOutBgm", "seconds" => a[0] }
      when 245 then { "cmd" => "playBgs", "audio" => a[0]["audio"] }
      when 246 then { "cmd" => "fadeOutBgs", "seconds" => a[0] }
      when 247 then { "cmd" => "memorizeBgmBgs" }
      when 248 then { "cmd" => "restoreBgmBgs" }
      when 249 then { "cmd" => "playMe", "audio" => a[0]["audio"] }
      when 250 then { "cmd" => "playSe", "audio" => a[0]["audio"] }
      when 251 then { "cmd" => "stopSe" }
      when 314 then { "cmd" => "recoverAll" }
      when 351 then { "cmd" => "callMenu" }
      when 352 then { "cmd" => "callSave" }
      when 353 then { "cmd" => "gameOver" }
      when 354 then { "cmd" => "returnToTitle" }
      when 355 then script(a[0])
      when 401, 408, 509, 655 then nil # continuation lines consumed by their owner
      else
        @report.unknown_codes[c["code"].to_s] << @where
        { "cmd" => "raw", "code" => c["code"], "parameters" => a }
      end
    end

    # 101 + 401 lines, joined exactly as Interpreter#command_101 does.
    def show_text(first)
      message = first.to_s
      while code == 401
        text = p[0].to_s
        message += " " if text != "" && message[-1] != " "
        message += text
        @i += 1
      end
      { "cmd" => "text", "text" => message }
    end

    def comment(first)
      lines = [first]
      while code == 408
        lines << p[0]
        @i += 1
      end
      { "cmd" => "comment", "lines" => lines }
    end

    def script(first)
      ruby = first.to_s
      while code == 655
        ruby += "\n" + p[0].to_s
        @i += 1
      end
      body = Events.script_body(ruby, @where, @report)
      body["do"] || { "cmd" => "script", "ruby" => body["ruby"] }
    end

    # Show Choices, merging directly following Show Choices commands into one
    # list the way Interpreter#add_more_choices does.
    def show_choices(a, indent)
      choices = a[0].dup
      cancel_type = a[1] # 0 disallow, 1-4 that choice, 5 branch
      branches = Array.new(choices.size) { [] }
      cancel_branch = nil
      cancel_index = cancel_type == 5 ? :branch : (cancel_type.zero? ? nil : cancel_type - 1)
      offset = 0
      loop do
        loop do
          case code
          when 402
            n = p[0]
            @i += 1
            branches[offset + n] = seq(indent + 1)
          when 403
            @i += 1
            cancel_branch = seq(indent + 1)
          when 404
            @i += 1
            break
          else
            break
          end
        end
        break unless code == 102 && cur["indent"] == indent
        more = p
        @i += 1
        offset = choices.size
        choices += more[0]
        branches += Array.new(more[0].size) { [] }
        if more[1] == 5
          cancel_index = :branch
        elsif more[1] > 0
          cancel_index = offset + more[1] - 1
        end
      end
      cmd = { "cmd" => "choices", "choices" => choices, "branches" => branches }
      if cancel_index == :branch
        cmd["cancel"] = "branch"
        cmd["cancelBranch"] = cancel_branch || []
      elsif cancel_index
        cmd["cancel"] = cancel_index
      else
        cmd["cancel"] = "disallow"
      end
      cmd
    end

    def conditional(a, indent)
      cond = condition(a)
      then_ = seq(indent + 1)
      else_ = nil
      if code == 411 && cur["indent"] == indent
        @i += 1
        else_ = seq(indent + 1)
      end
      @i += 1 if code == 412 && cur["indent"] == indent
      cmd = { "cmd" => "if", "cond" => cond, "then" => then_ }
      cmd["else"] = else_ if else_
      cmd
    end

    def condition(a)
      case a[0]
      when 0 then { "switch" => a[1], "value" => a[2].zero? }
      when 1
        value = a[2].zero? ? a[3] : { "variable" => a[3] }
        { "variable" => a[1], "op" => COMPARE[a[4]], "value" => value }
      when 2 then { "selfSwitch" => a[1], "value" => a[2].zero? }
      when 3 then { "timer" => a[2].zero? ? ">=" : "<=", "seconds" => a[1] }
      when 6 then { "character" => a[1], "direction" => a[2] }
      when 7 then { "gold" => a[2].zero? ? ">=" : "<=", "value" => a[1] }
      when 11 then { "button" => a[1] }
      when 12 then Events.condition_script(a[1], @where, @report)
      else
        @report.unknown_codes["111/#{a[0]}"] << @where
        { "raw" => a }
      end
    end

    def operand(type, value)
      type.zero? ? value : { "variable" => value }
    end

    def control_variables(a)
      from, to, op, type, x, y = a
      value = case type
              when 0 then x
              when 1 then { "variable" => x }
              when 2 then { "random" => [x, y] }
              when 3 then { "itemCount" => x }
              when 6 then { "character" => x, "property" => %w[x y direction screenX screenY terrainTag][y] }
              when 7 then { "other" => %w[mapId partySize gold steps playTime timer saveCount][x] }
              else
                @report.unknown_codes["122/#{type}"] << @where
                { "raw" => [type, x, y] }
              end
      { "cmd" => "variables", "from" => from, "to" => to, "op" => VAR_OPS[op], "value" => value }
    end

    def transfer(a)
      mode, map, x, y, dir, fade = a
      target = mode.zero? ? { "map" => map, "x" => x, "y" => y } : { "mapVariable" => map, "xVariable" => x, "yVariable" => y }
      { "cmd" => "transfer" }.merge(target).merge("direction" => dir, "fade" => fade.zero?)
    end

    def set_event_location(a)
      ev, mode, x, y, dir = a
      base = { "cmd" => "setEventLocation", "event" => ev, "direction" => dir }
      case mode
      when 0 then base.merge("x" => x, "y" => y)
      when 1 then base.merge("xVariable" => x, "yVariable" => y)
      else base.merge("swapWith" => x)
      end
    end

    def picture(name, a, filename, origin_index)
      num = a[0]
      origin, mode, x, y, zx, zy, opacity, blend = a[origin_index..origin_index + 7]
      pos = mode.zero? ? { "x" => x, "y" => y } : { "xVariable" => x, "yVariable" => y }
      cmd = { "cmd" => name, "id" => num }
      cmd["name"] = filename if filename
      cmd.merge("origin" => origin.zero? ? "topLeft" : "center").merge(pos)
         .merge("zoomX" => zx, "zoomY" => zy, "opacity" => opacity, "blendType" => blend)
    end

    def move_route_command(a)
      { "cmd" => "moveRoute", "character" => a[0], "route" => Events.move_route(a[1]["moveRoute"], @where, @report) }
    end
  end
end
