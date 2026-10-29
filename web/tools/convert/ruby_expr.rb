# Turns the Ruby snippets inside events (Script commands, script conditions,
# move-route scripts) into JSON the web runtime evaluates, using Ruby's own
# parser (Ripper). Only plain calls, assignments, literals and operators are
# converted; anything else stays Ruby and is listed in the conversion report.
#
# Expression JSON:
#   literal                               2, "text", true, null, [1, 2]
#   { "call": "$player.pokedex.register", "args": ["AIPOM"] }
#   { "call": "species", "on": <expr> }   method on a computed receiver
#   { "call": "$game_switches[]", "args": [12] }   indexing
#   { "op": ">=", "left": <expr>, "right": <expr> }
#   { "op": "!", "value": <expr> }
# Symbols become plain strings (:AIPOM -> "AIPOM").
#
# Statement JSON (Script command):
#   { "cmd": "call", "fn": "pbCallBub", "args": [2, {"call": "@event_id"}] }
#   { "cmd": "assign", "target": "$player.has_pokegear", "args": [], "op": "=", "value": true }
require "ripper"

module RubyExpr
  class Unsupported < StandardError; end

  BINARY_OPS = %w[== != < > <= >= + - * / % && || and or].freeze

  module_function

  # Returns an array of statement hashes, or nil when the code can't be
  # represented (it then stays as raw Ruby).
  def statements(code)
    @source_lines = code.lines
    sexp = Ripper.sexp(code)
    return nil unless sexp && sexp[0] == :program
    stmts = sexp[1].reject { |s| s[0] == :void_stmt }
    return nil if stmts.empty?
    stmts.map { |s| statement(s) }
  rescue Unsupported
    nil
  end

  # Returns [true, expression] or [false, nil] when unsupported (an
  # expression may legitimately be nil).
  def expression(code)
    @source_lines = code.lines
    sexp = Ripper.sexp(code)
    return [false, nil] unless sexp && sexp[0] == :program
    stmts = sexp[1].reject { |s| s[0] == :void_stmt }
    return [false, nil] unless stmts.size == 1
    [true, expr(stmts[0])]
  rescue Unsupported
    [false, nil]
  end

  def statement(s)
    case s[0]
    when :assign
      target, args = assign_target(s[1])
      { "cmd" => "assign", "target" => target, "args" => args, "op" => "=", "value" => expr(s[2]) }
    when :opassign
      target, args = assign_target(s[1])
      { "cmd" => "assign", "target" => target, "args" => args, "op" => s[2][1], "value" => expr(s[3]) }
    else
      e = expr(s)
      raise Unsupported unless e.is_a?(Hash) && e["call"] && !e["on"]
      { "cmd" => "call", "fn" => e["call"], "args" => e["args"] || [] }
    end
  end

  def assign_target(t)
    case t[0]
    when :var_field
      kind, name = t[1][0], t[1][1]
      # Local variables would need state across statements; keep those as Ruby.
      raise Unsupported unless %i[@gvar @ivar].include?(kind)
      [name, []]
    when :field
      [path(t[1]) + "." + t[3][1], []]
    when :aref_field
      [path(t[1]) + "[]", args(t[2])]
    else
      raise Unsupported
    end
  end

  # Dotted name for a receiver made only of names (no arguments).
  def path(node)
    case node[0]
    when :var_ref, :vcall
      kind, name = node[1][0], node[1][1]
      raise Unsupported if kind == :@kw && name != "self"
      name
    when :const_path_ref
      path(node[1]) + "::" + node[2][1]
    when :top_const_ref
      node[1][1]
    when :call
      raise Unsupported if node[3] == :call
      path(node[1]) + "." + node[3][1]
    else
      raise Unsupported
    end
  end

  def call_name_and_receiver(recv, name)
    [path(recv) + "." + name, nil]
  rescue Unsupported
    [name, expr(recv)]
  end

  def make_call(name, recv_node, arg_list)
    if recv_node
      full, on = call_name_and_receiver(recv_node, name)
    else
      full, on = name, nil
    end
    h = { "call" => full }
    h["on"] = on if on
    h["args"] = arg_list unless arg_list.nil? || arg_list.empty?
    h
  end

  def args(node)
    return [] if node.nil?
    case node[0]
    when :arg_paren then args(node[1])
    when :args_add_block
      raise Unsupported if node[2] && node[2] != false # &block
      node[1].map { |a| expr(a) }
    when :args_new then []
    else
      raise Unsupported if node[0].is_a?(Symbol)
      node.map { |a| expr(a) } # bare list
    end
  end

  def string(node)
    parts = node[1][1..-1] || []
    raise Unsupported unless parts.all? { |p| p[0] == :@tstring_content }
    return "" if parts.empty?
    raw = parts.map { |p| p[1] }.join
    line, col = parts[0][2]
    quote = (@source_lines[line - 1] || "")[col - 1]
    if quote == "'"
      raw.gsub(/\\([\\'])/, '\1')
    else
      ("\"" + raw.gsub('"', '\"') + "\"").undump
    end
  rescue RuntimeError
    raise Unsupported
  end

  def expr(node)
    case node[0]
    when :@int then Integer(node[1])
    when :@float then Float(node[1])
    when :string_literal then string(node)
    when :symbol_literal
      node[1][1][1]
    when :dyna_symbol
      string([:string_literal, node[1]])
    when :array
      return [] if node[1].nil?
      node[1].is_a?(Array) && node[1][0] == :args_add_block ? args(node[1]) : node[1].map { |a| expr(a) }
    when :var_ref
      kind, name = node[1][0], node[1][1]
      if kind == :@kw
        return true if name == "true"
        return false if name == "false"
        return nil if name == "nil"
        raise Unsupported unless name == "self"
      end
      { "call" => name }
    when :vcall
      { "call" => node[1][1] }
    when :const_path_ref
      { "call" => path(node) }
    when :fcall
      { "call" => node[1][1] }
    when :call
      raise Unsupported if node[3] == :call # .() syntax
      make_call(node[3][1], node[1], nil)
    when :method_add_arg
      callee = node[1]
      a = args(node[2])
      case callee[0]
      when :fcall then make_call(callee[1][1], nil, a)
      when :call then make_call(callee[3][1], callee[1], a)
      else raise Unsupported
      end
    when :command
      make_call(node[1][1], nil, args(node[2]))
    when :command_call
      make_call(node[3][1], node[1], args(node[4]))
    when :aref
      recv = node[1]
      a = args(node[2])
      begin
        { "call" => path(recv) + "[]", "args" => a }
      rescue Unsupported
        { "call" => "[]", "on" => expr(recv), "args" => a }
      end
    when :binary
      op = node[2].to_s
      raise Unsupported unless BINARY_OPS.include?(op)
      op = "&&" if op == "and"
      op = "||" if op == "or"
      { "op" => op, "left" => expr(node[1]), "right" => expr(node[3]) }
    when :unary
      op = node[1]
      inner = expr(node[2])
      return -inner if op == :-@ && inner.is_a?(Numeric)
      raise Unsupported unless %i[! not].include?(op)
      { "op" => "!", "value" => inner }
    when :paren
      stmts = node[1].reject { |s| s[0] == :void_stmt }
      raise Unsupported unless stmts.size == 1
      expr(stmts[0])
    else
      raise Unsupported
    end
  end
end
