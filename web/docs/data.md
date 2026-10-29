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

Some Ruby snippets couldn't be translated into named calls; they stay as
`{"cmd": "script", "ruby": "…"}` (and `{"ruby": …}` conditions) and are listed
in `web/data/reports/conversion.json`. They run through a hand-written
function or not at all — translating them is ongoing work.

## Finding a map

Run the dev server (`cd web && pnpm dev`): it runs in debug mode, which shows
`Map <id> <name> (x,y)` in the top-left corner. `?debug=1` turns it on for
any build, `?debug=0` turns it off.

## The old importer

`pnpm import-rxdata` (`web/tools/convert/convert.rb`) is the one-time import
from `Data/*.rxdata`. Running it again would overwrite everything edited
since, so it refuses unless `REIMPORT=1` is set.
