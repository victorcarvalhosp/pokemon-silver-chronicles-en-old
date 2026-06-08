#===============================================================================
#                              ACRO BIKE SYSTEM
#===============================================================================
#                          Version 1.3 - Compatible v21.1
#                                                                              
#  Author: Claude & Hiyouri                                                       
#  Compatible: Pokemon Essentials v21.1+                                     
#  Date: 2025/10/10                                                      
#                                                                              
#  DESCRIPTION:                                                               
#  Adds the Acro Bike from Pokemon Ruby/Sapphire/Emerald with various features!
#
#  FEATURES:                                                                                               
#  • Front Wheelie
#  • Back Wheelie
#  • Bunny hop
#  • Speed boost
#  • Side hop
#  • Jump over ledges backwards
#  • Multi-character support (boy, girl, etc.)
#
#  EVENT FUNCTIONS:
#  • pbIsOnAcroBike?             : Check if player is on Acro Bike
#  • pbIsDoingWheelie?           : Check if player is doing a wheelie
#  • pbIsDoingFrontWheelie?      : Check if player is doing a front wheelie
#  • pbIsDoingBunnyHop?          : Check if player is in bunny hop mode
#  • pbIsDoingSpeedBoost?        : Check if player is speed boosting
#  • pbIsDoingStationaryWheelie? : Check if player is doing stationary wheelie
#  • pbGetAcroBikeSpeed          : Get player's bike speed
#  • pbGetBikeType               : Get the type of bike player is using
#                                                                              
#  IN-GAME CONTROLS:
#  • Hold B + Direction         : Wheelie while moving
#  • Hold B (stationary)        : Stationary wheelie (rotation only)
#  • Double-tap B (stationary)  : Front wheelie (rotation only)
#  • Hold B (stationary 2s+)    : Bunny hop
#  • Hold A + Direction         : Side hops
#  • During bunny hop           : Can jump over ledges backwards
#  • Double-tap Direction       : Speed boost
#
#  SPRITE CONFIGURATION
#  For each character, use the same name as walkcharset and 
#  add these suffixes: (walkcharset)_acrobike 
#                      (walkcharset)_acrobike_wheelie 
#                      (walkcharset)_acrobike_front_wheelie
#
#===============================================================================
#                                  SETTINGS
#===============================================================================

module AcroBikeSettings
  # Default sprite names (used if sprites are not properly named)
  ACRO_BIKE_SPRITE = "boy_acrobike"                     # Normal Acro Bike sprite
  ACRO_WHEELIE_SPRITE = "boy_acro_wheelie"              # Acro Bike wheelie sprite
  ACRO_FRONT_WHEELIE_SPRITE = "boy_acro_front_wheelie"  # Acro Bike front wheelie sprite
  
  # Timers (in frames, 60 frames = 1 second)
  BUNNY_HOP_DELAY = 120       # Delay before automatic bunny hop
  BUNNY_HOP_INTERVAL = 30     # Interval between jumps
  SPEED_BOOST_WINDOW = 20     # Time window for double-tap (20 frames = 1/3 second)
  FRONT_WHEELIE_WINDOW = 20   # Time window for double-tap B (20 frames = 1/3 second)
  
  # Sounds & Music
  JUMP_SOUND = "Player jump"              # Jump sound
  BIKE_SOUND = "Bicycle"                  # Bike mount sound
  SPEED_BOOST_SOUND = "GUI party switch"  # Speed boost sound
  ACRO_BIKE_BGM = "RSE 135 Cycling"       # Acro Bike specific music
  
  # Animations
  SPEED_BOOST_ANIMATION = 002             # Speed boost animation ID (002 = Dust)
  
  # Gameplay
  JUMP_SPEED = 2.5                # Jump speed
  BUNNY_HOP_IGNORE_LEDGES = true  # Allow jumping over ledges backwards
  ACRO_BIKE_SPEED = 5           # Acro Bike speed (3=walk, 4=run, 5=normal bike)
  WHEELIE_SPEED = 4               # Speed during wheelie (slower for balance)
  BUNNY_HOP_SPEED = 2.5           # Speed during bunny hop (even slower)
  SPEED_BOOST_SPEED = 6           # Speed during speed boost (maximum speed)
end

#===============================================================================
#                            MAIN SYSTEM
#===============================================================================

#===============================================================================
# Prevent map change during bunny hop
#===============================================================================
class PokemonMapFactory
  alias acro_bike_old_setCurrentMap setCurrentMap
  def setCurrentMap
    # Block map change if player is jumping
    return if $game_player.jumping?
    acro_bike_old_setCurrentMap
  end
end

#===============================================================================
# Extension of PokemonGlobalMetadata
#===============================================================================
class PokemonGlobalMetadata
  attr_accessor :bicycle_type
  attr_accessor :acro_bike_state

  alias acro_bike_old_initialize initialize
  def initialize
    acro_bike_old_initialize
    @bicycle_type = nil
    @acro_bike_state = :normal
  end

  def bicycle
    return @bicycle_type != nil
  end

  def bicycle=(value)
    if value
      @bicycle_type = :NORMAL if @bicycle_type.nil?
    else
      @bicycle_type = nil
    end
  end

  def using_normal_bike?
    return @bicycle_type == :NORMAL
  end

  def using_acro_bike?
    return @bicycle_type == :ACRO
  end

  def bike_type_name
    case @bicycle_type
    when :NORMAL then return "Normal Bike"
    when :ACRO then return "Acro Bike"
    else return "Walking"
    end
  end
end

#===============================================================================
# Helper function to get Acro Bike sprite based on character charset
#===============================================================================
# SPRITE NAMING CONVENTION:
# If WalkCharset = "trainer_POKEMONTRAINER_May", Acro sprites should be:
#   - trainer_POKEMONTRAINER_May_acrobike.png
#   - trainer_POKEMONTRAINER_May_acrobike_wheelie.png
#   - trainer_POKEMONTRAINER_May_acrobike_front_wheelie.png
#
# If WalkCharset = "boy_walk", Acro sprites should be:
#   - boy_acrobike.png
#   - boy_acrobike_wheelie.png
#   - boy_acrobike_front_wheelie.png
#===============================================================================
def pbGetAcroBikeCharset(base_charset, type = :normal)
  return AcroBikeSettings::ACRO_BIKE_SPRITE if !base_charset || base_charset.empty?
  
  # Extract charset prefix
  # If charset contains _walk, _run, etc., take everything before it
  # Otherwise (like "trainer_POKEMONTRAINER_May"), use full name as prefix
  prefix = base_charset.sub(/_(walk|run|bike|surf|dive|fish).*$/, "")
  # If no match (sub didn't change anything), prefix is already the full name, that's good!
  # If charset was empty after sub, use "boy" as default
  prefix = "boy" if prefix.empty?
  
  # Build suffix based on requested sprite type
  suffix = case type
  when :wheelie       then "_acrobike_wheelie"
  when :front_wheelie then "_acrobike_front_wheelie"
  else                     "_acrobike"
  end
  
  sprite_name = prefix + suffix
  
  # Check if file exists, otherwise use fallback
  return sprite_name if pbResolveBitmap("Graphics/Characters/#{sprite_name}")
  
  # Fallback to default sprites
  return case type
  when :wheelie       then AcroBikeSettings::ACRO_WHEELIE_SPRITE
  when :front_wheelie then AcroBikeSettings::ACRO_FRONT_WHEELIE_SPRITE
  else                     AcroBikeSettings::ACRO_BIKE_SPRITE
  end
end

# Helper function to check if current sprite is an Acro Bike sprite
def pbIsAcroBikeSprite?(sprite_name)
  return false if !sprite_name
  return sprite_name.include?("_acrobike")
end

#===============================================================================
# Extension of Game_Player
#===============================================================================
class Game_Player < Game_Character
  alias acro_bike_old_initialize initialize
  def initialize(*args)
    acro_bike_old_initialize(*args)
    @bunny_hopping = false
    @bunny_hop_timer = 0
    @bunny_hop_active_timer = 0
    @wheelie_stationary = false
    @side_hop_bump_played = false
    @speed_boost_active = false
    @last_direction_time = {}
    @last_direction_pressed = 0
    @front_wheelie_active = false
    @last_back_button_time = 0
  end

  def force_acro_sprite
    return if !$PokemonGlobal.using_acro_bike?
    
    meta = GameData::PlayerMetadata.get($player&.character_ID || 1)
    base_charset = meta.walk_charset
    
    if @front_wheelie_active
      @character_name = pbGetAcroBikeCharset(base_charset, :front_wheelie)
      self.move_speed = 0 if !@move_route_forcing
    elsif @speed_boost_active
      @character_name = pbGetAcroBikeCharset(base_charset, :normal)
      self.move_speed = AcroBikeSettings::SPEED_BOOST_SPEED if !@move_route_forcing
    elsif $PokemonGlobal.acro_bike_state == :wheelie
      @character_name = pbGetAcroBikeCharset(base_charset, :wheelie)
      self.move_speed = AcroBikeSettings::WHEELIE_SPEED if !@move_route_forcing
    else
      @character_name = pbGetAcroBikeCharset(base_charset, :normal)
      self.move_speed = AcroBikeSettings::ACRO_BIKE_SPEED if !@move_route_forcing
    end
    
    if @bunny_hopping && !@speed_boost_active && !@front_wheelie_active
      self.move_speed = AcroBikeSettings::BUNNY_HOP_SPEED if !@move_route_forcing
    end
  end

  alias acro_bike_old_refresh_charset refresh_charset
  def refresh_charset
    if $PokemonGlobal&.using_acro_bike?
      force_acro_sprite
    else
      acro_bike_old_refresh_charset
      # If player is no longer on Acro Bike but still has an Acro Bike sprite, reset it
      if pbIsAcroBikeSprite?(@character_name)
        meta = GameData::PlayerMetadata.get($player&.character_ID || 1)
        @character_name = meta.walk_charset if meta.walk_charset && !meta.walk_charset.empty?
        self.move_speed = 3
      end
    end
  end

  def acro_bunny_hop
    return false if !$PokemonGlobal.using_acro_bike? || moving? || jumping?
    return false if @speed_boost_active
    
    self.jump_speed = AcroBikeSettings::JUMP_SPEED
    pbSEPlay(AcroBikeSettings::JUMP_SOUND)
    jump(0, 0)
    return true
  end

  def check_speed_boost(direction)
    return false if !$PokemonGlobal.using_acro_bike?
    return false if @speed_boost_active
    return false if @bunny_hopping || @wheelie_stationary
    return false if @front_wheelie_active
    
    current_time = Graphics.frame_count
    
    if @last_direction_time[direction] && 
       (current_time - @last_direction_time[direction]) <= AcroBikeSettings::SPEED_BOOST_WINDOW
      @speed_boost_active = true
      
      $PokemonGlobal.acro_bike_state = :normal
      @bunny_hopping = false
      @bunny_hop_timer = 0
      @wheelie_stationary = false
      @front_wheelie_active = false
      
      pbSEPlay(AcroBikeSettings::SPEED_BOOST_SOUND)
      if $scene.spriteset
        $scene.spriteset.addUserAnimation(AcroBikeSettings::SPEED_BOOST_ANIMATION, @x, @y, true, 1)
      end
      force_acro_sprite
      
      return true
    end
    
    @last_direction_time[direction] = current_time
    return false
  end

  def check_front_wheelie
    return false if !$PokemonGlobal.using_acro_bike?
    return false if @front_wheelie_active
    return false if @speed_boost_active
    return false if moving? || jumping?
    return false if $PokemonGlobal.acro_bike_state == :wheelie
    
    current_time = Graphics.frame_count
    
    if @last_back_button_time > 0 && 
       (current_time - @last_back_button_time) <= AcroBikeSettings::FRONT_WHEELIE_WINDOW
      @front_wheelie_active = true
      
      $PokemonGlobal.acro_bike_state = :front_wheelie
      @bunny_hopping = false
      @bunny_hop_timer = 0
      @wheelie_stationary = false
      
      force_acro_sprite
      
      return true
    end
    
    @last_back_button_time = current_time
    return false
  end

  def acro_side_hop(direction)
    return false if !$PokemonGlobal.using_acro_bike? || moving? || jumping?
    return false if @bunny_hopping
    return false if @speed_boost_active
    
    original_direction = @direction
    
    case @direction
    when 2
      jump_dir = (direction == 4) ? [-1, 0] : [1, 0]
    when 4
      jump_dir = (direction == 8) ? [0, -1] : [0, 1]
    when 6
      jump_dir = (direction == 8) ? [0, -1] : [0, 1]
    when 8
      jump_dir = (direction == 4) ? [-1, 0] : [1, 0]
    else
      return false
    end
    
    new_x = @x + jump_dir[0]
    new_y = @y + jump_dir[1]
    return false unless $game_map.valid?(new_x, new_y)
    
    unless self.map.passable?(new_x, new_y, 0, self)
      return false
    end
    
    if !can_side_hop_to_bridge?(new_x, new_y, direction)
      return false
    end
    
    $game_map.events.each_value do |event|
      next if event == self || !event.at_coordinate?(new_x, new_y) || event.through
      return false if event.character_name != ""
    end
    
    if $game_player.x == new_x && $game_player.y == new_y && 
       !$game_player.through && @character_name != ""
      return false
    end
    
    [2, 1, 0].each do |i|
      tile_id = $game_map.data[new_x, new_y, i]
      next if tile_id == 0
      terrain = GameData::TerrainTag.try_get($game_map.terrain_tags[tile_id])
      if terrain&.ledge
        return false
      end
      break if terrain&.id != :None && !terrain&.ignore_passability
    end
    
    self.jump_speed = AcroBikeSettings::JUMP_SPEED
    pbSEPlay(AcroBikeSettings::JUMP_SOUND)
    jump(jump_dir[0], jump_dir[1])
    
    @direction = original_direction
    
    @bunny_hop_timer = AcroBikeSettings::BUNNY_HOP_DELAY
    
    return true
  end

  def can_side_hop_to_bridge?(dest_x, dest_y, hop_direction)
    reverse_direction = case hop_direction
    when 2 then 8
    when 4 then 6
    when 6 then 4
    when 8 then 2
    else return true
    end
    
    if !self.map.passable?(dest_x, dest_y, reverse_direction, self)
      current_has_restrictions = false
      [2, 4, 6, 8].each do |dir|
        unless self.map.passable?(@x, @y, dir, self)
          current_has_restrictions = true
          break
        end
      end
      
      if current_has_restrictions
        return true
      else
        return false
      end
    end
    
    return true
  end

  alias acro_bike_old_update_command_new update_command_new
  def update_command_new
    if $PokemonGlobal.using_acro_bike?
      if $game_temp.message_window_showing || $game_temp.in_menu || 
         pbMapInterpreterRunning? || !$scene.is_a?(Scene_Map)
        if $PokemonGlobal.acro_bike_state == :wheelie || $PokemonGlobal.acro_bike_state == :front_wheelie
          $PokemonGlobal.acro_bike_state = :normal
          force_acro_sprite
        end
        @bunny_hopping = false
        @bunny_hop_timer = 0
        @wheelie_stationary = false
        @speed_boost_active = false
        @front_wheelie_active = false
        acro_bike_old_update_command_new
        return
      end
      
      dir = Input.dir4
      
      if dir > 0 && Input.trigger?(dir) && !@speed_boost_active && !@front_wheelie_active
        if check_speed_boost(dir)
          acro_bike_old_update_command_new
          return
        end
      end
      
      if @speed_boost_active
        acro_bike_old_update_command_new
        return
      end
      
      if @front_wheelie_active
        if Input.press?(Input::BACK)
          if dir > 0
            turn_generic(dir)
          end
          return
        else
          @front_wheelie_active = false
          $PokemonGlobal.acro_bike_state = :normal
          force_acro_sprite
        end
      end
      
      if Input.press?(Input::USE) && dir > 0 && !@bunny_hopping && !@front_wheelie_active
        valid_side_direction = false
        case @direction
        when 2, 8
          valid_side_direction = (dir == 4 || dir == 6)
        when 4, 6
          valid_side_direction = (dir == 8 || dir == 2)
        end
        
        if valid_side_direction && !moving? && !jumping?
          if acro_side_hop(dir)
            return
          else
            if !@side_hop_bump_played
              pbSEPlay("Player bump")
              @side_hop_bump_played = true
            end
            return
          end
        end
      else
        @side_hop_bump_played = false
      end
      
      if @bunny_hopping && dir > 0 && AcroBikeSettings::BUNNY_HOP_IGNORE_LEDGES && !@front_wheelie_active
        if check_and_jump_ledge(dir)
          return
        end
      end
      
      if Input.trigger?(Input::BACK) && !@front_wheelie_active
        if check_front_wheelie
          return
        end
        
        $PokemonGlobal.acro_bike_state = :wheelie
        force_acro_sprite
        if dir == 0
          @bunny_hop_timer = AcroBikeSettings::BUNNY_HOP_DELAY
          @bunny_hopping = false
          @wheelie_stationary = true
        else
          @wheelie_stationary = false
        end
        return
      
      elsif Input.press?(Input::BACK) && !@front_wheelie_active
        $PokemonGlobal.acro_bike_state = :wheelie
        force_acro_sprite
        
        if dir == 0 && !@bunny_hopping && @bunny_hop_timer == 0 && !@wheelie_stationary
          @bunny_hop_timer = AcroBikeSettings::BUNNY_HOP_DELAY
          @wheelie_stationary = true
        end
        
        if @wheelie_stationary && !@bunny_hopping && dir > 0
          turn_generic(dir)
          @bunny_hop_timer = AcroBikeSettings::BUNNY_HOP_DELAY
          return
        end
        
        if @bunny_hopping
          if dir > 0 && !moving? && !jumping?
            turn_generic(dir)
            if can_move_in_direction?(dir)
              new_x = @x + (dir == 4 ? -1 : dir == 6 ? 1 : 0)
              new_y = @y + (dir == 8 ? -1 : dir == 2 ? 1 : 0)
              
              can_jump = true
              if $game_map.valid?(new_x, new_y)
                [2, 1, 0].each do |i|
                  tile_id = $game_map.data[new_x, new_y, i]
                  next if tile_id == 0
                  terrain = GameData::TerrainTag.try_get($game_map.terrain_tags[tile_id])
                  if terrain&.ledge
                    can_jump = false
                    break
                  end
                  break if terrain&.id != :None && !terrain&.ignore_passability
                end
              end
              
              if can_jump
                self.jump_speed = AcroBikeSettings::JUMP_SPEED
                pbSEPlay(AcroBikeSettings::JUMP_SOUND)
                jumpForward(1)
                @bunny_hop_active_timer = 0
              end
            end
          end
          return
        
        elsif @wheelie_stationary
          return
        
        elsif dir > 0 && !@wheelie_stationary
          @bunny_hop_timer = 0
        end
      
      elsif !Input.press?(Input::BACK)
        if $PokemonGlobal.acro_bike_state == :wheelie || $PokemonGlobal.acro_bike_state == :front_wheelie
          $PokemonGlobal.acro_bike_state = :normal
          force_acro_sprite
        end
        @bunny_hopping = false
        @bunny_hop_timer = 0
        @wheelie_stationary = false
        @front_wheelie_active = false
      end
    end
    
    return if @bunny_hopping || @wheelie_stationary || @front_wheelie_active
    acro_bike_old_update_command_new
  end

  def check_and_jump_ledge(direction)
    return false if moving? || jumping?
    return false if @speed_boost_active
    
    new_x = @x + (direction == 4 ? -1 : direction == 6 ? 1 : 0)
    new_y = @y + (direction == 8 ? -1 : direction == 2 ? 1 : 0)
    
    return false unless $game_map.valid?(new_x, new_y)
    
    current_is_ledge = false
    [2, 1, 0].each do |i|
      tile_id = $game_map.data[@x, @y, i]
      next if tile_id == 0
      terrain = GameData::TerrainTag.try_get($game_map.terrain_tags[tile_id])
      if terrain&.ledge
        current_is_ledge = true
        break
      end
      break if terrain&.id != :None && !terrain&.ignore_passability
    end
    
    return false if current_is_ledge
    
    destination_is_ledge = false
    [2, 1, 0].each do |i|
      tile_id = $game_map.data[new_x, new_y, i]
      next if tile_id == 0
      terrain = GameData::TerrainTag.try_get($game_map.terrain_tags[tile_id])
      if terrain&.ledge
        destination_is_ledge = true
        break
      end
      break if terrain&.id != :None && !terrain&.ignore_passability
    end
    
    return false unless destination_is_ledge
    
    final_x = @x + (direction == 4 ? -2 : direction == 6 ? 2 : 0)
    final_y = @y + (direction == 8 ? -2 : direction == 2 ? 2 : 0)
    
    return false unless $game_map.valid?(final_x, final_y)
    
    final_is_ledge = false
    [2, 1, 0].each do |i|
      tile_id = $game_map.data[final_x, final_y, i]
      next if tile_id == 0
      terrain = GameData::TerrainTag.try_get($game_map.terrain_tags[tile_id])
      if terrain&.ledge
        final_is_ledge = true
        break
      end
      break if terrain&.id != :None && !terrain&.ignore_passability
    end
    
    return false if final_is_ledge
    
    $game_map.events.each_value do |event|
      next if event == self || !event.at_coordinate?(new_x, new_y) || event.through
      return false if event.character_name != ""
    end
    
    $game_map.events.each_value do |event|
      next if event == self || !event.at_coordinate?(final_x, final_y) || event.through
      return false if event.character_name != ""
    end
    
    turn_generic(direction)
    pbSEPlay(AcroBikeSettings::JUMP_SOUND)
    
    case direction
    when 2; jump(0, 2)
    when 4; jump(-2, 0)
    when 6; jump(2, 0)
    when 8; jump(0, -2)
    end
    
    increase_steps
    
    return true
  end

  alias acro_bike_old_update update
  def update
    acro_bike_old_update
    
    if @speed_boost_active
      dir = Input.dir4
      if dir == 0 || !Input.press?(dir)
        @speed_boost_active = false
        force_acro_sprite
      end
    end
    
    if !@speed_boost_active && !@front_wheelie_active && @bunny_hop_timer > 0 && Input.press?(Input::BACK) && !moving?
      @bunny_hop_timer -= 1
      if @bunny_hop_timer <= 0
        @bunny_hopping = true
        @wheelie_stationary = false
        @bunny_hop_active_timer = AcroBikeSettings::BUNNY_HOP_INTERVAL
      end
    elsif @bunny_hop_timer > 0
      @bunny_hop_timer = 0
      @wheelie_stationary = false
    end
    
    if !@speed_boost_active && !@front_wheelie_active && @bunny_hopping && Input.press?(Input::BACK) && !moving?
      @bunny_hop_active_timer += 1
      if !jumping? && @bunny_hop_active_timer >= AcroBikeSettings::BUNNY_HOP_INTERVAL
        acro_bunny_hop
        @bunny_hop_active_timer = 0
      end
    end
    
    if $PokemonGlobal.using_acro_bike?
      force_acro_sprite
    else
      # If player is no longer on Acro Bike but still has an Acro Bike sprite, reset it
      if pbIsAcroBikeSprite?(@character_name)
        meta = GameData::PlayerMetadata.get($player&.character_ID || 1)
        @character_name = meta.walk_charset if meta.walk_charset && !meta.walk_charset.empty?
        self.move_speed = 3
      end
    end
  end
end

#===============================================================================
#                             BIKE FUNCTIONS
#===============================================================================

def pbMountBike(bike_type = :NORMAL)
  return if $PokemonGlobal.bicycle
  
  $PokemonGlobal.bicycle_type = bike_type
  $PokemonGlobal.acro_bike_state = :normal if bike_type == :ACRO
  $stats.cycle_count += 1
  
  meta = GameData::PlayerMetadata.get($player&.character_ID || 1)
  
  if bike_type == :ACRO
    base_charset = meta.walk_charset
    $game_player.character_name = pbGetAcroBikeCharset(base_charset, :normal)
    $game_player.move_speed = AcroBikeSettings::ACRO_BIKE_SPEED
  else
    bike_charset = pbGetPlayerCharset(meta.cycle_charset)
    $game_player.character_name = bike_charset if bike_charset
    $game_player.move_speed = 5
  end
  
  if bike_type == :ACRO
    pbCueBGM(AcroBikeSettings::ACRO_BIKE_BGM, 0.4)
  else
    bike_bgm = GameData::Metadata.get.bicycle_BGM
    pbCueBGM(bike_bgm, 0.4) if bike_bgm
  end
  pbSEPlay(AcroBikeSettings::BIKE_SOUND)
  pbPokeRadarCancel
end

def pbMountAcroBike
  pbMountBike(:ACRO)
end

def pbDismountBike
  return if !$PokemonGlobal.bicycle
  
  $PokemonGlobal.bicycle_type = nil
  $PokemonGlobal.acro_bike_state = :normal
  
  if $game_player
    # Reset all Acro Bike state variables
    $game_player.instance_variable_set(:@bunny_hopping, false)
    $game_player.instance_variable_set(:@bunny_hop_timer, 0)
    $game_player.instance_variable_set(:@bunny_hop_active_timer, 0)
    $game_player.instance_variable_set(:@wheelie_stationary, false)
    $game_player.instance_variable_set(:@side_hop_bump_played, false)
    $game_player.instance_variable_set(:@speed_boost_active, false)
    $game_player.instance_variable_set(:@last_direction_time, {})
    $game_player.instance_variable_set(:@last_direction_pressed, 0)
    $game_player.instance_variable_set(:@front_wheelie_active, false)
    $game_player.instance_variable_set(:@last_back_button_time, 0)
    
    # Refresh sprite (refresh_charset will handle resetting to walk_charset)
    $game_player.move_speed = 3
    $game_player.refresh_charset
  end
  
  $game_map.autoplayAsCue
end

def pbBikeCheck
  if $PokemonGlobal.surfing || $PokemonGlobal.diving ||
     (!$PokemonGlobal.bicycle &&
     ($game_player.pbTerrainTag.must_walk || $game_player.pbTerrainTag.must_walk_or_run))
    pbMessage(_INTL("Can't use that here."))
    return false
  end
  if !$game_player.can_ride_vehicle_with_follower?
    pbMessage(_INTL("It can't be used when you have someone with you."))
    return false
  end
  map_metadata = $game_map.metadata
  if $PokemonGlobal.bicycle
    if map_metadata&.always_bicycle
      pbMessage(_INTL("You can't dismount your Bike here."))
      return false
    end
    return true
  end
  if !map_metadata || (!map_metadata.can_bicycle && !map_metadata.outdoor_map)
    pbMessage(_INTL("Can't use that here."))
    return false
  end
  return true
end

#===============================================================================
#                             ITEM HANDLERS
#===============================================================================

ItemHandlers::UseText.add(:BICYCLE, proc { |item|
  next ($PokemonGlobal.using_normal_bike?) ? _INTL("Walk") : _INTL("Use")
})

ItemHandlers::UseFromBag.add(:BICYCLE, proc { |item|
  next (pbBikeCheck) ? 2 : 0
})

ItemHandlers::UseInField.add(:BICYCLE, proc { |item|
  if pbBikeCheck
    if $PokemonGlobal.using_normal_bike?
      pbDismountBike
    else
      pbDismountBike if $PokemonGlobal.bicycle
      pbMountBike(:NORMAL)
    end
    next true
  end
  next false
})

ItemHandlers::UseText.add(:ACROBIKE, proc { |item|
  next ($PokemonGlobal.using_acro_bike?) ? _INTL("Walk") : _INTL("Use")
})

ItemHandlers::UseFromBag.add(:ACROBIKE, proc { |item|
  next (pbBikeCheck) ? 2 : 0
})

ItemHandlers::UseInField.add(:ACROBIKE, proc { |item|
  if pbBikeCheck
    if $PokemonGlobal.using_acro_bike?
      pbDismountBike
    else
      pbDismountBike if $PokemonGlobal.bicycle
      pbMountAcroBike
    end
    next true
  end
  next false
})

#===============================================================================
#                            UTILITY FUNCTIONS
#===============================================================================

def pbIsOnAcroBike?
  return $PokemonGlobal.using_acro_bike?
end

def pbIsOnNormalBike?
  return $PokemonGlobal.using_normal_bike?
end

def pbIsOnAnyBike?
  return $PokemonGlobal.bicycle
end

def pbIsDoingWheelie?
  return $PokemonGlobal.acro_bike_state == :wheelie
end

def pbIsDoingFrontWheelie?
  return $PokemonGlobal.acro_bike_state == :front_wheelie
end

def pbIsDoingBunnyHop?
  return $game_player.instance_variable_get(:@bunny_hopping) == true
end

def pbIsDoingStationaryWheelie?
  return $game_player.instance_variable_get(:@wheelie_stationary) == true
end

def pbIsDoingSpeedBoost?
  return $game_player.instance_variable_get(:@speed_boost_active) == true
end

def pbCanBunnyHopIgnoreLedges?
  return AcroBikeSettings::BUNNY_HOP_IGNORE_LEDGES && pbIsOnAcroBike? && pbIsDoingBunnyHop?
end

def pbGetAcroBikeSpeed
  return nil if !pbIsOnAcroBike?
  
  if pbIsDoingSpeedBoost?
    return AcroBikeSettings::SPEED_BOOST_SPEED
  elsif pbIsDoingBunnyHop?
    return AcroBikeSettings::BUNNY_HOP_SPEED
  elsif pbIsDoingWheelie?
    return AcroBikeSettings::WHEELIE_SPEED
  else
    return AcroBikeSettings::ACRO_BIKE_SPEED
  end
end

def pbGetBikeType
  case $PokemonGlobal.bicycle_type
  when :NORMAL then return "Normal"
  when :ACRO then return "Acro"
  else return "None"
  end
end