// Port of Data/Scripts/010_Data/002_PBS data/006_Item.rb, with the plugin
// changes this game loads (in load order):
// - Generation 9 Pack: more unlosable item combos.
// - Essentials Deluxe: held_description, portion names, item flag checks,
//   Mega Stone held icon.
// - ZUD Mechanics: Z-Crystals (important, unlosable), Ultra items, TRs by type.
//
// The icon filename helpers need pbResolveBitmap; they take it as an
// argument so this module doesn't depend on the asset/UI layer.

import type { ItemData } from "../pbs/types";
import { rand } from "../../core/random";
import { type Id, SymbolData, hasFlag } from "./gameData";
import { Move } from "./move";
import { Species } from "./species";
import { Type } from "./type";
import { MessageTypes, pbGetMessageFromHash } from "../../core/intl";

type Resolve = (path: string) => string | null;

export class Item extends SymbolData {
  static DATA = new Map<Id, Item>();
  readonly id: Id;
  // attr_accessor in Essentials Deluxe's Compiler patch.
  realName: string;
  realNamePlural: string;
  pocket: number;
  readonly price: number;
  readonly sellPrice: number;
  realDescription: string;
  /** Essentials Deluxe: text shown for the item when held (null: use description). */
  realHeldDescription: string | null;
  /** 0 = none, 1 = OnPokemon, 2 = Direct, 3 = TM, 4 = HM, 5 = TR. */
  fieldUse: number;
  /** 0 = none, 1 = OnPokemon, 2 = OnMove, 3 = OnBattler, 4 = OnFoe, 5 = Direct. */
  battleUse: number;
  readonly consumable: boolean;
  flags: string[];
  readonly move: Id | null;

  /** icon_filename */
  static iconFilename(item: Id | Item | null | undefined, pbResolveBitmap: Resolve): string {
    if (item == null) return "Graphics/Items/back";
    const itemData = Item.tryGet(item);
    if (!itemData) return "Graphics/Items/000";
    let ret = `Graphics/Items/${itemData.id}`;
    if (pbResolveBitmap(ret)) return ret;
    if (itemData.isMachine()) {
      let prefix = "machine";
      if (itemData.isHM()) prefix = "machine_hm";
      else if (itemData.isTR()) prefix = "machine_tr";
      const moveType = Move.get(itemData.move!).type;
      const typeData = Type.get(moveType);
      ret = `Graphics/Items/${prefix}_${typeData.id}`;
      if (pbResolveBitmap(ret)) return ret;
      if (!itemData.isTM()) {
        ret = `Graphics/Items/machine_${typeData.id}`;
        if (pbResolveBitmap(ret)) return ret;
      }
    }
    return "Graphics/Items/000";
  }

  /** held_icon_filename (with ZUD's Z-Crystal and Essentials Deluxe's Mega Stone icons in front). */
  static heldIconFilename(item: Id | Item | null | undefined, pbResolveBitmap: Resolve): string | null {
    const itemData = Item.tryGet(item);
    if (!itemData) return null;
    // ZUD Mechanics
    const zudBase = itemData.isZCrystal() ? "zcrystal" : ""; // nil formats as "" in sprintf
    for (const p of ["Graphics/Plugins/ZUD/UI/icon_", "Graphics/Pictures/Party/icon_"]) {
      let ret = `${p}${zudBase}_${itemData.id}`;
      if (pbResolveBitmap(ret)) return ret;
      ret = `${p}${zudBase}`;
      if (pbResolveBitmap(ret)) return ret;
    }
    // Essentials Deluxe
    const dxBase = itemData.isMegaStone() ? "mega" : "";
    for (const p of ["Graphics/Plugins/Essentials Deluxe/icon_", "Graphics/Pictures/Party/icon_"]) {
      let ret = `${p}${dxBase}_${itemData.id}`;
      if (pbResolveBitmap(ret)) return ret;
      ret = `${p}${dxBase}`;
      if (pbResolveBitmap(ret)) return ret;
    }
    // Essentials
    const nameBase = itemData.isMail() ? "mail" : "item";
    const ret = `Graphics/Pictures/Party/icon_${nameBase}_${itemData.id}`;
    if (pbResolveBitmap(ret)) return ret;
    return `Graphics/Pictures/Party/icon_${nameBase}`;
  }

  /** mail_filename */
  static mailFilename(item: Id | Item | null | undefined, pbResolveBitmap: Resolve): string | null {
    const itemData = Item.tryGet(item);
    if (!itemData) return null;
    const ret = `Graphics/Pictures/Mail/mail_${itemData.id}`;
    return pbResolveBitmap(ret) ? ret : null;
  }

  /** ZUD: get_TR_from_type — a random TR teaching a move of one of the types. */
  static getTRFromType(types: Id[]): Id | null {
    const trList: Id[] = [];
    for (const i of Item.each()) {
      if (!i.isTR()) continue;
      const moveType = Move.get(i.move!).type;
      if (!types.includes(moveType)) continue;
      trList.push(i.id);
    }
    return trList.length > 0 ? trList[rand(trList.length)]! : null;
  }

  constructor(hash: Partial<ItemData> & { id: Id; realHeldDescription?: string | null }) {
    super();
    this.id = hash.id;
    this.realName = hash.name ?? "Unnamed";
    this.realNamePlural = hash.namePlural ?? "Unnamed";
    this.pocket = hash.pocket ?? 1;
    this.price = hash.price ?? 0;
    this.sellPrice = hash.sellPrice ?? Math.floor(this.price / 2);
    this.realDescription = hash.description ?? "???";
    this.fieldUse = hash.fieldUse ?? 0;
    this.battleUse = hash.battleUse ?? 0;
    this.flags = hash.flags ?? [];
    this.move = hash.move ?? null;
    this.consumable = hash.consumable ?? !this.isImportant();
    // Essentials Deluxe
    this.realHeldDescription = hash.heldDescription ?? hash.realHeldDescription ?? null;
  }

  get name(): string { return pbGetMessageFromHash(MessageTypes.Items, this.realName); }
  get namePlural(): string { return pbGetMessageFromHash(MessageTypes.ItemPlurals, this.realNamePlural); }
  get description(): string { return pbGetMessageFromHash(MessageTypes.ItemDescriptions, this.realDescription); }

  hasFlag(flag: string): boolean { return hasFlag(this.flags, flag); }

  isTM(): boolean { return this.fieldUse === 3; }
  isHM(): boolean { return this.fieldUse === 4; }
  isTR(): boolean { return this.fieldUse === 5; }
  isMachine(): boolean { return this.isTM() || this.isHM() || this.isTR(); }
  isMail(): boolean { return this.hasFlag("Mail") || this.hasFlag("IconMail"); }
  isIconMail(): boolean { return this.hasFlag("IconMail"); }
  isPokeBall(): boolean { return this.hasFlag("PokeBall") || this.hasFlag("SnagBall"); }
  /** is_snag_ball? (needs $player.has_snag_machine). */
  isSnagBall(hasSnagMachine = false): boolean { return this.hasFlag("SnagBall") || (this.isPokeBall() && hasSnagMachine); }
  isBerry(): boolean { return this.hasFlag("Berry"); }
  isKeyItem(): boolean { return this.hasFlag("KeyItem"); }
  isEvolutionStone(): boolean { return this.hasFlag("EvolutionStone"); }
  isFossil(): boolean { return this.hasFlag("Fossil"); }
  isApricorn(): boolean { return this.hasFlag("Apricorn"); }
  isGem(): boolean { return this.hasFlag("TypeGem"); }
  isMulch(): boolean { return this.hasFlag("Mulch"); }
  /** Does NOT include Red Orb/Blue Orb. */
  isMegaStone(): boolean { return this.hasFlag("MegaStone"); }
  isScent(): boolean { return this.hasFlag("Scent"); }

  /** is_important? (ZUD adds Z-Crystals). */
  isImportant(): boolean {
    if (this.isKeyItem() || this.isHM() || this.isTM()) return true;
    return this.isZCrystal();
  }

  /** can_hold? */
  canHold(): boolean { return !this.isImportant(); }

  /** consumed_after_use? */
  consumedAfterUse(): boolean { return !this.isImportant() && this.consumable; }

  /** unlosable?(species, ability), with the ZUD and Generation 9 Pack checks first. */
  unlosable(species: Id, ability: Id | null): boolean {
    // ZUD Mechanics
    if (this.isZCrystal() || this.isUltraItem()) return true;
    // Generation 9 Pack
    const paldea: Record<Id, Id[]> = {
      DIALGA: ["ADAMANTCRYSTAL"],
      PALKIA: ["LUSTROUSGLOBE"],
      GIRATINA: ["GRISEOUSCORE"],
      ARCEUS: ["BLANKPLATE", "LEGENDPLATE"],
    };
    if (paldea[species]?.includes(this.id)) return true;
    if (this.id === "BOOSTERENERGY" && ["PROTOSYNTHESIS", "QUARKDRIVE"].includes(ability ?? "") &&
        Species.get(species).hasFlag("Paradox")) return true;
    // Essentials
    if (species === "ARCEUS" && ability !== "MULTITYPE") return false;
    if (species === "SILVALLY" && ability !== "RKSSYSTEM") return false;
    const combos: Record<Id, Id[]> = {
      ARCEUS: ["FISTPLATE", "FIGHTINIUMZ",
        "SKYPLATE", "FLYINIUMZ",
        "TOXICPLATE", "POISONIUMZ",
        "EARTHPLATE", "GROUNDIUMZ",
        "STONEPLATE", "ROCKIUMZ",
        "INSECTPLATE", "BUGINIUMZ",
        "SPOOKYPLATE", "GHOSTIUMZ",
        "IRONPLATE", "STEELIUMZ",
        "FLAMEPLATE", "FIRIUMZ",
        "SPLASHPLATE", "WATERIUMZ",
        "MEADOWPLATE", "GRASSIUMZ",
        "ZAPPLATE", "ELECTRIUMZ",
        "MINDPLATE", "PSYCHIUMZ",
        "ICICLEPLATE", "ICIUMZ",
        "DRACOPLATE", "DRAGONIUMZ",
        "DREADPLATE", "DARKINIUMZ",
        "PIXIEPLATE", "FAIRIUMZ"],
      SILVALLY: ["FIGHTINGMEMORY", "FLYINGMEMORY", "POISONMEMORY", "GROUNDMEMORY", "ROCKMEMORY", "BUGMEMORY",
        "GHOSTMEMORY", "STEELMEMORY", "FIREMEMORY", "WATERMEMORY", "GRASSMEMORY", "ELECTRICMEMORY",
        "PSYCHICMEMORY", "ICEMEMORY", "DRAGONMEMORY", "DARKMEMORY", "FAIRYMEMORY"],
      GIRATINA: ["GRISEOUSORB"],
      GENESECT: ["BURNDRIVE", "CHILLDRIVE", "DOUSEDRIVE", "SHOCKDRIVE"],
      KYOGRE: ["BLUEORB"],
      GROUDON: ["REDORB"],
      ZACIAN: ["RUSTEDSWORD"],
      ZAMAZENTA: ["RUSTEDSHIELD"],
    };
    // Ruby returns nil (falsy) when the species has no combo.
    return combos[species]?.includes(this.id) ?? false;
  }

  // --- Essentials Deluxe ([000] Essentials Patches/Miscellaneous.rb) -----------
  get heldDescription(): string {
    if (!this.realHeldDescription) return this.description;
    return this.realHeldDescription;
  }
  get portionName(): string { return this.name; }
  get portionNamePlural(): string { return this.namePlural; }
  isRepel(): boolean { return this.hasFlag("Repel"); }
  isMedicine(): boolean { return this.hasFlag("Medicine"); }
  isRemedy(): boolean { return this.hasFlag("Remedy"); }
  isVitamin(): boolean { return this.hasFlag("Vitamin"); }
  isExpCandy(): boolean { return this.hasFlag("ExpCandy"); }
  isFeather(): boolean { return this.hasFlag("Feather"); }
  isMint(): boolean { return this.hasFlag("Mint"); }
  isIncense(): boolean { return this.hasFlag("Incense"); }
  isContestItem(): boolean { return this.hasFlag("Contest"); }
  isEvBooster(): boolean { return this.hasFlag("EVBooster"); }
  isFlute(): boolean { return this.hasFlag("Flute"); }
  isShard(): boolean { return this.hasFlag("Shard"); }
  isNectar(): boolean { return this.hasFlag("Nectar"); }
  isSweet(): boolean { return this.hasFlag("Sweet"); }
  isPlate(): boolean { return this.hasFlag("Plate"); }
  isMemory(): boolean { return this.hasFlag("Memory"); }
  isDrive(): boolean { return this.hasFlag("Drive"); }
  isFossilHalf(): boolean { return this.hasFlag("FossilHalf"); }
  isEnhancer(): boolean { return this.hasFlag("BattleEnhancer"); }
  isHealBerry(): boolean { return this.hasFlag("HealBerry"); }
  isStatusBerry(): boolean { return this.hasFlag("StatusBerry"); }
  isFlavorBerry(): boolean { return this.hasFlag("FlavorBerry"); }
  isEvBerry(): boolean { return this.hasFlag("EVReduceBerry"); }
  isTypeBerry(): boolean { return this.hasFlag("TypeReduceBerry"); }
  isPinchBerry(): boolean { return this.hasFlag("PinchBerry"); }
  isTeraShard(): boolean { return this.flags.some((f) => /^TeraShard_/i.test(f)); }

  // --- ZUD Mechanics ([001] Data/Data_Item.rb) ---------------------------------
  isZCrystal(): boolean { return this.hasFlag("ZCrystal"); }
  isUltraItem(): boolean { return this.hasFlag("UltraItem"); }
}
