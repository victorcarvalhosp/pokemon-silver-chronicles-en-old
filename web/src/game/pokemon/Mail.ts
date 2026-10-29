// Port of the Mail class from Data/Scripts/013_Items/006_Item_Mail.rb.

import type { Id } from "../../data/gameData/gameData";
import { Item } from "../../data/gameData/item";

/** [species, gender, shininess, form, shadowness, is egg] */
export type MailPokemon = [Id, number, boolean, number, boolean, boolean];

export class Mail {
  /** Item represented by this mail. */
  item: Id;
  /** Message text. */
  message: string;
  /** Name of the message's sender. */
  sender: string;
  poke1: MailPokemon | null;
  poke2: MailPokemon | null;
  poke3: MailPokemon | null;

  constructor(item: Id, message: string, sender: string, poke1: MailPokemon | null = null, poke2: MailPokemon | null = null, poke3: MailPokemon | null = null) {
    this.item = Item.get(item).id;
    this.message = message;
    this.sender = sender;
    this.poke1 = poke1;
    this.poke2 = poke2;
    this.poke3 = poke3;
  }

  toJSON(): object {
    return { item: this.item, message: this.message, sender: this.sender, poke1: this.poke1, poke2: this.poke2, poke3: this.poke3 };
  }

  static fromJSON(json: { item: Id; message: string; sender: string; poke1: MailPokemon | null; poke2: MailPokemon | null; poke3: MailPokemon | null }): Mail {
    const m = Object.create(Mail.prototype) as Mail;
    Object.assign(m, json);
    return m;
  }
}
