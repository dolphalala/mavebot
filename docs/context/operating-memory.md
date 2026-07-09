# Mavebot Operating Memory

This repo backs the `mavebot` Discord bot and Discord `#codex` remote Codex
workflow. Slack support is legacy-only and should not be required for normal
remote work.

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
    The command stores snapshots in the server shared volume and shows timeline
    plus current Legend-day pages.
  - `/pictionary`: starts a Clash of Clans picture guessing game in the current
    channel. It uses Clash Wiki/Fandom item art in generated PNG cards when
    available, difficulty settings, random categories per round, chat guesses,
    and a persisted guild leaderboard.
  - `/elder`: lets a server admin or existing elder grant elder status to a
    Discord user.
  - `/mute`: elder vote command. Three unique elder votes mute the target for
    5 minutes and append the result to the permanent moderation record.
  - `/bench`: elder vote command. Three unique elder votes assign the target a
    `benched` role with an ugly yellow role color and append the result to the
    permanent moderation record.
- Allen is Korean and Lana is Croatian; `/lana` copy can use that context.
- The app is Clash of Clans focused. CoC API calls should use the official API
  base URL `https://api.clashofclans.com/v1` and the server-only
  `COC_API_TOKEN`.

## Deployment

- GitHub repo: `dolphalala/mavebot`.
- Production server alias: `urba-chatwoot`, host `5.78.127.221`.
- Server app path: `/opt/urba-apps/discord-bot/app`.
- Runtime env path: `/opt/urba-apps/discord-bot/.env`.
- Codex worker-only env path: `/opt/urba-apps/discord-bot/codex-worker.env`.
  Deploy creates it with mode `600` and migrates `GITHUB_TOKEN` from the old
  Slack env file if needed, so normal Discord `#codex` work no longer loads
  Slack app tokens.
- CoC API env keys live in the same server-only env file:
  `COC_API_BASE_URL` and `COC_API_TOKEN`.
- Docker Compose service/container: `urba-discord-bot`.
- Remote Codex worker container: `urba-codex-worker`.
- Legacy Slack bridge container: `urba-slack-bridge`; normal deploys stop and
  remove it unless `ENABLE_SLACK_BRIDGE=1`.
- Health endpoint: `http://127.0.0.1:4188/healthz`.
- Legend tracking store:
  `/opt/urba-apps/discord-bot/shared/legends-tracking.json`.
- Clash history collector store:
  `/opt/urba-apps/discord-bot/shared/clash-history.json`.
  Deploy initializes and chowns it as `/shared/clash-history.json`.
  Runtime preserves malformed JSON as a `.corrupt-*` backup before starting a
  clean store. The store tracks enrolled players, clans, CWL war tags, player
  snapshots, clan snapshots, CWL groups, full current/CWL war rows when the API
  exposes them, and summary-only public war-log rows.
- Elder/vote moderation store:
  `/opt/urba-apps/discord-bot/shared/elder-votes.json`.
  Deploy initializes and chowns it as `/shared/elder-votes.json`; if malformed
  JSON is detected, runtime preserves the bad file as a `.corrupt-*` backup
  before starting a clean store.
- Pictionary leaderboard store:
  `/opt/urba-apps/discord-bot/shared/pictionary-leaderboard.json`.
  Deploy initializes and chowns it as `/shared/pictionary-leaderboard.json`;
  if malformed JSON is detected, runtime preserves the bad file as a
  `.corrupt-*` backup before starting a clean store.
- Current live Discord permissions include Administrator, Manage Roles, and
  Moderate Members, but Discord role hierarchy still applies. If mute/bench
  must affect high-role users, move the mavebot role above those users/roles in
  Discord server role settings.
- `/legends` uses fixed MST for day boundaries: the Legend day starts at
  23:00 MST, which is 06:00 UTC.
- Clash history collection follows the ClashKing/ClashPerk-style polling model:
  the official Clash API has no webhooks, so mavebot rotates through due
  tracked subjects on a schedule. Env knobs are
  `CLASH_HISTORY_STORE_PATH`, `CLASH_HISTORY_CLAN_TAGS`,
  `CLASH_HISTORY_PLAYER_TAGS`, `CLASH_HISTORY_INTERVAL_MS`,
  `CLASH_HISTORY_PLAYER_INTERVAL_MS`, `CLASH_HISTORY_CLAN_INTERVAL_MS`, and
  `CLASH_HISTORY_WAR_INTERVAL_MS`. `/player` and `/legends` lookups also seed
  player tracking. Past war/CWL player attack history can only be collected
  from now forward unless the official API still exposes the active war or CWL
  war tags; public war logs only provide summary rows.
- GitHub deploys should use the server-local
  `urba-discord-poll-deploy.timer`, not a public webhook.
- The server poll deploy only follows `origin/main`. A Codex cloud task that
  only edits its task workspace, branch, or PR is not deployed and must not be
  described as live. Code-changing Discord `#codex` tasks should push/merge to
  `main` when permitted, or clearly tell the user that a PR/manual merge is
  still required.
- If a mirrored Codex response says it committed locally, opened PR metadata, or
  could not push to `origin/main`, it is not live. Discord will not reflect that
  change until a real GitHub `main` commit deploys and command registration
  runs.
- Do not add mavebot endpoints to `chat.urba.group`; that domain belongs to
  Chatwoot.
- The active code path is Discord `#codex` to the server-side `codex-worker`
  compose profile. Normal `#codex` messages become JSON jobs in
  `/opt/urba-apps/discord-bot/shared/codex-worker/jobs`; the worker runs Codex
  CLI in `/opt/urba-apps/discord-bot/shared/codex-worker/repo`, commits, pushes
  `origin/main`, and waits for the 30-second poll deploy to pull that commit.
- Discord channel-to-code uses the same worker queue. Normal messages from
  non-bot users in Discord channel `1523893930993778698` (`#codex`) become
  JSON jobs in `/opt/urba-apps/discord-bot/shared/codex-worker/jobs`, and the
  worker posts the final answer back into that Discord channel. This requires
  the Discord Developer Portal Message Content Intent because users are not
  tagging mavebot. Discord can report this enabled setting as either the full
  `GatewayMessageContent` application flag or the
  `GatewayMessageContentLimited` flag; both mean the bot may request
  `MessageContent`. If the intent is disabled, the bot remains online and posts
  a one-time setup note in `#codex` instead of crashing.
- Discord `#codex` is the preferred replacement for Slack as the normal remote
  Codex session surface. Adjacent Discord messages are debounced into one
  worker job so users can send multiple text messages and screenshots as one
  prompt. Discord attachments are downloaded immediately into
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/discord-files/` and
  passed to Codex as local files.
- Discord restart catch-up groups still-unhandled adjacent messages into the
  same worker job instead of replaying each recent message separately. This
  keeps post-restart behavior closer to Codex Desktop, where context,
  screenshots, and follow-ups remain one active turn. If only part of a recent
  burst is already recorded, catch-up preserves the whole burst as context for
  the remaining job instead of stripping away the handled row and replaying a
  stale fragment.
- The Discord bot `/healthz` response includes `discordCodexLastCatchup` and
  `discordCodexLastError` so remote-runner intake issues can be diagnosed from
  the server without guessing whether the fault was message intent, attachment
  download, catch-up, enqueue, or worker queue state.
- The deploy script normally builds `discord-bot` and `codex-worker`, then
  stops/removes the legacy Slack bridge. It only builds/starts `slack-bridge`
  when `ENABLE_SLACK_BRIDGE=1`. It recreates `codex-worker` only when no worker
  job is active; if a job is in
  `processing`, it writes `shared/codex-worker/restart-needed` and the poll
  deploy completes the worker recreate after the queue is clear. This avoids
  killing the worker mid-request while still keeping worker code current.
- Worker jobs are marked with `attempts`, `startedAt`, and `worker` metadata
  after being claimed. If a processing job is stale, the worker and deploy
  script can requeue it; malformed or unreadable claimed JSON is logged and
  moved or quarantined under `failed` instead of being left invisible in
  `processing`.
- If the channel says the server-side Codex login is expired, Discord intake is
  still receiving jobs but `codex-worker` cannot run `codex exec` until its
  mounted `CODEX_HOME` is re-authenticated.
- `codex login status` can still say "Logged in using ChatGPT" after the
  refresh token has been revoked. Verify auth with a tiny no-code `codex exec`
  smoke inside `urba-codex-worker`; `HTTP 401`, `token_invalidated`, or
  `refresh_token_invalidated` means the server must be logged in again.
- The current server Codex auth is stored under
  `/opt/urba-apps/discord-bot/codex-home` and is independent of Slack. To
  switch the server worker to a different ChatGPT/Codex account, pause or
  drain the worker, back up that `codex-home`, run an interactive `codex login`
  or device-auth flow inside the worker/container using the new account,
  restart `urba-codex-worker`, then run a no-code Discord #codex smoke job. Do
  not print, commit, or copy auth files.

## Discord Command Registration

- `DISCORD_GUILD_ID` should stay blank for global commands.
- Commands should include `integration_types: [0]` and `contexts: [0]` so they
  appear only through guild/server installation, not through user install.
- If duplicate commands appear in Discord, clear guild-specific commands and
  reload Discord. Also disable User Install in the Developer Portal if it is not
  needed.
- When changing a slash command, update both `src/commands.mjs` and the
  `InteractionCreate` handler in `src/index.mjs`; then run command registration
  during deploy. Registering the command without deploying a matching runtime
  handler causes Discord's "The application did not respond" error.
- To clear stale guild-specific commands during deploy while keeping global
  commands active, set `DISCORD_CLEAR_GUILD_COMMANDS_ID` to the affected server
  ID and leave `DISCORD_GUILD_ID` blank.
- `/ping` was removed as a public test command; use the local HTTP `/healthz`
  endpoint for process health instead.

## Remote Codex Workflow

- Discord `#codex` channel ID: `1523893930993778698`.
- Discord `#codex` is the primary control surface. Any non-bot user in that
  channel can ask for code changes, explanations, screenshot review, command
  work, deploy verification, or context maintenance.
- Slack `#bot` is legacy only. It may be re-enabled with
  `ENABLE_SLACK_BRIDGE=1`, but normal Discord worker success must not depend on
  Slack bridge health, Slack OAuth, official Codex Slack, or Slack-specific
  task cards.

- Official Codex Slack requires `@Codex`, replies in threads, and chooses a
  cloud environment automatically. It cannot turn `#bot` into a normal channel
  session by itself.
- A custom Slack bridge stores channel memory in
  `/opt/urba-apps/discord-bot/shared/slack-memory.jsonl`.
- The current preferred control mode is the server-side worker queue. Discord
  uses `DISCORD_CODEX_CHANNEL_ID`. Legacy Slack uses
  `SLACK_CODEX_FORWARD_MODE=worker` only when the bridge is explicitly enabled.
  In worker mode there is no official `@Codex` forwarding, no per-user Slack
  OAuth requirement, no task-card mirroring, and any human in the configured
  control channel can trigger the server runner.
- Worker-side durable context is stored under
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/`:
  `transcript.jsonl` is normalized history, while `summary.md`, `recent.md`, and
  `session.md` are regenerated after each turn to keep prompts bounded. The
  regenerated prompt memory and transcript storage prune low-signal smoke tests
  and old verification chatter.
- Slack uploads from `#bot` are downloaded by the bridge into
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/slack-files/` and
  referenced by local path in worker jobs. The bridge handles both
  `message.file_share` and standalone `file_shared` Slack events; file-id-only
  events are resolved with Slack `files.info`. This requires the Slack bot token
  to have `files:read`; if the scope is missing, jobs still include the Slack
  file metadata plus a download error.
- Worker prompts put the active Discord request before compacted memory.
  Older memory is background context only and must not override the current
  request.
- Worker prompts explicitly include project `AGENTS.md`, the
  `docs/context/README.md` context map, and a runtime/deploy snapshot before
  compacted conversation memory.
- Remote channel jobs should behave like local Codex sessions for this repo:
  inspect source, update files, run checks, push `origin/main`, wait for deploy,
  verify live state, and answer plainly when the request needs real work.
- Worker prompts also include bounded extra files from `docs/context/*.md`, such
  as `docs/context/remote-codex-session.md` and
  `docs/context/local-codex-parity.md`, `docs/context/code-map.md`,
  `docs/context/clash-database-guidance.md`, and
  `docs/context/clash-ui-guidance.md`. Add focused context docs there when the
  Discord agent needs durable domain guidance.
- The bridge should use Slack Socket Mode with `SLACK_APP_TOKEN` so Slack events
  arrive over an outbound WebSocket and no public domain is required.
- The older fallback bridge mode can forward normal #bot user messages to the official Codex Slack
  app by posting a hidden `@Codex` mention as the Slack user who spoke. This
  uses Codex cloud through that user's connected ChatGPT/Codex account after
  they authorize mavebot once; it does not require an OpenAI API key.
- To keep `#bot` clean, set `SLACK_CODEX_TRIGGER_CHANNEL_ID` to a separate
  public bridge channel where both mavebot and Codex are present. Official Codex
  task cards, "wrong environment" status text, and promo copy should stay there;
  mavebot mirrors only cleaned useful replies back into `#bot`.
- The forwarded trigger must be a real visible `@Codex` message in the trigger
  channel. Putting `@Codex` only in Slack fallback text while showing a harmless
  block such as "Working on it" does not reliably notify the official Codex app.
- If the trigger channel is still `#bot`, the bridge is in fallback mode. In
  fallback mode it keeps the temporary Codex trigger around long enough for
  Codex pickup and posts a stale warning instead of silently hanging, but it
  cannot fully hide official Codex UI. The clean session UX requires a separate
  trigger channel.
- The current Slack app scopes do not let mavebot join or invite apps to other
  channels by API. A Slack admin/user must invite both `mavebot` and the
  official `Codex` app to the trigger channel before setting
  `SLACK_CODEX_TRIGGER_CHANNEL_ID`.
- If no separate trigger channel is configured, the bridge falls back to `#bot`,
  shows a short mavebot working message for the trigger, and deletes the
  temporary trigger after the configured delay. This fallback can still allow
  official Codex UI to appear in `#bot`, so the separate trigger channel is
  preferred.
- Forwarded Codex prompts should include recent saved `#bot` messages from
  bridge memory so Slack feels like a running session. The default prompt memory
  window is controlled by `SLACK_CODEX_MEMORY_LIMIT`.
- Remote worker tasks should treat `docs/context/slack-session.md` as
  legacy-named durable user preference and open-work memory, and
  `docs/context/remote-codex-session.md` as the behavior contract for making
  Discord `#codex` feel like this local Codex session. Each task should update
  the right context doc when a turn adds facts, decisions, open work,
  deployment changes, or user preferences future tasks should know.
- `docs/context/README.md` is the context map, and
  `docs/context/code-map.md` is the source orientation map for remote coding
  jobs.
- If Allen or Lana asks to reset/start a new session, create a new dated section
  in `docs/context/slack-session.md` instead of deleting older memory.
- Per-user Slack user tokens are stored server-side at
  `/opt/urba-apps/discord-bot/shared/slack-user-tokens.json`. Do not commit or
  print this file.
- Slack OAuth redirect URI:
  `https://mavebot.lanawee.com/mavebot/slack/oauth/callback`.
- Required Slack user scope for per-user forwarding: `chat:write`.
- Slack channel ID for user-facing `#bot`: `C0BCG0T838B`.
- Slack trigger channel ID for visible official Codex prompts: `C0BCRVC2C6Q`
  (`#chet` as of 2026-06-24). The bridge should keep
  `SLACK_CODEX_TRIGGER_CHANNEL_ID=C0BCRVC2C6Q` so `#bot` stays clean.
- Slack app ID for the custom bridge: `A0BCMC7JKRC`.
- Official Codex Slack user ID observed in #bot: `U0BCS1LE1B6`.
- The intended default Codex cloud environment is `mavebot`, with
  `dolphalala/mavebot` as the target repo.
- When Codex cloud or the server-side worker works on this repo, it should read
  `docs/context/README.md` first, then this file, then
  `docs/context/slack-session.md`, then `docs/context/remote-codex-session.md`,
  then `docs/context/code-map.md`, then any relevant focused context file such
  as `docs/context/clash-database-guidance.md` or
  `docs/context/clash-ui-guidance.md`, then inspect the current code before
  changing behavior.
- Do not ask Allen for generic setup context already captured here. Ask only for
  missing secrets or external UI actions that cannot be done from the repo or
  server.

## Safety

- Never commit `.env`, Discord tokens, Slack tokens, webhook secrets, SSH keys,
  or other credentials.
- Keep this side app isolated from Chatwoot and Bookkeeper.
- Do not mutate Chatwoot, Bookkeeper, nginx, Docker daemon settings, or unrelated
  containers unless Allen explicitly asks for that exact action.
