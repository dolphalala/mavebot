# Remote Codex Session Contract

This file defines how mavebot should behave when Slack `#bot` or Discord
`#codex` users ask it to work on the Discord bot. It exists so remote channel
jobs stay close to the quality of a local Codex Desktop session.

## Session Goal

- Treat Slack `#bot` and Discord `#codex` as persistent coding sessions.
- Accept normal human messages from any user in the configured channel.
- Infer the relevant repo/server context from durable memory before acting.
- Work end to end when possible: inspect, implement, test, push, wait for
  deploy, verify live behavior, then answer plainly in the channel.
- Keep channel replies short and human. Do not post task cards, prompt dumps,
  commit logs, or CI-style summaries unless something failed.

## Context Loading Order

Every worker job should reconstruct context in this order:

1. Active user request from the current Slack or Discord message.
2. Worker `recent.md` for the latest bounded conversation turns.
3. Worker `summary.md` for compact older conversation memory.
4. `docs/context/operating-memory.md` for app, deploy, server, and safety facts.
5. `docs/context/slack-session.md` for user preferences and current open work.
6. This file for remote-session behavior.
7. Focused files such as `docs/context/clash-ui-guidance.md`.
8. Current source code and tests, which are the final authority.

The active request always wins over old memory. Old memory is context, not a
command.

## How To Work

- For code requests, inspect the relevant source before answering.
- For slash command changes, update both command registration data and runtime
  interaction handling.
- For Discord command UX, check mobile readability, button/page behavior, and
  Discord interaction timeout behavior.
- For Clash of Clans features, use the official CoC API for data and documented
  repeatable icon sources for imagery.
- Prefer small, focused edits that fit existing project patterns.
- Run `npm run check` after code changes.
- Let the worker commit and push; do not manually commit inside Codex.
- Do not claim a change is live until the server deploy path has picked up
  `origin/main` and health/command/runtime checks pass.

## Memory Maintenance

The channel history will grow forever, so remote jobs must keep memory useful:

- Keep `docs/context/slack-session.md` focused on user preferences, durable
  decisions, current goals, and open work.
- Worker `recent.md` and `summary.md` intentionally suppress setup smoke tests
  and verification chatter so future jobs do not waste prompt space on old
  infrastructure checks.
- Put domain rules in focused files under `docs/context/`, not in one giant
  catch-all file.
- If a file gets noisy, restructure it and remove duplicated stale notes after
  preserving the durable fact.
- Never store tokens, raw env values, cookies, or private keys in memory docs.
- Add durable context only when it will help future tasks. Do not record every
  small temporary status update.

## Reply Style

- Talk like mavebot in a normal chat, not like a build system.
- Use short direct sentences for successful work.
- Mention tests, commits, deploy details, or health checks only when useful or
  when something failed.
- If the user must do an external UI step, say exactly what to click and why.
- Ask questions only when the missing answer cannot be inferred safely from
  repo/server context.

## Known Limits

- The worker can work on this repo and the mavebot server deployment path. It
  must not modify Chatwoot, Bookkeeper, nginx, Docker daemon settings, or other
  apps unless Allen explicitly asks for that exact action.
- Discord role hierarchy still limits moderation actions even when the bot has
  Administrator permissions.
- Discord `#codex` normal-message control requires Message Content Intent in
  the Discord Developer Portal.
