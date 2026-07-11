# Clash Database Guidance

This file is durable context for ClashKing/ClashPerk-style features in
mavebot. Read it before designing roster, history, activity, war, CWL, or
long-term player/clan tracking commands.

## Product Target

- mavebot should become a useful Clash operations bot, not just a lookup bot.
- The database layer should make commands feel like they remember the clan over
  time: members, rosters, Legend movement, donations, war/CWL rows, and activity.
- Keep data useful for Discord users first. Prefer clear commands and compact
  paged output over trying to mirror every large bot feature at once.
- Broad "make it like ClashKing/ClashPerk" asks require product discovery plus
  implementation. Read `clash-product-delivery.md`,
  `clash-operations-roadmap.md`, and `clash-competitor-research.md`, inspect
  public sources, then produce a command/data model roadmap and build the safe
  first slice.

## Data Reality

- The official Clash API has no webhook/event stream. History is created by
  polling and storing snapshots.
- mavebot can only know detailed changes after a player/clan/war is tracked.
  It cannot reconstruct old detailed attack rows that were never collected.
- Player and clan snapshots can track current values such as trophies, league,
  clan, donations, received troops, attack/defense wins, labels, achievements,
  heroes, pets, troops, spells, siege machines, and equipment.
- War/CWL detail is reliable only when the API exposes the current war or CWL
  war tags while mavebot is polling. Public war logs are useful summary backfill
  but do not provide full player attack rows.
- Legend League tracking is snapshot-based; exact in-day hit history depends on
  polling frequency and can miss changes that happen between polls.

## Store Shape

- Durable state belongs under `/shared/...` with an env-backed path, deploy
  initialization, `1000:1000` ownership, and corrupt JSON backup behavior.
- The current Clash history store is `/shared/clash-history.json`.
- Use normalized top-level buckets:
  - `guilds[guildId]` for server-specific config: default clan tags, channel
    settings, enabled collectors, retention settings, and command preferences.
  - `tracked.players` and `tracked.clans` for enrollment/config.
  - `links[discordUserId].players[tag]` for Discord-user-to-player
    associations. `/link player` seeds player tracking and stores the linked
    tag, name, guild, and timestamps.
  - `players[tag].snapshots[]` for point-in-time player state.
  - `clans[tag].snapshots[]` for point-in-time clan state.
  - `events[]` or per-clan event buckets for derived join/leave, donation,
    trophy, TH, hero, league, and name-change deltas from consecutive snapshots.
  - `wars[warKey]` for current/CWL war detail when available.
  - `cwlGroups[groupKey]` for CWL group metadata and war tags.
  - `rosters[rosterId]` for CWL/event roster definitions, signup state,
    manual notes, player pools, bench state, and generated lineup snapshots.
  - `leaderboards` or derived views for quick display only; rebuild from source
    snapshots when possible.
  - Derived summaries for quick command output, rebuilt from snapshots when
    possible instead of duplicating fragile one-off values.
- Keep records bounded. Add compaction before a store can grow without limit:
  daily rollups for old snapshots, capped raw history, and explicit retention
  rules per bucket.

## Command Direction

- `/player` and `/legends` lookups should seed player tracking when safe.
- `/config clan set tag:<tag>` and `/config clan status` store the server
  default clan in `guilds[guildId]` so users can run roster, war, activity, and
  summary commands without repeating the clan tag.
- `/link player tag:<tag>`, `/link status`, and `/link remove tag:<tag>` store
  Discord-user-to-player mappings in `links[discordUserId].players[tag]`.
- `/track player:<tag>`, `/track clan:<tag>`, and `/track status` are the
  user-visible enrollment surface for `/shared/clash-history.json`. Use them as
  the base for future database-backed commands instead of adding another
  tracking store.
- `/history player:<tag>` is the first user-visible reporting surface for that
  store. It should be expanded with pages/buttons before adding a competing
  history command.
- `/roster plan clan:<tag> size:<5-50> style:<balanced|safe|growth>`,
  `/roster signup player:<tag> clan:<tag> note:<text>`, and
  `/roster status clan:<tag>` are the first roster surfaces on the same store.
  `/roster export clan:<tag> format:<text|csv>` adds a manager-friendly copy
  surface from the same roster/signups/member data. These should be expanded
  with pages/buttons, richer bench state, and generated lineup snapshots before
  adding another roster store.
- `/warstats clan:<tag>`, `/activity clan:<tag>`, and `/summary clan:<tag>` are
  the first operations reports on the same store. They should be expanded with
  pages/buttons, exports, reminders, and deeper war/activity detail before
  creating separate stores or duplicate reporting commands.
- Useful next command families:
  - More `/roster` pages/buttons for event enrollment, role notes, missing
    players, bench candidates, generated CWL lineups, status pages, and
    improved exports.
  - More `/warstats` pages for missed hits, defenses, attack order, and CWL
    rounds as full war rows accumulate.
  - More `/activity` pages for stale accounts, role/TH movement, and season
    summaries.
  - Reminder commands and scheduled report delivery after the source data is
    stable enough to avoid misleading users.
- Commands that depend on data collected over time should say "tracking starts
  now" when history is not yet available, not imply old data exists.

## Response Standard For Data Requests

For requests about ClashKing/ClashPerk-style data, roster planning, CWL/war
history, collecting trophies, or "all players we care about", the worker must:

- Explain the API/history reality before promising results.
- Name the exact store buckets or command handlers it changed.
- Show a concrete example command and what the first response should look like.
- If no command was added, say so plainly and provide the next command to build.
- Never post "backend collector added" without schema, schedule, command usage,
  and verification.

## Implementation Rules

- Put polling/storage logic in focused modules, not directly in `src/index.mjs`.
- Use the official API client in `src/coc.mjs`; do not scrape private data.
- Add tests for normal store writes, corrupt-file recovery, compaction, and
  derived summaries.
- Update `docker-compose.yml`, `scripts/deploy-server.sh`, and
  `docs/context/operating-memory.md` whenever a new durable store is added.
- For big data-output commands, prefer pages/buttons and rendered cards that
  stay readable on Discord mobile.

## Verification

- Run `npm run check`.
- Verify command registration and runtime handlers both changed for slash
  commands.
- For pollers, verify the store file is created, writable by the container user,
  survives restart, and records at least one real or mocked snapshot.
- For live claims, confirm the code reached `origin/main`, the server deploy
  picked it up, `/healthz` is healthy, and the command or collector path was
  exercised after deploy.
