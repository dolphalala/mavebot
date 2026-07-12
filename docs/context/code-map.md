# Mavebot Code Map

Use this file to orient remote Codex jobs before editing Discord bot features.
It is a map, not a replacement for reading the current source.

## Runtime Files

- `src/index.mjs`: main Discord bot runtime. Handles `InteractionCreate`,
  slash-command execution, Discord `#codex` message intake, health checks,
  Legend tracker startup, and Discord API calls that require the bot client.
- `src/commands.mjs`: Discord slash command registration data. Any new or
  changed slash command must be represented here.
- `scripts/register-commands.mjs`: registers global or guild commands during
  deploy and clears stale guild-scoped commands when configured.
- `src/discord-codex-control.mjs`: converts Discord `#codex` channel messages
  into server-side worker jobs, formats bundled message bursts, preserves
  bundled Discord message IDs for restart de-duplication, and downloads
  Discord attachments into shared local context. It also separates active
  `contextMessages` from nearby background context so follow-ups can refer to
  prior channel messages without marking those messages as handled jobs.
- `src/codex-worker.mjs`: remote Codex worker queue, prompt construction,
  compacted memory, checks, commits, pushes, deploy wait, and final replies.
  It attaches supported local image files from active Discord jobs and nearby
  Discord context to `codex exec` with `--image`, and owns the final verified
  live/not-live channel wording after checks and deploy verification.
- `src/site-server.mjs`: MaveBase marketplace preview web server. Serves
  `web/public/`, exposes `/api/marketplace/summary`,
  `/api/base-fingerprint/demo`, and `/healthz`.
- `src/site-store.mjs`: optional Postgres connection, schema initialization,
  and database health for the MaveBase marketplace foundation.

## Feature Modules

- `src/coc.mjs`: official Clash of Clans API client helpers and tag handling.
- `src/coc-assets.mjs`: repeatable Clash Wiki/Fandom image lookup and aliasing.
- `src/player-card.mjs`: rendered `/player` army card image output.
- `src/legends-store.mjs`: Legend League tracking storage, polling decisions,
  and page formatting.
- `src/clash-history-store.mjs`: ClashKing/ClashPerk-style polling foundation
  for roster-grade data. Stores tracked players/clans/CWL wars, player and
  clan snapshots, guild default clan config, Discord-user-to-player links, CWL
  groups, full war rows when available, summary public war-log rows, and
  derived per-player war stats under `/shared/clash-history.json`; `/config`
  and `/link` write the setup layer, `/track` seeds player/clan tracking before
  scheduled polling deepens the history, `/history player` formats player
  history from that store, `/roster plan` formats the first roster/CWL planning
  view, `/roster signup/status` stores and reports Discord-member roster
  enrollment from the same data, and `/roster export` formats text/CSV leader
  copy output. `/warstats`, `/activity`, and `/summary` format the first
  clan-operations reports from the same store.
- `src/moderation-store.mjs`: `/elder`, `/mute`, and `/bench` durable vote and
  permanent-record storage.
- `src/pictionary-game.mjs`: `/pictionary` topic pool, difficulty settings,
  answer matching, Clash asset-backed PNG round cards, and durable leaderboard
  storage.
- `src/lana-art.mjs`: generated heart images plus `/lana` and `/loveu` love
  copy.
- `src/base-marketplace-data.mjs`: current MaveBase demo listings, builders,
  market findings, fingerprint demo, and roadmap data for the website preview.
- `web/public/`: Tailwind-powered MaveBase prototype UI assets.

## Change Recipes

### Add Or Change A Slash Command

1. Update `src/commands.mjs`.
2. Update the matching `InteractionCreate` handling in `src/index.mjs`.
3. Add or update focused helper modules if the command has non-trivial logic.
4. Add tests for command registration shape and feature logic.
5. Run `npm run check`.
6. Let the worker commit/push; deploy registers commands automatically.
7. Verify the live command list and runtime behavior after deploy.

Registering a command without a matching runtime handler causes Discord's
"The application did not respond" error.

### Add Durable Server State

1. Store state under `/shared/...` through an explicit env-backed path.
2. Add deploy initialization/chown behavior if the file or directory must exist
   before runtime.
3. Preserve malformed JSON as a `.corrupt-*` backup before resetting.
4. Add tests for normal and malformed state.
5. Document the state file in `operating-memory.md`.

### Change The MaveBase Website

1. Read `docs/context/base-marketplace.md` before changing product direction.
2. Keep the website separate from the Discord bot service and unrelated apps.
3. Update `src/base-marketplace-data.mjs`, `src/site-server.mjs`,
   `src/site-store.mjs`, and `web/public/` as needed.
4. For database changes, update the Postgres schema in `src/site-store.mjs`
   and document server state in `operating-memory.md`.
5. Run `npm run check`.
6. Verify `http://127.0.0.1:4192/healthz` locally or in Docker.
7. After deploy, verify `http://5.78.127.221:4192/` and
   `http://5.78.127.221:4192/healthz`.

### Change Clash Of Clans UI

1. Use `src/coc.mjs` for official API data.
2. Use `src/coc-assets.mjs` for repeatable icon lookup.
3. Prefer compact embeds plus buttons/pages for Discord mobile readability.
4. Use attached rendered images for high-volume army/equipment grids.
5. Update `clash-ui-guidance.md` if a durable UI/source rule changes.

### Change Remote Codex Behavior

1. Update `src/discord-codex-control.mjs`, `src/codex-worker.mjs`, or
   `src/index.mjs` as appropriate.
2. Preserve Discord file metadata and local shared-volume paths so the worker
   can inspect uploads from `/shared/codex-worker/context/discord-files/` and
   attach images to Codex.
3. Keep active message IDs separate from nearby background context. Nearby rows
   can help resolve "above" and "that screenshot", but they must not count as
   handled worker messages unless they are part of the active burst.
4. Preserve the durable Discord JSONL tail behavior: useful user messages,
   uploads, and non-noisy mavebot replies survive restarts, but short working
   acknowledgements and smoke tests do not bloat context.
5. Restart catch-up grouping belongs in `src/discord-codex-control.mjs` and
   should stay per author. Health diagnostics and existing-record checks belong
   in `src/index.mjs`.
6. Add tests around prompt shape, memory compaction, queue behavior, file
   context, message de-duplication, verified live wording, or message cleaning.
7. Update `remote-codex-session.md` and this file when behavior or context
   loading changes.
8. Update `local-codex-parity.md` if the standard for matching local Codex
   Desktop behavior changes.
9. Verify the worker queue, generated memory files, and live channel response.
