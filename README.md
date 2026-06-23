# Discord Bot Foundation

Minimal Dockerized Discord bot foundation for the shared `urba-chatwoot` host.

## What It Includes

- `discord.js` v14 bot process
- `/ping` slash command handler
- slash command registration script
- local-only `/healthz` HTTP endpoint on port `4188`
- Slack bridge for the `#bot` channel on local port `4190`, with Socket Mode
  support for no-domain Slack events
- Docker Compose service named `urba-discord-bot`

## Local Checks

```powershell
npm install
npm run check
```

## Server Layout

```text
/opt/urba-apps/discord-bot/
  .env
  slack-bridge.env
  app/
    docker-compose.yml
    Dockerfile
    package.json
    src/
    scripts/
```

## Auto Deploy

GitHub deploys are handled by a server-local polling timer. The server checks
`origin/main` and runs the deploy script when a new commit appears, so no public
webhook endpoint or app-specific domain is required:

```text
GitHub push to main
  -> server timer polls origin/main
  -> /opt/urba-apps/discord-bot/app/scripts/deploy-server.sh
  -> docker compose build
  -> register slash commands when Discord credentials exist
  -> restart only urba-discord-bot
```

If Discord credentials are not complete yet, the deploy script pulls and builds
the latest image but skips starting the bot.

## Server Setup

Create `/opt/urba-apps/discord-bot/.env` from `.env.example` and fill in:

```text
DISCORD_TOKEN=
DISCORD_CLIENT_ID=1519063290058117170
DISCORD_GUILD_ID=
```

Leave `DISCORD_GUILD_ID` blank for global slash commands that work in every
server where the bot is installed. Set it only when you want faster command
updates in one development server.

Then register commands and start the bot:

```bash
cd /opt/urba-apps/discord-bot/app
docker compose build
docker compose run --rm discord-bot npm run register
docker compose up -d
docker compose ps
curl -i http://127.0.0.1:4188/healthz
```

Global command registration can take longer to appear in Discord.

## Slack Bridge

The custom bridge is separate from the official Codex Slack app. It should use
Slack Socket Mode so the server connects outbound to Slack and does not expose
an HTTP Events API route on `chat.urba.group` or any other domain.

Server-only config lives in `/opt/urba-apps/discord-bot/slack-bridge.env`:

```text
SLACK_APP_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_BOT_TOKEN=
SLACK_CHANNEL_ID=C0BCRVC2C6Q
SLACK_SOCKET_MODE=1
SLACK_BRIDGE_AUTOREPLY=0
```

The bridge saves messages from `#bot` to
`/opt/urba-apps/discord-bot/shared/slack-memory.jsonl`. In Socket Mode,
Slack sends Events API payloads through an outbound WebSocket after the bridge
calls `apps.connections.open` with the app-level `xapp-...` token.

The `SLACK_BOT_TOKEN` value must be the Bot User OAuth Token from Slack
`OAuth & Permissions`; it starts with `xoxb-`.

The `SLACK_APP_TOKEN` value must be an App-Level Token from Slack
`Basic Information -> App-Level Tokens` with the `connections:write` scope; it
starts with `xapp-`.

In Slack `Event Subscriptions`, enable events and subscribe the bot to:

- `message.channels`
- `app_mention`

For Socket Mode, do not enter a Request URL.
