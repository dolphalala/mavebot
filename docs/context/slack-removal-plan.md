# Slack Removal Plan

Slack is legacy-only for mavebot. Discord `#codex` is the normal remote Codex
session surface. Do not remove Slack files in one sweep until Discord-only
operation has been verified through real work.

## Current State

- Normal deploys should start `discord-bot` and `codex-worker`, and stop the
  legacy `slack-bridge` service.
- Discord jobs do not need Slack tokens, Slack OAuth, official Codex Slack, or
  Slack bridge health.
- `docs/context/slack-session.md` remains only as a compatibility pointer for
  older prompts and task history.
- Source names such as `src/slack-codex-worker.mjs` and `finalSlackMessage`
  still exist for compatibility, but the active control surface is Discord.

## Removal Phases

1. Freeze Slack.
   Keep the legacy Slack bridge disabled by default. Do not load Slack env in
   the Discord worker path. Verify Discord `#codex` can accept text, images,
   bundled messages, code changes, pushes, deploys, and final channel replies.

2. Preserve useful history.
   Summarize any durable facts from old Slack memory into
   `docs/context/*.md`. Do not copy secrets or raw token files. Server-only
   Slack token files should be deleted or rotated manually after Slack is no
   longer used.

3. Rename compatibility surfaces.
   Rename worker-facing Slack names to neutral names, for example
   `slack-codex-worker.mjs` to `codex-worker.mjs`, while keeping a temporary
   compatibility entrypoint for one deploy window.

4. Remove runtime wiring.
   Remove the `legacy-slack` compose profile, Slack bridge env examples,
   Slack bridge deploy initialization, Slack package scripts, Slack bridge
   source, and Slack bridge tests only after Discord-only operation has been
   stable.

5. Clean docs.
   Keep `slack-session.md` as a short pointer until old task prompts are no
   longer useful, then replace it with a tombstone that points to
   `discord-session.md`.

## Verification Before Deletion

- `npm run check` passes.
- Server deploy works with no Slack env loaded.
- `/healthz` shows Discord Codex setup ready and no Slack bridge dependency.
- A real Discord `#codex` text request produces a channel reply.
- A real Discord `#codex` screenshot request passes the local image to Codex.
- A real code-change request reaches `origin/main`, deploys, and verifies live.
- No normal worker code path requires `SLACK_*` variables.

