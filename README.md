# Discord Bot Foundation

Minimal Dockerized Discord bot foundation for the shared `urba-chatwoot` host.

## What It Includes

- `discord.js` v14 bot process
- `/ping` slash command handler
- slash command registration script
- local-only `/healthz` HTTP endpoint on port `4188`
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
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
```

Then register commands and start the bot:

```bash
cd /opt/urba-apps/discord-bot/app
docker compose build
docker compose run --rm discord-bot npm run register
docker compose up -d
docker compose ps
curl -i http://127.0.0.1:4188/healthz
```

Use `DISCORD_GUILD_ID` first for fast command registration while developing.
Global command registration can take longer to appear in Discord.
