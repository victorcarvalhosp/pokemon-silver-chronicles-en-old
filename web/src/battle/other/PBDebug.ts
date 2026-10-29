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

  /**
   * PBDebug.logonerr: runs the block; a StandardError raised in it is logged and
   * printed (pbPrintException) and the battle carries on. Ruby's bare `rescue`
   * doesn't catch BattleAbortedException (an Exception), so that propagates.
   */
  async logonerr(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Error) || e.name === "BattleAbortedException") throw e;
      PBDebug.log("");
      PBDebug.log(`**Exception: ${e.message}`);
      PBDebug.log(String(e.stack));
      PBDebug.log("");
      console.error(e); // pbPrintException($!)
      // Ruby shows the exception in a message box and carries on with the battle.
      // In the browser an error that repeats every phase would spin forever, so
      // unless PBDebug.continueOnError is set the error propagates.
      if (!PBDebug.continueOnError) throw e;
    }
  },
};
