// Port of Data/Scripts/010_Data/001_Hardcoded data/017_Target.rb.

import { type Id, SymbolData } from "./gameData";

export class Target extends SymbolData {
  static DATA = new Map<Id, Target>();
  readonly id: Id;
  readonly realName: string;
  /** 0, 1 or 2 (meaning 2+). */
  readonly numTargets: number;
  /** Is able to target one or more foes. */
  readonly targetsFoe: boolean;
  /** Crafty Shield can't protect from these moves. */
  readonly targetsAll: boolean;
  /** Pressure also affects these moves. */
  readonly affectsFoeSide: boolean;
  /** Hits non-adjacent targets. */
  readonly longRange: boolean;

  constructor(hash: { id: Id; name?: string; numTargets?: number; targetsFoe?: boolean; targetsAll?: boolean; affectsFoeSide?: boolean; longRange?: boolean }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.numTargets = hash.numTargets ?? 0;
    this.targetsFoe = hash.targetsFoe ?? false;
    this.targetsAll = hash.targetsAll ?? false;
    this.affectsFoeSide = hash.affectsFoeSide ?? false;
    this.longRange = hash.longRange ?? false;
  }

  get name(): string { return this.realName; }

  /** can_choose_distant_target? */
  canChooseDistantTarget(): boolean { return this.numTargets === 1 && this.longRange; }
  /** can_target_one_foe? */
  canTargetOneFoe(): boolean { return this.numTargets === 1 && this.targetsFoe; }
}

Target.register({id: "None", name: "None", numTargets: 0, targetsFoe: false, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "User", name: "User", numTargets: 0, targetsFoe: false, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "NearAlly", name: "Near Ally", numTargets: 1, targetsFoe: false, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "UserOrNearAlly", name: "User or Near Ally", numTargets: 1, targetsFoe: false, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "AllAllies", name: "All Allies", numTargets: 2, targetsFoe: false, targetsAll: true, affectsFoeSide: false, longRange: true});
Target.register({id: "UserAndAllies", name: "User and Allies", numTargets: 2, targetsFoe: false, targetsAll: false, affectsFoeSide: false, longRange: true});
Target.register({id: "NearFoe", name: "Near Foe", numTargets: 1, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "RandomNearFoe", name: "Random Near Foe", numTargets: 1, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "AllNearFoes", name: "All Near Foes", numTargets: 2, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "Foe", name: "Foe", numTargets: 1, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: true});
Target.register({id: "AllFoes", name: "All Foes", numTargets: 2, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: true});
Target.register({id: "NearOther", name: "Near Other", numTargets: 1, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "AllNearOthers", name: "All Near Others", numTargets: 2, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "Other", name: "Other", numTargets: 1, targetsFoe: true, targetsAll: false, affectsFoeSide: false, longRange: true});
Target.register({id: "AllBattlers", name: "All Battlers", numTargets: 2, targetsFoe: true, targetsAll: true, affectsFoeSide: false, longRange: true});
Target.register({id: "UserSide", name: "User Side", numTargets: 0, targetsFoe: false, targetsAll: false, affectsFoeSide: false, longRange: false});
Target.register({id: "FoeSide", name: "Foe Side", numTargets: 0, targetsFoe: false, targetsAll: false, affectsFoeSide: true, longRange: false});
Target.register({id: "BothSides", name: "Both Sides", numTargets: 0, targetsFoe: false, targetsAll: false, affectsFoeSide: true, longRange: false});
