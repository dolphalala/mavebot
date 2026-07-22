# Mavebot Server Editing Workflow

Last verified: 2026-07-22 through a successful guarded production ship.

This is the default guide for a Codex session on another computer. It covers
only the Mavebot Discord bot. Lanawee is out of scope.

## The Only Normal Workflow

The computer needs the confidential `mavebot-prod` server SSH handoff. It does
not need a GitHub key, GitHub login, root password, copied project folder, or
Node/npm installation.

```bash
ssh mavebot-prod
cd /opt/urba-apps/discord-bot/workspace

# Inspect and edit the bot here. When the change is ready:
mavebot-ship "Short description of the Discord bot change"
```

If the SSH alias is not installed yet, run the bootstrap from the confidential
handoff bundle first. Root authentication is key-based; there is deliberately
no root password in the handoff.

## Hard Boundaries

- Edit only `/opt/urba-apps/discord-bot/workspace`.
- Never edit `/opt/urba-apps/discord-bot/app`. That directory is a clean,
  deployment-only checkout.
- Never copy or display `/opt/urba-apps/discord-bot/.env` or anything under
  `/opt/urba-apps/discord-bot/ssh`.
- Never put Discord, Clash of Clans, GitHub, SSH, or other secrets in source.
- Do not change Chatwoot, Bookkeeper, nginx, Docker daemon configuration, or
  unrelated containers.
- Do not use `git reset --hard`, force push, Docker prune, broad deletion, or
  manual production-container replacement.
- A slash command is complete only when its registration in
  `src/commands.mjs`, runtime handler in `src/index.mjs`, and focused tests all
  agree.
- Finish every approved code change with `mavebot-ship`. Merely saving a file
  does not update Discord or the running bot.

## What `mavebot-ship` Does

1. Locks the bot editing/deploy workflow so two sessions cannot overlap.
2. Creates a timestamped, private source backup under
   `/opt/urba-apps/discord-bot/shared/backups`.
3. Safely incorporates newer repository changes while preserving local edits.
4. Rejects likely environment files, private keys, and token assignments.
5. Runs the complete `npm run check` suite in an isolated Node 24 Docker
   container capped at 768 MB RAM, 1 CPU, and 256 processes.
6. Creates a hidden Git rollback point and performs a non-force push to `main`.
7. Triggers the existing one-app deploy path, which rebuilds and restarts only
   `urba-discord-bot` and re-registers Discord slash commands.
8. Waits for the production checkout to reach the pushed commit and verifies
   Mavebot health, a clean production checkout, Chatwoot reachability, and
   Bookkeeper health.

Git still exists because it makes recovery, synchronization, and deployment
safe. The person or Codex session making normal server edits does not operate
it directly.

## Supporting Commands

```bash
mavebot-status
```

Read-only summary of the editing workspace, production checkout, bot
container, Chatwoot, and Bookkeeper.

```bash
mavebot-sync
```

Backs up current edits and safely incorporates outside repository changes. It
does not deploy. `mavebot-ship` already performs this synchronization, so this
is optional before starting a long change.

## Why `/allen` Did Not Appear Before

The previous session edited files directly in the production checkout and left
uncommitted source plus a patch file there. The running Docker image and
Discord command registration were still built from the committed GitHub
version, so those direct files were never a complete deployment. The attempted
runtime handler was also appended after `client.login(...)`, outside the
`InteractionCreate` handler, so it could not respond correctly even if copied
into an image.

The repair moved `/allen` into both the registered command list and the active
interaction handler, added tests, deployed the committed source, and made the
production checkout reject future dirty deploys. `/allen` and `/player` are in
the global command set. The separate workspace now gives remote Codex sessions
a proper place to edit without touching production.

## If Shipping Stops

Read the error first. The tool intentionally stops before push or deployment
when tests, secret checks, synchronization, or memory safeguards fail. Source
backups are stored under `/opt/urba-apps/discord-bot/shared/backups` and the
workspace is preserved.

Use:

```bash
mavebot-status
git status --short
```

It is acceptable to inspect Git status during recovery, but do not reset,
discard, or force-push. Fix the reported files in the workspace and rerun
`mavebot-ship`. If the issue is an unfamiliar merge conflict or a shared
service is unhealthy, stop and report the exact error instead of changing
other apps.

## Copy/Paste Prompt For Another Codex

```text
Work only on the Mavebot Discord bot. SSH using `mavebot-prod`, then read
`/opt/urba-apps/discord-bot/workspace/AGENTS.md` and
`/opt/urba-apps/discord-bot/workspace/docs/context/README.md`. Make all source
edits only in `/opt/urba-apps/discord-bot/workspace`; never edit the production
checkout at `/opt/urba-apps/discord-bot/app` and never read or reveal `.env` or
anything under the server `ssh` directory. Do not touch Lanawee, Chatwoot,
Bookkeeper, nginx, Docker daemon settings, or unrelated containers. For a slash
command, update `src/commands.mjs`, the live interaction handler in
`src/index.mjs`, and focused tests. When finished, run
`mavebot-ship "describe the change"`; it handles backup, tests, Git, deployment,
Discord command registration, and health checks. Do not force-push, reset,
prune Docker, or directly restart/replace unrelated services. Report the ship
commit and the final `mavebot-status` output.
```
