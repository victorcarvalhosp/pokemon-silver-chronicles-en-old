#Main script
#==============================================================================#
# =====================  Apricorn Charm / Kurt Script ======================== #
#==============================================================================#
# Adds a Kurt - The Apricorn Ball Crafter, without all the event pages.
# Call with "apricornToBall"
class ApricornSettings
# Setting for how long it takes to change the Apricorn into selected Ball.
APRICORN_TO_BALL_TIME = 24
end

class KurtEventPage
  # ==========  Messages for easy modification ========== #
  def greet # Initial Greeting / Greeting for Apricorn to Ball.
    pbMessage(_INTL("Hello! I'm Kurt!"))
    pbMessage(_INTL("I specialize in turning Apricorns into Poke Balls."))
	pbMessage(_INTL("Which Apricorn would you like me to convert?"))
  end

  def stillMaking(count = 1) # Message for coming back when Ball isn't done yet.
	if count > 1
	  pbMessage(_INTL("Sorry, I'm still making them."))
	else
	  pbMessage(_INTL("Sorry, I'm still making it."))
	end
	pbMessage(_INTL("Come back later."))
  end
  
  def ballDone(count = 1) # Message for coming back after Ball is finished.
	pbMessage(_INTL("I've been waiting for you."))
	if count > 1
	  pbMessage(_INTL("I've completed the Poke Balls you asked me to make."))
	else
	  pbMessage(_INTL("I've completed the Poke Ball you asked me to make."))
	end
  end
  
  def noThanks
	pbMessage(_INTL("Let me know when you want me to convert an Apricorn for you."))
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
			if count > 1
			  pbMessage(_INTL("There's still {1} left on your Balls!", formatted_time_left))
			else
			  pbMessage(_INTL("There's still {1} left on your Ball!", formatted_time_left))
			end
	  else # Ball is not set.
		  greet
		  convert_apricorn
		  if $player.ball_for_apricorn
			  @@newRun = Time.now
			  resetTime = apricornToBallTime * 60 * 60
			  $player.next_run = @@newRun + resetTime
		  else
			noThanks
		  end
	  end
    end

  private
  
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

  def convert_apricorn
	ballForApricorn = pbChooseApricorn(8)
    if pbGet(8) == :NONE
    else
	  apricorn = ballForApricorn
      aprBall = @conversion_hash[apricorn]
	  apricorn_data = GameData::Item.get(apricorn)
      aprBall_data = GameData::Item.get(aprBall)
	  ret = pbConfirmMessage(_INTL("Do you want to change your #{apricorn_data.name} into a #{aprBall_data.name}?"))
	  if ret
		  max_qty = $bag.quantity(apricorn)
		  if max_qty <= 0
		    pbMessage(_INTL("You don't have any left."))
		    return
		  end
		  params = ChooseNumberParams.new
		  params.setRange(1, max_qty)
		  params.setInitialValue(1)
		  params.setCancelValue(0)
		  quantity = pbMessageChooseNumber(_INTL("How many do you want to convert? (You have {1}.)", max_qty), params)
		  if quantity <= 0
		    return
		  end
	  	  $player.ball_for_apricorn_count = quantity
	  	  $player.ball_for_apricorn = aprBall
		  $bag.remove(apricorn, quantity)
		  if quantity > 1
		    pbMessage(_INTL("Okay. I'll turn your {1} {2} into {1} {3} for you.", quantity, apricorn_data.name_plural, aprBall_data.name_plural))
		  else
		    pbMessage(_INTL("Okay. I'll turn your #{apricorn_data.name} into a #{aprBall_data.name} for you."))
		  end
		  pbMessage(_INTL("I should be finished by tomorrow."))
	   else
	   return nil
	  end
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