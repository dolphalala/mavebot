# Mavebot Operating Memory

This repo backs the `mavebot` Discord bot and Codex Slack workflow.

## Product Context

- Discord application name: `mavebot`.
- Discord client/application ID: `1519063290058117170`.
- Main Discord server observed from the bot token: `mevo`
  (`1431280201068843171`).
- Current slash commands:
  - `/ping`: replies with websocket latency.
  - `/iloveyou`: sends a randomized embed love letter for Lana and Allen.
- Allen is Korean and Lana is Croatian; `/iloveyou` copy can use that context.

## Deployment

- GitHub repo: `dolphalala/mavebot`.
- Production server alias: `urba-chatwoot`, host `5.78.127.221`.
- Server app path: `/opt/urba-apps/discord-bot/app`.
- Runtime env path: `/opt/urba-apps/discord-bot/.env`.
- Docker Compose service/container: `urba-discord-bot`.
- Health endpoint: `http://127.0.0.1:4188/healthz`.
- GitHub deploys should use the server-local
  `urba-discord-poll-deploy.timer`, not a public webhook.
- Do not add mavebot endpoints to `chat.urba.group`; that domain belongs to
  Chatwoot.

## Discord Command Registration

- `DISCORD_GUILD_ID` should stay blank for global commands.
- Commands should include `integration_types: [0]` and `contexts: [0]` so they
  appear only through guild/server installation, not through user install.
- If duplicate commands appear in Discord, clear guild-specific commands and
  reload Discord. Also disable User Install in the Developer Portal if it is not
  needed.

## Slack Codex Workflow

- Official Codex Slack requires `@Codex`, replies in threads, and chooses a
  cloud environment automatically. It cannot turn `#bot` into a normal channel
  session by itself.
- A custom Slack bridge stores channel memory in
  `/opt/urba-apps/discord-bot/shared/slack-memory.jsonl`.
- The bridge should use Slack Socket Mode with `SLACK_APP_TOKEN` so Slack events
  arrive over an outbound WebSocket and no public domain is required.
- Slack channel ID for `#bot`: `C0BCRVC2C6Q`.
- Slack app ID for the custom bridge: `A0BCMC7JKRC`.
- The intended default Codex cloud environment is `mavebot`, with
  `dolphalala/mavebot` as the target repo.
- When Codex cloud works on this repo, it should read this file first, then
  inspect the current code before changing behavior.
- Do not ask Allen for generic setup context already captured here. Ask only for
  missing secrets or external UI actions that cannot be done from the repo or
  server.

## Safety

- Never commit `.env`, Discord tokens, Slack tokens, webhook secrets, SSH keys,
  or other credentials.
- Keep this side app isolated from Chatwoot and Bookkeeper.
- Do not mutate Chatwoot, Bookkeeper, nginx, Docker daemon settings, or unrelated
  containers unless Allen explicitly asks for that exact action.
