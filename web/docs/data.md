# Where the game's data lives

Since 2026-10-29 the web port is the game. RPG Maker XP is no longer used:
maps, events and the rest of its data were imported once into `web/data/`,
which is tracked in git and edited directly.

| What | Source (edit this) | Notes |
|---|---|---|
| Maps: tiles, events | `web/data/maps/MapNNN.json` | One file per map, ids as in RPG Maker |
| Map list: names, tree, sizes | `web/data/map-infos.json` | |
| Tilesets: passages, priorities, terrain tags | `web/data/tilesets.json` | Tileset images are in `Graphics/Tilesets` |
| Common events | `web/data/common-events.json` | Same command format as map events |
| Switch/variable names, start position, title music… | `web/data/system.json` | |
| Map animations (Show Animation) | `web/data/animations.json` | |
| Battle move animations | `web/data/pkmn-animations.json` | |
| Quests (MQS) | `web/data/quests.json` | |
| Pokémon, moves, items, abilities, trainers, encounters, map metadata… | `PBS/*.txt` | Compiled to `web/data/pbs/` (not tracked) by `pnpm pbs` |
| Graphics, audio, fonts | `Graphics/`, `Audio/`, `Fonts/` | Read directly; MIDI/WMA are rendered to `web/.audio-cache` by `pnpm audio` |

## Map and event JSON

A map has its size, tileset, music, `layers` (3 layers of `[y][x]` tile ids)
and `events`. Each event has `id`, `name`, `x`, `y` and `pages`; each page has
its conditions, graphic, movement settings, trigger and `list` of commands.

Commands are named objects instead of RPG Maker's numeric codes, e.g.

```json
{"cmd": "text", "text": "You must be \\PN."}
{"cmd": "moveRoute", "character": 2, "route": {"repeat": false, "skippable": false, "list": [{"move": "down"}, {"move": "left"}]}}
{"cmd": "call", "fn": "FollowingPkmn.move_route", "args": [[{"call": "PBMoveRoute::Left"}], true]}
{"cmd": "if", "cond": {"switch": 657, "value": true}, "then": [...], "else": [...]}
```

`character` is the event id (`-1` the player, `0` this event). Script calls
(`call`, `script` conditions) name functions registered in
`web/src/game/scriptApi.ts` and `web/src/game/scripts/*.ts`; every command and
condition shape is typed in `web/src/data/events.ts`.

A Script command with Ruby local variables keeps its statements together, as
Ruby runs them as one script (consecutive Script commands are one script
there too):

```json
{"cmd": "script", "do": [
  {"cmd": "assign", "target": "pkmn", "args": [], "op": "=", "value": {"call": "Pokemon.new", "args": ["SNORLAX", 60]}},
  {"cmd": "call", "fn": "learn_move", "on": {"call": "pkmn"}, "args": ["SURF"]},
  {"cmd": "call", "fn": "WildBattle.start", "args": [{"call": "pkmn"}]}
]}
```

A Ruby block/proc is `{"proc": ["pkmn"], "body": <expression>}` (e.g. the
filter `pbChoosePokemon` takes, or `$player.pokemon_party.each`), and a hash
literal is `{"hash": {"rank": 3}}`. Snippets that are real logic (loops over
the party…) call a function named after what they do, in
`web/src/game/scripts/eventScripts.ts`. Names the original game doesn't define
either (old Essentials leftovers) raise Ruby's error, as there
(`web/src/game/scripts/rubyErrors.ts`, listed in `docs/original-game-bugs.md`).

`web/src/data/eventScripts.test.ts` checks that every call in the maps,
common events and script switches resolves, that no untranslated Ruby is
left (`web/data/reports/conversion.json`, the importer's list of snippets it
couldn't translate, is now empty), that every command is one the interpreter
runs and that messages only use codes the message window knows.

## Finding a map

Run the dev server (`cd web && pnpm dev`): it runs in debug mode, which shows
`Map <id> <name> (x,y)` in the top-left corner. `?debug=1` turns it on for
any build, `?debug=0` turns it off.

## The old importer

`pnpm import-rxdata` (`web/tools/convert/convert.rb`) is the one-time import
from `Data/*.rxdata`. Running it again would overwrite everything edited
since, so it refuses unless `REIMPORT=1` is set.

## Writing files from the game (Debug mode)

The Debug menu's commands that write files in Essentials (Compile Data,
Create PBS File(s), Fix Invalid Tiles, Rename Outdated Files, the Town Map
editor, creating a missing trainer, Import Animations…) can't touch the disk
from a browser. On the dev server (`pnpm dev`) they go through a small file
endpoint instead (`web/tools/devFiles.ts`, installed by `vite.config.ts`):

| Route | Does |
|---|---|
| `GET /__dev/ping` | `{ok: true}` when the endpoint exists |
| `GET /__dev/read?path=PBS/items.txt` | a file under `web/data/`, `PBS/`, `Graphics/`, `Audio/` or `Fonts/` |
| `GET /__dev/list?dir=PBS` | the files under a folder (same folders) |
| `POST /__dev/write` `{path, content, encoding?, append?}` | writes a file under `web/data/` or `PBS/` |
| `POST /__dev/move` `{from, to}` | renames within `web/data/` or `PBS/` |
| `POST /__dev/compile-pbs` | runs `pnpm pbs` (PBS → `web/data/pbs/`) |

Paths are relative to the game root. Writes anywhere else (`Graphics/`,
`Audio/`, `Animations/`, `..` tricks, absolute paths, symlinks out of the
repo) are refused; the rule is `src/debug/devFilesPolicy.ts`. The endpoint
exists only under `vite` (dev): `vite build` / `vite preview` don't install
it, and on a static host the commands say in the message window that they
can't write. The browser side is `src/debug/devFiles.ts`
(`DevFiles.write/read/list/move/compilePbs`, `devWriteOrExplain`).

After Compile Data the game reloads `web/data/pbs/` itself; after writing a
PBS file, run Compile Data (or `pnpm pbs`) for the game to use it. Changed
files are ordinary working-tree changes: review them with `git diff`.
