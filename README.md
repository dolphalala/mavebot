# Discord Bot Foundation

Minimal Dockerized Discord bot foundation for the shared `urba-chatwoot` host.

## What It Includes

- `discord.js` v14 bot process
- `/lana` slash command with a generated heart PNG and randomized Lana/Allen embeds
- `/player` slash command for Clash of Clans player lookups
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
docker compose up -d
docker compose ps
curl -i http://127.0.0.1:4188/healthz
```

Global command registration can take longer to appear in Discord.

The Clash of Clans developer API token must be created for the server public IP
`5.78.127.221` and stored only in the server `.env` file. The `/player` command
uses that token to call the official Clash of Clans API.

## Slack Bridge

The custom bridge is separate from the official Codex Slack app. It should use
Slack Socket Mode so the server connects outbound to Slack and does not expose
an HTTP Events API route on `chat.urba.group` or any other domain.

Server-only config lives in `/opt/urba-apps/discord-bot/slack-bridge.env`:

```text
SLACK_APP_ID=
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_BOT_TOKEN=
SLACK_CHANNEL_ID=C0BCG0T838B
SLACK_SOCKET_MODE=1
SLACK_CODEX_FORWARD=1
SLACK_CODEX_USER_ID=
SLACK_CODEX_TRIGGER_CHANNEL_ID=
SLACK_CODEX_ENVIRONMENT=mavebot
SLACK_CODEX_REPOSITORY=dolphalala/mavebot
SLACK_CODEX_MIRROR_REPLIES=1
SLACK_CODEX_FORWARD_IN_THREAD=0
SLACK_CODEX_DELETE_FORWARD=1
SLACK_CODEX_DELETE_FORWARD_DELAY_MS=60000
SLACK_CODEX_STATE_PATH=/shared/codex-forward-state.json
SLACK_CODEX_MEMORY_LIMIT=30
SLACK_CODEX_MEMORY_TEXT_LIMIT=1500
SLACK_CODEX_STATE_ENTRY_LIMIT=200
SLACK_OAUTH_REDIRECT_URI=https://mavebot.lanawee.com/mavebot/slack/oauth/callback
SLACK_USER_SCOPES=chat:write
SLACK_USER_TOKEN_PATH=/shared/slack-user-tokens.json
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

When `SLACK_CODEX_FORWARD=1`, normal human messages in `#bot` are reposted by
the sender's own Slack user token as mentions to the official Codex Slack app.
That path uses Codex cloud through each user's connected ChatGPT/Codex account
and does not require an OpenAI API key. The forwarded prompt includes recent
saved `#bot` messages, controlled by `SLACK_CODEX_MEMORY_LIMIT`, so the channel
behaves more like a running session.

Set `SLACK_CODEX_TRIGGER_CHANNEL_ID` to a separate public bridge channel when
the official Codex app's task cards or ephemeral status text should stay out of
`#bot`. Invite both mavebot and Codex to that bridge channel. The bridge posts
the hidden `@Codex` trigger there, listens for Codex replies there, and mirrors
only the cleaned useful answer back into `#bot`. If no trigger channel is set,
the bridge falls back to `#bot`, hides the long prompt behind a short visible
message, and deletes that trigger quickly.

Codex cloud still creates task-style runs, so durable Slack session memory lives
in `docs/context/slack-session.md`. Forwarded prompts tell Codex to read and
update that file, while the bridge mirrors useful Codex replies back into `#bot`
as mavebot messages.

To enable per-user forwarding, add an HTTPS redirect URL that Allen owns in
Slack `OAuth & Permissions -> Redirect URLs`, and add a User Token Scope that
allows posting on the user's behalf (`chat:write`). A user who has not
authorized yet will get a visible setup message in `#bot`.
