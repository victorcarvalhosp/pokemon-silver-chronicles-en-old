// Port of Data/Scripts/011_Battle/002_Battler/003_Battler_ChangeSelf.rb, with:
// - v20.1 Hotfixes (Battle bug fixes.rb:451): pbRecoverHPFromDrain (Liquid Ooze
//   works even if its bearer fainted).
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb): pbChangeTypes
//   (Double Shock, Protean/Libero), pbResetTypes, pbCheckFormOnWeatherChange
//   (Protosynthesis), pbFaint (Commander, fainted ally count), pbTransform.
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb): pbReducePP
//   (redefined), display_base_moves, pbCheckFormOnHeldItemChange;
//   ([002] Battle Deluxe/Midbattle_Triggers.rb:329): pbFaint (midbattle
//   triggers, raid-style capture); ([002] Battle Deluxe/Battle_Deluxe.rb:425):
//   pbRaidStyleCapture, wild_boss_flee.
// - ZUD Mechanics ([004] Battle_Battler/Battler_Overrides.rb): pbReduceHP,
//   pbRecoverHP, pbRecoverHPFromDrain (Dynamax HP), pbFaint (un-Dynamax,
//   un-Ultra Burst), pbTransform. ([004] Battle_Battler/Battler_MoveConversion.rb
//   is in ../zud/Battler_MoveConversion.ts.)
// Alias chains: pbReduceHP/pbRecoverHP = ZUD( core );
//   pbRecoverHPFromDrain = ZUD( Hotfixes ); pbChangeTypes/pbResetTypes/
//   pbCheckFormOnWeatherChange = Gen 9( core ); pbFaint = ZUD( Deluxe( Gen 9( core ) ) );
//   pbTransform = ZUD( Gen 9( core ) ); pbReducePP = Deluxe (replaces core).

import { _INTL, type Id } from "../../data/gameData/gameData";
import { MapMetadata } from "../../data/gameData/mapMetadata";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import { Type } from "../../data/gameData/type";
import { G } from "../../game/globals";
import { PokemonMove } from "../../game/pokemon/PokemonMove";
import { Move } from "../move/Move";
import { AbilityEffects } from "../other/AbilityEffects";
import { PBDebug } from "../other/PBDebug";
import { PBEffects } from "../other/PBEffects";
import { rubyRound } from "../rubyMath";
import { Battler } from "./Battler";

/** Essentials Deluxe's $game_temp.dx_rules (not declared on GameTemp). */
function dxRules(): Record<string, unknown> | null {
  return (G.gameTemp as unknown as { dxRules?: Record<string, unknown> | null }).dxRules ?? null;
}

/** Ruby's nil_or_empty?(msg) */
function nilOrEmpty(msg: string | null | undefined): boolean {
  return msg == null || msg === "";
}

/** Core Essentials' pbFaint (the innermost method of the alias chain). */
async function faintCore(b: Battler, showMessage: boolean): Promise<void> {
  const battle = b.battle;
  if (!b.fainted()) {
    PBDebug.log("!!!***Can't faint with HP greater than 0");
    return;
  }
  if (b.faintedProperly) return; // Has already fainted properly
  if (showMessage) await battle.pbDisplayBrief(_INTL("{1} fainted!", b.pbThis()));
  if (!showMessage) PBDebug.log(`[Pokémon fainted] ${b.pbThis()} (${b.index})`);
  await battle.scene.pbFaintBattler(b);
  if (b.opposes()) battle.pbSetDefeated(b);
  b.pbInitEffects(false);
  // Reset status
  b.status = "NONE";
  b.statusCount = 0;
  // Lose happiness
  if (b.pokemon && battle.internalBattle) {
    const badLoss = battle.allOtherSideBattlers(b.index).some((ob) => ob.level >= b.level + 30);
    b.pokemon.changeHappiness(badLoss ? "faintbad" : "faint");
  }
  // Reset form
  // NOTE: Ruby indexes usedInBattle with @index / 2 (not @pokemonIndex).
  battle.peer.pbOnLeavingBattle(battle, b.pokemon,
    battle.usedInBattle[b.idxOwnSide()]![Math.floor(b.index / 2)] ?? false);
  if (b.mega()) b.pokemon!.makeUnmega();
  if (b.primal()) b.pokemon!.makeUnprimal();
  // Do other things
  battle.pbClearChoice(b.index); // Reset choice
  b.pbOwnSide().effects[PBEffects.LastRoundFainted] = battle.turnCount;
  const gameTemp = G.gameTemp as unknown as { partyDirectDamageTaken?: number[] | null };
  if (gameTemp.partyDirectDamageTaken &&
      gameTemp.partyDirectDamageTaken[b.pokemonIndex] != null &&
      b.pbOwnedByPlayer()) {
    gameTemp.partyDirectDamageTaken[b.pokemonIndex] = 0;
  }
  // Check other battlers' abilities that trigger upon a battler fainting
  await b.pbAbilitiesOnFainting();
  // Check for end of primordial weather
  await battle.pbEndPrimordialWeather();
}

/** Generation 9 Pack's pbFaint (wraps core): ends Commander, counts fainted allies. */
async function faintGen9(b: Battler, showMessage: boolean): Promise<void> {
  let commanderMsg: string | null = null;
  let batSprite: { visible: boolean } | undefined;
  const commander = b.effects[PBEffects.Commander] as number[] | null;
  if (commander) {
    const pairedBattler = b.battle.battlers[commander[0]!]!;
    // Ruby: @battle.scene.sprites["pokemon_#{pairedBattler.index}"] (IBattleScene has no sprites).
    batSprite = (b.battle.scene as unknown as { sprites?: Record<string, { visible: boolean } | undefined> })
      .sprites?.[`pokemon_${pairedBattler.index}`];
    let order: [string, string];
    if (b.isCommander()) {
      order = [b.pbThis(), pairedBattler.pbThis(true)];
    } else {
      order = [pairedBattler.pbThis(), b.pbThis(true)];
      pairedBattler.effects[PBEffects.Commander] = null;
    }
    commanderMsg = _INTL("{1} comes out of {2}'s mouth!", ...order);
  }
  await faintCore(b, showMessage);
  b.battle.pbAddFaintedAlly(b);
  if (commanderMsg) {
    await b.battle.pbDisplay(commanderMsg);
    if (batSprite) batSprite.visible = true;
  }
}

/** Core Essentials' pbTransform (the innermost method of the alias chain). */
async function transformCore(b: Battler, target: Battler): Promise<void> {
  const oldAbil = b.abilityId;
  b.effects[PBEffects.Transform] = true;
  b.effects[PBEffects.TransformSpecies] = target.species;
  b.pbChangeTypes(target);
  b.ability = target.ability;
  b.attack = target.attack;
  b._defense = target.defense;
  b.spatk = target.spatk;
  b._spdef = target.spdef;
  b.speed = target.speed;
  for (const s of Stat.eachBattle()) b.stages[s.id] = target.stages[s.id]!;
  if (Settings.NEW_CRITICAL_HIT_RATE_MECHANICS) {
    b.effects[PBEffects.FocusEnergy] = target.effects[PBEffects.FocusEnergy];
    b.effects[PBEffects.LaserFocus] = target.effects[PBEffects.LaserFocus];
  }
  b.moves.length = 0;
  target.moves.forEach((m, i) => {
    b.moves[i] = Move.fromPokemonMove(b.battle, new PokemonMove(m.id));
    b.moves[i]!.pp = 5;
    b.moves[i]!.setTotalPp(5);
  });
  b.effects[PBEffects.Disable] = 0;
  b.effects[PBEffects.DisableMove] = null;
  b.effects[PBEffects.WeightChange] = target.effects[PBEffects.WeightChange];
  b.battle.scene.pbRefreshOne(b.index);
  await b.battle.pbDisplay(_INTL("{1} transformed into {2}!", b.pbThis(), target.pbThis(true)));
  await b.pbOnLosingAbility(oldAbil);
}

const methods = {
  //=============================================================================
  // Change HP
  //=============================================================================
  /**
   * ZUD Mechanics: all effects that lower HP ignore any increased scaling for
   * Dynamax Pokemon HP, except for specific situations where it is otherwise
   * flagged (ignoreDynamax), such as with direct attacks, or set damage as with
   * the move Pain Split.
   */
  async pbReduceHP(this: Battler, amt: number, anim = true, registerDamage = true, anyAnim = true): Promise<number> {
    // ZUD Mechanics
    if (this.dynamax() && !this.ignoreDynamax) amt = amt / this.dynamaxBoost()!;
    // Essentials
    amt = rubyRound(amt);
    if (amt > this._hp) amt = this._hp;
    if (amt < 1 && !this.fainted()) amt = 1;
    const oldHP = this._hp;
    this.hp -= amt;
    if (amt > 0) PBDebug.log(`[HP change] ${this.pbThis()} lost ${amt} HP (${oldHP}=>${this._hp})`);
    if (this._hp < 0) throw new Error(_INTL("HP less than 0"));
    if (this._hp > this.totalhp) throw new Error(_INTL("HP greater than total HP"));
    if (anyAnim && amt > 0) await this.battle.scene.pbHPChanged(this, oldHP, anim);
    if (amt > 0 && registerDamage) {
      const half = Math.floor(this.totalhp / 2);
      if (this._hp < half && this._hp + amt >= half) this.droppedBelowHalfHP = true;
      this.tookDamageThisRound = true;
    }
    // ZUD Mechanics
    this.ignoreDynamax = false;
    return amt;
  },

  /**
   * ZUD Mechanics: all effects that heal HP always scale down their healing for
   * Dynamax Pokemon, except for specific situations where it is otherwise
   * flagged (ignoreDynamax), such as items that heal a set amount of HP, such
   * as Oran Berry or Berry Juice.
   */
  async pbRecoverHP(this: Battler, amt: number, anim = true, anyAnim = true): Promise<number> {
    // ZUD Mechanics
    if (this.dynamax() && !this.ignoreDynamax) amt = amt / this.dynamaxBoost()!;
    // Essentials
    amt = rubyRound(amt);
    if (amt > this.totalhp - this._hp) amt = this.totalhp - this._hp;
    if (amt < 1 && this._hp < this.totalhp) amt = 1;
    const oldHP = this._hp;
    this.hp += amt;
    if (amt > 0) PBDebug.log(`[HP change] ${this.pbThis()} gained ${amt} HP (${oldHP}=>${this._hp})`);
    if (this._hp < 0) throw new Error(_INTL("HP less than 0"));
    if (this._hp > this.totalhp) throw new Error(_INTL("HP greater than total HP"));
    if (anyAnim && amt > 0) await this.battle.scene.pbHPChanged(this, oldHP, anim);
    if (this._hp >= Math.floor(this.totalhp / 2)) this.droppedBelowHalfHP = false;
    // ZUD Mechanics
    this.ignoreDynamax = false;
    return amt;
  },

  /**
   * v20.1 Hotfixes: Liquid Ooze oozes drained HP even if its bearer fainted from
   * that draining (hasActiveAbility?(:LIQUIDOOZE, true)).
   * ZUD Mechanics: drained HP ignores Dynamax HP scaling.
   * NOTE: If canHeal? is false, ZUD's @ignore_dynamax stays true until the next
   *       HP change (as in Ruby).
   */
  async pbRecoverHPFromDrain(this: Battler, amt: number, target: Battler, msg: string | null = null): Promise<void> {
    // ZUD Mechanics
    this.ignoreDynamax = true;
    // v20.1 Hotfixes
    if (target.hasActiveAbility("LIQUIDOOZE", true)) {
      await this.battle.pbShowAbilitySplash(target);
      await this.pbReduceHP(amt);
      await this.battle.pbDisplay(_INTL("{1} sucked up the liquid ooze!", this.pbThis()));
      await this.battle.pbHideAbilitySplash(target);
      await this.pbItemHPHealCheck();
    } else {
      if (nilOrEmpty(msg)) msg = _INTL("{1} had its energy drained!", target.pbThis());
      await this.battle.pbDisplay(msg!);
      if (this.canHeal()) {
        if (this.hasActiveItem("BIGROOT")) amt = Math.floor(amt * 1.3);
        await this.pbRecoverHP(amt);
      }
    }
  },

  /** onHPLost is Ruby's block (`yield hp_lost if block_given?`): shows a message. */
  async pbTakeEffectDamage(this: Battler, amt: number, showAnim = true,
    onHPLost?: (hpLost: number) => unknown): Promise<void> {
    this.droppedBelowHalfHP = false;
    const hpLost = await this.pbReduceHP(amt, showAnim);
    if (onHPLost) await onHPLost(hpLost); // Show message
    await this.pbItemHPHealCheck();
    await this.pbAbilitiesOnDamageTaken();
    if (this.fainted()) await this.pbFaint();
    this.droppedBelowHalfHP = false;
  },

  /**
   * pbFaint — ZUD( Essentials Deluxe( Generation 9 Pack( core ) ) ).
   * withTriggers (Essentials Deluxe) is whether midbattle triggers run.
   */
  async pbFaint(this: Battler, showMessage = true, withTriggers = true): Promise<void> {
    // --- ZUD Mechanics: KO'd Pokemon properly un-Dynamax and un-Ultra Burst ---
    if (this.faintedProperly || !this.fainted()) return;
    if (this.dynamax()) await this.unmax();
    // --- Essentials Deluxe ---
    if (!this.faintedProperly) {
      const rules = dxRules();
      const raidcapture = rules && Object.keys(rules).length > 0 ? rules.raidcapture : null;
      if (!this.pbOwnedByPlayer() && raidcapture && this.battle.wildBattle() && this.battle.decision === 0) {
        this.hp += 1;
        const params = rules!.raidcapture as unknown[];
        await this.pbRaidStyleCapture(this, (params[2] as number | null) || 0,
          (params[0] as string | null) ?? null, (params[1] as string | null) ?? null);
      } else {
        // --- Generation 9 Pack( core ) ---
        await faintGen9(this, showMessage);
        // --- Essentials Deluxe: midbattle triggers ---
        if (withTriggers && this.fainted()) {
          let triggers: string[];
          if (this.battle.pbAllFainted(this.index)) {
            triggers = ["faintedLast", "faintedLast" + this.species];
            for (const t of this.pokemon!.types()) triggers.push("faintedLast" + t);
          } else {
            triggers = ["fainted", "fainted" + this.species];
            for (const t of this.pokemon!.types()) triggers.push("fainted" + t);
          }
          await this.battle.scene.pbDeluxeTriggers?.(this, null, triggers);
        }
      }
    }
    // --- ZUD Mechanics ---
    if (this.ultra()) this.pokemon!.makeUnUltra();
    // Deferred: raid_KOCounter(self.pbDirectOpposing) if @battle.raid_battle (ZUD Mechanics/[004] Battle_Battler/Battler_Overrides.rb:157)
  },

  //=============================================================================
  // Essentials Deluxe ([002] Battle Deluxe/Battle_Deluxe.rb:425): raid-style
  // capture with the [:raidcapture] rule.
  //=============================================================================
  /**
   * pbRaidStyleCapture: instead of fainting, the wild Pokémon offers itself
   * to be caught (Catch: pick a Poké Ball from the Bag; with a chance, the
   * catch is decided by it through the [:setcapture] rule) or flees.
   */
  async pbRaidStyleCapture(this: Battler, target: Battler, chance = 0, msg: string | null = null,
    bgm: string | null = null): Promise<void> {
    if (this.battle.pbAllFainted()) return;
    if (this.battle.raidBattle && target.effects[PBEffects.KnockOutCount] <= 0) return;
    let faintedCount = 0;
    for (const b of this.battle.battlers) {
      if (!b || !b.opposes(target) || b.hp > 0) continue;
      faintedCount += 1;
    }
    if (faintedCount >= this.battle.pbSideSize(0)) return;
    // (UI modules loaded on use: the battle core runs headless in tests)
    const { pbBGMFade, pbBGMPlay, pbPlayDecisionSE, resolveAudio } = await import("../../game/GameSystem");
    const { pbWait } = await import("../../ui/scenes/frames");
    if (resolveAudio(bgm)) {
      pbBGMFade(0.2);
      await pbWait(Math.round(0.2 * 60));
      pbBGMPlay(bgm);
    }
    await this.battle.pbDisplayPaused(_INTL("{1} is weak!\nThrow a Poké Ball now!", target.name));
    await pbWait(30);
    let cmd = 0;
    cmd = await this.battle.pbShowCommands("", ["Catch", "Don't Catch"], 1);
    switch (cmd) {
      case 0:
        pbPlayDecisionSE();
        this.battle.sendToBoxes = 1;
        if (G.storage.full()) {
          await this.battle.pbDisplay(_INTL("But there is no room left in the PC!"));
          await target.wildBossFlee(msg);
        } else {
          let ball: Id | null = null;
          const { PokemonBag_Scene, PokemonBagScreen } = await import("../../ui/bag/bag");
          const { pbFadeOutIn } = await import("../../ui/fades");
          const { Item } = await import("../../data/gameData/item");
          await pbFadeOutIn(async () => {
            const scene = new PokemonBag_Scene();
            const screen = new PokemonBagScreen(scene, G.bag);
            ball = await screen.pbChooseItemScreen((item) => Item.get(item).isPokeBall());
          });
          if (ball) {
            G.bag.remove(ball, 1);
            if (chance > 0) {
              const r = this.battle.pbRandom(100);
              // ($DEBUG && Input.press?(Input::CTRL): $DEBUG is off)
              const capture = r < chance || ball === "MASTERBALL";
              dxRules()!.setcapture = capture;
            }
            await this.battle.pbThrowPokeBall(target.index, ball);
            if (this.battle.pokeBallFailed) await target.wildBossFlee(msg);
          } else {
            await target.wildBossFlee(msg);
          }
        }
        break;
      default:
        pbPlayDecisionSE();
        await target.wildBossFlee(msg);
    }
  },

  /** wild_boss_flee */
  async wildBossFlee(this: Battler, msg: string | null = null): Promise<void> {
    await this.battle.scene.pbBattlerFlee?.(this, msg);
    this._hp = 0;
    this.pbInitEffects(false);
    this._status = "NONE";
    this._statusCount = 0;
    this.battle.pbClearChoice(this.index);
    if (this.battle.pbAbleCount(this.index) > 1) {
      await this.battle.pbEndPrimordialWeather();
      this.battle.pbRemoveFromParty(this.index, this.pokemonIndex);
    } else {
      this.battle.decision = 1;
    }
  },

  //=============================================================================
  // Move PP
  //=============================================================================
  pbSetPP(this: Battler, move: Move, pp: number): void {
    move.pp = pp;
    // No need to care about @effects[PBEffects::Mimic], since Mimic can't copy
    // Mimic
    if (move.realMove && move.id === move.realMove.id && !this.effects[PBEffects.Transform]) {
      move.realMove.pp = pp;
    }
  },

  /** Essentials Deluxe (Battle_Misc.rb:45): also reduces the base move's PP when using a Power Move. */
  pbReducePP(this: Battler, move: Move): boolean {
    if (this.usingMultiTurnAttack()) return true;
    if (move.pp < 0) return true; // Don't reduce PP for special calls of moves
    if (move.totalPp() <= 0) return true; // Infinite PP, can always be used
    if (move.pp === 0) return false; // Ran out of PP, couldn't reduce
    if (move.pp > 0) {
      this.pbSetPP(move, move.pp - 1);
      // PluginManager.installed?("ZUD Mechanics") is true
      if (move.powerMove()) {
        const c = this.powerIndex;
        const baseMove = this.baseMoves.at(c) as Move; // .at: Ruby's @base_moves[-1] when power_index is -1
        this.pbSetPP(baseMove, baseMove.pp - 1);
      }
      // PluginManager.installed?("PLA Battle Styles") is false (mastered moves in a style)
    }
    return true;
  },

  pbReducePPOther(this: Battler, move: Move): void {
    if (move.pp > 0) this.pbSetPP(move, move.pp - 1);
  },

  /**
   * display_base_moves — Essentials Deluxe (Battle_Misc.rb:66): reverts to base
   * moves. Used by plugins that change moves mid-battle.
   */
  displayBaseMoves(this: Battler): void {
    if (this.baseMoves.length === 0) return;
    for (let i = 0; i < this.moves.length; i++) {
      const baseMove = this.baseMoves[i];
      if (!baseMove) continue;
      if (baseMove instanceof Move) {
        this.moves[i] = baseMove;
      } else {
        this.moves[i] = Move.fromPokemonMove(this.battle, baseMove);
      }
    }
    this.baseMoves.length = 0;
  },

  // ZUD Mechanics ([004] Battle_Battler/Battler_MoveConversion.rb): converting
  // the user's moves into Power Moves (display_power_moves, convert_zmove,
  // convert_maxmove, calc_power_move) is in ../zud/Battler_MoveConversion.ts.

  //=============================================================================
  // Change type
  //=============================================================================
  /** Generation 9 Pack: ends Double Shock and triggers Protean/Libero. */
  pbChangeTypes(this: Battler, newType: Id | Battler): void {
    if (newType instanceof Battler) {
      const newTypes = newType.pbTypes();
      if (newTypes.length === 0) newTypes.push("NORMAL");
      let newType3 = newType.effects[PBEffects.Type3] as Id | null;
      if (newType3 != null && newTypes.includes(newType3)) newType3 = null;
      this.types = [...newTypes];
      this.effects[PBEffects.Type3] = newType3;
    } else {
      const typeId = Type.get(newType).id;
      this.types = [typeId];
      this.effects[PBEffects.Type3] = null;
    }
    this.effects[PBEffects.BurnUp] = false;
    this.effects[PBEffects.Roost] = false;
    // Generation 9 Pack
    this.effects[PBEffects.DoubleShock] = false;
    if (this.abilityActive() && this.proteanTrigger) { // Protean/Libero
      // NOTE: newType can be a battler (Transform/Reflect Type), as in Ruby.
      AbilityEffects.triggerOnTypeChange(this.ability, this, newType as Id);
    }
  },

  pbResetTypes(this: Battler): void {
    this.types = this.pokemon!.types();
    this.effects[PBEffects.Type3] = null;
    this.effects[PBEffects.BurnUp] = false;
    this.effects[PBEffects.Roost] = false;
    // Generation 9 Pack
    this.effects[PBEffects.DoubleShock] = false;
  },

  //=============================================================================
  // Forms
  //=============================================================================
  async pbChangeForm(this: Battler, newForm: number, msg: string | null): Promise<void> {
    if (this.fainted() || this.effects[PBEffects.Transform] || this.form === newForm) return;
    const oldForm = this.form;
    const oldDmg = this.totalhp - this._hp;
    this.form = newForm;
    this.pbUpdate(true);
    this._hp = this.totalhp - oldDmg;
    if (Settings.MECHANICS_GENERATION_AT_RUNTIME >= 6) this.effects[PBEffects.WeightChange] = 0;
    this.battle.scene.pbChangePokemon(this, this.pokemon!);
    this.battle.scene.pbRefreshOne(this.index);
    if (msg && msg !== "") await this.battle.pbDisplay(msg);
    PBDebug.log(`[Form changed] ${this.pbThis()} changed from form ${oldForm} to form ${newForm}`);
    this.battle.pbSetSeen(this);
  },

  async pbCheckFormOnStatusChange(this: Battler): Promise<void> {
    if (this.fainted() || this.effects[PBEffects.Transform]) return;
    // Shaymin - reverts if frozen
    if (this.isSpecies("SHAYMIN") && this.frozen()) {
      await this.pbChangeForm(0, _INTL("{1} transformed!", this.pbThis()));
    }
  },

  async pbCheckFormOnMovesetChange(this: Battler): Promise<void> {
    if (this.fainted() || this.effects[PBEffects.Transform]) return;
    // Keldeo - knowing Secret Sword
    if (this.isSpecies("KELDEO")) {
      let newForm = 0;
      if (this.pbHasMove("SECRETSWORD")) newForm = 1;
      await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
    }
  },

  /** Generation 9 Pack: Protosynthesis checks whenever weather is changed. */
  async pbCheckFormOnWeatherChange(this: Battler, abilityChanged = false): Promise<void> {
    // Generation 9 Pack
    if (this.hasActiveAbility("PROTOSYNTHESIS")) {
      await AbilityEffects.triggerOnSwitchIn(this.ability, this, this.battle, false);
    }
    // Essentials
    if (this.fainted() || this.effects[PBEffects.Transform]) return;
    // Castform - Forecast
    if (this.isSpecies("CASTFORM")) {
      if (this.hasActiveAbility("FORECAST")) {
        let newForm = 0;
        switch (this.effectiveWeather()) {
          case "Sun": case "HarshSun": newForm = 1; break;
          case "Rain": case "HeavyRain": newForm = 2; break;
          case "Hail": newForm = 3; break;
        }
        if (this.form !== newForm) {
          await this.battle.pbShowAbilitySplash(this, true);
          await this.battle.pbHideAbilitySplash(this);
          await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
        }
      } else {
        await this.pbChangeForm(0, _INTL("{1} transformed!", this.pbThis()));
      }
    }
    // Cherrim - Flower Gift
    if (this.isSpecies("CHERRIM")) {
      if (this.hasActiveAbility("FLOWERGIFT")) {
        let newForm = 0;
        if (["Sun", "HarshSun"].includes(this.effectiveWeather())) newForm = 1;
        if (this.form !== newForm) {
          await this.battle.pbShowAbilitySplash(this, true);
          await this.battle.pbHideAbilitySplash(this);
          await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
        }
      } else {
        await this.pbChangeForm(0, _INTL("{1} transformed!", this.pbThis()));
      }
    }
    // Eiscue - Ice Face
    if (!abilityChanged && this.isSpecies("EISCUE") && this.abilityId === "ICEFACE" &&
        this.form === 1 && this.effectiveWeather() === "Hail") {
      this.canRestoreIceFace = true; // Changed form at end of round
    }
  },

  /**
   * Checks the Pokémon's form and updates it if necessary. Used for when a
   * Pokémon enters battle (endOfRound=false) and at the end of each round
   * (endOfRound=true).
   */
  async pbCheckForm(this: Battler, endOfRound = false): Promise<void> {
    if (this.fainted() || this.effects[PBEffects.Transform]) return;
    // Form changes upon entering battle and when the weather changes
    if (!endOfRound) await this.pbCheckFormOnWeatherChange();
    // Darmanitan - Zen Mode
    if (this.isSpecies("DARMANITAN") && this.abilityId === "ZENMODE") {
      if (this._hp <= Math.floor(this.totalhp / 2)) {
        if (this.form % 2 === 0) {
          await this.battle.pbShowAbilitySplash(this, true);
          await this.battle.pbHideAbilitySplash(this);
          await this.pbChangeForm(this.form + 1, _INTL("{1} triggered!", this.abilityName()));
        }
      } else if (this.form % 2 === 1) {
        await this.battle.pbShowAbilitySplash(this, true);
        await this.battle.pbHideAbilitySplash(this);
        await this.pbChangeForm(this.form - 1, _INTL("{1} triggered!", this.abilityName()));
      }
    }
    // Minior - Shields Down
    if (this.isSpecies("MINIOR") && this.abilityId === "SHIELDSDOWN") {
      if (this._hp > Math.floor(this.totalhp / 2)) { // Turn into Meteor form
        const newForm = this.form >= 7 ? this.form - 7 : this.form;
        if (this.form !== newForm) {
          await this.battle.pbShowAbilitySplash(this, true);
          await this.battle.pbHideAbilitySplash(this);
          await this.pbChangeForm(newForm, _INTL("{1} deactivated!", this.abilityName()));
        } else if (!endOfRound) {
          await this.battle.pbDisplay(_INTL("{1} deactivated!", this.abilityName()));
        }
      } else if (this.form < 7) { // Turn into Core form
        await this.battle.pbShowAbilitySplash(this, true);
        await this.battle.pbHideAbilitySplash(this);
        await this.pbChangeForm(this.form + 7, _INTL("{1} activated!", this.abilityName()));
      }
    }
    // Wishiwashi - Schooling
    if (this.isSpecies("WISHIWASHI") && this.abilityId === "SCHOOLING") {
      if (this._level >= 20 && this._hp > Math.floor(this.totalhp / 4)) {
        if (this.form !== 1) {
          await this.battle.pbShowAbilitySplash(this, true);
          await this.battle.pbHideAbilitySplash(this);
          await this.pbChangeForm(1, _INTL("{1} formed a school!", this.pbThis()));
        }
      } else if (this.form !== 0) {
        await this.battle.pbShowAbilitySplash(this, true);
        await this.battle.pbHideAbilitySplash(this);
        await this.pbChangeForm(0, _INTL("{1} stopped schooling!", this.pbThis()));
      }
    }
    // Zygarde - Power Construct
    if (this.isSpecies("ZYGARDE") && this.abilityId === "POWERCONSTRUCT" && endOfRound &&
        this._hp <= Math.floor(this.totalhp / 2) && this.form < 2) { // Turn into Complete Forme
      const newForm = this.form + 2;
      await this.battle.pbDisplay(_INTL("You sense the presence of many!"));
      await this.battle.pbShowAbilitySplash(this, true);
      await this.battle.pbHideAbilitySplash(this);
      await this.pbChangeForm(newForm, _INTL("{1} transformed into its Complete Forme!", this.pbThis()));
    }
    // Morpeko - Hunger Switch
    if (this.isSpecies("MORPEKO") && this.hasActiveAbility("HUNGERSWITCH") && endOfRound) {
      // Intentionally doesn't show the ability splash or a message
      const newForm = (this.form + 1) % 2;
      await this.pbChangeForm(newForm, null);
    }
  },

  /**
   * Essentials Deluxe (Battle_Misc.rb:82): checks for form changes upon changing
   * the battler's held item.
   * NOTE: Zacian/Zamazenta swap Iron Head and Behemoth Blade/Bash based on the
   *       form before the change, even when the form doesn't change (as in Ruby).
   */
  async pbCheckFormOnHeldItemChange(this: Battler): Promise<void> {
    if (this.fainted() || this.effects[PBEffects.Transform]) return;
    //---------------------------------------------------------------------------
    // Dialga - holding Adamant Crystal
    if (this.isSpecies("DIALGA")) {
      let newForm = 0;
      if (this.itemId === "ADAMANTCRYSTAL") newForm = 1;
      await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
    }
    //---------------------------------------------------------------------------
    // Palkia - holding Lustrous Globe
    if (this.isSpecies("PALKIA")) {
      let newForm = 0;
      if (this.itemId === "LUSTROUSGLOBE") newForm = 1;
      await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
    }
    //---------------------------------------------------------------------------
    // Giratina - holding Griseous Orb/Core
    if (this.isSpecies("GIRATINA")) {
      if (G.gameMap && MapMetadata.tryGet(G.gameMap.mapId)?.hasFlag("DistortionWorld")) return;
      let newForm = 0;
      if (["GRISEOUSORB", "GRISEOUSCORE"].includes(this.itemId!)) newForm = 1;
      await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
    }
    //---------------------------------------------------------------------------
    // Arceus - holding a Plate with Multi-Type
    if (this.isSpecies("ARCEUS") && this.abilityId === "MULTITYPE") {
      let newForm = 0;
      let type = Type.get("NORMAL");
      if (this.item) {
        const typeArray: [number, Id, Id[]][] = [
          [1, "FIGHTING", ["FISTPLATE", "FIGHTINIUMZ"]],
          [2, "FLYING", ["SKYPLATE", "FLYINIUMZ"]],
          [3, "POISON", ["TOXICPLATE", "POISONIUMZ"]],
          [4, "GROUND", ["EARTHPLATE", "GROUNDIUMZ"]],
          [5, "ROCK", ["STONEPLATE", "ROCKIUMZ"]],
          [6, "BUG", ["INSECTPLATE", "BUGINIUMZ"]],
          [7, "GHOST", ["SPOOKYPLATE", "GHOSTIUMZ"]],
          [8, "STEEL", ["IRONPLATE", "STEELIUMZ"]],
          [10, "FIRE", ["FLAMEPLATE", "FIRIUMZ"]],
          [11, "WATER", ["SPLASHPLATE", "WATERIUMZ"]],
          [12, "GRASS", ["MEADOWPLATE", "GRASSIUMZ"]],
          [13, "ELECTRIC", ["ZAPPLATE", "ELECTRIUMZ"]],
          [14, "PSYCHIC", ["MINDPLATE", "PSYCHIUMZ"]],
          [15, "ICE", ["ICICLEPLATE", "ICIUMZ"]],
          [16, "DRAGON", ["DRACOPLATE", "DRAGONIUMZ"]],
          [17, "DARK", ["DREADPLATE", "DARKINIUMZ"]],
          [18, "FAIRY", ["PIXIEPLATE", "FAIRIUMZ"]],
        ];
        for (const [form, typeId, items] of typeArray) {
          if (!items.includes(this.item.id)) continue;
          type = Type.get(typeId);
          newForm = form;
        }
      }
      await this.pbChangeForm(newForm, _INTL("{1} transformed into the {2}-type!", this.pbThis(), type.name));
    }
    //---------------------------------------------------------------------------
    // Genesect - holding a Drive
    if (this.isSpecies("GENESECT")) {
      let newForm = 0;
      const drives = ["SHOCKDRIVE", "BURNDRIVE", "CHILLDRIVE", "DOUSEDRIVE"];
      drives.forEach((drive, i) => {
        if (this.itemId === drive) newForm = i + 1;
      });
      await this.pbChangeForm(newForm, null);
    }
    //---------------------------------------------------------------------------
    // Silvally - holding a Memory with RKS System
    if (this.isSpecies("SILVALLY") && this.abilityId === "RKSSYSTEM") {
      let newForm = 0;
      let type = Type.get("NORMAL");
      if (this.item) {
        const typeArray: [number, Id, Id[]][] = [
          [1, "FIGHTING", ["FIGHTINGMEMORY"]],
          [2, "FLYING", ["FLYINGMEMORY"]],
          [3, "POISON", ["POISONMEMORY"]],
          [4, "GROUND", ["GROUNDMEMORY"]],
          [5, "ROCK", ["ROCKMEMORY"]],
          [6, "BUG", ["BUGMEMORY"]],
          [7, "GHOST", ["GHOSTMEMORY"]],
          [8, "STEEL", ["STEELMEMORY"]],
          [10, "FIRE", ["FIREMEMORY"]],
          [11, "WATER", ["WATERMEMORY"]],
          [12, "GRASS", ["GRASSMEMORY"]],
          [13, "ELECTRIC", ["ELECTRICMEMORY"]],
          [14, "PSYCHIC", ["PSYCHICMEMORY"]],
          [15, "ICE", ["ICEMEMORY"]],
          [16, "DRAGON", ["DRAGONMEMORY"]],
          [17, "DARK", ["DARKMEMORY"]],
          [18, "FAIRY", ["FAIRYMEMORY"]],
        ];
        for (const [form, typeId, items] of typeArray) {
          if (!items.includes(this.item.id)) continue;
          type = Type.get(typeId);
          newForm = form;
        }
      }
      await this.pbChangeForm(newForm, _INTL("{1} transformed into the {2}-type!", this.pbThis(), type.name));
    }
    //---------------------------------------------------------------------------
    // Zacian - holding Rusted Sword
    if (this.isSpecies("ZACIAN")) {
      let newForm = 0;
      if (this.itemId === "RUSTEDSWORD") newForm = 1;
      const moves: Id[] = ["IRONHEAD", "BEHEMOTHBLADE"];
      this.moves.forEach((m, i) => {
        if (m.id !== moves[this.form]) return;
        const move = new PokemonMove([...moves].reverse()[this.form]!);
        move.pp = m.pp;
        this.moves[i] = Move.fromPokemonMove(this.battle, move);
      });
      await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
    }
    //---------------------------------------------------------------------------
    // Zamazenta - holding Rusted Shield
    if (this.isSpecies("ZAMAZENTA")) {
      let newForm = 0;
      if (this.itemId === "RUSTEDSHIELD") newForm = 1;
      const moves: Id[] = ["IRONHEAD", "BEHEMOTHBASH"];
      this.moves.forEach((m, i) => {
        if (m.id !== moves[this.form]) return;
        const move = new PokemonMove([...moves].reverse()[this.form]!);
        move.pp = m.pp;
        this.moves[i] = Move.fromPokemonMove(this.battle, move);
      });
      await this.pbChangeForm(newForm, _INTL("{1} transformed!", this.pbThis()));
    }
  },

  /** pbTransform — ZUD( Generation 9 Pack( core ) ). */
  async pbTransform(this: Battler, target: Battler): Promise<void> {
    await transformCore(this, target);
    // Generation 9 Pack: "copies the number of hits taken by the target" — the
    // Ruby only assigns @battle.rage_hit_count[...] and then
    // @battle.pbRageHitCount(target) to a local variable, so it has no effect.
    // --- ZUD Mechanics: copies relevant Dynamax-related attributes ---
    if (target.dynamax() && target.baseMoves.length > 0) {
      this.moves.length = 0;
      target.moves.forEach((_m, i) => {
        const basemove = target.baseMoves[i]!.id;
        this.moves[i] = Move.fromPokemonMove(this.battle, new PokemonMove(basemove));
        this.moves[i]!.pp = 5;
        this.moves[i]!.setTotalPp(5);
      });
    }
    if (this.dynamax()) this.displayBaseMoves();
    this.battle.scene.pbRefreshOne(this.index);
  },

  pbHyperMode(this: Battler): void {},
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);
