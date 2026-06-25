# Mavebot Slack Session Memory

This file is the durable memory for the `#bot` Slack channel. Codex cloud may
start a fresh task for each Slack mention, so every task should read this file
after `docs/context/operating-memory.md` and update it when a turn changes what
future tasks should know.

## Active Session - 2026-06-24

### Current Goal

- Make Slack `#bot` feel like the main mavebot working session.
- Users should be able to speak normally in `#bot` without tagging `@Codex`.
- mavebot should post the visible channel replies. The preferred backend for
  repo tasks is now the server-side `codex-worker` container, not the official
  Codex Slack app.

### Slack UX Decisions

- Do not mirror ChatGPT/Codex task-card promo text into `#bot`.
- Do not mirror task links unless the user asks for them.
- Do not prefix mirrored answers with `Codex:`.
- Do not post the Codex trigger as a reply under the user's original prompt.
- Use `SLACK_CODEX_FORWARD_MODE=worker` so there is no official Codex trigger
  channel, long hidden prompt, task card, wrong-environment text, or ChatGPT
  promo copy in `#bot`.
- Brief "working" status messages should sound like mavebot, not Codex.
- Keep replies in the main channel whenever possible so users do not have to
  open Slack thread replies to follow the session.
- Do not tell Allen a code change is live just because a Codex cloud task
  changed files in its workspace. The server deploy path follows GitHub
  `origin/main`; if a task only creates a PR or branch, say it is not deployed.
- Worker jobs should make repo changes in the worker checkout, run checks,
  commit, push `origin/main`, then wait for the server poll deploy to pull that
  commit before reporting deployment success.
- Worker memory lives in
  `/opt/urba-apps/discord-bot/shared/codex-worker/context/`. `transcript.jsonl`
  is append-only and `summary.md` plus `recent.md` keep future prompts bounded.
- Discord slash command changes must include both command registration data and
  the runtime interaction handler, otherwise Discord shows "The application did
  not respond."

### Persistent Context

- Allen is Korean and Lana is Croatian.
- Lana will manage this app, so `mavebot.lanawee.com` is the right domain for
  the Slack bridge.
- mavebot is a sweet helper identity for the app; the tone can be warm and
  lightly affectionate when appropriate.
- The Discord bot is Clash of Clans focused and should use the official Clash
  of Clans API from server-side environment variables.
- `/ping` is no longer a public Discord slash command.
- `/lana` replaced `/iloveyou` and sends a generated PNG heart image with a
  Lana/Allen embed. It should not regress to a text-only love letter.
- `/player` is the first CoC lookup command and should stay token-backed from
  the server.

### Open Work

- Keep the GitHub repository synchronized with live server changes so worker
  jobs and server auto-deploys use the same code.
- Continue improving Discord commands for Clash of Clans workflows.
- If a user asks to reset or start a new session, add a new dated section here
  instead of deleting older notes.
