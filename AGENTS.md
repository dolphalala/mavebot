# Discord Bot Instructions

This project is the Vibe mirror for the Discord bot intended to run on the
`urba-chatwoot` shared host at `/opt/urba-apps/discord-bot`.

## Rules

- Do not commit `.env`, Discord bot tokens, client secrets, SSH keys, cookies, or
  server-only credentials.
- Keep runtime config in `/opt/urba-apps/discord-bot/.env` on the server.
- Keep this bot isolated from Chatwoot and Bookkeeper.
- Do not edit nginx, Docker daemon settings, Chatwoot files, or existing app
  containers unless the user asks for that exact production action.

## Checks

Run before finishing code changes:

```powershell
npm install
npm run check
```

For dependency changes, verify Docker builds.
