# Port status and how to resume

Last updated 2026-10-29, at commit 84153bd on branch `feature/web-runtime`
(nothing pushed yet — push / PR only when the owner says so).

The browser port of Pokémon Silver Chronicles (Essentials v20.1 + 49 plugins)
is in `web/`. Almost every script and plugin is ported and checked against the
original Ruby. RPG Maker XP is retired: the game data in `web/data/` is the
source (see `docs/data.md`).

## Running it

```bash
cd web && pnpm install     # first time only
pnpm pbs                   # compile PBS/*.txt → web/data/pbs (not tracked; needed after a fresh clone or a PBS edit)
pnpm dev                   # http://localhost:5317 — hot reload, debug mode on
pnpm dev:stable            # http://localhost:5318 — no hot reload (for long play-tests)
npx tsc --noEmit && npx vitest run   # typecheck + ~3300 tests
```

- Debug mode (dev server, or `?debug=1`): skips the title, F9 opens the Debug
  menu, the corner shows `Map <id> <name> (x,y)`. `?debug=0` turns it off.
- Q cycles the game speed (Speed Up plugin). Saves are in IndexedDB, per origin.
- Optional: `pnpm audio` renders MIDI/WMA to OGG with soundfont.sf2.

## Where things are

| Doc | What |
|---|---|
| `docs/data.md` | Where the game data lives and how events are written |
| `docs/script-coverage.md` | Every Essentials script file: ported / where / notes |
| `docs/plugin-coverage.md` | Every plugin file: ported / where / notes |
| `docs/original-game-bugs.md` | Bugs of the original the port copies on purpose (and the few fixed on purpose) |

Ruby comparison harnesses: `web/tools/ruby-ref/*.rb` (system Ruby 2.6; they
load the real scripts + plugins headless and write the `*Reference.json` the
tests replay).

## What's left

1. **Shadow Pokémon in battle** — started (commit 84153bd: battler checks,
   Hyper Mode state, `MoveEffects_Shadow.ts`, Call/item hooks) but not
   finished and not yet compared with Ruby. Source: the battle half of
   `Data/Scripts/014_Pokemon/001_Pokemon-related/002_ShadowPokemon_Other.rb`
   (~:163-404). Needs a differential test (a few battles with a Shadow
   Pokémon: Shadow moves, Hyper Mode in/out, Call).
2. **Small script leftovers** (the "partial" rows of `docs/script-coverage.md`):
   RPG_Sprite effects (`001_Technical/006_RPG_Sprite.rb:63-415`),
   `Window_MultilineTextEntry` (`007_Objects and windows/012_TextEntry.rb:261`),
   Spinda's spots (`014_Pokemon/001_Pokemon-related/001_FormHandlers.rb:37-61`),
   `Dir.create/all_dirs/delete_all` (needs a dev-endpoint delete route;
   `001_Technical/002_Files/001_FileTests.rb:48-88`), DEBUG recovery from a
   missing map (`003_Game processing/001_StartGame.rb:84-92`), cut-scene skip
   (`004_Game classes/002_Game_System.rb:268`).
3. **Load screen "Mystery Gift" option** (`016_UI/013_UI_Load.rb`) in
   `src/ui/load/loadScreen.ts`, calling `pbDownloadMysteryGift` from
   `src/ui/MysteryGift.ts`.
4. **Small fixes flagged by agents:** `src/ui/pokegear/phone.ts` uses
   `Math.random` (should be `core/random`) and turns `:YOUNGSTER`-style
   contacts into `pbCommonEvent(NaN)`; `IconSprite.setBitmapFile` restores the
   old `src_rect` where mkxp-z resets it.
5. **Deferred by the owner:** random dungeons
   (`012_Overworld/008_Overworld_RandomDungeons.rb`).
6. **Original-game bugs** (`docs/original-game-bugs.md`): kept on purpose;
   the owner will pick which to fix later. The ones players hit first are
   event crashes now easy to fix in the map JSON: Day Care (map 440), Name
   Rater (map 215), Cinnabar Lab, parallel common event 2 (switch 488), the
   Marts on maps 204/218/822, Fillet Away / Chilly Reception (PBS names).
7. **Not started:** screen-by-screen comparison with the original running in
   CrossOver (needs the owner's OK for computer control), a production build
   and hosting, push + PR.

## Working rules (agreed with the owner)

- Port everything, even scripts no event uses (only random dungeons wait).
- Port from the Ruby source, never from memory; mirror Essentials' classes
  and files (camelCase names); async/await for blocking loops; timings in
  seconds (logic 60 Hz, original 40 fps).
- Original bugs: reproduce them, mark `NOTE (Ruby parity)` with Ruby
  file:line, list them in `docs/original-game-bugs.md`; fix only when the
  owner picks them (then fix both the TS and the Ruby harness, with a test).
- Prove changes with tests against the Ruby harness and a check in the
  browser.
- Token budget: the owner asked to stop at 70% of the weekly quota
  (check with the app's usage tool) and commit the work in progress there.
- Commits: no Claude attribution; branch names `{fix|chore|feature}/…`;
  when reporting work, give the local URL where it runs.
