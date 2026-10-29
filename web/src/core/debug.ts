// Essentials' $DEBUG: true when the game is play-tested from RPG Maker XP.
// Here: when running from the Vite dev server, or with ?debug=1 in the URL
// (?debug=0 turns it off on the dev server). Everything Essentials gates on
// $DEBUG reads this: the Debug menu (pause menu, F9 on the map and in battle),
// the party/storage/Bag "Debug" commands, and the Ctrl shortcuts (walk through
// walls, skip battles, always run/catch...).

function readDebugFlag(): boolean {
  const param = typeof location !== "undefined" ? new URLSearchParams(location.search).get("debug") : null;
  if (param !== null) return param !== "0";
  // Under vitest (also a dev build) it stays off, as in a released game, so
  // tests see the game's normal menus; a test can vi.mock this module.
  if (import.meta.env?.MODE === "test") return false;
  return import.meta.env?.DEV ?? false;
}

export const DEBUG = readDebugFlag();
