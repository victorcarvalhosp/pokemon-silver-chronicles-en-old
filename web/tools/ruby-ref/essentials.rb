# Loads the game's real Essentials battle code headless (system Ruby, no
# RGSS): the Settings, GameData, Pokémon, trainer and battle scripts from
# Data/Scripts plus the plugin files that patch them, in the game's load
# order, over minimal stand-ins for the RGSS/mkxp-z engine classes. GameData
# comes from the game's compiled Data/*.dat files.
#
#   require_relative "essentials"
#   Essentials.load!
#
# Used by battle_reference.rb to produce web/src/battle/rubyReference.json.

ROOT = File.expand_path("../../..", __dir__)
SCRIPTS = File.join(ROOT, "Data", "Scripts")
PLUGINS = File.join(ROOT, "Plugins")

$DEBUG = false
$INTERNAL = false

#===============================================================================
# Engine stand-ins (only what the loaded scripts touch at load or run time)
#===============================================================================
module Graphics
  def self.frame_rate; 40; end
  def self.width; 512; end
  def self.height; 384; end
  def self.update; end
  def self.frame_count; 0; end
end

module Input
  %w[DOWN LEFT RIGHT UP USE BACK ACTION SPECIAL CTRL ALT SHIFT A B C X Y Z L R F5 F6 F9 JUMPUP JUMPDOWN].each_with_index do |c, i|
    const_set(c, i + 1)
  end
  def self.method_missing(*_args); false; end
  def self.respond_to_missing?(*_args); true; end
end

module Audio
  def self.method_missing(*_args); nil; end
  def self.respond_to_missing?(*_args); true; end
end

class Bitmap; def initialize(*_a); end; def method_missing(*_a); nil; end; end
class Sprite; def initialize(*_a); end; def method_missing(*_a); nil; end; end
class Viewport; def initialize(*_a); end; def method_missing(*_a); nil; end; end
class Plane < Sprite; end
class Window; def initialize(*_a); end; def method_missing(*_a); nil; end; end
class Tone; def initialize(*_a); end; end
class Color; def initialize(*_a); end; end
class Rect; def initialize(*_a); end; end
class Table; def initialize(*_a); end; end
class Font; def self.method_missing(*_a); nil; end; end
module RPG
  class Sprite < ::Sprite; end
  class Cache; def self.method_missing(*_a); nil; end; end
  class AudioFile; attr_accessor :name, :volume, :pitch; def initialize(n = "", v = 100, p = 100); @name = n; @volume = v; @pitch = p; end; end
end
module System; def self.platform; "macOS"; end; def self.method_missing(*_a); nil; end; end

# Translations (003_Intl_Messages.rb): the game is in English, so every
# message lookup returns the untranslated text.
module MessageTypes
  def self.const_missing(_name); 0; end
end
def pbGetMessageFromHash(_type, text); text.dup; end
def pbGetMessage(_type, id); id.to_s; end

def load_data(file)
  File.open(File.join(ROOT, file), "rb") { |f| Marshal.load(f) }
end

def save_data(*_args); end
def pbSEPlay(*_a); end
def pbMEPlay(*_a); end
def pbBGMPlay(*_a); end
def pbBGMFade(*_a); end
def pbPlayCry(*_a); end
def pbMessage(*_a); 0; end
def pbWait(*_a); end
def pbUpdateSceneMap(*_a); end
def pbGetLanguage; 2; end
def pbGetTimeNow; Time.at(1_700_000_000); end
def _INTL(*arg)
  string = arg[0].dup
  (1...arg.length).each { |i| string.gsub!(/\{#{i}\}/, arg[i].to_s) }
  string
end
def _ISPRINTF(*arg)
  string = arg[0].dup
  (1...arg.length).each do |i|
    string.gsub!(/\{#{i}\:([^\}]+?)\}/) { |_m| next sprintf("%" + $1, arg[i]) }
  end
  string
end

#===============================================================================
# Scripts
#===============================================================================
module Essentials
  CORE = [
    "001_Settings.rb",
    "002_BattleSettings.rb",
    "001_Technical/001_Debugging/001_PBDebug.rb",
    "001_Technical/001_Debugging/004_Validation.rb",
    "001_Technical/001_Debugging/005_Deprecation.rb",
    "001_Technical/002_RubyUtilities.rb",
    "001_Technical/005_PluginManager.rb",
    "003_Game processing/005_Event_Handlers.rb",
    "003_Game processing/006_Event_HandlerCollections.rb",
    "010_Data/001_GameData.rb",
    "010_Data/001_Hardcoded data/*.rb",
    "010_Data/002_PBS data/*.rb",
    "014_Pokemon/001_Pokemon-related/001_FormHandlers.rb",
    "014_Pokemon/001_Pokemon.rb",
    "014_Pokemon/002_Pokemon_MegaEvolution.rb",
    "014_Pokemon/003_Pokemon_ShadowPokemon.rb",
    "014_Pokemon/004_Pokemon_Move.rb",
    "014_Pokemon/005_Pokemon_Owner.rb",
    "019_Utilities/001_Utilities.rb",
    "019_Utilities/002_Utilities_Pokemon.rb",
    "004_Game classes/013_Game_Stats.rb",
    "013_Items/001_Item_Utilities.rb",
    "013_Items/008_PokemonBag.rb",
    "015_Trainers and player/001_Trainer.rb",
    "015_Trainers and player/004_Player.rb",
    "015_Trainers and player/005_Player_Pokedex.rb",
    "011_Battle/001_Battle/*.rb",
    "011_Battle/002_Battler/*.rb",
    "011_Battle/003_Move/*.rb",
    "011_Battle/004_Scene/009_Battle_DebugScene.rb",
    "011_Battle/005_AI/*.rb",
    "011_Battle/006_Other battle code/00[1-6]*.rb",
    "011_Battle/006_Other battle code/00[89]*.rb",
    "011_Battle/006_Other battle code/010*.rb",
    "011_Battle/007_Other battle types/004_BattleArenaBattle.rb", # Battle::SuccessState
  ].freeze

  # Plugin files that patch the code above, in plugin load order
  # (Data/PluginScripts.rxdata).
  PLUGIN_FILES = [
    "v20.1 Hotfixes/Battle bug fixes.rb",
    "Generation 9 Pack Scripts/Settings.rb",
    "Generation 9 Pack Scripts/[000] General/[000] Pokemon.rb",
    "Generation 9 Pack Scripts/[001] Battle/*.rb",
    "Generation 9 Pack Scripts/[002] Moves/*.rb",
    "Generation 9 Pack Scripts/[003] Abilities/*.rb",
    "Generation 9 Pack Scripts/[004] Items/*.rb",
    "Mega Evolution/Mega Evolution.rb",
    "Improved AI/settings.rb",
    "Improved AI/AI_EffectScores.rb",
    "Improved AI/AI_Move.rb",
    "Improved AI/AI_Move_Utilities.rb",
    "Essentials Deluxe/Settings.rb",
    "Essentials Deluxe/[000] Essentials Patches/Battle.rb",
    "Essentials Deluxe/[000] Essentials Patches/Battle_Misc.rb",
    "Essentials Deluxe/[000] Essentials Patches/Mega Evolution.rb",
    "Essentials Deluxe/[000] Essentials Patches/Pokemon.rb",
    "Essentials Deluxe/[000] Essentials Patches/Pokedex.rb",
    "Essentials Deluxe/[001] Plugin Patches/_Custom Placeholder_.rb",
    "Essentials Deluxe/[002] Battle Deluxe/Battle_Deluxe.rb",
    "Essentials Deluxe/[002] Battle Deluxe/Midbattle_Triggers.rb",
    "Essentials Deluxe/[002] Battle Deluxe/Midbattle_Effects.rb",
    "ZUD Mechanics/Settings.rb",
    "ZUD Mechanics/[001] Data/*.rb",
    "ZUD Mechanics/[003] Battle/*.rb",
    "ZUD Mechanics/[004] Battle_Battler/*.rb",
    "ZUD Mechanics/[006] Battle_Move/*.rb",
    "ZUD Mechanics/[007] Move Effects/*.rb",
    "ZUD Mechanics/[008] Overrides/*.rb",
    "ZUD Mechanics/[009] Max Raid/Raid_Battle.rb",
    "ZUD Mechanics/[009] Max Raid/Raid_Battle_Battler.rb",
    "ZUD Mechanics/[009] Max Raid/Raid_Battle_Overrides.rb",
  ].freeze

  INSTALLED = ["v20.1 Hotfixes", "Generation 9 Pack", "Mega Evolution", "Improved AI", "Essentials Deluxe",
               "ZUD Mechanics", "Generation 8 Pack Scripts"].freeze

  # "dir/*.rb" patterns; folder names like "[003] Battle" are literal (not glob classes).
  def self.expand(base, patterns)
    patterns.flat_map do |p|
      next [File.join(base, p)] if !p.include?("*")
      dir = File.join(base, File.dirname(p))
      Dir.children(dir).sort.select { |f| File.fnmatch(File.basename(p), f) }.map { |f| File.join(dir, f) }
    end
  end

  def self.eval_file(path, failures)
    code = File.read(path, encoding: "UTF-8").scrub
    TOPLEVEL_BINDING.eval(code, path)
  rescue Exception => e # rubocop:disable Lint/RescueException
    failures << "#{path.sub(ROOT + '/', '')}: #{e.class}: #{e.message.lines.first&.strip}"
  end

  def self.load!(verbose: false)
    failures = []
    $VERBOSE = nil # constant redefinitions (Gen 9 Pack sets MECHANICS_GENERATION = 9) are expected
    expand(SCRIPTS, CORE).each { |f| eval_file(f, failures) }
    # Battle::Scene isn't loaded (it's all graphics); the battle code only reads
    # this constant, and plugins reopen a few scene classes.
    TOPLEVEL_BINDING.eval(<<~RUBY)
      class Battle::Scene
        USE_ABILITY_SPLASH = (Settings::MECHANICS_GENERATION >= 5)
        %i[initialize pbStartBattle pbEndBattle pbUpdate pbRefresh pbRefreshOne pbRefreshEverything
           pbDisplayMessage pbDisplayPausedMessage pbDisplayConfirmMessage pbShowCommands pbCommandMenu
           pbFightMenu pbPartyScreen pbItemMenu pbChooseTarget pbCommonAnimation pbAnimation pbFaintBattler
           pbShowAbilitySplash pbHideAbilitySplash pbReplaceAbilitySplash pbHPChanged pbDamageAnimation
           pbChangePokemon pbRecall pbSendOutBattlers pbShowPartyLineup pbShowOpponent pbBeginCommandPhase
           pbBeginAttackPhase pbBeginEndOfRoundPhase pbEXPBar pbLevelUp pbForgetMove pbThrow pbThrowSuccess
           pbInitSprites pbCreateBackdropSprites pbBattleIntroAnimation pbHitAndHPLossAnimation
           pbWildBattleSuccess pbTrainerBattleSuccess pbSelectBattler pbResetMoveIndex pbSwapBattlerSprites
           pbAnimationCore pbFindMoveAnimation pbShowWindow pbFrameUpdate pbGraphicsUpdate pbInputUpdate
           pbCreateTrainerFrontSprite pbCreatePokemonSprite pbDisposeSprites pbSaveShadows].each do |m|
          define_method(m) { |*_a| nil }
        end
        class Animation; def initialize(*_a); end; end
        class MenuBase; def initialize(*_a); end; end
        class FightMenu < MenuBase; def refreshMoveData(*_a); end; end
        class CommandMenu < MenuBase; MODES = []; end
        class TargetMenu < MenuBase; MODES = []; end
      end
      module Battle::DebugVariables
        BATTLER_EFFECTS = {}; POSITION_EFFECTS = {}; SIDE_EFFECTS = {}; FIELD_EFFECTS = {}
      end
      $DELUXE_BATTLE_EFFECTS = Hash.new { |h, k| h[k] = [] }
      # 019_Utilities' versions read engine state that doesn't exist headless.
      def pbGetLanguage; 2; end
      def pbMessage(*_a); 0; end
      def pbPlayCry(*_a); end
      def pbSEPlay(*_a); end
      def pbMEPlay(*_a); end
      def pbBGMPlay(*_a); end
    RUBY
    # PluginManager.installed? for the plugins this game has.
    PluginManager.singleton_class.send(:define_method, :installed?) { |name, *_a| INSTALLED.include?(name) }
    expand(PLUGINS, PLUGIN_FILES).each { |f| eval_file(f, failures) }
    # Ruby 2.6 doesn't allow `self.private_method` (2.7+ does), which v20.1 uses.
    [Player::Pokedex, Pokemon, Battle, Battle::Battler, Battle::Move].each do |cls|
      cls.send(:public, *cls.private_instance_methods(false))
    end
    GameData.load_all
    warn failures.join("\n") if verbose && !failures.empty?
    failures
  end
end
