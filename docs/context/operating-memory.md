# Mavebot Operating Memory

This repo backs the `mavebot` Discord bot. It is edited through Codex
Desktop/local git work, then deployed by pushing to `origin/main`.

## Product Context

- Discord application name: `mavebot`.
- Discord client/application ID: `1519063290058117170`.
- Main Discord server observed from the bot token: `mevo`
  (`1431280201068843171`).
- Allen is Korean and Lana is Croatian; `/lana` copy can use that context.
- Lana will manage this app.
- The app is Clash of Clans focused. CoC API calls should use the official API
  base URL `https://api.clashofclans.com/v1` and the server-only
  `COC_API_TOKEN`.

## Current Slash Commands

- `/lana`: draws a generated PNG heart image plus a randomized embed love note
  for Lana and Allen.
- `/loveu`: accepts a Discord user, composes a randomized love poem from
  shuffled line pools for them, and attaches a freshly generated heart image.
- `/player`: looks up a Clash of Clans player by tag using the server-side CoC
  API token, then presents compact button pages plus a rendered army image card
  with Clash Wiki/Fandom item icons when available.
- `/legends`: starts or views Legend League trophy tracking for a player tag.
- `/track player:<tag>` and `/track clan:<tag>`: seed the first
  ClashKing/ClashPerk-style history snapshot and enroll the subject in
  `/shared/clash-history.json`; `/track status` summarizes tracked players,
  clans, wars/CWL rows, snapshots, and scheduler state.
- `/history player:<tag>`: shows collected player history from
  `/shared/clash-history.json`.
- `/roster plan/signup/status/export`: roster planning, Discord-member roster
  enrollment, status, and copy/paste exports.
- `/warstats`, `/activity`, and `/summary`: clan operations reports backed by
  the Clash history store.
- `/config clan set/status`, `/link player/status/remove`: setup and identity
  linking commands for roster/history features.
- `/pictionary`: starts a Clash of Clans picture guessing game in the current
  channel.
- `/elder`, `/mute`, `/bench`: elder and moderation vote commands.

## Scope Boundary

This repo is intentionally back to a simple Discord bot. Future code changes
should be requested through Codex Desktop/local git work, not through an
in-channel coding bridge. Do not add chat-control bridges, server-side coding
workers, website services, or database sidecars unless Allen explicitly asks
for that exact surface again.

## Deployment

- GitHub repo: `dolphalala/mavebot`.
- Production server alias: `urba-chatwoot`, host `5.78.127.221`.
- Server app path: `/opt/urba-apps/discord-bot/app`.
- Runtime env path: `/opt/urba-apps/discord-bot/.env`.
- Docker Compose service/container: `discord-bot` / `urba-discord-bot`.
- Health endpoint: `http://127.0.0.1:4188/healthz`.
- CoC API env keys live in the server-only env file:
  `COC_API_BASE_URL` and `COC_API_TOKEN`.
- The server-local `urba-discord-poll-deploy.timer` follows `origin/main` and
  runs `/opt/urba-apps/discord-bot/app/scripts/deploy-server.sh` when GitHub
  changes.
- `deploy-server.sh` builds only the Discord bot image, registers slash
  commands, starts `urba-discord-bot` with `--remove-orphans`, verifies
  `/healthz`, and checks Chatwoot reachability before/after deploy.
- Do not add mavebot endpoints to `chat.urba.group`; that domain belongs to
  Chatwoot.

## Shared Server RAM Notes

- The VPS is shared with Chatwoot and has only about 2 GB RAM plus a 2 GB
  swapfile.
- On 2026-07-12, Docker builds and extra side services created memory pressure
  that made Chatwoot appear down. Runtime usage was modest, but deploy-time
  pressure was real.
- Keep `COMPOSE_PARALLEL_LIMIT=1`, build with low priority, keep container
  memory/pid/log limits, and verify Chatwoot after deploys.
- Avoid adding sidecar services or databases unless the user explicitly asks
  and the server capacity is checked first.

## Durable State

- Legend tracking store:
  `/opt/urba-apps/discord-bot/shared/legends-tracking.json`.
- Clash history collector store:
  `/opt/urba-apps/discord-bot/shared/clash-history.json`.
- Elder/vote moderation store:
  `/opt/urba-apps/discord-bot/shared/elder-votes.json`.
- Pictionary leaderboard store:
  `/opt/urba-apps/discord-bot/shared/pictionary-leaderboard.json`.
- Malformed JSON state should be preserved as a `.corrupt-*` backup before
  starting a clean store.

## Clash Data Model

- Clash history collection follows the ClashKing/ClashPerk-style polling model:
  the official Clash API has no webhooks, so mavebot rotates through due
  tracked subjects on a schedule.
- Env knobs are `CLASH_HISTORY_STORE_PATH`, `CLASH_HISTORY_CLAN_TAGS`,
  `CLASH_HISTORY_PLAYER_TAGS`, `CLASH_HISTORY_INTERVAL_MS`,
  `CLASH_HISTORY_PLAYER_INTERVAL_MS`, `CLASH_HISTORY_CLAN_INTERVAL_MS`, and
  `CLASH_HISTORY_WAR_INTERVAL_MS`.
- `/config`, `/link`, and `/track` are the user-visible setup, linking, and
  enrollment entry points for this store. Roster, history, activity, and
  war/CWL commands should read from the same store rather than creating
  parallel tracking files.

## Discord Command Registration

- `DISCORD_GUILD_ID` should stay blank for global commands.
- Commands should include `integration_types: [0]` and `contexts: [0]` so they
  appear only through guild/server installation, not through user install.
- If duplicate commands appear in Discord, clear guild-specific commands and
  reload Discord. Also disable User Install in the Developer Portal if it is
  not needed.
- When changing a slash command, update both `src/commands.mjs` and the
  `InteractionCreate` handler in `src/index.mjs`; then run command registration
  during deploy. Registering the command without deploying a matching runtime
  handler causes Discord's "The application did not respond" error.
- To clear stale guild-specific commands during deploy while keeping global
  commands active, set `DISCORD_CLEAR_GUILD_COMMANDS_ID` to the affected server
  ID and leave `DISCORD_GUILD_ID` blank.
- `/ping` was removed as a public test command; use the local HTTP `/healthz`
  endpoint for process health instead.
- Current live Discord permissions include Administrator, Manage Roles, and
  Moderate Members, but Discord role hierarchy still applies. If mute/bench
  must affect high-role users, move the mavebot role above those users/roles in
  Discord server role settings.

## Safety

- Never commit `.env`, Discord tokens, webhook secrets, SSH keys, or other
  credentials.
- Keep this side app isolated from Chatwoot and Bookkeeper.
- Do not mutate Chatwoot, Bookkeeper, nginx, Docker daemon settings, or
  unrelated containers unless Allen explicitly asks for that exact action.
