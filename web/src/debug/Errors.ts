// Port of 001_Technical/001_Debugging/003_Errors.rb: Reset, EventScriptError,
// pbGetExceptionMessage, pbPrintException and pbCriticalCode, plus RGSS's
// `print` (a modal message box) and v20.1 Hotfixes' addition to
// Essentials::ERROR_TEXT (Misc bug fixes.rb:9).
//
// Ruby's print blocks the game in an OS message box; here it is an HTML
// dialog over the game screen that resolves when closed (OK, Enter, Space or
// Esc), during which the game's keys are swallowed. The error log Ruby
// appends to errorlog.txt in the save folder goes to localStorage (saves live
// there too).

/** Essentials::VERSION */
export const ESSENTIALS_VERSION = "20.1";

/** Essentials::ERROR_TEXT (001_Settings.rb:472), with v20.1 Hotfixes' line. */
export const Essentials = {
  VERSION: ESSENTIALS_VERSION,
  ERROR_TEXT: "" + "[v20.1 Hotfixes 1.0.7]\r\n",
};

//===============================================================================
// Exceptions and critical code
//===============================================================================
/** class Reset < Exception (F12 soft reset) */
export class Reset extends Error {
  constructor() {
    super("Reset");
    this.name = "Reset";
  }
}

/** class EventScriptError < Exception: a message with the map/event ID generated elsewhere. */
export class EventScriptError extends Error {
  eventMessage: string;

  constructor(message: string) {
    super("");
    this.name = "EventScriptError";
    this.eventMessage = message;
  }
}

/** Hangup ("The script is taking too long"): mkxp raises it; a browser has no equivalent. */
export class Hangup extends Error {
  constructor() {
    super("Hangup");
    this.name = "Hangup";
  }
}

/** pbGetExceptionMessage(e, _script = "") */
export function pbGetExceptionMessage(e: unknown, _script = ""): string {
  if (e instanceof EventScriptError) return e.eventMessage;
  let emessage = e instanceof Error ? e.message : String(e);
  if (e instanceof Hangup) emessage = "The script is taking too long. The game will restart.";
  // Errno::ENOENT -> "File #{filename} not found."
  const enoent = /^No such file or directory - (.*)$/.exec(emessage);
  if (enoent) emessage = `File ${enoent[1]} not found.`;
  return emessage;
}

/** The text of the exception box. */
export function pbExceptionText(e: unknown): string {
  const emessage = pbGetExceptionMessage(e);
  // begin message formatting
  let message = `[Pokémon Essentials version ${Essentials.VERSION}]\r\n`;
  message += `${Essentials.ERROR_TEXT}\r\n`; // For third party scripts to add to
  if (!(e instanceof EventScriptError)) {
    message += `Exception: ${e instanceof Error ? e.name : typeof e}\r\n`;
    message += "Message: ";
  }
  message += emessage;
  // show last 10/25 lines of backtrace
  if (!(e instanceof EventScriptError)) {
    message += "\r\n\r\nBacktrace:\r\n";
    let backtraceText = "";
    const stack = e instanceof Error && e.stack ? e.stack.split("\n").slice(1).map((l) => l.trim()) : [];
    const maxlength = 10; // 25 with $INTERNAL
    for (const line of stack.slice(0, maxlength)) backtraceText += `${line}\r\n`;
    message += backtraceText;
  }
  return message;
}

/** Where pbPrintException appends ("errorlog.txt" in Ruby's save folder). */
export const ERROR_LOG_KEY = "errorlog.txt";

function appendErrorLog(message: string): void {
  try {
    const old = localStorage.getItem(ERROR_LOG_KEY) ?? "";
    // Keep the log from growing without bound (localStorage holds a few MB).
    const text = (old + `\r\n=================\r\n\r\n[${new Date().toString()}]\r\n` + message).slice(-200_000);
    localStorage.setItem(ERROR_LOG_KEY, text);
  } catch {
    // No localStorage (tests, private mode): nothing to log to.
  }
}

/** Replaces print's dialog (tests). Resolves with whether Ctrl was held when it closed. */
export const PrintHooks: { show: ((text: string) => Promise<boolean>) | null } = { show: null };

/**
 * RGSS's print(text): a modal box with an OK button. Resolves with whether Ctrl
 * was held while closing it, or within ~500 ms after (pbPrintException's
 * "coyote time" for copying the message).
 */
export function print(text: string): Promise<boolean> {
  if (PrintHooks.show) return PrintHooks.show(text);
  if (typeof document === "undefined") {
    console.error(text);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("role", "alertdialog");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)";
    const box = document.createElement("div");
    box.style.cssText = "background:#f0f0f0;color:#000;font:13px/1.4 system-ui,sans-serif;max-width:min(720px,92vw);max-height:86vh;display:flex;flex-direction:column;border:1px solid #888;box-shadow:0 8px 30px rgba(0,0,0,.5)";
    const title = document.createElement("div");
    title.textContent = document.title || "Game";
    title.style.cssText = "background:#fff;padding:6px 10px;border-bottom:1px solid #ccc;font-weight:600";
    const pre = document.createElement("pre");
    pre.textContent = text.replace(/\r\n/g, "\n");
    pre.style.cssText = "margin:0;padding:12px 14px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace";
    const bar = document.createElement("div");
    bar.style.cssText = "padding:8px 10px;text-align:right;border-top:1px solid #ccc";
    const ok = document.createElement("button");
    ok.textContent = "OK";
    ok.style.cssText = "min-width:80px;padding:4px 12px";
    bar.append(ok);
    box.append(title, pre, bar);
    overlay.append(box);
    document.body.append(overlay);
    ok.focus();
    let closed = false;
    const close = (ctrl: boolean) => {
      if (closed) return;
      closed = true;
      overlay.remove();
      removeEventListener("keydown", onKey, true);
      removeEventListener("keyup", swallow, true);
      if (ctrl) {
        resolve(true);
        return;
      }
      // Give a ~500ms coyote time to start holding Control
      const late = (e: KeyboardEvent) => {
        if (e.key === "Control") {
          removeEventListener("keydown", late, true);
          clearTimeout(timer);
          resolve(true);
        }
      };
      const timer = setTimeout(() => {
        removeEventListener("keydown", late, true);
        resolve(false);
      }, 500);
      addEventListener("keydown", late, true);
    };
    // While the box is open the game doesn't see the keyboard (it's modal).
    const swallow = (e: Event) => e.stopImmediatePropagation();
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (["Enter", "NumpadEnter", " ", "Escape"].includes(e.key)) {
        e.preventDefault();
        close(e.ctrlKey);
      }
    };
    addEventListener("keydown", onKey, true);
    addEventListener("keyup", swallow, true);
    ok.addEventListener("click", (e) => close(e.ctrlKey));
  });
}

/** pbPrintException(e) */
export async function pbPrintException(e: unknown): Promise<void> {
  const message = pbExceptionText(e);
  // output to log
  appendErrorLog(message);
  const errorlogline = ERROR_LOG_KEY;
  // output message
  console.error(e);
  const ctrl = await print(`${message}\r\nThis exception was logged in ${errorlogline}.\r\nHold Ctrl when closing this message to copy it to the clipboard.`);
  if (ctrl) {
    try {
      await navigator.clipboard?.writeText(message); // Input.clipboard = message
    } catch {
      // The clipboard needs page focus; nothing else to do.
    }
  }
}

/** pbCriticalCode { ... }: 1 if the block ran, 0 if it raised (shown with pbPrintException), 2 on Hangup. */
export async function pbCriticalCode(block: () => Promise<unknown> | unknown): Promise<number> {
  let ret = 0;
  try {
    await block();
    ret = 1;
  } catch (e) {
    if (e instanceof Reset) throw e;
    await pbPrintException(e);
    if (e instanceof Hangup) {
      ret = 2;
      throw new Reset();
    }
  }
  return ret;
}
