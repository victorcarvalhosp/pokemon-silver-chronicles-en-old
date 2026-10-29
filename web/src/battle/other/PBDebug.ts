// Port of PBDebug (Data/Scripts/001_Technical/003_Debug.rb): the battle log.
// Essentials writes it to Data/debuglog.txt when $INTERNAL is set; here the
// lines go to an optional sink (tests and the debug window can attach one).

export const PBDebug = {
  /** Receives every logged line; null discards them. */
  sink: null as ((msg: string) => void) | null,
  /**
   * PBDebug.logonerr: Ruby logs an exception raised in a battle phase, shows it
   * and continues the battle. With this false (the default) the exception is
   * logged and then rethrown out of Battle#pbStartBattle.
   */
  continueOnError: false,

  log(msg: string): void {
    PBDebug.sink?.(msg);
  },

  /** PBDebug.log_message */
  logMessage(msg: string): void {
    PBDebug.sink?.(`[Message] ${msg}`);
  },
};
