# Mavebot Code Map

Use this file to orient remote Codex jobs before editing Discord bot features.
It is a map, not a replacement for reading the current source.

## Runtime Files

- `src/index.mjs`: main Discord bot runtime. Handles `InteractionCreate`,
  slash-command execution, Discord `#codex` message intake, health checks,
  Legend tracker startup, and Discord API calls that require the bot client.
- `src/commands.mjs`: Discord slash command registration data. Any new or
  changed slash command must be represented here.
- `scripts/register-commands.mjs`: registers global or guild commands during
  deploy and clears stale guild-scoped commands when configured.
- `src/discord-codex-control.mjs`: converts Discord `#codex` channel messages
  into server-side worker jobs, formats bundled message bursts, preserves
  bundled Discord message IDs for restart de-duplication, and downloads
  Discord attachments into shared local context.

## Feature Modules

- `src/coc.mjs`: official Clash of Clans API client helpers and tag handling.
- `src/coc-assets.mjs`: repeatable Clash Wiki/Fandom image lookup and aliasing.
- `src/player-card.mjs`: rendered `/player` army card image output.
- `src/legends-store.mjs`: Legend League tracking storage, polling decisions,
  and page formatting.
- `src/moderation-store.mjs`: `/elder`, `/mute`, and `/bench` durable vote and
  permanent-record storage.
- `src/lana-art.mjs`: generated heart images plus `/lana` and `/loveu` love
  copy.
- `src/slack-bridge.mjs`: Slack Socket Mode bridge and Slack `#bot` intake.
- `src/slack-codex-worker.mjs`: remote Codex worker queue, prompt construction,
  compacted memory, checks, commits, pushes, deploy wait, and final replies.
  It attaches supported local image files from Slack/Discord jobs to
  `codex exec` with `--image` and owns the final verified live/not-live channel
  wording after checks and deploy verification.

## Change Recipes

### Add Or Change A Slash Command

1. Update `src/commands.mjs`.
2. Update the matching `InteractionCreate` handling in `src/index.mjs`.
3. Add or update focused helper modules if the command has non-trivial logic.
4. Add tests for command registration shape and feature logic.
5. Run `npm run check`.
6. Let the worker commit/push; deploy registers commands automatically.
7. Verify the live command list and runtime behavior after deploy.

Registering a command without a matching runtime handler causes Discord's
"The application did not respond" error.

### Add Durable Server State

1. Store state under `/shared/...` through an explicit env-backed path.
2. Add deploy initialization/chown behavior if the file or directory must exist
   before runtime.
3. Preserve malformed JSON as a `.corrupt-*` backup before resetting.
4. Add tests for normal and malformed state.
5. Document the state file in `operating-memory.md`.

### Change Clash Of Clans UI

1. Use `src/coc.mjs` for official API data.
2. Use `src/coc-assets.mjs` for repeatable icon lookup.
3. Prefer compact embeds plus buttons/pages for Discord mobile readability.
4. Use attached rendered images for high-volume army/equipment grids.
5. Update `clash-ui-guidance.md` if a durable UI/source rule changes.

### Change Remote Codex Behavior

1. Update `src/slack-codex-worker.mjs`, `src/slack-bridge.mjs`, or
   `src/discord-codex-control.mjs` as appropriate.
2. For Discord files/screenshots, preserve file metadata and local shared-volume
   paths so the worker can inspect uploads from
   `/shared/codex-worker/context/discord-files/` and attach images to Codex.
3. For Slack files/screenshots, preserve file metadata and local shared-volume
   paths so the worker can inspect uploads from
   `/shared/codex-worker/context/slack-files/`.
4. Add tests around prompt shape, memory compaction, queue behavior, file
   context, message de-duplication, verified live wording, or message cleaning.
5. Update `remote-codex-session.md` and this file when behavior or context
   loading changes.
6. Update `local-codex-parity.md` if the standard for matching local Codex
   Desktop behavior changes.
7. Verify the worker queue, generated memory files, and live channel response.
