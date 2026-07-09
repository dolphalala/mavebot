# Mavebot Remote Session Memory

This file is legacy-named `slack-session.md` for compatibility, but it is now
the durable memory for the Discord `#codex` remote channel session. Every
remote worker task should read this file after `docs/context/operating-memory.md`
and update it when a turn changes what future tasks should know.

## Active Session - 2026-06-24

### Current Goal

- Make Discord `#codex` feel like a normal mavebot working session.
- Discord `#codex` is now the primary daily control channel. Slack `#bot` is
  legacy only and should not be required for worker success.
- Discord users should be able to speak normally in `#codex` without tagging
  mavebot.
- mavebot should post the visible channel replies. The preferred backend for
  repo tasks is now the server-side `codex-worker` container, not the official
  Codex Slack app.

### Remote UX Decisions

- Do not mirror ChatGPT/Codex task-card promo text into `#bot`.
- Do not mirror task links unless the user asks for them.
- Do not prefix mirrored answers with `Codex:`.
- Do not post the Codex trigger as a reply under the user's original prompt.
- Use `SLACK_CODEX_FORWARD_MODE=worker` so there is no official Codex trigger
  channel, long hidden prompt, task card, wrong-environment text, or ChatGPT
  promo copy in `#bot`.
- Normal operation should not start the Slack bridge. The deploy path should
  stop/remove `urba-slack-bridge` unless `ENABLE_SLACK_BRIDGE=1` is explicitly
  set for a legacy Slack session.
- Discord channel `1523893930993778698` is the Discord `#codex` control
  channel. Any non-bot user message there should create a server-side worker
  job and receive the final answer in the same Discord channel. This requires
  Discord Developer Portal Message Content Intent; runtime auto-detects the
  full or limited message-content application flag and stays online with a setup
  note if it is still off.
- Discord `#codex` should treat adjacent messages and screenshots from any
  non-bot channel user as one working context. The runtime debounces adjacent
  messages briefly, downloads attachments to
  `/shared/codex-worker/context/discord-files/`, and includes local paths in the
  worker job.
- Brief "working" status messages should sound like a short friendly mavebot
  helper note, not technical queue/status text.
- Keep replies in the main channel whenever possible so users do not have to
  open thread replies to follow the session.
- Keep Discord replies in `#codex` as normal channel messages.
- When Allen asks for a plan, demo, proposal, or "how this works," the remote
  runner should answer that directly with a compact plan and example instead of
  compressing the reply into a generic done/acknowledgement.
- For broad multi-part requests, the remote runner should keep its own
  checklist, use parallel tools or subagents when available, and continue
  through clear next steps without requiring repeated prompts.
- Do not tell Allen a code change is live just because a Codex cloud task
  changed files in its workspace. The server deploy path follows GitHub
  `origin/main`; if a task only creates a PR or branch, say it is not deployed.
- Worker jobs should make repo changes in the worker checkout, run checks,
  commit, push `origin/main`, then wait for the server poll deploy to pull that
  commit before reporting deployment success.
- Final worker answers should be plain language. Avoid commit hashes, test
  counts, and health-check details unless something failed or needs user
  action.
- Worker memory lives in
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/`. `transcript.jsonl`
  is normalized history, and `summary.md` plus `recent.md` keep future prompts
  bounded.
- Discord remote-runner issues should be diagnosed as session/queue/context
  parity problems before assuming a command is broken. Recent root causes were
  missing Message Content Intent, screenshot/file intake gaps, Discord restart
  catch-up replaying messages too separately, and inner Codex replies leaking
  routine check/deploy chatter.
- Legacy Slack `#bot` can treat adjacent text messages and uploaded files as
  one working context when the bridge is explicitly enabled. The primary path
  is Discord attachment intake under
  `/shared/codex-worker/context/discord-files/`.
- `docs/context/remote-codex-session.md` is the durable behavior contract for
  making Discord `#codex` feel like this local Codex Desktop session. Remote
  jobs should read it, follow it, and update focused context docs instead of
  depending on hidden desktop-thread context.
- `docs/context/local-codex-parity.md` defines the checklist for matching this
  local Codex Desktop session: inspect, implement, test, push, verify deploy,
  maintain context, and answer plainly.
- `docs/context/README.md` is the context map and `docs/context/code-map.md`
  is the source orientation map for remote jobs.
- Discord slash command changes must include both command registration data and
  the runtime interaction handler, otherwise Discord shows "The application did
  not respond."

### Persistent Context

- Allen is Korean and Lana is Croatian.
- Lana will manage this app. `mavebot.lanawee.com` was used for the legacy
  Slack bridge, but Discord `#codex` is now the primary remote channel.
- mavebot is a sweet helper identity for the app; the tone can be warm and
  lightly affectionate when appropriate.
- The Discord bot is Clash of Clans focused and should use the official Clash
  of Clans API from server-side environment variables.
- Clash UI and icon-source guidance lives in `docs/context/clash-ui-guidance.md`;
  CoC worker tasks should read it and update it when durable UI/source rules
  change.
- ClashKing/ClashPerk-style database and collector guidance lives in
  `docs/context/clash-database-guidance.md`; CoC database/roster/history tasks
  should read it before designing data models or commands.
- `/ping` is no longer a public Discord slash command.
- `/lana` replaced `/iloveyou` and sends a generated PNG heart image with a
  Lana/Allen embed. It should not regress to a text-only love letter.
- `/loveu user:<discord user>` composes a randomized love poem for the selected
  user from shuffled line pools and attaches a freshly generated heart image.
- `/player` is the first CoC lookup command and should stay token-backed from
  the server.
- `/player` should stay compact: use buttons for Overview, Army, Heroes, and
  Progress; keep the first page short; render high-volume army/equipment data
  as an attached PNG card with Clash Wiki/Fandom icons when available.
- `/legends player:<tag>` tracks Legend League trophies for a Clash player.
  It stores snapshots in `/shared/legends-tracking.json`, checks one due
  tracked player per 2-minute cycle, and shows Timeline plus Today button
  pages. The Legend day starts at 23:00 fixed MST.
- `/pictionary` starts a Clash of Clans picture guessing game in the current
  Discord channel. It renders Clash Wiki/Fandom item art into generated PNG
  round cards when available, supports difficulty settings, rotates random
  categories, reads chat guesses, and stores the guild leaderboard in
  `/shared/pictionary-leaderboard.json`.
- `/elder user:<discord user>` grants elder command access. Server admins or
  existing elders can grant it. `/mute` and `/bench` require elder access,
  collect 3 unique elder votes, and store permanent target records in
  `/shared/elder-votes.json`.
- Deploy creates/chowns `/shared/elder-votes.json`; malformed JSON is preserved
  as `.corrupt-*` before a clean store is started so the permanent moderation
  record is not silently overwritten.
- Discord role hierarchy still applies even with Administrator/Manage
  Roles/Moderate Members. Move mavebot's role higher if `/mute` or `/bench`
  must affect high-role members.

### Open Work

- Keep the GitHub repository synchronized with live server changes so worker
  jobs and server auto-deploys use the same code.
- On 2026-07-09, Discord `#codex` intake and queue handling were verified, but
  server-side Codex CLI auth is expired again. `codex login status` still
  reports "Logged in using ChatGPT", but a real `codex exec` returns `HTTP 401`
  with `token_invalidated` / `refresh_token_invalidated`. Complete a fresh
  device-auth login for the mounted server `CODEX_HOME` before expecting remote
  jobs to execute. Allen wants the new login to use `billing@urba.media`.
- The worker now surfaces expired Codex auth as a clear channel blocker, stores
  the real 401 cause in failed job JSON, and quarantines unreadable claimed jobs
  instead of leaving them stuck in `processing`.
- Also on 2026-06-30, the deploy path was fixed so `codex-worker` is built and
  safely recreated after active jobs clear. The final worker queue smoke test
  completed with no Slack post error and no stuck jobs.
- Continue improving Discord commands for Clash of Clans workflows.
- Normal Discord `#codex` worker operation no longer loads `slack-bridge.env`;
  deploy migrates `GITHUB_TOKEN` into the neutral server-only
  `codex-worker.env` when needed.
- Keep context docs efficient as Discord channel history grows: summarize
  durable facts, move domain guidance into focused files, and delete duplicated
  stale notes once the fact is preserved in the right place.
- If a user asks to reset or start a new session, add a new dated section here
  instead of deleting older notes.
