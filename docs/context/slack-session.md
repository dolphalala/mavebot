# Mavebot Slack Session Memory

This file is the durable memory for the `#bot` Slack channel. Codex cloud may
start a fresh task for each Slack mention, so every task should read this file
after `docs/context/operating-memory.md` and update it when a turn changes what
future tasks should know.

## Active Session - 2026-06-24

### Current Goal

- Make Slack `#bot` feel like the main mavebot working session.
- Users should be able to speak normally in `#bot` without tagging `@Codex`.
- mavebot should post the visible channel replies. The official Codex Slack app
  is only the backend worker for repo tasks.

### Slack UX Decisions

- Do not mirror ChatGPT/Codex task-card promo text into `#bot`.
- Do not mirror task links unless the user asks for them.
- Do not prefix mirrored answers with `Codex:`.
- Do not post the Codex trigger as a reply under the user's original prompt.
- Prefer a separate Codex trigger channel so the long hidden prompt, task cards,
  wrong-environment text, and ChatGPT promo copy never appear in `#bot`.
- If the bridge must fall back to `#bot`, hide the long prompt behind a short
  mavebot working message and delete the trigger quickly.
- Brief "working" status messages should sound like mavebot, not Codex.
- Keep replies in the main channel whenever possible so users do not have to
  open Slack thread replies to follow the session.
- Do not tell Allen a code change is live just because a Codex cloud task
  changed files in its workspace. The server deploy path follows GitHub
  `origin/main`; if a task only creates a PR or branch, say it is not deployed.
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
- `/lana` replaced `/iloveyou` and sends a heart-filled Lana/Allen embed.
- `/player` is the first CoC lookup command and should stay token-backed from
  the server.

### Open Work

- Keep the GitHub repository synchronized with live server changes so Codex
  cloud tasks and server auto-deploys use the same code.
- Continue improving Discord commands for Clash of Clans workflows.
- If a user asks to reset or start a new session, add a new dated section here
  instead of deleting older notes.
