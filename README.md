# Discord Bot Foundation

Minimal Dockerized Discord bot foundation for the shared `urba-chatwoot` host.

## What It Includes

- `discord.js` v14 bot process.
- `/lana` slash command with a generated heart PNG and randomized Lana/Allen embeds.
- `/loveu` slash command with a generated heart PNG and randomized love poem.
- `/player` slash command for Clash of Clans player lookups.
- `/legends` slash command for Legend League tracking.
- `/pictionary`, `/elder`, `/mute`, and `/bench` feature commands.
- Slash command registration script.
- Local-only `/healthz` HTTP endpoint on port `4188`.
- Discord `#codex` control channel support backed by the server-side Codex worker.
- Docker Compose service named `urba-discord-bot`.

## Local Checks

```powershell
npm install
npm run check
```

## Server Layout

```text
/opt/urba-apps/discord-bot/
  .env
  codex-worker.env
  codex-home/
  shared/
    codex-worker/
      context/
        discord-files/
      jobs/
      processing/
      done/
      failed/
      auth-blocked/
  app/
    docker-compose.yml
    Dockerfile
    Dockerfile.worker
    package.json
    src/
    scripts/
```

## Auto Deploy

GitHub deploys are handled by a server-local private deploy webhook triggered
by the worker after it pushes `origin/main`. The 30-second server polling timer
remains the fallback.

```text
Discord #codex request
  -> codex-worker job
  -> Codex CLI edits repo checkout
  -> npm run check when needed
  -> commit and push origin/main
  -> private deploy webhook, or poll timer fallback
  -> scripts/deploy-server.sh
  -> register slash commands when Discord credentials exist
  -> restart only urba-discord-bot
  -> verify /healthz
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
DISCORD_CODEX_CHANNEL_ID=1523893930993778698
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
docker compose up -d
docker compose ps
curl -i http://127.0.0.1:4188/healthz
```

Global command registration can take longer to appear in Discord.

The Clash of Clans developer API token must be created for the server public IP
`5.78.127.221` and stored only in the server `.env` file.

## Discord Codex Worker

The Discord `#codex` control path requires Discord Developer Portal Message
Content Intent because users type normal messages without tagging mavebot. The
bot auto-detects whether that intent is enabled and stays online with a setup
note if it is off.

Normal human messages in Discord `#codex` are saved as jobs under
`/opt/urba-apps/discord-bot/shared/codex-worker/jobs`. The worker container
uses Codex CLI auth from `/opt/urba-apps/discord-bot/codex-home`, not an
OpenAI API key. It works in its own checkout, runs checks, commits, pushes
`origin/main`, triggers deploy, waits for the live checkout, and posts the
final answer back into the channel.

Adjacent `#codex` messages are debounced into one worker job so users can send
several messages and screenshots as context before mavebot starts the task.
Discord attachments are downloaded immediately to
`/shared/codex-worker/context/discord-files` and passed to the worker as local
file paths. Supported image files are also attached to `codex exec` with
`--image` so screenshots are available as visual context.

The worker keeps durable context in:

- `/opt/urba-apps/discord-bot/shared/codex-worker/context/transcript.jsonl`
- `/opt/urba-apps/discord-bot/shared/codex-worker/context/summary.md`
- `/opt/urba-apps/discord-bot/shared/codex-worker/context/recent.md`
- `/opt/urba-apps/discord-bot/shared/codex-worker/context/session.md`
- `/opt/urba-apps/discord-bot/shared/codex-worker/context/discord-files/`

`transcript.jsonl` is normalized history; low-signal smoke/status rows are
pruned after verification. `summary.md` and `recent.md` are regenerated after
each turn so prompts stay bounded while the channel still has memory.
Repo-side durable guidance starts at `docs/context/README.md`, then
`docs/context/operating-memory.md`, `docs/context/discord-session.md`,
`docs/context/remote-codex-session.md`, `docs/context/code-map.md`, and focused
domain files such as `docs/context/clash-ui-guidance.md`.

Start or update the worker service manually after code changes to the worker
itself:

```bash
cd /opt/urba-apps/discord-bot/app
docker compose --profile codex-worker up -d --build codex-worker
```

The normal deploy script avoids killing an active worker request. If a worker
job is currently processing, deploy writes a restart-needed marker and the
worker is recreated after the queue is clear.
