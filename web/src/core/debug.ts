// Essentials' $DEBUG: true when the game is play-tested from RPG Maker XP.
// Here: when running from the Vite dev server, or with ?debug=1 in the URL
// (?debug=0 turns it off on the dev server).

function readDebugFlag(): boolean {
  const param = typeof location !== "undefined" ? new URLSearchParams(location.search).get("debug") : null;
  if (param !== null) return param !== "0";
  return import.meta.env?.DEV ?? false;
}

export const DEBUG = readDebugFlag();
