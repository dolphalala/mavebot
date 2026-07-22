# Discord Bot Foundation

Dockerized Discord bot for the shared host reached through `mavebot-prod`.

## What It Includes

- `discord.js` v14 bot process.
- `/lana` slash command with a generated heart PNG and randomized Lana/Allen embeds.
- `/loveu` slash command with a generated heart PNG and randomized love poem.
- Clash of Clans commands: `/player`, `/legends`, `/track`, `/history`, `/roster`, `/warstats`, `/activity`, `/summary`, `/config`, and `/link`.
- `/allen`, `/pictionary`, `/elder`, `/mute`, and `/bench` feature commands.
- Slash command registration script.
- Local-only `/healthz` HTTP endpoint on port `4188`.
- Docker Compose service named `urba-discord-bot`.

Use Codex Desktop to make code changes, then push to `origin/main`. This repo
is intentionally just the Discord bot now; it does not include chat-control
bridges, server-side coding workers, extra website services, or extra database
sidecars.

## Local Checks

```powershell
npm install
npm run check
```

## Server Layout

```text
/opt/urba-apps/discord-bot/
  .env
  shared/
    legends-tracking.json
    clash-history.json
    elder-votes.json
    pictionary-leaderboard.json
    logs/
  app/
    docker-compose.yml
    Dockerfile
    package.json
    src/
    scripts/
```

## Auto Deploy

The server-local `urba-discord-poll-deploy.timer` polls `origin/main` and runs
`scripts/deploy-server.sh` when the GitHub repo advances.

```text
Codex Desktop or local edit
  -> commit and push origin/main
  -> server poll timer
  -> scripts/deploy-server.sh
  -> register slash commands when Discord credentials exist
  -> restart only urba-discord-bot
  -> verify /healthz and Chatwoot reachability
```

If Discord credentials are incomplete, the deploy script pulls and builds the
latest image but skips starting the bot.

## Server Setup

Create `/opt/urba-apps/discord-bot/.env` from `.env.example` and fill in:

```text
DISCORD_TOKEN=
DISCORD_CLIENT_ID=1519063290058117170
DISCORD_GUILD_ID=
DISCORD_CLEAR_GUILD_COMMANDS_ID=
COC_API_BASE_URL=https://api.clashofclans.com/v1
COC_API_TOKEN=
```

Leave `DISCORD_GUILD_ID` blank for global slash commands that work in every
server where the bot is installed. Set it only when you want faster command
updates in one development server. If Discord still shows duplicate commands
from an older guild-scoped registration, set `DISCORD_CLEAR_GUILD_COMMANDS_ID`
to that Discord server ID for one deploy while `DISCORD_GUILD_ID` stays blank.

Then register commands and start the bot:

```bash
cd /opt/urba-apps/discord-bot/app
docker compose build
docker compose run --rm discord-bot npm run register
docker compose up -d --remove-orphans discord-bot
docker compose ps
curl -i http://127.0.0.1:4188/healthz
```

Global command registration can take longer to appear in Discord.

The Clash of Clans developer API token must be created for the server public IP
`5.78.127.221` and stored only in the server `.env` file.
