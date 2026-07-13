# Mavebot Code Map

Use this file to orient Codex Desktop work before editing Discord bot features.
It is a map, not a replacement for reading the current source.

## Runtime Files

- `src/index.mjs`: main Discord bot runtime. Handles `InteractionCreate`,
  slash-command execution, Pictionary guess messages, health checks, Legend
  tracker startup, Clash history collector startup, and Discord API calls that
  require the bot client.
- `src/commands.mjs`: Discord slash command registration data. Any new or
  changed slash command must be represented here.
- `scripts/register-commands.mjs`: registers global or guild commands during
  deploy and clears stale guild-scoped commands when configured.
- `scripts/deploy-server.sh`: server deploy path. It pulls `origin/main`,
  builds the Discord bot image, registers commands, starts only
  `urba-discord-bot`, and verifies `/healthz`.
- `scripts/poll-deploy.sh`: server timer entrypoint that watches `origin/main`
  and runs `deploy-server.sh` when the repo advances.

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
  derived per-player war stats under `/shared/clash-history.json`.
- `src/moderation-store.mjs`: `/elder`, `/mute`, and `/bench` durable vote and
  permanent-record storage.
- `src/pictionary-game.mjs`: `/pictionary` topic pool, difficulty settings,
  answer matching, Clash asset-backed PNG round cards, and durable leaderboard
  storage.
- `src/lana-art.mjs`: generated heart images plus `/lana` and `/loveu` love
  copy.

## Scope Boundary

Keep this repo focused on the Discord bot runtime and slash commands. Do not
add chat-control bridges, server-side coding workers, website services, or
database sidecars unless Allen explicitly asks for that exact surface again.

## Change Recipes

### Add Or Change A Slash Command

1. Update `src/commands.mjs`.
2. Update the matching `InteractionCreate` handling in `src/index.mjs`.
3. Add or update focused helper modules if the command has non-trivial logic.
4. Add tests for command registration shape and feature logic.
5. Run `npm run check`.
6. Push to `origin/main`; the server polling timer deploys and registers
   commands automatically.
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

### Change Clash Of Clans UI

1. Use `src/coc.mjs` for official API data.
2. Use `src/coc-assets.mjs` for repeatable icon lookup.
3. Prefer compact embeds plus buttons/pages for Discord mobile readability.
4. Use attached rendered images for high-volume army/equipment grids.
5. Update `clash-ui-guidance.md` if a durable UI/source rule changes.
