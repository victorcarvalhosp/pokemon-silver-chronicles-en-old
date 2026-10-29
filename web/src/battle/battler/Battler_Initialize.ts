// Port of Data/Scripts/011_Battle/002_Battler/002_Battler_Initialize.rb
// (initialize itself is Battler's constructor in Battler.ts), with:
// - Generation 9 Pack ([001] Battle/[002] Battle_Battler.rb:14): pbInitEffects
//   adds the Gen 9 effects.
// - Essentials Deluxe ([000] Essentials Patches/Battle_Misc.rb:33): pbInitEffects
//   adds base_moves, power_trigger, CriticalBoost, EncoreRestore, TransformPokemon.
// - ZUD Mechanics ([004] Battle_Battler/Battler_Overrides.rb:9): pbInitEffects
//   adds the Dynamax/Max Raid effects and keeps G-Max trapping effects;
//   [009] Max Raid/Raid_Battle_Battler.rb:8 pbInitRaidBoss (in zud/raid/).
// Alias chain: ZUD( Deluxe( Gen 9( core ) ) ).

import { _INTL } from "../../data/gameData/gameData";
import { Settings } from "../../data/gameData/settings";
import { Stat } from "../../data/gameData/stat";
import type { Pokemon } from "../../game/pokemon/Pokemon";
import { Move } from "../move/Move";
import { PBEffects } from "../other/PBEffects";
import { Battler } from "./Battler";
import { pbInitRaidBoss as raidInitRaidBoss } from "../zud/raid/Raid_Battle_Battler";

const methods = {
  pbInitBlank(this: Battler): void {
    this.name = "";
    this.species = "";
    this._form = 0;
    this._level = 0;
    this._hp = this.totalhp = 0;
    this.types = [];
    this.abilityId = null;
    this.itemId = null;
    this.attack = this._defense = this.spatk = this._spdef = this.speed = 0;
    this._status = "NONE";
    this._statusCount = 0;
    this.pokemon = null;
    this.pokemonIndex = -1;
    this.participants = [];
    this.moves = [];
  },

  /** Used by Future Sight only, when Future Sight's user is no longer in battle. */
  pbInitDummyPokemon(this: Battler, pkmn: Pokemon, idxParty: number): void {
    if (pkmn.egg()) throw new Error(_INTL("An egg can't be an active Pokémon."));
    this.name = pkmn.name;
    this.species = pkmn.species;
    this._form = pkmn.form;
    this._level = pkmn.level;
    this._hp = pkmn.hp;
    this.totalhp = pkmn.totalhp;
    this.types = pkmn.types();
    // ability and item intentionally not copied across here
    this.attack = pkmn.attack;
    this._defense = pkmn.defense;
    this.spatk = pkmn.spatk;
    this._spdef = pkmn.spdef;
    this.speed = pkmn.speed;
    this._status = pkmn.status;
    this._statusCount = pkmn.statusCount;
    this.pokemon = pkmn;
    this.pokemonIndex = idxParty;
    this.participants = [];
    // moves intentionally not copied across here
    this.dummy = true;
  },

  pbInitialize(this: Battler, pkmn: Pokemon, idxParty: number, batonPass = false): void {
    this.pbInitPokemon(pkmn, idxParty);
    this.pbInitEffects(batonPass);
    this.damageState.reset();
  },

  pbInitPokemon(this: Battler, pkmn: Pokemon, idxParty: number): void {
    if (pkmn.egg()) throw new Error(_INTL("An egg can't be an active Pokémon."));
    this.name = pkmn.name;
    this.species = pkmn.species;
    this._form = pkmn.form;
    this._level = pkmn.level;
    this._hp = pkmn.hp;
    this.totalhp = pkmn.totalhp;
    this.types = pkmn.types();
    this.abilityId = pkmn.abilityId;
    this.itemId = pkmn.itemId;
    this.attack = pkmn.attack;
    this._defense = pkmn.defense;
    this.spatk = pkmn.spatk;
    this._spdef = pkmn.spdef;
    this.speed = pkmn.speed;
    this._status = pkmn.status;
    this._statusCount = pkmn.statusCount;
    this.pokemon = pkmn;
    this.pokemonIndex = idxParty;
    this.participants = []; // Participants earn Exp. if this battler is defeated
    this.moves = [];
    pkmn.moves.forEach((m, i) => {
      this.moves[i] = Move.fromPokemonMove(this.battle, m);
    });
  },

  pbInitEffects(this: Battler, batonPass: boolean): void {
    // --- ZUD Mechanics (before the aliased method) ---
    this.powerIndex = -1;
    this.ignoreDynamax = false;
    this.selectedMoveIsZMove = false;
    this.lastMoveUsedIsZMove = false;
    this.effects[PBEffects.Dynamax] = 0;
    this.effects[PBEffects.NonGMaxForm] = null;
    if (this.dynamax() && this.effects[PBEffects.Dynamax] === 0) {
      this.effects[PBEffects.Dynamax] = Settings.DYNAMAX_TURNS;
    }
    this.effects[PBEffects.MaxGuard] = false;
    this.effects[PBEffects.MaxRaidBoss] = false;
    this.effects[PBEffects.RaidShield] = -1;
    this.effects[PBEffects.MaxShieldHP] = -1;
    this.effects[PBEffects.ShieldCounter] = -1;
    this.effects[PBEffects.KnockOutCount] = -1;
    // Round about way of preventing trapping effects of certain G-Max moves from
    // ending prematurely if the user of the move leaves the field.
    if (!batonPass) this.effects[PBEffects.GMaxTrapping] = false;
    const trapHash = new Map<number, [unknown, unknown]>();
    for (const b of this.battle.allBattlers()) {
      if (!b.effects[PBEffects.GMaxTrapping]) continue;
      trapHash.set(b.index, [b.effects[PBEffects.Trapping], b.effects[PBEffects.TrappingUser]]);
    }
    // --- Essentials ---
    this.pbInitEffectsCore(batonPass);
    // --- Generation 9 Pack ---
    this.effects[PBEffects.AllySwitch] = false;
    this.effects[PBEffects.BoosterEnergy] = false;
    this.effects[PBEffects.Commander] = null;
    this.effects[PBEffects.CudChew] = 0;
    this.effects[PBEffects.DoubleShock] = false;
    this.effects[PBEffects.GlaiveRush] = 0;
    this.effects[PBEffects.ParadoxStat] = null;
    this.effects[PBEffects.Protean] = null;
    this.effects[PBEffects.SaltCure] = false;
    this.effects[PBEffects.Splinters] = 0;
    this.effects[PBEffects.SplintersType] = null;
    this.effects[PBEffects.SilkTrap] = false;
    this.effects[PBEffects.SuccessiveMove] = null;
    this.effects[PBEffects.SupremeOverlord] = 0;
    this.proteanTrigger = false;
    this.mirrorHerbUsed = false;
    this.legendPlateType = null;
    // --- Essentials Deluxe ---
    this.baseMoves = [];
    this.powerTrigger = false;
    if (!batonPass) this.effects[PBEffects.CriticalBoost] = 0;
    this.effects[PBEffects.EncoreRestore] = [];
    this.effects[PBEffects.TransformPokemon] = null;
    // --- ZUD Mechanics (after the aliased method) ---
    for (const [i, [trapping, trappingUser]] of trapHash) {
      const b = this.battle.battlers[i];
      if (!b || b.fainted()) continue;
      b.effects[PBEffects.Trapping] = trapping;
      b.effects[PBEffects.TrappingUser] = trappingUser;
    }
    this.pbInitRaidBoss();
  },

  /** Core Essentials' pbInitEffects (the innermost method of the alias chain). */
  pbInitEffectsCore(this: Battler, batonPass: boolean): void {
    if (batonPass) {
      // These effects are passed on if Baton Pass is used, but they need to be
      // reapplied
      this.effects[PBEffects.LaserFocus] = this.effects[PBEffects.LaserFocus] > 0 ? 2 : 0;
      this.effects[PBEffects.LockOn] = this.effects[PBEffects.LockOn] > 0 ? 2 : 0;
      if (this.effects[PBEffects.PowerTrick]) {
        [this.attack, this._defense] = [this._defense, this.attack];
      }
      // These effects are passed on if Baton Pass is used, but they need to be
      // cancelled in certain circumstances anyway
      if (this.isSpecies("GENGAR") && this.mega()) this.effects[PBEffects.Telekinesis] = 0;
      if (this.unstoppableAbility()) this.effects[PBEffects.GastroAcid] = false;
    } else {
      // These effects are passed on if Baton Pass is used
      for (const stat of Stat.eachBattle()) this.stages[stat.id] = 0;
      this.effects[PBEffects.AquaRing] = false;
      this.effects[PBEffects.Confusion] = 0;
      this.effects[PBEffects.Curse] = false;
      this.effects[PBEffects.Embargo] = 0;
      this.effects[PBEffects.FocusEnergy] = 0;
      this.effects[PBEffects.GastroAcid] = false;
      this.effects[PBEffects.HealBlock] = 0;
      this.effects[PBEffects.Ingrain] = false;
      this.effects[PBEffects.LaserFocus] = 0;
      this.effects[PBEffects.LeechSeed] = -1;
      this.effects[PBEffects.LockOn] = 0;
      this.effects[PBEffects.LockOnPos] = -1;
      this.effects[PBEffects.MagnetRise] = 0;
      this.effects[PBEffects.PerishSong] = 0;
      this.effects[PBEffects.PerishSongUser] = -1;
      this.effects[PBEffects.PowerTrick] = false;
      this.effects[PBEffects.Substitute] = 0;
      this.effects[PBEffects.Telekinesis] = 0;
    }
    this.faintedProperly = (this.hp === 0);
    this.lastAttacker = [];
    this.lastFoeAttacker = [];
    this.lastHPLost = 0;
    this.lastHPLostFromFoe = 0;
    this.droppedBelowHalfHP = false;
    this.statsDropped = false;
    this.tookDamageThisRound = false;
    this.tookPhysicalHit = false;
    this.statsRaisedThisRound = false;
    this.statsLoweredThisRound = false;
    this.canRestoreIceFace = false;
    this.lastMoveUsed = null;
    this.lastMoveUsedType = null;
    this.lastRegularMoveUsed = null;
    this.lastRegularMoveTarget = -1;
    this.lastRoundMoved = -1;
    this.lastMoveFailed = false;
    this.lastRoundMoveFailed = false;
    this.movesUsed = [];
    this.turnCount = 0;
    this.effects[PBEffects.Attract] = -1;
    for (const b of this.battle.allBattlers()) { // Other battlers no longer attracted to self
      if (b.effects[PBEffects.Attract] === this.index) b.effects[PBEffects.Attract] = -1;
    }
    this.effects[PBEffects.BanefulBunker] = false;
    this.effects[PBEffects.BeakBlast] = false;
    this.effects[PBEffects.Bide] = 0;
    this.effects[PBEffects.BideDamage] = 0;
    this.effects[PBEffects.BideTarget] = -1;
    this.effects[PBEffects.BurnUp] = false;
    this.effects[PBEffects.Charge] = 0;
    this.effects[PBEffects.ChoiceBand] = null;
    this.effects[PBEffects.Counter] = -1;
    this.effects[PBEffects.CounterTarget] = -1;
    this.effects[PBEffects.Dancer] = false;
    this.effects[PBEffects.DefenseCurl] = false;
    this.effects[PBEffects.DestinyBond] = false;
    this.effects[PBEffects.DestinyBondPrevious] = false;
    this.effects[PBEffects.DestinyBondTarget] = -1;
    this.effects[PBEffects.Disable] = 0;
    this.effects[PBEffects.DisableMove] = null;
    this.effects[PBEffects.Electrify] = false;
    this.effects[PBEffects.Encore] = 0;
    this.effects[PBEffects.EncoreMove] = null;
    this.effects[PBEffects.Endure] = false;
    this.effects[PBEffects.FirstPledge] = null;
    this.effects[PBEffects.FlashFire] = false;
    this.effects[PBEffects.Flinch] = false;
    this.effects[PBEffects.FocusPunch] = false;
    this.effects[PBEffects.FollowMe] = 0;
    this.effects[PBEffects.Foresight] = false;
    this.effects[PBEffects.FuryCutter] = 0;
    this.effects[PBEffects.GemConsumed] = null;
    this.effects[PBEffects.Grudge] = false;
    this.effects[PBEffects.HelpingHand] = false;
    this.effects[PBEffects.HyperBeam] = 0;
    this.effects[PBEffects.Illusion] = null;
    if (this.hasActiveAbility("ILLUSION")) {
      const idxLastParty = this.battle.pbLastInTeam(this.index);
      if (idxLastParty >= 0 && idxLastParty !== this.pokemonIndex) {
        this.effects[PBEffects.Illusion] = this.battle.pbParty(this.index)[idxLastParty];
      }
    }
    this.effects[PBEffects.Imprison] = false;
    this.effects[PBEffects.Instruct] = false;
    this.effects[PBEffects.Instructed] = false;
    this.effects[PBEffects.JawLock] = -1;
    for (const b of this.battle.allBattlers()) { // Other battlers no longer blocked by self
      if (b.effects[PBEffects.JawLock] === this.index) b.effects[PBEffects.JawLock] = -1;
    }
    this.effects[PBEffects.KingsShield] = false;
    for (const b of this.battle.allBattlers()) { // Other battlers lose their lock-on against self
      if (b.effects[PBEffects.LockOn] === 0) continue;
      if (b.effects[PBEffects.LockOnPos] !== this.index) continue;
      b.effects[PBEffects.LockOn] = 0;
      b.effects[PBEffects.LockOnPos] = -1;
    }
    this.effects[PBEffects.MagicBounce] = false;
    this.effects[PBEffects.MagicCoat] = false;
    this.effects[PBEffects.MeanLook] = -1;
    for (const b of this.battle.allBattlers()) { // Other battlers no longer blocked by self
      if (b.effects[PBEffects.MeanLook] === this.index) b.effects[PBEffects.MeanLook] = -1;
    }
    this.effects[PBEffects.MeFirst] = false;
    this.effects[PBEffects.Metronome] = 0;
    this.effects[PBEffects.MicleBerry] = false;
    this.effects[PBEffects.Minimize] = false;
    this.effects[PBEffects.MiracleEye] = false;
    this.effects[PBEffects.MirrorCoat] = -1;
    this.effects[PBEffects.MirrorCoatTarget] = -1;
    this.effects[PBEffects.MoveNext] = false;
    this.effects[PBEffects.MudSport] = false;
    this.effects[PBEffects.Nightmare] = false;
    this.effects[PBEffects.NoRetreat] = false;
    this.effects[PBEffects.Obstruct] = false;
    this.effects[PBEffects.Octolock] = -1;
    for (const b of this.battle.allBattlers()) { // Other battlers no longer locked by self
      if (b.effects[PBEffects.Octolock] === this.index) b.effects[PBEffects.Octolock] = -1;
    }
    this.effects[PBEffects.Outrage] = 0;
    this.effects[PBEffects.ParentalBond] = 0;
    this.effects[PBEffects.PickupItem] = null;
    this.effects[PBEffects.PickupUse] = 0;
    this.effects[PBEffects.Pinch] = false;
    this.effects[PBEffects.Powder] = false;
    this.effects[PBEffects.Prankster] = false;
    this.effects[PBEffects.PriorityAbility] = false;
    this.effects[PBEffects.PriorityItem] = false;
    this.effects[PBEffects.Protect] = false;
    this.effects[PBEffects.ProtectRate] = 1;
    this.effects[PBEffects.Quash] = 0;
    this.effects[PBEffects.Rage] = false;
    this.effects[PBEffects.RagePowder] = false;
    this.effects[PBEffects.Rollout] = 0;
    this.effects[PBEffects.Roost] = false;
    this.effects[PBEffects.SkyDrop] = -1;
    for (const b of this.battle.allBattlers()) { // Other battlers no longer Sky Dropped by self
      if (b.effects[PBEffects.SkyDrop] === this.index) b.effects[PBEffects.SkyDrop] = -1;
    }
    this.effects[PBEffects.SlowStart] = 0;
    this.effects[PBEffects.SmackDown] = false;
    this.effects[PBEffects.Snatch] = 0;
    this.effects[PBEffects.SpikyShield] = false;
    this.effects[PBEffects.Spotlight] = 0;
    this.effects[PBEffects.Stockpile] = 0;
    this.effects[PBEffects.StockpileDef] = 0;
    this.effects[PBEffects.StockpileSpDef] = 0;
    this.effects[PBEffects.TarShot] = false;
    this.effects[PBEffects.Taunt] = 0;
    this.effects[PBEffects.ThroatChop] = 0;
    this.effects[PBEffects.Torment] = false;
    this.effects[PBEffects.Toxic] = 0;
    this.effects[PBEffects.Transform] = false;
    this.effects[PBEffects.TransformSpecies] = null;
    this.effects[PBEffects.Trapping] = 0;
    this.effects[PBEffects.TrappingMove] = null;
    this.effects[PBEffects.TrappingUser] = -1;
    for (const b of this.battle.allBattlers()) { // Other battlers no longer trapped by self
      if (b.effects[PBEffects.TrappingUser] !== this.index) continue;
      b.effects[PBEffects.Trapping] = 0;
      b.effects[PBEffects.TrappingUser] = -1;
    }
    this.effects[PBEffects.Truant] = false;
    this.effects[PBEffects.TwoTurnAttack] = null;
    this.effects[PBEffects.Type3] = null;
    this.effects[PBEffects.Unburden] = false;
    this.effects[PBEffects.Uproar] = 0;
    this.effects[PBEffects.WaterSport] = false;
    this.effects[PBEffects.WeightChange] = 0;
    this.effects[PBEffects.Yawn] = 0;
  },

  /** ZUD Mechanics ([009] Max Raid/Raid_Battle_Battler.rb:8): sets up a Max Raid boss. */
  pbInitRaidBoss(this: Battler): void {
    raidInitRaidBoss(this);
  },

  //=============================================================================
  // Refreshing a battler's properties
  //=============================================================================
  pbUpdate(this: Battler, fullChange = false): void {
    if (!this.pokemon) return;
    this.pokemon.calcStats();
    this._level = this.pokemon.level;
    this._hp = this.pokemon.hp;
    this.totalhp = this.pokemon.totalhp;
    if (!this.effects[PBEffects.Transform]) {
      this.attack = this.pokemon.attack;
      this._defense = this.pokemon.defense;
      this.spatk = this.pokemon.spatk;
      this._spdef = this.pokemon.spdef;
      this.speed = this.pokemon.speed;
      if (fullChange) {
        this.types = this.pokemon.types();
        this.abilityId = this.pokemon.abilityId;
      }
    }
  },

  /** Used to erase the battler of a Pokémon that has been caught. */
  pbReset(this: Battler): void {
    this.pokemon = null;
    this.pokemonIndex = -1;
    this._hp = 0;
    this.pbInitEffects(false);
    this.participants = [];
    // Reset status
    this._status = "NONE";
    this._statusCount = 0;
    // Reset choice
    this.battle.pbClearChoice(this.index);
  },

  /** Update which Pokémon will gain Exp if this battler is defeated. */
  pbUpdateParticipants(this: Battler): void {
    if (this.fainted() || !this.battle.opposes(this.index)) return;
    for (const b of this.allOpposing()) {
      if (!this.participants.includes(b.pokemonIndex)) this.participants.push(b.pokemonIndex);
    }
  },
};

type Methods = typeof methods;
declare module "./Battler" {
  interface Battler extends Methods {}
}
Object.assign(Battler.prototype, methods);

