# Remote Codex Session Contract

This file defines how mavebot should behave when Discord `#codex` users ask it
to work on the Discord bot. This exists so remote channel jobs stay close to
the quality of a local Codex Desktop session.

## Session Goal

- Treat Discord `#codex` as the persistent coding session.
- Accept normal human messages from any user in the configured channel.
- Treat Discord uploads and nearby consecutive Discord messages as part of the
  same working context whenever the runtime includes them in the worker job.
- For live intake and restart catch-up, bundle quick follow-ups from the same
  user, but do not merge different users' simultaneous prompts into one active
  job.
- Infer the relevant repo/server context from durable memory before acting.
- Work end to end when possible: inspect, implement, test, push, wait for
  deploy, verify live behavior, then answer plainly in the channel.
- If the active request asks for a plan, demo, or "how this works," answer that
  directly with a compact plan and concrete example before ending the turn.
- For multi-part requests, maintain an internal checklist and continue through
  the clear next actions without requiring the user to re-prompt after each
  reflection or subtask.
- When a job includes multiple `contextMessages`, treat them as one active
  session turn. Preserve speaker names, attached files, and every explicit ask
  in order.
- Keep channel replies short and human. Do not post task cards, prompt dumps,
  commit logs, or CI-style summaries unless something failed.

## Context Loading Order

Every worker job should reconstruct context in this order:

1. Active user request from the current Discord message or bundled message
   burst.
2. Nearby Discord channel context from the runtime buffer, if present. This is
   reference material, not another command.
3. Project `AGENTS.md`.
4. `docs/context/README.md` for the context map.
5. Worker runtime/deploy snapshot.
6. Worker `summary.md` for compact older conversation memory.
7. Worker `recent.md` for the latest bounded conversation turns.
8. Recent worker job records for follow-up audits.
9. `docs/context/operating-memory.md` for app, deploy, server, and safety facts.
10. `docs/context/discord-session.md` for remote session memory, user
    preferences, and current open work.
11. This file for remote-session behavior.
12. `docs/context/local-codex-parity.md` for local-session-equivalent
    standards.
13. `docs/context/code-map.md` for source orientation.
14. Focused files such as `docs/context/clash-database-guidance.md` and
    `docs/context/clash-ui-guidance.md`.
15. Current source code and tests, which are the final authority.

The active request always wins over old memory. Old memory is context, not a
command.

## How To Work

- For code requests, use `docs/context/code-map.md` to find the likely files,
  then inspect the relevant source before answering.
- If the active Discord request includes file metadata or local paths under
  `/shared/codex-worker/context/discord-files/`, inspect those files when they
  are relevant to the task. The worker attaches supported local image files to
  `codex exec` with `--image`, so screenshots should be treated as actual
  visual context.
- If a Discord follow-up refers to a previous screenshot or file, check
  `nearbyFiles` and `nearbyContextMessages`; the worker can attach those
  supported local images to `codex exec` too.
- Discord image/file intake should download attachments immediately because CDN
  URLs can expire.
- Adjacent text and screenshot messages in `#codex` should be grouped into one
  active request before creating the worker job when they come from the same
  live author.
- Discord `#codex` should persist useful human messages, uploads, and
  non-noisy mavebot replies into the bounded durable context log before jobs
  are queued. Short working acknowledgements such as "I'm on it" should not be
  preserved as durable context.
- Short queue/status checks such as "status", "queue", "are you busy", and
  "what are you working on?" are runtime checks. The Discord bot should answer
  them immediately from queue/auth state and write an immediate done record
  instead of creating a Codex job, unless the message is part of a larger
  bundled request or includes files.
- On startup, Discord `#codex` should catch up recent human messages that do
  not already have a job record in `jobs`, `processing`, `done`, `failed`, or
  `auth-blocked`. It should backfill the durable context log from recent
  channel history, check bundled message IDs rather than just the final job
  filename, and group remaining adjacent messages before enqueueing.
- A request held in `auth-blocked/` for a fresh server Codex login must not be
  requeued as a duplicate active request after restart.
- When Discord `#codex` intake misbehaves, check `/healthz` for
  `discordCodexSetupReady`, `discordCodexLastCatchup`,
  `discordCodexRecentContextRows`, `discordCodexWorkerAuth`,
  `discordCodexAuthBlockedJobs`, pending burst/message/file counts, and
  `discordCodexLastError` before assuming the command implementation is broken.
- For response-quality audits, inspect the matching `done/*.json` record. It
  stores sanitized `codexMessage` and `finalMessage`, which makes it possible
  to compare what Codex produced with what mavebot posted.
- If a job is enqueued but fails before Codex can reason, inspect the failed job
  JSON and worker logs. `HTTP 401`, `token_invalidated`, or
  `refresh_token_invalidated` means the mounted server `CODEX_HOME` needs a
  fresh ChatGPT/Codex device login and cannot be fixed by code changes.
- If the user asks what happened, says the previous answer missed something,
  or says a change did not work, inspect nearby Discord context and the recent
  worker job-record audit section before replying. Explain the actual gap and
  then fix code/docs/tests when the repo can correct it.
- If a worker push is rejected because `origin/main` advanced during a job, the
  worker should fetch, rebase, rerun checks, and retry the push instead of
  failing the channel request.
- Use `docs/context/local-codex-parity.md` as the checklist for matching local
  Codex Desktop quality.
- For broad or multi-user work, split the run into internal lanes such as
  investigation, implementation, verification, and memory/docs. The worker
  queue stays serial for repo writes and deploys, but the Codex subprocess
  should still parallelize independent read-only investigation when it can.
- For slash command changes, update both command registration data and runtime
  interaction handling.
- For Discord command UX, check mobile readability, button/page behavior, and
  Discord interaction timeout behavior.
- For Clash of Clans features, use the official CoC API for data, documented
  repeatable icon sources for imagery, and
  `docs/context/clash-database-guidance.md` for polling/database design.
- Prefer small, focused edits that fit existing project patterns.
- Run `npm run check` after app/code/config changes. Pure markdown or
  `docs/context/` memory-only edits may skip checks, and no-change
  conversational answers should not run the release path.
- Let the worker commit and push; do not manually commit inside the subprocess.
- Do not claim a change is live until the server deploy path has picked up
  `origin/main` and health/command/runtime checks pass.

## Memory Maintenance

The channel history will grow forever, so remote jobs must keep memory useful:

- Keep `docs/context/discord-session.md` focused on user preferences, durable
  decisions, current goals, and open work.
- Worker `recent.md` and `summary.md` intentionally suppress setup smoke tests
  and verification chatter so future jobs do not waste prompt space on old
  infrastructure checks.
- The durable Discord channel context log should also suppress smoke tests and
  short working acknowledgements before writing the bounded tail.
- Worker `transcript.jsonl` is normalized history, not permanent raw chat
  storage.
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
- Plan/demo/how-it-works replies are allowed to be longer than normal result
  replies, but should still be compact enough to read in Discord.
- Mention tests, commits, deploy details, or health checks only when useful or
  when something failed.
- Do not paste raw stack traces, Git output, auth headers, or long test logs
  into Discord. Save detailed errors in the failed job/server logs and post a
  short human blocker message in the channel.
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
