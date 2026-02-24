#Main script
#==============================================================================#
# =====================  Apricorn Charm / Kurt Script ======================== #
#==============================================================================#
# Adds a Kurt - The Apricorn Ball Crafter, without all the event pages.
# Call with "apricornToBall"
class ApricornSettings
# Setting for how long it takes to change the Apricorn into selected Ball.
APRICORN_TO_BALL_TIME = 1
# Event ID of the Kurt NPC on the map (for speech bubbles). Must match the event that calls apricornToBall.
KURT_EVENT_ID = 4
end

class KurtEventPage
  # ==========  Messages for easy modification ========== #
  def greet # Initial Greeting / Greeting for Apricorn to Ball.
    # Message codes: \f[path] = face graphic (under Graphics/Pictures/); \^ = wait for button; \pn = player name
    kurt_bub
	pbMessage(_INTL("\\f[faceKurt]\\bHi, \\pn!"))
    kurt_bub
    pbMessage(_INTL("\\f[faceKurt]\\bIf you like, I can convert one of yours Apricorns into a Poké Ball."))
    kurt_bub
    return false unless pbConfirmMessage(_INTL("\\f[faceKurt]\\bDo you have an Apricorn for me?"))
    kurt_bub
    pbMessage(_INTL("\\f[faceKurt]\\bWhich Apricorn would you like me to convert?"))
    true
  end

  def stillMaking(count = 1) # Message for coming back when Ball isn't done yet.
	if count > 1
	  kurt_bub
	  pbMessage(_INTL("\\f[faceKurt]\\bSorry, I'm still making them."))
	else
	  kurt_bub
	  pbMessage(_INTL("\\f[faceKurt]\\bSorry, I'm still making it."))
	end
	kurt_bub
	pbMessage(_INTL("\\f[faceKurt]\\bCome back later."))
  end
  
  def ballDone(count = 1) # Message for coming back after Ball is finished.
	kurt_bub
	pbMessage(_INTL("\\f[faceKurt]\\bI've been waiting for you."))
	if count > 1
	  kurt_bub
	  pbMessage(_INTL("\\f[faceKurt]\\bI've completed the Poke Balls you asked me to make."))
	else
	  kurt_bub
	  pbMessage(_INTL("\\f[faceKurt]\\bI've completed the Poke Ball you asked me to make."))
	end
  end
  
  def noThanks
	kurt_bub
	pbMessage(_INTL("\\f[faceKurt]\\bLet me know when you want me to convert an Apricorn for you."))
	return
  end
  
  # ==========  End Messages ========== #
  
  def initialize
    ballForApricorn ||= nil
    @@newRun ||= Time.now
    $player.ball_for_apricorn ||= nil
	$player.ball_for_apricorn_count ||= 1
	$player.next_run ||= 0
    @conversion_hash = {
      :REDAPRICORN    => :LEVELBALL,
      :YELLOWAPRICORN => :MOONBALL,
      :BLUEAPRICORN   => :LUREBALL,
      :GREENAPRICORN  => :FRIENDBALL,
      :PINKAPRICORN   => :LOVEBALL,
      :WHITEAPRICORN  => :FASTBALL,
      :BLACKAPRICORN  => :HEAVYBALL,
      :YLWAPRICORN    => :MOONBALL,
      :BLUAPRICORN    => :LUREBALL,
      :GRNAPRICORN    => :FRIENDBALL,
      :PNKAPRICORN    => :LOVEBALL,
      :WHTAPRICORN    => :FASTBALL,
      :BLKAPRICORN    => :HEAVYBALL
    }
  end

  def call
   timeNow = Time.now
   apricornToBallTime = ApricornSettings::APRICORN_TO_BALL_TIME
	$player.next_run ||= @@newRun + apricornToBallTime * 60 * 60
      if $player.ball_for_apricorn.is_a?(Symbol) && timeNow >= $player.next_run # Ball is set and done.
		count = $player.ball_for_apricorn_count || 1
		ballDone(count)
		pbReceiveItem($player.ball_for_apricorn, count)
		$player.ball_for_apricorn = nil
		$player.ball_for_apricorn_count = nil
		@@newRun = 0
	  elsif $player.ball_for_apricorn.is_a?(Symbol) && timeNow <= $player.next_run # Ball is set and not done.
		  count = $player.ball_for_apricorn_count || 1
		  stillMaking(count)
		  timeLeft = $player.next_run - timeNow
			formatted_time_left = format_time(timeLeft)
			ball_name = GameData::Item.get($player.ball_for_apricorn).name
			ball_name_plural = GameData::Item.get($player.ball_for_apricorn).name_plural
			if count > 1
			  kurt_bub
			  pbMessage(_INTL("\\f[faceKurt]\\bThere's still {1} left before your {2} are ready!", formatted_time_left, ball_name_plural))
			else
			  kurt_bub
			  pbMessage(_INTL("\\f[faceKurt]\\bThere's still {1} left before your {2} is ready!", formatted_time_left, ball_name))
			end
	  else # Ball is not set.
		  if greet
			  convert_apricorn
			  if $player.ball_for_apricorn
				  @@newRun = Time.now
				  resetTime = apricornToBallTime * 60 * 60
				  $player.next_run = @@newRun + resetTime
			  else
				noThanks
			  end
		  else
			noThanks
		  end
	  end
    end

  private

  # Sets Carmaniac's Speech Bubble to show the next message on Kurt's event.
  # pbCallBub only works when run from the event (it uses get_character from the interpreter);
  # from script we set the same $game_temp vars using KURT_EVENT_ID directly.
  def kurt_bub(type = 2, position = 0)
    return if !$game_temp.respond_to?(:speechbubble_talking)
    $game_temp.speechbubble_follower_event = nil
    $game_temp.speechbubble_talking = ApricornSettings::KURT_EVENT_ID
    $game_temp.speechbubble_bubble = type
    $game_temp.speechbubble_position = position
  end
  
  def format_time(seconds)
	hours, remainder = seconds.divmod(3600)
	minutes, seconds = remainder.divmod(60)
	seconds = seconds.to_i
	formatted_time = []
	formatted_time << "#{hours} hour(s)" if hours > 0
	formatted_time << "#{minutes} minute(s)" if minutes > 0
	formatted_time << "#{seconds} second(s)" if seconds > 0
	formatted_time.join(' ')
  end

  # Opens the bag filtered to apricorns; when the player selects an apricorn,
  # asks for quantity in the same bag UI, then returns [item, quantity] or [nil, 1].
  # Uses only the Scene (with filter) so the bag is never reopened unfiltered.
  def choose_apricorn_and_quantity
    ret_item = nil
    ret_qty = 1
    apricorn_filter = proc { |item| GameData::Item.get(item).is_apricorn? }
    oldlastpocket = $bag.last_viewed_pocket
    oldchoices = $bag.last_pocket_selections.clone
    $bag.reset_last_selections
    pbFadeOutIn {
      scene = PokemonBag_Scene.new
      scene.pbStartScene($bag, true, apricorn_filter)
      item = scene.pbChooseItem
      if item
        qty = $bag.quantity(item)
        if qty > 1
          qty = scene.pbChooseNumber(_INTL("How many do you want to convert?"), qty)
        end
        if qty > 0
          ret_item = item
          ret_qty = qty
        end
      end
      scene.pbEndScene
    }
    $bag.last_viewed_pocket = oldlastpocket
    $bag.last_pocket_selections = oldchoices
    $game_variables[8] = ret_item || :NONE
    [ret_item, ret_qty]
  end

  def convert_apricorn
    apricorn, quantity = choose_apricorn_and_quantity
    if !apricorn || pbGet(8) == :NONE
      return
    end
    aprBall = @conversion_hash[apricorn]
    apricorn_data = GameData::Item.get(apricorn)
    aprBall_data = GameData::Item.get(aprBall)
    ret = pbConfirmMessage(_INTL("\\f[faceKurt]\\bDo you want to turn your #{apricorn_data.name} into a #{aprBall_data.name}?"))
    if ret
      max_qty = $bag.quantity(apricorn)
      if max_qty <= 0
        pbMessage(_INTL("You don't have any left."))
        return
      end
      if quantity > max_qty
        quantity = max_qty
      end
      $player.ball_for_apricorn_count = quantity
      $player.ball_for_apricorn = aprBall
      $bag.remove(apricorn, quantity)
      if quantity > 1
        pbMessage(_INTL("\\f[faceKurt]\\bOkay. I'll turn your {1} {2} into {1} {3} for you.", quantity, apricorn_data.name_plural, aprBall_data.name_plural))
      else
        pbMessage(_INTL("\\f[faceKurt]\\bOkay. I'll turn your #{apricorn_data.name} into a #{aprBall_data.name} for you."))
      end
      pbMessage(_INTL("\\f[faceKurt]\\bI should be finished very soon."))
    else
      return nil
    end
  end
end

def apricornToBall
	apricorn_guy ||= KurtEventPage.new
	apricorn_guy.call
end

	class Player
	  attr_accessor :ball_for_apricorn
	  attr_accessor :ball_for_apricorn_count
	  attr_accessor :next_run
	end