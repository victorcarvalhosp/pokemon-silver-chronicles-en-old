# Generates web/src/battle/other/{AbilityEffects,ItemEffects}.ts from the Ruby registries.
ROOT = ARGV[0]
ASYNC = {
  "AbilityEffects" => %w[AfterMoveUseFromTarget ChangeOnBattlerFainting EndOfRoundEffect EndOfRoundGainItem EndOfRoundHealing
    EndOfRoundWeather MoveImmunity OnBattlerFainting OnBeingHit OnDealingHit OnEndOfUsingMove OnFlinch OnHPDroppedBelowHalf
    OnIntimidated OnOpposingStatGain OnStatLoss OnStatGain OnStatusInflicted OnSwitchIn OnSwitchOut OnTerrainChange
    PriorityBracketUse StatLossImmunity StatLossImmunityFromAlly StatLossImmunityNonIgnorable StatusCure],
  "ItemEffects" => %w[AfterMoveUseFromTarget AfterMoveUseFromUser EndOfRoundEffect EndOfRoundHealing HPHeal OnBeingHit
    OnBeingHitPositiveBerry OnEndOfUsingMove OnEndOfUsingMoveStatRestore OnIntimidated OnMissingTarget OnOpposingStatGain
    OnStatLoss OnSwitchIn PriorityBracketUse StatLossImmunity StatusCure TerrainStatBoost],
}
TYPES = {
  "battler" => "Battler", "user" => "Battler", "target" => "Battler", "move_user" => "Battler | null",
  "b" => "Battler", "opponent" => "Battler", "battle" => "Battle", "move" => "Move", "targets" => "Battler[]",
  "mult" => "number", "weight" => "number", "priority" => "number", "duration" => "number", "c" => "number",
  "exp" => "number", "type" => "Id", "status" => "Id", "stat" => "Id", "weather" => "Id", "terrain" => "Id",
  "mults" => "DamageMultipliers", "modifiers" => "AccuracyModifiers", "base_damage" => "number", "baseDmg" => "number",
  "show_messages" => "boolean", "show_message" => "boolean", "forced" => "boolean", "switch_in" => "boolean",
  "ev_array" => "Record<Id, number>", "statUps" => "Record<Id, number>", "battler_fainted" => "Battler",
  "fainted" => "Battler", "idxBattler" => "number", "ret" => "number", "w" => "number",
  "mods" => "AccuracyModifiers", "crit_stage" => "number", "hit_num" => "number", "switched_battlers" => "number[]",
  "num_hits" => "number", "bearer" => "Battler", "switcher" => "Battler", "end_of_battle" => "boolean",
  "ability_changed" => "boolean",
}
def camel(s)
  s.gsub(/_([a-z])/) { $1.upcase }
end

def gen(kind, files)
  hashes = []   # [name, comment, file]
  triggers = {} # name => [args, body, file]
  files.each do |f|
    src = File.read(f, encoding: "utf-8")
    mod = src[/^module Battle::#{kind}\b.*?^end/m]
    next if !mod
    mod.scan(/^  (\w+)[ \t]*=[ \t]*\w*HandlerHash\.new(?:[ \t]*#[ \t]*([^\r\n]*))?\r?$/).each { |n, c| hashes << [n, c, f] unless hashes.any? { |h| h[0] == n } }
    mod.scan(/^  def self\.(trigger\w+)\(([^)]*)\)\r?\n(.*?)^  end/m).each { |n, a, b| triggers[n] = [a, b, f] }
  end
  async = ASYNC[kind]
  out = []
  rel = ->(f) { f.sub("#{ROOT}/", "") }
  out << "// Port of the Battle::#{kind} registry in"
  files.each { |f| out << "//   #{rel.(f)}" }
  out << "// (handler hashes + every trigger function; the handlers themselves are"
  out << "// registered by the #{kind == 'AbilityEffects' ? 'ability' : 'item'} handler files, e.g."
  out << "//   #{kind}.#{kind == 'AbilityEffects' ? 'SpeedCalc.add("CHLOROPHYLL", (ability, battler, mult) => ...)' : 'SpeedCalc.add("CHOICESCARF", (item, battler, mult) => ...)'}"
  out << "// ). Handlers receive the #{kind == 'AbilityEffects' ? 'ability' : 'item'} ID first, as in Ruby (HandlerHash2#trigger)."
  out << "//"
  out << "// Triggers whose handlers can show messages, play animations or change the"
  out << "// battle through the scene are async (their handlers may return a Promise):"
  out << "//   #{async.select { |a| hashes.any? { |h| h[0] == a } }.join(', ')}"
  out << "// The other triggers are synchronous and their handlers must be too."
  out << "// This file is generated from the Ruby by web/tools/ruby-ref/genBattleRegistries.rb."
  out << ""
  out << "import type { Id } from \"../../data/gameData/gameData\";"
  out << "import { ItemHandlerHash } from \"../../game/items/ItemHandlers\";"
  out << "import type { Battle } from \"../battle/Battle\";"
  out << "import type { Battler } from \"../battler/Battler\";"
  out << "import type { Move } from \"../move/Move\";"
  out << ""
  out << "/** What a trigger receives as the #{kind == 'AbilityEffects' ? 'ability' : 'item'}: an ID, a GameData object or nil. */"
  out << "export type HandlerKey = Id | { id: Id } | null | undefined;"
  out << "/** The damage multipliers hash of Battle::Move#pbCalcDamageMultipliers (:base_damage_multiplier, ...). */"
  out << "export type DamageMultipliers = Record<string, number>;"
  out << "/** The accuracy modifiers hash of Battle::Move#pbCalcAccuracyModifiers (:base_accuracy, ...). */"
  out << "export type AccuracyModifiers = Record<string, number>;" if kind == "AbilityEffects"
  out << "import type { AccuracyModifiers } from \"./AbilityEffects\";" if kind == "ItemEffects"
  out << "// eslint-disable-next-line @typescript-eslint/no-explicit-any"
  out << "type AnyHandler = (id: Id, ...args: any[]) => any;"
  out << ""
  out << "/** Battle::#{kind}.trigger(hash, *args, ret:) — the handler's result, or ret if it returned nil. */"
  out << "function trigger<T>(hash: ItemHandlerHash<AnyHandler>, key: HandlerKey, args: unknown[], ret: T): T {"
  out << "  if (key == null) return ret;"
  out << "  const newRet = hash.trigger(key, ...args) as T | null | undefined;"
  out << "  return newRet != null ? newRet : ret;"
  out << "}"
  out << ""
  out << "/** As trigger, for the handler kinds that can be async. */"
  out << "async function triggerAsync<T>(hash: ItemHandlerHash<AnyHandler>, key: HandlerKey, args: unknown[], ret: T): Promise<T> {"
  out << "  if (key == null) return ret;"
  out << "  const newRet = (await hash.trigger(key, ...args)) as T | null | undefined;"
  out << "  return newRet != null ? newRet : ret;"
  out << "}"
  out << ""
  out << "const h = (): ItemHandlerHash<AnyHandler> => new ItemHandlerHash<AnyHandler>();"
  out << ""
  out << "export const #{kind} = {"
  hashes.each do |n, c, f|
    note = c ? " // #{c.strip}" : ""
    note += " (#{File.basename(File.dirname(f))})" if f.include?("Plugins")
    out << "  #{n}: h(),#{note}"
  end
  out << ""
  triggers.each do |name, (args, body, f)|
    hashname = body[/(?:trigger\(|^\s*|!)(\w+)(?:,|\.trigger|\[)/, 1]
    params = args.split(",").map(&:strip).reject(&:empty?)
    ts_params = params.map do |p|
      n, d = p.split("=").map(&:strip)
      tn = camel(n)
      if n == params[0].split("=")[0].strip
        "#{tn}: HandlerKey"
      else
        t = TYPES[n] || "any"
        d ? "#{tn}: #{t} = #{d == 'nil' ? 'null' : d}" : "#{tn}: #{t}"
      end
    end
    names = params.map { |p| camel(p.split("=")[0].strip) }
    retm = body[/ret:\s*([\w.-]+)/, 1]
    if retm
      ret_ts = retm =~ /\A-?\d+\z/ ? retm : camel(retm)
      rtype = retm =~ /\A-?\d+\z/ ? "number" : (TYPES[retm] || "any")
    else
      ret_ts = "false"
      rtype = "boolean"
    end
    is_async = async.include?(hashname)
    src_note = f.include?("Plugins") ? " (#{f.sub(/.*Plugins\//, '')})" : ""
    if name == "triggerEVGainModifier"
      out << "  /** Returns whether a handler exists (and runs it). */"
      out << "  triggerEVGainModifier(item: HandlerKey, battler: Battler | null, evArray: Record<Id, number>): boolean {"
      out << "    if (!#{kind}.EVGainModifier.get(item)) return false;"
      out << "    #{kind}.EVGainModifier.trigger(item!, battler, evArray);"
      out << "    return true;"
      out << "  },"
      next
    end
    if name == "triggerOnSwitchIn" && kind == "AbilityEffects"
      out << "  /** Generation 9 Pack ([003] Abilities/[000] Ability Handlers.rb:12): also triggers allies' Commander. */"
      out << "  async triggerOnSwitchIn(ability: HandlerKey, battler: Battler, battle: Battle, switchIn = false): Promise<void> {"
      out << "    if (ability != null) await #{kind}.OnSwitchIn.trigger(ability, battler, battle, switchIn);"
      out << "    for (const b of battle.allSameSideBattlers(battler.index)) {"
      out << "      if (!b.hasActiveAbility(\"COMMANDER\")) continue;"
      out << "      if (b.effects[402 /* PBEffects.Commander */]) continue;"
      out << "      await #{kind}.OnSwitchIn.trigger(b.abilityId!, b, battle, switchIn);"
      out << "    }"
      out << "  },"
      next
    end
    rest = names[1..]
    returns_value = body.include?("return")
    if is_async
      out << "  async #{name}(#{ts_params.join(', ')}): Promise<#{returns_value ? rtype : 'void'}> {#{src_note.empty? ? '' : ' //' + src_note}"
      out << (returns_value ? "    return triggerAsync(#{kind}.#{hashname}, #{names[0]}, [#{rest.join(', ')}], #{ret_ts});" :
                              "    await triggerAsync(#{kind}.#{hashname}, #{names[0]}, [#{rest.join(', ')}], null);")
    else
      out << "  #{name}(#{ts_params.join(', ')}): #{returns_value ? rtype : 'void'} {#{src_note.empty? ? '' : ' //' + src_note}"
      out << (returns_value ? "    return trigger(#{kind}.#{hashname}, #{names[0]}, [#{rest.join(', ')}], #{ret_ts});" :
                              "    trigger(#{kind}.#{hashname}, #{names[0]}, [#{rest.join(', ')}], null);")
    end
    out << "  },"
  end
  out << "};"
  out.join("\n") + "\n"
end

b = "#{ROOT}/Data/Scripts/011_Battle/006_Other battle code"
pl = "#{ROOT}/Plugins/Generation 9 Pack Scripts"
File.write("#{ROOT}/web/src/battle/other/AbilityEffects.ts", gen("AbilityEffects", ["#{b}/008_Battle_AbilityEffects.rb", "#{pl}/[003] Abilities/[000] Ability Handlers.rb"]))
File.write("#{ROOT}/web/src/battle/other/ItemEffects.ts", gen("ItemEffects", ["#{b}/009_Battle_ItemEffects.rb", "#{pl}/[004] Items/[001] New Item Handlers.rb"]))
