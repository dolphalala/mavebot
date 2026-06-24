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
- The app is Clash of Clans focused. CoC API calls should use the official API
  base URL `https://api.clashofclans.com/v1` and the server-only
  `COC_API_TOKEN`.

## Deployment

- GitHub repo: `dolphalala/mavebot`.
- Production server alias: `urba-chatwoot`, host `5.78.127.221`.
- Server app path: `/opt/urba-apps/discord-bot/app`.
- Runtime env path: `/opt/urba-apps/discord-bot/.env`.
- CoC API env keys live in the same server-only env file:
  `COC_API_BASE_URL` and `COC_API_TOKEN`.
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
- The bridge can forward normal #bot user messages to the official Codex Slack
  app by posting a hidden `@Codex` mention as the Slack user who spoke. This
  uses Codex cloud through that user's connected ChatGPT/Codex account after
  they authorize mavebot once; it does not require an OpenAI API key.
- To keep `#bot` clean, set `SLACK_CODEX_TRIGGER_CHANNEL_ID` to a separate
  public bridge channel where both mavebot and Codex are present. Official Codex
  task cards, "wrong environment" status text, and promo copy should stay there;
  mavebot mirrors only cleaned useful replies back into `#bot`.
- If no separate trigger channel is configured, the bridge falls back to `#bot`,
  shows only a short mavebot working message for the trigger, and deletes the
  trigger quickly. This fallback can still allow official Codex ephemeral UI to
  appear in `#bot`, so the separate trigger channel is preferred.
- Forwarded Codex prompts should include recent saved `#bot` messages from
  bridge memory so Slack feels like a running session. The default prompt memory
  window is controlled by `SLACK_CODEX_MEMORY_LIMIT`.
- Codex cloud tasks should treat `docs/context/slack-session.md` as durable
  `#bot` session memory. Each task should read it after this file and update it
  when a turn adds facts, decisions, open work, deployment changes, or user
  preferences future tasks should know.
- If Allen or Lana asks to reset/start a new session, create a new dated section
  in `docs/context/slack-session.md` instead of deleting older memory.
- Per-user Slack user tokens are stored server-side at
  `/opt/urba-apps/discord-bot/shared/slack-user-tokens.json`. Do not commit or
  print this file.
- Slack OAuth redirect URI:
  `https://mavebot.lanawee.com/mavebot/slack/oauth/callback`.
- Required Slack user scope for per-user forwarding: `chat:write`.
- Slack channel ID for `#bot`: `C0BCRVC2C6Q`.
- Slack app ID for the custom bridge: `A0BCMC7JKRC`.
- Official Codex Slack user ID observed in #bot: `U0BCS1LE1B6`.
- The intended default Codex cloud environment is `mavebot`, with
  `dolphalala/mavebot` as the target repo.
- When Codex cloud works on this repo, it should read this file first, then
  `docs/context/slack-session.md`, then inspect the current code before changing
  behavior.
- Do not ask Allen for generic setup context already captured here. Ask only for
  missing secrets or external UI actions that cannot be done from the repo or
  server.

## Safety

- Never commit `.env`, Discord tokens, Slack tokens, webhook secrets, SSH keys,
  or other credentials.
- Keep this side app isolated from Chatwoot and Bookkeeper.
- Do not mutate Chatwoot, Bookkeeper, nginx, Docker daemon settings, or unrelated
  containers unless Allen explicitly asks for that exact action.
