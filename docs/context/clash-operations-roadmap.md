# Clash Operations Roadmap

This file turns broad "make it like ClashKing/ClashPerk" Discord asks into a
concrete mavebot command plan. Read it with `clash-product-delivery.md`,
`clash-competitor-research.md`, and `clash-database-guidance.md` before working
on roster, CWL, war, activity, history, setup, linking, or collection requests.

## What Allen Is Trying To Build

mavebot should become a practical Clash clan-operations bot. The useful product
is not "a lookup command" and not "a backend collector." It is a Discord bot
that lets clan leaders:

- configure the server's main clan once;
- link Discord users to their Clash player tags;
- enroll clans and players for scheduled collection;
- see player, roster, CWL, war, Legend, activity, and history pages;
- collect snapshots over time and explain what history starts now;
- build CWL/event rosters from tracked members, signups, TH levels, heroes,
  equipment, activity, and reliability;
- export or summarize leadership views without forcing users to read raw JSON;
- present readable mobile Discord cards with real Clash data and icons where the
  source is reliable.

## Current Working Base

Before promising new command names, inspect `src/commands.mjs` and
`src/index.mjs`. As of this context file, the known base is:

- `/player tag:<tag>`: live player lookup.
- `/legends player:<tag>`: Legend-oriented player view.
- `/track player:<tag>`, `/track clan:<tag>`, `/track status`: enrollment and
  snapshot seeding for `/shared/clash-history.json`.
- `/history player:<tag>`: player history from stored snapshots.
- `/roster plan clan:<tag> size:<5-50> style:<balanced|safe|growth>`: current
  roster planning surface.
- `/roster signup player:<tag> clan:<tag> note:<text>` and
  `/roster status clan:<tag>`: first signup/status flow.
- `/warstats clan:<tag>`, `/activity clan:<tag>`, `/summary clan:<tag>`: first
  operations reports from the same history store.

Source code is the final authority. If this list is stale, update this file in
the same commit as the command change.

## Default Next Visible Slices

When the user asks broadly and does not name a specific command, choose the
first feasible missing slice from this list after checking current source:

1. **Server setup/default clan.** Build `/config clan set`, `/config clan
   status`, and any needed guild settings in `guilds[guildId]`. This reduces
   repeated clan tags and makes every later command feel server-aware.
2. **Player linking.** Build `/link player`, `/link status`, and `/link remove`
   using `links[discordUserId].players[]`. Linking should seed tracking and let
   roster/signup commands resolve a Discord member without repeatedly typing a
   tag.
3. **Roster pages and exports.** Improve the existing `/roster` subcommands
   with paged summaries, missing signup views, bench candidates, notes, lineup
   snapshots, and export/share output.
4. **War/CWL detail.** Extend `/warstats` for missed hits, attack rows, defense
   summaries, CWL rounds, and player reliability when full war rows have been
   collected.
5. **Activity and season summaries.** Extend `/activity` and `/summary` for
   stale accounts, donation/trophy deltas, joins/leaves, season views, clan
   games/capital where available, and leaderboards.
6. **Leadership exports and reminders.** Add export/reminder/report surfaces
   only after the underlying data is real enough to avoid misleading users.

Do not skip directly to a backend-only collector when one of these command
slices is feasible.

## Prompt-To-Action Rules

- If the user says "research ClashKing/ClashPerk", inspect public source shape
  and current mavebot source, then give the product lesson and choose a command
  slice.
- If the user says "same data structure", "start collecting", or "track all
  players we care about", verify `/track` and `/shared/clash-history.json`
  first. If those exist, build the next missing visible command, usually setup
  or linking.
- If the user asks for `/roster build`, `/roster enroll`, or another stale name,
  correct the plan to the commands that exist, then build or rename the next
  real command in the same run.
- If the user asks for a plan or demo, answer with the plan or demo even if you
  also changed code.
- If the task is too large for one run, ship a narrow command slice and name the
  next one. Do not pretend the whole ClashKing/ClashPerk product is done.
- If official API history is unavailable because mavebot was not tracking yet,
  say "tracking starts now" and show what will become useful after snapshots.

## Good First Answer Shape

For broad product work, the final answer should feel like this:

```text
I found the gap: the bot had tracking, but no server setup/linking flow, so
leaders still had to type tags everywhere.

What I learned: ClashKing/ClashPerk-style bots make setup and linking the base
layer before roster and war views feel good.
Data reality: old detailed war rows cannot be backfilled unless they were
collected, but current player/clan snapshots can start now.

Built now: /config clan set and /config clan status.
Data model: guilds[guildId].defaultClanTag in /shared/clash-history.json.
Try: /config clan set tag:#JY99CJC8
What it shows: the saved default clan and which commands can use it next.

Still missing: /link player so roster signup can resolve Discord users.
```

Use the exact labels required by `clash-product-delivery.md` unless there is a
real blocker.

## Do Not Do

- Do not answer "backend collector added" as the whole result.
- Do not say "done and live" unless a command or visible behavior is actually
  deployed and verified.
- Do not invent slash command names that are not registered.
- Do not add a second store when `/shared/clash-history.json` can support the
  workflow.
- Do not hide behind competitor research. Convert research into mavebot's next
  leadership workflow.
