# Discord Bot Instructions

This project is the Vibe mirror for the Discord bot intended to run on the
shared production host reached through `mavebot-prod`, at
`/opt/urba-apps/discord-bot`.

Before making changes, read `docs/context/README.md` first, then
`docs/context/operating-memory.md` and any focused context file relevant to the
task. This project is edited through Codex Desktop/local git work only; do not
reintroduce chat-control bridges, server-side coding workers, website services,
or database sidecars without an explicit user request.

## Rules

- Do not commit `.env`, Discord bot tokens, client secrets, SSH keys, cookies,
  or server-only credentials.
- Keep runtime config in `/opt/urba-apps/discord-bot/.env` on the server.
- Keep this bot isolated from Chatwoot and Bookkeeper.
- Do not edit nginx, Docker daemon settings, Chatwoot files, or existing app
  containers unless the user asks for that exact production action.
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

For dependency changes, verify Docker builds.
