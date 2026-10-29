// Port of Data/Scripts/011_Battle/006_Other battle code/003_Battle_DamageState.rb

import { Effectiveness } from "../../data/gameData/type";

//===============================================================================
//
//===============================================================================
export class DamageState {
  /** Type effectiveness */
  typeMod = Effectiveness.INEFFECTIVE;
  unaffected = false;
  protected = false;
  magicCoat = false;
  magicBounce = false;
  /** Like hpLost, but cumulative over all hits */
  totalHPLost = 0;
  /** Whether battler was knocked out by the move */
  fainted = false;

  /** Whether the move failed the accuracy check */
  missed = false;
  affectionMissed = false;
  /** If the move missed due to two turn move invulnerability */
  invulnerable = false;
  /** Calculated damage */
  calcDamage = 0;
  /** HP lost by opponent, inc. HP lost by a substitute */
  hpLost = 0;
  /** Critical hit flag */
  critical = false;
  affectionCritical = false;
  /** Whether a substitute took the damage */
  substitute = false;
  /** Focus Band used */
  focusBand = false;
  /** Focus Sash used */
  focusSash = false;
  /** Sturdy ability used */
  sturdy = false;
  /** Disguise ability used */
  disguise = false;
  /** Ice Face ability used */
  iceFace = false;
  /** Damage was endured */
  endured = false;
  affectionEndured = false;
  /** Whether a type-resisting berry was used */
  berryWeakened = false;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.typeMod = Effectiveness.INEFFECTIVE;
    this.unaffected = false;
    this.protected = false;
    this.missed = false;
    this.affectionMissed = false;
    this.invulnerable = false;
    this.magicCoat = false;
    this.magicBounce = false;
    this.totalHPLost = 0;
    this.fainted = false;
    this.resetPerHit();
  }

  resetPerHit(): void {
    this.calcDamage = 0;
    this.hpLost = 0;
    this.critical = false;
    this.affectionCritical = false;
    this.substitute = false;
    this.focusBand = false;
    this.focusSash = false;
    this.sturdy = false;
    this.disguise = false;
    this.iceFace = false;
    this.endured = false;
    this.affectionEndured = false;
    this.berryWeakened = false;
  }
}
