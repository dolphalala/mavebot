# Local Codex Parity Contract

This file defines what "as capable as the local Codex Desktop session" means
for mavebot's Discord `#codex` control channel. Slack `#bot` is legacy-only.

## Standard For Every Job

Remote jobs should follow the same loop a local Codex session would use:

1. Understand the active request and decide whether it is code work,
   operational verification, explanation, or memory maintenance.
   If the user asks for a plan, demo, or how a feature will work, provide that
   answer directly instead of only acknowledging the idea.
2. Load project instructions and durable context before acting.
3. Inspect the current source files that own the behavior.
4. Make focused edits that match existing project patterns.
   For multi-part work, track the parts internally and keep executing the
   obvious next step without waiting for another user prompt.
5. Update tests and context docs when behavior, user preferences, deployment
   rules, or durable product facts change.
6. Run the relevant checks, with `npm run check` as the default full gate.
7. Push to `origin/main` through the worker when code changes are ready.
8. Wait for server deploy and verify the live runtime before saying it is live.
9. Reply in normal channel language with the result or exact remaining blocker.

If a step cannot be completed from the worker environment, say so plainly and
include the smallest external action needed. Do not pretend a change is live.

## Context Budget

Use context in layers instead of dumping the full channel history:

- Active user request is the only command for the run.
- Discord `#codex` may combine a short burst of messages and screenshots into
  one active request; treat that bundle as the current prompt.
- Discord worker jobs include compact active-turn metadata for message count,
  active users, files, likely work lanes, and multi-step/multi-agent hints.
  Use it to choose the right working shape without replacing source inspection.
- Worker prompts convert that metadata into a short active-turn guidance block
  so broad Discord asks are handled through explicit lanes instead of only the
  last sentence of the prompt.
- Burst grouping is per author. Other users' nearby messages can explain
  references and collaboration, but separate users' prompts should not be
  silently merged into one active task.
- Nearby Discord channel messages and files may be included as background
  context for references, screenshots, and collaboration. Use them to
  understand the active request, but do not execute unrelated nearby prompts or
  mark nearby rows as handled. This nearby context should come from the bounded
  durable Discord context log plus the live cache so deploys and restarts do
  not erase the short-term session tail.
- `AGENTS.md` and `docs/context/README.md` decide how to load the repo.
- Worker `summary.md` and `recent.md` provide bounded channel memory.
- Recent worker job records provide a bounded audit trail for follow-up
  questions about what actually happened in previous jobs.
  These records include stage timings when available, so latency audits should
  identify whether time was spent in Codex execution, checks, push, deploy, or
  runtime verification before changing behavior.
  They also include compact turn metadata, which helps future jobs see whether
  a prior run was multi-message, multi-user, visual, or multi-agent-shaped.
- `auth-blocked/` records are part of that audit trail and must be treated as
  handled work for catch-up duplicate detection until the server Codex login is
  refreshed and the worker requeues them.
- `operating-memory.md` owns server, deploy, command registration, and safety
  facts.
- `discord-session.md` owns user preferences, current goals, and open work.
  `slack-session.md` is only a legacy compatibility pointer.
- `remote-codex-session.md` owns remote-channel behavior.
- This file owns local-session parity expectations.
- `code-map.md` points to source ownership.
- Focused docs such as `clash-database-guidance.md` and
  `clash-ui-guidance.md` own domain rules.
- Source files and tests are the final authority.
- Local attachment paths under `/shared/codex-worker/context/discord-files/` or
  `/shared/codex-worker/context/slack-files/` are part of the active prompt when
  present and should be inspected if relevant. Supported image files are passed
  to Codex with `--image` so remote screenshot work has the same visual-input
  path as a local Codex session.
- Supported images from `nearbyFiles` may also be passed to Codex when a
  follow-up asks about a previous screenshot.
- Discord worker jobs should preserve bundled message rows and message IDs so
  the active prompt matches the channel burst and restart catch-up groups any
  still-unhandled adjacent messages instead of replaying them as separate
  stale requests.

Do not let old memory override the active user request. Treat old memory as
background context that must be verified against source.

## Memory Write Rules

After each meaningful job, decide whether a durable context update is needed:

- Update `operating-memory.md` for deployment, env, server path, command
  registration, state-store, or safety-boundary changes.
- Update `discord-session.md` for user preferences, active goals, open work,
  and cross-job decisions.
- Update `remote-codex-session.md` for Discord session behavior changes.
- Update `code-map.md` when source ownership or feature recipes change.
- Update a focused domain file for reusable product/domain guidance.

Do not add a note for every transient status, smoke test, or temporary error.
Rewrite noisy sections instead of appending duplicate bullets.

## Discord Bot Feature Standard

For Discord bot feature work, remote jobs should be able to do what this
desktop session does:

- Change slash command registration and runtime handling together.
- Add or update helper modules instead of bloating `src/index.mjs`.
- Add tests for command shape and core behavior.
- Verify commands are deployed through the GitHub-to-server path.
- Keep outputs readable on Discord mobile.
- Use official Clash API data and repeatable documented icon sources.
- Preserve durable JSON state safely, including corrupt-file backups.

## Answer Standard

The channel answer should be short and human:

- Say what changed and whether it is live.
- Only the worker wrapper should add verified live status. Codex subprocess
  output may describe the code change, but premature "done/live" wording should
  be stripped before the worker posts to the channel.
- Routine success lines from the subprocess, such as checks passed, pushed,
  deploy picked up, and health ok, should be stripped from normal channel
  replies unless they explain a blocker.
- If the user explicitly requested a plan, demo, explanation, or proposal, the
  final answer should preserve that useful structure rather than being reduced
  to one or two sentences.
- If the user says an earlier reply skipped something or did not work, the
  final answer should identify the real gap before saying what was fixed.
- Mention tests or deploy checks only when useful.
- If blocked, say exactly what blocked it and what needs to happen next.
- If the server Codex login is the blocker, say that plainly; do not leave the
  channel with only a working acknowledgement.
- Do not include prompt dumps, task cards, ChatGPT promo text, long logs, or
  irrelevant implementation detail.
