# Discord Bot Instructions

This project is the Vibe mirror for the Discord bot intended to run on the
shared production host reached through `mavebot-prod`, at
`/opt/urba-apps/discord-bot`.

Before making changes, read `docs/context/README.md` first, then
`docs/context/operating-memory.md` and any focused context file relevant to the
task. The simplest supported workflow is to SSH to `mavebot-prod`, edit only
`/opt/urba-apps/discord-bot/workspace`, and finish with
`mavebot-ship "description"`. The command handles backup, tests, the hidden Git
commit/push, deployment, and service verification. Local Git work remains
supported for experienced maintainers.

## Rules

- Do not commit `.env`, Discord bot tokens, client secrets, SSH keys, cookies,
  or server-only credentials.
- Keep runtime config in `/opt/urba-apps/discord-bot/.env` on the server.
- Keep this bot isolated from Chatwoot and Bookkeeper.
- Do not edit nginx, Docker daemon settings, Chatwoot files, or existing app
  containers unless the user asks for that exact production action.
- Never edit `/opt/urba-apps/discord-bot/app`; it is the clean production
  deployment checkout. Server-side source edits belong only in
  `/opt/urba-apps/discord-bot/workspace`.
- On the server, do not run raw Git deploy commands. Use `mavebot-sync`,
  `mavebot-status`, and `mavebot-ship` so backups, tests, and shared-server
  health checks cannot be skipped.
- New slash commands must update both `src/commands.mjs` and the runtime
  handler in `src/index.mjs`, with tests.
- Durable server state belongs under `/shared/...` through explicit env-backed
  paths and must be documented in `docs/context/operating-memory.md`.

## Checks

Run before finishing code changes:

```powershell
npm install
npm run check
```

When editing in the server workspace, `mavebot-ship` runs the full check in a
resource-limited Docker container; do not install Node or npm on the host.

For dependency changes, verify Docker builds.
