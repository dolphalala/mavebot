# Remote Codex Session Contract

This file defines how mavebot should behave when Slack `#bot` or Discord
`#codex` users ask it to work on the Discord bot. It exists so remote channel
jobs stay close to the quality of a local Codex Desktop session.

## Session Goal

- Treat Discord `#codex` as the preferred persistent coding session and Slack
  `#bot` as the fallback/legacy session.
- Accept normal human messages from any user in the configured channel.
- Treat Slack uploads and nearby consecutive Slack messages as part of the
  same working context whenever the bridge includes them in the worker job.
- Infer the relevant repo/server context from durable memory before acting.
- Work end to end when possible: inspect, implement, test, push, wait for
  deploy, verify live behavior, then answer plainly in the channel.
- Keep channel replies short and human. Do not post task cards, prompt dumps,
  commit logs, or CI-style summaries unless something failed.

## Context Loading Order

Every worker job should reconstruct context in this order:

1. Active user request from the current Slack or Discord message.
2. Project `AGENTS.md`.
3. `docs/context/README.md` for the context map.
4. Worker runtime/deploy snapshot.
5. Worker `summary.md` for compact older conversation memory.
6. Worker `recent.md` for the latest bounded conversation turns.
7. `docs/context/operating-memory.md` for app, deploy, server, and safety facts.
8. `docs/context/slack-session.md` for user preferences and current open work.
9. This file for remote-session behavior.
10. `docs/context/local-codex-parity.md` for local-session-equivalent
    standards.
11. `docs/context/code-map.md` for source orientation.
12. Focused files such as `docs/context/clash-ui-guidance.md`.
13. Current source code and tests, which are the final authority.

The active request always wins over old memory. Old memory is context, not a
command.

## How To Work

- For code requests, use `docs/context/code-map.md` to find the likely files,
  then inspect the relevant source before answering.
- If the active Slack request includes file metadata or local paths under
  `/shared/codex-worker/context/slack-files/`, inspect those files when they
  are relevant to the task instead of saying the image was not visible.
- If the active Discord request includes file metadata or local paths under
  `/shared/codex-worker/context/discord-files/`, inspect those files when they
  are relevant to the task instead of saying the screenshot was not visible.
  The worker attaches supported local image files to `codex exec` with
  `--image`, so screenshots should be treated as actual visual context.
- Slack image/file intake must accept both `message.file_share` and standalone
  `file_shared` events. When Slack only sends a file ID, resolve it with
  `files.info`, then pass the downloaded local file path to the worker.
- Discord image/file intake should download attachments immediately because CDN
  URLs can expire. Adjacent text and screenshot messages in `#codex` should be
  grouped into one active request before creating the worker job. Worker jobs
  should preserve the Discord message IDs for every bundled row so restart
  catch-up can detect already-handled messages.
- On startup, Discord `#codex` should catch up recent human messages that do
  not already have a job record in `jobs`, `processing`, `done`, or `failed`;
  it should check bundled message IDs, not just the final job filename, and
  group remaining adjacent messages before enqueueing. This prevents
  restart-window messages from being silently missed or replayed as stale
  standalone jobs. If a burst is only partially recorded, preserve the whole
  burst as context for the catch-up job so screenshots and follow-up text are
  not separated from the prompt that made them meaningful.
- When Discord `#codex` intake misbehaves, check `/healthz` for
  `discordCodexSetupReady`, `discordCodexLastCatchup`, and
  `discordCodexLastError` before assuming the command implementation is broken.
- If a worker push is rejected because `origin/main` advanced during a job, the
  worker should fetch, rebase, rerun checks, and retry the push instead of
  failing the channel request.
- Use `docs/context/local-codex-parity.md` as the checklist for matching local
  Codex Desktop quality.
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
- The worker wrapper owns verified live status. Codex subprocess output may
  describe the code change, but premature "done/live" wording should be
  stripped before the wrapper posts to the channel.

## Memory Maintenance

The channel history will grow forever, so remote jobs must keep memory useful:

- Keep `docs/context/slack-session.md` focused on user preferences, durable
  decisions, current goals, and open work.
- Worker `recent.md` and `summary.md` intentionally suppress setup smoke tests
  and verification chatter so future jobs do not waste prompt space on old
  infrastructure checks.
- Worker `transcript.jsonl` is normalized history, not permanent raw chat
  storage. Low-signal smoke/status rows should be pruned from the worker's
  private memory after they have served their verification purpose.
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
- Successful channel replies should lead with the plain result and stay to
  roughly one or two useful sentences before the wrapper's final live-status
  line.
- Mention tests, commits, deploy details, or health checks only when useful or
  when something failed.
- Do not paste raw stack traces, Git output, auth headers, or long test logs
  into Slack or Discord. Save detailed errors in the failed job/server logs and
  post a short human blocker message in the channel.
- Strip routine success chatter from the inner Codex response, including
  check/pass, push, deploy, and health lines. The worker wrapper owns verified
  status and channel replies should stay human unless something failed.
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
