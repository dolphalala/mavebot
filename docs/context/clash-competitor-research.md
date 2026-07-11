# Clash Competitor Research

This file is durable context for requests like "look into ClashKing and
ClashPerk", "build it like ClashKing", or "create the same data structure".
Read it with `clash-product-delivery.md` and
`clash-database-guidance.md` before answering broad Clash product or
data-collection asks.

## Public Sources To Check

- ClashKing docs: https://docs.clashk.ing/
- ClashKing docs repo: https://github.com/ClashKingInc/ClashKingDocs
- ClashKing bot repo: https://github.com/ClashKingInc/ClashKingBot
- ClashPerk docs: https://docs.clashperk.com/
- ClashPerk repo: https://github.com/clashperk/clashperk
- Official Clash of Clans API: https://developer.clashofclans.com/

Refresh these sources when the user asks for current competitor behavior. Do
not copy private data or clone an exact product. Use the public feature shape
to design mavebot's own focused version.

## What The Competitors Teach

- ClashKing positions itself as an all-in-one Clash Discord bot and documents
  setup, player linking, family/clan tools, rosters, war/CWL tools, legends,
  leaderboards, reminders, logs, and server automation.
- ClashKing's roster docs frame rosters as the core tool for CWL and event
  preparation: create a roster, manage player signup, manage players, find
  missing players, and post signup flows.
- ClashKing's war/CWL docs emphasize instant visibility into current war/CWL
  state: status, ranking, search, star leaderboards, missed hits, rounds,
  members, hero levels, and TH levels.
- ClashKing's Legend docs split Legend League into search, clan, stats,
  history, and poster commands.
- ClashPerk's public repo and reference docs show the larger architecture:
  Discord commands grouped by activity, history, legend, link, rosters, setup,
  summary, war/CWL, and exports; a Clash API client; resolver/linking helpers;
  log handlers; schedulers; and database collections for links, player/clan
  caches, clan logs, wars, CWL groups, player seasons, legend attacks,
  rosters, reminders, leaderboards, exports, and usage analytics.
- ClashPerk-style logs are mostly derived from scheduled polling and deltas:
  join/leave, promotions, town hall upgrades, name changes, donation changes,
  war attacks/results, clan games, capital, legend movement, and last-seen.

## Mavebot Product Direction

mavebot should become a focused clan-operations bot first:

- Setup/linking: configure a guild clan, link Discord users to player tags,
  resolve players from tags, users, or saved aliases.
- Tracking: enroll clans and players, poll official API snapshots, compact old
  history, and explain when history starts now because old details were not
  collected.
- Player views: keep `/player` compact, visual, and paged for profile,
  heroes/equipment, army, achievements, activity, and history.
- Roster/CWL: support signup, roster pools, TH/hero summaries, notes, bench
  candidates, missed signup checks, and CWL lineup planning.
- War/CWL stats: collect current wars/CWL while active, summarize attacks,
  defenses, stars, destruction, missed hits, and member reliability.
- Activity/history: show donation deltas, trophy/Legend movement, clan joins
  and leaves, clan games/capital when available, stale accounts, and season
  summaries.
- Leadership commands: expose clear summaries before advanced automation:
  `/track`, `/history`, `/roster`, `/warstats`, `/activity`, `/summary`,
  `/config`, and export commands as the product grows.

## Required Worker Response For Broad Clash Asks

When a Discord user asks to research ClashKing/ClashPerk, build the same data
structure, create a roster/war/activity system, or design a competitor-style
feature, the worker must pass the delivery gate in
`clash-product-delivery.md`. It must not give a tiny "done" answer. It should
do the local Codex equivalent:

1. Inspect the current mavebot source and context docs.
2. Check public competitor docs/source when internet is available.
3. State "What I learned" in plain language.
4. State what mavebot can and cannot know from the official Clash API.
5. Give the command/data model roadmap.
6. Implement the safe first slice when the request asks to build, create, or
   start collecting. Prefer the next missing visible slash-command slice over
   backend-only work. If only a plan is safe, explain why and name the exact
   next slice.
7. Update docs/context when the product decision should survive future turns.
8. Add or update tests for code changes.
9. Give a compact demo or example command/result.

Bad answer patterns to avoid:

- "Added the ClashKing/ClashPerk backend collector. Done and live."
- "The backend is ready" when no user-visible command or demo exists.
- "I made it like ClashKing" without schema, commands, collection schedule, and
  verification.
- "Use `/roster`" without saying what setup is required, what data exists now,
  and what history starts collecting from this point forward.
- Ignoring plan/demo questions after doing code.
- Researching competitors and then ending with no command, no plan, and no
  explicit blocker.

## Practical First Slices

Prefer these incremental slices over trying to build every large-bot feature at
once:

- The first slice now exists: `/track player`, `/track clan`, and
  `/track status` enroll records and seed snapshots in
  `/shared/clash-history.json`.
- `/history player` now exists for trophy, clan, donation, current stat, and
  war/CWL summaries from the existing store.
- `/roster plan` now exists for a read-only CWL/war planning page from current
  tracked members, TH levels, heroes, equipment, activity, and collected
  war/CWL rows. It also calls out data quality so users understand when the
  first snapshot is still shallow.
- `/roster signup` and `/roster status` now exist so Discord members can join a
  CWL/event pool and leaders can see missing players, notes, and shallow data
  warnings from the same store.
- Add `/warstats clan` after current-war/CWL collection has enough real rows to
  summarize attacks and missed hits without misleading users.
- Add exports after the data model is stable.

Each slice should leave the Discord user with a working command, a realistic
demo, or a clear explanation of the exact data that will become useful after
scheduled snapshots accumulate.

When the user asks for "the same data structure" or "start collecting", first
check whether `/track` covers the requested enrollment flow. If it does, build
the next missing visible command from the list above. If it does not, fix
`/track` before adding deeper reporting.
