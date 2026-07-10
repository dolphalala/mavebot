# Mavebot Operating Memory

This repo backs the `mavebot` Discord bot and Discord `#codex` remote Codex
workflow.

## Product Context

- Discord application name: `mavebot`.
- Discord client/application ID: `1519063290058117170`.
- Main Discord server observed from the bot token: `mevo`
  (`1431280201068843171`).
- Current slash commands:
  - `/lana`: draws a generated PNG heart image plus a randomized embed love
    note for Lana and Allen.
  - `/loveu`: accepts a Discord user, composes a randomized love poem from
    shuffled line pools for them, and attaches a freshly generated heart image.
  - `/player`: looks up a Clash of Clans player by tag using the server-side
    CoC API token, then presents compact button pages plus a rendered army
    image card with Clash Wiki/Fandom item icons when available.
  - `/legends`: starts or views Legend League trophy tracking for a player tag.
  - `/pictionary`: starts a Clash of Clans picture guessing game in the current
    channel.
  - `/elder`: lets a server admin or existing elder grant elder status to a
    Discord user.
  - `/mute`: elder vote command. Three unique elder votes mute the target for
    5 minutes and append the result to the permanent moderation record.
  - `/bench`: elder vote command. Three unique elder votes assign the target a
    `benched` role and append the result to the permanent moderation record.
- Allen is Korean and Lana is Croatian; `/lana` copy can use that context.
- Lana will manage this app.
- The app is Clash of Clans focused. CoC API calls should use the official API
  base URL `https://api.clashofclans.com/v1` and the server-only
  `COC_API_TOKEN`.

## Deployment

- GitHub repo: `dolphalala/mavebot`.
- Production server alias: `urba-chatwoot`, host `5.78.127.221`.
- Server app path: `/opt/urba-apps/discord-bot/app`.
- Runtime env path: `/opt/urba-apps/discord-bot/.env`.
- Codex worker-only env path: `/opt/urba-apps/discord-bot/codex-worker.env`.
- CoC API env keys live in the server-only env file:
  `COC_API_BASE_URL` and `COC_API_TOKEN`.
- Docker Compose service/container: `urba-discord-bot`.
- Remote Codex worker container: `urba-codex-worker`.
- Health endpoint: `http://127.0.0.1:4188/healthz`.
- GitHub deploys should use the server-local private deploy webhook when
  configured. The webhook service is `urba-discord-deploy-webhook.service`,
  backed by `scripts/deploy-webhook.py`, and should bind to the Docker bridge
  IP so the `codex-worker` container can trigger it without exposing a public
  port. The `urba-discord-poll-deploy.timer` remains the fallback and runs
  every 30 seconds.
- The server poll deploy only follows `origin/main`. A Codex task that only
  edits a branch or PR is not deployed and must not be described as live.
- Do not add mavebot endpoints to `chat.urba.group`; that domain belongs to
  Chatwoot.
- The deploy script builds `discord-bot` and `codex-worker`. It recreates
  `codex-worker` only when no worker job is active; if a job is in
  `processing`, it writes `shared/codex-worker/restart-needed` and completes
  the worker recreate after the queue is clear.

## Durable State

- Legend tracking store:
  `/opt/urba-apps/discord-bot/shared/legends-tracking.json`.
- Clash history collector store:
  `/opt/urba-apps/discord-bot/shared/clash-history.json`.
  Deploy initializes and chowns it as `/shared/clash-history.json`.
- Elder/vote moderation store:
  `/opt/urba-apps/discord-bot/shared/elder-votes.json`.
- Pictionary leaderboard store:
  `/opt/urba-apps/discord-bot/shared/pictionary-leaderboard.json`.
- Malformed JSON state should be preserved as a `.corrupt-*` backup before
  starting a clean store.
- Clash history collection follows the ClashKing/ClashPerk-style polling model:
  the official Clash API has no webhooks, so mavebot rotates through due
  tracked subjects on a schedule. Env knobs are
  `CLASH_HISTORY_STORE_PATH`, `CLASH_HISTORY_CLAN_TAGS`,
  `CLASH_HISTORY_PLAYER_TAGS`, `CLASH_HISTORY_INTERVAL_MS`,
  `CLASH_HISTORY_PLAYER_INTERVAL_MS`, `CLASH_HISTORY_CLAN_INTERVAL_MS`, and
  `CLASH_HISTORY_WAR_INTERVAL_MS`.

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

## Discord Codex Workflow

- Discord `#codex` channel ID: `1523893930993778698`.
- Discord `#codex` is the only remote control surface. Any non-bot user in
  that channel can ask for code changes, explanations, screenshot review,
  command work, deploy verification, or context maintenance.
- The active code path is Discord `#codex` to the server-side `codex-worker`
  compose profile. Normal `#codex` messages become JSON jobs in
  `/opt/urba-apps/discord-bot/shared/codex-worker/jobs`; the worker runs Codex
  CLI in `/opt/urba-apps/discord-bot/shared/codex-worker/repo`, commits,
  pushes `origin/main`, triggers the private deploy webhook when configured,
  then waits for the live app checkout and runtime health to verify the change.
- Discord `#codex` requires the Discord Developer Portal Message Content
  Intent because users are not tagging mavebot. Discord can report this enabled
  setting as either the full `GatewayMessageContent` application flag or the
  `GatewayMessageContentLimited` flag; both mean the bot may request
  `MessageContent`.
- Live adjacent Discord messages are debounced by channel and author, so one
  user can send multiple text messages and screenshots as one prompt without
  merging simultaneous prompts from other users.
- Discord attachments are downloaded immediately into
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/discord-files/` and
  passed to Codex as local files.
- Discord `#codex` keeps a bounded durable nearby-channel context log at
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/discord-channel-context.jsonl`
  by default. `DISCORD_CODEX_CONTEXT_LOG_PATH` can override the path and
  `DISCORD_CODEX_CONTEXT_LOG_MAX_ROWS` controls the retained tail.
- `DISCORD_CODEX_CONTEXT_BACKFILL_LIMIT` controls how many recent Discord
  messages are fetched on startup to refresh the durable context log.
  `DISCORD_CODEX_CATCHUP_LIMIT` controls how many recent messages are eligible
  to enqueue as missed work.
- When a job is queued, recent same-channel rows from the durable log and live
  cache that are not part of the active burst are included as `nearbyText`,
  `nearbyContextMessages`, and `nearbyFiles`.
- Discord restart catch-up groups still-unhandled adjacent messages into the
  same worker job instead of replaying each recent message separately.
- Short queue checks such as `status`, `queue`, `are you busy`, and `what are
  you working on?` answer immediately from runtime queue/auth state. They write
  completed immediate records so restart catch-up does not replay them.

## Worker Memory And Auth

- Worker-side durable context is stored under
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/`:
  `transcript.jsonl` is normalized history, while `summary.md`, `recent.md`,
  and `session.md` are regenerated after each turn to keep prompts bounded.
- Completed worker job JSON records in `done/` include sanitized
  `codexMessage` and `finalMessage` fields. Use these for audits of what the
  inner Codex subprocess answered versus what mavebot posted to the channel.
- Completed and failed worker job JSON records include `finishedAt`,
  `durationMs`, and `workerTiming.stages`. Use those fields to debug slow
  responses before changing queue or deploy behavior.
- While a job is in `processing`, the worker persists `currentStage` plus the
  in-progress `workerTiming` into that job record. The Discord bot `/healthz`
  response exposes `discordCodexWorkerQueue` with queue counts and safe
  current-stage previews.
- When `codex exec` fails with a Codex auth error, the worker moves the request
  into `/opt/urba-apps/discord-bot/shared/codex-worker/auth-blocked/`. The
  worker periodically checks `codex login status`; when that looks logged in,
  it runs a tiny `codex exec` auth probe before requeueing saved jobs.
- The worker refreshes `context/auth-retry-state.json` on startup and on a
  heartbeat with `codex login status`, even when there are no blocked jobs.
- `codex login status` can still say "Logged in using ChatGPT" after the
  refresh token has been revoked. Verify auth with a tiny no-code `codex exec`
  smoke inside `urba-codex-worker`; `HTTP 401`, `token_invalidated`, or
  `refresh_token_invalidated` means the server must be logged in again.
- Current server Codex auth is stored under
  `/opt/urba-apps/discord-bot/codex-home`. To switch the server worker to a
  different ChatGPT/Codex account, pause or drain the worker, back up that
  `codex-home`, run an interactive `codex login` or device-auth flow inside
  the worker/container using the new account, restart `urba-codex-worker`, then
  run a no-code Discord `#codex` smoke job. Do not print, commit, or copy auth
  files.

## Context Loading

- When the server-side worker works on this repo, it should read
  `docs/context/README.md` first, then this file, then
  `docs/context/discord-session.md`, then
  `docs/context/remote-codex-session.md`, then `docs/context/code-map.md`,
  then any relevant focused context file such as
  `docs/context/clash-database-guidance.md` or
  `docs/context/clash-ui-guidance.md`, then inspect the current code before
  changing behavior.
- Do not ask Allen for generic setup context already captured here. Ask only
  for missing secrets or external UI actions that cannot be done from the repo
  or server.

## Safety

- Never commit `.env`, Discord tokens, webhook secrets, SSH keys, or other
  credentials.
- Keep this side app isolated from Chatwoot and Bookkeeper.
- Do not mutate Chatwoot, Bookkeeper, nginx, Docker daemon settings, or
  unrelated containers unless Allen explicitly asks for that exact action.
