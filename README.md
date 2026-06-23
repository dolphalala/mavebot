# Discord Bot Foundation

Minimal Dockerized Discord bot foundation for the shared `urba-chatwoot` host.

## What It Includes

- `discord.js` v14 bot process
- `/ping` slash command handler
- slash command registration script
- local-only `/healthz` HTTP endpoint on port `4188`
- Slack Events bridge for the `#bot` channel on local port `4190`
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

GitHub push deploys are handled by a server-local webhook:

```text
GitHub push to main
  -> https://chat.urba.group/discord-bot-deploy
  -> /opt/urba-apps/discord-bot/app/scripts/deploy-webhook.py
  -> /opt/urba-apps/discord-bot/app/scripts/deploy-server.sh
  -> docker compose build
  -> register slash commands when Discord credentials exist
  -> restart only urba-discord-bot
```

The webhook secret lives only on the server in
`/opt/urba-apps/discord-bot/deploy.env`. Do not commit or paste it into chat.

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

The custom bridge is separate from the official Codex Slack app. It receives
Slack Events API requests at:

```text
https://chat.urba.group/slack/events
```

Server-only config lives in `/opt/urba-apps/discord-bot/slack-bridge.env`:

```text
SLACK_APP_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_BOT_TOKEN=
SLACK_CHANNEL_ID=C0BCRVC2C6Q
SLACK_BRIDGE_AUTOREPLY=0
```

The bridge verifies Slack signatures, handles URL verification, and saves
messages from `#bot` to `/opt/urba-apps/discord-bot/shared/slack-memory.jsonl`.

The `SLACK_BOT_TOKEN` value must be the Bot User OAuth Token from Slack
`OAuth & Permissions`; it starts with `xoxb-`.
